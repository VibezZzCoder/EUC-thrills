/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type {
  CopingRun, CopingScenery, Heightfield, LevelPlan, YardFaceMural, YardFloor, YardMast, YardMural, YardPlate,
} from './plan.ts';

/**
 * Foundry Yard's render-only scenery — 1.4.0, C6 and the look pass
 * (`docs/PLANS.md` §51.5.1, §51.5.9): the coping pipe along every lip, and
 * the painted panels on the plinth's inner side. Critic pass 1 added, all in
 * the same mesh: a pale band behind the bowl's and the berm's pipe (pool
 * coping), the snake's poured lips, a steel skirt where a curved pipe stands
 * over the cell diagonal's notches, the floor's saw-cut joints and stains,
 * and hard-edged paint on the straight transition faces. Critic pass 2
 * added the kickers' solid painted faces, lip stripes and toe plates, poured
 * crest lines on the pyramid, grout in the pool coping, paint on the riding
 * blocks' sides, stains that fade into the floor, and four floodlight masts.
 *
 * **One pure builder, drawn and priced from the same arrays**, on
 * `level/quayScenery.ts`' pattern: `render/yardScenery.ts` turns the buffers
 * into one mesh and `level/renderBudget.ts` prices it at
 * `yardSceneryTriangles`, so the predicted triangles are the measured ones by
 * construction (`render/renderCost.test.ts`). One vertex-colour mesh, casting
 * nothing: **one colour call and no shadow call**, and no `SurfaceId`,
 * `MaterialId` or prop part, so `LIBRARY_MAX_DRAW_CALLS` does not move.
 *
 * Nothing here collides or is sampled: the heightfield's lip is the riding
 * edge (D6), and a panel stands a few centimetres off a plinth face the
 * plinth's own box already guards. Nothing here may import three.js
 * (invariant 1).
 */

export interface YardSceneryGeometry {
  /** xyz per vertex, three vertices per triangle, no index. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Linear RGB per vertex. */
  readonly colours: Float32Array;
}

/** Sides of the pipe's section: at six centimetres a hexagon reads as round. */
export const COPING_SIDES = 6;
/**
 * The steel of a coping: pale, a little cool. Critic pass 2 (F2) lifted it a
 * step when the mesh went as matte as the concrete, so the pipe still reads
 * as steel without a glint.
 */
const COPING_STEEL = 0xb6babd;
/**
 * The skirt stands in for the wall top it fills (critic pass 2, F1): the
 * yard's concrete at the share of the face shade a rim sample keeps
 * (`render/yardWear.ts`' `RIM_SOFT[0]`), lit half from above like the rim
 * samples beside it — never a dark steel band whose notches read as teeth.
 */
const SKIRT_RIM_SHARE = 0.4;
/** Pool coping and a poured lip: pale concrete, over the deck by this much. */
const BAND_CONCRETE = 0xbfbcb3;
const BAND_LIFT = 0.005;
/** A poured lip's bullnose: out over the channel by this much, and its drop face at least this deep, metres. */
const EDGE_OVER = 0.04;
const EDGE_DROP = 0.05;
/**
 * A poured lip's band is this much of the way from the pale coping concrete
 * to the floor, and its drop face this much of the band (critic pass 2,
 * R4/K5): a light bullnose over a dark lip face, not a painted lane line.
 */
const EDGE_TOWARD_FLOOR = 0.5;
const EDGE_DROP_SHADE = 0.6;
/** Grout across pool coping: a joint this wide every this far, this dark, over the band by this much (R4). */
const GROUT = Object.freeze({ pitch: 0.9, width: 0.02, shade: 0.6, lift: 0.001 });
/** A kicker's lip stripe: over the block's top by this much, and its drop face this deep (K1). */
const CAP_LIFT = 0.005;
const CAP_DROP = 0.05;
/** A toe plate's steel, a step darker than the pipe (R5). */
const PLATE_SHADE = 0.5;
/** A floodlight mast (R7): pole sides, its radius at foot and head, the crossbar and lamp heads. */
const MAST = Object.freeze({
  sides: 8, footRadius: 0.16, headRadius: 0.08, bar: { length: 2.4, size: 0.12 },
  heads: 3, head: { width: 0.55, height: 0.4, depth: 0.22 }, tilt: 0.45,
  steel: 0x7d8286, housing: 0x3a3d40, lens: 0xe4e1d6,
});
/** Skirt pieces along a pipe, metres; a gap under this is not drawn. */
const SKIRT_STEP = 0.125;
const SKIRT_MIN_GAP = 0.012;
/** Vertices around a lump, and around the older layer behind a panel. */
const BUBBLE_POINTS = 10;
const UNDER_POINTS = 12;
/** Off the face, metres: the ground field, the older layer, the rims, the fills — each over the last. */
const MURAL_LIFT = Object.freeze({ ground: 0.006, under: 0.01, outline: 0.018, fill: 0.026 });
/**
 * The rim's width beyond the fill, metres: 9 cm (critic pass 2, R2), about
 * 3.7 px at 15 m, so a dark outline reads round a pale fill.
 */
const MURAL_RIM = 0.09;
/**
 * How far every fill is weathered toward the surface it is painted on; an
 * outline half as far, so black stays black (R2).
 */
const MURAL_FADE = 0.3;
const OUTLINE_FADE = MURAL_FADE * 0.5;
/** An overlaid piece's fill: its piece's fill this far toward chalk, under the same dark outline (R2). */
const OVERLAY_LIGHTEN = 0.45;
const OVERLAY_CHALK = 0xddd8cc;
/** The plinth's brick, for fading paint toward (its painted albedo in the yard). */
const MURAL_GROUND = 0x8a4f3d;
/** The yard's concrete, for fading face paint toward. */
const FACE_GROUND = 0x8a8984;
/** A face piece starts this far under its coping and stops this far above the floor, metres of face. */
const FACE_TOP = 0.14;
const FACE_FOOT = 0.25;
/** Off a transition face, metres: over its own sag between two sample rows (~4 mm). */
const FACE_LIFT = 0.012;
/** Floor joints and stains over the floor, metres. Joints lie over stains. */
const JOINT_LIFT = 0.009;
const STAIN_LIFT = 0.005;
/** A joint is this much of the floor's albedo; stains these. */
const JOINT_SHADE = 0.68;
const STAIN_TONES = Object.freeze({
  damp: [0.9, 0.91, 0.925] as const,
  oil: [0.93, 0.915, 0.89] as const,
  skid: [0.84, 0.84, 0.85] as const,
});
/** A stain's core: this much of its size, this much darker again, a little over its edge. */
const STAIN_CORE = Object.freeze({ size: 0.55, shade: 0.95, lift: 0.0015 });
/** Joints and stains keep this far from a coping or a lip band. */
const FLOOR_CLEAR = 0.45;
/** Rim vertices of a stain. */
const STAIN_POINTS = 12;

type V3 = readonly [number, number, number];
type RGB = readonly [number, number, number];
type V2 = readonly [number, number];

