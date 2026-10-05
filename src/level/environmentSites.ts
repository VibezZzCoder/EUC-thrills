/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { fieldHeightAt } from './buildPlan.ts';
import type { BoxCollider, LevelPlan, Prop } from './plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { industrialGroundPatches, INDUSTRIAL_APPROACH_RULES } from './environmentGround.ts';
import { approachIndex, type ApproachIndex } from './protectedApproach.ts';
import { nearestPavedStreetStation as nearestIndustrialStreet, isBodySolid, groundSurfaceAt }
  from './protectedSiteEligibility.ts';

export { industrialPersonnelDoorOffset } from './environmentGround.ts';

const INDUSTRIAL_PAVED = ['pavement', 'brick', 'roughPavement'];

/** Prepared presentation sites only. These rules do not author props, solids,
 * surfaces, roads, admission prices or random-stream draws. */
export const ENVIRONMENT_SITE_RULES = Object.freeze({
  industrialBays: 1,
  openingHeight: 4.3,
  roomDepth: 6,
  maximumRoomWidth: 12.8,
  minimumFaceWidth: 11,
  minimumBuildingDepth: 7.2,
  minimumBuildingHeight: 5.5,
  maximumStreetGap: INDUSTRIAL_APPROACH_RULES.maximumStreetGap,
  minimumStreetGap: 2,
  minimumFacingCosine: 0.94,
  maximumFloorVariation: 0.15,
  maximumStreetHeightDifference: 0.45,
  approachHalfWidth: 0.8,
});

/** A colour opening, suitable for the renderer's generic facade hook. The
 * entire replaced facade strip is filled by architecture, not only the bay. */
export interface EnvironmentOpening {
  readonly position: Vec3;
  readonly yaw: number;
  readonly faceWidth: number;
  readonly height: number;
  readonly depth?: number;
}

export interface IndustrialBaySite extends EnvironmentOpening {
  readonly id: string;
  readonly kind: 'industrial-loading-bay';
  readonly building: Prop;
  readonly street: Vec3;
  readonly roomWidth: number;
  readonly roomDepth: number;
}

/** A plain emitter description; no audio graph or per-seat ownership here. */
export interface EnvironmentEmitter {
  readonly id: string;
  readonly kind: 'industrial';
  readonly position: Vec3;
}

/** Segment versus the full rotated solid footprint, expanded by the approach
 * width. A centre-distance check alone misses oblique corners and end caps. */
