/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, LIVE_TUNABLES, PHYSICS } from '../data/tuning.ts';
import { shippedTopSpeedMph, topSpeedPreset } from './topSpeedPreset.ts';
import { lateralCeilingG, type LateralCeilingTuning } from './lateralCeiling.ts';

/**
 * The give at speed — M30 Phase 2, `docs/PLANS.md` §30.3b.
 *
 * `simulation/lateralCeiling.ts` is one pure function read by the controller's
 * clamp and by the cop's corner allowance, so this file asserts the *schedule*
 * and `EucController.test.ts` asserts the *ride*. Splitting it that way is
 * what stops either file from re-deriving the arithmetic and agreeing with
 * itself.
 *
 * Two claims carry the milestone. **Below `carveSpeed` nothing moved** — the
 * schedule returns `maxLateralG` outright, so the approved M16 band is
 * numerically what it was and four of the six sober digests are still pinned
 * to numbers recorded before this function existed. And **the anchors are
 * absolute** — the third scope answer of §30.3: they do not follow the top
 * speed, so 40 mph corners identically on the shipped build and on `?mph=65`
 * and the A/B isolates the top speed alone. The second is asserted by moving
 * the very lever `?mph=` moves.
 */

/** Every speed the game can reach, in and out of the band, plus its edges. */
const SPEEDS = [
  0, 0.5, 3, 6, 8.999, 9, 9.001, 10, 12, 15, 18, 20, 22.2499, 22.25, 22.2501,
  24, 27, 29.06, 33, 40, 100,
];

test('the schedule holds the ordinary ceiling below the carve speed, outright', () => {
  // `===`, not a tolerance: this is the claim that nothing under 9 m/s moved,
  // and a lerp that returned `maxLateralG + 1e-17` there would move every
  // digest in the suite.
  for (const speed of [0, 1e-9, 0.5, 3, 5.9, 6, 8, 8.999, EUC.carveSpeed]) {
    assert.equal(lateralCeilingG(speed, EUC), EUC.maxLateralG, `at ${speed} m/s`);
    // And reverse, which is below the anchor by construction: the fastest the
    // wheel goes backwards is `maxReverseSpeed`, well under `carveSpeed`.
    assert.equal(lateralCeilingG(-speed, EUC), EUC.maxLateralG, `at -${speed} m/s`);
  }
  assert.ok(EUC.maxReverseSpeed < EUC.carveSpeed, 'reverse never leaves the flat band');
  assert.equal(lateralCeilingG(-EUC.maxReverseSpeed, EUC), EUC.maxLateralG);
});

test('it reads the speed as an absolute, so a reverse corner is the forward one', () => {
  for (const speed of SPEEDS) {
    assert.equal(
      lateralCeilingG(-speed, EUC),
      lateralCeilingG(speed, EUC),
      `${speed} m/s backwards must be ${speed} m/s forwards`,
    );
  }
});

test('it plateaus at carveGripTopG, returned outright', () => {
  // Outright rather than through the `lerp`, whose `from + (to - from) * 1` can
  // land one ulp off `to`. The plateau is a number other code compares against.
  for (const speed of [EUC.carveGripFullSpeed, 22.2501, 25, 29.06, 40, 1000]) {
    assert.equal(lateralCeilingG(speed, EUC), EUC.carveGripTopG, `at ${speed} m/s`);
  }
});

