/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { createTrickFacts, type TrickStepInput } from './trickEvents.ts';
import {
  SHIPPED_TRICK_RULES,
  TrickRun,
  validTrickRules,
  type TrickAward,
  type TrickBookState,
  type TrickRunRules,
} from './trickRun.ts';

/**
 * M38 Phase 5 — independent QA's own probes of the Trick Run referee.
 *
 * Written by somebody who did not build it, and deliberately NOT a replay of
 * `trickRun.test.ts`: every case here is an attack §38.8 names — fabricated
 * and duplicated events, stale flight identity, the deadline's two edges, the
 * reset/crash precedence, the q185 repeat clocks (pause, retry, per-kind
 * independence, the inclusive edge) and the breakdown's exact sum under a
 * deterministic adversarial fuzz.
 */

const STEP = 1 / SIMULATION.hz;
const WINDOW_STEPS = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz);

// The gate on where a flight launched (q189) is `trickRun.test.ts`'s to prove;
// these attacks are on banking, identity and the clock, so it is off here.
function rules(over: Partial<TrickRunRules> = {}): TrickRunRules {
  return { ...SHIPPED_TRICK_RULES, durationSteps: 60000, featureLaunchRequired: 0, ...over };
}

function facts(over: Partial<TrickStepInput> = {}): TrickStepInput {
  return { ...createTrickFacts(), ...over };
}

function run(seats = 1, over: Partial<TrickRunRules> = {}): TrickRun {
  const referee = new TrickRun(rules(over));
  referee.arm(seats);
  return referee;
}

function one(referee: TrickRun, seat: number, input: TrickStepInput) {
  referee.record(seat, input);
  return referee.step(STEP);
}

/** Idle steps for every seat the run has, so the shared clock is honest. */
function idle(referee: TrickRun, steps: number, seats = 1, flight = 0): void {
  for (let i = 0; i < steps; i += 1) {
    for (let seat = 0; seat < seats; seat += 1) referee.record(seat, facts({ flightIndex: flight }));
    referee.step(STEP);
  }
}

function book(referee: TrickRun, seat = 0): TrickBookState {
  const state = referee.book(seat);
  assert.ok(state !== null);
  return state;
}

/** Every row of the breakdown, added up the way the card adds them. */
function breakdownSum(state: TrickBookState): number {
  const b = state.breakdown;
  return b.cleanLandingPoints + b.chargedHopPoints + b.spinPoints + b.oneFootPoints
    + b.bonusPoints + b.qualityAdjustment + b.repeatAdjustment;
}

// ---------------------------------------------------------------------------
// Fabrication and duplication
// ---------------------------------------------------------------------------

test('QA: a facts struct full of true flags with no takeoff banks nothing', () => {
  const referee = run();
  for (let i = 0; i < 20; i += 1) {
    const step = one(referee, 0, facts({
      flightIndex: 7,
      hopped: true,
      hopCharge: 1,
      spinCompleted: true,
      oneFootQualified: true,
      touchedDown: true,
      landingQuality: 'clean',
    }));
    assert.equal(step.awards.length, 0, `step ${i} banked from nothing`);
  }
  const state = book(referee);
  assert.equal(state.score, 0);
  assert.equal(state.flights, 0);
  assert.equal(state.tally.cleanLandings, 0);
});

test('QA: a replayed touchdown banks exactly once', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 3, tookOff: true, hopped: true, hopCharge: 1 }));
  for (let i = 0; i < 4; i += 1) one(referee, 0, facts({ flightIndex: 3 }));
  const land = facts({
    flightIndex: 3, touchedDown: true, landingQuality: 'clean', spinCompleted: true,
  });
  const first = one(referee, 0, land);
  assert.equal(first.awards.length, 1);
  const banked = first.awards[0].points;
  assert.ok(banked > 0);
  // The identical struct again, five steps running. Nothing may bank.
  for (let i = 0; i < 5; i += 1) {
    const again = one(referee, 0, land);
    assert.equal(again.awards.length, 0, `replay ${i} banked a second landing`);
  }
  assert.equal(book(referee).score, banked);
  assert.equal(book(referee).flights, 1);
});

test('QA: recording twice in one step feeds the observer once', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true }));
  // Two records, one step: the later facts win and the observer is fed once.
  referee.record(0, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  referee.record(0, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  const step = referee.step(STEP);
  assert.equal(step.awards.length, 1);
  assert.equal(book(referee).tally.spinsLanded, 1);
  assert.equal(book(referee).tally.chargedHops, 1);
});

test('QA: a touchdown carrying a stale flight identity banks nothing', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 9, tookOff: true, hopped: true, hopCharge: 1 }));
  one(referee, 0, facts({ flightIndex: 9, spinCompleted: true, oneFootQualified: true }));
  const step = one(referee, 0, facts({
    flightIndex: 8, touchedDown: true, landingQuality: 'clean',
  }));
  assert.equal(step.awards.length, 0);
  const state = book(referee);
  assert.equal(state.score, 0);
  assert.equal(state.flightOpen, false);
  // The launch was counted by the observer and honestly reported as forfeited.
  assert.equal(state.tally.chargedHops, 1);
  assert.equal(state.breakdown.chargedHopsForfeited, 1);
  assert.equal(breakdownSum(state), state.breakdown.total);
});

test('QA: a reset on the very step of a clean touchdown discards and is not a crash', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 }));
  one(referee, 0, facts({ flightIndex: 2, spinCompleted: true }));
  const step = one(referee, 0, facts({
    flightIndex: 2, touchedDown: true, landingQuality: 'clean', reset: true,
  }));
  assert.equal(step.awards.length, 0);
  assert.equal(step.forfeits.length, 0);
  const state = book(referee);
  assert.equal(state.score, 0);
  assert.equal(state.crashes, 0);
  assert.equal(state.tally.spinsLanded, 0);
  // And the clock is untouched by the reset: it is still this run's step 3.
  assert.equal(referee.state.elapsedSteps, 3);
});

