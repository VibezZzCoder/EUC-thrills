/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ground mottle — the procedural surface texture, in one place and with no
 * imports at all.
 *
 * **Why this file exists.** `DESIGN.md` §4 states what the mottle is *for*: a
 * large expanse of one flat colour gives the eye nothing to track, so the ride
 * reads slower than it is, and the M1 debug grid was what made speed readable
 * before real terrain deleted it. The M4 answer was a single one-metre
 * luminance jitter at full contrast. It works as a speed cue and it fails as a
 * surface: one scale, one channel, high contrast, on a square lattice is the
 * description of a checkerboard, and at M7.5 the owner correctly read the
 * ground as a debug grid rather than as dirt and grass.
 *
 * **The fix is not less mottle — that would quietly regress the M3 gate.** It
 * is *more scales*. Three layers of variation, the metre-scale one kept but no
 * longer the loudest, so the grid stops being the only feature the eye can
 * find:
 *
 *   1. **Per cell, white noise squared about zero, ~1 m** (~8 m out on the
 *      surround field). This is the speed cue and nothing else in the stack can
 *      do its job: only a value that changes every cell moves past fast enough
 *      to read at 15 m/s. Its contrast is now a fraction of the total rather
 *      than all of it, and squaring puts most cells near their surface's own
 *      tone so the ones that stand out read as wear rather than as a lattice.
 *   2. **Mid, smooth value noise, metres.** Soft patches a few cells across —
 *      wear, damp ground, thinner turf.
 *   3. **Coarse, smooth value noise, tens of metres.** The slow drift that
 *      makes a field read as a field rather than as a painted plane.
 *
 * Plus two *chromatic* layers, because a purely luminance jitter reads as
 * uneven **lighting** rather than as uneven **material** — which is the second
 * half of why the M4 version looked like a debug overlay:
 *
 *   4. **Hue**, warm/cool at ~20 m: dry and yellow against damp and blue-green.
 *   5. **Saturation**, at ~40 m, computed against the material's own base
 *      colour so a desaturated patch moves toward that material's own grey and
 *      never toward some shared one. Every surface keeps its identity.
 *
 * Four properties are load-bearing and each is a rule from `DESIGN.md` §4:
 *
 * - **Deterministic, never `Math.random`.** Every layer is an integer hash of
 *   integer lattice coordinates. The same ground looks the same on every boot,
 *   or no visual regression capture means anything.
 * - **Per cell, not per vertex.** This module answers per *cell*; the caller
 *   gives every corner of a cell the same answer on four unshared vertices, so
 *   a square metre takes one tone instead of a ten-metre gradient.
 * - **Amplitudes stay proportional to the material's own `mottle`,** so grass
 *   still mottles far harder than pavement and the two read apart at distance
 *   before their hues do.
 * - **The surround uses the same code at a coarser profile.** The change of
 *   scale at the course boundary is the feature that separates managed ground
 *   from open ground, so it is a second profile rather than a second algorithm.
 *
 * **This file imports nothing on purpose.** It is the only part of the look
 * pass that can be checked at `node --test` with no browser and no `three`, and
 * `groundNoise.test.ts` beside it pins the determinism and the bounds.
 */

/** Multiplier applied to a material's linear albedo, one factor per channel. */
export interface GroundTint {
  r: number;
  g: number;
  b: number;
}

/**
 * One material-independent recipe for the layer stack.
 *
 * Weights are fractions of the material's own `mottle`, so a single profile
 * serves pavement at 0.075 and grass at 0.20 without a per-surface table.
 * Lengths are metres.
 */
export interface MottleProfile {
  /** Weight of the per-cell white-noise layer — the speed cue. */
  readonly cellWeight: number;
  readonly midMetres: number;
  readonly midWeight: number;
  readonly coarseMetres: number;
  readonly coarseWeight: number;
  /** Warm/cool shift, as a fraction of `mottle`. */
  readonly hueMetres: number;
  readonly hueWeight: number;
  /** Saturation swing, as a fraction of `mottle`. */
  readonly satMetres: number;
  readonly satWeight: number;
}

