/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { CONTACT } from '../src/data/tuning.ts';

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
          sinceCharge = 0;
        }
      } else if (sinceCharge >= 0) {
        sinceCharge += 1;
        if (sinceCharge === input.settle) closingAfter = closing;
      }
      previous = { first, second };
    }

    return {
      charges,
      minGap,
      endGap: gapOf(previous.first, previous.second),
      closingAtContact,
      closingAfter,
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

  const met = await approach(page, {
    gap: APPROACH_GAP_METRES,
    converge: CONVERGE_RADIANS,
    throttle: 0.6,
    steps: 420,
    facing: 'same',
  });

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
  expect(APPROACH_GAP_METRES - met.minGap).toBeGreaterThan(1);
  expect(met.closingAfter).toBeLessThan(0);

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
   * `ContactPair` is a **stateful** edge detector, and its rule is that leaving
   * the overlap clears the cooldown immediately so the next overlap is a new
   * contact. That rule is only true while somebody is calling it: a pair whose
   * session turned contact off, or whose second seat went home, keeps whatever
   * cooldown it was holding and silently swallows the first bump of the next
   * one. Both halves are checked here — the setting, which Phase 2 wires to a
   * toggle, and the guest, which the bridge can already do today.
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
const PAD_DPAD_LEFT = 14;
const PAD_DPAD_RIGHT = 15;

/** `[data-couch-contact]` — the one control this phase adds. */
const CONTACT_BOX = '.euc-menu--couch [data-couch-contact]';

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
async function bootToJoinPanel(page: import('@playwright/test').Page): Promise<void> {
  await bootToTitle(page);
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

test('the join panel’s toggle is the setting the couch ride obeys', async ({ page }) => {
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);

  const box = page.locator(CONTACT_BOX);
  // **q71: it ships on.** Contact is what players will ask for; the toggle is
  // for the room that wants to cruise.
  await expect(box).toBeChecked();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(true);

  await box.click();
  await expect(box).not.toBeChecked();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

  // **The order below is the pin, not an accident.** A real click leaves focus
  // on the box, and `input/keyboard.ts` used to read every focused `<input>` as
  // something the player was typing into — so the very next press, which is the
  // guest's Enter and the one press this whole screen exists to receive, was
  // dropped. Asserted rather than assumed: if a future change stops the click
  // taking focus, this spec must stop claiming to have tested it.
  await expect(box, 'the click left focus on the control').toBeFocused();

  // And the ride the panel hands over to obeys it. Both seats sit down and
  // Start is pressed, which is the whole journey between the control and the
  // fixed step — `resetSeats`, a state transition, and a redraw of this very
  // panel all happen in between, and none of them may quietly restore it.
  await seatBoth(page);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const riding = await page.evaluate(() => ({
    ...window.game.snapshot().contact,
    seats: window.game.seatCount,
  }));
  expect(riding.seats, 'two seats are riding').toBe(2);
  expect(riding.enabled, 'the room’s answer survived Start').toBe(false);
  // **`live` is the one the fixed step reads.** Two seats and a session that
  // said no is exactly the case the setting exists to produce, and asserting
  // the flag alone would not prove the step had been told.
  expect(riding.live, 'and the step is not resolving a pair').toBe(false);

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
   * **Do not "fix" this spec by making the setting stick.** §26.3 and §26.10
   * both close the question, and this is the line they are talking about.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  const box = page.locator(CONTACT_BOX);
  await box.click();
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
  await expect(box, 'the box the next room sees').toBeChecked();
  expect(
    await page.evaluate(() => window.game.snapshot().contact.enabled),
    'and the setting behind it',
  ).toBe(true);

  expect(errors).toEqual([]);
});

test('the contact toggle never reaches the saved options record', async ({ page }) => {
  /*
   * **Invariant 5, at the one screen that could break it.** A contact on/off
   * setting is a *physical* quantity, and "no option is a physical quantity, so
   * the ride is identical for every player" is the rule that keeps
   * `GameOptions` out of `simulation/`. The resolution §26.3 chose is the one
   * `Game.paddleEquipped` already uses — the session decides — so this control
   * must leave the player's saved record exactly as it found it.
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

  await page.locator(CONTACT_BOX).click();
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

test('a pad walks the join panel through the toggle, and presses it', async ({ page }) => {
  /*
   * **A layout change is an input change on a gamepad** — DESIGN.md §9g, and
   * §26.6 Phase 2 asks for this before Phase 5 grows the panel again.
   * `ui/menus.ts` walks real rectangles through `ui/menuRows.ts`, so a new row
   * is a new stop whether anybody wrote one down or not.
   *
   * **The panel had no walk spec at all before this one.** M25 Phase 5 shipped
   * it with the pad's claim, its B, and its cursor all pinned, and never the
   * stops themselves — so the plan's expectation that the existing ones would
   * fail and be rewritten had nothing to fail. This is that spec, written a
   * milestone late, and it names the geometry rather than the DOM order: the
   * four rider arrows are one visual row because the two cards sit side by
   * side, and the actions are one column because `.euc-menu__actions` is only
   * multi-column on the title and the pause card.
   */
  const errors = collectErrors(page);
  await onePad(page);
  await bootToJoinPanel(page);

  // Both seats first, for two reasons: a pad holding no seat has its confirm
  // read as a claim, and Start is `disabled` — which `focusableSelector`
  // excludes — until the panel is armed, so an empty panel has a shorter walk
  // than a full one.
  await seatBoth(page);

  const box = page.locator(CONTACT_BOX);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      '[data-couch-seat="0"] [data-menu="couch-prev"]',
    )?.focus();
  });

  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(box, 'down from the rider arrows reaches the toggle').toBeFocused();
  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(
    page.locator('.euc-menu--couch [data-menu="couch-start"]'),
    'and down again reaches Start, not Back',
  ).toBeFocused();
  await pulsePad(page, PAD_DPAD_DOWN);
  await expect(page.locator('.euc-menu--couch [data-menu="couch-back"]')).toBeFocused();

  // **A on the box presses it.** M24's §4.6 report was that the pad's action
  // button did nothing on the settings dropdowns, and `Menus.confirm` is where
  // that was answered per control kind — a checkbox goes through the default
  // click action, which is the one path that both toggles it and fires `input`.
  await box.focus();
  await pulsePad(page, PAD_A);
  await expect(box).not.toBeChecked();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);
  await pulsePad(page, PAD_A);
  await expect(box, 'a toggle, not a one-way switch').toBeChecked();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(true);

  // And the d-pad's own axis *sets* rather than toggles — `adjustControl`'s
  // rule, which is right for a direction: pressing Left twice must not turn
  // contact back on.
  await pulsePad(page, PAD_DPAD_LEFT);
  await pulsePad(page, PAD_DPAD_LEFT);
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);
  await pulsePad(page, PAD_DPAD_RIGHT);
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(true);

  // **And the keyboard's Space still presses it** — the other half of the
  // per-key rule in `input/keyboard.ts`. A checkbox owns exactly `Space` and
  // nothing else, so this layer must let that one key through to the browser
  // while keeping Enter for itself. Asserted here because the first attempt at
  // that fix exempted the checkbox outright, which sent Space to the binding
  // tables — where it is `hop`, and where `ALWAYS_SUPPRESSED` calls
  // `preventDefault` on it, leaving the box unpressable by keyboard.
  //
  // The keyboard holds seat 1 by now, which is what lifts the panel's own
  // claim-press suppression; while it holds no seat, Space and Enter are both
  // a person sitting down and neither reaches a control.
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box, 'Space belongs to the checkbox').not.toBeChecked();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

  expect(errors).toEqual([]);
});

