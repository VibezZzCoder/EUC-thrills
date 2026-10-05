/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { GroundSurfacePatch, LevelPlan } from '../level/plan.ts';
import { streetEdgePatches, streetFronts, streetGroundPatches } from '../level/streetFronts.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { industrialGroundPatches } from '../level/environmentGround.ts';
import { residentialSites, residentialGroundPatches } from '../level/districtSites.ts';

/**
 * Decorate the finished immutable world, without rerunning generation.
 * Roads, route identity, height samples, props, solids and referees retain
 * their original arrays. Only grass inside exact commercial forecourts gains
 * pavement; nearby compatible courts share a bounded pedestrian street edge.
 * One verified industrial personnel entrance gets a narrow matched strip.
 * One protected residential doorway gets its shared offset strip, after both
 * earlier families. A closed park case creates no ground or public entrance.
 * Existing brick, pavement and rough concrete retain their original semantics.
 */
export function withStreetGround(plan: LevelPlan): LevelPlan {
  const existing = plan.groundSurfacePatches ?? [];
  const other = existing.filter(patch => !patch.id.startsWith('street-'));
  const source = { ...plan, groundSurfacePatches: other };
  const fronts = streetFronts(source);
  const courts = fronts.flatMap(front => streetGroundPatches(source, front));
  const commercial = [...courts, ...streetEdgePatches(source, fronts, courts)];
  // Select against the installed commercial patches too: the personnel strip
  // must not overwrite an existing court or another authored precise surface.
  const industrialPlan = { ...source, groundSurfacePatches: [...other, ...commercial] };
  const industrial = environmentSites(industrialPlan).flatMap(site => industrialGroundPatches(industrialPlan, site));
  // Domestic paving cannot claim an earlier commercial or industrial patch.
  // Its selector and renderer share the doorway offset and exact footprint.
  const residentialPlan = { ...source, groundSurfacePatches: [...other, ...commercial, ...industrial] };
  const residential = residentialSites(residentialPlan)
    .flatMap(site => residentialGroundPatches(residentialPlan, site));
  const additions = [...commercial, ...industrial, ...residential];
  const patches: GroundSurfacePatch[] = [...other, ...additions];
  if (JSON.stringify(existing) === JSON.stringify(patches)) return plan;
  if (patches.length > 0) return { ...plan, groundSurfacePatches: patches };
  const { groundSurfacePatches, ...withoutPatches } = plan;
  void groundSurfacePatches;
  return withoutPatches;
}
