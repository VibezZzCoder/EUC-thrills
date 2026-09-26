/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The facade atlas's Ultra companions (T4) — M39 (`docs/M39_ULTRA.md` §4,
 * package W6).
 *
 * The ordinary atlas (`render/facadeAtlas.ts`, 512² / 8-texel gutter) is
 * albedo only and stays byte-identical. Ultra adds, per view: its **own**
 * albedo `DataTexture` from the same cached texels (so anisotropy can be set
 * without touching the ordinary texture), and **normal** and **ORM** pages at
 * `ULTRA.facade.mapSize` (1024) on the same `FACADE_PAGES` rects, each with an
 * explicitly painted mip chain — renormalised normals that flatten with
 * distance, and a Toksvig roughness rise so the new glossy glass cannot
 * sparkle at 60–120 m.
 *
 * ## Read from the albedo, never re-authored
 *
 * **The companions are derived from the albedo's own texels**, not from a
 * second copy of the page layout. The albedo painter's shares (plinth height,
 * pier widths, mullion placement …) are private to `facadeAtlas.ts` and pinned
 * byte-for-byte by its test; restating them here would be the "same geometry
 * described twice" failure (invariant 2 of the look pass) waiting for the day
 * one of them moves. Instead every companion texel asks the albedo texel it
 * covers what it is:
 *
 * - **Glass** is any texel that is not grey. The albedo's module comment says
 *   it outright — glass is "the one colour on this sheet that is not grey" —
 *   and a grey multiplier encodes to three equal bytes, so `r ≠ b` is exact,
 *   not a threshold. That is the **glass mask** (ORM alpha), and the test pins
 *   it texel for texel against the albedo. A glass texel darker than
 *   `FRAME_RATIO` of the tint is a mullion or a sill: glazed, but a frame.
 * - **Full-width uniform rows** are bands: a run of them at the foot of a page
 *   is a plinth (stands proud), at its head a fascia or lintel (proud, less),
 *   anywhere else a joint (a groove). A row is uniform when it carries no
 *   glass and its texels differ by no more than the albedo's own grain.
 * - **Everything else grey** is read by value: the wall and the piers at
 *   1.0, a pier's edge (0.9) as a chamfer, panels and slats (≈0.8) as a
 *   shallow recess, borders and lintels (≈0.7) deeper, doors (≈0.55) deepest.
 *   The albedo can only darken (its multipliers never exceed 1), so darker
 *   already meant "set back" in its own vocabulary.
 *
 * That relief becomes a height field per page, softened by a small box blur
 * and differentiated into tangent-space normals: the head, jamb and sill
 * slopes of every glazed group, proud piers, spandrel joints, the plinth ledge.
 * Outside a page the facade continues as plain wall at height 0 above and
 * below — so the head and sill of a glass strip slope back up to the
 * spandrel next to it — except below a ground-floor page, where the ground
 * is; and as more of the same page to the left and right, where the next
 * side of the building begins with the same page.
 *
 * ## The two maps
 *
 * **Normal** — RGB = tangent-space normal × 0.5 + 0.5 (+X along `u`, +Y up
 * the page, the OpenGL convention three's derivative TBN expects), A = 255.
 *
 * **ORM** — R occlusion (a cavity term: a recess next to something proud sees
 * less sky), G perceptual roughness (glass `ULTRA.specular.glassRoughness`,
 * frames the street-metal floor, walls/spandrels/plinths their own
 * `ULTRA.facade.*Roughness`), B metalness (0 throughout: no facade is metal),
 * A glass mask.
 *
 * ## The mip chains
 *
 * Painted here rather than left to `generateMipmaps`, because a box-filtered
 * normal map is the classic specular-aliasing trap: the averaged normal is
 * shorter than unit, the GPU renormalises it, and a glossy material then
 * lights the distant, flattened facade with the full sharpness of a mirror.
 * So each level keeps the **unnormalised** mean normal of every level-0
 * texel under it; its length `L` measures how much the normals disagreed,
 * and Toksvig turns that into roughness: `α'² = ᾱ² + (1 − L)/L`, with α the
 * GGX alpha (roughness²). The stored normal is renormalised (so the far
 * facade flattens, which is what it should do) and the stored roughness rises
 * by exactly the disagreement it hides. Each level's roughness is also floored
 * at the mean of the four texels under it, so the chain can only rise.
 *
 * Pure arithmetic and `three` data objects only: no DOM, headless-importable.
 * Deterministic — no hash in this file at all; every value is a function of
 * the albedo, which is itself deterministic.
 */
import * as THREE from 'three';
import { BUILDING_FACADE } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import {
  FACADE_ATLAS_SIZE,
  FACADE_PAGE_GUTTER,
  FACADE_PAGE_IDS,
  FACADE_PAGES,
  paintFacadeAtlas,
  type FacadeAtlas,
  type FacadePageId,
} from '../facadeAtlas.ts';
import type { UltraFacadeMaps } from './ultraTypes.ts';

// --- Relief vocabulary ------------------------------------------------------
//
// Heights are in albedo texels (one texel of the 512 sheet), negative into the
// wall. At the 1024 companion every value is doubled into companion texels, so
// the slopes are the same in UV whatever size the companion is painted at.

/** How far each kind of texel stands from the wall plane. */
const RELIEF = Object.freeze({
  /** A pane of glass, set back in its reveal. */
  pane: -2.0,
  /** A mullion or the sill line: glazed, but a frame proud of the pane. */
  frame: -1.2,
  /** A pier's darker edge: the chamfer into the reveal. */
  edge: -0.5,
  /** A shopfront panel or a shutter's light slat. */
  panel: -0.6,
  /** A panel border, a lintel over a door, a shutter's dark slat. */
  border: -1.0,
  /** A closed door, the deepest thing on the sheet. */
  door: -2.0,
  /** A joint line across a spandrel. */
  joint: -0.8,
  /** The plinth ledge at the foot of a ground-floor page. */
  plinth: 1.2,
  /** The fascia or lintel band at the head of a ground-floor page. */
  fascia: 0.8,
});

/**
 * Value bins for grey texels that are not in a band, as linear multipliers.
 * The albedo's grain is ±2 % about 0.98 (`facadeAtlas.ts` GRAIN), so each
 * authored value lands in `[0.960, 1.000] ×` itself; every bin edge sits in a
 * gap that grain cannot cross — the pier edge's 0.864 floor above 0.86, the
 * panel's 0.820 ceiling below 0.86, the border's 0.672 floor above 0.62.
 */
const BINS = Object.freeze({ wall: 0.93, edge: 0.86, panel: 0.76, border: 0.62 });

/**
 * A glass texel below this share of the tint's luminance is a frame. The pane
 * body sits at 0.88–1.0 of the tint (0.845 at the grain's floor), a mullion at
 * 0.78 × that and the sill at 0.72 ×, so 0.815 separates them.
 */
const FRAME_RATIO = 0.815;

/** A grain-only row: no glass, and its brightest texel within this ratio of its darkest. */
const BAND_RATIO = 1.06;
/** A band row darker than this mean is a feature (plinth, fascia, joint), not plain wall. */
const BAND_FEATURE_MEAN = 0.95;

/** Softening of the height field before it is differentiated, albedo texels. */
const BLUR_RADIUS = 1;

/**
 * The cavity occlusion in ORM red: a recess next to something proud sees less
 * sky. Measured against the height field blurred over `radius` (two box passes,
 * roughly a Gaussian) and normalised by `depth`; `strength` is the darkest it
 * gets, so R never falls below `1 − strength`.
 */
const CAVITY = Object.freeze({ radius: 6, depth: 2.0, strength: 0.4 });

// --- Layout -----------------------------------------------------------------

/** One page's texel rects in a companion sheet of some size, gutter and interior. */
export interface FacadeCompanionPage {
  readonly id: FacadePageId;
  /** The whole cell, gutter included: `[x0, x1) × [y0, y1)`. */
  readonly cell: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** The interior, gutter excluded — exactly `FACADE_PAGES[id]` × size. */
  readonly interior: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
}

/** `size / FACADE_ATLAS_SIZE`, refusing any size the albedo's layout does not divide into. */
function scaleOf(size: number): number {
  const scale = size / FACADE_ATLAS_SIZE;
  if (!(Number.isInteger(scale) && scale >= 1 && (scale & (scale - 1)) === 0)) {
    throw new RangeError(`facade companion size must be ${FACADE_ATLAS_SIZE} × a power of two, got ${size}`);
  }
  return scale;
}

/**
 * Every page's rects at `size`: the albedo's cells scaled up, so the interior
 * UV rect is `FACADE_PAGES[id]` exactly and the gutter is
 * `FACADE_PAGE_GUTTER × scale` (16 at 1024, which is `ULTRA.facade.gutterTexels`).
 */
export function facadeCompanionLayout(size: number): readonly FacadeCompanionPage[] {
  const scale = scaleOf(size);
  const gutter = FACADE_PAGE_GUTTER * scale;
  return FACADE_PAGE_IDS.map((id) => {
    const rect = FACADE_PAGES[id];
    const interior = {
      x0: Math.round(rect.u0 * size),
      y0: Math.round(rect.v0 * size),
      x1: Math.round(rect.u1 * size),
      y1: Math.round(rect.v1 * size),
    };
    return {
      id,
      cell: { x0: interior.x0 - gutter, y0: interior.y0 - gutter, x1: interior.x1 + gutter, y1: interior.y1 + gutter },
      interior,
    };
  });
}

// --- The albedo, read -------------------------------------------------------

/** The ordinary atlas's texels, painted once per process and shared by every Ultra view. */
let albedoPixels: FacadeAtlas | null = null;

function albedo(): FacadeAtlas {
  if (albedoPixels === null) albedoPixels = paintFacadeAtlas({ glassTint: BUILDING_FACADE.glassTint });
  return albedoPixels;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Whether an albedo texel is glass: any texel that is not grey. Exported so
 * the test and the painter share one definition of "the albedo glass texels".
 */
export function isAlbedoGlass(atlas: FacadeAtlas, x: number, y: number): boolean {
  const i = (y * atlas.size + x) * 4;
  return atlas.data[i] !== atlas.data[i + 2];
}

/** One page, classified at the albedo's resolution: relief, roughness and glass per interior texel. */
interface PageRead {
  readonly width: number;
  readonly height: number;
  readonly relief: Float32Array;
  readonly roughness: Float32Array;
  readonly glass: Uint8Array;
}

function readPage(atlas: FacadeAtlas, id: FacadePageId): PageRead {
  const rect = FACADE_PAGES[id];
  const x0 = Math.round(rect.u0 * atlas.size);
  const y0 = Math.round(rect.v0 * atlas.size);
  const width = Math.round(rect.u1 * atlas.size) - x0;
  const height = Math.round(rect.v1 * atlas.size) - y0;
  const tint = BUILDING_FACADE.glassTint;
  const tintLuminance = luminance(tint.r, tint.g, tint.b);

  const value = new Float32Array(width * height);
  const glass = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = ((y0 + y) * atlas.size + x0 + x) * 4;
      value[y * width + x] = luminance(
        srgbToLinear(atlas.data[i] / 255),
        srgbToLinear(atlas.data[i + 1] / 255),
        srgbToLinear(atlas.data[i + 2] / 255),
      );
      glass[y * width + x] = isAlbedoGlass(atlas, x0 + x, y0 + y) ? 1 : 0;
    }
  }

  // Which rows are full-width bands, and how dark each one is.
  const band = new Uint8Array(height);
  const bandMean = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let glazed = false;
    for (let x = 0; x < width; x += 1) {
      const v = value[y * width + x];
      if (glass[y * width + x] === 1) glazed = true;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    band[y] = !glazed && min > 0 && max / min <= BAND_RATIO ? 1 : 0;
    bandMean[y] = sum / width;
  }
  const feature = (y: number): boolean => band[y] === 1 && bandMean[y] < BAND_FEATURE_MEAN;
  // The plinth: feature rows from the foot up. The fascia: from the head down,
  // never into the plinth.
  let plinthTop = 0;
  while (plinthTop < height && feature(plinthTop)) plinthTop += 1;
  let fasciaBottom = height;
  while (fasciaBottom > plinthTop && feature(fasciaBottom - 1)) fasciaBottom -= 1;

  const wallRoughness: number = id === 'spandrel' ? ULTRA.facade.spandrelRoughness : ULTRA.facade.wallRoughness;
  const relief = new Float32Array(width * height);
  const roughness = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = value[i];
      let h: number;
      let r = wallRoughness;
      if (glass[i] === 1) {
        const frame = v / tintLuminance < FRAME_RATIO;
        h = frame ? RELIEF.frame : RELIEF.pane;
        r = frame ? ULTRA.specular.metalRoughnessFloor : ULTRA.specular.glassRoughness;
      } else if (y < plinthTop) {
        h = RELIEF.plinth;
        r = ULTRA.facade.plinthRoughness;
      } else if (y >= fasciaBottom) {
        h = RELIEF.fascia;
      } else if (band[y] === 1) {
        h = feature(y) ? RELIEF.joint : 0;
      } else if (v >= BINS.wall) {
        h = 0;
      } else if (v >= BINS.edge) {
        h = RELIEF.edge;
      } else if (v >= BINS.panel) {
        h = RELIEF.panel;
      } else if (v >= BINS.border) {
        h = RELIEF.border;
      } else {
        h = RELIEF.door;
      }
      relief[i] = h;
      roughness[i] = r;
    }
  }
  return { width, height, relief, roughness, glass };
}

