/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION, TRICK_RUN, TRICKS } from '../data/tuning.ts';
import type { LandingQuality } from './EucController.ts';
import { createTrickFacts, type TrickStepInput } from './trickEvents.ts';
import {
  SHIPPED_TRICK_RULES,
  TrickRun,
  trickRulesRevision,
  validTrickRules,
  type TrickAward,
  type TrickBookState,
  type TrickRunRules,
  type TrickRunResult,
} from './trickRun.ts';

/**
 * The Trick Run's rules, tested where they live — M38 §38.4.
 *
 * Everything below runs with no browser and no `Game`: a fact struct per seat
 * per step is the whole input, exactly as `trickEvents.test.ts` drives the
 * observer. What this file cannot claim is that the right facts arrive from
 * the wheel; that is the composition root's seam and `tests/m38.spec.ts`'s
 * job. What it can claim is every rule §38.3 states: the arithmetic examples
 * to the point, banking only at a surviving landing, a crash forfeiting the
 * pending flight and nothing banked, a reset that is not a crash, the exact
 * deadline, the unfinished early end, seat independence and determinism.
 */

const STEP = 1 / SIMULATION.hz;

/**
 * Rules with a long clock, so the arithmetic tests can rest between flights
 * (see `fly`) without meeting the deadline; the clock tests set their own.
 */
function rules(over: Partial<TrickRunRules> = {}): TrickRunRules {
  return { ...SHIPPED_TRICK_RULES, durationSteps: 60000, ...over };
}

/** One more step than the shipped repeat window, in fixed steps. */
const REST_STEPS = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz) + 1;

function facts(over: Partial<TrickStepInput> = {}): TrickStepInput {
  return { ...createTrickFacts(), ...over };
}

/** A running referee for `seats` riders on a long clock. */
function run(seats = 1, over: Partial<TrickRunRules> = {}): TrickRun {
  const referee = new TrickRun(rules(over));
  referee.arm(seats);
  return referee;
}

/** Record one seat's facts and sweep the step; every other seat records nothing. */
function one(referee: TrickRun, seat: number, input: TrickStepInput, zone: string | null = null) {
  referee.record(seat, input, zone);
  return referee.step(STEP);
}

/**
 * The feature the test flights launch from unless a script says otherwise.
 * q189 gates trick points on a launch zone, so the arithmetic tests fly from
 * one; `zone: null` is the flat-ground flight the gate exists for.
 */
const FEATURE = 'kicker';

interface FlightScript {
  readonly flight: number;
  /** Charge the launch spent; a hop when defined, a ledge drop when not. */
  readonly charge?: number;
  readonly spin?: boolean;
  readonly oneFoot?: boolean;
  /** How the flight ends. `air-crash` is a crash before any touchdown. */
  readonly landing: LandingQuality | 'air-crash';
  readonly airSteps?: number;
  /**
   * Rest past the repeat window before launching, so the flight is paid in
   * full — the default, because most tests are about the arithmetic and not
   * about q185. `false` flies back to back, which is how a repeat is made.
   */
  readonly rested?: boolean;
  /** The launch zone handed in at takeoff. `undefined` means `FEATURE`; `null` is flat ground. */
  readonly zone?: string | null;
}

/**
 * Fly one flight for one seat, step by step, and return every award and
 * forfeit the referee reported along the way. The spin and one-foot facts are
 * raised mid-air, as the controller and the pose raise them.
 */
function fly(referee: TrickRun, seat: number, script: FlightScript): { awards: TrickAward[]; forfeits: number[] } {
  const awards: TrickAward[] = [];
  const forfeits: number[] = [];
  const collect = (step: ReturnType<TrickRun['step']>): void => {
    awards.push(...step.awards.filter((award) => award.seat === seat));
    forfeits.push(...step.forfeits.filter((forfeited) => forfeited === seat));
  };
  const hopped = script.charge !== undefined;
  if (script.rested !== false) {
    for (let i = 0; i < REST_STEPS; i += 1) one(referee, seat, facts({ flightIndex: script.flight - 1 }));
  }
  collect(one(referee, seat, facts({
    flightIndex: script.flight, tookOff: true, hopped, hopCharge: script.charge ?? 0,
  }), script.zone === undefined ? FEATURE : script.zone));
  const air = script.airSteps ?? 6;
  for (let i = 0; i < air; i += 1) {
    collect(one(referee, seat, facts({
      flightIndex: script.flight,
      spinCompleted: script.spin === true && i >= 2,
      oneFootQualified: script.oneFoot === true && i >= 1,
    })));
  }
  if (script.landing === 'air-crash') {
    collect(one(referee, seat, facts({ flightIndex: script.flight, crashed: true })));
  } else {
    collect(one(referee, seat, facts({
      flightIndex: script.flight,
      spinCompleted: script.spin === true,
      oneFootQualified: script.oneFoot === true,
      touchedDown: true,
      landingQuality: script.landing,
      crashed: script.landing === 'crash',
    })));
  }
  return { awards, forfeits };
}

function book(referee: TrickRun, seat = 0): TrickBookState {
  const state = referee.book(seat);
  assert.ok(state !== null, `seat ${seat} has no book`);
  return state;
}

/** The card's own check: the breakdown adds exactly to the total. */
function assertAdds(state: TrickBookState): void {
  const b = state.breakdown;
  assert.equal(
    b.cleanLandingPoints + b.chargedHopPoints + b.spinPoints + b.oneFootPoints + b.bonusPoints
      + b.qualityAdjustment + b.repeatAdjustment,
    b.total,
  );
  assert.equal(b.total, state.score);
}

// -- The rules table ---------------------------------------------------------

