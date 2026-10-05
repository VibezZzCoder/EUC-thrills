/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { composeBuilding } from '../data/buildingLooks.ts';
import { scopedDistrictSites } from './scopedSiteQueries.ts';
import { residentialDoorOffset, RESIDENTIAL_SITE_RULES, PARK_SITE_RULES,
  type DistrictSite, type ResidentialRoomSite, type ParkCaseSite } from '../level/districtSites.ts';
import type { LevelPlan } from '../level/plan.ts';
import { decorShapes, DecorShape, countDecorDraws, type DecorDrawPlan,
  type DecorAllocationPrice, decorSupplementPrice, type DecorSupplementPrice } from './decorShapePlan.ts';

export type DistrictFinish = 'masonry' | 'timber' | 'paint' | 'steel' | 'glazing';
type Finish = DistrictFinish;
export const DISTRICT_FINISH_ORDER: readonly Finish[] = ['masonry', 'timber', 'paint', 'steel', 'glazing'];
const MAP_SEGMENT_LIMIT = 128;

export interface DistrictSitePieces {
  readonly site: DistrictSite;
  readonly batches: Readonly<Record<Finish, readonly DecorShape[]>>;
}
export interface DistrictDecorPieces {
  readonly sites: readonly DistrictSite[];
  readonly sitePieces: readonly DistrictSitePieces[];
  readonly mapRouteSegments: number;
  readonly mapSourceSegments: number;
  readonly price: DecorAllocationPrice;
}

interface SiteBuilder {
  box(x: number, y: number, z: number, width: number, height: number,
    depth: number, tone: number, finish?: Finish): void;
  shape(geometry: DecorShape, x: number, y: number, z: number,
    tone: number, finish: Finish, rotation?: THREE.Quaternion): void;
}

/** Localized domestic shell. Its 6 m opening keeps the rest of the original
 * house face, roof and collider. The closed door and narrow ground strip share
 * residentialDoorOffset; neither the sofa nor the fixed window is an entry. */
