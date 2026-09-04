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
 * 4), **with the two wheels swapped at Phase 4**.
 *
 * When this file was written 50 was the frozen table and 65 was the switch, so
 * every claim below was phrased as "what 65 does that the shipped wheel does
 * not". The owner chose 65 on 2026-09-03 (*"we will ship at 65. i pre-approve"*)
 * and Phase 4 moved the table, so the roles are reversed: **the shipped wheel
 * is 65 and `?mph=50` is the diagnostic back to M16's**. The claims are
 * unchanged — each is about the *faster* wheel and the *slower* one, not about
 * which is currently frozen — and they are re-derived here rather than
 * re-labelled, with the recorded counts re-measured on the build that ships.
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
 *      a station is anchored on **M16's 50 mph wheel** and scaled **up** with
 *      the top speed by `HAZARD.densityTopSpeedExponent`, because a faster
 *      wheel exists to be more thrilling and an emptier road is the opposite of
 *      one. Phase 1 had to amend this once — deriving the density from the
 *      *live* separation took a quarter of the holes off a 65 route — and
 *      **Phase 4 had to amend it again for the same reason in a different
 *      costume**: the anchor was spelled "the shipped wheel", which meant 50
 *      until the day 65 shipped and then quietly re-anchored itself, thinning
 *      the shipped sweep from 81 holes to 63. It is frozen at 0.0147 now
 *      (`DENSITY_ANCHOR`), so the shipped 65 road is the road the owner rode.
 *      The exponent is 3 rather than 1 because the contracts refuse most of
 *      what the taste offers — the constant's comment carries the measured
 *      ladder.
 *   5. **A 65 route is the same road with a different set of holes.** Both
 *      content streams spend the same draws at every station whether or not
 *      they place anything, and neither runs until the geometry is decided — so
 *      the segments, the heightfield, the dressing and the checkpoints are
 *      byte-identical between the two builds of one seed and the attempt counts
 *      match.
 *   6. **The rules bite.** A route spaced for 50 fails when judged by the 65
 *      wheel, and a route spaced for 65 passes when judged by the 50 rules —
 *      wider spacing is a superset, so the faster wheel gets a denser road
 *      inside a stricter floor rather than a different set of contracts.
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