test('QA: a crash raised on the touchdown step forfeits even when the tier says clean', () => {
  const referee = run();
  one(referee, 0, facts({ flightIndex: 4, tookOff: true, hopped: true, hopCharge: 1 }));
  one(referee, 0, facts({ flightIndex: 4, spinCompleted: true, oneFootQualified: true }));
  // §38.4 step 1: the contact pass established the crash after the pool was
  // filled, so the tier is stale and `crashed` is the truth.
  const step = one(referee, 0, facts({
    flightIndex: 4, touchedDown: true, landingQuality: 'clean', crashed: true,
  }));
  assert.deepEqual(step.awards, []);
  assert.deepEqual(step.forfeits, [0]);
  const state = book(referee);
  assert.equal(state.score, 0);
  assert.equal(state.crashes, 1);
  assert.equal(state.tally.cleanLandings, 0);
  assert.equal(state.tally.spinsLanded, 0);
  assert.equal(state.breakdown.chargedHopsForfeited, 1);
});

// ---------------------------------------------------------------------------
// The deadline's two edges
// ---------------------------------------------------------------------------

test('QA: a touchdown on the deadline step banks and one step later banks nothing', () => {
  const referee = run(1, { durationSteps: 10 });
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  for (let i = 0; i < 8; i += 1) one(referee, 0, facts({ flightIndex: 1, spinCompleted: i === 2 }));
  assert.equal(referee.state.elapsedSteps, 9);
  const last = one(referee, 0, facts({
    flightIndex: 1, touchedDown: true, landingQuality: 'clean',
  }));
  assert.equal(last.ended, true);
  assert.equal(last.awards.length, 1);
  const result = referee.result();
  assert.ok(result !== null);
  assert.equal(result.completed, true);
  assert.equal(result.books[0].score, last.awards[0].points);

  // One step later: record refuses, step is quiet, the frozen card is unmoved.
  const after = one(referee, 0, facts({
    flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1,
  }));
  assert.equal(after.ended, false);
  assert.equal(after.awards.length, 0);
  assert.equal(referee.result(), result);
  assert.equal(referee.result()?.books[0].score, last.awards[0].points);
});

test('QA: a flight still in the air at the deadline earns nothing and is reported forfeited', () => {
  const referee = run(1, { durationSteps: 6 });
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  for (let i = 0; i < 5; i += 1) {
    one(referee, 0, facts({ flightIndex: 1, spinCompleted: true, oneFootQualified: true }));
  }
  const result = referee.result();
  assert.ok(result !== null);
  assert.equal(result.completed, true);
  assert.equal(result.books[0].score, 0);
  assert.equal(result.books[0].flightOpen, false);
  assert.equal(result.books[0].breakdown.chargedHopsForfeited, 1);
});