test('the shipped rules are the TRICK_RUN table, valid, and §38.3\'s worked examples hold', () => {
  assert.equal(SHIPPED_TRICK_RULES.durationSteps, TRICK_RUN.durationSteps);
  assert.equal(SHIPPED_TRICK_RULES.spinLandedPoints, TRICK_RUN.spinLandedPoints);
  assert.ok(validTrickRules(SHIPPED_TRICK_RULES));
  // The shipped duration is a whole number of seconds at the fixed rate.
  assert.equal(TRICK_RUN.durationSteps % SIMULATION.hz, 0);

  const referee = run();
  fly(referee, 0, { flight: 1, landing: 'clean' });
  assert.equal(book(referee).score, 10, 'a plain clean landing');
  fly(referee, 0, { flight: 2, charge: 1, landing: 'clean' });
  assert.equal(book(referee).score, 10 + 41, 'a charged clean hop');
  fly(referee, 0, { flight: 3, spin: true, oneFoot: true, landing: 'clean' });
  assert.equal(book(referee).score, 10 + 41 + 448, 'a clean 180 plus one-foot air');
  fly(referee, 0, { flight: 4, spin: true, oneFoot: true, landing: 'heavy' });
  assert.equal(book(referee).score, 10 + 41 + 448 + 350, 'the same two on a heavy landing');
  fly(referee, 0, { flight: 5, spin: true, oneFoot: true, landing: 'crash' });
  assert.equal(book(referee).score, 10 + 41 + 448 + 350, 'a crash earns 0 for that flight');
  assertAdds(book(referee));
});

test('invalid rules are refused at construction, not discovered on a landing', () => {
  assert.throws(() => new TrickRun(rules({ durationSteps: 0 })));
  assert.throws(() => new TrickRun(rules({ durationSteps: 1.5 })));
  assert.throws(() => new TrickRun(rules({ spinLandedPoints: -1 })));
  assert.throws(() => new TrickRun(rules({ chargedHopPoints: 2.5 })));
  assert.throws(() => new TrickRun(rules({ wobbleMultiplier: -0.5 })));
  assert.throws(() => new TrickRun(rules({ cleanMultiplier: Number.NaN })));
  assert.throws(() => new TrickRun(rules({ multiTrickMinKinds: 0 })));
  assert.ok(!validTrickRules(rules({ durationSteps: Number.POSITIVE_INFINITY })));
});

test('the rules revision names every value, so a changed table cannot compare with an old best', () => {
  const shipped = trickRulesRevision(SHIPPED_TRICK_RULES);
  assert.ok(shipped.startsWith('m38b/'), 'the per-feature clocks are a new revision family');
  assert.ok(shipped.length < 64, 'bounded — it travels in a record row');
  assert.equal(new TrickRun().rulesRevision, shipped);
  const keys = Object.keys(SHIPPED_TRICK_RULES) as (keyof TrickRunRules)[];
  for (const key of keys) {
    const moved = { ...SHIPPED_TRICK_RULES, [key]: SHIPPED_TRICK_RULES[key] + 1 };
    assert.notEqual(trickRulesRevision(moved), shipped, `${key} must move the revision`);
  }
  assert.equal(trickRulesRevision({ ...SHIPPED_TRICK_RULES }), shipped, 'the same values, the same identity');
});

// -- Banking ------------------------------------------------------------------

test('a run with no events ends on zero with an honest empty card', () => {
  const referee = run(1, { durationSteps: 3 });
  let ended = false;
  for (let i = 0; i < 3; i += 1) ended = one(referee, 0, facts()).ended;
  assert.ok(ended);
  const result = referee.result();
  assert.ok(result !== null);
  assert.equal(result.completed, true);
  assert.equal(result.elapsedSteps, 3);
  assert.equal(result.books[0].score, 0);
  assert.deepEqual(result.books[0].tally, { cleanLandings: 0, chargedHops: 0, spinsLanded: 0, oneFootAirs: 0 });
  assert.equal(result.books[0].lastAward, null);
  assertAdds(result.books[0]);
});

test('the award carries the facts the screen needs and its parts add up', () => {
  const referee = run();
  const { awards } = fly(referee, 0, { flight: 7, charge: 1, spin: true, landing: 'clean' });
  assert.equal(awards.length, 1);
  const award = awards[0];
  assert.equal(award.seat, 0);
  assert.equal(award.flight, 7);
  assert.deepEqual(award.kinds, ['charged-hop', 'spin-landed']);
  assert.equal(award.landing, 'clean');
  assert.equal(award.basePoints, 225);
  assert.equal(award.bonusPoints, 50);
  assert.equal(award.multiplier, 1.25);
  assert.equal(award.trickPoints, Math.round(275 * 1.25));
  assert.equal(award.cleanPoints, 10);
  assert.equal(award.points, award.trickPoints + award.cleanPoints);
  assert.equal(book(referee).lastAward, award);
  assert.equal(book(referee).lastAwardStep, referee.state.elapsedSteps);
  assertAdds(book(referee));
});

test('the flight bonus needs two distinct kinds; three earn the same single bonus; a clean landing is not a kind', () => {
  const single = run();
  fly(single, 0, { flight: 1, spin: true, landing: 'clean' });
  assert.equal(book(single).breakdown.bonusPoints, 0, 'one kind and a clean landing: no bonus');
  assert.equal(book(single).score, Math.round(200 * 1.25) + 10);

  const two = run();
  fly(two, 0, { flight: 1, charge: 1, oneFoot: true, landing: 'heavy' });
  assert.equal(book(two).breakdown.bonusPoints, 50);
  assert.equal(book(two).score, 25 + 100 + 50);

  const three = run();
  fly(three, 0, { flight: 1, charge: 1, spin: true, oneFoot: true, landing: 'heavy' });
  assert.equal(book(three).breakdown.bonusPoints, 50, 'three kinds, one bonus');
  assert.equal(book(three).score, 25 + 200 + 100 + 50);
  assertAdds(book(three));
});

test('landing quality multiplies the trick subtotal once, rounded once, and never the clean award', () => {
  const wobble = run();
  fly(wobble, 0, { flight: 1, charge: 1, landing: 'wobble' });
  assert.equal(book(wobble).score, Math.round(25 * 0.5));
  assert.equal(book(wobble).breakdown.qualityAdjustment, Math.round(25 * 0.5) - 25);

  const heavy = run();
  fly(heavy, 0, { flight: 1, charge: 1, landing: 'heavy' });
  assert.equal(book(heavy).score, 25);
  assert.equal(book(heavy).breakdown.cleanLandingPoints, 0, 'heavy is not clean');
  assert.equal(book(heavy).tally.cleanLandings, 0);

  const clean = run();
  fly(clean, 0, { flight: 1, charge: 1, landing: 'clean' });
  assert.equal(book(clean).score, Math.round(25 * 1.25) + 10);
  assert.equal(book(clean).breakdown.qualityAdjustment, Math.round(25 * 1.25) - 25);
  assert.equal(book(clean).tally.cleanLandings, 1);
  assertAdds(book(clean));
});

