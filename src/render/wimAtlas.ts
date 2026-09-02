/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { WIM_LOGO_HEIGHT, WIM_LOGO_PNG_BASE64, WIM_LOGO_WIDTH } from '../data/wimLogoAsset.ts';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { loftPoint, type LoftProfile, type UvRect } from './blockoutKit.ts';
import {
  inkField,
  inkOver,
  inkRaster,
  inkRect,
  inkSheet,
  linearFromHex,
  mixRgb,
  toSrgbBytes,
  type InkRaster,
  type InkSheet,
  type Rgb,
} from './inkKit.ts';
import { bytesFromBase64, decodePng } from './pngDecode.ts';

/**
 * Wheel in Motion's printed sheet — M28 Phase 1.
 *
 * **The second sheet in the game, and the first that prints a garment rather
 * than a decal.** Maribel's atlas (`render/maribelAtlas.ts`) exists because a
 * vertex colour can hold a field and cannot hold an edge; it reaches her
 * through patches, and her suit underneath is black leather. His jersey is a
 * different problem: it is two saturated hues on one garment — a blue field
 * and yellow sweeps — and a multiplier can paint a pale base *down* to either
 * but can never paint one up to the other. So the whole torso and both sleeves
 * are printed: the lofts themselves are folded onto pages of this sheet
 * (`RiderAtlas.lofts`), and the near-white body material
 * (`BLOCKOUT_COLOURS.wheelInMotionPrint`) is the ceiling every ink hangs from.
 *
 * **Everything on it is arithmetic except his mark**, which is the one thing
 * that may not be: the brief forbids redrawing, approximating, proceduralising
 * or "improving" the logo, and `data/wimLogoAsset.ts` carries his file byte
 * for byte so that `inkRaster` can stamp it unchanged. No `fillText`, no font,
 * no `Math.random` (invariant 12); the sheet is the same on every machine that
 * builds it. No manufacturer's device from the photograph reaches it — not the
 * jersey maker's on the chest and sleeve, not the guard maker's, not the
 * helmet's (brief §8): the one mark that stands where they stood is his.
 *
 * **A page over a loft is measured in the loft's own space.** A loft's `v` is
 * ring-index space, not metres, so every field here is authored in metres and
 * converted through the profile the page will land on (`WimSheetLayout`).
 * That is also how the mark keeps its aspect on a curved chest: the box it is
 * stamped into is derived from the surface's metres-per-texel across and up,
 * not typed.
 */

export const ATLAS_SIZE = 1024;

/**
 * Where each page sits, in sheet pixels. Sheet `y` grows the way a loft's `v`
 * grows — up the body — so art authored with a larger `y` sits higher on him.
 */
const PIXEL_REGIONS = {
  /** The whole torso, wrapped: `x` runs from his left round the front to the back and home. */
  jersey: { x0: 0, y0: 0, x1: 1024, y1: 512 },
  /** An upper arm, wrapped, shoulder at the top: yellow with blue slashes, blue below. */
  sleeve: { x0: 0, y0: 512, x1: 512, y1: 768 },
  /** A forearm, wrapped, elbow at the top: blue with yellow slashes. */
  forearm: { x0: 512, y0: 512, x1: 1024, y1: 768 },
  /** His mark as a sticker on the pack, on black. */
  packMark: { x0: 512, y0: 768, x1: 768, y1: 896 },
  /** The knee guard's upper shell on his right thigh: white, a strap, his mark. */
  guardUpper: { x0: 768, y0: 768, x1: 1024, y1: 896 },
  /**
   * The same shell on his left thigh, marked too — the only reference that
   * shows both his knees (the channel screenshot, provenance rather than a
   * modelling reference, but the one photograph of the pair) brands both
   * shells alike, and a matched pair with one decal reads as a missing one.
   * Stamped turned, because this page is worn by a `mirrored` patch on the
   * side that runs its page the other way.
   */
  guardPlain: { x0: 512, y0: 896, x1: 768, y1: 1024 },
  /** Flat guard white: the hinge struts and pivot bosses, which wear no mark. */
  guardFlat: { x0: 960, y0: 896, x1: 1024, y1: 960 },
  /** The shin plate: white, the vent ladder, the lower strap. */
  guardLower: { x0: 768, y0: 896, x1: 896, y1: 1024 },
  /** The goggle lens: a dark mirror with one soft sheen. */
  lens: { x0: 896, y0: 896, x1: 960, y1: 960 },
  /**
   * The lid, wrapped like the jersey: the shell's own page, blue with the
   * yellow as paint and the mouth vent black (`paintHelmet`). No orange —
   * the owner's look pass struck the target render's orange trim; orange is
   * his wheel's.
   */
  helmet: { x0: 0, y0: 768, x1: 512, y1: 1024 },
  /** Flat jersey blue, for anything the jersey's own page cannot reach. */
  blue: { x0: 896, y0: 960, x1: 960, y1: 1024 },
  /** The knee cup's near-black, and every dark moulding on the guards. */
  cap: { x0: 960, y0: 960, x1: 992, y1: 1024 },
  /**
   * Neutral. Anything mapped here renders exactly as its vertex colours say —
   * his legs, his seat, and every part that carries paint rather than print.
   */
  blank: { x0: 992, y0: 960, x1: 1024, y1: 1024 },
} as const;

