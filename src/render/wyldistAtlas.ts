/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { loftPoint, vAtHeight, type LoftProfile, type UvRect } from './blockoutKit.ts';
import {
  inkField, inkOver, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes,
  type InkBox, type InkPoint, type InkSheet, type Rgb,
} from './inkKit.ts';

/** Wyldist's cloth and helmet are original deterministic paint, never images. */
export const ATLAS_SIZE = 1024;
const BOXES = {
  shirt: { x0: 0, y0: 0, x1: 1024, y1: 512 },
  leftSleeve: { x0: 0, y0: 512, x1: 512, y1: 768 },
  rightSleeve: { x0: 512, y0: 512, x1: 1024, y1: 768 },
  helmet: { x0: 0, y0: 768, x1: 768, y1: 1024 },
  shirtFlat: { x0: 768, y0: 768, x1: 832, y1: 832 },
  redFlat: { x0: 832, y0: 768, x1: 896, y1: 832 },
  blackFlat: { x0: 896, y0: 768, x1: 960, y1: 832 },
  blank: { x0: 960, y0: 768, x1: 1024, y1: 832 },
} as const;
export type WyldistPage = keyof typeof BOXES;

// The wrapped fields extend their boundary texels into this gutter, including
// the two halves of the small sleeve mark at its outward-facing seam.
const INSET = 4.5;
export const WYLDIST_REGIONS: Readonly<Record<WyldistPage, UvRect>> = Object.freeze(
  Object.fromEntries(Object.entries(BOXES).map(([name, box]) => [name, Object.freeze({
    u0: (box.x0 + INSET) / ATLAS_SIZE, v0: (box.y0 + INSET) / ATLAS_SIZE,
    u1: (box.x1 - INSET) / ATLAS_SIZE, v1: (box.y1 - INSET) / ATLAS_SIZE,
  })])),
) as Readonly<Record<WyldistPage, UvRect>>;

export interface WyldistSheetLayout {
  readonly torso: LoftProfile;
  /** The actual short sleeve's profile, not the bare arm underneath it. */
  readonly upperArm: LoftProfile;
  readonly head: LoftProfile;
  /** Opening-relative helmet columns exclude these angular apertures per ring. */
  readonly headOpenings?: readonly number[];
  readonly visor: { readonly halfSpan: number; readonly from: number; readonly to: number };
  readonly rimTop: number;
  /**
   * The chest V; `curve` < 1 opens it wider at mid-depth than a straight V.
   * `throat`, if set, widens it above `to` (the front collar notch) so the
   * shirt's front top reads as the base of the neck, never a stand of print.
   */
  readonly opening: {
    readonly from: number; readonly to: number; readonly halfWidth: number;
    readonly curve?: number; readonly throat?: number;
  };
  readonly sleeveHem?: number;
  /** Below this torso height the tucked hem edge shows the inside fabric. */
  readonly shirtHem?: number;
  /** The rolled revers' outer edge (V point → corner at |x| = reach) casts a painted shadow. */
  readonly rever?: { readonly corner: number; readonly reach: number };
  /** The turned-down collar's lower edge round the back casts a painted shadow. */
  readonly collarBack?: number;
}

/** The shared chest boundary: the mesh paints skin and this sheet leaves it neutral. */
export function wyldistOpeningHalfWidth(
  layout: Pick<WyldistSheetLayout, 'opening'>, y: number,
): number {
  const { from, to, halfWidth, curve = 1, throat } = layout.opening;
  if (throat !== undefined && y > to) return halfWidth + (throat - halfWidth) * clamp((y - to) / 0.03);
  return halfWidth * clamp((y - from) / Math.max(1e-6, to - from)) ** curve;
}

const TAU = Math.PI * 2;
const CLEAR: Rgb = [1, 1, 1];
const PRINT = linearFromHex(BLOCKOUT_COLOURS.wyldistPrint);
const HELMET_GROUND = linearFromHex(BLOCKOUT_COLOURS.wyldistHelmetGround);

/** Local inks describe the photographed garment, rather than adding palette roles. */
// C2: the field is 17 % brighter at the same 192° hue; palms are green on
// brown trunks; small sign, lighthouse and boat vignettes add the photo's
// yellow and orange. The inside fabric is one dark solid.
export const WYLDIST_INKS = Object.freeze({
  turquoise: 0x08b5e1, sea: 0x0679ab, foam: 0xf1f3ed,
  red: 0xda3035, flowerDark: 0x82252f, palm: 0x1d5a2e,
  leaf: 0x4f9b3f, sand: 0xd6b06c, outline: 0x2b5664,
  trunk: 0x7b4a26, yellow: 0xf3c63a, orange: 0xe8782c, inside: 0x174a59, pearl: 0xf4f2eb,
  helmetRed: 0xda3035, helmetDark: 0x252b30, badge: 0xf0efea,
});
const BLUE = inkOver(PRINT, linearFromHex(WYLDIST_INKS.turquoise));
const SEA = inkOver(PRINT, linearFromHex(WYLDIST_INKS.sea));
const FOAM = inkOver(PRINT, linearFromHex(WYLDIST_INKS.foam));
const RED = inkOver(PRINT, linearFromHex(WYLDIST_INKS.red));
const FLOWER_DARK = inkOver(PRINT, linearFromHex(WYLDIST_INKS.flowerDark));
const PALM = inkOver(PRINT, linearFromHex(WYLDIST_INKS.palm));
const LEAF = inkOver(PRINT, linearFromHex(WYLDIST_INKS.leaf));
const SAND = inkOver(PRINT, linearFromHex(WYLDIST_INKS.sand));
const OUTLINE = inkOver(PRINT, linearFromHex(WYLDIST_INKS.outline));
const TRUNK = inkOver(PRINT, linearFromHex(WYLDIST_INKS.trunk));
const YELLOW = inkOver(PRINT, linearFromHex(WYLDIST_INKS.yellow));
const ORANGE = inkOver(PRINT, linearFromHex(WYLDIST_INKS.orange));
const INSIDE = inkOver(PRINT, linearFromHex(WYLDIST_INKS.inside));
const PEARL = inkOver(PRINT, linearFromHex(WYLDIST_INKS.pearl));
const SKIN = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wyldistSkin));
const LID_RED = inkOver(HELMET_GROUND, linearFromHex(WYLDIST_INKS.helmetRed));
const LID_DARK = inkOver(HELMET_GROUND, linearFromHex(WYLDIST_INKS.helmetDark));
const BADGE = inkOver(HELMET_GROUND, linearFromHex(WYLDIST_INKS.badge));

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const wrap = (value: number, period = 1): number => ((value % period) + period) % period;
const turnFrom = (s: number, centre: number): number => wrap(s - centre + 0.5) - 0.5;
const cover = (distance: number, edge = 0.0014): number => clamp(0.5 - distance / edge);

function segmentDistance(x: number, y: number, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(1e-12, dx * dx + dy * dy));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

function pathDistance(x: number, y: number, points: readonly InkPoint[], weight: number): number {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    nearest = Math.min(nearest, segmentDistance(x, y, points[i - 1]!, points[i]!));
  }
  return nearest - weight / 2;
}

