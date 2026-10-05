/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { STREET_LIFE, STREET_SHOP_WORDS } from '../data/streetLife.ts';
import type { LevelPlan, Prop, BoxCollider, Heightfield, GroundSurfacePatch, GroundSurfaceTriangle } from './plan.ts';
import type { Vec3, SurfaceId } from '../simulation/world.ts';
import { rectGrid, rectGridAny, type RectGrid } from './rectGrid.ts';

export interface StreetFront {
  readonly shop: typeof STREET_SHOP_WORDS[number];
  readonly position: Vec3;
  readonly yaw: number;
  readonly width: number;
  readonly faceWidth: number;
  readonly street: Vec3;
  /** Exact straight street used for placement; unrelated streets never join. */
  readonly streetSegmentId?: string;
  readonly building: Prop;
}

/** A few eligible commercial fronts, never a seed reroll or a prop relocation. */
export function streetFronts(plan: LevelPlan): StreetFront[] {
  const candidates: StreetFront[] = [];
  for (const building of plan.props ?? []) {
    if (building.kind !== 'building' || building.look !== 'commercial' || !building.size
      || building.scale !== 1 || building.size.y < 8) continue;
    const size = building.size;
    // A visual footprint alone is not protection for indoor people/furniture.
    const protectedHost = plan.solids?.some(solid =>
      Math.hypot(solid.centre.x - building.position.x, solid.centre.z - building.position.z) < 0.001
      && Math.abs(Math.sin(solid.rotationY - building.rotationY)) < 0.00001
      && Math.cos(solid.rotationY - building.rotationY) > 0.99999
      && solid.halfExtents.x >= size.x / 2 - 0.001
      && solid.halfExtents.z >= size.z / 2 - 0.001
      && solid.centre.y - solid.halfExtents.y <= building.position.y + 0.001
      && solid.centre.y + solid.halfExtents.y >= building.position.y + STREET_LIFE.frontageHeight);
    if (!protectedHost) continue;
    let nearest: Vec3 | undefined;
    let streetSegmentId: string | undefined;
    let distance = Infinity;
    for (const segment of plan.segments) {
      // A socket chord is exact on a straight. Do not mistake an arc's chord
      // or a park trail for a commercial street on another generated course.
      if (!['pavement', 'brick'].includes(segment.entry.surface)
        || segment.entry.surface !== segment.exit.surface
        || Math.abs(Math.atan2(Math.sin(segment.exit.headingY - segment.entry.headingY),
          Math.cos(segment.exit.headingY - segment.entry.headingY))) > 0.05) continue;
      const a = segment.entry.position, b = segment.exit.position;
      const dx = b.x - a.x, dz = b.z - a.z;
      const length2 = dx * dx + dz * dz;
      if (length2 < 16) continue;
      const t = ((building.position.x - a.x) * dx + (building.position.z - a.z) * dz) / length2;
      // Ends/intersections have no single frontage direction: use the street's interior.
      if (t < 0.08 || t > 0.92) continue;
      const point = { x: a.x + t * dx, y: a.y + t * (b.y - a.y), z: a.z + t * dz };
      const d = Math.hypot(point.x - building.position.x, point.z - building.position.z);
      if (d < distance) { distance = d; nearest = point; streetSegmentId = segment.id; }
    }
    if (!nearest || Math.abs(nearest.y - building.position.y) > 0.6) continue;
    let face = 0, dot = -Infinity;
    for (let i = 0; i < 4; i += 1) {
      const yaw = building.rotationY + i * Math.PI / 2;
      const facing = Math.sin(yaw) * (nearest.x - building.position.x)
        + Math.cos(yaw) * (nearest.z - building.position.z);
      if (facing > dot) { dot = facing; face = i; }
    }
    if (dot / distance < 0.93) continue;
    const yaw = building.rotationY + face * Math.PI / 2;
    const depth = face % 2 === 0 ? building.size.z : building.size.x;
    const faceWidth = face % 2 === 0 ? building.size.x : building.size.z;
    const gap = distance - depth / 2;
    if (faceWidth < 9 || depth < 5 || gap < 2 || gap > STREET_LIFE.maximumStreetGap) continue;
    const position = { x: building.position.x + Math.sin(yaw) * depth / 2,
      y: building.position.y, z: building.position.z + Math.cos(yaw) * depth / 2 };
    // Reject a frontage whose central approach is occupied by another solid.
    // The solid is only read; trees/buildings/collisions are never relocated.
    const approachBlocked = plan.solids?.some((solid) => {
      if (Math.hypot(solid.centre.x - building.position.x, solid.centre.z - building.position.z) < 0.1) return false;
      const vx = position.x - nearest!.x, vz = position.z - nearest!.z;
      const t = ((solid.centre.x - nearest!.x) * vx + (solid.centre.z - nearest!.z) * vz) / (vx * vx + vz * vz);
      if (t <= 0.02 || t >= 0.97 || solid.centre.y + solid.halfExtents.y < position.y + 1) return false;
      const dx = nearest!.x + vx * t - solid.centre.x, dz = nearest!.z + vz * t - solid.centre.z;
      const c = Math.cos(solid.rotationY), sn = Math.sin(solid.rotationY);
      return Math.abs(c * dx - sn * dz) < solid.halfExtents.x + 0.5
        && Math.abs(sn * dx + c * dz) < solid.halfExtents.z + 0.5
        && !isStreetLamp(plan, solid);
    });
    if (approachBlocked) continue;
    candidates.push({ shop: 'COFFEE', building, yaw, faceWidth,
      width: Math.min(STREET_LIFE.frontageMaxWidth, faceWidth - 0.8), position, street: nearest, streetSegmentId });
  }
  candidates.sort((a, b) => Math.hypot(a.position.x - plan.spawn.position.x, a.position.z - plan.spawn.position.z)
    - Math.hypot(b.position.x - plan.spawn.position.x, b.position.z - plan.spawn.position.z)
    || a.position.x - b.position.x || a.position.z - b.position.z);
  const chosen: StreetFront[] = [];
  for (const candidate of candidates) {
    if (chosen.some((front) => Math.hypot(front.position.x - candidate.position.x,
      front.position.z - candidate.position.z) < STREET_LIFE.minimumSpacing)) continue;
    const front = { ...candidate, shop: STREET_SHOP_WORDS[chosen.length] };
    // The actual offset doorway needs a clear, matched approach too. A clear
    // line to the centre of a building is not sufficient for a side door.
    if (streetGroundPatches(plan, front).length === 0) continue;
    chosen.push(front);
    if (chosen.length === STREET_LIFE.storefronts) break;
  }
  return chosen;
}

