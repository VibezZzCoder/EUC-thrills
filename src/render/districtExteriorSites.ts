/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-owned exterior layout, derived from actual original building bodies.
 * No producer writes, random stream draws or physical ground. Closed entries
 * reward existing admitted frontage approaches without opening the host body. */
import { composeBuilding, facadeForHeight, type BuildingPiece } from '../data/buildingLooks.ts';
import { BUILDING_FACADE, BUILDING_TONES, PROP_COLOURS, PROP_SIZES, PROP_TINT_JITTER,
  type BuildingLook } from '../data/props.ts';
import { buildingTowerPart } from '../data/renderCost.ts';
import { STREET_LIFE } from '../data/streetLife.ts';
import { ULTRA } from '../data/tuning.ts';
import { positionHash01 } from '../shared/maths.ts';
import type { LevelPlan, Prop, BoxCollider } from '../level/plan.ts';
import { exactBuildingBody, nearestPavedStreetStation } from '../level/protectedSiteEligibility.ts';
import { clippedFieldTriangles } from '../level/streetFronts.ts';
import { createPopulationValidationContext, populationFootprintExclusion, surfaceFootprintClear,
  type PopulationValidationContext } from '../level/populationPlan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type Vec3, type SurfaceId } from '../simulation/world.ts';
import { boxOverlapsPolygon } from '../level/streetFronts.ts';
import type { FacadeOpening } from './streetFacadeOpenings.ts';

export type ExteriorFinish = 'masonry' | 'frame' | 'roofEdge' | 'planting' | 'entry' | 'glazing';
export type ExteriorKind = 'plinth' | 'cornice' | 'sill' | 'pier' | 'roof-edge' | 'ridge' | 'ground-cover'
  | 'base-panel' | 'base-return' | 'shaft-band' | 'shaft-stile' | 'shaft-brace' | 'roof-rim'
  | 'closed-entry' | 'entry-frame' | 'entry-handle' | 'ground-window' | 'window-frame';
export interface ExteriorBox {
  readonly shape: 'box'; readonly kind: ExteriorKind; readonly finish: ExteriorFinish;
  readonly position: Vec3; readonly size: Vec3; readonly yaw: number; readonly rich: boolean;
}
export interface ExteriorBeam {
  readonly shape: 'beam'; readonly kind: 'roof-edge' | 'ridge' | 'shaft-brace'; readonly finish: 'roofEdge' | 'frame';
  readonly from: Vec3; readonly to: Vec3; readonly thickness: number; readonly rich: boolean;
  /** Wall-mounted braces keep their square section normal to this source face. */
  readonly faceYaw?: number;
}
export interface ExteriorCover {
  readonly shape: 'cover'; readonly kind: 'ground-cover'; readonly finish: 'planting';
  readonly position: Vec3; readonly normal: Vec3; readonly radius: number; readonly height: number;
  readonly yaw: number; readonly rich: false;
}
export type ExteriorPart = ExteriorBox | ExteriorBeam | ExteriorCover;
export interface ExteriorParcel {
  readonly polygon: readonly Vec3[];
  readonly roots: readonly ExteriorCover[];
}
export interface DistrictExteriorSite {
  readonly id: string; readonly propIndex: number; readonly building: Prop; readonly body: BoxCollider;
  /** Undefined preserves a genuinely untagged source block; it is not retail. */
  readonly look: BuildingLook | undefined; readonly streetSegmentId?: string; readonly streetFaceYaw?: number;
  readonly parts: readonly ExteriorPart[]; readonly parcels: readonly ExteriorParcel[];
}

const GRASS = new Set<SurfaceId>(['grass']);
const CLIP = Object.freeze({ allowedSurfaces: ['grass'] as readonly SurfaceId[],
  maximumHeightDifference: 0.35, maximumGradient: 0.12, maximumCellsPerPolygon: 128 });
const finite = (...values: number[]): boolean => values.every(Number.isFinite);

