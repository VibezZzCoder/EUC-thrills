/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { clippedFieldTriangles } from '../level/streetFronts.ts';

/** Ground owns a flush architectural floor only when every intersected native
 * triangle agrees, including interior grid vertices. Corner samples alone miss
 * a crown or hollow. This never changes ground, apertures, walls or physics. */
export function groundOwnsFlushFloor(plan: LevelPlan, vertices: readonly Vec3[]): boolean {
  if (vertices.length !== 4 || vertices.some(v => Math.abs(v.y - vertices[0].y) > 1e-8)) return false;
  const polygon = [...vertices];
  const [a, b, c] = polygon;
  if ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) < 0) polygon.reverse();
  const fragments = clippedFieldTriangles(plan.heightfield, polygon, vertices[0].y, {
    allowedSurfaces: ['pavement', 'roughPavement', 'brick', 'grass'],
    maximumHeightDifference: 1e-7, maximumGradient: 1e-7, maximumCellsPerPolygon: 512,
  });
  return !!fragments?.length && fragments.every(t => t.vertices.every(v => Math.abs(v.y - vertices[0].y) <= 1e-8));
}
