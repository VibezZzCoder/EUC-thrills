/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { MV_LOGO_HEIGHT, MV_LOGO_PNG_BASE64, MV_LOGO_WIDTH } from '../data/mvLogoAsset.ts';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import type { UvRect } from './blockoutKit.ts';
import {
  inkDisc,
  inkField,
  inkOver,
  inkRaster,
  inkRect,
  inkSheet,
  inkWord,
  inkWordLength,
  linearFromHex,
  mixRgb,
  toSrgbBytes,
  type InkPoint,
  type InkRaster,
  type InkSheet,
  type Rgb,
} from './inkKit.ts';
import { bytesFromBase64, decodePng } from './pngDecode.ts';

/**
 * Maribel's printed sheet — M23 Phase A1b, "the print shop".
 *
 * **Why a rider suddenly has a texture at all.** Until this file the game's
 * only texture was the sky, and every rider was a vertex-tinted loft. That
 * ceiling is what the owner's rejection of Phase A1 came down to: a vertex
 * colour can hold a *field* and cannot hold an *edge*, so her halftone chest
 * print flattened into a fade, her leg script could not exist, and her own
 * logo had to be replaced by three white slabs in the shape of one. The audit
 * (`docs/PLANS.md` §23.9c) named it as a capability ceiling rather than a
 * budget problem, and §23.9d is the answer: one sheet, painted in code, sampled
 * by the material a rider's decals already share, at **zero extra draw calls**
 * — a texture is not a mesh.
 *
 * **Zero asset files, too.** Every mark below is arithmetic, so the export
 * pipeline is untouched, nothing new can leak into a release folder, and the
 * sheet is identical on every machine that builds it — which is what keeps the
 * capture baselines honest (`render/inkKit.ts` explains why there are no
 * device fonts anywhere in it).
 *
 * **What may be printed here, and what may never be.** Her devil-and-M is her
 * own mark and ships by her written grant — *"That's my logo 🙂"* — redrawn in
 * the game's flat hand rather than traced, at the scale and position her real
 * suit's brand device occupies, which is what the owner asked for when he said
 * *"do the one in the real photo"*. The leg script reads **VARGAS**, her name,
 * which publishes (q50). No manufacturer's demon, no manufacturer's wordmark,
 * no helmet brand, and the visor's gradient is a generic blue-cyan mirror.
 * `NOTICE.md` carries the terms; this comment carries the reason.
 */

/**
 * The sheet is 1024², and the regions below tile it.
 *
 * Big enough that the chest print — the one piece a player looks straight at
 * from the chooser and the crash camera — gets a quarter of it, and small
 * enough that the whole thing is four megabytes of GPU memory on a budget the
 * owner explicitly opened for this character.
 */
export const ATLAS_SIZE = 1024;

/**
 * Where each part's own unit square lands on the sheet.
 *
 * **Sheet `y` grows the way `v` grows, which is *up the body*** — a loft's `v`
 * runs from its lowest ring and a patch's `t` from its lower edge, and a
 * `DataTexture` maps its first row to `v = 0`. So art authored below with a
 * larger `y` sits higher on the rider. It is stated here because every drawing
 * routine in this file depends on it and nothing on screen would say which way
 * round it went until a capture came back upside down.
 */
const PIXEL_REGIONS = {
  /** The printed chest field: halftone, her mark, the zip. */
  chest: { x0: 0, y0: 0, x1: 512, y1: 512 },
  /** VARGAS down the outside of her right thigh. */
  legScript: { x0: 512, y0: 0, x1: 768, y1: 512 },
  /** Strand banding for the loose hair. */
  hair: { x0: 768, y0: 0, x1: 1024, y1: 512 },
  /** The iridium visor gradient. */
  visor: { x0: 0, y0: 512, x1: 512, y1: 768 },
  /** The chevron on each knee cup. */
  kneeDevice: { x0: 512, y0: 512, x1: 768, y1: 768 },
  /** Her mark again, larger, for the upper back. */
  backMark: { x0: 0, y0: 768, x1: 512, y1: 1024 },
  /** Her logo in its own colours, for the machine's leg pads — Phase A2. */
  machineMark: { x0: 768, y0: 512, x1: 1024, y1: 768 },
  /**
   * The leg script's unprinted twin: the same contrast panel, no word.
   *
   * A script exists once on a person, and the patch that carries it is built
   * on both legs. Its other half needs a page that is *leather*, because a
   * printed patch's material is the pale printing ground and the blank page
   * would leave it showing — see `RiderPatch.artElse`.
   */
  legPlain: { x0: 512, y0: 768, x1: 768, y1: 1024 },
  /**
   * Neutral. Anything mapped here renders exactly as its vertex colours say.
   *
   * **Every part drawn in a material that carries this sheet must land on a
   * region, and this is the one that means "no art".** A part with no mapping
   * at all would keep the unit square it was born with and sample the whole
   * sheet — a rider wearing her own chest print smeared over both legs — so
   * `riderLook.ts` answers `blank` rather than nothing, and `maribel.test.ts`
   * asserts that every mesh's coordinates lie inside some region.
   */
  blank: { x0: 768, y0: 768, x1: 1024, y1: 1024 },
} as const;

