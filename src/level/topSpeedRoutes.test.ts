/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, HAZARD } from '../data/tuning.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { generateLevel, sliceRouteLayout } from './generateRoute.ts';
import {
  DENSITY_ANCHOR,
  DENSITY_ANCHOR_DRAG_COEFFICIENT,
  DENSITY_ANCHOR_RULES,
  HAZARD_RULES,
  RIDEABILITY,
  TARGET_RULES,
  hazardRulesFor,
  hazardSpacingRefusal,
  rideabilityAt,
  rideabilityFor,
  routeProfile,
  targetRulesFor,
  validateRoute,
  type Rideability,
} from './routeValidator.ts';

/**
 * The `?mph=` world — M30 Phase 1 evidence (`docs/PLANS.md` §30.5 items 1, 2,
 * 4).
 *
 * The owner chose 65 on 2026-09-03 (*"we will ship at 65. i pre-approve"*) and
 * M30 Phase 4 moved the frozen table to it, so **the shipped wheel is 65** and
 * `?mph=<n>` is a generic diagnostic over the 20–90 mph window.
 *
 * **M38 Part B (`docs/PLANS.md` §38.7) retired the 50 mph reference wheel.**
 * This file used to survey the whole sweep twice — once shipped, once at 50 —
 * and pin both. It now carries **one shipped seed survey with the shipped
 * pins**; the claims that are about the *switch* rather than about a second
 * wheel (override propagation, speed-scaled fairness, the density algebra,
 * mismatched-rule rejection) stay as focused contracts, and where one of them
 * needs a speed that is not the default it uses a plain example inside the
 * window rather than a wheel anyone is invited to compare against. The
 * `DENSITY_ANCHOR` derivation in `routeValidator.ts` stays exactly as it is:
 * it is legacy density *calibration* that still controls the shipped hazard
 * offer, not a wheel builders ride (re-anchoring it once thinned the road and
 * the owner rejected that outcome).
 *
 * **A separate file from `generatedLevel.test.ts`, on purpose.** That file pins
 * the shipped wheel's records — the six adversarial seeds, the plan digests,
 * the separation window — and putting the override's evidence beside those
 * records would make it far too easy for a later edit to re-pin one while
 * meaning the other.
 *
 * What is asserted here, in the order the design states it:
 *
 *   1. **The default is the default.** `rideabilityAt(undefined)` is the frozen
 *      instance itself, and `rideabilityFor(EUC)` agrees with it member by
 *      member — the factory did not quietly change the shipped wheel.
 *   2. **`?mph=` moves the drag and nothing else.** The top speed is the
 *      preset's own `dragOnlyTop`; the lateral ceiling, the hop and the stall
 *      grade are untouched, because none of them is a function of drag and
 *      Phase 1 is deliberately not Phase 2.
 *   3. **Fairness is a time.** The hazard separation scales *exactly* by the
 *      preset's speed ratio, which is the M16 lesson (`generatedLevel.test.ts`,
 *      "hazards are spread far enough apart to recover between") arriving from
 *      the other side: the rule is "far enough apart that the first wobble has
 *      decayed before the second arrives", and raising the top speed raises the
 *      ground that time covers by the same factor. The target separation is two
 *      swing cycles of travel and does the same.
 *   4. **Density is a taste, and it goes the other way.** The separation floor
 *      is fairness and grows with the wheel; the *chance* of trying a hazard at
 *      a station is anchored on **M16's legacy drag calibration** and scaled **up** with
 *      the top speed by `HAZARD.densityTopSpeedExponent`, because a faster
 *      wheel exists to be more thrilling and an emptier road is the opposite of
 *      one. Phase 1 had to amend this once — deriving the density from the
 *      *live* separation took a quarter of the holes off a 65 route — and
 *      **Phase 4 had to amend it again for the same reason in a different
 *      costume**: the anchor was spelled "the shipped wheel", which followed
 *      the table and quietly re-anchored itself the day 65 shipped, thinning
 *      the shipped sweep from 81 holes to 63. It is frozen at 0.0147 now
 *      (`DENSITY_ANCHOR`), so the shipped 65 road is the road the owner rode.
 *      The exponent is 3 rather than 1 because the contracts refuse most of
 *      what the taste offers — the constant's comment carries the measured
 *      ladder.
 *   5. **A switched route is the same road with a different set of holes.**
 *      Both content streams spend the same draws at every station whether or
 *      not they place anything, and neither runs until the geometry is decided
 *      — so the segments, the heightfield, the dressing and the checkpoints are
 *      byte-identical between two builds of one seed and the attempt counts
 *      match. Asserted once, on one seed.
 *   6. **The rules bite.** A route spaced for a slower wheel fails when judged
 *      by the shipped rules, and a shipped route passes when judged by the
 *      slower rules — wider spacing is a superset, so the faster wheel gets a
 *      denser road inside a stricter floor rather than a different set of
 *      contracts.
 *   7. **The slice still validates across the whole `?mph=` window** (§30.5
 *      item 2). A rule the accepted level fails is a wrong rule, so this is the
 *      place that would say so.
 *
 * The two *entrances* — `createLevel` by id and `requestRoute` by seed, which
 * are the two doors `Game` builds a world through — are covered in
 * `levels.test.ts`, beside the parser that reads the switch off the URL.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** The two seeds §30.5 item 3 reports by name, and the sweep the claims are made over. */
