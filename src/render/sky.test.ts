/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIGHTING } from '../data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook, type VenueLook } from '../data/venueLook.ts';
import { createSky } from './sky.ts';
import { paintSky } from './skyImage.ts';

/**
 * The painted sky, now that a venue may author one — M36 Phase 4.
 *
 * `skyImage.test.ts` holds the *painter* to its properties. This file holds
 * the **wrapper** to the one thing §36.7 demands of the whole descriptor:
 * *"today's daylight as the default for every existing world."* BelVar, the
 * slice, the proving ground and every generated route author no look, so the
 * background behind them must be the image M7.5 shipped, byte for byte —
 * which is checked here against the literal pre-M36 parameter list rather
 * than against another call to the same function, because a function compared
 * to itself agrees no matter what it has been changed into.
 *
 * `THREE.DataTexture` needs no GL context, so all of this runs at
 * `node --test`.
 */

/** The RGBA buffer behind a `DataTexture`, as something comparable. */
function pixelsOf(texture: THREE.DataTexture): Buffer {
  const data = texture.image.data as Uint8ClampedArray;
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Exactly the arguments `createSky` passed before a look existed, transcribed
 * from the shipped source. **Not `resolveVenueLook()`** — the point is that
 * two independent spellings agree.
 */
const PRE_M36_PARAMS = {
  width: LIGHTING.skyTextureWidth,
  height: LIGHTING.skyTextureHeight,
  zenithColour: LIGHTING.skyZenithColour,
  horizonColour: LIGHTING.horizonColour,
  gradientExponent: LIGHTING.skyGradientExponent,
  sunAzimuth: LIGHTING.sunAzimuth,
  sunElevation: LIGHTING.sunElevation,
  sunColour: LIGHTING.skySunColour,
  sunCoreSpread: LIGHTING.skySunCoreSpread,
  sunGlowSpread: LIGHTING.skySunGlowSpread,
  sunGlowStrength: LIGHTING.skySunGlowStrength,
  sunHorizonWarmth: LIGHTING.skySunHorizonWarmth,
  sunHorizonSpread: LIGHTING.skySunHorizonSpread,
  sunHorizonPeak: LIGHTING.skySunHorizonPeak,
  cloudLitColour: LIGHTING.skyCloudLitColour,
  cloudShadeColour: LIGHTING.skyCloudShadeColour,
  cloudCoverage: LIGHTING.skyCloudCoverage,
  cloudSoftness: LIGHTING.skyCloudSoftness,
  cloudScale: LIGHTING.skyCloudScale,
  cloudHorizonFade: LIGHTING.skyCloudHorizonFade,
} as const;

test('a world that authors no look gets the sky it shipped with, byte for byte', () => {
  const sky = createSky();
  try {
    assert.ok(
      pixelsOf(sky.texture).equals(Buffer.from(paintSky(PRE_M36_PARAMS).buffer)),
      'the default sky moved. Every existing world is judged in this image and '
        + 'the owner has ridden and published all of them — M36 §36.7 keeps '
        + 'today’s daylight as the default, so this is a stop-and-tell failure '
        + 'rather than a number to re-pin.',
    );
  } finally {
    sky.dispose();
  }
});

test('the resolved daylight look is the same argument list as no argument at all', () => {
  const implicit = createSky();
  const explicit = createSky(DAYLIGHT_LOOK);
  try {
    assert.ok(pixelsOf(implicit.texture).equals(pixelsOf(explicit.texture)));
  } finally {
    implicit.dispose();
    explicit.dispose();
  }
});

test('the texture the renderer hangs on the background is unchanged in every other respect', () => {
  // Mapping, colour space and wrapping are the difference between a sky and a
  // double-decoded stripe (`DESIGN.md` §2, §6b); a venue moves colours, never
  // these.
  for (const sky of [createSky(), createSky(resolveVenueLook({ horizonColour: 0xdfc8a8 }))]) {
    try {
      const { texture } = sky;
      assert.equal(texture.name, 'sky');
      assert.equal(texture.mapping, THREE.EquirectangularReflectionMapping);
      assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
      assert.equal(texture.wrapS, THREE.RepeatWrapping);
      assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
      assert.equal(texture.generateMipmaps, true);
      assert.equal(texture.image.width, LIGHTING.skyTextureWidth);
      assert.equal(texture.image.height, LIGHTING.skyTextureHeight);
    } finally {
      sky.dispose();
    }
  }
});

test('each field the painter reads repaints the sky, and no other field does', () => {
  // The other half of `sameSkyPaint`'s contract, asserted against the real
  // painter rather than against the predicate: a field the predicate calls
  // "not a sky field" while the painter reads it would make the renderer skip
  // a repaint the venue asked for, and the frame would wear the wrong sky
  // with no error anywhere.
  const daylight = createSky();
  const reference = pixelsOf(daylight.texture);

  const repaints: readonly (readonly [keyof VenueLook, number])[] = [
    ['skyZenithColour', 0x4d80c6],
    ['horizonColour', 0xdfc8a8],
    ['sunAzimuth', -1.75],
    ['sunElevation', 0.58],
    ['skySunColour', 0xffe0b0],
  ];
  for (const [field, value] of repaints) {
    const moved = createSky(resolveVenueLook({ [field]: value }));
    try {
      assert.ok(
        !pixelsOf(moved.texture).equals(reference),
        `${field} is painted into the sky and moving it must change the image`,
      );
    } finally {
      moved.dispose();
    }
  }

  const untouched: readonly (readonly [keyof VenueLook, number])[] = [
    ['sunColour', 0xffd9a8],
    ['sunIntensity', 2.45],
    ['skyColour', 0x8bb2e6],
    ['groundBounceColour', 0xb9a68d],
    ['hemisphereIntensity', 1.22],
    ['fogNear', 90],
    ['fogFar', 400],
    ['exposure', 1.06],
  ];
  for (const [field, value] of untouched) {
    const moved = createSky(resolveVenueLook({ [field]: value }));
    try {
      assert.ok(
        pixelsOf(moved.texture).equals(reference),
        `${field} reaches the lights, the haze or the exposure — never the `
          + 'painted image — so it must not cost a repaint',
      );
    } finally {
      moved.dispose();
    }
  }

  daylight.dispose();
});
