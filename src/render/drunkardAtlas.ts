/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { loftNormal, loftPoint, type LoftProfile, type UvRect } from './blockoutKit.ts';
import {
  inkField,
  inkOver,
  inkPolygon,
  inkRect,
  inkSheet,
  inkStroke,
  linearFromHex,
  mixRgb,
  toSrgbBytes,
  type InkPoint,
  type InkSheet,
  type Rgb,
} from './inkKit.ts';

/**
 * The Drunkard's printed sheet — M29 Phase 2 (`docs/PLANS.md` §29.5).
 *
 * **The third sheet in the game, and the first on which nothing is a
 * raster.** Wheel in Motion's sheet (`render/wimAtlas.ts`) prints a garment
 * and stamps one file onto it; this one prints a garment, a hat, two cans, a
 * pack and a pair of knee pads, and every mark on it is arithmetic — the hop
 * cone is `paintHop`, eleven overlapping bracts on a stem drawn as shapes, and
 * his wheel's sheet (Phase 3) imports it so one drawing is the one drawing.
 * No `fillText`, no font, no `Math.random` (invariant 12): the foam drips by a
 * deterministic hash and the sheet is the same on every machine.
 *
 * **The ground is cream, and everything else is ink on it.** A texel can only
 * darken (`inkOver`), so the one colour on him that is lighter than every
 * other in every channel — the foam — is the print ground
 * (`BLOCKOUT_COLOURS.drunkardPrint`) left unpainted, and the amber, the brown
 * and the hop green hang from it. Where a page is a *field* rather than a
 * decal (the hat's foam edge, the can's top band, the pack's foam line) the
 * cream is simply where the ink stops.
 *
 * **A page over a loft is measured in the loft's own space** (M28's rule): a
 * loft's `v` is ring-index space, so every wrapped field below is authored in
 * metres and converted through the profile it lands on
 * (`DrunkardSheetLayout`). The kit page is the one exception — it is worn by
 * an extra whose pieces (two cans, a peak, three tubes) each fold their own
 * square onto a *sub-rectangle* of it before the rig folds the whole
 * geometry onto the page, so its layout is stated in page units
 * (`KIT_LABEL`, `KIT_PEAK`, `KIT_PLAIN`).
 */

export const ATLAS_SIZE = 1024;

/**
 * Where each page sits, in sheet pixels. Sheet `y` grows the way a loft's `v`
 * grows — up the body — so art authored with a larger `y` sits higher on him.
 */
const PIXEL_REGIONS = {
  /** The whole torso, wrapped: `x` runs from his left round the front to the back and home. */
  jersey: { x0: 0, y0: 0, x1: 1024, y1: 512 },
  /** An upper arm, wrapped, shoulder at the top: an ivory sleeve with an amber wedge down the back of the deltoid. */
  sleeve: { x0: 0, y0: 512, x1: 512, y1: 768 },
  /** A forearm, wrapped, elbow at the top: ivory, a hop-green cuff at the wrist. */
  forearm: { x0: 512, y0: 512, x1: 1024, y1: 768 },
  /** The hat shell, wrapped: amber, the foam mound dripping unevenly, the brim band. */
  hat: { x0: 0, y0: 768, x1: 512, y1: 1024 },
  /** The hat kit's page: the can label as a wrapped band, the peak's two rows, a plain strip for the tubes. */
  kit: { x0: 512, y0: 768, x1: 768, y1: 1024 },
  /** The pack, wrapped: a brown box with the liquid window on its outward face, and the vessel above it — liquid, foam, cap — all round. */
  pack: { x0: 768, y0: 768, x1: 1024, y1: 896 },
  /** A knee pad: brown, with the hop cone. */
  knee: { x0: 768, y0: 896, x1: 896, y1: 1024 },
  /**
   * The can in his fist, wrapped (gauntlet round 2): the label's bands, the
   * foam edge dripping into the amber, the hop cone on the face the cameras
   * see. 128 texels for a 207 mm circumference is the sheet's one free
   * block; `handCanPageS` gives the visible half of it three quarters of
   * the width so the cone lands on 24 texels rather than 16.
   */
  handCan: { x0: 896, y0: 896, x1: 1024, y1: 1000 },
  /**
   * Neutral. Anything mapped here renders exactly as its vertex colours say —
   * his legs, his seat, his gloves, and every part that carries paint rather
   * than print. 32 × 16, an 8-row gutter under the hand can's page.
   */
  blank: { x0: 992, y0: 1008, x1: 1024, y1: 1024 },
} as const;

export type DrunkardRegionName = keyof typeof PIXEL_REGIONS;

/**
 * How far in from a page's left and right edges its texture coordinates
 * start, in texels — the mip-bleed lesson from Wheel in Motion's lid, whose
 * half-texel inset drew a dotted arc of its neighbour's white down the seam
 * at 2 px. 4.5 texels stays inside the page through mip 3. The jersey keeps
 * the half texel because its page must be continuous across the seam at his
 * left flank, and its neighbour there is itself.
 */
const EDGE_INSET: Readonly<Partial<Record<DrunkardRegionName, number>>> = Object.freeze({
  sleeve: 4.5, forearm: 4.5, hat: 4.5, kit: 4.5, pack: 4.5, knee: 4.5, handCan: 4.5,
});

/** The same table in texture coordinates, inset from each edge as above (half a texel up and down). */
export const DRUNKARD_REGIONS: Readonly<Record<DrunkardRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => {
      const inset = EDGE_INSET[name as DrunkardRegionName] ?? 0.5;
      return [name, Object.freeze({
        u0: (box.x0 + inset) / ATLAS_SIZE,
        v0: (box.y0 + 0.5) / ATLAS_SIZE,
        u1: (box.x1 - inset) / ATLAS_SIZE,
        v1: (box.y1 - 0.5) / ATLAS_SIZE,
      })];
    }),
  ),
) as Readonly<Record<DrunkardRegionName, UvRect>>;

/** A sub-rectangle of a page, in the page's own unit square. */
export interface PageRect {
  readonly s0: number;
  readonly t0: number;
  readonly s1: number;
  readonly t1: number;
}

/**
 * The kit page's sub-rectangles. An extra is folded onto one page as a whole,
 * so its pieces pre-fold their own squares onto these before the merge; the
 * margins between them are what keeps a can's label off the peak's dark row
 * at mip 2. The label wraps (`s` 0 → 1 round the can), so it takes the page's
 * full width and its own inset is the page's.
 */
