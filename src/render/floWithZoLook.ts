/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.ts';
import {
  limbProfile,
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
// M34 Phase 1 (`docs/PLANS.md` §34.4). The eighth playable look, the fifth real
// person, and the **first pale one**: a light silver race suit under a mid
// pewter full-face lid, big white knee and shin armour, a two-tone band across
// the hem, black gloves and low light trainers. `references/FloWithZo/` holds
// the two racing photographs he supplied and an AI turnaround; the photographs
// are the authority and the turnaround only says how a real thing becomes
// low-poly (§34.2 rules on each of its inventions — the pearl helmet, the back
// lettering, the chest harness and the both-hips cyan band are all rejected).
//
// **Three decisions shape this file** (§34.3 fact 9, §34.4):
//
//   - **No sheet, and no print anywhere on him.** Every accent he wears — the
//     vest's mid-grey, the charcoal gear, the cyan and the gold at the hem — is
//     darker than a silver ground in *every* channel, and a vertex colour is a
//     multiplier, so all of it is reached by painting **down** from
//     `floWithZoSilver`. Two things stand above the suit and no more: the guard
//     white, which is patches in the `accent` role with a material of their
//     own, and the single light-on-light strip on his right shoulder blade that
//     PHOTO 2 measures at 1.14 × the back beside it (r2's finding 2e) — a lift
//     of 1.13 on the body's own vertices, which is legal where a texel's would
//     not be and which clips nothing. He is the first real person on the roster
//     with no atlas, no page and no decoder.
//   - **The value drop from suit to lid is the silhouette.** PHOTO 2 measures
//     the helmet at 0.294 against the jacket's 0.597 — about half. That is the
//     configuration Cool Rider's first lid failed at (a dark void on a lighter
//     body, `src/data/tuning.ts:3750-3760`) except that there the helmet was
//     near-black; here it is a glossy pewter at 0.53 × the suit, which is
//     inside the safe window and is checked on a capture of the crown from
//     behind rather than on a swatch. **The value was right in r1 and the
//     temperature was not** — the shell was authored warm and two blind critics
//     scored the head as a bare tan dome at gameplay distance, so r2 moved the
//     hue to a near-neutral and left the luminance where it was (`tuning.ts`,
//     `floWithZoBronze`).
//   - **The guards are the bulkiest thing on him** (the brief §9: *"Do not
//     reduce these guards to small knee pads"*). Adonisb2's anatomy, Wheel in
//     Motion's spans, run from 106 mm above the knee to 68 mm above the ankle —
//     1.10 × the shin — as a light kneecap plus two stacked shin plates with
//     dark strap bands between them, over a limb painted to the cup's own value
//     where the guard closes on the joint and to a light sleeve down the calf
//     (r1's findings 3a and 6c: the cap is the lightest piece on the leg in the
//     photograph, and the calf behind the plates is light, not black).
//
// **A sibling module, on `coolRiderLook.ts`'s pattern**, because a value import
// from `riderLook.ts` would be a load-order cycle: everything below is typed by
// `riderLook.ts` and imports nothing from it. The shared tables this look
// starts from (`JACKET`, `NECK`, `BOOT`, `BOOT_SOLE`, `ringOf`,
// `limbAtHeights`, and Wheel in Motion's jersey, seat, hip dome, limbs, helmet
// and glove) are **copied** under `FLO_*` names, each with the line it came
// from, so a later edit to his rings cannot move anybody else's.
//
// Parity: at or under Cool Rider's meshes and calls (`redRider.test.ts`), with
// no casting panel group at all — no pack, no straps, no shoulder or torso
// group. What would have paid for those is spent on the guards instead.

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
  { y: 0.155, halfWidth: 0.86 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.87 * FLO_TORSO_HALF_DEPTH, square: 2.5 },
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
 * `FLO_VEST_SEAM` on the other face.
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
/**
 * The mid-grey vest's top edge, and it is **the one number two gauntlet rounds
 * pulled in opposite directions**. r1's finding 2b asked it up to the
 * collarbone and it shipped 0.360 → 0.470; r2's finding 2a asked it back down
 * to the sternum, *"so the top third of the front torso stays light suit"*.
 * The r2 verifier ruled the round contradictory on this line (its §B.1) and
 * resolved it rather than discarding either round, and the resolution is what
 * ships here.
 *
 * r1's actual defect was **a light band with dark above it** — the gear-black
 * collar yoke sat at `FLO_COLLAR_BASE` 0.496 on rings 93 % of the jacket's
 * widest, so the silver between it and the panel read as a stripe rather than
 * as chest. r2 removed the yoke separately (the collar moved to 0.526 and was
 * tinted the panel grey, not the gear black), and with the yoke gone lowering
 * the vest cannot recreate that defect. At 0.470 the light band was **16 % of
 * the visible torso** against PHOTO 1's 27–33 %; **0.410** — a height
 * `FLO_JERSEY` already carries — gives 24–33 % by column and satisfies both
 * rounds.
 */
export const FLO_VEST_TOP = 0.410;
export const FLO_VEST_BOTTOM = 0.075;
/**
 * How far forward the vest's side seam sits. A panel that stopped at the
 * jacket's widest point would put its edge exactly on the silhouette, where a
 * seam has no shape to read against.
 *
 * **55 mm and not 30** — the sharper half of r2's finding 2a, and it was exact:
 * at `r2/rest/front.png` y 380–400 the row read L 42 unbroken from x 626 to
 * x 794, **no silver flank at all**. 30 mm of depth on rings 118–136 mm deep
 * leaves a sliver worth 0.5–1.5 % of the half-width in a front view — inside
 * the antialiasing. 55 mm leaves 2.8–6.3 % depending on the ring's own
 * `square`, which is a flank the eye can find; the plate still wraps 147° of
 * the chest.
 */
const FLO_VEST_SEAM = 0.055;
/**
 * The plate's binding — r2's finding 2d, and it needs no geometry because
 * `FLO_JERSEY` already carries a ring pair at each of the vest's edges. PHOTO
 * 1's panel edge measures L 110 against the panel core's 83 and the suit's 125:
 * a **1.33 ×** step out of the panel, not a hard cut to suit-white. 0.75 of the
 * silver is 1.30 × the panel tint, and painting *both* rings of each pair makes
 * it a flat 4 mm edging rather than a gradient into the panel.
 */
const FLO_VEST_BINDING_ROW = 0.0021;
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

/**
 * The jersey: `WIM_JERSEY`'s even 30 mm sampling of `FLO_JACKET`
 * (`riderLook.ts:5951`) **plus a ring pair at ±0.002 around every paint
 * boundary** — the band's top, the vest's bottom and top, and the collar's
 * base. Nothing is printed on him, so the even rings are not for a page's rows;
 * they are what keeps a seam pair droppable anywhere without collapsing the
 * interval beside it, and the pairs themselves are the only way a painted band
 * gets an edge instead of a smear across whatever ring gap it lands in
 * (`RiderLook.paint`).
 */
export const FLO_JERSEY = loftProfile((() => {
  const heights = [-0.010, 0.018];
  for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030) heights.push(Math.round(y * 1000) / 1000);
  heights.push(0.500, 0.528, 0.548);
  for (const boundary of [FLO_BAND_TOP, FLO_VEST_BOTTOM, FLO_VEST_TOP, FLO_COLLAR_BASE]) {
    heights.push(boundary - 0.002, boundary + 0.002);
  }
  // Deduplicated because a boundary is free to land on a ring the even
  // sampling already carries — the collar's does, since r1 moved it to 0.526 —
  // and two rings at one height are a zero-area band of quads, not an edge.
  return [...new Set(heights)].sort((a, b) => a - b).map((y) => floRingAt(FLO_JACKET, y));
})());