const SWEEP = Array.from({ length: 16 }, (_, index) => `euc-${index + 1}`);

/**
 * One ordinary speed for the focused `?mph=` contracts below, slower than the
 * shipped 65 and well inside the parser's 20–90 mph window.
 *
 * **M38 Part B**: this used to be 50, the retired reference wheel. Nothing
 * asserted against it is a claim about *which* speed — every expectation is
 * derived from the recipe or the generator, so the example is interchangeable.
 */
const DIAGNOSTIC_MPH = 58;

/** Every hazard's distance along the required route, as the contracts measure it. */
function hazardPlacements(layout: ReturnType<typeof generateLevel>['layout']) {
  const profile = routeProfile(layout.placed, layout.throughIds);
  return (layout.hazards ?? []).map((spec) => ({
    id: spec.id,
    distance: (profile.startOf.get(spec.segment) ?? 0) + spec.s,
  }));
}

// ---------------------------------------------------------------------------
// The default is the default
// ---------------------------------------------------------------------------

test('a build with no override rides the frozen table, by identity', () => {
  // **Identity, not equality.** A default build passes no `?mph=`, and the
  // cheapest possible statement of "nothing moved" is that the generator is
  // handed the very object every rule already read. An equal-but-different
  // instance would still be correct and would be one refactor away from not
  // being, so the contract is written at its strongest.
  assert.equal(rideabilityAt(undefined), RIDEABILITY);
  assert.equal(hazardRulesFor(RIDEABILITY).separationMetres, HAZARD_RULES.separationMetres);
  assert.equal(targetRulesFor(RIDEABILITY).separationMetres, TARGET_RULES.separationMetres);

  // And the factory over the frozen table reproduces it member by member — the
  // check that the getters were carried across rather than rewritten.
  const rebuilt = rideabilityFor(EUC);
  for (const key of [
    'driveAccel', 'topSpeed', 'lateralAccel', 'stallGradient', 'maxRequiredGradient',
    'hopAirtime', 'dragCoefficient',
  ] as const) {
    assert.equal(rebuilt[key], RIDEABILITY[key], key);
  }
  for (const speed of [0, 5, 12.5, RIDEABILITY.topSpeed]) {
    assert.equal(rebuilt.hopDistanceAt(speed), RIDEABILITY.hopDistanceAt(speed), `hop at ${speed}`);
  }
  for (const curvature of [0, 1 / 20, -1 / 60, 1 / 250]) {
    assert.equal(
      rebuilt.curveSpeedLimit(curvature),
      RIDEABILITY.curveSpeedLimit(curvature),
      `curve at ${curvature}`,
    );
  }
});

// ---------------------------------------------------------------------------
// What 65 moves, and what it does not
// ---------------------------------------------------------------------------

