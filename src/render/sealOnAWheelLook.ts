/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.ts';
import {
  limbProfile,
  loftGeometry,
  loftPoint,
  loftProfile,
  mergeGeometries,
  patchGeometry,
  tintOver,
  vAtHeight,
  type LoftProfile,
  type LoftRing,
  type Tint,
  type UvRect,
} from './blockoutKit.ts';
import { SEAL_REGIONS, createSealAtlas, type SealRegionName, type SealSheetLayout } from './sealAtlas.ts';
import type {
  PatchAnchor,
  RiderLook,
  RiderMaterialRole,
  RiderMaterialSpec,
  RiderPanelGroup,
  RiderPatch,
} from './riderLook.ts';

// -- Seal on a Wheel ----------------------------------------------------------
//
// M35 Phase 1 (`docs/PLANS.md` §35.4). The ninth playable look, the sixth real
// person, and the **darkest one**: an all-black kit — short-sleeved top, loose
// trousers, hard knee shells, elbow pads, gloves, a day-pack, black shoes —
// with exactly two bright things on him, a light grey sweatshirt knotted at the
// waist and a red/white/black printed lid, and one warm one, the bare skin
// between his sleeve hem and his glove cuff. `references/seal_on_a_wheel/`
// holds three stills of his own riding video and an AI target render; the
// stills are the authority for anything real and the render only says how a
// real thing becomes low-poly (§35.2 rules on each of its inventions — the
// flat sash, the short pack, the tanned skin and the lime shoe accents are all
// rejected; the closed dark visor is kept on the owner's brief, against three
// stills that show the visor up).
//
// **He is FloWithZo's mirror image, and that decides the whole file** (§35.2).
// The last rider painted everything *down* from a light silver ground because
// every accent he wore was darker than his suit. Seal's ground is the floor:
// his kit is a family of near-blacks separated by value in the order the
// references rank them — pack darkest, boot, glove, lid black, trouser, top,
// pads a whole stop above as moulded plastic — and his two bright surfaces are
// ten to thirty times lighter than any of it. Neither can be reached from the
// kit by a multiplier, so **each owns a surface rather than a paint**: the
// sweatshirt is an extra in its own material, and the lid is the roster's
// fourth printed sheet. Everything in between — the trousers off the top, the
// pads off the skin, the glove's red, the shoe's yellow rand — is a
// **per-channel** `tintOver`, never a scalar above one on a near-black base,
// which is `floWithZo.test.ts`'s direction rule generalised to a dark ground.
//
// **Three decisions shape the geometry**:
//
//   - **The tied sweatshirt is a volume and it hangs at the back.** A patch can
//     raise a pad; only a volume can grow out of a body (`DESIGN.md` §7k
//     finding 4), and the references give a bulky knot at the front hip and a
//     soft mass down his left rear hip. It is one extra: a band that wraps the
//     waist, a tail that hangs behind his left hip, two sleeve patches running
//     to the knot and the knot itself, all merged into one buffer. **Where its
//     surface can be seen it contains both legs; where it cannot contain them
//     it is buried inside the seat** — which is the only construction a rigid
//     garment on an IK leg has (§7g), and `riderClearance.test.ts` proves both
//     halves.
//   - **The lid is printed and nothing leaves the shell.** Red, white and
//     black on one helmet cannot be shades of one another, so the shell loft is
//     folded onto `sealAtlas`' one wrapped page and its colour is all texels;
//     the only geometry on the head is the shell, a base rim in the page's own
//     black, and the visor sunk into the aperture. No pivot bosses — three
//     blind rounds on the last rider called them a panel — no peak, no spoiler,
//     no vents.
//   - **The pack and the knee shells are where the silhouette money goes.** The
//     pack is the Drunkard's without the beer, a casting volume off the pelvis;
//     the knee shells are two non-casting panel groups on two bones with
//     `ghostSilhouette`, because a guard spans a joint and a mesh cannot. The
//     elbows are paid for differently: a **bulge in the forearm's own rings**
//     plus paint, which costs no mesh, casts for free and is a volume rather
//     than the slab a patch would be.
//
// **A sibling module, on `floWithZoLook.ts`'s pattern**, because a value import
// from `riderLook.ts` would be a load-order cycle: everything below is typed by
// `riderLook.ts` and imports nothing from it. The shared tables this look
// starts from (`JACKET`, `NECK`, `BOOT`, `BOOT_SOLE`, `ringOf`,
// `limbAtHeights`, Wheel in Motion's seat and hip dome, FloWithZo's glove) are
// **copied** under `SEAL_*` names, each with the line it came from, so a later
// edit to his rings cannot move anybody else's.

// -- Copied helpers and shared tables -----------------------------------------

/** `TORSO_HALF_WIDTH` / `TORSO_HALF_DEPTH`, copied from `riderLook.ts:699-700`. */
const SEAL_TORSO_HALF_WIDTH = B.torsoWidth / 2;
const SEAL_TORSO_HALF_DEPTH = B.torsoDepth / 2;

