/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { CHASE, PADDLE } from '../src/data/tuning.ts';
import { groupSeparation } from '../src/simulation/groupSpawn.ts';
import { Paddle } from '../src/simulation/paddle.ts';
import { KNOCKABOUT_RECORDS_KEY } from '../src/app/knockaboutRecords.ts';
import { STORAGE_PREFIX } from '../src/platform/storage.ts';

/**
 * M37 — Knockabout for three and four, in a real browser (`docs/PLANS.md` §37).
 *
 * **Phase 3 Stage A: the combat pipeline at N** (§37.3). Everything here is
 * about the fixed step with three or four riders in it, which is the only place
 * the milestone's arithmetic can be observed end to end:
 * `simulation/strikeBatch.ts` is unit-tested where it lives and knows nothing
 * about seats, paddles or controllers; `EucController.hardKnock` is unit-tested
 * where it lives and knows nothing about who swung; and the addressing that
 * joins them — one volume id per seat, one latch entry per victim, one batch
 * resolved after every seat has moved — exists only in `app/Game.ts`.
 *
 * What these specs hold that nothing else can:
 *
 *   1. **Every directed pair can score**, both ways round, at three seats and
 *      at four. Phase 0 recorded that removing the two q94 specs left *no*
 *      coverage of the N≥3 strike path at all, so this is the first thing
 *      written rather than an extra.
 *   2. **The physical knockdown as well as the tally.** Every fixture asserts
 *      the victim actually fell — `crashCause === 'struck'`, or the round's own
 *      crash count where a respawn has since cleared the cause — because a
 *      referee handed a fact nothing physical happened for is the exact defect
 *      §37.8 item 3 asks to rule out. The two fixtures that read the tally
 *      alone were found by the Phase 5 review and repaired: a mutation that
 *      credits without calling `hardKnock` leaves every tally, winner and place
 *      in this file untouched.
 *   3. **q173's shared-victim case, by the numbers the owner was shown** —
 *      5/3/5/1, a draw between seats 0 and 2, places 1/3/1/4 — plus the immune
 *      variant, in the real step rather than in the resolver's arithmetic.
 *   4. **Teleport hygiene per participant**: either end of an exchange resetting
 *      voids that exchange, and an unrelated seat resetting no longer voids
 *      anybody else's.
 *
 * **Phase 3 Stage B — the doors, the group start and the countdown** (§37.2,
 * §37.4) is appended at the end of this file, under its own banner.
 *
 * **The pads are synthetic and are automated evidence, not a device** (§37.8).
 * `fakePads` replaces `navigator.getGamepads` in an init script, so the claims,
 * the router and the join panel are the production ones; nothing here is a test
 * double of a layer. The room is filled through the real join panel for the
 * reason AGENTS.md's M27 Phase 5 lesson gives — a bridge reaches a *state*
 * without walking the *path*. Stage A's own fixtures then arm the fight through
 * the QA bridge because the doors were Stage B's; Stage B's fixtures press the
 * real controls.
 *
 * Nothing here reads a frame interval (`AGENTS.md`), and every fixture drives
 * `advance(1)` a step at a time: a strike edge is one step, and `advance(30)`
 * samples the aftermath of an unknown number of events.
 */

/** The seed m14, m18 and m26 all pin, because it carries a real route. */
const BRAWL_SEED = 'route-41';

/**
 * Where a parked forehand actually arrives, in the swinger's own frame, metres.
 *
 * m26's duel offsets exactly (`DUEL_RIGHT_METRES` 1.15, and 0.35 up the road),
 * which is inside `PADDLE.reach` and outside `CONTACT.radiusMetres`: the paddle
 * reaches somebody the bodies never touch, so nothing below can be a contact
 * wearing a strike's clothes. Dead abeam is behind the end of the arc and lands
 * nothing, which is M26 Phase 3's own G7 lesson.
 */
const TAP_ACROSS_METRES = 1.15;
const TAP_ALONG_METRES = 0.35;

/**
 * How far apart the two attackers of one victim stand, metres — q173's case.
 *
 * Not chosen: it falls out of the geometry. Every rider with the victim in
 * their forehand sits on a circle of radius `hypot(1.15, 0.35)` = 1.202 m
 * around them, so two attackers facing opposite ways are 2.404 m apart — which
 * is more than `Paddle.reachAgainst(CHASE.riderHitRadius)` = 2.15 m, and that
 * is what keeps the pair from resolving *each other* while the spec is
 * watching the victim they share.
 */
const SHARED_ATTACKER_GAP_METRES = 2 * Math.hypot(TAP_ACROSS_METRES, TAP_ALONG_METRES);

/** The furthest a parked swing can put anybody down, metres — read off the weapon. */
const REACH_METRES = new Paddle().reachAgainst(CHASE.riderHitRadius);

/**
 * Where the fight happens, metres up the road from the plan's spawn.
 *
 * m26's own runway: far enough that nobody is standing on the start, and known
 * good ground on this seed because two other spec files park riders there.
 */
const ARENA_ALONG_METRES = 30;

/**
 * Every fixture in this file is a slow one — the Phase 5 repair pass.
 *
 * **Why the whole file and not two of its tests.** Almost nothing here is a
 * single page: a fixture boots a generated world through the join panel, fills
 * three or four chairs, rides out a countdown and then drives hundreds of fixed
 * steps with four riders and four viewports in them, and several boot twice
 * because a decided match refuses everything after it. Alone that costs between
 * 6 s and 30 s a test. On the machine this milestone's QA ran on — load average
 * 53 to 83, five agents and a full browser suite at once — the same tests cost
 * 1 to 2.3 minutes, and two of them ran out of the 120 s budget while measuring
 * nothing about the game: *"seat 0 pressing R"* (28.5 s alone) and the 4-seat
 * pane-fit fixture (19.4 s alone) simply did not finish.
 *
 * Splitting their long `page.evaluate` calls would not have helped — the budget
 * is per *test*, and the same work spread over more round trips costs strictly
 * more. `test.slow()` is what this suite already does with its expensive
 * fixtures (`m36_2`, `m36_5`, `m23`, `touch`): it triples the budget to 360 s,
 * which turns a 6x slowdown tolerance into an 18x one. It does not paper over a
 * hang — a game that refuses to boot still fails on the harness's own 90 s wait
 * for `window.game`, which is the failure the config's note points at.
 *
 * The three genuinely wall-clock-*sensitive* specs the same review found were
 * repaired rather than given more time: they are the ones whose assertions read
 * a live clock across a protocol round trip, and they now freeze the loop in the
 * same task that presses the control.
 */
test.beforeEach(() => {
  test.slow();
});

// ---------------------------------------------------------------------------
// Pads and the join panel — m25's, m27's and m36_5's recipes, unchanged.
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

/** Press and release A on one pad, a real frame apart. */
async function claimWithPad(page: Page, index: number, button = 0): Promise<void> {
  await page.evaluate(async ({ at, button: which }) => {
    type Pads = { buttons: { pressed: boolean; value: number }[] }[];
    const pad = (window as unknown as { fakePads: Pads }).fakePads[at];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[which].pressed = true;
    pad.buttons[which].value = 1;
    await frame();
    pad.buttons[which].pressed = false;
    pad.buttons[which].value = 0;
    await frame();
  }, { at: index, button });
}

/**
 * A room of `seats` people sitting down on the real join panel, on a world that
 * carries discs.
 *
 * m36_5's `sitDown` with a boot query, and the order is the panel's own rather
 * than a preference: it opens with two chairs and puts another out only once
 * every chair already out is claimed, so pads first and the keyboard last fills
 * a room of any width up to `COUCH_SEATS`.
 */
async function sitDown(page: Page, seats: number, query: string): Promise<void> {
  await fakePads(page, seats - 1);
  await bootToTitle(page, query);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  // The priming frames m25 requires: a button already down when the panel
  // appeared must claim nothing.
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
  for (let pad = 0; pad < seats - 1; pad += 1) {
    await claimWithPad(page, pad);
    await page.waitForFunction(
      (index) => window.game.snapshot().input.devices[index] === `pad:${index}`,
      pad,
    );
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (last) => window.game.snapshot().input.devices[last] === 'keyboard',
    seats - 1,
  );
}

/**
 * Three or four people on the couch, in a running Knockabout match.
 *
 * **The room is filled the way players fill it** — title → 2–4 Players →
 * claims — and the *fight* is then armed through the QA bridge, from the panel
 * the claims were made on. That split was deliberate for this stage: Stage A
 * owned the combat pipeline and Stage B the doors, and `startKnockabout` has
 * never been seat-gated, so the bridge reached an N-seat match without
 * borrowing a control that did not exist yet. Stage B's own specs, at the end
 * of this file, press the panel's Knockabout button instead — these fixtures
 * keep the bridge so that a door regression fails the doors' specs rather
 * than every combat spec at once.
 *
 * **From the join panel, because that is where the transition is legal.**
 * `couchJoin` lists `knockabout` among its successors and a running free ride
 * does not — a mode armed from a ride is a transition no player can make
 * (`app/appState.ts`) — so this is `startCouch`'s own journey with its mode
 * branch taken by hand: end the claiming window, then the entrance.
 *
 * **The count is ridden out, not skipped.** Three and four arm with
 * `KNOCKABOUT.countdownSeconds` (§37.4, q170) and the referee refuses every
 * knockdown and disc while it runs, so a fixture that started swinging
 * immediately would measure the hold rather than the fight. The freeze of
 * *input* during that hold is Stage B's; nothing here depends on it, because
 * every round places its riders before it swings — and since Stage B the hold
 * really does freeze the room, so riding it out is also the cheapest way to
 * reach a fight that has started.
 */
async function bootBrawl(page: Page, seats: number): Promise<void> {
  await sitDown(page, seats, `level=generated&seed=${BRAWL_SEED}`);
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // `startCouch`'s first act, and the reason the room is fixed for the bout:
    // the claiming window shuts, so nobody becomes a combatant mid-fight.
    game.endClaiming();
    game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    for (let step = 0; step < 1200 && game.snapshot().match.phase === 'countdown'; step += 1) {
      game.advance(1);
    }
  });
  expect(
    await page.evaluate(() => window.game.snapshot().match.phase),
    'the bout never reached its running phase, so nothing below is a fight',
  ).toBe('running');
  expect(await page.evaluate(() => window.game.seatCount)).toBe(seats);
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

/** Where one rider stands for a round, in the frame named by the round. */
interface Stand {
  readonly seat: number;
  /** Up the frame's heading, metres. */
  readonly along: number;
  /** To the frame's right, metres. */
  readonly across: number;
  /** Turned off the frame's heading, radians. */
  readonly turn?: number;
}

interface Round {
  /** Who is put where. Seats left out keep the pose they already had. */
  readonly place: readonly Stand[];
  /** Who asks for a swing on the round's first step. */
  readonly swing: readonly number[];
  readonly steps: number;
  /**
   * Whose frame `place` is measured in. Omitted means the level's own spawn,
   * which is what makes a round reproducible; a seat means "relative to where
   * that rider is standing now", which is the only way to arrange a fight
   * around somebody who must not be re-placed (a teleport clears the recovery
   * window this file needs in one case).
   */
  readonly anchor?: number;
  /** Advance until this seat is back on their wheel, before placing anybody. */
  readonly standUp?: number;
  /** Press `R` for one seat on one step of this round — the real one-shot. */
  readonly resetAt?: readonly { readonly seat: number; readonly step: number }[];
  /**
   * Who asks for a swing on a *later* step than the round's first.
   *
   * `swing` is the round's opening volley and every seat in it swings on step
   * 0; this staggers a second attacker by a known number of steps, which is
   * the only way to put two identical taps on two consecutive landing steps
   * on purpose. Used by the seat-0 respawn regression, where the whole point
   * is that a decision taken one tick late collects a knockdown that did not
   * belong to it.
   */
  readonly swingAt?: readonly { readonly seat: number; readonly step: number }[];
  /**
   * Record the referee's phase after every step of this round.
   *
   * Opt-in because it is a whole `snapshot()` per step — the HUD model built
   * and thrown away — and only the "which step did the match end on" question
   * needs it. Everything else reads the tallies before and after the round.
   */
  readonly watchPhase?: boolean;
}

/** What one round did, read from the referee and from every rider. */
interface RoundReport {
  /** Knockdowns after the round, per seat. */
  readonly knockdowns: readonly number[];
  /** What each seat gained during it — the round's own credit. */
  readonly gained: readonly number[];
  /** The step each seat first went down on, or −1. Same step means same step. */
  readonly downAt: readonly number[];
  readonly causes: readonly string[];
  /** Crashes gained during the round, so a fall cannot be confused with a re-place. */
  readonly crashes: readonly number[];
  /** The most wobble any seat carried after the first step — a shove that landed. */
  readonly wobble: readonly number[];
  /** Recovery immunity each seat carried when the round began, seconds. */
  readonly immune: readonly number[];
  /** How far each seat moved during the round — a respawn is tens of metres. */
  readonly moved: readonly number[];
  readonly phase: string;
  /**
   * The referee's phase after each step, when the round asked for it; empty
   * otherwise. `phaseAt[n] === 'ended'` names the step the match was decided
   * on, which is a different fact from the tallies it was decided from.
   */
  readonly phaseAt: readonly string[];
}

interface BrawlReport {
  readonly rounds: readonly RoundReport[];
  readonly match: {
    readonly phase: string;
    readonly winner: number | null;
    readonly knockdowns: readonly number[];
    readonly discs: readonly number[];
    readonly places: readonly number[];
    readonly leaders: readonly number[];
    readonly target: number;
  };
  readonly state: string;
  readonly seats: number;
}

/**
 * Run a scripted fight and report what the step actually did.
 *
 * One `page.evaluate` for the whole script (the harness's round-trip rule), one
 * `advance(1)` per step (a strike edge is a single step), and the press is
 * released on the round's second step exactly as m26's `resetUnderStrike` does
 * — the one-shot is claimed once, and a level left held would be a second press
 * waiting for the next legal step.
 *
 * Placements are the level's own spawn frame by default and never seat 0's live
 * pose: a second call would otherwise measure from the frame the first call
 * left the rider rotated into, and reproducibility would fail for a reason that
 * has nothing to do with the fight (m26's own note).
 */
async function brawl(
  page: Page,
  options: { readonly target?: number; readonly rounds: readonly Round[] },
): Promise<BrawlReport> {
  return page.evaluate((input) => {
    const game = window.game;
    game.loop.setRunning(false);
    if (input.target !== undefined) {
      // The slider, not a constant: moving it proves it reaches the referee
      // (m26's own rule, and §37.3's "moving `matchKnockdowns` must change the
      // result, not merely the HUD").
      game.tuning.set('KNOCKABOUT.matchKnockdowns', input.target);
    }

    const seats = game.seatCount;
    const all = Array.from({ length: seats }, (_unused, seat) => seat);
    const spawn = game.levelPlan.spawn;

    const read = (seat: number) => game.snapshotFor(seat).euc;
    const reports: RoundReport[] = [];

    for (const round of input.rounds) {
      game.clearActions();
      if (round.standUp !== undefined) {
        for (let step = 0; step < 900 && read(round.standUp).crashed; step += 1) game.advance(1);
      }

      const heading = round.anchor === undefined ? spawn.headingY : read(round.anchor).headingY;
      const origin = round.anchor === undefined
        ? { x: spawn.position.x, z: spawn.position.z }
        : { x: read(round.anchor).position.x, z: read(round.anchor).position.z };
      const forwardX = Math.sin(heading);
      const forwardZ = Math.cos(heading);
      const rightX = -Math.cos(heading);
      const rightZ = Math.sin(heading);

      for (const stand of round.place) {
        const x = origin.x + forwardX * stand.along + rightX * stand.across;
        const z = origin.z + forwardZ * stand.along + rightZ * stand.across;
        const ground = game.sampleGround(x, z);
        game.placeRider({ x, y: ground.height, z }, heading + (stand.turn ?? 0), stand.seat);
      }

      const before = game.snapshot().match.scores.map((score) => score.knockdowns);
      const crashesBefore = all.map((seat) => read(seat).crashes);
      const immune = all.map((seat) => read(seat).invulnerable);
      const from = all.map((seat) => ({ x: read(seat).position.x, z: read(seat).position.z }));
      const downAt = all.map(() => -1);
      const wobble = all.map(() => 0);
      const phaseAt: string[] = [];

      for (const seat of round.swing) game.setActionsFor(seat, { swing: true });

      for (let step = 0; step < round.steps; step += 1) {
        if (step === 1) game.clearActions();
        // After the blanket clear, so a stagger asked for on step 1 survives
        // it; released on the step after it was pressed, exactly as the
        // opening volley is.
        for (const ask of round.swingAt ?? []) {
          if (ask.step === step) game.setActionsFor(ask.seat, { swing: true });
        }
        for (const press of round.resetAt ?? []) {
          if (press.step === step) game.setActionsFor(press.seat, { reset: true });
        }
        game.advance(1);
        for (const ask of round.swingAt ?? []) {
          if (ask.step === step) game.setActionsFor(ask.seat, {});
        }
        for (const press of round.resetAt ?? []) {
          if (press.step === step) game.setActionsFor(press.seat, {});
        }
        if (round.watchPhase === true) phaseAt.push(game.snapshot().match.phase);
        for (const seat of all) {
          const euc = read(seat);
          if (downAt[seat] < 0 && euc.crashed) downAt[seat] = step;
          if (step > 0 && euc.wobbleEnergy > wobble[seat]) wobble[seat] = euc.wobbleEnergy;
        }
      }

      const after = game.snapshot().match.scores.map((score) => score.knockdowns);
      reports.push({
        knockdowns: after,
        gained: after.map((count, seat) => count - (before[seat] ?? 0)),
        downAt,
        causes: all.map((seat) => read(seat).crashCause),
        crashes: all.map((seat) => read(seat).crashes - crashesBefore[seat]),
        wobble,
        immune,
        moved: all.map((seat) => Math.hypot(
          read(seat).position.x - from[seat].x,
          read(seat).position.z - from[seat].z,
        )),
        phase: game.snapshot().match.phase,
        phaseAt,
      });
    }

    game.clearActions();
    // **Let a finished bout reach its own screen**, once, after every round —
    // m26's `fight` does the same, and for the same reason: the card waits out
    // `CHALLENGE.resultsDelaySeconds`, so the screen a match arrives at is part
    // of what this reports rather than a separate question. Only at the end, so
    // a script that deliberately swings *during* the delay still gets its
    // rounds run in `knockabout`.
    for (
      let step = 0;
      step < 900
        && game.snapshot().match.phase === 'ended'
        && game.snapshot().app.state === 'knockabout';
      step += 1
    ) {
      game.advance(1);
    }

    const match = game.snapshot().match;
    return {
      rounds: reports,
      match: {
        phase: match.phase,
        winner: match.winner,
        knockdowns: match.scores.map((score) => score.knockdowns),
        discs: match.scores.map((score) => score.discs),
        places: match.places,
        leaders: match.leaders,
        target: match.target,
      },
      state: game.snapshot().app.state,
      seats,
    };
  }, options);
}

/** Park everybody who is not in this fight well out of anybody's reach. */
function bystanders(seats: number, fighting: readonly number[]): Stand[] {
  const out: Stand[] = [];
  for (let seat = 0; seat < seats; seat += 1) {
    if (fighting.includes(seat)) continue;
    // Up the road but well short of the arena: at least sixteen metres from the
    // fight and spread so they cannot bump each other either.
    //
    // **Not on the spawn**, which is where `R` would put them: a spec that asks
    // whether an unrelated rider actually respawned needs their reset to move
    // them somewhere, and a bystander parked on their own spawn slot moves by
    // nothing at all when they press it.
    out.push({ seat, along: 12, across: (out.length - 1) * 3 });
  }
  return out;
}

/** One rider parked with another in their forehand — m26's standing tap, at N. */
function tap(attacker: number, victim: number, seats: number): Round {
  return {
    place: [
      { seat: attacker, along: ARENA_ALONG_METRES, across: 0 },
      {
        seat: victim,
        along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
        across: TAP_ACROSS_METRES,
      },
      ...bystanders(seats, [attacker, victim]),
    ],
    swing: [attacker],
    steps: 90,
  };
}

// ---------------------------------------------------------------------------
// 1. Every directed pair, both ways round
// ---------------------------------------------------------------------------