function ringAtY(profile: LoftProfile, y: number): LoftProfile[number] {
  const v = vAtHeight(profile, y);
  const i = Math.min(profile.length - 2, Math.floor(v));
  const a = profile[i]!, b = profile[i + 1]!, t = v - i;
  return {
    y, halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
    halfDepth: a.halfDepth + (b.halfDepth - a.halfDepth) * t,
    x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    square: a.square + (b.square - a.square) * t,
  };
}

function heightAt(profile: LoftProfile, t: number): number {
  const v = clamp(t) * (profile.length - 1);
  const i = Math.min(profile.length - 2, Math.floor(v));
  return profile[i]!.y + (profile[i + 1]!.y - profile[i]!.y) * (v - i);
}

function paintWrapped(
  sheet: InkSheet, box: InkBox, profile: LoftProfile, shade: (s: number, y: number) => Rgb,
): void {
  inkField(sheet, { ...box, x1: box.x1 - 1, y1: box.y1 - 1 }, (x, y) => {
    const s = clamp((x - box.x0 - INSET) / (box.x1 - box.x0 - INSET * 2));
    const t = clamp((y - box.y0 - INSET) / (box.y1 - box.y0 - INSET * 2));
    return [shade(s, heightAt(profile, t)), 1];
  });
}

/** A stable integer hash varies motif placement without a random generator. */
function hash(x: number, y: number, salt: number): number {
  // The salt is mixed, not just XORed into the low bits: before, one cell's
  // kind and angle were correlated and every hibiscus pointed one way.
  let v = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 101, 0x119de1f3) ^ Math.imul(salt + 7, 0x27d4eb2d);
  v ^= v >>> 15; v = Math.imul(v, 0x45d9f3b); v ^= v >>> 16; v = Math.imul(v, 0x2c1b3c6d); v ^= v >>> 15;
  return (v >>> 0) / 0xffffffff;
}

interface TropicalCell {
  readonly x: number;
  readonly y: number;
  /** 0 hibiscus, 1 palm, 2 plumeria pair, 3 vignette, 4 surfboard. */
  readonly kind: number;
  /** Vignette: 0 sign board, 1 lighthouse, 2 sailing boat. Surfboard: colourway. */
  readonly variant: number;
  /** 0 cloud, 1 breaking wave, 2 leaves. */
  readonly accompaniment: number;
  readonly fillerKind: number;
  readonly flowerLeaves: boolean;
  readonly angle: number;
  readonly scale: number;
  /** ±1: accompaniments mirror so one wave or cloud never repeats in step. */
  readonly mirror: number;
  readonly cloudX: number;
  readonly cloudY: number;
  readonly cloudScale: number;
  readonly cloudletX: number;
  readonly cloudletY: number;
  readonly fronds: readonly (readonly [InkPoint, InkPoint, InkPoint])[];
}

interface TropicalField {
  readonly length: number;
  /** This height's own girth: motifs keep their aspect where the loft narrows. */
  readonly around: (y: number) => number;
  readonly columns: number;
  readonly firstRow: number;
  readonly cells: readonly (readonly TropicalCell[])[];
}

const TILE_HEIGHT = 0.064;

// Cloth edges soften to at least one texel: the lower shirt's page runs at
// half the vertical density of its width, and a fixed 1.4 mm edge stair-stepped.
let clothEdge = 0.0014;
const soft = (distance: number, edge = 0.0010): number => clamp(0.5 - distance / Math.max(edge, clothEdge));

/** `paintWrapped`'s exact (s, height) mapping, with the cloth edge set per texel. */
function paintCloth(
  sheet: InkSheet, box: InkBox, profile: LoftProfile, circumference: number, shade: (s: number, y: number) => Rgb,
): void {
  const columns = box.x1 - box.x0 - INSET * 2, rows = box.y1 - box.y0 - INSET * 2;
  inkField(sheet, { ...box, x1: box.x1 - 1, y1: box.y1 - 1 }, (x, y) => {
    const s = clamp((x - box.x0 - INSET) / columns);
    const t = clamp((y - box.y0 - INSET) / rows);
    const tall = Math.abs(heightAt(profile, t + 0.5 / rows) - heightAt(profile, t - 0.5 / rows));
    clothEdge = Math.max(circumference / columns, tall) * 0.9;
    return [shade(s, heightAt(profile, t)), 1];
  });
  clothEdge = 0.0014;
}

function tropicalField(profile: LoftProfile, columns: number): TropicalField {
  // Ramanujan's ellipse circumference sets motif scale in metres. The shirt's
  // form is still the authored loft; this only keeps flowers from stretching.
  // Placement runs on the mid girth; each row draws at its own girth, so the
  // print near the collar is no longer squeezed into a 2.4:1 barcode.
  const around = (y: number): number => {
    const ring = ringAtY(profile, Math.max(profile[0]!.y, Math.min(profile[profile.length - 1]!.y, y)));
    const a = ring.halfWidth, b = ring.halfDepth, h = ((a - b) / Math.max(1e-5, a + b)) ** 2;
    return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  };
  const length = around((profile[0]!.y + profile[profile.length - 1]!.y) / 2);
  const firstRow = Math.floor(profile[0]!.y / TILE_HEIGHT) - 1;
  const lastRow = Math.floor(profile[profile.length - 1]!.y / TILE_HEIGHT) + 1;
  const cells: TropicalCell[][] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    const rowCells: TropicalCell[] = [];
    for (let col = 0; col < columns; col += 1) {
      const seed = hash(col, row, 73);
      const accompaniment = hash(col, row, 79);
      const filler = hash(col, row, 83);
      const kind = seed < 0.26 ? 0 : seed < 0.42 ? 1 : seed < 0.66 ? 2 : seed < 0.82 ? 3 : 4;
      // Flowers turn freely; palms, signs and boats stand nearly upright.
      const upright = kind === 1 || kind === 3;
      const angle = upright ? (hash(col, row, 11) - 0.5) * 0.45 : hash(col, row, 11) * TAU;
      // Six separate fronds splay from the crown with gaps between them and
      // droop hard at their tips: a closed arc of fronds read as a parasol.
      const fronds: [InkPoint, InkPoint, InkPoint][] = [];
      for (let leaf = 0; leaf < 6; leaf += 1) {
        const turn = Math.PI * (0.04 + leaf * 0.92 / 5), c = Math.cos(turn), sn = Math.sin(turn);
        fronds.push([[0.003, 0.023], [0.003 + c * 0.014, 0.025 + sn * 0.011],
          [0.003 + c * 0.027, 0.016 + sn * 0.004 - Math.abs(c) * 0.010]]);
      }
      rowCells.push({
        x: (col + 0.30 + hash(col, row, 19) * 0.40) * length / columns,
        y: (row + 0.42 + hash(col, row, 29) * 0.30) * TILE_HEIGHT,
        kind, variant: Math.floor(hash(col, row, 31) * 3),
        accompaniment: accompaniment < 0.56 ? 0 : accompaniment < 0.76 ? 1 : 2,
        fillerKind: filler < 0.40 ? 0 : filler < 0.62 ? 1 : filler < 0.75 ? 2 : 3,
        flowerLeaves: hash(col, row, 97) < 0.55,
        // Hibiscus and plumeria vary ±25 % about their size.
        angle, scale: 0.72 + hash(col, row, 41) * 0.40,
        mirror: hash(col, row, 43) < 0.5 ? -1 : 1,
        cloudX: (col + 0.70 + hash(col, row, 47) * 0.12) * length / columns,
        cloudY: (row + 0.12 + hash(col, row, 53) * 0.16) * TILE_HEIGHT,
        cloudScale: 0.65 + hash(col, row, 59) * 0.35,
        cloudletX: (col + 0.08 + hash(col, row, 61) * 0.14) * length / columns,
        cloudletY: (row + 0.82 + hash(col, row, 67) * 0.12) * TILE_HEIGHT,
        fronds,
      });
    }
    cells.push(rowCells);
  }
  return { length, around, columns, firstRow, cells };
}

