/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { EUC, SIMULATION, TRICKS } from '../data/tuning.ts';
import { SHIPPED_TRICK_RULES, trickRulesRevision } from '../simulation/trickRun.ts';
import { flatFixture } from './featureFixtures.ts';
import { ON_TIME_STEPS, STEP_SECONDS, apexStepsBeforeLip } from './jumpBench.ts';
import { PARK_PLAN, installedFeature, installedFixture } from './installedPark.ts';
import {
  AIR_RAMPS,
  NO_FADE_RULES,
  NO_ZONE_GATE_RULES,
  featuresInLapOrder,
  observeFlights,
  scoringLines,
  FULL_CHARGE_STEPS,
  airFactor,
  banksATrick,
  TRICK_BENCH_WHEEL,
  durationStepsFor,
  fitRecording,
  recordHopLoop,
  recordRide,
  replayTrickRun,
  repeatRecording,
  routedLine,
  scoreRecording,
  stationaryFeatureFixture,
  spliceRecordings,
  syntheticRecording,
  type TrickRecording,
} from './trickRunBench.ts';

/**
 * The Trick Run score bench, pinned — M38 §38.4.
 *
 * **These are pins and controls, not the bench.** `node tools/trick-bench.mjs`
 * rides several hundred attempts and prints every one; this file rides a
 * handful and asserts the things that would make the whole report wrong if they
 * moved — the determinism §38.4 requires, the seat-order independence it
 * requires, the adversarial fact streams it requires, and the one-formula rule
 * that is the reason the bench exists at all.
 *
 * The adversarial fixtures are the only fact streams here that no ride
 * produced, and they are built through `syntheticRecording`, which is labelled
 * `synthetic` for exactly that reason (§38.4: "synthetic fact streams are
 * separate adversarial fixtures").
 */

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The one-formula rule
// ---------------------------------------------------------------------------

test('the bench reads no point value of its own', () => {
  const source = readFileSync(join(here, 'trickRunBench.ts'), 'utf8');
  const tuningImport = source.slice(0, source.indexOf('\n\n'));
  assert.ok(
    tuningImport.includes("from '../data/tuning.ts'"),
    'the bench should import its non-scoring constants from the tuning table',
  );
  assert.ok(
    !/import \{[^}]*\bTRICK_RUN\b[^}]*\} from '\.\.\/data\/tuning\.ts'/.test(source),
    'the bench must never read the TRICK_RUN group directly — points come from the referee',
  );
  // Points reach the bench through the referee's own value object and nowhere
  // else. If this import ever disappears the bench has grown a second formula.
  assert.ok(source.includes("SHIPPED_TRICK_RULES"), 'the bench scores through the shipped rules');
  assert.ok(source.includes("from '../simulation/trickRun.ts'"), 'the referee is the scorer');
});

// ---------------------------------------------------------------------------
// Determinism: the driver and the replay
// ---------------------------------------------------------------------------

function gapRide(id = 'gap-ride') {
  const feature = installedFeature('gap');
  return recordRide(
    id,
    'the straight gap at 15 mph, hop + full, Hop held',
    installedFixture(feature),
    TRICK_BENCH_WHEEL,
    {
      targetMph: 15,
      startMph: 15,
      lipS: feature.lipS,
      hopStepsFromLip: ON_TIME_STEPS,
      charge: 'full',
      holdHop: true,
      maxSteps: 2000,
      rideThroughCrash: true,
    },
  );
}

test('one script rides one recording, twice', () => {
  const first = gapRide();
  const second = gapRide();
  assert.deepEqual(first.recording.steps, second.recording.steps);
  assert.equal(first.steps, second.steps);
  assert.equal(first.takeoffs, second.takeoffs);
  assert.ok(first.steps > 0 && first.steps <= 2000, 'a recording is bounded');
});

test('two replays of one recording produce identical totals, awards and deadline', () => {
  const ride = gapRide();
  const first = scoreRecording(ride.recording);
  const second = scoreRecording(ride.recording);
  assert.deepEqual(first.result, second.result);
  assert.deepEqual(first.awards, second.awards);
  assert.equal(first.steps, second.steps);
  // `scoreRecording` moves only the clock, so the revision differs from the
  // shipped one in exactly that field and in no other.
  assert.equal(
    first.rulesRevision,
    trickRulesRevision({ ...SHIPPED_TRICK_RULES, durationSteps: ride.recording.steps.length }),
  );
  assert.ok(first.scores[0] > 0, 'this ride banks something');
});