function linear(hex: number): RGB {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((hex >> 16) & 0xff), channel((hex >> 8) & 0xff), channel(hex & 0xff)];
}

function scaled(colour: RGB, by: readonly [number, number, number] | number): RGB {
  const k = typeof by === 'number' ? [by, by, by] : by;
  return [colour[0] * k[0], colour[1] * k[1], colour[2] * k[2]];
}

/** Integer hash of (seed, index) in [0, 1). */
function hash01(seed: number, index: number): number {
  let h = (Math.imul(seed | 0, 374761393) + Math.imul(index | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

class Buffers {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  /**
   * One triangle with a normal per vertex, wound so its front face is the
   * side its normals point to: the material is double-sided, and a back face
   * is lit with its normal flipped — a floor stain wound the other way drew
   * near-black under the sun.
   */
  tri(a: V3, b: V3, d: V3, na: V3, nb: V3, nd: V3, colour: RGB): void {
    this.shaded(a, b, d, na, nb, nd, colour, colour, colour);
  }
  /** `tri` with a colour per vertex (critic pass 2, R6: a stain fades into the floor at its rim). */
  shaded(a: V3, b: V3, d: V3, na: V3, nb: V3, nd: V3, ca: RGB, cb: RGB, cd: RGB): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const facing = (uy * vz - uz * vy) * (na[0] + nb[0] + nd[0]) + (uz * vx - ux * vz) * (na[1] + nb[1] + nd[1])
      + (ux * vy - uy * vx) * (na[2] + nb[2] + nd[2]);
    if (facing < 0) {
      this.p.push(...a, ...d, ...b);
      this.n.push(...na, ...nd, ...nb);
      this.c.push(...ca, ...cd, ...cb);
    } else {
      this.p.push(...a, ...b, ...d);
      this.n.push(...na, ...nb, ...nd);
      this.c.push(...ca, ...cb, ...cd);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, normal: V3, colour: RGB): void {
    this.tri(a, b, c, normal, normal, normal, colour);
    this.tri(a, c, d, normal, normal, normal, colour);
  }
}

// ---------------------------------------------------------------------------
// The drawn ground
// ---------------------------------------------------------------------------

/**
 * The height the terrain mesh draws at (x, z): the cell split on its
 * (c, r)–(c+1, r+1) diagonal, exactly as `simulation/planSampler.ts`
 * interpolates and `render/terrain.ts` emits. A pure copy, so this file
 * stays free of three.js and of simulation.
 */
export function drawnHeight(field: Heightfield, x: number, z: number): number {
  const fx = (x - field.originX) / field.spacing;
  const fz = (z - field.originZ) / field.spacing;
  const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
  const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
  const u = fx - column, v = fz - row;
  const base = row * field.columns + column;
  const h00 = field.heights[base], h10 = field.heights[base + 1];
  const h01 = field.heights[base + field.columns], h11 = field.heights[base + field.columns + 1];
  return v < u ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
}

/** Whether the cell under (x, z) is floor at exactly 0 on all four corners. */
function flatCell(field: Heightfield, x: number, z: number): boolean {
  const column = Math.floor((x - field.originX) / field.spacing);
  const row = Math.floor((z - field.originZ) / field.spacing);
  if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) return false;
  const base = row * field.columns + column;
  return field.heights[base] === 0 && field.heights[base + 1] === 0
    && field.heights[base + field.columns] === 0 && field.heights[base + field.columns + 1] === 0;
}

/** Distance in plan from (x, z) to the nearest coping or lip line. */
function lineDistance(runs: readonly CopingRun[], x: number, z: number): number {
  let best = Infinity;
  for (const run of runs) {
    for (let i = 1; i < run.points.length; i += 1) {
      const a = run.points[i - 1], b = run.points[i];
      const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
      const t = length2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / length2)) : 0;
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The coping pipe, its skirt, pool coping and poured lips
// ---------------------------------------------------------------------------

/** Triangles one run of pipe draws: a sleeve per segment and a cap at each end. */
export function copingRunTriangles(points: number): number {
  return (points - 1) * COPING_SIDES * 2 + 2 * (COPING_SIDES - 2);
}

/** Each point's in-plane side direction (left of travel) and mitre, so offsets keep their width through a bend. */
function runFrames(points: CopingRun['points']): { sideX: number; sideZ: number; mitre: number }[] {
  const count = points.length;
  const frames: { sideX: number; sideZ: number; mitre: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const here = points[i];
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(count - 1, i + 1)];
    const ax = here.x - before.x, az = here.z - before.z;
    const bx = after.x - here.x, bz = after.z - here.z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const inX = la > 1e-9 ? ax / la : bx / lb, inZ = la > 1e-9 ? az / la : bz / lb;
    const outX = lb > 1e-9 ? bx / lb : inX, outZ = lb > 1e-9 ? bz / lb : inZ;
    let tx = inX + outX, tz = inZ + outZ;
    const lt = Math.hypot(tx, tz);
    tx /= lt; tz /= lt;
    frames.push({ sideX: tz, sideZ: -tx, mitre: 1 / Math.max(0.5, tx * outX + tz * outZ) });
  }
  return frames;
}

/** +1 when the deck lies on the run's `side`, −1 when it lies opposite: read from the field at the longest segment. */
function deckSide(field: Heightfield, points: CopingRun['points']): 1 | -1 {
  let best = 1, length = -1;
  for (let i = 1; i < points.length; i += 1) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    if (l > length) { length = l; best = i; }
  }
  const a = points[best - 1], b = points[best];
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const sx = (b.z - a.z) / length, sz = -(b.x - a.x) / length;
  return drawnHeight(field, mx + sx * 0.4, mz + sz * 0.4) >= drawnHeight(field, mx - sx * 0.4, mz - sz * 0.4) ? 1 : -1;
}

function copingPipe(out: Buffers, run: CopingRun, radius: number): void {
  const steel = linear(COPING_STEEL);
  const points = run.points;
  const count = points.length;
  const frames = runFrames(points);
  // Each ring sits in the plane that halves the bend, widened by the mitre
  // so the sleeve keeps its radius through the arc's 7.5° steps.
  const rings: V3[][] = [];
  const ringNormals: V3[][] = [];
  for (let i = 0; i < count; i += 1) {
    const here = points[i];
    const { sideX, sideZ, mitre } = frames[i];
    const ring: V3[] = [];
    const normals: V3[] = [];
    for (let k = 0; k < COPING_SIDES; k += 1) {
      const a = (2 * Math.PI * k) / COPING_SIDES;
      const cos = Math.cos(a), sin = Math.sin(a);
      ring.push([here.x + radius * cos * mitre * sideX, here.y + radius * sin, here.z + radius * cos * mitre * sideZ]);
      normals.push([cos * sideX, sin, cos * sideZ]);
    }
    rings.push(ring);
    ringNormals.push(normals);
  }
  for (let i = 0; i + 1 < count; i += 1) {
    for (let k = 0; k < COPING_SIDES; k += 1) {
      const j = (k + 1) % COPING_SIDES;
      const [a, b, c, d] = [rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]];
      const [na, nb, nc, nd] = [ringNormals[i][k], ringNormals[i][j], ringNormals[i + 1][j], ringNormals[i + 1][k]];
      out.tri(a, b, c, na, nb, nc, steel);
      out.tri(a, c, d, na, nc, nd, steel);
    }
  }
  // Caps, facing out along the run.
  for (const [ring, from, to] of [[rings[0], points[1], points[0]], [rings[count - 1], points[count - 2], points[count - 1]]] as const) {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const cap: V3 = [dx / l, 0, dz / l];
    for (let k = 1; k + 1 < COPING_SIDES; k += 1) out.tri(ring[0], ring[k], ring[k + 1], cap, cap, cap, steel);
  }
}

