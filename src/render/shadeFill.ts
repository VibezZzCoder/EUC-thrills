/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The ordinary tier's shade fill — the visual pass of 2026-10-22.
 *
 * **What it fixes.** A face the sun cannot see is lit by the hemisphere alone,
 * and three's hemisphere irradiance reaches the surface through `albedo / π`
 * before ACES, whose toe crushes everything under about 0.02 linear. The
 * measured result at the default world's first plaza wall was a mid-grey
 * stone face at 33 / 255 beside a road at 127 — a black slab with no coursing,
 * no edge and no hue, on every quality tier (`DESIGN.md` §6h already named
 * the cause: "a vertical face lit by the hemisphere alone receives roughly an
 * eighth of what the sun delivers").
 *
 * **How, and why these two numbers.** The rig keeps its one hemisphere
 * (invariant 7's light count does not move); the ordinary tier hangs it
 * brighter, and brighter mostly in its *bounce* half. Three's hemisphere gives
 * an up-facing surface almost pure sky and a vertical one an even mix of sky
 * and bounce, so the two halves are separate levers:
 *
 * - `sky` multiplies the whole hemisphere. It is what a cast shadow on the
 *   road sees, so it stays modest: the mood is LOCKED for crisp contact
 *   shadows (`DESIGN.md` §1); on its own it moves the road in shade from 0.31
 *   to about 0.37 of the sunlit road (the `shadow` intensity below takes it
 *   to 0.58) — still a hard dark shape.
 * - `bounce` is the effective gain on the ground colour (the light's
 *   `groundColor` is scaled by `bounce / sky`, so `intensity × groundColor`
 *   rises by `bounce`). It is what walls, trunks, the rider's underside and
 *   every overhang see, and it is the half that lifts a shaded wall to about
 *   half of a sun-facing one: stone 33 → ~55 / 255, a facade 67 → ~99, a
 *   sunlit road +3 levels. Physically it is the light a sunlit street throws
 *   back up, which is exactly what a black wall in daylight was missing.
 *
 * The values are absolute multipliers of whatever the venue authored (or the
 * F4 panel holds), so the park's warm afternoon keeps its own balance between
 * sky and bounce and every authored number still means what it says.
 *
 * **The third number, the cast shadow (second look pass, 2026-10-22).** The
 * two above lift every face the sun cannot *see*, but a cast shadow lies on
 * ground that faces the sun and is merely blocked, and the hemisphere alone
 * left it near black: brick under the plaza wall measured (23, 19, 22) beside
 * lit brick at (106, 74, 65), grass under a tree (9, 31, 21) beside (61, 91,
 * 57) — a hole in the ground with the hue gone purple. `shadow` is three's
 * `DirectionalLightShadow.intensity` on the ordinary tier: the share of the
 * sun a shadow takes away, so 0.78 lets 22 % of it through. Measured over the
 * cast-shadow pixels of the default world at High, brick in shade comes to
 * about (48, 35, 35), grass to (24, 48, 31) and road to 0.58 of the sunlit
 * road (it was 0.38). The shadow map, its texels and its edges are exactly
 * what they were, so a contact shadow is as crisp as before and only lighter
 * — still a hard dark shape (`DESIGN.md` §1's lock is on *crisp*); a face
 * turned away from the sun is not in the map at all and does not move. It is
 * written by the ordinary shadow rig (`ultra/ultraLighting.ts` `ordinaryRig`,
 * and the renderer's constructor that rig restates), not by `applyTuned`,
 * because the Ultra teardown writes the ordinary rig *after* the ordinary
 * light: a value only the light wrote would come back as 1 on the way out.
 *
 * **Ordinary only.** The sun, its colour, the exposure, the haze and the sky
 * are not touched on any tier — §3.2 of the Ultra contract keeps those equal
 * across tiers, and they are. The Ultra tier zeroes the hemisphere and lights
 * from its own environment, so neither fill number reaches it, and its near
 * cascade writes its own shadow intensity (`ULTRA.near.intensity`).
 *
 * Pure numbers, no three.js, so a browser spec can read them without pulling
 * the renderer into node.
 */
export const ORDINARY_SHADE_FILL = Object.freeze({
  /** Gain on the hemisphere's intensity (its sky half). */
  sky: 1.25,
  /** Effective gain on the bounce half: `intensity × groundColor`. */
  bounce: 2.3,
  /** The sun's shadow intensity: the share of the sun a cast shadow removes (three's default is 1). */
  shadow: 0.78,
});

/** The hemisphere intensity the ordinary tier hangs for an authored or tuned one. */
export function ordinaryHemisphereIntensity(authored: number): number {
  return authored * ORDINARY_SHADE_FILL.sky;
}

/**
 * What the ordinary tier scales the light's `groundColor` by (in three's
 * linear working space), so that intensity × ground rises by `bounce`.
 */
export const ORDINARY_BOUNCE_SCALE = ORDINARY_SHADE_FILL.bounce / ORDINARY_SHADE_FILL.sky;

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
};
const toSrgbByte = (linear: number): number => {
  const c = linear < 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 0.41666) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/**
 * The bounce colour the ordinary tier hangs for an authored one, as a hex:
 * decoded to linear, scaled by `ORDINARY_BOUNCE_SCALE`, encoded back — the
 * arithmetic three's `Color.setHex(...).multiplyScalar(...).getHex()` does,
 * written out so it is one 8-bit value the light, the tests and a browser
 * spec all agree on without three.
 */
export function ordinaryBounceHex(authored: number): number {
  const r = toSrgbByte(toLinear((authored >> 16) & 255) * ORDINARY_BOUNCE_SCALE);
  const g = toSrgbByte(toLinear((authored >> 8) & 255) * ORDINARY_BOUNCE_SCALE);
  const b = toSrgbByte(toLinear(authored & 255) * ORDINARY_BOUNCE_SCALE);
  return (r << 16) | (g << 8) | b;
}