// --- Height-field arithmetic --------------------------------------------------

/**
 * The pages worn at the foot of a building (`render/props.ts` maps a facade
 * class's ground floor to one of these). Below them is the ground, not more
 * wall, so their height field clamps at the foot instead of returning to the
 * wall plane — a plinth meets the pavement square, not over a bevel.
 */
const FOOT_PAGES: readonly FacadePageId[] = Object.freeze(['ground', 'groundLow', 'groundTall'] as FacadePageId[]);

/** One page's height field and how it continues past its own edges. */
interface Field {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  /** True on a foot page: below the page is ground, so the page's own foot row continues. */
  readonly clampBelow: boolean;
}

/**
 * A sample of a page's height field with the facade's padding rule: clamped
 * across the page's sides (the next side of the building carries the same
 * page), plain wall — height 0 — above it, and below it too unless the page
 * stands on the ground (`clampBelow`).
 */
function at(field: Field, x: number, y: number): number {
  if (y >= field.height) return 0;
  if (y < 0 && !field.clampBelow) return 0;
  const cy = y < 0 ? 0 : y;
  const cx = x < 0 ? 0 : x >= field.width ? field.width - 1 : x;
  return field.data[cy * field.width + cx];
}

/** A separable box blur of `radius` texels under the padding rule of `at`. */
function boxBlur(field: Field, radius: number): Field {
  const { width, height } = field;
  if (radius <= 0) return { ...field, data: field.data.slice() };
  const across: Field = { ...field, data: new Float32Array(width * height) };
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += at(field, k, y);
    for (let x = 0; x < width; x += 1) {
      across.data[y * width + x] = sum / span;
      sum += at(field, x + radius + 1, y) - at(field, x - radius, y);
    }
  }
  const out: Field = { ...field, data: new Float32Array(width * height) };
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += at(across, x, k);
    for (let y = 0; y < height; y += 1) {
      out.data[y * width + x] = sum / span;
      sum += at(across, x, y + radius + 1) - at(across, x, y - radius);
    }
  }
  return out;
}