test('65 is the wheel the generator ships, and a ?mph= override is the one that moves', () => {
  // `rideabilityAt(65)` is the frozen table's own wheel and has to agree with
  // it, which is the generator's half of `topSpeedPreset.test.ts`' "the shipped
  // table IS the 65 mph preset". Any other value in the window is what moves.
  // **M38 Part B**: the example below is an ordinary speed, not a reference.
  const r65 = rideabilityAt(65);
  assert.ok(
    Math.abs(r65.topSpeed - RIDEABILITY.topSpeed) < 1e-9,
    `?mph=65 tops out at ${r65.topSpeed} m/s and the shipped wheel at ${RIDEABILITY.topSpeed}`,
  );
  assert.ok(
    Math.abs(RIDEABILITY.topSpeed - 29.744) < 0.001,
    `the shipped drag-only top is ${RIDEABILITY.topSpeed.toFixed(4)} m/s — §30.2 fact 1's 29.74`,
  );
  assert.equal(r65.dragCoefficient, EUC.dragCoefficient);

  // Propagation, derived rather than transcribed: whatever the parser hands
  // the generator, the wheel it builds is the preset's own.
  for (const mph of [20, DIAGNOSTIC_MPH, 90]) {
    const preset = topSpeedPreset(mph);
    const wheel = rideabilityAt(mph);
    assert.ok(
      Math.abs(wheel.topSpeed - preset.dragOnlyTop) < 1e-9,
      `the generator's ${mph} wheel tops out at ${wheel.topSpeed} m/s and the preset says ${preset.dragOnlyTop}`,
    );
    assert.equal(wheel.dragCoefficient, preset.dragCoefficient);
  }
  assert.ok(
    rideabilityAt(DIAGNOSTIC_MPH).topSpeed < RIDEABILITY.topSpeed,
    'a speed below the shipped one has to build a slower wheel, or the override is not reaching the generator',
  );

  // **Phase 1 is not Phase 2.** The lateral ceiling, the hop and the stall
  // grade are functions of `maxLateralG`, the hop constants and the drive — and
  // the preset touches none of the three, at any speed it is asked for.
  for (const mph of [20, 50, 58, 80, 90]) {
    // A plain sweep of the window the parser accepts — 50 is one legal value
    // among these, carrying no status of its own (M38 Part B).
    const wheel = rideabilityAt(mph);
    assert.equal(wheel.lateralAccel, RIDEABILITY.lateralAccel, `${mph} lateral`);
    assert.equal(wheel.hopAirtime, RIDEABILITY.hopAirtime, `${mph} hop`);
    assert.equal(wheel.stallGradient, RIDEABILITY.stallGradient, `${mph} stall`);
    assert.equal(wheel.maxRequiredGradient, RIDEABILITY.maxRequiredGradient, `${mph} grade`);
    assert.equal(wheel.driveAccel, RIDEABILITY.driveAccel, `${mph} drive`);
  }
});