test('the real one-foot pose is what qualifies the one-foot air', () => {
  const ride = gapRide();
  assert.ok(ride.oneFootQualifications > 0, 'the gap has air enough for a one-foot');
  const kinds = scoreRecording(ride.recording).awards.flatMap((award) => [...award.kinds]);
  assert.ok(kinds.includes('one-foot-air'), 'and the referee banked it');
  assert.ok(kinds.includes('charged-hop'), 'and the charged hop with it');
});

test('seat order changes which book a score is in and nothing else', () => {
  const left = gapRide('seat-a').recording;
  const right = recordHopLoop(
    'seat-b',
    'standing hop, Hop held',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'none', holdHop: true, steps: durationStepsFor(6) },
  ).recording;

  const rules = { ...SHIPPED_TRICK_RULES, durationSteps: durationStepsFor(6) };
  const forward = replayTrickRun([left, right], rules);
  const reversed = replayTrickRun([right, left], rules);

  assert.equal(forward.scores[0], reversed.scores[1]);
  assert.equal(forward.scores[1], reversed.scores[0]);
  assert.equal(forward.steps, reversed.steps);
  assert.equal(forward.result.completed, reversed.result.completed);
  assert.deepEqual(
    forward.result.books.map((book) => book.breakdown.total).sort(),
    reversed.result.books.map((book) => book.breakdown.total).sort(),
  );
  assert.deepEqual(
    forward.awards.map((award) => award.points).sort(),
    reversed.awards.map((award) => award.points).sort(),
  );
});

// ---------------------------------------------------------------------------
// Adversarial replay controls (§38.4)
// ---------------------------------------------------------------------------

test('a fabricated touchdown with no takeoff banks nothing', () => {
  const fabricated = syntheticRecording('fabricated', 'every flag true, no takeoff', [
    { flightIndex: 7, touchedDown: true, landingQuality: 'clean', spinCompleted: true, oneFootQualified: true },
    { flightIndex: 7, touchedDown: true, landingQuality: 'clean', spinCompleted: true, oneFootQualified: true },
    { flightIndex: 7, hopped: true, hopCharge: 1, touchedDown: true, landingQuality: 'clean' },
  ]);
  const replay = scoreRecording(fabricated);
  assert.equal(replay.scores[0], 0);
  assert.equal(replay.awards.length, 0);
  assert.equal(replay.result.books[0].flights, 0);
});

test('a duplicated landing step banks once', () => {
  const landed = syntheticRecording('duplicate-landing', 'one flight, its touchdown repeated', [
    { flightIndex: 3, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 3 },
    { flightIndex: 3, touchedDown: true, landingQuality: 'clean' },
    { flightIndex: 3, touchedDown: true, landingQuality: 'clean' },
    { flightIndex: 3, touchedDown: true, landingQuality: 'clean' },
  ]);
  const replay = scoreRecording(landed);
  assert.equal(replay.awards.length, 1);
  const award = replay.awards[0];
  assert.deepEqual([...award.kinds], ['charged-hop']);
  assert.equal(award.landing, 'clean');
  assert.equal(
    replay.scores[0],
    award.points,
    'the repeats have no open flight to bank against',
  );
});

test('a stale flight identity cannot land the flight it did not fly', () => {
  const stale = syntheticRecording('stale-identity', 'takeoff on 3, touchdown on 4', [
    { flightIndex: 3, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 4, touchedDown: true, landingQuality: 'clean' },
  ]);
  const replay = scoreRecording(stale);
  assert.equal(replay.scores[0], 0);
  assert.equal(replay.result.books[0].breakdown.chargedHopsForfeited, 1);
});

test('a crash forfeits the pending flight and keeps what was banked', () => {
  // Both flights launch from a named zone, because q189 pays no trick to a
  // flight that launched from nowhere and this control is about the crash.
  // The off-zone half of the gate has its own control below.
  const crashing = syntheticRecording('crash', 'one flight banked, the next one binned', [
    { flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 1, touchedDown: true, landingQuality: 'clean' },
    { flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 2, spinCompleted: true },
    { flightIndex: 2, touchedDown: true, landingQuality: 'crash', crashed: true },
  ], ['kicker', null, 'kicker', null, null]);
  const replay = scoreRecording(crashing);
  assert.equal(replay.awards.length, 1);
  assert.equal(
    replay.scores[0],
    SHIPPED_TRICK_RULES.cleanLandingPoints
      + Math.round(SHIPPED_TRICK_RULES.chargedHopPoints * SHIPPED_TRICK_RULES.cleanMultiplier),
  );
  assert.equal(replay.result.books[0].crashes, 1);
  assert.equal(replay.result.books[0].breakdown.chargedHopsForfeited, 1);
});

