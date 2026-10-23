/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { harbourPieces, pieceTriangles, type HarbourPiece, type Point3 } from '../level/harbourScenery.ts';
import type { LevelPlan } from '../level/plan.ts';

/**
 * The harbour around a walled island as one opaque, vertex-coloured mesh: one
 * draw call, flat-shaded faces, no shadow casting and no physics query. The
 * layout is `level/harbourScenery.ts`; this file only turns its primitives into
 * triangles, and refuses to build if any primitive drew a different number of
 * triangles than the shared table prices it at.
 */
export function riverScenery(plan: LevelPlan): THREE.Mesh | null {
  const r = plan.riverScenery; if (!r) return null;
  const positions: number[] = [], normals: number[] = [], colours: number[] = [], indices: number[] = [];
  const linear = new Map<number, THREE.Color>();
  const colourOf = (hex: number): THREE.Color => {
    let c = linear.get(hex); if (c === undefined) { c = new THREE.Color(hex); linear.set(hex, c); } return c;
  };

  // The far shore is lit softly: its normals lean toward the sky, so a face turned from the sun reads as
  // haze-lit distance rather than as a black slab across the water. Near pieces keep their full modelling.
  let soften = false;
  /** One convex polygon, fan-triangulated, wound so that its face normal agrees with `hint`. */
  const face = (points: readonly Point3[], hex: number | readonly number[], hint: Point3): void => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) { nx = hint[0]; ny = hint[1]; nz = hint[2]; length = Math.hypot(nx, ny, nz); }
    const flip = nx * hint[0] + ny * hint[1] + nz * hint[2] < 0, sign = flip ? -1 : 1;
    nx *= sign / length; ny *= sign / length; nz *= sign / length;
    if (soften && ny > -0.2) {
      nx *= 1 - SOFT_SKY_LEAN; ny = ny * (1 - SOFT_SKY_LEAN) + SOFT_SKY_LEAN; nz *= 1 - SOFT_SKY_LEAN;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    }
    const first = positions.length / 3, count = points.length;
    for (let k = 0; k < count; k++) {
      const i = flip ? count - 1 - k : k, p = points[i]!;
      const c = colourOf(typeof hex === 'number' ? hex : hex[i]!);
      positions.push(p[0], p[1], p[2]); normals.push(nx, ny, nz); colours.push(c.r, c.g, c.b);
    }
    for (let k = 1; k < count - 1; k++) indices.push(first, first + k, first + k + 1);
  };

  for (const piece of harbourPieces(r)) {
    const before = indices.length;
    soften = isFarShore(piece, r);
    emit(piece, face);
    if ((indices.length - before) / 3 !== pieceTriangles(piece)) throw new Error(`harbour ${piece.kind} drew ${(indices.length - before) / 3} triangles, priced at ${pieceTriangles(piece)}`);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }));
  mesh.name = 'river-and-far-banks'; mesh.receiveShadow = true; mesh.castShadow = false;
  return mesh;
}

type Face = (points: readonly Point3[], hex: number | readonly number[], hint: Point3) => void;

/** How far a far-shore normal leans toward straight up (0 = true faces, 1 = all lit like a roof). */
const SOFT_SKY_LEAN = 0.6;
/** Pieces anchored at least this far off the guard wall are far shore, m. The lighthouse, boats and bridge are nearer. */
const FAR_SHORE_METRES = 95;

function isFarShore(piece: HarbourPiece, r: NonNullable<LevelPlan['riverScenery']>): boolean {
  if (piece.kind === 'strip') return true;
  if (piece.kind === 'ring') return false;
  const [x, z] = piece.kind === 'beam' ? [piece.from[0], piece.from[2]] : piece.kind === 'sail' ? [piece.a[0], piece.a[2]] : [piece.x, piece.z];
  return Math.hypot(Math.max(Math.abs(x) - r.halfWidth, 0), Math.max(Math.abs(z) - r.halfDepth, 0)) >= FAR_SHORE_METRES;
}
const UP: Point3 = [0, 1, 0];

/** A yaw frame matching `Object3D.rotation.y`: local (x, z) about a centre. */
const yawFrame = (x: number, z: number, yaw: number) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { at: (lx: number, y: number, lz: number): Point3 => [x + c * lx + s * lz, y, z - s * lx + c * lz], dir: (lx: number, ly: number, lz: number): Point3 => [c * lx + s * lz, ly, -s * lx + c * lz] };
};

