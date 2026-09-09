/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, CHASE, SIMULATION } from '../data/tuning.ts';
import { ChaseRun, type ChaseInput } from './chase.ts';

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
  const near: ChaseInput = { offRoute: 0, copDistance: CHASE.trackerGapMetres - 10, crashed: false };

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
const RETRY = 2;

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