const FLOWER_DIRECTIONS = Array.from({ length: 5 }, (_, petal): InkPoint => {
  const angle = petal / 5 * TAU + 0.45;
  return [Math.cos(angle), Math.sin(angle)];
});

function colourFlower(x: number, y: number, pale: boolean, background: Rgb): Rgb {
  const radius = Math.hypot(x, y);
  if (radius > 0.026) return background;
  let petals = Infinity, vein = Infinity;
  // Rounded overlapping petals, rather than the old radial cosine's pointed
  // five-arm symbol. Individual veins make the tiny print read as a flower.
  for (const [cos, sin] of FLOWER_DIRECTIONS) {
    const along = x * cos + y * sin, across = -x * sin + y * cos;
    petals = Math.min(petals, (Math.hypot((along - 0.0095) / 0.0135, across / (pale ? 0.0085 : 0.0105)) - 1) * 0.010);
    vein = Math.min(vein, segmentDistance(x, y, [cos * 0.004, sin * 0.004], [cos * 0.017, sin * 0.017]) - 0.0006);
  }
  const coverage = soft(petals);
  let colour = mixRgb(background, pale ? OUTLINE : FLOWER_DARK, soft(petals - 0.0007));
  colour = mixRgb(colour, pale ? FOAM : RED, coverage);
  colour = mixRgb(colour, pale ? SAND : FLOWER_DARK, soft(vein, 0.0009) * coverage * 0.45);
  colour = mixRgb(colour, pale ? YELLOW : FLOWER_DARK, soft(radius - (pale ? 0.0055 : 0.005)));
  if (pale) return colour;
  const stamen = pathDistance(x, y, [[0, 0], [0.003, 0.008], [0.011, 0.018]], 0.0013);
  return mixRgb(colour, SAND, Math.max(soft(stamen), soft(Math.hypot(x - 0.011, y - 0.018) - 0.0025)) * coverage);
}

/** Green fronds over a brown ringed trunk, so a palm never reads as an insect. */
function colourPalm(cell: TropicalCell, x: number, y: number, background: Rgb): Rgb {
  const trunk = pathDistance(x, y, [[-0.009, -0.032], [-0.004, -0.010], [0.001, 0.008], [0.003, 0.022]], 0.0044);
  let colour = mixRgb(background, OUTLINE, soft(trunk - 0.0008) * 0.8);
  colour = mixRgb(colour, TRUNK, soft(trunk));
  colour = mixRgb(colour, OUTLINE, soft(trunk) * soft(Math.abs(wrap(y + 0.032, 0.0065) - 0.0032) - 0.0007) * 0.45);
  let frond = Infinity;
  // Each frond tapers from the crown to its tip.
  for (const leaf of cell.fronds) {
    const reach = Math.hypot(x - leaf[0][0], y - leaf[0][1]) / 0.029;
    frond = Math.min(frond, pathDistance(x, y, leaf, 0.0046 * (1 - 0.6 * clamp(reach))));
  }
  colour = mixRgb(colour, OUTLINE, soft(frond - 0.0008) * 0.8);
  colour = mixRgb(colour, PALM, soft(frond));
  let rib = Infinity;
  for (const leaf of cell.fronds) rib = Math.min(rib, pathDistance(x, y, leaf, 0.0011));
  colour = mixRgb(colour, LEAF, soft(rib) * soft(frond));
  for (const [cx, cy] of [[0.0005, 0.0195], [0.0055, 0.0195]] as const) {
    colour = mixRgb(colour, TRUNK, soft(Math.hypot(x - cx, y - cy) - 0.0022));
  }
  return colour;
}

const LEAF_CLUSTERS = [
  [-0.022, -0.013, -0.65], [-0.016, 0.002, 0.80],
  [0.006, 0.011, -0.60], [0.022, 0.017, 0.75],
].map(([x, y, angle]) => ({ x: x!, y: y!, cos: Math.cos(angle!), sin: Math.sin(angle!) }));

/** Small outlined green leaves break up pale motifs without becoming another crest. */
function colourLeaves(x: number, y: number, background: Rgb): Rgb {
  let colour = mixRgb(background, PALM, soft(pathDistance(x, y,
    [[-0.031, -0.020], [-0.011, 0], [0.010, 0.008], [0.027, 0.022]], 0.0016), 0.001));
  for (const { x: cx, y: cy, cos, sin } of LEAF_CLUSTERS) {
    const dx = x - cx, dy = y - cy;
    const along = dx * cos + dy * sin, across = -dx * sin + dy * cos;
    const leaf = (Math.hypot(along / 0.0105, across / 0.0045) - 1) * 0.0045;
    colour = mixRgb(colour, PALM, soft(leaf - 0.0005, 0.001));
    colour = mixRgb(colour, LEAF, soft(leaf, 0.001));
    colour = mixRgb(colour, PALM,
      soft(Math.max(Math.abs(across) - 0.00045, Math.abs(along) - 0.008), 0.0009) * soft(leaf, 0.001) * 0.55);
  }
  return colour;
}

function colourSurf(variant: number, x: number, y: number, background: Rgb): Rgb {
  // Small unlettered board; none is a brand mark.
  const board = (Math.hypot(x / 0.0095, y / 0.031) - 1) * 0.0095;
  if (board > 0.004) return background;
  let colour = mixRgb(background, OUTLINE, soft(board - 0.001));
  colour = mixRgb(colour, variant === 1 ? YELLOW : variant === 2 ? FOAM : SAND, soft(board));
  return mixRgb(colour, variant === 1 ? ORANGE : RED,
    soft(Math.max(Math.abs(x) - 0.0020, Math.abs(y) - 0.025)) * soft(board));
}

/** Rounded-rectangle distance, negative inside. */
function boxDistance(x: number, y: number, halfX: number, halfY: number, round: number): number {
  const qx = Math.abs(x) - halfX + round, qy = Math.abs(y) - halfY + round;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round;
}

