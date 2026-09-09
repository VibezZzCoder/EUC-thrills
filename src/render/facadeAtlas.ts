/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Building facades, painted as one opaque atlas of multiplier pages.
 *
 * **This file imports nothing** — not three, not the tuning tables — exactly
 * as `render/skyImage.ts` and `render/inkKit.ts` import nothing, and for the
 * same reason: every texel here is a pure function of the options, so the
 * whole sheet is assertable at `node --test` with no canvas, no WebGL, and no
 * DOM. Whoever wraps the buffer in a `THREE.DataTexture` (flipY off, sRGB
 * colour space, clamped wrap) is the only party that knows a GPU exists.
 *
 * **Every texel is a multiplier on the building's own tone**, never a colour
 * in its own right. The facade material is white with the block's tone in its
 * vertex or instance colour, and the map multiplies into that — so 1.0 is
 * "the wall, untouched" and a texel can only ever darken. That is the same
 * asymmetry `inkKit.inkOver` lives under (a byte cannot go brighter than 255)
 * and it decides the whole design: piers, spandrels and lintels are painted as
 * *no change*, and glass, plinths and doors as *how much darker than the
 * wall*. A page that tried to paint a pier lighter than the wall would paint
 * nothing at all, which is why `glassTall` keeps its piers at 1.0 rather than
 * lifting them.
 *
 * Colour is authored in **linear** and encoded to sRGB once, on the way out
 * (`DESIGN.md` §2). three.js decodes the sRGB texture back to linear before
 * multiplying, so a value blended in sRGB would land somewhere the arithmetic
 * never intended — and the thing that would drift is the glass, the one colour
 * on this sheet that is not grey.
 *
 * Every stochastic element is a deterministic integer hash, never
 * `Math.random` (`DESIGN.md` §4): a facade that differs between boots makes
 * every visual regression capture meaningless. There is no text, no font, no
 * canvas and no asset file, for the reasons `inkKit.ts` gives — the same build
 * has to paint the same sheet on the owner's Mac, a Windows handset, and the
 * capture box whose screenshots are compared against each other.
 *
 * What the pages contain is deliberately broad. A facade is read at 30–60 m
 * from the chase camera and in a 640×360 split-screen pane, where one texel
 * of this atlas covers a few centimetres of wall and a mip level or two has
 * already averaged it. Individual windows at that scale collapse into a grey
 * shimmer; a black void reads as a hole in the block; both were rejected
 * before a line was painted. The pages carry only what survives a mip chain —
 * a plinth, a glazed strip with piers, a shutter's slats, a closed door — and
 * nothing finer. No texel on the sheet goes below 0.13 linear, so even the
 * darkest building tone (≈0.235 linear) times any texel stays above the
 * project's 0.03 legibility floor (`DESIGN.md` §2); `facadeAtlas.test.ts`
 * holds that arithmetic.
 *
 * **Layout.** Eight pages in a 2-column × 4-row grid of 256 × 128 texel cells
 * on a 512-square sheet, in `FACADE_PAGE_IDS` order (column-major within a
 * row: index 0 bottom-left, 1 bottom-right, 2 the row above, and so on).
 * Inside each cell the outer `FACADE_PAGE_GUTTER` texels are a gutter painted
 * by *edge-extending the interior* — every gutter texel is a copy of the
 * nearest interior texel — so that when the mip chain averages a cell's border
 * it averages the page with itself and not with the page next door. Without
 * it the coarse mips of a `glass` page would carry a stripe of `ground`
 * plinth, and a tall block seen from the far end of the boulevard would wear
 * a dark line across every storey. `FACADE_PAGES` gives the interior rect
 * (gutter excluded) in UV; a caller maps a storey's quad into exactly that.
 * Page "up" (the top of a storey) is increasing `v`; "left → right" is
 * increasing `u`.
 */

export type FacadePageId =
  | 'plain'
  | 'spandrel'
  | 'ground'
  | 'groundLow'
  | 'groundTall'
  | 'glass'
  | 'glassLow'
  | 'glassTall';

/** Every page, in cell order — index `i` sits in column `i % 2`, row `⌊i / 2⌋`. */
export const FACADE_PAGE_IDS: readonly FacadePageId[] = [
  'plain',
  'spandrel',
  'ground',
  'groundLow',
  'groundTall',
  'glass',
  'glassLow',
  'glassTall',
];

