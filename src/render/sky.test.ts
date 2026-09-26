/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIGHTING, ULTRA } from '../data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook, type VenueLook } from '../data/venueLook.ts';
import { createSky, cumulusSeedFor, daylightCumulus, sameSkyOptions, skyParamsFor, wearsDaylightSky, type SkyOptions } from './sky.ts';
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

// ---------------------------------------------------------------------------
// M39 Ultra — the optional second argument
// ---------------------------------------------------------------------------

/** What `ultraSkyOptions` returns on a device with anisotropy to spare. */
const ULTRA_OPTIONS: SkyOptions = {
  width: ULTRA.sky.width,
  height: ULTRA.sky.height,
  anisotropy: ULTRA.sky.anisotropy,
  fineOctaveAmplitude: ULTRA.sky.fineOctaveAmplitude,
  daylightClouds: true,
  cloudSoftnessScale: ULTRA.sky.cloudSoftnessScale,
};

test('an empty options object is no options object: every byte and field of the ordinary sky', () => {
  const plain = createSky(DAYLIGHT_LOOK);
  const empty = createSky(DAYLIGHT_LOOK, {});
  const park = resolveVenueLook({ horizonColour: 0xdfc8a8, sunElevation: 0.58, sunAzimuth: -1.75 });
  const parkPlain = createSky(park);
  const parkEmpty = createSky(park, {});
  try {
    assert.ok(pixelsOf(empty.texture).equals(pixelsOf(plain.texture)));
    assert.ok(pixelsOf(parkEmpty.texture).equals(pixelsOf(parkPlain.texture)));
    assert.equal(empty.texture.anisotropy, 1);
    assert.equal(plain.texture.anisotropy, 1);
    // The painter's argument list is the pre-M39 one: no Ultra keys at all.
    assert.deepEqual(Object.keys(skyParamsFor(DAYLIGHT_LOOK, {})).sort(), Object.keys(PRE_M36_PARAMS).sort());
  } finally {
    for (const sky of [plain, empty, parkPlain, parkEmpty]) sky.dispose();
  }
});

test('the Ultra sky is 2048×1024 at anisotropy 4, and otherwise the same texture', () => {
  const sky = createSky(DAYLIGHT_LOOK, ULTRA_OPTIONS);
  try {
    const { texture } = sky;
    assert.equal(texture.image.width, 2048);
    assert.equal(texture.image.height, 1024);
    assert.equal(texture.anisotropy, 4);
    assert.equal(texture.name, 'sky');
    assert.equal(texture.mapping, THREE.EquirectangularReflectionMapping);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
    assert.equal(texture.generateMipmaps, true);
  } finally {
    sky.dispose();
  }
});

test('the Ultra sky’s horizon row is the horizon colour, and nothing below the cloud floor moves', () => {
  // Compared at the same size, so the only differences are the Ultra details.
  for (const look of [DAYLIGHT_LOOK, resolveVenueLook({ horizonColour: 0xdfc8a8, sunElevation: 0.58, sunAzimuth: -1.75, skyZenithColour: 0x4d80c6, skySunColour: 0xffe0b0 })]) {
    const sized: SkyOptions = { width: 512, height: 256 };
    const plain = paintSky(skyParamsFor(look, sized));
    const ultra = paintSky(skyParamsFor(look, { ...ULTRA_OPTIONS, ...sized }));
    let floorRow = 0;
    while (Math.sin(Math.PI * ((floorRow + 0.5) / 256 - 0.5)) <= LIGHTING.skyCloudHorizonFade) floorRow += 1;
    const end = floorRow * 512 * 4;
    assert.ok(Buffer.from(ultra.buffer, 0, end).equals(Buffer.from(plain.buffer, 0, end)));
    const nadir = [ultra[0], ultra[1], ultra[2]];
    assert.deepEqual(nadir, [(look.horizonColour >> 16) & 0xff, (look.horizonColour >> 8) & 0xff, look.horizonColour & 0xff]);
  }
});

test('the cumulus is the daylight skies’ alone: Switchback keeps its own clouds', () => {
  const park = resolveVenueLook({
    horizonColour: 0xdfc8a8, sunElevation: 0.58, sunAzimuth: -1.75, skyZenithColour: 0x4d80c6, skySunColour: 0xffe0b0,
  });
  assert.equal(wearsDaylightSky(DAYLIGHT_LOOK), true);
  assert.equal(wearsDaylightSky(resolveVenueLook({ sunIntensity: 2.2, fogNear: 90 })), true);
  assert.equal(wearsDaylightSky(park), false);
  assert.ok(skyParamsFor(DAYLIGHT_LOOK, ULTRA_OPTIONS).cumulus !== undefined);
  assert.equal(skyParamsFor(park, ULTRA_OPTIONS).cumulus, undefined);
  // Without the flag, not even daylight gets it.
  assert.equal(skyParamsFor(DAYLIGHT_LOOK, { ...ULTRA_OPTIONS, daylightClouds: false }).cumulus, undefined);
});

test('the tier is part of the repaint key: sameSkyOptions', () => {
  assert.equal(sameSkyOptions({}, {}), true);
  assert.equal(sameSkyOptions({}, { width: LIGHTING.skyTextureWidth, height: LIGHTING.skyTextureHeight, anisotropy: 1 }), true);
  assert.equal(sameSkyOptions({}, ULTRA_OPTIONS), false);
  assert.equal(sameSkyOptions(ULTRA_OPTIONS, { ...ULTRA_OPTIONS }), true);
  assert.equal(sameSkyOptions(ULTRA_OPTIONS, { ...ULTRA_OPTIONS, anisotropy: 2 }), false);
  assert.equal(sameSkyOptions(ULTRA_OPTIONS, { ...ULTRA_OPTIONS, daylightClouds: false }), false);
  assert.equal(sameSkyOptions(ULTRA_OPTIONS, { ...ULTRA_OPTIONS, cloudSoftnessScale: 1 }), false);
  assert.equal(sameSkyOptions({}, { cloudSoftnessScale: 1 }), true);
});

