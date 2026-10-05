/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Sparse protected domestic and park presentation sites, derived only after
 * the immutable source plan exists. No reroll, prop relocation, or new access.
 */
import { composeBuilding, LANDMARK_SIZES } from '../data/buildingLooks.ts';
import { POTHOLE } from '../data/tuning.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { fieldHeightAt } from './buildPlan.ts';
import type { BoxCollider, GroundSurfacePatch, Hazard, LevelPlan, Prop } from './plan.ts';
import type { EnvironmentOpening } from './environmentSites.ts';
import { boxOverlapsPolygonWithin, clippedFieldTriangles, polygonBoxReach, STREET_PAVING,
  type GroundClipPolicy } from './streetFronts.ts';
import { exactBuildingBody, nearestPavedStreetStation, sourceGroundSurfaceAt, finiteBox }
  from './protectedSiteEligibility.ts';
import { approachBlocked, approachIndex, protectedApproachPatches, type ApproachIndex } from './protectedApproach.ts';

const PAVED_STREET: readonly SurfaceId[] = ['pavement', 'brick', 'roughPavement'];
const SOURCE_GROUND: readonly SurfaceId[] = ['grass', ...PAVED_STREET];
// Socket reconstruction can leave nanometre-scale trig roundoff at a metric
// threshold. This does not admit the test's micrometre-outside controls.
const STREET_GAP_EPSILON = 1e-9;

/** Presentation admission, metres. These rules never write the source plan. */
export const RESIDENTIAL_SITE_RULES = Object.freeze({
  sites: 1,
  roomWidth: 6,
  roomDepth: 3.2,
  openingHeight: 3.2,
  openingDepth: 0.6,
  minimumFaceWidth: 6.4,
  minimumBuildingDepth: 3.6,
  minimumBuildingHeight: 3.8,
  minimumStreetGap: 2,
  maximumStreetGap: 24,
  minimumFacingCosine: 0.94,
  maximumFloorVariation: 0.15,
  /** Opaque indoor floor clears the complete admitted original source plane. */
  floorClearance: 0.02,
  maximumStreetHeightDifference: 0.45,
  frontInset: 0.04,
  /** Architecture overlapping the colour-mask edge, still inside the host. */
  mountWidthPadding: 0.08,
  mountTopPadding: 0.04,
  doorOffset: -2,
  approachWidth: 1.5,
});

/** A closed map case, never an entrance or a public interior. */
export const PARK_SITE_RULES = Object.freeze({
  sites: 1,
  caseWidth: 2.1,
  caseHeight: 1.4,
  caseDepth: 0.6,
  caseBottom: 1,
  frontInset: 0.04,
  /** Closed-case mounting returns cover the generic mask's small tolerances. */
  mountWidthPadding: 0.08,
  mountVerticalPadding: 0.06,
  minimumStreetGap: 3,
  maximumStreetGap: 32,
  minimumFacingCosine: 0.94,
  sourceEyeHeight: 2,
  visibilityFaceOffset: 0.04,
});

const RESIDENTIAL_GROUND_CLIP: GroundClipPolicy = Object.freeze({
  allowedSurfaces: SOURCE_GROUND,
  maximumHeightDifference: STREET_PAVING.maximumHeightDifference,
  maximumGradient: STREET_PAVING.maximumGradient,
  maximumCellsPerPolygon: STREET_PAVING.maximumCellsPerPolygon,
});
const RESIDENTIAL_ROOM_CLIP: GroundClipPolicy = Object.freeze({
  ...RESIDENTIAL_GROUND_CLIP,
  maximumHeightDifference: RESIDENTIAL_SITE_RULES.maximumFloorVariation,
});

interface ProtectedDistrictAnchor extends EnvironmentOpening {
  readonly id: string;
  readonly building: Prop;
  /** The exact original protecting body, also supplied to the ground helper. */
  readonly body: BoxCollider;
  readonly street: Vec3;
  readonly streetSegmentId: string;
}