/** Exact existing local pieces, including the original untagged prop branch.
 * Tones/jitter are existing source descriptors for the appearance owner; this
 * helper neither assigns a district look nor changes any material or palette.
 * The optional legacy tower uses the shared cost model's suppression rule. */
export function exteriorComposition(building: Prop): readonly BuildingPiece[] {
  if (building.kind !== 'building') return [];
  if (building.look !== undefined) return composeBuilding({ ...building, look: building.look });
  const size = building.size ?? { x: 12, y: 18, z: 12 }, shape = PROP_SIZES.building;
  const { x, z } = building.position;
  const tone = BUILDING_TONES[Math.floor(positionHash01(x, z, 3) * BUILDING_TONES.length) % BUILDING_TONES.length];
  const jitter = 1 + (positionHash01(x, z, 5) * 2 - 1) * PROP_TINT_JITTER.building;
  const pieces: BuildingPiece[] = [
    { part: facadeForHeight(size.y), x: 0, y: 0, z: 0, sx: size.x, sy: size.y, sz: size.z, yaw: 0, tone, jitter },
    { part: 'buildingCap', x: 0, y: size.y, z: 0, sx: size.x + shape.capOversail,
      sy: shape.capHeight, sz: size.z + shape.capOversail, yaw: 0, tone: PROP_COLOURS.buildingCap,
      jitter: 1 + (positionHash01(x, z, 7) * 2 - 1) * PROP_TINT_JITTER.structure },
  ];
  const tower = buildingTowerPart(size, x, z);
  if (tower !== null) pieces.push({ part: tower, x: 0, y: size.y + shape.capHeight, z: 0,
    sx: size.x * shape.towerWidthFraction, sy: size.y * shape.towerHeightFraction,
    sz: size.z * shape.towerWidthFraction, yaw: 0, tone, jitter });
  return pieces;
}

function at(origin: Vec3, yaw: number, x: number, y: number, z: number): Vec3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: origin.x + c * x + s * z, y: origin.y + y, z: origin.z - s * x + c * z };
}
function boxCorners(box: ExteriorBox): readonly Vec3[] {
  return [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z =>
    at(box.position, box.yaw, x * box.size.x / 2, y * box.size.y / 2, z * box.size.z / 2))));
}
/** Conservative full-volume overlap with the exact existing display mask.
 * Roof beams use their padded bounds; skipping a member cannot cover an opening. */
export function exteriorPartMeetsOpening(part: ExteriorPart, opening: FacadeOpening): boolean {
  if (part.shape === 'cover') return false;
  const points = part.shape === 'box' ? boxCorners(part) : [part.from, part.to].flatMap(point =>
    [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => ({
      x: point.x + x * part.thickness, y: point.y + y * part.thickness, z: point.z + z * part.thickness })))));
  const c = Math.cos(opening.yaw), s = Math.sin(opening.yaw);
  const lateral = points.map(p => (p.x - opening.position.x) * c - (p.z - opening.position.z) * s);
  const depth = points.map(p => (p.x - opening.position.x) * s + (p.z - opening.position.z) * c);
  const y = points.map(p => p.y - opening.position.y);
  return Math.max(...lateral) > -opening.faceWidth / 2 - 0.02
    && Math.min(...lateral) < opening.faceWidth / 2 + 0.02
    && Math.max(...depth) > -(opening.depth ?? 0.8) && Math.min(...depth) < 0.8
    && Math.max(...y) > -0.05 && Math.min(...y) < (opening.height ?? STREET_LIFE.frontageHeight);
}

/** Display planting reserves whole original authored bands conservatively;
 * it never gives drafted population a physical lane or changes its admission. */