export type AtlasRegionName = keyof typeof PIXEL_REGIONS;

/** The same table in texture coordinates, which is what geometry wants. */
export const ATLAS_REGIONS: Readonly<Record<AtlasRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
      // Half a texel in from each edge. Bilinear filtering reaches into the
      // neighbouring texel at a region's boundary, and half a texel of inset
      // is the difference between a knee device with a clean edge and one with
      // a hairline of the chest print's leather along its rim.
      u0: (box.x0 + 0.5) / ATLAS_SIZE,
      v0: (box.y0 + 0.5) / ATLAS_SIZE,
      u1: (box.x1 - 0.5) / ATLAS_SIZE,
      v1: (box.y1 - 0.5) / ATLAS_SIZE,
    })]),
  ),
) as Readonly<Record<AtlasRegionName, UvRect>>;

// -- The inks ----------------------------------------------------------------
//
// Every colour on the sheet is a **multiplier**, and the base it multiplies is
// the material the part is drawn in — `MARIBEL_MARK`'s pale grey for anything
// on the accent material, the visor's blue for the shield. `inkOver` computes
// the one that lands on a named target, so the values below are authored as
// "what the player should see", exactly like a vertex tint, and the arithmetic
// that gets there is not restated by hand anywhere.

const MARK_BASE = linearFromHex(BLOCKOUT_COLOURS.maribelMark);
const VISOR_BASE = linearFromHex(BLOCKOUT_COLOURS.maribelVisor);

/** Neutral: multiplies nothing, which is what an unprinted texel must do. */
const CLEAR: Rgb = [1, 1, 1];

/** Her leather, reached down from the pale accent base. */
const LEATHER = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelSuit));
/** One step up from it: the panel grey the stretch fabric is painted in. */
const PANEL = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelPanel));
/** The printed ground the dots sit on — a warm off-white, not paper white. */
const PRINT_GROUND = inkOver(MARK_BASE, linearFromHex(0xe6e7ea));
/** Her right, and her left. The two halves of the livery, stated once. */
const AQUA = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelAqua));
const CORAL = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelCoral));
/** The white her mark is printed in, and the hardware grey of the zip. */
const WHITE = inkOver(MARK_BASE, linearFromHex(0xf2f3f5));
const HARDWARE = inkOver(MARK_BASE, linearFromHex(0x8d919c));
/**
 * Her mark, printed from her own file — not drawn.
 *
 * **Three rounds of this project's arithmetic were three rounds of butchering
 * her logo.** A1c drew it in whatever ink the host surface wanted; A1d redrew
 * it against a pixel scan and shipped an M with no V in it; the q58–q61 round
 * rebuilt it letter by letter, scanned its own centreline against the
 * artwork's, scored EQUAL against a blind critic — and the owner rode it and
 * wrote: *"we are unfortunately still butchering her logo... which is
 * unacceptable."*
 *
 * His answer was `references/Maribel-Vargas/MV_LOGO_ASSET_PACK/`, and his
 * instruction was that **the folder is the authority**. Its README is explicit
 * about what may not happen to the mark: not redrawn, not traced, not
 * substituted with a glyph, not approximated with procedural paths, not
 * rebuilt as a "close enough" mesh, not filled in through its negative space,
 * and never stretched in X against Y. Every one of those was something the
 * code below used to do.
 *
 * So there is no drawing left in this file. `data/mvLogoAsset.ts` carries the
 * pack's recommended master — `MV_logo_transparent_CLEAN.png`, 644 × 538,
 * verbatim and hash-checked — `render/pngDecode.ts` unpacks it, and this
 * stamps it. What used to be a palette of six inks and two hundred lines of
 * bolts and eyelashes is now a rectangle and an aspect ratio.
 *
 * **The negative space stopped being a colour.** Every earlier pass had to
 * name what showed through the gaps inside the mark, because a drawn shape
 * has to fill them with *something*; the artwork's own alpha channel means
 * they are simply not printed, and whatever the host surface put on the sheet
 * — the halftone chest, black leather, a purple badge plate — shows through
 * because it is still there. That is the pack's rule obeyed by construction
 * rather than by care.
 */