export interface ResidentialRoomSite extends ProtectedDistrictAnchor {
  readonly kind: 'residential-domestic-room';
  readonly closedDoor: true;
  /** Original house face width; faceWidth names the localized domestic mask. */
  readonly buildingFaceWidth: number;
  readonly roomWidth: number;
  readonly roomDepth: number;
  /** Authoritative for the closed door and its narrow ground approach. */
  readonly doorOffset: number;
}

export interface ParkCaseSite extends ProtectedDistrictAnchor {
  readonly kind: 'park-closed-map-case';
  /** Original shaft width; faceWidth names only the localized case opening. */
  readonly shaftFaceWidth: number;
  readonly caseWidth: number;
  readonly caseDepth: number;
  /** Relative to the original shaft base; position is the opening's base. */
  readonly caseBottom: number;
  readonly publicEntrance: false;
}

export type DistrictSite = ResidentialRoomSite | ParkCaseSite;

function finiteBuilding(building: Prop): boolean {
  const size = building.size;
  return building.kind === 'building' && building.scale === 1 && Boolean(size)
    && [size!.x, size!.y, size!.z, building.position.x, building.position.y,
      building.position.z, building.rotationY].every(Number.isFinite)
    && size!.x > 0 && size!.y > 0 && size!.z > 0;
}

function faceToward(building: Prop, street: Vec3): {
  readonly position: Vec3; readonly yaw: number;
  readonly faceWidth: number; readonly buildingDepth: number;
  readonly cosine: number; readonly gap: number;
} | undefined {
  const size = building.size!, dx = street.x - building.position.x,
    dz = street.z - building.position.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance > 0) || !Number.isFinite(distance)) return undefined;
  let face = 0, facing = -Infinity;
  for (let index = 0; index < 4; index++) {
    const yaw = building.rotationY + index * Math.PI / 2;
    const dot = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    if (dot > facing) { face = index; facing = dot; }
  }
  const yaw = building.rotationY + face * Math.PI / 2;
  const faceWidth = face % 2 === 0 ? size.x : size.z;
  const buildingDepth = face % 2 === 0 ? size.z : size.x;
  return { yaw, faceWidth, buildingDepth, cosine: facing / distance,
    gap: facing - buildingDepth / 2,
    position: { x: building.position.x + Math.sin(yaw) * buildingDepth / 2,
      y: building.position.y,
      z: building.position.z + Math.cos(yaw) * buildingDepth / 2 } };
}

function localPoint(anchor: Pick<EnvironmentOpening, 'position' | 'yaw'>,
  x: number, y: number, z: number): Vec3 {
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  return { x: anchor.position.x + c * x + s * z,
    y: anchor.position.y + y, z: anchor.position.z - s * x + c * z };
}

function protectedVolume(plan: LevelPlan, anchor: ProtectedDistrictAnchor,
  width: number, depth: number, inset: number,
  vertical: { readonly bottom?: number; readonly top?: number } = {}, index?: ApproachIndex): boolean {
  const bottom = vertical.bottom ?? 0, top = vertical.top ?? anchor.height;
  if (![width, depth, inset, bottom, top].every(Number.isFinite)
    || width <= 0 || depth <= inset || inset <= 0 || top <= bottom) return false;
  const c = Math.cos(anchor.body.rotationY), s = Math.sin(anchor.body.rotationY);
  for (const x of [-width / 2, width / 2]) for (const z of [-depth, -inset]) {
    for (const y of [bottom, top]) {
      const point = localPoint(anchor, x, y, z);
      const dx = point.x - anchor.body.centre.x, dz = point.z - anchor.body.centre.z;
      if (Math.abs(c * dx - s * dz) > anchor.body.halfExtents.x + 1e-9
        || Math.abs(s * dx + c * dz) > anchor.body.halfExtents.z + 1e-9
        || Math.abs(point.y - anchor.body.centre.y) > anchor.body.halfExtents.y + 1e-9) return false;
    }
  }
  const polygon = [localPoint(anchor, -width / 2, 0, -depth),
    localPoint(anchor, width / 2, 0, -depth),
    localPoint(anchor, width / 2, 0, -inset),
    localPoint(anchor, -width / 2, 0, -inset)];
  // Skip this one identified original body only. A coincident foreign solid
  // or original soft planting is still a blocker, not a host exception.
  const blockers = [...(plan.solids ?? []), ...plan.segments.flatMap(segment => segment.colliders),
    ...(plan.softBodies ?? [])];
  const reach = polygonBoxReach(polygon);
  const blocks = (box: BoxCollider): boolean => box !== anchor.body
    && box.centre.y + box.halfExtents.y > anchor.position.y + bottom
    && box.centre.y - box.halfExtents.y < anchor.position.y + top;
  // The index holds exactly these boxes (solids, colliders, soft bodies) in
  // another order; "any blocker" does not depend on order.
  if (index && index.includeSoftBodies) {
    if (index.segments === plan.segments && index.solids === plan.solids && index.softBodies === plan.softBodies
      && index.nonFiniteBlocker) return false;
    const indexed = approachBlocked(plan, index, true, polygon, blocks);
    if (indexed !== undefined) return !indexed;
  }
  return !blockers.some(box => !finiteBox(box) || (blocks(box)
      && boxOverlapsPolygonWithin(box, polygon, reach)));
}

