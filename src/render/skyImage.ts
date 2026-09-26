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

  /**
   * **Ultra only** (M39 T8): the amplitude of a fifth, finer cloud octave,
   * relative to the fourth — the detail a 2048-wide sky can hold and a 1024
   * one cannot. Added as a zero-mean perturbation normalised by the four-
   * octave total, so the large-scale field, and with it where the clouds
   * are, is the ordinary sky's; only their edges gain structure. Absent or 0
   * paints exactly the four-octave sky, byte for byte.
   */
  readonly fineOctaveAmplitude?: number;
  /**
   * **Ultra only** (M39 amendment A2): sparse fair-weather cumulus over the
   * wisps, for the daylight venues. Absent paints none, byte for byte.
   */
  readonly cumulus?: CumulusParams;
}

/**
 * The cumulus layer (M39 A2, rebuilt after gauntlet round 1) — see
 * `ULTRA.sky.cumulus` in `data/tuning.ts` for what each number does.
 *
 * **Discrete clouds, not a thresholded noise field.** Round 1's five critics
 * all read the noise cumulus as grey smoke: a threshold on fBm has no top and
 * no base, only a density, so its shading had to invent them and made a grey
 * core; and it could sit anywhere, including across the rooftop haze band and
 * the frame's top edge. Here each cloud is placed on a ring by a seeded hash,
 * sized by perspective (a higher base is a nearer cloud, so a wider one), and
 * drawn as a smooth union of dome puffs cut flat at its base — a fair-weather
 * cumulus's silhouette — with a one-texel anti-aliased edge.
 *
 * Every angle is **radians**; `render/sky.ts` converts the table's degrees.
 * The elevation band `[baseMin, topMax]` is the placement contract: nothing is
 * painted below `baseMin` (so the horizon row, and the haze band above the
 * rooftops, are the ordinary sky's) or above `topMax` (so no cloud touches the
 * chase camera's top frame edge).
 */
export interface CumulusParams {
  /** The layout seed — the plan's (`cumulusSeedFor`), 0 when none is given. */
  readonly seed: number;
  /** Slots around the full horizon ring; each may hold one cloud. */
  readonly count: number;
  /** The chance a slot holds a cloud, 0–1: the gaps between clouds. */
  readonly fill: number;
  /** The lowest and highest cloud base elevation, radians. */
  readonly baseMin: number;
  readonly baseMax: number;
  /** The highest any cloud top reaches, radians. */
  readonly topMax: number;
  /** Cloud width range at `baseMin`, radians; grows with `tan(base)` (perspective). */
  readonly widthMin: number;
  readonly widthMax: number;
  /** Dome height as a share of the width (fair-weather cumulus is wider than tall). */
  readonly aspect: number;
  /** Dome puffs across a cloud's width; up to two turrets are added on top. */
  readonly puffs: number;
  /** Cauliflower edge relief, as a share of the cloud's height. */
  readonly billow: number;
  /** Bumps per cloud height along the edge. */
  readonly billowFrequency: number;
  /** Half-width of the anti-aliased edge, radians (about half a 2048 texel). */
  readonly edge: number;
  /** Sunlit tops, sRGB hex. Kept under the clip line (luma ≤ 250). */
  readonly litColour: number;
  /** The flat base, sRGB hex. No darker than the horizon haze. */
  readonly shadeColour: number;
  /** How far the base band falls toward `shadeColour`, 0–1. */
  readonly baseShade: number;
  /** The least sun a face keeps, 0–1: no grey core even back-lit. */
  readonly lightFloor: number;
  /**
   * Aerial perspective: the share of the horizon haze a cloud at `baseMin`
   * (the farthest) takes, easing to none at `baseMax`. Mixing toward the haze
   * can only lift a base toward it, never below it.
   */
  readonly haze: number;
  /** Peak opacity. */
  readonly opacity: number;
}

/**
 * Everything in `SkyParams` a venue's look does not move — the sky's
 * *construction* (`render/sky.ts` fills it from `LIGHTING`). Named so the
 * environment painter below can take a look and a construction separately.
 */
export type SkyConstruction = Omit<
  SkyParams,
  'width' | 'height' | 'zenithColour' | 'horizonColour' | 'sunAzimuth' | 'sunElevation' | 'sunColour'