/** Shared with the closed door leaf and its clear approach: metres along the face. */
export function streetDoorOffset(front: Pick<StreetFront, 'width' | 'shop'>): number {
  return front.width * (front.shop === 'GROCER' ? -0.34 : 0.35);
}

export const STREET_PAVING = Object.freeze({
  doorApproachWidth: 1.5,
  sidewalkWidth: 2,
  maximumSidewalkGap: 32,
  maximumSidewalkDatumDifference: 0.5,
  /** Only a few millimetres lie under the existing facade's plinth. */
  frontageOverlap: 0.04,
  streetOverlap: 0.25,
  maximumHeightDifference: 0.35,
  maximumGradient: 0.12,
  /** A malformed/finer field cannot turn three paths into unbounded geometry. */
  maximumCellsPerPolygon: 1024,
});

const EDGE_EPSILON = 1e-9;
type Polygon = readonly Vec3[];

/** The source clipping arithmetic is shared; admission stays with each site.
 * Industrial rough concrete is opt-in and never changes commercial defaults. */
export interface GroundClipPolicy {
  readonly allowedSurfaces: readonly SurfaceId[];
  readonly maximumHeightDifference: number;
  readonly maximumGradient: number;
  readonly maximumCellsPerPolygon: number;
}

const COMMERCIAL_GROUND_CLIP: GroundClipPolicy = Object.freeze({
  allowedSurfaces: ['grass', 'pavement', 'brick'] as const,
  maximumHeightDifference: STREET_PAVING.maximumHeightDifference,
  maximumGradient: STREET_PAVING.maximumGradient,
  maximumCellsPerPolygon: STREET_PAVING.maximumCellsPerPolygon,
});

function boundedGroundSurfaces(surfaces: readonly SurfaceId[]): boolean {
  return surfaces.length > 0 && surfaces.length <= 4
    && new Set(surfaces).size === surfaces.length
    && surfaces.every(surface => ['grass', 'pavement', 'brick', 'roughPavement'].includes(surface));
}

export function validField(field: Heightfield): boolean {
  return Number.isFinite(field.originX) && Number.isFinite(field.originZ)
    && Number.isFinite(field.spacing) && field.spacing > 0
    && Number.isSafeInteger(field.columns) && field.columns >= 2
    && Number.isSafeInteger(field.rows) && field.rows >= 2
    && Number.isSafeInteger(field.columns * field.rows)
    && field.heights.length === field.columns * field.rows
    && field.surfaces.length === (field.columns - 1) * (field.rows - 1);
}

/**
 * One coherent full-face forecourt, or no paving if it cannot fit.
 * Every returned fragment stays on its original heightfield triangle plane.
 * The consumer draws these vertices and samples these same triangle footprints.
 */
