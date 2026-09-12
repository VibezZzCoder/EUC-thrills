/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TRACK_DAY } from '../data/tuning.ts';
import { LapEnvelope, TrackDayRun } from '../simulation/trackDay.ts';
import { RaceRun } from '../simulation/raceRun.ts';
import {
  LAP_DECK,
  LAP_HALF_WIDTH,
  LAP_RADIUS,
  LAP_STRAIGHT,
  dropFixture,
  flatFixture,
  gapFixture,
  lapFixture,
  lipFixture,
  parallelLegs,
  runupFor,
  spinPadFixture,
  stairsFixture,
  stepUpFixture,
} from './featureFixtures.ts';
import {
  GAP_STEP_DOWN,
  ON_TIME_STEPS,
  apexStepsBeforeLip,
  lapChecks,
  runTrial,
  stepUpLimit,
  type BenchCharge,
  type BenchWheel,
  type TrialResult,
} from './jumpBench.ts';
import {
  INSTALLED_FEATURES,
  installedFeature,
  installedFixture,
  lapDistance,
  lapFrame,
  poseAt,
  reverseFixture,
} from './installedPark.ts';
import { tableBigJump, tableInstalledMisses, tableParkWindows, tableTabletopFaces } from './installedTables.ts';

/**
 * The jump bench, pinned — M36 Phase 0.
 *
 * **These are pins, not the bench.** `node tools/jump-bench.mjs` rides eight
 * hundred trials and prints every one; this file rides about thirty and asserts
 * the handful of numbers that would make the whole report wrong if they moved.
 * The division is `AGENTS.md`'s "match the verification to the size of the
 * change": a controller edit that shifts the hop must fail here in seconds
 * rather than be noticed in a table nobody regenerated.
 *
 * The first group is the one that matters most. §36.2a published measurements
 * with no saved fixture, and §36.8 Phase 0's first instruction is to reproduce
 * them. If these pass, the bench is measuring what the plan measured; if they
 * fail, either the controller changed or the bench is not the same instrument,
 * and both are worth stopping for.
 */

// ---------------------------------------------------------------------------
// §36.2a, reproduced
// ---------------------------------------------------------------------------

function flatHop(triggerMph: number, charge: 'none' | 'full'): TrialResult {
  return runTrial(flatFixture('pavement'), 'shipped65', {
    targetMph: triggerMph,
    lipS: null,
    hop: 'atSpeed',
    charge,
    maxSteps: 2600,
  });
}

test('§36.2a: the flat hop apex, uncharged and charged', () => {
  const uncharged = flatHop(20, 'none');
  const charged = flatHop(20, 'full');

  assert.ok(
    Math.abs(uncharged.apexMetres - 0.4463) < 0.005,
    `uncharged apex ${uncharged.apexMetres.toFixed(4)} m, §36.2a measured 0.4463`,
  );
  assert.ok(
    Math.abs(charged.apexMetres - 0.6275) < 0.005,
    `charged apex ${charged.apexMetres.toFixed(4)} m, §36.2a measured 0.6275`,
  );
  // The apex is a property of the impulse alone, so it must not move with the
  // trigger speed. That is the claim §36.2a's single apex line makes.
  assert.ok(
    Math.abs(flatHop(50, 'none').apexMetres - uncharged.apexMetres) < 1e-9,
    'the uncharged apex moved with the trigger speed',
  );
});

test('§36.2a: the flat hop distances and times at 20 and 40 mph', () => {
  // The distance is the one that depends on the takeoff speed, and §36.2a's
  // takeoff speeds are ABOVE its triggers — 21.025 mph at a 20 mph trigger —
  // because the lean the throttle asked for is still being spent through the
  // 0.09 s compression after the throttle is released. A protocol that pressed
  // and stopped driving in the same instant would take off slower and travel
  // less far, so reproducing the distance is also a check on the protocol.
  const twenty = flatHop(20, 'none');
  assert.ok(
    Math.abs(twenty.takeoffMph - 21.025) < 0.01,
    `takeoff ${twenty.takeoffMph.toFixed(3)} mph, §36.2a measured 21.025`,
  );
  assert.ok(
    Math.abs(twenty.flightMetres - 5.614) < 0.08,
    `20 mph uncharged distance ${twenty.flightMetres.toFixed(3)} m, §36.2a measured 5.614`,
  );
  assert.ok(
    Math.abs(twenty.flightSeconds - 0.608) < 0.005,
    `uncharged time ${twenty.flightSeconds.toFixed(4)} s, §36.2a measured 0.608`,
  );

  const forty = flatHop(40, 'none');
  assert.ok(
    Math.abs(forty.flightMetres - 10.774) < 0.08,
    `40 mph uncharged distance ${forty.flightMetres.toFixed(3)} m, §36.2a measured 10.774`,
  );

  const charged = flatHop(20, 'full');
  assert.ok(
    Math.abs(charged.flightSeconds - 0.717) < 0.005,
    `charged time ${charged.flightSeconds.toFixed(4)} s, §36.2a measured 0.717`,
  );
  assert.ok(
    Math.abs(charged.flightMetres - 6.623) < 0.08,
    `20 mph charged distance ${charged.flightMetres.toFixed(3)} m, §36.2a measured 6.623`,
  );
});