test('a flight that launched from no zone is paid its landing and nothing else', () => {
  // q189, as the referee's own switch tells it: the same fabricated flight
  // with a zone and without one. `featureLaunchRequired: 0` is the referee's
  // documented reproduction of the behaviour before the owner's decision.
  const steps = [
    { flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 1, spinCompleted: true, oneFootQualified: true },
    { flightIndex: 1, touchedDown: true, landingQuality: 'clean' as const },
  ];
  const onZone = syntheticRecording('on-zone', 'launched from the kicker', steps,
    ['kicker', null, null]);
  const offZone = syntheticRecording('off-zone', 'launched from nowhere', steps);

  // (25 + 200 + 100 + 50) × 1.25 = 468.75, rounded once to 469, plus the clean 10.
  const banked = scoreRecording(onZone);
  assert.equal(banked.scores[0], 479);
  assert.equal(banked.awards[0].zone, 'kicker');
  assert.equal(banked.result.books[0].breakdown.offZoneFlights, 0);

  const gated = scoreRecording(offZone);
  assert.equal(gated.scores[0], SHIPPED_TRICK_RULES.cleanLandingPoints);
  assert.equal(gated.awards[0].zone, null);
  assert.deepEqual([...gated.awards[0].kinds], ['charged-hop', 'spin-landed', 'one-foot-air'],
    'the kinds are still named so the screen can say what happened');
  assert.equal(gated.result.books[0].breakdown.offZoneFlights, 1);

  const ungated = replayTrickRun([offZone], {
    ...NO_ZONE_GATE_RULES,
    durationSteps: offZone.steps.length,
  });
  assert.equal(ungated.scores[0], 479, 'and the gate is the whole of the difference');
});

test('the repeat clock is keyed per launch feature, not per trick kind', () => {
  // The owner's 2026-09-14 decision, as the smallest control that can see it:
  // the same two flights, a second apart, from two different features and
  // then twice from one. Different features load different clocks, so both
  // pay in full; the same feature twice is a repeat of the WHOLE flight.
  const flight = (index: number) => [
    { flightIndex: index, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: index, spinCompleted: true, oneFootQualified: true },
    { flightIndex: index, touchedDown: true, landingQuality: 'clean' as const },
  ];
  const pair = (first: string, second: string) => syntheticRecording(
    `${first}-${second}`,
    `a flight from ${first}, then one from ${second}`,
    [...flight(1), ...flight(2)],
    [first, null, null, second, null, null],
  );

  const different = scoreRecording(pair('ledge', 'kicker'));
  assert.deepEqual(different.awards.map((award) => award.points), [479, 479],
    'two features, two clocks, both paid in full');
  assert.deepEqual(different.awards.map((award) => award.zone), ['ledge', 'kicker']);
  assert.equal(different.result.books[0].breakdown.repeatAdjustment, 0);

  const same = scoreRecording(pair('ledge', 'ledge'));
  // The whole flight is halved now — tricks, bonus and the clean landing
  // together — rather than each kind on its own clock.
  assert.deepEqual(same.awards.map((award) => award.points), [479, 240]);
  assert.equal(same.awards[1].repeated, true);
  assert.equal(same.result.books[0].breakdown.repeatedFlights, 1);
  assert.equal(same.result.books[0].breakdown.repeatAdjustment, 240 - 479);

  assert.ok(same.rulesRevision.startsWith('m38b/'),
    'the per-feature clocks carry their own rules revision');
});

test('a reset discards the flight it interrupts and is not a crash', () => {
  const reset = syntheticRecording('reset', 'a flight interrupted by a respawn', [
    { flightIndex: 1, tookOff: true, hopped: true, hopCharge: 1 },
    { flightIndex: 1, reset: true },
    { flightIndex: 1, touchedDown: true, landingQuality: 'clean' },
  ]);
  const replay = scoreRecording(reset);
  assert.equal(replay.scores[0], 0);
  assert.equal(replay.result.books[0].crashes, 0);
  assert.equal(replay.result.books[0].breakdown.chargedHopsForfeited, 1);
});