/**
 * A skirt under the pipe, down to the drawn ground (critic pass 1, T2):
 * where a curved lip cuts the cells across their fixed diagonal, the drawn
 * lip notches up to 13 cm under the pipe and a bright pipe hangs over a dark
 * slot. The skirt closes it; where the pipe already sits on the ground it
 * draws nothing. Critic pass 2 (F1): it wears the wall top's own concrete and
 * is lit half from above like the rim beside it, so a filled notch reads as
 * wall, not as a dark tooth under the coping.
 */
function copingSkirt(out: Buffers, field: Heightfield, run: CopingRun, radius: number, side: 1 | -1, colour: RGB): void {
  const points = run.points;
  const frames = runFrames(points);
  const bottomOffset = radius * Math.sin(Math.PI / 3);
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i], b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const pieces = Math.max(1, Math.ceil(length / SKIRT_STEP));
    // Faces the open side: away from the deck.
    const nx = -side * (frames[i].sideX + frames[i + 1].sideX) / 2, nz = -side * (frames[i].sideZ + frames[i + 1].sideZ) / 2;
    const nl = Math.hypot(nx, nz) || 1;
    const normal: V3 = [nx / nl / Math.SQRT2, 1 / Math.SQRT2, nz / nl / Math.SQRT2];
    const at = (t: number): { x: number; y: number; z: number; ground: number } => {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t - bottomOffset;
      return { x, y, z, ground: Math.min(y, drawnHeight(field, x, z) - 0.01) };
    };
    for (let k = 0; k < pieces; k += 1) {
      const p = at(k / pieces), q = at((k + 1) / pieces);
      if (p.y - p.ground < SKIRT_MIN_GAP && q.y - q.ground < SKIRT_MIN_GAP) continue;
      out.quad([p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, q.ground, q.z], [p.x, p.ground, p.z], normal, colour);
    }
  }
}

/**
 * The pale band on the deck side of a line (pool coping, A4), and for a
 * poured lip (`style: 'edge'`, A3) a short drop face over the channel. Only
 * where the deck under the band's outer edge is level with the line: a band
 * never floats over a taper or a roll-out. Critic pass 2 (R4/K5): a poured
 * lip's band sits nearer the floor's tone over a darker drop face, and pool
 * coping is laid as blocks — a grout joint every `GROUT.pitch` along the run,
 * only across segments the band was drawn on.
 */
function copingBand(out: Buffers, field: Heightfield, run: CopingRun, side: 1 | -1, width: number, floor: RGB): void {
  const pale = linear(BAND_CONCRETE);
  const edge = run.style === 'edge';
  const colour: RGB = edge
    ? [0, 1, 2].map((k) => pale[k] + (floor[k] - pale[k]) * EDGE_TOWARD_FLOOR) as unknown as RGB
    : pale;
  const grout = scaled(pale, GROUT.shade);
  const points = run.points;
  const frames = runFrames(points);
  const up: V3 = [0, 1, 0];
  const deckY = (x: number, z: number): number => drawnHeight(field, x, z);
  // Distance along the run at each segment's start, so the joints keep their pitch through a bend.
  let travelled = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i], b = points[i + 1];
    const start = travelled;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    travelled += length;
    const fa = frames[i], fb = frames[i + 1];
    // The band's inner edge is the pipe's centreline, or for a poured lip a
    // bullnose a few centimetres out over the channel.
    const over = edge ? -EDGE_OVER : 0;
    const ia: V3 = [a.x + side * over * fa.mitre * fa.sideX, 0, a.z + side * over * fa.mitre * fa.sideZ];
    const ib: V3 = [b.x + side * over * fb.mitre * fb.sideX, 0, b.z + side * over * fb.mitre * fb.sideZ];
    const oa: V3 = [a.x + side * width * fa.mitre * fa.sideX, 0, a.z + side * width * fa.mitre * fa.sideZ];
    const ob: V3 = [b.x + side * width * fb.mitre * fb.sideX, 0, b.z + side * width * fb.mitre * fb.sideZ];
    const deck = deckY((oa[0] + ob[0]) / 2, (oa[2] + ob[2]) / 2);
    if (Math.abs(deckY(oa[0], oa[2]) - deck) > 0.01 || Math.abs(deckY(ob[0], ob[2]) - deck) > 0.01) continue;
    const y = deck + BAND_LIFT;
    const lift = (p: V3): V3 => [p[0], y, p[2]];
    out.quad(lift(ia), lift(ib), lift(ob), lift(oa), up, colour);
    if (!edge && length > 0) {
      for (let k = Math.ceil(start / GROUT.pitch - 1e-9); k * GROUT.pitch < start + length - 1e-9; k += 1) {
        const t0 = Math.max(0, (k * GROUT.pitch - start - GROUT.width / 2) / length);
        const t1 = Math.min(1, (k * GROUT.pitch - start + GROUT.width / 2) / length);
        const along = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, y + GROUT.lift, p[2] + (q[2] - p[2]) * t];
        out.quad(along(ia, ib, t0), along(ia, ib, t1), along(oa, ob, t1), along(oa, ob, t0), up, grout);
      }
    }
    if (edge) {
      const nx = -side * (fa.sideX + fb.sideX) / 2, nz = -side * (fa.sideZ + fb.sideZ) / 2;
      const nl = Math.hypot(nx, nz) || 1;
      const lowA = Math.min(y - EDGE_DROP, drawnHeight(field, ia[0], ia[2]) - 0.01);
      const lowB = Math.min(y - EDGE_DROP, drawnHeight(field, ib[0], ib[2]) - 0.01);
      out.quad([ia[0], y, ia[2]], [ib[0], y, ib[2]], [ib[0], lowB, ib[2]], [ia[0], lowA, ia[2]],
        [nx / nl, 0, nz / nl], scaled(colour, EDGE_DROP_SHADE));
    }
  }
}

/**
 * A kicker's lip stripe (critic pass 2, K1): one flat quad on the riding
 * block's top beside the pipe, at the deck the pipe sits flush with, and a
 * short drop face hanging over the ride face. A stripe of solid paint, no
 * marks; it reads the run, never the field, because the block is not drawn
 * in it.
 */
