/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { BoxCollider, GroundSurfacePatch, GroundSurfaceTriangle, Hazard, Heightfield, LevelPlan, Prop } from './plan.ts';
import { rectGrid, rectGridAny, type RectGrid, type SpatialBounds } from './rectGrid.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { boxOverlapsPolygon, boxOverlapsPolygonWithin, boxReachRectangle, clippedFieldTriangles, pavedCrossSection,
  polygonBoxReach, polygonReachRectangle, STREET_PAVING, type GroundClipPolicy } from './streetFronts.ts';
import { exactBuildingBody, finiteBox } from './protectedSiteEligibility.ts';

/** Moved from environmentGround.ts without changing the positive-area SAT. */
export function overlapsExistingTriangle(triangle: GroundSurfaceTriangle, origin: Vec3,
  yaw: number, halfWidth: number, near: number, far: number): boolean {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = triangle.vertices.map(point => ({
    x: c * (point.x - origin.x) - s * (point.z - origin.z),
    z: s * (point.x - origin.x) + c * (point.z - origin.z),
  }));
  const rectangle = [{ x: -halfWidth, z: near }, { x: halfWidth, z: near },
    { x: halfWidth, z: far }, { x: -halfWidth, z: far }];
  const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }];
  for (let index = 0; index < local.length; index++) {
    const a = local[index], b = local[(index + 1) % local.length];
    axes.push({ x: b.z - a.z, z: a.x - b.x });
  }
  for (const axis of axes) {
    const first = local.map(point => point.x * axis.x + point.z * axis.z);
    const second = rectangle.map(point => point.x * axis.x + point.z * axis.z);
    if (Math.max(...first) <= Math.min(...second) + 1e-9
      || Math.max(...second) <= Math.min(...first) + 1e-9) return false;
  }
  return true;
}

/** World rectangle enclosing one approach footprint, inflated by a rounding
 * margin, or undefined when any input is non-finite. */
function footprintWorldBounds(origin: Vec3, yaw: number, halfWidth: number, near: number, far: number):
  { minX: number; maxX: number; minZ: number; maxZ: number } | undefined {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const x of [-halfWidth, halfWidth]) for (const z of [near, far]) {
    // Inverse of the local transform used by overlapsExistingTriangle.
    const worldX = origin.x + c * x + s * z, worldZ = origin.z - s * x + c * z;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return undefined;
    minX = Math.min(minX, worldX); maxX = Math.max(maxX, worldX);
    minZ = Math.min(minZ, worldZ); maxZ = Math.max(maxZ, worldZ);
  }
  const margin = 1e-6 * (1 + Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)));
  return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
}

/** overlapsExistingTriangle is a complete SAT of two convex shapes (all three
 * triangle edges and both rectangle axes) whose tolerance favours separation,
 * so a triangle whose world rectangle is disjoint from the footprint's inflated
 * world rectangle can never overlap. NaN or infinite vertices never prune. */
function triangleBeyond(triangle: GroundSurfaceTriangle,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  const [a, b, c] = triangle.vertices;
  if (triangle.vertices.length !== 3 || !a || !b || !c) return false;
  const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
  const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return false;
  return maxX < bounds.minX || minX > bounds.maxX || maxZ < bounds.minZ || minZ > bounds.maxZ;
}

/** Call-scoped broad phase over one finished plan's blockers and precise
 * patches. A site selector builds it once for its own synchronous call, and
 * every use first verifies the plan's exact arrays; anything else falls back
 * to the full scans. It never memoizes a decision: it only omits blockers and
 * triangles that the exact predicates provably reject. */
