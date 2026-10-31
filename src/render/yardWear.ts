/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan, YardWear } from '../level/plan.ts';
import type { GroundTint } from './groundNoise.ts';

/**
 * Foundry Yard's worn concrete — 1.4.0's look pass, as vertex colour on the
 * heightfield (`LevelPlan.yardWear`). No texture, no surface, no draw call:
 * a multiplier per *sample*, applied to the tint each corner already carries,
 * so neighbouring cells meet on the same colour and nothing seams.
 *
 * What it paints, all from the plan's own heights and copings:
 *   - the faces: a shade darker and a touch cooler than the floor, so a wall
 *     reads as a wall under a flat sky;
 *   - the relief (critic pass 1): grit in every foot and channel, a worn pale
 *     crest on every arris, and sunken floors a little darker the deeper
 *     they lie, so a shallow kicker, bank or snake reads from rider height;
 *   - the lips: a grimy band along every coping, the darkest line in a park;
 *   - the sunken and raised floors: scuffs and stains, never on the plaza;
 *   - the pour: a faint large-scale variation in every shaped sample;
 *   - the plan's tonal patches on the faces: soft blotches of colour with a
 *     darker rim, the way old paint reads from the chase camera. Never a
 *     letter, a word or a mark.
 *
 * **Exactly 1 wherever the field stands at exactly 0.** The plaza floor is
 * the surround's 8 m patches and the shaped squares' own edge samples are at
 * 0, so the two meet on the identical tint they met on before this file.
 *
 * Absent `yardWear`, `yardWearTints` answers null and the terrain builder
 * pushes every colour exactly as it did: the four shipped worlds are
 * untouched by construction. Nothing here imports three.js; it is read once
 * per build.
 */

/**
 * Below this slope a sample is floor, above the next it is all face. Critic
 * pass 1 (A1): from 4° to 28°, so a 20–25° kicker, bank or pyramid face takes
 * most of the shade and reads against the floor; it was 10°–40°.
 */
const FACE_FROM = Math.tan((4 * Math.PI) / 180);
const FACE_TO = Math.tan((28 * Math.PI) / 180);
/**
 * Plan distance from a coping over which the lip grime fades out, metres.
 * Critic pass 1 (R5): a metre, not 0.45, so no cell holds more than a few
 * per cent of the band and the curved rims stop drawing teeth.
 */
const LIP_NEAR = 0.05;
const LIP_FAR = 1.0;
/** The concrete pour's variation either way, and its scale in metres. */
const POUR = 0.035;
const POUR_METRES = 2.2;
/** A patch's soft border inside its rectangle, metres; its blotch scale. */
const PATCH_BORDER = 1.2;
const PATCH_METRES = 0.9;
/** How far a patch's rim darkens, relative to its strength. */
const PATCH_RIM = 0.5;
/** A wash's border, metres: a painted face has an edge, not a fade. */
const WASH_BORDER = 0.12;
/** How far along its own uphill a sample's blotch coordinate moves per metre of height (T4). */
const PATCH_UNROLL = 0.7;
/** Blotch edges fade out on a face steeper than this, where one row spans 0.6 m of wall (T4). */
const PATCH_STEEP_FROM = Math.tan((55 * Math.PI) / 180);
const PATCH_STEEP_TO = Math.tan((62 * Math.PI) / 180);
/**
 * Curvature over ±2 samples (A1, R2, T5): the foot of every transition and
 * the floor of every channel collects grit (darker); every crest, arris and
 * lip is worn pale (lighter, kept under 1.1 so a coping still reads).
 * `CURVE_FROM`/`CURVE_TO` are the Laplacian (1/m) the ramp spans.
 */
const CURVE_FROM = 0.15;
const CURVE_TO = 0.9;
const CONCAVE_DARK = 0.16;
const CONVEX_LIGHT = 0.07;
/** Below grade, a sunken floor reads sunken: up to this much darker by a metre down. */
const SUNKEN_DARK = 0.1;
/**
 * A sunken face's first rows under a deck at 0 keep this share of their
 * wear, then the next rows this — so the step from the deck's untouched 1 to
 * a dark face is spread over three cells instead of drawn across one, which
 * the fixed cell diagonal turns into teeth on a curved rim (R5, A4, T1).
 */