function copingCap(out: Buffers, run: CopingRun, radius: number, side: 1 | -1): void {
  const cap = run.cap!;
  const colour = linear(cap.colour);
  const points = run.points;
  const frames = runFrames(points);
  const up: V3 = [0, 1, 0];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i], b = points[i + 1];
    const fa = frames[i], fb = frames[i + 1];
    const ya = a.y + radius - CAP_LIFT, yb = b.y + radius - CAP_LIFT;
    const off = (p: typeof a, f: typeof fa, by: number, y: number): V3 =>
      [p.x + side * by * f.mitre * f.sideX, y, p.z + side * by * f.mitre * f.sideZ];
    out.quad(off(a, fa, 0, ya), off(b, fb, 0, yb), off(b, fb, cap.width, yb), off(a, fa, cap.width, ya), up, colour);
    // The drop face, just out over the open side so it never fights the block's own face.
    const nx = -side * (fa.sideX + fb.sideX) / 2, nz = -side * (fa.sideZ + fb.sideZ) / 2;
    const nl = Math.hypot(nx, nz) || 1;
    const front = -CAP_LIFT;
    out.quad(off(a, fa, front, ya), off(b, fb, front, yb), off(b, fb, front, yb - CAP_DROP), off(a, fa, front, ya - CAP_DROP),
      [nx / nl, 0, nz / nl], scaled(colour, EDGE_DROP_SHADE));
  }
}

function copings(out: Buffers, field: Heightfield, scenery: CopingScenery, floor: RGB, skirt: RGB): void {
  for (const run of scenery.runs) {
    const side = deckSide(field, run.points);
    if (run.style !== 'edge') {
      copingPipe(out, run, scenery.radius);
      copingSkirt(out, field, run, scenery.radius, side, skirt);
    }
    if (run.band !== undefined) copingBand(out, field, run, side, run.band, floor);
    if (run.cap !== undefined) copingCap(out, run, scenery.radius, side);
  }
}

// ---------------------------------------------------------------------------
// Paint: one vocabulary of abstract shapes, for the plinth and the faces
// ---------------------------------------------------------------------------

/**
 * Where a shape lands. Shapes are drawn in a local frame — `u` along the
 * surface, `v` up it, the origin at the piece's centre — and a painter maps
 * each triangle onto its surface at a lift.
 */
interface Painter {
  tri(a: V2, b: V2, c: V2, lift: number, colour: RGB): void;
}

/** A closed, lumpy outline: radius factors per vertex, smoothed once around the ring. */
function lumps(seed: number, points: number, from: number, spread: number): number[] {
  const raw = Array.from({ length: points }, (_, k) => from + spread * hash01(seed, k));
  return raw.map((value, k) => (raw[(k + points - 1) % points] + 2 * value + raw[(k + 1) % points]) / 4);
}

function blob(painter: Painter, radii: readonly number[], a: number, b: number, offU: number, offV: number,
  grow: number, lift: number, colour: RGB, tilt = 0): void {
  const points = radii.length;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const rim: V2[] = radii.map((rho, k) => {
    const t = (2 * Math.PI * k) / points;
    const du = (a * rho + grow) * Math.cos(t), dv = (b * rho + grow) * Math.sin(t);
    return [offU + du * cos - dv * sin, offV + du * sin + dv * cos];
  });
  const centre: V2 = [offU, offV];
  for (let k = 0; k < points; k += 1) painter.tri(centre, rim[k], rim[(k + 1) % points], lift, colour);
}

function quad2(painter: Painter, a: V2, b: V2, c: V2, d: V2, lift: number, colour: RGB): void {
  painter.tri(a, b, c, lift, colour);
  painter.tri(a, c, d, lift, colour);
}

interface Paint {
  readonly fill: RGB;
  readonly outline: RGB;
  /** The older, twice-weathered layer. */
  readonly old: RGB;
  /** An overlaid second piece's fill: this piece's fill lightened toward chalk (R2). */
  readonly over: RGB;
}

/** Thin runs hanging under a fill: 2–4 of them, never past the piece's foot. */
function drips(painter: Painter, seed: number, spots: readonly V2[], floor: number, colour: RGB): void {
  const count = 2 + Math.floor(hash01(seed, 300) * 3);
  for (let i = 0; i < count && spots.length > 0; i += 1) {
    const [u, v] = spots[Math.floor(hash01(seed, 310 + i) * spots.length) % spots.length];
    const du = (hash01(seed, 320 + i) - 0.5) * 0.3;
    const width = 0.02 + 0.01 * hash01(seed, 330 + i);
    const length = Math.min(0.1 + 0.2 * hash01(seed, 340 + i), v - floor - 0.02);
    if (length < 0.05) continue;
    const x = u + du;
    quad2(painter, [x - width / 2, v + 0.02], [x - width / 2, v - length], [x + width / 2, v - length],
      [x + width / 2, v + 0.02], MURAL_LIFT.fill, colour);
  }
}

/**
 * One painted piece, chosen from its seed: a cluster of 2–6 rounded lumps of
 * uneven width on a tilted baseline, or slanted bands over a dark field, or
 * angular shards — sometimes over a large faded field of the second colour,
 * and with a few drips. Abstract shapes only: never a letter, a word or a mark.
 */
function paintPiece(painter: Painter, seed: number, halfW: number, halfH: number, paint: Paint): void {
  // The ground field: a big faded patch of the older colour, most of the
  // piece and often past its edges (a panel stops it at the cap and the floor).
  if (hash01(seed, 2) < 0.6) {
    blob(painter, lumps(seed + 3, UNDER_POINTS, 0.85, 0.35), halfW * (0.85 + 0.25 * hash01(seed, 3)),
      halfH * (0.9 + 0.3 * hash01(seed, 4)), (hash01(seed, 5) - 0.5) * halfW * 0.3, 0, 0, MURAL_LIFT.ground, paint.old);
  }
  const spots: V2[] = [];
  const kind = hash01(seed, 1);
  paintKind(painter, seed, kind, halfW, halfH, paint, spots);
  // Two times in five a second, smaller piece of another kind is painted
  // over one side, in a lighter fill under the same dark outline (critic
  // pass 2, R2: an outline is always dark; chalk only ever fills): layers,
  // not a row of stamps.
  if (hash01(seed, 200) < 0.4) {
    const side = hash01(seed, 201) < 0.5 ? -1 : 1;
    const shift = side * halfW * 0.45;
    const over: Painter = {
      tri: (a, b, c, lift, colour) => painter.tri([a[0] + shift, a[1]], [b[0] + shift, b[1]], [c[0] + shift, c[1]],
        lift + MURAL_LIFT.fill, colour),
    };
    paintKind(over, seed * 5 + 3, (kind + 0.3 + 0.4 * hash01(seed, 202)) % 1, halfW * 0.45, halfH * 0.8,
      { ...paint, fill: paint.over }, []);
  }
  drips(painter, seed, spots, -halfH, paint.fill);
}

