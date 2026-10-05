/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Physical district finishing, derived from a finished source plan.
 * The existing art selectors remain owners of shops/domestic/depot openings.
 * This supplement owns connected base walks, street-edge walks and sparse
 * shared seating/planting groups. Every new surface follows source triangles;
 * every reachable object contributes the same collider as the existing kit. */
import { PROP_FOOTPRINTS, PROP_SOLIDS, PROP_SPREADS, PROP_VERTICAL_SPANS, type PropKind } from '../data/props.ts';
import { POPULATION_AUTHORING as P } from '../data/tuning.ts';
import { PROP_CORRIDOR_CLEARANCE, fieldHeightAt } from './buildPlan.ts';
import type { BoxCollider, GroundSurfacePatch, LevelPlan, Prop, Segment } from './plan.ts';
import { querySegment, type PlacedSegment } from './segments.ts';
import { exactBuildingBody, finiteBox, nearestPavedStreetStation, sourceGroundSurfaceAt } from './protectedSiteEligibility.ts';
import { alignedPolygonExtent, boundaryOutsideAligned, boxOverlapsPolygon, boxOverlapsPolygonWithin, clippedFieldTriangles,
  apartFromConvex, convexExtent, diskBeyondPolygonReach, movementBands, movementBandsMeet, pavedCrossSection, polygonBoxReach, streetFronts,
  type MovementBands } from './streetFronts.ts';
import { environmentSites } from './environmentSites.ts';
import { residentialSites } from './districtSites.ts';
import { createPopulationValidationScope, populationFootprintExclusion, surfaceFootprintClear,
  type District, type PopulationValidationContext, type PopulationValidationScope } from './populationPlan.ts';
import { hash128 } from './planDigest.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';

export const DISTRICT_ADJACENCY = Object.freeze({
  revision: 'district-v1', maximumFrontages: 48, maximumPublicGroups: 4,
  maximumStreetGapMetres: 32, minimumFacingCosine: 0.92,
  baseWalkDepthMetres: 2.1, approachWidthMetres: 2,
  streetWalkWidthMetres: 2, maximumLinkGapMetres: 32,
  maximumBaseWidthMetres: 28, maximumGroupGroundRiseMetres: 0.12,
  groupWidthMetres: 4.8, groupDepthMetres: 3.8,
});
export interface DistrictFrontage {
  readonly id: string; readonly propIndex: number; readonly district: District;
  readonly role: 'frontage-lawn' | 'commercial-forecourt' | 'service-edge' | 'civic-margin';
  readonly streetSegmentId: string; readonly position: Vec3; readonly yaw: number;
  readonly width: number; readonly reach: number; readonly retainedOpening: boolean;
  readonly patchIds: readonly string[];
}
export interface DistrictPublicGroup {
  readonly id: string; readonly district: District; readonly frontageId: string;
  readonly groundPatchIds: readonly string[]; readonly propIndices: readonly number[];
}
export interface DistrictAdjacencyReport {
  readonly revision: 'district-v1'; readonly sourceWorldId: string; readonly physicalWorldId: string;
  readonly frontages: readonly DistrictFrontage[]; readonly links: readonly string[];
  readonly groups: readonly DistrictPublicGroup[];
  readonly rejected: readonly { readonly propIndex: number; readonly reason: string }[];
  readonly addedTriangles: number; readonly addedProps: number; readonly addedSolids: number;
  readonly addedSoftBodies: number;
  /** Segments whose riding arc could not be recovered from their sockets: added
   * props were kept off only their socket lines there. Absent when there are none. */
  readonly uncheckedCorridors?: readonly string[];
}
export type DistrictAdjacentPlan = LevelPlan & { readonly districtAdjacency?: DistrictAdjacencyReport };
type Frame = { readonly position: Vec3; readonly yaw: number };
type Site = DistrictFrontage & { readonly body: BoxCollider; readonly building: Prop; readonly street: Vec3;
  readonly contactLeft: number; readonly contactRight: number };