/**
 * The hip dome over the thigh's top — `WIM_HIP_DOME` (`riderLook.ts:6013`),
 * 60 mm of rounded close, and it is here **from day one** rather than after a
 * report. The rig drops the inside hip 85 mm under the pelvis in a carve and
 * the outside hip 150 mm in a technical corner and counter-rolls the hem up on
 * top of that, so a thigh ending in a flat cap ends in a flat cap *below the
 * hem* with the seat's underside over it. Black hides it; the Drunkard's amber
 * could not, Wheel in Motion's blue could not, and a light silver trouser
 * certainly cannot (`docs/LESSONS_LEARNED.md:9281`). `riderClearance.test.ts`
 * sweeps him with the other two.
 */
export const FLO_HIP_DOME_APEX = 0.060;
const FLO_HIP_DOME: LoftRing[] = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [FLO_HIP_DOME_APEX, 0]]
  .map(([y, scale]) => ({
    y: y!,
    halfWidth: 0.079 * scale!,
    halfDepth: 0.079 * 0.94 * scale!,
    square: 2.4,
  }));

/**
 * The thigh: `WIM_THIGH`'s even rings and its pair at the guard-top boundary
 * (`riderLook.ts:6028`), a second pair at each edge of the outer-thigh panel,
 * and the hip dome over the joint.
 */
export const FLO_THIGH = loftProfile([
  ...floLimbAtHeights(
    B.thighLength,
    [0.079, 0.072, 0.061],
    [
      0, -0.040,
      FLO_THIGH_PANEL_TOP + 0.002, FLO_THIGH_PANEL_TOP - 0.002,
      -0.080, -0.120, -0.160, -0.200, -0.240,
      FLO_THIGH_PANEL_BOTTOM + 0.002, FLO_THIGH_PANEL_BOTTOM - 0.002,
      -0.270,
      -B.thighLength * FLO_GUARD_TOP + 0.002,
      -B.thighLength * FLO_GUARD_TOP - 0.002,
      -0.300, -0.320, -0.340, -0.360, -0.380, -0.400,
    ],
    { flatten: 0.94, square: 2.4 },
  ),
  ...FLO_HIP_DOME,
]);

