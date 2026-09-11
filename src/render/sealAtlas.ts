/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import type { LoftProfile, UvRect } from './blockoutKit.ts';
import {
  inkField,
  inkRect,
  inkSheet,
  linearFromHex,
  mixRgb,
  toSrgbBytes,
  type InkSheet,
  type Rgb,
} from './inkKit.ts';

/**
 * Seal on a Wheel's sheet — M35 Phase 1, and the smallest one in the game.
 *
 * **One surface is printed on him and one only: the lid.** Everything else he
 * wears is black on black and reaches its value by paint, because a vertex
 * colour can hold a field and this rider is nothing but fields. The helmet
 * cannot be: the photographs give a **red crown and rear, white angular
 * flashes and black bands**, three saturated values on one shell, and a
 * multiplier can paint a base down to any one of them and never up to the
 * others (`DESIGN.md` §7m). So the shell loft is folded onto the `helmet`
 * page (`RiderAtlas.lofts.head`) and its colour is all texels, on Wheel in
 * Motion's mechanism (`render/wimAtlas.ts`).
 *
 * **The blocking is original and it has to be.** A red/white/black full-face
 * lid is a shape real helmet makers own, and the brand critic's one question
 * covers this page specifically, so nothing here traces a maker's graphic:
 * what the references commit to is that **red leads**, the pinstripes running
 * fore and aft over the crown, a flash on each temple and each side of the
 * chin bar, black round the eye port and the brow, and a pale band round the
 * rear base. Those are the shapes painted below, as signed distances in metres
 * on the unrolled shell, and nothing else is taken.
 *
 * **"Red > black > white" was the plan's second clause and r1 retired it.**
 * §35.2 read the order off the references; the gauntlet's verifier re-measured
 * both stills through one classifier and found white at or above black on the
 * visible lid in each (PHOTO 1 31.5 % white to 38.7 % black; PHOTO 2 42.4 % to
 * 42.3 %, white first unsplit — `seal-views/_scratch/gauntlet-r1-record.md`
 * §C-5), against a page carrying **6.4 %** white. Three of six blind critics
 * called the lid short of white independently. So r2 widened the two flashes
 * and gave the rear base its band, and the page now measures red 72 %, white
 * 17 %, black 11 %. The white is on its reference; **the black is now the one
 * a further round would measure short**, and it is on the record rather than
 * quietly propped up here.
 *
 * **The ground is `sealGarment`, and that is arithmetic rather than taste.**
 * `inkOver` divides and clamps at one, so a page's ground has to stand at or
 * above every ink on it in every channel; the lid's own three colours do not
 * (the red's red byte is the highest of them). The roster's answer is a
 * near-white printing ground of the look's own — Wheel in Motion's
 * `wheelInMotionPrint` — and Seal already owns one light value that clears
 * all three: the tied sweatshirt's. So the lid's material wears the garment's
 * grey, every texel of the page inks over it, and no fifteenth colour key is
 * added for a surface nobody can see. `sealOnAWheel.test.ts` holds the
 * relationship rather than a comment: the ground dominates every ink in every
 * channel, or the page would clamp and the red would quietly render as the
 * ground.
 *
 * No mark, no lettering, no raster, no `Math.random` — his identity is a
 * handle and a colour scheme, and the roster's two `<image>` decoders stay at
 * two (`docs/PLANS.md` §35.15).
 */

/**
 * 512 and not 1024. The sheet carries one wrapped page and two flat swatches;
 * at 512 the lid's page is 512 × 384 texels over a shell 268 mm across and
 * 288 mm tall, which is 0.75 mm of shell per texel across the widest ring —
 * four times finer than the 2.2 mm edge ramp the strokes are drawn with, so
 * nothing on it is resolution-bound. A megabyte of texture for a helmet.
 */
export const ATLAS_SIZE = 512;

/**
 * Where each page sits, in sheet pixels. Sheet `y` grows the way a loft's `v`
 * grows — up the body — so art authored with a larger `y` sits higher on him.
 */