test('QA: end() mid-flight is an unfinished card and banks nothing', () => {
  const referee = run(1, { durationSteps: 1000 });
  one(referee, 0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  one(referee, 0, facts({ flightIndex: 1, spinCompleted: true, oneFootQualified: true }));
  const result = referee.end();
  assert.ok(result !== null);
  assert.equal(result.completed, false);
  assert.equal(result.books[0].score, 0);
  assert.equal(referee.end(), result, 'a second End run must not mint a card');
  // And nothing can bank after it.
  const after = one(referee, 0, facts({
    flightIndex: 1, touchedDown: true, landingQuality: 'clean',
  }));
  assert.equal(after.awards.length, 0);
});

// ---------------------------------------------------------------------------
// q185's diminishing repeats
// ---------------------------------------------------------------------------

/** One standing hop: launch, short air, land on the given tier. */
function hop(referee: TrickRun, seat: number, flight: number, opts: {
  spin?: boolean; foot?: boolean; landing?: 'clean' | 'heavy' | 'wobble'; air?: number;
} = {}): number {
  let points = 0;
  one(referee, seat, facts({ flightIndex: flight, tookOff: true, hopped: true, hopCharge: 1 }));
  const air = opts.air ?? 2;
  for (let i = 0; i < air; i += 1) {
    one(referee, seat, facts({
      flightIndex: flight,
      spinCompleted: opts.spin === true,
      oneFootQualified: opts.foot === true,
    }));
  }
  const step = one(referee, seat, facts({
    flightIndex: flight,
    touchedDown: true,
    landingQuality: opts.landing ?? 'clean',
  }));
  for (const award of step.awards) if (award.seat === seat) points += award.points;
  return points;
}

test('QA: pausing does not let a farmer’s repeat window recover', () => {
  const referee = run();
  const first = hop(referee, 0, 1, { spin: true, foot: true });
  const second = hop(referee, 0, 2, { spin: true, foot: true });
  assert.ok(second < first, 'the immediate repeat must pay less');
  // A pause is the absence of `step` calls: the referee is simply not stepped.
  // If the window were wall-clocked, a long pause would restore full value.
  const third = hop(referee, 0, 3, { spin: true, foot: true });
  assert.ok(third <= second, 'a pause must not refresh the repeat clocks');
  assert.ok(third < first);
});

test('QA: Retry clears every repeat clock', () => {
  const referee = run();
  hop(referee, 0, 1, { spin: true, foot: true });
  const repeated = hop(referee, 0, 2, { spin: true, foot: true });
  referee.arm(1);
  const fresh = hop(referee, 0, 1, { spin: true, foot: true });
  assert.ok(fresh > repeated);
  assert.equal(book(referee).score, fresh);
  assert.equal(book(referee).crashes, 0);
  assert.equal(book(referee).breakdown.repeatedFlights, 0);
});

test('QA: the repeat clock is the PLACE, not the trick (2026-09-14)', () => {
  // This case was written against the per-KIND clocks and is kept pointing at
  // the rule that replaced them: a flight's whole value is docked by the
  // feature it launched from, and changing which tricks are in it changes
  // nothing. A referee that went back to per-kind clocks would pay the second
  // flight here more than the first repeat, because its kinds are different.
  const perPlace = new TrickRun(gated({ durationSteps: 60000 }));
  perPlace.arm(1);
  const first = gateFly(perPlace, { flight: 1, zone: 'ledge', charge: 1, spin: true, rested: false });
  // Same feature, entirely different tricks: still a repeat of the ledge.
  const sameFeature = gateFly(perPlace, { flight: 2, zone: 'ledge', oneFoot: true, rested: false });
  assert.equal(sameFeature[0].repeated, true, 'a different trick from the same feature escaped the clock');
  assert.ok(sameFeature[0].points < first[0].points);
  // The one-foot air's own base is untouched — the docking is one signed row.
  const state = book(perPlace);
  assert.equal(state.breakdown.oneFootPoints, SHIPPED_TRICK_RULES.oneFootAirPoints);
  assert.equal(breakdownSum(state), state.breakdown.total);

  // A *different* feature, the identical tricks, one step later: full value.
  const other = new TrickRun(gated({ durationSteps: 60000 }));
  other.arm(1);
  const a = gateFly(other, { flight: 1, zone: 'ledge', charge: 1, spin: true, rested: false });
  const b = gateFly(other, { flight: 2, zone: 'kicker', charge: 1, spin: true, rested: false });
  assert.equal(b[0].repeated, false, 'another feature was docked by the ledge’s clock');
  assert.equal(b[0].points, a[0].points);
});

test('QA: the repeat window edge is inclusive and the step past it pays in full', () => {
  const onEdge = run();
  const firstA = hop(onEdge, 0, 1, { spin: true, foot: true });
  // Land the next flight exactly `WINDOW_STEPS` after the first banked.
  const bankedAt = onEdge.state.elapsedSteps;
  const flightSteps = 4; // launch + 2 air + landing == 4 steps
  idle(onEdge, WINDOW_STEPS - flightSteps);
  const edge = hop(onEdge, 0, 2, { spin: true, foot: true });
  assert.equal(onEdge.state.elapsedSteps - bankedAt, WINDOW_STEPS);
  assert.ok(edge < firstA, 'exactly at the window is still a repeat');

  const past = run();
  const firstB = hop(past, 0, 1, { spin: true, foot: true });
  idle(past, WINDOW_STEPS - flightSteps + 1);
  const outside = hop(past, 0, 2, { spin: true, foot: true });
  assert.equal(outside, firstB, 'one step past the window pays in full');
});

// ---------------------------------------------------------------------------
// Seat identity
// ---------------------------------------------------------------------------

test('QA: four seats score their own books under a permuted hop order', () => {
  const order = [2, 0, 3, 1];
  const referee = run(4);
  // Only seat 3 ever tricks; the rest ride quietly on the same clock.
  for (let round = 0; round < 3; round += 1) {
    for (const seat of order) {
      referee.record(seat, facts({
        flightIndex: round + 1, tookOff: seat === 3, hopped: seat === 3, hopCharge: 1,
      }));
    }
    referee.step(STEP);
    for (let i = 0; i < 2; i += 1) {
      for (const seat of order) referee.record(seat, facts({ flightIndex: round + 1 }));
      referee.step(STEP);
    }
    for (const seat of order) {
      referee.record(seat, facts({
        flightIndex: round + 1,
        touchedDown: seat === 3,
        landingQuality: seat === 3 ? 'clean' : 'none',
      }));
    }
    referee.step(STEP);
  }
  assert.ok(book(referee, 3).score > 0);
  for (const seat of [0, 1, 2]) {
    const state = book(referee, seat);
    assert.equal(state.score, 0, `seat ${seat} scored somebody else's flight`);
    assert.equal(state.flights, 0);
    assert.equal(state.tally.chargedHops, 0);
  }
});

test('QA: one seat’s crash never touches another seat’s book', () => {
  const referee = run(2);
  referee.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  referee.record(1, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }));
  referee.step(STEP);
  referee.record(0, facts({ flightIndex: 1, spinCompleted: true }));
  referee.record(1, facts({ flightIndex: 1, spinCompleted: true }));
  referee.step(STEP);
  referee.record(0, facts({ flightIndex: 1, crashed: true }));
  referee.record(1, facts({ flightIndex: 1, touchedDown: true, landingQuality: 'clean' }));
  const step = referee.step(STEP);
  assert.deepEqual(step.forfeits, [0]);
  assert.equal(step.awards.length, 1);
  assert.equal(step.awards[0].seat, 1);
  assert.equal(book(referee, 0).score, 0);
  assert.equal(book(referee, 0).crashes, 1);
  assert.ok(book(referee, 1).score > 0);
  assert.equal(book(referee, 1).crashes, 0);
});

// ---------------------------------------------------------------------------
// The breakdown adds up, under an adversarial script
// ---------------------------------------------------------------------------

test('QA: the breakdown adds exactly to the total over a long hostile run', () => {
  const referee = run(1, { durationSteps: 200000 });
  // A deterministic pseudo-random script: no Math.random, and reproducible.
  let seed = 0x2f6e2b1;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const tiers = ['clean', 'heavy', 'wobble', 'crash'] as const;
  let flight = 1;
  for (let i = 0; i < 400; i += 1) {
    const roll = next();
    if (roll < 0.12) {
      // A reset mid-flight.
      one(referee, 0, facts({ flightIndex: flight, tookOff: true, hopped: true, hopCharge: 1 }));
      one(referee, 0, facts({ flightIndex: flight, reset: true }));
      flight += 1;
      continue;
    }
    const tier = tiers[Math.floor(next() * tiers.length)];
    one(referee, 0, facts({
      flightIndex: flight,
      tookOff: true,
      hopped: next() < 0.7,
      hopCharge: next() < 0.8 ? 1 : 0.5,
    }));
    const air = 1 + Math.floor(next() * 4);
    for (let a = 0; a < air; a += 1) {
      one(referee, 0, facts({
        flightIndex: flight,
        spinCompleted: next() < 0.4,
        oneFootQualified: next() < 0.4,
      }));
    }
    one(referee, 0, facts({
      flightIndex: flight,
      touchedDown: true,
      landingQuality: tier,
      crashed: tier === 'crash',
    }));
    if (tier === 'crash') {
      for (let c = 0; c < 3; c += 1) one(referee, 0, facts({ flightIndex: flight, crashed: true }));
    }
    flight += 1;
    const rest = Math.floor(next() * 900);
    idle(referee, rest, 1, flight - 1);
    const state = book(referee);
    assert.equal(breakdownSum(state), state.breakdown.total, `breakdown drifted at flight ${flight}`);
    assert.ok(Number.isSafeInteger(state.score) && state.score >= 0);
  }
  const state = book(referee);
  assert.ok(state.score > 0);
  assert.equal(breakdownSum(state), state.score);
  assert.ok(state.breakdown.repeatAdjustment <= 0);
  assert.ok(state.crashes > 0);
  assert.ok(state.breakdown.chargedHopsForfeited > 0);
});

