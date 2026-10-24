/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Quay Quarter's render-only dressing (§45, Claude 2026-10-21).
 *
 * Planted catch beds, kerbs and paving, smooth ramp walls, coping and the
 * market lane's awnings and bunting. Plain triangles with vertex colours in three
 * layers: `ground` lies on the ground and casts nothing, `raised` stands up and
 * casts shadows, and `fine` stands up but casts nothing: railing bars too slim
 * for a shadow-map texel, whose shadows only crawled (2026-10-22). The render
 * draws `fine` in the ground layer's mesh, so it costs no draw call of its own.
 * **No collider, surface or ground query reads any of it**: the
 * beds still drag through `softBodies`, the stall counters and walls are still
 * the plan's own boxes, and every slab rides as the pavement under it.
 *
 * The same pure builder draws it (`render/quayScenery.ts`) and prices it
 * (`level/renderBudget.ts`), so the cost model counts exactly what is drawn.
 */
import type { BoxCollider, LevelPlan } from './plan.ts';
import { fieldHeightAt } from './buildPlan.ts';
import { materialAppearance } from '../data/surfaces.ts';

export interface QuayRect { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
/**
 * One straight run of see-through railing standing on the boxes it replaces
 * (2026-10-22). Those boxes are `drawn: false` and keep their footprint and
 * height, so what stops a wheel is exactly what is drawn: the railing's face is
 * the boxes' riding-side face, every post and rail lies behind it, the plinth
 * fills the boxes' footprint, and the top rail is the boxes' top.
 */
export interface QuayRailing {
  /** The railing's face, end to end, on the riding side of its boxes. */
  readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number;
  /** Unit normal from the face into the footprint, away from the riders. */
  readonly nx: number; readonly nz: number;
  /** The plinth (island) or upstand (roof): the boxes' footprint, to `top`. */
  readonly plinth: QuayRect & { readonly top: number };
  /** The ground or deck the run stands on. */
  readonly base: number;
  /** Rail tops above `base`, ascending; the last is the boxes' top. */
  readonly rails: readonly number[];
  readonly look: 'harbour' | 'roof';
}
/**
 * Roof-deck route paint, ridden toward +z on both jump decks (2026-10-22): a
 * run-up lane to each gap, a hazard band on the takeoff edge, a white edge
 * and an outlined landing box beyond it, and the final deck's lane to the ramp.
 */
export interface QuayRoofPaint {
  /** Deck top. */
  readonly y: number;
  /** Railing face to railing face across the jump decks. */
  readonly x0: number; readonly x1: number;
  /** The run-up lane's centre and half width (outside the pad's dome foot). */
  readonly laneX: number; readonly laneHalf: number;
  /** Half width of the coated strip down the lane's middle; the rest of the lane is bare deck. */
  readonly stripHalf: number;
  /** Lane starts at `from`; its strip stops at the pad's dome foot `pad`; `lip` is the takeoff edge, `landing` the far deck's edge, `zone` the landing box's far end. */
  readonly gaps: readonly { readonly from: number; readonly pad: number; readonly lip: number; readonly landing: number; readonly zone: number }[];
  /** The final deck's lane to the down ramp, as a centreline. */
  readonly route: readonly { readonly x: number; readonly z: number }[];
  readonly routeHalf: number;
}
export interface QuayScenerySpec {
  readonly revision: 'quay-scenery-r2';
  readonly railings: readonly QuayRailing[];
  readonly roofPaint?: QuayRoofPaint;
  /** Each bed's planted outline (the union of its soft bodies) and its ground: 0 samples the field. */
  readonly beds: readonly (QuayRect & { readonly y: number })[];
  /** Stall counters and the side each serves: +1 faces +X, −1 faces −X. */
  readonly stalls: readonly (QuayRect & { readonly facing: 1 | -1 })[];
  /** The ring road's centreline as a rounded rectangle, and the avenue along x = 0. */
  readonly ring: { readonly halfX: number; readonly halfZ: number; readonly radius: number; readonly halfWidth: number };
  readonly avenue: { readonly halfWidth: number; readonly halfLength: number };
  /** Where kerbs and edge lines open: crossings and junction mouths. */
  readonly kerbGaps: readonly QuayRect[];
  /** Shop awnings: a run of wall from (x0,z0) to (x1,z1) whose outward normal is (nx,nz). */
  readonly awnings: readonly { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number; readonly nx: number; readonly nz: number }[];
  /** Where paving stops: launch pads and other painted features keep their own ground. */
  readonly paveHoles: readonly { readonly x: number; readonly z: number; readonly radius: number }[];
}
export interface SceneryLayer { readonly positions: Float32Array; readonly normals: Float32Array; readonly colours: Float32Array }
export interface QuaySceneryGeometry { readonly ground: SceneryLayer; readonly raised: SceneryLayer; readonly fine: SceneryLayer }

type V = readonly [number, number, number];
type RGB = readonly [number, number, number];

const lin = (hex: number): RGB => {
  const f = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const hash = (a: number, b: number, s: number): number => { const h = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => t * t * (3 - 2 * t);
function noise(x: number, z: number, s: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

class Layer {
  readonly p: number[] = []; readonly n: number[] = []; readonly c: number[] = [];
  tri(a: V, b: V, d: V, ca: RGB, cb: RGB = ca, cd: RGB = ca): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (!(l > 1e-9)) return;
    nx /= l; ny /= l; nz /= l;
    this.p.push(...a, ...b, ...d); this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz); this.c.push(...ca, ...cb, ...cd);
  }
  /** A triangle with its own vertex normals: rounded shading for plants. */
  triN(a: V, b: V, d: V, na: V, nb: V, nd: V, ca: RGB, cb: RGB = ca, cd: RGB = ca): void {
    this.p.push(...a, ...b, ...d); this.n.push(...na, ...nb, ...nd); this.c.push(...ca, ...cb, ...cd);
  }
  /** Counter-clockwise from the side the face is seen from. */
  quad(a: V, b: V, c: V, d: V, ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = ca): void { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  /** An axis-aligned box without its underside. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, top: RGB, side: RGB = top): void {
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top);
    const lo = shade(side, 0.82);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], lo, lo, side, side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], lo, lo, side, side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], lo, lo, side, side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], lo, lo, side, side);
  }
  done(): SceneryLayer { return { positions: new Float32Array(this.p), normals: new Float32Array(this.n), colours: new Float32Array(this.c) }; }
}

// A twenty-face blob: the unit icosahedron every plant and piece of fruit is made of.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V: V[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]]
  .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as V; });
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]] as const;
/** A lumpy blob shading from `base` at `y0` to `top` at `y1`, smooth-shaded so
 * it reads as a rounded mass rather than a crystal. */
function blob(L: Layer, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, base: RGB, top: RGB, y0: number, y1: number, seed: number): void {
  const v = ICO_V.map(([x, y, z], i): V => { const k = 0.9 + hash(seed, i, 3) * 0.2; return [cx + x * rx * k, cy + y * ry * k, cz + z * rz * k]; });
  // Normals lean toward the sky: foliage is lit from above and through.
  const n = ICO_V.map(([x, y, z]): V => { const ny = y * 0.6 + 0.55, l = Math.hypot(x * 0.8, ny, z * 0.8); return [x * 0.8 / l, ny / l, z * 0.8 / l]; });
  const colour = v.map(p => shade(mix(base, top, clamp01((p[1] - y0) / Math.max(1e-3, y1 - y0))), 0.96 + hash(seed, p[0], 5) * 0.08));
  for (const [a, b, c] of ICO_F) L.triN(v[a], v[b], v[c], n[a], n[b], n[c], colour[a], colour[b], colour[c]);
}
/** A five-petal flower head facing up, its eye yellow. */
function flower(L: Layer, x: number, y: number, z: number, r: number, petal: RGB, seed: number): void {
  const up: V = [0, 1, 0], eye = lin(0xf7d35a), turn = hash(seed, x, 7) * Math.PI;
  for (let k = 0; k < 5; k++) {
    const a = turn + (k / 5) * Math.PI * 2;
    // Wound counter-clockwise from above, so the double-sided material keeps the upward normal.
    L.triN([x, y + 0.01, z], [x + Math.cos(a + 0.36) * r, y, z + Math.sin(a + 0.36) * r], [x + Math.cos(a - 0.36) * r, y, z + Math.sin(a - 0.36) * r], up, up, up, eye, petal, petal);
  }
}

const C = {
  mulchDark: lin(0x4a3020), mulchMid: lin(0x6b4a32), mulchLight: lin(0x7d5a40), chip: lin(0x9a7450),
  edgeTop: lin(0xd2c8b2), edgeSide: lin(0xa89d86),
  kerbTop: lin(0xd6d0c4), kerbFace: lin(0xb3ab9c), gutter: lin(0x4a4d52), line: lin(0xc9c7bf),
  slab: lin(0xb6afa2), flag: lin(0xbfb39b), flagDark: lin(0xa89a80), panel: lin(0xa19c92), granite: lin(0x8e8a84),
  pitSoil: lin(0x3b2e22), pitFrame: lin(0x9b958a),
  wall: lin(0xaaa398), wallFoot: lin(0x7a746b), coping: lin(0xd4ccb8), brickWall: lin(0xb06a50),
  wood: lin(0x8a6440), pole: lin(0x3d4a5c), string: lin(0x2a2a2a),
};
const GREENS: readonly (readonly [RGB, RGB])[] = [
  [lin(0x41693a), lin(0x8fb85a)], [lin(0x3f6b5a), lin(0x7fb08a)], [lin(0x56743a), lin(0xa2c060)], [lin(0x4a7340), lin(0x86b356)],
];
const COVER: readonly [RGB, RGB] = [lin(0x4b7a3c), lin(0x8ab65c)];
const GRASS: readonly [RGB, RGB] = [lin(0x5c7a34), lin(0xb2c46a)];
const FLOWERS = [0xe8577a, 0xf2c230, 0xf4f1e8, 0xb49ae8, 0xd9572e, 0xf07aa0].map(lin);
const AWNINGS = [[0xc8453a, 0xf2ece0], [0x2f8f8a, 0xf2ece0], [0xe0a83a, 0xf6efe0], [0x3b6db3, 0xf2ece0], [0x5d9a45, 0xf3eed8]].map(p => p.map(lin));
const PENNANTS = [0xd8433b, 0xf2c230, 0x2f9c95, 0xf4f1e8, 0xe8833a, 0x3f73c4].map(lin);
const PRODUCE = [0xc8332b, 0xe8833a, 0x6a9a3a, 0xf2c230, 0x6b3d7a, 0xd9584f].map(lin);

function inRect(r: QuayRect, x: number, z: number, m = 0): boolean { return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; }

/** Signed distance from the ring's centreline, positive outside it. */
function ringDistance(spec: QuayScenerySpec, x: number, z: number): number {
  const { halfX, halfZ, radius } = spec.ring, qx = Math.abs(x) - (halfX - radius), qz = Math.abs(z) - (halfZ - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius;
}
function isRoad(spec: QuayScenerySpec, x: number, z: number, margin = 0): boolean {
  return Math.abs(ringDistance(spec, x, z)) < spec.ring.halfWidth + margin
    || (Math.abs(x) < spec.avenue.halfWidth + margin && Math.abs(z) < spec.avenue.halfLength);
}

/** The ground a decal lies on: the field, never a collider. */
function groundOf(plan: LevelPlan): (x: number, z: number) => number {
  return (x, z) => fieldHeightAt(plan.heightfield, plan.surround, x, z);
}

function surfaceAt(plan: LevelPlan, x: number, z: number): string | undefined {
  const f = plan.heightfield, cols = f.columns - 1;
  const i = Math.floor((x - f.originX) / f.spacing), j = Math.floor((z - f.originZ) / f.spacing);
  if (i < 0 || j < 0 || i >= cols) return undefined;
  return f.surfaces[i + j * cols];
}

// -- Beds -------------------------------------------------------------------

function bed(G: Layer, R: Layer, b: QuayScenerySpec['beds'][number], index: number, ground: (x: number, z: number) => number): void {
  const h = (x: number, z: number): number => (b.y || ground(x, z));
  const cell = 0.5, nx = Math.max(1, Math.ceil((b.x1 - b.x0) / cell)), nz = Math.max(1, Math.ceil((b.z1 - b.z0) / cell));
  const dx = (b.x1 - b.x0) / nx, dz = (b.z1 - b.z0) / nz;
  const soil = (x: number, z: number): RGB => {
    const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    const n = noise(x * 0.7, z * 0.7, 11 + index) * 0.65 + noise(x * 2.3, z * 2.3, 17) * 0.35;
    let c = n < 0.5 ? mix(C.mulchDark, C.mulchMid, n * 2) : mix(C.mulchMid, C.mulchLight, (n - 0.5) * 2);
    if (hash(Math.round(x * 4), Math.round(z * 4), 23) > 0.93) c = C.chip;
    return mix(C.mulchDark, c, clamp01(edge / 0.4) * 0.7 + 0.3);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = b.x0 + i * dx, xb = xa + dx, za = b.z0 + j * dz, zb = za + dz;
    G.quad([xa, h(xa, za) + 0.03, za], [xa, h(xa, zb) + 0.03, zb], [xb, h(xb, zb) + 0.03, zb], [xb, h(xb, za) + 0.03, za],
      soil(xa, za), soil(xa, zb), soil(xb, zb), soil(xb, za));
  }
  // Edging: a low stone kerb ring, chamfered outward, following the ground.
  const W = 0.22, CH = 0.08, TOP = 0.09;
  const side = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number): void => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, n = Math.max(1, Math.round(len));
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      const g0 = h(x0, z0), g1 = h(x1, z1), t = shade(C.edgeTop, 0.95 + hash(x0, z0, 29) * 0.1);
      // Mitred at the bed's corners: the outer edges run on past each end.
      const s0 = k === 0 ? 1 : 0, s1 = k === n - 1 ? 1 : 0;
      const i0: V = [x0, g0 + TOP, z0], i1: V = [x1, g1 + TOP, z1];
      const o0: V = [x0 + ox * W - ux * W * s0, g0 + TOP, z0 + oz * W - uz * W * s0], o1: V = [x1 + ox * W + ux * W * s1, g1 + TOP, z1 + oz * W + uz * W * s1];
      const f0: V = [x0 + ox * (W + CH) - ux * (W + CH) * s0, g0 + 0.005, z0 + oz * (W + CH) - uz * (W + CH) * s0];
      const f1: V = [x1 + ox * (W + CH) + ux * (W + CH) * s1, g1 + 0.005, z1 + oz * (W + CH) + uz * (W + CH) * s1];
      G.quad(i0, i1, o1, o0, t); G.quad(o0, o1, f1, f0, C.edgeSide);
      G.quad([x1, g1 + 0.03, z1], [x0, g0 + 0.03, z0], i0, i1, shade(C.edgeSide, 0.8));
    }
  };
  side(b.x0, b.z0, b.x0, b.z1, -1, 0); side(b.x0, b.z1, b.x1, b.z1, 0, 1); side(b.x1, b.z1, b.x1, b.z0, 1, 0); side(b.x1, b.z0, b.x0, b.z0, 0, -1);
  // Planting in drifts: jittered, never in rows, two flower colours per bed.
  const flowers = [FLOWERS[index % FLOWERS.length], FLOWERS[(index * 2 + 3) % FLOWERS.length]];
  const step = 0.82;
  for (let x = b.x0 + 0.35; x < b.x1 - 0.2; x += step) for (let z = b.z0 + 0.35; z < b.z1 - 0.2; z += step) {
    const s = x * 13.1 + z * 7.7 + index, r = hash(x, z, 41);
    const px = Math.min(b.x1 - 0.3, Math.max(b.x0 + 0.3, x + (hash(x, z, 43) - 0.5) * 0.6));
    const pz = Math.min(b.z1 - 0.3, Math.max(b.z0 + 0.3, z + (hash(x, z, 47) - 0.5) * 0.6));
    const g = h(px, pz), drift = noise(px * 0.35, pz * 0.35, 53 + index);
    if (r < 0.08) continue;
    if (drift > 0.42 && r < 0.78) {
      // A shrub: three to five lumps, darker at the foot, sunlit on top.
      const [base, top] = GREENS[Math.floor(hash(px, pz, 59) * GREENS.length)], lumps = 3 + Math.floor(hash(px, pz, 61) * 3);
      // Low enough to keep the wheel in sight; taller accents only at the bed ends.
      const along = (b.x1 - b.x0 > b.z1 - b.z0) ? Math.min(px - b.x0, b.x1 - px) : Math.min(pz - b.z0, b.z1 - pz);
      const size = along < 1.6 && hash(px, pz, 69) > 0.4 ? 1.05 + hash(px, pz, 67) * 0.25 : 0.62 + hash(px, pz, 67) * 0.22, y1 = g + 0.3 + 0.36 * size;
      for (let k = 0; k < lumps; k++) {
        const a = hash(s, k, 71) * Math.PI * 2, d = k === 0 ? 0 : 0.2 + hash(s, k, 73) * 0.2, rr = (0.24 + hash(s, k, 79) * 0.14) * size;
        blob(R, px + Math.cos(a) * d, g + rr * 0.7 + (k === 0 ? 0.1 * size : hash(s, k, 83) * 0.08), pz + Math.sin(a) * d, rr, rr * 0.75, rr, base, top, g, y1, s + k);
      }
    } else if (r > 0.9) {
      // A grass tuft, its blades leaning out.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + hash(s, k, 89), lean = 0.12 + hash(s, k, 97) * 0.1, tall = 0.32 + hash(s, k, 101) * 0.26;
        const bx = px + Math.cos(a) * 0.04, bz = pz + Math.sin(a) * 0.04, w = 0.035;
        R.tri([bx - Math.sin(a) * w, g + 0.02, bz + Math.cos(a) * w], [bx + Math.sin(a) * w, g + 0.02, bz - Math.cos(a) * w],
          [bx + Math.cos(a) * lean, g + tall, bz + Math.sin(a) * lean], GRASS[0], GRASS[0], GRASS[1]);
      }
    } else {
      // Ground cover, often in flower.
      const rr = 0.36 + hash(px, pz, 103) * 0.18;
      blob(R, px, g + 0.09, pz, rr, 0.2, rr * 0.9, COVER[0], COVER[1], g, g + 0.3, s);
      if (hash(px, pz, 107) > 0.2) {
        const colour = flowers[hash(px, pz, 109) > 0.5 ? 1 : 0], count = 4 + Math.floor(hash(px, pz, 113) * 5);
        for (let k = 0; k < count; k++) {
          const a = hash(s, k, 127) * Math.PI * 2, d = hash(s, k, 131) * rr * 0.75, fx = px + Math.cos(a) * d, fz = pz + Math.sin(a) * d;
          flower(R, fx, g + 0.36 - d * 0.12, fz, 0.085 + hash(s, k, 137) * 0.035, colour, s + k);
        }
      }
    }
  }
}

// -- Kerbs, edge lines and paving -------------------------------------------

/** Points every metre along a rounded rectangle, with the outward normal. */
function roundedRect(halfX: number, halfZ: number, r: number): { x: number; z: number; nx: number; nz: number }[] {
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  const straight = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number): void => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0)));
    for (let k = 0; k < n; k++) out.push({ x: x0 + (x1 - x0) * k / n, z: z0 + (z1 - z0) * k / n, nx, nz });
  };
  const arc = (cx: number, cz: number, a0: number): void => {
    const n = Math.max(2, Math.round(r * Math.PI / 2));
    for (let k = 0; k < n; k++) { const a = a0 + (Math.PI / 2) * k / n; out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) }); }
  };
  const ix = halfX - r, iz = halfZ - r;
  straight(halfX, -iz, halfX, iz, 1, 0); arc(ix, iz, 0);
  straight(ix, halfZ, -ix, halfZ, 0, 1); arc(-ix, iz, Math.PI / 2);
  straight(-halfX, iz, -halfX, -iz, -1, 0); arc(-ix, -iz, Math.PI);
  straight(-ix, -halfZ, ix, -halfZ, 0, -1); arc(ix, -iz, Math.PI * 1.5);
  out.push({ ...out[0] });
  return out;
}