test('a plain wobble or heavy landing banks nothing and reports no award', () => {
  const referee = run();
  const heavy = fly(referee, 0, { flight: 1, landing: 'heavy' });
  const wobble = fly(referee, 0, { flight: 2, landing: 'wobble' });
  assert.equal(heavy.awards.length + wobble.awards.length, 0);
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).lastAward, null);
  assert.equal(book(referee).flights, 2, 'they were flights all the same');
});

test('a partial charge is a hop the observer did not count, and the referee does not pay for it', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, charge: TRICKS.chargedHopMinCharge - 0.01, landing: 'clean' });
  assert.equal(book(referee).tally.chargedHops, 0);
  assert.equal(book(referee).score, 10, 'the clean landing alone');
});

// -- Forfeit, discard, and the crash count -----------------------------------

test('a crash forfeits the pending flight only: banked points and the run survive', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean' });
  const banked = book(referee).score;
  assert.ok(banked > 0);

  const crashed = fly(referee, 0, { flight: 2, charge: 1, spin: true, oneFoot: true, landing: 'crash' });
  assert.deepEqual(crashed.forfeits, [0], 'the seat is named as forfeiting');
  assert.equal(crashed.awards.length, 0);
  const state = book(referee);
  assert.equal(state.score, banked);
  assert.equal(state.crashes, 1);
  assert.equal(state.tally.chargedHops, 1, 'the observer counted the launch');
  assert.equal(state.breakdown.chargedHopPoints, 0, 'and the referee never banked it');
  assert.equal(state.breakdown.chargedHopsForfeited, 1);
  assert.equal(state.tally.spinsLanded, 1, 'the first flight\'s spin, not the crashed one\'s');
  assert.equal(referee.phase, 'running');
  assertAdds(state);

  // The rider is down for a while: one crash, not one per step.
  for (let i = 0; i < 20; i += 1) one(referee, 0, facts({ flightIndex: 2, crashed: true }));
  assert.equal(book(referee).crashes, 1);
  // And back up, riding on; the next flight banks as usual.
  fly(referee, 0, { flight: 3, landing: 'clean' });
  assert.equal(book(referee).score, banked + 10);
});

test('a crash in the air, before any touchdown, forfeits the same way', () => {
  const referee = run();
  const { forfeits, awards } = fly(referee, 0, { flight: 1, charge: 1, landing: 'air-crash' });
  assert.deepEqual(forfeits, [0]);
  assert.equal(awards.length, 0);
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).crashes, 1);
  assert.equal(book(referee).breakdown.chargedHopsForfeited, 1);
  assert.equal(book(referee).flightOpen, false);
});

test('a reset discards the interrupted flight, keeps points and clock, and is not a crash', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, landing: 'clean' });
  one(referee, 0, facts({ flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  assert.equal(book(referee).flightOpen, true);
  assert.equal(book(referee).openZone, FEATURE);
  assert.deepEqual(book(referee).pending, ['charged-hop']);
  assert.equal(book(referee).pendingPoints, 25);
  assert.equal(book(referee).score, 10, 'pending is not banked');

  const before = referee.state.elapsedSteps;
  const step = one(referee, 0, facts({ flightIndex: 2, reset: true }));
  assert.equal(step.forfeits.length, 0, 'a reset is not a forfeit cue');
  const state = book(referee);
  assert.equal(state.score, 10);
  assert.equal(state.crashes, 0);
  assert.equal(state.flightOpen, false);
  assert.deepEqual(state.pending, []);
  assert.equal(state.breakdown.chargedHopsForfeited, 1, 'counted at launch, never banked — said so');
  assert.equal(referee.state.elapsedSteps, before + 1, 'the clock did not restart');
  assert.equal(referee.phase, 'running');

  // The step after the reset cannot fabricate a landing from the old flight.
  one(referee, 0, facts({ flightIndex: 2, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee).score, 10);
});

test('a reset slot that also claims a landing is answered as a reset', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 1, tookOff: true }));
  one(referee, 0, facts({ flightIndex: 1, reset: true, touchedDown: true, landingQuality: 'clean', spinCompleted: true }));
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).tally.spinsLanded, 0);
});

// -- Flight identity ----------------------------------------------------------

test('a touchdown with no takeoff behind it banks nothing, however many flags are true', () => {
  const referee = run();
  one(referee, 0, facts({
    flightIndex: 3, hopped: true, hopCharge: 1, spinCompleted: true, oneFootQualified: true,
    touchedDown: true, landingQuality: 'clean',
  }));
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).tally.cleanLandings, 0, 'the clean landing obeys the same rule');
  assert.equal(book(referee).lastAward, null);
});

test('a flight already in the air when the clock starts earns nothing when it lands', () => {
  const referee = run();
  // No takeoff was ever recorded for flight 4; the rider launched before arming.
  for (let i = 0; i < 5; i += 1) one(referee, 0, facts({ flightIndex: 4, spinCompleted: true }));
  one(referee, 0, facts({ flightIndex: 4, spinCompleted: true, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).flights, 0);
  // The next flight, opened inside the run, banks as normal.
  fly(referee, 0, { flight: 5, landing: 'clean' });
  assert.equal(book(referee).score, 10);
});

test('a replayed touchdown banks once', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean' });
  const once = book(referee).score;
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true, touchedDown: true, landingQuality: 'clean' }));
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee).score, once);
  assert.equal(book(referee).tally.cleanLandings, 1);
});

test('facts from another flight cannot land the open one', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true }));
  // Identity jumps without a takeoff edge: the open flight is discarded first.
  one(referee, 0, facts({ flightIndex: 2, spinCompleted: true, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee).score, 0);
  assert.equal(book(referee).breakdown.chargedHopsForfeited, 1);
  assert.equal(book(referee).flightOpen, false);
});