/** `height / width` of the artwork. A caller that squares it draws a lie. */
export const MARK_ASPECT = MV_LOGO_HEIGHT / MV_LOGO_WIDTH;

/**
 * How many times wider a metre is *across* each page than a metre *up* it.
 *
 * **The pack's no-stretching rule is about the rider, not about the sheet.**
 * A patch's unit square is not a square on the body: the chest page spans a
 * wide arc and a long drop, the badge plate spans a short arc and a short one.
 * Printing the artwork at its own 644 : 538 into a page that is 1.9 : 1 in
 * metres is exactly the X-against-Y stretch the README forbids — it just does
 * it downstream of the texture, where a sheet-space check cannot see it.
 *
 * So each placement carries its page's anisotropy and `paintMark` divides it
 * out. These are **measured**, not estimated: `tools/uv-anisotropy.mjs` builds
 * the real geometry, fits a tangent frame to every triangle inside a region,
 * and prints metres per unit u against metres per unit v. Re-run it after any
 * change to the patches that carry these regions.
 */
const CHEST_STRETCH = 0.8492;
const BACK_STRETCH = 0.4136;
const BADGE_STRETCH = 1.3508;
const KNEE_STRETCH = 1.6155;

/** The artwork's pixels, unpacked once and shared by all five placements. */
let cachedMark: InkRaster | null = null;

function markRaster(): InkRaster {
  if (cachedMark === null) cachedMark = decodePng(bytesFromBase64(MV_LOGO_PNG_BASE64));
  return cachedMark;
}

/**
 * Stamp her mark into the box at (`x`, `y`), its lower left, sized to `width`.
 *
 * The height is *derived*, never passed: `MARK_ASPECT` is the artwork's own,
 * and a caller that wants a particular height asks for the width that produces
 * it. That is the one API change that makes the pack's no-stretching rule
 * structurally impossible to break, rather than a thing every call site has to
 * remember — and the four call sites below used to pass a width and a height
 * that disagreed with each other by up to nine per cent.
 */
function paintMark(sheet: InkSheet, x: number, y: number, width: number, pageStretch = 1): void {
  inkRaster(
    sheet,
    { x0: x, y0: y, x1: x + width, y1: y + width * MARK_ASPECT * pageStretch },
    markRaster(),
    MARK_BASE,
  );
}

// -- The regions -------------------------------------------------------------

/**
 * The chest: her printed field, her mark, and the zip.
 *
 * The patch this lands on spans the front of the suit, and **`s = 0` is her
 * left**: the span is authored around the front anchor from `-u` to `+u`, and
 * `loftPoint` measures `u` from +X — the rider's left — toward +Z. So the
 * sheet's left edge is the coral half and its right edge is the aqua half,
 * which is the mirror of how it looks in a capture and the single easiest
 * thing in this phase to get backwards. `maribel.test.ts` asserts it by
 * sampling this region rather than by trusting this paragraph.
 */