export const KIT_LABEL: PageRect = Object.freeze({ s0: 0, t0: 0.58, s1: 1, t1: 0.94 });
export const KIT_PEAK: PageRect = Object.freeze({ s0: 0.10, t0: 0.30, s1: 0.90, t1: 0.44 });
/** The peak's amber row alone: what the cans' retaining straps wear (round 2), so a strap is amber without a tint. */
export const KIT_STRAP: PageRect = Object.freeze({ s0: 0.12, t0: 0.385, s1: 0.88, t1: 0.425 });
export const KIT_PLAIN: PageRect = Object.freeze({ s0: 0.10, t0: 0.06, s1: 0.90, t1: 0.20 });

/**
 * The pack window: `s` round the pack from the rider's left (0.75 is the face
 * that looks *backward*, at the chase camera), and its top and bottom in
 * metres of the pack's own frame, converted through the pack's rings.
 */
export const PACK_WINDOW = Object.freeze({ s0: 0.63, s1: 0.87, bottom: 0.205, top: 0.446 });
/**
 * The beer band, all round: from the first ring through the window to the
 * box's top ring, the liquid runs the whole way round with the foam under
 * the lid, so the beer reads from every angle; the window below is the
 * same liquid seen through the box's face, and the two meet with no frame
 * between them.
 *
 * The band's top is the box's top ring — `DRUNKARD_BOX_TOP` in
 * `riderLook.ts`, and `drunkard.test.ts` pins the two equal. Gauntlet
 * rounds 1–3 ran the band up a pint standing over the box, with a 54 mm
 * brown lid over the foam so the head did not read as a collar; the pint
 * stood inside the head's reachable arc and is gone (Codex's QA after
 * Phase 2), so the lid is the box's own 16 mm close, in the printed brown
 * above this height, and the column is 191 mm (0.255–0.446) under it.
 */
export const PACK_BAND = Object.freeze({ bottom: 0.255, top: 0.446 });
/**
 * The foam head on the pack, metres down from the band's top — a head plus
 * tongues (gauntlet round 2). Round 1's head was a share of a 105 mm band:
 * 22–31 mm, 6 px at chase against the target's head of ~25 % of its vessel,
 * and its 8.5 mm of drip was smaller than the page's row quantum there. Now
 * the band runs the box's height too (`PACK_BAND.bottom` is the first ring
 * through the window, so the beer is all round rather than a rear window
 * — from the side the pack was a brown tank), the head is 55 mm plus up to
 * 40 mm of tongue: 20–35 % of the 275 mm column, 10–18 px at chase.
 */
export const PACK_FOAM_HEAD = 0.055;
export const PACK_FOAM_DRIP = 0.040;
/**
 * A plain strip on the pack page, left as the ground, that the hose and the
 * bite valve wear (tinted amber and gear-brown by vertex colour). It sits on
 * the face of the pack that lies against his back — `s` 0.25 — which is
 * buried in the torso and never seen, so the page gives up nothing visible.
 */
export const PACK_PLAIN: PageRect = Object.freeze({ s0: 0.14, t0: 0.319, s1: 0.36, t1: 0.487 });

/**
 * What the sheet needs to know about the bodies it will be folded onto: the
 * profiles, because a loft's texture row is a ring index and every field is
 * authored in metres; the hop cone's placement on the chest; and the two
 * things the kit page is scaled against.
 */
export interface DrunkardSheetLayout {
  readonly torso: LoftProfile;
  readonly upperArm: LoftProfile;
  readonly forearm: LoftProfile;
  readonly shin: LoftProfile;
  /** The hat shell: its page wraps the shell, rim to crown. */
  readonly hat: LoftProfile;
  /** The hop cone on the chest: its width across the chest, metres, and the height of its centre. */
  readonly chestHop: { readonly width: number; readonly centre: number };
  /** The knee pad patch: its angular span (radians) and height span (metres) on the shin. */
  readonly kneePad: PatchSpan;
  /** A hat can, in its own frame (`y` 0 at its bottom): what the label band wraps. */
  readonly can: LoftProfile;
  /** The can in his fist, in its own frame (`y` 0 at its base): what its page wraps, and its label's bands in metres. */
  readonly handCan: LoftProfile;
  readonly handCanBands: { readonly rim: number; readonly line: number; readonly drip: number };
  /** The pack loft: what its page wraps. */
  readonly pack: LoftProfile;
}

/**
 * The hand can's page runs round the can unevenly (round 2): the half of
 * the circumference the cameras see — from the outboard face round the
 * front to the inboard face, `u01` 0 → 0.5 in the loft's own frame — takes
 * three quarters of the page's width, and the half in the fist takes the
 * rest. `handCanPageS` maps a vertex's loft angle to its page column and
 * `handCanAngle01` is its inverse, for the painter.
 */
export const HAND_CAN_FACE_SHARE = 0.75;
export function handCanPageS(u01: number): number {
  return u01 <= 0.5
    ? u01 * 2 * HAND_CAN_FACE_SHARE
    : HAND_CAN_FACE_SHARE + (u01 - 0.5) * 2 * (1 - HAND_CAN_FACE_SHARE);
}
export function handCanAngle01(s: number): number {
  return s <= HAND_CAN_FACE_SHARE
    ? (s / HAND_CAN_FACE_SHARE) * 0.5
    : 0.5 + ((s - HAND_CAN_FACE_SHARE) / (1 - HAND_CAN_FACE_SHARE)) * 0.5;
}

export interface PatchSpan {
  readonly u0: number;
  readonly u1: number;
  readonly from: number;
  readonly to: number;
  /** How far the patch stands off the body it lies on — the surface its art is measured on (`patchStretch`). */
  readonly lift?: number;
}

// -- The inks ----------------------------------------------------------------
//
// Every colour on the sheet is a multiplier over the print ground, authored as
// "what the player should see" — `inkOver` computes the multiplier that lands
// there, so no ratio is restated by hand.

const PRINT = linearFromHex(BLOCKOUT_COLOURS.drunkardPrint);

const CLEAR: Rgb = [1, 1, 1];
/**
 * The garment's cream: a stop warmer than the foam, which keeps the bare
 * ground (gauntlet round 1 — one cream for cloth and foam read as one white
 * beside the hat's foam). The yoke, the flank panels, the sleeves, the
 * buckle plate.
 */