test('QA: two identical scripts on two referees agree exactly, seat order permuted', () => {
  const play = (order: readonly number[]): readonly TrickBookState[] => {
    const referee = run(4, { durationSteps: 4000 });
    for (let flight = 1; flight <= 6; flight += 1) {
      for (let phase = 0; phase < 5; phase += 1) {
        for (const seat of order) {
          referee.record(seat, facts({
            flightIndex: flight,
            tookOff: phase === 0,
            hopped: phase === 0 && seat % 2 === 0,
            hopCharge: 1,
            spinCompleted: phase === 2 && seat < 2,
            oneFootQualified: phase === 3 && seat > 0,
            touchedDown: phase === 4,
            landingQuality: phase === 4 ? (seat === 3 ? 'wobble' : 'clean') : 'none',
          }));
        }
        referee.step(STEP);
      }
      idle(referee, 30, 4, flight);
    }
    return referee.state.books;
  };
  const forward = play([0, 1, 2, 3]);
  const shuffled = play([3, 1, 0, 2]);
  assert.deepEqual(JSON.parse(JSON.stringify(shuffled)), JSON.parse(JSON.stringify(forward)));
  assert.ok(forward[0].score > 0);
});

// ---------------------------------------------------------------------------
// Rules identity
// ---------------------------------------------------------------------------

test('QA: every shipped rule field moves the revision string', () => {
  const base = new TrickRun(SHIPPED_TRICK_RULES).rulesRevision;
  const seen = new Set<string>([base]);
  const overrides: Partial<TrickRunRules>[] = [
    { durationSteps: SHIPPED_TRICK_RULES.durationSteps + 1 },
    { cleanLandingPoints: 11 },
    { chargedHopPoints: 26 },
    { spinLandedPoints: 201 },
    { oneFootAirPoints: 101 },
    { multiTrickMinKinds: 3 },
    { multiTrickBonusPoints: 51 },
    { cleanMultiplier: 1.3 },
    { heavyMultiplier: 1.1 },
    { wobbleMultiplier: 0.6 },
    { repeatWindowSeconds: 11 },
    { repeatDecay: 0.6 },
    { repeatFloor: 0.1 },
  ];
  for (const over of overrides) {
    const revision = new TrickRun({ ...SHIPPED_TRICK_RULES, ...over }).rulesRevision;
    assert.equal(seen.has(revision), false, `revision did not move for ${Object.keys(over)[0]}`);
    seen.add(revision);
  }
});

// ---------------------------------------------------------------------------
// q189 — the launch-zone gate, with the gate ON
//
// Everything above runs `featureLaunchRequired: 0` on purpose, because those
// attacks are on banking, identity and the clock. This section is the other
// half: the gate itself, attacked by somebody who did not build it. The rules
// here are the shipped ones — `gated()` only lengthens the clock — so a table
// that quietly stopped gating fails here rather than only in a browser.
// ---------------------------------------------------------------------------

/** The shipped rules with the gate ON and a long clock. */
function gated(over: Partial<TrickRunRules> = {}): TrickRunRules {
  return { ...SHIPPED_TRICK_RULES, durationSteps: 60000, featureLaunchRequired: 1, ...over };
}

function gatedRun(seats = 1, over: Partial<TrickRunRules> = {}): TrickRun {
  const referee = new TrickRun(gated(over));
  referee.arm(seats);
  return referee;
}

interface GateFlight {
  readonly flight: number;
  /** The zone handed in on the TAKEOFF step. */
  readonly zone?: string | null;
  /** A zone handed in on every step after the takeoff. Must never attach. */
  readonly airZone?: string | null;
  readonly charge?: number;
  readonly spin?: boolean;
  readonly oneFoot?: boolean;
  readonly landing?: 'clean' | 'heavy' | 'wobble' | 'crash';
  readonly rested?: boolean;
  readonly seat?: number;
}

/** One flight through a gated referee; returns this seat's awards. */
function gateFly(referee: TrickRun, script: GateFlight): TrickAward[] {
  const seat = script.seat ?? 0;
  const awards: TrickAward[] = [];
  const sweep = (input: TrickStepInput, zone: string | null = null) => {
    referee.record(seat, input, zone);
    const step = referee.step(STEP);
    awards.push(...step.awards.filter((award) => award.seat === seat));
  };
  if (script.rested !== false) {
    for (let i = 0; i < WINDOW_STEPS + 1; i += 1) {
      sweep(facts({ flightIndex: script.flight - 1 }));
    }
  }
  sweep(facts({
    flightIndex: script.flight,
    tookOff: true,
    hopped: script.charge !== undefined,
    hopCharge: script.charge ?? 0,
  }), script.zone === undefined ? null : script.zone);
  for (let i = 0; i < 6; i += 1) {
    sweep(facts({
      flightIndex: script.flight,
      spinCompleted: script.spin === true && i >= 2,
      oneFootQualified: script.oneFoot === true && i >= 1,
    }), script.airZone ?? null);
  }
  sweep(facts({
    flightIndex: script.flight,
    spinCompleted: script.spin === true,
    oneFootQualified: script.oneFoot === true,
    touchedDown: true,
    landingQuality: script.landing ?? 'clean',
    crashed: script.landing === 'crash',
  }), script.airZone ?? null);
  return awards;
}