/** Tiny coloured scenes from the shirt: texture, never a mark or a word. */
function colourVignette(variant: number, x: number, y: number, background: Rgb): Rgb {
  if (Math.abs(x) > 0.024 || Math.abs(y) > 0.034) return background;
  let colour = background;
  if (variant === 0) {
    // A beach hut: a red roof over a yellow plank wall with a dark doorway
    // and a sun beside it. A picture, never a board that reads as a glyph.
    colour = mixRgb(colour, SAND, soft((Math.hypot(x / 0.020, (y + 0.022) / 0.005) - 1) * 0.005));
    const wall = boxDistance(x, y + 0.008, 0.012, 0.010, 0.001);
    colour = mixRgb(colour, OUTLINE, soft(wall - 0.0008));
    colour = mixRgb(colour, YELLOW, soft(wall));
    colour = mixRgb(colour, OUTLINE, soft(boxDistance(x + 0.003, y + 0.012, 0.0028, 0.006, 0.0008)) * 0.9);
    const roof = polygonDistance(x, y, [[-0.016, 0.0015], [0.016, 0.0015], [0, 0.014]]);
    colour = mixRgb(colour, OUTLINE, soft(roof - 0.0008));
    colour = mixRgb(colour, RED, soft(roof));
    colour = mixRgb(colour, ORANGE, soft(Math.hypot(x - 0.016, y - 0.016) - 0.0045));
  } else if (variant === 1) {
    // A lighthouse on its rock: red and white bands, dark gallery, lit lamp.
    colour = mixRgb(colour, SAND, soft((Math.hypot(x / 0.016, (y + 0.028) / 0.0055) - 1) * 0.0055));
    const t = clamp((y + 0.026) / 0.040), half = 0.0066 - t * 0.0026;
    const tower = Math.max(Math.abs(x) - half, Math.abs(y + 0.008) - 0.018);
    colour = mixRgb(colour, OUTLINE, soft(tower - 0.0008));
    colour = mixRgb(colour, wrap(y + 0.026, 0.0190) < 0.0095 ? RED : FOAM, soft(tower));
    colour = mixRgb(colour, OUTLINE, soft(boxDistance(x, y - 0.0115, 0.0062, 0.0016, 0.0005)));
    colour = mixRgb(colour, YELLOW, soft(boxDistance(x, y - 0.0165, 0.0034, 0.0032, 0.0008)));
    colour = mixRgb(colour, RED, soft(polygonDistance(x, y, [[-0.0050, 0.0196], [0.0050, 0.0196], [0, 0.0260]])));
  } else {
    // A small sailing boat on a line of sea.
    colour = mixRgb(colour, SEA, soft(Math.max(Math.abs(x) - 0.020, Math.abs(y + 0.0155) - 0.0016)));
    const hull = polygonDistance(x, y, [[-0.018, -0.006], [0.018, -0.006], [0.012, -0.0135], [-0.012, -0.0135]]);
    colour = mixRgb(colour, OUTLINE, soft(hull - 0.0008));
    colour = mixRgb(colour, ORANGE, soft(hull));
    colour = mixRgb(colour, OUTLINE, soft(Math.max(Math.abs(x + 0.0005) - 0.0008, Math.abs(y - 0.007) - 0.013)));
    const sail = polygonDistance(x, y, [[0.0012, -0.004], [0.0012, 0.019], [0.0145, -0.004]]);
    colour = mixRgb(colour, OUTLINE, soft(sail - 0.0007));
    colour = mixRgb(colour, FOAM, soft(sail));
    colour = mixRgb(colour, RED, soft(polygonDistance(x, y, [[-0.0005, 0.019], [-0.0005, 0.014], [-0.0070, 0.0165]])));
  }
  return colour;
}

function polygonDistance(x: number, y: number, points: readonly InkPoint[]): number {
  let distance = Infinity, inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[j]!, b = points[i]!;
    distance = Math.min(distance, segmentDistance(x, y, a, b));
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? -distance : distance;
}

/** A rounded cloud with no long axis: in a fold a long one read as a dash of rain. */
function colourCloudlet(x: number, y: number, background: Rgb): Rgb {
  if (Math.abs(x) > 0.022 || Math.abs(y) > 0.016) return background;
  const cloud = Math.min(
    Math.hypot(x + 0.0095, (y + 0.0010) * 1.15) - 0.0065,
    Math.hypot(x - 0.0005, (y - 0.0030) * 1.15) - 0.0090,
    Math.hypot(x - 0.0100, (y + 0.0005) * 1.15) - 0.0068,
    Math.max(Math.abs(x) - 0.0130, Math.abs(y + 0.0040) - 0.0032),
  );
  const colour = mixRgb(background, OUTLINE, soft(cloud - 0.0007, 0.001) * 0.6);
  return mixRgb(colour, FOAM, soft(cloud, 0.001));
}

/**
 * A breaking wave as one curl: a swell whose crest hooks over a hollow, with
 * a solid white foam band along its top and lip; no wind streaks or outlines
 * running across neighbouring motifs.
 */
function colourWave(x: number, y: number, background: Rgb): Rgb {
  if (x < -0.026 || x > 0.034 || y < -0.022 || y > 0.020) return background;
  const r = Math.hypot(x, y + 0.004);
  const hollow = Math.hypot(x - 0.0095, y - 0.0005) - 0.0080;
  const swell = Math.max(r - 0.019, -0.017 - y, -hollow);
  const sea = Math.max(Math.abs(y + 0.0155) - 0.0025, x - 0.032, -0.024 - x);
  let colour = mixRgb(background, SEA, soft(Math.min(swell, sea), 0.0009));
  // Foam: the outer band of the curl from its back over the top to the lip.
  const angle = Math.atan2(y + 0.004, x);
  const band = Math.max(Math.abs(r - 0.0165) - 0.0033, -hollow, -y - 0.002, swell);
  colour = mixRgb(colour, FOAM, soft(band, 0.0009) * clamp((angle + 0.2) / 0.3));
  const lip = Math.hypot(x - 0.0145, y - 0.0065) - 0.0030;
  colour = mixRgb(colour, FOAM, soft(lip, 0.0009));
  for (const [fx, fy, fr] of [[0.022, -0.012, 0.0022], [0.028, -0.014, 0.0016], [-0.017, -0.013, 0.0018]] as const) {
    colour = mixRgb(colour, FOAM, soft(Math.hypot(x - fx, y - fy) - fr, 0.0008));
  }
  return colour;
}

/** A print-free patch: motifs whose reach would cross it are left out. */
interface QuietZone {
  readonly halfWidth: number; readonly from: number; readonly to: number;
  /** The zone's centre, metres round the girth from s = 0 (the seam). */
  readonly centre?: number;
  /** No vignette sits below this height: on a sleeve hem one read as a second label. */
  readonly vignettesAbove?: number;
}

