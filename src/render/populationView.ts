/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * World-owned outdoor population view. No renderer clock, simulation queries, options, assets,
 * texture allocations or new lights. One owner/instance serves every pane.
 */
import * as THREE from 'three';
import type { ActorKind, ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import { WHEEL } from '../data/tuning.ts';
import { loftGeometry, loftProfile, patchGeometry, mergeGeometries, shaded, type LoftRing } from './blockoutKit.ts';
import { createBlockoutEUC, type BlockoutEUC } from './euc.ts';
import { STANDARD_MACHINE_LOOK } from './machineLook.ts';
import { ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { POPULATION_MODEL, populationSupportTargets, type PopulationGroundSupport } from '../shared/populationSupport.ts';

/** Structurally compatible with simulation/population.ts. Values are fixed-step
 * facts; the renderer owns only their interpolation and anatomical expression. */
export interface PopulationRenderPose {
  readonly id: string;
  readonly kind: ActorKind;
  /** Feet / tyre contact origin, in metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** +Z forward; +X left. */
  readonly headingY: number;
  readonly speedMetresPerSecond: number;
  readonly gaitDistanceMetres: number;
  /** Signed accumulated wheel travel. Required for wheels which can reverse. */
  readonly wheelTravelMetres?: number;
  readonly activity: string;
  readonly activityPhase: number;
  readonly activityBlend: number;
  readonly backing: boolean;
  readonly groundNormalX?: number;
  readonly groundNormalY?: number;
  readonly groundNormalZ?: number;
  readonly footSupports?: readonly [PopulationGroundSupport, PopulationGroundSupport];
  readonly tyreSupports?: readonly [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport];
  /** Only a real authored seat may enable this pose. */
  readonly posture?: 'standing' | 'seated';
  readonly sittingBlend?: number;
  readonly seatHeightMetres?: number;
}

export interface PopulationRenderSnapshot {
  readonly tick: number;
  readonly clockSeconds: number;
  readonly actors: readonly PopulationRenderPose[];
}

export type PopulationFinish = 'cloth' | 'skin' | 'hair' | 'rubber' | 'paint' | 'metal' | 'glass' | 'lens';
export interface PopulationActorPaint {
  readonly skin: number;
  readonly hair: number;
  readonly jacket: number;
  readonly trousers: number;
  readonly shoes: number;
  readonly trim: number;
  readonly vehicle: number;
}
/** Root-owned look seam. This is a material/colour recipe, never GameOptions.
 * No callback receives a pose, clock, camera, quality or simulation reference. */
export interface PopulationPainter {
  actor(spec: ActorSpec): PopulationActorPaint;
  finish(kind: PopulationFinish): Readonly<{ roughness: number; metalness: number }>;
}

const PAINTS = Object.freeze([
  // Existing street-front / service-van colour vocabulary. Hexes are sRGB;
  // approximate linear luminance: skin .20–.39; cloth .09–.22; vans .21–.50.
  { skin: 0xb58b6d, hair: 0x6a594c, jacket: 0x315f57, trousers: 0x59616a, shoes: 0x535963, trim: 0xafb3aa, vehicle: 0xb8beb3 },
  { skin: 0xc0997b, hair: 0x63544b, jacket: 0x914e3d, trousers: 0x5e6670, shoes: 0x59606a, trim: 0xb6b996, vehicle: 0x72899a },
  { skin: 0x9b7865, hair: 0x635850, jacket: 0x354f65, trousers: 0x73766f, shoes: 0x5c6166, trim: 0xbcb39a, vehicle: 0x967b69 },
  { skin: 0xb78e75, hair: 0x857365, jacket: 0x85886c, trousers: 0x626973, shoes: 0x596068, trim: 0xb7bcb7, vehicle: 0x8b9b87 },
]);
const FINISHES: Readonly<Record<PopulationFinish, { roughness: number; metalness: number }>> = Object.freeze({
  cloth: { roughness: 0.92, metalness: 0 },
  skin: { roughness: 0.78, metalness: 0 },
  hair: { roughness: 0.86, metalness: 0 },
  rubber: { roughness: 0.96, metalness: 0 },
  paint: { roughness: 0.50, metalness: 0.05 },
  metal: { roughness: 0.47, metalness: 0.50 },
  // Opaque tinted windows, without transparency, reflections or extra passes.
  glass: { roughness: 0.24, metalness: 0.14 },
  lens: { roughness: 0.35, metalness: 0 },
});
export const DEFAULT_POPULATION_PAINTER: PopulationPainter = Object.freeze({
  actor(spec: ActorSpec): PopulationActorPaint {
    const paint = PAINTS[Math.abs(spec.appearanceIndex) % PAINTS.length]!;
    return spec.kind === 'worker'
      ? { ...paint, jacket: 0xafa574, trim: 0xc1b99b, trousers: 0x626b71 }
      : spec.kind === 'jogger'
        ? { ...paint, jacket: 0x728da0, trim: 0xb6bdbb }
        : paint;
  },
  finish(kind: PopulationFinish) { return FINISHES[kind]; },
});

export interface PopulationViewReport {
  readonly provenance: 'derived-from-built-topology';
  readonly actors: number;
  readonly humans: number;
  readonly fictionalEucs: number;
  readonly cargoVans: number;
  readonly passengerVans: number;
  /** Full-world submission cost per colour pass. No frustum discount. */
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly shadowDrawCalls: number;
  readonly shadowTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly textureBytes: 0;
  readonly geometryOwners: number;
  readonly materialOwners: number;
  readonly batches: number;
  readonly clockSeconds: number;
  readonly missingPoseIds: readonly string[];
  readonly missingGroundNormalIds: readonly string[];
  readonly missingWheelTravelIds: readonly string[];
  readonly missingSurfaceSupportIds: readonly string[];
  readonly disposed: boolean;
}

export interface PopulationView {
  readonly group: THREE.Group;
  /** Call once before the pane loop; no state advances here. */
  update(previous: PopulationRenderSnapshot, current: PopulationRenderSnapshot, alpha: number): void;
  /** An already interpolated snapshot has exactly the same presentation path. */
  apply(snapshot: PopulationRenderSnapshot): void;
  report(): PopulationViewReport;
  dispose(): void;
}

interface Batch {
  readonly id: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
  readonly casts: boolean;
  readonly colours: number[];
  mesh: THREE.InstancedMesh | null;
  dirty: boolean;
}
interface Slot { readonly batch: Batch; readonly index: number }
interface MachinePart { readonly slot: Slot; readonly matrix: THREE.Matrix4; readonly tyre: boolean }
interface Visual {
  readonly spec: ActorSpec;
  readonly parts: Record<string, Slot>;
  readonly machine: MachinePart[];
  readonly passenger: boolean;
  pose: MutablePose;
  pendingPose: MutablePose;
  visible: boolean;
}
type MutableGroundSupport = { -readonly [K in keyof PopulationGroundSupport]: PopulationGroundSupport[K] };
interface MutablePose {
  x: number; y: number; z: number; headingY: number; speed: number;
  gait: number; wheelTravel: number; phase: number; blend: number;
  normalX: number; normalY: number; normalZ: number;
  footSupports: MutableGroundSupport[];
  tyreSupports: MutableGroundSupport[];
  posture: 'standing' | 'seated'; sittingBlend: number; seatHeight: number | undefined;
  activity: string; backing: boolean;
}
const createMutablePose = (): MutablePose => ({
  x: 0, y: 0, z: 0, headingY: 0, speed: 0, gait: 0, wheelTravel: 0,
  phase: 0, blend: 0, normalX: 0, normalY: 1, normalZ: 0, activity: 'waiting', backing: false,
  footSupports: [], tyreSupports: [], posture: 'standing', sittingBlend: 0, seatHeight: undefined,
});
const POSE_SCALARS: readonly (keyof MutablePose)[] = ['x', 'y', 'z', 'headingY', 'speed', 'gait', 'wheelTravel',
  'phase', 'blend', 'normalX', 'normalY', 'normalZ', 'posture', 'sittingBlend', 'seatHeight', 'activity', 'backing'];
function sameSupports(a: readonly PopulationGroundSupport[], b: readonly PopulationGroundSupport[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const first = a[index], last = b[index];
    if (!Object.is(first.x, last.x) || !Object.is(first.y, last.y) || !Object.is(first.z, last.z)
      || !Object.is(first.normalX, last.normalX) || !Object.is(first.normalY, last.normalY)
      || !Object.is(first.normalZ, last.normalZ)) return false;
  }
  return true;
}
function samePose(a: MutablePose, b: MutablePose): boolean {
  for (const key of POSE_SCALARS) if (!Object.is(a[key], b[key])) return false;
  return sameSupports(a.footSupports, b.footSupports) && sameSupports(a.tyreSupports, b.tyreSupports);
}
const TAU = Math.PI * 2;
const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));
const fraction = (n: number): number => n - Math.floor(n);
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const vehicleKind = (kind: ActorKind): boolean => kind === 'parkedVehicle' || kind === 'serviceVehicle' || kind === 'trafficVehicle';