const PIXEL_REGIONS = {
  /** The lid, wrapped: `x` runs from his left round the front to the back and home. */
  helmet: { x0: 0, y0: 0, x1: 512, y1: 384 },
  /**
   * The shell's base rim. A merged head feature must carry its own page or it
   * wears the shell's print across itself (`DESIGN.md` §7m), and an unpaged
   * one lands on `blank`, which multiplies by one — which on a printing
   * ground is a white ring under the chin, not a rim.
   */
  rim: { x0: 0, y0: 384, x1: 64, y1: 448 },
  /**
   * Neutral. Anything mapped here renders exactly as its vertex colours say.
   * Nothing on him but the lid samples this sheet, so the blank page exists
   * for the contract `RiderAtlas.region` states — an unknown name is the
   * blank page and never a throw — rather than for a part that uses it.
   */
  blank: { x0: 448, y0: 448, x1: 512, y1: 512 },
} as const;

export type SealRegionName = keyof typeof PIXEL_REGIONS;

/**
 * How far in from a page's left and right edges its texture coordinates
 * start, in texels — Wheel in Motion's measured 4.5 for a wrapped lid
 * (`render/wimAtlas.ts`): half a texel is clean at mip 0 only, and the moment
 * the rider is any distance away a half-texel inset puts a quarter of the
 * sample on the texel that averages this page's last column with its
 * neighbour's first. 4.5 stays inside the page through mip 3, at the cost of
 * 1.8 % of the page across.
 */
const EDGE_INSET: Readonly<Partial<Record<SealRegionName, number>>> = Object.freeze({ helmet: 4.5 });

/** The same table in texture coordinates, inset from each edge as above. */
export const SEAL_REGIONS: Readonly<Record<SealRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => {
      const inset = EDGE_INSET[name as SealRegionName] ?? 0.5;
      return [name, Object.freeze({
        u0: (box.x0 + inset) / ATLAS_SIZE,
        v0: (box.y0 + 0.5) / ATLAS_SIZE,
        u1: (box.x1 - inset) / ATLAS_SIZE,
        v1: (box.y1 - 0.5) / ATLAS_SIZE,
      })];
    }),
  ),
) as Readonly<Record<SealRegionName, UvRect>>;

/**
 * What the sheet needs to know about the body it will be folded onto: the
 * lid's own rings, because a loft's texture row is a ring index and every
 * field here is authored in metres, and the visor's footprint, because the
 * blocking is drawn *around* an aperture the page never sees.
 */
export interface SealSheetLayout {
  /** The lid: its page wraps the shell, base ring to crown. */
  readonly head: LoftProfile;
  /** The visor patch's angular half-span (radians) and its height span (metres). */
  readonly visor: { readonly halfSpan: number; readonly from: number; readonly to: number };
  /** Where the base rim's top edge sits, metres — the black chin runs into it. */
  readonly rimTop: number;
}

// -- The inks ----------------------------------------------------------------
//
// Every colour on the page is a multiplier over the print ground, and every
// one below is authored as "what the player should see" — `inkOver` computes
// the multiplier that lands there, so no ratio is restated by hand.

const PRINT = linearFromHex(BLOCKOUT_COLOURS.sealGarment);

const CLEAR: Rgb = [1, 1, 1];

/** The three colours on the lid, as inks over the ground. */
export const SEAL_LID_INKS = Object.freeze({
  red: BLOCKOUT_COLOURS.sealHelmetRed,
  white: BLOCKOUT_COLOURS.sealHelmetWhite,
  black: BLOCKOUT_COLOURS.sealHelmetBlack,
});

/** The print ground, as a linear triple — the test reads it to prove it dominates. */
export const SEAL_PRINT_GROUND: Rgb = PRINT;

function inkFor(hex: number): Rgb {
  const target = linearFromHex(hex);
  return [
    Math.min(1, target[0] / Math.max(1e-4, PRINT[0])),
    Math.min(1, target[1] / Math.max(1e-4, PRINT[1])),
    Math.min(1, target[2] / Math.max(1e-4, PRINT[2])),
  ];
}