function tropicalColour(field: TropicalField, s: number, y: number, quiet?: QuietZone): Rgb {
  // Metres along this row's own girth, between this texel and a placement.
  const around = field.around(y);
  const along = (placed: number): number => (wrap(s - placed / field.length + 0.5) - 0.5) * around;
  // Both sleeves share one field and one zone, so their pages stay identical
  // apart from the mark itself; the mark then sits on plain ground.
  const hushed = (cx: number, cy: number, reach: number): boolean => quiet !== undefined
    && Math.abs((wrap((cx - (quiet.centre ?? 0)) / field.length + 0.5) - 0.5) * around) < quiet.halfWidth + reach
    && cy + reach > quiet.from && cy - reach < quiet.to;
  const col = Math.floor(wrap(s) * field.columns);
  const row = Math.floor(y / TILE_HEIGHT);
  // Where the girth narrows a cell is narrower than its motif; look further.
  const reach = around < field.length * 0.75 ? 2 : 1;
  let colour = BLUE;
  for (let dy = -1; dy <= 1; dy += 1) {
    const rowCells = field.cells[row + dy - field.firstRow];
    if (rowCells === undefined) continue;
    for (let dx = -reach; dx <= reach; dx += 1) {
      const cell = rowCells[wrap(col + dx, field.columns)]!;
      const cloudX = along(cell.cloudX);
      const cloudY = y - cell.cloudY;
      if (Math.abs(cloudX) < 0.050 * cell.cloudScale && Math.abs(cloudY) < 0.040 * cell.cloudScale
        && !hushed(cell.cloudX, cell.cloudY, 0.040 * cell.cloudScale)) {
        const ax = cloudX / cell.cloudScale * cell.mirror, ay = cloudY / cell.cloudScale;
        // Clouds dominate the pale ground, as on the shirt; a minority of
        // clusters break as a wave and the rest are a spray of leaves.
        if (cell.accompaniment === 0) colour = colourCloudlet(ax, ay, colour);
        else if (cell.accompaniment === 1) colour = colourWave(ax, ay, colour);
        else colour = colourLeaves(ax, ay, colour);
      }
      const cloudletX = along(cell.cloudletX);
      const cloudletY = y - cell.cloudletY;
      if (Math.abs(cloudletX) < 0.016 && Math.abs(cloudletY) < 0.012 && !hushed(cell.cloudletX, cell.cloudletY, 0.015)) {
        if (cell.fillerKind === 0) colour = colourCloudlet(cloudletX / 0.50, cloudletY / 0.50, colour);
        else if (cell.fillerKind <= 2) colour = colourFlower(cloudletX / 0.55, cloudletY / 0.55, true, colour);
      }
      const mx = along(cell.x);
      const my = y - cell.y;
      // The vignettes draw a quarter larger so their colours read.
      const size = cell.kind === 3 ? cell.scale * 1.25 : cell.scale;
      if (Math.abs(mx) > 0.042 * size || Math.abs(my) > 0.042 * size) continue;
      if (hushed(cell.x, cell.y, 0.036 * size)) continue;
      if (cell.kind === 3 && quiet?.vignettesAbove !== undefined && cell.y - 0.040 * size < quiet.vignettesAbove) continue;
      const cos = Math.cos(cell.angle), sin = Math.sin(cell.angle);
      const px = (mx * cos + my * sin) / size;
      const py = (-mx * sin + my * cos) / size;
      if (cell.kind === 0) {
        if (cell.flowerLeaves) colour = colourLeaves(px, py, colour);
        colour = colourFlower(px, py, false, colour);
      } else if (cell.kind === 1) colour = colourPalm(cell, px * cell.mirror, py, colour);
      else if (cell.kind === 2) {
        if (cell.flowerLeaves) colour = colourLeaves(px, py, colour);
        colour = colourFlower(px, py, true, colour);
        // The pale flower clusters have a smaller companion, as on the shirt.
        colour = colourFlower((px + 0.020) * 1.6, (py - 0.017) * 1.6, true, colour);
      } else if (cell.kind === 3) colour = colourVignette(cell.variant, px * 0.9, py * 0.9, colour);
      else colour = colourSurf(cell.variant, px, py, colour);
    }
  }
  return colour;
}

// The supplied wordmark: heavy, condensed, steeply forward-slanted capitals,
// tightly set, with a squat short-shouldered M between two tall S ends (it
// reads close to SmLS). The word is about 2.8 times as wide as it is tall and
// the stroke is a quarter of the cap height. These four local paths cannot
// print an unrelated wordmark. Overnight 2026-10-10: the owner had to put his
// eye to the screen to find r5's 1.6 cm word, so the cap is 1.75× that and the
// letters stand 1.8 mm apart (r5 set them touching), a wider M opening its
// counters: legible at a close look, still one word, never a badge. Round 2:
// a 3.0 cm cap made the word 8.7 cm round a ≈ 37 cm sleeve, so at three-quarter
// front its last S turned past the silhouette ("SML"); it is 7.9 cm now and
// sits a little forward of the outer seam (SPONSOR_SHIFT), inside the arc a
// front three-quarter and a side view both see.
const SPONSOR_STROKE = 0.0070, SPONSOR_SLANT = 0.30, SPONSOR_CAP = 0.0280, SPONSOR_GAP = 0.0018;
const SPONSOR_S: readonly InkPoint[] = [[0.94, 0.80], [0.74, 0.98], [0.28, 0.98], [0.06, 0.78], [0.14, 0.56], [0.50, 0.50], [0.86, 0.44], [0.94, 0.22], [0.72, 0.02], [0.26, 0.02], [0.05, 0.20]];
/** Each glyph's width and height as fractions of the cap height. */
const SPONSOR_GLYPHS: readonly { readonly width: number; readonly height: number; readonly points: readonly InkPoint[] }[] = [
  { width: 0.575, height: 1, points: SPONSOR_S },
  { width: 0.74, height: 0.7625, points: [[0.04, 0], [0.04, 1], [0.5, 0.42], [0.96, 1], [0.96, 0]] },
  { width: 0.4375, height: 0.8875, points: [[0.12, 1], [0.12, 0], [0.98, 0]] },
  { width: 0.575, height: 1, points: SPONSOR_S },
];
const SPONSOR_PATHS = SPONSOR_GLYPHS.map((glyph, i) => ({
  x: SPONSOR_GLYPHS.slice(0, i).reduce((at, prior) => at + prior.width * SPONSOR_CAP + SPONSOR_GAP, 0),
  width: glyph.width * SPONSOR_CAP, height: glyph.height * SPONSOR_CAP, points: glyph.points,
}));
const SPONSOR_SPAN = SPONSOR_PATHS.at(-1)!.x + SPONSOR_PATHS.at(-1)!.width + SPONSOR_CAP * SPONSOR_SLANT;
/** The word's baseline above the sleeve hem, clear of the stitched seam at 6 mm. */
const SPONSOR_BASE = 0.019;
/** The word's centre, metres round the sleeve from the outer seam toward its front. */
const SPONSOR_SHIFT = 0.021;

export const WYLDIST_SPONSOR = Object.freeze({ side: 1, width: SPONSOR_SPAN, height: SPONSOR_CAP });

function sponsorDistance(x: number, y: number): number {
  let nearest = Infinity;
  const half = SPONSOR_STROKE / 2;
  for (const glyph of SPONSOR_PATHS) {
    const points = glyph.points;
    const place = (p: InkPoint): InkPoint => {
      const gy = half + p[1] * (glyph.height - SPONSOR_STROKE);
      return [glyph.x + half + p[0] * (glyph.width - SPONSOR_STROKE) + gy * SPONSOR_SLANT - SPONSOR_SPAN / 2, gy];
    };
    for (let i = 1; i < points.length; i += 1) {
      nearest = Math.min(nearest, segmentDistance(x, y, place(points[i - 1]!), place(points[i]!)) - half);
    }
  }
  return nearest;
}

/**
 * The lean chest inside the V, painted rather than modelled: the torso has
 * one or two columns across the opening. A shadow band under each rolled
 * rever, two pectoral masses lit across their upper middle whose lower edges
 * are soft shadows sloping up toward the armpits, a short sternum groove
 * between them only, and clavicles rising from the notch. Overnight
 * 2026-10-10 (owner: "his chest pecs look like abs"): r5's level pec line
 * 6 cm under level clavicle and lit bands stacked four lines across the V
 * over a groove down to its foot, a six-pack. No line here runs level now.
 */
