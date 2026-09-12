/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { wordLength, wordStrokes } from '../shared/letterPaths.ts';
import { MATERIALS } from './surfaces.ts';
import { CAMERA, EUC, HAZARD } from './tuning.ts';
import {
  MARKING_PAINTS,
  MARKINGS,
  PAINTABLE_SURFACES,
  PARK_SIGN_WORDS,
  SIGNS,
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
  // M36's fourth role sits between them: a letter stroke has to survive being
  // read from the far end of a sign's own lead, which is much further away than
  // a lane line is ever read from, but it is not a bar and must not look like a
  // threshold laid on its side.
  assert.ok(markingWidth('glyph') > markingWidth('centre'), 'a glyph stroke is read from forty metres');
  assert.ok(markingWidth('bar') > markingWidth('glyph'), 'a glyph stroke became a bar');
  for (const role of ['centre', 'edge', 'bar', 'glyph'] as const) {
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

// ---------------------------------------------------------------------------
// Ground signage — M36 Phase 2
// ---------------------------------------------------------------------------

test('every approved word can actually be printed, and is short enough to read', () => {
  // The list and the alphabet are two files and could drift apart in either
  // direction: a word nobody can spell throws at build time in the middle of a
  // venue, and a glyph nobody prints is the thing `letterPaths.ts` spent three
  // paragraphs arguing against. Both directions, here.
  for (const word of PARK_SIGN_WORDS) {
    assert.doesNotThrow(() => wordStrokes(word, 1), `the alphabet cannot spell ${word}`);
    assert.ok(/^[A-Z0-9]+$/.test(word), `${word} is not signage copy`);
    // `docs/PLANS.md` §36.4: copy is limited to what can be read in motion. At
    // the venue's fastest approach a rider covers 18 m a second, so a word they
    // must read *and act on* inside `SIGNS.readSeconds` cannot be a sentence.
    assert.ok(word.length <= 6, `${word} is too long to read at speed`);
  }
  assert.equal(
    new Set(PARK_SIGN_WORDS).size, PARK_SIGN_WORDS.length,
    'a word is on the approved list twice',
  );
  // The three §36.4 names by hand, so a future edit cannot quietly drop one.
  for (const named of ['180', 'TAP', 'DOWN'] as const) {
    assert.ok(PARK_SIGN_WORDS.includes(named), `${named} is named in §36.4 and is not on the list`);
  }
  assert.throws(() => {
    (PARK_SIGN_WORDS as unknown as string[]).push('SPONSOR');
  }, 'the approved list can be extended at runtime');
});

test('a sign leads its feature by a distance the rider can stop inside', () => {
  // The rule `level/parkSignage.ts` places every sign by, restated here against
  // the tuning it is derived from rather than against a number typed twice.
  const brake = EUC.brakeAuthority * Math.sin(EUC.maxLeanPitch);
  assert.ok(
    Math.abs(brake - 10.547) < 0.01,
    `full-lean braking came out at ${brake.toFixed(3)} m/s^2`,
  );
  const lead = (mps: number): number => SIGNS.readSeconds * mps + (mps * mps) / (2 * brake);

  // The kicker's approach, and the argument for 1.5 s: 40 mph is 17.88 m/s, so
  // the rule asks for 26.8 m of reading and 15.2 m of braking. That total has
  // to land on `HAZARD.readMetres`, the sight window the route validator
  // already holds every generated world to — a sign further out than the venue
  // guarantees a rider can see is a sign nobody reads.
  const fast = 40 * 0.44704;
  assert.ok(
    Math.abs(lead(fast) - HAZARD.readMetres) < HAZARD.readMetres * 0.06,
    `a 40 mph sign leads by ${lead(fast).toFixed(1)} m against a ${HAZARD.readMetres} m sight window`,
  );
  // And it is monotonic in speed, which is the only property the placement
  // search actually relies on.
  for (let mph = 5; mph < 45; mph += 5) {
    assert.ok(lead((mph + 5) * 0.44704) > lead(mph * 0.44704), `the lead fell between ${mph} mph and ${mph + 5}`);
  }
  assert.ok(SIGNS.readSeconds >= 1 && SIGNS.readSeconds <= 2.5, 'a read time nobody could defend');
});

test('a sign pad is bigger than the cell grid that has to carry it', () => {
  // A surface belongs to a heightfield *cell*, and the park is sampled every
  // 1.5 m. A pad authored exactly as wide as its paint would lose half a cell
  // off every edge to the dirt underneath, and the clipper would eat the ends
  // of every word on the venue without saying so.
  const parkSpacing = 1.5;
  assert.ok(SIGNS.padMargin > parkSpacing, `a ${SIGNS.padMargin} m margin does not clear a ${parkSpacing} m cell`);
  assert.ok(SIGNS.landingPadMargin > MARKINGS.colliderClearance * 4, 'a landing box has no pad under its corners');

  // The elongation is what makes a flat mark readable from its own lead, and a
  // letter that is not at least twice as long as it is wide is not stretched.
  assert.ok(SIGNS.glyphElongation >= 2, 'the text is not stretched enough to survive foreshortening');
  assert.ok(SIGNS.glyphElongation <= 4, 'the text is stretched past what a road sign looks like');
  // And the stroke has to fit inside the letter with counters left over.
  assert.ok(
    markingWidth('glyph') < SIGNS.glyphAcross * 0.4,
    'the stroke is so wide the letter has no holes in it',
  );
  assert.ok(SIGNS.chevronPitch > SIGNS.chevronLength, 'chevrons overlap each other');
  assert.ok(
    SIGNS.bypassTaperLength > SIGNS.chevronLength * 2,
    'the bypass arrow is not a visibly different shape from a chevron',
  );
});

test('two letters are separated by more ground than either of them is ink', () => {
  // **The measurement behind `glyphTracking`, and the reason it is not
  // `shared/letterPaths.ts`'s own default.** The browser pass photographed
  // `DOWN` on the staircase's pad and reported it reading close to `DUWN` at a
  // 1000x700 pane and as a smear at a four-seat quarter of one. The stroke is
  // not the problem — the same photographs show the chevrons, drawn at exactly
  // this width, reading as arrows in every pane. What fails first is the gap:
  // at `letterPaths`' wordmark tracking of 0.16 the ground between two letters
  // was 0.144 m against a 0.30 m stroke, so two letters were closer to each
  // other than either was to being a line, and they fused.
  //
  // At 0.16 this assertion fails (0.144 m against 0.225 m); at 0.30 it passes
  // with 0.270 m. It is the one legibility bound this project can state without
  // owning a font renderer, because it compares the word against the mark on
  // the same pad that is known to read.
  const gap = SIGNS.glyphTracking * SIGNS.glyphAcross;
  assert.ok(
    gap >= markingWidth('glyph') * 0.75,
    `letters are ${gap.toFixed(3)} m apart against a ${markingWidth('glyph')} m stroke`,
  );
  // And not so far apart that a word stops being a word.
  assert.ok(gap < markingWidth('glyph') * 2, 'the letters are further apart than they are wide');
  // The word still has to fit across a trail: the widest corridor the signage
  // paints on is 8 m either side and the technical line sits 4.25 m out.
  const longest = [...PARK_SIGN_WORDS].reduce((a, b) => (a.length >= b.length ? a : b));
  const across = wordLength(longest, SIGNS.glyphAcross / 0.62, SIGNS.glyphTracking);
  assert.ok(across < 8, `${longest} is ${across.toFixed(2)} m across and no corridor here is`);
});

test('a sign is sized against the narrowest pane the game is played in, not the widest', () => {
  // `paneAspect` is what turns the camera's vertical field of view into the
  // horizontal half-angle a mark has to stay inside. It is a portrait phone's,
  // which is narrower than 1 — the desktop and four-seat panes are all wider —
  // so the angle derived from it is the tightest the game ever draws.
  assert.ok(SIGNS.paneAspect > 0 && SIGNS.paneAspect < 1, 'the narrowest pane is not portrait');
  const half = Math.atan(Math.tan(CAMERA.fovAtRest / 2) * SIGNS.paneAspect);
  assert.ok(half < CAMERA.fovAtRest / 2, 'a portrait pane sees more sideways than it does vertically');
  assert.ok(half > 0.15, 'the pane is so narrow no sign could ever be placed');

  // `readMetres` is where a glyph stroke falls under about three pixels on that
  // pane — the shimmer bound `MARKINGS.glyphWidth`'s own comment is sized by —
  // so it is where a scan back along the approach stops being worth doing.
  const panePixels = 412;
  const perMetre = panePixels / (2 * Math.tan(half) * SIGNS.readMetres);
  const stroke = markingWidth('glyph') * perMetre;
  assert.ok(stroke > 3, `a stroke is ${stroke.toFixed(1)} px at ${SIGNS.readMetres} m and not a mark`);
  assert.ok(stroke < 6, `a stroke is still ${stroke.toFixed(1)} px at ${SIGNS.readMetres} m — scan further`);
});