export interface ApproachIndex {
  readonly segments: LevelPlan['segments']; readonly solids: LevelPlan['solids'];
  readonly softBodies: LevelPlan['softBodies']; readonly patches: LevelPlan['groundSurfacePatches'];
  readonly field: Heightfield; readonly includeSoftBodies: boolean;
  /** Exactly sourceApproachPatches' blocker list for includeSoftBodies. */
  readonly blockers: readonly BoxCollider[];
  readonly nonFiniteBlocker: boolean;
  readonly blockerGrid: RectGrid<BoxCollider>;
  /** Patches failing the validateExistingPatches rules. */
  readonly invalidPatches: readonly number[];
  /** Patch indices by the rectangle of all their triangles' vertices. */
  readonly patchGrid: RectGrid<number>;
}
export function approachIndex(plan: LevelPlan, includeSoftBodies: boolean): ApproachIndex {
  const field = plan.heightfield;
  const blockers = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? []),
    ...(includeSoftBodies ? plan.softBodies ?? [] : [])];
  const invalidPatches: number[] = [];
  const patches = plan.groundSurfacePatches ?? [];
  patches.forEach((patch, index) => {
    if (patch.triangles.some(triangle => !Number.isSafeInteger(triangle.cell)
      || triangle.cell < 0 || triangle.cell >= field.surfaces.length || triangle.vertices.length !== 3
      || triangle.vertices.some(point => !(Number.isFinite(point.x) && Number.isFinite(point.y)
        && Number.isFinite(point.z))))) invalidPatches.push(index);
  });
  // A patch rectangle encloses every triangle rectangle, so a patch whose
  // rectangle misses a footprint's has every triangle beyond it as well
  // (triangleBeyond). Any triangle without three finite vertices leaves the
  // patch unbounded, so it is always visited.
  const patchRectangle = (index: number): SpatialBounds | undefined => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const triangle of patches[index].triangles) {
      const vertices = triangle.vertices;
      if (vertices.length !== 3) return undefined;
      for (let corner = 0; corner < 3; corner += 1) {
        const point = vertices[corner];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return undefined;
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.z < minZ) minZ = point.z;
        if (point.z > maxZ) maxZ = point.z;
      }
    }
    return minX <= maxX && minZ <= maxZ ? { minX, maxX, minZ, maxZ } : undefined;
  };
  return { segments: plan.segments, solids: plan.solids, softBodies: plan.softBodies,
    patches: plan.groundSurfacePatches, field, includeSoftBodies, blockers,
    nonFiniteBlocker: blockers.some(box => !finiteBox(box)),
    blockerGrid: rectGrid(blockers, boxReachRectangle), invalidPatches,
    patchGrid: rectGrid(patches.map((_, index) => index), patchRectangle) };
}
function indexFor(plan: LevelPlan, includeSoftBodies: boolean, index: ApproachIndex | undefined): ApproachIndex | undefined {
  return index && index.segments === plan.segments && index.solids === plan.solids
    && index.softBodies === plan.softBodies && index.patches === plan.groundSurfacePatches
    && index.field === plan.heightfield && index.includeSoftBodies === includeSoftBodies ? index : undefined;
}
/** Any blocker passing `accept` that boxOverlapsPolygon reports, with the
 * index omitting only blockers the broad phase proves separated. */
export function approachBlocked(plan: LevelPlan, index: ApproachIndex | undefined, includeSoftBodies: boolean,
  polygon: readonly Vec3[], accept: (box: BoxCollider) => boolean): boolean | undefined {
  const usable = indexFor(plan, includeSoftBodies, index), reach = polygonBoxReach(polygon);
  if (!usable || !reach) return undefined;
  return rectGridAny(usable.blockerGrid, polygonReachRectangle(reach), box => accept(box) && boxOverlapsPolygon(box, polygon));
}

export interface ProtectedApproachAnchor {
  readonly building: Prop;
  readonly body: BoxCollider;
  readonly position: Vec3;
  readonly yaw: number;
  readonly street: Vec3;
}

export interface ProtectedApproachPolicy {
  readonly maximumStreetGap: number;
  readonly streetSurfaces: readonly SurfaceId[];
  readonly clipping: GroundClipPolicy;
  readonly includeSoftBodies?: boolean;
  readonly hazardRadius?: (hazard: Hazard) => number;
}

/** Bounded new-district entrance authoring. Existing industrial admission stays
 * in its unchanged wrapper; source clipping, cross sections and overlap are
 * shared here. The exact original host is the only body exception. */
export function protectedApproachPatches(plan: LevelPlan, anchor: ProtectedApproachAnchor,
  approaches: readonly { readonly id: string; readonly offset: number; readonly width: number }[],
  policy: ProtectedApproachPolicy, index?: ApproachIndex): GroundSurfacePatch[] {
  if (exactBuildingBody(plan, anchor.building) !== anchor.body
    || ![anchor.position.x, anchor.position.y, anchor.position.z, anchor.yaw,
      anchor.street.x, anchor.street.y, anchor.street.z, policy.maximumStreetGap].every(Number.isFinite)
    || policy.maximumStreetGap <= 0 || policy.maximumStreetGap > STREET_PAVING.maximumSidewalkGap
    || approaches.length < 1 || approaches.length > 2
    || new Set(approaches.map(approach => approach.id)).size !== approaches.length
    || policy.streetSurfaces.length < 1 || policy.streetSurfaces.length > 3
    || policy.streetSurfaces.some(surface => !['pavement', 'brick', 'roughPavement'].includes(surface))) return [];
  const size = anchor.building.size!, relativeYaw = anchor.yaw - anchor.body.rotationY;
  if (Math.abs(Math.sin(2 * relativeYaw)) > 1e-8) return [];
  const sideFace = Math.abs(Math.sin(relativeYaw)) > 0.5;
  const faceWidth = sideFace ? size.z : size.x, halfDepth = (sideFace ? size.x : size.z) / 2;
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  if (Math.hypot(anchor.position.x - anchor.building.position.x - s * halfDepth,
    anchor.position.z - anchor.building.position.z - c * halfDepth) > 0.001
    || Math.abs(anchor.position.y - anchor.building.position.y) > 0.001
    || approaches.some(approach => !approach.id.startsWith('street-')
      || ![approach.offset, approach.width].every(Number.isFinite)
      || approach.width <= 0 || approach.width > 6
      || Math.abs(approach.offset) + approach.width / 2 > faceWidth / 2)) return [];
  return sourceApproachPatches(plan, anchor, approaches, { ...policy,
    ignoresBody: box => box === anchor.body, requireFiniteBlockers: true, validateExistingPatches: true,
    maximumStreetGapEpsilon: 1e-9 }, index);
}

