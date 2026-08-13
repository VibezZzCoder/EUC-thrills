/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The sky, painted as an equirectangular image.
 *
 * **This file imports nothing** — not three, not the tuning tables — so the
 * whole sky is a pure function of its parameters and can be unit-tested at
 * `node --test` without a WebGL context, a canvas, or a DOM. `render/sky.ts`
 * wraps the buffer this returns in a `THREE.DataTexture`; nothing else here
 * knows that a GPU exists.
 *
 * It belongs to the coupled visual system (`DESIGN.md` §6, AGENTS.md invariant
 * 6) even though it is data rather than a light: the sky is the background the
 * distance haze dissolves into, so its horizon value and `LIGHTING.horizonColour`
 * are the same number by construction, and moving one without the other puts a
 * band back on the horizon.
 *
 * Colour is authored and blended in **linear** and encoded to sRGB on the way
 * out (`DESIGN.md` §2). Blending two sRGB values directly darkens the midpoint
 * of a gradient, which on a sky reads as a dirty band halfway up.
 *
 * Every stochastic element is a deterministic integer hash, never `Math.random`
 * — the same rule the ground mottle follows (`DESIGN.md` §4), for the same
 * reason: a sky that differs between boots makes every visual regression
 * capture meaningless.
 */

export interface SkyParams {
  /** Texture size. Equirectangular, so width should be twice height. */
  readonly width: number;
  readonly height: number;

  /** sRGB hex. Straight up. */
  readonly zenithColour: number;
  /** sRGB hex. At the horizon, and equal to the fog colour by contract. */
  readonly horizonColour: number;
  /**
   * Shapes the horizon-to-zenith ramp. Below 1 keeps the pale horizon value
   * close to the horizon, which is what a real sky does — most of the dome is
   * the deeper blue, and the pale band is thin.
   */
  readonly gradientExponent: number;

  /** Compass bearing from +Z toward +X, radians. Matches `LIGHTING.sunAzimuth`. */
  readonly sunAzimuth: number;
  /** Above the horizon, radians. Matches `LIGHTING.sunElevation`. */
  readonly sunElevation: number;
  /** sRGB hex of the sun's core and its aureole. */
  readonly sunColour: number;
  /** Angular radius of the bright core, radians. */
  readonly sunCoreSpread: number;
  /** Angular radius of the wide glow, radians. */
  readonly sunGlowSpread: number;
  /** How much of the glow reaches the sky, 0–1. */
  readonly sunGlowStrength: number;

  /**
   * Warmth added low in the sky, in the sun's compass direction, 0–1.
   *
   * Here because of a measurement rather than a preference. The sun sits at
   * 55° and the chase camera sees roughly the first 25° above the horizon, so
   * the painted sun, its aureole, and most of the cloud field are *never in
   * the gameplay frame*. Forward scattering is the part of a real sky that
   * does appear down there, and it is what tells a rider which way they are
   * facing relative to the light.
   *
   * **It must reach exactly zero at the horizon.** The haze is one flat
   * colour, and `DESIGN.md` §6 requires the sky to equal that colour where the
   * ground's far edge meets it. Warmth surviving down to y = 0 would put the
   * horizon band straight back, in one compass direction only — which is worse
   * than the uniform band it was introduced to remove. Hence a window that
   * peaks a few degrees up and vanishes at the line itself.
   */
  readonly sunHorizonWarmth: number;
  /** Angular half-width of that warmth in bearing, radians. */
  readonly sunHorizonSpread: number;
  /** Sky height, as sin(elevation), at which the warmth peaks. */
  readonly sunHorizonPeak: number;

  /** sRGB hex of a sunlit cloud top. */
  readonly cloudLitColour: number;
  /** sRGB hex of a cloud's shaded underside. */
  readonly cloudShadeColour: number;
  /** 0 is a clear sky, 1 is overcast. */
  readonly cloudCoverage: number;
  /** Edge softness, in noise units. Larger is wispier. */
  readonly cloudSoftness: number;
  /** Noise frequency on the cloud plane. Larger is smaller clouds. */
  readonly cloudScale: number;
  /** Sky direction below which clouds have faded out entirely, 0–1 in sin(elevation). */
  readonly cloudHorizonFade: number;
}

/** A direction on the unit sphere. +X rider-left, +Y up, +Z forward. */
export interface SkyDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where a compass bearing and an elevation land on the sky texture.
 *
 * three's equirectangular sampling is `u = atan2(z, x) / 2pi + 0.5` and
 * `v = asin(y) / pi + 0.5`, and a `DataTexture` does **not** flip Y, so `v = 0`
 * is the first row of the buffer and points straight down. Exported because
 * the sun's position in the painted sky is derived from the same two constants
 * that aim the directional light, never eyeballed (`AGENTS.md`) — and because a
 * derivation worth trusting is one a test can check.
 */