/** Square, RGBA8. 512 is the smallest power of two that gives eight 256×128 cells. */
export const FACADE_ATLAS_SIZE = 512;

/**
 * Texels of edge-extended margin inside each cell, on every side.
 *
 * Eight texels survive three mip levels (8 → 4 → 2 → 1) before a border texel
 * averages with the neighbouring cell; by then a page is 30 × 14 texels and a
 * building is a smudge on the horizon. Fewer and the bleed appears at mid
 * distance, where the facade still reads.
 */
export const FACADE_PAGE_GUTTER = 8;

/** A page's interior rect in UV `[0, 1]`, gutter excluded. */
export interface FacadePageRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface FacadeAtlasOptions {
  /**
   * Linear multipliers, per channel, that turn the wall tone into glass. The
   * caller passes `BUILDING_FACADE.glassTint` so the atlas and the
   * vertex-coloured facade it replaces agree on what glass is. Every channel
   * must be in `(0, 1]` — see `paintFacadeAtlas`.
   */
  readonly glassTint: { readonly r: number; readonly g: number; readonly b: number };
}

export interface FacadeAtlas {
  readonly size: number;
  /**
   * RGBA, `size * size * 4` bytes, sRGB-encoded. Row 0 is `v = 0`, the
   * bottom — the three.js `DataTexture` `flipY = false` convention, the same
   * one `paintSky` follows.
   */
  readonly data: Uint8Array;
}

// --- Layout ---------------------------------------------------------------

const ATLAS_COLUMNS = 2;
const ATLAS_ROWS = 4;
const CELL_WIDTH = FACADE_ATLAS_SIZE / ATLAS_COLUMNS;
const CELL_HEIGHT = FACADE_ATLAS_SIZE / ATLAS_ROWS;
const PAGE_WIDTH = CELL_WIDTH - FACADE_PAGE_GUTTER * 2;
const PAGE_HEIGHT = CELL_HEIGHT - FACADE_PAGE_GUTTER * 2;

// --- Tuning ---------------------------------------------------------------
//
// Every value is a linear multiplier on the wall tone unless it is named as a
// share (a fraction of the page's width or height) or a count of texels.
// Starting points, all of them; the tests hold the *bands* the pages must land
// in, not these numbers.

/**
 * Grain, so no page is a perfectly flat field — a flat multiplier over a flat
 * vertex colour is the "painted cardboard" look the audit named. Hashed per
 * 2×2 texel cell rather than per texel because a single-texel speckle is the
 * first thing a mip chain turns into shimmer.
 */
const GRAIN = {
  /** ± share of luminance on every page but `plain` and `spandrel`. */
  amplitude: 0.02,
  /** ± share on `spandrel`, the "aggregate" read of a concrete band. */
  spandrelAmplitude: 0.025,
  /** Texels per grain cell, each axis. */
  cell: 2,
} as const;

const SPANDREL = {
  /** Height of the floor joint above the bottom of the band, as a share. */
  jointHeight: 0.1,
  jointRows: 3,
  joint: 0.84,
} as const;

/** The treatment every glazed group shares, whichever page it sits on. */
const GLASS = {
  /**
   * The glass body, as a multiple of `glassTint`, below the sky reflection.
   * The reflection climbs from here to 1.0 × tint at the top of the strip, so
   * the top of a storey's glass reads paler than its foot — the one cue that
   * says "glass" rather than "dark paint" at 40 m.
   */
  body: 0.88,
  /** Share of the strip's height, from the top, that the reflection occupies. */
  reflectionShare: 0.25,
  mullionWidth: 2,
  /** A mullion, as a multiple of the glass under it. */
  mullion: 0.78,
  sillRows: 2,
  /** The sill line along the bottom, as a multiple of the glass above it. */
  sill: 0.72,
  /** Texels of darker edge on both sides of every pier, for definition. */
  pierEdgeWidth: 2,
  pierEdge: 0.9,
} as const;

/** `glass` — the glazed strip of one mid-rise storey. */
const GLASS_MID = {
  groups: 3,
  /** Each of the four piers, as a share of the page width. */
  pierShare: 0.07,
} as const;

