/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { environmentSites, industrialPersonnelDoorOffset, type IndustrialBaySite } from '../level/environmentSites.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { composeBuilding } from '../data/buildingLooks.ts';
import { DEPOT_SIGN } from '../data/environment.ts';
import { PROTECTED_ACTIVITY } from '../data/tuning.ts';
import type { EnvironmentObject } from './environmentDecor.ts';
import { decorShapes, DecorShape, countDecorDraws, type DecorDrawPlan,
  type DecorTexturePlan, type DecorAllocationPrice, decorSupplementPrice,
  type DecorSupplementPrice } from './decorShapePlan.ts';

export type EnvironmentFinish = 'masonry' | 'timber' | 'paint' | 'steel' | 'rubber' | 'glass';
type Finish = EnvironmentFinish;
export interface EnvironmentSitePieces {
  readonly site: IndustrialBaySite;
  readonly batches: Readonly<Record<Finish, readonly DecorShape[]>>;
  readonly signPieces: readonly DecorShape[];
  readonly fanPieces: readonly DecorShape[];
  readonly mount: readonly number[];
}
export interface EnvironmentDecorPieces {
  readonly sites: readonly IndustrialBaySite[];
  readonly objects: readonly EnvironmentObject[];
  readonly sitePieces: readonly EnvironmentSitePieces[];
  readonly price: DecorAllocationPrice;
}

/** Existing selector and emissions; only Three math objects are allocated here.
 * Every finished site keeps its existing separate batches and sign texture. */