test('an alternate rules object changes the totals and not the events', () => {
  const ride = gapRide();
  const shipped = scoreRecording(ride.recording);
  const doubled = scoreRecording(ride.recording, {
    ...SHIPPED_TRICK_RULES,
    oneFootAirPoints: SHIPPED_TRICK_RULES.oneFootAirPoints * 2,
  });
  assert.notEqual(shipped.rulesRevision, doubled.rulesRevision);
  assert.ok(doubled.scores[0] > shipped.scores[0], 'a bigger value banks more');
  assert.deepEqual(
    { ...shipped.result.books[0].tally },
    { ...doubled.result.books[0].tally },
    'the observer counted the same things either way',
  );
  assert.deepEqual(
    shipped.awards.map((award) => [...award.kinds]),
    doubled.awards.map((award) => [...award.kinds]),
  );
});

// ---------------------------------------------------------------------------
// Splicing
// ---------------------------------------------------------------------------

test('a splice renumbers flight identity and never repeats one', () => {
  const ride = gapRide();
  const twice = repeatRecording('gap-twice', 'the gap, twice', ride.recording, 2, 60);
  const seen = new Set<number>();
  let previous = -Infinity;
  for (const step of twice.steps) {
    if (step.tookOff) {
      assert.ok(!seen.has(step.flightIndex), 'a spliced attempt cannot reuse a flight name');
      seen.add(step.flightIndex);
    }
    assert.ok(step.flightIndex >= previous, 'flight identity counts up across a seam');
    previous = step.flightIndex;
  }
  assert.equal(twice.source, 'spliced');
  assert.equal(twice.steps.length, ride.recording.steps.length * 2 + 120);

  // **Two attempts no longer bank twice one, and that is q185's rule working.**
  // The second copy lands the same kinds 0.5 s after the first, which is well
  // inside `TRICK_RUN.repeatWindowSeconds`, so the referee pays it a fraction.
  // Pushed past the window it pays in full again, which is the other half of
  // the rule and the control that says the splice itself changed nothing.
  const once = scoreRecording(ride.recording).scores[0];
  const close = scoreRecording(twice).scores[0];
  assert.ok(close > once, 'the second attempt still banks something');
  assert.ok(close < once * 2, 'and less than full value, because it repeated');

  const apart = repeatRecording(
    'gap-twice-apart',
    'the gap, twice, a window apart',
    ride.recording,
    2,
    durationStepsFor(SHIPPED_TRICK_RULES.repeatWindowSeconds),
  );
  assert.equal(
    scoreRecording(apart).scores[0],
    once * 2,
    'outside the window a repeat pays in full and resets its run',
  );
});

test('fitting a recording to a clock cuts or pads it and never invents a flight', () => {
  const ride = gapRide();
  const short: TrickRecording = fitRecording(ride.recording, 30);
  assert.equal(short.steps.length, 30);
  const long = fitRecording(ride.recording, ride.recording.steps.length + 50);
  assert.equal(long.steps.length, ride.recording.steps.length + 50);
  for (const step of long.steps.slice(ride.recording.steps.length)) {
    assert.equal(step.tookOff, false);
    assert.equal(step.touchedDown, false);
    assert.equal(step.crashed, false);
    assert.equal(step.reset, false);
  }
  const spliced = spliceRecordings('empty', 'nothing at all', []);
  assert.equal(spliced.steps.length, 0);
  assert.equal(scoreRecording(spliced).scores[0], 0);
});

// ---------------------------------------------------------------------------
// The measured pins the report turns on
// ---------------------------------------------------------------------------

test('a full charge costs the grounded steps the tuning table says it does', () => {
  assert.equal(
    FULL_CHARGE_STEPS,
    Math.ceil((0.40 * TRICKS.chargedHopMinCharge) / STEP_SECONDS) + 1,
  );
  const plain = recordHopLoop(
    'pin-plain',
    'standing hop',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'none', holdHop: false, steps: durationStepsFor(10) },
  );
  const charged = recordHopLoop(
    'pin-charged',
    'standing charged hop',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'full', holdHop: false, steps: durationStepsFor(10) },
  );
  assert.equal(plain.takeoffGaps[0], 84, 'the standing hop cadence is 0.70 s');
  assert.equal(charged.takeoffGaps[0], 143, 'the charged standing hop cadence is 1.19 s');
  assert.equal(charged.chargedHops, charged.takeoffs, 'every charged launch latched a full charge');
  assert.equal(plain.chargedHops, 0, 'and an uncharged one latched none');
});

