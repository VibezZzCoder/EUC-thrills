/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { CHARACTERS } from '../src/data/riders.ts';
import { CHASE, CONTACT, PADDLE } from '../src/data/tuning.ts';
import { Paddle } from '../src/simulation/paddle.ts';
import { COUCH_RIDES } from '../src/app/couch.ts';
import { DUEL_LATERAL_METRES, SLOT_LATERAL_METRES } from '../src/simulation/spawnSlots.ts';

/**
 * M26 — contact, in a real browser (docs/PLANS.md §26.3, §26.6 Phase 1).
 *
 * Phase 0 built the seam and nothing called it. This is the wiring, and every
 * claim below needs a running game because every one of them is about the
 * *pair*: `simulation/contact.ts` is unit-tested where it lives and knows
 * nothing about seats, `EucController.bump` is unit-tested where it lives and
 * knows nothing about who hit it, and the only place both are true at once is
 * the fixed step with two riders in it.
 *
 * Four things are proven here and cannot be proven anywhere else:
 *
 *   1. **That a contact reaches both controllers**, once per step, from the
 *      poses that step produced.
 *   2. **That the four F4 sliders reach it.** `ContactPair.step`'s `tuning`
 *      parameter defaults to the frozen `CONTACT` group, and `LiveTuning.set`
 *      writes into its own override map without touching that group — so a
 *      caller that takes the default is silently untunable with every other
 *      test in this file still green. That is the Phase 2 ride gate's whole
 *      purpose failing quietly, so it is asserted directly.
 *   3. **That single player never resolves contact**, which is what makes the
 *      whole mechanic free for the phone contract and byte-identical for one
 *      rider.
 *   4. **That a contact is reproducible under `advance(n)`**, like everything
 *      else on the fixed step.
 *
 * The fifth is the owner's and cannot be automated: he rides into a parked
 * rider at every speed and says whether the bump reads as a bump (§26.6 Phase
 * 2's gate). Nothing here reads a frame interval (`AGENTS.md`).
 */

/** Somewhere well inside the contact radius, for the merged-pair cases. */
const MERGED_METRES = CONTACT.radiusMetres * 0.4;

/**
 * How far apart two riders are placed before they converge, metres.
 *
 * Comfortably outside `CONTACT.radiusMetres` — the pair must start *clear*, or
 * the first step is already an edge and nothing below measures an approach.
 */
const APPROACH_GAP_METRES = 2.4;

/**
 * How far the two headings are turned toward each other, radians.
 *
 * Small enough that they are riding, not turning: about seven degrees each, so
 * they close the gap above over a couple of hundred steps and meet at a shallow
 * angle. A steep angle would be a collision test; this is a graze, which is
 * what two people on one couch actually do to each other.
 */
const CONVERGE_RADIANS = 0.12;

/** One rider's state, small enough to send a few of over the wire. */
interface Rider {
  x: number;
  z: number;
  heading: number;
  speed: number;
  crashes: number;
  crashed: boolean;
  wobble: number;
}

/** What one scripted approach produced. */
interface Approach {
  /** How many separate bumps each rider was charged. */
  charges: number;
  /** The smallest centre-to-centre distance reached, metres. */
  minGap: number;
  /** The gap at the last sampled step. */
  endGap: number;
  /**
   * How fast the gap was shrinking at the step the first bump landed, m/s.
   * Positive is closing.
   */
  closingAtContact: number;
  /**
   * The same rate `SETTLE_STEPS` after that bump. **Negative is the pair coming
   * apart**, and it is the honest way to ask whether they separated: an
   * unsigned angle between two headings cannot tell converging from diverging,
   * and the first draft of this spec was fooled by exactly that — the bump
   * flipped both riders from `∓0.12` to `±0.05` and the spread it measured
   * merely got smaller.
   */
  closingAfter: number;
  /**
   * The gap itself, `settle` steps after the first charge, metres.
   *
   * **Added at M30 Phase 4, and it is the honest instrument.** `closingAfter`
   * above is a *rate* read at one sample, and on the shipped 65 mph wheel a
   * converging pair at ride speed is not thrown apart and left — the
   * separation runs every step, so the two are *held* at the radius and ride
   * along it, with the gap moving by a millimetre either way while the
   * instantaneous rate flickers sign. A rate at one phase measures the
   * harness; the gap says whether the mechanic is doing its job.
   */
  gapAfter: number;
  /** The faster rider's own speed on the step the first charge landed, m/s. */
  speedAtContact: number;
  /** Each rider's signed heading change from where it was placed, radians. */
  firstTurn: number;
  secondTurn: number;
  first: Rider;
  second: Rider;
}

/**
 * How far apart the head-on pair is placed on the proving ground, metres.
 *
 * The pad is 180 m long and flat, and a rider needs about ninety of them to
 * reach the wheel's ceiling from rest — so at 150 m the two meet near the
 * middle of it, both already flat out, with runway to spare at either end.
 */
const PROVING_RUNWAY_METRES = 150;

/** Boot free ride, freeze the loop, and seat the second rider. */
async function bootPair(page: import('@playwright/test').Page, query = ''): Promise<void> {
  await boot(page, query);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider();
  });
}

/**
 * How long after a bump the pair is asked whether it came apart, steps.
 *
 * A quarter of a second: long enough for a re-aimed rider to have actually
 * ridden somewhere, short enough that nothing else has happened to them.
 */
const SETTLE_STEPS = 30;

/**
 * How far apart the head-on *duel* pair starts, metres — the exchange fixture
 * below, not the graze one above.
 *
 * **Sixty rather than thirty since M30 Phase 4, and the reason is that a
 * strike is a timing window rather than a distance.** The pair ride at each
 * other from rest, so the runway decides the speed they meet at, and the
 * `lead` the swing is thrown on is `speed × (windup + active/2)` — a few tenths
 * of a metre either way. Thirty metres put them together at about 7 m/s each
 * on the shipped 65 mph wheel and both swings passed through empty air
 * (measured: swung on step 254, closest approach 0.04 m, neither struck);
 * sixty puts them together at about 10 m/s each and both land, which is the
 * exchange this spec is about. Nothing about the geometry moved — the lateral
 * offset is still `DUEL_RIGHT_METRES`, inside the paddle's reach and outside
 * the contact radius. The `duel` fixture above keeps its own thirty, because
 * it swings from a *held* pose rather than from a closing pass.
 */
const EXCHANGE_RUNWAY_METRES = 60;

/**
 * Stand the pair on the road facing each other's line, then ride.
 *
 * Everything happens inside one `page.evaluate` and steps one at a time, which
 * is the only way to see a contact at all: an edge is a single step, the
 * cooldown is 48 of them, and a spec that advanced in chunks would sample the
 * aftermath of an unknown number of bumps. The wire carries one summary
 * (`AGENTS.md`, master §17.2).
 *
 * **The frame is the level's own spawn, never seat 0's current pose.** The
 * first draft read the live pose, so a second call placed the pair in the frame
 * the first call had left them rotated into — which made the reproducibility
 * test fail for a reason that had nothing to do with the fixed step.
 *
 * `gap` is the placement separation, `converge` how far each rider's heading is
 * turned toward the other, `throttle` what both hold, and `facing` whether the
 * second rider faces the same way (a graze) or the opposite one (head-on).
 */
async function approach(
  page: import('@playwright/test').Page,
  options: {
    gap: number;
    converge: number;
    throttle: number;
    steps: number;
    facing: 'same' | 'opposed';
  },
): Promise<Approach> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    // The world's own start pose, which is the one frame every producer states
    // and validates. The rider's left is ninety degrees off the heading —
    // `simulation/spawnSlots.ts` states the same rotation for the same reason.
    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const leftX = Math.cos(heading);
    const leftZ = -Math.sin(heading);
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);

    // The pair is offset **along the road** for the head-on case and **across
    // it** for the graze: two riders meeting head-on are on one line, and two
    // riders grazing are on parallel ones.
    const firstAt = input.facing === 'opposed'
      ? { x: spawn.position.x, z: spawn.position.z }
      : {
        x: spawn.position.x + leftX * (input.gap / 2),
        z: spawn.position.z + leftZ * (input.gap / 2),
      };
    const secondAt = input.facing === 'opposed'
      ? {
        x: spawn.position.x + forwardX * input.gap,
        z: spawn.position.z + forwardZ * input.gap,
      }
      : {
        x: spawn.position.x - leftX * (input.gap / 2),
        z: spawn.position.z - leftZ * (input.gap / 2),
      };

    // Seat 0 turns toward its right (negative yaw) and seat 1 toward its left,
    // so a graze closes without either of them steering — the bump is then the
    // only thing in the world that can change either heading. A head-on pair
    // needs no convergence at all; they are already pointed at each other.
    const firstHeading = heading - input.converge;
    const secondHeading = input.facing === 'opposed'
      ? heading + Math.PI
      : heading + input.converge;

    const place = (seat: number, at: { x: number; z: number }, facing: number) => {
      const ground = game.sampleGround(at.x, at.z);
      game.placeRider({ x: at.x, y: ground.height, z: at.z }, facing, seat);
    };
    place(0, firstAt, firstHeading);
    place(1, secondAt, secondHeading);

    game.setActionsFor(0, { throttle: input.throttle, steer: 0 });
    game.setActionsFor(1, { throttle: input.throttle, steer: 0 });

    const read = (seat: number) => {
      const euc = game.snapshotFor(seat).euc;
      return {
        x: euc.position.x,
        z: euc.position.z,
        heading: euc.headingY,
        speed: euc.speed,
        crashes: euc.crashes,
        crashed: euc.crashed,
        wobble: euc.wobbleEnergy,
      };
    };
    const gapOf = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      Math.hypot(a.x - b.x, a.z - b.z);
    const wrap = (angle: number) => {
      const raw = (angle + Math.PI) % (Math.PI * 2);
      return (raw < 0 ? raw + Math.PI * 2 : raw) - Math.PI;
    };

    let charges = 0;
    let minGap = Infinity;
    let closingAtContact = 0;
    let closingAfter = 0;
    let gapAfter = Number.NaN;
    let speedAtContact = 0;
    let sinceCharge = -1;
    let previous = { first: read(0), second: read(1) };

    for (let step = 0; step < input.steps; step += 1) {
      game.advance(1);
      const first = read(0);
      const second = read(1);
      const gap = gapOf(first, second);
      const closing = (gapOf(previous.first, previous.second) - gap) * 120;
      minGap = Math.min(minGap, gap);

      // **A bump is a rise in wobble energy on both riders at once.** It is the
      // one effect of `softKnock` that cannot be confused with riding: a rider
      // on flat ground with no hazard under them has no other way to gain
      // wobble, and the pair gains it on the same step by construction.
      const rose = first.wobble > previous.first.wobble + 1e-9
        && second.wobble > previous.second.wobble + 1e-9;
      if (rose) {
        charges += 1;
        if (charges === 1) {
          closingAtContact = closing;
          speedAtContact = Math.max(Math.abs(first.speed), Math.abs(second.speed));
          sinceCharge = 0;
        }
      } else if (sinceCharge >= 0) {
        sinceCharge += 1;
        if (sinceCharge === input.settle) { closingAfter = closing; gapAfter = gap; }
      }
      previous = { first, second };
    }

    return {
      charges,
      minGap,
      endGap: gapOf(previous.first, previous.second),
      closingAtContact,
      closingAfter,
      gapAfter,
      speedAtContact,
      firstTurn: wrap(previous.first.heading - firstHeading),
      secondTurn: wrap(previous.second.heading - secondHeading),
      first: previous.first,
      second: previous.second,
    };
  }, { ...options, settle: SETTLE_STEPS });
}

// ---------------------------------------------------------------------------
// The gate: two seats ride into each other and separate
// ---------------------------------------------------------------------------

test('two riders who ride into each other are pushed apart, and neither goes down', async ({ page }) => {
  const errors = collectErrors(page);
  await bootPair(page);

  //
  // **The throttle came down 0.6 → 0.35 at M30 Phase 4, and the bound it has
  // to sit under is derived rather than chosen.** A pair placed converging by
  // `CONVERGE_RADIANS` each closes laterally at `2 · v · sin(converge)`, and
  // the separation can only hold them apart while that is under
  // `CONTACT.separationSpeed` — which puts the ceiling at
  // `separationSpeed / (2 sin 0.12)` = **5.0 m/s**. The same 0.6 of throttle
  // that carried 4.9 m/s on the 50 mph wheel carries 5.6 on the shipped 65,
  // straight past it, and the pair was sampled 3 cm *inside* the radius. That
  // is the residual the paragraph below has always named — a pair closing
  // faster than the push penetrates, and the answer is the owner's F4 slider,
  // not a bent assertion here — arriving at a lower throttle than before
  // because a throttle is a lean and the same lean now carries further. So the
  // fixture rides under its own derived ceiling, and asserts that it did.
  const met = await approach(page, {
    gap: APPROACH_GAP_METRES,
    converge: CONVERGE_RADIANS,
    throttle: 0.35,
    steps: 420,
    facing: 'same',
  });

  const holdable = CONTACT.separationSpeed / (2 * Math.sin(CONVERGE_RADIANS));
  expect(
    met.speedAtContact,
    `the pair met at ${met.speedAtContact.toFixed(2)} m/s, closing laterally faster than `
      + `${CONTACT.separationSpeed} m/s of push can answer — anything above `
      + `${holdable.toFixed(2)} m/s penetrates, and this fixture is the graze, not the crash`,
  ).toBeLessThan(holdable);

  // **They really met, and the charge is what says so rather than the gap.**
  // The separation resolves inside the step that detects the overlap, so a
  // sampler that reads between steps never catches the pair inside the radius
  // at all — which is the fix working, not the approach failing.
  expect(met.charges).toBeGreaterThan(0);

  // **And they came apart again.** Neither rider steered and the ground is
  // flat, so the bump is the only thing in the world that can change either
  // line — which is what makes this a measurement of the mechanic rather than
  // of the input. They rode a long way toward each other and were opening a
  // quarter of a second after they met.
  //
  // `closingAtContact` is deliberately **not** asserted positive any more, and
  // the reason is the fix rather than the spec: the separation runs on the same
  // step as the charge and comes apart at `separationSpeed` each, which is far
  // faster than two riders converging at a seventh of a radian. So the pair is
  // already opening on the step the bump lands, and an instrument that reads
  // "closing" there is measuring the push rather than the approach. The
  // approach is measured where it happens — over the gap itself.
  //
  // **And so is the aftermath, since M30 Phase 4.** `closingAfter` was a rate
  // at one sample, and on the shipped 65 mph wheel the same script reads
  // +0.33 m/s at that sample while the *gap* over the same quarter second
  // moves by **one millimetre outward**. Neither rider is going anywhere: the
  // separation runs every step, so a pair that keeps converging is *held* at
  // the radius and rides along it, and the instantaneous rate flickers sign
  // with the standoff's own jitter. A quarter of a second after the bump they
  // are still at least at the radius, which is the mechanic working — being
  // thrown apart and left was never the claim, and at 0.35 throttle the same
  // script reads the rate negative and the gap two millimetres *in*.
  expect(APPROACH_GAP_METRES - met.minGap).toBeGreaterThan(1);
  expect(met.gapAfter).toBeGreaterThan(CONTACT.radiusMetres - 0.01);
  expect(met.gapAfter).toBeGreaterThanOrEqual(met.minGap);

  // **They never got inside each other** — the owner's ride, 2026-08-27:
  // *"from certain angles you can clip and/or go through the other player."*
  // The separation is positional and runs every step now, so at a speed the
  // pair can be held apart at they are never sampled inside the radius at all.
  // Before the fix this identical script reached a gap of **0** and the host
  // came out the far side, because a shove folded into a heading cannot move
  // anybody sideways.
  //
  // **The residual is speed, and it is not tuned here.** A pair closing faster
  // than `separationSpeed` still penetrates — a head-on meeting at ride speed
  // (the spec below) still passes clean through, because 1.2 m/s of push
  // cannot answer 18 m/s of closing. That is the owner's call at the gate:
  // `CONTACT.separationSpeed` is an F4 slider, and §26.3's own answer to a fast
  // meeting is that it should not be a bump at all.
  expect(met.minGap).toBeGreaterThan(CONTACT.radiusMetres - 0.01);

  // **And neither of them was re-aimed to do it** — the owner's couch ride,
  // 2026-08-27. The first build folded the push into `headingY`, because the
  // controller stores signed speed plus a heading and has nowhere to put a
  // lateral velocity; the error scaled *inversely* with speed, so a slow or
  // parked rider was spun to face away from whoever touched them — measured at
  // 180° in one step — and the camera whipped round with them.
  //
  // A shove is now a change of place, so what a rider keeps through a contact
  // is their aim. Both riders were placed converging and neither steered, so
  // any heading change at all is the bump doing something it must not: the
  // bound is a tenth of the convergence they were placed with, which is far
  // tighter than the ±0.05 rad the old build produced and far looser than the
  // exact zero that would make this a test of floating point.
  expect(Math.abs(met.firstTurn)).toBeLessThan(CONVERGE_RADIANS / 10);
  expect(Math.abs(met.secondTurn)).toBeLessThan(CONVERGE_RADIANS / 10);

  // Never a crash. §26.3's ceiling: a bump is a bush, and a bush has never put
  // anybody down.
  expect(met.first.crashes).toBe(0);
  expect(met.second.crashes).toBe(0);
  expect(errors).toEqual([]);
});

test('a head-on contact at the speed the ride can really reach puts nobody down', async ({ page }) => {
  const errors = collectErrors(page);
  // **The proving ground, because this needs a runway.** Two riders have to
  // accelerate to the wheel's own ceiling before they meet, which is about
  // ninety metres each from a standing start, and the pad is 180 m of flat
  // pavement with nothing on it. The hand-authored slice would have them
  // meeting in a corner, and a crash into scenery would fail this test while
  // saying nothing about contact.
  await bootPair(page, 'level=proving');

  const met = await approach(page, {
    gap: PROVING_RUNWAY_METRES,
    converge: 0,
    throttle: 1,
    steps: 1100,
    facing: 'opposed',
  });

  expect(met.charges).toBeGreaterThan(0);
  // The assertion above is only worth anything if they met *fast*. There is no
  // top-speed constant to derive this from — the ceiling is emergent, drag
  // against lean-to-accel, and lands near 22.3 m/s (50 mph) on pavement — so
  // this is stated as a number a *single* rider cannot reach. Anything past
  // 30 m/s of closure is two riders doing it to each other.
  expect(met.closingAtContact).toBeGreaterThan(30);
  expect(met.first.crashes).toBe(0);
  expect(met.second.crashes).toBe(0);
  expect(met.first.crashed).toBe(false);
  expect(met.second.crashed).toBe(false);
  expect(errors).toEqual([]);
});