const PAVED: readonly SurfaceId[] = ['pavement', 'brick', 'roughPavement'];
const ALLOWED = new Set<SurfaceId>(['grass', ...PAVED]);
const CLIP = Object.freeze({ allowedSurfaces: [...ALLOWED], maximumHeightDifference: 0.35,
  maximumGradient: 0.12, maximumCellsPerPolygon: 512 });
const epsilon = 1e-9;
const at = (frame: Frame, x: number, z: number): Vec3 => ({
  x: frame.position.x + Math.cos(frame.yaw) * x + Math.sin(frame.yaw) * z,
  y: frame.position.y, z: frame.position.z - Math.sin(frame.yaw) * x + Math.cos(frame.yaw) * z,
});
const rectangle = (frame: Frame, left: number, right: number, near: number, far: number): Vec3[] =>
  [at(frame, left, near), at(frame, right, near), at(frame, right, far), at(frame, left, far)];
function polygonsOverlap(a: readonly Pick<Vec3, 'x' | 'z'>[], b: readonly Pick<Vec3, 'x' | 'z'>[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const first = polygon[i], last = polygon[(i + 1) % polygon.length];
    const x = last.z - first.z, z = first.x - last.x;
    const aa = a.map(point => point.x * x + point.z * z), bb = b.map(point => point.x * x + point.z * z);
    if (Math.max(...aa) <= Math.min(...bb) + epsilon || Math.max(...bb) <= Math.min(...aa) + epsilon) return false;
  }
  return true;
}
function footprint(plan: LevelPlan, polygon: readonly Vec3[], minY: number, maxY: number,
  context: PopulationValidationContext): boolean {
  return populationFootprintExclusion(plan, { polygon, minY, maxY, fromFraction: 0, toFraction: 1,
    fromHull: { x: 0, z: 0, headingY: 0, halfWidthMetres: 1, halfLengthMetres: 1,
      minY, maxY, velocityX: 0, velocityZ: 0 },
    toHull: { x: 0, z: 0, headingY: 0, halfWidthMetres: 1, halfLengthMetres: 1,
      minY, maxY, velocityX: 0, velocityZ: 0 } }, context) === null;
}
/** Reserve the full authored bands, including rejected drafts. A furnishing
 * cannot create a new obstruction on a lane by relying on a sampling centre. */