/** `glassLow` — a low-rise ribbon window. */
const GLASS_LOW = {
  groups: 2,
  endPierShare: 0.05,
  centrePierShare: 0.1,
  /** Mullion pitch, as a share of the page width. */
  mullionPitch: 0.12,
} as const;

/** `glassTall` — a curtain wall. */
const GLASS_TALL = {
  groups: 4,
  pierShare: 0.045,
  mullionsPerGroup: 1,
} as const;

/** `ground` — a mid-rise shopfront. */
const GROUND = {
  plinthShare: 0.22,
  plinth: 0.78,
  plinthEdgeRows: 2,
  plinthEdge: 0.68,
  fasciaShare: 0.12,
  fascia: 0.88,
  /** Width of the central entrance bay, as a share of the page. */
  doorShare: 0.18,
  /**
   * A *closed* door. 0.55 is the floor of the page on purpose: an entrance
   * darker than this starts to read as an open doorway into an unlit lobby,
   * and a block full of open black doorways is the void look the audit
   * rejected. The lintel above it is lighter still so the panel has a frame.
   */
  door: 0.55,
  lintelRows: 4,
  lintel: 0.7,
  /** The recessed panels either side of the door. */
  panel: 0.82,
  panelBorderWidth: 2,
  panelBorder: 0.7,
  /** Wall left between a panel and the page edge or the door bay, as a share. */
  panelMargin: 0.03,
} as const;

/** `groundLow` — a workshop front. */
const GROUND_LOW = {
  plinthShare: 0.18,
  plinth: 0.8,
  fasciaShare: 0.12,
  fascia: 0.9,
  /** Each roller shutter, as a share of the page width. */
  shutterShare: 0.3,
  slats: 6,
  slatA: 0.8,
  slatB: 0.72,
  doorShare: 0.12,
  door: 0.58,
} as const;

/** `groundTall` — a tower lobby. */
const GROUND_TALL = {
  plinthShare: 0.28,
  plinth: 0.76,
  lintelShare: 0.1,
  lintel: 0.9,
  groups: 3,
  pierShare: 0.08,
  /** Lobby glass, as a multiple of `glassTint`: darker, it sits under a slab. */
  glass: 0.9,
} as const;

// --- Colour ---------------------------------------------------------------

/** Linear-light RGB, 0..1 per channel. */
type Rgb = readonly [number, number, number];

/**
 * Linear 0–1 to sRGB 0–1. The exact piecewise curve, not the 2.2
 * approximation. A local copy of `skyImage.linearToSrgb`, because this file
 * imports nothing; `facadeAtlas.test.ts` holds the two to the same curve by
 * decoding what this encodes.
 */
function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** sRGB 0–1 to linear 0–1. The inverse of the above, for `facadePageLuminance`. */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** One linear channel as an sRGB byte. Clamped, because a multiplier above 1.0 has nowhere to go. */
function byteFromLinear(channel: number): number {
  const clamped = channel <= 0 ? 0 : channel >= 1 ? 1 : channel;
  return Math.min(255, Math.round(linearToSrgb(clamped) * 255));
}

/** Rec. 709 luminance of a linear colour. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function grey(value: number): Rgb {
  return [value, value, value];
}

function scaled(colour: Rgb, factor: number): Rgb {
  return [colour[0] * factor, colour[1] * factor, colour[2] * factor];
}

/**
 * Deterministic hash of two integers and a salt to `[0, 1)`.
 *
 * `Math.imul` keeps every multiply in 32 bits; without it the intermediate
 * exceeds 2^53, the low bits — the only ones that carry the hash — are
 * rounded away, and neighbouring cells start returning the same value. The
 * salt separates the pages' grain fields from each other and from the mullion
 * draw, so two things hashed at the same `(x, y)` are independent rather than
 * two views of one pattern.
 */
function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// --- The sheet ------------------------------------------------------------