const IVORY = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardIvory));
const AMBER = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardAmber));
/** The amber a step down: the brim band, the peak's underside, the shadow under a foam edge. */
const AMBER_DEEP = mixRgb(AMBER, inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown)), 0.28);
const BROWN = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown));
/** The window's frame and the belt's stitching: the brown one step up, still under the amber. The vessel's lid is `BROWN` itself since round 3 (`PACK_BAND`). */
const BROWN_LIGHT = mixRgb(BROWN, AMBER, 0.22);
/**
 * The beer in the pack: the garment's amber pulled 45 % toward the brown,
 * because the reservoir and the jersey were the identical ink and rendered
 * five levels apart — a brown-framed amber rectangle on an amber torso
 * (gauntlet round 1). The target keeps its liquid ~60 levels under its suit.
 */
const PACK_LIQUID = mixRgb(AMBER, BROWN, 0.45);
/** The shadow the foam throws on the liquid, and the liquid's own lower depths. */
const PACK_LIQUID_SHADE = mixRgb(PACK_LIQUID, BROWN, 0.28);
/**
 * A bubble in the liquid: the liquid lifted a sixth of the way toward the
 * ground — at 0.38 the first recapture showed cream splats on the vessel.
 */
const PACK_BUBBLE = mixRgb(PACK_LIQUID, CLEAR, 0.16);
const HOP = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardHop));
/** The stem. */
const HOP_DEEP = inkOver(PRINT, linearFromHex(0x3b6a1a));
/**
 * The bract's outline: a near-black brown at 3.5:1 against the fill — the
 * target's drawn outline measures 3.6:1; the first cut's `HOP_DEEP` edge
 * was 1.5:1 and sub-texel on the chest, which is why eleven eggs read as
 * grapes (gauntlet round 1).
 */
const HOP_EDGE = inkOver(PRINT, linearFromHex(0x2b1c0d));
/** The vein highlight down a bract. */
const HOP_PALE = inkOver(PRINT, linearFromHex(0x8fc44e));

/** `height / width` of the hop cone as `paintHop` draws it. */
export const HOP_ASPECT = 1.35;

// -- A deterministic hash ------------------------------------------------------

/**
 * One value in [0, 1) per integer, the same on every machine — the foam
 * drips and the label's drips are placed by this rather than by a random
 * source (invariant 12). Mulberry32's mixing step, unrolled for one draw.
 */
function hash01(index: number): number {
  let t = (index * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * How far a foam edge has dripped down at `s` round a wrapped surface, as a
 * fraction of `depth`: a soft wave plus a handful of hashed drips, each a
 * Gaussian tongue with its own centre, width and length. Wrapped, so the
 * edge is continuous across the page's seam.
 */
function drips(s: number, count: number, seed: number, widthScale = 1): number {
  let fall = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 3 + 1.3));
  for (let i = 0; i < count; i += 1) {
    const centre = hash01(seed + i * 3);
    const width = (0.012 + 0.020 * hash01(seed + i * 3 + 1)) * widthScale;
    const length = 0.35 + 0.65 * hash01(seed + i * 3 + 2);
    const away = Math.abs(s - centre);
    const gap = Math.min(away, 1 - away);
    fall = Math.max(fall, length * Math.exp(-((gap / width) ** 2)));
  }
  return fall;
}

// -- The hop cone -------------------------------------------------------------

/**
 * An original hop cone: nine overlapping bracts on a stem, drawn as shapes.
 *
 * **Shared with his wheel's sheet, which imports it, so the cone on the
 * chest, the knees, the cans and the pads is one drawing.** `x`, `y` is the
 * cone's centre in sheet pixels and `size` its width; the height is
 * `size × HOP_ASPECT × stretch`, where `stretch` is the page's pixels-up per
 * pixel-across at that spot (1 on a square page), so the cone keeps its
 * proportions on a curved chest the way Wheel in Motion's mark does. The
 * stem is at the *top* — sheet `y` grows up the body — and the cone hangs
 * from it, tip down, the way a hop hangs from the bine.
 *
 * Two rings of bracts round a centre one, drawn top row first so each lower
 * row shingles over the one above it, which is what makes it a cone rather
 * than a pile of leaves. Every bract is a *lens* — pointed at both ends,
 * wider than it is tall, a dark outline round it and a single vein up it.
 * The first cut drew eleven rounded eggs, each with its own outline and a
 * pale centre spot, and at the chest's 24 texels that read as a bunch of
 * grapes (gauntlet round 1). No text, no real brewery's device, nothing but
 * the plant.
 */
export function paintHop(sheet: InkSheet, x: number, y: number, size: number, stretch = 1): void {
  const height = size * HOP_ASPECT * stretch;
  const top = y + height / 2;
  // The stem: a short dark stroke rising from the top bracts.
  inkStroke(
    sheet,
    [[x, top - height * 0.04], [x + size * 0.06, top + height * 0.10]],
    Math.max(1.5, size * 0.07),
    HOP_DEEP,
  );
  // A lens: the tip's half-angle is 34°, and the widest point is just above
  // the middle, so the bract reads as a scale rather than a berry.
  const LEAF: readonly InkPoint[] = [
    [0, -1], [0.30, -0.56], [0.62, 0.05], [0.40, 0.60], [0, 1],
    [-0.40, 0.60], [-0.62, 0.05], [-0.30, -0.56],
  ];
  const bract = (cx: number, cy: number, w: number, h: number): void => {
    const shape = (scale: number): InkPoint[] => (
      LEAF.map(([lx, ly]): InkPoint => [cx + lx * (w / 2) * scale, cy + ly * (h / 2) * scale])
    );
    // The outline: 1.42× the fill, which is 5–9 % of the mark's width at
    // the chest's budget — the target's measured outline share.
    inkPolygon(sheet, shape(1.42), HOP_EDGE, 1, 1.4);
    inkPolygon(sheet, shape(1), HOP, 1, 1.2);
    // The vein: one thin stroke up the bract's axis, not a spot.
    inkStroke(sheet, [[cx, cy - h * 0.34], [cx, cy + h * 0.30]], Math.max(1, w * 0.10), HOP_PALE, 0.75, 1.2);
  };
  const rows: readonly { readonly t: number; readonly offsets: readonly number[]; readonly scale: number }[] = [
    { t: 0.20, offsets: [-0.26, 0.26], scale: 0.95 },
    { t: 0.42, offsets: [-0.36, 0.36], scale: 1.05 },
    { t: 0.50, offsets: [0], scale: 1.45 },
    { t: 0.68, offsets: [-0.30, 0.30], scale: 1.0 },
    { t: 0.86, offsets: [-0.13, 0.13], scale: 0.85 },
  ];
  for (const row of rows) {
    for (const offset of row.offsets) {
      bract(x + offset * size, top - row.t * height, size * 0.60 * row.scale, height * 0.28 * row.scale);
    }
  }
}

// -- Surface metrics ----------------------------------------------------------

