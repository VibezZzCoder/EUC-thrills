/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  hexToLinear,
  linearToSrgb,
  paintSky,
  skyDirection,
  skyDirectionUv,
  srgbToLinear,
  type SkyParams,
} from './skyImage.ts';

/**
 * The painted sky.
 *
 * `render/skyImage.ts` imports nothing, so all of this runs at `node --test`
 * with no canvas, no WebGL, and no DOM — which is the only reason a background
 * gets tested at all rather than being judged by eye in a screenshot.
 *
 * Three properties here are worth more than the rest:
 *
 * - The angle maths round-trips. The sun in the painted sky and the direction
 *   the shadow-casting light points are derived from the same two constants
 *   (`AGENTS.md`: derive, never eyeball), so if the projection drifts the
 *   painted sun and the shadows disagree and nothing errors.
 * - The transfer functions run the right way. The project has shipped
 *   double-decoded colour repeatedly (`DESIGN.md` §2, §6b), and a sky blended
 *   in the wrong space wears a dirty band halfway up.
 * - The buffer is deterministic. `DESIGN.md` §4 rule 3: a sky that differs
 *   between boots makes every visual regression capture meaningless.
 *
 * Textures are deliberately tiny (64x32) — the properties are per-texel, and
 * the headless suite is meant to stay instant.
 */

/** Roughly the slice's daytime sky, at a size a test can afford. */
const BASE: SkyParams = {
  width: 64,
  height: 32,
  zenithColour: 0x9dc4ea,
  horizonColour: 0xbcd6ee,
  gradientExponent: 0.65,
  sunAzimuth: 2.36,
  sunElevation: 0.96,
  sunColour: 0xfff4e6,
  sunCoreSpread: 0.05,
  sunGlowSpread: 0.42,
  sunGlowStrength: 0.35,
  // Off by default so the sun-position and cloud-brightness assertions below
  // measure the sun and the clouds rather than the horizon warmth. The
  // warmth's own contract — exactly zero at the horizon — is asserted
  // separately, with it switched on.
  sunHorizonWarmth: 0,
  sunHorizonSpread: 1.0,
  sunHorizonPeak: 0.2,
  // Pure white on purpose: a cloud is then brighter than either sky endpoint,
  // so "no clouds" and "clouds" are separable by brightness alone below.
  cloudLitColour: 0xffffff,
  cloudShadeColour: 0xb9c4d2,
  cloudCoverage: 0.45,
  cloudSoftness: 0.12,
  cloudScale: 1.6,
  cloudHorizonFade: 0.08,
};

/** The same sky with the clouds switched off. */
const CLEAR: SkyParams = { ...BASE, cloudCoverage: 0 };

