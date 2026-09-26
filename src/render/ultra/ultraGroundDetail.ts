/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra ground's own surface — M39 pre-R1 ground pass (`docs/M39_ULTRA.md`
 * §U2 "Pre-R1 ground (G)"), on top of T5/T6 (§4) and T10.
 *
 * Three things live here, all ground-only and all behind an Ultra branch:
 *
 * 1. **`ULTRA_GROUND`** — every construction constant of the pass: an alias
 *    of `ULTRA.ground` in `data/tuning.ts`.
 * 2. **The painted detail maps** — four small tileable RGBA8 textures,
 *    painted once per process from integer hashes (no image asset, no
 *    `Math.random`), with a painted box-filtered mip chain whose detail
 *    contrast rolls off with the level, sampled in world XZ with the
 *    renderer's full anisotropy. Every channel is stored about 127.5 with
 *    its level-0 mean exactly 127.5, so a channel decoded as `2t − 1` is
 *    zero-mean: an albedo multiplier `1 + a·(2t − 1)` preserves each colour
 *    channel's mean, and a slope pair averages to a flat normal.
 * 3. **The ground patch** — GLSL the ground family runs *in addition to* the
 *    shared Ultra patch (`ultraMaterials.ts`): the per-fragment edge field
 *    (smooth band boundaries at any angle, from `ultraEdge`) and the
 *    per-surface detail (`ultraGroundKind`, the fill's `ultraFillKind`).
 *    Installed by `installUltraGroundPatch`, which wraps the material's
 *    shared `onBeforeCompile`; the text depends on the defines alone, so
 *    the ground family's one program key stays honest.
 * 4. **Shade and contact** (Wave 3, R-G; amendments A7 and A9) — the
 *    static-shade lift (`ULTRA_SHADE_LIFT`, `ultraShadeLiftGlsl`, shared with
 *    the block patch) and the rider/cop contact occluders
 *    (`ULTRA_CONTACT_DYNAMIC`, fed per frame by `ultraRuntime.ts` through the
 *    shared `ultraContactPoints`/`ultraContactCount`), both after
 *    `#include <aomap_fragment>`. With `detail.fine` 0 (A10) the fine maps
 *    are not sampled; the turf keeps its broad and mid-scale drifts.
 * 5. **Wave 4 (R-G; A14, A15, A18):** the lift warmed toward the ground
 *    bounce, ramped with view distance and gated by a tall-caster test; the
 *    rider's body pool stretched along the sun and weakened outside static
 *    shade; a drivable edge's rounded knee; the riding-distance turf tufts
 *    (the grass map, the only fine map still built at `fine` 0,
 *    `ultraDetailMapsSampled`); and the contact AO's share of direct light on
 *    non-road ground.
 *
 * **The road gets nothing.** Pavement and rough pavement are kind 0: no
 * slope, no tint, and the normal is not even re-normalised — the road stays
 * the calmest plane in the frame (§7.1 invariant 7). A road cell's *filled*
 * region takes its filling surface's detail, which is what keeps a smooth
 * band boundary from re-drawing the cell grid in texture.
 *
 * Headless-importable: three objects and string edits only, no DOM.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../data/surfaces.ts';
import { CHASE, ULTRA } from '../../data/tuning.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Every constant of the pre-R1 ground pass: `ULTRA.ground` in `data/tuning.ts`
 * (invariant 4 puts every constant that shapes the look there). Migrated from
 * this module's own frozen table by the stabilizer, values unchanged; the
 * name stays so every reader keeps reading `ULTRA_GROUND.edge` / `.detail` /
 * `.smoothNormals`.
 */
export const ULTRA_GROUND = ULTRA.ground;

/**
 * A29 (round 5): the define that compiles the ground filter's screen kernel
 * (A28, Trade 2) into a program — its main() block and PCSS far-caster disk
 * (`ultraMaterials.ts`) and the static-shade lean's four far-map diagonals
 * (`ultraShadeLiftDeclarationsGlsl`). The shared patch adds it to the
 * ground-lying families only while `ULTRA.nearFilter.groundScreenKernel` is
 * true, which A29 set false; a material without it compiles none of that text
 * (U5's ground filter). The kernel's own tests set it on the materials they
 * build. As a define it is also in three's program cache key, so the kernel's
 * programs can never share one with the shipped ones.
 */
export const ULTRA_GROUND_SCREEN_KERNEL = 'ULTRA_GROUND_SCREEN_KERNEL';

/** Whether `material` compiles the ground's screen kernel: it carries `ULTRA_GROUND_SCREEN_KERNEL` (A29). */
export function groundScreenKernelCompiled(material: THREE.Material): boolean {
  return material.defines?.[ULTRA_GROUND_SCREEN_KERNEL] !== undefined;
}

/** A surface's detail kind, as the patch branches on it (`ultraGroundKind`, `ultraFillKind`). */
export const GROUND_DETAIL_KIND = Object.freeze({
  none: 0,
  grass: 1,
  gravel: 2,
  dirt: 3,
  brick: 4,
} as const);

/**
 * The detail kind a ground material takes. **The road is none** — pavement
 * and rough pavement get no new pattern (§7.1 invariant 7) — and so are wood
 * and the spill, which the brief leaves alone.
 */
export function groundDetailKind(material: MaterialId): number {
  switch (material) {
    case 'grass': return GROUND_DETAIL_KIND.grass;
    case 'gravel': return GROUND_DETAIL_KIND.gravel;
    case 'dirt': return GROUND_DETAIL_KIND.dirt;
    case 'brick': return GROUND_DETAIL_KIND.brick;
    default: return GROUND_DETAIL_KIND.none;
  }
}

/** The ground patch's vertex attributes (the heightfield's, under `ULTRA_EDGE`). */
export const ULTRA_GROUND_EDGE_ATTRIBUTES = Object.freeze({
  /** vec2, half floats: the signed distance to up to two fill lines, in cells (positive = filled). */
  edge: 'ultraEdge',
  /** vec3, half floats: the linear multiplier that turns this cell's colour into its fill source's. */
  fillTint: 'ultraFillTint',
  /** float, Uint8 not normalized: the filling surface's detail kind. */
  fillKind: 'ultraFillKind',
} as const);

/**
 * The fill cap in cells for a heightfield spacing: `capCells`, and never more
 * than `capMetres` of ground.
 */
export function edgeCapCells(spacing: number): number {
  const { capCells, capMetres } = ULTRA_GROUND.edge;
  return spacing > 0 ? Math.min(capCells, capMetres / spacing) : capCells;
}

// ---------------------------------------------------------------------------
// Deterministic integer hashing
// ---------------------------------------------------------------------------

/** Salts of this file (props use 3–31; these are the ground's own). */
const SALT = Object.freeze({
  bladeFirst: 37,
  clump: 41,
  pebble: 43,
  grit: 47,
  broadLuma: 53,
  broadHue: 59,
  broadWear: 61,
  soil: 67,
  soilStone: 71,
});

/** A 32-bit integer hash of two integers and a salt (murmur3 finaliser). */
function hash32(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hash in [0, 1). */
function unit(a: number, b: number, salt: number): number {
  return hash32(a, b, salt) / 4294967296;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/**
 * Periodic value noise at one lattice resolution: `cells` lattice cells
 * across a `size` map, smoothstep-interpolated, in [0, 1].
 */
function valueNoise(size: number, cells: number, salt: number, out: Float32Array, amplitude: number): void {
  const scale = cells / size;
  for (let y = 0; y < size; y += 1) {
    const fy = y * scale;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const y0 = iy % cells;
    const y1 = (iy + 1) % cells;
    for (let x = 0; x < size; x += 1) {
      const fx = x * scale;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells;
      const x1 = (ix + 1) % cells;
      const a = unit(x0, y0, salt);
      const b = unit(x1, y0, salt);
      const c = unit(x0, y1, salt);
      const d = unit(x1, y1, salt);
      const top = a + (b - a) * sx;
      const bottom = c + (d - c) * sx;
      out[y * size + x] += amplitude * (top + (bottom - top) * sy);
    }
  }
}

/** Three octaves of periodic value noise from `cells` up. */
function fbm(size: number, cells: number, salt: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let lattice = cells;
  for (let octave = 0; octave < 3 && lattice <= size / 2; octave += 1) {
    valueNoise(size, lattice, salt + octave * 101, out, amplitude);
    amplitude *= 0.5;
    lattice *= 2;
  }
  return out;
}

/** Central-difference slopes of a periodic height map, in texel units. */
function slopesOf(size: number, height: Float32Array): { x: Float32Array; y: Float32Array } {
  const mask = size - 1;
  const sx = new Float32Array(size * size);
  const sy = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      sx[i] = (height[y * size + ((x + 1) & mask)] - height[y * size + ((x - 1) & mask)]) / 2;
      sy[i] = (height[((y + 1) & mask) * size + x] - height[((y - 1) & mask) * size + x]) / 2;
    }
  }
  return { x: sx, y: sy };
}

/**
 * Write one channel of an RGBA8 level so its bytes average **exactly**
 * 127.5: centred on its own mean, scaled so its standard deviation decodes
 * to `1 / spread` (clipped at the byte range), then nudged by whole units
 * until the sum is 127.5 × texels. A `2t − 1` decode is then zero-mean.
 */
function encodeChannel(values: Float32Array, out: Uint8Array, channel: number, spread: number): void {
  const count = values.length;
  let mean = 0;
  for (let i = 0; i < count; i += 1) mean += values[i];
  mean /= count;
  let variance = 0;
  for (let i = 0; i < count; i += 1) variance += (values[i] - mean) ** 2;
  const sigma = Math.sqrt(variance / count);
  const gain = sigma > 1e-12 ? 127.5 / (spread * sigma) : 0;
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const byte = Math.min(255, Math.max(0, Math.round(127.5 + (values[i] - mean) * gain)));
    out[i * 4 + channel] = byte;
    sum += byte;
  }
  settleChannel(out, channel, count, sum);
}

/**
 * Nudge a channel's bytes by ±1, in a fixed stride order, until they sum to
 * 127.5 × texels (an integer for every level but the 1 × 1 one, which is
 * left at the nearest). Deterministic, and never past the byte range.
 */
function settleChannel(out: Uint8Array, channel: number, count: number, sum: number): void {
  const target = 127.5 * count;
  if (!Number.isInteger(target)) return;
  let diff = target - sum;
  const stride = 7919;
  let index = 0;
  let guard = 0;
  while (diff !== 0 && guard < count * 4) {
    const at = index * 4 + channel;
    const byte = out[at];
    if (diff > 0 && byte < 255) {
      out[at] = byte + 1;
      diff -= 1;
    } else if (diff < 0 && byte > 0) {
      out[at] = byte - 1;
      diff += 1;
    }
    index = (index + stride) % count;
    guard += 1;
  }
}

/**
 * The painted mip chain of an RGBA8 map: each level the 2 × 2 box mean of the
 * one above, its deviation from 127.5 scaled by `rolloff[level]` (the last
 * entry repeating), each channel re-settled to its exact mean.
 */