export function streetGroundPatches(plan: LevelPlan, front: StreetFront): GroundSurfacePatch[] {
  const field = plan.heightfield;
  if (!(field.spacing > 0) || !Number.isFinite(field.spacing) || !Number.isFinite(front.faceWidth)
    || front.faceWidth / field.spacing > STREET_PAVING.maximumCellsPerPolygon) return [];
  const door = streetDoorOffset(front);
  const nX = Math.sin(front.yaw), nZ = Math.cos(front.yaw);
  const c = Math.cos(front.yaw), sn = Math.sin(front.yaw);
  const at = (x: number, z: number): Vec3 => ({
    x: front.position.x + c * x + sn * z,
    y: front.position.y,
    z: front.position.z - sn * x + c * z,
  });
  const rectangle = (left: number, right: number, near: number, far: number): Polygon =>
    [at(left, near), at(right, near), at(right, far), at(left, far)];
  const half = front.faceWidth / 2;
  const maximum = (front.street.x - front.position.x) * nX
    + (front.street.z - front.position.z) * nZ + STREET_PAVING.streetOverlap;
  let reach: number | undefined;
  // Full active frontage meets the street continuously. Testing only a side
  // door left triangular grass residuals and an abrupt T-shaped composition.
  // Include every grid-edge crossing, not just the cross-section endpoints.
  for (let distance = STREET_PAVING.streetOverlap;
    distance <= maximum + EDGE_EPSILON; distance += STREET_PAVING.streetOverlap) {
    if (pavedCrossSection(field, at(-half, distance), at(half, distance))
      && pavedCrossSection(field, at(-half, distance + STREET_PAVING.streetOverlap),
        at(half, distance + STREET_PAVING.streetOverlap))) {
      reach = distance + STREET_PAVING.streetOverlap;
      break;
    }
  }
  if (reach === undefined) return [];
  const near = -STREET_PAVING.frontageOverlap;
  const forecourt = rectangle(-half, half, near, reach);
  const doorHalf = STREET_PAVING.doorApproachWidth / 2;
  const doorApproach = rectangle(door - doorHalf, door + doorHalf, near, reach);
  const boxes = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])];
  const forecourtReach = polygonBoxReach(forecourt);
  for (const box of boxes) {
    if (Math.hypot(box.centre.x - front.building.position.x,
      box.centre.z - front.building.position.z) < 0.1) continue;
    // Existing low kerbs retain their authored height and collision. A tall
    // solid cannot be paved through simply because its centre misses the path.
    if (box.centre.y + box.halfExtents.y <= front.position.y + 0.35) continue;
    if (!boxOverlapsPolygonWithin(box, forecourt, forecourtReach)) continue;
    if (isStreetLamp(plan, box) && !boxOverlapsPolygon(box, doorApproach)) continue;
    return [];
  }
  const triangles = clippedFieldTriangles(field, forecourt, front.position.y);
  if (!triangles?.length) return [];
  const id = `street-${plan.props?.indexOf(front.building) ?? -1}-${front.shop.toLowerCase()}-forecourt`;
  const footprint = { id, origin: front.position, yaw: front.yaw,
    width: front.faceWidth, near, far: reach };
  return semanticPatches(field, triangles, footprint);
}

/**
 * Join nearest compatible commercial courts into one pedestrian street edge.
 * Only gaps between accepted frontages are covered; no new shops, road edits,
 * intersection crossing, seed draws or disconnected decorative path strips.
 */
export function streetEdgePatches(plan: LevelPlan, fronts: readonly StreetFront[],
  courts?: readonly GroundSurfacePatch[]): GroundSurfacePatch[] {
  if (fronts.length > STREET_LIFE.storefronts) return [];
  const acceptedCourts = courts ?? fronts.flatMap(front => streetGroundPatches(plan, front));
  const result: GroundSurfacePatch[] = [];
  const sameStreet = (a: StreetFront, b: StreetFront): boolean => Boolean(a.streetSegmentId
    && a.streetSegmentId === b.streetSegmentId
    && Math.abs(Math.sin(b.yaw - a.yaw)) < 0.00001
    && Math.cos(b.yaw - a.yaw) > 0.99999);
  const footprintFor = (front: StreetFront) => acceptedCourts.find(patch => patch.footprint?.id
    === `street-${plan.props?.indexOf(front.building) ?? -1}-${front.shop.toLowerCase()}-forecourt`)?.footprint;
  for (let first = 0; first < fronts.length; first++) for (let second = first + 1; second < fronts.length; second++) {
    let a = fronts[first], b = fronts[second];
    if (!sameStreet(a, b)) continue;
    const street = plan.segments.find(segment => segment.id === a.streetSegmentId);
    if (!street || !['brick', 'pavement'].includes(street.entry.surface)
      || street.entry.surface !== street.exit.surface
      || Math.abs(Math.sin(street.entry.headingY - street.exit.headingY)) > 0.05
      || Math.cos(street.entry.headingY - street.exit.headingY) < 0.99) continue;
    const along = (front: StreetFront, origin: StreetFront) => Math.cos(origin.yaw) * (front.position.x - origin.position.x)
      - Math.sin(origin.yaw) * (front.position.z - origin.position.z);
    if (along(b, a) < 0) { const oldA = a; a = b; b = oldA; }
    const distance = along(b, a);
    // Connect adjacent courts only, never leap across another accepted shop.
    if (fronts.some(front => front !== a && front !== b && sameStreet(front, a)
      && along(front, a) > 0 && along(front, a) < distance)) continue;
    const courtA = footprintFor(a), courtB = footprintFor(b);
    if (!courtA || !courtB) continue;
    const left = a.faceWidth / 2, right = distance - b.faceWidth / 2;
    const gap = right - left;
    if (gap <= EDGE_EPSILON || gap > STREET_PAVING.maximumSidewalkGap) continue;
    const normalOffset = Math.sin(a.yaw) * (b.position.x - a.position.x)
      + Math.cos(a.yaw) * (b.position.z - a.position.z);
    const datumB = normalOffset + courtB.far;
    if (Math.abs(courtA.far - datumB) > STREET_PAVING.maximumSidewalkDatumDifference
      || Math.abs(a.position.y - b.position.y) > STREET_PAVING.maximumHeightDifference) continue;
    const far = Math.min(courtA.far, datumB), near = far - STREET_PAVING.sidewalkWidth;
    if (near < Math.max(courtA.near, normalOffset + courtB.near)) continue;
    const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
    const at = (x: number, z: number): Vec3 => ({ x: a.position.x + c * x + sn * z,
      y: a.position.y, z: a.position.z - sn * x + c * z });
    const polygon = [at(left, near), at(right, near), at(right, far), at(left, far)];
    if (!pavedCrossSection(plan.heightfield, at(left, far), at(right, far))) continue;
    const polygonReach = polygonBoxReach(polygon);
    const blocked = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])].some(box =>
      box.centre.y + box.halfExtents.y > Math.min(a.position.y, b.position.y) + 0.35
      && boxOverlapsPolygonWithin(box, polygon, polygonReach) && !isStreetLamp(plan, box));
    if (blocked) continue;
    const triangles = clippedFieldTriangles(plan.heightfield, polygon, a.position.y);
    if (!triangles?.length) continue;
    const id = `street-sidewalk-${plan.props?.indexOf(a.building) ?? -1}-${plan.props?.indexOf(b.building) ?? -1}`;
    const footprint = { id, origin: at((left + right) / 2, 0), yaw: a.yaw, width: gap, near, far };
    result.push(...semanticPatches(plan.heightfield, triangles, footprint));
  }
  return result;
}

