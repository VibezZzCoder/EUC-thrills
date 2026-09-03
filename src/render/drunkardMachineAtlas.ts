/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import type { LoftProfile, UvRect } from './blockoutKit.ts';
import { paintHop } from './drunkardAtlas.ts';
import {
  inkField, inkOver, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, type InkSheet, type Rgb,
} from './inkKit.ts';

/**
 * The sheet The Drunkard's wheel wears — M29 Phase 3 (`docs/PLANS.md` §29.6).
 *
 * One page that matters: **the pads' face**, an amber field with a brown
 * roundel at the pad's centre carrying the hop cone — the one flat surface
 * at shin height, and the cone is what makes the pad his rather than a
 * recoloured Maribel's. The cone is `paintHop` from the rider's sheet, so
 * the cone on his chest, his knees, his cans and his wheel is one drawing
 * (`render/drunkardAtlas.ts`). A `plate` page is laid out for a small cream
 * hop plate on the nose and left as plain cream: the target render's nose
 * carries an amber panel pair and no third colour, so nothing asks for it
 * yet. Everything else on the wheel is paint or a tinted patch and lands on
 * `blank`.
 *
 * **A sheet of its own, and small** — Wheel in Motion's reasoning
 * (`render/wimMachineAtlas.ts`): the machine's trim and pad materials are the
 * only things that sample it, and 512 × 256 is what one pad face and a gutter
 * cost. The rider's 1024² sheet is exactly the pages his rig wears and
 * `render/drunkard.test.ts` holds it to that.
 *
 * **The ground is cream and the amber is ink**, the rider's rule one
 * material over: the pad material is the trim's cream when it wears the
 * page (`MachineLook.pads.colour`), and a texel can only darken, so the
 * amber field, the brown roundel and the green cone all hang from the cream.
 * No `fillText`, no font, no `Math.random`, no raster (invariant 12).
 */

export const MACHINE_SHEET_WIDTH = 512;
export const MACHINE_SHEET_HEIGHT = 256;

/** Where each page sits, in sheet pixels. Sheet `y` grows up the pad, as a loft's `v` does. */
const PIXEL_REGIONS = {
  /**
   * The pad's face, wrapped: `x` runs round the block from the inboard face,
   * so the page's centre is the outboard face's centre (`render/euc.ts`
   * turns the left pad's page by half a wrap). 208 rows for 200 mm of pad
   * and 448 columns for its 700 mm perimeter — the anisotropy `padFace`
   * absorbs by painting in metres.
   */
  pads: { x0: 0, y0: 0, x1: 448, y1: 208 },
  /** A small cream plate for the nose, laid out and unpainted — see the file comment. */
  plate: { x0: 0, y0: 224, x1: 128, y1: 256 },
  /**
   * Neutral. Every tinted piece renders exactly as its vertex colours say. A
   * gutter of 32 texels keeps the pages' edges out of it at every mip level.
   */
  blank: { x0: 480, y0: 0, x1: 512, y1: 256 },
} as const;

export type DrunkardMachineRegionName = keyof typeof PIXEL_REGIONS;

/** The same table in texture coordinates, half a texel in from each edge. */
export const DRUNKARD_MACHINE_REGIONS: Readonly<Record<DrunkardMachineRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
      u0: (box.x0 + 0.5) / MACHINE_SHEET_WIDTH,
      v0: (box.y0 + 0.5) / MACHINE_SHEET_HEIGHT,
      u1: (box.x1 - 0.5) / MACHINE_SHEET_WIDTH,
      v1: (box.y1 - 0.5) / MACHINE_SHEET_HEIGHT,
    })]),
  ),
) as Readonly<Record<DrunkardMachineRegionName, UvRect>>;

/** Resolve a patch's `art` to its page; anything unnamed is neutral. */
export function drunkardMachineRegion(art: string | undefined): UvRect {
  return art !== undefined && art in DRUNKARD_MACHINE_REGIONS
    ? DRUNKARD_MACHINE_REGIONS[art as DrunkardMachineRegionName]
    : DRUNKARD_MACHINE_REGIONS.blank;
}

