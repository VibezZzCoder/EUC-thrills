/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MATERIALS } from './surfaces.ts';
import {
  MARKING_PAINTS,
  MARKINGS,
  PAINTABLE_SURFACES,
  markingWidth,
  type MarkingPaint,
} from './markings.ts';

/**
 * The paint table — M7.5 stage 4.
 *
 * Two of these tests exist because stage 4 deliberately breaks a rule
 * `DESIGN.md` §3 states flatly, and a rule broken on purpose has to be broken
 * on the record with its replacement stated: road paint is brighter than kerb
 * concrete, the park's paint is not, and both are bounded.
 */

const linear = (hex: number): [number, number, number] => ([
  (((hex >> 16) & 0xff) / 255) ** 2.2,
  (((hex >> 8) & 0xff) / 255) ** 2.2,
  ((hex & 0xff) / 255) ** 2.2,
]);

const luminance = (hex: number): number => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const PAINTS = Object.keys(MARKING_PAINTS) as MarkingPaint[];

test('every paint is legible rather than realistically bright or dim', () => {
  for (const id of PAINTS) {
    const value = luminance(MARKING_PAINTS[id].albedo);
    // The same floor and ceiling every other palette in the project answers to
    // (`DESIGN.md` §2). Fresh traffic paint really is about 0.75 reflectance,
    // which would blow out under ACES against sunlit pavement.
    assert.ok(value > 0.03, `${id} paint is ${value.toFixed(3)} linear — it will crush`);
    assert.ok(value < 0.6, `${id} paint is ${value.toFixed(3)} linear — it will blow out`);
    assert.ok(
      MARKING_PAINTS[id].wear > 0 && MARKING_PAINTS[id].wear < 0.5,
      `${id} needs some wear, and less than half its own value`,
    );
  }
});

test('paint reads as paint: brighter than the road it is painted on', () => {
  // The whole point. A line that does not beat the tarmac is a stain.
  for (const surface of ['pavement', 'roughPavement', 'brick'] as const) {
    assert.ok(
      luminance(MARKING_PAINTS.road.albedo) > luminance(MATERIALS[surface].albedo) * 1.8,
      `road paint does not read against ${surface}`,
    );
  }
});

test('the city is maintained and the park is not, and the paint says so', () => {
  const road = luminance(MARKING_PAINTS.road.albedo);
  const path = luminance(MARKING_PAINTS.path.albedo);
  assert.ok(path < road * 0.8, 'the park path paint has to be visibly duller than the road');
  assert.ok(
    MARKING_PAINTS.path.wear > MARKING_PAINTS.road.wear,
    'the park path paint has to be visibly more worn than the road',
  );
  // The park's paint keeps `DESIGN.md` §3's ordering intact on its own, which
  // is what makes the road's exception a deliberate, bounded one rather than an
  // abandonment of the rule.
  assert.ok(
    path < luminance(MATERIALS.concrete.albedo),
    'park paint must stay under kerb concrete',
  );
});

test('road paint is the one thing allowed past kerb concrete, and not by much', () => {
  // Stage 4's stated exception, with a ceiling on it. A line more than about
  // half again the kerb's value would make the paint the brightest thing on the
  // ground by a margin nobody could read a kerb through.
  const kerb = luminance(MATERIALS.concrete.albedo);
  const road = luminance(MARKING_PAINTS.road.albedo);
  assert.ok(road > kerb, 'road paint is deliberately brighter than kerb concrete');
  assert.ok(road < kerb * 1.6, `road paint at ${road.toFixed(3)} overwhelms the kerb at ${kerb.toFixed(3)}`);
});

test('the widths are chase-camera widths, and a centre line is the widest line', () => {
  assert.ok(markingWidth('centre') > markingWidth('edge'), 'a centre line leads');
  assert.ok(markingWidth('bar') > markingWidth('centre'), 'a bar is a bar');
  for (const role of ['centre', 'edge', 'bar'] as const) {
    const width = markingWidth(role);
    // At the chase camera's six metres a 1000-pixel viewport is about 80 pixels
    // per metre, so anything under a tenth of a metre is under eight pixels and
    // shimmers away — `DESIGN.md` §6b's lesson, in its third system.
    assert.ok(width >= 0.10, `${role} at ${width} m is under eight pixels`);
    assert.ok(width <= 0.5, `${role} at ${width} m is a stripe, not a line`);
  }
});

test('a broken line repeats often enough to read as motion at riding speed', () => {
  const period = MARKINGS.dashLength + MARKINGS.dashGap;
  // `docs/PLANS.md` §6 beat 2: "lines as a speed cue". At the wheel's 15 m/s
  // top speed the rider has to cross at least one a second for that to be true,
  // and fewer than about four so they stay countable rather than becoming a
  // texture.
  const perSecond = 15 / period;
  assert.ok(perSecond >= 1, `only ${perSecond.toFixed(2)} marks a second at top speed`);
  assert.ok(perSecond <= 4, `${perSecond.toFixed(2)} marks a second reads as a texture`);
  assert.ok(MARKINGS.dashGap > MARKINGS.dashLength, 'a broken line is more gap than mark');
});

test('the paint sits above the ground by less than the kerb threshold notices', () => {
  // Render-only, so nothing can sample it — but a lift large enough to be worth
  // arguing about would also be visible as a floating strip at a shallow angle.
  assert.ok(MARKINGS.lift > 0, 'zero lift is a z-fight');
  assert.ok(MARKINGS.lift < 0.04, 'the lift must stay under TERRAIN.curbThreshold');
});

test('paint only goes on surfaces somebody would paint', () => {
  assert.deepEqual(
    [...PAINTABLE_SURFACES].sort(),
    ['brick', 'pavement', 'roughPavement', 'wood'],
  );
  for (const loose of ['grass', 'gravel', 'dirt'] as const) {
    assert.ok(!PAINTABLE_SURFACES.includes(loose), `${loose} is not a paintable surface`);
  }
});

test('the sampling step follows the tightest arc the slice paints', () => {
  // The safe route's corners are 34 m of radius. A chord of `sampleStep` across
  // that radius departs from the true arc by step^2 / (8 * radius), and a
  // departure worth a fifth of the line's own width is a polygon.
  const departure = MARKINGS.sampleStep ** 2 / (8 * 34);
  assert.ok(
    departure < MARKINGS.centreWidth * 0.2,
    `a ${MARKINGS.sampleStep} m step departs ${departure.toFixed(3)} m from a 34 m arc`,
  );
});

test('the table is frozen, so a paint cannot be rewritten at runtime', () => {
  assert.throws(() => {
    (MARKING_PAINTS.road as { albedo: number }).albedo = 0;
  });
});