const RED = inkFor(SEAL_LID_INKS.red);
const WHITE = inkFor(SEAL_LID_INKS.white);
const BLACK = inkFor(SEAL_LID_INKS.black);

// -- Surface metrics ----------------------------------------------------------

/** The shell's half-width at a height, metres — the scale of one radian there. */
function halfWidthAt(profile: LoftProfile, y: number): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y <= first.y) return first.halfWidth;
  if (y >= last.y) return last.halfWidth;
  for (let i = 1; i < profile.length; i += 1) {
    const upper = profile[i]!;
    if (upper.y < y) continue;
    const lower = profile[i - 1]!;
    return lower.halfWidth
      + (upper.halfWidth - lower.halfWidth) * ((y - lower.y) / (upper.y - lower.y));
  }
  return last.halfWidth;
}

/**
 * A page that wraps a loft, painted in metres — `wimAtlas.paintWrapped`.
 *
 * Hands the shader the surface parameters a texel corresponds to: `s` right
 * round the body from the rider's left, and the height in **metres**, so
 * every field below is authored the way the rest of the look is and lands on
 * the shell where its numbers say.
 */
function paintWrapped(
  sheet: InkSheet,
  box: { x0: number; y0: number; x1: number; y1: number },
  profile: LoftProfile,
  shade: (s: number, y: number) => Rgb,
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
  inkField(sheet, box, (x, y) => {
    const s = (x - box.x0) / width;
    const t = (y - box.y0) / height;
    return [shade(s, heightOf(t)), 1];
  });
}

// -- The lid ------------------------------------------------------------------

/** The edge ramp, metres of shell. Print on a shell, not a decal with a step. */
const EDGE = 0.0022;

/**
 * The lid's blocking, and it is the one original drawing in this milestone.
 *
 * Read off the photographs as **areas and directions**, never as a traced
 * graphic: PHOTO 1 (the profile, moving away) gives the red crown and rear
 * with two thin white lines running fore and aft over it; PHOTOS 2 and 3 give
 * the white angular flashes on the temple and on each side of the chin bar,
 * the black brow, the black surround round the eye port and the black lower
 * chin; PHOTO 1 adds the pale band round the rear base. **Red leads** with the
 * eye port outside the count, and `sealOnAWheel.test.ts` measures that on the
 * painted page rather than trusting this paragraph — as it measures the white,
 * which r1's gauntlet found ten times short of both photographs.
 *
 * Authored in metres on the unrolled shell: `xf` is the arc from straight
 * ahead at the ring's own half-width and `xb` the arc from straight behind,
 * so a line converging on the crown is a straight segment here and converges
 * on the dome the way lines of longitude do. Because `xf` is the *absolute*
 * turn either side of the centre line, every shape below is bilaterally
 * symmetric by construction — which is what a helmet's paint scheme is, and
 * the reason the lid carries no handedness test where the garment does.
 */