const channels = (hex: number): [number, number, number] => (
  [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
);

/** Signed angle difference, wrapped to (-pi, pi]. */
const wrapAngle = (radians: number): number => (
  radians - Math.PI * 2 * Math.floor((radians + Math.PI) / (Math.PI * 2))
);

test('a bearing and an elevation survive the trip to a direction and back', () => {
  // The load-bearing one. `render/sky.ts` places the painted sun from these two
  // constants and the directional light is aimed from the same two; the moment
  // the projection and its inverse disagree, the sun is in one place and the
  // shadows fall as though it were in another, with no error anywhere.
  const elevations = [-1.2, -0.4, 0, 0.15, 0.6, 0.96, 1.3];
  const azimuths = [-2.9, -1.1, 0, 0.7, 2.36, 3.0, 5.9];

  for (const elevation of elevations) {
    for (const azimuth of azimuths) {
      const uv = skyDirectionUv(skyDirection(azimuth, elevation));

      // `paintSky` walks rows as `latitude = pi * (v - 0.5)`, so this is the
      // elevation the painter would put at that row.
      const paintedElevation = Math.PI * (uv.v - 0.5);
      assert.ok(
        Math.abs(paintedElevation - elevation) < 1e-12,
        `elevation ${elevation} came back as ${paintedElevation}`,
      );

      // And columns as `longitude = 2pi * (u - 0.5)` with `x = cos(longitude)`,
      // while `skyDirection` puts the bearing on `x = sin(azimuth)`. The
      // quarter turn between those two is the conversion, and getting its sign
      // wrong mirrors the sky east-for-west.
      const longitude = Math.PI * 2 * (uv.u - 0.5);
      const paintedAzimuth = Math.PI / 2 - longitude;
      assert.ok(
        Math.abs(wrapAngle(paintedAzimuth - azimuth)) < 1e-9,
        `azimuth ${azimuth} came back as ${paintedAzimuth}`,
      );
    }
  }
});

test('skyDirection is a unit vector whose +Y is sin(elevation)', () => {
  for (const elevation of [-Math.PI / 2, -0.8, 0, 0.96, Math.PI / 2]) {
    for (const azimuth of [0, 1.4, 2.36, 4.7]) {
      const direction = skyDirection(azimuth, elevation);
      const length = Math.hypot(direction.x, direction.y, direction.z);
      assert.ok(Math.abs(length - 1) < 1e-12, `length ${length} at ${azimuth}/${elevation}`);
      // +Y is up (AGENTS.md world conventions). If this were cos, the sun
      // would sit on the horizon at noon.
      assert.ok(Math.abs(direction.y - Math.sin(elevation)) < 1e-12);
    }
  }
});

test('straight up is v = 1 and straight down is v = 0, matching row 0 of the buffer', () => {
  // A `DataTexture` does not flip Y, so the first row of the buffer is the
  // nadir. The painter and this UV have to agree about that or the sky is
  // upside down — pale overhead, deep blue at the feet.
  assert.ok(Math.abs(skyDirectionUv(skyDirection(0, Math.PI / 2)).v - 1) < 1e-12);
  assert.ok(Math.abs(skyDirectionUv(skyDirection(0, -Math.PI / 2)).v - 0) < 1e-12);
  assert.ok(Math.abs(skyDirectionUv(skyDirection(0, 0)).v - 0.5) < 1e-12);
});

test('the painted sun lands where the light direction says it should', () => {
  // The round-trip above, proved against the pixels rather than against the
  // formula: the brightest texel in the buffer must be the texel the sun's own
  // UV falls in. A dim grey sun so the core does not clamp to 255 and leave a
  // plateau of tied maxima.
  const params: SkyParams = { ...CLEAR, width: 128, height: 64, sunColour: 0x808080 };
  const pixels = paintSky(params);

  let brightest = -1;
  let index = 0;
  for (let texel = 0; texel < params.width * params.height; texel += 1) {
    const offset = texel * 4;
    const luminance = 0.2126 * pixels[offset]
      + 0.7152 * pixels[offset + 1]
      + 0.0722 * pixels[offset + 2];
    if (luminance > brightest) {
      brightest = luminance;
      index = texel;
    }
  }

  const found = {
    u: ((index % params.width) + 0.5) / params.width,
    v: (Math.floor(index / params.width) + 0.5) / params.height,
  };
  const expected = skyDirectionUv(skyDirection(params.sunAzimuth, params.sunElevation));
  // One texel of slack in each axis: the sun centre almost never lands on a
  // texel centre. Measured 0.42 of a texel in u and 0.06 in v at this size.
  assert.ok(
    Math.abs(wrapAngle((found.u - expected.u) * Math.PI * 2)) < (Math.PI * 2) / params.width,
    `sun column at u=${found.u}, expected ${expected.u}`,
  );
  assert.ok(
    Math.abs(found.v - expected.v) < 1 / params.height,
    `sun row at v=${found.v}, expected ${expected.v}`,
  );
});

test('sRGB and linear are inverses, and mid-grey decodes to 0.214 linear', () => {
  for (let step = 0; step <= 1000; step += 1) {
    const srgb = step / 1000;
    assert.ok(
      Math.abs(linearToSrgb(srgbToLinear(srgb)) - srgb) < 1e-12,
      `sRGB ${srgb} did not survive the round trip`,
    );
    const linear = step / 1000;
    assert.ok(
      Math.abs(srgbToLinear(linearToSrgb(linear)) - linear) < 1e-12,
      `linear ${linear} did not survive the round trip`,
    );
  }

  assert.equal(srgbToLinear(0), 0);
  assert.equal(srgbToLinear(1), 1);
  assert.equal(linearToSrgb(0), 0);
  assert.ok(Math.abs(linearToSrgb(1) - 1) < 1e-12);

  // The direction check, and the reason this test exists at all: decoding
  // darkens and encoding brightens. Double-decoded colour has shipped four
  // times in this project (DESIGN.md §2, §6b) and it always looks like a
  // plausible art choice rather than a bug, so it needs an assertion with a
  // number in it.
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.2140) < 5e-4, `${srgbToLinear(0.5)} is not mid-grey`);
  assert.ok(linearToSrgb(0.5) > 0.7, `${linearToSrgb(0.5)} — encoding must brighten`);
});

test('hexToLinear reads the channels in the order the hex is written', () => {
  assert.deepEqual(hexToLinear(0xff0000), { r: 1, g: 0, b: 0 });
  assert.deepEqual(hexToLinear(0x00ff00), { r: 0, g: 1, b: 0 });
  assert.deepEqual(hexToLinear(0x0000ff), { r: 0, g: 0, b: 1 });
  assert.deepEqual(hexToLinear(0x000000), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToLinear(0xffffff), { r: 1, g: 1, b: 1 });

  // A value with three different channels, so a red/blue swap cannot pass by
  // symmetry — the sky's own colours are all blue-dominant, which is exactly
  // the case where a swap is least visible.
  const mixed = hexToLinear(0x336699);
  assert.ok(Math.abs(mixed.r - srgbToLinear(0x33 / 255)) < 1e-15);
  assert.ok(Math.abs(mixed.g - srgbToLinear(0x66 / 255)) < 1e-15);
  assert.ok(Math.abs(mixed.b - srgbToLinear(0x99 / 255)) < 1e-15);
  assert.ok(mixed.r < mixed.g && mixed.g < mixed.b);
});

