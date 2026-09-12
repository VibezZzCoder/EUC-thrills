/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * A tiny software rasterizer — the print shop's press.
 *
 * **This file imports nothing but the alphabet**, nearly as `render/skyImage.ts`
 * imports nothing, and for the same reason: the sheet it prints is the one part
 * of a character worth asserting numerically, and routing it through a 2D canvas
 * would have put a DOM between `node --test` and every dot on a rider's chest.
 * `render/maribelAtlas.ts` wraps what this returns in a `THREE.DataTexture`;
 * nothing here knows a GPU exists. The one import is `shared/letterPaths.ts`,
 * which itself imports nothing — it is this file's own stroke table, moved down
 * a layer at M36 so `level/` could print the same letters on the ground, and
 * re-exported below so no caller had to move with it.
 *
 * **There is no text API, and that is a decision rather than an omission.**
 * `CanvasRenderingContext2D.fillText` resolves a family name against whatever
 * the player's operating system happens to ship — so the same build would
 * print one wordmark on the owner's Mac, another on a Windows handset, and a
 * third on the capture box whose screenshots this project compares against
 * each other. Lettering is authored here as **stroke paths** (`inkStroke`), in
 * a normalised letter box, and is therefore the same six shapes everywhere.
 *
 * **Everything composites in linear light and encodes to sRGB once, on the way
 * out** (`DESIGN.md` §2). That is not a nicety on this sheet: what it paints is
 * a *multiplier* — three.js decodes the texture back to linear and multiplies
 * it into the material colour and the vertex colour — so a value blended in
 * sRGB would land somewhere the arithmetic never intended, and a halftone dot
 * would come out a different colour at its soft edge than in its middle.
 *
 * Coverage is analytic rather than sampled: every primitive is a signed
 * distance function, and a pixel one unit outside a shape gets none of it while
 * a pixel one unit inside gets all of it. That gives clean edges at any size
 * without supersampling, which matters because this sheet is painted at boot.
 */

import {
  LETTER_ASPECT,
  wordLength,
  wordStrokes,
  type LetterPoint,
  type WordMetrics,
} from '../shared/letterPaths.ts';

/** Linear-light RGB, 0..1 per channel. Not sRGB — see the file comment. */
export type Rgb = readonly [number, number, number];

/** A pixel-space rectangle: the region a paint operation may touch. */
export interface InkBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A point in pixel space. `y` grows downward, and row 0 is `v = 0`. */
export type InkPoint = readonly [number, number];

/**
 * A sheet being printed: linear RGB, three floats a pixel, no alpha.
 *
 * No alpha channel because the sheet is opaque by construction — it starts as
 * a colour and every operation composites onto it. Alpha exists only as an
 * operation's own coverage.
 */
export interface InkSheet {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/** Decode an sRGB hex the way `THREE.Color` does, into linear light. */
export function linearFromHex(hex: number): Rgb {
  return [
    linearFromByte((hex >> 16) & 0xff),
    linearFromByte((hex >> 8) & 0xff),
    linearFromByte(hex & 0xff),
  ];
}

/**
 * One sRGB byte, decoded to linear light.
 *
 * Named and shared because `inkRaster` decodes a quarter of a million of them
 * off a real image and a hex literal decodes three: two curves that are meant
 * to be the same curve are one edit away from not being, and the thing that
 * would drift is the colour of somebody's logo.
 */
export function linearFromByte(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** A 256-entry table of that curve. The inner loop of a raster stamp. */
const LINEAR_BYTE = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) table[i] = linearFromByte(i);
  return table;
})();

/**
 * The multiplier that turns `base` into `target`, per channel, clamped to 1.
 *
 * `blockoutKit.tintOver` is this function's vertex-colour twin, and the pair is
 * the whole colour discipline of a painted rider: a vertex tint may lift a
 * near-black suit to a near-white printing ground because it is a float, and
 * this one may only ever *darken*, because a texel is eight bits and 1.0 is as
 * bright as it goes. That asymmetry is why the printed field's ground is
 * painted by the mesh and its ink by the sheet, and not the other way round.
 */
export function inkOver(base: Rgb, target: Rgb): Rgb {
  return [
    Math.min(1, target[0] / Math.max(1e-4, base[0])),
    Math.min(1, target[1] / Math.max(1e-4, base[1])),
    Math.min(1, target[2] / Math.max(1e-4, base[2])),
  ];
}

/** Blend two linear colours. `t = 0` is `a`. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A blank sheet, flooded with one colour. */
export function inkSheet(width: number, height: number, base: Rgb): InkSheet {
  const data = new Float32Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = base[0];
    data[i + 1] = base[1];
    data[i + 2] = base[2];
  }
  return { width, height, data };
}

