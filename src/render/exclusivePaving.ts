/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { GroundSurfaceTriangle } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';

const cross = (a: Vec3, b: Vec3, p: Vec3): number => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const area = (p: readonly Vec3[]): number => p.reduce((sum, v, i) => {
  const n = p[(i + 1) % p.length]; return sum + v.x * n.z - n.x * v.z;
}, 0);

function half(polygon: readonly Vec3[], a: Vec3, b: Vec3, sign: number): Vec3[] {
  const output: Vec3[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const first = polygon[index], last = polygon[(index + 1) % polygon.length];
    const d0 = cross(a, b, first) * sign, d1 = cross(a, b, last) * sign;
    if (d0 >= 0) output.push(first);
    if ((d0 < 0) !== (d1 < 0)) {
      const t = d0 / (d0 - d1);
      output.push({ x: first.x + (last.x - first.x) * t, y: first.y + (last.y - first.y) * t,
        z: first.z + (last.z - first.z) * t });
    }
  }
  return output;
}
function subtract(polygon: readonly Vec3[], triangle: readonly Vec3[]): readonly (readonly Vec3[])[] {
  const orientation = Math.sign(area(triangle));
  let intersection = polygon;
  for (let edge = 0; edge < 3; edge++) intersection = half(intersection, triangle[edge], triangle[(edge + 1) % 3], orientation);
  if (intersection.length < 3 || Math.abs(area(intersection)) <= 1e-10) return [polygon];
  const pieces: Vec3[][] = [];
  let remainder = polygon;
  for (let edge = 0; edge < 3 && remainder.length >= 3; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    const outside = half(remainder, a, b, -orientation);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-10) pieces.push(outside);
    remainder = half(remainder, a, b, orientation);
  }
  return pieces;
}

/** The caller submits later patches first, matching the sampler's last write.
 * Overlapping
 * bay/driveway pieces keep their physical data but are drawn once. All new
 * vertices interpolate the original triangle's plane; no lifted overlay. */
export function exclusivePavingTriangle(triangle: GroundSurfaceTriangle,
  covered: Map<number, (readonly Vec3[])[]>): GroundSurfaceTriangle[] {
  const prior = covered.get(triangle.cell) ?? [];
  let pieces: readonly (readonly Vec3[])[] = [triangle.vertices];
  for (const other of prior) pieces = pieces.flatMap(piece => subtract(piece, other));
  prior.push(triangle.vertices); covered.set(triangle.cell, prior);
  const result: GroundSurfaceTriangle[] = [];
  for (const piece of pieces) for (let index = 1; index < piece.length - 1; index++) {
    const vertices = [piece[0], piece[index], piece[index + 1]] as const;
    if (Math.abs(area(vertices)) > 1e-10) result.push({ cell: triangle.cell, vertices });
  }
  return result;
}
