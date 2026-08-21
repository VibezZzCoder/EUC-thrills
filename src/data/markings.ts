/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import type { SurfaceId } from '../simulation/world.ts';

/**
 * Road paint — M7.5 stage 4, and the fourth of the project's data tables.
 *
 * `docs/PLANS.md` §7.5 stage 4 asks for "centre lines, edge lines, and plaza
 * patterning, so a road reads as a road", and beat 2 of §6 asks for painted
 * lines by name, with "lines as a speed cue" as the thing they teach. That
 * second job is why the paint is geometry rather than a tint in the ground's
 * colour attribute, and the reasoning is worth stating once here because it
 * contradicts the milestone's own stated preference:
 *
 * > **A heightfield cell is one metre and a lane line is sixteen centimetres.**
 * > Painting a line into the per-cell colour attribute means spreading it over
 * > a whole metre at a sixth of its contrast, which is not a line — it is a
 * > wide grey smear that reads as dirt. And a smear cannot strobe past at
 * > 15 m/s, so it cannot do the job §6 beat 2 gives it. Everything stage 4
 * > does at *metre* scale — the plaza's paving, the frayed edge where grass
 * > takes back a path — genuinely does live in the colour attribute, costs
 * > nothing, and is in `render/groundNoise.ts`. Only the paint is geometry,
 * > and the whole of it is one draw call.
 *
 * **Nothing here may import three.js.** `level/` reads this table to author and
 * validate paint, and `level/` is sealed (AGENTS.md invariant 1).
 *
 * ## Colour authoring, for the sixth time
 *
 * The hex below is **sRGB** and three.js decodes it to linear before lighting,
 * so each one is authored as a linear reflectance with the value written beside
 * it (`DESIGN.md` §2). `markings.test.ts` decodes them and asserts the range.
 */

/**
 * The two paints the slice uses.
 *
 * Two rather than one because the city and the park are supposed to read
 * differently, and the paint is the cheapest place to say so: a boulevard is
 * maintained and a park path is not. They share one mesh and one material —
 * the difference travels on the vertex colour, exactly as a prop's tone travels
 * on its instance colour (`render/props.ts`).
 */
export type MarkingPaint = 'road' | 'path' | 'kerb';

/**
 * Which line this is. Width comes from here rather than from the author, so a
 * centre line is the same width everywhere in the world.
 */
export type MarkingRole = 'centre' | 'edge' | 'bar';

export const MARKING_PAINTS: Readonly<Record<MarkingPaint, { readonly albedo: number; readonly wear: number }>> = deepFreeze({
  /**
   * linear (0.45, 0.44, 0.41) — weathered white traffic paint, warm.
   *
   * **Brighter than kerb concrete, deliberately, and `DESIGN.md` §3 has been
   * amended rather than quietly broken.** That rule requires the kerb to be the
   * lightest thing in the *material* palette so a step is visible before it is
   * hit; it is a statement about surfaces and the things standing on them.
   * Paint is neither. It is thin, it always runs along the direction of travel,
   * and it never sits on top of a collider — the builder refuses that — so it
   * cannot be mistaken for a step, and the kerb's own contrast against the road
   * surface beside it is untouched. Fresh road paint is about seven times the
   * reflectance of the asphalt under it; this is 2.2 times, which is aged paint
   * and still unmistakably paint.
   */
  road: { albedo: 0xb1b0aa, wear: 0.16 },
  /**
   * linear (0.26, 0.255, 0.238) — the park's paint, under three fifths of the
   * road's.
   *
   * **Below kerb concrete, which is a measured value rather than an eyeballed
   * one.** The first pass sat at 0.30 linear per channel, which looks like the
   * kerb's own 0.30 and is not: weighting the three channels puts a slightly
   * green-neutral grey *above* a slightly warm one, and the park's paint came
   * out 5% brighter than the kerb it is supposed to stay under. Caught by the
   * assertion rather than by eye, which is the entire argument for having it.
   * The city is maintained and the park is not, and a rider crossing the park
   * gate should be able to feel that without being told: the trees start, the
   * road narrows, the grass shoulders arrive, and the paint fades.
   */
  path: { albedo: 0x8a8985, wear: 0.26 },
  /**
   * linear (0.30, 0.035, 0.030) — the red half of a kerb, added at M23 B1.
   *
   * **A third paint costs nothing at all, and that is the point.** Every
   * painted line in a level is one mesh and one material; the paint's identity
   * travels on the vertex colour, exactly as a prop's tone travels on its
   * instance colour. So the red/white apex kerbs a race circuit is read by are
   * free, where a red *material* would have cost two of the ten draw calls the
   * library had spare.
   *
   * Under road paint in luminance rather than over it, because a kerb is a
   * warning at the edge of the racing surface and the white line down the
   * middle of it is the thing that must stay brightest (`DESIGN.md` §3's
   * bounded exception). It is also a good deal lighter than the barrier's
   * `signalRed`: paint on tarmac is thin and worn, and a kerb that matched the
   * barrier would read as a barrier lying down.
   */
  kerb: { albedo: 0x943834, wear: 0.22 },
});