/**
 * What the sheet needs to know about the body it lands on: the pad block the
 * `pads` page wraps, in metres about the pad's centre, and how many facets
 * the loft is built with — because the page lands on the *mesh*, not on the
 * analytic superellipse (`padFace`).
 */
export interface DrunkardMachineLayout {
  readonly pad: LoftProfile;
  /** `MachineLook.pads.segments` for the same look: the loft's radial facet count. */
  readonly segments: number;
}

// -- The inks ----------------------------------------------------------------

/** The trim's cream: the pad material when it wears the page, and what every ink below is a multiplier over. */
const TRIM = linearFromHex(BLOCKOUT_COLOURS.machineDrunkardTrim);
const CLEAR: Rgb = [1, 1, 1];
/** The pad's amber — the wheel's own, a step under the jersey's (`data/tuning.ts`). */
const AMBER = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.machineDrunkardAmber));
/** The roundel under the cone: the render's brown plate, in the rider's printed brown. */
const BROWN = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown));
/** The roundel's rim: a step darker, the gear brown, so the plate has an edge on the amber. */
const RIM = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.drunkardGear));

/**
 * The roundel's radius and the cone's width on it, metres of the pad's face.
 *
 * The render's plate is about half the pad's height; 52 mm on a 200 mm pad
 * is that, and it leaves 25 mm of amber above and below the plate at the
 * pad's widest so the pad still reads amber from the chase camera. The cone
 * at 56 mm wide is 76 mm tall (`HOP_ASPECT`) and its stem rises another
 * tenth of that, to 45 mm above the centre — 7 mm inside the 52 mm disc,
 * so the stem stops on the plate and not on its rim.
 */
export const PAD_ROUNDEL_RADIUS = 0.052;
export const PAD_HOP_WIDTH = 0.056;
/** The rim's width, metres. */
const PAD_RIM = 0.005;

/** The ring the page's `t` lands on: a fractional ring index and the section lerped there, as the mesh lerps it. */
function ringAtT(layout: DrunkardMachineLayout, t: number): { y: number; halfWidth: number; halfDepth: number; square: number; v: number } {
  const rings = layout.pad;
  const last = rings.length - 1;
  const v = Math.min(last, Math.max(0, t * last));
  const i = Math.min(last - 1, Math.floor(v));
  const f = v - i;
  const lower = rings[i]!;
  const upper = rings[i + 1]!;
  return {
    v,
    y: lower.y + (upper.y - lower.y) * f,
    halfWidth: lower.halfWidth + (upper.halfWidth - lower.halfWidth) * f,
    halfDepth: lower.halfDepth + (upper.halfDepth - lower.halfDepth) * f,
    square: lower.square + (upper.square - lower.square) * f,
  };
}

/** A section's vertex at a loft angle — `loftPoint`'s superellipse, in the pad's own frame. */
function sectionPoint(section: { halfWidth: number; halfDepth: number; square: number }, u: number): { x: number; z: number } {
  const e = 2 / section.square;
  const c = Math.cos(u);
  const s = Math.sin(u);
  return {
    x: section.halfWidth * Math.sign(c) * Math.abs(c) ** e,
    z: section.halfDepth * Math.sign(s) * Math.abs(s) ** e,
  };
}

/**
 * Where a texel of the `pads` page lands on the pad, in the pad's own frame
 * — `z` fore/aft along the flank (metres, + forward), `y` about the pad's
 * centre — and whether it is on the outboard face at all. The page's `s`
 * runs round the block from the *inboard* face, so its centre is the
 * outboard face's centre (`render/euc.ts` turns the left pad's page by half
 * a wrap).
 *
 * **On the mesh, not on the curve — and the first capture is why.** A loft
 * has `segments` vertex columns at even angles with texture coordinates
 * interpolated *linearly* between them, and this pad's outboard face is one
 * flat facet from −30° to +30° at twelve segments. On the analytic
 * superellipse the angle crawls across that flat — 0.184 rad is 52 mm out
 * from the centre — but on the facet the same texel sits at 34 mm, so a
 * roundel painted against the curve rendered as a tall oval two thirds its
 * width. The mapping here walks the columns the way the mesh does: the
 * section's vertices at the column angles, and a straight line between.
 */
