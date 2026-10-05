/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { GroundSurfacePatch, LevelPlan } from './plan.ts';
import type { IndustrialBaySite } from './environmentSites.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { STREET_PAVING, type GroundClipPolicy } from './streetFronts.ts';
import { sourceApproachPatches, type ApproachIndex } from './protectedApproach.ts';

const INDUSTRIAL_STREET: readonly SurfaceId[] = ['pavement', 'brick', 'roughPavement'];
export const INDUSTRIAL_APPROACH_RULES = Object.freeze({
  maximumStreetGap: 30,
  personnelDoorInset: 0.90,
  /** Bounded loading approach, metres, in the same local frame as the room. */
  serviceApronWidth: 4.4,
  serviceApronOffset: 1.0,
});
const INDUSTRIAL_GROUND_CLIP: GroundClipPolicy = Object.freeze({
  allowedSurfaces: ['grass', 'pavement', 'brick', 'roughPavement'] as const,
  maximumHeightDifference: STREET_PAVING.maximumHeightDifference,
  maximumGradient: STREET_PAVING.maximumGradient,
  maximumCellsPerPolygon: STREET_PAVING.maximumCellsPerPolygon,
});

/** Metres along the room's local +X face. The closed personnel door and its
 * ground approach share this datum; neither uses the loading gate's centre. */
export function industrialPersonnelDoorOffset(site: Pick<IndustrialBaySite, 'roomWidth'>): number {
  return site.roomWidth / 2 - INDUSTRIAL_APPROACH_RULES.personnelDoorInset;
}

/** The exact personnel entrance and one bounded service apron, or neither.
 * Each footprint must reach the original street without a blocker, unapproved
 * surface or height discontinuity. Grass conversion stays inside those two
 * footprints; source triangles, solids and every route remain owned by the
 * plan. Personnel fragments come first for existing semantic queries. */
export function industrialGroundPatches(plan: LevelPlan, site: IndustrialBaySite, index?: ApproachIndex): GroundSurfacePatch[] {
  if (site.kind !== 'industrial-loading-bay' || site.building.kind !== 'building'
    || site.building.look !== 'industrial' || !plan.props?.includes(site.building)
    || ![site.roomWidth, site.faceWidth, site.yaw, site.position.x, site.position.y,
      site.position.z, site.street.x, site.street.y, site.street.z].every(Number.isFinite)
    || site.roomWidth < STREET_PAVING.doorApproachWidth + 2 * INDUSTRIAL_APPROACH_RULES.personnelDoorInset
    || site.roomWidth > site.faceWidth
    || Math.abs(INDUSTRIAL_APPROACH_RULES.serviceApronOffset)
      + INDUSTRIAL_APPROACH_RULES.serviceApronWidth / 2 > site.roomWidth / 2) return [];
  const door = industrialPersonnelDoorOffset(site);
  return sourceApproachPatches(plan, site, [
    { id: `street-${site.id}-personnel-entry`, offset: door, width: STREET_PAVING.doorApproachWidth },
    { id: `street-${site.id}-service-apron`, offset: INDUSTRIAL_APPROACH_RULES.serviceApronOffset,
      width: INDUSTRIAL_APPROACH_RULES.serviceApronWidth },
  ], { maximumStreetGap: INDUSTRIAL_APPROACH_RULES.maximumStreetGap,
    streetSurfaces: INDUSTRIAL_STREET, clipping: INDUSTRIAL_GROUND_CLIP,
    // Preserve the existing industrial body's centre exception exactly.
    // New districts use the strict identity-based protected wrapper instead.
    ignoresBody: box => Math.hypot(box.centre.x - site.building.position.x,
      box.centre.z - site.building.position.z) < 0.001 }, index);
}
