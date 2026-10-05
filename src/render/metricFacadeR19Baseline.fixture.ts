/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R19 SOURCE-ONLY PROPOSAL. Intended target: src/render/metricFacadePlan.ts.
 * CPU descriptors only; no GPU allocation, producer edits or physics writes.
 * Installation is guarded by an explicit, source-indexed exemplar selection. */
import type { BuildingPiece } from '../data/buildingLooks.ts';
import type { LevelPlan, Prop, BoxCollider } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { exactBuildingBody } from '../level/protectedSiteEligibility.ts';
import { exteriorComposition } from './districtExteriorSites.ts';
import type { FacadeOpening } from './streetFacadeOpenings.ts';

export type MetricFinish = 'masonry' | 'frame' | 'roofEdge' | 'entry' | 'glazing';
export type MetricSurfaceKind = 'wall' | 'reveal' | 'closed-pane' | 'pane-frame'
  | 'closed-entry' | 'closed-service' | 'service-slat' | 'roof' | 'roof-joint' | 'cap';
export interface MetricSurface {
  readonly propIndex: number;
  readonly pieceKey: string;
  readonly kind: MetricSurfaceKind;
  readonly finish: MetricFinish;
  /** Ordered convex polygon with outward winding. Already cut by accepted masks. */
  readonly vertices: readonly Vec3[];
  readonly normal: Vec3;
  readonly batchKey: string;
}
export interface MetricReplacement {
  readonly key: string;
  readonly propIndex: number;
  readonly pieceIndex: number;
  /** Exact source emission record, never a newly authored body/roof envelope. */
  readonly source: BuildingPiece;
  readonly replacement: 'facade-shell' | 'residential-roof';
}
export interface MetricAperture {
  readonly id: string;
  readonly kind: 'window' | 'entry' | 'service';
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly recess: number;
  readonly propIndex: number;
  readonly pieceKey: string;
  readonly side: number;
  readonly floor: number;
  /** World surface corners at the source outer wall and at the closed pane. */
  readonly mouth: readonly Vec3[];
  readonly back: readonly Vec3[];
}
export interface MetricFace {
  readonly propIndex: number;
  readonly pieceKey: string;
  readonly side: number;
  readonly width: number;
  readonly height: number;
  readonly floorHeight: number;
  readonly roomPitch: number;
  readonly rooms: number;
  readonly floors: number;
  readonly family: 'commercial' | 'residential' | 'industrial' | 'untagged';
  readonly origin: Vec3;
  readonly yaw: number;
  readonly apertures: readonly MetricAperture[];
  readonly acceptedMaskRects: readonly Rect[];
}
export interface MetricFacadePlan {
  readonly selectedPropIndices: readonly number[];
  readonly replacements: readonly MetricReplacement[];
  readonly faces: readonly MetricFace[];
  readonly apertures: readonly MetricAperture[];
  readonly surfaces: readonly MetricSurface[];
  readonly protectedOpenings: readonly FacadeOpening[];
  readonly batchMetres: number;
}
export interface MetricFacadeSelection {
  /** Mandatory. Start with one complete served frontage, then its immediate neighbour. */
  readonly propIndices: readonly number[];
  readonly protectedOpenings: readonly FacadeOpening[];
  /** Finite merged chunks are mandatory; current proposal is 32 metres. */
  readonly batchMetres?: number;
}
export interface Rect { readonly left: number; readonly right: number; readonly bottom: number; readonly top: number }
interface FaceFrame { readonly origin: Vec3; readonly yaw: number }
interface Plane { readonly normal: Vec3; readonly limit: number }