function emit(piece: HarbourPiece, face: Face): void {
  switch (piece.kind) {
    case 'ring': {
      const { y } = piece, ix = piece.halfWidth + piece.inner, iz = piece.halfDepth + piece.inner, ox = piece.halfWidth + piece.outer, oz = piece.halfDepth + piece.outer;
      const shade = [piece.innerColour, piece.innerColour, piece.outerColour, piece.outerColour];
      for (const [sx, sz, alongX] of [[1, -1, true], [1, 1, true], [-1, 1, false], [1, 1, false]] as const) {
        const quad: Point3[] = alongX
          ? [[-ix, y, sz * iz], [ix, y, sz * iz], [ox, y, sz * oz], [-ox, y, sz * oz]]
          : [[sx * ix, y, -iz], [sx * ix, y, iz], [sx * ox, y, oz], [sx * ox, y, -oz]];
        face(quad, shade, UP);
      }
      return;
    }
    case 'box': case 'gable': {
      const f = yawFrame(piece.x, piece.z, piece.yaw), hw = piece.width / 2, hd = piece.depth / 2;
      const footprint: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      if (piece.kind === 'box') {
        for (let i = 0; i < 4; i++) {
          const [ax, az] = footprint[i]!, [bx, bz] = footprint[(i + 1) % 4]!;
          face([f.at(ax, piece.y0, az), f.at(bx, piece.y0, bz), f.at(bx, piece.y1, bz), f.at(ax, piece.y1, az)], piece.colour, f.dir(ax + bx, 0, az + bz));
        }
        face(footprint.map(([lx, lz]) => f.at(lx, piece.y1, lz)), piece.colour, UP);
        return;
      }
      const ridgeA = f.at(-hw, piece.y1, 0), ridgeB = f.at(hw, piece.y1, 0);
      for (const sz of [-1, 1]) face([f.at(-hw, piece.y0, sz * hd), f.at(hw, piece.y0, sz * hd), ridgeB, ridgeA], piece.colour, f.dir(0, 1, sz));
      for (const sx of [-1, 1]) face([f.at(sx * hw, piece.y0, -hd), f.at(sx * hw, piece.y0, hd), sx < 0 ? ridgeA : ridgeB], piece.colour, f.dir(sx, 0, 0));
      return;
    }
    case 'beam': {
      const [ax, ay, az] = piece.from, [bx, by, bz] = piece.to;
      const length = Math.hypot(bx - ax, by - ay, bz - az);
      const along: Point3 = [(bx - ax) / length, (by - ay) / length, (bz - az) / length];
      const ref: Point3 = Math.abs(along[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      const side = normalise(cross(along, ref)), up = cross(side, along);
      const corner = (p: Point3, s: number, u: number): Point3 => [
        p[0] + side[0] * s * piece.width / 2 + up[0] * u * piece.height / 2,
        p[1] + side[1] * s * piece.width / 2 + up[1] * u * piece.height / 2,
        p[2] + side[2] * s * piece.width / 2 + up[2] * u * piece.height / 2,
      ];
      const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [s0, u0] = ring[i]!, [s1, u1] = ring[(i + 1) % 4]!;
        const hint: Point3 = [side[0] * (s0 + s1) + up[0] * (u0 + u1), side[1] * (s0 + s1) + up[1] * (u0 + u1), side[2] * (s0 + s1) + up[2] * (u0 + u1)];
        face([corner(piece.from, s0, u0), corner(piece.from, s1, u1), corner(piece.to, s1, u1), corner(piece.to, s0, u0)], piece.colour, hint);
      }
      if (piece.caps === true) {
        face(ring.map(([s, u]) => corner(piece.from, s, u)), piece.colour, [-along[0], -along[1], -along[2]]);
        face(ring.map(([s, u]) => corner(piece.to, s, u)), piece.colour, along);
      }
      return;
    }
    case 'tower': case 'cone': {
      const n = piece.sides, rim = (k: number, radius: number, y: number): Point3 => {
        const a = (k / n) * Math.PI * 2 + Math.PI / n; return [piece.x + Math.cos(a) * radius, y, piece.z + Math.sin(a) * radius];
      };
      const out = (k: number): Point3 => { const a = ((k + 0.5) / n) * Math.PI * 2 + Math.PI / n; return [Math.cos(a), 0.15, Math.sin(a)]; };
      if (piece.kind === 'cone') {
        const apex: Point3 = [piece.x, piece.y1, piece.z];
        for (let k = 0; k < n; k++) face([rim(k, piece.r, piece.y0), rim(k + 1, piece.r, piece.y0), apex], piece.colour, out(k));
        return;
      }
      for (let k = 0; k < n; k++) face([rim(k, piece.r0, piece.y0), rim(k + 1, piece.r0, piece.y0), rim(k + 1, piece.r1, piece.y1), rim(k, piece.r1, piece.y1)], piece.colour, out(k));
      if (piece.cap) face(Array.from({ length: n }, (_, k) => rim(k, piece.r1, piece.y1)), piece.colour, UP);
      return;
    }
    case 'hull': {
      const f = yawFrame(piece.x, piece.z, piece.yaw), L = piece.length, B = piece.beam;
      const top: [number, number][] = [[-L / 2, -B / 2], [0.2 * L, -B / 2], [L / 2, 0], [0.2 * L, B / 2], [-L / 2, B / 2]];
      const keel: [number, number][] = [[-0.44 * L, -0.3 * B], [0.2 * L, -0.28 * B], [0.42 * L, 0], [0.2 * L, 0.28 * B], [-0.44 * L, 0.3 * B]];
      for (let i = 0; i < 5; i++) {
        const j = (i + 1) % 5, [tx0, tz0] = top[i]!, [tx1, tz1] = top[j]!, [kx0, kz0] = keel[i]!, [kx1, kz1] = keel[j]!;
        face([f.at(kx0, piece.y0, kz0), f.at(kx1, piece.y0, kz1), f.at(tx1, piece.y1, tz1), f.at(tx0, piece.y1, tz0)], piece.colour, f.dir(tx0 + tx1, 0, tz0 + tz1));
      }
      face(top.map(([lx, lz]) => f.at(lx, piece.y1, lz)), piece.deckColour, UP);
      return;
    }
    case 'sail': {
      const n = cross([piece.b[0] - piece.a[0], piece.b[1] - piece.a[1], piece.b[2] - piece.a[2]], [piece.c[0] - piece.a[0], piece.c[1] - piece.a[1], piece.c[2] - piece.a[2]]);
      face([piece.a, piece.b, piece.c], piece.colour, n);
      face([piece.a, piece.c, piece.b], piece.colour, [-n[0], -n[1], -n[2]]);
      return;
    }
    case 'strip': {
      const { rows, points, colours } = piece, at = (i: number, j: number) => i * rows + j;
      for (let i = 0; i < piece.columns - 1; i++) for (let j = 0; j < rows - 1; j++) {
        const ids = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        face(ids.map((k) => points[k]!), ids.map((k) => colours[k]!), UP);
      }
      return;
    }
  }
}

function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalise(v: Point3): Point3 {
  const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l];
}