/** Distance along the surface from `u0` to `u1` at a ring-index height, `lift` metres out along the normal. */
function arcAcross(profile: LoftProfile, v: number, u0: number, u1: number, lift = 0): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  const steps = 96;
  let length = 0;
  const at = (u: number, out: THREE.Vector3): void => {
    loftPoint(profile, u, v, out);
    if (lift !== 0) out.addScaledVector(loftNormal(profile, u, v, n), lift);
  };
  at(u0, a);
  for (let i = 1; i <= steps; i += 1) {
    at(u0 + (u1 - u0) * (i / steps), b);
    length += a.distanceTo(b);
    a.copy(b);
  }
  return length;
}

/** The ring-index `v` of a height, the inverse `heightOf` is built from. */
function vOfHeight(rings: readonly number[], y: number): number {
  const last = rings.length - 1;
  if (y <= rings[0]!) return 0;
  if (y >= rings[last]!) return last;
  for (let i = 1; i <= last; i += 1) {
    if (y <= rings[i]!) return i - 1 + (y - rings[i - 1]!) / (rings[i]! - rings[i - 1]!);
  }
  return last;
}

/** Metres up the body per unit of a page's `t`, at a height. */
function metresPerT(rings: readonly number[], y: number): number {
  const last = rings.length - 1;
  const v = Math.min(last - 1e-6, Math.max(0, vOfHeight(rings, y)));
  const i = Math.floor(v);
  return (rings[i + 1]! - rings[i]!) * last;
}

/**
 * How many page pixels up a page pixel across is worth on a patch.
 *
 * Measured on the surface the patch *occupies*, not on the bare profile
 * (gauntlet round 3): the knee pad stands `lift` off the shin, and 22 mm of
 * lift on a ~70 mm shin grew its arc across from 81 to 103 mm while the
 * bare-loft arithmetic still said 81 — so the cone was drawn 1.24× too
 * squat and read as a raft of bracts. The arc is walked on the profile
 * offset along its normal by the lift — the outer face `patchGeometry`
 * builds. Growing each ring by the lift instead is not a parallel offset on
 * this square-2.4 shin: it read 108 mm where the face is 103. And the
 * page's *inset* column span is what the `u` axis actually covers: the knee
 * page insets 4.5 texels a side, so `u` runs 119 columns where `v` runs 127
 * rows.
 */
function patchStretch(
  profile: LoftProfile,
  span: PatchSpan,
  page: { x0: number; y0: number; x1: number; y1: number },
  inset: number,
  anchor = Math.PI / 2,
): number {
  const rings = profile.map((ring) => ring.y);
  const mid = (span.from + span.to) / 2;
  const across = arcAcross(profile, vOfHeight(rings, mid), anchor + span.u0, anchor + span.u1, span.lift ?? 0);
  const up = Math.abs(span.to - span.from);
  return (across / up) * ((page.y1 - page.y0 - 1) / (page.x1 - page.x0 - 2 * inset));
}

/**
 * How much of a texel lies above a foam edge, as coverage over the edge's
 * signed distance in metres, feathered by the texel's own span (gauntlet
 * round 3). A field that answered hard cream-or-amber per texel could only
 * put its boundary *on* a texel row: the pack's 36 mm of drip was seven
 * treads of GPU bilinear, 3–4 px risers in the close captures, and every
 * bubble a stack of one-row runs. With the 50 % crossing free to land
 * anywhere inside a texel, the filter reconstructs a curve.
 */
function foamCover(y: number, edge: number, feather: number): number {
  return Math.min(1, Math.max(0, 0.5 + (y - edge) / Math.max(1e-6, feather)));
}

/**
 * A page that wraps a loft, painted in metres: the shader is handed `s` right
 * round the body from the rider's left, the height in metres, and the
 * texel's span in metres — the larger of its row and its column at that
 * height, which is the feather an edge needs to be reconstructed rather
 * than quantised (`foamCover`).
 */
function paintWrapped(
  sheet: InkSheet,
  box: { x0: number; y0: number; x1: number; y1: number },
  profile: LoftProfile,
  shade: (s: number, y: number, texel: number) => Rgb,
): void {
  const rings = profile.map((ring) => ring.y);
  const last = rings.length - 1;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const heightOf = (t: number): number => {
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    return rings[i]! + (rings[i + 1]! - rings[i]!) * (v - i);
  };
  /** A column's metres at a row: the section's mean radius round, over the page's width. */
  const columnMetres = (t: number): number => {
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    const f = v - i;
    const a = profile[i]!;
    const b = profile[i + 1]!;
    const radius = ((a.halfWidth + a.halfDepth) / 2) * (1 - f) + ((b.halfWidth + b.halfDepth) / 2) * f;
    return (Math.PI * 2 * radius) / width;
  };
  inkField(sheet, box, (x, y) => {
    const s = (x - box.x0) / width;
    const t = (y - box.y0) / height;
    const rowMetres = Math.abs(heightOf(t + 1 / height) - heightOf(t));
    return [shade(s, heightOf(t), Math.max(rowMetres, columnMetres(t))), 1];
  });
}

/** How much of the front a point is on: 1 across the chest, 0 on the back, ramping through the flanks. */
function frontness(s: number): number {
  const toFront = Math.min(Math.abs(s - 0.25), Math.abs(s + 0.75));
  return Math.min(1, Math.max(0, (0.21 - toFront) / 0.06));
}

// -- The jersey ---------------------------------------------------------------

/** Where the jersey's fields start and stop, metres above the hip — shared with the look's straps and the tests. */
export const JERSEY_BELT = Object.freeze({ bottom: 0.030, top: 0.078 });
export const JERSEY_YOKE = 0.445;
/** The height at which the amber centre panel is narrowest — the pecs; below it the gold widens to own the belly. */
export const JERSEY_BIB = 0.360;
/** The amber centre panel between the straps at its narrowest, as a half-span in `s` (0.075 × the circumference ≈ 68 mm). */
export const JERSEY_PANEL_HALF = 0.075;
/** How much wider the centre panel's half-span is at the belt than at the bib height, in `s`. */
export const JERSEY_PANEL_SPREAD = 0.085;
/** The flank panels' outer edge, in `s` off the front — the boundary `frontness > 0.5` implied, named so it can be piped. */
export const JERSEY_BIB_OUTER = 0.180;
const PIPING = 0.004;