export interface SourceApproachPolicy extends ProtectedApproachPolicy {
  /** Explicit legacy/new-district policy. The core never invents a host exception. */
  readonly ignoresBody: (box: BoxCollider) => boolean;
  readonly requireFiniteBlockers?: boolean;
  readonly validateExistingPatches?: boolean;
  /** New exact-face callers allow socket trig roundoff; legacy defaults to zero. */
  readonly maximumStreetGapEpsilon?: number;
}

/** Shared original source-plane approach loop. Legacy industrial policy and
 * stricter new district policy are explicit callers, with the same geometry,
 * search order, clipping, surface grouping, and precise-patch overlap. */
export function sourceApproachPatches(plan: LevelPlan,
  anchor: Pick<ProtectedApproachAnchor, 'position' | 'yaw' | 'street'>,
  approaches: readonly { readonly id: string; readonly offset: number; readonly width: number }[],
  policy: SourceApproachPolicy, index?: ApproachIndex): GroundSurfacePatch[] {
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  const field = plan.heightfield;
  const maximum = (anchor.street.x - anchor.position.x) * s
    + (anchor.street.z - anchor.position.z) * c + STREET_PAVING.streetOverlap;
  if (!(maximum > 0) || maximum > policy.maximumStreetGap + STREET_PAVING.streetOverlap
    + (policy.maximumStreetGapEpsilon ?? 0)) return [];
  const usable = indexFor(plan, !!policy.includeSoftBodies, index);
  const blockers = usable ? usable.blockers : [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? []),
    ...(policy.includeSoftBodies ? plan.softBodies ?? [] : [])];
  if (policy.requireFiniteBlockers && (usable ? usable.nonFiniteBlocker : blockers.some(box => !finiteBox(box)))) return [];
  const hazards: { readonly hazard: Hazard; readonly radius: number }[] = [];
  if (policy.hazardRadius) {
    for (const hazard of plan.hazards ?? []) {
      if (![hazard.centre.x, hazard.centre.y, hazard.centre.z, hazard.radius].every(Number.isFinite)
        || hazard.radius <= 0) return [];
      let radius: number;
      try { radius = policy.hazardRadius(hazard); } catch { return []; }
      if (!Number.isFinite(radius) || radius < hazard.radius) return [];
      hazards.push({ hazard, radius });
    }
  }
  const footprints: NonNullable<GroundSurfacePatch['footprint']>[] = [];
  const result: GroundSurfacePatch[] = [];
  for (const approach of approaches) {
    const origin = { x: anchor.position.x + c * approach.offset, y: anchor.position.y,
      z: anchor.position.z - s * approach.offset };
    const at = (x: number, z: number): Vec3 => ({ x: origin.x + c * x + s * z,
      y: origin.y, z: origin.z - s * x + c * z });
    const half = approach.width / 2;
    let reach: number | undefined;
    for (let distance = STREET_PAVING.streetOverlap;
      distance <= maximum + 1e-9; distance += STREET_PAVING.streetOverlap) {
      if (pavedCrossSection(field, at(-half, distance), at(half, distance), policy.streetSurfaces)
        && pavedCrossSection(field, at(-half, distance + STREET_PAVING.streetOverlap),
          at(half, distance + STREET_PAVING.streetOverlap), policy.streetSurfaces)) {
        reach = distance + STREET_PAVING.streetOverlap;
        break;
      }
    }
    if (reach === undefined) return [];
    const near = -STREET_PAVING.frontageOverlap;
    const polygon = [at(-half, near), at(half, near), at(half, reach), at(-half, reach)];
    const polygonReach = polygonBoxReach(polygon);
    // ignoresBody is a pure predicate; skipping it for separated boxes is unobservable.
    const blocks = (box: BoxCollider): boolean => !policy.ignoresBody(box)
      && !(box.centre.y + box.halfExtents.y <= anchor.position.y + 0.35)
      && boxOverlapsPolygonWithin(box, polygon, polygonReach);
    if (usable && polygonReach ? rectGridAny(usable.blockerGrid, polygonReachRectangle(polygonReach), blocks)
      : blockers.some(blocks)) return [];
    for (const { hazard, radius } of hazards) {
      const dx = hazard.centre.x - origin.x, dz = hazard.centre.z - origin.z;
      const x = c * dx - s * dz, z = s * dx + c * dz;
      const outsideX = x - Math.max(-half, Math.min(half, x));
      const outsideZ = z - Math.max(near, Math.min(reach, z));
      if (outsideX * outsideX + outsideZ * outsideZ < radius * radius - 1e-9) return [];
    }
    const triangles = clippedFieldTriangles(field, polygon, anchor.position.y, policy.clipping);
    if (!triangles?.length) return [];
    const footprint = { id: approach.id, origin, yaw: anchor.yaw, width: approach.width, near, far: reach };
    footprints.push(footprint);
    for (const sourceSurface of policy.clipping.allowedSurfaces) {
      const fragments = triangles.filter(triangle => field.surfaces[triangle.cell] === sourceSurface);
      if (fragments.length > 0) result.push({ id: `${approach.id}-${sourceSurface}`, sourceSurface,
        surface: sourceSurface === 'grass' ? 'pavement' : sourceSurface, footprint, triangles: fragments });
    }
  }
  // The original map of own ids to JSON (last patch wins per id), with each
  // JSON formed only when an existing patch carries that id.
  const ownPatches = new Map(result.map(patch => [patch.id, patch]));
  const ownJson = new Map<string, string>();
  const own = { get: (id: string): string | undefined => {
    const patch = ownPatches.get(id);
    if (patch === undefined) return undefined;
    let json = ownJson.get(id);
    if (json === undefined) { json = JSON.stringify(patch); ownJson.set(id, json); }
    return json;
  } };
  // Every existing patch either returns [] or continues, so only the boolean
  // outcome matters; the exact SAT still decides every triangle that is near.
  const footprintBounds = footprints.map(footprint => footprintWorldBounds(footprint.origin, footprint.yaw,
    footprint.width / 2, footprint.near, footprint.far));
  if (usable) {
    const patches = plan.groundSurfacePatches ?? [], owned = new Map<number, boolean>();
    const isOwn = (index: number): boolean => {
      let known = owned.get(index);
      if (known === undefined) {
        const patch = patches[index], mine = own.get(patch.id);
        known = mine !== undefined && mine === JSON.stringify(patch); owned.set(index, known);
      }
      return known;
    };
    if (policy.validateExistingPatches && usable.invalidPatches.some(index => !isOwn(index))) return [];
    for (let index = 0; index < footprints.length; index += 1) {
      const footprint = footprints[index], bounds = footprintBounds[index];
      const overlaps = (patch: number): boolean => !isOwn(patch) && patches[patch].triangles.some(triangle =>
        !(bounds && triangleBeyond(triangle, bounds)) && overlapsExistingTriangle(triangle,
          footprint.origin, footprint.yaw, footprint.width / 2, footprint.near, footprint.far));
      if (bounds ? rectGridAny(usable.patchGrid, bounds, overlaps) : usable.patchGrid.values.some(overlaps)) return [];
    }
    return result;
  }
  for (const patch of plan.groundSurfacePatches ?? []) {
    // A stringified patch never equals undefined: only same-id patches can match.
    const mine = own.get(patch.id);
    if (mine !== undefined && mine === JSON.stringify(patch)) continue;
    if (policy.validateExistingPatches && patch.triangles.some(triangle => !Number.isSafeInteger(triangle.cell)
      || triangle.cell < 0 || triangle.cell >= field.surfaces.length || triangle.vertices.length !== 3
      || triangle.vertices.some(point => !(Number.isFinite(point.x) && Number.isFinite(point.y)
        && Number.isFinite(point.z))))) return [];
    if (footprints.some((footprint, index) => patch.triangles.some(triangle => {
      const bounds = footprintBounds[index];
      if (bounds && triangleBeyond(triangle, bounds)) return false;
      return overlapsExistingTriangle(triangle,
        footprint.origin, footprint.yaw, footprint.width / 2, footprint.near, footprint.far);
    }))) return [];
  }
  return result;
}