function mipChain(base: Uint8Array, size: number, rolloff: readonly number[]): Uint8Array[] {
  const chain: Uint8Array[] = [base];
  let above = base;
  let edge = size;
  let level = 0;
  // The running mean before rounding, so each level's contrast is taken
  // from the box filter and never compounds the byte rounding.
  let exact = Float32Array.from(base);
  while (edge > 1) {
    const next = edge >> 1;
    level += 1;
    const gainAbove = rolloff[Math.min(level - 1, rolloff.length - 1)];
    const gain = rolloff[Math.min(level, rolloff.length - 1)];
    const ratio = gainAbove > 1e-9 ? gain / gainAbove : 0;
    const exactNext = new Float32Array(next * next * 4);
    const bytes = new Uint8Array(next * next * 4);
    const sums = [0, 0, 0, 0];
    for (let y = 0; y < next; y += 1) {
      for (let x = 0; x < next; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          const a = exact[((2 * y) * edge + 2 * x) * 4 + channel];
          const b = exact[((2 * y) * edge + 2 * x + 1) * 4 + channel];
          const c = exact[((2 * y + 1) * edge + 2 * x) * 4 + channel];
          const d = exact[((2 * y + 1) * edge + 2 * x + 1) * 4 + channel];
          const mean = (a + b + c + d) / 4;
          const value = 127.5 + (mean - 127.5) * ratio;
          exactNext[(y * next + x) * 4 + channel] = value;
          const byte = Math.min(255, Math.max(0, Math.round(value)));
          bytes[(y * next + x) * 4 + channel] = byte;
          sums[channel] += byte;
        }
      }
    }
    for (let channel = 0; channel < 4; channel += 1) settleChannel(bytes, channel, next * next, sums[channel]);
    chain.push(bytes);
    above = bytes;
    exact = exactNext;
    edge = next;
  }
  void above;
  return chain;
}

/**
 * The grass map: R, G the slopes of a blade field (short tapered strokes in
 * every direction, taller and denser inside clumps), B a blade tone (tips
 * lighter, each blade its own shade), A the clump field itself.
 */
export function paintGrassDetail(size: number = ULTRA_GROUND.detail.grassSize): Uint8Array[] {
  const config = ULTRA_GROUND.detail;
  const mask = size - 1;
  const texels = size * size;
  const clump = fbm(size, config.grassClumpCells, SALT.clump);
  let clumpMin = Infinity;
  let clumpMax = -Infinity;
  for (const value of clump) {
    if (value < clumpMin) clumpMin = value;
    if (value > clumpMax) clumpMax = value;
  }
  const clumpSpan = Math.max(1e-9, clumpMax - clumpMin);

  const height = new Float32Array(texels);
  const toneSum = new Float32Array(texels);
  const toneWeight = new Float32Array(texels);
  const blades = Math.round(texels * config.grassBlades);
  const [lengthMin, lengthMax] = config.bladeLength;
  const width = config.bladeWidth;
  for (let blade = 0; blade < blades; blade += 1) {
    const salt = SALT.bladeFirst;
    const cx = unit(blade, 1, salt) * size;
    const cy = unit(blade, 2, salt) * size;
    const angle = unit(blade, 3, salt) * Math.PI;
    const length = lengthMin + unit(blade, 4, salt) * (lengthMax - lengthMin);
    const inClump = (clump[(Math.floor(cy) & mask) * size + (Math.floor(cx) & mask)] - clumpMin) / clumpSpan;
    const amplitude = (0.35 + 0.65 * unit(blade, 5, salt)) * (0.4 + 0.6 * inClump);
    const tone = unit(blade, 6, salt) * 2 - 1;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const half = length / 2;
    const reach = Math.ceil(half + width * 2);
    const x0 = Math.floor(cx) - reach;
    const y0 = Math.floor(cy) - reach;
    for (let y = y0; y <= y0 + 2 * reach; y += 1) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x0 + 2 * reach; x += 1) {
        const dx = x + 0.5 - cx;
        const along = dx * ca + dy * sa;
        if (along > half || along < -half) continue;
        const across = (-dx * sa + dy * ca) / width;
        if (across > 2 || across < -2) continue;
        const taper = 1 - (along / half) ** 2;
        const profile = 1 - (across * across) / 4;
        const weight = taper * profile * profile;
        if (weight <= 0) continue;
        const at = (y & mask) * size + (x & mask);
        // Tips lighter: the stroke leans, so its far half stands taller.
        const rise = 0.75 + 0.25 * (along / half);
        height[at] += amplitude * weight * rise;
        toneSum[at] += tone * weight;
        toneWeight[at] += weight;
      }
    }
  }
  const slopes = slopesOf(size, height);
  let heightMean = 0;
  for (const value of height) heightMean += value;
  heightMean /= texels;
  let heightSigma = 0;
  for (const value of height) heightSigma += (value - heightMean) ** 2;
  heightSigma = Math.sqrt(heightSigma / texels) || 1;
  const tone = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) {
    const own = toneWeight[i] > 0 ? (toneSum[i] / toneWeight[i]) * Math.min(1, toneWeight[i]) : 0;
    tone[i] = 0.6 * ((height[i] - heightMean) / heightSigma) + 0.4 * own;
  }
  const base = new Uint8Array(texels * 4);
  encodeChannel(slopes.x, base, 0, config.encodeSpread);
  encodeChannel(slopes.y, base, 1, config.encodeSpread);
  encodeChannel(tone, base, 2, config.encodeSpread);
  encodeChannel(clump, base, 3, config.encodeSpread);
  return mipChain(base, size, config.fineRolloff);
}

/**
 * The stone map: R, G the slopes of a pebble field (a dome per jittered
 * lattice cell, the tallest winning where they touch), B a pebble tone
 * (each pebble its own shade, the crevices between them darker), A a fine
 * grit (painted, unused since the brick grit was cut; kept flat-mean).
 */
export function paintStoneDetail(size: number = ULTRA_GROUND.detail.stoneSize): Uint8Array[] {
  const config = ULTRA_GROUND.detail;
  const cells = config.stoneCells;
  const cell = size / cells;
  const texels = size * size;
  const [radiusMin, radiusMax] = config.pebbleRadius;
  // One pebble per lattice cell: centre, radius, height and tone.
  const pebbles = new Float32Array(cells * cells * 5);
  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const i = (gy * cells + gx) * 5;
      pebbles[i] = (gx + 0.2 + 0.6 * unit(gx, gy, SALT.pebble)) * cell;
      pebbles[i + 1] = (gy + 0.2 + 0.6 * unit(gx, gy, SALT.pebble + 1)) * cell;
      pebbles[i + 2] = (radiusMin + (radiusMax - radiusMin) * unit(gx, gy, SALT.pebble + 2)) * cell;
      pebbles[i + 3] = 0.6 + 0.4 * unit(gx, gy, SALT.pebble + 3);
      pebbles[i + 4] = unit(gx, gy, SALT.pebble + 4) * 2 - 1;
    }
  }
  const height = new Float32Array(texels);
  const tone = new Float32Array(texels);
  for (let y = 0; y < size; y += 1) {
    const py = y + 0.5;
    const gy = Math.floor(py / cell);
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const gx = Math.floor(px / cell);
      let best = 0;
      let bestTone = -1;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = gx + ox;
          const ny = gy + oy;
          const wx = ((nx % cells) + cells) % cells;
          const wy = ((ny % cells) + cells) % cells;
          const i = (wy * cells + wx) * 5;
          // The pebble's centre in this tile's copy of its lattice cell.
          const dx = px - (pebbles[i] + (nx - wx) * cell);
          const dy = py - (pebbles[i + 1] + (ny - wy) * cell);
          const r = pebbles[i + 2];
          const d2 = (dx * dx + dy * dy) / (r * r);
          if (d2 >= 1) continue;
          const dome = pebbles[i + 3] * r * Math.sqrt(1 - d2);
          if (dome > best) {
            best = dome;
            bestTone = pebbles[i + 4];
          }
        }
      }
      const at = y * size + x;
      height[at] = best;
      tone[at] = best > 0 ? 0.7 * bestTone + 0.3 * Math.min(1, best / (0.5 * cell)) : -1.2;
    }
  }
  const slopes = slopesOf(size, height);
  // Grit: per-texel hash, softened over 3 × 3 so it is grain, not static.
  const raw = new Float32Array(texels);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) raw[y * size + x] = unit(x, y, SALT.grit);
  const grit = new Float32Array(texels);
  const mask = size - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) sum += raw[((y + oy) & mask) * size + ((x + ox) & mask)];
      grit[y * size + x] = sum / 9;
    }
  }
  const base = new Uint8Array(texels * 4);
  encodeChannel(slopes.x, base, 0, config.encodeSpread);
  encodeChannel(slopes.y, base, 1, config.encodeSpread);
  encodeChannel(tone, base, 2, config.encodeSpread);
  encodeChannel(grit, base, 3, config.encodeSpread);
  return mipChain(base, size, config.fineRolloff);
}

/**
 * The soil map (packed trail dirt, relief only): R, G the slopes of a
 * five-octave value-noise undulation with small stones pressed into it — an
 * irregular ground, not a cobbled one — B the stones' mask as a tone, A flat.
 */
export function paintSoilDetail(size: number = ULTRA_GROUND.detail.soilSize): Uint8Array[] {
  const config = ULTRA_GROUND.detail;
  const texels = size * size;
  const mask = size - 1;
  const height = new Float32Array(texels);
  let amplitude = 1;
  for (let cells = config.soilCells, octave = 0; octave < 5 && cells <= size / 2; octave += 1, cells *= 2) {
    valueNoise(size, cells, SALT.soil + octave * 101, height, amplitude);
    amplitude *= 0.5;
  }
  const stone = new Float32Array(texels);
  const stones = Math.round(texels * config.soilStones);
  const [radiusMin, radiusMax] = config.soilStoneRadius;
  for (let index = 0; index < stones; index += 1) {
    const cx = unit(index, 1, SALT.soilStone) * size;
    const cy = unit(index, 2, SALT.soilStone) * size;
    const r = radiusMin + (radiusMax - radiusMin) * unit(index, 3, SALT.soilStone);
    const lift = 0.1 * (0.5 + 0.5 * unit(index, 4, SALT.soilStone));
    const reach = Math.ceil(r);
    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y += 1) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x += 1) {
        const d2 = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (r * r);
        if (d2 >= 1) continue;
        const at = (y & mask) * size + (x & mask);
        const dome = lift * Math.sqrt(1 - d2) * (r / radiusMax);
        if (dome > stone[at]) stone[at] = dome;
      }
    }
  }
  for (let i = 0; i < texels; i += 1) height[i] += stone[i];
  const slopes = slopesOf(size, height);
  const base = new Uint8Array(texels * 4);
  encodeChannel(slopes.x, base, 0, config.encodeSpread);
  encodeChannel(slopes.y, base, 1, config.encodeSpread);
  encodeChannel(stone, base, 2, config.encodeSpread);
  for (let i = 0; i < texels; i += 1) base[i * 4 + 3] = i % 2 === 0 ? 127 : 128;
  return mipChain(base, size, config.fineRolloff);
}