/** One layout can carry new pavement and unchanged street surfaces together. */
function semanticPatches(field: Heightfield, triangles: readonly GroundSurfaceTriangle[],
  footprint: NonNullable<GroundSurfacePatch['footprint']>): GroundSurfacePatch[] {
  const result: GroundSurfacePatch[] = [];
  for (const sourceSurface of ['grass', 'brick', 'pavement'] as const) {
    const fragments = triangles.filter(triangle => field.surfaces[triangle.cell] === sourceSurface);
    if (fragments.length === 0) continue;
    result.push({ id: `${footprint.id}-${sourceSurface}`, surface: sourceSurface === 'grass' ? 'pavement' : sourceSurface,
      sourceSurface, footprint, triangles: fragments });
  }
  return result;
}

/** A narrow original streetlight can stand in a paved plaza, with its solid intact. */
function isStreetLamp(plan: LevelPlan, box: BoxCollider): boolean {
  return box.halfExtents.x <= 0.35 && box.halfExtents.z <= 0.35
    && (plan.props ?? []).some(prop => prop.kind === 'lampPost'
      && Math.hypot(prop.position.x - box.centre.x, prop.position.z - box.centre.z) < 0.001);
}

/** Intersect the two source triangles per cell with a convex XZ footprint. */
export function clippedFieldTriangles(field: Heightfield, polygon: Polygon,
  frontageHeight: number, policy: GroundClipPolicy = COMMERCIAL_GROUND_CLIP): GroundSurfaceTriangle[] | undefined {
  if (!validField(field) || polygon.length !== 4 || !Number.isFinite(frontageHeight)
    || polygon.some(point => ![point.x, point.y, point.z].every(Number.isFinite))
    || !boundedGroundSurfaces(policy.allowedSurfaces)
    || !Number.isFinite(policy.maximumHeightDifference) || policy.maximumHeightDifference < 0
    || policy.maximumHeightDifference > STREET_PAVING.maximumHeightDifference
    || !Number.isFinite(policy.maximumGradient) || policy.maximumGradient < 0
    || policy.maximumGradient > STREET_PAVING.maximumGradient
    || !Number.isSafeInteger(policy.maximumCellsPerPolygon) || policy.maximumCellsPerPolygon < 1
    || policy.maximumCellsPerPolygon > STREET_PAVING.maximumCellsPerPolygon) return undefined;
  // A malformed boundary cannot invert clipping or introduce concave shards.
  for (let index = 0; index < polygon.length; index++) {
    if (crossXZ(polygon[index], polygon[(index + 1) % polygon.length],
      polygon[(index + 2) % polygon.length]) <= EDGE_EPSILON) return undefined;
  }
  const minX = Math.min(...polygon.map(point => point.x));
  const maxX = Math.max(...polygon.map(point => point.x));
  const minZ = Math.min(...polygon.map(point => point.z));
  const maxZ = Math.max(...polygon.map(point => point.z));
  const fieldMaxX = field.originX + (field.columns - 1) * field.spacing;
  const fieldMaxZ = field.originZ + (field.rows - 1) * field.spacing;
  if (minX < field.originX || maxX > fieldMaxX || minZ < field.originZ || maxZ > fieldMaxZ) return undefined;
  const firstColumn = Math.max(0, Math.floor((minX - field.originX) / field.spacing));
  const lastColumn = Math.min(field.columns - 2, Math.floor((maxX - field.originX) / field.spacing));
  const firstRow = Math.max(0, Math.floor((minZ - field.originZ) / field.spacing));
  const lastRow = Math.min(field.rows - 2, Math.floor((maxZ - field.originZ) / field.spacing));
  if ((lastColumn - firstColumn + 1) * (lastRow - firstRow + 1) > policy.maximumCellsPerPolygon) return undefined;
  const result: GroundSurfaceTriangle[] = [];
  for (let row = firstRow; row <= lastRow; row++) for (let column = firstColumn; column <= lastColumn; column++) {
    const base = row * field.columns + column;
    const cell = row * (field.columns - 1) + column;
    const x = field.originX + column * field.spacing, z = field.originZ + row * field.spacing;
    const a = { x, y: field.heights[base], z };
    const b = { x: x + field.spacing, y: field.heights[base + 1], z };
    const c = { x, y: field.heights[base + field.columns], z: z + field.spacing };
    const d = { x: x + field.spacing, y: field.heights[base + field.columns + 1], z: z + field.spacing };
    for (const source of [[a, d, b], [a, c, d]]) {
      const clipped = insideBoundary(source, polygon) ? [source[0], source[1], source[2]] : clipPolygon(source, polygon);
      if (clipped.length < 3) continue;
      for (let index = 1; index < clipped.length - 1; index++) {
        const vertices = [clipped[0], clipped[index], clipped[index + 1]] as const;
        const twiceArea = Math.abs(crossXZ(vertices[0], vertices[1], vertices[2]));
        if (twiceArea < EDGE_EPSILON) continue;
        // Do not turn a trail, bridge, spill, or hill into a shop approach.
        if (!policy.allowedSurfaces.includes(field.surfaces[cell])) return undefined;
        if (vertices.some(point => !Number.isFinite(point.y)
          || Math.abs(point.y - frontageHeight) > policy.maximumHeightDifference)) return undefined;
        const ux = source[1].x - source[0].x, uy = source[1].y - source[0].y, uz = source[1].z - source[0].z;
        const vx = source[2].x - source[0].x, vy = source[2].y - source[0].y, vz = source[2].z - source[0].z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.hypot(nx, nz) / ny > policy.maximumGradient) return undefined;
        result.push({ cell, vertices });
      }
    }
  }
  return result;
}