function blocksApproach(a: Vec3, b: Vec3, solid: BoxCollider): boolean {
  const floor = b.y;
  if (solid.centre.y + solid.halfExtents.y < floor + 0.35
    || solid.centre.y - solid.halfExtents.y > floor + 2.8) return false;
  const c = Math.cos(solid.rotationY), s = Math.sin(solid.rotationY);
  const ax = c * (a.x - solid.centre.x) - s * (a.z - solid.centre.z);
  const az = s * (a.x - solid.centre.x) + c * (a.z - solid.centre.z);
  const bx = c * (b.x - solid.centre.x) - s * (b.z - solid.centre.z);
  const bz = s * (b.x - solid.centre.x) + c * (b.z - solid.centre.z);
  let enter = 0, exit = 1;
  for (const [start, delta, half] of [
    [ax, bx - ax, solid.halfExtents.x + ENVIRONMENT_SITE_RULES.approachHalfWidth],
    [az, bz - az, solid.halfExtents.z + ENVIRONMENT_SITE_RULES.approachHalfWidth],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    const t0 = (-half - start) / delta, t1 = (half - start) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return false;
  }
  return exit > 0.001 && enter < 0.999;
}

/** One protected, street-facing industrial exemplar per world, after the
 * immutable plan exists. No exact-world id and no unsuitable-type fallback. */
export function environmentSites(plan: LevelPlan): readonly IndustrialBaySite[] {
  const candidates: { site: IndustrialBaySite; order: number; distance: number }[] = [];
  // One call-scoped broad phase for this plan; each use re-verifies its arrays.
  let index: ApproachIndex | undefined;
  const solids = plan.solids ?? [];
  const blocks = [...solids, ...plan.segments.flatMap(segment => segment.colliders)];
  for (const [order, building] of (plan.props ?? []).entries()) {
    const size = building.size;
    if (building.kind !== 'building' || building.look !== 'industrial' || !size
      || building.scale !== 1 || size.y < ENVIRONMENT_SITE_RULES.minimumBuildingHeight
      || ![size.x, size.y, size.z, building.position.x, building.position.y,
        building.position.z, building.rotationY].every(Number.isFinite)
      || !solids.some(solid => isBodySolid(building, solid))) continue;
    const station = nearestIndustrialStreet(plan, building);
    if (!station) continue;
    const { point: nearest, distance } = station;
    if (!INDUSTRIAL_PAVED.includes(groundSurfaceAt(plan, nearest))
      || Math.abs(nearest.y - building.position.y) > ENVIRONMENT_SITE_RULES.maximumStreetHeightDifference) continue;
    let face = 0, facing = -Infinity;
    for (let index = 0; index < 4; index++) {
      const yaw = building.rotationY + index * Math.PI / 2;
      const dot = Math.sin(yaw) * (nearest.x - building.position.x)
        + Math.cos(yaw) * (nearest.z - building.position.z);
      if (dot > facing) { face = index; facing = dot; }
    }
    if (facing / distance < ENVIRONMENT_SITE_RULES.minimumFacingCosine) continue;
    const yaw = building.rotationY + face * Math.PI / 2;
    const faceWidth = face % 2 === 0 ? size.x : size.z;
    const buildingDepth = face % 2 === 0 ? size.z : size.x;
    const gap = distance - buildingDepth / 2;
    if (faceWidth < ENVIRONMENT_SITE_RULES.minimumFaceWidth
      || buildingDepth < ENVIRONMENT_SITE_RULES.minimumBuildingDepth
      || gap < ENVIRONMENT_SITE_RULES.minimumStreetGap
      || gap > ENVIRONMENT_SITE_RULES.maximumStreetGap) continue;
    const position = { x: building.position.x + Math.sin(yaw) * buildingDepth / 2,
      y: building.position.y, z: building.position.z + Math.cos(yaw) * buildingDepth / 2 };
    const roomWidth = Math.min(ENVIRONMENT_SITE_RULES.maximumRoomWidth, faceWidth - 0.6);
    let flat = true;
    for (const x of [-roomWidth / 2, 0, roomWidth / 2]) {
      for (const z of [0, -ENVIRONMENT_SITE_RULES.roomDepth / 2, -ENVIRONMENT_SITE_RULES.roomDepth]) {
        const worldX = position.x + Math.cos(yaw) * x + Math.sin(yaw) * z;
        const worldZ = position.z - Math.sin(yaw) * x + Math.cos(yaw) * z;
        if (Math.abs(fieldHeightAt(plan.heightfield, plan.surround, worldX, worldZ)
          - position.y) > ENVIRONMENT_SITE_RULES.maximumFloorVariation) flat = false;
      }
    }
    if (!flat || blocks.some(solid => !isBodySolid(building, solid)
      && blocksApproach(nearest!, position, solid))) continue;
    const site: IndustrialBaySite = { id: `industrial-bay-${order}`, kind: 'industrial-loading-bay',
      position, yaw, faceWidth, height: ENVIRONMENT_SITE_RULES.openingHeight, depth: 1.2,
      roomWidth, roomDepth: ENVIRONMENT_SITE_RULES.roomDepth, building, street: nearest };
    // A clear centreline alone does not prove the actual offset door or the
    // van's service approach. Admit both exact matched footprints together.
    if (industrialGroundPatches(plan, site, index ??= approachIndex(plan, false)).length === 0) continue;
    candidates.push({ site, order, distance: Math.hypot(position.x - plan.spawn.position.x,
      position.z - plan.spawn.position.z) });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.order - b.order);
  return candidates.slice(0, ENVIRONMENT_SITE_RULES.industrialBays).map(candidate => candidate.site);
}

export function environmentEmitters(sites: readonly IndustrialBaySite[]): readonly EnvironmentEmitter[] {
  return sites.map(site => ({ id: `${site.id}-ambience`, kind: 'industrial',
    position: { x: site.position.x - Math.sin(site.yaw) * site.roomDepth / 2,
      y: site.position.y + 1, z: site.position.z - Math.cos(site.yaw) * site.roomDepth / 2 } }));
}