function paintSealHelmet(sheet: InkSheet, layout: SealSheetLayout): void {
  const profile = layout.head;
  const cover = (d: number): number => Math.min(1, Math.max(0, 0.5 - d / EDGE));
  const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
  /**
   * Distance outside a stroke along a segment, whose half-width may taper end
   * to end — a **capsule**, so both of its ends are round caps.
   *
   * That is the right shape where two marks converge on the crown and wrong
   * where a mark ends: see `wedge` below.
   */
  const stroke = (
    px: number, py: number,
    ax: number, ay: number, bx: number, by: number,
    halfA: number, halfB = halfA,
  ): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) - (halfA + (halfB - halfA) * t);
  };
  /**
   * The same stroke with **square ends** — r2's piece 1, finding 2 (§E 9).
   *
   * A capsule's ends are semicircles by construction, so every white mark on
   * the r1–r2 page finished in a round cap; PHOTO 2 at ×8 shows the chin-bar
   * white as a straight-sided wedge with hard corners and the temple white as
   * an angular triangle, and `rest/quarter.png` at ×5 rendered the temple flash
   * as a grey hook with two rounded ends. The *edges* half of that finding was
   * refuted — a tapered capsule's sides are the straight tangents between its
   * two end circles, and the bow the critic saw is the dome under perspective —
   * so what changes is the ends and nothing else.
   *
   * The cap is the segment's own endpoint: outside `t ∈ [0, 1]` the distance
   * is the axial overshoot rather than the radial one, which cuts the
   * semicircle off flat at the full half-width instead of falling short of the
   * endpoint by it. The two pinstripes keep `stroke`, because their ends are
   * where they meet over the crown and a square end there would draw a corner
   * across the centre line.
   */
  const wedge = (
    px: number, py: number,
    ax: number, ay: number, bx: number, by: number,
    halfA: number, halfB = halfA,
  ): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const along = (px - ax) * ux + (py - ay) * uy;
    const across = Math.abs((px - ax) * -uy + (py - ay) * ux);
    const t = clamp01(along / length);
    return Math.max(across - (halfA + (halfB - halfA) * t), along - length, -along);
  };
  const { from: portBottom, to: portTop, halfSpan } = layout.visor;
  paintWrapped(sheet, PIXEL_REGIONS.helmet, profile, (s, y) => {
    const r = halfWidthAt(profile, y);
    // Turns from straight ahead, either side, in [0, 0.5]; then the arcs.
    const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
    const xf = turn * Math.PI * 2 * r;
    const xb = (0.5 - turn) * Math.PI * 2 * r;
    // The aperture's own footprint on the shell, in the same metres: the
    // visor patch's half-span converted to arc at this height, and its two
    // edges. The black surround is a frame around this and the white
    // flashes are placed off its corners, so the whole scheme moves if the
    // aperture ever does.
    const portArc = halfSpan * r;
    const insidePort = xf <= portArc && y >= portBottom && y <= portTop;
    const outsidePort = Math.max(xf - portArc, portBottom - y, y - portTop);

    let white = 0;
    // **The two pinstripes**, one each side of the centre line and continuous
    // over the crown: the front half climbs from the brow and the rear half
    // from the nape, both converging on the dome, which is the only way a
    // fore-aft line crosses a pole in a wrapped page's coordinates.
    white = Math.max(white, cover(stroke(xf, y, 0.052, portTop + 0.006, 0.020, 0.322, 0.0055, 0.0045)));
    white = Math.max(white, cover(stroke(xb, y, 0.052, 0.196, 0.020, 0.322, 0.0055, 0.0045)));
    // **The temple flash**: a wedge off the eye port's upper-rear corner,
    // raked back and up, the widest white on the lid. Its half-widths were
    // 0.016/0.005 in r1 and every measurement of that page came back short by
    // a factor of ten — see the white's own paragraph below.
    white = Math.max(white, cover(wedge(xf, y, portArc + 0.006, portTop - 0.020, portArc + 0.070, portTop + 0.030, 0.030, 0.010)));
    // **The chin-bar flash**: a wedge on each side of the jaw, running down
    // and inboard from under the port's lower corner — the shape PHOTOS 2
    // and 3 carry beside the mouth. 0.014/0.006 in r1, same finding.
    white = Math.max(white, cover(wedge(xf, y, portArc - 0.004, portBottom - 0.012, 0.030, layout.rimTop + 0.010, 0.026, 0.012)));
    // **The rear base band**, and it is r2's one new shape: PHOTO 1 is a rear
    // three-quarter and its lower rear shell is about 30 % pale, where r1
    // rendered 0 %. It is a plain band in the strip the nape black gives up
    // below it, so the two shapes share one edge instead of one being drawn
    // over the other. Where it stops across the centre line is INFERENCE — no
    // photograph shows the back of this lid — and it is painted symmetric
    // because that is what a helmet's scheme is.
    //
    // **r2's gauntlet found it half as deep as the reference and r3 deepened
    // it** (§E 6). It ran `rimTop + 0.004 … + 0.044` — 40 mm of a 288 mm
    // shell, **13.9 %** — and the base rim below `0.070` wears its own solid
    // black page, so nothing painted under that line was visible at all;
    // `rest/head.png` rendered 50 px of a 353 px lid. PHOTO 1's rear columns
    // give 20–30 % of the local shell height at three stations, and its lower
    // half is 30.5 % pale where r2 rendered 23.0 %. So the band starts at the
    // rim's own top edge and reaches 20 mm further up, and the nape's lower
    // edge moves with it: **64 mm, 22.2 % of the shell**.
    white = Math.max(white, cover(Math.max(
      xb - 0.160,
      layout.rimTop - y,
      y - (layout.rimTop + 0.064),
    )));

    let black = 0;
    // **The brow band**: the shell immediately over the aperture, and it is
    // what stops the crown's red running into the visor's smoke. 42 mm deep on
    // the centre line, reaching 30 mm outboard of the port's own corners.
    //
    // **Its upper edge rakes, and r1's finding 1.5 is why.** Both edges were
    // constants in `y`, so the band wrapped the dome as a level belt of one
    // height all the way round; PHOTO 2 at ×8 shows the dark surround *arcing*
    // with the aperture and narrowing as it runs into the temple. The rake is
    // 0.16 of the arc — 42 mm on the centre line against 12 at the port's
    // outboard corner — with a 4 mm crest held over the middle 30 mm, so the
    // band peaks between the eyes the way the aperture's own `bulge` does
    // rather than dipping into it where the visor would hide the dip.
    const crest = 0.004 * clamp01(1 - xf / 0.030);
    black = Math.max(black, cover(Math.max(
      xf - portArc - 0.030,
      portTop - y,
      y - (portTop + 0.042 + crest - 0.16 * xf),
    )));
    // **The eye-port surround**: a frame 20 mm wide round the aperture, so
    // the red never meets the glass and the port has an edge from any angle.
    black = Math.max(black, cover(Math.max(-outsidePort, outsidePort - 0.020)));
    // **The lower chin**, into the base rim: the band a full-face lid's
    // bottom edge is, black in every still. It used to wrap 130 mm of arc
    // either side of the centre line and stand 34 mm over the rim, which
    // rendered the whole chin band 97.3 % black where PHOTO 2's is 45.5 %
    // black, 22.8 % red and 31.7 % white. Pulled back to 85 mm and 26 mm: the
    // black keeps the rim and hands the chin bar's sides back to the red.
    black = Math.max(black, cover(Math.max(y - (layout.rimTop + 0.026), xf - 0.085)));
    // **The nape**, which is the other half of §35.2's *"parts of the
    // crown-top and chin bar"*: the shell's rear base is dark in PHOTO 1
    // under the red crown, and from the chase camera it is what gives the
    // back of the lid an edge against the pack below it. Its lower edge is
    // now `0.134` rather than the shell's own base, because the pale band
    // below takes the strip under it — the two share that edge, and r3 moved
    // both of them up together (§E 6) so the nape neither overlaps the deeper
    // band nor leaves a red gap between them.
    black = Math.max(black, cover(Math.max(xb - 0.120, y - 0.162, 0.134 - y)));
    // Nothing is painted inside the aperture: the visor patch is sunk into
    // it in its own material, and a black field under it would be the only
    // part of this page a player could never see.
    if (insidePort) return BLACK;
    return mixRgb(mixRgb(RED, BLACK, black), WHITE, white);
  });
}