/**
 * The course.
 *
 * `cellWeight` is deliberately about half of what it was: at M4 it was 1, and a
 * metre-scale layer carrying the entire mottle is what made the grid the single
 * loudest thing on screen. It is still the equal of either smooth layer on its
 * own, because a cue that changes only every six metres is not a cue at 15 m/s
 * — it is simply no longer larger than the two of them together.
 *
 * **The sum of the three is close to a ceiling, and the ceiling is a
 * readability rule rather than taste.** Kerb concrete is only 46% above
 * pavement in linear luminance, and `DESIGN.md` §3 wants 25% of that kept even
 * at the road's brightest cell — which leaves the whole stack about 1.58 in
 * summed weight before the kerb stops reading. `data/surfaces.test.ts` asserts
 * it; if a future pass wants a louder mottle it needs a palette change first,
 * not a bigger number here.
 *
 * The two lengths are a little over four cells and a little under thirty, and
 * neither is a whole multiple of the other or of the one-metre grid. Whole
 * ratios re-phase the layers into one visible pattern, which is the failure
 * this whole file exists to end.
 */
export const COURSE_MOTTLE: MottleProfile = {
  cellWeight: 0.52,
  midMetres: 5.7,
  midWeight: 0.52,
  coarseMetres: 27.0,
  coarseWeight: 0.50,
  hueMetres: 19.0,
  hueWeight: 0.40,
  satMetres: 41.0,
  satWeight: 0.40,
};

/**
 * The open field beyond the course.
 *
 * Same stack, every length stretched — its own cells are already eight metres,
 * so its smooth layers have to move out to tens and hundreds to stay *coarser*
 * than the course rather than merely different from it. `DESIGN.md` §5 calls
 * the change of scale at that boundary a feature; this is where it lives.
 *
 * **Its per-patch weight is lower than the course's, and that is a geometry
 * fact rather than a taste.** The field is one flat quad per patch, so *every*
 * layer on it is constant across eight metres and steps at the patch edge — the
 * smooth ones simply step by less. There is nothing between an eight-metre
 * square and the next one to soften the join, so the only lever on how hard
 * that join reads is how much the per-patch layer contributes, and eight metres
 * of one tone right under a six-metre chase camera is a large flat rectangle at
 * any contrast worth noticing. The field's speed cue is also worth less than
 * the course's: it is the ground the rider is usually beside rather than on.
 */
export const FIELD_MOTTLE: MottleProfile = {
  cellWeight: 0.36,
  midMetres: 37.0,
  midWeight: 0.58,
  coarseMetres: 145.0,
  coarseWeight: 0.57,
  hueMetres: 96.0,
  hueWeight: 0.60,
  satWeight: 0.45,
  satMetres: 210.0,
};

/**
 * An upper bound on how much brighter than its table albedo a material can
 * appear once every layer lands on the same cell.
 *
 * Exported because it is the number a palette rule has to be checked against.
 * `DESIGN.md` §3 requires kerb concrete to stay at least 25% lighter than every
 * road it borders, and the road the player actually sees is the albedo *times
 * this* — a rule checked against the flat table value is a rule that stops
 * being true the moment the mottle gains a layer. `data/surfaces.test.ts`
 * asserts it against the brightest mottled road instead.
 *
 * The three luminance layers multiply out exactly. The hue layer is bounded by
 * its own amplitude, which is loose (the true worst case is about half of it,
 * since red rising is partly paid for by blue falling) and deliberately so — a
 * loose bound on a readability rule fails safe. The saturation layer is exactly
 * luminance-preserving: it moves a colour toward `grey`, and `grey` *is* its
 * luminance, so the weighted sum comes back unchanged.
 */
export function maxLuminanceGain(mottle: number, profile: MottleProfile = COURSE_MOTTLE): number {
  const shade = 1 + mottle
    * (profile.cellWeight + profile.midWeight + profile.coarseWeight);
  return shade * (1 + mottle * profile.hueWeight);
}

/**
 * How far one surface creeps over the one beside it — M7.5 stage 4's "edges".
 *
 * **The failure this fixes is a metre-scale one, which is why it is here and
 * not in geometry.** A surface belongs to a heightfield *cell*
 * (`level/plan.ts`), so a path crossing the world at any angle other than a
 * right one has a boundary made of one-metre steps. At walking pace that is a
 * staircase; from the chase camera at speed it is the single loudest thing left
 * saying "this is a diagram of a place" — a road drawn on graph paper.
 *
 * The fix costs no triangles at all. An edge cell takes some of its
 * neighbour's colour, in an amount that varies from cell to cell and in patches
 * along the edge, so the boundary lands somewhere inside its metre instead of
 * exactly on the lattice. That is also what a real path edge does: turf creeps
 * over asphalt in tongues, and the line between them is nowhere straight.
 *
 * **It is directional, and the direction is the point.** Grass grows over a
 * path; a path does not grow over grass. Each material carries its own
 * `encroach` in `data/surfaces.ts`, and colour only ever moves from the higher
 * to the lower — so the corridor's edge frays green while the meadow beside it
 * keeps its own colour, and the rider still reads exactly where the grip
 * changes to within a metre. Softening it *both* ways would have blurred the
 * grip boundary, which the priority order in `DESIGN.md` §1 does not allow.
 */