for (const seats of [3, 4] as const) {
  test(`every one of ${seats * (seats - 1)} directed pairs can score at ${seats} seats`, async ({
    page,
  }) => {
    /*
     * **The first thing this milestone owes.** Phase 0's census found that the
     * only coverage of "a third seat cannot strike" was the pair of q94 specs
     * that demote the ride, so deleting them leaves nothing at all guarding a
     * regression where an N-way strike silently does nothing — which is exactly
     * what the shipped code did: `strikeableOpponent` returned null unless the
     * room was two people wide, and the single shared quarry could not have
     * carried a third rider even if it had not.
     *
     * Every ordered pair, because the addressing is directional: seat 2 hitting
     * seat 0 is a different id, a different latch entry and a different batch
     * record from seat 0 hitting seat 2. The physical fall is asserted beside
     * the tally in every round, so a referee handed a fact nothing happened for
     * cannot pass this.
     */
    const errors = collectErrors(page);
    await bootBrawl(page, seats);

    const pairs: { attacker: number; victim: number }[] = [];
    for (let attacker = 0; attacker < seats; attacker += 1) {
      for (let victim = 0; victim < seats; victim += 1) {
        if (attacker !== victim) pairs.push({ attacker, victim });
      }
    }

    // The match must outlive every pair, so the target is set past the number
    // of knockdowns the script hands out.
    const fought = await brawl(page, {
      target: pairs.length + 1,
      rounds: pairs.map((pair) => tap(pair.attacker, pair.victim, seats)),
    });

    expect(fought.rounds).toHaveLength(pairs.length);
    for (const [index, pair] of pairs.entries()) {
      const round = fought.rounds[index];
      const label = `${pair.attacker} → ${pair.victim}: ${JSON.stringify(round)}`;
      expect(round.causes[pair.victim], label).toBe('struck');
      expect(round.crashes[pair.victim], label).toBe(1);
      expect(round.gained[pair.attacker], label).toBe(1);
      // Nobody else fell and nobody else scored — the arc found the rider it
      // was addressed at and not the room.
      expect(round.gained.reduce((sum, count) => sum + count, 0), label).toBe(1);
      expect(round.crashes.reduce((sum, count) => sum + count, 0), label).toBe(1);
    }

    expect(fought.match.phase, JSON.stringify(fought.match)).toBe('running');
    expect(fought.match.knockdowns.reduce((sum, count) => sum + count, 0)).toBe(pairs.length);
    // Every seat scored the same number of times, which is what "both ways
    // round" means when it is counted rather than asserted pair by pair.
    for (const count of fought.match.knockdowns) expect(count).toBe(seats - 1);
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// 2. Two riders exchanging on one step, and the third one out of it
// ---------------------------------------------------------------------------

test('two riders down each other on the same step and both score, with a third watching', async ({
  page,
}) => {
  /*
   * M26's mutual knockdown at three seats. The exchange is the case that made
   * `spendRiderStrikes` exist — a crash spent inside the seat loop cancels the
   * other rider's in-flight swing — and the batch must keep it true now that
   * the crash is applied from a resolved plan rather than in loop order.
   *
   * The geometry is symmetric and the symmetry is exact: each rider sits in the
   * other's forehand, because a heading turned through π turns its right vector
   * with it. The third seat stands where neither can reach.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const fought = await brawl(page, {
    target: 5,
    rounds: [{
      place: [
        { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
        {
          seat: 1,
          along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
          across: TAP_ACROSS_METRES,
          turn: Math.PI,
        },
        ...bystanders(3, [0, 1]),
      ],
      swing: [0, 1],
      steps: 90,
    }],
  });

  const round = fought.rounds[0];
  const label = JSON.stringify(round);
  expect(round.causes.slice(0, 2), label).toEqual(['struck', 'struck']);
  expect(round.crashes, 'one exchange, one fall each, and nobody else').toEqual([1, 1, 0]);
  expect(round.downAt[0], 'they went down on different steps').toBe(round.downAt[1]);
  expect(round.gained, 'both facts reached the referee').toEqual([1, 1, 0]);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. One swing, two victims — q171
// ---------------------------------------------------------------------------

test('one swing that downs two riders earns two, on one step and across a swing', async ({
  page,
}) => {
  /*
   * **q171, and the reason the swing latch had to grow an index.** It was one
   * number per seat — "this swing has already landed" — so the first rider a
   * sweep reached consumed it and every other rider the same arc passed
   * through, on that step or later in the same active window, was skipped in
   * silence. One entry per victim is what makes both halves below possible.
   *
   * **Two geometries, because they are two different claims.** Radially, two
   * riders straddle the arc at the same bearing and are swept in one step —
   * 0.90 m apart, which is outside `CONTACT.radiusMetres` (0.80), so neither is
   * bumping the other. Angularly, one rider stands early in the arc and one
   * late, so the same swing reaches them several steps apart and the second hit
   * is the one an unindexed latch would have thrown away.
   *
   * **Watched failing**: with the latch keyed at `[0]` instead of `[victim]` —
   * the scalar this replaced — this test fails on both halves (the second
   * victim of each swing is never recorded). A test nobody has seen fail is a
   * test nobody has checked.
   *
   * The arc's own numbers: the head hangs `PADDLE.pivotOffset` to the wielder's
   * right and sweeps `PADDLE.sweepRadians` from `PADDLE.startAngle`, so the
   * positions below are `pivot + radius · (cos θ, −sin θ)` in the swinger's
   * (along, across-right) frame. Anything within `headRadius + riderHitRadius`
   * of the swept segment is a hit.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  // Abeam: the middle of the sweep, where the head is furthest to the right.
  const abeam = -Math.PI / 2;
  const alongOf = (radius: number) => Math.cos(abeam) * radius;
  const acrossOf = (radius: number) => PADDLE.pivotOffset - Math.sin(abeam) * radius;
  const straddle = 0.45;

  const fought = await brawl(page, {
    target: 9,
    rounds: [
      {
        place: [
          { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
          {
            seat: 1,
            along: ARENA_ALONG_METRES + alongOf(PADDLE.reach - straddle),
            across: acrossOf(PADDLE.reach - straddle),
          },
          {
            seat: 2,
            along: ARENA_ALONG_METRES + alongOf(PADDLE.reach + straddle),
            across: acrossOf(PADDLE.reach + straddle),
          },
        ],
        swing: [0],
        steps: 120,
      },
      {
        // Early in the arc and late in it: the same swing, steps apart.
        place: [
          { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
          {
            seat: 1,
            along: ARENA_ALONG_METRES + Math.cos(-2.0) * PADDLE.reach,
            across: PADDLE.pivotOffset - Math.sin(-2.0) * PADDLE.reach,
          },
          {
            seat: 2,
            along: ARENA_ALONG_METRES + Math.cos(-0.1) * PADDLE.reach,
            across: PADDLE.pivotOffset - Math.sin(-0.1) * PADDLE.reach,
          },
        ],
        swing: [0],
        steps: 120,
      },
    ],
  });

  const together = fought.rounds[0];
  const apart = fought.rounds[1];
  expect(together.causes.slice(1), JSON.stringify(together)).toEqual(['struck', 'struck']);
  expect(together.gained, 'one swing, two riders, two knockdowns').toEqual([2, 0, 0]);
  expect(together.downAt[1], 'the two falls were not on one step').toBe(together.downAt[2]);

  expect(apart.causes.slice(1), JSON.stringify(apart)).toEqual(['struck', 'struck']);
  expect(apart.gained, 'the second victim of the same swing was skipped').toEqual([2, 0, 0]);
  expect(apart.downAt[1], 'this half must reach them on different steps')
    .not.toBe(apart.downAt[2]);
  expect(fought.match.knockdowns[0]).toBe(4);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. q173 — two attackers, one victim, and the victim's own return swing
// ---------------------------------------------------------------------------

/**
 * The three stands of q173's worked case, in the spawn frame.
 *
 * Seats A=0, B=1, C=2. B is the shared victim; A and C both hold B in their
 * forehand and sit at opposite ends of the 1.202 m circle that fact defines, so
 * they are `SHARED_ATTACKER_GAP_METRES` apart and cannot reach each other. B's
 * own forehand holds A, which is the return swing the case turns on: it is
 * recorded before any crash is applied, so it stands even though B goes down in
 * the same step.
 */
const SHARED_VICTIM: readonly Stand[] = [
  { seat: 1, along: ARENA_ALONG_METRES, across: 0 },
  {
    seat: 0,
    along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
    across: TAP_ACROSS_METRES,
    turn: Math.PI,
  },
  {
    seat: 2,
    along: ARENA_ALONG_METRES - TAP_ALONG_METRES,
    across: -TAP_ACROSS_METRES,
  },
];

test('q173 in the real step: two paddles share one fall, and the return swing stands', async ({
  page,
}) => {
  /*
   * **The owner's own numbers** (§37.1, answered 2026-09-13): tallies 4/2/4/1
   * before the step, target five, A → B and C → B committed, B → A committed.
   * One crash on B credits A and C; B's return swing still puts A down, because
   * it was recorded before B's crash was spent. Final 5/3/5/1 — a draw between
   * seats 0 and 2, places 1/3/1/4.
   *
   * **The tallies are earned, not injected.** Eleven single taps put 4/2/4/1 on
   * the board through the same production path the rest of this file uses, so
   * the arithmetic the card finally shows is the arithmetic the step produced.
   *
   * This is the case that was seat-order biased in the shipped game and is the
   * reason q173 was asked: `hardKnock` refuses a rider who is already crashing,
   * so whichever attacker the loop reached first took the knockdown and the
   * other got nothing at all — not even a shove.
   *
   * **Watched failing**: crediting only the first name in `credited` — the old
   * behaviour, written as a one-line mutation — gives 5/3/4/1 and a sole
   * winner, and this test fails on the tallies rather than on the card.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 4);

  const seeding: Round[] = [];
  const owed: { attacker: number; victim: number }[] = [
    { attacker: 0, victim: 3 }, { attacker: 0, victim: 3 },
    { attacker: 0, victim: 3 }, { attacker: 0, victim: 3 },
    { attacker: 2, victim: 3 }, { attacker: 2, victim: 3 },
    { attacker: 2, victim: 3 }, { attacker: 2, victim: 3 },
    { attacker: 1, victim: 3 }, { attacker: 1, victim: 3 },
    { attacker: 3, victim: 0 },
  ];
  for (const pair of owed) seeding.push(tap(pair.attacker, pair.victim, 4));

  const seeded = await brawl(page, { target: 5, rounds: seeding });
  expect(seeded.match.knockdowns, 'the board was not set up as q173 describes')
    .toEqual([4, 2, 4, 1]);
  expect(seeded.match.phase, 'the seeding ended the match by itself').toBe('running');

  const decided = await brawl(page, {
    rounds: [{
      place: [...SHARED_VICTIM, { seat: 3, along: 0, across: 0 }],
      swing: [0, 1, 2],
      steps: 90,
    }],
  });

  const round = decided.rounds[0];
  const label = JSON.stringify(round);
  expect(round.gained, 'A and C share B’s fall, and B’s return swing stands')
    .toEqual([1, 1, 1, 0]);
  expect(round.causes[1], label).toBe('struck');
  expect(round.causes[0], label).toBe('struck');
  expect(round.crashes, 'B and A fell once each; C and D did not fall')
    .toEqual([1, 1, 0, 0]);
  expect(decided.match.knockdowns, JSON.stringify(decided.match)).toEqual([5, 3, 5, 1]);
  expect(decided.match.phase).toBe('ended');
  expect(decided.match.winner, 'a lead nobody holds alone is nobody’s').toBe(null);
  expect(decided.match.leaders).toEqual([0, 2]);
  expect(decided.match.places, 'places are 1 + the riders with more').toEqual([1, 3, 1, 4]);
  expect(decided.state, 'the bout reached its own screen').toBe('results');
  expect(errors).toEqual([]);
});

test('a victim inside recovery immunity credits nobody, and still swings back', async ({
  page,
}) => {
  /*
   * **q173's third variant, and §37.3's "a rider already down or in recovery
   * immunity cannot be farmed".** B is put down, stands up, and is struck by
   * both A and C inside the 0.90 s window `EUC.crashInvulnerableSeconds` gives
   * them: no crash on B, no credit to A or C, and B's own return swing on A
   * still lands.
   *
   * **B is not re-placed for the deciding round**, which is why the round is
   * anchored on B's own pose: a bridge teleport resets the controller, and the
   * recovery window this spec is about would go with it. The fixture asserts
   * the window was actually open when the round began, because "nobody scored"
   * is also what a rig that reached nobody reports.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const fought = await brawl(page, {
    target: 9,
    rounds: [
      // Put B down with a single tap from C, then let them stand back up.
      tap(2, 1, 3),
      {
        standUp: 1,
        anchor: 1,
        place: [
          { seat: 0, along: TAP_ALONG_METRES, across: TAP_ACROSS_METRES, turn: Math.PI },
          { seat: 2, along: -TAP_ALONG_METRES, across: -TAP_ACROSS_METRES },
        ],
        swing: [0, 1, 2],
        steps: 90,
      },
    ],
  });

  const opening = fought.rounds[0];
  const immune = fought.rounds[1];
  expect(opening.gained, 'the opening tap must land, or the window never opens')
    .toEqual([0, 0, 1]);
  expect(immune.immune[1], 'B was not inside the recovery window, so this proves nothing')
    .toBeGreaterThan(0);
  expect(immune.crashes[1], 'an immune rider was put down').toBe(0);
  expect(immune.gained[0], 'A was credited for a fall that never happened').toBe(0);
  expect(immune.gained[2], 'C was credited for a fall that never happened').toBe(0);
  expect(immune.causes[0], 'B’s return swing did not land').toBe('struck');
  expect(immune.gained[1], 'B’s own swing was cancelled by the immunity of B').toBe(1);
  expect(errors).toEqual([]);
});

test('an uncommitted paddle shoves every victim it reaches and credits nobody', async ({
  page,
}) => {
  /*
   * **The shove half of q173, through the slider that owns it.**
   * `PADDLE.hardKnockShare` ships at 0, which makes every landed strike
   * committed; raised past 1 it asks for more speed than the arc itself carries
   * (see its own note in `data/tuning.ts`), so a parked tap becomes the M18
   * body knock — one soft-body wobble and a speed cost — and credits nothing.
   *
   * Mixing committed and uncommitted attackers on one victim is the resolver's
   * own arithmetic and is held test by test in `simulation/strikeBatch.test.ts`;
   * what cannot be proved there is that `Game` still spends a shove on every
   * rider a sweep reached at three seats, and never a knockdown.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  await page.evaluate(() => {
    window.game.tuning.set('PADDLE.hardKnockShare', 2);
  });
  const fought = await brawl(page, {
    target: 5,
    rounds: [{
      place: [...SHARED_VICTIM],
      swing: [0, 1, 2],
      steps: 90,
    }],
  });

  const round = fought.rounds[0];
  const label = JSON.stringify(round);
  expect(round.gained, 'a shove is not a knockdown').toEqual([0, 0, 0]);
  expect(round.crashes, label).toEqual([0, 0, 0]);
  expect(round.wobble[1], 'B was reached by two paddles and felt neither').toBeGreaterThan(0);
  expect(round.wobble[0], 'B’s own swing reached A and did nothing').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/** The pile-up ring: three attackers evenly around one rider, inside the arc. */
const PILE_RADIUS_METRES = 1.6;

test('three committed paddles on one rider are one fall and three credits', async ({ page }) => {
  /*
   * **q173 at its widest arity**, added by the Phase 5 review: the section above
   * holds two attackers on one victim and the sections around it hold one-on-two,
   * but nothing in the suite put *three* paddles on the same rider in the same
   * step — and three is the most four seats can produce, so it is the case where
   * a resolver that applied one crash per credit, or credited one attacker per
   * crash, would show the largest error.
   *
   * The three stand at 120° around the victim and each carries the turn that
   * puts the victim in their forehand. The victim does not swing back, because
   * whether *their* arc reaches any of the three is a fact about where the ring
   * happens to put them rather than about the rule under test.
   *
   * **Watched failing**: crediting only the first name in `outcome.credited` —
   * the same one-line mutation the two-attacker case is watched against — gives
   * `[0, 1, 0, 0]` here rather than `[0, 1, 1, 1]`.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 4);

  // The instrument, not a copied number: the ring has to be inside the weapon.
  expect(PILE_RADIUS_METRES, 'the pile-up ring is outside the paddle’s reach')
    .toBeLessThan(REACH_METRES);

  const turns = [0, (2 * Math.PI) / 3, -(2 * Math.PI) / 3];
  const fought = await brawl(page, {
    target: 9,
    rounds: [{
      place: [
        { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
        ...[1, 2, 3].map((seat, i) => ({
          seat,
          along: ARENA_ALONG_METRES - PILE_RADIUS_METRES * Math.sin(turns[i]),
          across: -PILE_RADIUS_METRES * Math.cos(turns[i]),
          turn: turns[i],
        })),
      ],
      swing: [1, 2, 3],
      steps: 90,
    }],
  });

  const pile = fought.rounds[0];
  const label = JSON.stringify(pile);
  expect(pile.gained, label).toEqual([0, 1, 1, 1]);
  // One fall, not three: the batch applies the physical crash to the victim once.
  expect(pile.crashes, label).toEqual([1, 0, 0, 0]);
  expect(pile.causes[0], label).toBe('struck');
  expect(pile.downAt[0], 'the victim never went down').toBeGreaterThanOrEqual(0);
  expect(fought.match.knockdowns, JSON.stringify(fought.match)).toEqual([0, 1, 1, 1]);
  expect(fought.match.phase, 'three credits in one step ended a bout of nine').toBe('running');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. Teleport hygiene, per participant
// ---------------------------------------------------------------------------

test('a respawn voids only its own exchanges, and the fight across the road goes on', async ({
  page,
}) => {
  /*
   * **§37.3's per-participant teleport hygiene.** The rule used to be one line:
   * any seat resetting voided every strike the tick had found. That was honest
   * at two seats — every strike was aimed at the other one — and at four it
   * would let one rider's respawn cancel a fight happening thirty metres away.
   *
   * Three rounds, and the control comes first because "nothing happened" is
   * also what a rig that reached nobody reports (M26 Phase 3's lesson):
   *
   *   1. the control — seats 0 and 1 exchange, both fall, the step is measured;
   *   2. the victim respawns on that very step — no fall, no score, and the
   *      strike does not land on the pose they left behind;
   *   3. seat 2, who is in nobody's reach, respawns on that step instead — and
   *      the exchange between 0 and 1 still scores, which is the whole change.
   *
   * **Watched failing**: restoring the aggregate void — any seat's reset
   * dropping the whole batch — fails the third case and leaves the first two
   * green, which is precisely the shape of the behaviour being replaced.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const duel: Round = {
    place: [
      { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
      {
        seat: 1,
        along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
        across: TAP_ACROSS_METRES,
        turn: Math.PI,
      },
      ...bystanders(3, [0, 1]),
    ],
    swing: [0, 1],
    steps: 90,
  };

  const control = await brawl(page, { target: 9, rounds: [duel] });
  const landed = control.rounds[0].downAt[1];
  expect(landed, 'the control exchange never landed, so the cases below are empty')
    .toBeGreaterThanOrEqual(0);
  expect(control.rounds[0].gained).toEqual([1, 1, 0]);

  const voided = await brawl(page, {
    rounds: [{ ...duel, resetAt: [{ seat: 1, step: landed }] }],
  });
  const away = voided.rounds[0];
  expect(away.moved[1], 'the victim never respawned, so nothing was tested')
    .toBeGreaterThan(20);
  expect(away.crashes[1], 'a strike landed on a pose nobody was standing at').toBe(0);
  expect(away.gained[0], 'seat 0 scored a knockdown across thirty metres of map').toBe(0);
  // The reset is the victim's, and it takes the exchange with it: seat 1's own
  // swing is cancelled by `resetRiderTo`, and seat 0's is refused because the
  // rider it was aimed at is not there any more.
  expect(away.gained, JSON.stringify(away)).toEqual([0, 0, 0]);

  const unrelated = await brawl(page, {
    rounds: [{ ...duel, resetAt: [{ seat: 2, step: landed }] }],
  });
  const beside = unrelated.rounds[0];
  // The bystander is parked twelve metres up the road, so their own `R` takes
  // them back to the spawn and the distance is the proof it happened.
  expect(beside.moved[2], 'the unrelated seat never respawned').toBeGreaterThan(5);
  expect(beside.causes.slice(0, 2), JSON.stringify(beside)).toEqual(['struck', 'struck']);
  expect(beside.gained, 'somebody else’s respawn cancelled this exchange')
    .toEqual([1, 1, 0]);
  expect(errors).toEqual([]);
});

test('an attacker who respawns takes their own swing with them', async ({ page }) => {
  /*
   * The other end of the same rule, and it is the *step* that enforces it
   * rather than the resolver. `stepSeat` returns on `didReset` above the line
   * that steps the paddle, so an attacker who presses `R` mid-arc records
   * nothing at all on that step: `resetRiderTo` has already cancelled the
   * swing, and there is no hit left to refuse. `StrikeBatch`'s own
   * `attacker-reset` refusal is the resolver's defensive guard for a caller
   * that does record one — unit-tested where it lives — and not the mechanism
   * this test observes. What this holds is the outcome either way: the victim
   * is left standing and nobody scores.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const control = await brawl(page, { target: 9, rounds: [tap(0, 1, 3)] });
  const landed = control.rounds[0].downAt[1];
  expect(landed, 'the control tap never landed').toBeGreaterThanOrEqual(0);
  expect(control.rounds[0].gained).toEqual([1, 0, 0]);

  const voided = await brawl(page, {
    rounds: [{ ...tap(0, 1, 3), resetAt: [{ seat: 0, step: landed }] }],
  });
  const round = voided.rounds[0];
  expect(round.moved[0], 'the attacker never respawned').toBeGreaterThan(20);
  expect(round.crashes[1], 'the victim was put down by a rider who had left').toBe(0);
  expect(round.gained, JSON.stringify(round)).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
});

test('seat 0 pressing R cannot defer the winning step to the next tick', async ({ page }) => {
  /*
   * §37.3, in the words it is written in: "ensure seat 0's `worldReset` return
   * cannot defer an unrelated winning exchange to next tick."
   *
   * **Seat 0 is the only seat that can ask this question.** `Game.step` returns
   * early on `worldReset`, which is seat 0's respawn alone (the host's `R` is
   * the world's), and everything below that return — the particles, the cop,
   * both referees — is skipped for the tick. Phase 3 Stage A hoisted the
   * *credit* above it (`spendRiderStrikes`), which is what made this reachable:
   * the batch now records a knockdown on a tick whose referee never runs, where
   * the old aggregate void would have dropped the whole batch instead. The
   * decision was still below the return, so the tally sat on the board for one
   * extra step and collected whatever landed in it.
   *
   * The fight is a chain of two identical taps, one step apart, with the target
   * at one so the first of them decides the bout:
   *
   *   seat 3 → seat 1 → seat 2, all three facing the same way and strung along
   *   the same 1.202 m forehand offset, so the two ends stand 2.404 m apart —
   *   further than `REACH_METRES`, and therefore unable to reach each other.
   *
   * Seat 1 swings on step 0 and downs seat 2 on step L; seat 3 swings on step 1
   * and downs seat 1 on step L+1. The control proves the deferral window is not
   * empty: seat 3's knockdown really does land on the very next step and really
   * is refused, because the match ended on L.
   *
   * **Watched failing**: with the decision left below the `worldReset` return
   * (`if (worldReset) return;` without the `decideMatchAfterStrikes()` call
   * above it), the reset round ends on step L+1 with knockdowns [0, 1, 0, 1],
   * `winner` null and leaders [1, 3] — seat 1's outright win turned into a draw
   * by a rider standing eighteen metres away pressing `R`.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 4);

  const chain: Round = {
    place: [
      { seat: 3, along: ARENA_ALONG_METRES, across: 0 },
      {
        seat: 1,
        along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
        across: TAP_ACROSS_METRES,
      },
      {
        seat: 2,
        along: ARENA_ALONG_METRES + TAP_ALONG_METRES * 2,
        across: TAP_ACROSS_METRES * 2,
      },
      ...bystanders(4, [1, 2, 3]),
    ],
    swing: [1],
    swingAt: [{ seat: 3, step: 1 }],
    steps: 90,
    watchPhase: true,
  };

  // The ends of the chain cannot reach each other, so seat 3 hitting seat 1 and
  // seat 1 hitting seat 2 are the only two exchanges in the round.
  expect(SHARED_ATTACKER_GAP_METRES, 'the chain is short enough for its ends to fight')
    .toBeGreaterThan(REACH_METRES);

  const control = await brawl(page, { target: 1, rounds: [chain] });
  const first = control.rounds[0];
  const landed = first.downAt[2];
  expect(landed, 'the opening tap never landed, so nothing below is a fight')
    .toBeGreaterThanOrEqual(0);
  expect(first.causes[2]).toBe('struck');
  expect(first.phaseAt[landed], 'the control match did not end on the step it was won on')
    .toBe('ended');
  // The positive control: the second tap lands on the *next* step and is
  // refused by the referee, which is exactly the credit a deferred decision
  // would have swept up.
  expect(first.downAt[1], 'the staggered tap did not land one step later')
    .toBe(landed + 1);
  expect(first.causes[1]).toBe('struck');
  expect(first.gained, JSON.stringify(first)).toEqual([0, 1, 0, 0]);
  expect(control.match.winner).toBe(1);
  expect(control.match.knockdowns).toEqual([0, 1, 0, 0]);
  expect(control.match.places).toEqual([2, 1, 2, 2]);

  // **A second bout, from the title.** `target: 1` means the control ended the
  // match, and a `KnockaboutMatch` that has ended refuses everything after it
  // — so the reset round has to be a fresh room rather than another round of
  // the same one. The boot is the same journey, so the two runs differ in one
  // thing only: who presses `R` on step `landed`.
  await bootBrawl(page, 4);
  const hosted = await brawl(page, {
    target: 1,
    rounds: [{ ...chain, resetAt: [{ seat: 0, step: landed }] }],
  });
  const reset = hosted.rounds[0];
  // Seat 0 is parked twelve metres up the road, so `R` really moves them; a
  // host who never respawned would make everything below vacuous.
  expect(reset.moved[0], 'the host never respawned, so the early return was never taken')
    .toBeGreaterThan(5);
  expect(reset.phaseAt[landed], 'the host’s respawn deferred the decision by a step')
    .toBe('ended');
  expect(reset.gained, JSON.stringify(reset)).toEqual([0, 1, 0, 0]);
  expect(hosted.match.knockdowns, JSON.stringify(hosted.match)).toEqual([0, 1, 0, 0]);
  expect(hosted.match.winner, 'an uninvolved seat’s R turned a win into a draw').toBe(1);
  expect(hosted.match.places).toEqual([2, 1, 2, 2]);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 6. The ending: overshoot, draws, and the results delay
// ---------------------------------------------------------------------------

test('a final step that overshoots the target still has one winner', async ({ page }) => {
  /*
   * §37.3: "a final 6/5/4 has one winner, not a draw among everyone who reached
   * five", and the step is never cut short at the first fifth knockdown. Here
   * the target is one and a single swing downs two riders, so the ending step
   * carries two credits at once: the leader has two, everybody else nil, and
   * the two riders who fell share second place.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const abeam = -Math.PI / 2;
  const straddle = 0.45;
  const fought = await brawl(page, {
    target: 1,
    rounds: [{
      place: [
        { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
        {
          seat: 1,
          along: ARENA_ALONG_METRES + Math.cos(abeam) * (PADDLE.reach - straddle),
          across: PADDLE.pivotOffset - Math.sin(abeam) * (PADDLE.reach - straddle),
        },
        {
          seat: 2,
          along: ARENA_ALONG_METRES + Math.cos(abeam) * (PADDLE.reach + straddle),
          across: PADDLE.pivotOffset - Math.sin(abeam) * (PADDLE.reach + straddle),
        },
      ],
      swing: [0],
      steps: 120,
    }],
  });

  // **Two credits, and two riders on the ground** — the file header's rule,
  // and the repair pass put it here because this fixture and the draw below
  // were the two that read the tally alone. A regression that decoupled
  // `match.knockdown` from what `hardKnock` actually returned would score an
  // overshoot nobody physically took.
  const overshoot = fought.rounds[0];
  expect(overshoot.causes.slice(1), JSON.stringify(overshoot)).toEqual(['struck', 'struck']);
  expect(overshoot.crashes, JSON.stringify(overshoot)).toEqual([0, 1, 1]);
  expect(fought.match.target, 'the slider reached the referee').toBe(1);
  expect(fought.match.knockdowns, JSON.stringify(fought.match)).toEqual([2, 0, 0]);
  expect(fought.match.winner).toBe(0);
  expect(fought.match.places).toEqual([1, 2, 2]);
  expect(fought.match.phase).toBe('ended');
  expect(errors).toEqual([]);
});

test('a simultaneous match point at three seats is a draw between the two who got there', async ({
  page,
}) => {
  /*
   * q86's two-seat draw, at three. `target: 1` makes the whole bout one
   * exchange, which is the only way to put two riders on match point at the
   * same instant on demand; the third rider is placed nowhere near it and takes
   * last place by knockdowns alone (q168 — targets never decide a place).
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const fought = await brawl(page, {
    target: 1,
    rounds: [{
      place: [
        { seat: 0, along: ARENA_ALONG_METRES, across: 0 },
        {
          seat: 1,
          along: ARENA_ALONG_METRES + TAP_ALONG_METRES,
          across: TAP_ACROSS_METRES,
          turn: Math.PI,
        },
        ...bystanders(3, [0, 1]),
      ],
      swing: [0, 1],
      steps: 90,
    }],
  });

  // Both of them really fell, and the bystander did not — the header's rule
  // again, and the reason a draw is worth asserting physically: two credits in
  // one step is exactly where a resolver that reported a knock it never applied
  // would hide.
  const exchange = fought.rounds[0];
  expect(exchange.causes.slice(0, 2), JSON.stringify(exchange)).toEqual(['struck', 'struck']);
  expect(exchange.crashes, JSON.stringify(exchange)).toEqual([1, 1, 0]);
  expect(fought.match.knockdowns, JSON.stringify(fought.match)).toEqual([1, 1, 0]);
  expect(fought.match.winner, 'a shared top is a draw').toBe(null);
  expect(fought.match.leaders).toEqual([0, 1]);
  expect(fought.match.places).toEqual([1, 1, 3]);
  expect(fought.state, 'a draw is an ending, so it reaches the screen').toBe('results');
  expect(errors).toEqual([]);
});

test('nothing scores during the results delay, and no strike is left over for it', async ({
  page,
}) => {
  /*
   * §37.8 item 3's last clause. The bout ends on a step, and the card waits
   * `CHALLENGE.resultsDelaySeconds` before it is shown — a second and a half in
   * which the paddles are still equipped and the riders are still riding. The
   * referee refuses a knockdown outside its running phase, so what this proves
   * is that `Game` hands it nothing it can act on and keeps nothing back: the
   * tallies the ending step produced are the tallies the card is built from.
   */
  const errors = collectErrors(page);
  await bootBrawl(page, 3);

  const fought = await brawl(page, {
    target: 1,
    rounds: [
      tap(0, 1, 3),
      // The bout is already over; this one would score twice if anything could.
      { ...tap(2, 1, 3), steps: 60 },
      { ...tap(1, 0, 3), steps: 60 },
    ],
  });

  expect(fought.rounds[0].gained, 'the deciding tap never landed').toEqual([1, 0, 0]);
  expect(fought.rounds[1].phase, 'the bout was still running').toBe('ended');
  expect(fought.rounds[1].gained, 'a knockdown was scored after the ending').toEqual([0, 0, 0]);
  expect(fought.rounds[2].gained, 'a knockdown was scored after the ending').toEqual([0, 0, 0]);
  expect(fought.match.knockdowns, JSON.stringify(fought.match)).toEqual([1, 0, 0]);
  expect(fought.match.winner).toBe(0);
  expect(errors).toEqual([]);
});

/**
 * **`R` inside the results delay still reaches the card** — §37.8 item 3's
 * other half, found by the Phase 5 review.
 *
 * The delay is a second and a half in which the riders are still riding and
 * every seat's `R` is still live, and the loser reaching for it is the most
 * ordinary thing a beaten player does. `stepSeat`'s reset branch zeroes
 * `resultsIn` — which is a timed run's rule, because `R` there restarts the run
 * — and a match has no restart to arm: the delay simply vanished, the referee
 * stayed `ended`, and `stepKnockabout` had nothing left that could reach
 * `goTo('results')`. The room sat in `knockabout` with paddles equipped,
 * nothing scoring and no card, exactly as `stepChallenge`'s own comment records
 * the same shape happening behind the settings screen.
 *
 * Every seat, because each reaches the line differently: seat 0's `R` is the
 * world's and returns out of `Game.step` above the referee, the victim presses
 * theirs while crashed, and the bystander presses one that has nothing to do
 * with the fight. Two seats as well as three — the defect is older than this
 * milestone and the two-player match must come out of it with the card it has
 * always had.
 *
 * **Watched failing**: with the guard removed, all four report
 * `state === 'knockabout'` after the settle loop has spent nine hundred steps
 * waiting for a screen that never arrives.
 */
for (const seats of [3, 2] as const) {
  for (const presser of seats === 3 ? [0, 1, 2] : [1]) {
    test(`seat ${presser} pressing R inside the results delay still reaches the card at ${seats} seats`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await bootBrawl(page, seats);

      // The control names the step the tap lands on, against a target nobody
      // in it can reach — so the bout is still running and there is no delay
      // to confuse the measurement with.
      const control = await brawl(page, { target: 9, rounds: [tap(0, 1, seats)] });
      const landed = control.rounds[0].downAt[1];
      expect(landed, 'the control tap never landed, so there is no delay to press into')
        .toBeGreaterThanOrEqual(0);
      expect(control.match.phase, 'the control ended the bout').toBe('running');

      // A fresh room, so `target: 1` makes that same tap the deciding one.
      await bootBrawl(page, seats);
      const fought = await brawl(page, {
        target: 1,
        rounds: [{
          ...tap(0, 1, seats),
          steps: landed + 40,
          resetAt: [{ seat: presser, step: landed + 4 }],
          watchPhase: true,
        }],
      });
      const round = fought.rounds[0];

      expect(round.gained[0], JSON.stringify(round)).toBe(1);
      // The fall as well as the tally — read off `downAt`, which is sampled on
      // the step it happened, rather than off `crashCause` or the crash count:
      // the victim is one of the seats that presses `R`, and
      // `EucController.reset` zeroes both of those ("a reset is a fresh run").
      expect(round.downAt[1], 'the deciding tap never physically landed')
        .toBeGreaterThanOrEqual(0);
      expect(round.phaseAt[round.downAt[1]], 'the bout did not end on the landing step')
        .toBe('ended');
      // The press really moved somebody, or everything below is vacuous.
      expect(round.moved[presser], `seat ${presser} never respawned`).toBeGreaterThan(5);
      expect(fought.match.phase, 'the respawn restarted a bout that had ended').toBe('ended');
      expect(fought.match.knockdowns[0], 'the respawn took the winning credit with it').toBe(1);
      expect(fought.match.winner, 'the respawn changed who won').toBe(0);
      expect(
        fought.state,
        `the card never came after seat ${presser} pressed R inside the delay`,
      ).toBe('results');
      expect(errors).toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------
// 7. What must not have changed
// ---------------------------------------------------------------------------

test('the room a solo rider is in still has nobody to hit', async ({ page }) => {
  /*
   * §37.8 item 5's protected path, from the strike pipeline's side: one rider
   * arms no match and has no opponent, so the mode is the target-clearing run
   * it has always been. `strikeableOpponents`' `>= 2` is the clause that says
   * so, and deleting it would put a `rider-0` volume in the wielder's own sweep.
   *
   * The discs still answer, because that is the rest of the mode: a solo swing
   * at a disc scores exactly as it did.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${BRAWL_SEED}`);
  await page.evaluate(() => window.game.startKnockabout());
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const solo = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.setActions({ swing: true });
    for (let step = 0; step < 120; step += 1) {
      if (step === 1) game.clearActions();
      game.advance(1);
    }
    return {
      match: game.snapshot().match.phase,
      crashes: game.snapshot().euc.crashes,
      state: game.snapshot().app.state,
      seats: game.seatCount,
    };
  });

  expect(solo.seats).toBe(1);
  expect(solo.match, 'one rider armed a match').toBe('idle');
  expect(solo.crashes, 'the solo rider swung at themselves').toBe(0);
  expect(solo.state).toBe('knockabout');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 7b. The record store, at every seat count (§37.8 item 5)
// ---------------------------------------------------------------------------

/**
 * The keys this spec must not guess, read off the modules that write them: a
 * renamed namespace moves the fixture rather than quietly emptying it.
 */
const RECORDS_KEY = `${STORAGE_PREFIX}${KNOCKABOUT_RECORDS_KEY}`;

/** What `level=generated&seed=route-41` builds, asserted rather than assumed. */
const BRAWL_LEVEL_ID = `generated-r3-${BRAWL_SEED}`;

/** A solo personal best that is already on the machine when the room boots. */
const PRELOADED_BEST = {
  levelId: BRAWL_LEVEL_ID,
  struck: 7,
  total: 18,
  seconds: 91.5,
  setAt: '2026-09-01T10:00:00.000Z',
} as const;

/** Every `euc-thrills.v1.*` key and value, sorted — the whole bucket, as text. */
function storageDump(page: Page): Promise<string> {
  return page.evaluate((prefix) => {
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      out.push(`${key}=${window.localStorage.getItem(key)}`);
    }
    out.sort();
    return out.join('\n');
  }, STORAGE_PREFIX);
}

/**
 * File a solo best before the game's first line runs.
 *
 * Guarded on the key rather than written unconditionally, because the room is
 * booted twice below and the second boot must find the store the first one
 * left — a preload that rewrote itself on every navigation would hide exactly
 * the write this spec is looking for.
 */
async function preloadSoloBest(page: Page): Promise<void> {
  await page.addInitScript((input) => {
    if (window.localStorage.getItem(input.key) !== null) return;
    window.localStorage.setItem(
      input.key,
      JSON.stringify({ routes: { [input.best.levelId]: input.best } }),
    );
  }, { key: RECORDS_KEY, best: PRELOADED_BEST });
}

/**
 * §37.8 item 5's records clause, at two seats, three and four.
 *
 * **The one M37 promise the suite was not failing for.** §25.6's couch rule —
 * a couch session keeps nothing — is carried by three lines that are easy to
 * widen by accident: `stepKnockabout` returns on `match.phase !== 'idle'`
 * before it can reach `finishKnockabout`, `finishMatch` is the store-free twin
 * a match ends through instead, and `finishKnockabout` is the only submitter
 * in `Game.ts`. `tests/m26.spec.ts` proved it at two seats, with an empty
 * store and no reload; M37 put three and four through the same lines and
 * nothing asked whether the rule came with them.
 *
 * What each half of this fixture is for:
 *
 *   1. **A record that already exists**, because an empty bucket cannot tell
 *      "nothing was written" apart from "something was written that happened
 *      to be nothing".
 *   2. **Every disc on the route knocked down inside the bout**, which is what
 *      makes the comparison able to fail at all: `KnockaboutRecordsStore.submit`
 *      refuses anything that does not beat the best on file, so a leaked
 *      submit carrying a score of zero would be turned away by the store and
 *      the bucket would match anyway. The route is cleared so the score a leak
 *      would carry is the biggest one there is, and the preload is asserted to
 *      be beatable before anything is compared. It is also q76 restated: a
 *      couch bout that runs out of scenery does not end and does not file.
 *   3. **Every `euc-thrills.v1.*` key, byte for byte**, rather than the record
 *      key alone — a future path that filed the bout somewhere else would walk
 *      straight past an assertion that only reads the key it already knows.
 *   4. **Across a reload**, which is the read path rather than the write path:
 *      a store that kept the bout in memory and flushed it on the next boot
 *      passes every in-page comparison there is.
 *   5. **At two seats as well as three and four** — two is the protected shape
 *      this milestone must not have moved, and it is this spec's own control.
 *
 * **Watched failing**, twice, because the two ways this rule can be widened
 * fail at different assertions:
 *
 *   - Drop `stepKnockabout`'s `return` out of the `match.phase !== 'idle'`
 *     branch, so the cleared route falls through to `finishKnockabout` while
 *     the bout is still running: all three seat counts fail on "the room is
 *     not reading the preloaded best at all", the store having taken 18 over
 *     the preloaded 7.
 *   - Give `finishMatch` the submit that `finishKnockabout` has — the store
 *     arriving in the store-free twin, which is the likelier accident: all
 *     three fail on "couch bout wrote to storage", at the byte compare.
 */
for (const seats of [2, 3, 4] as const) {
  test(`a ${seats}-seat bout that clears the route files nothing, and the preloaded best survives`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await preloadSoloBest(page);

    // Booted once before anybody sits down, so the journey through the title
    // and the join panel is inside the comparison rather than in front of it.
    await bootToTitle(page, `level=generated&seed=${BRAWL_SEED}`);
    const before = await storageDump(page);
    expect(before, 'the preload never reached storage, so nothing below is a comparison')
      .toContain(`"struck":${PRELOADED_BEST.struck}`);

    await bootBrawl(page, seats);

    const cleared = await page.evaluate(() => {
      const game = window.game;
      // m26's own shortcut for this question — "the ending, not the aim".
      const internal = game as unknown as {
        readonly targets: { strike(id: string): boolean };
      };
      for (const target of game.levelPlan.targets ?? []) internal.targets.strike(target.id);
      game.clearActions();
      game.advance(2);
      const snapshot = game.snapshot();
      return {
        levelId: game.levelPlan.id,
        struck: snapshot.targets.struck,
        total: snapshot.targets.total,
        best: snapshot.targets.best,
        state: snapshot.app.state,
        phase: snapshot.match.phase,
      };
    });

    expect(cleared.levelId, 'the preload was filed against another route').toBe(BRAWL_LEVEL_ID);
    expect(cleared.struck, JSON.stringify(cleared)).toBe(cleared.total);
    expect(
      cleared.struck,
      `the route carries ${cleared.total} discs, which a leaked submit could not file `
      + `over a best of ${PRELOADED_BEST.struck} — the comparison below could not fail`,
    ).toBeGreaterThan(PRELOADED_BEST.struck);
    // q76, restated at N: the discs running out decides nothing.
    expect(cleared.state, 'the last disc ended a couch bout').toBe('knockabout');
    expect(cleared.phase, 'the last disc ended a couch bout').toBe('running');
    expect(cleared.best, 'the room is not reading the preloaded best at all')
      .toBe(PRELOADED_BEST.struck);

    // And now the bout is decided by a real knockdown, through the file's own
    // driver — the ending that reaches the card, which is where a run files.
    const fought = await brawl(page, { target: 1, rounds: [tap(0, 1, seats)] });
    expect(fought.rounds[0].downAt[1], 'the deciding tap never landed')
      .toBeGreaterThanOrEqual(0);
    expect(fought.match.phase, JSON.stringify(fought.match)).toBe('ended');
    expect(fought.match.winner).toBe(0);
    await page.evaluate(() => {
      const game = window.game;
      game.clearActions();
      for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
        game.advance(1);
      }
    });
    expect(
      await page.evaluate(() => window.game.snapshot().app.state),
      'the bout never reached its card, so the submitting path was never passed',
    ).toBe('results');

    expect(await storageDump(page), `a ${seats}-seat couch bout wrote to storage`).toBe(before);

    // The read path as well as the write path.
    await bootToTitle(page, `level=generated&seed=${BRAWL_SEED}`);
    expect(await storageDump(page), 'the bucket changed across a reload').toBe(before);
    expect(
      await page.evaluate(
        (levelId) => window.game.knockaboutRecords.best(levelId)?.struck ?? null,
        BRAWL_LEVEL_ID,
      ),
      'the store no longer reads the preloaded best',
    ).toBe(PRELOADED_BEST.struck);
    expect(errors).toEqual([]);
  });
}

test('the fixtures are measured against the weapon and not against a copied number', () => {
  /*
   * A guard rather than a claim about the spawn, which the group-start specs
   * at the end of this file make. What it pins is the *instrument*: `REACH_METRES` is read off a real `Paddle` and is
   * the number every geometry in this file is built from, so a tuning change
   * that moved the reach would move the fixtures rather than quietly making
   * them measure nothing. The two attackers of q173's shared victim are the
   * closest deliberate pair in the file.
   */
  expect(REACH_METRES).toBeGreaterThan(0);
  expect(
    SHARED_ATTACKER_GAP_METRES,
    'q173’s two attackers can reach each other, so its case is not what it says',
  ).toBeGreaterThan(REACH_METRES);
  // And the tap itself is inside the weapon, or every round above would be
  // measuring a swing at nobody.
  expect(Math.hypot(TAP_ACROSS_METRES, TAP_ALONG_METRES)).toBeLessThan(REACH_METRES);
});

// ===========================================================================
// Phase 3 Stage B — the doors, the group start and the countdown (§37.2,
// §37.4)
//
// Everything above arms a fight through the QA bridge, because Stage A owned
// the fixed step and not the way in. This half is the way in: every control
// below is a real one, and the two facts it cannot borrow from anywhere else
// are that a room of three or four is *offered* the fight and that the bout it
// starts holds still until GO.
//
//   1. **Both doors, at three and at four.** The join panel and the pause /
//      results switch reached through visible controls, on a world that
//      carries discs and on the city that carries none — a bridge-only arrival
//      cannot prove either (AGENTS.md, M27 Phase 5).
//   2. **The world-capability refusal survives, and is still mutation-free.**
//      M37 removed the seat-count refusal and nothing else; the pause menu
//      still refuses a bare world before it writes anything.
//   3. **The freeze is measured, not assumed.** Phase 2 proved neutral input
//      does not hold a slope, so a rider is parked on a real 4 % pavement
//      descent inside the count and the same descent is then ridden with the
//      same neutral input after GO — the positive control that makes "nobody
//      moved" mean something.
//   4. **The pack is checked against the weapon**, with the separation read
//      off a real `Paddle` exactly as Phase 2's headless sweep reads it.
// ===========================================================================

/** The city the game boots into, which carries nothing to knock down. */
const BARE_WORLD = '';

/** What the group start must leave between the closest two riders, metres. */
const GROUP_SEPARATION_METRES = groupSeparation(new Paddle());

/**
 * A real 4 % pavement descent on `route-41`, and the heading straight down it.
 *
 * Found by sampling the world's own heightfield through `PlanTerrainSampler`
 * (every on-course metre within 250 m of the spawn, keeping points whose
 * normal says 2.5–25 % and whose height agrees with that slope at 0.5, 1, 1.5,
 * 2 and 3 m along it, so a kerb cannot pass as a hill). The spec asserts the
 * ground facts before it uses them, so a world that ever stops having this
 * hill fails loudly instead of quietly measuring a flat patch.
 *
 * Pavement matters: its rolling resistance is 0.35 m/s², so the crossover at
 * which a parked wheel starts rolling on its own is about a 2 % descent
 * (Phase 2, `groupSpawn.test.ts`). At 4.09 % a real `EucController` handed
 * `NEUTRAL_ACTIONS` covers 0.228 m in three seconds — measured headlessly
 * before this spec was written, and the number the positive control below
 * expects to see once the room is released.
 */
const HILL = { x: 17, z: 124, headingY: 0.91255, gradeAtLeast: 0.03 } as const;

// ---------------------------------------------------------------------------
// Stage B helpers — the panel's own controls
// ---------------------------------------------------------------------------

const COUCH_PANEL = '.euc-menu--couch';
const COUCH_MODE = `${COUCH_PANEL} [data-menu="couch-mode"]`;
const COUCH_START = `${COUCH_PANEL} [data-menu="couch-start"]`;

// Owner's city report: exercise the device that paused, then use that same
// device to navigate and confirm. A generated route hid the old target gate.
for (const presser of [0, 1, 2, 3]) {
  test(`city pause switch works from device in seat ${presser + 1}`, async ({ page }) => {
    const errors = collectErrors(page);
    await sitDown(page, 4, '');
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
    if (presser === 3) await page.keyboard.press('Escape');
    else await claimWithPad(page, presser, 9);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    const choice = page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]');
    await expect(choice).toBeEnabled({ timeout: 2000 });
    if (presser === 0) await page.screenshot({ path: test.info().outputPath('city-pause.png') });
    if (presser === 3) {
      await page.keyboard.press('Shift+Tab');
    } else {
      await claimWithPad(page, presser, 12);
      await claimWithPad(page, presser, 15);
    }
    await expect(choice).toBeFocused();
    if (presser === 3) await page.keyboard.press('Enter');
    else await claimWithPad(page, presser);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
    const fight = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.advance(480);
      const s = game.snapshot();
      return { state: s.app.state, phase: s.match.phase, devices: s.input.devices,
        world: s.world.levelId, targets: s.targets.total, scores: s.match.scores.length, seats: game.seatCount };
    });
    expect(fight).toMatchObject({ state: 'knockabout', phase: 'running',
      devices: ['pad:0', 'pad:1', 'pad:2', 'keyboard'], world: 'generated', scores: 4, seats: 4 });
    expect(fight.targets).toBeGreaterThan(0);
    if (presser === 0) await page.screenshot({ path: test.info().outputPath('generated-knockabout.png') });
    expect(errors).toEqual([]);
  });
}

/** Is the panel's Knockabout button greyed out? */
function knockaboutOff(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector<HTMLButtonElement>(
    '.euc-menu--couch [data-couch-mode="knockabout"]',
  )?.disabled ?? true);
}

/** What the panel's chooser reports as pressed, one entry per ride. */
function chooserPressed(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '.euc-menu--couch [data-couch-mode]',
  )].map((button) => `${button.dataset.couchMode}:${button.getAttribute('aria-pressed')}`));
}

/**
 * Advance one fixed step at a time until the bout is released, and report what
 * the hold actually did.
 *
 * The loop is inside the page and returns one summary (the harness's round-trip
 * rule), and it is `advance(1)` rather than `advance(360)` because the whole
 * question is what happens on each held step.
 */
async function rideOutCount(page: Page): Promise<{
  readonly steps: number;
  readonly heldStepsGained: number;
  readonly phase: string;
  readonly moved: readonly number[];
  readonly countdownSeen: readonly number[];
}> {
  return page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().match.countdownHeldSteps;
    const seats = game.seatCount;
    const start = Array.from({ length: seats }, (_unused, seat) => {
      const p = game.snapshotFor(seat).euc.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    const countdownSeen: number[] = [];
    let steps = 0;
    while (steps < 1200 && game.snapshot().match.phase === 'countdown') {
      const shown = Math.ceil(game.snapshot().match.countdown);
      if (countdownSeen[countdownSeen.length - 1] !== shown) countdownSeen.push(shown);
      game.advance(1);
      steps += 1;
    }
    const after = game.snapshot();
    return {
      steps,
      heldStepsGained: after.match.countdownHeldSteps - before,
      phase: after.match.phase,
      moved: start.map((from, seat) => {
        const p = game.snapshotFor(seat).euc.position;
        return Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
      }),
      countdownSeen,
    };
  });
}

/** Every seat's pose, exactly as the snapshot reports it. */
function posesOf(page: Page): Promise<{ x: number; y: number; z: number; heading: number }[]> {
  return page.evaluate(() => Array.from(
    { length: window.game.seatCount },
    (_unused, seat) => {
      const euc = window.game.snapshotFor(seat).euc;
      return { x: euc.position.x, y: euc.position.y, z: euc.position.z, heading: euc.headingY };
    },
  ));
}

/** The closest unordered pair in the room right now, metres. */
function closestPair(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = window.game;
    let closest = Infinity;
    for (let a = 0; a < game.seatCount; a += 1) {
      for (let b = a + 1; b < game.seatCount; b += 1) {
        const first = game.snapshotFor(a).euc.position;
        const second = game.snapshotFor(b).euc.position;
        closest = Math.min(closest, Math.hypot(first.x - second.x, first.z - second.z));
      }
    }
    return closest;
  });
}

