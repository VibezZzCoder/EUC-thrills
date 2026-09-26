/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, CHASE, SIMULATION } from '../data/tuning.ts';
import {
  ChaseRoom,
  ChaseRun,
  cpuPackSize,
  nearestStandingPair,
  roomSpec,
  type ChaseArmOptions,
  type ChaseDemand,
  type ChaseEvent,
  type ChaseInput,
  type ChaseRoomInput,
} from './chase.ts';

/**
 * The chase's rules, headless — M18 Phase 3.
 *
 * Every ending the mode has is arithmetic over three numbers, so every ending
 * is asserted here rather than ridden for. What a browser has to prove is that
 * the cop rides and the card appears; what *this* proves is that the run ends
 * for the right reason, which is the half a screenshot cannot show.
 */

const STEP = 1 / SIMULATION.hz;

/** A step's worth of "nothing is happening": on the road, cop miles away. */
const CALM: ChaseInput = { offRoute: 0, copDistance: 500, crashed: false };

/** Run `seconds` of steps, or until the run ends. Returns steps taken. */
function ride(run: ChaseRun, seconds: number, input: ChaseInput = CALM): number {
  const steps = Math.round(seconds * SIMULATION.hz);
  for (let step = 0; step < steps; step += 1) {
    if (run.step(STEP, input)) return step + 1;
  }
  return steps;
}

test('a chase that is never started decides nothing', () => {
  const run = new ChaseRun();
  assert.equal(run.state.phase, 'idle');
  // The most important line in this file: every input below would end an armed
  // run, and an idle referee must answer none of them. `Game.step` calls this
  // every step of every ride, including free ride and the title screen.
  assert.equal(run.step(STEP, { offRoute: 900, copDistance: 0, crashed: true }), false);
  assert.equal(run.state.phase, 'idle');
  assert.equal(run.state.outcome, 'none');
});

test('surviving the clock is the win, and the clock is the owner’s five minutes', () => {
  const run = new ChaseRun();
  run.arm();
  assert.equal(run.state.remaining, CHASE.escapeSeconds);
  assert.equal(CHASE.escapeSeconds, 300, 'the owner’s answer to §13 q24 moved');

  ride(run, CHASE.escapeSeconds - 1);
  assert.equal(run.state.phase, 'running', 'the run ended a second early');

  ride(run, 2);
  assert.equal(run.state.phase, 'escaped');
  assert.equal(run.state.outcome, 'escaped');
  // Survival is capped by the clock rather than by how long the caller kept
  // stepping: a record of 300.4 s on a five-minute mode would be nonsense.
  assert.ok(Math.abs(run.state.survived - CHASE.escapeSeconds) < 1e-6);
});

test('a crash with the cop on you is the bust; a crash alone is not', () => {
  const near: ChaseInput = { offRoute: 0, copDistance: 2, crashed: true };
  const far: ChaseInput = { offRoute: 0, copDistance: 400, crashed: true };

  const alone = new ChaseRun();
  alone.arm();
  ride(alone, 5, far);
  assert.equal(alone.state.phase, 'running', 'crashing alone ended the run');

  const caught = new ChaseRun();
  caught.arm();
  ride(caught, 5, near);
  assert.equal(caught.state.phase, 'busted');
  assert.equal(caught.state.outcome, 'caught');
});

test('the bust is the crash’s own edge, not the whole crash', () => {
  // A crash lasts until the controller respawns the rider seconds later. If the
  // bust were a level test, the cop riding *past* a rider who crashed alone
  // would bust them retroactively — the rider would have done nothing and the
  // run would end while they were on the ground.
  const run = new ChaseRun();
  run.arm();
  ride(run, 1, { offRoute: 0, copDistance: 400, crashed: true });
  assert.equal(run.state.phase, 'running');

  // He arrives while they are still down. Same crash, so no new edge.
  ride(run, 1, { offRoute: 0, copDistance: 1, crashed: true });
  assert.equal(run.state.phase, 'running', 'a cop arriving late busted an old crash');

  // Up again, and then caught properly.
  ride(run, 1, CALM);
  ride(run, 1, { offRoute: 0, copDistance: 1, crashed: true });
  assert.equal(run.state.outcome, 'caught');
});

test('leaving the route is a warning first and a bust second', () => {
  const run = new ChaseRun();
  run.arm();
  const away: ChaseInput = {
    offRoute: CHASE.strayLimitMetres + 5,
    copDistance: 500,
    crashed: false,
  };

  ride(run, CHASE.strayGraceSeconds * 0.5, away);
  assert.equal(run.state.phase, 'running');
  assert.equal(run.state.straying, true, 'the warning never came on');
  assert.ok(run.state.strayGrace > 0 && run.state.strayGrace < CHASE.strayGraceSeconds);

  ride(run, CHASE.strayGraceSeconds, away);
  assert.equal(run.state.phase, 'busted');
  assert.equal(run.state.outcome, 'strayed');
});

test('coming back to the route gives the whole grace back', () => {
  // The difference between "running wide onto a verge" and "camping in a
  // field", which is the whole of what the owner asked the boundary to do.
  const run = new ChaseRun();
  run.arm();
  const away: ChaseInput = { offRoute: CHASE.strayLimitMetres + 5, copDistance: 500, crashed: false };

  for (let lap = 0; lap < 4; lap += 1) {
    ride(run, CHASE.strayGraceSeconds * 0.8, away);
    assert.equal(run.state.phase, 'running', `lap ${lap}: busted for running wide`);
    ride(run, 0.5, CALM);
    assert.equal(run.state.straying, false, `lap ${lap}: the warning stayed on after coming back`);
    assert.equal(run.state.strayGrace, CHASE.strayGraceSeconds);
  }
});

test('inside the corridor is never straying, however far along the route', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, 30, { offRoute: CHASE.strayLimitMetres - 0.01, copDistance: 500, crashed: false });
  assert.equal(run.state.phase, 'running');
  assert.equal(run.state.straying, false);
});

test('the clock is spent before the bust, so the last step is an escape', () => {
  // The generous reading, and the right one: the run was over before the crash.
  const run = new ChaseRun();
  run.arm();
  ride(run, CHASE.escapeSeconds - STEP * 0.5);
  const ended = run.step(STEP, { offRoute: 0, copDistance: 0, crashed: true });
  assert.equal(ended, true);
  assert.equal(run.state.outcome, 'escaped');
});

test('abandoning a run leaves nothing behind for the next one', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, 12, { offRoute: CHASE.strayLimitMetres + 2, copDistance: 500, crashed: false });
  run.abandon();

  assert.equal(run.state.phase, 'idle');
  assert.equal(run.state.outcome, 'none');
  assert.equal(run.state.straying, false);
  assert.equal(run.state.remaining, CHASE.escapeSeconds);

  run.arm();
  assert.equal(run.state.survived, 0);
  ride(run, 1, CALM);
  assert.equal(run.state.phase, 'running', 'a fresh run inherited the last one’s stray clock');
});

test('a retuned clock is the clock the next run uses', () => {
  // F4 is where the owner's ride moves these, and `Game.applyTuning` writes
  // them onto this object. A run already under way keeps the number it was
  // armed with, which is why `arm` reads the field rather than the table.
  const run = new ChaseRun();
  run.escapeSeconds = 12;
  run.arm();
  assert.equal(run.state.remaining, 12);
  ride(run, 13);
  assert.equal(run.state.outcome, 'escaped');
});

// ---------------------------------------------------------------------------
// The super tracker — M20.2, the owner's "the mode is about the tension"
// ---------------------------------------------------------------------------

test('a gap that stays blown out demands a regroup after the hold, not before', () => {
  const run = new ChaseRun();
  run.arm();
  const far: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: false };

  ride(run, CHASE.trackerHoldSeconds - 0.5, far);
  assert.equal(run.takeTrackerDemand(), false, 'demanded before the hold was served');

  ride(run, 1, far);
  assert.equal(run.takeTrackerDemand(), true, 'the held blowout never demanded');
  // Consumed on read, exactly like the crash edge.
  assert.equal(run.takeTrackerDemand(), false, 'one blowout demanded twice');
});

test('closing back inside the tracker line gives the whole hold back', () => {
  const run = new ChaseRun();
  run.arm();
  const far: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: false };
  // Back inside the quiet line too (the brutal pass): with the quiet spell at
  // seconds, a dip that stayed out of earshot would let the quiet clock —
  // which runs out there as well — answer this fixture instead of the hold.
  const near: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerQuietGapMetres - 10, crashed: false };

  // Flirt with the line twice: most of a hold out, a moment back in, most of a
  // hold out again. Neither excursion may demand — the stray clock's rule.
  ride(run, CHASE.trackerHoldSeconds - 0.2, far);
  ride(run, 0.5, near);
  ride(run, CHASE.trackerHoldSeconds - 0.2, far);
  assert.equal(run.takeTrackerDemand(), false, 'two part-holds were added together');
});

test('a crashed rider is never regrouped onto', () => {
  const run = new ChaseRun();
  run.arm();
  const farDown: ChaseInput = {
    offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: true,
  };
  // The crash itself is not a bust — the cop is far — so the run keeps going,
  // but the tracker must not count while the rider is on the ground: the
  // regroup would hand the bust radius somebody who cannot ride.
  ride(run, CHASE.trackerHoldSeconds * 3, farDown);
  assert.equal(run.state.phase, 'running');
  assert.equal(run.takeTrackerDemand(), false, 'the tracker counted a downed rider');
});

test('a fresh run starts with no tracker debt and no pending demand', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, CHASE.trackerHoldSeconds + 1,
    { offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: false });
  // A demand is pending; abandoning must clear it and the timer both.
  run.abandon();
  run.arm();
  assert.equal(run.takeTrackerDemand(), false, 'a demand survived abandon');
  ride(run, CHASE.trackerHoldSeconds * 0.9,
    { offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: false });
  assert.equal(run.takeTrackerDemand(), false, 'the old run’s timer leaked into this one');
});