// --- The companion sheets -----------------------------------------------------

/** Level-0 companion data for the whole sheet, before encoding. */
interface Sheet {
  readonly size: number;
  /** Unit normal, three floats a texel. */
  readonly normal: Float32Array;
  /** GGX alpha squared (roughness⁴). */
  readonly alpha2: Float32Array;
  readonly occlusion: Float32Array;
  readonly glass: Float32Array;
}

function paintLevelZero(size: number): Sheet {
  const scale = scaleOf(size);
  const atlas = albedo();
  const sheet: Sheet = {
    size,
    normal: new Float32Array(size * size * 3),
    alpha2: new Float32Array(size * size),
    occlusion: new Float32Array(size * size),
    glass: new Float32Array(size * size),
  };

  for (const page of facadeCompanionLayout(size)) {
    const read = readPage(atlas, page.id);
    const width = read.width * scale;
    const height = read.height * scale;

    // Upsampled to the companion's texels, nearest, so each albedo texel
    // becomes a `scale × scale` block and the glass mask lands exactly on it.
    const relief: Field = {
      data: new Float32Array(width * height),
      width,
      height,
      clampBelow: FOOT_PAGES.includes(page.id),
    };
    for (let y = 0; y < height; y += 1) {
      const sy = Math.floor(y / scale);
      for (let x = 0; x < width; x += 1) {
        relief.data[y * width + x] = read.relief[sy * read.width + Math.floor(x / scale)] * scale;
      }
    }
    const soft = boxBlur(relief, BLUR_RADIUS * scale);
    const wide = boxBlur(boxBlur(relief, CAVITY.radius * scale), CAVITY.radius * scale);

    // Interior texels, then the gutter as an edge-extension of them — the
    // albedo's own `blitPage` rule, so the mips of every map average a page
    // with itself and never with its neighbour.
    for (let cy = page.cell.y0; cy < page.cell.y1; cy += 1) {
      const y = Math.min(height - 1, Math.max(0, cy - page.interior.y0));
      for (let cx = page.cell.x0; cx < page.cell.x1; cx += 1) {
        const x = Math.min(width - 1, Math.max(0, cx - page.interior.x0));
        const dx = (at(soft, x + 1, y) - at(soft, x - 1, y)) / 2;
        const dy = (at(soft, x, y + 1) - at(soft, x, y - 1)) / 2;
        const inverse = 1 / Math.hypot(dx, dy, 1);
        const texel = cy * size + cx;
        sheet.normal[texel * 3] = -dx * inverse;
        sheet.normal[texel * 3 + 1] = -dy * inverse;
        sheet.normal[texel * 3 + 2] = inverse;

        const source = Math.floor(y / scale) * read.width + Math.floor(x / scale);
        const r = read.roughness[source];
        sheet.alpha2[texel] = r * r * r * r;
        const cavity = (wide.data[y * width + x] - soft.data[y * width + x]) / (CAVITY.depth * scale);
        sheet.occlusion[texel] = 1 - CAVITY.strength * Math.min(1, Math.max(0, cavity));
        sheet.glass[texel] = read.glass[source];
      }
    }
  }
  return sheet;
}