/**
 * The seat: `WIM_SEAT` (`riderLook.ts:6054`) — Cool Rider's rings with the hem
 * 30 mm lower and the bottom two a size wider, so the taper still closes over
 * the thighs instead of pinching them. The other half of the hip fix: in the
 * technical corner the outside hip drops 150 mm and the counter-roll lifts that
 * side's hem 26 mm, and the dome has to reach the hem through both.
 */
export const FLO_SEAT = loftProfile([
  { y: -0.118, halfWidth: 0.76 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.78 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.088, halfWidth: 0.84 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.85 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.055, halfWidth: 0.92 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.91 * FLO_TORSO_HALF_DEPTH, square: 2.7 },
  { y: -0.020, halfWidth: 0.97 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.95 * FLO_TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.030, halfWidth: 0.93 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.90 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
]);

/**
 * The shin: `WIM_SHIN`'s shape (`riderLook.ts:6065`) with the pairs moved to
 * his boundaries — the cup's lower edge, and the trainer's collar 100 mm
 * further down the shin than a laced boot's, with a second ring under it so the
 * collar is two rows and a hard edge rather than one painted ring interpolating
 * into its neighbours.
 */
export const FLO_SHIN = floLimbAtHeights(
  B.shinLength,
  [0.064, 0.058, 0.053],
  [
    0, FLO_CUP_BOTTOM + 0.002, FLO_CUP_BOTTOM - 0.002,
    -0.050, -0.080, -0.110, -0.140, -0.170, -0.200, -0.224, -0.250, -0.280,
    -B.shinLength * FLO_BOOT_TOP + 0.002,
    -B.shinLength * FLO_BOOT_TOP - 0.002,
    -B.shinLength * FLO_BOOT_TOP - 0.014,
    -0.345, -0.380,
  ],
  { flatten: 0.92, square: 2.4 },
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
  ...limbProfile(B.upperArmLength, [0.058, 0.050, 0.043], [], {
    flatten: 0.95,
    square: 2.3,
  }).slice().reverse(),
]), [FLO_SHOULDER_CAP_BOTTOM + 0.002, FLO_SHOULDER_CAP_BOTTOM - 0.002]);

/** `WIM_FOREARM`, copied from `riderLook.ts:6098`. */
export const FLO_FOREARM = limbProfile(B.forearmLength, [0.047, 0.041, 0.033], [], {
  flatten: 0.94,
  square: 2.3,
});

/**
 * The lid: `WIM_HELMET`'s twelve rings (`riderLook.ts:6131`) — the roster's
 * road shell, whose jaw lead lives in the rings' own `z` rather than in a chin
 * bar volume, and whose crown rounds off over two extra rings. It is the right
 * shape for him unchanged: PHOTO 1 shows a smooth rounded crown, no peak, no
 * chin bulge and cheeks that stay broad to the base — the same lid the owner
 * accepted on his third look pass, and the reason nothing here is re-proportioned
 * without a critic asking for it.
 *
 * What is his and not Wheel in Motion's is what lies on it: no print, one
 * **much larger** visor (PHOTO 1's wraps ear to ear and hides the face
 * completely), a base rim, and one small pivot boss per side at the visor's
 * hinge.
 */
export const FLO_HELMET = loftProfile([
  { y: 0.058, halfWidth: 0.088, halfDepth: 0.072, square: 2.3, z: 0.012 },
  { y: 0.088, halfWidth: 0.094, halfDepth: 0.086, square: 2.4, z: 0.018 },
  { y: 0.112, halfWidth: 0.104, halfDepth: 0.118, square: 2.5, z: 0.022 },
  { y: 0.132, halfWidth: 0.112, halfDepth: 0.128, square: 2.6, z: 0.020 },
  { y: 0.158, halfWidth: 0.119, halfDepth: 0.130, square: 2.6, z: 0.010 },
  { y: 0.215, halfWidth: 0.124, halfDepth: 0.133, square: 2.5, z: 0.004 },
  { y: 0.268, halfWidth: 0.113, halfDepth: 0.119, square: 2.3 },
  { y: 0.290, halfWidth: 0.101, halfDepth: 0.106, square: 2.25 },
  { y: 0.308, halfWidth: 0.084, halfDepth: 0.088, square: 2.2 },
  { y: 0.324, halfWidth: 0.064, halfDepth: 0.067, square: 2.2 },
  { y: 0.336, halfWidth: 0.040, halfDepth: 0.042, square: 2.2 },
  { y: 0.348, halfWidth: 0, halfDepth: 0 },
]);