/**
 * Pause from a seat's own one-shot, with the loop frozen.
 *
 * `Escape` needs the loop running, because a keyboard press reaches the game
 * through the fixed step and a frozen loop takes none — so every fixture that
 * has already frozen to sample something asks this way instead. It is the same
 * claim either way: the press is claimed inside `stepSeat` and acted on once
 * per tick in `Game.step` (M25 Phase 4's any-seat-once), and three fixtures
 * below — *"a N-seat free ride becomes a fight from the pause card"* and *"a
 * world that cannot hold the pack"* — press the real `Escape` on a live loop,
 * so that neither road is the only one travelled. (The pause card's *resume*
 * is pressed as a real control in *"pause stops the count and resume carries
 * it on"*; what that fixture does not do any more is read a live clock across
 * a protocol round trip afterwards.)
 */
async function pauseFromSeat(page: Page, seat: number): Promise<void> {
  await page.evaluate((which) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(which, { pause: true });
    game.advance(2);
    game.setActionsFor(which, { pause: false });
    game.advance(1);
  }, seat);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
}

// ---------------------------------------------------------------------------
// 1. The doors
// ---------------------------------------------------------------------------

for (const seats of [3, 4] as const) {
  test(`${seats} players claim their way into a Knockabout on the join panel`, async ({ page }) => {
    /*
     * **The door q94 shut, opened** (§37.1, §37.8 item 1). Two claims choose
     * Knockabout; the third and the fourth arrive; and the three things that
     * used to happen — the control greying out, the selection being demoted to
     * a free ride, and Start refusing — are each asserted not to.
     *
     * Reached the way a player reaches it, because that is the whole find of
     * M27 Phase 5: the couch race shipped working through the pause card and
     * broken through this panel's own control, and 455 browser tests missed it
     * because every one of them arrived through the bridge or the other door.
     */
    const errors = collectErrors(page);
    await fakePads(page, seats - 1);
    await bootToTitle(page, `level=generated&seed=${BRAWL_SEED}`);
    await page.waitForFunction(() => window.game.snapshot().couch.available);
    await page.locator('.euc-menu--title [data-menu="couch"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i += 1) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      }
    });

    // Two players first — the room that could always have this fight — and the
    // mode chosen while it is legal by the old rule as well as the new one.
    await claimWithPad(page, 0);
    await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => window.game.snapshot().input.devices.filter((device) => device !== null).length === 2,
    );
    expect(await knockaboutOff(page)).toBe(false);
    await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
    expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

    // Then the rest of the room sits down, one at a time.
    for (let pad = 1; pad < seats - 1; pad += 1) {
      await claimWithPad(page, pad);
      await page.waitForFunction(
        (count) => window.game.snapshot().input.devices
          .filter((device) => device !== null).length === count,
        pad + 2,
      );
      expect(
        await page.evaluate(() => window.game.snapshot().couch.ride),
        'a player sitting down took the fight away with them',
      ).toBe('knockabout');
      expect(
        await knockaboutOff(page),
        'the room was offered the fight and then had the control greyed out',
      ).toBe(false);
      // The chooser is a report, and the report still names the room's choice.
      expect(await chooserPressed(page)).toEqual([
        'freeRide:false', 'race:false', 'knockabout:true',
      ]);
    }

    // The note under the row is the ordinary one: there is no refusal to state.
    await expect(page.locator(`${COUCH_PANEL} .euc-field__note`).first())
      .toContainText('Knockabout gives everybody a paddle');

    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

    // **The first frame of the fight**, before anything is advanced: this is
    // where M27's own defect sent the guests home.
    const armed = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const snapshot = game.snapshot();
      return {
        seats: game.seatCount,
        views: game.renderer.viewCount,
        huds: document.querySelectorAll('.euc-hud-seat').length,
        devices: snapshot.input.devices.filter((device) => device !== null).length,
        phase: snapshot.match.phase,
        scores: snapshot.match.scores.length,
        equipped: snapshot.paddle.equipped,
        seed: snapshot.match.placementSeed,
        candidate: snapshot.match.placementCandidate,
        clearance: snapshot.match.placementClearance,
        fallback: snapshot.match.placementFallback,
      };
    });
    expect(armed.seats).toBe(seats);
    expect(armed.views, 'the room lost a pane on the way in').toBe(seats);
    expect(armed.huds, 'a rider with no HUD is a rider who cannot see the score').toBe(seats);
    expect(armed.devices).toBe(seats);
    expect(armed.phase, 'three and four count down before they fight — q170').toBe('countdown');
    expect(armed.scores).toBe(seats);
    expect(armed.equipped, 'a fight without paddles is not one').toBe(true);
    expect(armed.fallback, 'the group start was refused on a shipped route').toBe(false);
    expect(armed.seed).not.toBe('');
    expect(armed.candidate).toBeGreaterThanOrEqual(0);
    expect(armed.clearance).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES);

    // And the room really is released.
    const count = await rideOutCount(page);
    expect(count.phase).toBe('running');
    expect(errors).toEqual([]);
  });
}