export function skyDirection(azimuth: number, elevation: number): SkyDirection {
  const horizontal = Math.cos(elevation);
  return {
    x: Math.sin(azimuth) * horizontal,
    y: Math.sin(elevation),
    z: Math.cos(azimuth) * horizontal,
  };
}

/** The equirectangular UV a direction samples. Inverse of the row/column walk below. */
export function skyDirectionUv(direction: SkyDirection): { u: number; v: number } {
  return {
    u: Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5,
    v: Math.asin(Math.max(-1, Math.min(1, direction.y))) / Math.PI + 0.5,
  };
}

/** sRGB 0–1 to linear 0–1. The exact piecewise transfer function, not the 2.2 approximation. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear 0–1 to sRGB 0–1. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

interface LinearColour {
  r: number;
  g: number;
  b: number;
}

/** An sRGB hex integer as linear reflectance. */
export function hexToLinear(hex: number): LinearColour {
  return {
    r: srgbToLinear(((hex >> 16) & 0xff) / 255),
    g: srgbToLinear(((hex >> 8) & 0xff) / 255),
    b: srgbToLinear((hex & 0xff) / 255),
  };
}

/**
 * Deterministic hash of two integers to 0–1.
 *
 * `Math.imul` keeps the multiply in 32 bits; without it the intermediate
 * exceeds 2^53, the low bits — the only ones that carry the hash — are rounded
 * away, and neighbouring cells start returning the same value.
 */
function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2b3f4e5d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967295;
}

/** Hermite fade, so the value noise below has a continuous first derivative. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on the integer lattice. */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Four octaves of value noise, normalised to 0–1. */
function fbm(x: number, y: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07; // Not exactly 2, so octaves do not line up on the lattice.
  }
  return sum / total;
}

/**
 * Paint the sky into an RGBA byte buffer, row 0 pointing straight down.
 *
 * Returns `width * height * 4` bytes, ready for a `THREE.DataTexture` at
 * `SRGBColorSpace`. Everything below the horizon is the flat horizon value: it
 * is never visible past the ground, and painting it the same value means a gap
 * at the very edge of the surround shows the colour the haze is already
 * fading into rather than a bright line.
 */