// -- The touch bust — M24 -----------------------------------------------------
//
// Dario's twice-asked, publicly promised rule: touch Officer Dorkins and you
// are busted. The matrix below is mostly the *guard*: the bust must punish the
// rider's ram and hand the cop no new way to score by ramming, which is the
// design condition the owner attached to the promise.

/** Contact-range input with explicit attribution facts. */
function touching(riderClosing: number, extra: Partial<ChaseInput> = {}): ChaseInput {
  return {
    offRoute: 0,
    copDistance: CHASE.touchBustMetres * 0.8,
    crashed: false,
    riderClosingSpeed: riderClosing,
    copCrashed: false,
    ...extra,
  };
}

test('riding into the cop is an instant bust with its own outcome', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, 2);
  assert.equal(run.step(STEP, touching(3)), true, 'the ram did not end the run');
  assert.equal(run.state.phase, 'busted');
  assert.equal(run.state.outcome, 'touched');
});

test('the cop ramming the rider scores nothing, however long he grinds', () => {
  const run = new ChaseRun();
  run.arm();
  // Standing rider, cop grinding against them, in contact range the whole
  // time: the forbidden channel. The rider's own closing rate is zero — only
  // the rider's stick can raise it — so if this ever busts, the cop has
  // learned to score by ramming and the promise behind the feature is broken.
  ride(run, 30, touching(0));
  assert.equal(run.state.phase, 'running', 'the cop scored by ramming a standing rider');

  // Overtaking a fleeing rider from behind: the rider is opening, contact
  // happens — the cop's doing alone, no bust.
  ride(run, 10, touching(-6));
  assert.equal(run.state.phase, 'running', 'the cop scored by overrunning a fleeing rider');
});

test('a head-on meeting where the rider does the closing is the rider’s ram', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, 1);
  // The §4.2 head-on shape. Running at him was already answered once with the
  // led swing; now the body itself answers it. The cop closing too — even
  // faster than the rider, as a pursuing cop usually is — is deliberately no
  // defence: riding into him is the offence, and comparing the two rates
  // would decide every mutual meeting by whoever happened to be faster.
  assert.equal(run.step(STEP, touching(4)), true);
  assert.equal(run.state.outcome, 'touched');
});

test('drift, downed riders, and a downed cop never make a touch', () => {
  const run = new ChaseRun();
  run.arm();
  // Sub-threshold creep: wobble drift beside him is free.
  ride(run, 10, touching(CHASE.touchBustClosingSpeed * 0.5));
  assert.equal(run.state.phase, 'running', 'wobble drift near the cop busted');

  // Opening, at zero gap: absurd caller facts must still read as nothing.
  ride(run, 2, touching(-3, { copDistance: 0 }));
  assert.equal(run.state.phase, 'running', 'an opening rider at zero gap busted');

  // A ragdolled officer arrests nobody.
  ride(run, 2, touching(5, { copCrashed: true }));
  assert.equal(run.state.phase, 'running', 'a crashed cop made an arrest');

  // A crashed rider sliding into him is the crash rule's business, and the
  // crash edge was spent far from the cop two lines up in wall-clock terms:
  // spend it explicitly far away, then slide the body into contact.
  ride(run, 1, { offRoute: 0, copDistance: 400, crashed: true });
  assert.equal(run.state.phase, 'running', 'the lone crash itself busted');
  ride(run, 2, touching(4, { crashed: true }));
  assert.equal(run.state.phase, 'running', 'a ragdoll sliding into the cop busted');
});

test('a touch during the stray warning is a touch, not a stray', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, CHASE.strayGraceSeconds * 0.5,
    { offRoute: CHASE.strayLimitMetres + 5, crashed: false, copDistance: 300 });
  assert.equal(run.state.straying, true);
  assert.equal(run.step(STEP, touching(6, { offRoute: CHASE.strayLimitMetres + 5 })), true);
  assert.equal(run.state.outcome, 'touched', 'the stray clock outranked the touch');
});

test('callers that say nothing about touching can never produce one', () => {
  // Every pre-M24 call site — and every fixture above this section — omits the
  // attribution facts entirely. Absent facts must read as "nobody is closing".
  const run = new ChaseRun();
  run.arm();
  ride(run, 5, { offRoute: 0, copDistance: 0, crashed: false });
  assert.equal(run.state.phase, 'running', 'an attribution-blind caller busted on proximity');
});

// ---------------------------------------------------------------------------
// The pressure director — the chase pass (§31), the owner's third reopening of
// the easy escape: "once Officer Dorkins falls behind, too much of the
// five-minute chase feels like free riding"
// ---------------------------------------------------------------------------
//
// Three clocks demand a regroup now — the M20.2 hold above, a quiet clock and
// a stall clock — and a baited crash buys a respite. Each fixture below runs
// one clock by standing the cop where the other two cannot: the quiet line
// (the siren's far edge, 60 m) sits under the tracker line (130 m) and the
// stall's arm's-length gap (20 m) sits under both, so a cop at 80 m runs the
// quiet clock alone and a parked cop at 30 m runs the stall clock alone. That
// nesting is a fact about the table, pinned first, because a retune that
// broke it would not fail a test here — it would make one pass for two
// reasons.

/** The cop in the quiet band: past the siren's far edge, inside the tracker line. */
function quiet(extra: Partial<ChaseInput> = {}): ChaseInput {
  return { offRoute: 0, copDistance: CHASE.trackerQuietGapMetres + 20, crashed: false, ...extra };
}

/** The cop parked at `copDistance`, reading half the stall speed. */
function parked(copDistance: number, extra: Partial<ChaseInput> = {}): ChaseInput {
  return {
    offRoute: 0,
    copDistance,
    crashed: false,
    copSpeed: CHASE.trackerStallSpeed * 0.5,
    ...extra,
  };
}

/** Blown out past the tracker line — the M20.2 shape. */
const BLOWN: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerGapMetres + 20, crashed: false };

/**
 * `TRACKER_RETRY_SECONDS` in `chase.ts` — private there on purpose, it is not a
 * tunable — restated here and *measured* by the retry test, so a change on
 * either side is reported by the other.
 */
const RETRY = 1;

/** Step `input` until the referee demands, and say how long that took. */
function secondsUntilDemand(run: ChaseRun, input: ChaseInput, limit: number): number {
  const steps = Math.round(limit * SIMULATION.hz);
  for (let step = 0; step < steps; step += 1) {
    run.step(STEP, input);
    if (run.takeTrackerDemand()) return (step + 1) * STEP;
  }
  return Infinity;
}

test('the director’s lines nest, so each fixture in this section runs one clock', () => {
  assert.ok(CHASE.trackerStallGapMetres < CHASE.trackerQuietGapMetres,
    'a parked cop past arm’s length is inside the quiet line no longer');
  assert.ok(CHASE.trackerQuietGapMetres + 20 < CHASE.trackerGapMetres,
    'the quiet fixture crossed the tracker line');
  // The reset test below needs the stall to fire first when both clocks run.
  assert.ok(CHASE.trackerStallSeconds < CHASE.trackerQuietSeconds,
    'the stall clock is no longer the shorter of the two');
});

test('quiet means what the player hears: the quiet line is the siren’s far edge, not past it', () => {
  // Codex's M31 QA fed the referee a cop holding 65 m for five minutes and
  // got no demand and no quiet time: the first cut put the line 10 m past
  // the siren's edge as "a little hysteresis", and that made a band where a
  // cop could sit unheard for ever. The line is the siren's edge now, and
  // the hysteresis is on the reset (the next two tests). Pinned against the
  // audio table rather than restated, so a retune of either fails here.
  assert.ok(CHASE.trackerQuietGapMetres <= AUDIO.sirenFarMetres,
    `the quiet line (${CHASE.trackerQuietGapMetres} m) sits past the siren's far edge (${AUDIO.sirenFarMetres} m)`);
  // And the return must land him inside the reset, or an accepted regroup
  // would never give the clock back — the storm the slider note warns of.
  assert.ok(CHASE.trackerReturnMetres < CHASE.trackerQuietGapMetres - RESET_INSIDE,
    'the tracker return lands outside the quiet clock’s reset');

  // A cop one metre past the siren's edge is quiet; the same referee fed a
  // cop one metre inside it never demands on this clock at all.
  const outside = new ChaseRun();
  outside.arm();
  const took = secondsUntilDemand(outside, { offRoute: 0, copDistance: AUDIO.sirenFarMetres + 1, crashed: false, copSpeed: 22 }, 60);
  assert.ok(Math.abs(took - CHASE.trackerQuietSeconds) < STEP * 1.5,
    `a cop just past the siren's edge was regrouped after ${took} s, not the quiet seconds`);
  const inside = new ChaseRun();
  inside.arm();
  ride(inside, 60, { offRoute: 0, copDistance: AUDIO.sirenFarMetres - 1, crashed: false, copSpeed: 22 });
  assert.equal(inside.takeTrackerDemand(), false, 'a cop inside the siren was regrouped for being quiet');
});