test('fairness is a time, so the spacing scales exactly by the speed ratio', () => {
  // The M16 lesson from the other side. The separation is "far enough apart
  // that the first hazard's wobble has decayed before the second arrives",
  // which is a *time*; a wheel a third faster covers that time in a third more
  // road, and a wheel a quarter slower in a quarter less. Anything other than
  // the ratio here means a metre has been written down somewhere it should
  // have been derived.
  //
  // **Swept over the whole `?mph=` window** rather than asserted at one speed,
  // because 65 is the frozen table and its own "scale" is one.
  for (const mph of [20, 50, 58, 80, 90]) {
    const scale = hazardRulesFor(rideabilityAt(mph)).separationMetres / HAZARD_RULES.separationMetres;
    const ratio = topSpeedPreset(mph).ratio;
    assert.ok(
      Math.abs(scale - ratio) < 1e-9,
      `at ${mph} mph the hazard separation scaled by ${scale} and the wheel by ${ratio}`,
    );
  }

  const hazards = HAZARD_RULES;
  const targets = TARGET_RULES;
  const r65 = RIDEABILITY;

  // §30.2 fact 6's three numbers for the 65 wheel — now the shipped one.
  assert.ok(
    hazards.separationMetres > 78 && hazards.separationMetres < 86,
    `the shipped separation is ${hazards.separationMetres.toFixed(1)} m — §30.2 fact 6 expects ≈82`,
  );
  assert.ok(
    Math.abs(targets.separationMetres - 26) < 1,
    `the shipped target separation is ${targets.separationMetres.toFixed(1)} m — fact 6 expects ≈26`,
  );
  assert.ok(
    Math.abs(hazards.respondMetres(r65.topSpeed) - 31) < 1,
    `the shipped lane-change response is ${hazards.respondMetres(r65.topSpeed).toFixed(1)} m — `
      + 'fact 6 expects ≈31',
  );

  // And the eight rules that are facts about the road rather than about the
  // wheel do not move. `HAZARD.readMetres` — the sight walk's 40 m look-back —
  // is not in this table at all and is deliberately left where the eye put it
  // (§30.5, fact 7).
  for (const key of [
    'lateralFraction', 'authorityReserve', 'rasterMargin', 'sightBlockMetres', 'eyeMetres',
    'profileStep', 'socketClearMetres', 'gateClearMetres', 'perHundredMetres', 'laneSlack',
    'laneStepMetres',
  ] as const) {
    assert.equal(hazards[key], HAZARD_RULES[key], key);
  }
  for (const key of [
    'vergeStandoff', 'reachMargin', 'reachLimit', 'standStepMetres', 'perHundredMetres',
    'socketClearMetres', 'gateClearMetres',
  ] as const) {
    assert.equal(targets[key], TARGET_RULES[key], key);
  }

  // One worked example off the shipped pins: 58 was the owner's middle option
  // (§30.6); he chose 65. The separation is a time, so a slower wheel covers
  // it in less road, and that is the only claim here.
  const middle = hazardRulesFor(rideabilityAt(58));
  assert.ok(
    middle.separationMetres > 70 && middle.separationMetres < 77,
    `the 58 separation is ${middle.separationMetres.toFixed(1)} m`,
  );
  assert.ok(middle.separationMetres < hazards.separationMetres);
});

test('density is a taste that scales up with the wheel, on a frozen legacy anchor', () => {
  // **The rule, in one line each.** The fairness floor above is a *time* and
  // grows with the wheel; the density is not derived from anything and grows
  // with the wheel too, on purpose — deriving it from the live separation, as
  // Phase 1 shipped it on the morning of 2026-09-03, made a faster wheel meet
  // *fewer* hazards, which is the wrong way round for a switch whose whole
  // reason is the thrill.
  //
  // **Phase 4 found the same defect a second time, in the anchor rather than
  // in the derivation.** "Anchored on the shipped wheel" was true prose and a
  // trap: the day 65 became the shipped wheel, the anchor moved with it, the
  // ratio went to exactly one, and the shipped sweep thinned from 81 holes to
  // 63. The anchor is `DENSITY_ANCHOR` now — M16's frozen 0.0147 calibration —
  // so "the shipped road is the road he rode at 65" is a fact rather than a
  // coincidence of which table happens to be frozen.
  //
  // **M38 Part B leaves this arithmetic alone on purpose** (`docs/PLANS.md`
  // §38.7). `DENSITY_ANCHOR_DRAG_COEFFICIENT` is legacy density *calibration*
  // that still controls the shipped hazard offer; it is not a wheel anybody
  // rides and retiring it would be a separate measured redesign. The
  // regression protection below is exactly what stops the road thinning
  // again.
  const anchorChance = DENSITY_ANCHOR_RULES.profileStep / DENSITY_ANCHOR_RULES.separationMetres;
  assert.ok(
    Math.abs(DENSITY_ANCHOR.topSpeed - 22.843) < 0.001,
    `the density anchor tops out at ${DENSITY_ANCHOR.topSpeed.toFixed(4)} m/s, not M16's 22.84`,
  );
  assert.equal(DENSITY_ANCHOR_DRAG_COEFFICIENT, 0.0147);
  assert.equal(hazardRulesFor(rideabilityAt(undefined)).chancePerStation,
    HAZARD_RULES.chancePerStation);

  // A wheel *at* the anchor draws against M13's own expression, to the bit —
  // the byte-identity claim, moved from the shipped wheel to the anchor wheel.
  assert.equal(hazardRulesFor(DENSITY_ANCHOR).chancePerStation, anchorChance);

  for (const mph of [58, 65, 80, 90]) {
    const scaled = hazardRulesFor(rideabilityAt(mph)).chancePerStation / anchorChance;
    const expected = (rideabilityAt(mph).topSpeed / DENSITY_ANCHOR.topSpeed)
      ** HAZARD.densityTopSpeedExponent;
    assert.ok(
      Math.abs(scaled - expected) < 1e-12,
      `the ${mph} chance scaled by ${scaled} and the rule says ${expected}`,
    );
    // And the direction, stated separately from the arithmetic: a faster wheel
    // is *offered* a denser road, while the floor it has to fit inside gets
    // wider. Both halves have to be true for the amendment to mean anything.
    assert.ok(scaled > 1, `${mph} was offered ${scaled}× the anchor density`);
    assert.ok(
      hazardRulesFor(rideabilityAt(mph)).separationMetres > DENSITY_ANCHOR_RULES.separationMetres,
      `${mph}'s fairness floor did not grow with the wheel`,
    );
  }

  // **The shipped wheel is on the offered side of that ladder, not the anchor
  // side** — which is the whole of q120's answer: the shipped density is 65's.
  assert.ok(
    Math.abs(HAZARD_RULES.chancePerStation / anchorChance - 2.208) < 0.002,
    `the shipped road is offered ${(HAZARD_RULES.chancePerStation / anchorChance).toFixed(3)}× `
      + 'the anchor density, recorded at 2.208',
  );

  // The exponent is a frozen constant and not a live tunable: the generator
  // reads this table and the session's mph and nothing else. **3 is the
  // recorded choice**, off a measured ladder rather than off the arithmetic —
  // the constant's own comment carries what 0, 1, 2, 3 and 6 each land at 65 —
  // because the offer has to outrun the contracts that refuse most of it: at 1
  // only 27 % of the extra placements survived and a 65 route was 8 % busier,
  // which is not busier. Moving this number is a taste change and belongs in
  // `CHANGELOG.md` with the ladder re-measured, not re-pinned quietly.
  assert.equal(HAZARD.densityTopSpeedExponent, 3);
});

