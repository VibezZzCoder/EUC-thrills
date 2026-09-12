/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { LIGHTING } from '../data/tuning.ts';
import { DAYLIGHT_LOOK, type ResolvedVenueLook } from '../data/venueLook.ts';
import { paintSky } from './skyImage.ts';

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
 */
export function createSky(look: ResolvedVenueLook = DAYLIGHT_LOOK): SkyTexture {
  const width = LIGHTING.skyTextureWidth;
  const height = LIGHTING.skyTextureHeight;

  const pixels = paintSky({
    width,
    height,
    zenithColour: look.skyZenithColour,
    // The haze's colour and the sky's bottom stop are one field on the look,
    // so the band `DESIGN.md` §6 forbids cannot come back through a venue.
    horizonColour: look.horizonColour,
    gradientExponent: LIGHTING.skyGradientExponent,
    // Derived from the two constants that aim the directional light, so the
    // painted sun and the shadows in the frame can never disagree.
    sunAzimuth: look.sunAzimuth,
    sunElevation: look.sunElevation,
    sunColour: look.skySunColour,
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
  });

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
  texture.anisotropy = 1;
  texture.needsUpdate = true;

  return {
    texture,
    dispose(): void {
      texture.dispose();
    },
  };
}