>;

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
 * `fbm` plus the Ultra sky's fifth octave (M39 T8).
 *
 * The four coarse octaves are `fbm`'s own arithmetic, so where a cloud is and
 * how big it is do not move; the fifth is added as `(noise − ½) × a₅ / Σa₁₋₄`
 * — zero-mean, so the field's coverage statistics are unchanged and only the
 * edges gain detail. `a₅` is `fine` times the fourth octave's amplitude (the
 * natural continuation of the series at 0.5).
 */
function fbmFine(x: number, y: number, fine: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  // `amplitude` is now the fifth's natural 0.03125; the fourth's was twice it.
  const fifth = amplitude * 2 * fine;
  return (sum + (valueNoise(x * frequency, y * frequency) - 0.5) * fifth) / total;
}

/** One dome of a cumulus, in its cloud's local frame (radians; y up from the base). */
interface CumulusPuff {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * One cloud of the layer: where it sits and the puffs it is drawn from.
 * Exported (with `cumulusLayout`) so a test can hold the placement contract —
 * the band, the ring, the seed — without painting.
 */
export interface CumulusCloud {
  /** Centre longitude, radians, in the painter's `[−π, π)` convention. */
  readonly longitude: number;
  /** Base elevation, radians. */
  readonly base: number;
  /** Full width and dome height, radians. */
  readonly width: number;
  readonly height: number;
  readonly puffs: readonly CumulusPuff[];
  /** Smooth-union radius, radians. */
  readonly blend: number;
  /** Noise offsets that make each cloud's cauliflower edge its own. */
  readonly noiseX: number;
  readonly noiseY: number;
  /** The painted elevation range, radians, edge included. */
  readonly latitudeMin: number;
  readonly latitudeMax: number;
  /** Half the local width the cloud can reach, radians, edge included. */
  readonly halfReach: number;
}

/**
 * A deterministic hash of (seed, index, salt) to 0–1, integers only, for the
 * cumulus layout. Distinct salts give independent draws for one slot.
 */
function cumulusHash(seed: number, index: number, salt: number): number {
  return hash2((seed | 0) ^ Math.imul(salt, 0x9e3779b1), Math.imul(index + 1, 7919) + salt);
}

/** Wrap an angle into `[−π, π)`. */
function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  return angle - turn * Math.floor((angle + Math.PI) / turn);
}

/**
 * The seeded cloud layout: one slot per `2π / count` of longitude around the
 * ring, each filled with probability `fill`, its cloud jittered inside the
 * slot so the ring never reads as a pattern. The seed also turns the whole
 * ring, so two plans sharing a heading do not share a sky.
 *
 * **Perspective.** A cumulus field has one condensation level, so a lower
 * base means a farther cloud: width scales with `tan(base) / tan(baseMin)`.
 * The dome's height is its width × `aspect`, cut to `topMax`, which is what
 * keeps every top under the frame's upper edge.
 *
 * Clouds come back lowest base first — farthest first — which is the order
 * the painter composites them in, so a nearer cloud covers a farther one.
 */