export type WimRegionName = keyof typeof PIXEL_REGIONS;

/**
 * How far in from a page's left and right edges its texture coordinates
 * start, in texels. Half a texel is clean at mip 0 only; the lid and the
 * sleeves minify the moment the rider is any distance away, and at mip 1 a
 * half-texel inset puts a quarter of the sample on the texel that averages
 * this page's last column with the next page's first — on the helmet's
 * crown that neighbour is the guard's white, and it drew a dotted arc down
 * the lid's seam that a blind round found at 2 px. 4.5 texels stays inside
 * the page through mip 3, at the cost of 1.8% of the page across. The
 * jersey keeps the half texel: its page must be continuous across the seam
 * at his left flank, where the helix crosses it, and its neighbour there is
 * itself.
 */
const EDGE_INSET: Readonly<Partial<Record<keyof typeof PIXEL_REGIONS, number>>> = Object.freeze({
  helmet: 4.5, sleeve: 4.5, forearm: 4.5, guardUpper: 4.5, guardPlain: 4.5, guardLower: 4.5, packMark: 4.5,
});

/** The same table in texture coordinates, inset from each edge as above (half a texel up and down). */
export const WIM_REGIONS: Readonly<Record<WimRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => {
      const inset = EDGE_INSET[name as WimRegionName] ?? 0.5;
      return [name, Object.freeze({
        u0: (box.x0 + inset) / ATLAS_SIZE,
        v0: (box.y0 + 0.5) / ATLAS_SIZE,
        u1: (box.x1 - inset) / ATLAS_SIZE,
        v1: (box.y1 - 0.5) / ATLAS_SIZE,
      })];
    }),
  ),
) as Readonly<Record<WimRegionName, UvRect>>;

/**
 * What the sheet needs to know about the bodies it will be folded onto.
 *
 * The profiles, because a loft's texture row is a ring index and the art is
 * authored in metres; and the two guard patches' spans, because a patch's
 * unit square is not a square on the body and his mark must land on the
 * shell at its own aspect (`DESIGN.md` §7i).
 */
export interface WimSheetLayout {
  readonly torso: LoftProfile;
  readonly upperArm: LoftProfile;
  readonly forearm: LoftProfile;
  readonly thigh: LoftProfile;
  readonly shin: LoftProfile;
  /** The lid: its page wraps the shell, base ring to crown. */
  readonly head: LoftProfile;
  /** The thigh shell patch: its angular span (radians) and height span (metres). */
  readonly thighShell: PatchSpan;
  /** The shin plate patch, likewise. */
  readonly shinPlate: PatchSpan;
  /** The sticker on the pack — a patch on the torso, anchored at the back. */
  readonly packSticker: PatchSpan;
  /** The mark's width on the chest, metres, and where its bottom edge sits. */
  readonly chestMark: { readonly width: number; readonly bottom: number };
}

export interface PatchSpan {
  readonly u0: number;
  readonly u1: number;
  readonly from: number;
  readonly to: number;
}

// -- The inks ----------------------------------------------------------------
//
// Every colour on the sheet is a multiplier over the print ground, and every
// one below is authored as "what the player should see" — `inkOver` computes
// the multiplier that lands there, so no ratio is restated by hand.

const PRINT = linearFromHex(BLOCKOUT_COLOURS.wheelInMotionPrint);
const LENS_BASE = linearFromHex(BLOCKOUT_COLOURS.wheelInMotionLens);