function domesticRoom(site: ResidentialRoomSite, add: SiteBuilder): void {
  const body = composeBuilding({ ...site.building, look: 'residential' })[0];
  const wall = new THREE.Color(body.tone).multiplyScalar(body.jitter).getHex();
  const { box, shape } = add;
  const width = site.roomWidth, depth = site.roomDepth;
  const door = residentialDoorOffset(site);
  // 4 cm of overlap behind the localized mask closes its +2 cm side tolerance.
  // All front faces stay at least 4 cm inward of the exact original OBB face.
  const coverageWidth = width + RESIDENTIAL_SITE_RULES.mountWidthPadding;
  const shellTop = site.height + RESIDENTIAL_SITE_RULES.mountTopPadding;
  const floorTop = RESIDENTIAL_SITE_RULES.maximumFloorVariation + RESIDENTIAL_SITE_RULES.floorClearance;
  const furnishingLift = floorTop - 0.11;
  box(0, floorTop / 2, -(depth + 0.04) / 2, coverageWidth, floorTop, depth - 0.04, 0x988e77);
  box(0, shellTop - 0.07, -(depth + 0.04) / 2, coverageWidth, 0.14, depth - 0.04, 0xa9a18b);
  box(0, shellTop / 2, -depth + 0.05, coverageWidth, shellTop, 0.10, 0xa9a18b);
  for (const sign of [-1, 1]) {
    box(sign * (width / 2 + RESIDENTIAL_SITE_RULES.mountWidthPadding / 2 - 0.07),
      shellTop / 2, -(depth + 0.04) / 2, 0.14, shellTop, depth - 0.04, wall);
  }
  // The host's own warm wall tone carries the retained face into the recess.
  // These spans meet edge to edge, avoiding coplanar overlapping face plates.
  box(-2.87, 1.27, -0.17, 0.34, 2.54, 0.26, wall);
  box(-1.00, 1.27, -0.17, 0.60, 2.54, 0.26, wall);
  box(2.57, 1.27, -0.17, 0.94, 2.54, 0.26, wall);
  box(0, (2.54 + shellTop) / 2, -0.17, coverageWidth, shellTop - 2.54, 0.26, wall);
  box(0.70, 0.44, -0.17, 2.80, 0.88, 0.26, wall);
  box(door, 2.42, -0.17, 1.40, 0.24, 0.26, wall);

  // A normal-height closed domestic leaf. Trim and returns have distinct front
  // planes; corner members meet edge-to-edge rather than overlapping.
  for (const side of [-1, 1]) {
    box(door + side * 0.62, 1.17, -0.53, 0.16, 2.10, 0.82, wall);
    box(door + side * 0.62, 1.17, -0.08, 0.12, 2.10, 0.08, 0x65756b, 'timber');
  }
  box(door, 2.24, -0.53, 1.40, 0.12, 0.82, wall);
  box(door, 2.28, -0.08, 1.40, 0.08, 0.08, 0x65756b, 'timber');
  box(door, 0.11, -0.49, 1.08, 0.22, 0.90, 0xb0b3a1);
  box(door, 1.15, -0.86, 1.08, 2.10, 0.10, 0x65756b, 'timber');
  for (const y of [0.65, 1.65]) box(door, y, -0.798, 0.76, 0.66, 0.024, 0x7e8068, 'paint');
  shape(decorShapes.cylinder(0.044, 0.044, 0.06, 8),
    door + 0.36, 1.10, -0.761, 0xbac5b4, 'steel',
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

  // Raised domestic sill and smaller fixed picture window. The warm timber
  // grouping frames the home; furniture remains a close-inspection reward.
  for (const x of [-0.63, 2.03]) {
    box(x, 1.71, -0.56, 0.14, 1.42, 0.88, wall);
    box(x, 1.71, -0.08, 0.14, 1.42, 0.08, 0x876043, 'timber');
  }
  for (const y of [0.94, 2.48]) {
    box(0.70, y, -0.56, 2.80, 0.12, 0.88, wall);
    box(0.70, y, -0.08, 2.80, 0.12, 0.08, 0x876043, 'timber');
  }
  box(0.70, 1.71, -0.12, 0.070, 1.42, 0.12, 0x876043, 'timber');
  box(0.655, 1.60, -0.075, 0.035, 0.18, 0.024, 0xbac5b4, 'steel');
  for (const x of [-0.36, 1.76]) {
    box(x, 1.71, -0.43, 0.24, 1.30, 0.09, 0xc8af86, 'paint');
    for (const offset of [-0.07, 0, 0.07]) shape(decorShapes.cylinder(0.040, 0.040, 1.30, 6),
      x + offset, 1.71, -0.371, 0xc8af86, 'paint');
  }
  shape(decorShapes.cylinder(0.024, 0.024, 2.58, 6),
    0.70, 2.37, -0.46, 0x69796d, 'steel',
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));

  // An adult-scale two-seat sofa faces the window. Its seat is supported by
  // four planted legs, and the table occupies the clear area in front of it.
  box(0.70, 0.118 + furnishingLift, -2.06, 2.70, 0.016, 1.46, 0x8d948a, 'paint');
  for (const x of [-0.12, 1.52]) for (const z of [-2.47, -1.82])
    box(x, 0.24 + furnishingLift, z, 0.09, 0.27, 0.09, 0x62482f, 'timber');
  box(0.70, 0.475 + furnishingLift, -2.14, 2.20, 0.28, 0.95, 0x71806a, 'paint');
  box(0.70, 0.88 + furnishingLift, -2.57, 2.20, 0.92, 0.18, 0x71806a, 'paint');
  for (const x of [-0.30, 1.70]) box(x, 0.69 + furnishingLift, -2.12, 0.20, 0.66, 0.94, 0x71806a, 'paint');
  for (const x of [0.17, 1.23]) {
    box(x, 0.675 + furnishingLift, -2.08, 0.99, 0.16, 0.78, 0x94a08b, 'paint');
    box(x, 0.99 + furnishingLift, -2.34, 0.46, 0.44, 0.19, 0xb6b996, 'paint');
  }
  box(0.70, 0.49 + furnishingLift, -1.19, 0.86, 0.08, 0.46, 0x987249, 'timber');
  for (const x of [0.35, 1.05]) for (const z of [-1.35, -1.03])
    box(x, 0.28 + furnishingLift, z, 0.045, 0.34, 0.045, 0x62482f, 'timber');

  // A useful shelf is separated laterally from the sofa and the plant. Its
  // front-facing books remain substantial enough to read as books, not noise.
  for (const y of [1.54, 2.02]) {
    box(2.40, y, -2.93, 0.88, 0.065, 0.32, 0x987249, 'timber');
    for (let book = 0; book < 5; book++) {
      box(2.08 + book * 0.145, y + 0.18, -2.925, 0.105,
        book % 2 ? 0.29 : 0.34, 0.20, book % 2 ? 0x71806a : 0x967b52, 'paint');
    }
  }
  for (const x of [2.08, 2.72]) box(x, 1.50, -3.075, 0.055, 1.24, 0.070, 0x62482f, 'timber');
  shape(decorShapes.cylinder(0.21, 0.155, 0.39, 10),
    2.16, 0.305 + furnishingLift, -1.45, 0x997358, 'paint');
  shape(decorShapes.cylinder(0.022, 0.030, 0.89, 6),
    2.16, 0.915 + furnishingLift, -1.45, 0x737954, 'timber');
  for (const [dx, y, dz, radius] of [[-0.13, 1.08, 0.015, 0.19],
    [0.12, 1.23, -0.07, 0.20], [-0.045, 1.44, 0.015, 0.17]] as const) {
    shape(decorShapes.icosahedron(radius, 0),
      2.16 + dx, y + furnishingLift, -1.45 + dz, 0x78865c, 'paint');
  }
}