// -- The sheet ----------------------------------------------------------------

let cachedPixels: Uint8Array | null = null;
let cachedFor: SealSheetLayout | null = null;

/**
 * Paint the whole sheet. Pure, deterministic, and memoised at module scope
 * for the one layout the look hands it; a second layout repaints.
 */
export function sealAtlasPixels(layout: SealSheetLayout): Uint8Array {
  if (cachedPixels !== null && cachedFor === layout) return cachedPixels;
  const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
  paintSealHelmet(sheet, layout);
  inkRect(sheet, PIXEL_REGIONS.rim, BLACK, 1, 1);
  cachedPixels = toSrgbBytes(sheet);
  cachedFor = layout;
  return cachedPixels;
}

/** A texture over those pixels, for one rig — `createWimAtlas`' settings. */
export function createSealAtlas(layout: SealSheetLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(sealAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.name = 'seal-on-a-wheel-atlas';
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

/**
 * The lid's page, read back as the three inks and their shares — the
 * measurement `sealOnAWheel.test.ts` makes the area order on.
 *
 * Sampling the *painted sheet* rather than re-deriving the shapes is the
 * point: a stroke that overlaps another, an edge ramp that eats a band, or a
 * shape that has drifted off the shell all show here and in none of the
 * numbers above it. The eye port is excluded by the caller's own footprint,
 * because the visor covers it in its own material and a share that counted it
 * would be counting a surface no player sees.
 *
 * `window` narrows the count to one part of the shell — a height span and, if
 * given, an arc from straight ahead or from straight behind — so a band the
 * size of the chin bar can be measured without the crown's red drowning it.
 * Added in r2, where the gauntlet's chin finding was about 60 mm of shell and
 * the whole-page share moved by under a point when it was fixed; `rearArc` is
 * r3's, for the rear base band the same round deepened.
 */
export function sealLidInkShares(layout: SealSheetLayout, window?: {
  readonly from?: number; readonly to?: number;
  readonly frontArc?: number; readonly rearArc?: number;
}): {
  red: number; white: number; black: number; counted: number;
} {
  const pixels = sealAtlasPixels(layout);
  const box = PIXEL_REGIONS.helmet;
  const profile = layout.head;
  const rings = profile.map((ring) => ring.y);
  const last = rings.length - 1;
  const heightOf = (t: number): number => {
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    return rings[i]! + (rings[i + 1]! - rings[i]!) * (v - i);
  };
  const targets = [
    { name: 'red' as const, rgb: linearFromHex(SEAL_LID_INKS.red) },
    { name: 'white' as const, rgb: linearFromHex(SEAL_LID_INKS.white) },
    { name: 'black' as const, rgb: linearFromHex(SEAL_LID_INKS.black) },
  ];
  const tally = { red: 0, white: 0, black: 0, counted: 0 };
  const toLinear = (byte: number): number => {
    const v = byte / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  for (let py = box.y0; py < box.y1; py += 1) {
    const t = (py + 0.5 - box.y0) / (box.y1 - box.y0);
    const y = heightOf(t);
    if (window?.from !== undefined && y < window.from) continue;
    if (window?.to !== undefined && y > window.to) continue;
    for (let px = box.x0; px < box.x1; px += 1) {
      const s = (px + 0.5 - box.x0) / (box.x1 - box.x0);
      const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
      const xf = turn * Math.PI * 2 * halfWidthAt(profile, y);
      if (window?.frontArc !== undefined && xf > window.frontArc) continue;
      if (window?.rearArc !== undefined
        && (0.5 - turn) * Math.PI * 2 * halfWidthAt(profile, y) > window.rearArc) continue;
      if (xf <= layout.visor.halfSpan * halfWidthAt(profile, y)
        && y >= layout.visor.from && y <= layout.visor.to) continue;
      const i = (py * ATLAS_SIZE + px) * 4;
      // The page's texels are the ink; the ground multiplies back in, so a
      // texel is compared against `ink × ground` — which is the colour the
      // rider actually renders at that spot, not the ratio stored here.
      const here: Rgb = [
        toLinear(pixels[i]!) * PRINT[0],
        toLinear(pixels[i + 1]!) * PRINT[1],
        toLinear(pixels[i + 2]!) * PRINT[2],
      ];
      let best = targets[0]!;
      let bestGap = Infinity;
      for (const target of targets) {
        const gap = Math.hypot(here[0] - target.rgb[0], here[1] - target.rgb[1], here[2] - target.rgb[2]);
        if (gap < bestGap) { bestGap = gap; best = target; }
      }
      tally[best.name] += 1;
      tally.counted += 1;
    }
  }
  return tally;
}