test('paintSky fills every texel of an RGBA buffer, fully opaque', () => {
  const pixels = paintSky(BASE);
  assert.equal(pixels.length, BASE.width * BASE.height * 4);
  assert.ok(pixels instanceof Uint8ClampedArray);

  // A DataTexture reads the alpha byte. One transparent texel is a hole in the
  // sky that shows the clear colour through it.
  for (let offset = 3; offset < pixels.length; offset += 4) {
    assert.equal(pixels[offset], 255, `alpha ${pixels[offset]} at byte ${offset}`);
  }
});

test('the same parameters paint byte-identical skies', () => {
  // DESIGN.md §4 rule 3, as a hard assertion. Every stochastic element in the
  // sky is an integer hash rather than Math.random; the day one of them is not,
  // every screenshot comparison in the browser suite silently stops meaning
  // anything, and this is the only thing that would say so.
  assert.deepEqual(paintSky(BASE), paintSky(BASE));
  assert.deepEqual(paintSky({ ...BASE }), paintSky({ ...BASE }));
});

test('straight down is the flat horizon colour, across the whole row', () => {
  // Row 0 points at the ground. It is painted flat, and it is painted the fog
  // colour by contract (skyImage.ts header, AGENTS.md invariant 6): a gap at
  // the edge of the level surround then shows the value the haze is already
  // fading into instead of a bright line.
  //
  // Exact equality, not a tolerance: the ramp contributes nothing below the
  // horizon, so the byte is just the hex decoded and re-encoded, and that
  // round-trip is exact to well inside half a byte.
  const pixels = paintSky(BASE);
  const [r, g, b] = channels(BASE.horizonColour);
  for (let column = 0; column < BASE.width; column += 1) {
    const offset = column * 4;
    assert.deepEqual(
      [pixels[offset], pixels[offset + 1], pixels[offset + 2]],
      [r, g, b],
      `nadir column ${column} is not the horizon colour`,
    );
  }
});

test('straight up is the zenith colour, to within the sun’s aureole', () => {
  const pixels = paintSky(CLEAR);
  const [r, g, b] = channels(CLEAR.zenithColour);
  const top = (CLEAR.height - 1) * CLEAR.width * 4;

  // Not exact, for two reasons that are both correct behaviour: the top row is
  // half a texel short of the true pole, so the ramp reaches climb ≈ 0.999
  // rather than 1; and at a sun elevation of 0.96 the zenith is 0.61 rad from
  // the sun, where the aureole still contributes about 2%. Measured worst
  // channel error at this size: 4 bytes with this sun, and 0 with a low one.
  const tolerance = 6;
  for (let column = 0; column < CLEAR.width; column += 1) {
    const offset = top + column * 4;
    assert.ok(
      Math.abs(pixels[offset] - r) <= tolerance
        && Math.abs(pixels[offset + 1] - g) <= tolerance
        && Math.abs(pixels[offset + 2] - b) <= tolerance,
      `zenith column ${column} is ${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`
        + ` against ${r},${g},${b}`,
    );
  }

  // The sky is deeper overhead than at the horizon, which is the whole point of
  // the ramp. Asserted as an ordering so tuning the two colours cannot break it.
  assert.ok(pixels[top] < channels(CLEAR.horizonColour)[0]);
});

test('cloudCoverage is wired: raising it puts brighter-than-sky cloud in the buffer', () => {
  const clear = paintSky(CLEAR);
  const overcast = paintSky({ ...BASE, cloudCoverage: 0.85 });
  assert.notDeepEqual(clear, overcast);

  // Not just "different": the clouds are lit white, so a real cloud shows up as
  // a texel brighter than either authored sky colour. A parameter that merely
  // perturbed the noise would pass the inequality above and fail this.
  const ceiling = Math.max(...channels(BASE.zenithColour), ...channels(BASE.horizonColour));
  let brightest = 0;
  for (let offset = 0; offset < overcast.length; offset += 4) {
    brightest = Math.max(brightest, overcast[offset + 2]);
  }
  assert.ok(brightest > ceiling, `brightest blue ${brightest} never exceeded the sky's ${ceiling}`);
});