function pavedSourceStreet(plan: LevelPlan, point: Vec3): boolean {
  const surface = sourceGroundSurfaceAt(plan, point);
  return surface !== undefined && PAVED_STREET.includes(surface);
}

/** Conservative visible pothole envelope, using the original tuning only. */
function originalHazardReach(hazard: Hazard): number {
  return hazard.kind === 'spill' ? hazard.radius : hazard.radius * POTHOLE.haloFraction
    * (1 + POTHOLE.outlineHarmonics.reduce((sum, harmonic) => sum + Math.abs(harmonic), 0));
}

function residentialCandidate(plan: LevelPlan, building: Prop, order: number, index?: ApproachIndex): ResidentialRoomSite | undefined {
  const rules = RESIDENTIAL_SITE_RULES;
  if (!finiteBuilding(building) || building.look !== 'residential'
    || building.size!.y < rules.minimumBuildingHeight
    // Verify the original authored composition, not a guessed roof label.
    || !composeBuilding({ position: building.position, size: building.size,
      look: building.look }).some(piece => piece.part === 'roofGable')) return undefined;
  const body = exactBuildingBody(plan, building);
  const station = nearestPavedStreetStation(plan, building);
  if (!body || !station || !pavedSourceStreet(plan, station.point)
    || Math.abs(station.point.y - building.position.y) > rules.maximumStreetHeightDifference) return undefined;
  const face = faceToward(building, station.point);
  if (!face || face.cosine < rules.minimumFacingCosine
    || face.faceWidth < rules.minimumFaceWidth || face.buildingDepth < rules.minimumBuildingDepth
    || face.gap < rules.minimumStreetGap - STREET_GAP_EPSILON
    || face.gap > rules.maximumStreetGap + STREET_GAP_EPSILON) return undefined;
  const site: ResidentialRoomSite = { id: `residential-room-${order}`, kind: 'residential-domestic-room',
    closedDoor: true, building, body, street: station.point, streetSegmentId: station.segmentId,
    position: face.position, yaw: face.yaw, faceWidth: rules.roomWidth,
    height: rules.openingHeight, depth: rules.openingDepth,
    buildingFaceWidth: face.faceWidth, roomWidth: rules.roomWidth,
    roomDepth: rules.roomDepth, doorOffset: rules.doorOffset };
  const coveredWidth = site.roomWidth + rules.mountWidthPadding;
  if (!protectedVolume(plan, site, coveredWidth, site.roomDepth, rules.frontInset,
    { top: site.height + rules.mountTopPadding }, index)) return undefined;
  const interior = [localPoint(site, -coveredWidth / 2, 0, -site.roomDepth),
    localPoint(site, coveredWidth / 2, 0, -site.roomDepth),
    localPoint(site, coveredWidth / 2, 0, -rules.frontInset),
    localPoint(site, -coveredWidth / 2, 0, -rules.frontInset)];
  // Check every clipped source triangle, rather than nine chosen floor points.
  if (!clippedFieldTriangles(plan.heightfield, interior, site.position.y,
    RESIDENTIAL_ROOM_CLIP)?.length) return undefined;
  return site;
}