/** True when every vertex of a triangle passes every boundary edge's inside
 * test (crossXZ >= -EDGE_EPSILON). clipPolygon then pushes each vertex in order
 * at every edge and adds no intersection, so its output is exactly the input
 * vertices; this computes the identical crossXZ values without its arrays. */
function insideBoundary(input: Polygon, boundary: Polygon): boolean {
  for (let index = 0; index < boundary.length; index++) {
    const a = boundary[index], b = boundary[(index + 1) % boundary.length];
    for (const point of input) if (!(crossXZ(a, b, point) >= -EDGE_EPSILON)) return false;
  }
  return true;
}
function clipPolygon(input: Polygon, boundary: Polygon): Vec3[] {
  let output = [...input];
  for (let index = 0; index < boundary.length; index++) {
    const a = boundary[index], b = boundary[(index + 1) % boundary.length];
    const previous = output;
    output = [];
    if (previous.length === 0) break;
    for (let point = 0; point < previous.length; point++) {
      const from = previous[point], to = previous[(point + 1) % previous.length];
      const dFrom = crossXZ(a, b, from), dTo = crossXZ(a, b, to);
      const fromInside = dFrom >= -EDGE_EPSILON, toInside = dTo >= -EDGE_EPSILON;
      if (fromInside) output.push(from);
      if (fromInside !== toInside) {
        const t = dFrom / (dFrom - dTo);
        output.push({ x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y),
          z: from.z + t * (to.z - from.z) });
      }
    }
  }
  return output;
}

function crossXZ(a: Vec3, b: Vec3, point: Vec3): number {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
}

function fieldSurface(field: Heightfield, x: number, z: number): SurfaceId | undefined {
  const column = Math.floor((x - field.originX) / field.spacing);
  const row = Math.floor((z - field.originZ) / field.spacing);
  if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) return undefined;
  return field.surfaces[row * (field.columns - 1) + column];
}

