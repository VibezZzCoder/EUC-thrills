/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Dynamic side faces for the EXISTING native rag particle cast.
 * Ground/raycast remain owned by the real TerrainSampler. This never reports
 * an NPC roof as terrain, adds no landing, and cannot itself authorize a body
 * commit: the complete resulting native pose still needs compound admission.
 * The supplied actor prisms are immutable epoch snapshots.
 * No production caller since 2026-10-04: the rag meets living bodies in
 * `CrashRagdoll.meetBodies`. Kept only as a test witness; remove with it. */
import type { TerrainSampler, Vec3, ObstacleHit } from './world.ts';
import type { PopulationFootprint } from './population.ts';
export function ragDynamicObstacleSampler(source: TerrainSampler, bodies: readonly PopulationFootprint[]): TerrainSampler {
  if (!bodies.length) return source;
  return {
    sampleGround: (x, z, out) => source.sampleGround(x, z, out),
    raycast: (origin, direction, maximum) => source.raycast(origin, direction, maximum),
    raycastObstacle(origin: Vec3, direction: Vec3, maximum: number, halfWidth = 0, lateral?: Vec3, out?: ObstacleHit) {
      let nearest = source.raycastObstacle?.(origin, direction, maximum, halfWidth, lateral, out) ?? null;
      for (const body of bodies) {
        const sin = Math.sin(body.headingY), cos = Math.cos(body.headingY);
        const ox = (origin.x - body.x) * cos - (origin.z - body.z) * sin;
        const oz = (origin.x - body.x) * sin + (origin.z - body.z) * cos;
        const dx = direction.x * cos - direction.z * sin, dz = direction.x * sin + direction.z * cos;
        const side = lateral ?? { x: -direction.z, y: 0, z: direction.x };
        const ex = body.halfWidthMetres + halfWidth * Math.abs(side.x * cos - side.z * sin);
        const ez = body.halfLengthMetres + halfWidth * Math.abs(side.x * sin + side.z * cos);
        let low = 0, high = Math.min(maximum, nearest ?? maximum);
        const slab = (point: number, travel: number, from: number, to: number) => {
          if (travel === 0) return point >= from && point <= to;
          const first = (from - point) / travel, last = (to - point) / travel;
          low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last)); return low <= high;
        };
        if (!slab(ox, dx, -ex, ex) || !slab(oz, dz, -ez, ez) || !slab(origin.y, direction.y, body.minY, body.maxY)) continue;
        if (low <= maximum && (nearest === null || low < nearest)) {
          nearest = low;
          if (out) { out.distance = low; out.halfExtentX = body.halfWidthMetres; out.halfExtentZ = body.halfLengthMetres; }
        }
      }
      return nearest;
    },
  };
}