test('the city with nothing to hit sends a room of four to the routes panel and keeps them', async ({
  page,
}) => {
  /*
   * **The join panel's target-free journey, at four** (§37.2's "the two doors
   * remain different"). M26 proved it for two: `enterKnockabout` answers a
   * bare world by opening `routes`, which *is* a successor of `couchJoin`, and
   * the guests stay seated while a world is chosen. M37 removes the seat-count
   * refusal and must not disturb that.
   *
   * Three legs: the detour, a **cancel** (which is the title, and the title
   * dismisses a couch — that is the state machine's answer and it is asserted
   * rather than worked around), and a second attempt that arrives in a fight.
   */
  const errors = collectErrors(page);
  await sitDown(page, 4, BARE_WORLD);

  expect(
    await page.evaluate(() => window.game.snapshot().targets.total),
    'the fixture must really be a world with nothing to knock down',
  ).toBe(0);
  // Offered, not refused: the panel has no width rule left to apply, and a
  // bare world is not one either.
  expect(await knockaboutOff(page)).toBe(false);

  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');

  const detour = await page.evaluate(() => ({
    seats: window.game.seatCount,
    claims: window.game.snapshot().input.devices.filter((device) => device !== null).length,
    ride: window.game.snapshot().couch.ride,
    match: window.game.snapshot().match.phase,
  }));
  expect(detour.seats, 'a question about the world sent the room home').toBe(4);
  expect(detour.claims, 'every claim survives the detour').toBe(4);
  expect(detour.ride).toBe('knockabout');
  expect(detour.match, 'nothing is refereed while a world is being chosen').toBe('idle');

  // **Cancel.** `closeRoutes` goes to the title, and arriving at the title
  // closes a couch — the rule M27 Phase 5 records. Asserted because a spec
  // that skipped it would leave the next leg's re-seating looking like an
  // accident of the fixture.
  await page.locator('.euc-menu--routes [data-menu="routes-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(await page.evaluate(() => window.game.seatCount)).toBe(1);

  // **The second attempt**, all the way through.
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
  for (let pad = 0; pad < 3; pad += 1) {
    await claimWithPad(page, pad);
    await page.waitForFunction(
      (index) => window.game.snapshot().input.devices[index] === `pad:${index}`,
      pad,
    );
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().input.devices[3] === 'keyboard');
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');

  await page.locator('.euc-menu--routes [data-menu="seed"]').fill(BRAWL_SEED);
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'knockabout',
    undefined,
    { timeout: 60000 },
  );

  const arrived = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      views: window.game.renderer.viewCount,
      phase: snapshot.match.phase,
      scores: snapshot.match.scores.length,
      fallback: snapshot.match.placementFallback,
      clearance: snapshot.match.placementClearance,
    };
  });
  expect(arrived.seats, 'the room did not survive the route choice').toBe(4);
  expect(arrived.views).toBe(4);
  expect(arrived.phase).toBe('countdown');
  expect(arrived.scores).toBe(4);
  expect(arrived.fallback).toBe(false);
  expect(arrived.clearance).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES);
  expect(errors).toEqual([]);
});

for (const seats of [3, 4] as const) {
  test(`a ${seats}-seat free ride becomes a fight from the pause card`, async ({ page }) => {
    /*
     * **The other door** (§37.2). `switchCouchRide` refused a room of three
     * through `rideBlockedForSeats` and greyed the button beside it; both are
     * gone, and the two must still answer on identical terms — the control is
     * live *and* the press works.
     */
    const errors = collectErrors(page);
    await sitDown(page, seats, `level=generated&seed=${BRAWL_SEED}`);
    await page.locator(`${COUCH_MODE}[data-couch-mode="freeRide"]`).click();
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await expect(page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]'))
      .toBeEnabled();

    await page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

    const fight = await page.evaluate(() => {
      window.game.loop.setRunning(false);
      const snapshot = window.game.snapshot();
      return {
        seats: window.game.seatCount,
        phase: snapshot.match.phase,
        scores: snapshot.match.scores,
        equipped: snapshot.paddle.equipped,
        clearance: snapshot.match.placementClearance,
        fallback: snapshot.match.placementFallback,
      };
    });
    expect(fight.seats).toBe(seats);
    expect(fight.phase).toBe('countdown');
    expect(fight.scores.map((score) => score.knockdowns)).toEqual(new Array(seats).fill(0));
    expect(fight.equipped).toBe(true);
    expect(fight.fallback).toBe(false);
    expect(fight.clearance).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES);

    // The pack is a fact about the room, not about the snapshot: measure it.
    expect(await closestPair(page)).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);
    expect(errors).toEqual([]);
  });
}

for (const seats of [2, 3, 4]) {
  for (const venue of ['', 'level=track', 'level=switchback']) {
    test(`${seats} seats switch from ${venue || 'city'} to a fresh Knockabout course`, async ({ page }) => {
      const errors = collectErrors(page);
      await sitDown(page, seats, venue);
      await page.locator(COUCH_START).click();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
      const devices = await page.evaluate(() => window.game.snapshot().input.devices);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
      await page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]').click();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
      const started = await page.evaluate(() => {
        const game = window.game;
        game.loop.setRunning(false);
        game.advance(480);
        const s = game.snapshot();
        return { world: s.world.levelId, targets: s.targets.total, devices: s.input.devices,
          seats: game.seatCount, views: game.renderer.viewCount, phase: s.match.phase,
          ride: s.couch.ride, race: s.race.phase, scores: s.match.scores.length };
      });
      expect(started).toMatchObject({ world: 'generated', devices, seats, views: seats,
        phase: 'running', ride: 'knockabout', race: 'idle', scores: seats });
      expect(started.targets).toBeGreaterThan(0);
      await pauseFromSeat(page, seats - 1);
      await page.locator('[data-menu="pause-couch"] [data-couch-mode="freeRide"]').click();
      expect(await page.evaluate(() => window.game.snapshot().match.phase)).toBe('idle');
      expect(errors).toEqual([]);
    });
  }
}

test('a world that cannot hold the pack refuses the bout instead of standing it on the duel line', async ({
  page,
}) => {
  /*
   * **The refusal branch, driven rather than described** — §37.4, the repair
   * pass.
   *
   * Stage B left `matchPlacement` null when `groupSpawns` refused and let
   * `spawnForSeat` fall through to `spawnSlot` once per seat. §37.4 forbids
   * exactly that — *"do not … run the existing independent-slot fallback N
   * times: two accepted individual slots can be the same slot"*, and *"never
   * accept the current overlapping-base fallback for a bout"* — and
   * `spawnSlots.test.ts`'s *"the independent producer can hand two seats the
   * same slot"* measures both ways it goes wrong on the very spacing that
   * branch used. So the world is refused at the entrance now, and this is the
   * spec that drives the branch instead of asserting `placementFallback` is
   * false on worlds that never refuse.
   *
   * **The refusal is real**: `setGroupSpawnSeparationScale` scales the pair
   * separation the *shipped* producer must clear, so the whole bounded search
   * runs and refuses all thirty-two candidates for want of room. Nothing is
   * stubbed and no code path is special-cased for the spec.
   *
   * Both doors, because they answer differently on purpose (§37.2): the join
   * panel's entrance opens the routes panel, and the pause card refuses before
   * writing anything because `routes` is not a successor of `paused`.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);

  // -- The join panel: the entrance names the fix --------------------------
  await page.evaluate(() => { window.game.setGroupSpawnSeparationScale(50); });
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('hasn’t room to start 3 riders');

  const refused = await page.evaluate(() => {
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      claims: snapshot.input.devices.filter((device) => device !== null).length,
      ride: snapshot.couch.ride,
      match: snapshot.match.phase,
      countdown: snapshot.match.countdown,
      placement: snapshot.match.placementSeed,
      fallback: snapshot.match.placementFallback,
      equipped: snapshot.paddle.equipped,
    };
  });
  expect(refused.seats, 'a refusal sent somebody home').toBe(3);
  expect(refused.claims, 'every claim survives the refusal').toBe(3);
  expect(refused.ride, 'the choice was thrown away rather than kept').toBe('knockabout');
  expect(refused.match, 'a bout was armed on a world that cannot hold one').toBe('idle');
  expect(refused.countdown).toBe(0);
  expect(refused.placement).toBe('');
  expect(refused.fallback, 'the refused bout was standing on the fallback').toBe(false);
  expect(refused.equipped, 'a paddle was handed out for a bout nobody is in').toBe(false);

  // -- The negative control: the same room, the same world, the real bound --
  await page.evaluate(() => { window.game.setGroupSpawnSeparationScale(1); });
  await page.locator('.euc-menu--routes [data-menu="seed"]').fill(BRAWL_SEED);
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'knockabout',
    undefined,
    { timeout: 60000 },
  );
  const armed = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      phase: snapshot.match.phase,
      fallback: snapshot.match.placementFallback,
      clearance: snapshot.match.placementClearance,
    };
  });
  expect(armed.phase, 'the world refused a bout it can actually hold').toBe('countdown');
  expect(armed.fallback).toBe(false);
  expect(armed.clearance).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES);
  expect(await closestPair(page)).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);

  // -- The pause card requests a course without immediately moving anybody --
  //
  // Out to a free ride first, because that is the screen the switch is offered
  // from; then the world stops fitting under the room.
  //
  // The loop is handed back first: the measurement above froze it, and a
  // stopped loop is a game that never sees the key.
  await page.evaluate(() => { window.game.loop.setRunning(true); });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  await page.evaluate(() => {
    window.game.setGroupSpawnSeparationScale(50);
    window.game.loop.setRunning(false);
    window.game.advance(30);
  });

  await pauseFromSeat(page, 1);
  await expect(page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]'))
    .toBeEnabled();
  await expect(page.locator('[data-menu="pause-couch"] .euc-field__note'))
    .toContainText('fresh course with room');

  const around = await page.evaluate(() => {
    const game = window.game;
    const read = () => ({
      state: game.snapshot().app.state,
      ride: game.snapshot().couch.ride,
      match: game.snapshot().match.phase,
      poses: Array.from({ length: game.seatCount }, (_unused, seat) => {
        const euc = game.snapshotFor(seat).euc;
        return { x: euc.position.x, y: euc.position.y, z: euc.position.z, heading: euc.headingY };
      }),
    });
    const before = read();
    // A request may become pending, but the old room stays until success.
    game.switchCouchRide('knockabout');
    return { before, after: read() };
  });
  expect(around.after).toEqual(around.before);
  expect(around.after.state).toBe('paused');
  expect(around.after.ride).toBe('freeRide');
  expect(errors).toEqual([]);
});

test('the reach slider re-asks the no-room question instead of being answered from a stale memo', async ({
  page,
}) => {
  /*
   * **The memo is keyed on the weapon, not only on the world and the width** —
   * the repair pass, §37.4.
   *
   * `matchPackFits` caches the answer to *"can this world hold a bout for this
   * room?"*, and the question `groupPackFor` actually asks is posed with the
   * **live** paddle and rider hit radius, times the QA scale.
   * `PADDLE.reach` is a registered F4 row (0.8–2.2 m) that
   * `applyTuning` pushes straight onto that paddle, and nothing there went
   * near the memo — so a key naming only the world, the seed, the width and
   * the scale let the greyed control and the handler hold two opinions about
   * the same room. That is precisely the state M26's rule exists to prevent:
   * `switchCouchRide` passing on a stale `true`, `enterKnockabout` then
   * refusing, and `openRoutes('knockabout')` being refused by `goTo` because
   * `routes` is not a successor of `paused` — the press doing everything
   * except switching the mode.
   *
   * **Driven through the real slider and the real producer.** The QA scale
   * fixes a separation budget the world genuinely cannot stretch over: at the
   * slider's minimum the pack the shipped search must clear is 1.80 m × 24 =
   * 43.2 m and `route-41` accepts it; at its maximum it is 3.20 m × 24 =
   * 76.8 m and the same world refuses all thirty-two candidates. The world's
   * own boundary sits at ≈55 m (headless bisection over the shipped
   * `groupSpawns`), so both ends are far clear of it and nothing is stubbed.
   * Both directions are asserted, because a memo that had simply been dropped
   * would also have to come *back* to yes.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="freeRide"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const PAUSE_KNOCKABOUT = '[data-menu="pause-couch"] [data-couch-mode="knockabout"]';
  const setReach = (reach: number) => page.evaluate((metres) => {
    window.game.tuning.set('PADDLE.reach', metres);
  }, reach);
  const resume = async () => {
    await page.locator('.euc-menu--pause [data-menu="resume"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  };

  // -- The narrow weapon: the world has room, and the card says so -----------
  await setReach(0.8);
  await page.evaluate(() => { window.game.setGroupSpawnSeparationScale(24); });
  await pauseFromSeat(page, 1);
  await expect(page.locator(PAUSE_KNOCKABOUT), 'the world refused a bout it can hold')
    .toBeEnabled();

  // -- The slider, and nothing else, moves --------------------------------
  await resume();
  await setReach(2.2);
  await pauseFromSeat(page, 1);
  await expect(page.locator(PAUSE_KNOCKABOUT), 'a new course is available from this card')
    .toBeEnabled();
  await expect(page.locator('[data-menu="pause-couch"] .euc-field__note'))
    .toContainText('fresh course with room');

  // -- Back down the slider: the answer returns, so this is a re-ask --------
  await resume();
  await setReach(0.8);
  await pauseFromSeat(page, 1);
  await expect(page.locator(PAUSE_KNOCKABOUT), 'the refusal stuck after the weapon shrank again')
    .toBeEnabled();
  expect(errors).toEqual([]);
});

test('a refused bout writes nothing on the one card that cannot open the routes panel', async ({
  page,
}) => {
  /*
   * **The refusal is mutation-free on *every* door** — §37.8 item 2, the
   * repair pass.
   *
   * `enterKnockabout` answers a refused pack by opening the routes panel and
   * writing `'needs-room'` on it. `results` lists no `routes` successor
   * (`app/appState.ts`), so from the results card's *Ride it again* the
   * `goTo('routes')` inside `openRoutes` refuses and the panel never appears —
   * but the status line was written anyway, leaving a stale refusal for
   * whenever the routes panel next opened for some other reason, on a press
   * that had already done nothing visible.
   *
   * **Not reachable on shipped content**, which is why this is a small spec
   * rather than a new control: pack acceptance is a property of the world and
   * the seat count (Phase 2: 174/174), the card on screen is itself proof that
   * this world held this room, and the only results edge that changes the
   * world — *New route* — lands in `freeRide`. The QA bridge makes the real
   * producer really refuse so the branch can be walked at all; what is being
   * held is that a door which cannot speak also does not write.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await rideOutCount(page);

  // One knockdown decides it, exactly as the results-card spec above ends a
  // match: the fight itself is Stage A's and is not repeated here.
  const decided = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 1);
    game.match.knockdown(1);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return game.snapshot().app.state;
  });
  expect(decided).toBe('results');

  const pressed = await page.evaluate(() => {
    const game = window.game;
    const read = () => ({
      state: game.snapshot().app.state,
      ride: game.snapshot().couch.ride,
      match: game.snapshot().match.phase,
      status: game.snapshot().route.status,
    });
    // The world stops being able to hold the room between the card and the
    // press — the real 32-candidate search, driven to a real refusal.
    game.setGroupSpawnSeparationScale(50);
    const before = read();
    return { before, after: read() };
  });
  expect(pressed.before.status).toBe('idle');

  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  const after = await page.evaluate(() => ({
    state: window.game.snapshot().app.state,
    ride: window.game.snapshot().couch.ride,
    match: window.game.snapshot().match.phase,
    status: window.game.snapshot().route.status,
  }));
  expect(after, 'the refused press changed something on the card').toEqual(pressed.before);
  expect(after.state, 'a refused bout left the results card').toBe('results');
  expect(after.match, 'the decided match was re-armed on a world that cannot hold one')
    .toBe('ended');
  expect(after.status, 'a status was written onto a panel the press could not open')
    .toBe('idle');
  expect(errors).toEqual([]);
});

test('a finished three-way match rides another one, plays next, and takes a new route', async ({
  page,
}) => {
  /*
   * **The results card's three exits at N** (§37.2's "entrances, exits,
   * restart"). One journey rather than three, because what is being held is
   * that the *session* survives all of them: the room, the claims and the
   * devices are the same three people at the end as at the start, and every
   * arrival is a fresh bout with a fresh pack and nil-nil tallies.
   *
   * The match is ended through the bridge's tally rather than by swinging —
   * Stage A's fifteen specs are where a real knockdown is proved, and doing it
   * again here would be a slower copy of them.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await rideOutCount(page);

  // One knockdown wins it, so the card arrives without a fight.
  const first = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 1);
    const seed = game.snapshot().match.placementSeed;
    game.match.knockdown(1);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return { seed, state: game.snapshot().app.state, winner: game.snapshot().match.winner };
  });
  expect(first.state).toBe('results');
  expect(first.winner).toBe(1);
  await expect(page.locator('.euc-menu--results')).toBeVisible();

  // -- Ride it again ------------------------------------------------------
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  const again = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      phase: snapshot.match.phase,
      knockdowns: snapshot.match.scores.map((score) => score.knockdowns),
      seed: snapshot.match.placementSeed,
      fallback: snapshot.match.placementFallback,
    };
  });
  expect(again.seats, 'the room did not survive its own results card').toBe(3);
  expect(again.phase, 'a restart is a new bout, and a new bout counts down').toBe('countdown');
  expect(again.knockdowns).toEqual([0, 0, 0]);
  expect(again.seed, 'a restart must be a new draw — q170').not.toBe(first.seed);
  expect(again.fallback).toBe(false);

  // -- Play next: the results chooser, out to a free ride and back ---------
  const second = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 1);
    for (let step = 0; step < 1200 && game.snapshot().match.phase === 'countdown'; step += 1) {
      game.advance(1);
    }
    game.match.knockdown(2);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return { state: game.snapshot().app.state, seed: game.snapshot().match.placementSeed };
  });
  expect(second.state).toBe('results');
  await page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  const ride = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match.phase,
    equipped: window.game.snapshot().paddle.equipped,
  }));
  expect(ride.seats, 'leaving the fight sent somebody home').toBe(3);
  expect(ride.match, 'a free ride left a referee armed behind it').toBe('idle');
  expect(ride.equipped, 'no paddle in a free ride').toBe(false);

  await pauseFromSeat(page, 0);
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  const back = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    return {
      phase: window.game.snapshot().match.phase,
      seed: window.game.snapshot().match.placementSeed,
      knockdowns: window.game.snapshot().match.scores.map((score) => score.knockdowns),
    };
  });
  expect(back.phase).toBe('countdown');
  expect(back.knockdowns).toEqual([0, 0, 0]);
  expect(back.seed).not.toBe(second.seed);

  // -- New route: a world swap that still arrives in a fight ---------------
  const third = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 1);
    for (let step = 0; step < 1200 && game.snapshot().match.phase === 'countdown'; step += 1) {
      game.advance(1);
    }
    game.match.knockdown(0);
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
    return { state: game.snapshot().app.state, world: game.snapshot().world.seed };
  });
  expect(third.state).toBe('results');
  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'knockabout',
    undefined,
    { timeout: 60000 },
  );
  const swapped = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      world: snapshot.world.seed,
      phase: snapshot.match.phase,
      scores: snapshot.match.scores.length,
      fallback: snapshot.match.placementFallback,
      clearance: snapshot.match.placementClearance,
    };
  });
  expect(swapped.seats, 'a new route sent the room home').toBe(3);
  expect(swapped.world, 'the world did not actually change').not.toBe(third.world);
  expect(swapped.phase).toBe('countdown');
  expect(swapped.scores).toBe(3);
  expect(swapped.fallback, 'the group start was refused on a freshly generated route').toBe(false);
  expect(swapped.clearance).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES);
  expect(await closestPair(page)).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);
  expect(errors).toEqual([]);
});

test('a race takes the room from a counting bout and leaves nothing armed behind', async ({
  page,
}) => {
  /*
   * **The transition §37.2 names, and the stand-down it tests** (§37.3: "every
   * mode/world/title exit abandons the count cleanly"). A count is the state
   * that did not exist before M37, so every exit is a new chance to leave one
   * on screen — which is the exact defect the race's own `enterState`
   * stand-down was written for ("a race left armed would keep a countdown on
   * screen in a free ride").
   *
   * Three seats, and the fight is left **mid-count** on purpose: the moment a
   * count is abandoned is the moment nothing may survive it. The journey then
   * runs race → free ride → title, which is the other two exits, and each one
   * is asserted to have taken its own referee with it.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  expect(await page.evaluate(() => window.game.snapshot().match.phase)).toBe('countdown');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="race"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

  const racing = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      match: snapshot.match.phase,
      matchCountdown: snapshot.match.countdown,
      race: snapshot.race.phase,
      placement: snapshot.match.placementSeed,
      equipped: snapshot.paddle.equipped,
    };
  });
  expect(racing.seats).toBe(3);
  expect(racing.match, 'the bout was left armed inside a race').toBe('idle');
  expect(racing.matchCountdown, 'an abandoned count still had seconds on it').toBe(0);
  expect(racing.race, 'the race did not take the room').toBe('countdown');
  expect(racing.placement, 'a stale pack was still being reported').toBe('');
  expect(racing.equipped, 'a paddle came to the race').toBe(false);

  // **And the race's own count is left exactly as it shipped** — the repair
  // pass. §37.4 asks for any-seat pause and mute to stay live through the
  // *bout's* hold; Stage B asked it of `startFrozen`, which is both counts, and
  // so quietly made a race countdown pausable by a seat. Nothing pinned the old
  // behaviour, so this does: a seat's `pause` during a standing grid is still
  // claimed by nobody, and the room is still racing after it.
  const duringRaceCount = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(1, { pause: true });
    game.advance(2);
    game.setActionsFor(1, { pause: false });
    game.advance(1);
    return { state: game.snapshot().app.state, race: game.snapshot().race.phase };
  });
  expect(duringRaceCount.state, 'a seat paused the race’s own countdown — M37 did not touch it')
    .toBe('trackDay');
  expect(duringRaceCount.race).toBe('countdown');

  // Past GO the pad is the player's again, which is how this card is reached.
  await page.evaluate(() => { window.game.loop.setRunning(true); });
  await page.waitForFunction(() => window.game.snapshot().race.phase === 'running');
  await pauseFromSeat(page, 1);

  // The lap venue has no stands, so the switch offers a generated course.
  await expect(page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]'))
    .toBeEnabled();
  await expect(page.locator('[data-menu="pause-couch"] .euc-field__note'))
    .toContainText('fresh course with targets');

  // Out to a free ride instead, and the race stands down the way the bout did.
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  const loose = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      race: snapshot.race.phase,
      match: snapshot.match.phase,
      placement: snapshot.match.placementSeed,
      equipped: snapshot.paddle.equipped,
      countdown: window.game.snapshotFor(0).hud.countdown,
    };
  });
  expect(loose.seats, 'leaving the race sent somebody home').toBe(3);
  expect(loose.race, 'a race left armed would keep a countdown on screen in a free ride')
    .toBe('idle');
  expect(loose.match).toBe('idle');
  expect(loose.placement).toBe('');
  expect(loose.equipped).toBe(false);
  expect(loose.countdown, 'a count was left on screen in a free ride').toBe('');

  // The title is the last exit, and it clears the room as well as the referee.
  await page.evaluate(() => { window.game.setAppState('title'); });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  const home = await page.evaluate(() => ({
    seats: window.game.seatCount,
    match: window.game.snapshot().match.phase,
    placement: window.game.snapshot().match.placementSeed,
    claims: window.game.snapshot().input.devices.filter((device) => device !== null).length,
  }));
  expect(home.seats, 'the title is what closes a couch').toBe(1);
  expect(home.match).toBe('idle');
  expect(home.placement).toBe('');
  expect(home.claims).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. The countdown
// ---------------------------------------------------------------------------

test('nobody moves between the arming and GO, and the hill proves the freeze is doing it', async ({
  page,
}) => {
  /*
   * **§37.4's freeze, with its positive control** (q170).
   *
   * The negative half — three riders' positions byte-identical from the arming
   * tick to GO — is what the player is promised. On its own it proves nothing:
   * a room standing on flat ground does that with no freeze at all, which is
   * exactly why Phase 2 measured the controller rather than assuming it.
   * `NEUTRAL_ACTIONS` does not hold a slope; the longitudinal model applies
   * `−g·sin(slope)` whatever the input says, and only the surface's rolling
   * resistance holds a parked wheel.
   *
   * So one rider is teleported onto a real 4 % pavement descent for the whole
   * count (the ground facts are asserted first, so a changed world fails
   * loudly), and the *same* rider on the *same* hill with the *same* neutral
   * input is then given the same number of steps after GO. Frozen: nothing.
   * Released: they roll away. The freeze is the only difference between the
   * two halves.
   *
   * `match.countdownHeldSteps` is the third leg and the one an absence cannot
   * supply: it counts the steps `stepSeat` returned on above
   * `EucController.step`, so a count that silently stopped running would be
   * caught rather than read as a very still room.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  // The fixture's own ground, asserted before it is used.
  const ground = await page.evaluate((hill) => {
    const game = window.game;
    const here = game.sampleGround(hill.x, hill.z);
    const ahead = game.sampleGround(
      hill.x + Math.sin(hill.headingY) * 2,
      hill.z + Math.cos(hill.headingY) * 2,
    );
    return {
      surface: here.surface,
      aheadSurface: ahead.surface,
      grade: (here.height - ahead.height) / 2,
    };
  }, HILL);
  expect(ground.surface, 'the hill is not the surface the creep was measured on').toBe('pavement');
  expect(ground.aheadSurface).toBe('pavement');
  expect(
    ground.grade,
    'the hill is not steep enough for a parked wheel to roll down it',
  ).toBeGreaterThan(HILL.gradeAtLeast);

  await page.evaluate((hill) => {
    const game = window.game;
    game.loop.setRunning(false);
    const ground = game.sampleGround(hill.x, hill.z);
    game.placeRider({ x: hill.x, y: ground.height, z: hill.z }, hill.headingY, 2);
    game.clearActions();
    game.advance(1);
  }, HILL);

  const before = await posesOf(page);
  const count = await rideOutCount(page);
  const after = await posesOf(page);

  expect(count.phase, 'the bout never reached GO').toBe('running');
  expect(count.steps, 'the count was over before it started').toBeGreaterThan(100);
  // Every seat, byte for byte. `toEqual` on the numbers rather than a
  // tolerance: a freeze that lets a rider drift a micron is not a freeze.
  expect(after).toEqual(before);
  expect(count.moved).toEqual([0, 0, 0]);
  // The positive half of "nothing happened": the steps were taken, and every
  // one of them skipped every seat.
  expect(count.heldStepsGained).toBe(count.steps * 3);
  // 3, 2, 1 and no silent zero — the race's presentation, reused (§37.4).
  expect(count.countdownSeen).toEqual([3, 2, 1]);

  // -- The control: the same hill, the same input, the room released -------
  const rolled = await page.evaluate((steps) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    const from = game.snapshotFor(2).euc.position;
    for (let step = 0; step < steps; step += 1) game.advance(1);
    const to = game.snapshotFor(2).euc.position;
    return {
      drift: Math.hypot(to.x - from.x, to.z - from.z),
      speed: Math.abs(game.snapshotFor(2).euc.speed),
    };
  }, count.steps);
  expect(
    rolled.drift,
    'the hill does not roll a parked rider, so the freeze above proved nothing',
  ).toBeGreaterThan(0.05);
  expect(rolled.speed).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a button held through the count buys nothing at GO', async ({ page }) => {
  /*
   * **The fourth menu-boundary door, for the bout** (§37.4). A press made
   * during the freeze is never claimed — the one-shot loop iterates only the
   * globals — so it stays latched in its buffer and would otherwise fire on
   * the first live step. GO clears every seat's pending one-shots, cancels
   * every paddle and drops any dwell a held input began.
   *
   * Held for the *whole* count and released a step after GO, which is the case
   * a press-and-release cannot reach: it is the one where the buffer is still
   * full at the moment the room is let go.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const verdict = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // Every seat leans on everything at once, for the whole hold.
    for (let seat = 0; seat < game.seatCount; seat += 1) {
      game.setActionsFor(seat, { swing: true, hop: true, hopHeld: true, throttle: 1 });
    }
    let heldSteps = 0;
    while (heldSteps < 1200 && game.snapshot().match.phase === 'countdown') {
      game.advance(1);
      heldSteps += 1;
    }
    const atGo = Array.from({ length: game.seatCount }, (_unused, seat) => ({
      paddle: game.snapshotFor(seat).paddle.phase,
      grounded: game.snapshotFor(seat).euc.grounded,
      speed: Math.abs(game.snapshotFor(seat).euc.speed),
    }));
    // One live step with everything still held down. The presses made during
    // the count are gone; what is held is level input, which the existing
    // convention says takes effect from the release onward.
    game.advance(1);
    const justAfter = Array.from({ length: game.seatCount }, (_unused, seat) => ({
      paddle: game.snapshotFor(seat).paddle.phase,
      grounded: game.snapshotFor(seat).euc.grounded,
      consumedSwing: game.snapshotFor(seat).consumed.swing,
      consumedHop: game.snapshotFor(seat).consumed.hop,
    }));
    return { heldSteps, atGo, justAfter, discs: game.snapshot().match.scores.map((s) => s.discs) };
  });

  expect(verdict.heldSteps).toBeGreaterThan(100);
  for (const [seat, state] of verdict.atGo.entries()) {
    expect(state.paddle, `seat ${seat} swung during the count`).toBe('idle');
    expect(state.grounded, `seat ${seat} hopped during the count`).toBe(true);
    expect(state.speed, `seat ${seat} pulled away during the count`).toBe(0);
  }
  for (const [seat, state] of verdict.justAfter.entries()) {
    expect(state.paddle, `seat ${seat}'s held press bought a swing at GO`).toBe('idle');
    expect(state.grounded, `seat ${seat}'s held press bought a hop at GO`).toBe(true);
    expect(state.consumedSwing, `seat ${seat} claimed a swing across the count`).toBe(0);
    expect(state.consumedHop, `seat ${seat} claimed a hop across the count`).toBe(0);
  }
  expect(verdict.discs, 'a disc was struck during the hold').toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
});

test('pause stops the count and resume carries it on', async ({ page }) => {
  /*
   * **§37.4's live pause, claimed through the *bout's* hold only.**
   *
   * Pause and mute were claimed *inside* `stepSeat`'s held gate, so while a
   * count ran nothing was claimed at all and nobody could pause a countdown.
   * §37.4 requires both to stay live through a hold, and the two globals now
   * reach the latch through `FROZEN_PRESSED_ACTIONS` under `riding &&
   * this.matchFrozen` (`app/Game.ts`): the **bout's** freeze and not
   * `startFrozen`. Stage B briefly asked it of either count, which changed a
   * shipped mode inside a match milestone; the repair pass reverted that, so
   * the **race's** freeze is byte-identical to what it shipped and is pinned
   * 250 lines above by *"a race takes the room from a counting bout"*, whose
   * own assertion reads *"a seat paused the race's own countdown — M37 did not
   * touch it"*. No q174 was raised, because nothing outside the bout changed
   * (`docs/PLANS.md` §37.9).
   *
   * The stop itself needs no new code: `stepKnockabout` returns on the app
   * state, so a paused room is a referee nobody steps, and the remaining
   * seconds are exactly where they were. This asserts all three: the press is
   * heard, the clock does not move behind the card, and resuming carries on.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const stopped = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    // A little way into the hold, so "it did not move" is not "it had not
    // started".
    for (let step = 0; step < 60; step += 1) game.advance(1);
    const running = game.snapshot().match.countdown;
    // The real one-shot, from a seat, through the router — the claim that used
    // to be impossible.
    game.setActionsFor(1, { pause: true });
    game.advance(1);
    game.setActionsFor(1, { pause: false });
    const paused = game.snapshot();
    // Behind the card, for a whole second of steps.
    for (let step = 0; step < 120; step += 1) game.advance(1);
    const later = game.snapshot();
    return {
      running,
      state: paused.app.state,
      atPause: paused.match.countdown,
      later: later.match.countdown,
      phase: later.match.phase,
    };
  });
  expect(stopped.state, 'a seat could not pause a countdown').toBe('paused');
  expect(stopped.running).toBeGreaterThan(0);
  expect(stopped.later, 'the count ran on behind the pause card').toBe(stopped.atPause);
  expect(stopped.phase).toBe('countdown');

  /*
   * Resume through the card's own control, and the count carries on from
   * exactly where it stopped rather than starting again.
   *
   * **The press and the freeze are one round trip** — the Phase 5 repair pass.
   * This read used to be three: a Playwright click, a `waitForFunction`, and
   * then an `evaluate` that froze the loop. Between the first and the last the
   * room was riding in real time, so on a loaded machine the whole remaining
   * count elapsed in the gap and the spec reported a restarted count that had
   * in fact merely finished (43/48 on a machine at load average 53–83; the
   * same five passed alone). Nothing about the room was being measured there:
   * only how fast this process could get a message back to the page.
   *
   * So the control is pressed *inside* the page, on the next statement after
   * which the loop is frozen — one JavaScript task, no frame between them, and
   * no tolerance to choose. `resume.click()` runs the card's own listener, the
   * same one Playwright's click reaches; `isRunning` is read first, because
   * the fact this leg is here for is that the card really did hand the room
   * back to the loop (`Game.updateRunning`), and a freeze that arrived before
   * the resume would make everything below vacuous. The trusted-event journey
   * through this very control is walked twice more in this file.
   */
  const resumed = await page.evaluate(() => {
    const game = window.game;
    const control = document.querySelector<HTMLButtonElement>(
      '.euc-menu--pause [data-menu="resume"]',
    );
    if (control === null) throw new Error('the pause card has no resume control');
    control.click();
    const running = game.loop.isRunning();
    game.loop.setRunning(false);
    const first = game.snapshot().match.countdown;
    game.advance(60);
    return {
      running,
      state: game.snapshot().app.state,
      first,
      after: game.snapshot().match.countdown,
    };
  });
  expect(resumed.state, 'the resume control did not give the room back').toBe('knockabout');
  expect(resumed.running, 'resuming left the loop frozen, so the count could not have run')
    .toBe(true);
  // Where it stopped, not where it began: a count that had restarted would
  // read the full `KNOCKABOUT.countdownSeconds` again. Exactly where it
  // stopped, because no step ran between the press and the reading.
  expect(resumed.first, 'the count began again instead of carrying on')
    .toBeCloseTo(stopped.atPause, 9);
  expect(resumed.after).toBeLessThan(resumed.first);

  const finished = await rideOutCount(page);
  expect(finished.phase, 'a resumed count never reached GO').toBe('running');
  expect(errors).toEqual([]);
});