test('the Ultra wisps are sharper, not moved: softness scales the ramp, the threshold stays', () => {
  const park = resolveVenueLook({
    horizonColour: 0xdfc8a8, sunElevation: 0.58, sunAzimuth: -1.75, skyZenithColour: 0x4d80c6, skySunColour: 0xffe0b0,
  });
  const sized: SkyOptions = { width: 256, height: 128 };
  const soft = skyParamsFor(park, sized);
  const sharp = skyParamsFor(park, { ...sized, cloudSoftnessScale: 0.6 });
  assert.equal(sharp.cloudSoftness, soft.cloudSoftness * 0.6);
  assert.equal(sharp.cloudCoverage, soft.cloudCoverage);
  // A clear texel stays clear and a cloudy one stays cloudy: only how fast a
  // cloud's edge reaches full opacity changes.
  const clear = paintSky({ ...soft, cloudLitColour: soft.zenithColour, cloudShadeColour: soft.zenithColour });
  const a = paintSky(soft);
  const b = paintSky(sharp);
  let cloudyBoth = 0;
  for (let i = 0; i < a.length; i += 4) {
    const inA = a[i] !== clear[i] || a[i + 1] !== clear[i + 1] || a[i + 2] !== clear[i + 2];
    const inB = b[i] !== clear[i] || b[i + 1] !== clear[i + 1] || b[i + 2] !== clear[i + 2];
    if (!inA) assert.ok(!inB || Math.abs(b[i] - clear[i]) <= 1, 'a clear texel clouded over');
    if (inA && inB) cloudyBoth += 1;
  }
  assert.ok(cloudyBoth > 0);
  // Absent or 1 is the construction's own softness, exactly.
  assert.deepEqual(skyParamsFor(park, { ...sized, cloudSoftnessScale: 1 }), soft);
  // A daylight sky keeps High's wisps: its Ultra detail is the cumulus.
  assert.equal(skyParamsFor(DAYLIGHT_LOOK, { ...sized, cloudSoftnessScale: 0.6 }).cloudSoftness, LIGHTING.skyCloudSoftness);
});

// ---------------------------------------------------------------------------
// Wave 3 (R-L): the rebuilt cumulus — seeded per plan, white, above the haze
// ---------------------------------------------------------------------------

test('each plan seeds its own cumulus, and the seed is part of the repaint key', () => {
  // Stable across calls and sessions (FNV-1a), different between plans.
  assert.equal(cumulusSeedFor('generated-r6-euc'), cumulusSeedFor('generated-r6-euc'));
  const seeds = new Set(['generated-r6-euc', 'm7-slice', 'belvar-r1', 'switchback-r4', 'proving'].map(cumulusSeedFor));
  assert.equal(seeds.size, 5);
  assert.ok([...seeds].every((seed) => Number.isInteger(seed) && seed === (seed | 0)));
  // The seed reaches the painter only through the daylight cumulus.
  const plaza = skyParamsFor(DAYLIGHT_LOOK, { ...ULTRA_OPTIONS, cloudSeed: cumulusSeedFor('generated-r6-euc') });
  const belvar = skyParamsFor(DAYLIGHT_LOOK, { ...ULTRA_OPTIONS, cloudSeed: cumulusSeedFor('belvar-r1') });
  assert.notEqual(plaza.cumulus?.seed, belvar.cumulus?.seed);
  assert.equal(skyParamsFor(DAYLIGHT_LOOK, ULTRA_OPTIONS).cumulus?.seed, 0);
  // A new plan on an unchanged look and tier must still repaint.
  assert.equal(sameSkyOptions({ ...ULTRA_OPTIONS, cloudSeed: 7 }, { ...ULTRA_OPTIONS, cloudSeed: 8 }), false);
  assert.equal(sameSkyOptions({ ...ULTRA_OPTIONS, cloudSeed: 0 }, ULTRA_OPTIONS), true);
  // The ordinary sky never sees a seed.
  assert.deepEqual(skyParamsFor(DAYLIGHT_LOOK, { cloudSeed: 7 }), skyParamsFor(DAYLIGHT_LOOK, {}));
});

test('the cumulus table keeps its promises: tops under the clip line, bases over the haze, band under the frame top', () => {
  const luma = (hex: number): number => 0.2126 * ((hex >> 16) & 0xff) + 0.7152 * ((hex >> 8) & 0xff) + 0.0722 * (hex & 0xff);
  const c = daylightCumulus();
  assert.ok(luma(c.litColour) <= 250, `lit tops at luma ${luma(c.litColour)}`);
  assert.ok(luma(c.shadeColour) >= luma(LIGHTING.horizonColour), `the base at ${luma(c.shadeColour)} is darker than the haze`);
  // The chase camera (64.74° vertical, horizon on row ≈ 410 of 1080) sees
  // 16.9° at its top corners; the whole band, billow and edge included, stays
  // under it, and every base clears the 2.6° haze band over the horizon.
  const degrees = 180 / Math.PI;
  assert.ok((c.topMax + c.edge) * degrees < 16.9);
  assert.ok(c.baseMin * degrees >= 8);
  assert.ok(c.baseMin > Math.asin(LIGHTING.skyCloudHorizonFade), 'the band starts under the wisps’ floor');
});