export const EDGE_ENCROACH = {
  /**
   * The most of a neighbour's colour one cell may take, 0..1.
   *
   * Judged from a gameplay-scale capture of the riverside path, which is the
   * hardest case in the world — a 6.4 m asphalt path with grass on both sides,
   * seen from six metres. Above about a third, a heavily blended cell stops
   * reading as a tongue of turf over the edge and starts reading as a square
   * metre of lawn on the path, because the blend is per cell and a cell is a
   * square metre. `DESIGN.md` §6b's rule, in its fourth system.
   */
  maxBlend: 0.36,
  /**
   * Wavelength of the patchiness along an edge, metres.
   *
   * Between one and two cells would be a dither and tens of metres would be a
   * taper. Five and a half is a few cells: long enough that a tongue of grass
   * reads as a tongue, short enough that several fit along one straight of the
   * riverside path.
   */
  patchMetres: 5.5,
} as const;

/**
 * How much of a neighbouring surface one edge cell takes.
 *
 * `strength` is the neighbour's own `encroach`. The result is bounded by
 * `EDGE_ENCROACH.maxBlend`, which is what lets `data/surfaces.test.ts` prove
 * that no amount of encroachment can brighten a road past the kerb rule.
 *
 * Two fields multiplied, because either alone fails: the smooth one decides
 * *where* the edge frays and the per-cell one decides *how far*. Smooth alone
 * feathers the whole boundary evenly, which is a blur rather than an edge;
 * per-cell alone is salt and pepper along a line, which reads as dithering.
 */
export function encroachAt(
  cellX: number,
  cellZ: number,
  worldX: number,
  worldZ: number,
  strength: number,
  salt: number,
): number {
  if (strength <= 0) return 0;
  const patch = fbm(worldX, worldZ, EDGE_ENCROACH.patchMetres, 0x3d17, 0.83) * 0.5 + 0.5;
  const grain = hash(cellX, cellZ, salt);
  return strength * EDGE_ENCROACH.maxBlend * patch * (0.35 + 0.65 * grain);
}

/** Mix two linear colours. `amount` of `b`, the rest `a`. */
export function mixColours(a: GroundTint, b: GroundTint, amount: number, out: GroundTint): GroundTint {
  out.r = a.r + (b.r - a.r) * amount;
  out.g = a.g + (b.g - a.g) * amount;
  out.b = a.b + (b.b - a.b) * amount;
  return out;
}

/**
 * Re-express a tint computed against one base colour as a tint against another.
 *
 * The vertex colour is a **multiplier on the material's albedo**, so a cell
 * that wants to end up part-grass has to carry the ratio between the blended
 * colour it wants and the albedo the material will actually supply. Without
 * this the mottle would be computed correctly against the blended colour and
 * then multiplied by the wrong albedo, which is the sort of error that renders
 * plausibly and is wrong everywhere.
 */
export function rebaseTint(tint: GroundTint, from: GroundTint, to: GroundTint): GroundTint {
  tint.r *= to.r > 1e-6 ? from.r / to.r : 1;
  tint.g *= to.g > 1e-6 ? from.g / to.g : 1;
  tint.b *= to.b > 1e-6 ? from.b / to.b : 1;
  return tint;
}

/** A modular paving pattern, for a surface that is laid rather than grown. */
export interface PavingProfile {
  /** Size of one paving module, metres. */
  readonly module: number;
  /** How far a module's tone may stray from the surface's own, as a fraction. */
  readonly contrast: number;
}

/**
 * The tone of the paving module a point falls in — stage 4's plaza patterning.
 *
 * A plaza is *laid*, and until now the slice's was a field of brick-coloured
 * noise: correct in colour, and with nothing in it to say a person built it.
 * Modular tone variation says so at a glance and costs nothing, because it is
 * three more floats into a colour attribute the mesh already carries.
 *
 * **This deliberately reintroduces a regular lattice, and the two guards on it
 * are what keep it from being the failure §4b just fixed.** First, alternate
 * courses are offset by half a module — a running bond, which is how paving is
 * actually laid, and which means the joints in one direction never line up
 * across more than one course. Second, the tone is squared about zero like the
 * per-cell mottle, so most modules sit at the surface's own value and only a
 * scattered few stand out. A grid whose lines do not continue and whose cells
 * mostly match is read as paving; the M4 checkerboard was neither.
 *
 * It is per *material* rather than per level, so it applies exactly where brick
 * does — which in the slice is the plaza and its returning arch, and nowhere
 * else.
 */