test('a pad that leaves during the count holds its seat and stops the room', async ({ page }) => {
  /*
   * **The router's own rule, through the new state** (§37.3: "a disconnected
   * controller holds its seat and pauses the room"; the participant list is
   * fixed for a bout). Twice, because the two moments that matter are the two
   * a bout has: inside the hold, and on match point.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    for (let step = 0; step < 60; step += 1) game.advance(1);
  });
  const midCount = await page.evaluate(() => window.game.snapshot().match.countdown);

  // -- Inside the hold ----------------------------------------------------
  await page.evaluate(() => {
    type Pads = { connected: boolean }[];
    (window as unknown as { fakePads: Pads }).fakePads[1].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === 1);
  const gone = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    for (let step = 0; step < 120; step += 1) game.advance(1);
    const snapshot = game.snapshot();
    return {
      state: snapshot.app.state,
      seats: game.seatCount,
      scores: snapshot.match.scores.length,
      countdown: snapshot.match.countdown,
      claiming: snapshot.input.claiming,
      devices: snapshot.input.devices,
    };
  });
  expect(gone.state, 'a controller leaving did not stop the room').toBe('paused');
  expect(gone.seats, 'the seat did not hold').toBe(3);
  expect(gone.scores, 'the participant list changed mid-bout').toBe(3);
  expect(gone.countdown, 'the count ran on with a player unplugged').toBeCloseTo(midCount, 6);
  expect(gone.claiming, 'the window did not reopen for a pad to rejoin').toBe(true);
  expect(gone.devices[1]).toBe(null);

  // The same pad comes back — the seat is still theirs and the count resumes
  // where it stopped.
  await page.evaluate(() => {
    type Pads = { connected: boolean }[];
    (window as unknown as { fakePads: Pads }).fakePads[1].connected = true;
  });
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await claimWithPad(page, 1);
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === null);
  // Pressed inside the page and frozen on the next statement, for the reason
  // *"pause stops the count and resume carries it on"* gives above: a live
  // count read across a protocol round trip measures this machine's load and
  // not the room. One task, no frame between the press and the freeze, so the
  // count can be compared exactly rather than within a guessed tolerance.
  const rejoined = await page.evaluate(() => {
    const game = window.game;
    const control = document.querySelector<HTMLButtonElement>(
      '.euc-menu--pause [data-menu="resume"]',
    );
    if (control === null) throw new Error('the pause card has no resume control');
    control.click();
    const running = game.loop.isRunning();
    game.loop.setRunning(false);
    return {
      running,
      state: game.snapshot().app.state,
      devices: game.snapshot().input.devices,
      countdown: game.snapshot().match.countdown,
    };
  });
  expect(rejoined.state, 'the resume control did not give the room back').toBe('knockabout');
  expect(rejoined.running, 'resuming left the loop frozen, so the count could not have run')
    .toBe(true);
  expect(rejoined.devices[1]).toBe('pad:1');
  // Where it stopped, not where it started: a count that had restarted would
  // read the full duration.
  expect(rejoined.countdown, 'the count started again instead of carrying on')
    .toBeCloseTo(midCount, 9);
  const released = await rideOutCount(page);
  expect(released.phase).toBe('running');

  // -- On match point -----------------------------------------------------
  const point = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 2);
    game.match.knockdown(0);
    game.advance(1);
    return game.snapshot().match.scores.map((score) => score.knockdowns);
  });
  expect(point).toEqual([1, 0, 0]);
  await page.evaluate(() => {
    type Pads = { connected: boolean }[];
    (window as unknown as { fakePads: Pads }).fakePads[0].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === 0);
  const held = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    for (let step = 0; step < 120; step += 1) game.advance(1);
    const snapshot = game.snapshot();
    return {
      state: snapshot.app.state,
      seats: game.seatCount,
      phase: snapshot.match.phase,
      knockdowns: snapshot.match.scores.map((score) => score.knockdowns),
      winner: snapshot.match.winner,
    };
  });
  expect(held.state, 'a pad leaving on match point did not stop the room').toBe('paused');
  expect(held.seats).toBe(3);
  expect(held.phase, 'the match was decided by somebody unplugging').toBe('running');
  expect(held.knockdowns, 'the tallies moved while the room was stopped').toEqual([1, 0, 0]);
  expect(held.winner).toBe(null);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. The group start
// ---------------------------------------------------------------------------

test('two riders still start on the duel line, and start at once', async ({ page }) => {
  /*
   * **The N=2 regression contract** (§37.1). The two-player match keeps its
   * immediate start and its duel spacing, and both are read here off the live
   * room rather than off a constant: `m26.spec.ts`'s own 1.6 m-versus-3 m spec
   * and its positive control are untouched and still green, and this is the
   * same claim asserted from the door M37 changed.
   */
  const errors = collectErrors(page);
  await sitDown(page, 2, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const duel = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      phase: snapshot.match.phase,
      countdown: snapshot.match.countdown,
      heldSteps: snapshot.match.countdownHeldSteps,
      seed: snapshot.match.placementSeed,
      candidate: snapshot.match.placementCandidate,
      fallback: snapshot.match.placementFallback,
    };
  });
  expect(duel.phase, 'two seats must start the instant they are armed — §37.1').toBe('running');
  expect(duel.countdown).toBe(0);
  expect(duel.heldSteps, 'a two-seat bout held the room').toBe(0);
  expect(duel.seed, 'a duel drew a group pack').toBe('');
  expect(duel.candidate).toBe(-1);
  expect(duel.fallback, 'a duel reported the group start as refused').toBe(false);

  const gap = await closestPair(page);
  expect(gap, 'the duel line moved').toBeGreaterThan(REACH_METRES);
  expect(gap).toBeLessThan(GROUP_SEPARATION_METRES + 1);
  expect(errors).toEqual([]);
});

for (const seats of [3, 4] as const) {
  test(`the ${seats}-rider pack clears the weapon and the seed reproduces it`, async ({ page }) => {
    /*
     * **q170's two halves, measured on the live room** (§37.4).
     *
     * *Fair:* every unordered pair clears `Paddle.reachAgainst` plus a margin —
     * read off a real `Paddle` here exactly as `groupSpawn.test.ts` reads it,
     * never a copied 2.15 m — and the old duel spacing is kept as the control
     * that the bound is a real one (`REACH_METRES` below it).
     *
     * *Reproducible:* the same world, seat count and bout ordinal draw the same
     * pack. Two boots rather than two calls, because the claim §37.4 makes is
     * about replaying a world and not about a pure function being pure — that
     * part is already held in `groupSpawn.test.ts`.
     *
     * The swing itself is not attempted here: Phase 2 attacked all 1,566
     * directed opening swings of all 174 accepted packs with a real `Paddle`
     * and none landed, headlessly and far more thoroughly than a browser can.
     * What this adds is that the pack the *game* stands on is one of those.
     */
    const errors = collectErrors(page);
    await sitDown(page, seats, `level=generated&seed=${BRAWL_SEED}`);
    await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

    const pack = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const snapshot = game.snapshot();
      const poses = Array.from({ length: game.seatCount }, (_unused, seat) => {
        const euc = game.snapshotFor(seat).euc;
        return { x: euc.position.x, z: euc.position.z, heading: euc.headingY };
      });
      let closest = Infinity;
      for (let a = 0; a < poses.length; a += 1) {
        for (let b = a + 1; b < poses.length; b += 1) {
          closest = Math.min(closest, Math.hypot(poses[a].x - poses[b].x, poses[a].z - poses[b].z));
        }
      }
      return {
        poses,
        closest,
        seed: snapshot.match.placementSeed,
        candidate: snapshot.match.placementCandidate,
        reported: snapshot.match.placementClearance,
      };
    });

    expect(pack.poses).toHaveLength(seats);
    expect(
      pack.closest,
      'two riders start inside the paddle plus its margin',
    ).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);
    // The reported number is the pack's own, and it is the one that was
    // measured: a snapshot that disagreed with the room would be a report of
    // a different pack.
    expect(pack.reported).toBeCloseTo(pack.closest, 6);
    // The control that the bound is a bound: the separation really is more
    // than the weapon can reach, which is the fact the margin sits on top of.
    expect(GROUP_SEPARATION_METRES).toBeGreaterThan(REACH_METRES);
    // Everybody faces the shared meeting area, so nobody is handed the
    // opening forehand — the headings are all different and none is the
    // plan's own.
    expect(new Set(pack.poses.map((pose) => pose.heading.toFixed(6))).size).toBe(seats);

    // -- The same world again, from a fresh boot ---------------------------
    await page.evaluate(() => { window.game.setAppState('title'); });
    await page.reload();
    await sitDown(page, seats, `level=generated&seed=${BRAWL_SEED}`);
    await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
    const replay = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      return {
        poses: Array.from({ length: game.seatCount }, (_unused, seat) => {
          const euc = game.snapshotFor(seat).euc;
          return { x: euc.position.x, z: euc.position.z, heading: euc.headingY };
        }),
        seed: game.snapshot().match.placementSeed,
        candidate: game.snapshot().match.placementCandidate,
      };
    });
    expect(replay.seed, 'the placement seed is not reproducible').toBe(pack.seed);
    expect(replay.candidate).toBe(pack.candidate);
    expect(replay.poses, 'the same world and seed drew a different pack').toEqual(pack.poses);
    expect(errors).toEqual([]);
  });
}

test('group starts clear the live rider hit radius as well as the live paddle', async ({ page }) => {
  const errors = collectErrors(page);
  await sitDown(page, 4, `level=generated&seed=${BRAWL_SEED}`);
  await page.evaluate(() => {
    window.game.tuning.set('CHASE.riderHitRadius', 2);
  });
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await page.evaluate(() => { window.game.loop.setRunning(false); });

  // The collision query reads this live F4 radius. The spawn producer must
  // clear that same sphere, not the smaller default in the tuning table.
  const radius = await page.evaluate(() => window.game.tuning.get('CHASE.riderHitRadius'));
  expect(await closestPair(page)).toBeGreaterThanOrEqual(groupSeparation(new Paddle(), radius) - 1e-6);
  expect(errors).toEqual([]);
});

test('one rider pressing R goes back to their own slot and nobody else moves', async ({ page }) => {
  /*
   * **§37.4's quick-reset rule.** A single seat's respawn returns *that* rider
   * to *their* place in the pack: it does not re-draw the pack, it does not
   * move anybody else, and it does not touch a single score. The old
   * behaviour — one independent slot producer per seat — would have re-derived
   * a slot for the resetting rider alone and could quietly have put them
   * somewhere else.
   *
   * Then a restart, which is the opposite rule: a new bout is a new seed and a
   * new draw.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await rideOutCount(page);

  const reset = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 9);
    // Tallies that must survive the respawn, put on the board directly: what
    // is being tested is the reset, not the swing.
    game.match.knockdown(0);
    game.match.knockdown(2);
    game.match.knockdown(2);
    game.advance(1);

    const home = Array.from({ length: game.seatCount }, (_unused, seat) => {
      const p = game.snapshotFor(seat).euc.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    const seed = game.snapshot().match.placementSeed;

    // Seat 1 rides away, then presses R — the real one-shot, one step.
    game.setActionsFor(1, { throttle: 1 });
    for (let step = 0; step < 240; step += 1) game.advance(1);
    game.setActionsFor(1, { throttle: 0 });
    const away = game.snapshotFor(1).euc.position;
    const rode = Math.hypot(away.x - home[1].x, away.z - home[1].z);

    game.setActionsFor(1, { reset: true });
    game.advance(1);
    game.setActionsFor(1, { reset: false });
    game.advance(1);

    const back = Array.from({ length: game.seatCount }, (_unused, seat) => {
      const p = game.snapshotFor(seat).euc.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    return {
      home,
      back,
      rode,
      seed,
      seedAfter: game.snapshot().match.placementSeed,
      knockdowns: game.snapshot().match.scores.map((score) => score.knockdowns),
      phase: game.snapshot().match.phase,
    };
  });

  expect(reset.rode, 'seat 1 never left, so the respawn proves nothing').toBeGreaterThan(5);
  // Their own slot, to the metre the pack put them on.
  expect(reset.back[1].x).toBeCloseTo(reset.home[1].x, 6);
  expect(reset.back[1].z).toBeCloseTo(reset.home[1].z, 6);
  // And the other two never noticed.
  expect(reset.back[0]).toEqual(reset.home[0]);
  expect(reset.back[2]).toEqual(reset.home[2]);
  expect(reset.seedAfter, 'a quick reset re-drew the pack').toBe(reset.seed);
  expect(reset.knockdowns, 'a quick reset cost somebody their score').toEqual([1, 0, 2]);
  expect(reset.phase, 'a quick reset ended the bout').toBe('running');

  // -- A restart is the other rule ---------------------------------------
  //
  // Out to a free ride and back, because pressing the *lit* button is not a
  // restart: `switchCouchRide` refuses a press that would change nothing and
  // leaves the way the screen's own primary action leaves, which on a pause
  // card is "resume". That is M26's rule and M37 did not touch it.
  await pauseFromSeat(page, 0);
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  await pauseFromSeat(page, 0);
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  const restarted = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    const snapshot = window.game.snapshot();
    return {
      seed: snapshot.match.placementSeed,
      knockdowns: snapshot.match.scores.map((score) => score.knockdowns),
      phase: snapshot.match.phase,
    };
  });
  expect(restarted.seed, 'a restart must be a fresh draw — q170').not.toBe(reset.seed);
  expect(restarted.knockdowns).toEqual([0, 0, 0]);
  expect(restarted.phase).toBe('countdown');
  expect(errors).toEqual([]);
});

test('a room that goes four, three, one and four again leaves nothing behind', async ({ page }) => {
  /*
   * **The stale-state sweep** (§37.2's "entrances, exits, restart"; §37.3's
   * "starting another bout clears every old result, flight, pending hit and
   * swing-victim latch"). M37 added three things with a lifetime — the pack,
   * the placement seed and the count — and the way a lifetime bug shows up is
   * a room that was one width behaving like the width it used to be.
   *
   * Widths are changed through the bridge's `spawnRider`/`despawnRider` rather
   * than through the panel, deliberately: the panel cannot take a chair away
   * mid-session, and what is being swept is the *room*, not the screen.
   */
  const errors = collectErrors(page);
  await sitDown(page, 4, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  const cycle = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const readings: Record<string, unknown>[] = [];
    const read = (label: string) => {
      const snapshot = game.snapshot();
      let closest = Infinity;
      for (let a = 0; a < game.seatCount; a += 1) {
        for (let b = a + 1; b < game.seatCount; b += 1) {
          const first = game.snapshotFor(a).euc.position;
          const second = game.snapshotFor(b).euc.position;
          closest = Math.min(closest, Math.hypot(first.x - second.x, first.z - second.z));
        }
      }
      readings.push({
        label,
        seats: game.seatCount,
        views: game.renderer.viewCount,
        phase: snapshot.match.phase,
        scores: snapshot.match.scores.length,
        knockdowns: snapshot.match.scores.map((score) => score.knockdowns),
        packed: snapshot.match.placementSeed !== '',
        fallback: snapshot.match.placementFallback,
        closest: Number.isFinite(closest) ? closest : -1,
        equipped: snapshot.paddle.equipped,
      });
    };
    const rideOut = () => {
      for (let step = 0; step < 1200 && game.snapshot().match.phase === 'countdown'; step += 1) {
        game.advance(1);
      }
    };

    rideOut();
    read('four');

    // Down to three, and back into a bout: the width changed, so the room's
    // previous pack must not be the one anybody stands on.
    game.despawnRider();
    game.startKnockabout();
    rideOut();
    read('three');

    // All the way down to one: a solo run arms no referee at all, which is the
    // protected path (§37.8 item 5).
    game.despawnRider();
    game.despawnRider();
    game.startKnockabout();
    read('solo');

    // And back up to four.
    while (game.seatCount < 4) game.spawnRider();
    game.startKnockabout();
    rideOut();
    read('four again');
    return readings;
  });

  const [four, three, solo, again] = cycle;
  expect(four.seats).toBe(4);
  expect(four.phase).toBe('running');
  expect(four.packed).toBe(true);
  expect(four.scores).toBe(4);
  expect(three.seats).toBe(3);
  expect(three.views).toBe(3);
  expect(three.phase).toBe('running');
  expect(three.scores, 'a narrowed room kept the old participant list').toBe(3);
  expect(three.knockdowns).toEqual([0, 0, 0]);
  expect(three.packed).toBe(true);
  expect(three.fallback).toBe(false);
  expect(three.closest as number).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);
  expect(solo.seats).toBe(1);
  expect(solo.phase, 'one rider armed a match').toBe('idle');
  expect(solo.packed, 'a solo run was handed a group pack').toBe(false);
  expect(solo.fallback).toBe(false);
  expect(solo.equipped, 'a solo Knockabout still carries a paddle').toBe(true);
  expect(again.seats).toBe(4);
  expect(again.views).toBe(4);
  expect(again.phase).toBe('running');
  expect(again.scores).toBe(4);
  expect(again.knockdowns).toEqual([0, 0, 0, 0]);
  expect(again.packed).toBe(true);
  expect(again.fallback).toBe(false);
  expect(again.closest as number).toBeGreaterThanOrEqual(GROUP_SEPARATION_METRES - 1e-6);
  expect(errors).toEqual([]);
});