/** A page being painted: linear RGB, three floats a texel, row 0 the bottom of the storey. */
interface Sheet {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/** A half-open texel span `[x0, x1)`. */
type Span = readonly [number, number];

/** A blank page: the wall, untouched, everywhere. */
function blankSheet(): Sheet {
  return {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    data: new Float32Array(PAGE_WIDTH * PAGE_HEIGHT * 3).fill(1),
  };
}

/** Texel rows for a share of the page's height, and columns for a share of its width. */
function rowsOf(sheet: Sheet, share: number): number {
  return Math.round(sheet.height * share);
}

function colsOf(sheet: Sheet, share: number): number {
  return Math.round(sheet.width * share);
}

/** Set a rectangle to one colour. Clamped to the sheet, so a rule may overrun its edge harmlessly. */
function setRect(sheet: Sheet, x0: number, y0: number, x1: number, y1: number, colour: Rgb): void {
  const left = Math.max(0, x0);
  const right = Math.min(sheet.width, x1);
  const bottom = Math.max(0, y0);
  const top = Math.min(sheet.height, y1);
  for (let y = bottom; y < top; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * sheet.width + x) * 3;
      sheet.data[i] = colour[0];
      sheet.data[i + 1] = colour[1];
      sheet.data[i + 2] = colour[2];
    }
  }
}

/** Multiply a rectangle by one factor — a line, a border, a sill, laid over what is there. */
function scaleRect(sheet: Sheet, x0: number, y0: number, x1: number, y1: number, factor: number): void {
  const left = Math.max(0, x0);
  const right = Math.min(sheet.width, x1);
  const bottom = Math.max(0, y0);
  const top = Math.min(sheet.height, y1);
  for (let y = bottom; y < top; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * sheet.width + x) * 3;
      sheet.data[i] *= factor;
      sheet.data[i + 1] *= factor;
      sheet.data[i + 2] *= factor;
    }
  }
}

/**
 * Grain over the whole page, ± `amplitude` of luminance.
 *
 * The field is first dropped by one amplitude and the noise centred on *that*,
 * so the noise's ceiling lands at 1.0 exactly and never above it. Centring
 * ±2% on a texel that is already 1.0 would clip the upper half at 255 and
 * leave only the dark half — a wall that looks pitted rather than grainy.
 */
function applyGrain(sheet: Sheet, amplitude: number, salt: number): void {
  const floor = 1 - amplitude;
  for (let y = 0; y < sheet.height; y += 1) {
    const cy = Math.floor(y / GRAIN.cell);
    for (let x = 0; x < sheet.width; x += 1) {
      const cx = Math.floor(x / GRAIN.cell);
      const factor = floor * (1 + amplitude * (2 * hash01(cx, cy, salt) - 1));
      const i = (y * sheet.width + x) * 3;
      sheet.data[i] *= factor;
      sheet.data[i + 1] *= factor;
      sheet.data[i + 2] *= factor;
    }
  }
}

// --- Glazing --------------------------------------------------------------

/**
 * Divide a strip into piers and the glass groups between them.
 *
 * `pierShares` has one entry per pier, so `groups = piers − 1`; the groups
 * split the remaining width equally. Positions are accumulated left to right
 * and the last pier is closed at the page edge, so rounding never leaves a
 * one-texel slit of wall between a pier and its group.
 */
function splitStrip(width: number, pierShares: readonly number[]): { piers: Span[]; groups: Span[] } {
  const groupCount = pierShares.length - 1;
  const pierTexels = pierShares.map((share) => Math.round(share * width));
  const glassTexels = width - pierTexels.reduce((sum, texels) => sum + texels, 0);
  const piers: Span[] = [];
  const groups: Span[] = [];
  let x = 0;
  let glassUsed = 0;
  for (let i = 0; i < groupCount; i += 1) {
    piers.push([x, x + pierTexels[i]]);
    x += pierTexels[i];
    const glassTarget = Math.round((glassTexels * (i + 1)) / groupCount);
    const end = x + (glassTarget - glassUsed);
    groups.push([x, end]);
    glassUsed = glassTarget;
    x = end;
  }
  piers.push([x, width]);
  return { piers, groups };
}

/** `count` mullions spaced evenly through a group, as left-edge texel columns. */
function evenMullions(group: Span, count: number): number[] {
  const width = group[1] - group[0];
  const columns: number[] = [];
  for (let k = 1; k <= count; k += 1) {
    columns.push(group[0] + Math.round((width * k) / (count + 1)) - Math.floor(GLASS.mullionWidth / 2));
  }
  return columns;
}

