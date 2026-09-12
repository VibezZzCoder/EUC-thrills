/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LIGHTING } from './tuning.ts';
import {
  DAYLIGHT_LOOK,
  resolveVenueLook,
  sameSkyPaint,
  type ResolvedVenueLook,
  type VenueLook,
} from './venueLook.ts';

/**
 * The venue look — M36 Phase 4.
 *
 * One property here is worth more than the rest, and it is the one §36.7 asks
 * for by name: **today's daylight is the default for every existing world**.
 * BelVar, the slice, the proving ground and every generated route author no
 * look, and the frame they are judged in must be the frame they shipped in, to
 * the constant. That is checked twice — here, field by field against
 * `LIGHTING`, and in `render/sky.test.ts`, where the painted sky the default
 * produces is compared to the pre-M36 parameter list byte for byte.
 *
 * Nothing here imports three.js, because nothing in `data/venueLook.ts` does.
 */

/** Every field of a look, spelled once so a forgotten one cannot hide. */
const FIELDS: readonly (keyof ResolvedVenueLook)[] = [
  'sunAzimuth',
  'sunElevation',
  'sunColour',
  'sunIntensity',
  'skyColour',
  'groundBounceColour',
  'hemisphereIntensity',
  'horizonColour',
  'skyZenithColour',
  'skySunColour',
  'fogNear',
  'fogFar',
  'exposure',
];

test('an absent descriptor is today’s LIGHTING, field for field', () => {
  const resolved = resolveVenueLook(undefined);

  assert.equal(resolved.sunAzimuth, LIGHTING.sunAzimuth);
  assert.equal(resolved.sunElevation, LIGHTING.sunElevation);
  assert.equal(resolved.sunColour, LIGHTING.sunColour);
  assert.equal(resolved.sunIntensity, LIGHTING.sunIntensity);
  assert.equal(resolved.skyColour, LIGHTING.skyColour);
  assert.equal(resolved.groundBounceColour, LIGHTING.groundBounceColour);
  assert.equal(resolved.hemisphereIntensity, LIGHTING.hemisphereIntensity);
  assert.equal(resolved.horizonColour, LIGHTING.horizonColour);
  assert.equal(resolved.skyZenithColour, LIGHTING.skyZenithColour);
  assert.equal(resolved.skySunColour, LIGHTING.skySunColour);
  assert.equal(resolved.fogNear, LIGHTING.fogNear);
  assert.equal(resolved.fogFar, LIGHTING.fogFar);
  assert.equal(resolved.exposure, LIGHTING.exposure);

  // And nothing else: a field added to the look and forgotten in `FIELDS`
  // would slip past the thirteen assertions above.
  assert.deepEqual([...Object.keys(resolved)].sort(), [...FIELDS].sort());
});

test('an empty descriptor and an absent one are the same look', () => {
  // A venue may author `{}` — a world that means "daylight, explicitly" — and
  // it must not be a different frame from a world that says nothing at all.
  assert.deepEqual(resolveVenueLook({}), DAYLIGHT_LOOK);
  assert.equal(resolveVenueLook(undefined), DAYLIGHT_LOOK, 'and it allocates nothing');
});

test('a partial descriptor changes what it names and nothing else', () => {
  const warm: VenueLook = { sunElevation: 0.58, sunColour: 0xffd9a8, exposure: 1.06 };
  const resolved = resolveVenueLook(warm);

  assert.equal(resolved.sunElevation, 0.58);
  assert.equal(resolved.sunColour, 0xffd9a8);
  assert.equal(resolved.exposure, 1.06);

  const moved = FIELDS.filter((field) => resolved[field] !== DAYLIGHT_LOOK[field]);
  assert.deepEqual(
    [...moved].sort(),
    ['exposure', 'sunColour', 'sunElevation'],
    'a venue authors only what it means to change; the rest is the shipped daylight',
  );
});

test('a resolved look cannot be edited after the fact', () => {
  // The renderer hands it out (`GameRenderer.venueLook`) and a consumer that
  // wrote to it would be changing the frame from outside its one owner.
  const resolved = resolveVenueLook({ exposure: 1.2 });
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(DAYLIGHT_LOOK));
});

test('the sky repaints when a sky field moves, and only then', () => {
  // `sameSkyPaint` is what lets a venue swap skip a 1024x512 repaint, so it
  // has to be exactly right in both directions: every field the painter reads
  // must break it, and every field it does not read must not.
  const skyFields: readonly (keyof VenueLook)[] = [
    'skyZenithColour',
    'horizonColour',
    'sunAzimuth',
    'sunElevation',
    'skySunColour',
  ];

  for (const field of skyFields) {
    const moved = resolveVenueLook({ [field]: DAYLIGHT_LOOK[field] + 1 });
    assert.equal(
      sameSkyPaint(moved, DAYLIGHT_LOOK),
      false,
      `moving ${field} must repaint the sky — render/sky.ts reads it`,
    );
  }

  for (const field of FIELDS) {
    if (skyFields.includes(field)) continue;
    const moved = resolveVenueLook({ [field]: DAYLIGHT_LOOK[field] + 1 });
    assert.equal(
      sameSkyPaint(moved, DAYLIGHT_LOOK),
      true,
      `moving ${field} reaches the lights, the haze or the exposure, never the `
        + 'painted image, so it must not cost a texture',
    );
  }
});