test('a takeoff over an open flight discards the interrupted one and opens the new one', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  one(referee, 0, facts({ flightIndex: 2, tookOff: true }), FEATURE);
  one(referee, 0, facts({ flightIndex: 2, touchedDown: true, landingQuality: 'clean' }));
  const state = book(referee);
  assert.equal(state.score, 10, 'the second flight\'s clean landing, and no charged hop from the first');
  assert.equal(state.breakdown.chargedHopsForfeited, 1);
  assert.equal(state.flights, 2);
});

test('recording twice in one step keeps the later facts and feeds the observer once', () => {
  const referee = run();
  referee.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  referee.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 0.2 }), FEATURE);
  referee.step(STEP);
  assert.equal(book(referee).tally.chargedHops, 0, 'the later, partial charge is what was fed');
  assert.deepEqual(book(referee).pending, []);
});

test('a seat that recorded nothing is not re-read: last step\'s touchdown cannot bank again', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 1, tookOff: true }));
  one(referee, 0, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee).score, 10);
  for (let i = 0; i < 10; i += 1) referee.step(STEP);
  assert.equal(book(referee).score, 10);
  assert.equal(book(referee).tally.cleanLandings, 1);
});

// -- The clock -----------------------------------------------------------------

test('the clock is a fixed count of steps: it ends on exactly the duration and reports so once', () => {
  const referee = run(1, { durationSteps: 5 });
  assert.equal(referee.state.remainingSteps, 5);
  assert.equal(referee.state.remainingSeconds, 5 / SIMULATION.hz);
  for (let i = 1; i <= 4; i += 1) {
    assert.equal(one(referee, 0, facts()).ended, false);
    assert.equal(referee.state.elapsedSteps, i);
    assert.equal(referee.state.remainingSteps, 5 - i);
  }
  const last = one(referee, 0, facts());
  assert.equal(last.ended, true);
  assert.equal(referee.phase, 'ended');
  assert.equal(referee.state.remainingSteps, 0);
  // Every later step is quiet and ages nothing.
  const after = one(referee, 0, facts({ flightIndex: 9, tookOff: true }));
  assert.equal(after.ended, false);
  assert.equal(after.awards.length, 0);
  assert.equal(referee.state.elapsedSteps, 5);
});