/**
 * Mullions at a fixed pitch from a group's left edge, as a ribbon window has
 * them. The run stops half a pitch short of the right edge so the last light
 * is never a sliver.
 */
function pitchedMullions(group: Span, pitch: number): number[] {
  const columns: number[] = [];
  for (let x = group[0] + pitch; x < group[1] - pitch / 2; x += pitch) {
    columns.push(x - Math.floor(GLASS.mullionWidth / 2));
  }
  return columns;
}

/**
 * A pier: the wall, untouched, with a darker edge either side for definition.
 * Untouched is 1.0, which the blank sheet already is — a pier is painted by
 * painting its edges only.
 */
function paintPier(sheet: Sheet, pier: Span, y0: number, y1: number): void {
  const [x0, x1] = pier;
  scaleRect(sheet, x0, y0, x0 + GLASS.pierEdgeWidth, y1, GLASS.pierEdge);
  scaleRect(sheet, x1 - GLASS.pierEdgeWidth, y0, x1, y1, GLASS.pierEdge);
}

interface GlassGroupOptions {
  /**
   * Paint the sky reflection: the body sits at `GLASS.body × tint` and the
   * top quarter climbs to `1.0 × tint`. Off for a lobby, which sits under a
   * slab and reflects no sky — a pale band under a floor plate reads wrong.
   */
  readonly reflection: boolean;
  /** Left-edge columns of the mullions, from `evenMullions` or `pitchedMullions`. */
  readonly mullions: readonly number[];
}

/**
 * One group of glass between two piers: tint, reflection, mullions, sill.
 * Every element is a multiple of the tint so the group is blue-shifted end to
 * end and no texel in it is ever brighter than the tint itself — the map
 * cannot lift, and the test that checks `b > g > r` at a group's centre would
 * fail on any element painted as a grey.
 */
function paintGlassGroup(
  sheet: Sheet,
  group: Span,
  y0: number,
  y1: number,
  tint: Rgb,
  options: GlassGroupOptions,
): void {
  const [x0, x1] = group;
  const body = options.reflection ? GLASS.body : 1;
  setRect(sheet, x0, y0, x1, y1, scaled(tint, body));

  if (options.reflection) {
    const reflectionRows = Math.round((y1 - y0) * GLASS.reflectionShare);
    const reflectionBottom = y1 - reflectionRows;
    for (let y = reflectionBottom; y < y1; y += 1) {
      const t = (y - reflectionBottom + 1) / reflectionRows;
      setRect(sheet, x0, y, x1, y + 1, scaled(tint, body + (1 - body) * t));
    }
  }

  for (const column of options.mullions) {
    scaleRect(sheet, Math.max(x0, column), y0, Math.min(x1, column + GLASS.mullionWidth), y1, GLASS.mullion);
  }

  scaleRect(sheet, x0, y0, x1, y0 + GLASS.sillRows, GLASS.sill);
}

// --- The pages ------------------------------------------------------------

type PagePainter = (sheet: Sheet, glassTint: Rgb, salt: number) => void;

/**
 * `plain`: exactly 1.0 everywhere, and no grain. This is the page a caller
 * maps onto anything it wants left alone — a roof, an underside, a setback's
 * parapet — and "left alone" has to mean byte-for-byte 255 so that a face
 * wearing it is indistinguishable from a face with no map at all.
 */
function paintPlain(): void {}

/**
 * `spandrel`: the solid band between window rows. Near-white with an
 * aggregate grain and one floor-joint line low in the band; nothing else,
 * because a spandrel with more on it competes with the glass strip above it
 * and the storey rhythm — the one thing a facade must read as at distance —
 * goes.
 */
function paintSpandrel(sheet: Sheet, _glassTint: Rgb, salt: number): void {
  const joint = rowsOf(sheet, SPANDREL.jointHeight);
  scaleRect(sheet, 0, joint - 1, sheet.width, joint - 1 + SPANDREL.jointRows, SPANDREL.joint);
  applyGrain(sheet, GRAIN.spandrelAmplitude, salt);
}