test('and the gentlest one puts nobody down either, which it did not until 2026-08-27', async ({ page }) => {
  /*
   * **The sibling above tested the fastest contact the game can produce and
   * the one below tested a parked pair; the defect lived between them.**
   *
   * A *slow* head-on nudge is the one closure that keeps a pair chattering
   * across the boundary: the separation deliberately overshoots so a contact
   * can end, and two riders still easing forward walk straight back in. Every
   * one of those re-entries was charged, because `ContactPair.step` erased the
   * cooldown the moment the pair came apart — so the constant whose stated job
   * is to stop "the edge re-arming inside the same collision" (§26.3) was
   * erased by every collision. Measured headlessly at `cooldownSeconds` of
   * 0 s, 0.40 s and 999 s: four charges in 0.067 s, identically.
   *
   * Through two real controllers that was **four charges of 0.35 into a 1.0
   * crash threshold**, so the gentlest contact in the game was the only one
   * that put you on the ground, while a 17 m/s ram was one charge and put
   * nobody down. The owner rode into it and reported it as the rider flying
   * out "even at very slow speed … as if they were colliding at very high
   * speed"; the Codex QA pass found the cause. It is q72 outright — contact
   * never crashes anybody — arriving by the one closing speed nothing asked
   * about.
   */
  const errors = collectErrors(page);
  await bootPair(page, 'level=proving');

  // **This fixture is chosen, and what it was chosen for is that it used to
  // crash them.** With the erasing line put back, these two ride into each
  // other at 2.2 m/s, take four charges, and *both* go down — one of twelve
  // such combinations in a 25-point sweep of slow approaches, every one of
  // them under 4.5 m/s of closure. A spec for a defect that only counts
  // charges is measuring the mechanism; this one measures what the owner saw.
  const nudged = await approach(page, {
    gap: 10,
    converge: 0,
    throttle: 0.12,
    steps: 900,
    facing: 'opposed',
  });

  // The premise: they really did meet, and really did meet *slowly*. Without
  // both halves this passes on a pair that never touched. The ceiling is well
  // under the >30 m/s the fast sibling requires, which is what makes these two
  // specs different tests rather than one written twice.
  expect(nudged.charges).toBeGreaterThan(0);
  expect(nudged.closingAtContact).toBeLessThan(5);

  // The claim first, so a regression reports the thing the owner reported
  // rather than the arithmetic underneath it.
  expect(nudged.first.crashes).toBe(0);
  expect(nudged.second.crashes).toBe(0);
  expect(nudged.first.crashed).toBe(false);
  expect(nudged.second.crashed).toBe(false);
  // Then the mechanism, which is the sharper detector: one meeting is one
  // contact, and a second charge inside a cooldown is the defect returning
  // whether or not that particular pair happened to fall over.
  expect(nudged.charges).toBe(1);
  expect(errors).toEqual([]);
});

test('the cooldown slider is the fourth one, and it was the one nothing moved', async ({ page }) => {
  /*
   * **A tunable is only testable by moving it.** The spec at the bottom of
   * this file exists to prove all four F4 contact sliders reach the ride, and
   * it moves `speedCost`, `separationSpeed` and `radiusMetres`. The fourth,
   * `cooldownSeconds`, it never touched — and the fourth was the one that had
   * been inert since Phase 1. Every other spec in this file described a
   * *pair*, at the default value, so none of them could see it: measured at
   * 0 s, 0.40 s and 999 s, an oscillating pair took four charges in 0.067 s in
   * all three.
   *
   * That is the transferable half. A constant nothing varies is a constant
   * nothing checks, however many assertions are standing next to it.
   */
  const errors = collectErrors(page);
  await bootPair(page, 'level=proving');

  //
  // **The throttle came down 0.12 → 0.09 at M30 Phase 4**, and it is the
  // fixture's premise rather than its taste. This test needs a pair that
  // *oscillates* against the separation — that is the only state in which a
  // cooldown of zero can charge more often than the shipped one. A throttle is
  // a lean, and the same lean on the shipped 65 mph wheel carries a rider
  // faster: at 0.12 the pair now closes at 2.3 m/s, overpowers the 1.2 m/s
  // push, merges to a 0.21 m gap and is charged exactly once whatever the
  // cooldown says — so the slider became untestable again for the opposite
  // reason it was untestable before. At 0.09 they meet at 1.8 m/s, are held at
  // the 0.80 m radius, and the shipped cooldown charges once against three
  // with it switched off, which is the distinguishable pair the lesson asks
  // for.
  const script = {
    gap: 10,
    converge: 0,
    throttle: 0.09,
    steps: 900,
    facing: 'opposed' as const,
  };

  const stock = await approach(page, script);
  expect(stock.charges).toBe(1);

  // No cooldown at all is the one setting that must visibly differ, because it
  // is the setting the shipped one was indistinguishable from.
  await page.evaluate(() => window.game.tuning.set('CONTACT.cooldownSeconds', 0));
  const ungated = await approach(page, script);
  expect(ungated.charges).toBeGreaterThan(stock.charges);

  await page.evaluate(() => window.game.tuning.reset());
  expect(errors).toEqual([]);
});

test('a stationary merged pair is charged once per cooldown, not once per step', async ({ page }) => {
  const errors = collectErrors(page);
  await bootPair(page);

  // Standing still, well inside the radius, for two and a half seconds. Without
  // the edge and the cooldown this is 300 bumps — the cheap version §25.6
  // retracted, which punishes a merged pair continuously.
  const steps = 300;
  const parked = await page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const home = game.snapshotFor(0).euc;
    const heading = home.headingY;
    const at = {
      x: home.position.x + Math.cos(heading) * input.merged,
      z: home.position.z - Math.sin(heading) * input.merged,
    };
    const ground = game.sampleGround(at.x, at.z);
    game.placeRider({ x: at.x, y: ground.height, z: at.z }, heading, 1);
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.setActionsFor(1, { throttle: 0, steer: 0 });

    let charges = 0;
    let previous = game.snapshotFor(0).euc.wobbleEnergy;
    let gapBefore = 0;
    for (let step = 0; step < input.steps; step += 1) {
      game.advance(1);
      const now = game.snapshotFor(0).euc.wobbleEnergy;
      if (now > previous + 1e-9) charges += 1;
      previous = now;
      if (step === 0) {
        const a = game.snapshotFor(0).euc.position;
        const b = game.snapshotFor(1).euc.position;
        gapBefore = Math.hypot(a.x - b.x, a.z - b.z);
      }
    }
    const endA = game.snapshotFor(0).euc.position;
    const endB = game.snapshotFor(1).euc.position;
    return {
      charges,
      gapBefore,
      gapAfter: Math.hypot(endA.x - endB.x, endA.z - endB.z),
      crashes: game.snapshotFor(0).euc.crashes + game.snapshotFor(1).euc.crashes,
    };
  }, { merged: MERGED_METRES, steps });

  // They really were merged for the whole run, or "not once per step" is a
  // claim about a pair that was never touching.
  expect(parked.gapBefore).toBeLessThan(CONTACT.radiusMetres);

  // **Charged exactly once, and that is stronger than the cooldown.** This spec
  // used to expect `1 + floor(seconds / cooldown)` — one on entry and one every
  // cooldown for as long as the pair stayed merged, which is what §26.3's
  // cooldown *bounds*. It is not what it should *produce*: two players parked
  // beside each other were wobbled every 0.40 s for as long as they stood
  // there, and the only reason the owner did not report it is that the old
  // build spun them apart before they could notice.
  //
  // Since his ride the separation is positional and runs every step, so a
  // merged pair is eased out to clear of the radius and the contact genuinely
  // ends. The cooldown still bounds a pair that is *held* together — two riders
  // leaning into each other — which is the case it was written for.
  expect(parked.charges).toBe(1);
  expect(parked.crashes).toBe(0);

  // And they were pushed apart to clear of the radius rather than left sitting
  // inside it, which is the mechanism behind the number above.
  expect(parked.gapAfter).toBeGreaterThan(CONTACT.radiusMetres);
  expect(errors).toEqual([]);
});

test('two riders standing in exactly the same place are pushed apart, not to NaN', async ({ page }) => {
  /*
   * **A reachable state, not a contrivance.** `spawnSlot`'s fallback of last
   * resort is the plan's own spawn — a world that offers no valid slot seats
   * both riders on one point rather than refusing to seat the second — and
   * `SLOT_MIN_SEPARATION_METRES`'s own note says so. Two bodies at exactly one
   * point have no centre-to-centre line, and the naive normalisation is a
   * division by zero that reaches a rider as a NaN position and stays there.
   *
   * Phase 0 gave the primitive a three-step fallback (centre line, then
   * relative travel, then a fixed axis) and unit-tested it. This is the claim
   * the unit test cannot make: that the fallback reaches the *ride* intact.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const merged = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    // Exactly coincident, exactly aligned. Identical riders under identical
    // input stay exactly coincident, so the centre-to-centre distance is a
    // true zero on every step rather than a small number — and their relative
    // velocity is zero too, which is the deepest branch of the fallback.
    const spawn = game.levelPlan.spawn;
    const ground = game.sampleGround(spawn.position.x, spawn.position.z);
    const at = { x: spawn.position.x, y: ground.height, z: spawn.position.z };
    game.placeRider(at, spawn.headingY, 0);
    game.placeRider(at, spawn.headingY, 1);
    game.setActionsFor(0, { throttle: 0.6, steer: 0 });
    game.setActionsFor(1, { throttle: 0.6, steer: 0 });

    const startGap = 0;
    game.advance(360);
    const first = game.snapshotFor(0).euc;
    const second = game.snapshotFor(1).euc;
    return {
      startGap,
      gap: Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z),
      finite: [
        first.position.x, first.position.z, first.headingY, first.speed,
        second.position.x, second.position.z, second.headingY, second.speed,
      ].every((value) => Number.isFinite(value)),
      crashes: first.crashes + second.crashes,
    };
  });

  // Nothing became NaN, which is the whole point: a NaN position is permanent
  // and silent, and every assertion in this file would keep passing around it.
  expect(merged.finite).toBe(true);
  // And the deterministic axis is a real one — they left the point.
  expect(merged.gap).toBeGreaterThan(0);
  expect(merged.crashes).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The gate: one expression decides whether contact is on
// ---------------------------------------------------------------------------

test('single player reports the setting and never resolves a pair', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // One seat: the setting is still on — it is the room's answer and there is no
  // room — and `contactLive`, the expression the step actually reads, is false.
  // This is the clause that keeps single player byte-identical.
  const alone = await page.evaluate(() => ({
    seats: window.game.seatCount,
    contact: window.game.snapshot().contact,
    live: window.game.contactLive,
  }));
  expect(alone.seats).toBe(1);
  expect(alone.contact.enabled).toBe(true);
  expect(alone.contact.live).toBe(false);
  expect(alone.live).toBe(false);

  // And a second rider turns it on without anybody asking, because contact is
  // a property of the session rather than a mode.
  const seated = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider();
    return window.game.snapshot().contact;
  });
  expect(seated.live).toBe(true);

  // Sending them home turns it off again by the same expression.
  const alone_again = await page.evaluate(() => {
    window.game.despawnSecondRider();
    return window.game.snapshot().contact;
  });
  expect(alone_again.live).toBe(false);
  expect(errors).toEqual([]);
});

test('contact switched off for the session lets the pair ride through each other', async ({ page }) => {
  const errors = collectErrors(page);
  await bootPair(page);

  const off = await page.evaluate(() => {
    window.game.setContactEnabled(false);
    return window.game.snapshot().contact;
  });
  expect(off.enabled).toBe(false);
  expect(off.live).toBe(false);

  const met = await approach(page, {
    gap: APPROACH_GAP_METRES,
    converge: CONVERGE_RADIANS,
    throttle: 0.6,
    steps: 420,
    facing: 'same',
  });

  // They still met — the same script that produced a bump above.
  expect(met.minGap).toBeLessThanOrEqual(CONTACT.radiusMetres);
  // And nothing happened. Ghosting through each other is exactly what the
  // setting is for, and what the couch asked to be able to turn off.
  expect(met.charges).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Lifecycle: a pair that is not being resolved has no history
// ---------------------------------------------------------------------------

test('a guest respawning on top of the host is not a collision', async ({ page }) => {
  /*
   * **The M25 species, one milestone later** (`AGENTS.md`: *a per-seat contract
   * is a list to enumerate, not a pattern to spot twice*). `Game.step` aborts
   * the whole tick on a reset, but only for seat 0 — a later seat's reset is
   * deliberately allowed to continue, so that a guest pressing `R` cannot stall
   * the player's cop, referees and camera. Contact was placed below that return
   * and its comment claimed the general rule: *a teleport must read as nothing
   * rather than as a ram*. It held for the player and not for the guest.
   *
   * A respawn is not a ride into somebody. It is the one motion in this game
   * that covers any distance in one step, so it is also the only one that can
   * put two riders inside each other with no closing speed at all.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const respawn = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.setActionsFor(1, { throttle: 0, steer: 0 });

    // Where seat 1's own `R` puts it — asked rather than derived, so this does
    // not quietly restate `spawnSlot`'s arithmetic and agree with itself.
    const reset = () => {
      game.setActionsFor(1, { reset: true });
      game.advance(1);
      game.setActionsFor(1, { reset: false });
    };
    reset();
    const slot = game.snapshotFor(1).euc.position;

    // Stand the host exactly there, and send the guest somewhere else.
    const heading = game.levelPlan.spawn.headingY;
    game.placeRider({ x: slot.x, y: slot.y, z: slot.z }, heading, 0);
    const away = {
      x: slot.x + Math.sin(heading) * 30,
      z: slot.z + Math.cos(heading) * 30,
    };
    const ground = game.sampleGround(away.x, away.z);
    game.placeRider({ x: away.x, y: ground.height, z: away.z }, heading, 1);
    game.advance(1);

    const before = [
      game.snapshotFor(0).euc.wobbleEnergy,
      game.snapshotFor(1).euc.wobbleEnergy,
    ];
    // And now the guest respawns straight onto the host.
    reset();
    const after = [
      game.snapshotFor(0).euc.wobbleEnergy,
      game.snapshotFor(1).euc.wobbleEnergy,
    ];
    const first = game.snapshotFor(0).euc.position;
    const second = game.snapshotFor(1).euc.position;

    return {
      delta: [after[0] - before[0], after[1] - before[1]],
      gap: Math.hypot(first.x - second.x, first.z - second.z),
    };
  });

  // The teleport really did land them inside each other, or this proves nothing.
  expect(respawn.gap).toBeLessThan(CONTACT.radiusMetres);
  // And neither rider was charged for it.
  expect(respawn.delta[0]).toBeLessThanOrEqual(0);
  expect(respawn.delta[1]).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('a pair that stops being resolved forgets its edge', async ({ page }) => {
  /*
   * `ContactPair` is a **stateful** edge detector, and it runs its cooldown
   * down on every step it is given — merged or apart — so a pair that is
   * genuinely finished with each other is clear within `cooldownSeconds`. That
   * rule is only true while somebody is calling it: a pair whose session
   * turned contact off, or whose second seat went home, keeps whatever
   * cooldown it was holding and silently swallows the first bump of the next
   * one. Both halves are checked here — the setting, which Phase 2 wires to a
   * toggle, and the guest, which the bridge can already do today.
   *
   * **This got sharper on 2026-08-27, not weaker.** While separation erased
   * the timer, a stale cooldown could only survive a gap in the calls; now it
   * survives an ordinary parting too, which is the whole point of the fix and
   * makes `clear()` the only thing standing between one session's collision
   * and the next session's first bump.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const revived = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.setActionsFor(1, { throttle: 0, steer: 0 });

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const leftX = Math.cos(heading);
    const leftZ = -Math.sin(heading);
    const stand = (seat: number, out: number) => {
      const x = spawn.position.x + leftX * out;
      const z = spawn.position.z + leftZ * out;
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, heading, seat);
    };
    // One step with the pair merged, and one bump each. Whatever happens next,
    // the cooldown is now armed.
    const charge = () => {
      stand(0, 0);
      stand(1, 0.3);
      const before = game.snapshotFor(0).euc.wobbleEnergy;
      game.advance(1);
      return game.snapshotFor(0).euc.wobbleEnergy - before;
    };
    const armed = charge();

    // -- The setting ------------------------------------------------------
    game.setContactEnabled(false);
    // They separate while nobody is watching, which is the whole point: the
    // pair never sees the step that would have cleared it.
    stand(0, 0);
    stand(1, 6);
    game.advance(10);
    game.setContactEnabled(true);
    const afterSetting = charge();

    // -- The guest --------------------------------------------------------
    game.despawnSecondRider();
    game.advance(10);
    game.spawnSecondRider();
    game.clearActions();
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.setActionsFor(1, { throttle: 0, steer: 0 });
    const afterGuest = charge();

    // -- The host's own respawn -------------------------------------------
    // **The one interruption that never reaches the pair by itself.** Seat 0's
    // reset aborts the whole tick, so the contact call has to sit *above* that
    // return to hear about it at all — and with the call below it, this is the
    // only one of the three that stays broken. Kept tight on purpose: three
    // steps pass between the arming merge and the re-entry, far inside one
    // cooldown, so a pair that failed to forget cannot have decayed instead.
    charge();
    game.setActionsFor(0, { reset: true });
    game.advance(1);
    game.setActionsFor(0, { reset: false });
    const afterHost = charge();

    return { armed, afterSetting, afterGuest, afterHost };
  });

  // The first merge charged, so the cooldown was genuinely armed before each
  // of the two interruptions below.
  expect(revived.armed).toBeGreaterThan(0);
  // A session that turned contact off and back on meets a fresh pair.
  expect(revived.afterSetting).toBeCloseTo(revived.armed, 9);
  // And so does a session that sent one guest home and seated another: a new
  // rider must not inherit the last rider's cooldown.
  expect(revived.afterGuest).toBeCloseTo(revived.armed, 9);
  // And so does the host's own respawn, which is the interruption that reaches
  // the pair only because the call sits above the tick-aborting return.
  expect(revived.afterHost).toBeCloseTo(revived.armed, 9);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The gate: F4 reaches the bump
// ---------------------------------------------------------------------------

test('the live tuning store moves a bump, so the ride gate can tune it', async ({ page }) => {
  /*
   * **The one failure this phase was warned about** (§26.6, Phase 0's record).
   * `ContactPair.step(dt, a, b)` compiles, passes every other test in this
   * file, and reads the four constants frozen at boot — because
   * `LiveTuning.set` writes into a private override map and never touches the
   * exported `CONTACT` group. The symptom is not a wrong number; it is four
   * F4 sliders that do nothing, discovered by the owner at the Phase 2 ride
   * gate, whose entire purpose is tuning this feel.
   *
   * So the assertion is the plainest one available: move a value through the
   * live store, run the identical scripted contact, and require the result to
   * change.
   *
   * **Three of the four are here; the fourth is upstairs and that gap is why
   * this file missed a defect for a milestone.** `cooldownSeconds` needs a
   * pair that chatters to say anything at all, which this graze script does
   * not produce, so it is proved on the proving ground in "the cooldown slider
   * is the fourth one". Splitting it out is deliberate — a spec named for
   * four sliders that exercises three reads as coverage it does not have.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const script = {
    gap: APPROACH_GAP_METRES,
    converge: CONVERGE_RADIANS,
    throttle: 0.6,
    steps: 420,
    facing: 'same' as const,
  };

  const stock = await approach(page, script);
  expect(stock.charges).toBeGreaterThan(0);

  // **Measured on the speed cost, and the instrument had to change with the
  // fix.** The first version of this spec read the *heading* — a harder push
  // was a bigger turn — and the second read the end gap. Neither survives: a
  // bump no longer turns anybody at all, and the separation is bounded by the
  // overlap, so five times the rate clears the boundary sooner rather than
  // flinging the pair further. The speed shed has no such ceiling, it is the
  // half of the feel the owner is actually judging at the gate ("does it feel
  // like a punishment?"), and it travels the identical path through
  // `LiveTuning` — which is what this spec exists to prove.
  await page.evaluate(() => {
    window.game.tuning.set('CONTACT.speedCost', 8);
  });
  const heavy = await approach(page, script);
  expect(heavy.charges).toBeGreaterThan(0);
  const stockSpeed = Math.abs(stock.first.speed) + Math.abs(stock.second.speed);
  const heavySpeed = Math.abs(heavy.first.speed) + Math.abs(heavy.second.speed);
  expect(heavySpeed).toBeLessThan(stockSpeed - 0.5);

  // Still nobody re-aimed, at five times the shove. The one number this file
  // most needs to stay at zero is the one a tuning slider could most easily
  // put back.
  await page.evaluate(() => {
    window.game.tuning.reset();
    window.game.tuning.set('CONTACT.separationSpeed', 5);
  });
  const shoved = await approach(page, script);
  expect(shoved.charges).toBeGreaterThan(0);
  expect(Math.abs(shoved.firstTurn)).toBeLessThan(CONVERGE_RADIANS / 10);
  expect(Math.abs(shoved.secondTurn)).toBeLessThan(CONVERGE_RADIANS / 10);

  // The radius is the second half of the same claim, and it is the one that
  // decides *when* rather than *how much*: a wider radius meets sooner.
  await page.evaluate(() => {
    window.game.tuning.reset();
    window.game.tuning.set('CONTACT.radiusMetres', 1.5);
  });
  const early = await approach(page, script);
  expect(early.charges).toBeGreaterThan(0);
  expect(early.minGap).toBeGreaterThan(stock.minGap);

  await page.evaluate(() => window.game.tuning.reset());
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The gate: a contact is reproducible
// ---------------------------------------------------------------------------

test('the same contact reaches the same two riders every run', async ({ page }) => {
  // `advance(n)` is the basis of every assertion above, and a contact is the
  // first thing in this game that couples two seats inside one step. Twice
  // through the same script, from the same boot, must land on identical
  // numbers — not merely close ones.
  const errors = collectErrors(page);
  await bootPair(page);

  const script = {
    gap: APPROACH_GAP_METRES,
    converge: CONVERGE_RADIANS,
    throttle: 0.6,
    steps: 420,
    facing: 'same' as const,
  };

  const first = await approach(page, script);
  const second = await approach(page, script);

  expect(first.charges).toBeGreaterThan(0);
  expect(second).toEqual(first);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 2 — the setting (§26.6 Phase 2; q71 on by default, q81 always resets)
// ---------------------------------------------------------------------------

/**
 * One connected standard pad, installed before the game boots.
 *
 * Two devices is the couch hardware the owner actually has and the one q69
 * settled the pause menu against — a gamepad and this keyboard — so it is what
 * the panel is driven with here.
 */
async function onePad(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const pads = [{
      index: 0,
      id: 'fake standard pad 0',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    }];
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  });
}