test('a touchdown on the deadline step banks; a flight still open at the deadline is discarded', () => {
  const lands = run(2, { durationSteps: 4 });
  // Seat 0 lands on step 4; seat 1 is still in the air.
  lands.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  lands.record(1, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  lands.step(STEP);
  lands.record(0, facts({ flightIndex: 1 }));
  lands.record(1, facts({ flightIndex: 1 }));
  lands.step(STEP);
  lands.record(0, facts({ flightIndex: 1 }));
  lands.record(1, facts({ flightIndex: 1 }));
  lands.step(STEP);
  lands.record(0, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  lands.record(1, facts({ flightIndex: 1 }));
  const final = lands.step(STEP);
  assert.equal(final.ended, true);
  assert.equal(final.awards.length, 1);
  assert.equal(final.awards[0].seat, 0);
  const result = lands.result();
  assert.ok(result !== null);
  assert.equal(result.completed, true);
  assert.equal(result.books[0].score, Math.round(25 * 1.25) + 10);
  assert.equal(result.books[1].score, 0);
  assert.equal(result.books[1].flightOpen, false);
  assert.equal(result.books[1].breakdown.chargedHopsForfeited, 1, 'it did not land inside the run');
  assert.deepEqual(result.books[1].pending, []);

  // Nothing after the deadline: the landing one step late is worth nothing.
  lands.record(1, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  lands.step(STEP);
  assert.equal(lands.result(), result, 'the frozen card is the same object');
  assert.equal(lands.result()?.books[1].score, 0);
});

test('the result is frozen: later reads return the same card and mutation is refused', () => {
  const referee = run(1, { durationSteps: 2 });
  fly(referee, 0, { flight: 1, landing: 'clean', airSteps: 0, rested: false });
  const result = referee.result();
  assert.ok(result !== null);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.books));
  assert.ok(Object.isFrozen(result.books[0]));
  assert.ok(Object.isFrozen(result.books[0].breakdown));
  assert.equal(referee.result(), result);
  assert.equal(referee.end(), result, 'ending an ended run returns the same card');
});

test('an idle referee steps quietly, records nothing and has no card', () => {
  const referee = new TrickRun(rules());
  assert.equal(referee.phase, 'idle');
  referee.record(0, facts({ flightIndex: 1, tookOff: true }));
  const step = referee.step(STEP);
  assert.equal(step.ended, false);
  assert.equal(step.awards.length, 0);
  assert.equal(referee.state.elapsedSteps, 0);
  assert.equal(referee.state.seats, 0);
  assert.equal(referee.result(), null);
  assert.equal(referee.end(), null);
  assert.equal(referee.book(0), null);
});

test('arming with a seat count that is not a positive integer arms nothing', () => {
  for (const seats of [0, -1, 1.5, Number.NaN]) {
    const referee = new TrickRun(rules());
    referee.arm(seats);
    assert.equal(referee.phase, 'idle', `seats=${seats}`);
  }
});

// -- End, retry, abandon --------------------------------------------------------

test('ending early produces an explicitly unfinished card; pending flights earn nothing', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean' });
  const banked = book(referee).score;
  one(referee, 0, facts({ flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  const result = referee.end();
  assert.ok(result !== null);
  assert.equal(result.completed, false);
  assert.equal(result.elapsedSteps, referee.state.elapsedSteps);
  assert.ok(result.elapsedSteps < result.durationSteps);
  assert.equal(result.books[0].score, banked);
  assert.equal(result.books[0].flightOpen, false);
  assert.equal(result.books[0].breakdown.chargedHopsForfeited, 1);
  assert.equal(referee.phase, 'ended');
  assert.equal(referee.result(), result);
});

test('retry (arming again) resets every seat\'s points, observer, flight, crashes, cue and clock', () => {
  const referee = run(2);
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean' });
  fly(referee, 1, { flight: 1, charge: 1, landing: 'crash' });
  one(referee, 0, facts({ flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 }), FEATURE);
  assert.ok(book(referee, 0).score > 0);
  assert.equal(book(referee, 1).crashes, 1);

  referee.arm(2);
  assert.equal(referee.phase, 'running');
  assert.equal(referee.state.elapsedSteps, 0);
  for (const seat of [0, 1]) {
    const state = book(referee, seat);
    assert.equal(state.score, 0);
    assert.equal(state.crashes, 0);
    assert.equal(state.flights, 0);
    assert.equal(state.flightOpen, false);
    assert.equal(state.lastAward, null);
    assert.equal(state.lastAwardStep, -1);
    assert.equal(state.tally.chargedHops, 0);
    assert.equal(state.breakdown.chargedHopsForfeited, 0);
  }
  assert.equal(referee.result(), null);
  // The flight opened before the retry cannot land into the new run.
  one(referee, 0, facts({ flightIndex: 2, touchedDown: true, landingQuality: 'clean' }));
  assert.equal(book(referee, 0).score, 0);
});

test('abandon returns to idle with no card and no seats', () => {
  const referee = run(3);
  fly(referee, 2, { flight: 1, landing: 'clean' });
  referee.abandon();
  assert.equal(referee.phase, 'idle');
  assert.equal(referee.state.seats, 0);
  assert.equal(referee.result(), null);
  assert.equal(referee.book(2), null);
});

// -- Seats ---------------------------------------------------------------------

test('four seats score independently under one clock, with no cross-seat ranking', () => {
  const referee = run(4);
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean' });
  fly(referee, 1, { flight: 1, landing: 'heavy' });
  fly(referee, 2, { flight: 1, charge: 1, landing: 'crash' });
  fly(referee, 3, { flight: 1, oneFoot: true, landing: 'wobble' });
  const state = referee.state;
  assert.equal(state.seats, 4);
  assert.equal(state.books[0].score, Math.round(200 * 1.25) + 10);
  assert.equal(state.books[1].score, 0);
  assert.equal(state.books[2].score, 0);
  assert.equal(state.books[2].crashes, 1);
  assert.equal(state.books[3].score, Math.round(100 * 0.5));
  assert.deepEqual(state.books.map((b) => b.seat), [0, 1, 2, 3]);
  assert.ok(!('places' in state.books[0]) && !('winner' in state), 'no winner rule, no places (q188)');
  state.books.forEach(assertAdds);
});

test('the clock is shared: one step ages the run once however many seats record', () => {
  const referee = run(4, { durationSteps: 3 });
  for (let seat = 0; seat < 4; seat += 1) referee.record(seat, facts());
  referee.step(STEP);
  assert.equal(referee.state.elapsedSteps, 1);
  referee.record(0, facts());
  referee.step(STEP);
  assert.equal(referee.state.elapsedSteps, 2);
  assert.equal(referee.step(STEP).ended, true, 'a step nobody recorded still counts');
});

test('a seat the run does not have is ignored', () => {
  const referee = run(2);
  referee.record(2, facts({ flightIndex: 1, tookOff: true }));
  referee.record(-1, facts({ flightIndex: 1, tookOff: true }));
  referee.step(STEP);
  assert.equal(referee.state.seats, 2);
  assert.equal(referee.book(2), null);
});

test('seat order is a label: permuting which seat rides which script permutes the totals exactly', () => {
  const scripts: FlightScript[][] = [
    [{ flight: 1, spin: true, landing: 'clean' }, { flight: 2, charge: 1, landing: 'heavy' }],
    [{ flight: 1, charge: 1, oneFoot: true, landing: 'wobble' }, { flight: 2, landing: 'crash' }],
    [{ flight: 1, landing: 'clean' }, { flight: 2, spin: true, oneFoot: true, landing: 'clean' }],
  ];
  const play = (order: number[]): TrickRunResult => {
    const referee = run(3);
    for (let flight = 0; flight < 2; flight += 1) {
      for (let seat = 0; seat < 3; seat += 1) fly(referee, seat, scripts[order[seat]][flight]);
    }
    const result = referee.end();
    assert.ok(result !== null);
    return result;
  };
  const straight = play([0, 1, 2]);
  const rotated = play([2, 0, 1]);
  for (let seat = 0; seat < 3; seat += 1) {
    // The step an award banked on is a timestamp, and the scripts are flown in
    // seat order — so it moves with the label, and everything else must not.
    const { seat: _a, lastAward: awardA, lastAwardStep: _stepA, ...a } = straight.books[[2, 0, 1][seat]];
    const { seat: _b, lastAward: awardB, lastAwardStep: _stepB, ...b } = rotated.books[seat];
    assert.deepEqual(a, b);
    assert.deepEqual(
      awardA === null ? null : { ...awardA, seat: -1 },
      awardB === null ? null : { ...awardB, seat: -1 },
    );
  }
});

// -- Diminishing repeats (q185) ---------------------------------------------------

test('landing the same kind again inside the window pays half, then a quarter; rest fades one level per fade window', () => {
  const referee = run();
  const spin = (flight: number, rested: boolean) => fly(referee, 0, { flight, spin: true, landing: 'heavy', rested });
  spin(1, true);
  assert.equal(book(referee).score, 200);
  spin(2, false);
  assert.equal(book(referee).score, 200 + 100, 'the first repeat pays repeatDecay');
  assert.equal(book(referee).lastAward?.repeated, true);
  spin(3, false);
  assert.equal(book(referee).score, 200 + 100 + 50, 'the second repeat pays repeatDecay squared');
  // One rest (past the window, one fade) forgets ONE level: the run of two
  // becomes one, and a landing outside the window pays that residual.
  spin(4, true);
  assert.equal(book(referee).score, 200 + 100 + 50 + 100, 'one fade window forgets one repeat, not all of them');
  assert.equal(book(referee).lastAward?.repeated, true);
  // Landing outside the window keeps the residual as it is; the next
  // back-to-back landing is a repeat on top of it.
  spin(5, false);
  assert.equal(book(referee).score, 200 + 100 + 50 + 100 + 50);
  const state = book(referee);
  assert.equal(state.breakdown.spinPoints, 1000, 'the per-kind row shows full values');
  assert.equal(state.breakdown.repeatAdjustment, -(100 + 150 + 100 + 150));
  assert.equal(state.breakdown.repeatedFlights, 4);
  assert.equal(state.tally.spinsLanded, 5, 'the observer counted every one');
  assertAdds(state);
});

test('a long enough rest forgets everything; a zero fade resets on leaving the window', () => {
  const fadeSteps = Math.round(SHIPPED_TRICK_RULES.repeatFadeSeconds * SIMULATION.hz);
  const shipped = run();
  for (let flight = 1; flight <= 4; flight += 1) {
    fly(shipped, 0, { flight, spin: true, landing: 'heavy', rested: flight === 1 });
  }
  assert.equal(book(shipped).score, 200 + 100 + 50 + 25, 'a run of three repeats');
  // Three fade windows and a bit: the run of three is forgotten entirely.
  for (let i = 0; i < 3 * fadeSteps + 1; i += 1) one(shipped, 0, facts({ flightIndex: 4 }));
  fly(shipped, 0, { flight: 5, spin: true, landing: 'heavy', rested: false });
  assert.equal(book(shipped).score, 200 + 100 + 50 + 25 + 200, 'full value after three fade windows');
  assert.equal(book(shipped).lastAward?.repeated, false);

  const reset = run(1, { repeatFadeSeconds: 0 });
  for (let flight = 1; flight <= 3; flight += 1) {
    fly(reset, 0, { flight, spin: true, landing: 'heavy', rested: flight === 1 });
  }
  fly(reset, 0, { flight: 4, spin: true, landing: 'heavy' });
  assert.equal(book(reset).score, 200 + 100 + 50 + 200, 'with no fade, leaving the window is a clean slate');
});

test('q185 rest-cycling: a burst, a rest past the window and another burst do not start from full again', () => {
  const referee = run(1, { durationSteps: TRICK_RUN.durationSteps });
  const burst = (from: number, count: number): number => {
    const before = book(referee).score;
    for (let i = 0; i < count; i += 1) {
      fly(referee, 0, { flight: from + i, charge: 1, spin: true, oneFoot: true, landing: 'clean', airSteps: 82, rested: false });
    }
    return book(referee).score - before;
  };
  const first = burst(1, 10);
  // Idle just past the window, as the measured rest-cycler does.
  const idle = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz) + 60;
  for (let i = 0; i < idle; i += 1) one(referee, 0, facts({ flightIndex: 10 }));
  const second = burst(11, 10);
  assert.ok(first > 800, `the first burst paid ${first}`);
  assert.ok(second < first / 20, `the second burst paid ${second} against ${first}: one window forgets one level, not ten`);
});

test('the window is measured on the run\'s fixed steps, edge inclusive', () => {
  const windowSteps = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz);
  const exactly = run();
  fly(exactly, 0, { flight: 1, charge: 1, landing: 'heavy' });
  const landedAt = exactly.state.elapsedSteps;
  // Launch so that the next touchdown falls exactly `windowSteps` after the last.
  while (exactly.state.elapsedSteps < landedAt + windowSteps - 2) one(exactly, 0, facts({ flightIndex: 1 }));
  fly(exactly, 0, { flight: 2, charge: 1, landing: 'heavy', airSteps: 0, rested: false });
  assert.equal(exactly.state.elapsedSteps, landedAt + windowSteps);
  assert.equal(book(exactly).score, 25 + Math.round(25 * 0.5), 'on the edge is inside the window');

  const past = run();
  fly(past, 0, { flight: 1, charge: 1, landing: 'heavy' });
  const at = past.state.elapsedSteps;
  while (past.state.elapsedSteps < at + windowSteps - 1) one(past, 0, facts({ flightIndex: 1 }));
  fly(past, 0, { flight: 2, charge: 1, landing: 'heavy', airSteps: 0, rested: false });
  assert.equal(past.state.elapsedSteps, at + windowSteps + 1);
  assert.equal(book(past).score, 50, 'one step past the window is a fresh landing');
});

test('each feature keeps its own repeat clock, and off the features is a clock of its own', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, spin: true, landing: 'heavy', zone: 'kicker' });                       // 200
  fly(referee, 0, { flight: 2, spin: true, landing: 'heavy', zone: 'ledge', rested: false });         // 200: another feature, full
  assert.equal(book(referee).score, 400);
  fly(referee, 0, { flight: 3, spin: true, landing: 'heavy', zone: 'kicker', rested: false });        // 100: the kicker again
  assert.equal(book(referee).score, 500);
  assert.equal(book(referee).lastAward?.repeated, true);
  fly(referee, 0, { flight: 4, charge: 1, landing: 'clean', zone: 'ledge', rested: false });          // ledge repeat: round(41 × 0.5) = 21 (20.5 rounds up)
  assert.equal(book(referee).score, 500 + Math.round((Math.round(25 * 1.25) + 10) * 0.5));
  // Off the features: the landing alone, and it decays on its own clock.
  fly(referee, 0, { flight: 5, spin: true, landing: 'clean', zone: null, rested: false });             // 10
  fly(referee, 0, { flight: 6, spin: true, landing: 'clean', zone: null, rested: false });             // 5
  fly(referee, 0, { flight: 7, spin: true, landing: 'clean', zone: null, rested: false });             // 3 (2.5 rounds up)
  const state = book(referee);
  assert.equal(state.score, 521 + 10 + 5 + 3);
  assert.equal(state.breakdown.offZoneFlights, 3);
  assert.equal(state.breakdown.repeatedFlights, 4);
  assert.equal(state.breakdown.spinPoints, 600, 'the per-kind rows show full values for the feature flights only');
  assertAdds(state);
});