function chestSkin(x: number, y: number, open: number, opening: WyldistSheetLayout['opening']): Rgb {
  const ax = Math.abs(x), neck = opening.to;
  let shade = 1 - 0.26 * clamp(1 - (open - ax) / 0.007);
  // Each pec's lower edge: 6 cm above the V's foot at the sternum, rising 35°
  // outward under the revers. Sharp where the muscle rolls under, fading down
  // the belly, which stays a step darker than the lit masses above it.
  const edge = opening.from + 0.062 + ax * 0.70, below = y - edge;
  shade *= 1 + 0.16 * Math.exp(-(((ax - 0.042) / 0.034) ** 2) - (((y - opening.from - 0.110) / 0.042) ** 2));
  shade *= 1 - 0.30 * Math.exp(-((below / (below > 0 ? 0.004 : 0.013)) ** 2)) * clamp(ax / 0.004 + 0.5);
  shade *= 1 - 0.10 * clamp(-below / 0.025);
  // The two masses turn into a soft valley over the sternum, with a short
  // groove in it: between the pecs only, never down the belly.
  const groove = clamp((y - edge + 0.004) / 0.012) * clamp((neck - 0.035 - y) / 0.025);
  shade *= 1 - (0.10 * Math.exp(-((x / 0.004) ** 2)) + 0.09 * Math.exp(-((x / 0.011) ** 2))) * groove;
  // Clavicles: lit ridges rising steeply outward from the notch, a diagonal
  // pair with a faint hollow under each, never a level bar across the V.
  const clavicle = neck - 0.020 + (ax - 0.016) * 0.45, reach = clamp((ax - 0.016) / 0.010);
  shade *= 1 + (0.08 * Math.exp(-(((y - clavicle - 0.002) / 0.004) ** 2))
    - 0.07 * Math.exp(-(((y - clavicle + 0.007) / 0.006) ** 2))) * reach;
  shade *= 1 - 0.10 * Math.exp(-((x / 0.008) ** 2 + ((y - neck + 0.016) / 0.008) ** 2));
  // Above the notch this is the base of the neck, in the helmet's shade; it
  // darkens gradually toward the neck's tone rather than meeting it on a line.
  shade *= 1 - 0.30 * clamp((y - neck + 0.010) / 0.045);
  return [SKIN[0] * shade, SKIN[1] * shade, SKIN[2] * shade];
}

function paintShirt(sheet: InkSheet, layout: WyldistSheetLayout): void {
  const field = tropicalField(layout.torso, 13);
  const point = new THREE.Vector3();
  const { from } = layout.opening;
  paintCloth(sheet, BOXES.shirt, layout.torso, field.length, (s, y) => {
    if (layout.shirtHem !== undefined && y < layout.shirtHem - 0.0003) return INSIDE;
    loftPoint(layout.torso, s * TAU, vAtHeight(layout.torso, y), point);
    const open = wyldistOpeningHalfWidth(layout, y);
    if (point.z > 0 && Math.abs(point.x) < open) return chestSkin(point.x, y, open, layout.opening);
    let colour = tropicalColour(field, s, y);
    // Painted under-shadows: beside each rolled rever's outer edge, and under
    // the turned-down collar round the neck. They give the cloth layers depth
    // the coarse torso loft cannot model.
    const ax = Math.abs(point.x);
    let shadow = 0;
    if (layout.rever !== undefined && point.z > 0 && y > from) {
      const { corner, reach } = layout.rever, top = layout.opening.to;
      const edge = y < corner
        ? open + (reach - wyldistOpeningHalfWidth(layout, corner)) * (y - from) / (corner - from)
        : reach + (wyldistOpeningHalfWidth(layout, top) - reach) * (y - corner) / (top - corner);
      shadow = Math.max(shadow, clamp(1 - (ax - edge) / 0.011) * (ax > edge - 0.001 ? 1 : 0));
    }
    if (layout.collarBack !== undefined && !(point.z > 0 && ax < (layout.rever?.reach ?? 0) + 0.01)) {
      shadow = Math.max(shadow, clamp(1 - (layout.collarBack - y) / 0.013) * (y < layout.collarBack + 0.001 ? 1 : 0));
    }
    if (shadow > 0) colour = [colour[0] * (1 - 0.45 * shadow), colour[1] * (1 - 0.45 * shadow), colour[2] * (1 - 0.45 * shadow)];
    // The button placket below the V: a calmer, slightly darker band one
    // twelfth of the front, the overlapping left front's edge with its
    // shadow, and four pearl buttons with a dark rim so they never read as
    // one more white flower.
    if (point.z > 0 && y < from + 0.004 && Math.abs(point.x) < 0.020) {
      const x = point.x, half = 0.014;
      // Opaque: a translucent wash turned the hibiscus under it purple.
      const band = soft(Math.abs(x) - half, 0.0010);
      colour = mixRgb(colour, mixRgb(BLUE, SEA, 0.22), band);
      colour = mixRgb(colour, OUTLINE, soft(Math.abs(x - half) - 0.0008, 0.0008) * 0.9);
      colour = mixRgb(colour, OUTLINE, soft(x - half - 0.0008, 0.0030) * soft(half + 0.0045 - x, 0.0030) * 0.35);
      colour = mixRgb(colour, OUTLINE, soft(Math.abs(x + half) - 0.0005, 0.0008) * 0.55);
      const along = from - 0.028 - y, k = Math.round(along / 0.082);
      if (k >= 0 && k <= 3) {
        const by = along - k * 0.082, button = Math.hypot(x - 0.0005, by) - 0.0062;
        colour = mixRgb(colour, OUTLINE, soft(button - 0.0013, 0.0008) * 0.95);
        colour = mixRgb(colour, PEARL, soft(button, 0.0008));
        colour = mixRgb(colour, SAND, soft(Math.hypot(x - 0.0005, by) - 0.0015, 0.0006) * 0.40);
      }
    }
    return colour;
  });
}

function paintSleeve(sheet: InkSheet, layout: WyldistSheetLayout, marked: boolean): void {
  const profile = layout.upperArm;
  const field = tropicalField(profile, 7);
  const hem = layout.sleeveHem ?? profile[0]!.y;
  const quiet: QuietZone = { halfWidth: SPONSOR_SPAN / 2 + 0.002, centre: SPONSOR_SHIFT, from: hem + SPONSOR_BASE - 0.003, to: hem + SPONSOR_BASE + SPONSOR_CAP + 0.004, vignettesAbove: hem + 0.080 };
  paintCloth(sheet, marked ? BOXES.leftSleeve : BOXES.rightSleeve, profile, field.length, (s, y) => {
    // The tucked hem's underside and the turned-up facing inside it.
    if (y < hem - 0.0005) return INSIDE;
    let colour = tropicalColour(field, s, y, quiet);
    // Print, never a badge/backing. It sits on the outer (+X) sleeve face just
    // forward of the seam, and therefore crosses the two edges of this page.
    const x = turnFrom(s, 0) * field.length - SPONSOR_SHIFT;
    const markY = y - hem - SPONSOR_BASE;
    if (marked && Math.abs(x) < SPONSOR_SPAN / 2 + 0.002 && markY >= -0.002 && markY <= SPONSOR_CAP + 0.002) {
      colour = mixRgb(colour, RED, soft(sponsorDistance(-x, markY), 0.0007));
    }
    // One subdued stitched hem; no separate geometry or graphic label.
    const seam = soft(Math.abs(y - hem - 0.006) - 0.0006);
    return mixRgb(colour, SEA, seam * 0.45);
  });
}