export function pavingShade(worldX: number, worldZ: number, paving: PavingProfile): number {
  const row = Math.floor(worldZ / paving.module);
  const column = Math.floor(worldX / paving.module + ((row & 1) === 0 ? 0 : 0.5));
  const unit = hash(column, row, 0x7b5f) * 2 - 1;
  return 1 + unit * Math.abs(unit) * paving.contrast;
}

/**
 * A stable phase in [0, 2π) for one harmonic of one feature's outline — M13.
 *
 * `render/hazards.ts` builds a pothole's ragged edge and a spill's lobes out of
 * a few angular harmonics rather than out of per-vertex noise, and each harmonic
 * needs a phase that is the same every time the world is rebuilt and different
 * for every hazard. Taking it from the feature's own world position gives both
 * for free and needs no seed threaded down from the level: two hazards are never
 * in the same place, and a hazard is always in the same place.
 *
 * Quantised to 1/8 m before hashing, so a footprint whose centre moves by a
 * floating-point epsilon between two builds cannot change shape. It lives here
 * with the ground's own variation because that is where this project keeps
 * procedural noise, and because a second private copy of `hash` is how two
 * systems start to disagree.
 */
export function outlinePhase(worldX: number, worldZ: number, harmonic: number): number {
  const x = Math.round(worldX * 8);
  const z = Math.round(worldZ * 8);
  return hash(x, z, 0x51ed + Math.imul(harmonic, 977)) * Math.PI * 2;
}

/**
 * Integer hash of a lattice point, in [0, 1).
 *
 * Carried over from the M4 `vertexJitter` and given a seed so the five layers
 * are independent instead of five views of one pattern. `Math.imul` rather than
 * `*` because the products overflow 32 bits and only `imul` wraps them the same
 * way every time.
 */
function hash(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 15), 1540483477) | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Quintic ease, `6t^5 - 15t^4 + 10t^3`.
 *
 * **Not the cheaper `3t^2 - 2t^3`, and the difference is visible.** The cubic
 * has a zero first derivative at each end but a discontinuous *second*
 * derivative, so a lattice line shows up as a faint crease in the shading —
 * which on a large flat road is a set of long straight diagonal seams. That is
 * a rotated grid, which is the artifact this file exists to remove. The quintic
 * flattens the second derivative too and the seams go away.
 */
function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Smooth value noise on a unit lattice, in [-1, 1].
 *
 * **Sampled through a rotation**, which is not cosmetic. A value-noise lattice
 * is axis-aligned, and axis-aligned low-frequency noise laid over an
 * axis-aligned one-metre cell grid is a second grid — a quieter version of
 * exactly the artifact being fixed. Each layer gets its own irrational-ish
 * angle, so no layer's lattice lines up with the ground's or with another
 * layer's.
 */
function valueNoise(
  x: number,
  z: number,
  metres: number,
  seed: number,
  angle: number,
): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const u = (x * cos - z * sin) / metres;
  const v = (x * sin + z * cos) / metres;

  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const fu = smooth(u - u0);
  const fv = smooth(v - v0);

  const n00 = hash(u0, v0, seed);
  const n10 = hash(u0 + 1, v0, seed);
  const n01 = hash(u0, v0 + 1, seed);
  const n11 = hash(u0 + 1, v0 + 1, seed);

  const top = n00 + (n10 - n00) * fu;
  const bottom = n01 + (n11 - n01) * fu;
  return (top + (bottom - top) * fv) * 2 - 1;
}

/**
 * Two octaves of it, in [-1, 1].
 *
 * One octave of value noise is a lattice of blobs all the same size, and at the
 * scale a road fills the screen that reads as *large tiles* rather than as
 * ground — the checkerboard again, softer and bigger. A second octave at a
 * little over a third of the wavelength, rotated again and carrying a third of
 * the weight, breaks every blob's outline without adding a scale the eye reads
 * as its own layer. The weights sum to one, so the result is still bounded and
 * `maxLuminanceGain` stays a real bound.
 */
function fbm(x: number, z: number, metres: number, seed: number, angle: number): number {
  return valueNoise(x, z, metres, seed, angle) * 0.68
    + valueNoise(x, z, metres * 0.37, seed ^ 0x9e37, angle + 1.1) * 0.32;
}