type FakePads = { index: number; buttons: { pressed: boolean; value: number }[] }[];

/** Press and release one button on the pad, a real frame apart. */
async function pulsePad(
  page: import('@playwright/test').Page,
  button: number,
): Promise<void> {
  await page.evaluate(async (at) => {
    const pad = (window as unknown as { fakePads: FakePads }).fakePads[0];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[at].pressed = true;
    pad.buttons[at].value = 1;
    await frame();
    pad.buttons[at].pressed = false;
    pad.buttons[at].value = 0;
    await frame();
  }, button);
}

/** Standard-mapping button indices this section names. */
const PAD_A = 0;
const PAD_DPAD_DOWN = 13;
const PAD_DPAD_RIGHT = 15;

/**
 * The join panel's mode choice — M26 Phase 5 (q78), a segmented pair of buttons
 * since the owner's 2026-08-27 ride.
 *
 * `CONTACT_BOX` used to sit here. The toggle it named is gone, and what it used
 * to prove is now proved by its absence — see the contact tests below.
 */
const MODE_BUTTON = '.euc-menu--couch [data-menu="couch-mode"]';

/**
 * Open the join panel the way a player does, then let the priming frame go by.
 *
 * The two frames are `openClaims`' rule in `m25.spec.ts`, and not a workaround:
 * `beginClaiming` makes every pad's current buttons stale so that a button
 * already down when the panel appeared claims nothing, and a spec can press A
 * inside the sixteen milliseconds that are indistinguishable from pressing it
 * *before* the panel opened.
 */
async function openJoinPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
}

/** Boot to a title that is offering a couch, then open the panel. */
async function bootToJoinPanel(
  page: import('@playwright/test').Page,
  query = '',
): Promise<void> {
  await bootToTitle(page, query);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await openJoinPanel(page);
}

/** Sit both devices down: the pad on seat 0, the keyboard on seat 1. */
async function seatBoth(page: import('@playwright/test').Page): Promise<void> {
  await pulsePad(page, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  // Enter, which the panel is deliberately suppressing as a *button* press
  // while the keyboard holds no seat — so this is a claim and not a press of
  // whatever had focus (M25 Phase 5).
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);
}

test('contact is on for every couch ride, and the panel no longer offers to turn it off', async ({ page }) => {
  /*
   * **The toggle is gone** — the owner's 2026-08-27 couch ride: *"i think now
   * that the toggle for the bump is completely unnecessary. remove it and keep
   * it always on by default (amend whatever in the plans)."* q81's reset is
   * what now *guarantees* the answer rather than merely defaulting it, and
   * §26.3 is amended to say so.
   *
   * Asserted as an absence and a consequence, not one or the other: a panel
   * that had merely hidden the control would pass the first half, and a game
   * that had left contact off would pass the second.
   */
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);

  expect(
    await page.locator('.euc-menu--couch [data-couch-contact]').count(),
    'the join panel still carries a contact control',
  ).toBe(0);
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(true);

  // And the ride the panel hands over is riding with it on. Both seats sit
  // down and Start is pressed, which is the whole journey between the panel and
  // the fixed step — `resetSeats`, a state transition and a redraw all happen
  // in between.
  await seatBoth(page);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const riding = await page.evaluate(() => ({
    ...window.game.snapshot().contact,
    seats: window.game.seatCount,
  }));
  expect(riding.seats, 'two seats are riding').toBe(2);
  // **`live` is the one the fixed step reads**, and asserting the flag alone
  // would not prove the step had been told.
  expect(riding.live, 'the step is not resolving a pair').toBe(true);

  expect(errors).toEqual([]);
});

test('contact comes back on every time the join panel opens', async ({ page }) => {
  /*
   * **q81, and it is a decision rather than a consequence.** The owner asked
   * for this about the player: *"contact should reset to on in case players
   * forget it exists… so they're not left wondering later why no contact."* A
   * couch is a place where the person who turned something off is usually not
   * the person who came back, so a setting that persisted off would silently
   * remove a feature from a room that had forgotten it existed.
   *
   * **Still asserted after the toggle was retired**, and it matters more rather
   * than less: with no control on the panel, this reset is the only thing that
   * makes "contact is always on" true instead of merely usually true.
   * `setContactEnabled` is the door it is driven through — the QA bridge's, and
   * since 2026-08-27 the only one — which is also what keeps `contactLive`'s
   * two clauses separable at all.
   *
   * **Do not "fix" this spec by making the setting stick.** §26.3 and §26.10
   * both close the question, and this is the line they are talking about.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  await page.evaluate(() => window.game.setContactEnabled(false));
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

  // Out through the panel's own Back, which is where a room that changed its
  // mind actually goes.
  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');

  // **Still off while nobody is on the couch**, and that is the observable
  // difference between the two places this reset could have lived. It resets
  // when a session *starts*, not when one ends — the same moment, and the same
  // argument, as the guest being re-derived on the line beside it.
  expect(
    await page.evaluate(() => window.game.snapshot().contact.enabled),
    'the reset is on the way in, not on the way out',
  ).toBe(false);

  await openJoinPanel(page);
  expect(
    await page.evaluate(() => window.game.snapshot().contact.enabled),
    'the setting the next room gets',
  ).toBe(true);

  expect(errors).toEqual([]);
});

test('the couch’s contact setting never reaches the saved options record', async ({ page }) => {
  /*
   * **Invariant 5, at the one screen that could break it.** A contact on/off
   * setting is a *physical* quantity, and "no option is a physical quantity, so
   * the ride is identical for every player" is the rule that keeps
   * `GameOptions` out of `simulation/`. The resolution §26.3 chose is the one
   * `Game.paddleEquipped` already uses — the session decides — so moving it must
   * leave the player's saved record exactly as it found it.
   *
   * Driven through `setContactEnabled` since the control was retired. The
   * question is about the *state*, not about the control that used to write it,
   * and the state is still there.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  // A real option is changed first, so the store has actually written to
  // storage. Without this the storage half of the assertion below passes on an
  // empty bucket and proves nothing.
  await page.evaluate(() => window.game.setOptions({ muted: true }));
  await page.waitForFunction(() => window.game.snapshot().options.muted === true);

  const before = await page.evaluate(() => ({
    options: JSON.stringify(window.game.snapshot().options),
    stored: JSON.stringify({ ...localStorage }),
  }));
  expect(before.stored.length, 'the options store has written something').toBeGreaterThan(2);

  await page.evaluate(() => window.game.setContactEnabled(false));
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

  const after = await page.evaluate(() => ({
    options: JSON.stringify(window.game.snapshot().options),
    stored: JSON.stringify({ ...localStorage }),
  }));

  // **Byte-identical, rather than "no key called contact".** A field named
  // anything at all would be a breach, and a name check could only catch the
  // one spelling somebody thought of.
  expect(after.options, 'the options record moved').toBe(before.options);
  expect(after.stored, 'something was saved').toBe(before.stored);

  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

test('a pad walks the join panel, and presses the mode it wants', async ({ page }) => {
  /*
   * **A layout change is an input change on a gamepad** — DESIGN.md §9g.
   * `ui/menus.ts` walks real rectangles through `ui/menuRows.ts`, so a row that
   * arrives or leaves is a stop that arrives or leaves whether anybody wrote it
   * down or not — and the owner's 2026-08-27 ride changed two rows at once: the
   * mode `<select>` became a pair of buttons and the contact toggle went away.
   *
   * Written by geometry rather than by list: the rider arrows are one visual
   * row because the cards sit side by side, the two mode buttons are one row
   * because they are a segmented control, and the actions are one column
   * because `.euc-menu__actions` is only multi-column on the title and the pause
   * card.
   *
   * **Rewritten at M27 Phase 1, because the panel grew from two cards to four**
   * (§27.6 predicted exactly this and asked for it). The row is eight arrows
   * wide now, and every one of them is named below rather than stepped over —
   * the first version of this walk asserted only that Down left the row, which
   * stayed green through a build where Down went *sideways*. It went sideways
   * because the cards' statuses wrap to different numbers of lines and the
   * arrows floated after them, so `ui/menuRows.ts` saw two rows where a player
   * sees one; the repair pins the rider row to the bottom of every card
   * (`game.css`). Naming the stops is what makes that provable.
   */
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);

  // Both seats first, for two reasons: a pad holding no seat has its confirm
  // read as a claim, and Start is `disabled` — which `focusableSelector`
  // excludes — until the panel is armed, so an empty panel has a shorter walk
  // than a full one.
  await seatBoth(page);

  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      '[data-couch-seat="0"] [data-menu="couch-prev"]',
    )?.focus();
  });

  // **Every stop of the row, left to right.** Eight arrows across four cards,
  // and they are one row: if the cards ever stop lining up, Right walks into
  // the wrong card's arrow and this says which one.
  const arrowStops = [
    ['0', 'couch-prev'], ['0', 'couch-next'],
    ['1', 'couch-prev'], ['1', 'couch-next'],
    ['2', 'couch-prev'], ['2', 'couch-next'],
    ['3', 'couch-prev'], ['3', 'couch-next'],
  ] as const;
  for (const [seat, hook] of arrowStops.slice(1)) {
    await pulsePad(page, PAD_DPAD_RIGHT);
    await expect(
      page.locator(`[data-couch-seat="${seat}"] [data-menu="${hook}"]`),
      `right walks the rider row to seat ${seat}'s ${hook}`,
    ).toBeFocused();
  }

  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(
    page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`),
    'down from the far end of the rider row reaches the mode row, keeping the column',
  ).toBeFocused();
  // Back to the near end, and down again — the column is kept on both sides.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      '[data-couch-seat="0"] [data-menu="couch-prev"]',
    )?.focus();
  });
  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(
    page.locator(`${MODE_BUTTON}[data-couch-mode="freeRide"]`),
    'down from the rider arrows reaches the mode row',
  ).toBeFocused();
  // **The row is three stops wide now, and that is the change.** A `<select>`
  // was one stop the d-pad *adjusted*; a segmented row is a stop per mode the
  // d-pad *walks*, so Right is a move rather than a value change — and M27
  // Phase 3 put the race between the two that were already there.
  await pulsePad(page, PAD_DPAD_RIGHT);
  await expect(
    page.locator(`${MODE_BUTTON}[data-couch-mode="race"]`),
    'and Right crosses to the race',
  ).toBeFocused();
  await pulsePad(page, PAD_DPAD_RIGHT);
  await expect(
    page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`),
    'and Right again reaches Knockabout at the end of the row',
  ).toBeFocused();
  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(
    page.locator('.euc-menu--couch [data-menu="couch-start"]'),
    'and down reaches Start, not Back — the toggle’s old stop is gone',
  ).toBeFocused();
  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(page.locator('.euc-menu--couch [data-menu="couch-back"]')).toBeFocused();

  // **And A presses the mode**, which is a different question from reaching it.
  // The old control needed `adjustControl` to step a `<select>` on the d-pad
  // axis *and* `confirm` to wrap it on A — two paths, both of which M24's §4.6
  // report was about. A button needs one, and it is the one every other control
  // on this panel already uses.
  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).focus();
  await pulsePad(page, PAD_A);
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');
  await page.locator(`${MODE_BUTTON}[data-couch-mode="freeRide"]`).focus();
  await pulsePad(page, PAD_A);
  expect(
    await page.evaluate(() => window.game.snapshot().couch.ride),
    'and back again — a choice, not a one-way switch',
  ).toBe('freeRide');

  expect(errors).toEqual([]);
});

test('the join panel carries no control that nothing routes', async ({ page }) => {
  /*
   * **A census, in `paddle.test.ts`'s sense, and it has outlived two handlers.**
   *
   * It began as the guard on `Menus.onCouchInput`, which listened on the panel
   * root for value-carrying controls and routed them to the contact setter.
   * That handler is gone with the two controls it served: since 2026-08-27 the
   * panel is buttons only, and every one of them arrives through the click
   * dispatch by its own `data-menu` action.
   *
   * The census stays because the *question* is the same one and it is the
   * question a new control silently gets wrong: is there anything on this panel
   * that carries a value nothing reads? A `<select>`, an `<input>` or a
   * `<textarea>` appearing here fails this, and whoever adds it has to say
   * where it is routed rather than discovering the answer in a ride.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  const controls = await page.evaluate(() => {
    const panel = document.querySelector('.euc-menu--couch');
    if (panel === null) throw new Error('no join panel');
    return {
      valued: [...panel.querySelectorAll('input, select, textarea')].map((node) => node.tagName),
      unrouted: [...panel.querySelectorAll('button')]
        .filter((node) => (node as HTMLElement).dataset.menu === undefined)
        .map((node) => node.className),
    };
  });

  expect(controls.valued, 'a value-carrying control with no handler').toEqual([]);
  expect(controls.unrouted, 'a button the click dispatch cannot see').toEqual([]);
  expect(errors).toEqual([]);
});

test('a stale mode value never reaches the state machine', async ({ page }) => {
  /*
   * **`isCouchRide` is the one place that answers what a couch may be started
   * into**, and this is the guard that makes it load-bearing. The ride crosses
   * from the DOM as a plain string — `data-couch-mode` on a button — so a stale
   * attribute left behind by a rename, or a couch race added to the markup
   * before it was added to the state machine, would otherwise reach `goTo` as a
   * mode nobody built.
   *
   * Synthetic because the panel carries only rides that exist, which is the
   * whole reason the guard needs a stand-in. Directional rather than merely
   * "unchanged": the mode is moved to Knockabout first, so a handler that had
   * lost the guard would be caught writing `chase` rather than writing the
   * value it already held.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

  const after = await page.evaluate(() => {
    const panel = document.querySelector('.euc-couch');
    if (panel === null) throw new Error('no join panel');
    const stale = document.createElement('button');
    stale.type = 'button';
    stale.dataset.menu = 'couch-mode';
    stale.dataset.couchMode = 'chase';
    panel.appendChild(stale);
    stale.click();
    const ride = window.game.snapshot().couch.ride;
    stale.remove();
    return { ride, left: panel.querySelectorAll('[data-couch-mode]').length };
  });

  expect(after.ride, 'a ride nobody built reached the state machine').toBe('knockabout');
  // **Derived from the list, not written down.** M27 Phase 3 added the race
  // and this number moved with it; a hard-coded 2 says only that the panel is
  // the size it was on the day this was written.
  expect(after.left, 'the synthetic control was cleaned up').toBe(COUCH_RIDES.length);
  expect(errors).toEqual([]);
});

/**
 * **A wide touchscreen, which is the one touch machine the couch admits** —
 * from Codex's Phase 2 QA, and the defect it found was real.
 *
 * `couchEligible` refuses below 1000 CSS px and otherwise asks whether a
 * precise pointer exists *at all* (`(any-pointer: fine)`, M25 Phase 5's QA
 * repair), so a touchscreen laptop is offered the mode on purpose. That machine
 * matches CSS `(pointer: coarse)`, and `DESIGN.md` §9b floors every menu target
 * at 2.75 rem there — 44 px, the smallest target both platform guidelines call
 * reliable.
 *
 * The contact toggle missed it, and the route in is worth recording: the row
 * began life as `.euc-field` and lost that class when it was reshaped into a
 * centred cluster, which silently took it out of the general
 * `.euc-field input[type="checkbox"]` floor. **A layout change can revoke a
 * rule written for a class you stopped wearing** — and nothing failed, because
 * the only project with `hasTouch` runs at phone width and can never reach this
 * panel.
 *
 * So this block is the panel's coarse-pointer contract rather than one
 * assertion about one control: every target on the screen is measured, so the
 * next one to arrive (Phase 5's mode choice, §26.6) is measured by the same
 * spec instead of needing a new one.
 */
test.describe('the join panel on a wide touchscreen', () => {
  test.use({ hasTouch: true, viewport: { width: 1200, height: 800 } });

  test('every target on the join panel is finger-sized', async ({ page }) => {
    const errors = collectErrors(page);

    // **What is real here and what is stubbed, because the difference is the
    // whole machine.** `hasTouch` gives a genuinely coarse-pointered context —
    // CSS `(pointer: coarse)` matches, `tap()` sends real touch pointers, and
    // the 44 px floor below is therefore measured rather than simulated. What
    // it cannot give is the *second* pointer: Playwright's emulation reports
    // `any-pointer: fine` as false, which describes a phone rather than a
    // laptop with a touchscreen, and `couchEligible` reads exactly that query
    // through JS. So the trackpad is stubbed and nothing else is.
    //
    // The stub is m25's, for the same machine and by the same argument — a
    // hand-built `MediaQueryList` rather than a spread of the real one, because
    // `matches` and `addEventListener` live on the prototype and the game calls
    // the latter before `window.game` exists.
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
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
      window.matchMedia = ((query: string) => (
        query === '(any-pointer: fine)' ? stub(query, true) : real(query)
      )) as typeof window.matchMedia;
    });
    await bootToTitle(page);

    // The premise, asserted rather than assumed: if this context were not
    // actually coarse-pointered, or the panel not actually reachable, the whole
    // contract would be measuring a screen no finger can reach and would pass
    // for the wrong reason.
    expect(
      await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'this context is not actually coarse-pointered',
    ).toBe(true);
    expect(
      await page.evaluate(() => window.game.snapshot().couch.available),
      'a wide touchscreen was refused the couch it can host',
    ).toBe(true);

    await openJoinPanel(page);

    const FLOOR_PX = 44;
    const targets = await page.evaluate(() => {
      const panel = document.querySelector('.euc-menu--couch');
      if (panel === null) throw new Error('no join panel');
      // **The hit area, which is not always the control.** A `<label>` wrapping
      // a checkbox *is* the target — clicking the sentence toggles the box — so
      // the floor belongs on the label and a 24 px box inside a 44 px label is
      // correct rather than a miss. Labels are measured, controls inside one
      // are not, and every control that is *not* inside one is: between them
      // that covers the panel with no gap for a small target to hide in.
      const nodes = [...panel.querySelectorAll('button, input, select, a[href], label')];
      return nodes
        .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
        .filter((node) => node.tagName === 'LABEL' || node.closest('label') === null)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const el = node as HTMLElement;
          return {
            name: el.dataset.menu ?? (el.className || el.tagName),
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          };
        });
    });

    expect(targets.length, 'the panel has controls to measure').toBeGreaterThan(4);
    for (const target of targets) {
      expect(target.height, `${target.name} is ${target.height}px tall`)
        .toBeGreaterThanOrEqual(FLOOR_PX - 0.5);
      expect(target.width, `${target.name} is ${target.width}px wide`)
        .toBeGreaterThanOrEqual(FLOOR_PX - 0.5);
    }

    // **And it still fits, at the shortest window the couch is offered on.**
    // Finger-sized targets are taller targets, so a floor that fixes reach can
    // buy an overflow — which the desktop fit contract in `m25.spec.ts` cannot
    // see, because it never runs coarse. 1000 × 520 is the tightest of the
    // windows that contract walks.
    for (const viewport of [{ width: 1200, height: 800 }, { width: 1000, height: 520 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(async () => {
        for (let i = 0; i < 2; i += 1) {
          await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
        }
      });
      const overflow = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.euc-menu--couch');
        if (root === null) throw new Error('no join panel');
        return root.scrollHeight - root.clientHeight;
      });
      expect(
        overflow,
        `a finger-sized join panel has ${overflow}px below the fold at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(1);
    }

    // And a finger actually works it — the measurement is the reason, the tap
    // is the behaviour. `tap()` sends a real touch pointer in this context.
    // Retargeted from the contact toggle to the mode chooser on 2026-08-27: the
    // toggle is gone, and the chooser is both the newest control on the panel
    // and the one whose targets grew.
    await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).tap();
    expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — the hard knock (§26.4, q74/q75/q79)
// ---------------------------------------------------------------------------

/*
 * A committed paddle strike puts a rider down, and "committed" is the head's
 * world speed at the moment it lands. `simulation/paddle.test.ts` proves the
 * threshold and `simulation/EucController.test.ts` proves the fall; neither can
 * see the only thing that matters here — that a *rider* is something a paddle
 * can reach at all, and that the same weapon means the same thing in whichever
 * hand it is.
 */

/** The seed m14 and m18 both pin, because it carries a real route. */
const DUEL_SEED = 'route-41';

/**
 * How far to the swinger's right the quarry stands, metres.
 *
 * Inside `PADDLE.reach` (1.40) and outside `CONTACT.radiusMetres` (0.80), which
 * is the window the whole rig depends on: the paddle can reach somebody the
 * bodies never touch, so nothing below can be a contact wearing a strike's
 * clothes. m14's own swing rig uses the same offset for a disc.
 */
const DUEL_RIGHT_METRES = 1.15;

/**
 * Boot Knockabout with two seats in it — Phase 5's session, built by hand.
 *
 * **The guest is seated before the mode starts**, which is the order the join
 * panel produces and the order the match referee depends on: `enterKnockabout`
 * decides by seat count which referee the run answers to, so a guest who
 * arrived afterwards would be riding in a run with no match in it.
 */
async function bootDuel(page: import('@playwright/test').Page, query = ''): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}${query}`);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider();
    window.game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
  });
}