test('QA gate: a zone handed in after the takeoff step never attaches to the flight', () => {
  const referee = gatedRun();
  // Took off from nowhere; every airborne step and the landing claim a feature.
  const awards = gateFly(referee, {
    flight: 1, zone: null, airZone: 'kicker', charge: 1, spin: true, oneFoot: true,
  });
  assert.equal(awards.length, 1);
  assert.equal(awards[0].zone, null, 'a mid-air zone attached to the flight');
  assert.equal(awards[0].basePoints, 0, 'a mid-air zone paid trick points');
  assert.equal(awards[0].bonusPoints, 0);
  const state = book(referee);
  assert.equal(state.score, SHIPPED_TRICK_RULES.cleanLandingPoints);
  assert.equal(state.breakdown.offZoneFlights, 1);
});

test('QA gate: an off-zone flight counts once however many kinds it landed', () => {
  const referee = gatedRun();
  const awards = gateFly(referee, {
    flight: 1, zone: null, charge: 1, spin: true, oneFoot: true,
  });
  assert.equal(awards.length, 1);
  // Every kind is still NAMED — the screen says what was ridden (§38.6) —
  // and none of them is paid for.
  assert.deepEqual([...awards[0].kinds], ['charged-hop', 'spin-landed', 'one-foot-air']);
  assert.equal(awards[0].points, SHIPPED_TRICK_RULES.cleanLandingPoints);
  assert.equal(awards[0].trickPoints, 0);
  const state = book(referee);
  assert.equal(state.breakdown.offZoneFlights, 1, 'three kinds counted as three flights');
  assert.equal(state.breakdown.chargedHopPoints, 0);
  assert.equal(state.breakdown.spinPoints, 0);
  assert.equal(state.breakdown.oneFootPoints, 0);
  assert.equal(state.breakdown.bonusPoints, 0, 'the flight bonus paid off the features');
  assert.equal(state.breakdown.qualityAdjustment, 0, 'a multiplier moved nothing');
});

test('QA gate: an off-zone flight with no kinds is not counted off-zone', () => {
  const referee = gatedRun();
  gateFly(referee, { flight: 1, zone: null, landing: 'heavy' });
  const state = book(referee);
  assert.equal(state.breakdown.offZoneFlights, 0, 'a plain landing was called off-feature');
  assert.equal(state.score, 0, 'a heavy plain landing banked points');
});

test('QA gate: off-zone flights keep their own repeat clock, and never touch a feature\'s', () => {
  // Three off-zone flights back to back, then a feature flight. The repeat
  // clocks are per launch feature (2026-09-14), and "off the features" is a
  // clock of its own — so the feature flight pays exactly what it pays with
  // nothing at all behind it, landing included.
  const farmed = gatedRun();
  for (let flight = 1; flight <= 3; flight += 1) {
    gateFly(farmed, { flight, zone: null, charge: 1, spin: true, oneFoot: true, rested: flight === 1 });
  }
  gateFly(farmed, { flight: 4, zone: 'kicker', charge: 1, spin: true, oneFoot: true, rested: false });

  const fresh = gatedRun();
  gateFly(fresh, { flight: 1, zone: 'kicker', charge: 1, spin: true, oneFoot: true });

  const after = book(farmed).lastAward;
  const alone = book(fresh).lastAward;
  assert.ok(after !== null && alone !== null);
  assert.equal(after.points, alone.points, 'an off-zone flight loaded a feature\'s repeat clock');
  assert.equal(after.repeated, false);
  assert.ok(after.trickPoints > 0);
  // And the off-zone landings docked each other: 10, 5, 3 rather than 30.
  assert.equal(book(farmed).breakdown.cleanLandingPoints, 40, 'four clean landings at full value on the row');
  assert.equal(book(farmed).score - alone.points, 10 + 5 + 3, 'the off-feature clock decays the flat landings');
});

test('QA gate: the flight bonus never pays off the features', () => {
  const referee = gatedRun();
  const off = gateFly(referee, { flight: 1, zone: null, charge: 1, spin: true });
  assert.equal(off[0].bonusPoints, 0);
  const on = gateFly(referee, { flight: 2, zone: 'ledge', charge: 1, spin: true });
  assert.equal(on[0].bonusPoints, SHIPPED_TRICK_RULES.multiTrickBonusPoints);
  assert.equal(book(referee).breakdown.bonusPoints, SHIPPED_TRICK_RULES.multiTrickBonusPoints);
});

test('QA gate: a reset, a stale identity, the deadline and end() all clear the open zone', () => {
  // 1. A reset on an open feature flight, then a flat hop: the flat hop must
  //    not inherit the feature.
  const afterReset = gatedRun();
  afterReset.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), 'kicker');
  afterReset.step(STEP);
  assert.equal(book(afterReset).openZone, 'kicker');
  afterReset.record(0, facts({ flightIndex: 1, reset: true }));
  afterReset.step(STEP);
  assert.equal(book(afterReset).openZone, null, 'a reset kept the launch feature');
  gateFly(afterReset, { flight: 2, zone: null, charge: 1, spin: true, rested: false });
  assert.equal(book(afterReset).breakdown.offZoneFlights, 1);
  assert.equal(book(afterReset).breakdown.spinPoints, 0, 'a flat hop inherited a feature');

  // 2. A flight identity that changes under the referee discards the zone.
  const stale = gatedRun();
  stale.record(0, facts({ flightIndex: 4, tookOff: true, hopped: true, hopCharge: 1 }), 'gap');
  stale.step(STEP);
  stale.record(0, facts({ flightIndex: 9 }));
  stale.step(STEP);
  assert.equal(book(stale).openZone, null, 'a stale identity kept the launch feature');

  // 3. The deadline freezes a card with nothing open.
  const deadline = new TrickRun(gated({ durationSteps: 3 }));
  deadline.arm(1);
  deadline.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), 'skinny');
  deadline.step(STEP);
  deadline.record(0, facts({ flightIndex: 1 }));
  deadline.step(STEP);
  deadline.record(0, facts({ flightIndex: 1 }));
  const last = deadline.step(STEP);
  assert.equal(last.ended, true);
  assert.equal(deadline.result()?.books[0].openZone, null, 'the card froze an open feature');

  // 4. end() from pause, the same.
  const ended = gatedRun();
  ended.record(0, facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 }), 'stepUp');
  ended.step(STEP);
  assert.equal(ended.end()?.books[0].openZone, null, 'an early end froze an open feature');
});