/** `ringOf`, copied from `floWithZoLook.ts:83` — a cross-section at a height. */
function sealRingAt(profile: LoftProfile, y: number): LoftProfile[number] {
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
 * `limbAtHeights`, copied from `floWithZoLook.ts:118` — a limb re-rung at
 * chosen heights, keeping `limbProfile`'s taper and its hemispherical close.
 *
 * Nothing is printed on his limbs, but the reason survives one step down:
 * **a paint boundary is a ring pair or it is a smear**, and even rings are
 * what let a pair be dropped anywhere without the interval either side of it
 * collapsing (`docs/LESSONS_LEARNED.md:1913`). Every value boundary on this
 * rider's legs and arms — and on an all-black rider a value boundary is the
 * only boundary there is — carries one.
 */
function sealLimbAtHeights(
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

/** `JACKET`, copied from `riderLook.ts:711` — the silhouette his top re-rings. */
const SEAL_JACKET = loftProfile([
  { y: -0.010, halfWidth: 1.03 * SEAL_TORSO_HALF_WIDTH, halfDepth: 1.01 * SEAL_TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.018, halfWidth: 0.98 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.96 * SEAL_TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.050, halfWidth: 0.90 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.93 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
  { y: 0.155, halfWidth: 0.86 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.87 * SEAL_TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.290, halfWidth: 0.95 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.99 * SEAL_TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
  { y: 0.400, halfWidth: 0.98 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.96 * SEAL_TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
  { y: 0.470, halfWidth: 0.99 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.90 * SEAL_TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
  { y: 0.500, halfWidth: 0.92 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.82 * SEAL_TORSO_HALF_DEPTH, square: 2.9 },
  { y: 0.528, halfWidth: 0.74 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.66 * SEAL_TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.548, halfWidth: 0.44 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.50 * SEAL_TORSO_HALF_DEPTH, square: 2.3 },
]);

/** `NECK`, copied from `riderLook.ts:756`. */
const SEAL_NECK = loftProfile([
  { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
  { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
  { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
  { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);

/**
 * `BOOT`, copied from `riderLook.ts:788`. A low skate shoe wears the same last.
 *
 * **One ring is his own**, at the mid-foot: the loft's rings run heel to toe,
 * so the yellow rand — which is a band in the *standing* boot's height — is
 * carried by whichever rings happen to cross it, and r1 found the 55 mm gap
 * between `−0.035` and `0.020` leaving the band its shoulders and no row of
 * vertices inside it (§E 10). Interpolated rather than invented, so the last's
 * shape is unchanged.
 */
const SEAL_BOOT = loftProfile([
  { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
  { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
  { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
  { y: -0.010, halfWidth: 0.063, halfDepth: 0.044, square: 2.9 },
  { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
  { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
  { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
  { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);

/** `BOOT_SOLE`, copied from `riderLook.ts:804`. */
const SEAL_BOOT_SOLE = loftProfile([
  { y: -0.018, halfWidth: 0.060, halfDepth: B.bootLength * 0.44, square: 4.2 },
  { y: -0.003, halfWidth: 0.065, halfDepth: B.bootLength * 0.47, square: 5.2 },
  { y: 0, halfWidth: 0.062, halfDepth: B.bootLength * 0.45, square: 4.6 },
]);

/** A short cuff, a full palm and a rounded mitten end; thumb merged below. */
const SEAL_GLOVE = loftProfile([
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
const sealThumb = (side: number): THREE.BufferGeometry => loftGeometry(loftProfile([
  { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
  { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
  { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
  { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
  { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });

// -- Where his values change, in metres ---------------------------------------

/**
 * The knee shell's top on the thigh, as a fraction of it — **0.74, and it is
 * the biggest volume on his legs** (§35.2: *"large hard black shells worn over
 * the trousers… the biggest single volume on his legs"*). 0.74 × 400 mm puts
 * the shell's upper edge 104 mm above the knee, which is what PHOTO 3's
 * kneecap plate measures against his thigh, and Wheel in Motion's 0.735 is
 * the neighbouring precedent for the clearance ceiling it sits under.
 */
export const SEAL_SHELL_TOP = 0.74;
/** The shell's own kneecap span, thigh side then shin side — a 56 mm cup. */
export const SEAL_CUP_TOP = -0.384;
export const SEAL_CUP_BOTTOM = -0.028;
/**
 * How far down the shin the shell reaches — 146 mm, 38 % of it. PHOTO 3 shows
 * the shell covering the cap and *a good span above and below*; below this the
 * trouser is plain again and the boot's collar is another 150 mm down.
 */
export const SEAL_SHELL_BOTTOM = -0.146;
/**
 * Where the shoe's collar sits on the shin — 0.80, a low skate shoe rather
 * than a moto boot's shaft (PHOTO 2: a low black upper with a white lace
 * detail and a light yellow sole unit).
 */
export const SEAL_BOOT_TOP = 0.80;
/**
 * **The sleeve hem, high on the upper arm** — 0.34 of it, 95 mm from the
 * shoulder. This is the single largest read cue on an all-black rider and
 * §35.2 calls it that: *"bare skin from the sleeve hem to the glove… his only
 * large warm area"*. A sleeve that reached the elbow would delete it.
 */
export const SEAL_SLEEVE_HEM = 0.34;
/**
 * The elbow pad's span on the forearm, metres from the elbow. **A bulge and
 * not a stripe** (§35.2, the render under-sizes it): the forearm's own rings
 * swell to 60 mm here against the limb's 47, so the pad is wider than the arm
 * and carries a silhouette the ghost gets for nothing — and the skin above
 * and below it is what the photographs show.
 */
export const SEAL_ELBOW_TOP = -0.004;
export const SEAL_ELBOW_BOTTOM = -0.104;
/**
 * The same band's upper half, on the upper arm's last rings, so the pad spans
 * the joint — **and it reaches up toward the sleeve, which r2's gauntlet is
 * why** (§E 8).
 *
 * Off the constants at −0.244 the arm read sleeve 95 mm, bare skin 149, pad
 * 136 (36 of it on this bone) and bare forearm 156: a pad **0.91 ×** the bare
 * band above it, where PHOTO 2 gives 1.4 and PHOTO 3 at ×3 puts the pad's top
 * essentially at the sleeve's own hem. −0.210 lands the ratio at **1.48** with
 * 115 mm of bare skin still showing between the two — chosen to stay clear of
 * the arms test's `y > −0.20` skin bound, so the bare band it walks stays
 * exactly as green as it was.
 */
export const SEAL_ELBOW_UPPER = -0.210;

// -- Profiles -----------------------------------------------------------------

/**
 * The top: `SEAL_JACKET` re-rung evenly at 30 mm, with a ring pair at ±0.002
 * around the one value boundary the torso carries — the seat's hem, which is
 * an address rather than a height (see `SEAL_SEAT_SHADE`).
 *
 * **Ring spacing is part of the interface** (`docs/LESSONS_LEARNED.md:6447`):
 * the region is ruled evenly and said so here, so a later inserted ring cannot
 * silently re-scale the sleeve patches' skew above it, and a boundary pair can
 * be dropped anywhere without collapsing the interval beside it.
 */
export const SEAL_JERSEY = loftProfile((() => {
  const heights = [-0.010, 0.018];
  for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030) heights.push(Math.round(y * 1000) / 1000);
  heights.push(0.500, 0.528, 0.548);
  return [...new Set(heights)].sort((a, b) => a - b).map((y) => sealRingAt(SEAL_JACKET, y));
})());

/**
 * The hip dome over the thigh's top — `WIM_HIP_DOME` (`riderLook.ts:6013`),
 * 60 mm of rounded close, **from day one** (q150). The rig drops the inside
 * hip 85 mm under the pelvis in a carve and the outside hip 150 mm in a
 * technical corner and counter-rolls the hem up on top of that, so a thigh
 * ending in a flat cap ends in a flat cap *below* the hem with the seat's
 * underside over it. Black hides it — and his trousers are black — but a
 * **light** garment sits right at that hem, so the neighbourhood is lit by the
 * one bright thing on his body and the cut would be exactly where the eye is.
 * Two riders were retrofitted for less; `riderClearance.test.ts` sweeps him
 * with the other three.
 */
export const SEAL_HIP_DOME_APEX = 0.060;
const SEAL_HIP_DOME: LoftRing[] = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [SEAL_HIP_DOME_APEX, 0]]
  .map(([y, scale]) => ({
    y: y!,
    halfWidth: 0.079 * scale!,
    halfDepth: 0.079 * 0.94 * scale!,
    square: 2.4,
  }));

/**
 * The thigh: even 40 mm rings, a pair at the knee shell's top boundary, and
 * the hip dome over the joint. Loose trousers, so a touch fuller than the
 * roster's fitted legs at the top and no taper into the knee.
 */
export const SEAL_THIGH = loftProfile([
  ...sealLimbAtHeights(
    B.thighLength,
    [0.082, 0.076, 0.066],
    [
      0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240,
      -B.thighLength * SEAL_SHELL_TOP + 0.002,
      -B.thighLength * SEAL_SHELL_TOP - 0.002,
      -0.320, -0.360, -0.400,
    ],
    { flatten: 0.94, square: 2.4 },
  ),
  ...SEAL_HIP_DOME,
]);

/**
 * The seat: `WIM_SEAT` (`riderLook.ts:6054`) — Cool Rider's rings with the hem
 * 30 mm lower and the bottom two a size wider, so the taper still closes over
 * the thighs instead of pinching them. The other half of the hip fix, and the
 * surface the tied garment's lower edge is buried in.
 */
export const SEAL_SEAT = loftProfile([
  { y: -0.118, halfWidth: 0.76 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.78 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.088, halfWidth: 0.84 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.85 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.055, halfWidth: 0.92 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.91 * SEAL_TORSO_HALF_DEPTH, square: 2.7 },
  { y: -0.020, halfWidth: 0.97 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.95 * SEAL_TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.030, halfWidth: 0.93 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.90 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
]);

/**
 * The shin: even rings with pairs at the knee shell's lower edge and at the
 * shoe's collar, and a second ring under the collar so it is two rows and a
 * hard edge rather than one painted ring interpolating into its neighbours.
 */
export const SEAL_SHIN = sealLimbAtHeights(
  B.shinLength,
  [0.066, 0.060, 0.055],
  [
    0, SEAL_CUP_BOTTOM + 0.002, SEAL_CUP_BOTTOM - 0.002,
    -0.060, -0.100,
    SEAL_SHELL_BOTTOM + 0.002, SEAL_SHELL_BOTTOM - 0.002,
    -0.180, -0.220, -0.260,
    -B.shinLength * SEAL_BOOT_TOP + 0.002,
    -B.shinLength * SEAL_BOOT_TOP - 0.002,
    -B.shinLength * SEAL_BOOT_TOP - 0.014,
    -0.345, -0.380,
  ],
  { flatten: 0.92, square: 2.4 },
);

/**
 * The upper arm: `WIM_UPPER_ARM`'s smooth sleeve with FloWithZo's **dome over
 * the shoulder joint** rather than the flat capped disc every arm without a
 * shoulder panel leaves under one, a ring pair at the sleeve's hem, and the
 * last rings widened into the elbow pad's upper half.
 */
export const SEAL_UPPER_ARM = loftProfile([
  { y: 0.034, halfWidth: 0, halfDepth: 0, square: 2.3 },
  { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
  { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
  ...limbProfile(B.upperArmLength, [0.058, 0.050, 0.043], [], {
    flatten: 0.95,
    square: 2.3,
  }).slice().reverse().filter((ring) => ring.y > SEAL_ELBOW_UPPER + 1e-6),
  // The sleeve's hem: a pair, because a short sleeve on a bare arm is the one
  // hard value edge on the whole limb.
  ...[-B.upperArmLength * SEAL_SLEEVE_HEM + 0.002, -B.upperArmLength * SEAL_SLEEVE_HEM - 0.002]
    .map((y) => ({ y, halfWidth: 0.0525, halfDepth: 0.0499, square: 2.3 })),
  // The pad's upper half: the arm thickens into the elbow instead of tapering
  // out of it, so the black band that crosses the joint has a shoulder on
  // both bones and does not read as a painted stripe.
  { y: SEAL_ELBOW_UPPER, halfWidth: 0.045, halfDepth: 0.043, square: 2.3 },
  { y: -0.264, halfWidth: 0.050, halfDepth: 0.047, square: 2.4 },
  { y: -0.280, halfWidth: 0.052, halfDepth: 0.049, square: 2.5 },
  { y: -0.292, halfWidth: 0.040, halfDepth: 0.038, square: 2.4 },
  { y: -0.300, halfWidth: 0, halfDepth: 0, square: 2.3 },
  // Ruled in one place and sorted once: the dome, the limb's own stops, the
  // sleeve's pair and the elbow's swell are authored in the order they read
  // rather than in the order a loft wants them.
].slice().sort((a, b) => a.y - b.y));

/**
 * The forearm: `WIM_FOREARM`'s taper with **the elbow pad as a swell in the
 * rings themselves** — 60 mm across where the limb is 47 — and a pair at the
 * pad's lower edge. A patch here would be a slab with a rim standing off a
 * bare arm; rings are a volume, cost no mesh, and are in the ghost because the
 * limb they belong to casts (§35.4's budget note, and the reason his elbows
 * are not a panel group).
 */
export const SEAL_FOREARM = loftProfile([
  { y: SEAL_ELBOW_TOP, halfWidth: 0.058, halfDepth: 0.055, square: 2.4 },
  { y: -0.026, halfWidth: 0.060, halfDepth: 0.057, square: 2.5 },
  { y: -0.060, halfWidth: 0.057, halfDepth: 0.054, square: 2.45 },
  { y: SEAL_ELBOW_BOTTOM + 0.002, halfWidth: 0.048, halfDepth: 0.045, square: 2.35 },
  { y: SEAL_ELBOW_BOTTOM - 0.002, halfWidth: 0.0475, halfDepth: 0.0446, square: 2.3 },
  ...limbProfile(B.forearmLength, [0.047, 0.041, 0.033], [], {
    flatten: 0.94,
    square: 2.3,
  }).slice().reverse().filter((ring) => ring.y < SEAL_ELBOW_BOTTOM - 0.002 - 1e-6),
].slice().sort((a, b) => a.y - b.y));

/**
 * The lid: a full-face road shell, **as wide as it is tall**, with the jaw
 * lead in the rings' own `z` rather than in a chin-bar volume.
 *
 * Its proportions are the measured ones and they are not `WIM_HELMET`'s:
 * §35.2 gives w/h **0.91** in the photographs and 0.98 in the render, where
 * the roster's road shell is 0.855, so every half-width here is a size up on
 * it. The base ring is **0.79 of the widest** against that shell's 0.71 —
 * M34's open item, where a lid whose lowest rings pinch reads as a bulb on a
 * stalk from the chase camera — and the ring at a tenth of the shell's height
 * is 0.85 of the widest, which is the number `sealOnAWheel.test.ts` holds.
 *
 * What lies on it is a **printed page** and nothing else: no pivot bosses (the
 * rule §34.4 left standing after three blind rounds called them a panel), no
 * peak, no spoiler, no vents. The shell's only merged feature is the base rim,
 * and it wears the page's own black.
 *
 * **The jaw leads, and r1's gauntlet is why** (`seal-views/_scratch/
 * gauntlet-r1-record.md` §E 2). The first build inherited M34's road-lid `z`
 * on the two lowest rings, which left the base reaching 0.633 of the shell's
 * own furthest forward point — the jaw 58 mm *behind* the brow, so from every
 * camera the lid was a sphere cut flat at the neck and three of six blind
 * critics wrote the same sentence: there is no chin bar. The two lowest rings
 * now carry the lead themselves (`z` 0.038 and 0.042 against 0.014 and 0.020,
 * with 10 mm and 6 mm more depth under them), which puts the base at 0.85 of
 * the maximum reach and 25 % of the shell under the aperture against PHOTO 2's
 * 35 %. How much further to close that gap is the owner's call, not a
 * measurement — 25 % is where the photograph and the roster's converged recipe
 * meet, and the record says so in as many words.
 */
export const SEAL_HELMET = loftProfile([
  { y: 0.058, halfWidth: 0.106, halfDepth: 0.096, square: 2.4, z: 0.038 },
  { y: 0.086, halfWidth: 0.114, halfDepth: 0.110, square: 2.5, z: 0.042 },
  { y: 0.110, halfWidth: 0.122, halfDepth: 0.126, square: 2.55, z: 0.024 },
  { y: 0.132, halfWidth: 0.128, halfDepth: 0.136, square: 2.6, z: 0.022 },
  { y: 0.158, halfWidth: 0.132, halfDepth: 0.139, square: 2.6, z: 0.012 },
  { y: 0.212, halfWidth: 0.134, halfDepth: 0.141, square: 2.5, z: 0.004 },
  { y: 0.262, halfWidth: 0.124, halfDepth: 0.128, square: 2.35 },
  { y: 0.286, halfWidth: 0.111, halfDepth: 0.114, square: 2.3 },
  { y: 0.306, halfWidth: 0.093, halfDepth: 0.096, square: 2.25 },
  { y: 0.322, halfWidth: 0.071, halfDepth: 0.074, square: 2.2 },
  { y: 0.334, halfWidth: 0.044, halfDepth: 0.046, square: 2.2 },
  { y: 0.346, halfWidth: 0, halfDepth: 0 },
]);

// -- The tied sweatshirt ------------------------------------------------------

/**
 * The body the garment is derived from: the seat below the hip and the top
 * above it, whichever is the wider at a height.
 *
 * **Derived and not authored beside it** — the M22 rule (`DRUNKARD_PACK_Z`,
 * `riderLook.ts:7896`): one part meant to sit on another takes its rings from
 * that part's, so a later reshape of the torso carries the garment with it
 * instead of stranding it.
 */
function sealBodyRingAt(y: number): { halfWidth: number; halfDepth: number; square: number } {
  const seat = sealRingAt(SEAL_SEAT, y);
  const top = sealRingAt(SEAL_JERSEY, y);
  const useSeat = y <= SEAL_SEAT[SEAL_SEAT.length - 1]!.y;
  const w = useSeat ? Math.max(seat.halfWidth, top.halfWidth) : top.halfWidth;
  const d = useSeat ? Math.max(seat.halfDepth, top.halfDepth) : top.halfDepth;
  const square = useSeat ? Math.max(seat.square, top.square) : top.square;
  return { halfWidth: w, halfDepth: d, square };
}

/**
 * **Where the garment's lower edge disappears into the seat**, and the number
 * the whole clearance contract turns on.
 *
 * A tied sweatshirt is a band round the hips, and the legs are solved by IK to
 * planted pedals: a hem the legs pass *through* would have to contain a thigh
 * the rig folds toward horizontal, which no wearable garment does (Trollina's
 * skirt needs a 700 mm flare to prove 62 mm of hem, `DESIGN.md` §7g). So this
 * band has **no hem the legs pass through at all**. Above this height its
 * section stands outside the body and contains both legs with margin; below
 * it, the rings shrink inside the seat's own section and the loft's closing
 * disc is buried in it, where nothing can see it and no leg can cross it.
 *
 * `riderClearance.test.ts` proves both halves over the held riding envelope:
 * containment above, and the burial below as a property of the rings
 * themselves rather than of a pose.
 */
export const SEAL_GARMENT_VISIBLE_BOTTOM = 0.072;

/**
 * The band, in the pelvis frame: the roll of a sweatshirt tied round the
 * waist. Each ring is the body's own at that height, scaled, with the whole
 * section pushed **back** so the bulk is behind the hips and the front stays
 * tight enough for the knot to stand proud of it.
 */
export const SEAL_GARMENT_BAND: LoftProfile = loftProfile(([
  // [height, scale, z offset, square lift]
  [0.160, 0.99, -0.004, 0.20],
  [0.142, 1.10, -0.008, 0.35],
  [0.118, 1.19, -0.012, 0.35],
  [0.094, 1.22, -0.014, 0.35],
  [SEAL_GARMENT_VISIBLE_BOTTOM, 1.18, -0.012, 0.30],
  // Buried from here down: the closing rings are smaller than the body they
  // sit in — at the body's own `square`, so a fatter corner cannot poke out
  // of a narrower ring — and the bottom cap is inside the seat rather than
  // being a hem a leg has to pass through.
  [0.062, 0.94, -0.004, 0],
  [0.048, 0.86, -0.004, 0],
  [0.036, 0.62, -0.002, 0],
] as const).map(([y, scale, z, lift]) => {
  const ring = sealBodyRingAt(y);
  return {
    y,
    halfWidth: ring.halfWidth * scale,
    halfDepth: ring.halfDepth * scale,
    z,
    square: Math.min(3.2, ring.square + lift),
  };
}));

/**
 * A thin gathered sweatshirt drape, joined broadly beneath the waist roll.
 * The old 84 mm thick, oval-ended volume read as an attached armour plate.
 * This envelope retains the rear clearance, with a broad cut hem and shallow
 * vertical folds displaced rearward inside it by sealGarmentTail(). +X is left.
 */
const SEAL_TAIL_X = 0.055;
const SEAL_TAIL_Z = -0.178;
export const SEAL_GARMENT_HEM = -0.190;
export const SEAL_GARMENT_TAIL: LoftProfile = loftProfile([
  { y: 0.142, halfWidth: 0.115, halfDepth: 0.030, square: 3.0, x: 0.025, z: -0.142 },
  { y: 0.112, halfWidth: 0.132, halfDepth: 0.026, square: 3.2, x: 0.033, z: -0.158 },
  { y: 0.060, halfWidth: 0.139, halfDepth: 0.022, square: 3.6, x: 0.043, z: SEAL_TAIL_Z },
  { y: 0.006, halfWidth: 0.138, halfDepth: 0.020, square: 3.8, x: SEAL_TAIL_X, z: SEAL_TAIL_Z },
  { y: -0.033, halfWidth: 0.133, halfDepth: 0.018, square: 3.8, x: 0.057, z: SEAL_TAIL_Z },
  { y: -0.072, halfWidth: 0.127, halfDepth: 0.017, square: 3.8, x: 0.059, z: SEAL_TAIL_Z },
  { y: -0.112, halfWidth: 0.121, halfDepth: 0.016, square: 3.8, x: 0.060, z: SEAL_TAIL_Z },
  { y: -0.151, halfWidth: 0.117, halfDepth: 0.015, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
  { y: SEAL_GARMENT_HEM, halfWidth: 0.114, halfDepth: 0.014, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
  { y: SEAL_GARMENT_HEM - 0.0015, halfWidth: 0.075, halfDepth: 0.008, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
  { y: SEAL_GARMENT_HEM - 0.002, halfWidth: 0, halfDepth: 0, x: 0.061, z: SEAL_TAIL_Z },
]);

/** Gathered fold valleys stay inside the tested envelope; no new mesh. */
function sealGarmentTail(): THREE.BufferGeometry {
  const geometry = loftGeometry(SEAL_GARMENT_TAIL, { radialSegments: 48 });
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const ring = sealRingAt(SEAL_GARMENT_TAIL, y);
    const across = (position.getX(i) - ring.x) / Math.max(0.001, ring.halfWidth);
    const rear = Math.max(0, Math.min(1, (ring.z - position.getZ(i)) / Math.max(0.001, ring.halfDepth)));
    const fold = (0.5 + 0.5 * Math.cos(across * Math.PI * 3 + 0.25)) * (1 - across * across);
    const gather = Math.min(1, Math.max(0, (0.142 - y) / 0.08));
    // Move only the back face inward; the front/leg boundary stays unchanged.
    position.setZ(i, position.getZ(i) + 0.010 * fold * rear * gather);
    const shade = 1 - 0.18 * fold * rear * gather;
    colour.setXYZ(i, shade, shade, shade);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The knot: **two crossing sleeves with two free ends**, at the front-left hip
 * and slightly left of centre, which is what PHOTO 3 shows.
 *
 * A volume and not a patch, for the identity's sake: the knot is the cue that
 * says "sweatshirt tied round the waist" rather than "belt", and a flat patch
 * reads as a printed band (`DESIGN.md` §7k finding 4).
 *
 * **r2's piece 2 found that one lump is not that cue** (§E 4). The r1–r2 knot
 * was a single five-ring lobe, 96 × 76 mm and 68 mm tall, and it rendered as
 * *"a smooth pebble sitting on the band"*: at ×3 through `rest/knees.png` the
 * whole garment was a roll with one swell on it and a single facet edge, and
 * **nothing in the twenty-four rider views terminated as a sleeve or a cuff**.
 * PHOTO 3 at ×3 is unambiguous about what is actually there: two rolled sleeve
 * tubes crossing, a loop visible through the crossing, and two short free ends
 * hanging below the roll — about 80 × 55 px on a 230 px waist.
 *
 * So the lobe is gone and these are the two tubes, ≈ 44 mm across and crossing
 * at the hip: `OVER` runs up from the right and passes in front, `UNDER` runs
 * up from the left behind it, and each carries its end down to **y 0.020** —
 * 52 mm below the band's own visible bottom, which is what makes the ends read
 * as ends rather than as more roll. The pair crosses over the lobe's own
 * footprint on the band — 58 mm left of centre, 128 mm ahead of the pelvis —
 * and stands proud of it by the same margin `sealOnAWheel.test.ts` has always
 * held, so nothing about the knot's *place* has moved: only what it is made of.
 *
 * **The free ends hang inboard, and that is the clearance contract rather than
 * taste.** They are the only part of this garment that hangs in *front* of a
 * hip, and the thighs swing forward out of it through every fold the rig
 * holds: measured over the held envelope, a leg reaches z 0.139 at x 0.085 at
 * the ends' own height, so an end over the thigh fails
 * `riderClearance.test.ts`'s 8 mm bar and an end toward the centre line clears
 * it by 27. Both ends are therefore inboard of x 0.080, which is also where a
 * real tie's ends fall.
 *
 * Ten radial segments rather than the lofts' eighteen: at 44 mm across, a
 * tube's silhouette is carried by its length and not by its section, and two
 * of them at eighteen would spend the whole of §E's triangle allowance on
 * curvature nobody can resolve.
 */
/** The tubes' own free-end height — the number that makes them read as ends. */
export const SEAL_KNOT_END = 0.020;
export const SEAL_GARMENT_KNOT_OVER: LoftProfile = loftProfile([
  { y: SEAL_KNOT_END - 0.008, halfWidth: 0, halfDepth: 0, x: 0.020, z: 0.150 },
  { y: SEAL_KNOT_END + 0.002, halfWidth: 0.014, halfDepth: 0.013, square: 2.2, x: 0.020, z: 0.150 },
  { y: 0.050, halfWidth: 0.020, halfDepth: 0.018, square: 2.2, x: 0.030, z: 0.148 },
  { y: 0.084, halfWidth: 0.022, halfDepth: 0.020, square: 2.3, x: 0.047, z: 0.144 },
  { y: 0.112, halfWidth: 0.021, halfDepth: 0.019, square: 2.3, x: 0.062, z: 0.138 },
  { y: 0.134, halfWidth: 0.015, halfDepth: 0.014, square: 2.2, x: 0.075, z: 0.132 },
  { y: 0.142, halfWidth: 0, halfDepth: 0, x: 0.079, z: 0.130 },
]);
export const SEAL_GARMENT_KNOT_UNDER: LoftProfile = loftProfile([
  { y: SEAL_KNOT_END - 0.008, halfWidth: 0, halfDepth: 0, x: 0.066, z: 0.150 },
  { y: SEAL_KNOT_END + 0.002, halfWidth: 0.014, halfDepth: 0.013, square: 2.2, x: 0.066, z: 0.150 },
  { y: 0.050, halfWidth: 0.020, halfDepth: 0.018, square: 2.2, x: 0.068, z: 0.146 },
  { y: 0.084, halfWidth: 0.022, halfDepth: 0.020, square: 2.3, x: 0.072, z: 0.132 },
  { y: 0.112, halfWidth: 0.021, halfDepth: 0.019, square: 2.3, x: 0.056, z: 0.126 },
  { y: 0.134, halfWidth: 0.015, halfDepth: 0.014, square: 2.2, x: 0.042, z: 0.122 },
  { y: 0.142, halfWidth: 0, halfDepth: 0, x: 0.038, z: 0.120 },
]);
/** The pair, for the clearance contract and the tests that walk both. */
export const SEAL_GARMENT_KNOT: readonly LoftProfile[] = Object.freeze([
  SEAL_GARMENT_KNOT_OVER,
  SEAL_GARMENT_KNOT_UNDER,
]);

/**
 * The two sleeves, as mirrored patches on the band's **own** profile rather
 * than on the torso's: the band already stands 120 mm proud of the jersey at
 * the hip, so a patch on the jersey would be inside it.
 *
 * Each runs from its flank round to the knot, diagonally (`skewFrom`/`skewTo`
 * are heights, so the shear reads in metres like everything else here), tapered
 * at both ends and bowed so the run has the slack a sleeve lying over a hip
 * has. They are the one place the garment gets an edge instead of a swell.
 */
const SEAL_SLEEVE_PATCH: readonly { u0: number; u1: number }[] = Object.freeze([
  { u0: 0.30, u1: 1.55 },
]);

function sealSleeves(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const span of SEAL_SLEEVE_PATCH) {
      // `anchor: 'front'` is π/2 in `loftPoint`'s frame; the mirrored pair
      // runs each sleeve from its own flank toward the centre.
      const centre = Math.PI / 2;
      const u0 = centre + side * span.u0;
      const u1 = centre + side * span.u1;
      parts.push(patchGeometry(SEAL_GARMENT_BAND, {
        u0: Math.min(u0, u1),
        u1: Math.max(u0, u1),
        v0: vAtHeight(SEAL_GARMENT_BAND, 0.078),
        v1: vAtHeight(SEAL_GARMENT_BAND, 0.126),
        uSegments: 7,
        vSegments: 2,
        lift: 0.013,
        sink: -0.010,
        taper: 0.34,
        bow: 0.16,
        // The run drops as it leaves the knot and climbs onto the flank: a
        // sleeve tied at the front hangs from the hip, it does not ring the
        // waist at one height.
        skew: side * 0.55,
        uByArc: true,
      }));
    }
  }
  return parts;
}

/**
 * The whole garment as one buffer: the band, the tail, the knot and the two
 * sleeves. One extra, one mesh, one colour call and one shadow call — and it
 * **casts**, because it is the only thing on him that changes the outline of a
 * black figure at gameplay distance.
 *
 * The band is painted **before** the merge (`paintSealBand`), which is the
 * whole trick of r3's §E 3: a value break addressed on one part's own vertices
 * costs no call, no material and no triangle, exactly as `SEAL_SEAT_SHADE`
 * addresses the seat inside the torso's buffer.
 */
function sealGarment(): THREE.BufferGeometry {
  const band = loftGeometry(SEAL_GARMENT_BAND, { radialSegments: 26 });
  paintSealBand(band);
  return mergeGeometries([
    band,
    sealGarmentTail(),
    ...SEAL_GARMENT_KNOT.map((tube) => loftGeometry(tube, { radialSegments: 10 })),
    ...sealSleeves(),
  ]);
}

// -- The pack -----------------------------------------------------------------

/**
 * The pack's centre-line depth, derived from the top's own back — the
 * Drunkard's `DRUNKARD_PACK_Z` (`riderLook.ts:7896`) against this rider's
 * rings: the inner face is buried 10 mm into the deepest of the back's rings
 * across its height, so a ring change moves the pack with the back.
 */
const SEAL_PACK_HALF_DEPTH = 0.047;
const SEAL_PACK_Z = (() => {
  const point = new THREE.Vector3();
  let back = Infinity;
  for (const y of [0.20, 0.26, 0.32, 0.38, 0.44]) {
    loftPoint(SEAL_JERSEY, -Math.PI / 2, vAtHeight(SEAL_JERSEY, y), point);
    back = Math.min(back, point.z);
  }
  return back - SEAL_PACK_HALF_DEPTH + 0.010;
})();

/**
 * The box's top ring, and the ceiling on it is the **skull's arc**.
 *
 * §35.2 measures the real pack at 18.8 % of the figure with its top level with
 * the shoulder line, against the target render's 13.4 % — the render's is
 * ~30 % too short and the photographs win. What stops it going further is not
 * taste: the neck counter-pitches to 0.97 rad in a launch held in a crouch and
 * the skull's back is 190 mm from the joint, so a lid above about `y 0.46` in
 * the pelvis frame is *inside the head* on a fast ride (the Drunkard's pint,
 * measured at 48 mm inside, `riderClearance.test.ts:2526`).
 *
 * **r1's piece 3 asked for the last of it and got 10 mm of 83** (§E 6). The
 * critic traced PHOTO 1's silhouette and put the pack's lid and the shoulder
 * on one line — 7 px of 442 under the helmet — against **83 mm** of daylight
 * in the render, 5.0 % of the 1.653 m figure. §E 6 costed the reachable part
 * at 18 mm against the shoulder-ring bar (0.470); **the binding constraint
 * turned out to be the other confirmed fix in the same round.** r2's chin bar
 * deepens the shell's two lowest rings, which grows the body
 * `riderClearance.test.ts` sweeps, and the pack fails the 20 mm bar from
 * 0.464 up — measured a millimetre at a time, the fold `carve −0.64, lean
 * 0.70, tuck 1, attack 1, crouch 1, look −0.42` being the one that closes it.
 * So the lid stands at **0.462**, a millimetre under the last height that
 * clears, and the remaining 73 mm is a clearance contract rather than a look
 * decision — on the record where a further round can see it, not bargained
 * down here. His pack measures 0.302 m of the figure, **19.4 %**, with its lid
 * 38 mm under the shoulder ring.
 */
export const SEAL_PACK_TOP = 0.462;

export const SEAL_PACK = loftProfile([
  { y: 0.160, halfWidth: 0.062, halfDepth: 0.030, square: 2.6, z: SEAL_PACK_Z },
  { y: 0.176, halfWidth: 0.094, halfDepth: 0.044, square: 3.4, z: SEAL_PACK_Z },
  { y: 0.200, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
  { y: 0.256, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
  { y: 0.312, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
  { y: 0.368, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
  { y: 0.410, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: SEAL_PACK_Z },
  { y: 0.436, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: SEAL_PACK_Z },
  // The lid: a 16 mm rounded close, low enough that the skull clears it at
  // the neck's full extension with the look and the fold composed. Translated
  // 16 mm with the top in r2 rather than restretched, so the close keeps its
  // shape and the straight run under it gains the height instead.
  { y: 0.454, halfWidth: 0.088, halfDepth: 0.043, square: 3.0, z: SEAL_PACK_Z },
  { y: 0.459, halfWidth: 0.060, halfDepth: 0.030, square: 2.6, z: SEAL_PACK_Z },
  { y: SEAL_PACK_TOP, halfWidth: 0, halfDepth: 0, z: SEAL_PACK_Z },
]);

function sealPack(): THREE.BufferGeometry {
  return loftGeometry(SEAL_PACK, { radialSegments: 20 });
}

/**
 * The straps' anatomy: Wheel in Motion's four patches with the Drunkard's
 * frozen angles (`riderLook.ts:7972`), inherited verbatim because both of the
 * owner's M28 rulings are in them — the crossing sits **on the trapezius
 * slope** and never on the loft's top ring (*a band on a loft's top ring is a
 * collar, and a collar reads as a dog harness*), and the run goes **over** the
 * shoulders rather than under the armpits.
 */
export const SEAL_STRAP = Object.freeze({
  chestOuter: -1.00,
  chestInner: -0.76,
  crossingFrom: 0.520,
  crossingTo: 0.536,
  wrapFrom: 0.240,
  wrapTo: 0.286,
  /** The pack's side face, as an angle either side of straight back. */
  packHalfAngle: 0.45,
});

/**
 * The webbing's shade over the shoe black the `gear` role carries, and it is
 * the one **scalar** on a rider whose every other patch is a per-channel tint
 * — which makes it the one hand-picked number in this file, so it is written
 * down as one. `tintOver(sealBoot, sealPack)` is ×0.907, ×0.910 and ×0.973 in
 * the linear space a vertex colour multiplies in — a spread of 0.066, 7.3 % of
 * the smallest of the three — so the channels do *not* agree and no scalar can
 * land the straps on the pack's own black. 0.95 sits the harness **between**
 * the two instead — linear Y 0.0488, against the boot's 0.0514 and the pack's
 * 0.0470 — which is what a strap over a pack should read as: darker than the
 * kit it crosses, no darker than the bag it carries, one harness and one value.
 */
export const SEAL_STRAP_SHADE = 0.95;

// -- Materials ----------------------------------------------------------------

/**
 * The top: the ground, and the **value floor**. A real black garment in sun is
 * a mid-dark grey (`DESIGN.md` §7k finding 1), and on a rider whose whole kit
 * is black that rule is not a nicety — below near-black there is nowhere for
 * any of the other six blacks to go. Red byte 70, ten above the floor
 * `floWithZoGear` states. Matte: a cotton tee, not a shell.
 */
const SEAL_TOP: RiderMaterialSpec = Object.freeze({
  colour: C.sealGear,
  roughness: 0.78,
  metalness: 0,
});

/**
 * The skin, and it is the roster's first fair one. It matters more on him than
 * on anyone: the sleeve hem is high on the upper arm and the glove cuff is
 * short, so the bare forearm and upper arm are the only large warm area
 * anywhere on an all-black rider, and §35.2 calls that a real read cue at
 * chase distance.
 */
const SEAL_SKIN: RiderMaterialSpec = Object.freeze({
  colour: C.sealSkin,
  roughness: 0.66,
  metalness: 0,
});

/**
 * The pads: moulded plastic, a whole stop above the knit, which is the only
 * thing separating the biggest volume on his legs from more trouser
 * (`tuning.ts`, and Wheel in Motion's guard precedent).
 *
 * **The gloss is gone and r1's piece 3 took it** (§E 5). 0.40 with 0.06 of
 * metalness put a near-white band — peak L 198 over 278 px — on shells whose
 * own albedo reads L 14, the brightest thing anywhere on his legs. PHOTO 3
 * rules the opposite way from PHOTO 1's lid: his knee shells are **darker**
 * than the trouser beside them (median 35 against 46) and peak at 140, so
 * there is no highlight on that plastic to reproduce. `FLO_GUARD`'s own pair,
 * because the roster already argued this one out on the last rider's armour.
 */
const SEAL_PAD: RiderMaterialSpec = Object.freeze({
  colour: C.sealPad,
  roughness: 0.55,
  metalness: 0,
});

/**
 * The lid: **a print ground, not a colour.** Every texel of the helmet page
 * multiplies this, and `inkOver` clamps at one, so the ground has to stand at
 * or above the red, the white and the black in every channel — which is why it
 * wears the garment's light grey rather than any of the three colours a player
 * sees on it (`render/sealAtlas.ts`, and the test that holds the relation).
 * Glossier than the cloth: a painted shell.
 */
const SEAL_LID: RiderMaterialSpec = Object.freeze({
  colour: C.sealGarment,
  roughness: 0.38,
  metalness: 0.08,
});

/**
 * The visor: dark cool smoke with the small emissive floor the roster's other
 * full-face lenses carry, so a black aperture is not a hole (M34's r1 finding
 * 1e: a 0.08 lobe on a metal panel rendered the visor at 0.04 × its own shell,
 * where a photograph puts a shield at about half). It is the one deliberate
 * departure from the stills, where the visor is up and his face is visible in
 * all three — the roster is helmeted and a real person's face is the wrong
 * call (§35.2, the brief and the render agreeing against the photographs).
 */
const SEAL_VISOR: RiderMaterialSpec = Object.freeze({
  colour: C.sealVisor,
  roughness: 0.30,
  metalness: 0.34,
  emissive: 0x141a24,
  emissiveIntensity: 0.50,
});

/**
 * The kit black: the shoes (which `render/rider.ts:791` draws in this material
 * whoever is wearing them) and the pack's webbing. Glossier than the tee,
 * which is what a rubberised shoe upper is beside cotton.
 */
const SEAL_KIT: RiderMaterialSpec = Object.freeze({
  colour: C.sealBoot,
  roughness: 0.56,
  metalness: 0,
});

/**
 * The sweatshirt: its own material because it cannot be anything else. It is
 * ten to thirty times lighter than the kit in linear luminance, and a vertex
 * colour is a multiplier — there is no tint from a near-black ground that
 * lands here without a ratio in the tens, which is what `floWithZoGuard`'s
 * precedent says at the other end of the same argument. Very matte: brushed
 * cotton bunched into a knot, the softest surface on the rider.
 */
const SEAL_GARMENT_MATERIAL: RiderMaterialSpec = Object.freeze({
  colour: C.sealGarment,
  roughness: 0.90,
  metalness: 0,
});

/** The pack: the darkest thing he wears, and matte nylon rather than shell. */
const SEAL_PACK_MATERIAL: RiderMaterialSpec = Object.freeze({
  colour: C.sealPack,
  roughness: 0.62,
  metalness: 0,
});

// -- Shades and tints ---------------------------------------------------------

/**
 * The seat's shade is an **address**, not a colour, exactly as `paintWimTorso`
 * and `paintFloTorso` use theirs: the seat loft is merged into the torso mesh
 * carrying this value on every channel, and `paintSealTorso` finds it and
 * repaints it to the trousers' own black. Without that the hips would be the
 * top's value under a hem the references do not have — his trousers run a
 * touch warmer and greyer than his tee, and the seat is the top of them.
 */
export const SEAL_SEAT_SHADE = 0.88;

/**
 * The sole slab's shade, and the same trick: an address the boot painter skips
 * so the slab keeps the gear black while the rand above it is painted yellow.
 * Below 1 because a shoe's sole unit sits in its own shadow all day.
 */
export const SEAL_SOLE_SHADE = 0.86;

/** Unpainted — the material as authored. */
const SEAL_PLAIN: Tint = [1, 1, 1];
/**
 * The top → the trousers. All three channels **at or under one**: the trouser
 * is the top's value a touch warmer and greyer (sRGB 245° against 228°), which
 * is the direction §35.2 reads off the photographs, and it is reached by
 * painting down rather than by a second material.
 */
const SEAL_TROUSER_TINT = tintOver(C.sealGear, C.sealTrouser);
/** The top → the pads, on the legs. A lift, and per channel — see the file header. */
const SEAL_PAD_ON_KIT = tintOver(C.sealGear, C.sealPad);
/** Skin → the short sleeve's black. Down. */
const SEAL_SLEEVE_TINT = tintOver(C.sealSkin, C.sealGear);
/**
 * Skin → the **elbow pad**, and since r3 it lands on the tee's own black
 * rather than on `sealPad` (§E 7).
 *
 * `sealPad` is authored *a whole stop above the knit* for the knee shells,
 * where a black shell lying on a black trouser has nothing else to separate it.
 * The elbow has: it sits on **bare skin**, and §35.2's own words are *"a black
 * elbow pad mid-run"*. r2 measured what the lift was costing — within-frame
 * linear-Y, pad ÷ shirt **2.58** and **2.50** against PHOTO 2's 1.54 and 0.46
 * and PHOTO 3's 0.93 and 0.29, above the whole reference range in every
 * capture, two grey bands the brightest thing on an otherwise black rider.
 * M34 settled the identical finding by moving `FLO_ELBOW_PAD` off the guard
 * material.
 *
 * It is arithmetically `SEAL_SLEEVE_TINT`, because both reach the same key from
 * the same base, and it is named separately because they are different
 * garments and a later edit to one must not silently move the other.
 */
const SEAL_ELBOW_TINT = tintOver(C.sealSkin, C.sealGear);
/** The top → the glove, and the top → the knuckle's red. */
const SEAL_GLOVE_TINT = tintOver(C.sealGear, C.sealGlove);
const SEAL_GLOVE_RED_TINT = tintOver(C.sealGear, C.sealGloveRed);
/**
 * The shoe black → the neon rand. The one large lift on him, and it has to be:
 * a light yellow cannot be reached from a near-black by anything but a
 * per-channel ratio, and the ratio is computed rather than chosen so the rand
 * lands exactly on `sealNeon` and nowhere near it.
 */
const SEAL_NEON_TINT = tintOver(C.sealBoot, C.sealNeon);
/** The shoe black → the lace flash, the white detail PHOTO 2 carries. */
const SEAL_LACE_TINT = tintOver(C.sealBoot, C.sealHelmetWhite);
/**
 * The sweatshirt → the kit's black, for the band's front-right quarter. The
 * one tint on him that runs between two *garment* keys rather than off a limb,
 * and it runs down — see `paintSealBand`.
 */
const SEAL_BAND_SHADOW = tintOver(C.sealGarment, C.sealGear);

// -- Paintwork ----------------------------------------------------------------

/**
 * The torso: the top, and the seat repainted to the trousers.
 *
 * **The seat is read by its shade before any height rule runs**, and that
 * ordering is load-bearing: the seat's top ring stands at y 0.030, *above* the
 * jacket's hem at −0.010, so a band selected by height alone would paint the
 * hip as well as the hem.
 */
function paintSealTorso(geometry: THREE.BufferGeometry): void {
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < colour.count; i += 1) {
    const tint = Math.abs(colour.getX(i) - SEAL_SEAT_SHADE) < 1e-6 ? SEAL_TROUSER_TINT : SEAL_PLAIN;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The tied garment's band: pale on his left and across the front-left where
 * the knot is, his **own black** on the front-right hip.
 *
 * r2's piece 2 measured the shipped band as one light value right round —
 * `rest/knees.png` gives an unbroken pale run **1.22 ×** the black torso's own
 * width below it, where PHOTO 2 gives **0.21** and PHOTO 3 **0.15–0.20** with
 * his right hip plainly black cloth under the tie. A light ring at every angle
 * is a cummerbund, and the word three critics reached for was *belt*.
 *
 * **What is wrong is the value, not the diameter**, and that distinction is
 * r1's: r1 refused *"no wider than the hips in silhouette"* on measurement — a
 * sweatshirt tied round a waist **is** a roll wider than the hips, and this
 * band is the body's own ring × 1.22. So the roll keeps its section and gives
 * up one quarter of its circumference to the kit's black, which is what the
 * stills show: cloth that has been pulled round and does not lie evenly.
 *
 * Addressed on the band's own vertices before the merge, the way
 * `SEAL_SEAT_SHADE` addresses the seat inside the torso's buffer — so the
 * knot, the two sleeves, the left flank and the whole rear are untouched, and
 * the break costs **no draw call, no material and no triangle**. It paints
 * *down*, from the sweatshirt to the kit, so the file's own direction rule is
 * not in play.
 */
export function paintSealBand(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    // The front-right quarter: `z > 0` is ahead of the pelvis and `x < −0.010`
    // is his right (world +X is his left, `AGENTS.md`). The 10 mm inset keeps
    // the break off the centre line, where a seam would read as a join rather
    // than as cloth.
    const dark = position.getZ(i) > 0 && position.getX(i) < -0.010;
    const tint = dark ? SEAL_BAND_SHADOW : SEAL_PLAIN;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The upper arm: the short sleeve's black down to the hem, bare skin under it,
 * and the elbow pad's upper half on the last rings.
 *
 * Three values on one limb, and that is the whole of the arm's read: §35.2's
 * *"bare skin from the sleeve hem to the glove, a black elbow pad mid-run,
 * skin above and below it"*. Painted all the way round rather than on the
 * outboard face — a sleeve and a pad are both tubes.
 */
function paintSealUpperArm(geometry: THREE.BufferGeometry, side: number): void {
  void side;
  const hem = -B.upperArmLength * SEAL_SLEEVE_HEM;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    let tint = SEAL_PLAIN;
    if (y >= hem - 1e-6) tint = SEAL_SLEEVE_TINT;
    else if (y <= SEAL_ELBOW_UPPER + 1e-6) tint = SEAL_ELBOW_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** The forearm: the elbow pad's swell in the pad's value, bare skin below it. */
function paintSealForearm(geometry: THREE.BufferGeometry, side: number): void {
  void side;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const tint = position.getY(i) >= SEAL_ELBOW_BOTTOM - 1e-6 ? SEAL_ELBOW_TINT : SEAL_PLAIN;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The thigh: trousers, and the pad's own value under the shell.
 *
 * **What shows through a knee hinge is the shell** — M22's lesson, and on him
 * the shell is a patch in the `accent` material while the limb is the `body`
 * one, so "the limb under the shell is the shell's value" is only true if this
 * tint targets `sealPad` exactly. It is derived from the same constant the
 * shell's material is, and `sealOnAWheel.test.ts` measures it on both bones
 * and both sides rather than keeping two numbers in step.
 */
function paintSealThigh(geometry: THREE.BufferGeometry, side: number): void {
  void side;
  const shellTop = -B.thighLength * SEAL_SHELL_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const tint = position.getY(i) <= shellTop + 1e-6 ? SEAL_PAD_ON_KIT : SEAL_TROUSER_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** The shin: the shell's value across the hinge and down to its lower edge, then trousers. */
function paintSealShin(geometry: THREE.BufferGeometry, side: number): void {
  void side;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const tint = position.getY(i) >= SEAL_SHELL_BOTTOM - 1e-6 ? SEAL_PAD_ON_KIT : SEAL_TROUSER_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The shoe: a black upper with the **yellow rand above the pedal line**, and
 * the height band is the whole point of it.
 *
 * `paintFloBoot`'s device and its measured lesson (M34 findings 4d and 4b):
 * the pedal plate covers the bottom **24 %** of the boot at every angle the
 * capture tool takes, so an accent authored on the sole's underside — which is
 * where a shoe's sole unit actually is — does not exist on screen at all. The
 * rand runs from 0.26 to 0.42 of the last, clear of the plate at every camera,
 * with the toe cap carrying it forward the way a skate shoe's does. The sole
 * slab keeps its own dark, found by its shade rather than by height because
 * the upper and the slab overlap in `y` once the loft has been stood up.
 */
function paintSealBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(colour.getX(i) - SEAL_SOLE_SHADE) < 1e-6) continue;
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    // **The band's top edge, not its bottom.** r1 wanted 0.20–0.50 and the
    // lower half of that ask is refused here: 0.26 is the pedal line M34
    // measured and a rand that reaches under it is a rand nobody sees. So the
    // band grows upward, and the mid-foot ring above puts vertices inside it.
    const rand = (t >= 0.26 && t <= 0.50) || (t < 0.50 && z > 0.090);
    // One small flash where the laces are: high, central, and the only white
    // on him below the lid. **Measured on the built boot** — r1 found this
    // predicate painting nothing at all, because the loft is stood a quarter
    // turn up before it is painted, so `t` is the boot's height, `z` is its
    // heel-to-toe run and rings exist only at the seven heights the last names.
    //
    // **And the unit is triangle area, not a vertex count** — r3's §E 4, which
    // is the whole of that finding. r2's window took **three** vertices, one
    // per ring, so not a single triangle carried the tint on all three corners:
    // 0.00 % of the boot's area, and what rendered was a gouraud fan around
    // three points — a pale blob with no edge anywhere, which is precisely the
    // *"smooth specular ramp"* a third blind critic reported. A camera sees
    // faces. Two adjacent rings and the centre's own three columns take **six**
    // vertices and **1.15 %** of the area, which is a mark with a boundary.
    //
    // It is bounded at the far end too, and r2's caution is the reason: the
    // same window opened to `z < 0.030` takes the collar's ring as well, walks
    // to 2.55 %, and renders as a shoe with a white top rather than as laces.
    // The footprint is the instep crown only — **65 × 25 mm on a 130 mm-wide
    // last** — because the brightest white on PHOTO 1's shoe is a maker's side
    // stripe, and no mark on him may be a brand's shape.
    const lace = t > 0.86 && z > -0.045 && z < 0.005 && Math.abs(position.getX(i)) < 0.034;
    const tint = lace ? SEAL_LACE_TINT : rand ? SEAL_NEON_TINT : SEAL_PLAIN;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The glove: the kit black, with the red on the **palm and knuckle** side.
 *
 * Real and not invented — §35.2 measures a red section at sRGB 337–341° in two
 * stills and the target render puts one at 354°. It is the lid's own red taken
 * down, so a patch the size of a knuckle does not introduce a tenth red to the
 * table, and it is placed by the vertex's own signed `x`: the knuckles face
 * **outboard**, away from the machine, which is the face a chase camera and a
 * front three-quarter both see.
 *
 * **The window is the knuckle swell and nothing else, and r2's gauntlet is
 * why** (§E 1, the round's BLOCKER). r1 refused the same finding on 22.5 % of
 * the part's *vertices*; r2 measured the rendered hand with the background and
 * the skin excluded by hue and read **35–56 % red** against PHOTO 3's 1 % and
 * 11 % and PHOTO 2's 19 % and 0 %. The old window — `side·x > 0.004` and every
 * ring from the wrist waist to the fingertips — was 21.3 % of the part's
 * triangle area and the whole outboard half of it, which is a red mitt under a
 * black cuff at any distance. `0.020` takes the arc back to the outboard face
 * proper and the two rings at −0.046 and −0.072 are the swell's own, so what
 * is painted is the knuckles and not the hand.
 *
 * **The palm side stays unpainted**, and that half of the finding is refused
 * on the photographs: PHOTO 2's near glove reads 19 % red frontally, so a real
 * one does show red from the front and §35.2's outboard placement stands.
 * Measured by `sealOnAWheel.test.ts` in triangle area, because a camera sees
 * area and the unit is what both rounds turned on.
 */
function paintSealHand(geometry: THREE.BufferGeometry, side: number): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const outboard = side * position.getX(i) > 0.020;
    const red = outboard && y <= -0.046 && y >= -0.072;
    const tint = red ? SEAL_GLOVE_RED_TINT : SEAL_GLOVE_TINT;
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

/** The shell's arc, thigh and shin alike — front and outboard, open at the back. */
const SEAL_SHELL_U0 = -1.90;
const SEAL_SHELL_U1 = 0.88;

/**
 * The upper half of the knee shell, on the **thigh** bone — a guard spans a
 * joint and a mesh cannot, so every millimetre above the knee has to be
 * parented to the bone it is strapped to or it swings off the thigh as the leg
 * bends (`RiderLook.panels.thighPad`).
 *
 * Two patches, one mesh: the long shell down the front of the thigh and the
 * cap that closes over the joint. Both in the pad's own material a stop above
 * the knit, which is the only thing that separates them from the trouser they
 * lie on. `ghostSilhouette` is what keeps them in the replay: 22 mm of relief
 * is shape even in one flat colour, and a black shell on a black leg carries
 * more of this rider's outline than anything else below his waist.
 *
 * **The cap's relief is capped by the hinge, and the bisect that found that is
 * worth keeping.** r3's §E 3 reported a near-black spiked star on the knee
 * shell's face in `technical/legs.png`, and named two candidate patches without
 * separating them. Hiding each mesh in the running game settles it: with both
 * thigh patches hidden the shell renders as one uninterrupted riveted oval —
 * PHOTO 3's own shape — and with the shin shell's lift dropped to zero nothing
 * changes at all. **It is the thigh armour, and it is two faults in one place.**
 * The needle spur was the cap's low edge flung off the loft's closing dome, and
 * `from` fixes that below. The mass was the cap standing 32 mm proud of a thigh
 * that the fold swings through the shin's own shell: at 22 mm most of it goes,
 * and below that the returns stop while the relief keeps paying. What is left
 * at 22 is recorded rather than chased — two rigid guards on one hinge overlap
 * at a deep fold, and buying the last of it costs either the volume §35.2 calls
 * the biggest on his legs or a hinge-aware shell this look does not have.
 */
const SEAL_THIGH_PAD: RiderPanelGroup = group('accent', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: SEAL_SHELL_U0,
    u1: SEAL_SHELL_U1,
    mirrored: true,
    from: -B.thighLength * SEAL_SHELL_TOP,
    to: SEAL_CUP_TOP,
    uSegments: 8,
    vSegments: 4,
    lift: 0.020,
    taper: 0.24,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: SEAL_SHELL_U0,
    u1: SEAL_SHELL_U1,
    mirrored: true,
    // **−0.418: below the last full ring, above the dome's first.** Two bars
    // pull against each other here and the value is where they meet.
    //
    // The floor is M34's: the thigh loft closes hemispherically 36 mm below its
    // last full ring at −0.400, and a cap that stopped at that ring would leave
    // the actual kneecap bare — M34's r2 measured 34 mm of a 73 mm dark band as
    // exactly that. So the cap has to reach onto the dome.
    //
    // The ceiling is r3's §E 3, and it is why **−0.430 was too far**. A patch is
    // offset along the loft's own outward normal; on the closing dome that
    // normal swings downward while the section falls to nothing, so a 32 mm
    // lift applied to a ring 36 mm wide builds a skirt of nearly twice the
    // radius hanging in the air below the knee. Measured on the built mesh, the
    // cap's low edge stood **20.6 mm past the leg's own last vertex** — and
    // `technical/legs.png` showed it at ×12 as a near-black hard-edged wedge
    // with a needle spur on the knee shell's upper edge, breaking the
    // silhouette against the ground. The bisect that named this patch — and the
    // reason its lift is 22 mm and not the authored 32 — is in the group's own
    // block above.
    //
    // The dome's first ring is at **−0.4182**. Starting a millimetre above it
    // puts the cap's low edge back on the limb's last straight section, where
    // the normal is horizontal and a lift is a lift: the built mesh now stops
    // **4.1 mm short of** the leg's close instead of 20.6 mm past it, and the
    // cap still covers the dome from 18 mm below the last full ring — half of
    // the −0.400 M34 rejected. `sealOnAWheel.test.ts` holds both bars.
    from: -0.418,
    to: SEAL_CUP_TOP,
    uSegments: 7,
    vSegments: 2,
    lift: 0.022,
    taper: 0.30,
  }),
]);

/**
 * The lower half, on the **shin** bone: the cap's lip across the hinge and the
 * shell down the front of the shin, with four small rivet dots as the only
 * tonal event on a dead-black leg.
 *
 * The rivets are the target render's invention and §35.2 keeps them on exactly
 * that ground — harmless, and a value break where the photographs give a
 * smooth shell and one hard sun. They are the shell's own patches at a much
 * smaller span and a **shallower stand-off** — 1.5 mm proud of the shell's own
 * 0.022 rather than the 4.0 mm a QA round measured here — so they read as beads
 * on the shell rather than as studs bolted through it. The stand-off may not go
 * below the shell's lift: the shell's outer face is opaque, and a rivet under it
 * is not a dimple, it is gone, and §35.2's sanctioned value break goes with it.
 */
const SEAL_KNEE_PAD: RiderPanelGroup = group('accent', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: SEAL_SHELL_U0,
    u1: SEAL_SHELL_U1,
    mirrored: true,
    from: SEAL_CUP_BOTTOM,
    to: 0.000,
    uSegments: 8,
    vSegments: 1,
    lift: 0.034,
    taper: 0.28,
  }),
  patch({
    anchor: 'front' as PatchAnchor,
    u0: SEAL_SHELL_U0 + 0.06,
    u1: SEAL_SHELL_U1 - 0.06,
    mirrored: true,
    from: SEAL_SHELL_BOTTOM,
    to: SEAL_CUP_BOTTOM,
    uSegments: 8,
    vSegments: 5,
    lift: 0.022,
    taper: 0.38,
    bulge: 0.10,
  }),
  // **Four dots and not two bands** — the first capture round's own reading,
  // and then a QA round's, because the re-cut did not land. At ±0.20 rad they
  // came back as pale straps wrapping the shin, a device the photographs do
  // not have; ±0.075 rad was authored believing it was ~9 mm of shell, and on
  // this squared shin loft it is **~36 mm of arc** — the angular-versus-metric
  // trap `blockoutKit.ts` documents on `uByArc` — so they were still straps,
  // with `taper` pointing their ends into shards that broke the leg's own
  // outboard silhouette. `taper` tapers the band's *height*, never its lift,
  // so a stand-off is uniform all the way to the tip. At **±0.028 rad** the
  // span is ~13 mm against the 14 mm height, which is a dot; at 0.0235 the
  // face stands 1.5 mm off the shell instead of 4.0; and 0.30 takes the ends
  // off the needle. That is the value break §35.2 keeps them for, and nothing
  // a critic can mistake for webbing.
  ...[-0.056, -0.108].flatMap((from) => [-0.135, 0.135].map((centre) => patch({
    anchor: 'outboard' as PatchAnchor,
    u0: centre - 0.028,
    u1: centre + 0.028,
    from,
    to: from + 0.014,
    uSegments: 2,
    vSegments: 1,
    lift: 0.0235,
    taper: 0.30,
    shade: 0.74,
  }))),
]);

/**
 * The pack's straps, and nothing else on the chest: Wheel in Motion's
 * four-patch anatomy with the Drunkard's frozen angles. One non-casting group
 * in the kit black — a strap carries no outline, and the pack extra carries
 * the silhouette.
 *
 * No chest wordmark. The stills show a small white one (§35.2) and the M34
 * ruling on a real person's garment lettering stands: it is not reproduced.
 */
const SEAL_STRAPS: RiderPanelGroup = group('gear', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: SEAL_STRAP.chestOuter,
    u1: SEAL_STRAP.chestInner,
    mirrored: true,
    from: SEAL_STRAP.wrapFrom,
    to: SEAL_STRAP.crossingTo,
    uSegments: 3,
    vSegments: 7,
    lift: 0.010,
    shade: SEAL_STRAP_SHADE,
  }),
  patch({
    anchor: 'outboard' as PatchAnchor,
    u0: -Math.PI / 2 + SEAL_STRAP.packHalfAngle,
    u1: Math.PI / 2 + SEAL_STRAP.chestOuter,
    mirrored: true,
    from: SEAL_STRAP.wrapFrom,
    to: SEAL_STRAP.wrapTo,
    uSegments: 8,
    vSegments: 1,
    lift: 0.010,
    shade: SEAL_STRAP_SHADE,
  }),
  patch({
    anchor: 'back' as PatchAnchor,
    u0: 0.30,
    u1: 0.54,
    mirrored: true,
    from: 0.400,
    to: SEAL_STRAP.crossingTo,
    uSegments: 3,
    vSegments: 4,
    lift: 0.010,
    shade: SEAL_STRAP_SHADE,
  }),
  patch({
    anchor: 'outboard' as PatchAnchor,
    u0: -Math.PI / 2 + 0.54,
    u1: Math.PI / 2 + SEAL_STRAP.chestOuter,
    mirrored: true,
    from: SEAL_STRAP.crossingFrom,
    to: SEAL_STRAP.crossingTo,
    uSegments: 8,
    vSegments: 1,
    lift: 0.010,
    shade: SEAL_STRAP_SHADE,
  }),
]);

/**
 * The lid's one merged feature: a base rim, so the shell ends somewhere
 * instead of dissolving into the collar.
 *
 * **Dark and barely proud** — M34's r1 measured a light rim's wall throwing a
 * specular line 2.7 × the shell either side of it, reading as a collar ring.
 * It wears the sheet's own `rim` page rather than the helmet's, because a
 * merged head feature with no page of its own wears the shell's print across
 * itself (`DESIGN.md` §7m) — and on a printing ground an unpaged one would be
 * a white band under the chin.
 */
export const SEAL_RIM_TOP = 0.070;

const SEAL_HEAD_PANELS: readonly RiderPatch[] = Object.freeze([
  patch({
    anchor: 'front' as PatchAnchor,
    u0: 0,
    u1: Math.PI * 2,
    from: 0.058,
    to: SEAL_RIM_TOP,
    uSegments: 18,
    vSegments: 1,
    lift: 0.002,
    art: 'rim',
  }),
]);

/**
 * The visor: one patch, sunk into the shell and lifted only a little, so it
 * reads as glass in a recess rather than as a bar stuck on.
 *
 * ±1.20 rad, wrapping 138° of the head — the roster's wide full-face aperture,
 * because the brief's *"visor opening dark / shadowed"* is what stands in for
 * a face here. Its split down the shell **was** the one the last rider's two
 * gauntlet rounds converged on (brow 50 %, shield 34 %, jaw 12 %, rim 4 %) and
 * his own gauntlet moved it: that column belongs to a rider photographed on a
 * road lid, and PHOTO 2 puts a third of *this* shell below the aperture. It is
 * now **brow 45 %, shield 30 %, shell-coloured jaw 21 %, rim 4 %**. `bulge` is
 * what makes it an eyeport rather than a television (a constant-`v` span is a
 * pair of horizontal rings by construction), and `taper` closes it toward each
 * hinge.
 */
export const SEAL_VISOR_HALF_SPAN = 1.20;
/**
 * **Both edges moved up 26 and 13 mm in r2**, which is the other half of the
 * chin bar: a jaw that leads in `z` and still starts 104 mm up a 288 mm shell
 * is a full-face shape wearing an open-face aperture. The split is now brow
 * 45.1 %, port 29.9 %, jaw 25.0 %, against the 49.7 / 34.4 / 16.0 M34's road
 * lid handed over and PHOTO 2's own 36.1 / 28.6 / 35.3.
 */
export const SEAL_VISOR_FROM = 0.130;
export const SEAL_VISOR_TO = 0.216;

const SEAL_FACE: RiderPanelGroup = group('face', [
  patch({
    anchor: 'front' as PatchAnchor,
    u0: -SEAL_VISOR_HALF_SPAN,
    u1: SEAL_VISOR_HALF_SPAN,
    from: SEAL_VISOR_FROM,
    to: SEAL_VISOR_TO,
    uSegments: 16,
    vSegments: 5,
    lift: 0.006,
    sink: -0.014,
    taper: 0.26,
    bulge: 0.20,
    shade: 1,
  }),
]);

// -- The sheet ----------------------------------------------------------------

/** What `sealAtlas.ts` needs to know about the body it prints on. */
export const SEAL_SHEET_LAYOUT: SealSheetLayout = Object.freeze({
  head: SEAL_HELMET,
  visor: Object.freeze({
    halfSpan: SEAL_VISOR_HALF_SPAN,
    from: SEAL_VISOR_FROM,
    to: SEAL_VISOR_TO,
  }),
  rimTop: SEAL_RIM_TOP,
});

// -- The look -----------------------------------------------------------------

export const SEAL_ON_A_WHEEL_LOOK: RiderLook = Object.freeze({
  id: 'seal-on-a-wheel',
  // Wheel in Motion's densities: the lid is printed and its silhouette is what
  // the chase camera looks at, and a torso that curves two ways carries the
  // garment's band round it. Triangles are the free axis.
  // The boot is his own and it is r2's: the yellow rand is a **band** across a
  // last whose rings run heel to toe, so how cleanly it reads is a question of
  // how many points the section is sampled at, not of where the band is. At
  // the roster's 12 the transition ate the band's own edges and r1 called it a
  // gradient (§E 10). 16 is 128 triangles across both feet and no draw call.
  density: Object.freeze({ limb: 18, torso: 30, head: 32, boot: 16, hand: 18 }),
  /**
   * His sheet, and **one role samples it**. Only the lid is printed; every
   * other surface on him is a field a vertex colour can hold, so mapping the
   * body would put a texture lookup on the whole rider for nothing and would
   * make a bug in the atlas capable of reaching his trousers.
   */
  atlas: Object.freeze({
    build: () => createSealAtlas(SEAL_SHEET_LAYOUT),
    roles: Object.freeze(['head'] as RiderMaterialRole[]),
    region: (art: string | undefined): UvRect => (
      art !== undefined && art in SEAL_REGIONS ? SEAL_REGIONS[art as SealRegionName] : SEAL_REGIONS.blank
    ),
    lofts: Object.freeze({ head: 'helmet' }),
  }),
  materials: Object.freeze({
    body: SEAL_TOP,
    limbs: SEAL_SKIN,
    accent: SEAL_PAD,
    head: SEAL_LID,
    face: SEAL_VISOR,
    gear: SEAL_KIT,
  }),
  profiles: Object.freeze({
    torso: SEAL_JERSEY,
    seat: SEAL_SEAT,
    thigh: SEAL_THIGH,
    shin: SEAL_SHIN,
    upperArm: SEAL_UPPER_ARM,
    forearm: SEAL_FOREARM,
    neck: SEAL_NECK,
    head: SEAL_HELMET,
    boot: SEAL_BOOT,
    bootSole: SEAL_BOOT_SOLE,
    hand: SEAL_GLOVE,
  }),
  // `seat` and `sole` are addresses the painters read, not values that ship;
  // `legs` at 1 because the legs' base is the top's black and every colour on
  // them is paint; the neck at 0.55 because it is skin in the lid's own shade.
  shades: Object.freeze({
    seat: SEAL_SEAT_SHADE,
    legs: 1.0,
    collar: 1.0,
    sole: SEAL_SOLE_SHADE,
    neck: 0.55,
  }),
  parts: Object.freeze({
    // The hands ride the **body** material so the glove can be painted down to
    // its own black and the knuckle's red reached as a per-channel tint from
    // one base; a glove in the gear black would have to paint *up* to reach
    // either, which is the direction this rider does not have.
    hands: 'body' as RiderMaterialRole,
    // The neck is bare skin, like the arms — the one part of him above the
    // collar that is not helmet.
    neck: 'limbs' as RiderMaterialRole,
    // Read nowhere by the rig (the group's own `role` paints it), stated for
    // the reader: his shells are the pad material.
    kneePad: 'accent' as RiderMaterialRole,
    // The trousers are the top's material painted down, not the skin's: his
    // legs are cloth and his arms are not, and one material cannot be both.
    legs: 'body' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // No collar patch and no shoulder group: a crew-neck tee, and the loft's
    // own cap closes the neck. The straps are the torso group.
    torso: SEAL_STRAPS,
    thighPad: Object.freeze({ ...SEAL_THIGH_PAD, ghostSilhouette: true }),
    kneePad: Object.freeze({ ...SEAL_KNEE_PAD, ghostSilhouette: true }),
    head: SEAL_HEAD_PANELS,
    face: SEAL_FACE,
  }),
  build: Object.freeze({ hand: Object.freeze([sealThumb]) }),
  extras: Object.freeze([
    // The sweatshirt. Casting, and that is the point of it: it is the only
    // thing that changes the outline of an all-black figure, so a replay or a
    // shadow without it is a different rider.
    Object.freeze({
      name: 'rider-seal-garment',
      joint: 'pelvis' as const,
      role: 'body' as RiderMaterialRole,
      material: SEAL_GARMENT_MATERIAL,
      casts: true,
      build: sealGarment,
    }),
    // The pack. Casting for the same reason, and a volume rather than the
    // two lifted patches Wheel in Motion's is: a patch offsets a surface by a
    // constant, so it is as proud at its edge as at its centre — a slab with
    // a rim, which the owner once correctly called a backpack when it was
    // meant to be armour (`DESIGN.md` §7k finding 4).
    Object.freeze({
      name: 'rider-seal-pack',
      joint: 'pelvis' as const,
      role: 'gear' as RiderMaterialRole,
      material: SEAL_PACK_MATERIAL,
      casts: true,
      build: sealPack,
    }),
  ]),
  paint: Object.freeze({
    torso: paintSealTorso,
    upperArm: paintSealUpperArm,
    forearm: paintSealForearm,
    thigh: paintSealThigh,
    shin: paintSealShin,
    boot: paintSealBoot,
    hand: paintSealHand,
  }),
  // The stills show an upright, relaxed carriage with the arms low; the rig's
  // own reactions carry the rest. The splay is Wheel in Motion's, so the bare
  // forearms clear the flank and the tied garment's band beside it.
  armCarriage: Object.freeze({ splay: 0.014, rise: 0 }),
});
