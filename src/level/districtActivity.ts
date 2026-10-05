/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Purposeful outdoor life on completed, connected district footways.
 * This supplement creates no paving or vehicle route. A finite physical kit
 * furnishes only already proved endpoints and keeps every occupied span clear.
 * Its standing people and bounded facade walks share exact owned triangles. */
import { PROP_SOLIDS, PROP_SPREADS, type PropKind } from '../data/props.ts';
import { PART_COSTS, propPartCounts, type PropPartId } from '../data/renderCost.ts';
import { POPULATION_AUTHORING as P } from '../data/tuning.ts';
import { hash128 } from './planDigest.ts';
import type { LevelPlan, BoxCollider, Prop } from './plan.ts';
import type { DistrictAdjacentPlan, DistrictFrontage, DistrictPublicGroup } from './districtAdjacency.ts';
import { alignedPolygonExtent, boundaryOutsideAligned, boxOverlapsPolygon, boxOverlapsPolygonWithin,
  diskBeyondPolygonReach, movementBands, movementBandsMeet, polygonBoxReach, streetFronts,
  type MovementBands } from './streetFronts.ts';
import { environmentSites } from './environmentSites.ts';
import { residentialSites } from './districtSites.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type Vec3, type TerrainSampler, type SurfaceId } from '../simulation/world.ts';
import { createPopulationValidationScope, populationPathSpanReason, populationSpanFootprints,
  populationFootprintExclusion, surfaceFootprintClear, groundSourceCovers,
  districtActivityWalkReason, districtActivityReservedLane,
  type AuthoredDistrictActivityWalk, type AuthoredDistrictActivitySite, type AuthoredPopulationPath, type AuthoredPathFrame,
  type PopulationGroundSource, type PopulationValidationScope } from './populationPlan.ts';

export const DISTRICT_ACTIVITY = Object.freeze({ revision: 'district-life-r1' as const,
  maximumSites: 4, frontStandingMetres: 2.8, baseWalkMetres: 1.2, approachTurnDepthMetres: 0.9,
  edgeApproachMetres: 0.70, supportHalfAxisMetres: 0.01,
  maximumWalks: 12, maximumFrontageWalksPerDistrict: 3, maximumFurnishings: 16,
  walkEndpointMarginMetres: 3.15, walkDepthChoicesMetres: [1.05, 0.85, 1.25] as const,
  footwayHalfWidthMetres: 0.8, approachValidationBandMetres: 1.35, benchSideAdjustmentsMetres: [0.15, 0.30] as const });
export interface DistrictActivityReport {
  readonly revision: 'district-life-r1'; readonly sourceWorldId: string;
  readonly physicalWorldId: string; readonly acceptedSiteIds: readonly string[];
  readonly walkRevision?: 'district-walk-r15' | typeof P.activityWalkPolicyRevision;
  readonly acceptedWalkIds?: readonly string[];
  readonly rejectedWalks?: readonly { readonly pathId: string; readonly reason: string }[];
  readonly furnishings?: readonly { readonly frontageId: string; readonly use: string;
    readonly propIndex: number; readonly solidIndex: number; readonly groundPatchIds: readonly string[];
    readonly prop: Prop; readonly solid: BoxCollider }[];
  readonly rejectedFurnishings?: readonly { readonly frontageId: string; readonly kind: PropKind; readonly reason: string }[];
  readonly furnishingCost?: { readonly propCount: number; readonly solidCount: number;
    readonly colourTriangles: number; readonly shadowTriangles: number;
    readonly additionalColourDrawCalls: number; readonly additionalShadowDrawCalls: number;
    readonly partInstances: readonly { readonly id: PropPartId; readonly count: number }[] };
  readonly rejected: readonly { readonly groupId: string; readonly reason: string }[];
  readonly relocations?: readonly { readonly groupId: string; readonly propIndex: number;
    readonly solidIndex: number; readonly from: Vec3; readonly to: Vec3 }[];
}
export type DistrictActivityPlan = DistrictAdjacentPlan & {
  readonly populationActivitySites?: readonly AuthoredDistrictActivitySite[];
  readonly populationActivityWalks?: readonly AuthoredDistrictActivityWalk[];
  readonly populationActivityChoiceWorldId?: string;
  readonly districtActivity?: DistrictActivityReport;
};
const finite = (...values: number[]): boolean => values.every(Number.isFinite);
const at = (front: DistrictFrontage, x: number, z: number): Vec3 => ({
  x: front.position.x + Math.cos(front.yaw) * x + Math.sin(front.yaw) * z,
  y: front.position.y, z: front.position.z - Math.sin(front.yaw) * x + Math.cos(front.yaw) * z,
});
const localX = (front: DistrictFrontage, point: Vec3): number => Math.cos(front.yaw) * (point.x - front.position.x)
  - Math.sin(front.yaw) * (point.z - front.position.z);