export function paintSky(params: SkyParams): Uint8ClampedArray {
  const { width, height } = params;
  const pixels = new Uint8ClampedArray(width * height * 4);

  const zenith = hexToLinear(params.zenithColour);
  const horizon = hexToLinear(params.horizonColour);
  const sunLinear = hexToLinear(params.sunColour);
  const cloudLit = hexToLinear(params.cloudLitColour);
  const cloudShade = hexToLinear(params.cloudShadeColour);

  const sun = skyDirection(params.sunAzimuth, params.sunElevation);

  // Clouds are sampled on a horizontal plane above the viewer rather than on
  // the sphere. Two reasons, and the second is the one that matters: a sphere
  // parameterisation pinches at the pole, so a cloud field painted in UV wears
  // a visible pinwheel straight overhead; and a plane projection compresses
  // the field toward the horizon exactly the way real cloud perspective does,
  // which is most of what sells a sky as having depth.
  const cloudFloor = Math.max(params.cloudHorizonFade, 1e-3);

  let offset = 0;
  for (let row = 0; row < height; row += 1) {
    const v = (row + 0.5) / height;
    const latitude = Math.PI * (v - 0.5);
    const y = Math.sin(latitude);
    const horizontal = Math.cos(latitude);

    // Horizon-to-zenith ramp, in linear, shaped so the pale band stays thin.
    const climb = Math.max(0, y) ** params.gradientExponent;
    const baseR = horizon.r + (zenith.r - horizon.r) * climb;
    const baseG = horizon.g + (zenith.g - horizon.g) * climb;
    const baseB = horizon.b + (zenith.b - horizon.b) * climb;

    // Clouds fade out below this, and the plane projection is clamped with
    // them: at y near zero the projected coordinate runs away and the noise
    // aliases into stripes.
    const cloudFade = y <= cloudFloor
      ? 0
      : smoothstep(Math.min(1, (y - cloudFloor) / (cloudFloor * 4 + 1e-6)));
    const projection = 1 / Math.max(y, cloudFloor);

    for (let column = 0; column < width; column += 1) {
      const u = (column + 0.5) / width;
      const longitude = Math.PI * 2 * (u - 0.5);
      const x = Math.cos(longitude) * horizontal;
      const z = Math.sin(longitude) * horizontal;

      let r = baseR;
      let g = baseG;
      let b = baseB;

      // Forward scattering low in the sun's direction — the only part of the
      // sun that reaches the gameplay frame. See `sunHorizonWarmth`.
      //
      // The bearing term uses the horizontal components only, so it is a
      // compass falloff and not an angular one: it must not narrow as the
      // elevation rises, or the warm patch would taper to a point.
      if (params.sunHorizonWarmth > 0 && y > 0) {
        const horizontalLength = Math.hypot(x, z) || 1e-6;
        const sunHorizontal = Math.hypot(sun.x, sun.z) || 1e-6;
        const bearingCos = (x * sun.x + z * sun.z) / (horizontalLength * sunHorizontal);
        const bearing = Math.acos(Math.max(-1, Math.min(1, bearingCos)));
        const alongBearing = Math.exp(-((bearing / params.sunHorizonSpread) ** 2));
        // Zero at the horizon, peaking at `sunHorizonPeak`, gone well above
        // it. `y / peak * exp(1 - y / peak)` is 0 at y = 0 and exactly 1 at
        // the peak, which makes the constant mean what its name says.
        const climbRatio = y / Math.max(params.sunHorizonPeak, 1e-4);
        const withHeight = climbRatio * Math.exp(1 - climbRatio);
        const warmth = params.sunHorizonWarmth * alongBearing * withHeight;
        if (warmth > 0.001) {
          r += (sunLinear.r - r) * warmth;
          g += (sunLinear.g - g) * warmth;
          b += (sunLinear.b - b) * warmth;
        }
      }

      if (cloudFade > 0) {
        const px = x * projection;
        const pz = z * projection;
        const density = fbm(px * params.cloudScale, pz * params.cloudScale);
        // Coverage is a threshold on the field, so raising it grows the
        // existing clouds instead of adding new ones somewhere else — which
        // is what makes the value tunable by eye without the sky reshuffling.
        const threshold = 1 - params.cloudCoverage;
        const opacity = Math.max(
          0,
          Math.min(1, (density - threshold) / Math.max(params.cloudSoftness, 1e-4)),
        ) * cloudFade;

        if (opacity > 0) {
          // Thicker cloud is lit on top and shaded through its body. Using the
          // density itself as the mix means the soft edges read as thin and
          // translucent rather than as a flat cutout with a blurred border.
          const lit = Math.min(1, (density - threshold) / 0.35);
          const cr = cloudShade.r + (cloudLit.r - cloudShade.r) * lit;
          const cg = cloudShade.g + (cloudLit.g - cloudShade.g) * lit;
          const cb = cloudShade.b + (cloudLit.b - cloudShade.b) * lit;
          const alpha = smoothstep(opacity);
          r += (cr - r) * alpha;
          g += (cg - g) * alpha;
          b += (cb - b) * alpha;
        }
      }

      // The sun, over the top of everything including the clouds — a cloud in
      // front of the sun still has a bright rim, and this is the cheap version
      // of that. Two lobes: a tight core and a wide aureole, both Gaussian in
      // the angle from the sun direction, so there is no hard disc edge for a
      // 1024-wide texture to alias.
      const cosAngle = Math.max(-1, Math.min(1, x * sun.x + y * sun.y + z * sun.z));
      const angle = Math.acos(cosAngle);
      const core = Math.exp(-((angle / params.sunCoreSpread) ** 2));
      const glow = Math.exp(-((angle / params.sunGlowSpread) ** 2)) * params.sunGlowStrength;
      const sunAmount = Math.min(1, core + glow * 0.5);
      if (sunAmount > 0.001) {
        // The core goes past the sun's own albedo on purpose. An emitter that
        // stops at white cannot read as incandescent under ACES — the same
        // finding as the sparks in `DESIGN.md` §6b.
        const boost = 1 + core * 3;
        r += (sunLinear.r * boost - r) * sunAmount;
        g += (sunLinear.g * boost - g) * sunAmount;
        b += (sunLinear.b * boost - b) * sunAmount;
      }

      pixels[offset] = linearToSrgb(Math.max(0, Math.min(1, r))) * 255;
      pixels[offset + 1] = linearToSrgb(Math.max(0, Math.min(1, g))) * 255;
      pixels[offset + 2] = linearToSrgb(Math.max(0, Math.min(1, b))) * 255;
      pixels[offset + 3] = 255;
      offset += 4;
    }
  }

  return pixels;
}