function meetsMovement(plan: LevelPlan, polygon: readonly Vec3[], lanes?: MovementBands): boolean {
  // Every test only returns true; the exact broad phases skip separated items.
  const indexed = movementBandsMeet(plan, lanes, P.staticClearanceMetres, polygon, 'sum',
    box => boxOverlapsPolygon(box, polygon), outline => polygonsOverlap(outline, polygon));
  if (indexed !== undefined) return indexed;
  const reach = polygonBoxReach(polygon), aligned = alignedPolygonExtent(polygon);
  for (const path of plan.populationPaths ?? []) for (let i = 1; i < path.frames.length; i++) {
    const a = path.frames[i - 1], b = path.frames[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z), width = Math.max(a.halfWidthMetres, b.halfWidthMetres);
    if (!Number.isFinite(length + width) || width < 0) return true;
    if (reach && diskBeyondPolygonReach((a.x + b.x) / 2, (a.z + b.z) / 2,
      Math.hypot(width + P.staticClearanceMetres, length / 2 + width + P.staticClearanceMetres), reach)) continue;
    const box: BoxCollider = { centre: { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 },
      halfExtents: { x: width + P.staticClearanceMetres, y: 1, z: length / 2 + width + P.staticClearanceMetres },
      rotationY: Math.atan2(b.x - a.x, b.z - a.z), surface: 'pavement' };
    if (boxOverlapsPolygon(box, polygon)) return true;
  }
  for (const source of plan.populationGroundSources ?? []) if (source.purpose !== 'footpath'
    && source.polygons.some(boundary => !(aligned && boundaryOutsideAligned(boundary, aligned))
      && polygonsOverlap(boundary, polygon))) return true;
  return (plan.populationCrossings ?? []).some(crossing => !(aligned && boundaryOutsideAligned(crossing.corners, aligned))
    && polygonsOverlap(crossing.corners, polygon));
}
function patches(plan: LevelPlan, frame: Frame, id: string, left: number, right: number,
  near: number, far: number, validation: PopulationValidationScope, host?: BoxCollider): GroundSurfacePatch[] {
  if (!(right > left && far > near)) return [];
  const polygon = rectangle(frame, left, right, near, far);
  const validationPlan = host ? { ...plan, solids: plan.solids?.filter(box => box !== host) } : plan;
  const context = validation(validationPlan);
  if (!surfaceFootprintClear(validationPlan, polygon, ALLOWED, context)) return [];
  const triangles = clippedFieldTriangles(plan.heightfield, polygon, frame.position.y, CLIP);
  if (!triangles?.length) return [];
  const heights = triangles.flatMap(triangle => triangle.vertices.map(point => point.y));
  if (!footprint(validationPlan, polygon, Math.min(...heights), Math.max(...heights) + 2.2, context)) return [];
  // No coplanar duplicate draw and no override of somebody else's precise
  // ground. Shared borders may touch; positive-area overlap refuses whole.
  // polygonsOverlap tests every edge of both convex shapes and separates within
  // its tolerance, so a robustly convex triangle whose rectangle is apart from
  // the robustly convex rectangle's cannot overlap it.
  const polygonExtent = convexExtent(polygon);
  if ((plan.groundSurfacePatches ?? []).some(patch => patch.triangles.some(triangle =>
    !(polygonExtent && apartFromConvex(triangle.vertices, polygonExtent)) && polygonsOverlap(polygon, triangle.vertices)))) return [];
  const origin = at(frame, (left + right) / 2, 0);
  const f = { id, origin, yaw: frame.yaw, width: right - left, near, far };
  return [...ALLOWED].flatMap(sourceSurface => {
    const fragments = triangles.filter(triangle => plan.heightfield.surfaces[triangle.cell] === sourceSurface);
    return fragments.length ? [{ id: `${id}-${sourceSurface}`, sourceSurface,
      surface: sourceSurface === 'grass' ? 'pavement' as const : sourceSurface, footprint: f, triangles: fragments }] : [];
  });
}
function candidate(plan: LevelPlan, building: Prop, propIndex: number, retained: ReadonlySet<Prop>): Site | undefined {
  const size = building.size, body = exactBuildingBody(plan, building);
  if (!size || !body) return undefined;
  // Conservative socket-arc bounding boxes prune only distant streets. The
  // exact original arc solver still chooses the station and proves the face.
  const reach = Math.hypot(size.x, size.z) / 2 + DISTRICT_ADJACENCY.maximumStreetGapMetres;
  const streets = plan.segments.filter(segment => {
    const a = segment.entry, b = segment.exit, turn = Math.abs(b.headingY - a.headingY);
    if (!PAVED.includes(a.surface) || a.surface !== b.surface || turn > 0.2) return false;
    const bow = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) / 2 * Math.tan(turn / 4);
    return building.position.x >= Math.min(a.position.x, b.position.x) - reach - bow
      && building.position.x <= Math.max(a.position.x, b.position.x) + reach + bow
      && building.position.z >= Math.min(a.position.z, b.position.z) - reach - bow
      && building.position.z <= Math.max(a.position.z, b.position.z) + reach + bow;
  });
  const station = nearestPavedStreetStation(plan, building, streets);
  if (!station || !PAVED.includes(sourceGroundSurfaceAt(plan, station.point) as SurfaceId)
    || Math.abs(station.point.y - building.position.y) > 0.35) return undefined;
  const dx = station.point.x - building.position.x, dz = station.point.z - building.position.z;
  let face = 0, dot = -Infinity;
  for (let i = 0; i < 4; i++) {
    const yaw = building.rotationY + i * Math.PI / 2, value = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    if (value > dot) { face = i; dot = value; }
  }
  if (dot / station.distance < DISTRICT_ADJACENCY.minimumFacingCosine) return undefined;
  const yaw = building.rotationY + face * Math.PI / 2, depth = face % 2 ? size.x : size.z;
  const width = Math.min(DISTRICT_ADJACENCY.maximumBaseWidthMetres, face % 2 ? size.z : size.x);
  const gap = dot - depth / 2;
  if (width < 4 || gap < 2.6 || gap > DISTRICT_ADJACENCY.maximumStreetGapMetres) return undefined;
  const position = { x: building.position.x + Math.sin(yaw) * depth / 2,
    y: building.position.y, z: building.position.z + Math.cos(yaw) * depth / 2 };
  const frame = { position, yaw }, half = DISTRICT_ADJACENCY.approachWidthMetres / 2;
  let streetReach: number | undefined;
  for (let z = 0.25; z <= gap + 0.5 + epsilon; z += 0.25) {
    if (pavedCrossSection(plan.heightfield, at(frame, -half, z), at(frame, half, z), PAVED)
      && pavedCrossSection(plan.heightfield, at(frame, -half, z + 0.25), at(frame, half, z + 0.25), PAVED)) {
      streetReach = z + 0.25; break;
    }
  }
  if (streetReach === undefined || streetReach < DISTRICT_ADJACENCY.baseWalkDepthMetres) return undefined;
  const district: District = building.look === 'residential' || building.look === 'steeple' ? 'residential'
    : building.look === 'industrial' || building.look === 'waterTower' || building.look === 'chimneys' ? 'industrial'
      : building.look === 'clockTower' || building.look === 'lookout' ? 'park' : 'commercial';
  const role: DistrictFrontage['role'] = building.look === 'residential' ? 'frontage-lawn'
    : district === 'industrial' ? 'service-edge'
      : ['steeple', 'clockTower', 'lookout', 'beacon'].includes(building.look ?? '') ? 'civic-margin' : 'commercial-forecourt';
  let contactLeft = -half, contactRight = half;
  const retainedOpening = retained.has(building);
  if (retainedOpening) {
    const footprints = (plan.groundSurfacePatches ?? []).flatMap(patch => patch.footprint ? [patch.footprint] : []);
    const matching = footprints.filter(f => Math.cos(f.yaw - yaw) > 1 - epsilon
      && Math.abs(Math.sin(yaw) * (f.origin.x - position.x) + Math.cos(yaw) * (f.origin.z - position.z)) < 0.1
      && Math.abs(Math.cos(yaw) * (f.origin.x - position.x) - Math.sin(yaw) * (f.origin.z - position.z)) <= width / 2
      && f.far >= streetReach! - 0.5).sort((a, b) => b.width - a.width);
    // Without the installed original approach, a selected art face is not a
    // ready endpoint. The supplement never manufactures its own substitute.
    const f = matching[0]; if (!f) return undefined;
    const offset = Math.cos(yaw) * (f.origin.x - position.x) - Math.sin(yaw) * (f.origin.z - position.z);
    contactLeft = offset - f.width / 2; contactRight = offset + f.width / 2;
  }
  return { id: `district-front-${propIndex}`, propIndex, district, role, streetSegmentId: station.segmentId,
    position, yaw, width, reach: streetReach, retainedOpening, patchIds: [], body, building,
    street: station.point, contactLeft, contactRight };
}
/** Each riding corridor, recovered from its sockets: a constant-curvature arc
 * at the socket half-width, exactly what `buildPlan` placed. A segment whose
 * arc cannot be recovered keeps only its two socket lines and is named in
 * `unchecked`: one odd segment neither refuses every group nor goes unreported. */