/** Renderer and ground use this one field; no independent doorway estimate. */
export function residentialDoorOffset(site: Pick<ResidentialRoomSite, 'doorOffset'>): number {
  return site.doorOffset;
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function sameResidentialSite(a: ResidentialRoomSite, b: ResidentialRoomSite): boolean {
  return a.kind === b.kind && a.id === b.id && a.building === b.building && a.body === b.body
    && a.closedDoor === true && b.closedDoor === true
    && samePoint(a.position, b.position) && samePoint(a.street, b.street)
    && a.yaw === b.yaw && a.faceWidth === b.faceWidth && a.height === b.height && a.depth === b.depth
    && a.streetSegmentId === b.streetSegmentId && a.roomWidth === b.roomWidth
    && a.buildingFaceWidth === b.buildingFaceWidth
    && a.roomDepth === b.roomDepth && a.doorOffset === b.doorOffset;
}

/** One exact 1.5 m source-plane strip, with no residential court or yard fill. */
export function residentialGroundPatches(plan: LevelPlan, site: ResidentialRoomSite): GroundSurfacePatch[] {
  const order = plan.props?.indexOf(site.building) ?? -1;
  if (order < 0) return [];
  return residentialPatchesFor(plan, site, residentialCandidate(plan, site.building, order));
}

/** residentialGroundPatches after its pure candidate re-derivation. */
function residentialPatchesFor(plan: LevelPlan, site: ResidentialRoomSite,
  expected: ResidentialRoomSite | undefined, index?: ApproachIndex): GroundSurfacePatch[] {
  if (!expected || !sameResidentialSite(expected, site)) return [];
  return protectedApproachPatches(plan, site,
    [{ id: `street-${site.id}-domestic-entry`, offset: residentialDoorOffset(site),
      width: RESIDENTIAL_SITE_RULES.approachWidth }], {
      maximumStreetGap: RESIDENTIAL_SITE_RULES.maximumStreetGap,
      streetSurfaces: PAVED_STREET, clipping: RESIDENTIAL_GROUND_CLIP,
      includeSoftBodies: true, hazardRadius: originalHazardReach,
    }, index);
}

function nearestSpawn<T extends ProtectedDistrictAnchor>(plan: LevelPlan,
  candidates: readonly { readonly site: T; readonly order: number }[], limit: number): T[] {
  const distance = (site: T): number => Math.hypot(site.position.x - plan.spawn.position.x,
    site.position.z - plan.spawn.position.z);
  return [...candidates].sort((a, b) => distance(a.site) - distance(b.site) || a.order - b.order)
    .slice(0, limit).map(candidate => candidate.site);
}

/** At most one eligible original house. No fallback to any other building. */
export function residentialSites(plan: LevelPlan): readonly ResidentialRoomSite[] {
  const candidates: { site: ResidentialRoomSite; order: number }[] = [];
  // One call-scoped broad phase over this plan's blockers and patches; each
  // use re-verifies the plan arrays and every decision stays exact.
  let index: ApproachIndex | undefined;
  const indexed = (): ApproachIndex => index ??= approachIndex(plan, true);
  for (const [order, building] of (plan.props ?? []).entries()) {
    const site = finiteBuilding(building) && building.look === 'residential'
      ? residentialCandidate(plan, building, order, indexed()) : residentialCandidate(plan, building, order);
    if (!site) continue;
    // residentialGroundPatches re-derives the candidate at the building's first
    // index. residentialCandidate is pure and deterministic, so at this same
    // index the re-derivation is the identical candidate; sameResidentialSite
    // still runs on it exactly as before.
    const first = plan.props!.indexOf(building);
    const expected = first === order ? site : first < 0 ? undefined : residentialCandidate(plan, building, first, indexed());
    if (first >= 0 && residentialPatchesFor(plan, site, expected, indexed()).length > 0) candidates.push({ site, order });
  }
  return nearestSpawn(plan, candidates, RESIDENTIAL_SITE_RULES.sites);
}

function clearSourceFace(sampler: PlanTerrainSampler, from: Vec3, target: Vec3): boolean {
  const direction = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const distance = Math.hypot(direction.x, direction.y, direction.z);
  if (!(distance > 0)) return false;
  // The endpoint stands just outside the unchanged protecting shaft, so its
  // collider never needs to be removed from the original sampler query.
  const maximum = distance - 0.001;
  return sampler.raycast(from, direction, maximum) === null
    && sampler.raycastObstacle(from, direction, maximum) === null;
}

/** One localized closed case on the original clock-tower shaft. No paving. */
export function parkCaseSites(plan: LevelPlan): readonly ParkCaseSite[] {
  const rules = PARK_SITE_RULES, size = LANDMARK_SIZES.clockTower;
  const gates = plan.segments.filter(segment => segment.id === 'park-gate'
    || segment.id.startsWith('park-gate@'));
  if (gates.length === 0) return [];
  const candidates: { site: ParkCaseSite; order: number }[] = [];
  // Pure source query, allocated lazily at most once per call; never a render
  // mesh query, gameplay installation, or per-frame owner.
  let sampler: PlanTerrainSampler | undefined;
  for (const [order, building] of (plan.props ?? []).entries()) {
    // Original foundation settling lowers the base and extends the shaft;
    // composeBuilding uses this actual height and preserves the authored top.
    // Keep the exact nominal footprint and require the complete nominal shaft.
    if (!finiteBuilding(building) || building.look !== 'clockTower'
      || building.size!.x !== size.x || building.size!.y < size.y || building.size!.z !== size.z) continue;
    const body = exactBuildingBody(plan, building);
    const station = nearestPavedStreetStation(plan, building, gates,
      { minimumStationFraction: 0.08 });
    if (!body || !station || !pavedSourceStreet(plan, station.point)) continue;
    const face = faceToward(building, station.point);
    if (!face || face.cosine < rules.minimumFacingCosine
      || face.gap < rules.minimumStreetGap - STREET_GAP_EPSILON
      || face.gap > rules.maximumStreetGap + STREET_GAP_EPSILON) continue;
    const site: ParkCaseSite = { id: `park-case-${order}`, kind: 'park-closed-map-case',
      building, body, street: station.point, streetSegmentId: station.segmentId,
      position: { ...face.position, y: face.position.y + rules.caseBottom }, yaw: face.yaw,
      faceWidth: rules.caseWidth, height: rules.caseHeight, depth: rules.caseDepth,
      shaftFaceWidth: face.faceWidth, caseWidth: rules.caseWidth,
      caseDepth: rules.caseDepth, caseBottom: rules.caseBottom, publicEntrance: false };
    if (!protectedVolume(plan, site, site.caseWidth + rules.mountWidthPadding,
      site.caseDepth, rules.frontInset, { bottom: -rules.mountVerticalPadding,
        top: site.height + rules.mountVerticalPadding })) continue;
    const eye = { ...station.point, y: fieldHeightAt(plan.heightfield, plan.surround,
      station.point.x, station.point.z) + rules.sourceEyeHeight };
    if (!Number.isFinite(eye.y)) continue;
    sampler ??= new PlanTerrainSampler(plan);
    // All three source face rays must clear, including original gate piers
    // and terrain. This is conservative admission, not a camera pixel pass.
    const visible = [-site.caseWidth * 0.35, 0, site.caseWidth * 0.35].every(x =>
      clearSourceFace(sampler!, eye, localPoint(site, x, site.height / 2, rules.visibilityFaceOffset)));
    if (visible) candidates.push({ site, order });
  }
  return nearestSpawn(plan, candidates, rules.sites);
}

export function districtSites(plan: LevelPlan): readonly DistrictSite[] {
  return [...residentialSites(plan), ...parkCaseSites(plan)];
}