function trace(sampler: TerrainSampler, corners: readonly Vec3[], headingY: number, sourceId: string, connectedApproach = false): AuthoredPathFrame[] {
  const result: AuthoredPathFrame[] = []; let along = 0;
  for (let leg = 1; leg < corners.length; leg += 1) {
    const a = corners[leg - 1], b = corners[leg], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!finite(length, headingY) || length <= P.epsilon) continue;
    const steps = Math.max(1, Math.ceil(length / P.traceSpacingMetres));
    const legHeading = connectedApproach ? Math.atan2(b.x - a.x, b.z - a.z) : headingY;
    for (let i = leg === 1 ? 0 : 1; i <= steps; i += 1) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      const ground = sampler.sampleGround(x, z, createGroundSample());
      result.push({ x, y: ground.height, z, headingY: legHeading, distanceMetres: along + length * i / steps,
        sourceSegmentId: sourceId, halfWidthMetres: connectedApproach ? DISTRICT_ACTIVITY.approachValidationBandMetres : DISTRICT_ACTIVITY.footwayHalfWidthMetres });
    }
    along += length;
  }
  return result;
}
/** Reserve full original authored bands, even rejected paths. A stationary
 * cluster cannot borrow a vehicle lane, crossing or another movement source. */
function meetsOriginalLane(plan: LevelPlan, polygon: readonly Vec3[], lanes?: MovementBands): boolean {
  // Every test below only returns true, so skipping provably separated items
  // (exact broad phases in streetFronts.ts) cannot change the answer.
  const reach = polygonBoxReach(polygon), aligned = alignedPolygonExtent(polygon);
  const indexed = movementBandsMeet(plan, lanes, P.staticClearanceMetres, polygon, 'each',
    box => boxOverlapsPolygon(box, polygon), outline => overlaps(outline));
  if (indexed !== undefined) return indexed;
  for (const path of plan.populationPaths ?? []) for (let i = 1; i < path.frames.length; i += 1) {
    const a = path.frames[i - 1], b = path.frames[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    const width = Math.max(a.halfWidthMetres, b.halfWidthMetres);
    if (!finite(length, width) || width < 0) return true;
    if (reach && diskBeyondPolygonReach((a.x + b.x) / 2, (a.z + b.z) / 2,
      Math.hypot(width + P.staticClearanceMetres, length / 2 + width + P.staticClearanceMetres), reach)) continue;
    if (boxOverlapsPolygon({ centre: { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 },
      halfExtents: { x: width + P.staticClearanceMetres, y: 1,
        z: length / 2 + width + P.staticClearanceMetres },
      rotationY: Math.atan2(b.x - a.x, b.z - a.z), surface: 'pavement' }, polygon)) return true;
  }
  // Testing every non-footpath source conservatively includes the full admitted
  // driveway/parking/turning court, not merely a vehicle's current centre.
  function overlaps(boundary: readonly Pick<Vec3, 'x' | 'z'>[]): boolean {
    for (const shape of [polygon, boundary]) for (let i = 0; i < shape.length; i += 1) {
      const a = shape[i], b = shape[(i + 1) % shape.length], nx = b.z - a.z, nz = a.x - b.x;
      const one = polygon.map(p => p.x * nx + p.z * nz), two = boundary.map(p => p.x * nx + p.z * nz);
      if (Math.max(...one) <= Math.min(...two) + P.epsilon || Math.max(...two) <= Math.min(...one) + P.epsilon) return false;
    }
    return true;
  }
  if ((plan.populationGroundSources ?? []).some(source => source.purpose !== 'footpath'
    && source.polygons.some(boundary => !(aligned && boundaryOutsideAligned(boundary, aligned)) && overlaps(boundary)))) return true;
  return (plan.populationCrossings ?? []).some(crossing => !(aligned && boundaryOutsideAligned(crossing.corners, aligned))
    && overlaps(crossing.corners.map(point => ({ ...point, y: 0 }))));
}
function candidate(plan: DistrictActivityPlan, group: DistrictPublicGroup, front: DistrictFrontage, validation:PopulationValidationScope): {
  site: AuthoredDistrictActivitySite; source: PopulationGroundSource; walk?: AuthoredPopulationPath;
} | string {
  const benchIndex = group.propIndices.find(index => plan.props?.[index]?.kind === 'bench');
  const bench = benchIndex === undefined ? undefined : plan.props?.[benchIndex];
  if (!bench || benchIndex === undefined || !finite(bench.position.x, bench.position.y, bench.position.z,
    bench.rotationY, front.yaw, front.width, front.reach) || Math.cos(bench.rotationY - front.yaw) < 1 - P.epsilon) return 'missing-actual-bench';
  // A retained shop approach need not own a full facade walk. Refuse an island
  // rest pad rather than inventing a grass connection or overriding its site.
  if (!front.patchIds.length || !front.patchIds.some(id => id.includes('-base-'))) return 'no-owned-connected-base-walk';
  const ids = [...front.patchIds, ...group.groundPatchIds];
  const owned = ids.map(id => plan.groundSurfacePatches?.find(patch => patch.id === id));
  if (owned.some(patch => !patch || !patch.triangles.length)) return 'missing-owned-footway';
  const sourceId = `district-activity/${group.id}/footway`;
  const source: PopulationGroundSource = { id: sourceId, purpose: 'footpath',
    hostSegmentIds: [front.streetSegmentId], sourcePropIndex: benchIndex,
    polygons: owned.flatMap(patch => patch!.triangles.map(triangle => triangle.vertices)), groundPatchIds: ids };
  const working: LevelPlan = { ...plan, populationGroundSources: [...(plan.populationGroundSources ?? []), source] };
  const sampler = new PlanTerrainSampler(working), context = validation(working);
  const x = localX(front, bench.position), side = Math.sign(x);
  if (!side || Math.abs(x) <= front.width / 2) return 'bench-not-beside-frontage';
  const edge = side * (front.width / 2 + DISTRICT_ACTIVITY.edgeApproachMetres);
  const near = at(front, 0, DISTRICT_ACTIVITY.baseWalkMetres), elbow = at(front, edge, DISTRICT_ACTIVITY.baseWalkMetres);
  // A narrow side passage beside the actual bench needs its turn inside the
  // wider base walk. Turning at the old 1.2 m depth swept the bench corner;
  // shifting the same late turn left would leave the owned pad instead.
  const approachNear = at(front, 0, DISTRICT_ACTIVITY.approachTurnDepthMetres);
  const approachElbow = at(front, edge, DISTRICT_ACTIVITY.approachTurnDepthMetres);
  const turn = at(front, edge, DISTRICT_ACTIVITY.frontStandingMetres);
  const centre = at(front, x, DISTRICT_ACTIVITY.frontStandingMetres);
  const positions: AuthoredDistrictActivitySite['positions'] = [
    { position: at(front, x - P.socialSpacingMetres / 2, DISTRICT_ACTIVITY.frontStandingMetres), headingY: front.yaw + Math.PI / 2 },
    { position: at(front, x + P.socialSpacingMetres / 2, DISTRICT_ACTIVITY.frontStandingMetres), headingY: front.yaw - Math.PI / 2 },
  ];
  // Occupied activity starts on the admitted base walk. The district report
  // separately owns/proves base -> access -> street connectivity. Actors do
  // not traverse that access stretch or borrow its existing street-side band.
  // Every occupied walk/approach/support still reserves all original lanes.
  // The approach's validation band admits a bounded turn across one trace
  // span; exact source-triangle coverage remains the actual footprint owner.
  const approachFrames = trace(sampler, [approachNear, approachElbow, turn, centre], front.yaw, sourceId, true);
  const site: AuthoredDistrictActivitySite = { id: `district-activity/${group.id}`, groupId: group.id,
    district: group.district, sourceId, sourcePropIndex: benchIndex, approachFrames, positions };
  // One call-scoped movement index of `plan` serves every check below.
  let lanes: MovementBands | undefined;
  const check = (frames: readonly AuthoredPathFrame[]): string | null => {
    const path: AuthoredPopulationPath = { id: site.id, role: 'pedestrian', district: site.district,
      closed: false, serviceShuttle: false, frames };
    for (let i = 1; i < frames.length; i += 1) {
      const reason = populationPathSpanReason(working, sampler, frames[i - 1], frames[i], path, context);
      if (reason) return `approach-${reason}/span-${i}/${frames[i - 1].x},${frames[i - 1].z}->${frames[i].x},${frames[i].z}`;
      for (const footprint of populationSpanFootprints(working, sampler, frames[i - 1], frames[i], 'pedestrian'))
        if (meetsOriginalLane(plan, footprint.polygon.map(point => ({ ...point, y: 0 })),
          lanes ??= movementBands(plan, P.staticClearanceMetres))) return `owned-movement-lane/span-${i}/${frames[i - 1].x},${frames[i - 1].z}->${frames[i].x},${frames[i].z}`;
    }
    return null;
  };
  const approachReason = check(approachFrames); if (approachReason) return approachReason;
  for (const position of positions) {
    const axis = [-1, 1].map(sign => ({ ...position.position,
      x: position.position.x + Math.sin(position.headingY) * sign * DISTRICT_ACTIVITY.supportHalfAxisMetres,
      z: position.position.z + Math.cos(position.headingY) * sign * DISTRICT_ACTIVITY.supportHalfAxisMetres }));
    const reason = check(trace(sampler, axis, position.headingY, sourceId)); if (reason) return `standing-${reason}`;
  }
  // This is an actual facade-side walk; short pads do not receive a fake loop.
  const walking = trace(sampler, [near, elbow], front.yaw + side * Math.PI / 2, sourceId);
  const walkingLength = walking.at(-1)?.distanceMetres ?? 0;
  const walk = walkingLength >= P.minimumWalkMetres && !check(walking)
    ? { id: `${site.id}/facade-walk`, role: 'pedestrian' as const, district: group.district,
      frames: walking, closed: false, serviceShuttle: false } : undefined;
  return { site, source, ...(walk ? { walk } : {}) };
}
/** Move only a bench explicitly owned by our new rest group. The full bench
 * footprint is re-admitted on the existing exact group pad; all original props
 * and non-owned colliders remain protected. No surface is manufactured. */
function adjustedBench(plan: DistrictActivityPlan, group: DistrictPublicGroup,
  front: DistrictFrontage, shift: number, validation:PopulationValidationScope): { plan: DistrictActivityPlan;
    relocation: NonNullable<DistrictActivityReport['relocations']>[number] } | null {
  const propIndex = group.propIndices.find(index => plan.props?.[index]?.kind === 'bench');
  const bench = propIndex === undefined ? undefined : plan.props?.[propIndex];
  if (!bench || propIndex === undefined || !finite(shift) || shift <= 0) return null;
  const originalPropCount = (plan.props?.length ?? 0) - (plan.districtAdjacency?.addedProps ?? 0);
  if (!Number.isSafeInteger(originalPropCount) || originalPropCount < 0 || propIndex < originalPropCount) return null;
  const shape = PROP_SOLIDS.bench!;
  const matching = (plan.solids ?? []).flatMap((box, index) =>
    Math.abs(box.centre.x - bench.position.x) < P.epsilon
    && Math.abs(box.centre.z - bench.position.z) < P.epsilon
    && Math.abs(box.centre.y - bench.position.y - shape.height * bench.scale / 2) < P.epsilon
    && Math.abs(box.halfExtents.x - shape.halfX * bench.scale) < P.epsilon
    && Math.abs(box.halfExtents.z - shape.halfZ * bench.scale) < P.epsilon
    && Math.abs(box.halfExtents.y - shape.height * bench.scale / 2) < P.epsilon
    && Math.cos(box.rotationY - bench.rotationY) > 1 - P.epsilon ? [index] : []);
  if (matching.length !== 1) return null;
  const solidIndex = matching[0];
  const originalSolidCount = (plan.solids?.length ?? 0) - (plan.districtAdjacency?.addedSolids ?? 0);
  if (!Number.isSafeInteger(originalSolidCount) || originalSolidCount < 0 || solidIndex < originalSolidCount) return null;
  const without = { ...plan, solids: plan.solids?.filter((_, index) => index !== solidIndex) };
  const side = Math.sign(localX(front, bench.position));
  const destination = { x: bench.position.x + Math.cos(front.yaw) * side * shift,
    y: bench.position.y, z: bench.position.z - Math.sin(front.yaw) * side * shift };
  const sampler = new PlanTerrainSampler(without), ground = sampler.sampleGround(destination.x, destination.z, createGroundSample());
  if (ground.offCourse || !finite(ground.height, ground.normal.x, ground.normal.y, ground.normal.z)
    || ground.normal.y < 1 / Math.sqrt(1 + P.maximumGroundGrade ** 2)
    || Math.abs(ground.height - bench.position.y) > P.maximumStepMetres) return null;
  destination.y = ground.height;
  const c = Math.cos(bench.rotationY), sn = Math.sin(bench.rotationY);
  const polygon = [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: destination.x + c * x * (shape.halfX * bench.scale + P.staticClearanceMetres)
      + sn * z * (shape.halfZ * bench.scale + P.staticClearanceMetres),
    z: destination.z - sn * x * (shape.halfX * bench.scale + P.staticClearanceMetres)
      + c * z * (shape.halfZ * bench.scale + P.staticClearanceMetres) })));
  // Polygon vertices are ordered explicitly for exact clipping/SAT.
  const ordered = [polygon[0], polygon[2], polygon[3], polygon[1]];
  const patches = group.groundPatchIds.map(id => plan.groundSurfacePatches?.find(patch => patch.id === id));
  if (patches.some(patch => !patch)) return null;
  const owned: PopulationGroundSource = { id: `${group.id}/bench-adjustment`, purpose: 'footpath',
    hostSegmentIds: [front.streetSegmentId], groundPatchIds: group.groundPatchIds,
    polygons: patches.flatMap(patch => patch!.triangles.map(triangle => triangle.vertices)) };
  if (!groundSourceCovers(owned, ordered) || meetsOriginalLane(plan, ordered.map(point => ({ ...point, y: destination.y })))) return null;
  const context = validation(without);
  const footprint = { polygon: ordered, minY: destination.y, maxY: destination.y + shape.height * bench.scale,
    fromFraction: 0, toFraction: 1, fromHull: { x: destination.x, z: destination.z, headingY: bench.rotationY,
      halfWidthMetres: shape.halfX * bench.scale, halfLengthMetres: shape.halfZ * bench.scale,
      minY: destination.y, maxY: destination.y + shape.height * bench.scale, velocityX: 0, velocityZ: 0 },
    toHull: { x: destination.x, z: destination.z, headingY: bench.rotationY,
      halfWidthMetres: shape.halfX * bench.scale, halfLengthMetres: shape.halfZ * bench.scale,
      minY: destination.y, maxY: destination.y + shape.height * bench.scale, velocityX: 0, velocityZ: 0 } };
  if (populationFootprintExclusion(without, footprint, context)
    || !surfaceFootprintClear(without, ordered, new Set<SurfaceId>(['pavement','roughPavement','brick']), context)) return null;
  const changed = { ...bench, position: destination };
  const collider = { ...plan.solids![solidIndex], centre: { x: destination.x,
    y: destination.y + shape.height * bench.scale / 2, z: destination.z } };
  return { plan: { ...plan, props: plan.props!.map((prop, index) => index === propIndex ? changed : prop),
    solids: plan.solids!.map((box, index) => index === solidIndex ? collider : box) },
    relocation: { groupId: group.id, propIndex, solidIndex, from: { ...bench.position }, to: destination } };
}
/** Admit physical endpoint furniture on the already owned base triangles.
 * Full prop spread/height, source support, all original lanes and all existing
 * activity sweeps must remain clear. There is no paving or grass override. */