test('standing still is a scoring line, and the referee says what it is worth', () => {
  // §38.8 Phase 0's q185 flag, as a control: a rider who never moves banks a
  // 180 and a one-foot air on every hop. The number is the referee's.
  const steps = durationStepsFor(10);
  const ride = recordHopLoop(
    'pin-everything',
    'standing hop, 180 then re-hold',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'none', holdHop: true, spinTap: 'left', steps },
  );
  const replay = replayTrickRun([ride.recording], { ...SHIPPED_TRICK_RULES, durationSteps: steps });
  const book = replay.result.books[0];
  assert.ok(book.tally.spinsLanded > 10, 'every hop lands its 180');
  assert.ok(book.tally.oneFootAirs > 10, 'and its one-foot air');
  assert.equal(book.crashes, 0);

  // **Standing still on flat ground banks clean landings and nothing else** —
  // q189. The rider never leaves a trick zone, because flat ground has none,
  // so every flight is off-zone: the kinds are counted and named and the
  // tricks are paid nothing. What is left is the clean-landing award, which
  // the repeat window then halves flight by flight.
  for (const zone of ride.recording.zones) assert.equal(zone, null);
  assert.deepEqual(
    replay.awards.map((award) => award.points),
    [10, 5, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  for (const award of replay.awards) assert.equal(award.zone, null);
  assert.equal(replay.scores[0], 20);
  assert.equal(book.breakdown.offZoneFlights, 14);
  assert.equal(book.breakdown.repeatAdjustment, -120);
  assert.ok(book.breakdown.repeatAdjustment < 0, 'the adjustment is never positive');

  // With the gate off — the referee's own switch — the same ten seconds is the
  // 448-per-flight spam the two repeat rules were answering, and with the
  // repeat window off too it is the 6,272 that started all of this.
  const ungated = replayTrickRun([ride.recording], {
    ...NO_ZONE_GATE_RULES,
    durationSteps: steps,
  });
  assert.deepEqual(
    ungated.awards.map((award) => award.points),
    [448, 224, 112, 56, 28, 14, 7, 4, 2, 1, 0, 0, 0, 0],
  );
  assert.equal(ungated.scores[0], 896);
  const unchecked = replayTrickRun([ride.recording], {
    ...NO_ZONE_GATE_RULES,
    repeatWindowSeconds: 0,
    durationSteps: steps,
  });
  assert.equal(unchecked.scores[0], ungated.awards.length * 448);
});

test('the repeat run fades with rest, and a paced hopper pays full value for ever', () => {
  // The owner's second q185 decision, 2026-09-13, measured through the bench.
  // `repeatFadeSeconds` is not a value this file reads: the two totals below
  // come out of the referee, once with the shipped table and once with its own
  // documented `repeatFadeSeconds: 0` reproduction of the old reset behaviour.
  const steps = durationStepsFor(90);
  const lines = scoringLines();

  // **The fade is measured with q189's gate held off**, because both lines
  // stand on flat ground and the gate alone would answer them — which is the
  // point of having three switches rather than one number.
  const rest = lines.find((line) => line.id === 'rest-farm-everything');
  assert.ok(rest !== undefined, 'the rest-cycled standing line is measured');
  const restFitted = fitRecording(rest.recording, steps);
  const faded = replayTrickRun([restFitted], { ...NO_ZONE_GATE_RULES, durationSteps: steps });
  const reset = replayTrickRun([restFitted], {
    ...NO_ZONE_GATE_RULES,
    repeatFadeSeconds: 0,
    durationSteps: steps,
  });
  assert.equal(reset.scores[0], 1736, 'bursting and resting beat the window alone');
  assert.equal(faded.scores[0], 977, 'and the fade takes some of it back');
  assert.ok(faded.result.books[0].breakdown.repeatAdjustment
    < reset.result.books[0].breakdown.repeatAdjustment);

  const pacedLine = lines.find((line) => line.id === 'paced-window');
  assert.ok(pacedLine !== undefined, 'the paced hopper is measured');
  const pacedFitted = fitRecording(pacedLine.recording, steps);
  const paced = replayTrickRun([pacedFitted], { ...NO_ZONE_GATE_RULES, durationSteps: steps });
  // One window plus half a second of rest fades the run back to zero before the
  // next landing, and a landing outside the window pays `decay ** fadedRun` —
  // which is `decay ** 0`. Every flight is worth the full 448, and the fade
  // takes nothing: this was the residual q189 was decided on.
  assert.equal(paced.result.books[0].breakdown.repeatAdjustment, 0);
  assert.equal(paced.result.books[0].breakdown.repeatedFlights, 0);
  assert.deepEqual(paced.awards.map((award) => award.points), [448, 448]);
  assert.equal(paced.scores[0], 896);
  assert.equal(
    replayTrickRun([pacedFitted], { ...NO_FADE_RULES, durationSteps: steps }).scores[0],
    20,
    'and with the gate on it is two clean landings, which is the whole of q189',
  );
});

test('stationary farming coverage includes real feature zones and simulated rest', () => {
  for (const zone of PARK_PLAN.trickZones ?? []) {
    const fixture = stationaryFeatureFixture(zone.id);
    assert.equal(fixture.plan, PARK_PLAN, 'use the installed park, not a flat substitute');
    const ride = recordHopLoop(`camp-${zone.id}`, 'camping probe', fixture,
      TRICK_BENCH_WHEEL,
      { charge: 'none', holdHop: true, spinTap: 'left', steps: durationStepsFor(2) });
    assert.equal(ride.maxDisplacementMetres, 0);
    assert.equal(ride.crashed, false);
    assert.ok(ride.takeoffs >= 2, `${zone.id}: the controller must actually hop`);
    const launches = ride.recording.zones.filter((_, step) => ride.recording.steps[step].tookOff);
    assert.ok(launches.every((id) => id === zone.id), `${zone.id}: every launch is inside the feature`);
  }
  const lines = scoringLines();
  const paced = lines.find((line) => line.id === 'feature-camp-paced');
  const continuous = lines.find((line) => line.id === 'feature-camp-continuous');
  assert.ok(paced && continuous, 'the published balance tables must include both feature-camping attacks');
  assert.equal(paced.recording.source, 'ride', 'rest must run the controller, not splice in a fresh rider');
  const marks = paced.recording.steps.flatMap((facts, step) => facts.tookOff ? [step] : []);
  // `repeatWindowSeconds` is 60 s since 2026-09-14, so the paced camp's
  // interval is 60.5 s and a 120 s recording holds two launches, not ten.
  assert.ok(marks.length >= 2, 'the paced camp launches more than once');
  const interval = Math.round((SHIPPED_TRICK_RULES.repeatWindowSeconds + 0.5) * SIMULATION.hz);
  const compression = Math.ceil(EUC.hopCompressSeconds * SIMULATION.hz);
  assert.ok(marks.slice(1).every((step, index) => step - marks[index] === interval + compression),
    'the idle interval is followed by the real controller\'s hop compression');
  assert.ok(paced.recording.zones.filter((_, step) => paced.recording.steps[step].tookOff)
    .every((id) => id === 'ledge'), 'rest cannot move the farmer outside the gate');
});

test('every routed feature banks from a zone, and flat-fixture standing flights have none', () => {
  // The q189 control, and it is a control on the LEVEL rather than on the
  // referee: nothing in this bench tells a recording which feature its script
  // was aiming at. The zone on every takeoff is
  // `trickZoneAt(plan.trickZones, x, z)` at the contact patch the wheel left
  // the ground from, so a zone that was drawn in the wrong place would show up
  // here as a feature that cannot bank a trick.
  const zoneIds = new Set((PARK_PLAN.trickZones ?? []).map((zone) => zone.id));
  assert.equal(zoneIds.size, 9, 'the park carries one zone per feature');

  for (const feature of featuresInLapOrder()) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const ride = recordRide(
      `zone-${feature.id}`,
      feature.label,
      installedFixture(feature),
      TRICK_BENCH_WHEEL,
      {
        targetMph: mph,
        startMph: mph,
        lipS: feature.lipS,
        hopStepsFromLip: feature.press === 'apex' ? apexStepsBeforeLip('full') : ON_TIME_STEPS,
        charge: 'full',
        holdHop: true,
        maxSteps: 4000,
        rideThroughCrash: true,
      },
    );
    const launches = ride.recording.zones.filter(
      (_, index) => ride.recording.steps[index].tookOff,
    );
    assert.ok(launches.length > 0, `${feature.id} left the ground`);
    const replay = scoreRecording(ride.recording);
    const tricked = replay.awards.filter((award) => award.kinds.length > 0);
    assert.ok(tricked.length > 0, `${feature.id} banks a trick`);

    // **All nine, with no exception.** The two features the rider MOUNTS —
    // the skinny and the step-up — used to launch outside their own zone,
    // because the hop that gets them on top of the deck leaves the approach
    // corridor and the zone was drawn over the deck alone. The level builder
    // extended both zones back over their run-up, and this is the measurement
    // that says so: nothing here was relaxed to accommodate them.
    assert.equal(tricked[0].zone, feature.id,
      `${feature.id} banks its first trick from its own zone`);
    assert.equal(replay.result.books[0].breakdown.offZoneFlights, 0,
      `${feature.id} has no off-zone trick flight`);
    for (const zone of launches) {
      if (zone !== null) assert.ok(zoneIds.has(zone), `${zone} is a zone the plan carries`);
    }
  }

  const standing = recordHopLoop(
    'zone-standing',
    'standing hop, Hop held',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'full', holdHop: true, spinTap: 'left', steps: durationStepsFor(8) },
  );
  assert.ok(standing.takeoffs > 0);
  for (const zone of standing.recording.zones) assert.equal(zone, null);
  const standingReplay = scoreRecording(standing.recording);
  assert.equal(
    standingReplay.result.books[0].breakdown.offZoneFlights,
    standingReplay.awards.length,
    'every standing flight that named a trick was off-zone',
  );
});