function meetsAuthoredPath(plan: LevelPlan, polygon: readonly Vec3[]): boolean {
  for (const path of plan.populationPaths ?? []) for (let index = 1; index < path.frames.length; index += 1) {
    const a = path.frames[index - 1], b = path.frames[index];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!finite(length, a.halfWidthMetres, b.halfWidthMetres) || length <= 0) return true;
    const reach = Math.max(a.halfWidthMetres, b.halfWidthMetres);
    const box: BoxCollider = { centre: { x: (a.x + b.x) / 2, y: 0, z: (a.z + b.z) / 2 },
      halfExtents: { x: reach, y: 1, z: length / 2 + reach },
      rotationY: Math.atan2(b.x - a.x, b.z - a.z), surface: 'grass' };
    if (boxOverlapsPolygon(box, polygon)) return true;
  }
  return false;
}

function parcel(plan: LevelPlan, sampler: PlanTerrainSampler, context: PopulationValidationContext,
  origin: Vec3, yaw: number, width: number, depth: number, salt: number): ExteriorParcel | undefined {
  const ground = sampler.sampleGround(origin.x, origin.z, createGroundSample());
  if (ground.surface !== 'grass' || ground.offCourse || !finite(ground.height, ground.normal.y)
    || ground.normal.y < 1 / Math.sqrt(1 + CLIP.maximumGradient ** 2)) return undefined;
  const polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) =>
    at({ ...origin, y: ground.height }, yaw, x * width / 2, 0, z * depth / 2));
  if (!surfaceFootprintClear(plan, polygon, GRASS, context) || meetsAuthoredPath(plan, polygon)) return undefined;
  const triangles = clippedFieldTriangles(plan.heightfield, polygon, ground.height, CLIP);
  if (!triangles?.length) return undefined;
  const blank = { x: origin.x, z: origin.z, headingY: yaw, halfWidthMetres: width / 2,
    halfLengthMetres: depth / 2, minY: ground.height, maxY: ground.height + 0.18, velocityX: 0, velocityZ: 0 };
  if (populationFootprintExclusion(plan, { polygon, minY: Math.min(...triangles.flatMap(t => t.vertices.map(p => p.y))),
    maxY: Math.max(...triangles.flatMap(t => t.vertices.map(p => p.y))) + 0.18,
    fromFraction: 0, toFraction: 1, fromHull: blank, toHull: blank }, context)) return undefined;
  const roots: ExteriorCover[] = [];
  // Low foliage is permeable ground cover, never a planter, kerb or hedge.
  // Every root and its whole disk stays on an original source triangle plane.
  for (let column = 0; column < Math.floor(width / 0.42); column += 1) {
    for (let row = 0; row < Math.floor(depth / 0.42); row += 1) {
      const rank = positionHash01(column + origin.x, row + origin.z, salt);
      if (rank > 0.72) continue;
      const x = -width / 2 + 0.26 + column * 0.42, z = -depth / 2 + 0.26 + row * 0.42;
      const p = at(origin, yaw, x, 0, z), radius = 0.12 + rank * 0.04;
      const sample = sampler.sampleGround(p.x, p.z, createGroundSample());
      let supported = sample.surface === 'grass' && !sample.offCourse && sample.normal.y > 0;
      const height = sample.height, normal = { ...sample.normal };
      for (const [dx, dz] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius]]) {
        const support = sampler.sampleGround(p.x + dx, p.z + dz, createGroundSample());
        const plane = height - (normal.x * dx + normal.z * dz) / normal.y;
        if (support.surface !== 'grass' || support.offCourse || Math.abs(support.height - plane) > 0.012) supported = false;
      }
      if (supported) roots.push({ shape: 'cover', kind: 'ground-cover', finish: 'planting',
        position: { x: p.x, y: height + 0.003, z: p.z }, normal, radius, height: 0.06 + rank * 0.06,
        yaw: rank * Math.PI * 2, rich: false });
    }
  }
  return roots.length ? { polygon, roots } : undefined;
}