test('sparse pad indices sit down, and a rejoin at a different index keeps the fight', async ({
  page,
}) => {
  /*
   * **The hostile device shape, at three** (m25's own rule: a fake API must not
   * be tidier than the real one). A disconnected pad leaves a `null` *hole* in
   * `navigator.getGamepads`, so the pads that claim here are indices 0 and 2
   * with slot 1 empty, and the replacement is a pad at an index nobody has
   * used — which is the only way a rejoin is proved by something other than
   * the same pad coming back.
   *
   * The bout is the thing being protected: a seat is device identity's
   * *holder*, never its owner, so a player who comes back on a different pad
   * comes back to their own tally.
   */
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
    const pads = [make(0, true), make(1, false), make(2, true), make(3, false)];
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  });
  await bootToTitle(page, `level=generated&seed=${BRAWL_SEED}`);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });

  await claimWithPad(page, 0);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  await claimWithPad(page, 2);
  await page.waitForFunction(() => window.game.snapshot().input.devices[1] === 'pad:2');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().input.devices[2] === 'keyboard');

  expect(await knockaboutOff(page)).toBe(false);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await rideOutCount(page);

  const armed = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 9);
    game.match.knockdown(1);
    game.match.knockdown(1);
    game.advance(1);
    return {
      devices: game.snapshot().input.devices,
      knockdowns: game.snapshot().match.scores.map((score) => score.knockdowns),
    };
  });
  expect(armed.devices).toEqual(['pad:0', 'pad:2', 'keyboard']);
  expect(armed.knockdowns).toEqual([0, 2, 0]);

  // Seat 1's pad leaves, and a *different* one comes back.
  await page.evaluate(() => {
    type Pads = { connected: boolean }[];
    (window as unknown as { fakePads: Pads }).fakePads[2].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === 1);
  await page.evaluate(() => {
    type Pads = { connected: boolean }[];
    (window as unknown as { fakePads: Pads }).fakePads[3].connected = true;
  });
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await claimWithPad(page, 3);
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === null);

  const rejoined = await page.evaluate(() => ({
    devices: window.game.snapshot().input.devices,
    seats: window.game.seatCount,
    knockdowns: window.game.snapshot().match.scores.map((score) => score.knockdowns),
    phase: window.game.snapshot().match.phase,
  }));
  expect(rejoined.devices, 'the rejoining pad took a different seat').toEqual([
    'pad:0', 'pad:3', 'keyboard',
  ]);
  expect(rejoined.seats).toBe(3);
  expect(rejoined.knockdowns, 'a new device is a new player as far as the score goes').toEqual(
    [0, 2, 0],
  );
  expect(rejoined.phase).toBe('running');
  expect(errors).toEqual([]);
});

test('the room is counted down on screen, once, in the announcing pane', async ({ page }) => {
  /*
   * **The presentation half of §37.4**: the count reaches the HUD, and it
   * reaches it through the element the race already uses rather than through a
   * second one. `HudOptions.announcesCountdown` is set for seat 0 alone
   * (`Game`'s own `index === 0`), and `ui/hud.ts` strips `role`/`aria-live`
   * from every other pane's copy — so three panes show the number and one
   * announces it, which is the existing answer to "no announcement storm at N
   * panes" and is asserted here rather than assumed.
   *
   * **Driven by `advance`, like everything else in this file** — the Phase 5
   * repair pass. `Loop.advance` steps and then *draws* (`app/loop.ts`, at
   * `alpha = 1`), so a frozen room still puts each step on screen and the lane
   * read below is the real one written by `ui/hud.ts` on a real frame. The
   * sampler used to ride real frames instead, waiting on `requestAnimationFrame`
   * between reads: on a loaded machine a stalled frame let the fixed-step
   * accumulator swallow a whole second of label and the distinct run came back
   * two entries short — a measurement of the machine, not of the room.
   */
  const errors = collectErrors(page);
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();

  /*
   * **The freeze is armed before the door opens.** `waitForFunction` polls
   * *inside the page*, so the frame that first sees the bout armed is the
   * frame that stops the clock — where an `evaluate` sent after the fact
   * spends a protocol round trip first, and the count spends it riding. What
   * comes back is the clock as it stood at that moment, and the top of the
   * count is then asserted rather than assumed: catching the room at 2.4 s
   * would make a three-entry run correct and this spec wrong about it.
   */
  const caught = page.waitForFunction(() => {
    const game = window.game;
    if (game.snapshot().app.state !== 'knockabout') return false;
    game.loop.setRunning(false);
    return game.snapshot().match.countdown;
  });
  await page.locator(COUCH_START).click();
  const startedAt = await (await caught).jsonValue();
  expect(startedAt, 'the room was not caught at the top of its own count')
    .toBeGreaterThan(2);

  /*
   * **One round trip, and it collects the whole sequence.** A single sampled
   * frame cannot tell a count that ticks from a lane stuck on a number, which
   * is what the Stage B report's "3 → 2 → 1 → GO" claim rested on. This reads
   * the announcing pane's own `textContent` after every step of the rest of
   * the hold and reports the distinct run, in order — the drawn lane rather
   * than the model behind it, with the model collected beside it so a pane
   * that stops being repainted cannot pass as one that is.
   *
   * `3, 2, 1` and then **nothing** — deliberately not `GO`. `countdownLabel`
   * (`ui/hudModel.ts`) spells a zero `GO` and `hudModel.test.ts` unit-tests
   * that spelling, but no phase ever presents it: `stepCountdown` flips to
   * `running` on the same step the clock reaches zero, and `HudInput.countdown`
   * is `undefined` for a running match. So the release *clears* the lane rather
   * than writing an instruction on it — the race's shipped behaviour, reused
   * verbatim. The step that clears it is drawn by the same `advance` that took
   * it, which is why the run ends in `''` without a frame being waited for.
   */
  const counted = await page.evaluate(() => {
    const game = window.game;
    // The arming ran `updateRunning`, which answers to the app state rather
    // than to the freeze above it; a second freeze costs nothing and no step
    // can have run in between, because this is the first statement of the
    // first task the page has been given since.
    game.loop.setRunning(false);
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-hud="count"]')];
    const live = nodes.map((node) => node.getAttribute('aria-live'));
    const announcing = nodes.find((node) => node.getAttribute('aria-live') !== null) ?? nodes[0];

    const drawn: string[] = [];
    const modelled: string[] = [];
    const push = (into: string[], label: string): void => {
      if (into[into.length - 1] !== label) into.push(label);
    };
    let steps = 0;
    let disagreed = 0;
    while (steps < 1200 && game.snapshot().match.phase === 'countdown') {
      game.advance(1);
      steps += 1;
      const seen = Array.from(
        { length: game.seatCount },
        (_unused, seat) => game.snapshotFor(seat).hud.countdown,
      );
      if (new Set(seen).size !== 1) disagreed += 1;
      push(modelled, seen[0]);
      push(drawn, announcing.textContent ?? '');
    }
    return { panes: nodes.length, live, drawn, modelled, disagreed, steps, hidden: announcing.hidden };
  });
  expect(counted.panes, 'three seats did not draw three count lanes').toBe(3);
  expect(counted.disagreed, 'the panes disagreed about the count').toBe(0);
  expect(
    counted.live.filter((value) => value !== null).length,
    'the room has more than one countdown voice',
  ).toBe(1);
  expect(counted.drawn, 'the lane on screen did not run 3, 2, 1 and then clear')
    .toEqual(['3', '2', '1', '']);
  expect(counted.modelled, 'the model behind the lane did not run 3, 2, 1 and then clear')
    .toEqual(['3', '2', '1', '']);
  expect(counted.hidden, 'the cleared lane was left on screen').toBe(true);

  // And it stays gone once the room is riding, rather than sitting on 1.
  await page.waitForFunction(() => window.game.snapshot().match.phase === 'running');
  await page.waitForFunction(() => window.game.snapshotFor(0).hud.countdown === '');
  expect(errors).toEqual([]);
});

// ===========================================================================
// PHASE 3 STAGE C — the pane tallies, the room's card and the N-way results
// (docs/PLANS.md §37.5)
//
// What these specs hold that nothing else can:
//
//   1. **Every visible HUD row is inside its own 500x350 quadrant**, at three
//      seats and at four, with the longest roster names the chooser can reach
//      and the warnings lit. m27's own fit contract is the spec a new N-row
//      list breaks first, so this is that assertion again with the list on
//      screen — and with two more claims the plan adds: the rows must not reach
//      the middle fifth of the pane, and must not overlap the speed, the
//      warnings or the prompt.
//   2. **The two surfaces that are read standing still rank the room**, and the
//      per-pane list deliberately does not: the idle quadrant's card and the
//      results table both carry the referee's shared places (q169), while the
//      list stays in seat order (§37.5).
//   3. **A draw names the riders who drew.** 5/5/2 is two names, three rows and
//      no winner — the sentence "you both" cannot appear on a card with three
//      people on it.
//   4. **One voice.** One assertive countdown region in the room, no live
//      region on the tally at all, and one polite region that changes at most
//      once for a knockdown that moves the lead — asserted by counting live
//      region mutations rather than by reading the attributes alone.
// ===========================================================================

/** Where Stage C's captures go. Repo-relative by default (invariant 23). */
const SHOTS = `${process.env.M37_SHOTS ?? 'test-results/m37'}/phase3c`;

async function saveShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const body = await page.screenshot();
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

/**
 * Walk each seat's rider chooser to the longest name it can reach.
 *
 * **The real control, on the real panel**, because the worst case §37.5 asks
 * for is a worst case a player can actually produce: the chooser is a stepper
 * per seat and q68 keeps two seats off the same rider, so the room ends on
 * four *different* long names rather than four copies of the longest one.
 *
 * Two passes per seat: the first reads every name the stepper offers and
 * remembers the longest, the second stops on it. Cheaper answers — pressing a
 * fixed number of times, or naming a rider — would break the day the roster
 * grows, which it has nine times.
 */
async function dressLongestNames(page: Page, seats: number): Promise<string[]> {
  const names: string[] = [];
  for (let seat = 0; seat < seats; seat += 1) {
    const step = page.locator(`${COUCH_PANEL} [data-menu="couch-next"][data-couch-step="${seat}"]`);
    const label = page.locator(`${COUCH_PANEL} [data-couch-rider="${seat}"]`);
    const first = (await label.textContent()) ?? '';
    let longest = first;
    for (let press = 0; press < 12; press += 1) {
      await step.click();
      const next = (await label.textContent()) ?? '';
      if (next.length > longest.length) longest = next;
      if (next === first) break;
    }
    for (let press = 0; press < 12; press += 1) {
      if (((await label.textContent()) ?? '') === longest) break;
      await step.click();
    }
    names.push(longest);
  }
  return names;
}

/**
 * A room of three or four in a running bout, through the doors Stage B opened.
 *
 * `bootBrawl` above arms the fight through the QA bridge because Stage A had no
 * door to press; everything here presses the panel's own Knockabout button and
 * its Start, which is the journey §37.5's surfaces are actually reached by.
 */
async function bootFight(
  page: Page,
  seats: number,
  options: { readonly longestNames?: boolean } = {},
): Promise<readonly string[]> {
  await sitDown(page, seats, `level=generated&seed=${BRAWL_SEED}`);
  if (options.longestNames === true) await dressLongestNames(page, seats);
  // Read off the panel rather than from the roster: these are the words the
  // room chose, and every surface below has to agree with them.
  const names: string[] = [];
  for (let seat = 0; seat < seats; seat += 1) {
    names.push((await page.locator(`${COUCH_PANEL} [data-couch-rider="${seat}"]`)
      .textContent()) ?? '');
  }
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await rideOutCount(page);
  expect(await page.evaluate(() => window.game.snapshot().match.phase)).toBe('running');
  return names;
}

/**
 * Put the whole room on the worst honest frame the HUD can draw.
 *
 * `tools/hud-quarter-capture.mjs`'s recipe, applied to every seat instead of
 * one: the comfort-speed floor makes the power ladder speak at road speeds, and
 * flat out from there lights the max-speed glyph beside it. It reports what is
 * actually lit rather than claiming it — the capture tool's own guard, and the
 * reason a fit assertion taken on this frame means something.
 */
async function lightEveryCue(page: Page): Promise<{
  readonly warnings: readonly string[];
  readonly overspeed: readonly number[];
  readonly crashed: readonly boolean[];
  readonly lit: number;
}> {
  return page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const seats = game.seatCount;
    // **Re-asserted every step, not once per chunk.** These rooms are filled
    // through the real join panel, so every seat has a device behind it and the
    // router re-samples that device's resting axes on the next tick — a
    // throttle set once is a throttle held for exactly one step.
    const flatOut = (steps: number): void => {
      for (let step = 0; step < steps; step += 1) {
        for (let seat = 0; seat < seats; seat += 1) game.setActionsFor(seat, { throttle: 1 });
        game.advance(1);
      }
    };
    const state = () => Array.from({ length: seats }, (_u, seat) => ({
      warning: game.snapshotFor(seat).hud.warning,
      overspeed: game.snapshotFor(seat).euc.overspeed,
      crashed: game.snapshotFor(seat).euc.crashed,
    }));
    const litCount = () => state()
      .filter((seat) => seat.warning !== 'none' && seat.overspeed >= 0.42).length;

    // The comfort-speed floor makes the power ladder speak at road speeds; flat
    // out from there lights the max-speed glyph beside it. **Tilt-back is left
    // alone for this phase** — engaging it early holds the speed under the
    // overspeed band, which is the trap the capture tool's own two-phase order
    // avoids.
    // **Both thresholds are dragged down to the road speeds a generated route
    // allows.** The capture tool does this to the power ladder
    // (`powerComfortSpeed`) on a lap circuit's own straight; a bout is fought
    // on a route with things to hit, where nobody reaches 52 mph in the seconds
    // a spec can spend, so the max-speed band's floor comes down with it. What
    // is being arranged here is the worst *HUD*, not the worst physics.
    game.tuning.set('EUC.powerComfortSpeed', 4);
    game.tuning.set('EUC.overspeedBeepShare', 0.2);
    for (let chunk = 0; chunk < 40; chunk += 1) {
      flatOut(20);
      if (state().every((seat) => seat.crashed || seat.overspeed >= 0.5)) break;
    }
    // Then push the ladder to its longest words while the glyph is still lit.
    const before = litCount();
    game.tuning.set('EUC.powerTiltBackLoad', 0.45);
    for (let chunk = 0; chunk < 12; chunk += 1) {
      flatOut(10);
      if (litCount() >= before) break;
    }
    const now = state();
    for (let seat = 0; seat < seats; seat += 1) game.setActionsFor(seat, { throttle: 0 });
    return {
      warnings: now.map((seat) => seat.warning),
      overspeed: now.map((seat) => seat.overspeed),
      crashed: now.map((seat) => seat.crashed),
      lit: now.filter((seat) => seat.warning !== 'none' && seat.overspeed >= 0.42).length,
    };
  });
}

/** Give the referee a scoreboard without swinging — Stage A owns the swings. */
async function seedTallies(
  page: Page,
  knockdowns: readonly number[],
  discs: readonly number[],
): Promise<void> {
  await page.evaluate(({ kos, targets }) => {
    const game = window.game;
    game.loop.setRunning(false);
    for (const [seat, count] of kos.entries()) {
      for (let i = 0; i < count; i += 1) game.match.knockdown(seat);
    }
    for (const [seat, count] of targets.entries()) {
      for (let i = 0; i < count; i += 1) game.match.disc(seat);
    }
    game.advance(2);
  }, { kos: knockdowns, targets: discs });
}

/** Every pane's box, and every visible `[data-hud]` rect inside it. */
interface PaneLayout {
  readonly side: string;
  readonly row: string;
  readonly hudVw: string;
  readonly box: { left: number; top: number; width: number; height: number };
  readonly rows: readonly {
    hook: string; left: number; right: number; top: number; bottom: number;
  }[];
  readonly tally: {
    left: number; right: number; top: number; bottom: number;
    names: readonly string[];
    you: readonly string[];
    youWords: number;
    kos: readonly string[];
    targets: readonly string[];
    units: readonly string[];
    /** Painted width against wanted width, per name — an ellipsis is the gap. */
    nameFit: readonly { client: number; scroll: number }[];
    /** The marker-and-name cell, which must be one width on every row. */
    whoWidths: readonly number[];
    head: string;
    headHidden: boolean;
    field: string;
    label: string;
    value: string;
    valueHidden: boolean;
    asideHidden: boolean;
    live: string | null;
    role: string | null;
    nameSize: number;
    koSize: number;
    targetSize: number;
    /** The "You" marker's own size — the one figure in the list with no floor. */
    youSize: number;
  } | null;
  readonly speed: { left: number; right: number; top: number; bottom: number } | null;
  readonly warning: { left: number; right: number; top: number; bottom: number } | null;
  readonly prompt: { left: number; right: number; top: number; bottom: number } | null;
}