/** Composite one pixel. `alpha` outside (0, 1] is a no-op or a straight write. */
function blend(sheet: InkSheet, x: number, y: number, colour: Rgb, alpha: number): void {
  if (alpha <= 0) return;
  if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return;
  const i = (y * sheet.width + x) * 3;
  const a = alpha >= 1 ? 1 : alpha;
  const keep = 1 - a;
  sheet.data[i] = sheet.data[i]! * keep + colour[0] * a;
  sheet.data[i + 1] = sheet.data[i + 1]! * keep + colour[1] * a;
  sheet.data[i + 2] = sheet.data[i + 2]! * keep + colour[2] * a;
}

/** Clamp a box to the sheet and round it out to whole pixels. */
function clipBox(sheet: InkSheet, box: InkBox): InkBox {
  return {
    x0: Math.max(0, Math.floor(box.x0)),
    y0: Math.max(0, Math.floor(box.y0)),
    x1: Math.min(sheet.width - 1, Math.ceil(box.x1)),
    y1: Math.min(sheet.height - 1, Math.ceil(box.y1)),
  };
}

/**
 * Paint whatever a function says, pixel by pixel, inside one box.
 *
 * The general operation every other one below is expressed through. A shader in
 * spirit: it is handed the pixel centre and returns a colour and a coverage, so
 * a gradient, a halftone field and a noise band are all the same call.
 */
export function inkField(
  sheet: InkSheet,
  box: InkBox,
  shade: (x: number, y: number) => readonly [Rgb, number] | null,
): void {
  const clipped = clipBox(sheet, box);
  for (let y = clipped.y0; y <= clipped.y1; y += 1) {
    for (let x = clipped.x0; x <= clipped.x1; x += 1) {
      const sample = shade(x + 0.5, y + 0.5);
      if (sample === null) continue;
      blend(sheet, x, y, sample[0], sample[1]);
    }
  }
}

/**
 * Paint a shape given as a signed distance in pixels — negative inside.
 *
 * `softness` widens the edge ramp. 1 is a clean antialiased edge; a printed
 * dot on fabric wants 1.4 or so, because ink bleeds into a weave and a
 * mathematically hard circle at this size reads as a pixel rather than as a
 * dot.
 */
export function inkShape(
  sheet: InkSheet,
  box: InkBox,
  distance: (x: number, y: number) => number,
  colour: Rgb,
  alpha = 1,
  softness = 1,
): void {
  inkField(sheet, box, (x, y) => {
    const d = distance(x, y);
    const coverage = Math.min(1, Math.max(0, 0.5 - d / softness));
    return coverage <= 0 ? null : [colour, coverage * alpha];
  });
}

/** A filled disc. */
export function inkDisc(
  sheet: InkSheet,
  centre: InkPoint,
  radius: number,
  colour: Rgb,
  alpha = 1,
  softness = 1,
): void {
  const box = {
    x0: centre[0] - radius - 2,
    y0: centre[1] - radius - 2,
    x1: centre[0] + radius + 2,
    y1: centre[1] + radius + 2,
  };
  inkShape(sheet, box, (x, y) => Math.hypot(x - centre[0], y - centre[1]) - radius, colour, alpha, softness);
}

/** Distance from a point to a line segment. */
function distanceToSegment(x: number, y: number, a: InkPoint, b: InkPoint): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const wx = x - a[0];
  const wy = y - a[1];
  const length = ex * ex + ey * ey;
  const t = length < 1e-9 ? 0 : Math.min(1, Math.max(0, (wx * ex + wy * ey) / length));
  return Math.hypot(wx - ex * t, wy - ey * t);
}

/**
 * A stroked polyline with round caps and joins — the lettering primitive.
 *
 * Round joins rather than mitred ones because a mitre on a thirty-pixel letter
 * at a sharp angle (the V, the zigzag of her M) throws a spike several pixels
 * past where the path goes, and a wordmark that grows spurs is worse than one
 * whose corners are a little soft.
 */
export function inkStroke(
  sheet: InkSheet,
  points: readonly InkPoint[],
  width: number,
  colour: Rgb,
  alpha = 1,
  softness = 1,
): void {
  if (points.length < 2) return;
  const radius = width / 2;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of points) {
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  const box = { x0: x0 - radius - 2, y0: y0 - radius - 2, x1: x1 + radius + 2, y1: y1 + radius + 2 };
  inkShape(sheet, box, (x, y) => {
    let nearest = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      nearest = Math.min(nearest, distanceToSegment(x, y, points[i - 1]!, points[i]!));
    }
    return nearest - radius;
  }, colour, alpha, softness);
}