const CLEAR: Rgb = [1, 1, 1];
const BLUE = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionBlue));
const YELLOW = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionYellow));
/**
 * The guard's white is the print ground itself: the guard patches carry a
 * vertex shade above 1 so the shell renders *brighter* than the jersey's
 * ground, which is what three gauntlet rounds asked for in three words —
 * "grey, not white". `wheelInMotionGuard` still names the limb paint under it.
 */
const GUARD: Rgb = [1, 1, 1];
const CAP = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionGear));

/** `height / width` of his artwork. A caller that squares it draws a lie. */
export const MARK_ASPECT = WIM_LOGO_HEIGHT / WIM_LOGO_WIDTH;

const cachedMarks: { upright: InkRaster | null; turned: InkRaster | null } = { upright: null, turned: null };

/**
 * His artwork's pixels, unpacked once — and, for most surfaces, **turned round
 * once**, so that the mark reads the right way on his body.
 *
 * A page's `s` runs with `loftPoint`'s `u`: from the rider's left, across the
 * front, toward the right. Stand in front of him and that is right-to-left on
 * your screen, so a page stamped as-is comes out mirrored on every front-
 * facing surface — the first capture round read *MiW* across his chest. The
 * back is the same story from behind. The fix is the stamp's, not the
 * geometry's: the parameterisation is shared by every rider and by Maribel's
 * accepted sheet (whose mark is bilaterally symmetric, which is why nobody
 * saw it), and a mark exists to be read. Each source row is reversed once
 * here, in memory — a byte reorder and not a redraw, the same kind of turn
 * `inkRaster` already makes vertically — and the result on the body is his
 * file, the way he drew it.
 *
 * **A `mirrored` patch is the exception.** `render/rider.ts` negates a
 * mirrored patch's span on one side, which runs that side's `s` the other
 * way: the same page reads correctly on his right leg *upright* and on his
 * left leg *turned*. The blind logo critic caught it — one knee read MiW —
 * so a mark that sits on a mirrored patch is stamped upright and worn by the
 * side that reads it that way (`RiderPatch.artOn`), and the other side gets
 * the page with no mark. `wheelInMotion.test.ts` pins both orderings.
 */
function markRaster(upright = false): InkRaster {
  const slot = upright ? 'upright' : 'turned';
  const cached = cachedMarks[slot];
  if (cached !== null) return cached;
  const source = decodePng(bytesFromBase64(WIM_LOGO_PNG_BASE64));
  if (upright) {
    cachedMarks.upright = source;
    return source;
  }
  const rgba = new Uint8Array(source.rgba.length);
  const stride = source.width * 4;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = y * stride + (source.width - 1 - x) * 4;
      const to = y * stride + x * 4;
      rgba[to] = source.rgba[from]!;
      rgba[to + 1] = source.rgba[from + 1]!;
      rgba[to + 2] = source.rgba[from + 2]!;
      rgba[to + 3] = source.rgba[from + 3]!;
    }
  }
  const turned = { width: source.width, height: source.height, rgba };
  cachedMarks.turned = turned;
  return turned;
}

/**
 * Stamp his mark into a box whose lower-left is (`x`, `y`), sized to `width`.
 *
 * The height is derived from the artwork's own aspect and the page's
 * anisotropy, never passed — the same API shape that made the no-stretching
 * rule structurally unbreakable for Maribel's mark.
 */
function paintMark(sheet: InkSheet, x: number, y: number, width: number, pageStretch: number, upright = false): void {
  inkRaster(
    sheet,
    { x0: x, y0: y, x1: x + width, y1: y + width * MARK_ASPECT * pageStretch },
    markRaster(upright),
    PRINT,
  );
}

// -- Surface metrics ----------------------------------------------------------