export function cumulusLayout(params: CumulusParams): CumulusCloud[] {
  const clouds: CumulusCloud[] = [];
  const count = Math.max(0, Math.floor(params.count));
  if (count === 0 || params.fill <= 0) return clouds;
  const seed = params.seed | 0;
  const slot = (Math.PI * 2) / count;
  const turn = cumulusHash(seed, 0, 101) * Math.PI * 2;
  const baseMin = Math.max(1e-3, params.baseMin);
  const tanMin = Math.tan(baseMin);
  const puffCount = Math.max(1, Math.floor(params.puffs));
  for (let k = 0; k < count; k += 1) {
    if (cumulusHash(seed, k, 11) >= params.fill) continue;
    const longitude = wrapAngle(turn + (k + 0.05 + 0.9 * cumulusHash(seed, k, 13)) * slot);
    const base = baseMin + Math.max(0, params.baseMax - baseMin) * cumulusHash(seed, k, 17);
    const perspective = Math.tan(base) / tanMin;
    const draw = cumulusHash(seed, k, 19);
    const width = (params.widthMin + (params.widthMax - params.widthMin) * draw * draw) * perspective;
    // The billow may lift an edge a little past the dome: keep that under topMax too.
    const room = (params.topMax - base) / (1 + Math.max(0, params.billow));
    const height = Math.min(width * params.aspect * (0.85 + 0.3 * cumulusHash(seed, k, 23)), room);
    if (height <= params.edge * 4 || width <= params.edge * 8) continue;

    // Three courses of domes, a cauliflower: a broad lower course whose discs
    // dip under the base line (cut flat there), a narrower middle course, and
    // one or two turrets whose tops are exactly the cloud's height.
    const puffs: CumulusPuff[] = [];
    const lower = puffCount;
    for (let i = 0; i < lower; i += 1) {
      const across = lower === 1 ? 0 : (i / (lower - 1)) * 2 - 1;
      const u = Math.max(-1, Math.min(1, across + (cumulusHash(seed, k * 32 + i, 29) - 0.5) * 0.3));
      // Tallest in the middle, lower toward the ends: the dome.
      const bell = 1 - 0.7 * u * u;
      const top = height * (0.34 + 0.26 * bell) * (0.85 + 0.3 * cumulusHash(seed, k * 32 + i, 31));
      const r = top / 1.4;
      puffs.push({ x: u * Math.max(0, width / 2 - r * 0.9), y: top - r, r });
    }
    const middle = Math.max(1, Math.round(lower * 0.6));
    for (let i = 0; i < middle; i += 1) {
      const across = middle === 1 ? 0 : (i / (middle - 1)) * 2 - 1;
      const u = across * 0.55 + (cumulusHash(seed, k * 32 + i, 59) - 0.5) * 0.25;
      const bell = 1 - 0.8 * u * u;
      const r = height * (0.2 + 0.1 * cumulusHash(seed, k * 32 + i, 61)) * (0.7 + 0.3 * bell);
      const top = height * (0.6 + 0.25 * bell) * (0.9 + 0.1 * cumulusHash(seed, k * 32 + i, 67));
      puffs.push({ x: u * (width / 2), y: top - r, r });
    }
    const turrets = 1 + Math.floor(cumulusHash(seed, k, 37) * 2);
    for (let j = 0; j < turrets; j += 1) {
      const r = height * (0.16 + 0.1 * cumulusHash(seed, k * 4 + j, 41));
      const x = (cumulusHash(seed, k * 4 + j, 43) - 0.5) * width * 0.3;
      puffs.push({ x, y: height - r, r });
    }

    const reach = Math.max(...puffs.map((puff) => Math.abs(puff.x) + puff.r));
    const lift = height * Math.max(0, params.billow);
    clouds.push({
      longitude,
      base,
      width,
      height,
      puffs,
      blend: height * 0.18,
      noiseX: cumulusHash(seed, k, 47) * 97,
      noiseY: cumulusHash(seed, k, 53) * 97,
      latitudeMin: base - params.edge,
      latitudeMax: base + height + lift + params.edge,
      halfReach: reach + lift + params.edge,
    });
  }
  clouds.sort((a, b) => a.base - b.base);
  return clouds;
}

/** Polynomial smooth minimum: `min(a, b)` with the corner rounded over `k`. */
function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0);
  return Math.min(a, b) - (h * h) / (4 * k);
}

/**
 * One cloud's opacity and colour at a local point `(x, y)` — radians across
 * and up from its base — written into `out` as a linear colour and returned
 * as an opacity (0 writes nothing).
 *
 * **The silhouette** is the smooth union of the puffs' discs, its upper edge
 * roughened by value noise at `billowFrequency` bumps per cloud height (not
 * the base: a cumulus base is flat), and cut flat at `y = 0`. The edge is a
 * signed-distance ramp `±edge` wide — about one 2048 texel — so it is crisp
 * and still anti-aliased.
 *
 * **The light.** Each point takes the normal of the puff nearest the viewer
 * there (a dome), lit by the sun in the cloud's own frame with a wrapped
 * Lambert that never falls under `lightFloor` — so a back-lit cloud keeps a
 * pale body instead of a grey core, and gains a bright rim. The bottom of the
 * dome eases toward `shadeColour`, which is the flat base; `shadeColour` is
 * never darker than the horizon haze, so no part of a cloud is.
 */