/** `WIM_GLOVE`, copied from `riderLook.ts:6298` — a cuff, a wrist waist, knuckles. */
export const FLO_GLOVE = loftProfile([
  { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
  { y: -0.016, halfWidth: 0.044, halfDepth: 0.038, square: 2.8 },
  { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
  { y: -0.028, halfWidth: 0.043, halfDepth: 0.037, square: 2.8 },
  { y: -0.036, halfWidth: 0.031, halfDepth: 0.024, square: 2.8 },
  { y: -0.046, halfWidth: 0.036, halfDepth: 0.026, square: 2.85 },
  { y: -0.058, halfWidth: 0.041, halfDepth: 0.022, square: 2.85 },
  { y: -0.072, halfWidth: 0.040, halfDepth: 0.022, square: 2.9 },
  { y: -0.088, halfWidth: 0.033, halfDepth: 0.024, square: 2.8 },
  { y: -0.098, halfWidth: 0.023, halfDepth: 0.020, square: 2.6 },
  { y: -0.105, halfWidth: 0, halfDepth: 0 },
]);

// -- Materials ----------------------------------------------------------------

/**
 * The suit: the ground every paint on him hangs from, matte like the textile it
 * is (PHOTO 1's folds are soft and the sheen is satin, not leather). Body and
 * limbs point at this **one spec object**, so the jacket, the sleeves, the
 * trousers and the seat are one material and one hue no shade can separate.
 */
const FLO_SUIT: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoSilver,
  roughness: 0.80,
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

/**
 * The lid. **The roughness is the metal, not the albedo** — the shell is only
 * 0.53 × the suit's luminance, and what says "painted metal" in both
 * photographs is a broad soft specular sweeping the crown. 0.34 with a quarter
 * of metalness puts that sweep on the crown at the sun's mirror angle without
 * ACES clipping it to white, and keeps enough diffuse that the shell still
 * reads as a shell from behind instead of as a void.
 *
 * **Both numbers survived r1 untouched and deliberately so**: the round's
 * blocker was the albedo's hue, and the verifier's own reading of the lit crown
 * (0.578 × the lit shoulder, inside §34.4's 0.47–0.60 window against PHOTO 2's
 * 0.49 ×) says the sweep is right. Changing the temperature and the specular
 * together would have left neither measured.
 */
const FLO_LID: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoBronze,
  roughness: 0.34,
  metalness: 0.25,
});

/**
 * The visor: dark smoke, mirrored, with the small emissive Adonisb2's carries
 * so a black aperture is not a hole. PHOTO 1's visor samples green at the top —
 * that is the treeline reflected in it, not the lens, so the colour authored
 * here is neutral-cool.
 *
 * **r1, finding 1e: it rendered as a hole anyway.** A 0.08 lobe on a 0.35-metal
 * panel leaves almost no diffuse, so the captured visor read rgb 5,8,14 — dead
 * flat over 67 rows, **0.04 × its own lit shell** and 12 × darker than its own
 * albedo — where PHOTO 1's shield measures 0.52 × the shell beside it. 0.32
 * roughness spreads the lobe into a sheen and 0.55 of emissive intensity puts a
 * floor under the aperture; the target the capture is read against is 0.35–0.45
 * of the lit shell. Nothing was added along the top rim: the reference has no
 * near-white highlight there (the brightest pixel inside the shell is L 184, at
 * the shell's own edge).
 */