/** Distance along the surface from `u0` to `u1` at a ring-index height. */
function arcAcross(profile: LoftProfile, v: number, u0: number, u1: number): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const steps = 96;
  let length = 0;
  loftPoint(profile, u0, v, a);
  for (let i = 1; i <= steps; i += 1) {
    loftPoint(profile, u0 + (u1 - u0) * (i / steps), v, b);
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

/**
 * Metres up the body per unit of a page's `t`, at a height — one ring
 * interval's spacing times the number of intervals. Local, because a profile
 * can space its rings unevenly; the jersey's are even where the mark sits.
 */
function metresPerT(rings: readonly number[], y: number): number {
  const last = rings.length - 1;
  const v = Math.min(last - 1e-6, Math.max(0, vOfHeight(rings, y)));
  const i = Math.floor(v);
  return (rings[i + 1]! - rings[i]!) * last;
}

/**
 * A page that wraps a loft, painted in metres.
 *
 * Hands the shader the surface parameters a texel corresponds to — `s` right
 * round the body from the rider's left, and the height in metres — so every
 * field below is authored the way the rest of the look is, and lands on the
 * body where its numbers say.
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

// -- The jersey ---------------------------------------------------------------

/** Signed distance of a height from a band's centre line, in metres. */
function within(y: number, centre: number, half: number): boolean {
  return Math.abs(y - centre) <= half;
}

/**
 * The jersey: a blue field, one yellow sweep spiralling round the body, the
 * pinstripes beside it, yellow over each shoulder, and his mark on the chest.
 *
 * **Read off the photograph, with one inference.** His real jersey is blue on
 * the chest, carries a broad yellow diagonal across the lower torso falling
 * from his right ribs to his left hip with thin yellow lines beside it,
 * and is yellow over the shoulders into the sleeves. Nothing in the
 * references shows his back, so the sweep simply continues round: low on his
 * right flank, high on his left, one helix — which is what a printed race
 * jersey does and what keeps the page continuous across the loft's seam at
 * his left. That inference is flagged for the owner and the critics
 * (`docs/PLANS.md` §28.4).
 *
 * `s` runs 0 at his left (+X), 0.25 at the front, 0.5 at his right, 0.75 at
 * the back, and back to 1 at his left — `loftPoint`'s own frame.
 */
function paintJersey(sheet: InkSheet, layout: WimSheetLayout): void {
  const box = PIXEL_REGIONS.jersey;
  const rings = layout.torso.map((ring) => ring.y);

  // The sweep's centre line: front half rises toward his left, back half
  // rises toward his left too, so the two meet at both flanks.
  // **The wedge closes to a point** — the first blind round with the wheel
  // measured that the front's sweep never did: one straight ramp per half
  // has its only vertices on the flanks, so the yellow ran off the hip as a
  // band cut by the hem, where the photograph shows the block ending in a
  // hard point. So the ramp steepens over the last fifth of the front until
  // the band's top edge meets the hem, and the helix stays continuous at
  // both flanks.
  //
  // **And it is handed the photograph's way.** The band sits high on his
  // RIGHT ribs and falls across the belly to his LEFT hip, where the block
  // runs to the hem; his right hip is plain blue. The first two rounds had
  // it mirrored — read off the target render, which mirrors the photograph
  // here — and the second blind round measured the hips: photo 0% yellow on
  // his right hip against 40% on his left, the page the other way about.
  // The photograph is the authority for the kit (brief §5), so the front is
  // mirrored about s = 0.25 and the back starts from wherever the front
  // leaves the right flank.
  const atRight = 0.215 + 0.55 * 0.25;
  const frontCentre = (s: number): number => {
    const m = 0.5 - s;
    const base = 0.215 - 0.55 * (m - 0.25);
    return m <= 0.32 ? base : base - 1.1 * (m - 0.32);
  };
  const atLeft = frontCentre(0);
  const sweepCentre = (s: number): number => (
    s <= 0.5 ? frontCentre(s) : atRight + (atLeft - atRight) * ((s - 0.5) / 0.5)
  );
  // The yoke: one yellow band across the shoulders, chest and back, which the
  // sleeve pages continue — the render's continuous yoke, where two shoulder
  // caps read as epaulettes in the third gauntlet round.
  // Narrow — the shoulder slope, not a bib. At 92 mm it ran from the collar
  // to just above the mark and painted the whole upper chest yellow at every
  // s: the third blind round measured the front torso 52% yellow against the
  // photograph's belly at 36% and the render's chest at 21%, and located
  // the surplus in exactly this band. 28 mm still meets the sleeve's yellow
  // cap as one continuous yoke.
  const overShoulder = (_s: number, y: number): boolean => y > 0.492 && y < 0.520;

  // How much of the front a point is on: 1 across the chest and belly, 0 on
  // the back, ramping through the flanks. The yellow *field* below the sweep
  // is a front thing — the photograph's belly — and the back is blue with
  // the sweep alone: the second gauntlet round measured a rear view that had
  // gone yellow-dominant while both references are blue-first.
  const frontness = (s: number): number => {
    const toFront = Math.min(Math.abs(s - 0.25), Math.abs(s + 0.75));
    return Math.min(1, Math.max(0, (0.21 - toFront) / 0.06));
  };
  paintWrapped(sheet, box, layout.torso, (s, y) => {
    if (overShoulder(s, y)) return YELLOW;
    const centre = sweepCentre(s);
    // Above the sweep: the blue field with one bold bar. The sweep itself.
    // Below it: blue again — on the front with two yellow pinstripes, on
    // the back with one. **Blue is the ground, front and back**: the first
    // blind round with the wheel measured the belly the photograph shows
    // unobstructed at 66% blue and this page's front at 31%, because the
    // field under the sweep had been painted yellow; the photograph's
    // jersey is a blue garment carrying yellow, never the reverse.
    if (y > centre + 0.050) return within(y, centre + 0.082, 0.008) ? YELLOW : BLUE;
    if (y > centre - 0.050) return YELLOW;
    if (y < 0.062) return within(y, 0.046, 0.007) ? YELLOW : BLUE;
    if (frontness(s) < 0.5) return within(y, centre - 0.088, 0.008) ? YELLOW : BLUE;
    if (within(y, centre - 0.088, 0.008) || within(y, centre - 0.122, 0.006)) return YELLOW;
    return BLUE;
  });

  // His mark, on the upper chest, centred on the front. The box is derived
  // from the surface: metres per texel across at that height, metres per
  // texel up from the ring spacing there. The plate it sits on is the
  // artwork's own white ground — the file carries it — with square corners.
  const { width: markWidth, bottom } = layout.chestMark;
  const v = vOfHeight(rings, bottom + markWidth * MARK_ASPECT / 2);
  const pageWidth = box.x1 - box.x0;
  const pageHeight = box.y1 - box.y0;
  // **The span is solved for the front, not read off the circumference.** A
  // torso section is a squarish superellipse, so its front face packs more
  // millimetres into a radian than its corners do; sizing the mark from the
  // whole circumference stamped it 20% too wide across the chest (a blind
  // critic measured it, and `wheelInMotion.test.ts` now measures it on the
  // built mesh). Three fixed-point steps land the arc on the width.
  const front = Math.PI / 2;
  let span = (markWidth / arcAcross(layout.torso, v, 0, Math.PI * 2)) * Math.PI * 2;
  for (let i = 0; i < 3; i += 1) {
    span *= markWidth / arcAcross(layout.torso, v, front - span / 2, front + span / 2);
  }
  const widthPx = (span / (Math.PI * 2)) * pageWidth;
  const metresUp = metresPerT(rings, bottom);
  // `paintMark` derives the height as width × aspect × stretch, so the stretch
  // is what turns page pixels across into page pixels up at this spot.
  const stretch = (markWidth * pageHeight) / (metresUp * widthPx);
  const x = box.x0 + pageWidth * 0.25 - widthPx / 2;
  const y = box.y0 + (vOfHeight(rings, bottom) / (rings.length - 1)) * pageHeight;
  paintMark(sheet, x, y, widthPx, stretch);
}

/**
 * The sleeves: yellow over the shoulder, blue below, three yellow bands
 * canted round the arm the way a printed stripe follows a raglan sleeve.
 * The forearm is blue with two thinner bands near the elbow and a plain
 * cuff — the photograph's sleeve, simplified to what forty pixels can show.
 */
function paintSleeves(sheet: InkSheet, layout: WimSheetLayout): void {
  // A slash rather than a hoop: the band's height runs round the arm as a
  // sine, so from the side it rakes down and forward the way the printed
  // chevrons on the real sleeve do. Raked hard: two gauntlet rounds read the
  // first cant as hoops.
  const rake = (s: number): number => 0.060 * Math.sin(s * Math.PI * 2);
  // Both upper arms: yellow from the shoulder down past the bicep with two
  // blue slashes through it, blue below — the photograph's sleeves, which
  // are the authority for real gear; the render's one-blue-one-yellow pair
  // was followed for two rounds and the photograph overrules it.
  paintWrapped(sheet, PIXEL_REGIONS.sleeve, layout.upperArm, (s, y) => {
    const cant = rake(s);
    if (y > -0.205 + cant * 0.5) {
      for (const centre of [-0.100, -0.150]) {
        if (within(y, centre + cant, 0.007)) return BLUE;
      }
      return YELLOW;
    }
    return BLUE;
  });
  paintWrapped(sheet, PIXEL_REGIONS.forearm, layout.forearm, (s, y) => {
    const cant = 0.040 * Math.sin(s * Math.PI * 2);
    for (const centre of [-0.048, -0.086]) {
      if (within(y, centre + cant, 0.0055)) return YELLOW;
    }
    return BLUE;
  });
}

// -- The guards ---------------------------------------------------------------

/** How many page pixels up a page pixel across is worth on a patch. */
function patchStretch(
  profile: LoftProfile,
  span: PatchSpan,
  page: { x0: number; y0: number; x1: number; y1: number },
  anchor = Math.PI / 2,
): number {
  const rings = profile.map((ring) => ring.y);
  const mid = (span.from + span.to) / 2;
  const across = arcAcross(profile, vOfHeight(rings, mid), anchor + span.u0, anchor + span.u1);
  const up = Math.abs(span.to - span.from);
  return (across / up) * ((page.y1 - page.y0) / (page.x1 - page.x0));
}

/**
 * The thigh shell: white moulding and the strap that holds it — and, on the
 * page his right leg wears, his mark: the render's own idea, and the brief
 * allows it ("optional smaller branding on knee protection"). The render
 * carries it on one leg, small; so does this. The strap is a dark band along
 * the top edge, where the photograph's webbing crosses the shell.
 */
function paintGuardShell(
  sheet: InkSheet,
  layout: WimSheetLayout,
  box: { x0: number; y0: number; x1: number; y1: number },
  withMark: boolean,
  upright = true,
): void {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  inkRect(sheet, box, GUARD, 1, 1);
  inkRect(sheet, { x0: box.x0, y0: box.y1 - height * 0.14, x1: box.x1, y1: box.y1 }, CAP, 1, 1.5);
  // A moulded edge line, one step under the white, so the shell has a rim.
  inkRect(sheet, { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + height * 0.05 }, mixRgb(GUARD, CAP, 0.35), 1, 1.5);
  if (!withMark) return;
  const stretch = patchStretch(layout.thigh, layout.thighShell, box);
  const markWidth = width * 0.30;
  const markHeight = markWidth * MARK_ASPECT * stretch;
  // Centred on the knee's FRONT, not on the page. The shell's span is
  // lopsided outboard (1.95 rad out, 0.90 in) for the hinge and the
  // carve-fold clearance, so a mark centred on the page sat 30° outboard of
  // the front and its M reached the silhouette at 35° of leg yaw — the
  // third blind round found the far knee's M collapsed to a bar. The same
  // fraction on both pages: `mirrored` flips the geometry, not the page.
  const span = layout.thighShell;
  const front = (0 - span.u0) / (span.u1 - span.u0);
  // Upright on the page his right leg wears, turned on his left's: a
  // `mirrored` patch runs its page one way on one side and the other way on
  // the other — see `markRaster`.
  paintMark(sheet, box.x0 + width * front - markWidth / 2, box.y0 + height * 0.44 - markHeight / 2, markWidth, stretch, upright);
}

/**
 * The shin plate: white, with the vent ladder that says *moulded plastic*
 * rather than *painted tube* drawn as ink instead of as five lifted patches
 * (Adonisb2 paid triangles for his), and the lower strap at the boot.
 */
function paintGuardLower(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.guardLower;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  inkRect(sheet, box, GUARD, 1, 1);
  const centre = box.x0 + width * 0.5;
  // Three bold slots, not five hairlines: at forty pixels the finer ladder
  // read as engraving on metal rather than as vents in plastic.
  for (let i = 0; i < 3; i += 1) {
    const y = box.y0 + height * (0.68 - i * 0.11);
    inkRect(sheet, { x0: centre - width * 0.20, y0: y - height * 0.022, x1: centre + width * 0.20, y1: y + height * 0.022 }, CAP, 0.9, 1.4);
  }
  // The lower strap, and the moulded rim above it.
  inkRect(sheet, { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + height * 0.07 }, CAP, 1, 1.5);
  inkRect(sheet, { x0: box.x0, y0: box.y1 - height * 0.03, x1: box.x1, y1: box.y1 }, mixRgb(GUARD, CAP, 0.35), 1, 1.5);
}

/**
 * His mark as a sticker on the pack — the one surface the chase camera looks
 * at for the whole ride, and the one place the blind gauntlet's distance
 * critic and logo critic both asked for him to be identifiable from. The
 * pack is black gear; the sticker is a page of black ink with the mark on it,
 * turned round like the chest's because a back patch reads right-to-left
 * from behind for the same reason a front one does from in front.
 */
function paintPackMark(sheet: InkSheet, layout: WimSheetLayout): void {
  const box = PIXEL_REGIONS.packMark;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  inkRect(sheet, box, CAP, 1, 1);
  const stretch = patchStretch(layout.torso, layout.packSticker, box, -Math.PI / 2);
  const markWidth = width * 0.78;
  const markHeight = markWidth * MARK_ASPECT * stretch;
  paintMark(sheet, box.x0 + (width - markWidth) / 2, box.y0 + height * 0.5 - markHeight / 2, markWidth, stretch);
}

// -- The lens -----------------------------------------------------------------

/**
 * The goggle: a dark mirror with a *subtle* sheen — the photograph's lens,
 * not the render's green window (`docs/PLANS.md` §28.2). The page can only
 * darken, so the base is the lens's brightest value and this takes the rest
 * of the shield down around one soft diagonal that lifts back to it.
 */
function paintLens(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.lens;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const deep = inkOver(LENS_BASE, linearFromHex(0x1c2229));
  const tint = inkOver(LENS_BASE, linearFromHex(0x2f4a4f));
  inkField(sheet, box, (x, y) => {
    const s = (x - box.x0) / width;
    const t = (y - box.y0) / height;
    // Darker toward the brow, a faint cool cast toward the chin.
    const base = mixRgb(deep, tint, Math.min(1, Math.max(0, (0.8 - t) / 0.8)));
    const band = Math.exp(-(((s * 0.7 + t) - 0.85) ** 2) / 0.030);
    return [mixRgb(base, CLEAR, band * 0.55), 1];
  });
}

// -- The lid ------------------------------------------------------------------

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
    const f = (y - lower.y) / (upper.y - lower.y);
    return lower.halfWidth + (upper.halfWidth - lower.halfWidth) * f;
  }
  return last.halfWidth;
}