/** Closed, capped lofts. No zero-radius pole rows / duplicate pole triangles. */
function body(rings: readonly LoftRing[], radial = 14): THREE.BufferGeometry {
  return loftGeometry(loftProfile(rings), { radialSegments: radial, capBottom: true, capTop: true });
}
function limb(top: number, bottom: number, depth = 0.85): THREE.BufferGeometry {
  return body([
    { y: 0, halfWidth: top * 0.88, halfDepth: top * depth, square: 2.5 },
    { y: 0.08, halfWidth: top, halfDepth: top * depth, square: 2.5 },
    { y: 0.45, halfWidth: top * 0.94, halfDepth: top * depth * 0.95, square: 2.4 },
    { y: 0.93, halfWidth: bottom, halfDepth: bottom * depth, square: 2.4 },
    { y: 1, halfWidth: bottom * 0.90, halfDepth: bottom * depth, square: 2.4 },
  ], 12);
}

const CABIN = loftProfile([
  { y: 0.58, halfWidth: 0.90, halfDepth: 0.85, z: -0.10, square: 7 },
  { y: 0.64, halfWidth: 0.90, halfDepth: 0.82, z: -0.13, square: 7 },
  { y: 0.90, halfWidth: 0.86, halfDepth: 0.76, z: -0.18, square: 7 },
  { y: 1.00, halfWidth: 0.83, halfDepth: 0.74, z: -0.20, square: 7 },
]);
/** Existing kit builds a closed slab buried in its host surface. */
const cabinWindow = (u0: number, u1: number): THREE.BufferGeometry => patchGeometry(CABIN, {
  u0, u1, v0: 1.08, v1: 1.91, lift: 0.002, sink: -0.006,
  uSegments: 12, vSegments: 6, uByArc: true,
});

/** Tapered adult proportions; all dimensions below are local modelling metres,
 * not physics constants. A 1.9 m authored human hull sets the overall height. */
const HUMAN_GEOMETRY: Readonly<Record<string, () => THREE.BufferGeometry>> = {
  torso: () => body([
    { y: 0, halfWidth: 0.155, halfDepth: 0.107, square: 3.0 },
    { y: 0.06, halfWidth: 0.169, halfDepth: 0.118, square: 3.2 },
    { y: 0.42, halfWidth: 0.153, halfDepth: 0.115, square: 3.2 },
    { y: 0.77, halfWidth: 0.213, halfDepth: 0.129, z: 0.006, square: 3.0 },
    { y: 0.90, halfWidth: 0.226, halfDepth: 0.126, z: 0.004, square: 2.8 },
    { y: 1, halfWidth: 0.132, halfDepth: 0.096, square: 2.5 },
  ], 16),
  pelvis: () => body([
    { y: 0, halfWidth: 0.149, halfDepth: 0.119, square: 3.0 },
    { y: 0.055, halfWidth: 0.169, halfDepth: 0.135, square: 3.0 },
    { y: 0.18, halfWidth: 0.170, halfDepth: 0.129, square: 3.0 },
    { y: 0.22, halfWidth: 0.155, halfDepth: 0.119, square: 3.0 },
  ], 14),
  upperLeg: () => limb(0.088, 0.064),
  lowerLeg: () => limb(0.066, 0.046),
  upperArm: () => limb(0.071, 0.056),
  forearm: () => limb(0.054, 0.040),
  hand: () => body([
    { y: 0, halfWidth: 0.033, halfDepth: 0.023, square: 2.9 },
    { y: 0.375, halfWidth: 0.042, halfDepth: 0.025, square: 3.0 },
    { y: 0.833, halfWidth: 0.035, halfDepth: 0.022, square: 3.0 },
    { y: 1, halfWidth: 0.019, halfDepth: 0.018, square: 2.2 },
  ], 12),
  head: () => body([
    { y: 0, halfWidth: 0.061, halfDepth: 0.058, z: 0.026, square: 2.3 },
    { y: 0.035, halfWidth: 0.090, halfDepth: 0.079, z: 0.015, square: 2.5 },
    { y: 0.105, halfWidth: 0.112, halfDepth: 0.092, z: 0.006, square: 2.4 },
    { y: 0.185, halfWidth: 0.113, halfDepth: 0.095, square: 2.2 },
    { y: 0.25, halfWidth: 0.084, halfDepth: 0.078, square: 2.0 },
    { y: 0.27, halfWidth: 0.043, halfDepth: 0.042, square: 2.0 },
  ], 18),
  hair: () => body([
    { y: 0, halfWidth: 0.112, halfDepth: 0.096, z: -0.007, square: 2.3 },
    { y: 0.045, halfWidth: 0.117, halfDepth: 0.099, z: -0.006, square: 2.2 },
    { y: 0.100, halfWidth: 0.093, halfDepth: 0.083, z: -0.006, square: 2.0 },
    { y: 0.13, halfWidth: 0.025, halfDepth: 0.023, square: 2.0 },
  ], 18),
  shoe: () => body([
    { y: 0, halfWidth: 0.086, halfDepth: 0.143, z: 0.018, square: 4.0 },
    { y: 0.026, halfWidth: 0.086, halfDepth: 0.143, z: 0.018, square: 4.0 },
    { y: 0.064, halfWidth: 0.076, halfDepth: 0.124, z: 0.005, square: 3.6 },
    { y: 0.11, halfWidth: 0.051, halfDepth: 0.061, z: -0.024, square: 3.1 },
  ], 16),
  sole: () => body([
    { y: 0, halfWidth: POPULATION_MODEL.footHalfWidth, halfDepth: POPULATION_MODEL.footHalfDepth,
      z: POPULATION_MODEL.footForwardOffset, square: 4.0 },
    { y: 0.019, halfWidth: POPULATION_MODEL.footHalfWidth, halfDepth: POPULATION_MODEL.footHalfDepth,
      z: POPULATION_MODEL.footForwardOffset, square: 4.0 },
  ], 16),
  nose: () => body([
    { y: 0, halfWidth: 0.017, halfDepth: 0.009, square: 2.4 },
    { y: 0.018, halfWidth: 0.025, halfDepth: 0.025, z: 0.006, square: 2.0 },
    { y: 0.050, halfWidth: 0.011, halfDepth: 0.007, z: -0.008, square: 2.0 },
  ], 10),
  round: () => new THREE.SphereGeometry(1, 10, 7),
  box: () => new THREE.BoxGeometry(1, 1, 1),
};

