/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import type { LoftProfile, UvRect } from './blockoutKit.ts';
import {
  inkField, inkOver, inkRaster, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, type InkSheet, type Rgb,
} from './inkKit.ts';
import { MARK_ASPECT, wimMarkRaster, wimPatchStretch, type PatchSpan } from './wimAtlas.ts';

/**
 * The sheet Wheel in Motion's wheel wears — M28 Phase 2.
 *
 * Two pages. The first is the reason the sheet exists at all: **his mark on both
 * flanks of the machine**, carried the way the chest and the pack carry it —
 * his file's own pixels, stamped turned so it reads from where a viewer
 * stands, at its own aspect on the body (`render/wimAtlas.ts`, the same
 * arithmetic under a different profile). The second is the pads' face (`paintPads`), the one surface whose art is shapes and not bands. Everything else on the wheel is
 * paint or a tinted patch and wants no texture, so it lands on `blank`.
 *
 * **A texture of its own rather than a page of his rider sheet**, and small.
 * The rider's sheet is exactly the pages his rig wears, and
 * `render/wheelInMotion.test.ts` holds it to that; the machine's trim mesh is
 * the only thing that samples this one, and a 512 × 256 sheet for one plate
 * costs an eighth of what folding the plate into the 1024² rider sheet would
 * have cost in a second upload of the whole thing. Maribel's machine shares
 * her rider sheet because her machine mark was already a page of it.
 *
 * The plate is white with square corners — the file's own ground and the
 * die-cut of a real sticker — because the brief forbids inventing outlines,
 * fills or rounded corners for the mark (§9), and `docs/PLANS.md` §28.3
 * fact 4 says why the white ground *is* the plate.
 */

export const MACHINE_SHEET_WIDTH = 512;
export const MACHINE_SHEET_HEIGHT = 512;

/** Where each page sits, in sheet pixels. */
const PIXEL_REGIONS = {
  /** The plate: his mark on its own white, square-cornered. */
  plate: { x0: 0, y0: 0, x1: 448, y1: 256 },
  /**
   * The pad's face, wrapped: the photograph's interlocking cyan-and-orange
   * pad set on a black grip field, painted as shapes in metres of the
   * face — see `paintPads`. Its page centre is the outboard face's centre.
   */
  pads: { x0: 0, y0: 288, x1: 448, y1: 512 },
  /**
   * Neutral. Every tinted piece and anything else paint already decided
   * renders exactly as its vertex colours say. A gutter of 32 texels keeps
   * the pages' edges out of it at every mip level.
   */
  blank: { x0: 480, y0: 0, x1: 512, y1: 512 },
} as const;

export type WimMachineRegionName = keyof typeof PIXEL_REGIONS;

/** The same table in texture coordinates, half a texel in from each edge. */
export const WIM_MACHINE_REGIONS: Readonly<Record<WimMachineRegionName, UvRect>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
      u0: (box.x0 + 0.5) / MACHINE_SHEET_WIDTH,
      v0: (box.y0 + 0.5) / MACHINE_SHEET_HEIGHT,
      u1: (box.x1 - 0.5) / MACHINE_SHEET_WIDTH,
      v1: (box.y1 - 0.5) / MACHINE_SHEET_HEIGHT,
    })]),
  ),
) as Readonly<Record<WimMachineRegionName, UvRect>>;

/** Resolve a patch's `art` to its page; anything unnamed is neutral. */
export function wimMachineRegion(art: string | undefined): UvRect {
  return art !== undefined && art in WIM_MACHINE_REGIONS
    ? WIM_MACHINE_REGIONS[art as WimMachineRegionName]
    : WIM_MACHINE_REGIONS.blank;
}

/**
 * What the sheet needs to know about the body it lands on: the cosmetic
 * shell the plate is a patch of, and the plate's span on his left flank
 * (angles about +X; the right flank is the mirror), so the mark can be sized
 * in metres and not in texels.
 */
export interface WimMachineLayout {
  readonly shell: LoftProfile;
  readonly plate: PatchSpan;
  /** The pad block the `pads` page wraps, in metres about the pad's centre. */
  readonly pad: LoftProfile;
}