/**
 * The helmet: a blue shell with its yellow as paint.
 *
 * **Paint, not panels** — the owner's second look pass (2026-09-01). The
 * first pass hung the lid's yellow on as lifted patches, a chin bar and four
 * raked sweeps, and on the ride they were *"yellow panels protruding... it
 * should blend better"*, with Adonisb2's lid named as the one done right —
 * his stripes stand three millimetres off a computed shell. This goes the
 * whole way: the shell is folded onto this page (`RiderAtlas.lofts.head`),
 * so its second colour costs no geometry and lies exactly on the surface,
 * which is what a printed helmet is.
 *
 * The design is the owner's mockup (`references/Wheel-In-Motion/
 * WiM-helmet-mockup.png`), read as shapes and not traced: two stripes
 * climbing from the visor's corners to the crown, a yellow chin narrowing
 * from the visor's corners to the jaw with the mouth vent black in it, a
 * short stroke down each cheek, and two chevrons down the back. The crown
 * and nape vents stay blue — *"u can ignore the
 * black bits other than the visor"* — and the mouth vent is there because
 * he asked for it back: *"keep the black bit in the mouth area."*
 *
 * Authored in metres on the unrolled shell: `x` is the arc from straight
 * ahead (or, at the back, from straight behind) at the ring's own
 * half-width, so a stripe converging on the crown is a straight segment here
 * and converges on the dome the way lines of longitude do. Every shape is a
 * signed distance, and the edge is a two-texel ramp — print on a shell, not
 * a decal with a step.
 */