function routeCorridors(segments: readonly Segment[]): { corridors: readonly PlacedSegment[]; unchecked: readonly string[] } {
  const corridors: PlacedSegment[] = [], unchecked: string[] = [];
  const place = (id: string, length: number, halfWidth: number, a: Segment['entry'], b: Segment['exit'], turn: number): void => {
    corridors.push({ spec: { id, length, halfWidth, surface: a.surface, ...(turn === 0 ? {} : { curvature: turn / length }) },
      entry: a, exit: b, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity });
  };
  for (const segment of segments) {
    const a = segment.entry, b = segment.exit, turn = b.headingY - a.headingY;
    const chord = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    const straight = Math.abs(turn) < 1e-9, length = straight ? chord : chord * (turn / 2) / Math.sin(turn / 2);
    const halfWidth = Math.max(a.halfWidth, b.halfWidth);
    if (!Number.isFinite(length + halfWidth) || length < 0 || halfWidth < 0
      || (!straight && !(length > 0)) || Math.abs(turn) >= Math.PI * 2 - 1e-6) {
      unchecked.push(segment.id);
      for (const socket of [a, b]) if ([socket.position.x, socket.position.z, socket.headingY, socket.halfWidth]
        .every(Number.isFinite) && socket.halfWidth >= 0) place(segment.id, 0, socket.halfWidth, socket, socket, 0);
      continue;
    }
    place(segment.id, length, halfWidth, a, b, straight ? 0 : turn);
  }
  return { corridors, unchecked };
}
/** The builder's one prop rule (`buildPlan.standsOnCorridor`) for a prop the
 * builder never saw: its footprint samples and its solid's corners must all
 * stay `PROP_CORRIDOR_CLEARANCE` beyond every corridor, rounded end caps included. */