/** Project original street endpoints into a coarse, unlabelled route schematic.
 * The display is presentation only; it never queries or supplies ride ground. */
function parkCase(plan: LevelPlan, site: ParkCaseSite, add: SiteBuilder): {
  readonly source: number; readonly drawn: number;
} {
  const { box, shape } = add;
  const width = site.caseWidth, height = site.height, depth = site.caseDepth;
  const body = composeBuilding({ ...site.building, look: 'clockTower' })[0];
  const wall = new THREE.Color(body.tone).multiplyScalar(body.jitter).getHex();
  // Host-coloured mounting returns cover the existing hook's +2 cm lateral
  // and −5 cm bottom mask tolerances. The case itself retains its 3.2×2.1 size.
  // Their 4 cm inset and full backing make the mask a recess, never a plate
  // applied to the exterior. No shaft body or upper clock stage is replaced.
  const coveredWidth = width + PARK_SITE_RULES.mountWidthPadding;
  const coveredHeight = height + 2 * PARK_SITE_RULES.mountVerticalPadding;
  box(0, height / 2, -depth + 0.05, coveredWidth, coveredHeight, 0.10, wall);
  for (const sign of [-1, 1]) {
    box(sign * (coveredWidth / 2 - 0.03), height / 2, -(depth + 0.04) / 2,
      0.06, coveredHeight, depth - 0.04, wall);
  }
  for (const y of [-PARK_SITE_RULES.mountVerticalPadding / 2,
    height + PARK_SITE_RULES.mountVerticalPadding / 2]) {
    box(0, y, -(depth + 0.04) / 2, coveredWidth,
      PARK_SITE_RULES.mountVerticalPadding, depth - 0.04, wall);
  }
  // A pedestrian-scale locked cabinet, with lighter inset returns, a deeper
  // diagram, continuous steel leaf, visible hinges and a closed glazed face.
  const rim = 0.16;
  box(0, height / 2, -depth + 0.15, width - 2 * rim, height - 2 * rim, 0.035, 0xd9c6a1, 'paint');
  for (const sign of [-1, 1]) {
    box(sign * (width / 2 - rim / 2), height / 2, -0.30, rim, height, 0.52, 0x87968b, 'steel');
    box(sign * (width / 2 - rim - 0.045), height / 2, -0.33, 0.09, height - 2 * rim, 0.38, 0xb1ac94);
  }
  for (const y of [rim / 2, height - rim / 2]) box(0, y, -0.30,
    width - 2 * rim, rim, 0.52, 0x87968b, 'steel');
  for (const y of [rim + 0.045, height - rim - 0.045]) box(0, y, -0.33,
    width - 2 * rim - 0.18, 0.09, 0.38, 0xb1ac94);
  shape(decorShapes.plane(width - 2 * rim, height - 2 * rim),
    0, height / 2, -0.135, 0xc5d9d9, 'glazing');
  for (const y of [height * 0.27, height * 0.73]) box(-width / 2 + rim / 2, y,
    -0.067, 0.07, 0.15, 0.046, 0xc4cbbd, 'steel');
  box(width / 2 - rim / 2, height / 2, -0.070, 0.075, 0.20, 0.04, 0xc4cbbd, 'steel');
  box(width / 2 - rim / 2, height / 2, -0.046, 0.018, 0.09, 0.012, 0x46564d, 'steel');

  const finitePoint = (point: { x: number; z: number }): boolean => Number.isFinite(point.x) && Number.isFinite(point.z);
  const streets = plan.segments.filter(segment => {
    const a = segment.entry.position, b = segment.exit.position;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return finitePoint(a) && finitePoint(b) && Number.isFinite(length) && length > 0;
  });
  if (streets.length === 0) return { source: 0, drawn: 0 };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const street of streets) for (const point of [street.entry.position, street.exit.position]) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  if (!Number.isFinite(spanX) || !Number.isFinite(spanZ)) return { source: streets.length, drawn: 0 };
  const scale = Math.min((width - 0.54) / Math.max(spanX, 1),
    (height - 0.62) / Math.max(spanZ, 1));
  const centreX = minX + spanX / 2, centreZ = minZ + spanZ / 2;
  const project = (point: { x: number; z: number }): THREE.Vector3 => new THREE.Vector3(
    (point.x - centreX) * scale,
    height / 2 - (point.z - centreZ) * scale, -0.414);
  // The bounded display keeps only actual original endpoint chords. Main loop
  // ids outrank alternate ids, then nearby original chords; an omission never
  // joins disconnected endpoints or rescales the selected subset to fill space.
  const main = new Set((plan.streetLoops ?? []).flatMap(loop => [...loop.main]));
  const alternate = new Set((plan.streetLoops ?? []).flatMap(loop => [...loop.alternate]));
  const distanceToStation = (street: typeof streets[number]): number => {
    const a = street.entry.position, b = street.exit.position;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
    const along = Math.max(0, Math.min(length,
      (site.street.x - a.x) * nx + (site.street.z - a.z) * nz));
    return Math.hypot(site.street.x - a.x - nx * along,
      site.street.z - a.z - nz * along);
  };
  const selected = streets.map((street, order) => ({ street, order,
    rank: main.has(street.id) ? 0 : alternate.has(street.id) ? 1 : 2,
    distance: distanceToStation(street) }))
    .sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.order - b.order)
    .slice(0, MAP_SEGMENT_LIMIT).sort((a, b) => a.order - b.order);
  const axis = new THREE.Vector3(0, 1, 0);
  let lines = 0;
  for (const { street } of selected) {
    const start = project(street.entry.position), end = project(street.exit.position);
    const direction = end.clone().sub(start), length = direction.length();
    if (!Number.isFinite(length) || length <= 0) continue;
    const centre = start.add(end).multiplyScalar(0.5);
    shape(decorShapes.cylinder(0.022, 0.022, length, 6),
      centre.x, centre.y, centre.z, 0x69796d, 'paint',
      new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize()));
    lines++;
  }
  // A single position marker and a compass arrow distinguish the map from a
  // random ornamental pattern. Coordinates are source plan coordinates.
  if (finitePoint(plan.spawn.position)) {
    const point = project(plan.spawn.position);
    if (Math.abs(point.x) <= (width - 0.40) / 2
      && Math.abs(point.y - height / 2) <= (height - 0.40) / 2) {
      shape(decorShapes.cylinder(0.045, 0.045, 0.012, 10),
        point.x, point.y, -0.384, 0x914e3d, 'paint',
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    }
  }
  box(width / 2 - 0.28, height - 0.35, -0.414, 0.025, 0.20, 0.025, 0x69796d, 'paint');
  shape(decorShapes.cone(0.064, 0.11, 3),
    width / 2 - 0.28, height - 0.195, -0.414, 0x69796d, 'paint');
  return { source: streets.length, drawn: lines };
}