/** One kind of piece into the frame (the shapes, without the ground field or the drips). */
function paintKind(painter: Painter, seed: number, kind: number, halfW: number, halfH: number, paint: Paint,
  spots: V2[]): void {
  if (kind < 0.4) {
    // Lumps, of uneven widths, along a baseline that tilts.
    blob(painter, lumps(seed + 7, UNDER_POINTS, 0.8, 0.25), halfW * 0.45, halfH * 0.7,
      (hash01(seed, 99) < 0.5 ? -1 : 1) * halfW * 0.4, -halfH * 0.05, 0, MURAL_LIFT.under, paint.old);
    const count = 2 + Math.floor(hash01(seed, 10) * 5);
    const weights = Array.from({ length: count }, (_, i) => 0.4 + 1.4 * hash01(seed, 20 + i));
    const total = weights.reduce((sum, w) => sum + w, 0);
    const span = halfW * 2 * (0.82 - 0.1 * hash01(seed, 11));
    const tilt = (hash01(seed, 12) - 0.5) * 0.3;
    let u = -span / 2;
    const placed = weights.map((w, i) => {
      const width = (span * w) / total;
      const offU = u + width / 2 + (hash01(seed, 30 + i) - 0.5) * width * 0.5;
      u += width;
      const offV = (offU / halfW) * tilt * halfH + (hash01(seed, 40 + i) - 0.5) * halfH * 0.45 + halfH * 0.05;
      const b = (halfH - MURAL_RIM) * Math.min(0.85, (0.45 + 0.25 * hash01(seed, 50 + i)) * (0.6 + 0.35 * w));
      return { radii: lumps(seed * 7 + i, BUBBLE_POINTS, 0.82, 0.3), a: width * 0.62, b, offU, offV };
    });
    for (const lump of placed) blob(painter, lump.radii, lump.a, lump.b, lump.offU, lump.offV, MURAL_RIM, MURAL_LIFT.outline, paint.outline, tilt);
    for (const lump of placed) {
      blob(painter, lump.radii, lump.a, lump.b, lump.offU, lump.offV, 0, MURAL_LIFT.fill, paint.fill, tilt);
      spots.push([lump.offU, lump.offV - lump.b * 0.8]);
    }
  } else if (kind < 0.72) {
    // Slanted bands over a dark field, the same slant for all of them.
    const fieldW = halfW * (0.7 + 0.25 * hash01(seed, 60));
    const top = halfH * 0.92, bottom = -halfH * 0.85;
    const lean = (hash01(seed, 61) < 0.5 ? -1 : 1) * Math.tan((25 + 25 * hash01(seed, 62)) * Math.PI / 180);
    const rise = (top - bottom) * lean;
    quad2(painter, [-fieldW, bottom], [fieldW, bottom], [fieldW, top], [-fieldW, top], MURAL_LIFT.outline, paint.outline);
    const count = 3 + Math.floor(hash01(seed, 63) * 4);
    const width = Math.min(0.16, (fieldW * 2) / (count * 3)) * (0.7 + 0.5 * hash01(seed, 64));
    const from = -fieldW + Math.max(0, -rise), to = fieldW - Math.max(0, rise) - width;
    for (let i = 0; i < count; i += 1) {
      const u = from + ((to - from) * (i + 0.5 * hash01(seed, 70 + i))) / count;
      quad2(painter, [u, bottom], [u + width, bottom], [u + width + rise, top], [u + rise, top], MURAL_LIFT.fill, paint.fill);
      spots.push([u + width / 2, bottom]);
    }
  } else {
    // Angular shards — irregular four-sided fields, never a three-pointed
    // shape that could read as an arrow — each over a slightly larger copy
    // of itself in the rim's colour.
    const count = 3 + Math.floor(hash01(seed, 80) * 3);
    for (let i = 0; i < count; i += 1) {
      const cu = (hash01(seed, 81 + i) - 0.5) * halfW * 1.4;
      const cv = (hash01(seed, 91 + i) - 0.5) * halfH * 0.6;
      const corners: V2[] = [0, 1, 2, 3].map((k) => {
        const angle = (2 * Math.PI * (k + 0.2 + 0.5 * hash01(seed, 101 + i * 4 + k))) / 4;
        const reach = 0.55 + 0.45 * hash01(seed, 121 + i * 4 + k);
        return [cu + Math.cos(angle) * halfW * 0.4 * reach, cv + Math.sin(angle) * halfH * 0.75 * reach];
      });
      const mu = corners.reduce((sum, p) => sum + p[0], 0) / 4, mv = corners.reduce((sum, p) => sum + p[1], 0) / 4;
      const clamp = (p: V2, grow: number): V2 => {
        const u = mu + (p[0] - mu) * grow, v = mv + (p[1] - mv) * grow;
        return [Math.max(-halfW, Math.min(halfW, u)), Math.max(-halfH, Math.min(halfH, v))];
      };
      const [a, b, c, d] = corners;
      quad2(painter, clamp(a, 1.15), clamp(b, 1.15), clamp(c, 1.15), clamp(d, 1.15), MURAL_LIFT.outline, paint.outline);
      quad2(painter, clamp(a, 1), clamp(b, 1), clamp(c, 1), clamp(d, 1), MURAL_LIFT.fill, paint.fill);
      const low = corners.reduce((best, p) => (p[1] < best[1] ? p : best));
      spots.push(clamp(low, 1));
    }
  }
}

function weathered(hex: number, ground: number, fade: number): RGB {
  const paint = linear(hex), under = linear(ground);
  return [paint[0] + (under[0] - paint[0]) * fade, paint[1] + (under[1] - paint[1]) * fade,
    paint[2] + (under[2] - paint[2]) * fade];
}

function paintOf(fill: number, outline: number, ground: number): Paint {
  const fresh = weathered(fill, ground, MURAL_FADE), chalk = weathered(OVERLAY_CHALK, ground, MURAL_FADE);
  return { fill: fresh, outline: weathered(outline, ground, OUTLINE_FADE),
    old: weathered(outline === fill ? fill : outline, ground, Math.min(1, MURAL_FADE * 2)),
    over: [0, 1, 2].map((k) => fresh[k] + (chalk[k] - fresh[k]) * OVERLAY_LIGHTEN) as unknown as RGB };
}

// ---------------------------------------------------------------------------
// The plinth panels
// ---------------------------------------------------------------------------

/** The face's outward normal and the horizontal direction along it. */
function muralFrame(normal: YardMural['normal']): { n: V3; u: V3 } {
  switch (normal) {
    case 'x+': return { n: [1, 0, 0], u: [0, 0, -1] };
    case 'x-': return { n: [-1, 0, 0], u: [0, 0, 1] };
    case 'z+': return { n: [0, 0, 1], u: [1, 0, 0] };
    case 'z-': return { n: [0, 0, -1], u: [-1, 0, 0] };
  }
}

/** A block side's stripes (critic pass 2, R3): this far apart and this wide along the side, metres, leaning 30°–45°. */
const SIDE_STRIPE = Object.freeze({ pitch: 0.6, width: 0.2 });

/**
 * A riding block's side painted end to end (critic pass 2, R3): a dark field
 * of the outline colour and bold slanted bands of the fill over it, all one
 * slant — the painted ramp side of the brief's reference. Abstract bands,
 * never a letter or a mark.
 */