function standsOnRoute(corridors: readonly PlacedSegment[], prop: Prop): boolean {
  const { x, z } = prop.position, cos = Math.cos(prop.rotationY), sin = Math.sin(prop.rotationY);
  const points: [number, number][] = [[x, z]];
  const box = (halfX: number, halfZ: number): void => {
    for (const [dx, dz] of [[-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ], [-halfX, 0], [halfX, 0],
      [-halfX, halfZ], [0, halfZ], [halfX, halfZ]] as const) points.push([x + cos * dx + sin * dz, z - sin * dx + cos * dz]);
  };
  const footprint = PROP_FOOTPRINTS[prop.kind], solid = PROP_SOLIDS[prop.kind];
  if (footprint.shape === 'circle') {
    const radius = footprint.radius * prop.scale;
    for (let i = 0; i < 16 && radius > 0; i++) {
      points.push([x + Math.cos(i / 16 * Math.PI * 2) * radius, z + Math.sin(i / 16 * Math.PI * 2) * radius]);
    }
  } else box(footprint.halfX * prop.scale, footprint.halfZ * prop.scale);
  if (solid) box(solid.halfX * prop.scale, solid.halfZ * prop.scale);
  return points.some(([px, pz]) => corridors.some(corridor => {
    const query = querySegment(corridor, px, pz);
    return query !== null && query.outside < PROP_CORRIDOR_CLEARANCE;
  }));
}
function collider(prop: Prop): BoxCollider {
  const shape = PROP_SOLIDS[prop.kind]!;
  return { centre: { x: prop.position.x, y: prop.position.y + shape.height * prop.scale / 2, z: prop.position.z },
    halfExtents: { x: shape.halfX * prop.scale, y: shape.height * prop.scale / 2, z: shape.halfZ * prop.scale },
    rotationY: prop.rotationY, surface: shape.surface, ...(shape.occludes ? {} : { occludes: false }) };
}
function publicGroup(plan: LevelPlan, site: Site, side: -1 | 1, validation:PopulationValidationScope,
  corridors: readonly PlacedSegment[], lanes?: () => MovementBands): {
  patches: GroundSurfacePatch[]; props: Prop[]; solids: BoxCollider[]; softBodies: BoxCollider[];
} | null {
  const width = DISTRICT_ADJACENCY.groupWidthMetres, depth = DISTRICT_ADJACENCY.groupDepthMetres;
  const edge = side * site.width / 2, left = side < 0 ? edge - width : edge, right = left + width;
  const id = `street-${site.id}-shared-rest-${side}`;
  const ground = patches(plan, site, id, left, right, 0.1, depth, validation);
  if (!ground.length) return null;
  const groupPolygon = rectangle(site, left, right, 0.1, depth);
  if (meetsMovement(plan, groupPolygon, lanes?.())) return null;
  const centre = (left + right) / 2;
  const specs: readonly [PropKind, number, number, number][] = [
    ['bench', centre, 1.2, 1], ['litterBin', centre + side * 1.6, 1.15, 1],
    ['shrub', centre - side * 2.10, 5.35, 0.85],
    ['shrub', centre + side * 0.10, 5.70, 0.70],
    ['shrub', centre + side * 2.10, 5.30, 0.85],
    ['broadleafTree', centre - side * 0.8, 9, 0.90],
  ];
  let working: LevelPlan = { ...plan, groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...ground] };
  const props: Prop[] = [], solids: BoxCollider[] = [], softBodies: BoxCollider[] = [];
  for (const [kind, x, z, scale] of specs) {
    const point = at(site, x, z), spread = PROP_SPREADS[kind];
    const halfX = (spread.shape === 'circle' ? spread.radius : spread.halfX) * scale + P.staticClearanceMetres;
    const halfZ = (spread.shape === 'circle' ? spread.radius : spread.halfZ) * scale + P.staticClearanceMetres;
    const polygon = rectangle({ position: point, yaw: site.yaw }, -halfX, halfX, -halfZ, halfZ);
    const y = fieldHeightAt(plan.heightfield, plan.surround, point.x, point.z);
    if (!Number.isFinite(y)) return null;
    const source = clippedFieldTriangles(plan.heightfield, polygon, y, CLIP);
    if (!source?.length) return null;
    const heights = source.flatMap(triangle => triangle.vertices.map(vertex => vertex.y));
    if (Math.max(...heights) - Math.min(...heights) > DISTRICT_ADJACENCY.maximumGroupGroundRiseMetres) return null;
    const context = validation(working);
    if (!surfaceFootprintClear(working, polygon, kind === 'shrub' ? new Set<SurfaceId>(['grass']) : ALLOWED, context)
      || meetsMovement(working, polygon, lanes?.())
      || !footprint(working, polygon, y + PROP_VERTICAL_SPANS[kind].bottom * scale,
        y + PROP_VERTICAL_SPANS[kind].top * scale, context)) return null;
    if (kind === 'broadleafTree') {
      // A canopy may overhang a footway, but its actual trunk is planted in
      // turf. Its full source spread/grade/foreign-object guards still apply.
      const trunk = PROP_SOLIDS.broadleafTree!;
      const root = rectangle({ position: point, yaw: site.yaw },
        -trunk.halfX * scale - P.staticClearanceMetres, trunk.halfX * scale + P.staticClearanceMetres,
        -trunk.halfZ * scale - P.staticClearanceMetres, trunk.halfZ * scale + P.staticClearanceMetres);
      if (!surfaceFootprintClear(working, root, new Set<SurfaceId>(['grass']), context)) return null;
    }
    // Spread admission is deliberately wider than the trunk/soft body. Foliage
    // cannot grow through an original wall or another newly admitted cluster.
    const polygonReach = polygonBoxReach(polygon);
    if ((working.props ?? []).some(prop => {
      const shape = PROP_SPREADS[prop.kind];
      const sx = (shape.shape === 'circle' ? shape.radius : shape.halfX * (prop.size?.x ?? 1)) * prop.scale;
      const sz = (shape.shape === 'circle' ? shape.radius : shape.halfZ * (prop.size?.z ?? 1)) * prop.scale;
      const box: BoxCollider = { centre: prop.position, halfExtents: { x: sx, y: 1, z: sz }, rotationY: prop.rotationY, surface: 'grass' };
      return boxOverlapsPolygonWithin(box, polygon, polygonReach);
    })) return null;
    const prop: Prop = { kind, position: { ...point, y }, rotationY: site.yaw, scale };
    // Nothing added may stand where somebody rides. Asked last, so only a tree
    // that every other guard admits is left out alone: the street-side tree is
    // the piece that reaches a corridor's verge, and the bench, bin and
    // planting stay. Any other piece refuses the group like every guard above.
    if (standsOnRoute(corridors, prop)) {
      if (kind === 'broadleafTree') continue;
      return null;
    }
    const body = collider(prop); props.push(prop);
    if (PROP_SOLIDS[kind]!.soft) softBodies.push(body); else solids.push(body);
    working = { ...working, props: [...(working.props ?? []), prop],
      solids: [...(working.solids ?? []), ...(PROP_SOLIDS[kind]!.soft ? [] : [body])],
      softBodies: [...(working.softBodies ?? []), ...(PROP_SOLIDS[kind]!.soft ? [body] : [])] };
  }
  return { patches: ground, props, solids, softBodies };
}