test('§36.2a: the drop-only table, flat wood and flat dirt', () => {
  const drop = (height: number, surface: 'wood' | 'dirt'): TrialResult => {
    const fixture = dropFixture({ drop: height, landingSurface: surface, landingGrade: 0 });
    return runTrial(fixture, 'shipped65', {
      targetMph: 15,
      lipS: fixture.lipS,
      hop: 'none',
      charge: 'none',
      maxSteps: 2600,
    });
  };

  const small = drop(0.30, 'wood');
  assert.equal(small.landingTier, 'clean');
  assert.ok(Math.abs(small.landingScore - 0.5655) < 0.01, `0.30 m wood scored ${small.landingScore}`);

  const large = drop(1.05, 'wood');
  assert.equal(large.landingTier, 'clean', 'the 1.05 m wood landing is clean with almost no margin');
  assert.ok(Math.abs(large.landingScore - 0.9906) < 0.01, `1.05 m wood scored ${large.landingScore}`);

  const heavy = drop(1.20, 'wood');
  assert.equal(heavy.landingTier, 'heavy');
  assert.ok(Math.abs(heavy.landingScore - 1.0397) < 0.01, `1.20 m wood scored ${heavy.landingScore}`);

  // The dirt column's whole point: the same fall, one tier worse, because the
  // surface term is 0.30 × roughness / 0.040 and dirt buys 0.195 of it.
  const dirt = drop(1.05, 'dirt');
  assert.equal(dirt.landingTier, 'heavy', `1.05 m dirt scored ${dirt.landingScore}`);
  assert.ok(Math.abs(dirt.landingScore - 1.1106) < 0.01, `1.05 m dirt scored ${dirt.landingScore}`);
});

test('a trial is deterministic: two identical runs are deepEqual', () => {
  const fixture = dropFixture({ drop: 0.80, landingSurface: 'dirt', landingGrade: -0.10 });
  const script = {
    targetMph: 18,
    lipS: fixture.lipS,
    hop: { stepsFromLip: ON_TIME_STEPS },
    charge: 'full' as const,
    spinTap: 'right' as const,
    maxSteps: 2600,
  };
  assert.deepEqual(
    runTrial(fixture, 'shipped65', script),
    runTrial(fixture, 'shipped65', script),
  );
  // And on the other preset, which writes tuning through `topSpeedPreset`.
  assert.deepEqual(
    runTrial(fixture, 'diagnostic50', script),
    runTrial(fixture, 'diagnostic50', script),
  );
});

// ---------------------------------------------------------------------------
// §36.2 item 3 — a face launches, a smooth hill does not
// ---------------------------------------------------------------------------

test('an authored 0.10 m lip launches at every speed from 8 to 35 mph', () => {
  for (const speed of [8, 15, 25, 35]) {
    const fixture = lipFixture({ lipHeight: 0.10, landingGrade: -0.18, runup: runupFor(speed) });
    assert.ok(
      Math.abs(fixture.dropAtLip - 0.10) < 1e-9,
      `the fixture authored a ${fixture.dropAtLip} m face, not 0.10`,
    );
    const result = runTrial(fixture, 'shipped65', {
      targetMph: speed,
      lipS: fixture.lipS,
      hop: 'none',
      charge: 'none',
      maxSteps: 3400,
    });
    assert.equal(result.launched, 'drop', `${speed} mph over a 0.10 m lip did not launch`);
    assert.ok(result.flightSeconds > 0.2, `${speed} mph flight was only ${result.flightSeconds} s`);
  }
});

test('the smooth side of the same crest never launches, up to 58 mph', () => {
  for (const speed of [8, 15, 25, 35, 45, 58]) {
    const fixture = lipFixture({
      lipHeight: 0, landingGrade: -0.18, smoothSide: true, runup: runupFor(speed),
    });
    const result = runTrial(fixture, 'shipped65', {
      targetMph: speed,
      lipS: fixture.lipS,
      hop: 'none',
      charge: 'none',
      maxSteps: 3400,
    });
    assert.equal(result.launched, 'none', `the bypass launched at ${speed} mph`);
    assert.equal(result.landings.length, 0, `the bypass touched down at ${speed} mph`);
  }
});

// ---------------------------------------------------------------------------
// §36.4 — the charged step-up
// ---------------------------------------------------------------------------

function stepUp(rise: number, speed: number, charge: 'none' | 'full'): TrialResult {
  const fixture = stepUpFixture({ rise });
  return runTrial(fixture, 'shipped65', {
    targetMph: speed,
    lipS: fixture.lipS,
    hop: { stepsFromLip: apexStepsBeforeLip(charge) },
    charge,
    maxSteps: 2600,
  });
}