const FLO_LENS: RiderMaterialSpec = Object.freeze({
  colour: C.floWithZoLens,
  roughness: 0.32,
  metalness: 0.35,
  emissive: 0x1a2028,
  emissiveIntensity: 0.55,
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

/**
 * Every dark part of the brace — the strap bands, the hinge strut, the pivot
 * bosses and the limb the guard closes over — at one scalar on the guard's
 * white, so the brace is one black and not four.
 *
 * **0.30 and not r1's 0.10 — r2's finding 3a, and it is the leg's blocker.**
 * The scalar was set on the argument that a real black in sun is a mid-dark
 * grey; at 0.10 it is not a mid-dark grey, it is 0.089 of the shell above it,
 * and the capture showed the consequence in the one place a knee guard is
 * read: a **73 px band at 0.08 × the thigh shell and 0.12 × the kneecap**
 * across the hinge, which a critic reasonably read as a near-black kneecap.
 * PHOTO 2's near leg has nothing below **0.49** of its brightest shell — strap
 * 82 / shell 161 / strap 129 / shell 169 / strap 123 / shell 158 / ankle 121 —
 * and PHOTO 1's near cup is 0.73 × the thigh above it. 0.30 puts strap ÷ shell
 * at **0.27 in linear**, inside PHOTO 2's own 0.24–0.59, and lands the scalar
 * at sRGB 134. Everything the scalar serves moves together, which is the point
 * of there being one of it: the straps, the strut, the bosses and the limb
 * inside the hinge.
 *
 * **The cap left this list in r2 and `FLO_CUP_TINT` is still derived here**
 * (finding 3a's first half): what the limb shows through an open hinge has to
 * be the cup's own value by construction rather than by two numbers kept in
 * step.
 */
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
/**
 * Silver → the vest plate's binding (r2, 2d), and silver → **up** for the back
 * strip (r2, 2e). The binding is the only tint on him between the panel and the
 * ground; the strip is the only one above it outside the guards' own material,
 * and both are values rather than devices.
 */
const FLO_BINDING_TINT: Tint = [0.75, 0.75, 0.75];
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
      z > FLO_VEST_SEAM
      && y >= FLO_VEST_BOTTOM - FLO_VEST_BINDING_ROW
      && y <= FLO_VEST_TOP + FLO_VEST_BINDING_ROW
    ) {
      // The plate, and its binding: both rings of each seam pair carry the
      // lighter edge value, so the panel ends in a 4 mm edging rather than
      // stepping straight to suit-white (r2, 2d).
      const edge = Math.abs(y - FLO_VEST_TOP) <= FLO_VEST_BINDING_ROW
        || Math.abs(y - FLO_VEST_BOTTOM) <= FLO_VEST_BINDING_ROW;
      tint = edge ? FLO_BINDING_TINT : FLO_PANEL_TINT;
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
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
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
    const y = position.getY(i);
    let tint = FLO_SILVER;
    if (y <= guardTop + 1e-6) {
      tint = FLO_CUP_TINT;
    } else if (
      y <= FLO_THIGH_PANEL_TOP + 1e-6
      && y >= FLO_THIGH_PANEL_BOTTOM - 1e-6
      && side * position.getX(i) > 0
    ) {
      tint = FLO_PANEL_TINT;
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
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

/**
 * The guard's arc, thigh and shin alike — Wheel in Motion's spans, kept rather
 * than widened. Its rear edge is the corner the clearance contract measures in
 * the deepest attack-carve-crouch fold, where the thigh lies flat and its back
 * faces up; the last rider's contract moved 1 mm when that span widened.
 */
const FLO_SHELL_U0 = -1.95;
const FLO_SHELL_U1 = 0.90;
const FLO_PLATE_U0 = -2.00;
const FLO_PLATE_U1 = 0.70;

/**
 * The upper half of the brace, on the **thigh** bone — a guard spans a joint
 * and a mesh cannot, so every millimetre above the knee has to be parented to
 * the bone it is strapped to or it swings off the thigh as the leg bends
 * (`RiderLook.panels.thighPad`).
 *
 * Four patches, one mesh, no draw call of its own beyond it: the white shell,
 * the kneecap it closes over, and the hinge strut with its pivot boss down the
 * outside — **dark on light**, which is the sandwich lesson's second rule
 * (`docs/LESSONS_LEARNED.md:6397`). There are no full-loop straps anywhere on
 * this brace, which is that lesson's first rule.
 *
 * **The cap is light since r1 (finding 3a).** It was authored at the brace's
 * black on the argument that a cup is a soft shell, and the captures made it
 * the darkest thing on the whole rider — 0.30 × the trouser — where PHOTO 1's
 * kneecap shell is the *lightest* piece on the leg at 0.96 × the trouser above
 * it, with the dark living in the strap under it at 0.54 ×. Figure and ground
 * were the wrong way round at the one place a knee guard is read from. What
 * stays dark is the gap the photograph actually has: the limb under the guard,
 * which is painted to the cup's own value and shows between the cap and the
 * plates.
 */
const FLO_THIGH_PAD: RiderPanelGroup = group('accent', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: FLO_SHELL_U0,
    u1: FLO_SHELL_U1,
    mirrored: true,
    from: -0.400,
    to: -0.300,
    uSegments: 8,
    vSegments: 5,
    lift: 0.015,
    taper: 0.26,
    shade: FLO_GUARD_SHADE,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: FLO_SHELL_U0,
    u1: FLO_SHELL_U1,
    mirrored: true,
    // **−0.428, not −0.400 — r2's finding 3a, second lever.** The thigh loft
    // closes hemispherically 34 mm below −0.400, and the cap stopped at the
    // last full ring, so the actual kneecap was bare limb painted to the cup's
    // value: 34 mm of the 73 mm dark band the critic measured was this. The cap
    // now covers the close, which is also what shuts the gap the machine's tail
    // light shone through (3f — a blown red at rgb 255,57,59 in `r2/carve`).
    from: -0.428,
    to: FLO_CUP_TOP,
    uSegments: 7,
    vSegments: 2,
    lift: 0.032,
    taper: 0.30,
    // The kneecap, r1's finding 3a: the lightest piece on the leg, not the
    // darkest. Its shin half (`FLO_KNEE_PAD[0]`) moved with it.
    shade: FLO_GUARD_SHADE,
  }),
  patch({
    anchor: 'outboard' as PatchAnchor,
    // The hinge strut, narrowed from ±0.16 rad so it reads as the arm under
    // the plate rather than as the plate's own ground (r2, 3d).
    u0: -0.12,
    u1: 0.12,
    from: -0.400,
    to: -0.296,
    uSegments: 2,
    vSegments: 4,
    lift: 0.026,
    taper: 0.10,
    shade: FLO_CUP_SHADE,
  }),
  patch({
    anchor: 'outboard' as PatchAnchor,
    // **The outboard knee plate, and it is light — r2's finding 3d.** The
    // critic's "no outboard side-plate or pivot hardware" was refuted on
    // absence (four patches were already there) and confirmed on value: all
    // four sat at the cup's dark, where PHOTO 2's outboard plate is **L 165
    // against a shell of 158–169 — the lightest element on the whole leg**,
    // with two dark pivot bolts on its face. So this one carries the guard
    // white and a squarer footprint (±0.34 rad, 66 mm, `taper` 0.35), and the
    // strut above stays dark under it: dark on light, the sandwich lesson's
    // second rule, the right way round at last.
    u0: -0.34,
    u1: 0.34,
    from: -0.386,
    to: -0.320,
    uSegments: 5,
    vSegments: 3,
    lift: 0.031,
    taper: 0.35,
    shade: FLO_GUARD_SHADE,
  }),
]);