/** The trim material the page multiplies: the plate's white, and the base every orange is tinted down from. */
const TRIM = linearFromHex(BLOCKOUT_COLOURS.machineWheelInMotionTrim);
const CLEAR: Rgb = [1, 1, 1];
/** The pad page's inks, over the same base (the pad material is the trim's white when it wears the page). */
const CYAN = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.machineWheelInMotionBlue));
const ORANGE = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionOrange));
/** The grip field: the photograph's black grip tape, a step above the shell so the pad reads as its own part. */
const GRIP = inkOver(TRIM, linearFromHex(0x2a2c31));
const HUB = inkOver(TRIM, linearFromHex(0x1c1d21));
const HUB_RING = inkOver(TRIM, linearFromHex(0x8a8d94));

/** How much of the page the mark may take, across and up. The rest is the plate's own white margin. */
const MARK_ACROSS = 0.86;
const MARK_UP = 0.92;

/**
 * Where the mark lands inside the plate page, in sheet pixels, and the page
 * anisotropy that sized it. Exported so the test can measure the result on
 * the body rather than trust the arithmetic.
 */
export function wimMachinePlateBox(
  layout: WimMachineLayout,
): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly stretch: number } {
  const box = PIXEL_REGIONS.plate;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const stretch = wimPatchStretch(layout.shell, layout.plate, box, 0);
  let markWidth = width * MARK_ACROSS;
  let markHeight = markWidth * MARK_ASPECT * stretch;
  if (markHeight > height * MARK_UP) {
    markWidth *= (height * MARK_UP) / markHeight;
    markHeight = height * MARK_UP;
  }
  const x0 = box.x0 + (width - markWidth) / 2;
  const y0 = box.y0 + (height - markHeight) / 2;
  return { x0, y0, x1: x0 + markWidth, y1: y0 + markHeight, stretch };
}

function paintPlate(sheet: InkSheet, layout: WimMachineLayout): void {
  // The plate is the page: no ink, so it renders as the trim's own white.
  inkRect(sheet, PIXEL_REGIONS.plate, CLEAR, 1, 1);
  // Turned, like the chest's and the pack's: a flank page runs toward the
  // viewer's left from either side of the machine (`wimMarkRaster`).
  inkRaster(sheet, wimMachinePlateBox(layout), wimMarkRaster(), TRIM);
}

/**
 * A face point on the pad: where a texel of the `pads` page lands, in the
 * pad's own frame — `z` fore/aft along the flank (metres, + forward) and
 * `y` about the pad's centre — and whether it is on the outboard face at
 * all. The page's `s` runs round the block from the *inboard* face, so its
 * centre is the outboard face's centre: `render/euc.ts` turns the left
 * pad's page by half a wrap, which buries the seam where the shell hides it.
 */
function padFace(layout: WimMachineLayout, s: number, t: number): { z: number; y: number; outboard: boolean } {
  const rings = layout.pad;
  const last = rings.length - 1;
  const v = Math.min(last, Math.max(0, t * last));
  const i = Math.min(last - 1, Math.floor(v));
  const f = v - i;
  const lower = rings[i]!;
  const upper = rings[i + 1]!;
  const y = lower.y + (upper.y - lower.y) * f;
  const halfDepth = lower.halfDepth + (upper.halfDepth - lower.halfDepth) * f;
  const square = lower.square + (upper.square - lower.square) * f;
  const u = (s - 0.5) * Math.PI * 2;
  const sine = Math.sin(u);
  const z = halfDepth * Math.sign(sine) * Math.abs(sine) ** (2 / square);
  return { z, y, outboard: Math.cos(u) > 0 };
}

/** Where a face point lands on the `pads` page, in sheet pixels — for the test that samples the art. */
export function wimPadPagePixel(layout: WimMachineLayout, z: number, y: number): readonly [number, number] {
  const box = PIXEL_REGIONS.pads;
  const rings = layout.pad;
  const last = rings.length - 1;
  let v = last;
  for (let i = 1; i <= last; i += 1) {
    if (y <= rings[i]!.y) { v = i - 1 + (y - rings[i - 1]!.y) / (rings[i]!.y - rings[i - 1]!.y); break; }
  }
  const i = Math.min(last - 1, Math.floor(v));
  const f = v - i;
  const halfDepth = rings[i]!.halfDepth + (rings[i + 1]!.halfDepth - rings[i]!.halfDepth) * f;
  const square = rings[i]!.square + (rings[i + 1]!.square - rings[i]!.square) * f;
  const sine = Math.sign(z) * Math.min(1, Math.abs(z) / halfDepth) ** (square / 2);
  const u = Math.asin(sine);
  const s = 0.5 + u / (Math.PI * 2);
  return [box.x0 + (box.x1 - box.x0) * s, box.y0 + (box.y1 - box.y0) * (v / last)];
}