function readPanes(page: Page): Promise<{
  readonly panes: readonly PaneLayout[];
  readonly window: { width: number; height: number };
}> {
  return page.evaluate(() => {
    const rect = (node: Element | null) => {
      if (node === null) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const containers = [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')];
    return {
      panes: containers.map((container) => {
        const box = container.getBoundingClientRect();
        const hud = container.querySelector<HTMLElement>('.euc-hud');
        const list = container.querySelector<HTMLElement>('[data-hud="tally"]');
        const text = (selector: string): string =>
          container.querySelector<HTMLElement>(selector)?.textContent ?? '';
        return {
          side: container.dataset.side ?? '',
          row: container.dataset.row ?? '',
          hudVw: hud === null ? '' : getComputedStyle(hud).getPropertyValue('--hud-vw').trim(),
          box: { left: box.left, top: box.top, width: box.width, height: box.height },
          rows: hud === null ? [] : [...hud.querySelectorAll<HTMLElement>('[data-hud]')]
            .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().width > 0)
            .map((node) => {
              const row = node.getBoundingClientRect();
              return {
                hook: node.dataset.hud ?? '',
                left: row.left, right: row.right, top: row.top, bottom: row.bottom,
              };
            }),
          tally: list === null || list.hidden ? null : {
            ...rect(list)!,
            names: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-name')]
              .map((node) => node.textContent ?? ''),
            you: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-row')]
              .map((node) => node.dataset.you ?? ''),
            youWords: list.querySelectorAll('.euc-hud__tally-you').length,
            kos: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-kos')]
              .map((node) => node.textContent ?? ''),
            targets: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-count')]
              .map((node) => node.textContent ?? ''),
            units: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-unit')]
              .map((node) => node.textContent ?? ''),
            nameFit: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-name')]
              .map((node) => ({ client: node.clientWidth, scroll: node.scrollWidth })),
            whoWidths: [...list.querySelectorAll<HTMLElement>('.euc-hud__tally-who')]
              .map((node) => node.getBoundingClientRect().width),
            head: text('[data-hud="tally-head"]'),
            headHidden:
              container.querySelector<HTMLElement>('[data-hud="tally-head"]')?.hidden ?? true,
            field: text('[data-hud="tally-field"]'),
            label: text('[data-hud="score-label"]'),
            value: text('[data-hud="score-value"]'),
            valueHidden:
              container.querySelector<HTMLElement>('[data-hud="score-value"]')?.hidden ?? true,
            asideHidden:
              container.querySelector<HTMLElement>('[data-hud="score-aside"]')?.hidden ?? true,
            live: list.getAttribute('aria-live'),
            role: list.getAttribute('role'),
            nameSize: Number.parseFloat(getComputedStyle(
              list.querySelector<HTMLElement>('.euc-hud__tally-name')!,
            ).fontSize),
            koSize: Number.parseFloat(getComputedStyle(
              list.querySelector<HTMLElement>('.euc-hud__tally-kos')!,
            ).fontSize),
            targetSize: Number.parseFloat(getComputedStyle(
              list.querySelector<HTMLElement>('.euc-hud__tally-count')!,
            ).fontSize),
            youSize: Number.parseFloat(getComputedStyle(
              list.querySelector<HTMLElement>('.euc-hud__tally-you')!,
            ).fontSize),
          },
          speed: rect(container.querySelector('.euc-hud__speed')),
          warning: (() => {
            const node = container.querySelector<HTMLElement>('[data-hud="warning"]');
            return node === null || node.hidden ? null : rect(node);
          })(),
          prompt: (() => {
            const node = container.querySelector<HTMLElement>('[data-hud="prompt"]');
            return node === null || node.hidden ? null : rect(node);
          })(),
        };
      }),
      window: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

/** Do two boxes share any area at all? */
function overlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Assert the pane partition and that every visible row sits inside its pane.
 *
 * m27's `every HUD sits in its own quarter` assertion, lifted so the four
 * viewport cases below state it once each rather than four times over.
 */
function expectRowsInsidePanes(
  layout: { panes: readonly PaneLayout[]; window: { width: number; height: number } },
  seats: number,
  where: string,
): void {
  expect(layout.panes.length, `${where}: the room did not draw ${seats} panes`).toBe(seats);
  const halfWidth = layout.window.width / 2;
  const halfHeight = layout.window.height / 2;
  for (const [index, pane] of layout.panes.entries()) {
    // A quadrant is exactly as wide as a half, so the type scale it was
    // measured at is already the right one and only the box changes.
    expect(pane.hudVw, `${where}: pane ${index} lost the split's view unit`).toBe('0.5vw');
    expect(pane.box.width).toBeCloseTo(halfWidth, 1);
    expect(pane.box.height).toBeCloseTo(halfHeight, 1);
    for (const row of pane.rows) {
      expect(row.left, `${where}: ${row.hook} in pane ${index} starts left of its pane`)
        .toBeGreaterThanOrEqual(pane.box.left - 0.5);
      expect(row.right, `${where}: ${row.hook} in pane ${index} runs past its right edge`)
        .toBeLessThanOrEqual(pane.box.left + pane.box.width + 0.5);
      expect(row.top, `${where}: ${row.hook} in pane ${index} starts above its pane`)
        .toBeGreaterThanOrEqual(pane.box.top - 0.5);
      expect(row.bottom, `${where}: ${row.hook} in pane ${index} runs past its bottom edge`)
        .toBeLessThanOrEqual(pane.box.top + pane.box.height + 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. The pane tally
// ---------------------------------------------------------------------------

for (const seats of [3, 4] as const) {
  test(`a ${seats}-seat bout lists every rider in every pane, and every row fits its quadrant`,
    async ({ page }, testInfo) => {
      /*
       * **§37.5's whole first bullet, measured.** One row per actual rider,
       * Player N and the character, knockdowns with visual priority, a labelled
       * subordinate target count, stable seat order, "You" on the current seat
       * in text as well as colour, and the field's total said once.
       *
       * Measured on the worst frame the mode can draw: the 1000x700 window the
       * couch entrance's own minimum allows, the longest names the chooser can
       * reach, two-digit tallies, and the power ladder and max-speed glyph lit
       * in every pane. The last of those is asserted rather than assumed, so a
       * physics change that stops lighting them cannot quietly turn this into a
       * fit test of an empty HUD.
       */
      const errors = collectErrors(page);
      await page.setViewportSize({ width: 1000, height: 700 });
      const names = await bootFight(page, seats, { longestNames: true });
      expect(new Set(names).size, 'q68 let two seats wear one rider').toBe(seats);
      expect(
        Math.max(...names.map((name) => name.length)),
        `the chooser never reached a long roster name: ${names.join(', ')}`,
      ).toBeGreaterThanOrEqual(14);

      // A scoreboard that is not in seat order, with the leader away from seat
      // 0, and two-digit counts in the targets column — which is where a bout
      // played to five can actually have two digits. One knockdown short of the
      // target on purpose: a fifth would end the bout and take the HUD with it.
      const kos = seats === 3 ? [2, 4, 3] : [2, 4, 3, 1];
      const discs = seats === 3 ? [10, 3, 14] : [10, 3, 14, 12];
      await seedTallies(page, kos, discs);
      expect(
        await page.evaluate(() => window.game.snapshot().match.phase),
        'the seeded scoreboard ended the bout, so the HUD below is not a fight',
      ).toBe('running');
      // **Reported, not assumed** — the capture tool's own guard. A fit
      // assertion taken on a HUD with no warnings on it is a fit assertion of
      // an empty frame, so the state that was actually reached is asserted
      // before it is measured. Riders flat out on generated ground do fall
      // over, and a crash blanks that pane's cues (never its tally), so the
      // claim is about the room rather than about every seat in it.
      const lit = await lightEveryCue(page);
      expect(
        lit.lit,
        `no pane lit the power ladder and the max-speed glyph together: ${JSON.stringify(lit)}`,
      ).toBeGreaterThan(0);

      const layout = await readPanes(page);
      expectRowsInsidePanes(layout, seats, '1000x700');

      // **The scoreboard is read back off the referee**, not re-stated from the
      // seed above: riding flat out through a route with things on it knocks
      // some of them over, and a spec that pinned the numbers it injected would
      // be failed by the game working. What the seed buys is the *shape* —
      // a leader who is not seat 0, and a column that is not in seat order —
      // and that is what is asserted about it.
      const board = await page.evaluate(() => {
        const match = window.game.snapshot().match;
        return {
          kos: match.scores.map((score) => score.knockdowns),
          discs: match.scores.map((score) => score.discs),
          total: window.game.snapshot().targets.total,
          phase: match.phase,
        };
      });
      expect(board.phase, 'the bout ended while the cues were being lit').toBe('running');
      expect(board.kos.indexOf(Math.max(...board.kos)), 'the leader is seat 0, so seat order and '
        + 'score order agree and the row order proves nothing').not.toBe(0);
      const total = board.total;
      for (const [index, pane] of layout.panes.entries()) {
        const tally = pane.tally;
        expect(tally, `pane ${index} drew no tally list`).not.toBeNull();
        if (tally === null) continue;

        // One row per actual rider, in seat order — asserted against tallies
        // that are deliberately not in seat order, so a list that ranked itself
        // would fail here rather than look tidy.
        expect(tally.kos, `pane ${index} re-ordered the rows`).toEqual(board.kos.map(String));
        expect(tally.targets).toEqual(board.discs.map(String));
        expect(tally.names.length).toBe(seats);
        for (const [seat, name] of tally.names.entries()) {
          // `P1 Cool Rider`, not `Player 1 · Cool Rider`: the measurement
          // behind the abbreviation is in `ui/hudModel.ts` and the full words
          // are on the two cards that are read standing still. **The pane's own
          // row spends its chair on the "You" marker** — the two answer the
          // same question on this pane, and printing both was what cut that
          // row's name to `P1 Whee…`.
          expect(name).toBe(seat === index ? names[seat] : `P${seat + 1} ${names[seat]}`);
        }

        // **Every name is painted whole, the marked row included.** The first
        // build gave the "You" row a 69 px name track against 101-108 px for
        // the rest, so three rows of four ellipsed and the worst was the row
        // §37.5 requires to be identifiable. This is the assertion that says
        // so from the paint rather than from `textContent`, which carries the
        // whole string whatever is on screen — and it is taken at the worst
        // case the mode has: the couch's minimum window, the longest four
        // names its chooser can reach, and two-digit counts.
        for (const [seat, fit] of tally.nameFit.entries()) {
          expect(
            fit.scroll,
            `pane ${index}: "${tally.names[seat]}" is cut — ${fit.scroll} px of name in a `
              + `${fit.client} px track`,
          ).toBeLessThanOrEqual(fit.client + 1);
        }
        // And the cell that holds marker-and-name is one width on every row, so
        // the marked row is not the narrow one. The tolerance is the figures'
        // own column: a one-digit count is a few px narrower than a two.
        const whoSpread = Math.max(...tally.whoWidths) - Math.min(...tally.whoWidths);
        expect(whoSpread, `pane ${index}: the rows' name cells differ by ${whoSpread} px`)
          .toBeLessThanOrEqual(10);

        // "You" on this pane's own seat, in text as well as in the attribute.
        expect(tally.you).toEqual(
          Array.from({ length: seats }, (_u, seat) => (seat === index ? 'true' : 'false')),
        );
        expect(tally.youWords, `pane ${index} marked ${tally.youWords} riders as You`).toBe(1);

        // The subordinate count is named once, by the caption over its own
        // column — and every row still carries the word for a screen reader,
        // which cannot see which column a figure is under.
        expect(tally.head).toBe('targets');
        expect(tally.headHidden).toBe(false);
        expect(tally.units).toEqual(Array.from({ length: seats }, () => 'targets'));
        // Knockdowns have visual priority over the count beside them (§37.5).
        expect(tally.koSize).toBeGreaterThan(tally.nameSize);
        expect(tally.koSize).toBeGreaterThan(tally.targetSize);
        // §9j's own number for this exact second tally is **0.95rem**, and
        // 0.8rem is the size it records as the owner's "kinda hard to read" —
        // the rejected size, not the floor, which is how two builds came to
        // ship it (0.72rem, then 0.8rem) with a comment saying the opposite.
        // The figure is pinned here at what it ships as rather than at what
        // §9j asks for, because 0.95rem does not fit the lane that keeps this
        // list off the pane's playfield centre: it takes the widest row from
        // 178.0 px to 182 px of a 181.6 px lane (four seats, 1000x700, the
        // longest names, the right-hand panes). Paying for it costs the
        // reserved lane, the whole roster names, or §37.5's size priority for
        // the knockdowns — the owner's call, open as a q174 candidate.
        expect(tally.koSize).toBeGreaterThanOrEqual(15.2 - 0.01);
        expect(tally.targetSize, 'the target count is below the size §9j already rejected')
          .toBeGreaterThanOrEqual(12.8 - 0.01);
        expect(tally.nameSize).toBeGreaterThanOrEqual(12.4);
        // **And the marker is a mark rather than a word**, which is a size
        // claim and was the one figure in this list with no floor asserted: at
        // 0.58rem its capitals painted 6.71 px against the 6.76 px *lowercase*
        // of the name beside them, so "YOU Wheel in Motion" read as "you Wheel
        // in Motion". 0.72rem is where the capitals clear the name's x-height.
        expect(tally.youSize, 'the "You" marker reads as the word "you"')
          .toBeGreaterThanOrEqual(11.52 - 0.01);
        expect(tally.youSize, 'the marker is louder than the name it marks')
          .toBeLessThan(tally.nameSize);

        // The label above, and the field's total once underneath — never as a
        // per-rider quota.
        expect(tally.label).toBe('Knockdowns · first to 5');
        expect(tally.field).toBe(`${total} targets on the route`);
        // The duel's own two shapes are off, so the corner never prints a tally
        // twice in two spellings.
        expect(tally.valueHidden, `pane ${index} drew the duel fold over the list`).toBe(true);
        expect(tally.asideHidden).toBe(true);
        // And the list is not a live region — §37.5's no-storm rule, at the
        // element that changes on every knockdown.
        expect(tally.live).toBeNull();
        expect(tally.role).toBeNull();

        // It stays out of the middle fifth of its own pane, in both axes: the
        // reserved-lane rule (`DESIGN.md` §9), which is what keeps the rows off
        // the playfield the rider is looking through.
        const middle = {
          left: pane.box.left + pane.box.width * 0.4,
          right: pane.box.left + pane.box.width * 0.6,
          top: pane.box.top + pane.box.height * 0.4,
          bottom: pane.box.top + pane.box.height * 0.6,
        };
        expect(overlaps(tally, middle), `pane ${index}: the tally reaches the middle of the pane`)
          .toBe(false);
        for (const [what, box] of [
          ['speed', pane.speed], ['warnings', pane.warning], ['the prompt', pane.prompt],
        ] as const) {
          if (box === null) continue;
          expect(overlaps(tally, box), `pane ${index}: the tally covers ${what}`).toBe(false);
        }
      }

      await saveShot(page, testInfo, `tally-${seats}-seats`);
      expect(errors).toEqual([]);
    });
}

test('two seats keep the duel lane they shipped with, and draw no list', async ({ page }) => {
  // §37.5's regression contract. The switch is the *presence* of names, which
  // `Game` hands over only at three and four, so a duel cannot reach any of the
  // new code — and this is the assertion that says so from the DOM rather than
  // from the model's own unit tests.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootFight(page, 2);
  await seedTallies(page, [2, 1], [3, 4]);

  const lane = await page.evaluate(() => {
    const seat = document.querySelectorAll<HTMLElement>('.euc-hud-seat')[0];
    const q = (hook: string) => seat.querySelector<HTMLElement>(`[data-hud="${hook}"]`);
    return {
      label: q('score-label')?.textContent ?? '',
      value: q('score-value')?.textContent ?? '',
      valueHidden: q('score-value')?.hidden ?? true,
      asideLabel: q('score-aside-label')?.textContent ?? '',
      asideValue: q('score-aside-value')?.textContent ?? '',
      asideHidden: q('score-aside')?.hidden ?? true,
      tallyHidden: q('tally')?.hidden ?? true,
      headHidden: q('tally-head')?.hidden ?? true,
      fieldHidden: q('tally-field')?.hidden ?? true,
      status: q('match-status')?.textContent ?? '',
      hud: window.game.snapshotFor(0).hud.matchRows.length,
    };
  });
  expect(lane.label).toBe('You – them (to 5)');
  expect(lane.value).toBe('2 – 1');
  expect(lane.valueHidden).toBe(false);
  expect(lane.asideLabel).toBe('Targets');
  expect(lane.asideValue).toMatch(/^3 – 4 of \d+$/);
  expect(lane.asideHidden).toBe(false);
  expect(lane.tallyHidden, 'a duel grew a list').toBe(true);
  expect(lane.headHidden, 'a duel grew the list\'s column caption').toBe(true);
  expect(lane.fieldHidden).toBe(true);
  expect(lane.status, 'a duel announced something M26 did not').toBe('');
  expect(lane.hud).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 6. The three-seat idle card
// ---------------------------------------------------------------------------

/** The room's card, as the DOM holds it. Null when there is no card at all. */
function readRoomCard(page: Page): Promise<{
  readonly title: string;
  readonly labels: readonly string[];
  readonly values: readonly string[];
  readonly live: string | null;
  readonly role: string | null;
} | null> {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.euc-idle');
    if (card === null || card.hidden) return null;
    return {
      title: card.querySelector<HTMLElement>('.euc-idle__title')?.textContent ?? '',
      labels: [...card.querySelectorAll<HTMLElement>('.euc-idle__label')]
        .map((node) => node.textContent ?? ''),
      values: [...card.querySelectorAll<HTMLElement>('.euc-idle__value')]
        .map((node) => node.textContent ?? ''),
      live: card.getAttribute('aria-live'),
      role: card.getAttribute('role'),
    };
  });
}

test('three seats give the bout the fourth quadrant, and get the world card back', async ({
  page,
}, testInfo) => {
  /*
   * §37.5's second bullet, end to end: *"ranked standings from the referee,
   * including shared places, all three names and both tallies; appropriate
   * countdown and ended state. Gate it and pane tallies on the match's phase so
   * pause keeps them readable. Restore the race/world card on exit."*
   *
   * **The ranking is here and deliberately not in the panes.** Each pane's list
   * is in seat order and marks its own rider; this box is the view from
   * nobody's seat, so it is the one that sorts — and the shared places it sorts
   * on are the referee's (q169), asserted with a 2/1/2 board that has two
   * firsts in it.
   */
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await sitDown(page, 3, `level=generated&seed=${BRAWL_SEED}`);
  const names: string[] = [];
  for (let seat = 0; seat < 3; seat += 1) {
    names.push((await page.locator(`${COUCH_PANEL} [data-couch-rider="${seat}"]`)
      .textContent()) ?? '');
  }
  await page.locator(`${COUCH_MODE}[data-couch-mode="knockabout"]`).click();
  await page.locator(COUCH_START).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  // -- The counted room ----------------------------------------------------
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(2); });
  const counting = await readRoomCard(page);
  expect(counting, 'a counted bout drew no card at all').not.toBeNull();
  expect(counting?.title, 'the card described a bout nobody has started').toBe('Getting ready');
  // A status box, never an `alert`: it must not interrupt a screen reader
  // mid-ride (`ui/idlePane.ts`). **And muted for as long as the bout is on** —
  // filled with standings this box changes on every target struck, which is
  // §37.5's announcement storm; the room's one polite strip says the three
  // things worth saying. The spec that watches for the storm is
  // *"the three-seat room's own card does not read the scoreboard out"* below.
  expect(counting?.role).toBe('status');
  expect(counting?.live).toBe('off');

  await rideOutCount(page);
  await seedTallies(page, [2, 1, 2], [3, 8, 0]);
  const running = await readRoomCard(page);
  expect(running?.title, 'the card lost the rule the rows are read against').toBe('First to 5');
  // Shared places (q169): 2/1/2 is 1, 3, 1 — two firsts, and the seat is the
  // tie-break, so seat 0 is drawn above seat 2.
  expect(running?.labels).toEqual([`1. ${names[0]}`, `1. ${names[2]}`, `3. ${names[1]}`]);
  expect(running?.values).toEqual([
    '2 KO · 3 targets', '2 KO · 0 targets', '1 KO · 8 targets',
  ]);
  await saveShot(page, testInfo, 'room-card-running');

  // -- A pause keeps it readable ------------------------------------------
  await pauseFromSeat(page, 0);
  const paused = await readRoomCard(page);
  expect(paused, 'the card blanked the moment the room paused to read it').not.toBeNull();
  expect(paused?.labels).toEqual(running?.labels);
  expect(paused?.values).toEqual(running?.values);
  await page.locator('.euc-menu--pause [data-menu="resume"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

  // -- The ended state, inside the results delay ---------------------------
  const ended = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', 3);
    game.match.knockdown(1);
    game.match.knockdown(1);
    game.advance(2);
    return { phase: game.snapshot().match.phase, winner: game.snapshot().match.winner };
  });
  expect(ended.phase, 'the third knockdown did not end the bout').toBe('ended');
  expect(ended.winner).toBe(1);
  const over = await readRoomCard(page);
  expect(over?.title).toBe(`${names[1]} wins`);
  expect(over?.labels[0]).toBe(`1. ${names[1]}`);

  // -- And the world card comes back on the way out ------------------------
  // The results delay is a clock the frozen loop has to be walked through.
  await page.evaluate(() => {
    const game = window.game;
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(2); });
  const home = await readRoomCard(page);
  expect(home?.title, 'the bout’s card outlived the bout').toBe('Free ride');
  expect(home?.labels).toEqual(['World', 'Player 1', 'Player 2', 'Player 3']);
  // And it is a voice again: a world card changes about once a session, which
  // is what `aria-live="polite"` was put on this box for in the first place.
  expect(home?.live, 'the world card came back mute').toBe('polite');
  expect(errors).toEqual([]);
});

test('four seats fill every quadrant, so the bout has no room card', async ({ page }) => {
  // The other half of q95's answer, restated for M37: the card exists because a
  // three-pane frame has a hole in it, and a four-pane frame has none. The
  // room's scoreboard is then the four panes' own lists, which is why those are
  // the surface §37.5 spends its legibility rules on.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootFight(page, 4);
  await seedTallies(page, [1, 2, 0, 3], [1, 2, 3, 4]);
  expect(await readRoomCard(page), 'a four-pane frame drew a card over a rider').toBeNull();
  expect(
    await page.evaluate(() => window.game.renderer.idleViewBounds()),
    'the renderer reported a hole in a full frame',
  ).toBeNull();
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 7. The N-way results card
// ---------------------------------------------------------------------------

/** Every word and figure the results card is showing. */
function readResultsCard(page: Page): Promise<{
  readonly heading: string;
  readonly totalCaption: string;
  readonly total: string;
  readonly bestCaption: string;
  readonly best: string;
  readonly caption: string;
  readonly columns: readonly string[];
  readonly extraHidden: boolean;
  readonly compare: string;
  readonly rows: readonly { label: string; time: string; delta: string; extra: string }[];
  readonly notes: readonly string[];
  readonly text: string;
}> {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.euc-menu--results')!;
    const text = (hook: string) =>
      card.querySelector<HTMLElement>(`[data-menu="${hook}"]`)?.textContent ?? '';
    const extraHead = card.querySelector<HTMLElement>('[data-menu="results-column-extra"]');
    return {
      heading: text('results-heading'),
      totalCaption: text('results-total-caption'),
      total: text('results-total'),
      bestCaption: text('results-best-caption'),
      best: text('results-best'),
      caption: text('results-table-caption'),
      columns: [...card.querySelectorAll<HTMLElement>('thead th')]
        .filter((node) => !node.hidden)
        .map((node) => node.textContent ?? ''),
      extraHidden: extraHead?.hidden ?? true,
      compare: card.querySelector<HTMLElement>('[data-menu="results-table"]')?.dataset.compare ?? '',
      rows: [...card.querySelectorAll<HTMLElement>('[data-menu="results-rows"] tr')]
        .map((row) => ({
          label: row.querySelector<HTMLElement>('.euc-results__row-label')?.textContent ?? '',
          time: row.querySelector<HTMLElement>('.euc-results__row-time')?.textContent ?? '',
          delta: row.querySelector<HTMLElement>('.euc-results__row-delta')?.textContent ?? '',
          extra: row.querySelector<HTMLElement>('.euc-results__row-extra')?.textContent ?? '',
        })),
      notes: [...card.querySelectorAll<HTMLElement>('[data-menu="results-notes"] li')]
        .map((node) => node.textContent ?? ''),
      text: card.textContent ?? '',
    };
  });
}

/** End the bout on a given board, and arrive at the card. */
async function endOn(page: Page, target: number, knockdowns: readonly number[]): Promise<void> {
  await page.evaluate(({ to, board }) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('KNOCKABOUT.matchKnockdowns', to);
    for (const [seat, count] of board.entries()) {
      for (let i = 0; i < count; i += 1) game.match.knockdown(seat);
    }
    for (let step = 0; step < 900 && game.snapshot().app.state === 'knockabout'; step += 1) {
      game.advance(1);
    }
  }, { to: target, board: knockdowns });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
}

for (const seats of [3, 4] as const) {
  test(`the card that ends a ${seats}-way bout names the winner and counts everybody`,
    async ({ page }, testInfo) => {
      /*
       * §37.5's third bullet. **Place · Rider · Knockdowns · Targets, three or
       * four rows, shared ranks**, on the surface M27 Phase 4 already grew a
       * fourth column for — so no new markup, and `data-compare` stays false
       * because a couch session compares nothing (q77).
       *
       * The board is chosen so the ranking cannot be the row order: seat 1 wins
       * from the middle of the list, and two seats share second.
       */
      const errors = collectErrors(page);
      const names = await bootFight(page, seats);
      const discs = seats === 3 ? [4, 0, 9] : [4, 0, 9, 2];
      await seedTallies(page, seats === 3 ? [0, 0, 0] : [0, 0, 0, 0], discs);
      const kos = seats === 3 ? [1, 3, 1] : [1, 3, 1, 0];
      await endOn(page, 3, kos);

      const card = await readResultsCard(page);
      expect(card.heading).toBe(`${names[1]} wins`);
      // The table is the scoreboard; the two figures above it are the bout's
      // own two rules rather than a second printing of the order.
      expect(card.totalCaption).toBe('Riders');
      expect(card.total).toBe(`${seats}`);
      expect(card.bestCaption).toBe('Knockdowns to win');
      expect(card.best).toBe('3');

      expect(card.caption).toBe('Match summary');
      expect(card.columns).toEqual(['Place', 'Knockdowns', '', 'Targets']);
      expect(card.extraHidden, 'the Targets column lost its heading').toBe(false);
      expect(card.compare, 'a couch match compared itself against something').toBe('false');

      // Shared ranks, seat as the tie-break, and the winner's own row first.
      const expected = seats === 3
        ? [`1. ${names[1]}`, `2. ${names[0]}`, `2. ${names[2]}`]
        : [`1. ${names[1]}`, `2. ${names[0]}`, `2. ${names[2]}`, `4. ${names[3]}`];
      expect(card.rows.map((row) => row.label)).toEqual(expected);
      expect(card.rows.length, 'the card grew a row that is not a rider').toBe(seats);
      expect(card.rows[0].time).toBe('3');
      expect(card.rows[0].extra).toBe(`${discs[1]}`);
      expect(card.rows.every((row) => row.delta === ''), 'a row was compared').toBe(true);

      // Elapsed is a small fact, and the room is told its bout was not kept.
      expect(card.notes.some((note) => /^Time taken \d+:\d\d\.\d\d$/.test(note)),
        `no "Time taken" fact: ${JSON.stringify(card.notes)}`).toBe(true);
      expect(card.notes).toContain('Couch matches are not saved');
      expect(card.text).not.toContain('Two-player');
      // The time trial's vocabulary, asserted absent where it is still correct
      // somewhere else — M26 Phase 6's own guard.
      for (const stale of ['Splits', 'Checkpoint', 'vs best']) {
        expect(card.text, `the card still says "${stale}"`).not.toContain(stale);
      }

      // -- The safe first focus, and what the button actually says ----------
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return { menu: active?.dataset.menu ?? '', text: active?.textContent?.trim() ?? '' };
      });
      expect(focus.menu, 'the cursor did not start on the safe action').toBe('retry');
      // The inner text of the composite button, not the box it sits in: the
      // card's first control is one confirm press from restarting everybody's
      // bout, so what it says matters as much as where the cursor is.
      expect(focus.text).toBe('Ride it again');
      // **And the ring is painted**, which `document.activeElement` cannot tell
      // you (M25's own finding). Reached by a real keyboard round trip, because
      // `:focus-visible` is the browser guessing whether a human is navigating
      // by key and every click on the way here said otherwise.
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active === null) return { menu: '', ring: false };
        const style = getComputedStyle(active);
        return {
          menu: active.dataset.menu ?? '',
          // A style *and* a width: `outline-style: none` still reports a
          // colour, so colour alone would pass on nothing.
          ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
        };
      });
      expect(ring.menu, 'the keyboard round trip did not come back to Ride it again').toBe('retry');
      expect(ring.ring, 'the control the keyboard is on is not drawn').toBe(true);
      // And the other exit §37.5 keeps.
      await expect(page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]'))
        .toBeVisible();

      await saveShot(page, testInfo, `results-${seats}-seats`);
      expect(errors).toEqual([]);
    });
}

for (const seats of [2, 3, 4] as const) {
  test(`every control on the ${seats}-seat card is above the fold at the couch's own minimum`,
    async ({ page }, testInfo) => {
      /*
       * **§37.5's card, measured as a fit rather than as words.** The card is
       * in the stylesheet's scroll-by-design group, but a control below the
       * fold is a control somebody has to go looking for — and this is the one
       * window the mode guarantees it can be played at
       * (`COUCH_MIN_WIDTH_PX`, 1000x700, which is also this suite's own).
       *
       * The fourth row is what broke it: two seats measured 700 px of content
       * in a 700 px window and three 707 with every control still above the
       * fold, while four went to 738 and put `Back to title` at 723.6 — sliced
       * in half by the bottom edge. The card's own specs asked what the
       * controls *said* and where the cursor was, never whether they were on
       * screen, so the row that landed took the exit with it silently.
       *
       * **Every control, not the last one**, so the next row that arrives
       * cannot quietly push a second one out; and the longest roster names, so
       * a wrapped heading is in the measurement too.
       */
      const errors = collectErrors(page);
      await page.setViewportSize({ width: 1000, height: 700 });
      await bootFight(page, seats, { longestNames: true });
      const kos = seats === 2 ? [1, 3] : seats === 3 ? [1, 3, 1] : [1, 3, 1, 0];
      await endOn(page, 3, kos);

      const fit = await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('.euc-menu--results')!;
        const panel = menu.querySelector<HTMLElement>('.euc-results')!;
        return {
          content: menu.scrollHeight,
          window: window.innerHeight,
          rows: panel.querySelectorAll('[data-menu="results-rows"] tr').length,
          controls: [...panel.querySelectorAll<HTMLElement>('button, [data-couch-mode]')]
            .filter((node) => node.offsetParent !== null)
            .map((node) => ({
              what: node.dataset.menu ?? node.dataset.couchMode ?? '',
              top: node.getBoundingClientRect().top,
              bottom: node.getBoundingClientRect().bottom,
            })),
        };
      });
      // Three and four are a row per rider; the duel card is M26's three
      // named rows and is here as the control that did not change.
      expect(fit.rows, 'the card lost a row').toBe(seats >= 3 ? seats : 3);
      expect(fit.controls.length, 'the card drew no controls at all').toBeGreaterThan(3);
      for (const control of fit.controls) {
        expect(
          control.bottom,
          `"${control.what}" ends ${(control.bottom - fit.window).toFixed(1)} px below the fold `
            + `at ${seats} seats (card content ${fit.content} px in a ${fit.window} px window)`,
        ).toBeLessThanOrEqual(fit.window);
        expect(control.top, `"${control.what}" starts above the window`)
          .toBeGreaterThanOrEqual(0);
      }

      await saveShot(page, testInfo, `results-fit-${seats}-seats`);
      expect(errors).toEqual([]);
    });
}