/**
 * A filled simple polygon, by the standard even-odd distance form.
 *
 * Handles concave outlines — which the lightning M in her logo very much is —
 * without asking the caller to triangulate anything.
 */
export function inkPolygon(
  sheet: InkSheet,
  points: readonly InkPoint[],
  colour: Rgb,
  alpha = 1,
  softness = 1,
): void {
  if (points.length < 3) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of points) {
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  inkShape(sheet, { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 }, (x, y) => {
    let nearest = Infinity;
    let inside = 1;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i]!;
      const b = points[j]!;
      nearest = Math.min(nearest, distanceToSegment(x, y, a, b));
      const crossesRow = (y >= a[1]) !== (y >= b[1]);
      if (crossesRow) {
        const at = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (x < at) inside = -inside;
      }
    }
    return inside < 0 ? -nearest : nearest;
  }, colour, alpha, softness);
}

/** An axis-aligned rectangle, with an optional soft edge. */
export function inkRect(sheet: InkSheet, box: InkBox, colour: Rgb, alpha = 1, softness = 1): void {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const hx = (box.x1 - box.x0) / 2;
  const hy = (box.y1 - box.y0) / 2;
  inkShape(sheet, { x0: box.x0 - 2, y0: box.y0 - 2, x1: box.x1 + 2, y1: box.y1 + 2 }, (x, y) => {
    const dx = Math.abs(x - cx) - hx;
    const dy = Math.abs(y - cy) - hy;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  }, colour, alpha, softness);
}

// -- Lettering ---------------------------------------------------------------

/**
 * The alphabet moved down a layer at M36 Phase 2, and is re-exported here.
 *
 * `level/parkSignage.ts` prints the same letters onto the *ground*, as road
 * paint, and `level/` may not import `render/` (AGENTS.md invariant 5). The
 * table had to move or be copied, and `inkKit.ts` has argued since M23 that a
 * project with two alphabets has two answers to what its lettering looks like
 * — so it moved, to `shared/letterPaths.ts`, which still imports nothing.
 *
 * Re-exported rather than re-pointed at the callers: `render/props.ts`, the
 * character sheets and their specs all import the alphabet from here, and a
 * rename across them would be churn with no claim attached. What stays in this
 * file is the *press* — `inkWord` is the only thing here that knows a word
 * from a shape.
 */
export { LETTER_ASPECT, wordStrokes };
export type { LetterPoint, WordMetrics };

export function inkWord(
  sheet: InkSheet,
  word: string,
  origin: InkPoint,
  height: number,
  weight: number,
  colour: Rgb,
  options: WordMetrics & {
    readonly angle?: number;
    readonly alpha?: number;
  } = {},
): void {
  const angle = options.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const stroke of wordStrokes(word, height, options)) {
    const placed = stroke.map(([px, py]): InkPoint => (
      [origin[0] + px * cos - py * sin, origin[1] + px * sin + py * cos]
    ));
    inkStroke(sheet, placed, weight, colour, options.alpha ?? 1);
  }
}

/**
 * How long a word printed at this height will be, in pixels.
 *
 * The arithmetic is `shared/letterPaths.ts`'s, so the ruler and the press can
 * no longer disagree about the width of a word — which is the same reason
 * `wordStrokes` was ever the one placement rule.
 */
export function inkWordLength(word: string, height: number, tracking = 0.16): number {
  return wordLength(word, height, tracking);
}

/**
 * Straight (non-premultiplied) 8-bit RGBA. `render/pngDecode.ts` produces one.
 *
 * Declared structurally rather than imported so this file keeps importing
 * nothing — see the file comment. Anything with these three fields prints.
 */
export interface InkRaster {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes, row-major, **top row first**. */
  readonly rgba: Uint8Array;
}

/**
 * Print a real image onto the sheet, area-averaged, as a multiplier over `base`.
 *
 * **The one press operation that does not draw anything.** Every other
 * primitive here is a signed distance function this project authored; this one
 * carries somebody else's pixels through unchanged, because
 * `data/mvLogoAsset.ts` exists precisely so that Maribel Vargas's mark is not
 * redrawn again. Three details are load-bearing:
 *
 *   - **It flips vertically.** A raster's first row is its top; this sheet's
 *     first row is `v = 0`, which is *down* the body (see the region table in
 *     `render/maribelAtlas.ts`). Printing without the flip puts a logo on its
 *     head, and it is a flip in exactly one place rather than a convention
 *     every caller has to remember.
 *   - **It resamples in premultiplied alpha.** The asset pack's own downscales
 *     do not, and it shows: their 256 px copy has black bleeding out of every
 *     antialiased edge, because averaging a transparent black texel with an
 *     opaque purple one darkens the purple. Weighting colour by coverage is
 *     what keeps the mark's edge the mark's colour.
 *   - **It area-averages rather than point-samples.** A logo minified by 1.8:1
 *     with nearest or bilinear taps loses whole teeth out of a grin; the box
 *     filter integrates every source texel that lands under a destination one.
 *
 * `box` is the destination rectangle in sheet pixels, and the caller is
 * responsible for its aspect: this function fills the box it is given, which
 * means a box of the wrong shape stretches the art. `render/maribelAtlas.ts`
 * derives every one of them from `MV_LOGO_ASPECT` for that reason.
 */