test('between the anchors it rises monotonically, and the shape is the exponent', () => {
  let previous = -Infinity;
  for (let v = 0; v <= 30; v += 0.05) {
    const ceiling = lateralCeilingG(v, EUC);
    assert.ok(ceiling >= previous - 1e-15, `the schedule fell back at ${v} m/s`);
    assert.ok(
      ceiling >= EUC.maxLateralG - 1e-15 && ceiling <= EUC.carveGripTopG + 1e-15,
      `${ceiling} g at ${v} m/s is outside the two anchors`,
    );
    previous = ceiling;
  }

  // Halfway up the band at exponent 1 is halfway between the anchors — the
  // straight line the plan specifies, and the shape a rider can learn.
  const mid = (EUC.carveSpeed + EUC.carveGripFullSpeed) / 2;
  assert.equal(EUC.carveGripExponent, 1);
  assert.ok(
    Math.abs(lateralCeilingG(mid, EUC) - (EUC.maxLateralG + EUC.carveGripTopG) / 2) < 1e-12,
    'at exponent 1 the middle of the band is the middle of the rise',
  );

  // A tunable is only testable by moving it (AGENTS.md, M26's finding). Above
  // 1 the ordinary grip is held through the middle band and given up near the
  // top; below 1 the opposite. Both keep the anchors exactly.
  const steep: LateralCeilingTuning = { ...EUC, carveGripExponent: 2 };
  const early: LateralCeilingTuning = { ...EUC, carveGripExponent: 0.5 };
  assert.ok(lateralCeilingG(mid, steep) < lateralCeilingG(mid, EUC));
  assert.ok(lateralCeilingG(mid, early) > lateralCeilingG(mid, EUC));
  for (const t of [steep, early]) {
    assert.equal(lateralCeilingG(EUC.carveSpeed, t), EUC.maxLateralG);
    assert.equal(lateralCeilingG(EUC.carveGripFullSpeed, t), EUC.carveGripTopG);
  }
});

test('a degenerate schedule is a step function rather than a NaN in the clamp', () => {
  // Guarded the way `leanBlend`'s span is. Neither of these is reachable from
  // F4 — `carveGripFullSpeed` is not on the panel and the exponent's slider
  // starts at 0.5 — but a hand-written tuning override reaches both, and a NaN
  // here is a wheel with no lateral limit at all.
  const collapsed: LateralCeilingTuning = { ...EUC, carveGripFullSpeed: EUC.carveSpeed };
  assert.equal(lateralCeilingG(EUC.carveSpeed, collapsed), EUC.maxLateralG);
  assert.equal(lateralCeilingG(EUC.carveSpeed + 1e-9, collapsed), EUC.carveGripTopG);

  const inverted: LateralCeilingTuning = { ...EUC, carveGripFullSpeed: 4 };
  for (const speed of SPEEDS) assert.ok(Number.isFinite(lateralCeilingG(speed, inverted)));

  const flat: LateralCeilingTuning = { ...EUC, carveGripExponent: 0 };
  assert.equal(lateralCeilingG(EUC.carveSpeed, flat), EUC.maxLateralG, 'not the top at the bottom');
  const mid = (EUC.carveSpeed + EUC.carveGripFullSpeed) / 2;
  assert.ok(Math.abs(lateralCeilingG(mid, flat) - lateralCeilingG(mid, EUC)) < 1e-12);
});

test('the F4 floor is the shipped ride exactly, which is what makes the panel the A/B', () => {
  const top = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveGripTopG');
  assert.ok(top, 'EUC.carveGripTopG is on the tuning panel');
  assert.equal(top.min, 0.75, 'the slider floors at the shipped lateral limit');
  assert.equal(top.min, EUC.maxLateralG, 'and that floor *is* the ordinary ceiling');
  assert.equal(top.max, 1.6);
  assert.equal(top.step, 0.01);
  assert.ok(top.min <= EUC.carveGripTopG && EUC.carveGripTopG <= top.max);

  const shape = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveGripExponent');
  assert.ok(shape, 'EUC.carveGripExponent is on the tuning panel');
  assert.equal(shape.min, 0.5);
  assert.equal(shape.max, 2);
  assert.equal(shape.step, 0.05);

  // Dragged to its floor the schedule is flat at the shipped value at every
  // speed — the "without" column of the radius table, and a ride the owner can
  // switch to from the panel while he is on the wheel.
  const off: LateralCeilingTuning = { ...EUC, carveGripTopG: top.min };
  for (const speed of SPEEDS) assert.equal(lateralCeilingG(speed, off), EUC.maxLateralG, `at ${speed}`);

  // The third constant is deliberately absent: it is absolute, and a `?mph=`
  // build must not be able to move it (§30.3, the third scope answer).
  assert.equal(
    LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveGripFullSpeed'),
    undefined,
    'EUC.carveGripFullSpeed is an anchor, not a knob',
  );
});