function padFace(layout: DrunkardMachineLayout, s: number, t: number): { z: number; y: number; outboard: boolean } {
  const section = ringAtT(layout, t);
  const columns = layout.segments;
  // Page `s` 0.5 is column 0 (+X, the left pad's outboard centre); wrap so
  // a page column index is never negative.
  const column = ((s - 0.5) * columns + columns) % columns;
  const k = Math.floor(column);
  const f = column - k;
  const a = sectionPoint(section, (k / columns) * Math.PI * 2);
  const b = sectionPoint(section, ((k + 1) / columns) * Math.PI * 2);
  const x = a.x + (b.x - a.x) * f;
  const z = a.z + (b.z - a.z) * f;
  return { z, y: section.y, outboard: x > 0 };
}

/**
 * Where a face point on the outboard side lands on the `pads` page, in
 * sheet pixels — `padFace`'s inverse for the test that samples the art.
 * Walks the same columns: the facet whose end vertices bracket `z`, and the
 * straight-line share along it.
 */
export function drunkardPadPagePixel(layout: DrunkardMachineLayout, z: number, y: number): readonly [number, number] {
  const box = PIXEL_REGIONS.pads;
  const rings = layout.pad;
  const last = rings.length - 1;
  let v = last;
  for (let i = 1; i <= last; i += 1) {
    if (y <= rings[i]!.y) { v = i - 1 + (y - rings[i - 1]!.y) / (rings[i]!.y - rings[i - 1]!.y); break; }
  }
  const section = ringAtT(layout, v / last);
  const columns = layout.segments;
  // Outboard columns run from −columns/4 to +columns/4 about column 0; `z`
  // grows with the column index there.
  const quarter = Math.floor(columns / 4);
  let s = 0.5;
  for (let k = -quarter; k < quarter; k += 1) {
    const a = sectionPoint(section, (k / columns) * Math.PI * 2).z;
    const b = sectionPoint(section, ((k + 1) / columns) * Math.PI * 2).z;
    if (z >= a && z <= b) {
      s = 0.5 + (k + (z - a) / (b - a)) / columns;
      break;
    }
  }
  return [box.x0 + (box.x1 - box.x0) * s, box.y0 + (box.y1 - box.y0) * (v / last)];
}

/**
 * The cone, drawn once on a square stamp in metres and resampled onto the
 * page through `padFace`.
 *
 * **Why not `paintHop` straight onto the page:** a loft's `u` is an angle,
 * and on a superellipse as square as the pad the angle crawls across the
 * flat face — the page's centre column is 5 mm a texel where its edges are
 * 2 mm — so a cone drawn in the page's pixels lands stretched through its
 * middle. The chest and the knees are painted the same way for the same
 * reason (`drunkardAtlas.ts` authors in metres); here the one drawing is
 * kept the one drawing by rasterising it square and letting the face
 * mapping place every texel where it belongs. 2000 px/m is four times the
 * page's finest density, so the resample never softens the bracts' edges.
 */
const STAMP_DENSITY = 2000;
/**
 * The stamp covers the whole roundel, not just the cone's box: every face
 * point inside the disc reads a stamp texel of its own, and the plain brown
 * between the cone and the rim is the flood, never a clamped edge pixel —
 * the first cut sized the stamp to the cone and the stem's top row was
 * what every point above it read.
 */
const STAMP_SIZE = Math.ceil(PAD_ROUNDEL_RADIUS * 2 * STAMP_DENSITY) + 8;