function byte(value: number): number {
  const clamped = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return Math.round(clamped * 255);
}

/**
 * Both companions, as mip chains from `size` down to 1×1 (RGBA8, level 0
 * first), painted fresh. `paintFacadeNormal` and `paintFacadeOrm` are the
 * cached views of this; tests call it directly to prove determinism.
 */
export function paintFacadeCompanions(size: number): { readonly normal: Uint8Array[]; readonly orm: Uint8Array[] } {
  const zero = paintLevelZero(size);
  const normalChain: Uint8Array[] = [];
  const ormChain: Uint8Array[] = [];

  // The running level: the unnormalised mean normal, the mean α² underneath,
  // the Toksvig-raised α², the occlusion and the glass coverage.
  let edge = size;
  let mean = zero.normal;
  let alphaMean = zero.alpha2;
  let alphaToksvig = zero.alpha2;
  let occlusion = zero.occlusion;
  let glass = zero.glass;

  for (;;) {
    const normalBytes = new Uint8Array(edge * edge * 4);
    const ormBytes = new Uint8Array(edge * edge * 4);
    for (let texel = 0; texel < edge * edge; texel += 1) {
      const mx = mean[texel * 3];
      const my = mean[texel * 3 + 1];
      const mz = mean[texel * 3 + 2];
      const length = Math.hypot(mx, my, mz);
      const nx = length > 1e-6 ? mx / length : 0;
      const ny = length > 1e-6 ? my / length : 0;
      const nz = length > 1e-6 ? mz / length : 1;
      normalBytes[texel * 4] = byte(nx * 0.5 + 0.5);
      normalBytes[texel * 4 + 1] = byte(ny * 0.5 + 0.5);
      normalBytes[texel * 4 + 2] = byte(nz * 0.5 + 0.5);
      normalBytes[texel * 4 + 3] = 255;

      ormBytes[texel * 4] = byte(occlusion[texel]);
      ormBytes[texel * 4 + 1] = byte(Math.sqrt(Math.sqrt(alphaToksvig[texel])));
      ormBytes[texel * 4 + 2] = 0;
      ormBytes[texel * 4 + 3] = byte(glass[texel]);
    }
    normalChain.push(normalBytes);
    ormChain.push(ormBytes);
    if (edge === 1) break;

    // The next level: a 2×2 box over everything, then Toksvig from how far
    // the four mean normals disagreed.
    const next = edge >> 1;
    const nextMean = new Float32Array(next * next * 3);
    const nextAlphaMean = new Float32Array(next * next);
    const nextToksvig = new Float32Array(next * next);
    const nextOcclusion = new Float32Array(next * next);
    const nextGlass = new Float32Array(next * next);
    for (let y = 0; y < next; y += 1) {
      for (let x = 0; x < next; x += 1) {
        const children = [
          (2 * y) * edge + 2 * x,
          (2 * y) * edge + 2 * x + 1,
          (2 * y + 1) * edge + 2 * x,
          (2 * y + 1) * edge + 2 * x + 1,
        ];
        const parent = y * next + x;
        let sx = 0; let sy = 0; let sz = 0; let a = 0; let t = 0; let o = 0; let g = 0;
        for (const child of children) {
          sx += mean[child * 3];
          sy += mean[child * 3 + 1];
          sz += mean[child * 3 + 2];
          a += alphaMean[child];
          t += alphaToksvig[child];
          o += occlusion[child];
          g += glass[child];
        }
        nextMean[parent * 3] = sx / 4;
        nextMean[parent * 3 + 1] = sy / 4;
        nextMean[parent * 3 + 2] = sz / 4;
        nextAlphaMean[parent] = a / 4;
        const length = Math.hypot(sx / 4, sy / 4, sz / 4);
        const variance = length > 1e-6 ? Math.min(1, (1 - length) / length) : 1;
        nextToksvig[parent] = Math.min(1, Math.max(t / 4, a / 4 + variance));
        nextOcclusion[parent] = o / 4;
        nextGlass[parent] = g / 4;
      }
    }
    edge = next;
    mean = nextMean;
    alphaMean = nextAlphaMean;
    alphaToksvig = nextToksvig;
    occlusion = nextOcclusion;
    glass = nextGlass;
  }
  return { normal: normalChain, orm: ormChain };
}