function paintChest(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.chest;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const markW = width * 0.300;
  const markBottom = 0.750;
  const markTop = markBottom + markW * MARK_ASPECT * CHEST_STRETCH / height;

  /**
   * A rounded, leather-coloured seat around the upper-chest mark.
   *
   * **Kept, and no longer used** — see `coverage` below. It is left here
   * because the next person to move this mark will reach for it again, and
   * this is where the measurement lives: an Opus critic counted the dots the
   * seat removed from regions the emblem never covers and made it **4,936
   * against 7,860 — 37% of the print gone** to clear an emblem that is opaque
   * anyway. The owner had already said it in words: *"when u raised the chest
   * logo a bit u deleted the glitter, ruining her outfit's design."* A
   * clearance patch is the wrong tool for an opaque decal; height is the right
   * one.
   */
  const insideMarkSeat = (s: number, t: number): boolean => {
    const radius = 0.022;
    const halfWidth = markW / width * 0.5 + 0.018;
    const halfHeight = (markTop - markBottom) * 0.5 + 0.014;
    const centreT = (markBottom + markTop) * 0.5;
    const qx = Math.max(Math.abs(s - 0.5) - (halfWidth - radius), 0);
    const qy = Math.max(Math.abs(t - centreT) - (halfHeight - radius), 0);
    return Math.hypot(qx, qy) <= radius;
  };

  // The whole page starts as leather, so the print's edges dissolve into the
  // suit instead of ending at the patch's rim.
  inkRect(sheet, box, LEATHER, 1, 1);

  /**
   * How strongly the print covers a point of the field.
   *
   * A lens: widest across the chest, narrowing toward the waist, fading out
   * before it reaches either armhole. The reference's field is a soft-edged
   * shape rather than a rectangle, and a rectangle of dots on a chest reads as
   * a bib — the same failure the vertex version was corrected for.
   */
  const coverage = (s: number, t: number): number => {
    // **A1d moves the field up onto the chest.** A1c faded it in at t = 0.14
    // and out again by t = 0.60, which on a patch spanning her whole front put
    // the solid half of the print across her stomach and left the chest — the
    // part the reference fills — nearly bare. It is widest across the bust
    // now and narrows to the waist, which is the shape the photograph and the
    // render both carry.
    const clamp = (value: number): number => Math.min(1, Math.max(0, value));
    const across = Math.abs(s - 0.5) * 2;
    const span = 0.44 + 0.64 * clamp((t - 0.17) / 0.53);
    const lateral = 1 - clamp((across - span * 0.62) / 0.30);
    const lower = clamp((t - 0.058) / 0.150);
    // Keep the reference's screen through the upper chest. The previous pass
    // shortened this to 0.55–0.65 in order to clear the emblem and erased the
    // very field the owner calls her outfit's glitter. The emblem now gets a
    // local seat instead, so the print remains everywhere around it.
    const upper = 1 - clamp((t - 0.72) / 0.14);
    void insideMarkSeat;
    return Math.max(0, Math.min(lateral, lower, upper));
  };

  // The halftone, as **actual dots**. §23.4 said the print was "expected to
  // simplify" at a vertex colour's resolution and §23.9d repealed that clause:
  // it does not simplify here, it transfers. Squares rather than discs because
  // the reference's print is a square-dot screen, and staggered rows rather
  // than a grid because an aligned grid on a curved surface beats against the
  // mesh's own rows and shows as banding.
  const pitch = 13.5;
  const rows = Math.ceil(height / pitch);
  const columns = Math.ceil(width / pitch);
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const px = box.x0 + (column + (row % 2 === 0 ? 0 : 0.5)) * pitch;
      const py = box.y0 + row * pitch;
      const s = (px - box.x0) / width;
      const t = (py - box.y0) / height;
      const cover = coverage(s, t);
      if (cover <= 0.02) continue;
      // Ink colour by side. The sternum keeps the ground's own near-white so
      // the two hues read as a *print* rather than as a harlequin — the
      // correction the first capture round forced on the vertex version, and
      // still right now that the dots are real.
      // The wash grades across the *whole* half-width and rises with height,
      // where A1c saturated inside a fifth of it and produced three flat
      // stripes — near-white sternum, hard aqua, hard coral.
      const lean = Math.min(1, Math.abs(s - 0.5) / 0.44) ** 0.85;
      const rise = 0.32 + 0.68 * Math.min(1, Math.max(0, (t - 0.22) / 0.42));
      const accent = s < 0.5 ? CORAL : AQUA;
      const colour = mixRgb(PRINT_GROUND, accent, lean * rise * 0.96);
      // Dot size carries the fade as well as coverage does, which is what a
      // real screen does and what keeps the field's edge from being a line of
      // half-transparent squares.
      // **Sixty per cent fill, not ninety.** A1d's wider field made the old
      // dot size fatal: at 90% of the pitch the dots touch, the leather
      // between them disappears, and a halftone becomes a solid white bib —
      // which is what the first A1d capture showed across her whole chest. A
      // screen reads as a screen only while the ground still shows through it,
      // and in both references the ground is black.
      const half = 0.5 * pitch * 0.62 * cover ** 0.55;
      inkRect(
        sheet,
        { x0: px - half, y0: py - half, x1: px + half, y1: py + half },
        colour,
        Math.min(1, 0.55 + cover),
        1.35,
      );
    }
  }

  // The zip: a tape, a core and a slider, running the garment's full length.
  // Hardware grey, not white, so it never competes with the mark above it.
  const centre = box.x0 + width * 0.5;
  inkRect(
    sheet,
    { x0: centre - 6.0, y0: box.y0 + height * 0.020, x1: centre + 6.0, y1: box.y0 + height * 0.965 },
    PANEL,
    0.30,
    1.4,
  );
  inkRect(
    sheet,
    { x0: centre - 1.6, y0: box.y0 + height * 0.020, x1: centre + 1.6, y1: box.y0 + height * 0.965 },
    HARDWARE,
    0.95,
    0.8,
  );
  inkRect(
    sheet,
    { x0: centre - 4.5, y0: box.y0 + height * 0.600, x1: centre + 4.5, y1: box.y0 + height * 0.632 },
    HARDWARE,
    1,
    0.8,
  );

  // Her mark, at the sternum. Its size is the answer to q57: the owner asked
  // for "the one in the real photo", the mark in the real photo is a
  // manufacturer's, and what ships is **hers at that mark's scale and
  // position** — a quarter of the chest's width, sitting just below the
  // collarbone with the print running out from under it.
  // **Half the chest's width, where A1c drew a quarter of it.** The reference
  // render carries the device across the whole upper chest; at 128 texels the
  // outline was under two texels wide and the teeth under one, so its own
  // detail aliased away before the mesh was even sampled. The box is 1.37:1 on
  // the page because the page is anisotropic — that lands as 1.19:1 on her,
  // against the artwork's measured 1.21.
  // **A small upper-chest emblem, not a torso graphic** — the pack's own
  // words, and the reference render agrees: on her suit the mark is about two
  // fifths of the chest's width, sitting above the halftone rather than
  // covering it. A1d printed it at 0.560 of the page, which measured out at
  // 194 mm across a 315 mm panel.
  // **0.300 wide at 0.750 up the page** — four candidates were built and
  // rendered at chase distance and an Opus critic measured them:
  //
  //   v1  0.350 at 0.606, print whole          — most legible (39 px of head
  //                                              at chase) but sitting *in*
  //                                              the print, which is the note
  //                                              the owner opened with
  //   v3  0.300 at 0.658 + a cleared seat      — 37% of the print deleted
  //   vC  0.300 at 0.750, no seat  ← this one  — print whole, 24 px of head
  //   vD  0.262 at 0.782, no seat              — print whole, 21 px of head,
  //                                              horns gone at chase
  //
  // The mark is 0.71 of its own width tall on this page (`MARK_ASPECT` times
  // `CHEST_STRETCH`), so a 0.300 mark at 0.750 tops out at 0.963 — the collar
  // is 1.0. **This is as high as it goes at this size**, which is what the
  // owner asked for: *"as far up as it can go without interfering with other
  // parts of the design"*. Shrinking it to climb further was offered and
  // measured; vD buys 32 thousandths of height for a third of the mark's area,
  // and the critic's count is that the horns stop resolving. 114 mm across on
  // her body.
  paintMark(sheet, centre - markW / 2, box.y0 + height * markBottom, markW, CHEST_STRETCH);
}