function sideStripes(painter: Painter, seed: number, halfW: number, halfH: number, paint: Paint): void {
  quad2(painter, [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH], MURAL_LIFT.outline, paint.outline);
  const lean = (hash01(seed, 61) < 0.5 ? -1 : 1) * Math.tan((30 + 15 * hash01(seed, 62)) * Math.PI / 180);
  const rise = 2 * halfH * lean;
  const count = Math.max(1, Math.floor((2 * halfW) / SIDE_STRIPE.pitch));
  const first = -halfW + (2 * halfW - (count - 1) * SIDE_STRIPE.pitch) / 2 - rise / 2;
  for (let i = 0; i < count; i += 1) {
    const u = first + i * SIDE_STRIPE.pitch - SIDE_STRIPE.width / 2;
    quad2(painter, [u, -halfH], [u + SIDE_STRIPE.width, -halfH], [u + SIDE_STRIPE.width + rise, halfH], [u + rise, halfH],
      MURAL_LIFT.fill, paint.fill);
  }
}

/**
 * One painted panel on the plinth — a piece from the shared vocabulary,
 * weathered toward the brick — or a riding block's striped side, weathered
 * toward the concrete.
 */
function mural(out: Buffers, panel: YardMural): void {
  const { n, u } = muralFrame(panel.normal);
  const halfW = panel.width / 2, halfH = panel.height / 2;
  const cy = panel.bottom + halfH;
  // Paint stops at the panel's own box: at the plinth's cap and at the floor.
  const at = (lift: number, [du, dv]: V2): V3 => {
    const cu = Math.max(-halfW, Math.min(halfW, du)), cv = Math.max(-halfH, Math.min(halfH, dv));
    return [panel.x + n[0] * lift + u[0] * cu, cy + cv, panel.z + n[2] * lift + u[2] * cu];
  };
  const painter: Painter = { tri: (a, b, c, lift, colour) => out.tri(at(lift, a), at(lift, b), at(lift, c), n, n, n, colour) };
  if (panel.ground === 'concrete') {
    sideStripes(painter, panel.seed, halfW, halfH, paintOf(panel.fill, panel.outline, FACE_GROUND));
    return;
  }
  paintPiece(painter, panel.seed, halfW, halfH, paintOf(panel.fill, panel.outline, MURAL_GROUND));
}

// ---------------------------------------------------------------------------
// Paint on the straight transition faces (R4)
// ---------------------------------------------------------------------------

/**
 * The face's section from its coping down to the floor: the field's own
 * samples walking `down` from `at`. Thrown on a face that is not a straight
 * (one whose section changes along it), because only there is every cell
 * planar along the wall and the paint can lie on the drawn triangles.
 */
function faceProfile(field: Heightfield, face: YardFaceMural): { cross: number[]; height: number[]; arc: number[] } {
  const sample = (cross: number, along: number): number => {
    const [x, z] = face.along === 'x' ? [along, cross] : [cross, along];
    const column = Math.round((x - field.originX) / field.spacing);
    const row = Math.round((z - field.originZ) / field.spacing);
    return field.heights[row * field.columns + column];
  };
  const cross: number[] = [], height: number[] = [], arc: number[] = [];
  for (let k = 0; k < 64; k += 1) {
    const c = face.at + face.down * k * field.spacing;
    const h = sample(c, face.from);
    for (const along of [face.to, (face.from + face.to) / 2]) {
      if (Math.abs(sample(c, along) - h) > 1e-6) throw new Error(`face paint at ${face.at} is not on a straight`);
    }
    if (k > 1 && Math.abs(h - height[k - 1]) < 1e-6) break;
    arc.push(k === 0 ? 0 : arc[k - 1] + Math.hypot(c - cross[k - 1], h - height[k - 1]));
    cross.push(c);
    height.push(h);
  }
  return { cross, height, arc };
}