// ---- Helmet paint (helmet builder's region, down to `cached`) ----
// r1: every mark is placed in metres on the shell's physical surface, read
// from the same rings and port cut as the mesh: front marks in a front
// projection, rear marks in a rear projection, the temple plate on the side.
// No zig-zags or slashes: the references show vents, a spoiler and a number.
// C4: a signal red leaning slightly warm, lit ≈ (227, 68, 57), hue ≈ 3°: the
// kit's gloves and hibiscus (354–358°) and C2 (≈ 359°) read as the same red,
// where C3's 0xff5846 read coral (≈ 11°) and r1's crimson lost all green under
// ACES. Local helmet ink, like WYLDIST_INKS.
const LID_SIGNAL = inkOver(HELMET_GROUND, linearFromHex(0xff4c44));
/** Lit lower lip of each forehead scoop: the same red catching the sun. */
const LID_LIP = inkOver(HELMET_GROUND, linearFromHex(0xff8070));
const LID_GRILLE = mixRgb(LID_DARK, BADGE, 0.22);
/** Mid-grey screws (no brighter than ≈ 110): not glowing LED eyes. */
const LID_SCREW = mixRgb(LID_DARK, BADGE, 0.25);
// Badge diameter .100: 0.34 of the .29 m shell, so the head-back close-up
// (whose perspective enlarges the rear centre ≈ 15 %) and C2 both read ≈ 0.39.
const BADGE_RADIUS = 0.050, BADGE_HEIGHT = 0.52;
/** Heavy sans "50": cap height .050 (half the badge), stroke .0115 (0.23 of it), pair 1.58× as wide. */
const NUMBER = Object.freeze({ height: 0.050, stroke: 0.0115, width: 0.036, gap: 0.007 });
/** Stroke centrelines in metres from each digit's lower-left; the 5 has a round bowl. */
const FIVE: readonly InkPoint[] = (() => {
  const { width: w, height: h, stroke } = NUMBER, half = stroke / 2;
  const cx = w / 2 + 0.0005, cy = 0.335 * h, rx = w / 2 - half + 0.0005, ry = cy - half;
  const arc = (degrees: number): InkPoint => [cx + rx * Math.cos(degrees * Math.PI / 180),
    cy + ry * Math.sin(degrees * Math.PI / 180)];
  const joint = arc(150);
  return [[w - half, h - half], [joint[0], h - half], joint,
    ...Array.from({ length: 16 }, (_, i) => arc(150 - (290 * (i + 1)) / 16))];
})();
const ZERO: readonly InkPoint[] = Array.from({ length: 25 }, (_, i): InkPoint => {
  const angle = i / 24 * TAU, c = Math.cos(angle), s = Math.sin(angle), half = NUMBER.stroke / 2;
  return [NUMBER.width / 2 + (NUMBER.width / 2 - half) * Math.sign(c) * Math.abs(c) ** 0.8,
    NUMBER.height / 2 + (NUMBER.height / 2 - half) * Math.sign(s) * Math.abs(s) ** 0.8];
});

/** Distance to the "50" about its centre; x reads left to right as seen from behind. */
function numberDistance(x: number, y: number): number {
  const { width, height, gap, stroke } = NUMBER, span = width * 2 + gap;
  return Math.min(pathDistance(x + span / 2, y + height / 2, FIVE, stroke),
    pathDistance(x - span / 2 + width, y + height / 2, ZERO, stroke));
}

// The red gap over the badge is .028 (≈ 0.1 of the shell's height) so chase still shows it.
const SPOILER = Object.freeze({ gap: 0.028, width: 0.026, halfSpan: 0.118, drop: 0.100, ends: 1.42 });
/** Band half-width along the arch: broad down the sides, then one clean taper
 * to a point over its last fifth (no blunt or forked ends, C3 R3-8, C4 N-2). */
export function wyldistSpoilerHalfWidth(t: number): number {
  const e = Math.min(1, Math.abs(t) / SPOILER.ends);
  return (SPOILER.width / 2) * (1 - 0.35 * e ** 4) * Math.min(1, Math.max(0.04, (1 - e) / 0.2));
}
/**
 * The rear spoiler arch, rear-projected (x across, y up): an inverted U of
 * half-width `halfSpan` and depth `drop` whose top clears the badge by a red
 * `gap`, at x = halfSpan·sin t, y = centre + drop·cos t for |t| ≤ ends, ending
 * at about half the shell's height. The helmet mesh builds the proud band.
 */
export function wyldistSpoilerArc(low: number, high: number): typeof SPOILER & { readonly centre: number } {
  return { ...SPOILER, centre: low + (high - low) * BADGE_HEIGHT + BADGE_RADIUS + SPOILER.gap + SPOILER.width / 2 - SPOILER.drop };
}

/** Signed distance (m) to the spoiler arch, rear-projected; negative on it. */
export function wyldistSpoilerDistance(x: number, y: number, low: number, high: number): number {
  const { width, halfSpan, drop, ends, centre } = wyldistSpoilerArc(low, high);
  if (y < centre + drop * Math.cos(ends) - width || Math.abs(x) > halfSpan + width) return Infinity;
  let nearest = Infinity, along = 0;
  let previous: InkPoint = [-halfSpan * Math.sin(ends), centre + drop * Math.cos(ends)];
  for (let i = 1; i <= 24; i += 1) {
    const t = -ends + (2 * ends * i) / 24;
    const point: InkPoint = [halfSpan * Math.sin(t), centre + drop * Math.cos(t)];
    const distance = segmentDistance(x, y, previous, point);
    if (distance < nearest) { nearest = distance; along = t; }
    previous = point;
  }
  return nearest - wyldistSpoilerHalfWidth(along);
}

/**
 * One forehead scoop in a front projection, (|x|, y) above the port's top
 * edge: narrow (0.10 of the shell's width, half as wide as tall), with a
 * near-vertical inner edge and a raked outer edge. The mesh seats a matte
 * insert inside it so the glossy shell cannot flash white there (C4 N-10).
 */
export function wyldistScoopOutline(top: number): InkPoint[] {
  return [[0.054, top + 0.032], [0.084, top + 0.036], [0.074, top + 0.090], [0.058, top + 0.084]];
}

/** The eye port's cut in a front projection: (half-width, height), bottom to top. */
function portOutline(profile: LoftProfile, gaps: readonly number[] | undefined): InkPoint[] {
  const first = gaps?.findIndex((gap) => gap > 0) ?? -1;
  if (gaps === undefined || first < 0) return [];
  const last = gaps.length - 1 - [...gaps].reverse().findIndex((gap) => gap > 0);
  const outline: InkPoint[] = [];
  for (let r = Math.max(0, first - 1); r <= Math.min(profile.length - 1, last + 1); r += 1) {
    const ring = profile[r]!, gap = gaps[r]!;
    outline.push([gap > 0 ? ring.x + ring.halfWidth * Math.sin(gap) ** (2 / ring.square) : 0, ring.y]);
  }
  return outline;
}

function portHalfWidth(outline: readonly InkPoint[], y: number): number {
  for (let i = 1; i < outline.length; i += 1) {
    const a = outline[i - 1]!, b = outline[i]!;
    if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / Math.max(1e-9, b[1] - a[1]);
  }
  return 0;
}