interface Duel {
  /** What the match referee scored while this ran. A shove is not a knockdown. */
  knockdowns: readonly number[];
  /** The step the quarry's wobble first rose — a strike landing, and nothing else. */
  struckAt: number;
  /** How many separate strikes landed. One swing must never be more than one. */
  strikes: number;
  crashed: boolean;
  crashCause: string;
  /** The quarry's crash count, so a fall cannot be confused with a re-place. */
  crashes: number;
  /** The closest the two bodies came, metres. Must stay clear of contact. */
  minGap: number;
}

/**
 * One rider swings at another, on the road, through the production path.
 *
 * The quarry is parked on the swinger's right at `DUEL_RIGHT_METRES` and
 * `ahead` metres up the road; the swinger holds `throttle` and asks for the
 * swing when the quarry comes abeam, which is m14's own trigger. `swinger`
 * picks which seat does the swinging, because the mirror of this scenario is
 * the assertion that the seat you sit in does not change the fight.
 */
async function duel(
  page: import('@playwright/test').Page,
  options: { swinger: 0 | 1; throttle: number; ahead: number; steps: number },
): Promise<Duel> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    // +X is the rider's left at heading zero, so their right is the negative of
    // it — `simulation/paddle.ts` owns that sign and this repeats its arithmetic
    // rather than a guess about which way the arc goes.
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);

    const quarrySeat = input.swinger === 0 ? 1 : 0;
    const at = {
      x: spawn.position.x + forwardX * input.ahead + rightX * input.right,
      z: spawn.position.z + forwardZ * input.ahead + rightZ * input.right,
    };
    const place = (seat: number, x: number, z: number) => {
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, heading, seat);
    };
    place(input.swinger, spawn.position.x, spawn.position.z);
    place(quarrySeat, at.x, at.z);

    const read = (seat: number) => {
      const euc = game.snapshotFor(seat).euc;
      return {
        x: euc.position.x,
        z: euc.position.z,
        wobble: euc.wobbleEnergy,
        crashed: euc.crashed,
        cause: euc.crashCause,
        crashes: euc.crashes,
      };
    };

    let struckAt = -1;
    let strikes = 0;
    let minGap = Infinity;
    let previous = read(quarrySeat);
    let swung = false;
    for (let step = 0; step < input.steps; step += 1) {
      const swinger = game.snapshotFor(input.swinger);
      const quarry = read(quarrySeat);
      // How far up the road the quarry still is. Abeam and ahead is the window
      // the authored forehand sweeps through.
      const ahead = (quarry.x - swinger.euc.position.x) * forwardX
        + (quarry.z - swinger.euc.position.z) * forwardZ;
      // **The swing has to be led, and the lead is the swing's own timing.**
      // A wind-up plus half a strike window is 0.16 s, which at road speed is
      // three metres of road — ask for the swing when the quarry is abeam and
      // the arc arrives long after they have gone by. m14's rig could use a
      // flat 1.2 m because it rode at half throttle at a stationary disc.
      const lead = Math.abs(swinger.euc.speed) * (input.windup + input.active / 2);
      if (!swung && swinger.paddle.phase === 'idle' && ahead < lead + 1.0 && ahead > 0) {
        game.setActionsFor(input.swinger, { swing: true, throttle: input.throttle });
        swung = true;
      } else {
        game.setActionsFor(input.swinger, { throttle: input.throttle });
      }
      game.advance(1);

      const after = read(quarrySeat);
      const now = game.snapshotFor(input.swinger).euc.position;
      minGap = Math.min(minGap, Math.hypot(after.x - now.x, after.z - now.z));
      const landed = after.wobble > previous.wobble + 1e-9
        || (!previous.crashed && after.crashed);
      if (landed) {
        strikes += 1;
        if (struckAt < 0) struckAt = step;
      }
      previous = after;
    }

    const end = read(quarrySeat);
    return {
      knockdowns: game.snapshot().match.scores.map((score) => score.knockdowns),
      struckAt,
      strikes,
      crashed: end.crashed,
      crashCause: end.cause,
      crashes: end.crashes,
      minGap,
    };
  }, {
    ...options,
    right: DUEL_RIGHT_METRES,
    windup: PADDLE.windupSeconds,
    active: PADDLE.activeSeconds,
  });
}

test('a standing tap puts the rider beside you down, and so does a swing carried in', async ({ page }) => {
  /*
   * **The owner's 2026-08-27 ride turned this test around**, and his words are
   * the argument: *"realize hitting and not dropping is not fun. even at slow
   * speed/stationary getting hit with paddle should knock u out (with a guard
   * against recovery/spawn camping of course)."* Phase 3 shipped a wind-up
   * threshold, he played it, and a strike that lands and does nothing turned out
   * to read as a broken game rather than as a near miss.
   *
   * `PADDLE.hardKnockShare` is the lever, it ships at zero, and
   * `simulation/paddle.test.ts` still proves the wound-up band it used to hold.
   * What this file proves is the ride: the same swing, at both ends of the speed
   * range, puts somebody down.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  // Parked, so the head lands at the swing's own arc speed and nothing more —
  // which is now enough. The guard the owner asked for is the recovery window
  // `hardKnock` already refuses inside (q79), not a speed the striker must reach.
  const tap = await duel(page, { swinger: 0, throttle: 0, ahead: 0.35, steps: 90 });
  expect(tap.struckAt, `the tap never landed: ${JSON.stringify(tap)}`).toBeGreaterThanOrEqual(0);
  expect(tap.crashes, JSON.stringify(tap)).toBe(1);
  expect(tap.crashCause, JSON.stringify(tap)).toBe('struck');
  // **One swing, one strike, and this is the assertion Phase 3 was built
  // around.** The sweep reports a rider on every active step its head is within
  // reach — three of them against somebody standing still — and spending each
  // one delivered three bush-grade knocks for one swing. That arithmetic is
  // still wrong and still guarded, and it matters *more* now that one strike is
  // a knockdown: three would be a knockdown plus two shoves at a body on the
  // ground.
  expect(tap.strikes, JSON.stringify(tap)).toBe(1);
  // **And it scored, once.** A knockdown is the thing the referee counts, and a
  // swing that puts somebody down and credits nobody would be a fight with no
  // scoreboard.
  expect(tap.knockdowns, JSON.stringify(tap)).toEqual([1, 0]);
  // The bodies never met, so nothing above can be a bump misread as a strike.
  expect(tap.minGap).toBeGreaterThan(CONTACT.radiusMetres);

  // The same swing with a rider's own speed behind it. Started well back so the
  // wheel is doing real road speed by the time the arc reaches them.
  await bootDuel(page);
  const charge = await duel(page, { swinger: 0, throttle: 1, ahead: 30, steps: 900 });
  expect(charge.struckAt, `the charge never landed: ${JSON.stringify(charge)}`)
    .toBeGreaterThanOrEqual(0);
  // **Counted rather than sampled.** The rider is picked back up automatically
  // a few seconds later, so a spec that read `crashed` at the end of the run
  // would be asking whether they were still lying there rather than whether
  // they went down at all.
  expect(charge.crashes, JSON.stringify(charge)).toBe(1);
  expect(charge.crashCause).toBe('struck');
  expect(charge.knockdowns, 'the knockdown went to the wrong seat').toEqual([1, 0]);
  expect(charge.minGap).toBeGreaterThan(CONTACT.radiusMetres);
  expect(errors).toEqual([]);
});

test('the seat you sit in does not change the fight', async ({ page }) => {
  /*
   * **The seats step in order, and a swing must not be judged against the
   * loop's own progress.** Seat 0's paddle would otherwise sweep at a seat 1
   * that had not moved yet while seat 1's swept at a seat 0 that had — half a
   * step of advantage to whoever sits second, which sounds like nothing and is
   * 0.37 m of relative ground at the top speed against a 0.51 m capture window.
   *
   * So the scenario is run twice with the seats exchanged, and the two must
   * agree down to the step the strike landed on. Both riders are the same
   * controller carrying the same paddle over the same ground; the only thing
   * that differs is which of them the loop reaches first.
   */
  const errors = collectErrors(page);

  await bootDuel(page);
  const byHost = await duel(page, { swinger: 0, throttle: 1, ahead: 30, steps: 900 });
  await bootDuel(page);
  const byGuest = await duel(page, { swinger: 1, throttle: 1, ahead: 30, steps: 900 });

  expect(byHost.struckAt).toBeGreaterThanOrEqual(0);
  // Everything except who was credited, which is mirrored by construction — the
  // knockdown goes to whoever swung, and that is the one thing about this pair
  // that is *supposed* to differ.
  const { knockdowns: hostScored, ...host } = byHost;
  const { knockdowns: guestScored, ...guest } = byGuest;
  expect(guest, 'the guest\'s swing landed on a different step from the host\'s')
    .toEqual(host);
  expect(hostScored).toEqual([1, 0]);
  expect(guestScored, 'the guest\'s knockdown was credited to the host').toEqual([0, 1]);
  expect(errors).toEqual([]);
});

test('the tick’s aim is taken before anybody moves', async ({ page }) => {
  // The mechanism behind the test above, asserted where it can be seen. After a
  // step, the snapshot both swings were judged against must be the pose each
  // seat held *before* that step — for both seats, not just the one the loop
  // had not reached yet. Private only to TypeScript; read here as a diagnostic
  // and never written, on m18's precedent.
  const errors = collectErrors(page);
  await bootDuel(page);

  const aim = await page.evaluate(() => {
    const game = window.game;
    const internal = game as unknown as {
      readonly aimPoses: readonly { x: number; y: number; z: number }[];
      readonly seatQuarry: unknown;
    };
    game.clearActions();
    game.setActionsFor(0, { throttle: 1 });
    game.setActionsFor(1, { throttle: 1 });
    game.advance(120);

    const before = [0, 1].map((seat) => {
      const p = game.snapshotFor(seat).euc.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    game.advance(1);
    const after = [0, 1].map((seat) => {
      const p = game.snapshotFor(seat).euc.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    // **And that the aim is what the sweep was actually pointed at.** The
    // shared quarry is refilled per seat and the seats step in order, so after
    // a tick it holds what seat 1's swing was judged against — seat 0. Read
    // through two layers of compile-time `private`, as a diagnostic and never
    // written, on m18's precedent.
    const quarry = (internal.seatQuarry as unknown as {
      readonly volume: { readonly x: number; readonly z: number };
    }).volume;
    return {
      before,
      after,
      // **Sliced to the seats that exist** — M27 Phase 1 sized this scratch
      // pool from `COUCH_SEATS` rather than from a pair, so the array is four
      // long in a two-seat duel and the last two entries are the zeros nothing
      // has written. Reading the pool's *capacity* here would be reading an
      // implementation detail; what the claim is about is the seats.
      aimed: internal.aimPoses.slice(0, game.seatCount).map((p) => ({ x: p.x, y: p.y, z: p.z })),
      quarry: { x: quarry.x, z: quarry.z },
    };
  });

  expect(aim.aimed).toEqual(aim.before);
  expect(aim.after[0], 'the fixture must actually be moving').not.toEqual(aim.before[0]);
  expect(aim.after[1], 'the fixture must actually be moving').not.toEqual(aim.before[1]);
  expect(aim.quarry, 'seat 1 swept at a seat 0 that had already moved')
    .toEqual({ x: aim.before[0].x, z: aim.before[0].z });
  expect(errors).toEqual([]);
});

test('nobody swings at a rider who is already on the ground', async ({ page }) => {
  // `RiderTarget`'s own argument, and it applies twice as hard between two
  // people on a couch: the set is empty while they are down, so there is no
  // hit, no sound and nothing to explain.
  //
  // **In two halves, because the second one is worthless alone.** "No hits"
  // is what a rig that never reached anybody also reports, and the first draft
  // of this spec dropped seat 0 in at `y: 0` on a route whose ground is not at
  // zero — it passed by falling over. So the same swing is thrown at the same
  // rider standing and then lying down, and the first half has to land.
  const errors = collectErrors(page);
  await bootDuel(page);

  const flail = await page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);
    // Abeam and a little ahead, which is where the authored forehand actually
    // arrives — the same offsets the duel rig above uses. Dead abeam is behind
    // the end of the arc and lands nothing, which is what the control catches.
    const x = spawn.position.x + Math.sin(heading) * 0.35 + rightX * input.right;
    const z = spawn.position.z + Math.cos(heading) * 0.35 + rightZ * input.right;
    const beside = game.sampleGround(x, z);
    const home = game.sampleGround(spawn.position.x, spawn.position.z);
    const stand = () => {
      game.placeRider({ x: spawn.position.x, y: home.height, z: spawn.position.z }, heading, 0);
      game.placeRider({ x, y: beside.height, z }, heading, 1);
    };

    /** Swing at whatever is beside us for `steps`, and report what landed. */
    const swingAtTheSpot = (steps: number) => {
      const startWobble = game.snapshotFor(1).euc.wobbleEnergy;
      const startHits = game.snapshot().audio.played.hit;
      const startCrashes = game.snapshotFor(1).euc.crashes;
      let swings = 0;
      for (let step = 0; step < steps; step += 1) {
        if (game.snapshotFor(0).paddle.phase === 'idle') {
          game.setActionsFor(0, { swing: true });
          swings += 1;
        } else {
          game.setActionsFor(0, {});
        }
        game.advance(1);
      }
      const end = game.snapshotFor(1).euc;
      return {
        swings,
        hits: game.snapshot().audio.played.hit - startHits,
        wobbleRose: end.wobbleEnergy > startWobble + 1e-9,
        newCrashes: end.crashes - startCrashes,
      };
    };

    stand();
    const standing = swingAtTheSpot(120);

    // Now put the guest down through the production path and keep swinging at
    // the spot for a second and a half. `hardKnock` is the door the mode uses;
    // reaching it here is the same compile-time-only private m18 reads.
    stand();
    const internal = game as unknown as {
      readonly seats: readonly { readonly controller: { hardKnock(x: number, z: number): boolean } }[];
    };
    internal.seats[1].controller.hardKnock(1, 0);
    game.advance(1);
    const down = game.snapshotFor(1).euc;
    const lying = swingAtTheSpot(180);

    return { standing, wasDown: down.crashed, cause: down.crashCause, lying };
  }, { right: DUEL_RIGHT_METRES });

  // The control: the rig really does reach a rider standing there.
  expect(flail.standing.swings, JSON.stringify(flail)).toBeGreaterThan(1);
  // **One hit for several swings, and that is the control *and* the claim in
  // one number** — the owner's 2026-08-27 ride, where a standing tap became a
  // knockdown. The first swing lands and puts them down; every swing after it
  // is thrown at a rider who is no longer in the set, which is precisely what
  // the second half of this test asks about with a hand-delivered knock.
  //
  // This line read `wobbleRose` until that ride. It could not survive it: a
  // `hardKnock` is a crash rather than an oscillation, so the rig's own success
  // signal became a thing that never happens — the exact shape of a control
  // that stops controlling for anything.
  expect(flail.standing.hits, JSON.stringify(flail)).toBe(1);
  expect(flail.standing.newCrashes, JSON.stringify(flail)).toBe(1);

  // And the claim: the same swing at the same place, once they are down.
  expect(flail.wasDown).toBe(true);
  expect(flail.cause).toBe('struck');
  expect(flail.lying.swings, JSON.stringify(flail)).toBeGreaterThan(1);
  expect(flail.lying.hits, JSON.stringify(flail)).toBe(0);
  expect(flail.lying.wobbleRose).toBe(false);
  expect(flail.lying.newCrashes, JSON.stringify(flail)).toBe(0);
  expect(errors).toEqual([]);
});

test('the cop swings the same weapon, and one threshold moves it for both', async ({ page }) => {
  /*
   * q75, reaffirmed with the facts in front of him: **everyone gets the hard
   * knock, cop included** — one weapon, one rule, and deliberately no `CHASE`
   * override on the threshold (q83). §26.2 prices what that costs the chase:
   * his one-touch ending moves from 1.1 m to about 1.75 m and gains a wind-up.
   *
   * Asserted from both ends of the one slider rather than from the cop's speed,
   * which the brain decides and this spec must not pretend to know. At the top
   * of the slider no swing he can throw is committed; below a standing tap
   * every landed one is. If `PADDLE.hardKnockShare` did not reach `copPaddle`
   * — the exact shape of Phase 0's warning about values read from the wrong
   * side of the live store — both halves would return the same answer.
   *
   * `?wobble=0` is M13's sanctioned silencer, used here for what it exists for:
   * with the oscillator off the only thing that can put this rider down is the
   * hard knock, so the cause is unambiguous.
   */
  const errors = collectErrors(page);

  const beside = async (share: number) => {
    await bootToTitle(page, `level=generated&seed=${DUEL_SEED}&wobble=0`);
    await page.evaluate(() => {
      window.game.startChase();
    });
    await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
    return page.evaluate(({ reach, threshold }) => {
      const game = window.game;
      const internal = game as unknown as {
        readonly copCurrent: { x: number; y: number; z: number; headingY: number };
        readonly copPaddle: { readonly swingCount: number };
      };
      game.tuning.set('PADDLE.hardKnockShare', threshold);
      game.advance(1);

      // m18's own placement: stood off the cop's shoulder at the paddle's
      // reach, where his production brain will choose to swing.
      const cop = internal.copCurrent;
      const bearing = cop.headingY + Math.PI / 4;
      const x = cop.x + Math.sin(bearing) * reach;
      const z = cop.z + Math.cos(bearing) * reach;
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, cop.headingY);
      game.clearActions();

      const startHits = game.snapshot().audio.played.hit;
      const startSwings = internal.copPaddle.swingCount;
      let crashes = 0;
      let cause = 'none';
      for (let step = 0; step < 600; step += 1) {
        game.advance(1);
        const euc = game.snapshot().euc;
        if (euc.crashes > crashes) {
          crashes = euc.crashes;
          cause = euc.crashCause;
        }
        if (game.snapshot().app.state !== 'chase') break;
      }
      return {
        crashes,
        cause,
        hits: game.snapshot().audio.played.hit - startHits,
        swings: internal.copPaddle.swingCount - startSwings,
      };
    }, { reach: PADDLE.reach, threshold: share });
  };

  const soft = await beside(3);
  expect(soft.hits, `the cop never landed one: ${JSON.stringify(soft)}`).toBeGreaterThan(0);
  expect(soft.cause, JSON.stringify(soft)).not.toBe('struck');
  // **One swing, one strike, for him too** — and this is the half that had
  // been wrong since M18. His sweep reports the rider on every active step it
  // stays in reach, so the loop spent two or three body knocks per swing and
  // could pile a slow rider past `wobbleCrashEnergy` on one of them.
  expect(soft.hits, JSON.stringify(soft)).toBeLessThanOrEqual(soft.swings);

  const hard = await beside(0.8);
  expect(hard.hits).toBeGreaterThan(0);
  expect(hard.crashes, JSON.stringify(hard)).toBeGreaterThan(0);
  expect(hard.cause).toBe('struck');
  expect(errors).toEqual([]);
});