const EPS = 1e-9;
const BODY_PARTS = new Set(['buildingBody', 'buildingLow', 'buildingTall']);
const NORMAL_LOOKS = new Set(['commercial', 'residential', 'industrial']);
/** Metre geometry targets, not appearance/lighting or physical tuning. */
const METRIC = Object.freeze({
  commercial: { storey: 3.2, room: 3.0, paneWidth: 1.65, paneHeight: 1.60, sill: 0.85 },
  residential: { storey: 3.1, room: 2.7, paneWidth: 1.25, paneHeight: 1.40, sill: 0.88 },
  industrial: { storey: 3.7, room: 3.2, paneWidth: 2.15, paneHeight: 1.10, sill: 1.70 },
  recess: 0.18, border: 0.065, doorWidth: 1.08, doorHeight: 2.12,
  serviceWidth: 3.2, serviceHeight: 3.05, roofJoint: 0.07, roofBay: 5.4,
});
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec3, amount: number): Vec3 => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const at = (origin: Vec3, yaw: number, x: number, y: number, z: number): Vec3 => ({
  x: origin.x + Math.cos(yaw) * x + Math.sin(yaw) * z,
  y: origin.y + y, z: origin.z - Math.sin(yaw) * x + Math.cos(yaw) * z,
});
const uv = (frame: FaceFrame, x: number, y: number, depth = 0): Vec3 => at(frame.origin, frame.yaw, x, y, depth);
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right - EPS && a.right > b.left + EPS
  && a.bottom < b.top - EPS && a.top > b.bottom + EPS;
const normalOf = (vertices: readonly Vec3[]): Vec3 => {
  const n = cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0]));
  const length = Math.hypot(n.x, n.y, n.z);
  if (!(length > EPS)) throw new Error('Metric facade emitted a degenerate polygon');
  return scale(n, 1 / length);
};
const polygonArea = (vertices: readonly Vec3[]): number => {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let index = 1; index < vertices.length - 1; index++) {
    const n = cross(sub(vertices[index], vertices[0]), sub(vertices[index + 1], vertices[0]));
    area += Math.hypot(n.x, n.y, n.z) / 2;
  }
  return area;
};

/** Exact legacy shader mask volume, including its 2 cm lateral and 5 cm bottom expansion.
 * The closed park-case mask is the same type; caller supplies the combined original list. */
export function metricOpeningPlanes(opening: FacadeOpening): readonly Plane[] {
  const p = opening.position, c = Math.cos(opening.yaw), s = Math.sin(opening.yaw);
  const lateral = { x: c, y: 0, z: -s }, depth = { x: s, y: 0, z: c };
  const halfWidth = opening.faceWidth / 2 + 0.02;
  // Explicit default mirrors STREET_LIFE.frontageHeight in the frozen source.
  // Caller must normalize omitted heights at integration (see HOOKS.md).
  if (opening.height === undefined) throw new Error('Normalize legacy opening heights before metric extraction');
  return [
    { normal: lateral, limit: dot(lateral, p) + halfWidth },
    { normal: scale(lateral, -1), limit: -dot(lateral, p) + halfWidth },
    { normal: depth, limit: dot(depth, p) + 0.8 },
    { normal: scale(depth, -1), limit: -dot(depth, p) + (opening.depth ?? 0.8) },
    { normal: { x: 0, y: 1, z: 0 }, limit: p.y + opening.height },
    { normal: { x: 0, y: -1, z: 0 }, limit: -p.y + 0.05 },
  ];
}

/** Convex polygon split. Coplanar mask boundaries stay in the inside remainder,
 * matching the accepted opening with conservative edge coverage. */
function splitByPlane(polygon: readonly Vec3[], plane: Plane): { inside: Vec3[]; outside: Vec3[] } {
  const inside: Vec3[] = [], outside: Vec3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = dot(plane.normal, a) - plane.limit, db = dot(plane.normal, b) - plane.limit;
    const aInside = da <= EPS, bInside = db <= EPS;
    (aInside ? inside : outside).push(a);
    if (aInside !== bInside) {
      const intersection = add(a, scale(sub(b, a), da / (da - db)));
      inside.push(intersection); outside.push(intersection);
    }
  }
  const clean = (points: Vec3[]): Vec3[] => points.filter((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    return Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) > EPS;
  });
  return { inside: clean(inside), outside: clean(outside) };
}

/** Subtraction is on the CPU once per rebuilt world, never per fragment.
 * Six sequential half-spaces produce disjoint retained convex polygons. */
export function metricSubtractOpening(polygon: readonly Vec3[], opening: FacadeOpening): readonly (readonly Vec3[])[] {
  let remainder = [...polygon];
  const retained: Vec3[][] = [];
  for (const plane of metricOpeningPlanes(opening)) {
    if (remainder.length < 3) break;
    const split = splitByPlane(remainder, plane);
    if (polygonArea(split.outside) > EPS) retained.push(split.outside);
    remainder = split.inside;
  }
  return retained;
}