function paintHelmet(sheet: InkSheet, layout: WimSheetLayout): void {
  const profile = layout.head;
  const EDGE = 0.0022;
  const cover = (d: number): number => Math.min(1, Math.max(0, 0.5 - d / EDGE));
  const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
  /** Distance outside a stroke along a segment, whose half-width may taper from one end to the other. */
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
  paintWrapped(sheet, PIXEL_REGIONS.helmet, profile, (s, y) => {
    const r = halfWidthAt(profile, y);
    // Turns from straight ahead, either side, in [0, 0.5]; then the arcs.
    const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
    const xf = turn * Math.PI * 2 * r;
    const xb = (0.5 - turn) * Math.PI * 2 * r;
    let yellow = 0;
    // The two stripes over the brow: from the visor's corners, converging on
    // the crown. Their feet reach the visor's top edge (0.234) — the mockup's
    // legs end *on* the rim, and a foot 18 mm short of it left an unbroken
    // blue band across the brow that a blind round measured at 7% of the
    // lid's height. Down the same line, no wider: the crown's yellow share
    // already matched the mockup's; only the height of the feet was wrong.
    yellow = Math.max(yellow, cover(stroke(xf, y, 0.1081, 0.2525, 0.010, 0.334, 0.014, 0.009)));
    // The chin, the mockup's way: a wide band under the visor's lower edge,
    // then a narrow V hugging the vent down to the jaw, with blue between it
    // and the cheek stroke. One straight taper here was two-thirds of the
    // jaw's width and the lower face read two-tone; the mockup's yellow
    // collapses to a V round the vent, and the second blind round measured
    // its blue at every depth below the under-visor band.
    const chinHalf = y >= 0.152
      ? 0.072 + (0.104 - 0.072) * clamp01((y - 0.152) / (0.176 - 0.152))
      : 0.030 + (0.072 - 0.030) * clamp01((y - 0.086) / (0.152 - 0.086));
    yellow = Math.max(yellow, cover(Math.max(xf - chinHalf, 0.078 - y, y - 0.153)));
    // A stroke down each cheek, raked inboard as it descends — where the
    // mockup's outboard yellow sits — outboard of the visor's corner.
    yellow = Math.max(yellow, cover(stroke(xf, y, 0.096, 0.160, 0.052, 0.088, 0.013, 0.006)));
    // The back: two chevrons, the upper from the crown, the lower across the
    // nape where the mockup's sits (there is no spoiler under it any more —
    // the owner's third pass took the blade off).
    // Broad at the spine and tapering outboard, and running out to the flank
    // — the mockup's rear is 30% yellow in bands a sixth of the shell wide,
    // and the first cut's two 22 mm ribbons ending half-way round left the
    // lid a plain blue ball from behind (13% yellow on the rear half,
    // integrated over the surface). These land at 29%.
    yellow = Math.max(yellow, cover(stroke(xb, y, 0.012, 0.316, 0.165, 0.222, 0.022, 0.013)));
    yellow = Math.max(yellow, cover(stroke(xb, y, 0.008, 0.160, 0.170, 0.104, 0.022, 0.013)));
    // The mouth vent: a chamfered box, black, in the chin's yellow — and it
    // terminates the chin, tucking under the base rim the way the mockup's
    // is the chin bar's own bottom edge. It floated 26 mm above the rim as
    // a 40 mm letterbox until the third blind round measured it; 62 mm
    // deep by 64 wide now, the mockup's 1.02:1.
    const vy = Math.abs(y - 0.104);
    const black = cover(Math.max(xf - 0.032, vy - 0.031, xf + vy - 0.055));
    return mixRgb(mixRgb(BLUE, YELLOW, yellow), CAP, black);
  });
}