test('a cop who catches a standing rider keeps facing them, and keeps swinging', async ({ page }) => {
  /*
   * **A pre-existing deadlock, found by taking the strike bug away.**
   *
   * The stand-off cap tells the cop to match his quarry's speed at arm's
   * length. Against a rider who simply stops, that is zero — and he arrives a
   * metre past them, brakes to a stand, and comes to rest with the rider **121°
   * off his nose**: outside `swingConeRadians`, so his brain never asks for
   * another swing, and stationary, so `EucController` gives him no yaw to fix
   * it with. Measured standing there for the whole three-hundred-second escape
   * clock, having swung exactly once.
   *
   * Nothing saw it because that one swing used to be counted on every active
   * step of its own sweep — three body knocks at once, past
   * `wobbleCrashEnergy`, and the rider was busted a second after he arrived.
   *
   * So the stand-off may hold him at arm's length and may not hold him still
   * while he is pointed the wrong way. Delete the floor and the bearing below
   * stays outside the cone and the swing count stops at one.
   *
   * **The scenario has to be built now, where it used to happen by itself** —
   * the owner's 2026-08-27 ride. A cop whose first landed swing ends the run
   * cannot be watched for twenty seconds, so the threshold is wound to the top
   * of its slider and the oscillator silenced: his swings shove and nothing
   * else, which is the exact world the deadlock lived in. That is a fixture
   * decision and not a weakening — the deadlock is a fact about his *brain*, and
   * the sibling test above is the one that owns what a swing does.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}&wobble=0`);
  await page.evaluate(() => {
    window.game.tuning.set('PADDLE.hardKnockShare', 3);
    window.game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');

  const held = await page.evaluate(({ cone }) => {
    const game = window.game;
    const internal = game as unknown as {
      readonly copCurrent: { x: number; z: number; headingY: number };
      readonly copPaddle: { readonly swingCount: number };
    };
    game.loop.setRunning(false);
    game.clearActions();
    const wrap = (angle: number) => (
      ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    );

    // Stand still and let him come. Twenty seconds is long past his arrival.
    let facing = 0;
    let closest = Infinity;
    for (let step = 0; step < 20 * 120; step += 1) {
      game.setActions({});
      game.advance(1);
      const snapshot = game.snapshot();
      if (snapshot.app.state !== 'chase') break;
      const cop = internal.copCurrent;
      const bearing = wrap(
        Math.atan2(snapshot.euc.position.x - cop.x, snapshot.euc.position.z - cop.z)
          - cop.headingY,
      );
      closest = Math.min(closest, snapshot.chase.copGap);
      // How much of the last ten seconds he spent able to swing at all.
      if (step > 10 * 120 && Math.abs(bearing) <= cone) facing += 1;
    }
    return {
      facing,
      closest,
      swings: internal.copPaddle.swingCount,
      state: game.snapshot().app.state,
    };
  }, { cone: 1.05 });

  expect(held.closest, 'the cop never reached the standing rider').toBeLessThan(2);
  expect(held.state, 'the fixture ended the run, so nothing above was watched').toBe('chase');
  expect(held.swings, `he swung ${held.swings} time(s) in twenty seconds`).toBeGreaterThan(3);
  expect(held.facing, 'he came to rest pointed away from the rider he had caught')
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('couch free ride carries no paddles, so nobody swings at anybody', async ({ page }) => {
  /*
   * q82, and the clause that enforces it. `paddleEquipped` decides whether a
   * rider is a thing a paddle may reach at all, and free ride — solo or couch —
   * is riding.
   *
   * **The identical scenario, run in the other mode.** This is the same call
   * the tap test above makes, at the same offsets, against the same parked
   * rider; the only difference is which ride it is booted into. That is what
   * stops this being a spec that passes because its rig never reached anybody —
   * the failure the flail test below had to be rewritten around, and the reason
   * "no hits" is never an assertion on its own.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const equipped = await page.evaluate(() => window.game.snapshot().paddle.equipped);
  expect(equipped).toBe(false);

  const quiet = await duel(page, { swinger: 0, throttle: 0, ahead: 0.35, steps: 90 });
  expect(quiet.struckAt, JSON.stringify(quiet)).toBe(-1);
  expect(quiet.strikes).toBe(0);
  expect(quiet.crashes).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 4 — the match referee (§26.5, q76/q77)
// ---------------------------------------------------------------------------

/*
 * `simulation/knockaboutMatch.test.ts` proves the rules where they live and
 * cannot prove the one thing that matters most here: that the right facts
 * arrive. A knockdown is a strike-caused crash credited to the striker, and
 * whether the referee is handed exactly those needs two riders, a paddle and a
 * world to be true in.
 */

/** What one scripted match produced. */
interface Fight {
  phase: string;
  winner: number | null;
  knockdowns: readonly number[];
  discs: readonly number[];
  target: number;
  state: string;
  rounds: number;
}

/**
 * Fight a match out, one charge at a time, through the production path.
 *
 * Each round stands both riders back at the placement the duel rig uses — which
 * clears the loser's crash and their recovery invulnerability with it, so the
 * next round is a fresh charge rather than a swing at somebody getting up — and
 * `swinger` charges. `target` is written through the live tuning store, so the
 * match is short enough to be worth watching and the slider is exercised on the
 * way.
 */
async function fight(
  page: import('@playwright/test').Page,
  options: { swinger: 0 | 1; target: number; rounds: number },
): Promise<Fight> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', input.target);

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);
    const quarrySeat = input.swinger === 0 ? 1 : 0;

    let rounds = 0;
    for (let round = 0; round < input.rounds; round += 1) {
      if (game.snapshot().match.phase !== 'running') break;
      rounds += 1;
      game.clearActions();

      const back = { x: spawn.position.x, z: spawn.position.z };
      const at = {
        x: spawn.position.x + forwardX * input.ahead + rightX * input.right,
        z: spawn.position.z + forwardZ * input.ahead + rightZ * input.right,
      };
      const place = (seat: number, x: number, z: number) => {
        const ground = game.sampleGround(x, z);
        game.placeRider({ x, y: ground.height, z }, heading, seat);
      };
      place(input.swinger, back.x, back.z);
      place(quarrySeat, at.x, at.z);

      let swung = false;
      for (let step = 0; step < 900; step += 1) {
        const swinger = game.snapshotFor(input.swinger);
        const quarry = game.snapshotFor(quarrySeat).euc.position;
        const ahead = (quarry.x - swinger.euc.position.x) * forwardX
          + (quarry.z - swinger.euc.position.z) * forwardZ;
        const lead = Math.abs(swinger.euc.speed) * (input.windup + input.active / 2);
        if (!swung && swinger.paddle.phase === 'idle' && ahead < lead + 1.0 && ahead > 0) {
          game.setActionsFor(input.swinger, { swing: true, throttle: 1 });
          swung = true;
        } else {
          game.setActionsFor(input.swinger, { throttle: 1 });
        }
        game.advance(1);
        if (game.snapshotFor(quarrySeat).euc.crashCause === 'struck') break;
        if (game.snapshot().match.phase !== 'running') break;
      }
    }

    // Let the results delay run out, so the screen the match reaches is part of
    // what this reports rather than a separate question.
    game.clearActions();
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }

    const match = game.snapshot().match;
    return {
      phase: match.phase,
      winner: match.winner,
      knockdowns: match.scores.map((score) => score.knockdowns),
      discs: match.scores.map((score) => score.discs),
      target: match.target,
      state: game.snapshot().app.state,
      rounds,
    };
  }, {
    ...options,
    ahead: 30,
    right: DUEL_RIGHT_METRES,
    windup: PADDLE.windupSeconds,
    active: PADDLE.activeSeconds,
  });
}

test('a match is first to N knockdowns, and the last one ends it', async ({ page }) => {
  const errors = collectErrors(page);
  await bootDuel(page);

  const armed = await page.evaluate(() => window.game.snapshot().match);
  expect(armed.phase, 'two seats in Knockabout is a match').toBe('running');
  expect(armed.scores).toEqual([
    { knockdowns: 0, discs: 0 },
    { knockdowns: 0, discs: 0 },
  ]);

  const result = await fight(page, { swinger: 0, target: 3, rounds: 6 });
  expect(result.target, 'the slider reached the referee').toBe(3);
  expect(result.knockdowns, JSON.stringify(result)).toEqual([3, 0]);
  expect(result.phase).toBe('ended');
  expect(result.winner).toBe(0);
  // Four charges would mean the match went on after the third landed.
  expect(result.rounds).toBe(3);
  expect(result.state, 'the match reached its own screen').toBe('results');
  await expect(page.locator('.euc-menu--results')).toContainText('Player 1 wins');
  await expect(page.locator('.euc-menu--results')).toContainText('Knockdowns');
  expect(errors).toEqual([]);
});

test('a couch match keeps nothing, and single player still keeps everything', async ({ page }) => {
  // q77 and §25.6's couch rule: nothing a two-player session does reaches
  // storage. Byte-compared, on the contact toggle's own precedent, and with the
  // bucket made non-empty first so an empty comparison cannot pass by accident.
  const errors = collectErrors(page);
  await bootDuel(page);

  const before = await page.evaluate(() => {
    window.game.setOptions({ muted: true });
    return JSON.stringify({ ...localStorage });
  });

  const result = await fight(page, { swinger: 1, target: 2, rounds: 4 });
  expect(result.phase, JSON.stringify(result)).toBe('ended');
  expect(result.winner).toBe(1);

  const after = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(after).toBe(before);
  const kept = await page.evaluate(() => window.game.snapshot().targets.best);
  expect(kept, 'a match filed a Knockabout personal best').toBe(null);
  expect(errors).toEqual([]);
});

test('single player answers to the referee it always had', async ({ page }) => {
  // The other half of "Game picks the referee by seat count": one rider never
  // arms a match, the run still ends when the last disc falls, and the record
  // is still filed. Delete the `seatCount === 2` gate at the entrance and the
  // first assertion goes.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}`);
  await page.evaluate(() => {
    window.game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    const before = game.snapshot();

    // Knock every disc down through the shared field rather than by riding at
    // each one: what is being asserted is the ending, not the aim.
    const internal = game as unknown as {
      readonly targets: { strike(id: string): boolean };
    };
    for (const target of game.levelPlan.targets ?? []) internal.targets.strike(target.id);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return {
      matchPhase: before.match.phase,
      state: game.snapshot().app.state,
      best: game.snapshot().targets.best,
    };
  });

  expect(solo.matchPhase, 'one rider armed a match').toBe('idle');
  expect(solo.state).toBe('results');
  await expect(page.locator('.euc-menu--results')).toContainText('Targets struck');
  expect(solo.best, 'single player still files its record').not.toBe(null);
  expect(errors).toEqual([]);
});

test('discs credit the seat that knocked them, and a fallen disc is gone for both', async ({ page }) => {
  /*
   * q76's side tally, and both ways a disc goes down. The field stays **shared**
   * — that is what keeps the route worth riding rather than turning it into two
   * private scoreboards — and the credit is per seat, so nobody wins a fight by
   * farming scenery and nobody has their scenery stolen either.
   *
   * Both paths are exercised because there are two call sites: `targets.strike`
   * is the authority for the paddle and for the body knock alike, and a credit
   * added to one of them is exactly the shape of defect §26.6 warned this phase
   * about — something made plural everywhere except one place.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const scored = await page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const discs = game.levelPlan.targets ?? [];
    const first = discs[0];
    const second = discs[1];

    /** Stand this seat six metres short of a disc, riding +Z at it. */
    const runUp = (seat: number, at: { x: number; z: number }, across: number) => {
      const x = at.x + across;
      const z = at.z - 6;
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, 0, seat);
    };

    // **Ridden into** — the body knock, which is the second way a disc falls
    // and has been since the owner's 2026-08-12 ride.
    runUp(0, first.centre, 0);
    for (let step = 0; step < 600; step += 1) {
      game.setActionsFor(0, { throttle: 1 });
      game.advance(1);
      if (game.snapshot().targets.struck > 0) break;
    }
    const afterRam = game.snapshot();

    // **Swung at** — m14's own placement: inboard of the pad and short of it,
    // so the disc is on the rider's right where the authored forehand goes.
    game.clearActions();
    runUp(1, second.centre, 1.15);
    let swung = false;
    for (let step = 0; step < 600; step += 1) {
      const rider = game.snapshotFor(1);
      const ahead = second.centre.z - rider.euc.position.z;
      const lead = Math.abs(rider.euc.speed) * (input.windup + input.active / 2);
      if (!swung && rider.paddle.phase === 'idle' && ahead < lead + 1.0 && ahead > 0) {
        game.setActionsFor(1, { swing: true, throttle: 0.5 });
        swung = true;
      } else {
        game.setActionsFor(1, { throttle: 0.5 });
      }
      game.advance(1);
      if (game.snapshot().targets.struck > 1) break;
    }
    const afterSwing = game.snapshot();

    // And the shared field: seat 1 rides straight through the disc seat 0
    // already took. Nothing may move.
    game.clearActions();
    runUp(1, first.centre, 0);
    for (let step = 0; step < 600; step += 1) {
      game.setActionsFor(1, { throttle: 1 });
      game.advance(1);
    }
    const afterSeconds = game.snapshot();

    return {
      ram: { struck: afterRam.targets.struck, discs: afterRam.match.scores.map((s) => s.discs) },
      swing: {
        struck: afterSwing.targets.struck,
        discs: afterSwing.match.scores.map((s) => s.discs),
      },
      again: {
        struck: afterSeconds.targets.struck,
        discs: afterSeconds.match.scores.map((s) => s.discs),
      },
    };
  }, { windup: PADDLE.windupSeconds, active: PADDLE.activeSeconds });

  expect(scored.ram.struck, JSON.stringify(scored)).toBe(1);
  expect(scored.ram.discs, 'riding into a disc credits the rider who did it').toEqual([1, 0]);

  expect(scored.swing.struck, JSON.stringify(scored)).toBe(2);
  expect(scored.swing.discs, 'swinging at a disc credits the swinger').toEqual([1, 1]);

  expect(scored.again.struck, 'a fallen disc stood back up for the other rider').toBe(2);
  expect(scored.again.discs, 'a fallen disc scored twice').toEqual([1, 1]);
  expect(errors).toEqual([]);
});

test('a finished match does not follow the player into the next run', async ({ page }) => {
  /*
   * `clearLastResults`'s whole reason, one mode later. `buildResultsView` is a
   * tagged union with no tag — it picks whichever of five nullable records is
   * non-null — so the scheme rests on every entrance clearing the other four,
   * and it has already failed once in this project's history: a completed chase
   * survived a trip through the title screen and turned the timed run's card
   * back into Police chase.
   *
   * **Two things are checked by one journey**, because both are ways the match
   * could be left behind. If the record survives, the card names a winner in a
   * run that had one rider. If the *referee* survives, `stepKnockabout` keeps
   * taking the match branch and the single-player run can never end at all.
   */
  const errors = collectErrors(page);
  await bootDuel(page);
  const done = await fight(page, { swinger: 0, target: 2, rounds: 4 });
  expect(done.phase, JSON.stringify(done)).toBe('ended');
  await expect(page.locator('.euc-menu--results')).toContainText('Player 1 wins');

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // The title already sends a guest home — `enterState` closes an open couch
    // — so this asks rather than assumes, and a change to that would show up
    // here as a seat count rather than as a throw.
    game.setAppState('title');
    if (game.seatCount > 1) game.despawnSecondRider();
    game.startKnockabout();
    game.advance(1);
    const armed = game.snapshot().match.phase;

    const internal = game as unknown as { readonly targets: { strike(id: string): boolean } };
    for (const target of game.levelPlan.targets ?? []) internal.targets.strike(target.id);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return { armed, state: game.snapshot().app.state };
  });

  expect(solo.armed, 'the finished match was still refereeing').toBe('idle');
  expect(solo.state, 'the single-player run could not end').toBe('results');
  await expect(page.locator('.euc-menu--results')).toContainText('Targets struck');
  await expect(page.locator('.euc-menu--results')).not.toContainText('wins');
  expect(errors).toEqual([]);
});

/** The results table's own vocabulary, read off whichever card is on screen. */
async function tableWords(page: import('@playwright/test').Page): Promise<{
  caption: string | null;
  label: string | null;
  value: string | null;
  delta: string | null;
  compare: string | null;
  /** The comparison column's rendered width, which `data-compare` is what sets. */
  deltaWidth: number | null;
}> {
  return page.evaluate(() => {
    const cell = (hook: string) => document
      .querySelector<HTMLElement>(`.euc-menu--results [data-menu="${hook}"]`);
    const read = (hook: string) => cell(hook)?.textContent ?? null;
    const table = document
      .querySelector<HTMLElement>('.euc-menu--results [data-menu="results-table"]');
    const delta = cell('results-column-delta');
    return {
      caption: read('results-table-caption'),
      label: read('results-column-label'),
      value: read('results-column-value'),
      delta: read('results-column-delta'),
      compare: table?.dataset.compare ?? null,
      deltaWidth: delta === null ? null : delta.getBoundingClientRect().width,
    };
  });
}