/** Actual polygons stop at world chunk boundaries, including long spandrels/caps.
 * A centroid-only batch of an 80 m wall would retain an 80 m frustum bound. */
function splitIntoChunks(polygon: readonly Vec3[], pitch: number): readonly (readonly Vec3[])[] {
  let pieces: readonly (readonly Vec3[])[] = [polygon];
  for (const axis of ['x', 'z'] as const) {
    const low = Math.min(...polygon.map(point => point[axis])), high = Math.max(...polygon.map(point => point[axis]));
    if (high - low <= EPS) continue;
    for (let cell = Math.floor(low / pitch) + 1; cell * pitch < high - EPS; cell++) {
      const plane: Plane = { normal: axis === 'x' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 }, limit: cell * pitch };
      pieces = pieces.flatMap(piece => {
        const divided = splitByPlane(piece, plane);
        return [divided.inside, divided.outside].filter(part => polygonArea(part) > EPS);
      });
    }
  }
  return pieces;
}

/** Intersection of a vertical wall plane with the exact three-dimensional mask.
 * The mask yaw need not be parallel to the source body. */
function maskRect(frame: FaceFrame, width: number, height: number, opening: FacadeOpening, depth: number): Rect | undefined {
  let low = -width / 2, high = width / 2;
  const origin = uv(frame, 0, 0, depth), tangent = { x: Math.cos(frame.yaw), y: 0, z: -Math.sin(frame.yaw) };
  for (const plane of metricOpeningPlanes(opening).slice(0, 4)) {
    const coefficient = dot(plane.normal, tangent), room = plane.limit - dot(plane.normal, origin);
    if (Math.abs(coefficient) <= EPS) { if (room < -EPS) return undefined; }
    else if (coefficient > 0) high = Math.min(high, room / coefficient);
    else low = Math.max(low, room / coefficient);
  }
  const bottom = Math.max(0, opening.position.y - frame.origin.y - 0.05);
  const top = Math.min(height, opening.position.y - frame.origin.y + opening.height!);
  return high > low + EPS && top > bottom + EPS ? { left: low, right: high, bottom, top } : undefined;
}

/** Partition only along opening boundaries. Vertical room divisions are real piers;
 * no second painted window grid survives behind these wall rectangles. */
export function metricWallRects(width: number, height: number, cuts: readonly Rect[]): readonly Rect[] {
  const ys = [...new Set([0, height, ...cuts.flatMap(cut => [cut.bottom, cut.top])])].sort((a, b) => a - b);
  const walls: Rect[] = [];
  for (let row = 1; row < ys.length; row++) {
    const bottom = Math.max(0, ys[row - 1]), top = Math.min(height, ys[row]);
    if (top <= bottom + EPS) continue;
    const active = cuts.filter(cut => cut.bottom < top - EPS && cut.top > bottom + EPS)
      .map(cut => ({ left: Math.max(-width / 2, cut.left), right: Math.min(width / 2, cut.right) }))
      .filter(cut => cut.right > cut.left + EPS).sort((a, b) => a.left - b.left);
    let cursor = -width / 2;
    for (const cut of active) {
      if (cut.left > cursor + EPS) walls.push({ left: cursor, right: cut.left, bottom, top });
      cursor = Math.max(cursor, cut.right);
    }
    if (cursor < width / 2 - EPS) walls.push({ left: cursor, right: width / 2, bottom, top });
  }
  return walls;
}

/** Guard source extraction by complete emission identity, not a kind-wide regex. */
export function metricPieceIdentity(piece: BuildingPiece): string {
  return JSON.stringify([piece.part, piece.x, piece.y, piece.z, piece.sx, piece.sy, piece.sz,
    piece.yaw, piece.tone, piece.jitter]);
}