export function pavedCrossSection(field: Heightfield, from: Vec3, to: Vec3,
  allowedSurfaces: readonly SurfaceId[] = ['pavement', 'brick']): boolean {
  if (!validField(field) || !boundedGroundSurfaces(allowedSurfaces)
    || ![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
  const cuts = [0, 1];
  for (const [a, b, origin] of [[from.x, to.x, field.originX], [from.z, to.z, field.originZ]]) {
    if (Math.abs(b - a) < EDGE_EPSILON) continue;
    const first = Math.ceil((Math.min(a, b) - origin) / field.spacing);
    const last = Math.floor((Math.max(a, b) - origin) / field.spacing);
    if (last - first + 1 > STREET_PAVING.maximumCellsPerPolygon) return false;
    for (let edge = first; edge <= last; edge++) {
      const t = (origin + edge * field.spacing - a) / (b - a);
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const positions = [...cuts];
  for (let index = 1; index < cuts.length; index++) positions.push((cuts[index - 1] + cuts[index]) / 2);
  return positions.every(t => {
    const surface = fieldSurface(field, from.x + t * (to.x - from.x), from.z + t * (to.z - from.z));
    return surface !== undefined && allowedSurfaces.includes(surface);
  });
}

/** Separating axes test for the entire approach, including the doorway offset. */
export function boxOverlapsPolygon(box: BoxCollider, polygon: Polygon): boolean {
  const c = Math.cos(box.rotationY), sn = Math.sin(box.rotationY);
  const corners: Vec3[] = [];
  for (const x of [-box.halfExtents.x, box.halfExtents.x]) for (const z of [-box.halfExtents.z, box.halfExtents.z]) {
    corners.push({ x: box.centre.x + c * x + sn * z, y: box.centre.y,
      z: box.centre.z - sn * x + c * z });
  }
  const axes = [{ x: c, z: -sn }, { x: sn, z: c }];
  for (let index = 0; index < 2; index++) {
    const a = polygon[index], b = polygon[index + 1];
    axes.push({ x: b.z - a.z, z: a.x - b.x });
  }
  for (const axis of axes) {
    let firstMin = Infinity, firstMax = -Infinity, secondMin = Infinity, secondMax = -Infinity;
    for (const point of polygon) {
      const projection = point.x * axis.x + point.z * axis.z;
      if (Number.isNaN(projection)) { firstMin = NaN; firstMax = NaN; break; }
      if (projection < firstMin) firstMin = projection;
      if (projection > firstMax) firstMax = projection;
    }
    for (const point of corners) {
      const projection = point.x * axis.x + point.z * axis.z;
      if (Number.isNaN(projection)) { secondMin = NaN; secondMax = NaN; break; }
      if (projection < secondMin) secondMin = projection;
      if (projection > secondMax) secondMax = projection;
    }
    // Preserve the original strict positive-area semantics, axis order, NaN
    // propagation and empty-range extrema without per-axis temporary arrays.
    if (firstMax <= secondMin + EDGE_EPSILON
      || secondMax <= firstMin + EDGE_EPSILON) return false;
  }
  return true;
}

/** Finite coordinate rectangle of one polygon plus its broad-phase reach. */
export interface PolygonBoxReach {
  readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number;
  /** AABB diagonal plus a rounding margin; never smaller than the hull diameter. */
  readonly reach: number;
}

/** Broad-phase data for boxOverlapsPolygon, or undefined when any coordinate
 * is non-finite (such a polygon is never pruned). */
export function polygonBoxReach(polygon: readonly Pick<Vec3, 'x' | 'z'>[]): PolygonBoxReach | undefined {
  if (polygon.length === 0) return undefined;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of polygon) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return undefined;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  const magnitude = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ));
  const reach = Math.hypot(maxX - minX, maxZ - minZ) + 1e-6 * (1 + magnitude);
  return Number.isFinite(reach) ? { minX, maxX, minZ, maxZ, reach } : undefined;
}

/** True only when boxOverlapsPolygon(box, polygon) is provably false.
 * boxOverlapsPolygon always tests the box's own two orthogonal axes against
 * every polygon vertex. A polygon hull that overlapped both of those slabs
 * without meeting the box would contain two points at least the box-to-hull
 * gap apart, so a coordinate gap larger than the hull's diameter (bounded by
 * its AABB diagonal) is always separated on a box axis. No predicate, axis or
 * tolerance changes; non-finite boxes are never pruned. */
export function boxBeyondPolygonReach(box: BoxCollider, polygon: PolygonBoxReach): boolean {
  const c = Math.cos(box.rotationY), sn = Math.sin(box.rotationY);
  const hx = Math.abs(box.halfExtents.x), hz = Math.abs(box.halfExtents.z);
  const ex = Math.abs(c) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(c) * hz;
  const x = box.centre.x, z = box.centre.z;
  if (!Number.isFinite(ex) || !Number.isFinite(ez) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const gap = polygon.reach + 1e-6 * (1 + Math.abs(x) + Math.abs(z) + ex + ez);
  return x - ex - polygon.maxX > gap || polygon.minX - (x + ex) > gap
    || z - ez - polygon.maxZ > gap || polygon.minZ - (z + ez) > gap;
}

/** As boxBeyondPolygonReach for any box whose four corners lie within
 * `radius` of (x, z), e.g. radius = hypot(halfExtents.x, halfExtents.z):
 * that disk's rectangle encloses the box's rectangle. */
export function diskBeyondPolygonReach(x: number, z: number, radius: number, polygon: PolygonBoxReach): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) return false;
  const r = Math.abs(radius), gap = polygon.reach + 1e-6 * (1 + Math.abs(x) + Math.abs(z) + r);
  return x - r - polygon.maxX > gap || polygon.minX - (x + r) > gap
    || z - r - polygon.maxZ > gap || polygon.minZ - (z + r) > gap;
}

/** Coordinate extent of a finite polygon that has an exactly vertical edge
 * (x) and/or an exactly horizontal edge (z). */