/**
 * The jersey, the render's way: an amber field, an ivory yoke over the
 * shoulders continuing into the sleeves, two ivory flank panels running
 * from the yoke down to the belt either side of an amber centre panel that
 * carries the hop cone between the straps — narrowest at the pecs, widening
 * to own the belly, so its inner edge is a curve and the flanks are not
 * rectangles (gauntlet round 1: the first cut's 85 mm bib panels had a
 * straight hem and no outer seam and read as strips of tape) — and the
 * brown waist band with an ivory buckle plate. Brown piping along every
 * cream edge, because a printed jersey's panels have seams and a soft
 * colour edge on a curved chest reads as a stain.
 *
 * `s` runs 0 at his left (+X), 0.25 at the front, 0.5 at his right, 0.75 at
 * the back, and back to 1 at his left — `loftPoint`'s own frame.
 */
function paintJersey(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  const box = PIXEL_REGIONS.jersey;
  const rings = layout.torso.map((ring) => ring.y);
  paintWrapped(sheet, box, layout.torso, (s, y) => {
    if (y < JERSEY_BELT.bottom) return AMBER;
    if (y < JERSEY_BELT.top) {
      const front = frontness(s) > 0.9 && Math.abs(s - 0.25) < 0.020;
      if (front && y > JERSEY_BELT.bottom + 0.010 && y < JERSEY_BELT.top - 0.010) return IVORY;
      // Two stitch lines along the belt's edges.
      if (y < JERSEY_BELT.bottom + 0.005 || y > JERSEY_BELT.top - 0.005) return BROWN_LIGHT;
      return BROWN;
    }
    if (y > JERSEY_YOKE) return y < JERSEY_YOKE + PIPING ? BROWN : IVORY;
    const off = Math.abs(s - 0.25);
    if (off < JERSEY_BIB_OUTER) {
      // The centre panel's half-span: `JERSEY_PANEL_HALF` at the bib height
      // and above, easing out by `JERSEY_PANEL_SPREAD` down to the belt.
      const down = Math.min(1, Math.max(0, (JERSEY_BIB - y) / (JERSEY_BIB - JERSEY_BELT.top)));
      const panelHalf = JERSEY_PANEL_HALF + JERSEY_PANEL_SPREAD * (down * down * (3 - 2 * down));
      if (off > panelHalf) {
        if (off < panelHalf + 0.006 || off > JERSEY_BIB_OUTER - 0.006) return BROWN;
        return IVORY;
      }
    }
    return AMBER;
  });

  // The hop cone, centred on the front, sized on the chest the way the mark
  // is on Wheel in Motion's: the span is solved for the front, not read off
  // the circumference, because a torso section is a squarish superellipse
  // and its front face packs more millimetres into a radian than its corners.
  const { width: hopWidth, centre } = layout.chestHop;
  const v = vOfHeight(rings, centre);
  const pageWidth = box.x1 - box.x0;
  const pageHeight = box.y1 - box.y0;
  const front = Math.PI / 2;
  let span = (hopWidth / arcAcross(layout.torso, v, 0, Math.PI * 2)) * Math.PI * 2;
  for (let i = 0; i < 3; i += 1) {
    span *= hopWidth / arcAcross(layout.torso, v, front - span / 2, front + span / 2);
  }
  const widthPx = (span / (Math.PI * 2)) * pageWidth;
  const metresUp = metresPerT(rings, centre);
  const stretch = (hopWidth * pageHeight) / (metresUp * widthPx);
  paintHop(sheet, box.x0 + pageWidth * 0.25, box.y0 + (v / (rings.length - 1)) * pageHeight, widthPx, stretch);
}

/**
 * The sleeves: ivory, the target's way — both of its sleeves are cream from
 * the shoulder to the cuff — with one amber wedge down the back of the
 * deltoid (its left sleeve's one gold mark), piped, tapering to a point
 * toward the elbow, the target's brown chevrons on the outboard face, a
 * brown band at the elbow, and a hop-green band at the wrist where the glove
 * begins: the target's wrist band, 42 mm deep, the one green on him that
 * wraps and so the one the chase camera sees. The first cut was amber with
 * two cream stripes, which put the whole figure in one amber column from
 * collar to ankle in profile (gauntlet round 1). The dome over the shoulder
 * is the yoke's ivory continued.
 *
 * `s` runs round the arm from its outboard seam; 0.75 is the back of the
 * arm — the target never shows a rider's back, so the wedge's seat is an
 * inference, stated as one.
 *
 * **Gauntlet round 3 killed the rectangle.** The wedge was a constant
 * 0.10 of the circumference on every row, cut flat at its foot with a 5 mm
 * brown cap, and edged in a 3.2–3.8 mm stroke — a taped-on amber strip in a
 * keyline where the target's marks carry no outline at all; and the
 * outboard face, the one the front, quarter and chase cameras see, was
 * blank cream from seam to cuff. Now the wedge's half-width fades to
 * nothing (`SLEEVE_WEDGE_FADE` → `SLEEVE_WEDGE_END`), its edge is the
 * jersey's own `PIPING`, and the outboard face carries the target's
 * designed marks (`paintSleeveChevrons`).
 */
const SLEEVE_WEDGE_HALF = 0.10;
/** Where the wedge starts to narrow, and where it has died to a point, metres down the upper arm. */
const SLEEVE_WEDGE_FADE = -0.060;
const SLEEVE_WEDGE_END = -0.170;
/**
 * The elbow band: brown over the sleeve's last 22 mm before the elbow — the
 * target's brown hem over its cream, the last 7 % of the sleeve — with the
 * forearm's ivory as the cream under it.
 */
const SLEEVE_HEM = Object.freeze({ top: -0.258, bottom: -0.280 });
/** The cuff's top, metres down the forearm from the elbow: 42 mm of green on a 260 mm forearm. */
export const SLEEVE_CUFF = -0.218;

/**
 * The target's sleeve marks, on the outboard face — `s` 0 and 1 are the
 * seam there, so every mark is drawn from `lat = min(s, 1 − s)`, and both
 * page edges resolve to the same apex, which the page's inset then leaves
 * whole (a chevron centred on the seam would be clipped by it).
 *
 * Placed by the target's own proportions down a 268 mm sleeve from the
 * deltoid seam to the elbow: the chevron block at 24–52 % (its at 28–47 %),
 * the dashes at 60–70 % (56–71 %). Two brown chevrons 12 mm deep with a
 * 6 mm gap, the amber one nested under them, rising 26 mm from apex to tip
 * over 0.11 of the circumference (~40 mm); two brown dashes, 10 mm deep,
 * half a chevron wide. No outline on any of them.
 */