test('a clear sky is never brighter than the two colours it was authored from', () => {
  // At coverage 0 the threshold sits at 1 and the noise field cannot cross it,
  // so away from the sun every texel must be a plain linear blend of the two
  // endpoints — and a blend is bounded by them. This is what would catch a
  // cloud leaking in at zero coverage, or noise being added to the ramp.
  const pixels = paintSky(CLEAR);
  const sun = skyDirection(CLEAR.sunAzimuth, CLEAR.sunElevation);
  const limit = channels(CLEAR.zenithColour).map(
    (channel, index) => Math.max(channel, channels(CLEAR.horizonColour)[index]),
  );

  let checked = 0;
  for (let row = 0; row < CLEAR.height; row += 1) {
    const latitude = Math.PI * ((row + 0.5) / CLEAR.height - 0.5);
    const y = Math.sin(latitude);
    const horizontal = Math.cos(latitude);
    for (let column = 0; column < CLEAR.width; column += 1) {
      const longitude = Math.PI * 2 * ((column + 0.5) / CLEAR.width - 0.5);
      const x = Math.cos(longitude) * horizontal;
      const z = Math.sin(longitude) * horizontal;
      const angle = Math.acos(Math.max(-1, Math.min(1, x * sun.x + y * sun.y + z * sun.z)));
      // Four glow radii out, the Gaussian is below the painter's own 0.001
      // cutoff, so the sun contributes exactly nothing here.
      if (angle <= 4 * CLEAR.sunGlowSpread) continue;

      const offset = (row * CLEAR.width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(
          pixels[offset + channel] <= limit[channel],
          `texel ${column},${row} channel ${channel} is ${pixels[offset + channel]},`
            + ` above the authored ${limit[channel]}`,
        );
      }
      checked += 1;
    }
  }
  // Guard the guard: an over-wide sun cone would leave nothing asserted.
  assert.ok(checked > CLEAR.width * CLEAR.height * 0.3, `only ${checked} texels were checked`);
});

test('the sun’s horizon warmth is exactly zero at the horizon, in every direction', () => {
  // The load-bearing half of the warmth term. It exists because the sun sits
  // at 55° and the chase camera sees about the first 25°, so without it no
  // part of the painted sun reaches the gameplay frame at all.
  //
  // But the haze is ONE flat colour, and `DESIGN.md` §6 requires the sky to
  // equal that colour where the ground's far edge meets it. A warmth that
  // survived down to the horizon would restore the horizon band the haze was
  // introduced to remove — and worse than before, because it would appear in
  // one compass direction only, which reads as a rendering fault rather than
  // as weather.
  //
  // "Zero at the horizon" is a LIMIT, and asserting it needs care: `paintSky`
  // samples row centres, so no row sits exactly on y = 0 and the first row
  // above it is already slightly warmed. Writing the check as "the middle row
  // is untouched" would therefore be asserting something false about a term
  // that is behaving correctly. Three claims instead, which together are what
  // "no visible band" actually means:
  //
  //   1. every texel at or below y = 0 is byte-identical,
  //   2. the first row above y = 0 has barely moved, and
  //   3. some row well above it has moved a lot — or 1 and 2 are vacuous.
  //
  // A tall, narrow texture, because the property is entirely in latitude and
  // the rows near the horizon are the ones under test.
  const warm: SkyParams = { ...CLEAR, width: 32, height: 512, sunHorizonWarmth: 0.6 };
  const warmed = paintSky(warm);
  const plain = paintSky({ ...warm, sunHorizonWarmth: 0 });

  const heightOf = (row: number): number => Math.sin(Math.PI * ((row + 0.5) / warm.height - 0.5));
  const worstIn = (row: number): number => {
    let worst = 0;
    for (let column = 0; column < warm.width; column += 1) {
      const offset = (row * warm.width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        worst = Math.max(worst, Math.abs(warmed[offset + channel] - plain[offset + channel]));
      }
    }
    return worst;
  };

  let firstAbove = -1;
  for (let row = 0; row < warm.height; row += 1) {
    if (heightOf(row) > 0) {
      firstAbove = row;
      break;
    }
    assert.equal(worstIn(row), 0, `row ${row} is at or below the horizon and must not move`);
  }
  assert.ok(firstAbove > 0, 'no row sits below the horizon — the fixture is wrong');

  // Measured at 512 rows: the first row above the horizon is y = 0.003, which
  // the window scales to about 4% of peak. One byte. That is the number that
  // says there is no seam.
  assert.ok(
    worstIn(firstAbove) <= 2,
    `the first row above the horizon moved by ${worstIn(firstAbove)} bytes — that is a band`,
  );

  // Guard the guard. A warmth wired to nothing would sail through both checks.
  const peakRow = warm.height / 2 + Math.round((Math.asin(warm.sunHorizonPeak) / Math.PI) * warm.height);
  assert.ok(
    worstIn(peakRow) >= 8,
    `the warmth only moved ${worstIn(peakRow)} bytes at its own peak — it is not wired`,
  );
});