/** `glass`: pier | group | pier | group | pier | group | pier, one or two mullions a group. */
function paintGlass(sheet: Sheet, glassTint: Rgb, salt: number): void {
  const shares = Array.from({ length: GLASS_MID.groups + 1 }, () => GLASS_MID.pierShare);
  const { piers, groups } = splitStrip(sheet.width, shares);
  for (const pier of piers) paintPier(sheet, pier, 0, sheet.height);
  groups.forEach((group, index) => {
    // One or two mullions, drawn per group so three identical groups do not
    // read as a repeat. Salted apart from the grain field.
    const count = hash01(index, 0, salt + 1) < 0.5 ? 1 : 2;
    paintGlassGroup(sheet, group, 0, sheet.height, glassTint, {
      reflection: true,
      mullions: evenMullions(group, count),
    });
  });
  applyGrain(sheet, GRAIN.amplitude, salt);
}

/** `glassLow`: a ribbon window — two groups about one central pier, mullions at a pitch. */
function paintGlassLow(sheet: Sheet, glassTint: Rgb, salt: number): void {
  const { piers, groups } = splitStrip(sheet.width, [
    GLASS_LOW.endPierShare,
    GLASS_LOW.centrePierShare,
    GLASS_LOW.endPierShare,
  ]);
  for (const pier of piers) paintPier(sheet, pier, 0, sheet.height);
  const pitch = colsOf(sheet, GLASS_LOW.mullionPitch);
  for (const group of groups) {
    paintGlassGroup(sheet, group, 0, sheet.height, glassTint, {
      reflection: true,
      mullions: pitchedMullions(group, pitch),
    });
  }
  applyGrain(sheet, GRAIN.amplitude, salt);
}

/** `glassTall`: a curtain wall — four wide groups, five narrow piers, one mullion a group. */
function paintGlassTall(sheet: Sheet, glassTint: Rgb, salt: number): void {
  const shares = Array.from({ length: GLASS_TALL.groups + 1 }, () => GLASS_TALL.pierShare);
  const { piers, groups } = splitStrip(sheet.width, shares);
  for (const pier of piers) paintPier(sheet, pier, 0, sheet.height);
  for (const group of groups) {
    paintGlassGroup(sheet, group, 0, sheet.height, glassTint, {
      reflection: true,
      mullions: evenMullions(group, GLASS_TALL.mullionsPerGroup),
    });
  }
  applyGrain(sheet, GRAIN.amplitude, salt);
}

/** `ground`: plinth, two recessed panels flanking a closed door, fascia. */
function paintGround(sheet: Sheet, _glassTint: Rgb, salt: number): void {
  const width = sheet.width;
  const plinthTop = rowsOf(sheet, GROUND.plinthShare);
  const fasciaBottom = sheet.height - rowsOf(sheet, GROUND.fasciaShare);

  setRect(sheet, 0, 0, width, plinthTop, grey(GROUND.plinth));
  setRect(sheet, 0, plinthTop - GROUND.plinthEdgeRows, width, plinthTop, grey(GROUND.plinthEdge));
  setRect(sheet, 0, fasciaBottom, width, sheet.height, grey(GROUND.fascia));

  const doorLeft = colsOf(sheet, 0.5 - GROUND.doorShare / 2);
  const doorRight = colsOf(sheet, 0.5 + GROUND.doorShare / 2);
  const lintelBottom = fasciaBottom - GROUND.lintelRows;
  setRect(sheet, doorLeft, plinthTop, doorRight, lintelBottom, grey(GROUND.door));
  setRect(sheet, doorLeft, lintelBottom, doorRight, fasciaBottom, grey(GROUND.lintel));

  const margin = colsOf(sheet, GROUND.panelMargin);
  const panels: Span[] = [
    [margin, doorLeft - margin],
    [doorRight + margin, width - margin],
  ];
  for (const [x0, x1] of panels) {
    setRect(sheet, x0, plinthTop, x1, fasciaBottom, grey(GROUND.panel));
    const border = GROUND.panelBorderWidth;
    const frame = grey(GROUND.panelBorder);
    setRect(sheet, x0, plinthTop, x0 + border, fasciaBottom, frame);
    setRect(sheet, x1 - border, plinthTop, x1, fasciaBottom, frame);
    setRect(sheet, x0, plinthTop, x1, plinthTop + border, frame);
    setRect(sheet, x0, fasciaBottom - border, x1, fasciaBottom, frame);
  }

  applyGrain(sheet, GRAIN.amplitude, salt);
}