test('the results table is headed in the mode’s own words, not the time trial’s', async ({ page }) => {
  /*
   * **Phase 6's QA finding, and the reason it survived five modes.** The
   * caption and the three column headers were markup: "Splits", "Checkpoint",
   * "Time", "vs best". They are right for a timed run and they were still on
   * screen over `Knockdowns (first to 5) | 5 – 2` — three headings, none of
   * them true, and all three read aloud by a screen reader ahead of every value
   * in the table.
   *
   * **Two cards in one journey, because a constant passes half of this test.**
   * Asserting the match's words alone cannot tell "the view carries them" from
   * "somebody changed the markup"; the single-player run that follows shares
   * this table, shares its `data-compare`, and has to be headed differently.
   * The timed run's own words are asserted where they are still correct, by
   * `not.toContainText`, so a future edit that makes every card say "Splits"
   * again fails here rather than shipping.
   */
  const errors = collectErrors(page);
  await bootDuel(page);
  const done = await fight(page, { swinger: 0, target: 2, rounds: 4 });
  expect(done.phase, JSON.stringify(done)).toBe('ended');

  const match = await tableWords(page);
  expect(match).toEqual({
    caption: 'Match summary',
    label: 'Result',
    value: 'This match',
    delta: '',
    // Nothing on this card is measured against anything: a couch session keeps
    // no records (q77), so the third column has no heading over its blanks.
    compare: 'false',
    // And no width either, so the figures sit against the right edge rather
    // than two thirds of the way across under nothing. `table-layout: fixed`
    // takes its columns from the header row, so this is the one place the
    // stylesheet can say it and the one place a spec can see it.
    deltaWidth: 0,
  });
  const card = page.locator('.euc-menu--results');
  await expect(card).not.toContainText('Splits');
  await expect(card).not.toContainText('Checkpoint');
  await expect(card).not.toContainText('vs best');

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setAppState('title');
    if (game.seatCount > 1) game.despawnSecondRider();
    game.startKnockabout();
    game.advance(1);
    const internal = game as unknown as { readonly targets: { strike(id: string): boolean } };
    for (const target of game.levelPlan.targets ?? []) internal.targets.strike(target.id);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return game.snapshot().app.state;
  });
  expect(solo, 'the single-player run could not end').toBe('results');

  const run = await tableWords(page);
  expect(run, 'the same table, headed for the run that is actually on it').toEqual({
    caption: 'Run summary',
    label: 'Result',
    value: 'This run',
    delta: '',
    compare: 'false',
    deltaWidth: 0,
  });
  expect(errors).toEqual([]);
});

test('the mode’s entrance takes every paddle out of every hand', async ({ page }) => {
  // One of the six singletons §26.6 named for this phase, and the one with the
  // twist in it: `enterKnockabout` cancelled `this.seats[0].paddle` explicitly,
  // because seat 0 was the only seat that could hold one — and making that
  // plural changed nothing, because the entrance also stands every rider back
  // at their slot and `resetRiderTo` has always taken the swing with the rider
  // it teleports. Both the singular line and its plural replacement were
  // unfalsifiable; what is real is that the *reset* has to reach every seat.
  //
  // So this asserts the rule and not the line: after the entrance, nobody is
  // holding a swing, and both riders are standing at their own slots. Turn
  // `resetSeats` back into `resetRider` and it fails.
  const errors = collectErrors(page);
  await bootDuel(page);

  const paddles = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.setActionsFor(0, { swing: true });
    game.setActionsFor(1, { swing: true });
    game.advance(2);
    const midSwing = [0, 1].map((seat) => game.snapshotFor(seat).paddle.phase);

    // Somewhere neither slot is, so "back at their slot" is a move rather than
    // a coincidence.
    const spawn = game.levelPlan.spawn;
    for (const seat of [0, 1]) {
      const x = spawn.position.x + 40 + seat * 6;
      const ground = game.sampleGround(x, spawn.position.z + 40);
      game.placeRider({ x, y: ground.height, z: spawn.position.z + 40 }, 0, seat);
    }
    const away = [0, 1].map((seat) => game.snapshotFor(seat).euc.position);

    game.startKnockabout();
    const home = [0, 1].map((seat) => game.snapshotFor(seat).euc.position);
    return {
      midSwing,
      after: [0, 1].map((seat) => game.snapshotFor(seat).paddle.phase),
      moved: [0, 1].map((seat) => Math.hypot(home[seat].x - away[seat].x, home[seat].z - away[seat].z)),
      apart: Math.hypot(home[0].x - home[1].x, home[0].z - home[1].z),
    };
  });

  expect(paddles.midSwing, 'the fixture must really have both paddles moving')
    .toEqual(['windup', 'windup']);
  expect(paddles.after).toEqual(['idle', 'idle']);
  expect(paddles.moved[0], 'seat 0 was not stood back at its slot').toBeGreaterThan(10);
  expect(paddles.moved[1], 'the guest was left where the last ride ended').toBeGreaterThan(10);
  // And at *their own* slots, not on one point — M25 Phase 2's spawn contract.
  expect(paddles.apart, JSON.stringify(paddles)).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 5 — the mode in the menus and the HUD (§26.6, q78/q80)
// ---------------------------------------------------------------------------

test('the join panel’s mode choice is the ride the couch starts', async ({ page }) => {
  /*
   * q78: one couch entrance, with room for the race later. **Not a sixth ride**
   * — M25's finding holds, so this starts the `knockabout` row the game already
   * has, carrying two seats, exactly as the couch free ride starts `freeRide`.
   *
   * Three things have to be true at once and only a running game can say so:
   * the state machine went to the mode, the guest survived the trip (the exit
   * that *is* the couch session now has two spellings), and the referee was
   * armed by seat count on the way in.
   */
  const errors = collectErrors(page);
  await onePad(page);
  // A world with discs in it, because the *other* path — the slice the game
  // boots into, which has none — is its own spec below.
  await bootToJoinPanel(page, `level=generated&seed=${DUEL_SEED}`);

  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('freeRide');
  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

  await seatBoth(page);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const started = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match.phase,
    scores: window.game.snapshot().match.scores.length,
    equipped: window.game.snapshot().paddle.equipped,
  }));
  expect(started.seats, 'the guest was sent home by the exit').toBe(2);
  expect(started.match, 'two seats in Knockabout is a match').toBe('running');
  expect(started.scores).toBe(2);
  expect(started.equipped, 'a match without paddles is not one').toBe(true);
  expect(errors).toEqual([]);
});

test('free ride is still what the panel does by default, and stays a free ride', async ({ page }) => {
  // The other branch, and the one nothing may quietly change: a couch session
  // that nobody touched the control on is the ride M25 shipped, with no paddles
  // in it (q82) and no referee.
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);
  await seatBoth(page);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const started = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match.phase,
    equipped: window.game.snapshot().paddle.equipped,
    contact: window.game.snapshot().contact.live,
  }));
  expect(started.seats).toBe(2);
  expect(started.match).toBe('idle');
  expect(started.equipped).toBe(false);
  expect(started.contact, 'the couch free ride still bumps').toBe(true);
  expect(errors).toEqual([]);
});

test('the mode goes back to free ride every time the panel opens', async ({ page }) => {
  /*
   * q81's argument, applied to the second thing the panel now holds. A session
   * starts when the panel opens, so what the last one was for is not what this
   * one is for — and the quietest ride is the one two people get without asking
   * for it. The reset is at `openCouch` and not at `closeCouch`, so the
   * still-chosen state in between is asserted too and the choice between the
   * two moments is tested rather than incidental.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(
    await page.evaluate(() => window.game.snapshot().couch.ride),
    'the reset happens on the way in, not on the way out',
  ).toBe('knockabout');

  await openJoinPanel(page);
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('freeRide');
  await expect(
    page.locator(`${MODE_BUTTON}[data-couch-mode="freeRide"]`),
    'and the control the next room sees is lit on free ride',
  ).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the mode choice never reaches the saved options record', async ({ page }) => {
  // Invariant 5, on the contact toggle's own terms and by its own method: what
  // a session is for is not a preference, so nothing it does may show up in the
  // player's record. Byte-compared, with the bucket made non-empty first so an
  // empty comparison cannot pass by accident.
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  const before = await page.evaluate(() => {
    window.game.setOptions({ muted: true });
    return JSON.stringify({
      options: window.game.snapshot().options,
      storage: { ...localStorage },
    });
  });

  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  await page.locator(`${MODE_BUTTON}[data-couch-mode="freeRide"]`).click();
  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();

  const after = await page.evaluate(() => JSON.stringify({
    options: window.game.snapshot().options,
    storage: { ...localStorage },
  }));
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});

test('both halves of a match show both scores, each seat’s own first', async ({ page }) => {
  /*
   * q80, and the phrasing is the answer: *each half reads its own tally and the
   * other's, so neither player looks across the divider*. The two halves
   * therefore show mirrored numbers on purpose — each is written from the point
   * of view of the person sitting in front of it.
   *
   * `tests/m25.spec.ts` already requires the two halves to disagree wherever
   * the rides do; this is the one place they are required to disagree about the
   * same fact, which is why it is asserted rather than assumed to be covered.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const scored = await fight(page, { swinger: 0, target: 5, rounds: 2 });
  expect(scored.knockdowns, JSON.stringify(scored)).toEqual([2, 0]);
  expect(scored.phase, 'the match must still be running to have a HUD').toBe('running');

  // The HUD view is published on a render frame, so the loop has to run for one.
  await page.evaluate(() => {
    window.game.clearActions();
    window.game.loop.setRunning(true);
  });
  await page.waitForFunction(() => window.game.snapshotFor(1).hud.knockabout !== '');

  const halves = await page.evaluate(() => [0, 1].map((seat) => {
    const hud = window.game.snapshotFor(seat).hud;
    return { lane: hud.knockabout, label: hud.modeLabel };
  }));

  expect(halves[0].lane).toBe('2 – 0');
  expect(halves[1].lane, 'the guest’s half read the host’s score first').toBe('0 – 2');
  expect(halves[0].label).toBe(halves[1].label);
  expect(halves[0].label, 'the lane must say whose number is first').toContain('You');
  expect(halves[0].label, 'and what it takes to win').toContain('5');
  expect(errors).toEqual([]);
});

test('a couch Knockabout on a world with no discs keeps the guest while a route is chosen', async ({ page }) => {
  /*
   * **The commonest path through this feature, and it nearly undid the join.**
   * The game boots into the slice, which carries no targets, so the first couch
   * Knockabout anybody asks for is answered by `enterKnockabout` sending them to
   * the routes panel — the same refusal the title's own Knockabout button has
   * given since M14. Leaving the couch on that step would send the guest home
   * and make the player redo the whole seating to answer a question about the
   * world.
   *
   * So `routes` is the third exit that keeps the guest, and the route purpose
   * survives the detour: a world chosen from there arrives in Knockabout with
   * both seats still in it and the referee armed.
   */
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);

  const slice = await page.evaluate(() => window.game.snapshot().targets.total);
  expect(slice, 'the fixture must really be a world with nothing to knock down').toBe(0);

  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  await seatBoth(page);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');

  const detour = await page.evaluate(() => ({
    seats: window.game.seatCount,
    ride: window.game.snapshot().couch.ride,
  }));
  expect(detour.seats, 'the guest was sent home by a question about the world').toBe(2);
  expect(detour.ride).toBe('knockabout');

  // And the panel says what it needs, in the words the single-player entrance
  // has used since M14.
  await expect(page.locator('.euc-menu--routes')).toBeVisible();

  // Choosing a world from here arrives in the match rather than in free ride:
  // the route purpose is what carries "this was for Knockabout" across the
  // detour, and it is the same mechanism the single-player entrance uses.
  await page.locator('.euc-menu--routes [data-menu="seed"]').fill('route-41');
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'knockabout',
    undefined,
    { timeout: 60000 },
  );

  const arrived = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match.phase,
  }));
  expect(arrived.seats, 'the guest did not survive the route choice').toBe(2);
  expect(arrived.match).toBe('running');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 5's QA repairs — the four an independent pass found (2026-08-27)
// ---------------------------------------------------------------------------

test('both buttons under a finished match start another match', async ({ page }) => {
  /*
   * **`clearLastResults` made the writing of the results union one place and
   * left the reading of it in three.** Phase 4 added the fifth record and only
   * `buildResultsView` learned about it, so `Ride it again` and `New route`
   * both fell through their own hand-written chains to the shared default —
   * and a couch match's own results card started a two-rider *time trial*.
   *
   * Three things per button, because the mode is the one that could be got
   * right while the session was lost: the state, both seats still on the
   * couch, and a referee armed and back at nil-nil.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const first = await fight(page, { swinger: 0, target: 2, rounds: 4 });
  expect(first.state, JSON.stringify(first)).toBe('results');
  expect(first.winner).toBe(0);

  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  const again = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match,
  }));
  expect(again.seats, 'Ride it again sent the guest home').toBe(2);
  expect(again.match.phase, 'and started a run with no match in it').toBe('running');
  expect(again.match.scores.map((score) => score.knockdowns)).toEqual([0, 0]);

  // The second button, from a second finished match — a world swap rather than
  // a re-entrance, which is the half that goes through `rideDestination`.
  const second = await fight(page, { swinger: 1, target: 2, rounds: 4 });
  expect(second.state, JSON.stringify(second)).toBe('results');
  const seedBefore = await page.evaluate(() => window.game.snapshot().world.seed);

  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout', undefined, {
    timeout: 20_000,
  });
  const moved = await page.evaluate(() => ({
    seed: window.game.snapshot().world.seed,
    seats: window.game.seatCount,
    match: window.game.snapshot().match,
  }));
  expect(moved.seed, 'New route stayed on the same world').not.toBe(seedBefore);
  expect(moved.seats, 'New route sent the guest home').toBe(2);
  expect(moved.match.phase).toBe('running');
  expect(moved.match.scores.map((score) => score.knockdowns)).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

/** What one head-on exchange produced, read from both seats. */
interface Exchange {
  causes: readonly string[];
  crashes: readonly number[];
  knockdowns: readonly number[];
  /** The step each rider first went down, so "the same step" is asserted and not assumed. */
  downAt: readonly number[];
}

/**
 * Two riders charge each other and both swing — M26 Phase 5's QA repair.
 *
 * **The geometry is symmetric on purpose and the symmetry is exact.** Seat 0
 * sits at the spawn on the level's heading; seat 1 sits `ahead` up the road and
 * `DUEL_RIGHT_METRES` to seat 0's right, facing back down it. A heading turned
 * through π turns its right vector with it, so seat 0 is *also* off seat 1's
 * right by the same 1.15 m — each is in the other's forehand and neither is
 * inside `CONTACT.radiusMetres`, so nothing below can be a ram wearing a
 * strike's clothes.
 *
 * Both hold full throttle and both ask for the swing on the same trigger the
 * duel rig uses, so the two arcs are in flight on the same fixed step. That is
 * the whole point: whichever rider is stepped second used to have their swing
 * cancelled by the crash the first one had already landed.
 */
async function exchange(
  page: import('@playwright/test').Page,
  options: { target: number; steps: number },
): Promise<Exchange> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.tuning.set('KNOCKABOUT.matchKnockdowns', input.target);

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);

    const place = (seat: number, x: number, z: number, facing: number) => {
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, facing, seat);
    };
    place(0, spawn.position.x, spawn.position.z, heading);
    place(
      1,
      spawn.position.x + forwardX * input.ahead + rightX * input.right,
      spawn.position.z + forwardZ * input.ahead + rightZ * input.right,
      heading + Math.PI,
    );

    const swung = [false, false];
    const downAt = [-1, -1];
    for (let step = 0; step < input.steps; step += 1) {
      for (let seat = 0; seat < 2; seat += 1) {
        const me = game.snapshotFor(seat);
        const them = game.snapshotFor(seat === 0 ? 1 : 0).euc.position;
        // Each rider's own forward, which is the negative of the other's.
        const sign = seat === 0 ? 1 : -1;
        const ahead = (them.x - me.euc.position.x) * forwardX * sign
          + (them.z - me.euc.position.z) * forwardZ * sign;
        const lead = Math.abs(me.euc.speed) * (input.windup + input.active / 2);
        if (!swung[seat] && me.paddle.phase === 'idle' && ahead < lead + 1.0 && ahead > 0) {
          game.setActionsFor(seat, { swing: true, throttle: 1 });
          swung[seat] = true;
        } else {
          game.setActionsFor(seat, { throttle: 1 });
        }
      }
      game.advance(1);
      for (let seat = 0; seat < 2; seat += 1) {
        if (downAt[seat] < 0 && game.snapshotFor(seat).euc.crashed) downAt[seat] = step;
      }
    }

    return {
      causes: [0, 1].map((seat) => game.snapshotFor(seat).euc.crashCause),
      crashes: [0, 1].map((seat) => game.snapshotFor(seat).euc.crashes),
      knockdowns: game.snapshot().match.scores.map((score) => score.knockdowns),
      downAt,
    };
  }, {
    ...options,
    ahead: EXCHANGE_RUNWAY_METRES,
    right: DUEL_RIGHT_METRES,
    windup: PADDLE.windupSeconds,
    active: PADDLE.activeSeconds,
  });
}