/**
 * The broad map: three independent smooth noise channels — R the
 * low-frequency luminance, G the hue axis, B the brick wear — and A flat.
 * No contrast roll-off: these are metre-scale and wanted at every distance;
 * the box-filtered chain alone takes them to their mean at the horizon.
 */
export function paintBroadDetail(size: number = ULTRA_GROUND.detail.broadSize): Uint8Array[] {
  const config = ULTRA_GROUND.detail;
  const texels = size * size;
  const [lumaCells, hueCells, wearCells] = config.broadCells;
  const base = new Uint8Array(texels * 4);
  encodeChannel(fbm(size, lumaCells, SALT.broadLuma), base, 0, config.encodeSpread);
  encodeChannel(fbm(size, hueCells, SALT.broadHue), base, 1, config.encodeSpread);
  encodeChannel(fbm(size, wearCells, SALT.broadWear), base, 2, config.encodeSpread);
  for (let i = 0; i < texels; i += 1) base[i * 4 + 3] = i % 2 === 0 ? 127 : 128;
  return mipChain(base, size, [1]);
}

/** Painted chains, once per process: pure data, uploaded per view. */
interface PaintedGroundDetail {
  readonly grass: Uint8Array[];
  readonly stone: Uint8Array[];
  readonly soil: Uint8Array[];
  readonly broad: Uint8Array[];
}
let painted: PaintedGroundDetail | null = null;

/** The four painted chains (cached; never write to them). */
export function paintedGroundDetail(): PaintedGroundDetail {
  if (painted === null) {
    painted = Object.freeze({
      grass: paintGrassDetail(),
      stone: paintStoneDetail(),
      soil: paintSoilDetail(),
      broad: paintBroadDetail(),
    });
  }
  return painted;
}

// ---------------------------------------------------------------------------
// The GPU objects
// ---------------------------------------------------------------------------

/**
 * Which of the four painted maps the shipped ground GLSL samples (Wave 4,
 * R-G; gauntlet round 2 item 0). The broad map always (the low-frequency
 * luma and hue, the turf's drifts and the brick wear); each fine map only
 * while a term that reads it is compiled in — with `detail.fine` 0 (A10) none
 * is, and a map nothing samples is neither painted into a texture nor charged
 * (`ultraCost.ts`'s `ground-detail` line reads this same answer). At fine 0
 * that returns the three 512² maps, 4,194,300 B, to the envelope.
 */
export function ultraDetailMapsSampled(detail: typeof ULTRA_GROUND.detail = ULTRA_GROUND.detail): {
  readonly grass: boolean;
  readonly stone: boolean;
  readonly soil: boolean;
  readonly broad: true;
} {
  const fine = detail.fine > 0;
  const ride = detail.grass.rideBlade > 0 || detail.grass.rideClump > 0;
  return {
    grass: fine || ride,
    stone: fine,
    soil: fine,
    broad: true,
  };
}

/** One Ultra terrain view's ground detail maps. The view owns and disposes them. */
export interface UltraGroundDetail {
  /** Null when nothing samples it (`ultraDetailMapsSampled`). */
  readonly grass: THREE.DataTexture | null;
  readonly stone: THREE.DataTexture | null;
  readonly soil: THREE.DataTexture | null;
  readonly broad: THREE.DataTexture;
  /** What the Ultra ledger charges: every painted level of each map the view holds. */
  readonly bytes: number;
  readonly textures: number;
  dispose(): void;
}