test('the repeat takes from the whole flight, tricks and landing alike, and the award splits it so the parts add', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, charge: 1, spin: true, landing: 'clean', zone: 'gap' });
  const first = book(referee).lastAward!;
  fly(referee, 0, { flight: 2, charge: 1, spin: true, landing: 'clean', zone: 'gap', rested: false });
  const second = book(referee).lastAward!;
  assert.equal(first.points, Math.round(275 * 1.25) + 10);
  assert.equal(second.points, Math.round(first.points * 0.5));
  assert.equal(second.trickPoints + second.cleanPoints, second.points);
  assert.ok(second.cleanPoints < first.cleanPoints, 'the landing is docked too');
  assert.equal(second.repeated, true);
  assertAdds(book(referee));
});

test('the floor holds the value up, and a zero window turns the rule off', () => {
  const floored = run(1, { repeatFloor: 0.25 });
  for (let flight = 1; flight <= 6; flight += 1) {
    fly(floored, 0, { flight, spin: true, landing: 'heavy', rested: flight === 1 });
  }
  // 200, 100, 50, then 50 three more times at the floor.
  assert.equal(book(floored).score, 200 + 100 + 50 + 50 + 50 + 50);

  const off = run(1, { repeatWindowSeconds: 0 });
  for (let flight = 1; flight <= 4; flight += 1) {
    fly(off, 0, { flight, spin: true, landing: 'heavy', rested: false });
  }
  assert.equal(book(off).score, 800);
  assert.equal(book(off).breakdown.repeatedFlights, 0);
  assert.equal(book(off).lastAward?.repeated, false);
});