/**
 * The pad's art — the thing four blind rounds named as what identifies his
 * wheel at a glance, and the thing a `MachinePatch` cannot draw: the
 * photograph's pad set is a swept, layered composition, a big cyan comma
 * forward with an orange ribbon inside it, a smaller cyan hook aft with
 * orange inside it, both curling toward the axle's hub, on a black grip
 * field. Patches made rectangles and then bowed rectangles; a page makes
 * the shapes. Authored as signed distances in metres of the face, like the
 * lid's print, so the art lands on the block at its own size whatever the
 * page's anisotropy. The right pad wears the same page mirrored, as every
 * pad patch always has.
 */
function paintPads(sheet: InkSheet, layout: WimMachineLayout): void {
  const box = PIXEL_REGIONS.pads;
  const EDGE = 0.003;
  const cover = (d: number): number => Math.min(1, Math.max(0, 0.5 - d / EDGE));
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  /** Distance outside an annular sector about (cz, cy): radii r0..r1, angles a0..a1 from +z toward +y, degrees. */
  const sector = (
    z: number, y: number, cz: number, cy: number, r0: number, r1: number, a0: number, a1: number,
  ): number => {
    const dz = z - cz;
    const dy = y - cy;
    const r = Math.hypot(dz, dy);
    let angle = (Math.atan2(dy, dz) * 180) / Math.PI;
    // Bring the angle into the sector's own turn.
    while (angle < a0 - 180) angle += 360;
    while (angle > a1 + 180) angle -= 360;
    // Signed: negative inside the sector, so a point well inside it is well
    // inside the shape and not sitting on its edge at half cover.
    const outside = Math.max(a0 - angle, angle - a1);
    return Math.max(r0 - r, r - r1, (outside * Math.PI / 180) * r);
  };
  const disc = (z: number, y: number, cz: number, cy: number, radius: number): number => Math.hypot(z - cz, y - cy) - radius;
  const slab = (z: number, y: number, z0: number, z1: number, y0: number, y1: number): number => (
    Math.max(z0 - z, z - z1, y0 - y, y - y1)
  );
  inkField(sheet, box, (px, py) => {
    const s = (px - box.x0) / width;
    const t = (py - box.y0) / height;
    const { z, y, outboard } = padFace(layout, s, t);
    if (!outboard) return [GRIP, 1];
    let colour: Rgb = GRIP;
    const lay = (ink: Rgb, d: number): void => { colour = mixRgb(colour, ink, cover(d)); };
    // The hub the whole set curls toward.
    lay(HUB_RING, disc(z, y, 0, -0.012, 0.030));
    lay(HUB, disc(z, y, 0, -0.012, 0.021));
    // Forward: the big cyan comma wrapping the front, opening toward the
    // hub, with the orange ribbon laid inside it.
    lay(CYAN, sector(z, y, 0.070, -0.010, 0.052, 0.094, -128, 128));
    lay(ORANGE, sector(z, y, 0.070, -0.010, 0.028, 0.047, -100, 104));
    // Aft: the smaller cyan hook wrapping the rear, orange inside it.
    lay(CYAN, sector(z, y, -0.080, -0.012, 0.040, 0.076, 62, 298));
    lay(ORANGE, sector(z, y, -0.080, -0.012, 0.018, 0.034, 85, 275));
    // The two shoulder pads along the top edge, cyan, where the calves grip.
    lay(CYAN, slab(z, y, 0.096, 0.164, 0.026, 0.070));
    lay(CYAN, slab(z, y, -0.164, -0.100, 0.026, 0.070));
    return [colour, 1];
  });
}

let cachedPixels: Uint8Array | null = null;
let cachedFor: WimMachineLayout | null = null;

/** Paint the whole sheet. Pure, deterministic, memoised for the one layout the look hands it. */
export function wimMachineAtlasPixels(layout: WimMachineLayout): Uint8Array {
  if (cachedPixels !== null && cachedFor === layout) return cachedPixels;
  const sheet = inkSheet(MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, CLEAR);
  paintPlate(sheet, layout);
  paintPads(sheet, layout);
  cachedPixels = toSrgbBytes(sheet);
  cachedFor = layout;
  return cachedPixels;
}

/** A texture over those pixels, for one machine — the rider sheet's settings. */
export function createWimMachineAtlas(layout: WimMachineLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    wimMachineAtlasPixels(layout),
    MACHINE_SHEET_WIDTH,
    MACHINE_SHEET_HEIGHT,
    THREE.RGBAFormat,
  );
  texture.name = 'wheel-in-motion-machine-atlas';
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