/**
 * The lower half, on the **shin** bone: the cup's lip across the hinge, then
 * PHOTO 2's stack — a long upper plate, a dark band, a shorter lower plate, and
 * a band at the ankle — plus two pivot bosses standing proud of the upper
 * plate. The bands span the front and the outboard flank and stop there; a
 * closed loop is what turns two straps into a sandwich with a slice of leg in
 * it, and real webbing runs lengthwise or behind the leg.
 *
 * The stack is what makes the guard read as **1.10 × the shin**: 106 mm of
 * thigh above the knee, 312 mm of shin below it, ending 68 mm above the ankle.
 * The brief's §9 is explicit that this is the one thing not to shrink.
 */
const FLO_KNEE_PAD: RiderPanelGroup = group('accent', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: FLO_SHELL_U0,
    u1: FLO_SHELL_U1,
    mirrored: true,
    from: FLO_CUP_BOTTOM,
    to: 0.000,
    uSegments: 8,
    vSegments: 1,
    lift: 0.038,
    taper: 0.28,
    // The cap's shin half — light with its thigh half since r1 (finding 3a).
    shade: FLO_GUARD_SHADE,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: FLO_PLATE_U0,
    u1: FLO_PLATE_U1,
    mirrored: true,
    from: -0.224,
    to: FLO_CUP_BOTTOM,
    uSegments: 7,
    vSegments: 7,
    lift: 0.018,
    taper: 0.40,
    shade: FLO_GUARD_SHADE,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: FLO_PLATE_U0,
    u1: FLO_PLATE_U1,
    mirrored: true,
    // 18 mm and not 8 (r1, finding 3b), then **40 mm and over the plate, not
    // between the plates** (r2, finding 3c). PHOTO 2's three straps are each
    // ≈ 10 px of a 97 px guard — **10.3 %** — where 18 mm of a 418 mm brace is
    // 4.3 %, about 2.4 × too thin. 40 mm is 9.6 %. It cannot grow upward (the
    // upper plate starts at −0.224) so it grows down across the lower plate,
    // and the lift goes 0.010 → 0.024 to clear both plates: webbing lies over
    // a shell, it does not sink under one, and at 0.010 the extra 22 mm would
    // simply have been buried.
    from: -0.262,
    to: -0.222,
    uSegments: 7,
    vSegments: 2,
    lift: 0.024,
    taper: 0.20,
    shade: FLO_CUP_SHADE,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: -1.90,
    u1: 0.66,
    mirrored: true,
    from: -0.300,
    to: -0.240,
    uSegments: 7,
    vSegments: 3,
    lift: 0.016,
    taper: 0.34,
    shade: FLO_GUARD_SHADE,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: -1.90,
    u1: 0.66,
    mirrored: true,
    // The ankle band, **40 mm on r2's finding 3c** and, like the upper strap,
    // lying over its plate rather than beside it. It grows **up** and not down:
    // the verifier's −0.340 is 28 mm below the trainer's collar at −0.3116, and
    // a guard strap does not run onto a shoe. The guard's own bottom edge stays
    // at −0.318, 68 mm above the ankle, which is where PHOTO 2 ends it.
    from: -0.318,
    to: -0.278,
    uSegments: 7,
    vSegments: 2,
    lift: 0.024,
    taper: 0.20,
    shade: FLO_CUP_SHADE,
  }),
  ...[-0.104, -0.148].map((from) => patch({
    anchor: 'outboard' as PatchAnchor,
    u0: -0.24,
    u1: 0.24,
    from,
    to: from + 0.028,
    uSegments: 4,
    vSegments: 2,
    lift: 0.027,
    taper: 0.78,
    shade: FLO_CUP_SHADE,
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

/**
 * The lid's own features, merged into the head's buffer: a base rim so the
 * shell ends somewhere instead of dissolving into the collar, and **one pivot
 * pod per side** at the visor's hinge. Neither is a volume; both are patches,
 * because a panel on a helmet is the defect the owner named twice on the last
 * rider (*"those yellow panels protruding"*).
 *
 * **Both were re-measured in r1.**
 *
 *   - The rim was authored light (shade 0.95, 4 mm proud) and its wall threw a
 *     hard specular line right across the shell — 2.7 × the value either side
 *     of it — reading as a light collar ring. PHOTO 2's shell base is a **dark
 *     scalloped roll** above the shoulders and PHOTO 1 has a fabric chin strap
 *     and no ring at all, so the rim is now dark (0.45) and half as proud. It
 *     is a value change on a shape the lid already had: the scallops are the
 *     real lid's trade dress and stay unbuilt (finding 7b).
 *   - The pods were 19 mm wide, *darker* than the shell and set 12.6° behind
 *     the visor's edge on bare shell. PHOTO 1's pod is ~22 % of the shell's
 *     width (≈ 55 mm), **lighter** than the shell, and sits on the eyeport's
 *     upper-rear corner. So: 0.22 rad of half-span, shade 1.06, and the centre
 *     moved forward to ±1.24 rad so each pod straddles the visor's corner the
 *     way a hinge does. §34.4's standing rule — drop the bosses the moment a
 *     critic calls them panels — was not tripped; this critic asked for a
 *     bigger, lighter one.
 *
 * **And r2 tripped that rule for the first time, in two seats at once, which
 * is why the pod is now built rather than dropped** (r2's findings 1c and 7d).
 * At `lift` 0.004 with `taper` 0.60 the patch was a flattened card: its bright
 * facet measured **L 152 against a shaded shell of 46 — 3.3 ×, equal to the
 * lit crown in the same frame** — and at some rows it ran onto the silhouette
 * edge with nothing outboard of it. The helmet critic called it *"a flat slab
 * … a render artifact rather than a fitting"* and the **brand** critic called
 * the same pixels a *"pale free-floating hairline"* that could read as a small
 * decal at chase distance. Both readings are of a mark with no thickness, and
 * the verifier left rebuild-or-delete to the builder. It is rebuilt as a
 * hinge, because a real pivot is what stops it reading as a mark: `lift`
 * 0.004 → **0.008** and `taper` 0.60 → **0.25** give the pod a squarer
 * footprint and a wall the light can find an edge on, and a **second,
 * concentric patch** — 0.10 rad, 14 mm, `lift` 0.013, `shade` 0.80 — puts the
 * screw's dark disc in the middle of it, which is what PHOTO 1 shows at
 * x 308–328 and what a free-floating pale strip cannot be mistaken for. The
 * whole assembly still stands 13 mm off a shell that allows 25.
 *
 * The pods are authored as front-anchored patches at ∓π/2 rather than
 * `outboard` ones, because `render/rider.ts:1092` builds every head patch at
 * `side = 1`: an outboard anchor there resolves to his left ear only.
 */
const FLO_BOSS_CENTRE = Math.PI / 2 - 0.33;
const FLO_BOSS_HALF_SPAN = 0.22;
/** The pivot screw's disc, concentric inside the pod and darker than it. */
const FLO_BOSS_DISC_HALF_SPAN = 0.10;

const FLO_HEAD_PANELS: readonly RiderPatch[] = Object.freeze([
  patch({
    anchor: 'front' as PatchAnchor,
    u0: 0,
    u1: Math.PI * 2,
    // **0.068 and not 0.076** — r2's finding 1a. The rim ate 6.2 % of the
    // shell's height where the whole band under the visor was 12.1 %, leaving
    // 5.9 % of shell-coloured jaw: 6 px in `r2/rest/front.png`, at 0.69 × the
    // shell's own front value, sandwiched between the visor's L 12 and the
    // rim's L 20. Two rounds of helmet critics read that as "no chin bar: the
    // visor runs to the neck ring". The rim keeps its job — the shell has to
    // end somewhere — at 10 mm instead of 18.
    from: 0.058,
    to: 0.068,
    uSegments: 18,
    vSegments: 1,
    lift: 0.002,
    shade: 0.45,
  }),
  ...[-1, 1].map((side) => patch({
    anchor: 'front' as PatchAnchor,
    u0: side * FLO_BOSS_CENTRE - FLO_BOSS_HALF_SPAN,
    u1: side * FLO_BOSS_CENTRE + FLO_BOSS_HALF_SPAN,
    from: 0.170,
    to: 0.200,
    uSegments: 5,
    vSegments: 2,
    // r2, 1c and 7d: a pod with a wall, not a card. See the block above.
    lift: 0.008,
    taper: 0.25,
    shade: 1.06,
  })),
  ...[-1, 1].map((side) => patch({
    anchor: 'front' as PatchAnchor,
    u0: side * FLO_BOSS_CENTRE - FLO_BOSS_DISC_HALF_SPAN,
    u1: side * FLO_BOSS_CENTRE + FLO_BOSS_DISC_HALF_SPAN,
    from: 0.178,
    to: 0.192,
    uSegments: 3,
    vSegments: 1,
    lift: 0.013,
    taper: 0.55,
    shade: 0.80,
  })),
]);

/**
 * The visor: one patch, sunk into the shell and lifted only a little, so it
 * reads as glass in a recess rather than as a bar stuck on.
 *
 * **Much larger than the roster's other full-face visor**, because PHOTO 1's
 * is: it wraps ear to ear (±1.20 rad against Wheel in Motion's ±0.80) and takes
 * 37.9 % of the shell's height against his 32.6 %, and the face behind it is
 * completely hidden.
 *
 * **It sits 52 mm lower than r1 authored it (finding 1c), and it did not
 * shrink.** The eyeport was never too deep — 34.5 % of the shell against
 * PHOTO 1's 40.4 % — but it was cut too high, leaving a 35.5 % brow over it and
 * 30 % of shell under it, so the lid read as a letterbox wraparound shield.
 * PHOTO 1's column gives brow 50.0 %, shield 40.4 %, shell below 9.6 %.
 *
 * **Then r2 gave 11 mm of it back to the jaw, which is the whole of finding
 * 1a.** Moving the aperture down solved the crown and left the chin: with the
 * base rim taking 6.2 % of the shell, the *shell-coloured* band under the
 * visor was 5.9 % — six pixels at 0.69 × the shell's own front value, between
 * the visor's black and the rim's black, and two rounds of helmet critics read
 * it as no chin bar at all. PHOTO 1's band there is warm shell (hue 25–51°
 * against the visor's 113–166°) at 0.76 × the shell beside it and 11–18 % of
 * the helmet's height. `from` 0.093 → **0.104**, with the rim cut to 0.068,
 * gives **brow 50.0 % / shield 34.1 % / pale jaw 12.4 % / rim 3.4 %** — the
 * aperture loses 11 mm off the *bottom* only, the crown does not move, and the
 * share stays inside the 0.30–0.38 window `floWithZo.test.ts` holds it to. How
 * far a real chin bar projects forward is not measurable from either
 * photograph (r2's inference 4), so nothing here projects: the jaw lead stays
 * in the shell's own rings. `bulge` is what makes it an eyeport rather than a
 * television — a constant-`v` span is a pair of horizontal rings by
 * construction, and `taper` alone pulls both edges in and gives a lens
 * (`blockoutKit.ts:373-388`).
 *
 * **1.20 rad and not the 1.35 the plan started from.** A patch is a slab — an
 * outer face, an inner face sunk below the surface, and a rim joining them —
 * so wherever its end lands the rim is a 20 mm wall, and an end 13° from the
 * shell's widest point in plan is a wall seen edge-on from any rear-quarter
 * camera. 1.20 leaves 21° of shell outboard of the visor on each side, which
 * is where the hinge boss sits and where a real shell continues to the ear,
 * and still wraps 138° of the head.
 */
const FLO_VISOR_HALF_SPAN = 1.20;

const FLO_FACE: RiderPanelGroup = group('face', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: -FLO_VISOR_HALF_SPAN,
    u1: FLO_VISOR_HALF_SPAN,
    from: 0.104,
    to: 0.203,
    uSegments: 16,
    vSegments: 5,
    lift: 0.006,
    sink: -0.014,
    // The two together are a shield: the taper narrows the aperture toward
    // each hinge the way a real visor does, and the bulge arches the brow so
    // the eyeport is not a television.
    taper: 0.26,
    bulge: 0.20,
    shade: 1,
  }),
]);