function furnished(plan: DistrictActivityPlan, front: DistrictFrontage, source: PopulationGroundSource,
  kind: 'bench' | 'litterBin' | 'fenceBay', x: number, z: number, scale: number, yaw: number,
  validation:PopulationValidationScope, retainedJson:(plan:LevelPlan,selector:typeof streetFronts|typeof environmentSites|typeof residentialSites)=>string):
  { plan: DistrictActivityPlan; entry: NonNullable<DistrictActivityReport['furnishings']>[number] } | string {
  const shape = PROP_SOLIDS[kind]!, spread = PROP_SPREADS[kind];
  const atGround = at(front,x,z), sampler = new PlanTerrainSampler(plan);
  const ground = sampler.sampleGround(atGround.x,atGround.z,createGroundSample());
  if (ground.offCourse || !finite(ground.height,ground.normal.x,ground.normal.y,ground.normal.z)
    || ground.normal.y < 1/Math.sqrt(1+P.maximumGroundGrade**2)) return 'ground';
  const position = { ...atGround,y:ground.height }, c = Math.cos(yaw), sn = Math.sin(yaw);
  const halfX = (spread.shape === 'circle' ? spread.radius : spread.halfX)*scale + P.staticClearanceMetres;
  const halfZ = (spread.shape === 'circle' ? spread.radius : spread.halfZ)*scale + P.staticClearanceMetres;
  const polygon = [[-halfX,-halfZ],[halfX,-halfZ],[halfX,halfZ],[-halfX,halfZ]].map(([lx,lz]) => ({
    x:position.x+c*lx+sn*lz,y:position.y,z:position.z-sn*lx+c*lz }));
  const context = validation(plan);
  if (!groundSourceCovers(source,polygon,context.sourceCoverage.get(source))) return 'unowned-footprint';
  if (districtActivityReservedLane(plan,polygon,undefined,undefined,context)) return 'reserved-lane';
  const fromHull = { x:position.x,z:position.z,headingY:yaw,halfWidthMetres:shape.halfX*scale,
    halfLengthMetres:shape.halfZ*scale,minY:position.y,maxY:position.y+shape.height*scale,velocityX:0,velocityZ:0 };
  const reason = populationFootprintExclusion(plan,{polygon,minY:fromHull.minY,maxY:fromHull.maxY,
    fromFraction:0,toFraction:1,fromHull,toHull:fromHull},context);
  if (reason) return reason;
  if (!surfaceFootprintClear(plan,polygon,new Set<SurfaceId>(['pavement','roughPavement','brick']),context)) return 'surface';
  for (const corner of polygon) {
    const support = sampler.sampleGround(corner.x,corner.z,createGroundSample());
    if (support.offCourse || Math.abs(support.height-position.y)>P.maximumStepMetres
      || support.normal.y<1/Math.sqrt(1+P.maximumGroundGrade**2)) return 'support';
  }
  // The real rendered spread also reserves original canopy/building extents.
  // An original prop is never removed just to admit a threshold object.
  const polygonReach = polygonBoxReach(polygon);
  if ((plan.props ?? []).some(prop => {
    const spread = PROP_SPREADS[prop.kind], box = { centre:prop.position,
      halfExtents:{x:(spread.shape==='circle'?spread.radius:spread.halfX*(prop.size?.x??1))*prop.scale,
        y:1,z:(spread.shape==='circle'?spread.radius:spread.halfZ*(prop.size?.z??1))*prop.scale},
      rotationY:prop.rotationY,surface:'pavement' as const };
    return boxOverlapsPolygonWithin(box,polygon,polygonReach);
  })) return 'prop-spread';
  const prop: Prop = { kind,position,rotationY:yaw,scale };
  const solid: BoxCollider = { centre:{x:position.x,y:position.y+shape.height*scale/2,z:position.z},
    halfExtents:{x:shape.halfX*scale,y:shape.height*scale/2,z:shape.halfZ*scale},rotationY:yaw,
    surface:shape.surface,...(shape.occludes?{}:{occludes:false}) };
  const candidatePlan = { ...plan,props:[...(plan.props??[]),prop],solids:[...(plan.solids??[]),solid] };
  for (const selector of [streetFronts,environmentSites,residentialSites])
    if (JSON.stringify(selector(candidatePlan))!==retainedJson(plan,selector)) return 'protected-retained-opening';
  const candidateContext=validation(candidatePlan),candidateSampler=new PlanTerrainSampler(candidatePlan);
  for (const walk of plan.populationActivityWalks ?? []) {
    const blocked = districtActivityWalkReason(candidatePlan,walk,candidateSampler,candidateContext);
    if (blocked) return `activity-walk-${blocked}`;
  }
  for (const existing of plan.populationActivitySites ?? []) {
    const group = plan.districtAdjacency?.groups.find(item=>item.id===existing.groupId);
    const host = plan.districtAdjacency?.frontages.find(item=>item.id===group?.frontageId);
    if (!group || !host || typeof candidate(candidatePlan,group,host,validation)==='string') return 'protected-existing-activity';
  }
  return { plan:candidatePlan,entry:{frontageId:front.id,
    use:front.district==='industrial'?'staff-service-edge':front.district==='residential'?'domestic-threshold'
      :front.district==='park'?'rest-stop':'visitor-wait',
    propIndex:plan.props?.length??0,solidIndex:plan.solids?.length??0,
    groundPatchIds:source.groundPatchIds,prop,solid} };
}
function withDistrictFurnishings(source: DistrictActivityPlan,validation:PopulationValidationScope): DistrictActivityPlan {
  const report = source.districtActivity!;
  // Only the unchanged incumbent selections are reused. Every proposed solid
  // still invokes all reached authoritative selectors in their original order.
  let incumbent:LevelPlan|undefined;
  const selected=new Map<typeof streetFronts|typeof environmentSites|typeof residentialSites,string>();
  const retainedJson=(plan:LevelPlan,selector:typeof streetFronts|typeof environmentSites|typeof residentialSites):string=>{
    if(incumbent!==plan){incumbent=plan;selected.clear();}
    let value=selected.get(selector);
    if(value===undefined){value=JSON.stringify(selector(plan));selected.set(selector,value);}
    return value;
  };
  const entries: NonNullable<DistrictActivityReport['furnishings']>[number][] = [];
  const rejected: NonNullable<DistrictActivityReport['rejectedFurnishings']>[number][] = [];
  let working = source;
  for (const walk of source.populationActivityWalks ?? []) {
    if (walk.owner!=='frontage' || entries.length>=DISTRICT_ACTIVITY.maximumFurnishings) continue;
    const front=source.districtAdjacency?.frontages.find(item=>item.id===walk.frontageId);
    const ground=source.populationGroundSources?.find(item=>item.id===walk.sourceId);
    if (!front || !ground) continue;
    const oldGroup = source.districtAdjacency?.groups.find(item=>item.frontageId===front.id);
    const oldBench = oldGroup?.propIndices.map(index=>source.props?.[index]).find(prop=>prop?.kind==='bench');
    const side = oldBench ? -Math.sign(localX(front,oldBench.position)) :
      Number.parseInt(hash128(front.id).slice(0,1),16)%2 ? 1 : -1;
    const specs: readonly ['bench'|'litterBin'|'fenceBay',number,number,number,number][] = front.district==='industrial'
      ? [['litterBin',-front.width/2+0.65,1.05,1,front.yaw],
         ['fenceBay',front.width/2-1.25,1.70,0.85,front.yaw+Math.PI/2]]
      : front.district==='residential'
        ? [['fenceBay',side*(front.width/2-1.25),1.70,0.85,front.yaw+Math.PI/2],
           ['litterBin',-side*(front.width/2-0.65),1.05,1,front.yaw]]
        : [['bench',side*(front.width/2-1.10),1.05,1,front.yaw],
           ['litterBin',-side*(front.width/2-0.65),1.05,1,front.yaw]];
    for (const [kind,x,z,scale,yaw] of specs) {
      if (entries.length>=DISTRICT_ACTIVITY.maximumFurnishings) break;
      const result=furnished(working,front,ground,kind,x,z,scale,yaw,validation,retainedJson);
      if (typeof result==='string') {rejected.push({frontageId:front.id,kind,reason:result});continue;}
      working=result.plan;entries.push(result.entry);
    }
  }
  const beforeParts=new Map<PropPartId,number>(), addedParts=new Map<PropPartId,number>();
  for (const prop of source.props??[]) propPartCounts(prop,beforeParts);
  for (const entry of entries) propPartCounts(entry.prop,addedParts);
  let colourTriangles=0,shadowTriangles=0,additionalColourDrawCalls=0,additionalShadowDrawCalls=0;
  for (const [part,count] of addedParts) {
    const cost=PART_COSTS[part];colourTriangles+=cost.triangles*count;
    if (cost.castsShadow) shadowTriangles+=cost.triangles*count;
    if (!beforeParts.has(part)) {additionalColourDrawCalls+=1;if(cost.castsShadow)additionalShadowDrawCalls+=1;}
  }
  const id=entries.length?`district-life-r1-${hash128(JSON.stringify([source.id,entries]))}`:source.id;
  return { ...working,id,districtActivity:{...report,physicalWorldId:id,furnishings:entries,rejectedFurnishings:rejected,
    furnishingCost:{propCount:entries.length,solidCount:entries.length,colourTriangles,shadowTriangles,
      additionalColourDrawCalls,additionalShadowDrawCalls,partInstances:[...addedParts].map(([id,count])=>({id,count}))}} };
}