/** Her mark again for the upper back, larger, on the chase camera's surface. */
function paintBackMark(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.backMark;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  // Flat leather, and no painted lighting ramp — the panel this lands on is
  // flat and the sun does its own work.
  inkRect(sheet, box, LEATHER, 1, 1);
  // **Back in patch space — q59.** Until the bug-hunt round this page wrapped
  // the aero hump's loft, placed at s = 0.75 in the loft's own coordinates,
  // and the pod's curvature stretched the letters into drips. The hump is
  // gone; the page's unit square is now the flat back panel (±0.66 rad of the
  // back anchor, 0.150–0.372 m), so the mark is simply centred. The two
  // fractions below are what land her artwork's own aspect on the leather —
  // the page is 2:1 and the panel is not — sized so the mark spans the panel
  // the way a race suit's back print spans the shoulders, and calibrated
  // against the capture rather than trusted arithmetic (`t` on a patch is
  // ring-index space, which is not linear in metres).
  // **Large between the shoulder blades, which is what q59 asked for.** The
  // panel measures 199 mm across and 221 mm up (`tools/uv-anisotropy.mjs`), so
  // this is a 171 mm print — the width a race suit's back graphic actually
  // spans — and its height is the artwork's own rather than a second guess.
  const markWidth = width * 0.86;
  const markHeight = markWidth * MARK_ASPECT * BACK_STRETCH;
  paintMark(
    sheet,
    box.x0 + (width - markWidth) / 2,
    box.y0 + height * 0.50 - markHeight / 2,
    markWidth,
    BACK_STRETCH,
  );
}