/** Painted chains by size, once per process: pure data, uploaded per view. */
const companions = new Map<number, { readonly normal: Uint8Array[]; readonly orm: Uint8Array[] }>();

function cachedCompanions(size: number): { readonly normal: Uint8Array[]; readonly orm: Uint8Array[] } {
  let painted = companions.get(size);
  if (painted === undefined) {
    painted = paintFacadeCompanions(size);
    companions.set(size, painted);
  }
  return painted;
}

/**
 * The facade normal pages as a mip chain, level 0 first (`size`², RGBA8,
 * tangent space, 0.5-biased, alpha 255). Painted once per process and size;
 * the arrays are shared by every view that uploads them and must not be
 * written to.
 */
export function paintFacadeNormal(size: number): Uint8Array[] {
  return cachedCompanions(size).normal;
}

/**
 * The facade ORM pages as a mip chain, level 0 first: R occlusion, G
 * roughness (Toksvig-raised down the chain), B metalness, A glass mask.
 * Cached and shared as `paintFacadeNormal` is.
 */
export function paintFacadeOrm(size: number): Uint8Array[] {
  return cachedCompanions(size).orm;
}

// --- The GPU objects ----------------------------------------------------------

/** A linear-data texture carrying an explicit mip chain. */
function chainTexture(chain: readonly Uint8Array[], name: string): THREE.DataTexture {
  const size = Math.round(Math.sqrt(chain[0].length / 4));
  const texture = new THREE.DataTexture(chain[0], size, size, THREE.RGBAFormat);
  texture.name = name;
  texture.mipmaps = chain.map((data, level) => {
    const edge = Math.max(1, size >> level);
    return { data, width: edge, height: edge };
  });
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Data, not colour: three must not decode these as sRGB. Trilinear only —
  // the chain's own Toksvig rise is what keeps these stable at distance, and
  // anisotropic sampling would reach past it to the sharp levels.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function chainBytes(chain: readonly Uint8Array[]): number {
  let bytes = 0;
  for (const level of chain) bytes += level.byteLength;
  return bytes;
}