const SLEEVE_CHEVRONS: readonly { readonly apex: number; readonly ink: Rgb }[] = [
  { apex: -0.108, ink: BROWN },
  { apex: -0.126, ink: BROWN },
  { apex: -0.144, ink: AMBER },
];
const SLEEVE_CHEVRON = Object.freeze({ halfSpan: 0.11, rise: 0.026, depth: 0.012 });
const SLEEVE_DASHES: readonly number[] = [-0.172, -0.192];
const SLEEVE_DASH = Object.freeze({ halfSpan: 0.05, depth: 0.010 });

function paintSleeveChevrons(s: number, y: number): Rgb | null {
  const lat = Math.min(s, 1 - s);
  if (lat < SLEEVE_CHEVRON.halfSpan) {
    const centre = SLEEVE_CHEVRON.rise * (lat / SLEEVE_CHEVRON.halfSpan);
    for (const bar of SLEEVE_CHEVRONS) {
      if (Math.abs(y - (bar.apex + centre)) < SLEEVE_CHEVRON.depth / 2) return bar.ink;
    }
  }
  if (lat < SLEEVE_DASH.halfSpan) {
    for (const dash of SLEEVE_DASHES) {
      if (Math.abs(y - dash) < SLEEVE_DASH.depth / 2) return BROWN;
    }
  }
  return null;
}

function paintSleeves(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  paintWrapped(sheet, PIXEL_REGIONS.sleeve, layout.upperArm, (s, y) => {
    // The dome: ivory, as the yoke it continues.
    if (y > -0.012) return IVORY;
    if (y > -0.012 - PIPING) return BROWN;
    if (y < SLEEVE_HEM.top) return BROWN;
    if (y > SLEEVE_WEDGE_END) {
      // The wedge's half-width: full to the fade, then a smoothstep to a
      // point at the end, so the field dies rather than being cut.
      const down = Math.min(1, Math.max(0, (SLEEVE_WEDGE_FADE - y) / (SLEEVE_WEDGE_FADE - SLEEVE_WEDGE_END)));
      const half = SLEEVE_WEDGE_HALF * (1 - down * down * (3 - 2 * down));
      const rear = Math.abs(s - 0.75);
      if (rear < half) return AMBER;
      if (rear < half + PIPING) return BROWN;
    }
    return paintSleeveChevrons(s, y) ?? IVORY;
  });
  paintWrapped(sheet, PIXEL_REGIONS.forearm, layout.forearm, (_s, y) => {
    if (y < SLEEVE_CUFF) return HOP;
    if (y < SLEEVE_CUFF + PIPING) return BROWN;
    return IVORY;
  });
}

// -- The hat -----------------------------------------------------------------

/**
 * Where the foam mound's edge sits on the shell before it drips, and how far
 * a drip can reach. 0.345 rather than round 1's 0.322 (gauntlet round 3):
 * `drips` carries a 0.10–0.20 baseline fall, so the *un-dripped* edge sat at
 * 0.304–0.313 — 58 % up the shell, a mean foam share of 51 % of its height
 * against the target's 28 % — and from behind the head read as a white lid
 * over a 17 px amber band. The base rises 23 mm and the drip amplitude
 * rises with it, so every tongue keeps its depth and the amber comes back
 * *between* them: mean share 42 %, the rear column 19 px amber under 19 px
 * of foam at chase.
 */
export const HAT_FOAM_EDGE = 0.345;
/**
 * 113 mm (90 at round 1, raised with the edge): the deepest tongue reaches
 * 84 % of the way down the dome, the target's ~93 %; at the first cut's
 * 52 mm the tongues stopped at 65 % and nine of them, each 1–3 % of the
 * circumference wide, read as a sawtooth rather than a poured pint
 * (gauntlet round 1).
 */
export const HAT_FOAM_DRIP = 0.113;
/** The brim band: the shell's lowest rings, the amber a step down. */
export const HAT_BRIM = 0.224;

/**
 * The hat: an amber open-face shell with a mound of cream foam on the crown
 * running over onto the shell in drips — the render's strongest single
 * silhouette, and the reason the ground is cream. The drips are hashed, so
 * no two are alike and every build has the same ones; a thin darker line
 * under the foam's edge is the shadow a mound throws on the shell, and the
 * lowest rings carry the brim band so the hat ends somewhere.
 */
export function hatFoamEdge(s: number): number {
  // Five tongues at 2.4× the hash's width: 24–58 mm each on the 785 mm
  // circumference, few and long.
  return HAT_FOAM_EDGE - HAT_FOAM_DRIP * drips(s, 5, 11, 2.4);
}

function paintHat(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  paintWrapped(sheet, PIXEL_REGIONS.hat, layout.hat, (s, y, texel) => {
    const edge = hatFoamEdge(s);
    if (y < HAT_BRIM) return AMBER_DEEP;
    // The shadow line under the edge, then the cream, each feathered over
    // the texel (round 3). Under the foam cap the kit builds on this edge
    // (`drunkardHatFoam`) the cream is hidden and the shadow line is what
    // shows as the mound's contact seam.
    const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, edge - 0.005, texel));
    return mixRgb(shadow, CLEAR, foamCover(y, edge, texel));
  });
}

// -- The kit -----------------------------------------------------------------

/**
 * The label's bands, metres up the can: the cream rim, then amber, then the
 * foam-dripped cream top, then the rim (`paintKit`). `CAN_TOP` 0.116 rather
 * than round 1's 0.097 (gauntlet round 2): the cream ran from there over
 * the closing cap with no rim above it, 47 % of the can and open-topped —
 * a tankard. The target's cans are 27 % cream under a dark top rim.
 */
export const CAN_RIM = 0.009;
export const CAN_TOP = 0.116;
/** How far the top band's foam drips down into the amber, metres. */
export const CAN_DRIP = 0.020;
/** The can's top rim, measured down from the loft's apex: the profile's 0.912 h ring, where the cap necks in. */
export const CAN_LID = 0.0145;

/** A sub-rectangle of a page, in sheet pixels. */
function subBox(
  page: { x0: number; y0: number; x1: number; y1: number },
  rect: PageRect,
): { x0: number; y0: number; x1: number; y1: number } {
  const width = page.x1 - page.x0;
  const height = page.y1 - page.y0;
  return {
    x0: page.x0 + rect.s0 * width,
    y0: page.y0 + rect.t0 * height,
    x1: page.x0 + rect.s1 * width,
    y1: page.y0 + rect.t1 * height,
  };
}

/**
 * The kit page: the can's label as a wrapped band — a cream rim, an amber
 * label carrying the hop cone at the face that looks outboard, and a cream
 * top that drips foam down into the amber; the peak's two rows, amber above
 * and darker beneath; and a plain strip the tubes wear, tinted amber by
 * vertex colour rather than inked, because a tube's texture coordinates run
 * along it and a page it merely has to not disturb is cheaper than one it
 * has to fit.
 */