// ---------------------------------------------------------------------------
// The same road with a different set of holes
// ---------------------------------------------------------------------------

test('one seed under a ?mph= override is the same road, spaced for the wheel it is ridden on', () => {
  // **The propagation contract, on one seed.** M38 Part B retired the second
  // full reference-wheel survey this used to be half of; what is left is the
  // claim that actually needs two builds of one seed — that the switch changes
  // the *content* and nothing else — plus the shipped pins for route-41.
  const shipped = generateLevel('route-41');
  const switched = generateLevel('route-41', undefined, undefined, DIAGNOSTIC_MPH);
  const rules = rideabilityAt(DIAGNOSTIC_MPH);

  assert.equal(switched.report.usedFallback, false, `route-41 stopped building at ${DIAGNOSTIC_MPH}`);
  assert.equal(
    switched.report.attempts,
    shipped.report.attempts,
    `the ${DIAGNOSTIC_MPH} build took a different route`,
  );
  assert.ok(
    validateRoute(switched.layout, rules).valid,
    `the ${DIAGNOSTIC_MPH} route does not satisfy the ${DIAGNOSTIC_MPH} rules`,
  );

  // **A record, not a ceiling.** Seven hazards and eighteen targets is the
  // **shipped** route-41 since M30 Phase 4 — the same road the owner rode,
  // byte for byte, which is what freezing the density anchor bought. If these
  // move, say why in `CHANGELOG.md` and re-record — do not relax the assertion.
  const shippedHazards = (shipped.plan.hazards ?? []).length;
  assert.equal(shippedHazards, 7, `the shipped route-41 carries ${shippedHazards} hazards, recorded at 7`);
  assert.equal(
    (shipped.plan.targets ?? []).length,
    18,
    `the shipped route-41 carries ${(shipped.plan.targets ?? []).length} targets, recorded at 18`,
  );

  // The switch really moved the content: a different set of holes, not merely
  // a different count of the same ones. Which way the count goes on a single
  // seed is a fact about that road — the direction claim is a sweep, and it
  // lives with the density algebra above.
  assert.notDeepStrictEqual(
    (switched.plan.hazards ?? []).map((hazard) => hazard.id),
    (shipped.plan.hazards ?? []).map((hazard) => hazard.id),
    'the override build placed the shipped wheel\'s exact holes',
  );
  // Targets are untouched by the density amendment: their separation is a
  // swing cycle and their chance per station is a flat constant, so a slower
  // wheel still carries at least as many stands.
  assert.ok((shipped.plan.targets ?? []).length <= (switched.plan.targets ?? []).length);

  // Every surviving pair is a pair its own wheel can recover between.
  assert.equal(hazardSpacingRefusal(hazardPlacements(switched.layout), hazardRulesFor(rules)), null);
  assert.equal(hazardSpacingRefusal(hazardPlacements(shipped.layout), HAZARD_RULES), null);

  // -- And it is the same road ---------------------------------------------
  //
  // The hazards stream spends four draws at every station and the targets
  // stream three, whether or not anything lands, and neither runs until the
  // geometry is decided. So an overridden build differs from the shipped build
  // in exactly the set of holes and stands and in nothing else — which is what
  // makes the switch a change of *wheel* rather than a change of world.
  assert.deepStrictEqual(switched.plan.segments, shipped.plan.segments);
  assert.deepStrictEqual(switched.plan.heightfield.heights, shipped.plan.heightfield.heights);
  assert.deepStrictEqual(switched.plan.props, shipped.plan.props);
  assert.deepStrictEqual(switched.plan.checkpoints, shipped.plan.checkpoints);
});