function cumulusPixel(
  x: number,
  y: number,
  cloud: CumulusCloud,
  cumulus: CumulusParams,
  sunLocal: SkyDirection,
  lit: LinearColour,
  shade: LinearColour,
  horizon: LinearColour,
  out: LinearColour,
): number {
  let distance = Infinity;
  // The surface is a soft maximum of the puffs' domes, z = √(r² − d²): each
  // dome's unit normal (dx, dy, z)/r is weighted by exp(sharp · z), so the
  // dome nearest the viewer rules and the crease to its neighbour is a soft
  // fold, not a seam. Outside every disc (a fillet or a bump) the nearest
  // rim's outward normal stands in.
  const sharp = 10 / cloud.height;
  let weightSum = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let nearest = Infinity;
  let rimX = 0;
  let rimY = 1;
  for (const puff of cloud.puffs) {
    const dx = x - puff.x;
    const dy = y - puff.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) - puff.r;
    distance = distance === Infinity ? d : smoothMin(distance, d, cloud.blend);
    const r2 = puff.r * puff.r;
    if (d2 < r2) {
      const z = Math.sqrt(r2 - d2);
      const weight = Math.exp(sharp * (z - cloud.height));
      nx += (weight * dx) / puff.r;
      ny += (weight * dy) / puff.r;
      nz += (weight * z) / puff.r;
      weightSum += weight;
    } else if (d < nearest) {
      nearest = d;
      const inv = 1 / Math.max(Math.sqrt(d2), 1e-9);
      rimX = dx * inv;
      rimY = dy * inv;
    }
  }
  if (weightSum > 0) {
    nx /= weightSum;
    ny /= weightSum;
    nz /= weightSum;
  } else {
    nx = rimX;
    ny = rimY;
    nz = 0;
  }
  if (cumulus.billow > 0) {
    const f = cumulus.billowFrequency / cloud.height;
    const upper = smoothstep(Math.max(0, Math.min(1, y / (0.35 * cloud.height))));
    distance += cumulus.billow * cloud.height * 2 * (valueNoise(x * f + cloud.noiseX, y * f + cloud.noiseY) - 0.5) * upper;
  }
  distance = Math.max(distance, -y);
  const coverage = Math.max(0, Math.min(1, 0.5 - distance / (2 * Math.max(cumulus.edge, 1e-6))));
  if (coverage <= 0) return 0;

  const length = Math.hypot(nx, ny, nz) || 1;
  const lambert = (nx * sunLocal.x + ny * sunLocal.y + nz * sunLocal.z) / length;
  let light = Math.max(cumulus.lightFloor, Math.min(1, 0.5 + 0.5 * lambert));
  // Back-lit: the thin rim glows (forward scattering), the body stays pale.
  if (sunLocal.z < 0) {
    const rim = (1 - nz / length) ** 2;
    light = Math.min(1, light + 0.5 * -sunLocal.z * rim);
  }
  // The flat base: the lowest share of the dome eases toward the base colour.
  const toBase = cumulus.baseShade * (1 - smoothstep(Math.max(0, Math.min(1, y / (0.4 * cloud.height)))));
  const t = light * (1 - toBase);
  out.r = shade.r + (lit.r - shade.r) * t;
  out.g = shade.g + (lit.g - shade.g) * t;
  out.b = shade.b + (lit.b - shade.b) * t;
  // Aerial perspective: the farthest (lowest) clouds lean toward the haze.
  const span = cumulus.baseMax - cumulus.baseMin;
  const far = cumulus.haze * (span > 0 ? 1 - Math.max(0, Math.min(1, (cloud.base - cumulus.baseMin) / span)) : 1);
  if (far > 0) {
    out.r += (horizon.r - out.r) * far;
    out.g += (horizon.g - out.g) * far;
    out.b += (horizon.b - out.b) * far;
  }
  return smoothstep(coverage) * cumulus.opacity;
}

/**
 * The sun in a cloud's own frame: x along increasing longitude, y up the
 * sky, z toward the viewer. `(x, y, z)` of the painter's direction at
 * longitude λ and latitude φ is `(cos φ cos λ, sin φ, cos φ sin λ)`.
 */
function sunInCloudFrame(cloud: CumulusCloud, sun: SkyDirection): SkyDirection {
  const lambda = cloud.longitude;
  const phi = cloud.base + cloud.height * 0.5;
  const right = { x: -Math.sin(lambda), y: 0, z: Math.cos(lambda) };
  const up = { x: -Math.sin(phi) * Math.cos(lambda), y: Math.cos(phi), z: -Math.sin(phi) * Math.sin(lambda) };
  const toward = { x: -Math.cos(phi) * Math.cos(lambda), y: -Math.sin(phi), z: -Math.cos(phi) * Math.sin(lambda) };
  return {
    x: sun.x * right.x + sun.y * right.y + sun.z * right.z,
    y: sun.x * up.x + sun.y * up.y + sun.z * up.z,
    z: sun.x * toward.x + sun.y * toward.y + sun.z * toward.z,
  };
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
  const pixels = new Uint8ClampedArray(params.width * params.height * 4);
  paintSkyInto(params, 1, 1, pixels, null);
  return pixels;
}