/** `groundLow`: plinth, two roller shutters in slats about a narrow door, fascia. */
function paintGroundLow(sheet: Sheet, _glassTint: Rgb, salt: number): void {
  const width = sheet.width;
  const plinthTop = rowsOf(sheet, GROUND_LOW.plinthShare);
  const fasciaBottom = sheet.height - rowsOf(sheet, GROUND_LOW.fasciaShare);

  setRect(sheet, 0, 0, width, plinthTop, grey(GROUND_LOW.plinth));
  setRect(sheet, 0, fasciaBottom, width, sheet.height, grey(GROUND_LOW.fascia));

  // wall | shutter | wall | door | wall | shutter | wall — the four walls share
  // whatever the shutters and the door leave.
  const shutter = colsOf(sheet, GROUND_LOW.shutterShare);
  const door = colsOf(sheet, GROUND_LOW.doorShare);
  const wall = Math.round((width - shutter * 2 - door) / 4);
  const doorLeft = wall * 2 + shutter;
  const shutters: Span[] = [
    [wall, wall + shutter],
    [doorLeft + door + wall, doorLeft + door + wall + shutter],
  ];

  setRect(sheet, doorLeft, plinthTop, doorLeft + door, fasciaBottom, grey(GROUND_LOW.door));

  const zone = fasciaBottom - plinthTop;
  for (const [x0, x1] of shutters) {
    for (let slat = 0; slat < GROUND_LOW.slats; slat += 1) {
      const y0 = plinthTop + Math.round((zone * slat) / GROUND_LOW.slats);
      const y1 = plinthTop + Math.round((zone * (slat + 1)) / GROUND_LOW.slats);
      setRect(sheet, x0, y0, x1, y1, grey(slat % 2 === 0 ? GROUND_LOW.slatA : GROUND_LOW.slatB));
    }
  }

  applyGrain(sheet, GRAIN.amplitude, salt);
}

/** `groundTall`: a tall plinth, a lobby band of darker glass in three groups, a lintel. */
function paintGroundTall(sheet: Sheet, glassTint: Rgb, salt: number): void {
  const width = sheet.width;
  const plinthTop = rowsOf(sheet, GROUND_TALL.plinthShare);
  const lintelBottom = sheet.height - rowsOf(sheet, GROUND_TALL.lintelShare);

  setRect(sheet, 0, 0, width, plinthTop, grey(GROUND_TALL.plinth));
  setRect(sheet, 0, lintelBottom, width, sheet.height, grey(GROUND_TALL.lintel));

  const shares = Array.from({ length: GROUND_TALL.groups + 1 }, () => GROUND_TALL.pierShare);
  const { piers, groups } = splitStrip(width, shares);
  const lobby = scaled(glassTint, GROUND_TALL.glass);
  for (const pier of piers) paintPier(sheet, pier, plinthTop, lintelBottom);
  for (const group of groups) {
    paintGlassGroup(sheet, group, plinthTop, lintelBottom, lobby, {
      reflection: false,
      mullions: evenMullions(group, 1),
    });
  }

  applyGrain(sheet, GRAIN.amplitude, salt);
}

const PAINTERS: Readonly<Record<FacadePageId, PagePainter>> = {
  plain: paintPlain,
  spandrel: paintSpandrel,
  ground: paintGround,
  groundLow: paintGroundLow,
  groundTall: paintGroundTall,
  glass: paintGlass,
  glassLow: paintGlassLow,
  glassTall: paintGlassTall,
};

// --- The atlas ------------------------------------------------------------

function pageRect(index: number): FacadePageRect {
  const column = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  return Object.freeze({
    u0: (column * CELL_WIDTH + FACADE_PAGE_GUTTER) / FACADE_ATLAS_SIZE,
    v0: (row * CELL_HEIGHT + FACADE_PAGE_GUTTER) / FACADE_ATLAS_SIZE,
    u1: ((column + 1) * CELL_WIDTH - FACADE_PAGE_GUTTER) / FACADE_ATLAS_SIZE,
    v1: ((row + 1) * CELL_HEIGHT - FACADE_PAGE_GUTTER) / FACADE_ATLAS_SIZE,
  });
}