export interface AlignedPolygonExtent {
  readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number;
  readonly x: boolean; readonly z: boolean;
}
export function alignedPolygonExtent(polygon: readonly Pick<Vec3, 'x' | 'z'>[]): AlignedPolygonExtent | undefined {
  const reach = polygonBoxReach(polygon);
  if (!reach) return undefined;
  let x = false, z = false;
  for (let index = 0; index < polygon.length; index++) {
    const first = polygon[index], last = polygon[(index + 1) % polygon.length];
    if (first.x === last.x && first.z !== last.z) x = true;
    if (first.z === last.z && first.x !== last.x) z = true;
  }
  return x || z ? { minX: reach.minX, maxX: reach.maxX, minZ: reach.minZ, maxZ: reach.maxZ, x, z } : undefined;
}
/** True only when a separating-axis test that checks EVERY edge of the
 * aligned polygon, projecting points as p.x * (last.z - first.z) +
 * p.z * (first.x - last.x) and separating when max(one) <= min(two) +
 * tolerance (tolerance >= 0), must separate `boundary`. Such a vertical edge
 * projects each finite point as fl(x * axis) (+/-0), monotone in x, so a
 * finite boundary whose x range does not overlap the polygon's x range is
 * separated on it; likewise a horizontal edge for z. */
export function boundaryOutsideAligned(boundary: readonly Pick<Vec3, 'x' | 'z'>[],
  polygon: AlignedPolygonExtent): boolean {
  if (boundary.length === 0) return false;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of boundary) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return (polygon.x && (minX >= polygon.maxX || maxX <= polygon.minX))
    || (polygon.z && (minZ >= polygon.maxZ || maxZ <= polygon.minZ));
}

