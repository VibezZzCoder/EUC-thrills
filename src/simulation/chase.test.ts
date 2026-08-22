/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, SIMULATION } from '../data/tuning.ts';
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