/**
 * The painter behind `paintSky` and `paintEnvironment`.
 *
 * **One loop for both, on purpose.** The environment's upper half is "the
 * venue's own sky with the sun core removed and the aureole halved" (M39
 * §3.2), and a second copy of this loop would drift from the first the day
 * either is tuned. The two scales multiply the core and the aureole *after*
 * they are computed, and a multiply by exactly 1 is exact in IEEE arithmetic,
 * so `paintSky` — which passes 1 and 1 — is byte-identical to the painter
 * before M39 (`sky.test.ts` holds it to the literal pre-M36 argument list).
 * Likewise `fineOctaveAmplitude` and `cumulus` are read only when present.
 *
 * Exactly one of `bytes` (sRGB-encoded, clamped to 0–1) and `linear`
 * (linear, clamped at 0 only) is written.
 */
function paintSkyInto(
  params: SkyParams,
  sunCoreScale: number,
  sunGlowScale: number,
  bytes: Uint8ClampedArray | null,
  linear: Float32Array | null,
): void {
  const { width, height } = params;

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

  // M39 Ultra additions, both absent on every ordinary sky.
  const fine = params.fineOctaveAmplitude ?? 0;
  const cumulus = params.cumulus;
  const cumulusLit = cumulus === undefined ? null : hexToLinear(cumulus.litColour);
  const cumulusShade = cumulus === undefined ? null : hexToLinear(cumulus.shadeColour);
  const cumulusColour: LinearColour = { r: 0, g: 0, b: 0 };
  // The discrete clouds, farthest first, each with the sun in its own frame.
  // Never below the wisps' floor: the horizon row stays the haze exactly.
  const clouds = cumulus === undefined
    ? []
    : cumulusLayout(cumulus).filter((cloud) => Math.sin(cloud.latitudeMin) > cloudFloor);
  const cloudSuns = clouds.map((cloud) => sunInCloudFrame(cloud, sun));
  const rowClouds: number[] = [];

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

    // The cumulus clouds this row crosses (usually none).
    rowClouds.length = 0;
    for (let index = 0; index < clouds.length; index += 1) {
      if (latitude >= clouds[index].latitudeMin && latitude <= clouds[index].latitudeMax) rowClouds.push(index);
    }

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
        const density = fine > 0
          ? fbmFine(px * params.cloudScale, pz * params.cloudScale, fine)
          : fbm(px * params.cloudScale, pz * params.cloudScale);
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

      // The daylight cumulus (M39 A2), over the wisps and under the sun. Its
      // band starts above the wisps' floor (the layout is filtered to it), so
      // the rows at and below the horizon are never touched; no `cloudFade`
      // here, because a cloud whose base faded out would read as smoke.
      if (rowClouds.length > 0 && cumulus !== undefined && cumulusLit !== null && cumulusShade !== null) {
        for (const index of rowClouds) {
          const cloud = clouds[index];
          const across = wrapAngle(longitude - cloud.longitude) * horizontal;
          if (Math.abs(across) > cloud.halfReach) continue;
          const alpha = cumulusPixel(
            across,
            latitude - cloud.base,
            cloud,
            cumulus,
            cloudSuns[index],
            cumulusLit,
            cumulusShade,
            horizon,
            cumulusColour,
          );
          if (alpha > 0) {
            r += (cumulusColour.r - r) * alpha;
            g += (cumulusColour.g - g) * alpha;
            b += (cumulusColour.b - b) * alpha;
          }
        }
      }

      // The sun, over the top of everything including the clouds — a cloud in
      // front of the sun still has a bright rim, and this is the cheap version
      // of that. Two lobes: a tight core and a wide aureole, both Gaussian in
      // the angle from the sun direction, so there is no hard disc edge for a
      // 1024-wide texture to alias.
      const cosAngle = Math.max(-1, Math.min(1, x * sun.x + y * sun.y + z * sun.z));
      const angle = Math.acos(cosAngle);
      const core = Math.exp(-((angle / params.sunCoreSpread) ** 2)) * sunCoreScale;
      const glow = Math.exp(-((angle / params.sunGlowSpread) ** 2)) * params.sunGlowStrength * sunGlowScale;
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

      if (bytes !== null) {
        bytes[offset] = linearToSrgb(Math.max(0, Math.min(1, r))) * 255;
        bytes[offset + 1] = linearToSrgb(Math.max(0, Math.min(1, g))) * 255;
        bytes[offset + 2] = linearToSrgb(Math.max(0, Math.min(1, b))) * 255;
        bytes[offset + 3] = 255;
      } else if (linear !== null) {
        linear[offset] = Math.max(0, r);
        linear[offset + 1] = Math.max(0, g);
        linear[offset + 2] = Math.max(0, b);
        linear[offset + 3] = 1;
      }
      offset += 4;
    }
  }
}