test('two riders who put each other down on the same step both score', async ({ page }) => {
  /*
   * **The order effects were spent in decided the fight, and nothing about the
   * geometry did.** Rider effects were applied inside the seat loop, so seat
   * 0's strike landed while seat 1 was still waiting to be stepped — and a
   * struck rider is a crashing rider, whose in-flight swing `stepPaddle`
   * cancels on sight. Either rider wins this exchange alone; together, seat 1's
   * swing simply disappeared, every time.
   *
   * The fix is `spendRiderStrikes`: found in the seat loop, spent after it,
   * beside contact and for contact's reason.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const both = await exchange(page, { target: 5, steps: 420 });
  expect(both.causes, JSON.stringify(both)).toEqual(['struck', 'struck']);
  expect(both.crashes, 'one exchange, one fall each').toEqual([1, 1]);
  expect(both.downAt[0], 'they went down on different steps').toBe(both.downAt[1]);
  expect(both.knockdowns, 'the referee was handed both facts').toEqual([1, 1]);
  expect(errors).toEqual([]);
});

test('a simultaneous match point is a draw, and the card says why — q86', async ({ page }) => {
  /*
   * **q86, answered 2026-08-28 on the owner's instruction**: *"whatever is
   * fair, and simple to implement. I don't want a player having unfair
   * advantage. So for example a tie."*
   *
   * This is the spec that used to record the tie-break nobody had chosen. The
   * exchange above proves the *physical* half is symmetric — both riders go
   * down and both falls are real — and until today only the scoreboard was
   * not: `KnockaboutMatch.knockdown` ended the match itself, so the seat the
   * caller's loop visited first took it, which is always seat 0. Both facts
   * now reach the referee before it is stepped, and a lead nobody holds alone
   * is nobody's.
   *
   * `target: 1` makes the whole match one exchange, which is the only way to
   * put two riders on match point at the same instant on demand.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const decider = await exchange(page, { target: 1, steps: 420 });
  expect(decider.causes, JSON.stringify(decider)).toEqual(['struck', 'struck']);
  expect(decider.knockdowns, 'both were handed in, and both counted').toEqual([1, 1]);

  const ended = await page.evaluate(() => {
    const game = window.game;
    // The card waits out `CHALLENGE.resultsDelaySeconds` before it is shown.
    for (let step = 0; step < 300 && game.snapshot().app.state !== 'results'; step += 1) {
      game.advance(1);
    }
    return { match: game.snapshot().match, state: game.snapshot().app.state };
  });
  expect(ended.match.phase).toBe('ended');
  expect(ended.match.winner, 'nobody takes a shared lead').toBe(null);
  expect(ended.state, 'a draw is an ending, so it reaches the screen').toBe('results');

  const card = page.locator('.euc-menu--results');
  await expect(card).toContainText('Match drawn');
  await expect(card, 'a heading with nobody in it explains itself').toContainText('same swing');
  await expect(card).not.toContainText('wins');
  expect(errors).toEqual([]);
});

/**
 * A rider respawns on the exact step their opponent's swing lands — Phase 5's
 * QA repair, both seat orders.
 *
 * Both are parked thirty metres up the road; the quarry stands `DUEL_RIGHT_-
 * METRES` to the swinger's right and 0.35 m up it, which is `duel`'s own
 * standing tap and is where the authored forehand actually passes (a quarry
 * dead abeam is outside the arc, and a rig that stands one there reports
 * "nothing landed" for reasons that have nothing to do with the test — M26
 * Phase 3's G7).
 *
 * **The landing step is measured, not guessed.** `respawnAt: -1` runs the tap
 * with nobody respawning and reports which step the strike arrived on; the
 * second run presses `R` on that step. Two earlier versions of this rig missed
 * by one and by a decay: watching for `paddle.phase === 'active'` sees it a
 * step *after* the sweep that found the hit, and reading the wobble at the end
 * of the run sees a value that has already decayed away. Both reported success
 * with the fix reverted.
 */
async function resetUnderStrike(
  page: import('@playwright/test').Page,
  options: { swinger: 0 | 1; respawnAt: number },
): Promise<{ moved: number; strikeStep: number; wobbleAfter: number; crashes: number }> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);
    const quarrySeat = input.swinger === 0 ? 1 : 0;

    const at = {
      x: spawn.position.x + forwardX * input.ahead,
      z: spawn.position.z + forwardZ * input.ahead,
    };
    const place = (seat: number, x: number, z: number) => {
      const ground = game.sampleGround(x, z);
      game.placeRider({ x, y: ground.height, z }, heading, seat);
    };
    place(input.swinger, at.x, at.z);
    place(
      quarrySeat,
      at.x + rightX * input.right + forwardX * input.lead,
      at.z + rightZ * input.right + forwardZ * input.lead,
    );

    const read = () => {
      const euc = game.snapshotFor(quarrySeat).euc;
      return {
        x: euc.position.x,
        z: euc.position.z,
        wobble: euc.wobbleEnergy,
        crashes: euc.crashes,
      };
    };
    const before = read();
    let previous = before;
    let strikeStep = -1;
    let wobbleAfter = 0;

    // The tap: asked for once, standing still, so the arc is the only thing
    // that moves and the strike cannot be a ram.
    game.setActionsFor(input.swinger, { swing: true });

    for (let step = 0; step < 90; step += 1) {
      if (step === 1) game.setActionsFor(input.swinger, {});
      if (step === input.respawnAt) game.setActionsFor(quarrySeat, { reset: true });
      game.advance(1);
      if (step === input.respawnAt) {
        game.setActionsFor(quarrySeat, {});
        // **Read on this step rather than watched across it.** A reset clears
        // the wobble the rider had, and the strike is spent *after* the seat
        // loop that respawned them — so here "did a stale strike land" is
        // exactly "is the wobble anything but nothing".
        wobbleAfter = read().wobble;
      }
      const now = read();
      // **A strike is a wobble rise *or* a crash, and it used to be only the
      // first** — the owner's 2026-08-27 ride. A landed tap on a parked rider is
      // now a knockdown, and a `hardKnock` does not touch the oscillator, so the
      // control run stopped detecting the very thing it exists to time. Both,
      // because the wound-up world where a tap only shoves is still one drag of
      // a slider away and this rig must keep working in it.
      if (
        strikeStep < 0
        && (now.wobble > previous.wobble + 1e-9 || now.crashes > previous.crashes)
      ) {
        strikeStep = step;
      }
      // After the respawn step the wobble must stay at nothing, so a strike
      // deferred into a later tick is caught by the same detector.
      if (input.respawnAt >= 0 && step > input.respawnAt) {
        wobbleAfter = Math.max(wobbleAfter, now.wobble);
      }
      previous = now;
    }

    const after = read();
    return {
      moved: Math.hypot(after.x - before.x, after.z - before.z),
      strikeStep,
      wobbleAfter,
      crashes: after.crashes - before.crashes,
    };
  }, { ...options, ahead: 30, right: DUEL_RIGHT_METRES, lead: 0.35 });
}

for (const swinger of [0, 1] as const) {
  test(`a respawn on the step seat ${swinger}'s swing lands is not hit across the map`, async ({ page }) => {
    /*
     * **`aimPoses` fixed where each paddle sweeps and left when each hit lands
     * inside the seat loop.** A rider who pressed `R` this tick is thirty
     * metres away by the time their opponent's strike is spent, and the QA pass
     * landed one there — wobble and hit cue included.
     *
     * `stepContact` had the identical problem and already had the answer:
     * something true of two riders cannot be resolved on a step where one of
     * them teleported. `spendRiderStrikes` takes the same `seatReset` and voids
     * the tick's strikes with it.
     *
     * **Both seat orders**, because seat 0's reset aborts the tick and a
     * guest's does not — two different paths to the same rule, and only one of
     * them was ever going to be written by accident.
     *
     * **And the control comes first**, because "nothing happened" is also what
     * a rig that never reached anything reports (M26 Phase 3's own lesson). It
     * is not decoration here: it is where the respawn step comes from.
     */
    const errors = collectErrors(page);
    await bootDuel(page);

    const control = await resetUnderStrike(page, { swinger, respawnAt: -1 });
    expect(control.strikeStep, 'the tap never landed, so the case below is empty')
      .toBeGreaterThanOrEqual(0);
    expect(control.crashes, 'the control never actually put the quarry down').toBe(1);
    expect(control.moved, 'the control respawned somebody').toBeLessThan(0.5);

    await bootDuel(page);
    const result = await resetUnderStrike(page, { swinger, respawnAt: control.strikeStep });
    expect(result.moved, 'the quarry never respawned, so nothing was tested')
      .toBeGreaterThan(20);
    expect(result.wobbleAfter, 'a strike landed on a pose nobody was standing at').toBe(0);
    expect(result.crashes, 'and it put them down at the spawn').toBe(0);
    expect(errors).toEqual([]);
  });
}

test('choosing the mode with the keyboard still lets the keyboard sit down', async ({ page }) => {
  /*
   * **The one press the join panel exists to receive is `Enter`**, and every
   * control that takes focus is a chance to swallow it. The rule has now been
   * narrowed twice for two different elements — the contact checkbox at Phase 2,
   * the mode `<select>` at Phase 5 — and the third control is this one: a
   * button, which `Menus`' own focus trap and `claimKeys` suppression handle,
   * and which is a different path from either of the first two.
   *
   * Kept, and kept pointed at the mode chooser, *because* the chooser changed
   * shape on 2026-08-27. A control that was a `<select>` on Monday and a button
   * on Tuesday is exactly the kind of change that quietly re-opens a defect
   * whose spec was retired with the element that had it.
   *
   * A real focus, because that is the whole defect: the failure needs the
   * element to still have the caret when `Enter` arrives.
   *
   * `src/input/keyboard.test.ts` owns the other half — that arrows and `Space`
   * still belong to a dropdown where one exists — where the predicate lives.
   */
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page, `level=generated&seed=${DUEL_SEED}`);

  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).click();
  await page.locator(`${MODE_BUTTON}[data-couch-mode="knockabout"]`).focus();
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-couch-mode')),
    'the control never had focus, so this proves nothing',
  ).toBe('knockabout');

  await pulsePad(page, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);

  const seated = await page.evaluate(() => ({
    devices: window.game.snapshot().input.devices,
    ride: window.game.snapshot().couch.ride,
  }));
  expect(seated.devices[1], 'the keyboard never sat down').toBe('keyboard');
  expect(seated.ride, 'and the mode it chose survived the claim').toBe('knockabout');

  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  expect(await page.evaluate(() => window.game.snapshot().match.phase)).toBe('running');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The owner's 2026-08-27 couch ride (§26.11)
// ---------------------------------------------------------------------------

test('a rider who stands still in the chase is knocked down and busted', async ({ page }) => {
  /*
   * **The regression he opened the report with**, in his own words: *"police
   * chase mode, when the cop hits me i just brush it off as if nothing happened.
   * i almost had a heart attack seeing that broken and went to play the live
   * build. THANKFULLY, in the live build the police knocks you out when it hits
   * u (for example if u stay still when the mode starts the cop approaches from
   * behind and knocks you the fuck out!)."*
   *
   * **It was two of this milestone's own changes meeting.** M26 Phase 3 found
   * the cop had been spending his sweep on every active step since M18 — three
   * body knocks for one swing, which piled past `wobbleCrashEnergy` and put a
   * parked rider on the ground. That was a real defect and removing it was
   * right. What replaced it was the hard knock, gated on `committed`; and a cop
   * closing on somebody who has *stopped* is the one wielder who cannot carry
   * speed into a swing, so the mode's signature moment became a shove.
   *
   * The scenario is his, exactly: start the chase, do nothing at all, and be
   * caught. Nothing here sets a tunable — the point is what the shipped game
   * does to a player who stands still.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}`);
  await page.evaluate(() => window.game.startChase());
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');

  const caught = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    let crashes = 0;
    let cause = 'none';
    let atSpeed = 0;
    // Thirty seconds is many times his arrival and far short of the five-minute
    // escape clock, so a run that ends inside it ended because he caught them.
    for (let step = 0; step < 30 * 120; step += 1) {
      const before = game.snapshot().euc.speed;
      game.advance(1);
      const euc = game.snapshot().euc;
      if (euc.crashes > crashes) {
        crashes = euc.crashes;
        cause = euc.crashCause;
        atSpeed = Math.abs(before);
      }
      if (game.snapshot().app.state !== 'chase') break;
    }
    const chase = game.snapshot().chase;
    return { crashes, cause, atSpeed, outcome: chase.outcome, survived: chase.survived };
  });

  expect(caught.crashes, 'the cop never put the standing rider down').toBeGreaterThan(0);
  expect(caught.cause, 'he shoved them instead of knocking them down').toBe('struck');
  // **Standing still, and that is the whole of it.** The rider brought no speed
  // to the exchange, which is exactly the case the threshold used to refuse.
  expect(caught.atSpeed, 'the fixture rode somewhere instead of standing still')
    .toBeLessThan(0.5);
  expect(caught.outcome, 'a knockdown beside the cop is a bust').toBe('caught');
  expect(caught.survived, 'he took his time about it').toBeLessThan(30);
  expect(errors).toEqual([]);
});

test('a paused couch swaps mode without going back to the title', async ({ page }) => {
  /*
   * The owner's third item: *"2P pause menu should allow 2P mode to change to
   * another 2p mode without having to quit to main menu."*
   *
   * **`startCouch` from the middle of a session, minus the sitting down.** The
   * claims and the seats stay; what changes is which mode entrance runs, and it
   * is the mode's own entrance rather than a `goTo` past it — Knockabout stands
   * the discs back up and arms the referee by seat count.
   *
   * The return leg is the half that found a defect. Leaving a match for a free
   * ride left the referee **running**, and the HUD's score lane is gated on the
   * referee's phase precisely because "a running match only exists inside the
   * mode" had been true — it was true because there was only one way out.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const swapped = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const read = () => ({
      state: game.snapshot().app.state,
      phase: game.snapshot().match.phase,
      paddles: game.snapshot().paddle.equipped,
      // **Scoped to the pause card since 2026-08-28**, because the results card
      // carries the same control now. An unscoped `querySelectorAll` here would
      // silently start reporting four buttons and two panels' worth of state.
      pressed: [...document.querySelectorAll<HTMLElement>(
        '.euc-menu--pause [data-menu="switch-mode"]',
      )].map((button) => `${button.dataset.couchMode}:${button.getAttribute('aria-pressed')}`),
      hidden: document.querySelector<HTMLElement>('[data-menu="pause-couch"]')?.hidden ?? null,
    });
    const spawnAt = { ...game.snapshotFor(1).euc.position };
    const press = (ride: string) => {
      document.querySelector<HTMLElement>(
        `.euc-menu--pause [data-menu="switch-mode"][data-couch-mode="${ride}"]`,
      )?.click();
    };

    // **The door, called from the middle of a ride** — the guard that says this
    // is a pause-menu verb. Nothing in production can reach it: the control is
    // only on the pause card. That is exactly why it is called here, because a
    // guard no spec exercises is one a later caller walks past — and this one is
    // not decorative for two reasons at once.
    //
    // `AppState.rideOrigin` is recorded on the way *out* of a ride, so
    // `rideReturn` answers "which ride is waiting underneath" and means nothing
    // while one is actually running: mid-ride it still names the previous one.
    // So the comparison this method makes against it is only true from a pause.
    // And `enterKnockabout` from inside `knockabout` re-arms the referee and
    // resets both riders before `goTo` declines the no-op transition — a switch
    // that wipes the score and teleports two people and changes no mode, which
    // is the half-applied press this whole method is written to avoid.
    // Ride first, so "the riders were reset" is a measurable thing. Straight out
    // of `enterKnockabout` both seats are already standing on their spawn slots,
    // and a reset that moves nobody proves nothing.
    game.setActionsFor(0, { throttle: 1 });
    game.setActionsFor(1, { throttle: 1 });
    game.advance(180);
    game.clearActions();
    const riding = read();
    const wasAt = { ...game.snapshotFor(1).euc.position };
    game.switchCouchRide('knockabout');
    const midRide = {
      ...read(),
      moved: Math.hypot(
        game.snapshotFor(1).euc.position.x - wasAt.x,
        game.snapshotFor(1).euc.position.z - wasAt.z,
      ),
      rode: Math.hypot(wasAt.x - spawnAt.x, wasAt.z - spawnAt.z),
    };

    game.setAppState('paused');
    const inMatch = read();
    press('freeRide');
    const free = read();
    game.setAppState('paused');
    press('knockabout');
    const back = read();
    return { riding, midRide, inMatch, free, back };
  });

  expect(swapped.riding.state, 'the fixture was not riding').toBe('knockabout');
  expect(swapped.midRide.state, 'a mid-ride call left the mode half-switched')
    .toBe('knockabout');
  expect(swapped.midRide.phase, 'and it abandoned the match it was in').toBe('running');
  expect(swapped.midRide.rode, 'the fixture never left the spawn, so a reset moves nobody')
    .toBeGreaterThan(5);
  expect(swapped.midRide.moved, 'a refused switch reset the riders anyway')
    .toBeLessThan(0.01);

  expect(swapped.inMatch.hidden, 'a couch pause menu is not offering the switch').toBe(false);
  // **Every mode the couch offers, in the panel's own order** — M27 Phase 3
  // put the race between the two that were here, and the list is emitted from
  // `COUCH_RIDES` at both ends so a fourth mode moves both together. Exactly
  // one is pressed, which is the claim: the chooser is a *report* of what the
  // session is, not three buttons remembering their own last press.
  expect(swapped.inMatch.pressed).toEqual(
    COUCH_RIDES.map((ride) => `${ride}:${ride === 'knockabout'}`),
  );

  expect(swapped.free.state, 'the switch never left the pause menu').toBe('freeRide');
  expect(swapped.free.paddles, 'the paddles came with them into a free ride').toBe(false);
  expect(swapped.free.phase, 'the referee was left running in a free ride').toBe('idle');

  expect(swapped.back.state, 'and back again').toBe('knockabout');
  expect(swapped.back.paddles).toBe(true);
  expect(swapped.back.phase, 'the mode entrance did not re-arm the referee').toBe('running');
  expect(errors).toEqual([]);
});

test('a world with nothing to hit says so rather than swallowing the press', async ({ page }) => {
  /*
   * **The refusal has to come before anything is written.** `enterKnockabout`
   * answers a world with no discs by opening the routes panel; `routes` is not
   * a successor of `paused`, so `goTo` refuses it — and a switch that had
   * already set the mode and reset both riders would leave the pause menu up
   * with two riders teleported and nothing else changed.
   *
   * The hand-built slice is the world that has no discs, which is also the one
   * two people are most likely to be riding when they decide to fight.
   */
  const errors = collectErrors(page);
  await bootPair(page);

  const refused = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setAppState('paused');
    const button = document.querySelector<HTMLButtonElement>(
      '.euc-menu--pause [data-menu="switch-mode"][data-couch-mode="knockabout"]',
    );
    const before = game.snapshotFor(1).euc.position;
    button?.click();
    const clicked = game.snapshotFor(1).euc.position;
    // **And the handler on its own, past the control** — because the control is
    // `disabled` and a click on a disabled button never reaches it. Deleting the
    // refusal inside `switchCouchRide` left this spec green when it read only
    // the button, which is the screen masking the guard that actually matters:
    // the door has to refuse a call the DOM did not make.
    game.switchCouchRide('knockabout');
    const called = game.snapshotFor(1).euc.position;
    return {
      disabled: button?.disabled ?? null,
      note: document.querySelector('[data-menu="pause-couch"] .euc-field__note')?.textContent ?? '',
      state: game.snapshot().app.state,
      ride: game.snapshot().couch.ride,
      moved: Math.hypot(clicked.x - before.x, clicked.z - before.z),
      movedByCall: Math.hypot(called.x - before.x, called.z - before.z),
    };
  });

  expect(refused.disabled, 'a mode this world cannot carry was offered').toBe(true);
  expect(refused.note, 'and it did not say why').toContain('things to hit');
  expect(refused.state, 'the press left the pause menu').toBe('paused');
  expect(refused.ride, 'the mode was written for a switch that never happened').toBe('freeRide');
  expect(refused.moved, 'the riders were reset by a switch that was refused').toBeLessThan(0.01);
  expect(refused.movedByCall, 'the door let a call through that the button was hiding')
    .toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('each seat card wears its own rider’s colour, and says which key to press', async ({ page }) => {
  /*
   * The owner's join-panel notes, as the two things a spec can hold: *"make the
   * characher select more like the main menu one were the icon changes to the
   * color of the charachter"*, and *"the press A or start or Enter thing…
   * its just so plaintext like"*.
   *
   * **The swatch is asserted against the roster rather than against a hex
   * string**, so a character recoloured in `data/riders.ts` moves this test's
   * expectation with it instead of failing it. The key caps are asserted as
   * elements *and* as unchanged prose: `renderSeatLine` builds `<kbd>` nodes
   * whose text is the same sentence a screen reader always heard, and a caption
   * that quietly lost a word would be a caption that no longer names the button.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  const cards = await page.evaluate(() => [0, 1].map((seat) => {
    const card = document.querySelector<HTMLElement>(`[data-couch-seat="${seat}"]`);
    if (card === null) throw new Error(`no seat ${seat}`);
    const dot = card.querySelector<HTMLElement>('.euc-couch__dot');
    const status = card.querySelector<HTMLElement>('.euc-couch__status');
    const cap = status?.querySelector('kbd') ?? null;
    return {
      name: card.querySelector<HTMLElement>(`[data-couch-rider="${seat}"]`)?.textContent ?? '',
      swatch: card.style.getPropertyValue('--rider-swatch'),
      dotColour: dot === null ? null : getComputedStyle(dot).backgroundColor,
      keys: [...(status?.querySelectorAll('kbd') ?? [])].map((cap) => cap.textContent),
      line: status?.textContent ?? '',
      // **Is the cap actually drawn as a cap?** The element alone proves the
      // markup; the paragraph it sits in is what it has to look different from,
      // which is the whole of the owner's complaint about the old line.
      capBackground: cap === null ? null : getComputedStyle(cap).backgroundColor,
      lineBackground: status === null ? null : getComputedStyle(status).backgroundColor,
      capBorder: cap === null ? null : getComputedStyle(cap).borderTopWidth,
    };
  }));

  for (const card of cards) {
    const character = CHARACTERS.find((one) => one.name === card.name);
    expect(character, `no roster entry called ${card.name}`).toBeDefined();
    expect(card.swatch, `${card.name}'s card is not wearing their colour`)
      .toBe(character?.swatch);
    // **Drawn, not merely declared** — a token set on a card nothing reads is a
    // colour nobody sees. Asserted as "present *and* opaque", because a missing
    // dot reads as `null` and `null` is not the transparent string either: the
    // first version of this line passed with the element deleted.
    expect(card.dotColour, `${card.name}'s card has no swatch at all`).not.toBeNull();
    expect(card.dotColour, `${card.name}'s dot is not painted`).not.toBe('rgba(0, 0, 0, 0)');
  }

  // Two seats, both empty, both naming the key that fills them.
  expect(cards[0].keys.length, 'the seat line names no key at all').toBeGreaterThan(0);
  expect(cards[0].keys, 'the keyboard is the spare on a machine with no pad')
    .toContain('Enter');
  expect(cards[0].line, 'the caps changed the sentence a screen reader hears')
    .toContain('press Enter on the keyboard');
  // And they are drawn as keys rather than set in the same ink as the sentence,
  // which is the note this whole change came from.
  expect(cards[0].capBackground, 'the key cap has no fill').not.toBeNull();
  expect(cards[0].capBackground, 'the key cap is set in the same ink as the prose')
    .not.toBe(cards[0].lineBackground);
  expect(cards[0].capBorder, 'the key cap has no edge').not.toBe('0px');
  expect(errors).toEqual([]);
});

test('the pause menu’s mode switch belongs to a couch, and the door says so too', async ({ page }) => {
  /*
   * **Two answers to one question, and the second one is the load-bearing
   * half.** The pause menu hides the chooser unless two seats are held, which
   * is the screen's answer; `switchCouchRide` refuses on the same seat count,
   * which is the door's. A guard that only the screen enforces is a guard a pad
   * press, a stale node or a later caller walks straight past — and deleting
   * the door's copy failed nothing until this spec existed, because every other
   * test reaches it through the control.
   *
   * Single player, in the mode a mis-served switch would damage most: the
   * referee is armed by seat count at the entrance, so a one-seat session sent
   * back through it is the shape that could arm a match with nobody to fight.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}`);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.setAppState('paused');
    const before = {
      hidden: document.querySelector<HTMLElement>('[data-menu="pause-couch"]')?.hidden ?? null,
      seats: game.seatCount,
    };
    game.switchCouchRide('freeRide');
    return {
      ...before,
      state: game.snapshot().app.state,
      rideReturn: game.snapshot().app.state === 'paused' ? 'paused' : 'moved',
      phase: game.snapshot().match.phase,
    };
  });

  expect(solo.seats, 'the fixture is not single player').toBe(1);
  expect(solo.hidden, 'a single player was offered the couch’s mode switch').toBe(true);
  expect(solo.state, 'the door served a switch for a session that is not a couch').toBe('paused');
  // Single player has no match referee, and a switch that ran anyway would have
  // gone back through `enterKnockabout` — the one place that arms one.
  expect(solo.phase, 'a one-seat session came back with a match armed').toBe('idle');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The owner's couch ride — 2026-08-28
// ---------------------------------------------------------------------------

/*
 * Three items, from two people on one sofa, and the first is the only one that
 * is a rule rather than a screen: *"player 1 can spawn smack player 2 because
 * of how close to each other they spawn at the start. because the paddle is in
 * the right hand, player 1 can smack player 2 at spawn, but P2 smacks the air
 * as there's no one to the right of P2. This is unfair."*
 */

/** The furthest a parked rider's paddle can put another rider down, metres. */
const REACH_METRES = new Paddle().reachAgainst(CHASE.riderHitRadius);

test('a match starts nobody inside anybody’s reach, and the free ride is unchanged', async ({ page }) => {
  /*
   * **Both halves, because the spacing is a pair of values and either one alone
   * proves nothing.** A match is stood apart (the fix) and a free ride is still
   * stood together (the thing that must not change) — two people setting off to
   * ride have always wanted to be beside each other, and widening every spawn
   * would have been a silent redesign of the mode the couch defaults to.
   *
   * The distances are read off the running game rather than off the constants,
   * so a `spawnForSeat` that ignored its own spacing argument fails here.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const spacing = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const gap = () => {
      const a = game.snapshotFor(0).euc.position;
      const b = game.snapshotFor(1).euc.position;
      return Math.hypot(a.x - b.x, a.z - b.z);
    };
    const duel = gap();
    // Out to a free ride and back, through the control a player actually uses.
    game.setAppState('paused');
    game.switchCouchRide('freeRide');
    const free = { gap: gap(), state: game.snapshot().app.state };
    game.setAppState('paused');
    game.switchCouchRide('knockabout');
    return { duel, free, back: gap(), state: game.snapshot().app.state };
  });

  expect(spacing.state, 'the fixture never got back into the mode').toBe('knockabout');
  expect(spacing.duel, 'the host started the match holding the guest inside their arc')
    .toBeGreaterThan(REACH_METRES);
  expect(Math.abs(spacing.duel - DUEL_LATERAL_METRES)).toBeLessThan(0.05);
  expect(spacing.free.state).toBe('freeRide');
  expect(Math.abs(spacing.free.gap - SLOT_LATERAL_METRES), 'a free ride stopped being together')
    .toBeLessThan(0.05);
  expect(spacing.back, 'the second match forgot the spacing the first had')
    .toBeGreaterThan(REACH_METRES);
  expect(errors).toEqual([]);
});

test('the opening swing of a match reaches nobody, and used to reach the guest', async ({ page }) => {
  /*
   * **The arithmetic is in `spawnSlots.test.ts`; this is the thing the owner
   * actually did.** Nobody moves, seat 0 swings, and the question is whether
   * seat 1 is on the ground — through the production path, with the real
   * paddle, the real referee and the real placement.
   *
   * The second half is what makes it a test rather than a screenshot: the same
   * swing, from the same seat, at the spacing the game shipped on 2026-08-27,
   * *does* land. A spec that only proved the fixed case would pass just as well
   * if the paddle had stopped reaching anybody at all.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const swing = await page.evaluate((lateral) => {
    const game = window.game;
    game.loop.setRunning(false);

    /** Seat 0 swings from a standstill; nobody rides. */
    const openOn = (): { struck: boolean; knockdowns: readonly number[] } => {
      game.clearActions();
      game.setActionsFor(0, { swing: true });
      game.advance(1);
      game.clearActions();
      // The whole cycle, so a hit anywhere in the strike window is counted.
      game.advance(90);
      return {
        struck: game.snapshotFor(1).euc.crashCause === 'struck'
          || game.snapshotFor(1).euc.wobbleEnergy > 1e-6,
        knockdowns: game.snapshot().match.scores.map((score) => score.knockdowns),
      };
    };

    const apart = openOn();

    // Now stand the guest where the game used to put them — beside the host at
    // the free ride's own spacing, on the host's right, which is the placement
    // the owner played.
    const spawn = game.levelPlan.spawn;
    const heading = spawn.headingY;
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);
    const x = spawn.position.x + rightX * lateral;
    const z = spawn.position.z + rightZ * lateral;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z }, heading, 1);
    game.placeRider(spawn.position, heading, 0);
    const together = openOn();

    return { apart, together };
  }, SLOT_LATERAL_METRES);

  expect(swing.apart.struck, 'the host’s standing swing still reached the guest').toBe(false);
  expect(swing.apart.knockdowns, 'and it scored').toEqual([0, 0]);
  expect(swing.together.struck, 'the rig cannot see a strike at all, so it proves nothing')
    .toBe(true);
  expect(swing.together.knockdowns, 'the defect the owner reported no longer reproduces')
    .toEqual([1, 0]);
  expect(errors).toEqual([]);
});