test('the shipped seed sweep keeps its recorded hazard count and its fairness floor', () => {
  // **One shipped survey** (M38 Part B). This used to build all sixteen seeds
  // twice — shipped and at the retired 50 mph reference — and pin both totals
  // plus their ordering. The reference is gone; what the sweep is *for*
  // survives, and it is the regression protection the owner's rejected
  // thinning bought:
  //
  //   - **115 hazards across the sixteen seeds.** The density amendment and
  //     the frozen anchor are what put it there. When the density was derived
  //     from the live separation, and again when the anchor followed the
  //     shipped table, this same sweep fell to 63 — an emptier road on a
  //     faster wheel, which is the wrong way round and which the owner
  //     rejected when he saw it. A number below this pin is that defect
  //     returning; re-record it in `CHANGELOG.md` with a reason, never relax it.
  //   - **The floor still binds, seed by seed.** The density scaled up; the
  //     fairness rule did not move an inch, and every pair the shipped road
  //     carries is a pair the shipped wheel can recover between. This is the
  //     assertion that would fail if the taste were ever allowed to buy its
  //     way past the floor.
  const fellBack: string[] = [];
  const holes: string[] = [];
  let shippedTotal = 0;
  for (const seed of SWEEP) {
    const shipped = generateLevel(seed);
    if (shipped.report.usedFallback) {
      fellBack.push(seed);
      continue;
    }
    holes.push(`${seed} ${(shipped.plan.hazards ?? []).length}`);
    shippedTotal += (shipped.plan.hazards ?? []).length;
    assert.equal(
      hazardSpacingRefusal(hazardPlacements(shipped.layout), HAZARD_RULES),
      null,
      `${seed}'s shipped road stacks two hazards inside one recovery`,
    );
  }
  assert.deepStrictEqual(fellBack, [], `these seeds fell back to the slice — ${holes.join(', ')}`);
  assert.equal(shippedTotal, 115, `the shipped sweep carries ${shippedTotal} hazards, recorded at 115 (${holes.join(', ')})`);
});

// ---------------------------------------------------------------------------
// The rules bite
// ---------------------------------------------------------------------------