test('QA gate: one seat’s feature never pays another seat’s flight', () => {
  const referee = gatedRun(4);
  // Seat 1 launches from a feature on the same step seats 0, 2 and 3 launch
  // from flat ground, and the whole room is swept together.
  const launch = () => facts({ flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 });
  for (const seat of [3, 1, 0, 2]) referee.record(seat, launch(), seat === 1 ? 'ledge' : null);
  referee.step(STEP);
  for (const seat of [0, 1, 2, 3]) {
    assert.equal(book(referee, seat).openZone, seat === 1 ? 'ledge' : null, `seat ${seat}`);
  }
  for (let i = 0; i < 4; i += 1) {
    for (const seat of [2, 0, 3, 1]) referee.record(seat, facts({ flightIndex: 1, spinCompleted: i >= 1 }));
    referee.step(STEP);
  }
  for (const seat of [1, 3, 2, 0]) {
    referee.record(seat, facts({
      flightIndex: 1, spinCompleted: true, touchedDown: true, landingQuality: 'clean',
    }));
  }
  const step = referee.step(STEP);
  assert.equal(step.awards.length, 4);
  for (const award of step.awards) {
    assert.equal(award.zone, award.seat === 1 ? 'ledge' : null, `seat ${award.seat} zone`);
    assert.equal(award.basePoints > 0, award.seat === 1, `seat ${award.seat} trick points`);
  }
  for (const seat of [0, 1, 2, 3]) {
    assert.equal(book(referee, seat).breakdown.offZoneFlights, seat === 1 ? 0 : 1, `seat ${seat}`);
  }
});

test('QA gate: the breakdown still adds exactly to the total with off-zone flights in it', () => {
  const referee = gatedRun(1, { durationSteps: 120000 });
  const zones = [null, 'kicker', null, null, 'ledge', 'kicker', null, 'gap', null, 'gap'];
  const landings = ['clean', 'heavy', 'wobble', 'clean', 'clean', 'wobble', 'heavy', 'clean', 'clean', 'heavy'] as const;
  for (let index = 0; index < zones.length; index += 1) {
    gateFly(referee, {
      flight: index + 1,
      zone: zones[index],
      charge: index % 2 === 0 ? 1 : undefined,
      spin: index % 3 !== 1,
      oneFoot: index % 4 !== 2,
      landing: landings[index],
      rested: index % 3 === 0,
    });
  }
  const state = book(referee);
  assert.equal(breakdownSum(state), state.score, 'the breakdown stopped adding up');
  assert.equal(state.breakdown.total, state.score);
  assert.equal(state.breakdown.offZoneFlights, 5);
  assert.ok(state.score > 0);
});

test('QA gate: featureLaunchRequired is 0 or 1 and nothing else, and it moves the revision', () => {
  for (const value of [2, -1, 0.5, NaN, Infinity]) {
    assert.equal(
      validTrickRules({ ...SHIPPED_TRICK_RULES, featureLaunchRequired: value }),
      false,
      `featureLaunchRequired ${value} was accepted`,
    );
    assert.throws(() => new TrickRun({ ...SHIPPED_TRICK_RULES, featureLaunchRequired: value }));
  }
  assert.equal(validTrickRules({ ...SHIPPED_TRICK_RULES, featureLaunchRequired: 0 }), true);
  assert.equal(validTrickRules({ ...SHIPPED_TRICK_RULES, featureLaunchRequired: 1 }), true);

  // The two rule fields `trickRun.test.ts`'s revision sweep does not carry.
  const base = new TrickRun(SHIPPED_TRICK_RULES).rulesRevision;
  for (const over of [
    { featureLaunchRequired: SHIPPED_TRICK_RULES.featureLaunchRequired === 1 ? 0 : 1 },
    { repeatFadeSeconds: SHIPPED_TRICK_RULES.repeatFadeSeconds + 1 },
  ]) {
    assert.notEqual(
      new TrickRun({ ...SHIPPED_TRICK_RULES, ...over }).rulesRevision,
      base,
      `the revision did not move for ${Object.keys(over)[0]}`,
    );
  }
});

test('QA gate: the shipped table gates, so a best is never filed under an ungated run', () => {
  // The shipped rules, untouched but for the clock — the one probe that fails
  // if `TRICK_RUN.featureLaunchRequired` is ever turned off in the table.
  assert.equal(SHIPPED_TRICK_RULES.featureLaunchRequired, 1);
  const referee = new TrickRun({ ...SHIPPED_TRICK_RULES, durationSteps: 4000 });
  referee.arm(1);
  gateFly(referee, { flight: 1, zone: null, charge: 1, spin: true, oneFoot: true, rested: false });
  const state = book(referee);
  assert.equal(state.score, SHIPPED_TRICK_RULES.cleanLandingPoints,
    'the shipped table paid for tricks launched from nowhere');
  assert.equal(state.breakdown.offZoneFlights, 1);
});

// ---------------------------------------------------------------------------
// Blind pass, 2026-09-14 — the per-FEATURE repeat clocks
//
// Written against the change that replaced the per-kind clocks: one clock per
// launch feature plus one for the flat, `repeatDecay` of the WHOLE flight
// inside `repeatWindowSeconds`, fading a level per `repeatFadeSeconds`. The
// attacks are the ones a camper would run — the reserved key, the bounded map,
// the zero-value flight, the split's arithmetic, and what a feature is worth
// over a whole run however fast it is hopped.
// ---------------------------------------------------------------------------

const FADE_STEPS = Math.round(SHIPPED_TRICK_RULES.repeatFadeSeconds * SIMULATION.hz);