/**
 * One Ultra view's facade maps: its own albedo copy with anisotropy
 * `min(ULTRA.facade.anisotropyCap, maxAnisotropy)`, and the normal and ORM
 * pages at `ULTRA.facade.mapSize`. The caller owns the result and disposes it
 * with the view; `bytes` is what the Ultra ledger charges (the albedo's
 * generated chain counted at a third over its base level).
 */
export function createUltraFacadeMaps(maxAnisotropy: number): UltraFacadeMaps {
  const pixels = albedo();
  const albedoTexture = new THREE.DataTexture(
    pixels.data,
    FACADE_ATLAS_SIZE,
    FACADE_ATLAS_SIZE,
    THREE.RGBAFormat,
  );
  albedoTexture.name = 'ultra-facade-albedo';
  // The ordinary atlas's own settings (`render/props.ts`), then the one Ultra
  // difference.
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.generateMipmaps = true;
  albedoTexture.minFilter = THREE.LinearMipmapLinearFilter;
  albedoTexture.magFilter = THREE.LinearFilter;
  albedoTexture.wrapS = THREE.ClampToEdgeWrapping;
  albedoTexture.wrapT = THREE.ClampToEdgeWrapping;
  albedoTexture.anisotropy = Math.max(1, Math.min(ULTRA.facade.anisotropyCap, maxAnisotropy));
  albedoTexture.needsUpdate = true;

  const normalChain = paintFacadeNormal(ULTRA.facade.mapSize);
  const ormChain = paintFacadeOrm(ULTRA.facade.mapSize);
  const normal = chainTexture(normalChain, 'ultra-facade-normal');
  const orm = chainTexture(ormChain, 'ultra-facade-orm');

  const albedoBytes = Math.round((FACADE_ATLAS_SIZE * FACADE_ATLAS_SIZE * 4 * 4) / 3);
  const bytes = albedoBytes + chainBytes(normalChain) + chainBytes(ormChain);

  return {
    albedo: albedoTexture,
    normal,
    orm,
    bytes,
    dispose(): void {
      albedoTexture.dispose();
      normal.dispose();
      orm.dispose();
    },
  };
}