/** Whole original building exteriors, rather than another sparse shop selector.
 * Narrow relief follows the original metric facade bands and composed roofs.
 * Ground parcels are optional and cannot paint over finished paths or hazards. */
export function districtExteriorSites(plan: LevelPlan,
  protectedOpenings: readonly FacadeOpening[] = [],
  replacedPropIndices: ReadonlySet<number> = new Set()): readonly DistrictExteriorSite[] {
  const sampler = new PlanTerrainSampler(plan), context = createPopulationValidationContext(plan);
  const sites: DistrictExteriorSite[] = [];
  for (let propIndex = 0; propIndex < (plan.props?.length ?? 0); propIndex += 1) {
    const building = plan.props![propIndex], body = exactBuildingBody(plan, building), size = building.size;
    if (!body || !size) continue;
    const look = building.look, parts: ExteriorPart[] = [], parcels: ExteriorParcel[] = [];
    const emit = (part: ExteriorPart): void => {
      if (!protectedOpenings.some(opening => exteriorPartMeetsOpening(part, opening))) parts.push(part);
    };
    const box = (kind: ExteriorKind, finish: ExteriorFinish, origin: Vec3, yaw: number,
      x: number, y: number, z: number, width: number, height: number, depth: number, rich = false): void => {
      if (Math.min(width, height, depth) <= 0) return;
      emit({ shape: 'box', kind, finish, position: at(origin, yaw, x, y, z),
        size: { x: width, y: height, z: depth }, yaw, rich });
    };
    const composed = exteriorComposition(building);
    const frontage = plan.districtAdjacency?.frontages.find(front => front.propIndex === propIndex
      && !front.retainedOpening && front.role !== 'civic-margin');
    const station = nearestPavedStreetStation(plan, building);
    let streetFaceYaw: number | undefined;
    let bestFace = -Infinity;
    for (let side = 0; side < 4; side += 1) {
      const yaw = building.rotationY + side * Math.PI / 2;
      const width = side % 2 ? size.z : size.x, depth = side % 2 ? size.x : size.z;
      const face = at(building.position, yaw, 0, 0, depth / 2);
      const facing = station ? Math.sin(yaw) * (station.point.x - face.x)
        + Math.cos(yaw) * (station.point.z - face.z) : -Infinity;
      if (facing > bestFace) { bestFace = facing; streetFaceYaw = yaw; }
      // Plinth remains inside the authoritative original body, with a 2 mm
      // face separation to avoid coplanar fighting, and adds no ground slab.
      box('plinth', 'masonry', face, yaw, 0, 0.22, -0.028, width, 0.44, 0.060);
    }
    // Every real facade piece keeps its own baked band count and base datum:
    // legacy rooftop setbacks, landmark cabins and decks are not main bodies.
    for (const piece of composed) {
      if (!['buildingTall', 'buildingBody', 'buildingLow'].includes(piece.part)) continue;
      const origin = at(building.position, building.rotationY, piece.x, piece.y, piece.z);
      const floors = piece.part === 'buildingTall' ? BUILDING_FACADE.highFloors
        : piece.part === 'buildingLow' ? BUILDING_FACADE.lowRiseFloors : BUILDING_FACADE.lowFloors;
      const band = piece.sy / floors;
      // Ultra's ground band mitres inward by this exact native relief. These
      // bounded corner piers terminate the flush trim at the actual host;
      // the original ordinary facade keeps the richer returns hidden.
      const reveal = ULTRA.relief.revealDepth;
      if (look === 'industrial' && piece.y === 0 && piece.sx > 2 * reveal && piece.sz > 2 * reveal) {
        for (const x of [-1, 1]) for (const z of [-1, 1]) box('base-return', 'frame', origin,
          building.rotationY + piece.yaw, x * (piece.sx / 2 - reveal / 2), band / 2,
          z * (piece.sz / 2 - reveal / 2), reveal, band, reveal, true);
      }
      for (let side = 0; side < 4; side += 1) {
        const yaw = building.rotationY + piece.yaw + side * Math.PI / 2;
        const width = side % 2 ? piece.sz : piece.sx, depth = side % 2 ? piece.sx : piece.sz;
        const face = at(origin, yaw, 0, 0, depth / 2);
        // The existing plinth ends at -.058m; its inward backing meets the
        // recessed native wall at -reveal. Corner piers own the mitred ends.
        if (look === 'industrial' && piece.y === 0 && width > 2 * reveal && depth > 2 * reveal) {
          const back = 0.028 + 0.060 / 2;
          if (reveal > back) box('base-return', 'frame', face, yaw, 0, 0.22,
            -(reveal + back) / 2, width - 2 * reveal, 0.44, reveal - back, true);
        }
        // The original solid ground-floor band receives joints, not windows or
        // invented accessible doors. Relief below rider height stays within
        // the source wall with only the same 2 mm coplanar separation as base.
        if (piece.y === 0) {
          box('base-panel', 'masonry', face, yaw, 0, band - 0.12, -0.028, width - 0.24, 0.24, 0.060);
          const bays = Math.max(1, Math.min(5, Math.ceil(width / 7)));
          for (let bay = 1; bay < bays; bay += 1) box('base-panel', 'frame', face, yaw,
            -width / 2 + width * bay / bays, band / 2, -0.028, 0.16, Math.max(0.1, band - 0.44), 0.060);
        }
        for (let floor = 1; floor < floors; floor += 1) {
          const bottom = floor * band + band * (1 - BUILDING_FACADE.glazing);
          box('sill', look === 'industrial' ? 'frame' : 'masonry', face, yaw,
            0, bottom - 0.035, 0.035, width - 0.24, 0.14, 0.20);
          // Existing ribbon glazing stays visible. These coarse piers sit at
          // the actual face corners, not across atlas window centres.
          for (const sign of [-1, 1]) box('pier', 'frame', face, yaw,
            sign * (width / 2 - 0.10), (bottom + (floor + 1) * band) / 2, 0.012,
            0.12, (floor + 1) * band - bottom, 0.08, true);
        }
        if (look === 'commercial' || look === undefined) {
          box('cornice', 'masonry', face, yaw, 0, piece.sy - 0.15, 0.045, width + 0.10, 0.30, 0.24);
          box('cornice', 'frame', face, yaw, 0, band - 0.10, 0.030, width - 0.18, 0.20, 0.14);
        } else if (look === 'industrial') {
          const bays = Math.max(1, Math.min(5, Math.round(width / 9)));
          for (let bay = 1; bay < bays; bay += 1) box('pier', 'frame', face, yaw,
            -width / 2 + width * bay / bays, piece.sy / 2, 0.010, 0.18, piece.sy - 0.24, 0.06);
        } else if (piece.y > 0) {
          // The actual glazed landmark cabin/deck has a top and a sill, while
          // its plain supporting shaft gets no fictional facade bands.
          box('cornice', 'frame', face, yaw, 0, piece.sy - 0.10, 0.012, width, 0.20, 0.08);
        }
      }
    }
    // One closed entry faces the actual installed approach. It is neither a
    // shop classification nor a new accessible opening. Existing accepted
    // shop/domestic/depot fronts retain their own richer composition.
    if (frontage && (look === undefined || ['commercial', 'residential', 'industrial'].includes(look))) {
      const origin = frontage.position, yaw = frontage.yaw;
      const main = composed.find(piece => piece.y === 0
        && ['buildingTall', 'buildingBody', 'buildingLow'].includes(piece.part));
      const floors = main?.part === 'buildingTall' ? BUILDING_FACADE.highFloors
        : main?.part === 'buildingLow' ? BUILDING_FACADE.lowRiseFloors : BUILDING_FACADE.lowFloors;
      const band = main ? main.sy / floors : 0;
      const height = Math.min(2.12, band - 0.18), width = look === 'industrial' ? 1.28 : 1.08;
      if (height >= 1.9 && frontage.width >= 4) {
        // Recess the closed panel; its thick trim clears the old base relief.
        box('closed-entry', 'entry', origin, yaw, 0, height / 2, 0.014, width, height, 0.018);
        for (const side of [-1, 1]) box('entry-frame', 'frame', origin, yaw,
          side * (width / 2 + 0.07), height / 2, 0.022, 0.14, height + 0.12, 0.076);
        box('entry-frame', 'frame', origin, yaw, 0, height + 0.06, 0.022, width + 0.28, 0.14, 0.076);
        box('entry-handle', 'roofEdge', origin, yaw, width * 0.33, 1.02, 0.048, 0.035, 0.24, 0.03);
        box('entry-frame', 'masonry', origin, yaw, 0, 0.05, 0.030, width + 0.22, 0.10, 0.11);
        // A broad commercial ground floor needs a bay rhythm across its
        // frontage, rather than two tiny house windows beside one door.
        // These remain closed windows on the exact original protecting body.
        const commercial = look === 'commercial' || look === undefined;
        const pairs = commercial ? Math.max(1, Math.min(3, Math.floor(frontage.width / 10))) : 1;
        const first = width / 2 + 0.8, last = frontage.width / 2 - 0.45;
        const bay = (last - first) / pairs;
        const windowWidth = commercial ? Math.min(3.6, bay * 0.70) : Math.min(1.45, frontage.width * 0.18);
        const windowHeight = Math.min(commercial ? 1.65 : 1.22, height - 0.45);
        for (const side of [-1, 1]) for (let pair = 0; pair < pairs; pair++) {
          const x = side * (commercial ? first + bay * (pair + 0.5)
            : Math.min(3.05, frontage.width / 2 - windowWidth / 2 - 0.3));
          const y = (commercial ? 0.58 : 0.92) + windowHeight / 2;
          box('ground-window', 'glazing', origin, yaw, x, y, 0.012, windowWidth, windowHeight, 0.018);
          for (const edge of [-1, 1]) {
            box('window-frame', 'frame', origin, yaw, x + edge * (windowWidth / 2 + 0.055), y, 0.027,
              0.11, windowHeight + 0.22, 0.07);
            box('window-frame', 'frame', origin, yaw, x, y + edge * (windowHeight / 2 + 0.055), 0.027,
              windowWidth + 0.22, 0.11, 0.07);
          }
          box('window-frame', 'frame', origin, yaw, x, y, 0.027, 0.055, windowHeight, 0.07);
        }
      }
    }
    // Plain caps are actual roof rims, shafts or tanks. Divisions follow only
    // those composed volumes; a lookout remains its authored solid timber
    // shaft under its glazed cabin, rather than becoming an invented shop.
    for (const piece of composed) {
      if (piece.part !== 'buildingCap') continue;
      const origin = at(building.position, building.rotationY, piece.x, piece.y, piece.z);
      const shaft = Math.min(piece.sx, piece.sz) >= 1 && piece.sy >= 8
        && piece.sy > Math.max(piece.sx, piece.sz) * 1.5;
      const rim = piece.sy <= 1.5 && piece.y > 0;
      if (!shaft && !rim) continue;
      for (let side = 0; side < 4; side += 1) {
        const yaw = building.rotationY + piece.yaw + side * Math.PI / 2;
        const width = side % 2 ? piece.sz : piece.sx, depth = side % 2 ? piece.sx : piece.sz;
        const face = at(origin, yaw, 0, 0, depth / 2);
        if (rim) {
          box('roof-rim', 'roofEdge', face, yaw, 0, piece.sy - 0.08, 0.012, width, 0.16, 0.08);
          continue;
        }
        const sections = Math.max(2, Math.min(6, Math.round(piece.sy / 4)));
        for (let section = 1; section < sections; section += 1) box('shaft-band', 'frame', face, yaw,
          0, piece.sy * section / sections, -0.028, width, 0.24, 0.060);
        for (const sign of [-1, 1]) box('shaft-stile', 'frame', face, yaw,
          sign * (width / 2 - 0.13), piece.sy / 2, -0.048, 0.26, piece.sy, 0.100);
        if (look === 'lookout' && piece.y === 0) for (let section = 0; section < sections; section += 1) {
          const low = piece.sy * section / sections + 0.24, high = piece.sy * (section + 1) / sections - 0.24;
          for (const sign of [-1, 1]) emit({ shape: 'beam', kind: 'shaft-brace', finish: 'frame',
            from: at(face, yaw, -sign * (width / 2 - 0.26), low, -0.058),
            to: at(face, yaw, sign * (width / 2 - 0.26), high, -0.058), thickness: 0.12, faceYaw: yaw, rich: false });
        }
      }
    }
    // Trim the roofs that are actually composed for this very prop, including
    // pitched houses, sawtooth sheds, park cabins and original landmark crowns.
    for (const piece of composed) {
      if (piece.part !== 'roofGable') continue;
      const origin = at(building.position, building.rotationY, piece.x, piece.y, piece.z);
      const yaw = building.rotationY + piece.yaw, t = look === 'industrial' ? 0.16 : 0.20;
      const beam = (kind: 'roof-edge' | 'ridge', from: Vec3, to: Vec3): void =>
        emit({ shape: 'beam', kind, finish: 'roofEdge', from, to, thickness: t, rich: false });
      for (const sign of [-1, 1]) {
        beam('roof-edge', at(origin, yaw, sign * piece.sx / 2, 0.025, -piece.sz / 2),
          at(origin, yaw, sign * piece.sx / 2, 0.025, piece.sz / 2));
        for (const end of [-1, 1]) beam('roof-edge',
          at(origin, yaw, sign * piece.sx / 2, 0.025, end * piece.sz / 2),
          at(origin, yaw, 0, piece.sy + 0.025, end * piece.sz / 2));
      }
      beam('ridge', at(origin, yaw, 0, piece.sy + 0.03, -piece.sz / 2),
        at(origin, yaw, 0, piece.sy + 0.03, piece.sz / 2));
    }
    if (station && streetFaceYaw !== undefined && station.distance < 90) {
      const side = Math.abs(Math.sin(streetFaceYaw - building.rotationY)) > 0.5;
      const faceWidth = side ? size.z : size.x, faceDepth = side ? size.x : size.z;
      const park = look !== undefined && !['commercial', 'residential', 'industrial'].includes(look);
      const width = look === 'residential' || park ? Math.min(4.2, faceWidth * 0.3) : Math.min(2.8, faceWidth * 0.2);
      const depth = look === 'residential' || park ? 1.7 : 1.0;
      for (const sign of [-1, 1]) {
        const origin = at(building.position, streetFaceYaw, sign * faceWidth * 0.30, 0,
          faceDepth / 2 + depth / 2 + 0.70);
        const planted = parcel(plan, sampler, context, origin, streetFaceYaw, width, depth, 73 + propIndex);
        if (planted) { parcels.push(planted); parts.push(...planted.roots); }
      }
    }
    // Complete new shells own the visible architecture for selected source
    // props. Keep only original ground-cover/parcels there, not old plates,
    // baked-band relief or duplicate roof trim. Unselected landmarks keep all.
    const installedParts = replacedPropIndices.has(propIndex) ? parts.filter(part => part.shape === 'cover') : parts;
    if (installedParts.length) sites.push({ id: `district-exterior/${propIndex}`, propIndex, building, body, look,
      ...(station ? { streetSegmentId: station.segmentId } : {}),
      ...(streetFaceYaw === undefined ? {} : { streetFaceYaw }), parts: installedParts, parcels });
  }
  return sites;
}