export function buildMetricFacadePlan(plan: LevelPlan, selection: MetricFacadeSelection): MetricFacadePlan {
  const pitch = selection.batchMetres ?? 32;
  if (!Number.isFinite(pitch) || pitch <= 0) throw new RangeError('Metric facade requires a finite positive batch pitch');
  if (!selection.propIndices.length || new Set(selection.propIndices).size !== selection.propIndices.length)
    throw new Error('Metric facade needs a nonempty explicit unique exemplar selection');
  const openings = selection.protectedOpenings;
  for (const opening of openings) {
    if (![opening.position.x, opening.position.y, opening.position.z, opening.yaw, opening.faceWidth,
      opening.height, opening.depth ?? 0.8].every(value => typeof value === 'number' && Number.isFinite(value))
      || opening.faceWidth <= 0 || opening.height! <= 0) throw new Error('Invalid normalized accepted opening');
  }
  const replacements: MetricReplacement[] = [], faces: MetricFace[] = [], apertures: MetricAperture[] = [];
  const surfaces: MetricSurface[] = [];
  const emit = (propIndex: number, pieceKey: string, kind: MetricSurfaceKind, finish: MetricFinish,
    vertices: readonly Vec3[]): void => {
    const normal = normalOf(vertices);
    let polygons: readonly (readonly Vec3[])[] = [vertices];
    for (const opening of openings) polygons = polygons.flatMap(poly => metricSubtractOpening(poly, opening));
    for (const poly of polygons.flatMap(polygon => splitIntoChunks(polygon, pitch))) {
      if (poly.length < 3) continue;
      const centroid = scale(poly.reduce(add, { x: 0, y: 0, z: 0 }), 1 / poly.length);
      surfaces.push({ propIndex, pieceKey, kind, finish, vertices: poly, normal,
        batchKey: `${finish}/${Math.floor(centroid.x / pitch)},${Math.floor(centroid.z / pitch)}` });
    }
  };
  const rect = (propIndex: number, key: string, kind: MetricSurfaceKind, finish: MetricFinish,
    frame: FaceFrame, r: Rect, depth = 0): void => {
    if (r.right <= r.left + EPS || r.top <= r.bottom + EPS) return;
    emit(propIndex, key, kind, finish, [uv(frame, r.left, r.bottom, depth), uv(frame, r.right, r.bottom, depth),
      uv(frame, r.right, r.top, depth), uv(frame, r.left, r.top, depth)]);
  };

  for (const propIndex of selection.propIndices) {
    if (!Number.isInteger(propIndex) || propIndex < 0) throw new Error('Invalid source prop index');
    const building = plan.props?.[propIndex], body = building && exactBuildingBody(plan, building);
    if (!building || !body || (building.look !== undefined && !NORMAL_LOOKS.has(building.look)))
      throw new Error(`Metric facade selection ${propIndex} is not an exact original ordinary building body`);
    const family = building.look ?? 'untagged';
    const dimensions = family === 'industrial' ? METRIC.industrial
      : family === 'residential' ? METRIC.residential : METRIC.commercial;
    const pieces = exteriorComposition(building);
    const frontage = plan.districtAdjacency?.frontages.find(front => front.propIndex === propIndex
      && !front.retainedOpening && front.role !== 'civic-margin');
    for (const [pieceIndex, piece] of pieces.entries()) {
      const key = `${propIndex}/${pieceIndex}`;
      const isBody = BODY_PARTS.has(piece.part), isRoof = family === 'residential' && piece.part === 'roofGable';
      if (!isBody && !isRoof) continue;
      const origin = at(building.position, building.rotationY, piece.x, piece.y, piece.z), yaw = building.rotationY + piece.yaw;
      replacements.push({ key, propIndex, pieceIndex, source: { ...piece },
        replacement: isBody ? 'facade-shell' : 'residential-roof' });
      if (isRoof) {
        // Exactly the source triangular-prism envelope. Long residential roofs become
        // jointed apartment/terrace-wing roofs, rather than a single stretched graphic.
        const spans = Math.max(1, Math.ceil(piece.sz / METRIC.roofBay)), span = piece.sz / spans;
        const local = (x: number, y: number, z: number): Vec3 => at(origin, yaw, x, y, z);
        for (let index = 0; index < spans; index++) {
          const z0 = -piece.sz / 2 + index * span, z1 = z0 + span;
          const joint = index === spans - 1 ? 0 : METRIC.roofJoint;
          emit(propIndex, key, 'roof', 'roofEdge', [local(-piece.sx / 2, 0, z1 - joint), local(0, piece.sy, z1 - joint),
            local(0, piece.sy, z0), local(-piece.sx / 2, 0, z0)]);
          emit(propIndex, key, 'roof', 'roofEdge', [local(piece.sx / 2, 0, z0), local(0, piece.sy, z0),
            local(0, piece.sy, z1 - joint), local(piece.sx / 2, 0, z1 - joint)]);
          if (joint > 0) {
            emit(propIndex, key, 'roof-joint', 'frame', [local(-piece.sx / 2, 0, z1), local(0, piece.sy, z1),
              local(0, piece.sy, z1 - joint), local(-piece.sx / 2, 0, z1 - joint)]);
            emit(propIndex, key, 'roof-joint', 'frame', [local(piece.sx / 2, 0, z1 - joint), local(0, piece.sy, z1 - joint),
              local(0, piece.sy, z1), local(piece.sx / 2, 0, z1)]);
          }
        }
        emit(propIndex, key, 'cap', 'roofEdge', [local(-piece.sx / 2, 0, piece.sz / 2),
          local(piece.sx / 2, 0, piece.sz / 2), local(0, piece.sy, piece.sz / 2)]);
        emit(propIndex, key, 'cap', 'roofEdge', [local(piece.sx / 2, 0, -piece.sz / 2),
          local(-piece.sx / 2, 0, -piece.sz / 2), local(0, piece.sy, -piece.sz / 2)]);
        emit(propIndex, key, 'cap', 'roofEdge', [local(-piece.sx / 2, 0, -piece.sz / 2),
          local(piece.sx / 2, 0, -piece.sz / 2), local(piece.sx / 2, 0, piece.sz / 2), local(-piece.sx / 2, 0, piece.sz / 2)]);
        continue;
      }
      const floors = Math.max(1, Math.round(piece.sy / dimensions.storey)), floorHeight = piece.sy / floors;
      for (let side = 0; side < 4; side++) {
        const faceYaw = yaw + side * Math.PI / 2, width = side % 2 ? piece.sz : piece.sx;
        const depth = side % 2 ? piece.sx : piece.sz;
        const frame: FaceFrame = { origin: at(origin, faceYaw, 0, 0, depth / 2), yaw: faceYaw };
        const rooms = Math.max(1, Math.round(width / dimensions.room)), roomPitch = width / rooms;
        const maskRects = openings.map(opening => maskRect(frame, width, piece.sy, opening, 0)).filter((r): r is Rect => !!r);
        const maskDepthRects = openings.flatMap(opening => [0, -METRIC.recess].map(d => maskRect(frame, width, piece.sy, opening, d)))
          .filter((r): r is Rect => !!r);
        const faceApertures: MetricAperture[] = [];
        const admit = (kind: MetricAperture['kind'], r: Rect, floor: number): void => {
          if (r.left < -width / 2 + 0.15 || r.right > width / 2 - 0.15 || r.bottom < 0 || r.top > piece.sy - 0.15
            || maskDepthRects.some(mask => intersects(r, mask)) || faceApertures.some(old => intersects(r, old))) return;
          const recess = Math.min(METRIC.recess, depth / 4);
          const mouth = [uv(frame, r.left, r.bottom), uv(frame, r.right, r.bottom), uv(frame, r.right, r.top), uv(frame, r.left, r.top)];
          const back = [uv(frame, r.left, r.bottom, -recess), uv(frame, r.right, r.bottom, -recess),
            uv(frame, r.right, r.top, -recess), uv(frame, r.left, r.top, -recess)];
          faceApertures.push({ id: `${key}/${side}/${floor}/${faceApertures.length}`, kind, ...r, recess,
            propIndex, pieceKey: key, side, floor, mouth, back });
        };
        // One real approach, one common human-sized entrance. No unsupported paths
        // or inaccessible imitation doors are distributed across long domestic wings.
        if (pieceIndex === 0 && frontage && Math.cos(frontage.yaw - faceYaw) > 1 - 1e-7) {
          const delta = sub(frontage.position, frame.origin);
          const x = delta.x * Math.cos(faceYaw) - delta.z * Math.sin(faceYaw);
          const y = delta.y;
          if (METRIC.doorHeight <= floorHeight - 0.25) admit('entry', { left: x - METRIC.doorWidth / 2,
            right: x + METRIC.doorWidth / 2, bottom: Math.max(0, y), top: Math.max(0, y) + METRIC.doorHeight }, 0);
        }
        for (let floor = 0; floor < floors; floor++) {
          if (family === 'industrial' && floor === 0) {
            const services = Math.max(1, Math.floor(width / 6.4)), servicePitch = width / services;
            for (let bay = 0; bay < services; bay++) {
              const x = -width / 2 + servicePitch * (bay + 0.5), serviceHeight = Math.min(METRIC.serviceHeight, floorHeight - 0.35);
              if (serviceHeight >= 2.5) admit('service', { left: x - METRIC.serviceWidth / 2,
                right: x + METRIC.serviceWidth / 2, bottom: 0.10, top: 0.10 + serviceHeight }, floor);
            }
          } else for (let room = 0; room < rooms; room++) {
            const x = -width / 2 + roomPitch * (room + 0.5);
            const shop = floor === 0 && (family === 'commercial' || family === 'untagged');
            const paneWidth = Math.min(shop ? roomPitch - 0.45 : dimensions.paneWidth, roomPitch - 0.5);
            const sill = shop ? 0.48 : dimensions.sill;
            const paneHeight = Math.min(shop ? 2.15 : dimensions.paneHeight, floorHeight - sill - 0.30);
            if (paneWidth >= 0.75 && paneHeight >= 0.8) admit('window', { left: x - paneWidth / 2,
              right: x + paneWidth / 2, bottom: floor * floorHeight + sill,
              top: floor * floorHeight + sill + paneHeight }, floor);
          }
        }
        const cuts = [...maskRects, ...faceApertures];
        for (const wall of metricWallRects(width, piece.sy, cuts)) rect(propIndex, key, 'wall', 'masonry', frame, wall);
        for (const aperture of faceApertures) {
          const r = aperture, [a, b, c, d] = aperture.mouth, [aa, bb, cc, dd] = aperture.back;
          // Cavity returns meet the outer wall exactly and seal against opaque panes.
          emit(propIndex, key, 'reveal', 'masonry', [a, aa, dd, d]);
          emit(propIndex, key, 'reveal', 'masonry', [b, c, cc, bb]);
          emit(propIndex, key, 'reveal', 'masonry', [a, b, bb, aa]);
          emit(propIndex, key, 'reveal', 'masonry', [d, dd, cc, c]);
          const border = METRIC.border, inner: Rect = { left: r.left + border, right: r.right - border,
            bottom: r.bottom + border, top: r.top - border };
          for (const ring of metricWallRects(r.right - r.left, r.top - r.bottom,
            [{ left: -((r.right - r.left) / 2) + border, right: (r.right - r.left) / 2 - border,
              bottom: border, top: r.top - r.bottom - border }])) {
            rect(propIndex, key, 'pane-frame', 'frame', frame, { left: ring.left + (r.left + r.right) / 2,
              right: ring.right + (r.left + r.right) / 2, bottom: ring.bottom + r.bottom, top: ring.top + r.bottom }, -r.recess);
          }
          if (r.kind === 'service') {
            const slats = Math.ceil((inner.top - inner.bottom) / 0.30), step = (inner.top - inner.bottom) / slats;
            for (let slat = 0; slat < slats; slat++) {
              const bottom = inner.bottom + slat * step, top = bottom + step;
              rect(propIndex, key, 'closed-service', 'entry', frame, { ...inner, bottom, top: top - 0.025 }, -r.recess);
              rect(propIndex, key, 'service-slat', 'frame', frame, { ...inner, bottom: top - 0.025, top }, -r.recess);
            }
          } else if (r.kind === 'entry') rect(propIndex, key, 'closed-entry', 'entry', frame, inner, -r.recess);
          else {
            const middle = (inner.left + inner.right) / 2, mullion = inner.right - inner.left > 1.45 ? 0.045 : 0;
            if (mullion) {
              rect(propIndex, key, 'closed-pane', 'glazing', frame, { ...inner, right: middle - mullion / 2 }, -r.recess);
              rect(propIndex, key, 'pane-frame', 'frame', frame, { ...inner, left: middle - mullion / 2, right: middle + mullion / 2 }, -r.recess);
              rect(propIndex, key, 'closed-pane', 'glazing', frame, { ...inner, left: middle + mullion / 2 }, -r.recess);
            } else rect(propIndex, key, 'closed-pane', 'glazing', frame, inner, -r.recess);
          }
        }
        faces.push({ propIndex, pieceKey: key, side, width, height: piece.sy, floorHeight, roomPitch, rooms,
          floors, family: family as MetricFace['family'], origin: frame.origin, yaw: faceYaw,
          apertures: faceApertures, acceptedMaskRects: maskRects });
        apertures.push(...faceApertures);
      }
      // Source bottom and top close the exact body envelope. Mask subtraction applies
      // here too for unusually short accepted hosts; interiors own their masked region.
      emit(propIndex, key, 'cap', 'masonry', [at(origin, yaw, -piece.sx / 2, 0, -piece.sz / 2),
        at(origin, yaw, piece.sx / 2, 0, -piece.sz / 2), at(origin, yaw, piece.sx / 2, 0, piece.sz / 2), at(origin, yaw, -piece.sx / 2, 0, piece.sz / 2)]);
      emit(propIndex, key, 'cap', 'masonry', [at(origin, yaw, -piece.sx / 2, piece.sy, piece.sz / 2),
        at(origin, yaw, piece.sx / 2, piece.sy, piece.sz / 2), at(origin, yaw, piece.sx / 2, piece.sy, -piece.sz / 2), at(origin, yaw, -piece.sx / 2, piece.sy, -piece.sz / 2)]);
    }
  }
  return { selectedPropIndices: [...selection.propIndices], replacements, faces, apertures, surfaces,
    protectedOpenings: openings, batchMetres: pitch };
}