/** One stationary hop from `zone`: 4 steps, the bench's measured bundle. */
function camp(
  referee: TrickRun,
  flight: number,
  zone: string | null,
  opts: { charge?: boolean; landing?: 'clean' | 'heavy' | 'wobble'; bare?: boolean } = {},
): TrickAward | null {
  const charged = opts.charge === true;
  const tricks = opts.bare !== true;
  referee.record(0, facts({
    flightIndex: flight, tookOff: true, hopped: charged, hopCharge: charged ? 1 : 0,
  }), zone);
  referee.step(STEP);
  for (let i = 0; i < 2; i += 1) {
    referee.record(0, facts({ flightIndex: flight, spinCompleted: tricks, oneFootQualified: tricks }));
    referee.step(STEP);
  }
  referee.record(0, facts({
    flightIndex: flight,
    spinCompleted: tricks,
    oneFootQualified: tricks,
    touchedDown: true,
    landingQuality: opts.landing ?? 'clean',
  }));
  return referee.step(STEP).awards[0] ?? null;
}

test('QA repeat: a feature named "off-feature" keeps its own clock', () => {
  // The flat-ground clock has a name, and a venue that happened to use it as a
  // feature id must not hand the camper the flat's clock or the flat the
  // camper's. Nothing shipped names a feature this; that is exactly why a
  // reserved key that is not namespaced rots quietly until a sixth venue.
  const referee = gatedRun(1, { durationSteps: 60000 });
  const feature = camp(referee, 1, 'off-feature');
  const flat = camp(referee, 2, null);
  assert.ok(feature !== null && flat !== null);
  assert.equal(flat.repeated, false, 'a feature id docked the flat ground’s clock');
  assert.equal(flat.points, SHIPPED_TRICK_RULES.cleanLandingPoints);

  // And the other way round: the flat first, then the feature that shares the
  // name, which must still be paid in full.
  const reversed = gatedRun(1, { durationSteps: 60000 });
  camp(reversed, 1, null);
  const second = camp(reversed, 2, 'off-feature');
  assert.ok(second !== null);
  assert.equal(second.repeated, false, 'the flat ground docked a feature’s clock');
  const control = gatedRun(1, { durationSteps: 60000 });
  assert.equal(second.points, camp(control, 1, 'off-feature')?.points);
});

test('QA repeat: the bounded clock map evicts the least recently PAID feature', () => {
  // `MAX_ZONE_CLOCKS` is the guard against a plan naming more zones than the
  // park has. A guard that dropped the *first inserted* clock would drop the
  // clock of the feature being camped on — the one entry it exists to keep.
  const referee = gatedRun(1, { durationSteps: 600000 });
  let flight = 1;
  camp(referee, flight += 1, 'camp');
  for (let i = 0; i < 30; i += 1) camp(referee, flight += 1, `z${i}`);
  const second = camp(referee, flight += 1, 'camp');
  assert.equal(second?.repeated, true);
  // Two fresh features now push the map past its bound. `camp` was paid most
  // recently, so it must survive and must still be docked.
  camp(referee, flight += 1, 'zNew1');
  camp(referee, flight += 1, 'zNew2');
  const third = camp(referee, flight += 1, 'camp');
  assert.equal(third?.repeated, true, 'the camped clock was evicted and paid full value again');
  assert.ok(third !== null && second !== null && third.points < second.points);
});

test('QA repeat: a flight worth nothing loads no clock, on a feature or off it', () => {
  for (const zone of ['ledge', null]) {
    const referee = gatedRun(1, { durationSteps: 60000 });
    // A heavy landing with no tricks on a feature is worth zero: nothing to
    // dock, and nothing to remember.
    const nothing = camp(referee, 1, zone, { landing: 'heavy', bare: true });
    if (zone !== null) assert.equal(nothing, null, 'a zero flight reported an award');
    const real = camp(referee, 2, zone);
    const control = gatedRun(1, { durationSteps: 60000 });
    const full = camp(control, 1, zone);
    assert.ok(real !== null && full !== null);
    assert.equal(real.repeated, false, `a zero-value flight loaded ${zone ?? 'the flat'}’s clock`);
    assert.equal(real.points, full.points);
  }
});

test('QA repeat: the fade gives back exactly one level per rest window', () => {
  const ladder: number[] = [];
  for (const restSteps of [0, FADE_STEPS, FADE_STEPS * 2, FADE_STEPS * 3]) {
    const referee = gatedRun(1, { durationSteps: 600000 });
    let flight = 1;
    const first = camp(referee, flight += 1, 'ledge');
    camp(referee, flight += 1, 'ledge');
    camp(referee, flight += 1, 'ledge');
    idle(referee, restSteps);
    const after = camp(referee, flight += 1, 'ledge');
    assert.ok(first !== null && after !== null);
    ladder.push(after.points / first.points);
  }
  // Three flights in a row leave the run at two repeats; each rest window
  // forgets one, and two of them are full value again.
  assert.deepEqual(ladder.map((value) => Number(value.toFixed(3))), [0.125, 0.5, 1, 1]);
});

test('QA repeat: the award’s split always adds to its points, over a hostile mixed run', () => {
  const referee = gatedRun(1, { durationSteps: 2_000_000 });
  let seed = 987654321;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const zones: (string | null)[] = ['ledge', 'gap', 'kicker', 'off-feature', '', null];
  const landings = ['clean', 'heavy', 'wobble'] as const;
  let awards = 0;
  let repeats = 0;
  for (let index = 0; index < 600; index += 1) {
    const zone = zones[Math.floor(rnd() * zones.length)] ?? null;
    const award = camp(referee, index + 1, zone, {
      charge: rnd() > 0.5,
      landing: landings[Math.floor(rnd() * landings.length)],
    });
    if (award !== null) {
      awards += 1;
      if (award.repeated) repeats += 1;
      assert.equal(award.trickPoints + award.cleanPoints, award.points, `flight ${index}`);
      assert.ok(award.trickPoints >= 0 && award.cleanPoints >= 0 && award.points >= 0, `flight ${index}`);
      assert.ok(Number.isSafeInteger(award.points));
    }
    if (rnd() > 0.8) idle(referee, Math.floor(rnd() * 20000));
  }
  const state = book(referee);
  assert.ok(awards > 400 && repeats > 100, `${awards} awards, ${repeats} repeats`);
  assert.equal(breakdownSum(state), state.score, 'the breakdown stopped adding up');
  assert.ok(state.breakdown.repeatAdjustment <= 0, 'a repeat paid a bonus');
  assert.equal(state.breakdown.repeatedFlights, repeats);
});