test('a cop hovering across the quiet line is still quiet: dipping inside it holds the clock, it does not reset it', () => {
  // The hysteresis. A cop crossing the line every second — 62 m, 58 m,
  // 62 m — is one the player hears at a few per cent of point-blank, which
  // is nothing; a clock that reset on each dip would never fire on him.
  const run = new ChaseRun();
  run.arm();
  const beyond: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerQuietGapMetres + 2, crashed: false };
  const dipped: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerQuietGapMetres - 2, crashed: false };
  let demandedAt = Infinity;
  let t = 0;
  for (let cycle = 0; cycle < 40 && demandedAt === Infinity; cycle += 1) {
    for (const input of [beyond, dipped]) {
      for (let step = 0; step < SIMULATION.hz / 2; step += 1) {
        run.step(STEP, input);
        t += STEP;
        if (run.takeTrackerDemand() && demandedAt === Infinity) demandedAt = t;
      }
      // The dip holds the clock: it neither grows nor shrinks for that half second.
      if (input === dipped && demandedAt === Infinity) {
        const before = run.state.quiet;
        run.step(STEP, dipped);
        assert.ok(Math.abs(run.state.quiet - before) < 1e-9, 'a dip inside the line moved the quiet clock');
      }
    }
  }
  // Only the halves spent beyond the line count, so it takes twice the quiet seconds.
  assert.ok(demandedAt < CHASE.trackerQuietSeconds * 2 + 1,
    `a cop hovering across the quiet line was never regrouped (waited ${t.toFixed(0)} s)`);
  assert.ok(demandedAt > CHASE.trackerQuietSeconds + 1,
    `the dips inside the line were counted as quiet (demanded at ${demandedAt.toFixed(1)} s)`);
});

/** `QUIET_RESET_METRES` in `chase.ts`, restated and measured by the test below. */
const RESET_INSIDE = 5;

test('a cop who closes back into earshot gives the whole quiet clock back', () => {
  const run = new ChaseRun();
  run.arm();
  const heard: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerQuietGapMetres - RESET_INSIDE, crashed: false };
  ride(run, CHASE.trackerQuietSeconds - 0.2, quiet());
  ride(run, 0.5, heard);
  assert.equal(run.state.quiet, 0, 'the siren coming back did not reset the clock');
  ride(run, CHASE.trackerQuietSeconds - 0.2, quiet());
  assert.equal(run.takeTrackerDemand(), false, 'two part-spells were added together');
  // And the reset line is where it is claimed: one metre short of it holds.
  const held = new ChaseRun();
  held.arm();
  ride(held, CHASE.trackerQuietSeconds - 0.2, quiet());
  ride(held, 0.5, { ...heard, copDistance: CHASE.trackerQuietGapMetres - RESET_INSIDE + 1 });
  assert.ok(held.state.quiet > CHASE.trackerQuietSeconds - 0.3, 'a cop just short of the reset line reset the clock');
});

test('a demand nobody could act on is asked again after the retry, not after a whole hold', () => {
  // A candidate the composition root refuses — a clamped route end, a fold —
  // is dropped on the floor, and the thing the clock measures has not
  // changed. So a demand winds the clocks back by the retry rather than to
  // zero: the next ask comes two seconds later, not three. Both numbers are
  // read off the referee's own cadence here rather than restated. (The quiet
  // clock runs at this gap too and is wound back each time, so it never
  // reaches its own line — every demand below is the hold's.)
  const run = new ChaseRun();
  run.arm();
  const limit = CHASE.trackerHoldSeconds * 2;
  const first = secondsUntilDemand(run, BLOWN, limit);
  assert.ok(Math.abs(first - CHASE.trackerHoldSeconds) < STEP * 1.5, `the first demand came at ${first} s`);
  const second = secondsUntilDemand(run, BLOWN, limit);
  const third = secondsUntilDemand(run, BLOWN, limit);
  assert.ok(Math.abs(second - RETRY) < STEP * 1.5, `the retry came ${second} s after the first demand`);
  assert.ok(Math.abs(third - second) < STEP * 1.5, `the retry is not a cadence: ${second} s then ${third} s`);
  assert.ok(RETRY < CHASE.trackerHoldSeconds, 'a retry no sooner than a whole hold is not a retry');
});

test('a cop just out of earshot is free riding, and is regrouped after the quiet seconds', () => {
  const run = new ChaseRun();
  run.arm();
  // Inside the tracker line the M20.2 hold never runs, so however long this
  // takes to demand, the demand is the quiet clock's and nobody else's.
  ride(run, CHASE.trackerHoldSeconds + 1, quiet());
  assert.equal(run.takeTrackerDemand(), false, 'the tracker line fired inside itself');
  ride(run, CHASE.trackerQuietSeconds - CHASE.trackerHoldSeconds - 1.5, quiet());
  assert.equal(run.takeTrackerDemand(), false, 'demanded before the quiet seconds were served');
  // `state.quiet` is the running clock — what a bench or a HUD reads.
  assert.ok(Math.abs(run.state.quiet - (CHASE.trackerQuietSeconds - 0.5)) < STEP,
    `state.quiet read ${run.state.quiet} after ${CHASE.trackerQuietSeconds - 0.5} s`);

  ride(run, 1, quiet());
  assert.equal(run.takeTrackerDemand(), true, 'the quiet spell never demanded');
  assert.equal(run.takeTrackerDemand(), false, 'one quiet spell demanded twice');
  // The demand winds the clock back by the retry rather than to zero (the
  // retry test above), so what is left is the retry's head start plus the
  // half second ridden since.
  assert.ok(Math.abs(run.state.quiet - (CHASE.trackerQuietSeconds - RETRY + 0.5)) < STEP * 2,
    `the quiet clock read ${run.state.quiet} after its own demand`);
});

test('a cop going nowhere well away from the rider is stuck, and is regrouped after the stall seconds', () => {
  const run = new ChaseRun();
  run.arm();
  const away = CHASE.trackerStallGapMetres + 10;
  ride(run, CHASE.trackerStallSeconds - 0.5, parked(away));
  assert.equal(run.takeTrackerDemand(), false, 'demanded before the stall seconds were served');
  ride(run, 1, parked(away));
  assert.equal(run.takeTrackerDemand(), true, 'a stuck cop was never regrouped');
  assert.equal(run.takeTrackerDemand(), false, 'one stall demanded twice');

  // Rolling again, however briefly, is the condition lifting: two part-stalls
  // are never added together, the hold clock's own rule.
  const rolling = parked(away, { copSpeed: CHASE.trackerStallSpeed * 4 });
  ride(run, 0.5, rolling);
  ride(run, CHASE.trackerStallSeconds - 0.2, parked(away));
  ride(run, 0.5, rolling);
  ride(run, CHASE.trackerStallSeconds - 0.2, parked(away));
  assert.equal(run.takeTrackerDemand(), false, 'two part-stalls were added together');
});

test('a cop holding at arm’s length is not stuck, and a speed-blind caller never stalls him', () => {
  // Inside `trackerStallGapMetres` a stationary cop is holding, not stuck: a
  // rider who has stopped has a cop who has stopped, and moving him from
  // there would be the teleport the fiction exists to hide.
  const close = new ChaseRun();
  close.arm();
  ride(close, CHASE.trackerStallSeconds * 3, parked(CHASE.trackerStallGapMetres - 5));
  assert.equal(close.takeTrackerDemand(), false, 'a cop holding at arm’s length was regrouped');

  // Every pre-§31 call site — and every fixture above this section — omits
  // `copSpeed`. Absent facts must read as a cop who is moving.
  const blind = new ChaseRun();
  blind.arm();
  ride(blind, CHASE.trackerStallSeconds * 3,
    { offRoute: 0, copDistance: CHASE.trackerStallGapMetres + 10, crashed: false });
  assert.equal(blind.takeTrackerDemand(), false, 'a speed-blind caller manufactured a stall');
});

test('a downed cop holds every clock at zero, and standing up buys the respite', () => {
  const run = new ChaseRun();
  run.arm();
  // The worst case for all three clocks at once — blown out past the tracker
  // line (the hold and the quiet clock both run), reading no speed well away
  // from the rider (the stall clock runs) — and he is on the ground.
  const down: ChaseInput = { ...BLOWN, copCrashed: true, copSpeed: 0 };
  const up: ChaseInput = { ...down, copCrashed: false };
  ride(run, CHASE.trackerQuietSeconds * 3, down);
  assert.equal(run.takeTrackerDemand(), false, 'a downed cop was regrouped');
  assert.equal(run.state.quiet, 0, 'the quiet clock ran while he was down');
  assert.equal(run.state.respite, 0, 'a respite began before he stood up');

  // The step he stands up arms the whole respite (less the step itself).
  run.step(STEP, up);
  const armed = run.state.respite;
  assert.ok(armed > CHASE.trackerRespiteSeconds - STEP * 2 && armed <= CHASE.trackerRespiteSeconds,
    `standing up armed a respite of ${armed} s`);

  // It counts down, and holds every clock while it does.
  const most = CHASE.trackerRespiteSeconds - 0.5;
  ride(run, most, up);
  assert.ok(Math.abs(run.state.respite - (armed - most)) < STEP,
    `the respite read ${run.state.respite} s after ${most} s of it`);
  assert.equal(run.takeTrackerDemand(), false, 'a regroup was demanded inside the respite');
  assert.equal(run.state.quiet, 0, 'the quiet clock ran inside the respite');

  // Respite over: the clocks run again, and from zero — the seconds he spent
  // standing beyond the tracker line inside the respite count for nothing.
  ride(run, 0.5 + STEP * 2, up);
  assert.equal(run.state.respite, 0, 'the respite outlived its seconds');
  ride(run, CHASE.trackerHoldSeconds - 0.5, up);
  assert.equal(run.takeTrackerDemand(), false, 'the respite’s seconds were counted toward the hold');
  ride(run, 1, up);
  assert.equal(run.takeTrackerDemand(), true, 'the clocks never restarted after the respite');
});