/**
 * VARGAS down the outside of her thigh.
 *
 * The real suit carries its manufacturer's name here; the render the owner
 * regenerated carries the same word in the same place. What ships is **her**
 * name, in this project's own letters, which is the §23.9d rule and also the
 * better call: a player who reads anything at all off a leg at riding speed
 * should read the rider.
 */
function paintLegScript(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.legScript;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  inkRect(sheet, box, LEATHER, 1, 1);
  // A faint panel behind it, so the word sits on a surface rather than
  // floating on leather — the same reason her real suit's script runs down a
  // contrast panel.
  inkRect(
    sheet,
    { x0: box.x0 + width * 0.32, y0: box.y0 + height * 0.14, x1: box.x0 + width * 0.68, y1: box.y0 + height * 0.86 },
    PANEL,
    0.55,
    9,
  );
  // Running down the leg: the advance direction is -y, which on this sheet is
  // toward the knee. The letters are drawn on their side, as they are on the
  // reference, so the word reads top-to-bottom when the rider is upright.
  const cap = width * 0.34;
  const length = inkWordLength('VARGAS', cap);
  // `flip` **and** the rotation, and the first sheet proved why both are
  // needed: this page's `y` runs up the leg while letter space runs down from
  // its cap height, and that built-in reflection makes every glyph come out
  // mirrored under any rotation until the letter box is flipped back.
  inkWord(
    sheet,
    'VARGAS',
    [box.x0 + width * 0.33, box.y0 + height * 0.5 + length / 2],
    cap,
    Math.max(3, cap * 0.15),
    WHITE,
    { angle: -Math.PI / 2, alpha: 0.94, flip: true },
  );
}

/**
 * Her logo, in her own colours, for the machine's leg pads — Phase A2.
 *
 * **This is the one place the mark ships as she drew it**: purple head, purple
 * lightning M, white grin. The chest wears a white colourway because a race
 * suit's brand device is white and because the print behind it is already
 * carrying two hues; a wheel's side pad is where a rider's actual sticker goes,
 * and hers is the sticker.
 *
 * The permission is specific and written: the owner asked *"u want this logo
 * in the game:"* and she answered *"That's my logo 🙂"*. §23.5's earlier
 * drafting called for an *original mascot* here on the assumption that her real
 * mark was off limits; her grant superseded it, and this is that correction
 * shipped.
 */
function paintMachineMark(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.machineMark;
  const size = box.x1 - box.x0;
  // **The plate is her pad purple — q60.** The badge the owner remembered as
  // "really cool" was the devil on the purple side pad, and what made it work
  // was never purple-on-purple detail: it was the mark's own near-black
  // keyline and white grin doing the reading on a purple ground. A1d's
  // near-black plate proved the opposite corner fails — purple mark on black
  // plate on black bodywork is nothing at eight metres. So the plate is the
  // pad colour, the sticker idiom of the real wheel, and the mark on it leads
  // with its darkest and whitest parts.
  // The pad purple itself — the old cool badge's own ground. A deep-violet
  // plate was tried between: it separated the badge from the wrap when the two
  // still touched, and once 40 mm of black bodywork did the separating instead
  // it just read as a dim smudge (the blind critic sampled the whole badge
  // under RGB 117). The black gap is the sticker's edge now; the plate goes
  // back to the purple that made the mark pop.
  // **The plate is neutral, and the round before this one had it violet.**
  // Three colours have now been tried under this badge. Her pad's mid purple
  // made a smudge the moment the mark stopped being a drawing and became her
  // actual gradient. A near-black plate lost the badge's *outline* on black
  // bodywork. A dark violet was the compromise, and it failed a measurement
  // the eye had missed: sampled off the render, the artwork's M and V came out
  // at RGB (12, 4, 27) against a plate at (13, 3, 39) — **four levels of
  // contrast**, so the head and the grin carried the badge and her initials
  // were simply not there.
  //
  // The comment that lost round argued from was right and was then ignored:
  // *her artwork reads on black, because that is what it was drawn on.* So the
  // plate keeps its job — a die-cut edge, so the sticker is a sticker — and
  // gives up its hue: one step *lighter* than the bodywork it sits on, neutral,
  // with nothing in it to compete with the only purple that matters.
  const plate = inkOver(MARK_BASE, linearFromHex(0x2e3036));
  // The page's ground is the machine's own bodywork, so the patch's rectangle
  // disappears into the shell instead of ending on it; the sticker is then
  // laid inside that with a soft edge, which is what a vinyl decal's die-cut
  // looks like at eight metres and what stops the badge reading as a panel.
  inkRect(sheet, box, inkOver(MARK_BASE, linearFromHex(0x24252a)), 1, 1);
  inkRect(
    sheet,
    {
      x0: box.x0 + size * 0.045,
      y0: box.y0 + size * 0.085,
      x1: box.x1 - size * 0.045,
      y1: box.y1 - size * 0.085,
    },
    plate,
    1,
    5,
  );
  paintMark(
    sheet,
    box.x0 + size * 0.18,
    box.y0 + size * (1 - 0.64 * MARK_ASPECT * BADGE_STRETCH) / 2,
    size * 0.64,
    BADGE_STRETCH,
  );
}

