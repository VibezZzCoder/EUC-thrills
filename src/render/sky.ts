/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { LIGHTING, ULTRA } from '../data/tuning.ts';
import { DAYLIGHT_LOOK, sameSkyPaint, type ResolvedVenueLook } from '../data/venueLook.ts';
import { paintSky, type CumulusParams, type SkyConstruction, type SkyParams } from './skyImage.ts';

/**
 * The painted sky, as a `THREE.DataTexture` ready for `scene.background`.
 *
 * A member of the coupled visual system (`DESIGN.md` §6, AGENTS.md invariant
 * 6). `render/Renderer.ts` owns it, as it owns the lights, the exposure, and
 * the haze, because all four are judged in the same frame and each one moves
 * the baseline the next is judged against.
 *
 * **A `DataTexture`, not a canvas.** The pixels come from `skyImage.ts`, which
 * imports nothing, so the sky can be generated and asserted at `node --test`
 * without a DOM. Routing it through a 2D canvas would have made the one part
 * of this worth testing require a browser.
 *
 * **No geometry.** `scene.background` with an equirectangular mapping is drawn
 * by three's own background pass at infinite distance: no sky dome to size
 * against the camera's far plane, no dome to exclude from the fog, and nothing
 * for the shadow camera to trip over. It is also, correctly, unaffected by the
 * scene fog — the haze exists to dissolve the *ground's* far edge into the
 * sky, and fogging the sky toward itself would be a no-op at best.
 */
export interface SkyTexture {
  readonly texture: THREE.DataTexture;
  dispose(): void;
}

/**
 * How the sky is painted beyond the look — M39's Ultra sky (T8, amendment A2).
 *
 * **Every field optional, and `{}` is the ordinary sky, byte for byte**: the
 * 1024×512 image at anisotropy 1 that every Low/Medium/High frame wears
 * (`sky.test.ts` holds that). The Ultra rung passes `ultraSkyOptions(…)` from
 * `render/ultra/ultraLighting.ts`: 2048×1024, one finer cloud octave,
 * anisotropy 4 and the daylight cumulus. Declared here, beside the painter it
 * configures, and re-exported from `ultraLighting.ts` so W0's import path
 * keeps working.
 *
 * Part of the sky's repaint key (§3.2 "the repaint key includes the tier"):
 * `sameSkyOptions` is what the venue rig compares beside `sameSkyPaint`, so a
 * tier switch on an unchanged venue still repaints, and leaving Ultra paints
 * the ordinary sky again rather than keeping the Ultra one.
 */
export interface SkyOptions {
  readonly width?: number;
  readonly height?: number;
  readonly anisotropy?: number;
  /** Amplitude of the extra fine cloud octave; 0 or absent paints none. */
  readonly fineOctaveAmplitude?: number;
  /** Sparse fair-weather cumulus on a daylight venue's sky (A2). */
  readonly daylightClouds?: boolean;
  /**
   * Multiplies the construction's cloud edge softness (pre-R1 calibration,
   * `M39_ULTRA.md` §U2): under 1 the wisps' edges sharpen, which is what lets
   * the fine octave's detail show — softness is the width of the opacity ramp
   * above the threshold, so where the clouds are and how far they reach is
   * unchanged (§8.3: "only cloud sharpness may change"). Absent or 1 paints
   * the construction's softness exactly. **Only on a venue that authors its
   * own sky** (Switchback): a daylight sky's Ultra detail is the cumulus, and
   * sharper wisps there moved the haze band over the rooftops (§U2).
   */
  readonly cloudSoftnessScale?: number;
  /**
   * The cumulus layout's seed (gauntlet round 1: "placement varied per
   * plan"): `cumulusSeedFor(plan.id)`, so two worlds that share a heading do
   * not share a sky. Absent is 0. Read only with `daylightClouds`.
   */
  readonly cloudSeed?: number;
}