test('a crashed rider holds the quiet and stall clocks, as it holds the hold', () => {
  // M20.2's rule for the hold clock (above); the two new clocks inherit it,
  // for the same reason — a regroup onto somebody on the ground hands the
  // bust radius a rider who cannot ride.
  const run = new ChaseRun();
  run.arm();
  // The crash edge is spent in the quiet band, far outside the bust radius,
  // so the crash itself is not a bust and the run keeps going.
  ride(run, CHASE.trackerQuietSeconds * 3, quiet({ crashed: true }));
  assert.equal(run.state.phase, 'running');
  assert.equal(run.takeTrackerDemand(), false, 'the quiet clock counted a downed rider');
  assert.equal(run.state.quiet, 0);
  ride(run, CHASE.trackerStallSeconds * 3, parked(CHASE.trackerStallGapMetres + 10, { crashed: true }));
  assert.equal(run.takeTrackerDemand(), false, 'the stall clock counted a downed rider');
});

test('one demand winds all three clocks back by the retry, whichever of them fired', () => {
  // A parked cop in the quiet band runs the stall clock and the quiet clock
  // together, and the stall fires first. The quiet clock is wound back with
  // it — not reset, or a refused regroup would wait a whole quiet spell for
  // its second ask; not left alone, or it would fire on its own schedule six
  // seconds later and one problem would regroup him twice.
  const run = new ChaseRun();
  run.arm();
  const parkedAndQuiet = quiet({ copSpeed: CHASE.trackerStallSpeed * 0.5 });
  ride(run, CHASE.trackerStallSeconds + 0.5, parkedAndQuiet);
  assert.equal(run.takeTrackerDemand(), true, 'the stall never fired');
  const woundTo = CHASE.trackerStallSeconds - RETRY + 0.5;
  assert.ok(Math.abs(run.state.quiet - woundTo) < STEP * 2,
    `the stall’s demand left the quiet clock at ${run.state.quiet} s, not ${woundTo}`);

  // Rolling again but still quiet: only the quiet clock runs, from where the
  // stall's demand left it.
  const rollingAndQuiet = quiet({ copSpeed: CHASE.trackerStallSpeed * 4 });
  const remaining = CHASE.trackerQuietSeconds - woundTo;
  ride(run, remaining - 0.5, rollingAndQuiet);
  assert.equal(run.takeTrackerDemand(), false, 'the quiet clock kept its seconds from before the stall’s demand');
  ride(run, 1, rollingAndQuiet);
  assert.equal(run.takeTrackerDemand(), true, 'the quiet clock never restarted after the stall’s demand');
});

test('arming clears the quiet and stall clocks, and abandoning clears the respite too', () => {
  const run = new ChaseRun();
  run.arm();
  ride(run, CHASE.trackerQuietSeconds - 1, quiet());
  assert.ok(run.state.quiet > 0, 'the fixture never ran the quiet clock');
  // Re-arming without abandoning — the results card's "again" — is a fresh run.
  run.arm();
  assert.equal(run.state.quiet, 0, 'arm() kept the quiet clock');
  ride(run, CHASE.trackerQuietSeconds - 1, quiet());
  assert.equal(run.takeTrackerDemand(), false, 'the old run’s quiet clock leaked into this one');

  // The stall clock, through abandon.
  ride(run, CHASE.trackerStallSeconds - 1, parked(CHASE.trackerStallGapMetres + 10));
  run.abandon();
  assert.equal(run.state.quiet, 0);
  run.arm();
  ride(run, CHASE.trackerStallSeconds - 1, parked(CHASE.trackerStallGapMetres + 10));
  assert.equal(run.takeTrackerDemand(), false, 'the old run’s stall clock leaked into this one');

  // A live respite through abandon: down for a second, up for a step (the
  // respite arms), then the run is dropped. The next run's clocks must run
  // from its first step — a respite is earned inside a run, never carried.
  ride(run, 1, { ...BLOWN, copCrashed: true });
  run.step(STEP, BLOWN);
  assert.ok(run.state.respite > 0, 'the fixture never armed a respite');
  run.abandon();
  assert.equal(run.state.respite, 0, 'abandon() kept the respite');
  run.arm();
  ride(run, CHASE.trackerHoldSeconds + 0.5, BLOWN);
  assert.equal(run.takeTrackerDemand(), true, 'the old run’s respite held the new run’s clocks');

  // And a cop who was down when the run was dropped is not "standing up" on
  // the next run's first step: the rising edge belongs to the run it rises in.
  ride(run, 1, { ...BLOWN, copCrashed: true });
  run.abandon();
  run.arm();
  ride(run, CHASE.trackerHoldSeconds + 0.5, BLOWN);
  assert.equal(run.takeTrackerDemand(), true, 'the last run’s crash bought this run a respite');
});

// ---------------------------------------------------------------------------
// The room — M39 Part P (§39.6b.3 "The endings", §39.6b.3b "The referee",
// "The deal"; docs/M39_CHASE.md §2a). Every case above still runs through
// `ChaseRun`, which is now the one-outlaw, one-cop room; the cases below ride
// the room itself at its real N.
// ---------------------------------------------------------------------------

test('A-1: a crash edge beside a ragdolled cop is no longer a bust; beside a standing one it still is', () => {
  // §39.6b.3: "caught on the crash edge with any STANDING cop inside
  // bustRadiusMetres". The shipped referee read the radius alone, so a rider
  // crashing onto a ragdolled Dorkins was busted by nobody standing — the one
  // deliberate solo change the room makes, beside A-12 in the brain.
  const run = new ChaseRun();
  run.arm();
  ride(run, 1, { offRoute: 0, copDistance: 2, crashed: true, copCrashed: true });
  assert.equal(run.state.phase, 'running', 'a ragdolled officer made an arrest');
  ride(run, 1, CALM);
  ride(run, 1, { offRoute: 0, copDistance: 2, crashed: true, copCrashed: false });
  assert.equal(run.state.outcome, 'caught', 'a standing cop no longer busts a crash beside him');
});

/** One cop's facts, terse: distances to each outlaw and whatever else the case needs. */
interface CopFacts {
  readonly d: readonly number[];
  readonly crashed?: boolean;
  readonly parked?: boolean;
  readonly speed?: number;
  readonly closing?: readonly number[];
  readonly teleported?: boolean;
  readonly paddleArmed?: boolean;
}

/** One outlaw's facts, terse: on the road and upright unless said otherwise. */
interface OutFacts {
  readonly offRoute?: number;
  readonly crashed?: boolean;
  readonly gaveUp?: boolean;
  readonly teleported?: boolean;
}

/** A pose set. Cops ride at 20 m/s unless the case says otherwise, so no stall clock runs by accident. */
function facts(outlaws: readonly OutFacts[], cops: readonly CopFacts[]): ChaseRoomInput {
  return {
    outlaws: outlaws.map((o) => ({
      offRoute: o.offRoute ?? 0,
      crashed: o.crashed ?? false,
      gaveUp: o.gaveUp,
      teleported: o.teleported,
    })),
    pursuers: cops.map((c) => ({
      crashed: c.crashed ?? false,
      parked: c.parked ?? false,
      speed: c.speed ?? 20,
      teleported: c.teleported,
      paddleArmed: c.paddleArmed,
      distance: c.d,
      outlawClosing: c.closing ?? c.d.map(() => 0),
    })),
  };
}

/** Arm a room: `outlaws` humans against the rule's pack (or `cpu` cops, or a human cop). */
function armRoom(
  outlaws: number,
  opts: { human?: boolean; cpu?: number; bell?: number; arm?: Partial<ChaseArmOptions> } = {},
): ChaseRoom {
  const room = new ChaseRoom();
  room.arm(roomSpec(outlaws, opts.human ?? false, opts.cpu), {
    bellSeconds: opts.bell ?? CHASE.escapeSeconds,
    ...opts.arm,
  });
  return room;
}

interface Log {
  readonly events: ChaseEvent[];
  readonly demands: ChaseDemand[];
  ended: boolean;
}

/** Step `seconds` of one pose set, or until the round ends, collecting events and (copied) demands. */
function play(room: ChaseRoom, seconds: number, input: ChaseRoomInput, log?: Log): Log {
  const out: Log = log ?? { events: [], demands: [], ended: false };
  const steps = Math.round(seconds * SIMULATION.hz);
  for (let step = 0; step < steps; step += 1) {
    const result = room.step(STEP, input);
    out.events.push(...result.events);
    for (const demand of room.takeDemands()) out.demands.push({ ...demand });
    if (result.ended) {
      out.ended = true;
      break;
    }
  }
  return out;
}

/** Demands of one kind, for terse assertions. */
function kinds(log: Log, kind: ChaseDemand['kind']): ChaseDemand[] {
  return log.demands.filter((demand) => demand.kind === kind);
}