/** Existing selectors and domestic/map emission without geometry, materials,
 * textures or GPU allocation. Three math preserves the original map rotations. */
export function collectDistrictDecorPieces(plan: LevelPlan): DistrictDecorPieces {
  const sites = scopedDistrictSites(plan);
  const sitePieces: DistrictSitePieces[] = [];
  const draws: DecorDrawPlan[] = [];
  let mapRouteSegments = 0, mapSourceSegments = 0;
  for (const [siteIndex, site] of sites.entries()) {
    const batches: Record<Finish, DecorShape[]> = { masonry: [], timber: [], paint: [], steel: [], glazing: [] };
    const shape: SiteBuilder['shape'] = (geometry, x, y, z, tone, finish, rotation) => {
      if (rotation) geometry.applyQuaternion(rotation);
      geometry.translate(x, y, z);
      geometry.deleteAttribute('uv');
      geometry.ensureIndex().setColour(tone);
      batches[finish].push(geometry);
    };
    const builder: SiteBuilder = { shape, box: (x, y, z, width, height, depth, tone, finish = 'masonry') =>
      shape(decorShapes.box(width, height, depth), x, y, z, tone, finish) };
    if (site.kind === 'residential-domestic-room') domesticRoom(site, builder);
    else {
      const map = parkCase(plan, site, builder);
      mapRouteSegments += map.drawn;
      mapSourceSegments += map.source;
    }
    for (const finish of DISTRICT_FINISH_ORDER) {
      if (batches[finish].length) draws.push({ key: `district-${siteIndex}-${finish}`,
        materialKey: `district-${finish}`, pieces: batches[finish] });
    }
    sitePieces.push({ site, batches });
  }
  return { sites, sitePieces, mapRouteSegments, mapSourceSegments, price: countDecorDraws(draws) };
}

export function countDistrictDecor(plan: LevelPlan,
  pieces: DistrictDecorPieces = collectDistrictDecorPieces(plan)): DecorSupplementPrice {
  return decorSupplementPrice(pieces.price);
}