test('air time is read off a second observer and separates nothing cleanly', () => {
  // S8's two load-bearing numbers, and the reason the answer to an air-time
  // gate is "only partly". Read-only: a second `TrickObserver` on the same
  // recordings, no referee and no rule involved.
  const charged = recordHopLoop(
    'air-charged',
    'standing charged hop, Hop held',
    flatFixture('pavement', 400),
    TRICK_BENCH_WHEEL,
    { charge: 'full', holdHop: true, steps: durationStepsFor(8) },
  );
  const standing = observeFlights(charged.recording).filter(banksATrick);
  assert.ok(standing.length > 0);
  for (const flight of standing) {
    assert.equal(flight.airSeconds.toFixed(3), '0.717', 'the flat-ground ceiling');
  }

  const feature = installedFeature('stepUp');
  const mounted = recordRide(
    'air-stepup',
    'the charged step-up at 8 mph, Hop held',
    installedFixture(feature),
    TRICK_BENCH_WHEEL,
    {
      targetMph: 8,
      startMph: 8,
      lipS: feature.lipS,
      hopStepsFromLip: 30,
      charge: 'full',
      holdHop: true,
      maxSteps: 2000,
      rideThroughCrash: true,
    },
  );
  const tricked = observeFlights(mounted.recording).filter(banksATrick);
  assert.ok(tricked.length > 0, 'the step-up banks a trick');
  assert.ok(
    Math.min(...tricked.map((flight) => flight.airSeconds)) < 0.717,
    'and does it on less air than a standing charged hop, which is why no clean threshold exists',
  );

  for (const ramp of AIR_RAMPS) {
    assert.equal(airFactor(ramp.t0 - 1, ramp), 0);
    assert.equal(airFactor(ramp.t1 + 1, ramp), 1);
    assert.ok(airFactor((ramp.t0 + ramp.t1) / 2, ramp) > 0.49);
  }
});

test('the routed line is a lap of measured legs that each rode on', () => {
  const legs = routedLine('rate');
  assert.ok(legs.length >= 8, 'a routed lap visits most of the park');
  for (const leg of legs) {
    assert.ok(leg.attempt.ride.reachedEnd, 'a leg of a lap reaches its merge');
    assert.equal(leg.attempt.ride.endsAirborne, false, 'and lands before the seam');
    assert.equal(leg.attempt.recipe.spinTap, undefined, 'a 180 exits fakie and is not a leg');
    assert.ok(leg.connectiveSteps >= 0);
  }
  const lapSteps = legs.reduce(
    (total, leg) => total + leg.attempt.ride.steps + leg.connectiveSteps,
    0,
  );
  assert.ok(
    lapSteps > durationStepsFor(60),
    'a full technical lap does not fit inside the 60 s candidate',
  );
  assert.equal(SIMULATION.hz, 120, 'the candidates are counted in 120 Hz steps');
});