test('the rule’s arithmetic: roomSize − outlaws CPU cops, none beside a human, and arm refuses any other room', () => {
  // q207: one human against three, two against two, three against one.
  assert.equal(CHASE.roomSize, 4, 'the room is four (q207); every case below assumes it');
  assert.equal(cpuPackSize(1, false), 3);
  assert.equal(cpuPackSize(2, false), 2);
  assert.equal(cpuPackSize(3, false), 1);
  assert.equal(cpuPackSize(2, true), 0, 'a human cop is the slot: no CPU cop rides beside him');
  assert.deepEqual(roomSpec(2, false).pursuers.map((p) => `${p.kind}:${p.role}`), ['cpu:tail', 'cpu:patrol']);
  assert.deepEqual(roomSpec(1, false).pursuers.map((p) => p.role), ['tail', 'patrol', 'patrol']);
  assert.deepEqual(roomSpec(3, true).pursuers, [{ kind: 'human', role: 'tail' }]);

  const bell = { bellSeconds: 60 };
  // Legal: every rule room, a human-cop room at every N, and the ?cops=1|2 probes.
  for (const outlaws of [1, 2, 3]) {
    assert.doesNotThrow(() => new ChaseRoom().arm(roomSpec(outlaws, false), bell));
    assert.doesNotThrow(() => new ChaseRoom().arm(roomSpec(outlaws, true), bell));
  }
  assert.doesNotThrow(() => new ChaseRoom().arm(roomSpec(1, false, 1), bell));
  assert.doesNotThrow(() => new ChaseRoom().arm(roomSpec(1, false, 2), bell));
  // Illegal: no outlaw, a fourth outlaw, an overfull pack, a human beside CPU
  // cops, a pack led by a patrol, an empty slot, a bell that is not a bell.
  assert.throws(() => new ChaseRoom().arm(roomSpec(0, false, 1), bell));
  assert.throws(() => new ChaseRoom().arm(roomSpec(4, true), bell));
  assert.throws(() => new ChaseRoom().arm(roomSpec(3, false, 2), bell));
  assert.throws(() => new ChaseRoom().arm({ outlaws: 1, pursuers: [{ kind: 'human', role: 'tail' }, { kind: 'cpu', role: 'patrol' }] }, bell));
  assert.throws(() => new ChaseRoom().arm({ outlaws: 1, pursuers: [{ kind: 'cpu', role: 'patrol' }] }, bell));
  assert.throws(() => new ChaseRoom().arm({ outlaws: 1, pursuers: [] }, bell));
  assert.throws(() => new ChaseRoom().arm(roomSpec(1, false), { bellSeconds: Number.NaN }));
});

test('caught names the nearest standing cop in the radius — never a ragdolled or freshly placed one', () => {
  const room = armRoom(1);
  // Pursuer 0 is down at 2 m, pursuer 1 was placed this step at 3 m (M23's
  // rule: a teleport voids his two-body facts), pursuer 2 stands at 8 m.
  const log = play(room, 0.5, facts([{ crashed: true }], [
    { d: [2], crashed: true }, { d: [3], teleported: true }, { d: [8] },
  ]));
  assert.equal(log.ended, true);
  const out = log.events.find((event) => event.kind === 'out');
  assert.ok(out !== undefined);
  assert.equal(out.status, 'caught');
  assert.equal(out.pursuer, 2, 'the bust was credited to a cop who could not have made it');
  assert.equal(room.state.result?.pursuers[2].busts, 1);
  assert.equal(room.state.result?.pursuers[0].busts, 0);
  assert.equal(room.state.outlaws[0].by, 2);

  // Nobody standing and un-placed inside the radius: the crash costs the
  // recovery and nothing else.
  const alone = armRoom(1);
  play(alone, 2, facts([{ crashed: true }], [
    { d: [2], crashed: true }, { d: [3], teleported: true }, { d: [CHASE.bustRadiusMetres + 1] },
  ]));
  assert.equal(alone.statusOf(0), 'standing');
});

test('caught names the striker when his landed swing preceded the crash inside the window', () => {
  // A-7: a hard knock crashes on the strike's own step, a soft knock's wobble
  // lands later; both belong to the swing's owner (q222) even when a packmate
  // happens to be nearer by the time the rider hits the ground.
  const upright = facts([{}], [{ d: [5] }, { d: [2] }]);
  const down = facts([{ crashed: true }], [{ d: [5] }, { d: [2] }]);

  const soft = armRoom(2, { cpu: 2 });
  const softDown = facts([{ crashed: true }, {}], [{ d: [5, 300] }, { d: [2, 300] }]);
  soft.recordStrike(0, 0);
  play(soft, 0.5, facts([{}, {}], [{ d: [5, 300] }, { d: [2, 300] }]));
  play(soft, STEP, softDown);
  assert.equal(soft.statusOf(0), 'caught');
  assert.equal(soft.creditOf(0), 0, 'a soft knock’s crash half a second later went to the nearer packmate');

  const stale = armRoom(1, { cpu: 2 });
  stale.recordStrike(0, 0);
  play(stale, 1.5, upright);
  play(stale, STEP, down);
  assert.equal(stale.creditOf(0), 1, 'a swing from a second and a half ago still claimed the crash');

  const hard = armRoom(1, { cpu: 2 });
  hard.recordStrike(0, 0);
  play(hard, STEP, down);
  assert.equal(hard.creditOf(0), 0, 'the hard knock’s own-step crash was not the striker’s');

  // A striker who is down himself when the rider falls hands the credit on.
  const felled = armRoom(1, { cpu: 2 });
  felled.recordStrike(0, 0);
  play(felled, STEP, facts([{ crashed: true }], [{ d: [5], crashed: true }, { d: [2] }]));
  assert.equal(felled.creditOf(0), 1);
});

test('touched names the cop touched, and the no-scoring-by-ramming clause holds per cop', () => {
  // M24's promise at N cops: only the outlaw's own closing AGAINST THAT COP
  // counts. Pursuer 0 grinds into a standing outlaw (her closing on him is
  // zero); pursuer 1 is the one she rides into.
  const rammed = armRoom(1, { cpu: 2 });
  const grind = facts([{}], [{ d: [0.5], closing: [0] }, { d: [40], closing: [6] }]);
  play(rammed, 30, grind);
  assert.equal(rammed.statusOf(0), 'standing',
    'a cop ramming her scored because she was closing on a different cop 40 m away');

  const into = armRoom(1, { cpu: 2 });
  const log = play(into, STEP, facts([{}], [
    { d: [0.5], closing: [0] }, { d: [0.9], closing: [CHASE.touchBustClosingSpeed + 1] },
  ]));
  assert.equal(into.statusOf(0), 'touched');
  assert.equal(into.creditOf(0), 1, 'the touch was credited to the nearer cop she was not riding into');
  assert.equal(log.events.find((event) => event.kind === 'out')?.pursuer, 1);

  // A step that placed either body voids the touch (M23's rule): a cop
  // returned onto her, or her respawned into him, is nobody's ram.
  const placedCop = armRoom(1, { cpu: 1 });
  play(placedCop, 1, facts([{}], [{ d: [0.5], closing: [5], teleported: true }]));
  assert.equal(placedCop.statusOf(0), 'standing', 'a cop teleported onto her was her ram');
  const placedOutlaw = armRoom(1, { cpu: 1 });
  play(placedOutlaw, 1, facts([{ teleported: true }], [{ d: [0.5], closing: [5] }]));
  assert.equal(placedOutlaw.statusOf(0), 'standing', 'a respawn into the cop was her ram');
  // And a ragdolled cop is touched by nobody.
  const down = armRoom(1, { cpu: 1 });
  play(down, 1, facts([{}], [{ d: [0.5], closing: [5], crashed: true }]));
  assert.equal(down.statusOf(0), 'standing');
});

test('the bell first: a sweep on the bell’s own step is an escape, and the room says who got away', () => {
  const room = armRoom(2, { bell: 10 });
  // Outlaw 1 is caught early; outlaw 0 rides on to the bell.
  play(room, 1, facts([{}, {}], [{ d: [300, 300] }, { d: [300, 300] }]));
  play(room, STEP, facts([{}, { crashed: true }], [{ d: [300, 300] }, { d: [300, 2] }]));
  assert.equal(room.statusOf(1), 'caught');
  play(room, 10 - 1 - STEP * 2.5, facts([{}, {}], [{ d: [300, 300] }, { d: [300, 300] }]));
  assert.equal(room.phase, 'running');
  // The last standing outlaw crashes beside the cop on the step the bell rings.
  const last = room.step(STEP, facts([{ crashed: true }, {}], [{ d: [1, 300] }, { d: [300, 300] }]));
  assert.equal(last.ended, true);
  assert.equal(room.statusOf(0), 'escaped', 'a crash after the whistle took the escape away');
  const result = room.state.result;
  assert.ok(result !== null);
  assert.equal(result.swept, false);
  assert.equal(result.escaped, 1);
  assert.equal(result.outlaws[0].survived, 10);
  assert.equal(result.outlaws[0].place, 1);
  assert.equal(result.outlaws[1].place, 2);
  assert.equal(result.outlaws[1].by, 1);
  const ended = last.events.find((event) => event.kind === 'ended');
  assert.equal(ended?.value, 1, 'the ended event did not carry how many got away');
  // Ended: the bed fades, and the room answers nothing more.
  assert.equal(room.sirenRangeMetres, Infinity);
  assert.equal(room.step(STEP, facts([{ crashed: true }, {}], [{ d: [1, 1] }, { d: [1, 1] }])).ended, false);
});

test('the last standing outlaw going down ends the round early: the cop swept the room', () => {
  const room = armRoom(2, { bell: 60 });
  const clear = facts([{}, {}], [{ d: [300, 300] }, { d: [300, 300] }]);
  play(room, 2, clear);
  play(room, STEP, facts([{ crashed: true }, {}], [{ d: [2, 300] }, { d: [300, 300] }]));
  assert.equal(room.phase, 'running', 'one outlaw down ended a room with another standing');
  play(room, 3, facts([{}, {}], [{ d: [300, 300] }, { d: [300, 300] }]));
  const log = play(room, STEP, facts([{}, { offRoute: 0, crashed: false }], [
    { d: [300, 0.5], closing: [0, 3] }, { d: [300, 300] },
  ]));
  assert.equal(log.ended, true);
  const result = room.state.result;
  assert.ok(result !== null);
  assert.equal(result.swept, true);
  assert.equal(result.escaped, 0);
  assert.deepEqual(result.outlaws.map((o) => o.status), ['caught', 'touched']);
  assert.deepEqual(result.pursuers.map((p) => p.busts), [2, 0]);
  // Placed by time standing: the later one down is ahead.
  assert.deepEqual(result.outlaws.map((o) => o.place), [2, 1]);
  assert.ok(result.seconds < 60 && Math.abs(result.seconds - result.outlaws[1].survived) < 1e-9);
});