// ---------------------------------------------------------------------------
// The Ultra environment (M39 T1, `docs/M39_ULTRA.md` §3.2)
// ---------------------------------------------------------------------------

/**
 * The fields of a venue's look the environment is painted from — a subset of
 * `ResolvedVenueLook`, named structurally so this file keeps importing
 * nothing.
 */
export interface EnvironmentLook {
  readonly skyZenithColour: number;
  readonly horizonColour: number;
  readonly sunAzimuth: number;
  readonly sunElevation: number;
  readonly skySunColour: number;
  readonly groundBounceColour: number;
}

/** How the environment is painted beyond the look (`ULTRA.env`, the live β). */
export interface EnvironmentOptions {
  /** Equirectangular size; width should be twice height. */
  readonly width: number;
  readonly height: number;
  /** β — the lower half is `groundBounceColour × β`, linear (`ULTRA.bounceLift`). */
  readonly bounceLift: number;
  /** The painted sun core's strength in the environment: 0 removes it. */
  readonly sunCoreStrength: number;
  /** The aureole's share of the painted sky's own. */
  readonly aureoleScale: number;
  /** The horizon → bounce blend, degrees below the horizon. */
  readonly horizonBlendDegrees: number;
  /** The sky's construction — `LIGHTING`'s share of `SkyParams`. */
  readonly construction: SkyConstruction;
}

/**
 * Paint the Ultra environment — the image the renderer PMREM-filters once
 * per activation into `scene.environment` (M39 T1).
 *
 * Returns `width × height × 4` **linear** floats (RGBA, alpha 1), row 0 the
 * nadir exactly as `paintSky`, ready for a half-float `DataTexture`.
 *
 * - **Upper half:** the venue's own painted sky — the same painter, the same
 *   ramp, warmth and wisps — with the sun core removed and the aureole
 *   scaled. A painted core in an environment is a fake specular sun on every
 *   glossy surface, doubling the real one; the direct light already *is* the
 *   sun. No fine octave and no cumulus: PMREM filtering erases both, and the
 *   environment must not move with an Ultra-only sky detail.
 * - **Lower half:** the look's `groundBounceColour × β`, linear — the warm
 *   bounce off the ground that lifts walls, undersides and canopies out of the
 *   navy crush (U0 defect D1). It meets the horizon through a
 *   `horizonBlendDegrees` smoothstep from `horizonColour`, so the environment
 *   has no seam at the horizon for a glossy surface to mirror.
 *
 * Pure and deterministic: the same arguments paint the same floats.
 */
export function paintEnvironment(look: EnvironmentLook, options: EnvironmentOptions): Float32Array {
  const { width, height } = options;
  const pixels = new Float32Array(width * height * 4);
  paintSkyInto(
    {
      ...options.construction,
      width,
      height,
      zenithColour: look.skyZenithColour,
      horizonColour: look.horizonColour,
      sunAzimuth: look.sunAzimuth,
      sunElevation: look.sunElevation,
      sunColour: look.skySunColour,
      // The environment never carries the Ultra-only sky details.
      fineOctaveAmplitude: undefined,
      cumulus: undefined,
    },
    options.sunCoreStrength,
    options.aureoleScale,
    null,
    pixels,
  );

  const horizon = hexToLinear(look.horizonColour);
  const bounce = hexToLinear(look.groundBounceColour);
  const lift = Math.max(0, options.bounceLift);
  const blend = Math.max(1e-6, (options.horizonBlendDegrees * Math.PI) / 180);
  for (let row = 0; row < height; row += 1) {
    const latitude = Math.PI * ((row + 0.5) / height - 0.5);
    if (latitude > 0) continue;
    // 0 at the horizon, 1 from `horizonBlendDegrees` down: the bounce, flat.
    const share = smoothstep(Math.min(1, -latitude / blend));
    const r = horizon.r + (bounce.r * lift - horizon.r) * share;
    const g = horizon.g + (bounce.g * lift - horizon.g) * share;
    const b = horizon.b + (bounce.b * lift - horizon.b) * share;
    let offset = row * width * 4;
    for (let column = 0; column < width; column += 1) {
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 1;
      offset += 4;
    }
  }
  return pixels;
}