test('a repeat that pays nothing still reports an award, so the screen can say why', () => {
  const referee = run(1, { repeatDecay: 0 });
  fly(referee, 0, { flight: 1, spin: true, landing: 'heavy' });
  const { awards } = fly(referee, 0, { flight: 2, spin: true, landing: 'heavy', rested: false });
  assert.equal(awards.length, 1);
  assert.equal(awards[0].points, 0);
  assert.equal(awards[0].repeated, true);
  assert.equal(book(referee).score, 200);
  assert.equal(book(referee).breakdown.repeatedFlights, 1);
  assertAdds(book(referee));
});

test('repeat rules are refused when out of range', () => {
  assert.throws(() => new TrickRun(rules({ repeatDecay: 1.5 })));
  assert.throws(() => new TrickRun(rules({ repeatDecay: -0.1 })));
  assert.throws(() => new TrickRun(rules({ repeatFloor: 2 })));
  assert.throws(() => new TrickRun(rules({ repeatWindowSeconds: -1 })));
  assert.throws(() => new TrickRun(rules({ repeatWindowSeconds: Number.NaN })));
});

test('q185 in one test: a stationary spam burst is bounded, a routed rider is paid in full', () => {
  // The farmer: hop + 180 + one-foot, every 0.70 s, for ninety seconds.
  const farmer = run(1, { durationSteps: TRICK_RUN.durationSteps });
  let flight = 1;
  while (farmer.phase === 'running') {
    fly(farmer, 0, { flight, charge: 1, spin: true, oneFoot: true, landing: 'clean', airSteps: 82, rested: false });
    flight += 1;
  }
  const farmed = farmer.result();
  assert.ok(farmed !== null);
  assert.ok(farmed.books[0].flights > 100, `the farmer flew ${farmed.books[0].flights} flights`);
  const oneFull = Math.round((25 + 200 + 100 + 50) * 1.25) + 10; // 479
  assert.ok(farmed.books[0].score < 3 * oneFull, `ninety seconds of spam paid ${farmed.books[0].score}`);

  // The rider: the same flight on eight features, each past the window.
  const rider = run(1, { durationSteps: TRICK_RUN.durationSteps });
  const park = ['ledge', 'gap', 'skinny', 'stepUp', 'stairs', 'rhythm', 'kicker', 'spinShelf'];
  park.forEach((zone, index) => {
    fly(rider, 0, { flight: index + 1, charge: 1, spin: true, oneFoot: true, landing: 'clean', zone, rested: false });
  });
  assert.equal(book(rider).score, 8 * oneFull, 'eight features, one visit each, all in full');
  assert.equal(book(rider).breakdown.repeatedFlights, 0);
  assert.ok(book(rider).score > farmed.books[0].score);
});

// -- Feature identity (q189) -------------------------------------------------------

test('tricks bank only on a flight launched from a feature; the clean landing banks anywhere', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, charge: 1, spin: true, oneFoot: true, landing: 'clean', zone: 'ledge' });
  const onFeature = Math.round((25 + 200 + 100 + 50) * 1.25) + 10;
  assert.equal(book(referee).score, onFeature);
  assert.equal(book(referee).lastAward?.zone, 'ledge');

  const { awards } = fly(referee, 0, { flight: 2, charge: 1, spin: true, oneFoot: true, landing: 'clean', zone: null });
  assert.equal(awards.length, 1, 'the flat flight is still reported, so the screen can say why');
  assert.equal(awards[0].zone, null);
  assert.deepEqual(awards[0].kinds, ['charged-hop', 'spin-landed', 'one-foot-air'], 'what was landed is named');
  assert.equal(awards[0].trickPoints, 0);
  assert.equal(awards[0].bonusPoints, 0);
  assert.equal(awards[0].cleanPoints, 10, 'the landing is paid');
  assert.equal(book(referee).score, onFeature + 10);
  const state = book(referee);
  assert.equal(state.breakdown.offZoneFlights, 1);
  assert.equal(state.breakdown.spinPoints, 200, 'the off-feature 180 added nothing to its row');
  assert.equal(state.tally.spinsLanded, 2, 'but the observer counted it — the count and the points may differ');
  assertAdds(state);
});

test('the launch zone is read on the takeoff step only, and cleared by a reset or a discard', () => {
  const referee = run();
  // A zone handed in on a mid-air step does not attach to the flight.
  one(referee, 0, facts({ flightIndex: 1, tookOff: true }), null);
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true }), 'kicker');
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true, touchedDown: true, landingQuality: 'heavy' }), 'kicker');
  assert.equal(book(referee).score, 0, 'launched off the feature, whatever the later steps said');
  assert.equal(book(referee).breakdown.offZoneFlights, 1);

  one(referee, 0, facts({ flightIndex: 2, tookOff: true }), 'gap');
  assert.equal(book(referee).openZone, 'gap');
  one(referee, 0, facts({ flightIndex: 2, reset: true }));
  assert.equal(book(referee).openZone, null);
  assert.equal(book(referee).flightOpen, false);
});

