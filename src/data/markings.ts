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
export type MarkingPaint = 'road' | 'path' | 'kerb' | 'ink';

/**
 * Which line this is. Width comes from here rather than from the author, so a
 * centre line is the same width everywhere in the world.
 *
 * `glyph` arrived at M36 for the park's ground signage: the stroke of a letter
 * or of a chevron, wider than a lane line because it is read square-on from
 * forty metres away rather than swept past at a metre's distance.
 */
export type MarkingRole = 'centre' | 'edge' | 'bar' | 'glyph';

export const MARKING_PAINTS: Readonly<Record<MarkingPaint, { readonly albedo: number; readonly wear: number }>> = deepFreeze({
  /** Dark direction arrows on light wood; vertex colour, no extra material. */
  ink: { albedo: 0x3e3b37, wear: 0.10 },
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
   * One stroke of a printed letter or of a chevron, metres.
   *
   * Between a centre line and a bar, and the bound that sets it is the same
   * chase-camera arithmetic as the rest of this table read at the distance
   * signage is actually used at. A sign is read from the far end of its own
   * lead — forty metres at the kicker's approach — where a 1000-pixel pane
   * gives about `1000 / (1.26 * 40)` = 20 pixels a metre, so a 0.16 m centre
   * line would be three pixels and a 0.30 m stroke is six. Six pixels is a
   * legible stroke; three is a shimmer. Anything wider starts to close the
   * counters in `B`, `8` and `0` at this face's weight.
   */
  glyphWidth: 0.30,

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
   * The same, for one stroke of a printed letter, metres.
   *
   * **A letter is not a lane line and the rule above would eat it.** The bar of
   * an `A` is 0.87 m at the size M36 prints words, the arm of a `T` is 1.34 m,
   * and the two-metre minimum would drop both — printing `Λ` and `l` and
   * passing every test, because the clipper drops a short run silently. That
   * minimum exists to throw away *offcuts left by clipping*, not to veto
   * authored marks: "a 40 cm dab of white in the middle of a road is litter"
   * is a claim about a line that got cut, and the bar of an A is a claim about
   * a letter.
   *
   * Half a metre is a stroke a little over its own width and a half long, which
   * is the point where a clipped fragment stops reading as part of a letter and
   * starts reading as a dab. Nothing that is not a glyph uses it.
   */
  minGlyphRunLength: 0.5,

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
  if (role === 'glyph') return MARKINGS.glyphWidth;
  return MARKINGS.edgeWidth;
}

// ---------------------------------------------------------------------------
// Ground signage — M36 Phase 2
// ---------------------------------------------------------------------------

/**
 * Every word this project is allowed to print on the ground.
 *
 * **The list is short on purpose and it is the only list.** `docs/PLANS.md`
 * §36.4 asks for advance instructions a rider can take in *at speed*, which is
 * a hard limit on copy before it is a style: a word read at 20 m/s is read in
 * about a fifth of a second, and nobody reads a sentence in a fifth of a
 * second. Eight words, none longer than six letters, every one of them either
 * the name of a thing the trail is about to do or the thing to do about it.
 *
 * It is also the extension `render/inkKit.test.ts`'s scan was built to take.
 * That scan refuses any word printed anywhere in `src/` that is not on an
 * approved list, and until M36 the list was two entries long — a rider's
 * surname and a venue's name. Adding eight at once is exactly the "deliberate"
 * the guard asks for: they are written down here, in the data table, rather
 * than spelled inline at eight call sites, so the set can be read in one place
 * and so the scan can derive its allowance from the same constant the signage
 * prints from.
 *
 * **No word here names a manufacturer, a real place, or a person**
 * (`NOTICE.md`). Three are numbers or trail features (`180`, `GAP`, `STAIRS`),
 * four are instructions (`TAP`, `DOWN`, `DROP`, `STEP`), and one is what the
 * rider is about to be in (`AIR`).
 */
export const PARK_SIGN_WORDS = deepFreeze([
  /** The spin shelf asks for half a turn. A number reads faster than SPIN. */
  '180',
  /** Tap the shelf rather than clear it — the spin shelf's other half. */
  'TAP',
  /** The staircase. The instruction is the direction, which is the danger. */
  'DOWN',
  /** The straight gap, named where the take-off lip cannot be seen over. */
  'GAP',
  /** The drop rhythm. */
  'DROP',
  /** The charged step-up. */
  'STEP',
  /** The staircase again, where the word for the thing is wanted over DOWN. */
  'STAIRS',
  /** The kicker: the only feature on the venue that puts a rider in the air. */
  'AIR',
] as const);

/** One of the eight words above, and the type a sign's copy has to be. */
export type ParkSignWord = (typeof PARK_SIGN_WORDS)[number];

/**
 * Geometry for the ground signage, metres and seconds.
 *
 * **These live here rather than in `data/tuning.ts` on the precedent the rest
 * of this file sets.** `MARKINGS` above is already the answer to "how wide is a
 * line, how long is a dash, how close to a kerb may paint go", and a sign is
 * paint before it is anything else. `readSeconds` is the one entry with a claim
 * on the *rider* rather than on the paint, and it is noted below where it came
 * from so a future wave can move it to `EUC` if the owner would rather tune it
 * beside the brake.
 */
export const SIGNS = deepFreeze({
  /**
   * How long a rider is given to read a sign and decide, seconds.
   *
   * The lead a sign needs is `readSeconds * v + v² / (2a)`: the distance
   * covered while reading and deciding, plus the distance needed to stop from
   * that speed. The deceleration `a` is not a number here — it is
   * `EUC.brakeAuthority * sin(EUC.maxLeanPitch)` = 22.0 × sin 0.50 =
   * 10.547 m/s², the wheel's own full-lean braking, which is the product
   * `simulation/topSpeedPreset.test.ts` already uses. `level/parkSignage.ts`
   * derives it from `tuning.ts` rather than restating it.
   *
   * **1.5 s is chosen against a number this project already trusts.** At the
   * kicker's 40 mph approach the rule gives 26.8 m of reaction plus 15.2 m of
   * braking — 42.0 m — and `HAZARD.readMetres` is 40: the distance the route
   * validator already requires a rider to be able to *see* a hazard from. A
   * sign the rider cannot stop inside of would be decoration, and a lead
   * materially longer than the venue's own sight window would put the sign
   * somewhere they cannot see it from. The two numbers agreeing to within 5% is
   * the argument.
   */
  readSeconds: 1.5,

  /**
   * The narrowest pane the game is played in, as width ÷ height.
   *
   * **A sign the rider cannot fit on the screen is not a sign, and the screen
   * is not always a laptop's.** The chase camera's vertical field of view is
   * fixed (`CAMERA.fovAtRest`); the *horizontal* one is that angle times the
   * pane's aspect, so a phone held upright sees 16° either side of the heading
   * where a 1000×700 window sees 44°. A mark that is legal by the lead rule and
   * 50° off the heading is arithmetic rather than signage, which is exactly
   * what the browser pass found on two of this venue's pads.
   *
   * 412 × 915 is a Pixel 7's CSS box in portrait — the narrowest viewport the
   * project's own touch suite emulates, and narrower than any of the four-seat
   * panes, whose quarters keep the parent canvas's aspect
   * (`CAMERA.quadFovGain` is 1, so a quarter of a 1000×700 canvas is 500×350 at
   * the same angle). What a quarter costs is pixels; what a portrait phone
   * costs is *angle*, and angle is the one a placement rule can answer.
   */
  paneAspect: 412 / 915,

  /**
   * How far back a sign is still a mark rather than a shimmer, metres.
   *
   * The readability rule below needs a window to look for its spell in, and it
   * is bounded by the same arithmetic `MARKINGS.glyphWidth` is sized by: a pane
   * `n` pixels across at half-angle `H` draws `n / (2 tan H d)` pixels per metre
   * at distance `d`, and a stroke under about three pixels is a shimmer rather
   * than a line. On the narrowest pane above — 412 px at tan H = 0.2845 — a
   * 0.30 m stroke falls to 3.6 px at sixty metres and to 2.4 px at ninety. So
   * sixty is where the paint stops being paint, and scanning an approach
   * further back than that would credit a sign with a spell nobody can read.
   *
   * It is also, independently, where the browser pass starts its reading ride,
   * which is why the two measurements can be compared at all.
   */
  readMetres: 60,

  /**
   * The across-trail width of one letter box, metres.
   *
   * Not the cap height: road text is measured *along* the road, and this is the
   * dimension that is not foreshortened. A 0.30 m stroke inside a 0.90 m box is
   * a bold face — a third of the letter is ink — which is what a word painted
   * on dirt-brown boardwalk and read at forty metres has to be.
   *
   * **The Phase 2 browser pass asked for this to grow and it could not**, and
   * the reason is worth writing down where the next attempt will read it. Every
   * dimension of a word scales off this one — `glyphElongation` below turns it
   * into the cap height *along* the trail — and on Switchback the staircase's
   * word pad has 3.6 m of legal, readable trail to stand on (`terrace-turn`
   * between its own entry socket and the step-up's sign) against a cap height
   * of 3.484 m. There is 0.12 m of slack. Growing the box by a tenth pushes the
   * word off the only ground it fits on and the level refuses to build, which
   * is the right failure and not a useful one. `glyphTracking` below is the
   * half of the legibility problem that could be bought, because it spends
   * across-trail width and this venue has that to spare.
   */
  glyphAcross: 0.90,

  /**
   * Gap between two letters, as a fraction of one letter box.
   *
   * `shared/letterPaths.ts` defaults to 0.16, which is a *wordmark's* tracking
   * — a word printed on a garment or a banner and read square-on, where the
   * eye has the whole letter to work with. A word lying flat on a trail is
   * read at eight to twelve degrees above the ground through a pane that may be
   * a quarter of a laptop screen, and there the only thing separating two
   * letters is the unpainted ground between them.
   *
   * **0.30 was bought with a measurement.** At the box above the old 0.16 left
   * 0.144 m of ground between two letters — under half the 0.30 m stroke the
   * same photographs show reading cleanly — and two letters whose gap is
   * thinner than their own ink run together before either is illegible on its
   * own, which is exactly how `DOWN` came back reading close to `DUWN`. 0.30
   * makes the gap 0.270 m: nine tenths of the stroke, where it was under a
   * half. A separation about as wide as the ink is the bound this project can
   * state without owning a font renderer, and it costs nothing but across-trail
   * width — `DOWN` grows from 4.03 m to 4.41 m and the widest corridor it is
   * painted on is 8 m either side of the centreline.
   */
  glyphTracking: 0.30,

  /**
   * How much taller a letter is along the trail than its proportions ask for.
   *
   * A mark lying flat on the ground is foreshortened by roughly the cosine of
   * the viewing angle, and the chase camera sits about 2 m up and 6 m back — so
   * a word 40 m ahead is seen at about 8° above the ground and loses most of
   * its along-trail extent. Real road text is stretched for exactly this
   * reason, and 2.4 is at the flat end of the range highway text uses (2–4×),
   * because this camera is higher than a driver's eye.
   *
   * **This is the number the quarter pane wants raised and the venue will not
   * pay for.** The word's projected *height* is what a four-seat pane runs out
   * of: at the standoff the browser pass photographs from — about twelve
   * metres, the camera two and a half metres up — a 3.484 m cap height projects
   * to 0.71 m, and a quarter of a 1000×700 canvas draws that in sixteen pixels.
   * 3.2 would make it twenty-eight. It cannot be spent here because the cap
   * height *is* the along-trail length of the word's pad, and Switchback's
   * staircase has 3.6 m of readable trail for one (see `glyphAcross`). Moving
   * it is a geometry decision — free a metre of `timber` or of `terrace-turn`
   * first, then raise this, then re-run the bench.
   */
  glyphElongation: 2.4,

  /** Gap between the word and the arrows that follow it, metres. */
  copyGap: 2.5,

  /** How many chevrons point into the technical line. */
  chevronCount: 3,
  /** Along-trail length of one chevron, from its wings to its tip, metres. */
  chevronLength: 1.8,
  /** Half the across-trail span of a chevron's wings, metres. */
  chevronHalfSpan: 1.1,
  /** Distance between one chevron's tip and the next one's, metres. */
  chevronPitch: 2.6,

  /**
   * Along-trail length of the bypass arrow's taper, metres.
   *
   * Long and shallow, because it is a lane change rather than a turn, and
   * because its *shape* is what makes it unmistakably not a chevron. A rider
   * who cannot tell the colours apart still sees a stack of three arrowheads on
   * one line and a single long sweep leaving it.
   */
  bypassTaperLength: 7.0,

  /**
   * How far the boardwalk pad reaches past the paint on it, metres.
   *
   * At least one heightfield cell of the venue it is laid on — the park is
   * sampled every 1.5 m and a cell takes the surface of whatever is under its
   * *centre* — so paint authored right to the edge of a pad would be clipped
   * by half a cell of dirt. 1.6 buys the cell and 10 cm of slack.
   */
  padMargin: 1.6,

  /** The same, for the pad under a landing box, metres. */
  landingPadMargin: 1.4,

  /**
   * Clear ground a signpost leaves beyond the corridor and its own plate,
   * metres.
   *
   * On top of `buildPlan.PROP_CORRIDOR_CLEARANCE` and the signpost's own
   * footprint radius, both of which the builder already enforces — this is the
   * margin that stops a post that *just* cleared the filter from reading as
   * standing in the trail.
   */
  postClearance: 0.25,
});