export function inkRaster(sheet: InkSheet, box: InkBox, raster: InkRaster, base: Rgb): void {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(sheet.width, Math.ceil(box.x1));
  const y1 = Math.min(sheet.height, Math.ceil(box.y1));
  const spanX = box.x1 - box.x0;
  const spanY = box.y1 - box.y0;
  if (spanX <= 0 || spanY <= 0) return;
  const scaleX = raster.width / spanX;
  const scaleY = raster.height / spanY;
  const guard = [Math.max(1e-4, base[0]), Math.max(1e-4, base[1]), Math.max(1e-4, base[2])];

  for (let y = y0; y < y1; y += 1) {
    // The flip: the destination row nearest the top of the box reads the
    // source row nearest the top of the image.
    const topEdge = (box.y1 - (y + 1)) * scaleY;
    const bottomEdge = (box.y1 - y) * scaleY;
    const sy0 = Math.max(0, Math.floor(topEdge));
    const sy1 = Math.min(raster.height, Math.ceil(bottomEdge));
    for (let x = x0; x < x1; x += 1) {
      const leftEdge = (x - box.x0) * scaleX;
      const rightEdge = (x + 1 - box.x0) * scaleX;
      const sx0 = Math.max(0, Math.floor(leftEdge));
      const sx1 = Math.min(raster.width, Math.ceil(rightEdge));
      let weight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        const coverY = Math.min(bottomEdge, sy + 1) - Math.max(topEdge, sy);
        if (coverY <= 0) continue;
        const row = sy * raster.width * 4;
        for (let sx = sx0; sx < sx1; sx += 1) {
          const coverX = Math.min(rightEdge, sx + 1) - Math.max(leftEdge, sx);
          if (coverX <= 0) continue;
          const area = coverX * coverY;
          const i = row + sx * 4;
          // Premultiplied, in linear light: coverage times colour.
          const a = raster.rgba[i + 3]! / 255;
          const share = area * a;
          red += LINEAR_BYTE[raster.rgba[i]!]! * share;
          green += LINEAR_BYTE[raster.rgba[i + 1]!]! * share;
          blue += LINEAR_BYTE[raster.rgba[i + 2]!]! * share;
          alpha += share;
          weight += area;
        }
      }
      if (weight <= 0 || alpha <= 0) continue;
      // Back to straight colour, then to the multiplier that lands on it.
      const coverage = alpha / weight;
      blend(
        sheet,
        x,
        y,
        [
          Math.min(1, red / alpha / guard[0]!),
          Math.min(1, green / alpha / guard[1]!),
          Math.min(1, blue / alpha / guard[2]!),
        ],
        coverage,
      );
    }
  }
}

// -- Output ------------------------------------------------------------------

/**
 * Encode the sheet as sRGB RGBA bytes, ready for a `THREE.DataTexture`.
 *
 * Opaque alpha throughout. The sheet is a multiplier over surfaces that are
 * already solid, so transparency here would mean "let the sky through a
 * rider's chest", and every place the art needs to disappear it disappears by
 * being 1.0 — the value that multiplies nothing.
 */
export function toSrgbBytes(sheet: InkSheet): Uint8Array {
  const encode = (channel: number): number => {
    const clamped = Math.min(1, Math.max(0, channel));
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  };
  const bytes = new Uint8Array(sheet.width * sheet.height * 4);
  for (let i = 0, j = 0; i < sheet.data.length; i += 3, j += 4) {
    bytes[j] = encode(sheet.data[i]!);
    bytes[j + 1] = encode(sheet.data[i + 1]!);
    bytes[j + 2] = encode(sheet.data[i + 2]!);
    bytes[j + 3] = 255;
  }
  return bytes;
}

/** Read one pixel back, in linear light. For tests and for the gutter pass. */
export function inkSample(sheet: InkSheet, x: number, y: number): Rgb {
  const cx = Math.min(sheet.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(sheet.height - 1, Math.max(0, Math.round(y)));
  const i = (cy * sheet.width + cx) * 3;
  return [sheet.data[i]!, sheet.data[i + 1]!, sheet.data[i + 2]!];
}