const VEHICLE_GEOMETRY: Readonly<Record<string, () => THREE.BufferGeometry>> = {
  hull: () => body([
    { y: 0.12, halfWidth: 0.85, halfDepth: 0.94, square: 7 },
    { y: 0.23, halfWidth: 0.94, halfDepth: 0.99, square: 7 },
    { y: 0.40, halfWidth: 0.98, halfDepth: 1.00, square: 7 },
    { y: 0.57, halfWidth: 0.94, halfDepth: 0.95, square: 6 },
    { y: 0.61, halfWidth: 0.90, halfDepth: 0.91, square: 6 },
  ], 20),
  cabin: () => loftGeometry(CABIN, { radialSegments: 20 }),
  windshield: () => cabinWindow(Math.PI / 2 - 0.31, Math.PI / 2 + 0.31),
  rearWindow: () => cabinWindow(Math.PI * 1.5 - 0.31, Math.PI * 1.5 + 0.31),
  sideWindow: () => mergeGeometries([
    cabinWindow(0.0007, 0.62), cabinWindow(Math.PI - 0.62, Math.PI - 0.0007),
  ]),
  sidePassenger: () => mergeGeometries([
    cabinWindow(-0.62, -0.0001), cabinWindow(Math.PI + 0.0001, Math.PI + 0.62),
  ]),
  tyre: () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, false).rotateZ(Math.PI / 2),
  rim: () => mergeGeometries([
    body([
      { y: -0.50, halfWidth: 0.57, halfDepth: 0.57, square: 2 },
      { y: -0.40, halfWidth: 0.61, halfDepth: 0.61, square: 2 },
      { y: 0.40, halfWidth: 0.61, halfDepth: 0.61, square: 2 },
      { y: 0.50, halfWidth: 0.57, halfDepth: 0.57, square: 2 },
    ], 16),
    ...[-1, 1].flatMap(side => [0, Math.PI / 3, Math.PI * 2 / 3].map(angle =>
      shaded(new THREE.BoxGeometry(1.03, 0.04, 0.068).rotateY(angle).translate(0, side * 0.50, 0)))),
  ]).rotateZ(Math.PI / 2),
};

/** One world view. Instancing makes the submission count a finite family count,
 * not actor-count × articulated-part-count. Individual colours are instances. */