/** The leg script's page without the word: panel only, on leather. */
function paintLegPlain(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.legPlain;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  inkRect(sheet, box, LEATHER, 1, 1);
  inkRect(
    sheet,
    { x0: box.x0 + width * 0.32, y0: box.y0 + height * 0.14, x1: box.x0 + width * 0.68, y1: box.y0 + height * 0.86 },
    PANEL,
    0.55,
    9,
  );
}

/**
 * The round knee pod — A1c, and it is the regenerated render's own design:
 * both her knees carry a circular guard with a pale ring border and her
 * device inside it. A1b drew a lone chevron here and the reviewer's read of
 * the whole knee region was "too primitive"; a ringed roundel is the shape
 * language of actual knee sliders, and it is also the second place on the
 * rider that repeats her mark's geometry, which is what makes a livery.
 */
function paintKneeDevice(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.kneeDevice;
  const size = box.x1 - box.x0;
  const centre: InkPoint = [box.x0 + size * 0.5, box.y0 + size * 0.52];
  const plate = inkOver(MARK_BASE, linearFromHex(0x2b2c32));
  inkRect(sheet, box, LEATHER, 1, 1);
  // The moulded plate, soft-edged so it sits in the guard rather than on it;
  // then the white ring, drawn as two discs; then her mark, small and white,
  // with the plate as its cut colour so the face reads at knee size.
  inkDisc(sheet, centre, size * 0.46, PANEL, 0.5, 8);
  inkDisc(sheet, centre, size * 0.405, WHITE, 0.92, 2.5);
  inkDisc(sheet, centre, size * 0.345, plate, 1, 2.5);
  // Sized off the reference render, where the device fills about half the
  // roundel's ring and a little under half the knee. The height follows the
  // artwork through `KNEE_STRETCH`, which is the largest of the four: a knee
  // page is half again as wide in metres as it is tall.
  const markSize = size * 0.40;
  paintMark(
    sheet,
    centre[0] - markSize / 2,
    centre[1] - markSize * MARK_ASPECT * KNEE_STRETCH * 0.5,
    markSize,
    KNEE_STRETCH,
  );
}

/**
 * The visor: a mirror gradient, and no brand anywhere on it.
 *
 * **A gradient, where a hard streak failed.** The first pass at a rider's
 * mirrored visor put a bright rectangle on the shield and the owner called it
 * "that bandaid white square thing" — a hard highlight needs surrounding
 * detail to read as light rather than as paint. What a texture can do that a
 * patch could not is put the *whole* sweep in: deep blue at the brow, cyan
 * toward the chin, and one soft diagonal band across it that never has an edge
 * to catch on.
 */
function paintVisor(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.visor;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const deep = inkOver(VISOR_BASE, linearFromHex(0x1d3f86));
  const cyan = inkOver(VISOR_BASE, linearFromHex(0x64e2ee));
  inkField(sheet, box, (x, y) => {
    const s = (x - box.x0) / width;
    const t = (y - box.y0) / height;
    // Top of the shield is deep blue; the lower half turns cyan, more so
    // toward her left, which is where the render's sky lands on it.
    const toward = Math.min(1, Math.max(0, (0.72 - t) / 0.72)) * (0.55 + 0.45 * (1 - s));
    const base = mixRgb(deep, cyan, toward);
    // The soft band: a wide diagonal that lifts the mirror back toward its own
    // colour rather than toward white.
    const band = Math.exp(-(((s * 0.8 + t) - 0.92) ** 2) / 0.020);
    return [mixRgb(base, CLEAR, band * 0.42), 1];
  });
}