test('65 is the wheel the generator ships, and the 50 preset is the one that moves', () => {
  // **Phase 4 swapped the sides.** `rideabilityAt(65)` used to be the override;
  // it is now the frozen table's own wheel and has to agree with it, which is
  // the generator's half of `topSpeedPreset.test.ts`' "the shipped table IS the
  // 65 mph preset". `?mph=50` is the wheel that moves now.
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

  const preset = topSpeedPreset(50);
  const r50 = rideabilityAt(50);
  assert.ok(
    Math.abs(r50.topSpeed - preset.dragOnlyTop) < 1e-9,
    `the generator's 50 wheel tops out at ${r50.topSpeed} m/s and the preset says ${preset.dragOnlyTop}`,
  );
  assert.ok(
    Math.abs(r50.topSpeed - 22.880) < 0.001,
    `the 50 mph drag-only top is ${r50.topSpeed.toFixed(4)} m/s`,
  );
  assert.ok(r50.topSpeed < RIDEABILITY.topSpeed, 'the A/B wheel is meant to be the slower one');
  assert.equal(r50.dragCoefficient, preset.dragCoefficient);

  // **Phase 1 is not Phase 2.** The lateral ceiling, the hop and the stall
  // grade are functions of `maxLateralG`, the hop constants and the drive — and
  // the preset touches none of the three, at any speed it is asked for.
  for (const mph of [20, 50, 58, 80, 90]) {
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
  // **Swept over the whole `?mph=` window at Phase 4** rather than asserted at
  // 65 alone, because 65 is the frozen table now and its "scale" is one.
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
  // And the wheel the A/B goes back to, whose numbers were the shipped ones
  // until Phase 4: ≈63 m of separation, which is where M16 left it.
  const fifty = hazardRulesFor(rideabilityAt(50));
  assert.ok(
    fifty.separationMetres > 60 && fifty.separationMetres < 67,
    `the 50 separation is ${fifty.separationMetres.toFixed(1)} m — M16's own ≈63`,
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

  // 58 was the owner's middle option (§30.6); he chose 65.
  const r58 = hazardRulesFor(rideabilityAt(58));
  assert.ok(
    r58.separationMetres > 70 && r58.separationMetres < 77,
    `the 58 separation is ${r58.separationMetres.toFixed(1)} m`,
  );
});

test('density is a taste that scales up with the wheel, anchored on M16\'s 50', () => {
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
  // 63. The anchor is `DENSITY_ANCHOR` now — M16's 0.0147 wheel, frozen — so
  // "the shipped road is the road he rode at 65" is a fact rather than a
  // coincidence of which table happens to be frozen.
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
  // And the A/B goes back down it: `?mph=50` is the anchor road again.
  assert.ok(
    Math.abs(hazardRulesFor(rideabilityAt(50)).chancePerStation / anchorChance - 1) < 0.01,
    'a ?mph=50 session no longer draws against M16\'s own density',
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

test('route-41 at 50 is the same road, spaced for the wheel it is ridden on', () => {
  const shipped = generateLevel('route-41');
  const slow = generateLevel('route-41', undefined, undefined, 50);
  const r50 = rideabilityAt(50);

  assert.equal(slow.report.usedFallback, false, 'route-41 stopped building at 50');
  assert.equal(slow.report.attempts, shipped.report.attempts, 'the 50 build took a different route');
  assert.ok(validateRoute(slow.layout, r50).valid, 'the 50 route does not satisfy the 50 rules');

  // **A record, not a ceiling.** Seven hazards and eighteen targets is the
  // **shipped** route-41 since M30 Phase 4 — the same road the owner rode under
  // `?mph=65`, byte for byte, which is what re-anchoring the density bought.
  // `?mph=50` puts it back to the six and twenty-two M13 to M29 shipped. If
  // these move, say why in `CHANGELOG.md` and re-record — do not relax the
  // assertion.
  const shippedHazards = (shipped.plan.hazards ?? []).length;
  const slowHazards = (slow.plan.hazards ?? []).length;
  assert.equal(shippedHazards, 7, `the shipped route-41 carries ${shippedHazards} hazards, recorded at 7`);
  assert.equal(slowHazards, 6, `route-41 at 50 carries ${slowHazards} hazards, recorded at 6`);
  // **The direction is the claim; the number is the record.** While the density
  // was derived from the fairness floor this road carried five at 65, and again
  // at Phase 4 while the anchor followed the shipped wheel — a route that
  // empties as the wheel gets faster is the defect this line exists to catch.
  // The `>=` is deliberately weaker than the records above it: a future
  // exponent may make this seven an eight, and that is a re-record; a six would
  // be the rule breaking.
  assert.ok(shippedHazards >= slowHazards,
    `65 put ${shippedHazards} hazards on a road that carries ${slowHazards} at 50`);
  assert.notDeepStrictEqual(
    (slow.plan.hazards ?? []).map((hazard) => hazard.id),
    (shipped.plan.hazards ?? []).map((hazard) => hazard.id),
    'the 50 build placed the shipped wheel\'s exact holes',
  );
  // Targets are untouched by the density amendment: their separation is a swing
  // cycle and their chance per station is a flat constant, so a faster wheel
  // still carries fewer stands.
  assert.equal((slow.plan.targets ?? []).length, 22,
    `route-41 at 50 carries ${(slow.plan.targets ?? []).length} targets, recorded at 22`);
  assert.ok((shipped.plan.targets ?? []).length <= (slow.plan.targets ?? []).length);

  // Every surviving pair is a pair its own wheel can recover between.
  assert.equal(hazardSpacingRefusal(hazardPlacements(slow.layout), hazardRulesFor(r50)), null);
  assert.equal(hazardSpacingRefusal(hazardPlacements(shipped.layout), HAZARD_RULES), null);

  // -- And it is the same road ---------------------------------------------
  //
  // The hazards stream spends four draws at every station and the targets
  // stream three, whether or not anything lands, and neither runs until the
  // geometry is decided. So a 50 build differs from the shipped 65 build in
  // exactly the set of holes and stands and in nothing else — which is what
  // makes the A/B a test of the *wheel* rather than a comparison of two worlds.
  assert.deepStrictEqual(slow.plan.segments, shipped.plan.segments);
  assert.deepStrictEqual(slow.plan.heightfield.heights, shipped.plan.heightfield.heights);
  assert.deepStrictEqual(slow.plan.props, shipped.plan.props);
  assert.deepStrictEqual(slow.plan.checkpoints, shipped.plan.checkpoints);
});

test('the shipped 65 route is the same road as its ?mph=50 twin across a seed sweep', () => {
  // Measured before it was pinned: all sixteen agree, and the report names any
  // that do not rather than the assertion hiding them behind the first.
  //
  // **"The same road" is the geometry, not the whole plan**, and the difference
  // is measured rather than assumed. Four things legitimately move with the
  // hazard set: the hazards, the targets, the heightfield's *surfaces* (a spill
  // is painted into the cells it covers, so removing one gives the road its
  // grip back) and the markings (a painted line is broken around a footprint).
  // The heights, the segments, the dressing, the colliders and the checkpoints
  // are byte-identical, which is what "the same road" has to mean.
  const disagreed: string[] = [];
  const holes: string[] = [];
  const r50 = hazardRulesFor(rideabilityAt(50));
  let shippedTotal = 0;
  let slowTotal = 0;
  for (const seed of SWEEP) {
    const shipped = generateLevel(seed);
    const slow = generateLevel(seed, undefined, undefined, 50);
    if (shipped.report.usedFallback || slow.report.usedFallback) {
      disagreed.push(`${seed}: fell back (${shipped.report.usedFallback}/${slow.report.usedFallback})`);
      continue;
    }
    const road = (level: typeof shipped): string => JSON.stringify([
      level.plan.segments,
      level.plan.heightfield.heights,
      level.plan.props,
      level.plan.checkpoints,
      level.plan.solids,
      level.plan.softBodies,
    ]);
    if (shipped.report.attempts !== slow.report.attempts) disagreed.push(`${seed} (attempts)`);
    else if (road(shipped) !== road(slow)) disagreed.push(`${seed} (geometry)`);
    holes.push(`${seed} ${(slow.plan.hazards ?? []).length}→${(shipped.plan.hazards ?? []).length}`);
    shippedTotal += (shipped.plan.hazards ?? []).length;
    slowTotal += (slow.plan.hazards ?? []).length;

    // **The floor still binds, seed by seed.** The density scaled up; the
    // fairness rule did not move an inch, and every pair the shipped 65 road
    // carries is a pair the 65 wheel can recover between. This is the assertion
    // that would fail if the taste were ever allowed to buy its way past the
    // floor — and the same for the slower wheel against its own narrower floor.
    assert.equal(
      hazardSpacingRefusal(hazardPlacements(shipped.layout), HAZARD_RULES),
      null,
      `${seed}'s shipped road stacks two hazards inside one recovery`,
    );
    assert.equal(
      hazardSpacingRefusal(hazardPlacements(slow.layout), r50),
      null,
      `${seed}'s 50 road stacks two hazards inside one recovery`,
    );
  }
  assert.deepStrictEqual(disagreed, [], `these seeds built a different road at 50 — ${holes.join(', ')}`);

  // **A total, not a per-seed rule**, and it stays a total on purpose. A given
  // road can legitimately lose a hole at 65 — the wider floor refuses a pair the
  // denser dice offered — and at exponent 1 two of these sixteen did exactly
  // that. At 3 the offer is steep enough that **all sixteen gain** (81 → 115),
  // but the rule being asserted is still the sweep, because which individual
  // seed gains is a fact about that road rather than about the wheel. What must
  // not happen is the sweep as a whole thinning out, which is what the derived
  // density did — and what the shipped-wheel anchor did again at Phase 4,
  // taking this same sweep to 63 until the anchor was frozen at M16's wheel.
  assert.ok(
    shippedTotal > slowTotal,
    `the shipped 65 sweep carries ${shippedTotal} hazards against ?mph=50's ${slowTotal} — `
      + `a faster wheel is meant to meet more road, not less (${holes.join(', ')})`,
  );
  assert.equal(slowTotal, 81, `the ?mph=50 sweep carries ${slowTotal} hazards, recorded at 81`);
  assert.equal(shippedTotal, 115, `the shipped sweep carries ${shippedTotal} hazards, recorded at 115`);
});

// ---------------------------------------------------------------------------
// The rules bite
// ---------------------------------------------------------------------------

test('a route spaced for 50 is refused by the 65 rules, and never the other way round', () => {
  // **The whole reason the generator takes the switch.** Without it a rider
  // could be handed a road spaced for one wheel while riding another — which is
  // unfair by the game's own fairness rule, because two of the slower road's
  // holes sit inside one recovery of the faster wheel.
  //
  // **Phase 4 reversed which way round that risk runs.** It used to be
  // "`?mph=65` hands a rider the shipped 50 mph routes"; now the shipped wheel
  // is the fast one and the diagnostic is the slow one, so the road that must
  // be refused is the one `?mph=50` builds, judged by the shipped rules.
  // Measured: `?mph=50`'s route-41 fails `target-density` (its stands are
  // inside two swing cycles of the shipped wheel) and `?mph=50`'s `x67` fails
  // `hazard-density` as well (two of its holes are inside one recovery). Both
  // are named, because one contract firing is not evidence that the other can.
  const route41 = validateRoute(generateLevel('route-41', undefined, undefined, 50).layout);
  assert.equal(route41.valid, false, 'a 50-spaced route-41 passes the shipped rules unchanged');
  assert.ok(
    route41.failures.some((failure) => failure.contract === 'target-density'),
    `route-41 at 50 failed ${route41.failures.map((f) => f.contract).join(', ')}`,
  );

  const x67 = validateRoute(generateLevel('x67', undefined, undefined, 50).layout);
  assert.ok(
    x67.failures.some((failure) => failure.contract === 'hazard-density'),
    `x67 at 50 failed ${x67.failures.map((f) => f.contract).join(', ')} — if no seed in the `
      + 'sweep can fail the hazard rule at 65 any more, the spacing stopped following the wheel',
  );

  // And the converse: wider spacing is a superset, so the shipped 65 route is
  // legal on the slower wheel too. A player who typed `?mph=50`, opened a route
  // and then reloaded without the switch is riding a legal world, and so is one
  // who did it the other way round.
  for (const seed of ['route-41', 'x67', ...SWEEP.slice(0, 8)]) {
    const shipped = generateLevel(seed);
    if (shipped.report.usedFallback) continue;
    const verdict = validateRoute(shipped.layout, rideabilityAt(50));
    assert.ok(verdict.valid, `${seed}'s shipped 65 route fails the 50 rules: `
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
  // `MAX_TOP_SPEED_MPH`); 50 is the A/B and 58 was the middle option §30.6
  // offered. The shipped 65 is covered by every other validation in the suite.
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