/** Give complete admitted base walks an ordinary visitor/worker route.
 * Furniture stays in its actual rest pad, and its narrow approach is no longer
 * a prerequisite for an entire commercial frontage to have visible life. */
function frontageWalk(plan: DistrictActivityPlan, front: DistrictFrontage, sampler: TerrainSampler,validation:PopulationValidationScope): {
  source: PopulationGroundSource; path: AuthoredPopulationPath; walk: AuthoredDistrictActivityWalk;
} | string {
  if (!front.patchIds.some(id => id.includes('-base-'))
    || !front.patchIds.some(id => id.includes('-access-') || id.includes('-service-apron-'))) return 'no-owned-connected-base-walk';
  const patches = front.patchIds.map(id => plan.groundSurfacePatches?.find(patch => patch.id === id));
  if (patches.some(patch => !patch || !patch.triangles.length)) return 'missing-owned-footway';
  const half = front.width/2 - DISTRICT_ACTIVITY.walkEndpointMarginMetres;
  if (!finite(half,front.position.x,front.position.y,front.position.z,front.yaw)
    || half*2 < P.minimumWalkMetres) return 'short-base-walk';
  const id = `district-activity/walk/${front.id}`, sourceId = `${id}/owned-ground`;
  const source: PopulationGroundSource = { id: sourceId, purpose: 'footpath',
    hostSegmentIds: [front.streetSegmentId], sourcePropIndex: front.propIndex,
    groundPatchIds: front.patchIds,
    polygons: patches.flatMap(patch => patch!.triangles.map(triangle => triangle.vertices)) };
  const working = { ...plan, populationGroundSources: [...(plan.populationGroundSources ?? []),source] };
  const failures: string[] = [];
  for (const depth of DISTRICT_ACTIVITY.walkDepthChoicesMetres) {
    const path: AuthoredPopulationPath = { id, role: 'pedestrian', district: front.district,
      frames: trace(sampler,[at(front,-half,depth),at(front,half,depth)],front.yaw+Math.PI/2,sourceId),
      closed: false, serviceShuttle: false };
    const walk: AuthoredDistrictActivityWalk = { id: `${id}/use`, pathId: id,
      pathDigest: hash128(JSON.stringify(path)), district: front.district,
      kind: front.district === 'industrial' ? 'worker' : front.district === 'park' ? 'jogger' : 'walker',
      intent: front.district === 'industrial' ? 'foot-service' : front.district === 'park' ? 'park-exercise' : 'frontage-visit',
      owner: 'frontage', frontageId: front.id, sourceId, sourcePropIndex: front.propIndex };
    const checked = { ...working, populationPaths: [...(plan.populationPaths ?? []),path] };
    const reason = districtActivityWalkReason(checked,walk,sampler,validation(checked));
    if (!reason) return { source,path,walk };
    failures.push(`depth-${depth}:${reason}`);
  }
  return failures.join('|');
}