test('a 0.50 m step-up needs the charge: mounted charged, bonked uncharged', () => {
  const charged = stepUp(0.50, 12, 'full');
  assert.equal(charged.landedOn, 'deck', 'a full charge did not reach the 0.50 m shelf');
  assert.equal(charged.blockedSteps, 0, 'a clean mount touched the face');

  const uncharged = stepUp(0.50, 12, 'none');
  assert.notEqual(uncharged.landedOn, 'deck', 'an uncharged hop mounted a 0.50 m face');
  assert.ok(uncharged.blockedSteps > 0, 'the refusal at the face left no `blocked` steps');
});

test('a 0.65 m step-up is refused even fully charged', () => {
  const charged = stepUp(0.65, 12, 'full');
  assert.notEqual(charged.landedOn, 'deck', 'a 0.65 m face was mounted, above the charged apex');
  assert.ok(charged.blockedSteps > 0);
});

// ---------------------------------------------------------------------------
// §36.4 — the straight gap's passing interval
// ---------------------------------------------------------------------------

test('a 3.0 m gap passes at 15 and 20 mph uncharged and fails at 10', () => {
  const fixture = gapFixture({ gap: 3, stepDown: GAP_STEP_DOWN });
  const cross = (speed: number): TrialResult => runTrial(fixture, 'shipped65', {
    targetMph: speed,
    lipS: fixture.lipS,
    hop: { stepsFromLip: ON_TIME_STEPS },
    charge: 'none',
    maxSteps: 2600,
  });

  for (const speed of [15, 20]) {
    const result = cross(speed);
    assert.equal(result.landedOn, 'deck', `${speed} mph fell into the 3.0 m gap`);
    assert.equal(result.crashed, false);
  }
  const slow = cross(10);
  assert.equal(slow.landedOn, 'catch', '10 mph cleared a 3.0 m gap it should have fallen into');
  // The recovery line is the point: coming up short is a fall onto rideable
  // catch ground, not a reset (§36.3).
  assert.equal(slow.crashed, false, 'the catch ground crashed a rider who came up short');
});

// ---------------------------------------------------------------------------
// §36.4 — the down staircase
// ---------------------------------------------------------------------------

test('the staircase is ridden tread by tread at 10 mph, and survives 25', () => {
  const fixture = stairsFixture();
  const ride = (speed: number): TrialResult => runTrial(fixture, 'shipped65', {
    targetMph: speed,
    lipS: fixture.lipS,
    hop: 'none',
    charge: 'none',
    holdThrottle: true,
    coastSteps: 4000,
    maxSteps: 3400,
  });

  const slow = ride(10);
  assert.equal(slow.crashed, false, `10 mph crashed: ${slow.crashCause}`);
  assert.equal(slow.landings.length, 3, 'three treads should give three distinct touchdowns');
  for (const landing of slow.landings) {
    assert.ok(
      landing.tier === 'clean' || landing.tier === 'heavy',
      `a touchdown scored ${landing.tier} (${landing.score})`,
    );
  }

  // The overspeed row is reported, not judged: §36.4 asks for "credible
  // overspeed" to be tested, and what it should cost is a design answer.
  const fast = ride(25);
  assert.ok(fast.landings.length >= 1, 'the 25 mph descent recorded no touchdown at all');
});

// ---------------------------------------------------------------------------
// §36.4 — the signed spin pad
// ---------------------------------------------------------------------------

test('a 180 off the spin pad lands fakie and aligned, both directions', () => {
  const fixture = spinPadFixture();
  for (const direction of ['left', 'right'] as const) {
    const result = runTrial(fixture, 'shipped65', {
      targetMph: 12,
      lipS: fixture.lipS,
      hop: { stepsFromLip: ON_TIME_STEPS },
      charge: 'none',
      spinTap: direction,
      maxSteps: 2600,
    });
    assert.equal(result.spinArmed, true, `the ${direction} air tap did not arm`);
    assert.equal(result.reversing, true, `the ${direction} spin did not land fakie`);
    assert.ok(
      result.landingMisalignment < 0.3,
      `the ${direction} spin landed ${result.landingMisalignment} rad from square`,
    );
    assert.notEqual(result.landingTier, 'crash');
    assert.ok(
      Math.abs(Math.abs(result.headingChange) - Math.PI) < 0.02,
      `the heading swept ${result.headingChange} rad, not ±π`,
    );
  }
  // Both directions, and opposite signs — a table that reported the same number
  // twice would pass every other assertion above.
  const left = runTrial(fixture, 'shipped65', {
    targetMph: 12, lipS: fixture.lipS, hop: { stepsFromLip: ON_TIME_STEPS },
    charge: 'none', spinTap: 'left', maxSteps: 2600,
  });
  const right = runTrial(fixture, 'shipped65', {
    targetMph: 12, lipS: fixture.lipS, hop: { stepsFromLip: ON_TIME_STEPS },
    charge: 'none', spinTap: 'right', maxSteps: 2600,
  });
  assert.ok(left.headingChange * right.headingChange < 0, 'both taps spun the same way');
});