const RIM_SOFT = [0.4, 0.75] as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 15), 1540483477) | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) at a given lattice size. */
function valueNoise(x: number, z: number, metres: number, seed: number): number {
  const gx = x / metres, gz = z / metres;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Two octaves, rescaled to [0, 1). */
function noise2(x: number, z: number, metres: number, seed: number): number {
  return (valueNoise(x, z, metres, seed) * 2 + valueNoise(x + 17.3, z - 9.1, metres / 2.3, seed + 1)) / 3;
}

function linear(hex: number, out: GroundTint): GroundTint {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  out.r = channel((hex >> 16) & 0xff); out.g = channel((hex >> 8) & 0xff); out.b = channel(hex & 0xff);
  return out;
}

/** Coping segments in 2 m buckets, for the lip's distance query. */
function copingIndex(plan: LevelPlan): { distance(x: number, z: number): number } {
  const cell = 2;
  const buckets = new Map<string, number[]>();
  const segments: number[] = [];
  for (const run of plan.copings?.runs ?? []) {
    for (let i = 1; i < run.points.length; i += 1) {
      const a = run.points[i - 1], b = run.points[i];
      const id = segments.length / 4;
      segments.push(a.x, a.z, b.x, b.z);
      const x0 = Math.floor((Math.min(a.x, b.x) - LIP_FAR) / cell), x1 = Math.floor((Math.max(a.x, b.x) + LIP_FAR) / cell);
      const z0 = Math.floor((Math.min(a.z, b.z) - LIP_FAR) / cell), z1 = Math.floor((Math.max(a.z, b.z) + LIP_FAR) / cell);
      for (let bx = x0; bx <= x1; bx += 1) {
        for (let bz = z0; bz <= z1; bz += 1) {
          const key = `${bx},${bz}`;
          const list = buckets.get(key);
          if (list === undefined) buckets.set(key, [id]); else list.push(id);
        }
      }
    }
  }
  return {
    distance(x: number, z: number): number {
      const list = buckets.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
      let best = Infinity;
      for (const id of list ?? []) {
        const ax = segments[id * 4], az = segments[id * 4 + 1], bx = segments[id * 4 + 2], bz = segments[id * 4 + 3];
        const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
        const t = length2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2)) : 0;
        best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
      }
      return best;
    },
  };
}

/**
 * Per-sample RGB multipliers (`columns × rows × 3`, row-major) for a plan
 * that carries `yardWear`, against `base` — the linear albedo the shaped
 * cells are painted with, which a patch's colour is a ratio to. Null for
 * every plan without it.
 */