function paintStamp(): InkSheet {
  // Flooded with the roundel's brown, so the cone's antialiased edges blend
  // into the plate they sit on rather than into a cream that is not there.
  const stamp = inkSheet(STAMP_SIZE, STAMP_SIZE, BROWN);
  paintHop(stamp, STAMP_SIZE / 2, STAMP_SIZE / 2, PAD_HOP_WIDTH * STAMP_DENSITY, 1);
  return stamp;
}

/** Bilinear read of the stamp at a face point, metres from the roundel's centre. */
function stampAt(stamp: InkSheet, dz: number, dy: number): Rgb {
  const x = STAMP_SIZE / 2 + dz * STAMP_DENSITY - 0.5;
  const y = STAMP_SIZE / 2 + dy * STAMP_DENSITY - 0.5;
  const x0 = Math.min(STAMP_SIZE - 2, Math.max(0, Math.floor(x)));
  const y0 = Math.min(STAMP_SIZE - 2, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const at = (px: number, py: number): Rgb => {
    const i = (py * STAMP_SIZE + px) * 3;
    return [stamp.data[i]!, stamp.data[i + 1]!, stamp.data[i + 2]!];
  };
  return mixRgb(mixRgb(at(x0, y0), at(x0 + 1, y0), fx), mixRgb(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
}

/**
 * The pad's art: amber to every edge, the brown roundel at the pad's centre
 * with its darker rim, the cone on it. The inboard face is amber too — it is
 * buried in the shell, and a cream inboard face would show as a cream line
 * wherever the pad's rim meets the bodywork. The right pad wears the same
 * page mirrored, as every pad patch always has; the cone is near enough
 * symmetric that the mirror reads as the same cone.
 */
function paintPads(sheet: InkSheet, layout: DrunkardMachineLayout): void {
  const box = PIXEL_REGIONS.pads;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const stamp = paintStamp();
  // Coverage over a signed distance in metres: a 3 mm edge, the pad page's
  // own texel at its finest, so the roundel's edge is antialiased and not
  // a stair.
  const EDGE = 0.003;
  const cover = (d: number): number => Math.min(1, Math.max(0, 0.5 - d / EDGE));
  inkField(sheet, box, (px, py) => {
    const s = (px - box.x0) / width;
    const t = (py - box.y0) / height;
    const { z, y, outboard } = padFace(layout, s, t);
    if (!outboard) return [AMBER, 1];
    const r = Math.hypot(z, y);
    let colour: Rgb = AMBER;
    colour = mixRgb(colour, RIM, cover(r - (PAD_ROUNDEL_RADIUS + PAD_RIM)));
    colour = mixRgb(colour, stampAt(stamp, z, y), cover(r - PAD_ROUNDEL_RADIUS));
    return [colour, 1];
  });
}

let cachedPixels: Uint8Array | null = null;
let cachedFor: DrunkardMachineLayout | null = null;

/** Paint the whole sheet. Pure, deterministic, memoised for the one layout the look hands it. */
export function drunkardMachineAtlasPixels(layout: DrunkardMachineLayout): Uint8Array {
  if (cachedPixels !== null && cachedFor === layout) return cachedPixels;
  const sheet = inkSheet(MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, CLEAR);
  // The plate page is the cream itself: no ink, so a patch that asks for it
  // renders as a cream plate. Nothing asks for it yet (file comment).
  inkRect(sheet, PIXEL_REGIONS.plate, CLEAR, 1, 1);
  paintPads(sheet, layout);
  cachedPixels = toSrgbBytes(sheet);
  cachedFor = layout;
  return cachedPixels;
}

/** A texture over those pixels, for one machine — the rider sheet's settings. */
export function createDrunkardMachineAtlas(layout: DrunkardMachineLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    drunkardMachineAtlasPixels(layout),
    MACHINE_SHEET_WIDTH,
    MACHINE_SHEET_HEIGHT,
    THREE.RGBAFormat,
  );
  texture.name = 'drunkard-machine-atlas';
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