// -- The sheet ----------------------------------------------------------------

let cachedPixels: Uint8Array | null = null;
let cachedFor: WimSheetLayout | null = null;

/**
 * Paint the whole sheet. Pure, deterministic, and memoised at module scope
 * for the one layout the look hands it; a second layout repaints.
 */
export function wimAtlasPixels(layout: WimSheetLayout): Uint8Array {
  if (cachedPixels !== null && cachedFor === layout) return cachedPixels;
  const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
  paintJersey(sheet, layout);
  paintSleeves(sheet, layout);
  paintGuardShell(sheet, layout, PIXEL_REGIONS.guardUpper, true);
  paintGuardShell(sheet, layout, PIXEL_REGIONS.guardPlain, true, false);
  inkRect(sheet, PIXEL_REGIONS.guardFlat, GUARD, 1, 1);
  paintGuardLower(sheet);
  paintPackMark(sheet, layout);
  paintLens(sheet);
  paintHelmet(sheet, layout);
  inkRect(sheet, PIXEL_REGIONS.blue, BLUE, 1, 1);
  inkRect(sheet, PIXEL_REGIONS.cap, CAP, 1, 1);
  cachedPixels = toSrgbBytes(sheet);
  cachedFor = layout;
  return cachedPixels;
}

/** A texture over those pixels, for one rig — `createMaribelAtlas`' settings. */
export function createWimAtlas(layout: WimSheetLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(wimAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.name = 'wheel-in-motion-atlas';
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

// -- Shared with his wheel ----------------------------------------------------

/**
 * His mark's pixels and the page-anisotropy measure, for the sheet his
 * machine wears (`render/wimMachineAtlas.ts`): the same file, the same turn,
 * the same no-stretching arithmetic. The machine's sheet is a separate,
 * small texture rather than a page of this one, because the pages here are
 * exactly the ones his rig wears and `wheelInMotion.test.ts` holds it to that.
 */
export { markRaster as wimMarkRaster, patchStretch as wimPatchStretch };