/** A kerb along a polyline. `side` is the sign of the normal that points away from the road. */
function kerbLine(G: Layer, pts: { x: number; z: number; nx: number; nz: number }[], side: 1 | -1, spec: QuayScenerySpec, ground: (x: number, z: number) => number): void {
  const KW = 0.3, KH = 0.06, GW = 0.28, LINE = 0.12, LINE_IN = 0.45;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (spec.kerbGaps.some(g => inRect(g, mx, mz))) continue;
    const ga = ground(a.x, a.z), gb = ground(b.x, b.z);
    const off = (p: typeof a, d: number, y: number): V => [p.x + p.nx * side * d, y, p.z + p.nz * side * d];
    const t = shade(C.kerbTop, 0.94 + hash(a.x, a.z, 137) * 0.1);
    // The kerb's face, its top, the gutter and the edge line. Both layers draw
    // double-sided, so a face's winding only decides which way its normal faces.
    const q = (p0: V, p1: V, p2: V, p3: V, c: RGB): void => G.quad(p0, p1, p2, p3, c);
    q(off(b, 0, gb + 0.004), off(a, 0, ga + 0.004), off(a, 0, ga + KH), off(b, 0, gb + KH), C.kerbFace);
    q(off(b, 0, gb + KH), off(a, 0, ga + KH), off(a, KW, ga + KH), off(b, KW, gb + KH), t);
    q(off(b, -GW, gb + 0.006), off(a, -GW, ga + 0.006), off(a, 0, ga + 0.006), off(b, 0, gb + 0.006), C.gutter);
    q(off(b, -LINE_IN - LINE, gb + 0.006), off(a, -LINE_IN - LINE, ga + 0.006), off(a, -LINE_IN, ga + 0.006), off(b, -LINE_IN, gb + 0.006), C.line);
  }
}