export function yardWearTints(plan: LevelPlan, base: GroundTint): Float32Array | null {
  const wear: YardWear | undefined = plan.yardWear;
  if (wear === undefined) return null;
  const field = plan.heightfield;
  const { columns, rows, spacing, heights, originX, originZ } = field;
  const out = new Float32Array(columns * rows * 3).fill(1);
  const lips = copingIndex(plan);
  const patches = wear.patches.map((patch) => {
    const colour = linear(patch.colour, { r: 0, g: 0, b: 0 });
    return { ...patch, ratio: { r: colour.r / base.r, g: colour.g / base.g, b: colour.b / base.b } };
  });
  const at = (column: number, row: number): number =>
    heights[Math.min(rows - 1, Math.max(0, row)) * columns + Math.min(columns - 1, Math.max(0, column))];

  const step = 2;
  const reach = step * spacing;
  /** 1, or the share of wear a sunken sample right under a deck at 0 keeps (RIM_SOFT). */
  const rimSoft = (column: number, row: number, h: number): number => {
    if (h >= 0) return 1;
    let near = 3;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        if (at(column + dc, row + dr) === 0) near = Math.min(near, Math.max(Math.abs(dc), Math.abs(dr)));
      }
    }
    return near === 1 ? RIM_SOFT[0] : near === 2 ? RIM_SOFT[1] : 1;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const h = heights[row * columns + column];
      if (h === 0) continue;
      const x = originX + column * spacing, z = originZ + row * spacing;
      const gx = (at(column + 1, row) - at(column - 1, row)) / (2 * spacing);
      const gz = (at(column, row + 1) - at(column, row - 1)) / (2 * spacing);
      // The face term from a gradient smoothed over ±2 samples (R5): the
      // 75° wall's shade comes in over two rows instead of one.
      const sx = (at(column + step, row) - at(column - step, row)) / (2 * reach);
      const sz = (at(column, row + step) - at(column, row - step)) / (2 * reach);
      const slope = Math.hypot(sx, sz);
      const face = smoothstep(FACE_FROM, FACE_TO, slope);

      // The pour, then the face's own shade, cooler as it steepens.
      const pour = 1 + POUR * (noise2(x, z, POUR_METRES, 0x9e1) * 2 - 1);
      const shade = 1 + (wear.faceShade - 1) * face;
      let r = pour * shade, g = pour * shade * (1 + 0.012 * face), b = pour * shade * (1 + 0.04 * face);

      // Grit in every foot and channel, wear on every crest (a 0.5 m Laplacian).
      const curve = (at(column + step, row) + at(column - step, row) + at(column, row + step)
        + at(column, row - step) - 4 * h) / (reach * reach);
      const relief = (1 - CONCAVE_DARK * smoothstep(CURVE_FROM, CURVE_TO, curve))
        * (1 + CONVEX_LIGHT * smoothstep(CURVE_FROM, CURVE_TO, -curve))
        * (1 - SUNKEN_DARK * smoothstep(0, 1, -h));
      r *= relief; g *= relief; b *= relief;

      // Grime along every coping, broken by a fine noise so it is not a ruled line.
      const lip = 1 - smoothstep(LIP_NEAR, LIP_FAR, lips.distance(x, z));
      if (lip > 0) {
        const grime = 1 - wear.lipGrime * lip * (0.7 + 0.3 * valueNoise(x, z, 0.35, 0x1b7));
        r *= grime; g *= grime; b *= grime;
      }

      // Scuffs and stains on a floor that is not the plaza (a bowl, a mini, a deck).
      const scuff = 1 - wear.scuff * (1 - face) * smoothstep(0.56, 0.78, noise2(x, z, 1.1, 0x5c3));
      r *= scuff; g *= scuff; b *= scuff;

      // Tonal patches on the faces, and washes wherever they reach.
      const local = Math.hypot(gx, gz);
      const steep = 1 - smoothstep(PATCH_STEEP_FROM, PATCH_STEEP_TO, local);
      for (let index = 0; index < patches.length; index += 1) {
        const patch = patches[index];
        if (x <= patch.x0 || x >= patch.x1 || z <= patch.z0 || z >= patch.z1) continue;
        if (patch.wash === true) {
          const body = smoothstep(0, WASH_BORDER, Math.min(x - patch.x0, patch.x1 - x, z - patch.z0, patch.z1 - z))
            * patch.strength;
          r *= 1 + (patch.ratio.r - 1) * body;
          g *= 1 + (patch.ratio.g - 1) * body;
          b *= 1 + (patch.ratio.b - 1) * body;
          continue;
        }
        if (face <= 0.2) continue;
        const gate = smoothstep(0.2, 0.6, face);
        const inside = smoothstep(0, PATCH_BORDER, Math.min(x - patch.x0, patch.x1 - x))
          * smoothstep(0, PATCH_BORDER, Math.min(z - patch.z0, patch.z1 - z));
        // Plan XZ moved along the sample's own uphill by its height (T4), so a
        // blotch is unrolled up any face, whichever way it faces, instead of
        // sheared one fixed way. Blotches thin out toward the border, so no
        // patch shows its rectangle.
        const ux = slope > 1e-6 ? sx / slope : 0, uz = slope > 1e-6 ? sz / slope : 0;
        const n = noise2(x + PATCH_UNROLL * h * ux, z + PATCH_UNROLL * h * uz, PATCH_METRES, 0x700 + index * 31)
          - 0.45 * (1 - inside);
        const body = smoothstep(0.42, 0.48, n) * gate * patch.strength * steep;
        const rim = Math.max(0, smoothstep(0.35, 0.4, n) - smoothstep(0.42, 0.48, n)) * gate * patch.strength * steep;
        const darken = 1 - PATCH_RIM * rim;
        r *= (1 + (patch.ratio.r - 1) * body) * darken;
        g *= (1 + (patch.ratio.g - 1) * body) * darken;
        b *= (1 + (patch.ratio.b - 1) * body) * darken;
      }
      // Right under a deck at 0, keep only part of it all (RIM_SOFT).
      const soft = rimSoft(column, row, h);
      if (soft < 1) {
        r = 1 - (1 - r) * soft; g = 1 - (1 - g) * soft; b = 1 - (1 - b) * soft;
      }
      const index = (row * columns + column) * 3;
      out[index] = r; out[index + 1] = g; out[index + 2] = b;
    }
  }
  return out;
}