test('placements are shared, never tie-broken: the escaped share first, and a shared second shares a place', () => {
  // q86 (the Knockabout draw): places are 1 + the number who stood strictly
  // longer, so equal times give equal places and nobody invents an order.
  const room = armRoom(3, { bell: 5 });
  play(room, 2, facts([{}, {}, {}], [{ d: [300, 300, 300] }]));
  // Outlaws 0 and 1 go down on the same step; outlaw 2 rides to the bell.
  play(room, STEP, facts([{ crashed: true }, { crashed: true }, {}], [{ d: [3, 4, 300] }]));
  play(room, 5, facts([{}, {}, {}], [{ d: [300, 300, 300] }]));
  const result = room.state.result;
  assert.ok(result !== null);
  assert.deepEqual(result.outlaws.map((o) => o.place), [2, 2, 1]);

  const pair = armRoom(3, { bell: 5 });
  play(pair, 1, facts([{}, {}, {}], [{ d: [300, 300, 300] }]));
  play(pair, STEP, facts([{}, {}, { crashed: true }], [{ d: [300, 300, 2] }]));
  play(pair, 5, facts([{}, {}, {}], [{ d: [300, 300, 300] }]));
  assert.deepEqual(pair.state.result?.outlaws.map((o) => o.place), [1, 1, 3],
    'two escapes did not share first, or the third was not third');
  assert.deepEqual(pair.state.result?.outlaws.map((o) => o.status), ['escaped', 'escaped', 'caught']);
});

test('gave up: an outlaw’s R is his bust, credited to nobody, and the room rides on', () => {
  // q225: a teleport out from under a cop is the one escape the mode cannot
  // allow — even with a cop inside the bust radius, R is nobody's arrest.
  const room = armRoom(2);
  const log = play(room, STEP, facts([{ gaveUp: true }, {}], [{ d: [3, 300] }, { d: [300, 300] }]));
  assert.equal(room.statusOf(0), 'gaveUp');
  assert.equal(room.creditOf(0), -1);
  assert.deepEqual(room.state.pursuers.map((p) => p.busts), [0, 0], 'somebody was credited with a give-up');
  const out = log.events.find((event) => event.kind === 'out');
  assert.equal(out?.status, 'gaveUp');
  assert.equal(out?.pursuer, -1);
  assert.equal(room.phase, 'running');
  assert.equal(room.state.standing, 1);
});

test('the quiet clock is per outlaw: no standing cop inside HIS siren line, and the parked patrol answers it', () => {
  // §39.6b.3b. 2v2: the tail (dealt outlaw 0 by A-6's fallback) rides 30 m
  // from outlaw 0 and 100 m from outlaw 1; the patrol stands parked far from
  // both. Outlaw 0 is pressed; outlaw 1 is free riding, and only his clock runs.
  const room = armRoom(2);
  assert.equal(room.quarryOf(0), 0);
  assert.equal(room.quarryOf(1), 1);
  const input = facts([{}, {}], [{ d: [30, 100] }, { d: [300, 300], parked: true }]);
  const early = play(room, CHASE.trackerQuietSeconds - 0.5, input);
  assert.equal(early.demands.length, 0, 'a clock fired early');
  assert.equal(room.quietOf(0), 0, 'the pressed outlaw’s quiet clock ran');
  assert.ok(Math.abs(room.quietOf(1) - (CHASE.trackerQuietSeconds - 0.5)) < STEP * 2);
  assert.equal(room.state.pursuers[1].phase, 'parked');

  const fired = play(room, 1, input);
  // The director's answer since the brutal pass (2026-09-25): the parked
  // patrol is sent ahead of him, a roadblock on his road (`intercept`). The
  // tail is pressing outlaw 0, so he is not the answer; and the patrol is not
  // sent twice inside `INTERCEPT_HOLD_SECONDS`, whatever the clock does next.
  assert.deepEqual(fired.demands, [{ kind: 'intercept', pursuer: 1, outlaw: 1, cause: 'quiet' }]);
  assert.equal(room.quarryOf(1), 1);
  assert.equal(room.quarryOf(0), 0, 'the tail was pulled off the outlaw he is pressing');
});

test('R-9: a lone tail pressing one outlaw is never pulled off him by another’s quiet clock; lost, he is re-dealt', () => {
  // 2 outlaws against one CPU cop (the ?cops= probe shape of the lone cop).
  const pressing = armRoom(2, { cpu: 1 });
  const busy = facts([{}, {}], [{ d: [30, 100] }]);
  const log = play(pressing, CHASE.trackerQuietSeconds + 1, busy);
  assert.equal(pressing.quarryOf(0), 0, 'a stranger’s quiet clock pulled the tail off his quarry');
  assert.equal(log.demands.length, 0, 'the unanswerable quiet clock raised a demand');
  // Wound back rather than left to fire every step: asked again after the retry.
  assert.ok(pressing.quietOf(1) < CHASE.trackerQuietSeconds && pressing.quietOf(1) > CHASE.trackerQuietSeconds - RETRY - 1);

  // The same tail, having lost outlaw 0 beyond his own quiet line. Outlaw 1's
  // clock is ten seconds in before the tail drifts back.
  const lost = armRoom(2, { cpu: 1 });
  play(lost, 10, busy);
  const drift = play(lost, 3, facts([{}, {}], [{ d: [80, 100] }]));
  assert.equal(lost.quarryOf(0), 1, 'a tail who lost his quarry never took the quiet one');
  assert.deepEqual(drift.demands.slice(0, 2), [
    { kind: 're-deal', pursuer: 0, outlaw: 1, cause: 'quiet' },
    { kind: 'tail-return', pursuer: 0, outlaw: 1, cause: 'quiet' },
  ]);
});

test('the opening deal: an unchased outlaw before a nearer chased one, then doubling up; the fallback is p mod N', () => {
  // q221 (1)–(2), D0. Both cops start nearer outlaw 0; the patrol still takes
  // outlaw 1, because an outlaw nobody is chasing comes first.
  const dealt = armRoom(2, { arm: { startDistances: [[10, 100], [12, 90]] } });
  assert.equal(dealt.quarryOf(0), 0);
  assert.equal(dealt.quarryOf(1), 1, 'a nearer chased outlaw beat an unchased one');
  const flipped = armRoom(2, { arm: { startDistances: [[100, 10], [12, 90]] } });
  assert.deepEqual([flipped.quarryOf(0), flipped.quarryOf(1)], [1, 0]);
  // A-6's fallback, and the solo room: every cop on outlaw 0 from the first step.
  const fallback = armRoom(2);
  assert.deepEqual([fallback.quarryOf(0), fallback.quarryOf(1)], [0, 1]);
  const solo = armRoom(1);
  assert.deepEqual([solo.quarryOf(0), solo.quarryOf(1), solo.quarryOf(2)], [0, 0, 0]);
  // The lone cop opens on the nearest (nobody has been unpressured yet).
  const lone = armRoom(3, { arm: { startDistances: [[50, 10, 30]] } });
  assert.equal(lone.quarryOf(0), 1);
  // A human cop is never dealt.
  assert.equal(armRoom(3, { human: true }).quarryOf(0), -1);
});

test('the deal is re-dealt the moment the quarry goes down, hold or no hold', () => {
  // q221 (4), D1. The patrol is 5 m behind outlaw 1, inside close pursuit and
  // well inside the hold, when outlaw 1 goes down: forced, at once, onto the
  // outlaw still standing.
  const room = armRoom(2);
  play(room, 0.25, facts([{}, {}], [{ d: [30, 300] }, { d: [300, 5] }]));
  const log = play(room, STEP, facts([{}, { crashed: true }], [{ d: [30, 300] }, { d: [300, 5] }]));
  assert.equal(room.statusOf(1), 'caught');
  assert.equal(room.quarryOf(1), 0, 'a cop kept chasing a busted outlaw');
  assert.deepEqual(kinds(log, 're-deal'), [{ kind: 're-deal', pursuer: 1, outlaw: 0, cause: 'deal' }]);
  assert.equal(room.state.pursuers[1].dealtFor, 0, 'a new deal kept the old one’s age');
});

test('coverage waits for the hold, an armed paddle and close pursuit before moving a surplus cop', () => {
  // q221 (3), D2. A start row the tail can read and a patrol row it cannot:
  // the tail takes the nearer outlaw 1 by the forced rule, and the patrol's
  // fallback (1 mod 2) doubles him up — outlaw 0 is unchased.
  const room = armRoom(2, { arm: { startDistances: [[40, 30]] } });
  assert.deepEqual([room.quarryOf(0), room.quarryOf(1)], [1, 1]);
  const input = (tailArmed: boolean, patrolToOne: number) => facts([{}, {}], [
    { d: [40, 30], paddleArmed: tailArmed }, { d: [45, patrolToOne] },
  ]);
  play(room, CHASE.dealHoldSeconds - 0.5, input(false, 60));
  assert.deepEqual([room.quarryOf(0), room.quarryOf(1)], [1, 1], 'a deal changed inside its hold');

  // Past the hold, the tail is the nearer surplus to outlaw 0 but his paddle is
  // wound up, and the patrol is in close pursuit of outlaw 1: nobody moves.
  play(room, 1, input(true, CHASE.pursuitNearMetres - 5));
  assert.deepEqual([room.quarryOf(0), room.quarryOf(1)], [1, 1],
    'a cop was re-dealt with his paddle armed or on his quarry’s wheel');
  // The patrol drops back out of close pursuit: he may change, and he does.
  const log = play(room, STEP, input(true, CHASE.pursuitNearMetres + 20));
  assert.deepEqual([room.quarryOf(0), room.quarryOf(1)], [1, 0]);
  assert.deepEqual(log.demands, [{ kind: 're-deal', pursuer: 1, outlaw: 0, cause: 'deal' }]);
});