/** Clip a polygon in (u, v) to lo ≤ v ≤ hi. */
function clipBand(polygon: readonly V2[], lo: number, hi: number): V2[] {
  const clip = (input: readonly V2[], keep: (p: V2) => number): V2[] => {
    const output: V2[] = [];
    for (let i = 0; i < input.length; i += 1) {
      const p = input[i], q = input[(i + 1) % input.length];
      const dp = keep(p), dq = keep(q);
      if (dp >= 0) output.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return output;
  };
  return clip(clip(polygon, (p) => p[1] - lo), (p) => hi - p[1]);
}

/**
 * One piece of paint on a straight face. Its local `v` runs up the face's
 * own arc length (not plan distance, so a shape is not stretched down a 75°
 * wall); every triangle is cut at the sample rows and each piece laid on its
 * row's planar strip, lifted along the row's normal.
 */
function faceMural(out: Buffers, field: Heightfield, face: YardFaceMural): void {
  const { cross, height, arc } = faceProfile(field, face);
  const last = arc.length - 1;
  const top = face.solid?.top ?? FACE_TOP, foot = arc[last] - (face.solid?.foot ?? FACE_FOOT);
  const halfH = (foot - top) / 2, mid = (foot + top) / 2;
  const halfW = (face.to - face.from) / 2, centre = (face.from + face.to) / 2;
  // Section normals at each sample: the face looks up and toward `down`.
  const segmentNormal = (k: number): V2 => {
    const dc = cross[k + 1] - cross[k], dh = height[k + 1] - height[k];
    const l = Math.hypot(dc, dh) || 1;
    return face.down > 0 ? [-dh / l, dc / l] : [dh / l, -dc / l];
  };
  const nodeNormal: V2[] = cross.map((_, k) => {
    const a = segmentNormal(Math.max(0, Math.min(last - 1, k - 1))), b = segmentNormal(Math.min(last - 1, k));
    const nc = a[0] + b[0], ny = a[1] + b[1], l = Math.hypot(nc, ny) || 1;
    return [nc / l, ny / l];
  });
  // Arc length s grows down the face; local v grows up it.
  const place = ([u, v]: V2, lift: number): { p: V3; n: V3 } => {
    const s = mid - v;
    let k = 0;
    while (k < last - 1 && arc[k + 1] < s) k += 1;
    const t = Math.min(1, Math.max(0, (s - arc[k]) / (arc[k + 1] - arc[k])));
    const c = cross[k] + (cross[k + 1] - cross[k]) * t, h = height[k] + (height[k + 1] - height[k]) * t;
    const nc = nodeNormal[k][0] + (nodeNormal[k + 1][0] - nodeNormal[k][0]) * t;
    const ny = nodeNormal[k][1] + (nodeNormal[k + 1][1] - nodeNormal[k][1]) * t;
    const l = Math.hypot(nc, ny) || 1;
    const along = centre + u, cc = c + (nc / l) * (FACE_LIFT + lift), y = h + (ny / l) * (FACE_LIFT + lift);
    return face.along === 'x'
      ? { p: [along, y, cc], n: [0, ny / l, nc / l] }
      : { p: [cc, y, along], n: [nc / l, ny / l, 0] };
  };
  const painter: Painter = {
    tri(a, b, c, lift, colour) {
      for (let k = 0; k < last; k += 1) {
        // Row k spans arc[k]..arc[k+1], which is v from mid - arc[k+1] to mid - arc[k].
        const piece = clipBand([a, b, c], mid - arc[k + 1], mid - arc[k]);
        if (piece.length < 3) continue;
        const placed = piece.map((point) => place(point, lift));
        for (let i = 1; i + 1 < placed.length; i += 1) {
          out.tri(placed[0].p, placed[i].p, placed[i + 1].p, placed[0].n, placed[i].n, placed[i + 1].n, colour);
        }
      }
    },
  };
  const paint = paintOf(face.fill, face.outline, FACE_GROUND);
  if (face.solid === undefined) {
    paintPiece(painter, face.seed, halfW, halfH, paint);
    return;
  }
  // A painted ride face (critic pass 2, K1/F3): solid from edge to edge,
  // with hard sides and a hard foot. No pieces over it: a cluster of lumps
  // foreshortened up a 20° face read as a figure from the director camera.
  quad2(painter, [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH], MURAL_LIFT.ground, paint.fill);
}

// ---------------------------------------------------------------------------
// The floor: saw-cut joints and stains (R1, A6)
// ---------------------------------------------------------------------------

function floorJoints(out: Buffers, field: Heightfield, floor: YardFloor, lines: readonly CopingRun[], base: RGB): void {
  const colour = scaled(base, JOINT_SHADE);
  const up: V3 = [0, 1, 0];
  const half = floor.jointWidth / 2;
  const step = field.spacing;
  // A stretch of joint is cut only over floor at exactly 0 on both sides of
  // it, and clear of every coping and lip band.
  const clear = (x: number, z: number): boolean => lineDistance(lines, x, z) > FLOOR_CLEAR;
  const lay = (along: 'x' | 'z', line: number, from: number, to: number): void => {
    let start: number | null = null;
    const flush = (end: number): void => {
      if (start !== null && end - start > step * 0.99) {
        const [a, b, c, d]: V3[] = along === 'z'
          ? [[line - half, JOINT_LIFT, start], [line - half, JOINT_LIFT, end], [line + half, JOINT_LIFT, end], [line + half, JOINT_LIFT, start]]
          : [[start, JOINT_LIFT, line + half], [end, JOINT_LIFT, line + half], [end, JOINT_LIFT, line - half], [start, JOINT_LIFT, line - half]];
        out.quad(a, b, c, d, up, colour);
      }
      start = null;
    };
    for (let s = from; s + step <= to + 1e-9; s += step) {
      const m = s + step / 2;
      const [x0, z0, x1, z1] = along === 'z' ? [line - step / 2, m, line + step / 2, m] : [m, line - step / 2, m, line + step / 2];
      const ok = flatCell(field, x0, z0) && flatCell(field, x1, z1) && clear(along === 'z' ? line : m, along === 'z' ? m : line);
      if (ok && start === null) start = s;
      if (!ok) flush(s);
    }
    flush(Math.floor((to - from) / step + 1e-9) * step + from);
  };
  const pitch = floor.jointPitch;
  for (let x = Math.ceil(floor.minX / pitch + 1e-9) * pitch; x < floor.maxX - 0.1; x += pitch) {
    lay('z', x, floor.minZ, floor.maxZ);
  }
  for (let z = Math.ceil(floor.minZ / pitch + 1e-9) * pitch; z < floor.maxZ - 0.1; z += pitch) {
    lay('x', z, floor.minX, floor.maxX);
  }
}

function floorStains(out: Buffers, field: Heightfield, floor: YardFloor, lines: readonly CopingRun[], base: RGB): void {
  const up: V3 = [0, 1, 0];
  let placed = 0;
  for (let attempt = 0; placed < floor.stains && attempt < floor.stains * 8; attempt += 1) {
    const h = (k: number): number => hash01(floor.seed + attempt * 131, k);
    const biased = attempt % 3 === 0 && floor.stainBias.length > 0;
    const rect = biased ? floor.stainBias[Math.floor(h(1) * floor.stainBias.length) % floor.stainBias.length]
      : { x0: floor.minX + 1, x1: floor.maxX - 1, z0: floor.minZ + 1, z1: floor.maxZ - 1 };
    const cx = rect.x0 + (rect.x1 - rect.x0) * h(2), cz = rect.z0 + (rect.z1 - rect.z0) * h(3);
    const pick = h(4);
    const kind = pick < 0.45 ? 'damp' : pick < 0.75 ? 'oil' : 'skid';
    const size = kind === 'skid' ? 0.07 + 0.06 * h(5) : 0.4 + 0.75 * h(5);
    const stretch = kind === 'skid' ? 9 + 6 * h(6) : 1 + 1.2 * h(6);
    const angle = Math.PI * h(7);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const radii = lumps(floor.seed * 3 + attempt, STAIN_POINTS, 0.6, 0.7);
    const rim: V3[] = radii.map((rho, k) => {
      const t = (2 * Math.PI * k) / STAIN_POINTS;
      const du = size * stretch * rho * Math.cos(t), dv = size * rho * Math.sin(t);
      return [cx + du * cos - dv * sin, STAIN_LIFT, cz + du * sin + dv * cos];
    });
    if (![[cx, 0, cz] as V3, ...rim].every(([x, , z]) => flatCell(field, x, z) && lineDistance(lines, x, z) > FLOOR_CLEAR
      && x > floor.minX + 0.3 && x < floor.maxX - 0.3 && z > floor.minZ + 0.3 && z < floor.maxZ - 0.3)) continue;
    const colour = scaled(base, STAIN_TONES[kind]);
    const centre: V3 = [cx, STAIN_LIFT, cz];
    if (kind === 'skid') {
      for (let k = 0; k < STAIN_POINTS; k += 1) out.tri(centre, rim[k], rim[(k + 1) % STAIN_POINTS], up, up, up, colour);
    } else {
      // A damp or oil stain soaks out into the floor (critic pass 2, R6/F8):
      // its rim is the floor's own colour, so it has no edge to read as a
      // disc. A darker core off-centre shades toward its heart, its ring the
      // colour the stain has already faded to there.
      for (let k = 0; k < STAIN_POINTS; k += 1) {
        out.shaded(centre, rim[k], rim[(k + 1) % STAIN_POINTS], up, up, up, colour, base, base);
      }
      const core = scaled(colour, STAIN_CORE.shade);
      const faded: RGB = [0, 1, 2].map((i) => colour[i] + (base[i] - colour[i]) * STAIN_CORE.size) as unknown as RGB;
      const ox = (h(8) - 0.5) * size * 0.4, oz = (h(9) - 0.5) * size * 0.4;
      const coreY = STAIN_LIFT + STAIN_CORE.lift;
      const ring: V3[] = rim.map(([x, , z]) => [cx + ox + (x - cx) * STAIN_CORE.size, coreY, cz + oz + (z - cz) * STAIN_CORE.size]);
      const heart: V3 = [cx + ox, coreY, cz + oz];
      for (let k = 0; k < STAIN_POINTS; k += 1) {
        out.shaded(heart, ring[k], ring[(k + 1) % STAIN_POINTS], up, up, up, core, faded, faded);
      }
    }
    placed += 1;
  }
}

// ---------------------------------------------------------------------------
// Steel toe plates and floodlight masts (critic pass 2, R5/R7)
// ---------------------------------------------------------------------------

/** A box from its centre, three unit axes and half sizes; one colour per face, `faces` by axis then sign. */
function orientedBox(out: Buffers, centre: V3, axes: readonly [V3, V3, V3], half: V3,
  colourOf: (axis: number, sign: 1 | -1) => RGB): void {
  const corner = (su: number, sv: number, sw: number): V3 => [0, 1, 2].map((k) =>
    centre[k] + axes[0][k] * half[0] * su + axes[1][k] * half[1] * sv + axes[2][k] * half[2] * sw) as unknown as V3;
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [1, -1] as const) {
      const [p, q] = [(axis + 1) % 3, (axis + 2) % 3];
      const at = (a: number, b: number): V3 => {
        const s3 = [0, 0, 0];
        s3[axis] = sign; s3[p] = a; s3[q] = b;
        return corner(s3[0], s3[1], s3[2]);
      };
      const n = axes[axis].map((value) => value * sign) as unknown as V3;
      out.quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), n, colourOf(axis, sign));
    }
  }
}