/** Each page's interior rect in UV, gutter excluded. */
export const FACADE_PAGES: Readonly<Record<FacadePageId, FacadePageRect>> = Object.freeze(
  Object.fromEntries(FACADE_PAGE_IDS.map((id, index) => [id, pageRect(index)])) as Record<
    FacadePageId,
    FacadePageRect
  >,
);

/**
 * Copy a painted page into its cell, gutter included.
 *
 * Every cell texel reads the interior texel nearest to it — inside the
 * interior that is itself, in the gutter it is the border texel on the same
 * row or column, and in a corner it is the corner. That is edge extension,
 * and it is done here as a coordinate clamp rather than as a second pass so
 * there is no way to paint a page and forget its gutter.
 */
function blitPage(atlas: Uint8Array, sheet: Sheet, index: number): void {
  const column = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const cellX = column * CELL_WIDTH;
  const cellY = row * CELL_HEIGHT;
  for (let cy = 0; cy < CELL_HEIGHT; cy += 1) {
    const sy = Math.min(sheet.height - 1, Math.max(0, cy - FACADE_PAGE_GUTTER));
    for (let cx = 0; cx < CELL_WIDTH; cx += 1) {
      const sx = Math.min(sheet.width - 1, Math.max(0, cx - FACADE_PAGE_GUTTER));
      const source = (sy * sheet.width + sx) * 3;
      const target = ((cellY + cy) * FACADE_ATLAS_SIZE + cellX + cx) * 4;
      atlas[target] = byteFromLinear(sheet.data[source]);
      atlas[target + 1] = byteFromLinear(sheet.data[source + 1]);
      atlas[target + 2] = byteFromLinear(sheet.data[source + 2]);
      atlas[target + 3] = 255;
    }
  }
}

/**
 * Paint the whole atlas.
 *
 * A `glassTint` channel above 1.0 is refused rather than clipped: the sheet
 * cannot store a multiplier above 1.0, so clipping would ship a glass colour
 * silently different from the one in the tuning table, and the test that
 * pins the atlas to `BUILDING_FACADE.glassTint` would pass against the wrong
 * colour. A channel at or below zero is refused for the same reason from the
 * other side — a black window is the void the pages exist to avoid.
 */
export function paintFacadeAtlas(options: FacadeAtlasOptions): FacadeAtlas {
  const { r, g, b } = options.glassTint;
  for (const [name, channel] of [['r', r], ['g', g], ['b', b]] as const) {
    if (!(channel > 0 && channel <= 1)) {
      throw new RangeError(`glassTint.${name} must be in (0, 1], got ${channel}`);
    }
  }
  const tint: Rgb = [r, g, b];
  const data = new Uint8Array(FACADE_ATLAS_SIZE * FACADE_ATLAS_SIZE * 4);
  FACADE_PAGE_IDS.forEach((id, index) => {
    const sheet = blankSheet();
    PAINTERS[id](sheet, tint, index + 1);
    blitPage(data, sheet, index);
  });
  return { size: FACADE_ATLAS_SIZE, data };
}

/**
 * Linear luminance of a page's interior texels — the gutter excluded, because
 * it is a copy of the border and would weight the edges twice.
 *
 * Decodes the sRGB bytes back to linear before averaging, so the number is
 * the one the GPU multiplies with and not the one in the file. For tests and
 * the audit's dump tool.
 */
export function facadePageLuminance(
  atlas: FacadeAtlas,
  page: FacadePageId,
): { readonly mean: number; readonly min: number; readonly max: number } {
  const rect = FACADE_PAGES[page];
  const x0 = Math.round(rect.u0 * atlas.size);
  const x1 = Math.round(rect.u1 * atlas.size);
  const y0 = Math.round(rect.v0 * atlas.size);
  const y1 = Math.round(rect.v1 * atlas.size);
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * atlas.size + x) * 4;
      const value = luminance(
        srgbToLinear(atlas.data[i] / 255),
        srgbToLinear(atlas.data[i + 1] / 255),
        srgbToLinear(atlas.data[i + 2] / 255),
      );
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { mean: sum / ((x1 - x0) * (y1 - y0)), min, max };
}