export function collectEnvironmentDecorPieces(plan: LevelPlan): EnvironmentDecorPieces {
  const sites = environmentSites(plan);
  const objects: EnvironmentObject[] = [];
  const sitePieces: EnvironmentSitePieces[] = [];
  const draws: DecorDrawPlan[] = [];
  const textures: DecorTexturePlan[] = [];
  const worldPoint = (site: IndustrialBaySite, x: number, y: number, z: number): Vec3 => ({
    x: site.position.x + Math.cos(site.yaw) * x + Math.sin(site.yaw) * z,
    y: site.position.y + y,
    z: site.position.z - Math.sin(site.yaw) * x + Math.cos(site.yaw) * z,
  });
  for (const [siteIndex, site] of sites.entries()) {
    const batches: Record<Finish, DecorShape[]> = {
      masonry: [], timber: [], paint: [], steel: [], rubber: [], glass: [],
    };
    const world = new THREE.Matrix4().makeRotationY(site.yaw)
      .setPosition(site.position.x, site.position.y, site.position.z);
    const partTransform = new THREE.Matrix4();
    const add = (geometry: DecorShape, x: number, y: number, z: number,
      tone: number, finish: Finish, rotate?: THREE.Quaternion): void => {
      if (rotate) geometry.applyQuaternion(rotate);
      geometry.translate(x, y, z).applyMatrix4(partTransform).applyMatrix4(world);
      // All primitives use the same bounded attributes before merging. An
      // extruded cab is non-indexed by default; give it an explicit triangle
      // index so it shares one batch with indexed boxes and wheel cylinders.
      geometry.deleteAttribute('uv');
      geometry.ensureIndex().setColour(tone);
      batches[finish].push(geometry);
    };
    const box = (x: number, y: number, z: number, width: number, height: number,
      depth: number, tone: number, finish: Finish = 'masonry'): void =>
      add(decorShapes.box(width, height, depth), x, y, z, tone, finish);
    const line = (a: Vec3, b: Vec3, radius: number, tone: number, finish: Finish = 'steel'): void => {
      const start = new THREE.Vector3(a.x, a.y, a.z), end = new THREE.Vector3(b.x, b.y, b.z);
      const direction = end.clone().sub(start);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      const centre = start.add(end).multiplyScalar(0.5);
      add(decorShapes.cylinder(radius, radius, direction.length(), 6), centre.x, centre.y,
        centre.z, tone, finish, rotation);
    };
    const quad = (vertices: readonly Vec3[], tone: number, finish: Finish): void => {
      const geometry = decorShapes.quad(vertices);
      add(geometry, 0, 0, 0, tone, finish);
    };
    const record = (kind: EnvironmentObject['kind'], x: number, y: number, z: number,
      sx: number, sy: number, sz: number, localYaw = 0): void => {
      objects.push({ kind, position: worldPoint(site, x, y, z), size: { x: sx, y: sy, z: sz }, yaw: site.yaw + localYaw });
    };

    const width = site.roomWidth, depth = site.roomDepth;
    const sideBand = (site.faceWidth - width) / 2;
    const host = composeBuilding({ ...site.building, look: 'industrial' })[0];
    const hostTone = new THREE.Color(host.tone).multiplyScalar(host.jitter);
    const wallTone = hostTone.clone().multiplyScalar(0.91).getHex();
    const seamTone = hostTone.clone().multiplyScalar(0.65).getHex();
    // The lower storey continues the actual host palette. Deep end returns,
    // structural piers and an inset portal replace a thin pale applied panel.
    // Front faces are deliberately separated: intersecting coplanar boxes
    // previously produced the striped teeth along jambs and the base.
    for (const sign of [-1, 1]) {
      box(sign * (width / 2 + sideBand / 2), 1.60, -0.355, sideBand, 3.20, 0.65, wallTone);
      box(sign * (site.faceWidth / 2 - 0.125), 2.15, -0.65, 0.24, 4.30, 1.20, wallTone);
      box(sign * (width / 2 - 0.14), 1.62, -3.16, 0.28, 3.24, depth - 0.32, 0x6f7d6c);
      box(sign * (width / 2 - 0.22), 1.52, -0.60, 0.44, 3.04, 1.16, 0x839080);
      box(sign * (width / 2 - 0.22), 1.52, -0.068, 0.32, 3.04, 0.11, 0x98a28e);
    }
    box(0, 3.75, -0.36, site.faceWidth, 1.10, 0.66, wallTone);
    // Bridge the colour-opening boundary with a solid cap, rather than end an
    // inset strip exactly on it. The old 4.3 m top left a dotted hairline from
    // oblique views. This cap overlaps the retained upper wall vertically and
    // has a decisive front face and return, entirely above rider height.
    box(0, 4.26, -0.04, site.faceWidth, 0.22, 0.18, seamTone);
    box(0, 3.35, -0.355, width + 0.28, 0.34, 0.70, 0x7a8778);
    box(0, 3.24, -depth / 2, width, 0.16, depth, 0x899185);
    box(0, 1.61, -depth + 0.05, width, 3.22, 0.10, 0x566752);
    box(0, 0.03, -depth / 2, width, 0.06, depth, 0x929489);
    box(0, 0.14, -0.105, site.faceWidth, 0.28, 0.20, 0x5f705f);
    // A quiet floor grid and receding roof structure make the six-metre room
    // visible without painting tiny noise or adding a new lighting system.
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 8; column++) {
        box(-width / 2 + (column + 0.5) * width / 8, 0.066, -(row + 0.5) * depth / 5,
          width / 8 - 0.035, 0.012, depth / 5 - 0.035,
          new THREE.Color((row + column) % 2 ? 0x999d90 : 0x8d948a).multiplyScalar(1 - row * 0.065).getHex());
      }
    }
    for (const z of [-0.70, -2.6, -4.7]) box(0, 3.08, z, width - 0.3, 0.16, 0.16, 0x64746b, 'steel');

    const doorX = industrialPersonnelDoorOffset(site);
    // A closed two-leaf service gate: solid lower kickplates, diagonal
    // bracing and a central latch distinguish stored equipment from a retail
    // display. Every low part remains behind the original facade plane.
    const gateLeft = -width / 2 + 0.35, gateRight = doorX - 0.86;
    const gateCentre = (gateLeft + gateRight) / 2, gateWidth = gateRight - gateLeft;
    for (const x of [gateLeft, gateCentre - 0.09, gateCentre + 0.09, gateRight])
      box(x, 1.62, -0.19, 0.14, 2.82, 0.22, Math.abs(x - gateCentre) < 0.2 ? 0x819080 : 0x44594f, 'steel');
    for (const y of [0.25, 0.65, 3.00])
      box(gateCentre, y, -0.19, gateWidth + 0.14, 0.14, 0.22, 0x44594f, 'steel');
    for (const side of [-1, 1]) {
      const leafCentre = gateCentre + side * gateWidth / 4;
      box(leafCentre, 0.46, -0.31, gateWidth / 2 - 0.20, 0.36, 0.14, 0x647365, 'steel');
      box(leafCentre, 1.93, -0.20, gateWidth / 2 - 0.20, 0.10, 0.16, 0x53695b, 'steel');
      // Open upper sections keep the depot's operational contents legible;
      // the sparse uprights belong to a gate rather than a glazing grid.
      const pickets = Math.floor((gateWidth / 2 - 0.30) / 1.10);
      for (let index = 1; index <= pickets; index++)
        box(gateCentre + side * (0.16 + index * (gateWidth / 2 - 0.32) / (pickets + 1)),
          1.84, -0.27, 0.06, 2.18, 0.10, 0x6b7b6c, 'steel');
      const a = new THREE.Vector3(gateCentre + side * (gateWidth / 2 - 0.16), 0.36, 0);
      const b = new THREE.Vector3(gateCentre + side * 0.16, 2.88, 0);
      const direction = b.clone().sub(a), centre = a.add(b).multiplyScalar(0.5);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      add(decorShapes.box(0.13, direction.length(), 0.15), centre.x, centre.y,
        -0.155, 0x6f7f6a, 'steel', rotation);
      for (const y of [0.76, 2.43])
        box(gateCentre + side * (gateWidth / 2 + 0.01), y, -0.20, 0.25, 0.22, 0.24, 0x566b5d, 'steel');
    }
    box(gateCentre, 1.71, -0.15, 0.48, 0.10, 0.16, 0xbdc1a5, 'steel');
    box(gateCentre + 0.11, 1.62, -0.095, 0.075, 0.17, 0.10, 0x485d51, 'steel');
    // The single projecting lip is above 3 m; everything at rider height
    // remains behind the original facade plane and inside its solid footprint.
    box(-0.74, 3.16, 0.02, width - 1.5, 0.16, 0.08, 0x6e7b70, 'steel');
    for (const x of [doorX - 0.67, doorX + 0.67]) box(x, 1.37, -0.615, 0.15, 2.64, 1.09, 0xa2a997);
    box(doorX, 2.74, -0.615, 1.49, 0.16, 1.09, 0xa2a997);
    box(doorX, 0.12, -0.60, 1.45, 0.20, 1.12, 0xb0b3a1);
    box(doorX, 1.44, -1.10, 1.20, 2.44, 0.12, 0x65756b, 'paint');
    for (const x of [doorX - 0.62, doorX + 0.62]) box(x, 1.44, -1.015, 0.085, 2.56, 0.06, 0x394f47, 'steel');
    box(doorX, 2.69, -1.015, 1.32, 0.09, 0.06, 0x394f47, 'steel');
    box(doorX, 1.91, -1.026, 0.75, 0.79, 0.02, 0x46626a, 'glass');
    box(doorX - 0.38, 1.11, -0.975, 0.075, 0.28, 0.07, 0xd2ceb0, 'steel');
    // Coarse sheet joints avoid a field of subpixel corrugation.
    for (const x of [-width * 0.30, 0, width * 0.30]) box(x, 3.78, -0.04, 0.075, 0.72, 0.06, seamTone, 'steel');

    // A lane-facing identifier communicates the service bay before its inset
    // contents can be parsed. Both approaches see a real mounted steel blade;
    // its whole projecting volume stays above the existing canopy envelope.
    const bladeX = width * 0.46, bladeY = DEPOT_SIGN.bottom + DEPOT_SIGN.height / 2;
    box(bladeX, bladeY, DEPOT_SIGN.projection / 2, 0.15,
      DEPOT_SIGN.height + 0.04, DEPOT_SIGN.width + 0.04, 0x58675d, 'steel');
    box(bladeX, 4.22, 0.68, 0.09, 0.10, 1.48, 0x58675d, 'steel');
    const signPieces: DecorShape[] = [];
    for (const direction of [-1, 1]) {
      const face = decorShapes.plane(DEPOT_SIGN.width, DEPOT_SIGN.height);
      face.rotateY(direction * Math.PI / 2);
      face.translate(bladeX + direction * 0.081, bladeY, DEPOT_SIGN.projection / 2);
      face.applyMatrix4(world);
      signPieces.push(face);
    }
    const prefix = `industrial-${siteIndex}`;
    draws.push({ key: `${prefix}-sign`, materialKey: `${prefix}-sign`, pieces: signPieces });
    textures.push({ key: `${prefix}-sign`, width: DEPOT_SIGN.atlasWidth,
      height: DEPOT_SIGN.atlasHeight, mipmaps: true });

    // A modest 1.9 m wide delivery van: a cargo body, sloped cab, true wheel
    // volumes, opaque windows, bumpers and door hardware rather than a crate.
    // Align the closed bay's parked vehicle with its bounded service apron;
    // the original lamp remains beside that approach rather than in its lane.
    const vanX = 0.90, cabZ = -1.61;
    const wheelRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    box(vanX, 0.64, -3.10, 1.82, 0.22, 4.62, 0x4d5a55, 'steel');
    box(vanX, 1.69, -3.75, 1.92, 1.82, 3.1, 0xb8beb3, 'paint');
    box(vanX, 2.62, -3.74, 1.88, 0.08, 3.05, 0xc5cabc, 'paint');
    box(vanX, 1.12, -1.40, 1.83, 0.52, 1.43, 0xb8beb3, 'paint');
    // Shape X becomes -Z after the quarter turn; extrusion becomes width X.
    const cab = [[-0.83, 0.87], [-0.83, 1.28], [-0.38, 1.48], [-0.10, 2.46], [0.80, 2.46], [0.80, 0.87]];
    const cabGeometry = decorShapes.depotCab(cab, 1.87);
    cabGeometry.rotateY(Math.PI / 2).translate(-1.87 / 2, 0, 0);
    add(cabGeometry, vanX, 0, cabZ, 0xb8beb3, 'paint');
    quad([
      { x: vanX - 0.79, y: 1.53, z: cabZ + 0.388 }, { x: vanX + 0.79, y: 1.53, z: cabZ + 0.388 },
      { x: vanX + 0.79, y: 2.32, z: cabZ + 0.163 }, { x: vanX - 0.79, y: 2.32, z: cabZ + 0.163 },
    ], 0x43636a, 'glass');
    for (const side of [-1, 1]) {
      const x = vanX + side * 0.946;
      const vertices = [
        { x, y: 1.55, z: cabZ - 0.66 }, { x, y: 1.55, z: cabZ + 0.20 },
        { x, y: 2.31, z: cabZ + 0.045 }, { x, y: 2.31, z: cabZ - 0.66 },
      ];
      quad(side < 0 ? vertices : [...vertices].reverse(), 0x466970, 'glass');
      box(vanX + side * 0.978, 1.50, -3.39, 0.032, 1.23, 2.30, side < 0 ? 0x929f94 : 0xb4bdad, 'paint');
      box(vanX + side * 0.982, 1.02, -3.72, 0.038, 0.29, 3.05, 0x66786d, 'paint');
      box(vanX + side * 1.003, 1.73, -2.42, 0.04, 0.055, 0.19, 0x626e66, 'steel');
      box(vanX + side * 1.015, 1.39, cabZ - 0.50, 0.04, 0.055, 0.16, 0x626e66, 'steel');
      box(vanX + side * 1.03, 1.74, cabZ + 0.26, 0.16, 0.18, 0.10, 0x62736c, 'steel');
      for (const z of [-1.33, -4.44]) {
        add(decorShapes.cylinder(0.34, 0.34, 0.18, 14), vanX + side * 1.0,
          0.412, z, 0x303b39, 'rubber', wheelRotation);
        add(decorShapes.cylinder(0.19, 0.19, 0.195, 10), vanX + side * 1.005,
          0.412, z, 0x9da89d, 'steel', wheelRotation);
        add(decorShapes.cylinder(0.055, 0.055, 0.203, 8), vanX + side * 1.007,
          0.412, z, 0x5e6e66, 'steel', wheelRotation);
      }
      box(vanX + side * 0.63, 1.19, -0.66, 0.33, 0.18, 0.03, 0xd0d0aa, 'glass');
    }
    box(vanX, 0.83, -0.63, 1.96, 0.16, 0.14, 0x52615a, 'rubber');
    box(vanX, 1.14, -0.644, 0.86, 0.22, 0.035, 0x5a6c61, 'steel');
    box(vanX, 0.84, -5.35, 1.94, 0.16, 0.10, 0x52615a, 'rubber');
    record('delivery-van', vanX, 1.36, -3.04, 2.22, 2.59, 4.83);

    // Two work bicycles in their own rack beside the van, outside its loading
    // lane. Their wheels, diamond frame and bars survive a gameplay-distance view.
    const rackX = width * 0.27, rackZ = -2.42;
    box(rackX, 0.13, rackZ, 1.30, 0.12, 1.43, 0x53675f, 'steel');
    for (const sign of [-1, 1]) {
      const x = rackX + sign * 0.50;
      line({ x, y: 0.17, z: rackZ - 0.56 }, { x, y: 0.63, z: rackZ - 0.56 }, 0.027, 0xa4afa0);
      line({ x, y: 0.63, z: rackZ - 0.56 }, { x, y: 0.63, z: rackZ + 0.56 }, 0.027, 0xa4afa0);
      line({ x, y: 0.63, z: rackZ + 0.56 }, { x, y: 0.17, z: rackZ + 0.56 }, 0.027, 0xa4afa0);
    }
    record('bicycle-rack', rackX, 0.39, rackZ, 1.34, 0.56, 1.46);
    const tyreRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (const [bike, x] of [rackX - 0.31, rackX + 0.31].entries()) {
      const tone = bike === 0 ? 0x8d6346 : 0x6e9190;
      partTransform.makeTranslation(x, 0, rackZ + (bike === 0 ? 0.25 : -0.22))
        .multiply(new THREE.Matrix4().makeRotationY(bike === 0 ? 0.56 : 0.38))
        .multiply(new THREE.Matrix4().makeTranslation(-x, 0, -rackZ));
      for (const z of [rackZ - 0.56, rackZ + 0.56]) {
        add(decorShapes.torus(0.30, 0.045, 6, 14), x, 0.417, z, 0x35423c, 'rubber', tyreRotation);
        add(decorShapes.torus(0.266, 0.015, 5, 14), x, 0.417, z, 0xabb7a6, 'steel', tyreRotation);
        for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
          const dy = Math.cos(angle) * 0.25, dz = Math.sin(angle) * 0.25;
          line({ x, y: 0.417 - dy, z: z - dz }, { x, y: 0.417 + dy, z: z + dz }, 0.007, 0x899b8b);
        }
        add(decorShapes.cylinder(0.036, 0.036, 0.14, 8), x, 0.417, z, 0x657a6c, 'steel', wheelRotation);
      }
      const rear = { x, y: 0.417, z: rackZ - 0.56 };
      const crank = { x, y: 0.52, z: rackZ - 0.09 };
      const saddle = { x, y: 0.97, z: rackZ - 0.21 };
      const head = { x, y: 0.98, z: rackZ + 0.33 };
      const fork = { x, y: 0.417, z: rackZ + 0.56 };
      for (const [a, b] of [[rear, crank], [rear, saddle], [saddle, crank],
        [saddle, head], [head, crank], [head, fork]] as const) line(a, b, 0.025, tone, 'paint');
      line(saddle, { x, y: 1.08, z: saddle.z }, 0.022, 0x9aa991);
      box(x, 1.10, saddle.z, 0.22, 0.06, 0.27, 0x38463d, 'rubber');
      line(head, { x, y: 1.12, z: head.z + 0.08 }, 0.021, 0x9aa991);
      line({ x: x - 0.22, y: 1.14, z: head.z + 0.10 },
        { x: x + 0.22, y: 1.14, z: head.z + 0.10 }, 0.023, 0x9aa991);
      box(x - 0.15, crank.y, crank.z, 0.17, 0.055, 0.11, 0x46554a, 'rubber');
      box(x + 0.15, crank.y, crank.z, 0.17, 0.055, 0.11, 0x46554a, 'rubber');
      record('bicycle', x, 0.65, rackZ + (bike === 0 ? 0.25 : -0.22), 0.47, 1.17, 1.81, bike === 0 ? 0.56 : 0.38);
      partTransform.identity();
    }

    // Low kickplates preserve the closed leaves while exposing the upper
    // wheel silhouettes. The bench is laterally clear of the stacked cargo.
    // Cargo has somewhere to go: slatted crate stacks on a pallet, rear tool
    // cupboards and an actual bench occupy separate front/work/rear layers.
    const crate = (x: number, y: number, z: number, wide: number, high: number, deep: number): void => {
      box(x, y, z, wide, high, deep, 0x8f7452, 'timber');
      for (const side of [-1, 1]) {
        for (const lane of [-0.28, 0, 0.28]) box(x + lane * wide, y, z + side * (deep / 2 + 0.018),
          0.075, high + 0.02, 0.035, 0xb09a6c, 'timber');
        box(x, y - high * 0.25, z + side * (deep / 2 + 0.042), wide, 0.07, 0.03, 0x6d664b, 'timber');
        box(x, y + high * 0.25, z + side * (deep / 2 + 0.042), wide, 0.07, 0.03, 0x6d664b, 'timber');
      }
    };
    const crateX = -width * 0.36, crateZ = -1.83;
    box(crateX, 0.145, crateZ, 1.58, 0.14, 1.26, 0x766342, 'timber');
    for (const x of [-0.58, 0, 0.58]) box(crateX + x, 0.245, crateZ, 0.14, 0.06, 1.26, 0x9e8860, 'timber');
    crate(crateX, 0.58, crateZ, 1.25, 0.61, 1.01);
    crate(crateX - 0.10, 1.20, crateZ - 0.05, 1.08, 0.58, 0.95);
    record('crate-stack', crateX, 0.82, crateZ, 1.58, 1.45, 1.26);
    for (const x of [-width * 0.37, width * 0.29]) {
      box(x, 1.06, -depth + 0.45, 1.85, 1.98, 0.64, 0x60786b, 'paint');
      for (const offset of [-0.45, 0.45]) {
        box(x + offset, 1.07, -depth + 0.78, 0.83, 1.84, 0.035, 0x718978, 'paint');
        box(x + offset - Math.sign(offset) * 0.29, 1.03, -depth + 0.807,
          0.042, 0.22, 0.035, 0xb4b9a1, 'steel');
      }
      record('storage', x, 1.06, -depth + 0.45, 1.85, 1.98, 0.74);
    }
    const benchX = -width * 0.22, benchZ = -3.60;
    box(benchX, 1.02, benchZ, 1.68, 0.10, 0.83, 0xb0a17f, 'timber');
    for (const x of [benchX - 0.64, benchX + 0.64]) for (const z of [benchZ - 0.30, benchZ + 0.30]) {
      box(x, 0.53, z, 0.07, 0.95, 0.07, 0x5d7465, 'steel');
    }
    box(benchX + 0.36, 1.19, benchZ, 0.47, 0.24, 0.35, 0x636e60, 'steel');
    box(benchX + 0.36, 1.35, benchZ, 0.27, 0.08, 0.32, 0x9ca58f, 'steel');
    line({ x: benchX + 0.55, y: 1.19, z: benchZ + 0.19 },
      { x: benchX + 0.55, y: 1.19, z: benchZ + 0.47 }, 0.018, 0x909c87);
    record('storage', benchX, 0.73, benchZ, 1.68, 1.36, 0.94);

    // A small ceiling-mounted fan belongs to the service room, forward of
    // the stored equipment, below the ceiling and clear of the gate brace.
    // Its fixed circular steel guard faces the room's closed gate.
    // Nothing moves outside the
    // protecting body, casts a new shadow, or invents a light/audio source.
    const fanX = width * PROTECTED_ACTIVITY.fanWidthShare;
    const fanY = PROTECTED_ACTIVITY.fanHeightMetres;
    const fanZ = -PROTECTED_ACTIVITY.fanFrontInsetMetres;
    for (const side of [-1, 1]) {
      box(fanX + side * 0.45, fanY, fanZ + 0.07, 0.055, 0.95, 0.13, 0xabb6a0, 'steel');
      box(fanX, fanY + side * 0.45, fanZ + 0.07, 0.95, 0.055, 0.13, 0xabb6a0, 'steel');
      box(fanX, fanY + side * 0.25, fanZ + 0.17, 0.80, 0.019, 0.035, 0x647969, 'steel');
    }
    for (const x of [-0.25, 0, 0.25])
      box(fanX + x, fanY, fanZ + 0.17, 0.019, 0.80, 0.035, 0x647969, 'steel');
    add(decorShapes.torus(0.405, 0.028, 6, 16),
      fanX, fanY, fanZ + 0.17, 0xc7cdb3, 'steel');
    for (const x of [-0.45, 0.45])
      box(fanX + x, 3.09, fanZ + 0.07, 0.035, 0.14, 0.10, 0x647969, 'steel');
    box(fanX, fanY, fanZ - 0.12, 0.22, 0.22, 0.20, 0x647969, 'steel');
    for (const finish of Object.keys(batches) as Finish[]) {
      if (batches[finish].length) draws.push({ key: `${prefix}-${finish}`,
        materialKey: `${prefix}-${finish}`, pieces: batches[finish] });
    }
    const fanPieces: DecorShape[] = [];
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const blade = decorShapes.box(0.16, 0.44, 0.035);
      blade.translate(0, 0.14, 0).rotateZ(angle).deleteAttribute('uv');
      fanPieces.push(blade);
    }
    const hub = decorShapes.cylinder(0.095, 0.095, 0.075, 6);
    hub.rotateX(Math.PI / 2).deleteAttribute('uv'); fanPieces.push(hub);
    if (!batches.paint.length) throw new Error('Protected fan needs its existing matte paint material owner');
    draws.push({ key: `${prefix}-fan`, materialKey: `${prefix}-paint`,
      pieces: fanPieces, colourAfterMerge: 0xe1d4a8 });
    const mount = world.clone().multiply(new THREE.Matrix4().makeTranslation(fanX, fanY, fanZ));
    sitePieces.push({ site, batches, signPieces, fanPieces, mount: [...mount.elements] });

  }
  return { sites, objects, sitePieces, price: countDecorDraws(draws, textures) };
}

export function countEnvironmentDecor(plan: LevelPlan,
  pieces: EnvironmentDecorPieces = collectEnvironmentDecorPieces(plan)): DecorSupplementPrice {
  return decorSupplementPrice(pieces.price);
}