/** A plate's top and its four edges (the floor hides its underside). */
function plate(out: Buffers, piece: YardPlate): void {
  const steel = scaled(linear(COPING_STEEL), PLATE_SHADE);
  const edge = scaled(steel, 0.75);
  const y = piece.thickness;
  const { x0, x1, z0, z1 } = piece;
  out.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], steel);
  out.quad([x0, y, z0], [x0, 0, z0], [x0, 0, z1], [x0, y, z1], [-1, 0, 0], edge);
  out.quad([x1, y, z0], [x1, 0, z0], [x1, 0, z1], [x1, y, z1], [1, 0, 0], edge);
  out.quad([x0, y, z0], [x1, y, z0], [x1, 0, z0], [x0, 0, z0], [0, 0, -1], edge);
  out.quad([x0, y, z1], [x1, y, z1], [x1, 0, z1], [x0, 0, z1], [0, 0, 1], edge);
}

/**
 * A floodlight mast: a tapered pole of `MAST.sides` sides, a crossbar at its
 * head square to the aim, and lamp heads along it tipped down toward the
 * yard, their lenses pale. Scenery only, outside the riding area.
 */
function mast(out: Buffers, piece: YardMast): void {
  const steel = linear(MAST.steel), housing = linear(MAST.housing), lens = linear(MAST.lens);
  const { sides, footRadius, headRadius } = MAST;
  const ring = (y: number, r: number): V3[] => Array.from({ length: sides }, (_, k) => {
    const a = (2 * Math.PI * k) / sides;
    return [piece.x + r * Math.cos(a), y, piece.z + r * Math.sin(a)];
  });
  const foot = ring(0, footRadius), head = ring(piece.height, headRadius);
  for (let k = 0; k < sides; k += 1) {
    const j = (k + 1) % sides;
    const n = (i: number): V3 => {
      const a = (2 * Math.PI * i) / sides;
      return [Math.cos(a), 0, Math.sin(a)];
    };
    out.tri(foot[k], foot[j], head[j], n(k), n(j), n(j), steel);
    out.tri(foot[k], head[j], head[k], n(k), n(j), n(k), steel);
  }
  // Aim in plan, the bar across it, and the heads tipped down toward the yard.
  const ax = piece.aimX - piece.x, az = piece.aimZ - piece.z, al = Math.hypot(ax, az) || 1;
  const aim: V3 = [ax / al, 0, az / al];
  const across: V3 = [-aim[2], 0, aim[0]];
  const up: V3 = [0, 1, 0];
  const barY = piece.height + MAST.bar.size / 2;
  orientedBox(out, [piece.x, barY, piece.z], [across, up, aim],
    [MAST.bar.length / 2, MAST.bar.size / 2, MAST.bar.size / 2], () => steel);
  const cos = Math.cos(MAST.tilt), sin = Math.sin(MAST.tilt);
  // The lens faces along `facing`: the aim, tipped down by the tilt.
  const facing: V3 = [aim[0] * cos, -sin, aim[2] * cos];
  const headUp: V3 = [aim[0] * sin, cos, aim[2] * sin];
  const { width, height, depth } = MAST.head;
  for (let i = 0; i < MAST.heads; i += 1) {
    const t = (i + 0.5) / MAST.heads - 0.5;
    const along = t * (MAST.bar.length - width * 0.4);
    const centre: V3 = [piece.x + across[0] * along + aim[0] * (MAST.bar.size / 2 + depth / 2),
      barY + height * 0.55, piece.z + across[2] * along + aim[2] * (MAST.bar.size / 2 + depth / 2)];
    orientedBox(out, centre, [across, headUp, facing], [width / 2, height / 2, depth / 2],
      (axis, sign) => (axis === 2 && sign === 1 ? lens : housing));
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const CACHE = new WeakMap<LevelPlan, YardSceneryGeometry>();

/** The whole scenery, built once per plan. Null when the plan has neither copings nor panels. */
export function buildYardScenery(plan: LevelPlan): YardSceneryGeometry | null {
  const murals = plan.yardWear?.murals ?? [];
  if (plan.copings === undefined && murals.length === 0) return null;
  const cached = CACHE.get(plan);
  if (cached) return cached;
  const out = new Buffers();
  const field = plan.heightfield;
  const floorBase = linear(plan.palette?.pavement ?? FACE_GROUND);
  const skirt = scaled(floorBase, 1 - (1 - (plan.yardWear?.faceShade ?? 1)) * SKIRT_RIM_SHARE);
  const lines = plan.copings?.runs ?? [];
  // Stains first and joints over them; then everything that stands on the floor.
  const floor = plan.yardWear?.floor;
  if (floor !== undefined) {
    floorStains(out, field, floor, lines, floorBase);
    floorJoints(out, field, floor, lines, floorBase);
  }
  if (plan.copings) copings(out, field, plan.copings, floorBase, skirt);
  for (const panel of murals) mural(out, panel);
  for (const face of plan.yardWear?.faceMurals ?? []) faceMural(out, field, face);
  for (const piece of plan.yardWear?.plates ?? []) plate(out, piece);
  for (const piece of plan.yardWear?.masts ?? []) mast(out, piece);
  const geometry: YardSceneryGeometry = {
    positions: new Float32Array(out.p), normals: new Float32Array(out.n), colours: new Float32Array(out.c),
  };
  CACHE.set(plan, geometry);
  return geometry;
}

/** Exact triangles the scenery mesh draws, for the cost model; 0 when there is none. */
export function yardSceneryTriangles(plan: LevelPlan): number {
  const geometry = buildYardScenery(plan);
  return geometry === null ? 0 : geometry.positions.length / 9;
}