test('the A/B is clean: the top-speed preset moves no part of the schedule', () => {
  // **The contract the third scope answer is** (§30.3b, §30.7 item 2).
  // `?mph=<n>` is one lever — `simulation/topSpeedPreset.ts` moves
  // `dragCoefficient` and the two power speeds and nothing else — so a 40 mph
  // corner has to be the same corner on every build, or the owner's A/B is
  // measuring two changes at once. The anchors are absolute for exactly this,
  // and the way to hold it is to move the lever and read the schedule.
  // 65 is the shipped wheel since M30 Phase 4, so its preset is the identity
  // and moves nothing — which is a fact about the table rather than about the
  // schedule. Every *other* speed in the list still has to move the drag, or
  // the sweep below would be comparing a build with itself.
  const shipped = shippedTopSpeedMph();
  for (const mph of [20, 30, 40, 50, 58, 65, 80, 90]) {
    const preset = topSpeedPreset(mph);
    const built = { ...EUC, ...preset };
    if (Math.abs(mph - shipped) < 1e-9) {
      assert.equal(preset.dragCoefficient, EUC.dragCoefficient, `${mph} mph is the shipped wheel`);
    } else {
      assert.notEqual(preset.dragCoefficient, EUC.dragCoefficient, `${mph} mph moves the drag`);
    }
    for (const speed of SPEEDS) {
      assert.equal(
        lateralCeilingG(speed, built),
        lateralCeilingG(speed, EUC),
        `${mph} mph moved the ceiling at ${speed} m/s`,
      );
    }
  }

  // And a hand-built tuning that only changes the drag, in case the preset ever
  // grows a field: the schedule reads five constants and none of them is drag.
  const dragged = { ...EUC, dragCoefficient: EUC.dragCoefficient * 3 };
  for (const speed of SPEEDS) {
    assert.equal(lateralCeilingG(speed, dragged), lateralCeilingG(speed, EUC), `at ${speed} m/s`);
  }
});

test('the radius a full-lock corner needs, at the speeds the plan tabulates', () => {
  // Not an assertion so much as the arithmetic behind §30.3b's table, checked
  // against the schedule rather than against the plan's prose. The ride's own
  // version of this — the same table measured through the production
  // controller — is in `EucController.test.ts`.
  //
  //   mph   ceiling   radius after   radius today
  //    30    0.850 g     21.6 m         24.4 m
  //    40    0.951 g     34.3 m         43.5 m
  //    50    1.050 g     48.5 m         67.9 m
  //    65    1.050 g     82.0 m        114.8 m
  const MPH = 0.44704;
  const expected = [
    { mph: 30, ceiling: 0.850, after: 21.6, today: 24.4 },
    { mph: 40, ceiling: 0.951, after: 34.3, today: 43.5 },
    { mph: 50, ceiling: 1.050, after: 48.5, today: 67.9 },
    { mph: 65, ceiling: 1.050, after: 82.0, today: 114.8 },
  ];
  for (const row of expected) {
    const v = row.mph * MPH;
    const ceiling = lateralCeilingG(v, EUC);
    assert.ok(Math.abs(ceiling - row.ceiling) < 5e-4, `${row.mph} mph: ${ceiling} g`);
    const radius = (v * v) / (ceiling * PHYSICS.gravity);
    const today = (v * v) / (EUC.maxLateralG * PHYSICS.gravity);
    assert.ok(Math.abs(radius - row.after) < 0.1, `${row.mph} mph: ${radius} m`);
    assert.ok(Math.abs(today - row.today) < 0.1, `${row.mph} mph today: ${today} m`);
  }
});