export function createPopulationView(
  plan: PopulationPlan, painter: PopulationPainter = DEFAULT_POPULATION_PAINTER,
): PopulationView {
  const group = new THREE.Group();
  group.name = 'outdoor-population';
  group.userData.population = true;
  group.visible = false;
  const batches = new Map<string, Batch>();
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const materialByFinish = new Map<PopulationFinish, THREE.MeshStandardMaterial>();
  const visuals: Visual[] = [];
  const machineOwner: { template: BlockoutEUC | null } = { template: null };
  let machineParts: { mesh: THREE.Mesh; matrix: THREE.Matrix4; tyre: boolean }[] = [];
  let disposed = false;
  let clockSeconds = 0;
  let missingPoseIds: string[] = [];
  let missingGroundNormalIds: string[] = [];
  let missingWheelTravelIds: string[] = [];
  let missingSurfaceSupportIds: string[] = [];

  const material = (finish: PopulationFinish): THREE.MeshStandardMaterial => {
    let existing = materialByFinish.get(finish);
    if (!existing) {
      const recipe = painter.finish(finish);
      if (!Number.isFinite(recipe.roughness) || !Number.isFinite(recipe.metalness)) {
        throw new TypeError(`Population finish ${finish} must be finite`);
      }
      existing = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: clamp(recipe.roughness, 0, 1),
        metalness: clamp(recipe.metalness, 0, 1),
      });
      existing.name = `population-${finish}`;
      materialByFinish.set(finish, existing);
      ownedMaterials.add(existing);
    }
    return existing;
  };
  const family = (id: string, create: () => THREE.BufferGeometry, finish: PopulationFinish, casts = false): Batch => {
    let batch = batches.get(id);
    if (!batch) {
      const geometry = create();
      ownedGeometry.add(geometry);
      batch = { id, geometry, material: material(finish), casts, colours: [], mesh: null, dirty: false };
      batches.set(id, batch);
    }
    return batch;
  };
  const slot = (batch: Batch, colour: number): Slot => {
    const index = batch.colours.length;
    batch.colours.push(colour);
    return { batch, index };
  };
  const humanPart = (geometry: string, finish: PopulationFinish, colour: number, casts = false): Slot =>
    slot(family(`human-${geometry}-${finish}`, HUMAN_GEOMETRY[geometry]!, finish, casts), colour);
  const vanPart = (geometry: string, finish: PopulationFinish, colour: number, casts = false): Slot =>
    slot(family(`vehicle-${geometry}-${finish}`, VEHICLE_GEOMETRY[geometry]!, finish, casts), colour);

  // A texture-free standard EUC owns its existing art once. Its shapes and
  // materials are shared by every fictional rider, including the real pedals.
  // We do not change the existing factory, player looks, lighting or materials.
  const addMachine = (visual: Visual): void => {
    if (!machineOwner.template) {
      machineOwner.template = createBlockoutEUC(STANDARD_MACHINE_LOOK);
      machineOwner.template.group.updateMatrixWorld(true);
      machineOwner.template.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some(material => Object.values(material).some(value => value instanceof THREE.Texture))) {
          throw new Error('Population STANDARD_MACHINE_LOOK must remain texture-free');
        }
        machineParts.push({ mesh, matrix: mesh.matrixWorld.clone(), tyre: mesh === machineOwner.template!.tyre });
      });
    }
    for (const part of machineParts) {
      const id = `population-${part.mesh.name}`;
      let batch = batches.get(id);
      if (!batch) {
        // These resources belong exclusively to machineTemplate.dispose().
        batch = { id, geometry: part.mesh.geometry, material: part.mesh.material,
          casts: part.mesh.name === 'euc-tyre' || part.mesh.name === 'euc-shell', colours: [], mesh: null, dirty: false };
        batches.set(id, batch);
      }
      visual.machine.push({ slot: slot(batch, 0xffffff), matrix: part.matrix.clone(), tyre: part.tyre });
    }
  };

  const ids = new Set<string>();
  try {
    for (const spec of plan.actors) {
      if (!spec.id || ids.has(spec.id) || ![spec.hull.halfWidthMetres, spec.hull.halfLengthMetres,
        spec.hull.heightMetres].every(value => Number.isFinite(value) && value > 0)) {
        throw new TypeError('Population models need unique actor ids and positive finite physical hulls');
      }
      if (spec.kind === 'fictionalEuc' && spec.hull.heightMetres <= WHEEL.pedalHeight) {
        throw new TypeError('A fictional rider hull must stand above its real pedals');
      }
      ids.add(spec.id);
      const paint = painter.actor(spec);
      const visual: Visual = { spec, parts: {}, machine: [],
        passenger: spec.kind === 'trafficVehicle' || (spec.kind === 'parkedVehicle' && spec.appearanceIndex % 2 !== 0),
        pose: createMutablePose(), pendingPose: createMutablePose(), visible: false };
      visuals.push(visual);
      const p = visual.parts;
      if (vehicleKind(spec.kind)) {
        p.hull = vanPart('hull', 'paint', paint.vehicle, true);
        p.cabin = vanPart('cabin', 'paint', paint.vehicle, true);
        p.windshield = vanPart('windshield', 'glass', 0x536779);
        p.sideWindows = vanPart('sideWindow', 'glass', 0x536779);
        if (visual.passenger) p.sidePassenger = vanPart('sidePassenger', 'glass', 0x5c7080);
        for (const side of ['l', 'r']) {
          for (const axle of ['front', 'rear']) {
            p[`${side}-${axle}-tyre`] = vanPart('tyre', 'rubber', 0x50565d, true);
            p[`${side}-${axle}-rim`] = vanPart('rim', 'metal', 0x919a9f);
          }
          p[`${side}-mirror`] = humanPart('box', 'paint', paint.vehicle);
          p[`${side}-mirror-glass`] = humanPart('box', 'glass', 0x657882);
          p[`${side}-handle`] = humanPart('box', 'metal', 0x929b9d);
          p[`${side}-headlamp`] = humanPart('box', 'lens', 0xbfc4b8);
          p[`${side}-taillamp`] = humanPart('box', 'lens', 0x9c584b);
          p[`${side}-door-seam`] = humanPart('box', 'rubber', 0x626a70);
          if (!visual.passenger) p[`${side}-service-band`] = humanPart('box', 'paint', paint.trim);
        }
        if (visual.passenger) p.rearWindow = vanPart('rearWindow', 'glass', 0x536779);
        for (const end of ['front', 'rear']) {
          p[`${end}-bumper`] = humanPart('box', 'rubber', 0x616970);
          p[`${end}-plate`] = humanPart('box', 'paint', 0xaeb4ad);
        }
        p.grille = humanPart('box', 'rubber', 0x515b64);
        p.roofRidge = humanPart('box', 'paint', paint.trim);
      } else {
        p.torso = humanPart('torso', 'cloth', paint.jacket, true);
        p.pelvis = humanPart('pelvis', 'cloth', paint.trousers);
        p.head = humanPart('head', 'skin', paint.skin, true);
        p.hair = humanPart('hair', 'hair', spec.kind === 'worker' || spec.kind === 'fictionalEuc' ? paint.trim : paint.hair);
        p.nose = humanPart('nose', 'skin', paint.skin);
        p.neck = humanPart('round', 'skin', paint.skin);
        p.mouth = humanPart('box', 'skin', 0x855f56);
        p.collar = humanPart('box', 'cloth', paint.trim);
        p.hem = humanPart('box', 'cloth', paint.trim);
        p.backSeam = humanPart('box', 'cloth', paint.trim);
        for (const side of ['l', 'r']) {
          p[`${side}-thigh`] = humanPart('upperLeg', 'cloth', paint.trousers, true);
          p[`${side}-shin`] = humanPart('lowerLeg', 'cloth', paint.trousers, true);
          p[`${side}-upper-arm`] = humanPart('upperArm', 'cloth', paint.jacket);
          p[`${side}-forearm`] = humanPart('forearm', 'skin', paint.skin);
          p[`${side}-hand`] = humanPart('hand', 'skin', paint.skin);
          p[`${side}-shoe`] = humanPart('shoe', 'rubber', paint.shoes);
          p[`${side}-sole`] = humanPart('sole', 'rubber', paint.trim);
          p[`${side}-ear`] = humanPart('round', 'skin', paint.skin);
          p[`${side}-eye`] = humanPart('round', 'glass', 0x505b65);
          p[`${side}-brow`] = humanPart('box', 'hair', paint.hair);
          p[`${side}-pocket`] = humanPart('box', 'cloth', paint.trim);
        }
        if (spec.kind === 'worker') {
          p.brim = humanPart('sole', 'paint', paint.trim);
          p.workBand = humanPart('box', 'cloth', paint.trim);
          p.clipboard = humanPart('box', 'paint', 0x9b967e);
          p.pen = humanPart('box', 'metal', 0x8e9899);
        }
        if (spec.kind === 'fictionalEuc') addMachine(visual);
      }
    }
    const colour = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.colours.length);
      batch.mesh = mesh;
      mesh.name = batch.id;
      // Dynamic outdoor actors must never be baked into the static far map.
      mesh.layers.disable(ULTRA_STATIC_LAYER);
      mesh.userData.population = true;
      mesh.userData.populationDynamic = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = batch.casts;
      mesh.receiveShadow = true;
      // One batch may span the whole town; automatic bounds would be a stale
      // physics-adjacent culling trap. Full-world topology is priced honestly.
      mesh.frustumCulled = false;
      batch.colours.forEach((hex, index) => { mesh.setColorAt(index, colour.setHex(hex)); mesh.setMatrixAt(index, hidden); });
      group.add(mesh);
    }
  } catch (error) {
    for (const batch of batches.values()) batch.mesh?.dispose();
    for (const geometry of ownedGeometry) geometry.dispose();
    for (const mat of ownedMaterials) mat.dispose();
    machineOwner.template?.dispose();
    group.clear();
    throw error;
  }

  // Shared scratch memory; no object allocation per joint or pane. The shared
  // support helper returns one small plain target record per actor update.
  const transform = new THREE.Object3D();
  const root = new THREE.Matrix4();
  const normalRoot = new THREE.Matrix4();
  const inverseRoot = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const extra = new THREE.Matrix4();
  const headMatrix = new THREE.Matrix4();
  const torsoMatrix = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const sideAxis = new THREE.Vector3(1, 0, 0);
  const axis = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  const hip = new THREE.Vector3();
  const knee = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const footOrientation = new THREE.Quaternion();
  const pitchOrientation = new THREE.Quaternion();
  const localNormal = new THREE.Vector3();
  const previousById = new Map<string, PopulationRenderPose>();
  const currentById = new Map<string, PopulationRenderPose>();

  const write = (part: Slot | undefined, parent: THREE.Matrix4,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1,
    rx = 0, ry = 0, rz = 0): void => {
    if (!part || !part.batch.mesh) return;
    transform.position.set(x, y, z);
    transform.rotation.set(rx, ry, rz);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    matrix.multiplyMatrices(parent, transform.matrix);
    part.batch.mesh.setMatrixAt(part.index, matrix);
    part.batch.dirty = true;
  };
  const directed = (part: Slot, parent: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3): void => {
    delta.subVectors(b, a);
    const length = delta.length();
    orientation.setFromUnitVectors(up, delta.multiplyScalar(1 / Math.max(length, 1e-6)));
    transform.position.copy(a); transform.quaternion.copy(orientation); transform.scale.set(1, length, 1);
    transform.updateMatrix(); matrix.multiplyMatrices(parent, transform.matrix);
    part.batch.mesh!.setMatrixAt(part.index, matrix);
    part.batch.dirty = true;
  };
  /** Exact two-bone solve. Flexion is a geometric intersection, never two
   * independent limb rotations which leave disconnected knees/ankles. */
  const joint = (a: THREE.Vector3, b: THREE.Vector3, first: number, second: number,
    forwardBend: number, out: THREE.Vector3): void => {
    axis.subVectors(b, a);
    const measured = axis.length();
    axis.multiplyScalar(1 / Math.max(measured, 1e-6));
    const span = clamp(measured, Math.abs(first - second) + 1e-5, first + second - 1e-5);
    const along = (first * first - second * second + span * span) / (2 * span);
    const bow = Math.sqrt(Math.max(0, first * first - along * along));
    bend.set(0, 0, forwardBend).addScaledVector(axis, -axis.z * forwardBend).normalize();
    if (bend.lengthSq() < 0.01) bend.set(1, 0, 0);
    out.copy(a).addScaledVector(axis, along).addScaledVector(bend, bow);
  };
  const poseHuman = (visual: Visual): void => {
    const s = visual.pose, p = visual.parts;
    const riding = visual.spec.kind === 'fictionalEuc';
    const jogging = visual.spec.kind === 'jogger';
    const targets = populationSupportTargets({ ...visual.spec, x: s.x, y: s.y, z: s.z, headingY: s.headingY,
      speedMetresPerSecond: s.speed, gaitDistanceMetres: s.gait, activity: s.activity,
      groundNormalX: s.normalX, groundNormalY: s.normalY, groundNormalZ: s.normalZ,
      posture: s.posture, sittingBlend: s.sittingBlend, seatHeightMetres: s.seatHeight });
    const { moving, phase, widthScale, heightScale, lengthScale, sittingBlend: sitting } = targets;
    const swing = Math.sin(phase * TAU);
    const reach = s.activity === 'working' ? (0.5 - 0.5 * Math.cos(s.phase * TAU)) * s.blend : 0;
    const talk = s.activity === 'social' ? Math.sin(s.phase * TAU) * s.blend : 0;
    // A bumped person flinches (VIS-CRASH-1, 2026-10-04): a quick lean and half
    // step back with the hands up, over in well under a second of the impact
    // pause. Feet stay planted; a seated person only leans and lifts the hands.
    const flinch = s.activity === 'impacted' ? Math.sin(Math.PI * Math.sqrt(clamp(s.phase / 0.7, 0, 1))) : 0;
    const bob = targets.bobMetres;
    const pedal = riding ? POPULATION_MODEL.pedalHeight : 0;
    // Relaxed, speed-dependent riding crouch. No view clock or fake controller.
    const rideCrouch = riding ? 0.05 + Math.min(Math.abs(s.speed) / 6, 1) * 0.045 : 0;
    transform.position.set(s.x, s.y + pedal, s.z);
    transform.rotation.set(0, s.headingY, 0);
    transform.scale.set(widthScale, heightScale, lengthScale);
    transform.updateMatrix(); root.copy(transform.matrix);
    inverseRoot.copy(root).invert();
    if (riding) {
      normal.set(s.normalX, s.normalY, s.normalZ).normalize();
      orientation.setFromUnitVectors(up, normal);
      pitchOrientation.setFromAxisAngle(up, s.headingY);
      transform.position.set(s.x, s.y, s.z);
      transform.quaternion.copy(orientation).multiply(pitchOrientation);
      transform.scale.setScalar(1); transform.updateMatrix(); normalRoot.copy(transform.matrix);
    }
    // Pelvis bottom rests on the explicit cushion; seat height is not hip height.
    const hipY = 0.95 - bob - rideCrouch + (targets.seatHeightLocalMetres + 0.12 - 0.95) * sitting;
    const hipZ = (riding ? 0.025 : jogging && moving ? 0.035 : 0) - 0.09 * sitting - 0.10 * flinch * (1 - sitting);
    write(p.pelvis, root, 0, hipY - 0.12, hipZ);
    transform.position.set(0, hipY + 0.025, hipZ);
    transform.rotation.set((jogging && moving ? 0.07 : riding ? 0.055 : sitting * 0.045) - 0.08 * flinch, talk * 0.025, 0);
    transform.scale.set(1, 0.53, 1); transform.updateMatrix(); torsoMatrix.multiplyMatrices(root, transform.matrix);
    write(p.torso, torsoMatrix, 0, 0, 0);
    write(p.hem, torsoMatrix, 0, 0.06, 0.122, 0.26, 0.045, 0.014);
    write(p.collar, torsoMatrix, 0, 0.93, 0.098, 0.14, 0.075, 0.017);
    write(p.backSeam, torsoMatrix, 0, 0.43, -0.123, 0.012, 0.74, 0.012);
    write(p.workBand, torsoMatrix, 0, 0.60, 0.132, 0.32, 0.045, 0.014);

    const neckY = hipY + 0.62;
    write(p.neck, root, 0, neckY - 0.015, hipZ + 0.002 - 0.04 * flinch, 0.059, 0.081, 0.055);
    transform.position.set(0, hipY + 0.665, hipZ + 0.014 - 0.045 * flinch);
    transform.rotation.set(-0.025 - 0.18 * flinch, talk * 0.16, 0); transform.scale.setScalar(1);
    transform.updateMatrix(); headMatrix.multiplyMatrices(root, transform.matrix);
    write(p.head, headMatrix, 0, 0, 0);
    write(p.hair, headMatrix, 0, 0.15, 0, 1, 1, 1);
    write(p.brim, headMatrix, 0, 0.152, 0.019, 1.63, 0.25, 1.0);
    write(p.nose, headMatrix, 0, 0.095, 0.095);
    write(p.mouth, headMatrix, 0, 0.061, 0.086, 0.059, 0.008, 0.012);
    for (const sign of [1, -1]) {
      const side = sign > 0 ? 'l' : 'r';
      write(p[`${side}-eye`], headMatrix, sign * 0.041, 0.153, 0.093, 0.011, 0.010, 0.009);
      write(p[`${side}-brow`], headMatrix, sign * 0.041, 0.178, 0.088, 0.045, 0.010, 0.012, 0, 0, sign * -0.04);
      write(p[`${side}-ear`], headMatrix, sign * 0.112, 0.129, -0.006, 0.022, 0.034, 0.023);
      write(p[`${side}-pocket`], root, sign * 0.136, hipY - 0.03, 0.124 + hipZ,
        0.056, 0.070, 0.013, 0, 0, sign * 0.05);

      // Terrain samples come from simulation at these exact shared targets.
      // Pedal targets instead come from the existing machine's transformed art.
      const index = sign > 0 ? 0 : 1, target = targets.feet![index]!;
      const support = riding ? null : s.footSupports[index]!;
      foot.set(support?.x ?? target.x, (support?.y ?? target.y) + target.liftMetres,
        support?.z ?? target.z).applyMatrix4(inverseRoot);
      localNormal.set(support?.normalX ?? s.normalX, support?.normalY ?? s.normalY,
        support?.normalZ ?? s.normalZ).applyAxisAngle(up, -s.headingY).normalize();
      // Correct plane normals for anatomical nonuniform scale.
      localNormal.set(localNormal.x * widthScale / heightScale, localNormal.y,
        localNormal.z * lengthScale / heightScale).normalize();
      footOrientation.setFromUnitVectors(up, localNormal);
      pitchOrientation.setFromAxisAngle(sideAxis, target.pitchRadians);
      orientation.copy(footOrientation).multiply(pitchOrientation);
      transform.position.copy(foot); transform.quaternion.copy(orientation); transform.scale.setScalar(1);
      transform.updateMatrix(); extra.multiplyMatrices(root, transform.matrix);
      write(p[`${side}-shoe`], extra, 0, 0, 0);
      write(p[`${side}-sole`], extra, 0, 0, 0);
      ankle.set(0, POPULATION_MODEL.ankleHeight, POPULATION_MODEL.ankleRearward).applyQuaternion(orientation).add(foot);
      hip.set(sign * 0.123, hipY, hipZ);
      joint(hip, ankle, 0.465, 0.455, 1, knee);
      // A compact arcade contact hull is not a licence for knees to escape it.
      // Preserve the connected solve while limiting flexion inside the model.
      knee.z = clamp(knee.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.082,
        visual.spec.hull.halfLengthMetres / lengthScale - 0.082);
      directed(p[`${side}-thigh`]!, root, hip, knee);
      directed(p[`${side}-shin`]!, root, knee, ankle);

      shoulder.set(sign * 0.221, hipY + 0.48, hipZ + 0.012 - 0.035 * flinch);
      const armSwing = moving ? swing * sign : 0;
      wrist.set(sign * (riding ? 0.247 : 0.255), hipY + 0.065,
        hipZ + 0.07 - armSwing * (jogging ? 0.24 : 0.20));
      if (jogging && moving) wrist.y += 0.16;
      if (s.activity === 'social' && sign > 0) {
        wrist.y += 0.08 + Math.max(0, talk) * 0.13;
        wrist.z += 0.10 + talk * 0.04;
      }
      if (s.activity === 'working') {
        wrist.set(sign * 0.10, hipY + 0.17 + (sign > 0 ? 0.045 * reach : 0), 0.255 + reach * 0.015);
      }
      if (sitting > 0) wrist.lerp(foot.set(sign * 0.16, hipY + 0.16 + Math.max(0, talk) * 0.045,
        hipZ + 0.22), sitting);
      if (riding) { wrist.y += 0.075; wrist.z += 0.025; }
      if (flinch > 0) { wrist.y += 0.30 * flinch; wrist.z += 0.14 * flinch; }
      // Elbows flex behind the shoulder-wrist chord; knees use the opposite plane.
      joint(shoulder, wrist, 0.295, 0.28, -1, elbow);
      elbow.z = Math.max(elbow.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.095);
      directed(p[`${side}-upper-arm`]!, root, shoulder, elbow);
      directed(p[`${side}-forearm`]!, root, elbow, wrist);
      // Hands point along the forearm without being a detached ball at its end.
      delta.subVectors(wrist, elbow).normalize().multiplyScalar(0.12).add(wrist);
      delta.z = clamp(delta.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.046,
        visual.spec.hull.halfLengthMetres / lengthScale - 0.046);
      directed(p[`${side}-hand`]!, root, wrist, delta);
    }
    const clipboardVisible = s.activity === 'working';
    write(p.clipboard, root, 0, hipY + 0.125, 0.245,
      clipboardVisible ? 0.19 : 0, clipboardVisible ? 0.23 : 0, clipboardVisible ? 0.025 : 0, -0.10, 0, 0);
    write(p.pen, root, 0.10, hipY + 0.175 + reach * 0.045, 0.27 + reach * 0.012,
      clipboardVisible ? 0.009 : 0, clipboardVisible ? 0.11 : 0, clipboardVisible ? 0.009 : 0, 0.55, 0, 0.06);

    if (riding) {
      for (const part of visual.machine) {
        if (part.tyre) {
          // Existing art turns rotation.x BEFORE its axle-to-X rotation.z;
          // post-multiplying a spin would tumble the wheel around the wrong axis.
          matrix.copy(part.matrix); matrix.setPosition(0, 0, 0);
          extra.makeRotationX(s.wheelTravel / (WHEEL.tyreDiameter / 2)).multiply(matrix);
          extra.setPosition(part.matrix.elements[12]!, part.matrix.elements[13]!, part.matrix.elements[14]!);
          matrix.multiplyMatrices(normalRoot, extra);
        } else matrix.multiplyMatrices(normalRoot, part.matrix);
        part.slot.batch.mesh!.setMatrixAt(part.slot.index, matrix);
        part.slot.batch.dirty = true;
      }
    }
  };

  const poseVehicle = (visual: Visual): void => {
    const s = visual.pose, p = visual.parts;
    const w = visual.spec.hull.halfWidthMetres, l = visual.spec.hull.halfLengthMetres,
      h = visual.spec.hull.heightMetres;
    const targets = populationSupportTargets({ ...visual.spec, x: s.x, y: s.y, z: s.z, headingY: s.headingY,
      speedMetresPerSecond: s.speed, gaitDistanceMetres: s.gait, activity: s.activity,
      groundNormalX: s.normalX, groundNormalY: s.normalY, groundNormalZ: s.normalZ });
    const radius = targets.tyres![0].radiusMetres;
    normal.set(s.normalX, s.normalY, s.normalZ).normalize();
    orientation.setFromUnitVectors(up, normal);
    pitchOrientation.setFromAxisAngle(up, s.headingY);
    transform.position.set(s.x, s.y, s.z);
    transform.quaternion.copy(orientation).multiply(pitchOrientation);
    transform.scale.setScalar(1); transform.updateMatrix(); root.copy(transform.matrix);
    write(p.hull, root, 0, 0, 0, w, h, l);
    write(p.cabin, root, 0, 0, 0, w, h, l);
    write(p.windshield, root, 0, 0, 0, w, h, l);
    write(p.rearWindow, root, 0, 0, 0, w, h, l);
    write(p.sideWindows, root, 0, 0, 0, w, h, l);
    write(p.sidePassenger, root, 0, 0, 0, w, h, l);
    write(p.grille, root, 0, 0.335 * h, 0.995 * l, 0.86 * w, 0.095 * h, 0.008 * l);
    // Roof reaches the authored height; both bumpers reach the authored length.
    write(p.roofRidge, root, 0, 0.994 * h, -0.18 * l, 0.055 * w, 0.012 * h, 1.32 * l);
    for (const sign of [1, -1]) {
      const side = sign > 0 ? 'l' : 'r';
      for (const front of [true, false]) {
        const axle = front ? 'front' : 'rear';
        const supportIndex = (sign > 0 ? 0 : 2) + (front ? 0 : 1);
        const target = targets.tyres![supportIndex]!, support = s.tyreSupports[supportIndex]!;
        const z = target.localZ;
        const roll = s.wheelTravel / Math.max(radius, 1e-6);
        const tyrePart = p[`${side}-${axle}-tyre`]!, rimPart = p[`${side}-${axle}-rim`]!;
        // Rubber has rotationally uniform art. Its polygon bottom stays planted;
        // the embossed alloy spokes carry the actual signed wheel rotation.
        write(tyrePart, root, target.localX, radius, z,
          POPULATION_MODEL.tyreWidthShare * w, radius, radius);
        // Suspension follows the actual sampled tread patch without turning
        // this renderer into another TerrainSampler. Same correction for rim.
        matrix.elements[12]! += support.x - target.x;
        matrix.elements[13]! += support.y - target.y;
        matrix.elements[14]! += support.z - target.z;
        tyrePart.batch.mesh!.setMatrixAt(tyrePart.index, matrix);
        write(rimPart, root, sign * POPULATION_MODEL.rimOutwardShare * w, radius, z,
          POPULATION_MODEL.rimWidthShare * w, radius, radius, roll);
        matrix.elements[12]! += support.x - target.x;
        matrix.elements[13]! += support.y - target.y;
        matrix.elements[14]! += support.z - target.z;
        rimPart.batch.mesh!.setMatrixAt(rimPart.index, matrix);
      }
      // Mirror outer faces end exactly at |x| = authored halfWidth.
      write(p[`${side}-mirror`], root, sign * 0.95 * w, 0.63 * h, 0.54 * l,
        0.10 * w, 0.055 * h, 0.12 * l);
      write(p[`${side}-mirror-glass`], root, sign * 0.95 * w, 0.63 * h, 0.483 * l,
        0.073 * w, 0.037 * h, 0.012);
      write(p[`${side}-handle`], root, sign * 0.943 * w, 0.56 * h, 0.12 * l,
        0.036 * w, 0.018 * h, 0.095 * l);
      write(p[`${side}-headlamp`], root, sign * 0.66 * w, 0.48 * h, 0.94 * l,
        0.31 * w, 0.055 * h, 0.08 * l);
      write(p[`${side}-taillamp`], root, sign * 0.69 * w, 0.52 * h, -0.94 * l,
        0.15 * w, 0.12 * h, 0.04 * l);
      write(p[`${side}-door-seam`], root, sign * 0.947 * w, 0.47 * h, -0.09 * l,
        0.012, 0.235 * h, 0.012);
      write(p[`${side}-service-band`], root, sign * 0.943 * w, 0.52 * h, -0.44 * l,
        0.014, 0.07 * h, 0.57 * l);
    }
    for (const sign of [1, -1]) {
      const end = sign > 0 ? 'front' : 'rear';
      write(p[`${end}-bumper`], root, 0, 0.205 * h, sign * 0.985 * l,
        1.67 * w, 0.055 * h, 0.03 * l);
      write(p[`${end}-plate`], root, 0, 0.26 * h, sign * 0.995 * l,
        0.30 * w, 0.04 * h, 0.009 * l);
    }
  };

  const hide = (visual: Visual): void => {
    if (!visual.visible) return;
    visual.visible = false;
    matrix.makeScale(0, 0, 0);
    for (const part of Object.values(visual.parts)) {
      part.batch.mesh!.setMatrixAt(part.index, matrix); part.batch.dirty = true;
    }
    for (const part of visual.machine) {
      part.slot.batch.mesh!.setMatrixAt(part.slot.index, matrix); part.slot.batch.dirty = true;
    }
  };
  const finitePose = (pose: PopulationRenderPose): boolean =>
    Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z) && Number.isFinite(pose.headingY)
      && Number.isFinite(pose.speedMetresPerSecond) && Number.isFinite(pose.gaitDistanceMetres)
      && Number.isFinite(pose.activityPhase) && Number.isFinite(pose.activityBlend);
  const validSupports = (supports: readonly PopulationGroundSupport[] | undefined, count: number):
    supports is readonly PopulationGroundSupport[] => supports?.length === count && supports.every(support =>
      Number.isFinite(support.x) && Number.isFinite(support.y) && Number.isFinite(support.z)
      && Number.isFinite(support.normalX) && Number.isFinite(support.normalY) && Number.isFinite(support.normalZ)
      && support.normalY > 0 && Math.hypot(support.normalX, support.normalY, support.normalZ) > 1e-6);

  const update = (previous: PopulationRenderSnapshot, current: PopulationRenderSnapshot, rawAlpha: number): void => {
    if (disposed) return;
    const alpha = Number.isFinite(rawAlpha) ? clamp(rawAlpha, 0, 1) : 1;
    previousById.clear(); currentById.clear();
    previous.actors.forEach(pose => previousById.set(pose.id, pose));
    current.actors.forEach(pose => currentById.set(pose.id, pose));
    missingPoseIds.length = 0; missingGroundNormalIds.length = 0;
    missingWheelTravelIds.length = 0; missingSurfaceSupportIds.length = 0;
    clockSeconds = previous.clockSeconds + (current.clockSeconds - previous.clockSeconds) * alpha;
    for (const visual of visuals) {
      const b = currentById.get(visual.spec.id);
      if (!b || b.kind !== visual.spec.kind || !finitePose(b)) {
        missingPoseIds.push(visual.spec.id); hide(visual); continue;
      }
      const candidateA = previousById.get(visual.spec.id);
      const a = candidateA && candidateA.kind === b.kind && finitePose(candidateA) ? candidateA : b;
      const mix = (first: number, last: number): number => first + (last - first) * alpha;
      const s = visual.pendingPose;
      s.x = mix(a.x, b.x); s.y = mix(a.y, b.y); s.z = mix(a.z, b.z);
      s.headingY = a.headingY + angleDelta(a.headingY, b.headingY) * alpha;
      s.speed = mix(a.speedMetresPerSecond, b.speedMetresPerSecond);
      s.gait = mix(a.gaitDistanceMetres, b.gaitDistanceMetres);
      const wheel = Number.isFinite(b.wheelTravelMetres) && Number.isFinite(a.wheelTravelMetres);
      s.wheelTravel = wheel ? mix(a.wheelTravelMetres!, b.wheelTravelMetres!) : s.gait;
      if (!wheel && (vehicleKind(b.kind) || b.kind === 'fictionalEuc')) missingWheelTravelIds.push(b.id);
      // Activity change is a discrete fixed-step fact. Progress wraps only
      // within one activity; never blend an inspection into an impact state.
      s.activity = b.activity; s.backing = b.backing;
      const phaseDelta = b.activityPhase - a.activityPhase;
      s.phase = b.activity === a.activity
        ? fraction(a.activityPhase + (phaseDelta < -0.5 ? phaseDelta + 1 : phaseDelta > 0.5 ? phaseDelta - 1 : phaseDelta) * alpha)
        : b.activityPhase;
      s.blend = b.activity === a.activity ? mix(a.activityBlend, b.activityBlend) : b.activityBlend;
      s.posture = b.posture ?? 'standing';
      s.sittingBlend = s.posture === 'seated' ? clamp(mix(a.sittingBlend ?? 1, b.sittingBlend ?? 1), 0, 1) : 0;
      s.seatHeight = b.seatHeightMetres;
      const hasNormal = Number.isFinite(b.groundNormalX) && Number.isFinite(b.groundNormalY) && Number.isFinite(b.groundNormalZ);
      if (!hasNormal) missingGroundNormalIds.push(b.id);
      s.normalX = hasNormal ? mix(a.groundNormalX ?? b.groundNormalX!, b.groundNormalX!) : 0;
      s.normalY = hasNormal ? mix(a.groundNormalY ?? b.groundNormalY!, b.groundNormalY!) : 1;
      s.normalZ = hasNormal ? mix(a.groundNormalZ ?? b.groundNormalZ!, b.groundNormalZ!) : 0;
      const norm = Math.hypot(s.normalX, s.normalY, s.normalZ);
      if (!Number.isFinite(norm) || norm < 1e-6 || s.normalY <= 0) { s.normalX = 0; s.normalY = 1; s.normalZ = 0; }
      else { s.normalX /= norm; s.normalY /= norm; s.normalZ /= norm; }
      const supports = vehicleKind(b.kind) ? b.tyreSupports : b.footSupports;
      const oldSupports = vehicleKind(b.kind) ? a.tyreSupports : a.footSupports;
      const supportCount = vehicleKind(b.kind) ? 4 : 2;
      if (b.kind !== 'fictionalEuc' && !validSupports(supports, supportCount)) {
        missingSurfaceSupportIds.push(b.id); hide(visual); continue;
      }
      const oldValid = validSupports(oldSupports, supportCount);
      const interpolated = vehicleKind(b.kind) ? s.tyreSupports : s.footSupports;
      interpolated.length = supports?.length ?? 0;
      for (let index = 0; index < interpolated.length; index += 1) {
        const last = supports![index], first = oldValid ? oldSupports![index] : last;
        const target = interpolated[index] ?? (interpolated[index] = {
          x: 0, y: 0, z: 0, normalX: 0, normalY: 1, normalZ: 0,
        });
        target.x = mix(first.x, last.x); target.y = mix(first.y, last.y); target.z = mix(first.z, last.z);
        target.normalX = mix(first.normalX, last.normalX); target.normalY = mix(first.normalY, last.normalY);
        target.normalZ = mix(first.normalZ, last.normalZ);
      }
      if (visual.visible && samePose(visual.pose, s)) continue;
      visual.pendingPose = visual.pose; visual.pose = s; visual.visible = true;
      if (vehicleKind(visual.spec.kind)) poseVehicle(visual); else poseHuman(visual);
    }
    for (const batch of batches.values()) if (batch.dirty) {
      batch.mesh!.instanceMatrix.needsUpdate = true; batch.dirty = false;
    }
    group.visible = visuals.length > 0;
  };

  const geometrySet = new Set([...ownedGeometry, ...Array.from(batches.values(), batch => batch.geometry)]);
  const materialSet = new Set([...ownedMaterials, ...Array.from(batches.values()).flatMap(batch =>
    Array.isArray(batch.material) ? batch.material : [batch.material])]);
  const geometryBytes = Array.from(geometrySet).reduce((sum, geometry) => sum +
    Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0)
      + (geometry.index?.array.byteLength ?? 0), 0);
  const drawCount = (batch: Batch): number => Array.isArray(batch.material) ? Math.max(1, batch.geometry.groups.length) : 1;
  const triangles = (batch: Batch): number =>
    (batch.geometry.index?.count ?? batch.geometry.getAttribute('position').count) / 3 * batch.colours.length;
  const cost = {
    drawCalls: Array.from(batches.values()).reduce((sum, batch) => sum + drawCount(batch), 0),
    colourTriangles: Array.from(batches.values()).reduce((sum, batch) => sum + triangles(batch), 0),
    shadowDrawCalls: Array.from(batches.values()).reduce((sum, batch) => sum + (batch.casts ? drawCount(batch) : 0), 0),
    shadowTriangles: Array.from(batches.values()).reduce((sum, batch) => sum + (batch.casts ? triangles(batch) : 0), 0),
    geometryBytes,
    instanceBytes: Array.from(batches.values()).reduce((sum, batch) => sum + batch.mesh!.instanceMatrix.array.byteLength
      + (batch.mesh!.instanceColor?.array.byteLength ?? 0), 0),
    textureBytes: 0 as const,
    geometryOwners: geometrySet.size,
    materialOwners: materialSet.size,
    batches: batches.size,
  };
  const counts = {
    actors: visuals.length,
    humans: visuals.filter(visual => !vehicleKind(visual.spec.kind)).length,
    fictionalEucs: visuals.filter(visual => visual.spec.kind === 'fictionalEuc').length,
    cargoVans: visuals.filter(visual => vehicleKind(visual.spec.kind) && !visual.passenger).length,
    passengerVans: visuals.filter(visual => vehicleKind(visual.spec.kind) && visual.passenger).length,
  };
  return {
    group,
    update,
    apply(snapshot) { update(snapshot, snapshot, 1); },
    report() { return { provenance: 'derived-from-built-topology', ...counts,
      ...(disposed ? { drawCalls: 0, colourTriangles: 0, shadowDrawCalls: 0, shadowTriangles: 0,
        geometryBytes: 0, instanceBytes: 0, textureBytes: 0 as const, geometryOwners: 0, materialOwners: 0, batches: 0 } : cost),
      clockSeconds, missingPoseIds: [...missingPoseIds], missingGroundNormalIds: [...missingGroundNormalIds],
      missingWheelTravelIds: [...missingWheelTravelIds], missingSurfaceSupportIds: [...missingSurfaceSupportIds], disposed }; },
    dispose() {
      if (disposed) return;
      disposed = true; group.visible = false;
      for (const batch of batches.values()) batch.mesh!.dispose();
      for (const geometry of ownedGeometry) geometry.dispose();
      for (const mat of ownedMaterials) mat.dispose();
      machineOwner.template?.dispose(); machineOwner.template = null; machineParts = [];
      group.removeFromParent(); group.clear();
      previousById.clear(); currentById.clear();
    },
  };
}