/** Native park paths already carry their source band and full original trace.
 * Only entirely admitted paths become purposeful exercise areas. No bare grass
 * connector, new paving, endpoint wrap, or vehicle route is manufactured. */
function withDistrictWalks(plan: DistrictActivityPlan, choiceWorldId: string,validation:PopulationValidationScope): DistrictActivityPlan {
  const walks: AuthoredDistrictActivityWalk[] = [], paths: AuthoredPopulationPath[] = [], sources: PopulationGroundSource[] = [];
  const rejectedWalks: { pathId: string; reason: string }[] = [];
  let working = plan;
  const physicalSampler=new PlanTerrainSampler(plan);
  const districts = ['commercial','industrial','residential','park'] as const;
  for (const district of districts) {
    let count = 0;
    for (const front of plan.districtAdjacency?.frontages.filter(item => item.district === district) ?? []) {
      if (walks.length >= DISTRICT_ACTIVITY.maximumWalks || count >= DISTRICT_ACTIVITY.maximumFrontageWalksPerDistrict) break;
      const result = frontageWalk(working,front,physicalSampler,validation);
      if (typeof result === 'string') { rejectedWalks.push({ pathId: `district-activity/walk/${front.id}`, reason: result }); continue; }
      walks.push(result.walk); paths.push(result.path); sources.push(result.source); count += 1;
      working = { ...working, populationGroundSources: [...(working.populationGroundSources ?? []),result.source],
        populationPaths: [...(working.populationPaths ?? []),result.path] };
    }
  }
  let parks = 0;
  for (const original of plan.populationPaths ?? []) {
    if (walks.length >= DISTRICT_ACTIVITY.maximumWalks || parks >= DISTRICT_ACTIVITY.maximumFrontageWalksPerDistrict) break;
    if (original.role !== 'pedestrian' || original.district !== 'park' || original.id.startsWith('district-activity/')) continue;
    const sampler=physicalSampler, context=validation(working);
    const ranges: [number,number][]=[];let first=0;
    for(let index=1;index<original.frames.length;index+=1){
      const a=original.frames[index-1],b=original.frames[index];
      const reason=populationPathSpanReason(working,sampler,a,b,original,context);
      const reserved=populationSpanFootprints(working,sampler,a,b,'pedestrian')
        .some(footprint=>districtActivityReservedLane(working,footprint.polygon,original.id,undefined,context));
      if(reason||reserved){if(index-1>first)ranges.push([first,index-1]);first=index;}
    }
    if(original.frames.length-1>first)ranges.push([first,original.frames.length-1]);
    ranges.sort((a,b)=>(original.frames[b[1]].distanceMetres-original.frames[b[0]].distanceMetres)
      -(original.frames[a[1]].distanceMetres-original.frames[a[0]].distanceMetres)||a[0]-b[0]);
    let admitted=false;const failures:string[]=[];
    for(const range of ranges){
      const start=original.frames[range[0]].distanceMetres;
      if(original.frames[range[1]].distanceMetres-start<P.minimumWalkMetres)continue;
      const entire=range[0]===0&&range[1]===original.frames.length-1&&!original.closed;
      const path:AuthoredPopulationPath=entire?original:{...original,
        id:`district-activity/walk/park/${original.id}/span-${range[0]}-${range[1]}`,
        frames:original.frames.slice(range[0],range[1]+1).map(frame=>({...frame,distanceMetres:frame.distanceMetres-start})),
        closed:false,serviceShuttle:false};
      const walk: AuthoredDistrictActivityWalk = { id:`district-activity/park/${original.id}/span-${range[0]}-${range[1]}`,
        pathId:path.id,pathDigest:hash128(JSON.stringify(path)),district:'park',kind:parks===0?'jogger':'walker',
        intent:'park-exercise',owner:'authored-path',originalPathId:original.id,
        originalPathDigest:hash128(JSON.stringify(original)),originalFrameRange:range };
      const checked=entire?working:{...working,populationPaths:[...(working.populationPaths??[]),path]};
      const reason=districtActivityWalkReason(checked,walk,sampler,checked===working?context:validation(checked));
      if(reason){failures.push(`span-${range[0]}-${range[1]}:${reason}`);continue;}
      walks.push(walk);parks+=1;admitted=true;
      if(!entire){working=checked;paths.push(path);}break;
    }
    if(!admitted)rejectedWalks.push({pathId:`district-activity/park/${original.id}`,
      reason:failures.join('|')||'no-complete-safe-original-span'});
  }
  const old = plan.districtActivity ?? { revision: 'district-life-r1' as const,
    sourceWorldId: choiceWorldId, physicalWorldId: plan.id, acceptedSiteIds: [], rejected: [] };
  const id = walks.length ? `district-life-r1-${hash128(JSON.stringify([plan.id,P.activityWalkPolicyRevision,walks,sources,paths]))}` : plan.id;
  return withDistrictFurnishings({ ...working,id,populationActivityWalks: walks,populationActivityChoiceWorldId: choiceWorldId,
    districtActivity: { ...old,physicalWorldId: id,walkRevision: P.activityWalkPolicyRevision,
      acceptedWalkIds: walks.map(walk => walk.id),rejectedWalks } },validation);
}