// ---------------------------------------------------------------------------
// T10 — the lap envelope and progress case
// ---------------------------------------------------------------------------

test('T10: every lap check passes', () => {
  for (const check of lapChecks()) {
    assert.ok(check.passed, `${check.name}: expected ${check.expected}, observed ${check.observed}`);
  }
});

test('T10 (a): the stadium ring emits a lap both referees will arm on', () => {
  const plan = lapFixture().plan;
  assert.notEqual(plan.lap, null, 'buildLevelPlan emitted no lap course');
  assert.equal(new TrackDayRun(plan.id, plan.checkpoints ?? [], plan.lap ?? null).available, true);
  assert.equal(new RaceRun(plan.checkpoints ?? [], plan.lap ?? null).available, true);
});

test('T10 (b): the envelope covers the deck, the bypass and the hairpin infield', () => {
  const fixture = lapFixture();
  const envelope = new LapEnvelope(fixture.plan.lap ?? { points: [], length: 0 });
  for (const corner of fixture.deckCorners) {
    assert.equal(envelope.contains(corner.x, corner.z), true, `deck corner ${corner.x},${corner.z}`);
  }
  assert.equal(envelope.contains(-4, LAP_DECK.from + LAP_DECK.length / 2), true, 'beside the deck');
  assert.equal(envelope.contains(-4, 30), true, 'the bypass half');
  assert.equal(envelope.contains(LAP_RADIUS, LAP_STRAIGHT), true, 'the hairpin infield centre');

  const reach = LAP_HALF_WIDTH + TRACK_DAY.offCourseMarginMetres;
  assert.equal(envelope.contains(-(reach + 0.1), 30), false, 'a point just outside the reach');
});

test('T10 (c): progress is monotonic on both lines and the same on each', () => {
  const envelope = new LapEnvelope(lapFixture().plan.lap ?? { points: [], length: 0 });
  let previousDeck = -Infinity;
  let previousBypass = -Infinity;
  for (let z = 5; z <= 55; z += 1) {
    const deck = envelope.progressAt(LAP_DECK.t, z);
    const bypass = envelope.progressAt(-4, z);
    assert.ok(deck > previousDeck, `deck line progress fell back at z=${z}`);
    assert.ok(bypass > previousBypass, `bypass progress fell back at z=${z}`);
    // §36.2 item 7, measured rather than assumed: the envelope is horizontal,
    // so a deck line and the bypass beside it are one progress.
    assert.ok(Math.abs(deck - bypass) < 1, `the two lines disagreed by ${deck - bypass} m at z=${z}`);
    previousDeck = deck;
    previousBypass = bypass;
  }
});

test('T10 (d): adjacent legs stop stealing each other\'s projection at 21 m', () => {
  const margin = TRACK_DAY.offCourseMarginMetres;
  const probe = LAP_HALF_WIDTH + 2.4;
  const apart = new LapEnvelope(parallelLegs(2 * LAP_HALF_WIDTH + 2 * margin));
  const tight = new LapEnvelope(parallelLegs(19));

  const onA = apart.progressAt(probe, 60);
  assert.ok(onA >= 0 && onA <= 120, `at 21 m apart the probe projected to ${onA} m, off leg A`);

  const stolen = tight.progressAt(probe, 60);
  assert.ok(stolen > 120, `at 19 m apart the probe stayed on leg A at ${stolen} m`);
});

// ---------------------------------------------------------------------------
// The two faces of a lip, and the wheel's own mount limit
// ---------------------------------------------------------------------------

test('a lip whose entry kerb exceeds the mount limit is refused, not merely hard', () => {
  // The finding T5 and T9 print, pinned so it cannot be tuned away silently: a
  // lip has a face to leave and a kerb to arrive at, and the second one is
  // bounded by `TERRAIN.stepUpPedalFactor × WHEEL.pedalHeight`.
  const tall = lipFixture({ lipHeight: 0.15, landingGrade: -0.18, runup: runupFor(15) });
  assert.ok(
    tall.stepUpAtStart > stepUpLimit(),
    `a 0.15 m lip with a 1 m lead has a ${tall.stepUpAtStart} m kerb, inside the limit`,
  );
  const refused = runTrial(tall, 'shipped65', {
    targetMph: 15, lipS: tall.lipS, hop: 'none', charge: 'none', maxSteps: 3400,
  });
  assert.equal(refused.launched, 'none', 'the rider got onto a lip they cannot mount');
  assert.ok(refused.blockedSteps > 0, 'the refusal left no `blocked` steps');

  const mountable = lipFixture({ lipHeight: 0.10, landingGrade: -0.18, runup: runupFor(15) });
  assert.ok(mountable.stepUpAtStart < stepUpLimit());
});

// ---------------------------------------------------------------------------
// The layer this directory lives in
// ---------------------------------------------------------------------------