/** Installed once after the final living-ground/traffic supplement, before
 * population rebuild and consumers. It never infers a shop or relocates a prop. */
export function withDistrictAdjacency(source: DistrictAdjacentPlan): DistrictAdjacentPlan {
  if (source.districtAdjacency) return source;
  if ([...(source.solids ?? []), ...(source.softBodies ?? []), ...source.segments.flatMap(s => s.colliders)].some(box => !finiteBox(box))) return source;
  const retained = new Set<Prop>([...streetFronts(source), ...environmentSites(source), ...residentialSites(source)].map(site => site.building));
  const sites = (source.props ?? []).flatMap((building, index) => building.kind === 'building'
    ? [candidate(source, building, index, retained)].filter((site): site is Site => site !== undefined) : []);
  sites.sort((a, b) => Math.hypot(a.position.x - source.spawn.position.x, a.position.z - source.spawn.position.z)
    - Math.hypot(b.position.x - source.spawn.position.x, b.position.z - source.spawn.position.z) || a.propIndex - b.propIndex);
  const validation=createPopulationValidationScope(), { corridors, unchecked } = routeCorridors(source.segments);
  let plan: LevelPlan = source;
  const admitted: Site[] = [], addedPatches: GroundSurfacePatch[] = [], rejected: { propIndex: number; reason: string }[] = [];
  for (const site of sites.slice(0, DISTRICT_ADJACENCY.maximumFrontages)) {
    if (site.retainedOpening) { admitted.push(site); continue; }
    const base = patches(plan, site, `street-${site.id}-base`, -site.width / 2, site.width / 2, 0, DISTRICT_ADJACENCY.baseWalkDepthMetres, validation, site.body);
    if (!base.length) { rejected.push({ propIndex: site.propIndex, reason: 'base-footprint' }); continue; }
    const approach = patches({ ...plan, groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...base] }, site,
      `street-${site.id}-${site.district === 'industrial' ? 'service-apron' : 'access'}`,
      -DISTRICT_ADJACENCY.approachWidthMetres / 2, DISTRICT_ADJACENCY.approachWidthMetres / 2,
      DISTRICT_ADJACENCY.baseWalkDepthMetres, site.reach, validation, site.body);
    if (!approach.length) { rejected.push({ propIndex: site.propIndex, reason: 'connected-access-footprint' }); continue; }
    const additions = [...base, ...approach]; addedPatches.push(...additions);
    admitted.push({ ...site, patchIds: additions.map(patch => patch.id) });
    plan = { ...plan, groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...additions] };
  }
  const links: string[] = [];
  const along = (a: Site, b: Site) => Math.cos(a.yaw) * (b.position.x - a.position.x) - Math.sin(a.yaw) * (b.position.z - a.position.z);
  for (const a of admitted) {
    const following = admitted.filter(b => b !== a && b.streetSegmentId === a.streetSegmentId
      && Math.cos(b.yaw - a.yaw) > 1 - epsilon && along(a, b) > 0).sort((b, c) => along(a, b) - along(a, c));
    const b = following[0]; if (!b) continue;
    const distance = along(a, b), left = a.contactRight;
    const right = distance + b.contactLeft;
    const normalOffset = Math.sin(a.yaw) * (b.position.x - a.position.x) + Math.cos(a.yaw) * (b.position.z - a.position.z);
    if (right - left <= 0 || right - left > DISTRICT_ADJACENCY.maximumLinkGapMetres
      || Math.abs(a.reach - normalOffset - b.reach) > 0.5) continue;
    const far = Math.min(a.reach, normalOffset + b.reach), near = far - DISTRICT_ADJACENCY.streetWalkWidthMetres;
    const id = `street-district-link-${a.propIndex}-${b.propIndex}`;
    const ground = patches(plan, a, id, left, right, near, far, validation);
    if (!ground.length) continue;
    addedPatches.push(...ground); links.push(id);
    plan = { ...plan, groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...ground] };
  }
  const groups: DistrictPublicGroup[] = [], newProps: Prop[] = [], newSolids: BoxCollider[] = [], newSoft: BoxCollider[] = [];
  // Call-scoped movement index; each use re-verifies the plan's movement arrays.
  let lanes: MovementBands | undefined;
  const laneIndex = (): MovementBands => lanes ??= movementBands(plan, P.staticClearanceMetres);
  const districts = new Set<District>();
  for (const site of admitted) {
    if (groups.length >= DISTRICT_ADJACENCY.maximumPublicGroups || districts.has(site.district)) continue;
    const group = publicGroup(plan, site, 1, validation, corridors, laneIndex)
      ?? publicGroup(plan, site, -1, validation, corridors, laneIndex);
    if (!group) continue;
    const first = plan.props?.length ?? 0;
    groups.push({ id: `${site.id}-shared-rest`, district: site.district, frontageId: site.id,
      groundPatchIds: group.patches.map(patch => patch.id), propIndices: group.props.map((_, index) => first + index) });
    districts.add(site.district); newProps.push(...group.props); newSolids.push(...group.solids); newSoft.push(...group.softBodies); addedPatches.push(...group.patches);
    plan = { ...plan, props: [...(plan.props ?? []), ...group.props], solids: [...(plan.solids ?? []), ...group.solids],
      softBodies: [...(plan.softBodies ?? []), ...group.softBodies], groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...group.patches] };
  }
  if (!addedPatches.length && !newProps.length) return source;
  const frontages = admitted.map(({ body, building, street, contactLeft, contactRight, ...site }) => {
    void body; void building; void street; void contactLeft; void contactRight; return site; });
  // Added grip and furniture are a real physical world revision. Old records
  // and ghosts cannot silently key off the unchanged source-world identity.
  const id = `district-v1-${hash128(JSON.stringify([source.id, addedPatches, newProps, newSolids, newSoft]))}`;
  const report: DistrictAdjacencyReport = { revision: 'district-v1', sourceWorldId: source.id,
    physicalWorldId: id, frontages, links, groups, rejected,
    addedTriangles: addedPatches.reduce((sum, patch) => sum + patch.triangles.length, 0), addedProps: newProps.length,
    addedSolids: newSolids.length, addedSoftBodies: newSoft.length,
    ...(unchecked.length ? { uncheckedCorridors: unchecked } : {}) };
  return { ...plan, id, districtAdjacency: report };
}