test('the join panel still carries exactly one control that holds a value', async ({ page }) => {
  /*
   * **A census, in `paddle.test.ts`'s sense, and it exists to fail at Phase 5.**
   *
   * `Menus.onCouchInput` listens on the panel root and routes what it hears to
   * `onSetCouchContact`. Its `data-couch-contact` guard is what stops a
   * *second* value-carrying control — q78's mode choice, which §26.6 Phase 5
   * puts on this very panel — from arriving at the contact setter. That guard
   * cannot be mutation-checked while the panel has one such control, because
   * there is nothing else for it to refuse.
   *
   * So the fact it depends on is asserted instead. When Phase 5 adds the mode
   * choice this test fails, and the person adding it has to decide what the
   * handler does with the new control rather than discovering it by watching
   * contact turn itself off.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  const controls = await page.evaluate(() => {
    const panel = document.querySelector('.euc-menu--couch');
    if (panel === null) throw new Error('no join panel');
    return [...panel.querySelectorAll('input, select, textarea')].map((node) => ({
      tag: node.tagName,
      hooks: Object.keys((node as HTMLElement).dataset),
    }));
  });

  expect(controls).toEqual([{ tag: 'INPUT', hooks: ['couchContact'] }]);
  expect(errors).toEqual([]);
});

test('a non-contact control on the panel is not read as the contact toggle', async ({ page }) => {
  /*
   * **The `data-couch-contact` guard, made load-bearing today** — from Codex's
   * Phase 2 QA, and the point is fair as stated: the census above anticipates
   * Phase 5 but does not make deleting the guard fail *now*, so "every new
   * guard was mutation-checked" was not literally true of that one.
   *
   * `Menus.onCouchInput` listens on the panel root and routes what it hears to
   * `onSetCouchContact`. It refuses on two counts — the event's target must be
   * an `<input>`, and it must carry `data-couch-contact` — and each is checked
   * here with a control that fails exactly one of them. Both are synthetic
   * because the panel has one value-carrying control today; that is the whole
   * reason the guard needed a stand-in rather than a real sibling.
   *
   * Directional rather than merely "unchanged": contact is turned **off**
   * first and the synthetic events all say `checked = true`, so a handler that
   * had lost either guard would turn it back on and be caught, instead of
   * writing the value it already held.
   */
  const errors = collectErrors(page);
  await bootToJoinPanel(page);

  await page.locator(CONTACT_BOX).click();
  expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

  const after = await page.evaluate(() => {
    const panel = document.querySelector('.euc-menu--couch .euc-couch');
    if (panel === null) throw new Error('no join panel');
    const fire = (node: Element) => {
      panel.appendChild(node);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.remove();
    };

    // An `<input>` the handler must not recognise — Phase 5's mode choice, in
    // the shape it would arrive in if it were a checkbox.
    const stranger = document.createElement('input');
    stranger.type = 'checkbox';
    stranger.dataset.couchMode = '';
    stranger.checked = true;
    fire(stranger);
    const afterStranger = window.game.snapshot().contact.enabled;

    // And the hook on something that is not an `<input>` at all, which is the
    // other half of the refusal: `target.checked` does not exist on a select,
    // so a handler that trusted the attribute alone would write `undefined`.
    const wrongKind = document.createElement('select');
    wrongKind.dataset.couchContact = '';
    fire(wrongKind);
    const afterWrongKind = window.game.snapshot().contact.enabled;

    return { afterStranger, afterWrongKind, left: panel.querySelectorAll('input, select').length };
  });

  expect(after.afterStranger, 'another control’s input was read as contact').toBe(false);
  expect(after.afterWrongKind, 'the hook alone was enough to write the setting').toBe(false);
  expect(after.left, 'the synthetic controls were cleaned up').toBe(1);
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
    await page.locator(CONTACT_BOX).tap();
    expect(await page.evaluate(() => window.game.snapshot().contact.enabled)).toBe(false);

    expect(errors).toEqual([]);
  });
});