test('the corner counts the discs under the score, in both halves', async ({ page }) => {
  /*
   * The owner's second item: *"No feedback on Targets Struck. The only screen
   * that shows targets struck in 2p mode knockabout is the final screen after
   * somebody wins. It should show in-game below the knockdowns scores."*
   *
   * Both halves, because q80's rule — this seat's number first — has to hold in
   * the new row or it holds in neither, and the two rows are read from opposite
   * ends of the same match on purpose.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const played = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // Credit each seat a different number of discs, straight through the
    // referee's own door, so the row has two distinguishable numbers in it.
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 5);
    return { total: game.snapshot().targets.total };
  });
  expect(played.total, 'the fixture world has no discs to count').toBeGreaterThan(0);

  // Discs are scored by swinging at them, and `fight` is the rig that already
  // does that through the production path — knockdowns and discs both.
  const scored = await fight(page, { swinger: 0, target: 5, rounds: 2 });
  expect(scored.phase, 'the match must still be running to have a HUD').toBe('running');

  await page.evaluate(() => {
    window.game.clearActions();
    window.game.loop.setRunning(true);
  });
  await page.waitForFunction(() => window.game.snapshotFor(1).hud.knockabout !== '');

  const halves = await page.evaluate(() => [0, 1].map((seat) => {
    const hud = window.game.snapshotFor(seat).hud;
    return { label: hud.modeSubLabel, value: hud.modeSub, lane: hud.knockabout };
  }));

  const total = played.total;
  expect(halves[0].label, 'the row has a number and no noun').toBe('Targets');
  expect(halves[1].label).toBe('Targets');
  expect(halves[0].value).toBe(`${scored.discs[0]} – ${scored.discs[1]} of ${total}`);
  expect(halves[1].value, 'the guest’s half read the host’s discs first')
    .toBe(`${scored.discs[1]} – ${scored.discs[0]} of ${total}`);

  // And it is drawn, rather than merely computed. The whole row is hidden in
  // every other ride, so "is it there" is a question about the element.
  const drawn = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '.euc-hud__score-aside',
  )].map((row) => ({ hidden: row.hidden, text: row.textContent?.trim() ?? '' })));
  expect(drawn.length, 'the split should carry one score corner per half').toBe(2);
  expect(drawn.every((row) => !row.hidden), 'the row was composed and never shown').toBe(true);
  expect(drawn[0].text).toContain('Targets');
  expect(errors).toEqual([]);
});

test('single player and the chase draw no second row in that corner', async ({ page }) => {
  /*
   * The other side of the row's gate, asked of the two modes that share the
   * corner. A single-player Knockabout's discs are already its headline and a
   * chase counts one clock; a second row in either would be furniture, and the
   * kind that arrives when a field is filled unconditionally.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}`);

  const rows = await page.evaluate(async () => {
    const game = window.game;
    const read = async () => {
      game.loop.setRunning(true);
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      const hud = game.snapshotFor(0).hud;
      const row = document.querySelector<HTMLElement>('.euc-hud__score-aside');
      return { lane: hud.knockabout, sub: hud.modeSub, hidden: row?.hidden ?? null };
    };
    game.startKnockabout();
    const solo = await read();
    game.startChase();
    const chase = await read();
    return { solo, chase };
  });

  expect(rows.solo.lane, 'the fixture is not in single-player Knockabout').toContain('/');
  expect(rows.solo.sub, 'single-player Knockabout grew a row it does not need').toBe('');
  expect(rows.solo.hidden).toBe(true);
  expect(rows.chase.sub).toBe('');
  expect(rows.chase.hidden).toBe(true);
  expect(errors).toEqual([]);
});

test('a finished match becomes a free ride without going back to the title', async ({ page }) => {
  /*
   * The owner's third item: *"the end screen after finishing knockabout
   * currently makes u return to main menu if u wanna switch modes (to
   * freeride); no good. need to add it there too."*
   *
   * **The same control as the pause menu's**, which is the whole design: a
   * player who learned to change mode from one card must not have to learn a
   * second one at the other. What differs is the label and what "press the one
   * already lit" means — a pause resumes, a finished match rides another.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const done = await fight(page, { swinger: 0, target: 2, rounds: 4 });
  expect(done.state, JSON.stringify(done)).toBe('results');

  const card = await page.evaluate(() => ({
    hidden: document.querySelector<HTMLElement>('[data-menu="results-couch"]')?.hidden ?? null,
    label: document.querySelector<HTMLElement>('#euc-results-mode-label')?.textContent ?? '',
    pressed: [...document.querySelectorAll<HTMLElement>(
      '.euc-menu--results [data-menu="switch-mode"]',
    )].map((button) => `${button.dataset.couchMode}:${button.getAttribute('aria-pressed')}`),
  }));
  expect(card.hidden, 'a couch results card is not offering the switch').toBe(false);
  expect(card.label, 'the card reports a session that is over as one in progress')
    .toBe('Play next');
  expect(card.pressed).toEqual(COUCH_RIDES.map((ride) => `${ride}:${ride === 'knockabout'}`));

  await page.locator(
    '.euc-menu--results [data-menu="switch-mode"][data-couch-mode="freeRide"]',
  ).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const free = await page.evaluate(async () => {
    const game = window.game;
    // A frame, so the HUD writes what the new ride resolved to.
    game.loop.setRunning(true);
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
    return {
      seats: game.seatCount,
      phase: game.snapshot().match.phase,
      paddles: game.snapshot().paddle.equipped,
      ride: game.snapshot().couch.ride,
      sub: game.snapshotFor(0).hud.modeSub,
      rows: [...document.querySelectorAll<HTMLElement>('.euc-hud__score-aside')]
        .map((row) => row.hidden),
    };
  });
  expect(free.seats, 'the switch sent the guest home').toBe(2);
  expect(free.phase, 'the referee was left running in a free ride').toBe('idle');
  expect(free.paddles, 'the paddles came with them into a free ride').toBe(false);
  expect(free.ride).toBe('freeRide');
  // **And the corner gives the row back.** This is the only path in the game
  // where the disc row has to be *taken down* rather than never put up — every
  // other ride starts without one — so it is the only place a HUD that writes
  // on change can be caught leaving a finished match's tally on screen.
  expect(free.sub, 'the free ride is still counting a match that is over').toBe('');
  expect(free.rows.length, 'the split should carry one score corner per half').toBe(2);
  expect(free.rows, 'the disc row survived the mode it belongs to').toEqual([true, true]);
  expect(errors).toEqual([]);
});

test('pressing the mode a finished match was already in rides another one', async ({ page }) => {
  /*
   * **"Carry on" means something different on each card, and the door is what
   * knows which.** From a pause it is Resume; from a results screen the ride is
   * over, so it is `Ride it again` — the same thing the card's own primary
   * button does. The alternative was refusing the press entirely, which is a
   * lit button that does nothing.
   */
  const errors = collectErrors(page);
  await bootDuel(page);

  const done = await fight(page, { swinger: 0, target: 2, rounds: 4 });
  expect(done.state, JSON.stringify(done)).toBe('results');

  await page.locator(
    '.euc-menu--results [data-menu="switch-mode"][data-couch-mode="knockabout"]',
  ).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const again = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match,
  }));
  expect(again.seats, 'the press sent the guest home').toBe(2);
  expect(again.match.phase, 'and started a run with no match in it').toBe('running');
  expect(again.match.scores.map((score) => score.knockdowns)).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('a single-player results card carries no couch control at all', async ({ page }) => {
  /*
   * `setResultsCouchRide(null)` is almost every results card in the game, and a
   * control drawn for a session that does not exist is one the pad's walk stops
   * on and one whose own handler will refuse it. Both halves are asked, exactly
   * as the pause menu's own spec asks them: the screen, and then the door.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${DUEL_SEED}`);

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.startKnockabout();
    game.setAppState('results');
    const before = { ...game.snapshotFor(0).euc.position };
    game.switchCouchRide('freeRide');
    return {
      seats: game.seatCount,
      hidden: document.querySelector<HTMLElement>('[data-menu="results-couch"]')?.hidden ?? null,
      state: game.snapshot().app.state,
      moved: Math.hypot(
        game.snapshotFor(0).euc.position.x - before.x,
        game.snapshotFor(0).euc.position.z - before.z,
      ),
    };
  });

  expect(solo.seats, 'the fixture is not single player').toBe(1);
  expect(solo.hidden, 'a single player was offered the couch’s mode switch').toBe(true);
  expect(solo.state, 'the door served a switch for a session that is not a couch')
    .toBe('results');
  expect(solo.moved, 'a refused switch reset the rider anyway').toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('the results card still reaches its own buttons with the chooser on it', async ({ page }) => {
  /*
   * **M23's lesson, one control later, on the one card that was never in a fit
   * contract.** The seventh title button clipped a heading in the browser
   * suite's own 1000 × 700 window with every spec green; the mode chooser is
   * 105 px of new furniture on a results card that was already the tallest
   * panel in the game, and it put `Back to title` below the fold at 1000 × 640
   * before the short-window tier existed.
   *
   * The card is in `game.css`'s scroll-by-design group and the promise here is
   * therefore not "it never scrolls" — it is **every control on it is reachable
   * without scrolling**, at every desktop window a couch is offered on. The
   * `slack` beside each size is the panel's own bottom padding hanging below the
   * fold once the content itself fits; the measurements as built are
   * 0/0/3/0/0/7/0, so a new row (twenty pixels at the very least) still fails
   * here rather than quietly pushing a button off the screen.
   */
  const errors = collectErrors(page);
  await bootDuel(page);
  const done = await fight(page, { swinger: 0, target: 1, rounds: 2 });
  expect(done.state, JSON.stringify(done)).toBe('results');

  const VIEWPORTS = [
    { width: 1000, height: 700, slack: 1 },   // the browser suite's own window
    { width: 1000, height: 640, slack: 1 },   // where the chooser first clipped
    { width: 1000, height: 560, slack: 8 },
    { width: 1000, height: 520, slack: 1 },
    { width: 1280, height: 720, slack: 1 },
    { width: 1600, height: 500, slack: 12 },  // short and wide, the worst shape
    { width: 1920, height: 1080, slack: 1 },
  ];

  const CONTROLS = [
    '[data-menu="results-couch"] [data-couch-mode="freeRide"]',
    '[data-menu="results-couch"] [data-couch-mode="knockabout"]',
    '[data-menu="retry"]',
    '[data-menu="new-route"]',
    '[data-menu="results-title"]',
  ];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i += 1) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      }
    });

    const overflow = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.euc-menu--results');
      if (root === null) throw new Error('no results panel');
      return root.scrollHeight - root.clientHeight;
    });
    expect(
      overflow,
      `the results card has ${overflow}px below the fold at ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(viewport.slack);

    for (const control of CONTROLS) {
      const box = await page.locator(`.euc-menu--results ${control}`).boundingBox();
      expect(box, `${control} has no box at ${viewport.width}x${viewport.height}`).not.toBeNull();
      if (box === null) continue;
      expect(box.y, `${control} starts above ${viewport.width}x${viewport.height}`)
        .toBeGreaterThanOrEqual(-0.5);
      expect(box.y + box.height, `${control} ends below ${viewport.width}x${viewport.height}`)
        .toBeLessThanOrEqual(viewport.height + 0.5);
    }
  }
  expect(errors).toEqual([]);
});