interface Blocker { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
function blockers(plan: LevelPlan): Blocker[] {
  const out: Blocker[] = [];
  const add = (c: BoxCollider): void => {
    const top = c.centre.y + c.halfExtents.y; if (top < 0.05 || Math.max(c.halfExtents.x, c.halfExtents.z) < 0.7) return;
    const cs = Math.abs(Math.cos(c.rotationY)), sn = Math.abs(Math.sin(c.rotationY));
    const hx = c.halfExtents.x * cs + c.halfExtents.z * sn, hz = c.halfExtents.x * sn + c.halfExtents.z * cs;
    out.push({ x0: c.centre.x - hx, x1: c.centre.x + hx, z0: c.centre.z - hz, z1: c.centre.z + hz });
  };
  for (const s of plan.segments) for (const c of s.colliders) add(c);
  for (const p of plan.props ?? []) if (p.kind === 'building' && p.size) {
    const swap = Math.abs(Math.sin(p.rotationY)) > 0.5, hx = (swap ? p.size.z : p.size.x) / 2, hz = (swap ? p.size.x : p.size.z) / 2;
    out.push({ x0: p.position.x - hx, x1: p.position.x + hx, z0: p.position.z - hz, z1: p.position.z + hz });
  }
  return out;
}

/** Rectangles bucketed on a coarse grid, so a point asks only its neighbours. */
function rectIndex(rects: readonly Blocker[], margin: number): (x: number, z: number) => boolean {
  const cell = 8, buckets = new Map<string, Blocker[]>();
  for (const r of rects) for (let i = Math.floor((r.x0 - margin) / cell); i <= Math.floor((r.x1 + margin) / cell); i++)
    for (let j = Math.floor((r.z0 - margin) / cell); j <= Math.floor((r.z1 + margin) / cell); j++)
      (buckets.get(`${i},${j}`) ?? buckets.set(`${i},${j}`, []).get(`${i},${j}`)!).push(r);
  return (x, z) => (buckets.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? [])
    .some(r => x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin);
}

type Style = 'promenade' | 'sidewalk' | 'yard';
function paving(G: Layer, plan: LevelPlan, spec: QuayScenerySpec, ground: (x: number, z: number) => number): void {
  const blocked = rectIndex(blockers(plan), 0.05);
  const nearBuilding = rectIndex((plan.props ?? []).filter(p => p.kind === 'building' && p.size).map(p => {
    const swap = Math.abs(Math.sin(p.rotationY)) > 0.5, hx = (swap ? p.size!.z : p.size!.x) / 2, hz = (swap ? p.size!.x : p.size!.z) / 2;
    return { x0: p.position.x - hx, x1: p.position.x + hx, z0: p.position.z - hz, z1: p.position.z + hz };
  }), 3.2);
  const styleAt = (x: number, z: number): Style => {
    const d = ringDistance(spec, x, z), w = spec.ring.halfWidth;
    if (d > w) return 'promenade';
    if (d > -w - 3 || (Math.abs(x) < spec.avenue.halfWidth + 3 && Math.abs(z) < spec.avenue.halfLength) || nearBuilding(x, z)) return 'sidewalk';
    return 'yard';
  };
  const paveable = (x: number, z: number): boolean => {
    if (isRoad(spec, x, z, 0.32)) return false;
    if (surfaceAt(plan, x, z) !== 'pavement') return false;
    if (Math.abs(ground(x, z)) > 0.02) return false;
    if (spec.beds.some(b => inRect(b, x, z, 0.35))) return false;
    if (spec.paveHoles.some(h => Math.hypot(x - h.x, z - h.z) < h.radius)) return false;
    return !blocked(x, z);
  };
  const xs = [-119.5, 119.5], zs = [-89.5, 89.5];
  const grids: Record<Style, { w: number; d: number; gap: number; mortar: RGB; colour: (i: number, j: number) => RGB; y: number }> = {
    promenade: { w: 1.4, d: 1.1, gap: 0.045, y: 0.008, mortar: shade(C.flag, 0.74), colour: (i, j) => shade(hash(i, j, 151) > 0.82 ? C.flagDark : C.flag, 0.92 + hash(i, j, 157) * 0.14) },
    sidewalk: { w: 1.2, d: 1.2, gap: 0.04, y: 0.009, mortar: shade(C.slab, 0.76), colour: (i, j) => shade(C.slab, 0.93 + hash(i, j, 163) * 0.12) },
    yard: { w: 2.0, d: 2.0, gap: 0.05, y: 0.007, mortar: shade(C.panel, 0.72), colour: (i, j) => shade(C.panel, 0.92 + hash(i, j, 167) * 0.12) },
  };
  for (const style of ['promenade', 'sidewalk', 'yard'] as const) {
    const g = grids[style], corners = new Map<number, boolean>();
    const corner = (i: number, j: number): boolean => {
      const key = (i + 1000) * 4096 + (j + 1000);
      let ok = corners.get(key);
      if (ok === undefined) corners.set(key, ok = paveable(i * g.w, j * g.d));
      return ok;
    };
    for (let i = Math.floor(xs[0] / g.w); i * g.w < xs[1]; i++) for (let j = Math.floor(zs[0] / g.d); j * g.d < zs[1]; j++) {
      const x0 = i * g.w + g.gap / 2, x1 = (i + 1) * g.w - g.gap / 2, z0 = j * g.d + g.gap / 2, z1 = (j + 1) * g.d - g.gap / 2;
      if (styleAt((x0 + x1) / 2, (z0 + z1) / 2) !== style) continue;
      // Grid corners are shared by four slabs: each is tested once per style.
      if (!corner(i, j) || !corner(i + 1, j) || !corner(i, j + 1) || !corner(i + 1, j + 1) || !paveable((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      const c = g.colour(i, j), m = shade(g.mortar, 0.96 + hash(i, j, 169) * 0.06), u0 = x0 - g.gap / 2, u1 = x1 + g.gap / 2, v0 = z0 - g.gap / 2, v1 = z1 + g.gap / 2;
      // A mortar bed under each slab: joints read as mortar, never as the asphalt below.
      G.quad([u0, 0.003, v0], [u0, 0.003, v1], [u1, 0.003, v1], [u1, 0.003, v0], m);
      G.quad([x0, g.y, z0], [x0, g.y, z1], [x1, g.y, z1], [x1, g.y, z0], c, shade(c, 0.97), c, shade(c, 1.02));
    }
  }
  // A granite band at the foot of the quay wall finishes the promenade's edge.
  const band = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number): void => {
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 1.2);
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      if (spec.paveHoles.some(h => Math.hypot((x0 + x1) / 2 - h.x, (z0 + z1) / 2 - h.z) < h.radius)) continue;
      const c = shade(C.granite, 0.92 + hash(x0, z0, 173) * 0.14), y = 0.012;
      const p = [[x0, z0], [x1, z1], [x1 + ox * 0.9, z1 + oz * 0.9], [x0 + ox * 0.9, z0 + oz * 0.9]].map(([x, z]) => [x, y, z] as V);
      G.quad(p[0], p[1], p[2], p[3], c);
    }
  };
  band(-117.95, -87.95, -117.95, 87.95, 1, 0); band(117.95, 87.95, 117.95, -87.95, -1, 0);
  band(-117.95, 87.95, 117.95, 87.95, 0, -1); band(117.95, -87.95, -117.95, -87.95, 0, 1);
  // Street trees stand in pits with a stone frame, not in the asphalt.
  for (const p of plan.props ?? []) {
    if (p.kind !== 'broadleafTree' || Math.abs(p.position.y) > 0.05 || Math.abs(p.position.x) > 118 || Math.abs(p.position.z) > 88) continue;
    const { x, z } = p.position, s = 0.75, f = 0.12, y = 0.016;
    G.quad([x - s, y, z - s], [x - s, y, z + s], [x + s, y, z + s], [x + s, y, z - s], C.pitSoil);
    for (const [ax, az, bx, bz] of [[-1, -1, -1, 1], [-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1]] as const) {
      const ox = ax === bx ? ax : 0, oz = az === bz ? az : 0;
      const p0: V = [x + ax * s, y + 0.002, z + az * s], p1: V = [x + bx * s, y + 0.002, z + bz * s];
      const p2: V = [x + bx * s + ox * f, y + 0.002, z + bz * s + oz * f], p3: V = [x + ax * s + ox * f, y + 0.002, z + az * s + oz * f];
      G.tri(p0, p1, p2, C.pitFrame); G.tri(p0, p2, p3, C.pitFrame);
    }
  }
}

// -- Walls: smooth ramp sides and coping ------------------------------------

interface Step { z0: number; z1: number; top: number; bottom: number }
/** Stepped side walls: one-metre (or 0.8 m) boxes in a column with monotonic tops. */
function steppedWalls(plan: LevelPlan): { x0: number; x1: number; steps: Step[] }[] {
  const groups = new Map<string, Step[]>();
  for (const s of plan.segments) for (const c of s.colliders) {
    const hz = c.halfExtents.z, hx = c.halfExtents.x, top = c.centre.y + c.halfExtents.y;
    if (c.rotationY !== 0 || hx > 0.3 || hx < 0.1 || !(Math.abs(hz - 0.5) < 1e-6 || Math.abs(hz - 0.4) < 1e-6) || top < 0.85) continue;
    const key = `${c.centre.x.toFixed(3)}|${hx.toFixed(3)}|${hz.toFixed(3)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ z0: c.centre.z - hz, z1: c.centre.z + hz, top, bottom: c.centre.y - c.halfExtents.y });
  }
  const out: { x0: number; x1: number; steps: Step[] }[] = [];
  for (const [key, steps] of groups) {
    if (steps.length < 8) continue;
    steps.sort((a, b) => a.z0 - b.z0);
    const [x, hx] = key.split('|').map(Number);
    out.push({ x0: x - hx, x1: x + hx, steps });
  }
  return out;
}

/** A wall's coping: its depth, and how far it stands proud of a deck guard's faces and of the island edge's. */
export const COPING = Object.freeze({ depth: 0.08, wall: 0.07, edge: 0.12 });
/** Z spans along a wall's −x and +x faces where another coped wall stands against it. */
interface Joints { readonly neg: readonly (readonly [number, number])[]; readonly pos: readonly (readonly [number, number])[] }
const NO_JOINTS: Joints = { neg: [], pos: [] };
const meets = (spans: Joints['neg'], z: number): boolean => spans.some(([a, b]) => z > a && z < b);

function smoothWall(R: Layer, w: { x0: number; x1: number; steps: Step[] }, brick: boolean, joints: Joints = NO_JOINTS): void {
  const s = w.steps, first = s[0], last = s[s.length - 1];
  const slope = (last.top - first.top) / ((last.z0 + last.z1) / 2 - (first.z0 + first.z1) / 2);
  let c = -Infinity;
  for (const st of s) c = Math.max(c, st.top - slope * st.z0, st.top - slope * st.z1);
  const h = (z: number): number => slope * z + c, e = 0.015, x0 = w.x0 - e, x1 = w.x1 + e, za = first.z0 - e, zb = last.z1 + e;
  const panels = Math.max(1, Math.round((zb - za) / 3));
  for (let k = 0; k < panels; k++) {
    const z0 = za + (zb - za) * k / panels, z1 = za + (zb - za) * (k + 1) / panels, tone = shade(brick ? C.brickWall : C.wall, k % 2 ? 0.96 : 1.03);
    R.quad([x1, 0, z0], [x1, h(z0), z0], [x1, h(z1), z1], [x1, 0, z1], C.wallFoot, tone, tone, C.wallFoot);
    R.quad([x0, 0, z1], [x0, h(z1), z1], [x0, h(z0), z0], [x0, 0, z0], C.wallFoot, tone, tone, C.wallFoot);
  }
  R.quad([x0, 0, za], [x0, h(za), za], [x1, h(za), za], [x1, 0, za], C.wallFoot, C.wall, C.wall, C.wallFoot);
  R.quad([x1, 0, zb], [x1, h(zb), zb], [x0, h(zb), zb], [x0, 0, zb], C.wallFoot, C.wall, C.wall, C.wallFoot);
  // Sloped coping, a hand's width proud of each face; where another coped wall
  // stands against a face it stops at the joint, so the sloped and the flat
  // coping never cross at a shallow angle (2026-10-23).
  const o = 0.06, t = 0.1, side = shade(C.coping, 0.85);
  // A joint that ends at the wall's own end runs to its drawn end, 15 mm on.
  const snap = (z: number): number => Math.abs(z - za) <= 2 * e ? za : Math.abs(z - zb) <= 2 * e ? zb : z;
  const neg = joints.neg.map(([a, b]) => [snap(a), snap(b)] as const), pos = joints.pos.map(([a, b]) => [snap(a), snap(b)] as const);
  const cuts = [...new Set([za, zb, ...[...neg, ...pos].flat().filter(z => z > za && z < zb)])].sort((a, b) => a - b);
  const edge = (z: number): [number, number] => [meets(neg, z) ? w.x0 : x0 - o, meets(pos, z) ? w.x1 : x1 + o];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const p = cuts[k], q = cuts[k + 1], [cx0, cx1] = edge((p + q) / 2);
    R.quad([cx0, h(p) + t, p], [cx0, h(q) + t, q], [cx1, h(q) + t, q], [cx1, h(p) + t, p], C.coping);
    R.quad([cx1, h(p), p], [cx1, h(p) + t, p], [cx1, h(q) + t, q], [cx1, h(q), q], side);
    R.quad([cx0, h(q), q], [cx0, h(q) + t, q], [cx0, h(p) + t, p], [cx0, h(p), p], side);
    if (k === 0) continue;
    // The step where the coping's width changes, facing the narrower piece.
    const [b0, b1] = edge((cuts[k - 1] + p) / 2), y0 = h(p), y1 = h(p) + t;
    for (const [was, now, narrowBefore] of [[b0, cx0, b0 > cx0], [b1, cx1, b1 < cx1]] as const) {
      if (was === now) continue;
      const lo = Math.min(was, now), hi = Math.max(was, now);
      if (narrowBefore) R.quad([lo, y0, p], [lo, y1, p], [hi, y1, p], [hi, y0, p], side);
      else R.quad([hi, y0, p], [hi, y1, p], [lo, y1, p], [lo, y0, p], side);
    }
  }
}

/** A coping cap along the top of a long thin wall box; `joints` end its overhang where a coped wall stands against it. */
function coping(R: Layer, c: BoxCollider, over: number, joints: Joints = NO_JOINTS): void {
  const top = c.centre.y + c.halfExtents.y, alongX = c.halfExtents.x > c.halfExtents.z;
  const len = alongX ? c.halfExtents.x : c.halfExtents.z, half = (alongX ? c.halfExtents.z : c.halfExtents.x) + over, thin = half - over;
  const n = Math.max(1, Math.round(len * 2 / 2.4));
  for (let k = 0; k < n; k++) {
    const a = -len + 2 * len * k / n, b = -len + 2 * len * (k + 1) / n, tone = shade(C.coping, 0.93 + hash(c.centre.x + a, c.centre.z, 181) * 0.12);
    if (alongX) R.box(c.centre.x + a, c.centre.x + b, top, top + COPING.depth, c.centre.z - half, c.centre.z + half, tone, shade(tone, 0.9));
    else {
      const mid = c.centre.z + (a + b) / 2, lo = meets(joints.neg, mid) ? thin : half, hi = meets(joints.pos, mid) ? thin : half;
      R.box(c.centre.x - lo, c.centre.x + hi, top, top + COPING.depth, c.centre.z + a, c.centre.z + b, tone, shade(tone, 0.9));
    }
  }
}

/**
 * The solid under a wall's drawn coping, overhang and all (2026-10-23), for
 * the one wall a wheel could mount: the grand stair's rear masonry stands 0.2 m
 * over its deck, inside the 0.216 m step-up, and a wheel rolled on and sank into
 * the render-only coping. With this box the step is 0.28 m and what stops the
 * wheel is what is drawn. It is `drawn: false`: the coping on the wall is its look.
 */
export function copingSolid(c: BoxCollider, over: number = COPING.wall): BoxCollider {
  const top = c.centre.y + c.halfExtents.y, alongX = c.halfExtents.x > c.halfExtents.z;
  return { ...c, centre: { ...c.centre, y: top + COPING.depth / 2 }, drawn: false,
    halfExtents: { x: c.halfExtents.x + (alongX ? 0 : over), y: COPING.depth / 2, z: c.halfExtents.z + (alongX ? over : 0) } };
}

function walls(R: Layer, plan: LevelPlan): void {
  const coped: { c: BoxCollider; over: number }[] = [];
  for (const s of plan.segments) for (const c of s.colliders) {
    const top = c.centre.y + c.halfExtents.y, thin = Math.min(c.halfExtents.x, c.halfExtents.z), long = Math.max(c.halfExtents.x, c.halfExtents.z);
    // A box drawn as railing (`drawn: false`) has no wall to cap.
    if (c.rotationY !== 0 || thin > 1.05 || long < 2 || c.drawn === false) continue;
    const guard = Math.abs(top - 1.4) < 1e-6 && c.centre.y - c.halfExtents.y < 0.01 && (Math.abs(c.centre.x) > 118 || Math.abs(c.centre.z) > 88);
    const parapet = (c.appearance === 'stone' || c.appearance === 'brick') && top > 12.5;
    // 0.4: the stair deck's east guard is 0.8 m thick where it meets the return ramp's wall (2026-10-23).
    const deckGuard = ['concrete', 'brick'].includes(c.appearance ?? 'concrete') && thin <= 0.4 && top > 1.35 && top < 3 && c.centre.y - c.halfExtents.y < 0.01 && !guard;
    if (guard) coped.push({ c, over: COPING.edge }); else if (parapet || deckGuard) coped.push({ c, over: COPING.wall });
  }
  // Where a coped wall box stands against a smooth wall's face, both copings
  // end at that joint (the stair deck's east guard on the return ramp's wall).
  const stepped = steppedWalls(plan), along = coped.filter(({ c }) => c.halfExtents.z > c.halfExtents.x);
  const x0 = (c: BoxCollider): number => c.centre.x - c.halfExtents.x, x1 = (c: BoxCollider): number => c.centre.x + c.halfExtents.x;
  const span = (c: BoxCollider): [number, number] => [c.centre.z - c.halfExtents.z, c.centre.z + c.halfExtents.z];
  const run = (w: (typeof stepped)[number]): [number, number] => [w.steps[0].z0, w.steps[w.steps.length - 1].z1];
  const at = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  // The stair cheeks and the market's return-ramp walls stand in the brick plaza.
  for (const w of stepped) smoothWall(R, w, w.x0 > 16 && w.x1 < 86 && w.steps[0].z0 > -5 && w.steps[w.steps.length - 1].z1 < 50,
    { neg: along.filter(({ c }) => at(x1(c), w.x0)).map(({ c }) => span(c)), pos: along.filter(({ c }) => at(x0(c), w.x1)).map(({ c }) => span(c)) });
  for (const { c, over } of coped) coping(R, c, over, c.halfExtents.z > c.halfExtents.x
    ? { neg: stepped.filter(w => at(w.x1, x0(c))).map(run), pos: stepped.filter(w => at(w.x0, x1(c))).map(run) } : NO_JOINTS);
}

// -- Railings: the island edge and the roof decks ---------------------------

/**
 * Painted harbour-green steel on a granite plinth (island) or a brick upstand
 * with a stone coping (roofs). One paint for both, so the venue's edges read as
 * one family. Every post and rail lies within `post` metres behind the face.
 */
const RAILING = {
  paint: lin(0x2e6b63), paintLit: lin(0x3c8478),
  /** Each rail's [height, depth], bottom to top: slim mid rails, a broad handrail, a slim guard rail. */
  harbour: { post: 0.075, step: 2, bars: [[0.04, 0.04], [0.04, 0.04], [0.065, 0.075], [0.05, 0.06]] as readonly (readonly [number, number])[] },
  roof: { post: 0.065, step: 1.8, bars: [[0.04, 0.04], [0.04, 0.04], [0.06, 0.065]] as readonly (readonly [number, number])[] },
  granite: lin(0x9a958c), graniteTop: lin(0xb3ada2), joint: lin(0x6e6a63),
  brick: lin(0xa8604a), copingRoof: lin(0xc9c1ae),
};

/** A vertical prism with no top or bottom (rails cap every post). */
function post(R: Layer, cx: number, cz: number, h: number, y0: number, y1: number, c: RGB): void {
  const lo = shade(c, 0.78);
  R.quad([cx - h, y0, cz + h], [cx + h, y0, cz + h], [cx + h, y1, cz + h], [cx - h, y1, cz + h], lo, lo, c, c);
  R.quad([cx + h, y0, cz - h], [cx - h, y0, cz - h], [cx - h, y1, cz - h], [cx + h, y1, cz - h], lo, lo, c, c);
  R.quad([cx + h, y0, cz + h], [cx + h, y0, cz - h], [cx + h, y1, cz - h], [cx + h, y1, cz + h], lo, lo, c, c);
  R.quad([cx - h, y0, cz - h], [cx - h, y0, cz + h], [cx - h, y1, cz + h], [cx - h, y1, cz - h], lo, lo, c, c);
}

/** One long bar along a run: four long faces and two end caps, ending where the run ends. */
function bar(R: Layer, ax: number, az: number, bx: number, bz: number, nx: number, nz: number, off0: number, off1: number, y0: number, y1: number, top: RGB, side: RGB): void {
  const at = (x: number, z: number, o: number, y: number): V => [x + nx * o, y, z + nz * o];
  const low = shade(side, 0.7);
  R.quad(at(ax, az, off0, y1), at(bx, bz, off0, y1), at(bx, bz, off1, y1), at(ax, az, off1, y1), top);
  R.quad(at(ax, az, off0, y0), at(bx, bz, off0, y0), at(bx, bz, off0, y1), at(ax, az, off0, y1), side);
  R.quad(at(bx, bz, off1, y0), at(ax, az, off1, y0), at(ax, az, off1, y1), at(bx, bz, off1, y1), side);
  R.quad(at(ax, az, off1, y0), at(bx, bz, off1, y0), at(bx, bz, off0, y0), at(ax, az, off0, y0), low);
  R.quad(at(ax, az, off1, y0), at(ax, az, off0, y0), at(ax, az, off0, y1), at(ax, az, off1, y1), low);
  R.quad(at(bx, bz, off0, y0), at(bx, bz, off1, y0), at(bx, bz, off1, y1), at(bx, bz, off0, y1), low);
}

/** The plinth or upstand: the boxes' footprint, in blocks along the run. */
function plinth(R: Layer, r: QuayRailing, joints: readonly number[]): void {
  const p = r.plinth, alongX = Math.abs(r.x1 - r.x0) > Math.abs(r.z1 - r.z0);
  const a0 = alongX ? p.x0 : p.z0, a1 = alongX ? p.x1 : p.z1, c0 = alongX ? p.z0 : p.x0, c1 = alongX ? p.z1 : p.x1;
  const pt = (a: number, c: number, y: number): V => (alongX ? [a, y, c] : [c, y, a]);
  const harbour = r.look === 'harbour', y0 = harbour ? 0 : r.base, y1 = p.top;
  const cuts = [a0, ...joints.filter(j => j > a0 + 0.3 && j < a1 - 0.3), a1];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const s0 = cuts[k], s1 = cuts[k + 1], jw = harbour && k > 0 ? 0.03 : 0;
    const tone = 0.93 + hash(s0, c0, 211) * 0.12;
    const face = shade(harbour ? RAILING.granite : RAILING.brick, tone), top = shade(harbour ? RAILING.graniteTop : RAILING.copingRoof, tone);
    // Top: a dark joint strip, then the stone (or the coping) to the next joint.
    if (jw) R.quad(pt(s0, c0, y1), pt(s0, c1, y1), pt(s0 + jw, c1, y1), pt(s0 + jw, c0, y1), RAILING.joint);
    R.quad(pt(s0 + jw, c0, y1), pt(s0 + jw, c1, y1), pt(s1, c1, y1), pt(s1, c0, y1), top);
    // Both long faces; on the roof the top 6 cm is the coping's edge.
    const edge = harbour ? y1 : y1 - 0.06, lo = shade(face, 0.8);
    for (const [c, sgn] of [[c0, -1], [c1, 1]] as const) {
      const q = (ya: number, yb: number, ca: RGB, cb: RGB): void => {
        if (sgn > 0) R.quad(pt(s0, c, ya), pt(s1, c, ya), pt(s1, c, yb), pt(s0, c, yb), ca, ca, cb, cb);
        else R.quad(pt(s1, c, ya), pt(s0, c, ya), pt(s0, c, yb), pt(s1, c, yb), ca, ca, cb, cb);
      };
      q(y0, edge, lo, face);
      if (!harbour) q(edge, y1, shade(top, 0.86), shade(top, 0.86));
    }
  }
  // Square ends where a run stops on its own.
  for (const [a, sgn] of [[a0, -1], [a1, 1]] as const) {
    const c = shade(harbour ? RAILING.granite : RAILING.brick, 0.86);
    if (sgn > 0) R.quad(pt(a, c1, y0), pt(a, c0, y0), pt(a, c0, y1), pt(a, c1, y1), c);
    else R.quad(pt(a, c0, y0), pt(a, c1, y0), pt(a, c1, y1), pt(a, c0, y1), c);
  }
}

/**
 * A bar this slim (metres tall) is drawn in the `fine` layer and casts nothing:
 * at two shadow-map texels or less its shadow broke into a dotted band that
 * crawled along the plinth foot as the camera moved. The posts and the broad
 * handrail still cast, so the railing keeps its ladder of shadow up close.
 */
const FINE_BAR = 0.05;

function railings(R: Layer, F: Layer, spec: QuayScenerySpec): void {
  const posts: { x: number; z: number }[] = [];
  for (const r of spec.railings) {
    const look = r.look === 'harbour' ? RAILING.harbour : RAILING.roof;
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    const n = Math.max(1, Math.ceil(len / look.step - 1e-9)), half = look.post / 2;
    const alongX = Math.abs(ux) > Math.abs(uz), start = alongX ? r.x0 : r.z0, sign = alongX ? Math.sign(ux) : Math.sign(uz);
    // Plinth joints fall under the posts, so the stone and the steel share a rhythm.
    plinth(R, r, Array.from({ length: n - 1 }, (_, k) => start + sign * len * (k + 1) / n).sort((a, b) => a - b));
    const top = r.base + r.rails[r.rails.length - 1];
    for (let k = 0; k <= n; k++) {
      const t = (len * k) / n, cx = r.x0 + ux * t + r.nx * half, cz = r.z0 + uz * t + r.nz * half;
      // Two runs meeting at a corner share one post.
      if (posts.some(p => Math.abs(p.x - cx) < 0.12 && Math.abs(p.z - cz) < 0.12)) continue;
      posts.push({ x: cx, z: cz });
      post(R, cx, cz, half, r.plinth.top - 0.02, top - look.bars[look.bars.length - 1][0], shade(RAILING.paint, 0.94 + hash(cx, cz, 223) * 0.1));
    }
    // Rails run end post to end post, centred behind the face; the top rail's top is the boxes' top.
    for (const [i, h] of r.rails.entries()) {
      const [t, w] = look.bars[Math.min(i, look.bars.length - 1)], o0 = half - w / 2, o1 = half + w / 2;
      bar(t <= FINE_BAR ? F : R, r.x0, r.z0, r.x1, r.z1, r.nx, r.nz, o0, o1, r.base + h - t, r.base + h, RAILING.paintLit, RAILING.paint);
    }
  }
}

// -- Roof-deck paint --------------------------------------------------------

const ROOF = {
  /** A weathered clay-red coating, its mottle running from `trackDark` through `track` to `trackLight`. */
  track: lin(0x9a5c4a), trackDark: lin(0x7c4739), trackLight: lin(0xb07a66), line: lin(0xece8de),
  hazard: lin(0xf0c22c), ink: lin(0x2a2826), zone: lin(0x5e9f90), rubber: lin(0x3b3633),
};
/** How much of the landing box's teal shows over the bare deck. */
const ZONE_TINT = 0.4;
/** The most the run-up's wheel line is worn toward rubber, at its darkest. */
const WHEEL_WEAR = 0.2;

/** Two octaves of value noise, 0..1, for a laid surface's mottle. */
function mottle(x: number, z: number, seed: number): number {
  return noise(x * 0.9, z * 0.9, seed) * 0.6 + noise(x * 2.3, z * 2.3, seed + 7) * 0.4;
}
function trackTone(x: number, z: number, seed: number): RGB {
  const n = clamp01(0.5 + (mottle(x, z, seed) - 0.5) * 1.6);
  return n < 0.5 ? mix(ROOF.trackDark, ROOF.track, n * 2) : mix(ROOF.track, ROOF.trackLight, (n - 0.5) * 2);
}

function roofPaint(G: Layer, p: QuayRoofPaint, deck: RGB): void {
  const y = p.y + 0.012, LW = 0.15;
  const flat = (x0: number, x1: number, z0: number, z1: number, c: RGB, lift = 0, c2: RGB = c): void => {
    if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
    G.quad([x0, y + lift, z0], [x0, y + lift, z1], [x1, y + lift, z1], [x1, y + lift, z0], c, c2, c2, c);
  };
  /** A coated fill in cells of about `cell` metres, its tone sampled at every corner, so it reads as a laid surface. */
  const fill = (x0: number, x1: number, z0: number, z1: number, cell: number, tone: (x: number, z: number) => RGB): void => {
    const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
      G.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], tone(xa, za), tone(xa, zb), tone(xb, zb), tone(xb, za));
    }
  };
  const L0 = p.laneX - p.laneHalf, L1 = p.laneX + p.laneHalf, S0 = p.laneX - p.stripHalf, S1 = p.laneX + p.stripHalf, X0 = p.x0 + 0.15, X1 = p.x1 - 0.15;
  for (const [g, gap] of p.gaps.entries()) {
    // The run-up: two white lines that frame the pad and carry on to the
    // takeoff band, distance ticks every metre outside them, and down the
    // middle a mottled coated strip, bare deck either side, that aims at the
    // pad. Its start is a clean edge: a colour fade into the deck read as an
    // airbrushed smear in this crisp-edged world (2026-10-22).
    const band0 = gap.lip - 0.62, band1 = gap.lip - 0.03;
    const strip = (x: number, z: number): RGB => {
      // Rubber worn into the wheel line over the last few metres to the pad: part of
      // the coating's own tone, never a mark of its own, so no dark sliver can read
      // as a crack or sit under the camera (drawn streaks did both, 2026-10-22).
      const across = (x - p.laneX) / 0.42, along = clamp01((z - (gap.pad - 3.6)) / 3.2);
      const wear = WHEEL_WEAR * Math.exp(-across * across) * smooth(along) * (0.7 + (mottle(x, z, 307 + g) - 0.5) * 0.6);
      return mix(trackTone(x, z, 241 + g), ROOF.rubber, wear);
    };
    fill(S0, S1, gap.from, gap.pad, 0.45, strip);
    flat(L0, L0 + LW, gap.from, band0, ROOF.line); flat(L1 - LW, L1, gap.from, band0, ROOF.line);
    for (let z = gap.from + 0.5, k = 0; z < band0 - 0.4; z += 1, k++) {
      const len = k % 2 ? 0.18 : 0.34;
      flat(L0 - len, L0, z, z + 0.1, ROOF.line); flat(L1, L1 + len, z, z + 0.1, ROOF.line);
    }
    // The takeoff edge: a yellow hazard band with ink diagonals, rail to rail.
    const s = 0.5, d = band1 - band0;
    for (let x = X0 - d, k = 0; x < X1; x += s, k++) {
      const c = k % 2 ? ROOF.ink : ROOF.hazard, cl = (v: number): number => Math.min(X1, Math.max(X0, v));
      const a: V = [cl(x), y, band0], b: V = [cl(x + d), y, band1], e: V = [cl(x + s + d), y, band1], f: V = [cl(x + s), y, band0];
      G.tri(a, b, e, c); G.tri(a, e, f, c);
    }
    // The far side: a white edge rail to rail, then the lane carried on as an
    // outlined landing box, lightly tinted, with ticks outside it.
    flat(X0, X1, gap.landing + 0.08, gap.landing + 0.68, ROOF.line);
    const z0 = gap.landing + 0.68, z1 = gap.zone;
    const zone = (x: number, z: number): RGB => mix(deck, ROOF.zone, ZONE_TINT + (mottle(x, z, 251 + g) - 0.5) * 0.14);
    fill(L0 + LW, L1 - LW, z0, z1 - LW, 0.5, zone);
    flat(L0, L0 + LW, z0, z1, ROOF.line); flat(L1 - LW, L1, z0, z1, ROOF.line); flat(L0 + LW, L1 - LW, z1 - LW, z1, ROOF.line);
    for (let z = gap.landing + 1.68, k = 0; z < z1 - 0.2; z += 1, k++) {
      const len = k % 2 ? 0.18 : 0.34;
      flat(L0 - len, L0, z - 0.05, z + 0.05, ROOF.line); flat(L1, L1 + len, z - 0.05, z + 0.05, ROOF.line);
    }
  }
  // The final deck: a narrower lane of the same coating to the down ramp, mitred at each turn.
  const pts = p.route, H = p.routeHalf, offsets = pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const n0 = i > 0 ? norm(q.x - a.x, q.z - a.z) : norm(b.x - q.x, b.z - q.z), n1 = i + 1 < pts.length ? norm(b.x - q.x, b.z - q.z) : n0;
    let mx = -(n0[1] + n1[1]), mz = n0[0] + n1[0];
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const k = 1 / Math.max(0.5, mx * -n0[1] + mz * n0[0]);
    return [mx * k, mz * k] as const;
  });
  const at = (i: number, o: number, lift = 0): V => [pts[i].x + offsets[i][0] * o, y + lift, pts[i].z + offsets[i][1] * o];
  // Across the lane: a white line, the coating in three strips (so its mottle has corners to show on), a white line.
  const fillW = 2 * (H - LW), bands: (readonly [number, number, RGB | null])[] = [[-H, -H + LW, ROOF.line],
    ...[0, 1, 2].map(m => [-H + LW + fillW * m / 3, -H + LW + fillW * (m + 1) / 3, null] as const), [H - LW, H, ROOF.line]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z), n = Math.max(1, Math.round(len));
    const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t];
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      for (const [o0, o1, c] of bands) {
        const a0 = lerp(at(i, o0), at(i + 1, o0), t0), b0 = lerp(at(i, o1), at(i + 1, o1), t0), a1 = lerp(at(i, o0), at(i + 1, o0), t1), b1 = lerp(at(i, o1), at(i + 1, o1), t1);
        const tone = (v: V): RGB => c ?? trackTone(v[0], v[2], 271);
        // Wound for an upward normal whichever way the lane turns.
        G.quad(a0, a1, b1, b0, tone(a0), tone(a1), tone(b1), tone(b0));
      }
    }
  }
  // White chevrons in the lane: one leaving the landing, one before each turn.
  for (const [i, t] of [[0, 0.45], [2, 0.55], [4, 0.4]] as const) {
    if (i + 1 >= pts.length) continue;
    const a = pts[i], b = pts[i + 1], [fx, fz] = norm(b.x - a.x, b.z - a.z), lx = -fz, lz = fx;
    const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t, w = H - 0.35, arm = 0.7, sw = 0.22;
    for (const side of [-1, 1]) {
      const tip: V = [cx + fx * arm * 0.5, y + 0.006, cz + fz * arm * 0.5], tail: V = [cx - fx * arm * 0.5 + lx * side * w, y + 0.006, cz - fz * arm * 0.5 + lz * side * w];
      const tip2: V = [tip[0] - fx * sw * 1.6, tip[1], tip[2] - fz * sw * 1.6], tail2: V = [tail[0] - fx * sw * 1.6, tail[1], tail[2] - fz * sw * 1.6];
      G.quad(tip, tail, tail2, tip2, ROOF.line);
    }
  }
}
function norm(x: number, z: number): readonly [number, number] { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

// -- The market lane --------------------------------------------------------

function stalls(R: Layer, G: Layer, spec: QuayScenerySpec): void {
  for (const [index, s] of spec.stalls.entries()) {
    const f = s.facing, front = f > 0 ? s.x1 : s.x0, back = f > 0 ? s.x0 : s.x1, [stripeA, stripeB] = AWNINGS[index % AWNINGS.length];
    // Cloth skirt on the counter's front.
    const fx = front + f * 0.012;
    const skirt = (z0: number, z1: number, c: RGB): void => { if (f > 0) R.quad([fx, 0.12, z1], [fx, 0.12, z0], [fx, 0.96, z0], [fx, 0.96, z1], shade(c, 0.85), shade(c, 0.85), c, c); else R.quad([fx, 0.12, z0], [fx, 0.12, z1], [fx, 0.96, z1], [fx, 0.96, z0], shade(c, 0.85), shade(c, 0.85), c, c); };
    const stripes = 6, sw = (s.z1 - s.z0) / stripes;
    for (let k = 0; k < stripes; k++) skirt(s.z0 + k * sw, s.z0 + (k + 1) * sw, k % 2 ? stripeB : stripeA);
    // The cloth wraps both ends of the counter too.
    for (const ez of [s.z0 - 0.012, s.z1 + 0.012]) R.quad([s.x0, 0.12, ez], [s.x1, 0.12, ez], [s.x1, 0.96, ez], [s.x0, 0.96, ez], shade(stripeA, 0.85), shade(stripeA, 0.85), stripeA, stripeA);
    // Posts on the counter, carrying the awning.
    for (const px of [back - f * 0.06, front - f * 0.06]) for (const pz of [s.z0 + 0.06, s.z1 - 0.06]) {
      const topY = px === back - f * 0.06 ? 2.92 : 2.36;
      R.box(px - 0.035, px + 0.035, 1, topY, pz - 0.035, pz + 0.035, C.pole);
    }
    // The awning: stripes front to back, sloping out over the lane, with a scalloped valance.
    const xb = back - f * 0.1, xf = front + f * 0.8, yb = 2.95, yf = 2.25;
    for (let k = 0; k < stripes; k++) {
      const z0 = s.z0 - 0.1 + k * (sw + 0.2 / stripes), z1 = z0 + sw + 0.2 / stripes, c = k % 2 ? stripeB : stripeA;
      if (f > 0) R.quad([xb, yb, z0], [xb, yb, z1], [xf, yf, z1], [xf, yf, z0], c); else R.quad([xb, yb, z1], [xb, yb, z0], [xf, yf, z0], [xf, yf, z1], c);
      const zm = (z0 + z1) / 2;
      R.quad([xf, yf, z0], [xf, yf, z1], [xf, yf - 0.16, z1], [xf, yf - 0.16, z0], shade(c, 0.9));
      R.tri([xf, yf - 0.16, z0], [xf, yf - 0.16, z1], [xf, yf - 0.3, zm], shade(c, 0.9));
    }
    // Crates of produce on the counter.
    for (let k = 0; k < 3; k++) {
      const cz = s.z0 + 0.45 + k * ((s.z1 - s.z0 - 0.9) / 2), cx = (s.x0 + s.x1) / 2 + f * 0.25;
      R.box(cx - 0.25, cx + 0.25, 1, 1.2, cz - 0.3, cz + 0.3, shade(C.wood, 1.1), C.wood);
      const fruit = PRODUCE[(index * 3 + k) % PRODUCE.length];
      for (let m = 0; m < 5; m++) {
        const a = hash(index, k * 7 + m, 191) * Math.PI * 2, d = hash(index, k * 7 + m, 193) * 0.17;
        blob(R, cx + Math.cos(a) * d, 1.25, cz + Math.sin(a) * d * 1.3, 0.085, 0.08, 0.085, shade(fruit, 0.7), fruit, 1.18, 1.33, index * 50 + k * 7 + m);
      }
    }
    // A mast at each front corner carries the bunting over the lane.
    // The bunting mast is the back post carried on up: it stands behind the awning, never through it.
    R.box(back + f * 0.06 - 0.03, back + f * 0.06 + 0.03, 2.92, 4.15, s.z1 - 0.09, s.z1 - 0.03, C.pole);
  }
  // Bunting crosses the lane between facing stalls. It is drawn in the ground
  // layer, which casts nothing: its shadow read as a painted line on the brick.
  const west = spec.stalls.filter(s => s.facing > 0), east = spec.stalls.filter(s => s.facing < 0);
  for (let k = 0; k < Math.min(west.length, east.length); k++) {
    const w = west[k], e = east[k];
    for (const [za, zb] of [[w.z1 - 0.06, e.z1 - 0.06]]) {
      const ax = w.x0 + 0.06, bx = e.x1 - 0.06, n = Math.round(Math.hypot(bx - ax, zb - za) / 0.72);
      const at = (t: number): V => [ax + (bx - ax) * t, 4.15 - 0.55 * 4 * t * (1 - t), za + (zb - za) * t];
      for (let m = 0; m < n; m++) {
        const p0 = at(m / n), p1 = at((m + 1) / n), mid = at((m + 0.5) / n);
        G.quad([p0[0], p0[1] - 0.015, p0[2]], [p1[0], p1[1] - 0.015, p1[2]], [p1[0], p1[1] + 0.015, p1[2]], [p0[0], p0[1] + 0.015, p0[2]], C.string);
        if (m === 0 || m === n - 1) continue;
        G.tri([p0[0] + (p1[0] - p0[0]) * 0.12, p0[1], p0[2] + (p1[2] - p0[2]) * 0.12], [p1[0] - (p1[0] - p0[0]) * 0.12, p1[1], p1[2] - (p1[2] - p0[2]) * 0.12],
          [mid[0], mid[1] - 0.27, mid[2]], PENNANTS[(m + k * 2) % PENNANTS.length]);
      }
    }
  }
}

/** Rooftop plant reads as plant: louvred sides and a fan on each unit, glass on the skylights, a door on the stair hut. */
function roofUnits(R: Layer, plan: LevelPlan): void {
  const slat = lin(0x5e676b), fan = lin(0x3d4448), glass = lin(0x6f8fa6), door = lin(0x5b4636);
  for (const sgm of plan.segments) for (const c of sgm.colliders) {
    const bottom = c.centre.y - c.halfExtents.y, top = c.centre.y + c.halfExtents.y, h = top - bottom;
    if ((c.appearance ?? 'concrete') !== 'concrete' || Math.abs(bottom - 11) > 1e-6 || h > 3 || Math.max(c.halfExtents.x, c.halfExtents.z) > 1.6) continue;
    const { x, z } = c.centre, hx = c.halfExtents.x, hz = c.halfExtents.z, e = 0.012;
    if (h < 0.6) { R.quad([x - hx + 0.12, top + e, z - hz + 0.12], [x - hx + 0.12, top + e, z + hz - 0.12], [x + hx - 0.12, top + e, z + hz - 0.12], [x + hx - 0.12, top + e, z - hz + 0.12], glass); continue; }
    if (h > 2) { R.quad([x + hx + e, bottom, z - 0.45], [x + hx + e, bottom, z + 0.45], [x + hx + e, bottom + 2.05, z + 0.45], [x + hx + e, bottom + 2.05, z - 0.45], door); continue; }
    // Louvres on both long faces.
    const alongZ = hz >= hx;
    for (let k = 0; k < 4; k++) {
      const y0 = bottom + 0.2 + k * 0.18, y1 = y0 + 0.08;
      if (alongZ) for (const sx of [-1, 1]) R.quad([x + sx * (hx + e), y0, z - hz + 0.15], [x + sx * (hx + e), y0, z + hz - 0.15], [x + sx * (hx + e), y1, z + hz - 0.15], [x + sx * (hx + e), y1, z - hz + 0.15], slat);
      else for (const sz of [-1, 1]) R.quad([x - hx + 0.15, y0, z + sz * (hz + e)], [x + hx - 0.15, y0, z + sz * (hz + e)], [x + hx - 0.15, y1, z + sz * (hz + e)], [x - hx + 0.15, y1, z + sz * (hz + e)], slat);
    }
    // A round fan grille on top.
    const r = Math.min(hx, hz) * 0.7;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, b2 = ((k + 1) / 8) * Math.PI * 2;
      R.tri([x, top + e, z], [x + Math.cos(a) * r, top + e, z + Math.sin(a) * r], [x + Math.cos(b2) * r, top + e, z + Math.sin(b2) * r], k % 2 ? fan : slat); }
  }
}

/** Striped shop awnings over ground floors, three metres up, sloping out over the pavement. */
function awnings(R: Layer, spec: QuayScenerySpec): void {
  for (const [index, a] of spec.awnings.entries()) {
    const [ca, cb] = AWNINGS[(index * 2 + 1) % AWNINGS.length], len = Math.hypot(a.x1 - a.x0, a.z1 - a.z0);
    const ux = (a.x1 - a.x0) / len, uz = (a.z1 - a.z0) / len, n = Math.max(2, Math.round(len / 0.55));
    const at = (t: number, out: number, y: number): V => [a.x0 + ux * t + a.nx * (0.02 + out), y, a.z0 + uz * t + a.nz * (0.02 + out)];
    for (let k = 0; k < n; k++) {
      const t0 = (len * k) / n, t1 = (len * (k + 1)) / n, c = k % 2 ? cb : ca, tm = (t0 + t1) / 2;
      R.quad(at(t0, 0, 3.1), at(t1, 0, 3.1), at(t1, 1.15, 2.62), at(t0, 1.15, 2.62), c);
      R.quad(at(t0, 1.15, 2.62), at(t1, 1.15, 2.62), at(t1, 1.15, 2.44), at(t0, 1.15, 2.44), shade(c, 0.88));
      R.tri(at(t0, 1.15, 2.44), at(t1, 1.15, 2.44), at(tm, 1.15, 2.32), shade(c, 0.88));
    }
    // Two thin brackets hold the front edge.
    for (const t of [0.15, len - 0.15]) R.tri(at(t, 0, 3.1), at(t, 1.15, 2.62), at(t, 0, 2.5), C.pole);
  }
}

// -- Assembly ---------------------------------------------------------------

const CACHE = new WeakMap<LevelPlan, QuaySceneryGeometry>();
/** The whole dressing, built once per plan. Null when the plan has none. */
export function buildQuayScenery(plan: LevelPlan): QuaySceneryGeometry | null {
  const spec = plan.quayScenery; if (!spec) return null;
  const cached = CACHE.get(plan); if (cached) return cached;
  const G = new Layer(), R = new Layer(), F = new Layer(), ground = groundOf(plan);
  for (const [i, b] of spec.beds.entries()) bed(G, R, b, i, ground);
  paving(G, plan, spec, ground);
  const { halfX, halfZ, radius, halfWidth } = spec.ring;
  kerbLine(G, roundedRect(halfX - halfWidth, halfZ - halfWidth, radius - halfWidth), -1, spec, ground);
  kerbLine(G, roundedRect(halfX + halfWidth, halfZ + halfWidth, radius + halfWidth), 1, spec, ground);
  const zEnd = halfZ - halfWidth;
  for (const side of [1, -1] as const) {
    const pts: { x: number; z: number; nx: number; nz: number }[] = [];
    for (let z = -zEnd; z <= zEnd + 1e-9; z += 1) pts.push({ x: side * spec.avenue.halfWidth, z, nx: side, nz: 0 });
    kerbLine(G, pts, 1, spec, ground);
  }
  walls(R, plan);
  railings(R, F, spec);
  // The deck's own albedo, so the landing box's tint is a wash over the deck rather than a new colour.
  if (spec.roofPaint) roofPaint(G, spec.roofPaint, lin(plan.palette?.concrete ?? materialAppearance('concrete').albedo));
  stalls(R, G, spec);
  roofUnits(R, plan);
  awnings(R, spec);
  const geometry = { ground: G.done(), raised: R.done(), fine: F.done() };
  CACHE.set(plan, geometry);
  return geometry;
}

/** The railings alone, both their casting and their fine parts, from the same builder: for the containment test. */
export function quayRailingGeometry(spec: QuayScenerySpec): { raised: SceneryLayer; fine: SceneryLayer } {
  const R = new Layer(), F = new Layer(); railings(R, F, spec); return { raised: R.done(), fine: F.done() };
}
/** The roof paint's flat colours (linear), for the cue-set test. */
export const QUAY_ROOF_COLOURS: Readonly<Record<'line' | 'hazard' | 'ink' | 'trackDark' | 'rubber', RGB>> = { line: ROOF.line, hazard: ROOF.hazard, ink: ROOF.ink, trackDark: ROOF.trackDark, rubber: ROOF.rubber };

/**
 * Exact triangles per mesh, for the cost model: `ground` is the non-casting
 * mesh (the ground and fine layers drawn together), `raised` the casting one.
 */
export function quaySceneryTriangles(plan: LevelPlan): { ground: number; raised: number } {
  const g = buildQuayScenery(plan);
  return g ? { ground: (g.ground.positions.length + g.fine.positions.length) / 9, raised: g.raised.positions.length / 9 } : { ground: 0, raised: 0 };
}