test('a route spaced for a slower wheel is refused by the shipped rules, and never the other way round', () => {
  // **The whole reason the generator takes the switch.** Without it a rider
  // could be handed a road spaced for one wheel while riding another — which is
  // unfair by the game's own fairness rule, because two of the slower road's
  // holes sit inside one recovery of the faster wheel.
  //
  // The shipped wheel is the fast one, so the road that must be refused is the
  // one a *slower* override builds, judged by the shipped rules. **M38 Part B**:
  // the override below is an ordinary example, not a reference wheel — every
  // expectation is the contract's own verdict, measured on this build.
  // Measured at 58: route-41 fails `target-density` (its stands are inside two
  // swing cycles of the shipped wheel) and `x67` fails `hazard-density` as well
  // (two of its holes are inside one recovery). Both are named, because one
  // contract firing is not evidence that the other can.
  const route41 = validateRoute(generateLevel('route-41', undefined, undefined, DIAGNOSTIC_MPH).layout);
  assert.equal(
    route41.valid,
    false,
    `a ${DIAGNOSTIC_MPH}-spaced route-41 passes the shipped rules unchanged`,
  );
  assert.ok(
    route41.failures.some((failure) => failure.contract === 'target-density'),
    `route-41 at ${DIAGNOSTIC_MPH} failed ${route41.failures.map((f) => f.contract).join(', ')}`,
  );

  const x67 = validateRoute(generateLevel('x67', undefined, undefined, DIAGNOSTIC_MPH).layout);
  assert.ok(
    x67.failures.some((failure) => failure.contract === 'hazard-density'),
    `x67 at ${DIAGNOSTIC_MPH} failed ${x67.failures.map((f) => f.contract).join(', ')} — if no seed in the `
      + 'sweep can fail the hazard rule on the shipped wheel any more, the spacing stopped following the wheel',
  );

  // And the converse: wider spacing is a superset, so the shipped route is
  // legal on a slower wheel too. A player who typed `?mph=`, opened a route and
  // then reloaded without the switch is riding a legal world, and so is one who
  // did it the other way round.
  for (const seed of ['route-41', 'x67', ...SWEEP.slice(0, 8)]) {
    const shipped = generateLevel(seed);
    if (shipped.report.usedFallback) continue;
    const verdict = validateRoute(shipped.layout, rideabilityAt(DIAGNOSTIC_MPH));
    assert.ok(verdict.valid, `${seed}'s shipped route fails the ${DIAGNOSTIC_MPH} rules: `
      + verdict.failures.map((failure) => failure.detail).join('; '));
  }
});

// ---------------------------------------------------------------------------
// §30.5 item 2 — the accepted worlds at 65
// ---------------------------------------------------------------------------

test('the hand-authored slice validates across the whole ?mph= window', () => {
  // §30.5 item 2, and the M12 rule behind it: **a rule the accepted level fails
  // is a wrong rule.** The slice is the fallback and validates itself; if a
  // faster wheel made it illegal, that would be a fact about the slice to tell
  // the owner rather than a contract to bend.
  //
  // The interesting number is the kicker, because the landability contract is
  // the one rule the top speed makes *easier*: a faster approach carries
  // further. The slice's kicker gap is zero metres — the lip's centreline ends
  // exactly where the landing corridor begins — so it clears at any speed; the
  // reach is recorded here so the margin is on file rather than inferred.
  const layout = sliceRouteLayout();
  // 20 and 90 are the parser's own ends (`MIN_TOP_SPEED_MPH`,
  // `MAX_TOP_SPEED_MPH`); the values between them are ordinary samples of the
  // window, 58 being the middle option §30.6 offered. The shipped 65 is
  // covered by every other validation in the suite.
  for (const mph of [20, 50, 58, 80, 90]) {
    const rideability: Rideability = rideabilityAt(mph);
    const verdict = validateRoute(layout, rideability);
    const approach = verdict.speedProfile.get('kicker-run') ?? 0;
    const shipped = validateRoute(layout).speedProfile.get('kicker-run') ?? 0;
    assert.deepStrictEqual(
      verdict.failures,
      [],
      `the slice fails at ${mph} mph. The kicker is approached at ${approach.toFixed(2)} m/s `
        + `(${shipped.toFixed(2)} at the shipped wheel) and a charged hop carries `
        + `${rideability.hopDistanceAt(approach).toFixed(2)} m `
        + `(${RIDEABILITY.hopDistanceAt(shipped).toFixed(2)} shipped) across a 0.00 m gap`,
    );
  }
});
