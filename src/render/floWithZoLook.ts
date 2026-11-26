/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { configureFloPewter, configureFloSmoke, floWrapShield } from './floWithZoHelmet.ts';
import { jacketFold, jacketPanelWidth, raceJacketClosures } from './floRaceJacket.ts';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.ts';
import {
  limbProfile,
  loftGeometry,
  loftProfile,
  tintOver,
  type LoftProfile,
  type LoftRing,
  type Tint,
} from './blockoutKit.ts';
import type {
  PatchAnchor,
  RiderLook,
  RiderMaterialRole,
  RiderMaterialSpec,
  RiderPanelGroup,
  RiderPatch,
} from './riderLook.ts';

// -- FloWithZo ----------------------------------------------------------------
//
// FloWithZo's supplied racing photographs are the visual authority. His light
// technical suit has roomy tapered trousers, a warm pewter/bronze domed helmet
// with an opaque smoked wrap shield, charcoal upper knee braces, segmented pale
// shin shells, dark wrap straps, and low light trainers. The cyan/gold hem band
// remains asymmetric. No reference image, lettering or proprietary shell mark
// is loaded by the game.
//
// The shared skeleton and stance solve remain unchanged. Geometry and paint
// live in this look; the helmet's local material response is in
// `floWithZoHelmet.ts`. Body and limbs share the silver suit material, while
// rigid guards use their own surface. Guard geometry remains in replay even
// where a live shadow pass is unnecessary.
//
// This sibling module imports riderLook types only, avoiding a value-import
// cycle. Changes to Flo's copied profiles do not alter the other riders.

// -- Copied helpers and shared tables -----------------------------------------

/** `TORSO_HALF_WIDTH` / `TORSO_HALF_DEPTH`, copied from `riderLook.ts:699-700`. */
const FLO_TORSO_HALF_WIDTH = B.torsoWidth / 2;
const FLO_TORSO_HALF_DEPTH = B.torsoDepth / 2;

/** `ringOf`, copied from `riderLook.ts:5915` — a cross-section at a height. */
function floRingAt(profile: LoftProfile, y: number): LoftProfile[number] {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y <= first.y) return first;
  if (y >= last.y) return last;
  let lower = first;
  let upper = last;
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i]!.y < y) continue;
    lower = profile[i - 1]!;
    upper = profile[i]!;
    break;
  }
  const f = (y - lower.y) / (upper.y - lower.y);
  const blend = (a: number, b: number): number => a + (b - a) * f;
  return {
    y,
    halfWidth: blend(lower.halfWidth, upper.halfWidth),
    halfDepth: blend(lower.halfDepth, upper.halfDepth),
    x: blend(lower.x, upper.x),
    z: blend(lower.z, upper.z),
    square: blend(lower.square, upper.square),
  };
}

/**
 * `limbAtHeights`, copied from `riderLook.ts:5973` — a limb re-rung at chosen
 * heights, keeping `limbProfile`'s taper and its hemispherical close.
 *
 * Wheel in Motion needed it so a printed page's rows were linear in metres.
 * Nothing is printed here, but the reason survives one step down: **a paint
 * boundary is a ring pair or it is a smear**, and even rings are what let a
 * pair be dropped anywhere without the interval either side of it collapsing.
 */
function floLimbAtHeights(
  length: number,
  radii: readonly [number, number, number],
  heights: readonly number[],
  options: { flatten: number; square: number },
): LoftProfile {
  const [top, mid, end] = radii;
  const radiusAt = (t: number): number => (
    t < 0.5 ? top + (mid - top) * (t / 0.5) : mid + (end - mid) * ((t - 0.5) / 0.5)
  );
  const rings = heights.map((y) => {
    const radius = radiusAt(Math.min(1, Math.max(0, -y / length)));
    return { y, halfWidth: radius, halfDepth: radius * options.flatten, square: options.square };
  });
  for (const [t, scale] of [[0.5, 0.86], [0.85, 0.54], [1, 0]] as const) {
    rings.push({
      y: -length - end * 0.55 * t,
      halfWidth: end * scale,
      halfDepth: end * scale * options.flatten,
      square: options.square,
    });
  }
  return loftProfile(rings);
}

/** Insert interpolated rings into a profile — a paint boundary's seam pair. */
function floWithRingsAt(profile: LoftProfile, heights: readonly number[]): LoftProfile {
  return loftProfile([...profile, ...heights.map((y) => floRingAt(profile, y))]
    .slice()
    .sort((a, b) => a.y - b.y));
}