function paintKit(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  const page = PIXEL_REGIONS.kit;
  inkRect(sheet, page, CLEAR, 1, 1);
  const label = subBox(page, KIT_LABEL);
  const width = label.x1 - label.x0;
  const height = label.y1 - label.y0;
  // The band wraps the can loft, so it is painted in metres up the can
  // through the can's own rings, as every wrapped page is. The lid is
  // derived from the loft's own apex (the M22 rule), a brown rim over the
  // cream so the can closes.
  const lid = layout.can[layout.can.length - 1]!.y - CAN_LID;
  paintWrapped(sheet, label, layout.can, (s, y, texel) => {
    if (y > lid) return BROWN;
    if (y > lid - 0.003) return AMBER_DEEP;
    if (y < CAN_RIM) return CLEAR;
    if (y < CAN_RIM + 0.004) return BROWN;
    const foam = CAN_TOP - CAN_DRIP * drips(s, 7, 29);
    const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, foam - 0.003, texel));
    return mixRgb(shadow, CLEAR, foamCover(y, foam, texel));
  });
  // The cone at s = 0.25: the loft's front, which the look turns outboard on
  // each can. Sized against the can: its circumference across the page's
  // width against metres per row up the band at the cone's height. 0.66 of
  // the radius (gauntlet round 2): at 1.30 the mark was 65 % of the can's
  // diameter and 97 mm tall on a 64–84 mm amber band — over the rim, over
  // the foam, and flush on the silhouette in the quarter view. Now 32 % of
  // the diameter (the target's hand can: 34 %), inside the amber with 11 mm
  // below it and 8 above.
  const rings = layout.can.map((ring) => ring.y);
  const radius = Math.max(...layout.can.map((ring) => ring.halfWidth));
  const acrossPerM = width / (Math.PI * 2 * radius);
  const hopCentre = 0.045;
  const upPerM = height / metresPerT(rings, hopCentre);
  const hopWidth = radius * 0.66;
  paintHop(
    sheet,
    label.x0 + width * 0.25,
    label.y0 + (vOfHeight(rings, hopCentre) / (rings.length - 1)) * height,
    hopWidth * acrossPerM,
    upPerM / acrossPerM,
  );

  const peak = subBox(page, KIT_PEAK);
  const split = peak.y0 + (peak.y1 - peak.y0) * 0.5;
  inkRect(sheet, { x0: peak.x0, y0: peak.y0, x1: peak.x1, y1: split }, AMBER_DEEP, 1, 1);
  inkRect(sheet, { x0: peak.x0, y0: split, x1: peak.x1, y1: peak.y1 }, AMBER, 1, 1);
}

// -- The pack ----------------------------------------------------------------

/**
 * The bubbles in the liquid: a deterministic scatter of small discs, denser
 * and larger just under the foam and absent from the bottom fifth, the way
 * the target's dots sit. `s` round the pack, `y` metres up it; the pack's
 * circumference is ~0.5 m, which is what makes a disc round in both.
 */
// Twenty-four discs of 6–14 mm (gauntlet round 2; round 1's twenty-two of
// 2.5–6 mm were 1–2 px at chase and never changed a pixel), over a field
// that now runs round the whole pack rather than the rear window.
const PACK_BUBBLES = 24;
const PACK_METRES_PER_S = 0.50;
/**
 * How much of a texel a bubble covers: the nearest disc's signed distance in
 * metres, feathered over the texel's span (round 3 — a boolean disc test
 * drew each 6–14 mm bubble as a stack of one-row runs with hard corners).
 */
function packBubbleCover(s: number, y: number, bottom: number, top: number, feather: number): number {
  const span = top - bottom;
  let nearest = Infinity;
  for (let i = 0; i < PACK_BUBBLES; i += 1) {
    const up = hash01(53 + i * 4 + 2);
    // Weighted upward: the square root piles them under the foam.
    const cy = bottom + span * (0.20 + 0.80 * Math.sqrt(up));
    const cs = hash01(53 + i * 4);
    const r = 0.0060 + 0.0080 * hash01(53 + i * 4 + 1) * (0.5 + 0.5 * up);
    const ds = Math.min(Math.abs(s - cs), 1 - Math.abs(s - cs)) * PACK_METRES_PER_S;
    const dy = y - cy;
    nearest = Math.min(nearest, Math.hypot(ds, dy) - r);
  }
  return Math.min(1, Math.max(0, 0.5 - nearest / Math.max(1e-6, feather)));
}

/**
 * The pack: a brown box with a lighter cap band, and the beer in it — on
 * the face that looks backward, at the chase camera, the sight window
 * (liquid inside a darker inner frame), and above the box the vessel all
 * round: the same liquid, a cream foam line dripping into it, bubbles
 * rising under the foam. The brief's own fake for a transparent reservoir
 * (§7), and no material on him is transparent.
 */
function paintPack(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  const page = PIXEL_REGIONS.pack;
  const rings = layout.pack.map((ring) => ring.y);
  const last = rings.length - 1;
  const width = page.x1 - page.x0;
  const height = page.y1 - page.y0;
  const heightOf = (t: number): number => {
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    return rings[i]! + (rings[i + 1]! - rings[i]!) * (v - i);
  };
  // The lid: everything above the band's top — the box's own rounded close
  // — in the printed brown (round 3's ruling on the cap's colour, kept: a
  // lighter cap was one amber under the beer and the foam's flat top read
  // as a collar).
  const window = PACK_WINDOW;
  const band = PACK_BAND;
  const capBottom = band.top;
  const columnMetres = PACK_METRES_PER_S / width;
  inkField(sheet, page, (x, py) => {
    const s = (x - page.x0) / width;
    const t = (py - page.y0) / height;
    const plain = PACK_PLAIN;
    if (s > plain.s0 && s < plain.s1 && t > plain.t0 && t < plain.t1) return [CLEAR, 1];
    const y = heightOf(t);
    // The texel's span in metres, the larger of its row and its column —
    // 3.75 mm up the vessel, 1.95 mm round it — is the feather every edge
    // below is reconstructed over (`foamCover`).
    const texel = Math.max(Math.abs(heightOf(t + 1 / height) - y), columnMetres);
    // The cap: the vessel's taper.
    if (y > capBottom) return [BROWN, 1];
    const inWindow = s > window.s0 && s < window.s1 && y > window.bottom && y < window.top;
    if (inWindow || y >= band.bottom) {
      // The window's frame: only below the all-round band, or its two bars
      // and sill would print brown through the beer above it.
      if (inWindow && y < band.bottom) {
        const frame = 0.018;
        if (s < window.s0 + frame || s > window.s1 - frame || y < window.bottom + 0.012) return [BROWN_LIGHT, 1];
      }
      // Eight tongues at 2.2× the hash's width, for the hat's reason: few
      // and long, on a 500 mm circumference.
      const foam = band.top - (PACK_FOAM_HEAD + PACK_FOAM_DRIP * drips(s, 8, 47, 2.2));
      const foamCoverage = foamCover(y, foam, texel);
      if (foamCoverage >= 1) return [CLEAR, 1];
      // 22 mm of shadow under the foam (4 px at chase; round 1's 10 mm was
      // under 2), so the liquid line keeps a dark under-edge at distance.
      const shadeCoverage = foamCover(y, foam - 0.022, texel);
      const bubble = packBubbleCover(s, y, window.bottom, foam - 0.022, texel);
      const body = mixRgb(mixRgb(PACK_LIQUID, PACK_BUBBLE, bubble), PACK_LIQUID_SHADE, shadeCoverage);
      return [mixRgb(body, CLEAR, foamCoverage), 1];
    }
    return [BROWN, 1];
  });
}