function repeatTexture(chain: readonly Uint8Array[], name: string, anisotropy: number): THREE.DataTexture {
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.max(1, anisotropy);
  // Data, not colour.
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
 * One view's detail maps at the renderer's full anisotropy (the brief's "max
 * anisotropy": the ground is the most grazing surface in the frame).
 */
export function createUltraGroundDetail(maxAnisotropy: number): UltraGroundDetail {
  const chains = paintedGroundDetail();
  const sampled = ultraDetailMapsSampled();
  const grass = sampled.grass ? repeatTexture(chains.grass, 'ultra-ground-grass', maxAnisotropy) : null;
  const stone = sampled.stone ? repeatTexture(chains.stone, 'ultra-ground-stone', maxAnisotropy) : null;
  const soil = sampled.soil ? repeatTexture(chains.soil, 'ultra-ground-soil', maxAnisotropy) : null;
  const broad = repeatTexture(chains.broad, 'ultra-ground-broad', maxAnisotropy);
  const held = [grass, stone, soil, broad].filter((texture): texture is THREE.DataTexture => texture !== null);
  return {
    grass,
    stone,
    soil,
    broad,
    bytes: (grass === null ? 0 : chainBytes(chains.grass))
      + (stone === null ? 0 : chainBytes(chains.stone))
      + (soil === null ? 0 : chainBytes(chains.soil))
      + chainBytes(chains.broad),
    textures: held.length,
    dispose(): void {
      for (const texture of held) texture.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/** A GLSL float literal. */
function f(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`not a GLSL float: ${value}`);
  const text = String(Math.round(value * 1e7) / 1e7);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
}

/** A sample frame as GLSL: vec3(cos, sin, 1 / period). */
function frame(spec: { readonly period: number; readonly angle: number }): string {
  return `vec3( ${f(Math.cos(spec.angle))}, ${f(Math.sin(spec.angle))}, ${f(1 / spec.period)} )`;
}

/**
 * A decoded channel's standard deviation is `1 / encodeSpread`; the mean of
 * two independent samples, `1 / (spread·√2)`. These turn a target σ into
 * the multiplier on a two-sample mean (`pair`) or on one sample (`single`).
 */
function pair(sigma: number): string {
  return f(sigma * ULTRA_GROUND.detail.encodeSpread * Math.SQRT2);
}
function single(sigma: number): string {
  return f(sigma * ULTRA_GROUND.detail.encodeSpread);
}

/** The anchors this patch needs, in the program text *after* the shared patch has run. */
export const ULTRA_GROUND_ANCHORS = Object.freeze({
  vertexCommon: '#include <common>',
  vertexProject: '#include <project_vertex>',
  fragmentDeclarations: '#include <dithering_pars_fragment>',
  fragmentColour: '#include <color_fragment>',
  fragmentNormal: '#include <normal_fragment_maps>',
  /** Where the light is final but not yet summed (after the shared patch's own AO): the shade lift and the dynamic contact. */
  fragmentLight: '#include <aomap_fragment>',
} as const);

const VERTEX_DECLARATIONS = /* glsl */ `
// ---- M39 Ultra ground (render/ultra/ultraGroundDetail.ts) ----
#ifdef ULTRA_EDGE
	attribute vec2 ultraEdge;
	attribute vec3 ultraFillTint;
	attribute float ultraFillKind;
	varying vec2 vUltraEdge;
	varying vec3 vUltraFillTint;
	varying float vUltraFillKind;
#endif
`;

const VERTEX_ASSIGNMENTS = /* glsl */ `
#ifdef ULTRA_EDGE
	vUltraEdge = ultraEdge;
	vUltraFillTint = ultraFillTint;
	vUltraFillKind = ultraFillKind;
#endif
`;

/** I2: the forward-difference step of the undulation, in texels of the broad map. */
const UNDULATION_STEP_TEXELS = 2;
let undulationScaleMemo: number | null = null;

/**
 * I2 (Fable; final wave, P-GR): the multiplier that turns a forward difference
 * of the broad map's luma byte (as a [0, 1] sample, `UNDULATION_STEP_TEXELS`
 * apart) into a world slope whose standard deviation is
 * `detail.undulation.slope` — measured once on the painted level 0, both axes,
 * so the amplitude is the tuning value whatever the painter's spread.
 */
export function undulationScale(): number {
  if (undulationScaleMemo !== null) return undulationScaleMemo;
  const size = ULTRA_GROUND.detail.broadSize;
  const base = paintBroadDetail(size)[0];
  const step = UNDULATION_STEP_TEXELS;
  let sum = 0;
  let squares = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const here = base[(y * size + x) * 4];
      const alongX = (base[(y * size + ((x + step) % size)) * 4] - here) / 255;
      const alongY = (base[(((y + step) % size) * size + x) * 4] - here) / 255;
      sum += alongX + alongY;
      squares += alongX * alongX + alongY * alongY;
      count += 2;
    }
  }
  const sigma = Math.sqrt(Math.max(squares / count - (sum / count) ** 2, 0));
  undulationScaleMemo = sigma > 0 ? ULTRA_GROUND.detail.undulation.slope / sigma : 0;
  return undulationScaleMemo;
}

/**
 * I2 (Fable; final wave, P-GR): the metre-scale undulation of turf and gravel
 * as GLSL — the broad map's luma channel read as a height at
 * `frames.undulation`, its slope by two forward differences, faded out by
 * view distance and pixel footprint (`detail.undulation`). Added to the
 * surface's slope (the normal tilt); the road, the trail's dirt, wood and the
 * spill never call it. Nothing at a slope of 0.
 */
function undulationGlsl(): string {
  const d = ULTRA_GROUND.detail;
  const u = d.undulation;
  if (!(u.slope > 0)) return '';
  const step = (d.frames.undulation.period * UNDULATION_STEP_TEXELS) / d.broadSize;
  return /* glsl */ `
	// I2 (final wave, P-GR): the metre-scale undulation of turf and gravel.
	vec2 ultraUndulation( const in vec2 ultraP, const in vec2 ultraDpdx, const in vec2 ultraDpdy, const in float ultraFootprint ) {
		float ultraFadeU = ( 1.0 - smoothstep( ${f(u.fadeMetres[0])}, ${f(u.fadeMetres[1])}, length( vViewPosition ) ) )
			* ( 1.0 - smoothstep( ${f(u.fadeFootprint[0])}, ${f(u.fadeFootprint[1])}, ultraFootprint ) );
		if ( ultraFadeU <= 0.0 ) return vec2( 0.0 );
		float ultraH = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(d.frames.undulation)} ).r;
		float ultraHx = ultraDetailSample( ultraDetailBroad, ultraP + vec2( ${f(step)}, 0.0 ), ultraDpdx, ultraDpdy, ${frame(d.frames.undulation)} ).r;
		float ultraHz = ultraDetailSample( ultraDetailBroad, ultraP + vec2( 0.0, ${f(step)} ), ultraDpdx, ultraDpdy, ${frame(d.frames.undulation)} ).r;
		return ( ultraFadeU * ${f(undulationScale())} ) * vec2( ultraHx - ultraH, ultraHz - ultraH );
	}`;
}

/** The call that adds the undulation to a surface branch's slope (empty at a slope of 0). */
function undulationCall(): string {
  return ULTRA_GROUND.detail.undulation.slope > 0
    ? `
			ultraSlope += ultraUndulation( ultraP, ultraDpdx, ultraDpdy, ultraFootprint );`
    : '';
}

/**
 * The turf's mid-scale drifts (Wave 3, R-G; round-1 item 12): one sample of
 * the broad map at `frames.broadMid` (13 m), its luma and hue channels, so a
 * lawn breaks into lusher and drier patches a few metres across at riding
 * distance — faded in by pixel footprint (`grass.midFade`), so not under the
 * wheel, where streaming ground would read as shimmer. Zero-mean like every other term; grass (and the grass field)
 * only — the road stays kind 0.
 */
function grassMidGlsl(): string {
  const d = ULTRA_GROUND.detail;
  return /* glsl */ `
			vec4 ultraMid = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(d.frames.broadMid)} );
			float ultraMidFade = smoothstep( ${f(d.grass.midFade[0])}, ${f(d.grass.midFade[1])}, ultraFootprint );
			ultraTint += ultraMidFade * ( ${single(d.grass.midLuma)} * ( ultraMid.r * 2.0 - 1.0 )
				+ vec3( ${single(d.grass.midHue[0])}, ${single(d.grass.midHue[1])}, ${single(d.grass.midHue[2])} ) * ( ultraMid.g * 2.0 - 1.0 ) );`;
}

/**
 * The turf's tufts at riding distance (Wave 4, R-G; round-2 item 10): the
 * grass map's blade tone (B) and clump field (A), two samples at
 * incommensurate frames, albedo only — faded in by pixel footprint
 * (`grass.rideFade`), so none of it streams under the wheel, and out at
 * distance by the map's painted roll-off. Zero-mean like every other term.
 */
function grassRideGlsl(): string {
  const g = ULTRA_GROUND.detail.grass;
  if (!(g.rideBlade > 0 || g.rideClump > 0)) return '';
  const fr = ULTRA_GROUND.detail.frames;
  return /* glsl */ `
			float ultraRide = smoothstep( ${f(g.rideFade[0])}, ${f(g.rideFade[1])}, ultraFootprint );
			vec4 ultraRideA = ultraDetailSample( ultraDetailGrass, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.grassA)} );
			vec4 ultraRideB = ultraDetailSample( ultraDetailGrass, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.grassB)} );
			ultraTint += ultraRide * ( ${pair(g.rideBlade)} * ( ( ultraRideA.b + ultraRideB.b ) - 1.0 )
				+ ${pair(g.rideClump)} * ( ( ultraRideA.a + ultraRideB.a ) - 1.0 ) );`;
}

/**
 * The grass branch of `ultraGroundDetail`. With `detail.fine` 0 (A10) the
 * fine maps are not sampled at all — only the broad map's low-frequency luma
 * and hue — so the shipped program carries no dead texture fetches.
 */
function grassDetailGlsl(): string {
  const d = ULTRA_GROUND.detail;
  const fr = d.frames;
  if (d.fine <= 0) {
    return /* glsl */ `
			vec4 ultraLowA = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadA)} );
			vec4 ultraLowB = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadB)} );
			float ultraLuma = ( ultraLowA.r + ultraLowB.r ) - 1.0;
			float ultraHue = ( ultraLowA.g + ultraLowB.g ) - 1.0;
			ultraTint += ${pair(d.grass.lowLuma)} * ultraLuma
				+ vec3( ${pair(d.grass.hue[0])}, ${pair(d.grass.hue[1])}, ${pair(d.grass.hue[2])} ) * ultraHue;${grassMidGlsl()}${grassRideGlsl()}${undulationCall()}
			return ultraTint;`;
  }
  return /* glsl */ `
			float ultraFine = 1.0 - smoothstep( ${f(d.grass.fade[0])}, ${f(d.grass.fade[1])}, ultraFootprint );
			float ultraClumpFade = 1.0 - smoothstep( ${f(d.grass.clumpFade[0])}, ${f(d.grass.clumpFade[1])}, ultraFootprint );
			vec4 ultraA = ultraDetailSample( ultraDetailGrass, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.grassA)} );
			vec4 ultraB = ultraDetailSample( ultraDetailGrass, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.grassB)} );
			vec4 ultraLowA = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadA)} );
			vec4 ultraLowB = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadB)} );
			ultraSlope = ${pair(d.grass.slope * d.fine)} * 0.5 * ultraFine
				* ( ultraDetailSlopeOf( ultraA.rg, ${frame(fr.grassA)} ) + ultraDetailSlopeOf( ultraB.rg, ${frame(fr.grassB)} ) );
			float ultraBlade = ( ultraA.b + ultraB.b ) - 1.0;
			float ultraClump = ( ultraA.a + ultraB.a ) - 1.0;
			float ultraLuma = ( ultraLowA.r + ultraLowB.r ) - 1.0;
			float ultraHue = ( ultraLowA.g + ultraLowB.g ) - 1.0;
			ultraTint += ${pair(d.grass.lowLuma)} * ultraLuma
				+ vec3( ${pair(d.grass.hue[0])}, ${pair(d.grass.hue[1])}, ${pair(d.grass.hue[2])} ) * ultraHue
				+ ${pair(d.grass.blade * d.fine)} * ultraFine * ultraBlade
				+ ${pair(d.grass.clump * d.fine)} * ultraClumpFade * ultraClump;${grassMidGlsl()}${undulationCall()}
			return ultraTint;`;
}

/** The gravel branch: the pebbles only while `detail.fine` > 0, the low-frequency luma always. */
function gravelDetailGlsl(): string {
  const d = ULTRA_GROUND.detail;
  const fr = d.frames;
  if (d.fine <= 0) {
    return /* glsl */ `
			vec4 ultraLowA = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadA)} );
			ultraTint += ${single(d.gravel.lowLuma)} * ( ultraLowA.r * 2.0 - 1.0 );${undulationCall()}
			return ultraTint;`;
  }
  return /* glsl */ `
			float ultraFine = 1.0 - smoothstep( ${f(d.gravel.fade[0])}, ${f(d.gravel.fade[1])}, ultraFootprint );
			vec4 ultraA = ultraDetailSample( ultraDetailStone, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.gravelA)} );
			vec4 ultraB = ultraDetailSample( ultraDetailStone, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.gravelB)} );
			vec4 ultraLowA = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.broadA)} );
			ultraSlope = ${pair(d.gravel.slope * d.fine)} * 0.5 * ultraFine
				* ( ultraDetailSlopeOf( ultraA.rg, ${frame(fr.gravelA)} ) + ultraDetailSlopeOf( ultraB.rg, ${frame(fr.gravelB)} ) );
			float ultraTone = ( ultraA.b + ultraB.b ) - 1.0;
			ultraTint += ${pair(d.gravel.tone * d.fine)} * ultraFine * ultraTone + ${single(d.gravel.lowLuma)} * ( ultraLowA.r * 2.0 - 1.0 );${undulationCall()}
			return ultraTint;`;
}

/** The dirt branch: relief only, so nothing at all while `detail.fine` is 0. */
function dirtDetailGlsl(): string {
  const d = ULTRA_GROUND.detail;
  const fr = d.frames;
  if (d.fine <= 0) return /* glsl */ `
			return ultraTint;`;
  return /* glsl */ `
			float ultraFine = 1.0 - smoothstep( ${f(d.dirt.fade[0])}, ${f(d.dirt.fade[1])}, ultraFootprint );
			vec4 ultraA = ultraDetailSample( ultraDetailSoil, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.dirtA)} );
			vec4 ultraB = ultraDetailSample( ultraDetailSoil, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.dirtB)} );
			ultraSlope = ${pair(d.dirt.slope * d.fine)} * 0.5 * ultraFine
				* ( ultraDetailSlopeOf( ultraA.rg, ${frame(fr.dirtA)} ) + ultraDetailSlopeOf( ultraB.rg, ${frame(fr.dirtB)} ) );
			return ultraTint;`;
}

/** The fine maps' samplers, each declared only while a compiled term samples it (item 0). */
function detailSamplerDeclarations(): string {
  const sampled = ultraDetailMapsSampled();
  let out = '';
  if (sampled.grass) out += '\n\tuniform sampler2D ultraDetailGrass;';
  if (sampled.stone) out += '\n\tuniform sampler2D ultraDetailStone;';
  if (sampled.soil) out += '\n\tuniform sampler2D ultraDetailSoil;';
  return out;
}

function fragmentDeclarations(screenKernel: boolean): string {
  const d = ULTRA_GROUND.detail;
  const fr = d.frames;
  return /* glsl */ `
// ---- M39 Ultra ground (render/ultra/ultraGroundDetail.ts) ----
#ifdef ULTRA_EDGE
	varying vec2 vUltraEdge;
	varying vec3 vUltraFillTint;
	varying float vUltraFillKind;
	// The brick joints a brick-filled region of another surface continues
	// (the brick material draws its own; these are its shared uniforms).
	#ifndef ULTRA_BRICK
		uniform float ultraBrickModule;
		uniform float ultraBrickJoint;
		uniform float ultraBrickDarken;
		uniform vec2 ultraBrickFade;
	#endif
	float ultraFillJoint( const in vec2 ultraP, const in vec2 ultraDpdx, const in vec2 ultraDpdy ) {
		float ultraFootprintJ = length( abs( ultraDpdx ) + abs( ultraDpdy ) );
		float ultraRowJ = floor( ultraP.y / ultraBrickModule );
		float ultraUJ = ultraP.x / ultraBrickModule + ( mod( ultraRowJ, 2.0 ) < 0.5 ? 0.0 : 0.5 );
		float ultraVJ = ultraP.y / ultraBrickModule;
		float ultraDxJ = ( 0.5 - abs( fract( ultraUJ ) - 0.5 ) ) * ultraBrickModule;
		float ultraDzJ = ( 0.5 - abs( fract( ultraVJ ) - 0.5 ) ) * ultraBrickModule;
		float ultraWJ = max( ultraFootprintJ, 1e-5 );
		float ultraWideJ = max( ultraBrickJoint, ultraWJ );
		float ultraLineJ = max(
			saturate( ( 0.5 * ultraWideJ - ultraDxJ ) / ultraWJ + 0.5 ),
			saturate( ( 0.5 * ultraWideJ - ultraDzJ ) / ultraWJ + 0.5 ) ) * ( ultraBrickJoint / ultraWideJ );
		ultraLineJ *= 1.0 - smoothstep( ultraBrickFade.x, ultraBrickFade.y, ultraFootprintJ );
		// The brick material's near-field fade-in (final wave, P-GR), the same constants.
		ultraLineJ *= smoothstep( ${f(ULTRA.brickJoints.nearFadeFootprintMetres[0])}, ${f(ULTRA.brickJoints.nearFadeFootprintMetres[1])}, ultraFootprintJ );
		return 1.0 - ultraBrickDarken * ultraLineJ;
	}
#endif
#ifdef ULTRA_DETAIL
	uniform float ultraGroundKind;${detailSamplerDeclarations()}
	uniform sampler2D ultraDetailBroad;
	// One sample of a detail map in a rotated, scaled world-XZ frame
	// (cos, sin, 1/period), with explicit gradients so it is well defined in
	// any control flow, and the coordinate wrapped so large world positions
	// keep their sub-texel precision.
	vec4 ultraDetailSample( sampler2D ultraMap, const in vec2 ultraP, const in vec2 ultraDpdx, const in vec2 ultraDpdy, const in vec3 ultraFrame ) {
		mat2 ultraRot = mat2( ultraFrame.x, ultraFrame.y, - ultraFrame.y, ultraFrame.x ) * ultraFrame.z;
		return textureGrad( ultraMap, fract( ultraRot * ultraP ), ultraRot * ultraDpdx, ultraRot * ultraDpdy );
	}
	// A sample's decoded slope pair, rotated back into world XZ.
	vec2 ultraDetailSlopeOf( const in vec2 ultraEncoded, const in vec3 ultraFrame ) {
		return mat2( ultraFrame.x, - ultraFrame.y, ultraFrame.y, ultraFrame.x ) * ( ultraEncoded * 2.0 - 1.0 );
	}
${undulationGlsl()}
	// The detail one surface kind lays on the ground at p: the zero-mean
	// albedo multiplier it returns, and a world-XZ slope (the normal tilt).
	// Kind 0 (the road, wood, the spill) is exactly nothing.
	vec3 ultraGroundDetail( const in float ultraKind, const in vec2 ultraP, const in vec2 ultraDpdx, const in vec2 ultraDpdy,
		const in float ultraFootprint, out vec2 ultraSlope ) {
		ultraSlope = vec2( 0.0 );
		vec3 ultraTint = vec3( 1.0 );
		if ( ultraKind < 0.5 ) return ultraTint;
		if ( ultraKind < 1.5 ) {${grassDetailGlsl()}
		}
		if ( ultraKind < 2.5 ) {${gravelDetailGlsl()}
		}
		if ( ultraKind < 3.5 ) {${dirtDetailGlsl()}
		}
		vec4 ultraWearA = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.wearA)} );
		vec4 ultraWearB = ultraDetailSample( ultraDetailBroad, ultraP, ultraDpdx, ultraDpdy, ${frame(fr.wearB)} );
		ultraTint += ${pair(d.brick.wear)} * ( ( ultraWearA.b + ultraWearB.b ) - 1.0 );
		return ultraTint;
	}
#endif
${dynamicContactDeclarations()}
#ifdef ULTRA_SHADE_LIFT
${ultraShadeLiftDeclarationsGlsl(screenKernel)}
${surfaceShareDeclarationsGlsl()}
#endif
`;
}

/**
 * A28, Trade 3: the static-shade lift's share on a ground surface
 * (`ULTRA.shade.surfaceShare`) by detail kind; kind none (the road, wood,
 * the spill) always 1, so rank-1 road keeps A20/A28 to the bit.
 */
export function ultraLiftSurfaceShare(kind: number): number {
  const share = ULTRA.shade.surfaceShare;
  switch (kind) {
    case GROUND_DETAIL_KIND.grass: return share.grass;
    case GROUND_DETAIL_KIND.gravel: return share.gravel;
    case GROUND_DETAIL_KIND.dirt: return share.dirt;
    case GROUND_DETAIL_KIND.brick: return share.brick;
    default: return 1;
  }
}

/**
 * The ground's lift-share declarations (A28, Trade 3): the material's own
 * share (a per-material uniform, so the ground family stays one program), and
 * the share of a filling surface's kind, baked, for the edge field's fill.
 */
function surfaceShareDeclarationsGlsl(): string {
  const K = GROUND_DETAIL_KIND;
  return /* glsl */ `
	uniform float ultraLiftSurfaceShare;
	float ultraLiftShareOfKind( const in float ultraKind ) {
		return ultraKind < ${f(K.grass - 0.5)} ? 1.0
			: ultraKind < ${f(K.grass + 0.5)} ? ${f(ultraLiftSurfaceShare(K.grass))}
			: ultraKind < ${f(K.gravel + 0.5)} ? ${f(ultraLiftSurfaceShare(K.gravel))}
			: ultraKind < ${f(K.dirt + 0.5)} ? ${f(ultraLiftSurfaceShare(K.dirt))}
			: ${f(ultraLiftSurfaceShare(K.brick))};
	}`;
}

// ---------------------------------------------------------------------------
// Shade and contact (Wave 3, R-G: coordinator amendments A7 and A9)
// ---------------------------------------------------------------------------

/**
 * How many dynamic contact occluders the shared `ultraContactPoints` array
 * holds: two a rider (the wheel's core and the body's pool,
 * `riderContactOccluders`) for every body a solo world can put on the road at
 * once — the player and the pack of M39 Part P, `CHASE.roomSize` bodies in all
 * (the rider plus three Officer Dorkins; Ultra never enters a couch, so a
 * seat's rig and the pack never share this array). It was 4 — the player and
 * the one cop — until the pack landed (2026-09-25), when the patrols stood on
 * the road ungrounded beside a grounded tail. The loop in the patch breaks at
 * `ultraContactCount`, so a world with one rider on the road pays for its own
 * two slots and nothing more: pure arithmetic, no fetch, and the uniform
 * arrays grow by 12 `vec4`s.
 */
export const ULTRA_CONTACT_SLOTS = 2 * CHASE.roomSize;
/**
 * `vec4`s a slot takes in `ultraContactPoints` (Wave 4, R-G; A15): `(x, z,
 * radiusAlong, strength)` then `(axisX, axisZ, radiusAcross, 0)` — an
 * elliptical pool, so the body's can lie along the sun's azimuth.
 */
export const ULTRA_CONTACT_VEC4_PER_SLOT = 2;
/** Floats a slot takes in the runtime's packed array (`riderContactOccluders`). */
export const ULTRA_CONTACT_FLOATS = ULTRA_CONTACT_VEC4_PER_SLOT * 4;
/**
 * Floats a slot's **shade shape** takes (A28, Trade 1): one `vec4` a slot in
 * the shared `ultraContactShade`, `(x, z, radius, strength)` — the compact
 * round pool the slot becomes where static shade lies.
 */
export const ULTRA_CONTACT_SHADE_FLOATS = 4;

/**
 * The dynamic contact occluders (A9): the uniforms the runtime feeds every
 * solo frame (shared by every Ultra material, read here only) and their
 * product at a ground point. Each is `1 − s·(1 − t²)²` at the elliptical
 * distance `t` (along the slot's axis over its along-radius, across over its
 * across-radius; a round pool has both radii equal) — a soft centre, and zero
 * value *and* zero slope at the rim, so the pool has no outline to read as a
 * halo — clamped at `ULTRA.contact.riders.floor`.
 *
 * **Two shapes a slot (A28, Trade 1).** The slot's ellipse is its *sun*
 * shape and weighs `sunShare × (1 − shade)`; `ultraContactShade` holds its
 * *shade* shape, a compact round pool under the wheel and feet, which weighs
 * `shade` — `shade` being the static (building or tree) shade the lift found
 * at this ground point. In a canyon the body's down-sun streak is gone and
 * the contact sits under him; across a shade edge each point blends by the
 * same continuous shade, so nothing pops (`groundContact.ts`
 * `dynamicContactAt` is this in plain arithmetic).
 */
function dynamicContactDeclarations(): string {
  return /* glsl */ `
#ifdef ULTRA_CONTACT_DYNAMIC
	uniform vec4 ultraContactPoints[ ${ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_VEC4_PER_SLOT} ];
	uniform vec4 ultraContactShade[ ${ULTRA_CONTACT_SLOTS} ];
	uniform int ultraContactCount;
	float ultraDynamicContact( const in vec2 ultraP, const in float ultraShadeHere ) {
		float ultraOcc = 1.0;
		for ( int ultraI = 0; ultraI < ${ULTRA_CONTACT_SLOTS}; ultraI ++ ) {
			if ( ultraI >= ultraContactCount ) break;
			vec4 ultraC = ultraContactPoints[ 2 * ultraI ];
			vec4 ultraE = ultraContactPoints[ 2 * ultraI + 1 ];
			vec4 ultraS = ultraContactShade[ ultraI ];
			// The sun shape, at its sunShare, where no static shade lies.
			vec2 ultraD = ultraP - ultraC.xy;
			vec2 ultraT = vec2( dot( ultraD, ultraE.xy ) / max( ultraC.z, 1e-3 ),
				( ultraD.x * ultraE.y - ultraD.y * ultraE.x ) / max( ultraE.z, 1e-3 ) );
			float ultraK = saturate( 1.0 - dot( ultraT, ultraT ) );
			ultraOcc *= 1.0 - ultraC.w * ultraE.w * ( 1.0 - ultraShadeHere ) * ultraK * ultraK;
			// The shade shape: compact and round, where static shade lies.
			vec2 ultraU = ( ultraP - ultraS.xy ) / max( ultraS.z, 1e-3 );
			float ultraKs = saturate( 1.0 - dot( ultraU, ultraU ) );
			ultraOcc *= 1.0 - ultraS.w * ultraShadeHere * ultraKs * ultraKs;
		}
		return max( ultraOcc, ${f(ULTRA.contact.riders.floor)} );
	}
#endif
`;
}

/**
 * The static-shade lift (A7) as GLSL, for any Ultra patch that runs after
 * `#include <aomap_fragment>` — the ground's and the blocks'.
 *
 * `reflectedLight.indirectDiffuse *= 1 + lift·shade·up`: `shade` is where the
 * sun is shadowed — the patched `getShadow`'s visibility (`ultraSunVisibility`)
 * times the steep N·L ramp the fill's own hue uses — **and**, when the far map
 * is built, where it says a static caster shades the point (or, at
 * `selfShadeShare`, where the face is turned from the sun: a bank's form
 * shade); `up` is `smoothstep` on the world normal's y. Sunlit ground has `shade` 0 and is
 * untouched to the bit. The far-map gate is what lifts a building's or a
 * tree's shade and leaves the rider's own shadow (never in the far map), a
 * lamp post's or a fence's at their High darkness. Only the diffuse fill is
 * lifted: the sky sheen and the sun are the shared patch's.
 *
 * **The gate leans toward static (final touch, post round 4).** The gate
 * had read `ultraFarVisibility()`, the far map's averaged tent at a point
 * raised one far texel along the normal: in town (0.445 m texels) that edge
 * sits ~0.3 m short of the true one and ramps over ~1 m, while the near
 * map's edge is sharp. Along every static shadow edge near the camera the
 * near map said shade and the gate said "mostly lit", so a band of shade
 * kept High's unlifted darkness: the commercial view's right-edge smudge
 * (0.75 × the road around it, 5/5 round-4 critics), which is that rim around
 * the corner of a real sun patch just off frame, and the slice's "slightly
 * darker rim" on its tree shadow. The gate now asks
 * `ultraFarShadeAround` — the most shade of the same four taps, at the
 * point itself — so the classification reaches past the true edge by about
 * one far texel and the near map alone draws the edge. Only shade the near
 * map already found can lift, so sunlit ground is untouched; the cost is that
 * a rider's shadow within about a far texel of static shade lifts with it.
 *
 * The amounts are the shared `ultraShadeLift` / `ultraShadeLiftFar` uniforms
 * (F4 `ULTRA.shade.lift`, `.liftFar`), not compiled constants.
 *
 * **A28 (Codex's post-GU QA).** On the ground the cast part of the lift is
 * scaled by the surface's share (`ULTRA.shade.surfaceShare`: turf 0.4 past
 * 20 m, so tree shade on grass reads firmer than on the road — Trade 3; the
 * kerb band's brick 1.1 — Trade 1), and, where the ground filter's screen
 * kernel is compiled (A28's Trade 2; off since A29), the gate's lean reaches
 * it too (`ultraFarShadeAround`), so a graded shade edge lifts whole. Only
 * the far map can tell cast shade from a
 * bank's form shade or the rider's own shadow, so the share lives inside the
 * far-gated branch: on `ultra-lit`, under `?ultrakit=-farShadow` or with an
 * empty far box, every surface keeps the whole lift, as before A28 (Fable
 * finding 5; before, the share scaled the whole lift there, form shade and
 * the rider's shadow with it).
 */
export function ultraShadeLiftGlsl(
  upFacing: readonly number[] = ULTRA.shade.groundUpFacing,
  /** A float the caller declared, to receive the static shade here (the ground's rider pool reads it); none for the blocks. */
  poolShadeOut: string | null = null,
  /**
   * A28 (Trade 3): a float expression the caller declared, the lift's share on
   * this surface (`ULTRA.shade.surfaceShare`, the ground's `ultraLiftSurface`);
   * none (the whole lift) for the blocks. It scales only the far-classified
   * cast part, so without the far map it changes nothing (Fable finding 5).
   */
  surfaceShare: string | null = null,
): string {
  const s = ULTRA.shade;
  const pool = (value: string): string => (poolShadeOut === null ? '' : `\n\t\t${poolShadeOut} = ${value};`);
  const share = surfaceShare === null ? '' : ` * ${surfaceShare}`;
  return /* glsl */ `
	{
		vec3 ultraLiftN = transformNormalByInverseViewMatrix( nonPerturbedNormal, viewMatrix );
		float ultraLiftUp = smoothstep( ${f(upFacing[0])}, ${f(upFacing[1])}, ultraLiftN.y );
		float ultraLiftFacing = 0.0;
		#if NUM_DIR_LIGHTS > 0
			ultraLiftFacing = smoothstep( 0.0, 0.25, dot( geometryNormal, directionalLights[ 0 ].direction ) );
		#endif
		float ultraLiftShade = ( 1.0 - ultraSunVisibility * ultraLiftFacing ) * ultraLiftUp;${pool('ultraLiftShade')}
		#ifdef ULTRA_FAR
			if ( ultraLiftShade > 0.0 && ultraFarEnabled > 0.5 ) {
				// Lift a static caster's shade (the far map) - only a tall one's
				// (A14: a kicker's, a step's or a bollard's keeps its darkness) -
				// and a face turned from the sun (form shade, which no rider's
				// shadow can be), not the rest. The far map only classifies the
				// shade the near map found, so its lookup leans toward static
				// (ultraFarShadeAround): no unlifted rim where the coarse far
				// edge falls short of the sharp near one. The surface's share
				// (A28) takes only this cast part: a bank's form shade keeps its
				// lift, and without the far map every surface keeps it all.
				float ultraLiftStatic = smoothstep( ${f(s.staticShade[0])}, ${f(s.staticShade[1])}, ultraFarShadeAround( vUltraWorld ) );
				if ( ultraLiftStatic > 0.0 ) ultraLiftStatic *= ultraTallCaster();${pool('ultraLiftStatic')}
				ultraLiftShade *= max( ${f(s.selfShadeShare)} * ( 1.0 - ultraLiftFacing ), ultraLiftStatic${share} );
			}
		#endif
		if ( ultraLiftShade > 0.0 ) {
			// A14's aerial perspective of shade: the lift grows with view distance,
			// so distant cast shade reads lighter, as fog does to everything else.
			// The two amounts are live (F4 ULTRA.shade.lift / .liftFar).
			float ultraLiftAmount = mix( ultraShadeLift, ultraShadeLiftFar,
				smoothstep( ${f(s.liftDistance[0])}, ${f(s.liftDistance[1])}, length( vViewPosition ) ) );
			vec3 ultraLifted = reflectedLight.indirectDiffuse * ( ultraLiftAmount * ultraLiftShade );
			#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
				// A14: the lifted share is light off the sunlit street and facades,
				// so it takes the ground bounce's hue instead of the sky fill's -
				// the environment's own down-facing irradiance, the look's bounce.
				const vec3 ultraLiftLuma = vec3( 0.2126, 0.7152, 0.0722 );
				vec3 ultraBounce = getIBLIrradiance( ( viewMatrix * vec4( 0.0, - 1.0, 0.0, 0.0 ) ).xyz );
				vec3 ultraBounceHue = ultraBounce / max( dot( ultraBounce, ultraLiftLuma ), 1e-4 );
				vec3 ultraFillHue = iblIrradiance / max( dot( iblIrradiance, ultraLiftLuma ), 1e-4 );
				ultraLifted *= mix( vec3( 1.0 ), ultraBounceHue / max( ultraFillHue, vec3( 1e-3 ) ), ${f(s.liftWarmth)} );
			#endif
			reflectedLight.indirectDiffuse += ultraLifted;
		}
	}
`;
}

/**
 * The declarations `ultraShadeLiftGlsl` needs, for the patches that run it
 * (ground, blocks, paint): the tall-caster test (A14; round-2 item 5).
 *
 * The far map holds every static caster — buildings and trees, but also the
 * kickers, boxes, steps and bollards — so its gate alone lifted a 1 m
 * kicker's shadow like a canyon's (the Switchback kicker's ring 42 → 49,
 * three round-2 critics). The test asks whether the caster is taller than
 * `ULTRA.shade.tallCasterMetres`: the far map is compared again at two points
 * that high above the receiver — straight up, and up the sun ray. The map
 * stores a caster's *far* side (back faces, `ultraFarShadow.ts`), so the ray
 * point alone misses a building's shade within `h / tan(elevation)` of its
 * shaded wall (the point is inside the building, in front of the stored
 * wall), and the vertical point alone misses the outer `h / tan(elevation)` of
 * it (the point is above the shadow volume); together they cover a caster's
 * whole shade once it stands a little over `2h` tall (a thin wall too), while
 * a caster under `h` (a kicker, a box, a step, a bollard, a bench, a shrub)
 * passes under both. Between `h` and `2h` part of the shade lifts (a 3–4 m
 * wall keeps an unlifted band); `ultraGroundDetail.test.ts` holds the rule
 * against back-face depth at 55° and 33°. The ray point shares the
 * receiver's light-space footprint, so it adds no edge of its own. The
 * vertical point is one hardware-PCF fetch at the point itself; the ray
 * point, since the final touch, is the gate's own `ultraFarShadeAround` (four
 * fetches, the most shade), so its one-texel stair step no longer scallops
 * the lifted shade's edge. Both run only where static shade is already found;
 * 0 bytes, 0 programs. (The shared
 * `ultraFarVisibilityToward` was tried for the ray point and measured worse:
 * it carries the receiver's one-texel normal offset, 0.45 m in town, which on
 * a steep bank moves the point off the ray, and the vegetated view's
 * conifer shade on the far bank fell back to unlifted — share < 32 0.031
 * against 0.021.)
 */
export function ultraShadeLiftDeclarationsGlsl(
  /**
   * A29: whether the ground filter's screen kernel is compiled into this
   * program (`groundScreenKernelCompiled`), so the lean must reach its
   * diagonals. False — the shipped case, and always the blocks' — writes
   * U5's lean: the filter's four taps, no diagonals.
   */
  screenKernel = false,
): string {
  const tall = ULTRA.shade.tallCasterMetres;
  const kernelLean = !screenKernel ? '' : /* glsl */ `
		#if defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW )
			// A28 (Trade 2): past the ground's screen-kernel ramp its penumbra
			// reaches the kernel's radius beyond the true edge, so the lean reaches
			// as far: four more taps at the kernel ellipse's diagonals in world
			// space (|Kx.n| + |Ky.n| covers its reach in every direction n). Zero
			// kernel (the first metres of the ramp, the rider's shadow): skipped.
			vec3 ultraKernelA = ultraGroundKernelX + ultraGroundKernelY;
			vec3 ultraKernelB = ultraGroundKernelX - ultraGroundKernelY;
			if ( dot( ultraKernelA, ultraKernelA ) + dot( ultraKernelB, ultraKernelB ) > 1e-8 ) {
				// Each tap is the offset world point, its own light-space depth included.
				vec3 ultraFarA = ( ultraFarMatrix * vec4( ultraKernelA, 0.0 ) ).xyz;
				vec3 ultraFarB = ( ultraFarMatrix * vec4( ultraKernelB, 0.0 ) ).xyz;
				ultraFarLeast = min( ultraFarLeast, min(
					min( textureLod( ultraFarMap, vec3( ultraFarAt.xy + ultraFarA.xy, min( ultraFarAt.z + ultraFarA.z, 1.0 ) ), 0.0 ),
						textureLod( ultraFarMap, vec3( ultraFarAt.xy - ultraFarA.xy, min( ultraFarAt.z - ultraFarA.z, 1.0 ) ), 0.0 ) ),
					min( textureLod( ultraFarMap, vec3( ultraFarAt.xy + ultraFarB.xy, min( ultraFarAt.z + ultraFarB.z, 1.0 ) ), 0.0 ),
						textureLod( ultraFarMap, vec3( ultraFarAt.xy - ultraFarB.xy, min( ultraFarAt.z - ultraFarB.z, 1.0 ) ), 0.0 ) ) ) );
			}
		#endif`;
  return /* glsl */ `
	uniform float ultraShadeLift;
	uniform float ultraShadeLiftFar;
#ifdef ULTRA_FAR
	// The static far map's shade at one world point (1 in a caster's shade).
	float ultraFarShadeAt( const in vec3 ultraPoint ) {
		vec4 ultraFarAt = ultraFarMatrix * vec4( ultraPoint, 1.0 );
		return 1.0 - textureLod( ultraFarMap, vec3( ultraFarAt.xy, min( ultraFarAt.z, 1.0 ) ), 0.0 );
	}
	// The same, leaning toward shade (final touch, post round 4): the most shade
	// any of the far filter's four taps reads at the point itself (no normal
	// offset), faded out at the far box's edge as ultraFarVisibility() is.
	// A classification, never a visibility: it is only asked where the near
	// map already found shade.
	float ultraFarShadeAround( const in vec3 ultraPoint ) {
		vec4 ultraFarAt = ultraFarMatrix * vec4( ultraPoint, 1.0 );
		vec2 ultraFarTap = ultraFarSpread / vec2( textureSize( ultraFarMap, 0 ) );
		float ultraFarZ = min( ultraFarAt.z, 1.0 );
		float ultraFarLeast = min(
			min( textureLod( ultraFarMap, vec3( ultraFarAt.xy + vec2( - ultraFarTap.x, - ultraFarTap.y ), ultraFarZ ), 0.0 ),
				textureLod( ultraFarMap, vec3( ultraFarAt.xy + vec2( ultraFarTap.x, - ultraFarTap.y ), ultraFarZ ), 0.0 ) ),
			min( textureLod( ultraFarMap, vec3( ultraFarAt.xy + vec2( - ultraFarTap.x, ultraFarTap.y ), ultraFarZ ), 0.0 ),
				textureLod( ultraFarMap, vec3( ultraFarAt.xy + vec2( ultraFarTap.x, ultraFarTap.y ), ultraFarZ ), 0.0 ) ) );${kernelLean}
		return ( 1.0 - ultraFarLeast ) * ultraEdgeCoverage( ultraFarAt.xy, ultraFarEdge );
	}
	// Whether the static shade here is a tall caster's (see ultraGroundDetail.ts):
	// the point that high up the sun ray (leaning toward shade, as the gate
	// does), or straight above.
	float ultraTallCaster() {
		float ultraAlong = ultraFarShadeAround( vUltraWorld + ultraSunDirection * ( ${f(tall)} / max( ultraSunDirection.y, 0.2 ) ) );
		return max( ultraAlong, ultraFarShadeAt( vUltraWorld + vec3( 0.0, ${f(tall)}, 0.0 ) ) );
	}
#endif
`;
}

/**
 * Fable finding 8 (A28): the far-map fetches the lift takes per fragment, as
 * `ultraShadeLiftDeclarationsGlsl` writes them (each one hardware 2×2 depth
 * compare), and only where the lift asks — near-map shade on up-facing ground
 * with the far map built. `lean` is `ultraFarShadeAround`'s filter taps;
 * `kernelLean` its screen-kernel diagonals, on the ground and its paint where
 * the kernel is compiled (`ULTRA_GROUND_SCREEN_KERNEL`; none shipped since
 * A29) and on; the tall-caster test repeats the lean at its ray point
 * and adds `vertical`, only where the lean found static shade. The Ultra
 * envelope does not price per-fragment work, so `tools/render-cost.mjs`
 * prints this in the Ultra report; pinned against the GLSL by
 * `ultraGroundDetail.test.ts`.
 */
export function ultraLiftFarFetches(): { readonly lean: number; readonly kernelLean: number; readonly vertical: number } {
  return { lean: 4, kernelLean: 4, vertical: 1 };
}

/**
 * Round-2 item 10 (A18; Wave 4, R-G): the static contact AO on direct light,
 * on the non-road ground only (`ULTRA_AO` without `ULTRA_ROAD`, and
 * `ULTRA_CONTACT_DYNAMIC`, which only the ground family carries with AO), by
 * `ULTRA.contact.groundDirectShare` — so a wall's, a trunk's or a prop's base
 * reads grounded in sun as well as in shade. Nothing at a share of 0.
 */
function groundContactDirectGlsl(): string {
  const share = ULTRA.contact.groundDirectShare;
  if (!(share > 0)) return '';
  return /* glsl */ `
#if defined( ULTRA_AO ) && !defined( ULTRA_ROAD ) && defined( ULTRA_CONTACT_DYNAMIC )
	{
		float ultraGroundOcc = clamp( 1.0 - ( 1.0 - saturate( vUltraAo ) ) * ultraContactStrength, ultraContactFloor, 1.0 );
		reflectedLight.directDiffuse *= mix( 1.0, ultraGroundOcc, ${f(share)} );
	}
#endif`;
}

/**
 * After `#include <aomap_fragment>`, ground only: the static-shade lift, then
 * the dynamic contact on indirect light (diffuse, and the sky sheen by
 * three's own specular occlusion) and on `directShare` of the direct.
 */
function fragmentLight(): string {
  return /* glsl */ `
// Where static (building or tree) shade lies here, for the rider's body pool
// (A15): 1 without the lift (the -lighting diagnostic keeps A9's whole pool).
float ultraPoolShade = 1.0;
#ifdef ULTRA_SHADE_LIFT
	ultraPoolShade = 0.0;
	// A28 (Trade 3): the lift's share on this surface - the material's, and
	// across a filled band edge the filling surface's by the edge's cover.
	// Road paint (no ULTRA_GROUND) keeps the whole lift, as the road does.
	// A share under 1 (turf) comes in with view distance: near the camera the
	// bank keeps its lift (no near-black tree shade at the wheel).
	float ultraLiftSurface = 1.0;
	#ifdef ULTRA_GROUND
		ultraLiftSurface = ultraLiftSurfaceShare;
		#ifdef ULTRA_EDGE
			ultraLiftSurface = mix( ultraLiftSurface, ultraLiftShareOfKind( ultraFillKindOnly ), ultraEdgeCover );
		#endif
		if ( ultraLiftSurface < 1.0 ) ultraLiftSurface = mix( 1.0, ultraLiftSurface,
			smoothstep( ${f(ULTRA.shade.surfaceShareMetres[0])}, ${f(ULTRA.shade.surfaceShareMetres[1])}, length( vViewPosition ) ) );
	#endif
${ultraShadeLiftGlsl(ULTRA.shade.groundUpFacing, 'ultraPoolShade', 'ultraLiftSurface')}
#endif
${groundContactDirectGlsl()}
#ifdef ULTRA_CONTACT_DYNAMIC
	{
		float ultraDyn = ultraDynamicContact( vUltraWorld.xz, ultraPoolShade );
		reflectedLight.indirectDiffuse *= ultraDyn;
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), ultraDyn, material.roughness );
		reflectedLight.directDiffuse *= mix( 1.0, ultraDyn, ${f(ULTRA.contact.riders.directShare)} );
	}
#endif
`;
}

/**
 * After `#include <color_fragment>` (the tile tone is in `diffuseColor`):
 * the edge field's cover — the union (or, by bit 3 of the kind, the
 * intersection) of two box-filtered half-planes, one pixel wide at any angle
 * and any distance, with no clamp and no smear —
 * the fill tone, then the surface detail, blended into the fill by the same
 * cover. Every derivative is taken here, in uniform control flow.
 */
const FRAGMENT_COLOUR = /* glsl */ `
#ifdef ULTRA_EDGE
	// Bit 4 of the kind is a drivable chain's rounded knee (A18); bit 3 the
	// lines' mode: a union (the boundary bends toward the band) or an
	// intersection (it bends away).
	float ultraEdgeRound = vUltraFillKind >= 15.5 ? 1.0 : 0.0;
	float ultraFillBits = vUltraFillKind - 16.0 * ultraEdgeRound;
	float ultraEdgeMode = ultraFillBits >= 7.5 ? 1.0 : 0.0;
	float ultraFillKindOnly = ultraFillBits - 8.0 * ultraEdgeMode;
	float ultraEdgeA = saturate( vUltraEdge.x / max( fwidth( vUltraEdge.x ), 1e-6 ) + 0.5 );
	float ultraEdgeB = saturate( vUltraEdge.y / max( fwidth( vUltraEdge.y ), 1e-6 ) + 0.5 );
	float ultraEdgeCover = mix( max( ultraEdgeA, ultraEdgeB ), min( ultraEdgeA, ultraEdgeB ), ultraEdgeMode );
	// The rounded knee: the smooth maximum of the two signed distances
	// (groundContact.ts edgeRoundedDistance), box-filtered like a line. Taken
	// on every fragment, so its derivative is in uniform control flow.
	float ultraKneeH = max( ${f(ULTRA_GROUND.edge.kneeRoundCells)} - abs( vUltraEdge.x - vUltraEdge.y ), 0.0 ) / ${f(Math.max(ULTRA_GROUND.edge.kneeRoundCells, 1e-6))};
	float ultraEdgeD = max( vUltraEdge.x, vUltraEdge.y ) + ultraKneeH * ultraKneeH * ${f(ULTRA_GROUND.edge.kneeRoundCells * 0.25)};
	float ultraEdgeRounded = saturate( ultraEdgeD / max( fwidth( ultraEdgeD ), 1e-6 ) + 0.5 );
	ultraEdgeCover = mix( ultraEdgeCover, ultraEdgeRounded, ultraEdgeRound );
	diffuseColor.rgb *= mix( vec3( 1.0 ), vUltraFillTint, ultraEdgeCover );
#endif
#ifdef ULTRA_DETAIL
	vec2 ultraDetailTilt = vec2( 0.0 );
	{
		vec2 ultraDpdx = dFdx( vUltraWorld.xz );
		vec2 ultraDpdy = dFdy( vUltraWorld.xz );
		float ultraFootprint = sqrt( length( ultraDpdx ) * length( ultraDpdy ) );
		vec2 ultraSlopeHere;
		vec3 ultraTintHere = ultraGroundDetail( ultraGroundKind, vUltraWorld.xz, ultraDpdx, ultraDpdy, ultraFootprint, ultraSlopeHere );
		#ifdef ULTRA_EDGE
			if ( ultraEdgeCover > 0.0 ) {
				vec2 ultraSlopeFill;
				vec3 ultraTintFill = ultraGroundDetail( ultraFillKindOnly, vUltraWorld.xz, ultraDpdx, ultraDpdy, ultraFootprint, ultraSlopeFill );
				if ( ultraFillKindOnly > 3.5 && ultraGroundKind < 3.5 ) ultraTintFill *= ultraFillJoint( vUltraWorld.xz, ultraDpdx, ultraDpdy );
				ultraSlopeHere = mix( ultraSlopeHere, ultraSlopeFill, ultraEdgeCover );
				ultraTintHere = mix( ultraTintHere, ultraTintFill, ultraEdgeCover );
			}
		#endif
		diffuseColor.rgb *= ultraTintHere;
		ultraDetailTilt = ultraSlopeHere;
	}
#endif
`;

/**
 * After `#include <normal_fragment_maps>`: tilt the shading normal by the
 * detail slope, in world space (a height field over world XZ), and leave
 * `nonPerturbedNormal` — the shadow lookups' — alone. No slope, no edit: the
 * road's normal is untouched to the bit.
 */
const FRAGMENT_NORMAL = /* glsl */ `
#ifdef ULTRA_DETAIL
	if ( ultraDetailTilt.x != 0.0 || ultraDetailTilt.y != 0.0 ) {
		vec3 ultraWorldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		vec3 ultraTilted = normalize( ultraWorldNormal - vec3( ultraDetailTilt.x, 0.0, ultraDetailTilt.y ) );
		normal = normalize( ( viewMatrix * vec4( ultraTilted, 0.0 ) ).xyz );
	}
#endif
`;

function replaceOnce(source: string, anchor: string, replacement: string, where: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`Ultra ground patch anchor missing from ${where}: ${anchor}`);
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

/** The ground vertex patch, applied after the shared Ultra patch. */
export function patchUltraGroundVertex(source: string): string {
  const a = ULTRA_GROUND_ANCHORS;
  let out = replaceOnce(source, a.vertexCommon, `${a.vertexCommon}\n${VERTEX_DECLARATIONS}`, 'the ground vertex shader');
  out = replaceOnce(out, a.vertexProject, `${a.vertexProject}\n${VERTEX_ASSIGNMENTS}`, 'the ground vertex shader');
  return out;
}

/**
 * The ground fragment patch, applied after the shared Ultra patch.
 * `screenKernel` (A29): the program carries the ground filter's screen kernel
 * (`groundScreenKernelCompiled`), so the lift's lean reaches it too.
 */
export function patchUltraGroundFragment(source: string, screenKernel = false): string {
  const a = ULTRA_GROUND_ANCHORS;
  let out = replaceOnce(source, a.fragmentDeclarations, `${fragmentDeclarations(screenKernel)}\n${a.fragmentDeclarations}`, 'the ground fragment shader');
  out = replaceOnce(out, a.fragmentColour, `${a.fragmentColour}\n${FRAGMENT_COLOUR}`, 'the ground fragment shader');
  out = replaceOnce(out, a.fragmentNormal, `${a.fragmentNormal}\n${FRAGMENT_NORMAL}`, 'the ground fragment shader');
  out = replaceOnce(out, a.fragmentLight, `${a.fragmentLight}\n${fragmentLight()}`, 'the ground fragment shader');
  return out;
}

/**
 * Install the ground patch on a material that already carries the shared
 * Ultra patch: chain its `onBeforeCompile`, add the ground's per-material
 * uniforms (the kind; the view's detail maps), and the defines the caller
 * chose. `edge` — the heightfield carries `ultraEdge`/`ultraFillTint`/
 * `ultraFillKind`; `detail` — the view's maps (absent, no detail is drawn
 * and none is declared).
 */
export function installUltraGroundPatch(
  material: THREE.MeshStandardMaterial,
  options: {
    readonly kind: number;
    readonly edge: boolean;
    readonly detail: UltraGroundDetail | null;
    /** A7: lift up-facing ground in static cast shade (a lighting response: `kit.lighting`). */
    readonly shadeLift?: boolean;
    /** A9: the rider/cop contact occluders (grounding: `kit.ground`). */
    readonly dynamicContact?: boolean;
  },
): THREE.MeshStandardMaterial {
  const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
  if (options.edge) defines.ULTRA_EDGE = '';
  if (options.detail !== null) defines.ULTRA_DETAIL = '';
  if (options.shadeLift === true) defines.ULTRA_SHADE_LIFT = '';
  if (options.dynamicContact === true) defines.ULTRA_CONTACT_DYNAMIC = '';
  material.defines = defines;
  material.userData.ultraGroundKind = options.kind;
  const kind: THREE.IUniform<number> = { value: options.kind };
  // A28 (Trade 3): this surface's share of the static-shade lift, per material.
  const liftShare: THREE.IUniform<number> = { value: ultraLiftSurfaceShare(options.kind) };
  material.userData.ultraLiftSurfaceShare = liftShare.value;
  const detail = options.detail;
  const shared = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer): void => {
    shared.call(material, shader, renderer);
    if (options.shadeLift === true) shader.uniforms.ultraLiftSurfaceShare = liftShare;
    if (detail !== null) {
      shader.uniforms.ultraGroundKind = kind;
      // Only the maps the view holds — the ones the GLSL declares and samples.
      if (detail.grass !== null) shader.uniforms.ultraDetailGrass = { value: detail.grass };
      if (detail.stone !== null) shader.uniforms.ultraDetailStone = { value: detail.stone };
      if (detail.soil !== null) shader.uniforms.ultraDetailSoil = { value: detail.soil };
      shader.uniforms.ultraDetailBroad = { value: detail.broad };
    }
    shader.vertexShader = patchUltraGroundVertex(shader.vertexShader);
    shader.fragmentShader = patchUltraGroundFragment(shader.fragmentShader, groundScreenKernelCompiled(material));
  };
  return material;
}

/**
 * The road-paint fragment patch (U2 stabilizer, R-G's open item 2): the
 * ground's own light response — the static-shade lift and the rider/cop
 * contact, `fragmentLight()` verbatim, keyed on the same defines — with none
 * of the ground's surfaces (no edge field, no detail, no attributes).
 * `screenKernel` as the ground's (A29).
 */
export function patchUltraPaintFragment(source: string, screenKernel = false): string {
  const a = ULTRA_GROUND_ANCHORS;
  const lift = `#ifdef ULTRA_SHADE_LIFT\n${ultraShadeLiftDeclarationsGlsl(screenKernel)}\n#endif\n`;
  let out = replaceOnce(source, a.fragmentDeclarations, `${dynamicContactDeclarations()}\n${lift}${a.fragmentDeclarations}`, 'the paint fragment shader');
  out = replaceOnce(out, a.fragmentLight, `${a.fragmentLight}\n${fragmentLight()}`, 'the paint fragment shader');
  return out;
}

/**
 * Road paint (`render/markings.ts`) answers light as the road it is painted
 * on (U2 stabilizer; R-G's open item 2 and §3.3's "paint ratios unchanged").
 * Without this, the lift raised the road in a canyon's shade (A7) and left
 * the line at its unlifted value — a centre dash in the industrial slab read
 * 1.5× its road where the shade's own albedo ratio is 2.7× — and the rider's
 * contact pool (A9) stopped at the line's edges. Chained onto a material that
 * already carries the shared Ultra patch; the same kit switches as the
 * ground's (`shadeLift` under `kit.lighting`, `dynamicContact` under
 * `kit.ground`). Both are defines uniform across the family, so the marking
 * family stays one program.
 */
export function installUltraPaintPatch(
  material: THREE.MeshStandardMaterial,
  options: { readonly shadeLift: boolean; readonly dynamicContact: boolean },
): THREE.MeshStandardMaterial {
  if (!options.shadeLift && !options.dynamicContact) return material;
  const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
  if (options.shadeLift) defines.ULTRA_SHADE_LIFT = '';
  if (options.dynamicContact) defines.ULTRA_CONTACT_DYNAMIC = '';
  material.defines = defines;
  const shared = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer): void => {
    shared.call(material, shader, renderer);
    shader.fragmentShader = patchUltraPaintFragment(shader.fragmentShader, groundScreenKernelCompiled(material));
  };
  return material;
}