test('src/bench/ reaches no further than level/ and simulation/', () => {
  // `src/architecture.test.ts` seals `simulation/` and `level/` and says nothing
  // about this directory, which is correct — the bench is not shipped code. It
  // still has a boundary, and it is worth the six lines: a bench that could
  // import `render/` would be able to answer a gameplay question with a mesh,
  // and one that imported `node:fs` would stop being shareable with the tool.
  const forbidden = ['app', 'ui', 'render', 'platform', 'audio', 'diagnostics'];
  const pattern = /from\s*['"]([^'"]+)['"]/g;
  for (const file of ['jumpBench.ts', 'featureFixtures.ts', 'installedPark.ts',
    'installedTables.ts']) {
    const source = readFileSync(join(import.meta.dirname, file), 'utf8');
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      assert.ok(
        specifier !== 'three' && !specifier.startsWith('three/'),
        `${file} imports three.js`,
      );
      assert.ok(!specifier.startsWith('node:'), `${file} imports ${specifier}, a Node-only module`);
      for (const layer of forbidden) {
        assert.ok(
          !specifier.split('/').includes(layer),
          `${file} imports ${specifier}, which reaches into ${layer}/`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The installed park — M36 Phase 2
// ---------------------------------------------------------------------------

/**
 * The pins Phase 2 added, and what each of them is standing in front of.
 *
 * §36.4 asks Phase 2 to repeat Phase 0's measurement on the built geometry, and
 * `docs/JUMP_BENCH.md`'s T11–T15 are that measurement. These are the handful of
 * its rows that a geometry edit must not be allowed to move quietly — every one
 * of them is a number `switchbackLevel.ts` was authored FROM, so a layout change
 * that invalidated it would otherwise show up as a worse ride and nothing else.
 */

const PLAYABLE: readonly BenchWheel[] = ['shipped65', 'diagnostic50'];

function installedRun(
  id: string,
  wheel: BenchWheel,
  mph: number,
  charge: BenchCharge | 'no-hop',
): TrialResult {
  const feature = installedFeature(id);
  const lead = feature.press === 'apex'
    ? apexStepsBeforeLip(charge === 'no-hop' ? 'none' : charge)
    : ON_TIME_STEPS;
  return runTrial(installedFixture(feature), wheel, {
    targetMph: mph,
    startMph: mph,
    lipS: feature.lipS,
    hop: charge === 'no-hop' ? 'none' : { stepsFromLip: lead },
    charge: charge === 'no-hop' ? 'none' : charge,
    holdThrottle: true,
    coastSteps: 1_000_000,
    maxSteps: 6000,
    rideThroughCrash: true,
  });
}

test('the kicker lands every hop clean, both presets, 20 to 50 mph — on the table or on the hill', () => {
  // **The Phase 2 finding, kept through the big-jump rebuild.** Phase 1's
  // kicker put the lip at the head of a 12.5% landing face and a hopped kicker
  // landed heavy at every sampled speed on both presets (bench T9: 1.03 to
  // 1.69); the level table ends a flight at the height it began, so a hop under
  // 44 mph still costs the hop's own launch speed and the 0.15 m face and
  // nothing else. Past 44 mph the charged flight clears the brow and comes down
  // on the 30% landing hill instead, where `EucController.land`'s
  // normal-closing-speed term takes the horizontal speed off the hit — which is
  // the whole reason a 28 m flight can be clean here and a 16 m one was heavy
  // on Phase 1's 12.5%. Shorten the table to 11 m or flatten the face to 25%
  // and the fast charged rows go heavy.
  for (const wheel of PLAYABLE) {
    for (const mph of [20, 30, 40, 50]) {
      for (const charge of ['no-hop', 'none', 'half', 'full'] as const) {
        const result = installedRun('kicker', wheel, mph, charge);
        assert.equal(
          result.landingTier,
          'clean',
          `kicker ${wheel} ${mph} mph ${charge}: ${result.landingTier} at`
          + ` ${result.landingScore.toFixed(4)}`,
        );
        assert.equal(result.crashed, false);
      }
    }
  }
});

test('the short-run-up kicker hold lands on the hill with face to spare', () => {
  // This historical T11 fixture starts 6.5 m before the lip: its held crouch
  // is PARTIAL charge at high speed. Keep that landing boundary, but do not
  // call it the longest/full-charge flight; T11c below measures that separately.
  const kicker = installedFeature('kicker');
  const faceStart = kicker.lipS + 16;
  const faceEnd = kicker.lipS + 32;
  for (const wheel of PLAYABLE) {
    const result = installedRun('kicker', wheel, 50, 'full');
    assert.ok(result.takeoffCharge > 0 && result.takeoffCharge < 1);
    const landed = result.touchdownS - kicker.lipS;
    assert.ok(
      result.touchdownS > faceStart && result.touchdownS + 3 < faceEnd,
      `${wheel}: a 50 mph charged hop lands ${landed.toFixed(2)} m past the lip, off the 16–32 m face`,
    );
    assert.equal(result.landingTier, 'clean');
    assert.ok(result.flightMetres > 24 && result.flightSeconds > 1.2, `${wheel}: only ${result.flightMetres.toFixed(2)} m / ${result.flightSeconds.toFixed(3)} s of flight`);
    if (wheel === 'shipped65') assert.ok(result.flightMetres > 25, `the shipped wheel flew ${result.flightMetres.toFixed(2)} m`);
  }
  // Ten miles an hour under the sign, it is down by the end of the brow.
  for (const wheel of PLAYABLE) {
    const result = installedRun('kicker', wheel, 40, 'full');
    const landed = result.touchdownS - kicker.lipS;
    assert.ok(landed > 0 && landed <= 16, `${wheel}: a 40 mph charged hop lands ${landed.toFixed(2)} m past the lip`);
    assert.equal(result.landingTier, 'clean');
  }
});

test('the tabletop face ceiling is 0.18 m: 0.20 m is the first heavy landing', () => {
  // T15's closed form, which is what 0.15 m was chosen against. The park's face
  // must stay on the clean side of it with margin.
  const rows = tableTabletopFaces().rows;
  const tier = new Map(rows.map((row) => [row[0], row[3]]));
  assert.equal(tier.get('0.150'), 'clean');
  assert.equal(tier.get('0.180'), 'clean');
  assert.equal(tier.get('0.200'), 'heavy');
  assert.equal(tier.get('0.250'), 'heavy');
});

test('the gap catches a short landing and rides away instead of bonking', () => {
  // The 0.185 m landing-deck face Phase 1 shipped bonked at 21.0 to 26.0 mph
  // with no hop — the wheel met it while still absorbing the touchdown. 0.135 m
  // does not, anywhere in the sweep. Raise `stepDown` back to 0.30 and the
  // 20 and 25 mph rows crash here.
  for (const wheel of PLAYABLE) {
    for (const mph of [18, 20, 22, 25]) {
      const result = installedRun('gap', wheel, mph, 'no-hop');
      assert.equal(result.crashed, false, `gap ${wheel} ${mph} mph no-hop: ${result.crashCause}`);
      assert.equal(result.landingTier, 'clean');
    }
  }
});

test('a 180 off the installed spin shelf lands clean and fakie, both ways', () => {
  // Phase 1's 0.41 m roll-off put every hopped 180 in the heavy tier on both
  // presets. The shelf now ends at the socket into the level pad with a 0.15 m
  // face — the kicker's arithmetic on a smaller feature.
  const shelf = installedFeature('spinShelf');
  for (const wheel of PLAYABLE) {
    for (const direction of ['left', 'right'] as const) {
      // Fully charged, which is the input that decides the face: an uncharged
      // 180 is clean off anything up to about 0.36 m and would not notice the
      // shelf going back to Phase 1's 0.41 m roll-off.
      const result = runTrial(installedFixture(shelf), wheel, {
        targetMph: 12,
        startMph: 12,
        lipS: shelf.lipS,
        hop: { stepsFromLip: ON_TIME_STEPS },
        charge: 'full',
        spinTap: direction,
        holdThrottle: true,
        coastSteps: 1_000_000,
        maxSteps: 6000,
      });
      assert.equal(result.spinArmed, true, `the ${direction} tap never armed`);
      assert.equal(result.reversing, true, `the ${direction} 180 did not land fakie`);
      assert.ok(
        Math.abs(Math.abs(result.headingChange) - Math.PI) < 0.05,
        `the ${direction} 180 turned ${(result.headingChange * (180 / Math.PI)).toFixed(1)}°`,
      );
      assert.equal(
        result.landingTier,
        'clean',
        `the ${direction} 180 landed ${result.landingTier} at ${result.landingScore.toFixed(4)}`,
      );
    }
  }
});

test('T13 prints the 180 as the clean landing it is, not as a bonk fifty seconds later', () => {
  // **A row that reads as a bonk on a clean trick** — p4-dressing open issue 1,
  // repaired in M36 Phase 6. Every installed row rides until its progress
  // reaches the feature's merge, and the table's coast is effectively
  // unbounded so that it can. A 180 never gets there: the rider lands fakie,
  // the throttle law holds the target speed in the direction the wheel now
  // FACES, and the trial turns round and rides back up the lap — so the six
  // spin rows ran the full 6,000-step ceiling, left the park, met one broadleaf
  // at (114.7, 84.1) and printed up to 4,241 `blocked steps` and an `obstacle`
  // verdict. T13's own note calls `blocked` "the bonk signature", so the table
  // said the signed 180 bonked. It lands clean at 0.7727 and always did.
  const rows = tableInstalledMisses().rows.filter((row) => row[3].startsWith('180 tapped'));
  assert.equal(rows.length, 6, `T13 printed ${rows.length} spin rows rather than six`);
  for (const row of rows) {
    const where = `${row[0]} ${row[1]} ${row[2]} mph ${row[3]}`;
    assert.equal(row[6], 'clean', `${where}: landed ${row[6]}`);
    assert.equal(row[9], '0', `${where}: ${row[9]} blocked steps beside a ${row[6]} landing`);
    assert.equal(row[11], '—', `${where}: verdict "${row[11]}"`);
    assert.match(row[8], /^fakie at /, `${where}: exited "${row[8]}"`);
  }

  // And the landings themselves did not move with the scope: the six scores
  // and the two heading signs are the ones the table has always printed.
  assert.deepEqual(
    rows.map((row) => [row[2], row[7], row[10]]),
    [
      ['12', '0.7727', 'heading 180.3°'],
      ['12', '0.7727', 'heading -180.3°'],
      ['25', '0.8889', 'heading 180.1°'],
      ['12', '0.7727', 'heading 180.3°'],
      ['12', '0.7727', 'heading -180.3°'],
      ['25', '0.8889', 'heading 180.1°'],
    ],
  );
});

test('the installed step-up is refused uncharged and mounted charged, both presets', () => {
  // §36.4's own requirement, on the built hillside rather than on a fixture.
  for (const wheel of PLAYABLE) {
    for (const mph of [8, 12, 16, 20]) {
      const bare = installedRun('stepUp', wheel, mph, 'none');
      assert.notEqual(bare.landedOn, 'deck', `${wheel} ${mph} mph mounted with no charge`);
      for (const charge of ['half', 'full'] as const) {
        const charged = installedRun('stepUp', wheel, mph, charge);
        assert.equal(
          charged.landedOn,
          'deck',
          `${wheel} ${mph} mph ${charge} did not mount the 0.50 m face`,
        );
        assert.equal(charged.landingTier, 'clean');
      }
    }
  }
});

test('a bonked skinny is a readable consequence with a ride-away, not a reset', () => {
  // §36.4: "At least one credible outside-window miss must demonstrate a
  // readable consequence and a recoverable exit." Aiming a hopless rider at a
  // 0.30 m plank face is the most credible miss on the venue.
  const skinny = installedFeature('skinny');
  for (const wheel of PLAYABLE) {
    const result = installedRun('skinny', wheel, 12, 'no-hop');
    assert.equal(result.crashed, true, 'the hopless skinny approach did not bonk');
    assert.ok(result.blockedSteps > 0, 'nothing refused the move into the face');
    assert.ok(
      result.recoveredAfterSteps > 0,
      'the wipeout never recovered, so the miss demands a reset',
    );
    // **And the exit, which takes a steering input and nothing else.** The
    // recovery puts the rider back on their wheel where they fell, which is
    // pointed at a 0.9 m plank — so a driver holding the bars dead straight
    // bonks it again, and this bench's driver has no other idea. A tenth of
    // steer walks the recovered rider off the plank's line and down the trail
    // to the merge with no reset and no teleport, which is the exit §36.4 asks
    // to see and the thing a player does without being told.
    const away = runTrial(installedFixture(skinny), wheel, {
      targetMph: 12,
      startMph: 12,
      lipS: skinny.lipS,
      hop: 'none',
      charge: 'none',
      steer: 0.1,
      holdThrottle: true,
      coastSteps: 1_000_000,
      maxSteps: 6000,
      rideThroughCrash: true,
    });
    assert.equal(away.crashed, true, 'the steered approach did not bonk either');
    assert.ok(away.recoveredAfterSteps > 0);
    assert.equal(away.reachedEnd, true, 'the recovered rider never reached the merge');
    assert.ok(
      Math.abs(away.finalT) <= 8,
      `the recovered rider left the corridor at t = ${away.finalT.toFixed(2)} m`,
    );
  }
});

test('no bypass half leaves the ground at any installed feature', () => {
  // Principle 2, measured feature by feature rather than once round the lap.
  //
  // **At the top of each feature's own sweep, capped at what the wheel can
  // legally hold.** The kicker's sweep tops out at the sign's 50 mph, and the
  // `?mph=50` diagnostic wheel cuts out at 96.5% of its own top — 49.4 mph
  // (`EUC.cutoutSpeedShare`) — so a bypass trial *placed* at 50 on that wheel
  // and held there down a 30% landing hill is a rider past their own cutout
  // before the geometry has done anything; it crashes `cutout` on the face and
  // says nothing about the ground. 48 is the last whole mile an hour under it,
  // and the same wheel rides the bypass clean at 35, 40, 45 and 48 (measured).
  // The shipped wheel is held at the full 50.
  for (const feature of INSTALLED_FEATURES) {
    for (const wheel of PLAYABLE) {
      const top = feature.speeds[feature.speeds.length - 1];
      const mph = wheel === 'diagnostic50' ? Math.min(top, 48) : top;
      const result = runTrial(
        { ...installedFixture(feature) },
        wheel,
        {
          targetMph: mph,
          startMph: mph,
          lipS: feature.lipS,
          hop: 'none',
          charge: 'none',
          lateralOffset: feature.bypassT - feature.technicalT,
          holdThrottle: true,
          coastSteps: 1_000_000,
          maxSteps: 6000,
        },
      );
      assert.equal(
        result.landings.length,
        0,
        `the ${feature.id} bypass left the ground at ${mph} mph on ${wheel}`,
      );
      assert.equal(result.crashed, false, `the ${feature.id} bypass crashed on ${wheel}`);
    }
  }
});

test('a stepped descent is a wall from below, and the bypass half is the ramp', () => {
  // §36.4's second "must not be faked", measured rather than asserted. Nothing
  // here is a one-way collider: the risers are the same solid blocks from both
  // sides, so what refuses a rider coming back up is their own height against
  // the 0.216 m the wheel can mount — and the ramp §36.4 asks for is the other
  // lateral half of the same corridor.
  for (const [id, fromS, metres] of [
    ['rhythm', lapDistance('rock-rhythm', 38), 14],
    ['stairs', lapDistance('timber-steps', 9), 9],
  ] as const) {
    const feature = installedFeature(id);
    for (const wheel of PLAYABLE) {
      for (const [line, t] of [
        ['feature', feature.technicalT],
        ['bypass', feature.bypassT],
      ] as const) {
        const result = runTrial(reverseFixture(feature, { fromS, metres, t }), wheel, {
          targetMph: 12,
          startMph: 12,
          lipS: null,
          hop: 'none',
          charge: 'none',
          holdThrottle: true,
          coastSteps: 1_000_000,
          maxSteps: 4000,
          rideThroughCrash: true,
        });
        if (line === 'feature') {
          assert.equal(result.reachedEnd, false, `${id} was climbed from below on ${wheel}`);
          assert.ok(result.blockedSteps > 0, `${id} refused nothing on ${wheel}`);
        } else {
          assert.equal(result.reachedEnd, true, `the ${id} bypass is not a ramp back up`);
          assert.equal(result.blockedSteps, 0, `the ${id} bypass refused a move`);
          assert.equal(result.landings.length, 0, `the ${id} bypass launched on the way up`);
        }
      }
    }
  }
});

test('the installed lap frame is the lap: progress advances with the corridor', () => {
  // The one claim the whole installed pass rests on. `querySegment` clamps `s`,
  // so this file projects without the clamp; if the projection were wrong every
  // "landed at" number above would be wrong and nothing else would notice.
  const kicker = installedFeature('kicker');
  const frame = lapFrame(kicker.segments);
  let previous = -Infinity;
  for (let along = 0; along <= 50; along += 0.5) {
    const pose = poseAt('kicker-lip', Math.min(along, 6), 4.5);
    const forward = { x: Math.sin(pose.headingY), z: Math.cos(pose.headingY) };
    const beyond = Math.max(0, along - 6);
    const x = pose.position.x + forward.x * beyond;
    const z = pose.position.z + forward.z * beyond;
    const progress = frame.progress(x, z);
    assert.ok(progress > previous, `progress went backwards at ${along} m`);
    assert.ok(
      Math.abs(progress - (kicker.lipS - 6 + along)) < 1e-6,
      `progress at ${along} m reads ${progress.toFixed(3)}`,
    );
    previous = progress;
  }
});

test('an installed trial is deterministic', () => {
  const first = installedRun('kicker', 'shipped65', 40, 'full');
  const second = installedRun('kicker', 'shipped65', 40, 'full');
  assert.deepEqual(first, second);
});

test('every installed feature publishes a window on both presets', () => {
  // The report's own shape, asserted so a feature cannot quietly stop being
  // measured: nine features, two presets, four inputs, every speed in its sweep.
  const table = tableParkWindows();
  const expected = INSTALLED_FEATURES.reduce(
    (total, feature) => total + feature.speeds.length * 2 * 4,
    0,
  );
  assert.equal(table.rows.length, expected);
  assert.equal(new Set(table.rows.map((row) => row[0])).size, 9);
  assert.ok(table.rows.every((row) => row.length === table.columns.length));
});

test('the big-jump report measures full charge, not just a held crouch request', () => {
  // The original 6.5 m fixture only charged for part of the 0.4 s window.
  const short = installedRun('kicker', 'shipped65', 50, 'full');
  assert.ok(short.takeoffCharge > 0 && short.takeoffCharge < 1);
  const table = tableBigJump();
  const chargeColumn = table.columns.indexOf('actual charge');
  assert.ok(chargeColumn >= 0);
  for (const row of table.rows) {
    assert.equal(row.length, table.columns.length);
    if (row[1].includes('fully charged') || (row[0] === '65' && row[1].includes('full crouch'))) {
      assert.equal(row[chargeColumn], '1.000');
    }
    if (row[1].includes('no hop')) assert.equal(row[chargeColumn], '0.000');
    if (row[1].startsWith("the sign's 50 mph, full crouch")) {
      assert.equal(row[table.columns.indexOf('landed on')], 'landing face');
      assert.equal(row[table.columns.indexOf('tier')], 'clean');
    }
  }
});