test('QA repeat: ONE feature is capped near two full flights a run, at any cadence', () => {
  // The measurement this rule was chosen for, pinned rather than accepted: a
  // camper on one feature banks the geometric sum of the decay, which is two
  // flights' worth however fast they hop — and pacing outside the window
  // reaches the same place rather than beating it.
  const bundle = (): number => {
    const referee = gatedRun(1, { durationSteps: SHIPPED_TRICK_RULES.durationSteps });
    return camp(referee, 1, 'ledge')?.points ?? 0;
  };
  const value = bundle();
  assert.equal(value, 448, 'the stationary bundle moved; re-measure the camping pins');

  const runCadence = (zoneList: (string | null)[], cadenceSteps: number): number => {
    const referee = gatedRun(1, { durationSteps: SHIPPED_TRICK_RULES.durationSteps });
    let flight = 1;
    let step = 0;
    let index = 0;
    while (step + 4 < SHIPPED_TRICK_RULES.durationSteps) {
      camp(referee, flight += 1, zoneList[index % zoneList.length] ?? null);
      index += 1;
      step += 4;
      const rest = Math.max(0, cadenceSteps - 4);
      idle(referee, Math.min(rest, SHIPPED_TRICK_RULES.durationSteps - step));
      step += rest;
    }
    const result = referee.end() ?? referee.result();
    return result?.books[0].score ?? referee.book(0)?.score ?? 0;
  };

  for (const cadence of [60, WINDOW_STEPS - 1, WINDOW_STEPS, WINDOW_STEPS + 1]) {
    const score = runCadence(['ledge'], cadence);
    assert.ok(score <= value * 2, `one feature at cadence ${cadence} banked ${score}`);
  }
});

test('QA repeat: clustered features multiply that cap — the open measurement', () => {
  // **A pin, not a balance acceptance.** Switchback's `skinny` and `stepUp`
  // zones are 1.8 m apart on one straight and `stairs` is on the same corridor,
  // so a camper who shuttles between them holds one clock per feature and banks
  // the single-feature ceiling once per feature. `docs/TRICK_BENCH.md` puts a
  // routed 90 s attempt at 1363-1457. Recorded here so a later scoring decision
  // moves a number a test is watching.
  const value = 448;
  const cap = (zoneList: string[], cadenceSteps: number): number => {
    const referee = gatedRun(1, { durationSteps: SHIPPED_TRICK_RULES.durationSteps });
    let flight = 1;
    let step = 0;
    let index = 0;
    while (step + 4 < SHIPPED_TRICK_RULES.durationSteps) {
      camp(referee, flight += 1, zoneList[index % zoneList.length]);
      index += 1;
      step += 4;
      const rest = Math.max(0, Math.min(cadenceSteps - 4, SHIPPED_TRICK_RULES.durationSteps - step));
      idle(referee, rest);
      step += rest;
    }
    return (referee.end() ?? referee.result())?.books[0].score ?? 0;
  };
  // The ceiling, hopping as fast as the referee can be fed.
  assert.equal(cap(['skinny'], 4), value * 2);
  assert.equal(cap(['skinny', 'stepUp'], 4), value * 4);
  assert.equal(cap(['skinny', 'stepUp', 'stairs'], 4), value * 6);
  // And at a cadence a rider can actually shuttle between those zones at.
  assert.deepEqual(
    [['skinny'], ['skinny', 'stepUp'], ['skinny', 'stepUp', 'stairs']]
      .map((zoneList) => cap(zoneList, Math.round(10.5 * SIMULATION.hz))),
    [895, 1708, 2352],
  );
});

test('QA repeat: the clocks are one seat’s own, and a lap-length gap is never docked', () => {
  // Four on the couch, one feature, one clock each. A guest camping the ledge
  // must not dock the host's first flight off it — and must not be paid full
  // value by the host's.
  const room = new TrickRun(gated({ durationSteps: 600000 }));
  room.arm(4);
  const fly = (seat: number, flight: number, zone: string): TrickAward | null => {
    room.record(seat, facts({ flightIndex: flight, tookOff: true }), zone);
    room.step(STEP);
    for (let i = 0; i < 2; i += 1) {
      room.record(seat, facts({ flightIndex: flight, spinCompleted: true, oneFootQualified: true }));
      room.step(STEP);
    }
    room.record(seat, facts({
      flightIndex: flight, spinCompleted: true, oneFootQualified: true,
      touchedDown: true, landingQuality: 'clean',
    }));
    return room.step(STEP).awards.find((award) => award.seat === seat) ?? null;
  };
  const guestFirst = fly(3, 1, 'ledge');
  const guestRepeat = fly(3, 2, 'ledge');
  const hostFirst = fly(0, 1, 'ledge');
  assert.equal(guestRepeat?.repeated, true);
  assert.equal(hostFirst?.repeated, false, 'a guest’s clock docked the host');
  assert.equal(hostFirst?.points, guestFirst?.points);
  for (const seat of [1, 2]) assert.equal(book(room, seat).score, 0);

  // And the honest case the whole keying exists to protect: a lap that comes
  // back to a feature well after the window pays in full, every lap.
  const lap = gatedRun(1, { durationSteps: 600000 });
  const laps: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const award = camp(lap, index + 1, 'ledge');
    laps.push(award?.points ?? 0);
    idle(lap, Math.round(89 * SIMULATION.hz) - 4);
  }
  assert.equal(new Set(laps).size, 1, `a lap-length revisit was docked: ${laps.join(', ')}`);
  assert.equal(laps[0], 448);
});