// -- The look -----------------------------------------------------------------

export const FLO_WITH_ZO_LOOK: RiderLook = Object.freeze({
  id: 'flo-with-zo',
  // Wheel in Motion's densities: a chest that curves two ways carries the
  // vest's seam, and the lid's silhouette is what the chase camera looks at.
  // Triangles are the free axis.
  density: Object.freeze({ limb: 18, torso: 30, head: 32 }),
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
    // **No collar patch**, no shoulder group, no torso group and no waist
    // group. PHOTO 2's back is unbroken light silver: no harness, no straps,
    // no yoke band and no lettering — every one of those is an invention of
    // the AI turnaround (§34.2). The collar is a painted band on the jersey's
    // top rows, never a lifted ring, because a band on a loft's top ring is a
    // collar in the sense the owner rejected on the last rider — a dog
    // harness round the neck.
    elbowPad: FLO_ELBOW_PAD,
    thighPad: Object.freeze({ ...FLO_THIGH_PAD, ghostSilhouette: true }),
    kneePad: Object.freeze({ ...FLO_KNEE_PAD, ghostSilhouette: true }),
    head: FLO_HEAD_PANELS,
    face: FLO_FACE,
  }),
  // Nothing bolted on: the visor is a patch and the lid's second colour is the
  // rim's own shade, so the whole head is two meshes and one of them does not
  // cast.
  extras: Object.freeze([]),
  paint: Object.freeze({
    torso: paintFloTorso,
    upperArm: paintFloUpperArm,
    thigh: paintFloThigh,
    shin: paintFloShin,
    boot: paintFloBoot,
  }),
  // PHOTO 1 rides with the leading arm low and forward and the trailing arm
  // swept back; the rig's own reactions carry that. All the carriage adds is
  // the touch of splay Wheel in Motion's has, so the sleeves clear the flank.
  armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});