/**
 * Strand banding for the hair.
 *
 * The mesh already carries her two values as vertex colour — dark hair with
 * bleached lanes — and this adds the frequency a vertex colour cannot: fine
 * darker separations between locks, drifting as they fall. Multiplier ink can
 * only darken, so every *light* streak in her hair is the mesh's and every
 * shadow between them is the sheet's, which is the right division of labour:
 * the highlights have to survive being merged into one buffer, and the
 * separations only have to be seen.
 */
function paintHair(sheet: InkSheet): void {
  const box = PIXEL_REGIONS.hair;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const shadow = inkOver(MARK_BASE, linearFromHex(0xa2a2a2));
  inkField(sheet, box, (x, y) => {
    const s = (x - box.x0) / width;
    const t = (y - box.y0) / height;
    // Lanes around the strand, wandering as they run: a straight lane down a
    // falling mass reads as a printed stripe, and hair does not have those.
    // Wandering harder than A1c's, so no lane holds a line for more than about
    // a seventh of the length.
    const wander = Math.sin(t * 7.0) * 0.10 + Math.sin(t * 2.3 + 1.7) * 0.06;
    // **Seven lanes now, not three.** The count was tuned when every piece
    // carrying length was a thin tube whose `u` wrapped a small circumference;
    // A1d's mass is carried by plates six times wider, and three lanes across
    // one of those is three broad stripes. More lanes at lower amplitude is
    // how a wide surface reads as many strands instead of a few painted bars.
    const lane = Math.sin((s + wander) * Math.PI * 2 * 7);
    const depth = Math.min(1, Math.max(0, (0.86 - t) / 0.5));
    const dark = Math.max(0, lane) ** 2.6 * (0.10 + 0.20 * depth);
    // The break: hair separates *across* its length as well as along it, and
    // nothing in this page said so before. High frequency and shallow, so it
    // reads as texture rather than as rungs.
    const brk = 0.5 + 0.5 * Math.sin(t * 23.0 + s * 6.0);
    // The roots go down independently of the vertex bleach, which is what
    // stops a lit mass from glowing all the way to the scalp.
    const root = Math.min(1, Math.max(0, (t - 0.72) / 0.28)) * 0.16;
    return [shadow, dark + brk ** 3 * 0.07 + root];
  });
}

// -- The sheet ---------------------------------------------------------------

let cachedPixels: Uint8Array | null = null;

/**
 * Paint the whole sheet. Pure, deterministic, and memoised at module scope.
 *
 * The pixels are shared between every rig that wears her — the player's, the
 * ghost's, the chooser's preview — because they are the same million texels
 * and painting them again per rig would be a stutter on a character swap for
 * no gain. Each rig still gets its **own** `THREE.DataTexture` over that
 * buffer, so disposal stays exactly where every other GPU resource in
 * `render/rider.ts` lives: with the rig that made it.
 */
export function maribelAtlasPixels(): Uint8Array {
  if (cachedPixels !== null) return cachedPixels;
  // Neutral everywhere first: an unpainted texel must multiply by one, so a
  // part mapped to a region with no art on it renders exactly as its vertex
  // colours say. This is also what makes the gutters between regions safe —
  // what bleeds across a boundary at a coarse mip level is "no ink".
  const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
  paintChest(sheet);
  paintBackMark(sheet);
  paintLegScript(sheet);
  paintKneeDevice(sheet);
  paintLegPlain(sheet);
  paintMachineMark(sheet);
  paintVisor(sheet);
  paintHair(sheet);
  cachedPixels = toSrgbBytes(sheet);
  return cachedPixels;
}

/**
 * A texture over those pixels, for one rig.
 *
 * sRGB, because what was painted is a colour rather than data. Mipmapped and
 * anisotropic, because the alternative on a halftone print is moiré across a
 * rider's chest every time the camera moves — and "nothing may be annoying" is
 * a standing rule on this project, not a preference.
 */
export function createMaribelAtlas(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    maribelAtlasPixels(),
    ATLAS_SIZE,
    ATLAS_SIZE,
    THREE.RGBAFormat,
  );
  texture.name = 'maribel-atlas';
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