/** `JACKET`, copied from `riderLook.ts:711` — the silhouette his jersey re-rings. */
const FLO_JACKET = loftProfile([
  { y: -0.010, halfWidth: 1.03 * FLO_TORSO_HALF_WIDTH, halfDepth: 1.01 * FLO_TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.018, halfWidth: 0.98 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.96 * FLO_TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.050, halfWidth: 0.90 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.93 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
  { y: 0.155, halfWidth: 0.91 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.92 * FLO_TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.290, halfWidth: 0.97 * FLO_TORSO_HALF_WIDTH, halfDepth: 1.01 * FLO_TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
  { y: 0.400, halfWidth: 1.00 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.98 * FLO_TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
  { y: 0.470, halfWidth: 1.00 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.90 * FLO_TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
  { y: 0.500, halfWidth: 0.93 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.82 * FLO_TORSO_HALF_DEPTH, square: 2.9 },
  { y: 0.528, halfWidth: 0.74 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.66 * FLO_TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.548, halfWidth: 0.44 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.50 * FLO_TORSO_HALF_DEPTH, square: 2.3 },
]);

/** `NECK`, copied from `riderLook.ts:756`. */
const FLO_NECK = loftProfile([
  { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
  { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
  { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
  { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);

/** `BOOT`, copied from `riderLook.ts:788`. A low trainer wears the same last. */
const FLO_BOOT = loftProfile([
  { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
  { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
  { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
  { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
  { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
  { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
  { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);

/** `BOOT_SOLE`, copied from `riderLook.ts:804`. */
const FLO_BOOT_SOLE = loftProfile([
  { y: -0.018, halfWidth: 0.060, halfDepth: B.bootLength * 0.44, square: 4.2 },
  { y: -0.003, halfWidth: 0.065, halfDepth: B.bootLength * 0.47, square: 5.2 },
  { y: 0, halfWidth: 0.062, halfDepth: B.bootLength * 0.45, square: 4.6 },
]);

// -- Where his colours change, in metres --------------------------------------

/**
 * The guard's top on the thigh — Wheel in Motion's 0.735, and for his reason
 * rather than the clearance ceiling that number's history cites
 * (`riderLook.ts:5883-5899`, re-derived at M30 q121: 0.735 clears the honest
 * floor by 138 mm). PHOTO 2 puts the kneecap plate about 100 mm above the
 * knee; 0.735 × 400 mm is 106.
 */
export const FLO_GUARD_TOP = 0.735;
/** The knee cup's two edges, thigh side then shin side — a 50 mm cup. */
export const FLO_CUP_TOP = -0.380;
export const FLO_CUP_BOTTOM = -0.030;
/**
 * Where the trainer's collar sits on the shin — 0.82, not Wheel in Motion's
 * 0.72, because PHOTO 2's footwear is a **low trainer** and his boots are a
 * moto boot's shaft. The guard runs 68 mm past this, to the ankle bone.
 */
export const FLO_BOOT_TOP = 0.82;
/**
 * The two-tone hem band: the lowest jacket rows, and **80 mm since r2's
 * finding 6b** — the silhouette critic's, taken from the chase capture alone.
 * At 50 mm it rendered as eight saturated rows, **4.4 % of his 318 px height
 * and 13.6 % of his shoulder width**, dead level to within 4 px across the
 * whole band: a hairline belt. PHOTO 2's cyan half *alone* is 27 rows rising
 * 19 px over 46 px of x (22° off horizontal) and 22 % of the back's width,
 * with the gold running under it from the opposite hip. 0.070 puts the band at
 * 14.3 % of the 558 mm jacket against 9.0 %, and the asymmetry is
 * `floBandTopAt`'s.
 */
export const FLO_BAND_TOP = 0.070;
/**
 * How far forward the band may reach — **r1, finding 4c**. The first cut wrapped
 * the waist at a constant height, and the captures showed cyan and gold
 * straddling the body centre dead front where PHOTO 1's waist front is plain
 * suit (hue 28°, sat 8.9 %) and PHOTO 2's band is a sash widest at the hips.
 * At +0.02 m the gate lands just behind the flank pole of every hem ring, so
 * the two hues cover the back and both hips — PHOTO 1's teal hip-crest tab is
 * on the pole and stays — and nothing crosses the front. It mirrors
 * the fitted vest on the other face.
 */
export const FLO_BAND_FRONT_STOP = 0.020;
/**
 * The sash's taper (**r1, finding 4c**, second half): the band is deepest at
 * the hips and closes toward the spine, so its top edge is lowered by up to
 * `FLO_BAND_TAPER` as `|x|` falls below `FLO_BAND_HIP`. With the hem's rows
 * 28 mm apart this reads as one row fewer over the spine and three rows at the
 * hip — which is the sash PHOTO 2 shows, and it also takes the widest row out
 * of the join's own smear (4b).
 *
 * **The taper is now the gold half's only** (r2, 6b, and the mild pull §B of
 * that record records rather than rules): r1 asked for a band widest at the
 * hips and narrowing toward the centre back, r2 for a rising wedge thickest at
 * one hip, and PHOTO 2 settles it — the cyan is one deep wedge across his
 * right hip and the back, the gold a thinner one closing under it from his
 * left. Full height on the negative half, tapered across the positive one,
 * satisfies both statements, because r1's ask is true of the gold half.
 */
const FLO_BAND_HIP = 0.120;
const FLO_BAND_TAPER = 0.024;
/**
 * Where the gold stops short of his left hip — **r2, finding 4d**. The gold
 * ran to the hem's own silhouette with no pale hem before it; PHOTO 2 keeps
 * ≈ 13 % of pale hem between that hip's edge and the gold wedge's tip (a lower
 * bound: the hip is rotated away in that frame). It mirrors in `x` what
 * `FLO_BAND_FRONT_STOP` does in `z`, and it is the gold's alone — the cyan
 * wraps its own hip, which is the asymmetry PHOTO 2 shows and what 6b's wedge
 * is made of.
 *
 * **A fraction of the vertex's own ring, not an absolute `x`.** The verifier's
 * 0.85 is written as metres off the hem ring, and a superellipse at
 * `square 2.8` clusters its columns at the corners: the eight banded columns of
 * a hem row stand at 1.000, 0.984, 0.937, 0.859, 0.750, 0.615, 0.457 and 0.199
 * of that row's half-width, so an absolute cut falls between two of them on one
 * row and outside both on the next — 0.85 m takes four columns off the hem row
 * and three off the row above, a 25 % pale gap where 13 % was asked for. Read
 * against each row's own half-width, 0.87 drops the same three columns at every
 * height and leaves the gold's tip 14–15 % in from the silhouette.
 */
const FLO_GOLD_HIP_STOP = 0.87;
/** Existing pattern stations retained in the jersey profile. The racing
 * jacket now uses a continuous zipped centre panel up to the neckline. */
export const FLO_VEST_TOP = 0.410;
export const FLO_VEST_BOTTOM = 0.075;
/**
 * The light-on-light strip on his right shoulder blade — r2's finding 2e, and
 * the one thing PHOTO 2's back carries that the game's did not. The photograph
 * puts it at x 730–756, y 224–268 reading **L 206 against the back beside it at
 * 180 — 1.14 ×, hard-edged**; `r2/rest/back.png` over the same region is one
 * tone at L 164.3, because the look had no torso panel group at all and no
 * paint above the ground anywhere on the jacket.
 *
 * It ships as a **value break and not a shape**, which is the verifier's own
 * ruling: what the strip *is* — a reflective panel, a print or a fold
 * highlight — is not settled at that resolution (r2's inference 5), so this
 * lifts the vertices instead of inventing a device. A lift is legal here where
 * it is not on the legs (`DESIGN.md` §7i); 1.13 × the suit's 0.716 linear is
 * 0.809 and clips nothing.
 *
 * The `x` window is chosen off the built mesh rather than from the photograph's
 * millimetres: at `density.torso` 30 the columns down his right back stand at
 * x −0.035, −0.074, −0.104, −0.128, so [−0.115, −0.060] is exactly the two
 * that make a shoulder blade, and the strip is flat between them instead of a
 * single lifted column smearing into both neighbours. Its `y` span sits
 * between rings for the same reason — four painted rows, gradients only at the
 * ends.
 */
const FLO_BACK_STRIP_BOTTOM = 0.335;
const FLO_BACK_STRIP_TOP = 0.455;
const FLO_BACK_STRIP_INBOARD = -0.060;
const FLO_BACK_STRIP_OUTBOARD = -0.115;
/**
 * The collar band: the top **two** rows, under the lid — r1's finding 2a, and
 * the round's second-worst defect at gameplay distance (6b). 0.496 put the dark
 * tint on jersey rings whose half-widths are 0.1589 and 0.1581, **93 % of the
 * jacket's widest ring**: a shoulder-wide yoke, not a collar, reading arm to
 * arm at 0.50 × the suit under the head where PHOTO 2's darkest value anywhere
 * between the helmet rim and the hip is 0.70 ×. 0.526 confines it to the rings
 * at 0.528 and 0.548 — half-widths 0.1258 and 0.0748, which is a neck.
 */
export const FLO_COLLAR_BASE = 0.526;
/** The mid-grey outer-thigh panel (PHOTO 1), and the shoulder cap's lower edge. */
export const FLO_THIGH_PANEL_TOP = -0.060;
export const FLO_THIGH_PANEL_BOTTOM = -0.250;
const FLO_SHOULDER_CAP_BOTTOM = -0.060;

// -- Profiles -----------------------------------------------------------------

/** The jacket needs closely spaced rows for the folded textile. Include
 * exact colour boundaries at the waistband and collar. */
export const FLO_JERSEY = loftProfile((() => {
  const heights = [-0.010, 0.018];
  for (let y = 0.050; y < 0.470 + 1e-6; y += 0.014) heights.push(Math.round(y * 1000) / 1000);
  heights.push(0.500, 0.528, 0.548);
  for (const boundary of [FLO_BAND_TOP, FLO_VEST_BOTTOM, FLO_VEST_TOP, FLO_COLLAR_BASE]) {
    heights.push(boundary - 0.002, boundary + 0.002);
  }
  // Deduplicated because a boundary is free to land on a ring the even
  // sampling already carries — the collar's does, since r1 moved it to 0.526 —
  // and two rings at one height are a zero-area band of quads, not an edge.
  return [...new Set(heights)].sort((a, b) => a - b).map((y) => floRingAt(FLO_JACKET, y));
})());

/** Rounded hip closure retains the shared joint and the existing 60 mm reach. */
export const FLO_HIP_DOME_APEX = 0.060;
const FLO_HIP_DOME: LoftRing[] = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [FLO_HIP_DOME_APEX, 0]]
  .map(([y, scale]) => ({
    y: y!, halfWidth: 0.094 * scale!, halfDepth: 0.090 * scale!, square: 2.5,
  }));

/** Roomy technical trousers gather above the brace instead of forming two
 * uniform pipes. Paint boundaries remain explicit rings; the hip join stays
 * plain suit silver so articulation cannot expose a differently coloured cap. */
export const FLO_THIGH = floWithRingsAt(loftProfile([
  { y: 0, halfWidth: 0.094, halfDepth: 0.090, square: 2.5 },
  { y: -0.040, halfWidth: 0.104, halfDepth: 0.097, square: 2.6 },
  { y: -0.080, halfWidth: 0.108, halfDepth: 0.099, square: 2.65 },
  { y: -0.120, halfWidth: 0.106, halfDepth: 0.095, square: 2.6 },
  { y: -0.160, halfWidth: 0.101, halfDepth: 0.090, square: 2.5 },
  { y: -0.200, halfWidth: 0.094, halfDepth: 0.084, square: 2.45 },
  { y: -0.240, halfWidth: 0.084, halfDepth: 0.077, square: 2.4 },
  { y: -0.270, halfWidth: 0.075, halfDepth: 0.071, square: 2.4 },
  { y: -0.300, halfWidth: 0.067, halfDepth: 0.064, square: 2.4 },
  { y: -0.320, halfWidth: 0.064, halfDepth: 0.061, square: 2.4 },
  { y: -0.340, halfWidth: 0.062, halfDepth: 0.059, square: 2.4 },
  { y: -0.360, halfWidth: 0.061, halfDepth: 0.058, square: 2.4 },
  { y: -0.380, halfWidth: 0.060, halfDepth: 0.057, square: 2.4 },
  { y: -0.400, halfWidth: 0.060, halfDepth: 0.056, square: 2.4 },
  { y: -0.4165, halfWidth: 0.0516, halfDepth: 0.0482, square: 2.4 },
  { y: -0.428, halfWidth: 0.0324, halfDepth: 0.0302, square: 2.4 },
  { y: -0.433, halfWidth: 0, halfDepth: 0 },
  ...FLO_HIP_DOME,
].sort((a, b) => a.y - b.y)), [FLO_THIGH_PANEL_TOP + 0.002, FLO_THIGH_PANEL_TOP - 0.002,
  FLO_THIGH_PANEL_BOTTOM + 0.002, FLO_THIGH_PANEL_BOTTOM - 0.002,
  -B.thighLength * FLO_GUARD_TOP + 0.002, -B.thighLength * FLO_GUARD_TOP - 0.002]);

/** A rounded trouser seat meets the roomy upper legs. The old broad, flat
 * lower cap produced a white pelvic plate below the jersey from every angle. */
export const FLO_SEAT = loftProfile([
  { y: -0.172, halfWidth: 0, halfDepth: 0 },
  { y: -0.153, halfWidth: 0.035, halfDepth: 0.028, square: 2.3 },
  { y: -0.128, halfWidth: 0.070, halfDepth: 0.049, square: 2.6 },
  { y: -0.092, halfWidth: 0.115, halfDepth: 0.071, square: 2.8 },
  { y: -0.050, halfWidth: 0.145, halfDepth: 0.087, square: 2.8 },
  { y: -0.015, halfWidth: 0.166, halfDepth: 0.100, square: 2.8 },
  { y: 0.030, halfWidth: 0.158, halfDepth: 0.106, square: 2.6 },
]);

/** A calf behind the segmented brace, tapering to the low trainer. */
export const FLO_SHIN = floLimbAtHeights(
  B.shinLength, [0.063, 0.059, 0.044],
  [0, FLO_CUP_BOTTOM + 0.002, FLO_CUP_BOTTOM - 0.002,
    -0.050, -0.080, -0.110, -0.140, -0.170, -0.200, -0.224, -0.250, -0.280,
    -B.shinLength * FLO_BOOT_TOP + 0.002, -B.shinLength * FLO_BOOT_TOP - 0.002,
    -B.shinLength * FLO_BOOT_TOP - 0.014, -0.345, -0.380],
  { flatten: 0.94, square: 2.4 },
);

/**
 * The sleeve: `WIM_UPPER_ARM` (`riderLook.ts:6089`) — smooth, no padding seams,
 * with a **dome over the shoulder joint** rather than the flat capped disc
 * every other arm on the roster leaves under its shoulder panels. He wears no
 * shoulder panel either, and the gauntlet saw that disc on the last rider who
 * did not: *"a flap juts past the arm silhouette with a knife edge"*. The dome
 * is the deltoid, and it carries the mid-grey shoulder cap.
 */
export const FLO_UPPER_ARM = floWithRingsAt(loftProfile([
  { y: 0.034, halfWidth: 0, halfDepth: 0 },
  { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
  { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
  ...limbProfile(B.upperArmLength, [0.061, 0.055, 0.046], [], {
    flatten: 0.95,
    square: 2.3,
  }).slice().reverse(),
]), [FLO_SHOULDER_CAP_BOTTOM + 0.002, FLO_SHOULDER_CAP_BOTTOM - 0.002, -.030, -.044, -.058, -.069, -.080, -.096, -.108, -.122, -.134, -.146, -.158, -.170, -.182, -.194, -.206, -.218, -.232, -.248]);

/** `WIM_FOREARM`, copied from `riderLook.ts:6098`. */
export const FLO_FOREARM = floWithRingsAt(limbProfile(B.forearmLength, [0.050, 0.046, 0.035], [], {
  flatten: 0.94,
  square: 2.3,
}), [-.014, -.028, -.040, -.052, -.064, -.076, -.088, -.100, -.112, -.124, -.140, -.156, -.172, -.194, -.218, -.220, -.237, -.239]);

/** Smooth domed road helmet: broad cheeks and a short chin under a deep
 * wrap shield. The lower shell remains closed; no face is exposed. */
export const FLO_HELMET = loftProfile([
  { y: 0.058, halfWidth: 0.091, halfDepth: 0.077, square: 2.25, z: 0.012 },
  { y: 0.082, halfWidth: 0.102, halfDepth: 0.108, square: 2.35, z: 0.019 },
  { y: 0.112, halfWidth: 0.115, halfDepth: 0.126, square: 2.45, z: 0.019 },
  { y: 0.150, halfWidth: 0.124, halfDepth: 0.135, square: 2.45, z: 0.009 },
  { y: 0.196, halfWidth: 0.128, halfDepth: 0.138, square: 2.35, z: 0.003 },
  { y: 0.236, halfWidth: 0.125, halfDepth: 0.132, square: 2.25, z: -0.002 },
  { y: 0.274, halfWidth: 0.114, halfDepth: 0.120, square: 2.15, z: -0.003 },
  { y: 0.304, halfWidth: 0.096, halfDepth: 0.101, square: 2.1, z: -0.003 },
  { y: 0.326, halfWidth: 0.074, halfDepth: 0.078, square: 2.05, z: -0.003 },
  { y: 0.342, halfWidth: 0.045, halfDepth: 0.048, square: 2.0, z: -0.003 },
  { y: 0.354, halfWidth: 0, halfDepth: 0, z: -0.003 },
]);

/** A short cuff, a full palm and a rounded mitten end; thumb merged below. */
export const FLO_GLOVE = loftProfile([
  { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
  { y: -0.016, halfWidth: 0.042, halfDepth: 0.036, square: 2.8 },
  { y: -0.028, halfWidth: 0.034, halfDepth: 0.027, square: 2.8 },
  { y: -0.036, halfWidth: 0.032, halfDepth: 0.025, square: 2.8 },
  { y: -0.046, halfWidth: 0.040, halfDepth: 0.028, square: 2.9 },
  { y: -0.058, halfWidth: 0.045, halfDepth: 0.029, square: 3.0 },
  { y: -0.072, halfWidth: 0.046, halfDepth: 0.030, square: 3.0 },
  { y: -0.098, halfWidth: 0.044, halfDepth: 0.030, square: 3.0, z: 0.004 },
  { y: -0.120, halfWidth: 0.039, halfDepth: 0.027, square: 2.8, z: 0.009 },
  { y: -0.135, halfWidth: 0.027, halfDepth: 0.020, square: 2.5, z: 0.012 },
  { y: -0.143, halfWidth: 0, halfDepth: 0, z: 0.013 },
]);

/** Mirrored inboard thumb, buried at the palm and rounded at its free end. */
const floThumb = (side: number): THREE.BufferGeometry => loftGeometry(loftProfile([
  { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
  { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
  { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
  { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
  { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });

// -- Materials ----------------------------------------------------------------

/**
 * The suit: silver satin with a broad moving sun highlight. The owner
 * rejected the original matte finish; fold shading below supplies the cool
 * valleys visible between the photographs' bright fabric ridges. Body and
 * limbs point at this **one spec object**, so the jacket, the sleeves, the
 * trousers and the seat are one material and one hue no shade can separate.
 */
const FLO_SUIT: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoSilver,
  roughness: 0.38,
  metalness: 0,
});

/**
 * The guards: moulded plastic, a stop above knit under the same sun and a
 * little glossier, which is what keeps the biggest volume on his legs from
 * reading as more trouser.
 */
const FLO_GUARD: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoGuard,
  roughness: 0.55,
  metalness: 0,
});

/** Warm pewter/bronze coating with a soft sun lobe; the local reflected sky
 * supplies broad form in ordinary tiers and yields to Ultra's real PMREM. */
const FLO_LID: RiderMaterialSpec = Object.freeze({
  colour: 0xa99b88,
  roughness: 0.30,
  metalness: 0.48,
  configure: configureFloPewter,
});

/** Neutral smoked silver, fully opaque. Reflections move with the view and
 * curved shield rather than being a painted blue stripe or emissive hole. */
const FLO_LENS: RiderMaterialSpec = Object.freeze({
  colour: 0x7b7e78,
  roughness: 0.19,
  metalness: 0.78,
  configure: configureFloSmoke,
});

/** Gloves, the collar, the elbow patches and the sole: the value floor, not black. */
const FLO_GEAR: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoGear,
  roughness: 0.62,
  metalness: 0,
});

// -- Shades and tints ---------------------------------------------------------

/**
 * The seat's shade is an **address**, not a colour, exactly as
 * `paintWimTorso` uses it: the seat loft is merged into the torso mesh
 * carrying this value on every channel, and `paintFloTorso` finds it and
 * repaints it to the trouser's own silver. Without that the seat would be a
 * darker ring under the hem — a hem line where the photographs have none.
 */
export const FLO_SEAT_SHADE = 0.86;

/**
 * The guard shells, lifted **above** the suit. A vertex tint may lift where a
 * texel may not (`DESIGN.md` §7i), and the lift is measured rather than
 * chosen: the accent white over the suit is 1.13 in linear, PHOTO 2 puts the
 * shell over the trouser at 0.577 / 0.453 = **1.27**, and 1.12 closes the gap
 * exactly (1.13 × 1.12 = 1.24). Three gauntlet rounds on the last rider read a
 * guard at the ground's own value as grey.
 */
export const FLO_GUARD_SHADE = 1.12;

/** Charcoal upper brace, knee cup, webbing and mechanical hardware share one
 * shade. The limb underneath the hinge targets this exact value so a bent knee
 * cannot reveal a differently coloured strip between its two rigid halves. */
export const FLO_CUP_SHADE = 0.30;

/**
 * The sole, and the trainer's rand. Reached **up** from the gear black, because
 * `render/rider.ts:791` draws every boot in the gear material whoever is
 * wearing it: his footwear is a low light trainer, so the upper is painted up
 * to the suit's silver and the sole is left as this dark stop under it.
 *
 * **1.45 and not r1's 2.30** — finding 4d. PHOTO 2 measures the sole at 0.100
 * against the upper's 0.681, which is 0.15 in linear and ≈ 0.40 in sRGB; 2.30
 * put the rand at rgb 138,143,156, **0.63 of the upper**, and the captures show
 * both shoes as one off-white volume with the pedal as the only dark slab.
 * 1.45 lands the sole at 0.40 of the upper. The number is also the `shades.sole`
 * address `paintFloBoot` skips, so the slab and the rand move together and
 * cannot drift apart.
 */
export const FLO_SOLE_SHADE = 1.45;

/** Silver, unpainted — the ground itself. */
const FLO_SILVER: Tint = [1, 1, 1];
/** Silver → the mid-grey panel: the chest vest, the shoulder cap, the outer thigh. */
const FLO_PANEL_TINT = tintOver(C.floWithZoSilver, C.floWithZoPanel);
/**
 * Silver → the collar. **The panel grey, not the gear black** (r1, finding 2a):
 * the charcoal measured 0.22–0.30 × the chest below it and PHOTO 2's own
 * darkest shoulder value is 0.70 ×, so even confined to the neck rings the gear
 * black was a hole under the lid rather than a collar. It is still the vest's
 * grey — one grey on him, reached from one ground — and the two rings it lands
 * on are 0.1258 and 0.0748 half-width, which no reading can mistake for a yoke.
 *
 * **One stop down since r2 raised the panel tier**, and the scalar is what
 * keeps that raise from deleting the collar: at r1's panel the collar rendered
 * 0.64 × the suit, against PHOTO 2's 0.70 floor; `floWithZoPanel` moving 0.368
 * → 0.580 of the ground would have carried it to ≈ 0.94, which is not a collar
 * at all. 0.76 of the panel restores 0.44 of the ground and lands it back at
 * ≈ 0.75 × the suit — the same hue as the vest, one value below it, which is
 * also what a rolled collar of the same cloth does under the same sun.
 */
const FLO_COLLAR_SHADE = 0.76;
const FLO_COLLAR_TINT = tintOver(C.floWithZoSilver, C.floWithZoPanel, FLO_COLLAR_SHADE);
/**
 * Silver → the shin's soft sleeve — **0.70 and not the cup's 0.10** (r1,
 * finding 6c, a blocker-adjacent major on the chase camera). The plates only
 * span 155° of the shin, front-and-outboard, and the chase camera looks at the
 * other 205°: painting everything above the boot collar to the cup's value put
 * the near shin at 0.33–0.48 × the suit where PHOTO 2 — a rear view — gives
 * 0.64–0.83 ×, and the standing silhouette broke into three bands. The cup's
 * own rows and the strap bands keep the black; the calf between and behind the
 * plates is a light shell, which is what the photograph shows.
 */
const FLO_SLEEVE_TINT: Tint = [0.70, 0.70, 0.70];
/** Pale fabric detail over the rider's right shoulder blade. */
const FLO_BACK_STRIP_TINT: Tint = [1.13, 1.13, 1.13];
/** Silver → the band's two hues. Cyan is his right, gold his left (PHOTO 2). */
const FLO_CYAN_TINT = tintOver(C.floWithZoSilver, C.floWithZoCyan);
const FLO_GOLD_TINT = tintOver(C.floWithZoSilver, C.floWithZoGold);
/**
 * Silver → **the cup's own value**, and that is the point of reaching it this
 * way. A hinge opens on the side the camera sees, and what shows through it has
 * to be the cup rather than a colour that merely resembles it, so the limb's
 * tint targets the guard white times the cup's own shade — equal by
 * construction, not by two numbers kept in step (`floWithZo.test.ts` measures
 * it on both bones and both sides). It is the guard's soft black sleeve where
 * the brace closes on the joint — the thigh's last 106 mm and the shin's first
 * 30 mm — and no further: r1's finding 6c is that the *calf* is light in
 * PHOTO 2, and it wears `FLO_SLEEVE_TINT` instead.
 */
const FLO_CUP_TINT = tintOver(C.floWithZoSilver, C.floWithZoGuard, FLO_CUP_SHADE);
/** Gear black → the trainer's pale upper. */
const FLO_SHOE_TINT = tintOver(C.floWithZoGear, C.floWithZoSilver);
/** Gear black → the sole's value, so the rand and the sole slab agree. */
const FLO_RAND_TINT = tintOver(C.floWithZoGear, C.floWithZoGear, FLO_SOLE_SHADE);

// -- Paintwork ----------------------------------------------------------------

/**
 * The suit, in one pass over the merged torso: the seat, the collar, the hem
 * band and the vest.
 *
 * **The seat is read by its shade before any height rule runs**, and that
 * ordering is load-bearing: the seat's top ring stands at y 0.030, *above* the
 * jacket's hem at −0.010, so a band selected by height alone would paint the
 * hip as well as the hem and the two-tone band would climb the trousers.
 */
/**
 * The band's top edge at a given signed `x` — the sash (r1's finding 4c, r2's
 * 6b). **Asymmetric, and that is the whole of it**: the cyan half (his right,
 * negative `x`) runs at full height from hip to spine, and the gold half closes
 * by `FLO_BAND_TAPER` as it reaches the spine. Read as a rear view, PHOTO 2 is
 * one deep cyan wedge over his right hip and the back with a thinner gold one
 * closing under it from his left — a wedge 22° off horizontal, not a belt — and
 * a symmetric taper is what made the r2 capture level to within 4 px across the
 * whole band.
 */
function floBandTopAt(x: number): number {
  if (x < 0) return FLO_BAND_TOP;
  const reach = Math.min(1, x / FLO_BAND_HIP);
  return FLO_BAND_TOP - FLO_BAND_TAPER * (1 - reach);
}

/**
 * Broad, tapered cloth creases rather than random speckle. The cool valleys
 * give silver a value range; the material supplies view-dependent highlights.
 * Heights are local metres. Keep seam boundaries and rigid armour untouched.
 */
function floFabric(geometry: THREE.BufferGeometry, part: 'arm' | 'thigh'): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  const ridge = (distance: number, width: number): number => Math.exp(-((distance / width) ** 2));
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Cloth only. Guard liners, bindings and cyan/gold retain their values,
    // and the hip join remains exactly the seat's silver.
    const silver = Math.abs(colour.getX(i) - 1) < 1e-5
      && Math.abs(colour.getY(i) - 1) < 1e-5
      && Math.abs(colour.getZ(i) - 1) < 1e-5;
    const panel = FLO_PANEL_TINT.every((value, axis) =>
      Math.abs(colour.getComponent(i, axis) - value) < 1e-5);
    if (!silver && !panel) continue;
    let valley = 0;
    if (part === 'arm') {
      if (y > -0.025 || y < -0.225) continue;
      valley = 0.33 * ridge(y + 0.070 + x * 0.6 + z * 0.3, 0.017)
        + 0.27 * ridge(y + 0.135 - x * 0.7, 0.019)
        + 0.20 * ridge(y + 0.195 + z * 0.7, 0.016);
    } else {
      if (y > -0.080 || y < -0.260) continue;
      valley = 0.24 * ridge(y + 0.130 + x * 0.45, 0.018)
        + 0.28 * ridge(y + 0.218 - z * 0.5, 0.014)
        + 0.20 * ridge(y + 0.262 + x * 0.25, 0.011);
    }
    valley = Math.min(0.48, valley) * (panel ? 0.55 : 1);
    // Slightly blue-grey shadows against the warm pearl ground; no baked
    // white specular, which would remain fixed as the rider turns.
    colour.setXYZ(i, colour.getX(i) * (1 - valley),
      colour.getY(i) * (1 - valley * 0.94), colour.getZ(i) * (1 - valley * 0.82));
    // A shallow inward fold gives the sun a real change of surface normal.
    // At most 3.8 mm, entirely inside the existing clothing envelope.
    const radius = Math.hypot(x, z);
    if (radius > 0.01) {
      const inset = 0.008 * valley;
      position.setX(i, x * (1 - inset / radius));
      position.setZ(i, z * (1 - inset / radius));
    }
  }
  geometry.computeVertexNormals();
}

/** Compression rings bunch into the elbow and just above the glove cuff. */
function paintSleeveTailoring(geometry: THREE.BufferGeometry, side: number, forearm: boolean): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  const centre = forearm ? -.070 : -.179;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const wave = y - centre + side * x * .72 - z * .46;
    const compression = Math.exp(-((wave / .085) ** 2));
    // Compression gathers mostly on the inner elbow. Opposite sleeve
    // surfaces have different fold lengths and inclinations.
    const gather = .48 + .52 * THREE.MathUtils.smoothstep(z - side*x, -.05,.05);
    const wrinkle = Math.cos(wave * 144 + .62 * Math.sin(wave * 43 + z * 20));
    const fold = .0044 * compression * gather * wrinkle;
    const radius = Math.hypot(x,z);
    if (radius > .012) {
      position.setX(i, x + fold * x / radius);
      position.setZ(i, z + fold * z / radius);
    }
    const outside = THREE.MathUtils.smoothstep(side*x - .40*z, -.015,.022);
    // The taupe shoulder protector has a pale piped lower edge. The outer
    // elbow panel and the short glove cuff show through the gathered sleeve.
    let dye = 1;
    if (!forearm && y > -.080 && y < .028) {
      const pad = THREE.MathUtils.smoothstep(y, -.079,-.067);
      dye -= .44 * outside * pad;
    }
    if (forearm && y > -.120) dye -= .53 * outside * (1 - THREE.MathUtils.smoothstep(-y,.091,.120));
    if (forearm && y < -.219) dye *= y < -.238 ? .36 : .73;
    const shade = dye * (1 - .13 * compression * gather * (.5 - .5 * wrinkle));
    colour.setXYZ(i, colour.getX(i)*shade,colour.getY(i)*shade,colour.getZ(i)*(shade+.017*compression));
  }
  geometry.computeVertexNormals();
}

function paintFloForearm(geometry: THREE.BufferGeometry, side: number): void {
  floFabric(geometry, 'arm');
  paintSleeveTailoring(geometry, side, true);
}

function paintFloTorso(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(colour.getX(i) - FLO_SEAT_SHADE) < 1e-6) {
      colour.setXYZ(i, FLO_SILVER[0], FLO_SILVER[1], FLO_SILVER[2]);
      continue;
    }
    const y = position.getY(i);
    const x = position.getX(i);
    const z = position.getZ(i);
    let tint = FLO_SILVER;
    if (y >= FLO_COLLAR_BASE - 1e-6) {
      tint = FLO_COLLAR_TINT;
    } else if (
      y <= floBandTopAt(x) + 1e-6
      && Math.abs(x) > 1e-6
      && z < FLO_BAND_FRONT_STOP
      // **The gold stops short of his left hip** (r2, 4d): PHOTO 2 keeps a pale
      // hem between that hip's silhouette and the gold's tip, and the cyan
      // keeps none on the other side — the asymmetry the sash is made of.
      && !(x > FLO_GOLD_HIP_STOP * floRingAt(FLO_JACKET, y).halfWidth)
    ) {
      // The hem band, split at the spine. Rider-left is +X, so cyan on his
      // right is the negative half — PHOTO 2 read as a rear view, where
      // image-right is the rider's right (`docs/PLANS.md` §34.2; the research
      // map had the hands inverted, which is why this is a test and not a
      // comment).
      //
      // **A sash across the back and both hips, never the front** (r1, finding
      // 4c): the depth gate stops it just behind each hem ring's flank pole, so
      // the hip crest PHOTO 1 carries a teal tab on keeps its colour and the
      // waist front stays plain suit, and the taper closes the band's top edge
      // toward the spine.
      //
      // The hem loft's own cap pole sits at x exactly 0, on neither hip and
      // inside the seat where nothing can see it; it keeps the ground rather
      // than being handed to whichever side the comparison happens to favour,
      // so "which half is cyan" stays a question with one answer.
      tint = x < 0 ? FLO_CYAN_TINT : FLO_GOLD_TINT;
    } else if (
      z < 0
      && x <= FLO_BACK_STRIP_INBOARD
      && x >= FLO_BACK_STRIP_OUTBOARD
      && y >= FLO_BACK_STRIP_BOTTOM
      && y <= FLO_BACK_STRIP_TOP
    ) {
      // The light-on-light strip PHOTO 2 carries on his right shoulder blade
      // (r2, 2e) — a value, not a device.
      tint = FLO_BACK_STRIP_TINT;
    } else if (y > .048 && y < FLO_COLLAR_BASE) {
      // The graphite front is sewn into the jacket from hem to collar.
      // Pale inserts rise continuously at the sides and around the shoulders.
      const across = Math.abs(x);
      const edge = jacketPanelWidth(y);
      const front = THREE.MathUtils.smoothstep(z, -.018, .060);
      const contrast = (1 - THREE.MathUtils.smoothstep(across, edge - .006, edge + .006)) * front;
      const relief = jacketFold(x, y, z);
      const shadow = Math.max(0, -relief) * 27;
      const highlight = Math.max(0, relief) * 11;
      const value = .965 - .42 * contrast - shadow + highlight;
      tint = [value, value + .008, value + .015 + shadow * .32];
      const radius = Math.hypot(x, z);
      if (radius > .01) {
        position.setX(i, x + relief * x / radius);
        position.setZ(i, z + relief * z / radius);
      }
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
  geometry.computeVertexNormals();
}

/** The mid-grey shoulder cap: the dome and the top of the sleeve, outboard face. */
function paintFloUpperArm(geometry: THREE.BufferGeometry, side: number): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < FLO_SHOULDER_CAP_BOTTOM - 1e-6) continue;
    // The dome's apex ring is a pole at x = 0; it is the top of the shoulder
    // and belongs to the cap, so the test is "not inboard" rather than
    // "outboard".
    if (side * position.getX(i) < -1e-6) continue;
    colour.setXYZ(i, FLO_PANEL_TINT[0], FLO_PANEL_TINT[1], FLO_PANEL_TINT[2]);
  }
  floFabric(geometry, 'arm');
  paintSleeveTailoring(geometry, side, false);
}

/**
 * The thigh: silver trouser, the mid-grey outer panel, and the guard's dark
 * sleeve over the last 106 mm.
 *
 * The sleeve is painted **all the way round** rather than under the shell's arc
 * only, which is where this parts company with Wheel in Motion's leg. His
 * guard is a printed shell on the same pale material as the trouser, so the
 * limb behind it had to stay trouser-coloured; the guard here is its own white
 * material standing 15–32 mm proud, and PHOTO 2 shows a black soft sleeve
 * behind and between the plates. A silver crescent behind the knee would be
 * the only place on him the photographs do not have one.
 */
function paintFloThigh(geometry: THREE.BufferGeometry, side: number): void {
  const guardTop = -B.thighLength * FLO_GUARD_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const tint = position.getY(i) <= guardTop + 1e-6 ? FLO_CUP_TINT : FLO_SILVER;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
  floFabric(geometry, 'thigh');
  // The photo's technical side seam is a narrow sewn line, not a large grey
  // rectangle that turns the plain central seat into a white underwear cap.
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i), x = position.getX(i), z = position.getZ(i);
    if (y > -0.080 || y < -0.270 || side * x < 0.035) continue;
    const line = 0.025 + 0.018 * Math.sin((-y - 0.08) / 0.19 * Math.PI);
    const seam = Math.exp(-(((z - line) / 0.008) ** 2));
    const shade = 1 - 0.18 * seam;
    colour.setXYZ(i, colour.getX(i) * shade, colour.getY(i) * shade, colour.getZ(i) * shade);
  }
}

/**
 * The shin: the cup's black across the hinge, then the guard's light shell down
 * to the trainer's collar, then the shoe.
 *
 * **Three values and not two** — r1's finding 6c. The first cut painted
 * everything above the collar to the cup's own value, which is right under the
 * cup and wrong everywhere else: the white plates span 155° of the shin and the
 * chase camera looks at the other 205°, so the calf read at a third of the
 * suit's value and the standing silhouette broke into bands. PHOTO 2 is that
 * exact rear view and shows a light shell wrapping the calf with two dark
 * straps over it. The straps are patches, so the limb only has to stop being
 * black.
 */
function paintFloShin(geometry: THREE.BufferGeometry, side: number): void {
  void side;
  const cuff = -B.shinLength * FLO_BOOT_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    let tint = FLO_SLEEVE_TINT;
    if (y < cuff) tint = FLO_SILVER;
    else if (y >= FLO_CUP_BOTTOM) tint = FLO_CUP_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The trainer: a pale upper painted up out of the gear black, with the sole
 * slab left at its own shade and a rand and toe cap joining it. The sole is
 * found by its shade rather than by height because the upper and the slab
 * overlap in y once the loft has been stood up on the pedal.
 */
function paintFloBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(colour.getX(i) - FLO_SOLE_SHADE) < 1e-6) continue;
    const t = (position.getY(i) - box.min.y) / height;
    // The rand reaches a third of the way up the last, not a quarter: the
    // pedal covers the bottom 24 % of the boot, so r1's line lived entirely
    // under it and both shoes read as one off-white volume (finding 4d).
    //
    // **And 0.42 with a heel counter, not 0.32 — r2's finding 4b**, which is
    // the same defect measured a second time: the sole *is* authored, and in
    // every r2 view (`fast/legs.png`, `rest/legs.png`) the shoe is still one
    // unbroken off-white form meeting the pedal plate with no darker slab under
    // it, because the plate covers everything below it at every angle the
    // capture tool takes. PHOTO 2's shoe is upper L 134 / sole L 86 — 0.64 in
    // sRGB. A deeper rand and a dark counter round the heel put that break
    // above the plate from any camera, which is where it has to be to exist.
    const toe = t < 0.45 && position.getZ(i) > 0.085;
    const heel = t < 0.55 && position.getZ(i) < -0.060;
    const tint = t < 0.42 || toe || heel ? FLO_RAND_TINT : FLO_SHOE_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

// -- Panels -------------------------------------------------------------------

const patch = (spec: RiderPatch): RiderPatch => Object.freeze(spec);
const group = (role: RiderMaterialRole, patches: readonly RiderPatch[]): RiderPanelGroup => Object.freeze({
  role,
  casts: false,
  patches: Object.freeze(patches),
});

/** The shells remain front/outboard of each leg; the straps continue around
 * the calf so they read as webbing holding armour rather than floating tabs. */
const FLO_SHELL_U0 = -1.95;
const FLO_SHELL_U1 = 0.90;
const FLO_PLATE_U0 = -2.00;
const FLO_PLATE_U1 = 0.70;

/** The charcoal upper brace and knee cup follow the thigh bone. */
const FLO_THIGH_PAD: RiderPanelGroup = group('accent', [
  patch({ anchor: 'front', u0: FLO_SHELL_U0, u1: FLO_SHELL_U1, mirrored: true,
    from: -0.400, to: -0.300, uSegments: 12, vSegments: 6,
    lift: 0.015, taper: 0.26, shade: FLO_CUP_SHADE }),
  patch({ anchor: 'front', u0: FLO_SHELL_U0, u1: FLO_SHELL_U1, mirrored: true,
    from: -0.428, to: FLO_CUP_TOP, uSegments: 12, vSegments: 4,
    lift: 0.028, taper: 0.30, shade: FLO_CUP_SHADE }),
  patch({ anchor: 'front', u0: 0, u1: Math.PI * 2,
    from: -0.330, to: -0.300, uSegments: 24, vSegments: 2,
    lift: 0.020, shade: FLO_CUP_SHADE }),
  patch({ anchor: 'outboard', u0: -0.12, u1: 0.12,
    from: -0.400, to: -0.296, uSegments: 3, vSegments: 6,
    lift: 0.026, taper: 0.10, shade: FLO_CUP_SHADE }),
  // Small pale side hardware remains distinct from the dark knee cup.
  patch({ anchor: 'outboard', u0: -0.30, u1: 0.30,
    from: -0.386, to: -0.328, uSegments: 6, vSegments: 4,
    lift: 0.031, taper: 0.50, shade: FLO_GUARD_SHADE }),
]);

/** Three moulded shin segments, a dark hinge lip and genuine wrap straps.
 * Above-knee and below-knee parts remain on their own mechanical bones. */
const FLO_KNEE_PAD: RiderPanelGroup = group('accent', [
  patch({ anchor: 'front', u0: FLO_SHELL_U0, u1: FLO_SHELL_U1, mirrored: true,
    from: FLO_CUP_BOTTOM, to: 0, uSegments: 12, vSegments: 2,
    lift: 0.032, taper: 0.28, shade: FLO_CUP_SHADE }),
  ...[[-0.152, FLO_CUP_BOTTOM], [-0.246, -0.164], [-0.310, -0.260]].map(([from, to]) => patch({
    anchor: 'front', u0: FLO_PLATE_U0, u1: FLO_PLATE_U1, mirrored: true,
    from: from!, to: to!, uSegments: 12, vSegments: 6,
    lift: 0.018, taper: 0.20, shade: FLO_GUARD_SHADE,
  })),
  ...[[-0.176, -0.148], [-0.266, -0.236], [-0.318, -0.290]].map(([from, to]) => patch({
    anchor: 'front', u0: 0, u1: Math.PI * 2,
    from: from!, to: to!, uSegments: 24, vSegments: 2,
    lift: 0.025, shade: FLO_CUP_SHADE,
  })),
  ...[-0.104, -0.148].map((from) => patch({
    anchor: 'outboard', u0: -0.19, u1: 0.19, from, to: from + 0.023,
    uSegments: 5, vSegments: 2, lift: 0.028, taper: 0.70, shade: FLO_CUP_SHADE,
  })),
]);

/**
 * The elbow: one patch on the back of each forearm, where the chain bends and
 * where a rider lands.
 *
 * **In the `body` material at 0.65, not the gear black — r2's findings 2f and
 * 6d, one fix for two critics.** It was `gear` on the argument that a pad is
 * armour, and in the captures it measured **L 40 against a sleeve of 124 —
 * 0.32 ×, the darkest thing on him above the waist after the visor** — and it
 * survived a 1/3 downscale, so the silhouette critic found it out-shouting the
 * waist accent at gameplay distance. Neither photograph carries a dark elbow at
 * all: PHOTO 1's extended arm recedes smoothly (upper arm 144, elbow 129,
 * forearm 112 — elbow ÷ upper arm **0.90**) and PHOTO 2's elbow region is
 * **0.67** of the back. 0.65 of the suit sits just under that pair, so the pad
 * is a shaded panel on the sleeve rather than a block on it. The `body`
 * material is already drawn on this rig, so the move costs no draw call.
 */
const FLO_ELBOW_PAD: RiderPanelGroup = group('body', [
  patch({
    anchor: 'back' as PatchAnchor,
    u0: -0.70,
    u1: 0.70,
    from: -0.100,
    to: -0.012,
    uSegments: 5,
    vSegments: 2,
    lift: 0.006,
    taper: 0.30,
    shade: 0.65,
  }),
]);

/** Narrow dark base roll and compact mechanical pivots. */
const FLO_BOSS_CENTRE = 1.30;
const FLO_HEAD_PANELS: readonly RiderPatch[] = Object.freeze([
  patch({ anchor: 'front', u0: 0, u1: Math.PI * 2, from: 0.058, to: 0.066,
    uSegments: 32, vSegments: 1, lift: 0.002, shade: 0.42 }),
  ...[-1, 1].map((side) => patch({
    anchor: 'front', u0: side * FLO_BOSS_CENTRE - 0.13,
    u1: side * FLO_BOSS_CENTRE + 0.13, from: 0.188, to: 0.213,
    uSegments: 6, vSegments: 3, lift: 0.008, taper: 0.65, shade: 1.02,
  })),
  ...[-1, 1].map((side) => patch({
    anchor: 'front', u0: side * FLO_BOSS_CENTRE - 0.055,
    u1: side * FLO_BOSS_CENTRE + 0.055, from: 0.196, to: 0.206,
    uSegments: 4, vSegments: 2, lift: 0.012, taper: 0.70, shade: 0.52,
  })),
]);

const FLO_FACE: RiderPanelGroup = Object.freeze({
  role: 'face', casts: false, patches: Object.freeze([]),
  buildSingle: () => floWrapShield(FLO_HELMET),
});

// -- The look -----------------------------------------------------------------

export const FLO_WITH_ZO_LOOK: RiderLook = Object.freeze({
  id: 'flo-with-zo',
  // Enough columns for the curved jacket panels and gathered sleeves.
  density: Object.freeze({ limb: 26, torso: 48, head: 32, hand: 18 }),
  materials: Object.freeze({
    body: FLO_SUIT,
    limbs: FLO_SUIT,
    accent: FLO_GUARD,
    head: FLO_LID,
    face: FLO_LENS,
    gear: FLO_GEAR,
  }),
  profiles: Object.freeze({
    torso: FLO_JERSEY,
    seat: FLO_SEAT,
    thigh: FLO_THIGH,
    shin: FLO_SHIN,
    upperArm: FLO_UPPER_ARM,
    forearm: FLO_FOREARM,
    neck: FLO_NECK,
    head: FLO_HELMET,
    boot: FLO_BOOT,
    bootSole: FLO_BOOT_SOLE,
    hand: FLO_GLOVE,
  }),
  // `seat` is an address the body painter reads, not a value that ships;
  // `legs` at 1 because the legs' base is the suit itself and every colour on
  // them is paint; `sole` above 1 because the boot mesh is always the gear
  // material and his footwear is pale.
  shades: Object.freeze({ seat: FLO_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: FLO_SOLE_SHADE, neck: 0.42 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    neck: 'gear' as RiderMaterialRole,
    // Read nowhere by the rig (the group's own `role` paints it), stated for
    // the reader: his brace is the accent white.
    kneePad: 'accent' as RiderMaterialRole,
    legs: 'limbs' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // **No collar patch**, no shoulder group and no waist
    // group. PHOTO 2's back is unbroken light silver: no harness, no straps,
    // no yoke band and no lettering — every one of those is an invention of
    // the AI turnaround (§34.2). The collar is a painted band on the jersey's
    // top rows, never a lifted ring, because a band on a loft's top ring is a
    // collar in the sense the owner rejected on the last rider — a dog
    // harness round the neck.
    // Jacket zipper, welt seams and two slim pocket openings.
    torso: Object.freeze({ role: 'body', casts: false, patches: [], buildSingle: () => raceJacketClosures(FLO_JERSEY) }),
    elbowPad: FLO_ELBOW_PAD,
    thighPad: Object.freeze({ ...FLO_THIGH_PAD, ghostSilhouette: true }),
    kneePad: Object.freeze({ ...FLO_KNEE_PAD, ghostSilhouette: true }),
    head: FLO_HEAD_PANELS,
    face: FLO_FACE,
  }),
  // The domed shell and opaque curved shield stay two meshes; the shield
  // carries no live shadow and all pivot hardware merges into the shell.
  extras: Object.freeze([]),
  build: Object.freeze({ hand: Object.freeze([floThumb]) }),
  paint: Object.freeze({
    torso: paintFloTorso,
    upperArm: paintFloUpperArm,
    forearm: paintFloForearm,
    thigh: paintFloThigh,
    shin: paintFloShin,
    boot: paintFloBoot,
  }),
  // Bent forearms bring the gloves forward into his racing carriage. The
  // common rig still supplies the lean, carve, one-foot and rest reactions.
  armCarriage: Object.freeze({ splay: .008, rise: .050, forward: .086 }),
});
