/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LIGHTING } from './tuning.ts';

/**
 * A venue's authored light — the optional presentation descriptor M36 §36.7
 * asks for.
 *
 * ## Why this exists, and why it is not a second `LIGHTING`
 *
 * M32's presentation selector (`render/presentation.ts`) answers exactly one
 * question — *how much topology can this world afford* — and it answers it
 * after the plan is immutable. It has nothing to say about time of day, and
 * §36.7 says so in as many words: **"the warm lighting recipe is a separate
 * presentation concern: M32's baseline/enhanced selector does not already
 * supply time-of-day lighting."** Switchback Park wants a fixed warm late
 * afternoon (owner decision q160) and BelVar, the slice, the proving ground
 * and every generated route want the bright clear daytime they have shipped
 * with since M7.5, unchanged to the byte.
 *
 * So a look is **authored by a venue, optional everywhere, and resolved
 * against `LIGHTING`**. Every field defaults to the value the game already
 * ships, which makes "no descriptor" and "today's daylight" the same thing by
 * construction rather than by a second table somebody has to keep in step.
 * `LIGHTING` remains the one place a shipped constant lives (AGENTS.md): this
 * file holds no numbers of its own at all — read it and you will not find a
 * colour, an angle or an intensity, only the names of the ones in `tuning.ts`.
 *
 * ## Why every coupled field travels together
 *
 * Lighting, tone mapping, exposure, sky and haze are ONE system with ONE owner
 * (AGENTS.md invariant 6, `DESIGN.md` §6), and two of those couplings are
 * contracts rather than preferences:
 *
 *   - **`horizonColour` is the fog colour *and* the sky's bottom stop.** Move
 *     one without the other and a band reappears where the surround's far edge
 *     meets the sky. One field carries both, so they cannot disagree.
 *   - **The painted sun is derived from `sunAzimuth` / `sunElevation`**, the
 *     same two numbers that aim the directional light. A venue that moved the
 *     light without moving the painted sun would light its shadows from one
 *     direction and draw the sun in another — the kind of error nobody sees
 *     directly and everybody feels.
 *
 * Both hold here because a look is resolved through `resolveVenueLook` once
 * and the renderer reads the *resolved* look for the lights, the fog and the
 * sky in the same call.
 *
 * ## What is deliberately absent
 *
 * `sunDistance`, the shadow map's size, radius and biases, the cloud field and
 * the sky's texture size stay global. A venue may change what the light *is*;
 * it may not change what the rig *costs*, because one directional light, one
 * hemisphere, one shadow map and no post-processing is invariant 7 and a
 * per-venue shadow budget is how that erodes. A low sun does lengthen shadows,
 * and if the single 30 m cascade needs a different bias for it, that is a
 * global tuning change made once and judged everywhere — not a field here.
 *
 * Nothing in this file imports three.js or anything under `render/`, so a
 * level may author a look (`level/plan.ts`) and the headless suite can assert
 * one without a GL context.
 */
export interface VenueLook {
  /** Sun compass bearing, radians, measured from +Z (forward) toward +X. */
  readonly sunAzimuth?: number;
  /** Sun elevation above the horizon, radians. Lower means longer shadows. */
  readonly sunElevation?: number;
  /** The key light's colour, sRGB hex. */
  readonly sunColour?: number;
  /** The key light's intensity. */
  readonly sunIntensity?: number;

  /** The hemisphere's upper colour — what lights an up-face in shadow. */
  readonly skyColour?: number;
  /** The hemisphere's lower colour — what lights a down-face and an overhang. */
  readonly groundBounceColour?: number;
  readonly hemisphereIntensity?: number;

  /**
   * The haze, and the value the painted sky reaches at the horizon.
   *
   * **One field on purpose.** See the file comment: these are the same number
   * by contract, and the fog is the only reason the surround has no visible
   * edge.
   */
  readonly horizonColour?: number;
  /** Straight up in the painted sky, sRGB hex. */
  readonly skyZenithColour?: number;
  /** The painted sun's core and aureole, sRGB hex. Warmer than the sky. */
  readonly skySunColour?: number;

  /** Where the haze begins and where it is total, metres. */
  readonly fogNear?: number;
  readonly fogFar?: number;

  /** Tone-mapping exposure. ACES is the curve; this is where it sits. */
  readonly exposure?: number;
}