/**
 * The cumulus seed for a plan id: FNV-1a over its UTF-16 code units, as a
 * signed 32-bit integer. Pure and stable across sessions, so a world wears
 * the same sky every time it is ridden, and different worlds different ones.
 */
export function cumulusSeedFor(planId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < planId.length; index += 1) {
    hash ^= planId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** The ordinary sky's options: none. Frozen so a caller cannot widen it by accident. */
const ORDINARY_SKY: SkyOptions = Object.freeze({});

/**
 * The sky's construction — every `SkyParams` field a venue's look does not
 * move, straight from `LIGHTING`. Shared by the sky and the Ultra environment
 * (`ultraEnvironment.ts`), so the environment's upper half is the same sky the
 * player sees behind the frame.
 */
export function skyConstruction(): SkyConstruction {
  return {
    gradientExponent: LIGHTING.skyGradientExponent,
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
  };
}

/**
 * Whether a look wears the daylight sky — the venues amendment A2 gives the
 * cumulus to (town, generated routes, the slice, the proving ground, BelVar).
 *
 * Decided by the five painted fields (`sameSkyPaint`) rather than by a venue
 * id, so the rule needs no list and cannot miss a new daylight world; a venue
 * that authors its own sky — Switchback's warm afternoon — keeps exactly the
 * clouds it was accepted with.
 */
export function wearsDaylightSky(look: ResolvedVenueLook): boolean {
  return sameSkyPaint(look, DAYLIGHT_LOOK);
}

/** The cumulus layer's parameters, from `ULTRA.sky.cumulus` (degrees → radians), for a seed. */
export function daylightCumulus(seed = 0): CumulusParams {
  const c = ULTRA.sky.cumulus;
  const radians = Math.PI / 180;
  return {
    seed: seed | 0,
    count: c.count,
    fill: c.fill,
    baseMin: c.baseMinDegrees * radians,
    baseMax: c.baseMaxDegrees * radians,
    topMax: c.topDegrees * radians,
    widthMin: c.widthMinDegrees * radians,
    widthMax: c.widthMaxDegrees * radians,
    aspect: c.aspect,
    puffs: c.puffs,
    billow: c.billow,
    billowFrequency: c.billowFrequency,
    edge: c.edgeDegrees * radians,
    litColour: c.litColour,
    shadeColour: c.shadeColour,
    baseShade: c.baseShade,
    lightFloor: c.lightFloor,
    haze: c.haze,
    opacity: c.opacity,
  };
}

/**
 * Exactly the painter arguments `createSky(look, options)` uses. Exported so
 * a test (and the environment) can reach the same list without a texture.
 *
 * With `{}` this is the pre-M39 argument list: the Ultra fields are not
 * present at all, and the painter reads them only when they are.
 */
export function skyParamsFor(look: ResolvedVenueLook, options: SkyOptions = ORDINARY_SKY): SkyParams {
  const base: SkyParams = {
    width: options.width ?? LIGHTING.skyTextureWidth,
    height: options.height ?? LIGHTING.skyTextureHeight,
    zenithColour: look.skyZenithColour,
    // The haze's colour and the sky's bottom stop are one field on the look,
    // so the band `DESIGN.md` §6 forbids cannot come back through a venue.
    horizonColour: look.horizonColour,
    // Derived from the two constants that aim the directional light, so the
    // painted sun and the shadows in the frame can never disagree.
    sunAzimuth: look.sunAzimuth,
    sunElevation: look.sunElevation,
    sunColour: look.skySunColour,
    ...skyConstruction(),
  };
  const fine = options.fineOctaveAmplitude ?? 0;
  const cumulus = options.daylightClouds === true && wearsDaylightSky(look);
  // The sharper wisps are the Ultra sky detail of a venue that authors its own
  // clouds (Switchback); a daylight sky's is the A2 cumulus, and its wisps
  // stay as soft as High's so the haze band over the rooftops does not move.
  const softness = wearsDaylightSky(look) ? 1 : options.cloudSoftnessScale ?? 1;
  if (fine <= 0 && !cumulus && softness === 1) return base;
  return {
    ...base,
    ...(softness !== 1 ? { cloudSoftness: base.cloudSoftness * softness } : {}),
    ...(fine > 0 ? { fineOctaveAmplitude: fine } : {}),
    ...(cumulus ? { cumulus: daylightCumulus(options.cloudSeed ?? 0) } : {}),
  };
}

/**
 * Whether two option sets paint and sample the same sky — the tier half of
 * the repaint key (§3.2). Compares the *resolved* values, so `{}` and an
 * explicit `{ width: 1024, height: 512, anisotropy: 1 }` agree.
 */
export function sameSkyOptions(a: SkyOptions, b: SkyOptions): boolean {
  return (a.width ?? LIGHTING.skyTextureWidth) === (b.width ?? LIGHTING.skyTextureWidth)
    && (a.height ?? LIGHTING.skyTextureHeight) === (b.height ?? LIGHTING.skyTextureHeight)
    && (a.anisotropy ?? 1) === (b.anisotropy ?? 1)
    && (a.fineOctaveAmplitude ?? 0) === (b.fineOctaveAmplitude ?? 0)
    && (a.daylightClouds === true) === (b.daylightClouds === true)
    && (a.cloudSoftnessScale ?? 1) === (b.cloudSoftnessScale ?? 1)
    && (a.cloudSeed ?? 0) === (b.cloudSeed ?? 0);
}

/**
 * Paint the sky a venue asked for — M36 Phase 4.
 *
 * **Five of its parameters now come from the look and the rest still come from
 * `LIGHTING`, and the split is not arbitrary.** A venue may move where the sun
 * is and what the three colours of the dome are, because those are the same
 * numbers that aim and colour the light casting the shadows underneath it
 * (`data/venueLook.ts`). The texture's size, the horizon-to-zenith ramp and
 * the whole cloud field stay global: they are the sky's *construction* rather
 * than its time of day, and a per-venue cloud sheet is a texture budget by
 * another name (§36.7 keeps the 8 MB transfer contract).
 *
 * With no argument the pixels are what M7.5 shipped, byte for byte — the
 * default look is literally the `LIGHTING` values this function used to read
 * inline, and `sky.test.ts` paints both ways and compares the buffers.
 *
 * **M39: an optional second argument, for Ultra only.** `options` may widen
 * the texture, add the fine octave, raise the anisotropy and paint the
 * daylight cumulus; omitted (or `{}`), every byte and every texture field is
 * the ordinary sky's. The horizon row is untouched either way: the Ultra
 * details live inside the cloud fade, which is zero at and below the horizon.
 */
export function createSky(
  look: ResolvedVenueLook = DAYLIGHT_LOOK,
  options: SkyOptions = ORDINARY_SKY,
): SkyTexture {
  const params = skyParamsFor(look, options);
  const { width, height } = params;
  const pixels = paintSky(params);

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'sky';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // The buffer is authored in sRGB (`skyImage.ts` encodes on the way out), so
  // three must decode it before lighting maths. Getting this wrong is the
  // double-decode trap `DESIGN.md` §6b names, from the other direction.
  texture.colorSpace = THREE.SRGBColorSpace;
  // Longitude wraps and latitude does not. Without the repeat, the seam behind
  // the rider clamps into a visible vertical stripe.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  // A 1024-wide sky stretched across the view is heavily magnified near the
  // camera axis and heavily minified toward the poles; mipmaps are what stop
  // the cloud field from crawling as the camera yaws.
  texture.generateMipmaps = true;
  // 1 on every ordinary sky. The Ultra sky asks for 4 (capped by the device):
  // the plane-projected clouds are seen at a grazing angle near the horizon,
  // which is exactly where isotropic filtering smears them.
  texture.anisotropy = options.anisotropy ?? 1;
  texture.needsUpdate = true;

  return {
    texture,
    dispose(): void {
      texture.dispose();
    },
  };
}