/** A plain XZ coordinate rectangle. */
export interface PlaneRectangle { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
/** The coordinate rectangle boxBeyondPolygonReach uses, inflated by its own
 * box-dependent rounding margin; undefined (never pruned) when non-finite. */
export function boxReachRectangle(box: BoxCollider): PlaneRectangle | undefined {
  const c = Math.cos(box.rotationY), sn = Math.sin(box.rotationY);
  const hx = Math.abs(box.halfExtents.x), hz = Math.abs(box.halfExtents.z);
  const ex = Math.abs(c) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(c) * hz;
  const x = box.centre.x, z = box.centre.z;
  if (!Number.isFinite(ex) || !Number.isFinite(ez) || !Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  const margin = 1e-6 * (1 + Math.abs(x) + Math.abs(z) + ex + ez);
  return { minX: x - ex - margin, maxX: x + ex + margin, minZ: z - ez - margin, maxZ: z + ez + margin };
}
/** Boxes outside this rectangle satisfy boxBeyondPolygonReach for the polygon. */
export function polygonReachRectangle(reach: PolygonBoxReach): PlaneRectangle {
  return { minX: reach.minX - reach.reach, maxX: reach.maxX + reach.reach,
    minZ: reach.minZ - reach.reach, maxZ: reach.maxZ + reach.reach };
}
/** Coordinate rectangle of a finite polygon whose vertex order is robustly a
 * convex cycle: every turn has one strict sign far beyond the cross product's
 * rounding, and the edge x-direction reverses at most twice (one winding).
 * A separating-axis test over every edge of both shapes that separates when
 * max(one) <= min(two) + tolerance (tolerance >= 0, far above rounding) thus
 * separates two such polygons whose rectangles are disjoint: for convex
 * shapes some edge normal has a positive exact gap.
 * Undefined means "unknown"; callers then run the exact test. */
export function convexExtent(polygon:readonly Pick<Vec3,'x'|'z'>[]):PlaneRectangle|undefined {
 const n=polygon.length;if(n<3)return undefined;
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const p of polygon){if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return undefined;
  minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
 const tolerance=1e-12*(1+(maxX-minX)**2+(maxZ-minZ)**2);
 let sign=0,flips=0,first=0,last=0;
 for(let i=0;i<n;i++){
  const a=polygon[i],b=polygon[(i+1)%n],c=polygon[(i+2)%n];
  const turn=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  if(!(Math.abs(turn)>tolerance))return undefined;
  if(sign&&Math.sign(turn)!==sign)return undefined;sign=Math.sign(turn);
  const dx=b.x-a.x;if(dx!==0){if(last!==0&&Math.sign(dx)!==Math.sign(last))flips++;if(first===0)first=dx;last=dx;}
 }
 if(first!==0&&Math.sign(first)!==Math.sign(last))flips++;
 return flips<=2?{minX,maxX,minZ,maxZ}:undefined;
}
/** True only when `points` (finite) has a rectangle apart from the convex
 * `extent` and is itself a robust convex cycle, or is any three points: a
 * triangle's three listed edges are its hull's edges even when it degenerates
 * to a segment, and a repeated vertex gives a zero axis that always separates. */
export function apartFromConvex(points:readonly Pick<Vec3,'x'|'z'>[],extent:PlaneRectangle):boolean {
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const p of points){if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
 if(!points.length||!extentsApart(extent,{minX,maxX,minZ,maxZ}))return false;
 return points.length===3||convexExtent(points)!==undefined;
}
export function extentsApart(a:PlaneRectangle,b:PlaneRectangle):boolean {
 const margin=1e-9*(1+Math.max(Math.abs(a.minX),Math.abs(a.maxX),Math.abs(a.minZ),Math.abs(a.maxZ)));
 return a.maxX+margin<b.minX||b.maxX+margin<a.minX||a.maxZ+margin<b.minZ||b.maxZ+margin<a.minZ;
}
/** One authored movement band: a populationPaths frame pair, boxed exactly as
 * the original-lane checks box it (centre, half extents and yaw). */
export interface MovementBand { readonly box: BoxCollider }
/** Call-scoped broad phase over a plan's original movement reservations:
 * every frame-pair box and every non-footpath source boundary and crossing
 * outline, in the order the full scans visit them. Callers verify the plan's
 * arrays and fall back to their full scans otherwise; every decision is still
 * made by the exact predicates. */
export interface MovementBands {
  readonly paths: LevelPlan['populationPaths']; readonly sources: LevelPlan['populationGroundSources'];
  readonly crossings: LevelPlan['populationCrossings']; readonly clearance: number;
  /** Some frame pair fails !finite(length, width) || width < 0 (each finite). */
  readonly invalidEach: boolean;
  /** Some frame pair fails !Number.isFinite(length + width) || width < 0. */
  readonly invalidSum: boolean;
  readonly bands: RectGrid<MovementBand>;
  readonly boundaries: RectGrid<readonly Pick<Vec3, 'x' | 'z'>[]>;
}
export function movementBands(plan: LevelPlan, clearance: number): MovementBands {
  let invalidEach = false, invalidSum = false;
  const bands: MovementBand[] = [];
  for (const path of plan.populationPaths ?? []) for (let i = 1; i < path.frames.length; i += 1) {
    const a = path.frames[i - 1], b = path.frames[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    const width = Math.max(a.halfWidthMetres, b.halfWidthMetres);
    const each = !(Number.isFinite(length) && Number.isFinite(width)) || width < 0;
    const sum = !Number.isFinite(length + width) || width < 0;
    invalidEach ||= each; invalidSum ||= sum;
    if (each || sum) continue;
    bands.push({ box: { centre: { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 },
      halfExtents: { x: width + clearance, y: 1, z: length / 2 + width + clearance },
      rotationY: Math.atan2(b.x - a.x, b.z - a.z), surface: 'pavement' } });
  }
  const outlines: (readonly Pick<Vec3, 'x' | 'z'>[])[] = [];
  for (const source of plan.populationGroundSources ?? []) if (source.purpose !== 'footpath') outlines.push(...source.polygons);
  for (const crossing of plan.populationCrossings ?? []) outlines.push(crossing.corners);
  const outlineRectangle = (outline: readonly Pick<Vec3, 'x' | 'z'>[]): PlaneRectangle | undefined => {
    if (!outline.length) return undefined;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const point of outline) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return undefined;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  };
  return { paths: plan.populationPaths, sources: plan.populationGroundSources, crossings: plan.populationCrossings,
    clearance, invalidEach, invalidSum,
    bands: rectGrid(bands, band => {
      const box = band.box, radius = Math.hypot(box.halfExtents.x, box.halfExtents.z);
      const x = box.centre.x, z = box.centre.z;
      // Disk around the box (diskBeyondPolygonReach), inflated by its margin.
      const margin = 1e-6 * (1 + Math.abs(x) + Math.abs(z) + radius);
      return Number.isFinite(radius) && Number.isFinite(x) && Number.isFinite(z)
        ? { minX: x - radius - margin, maxX: x + radius + margin, minZ: z - radius - margin, maxZ: z + radius + margin }
        : undefined;
    }),
    boundaries: rectGrid(outlines, outlineRectangle) };
}
/** "Does any original movement band meet this polygon" through the index, or
 * undefined when the index does not belong to this plan/clearance (the caller
 * then runs its full scan). `boxHit` and `outlineHit` are the caller's exact
 * predicates; the outline rectangle test is boundaryOutsideAligned's. */
export function movementBandsMeet(plan: LevelPlan, index: MovementBands | undefined, clearance: number,
  polygon: readonly Pick<Vec3, 'x' | 'z'>[], invalid: 'each' | 'sum',
  boxHit: (box: BoxCollider) => boolean, outlineHit: (outline: readonly Pick<Vec3, 'x' | 'z'>[]) => boolean): boolean | undefined {
  if (!index || index.paths !== plan.populationPaths || index.sources !== plan.populationGroundSources
    || index.crossings !== plan.populationCrossings || index.clearance !== clearance) return undefined;
  if (invalid === 'each' ? index.invalidEach : index.invalidSum) return true;
  const reach = polygonBoxReach(polygon);
  if (!reach) return undefined;
  if (rectGridAny(index.bands, polygonReachRectangle(reach), band => boxHit(band.box))) return true;
  const aligned = alignedPolygonExtent(polygon);
  // Outlines whose rectangle misses an aligned axis range are separated
  // (boundaryOutsideAligned); with no aligned edge every outline is visited.
  const query = aligned ? { minX: aligned.x ? aligned.minX : -Infinity, maxX: aligned.x ? aligned.maxX : Infinity,
    minZ: aligned.z ? aligned.minZ : -Infinity, maxZ: aligned.z ? aligned.maxZ : Infinity }
    : { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
  return rectGridAny(index.boundaries, query, outlineHit);
}

/** boxOverlapsPolygon with the conservative broad phase above. */
export function boxOverlapsPolygonWithin(box: BoxCollider, polygon: Polygon,
  reach: PolygonBoxReach | undefined): boolean {
  if (reach && boxBeyondPolygonReach(box, reach)) return false;
  return boxOverlapsPolygon(box, polygon);
}