// -- The knee -----------------------------------------------------------------

/** The knee pad: a brown field with the hop cone, at the pad's own aspect. */
function paintKnee(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  const box = PIXEL_REGIONS.knee;
  inkRect(sheet, box, BROWN, 1, 1);
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const stretch = patchStretch(layout.shin, layout.kneePad, box, EDGE_INSET.knee ?? 0.5);
  // Measured on the pad, not on the page (gauntlet round 2 — the sheet's
  // margin is not the pad's margin), and on the pad's *lifted* surface, not
  // the bare shin (round 3): the built pad is 103 mm of arc by 84 mm of
  // rise at its bulged centre column, a stretch of 1.45 (1.13 on the bare
  // shin), so at 0.36 the cone's green, outline excluded, is 45 mm wide
  // (44 % of the pad; the target's is 44 % of its cup) and 70 mm tall on
  // the body, and, centred, its tip lands 8 mm above the pad's rim and its
  // stem 5 mm under the pad's top. The lift reaches this measurement as
  // `layout.kneePad.lift`, the one field the pad is also built from.
  // Round 1's 0.463 / 0.323 was placed by the sheet's margins on a pad
  // whose bottom 27 % of rows sat on 2.9 mm of surface, and the tip
  // vanished into the rim; round 2's bare-shin stretch of 1.06 drew the
  // cone 1:1.06 on a pad that the lift had made 1.23:1 wide — a raft of
  // bracts, wider than tall, on the two marks the target draws largest.
  paintHop(sheet, box.x0 + width * 0.5, box.y0 + height * 0.50, width * 0.36, stretch);
}

// -- The sheet ----------------------------------------------------------------

let cachedPixels: Uint8Array | null = null;
let cachedFor: DrunkardSheetLayout | null = null;

/**
 * Paint the whole sheet. Pure, deterministic, and memoised at module scope
 * for the one layout the look hands it; a second layout repaints.
 */
export function drunkardAtlasPixels(layout: DrunkardSheetLayout): Uint8Array {
  if (cachedPixels !== null && cachedFor === layout) return cachedPixels;
  const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
  paintJersey(sheet, layout);
  paintSleeves(sheet, layout);
  paintHat(sheet, layout);
  paintKit(sheet, layout);
  paintPack(sheet, layout);
  paintKnee(sheet, layout);
  paintHandCan(sheet, layout);
  cachedPixels = toSrgbBytes(sheet);
  cachedFor = layout;
  return cachedPixels;
}

// -- The can in his fist -------------------------------------------------------

/**
 * The hand can's label, in metres up the can (gauntlet round 2): a cream
 * base rim and a brown line, amber, and the cream top dripping foam down
 * into the amber — the target's hand can, which carries the same foam edge
 * as its hat cans and the cone printed centrally. The page's columns are
 * uneven round the can (`handCanPageS`), so the painter converts each
 * column back to its loft angle before it asks the drips where they are.
 */
export const HAND_CAN_HOP = Object.freeze({
  /** The loft angle the cone is centred on: 0.22 of a turn from the outboard face, 11° outboard of straight ahead. */
  angle: 0.22,
  /** Its centre, metres up the can, and its width as a share of the can's radius. */
  centre: 0.0335,
  width: 0.79,
});

function paintHandCan(sheet: InkSheet, layout: DrunkardSheetLayout): void {
  const box = PIXEL_REGIONS.handCan;
  const rings = layout.handCan.map((ring) => ring.y);
  const radius = Math.max(...layout.handCan.map((ring) => ring.halfWidth));
  const { rim, line, drip } = layout.handCanBands;
  // The cream boundary is the profile's own ring pair's upper edge — the
  // last barrel ring — so it cannot drift from the loft it wraps.
  const barrelTop = layout.handCan.filter((ring, i) => i > 0 && Math.abs(ring.halfWidth - radius) < 1e-9).pop()!.y;
  paintWrapped(sheet, box, layout.handCan, (s, y, texel) => {
    if (y < rim) return CLEAR;
    if (y < rim + line) return BROWN;
    const foam = barrelTop - drip * drips(handCanAngle01(s), 7, 61);
    const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, foam - 0.003, texel));
    return mixRgb(shadow, CLEAR, foamCover(y, foam, texel));
  });
  // The cone: on the dense arc, so its width is metres across that arc.
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const acrossPerM = (width * HAND_CAN_FACE_SHARE) / (Math.PI * radius);
  const upPerM = height / metresPerT(rings, HAND_CAN_HOP.centre);
  paintHop(
    sheet,
    box.x0 + width * handCanPageS(HAND_CAN_HOP.angle),
    box.y0 + (vOfHeight(rings, HAND_CAN_HOP.centre) / (rings.length - 1)) * height,
    radius * HAND_CAN_HOP.width * acrossPerM,
    upPerM / acrossPerM,
  );
}

/** A texture over those pixels, for one rig — `createWimAtlas`' settings. */
export function createDrunkardAtlas(layout: DrunkardSheetLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(drunkardAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.name = 'drunkard-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** The inks his wheel's sheet shares (Phase 3), so the two sheets cannot disagree about a colour. */
export { AMBER as drunkardAmberInk, BROWN as drunkardBrownInk, HOP as drunkardHopInk, PRINT as drunkardPrintGround };