test('a three-way draw names the two who drew and calls nobody a winner', async ({
  page,
}, testInfo) => {
  /*
   * q168, on the card. **5/5/2 is the case the two-player card's sentence
   * cannot describe**: "You both got there on the same swing" is wrong in both
   * halves — there may be three of them, and they are not all "you" — and a
   * heading naming a winner would be naming somebody the referee refused to
   * name. The note lists the tied leaders and nobody else, which is why the
   * third rider's name must not appear in it.
   */
  const errors = collectErrors(page);
  const names = await bootFight(page, 3);
  await seedTallies(page, [0, 0, 0], [2, 5, 1]);
  await endOn(page, 3, [3, 3, 1]);

  const card = await readResultsCard(page);
  expect(card.heading).toBe('Match drawn');
  expect(card.text, 'a drawn card named a winner').not.toContain('wins');
  expect(card.text, 'the two-player sentence reached a three-rider card')
    .not.toContain('You both');
  const drawn = card.notes.find((note) => note.includes('finished level'));
  expect(drawn, `no note explained the draw: ${JSON.stringify(card.notes)}`).toBeDefined();
  expect(drawn).toBe(`${names[0]} and ${names[1]} finished level on 3 knockdowns`);
  expect(drawn, 'the rider who did not draw was named as one who did')
    .not.toContain(names[2]);
  // Three rows, two firsts, and the rider who lost is third rather than second.
  expect(card.rows.map((row) => row.label))
    .toEqual([`1. ${names[0]}`, `1. ${names[1]}`, `3. ${names[2]}`]);
  expect(card.rows.map((row) => row.time)).toEqual(['3', '3', '1']);
  expect(card.rows.map((row) => row.extra)).toEqual(['2', '5', '1']);

  await saveShot(page, testInfo, 'results-3-seats-draw');
  expect(errors).toEqual([]);
});

test('a four-way draw shares first place four ways and names all four', async ({ page }) => {
  /*
   * **The widest draw the referee can produce, which nothing else covered.**
   * The only drawn fixture on this card was 3/3/1 at three seats — a two-way
   * tie — while q173's resolver can credit several attackers on one step, so
   * three and four leaders arriving together at the target are reachable
   * states. Three things are only ever exercised here: the four-name sentence
   * with one "and" in it, a table whose every row says `1.`, and a place column
   * with no second place in it at all.
   */
  const errors = collectErrors(page);
  const names = await bootFight(page, 4);
  await seedTallies(page, [0, 0, 0, 0], [2, 5, 1, 3]);
  await endOn(page, 3, [3, 3, 3, 3]);

  const card = await readResultsCard(page);
  expect(card.heading).toBe('Match drawn');
  expect(card.text, 'a drawn card named a winner').not.toContain('wins');
  expect(card.text, 'the two-player sentence reached a four-rider card')
    .not.toContain('You both');
  expect(card.notes).toContain(
    `${names[0]}, ${names[1]}, ${names[2]} and ${names[3]} finished level on 3 knockdowns`,
  );
  // Four rows, every one of them first, and every rider's own target count.
  expect(card.rows.map((row) => row.label))
    .toEqual(names.map((name) => `1. ${name}`));
  expect(card.rows.map((row) => row.time)).toEqual(['3', '3', '3', '3']);
  expect(card.rows.map((row) => row.extra)).toEqual(['2', '5', '1', '3']);
  expect(
    card.rows.filter((row) => !row.label.startsWith('1.')),
    'a four-way draw put somebody second',
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('three of four draw, and the fourth rider is named nowhere in the note', async ({ page }) => {
  /*
   * **The case the brief names and neither drawn fixture reached.** Above:
   * two of three, and four of four. A three-way draw is only reachable at four
   * seats, and it is the only shape where the sentence has to list *some* of
   * the room — three names, one "and", and the rider who lost named nowhere in
   * it — while the table still has a fourth place in it.
   */
  const errors = collectErrors(page);
  const names = await bootFight(page, 4);
  await seedTallies(page, [0, 0, 0, 0], [2, 5, 1, 3]);
  await endOn(page, 3, [3, 3, 3, 1]);

  const card = await readResultsCard(page);
  expect(card.heading).toBe('Match drawn');
  expect(card.text, 'a drawn card named a winner').not.toContain('wins');
  expect(card.text, 'the two-player sentence reached a four-rider card')
    .not.toContain('You both');
  const drawn = card.notes.find((note) => note.includes('finished level'));
  expect(drawn, `no note explained the draw: ${JSON.stringify(card.notes)}`).toBeDefined();
  expect(drawn).toBe(`${names[0]}, ${names[1]} and ${names[2]} finished level on 3 knockdowns`);
  expect(drawn, 'the rider who did not draw was named as one who did')
    .not.toContain(names[3]);
  // Three firsts and a fourth — no second, no third.
  expect(card.rows.map((row) => row.label)).toEqual([
    `1. ${names[0]}`, `1. ${names[1]}`, `1. ${names[2]}`, `4. ${names[3]}`,
  ]);
  expect(card.rows.map((row) => row.time)).toEqual(['3', '3', '3', '1']);
  expect(card.rows.map((row) => row.extra)).toEqual(['2', '5', '1', '3']);
  expect(errors).toEqual([]);
});

test('the two-player card is the one M26 shipped, word for word', async ({ page }) => {
  // §37.5: *"Keep the two-player card's behaviour."* The branch is on the
  // referee's own seat count, so a duel cannot reach the builder above — and
  // this is the assertion that says so from the card rather than from the code.
  const errors = collectErrors(page);
  await bootFight(page, 2);
  await seedTallies(page, [0, 0], [3, 1]);
  await endOn(page, 2, [2, 0]);

  const card = await readResultsCard(page);
  expect(card.heading).toBe('Player 1 wins');
  expect(card.totalCaption).toBe('Player 1');
  expect(card.bestCaption).toBe('Player 2');
  expect(card.caption).toBe('Match summary');
  expect(card.columns).toEqual(['Result', 'This match', '']);
  expect(card.extraHidden, 'the duel card grew a fourth column').toBe(true);
  expect(card.compare).toBe('false');
  expect(card.rows.map((row) => row.label)).toEqual([
    'Knockdowns (first to 2)', 'Targets struck', 'Time taken',
  ]);
  expect(card.rows[0].time).toBe('2 – 0');
  expect(card.rows[1].time).toBe('3 – 1');
  expect(card.notes).toContain('Two-player matches are not saved');
  expect(card.text).not.toContain('Couch matches are not saved');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 8. One voice
// ---------------------------------------------------------------------------

test('the room speaks once: one count, a silent tally, and one status line', async ({ page }) => {
  /*
   * §37.5: *"Keep a single announcer for the shared countdown/results;
   * duplicated live tallies must not produce an announcement storm."*
   *
   * **Counted, not merely read off the attributes.** Four panes each carrying a
   * live region that changed on every knockdown is the storm, and the way to
   * prove it is absent is to watch the DOM: a `MutationObserver` over every
   * live region in every pane, across a knockdown that changes nothing and a
   * knockdown that takes the lead.
   */
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootFight(page, 4);

  const regions = await page.evaluate(() => {
    const count = (selector: string, attribute: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((node) => node.getAttribute(attribute) !== null).length;
    return {
      panes: document.querySelectorAll('.euc-hud-seat').length,
      countNodes: document.querySelectorAll('.euc-hud-seat [data-hud="count"]').length,
      countLive: count('.euc-hud-seat [data-hud="count"]', 'aria-live'),
      tallyNodes: document.querySelectorAll('.euc-hud-seat [data-hud="tally"]').length,
      tallyLive: count('.euc-hud-seat [data-hud="tally"]', 'aria-live'),
      tallyRole: count('.euc-hud-seat [data-hud="tally"]', 'role'),
      statusNodes: document.querySelectorAll('.euc-hud-seat [data-hud="match-status"]').length,
      statusLive: count('.euc-hud-seat [data-hud="match-status"]', 'aria-live'),
    };
  });
  expect(regions.panes).toBe(4);
  expect(regions.countNodes, 'every pane shows the count').toBe(4);
  expect(regions.countLive, 'the room has more than one countdown voice').toBe(1);
  expect(regions.tallyNodes).toBe(4);
  expect(regions.tallyLive, 'the tally list became a live region').toBe(0);
  expect(regions.tallyRole).toBe(0);
  expect(regions.statusNodes).toBe(4);
  expect(regions.statusLive, 'the room has more than one polite voice').toBe(1);

  // A lead to be behind, established before anything is being watched.
  await seedTallies(page, [0, 2, 0, 0], [0, 0, 0, 0]);

  const watched = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const seen: string[] = [];
    const observer = new MutationObserver(() => { /* drained by hand, below */ });
    for (const region of document.querySelectorAll<HTMLElement>('.euc-hud-seat [aria-live]')) {
      observer.observe(region, { childList: true, characterData: true, subtree: true });
    }
    // **Drained rather than awaited.** A `MutationObserver` callback is a
    // microtask, and this whole evaluate is one synchronous task — the first
    // attempt read an empty list every time and would have passed on a build
    // with four live tallies in it. `takeRecords` is the queue, read directly.
    const drain = (): void => {
      for (const record of observer.takeRecords()) {
        const node = record.target.nodeType === 1
          ? record.target as HTMLElement
          : record.target.parentElement;
        const host = node?.closest<HTMLElement>('[aria-live]');
        if (host !== null && host !== undefined) seen.push(host.dataset.hud ?? host.className);
      }
    };
    drain();
    seen.length = 0;
    // A knockdown by somebody who is still behind: nothing about the room has
    // changed, so nothing should be said about it.
    game.match.knockdown(2);
    game.advance(2);
    drain();
    const behind = [...seen];
    seen.length = 0;
    // And one that takes the lead outright.
    game.match.knockdown(2);
    game.match.knockdown(2);
    game.advance(2);
    drain();
    const led = [...seen];
    observer.disconnect();
    return {
      behind,
      led,
      status: [...document.querySelectorAll<HTMLElement>('.euc-hud-seat [data-hud="match-status"]')]
        .map((node) => node.textContent ?? ''),
      leader: [...document.querySelectorAll<HTMLElement>('.euc-hud-seat [data-hud="match-status"]')]
        .findIndex((node) => node.getAttribute('aria-live') !== null),
    };
  });
  expect(watched.behind, 'a knockdown that settled nothing was announced').toEqual([]);
  expect(watched.led.length, `the lead changing spoke ${watched.led.length} times`).toBe(1);
  expect(watched.led[0], 'something other than the match status spoke').toBe('match-status');
  // Every pane holds the same sentence; only one of them says it out loud.
  expect(new Set(watched.status).size, 'the panes disagreed about the room').toBe(1);
  expect(watched.status[0]).toMatch(/ leads on 3$/);
  expect(watched.leader, 'the announcing pane is not the first seat').toBe(0);
  expect(errors).toEqual([]);
});

test('the three-seat room\'s own card does not read the scoreboard out on every strike',
  async ({ page }) => {
    /*
     * **The one frame the spec above cannot watch.** It boots four seats, where
     * the fourth quadrant is a pane and there is no room card at all, and it
     * scopes its observer to `.euc-hud-seat [aria-live]` — so the surface that
     * actually carries a second live scoreboard, the three-seat room's card,
     * was outside both the room and the watch.
     *
     * That card is `role="status" aria-live="polite"` because it is a world
     * card that changes about once a session (`ui/idlePane.ts`); filled with
     * standings it changes on **every target struck**, and a screen reader
     * re-read all three rows each time — `First to 5 / 1. Trollina 2 KO · 0
     * targets / …`, dozens of times a bout. §37.5's no-storm rule is the rule
     * the rest of this stage was built around, and this is it measured on the
     * room's own box: every live region in the *document*, not only the ones
     * inside a pane.
     */
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await bootFight(page, 3);
    await seedTallies(page, [0, 2, 0], [0, 0, 0]);

    const card = page.locator('.euc-idle');
    await expect(card, 'three seats left no room card to test').toBeVisible();
    expect(
      await card.getAttribute('aria-live'),
      'the room card is still a voice while a bout is on',
    ).toBe('off');
    expect(await card.getAttribute('role'), 'the card stopped being a status box').toBe('status');

    const watched = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const seen: string[] = [];
      const observer = new MutationObserver(() => { /* drained by hand, below */ });
      // **Every live region in the document.** The pane list, the countdown,
      // the match strip *and* the room's card — the last of which is the one
      // this spec exists for.
      for (const region of document.querySelectorAll<HTMLElement>('[aria-live]')) {
        observer.observe(region, { childList: true, characterData: true, subtree: true });
      }
      let muted = 0;
      const drain = (): void => {
        // `takeRecords`, for the reason the four-seat spec records: the
        // callback is a microtask and this evaluate is one synchronous task.
        for (const record of observer.takeRecords()) {
          const node = record.target.nodeType === 1
            ? record.target as HTMLElement
            : record.target.parentElement;
          const host = node?.closest<HTMLElement>('[aria-live]');
          if (host === null || host === undefined) continue;
          // **A changed region and an announced one are not the same thing**,
          // which is the whole of this fix: the card is still a scoreboard and
          // still redraws, it just no longer speaks. The muted writes are
          // counted rather than dropped, because "the card changed and said
          // nothing" is the claim, and a card that stopped changing would pass
          // a spec that only counted what spoke.
          if (host.getAttribute('aria-live') === 'off') muted += 1;
          else seen.push(`${host.dataset.hud ?? host.className}=${host.getAttribute('aria-live')}`);
        }
      };
      drain();
      seen.length = 0;
      // A target struck: the scoreboard on the card changes, and nothing in
      // the room should be *announced* for it.
      game.match.disc(0);
      game.advance(2);
      drain();
      const struck = [...seen];
      seen.length = 0;
      // A knockdown by somebody who stays behind: the card's rows change, the
      // room's standing does not.
      game.match.knockdown(0);
      game.advance(2);
      drain();
      const behind = [...seen];
      seen.length = 0;
      // And one that takes the lead, which is the room's one sentence.
      game.match.knockdown(0);
      game.match.knockdown(0);
      game.advance(2);
      drain();
      const led = [...seen];
      observer.disconnect();
      return {
        struck,
        behind,
        led,
        muted,
        card: document.querySelector('.euc-idle')?.textContent ?? '',
        // The room keeps its other voices (the countdown, the stray banner, a
        // pane's warning); what it must not keep is a second scoreboard.
        liveInCard: document.querySelectorAll('.euc-idle [aria-live]:not([aria-live="off"])')
          .length,
      };
    });
    // The card did change — it is a scoreboard — and nothing spoke for it.
    expect(watched.card, 'the card is not showing the bout at all').toContain('KO');
    expect(watched.muted, 'the card never redrew, so this spec proved nothing')
      .toBeGreaterThan(0);
    expect(watched.struck, 'a target strike was announced').toEqual([]);
    expect(watched.behind, 'a knockdown that settled nothing was announced').toEqual([]);
    expect(watched.led.length, `the lead changing spoke ${watched.led.length} times`).toBe(1);
    expect(watched.led[0], 'something other than the match status spoke')
      .toBe('match-status=polite');
    // And nothing inside the card is announcing on its own account either.
    expect(watched.liveInCard, 'a live region survived inside the room card').toBe(0);

    // **And the card is a voice again the moment the bout is not on**, which is
    // what makes this a mute rather than a demolition: leaving to a free ride
    // puts the world card back in the same box, and that card *is* worth
    // announcing — it changes about once a session.
    await endOn(page, 5, [5, 2, 0]);
    await page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
    await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(2); });
    await expect(card).toHaveAttribute('aria-live', 'polite');
    expect(errors).toEqual([]);
  });

// ---------------------------------------------------------------------------
// 9. The other windows and the other preferences
// ---------------------------------------------------------------------------

for (const seats of [3, 4] as const) {
  test(`the ${seats} rows hold their shape on other windows, in high contrast, reduced motion `
    + 'and under a thumb',
  async ({ page }) => {
    /*
     * §37.5's verification list. **The same fit assertion, five more times**,
     * because everything about this list's geometry is in the stylesheet and
     * the stylesheet's only measure of a pane is `--hud-vw` — which is exactly
     * the claim a second window size can falsify and a media query pretending
     * to measure a quadrant cannot.
     *
     * The odd window is m27's own tiling case (1001x701): a partition that
     * rounds a boundary to a whole pixel must not leave a row half a pixel
     * outside the pane it belongs to.
     *
     * **At the worst case, not at a tidy one** — the Phase 5 repair's finding:
     * this ran with short names, no warnings lit and four seats only, so
     * §37.5's own worst frame (the longest roster names *and* every cue lit)
     * was measured at exactly one window and one seat count. Both halves
     * travel now, and the three-seat room is walked over the same six
     * conditions.
     */
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await bootFight(page, seats, { longestNames: true });
    const kos = seats === 3 ? [1, 4, 2] : [1, 4, 2, 3];
    const discs = seats === 3 ? [11, 2, 7] : [11, 2, 7, 14];
    await seedTallies(page, kos, discs);
    const lit = await lightEveryCue(page);
    expect(
      lit.lit,
      `no pane lit the power ladder and the max-speed glyph together: ${JSON.stringify(lit)}`,
    ).toBeGreaterThan(0);

    const check = async (where: string): Promise<void> => {
      await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(2); });
      const layout = await readPanes(page);
      expectRowsInsidePanes(layout, seats, where);
      for (const [index, pane] of layout.panes.entries()) {
        expect(pane.tally, `${where}: pane ${index} lost its list`).not.toBeNull();
        expect(pane.tally?.names.length, `${where}: pane ${index} lost a row`).toBe(seats);
        expect(pane.tally?.youWords, `${where}: pane ${index} lost its You`).toBe(1);
        // The floors travel with the list: §9j's finding is about a number in
        // the corner of a moving frame, whatever size the window is. (The
        // count's own 0.8rem is §9j's rejected size rather than its floor —
        // see the fit spec above, and the q174 candidate it records.)
        expect(pane.tally?.koSize ?? 0, `${where}: the knockdowns shrank`)
          .toBeGreaterThanOrEqual(15.2 - 0.01);
        expect(pane.tally?.targetSize ?? 0, `${where}: the target count shrank`)
          .toBeGreaterThanOrEqual(12.8 - 0.01);
        expect(pane.tally?.youSize ?? 0, `${where}: the You marker shrank into the name`)
          .toBeGreaterThanOrEqual(11.52 - 0.01);
        // And no name is cut on any of these windows either — the marked row
        // included, which is the row the first build cut in every pane.
        for (const [seat, fit] of (pane.tally?.nameFit ?? []).entries()) {
          expect(
            fit.scroll,
            `${where}: pane ${index} cut "${pane.tally?.names[seat]}"`,
          ).toBeLessThanOrEqual(fit.client + 1);
        }
      }
    };

    await check('1000x700');

    await page.setViewportSize({ width: 1920, height: 1080 });
    await check('1920x1080');

    // An odd canvas on both axes — the pane boundaries are 500/501 and 350/351.
    await page.setViewportSize({ width: 1001, height: 701 });
    await check('1001x701');
    await page.setViewportSize({ width: 1000, height: 700 });

    await page.emulateMedia({ forcedColors: 'active' });
    await check('forced colours');
    const forced = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.euc-hud__tally-row[data-you="false"]')!;
      const you = document.querySelector<HTMLElement>('.euc-hud__tally-row[data-you="true"]')!;
      return {
        dim: getComputedStyle(row).opacity,
        marked: you.querySelector('.euc-hud__tally-you')?.textContent ?? '',
      };
    });
    // Forced colours throw the tint away, so the two cues that survive are the
    // weight and the word — and the rows stop leaning on opacity to separate
    // themselves from a background the mode has replaced.
    expect(forced.dim).toBe('1');
    expect(forced.marked, 'the You cue was colour alone').toBe('You');
    await page.emulateMedia({ forcedColors: 'none' });

    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    await check('reduced motion and high contrast');
    expect(
      await page.evaluate(() => getComputedStyle(
        document.querySelector<HTMLElement>('.euc-hud__tally-row')!,
      ).animationName),
      'the tally list animates, which a player who asked for less motion did not ask for',
    ).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });

    // A desktop window driven by a thumb — `@media (pointer: coarse)` is a
    // query about the *input*, not about the size, and the only way to ask for
    // it here is the protocol's own media override.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }],
    });
    await check('a coarse pointer');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await cdp.detach();
    expect(errors).toEqual([]);
  });
}

// Automatic mode-course requests must remain transactional and cancellable.
for (const exit of ['resume', 'settings', 'quit'] as const) {
  test(`leaving via ${exit} cancels a pending mode course`, async ({ page }) => {
    const errors = collectErrors(page);
    await sitDown(page, 4, '');
    await page.locator(COUCH_START).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    const during = await page.evaluate((action) => {
      const game = window.game;
      const before = game.snapshot().world;
      // Both actions in one browser turn, before the deferred build can run.
      document.querySelector<HTMLButtonElement>('[data-menu="pause-couch"] [data-couch-mode="knockabout"]')!.click();
      const requested = game.snapshot().route.pending;
      game.switchCouchRide('race'); // another device cannot replace the pending choice
      const stillPaused = game.snapshot().app.state;
      document.querySelector<HTMLButtonElement>(`.euc-menu--pause [data-menu="${action}"]`)!.click();
      return { before, requested, stillPaused, pending: game.snapshot().route.pending, status: game.snapshot().route.status };
    }, exit);
    expect(during.requested).toBe(true);
    expect(during.stillPaused).toBe('paused');
    expect(during.pending).toBe(false);
    expect(during.status).toBe('idle');
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i += 1) await new Promise(requestAnimationFrame);
    });
    expect(await page.evaluate(() => window.game.snapshot().world)).toEqual(during.before);
    expect(await page.evaluate(() => window.game.snapshot().app.state))
      .toBe(exit === 'resume' ? 'freeRide' : exit === 'quit' ? 'title' : 'settings');
    expect(errors).toEqual([]);
  });
}

test('a mode course that cannot fit the room leaves it intact and can be retried', async ({ page }) => {
  const errors = collectErrors(page);
  await sitDown(page, 4, '');
  await page.locator(COUCH_START).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  const read = () => page.evaluate(() => {
    const game = window.game; const s = game.snapshot();
    return { world: s.world, state: s.app.state, ride: s.couch.ride, devices: s.input.devices,
      poses: Array.from({ length: game.seatCount }, (_, seat) => game.snapshotFor(seat).euc.position) };
  });
  const before = await read();
  await page.evaluate(() => window.game.setGroupSpawnSeparationScale(10000));
  const choice = page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]');
  await choice.click();
  await page.waitForFunction(() => !window.game.snapshot().route.pending);
  expect(await read()).toEqual(before);
  await expect(page.locator('[data-menu="pause-couch"] .euc-field__note'))
    .toContainText('No suitable course found');
  await expect(choice).toBeEnabled();
  expect(await page.evaluate(() => window.game.snapshot().route.pending)).toBe(false);
  await page.evaluate(() => window.game.setGroupSpawnSeparationScale(1));
  await choice.click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  expect(await page.evaluate(() => window.game.snapshot().input.devices)).toEqual(before.devices);
  expect(errors).toEqual([]);
});

for (const venue of ['track', 'switchback']) {
  test(`four-player ${venue} race results can start Knockabout and return to race`, async ({ page }) => {
    const errors = collectErrors(page);
    await sitDown(page, 4, `level=${venue}`);
    await page.evaluate(() => {
      window.game.tuning.set('RACE.laps', 1);
      window.game.tuning.set('RACE.finishGraceSeconds', 1);
    });
    await page.locator(`${COUCH_MODE}[data-couch-mode="race"]`).click();
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
    const devices = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false); game.advance(420);
      const gates = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
      for (const gate of [...gates, ...gates.slice(1), gates[0]]) {
        game.placeRider({ ...gate.centre }, gate.headingY, 0);
        game.advance(32);
      }
      game.advance(600);
      return game.snapshot().input.devices;
    });
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    await page.locator('[data-menu="results-couch"] [data-couch-mode="knockabout"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
    const fight = await page.evaluate(() => ({ world: window.game.snapshot().world.levelId,
      race: window.game.snapshot().race.phase, devices: window.game.snapshot().input.devices,
      match: window.game.snapshot().match.phase }));
    expect(fight).toEqual({ world: 'generated', race: 'idle', devices, match: 'countdown' });
    await pauseFromSeat(page, 2);
    await page.locator('[data-menu="pause-couch"] [data-couch-mode="race"]').click();
    expect(await page.evaluate(() => ({ state: window.game.snapshot().app.state,
      race: window.game.snapshot().race.phase, match: window.game.snapshot().match.phase,
      seats: window.game.seatCount, lap: window.game.levelPlan.lap !== undefined })))
      .toEqual({ state: 'trackDay', race: 'countdown', match: 'idle', seats: 4, lap: true });
    expect(errors).toEqual([]);
  });
}