/** Rec. 709 luminance of a linear colour. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The per-channel tint for one ground cell.
 *
 * `cellX`/`cellZ` are the cell's **integer** indices and drive the white-noise
 * speed cue; `worldX`/`worldZ` are its centre in metres and drive everything
 * smooth, so the low-frequency layers are world-locked and do not shift when a
 * level is re-authored on a different origin.
 *
 * `base` is the material's own linear albedo. It is needed only by the
 * saturation layer, which pulls a patch toward *that material's* grey — pulling
 * every surface toward one shared grey would collapse the palette, which is the
 * failure `DESIGN.md` §3 exists to prevent.
 *
 * Writes into `out` rather than allocating: this runs once per drawn cell, and
 * the slice draws forty-three thousand of them.
 */
export function groundTint(
  cellX: number,
  cellZ: number,
  worldX: number,
  worldZ: number,
  mottle: number,
  base: GroundTint,
  profile: MottleProfile,
  out: GroundTint,
): GroundTint {
  // 1. The speed cue. White noise per cell, flat across the cell, and
  //    **squared about zero** — the sign is kept, the magnitude is not.
  //
  //    A uniform jitter puts as many cells at full contrast as at none, so
  //    every cell disagrees loudly with every neighbour and the eye reads the
  //    lattice instead of the ground. That is the checkerboard, and turning its
  //    amplitude down turns the speed cue down with it. Squaring moves most
  //    cells close to their surface's own tone and leaves a scattered minority
  //    standing out, which is what worn ground looks like and is still a value
  //    that changes every metre — the cue survives at a fraction of the
  //    apparent regularity.
  const white = hash(cellX, cellZ, 0x51ed) * 2 - 1;
  const cell = white * Math.abs(white);

  // 2 and 3. The patches that stop the grid being the only feature.
  const mid = fbm(worldX, worldZ, profile.midMetres, 0x2f9e, 0.61);
  const coarse = fbm(worldX, worldZ, profile.coarseMetres, 0x7b3d, 2.19);

  const shade = 1 + mottle * (
    cell * profile.cellWeight
    + mid * profile.midWeight
    + coarse * profile.coarseWeight
  );

  // 4. Warm/cool. Real ground varies in colour, not only in brightness, and a
  //    pure luminance jitter reads as lighting rather than as material. Red and
  //    blue move in opposition with green following red at a third, which walks
  //    a surface between dry-yellow and damp-blue rather than between two
  //    arbitrary colours — the same direction for turf, dirt, brick, and
  //    weathered pavement alike.
  const warm = fbm(worldX, worldZ, profile.hueMetres, 0x1c47, 1.37)
    * mottle * profile.hueWeight;

  // 5. Saturation, toward and away from this material's own grey.
  const grey = luminance(base.r, base.g, base.b);
  const saturation = 1 + fbm(worldX, worldZ, profile.satMetres, 0x6ae1, 2.83)
    * mottle * profile.satWeight;

  out.r = channel(base.r, grey, saturation) * shade * (1 + warm);
  out.g = channel(base.g, grey, saturation) * shade * (1 + warm * 0.34);
  out.b = channel(base.b, grey, saturation) * shade * (1 - warm);
  return out;
}

/**
 * The saturation multiplier for one channel.
 *
 * The tint is a *multiplier* on the albedo the material already has, so a
 * saturation change has to be expressed as the ratio between the desired colour
 * and the base one: `grey + (c - grey) * s`, divided by `c`. A channel at or
 * near zero has no ratio that means anything, so it is left alone rather than
 * blown to infinity — nothing in the ground palette is there, but a future
 * saturated material would be.
 */
function channel(value: number, grey: number, saturation: number): number {
  if (value < 1e-4) return 1;
  // Floored at zero: on a channel far below the material's own grey the ratio
  // is large, and a saturation push past `grey / (grey - value)` would drive it
  // negative. Nothing in the ground palette comes within half of that — grass's
  // blue, the most extreme, would need a swing eight times the one it gets —
  // but a negative albedo is not a look, it is a bug, and this costs nothing.
  return Math.max(0, saturation + (grey / value) * (1 - saturation));
}

/**
 * Linear RGB from an sRGB hex, matching what three.js does to a material colour
 * before lighting.
 *
 * The 2.2 power rather than the piecewise sRGB curve, because that is the
 * approximation `DESIGN.md` §2 and `data/surfaces.test.ts` already author and
 * assert against, and the saturation layer only needs the ratios between
 * channels. Keeping one convention is worth more here than the last percent.
 */
export function linearFromSrgbHex(hex: number, out: GroundTint): GroundTint {
  out.r = (((hex >> 16) & 0xff) / 255) ** 2.2;
  out.g = (((hex >> 8) & 0xff) / 255) ** 2.2;
  out.b = ((hex & 0xff) / 255) ** 2.2;
  return out;
}