/**
 * Geometry and validation constants for the paint.
 *
 * Lengths are metres. Every one of them is chosen against the chase camera at
 * riding speed, which is `DESIGN.md` §6b's rule for FX sizes and applies for
 * the same reason here — at the arm's six metres a 1000-pixel viewport is about
 * 80 pixels per metre, so a scale-accurate 0.10 m line is eight pixels and
 * shimmers away to nothing by the time it is far enough ahead to be useful.
 */
export const MARKINGS = deepFreeze({
  /** Centre and lane lines. Wider than the real 0.10-0.15 m, see above. */
  centreWidth: 0.16,
  /** Edge lines, a touch narrower so the two read as different lines. */
  edgeWidth: 0.13,
  /** A transverse bar: a give-way line, or a threshold across a gateway. */
  barWidth: 0.42,

  /**
   * Dash and gap for a broken line, metres.
   *
   * A 3 m mark with a 4.5 m gap repeats every 7.5 m, so at the wheel's 15 m/s
   * top speed the player crosses two a second — fast enough to read as motion
   * and slow enough to count, which is what makes a broken line a speed cue
   * rather than a texture.
   */
  dashLength: 3.0,
  dashGap: 4.5,

  /**
   * How far above the ground the paint sits, metres.
   *
   * Fifteen millimetres, plus `polygonOffset` on the material. The lift alone
   * is not enough at a hundred metres and the offset alone is not enough on a
   * mesh whose vertices only exist every metre; together they are. It is
   * presentation-only — no ground query can see it — and it is a quarter of
   * `TERRAIN.curbThreshold` besides.
   */
  lift: 0.015,

  /**
   * Distance between sampled points along a painted line, metres.
   *
   * The tightest arc the slice paints is the safe route's 34 m corner, where a
   * 1.25 m chord departs from the true arc by 6 mm — under a twentieth of the
   * line's own width, so a curve reads as a curve rather than as a polygon.
   */
  sampleStep: 1.25,

  /**
   * Shortest run of paint the builder will emit, metres.
   *
   * The builder clips paint out of anywhere it may not go, which leaves short
   * offcuts where a line grazes a kerb or a corridor's edge. A 40 cm dab of
   * white in the middle of a road is litter, not a marking.
   */
  minRunLength: 2.0,

  /**
   * Clear ground the paint leaves around anything solid, metres.
   *
   * Paint on top of a kerb would put the brightest value in the frame on the
   * one edge the player most needs to read as a step (`DESIGN.md` §3), so the
   * builder refuses it rather than trusting the author not to.
   */
  colliderClearance: 0.15,

  /**
   * The kit's share of the frame budget.
   *
   * `DESIGN.md` §8 caps the whole frame at 150 draw calls and 400k triangles.
   * All the paint in the world is one mesh — both paints ride on the vertex
   * colour — so the ceiling is really about catching an authoring change that
   * quietly paints the whole park.
   */
  maxDrawCalls: 2,
  maxTriangles: 12_000,
});

/**
 * The surfaces paint is allowed to land on.
 *
 * Checked against the **finished heightfield** rather than against the segment
 * that authored the line, because a corridor may carry a band of something else
 * inside its own width — the park gate and the riverside path both have grass
 * shoulders *inside* the corridor, on purpose (`level/sliceLevel.ts`). A centre
 * line authored down a path that later narrows is clipped to the asphalt by
 * this rather than painted onto turf.
 */
export const PAINTABLE_SURFACES: readonly SurfaceId[] = deepFreeze([
  'pavement',
  'roughPavement',
  'brick',
  'wood',
] as SurfaceId[]);

/** Width in metres for a role. One place, so a centre line is one width. */
export function markingWidth(role: MarkingRole): number {
  if (role === 'centre') return MARKINGS.centreWidth;
  if (role === 'bar') return MARKINGS.barWidth;
  return MARKINGS.edgeWidth;
}