/**
 * A look with no gaps left in it. What the renderer composes from, and the only
 * shape the sky is ever painted from.
 */
export type ResolvedVenueLook = Required<VenueLook>;

/**
 * Bright clear daytime — every field exactly as `LIGHTING` ships it.
 *
 * This is what a world with no descriptor resolves to, so it is also the proof
 * obligation: `render/sky.test.ts` paints `createSky()` and
 * `createSky(DAYLIGHT_LOOK)` and requires the two buffers to be equal byte for
 * byte, and `data/venueLook.test.ts` requires every field here to be the
 * `LIGHTING` constant it names.
 */
export const DAYLIGHT_LOOK: ResolvedVenueLook = Object.freeze({
  sunAzimuth: LIGHTING.sunAzimuth,
  sunElevation: LIGHTING.sunElevation,
  sunColour: LIGHTING.sunColour,
  sunIntensity: LIGHTING.sunIntensity,
  skyColour: LIGHTING.skyColour,
  groundBounceColour: LIGHTING.groundBounceColour,
  hemisphereIntensity: LIGHTING.hemisphereIntensity,
  horizonColour: LIGHTING.horizonColour,
  skyZenithColour: LIGHTING.skyZenithColour,
  skySunColour: LIGHTING.skySunColour,
  fogNear: LIGHTING.fogNear,
  fogFar: LIGHTING.fogFar,
  exposure: LIGHTING.exposure,
});

/**
 * Fill every gap in an authored look from the daylight the game ships.
 *
 * An absent descriptor returns `DAYLIGHT_LOOK` itself, so the no-descriptor
 * path allocates nothing and compares identical; a partial descriptor returns a
 * frozen copy. A venue therefore authors only what it means to change, and
 * everything it says nothing about is still the value every existing world is
 * judged at.
 */
export function resolveVenueLook(look?: VenueLook): ResolvedVenueLook {
  if (look === undefined) return DAYLIGHT_LOOK;
  return Object.freeze({
    sunAzimuth: look.sunAzimuth ?? DAYLIGHT_LOOK.sunAzimuth,
    sunElevation: look.sunElevation ?? DAYLIGHT_LOOK.sunElevation,
    sunColour: look.sunColour ?? DAYLIGHT_LOOK.sunColour,
    sunIntensity: look.sunIntensity ?? DAYLIGHT_LOOK.sunIntensity,
    skyColour: look.skyColour ?? DAYLIGHT_LOOK.skyColour,
    groundBounceColour: look.groundBounceColour ?? DAYLIGHT_LOOK.groundBounceColour,
    hemisphereIntensity: look.hemisphereIntensity ?? DAYLIGHT_LOOK.hemisphereIntensity,
    horizonColour: look.horizonColour ?? DAYLIGHT_LOOK.horizonColour,
    skyZenithColour: look.skyZenithColour ?? DAYLIGHT_LOOK.skyZenithColour,
    skySunColour: look.skySunColour ?? DAYLIGHT_LOOK.skySunColour,
    fogNear: look.fogNear ?? DAYLIGHT_LOOK.fogNear,
    fogFar: look.fogFar ?? DAYLIGHT_LOOK.fogFar,
    exposure: look.exposure ?? DAYLIGHT_LOOK.exposure,
  });
}

/**
 * Do these two looks paint the same sky?
 *
 * The five fields `render/sky.ts` reads, and nothing else. It exists so a
 * venue swap between two worlds whose skies agree — every world but the park,
 * today — repaints no 1024x512 buffer and disposes no texture: the sky is the
 * one part of a look that costs a GPU resource, and invariant 10 is measured
 * by whether `resources().textures` plateaus across repeated rebuilds.
 *
 * Intensities, fog distances and exposure are absent because none of them
 * reach the painted image. Adding a field to `SkyParams` that a look can move
 * means adding it here too, and `render/sky.test.ts` is what fails if it is
 * forgotten: it paints a look that differs in each sky field in turn and
 * requires a different buffer every time.
 */
export function sameSkyPaint(a: ResolvedVenueLook, b: ResolvedVenueLook): boolean {
  return a.skyZenithColour === b.skyZenithColour
    && a.horizonColour === b.horizonColour
    && a.sunAzimuth === b.sunAzimuth
    && a.sunElevation === b.sunElevation
    && a.skySunColour === b.skySunColour;
}