// ---------------------------------------------------------------------------
// Smooth-shaded slopes (optional)
// ---------------------------------------------------------------------------

/**
 * Smoothed heightfield corner normals for the non-road ground — attribute
 * only, so geometry, triangles and the sampler's own plane normals are
 * untouched.
 *
 * `normals` holds one normal per heightfield *sample* (row-major, xyz); the
 * result is a new array of the same shape. A sample's smoothed normal is the
 * Gaussian-weighted mean of the samples within `radius` (σ = radius / 2),
 * renormalised, and the result is eased from the original over `ramp`
 * samples from any sample that touches a `keep` cell (the road), so every
 * vertex on a road cell — and every vertex a road cell shares a corner
 * with — keeps its normal to the bit, and the blend is continuous because it
 * is a function of the sample alone.
 */
export function smoothSampleNormals(
  columns: number,
  rows: number,
  normals: Float32Array,
  keepCell: (cell: number) => boolean,
  radius: number = ULTRA_GROUND.smoothNormals.radiusCells,
  ramp: number = ULTRA_GROUND.smoothNormals.rampCells,
  /**
   * The samples the caller will read (the corners of drawn cells). Absent,
   * all of them. Given, only those are smoothed — the rest are returned as
   * they came — and `normals` need only be valid within `radius` of them.
   */
  wanted?: Uint8Array,
): Float32Array {
  const count = columns * rows;
  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  // Distance (in samples, chessboard) from each sample to the nearest sample
  // of a kept cell, capped at ramp + 1.
  const far = ramp + 1;
  const distance = new Uint8Array(count).fill(far);
  const queue: number[] = [];
  for (let row = 0; row < cellRows; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
      if (!keepCell(row * cellColumns + column)) continue;
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const sample = (row + dr) * columns + column + dc;
        if (distance[sample] !== 0) {
          distance[sample] = 0;
          queue.push(sample);
        }
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const sample = queue[head];
    const next = distance[sample] + 1;
    if (next >= far) continue;
    const row = Math.floor(sample / columns);
    const column = sample - row * columns;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = row + dr;
        const c = column + dc;
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const neighbour = r * columns + c;
        if (distance[neighbour] > next) {
          distance[neighbour] = next;
          queue.push(neighbour);
        }
      }
    }
  }

  // Separable Gaussian over the sample lattice, edge-clamped.
  const reach = Math.max(0, Math.ceil(radius));
  const sigma = Math.max(1e-6, radius / 2);
  const weights: number[] = [];
  for (let k = -reach; k <= reach; k += 1) weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  // The first pass is needed only within `reach` rows of a sample the
  // second one smooths.
  let needed: Uint8Array | null = null;
  if (wanted !== undefined) {
    needed = new Uint8Array(count);
    for (let sample = 0; sample < count; sample += 1) {
      if (wanted[sample] !== 1 || distance[sample] === 0) continue;
      const row = Math.floor(sample / columns);
      const column = sample - row * columns;
      for (let k = -reach; k <= reach; k += 1) {
        const r = row + k;
        if (r >= 0 && r < rows) needed[r * columns + column] = 1;
      }
    }
  }
  const pass = new Float32Array(count * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (needed !== null && needed[row * columns + column] !== 1) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const c = Math.min(columns - 1, Math.max(0, column + k));
        const w = weights[k + reach];
        const at = (row * columns + c) * 3;
        x += normals[at] * w;
        y += normals[at + 1] * w;
        z += normals[at + 2] * w;
      }
      const out = (row * columns + column) * 3;
      pass[out] = x;
      pass[out + 1] = y;
      pass[out + 2] = z;
    }
  }
  const result = new Float32Array(count * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = row * columns + column;
      const at = sample * 3;
      const share = Math.min(1, distance[sample] / far);
      if (share <= 0 || (wanted !== undefined && wanted[sample] !== 1)) {
        result[at] = normals[at];
        result[at + 1] = normals[at + 1];
        result[at + 2] = normals[at + 2];
        continue;
      }
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const r = Math.min(rows - 1, Math.max(0, row + k));
        const w = weights[k + reach];
        const from = (r * columns + column) * 3;
        x += pass[from] * w;
        y += pass[from + 1] * w;
        z += pass[from + 2] * w;
      }
      const length = Math.hypot(x, y, z) || 1;
      x /= length;
      y /= length;
      z /= length;
      // Eased in from the road: smoothstep of the chessboard distance.
      const ease = share * share * (3 - 2 * share);
      let bx = normals[at] + (x - normals[at]) * ease;
      let by = normals[at + 1] + (y - normals[at + 1]) * ease;
      let bz = normals[at + 2] + (z - normals[at + 2]) * ease;
      const blended = Math.hypot(bx, by, bz) || 1;
      bx /= blended;
      by /= blended;
      bz /= blended;
      result[at] = bx;
      result[at + 1] = by;
      result[at + 2] = bz;
    }
  }
  return result;
}