/** Same final records are consumed by the mesh builder. No independent cost catalogue. */
export function metricFacadeCost(plan: MetricFacadePlan): {
  drawCalls: number; colourTriangles: number; geometryBytes: number; instanceBytes: 0;
  geometryOwners: number; materialOwners: 0; textureBytes: 0;
} {
  const batches = new Set(plan.surfaces.map(surface => surface.batchKey));
  const triangles = plan.surfaces.reduce((sum, surface) => sum + surface.vertices.length - 2, 0);
  return { drawCalls: batches.size, colourTriangles: triangles, geometryBytes: triangles * 3 * 9 * Float32Array.BYTES_PER_ELEMENT,
    instanceBytes: 0, geometryOwners: batches.size, materialOwners: 0, textureBytes: 0 };
}

/** Structural extraction ledger: source emits each replaced record once, unchanged.
 * Tier policy is separate: ordinary skips colour; Ultra keeps a counted original caster proxy. */
export function metricExtractionLedger(plan: MetricFacadePlan): {
  consume(propIndex: number, pieceIndex: number, source: BuildingPiece): boolean;
  assertComplete(): void;
} {
  const wanted = new Map(plan.replacements.map(record => [record.key, record]));
  const seen = new Set<string>();
  return { consume(propIndex, pieceIndex, source) {
    const key = `${propIndex}/${pieceIndex}`, record = wanted.get(key);
    if (!record) return false;
    if (seen.has(key)) throw new Error(`Metric source piece ${key} was replaced twice`);
    if (metricPieceIdentity(source) !== metricPieceIdentity(record.source)) throw new Error(`Metric source piece ${key} drifted`);
    seen.add(key); return true;
  }, assertComplete() {
    if (seen.size !== wanted.size) throw new Error(`Metric source extraction omitted ${wanted.size - seen.size} expected records`);
  } };
}

/** Independent source envelope accessor for integration/test controls, never a collider write. */
export function metricOriginalBody(plan: LevelPlan, index: number): BoxCollider | undefined {
  const prop: Prop | undefined = plan.props?.[index];
  return prop ? exactBuildingBody(plan, prop) : undefined;
}