test('a lone cop keeps his quarry until he loses him, then takes the outlaw unpressured longest, not the nearest', () => {
  // q221: "the pressure rotates on the quiet clocks and nobody free-rides".
  // 3v1: the tail is dealt outlaw 0 and loses him (200 m, past the tracker
  // line); outlaw 2 is the nearest at 40 m but pressed, outlaw 1 at 70 m has
  // been unpressured the whole time.
  const room = armRoom(3);
  assert.equal(room.quarryOf(0), 0);
  const input = facts([{}, {}, {}], [{ d: [200, 70, 40] }]);
  // Until the deal has held, the gap's answer is the shipped return behind him.
  const early = play(room, CHASE.dealHoldSeconds - 0.5, input);
  assert.ok(kinds(early, 'tail-return').length >= 1, 'the lost quarry was never regrouped behind');
  assert.ok(kinds(early, 'tail-return').every((d) => d.outlaw === 0 && d.cause === 'gap'));
  assert.equal(room.quarryOf(0), 0, 'the deal changed inside its hold');
  const later = play(room, RETRY + 1, input);
  assert.equal(room.quarryOf(0), 1, 'the lone cop took the nearest outlaw rather than the one unpressured longest');
  assert.deepEqual(kinds(later, 're-deal')[0], { kind: 're-deal', pursuer: 0, outlaw: 1, cause: 'gap' });
  assert.equal(room.state.outlaws[2].unpressured, 0);

  // D1 for the lone cop uses the same key: his quarry goes down and he takes
  // the outlaw unpressured longest.
  const forced = armRoom(3);
  play(forced, 5, facts([{}, {}, {}], [{ d: [30, 90, 40] }]));
  play(forced, STEP, facts([{ crashed: true }, {}, {}], [{ d: [3, 90, 40] }]));
  assert.equal(forced.quarryOf(0), 1);
});

test('a human cop carries no clocks, receives no demands and is never dealt — and busts like any standing cop', () => {
  // §39.6b.3b: "He has no director". Every outlaw far away for a minute.
  const room = armRoom(2, { human: true });
  const log = play(room, 60, facts([{}, {}], [{ d: [500, 800], speed: 0 }]));
  assert.equal(log.demands.length, 0, 'a human cop was sent a demand');
  assert.equal(room.quarryOf(0), -1);
  const cop = room.state.pursuers[0];
  assert.deepEqual([cop.kind, cop.phase, cop.gap, cop.stall, cop.respite], ['human', 'chasing', 0, 0, 0]);
  assert.deepEqual([room.quietOf(0), room.quietOf(1)], [0, 0], 'the quiet clock ran with nobody to answer it');
  // His bearing readout's facts: the nearest standing outlaw and the range.
  assert.deepEqual([cop.nearestOutlaw, cop.nearestOutlawMetres], [0, 500]);

  // Down, he busts nobody; standing, a crash beside him is his bust.
  play(room, 1, facts([{ crashed: true }, {}], [{ d: [2, 800], crashed: true }]));
  assert.equal(room.statusOf(0), 'standing');
  play(room, 1, facts([{}, {}], [{ d: [500, 800] }]));
  play(room, STEP, facts([{}, { crashed: true }], [{ d: [500, 2] }]));
  assert.equal(room.statusOf(1), 'caught');
  assert.equal(room.creditOf(1), 0);
  assert.equal(room.state.pursuers[0].busts, 1);
});

test('the siren is the room’s nearest riding cop to a standing outlaw — never one cop’s own gap', () => {
  // §39.6b.3b "Sound": one bed, one number, whoever holds the slot. §21.9's
  // trap was a siren fed the cop's own gap; the reduction below cannot be
  // that. Pursuer 0's own gap to his quarry is 100 m; the room's nearest
  // riding pair is 30 m; a parked patrol 5 m away is asleep and silent (R-19),
  // and a ragdolled one is nobody.
  const input = facts([{}, {}], [
    { d: [100, 30] }, { d: [5, 5], parked: true }, { d: [3, 3], crashed: true },
  ]);
  assert.equal(nearestStandingPair(input, [true, true]), 30);
  assert.equal(nearestStandingPair(input, [true, false]), 100, 'a busted outlaw still fed the siren');
  assert.equal(nearestStandingPair(input, [false, false]), Infinity);

  const room = armRoom(2);
  assert.equal(room.quarryOf(0), 0);
  play(room, 1, facts([{}, {}], [{ d: [100, 250] }, { d: [250, 30] }]));
  assert.equal(room.sirenRangeMetres, 30, 'the siren read a cop’s own gap instead of the room’s nearest pair');
  assert.equal(room.nearestCopMetres(0), 100, 'seat 0’s own chase lane lost its nearest cop');
  assert.equal(room.nearestCopMetres(1), 30);
  // The outlaw the patrol was on goes down: the bed follows who is standing.
  play(room, STEP, facts([{}, { crashed: true }], [{ d: [100, 250] }, { d: [250, 2] }]));
  assert.equal(room.statusOf(1), 'caught');
  assert.equal(room.sirenRangeMetres, 100);
  // Not running: silent.
  assert.equal(new ChaseRoom().sirenRangeMetres, Infinity);
});

test('a crashed outlaw accumulates nothing on any clock — his own or his cop’s', () => {
  // "A crashed rider accumulates nothing on any clock, as today", per outlaw:
  // outlaw 1 lies far from every cop for half a minute (no bust — nobody near).
  const room = armRoom(2);
  play(room, 2, facts([{}, {}], [{ d: [30, 200] }, { d: [300, 200], speed: 0 }]));
  const before = room.state.outlaws[1].unpressured;
  play(room, 30, facts([{}, { crashed: true }], [{ d: [30, 200] }, { d: [300, 200], speed: 0 }]));
  assert.equal(room.statusOf(1), 'standing');
  assert.equal(room.quietOf(1), 0, 'a downed outlaw’s quiet clock ran');
  assert.equal(room.state.outlaws[1].unpressured, before, 'a downed outlaw banked unpressured time');
  const patrol = room.state.pursuers[1];
  assert.equal(patrol.quarry, 1);
  assert.deepEqual([patrol.gap, patrol.stall], [0, 0], 'a cop’s clocks ran on a quarry who is down');
});

test('the proximity wake: an outlaw inside the wake range of a parked patrol wakes him, once, and he rides in waking', () => {
  // §39.6b.3 "Waking": straight line, the siren's onset, heard as it happens.
  const room = armRoom(1);
  const log = play(room, 0.5, facts([{}], [
    { d: [30] }, { d: [CHASE.patrolWakeMetres - 5], parked: true }, { d: [CHASE.patrolWakeMetres + 50], parked: true },
  ]));
  assert.deepEqual(log.demands, [{ kind: 'patrol-wake', pursuer: 1, outlaw: 0, cause: 'proximity' }],
    'the wake was missed, repeated, or woke the patrol out of range');
  // Game flips his flag; he is a chaser with the shipped brain from here.
  play(room, STEP, facts([{}], [{ d: [30] }, { d: [50] }, { d: [300], parked: true }]));
  assert.equal(room.state.pursuers[1].phase, 'chasing', 'a patrol woken inside the tracker line never engaged');
  assert.equal(room.state.pursuers[2].phase, 'parked');
});

test('A-4: a waking patrol’s gap clock waits until he engages, unless he is losing ground; he is then sent ahead', () => {
  // A patrol woken 400 m away must be allowed to ride in (else the director's
  // second siren never arrives), but one who cannot close must not ride for
  // ever. The tail sits 30 m off the outlaw so no quiet clock runs.
  const room = armRoom(1);
  const far = facts([{}], [{ d: [30] }, { d: [400] }, { d: [400], parked: true }]);
  const riding = play(room, CHASE.trackerHoldSeconds * 3, far);
  assert.equal(riding.demands.length, 0, 'a waking patrol riding in was returned to his post');
  assert.equal(room.state.pursuers[1].phase, 'waking');
  assert.equal(room.state.pursuers[1].gap, 0);
  // Losing ground: 25 m worse than his best since the deal.
  const losing = play(room, CHASE.trackerHoldSeconds + 0.5, facts([{}], [{ d: [30] }, { d: [425] }, { d: [400], parked: true }]));
  // The brutal pass: his return is a roadblock ahead of the rider (Game falls
  // back to a fixed post when no spot on the road qualifies), never the tail's
  // return behind him (q206).
  assert.deepEqual(kinds(losing, 'intercept'), [{ kind: 'intercept', pursuer: 1, outlaw: 0, cause: 'gap' }],
    'a patrol who could not close was never sent ahead — or took the tail’s return (q206)');
  assert.equal(kinds(losing, 'tail-return').length, 0);
  assert.equal(kinds(losing, 'post-return').length, 0);
});

// The brutal pass (2026-09-25) replaced QA r1's quiet *wake* — the nearest
// parked patrol woken a third of the ring away and left to ride in for a whole
// quiet spell before anybody else was asked — with two answers in one step:
// the tail back behind the rider and a patrol sent ahead of him. The owner's
// ride: "it took a while of riding in silence before i ran into the next cop".
// QA r1's three cases pinned the removed answer and are replaced by these.