/** New physical people receive a new world key; old records/ghosts remain old.
 * Existing actor choices keep their old source hash, and no seed stream moves. */
export function withDistrictActivity(source: DistrictActivityPlan): DistrictActivityPlan {
  if (source.districtActivity?.walkRevision) return source;
  const validation=createPopulationValidationScope();
  if (source.districtActivity) return withDistrictWalks(source,
    source.populationActivityChoiceWorldId ?? source.districtActivity.sourceWorldId,validation);
  if (!source.districtAdjacency?.frontages.length
    && !source.populationPaths?.some(path=>path.role==='pedestrian' && path.district==='park')) return source;
  const sites: AuthoredDistrictActivitySite[] = [], sources: PopulationGroundSource[] = [], paths: AuthoredPopulationPath[] = [];
  const rejected: { groupId: string; reason: string }[] = [];
  const relocations: NonNullable<DistrictActivityReport['relocations']>[number][] = [];
  let working = source;
  for (const group of (source.districtAdjacency?.groups ?? []).slice(0, DISTRICT_ACTIVITY.maximumSites)) {
    const front = source.districtAdjacency?.frontages.find(item => item.id === group.frontageId);
    let result = front ? candidate(working, group, front,validation) : 'missing-actual-frontage';
    let acceptedAdjustment: ReturnType<typeof adjustedBench> = null;
    const attempts: string[] = [];
    if (typeof result === 'string' && front) for (const shift of DISTRICT_ACTIVITY.benchSideAdjustmentsMetres) {
      const adjusted = adjustedBench(working, group, front, shift,validation);
      if (!adjusted) { attempts.push(`bench+${shift}:placement-refused`); continue; }
      const attempt = candidate(adjusted.plan, group, front,validation);
      if (typeof attempt !== 'string') { result = attempt; acceptedAdjustment = adjusted; break; }
      attempts.push(`bench+${shift}:${attempt}`);
    }
    if (typeof result === 'string') { rejected.push({ groupId: group.id, reason: [result, ...attempts].join('|') }); continue; }
    if (acceptedAdjustment) { working = acceptedAdjustment.plan; relocations.push(acceptedAdjustment.relocation); }
    sites.push(result.site); sources.push(result.source); if (result.walk) paths.push(result.walk);
  }
  if (!sites.length) return withDistrictWalks({ ...source, districtActivity: { revision: 'district-life-r1',
    sourceWorldId: source.id, physicalWorldId: source.id, acceptedSiteIds: [], rejected } },source.id,validation);
  const id = `district-life-r1-${hash128(JSON.stringify([source.id, sites, sources, paths, relocations]))}`;
  return withDistrictWalks({ ...working, id, populationActivitySites: sites, populationActivityChoiceWorldId: source.id,
    populationGroundSources: [...(source.populationGroundSources ?? []), ...sources],
    populationPaths: [...(source.populationPaths ?? []), ...paths],
    districtActivity: { revision: 'district-life-r1', sourceWorldId: source.id, physicalWorldId: id,
      acceptedSiteIds: sites.map(site => site.id), rejected, ...(relocations.length ? { relocations } : {}) } },source.id,validation);
}