test('a flat flight that lands nothing but a heavy touchdown reports no award and no off-feature count', () => {
  const referee = run();
  const { awards } = fly(referee, 0, { flight: 1, landing: 'heavy', zone: null });
  assert.equal(awards.length, 0);
  assert.equal(book(referee).breakdown.offZoneFlights, 0, 'no tricks were landed off a feature');
});

test('an off-feature flight never loads a feature\'s clock', () => {
  const referee = run();
  fly(referee, 0, { flight: 1, spin: true, landing: 'clean', zone: null });
  fly(referee, 0, { flight: 2, spin: true, landing: 'clean', zone: 'kicker', rested: false });
  assert.equal(book(referee).score, 10 + Math.round(200 * 1.25) + 10, 'the kicker pays in full behind a flat hop');
  assert.equal(book(referee).lastAward?.repeated, false);
  assert.equal(book(referee).breakdown.repeatedFlights, 0);
});

test('with the gate off, a flat flight is paid like any other — the bench\'s control', () => {
  const referee = run(1, { featureLaunchRequired: 0 });
  fly(referee, 0, { flight: 1, spin: true, landing: 'heavy', zone: null });
  assert.equal(book(referee).score, 200);
  assert.equal(book(referee).breakdown.offZoneFlights, 0);
  assert.throws(() => new TrickRun(rules({ featureLaunchRequired: 2 })));
  assert.notEqual(new TrickRun(rules({ featureLaunchRequired: 0 })).rulesRevision, new TrickRun(rules()).rulesRevision);
});

test('q189 in one test: a paced stander, on or off a feature, cannot keep up with a lap', () => {
  const pace = Math.round(10.5 * SIMULATION.hz);
  const stand = (zone: string | null): number => {
    const referee = run(1, { durationSteps: TRICK_RUN.durationSteps });
    let flight = 1;
    while (referee.state.remainingSteps > pace + 100) {
      for (let i = 0; i < pace; i += 1) one(referee, 0, facts({ flightIndex: flight - 1 }));
      fly(referee, 0, { flight, charge: 1, spin: true, oneFoot: true, landing: 'clean', airSteps: 82, rested: false, zone });
      flight += 1;
    }
    assert.ok(book(referee).flights >= 7, `the stander flew ${book(referee).flights}`);
    return book(referee).score;
  };
  const oneFull = Math.round((25 + 200 + 100 + 50) * 1.25) + 10;
  const offFeature = stand(null);
  const onFeature = stand('kicker');
  assert.ok(offFeature <= 2 * 10, `off the features: landings, decaying — ${offFeature}`);
  assert.ok(onFeature < 2 * oneFull, `camping a feature every 10.5 s: about two flights' worth — ${onFeature}`);

  const rider = run(1, { durationSteps: TRICK_RUN.durationSteps });
  const park = ['ledge', 'gap', 'skinny', 'stepUp', 'stairs', 'rhythm', 'kicker', 'spinShelf'];
  park.forEach((zone, index) => {
    fly(rider, 0, { flight: index + 1, charge: 1, oneFoot: true, landing: 'clean', zone, rested: false });
  });
  // Measured: 1,832 against 955 — a lap of modest flights is worth about two
  // campers, because camping is worth about two flights however long it goes on.
  assert.ok(book(rider).score > 1.5 * onFeature, `rider ${book(rider).score} vs camper ${onFeature}`);
});

// -- Determinism ----------------------------------------------------------------

test('the same fact stream twice is the same run: total, every award, the deadline', () => {
  const play = (): { result: TrickRunResult; awards: TrickAward[] } => {
    const referee = run(2, { durationSteps: 20000 });
    const awards: TrickAward[] = [];
    const flights: FlightScript[] = [
      { flight: 1, charge: 1, spin: true, landing: 'clean', airSteps: 4 },
      { flight: 2, oneFoot: true, landing: 'wobble', airSteps: 3 },
      { flight: 3, charge: 1, landing: 'air-crash', airSteps: 2 },
      { flight: 4, spin: true, oneFoot: true, landing: 'heavy', airSteps: 5 },
    ];
    const zones = ['ledge', 'gap', null, 'kicker'];
    flights.forEach((script, index) => {
      const zoned = { ...script, zone: zones[index], rested: false };
      awards.push(...fly(referee, 0, zoned).awards);
      awards.push(...fly(referee, 1, { ...zoned, landing: script.landing === 'clean' ? 'heavy' : script.landing }).awards);
    });
    while (referee.phase === 'running') awards.push(...referee.step(STEP).awards);
    const result = referee.result();
    assert.ok(result !== null);
    return { result, awards };
  };
  const first = play();
  const second = play();
  assert.deepEqual(first.result, second.result);
  assert.deepEqual(first.awards, second.awards);
  assert.equal(first.result.completed, true);
  assert.ok(first.awards.length >= 4);
});

test('alternate rules run through the same referee — a bench evaluates a rule object, not a second formula', () => {
  const doubled = run(1, {
    spinLandedPoints: 400, cleanLandingPoints: 0, cleanMultiplier: 1, multiTrickBonusPoints: 0,
  });
  fly(doubled, 0, { flight: 1, spin: true, oneFoot: true, landing: 'clean' });
  assert.equal(book(doubled).score, 500);
  assert.equal(book(doubled).breakdown.bonusPoints, 0);
  assert.equal(book(doubled).breakdown.cleanLandingPoints, 0);
  assert.equal(book(doubled).tally.cleanLandings, 1, 'the landing is still counted, it is just worth nothing here');
  assert.notEqual(doubled.rulesRevision, new TrickRun().rulesRevision);
});

test('the referee has no clock of its own: no Date, no Math.random', async () => {
  // The layer rules (no three, no app/, no ui/) are `architecture.test.ts`'s
  // sweep, which reads this directory; only the determinism rule is here.
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const source = readFileSync(join(import.meta.dirname, 'trickRun.ts'), 'utf8');
  assert.ok(!/new Date\b|Date\.now|performance\.now/.test(source));
  assert.ok(!/Math\.random\(/.test(source));
});