function paintHelmet(sheet: InkSheet, layout: WyldistSheetLayout): void {
  const profile = layout.head, gaps = layout.headOpenings, port = layout.visor;
  const low = profile[0]!.y, high = profile[profile.length - 1]!.y, tall = high - low;
  const badgeY = low + tall * BADGE_HEIGHT;
  const outline = portOutline(profile, gaps);
  const bottom = outline[0]?.[1] ?? port.from, top = outline.at(-1)?.[1] ?? port.to;
  // Temple (visor pivot) plate on the side: 5.6 cm long, joined to the port's
  // trim at its upper corner and running back, with two small grey screws.
  const plateY = top - 0.010, plateRing = ringAtY(profile, plateY);
  const plateEdge = plateRing.z + plateRing.halfDepth * Math.max(0, 1
    - Math.min(1, portHalfWidth(outline, plateY) / plateRing.halfWidth) ** plateRing.square) ** (1 / plateRing.square);
  const scoop = wyldistScoopOutline(top);
  // A dark breath vent about 0.25 of the shell's width below the mouth,
  // growing out of the rim band, with a grey grille; 2 cm of red prow above it.
  const ventLow = low + tall * 0.045 + 0.004, ventHigh = bottom - 0.022;
  const vent: InkPoint[] = [[-0.024, low - 0.010], [0.024, low - 0.010], [0.038, ventHigh], [-0.038, ventHigh]];
  paintWrapped(sheet, BOXES.helmet, profile, (s, y) => {
    const ring = ringAtY(profile, y);
    const v = vAtHeight(profile, y), index = Math.min(profile.length - 2, Math.floor(v));
    const aperture = gaps === undefined ? 0
      : gaps[index]! + (gaps[index + 1]! - gaps[index]!) * (v - index);
    // The mesh's own column: u from the port's left lip round the back.
    const u = Math.PI / 2 + aperture + (TAU - aperture * 2) * s, e = 2 / ring.square;
    const cu = Math.cos(u), su = Math.sin(u);
    const x = ring.x + ring.halfWidth * Math.sign(cu) * Math.abs(cu) ** e;
    const z = ring.z + ring.halfDepth * Math.sign(su) * Math.abs(su) ** e, ax = Math.abs(x);
    // Rim band: 0.12 of the shell's height over the nape, less at the ears and
    // under the chin. The mesh drops the nape and chin and lifts the ears, so
    // its top edge runs nearly level and its bottom dips at the back.
    let dark = cover(y - low - tall * (0.045 + 0.035 * cu * cu + 0.075 * Math.max(0, -su) ** 1.5), 0.001);
    let detail: Rgb | null = null, detailCover = 0;
    // The rear spoiler is the mesh's own matte band alone: painting it too left
    // a stair-stepped, forked second edge beside the band (C4 critic N-2).
    if (z >= 0) {
      // Black trim round the eye port, deepening into a brow over it.
      if (outline.length > 1 && !(y > bottom && y < top && ax < portHalfWidth(outline, y))) {
        let edge = Infinity;
        for (let i = 1; i < outline.length; i += 1) edge = Math.min(edge, segmentDistance(ax, y, outline[i - 1]!, outline[i]!));
        // All black: a grey guard here read as a white grin at play distance (R3-11).
        dark = Math.max(dark, cover(edge - 0.006 - 0.010 * clamp((2 * y - bottom - top) / (top - bottom)), 0.001));
      }
      if (ventHigh > ventLow + 0.01 && y < bottom) {
        const mouth = polygonDistance(x, y, vent);
        dark = Math.max(dark, cover(mouth, 0.001));
        if (mouth < -0.006 && y > ventLow) {
          for (let k = 1; k <= 3; k += 1) {
            const slat = cover(Math.abs(y - ventLow - (ventHigh - ventLow) * k / 4) - 0.0012, 0.0008);
            if (slat > detailCover) { detail = LID_GRILLE; detailCover = slat; }
          }
        }
      }
      // Recessed scoop: black mouth, a dark-grey inner floor, a lit red lip below.
      const opening = polygonDistance(ax, y, scoop);
      dark = Math.max(dark, cover(opening, 0.001));
      const floor = cover(opening + 0.002, 0.001) * cover(y - top - 0.046, 0.002);
      if (floor > detailCover) { detail = LID_GRILLE; detailCover = floor * 0.6; }
      const lip = cover(segmentDistance(ax, y, [0.054, top + 0.029], [0.084, top + 0.033]) - 0.0012, 0.001);
      if (lip > detailCover) { detail = LID_LIP; detailCover = lip; }
      const browVent = Math.max(ax - 0.011, Math.abs(y - top - 0.030) - 0.0065);
      dark = Math.max(dark, cover(browVent, 0.001));
      if (browVent < -0.0015) {
        for (const slit of [-0.005, 0, 0.005]) {
          const cut = cover(Math.abs(x - slit) - 0.0008, 0.0008);
          if (cut > detailCover) { detail = LID_GRILLE; detailCover = cut; }
        }
      }
      if (ax > 0.06) {
        const dz = Math.max(0, Math.abs(z - plateEdge + 0.024) - 0.022), dy = Math.max(0, Math.abs(y - plateY) - 0.006);
        dark = Math.max(dark, cover(Math.hypot(dz, dy) - 0.006, 0.001));
        for (const back of [0.020, 0.040]) {
          const screw = cover(Math.hypot(z - plateEdge + back, y - plateY) - 0.0022, 0.001);
          if (screw > detailCover) { detail = LID_SCREW; detailCover = screw; }
        }
      }
    }
    let colour = mixRgb(LID_SIGNAL, LID_DARK, dark);
    if (z < 0) {
      const circle = Math.hypot(x, y - badgeY) - BADGE_RADIUS;
      colour = mixRgb(colour, BADGE, cover(circle, 0.001));
      // Seen from behind, the rider's left (+x) is screen-left.
      if (circle < 0.002) colour = mixRgb(colour, LID_DARK, cover(numberDistance(-x, y - badgeY), 0.001));
    }
    return detail === null ? colour : mixRgb(colour, detail, detailCover);
  });
}

const cached = new WeakMap<WyldistSheetLayout, Uint8Array>();

/** Pure pixels; each immutable layout is painted once, with no DOM or assets. */
export function wyldistAtlasPixels(layout: WyldistSheetLayout): Uint8Array {
  const prior = cached.get(layout);
  if (prior !== undefined) return prior;
  const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
  paintShirt(sheet, layout);
  paintSleeve(sheet, layout, true);
  paintSleeve(sheet, layout, false);
  paintHelmet(sheet, layout);
  // Auxiliary gasket/vent pieces in the merged custom head deliberately use
  // this neutral corner. The base rim hides it on the shell itself.
  inkRect(sheet, { x0: 0, y0: 768, x1: 16, y1: 784 }, CLEAR);
  inkRect(sheet, BOXES.shirtFlat, BLUE);
  inkRect(sheet, BOXES.redFlat, LID_RED);
  inkRect(sheet, BOXES.blackFlat, LID_DARK);
  const pixels = toSrgbBytes(sheet);
  cached.set(layout, pixels);
  return pixels;
}

/** GPU ownership is per rig; its existing teardown disposes this texture. */
export function createWyldistAtlas(layout: WyldistSheetLayout): THREE.DataTexture {
  const texture = new THREE.DataTexture(wyldistAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.name = 'wyldist-atlas';
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