test('brutal pass: the quiet clock is answered by the tail behind AND a patrol ahead, in the same step', () => {
  // Solo face: the tail trails at 100 m (inside his own tracker line, out of
  // earshot), both patrols parked far away. The old director woke patrol 1
  // and nothing else; this one returns Dorkins and sends patrol 1 ahead.
  const room = armRoom(1);
  const parkedBoth = facts([{}], [{ d: [100] }, { d: [400], parked: true }, { d: [600], parked: true }]);
  const log = play(room, CHASE.trackerQuietSeconds + STEP * 2, parkedBoth);
  assert.deepEqual(log.demands, [
    { kind: 'tail-return', pursuer: 0, outlaw: 0, cause: 'quiet' },
    { kind: 'intercept', pursuer: 1, outlaw: 0, cause: 'quiet' },
  ], 'the quiet clock was not answered from both ends at once');
  assert.equal(kinds(log, 'patrol-wake').length, 0, 'a patrol was woken a third of the ring away instead');
});

test('brutal pass: a patrol sent ahead is not moved again inside the hold; the next spell sends the other one', () => {
  // The return behind is refused (Game could not place him: the tail stays at
  // 100 m), so the quiet clock asks again after the retry. Patrol 1 stands
  // parked where he was sent; he is not sent anywhere again for ten seconds,
  // and the next ask sends patrol 2 instead.
  const room = armRoom(1);
  const parkedBoth = facts([{}], [{ d: [100] }, { d: [400], parked: true }, { d: [600], parked: true }]);
  play(room, CHASE.trackerQuietSeconds + STEP * 2, parkedBoth);
  const after = play(room, RETRY * 3 + STEP * 2, parkedBoth);
  const returns = kinds(after, 'tail-return');
  assert.ok(returns.length >= 2, `a refused return was asked ${returns.length} times in ${RETRY * 3} s, not after every retry`);
  const sent = kinds(after, 'intercept');
  assert.ok(sent.every((demand) => demand.pursuer !== 1), 'the patrol just sent ahead was moved again inside the hold');
  assert.deepEqual(sent.map((demand) => demand.pursuer), [2], 'the other patrol was not sent, or sent twice');
});

test('brutal pass: a tail still riding in on his quarry is not "lost" to another outlaw’s quiet clock', () => {
  // 2 outlaws against the lone tail: he closes on outlaw 0 from 150 m at
  // 20 m/s while outlaw 1 goes quiet. Closing, he keeps his quarry; once he
  // stops closing out there, R-9 takes him as before.
  const room = armRoom(2, { cpu: 1 });
  const closingIn = (seconds: number): ChaseRoomInput => facts([{}, {}], [{ d: [Math.max(62, 150 - 20 * seconds), 300] }]);
  const steps = Math.round((CHASE.trackerQuietSeconds + 0.5) * SIMULATION.hz);
  for (let step = 1; step <= steps; step += 1) {
    room.step(STEP, closingIn(step * STEP));
    assert.ok(room.takeDemands().every((demand) => demand.outlaw !== 1),
      'the tail riding in was dealt the other outlaw');
  }
  // Stalled at 62 m (the closure has run out), he is lost again: R-9 re-deals him.
  const log = play(room, CHASE.trackerQuietSeconds + 1, facts([{}, {}], [{ d: [62, 300] }]));
  assert.ok(kinds(log, 're-deal').some((demand) => demand.pursuer === 0 && demand.outlaw === 1),
    'a tail who stopped closing out of earshot was never re-dealt');
});

test('brutal pass: a patrol pressing his own quarry is never sent ahead of another', () => {
  // 2v2: the patrol presses outlaw 1 at 30 m; outlaw 0 goes quiet. The tail is
  // his and is returned; the patrol stays on outlaw 1.
  const room = armRoom(2);
  const input = facts([{}, {}], [{ d: [100, 300] }, { d: [300, 30] }]);
  const log = play(room, CHASE.trackerQuietSeconds + STEP * 2, input);
  assert.deepEqual(log.demands, [{ kind: 'tail-return', pursuer: 0, outlaw: 0, cause: 'quiet' }]);
  assert.equal(room.quarryOf(1), 1, 'the patrol was pulled off the outlaw he is pressing');
});

test('brutal pass: a patrol parked nowhere near his quarry is sent ahead after the idle spell; one within reach waits', () => {
  // Solo face, the tail pressing at 30 m (no quiet clock runs). Patrol 1's post
  // is 800 m from the rider, patrol 2's 150 m: the first becomes a roadblock
  // after `roadblockIdleSeconds`, the second is left for the rider to reach.
  const room = armRoom(1);
  const input = facts([{}], [{ d: [30] }, { d: [800], parked: true }, { d: [150], parked: true }]);
  const early = play(room, CHASE.roadblockIdleSeconds - 0.5, input);
  assert.equal(early.demands.length, 0, 'a patrol was moved before his idle spell was up');
  const fired = play(room, 1, input);
  assert.deepEqual(fired.demands, [{ kind: 'intercept', pursuer: 1, outlaw: 0, cause: 'idle' }]);
  // Game parks him ahead, 250 m off the rider: not moved again inside the
  // hold, even though he is still further out than the idle line; and the
  // patrol within reach is never moved at all.
  const after = play(room, 9, facts([{}], [{ d: [30] }, { d: [250], parked: true }, { d: [150], parked: true }]));
  assert.equal(after.demands.length, 0, 'a roadblock was moved again inside the hold, or the near patrol was moved');
});

test('a stall sends a patrol ahead and the tail behind his quarry; a stall never re-deals', () => {
  const room = armRoom(2);
  // Both cops engaged, then stuck: speed zero, well away from their quarries.
  play(room, 1, facts([{}, {}], [{ d: [40, 45] }, { d: [45, 40] }]));
  const stuck = play(room, CHASE.trackerStallSeconds + 0.5, facts([{}, {}], [
    { d: [40, 45], speed: 0 }, { d: [45, 40], speed: 0 },
  ]));
  assert.deepEqual(stuck.demands, [
    { kind: 'tail-return', pursuer: 0, outlaw: 0, cause: 'stall' },
    { kind: 'intercept', pursuer: 1, outlaw: 1, cause: 'stall' },
  ]);
  assert.deepEqual([room.quarryOf(0), room.quarryOf(1)], [0, 1]);
});

test('a downed cop’s respite is his alone: the other cops’ clocks keep running', () => {
  // §39.6b.3 "Returning": a baited crash holds that cop's clocks and his alone.
  const room = armRoom(1);
  const input = (tailDown: boolean) => facts([{}], [
    { d: [CHASE.trackerGapMetres + 20], crashed: tailDown }, { d: [CHASE.trackerGapMetres + 20] }, { d: [CHASE.trackerGapMetres + 20] },
  ]);
  // Everybody engaged first (inside the tracker line), then the gap blows out
  // while the tail lies in the road.
  play(room, 0.5, facts([{}], [{ d: [100] }, { d: [100] }, { d: [100] }]));
  play(room, 1, input(true));
  play(room, 0.5, input(false));
  const state = room.state;
  assert.ok(state.pursuers[0].respite > CHASE.trackerRespiteSeconds - 1);
  assert.equal(state.pursuers[1].respite, 0, 'the tail’s crash bought his packmate a respite');
  assert.equal(state.pursuers[0].gap, 0);
  assert.ok(state.pursuers[1].gap > 1, 'a packmate’s gap clock was held by the tail’s crash');
});

test('the couch count holds the room: count, GO, then the round — nothing decided while it counts', () => {
  // q223: the couch chase always counts (the race's and the fight's
  // convention: "3" for the whole third second, GO replaces "1").
  const room = armRoom(2, { arm: { countdownSeconds: 3 } });
  assert.equal(room.phase, 'countdown');
  const input = facts([{ crashed: true, offRoute: 999 }, {}], [{ d: [1, 1] }, { d: [1, 1] }]);
  const events: ChaseEvent[] = [];
  for (let step = 0; step < 4 * SIMULATION.hz && room.phase === 'countdown'; step += 1) {
    events.push(...room.step(STEP, input).events);
  }
  assert.deepEqual(events.map((e) => e.kind === 'count' ? e.value : e.kind), [3, 2, 1, 'go']);
  assert.equal(room.phase, 'running');
  assert.equal(room.statusOf(0), 'standing', 'a crash during the count was decided');
  assert.equal(room.state.remaining, room.state.bellSeconds, 'the bell ran during the count');
});

test('the cop hold freezes the director, and the deal still covers the room', () => {
  // q224: while elapsed < copHoldSeconds the pursuers are held; every clock
  // is held at zero and nothing is demanded.
  const room = new ChaseRoom();
  room.copHoldSeconds = 5;
  room.arm(roomSpec(1, false), { bellSeconds: 60 });
  const blown = facts([{}], [{ d: [400], speed: 0 }, { d: [400] }, { d: [400], parked: true }]);
  const held = play(room, 4.5, blown);
  assert.equal(room.pursuersHeld, true);
  assert.equal(held.demands.length, 0, 'a held pursuer was sent a demand');
  assert.deepEqual([room.state.pursuers[0].gap, room.quietOf(0)], [0, 0]);
  play(room, 1, blown);
  assert.equal(room.pursuersHeld, false);
  assert.ok(room.state.pursuers[0].gap > 0, 'the clocks never started after the hold');
});

test('abandoning a room clears every fact, demands included; re-arming deals afresh', () => {
  const room = armRoom(1);
  play(room, CHASE.trackerHoldSeconds + 0.5, facts([{}], [{ d: [400] }, { d: [400] }, { d: [400] }]));
  room.step(STEP, facts([{}], [{ d: [400] }, { d: [400] }, { d: [400] }]));
  room.abandon();
  assert.equal(room.takeDemands().length, 0, 'a demand survived abandon');
  assert.equal(room.phase, 'idle');
  assert.equal(room.quarryOf(0), -1);
  room.arm(roomSpec(1, false), { bellSeconds: 60 });
  assert.equal(room.quarryOf(0), 0);
  assert.equal(room.state.pursuers[0].gap, 0);
  assert.equal(room.state.result, null);
});
