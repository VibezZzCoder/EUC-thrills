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
import { compactVisibleInstances } from './instanceVisibility.ts';

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
  /** M42: `'knockdown'` while a person sits down hard and gets back up (activity
   * `'impacted'`); absent for the stagger. `impactFallYaw` is the fall direction,
   * radians from `headingY`, away from the rider. Fixed-step facts, never derived here. */
  readonly impactReaction?: string;
  readonly impactFallYaw?: number;
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
  /** Colour plus shadow frusta: an off-camera actor can still cast into view. */
  prepareView(camera: THREE.Camera, shadowCamera?: THREE.Camera): void;
  restoreView(): void;
  report(): PopulationViewReport;
  dispose(): void;
}

interface Batch {
  readonly id: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
  readonly casts: boolean;
  readonly colours: number[];
  readonly slots: Slot[];
  mesh: THREE.InstancedMesh | null;
  dirty: boolean;
}
interface Slot { readonly batch: Batch; index: number; visibleForView: boolean }
interface MachinePart { readonly slot: Slot; readonly matrix: THREE.Matrix4; readonly tyre: boolean }
interface Visual {
  readonly spec: ActorSpec;
  readonly parts: Record<string, Slot>;
  readonly machine: MachinePart[];
  readonly slots: Slot[];
  readonly passenger: boolean;
  pose: MutablePose;
  pendingPose: MutablePose;
  visible: boolean;
  readonly bounds: THREE.Sphere;
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
  /** M42 knock-down channels: `'none'` and 0 unless one plays. */
  reaction: string; fallYaw: number;
}
const createMutablePose = (): MutablePose => ({
  x: 0, y: 0, z: 0, headingY: 0, speed: 0, gait: 0, wheelTravel: 0,
  phase: 0, blend: 0, normalX: 0, normalY: 1, normalZ: 0, activity: 'waiting', backing: false,
  footSupports: [], tyreSupports: [], posture: 'standing', sittingBlend: 0, seatHeight: undefined,
  reaction: 'none', fallYaw: 0,
});
const POSE_SCALARS: readonly (keyof MutablePose)[] = ['x', 'y', 'z', 'headingY', 'speed', 'gait', 'wheelTravel',
  'phase', 'blend', 'normalX', 'normalY', 'normalZ', 'posture', 'sittingBlend', 'seatHeight', 'activity', 'backing',
  'reaction', 'fallYaw'];
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
const ease = (t: number): number => { const v = clamp(t, 0, 1); return v * v * (3 - 2 * v); };
const blendTo = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * M42 knock-down keyframes (PLANS §42.3c; DESIGN §6e's comic rules): local
 * model metres and radians on the reaction's own phase 0..1. The person keeps
 * their own heading throughout — they never turn (critic repair 2026-10-10:
 * a half-turn spin read as whirling round) — and the pose follows the fall:
 * hit from the front, the knees buckle as they lean back and they sit back
 * leaning on both hands behind them; hit from behind, they stumble forward
 * with the arms flung out, then plump down sitting up with the hands beside
 * the hips; hit from the side, they also slide a little away from the rider.
 * Then they push up and stand, brushing off the seat. Every pose stays
 * compact on the rider's side, where the crashed rider and wheel land, and
 * inside the upright hull; never a topple. Pitch about the waist only (one
 * axis per motion); the `…Forward` values are the hit-from-behind ends, the
 * plain ones the hit-from-the-front ends, blended by the fall direction.
 */
const KNOCKDOWN = Object.freeze({
  buckleEnd: 0.12, dropEnd: 0.20, sitEnd: 0.55, pushEnd: 0.85,
  /** Hip joint heights: standing, knees buckled, sat (the pelvis bottom 3 cm up), risen to a crouch. */
  standHipY: 0.95, buckleHipY: 0.68, sitHipY: 0.15, risenHipY: 0.62,
  /** The landing's bounce, metres, over this share of the phase. */
  bounceMetres: 0.035, bounceShare: 0.07,
  /** Hip travel along the figure (back is negative): the buckle, the sit, over the feet on the rise. */
  buckleHipZ: -0.12, buckleHipZForward: 0.02, sitHipZ: -0.20, sitHipZForward: -0.05, risenHipZ: -0.12, risenHipZForward: 0,
  /** Sole origins along the figure: a staggered step back (or a stumble forward) as the knees go, drawn in to stand up. */
  buckleFootZ: -0.06, buckleFootZForward: 0.07, risenFootZ: -0.06, risenFootZForward: 0.05,
  /** Knees buckle outward as well as forward when the rider is in front (bend-plane share, 0 = straight ahead). */
  kneeSplay: 1.0,
  /** Torso pitch, radians (negative leans back), and the head's protective curl on top of it. */
  buckleLean: -0.08, buckleLeanForward: 0.24, sitLean: -0.15, sitLeanForward: -0.07, pushLean: 0.30,
  buckleCurl: -0.18, buckleCurlForward: 0.10, sitCurl: 0.30, risenCurl: -0.10,
  /** Sole origins in the sit: forward of the stance (tucked in when the rider is in front) and a little wider. */
  stanceForward: 0.035, stanceOutward: POPULATION_MODEL.footOutward, tuckForward: 0.10, tuckForwardForward: 0.19,
  tuckOutward: 0.13,
  /** Wrists planted on the ground behind (or beside) the hips, and brushing the seat on the way up. */
  plantOutward: 0.22, plantHeight: 0.13, plantBehind: 0.10, plantBehindForward: 0.04,
  brushOutward: 0.17, brushDrop: 0.10, brushBehind: 0.16, brushPats: 3, brushPatMetres: 0.035,
  /** The arms flung up as the knees go (the flinch's own reach), farther forward in a stumble, hands in toward the face. */
  armsUpMetres: 0.30, armsForwardMetres: 0.14, armsForwardForward: 0.20, armsInOutward: 0.17,
  /** Sideways lurch away from a rider who hit from the side, metres, over this share of the phase. */
  sideAwayMetres: 0.07, sideAwayShare: 0.06,
  /** Hand tips never below the ground plane, model metres. */
  handFloor: 0.02,
});
interface KnockdownFrame {
  hipY: number; hipZ: number; lean: number; curl: number;
  /** Sole origins along the figure, metres, and the knees' outward bend share. */
  footZ: number; splay: number;
  /** Sideways shift of the whole figure away from the rider (model x), metres. */
  hipX: number;
  /** Feet from the stance to the sit's (0..1), and the sit's sole origins forward of the stance, metres. */
  tuck: number; tuckForward: number;
  /** The planted wrists' model z (behind or beside the sat hips), metres. */
  arms: number; armsForward: number; plant: number; plantZ: number; brush: number; brushPhase: number;
}
/**
 * The knock-down's channels at `phase` (0 and 1 are the standing pose) for a
 * fall toward `fallYaw` (radians from the person's own facing: 0 forward, a
 * hit from behind; ±π back, a hit from the front).
 */
function knockdownFrame(phase: number, fallYaw: number, out: KnockdownFrame): KnockdownFrame {
  const K = KNOCKDOWN, p = clamp(phase, 0, 1);
  // 0 for a fall straight forward, 1 straight back; the sideways share signed.
  const back = (1 - Math.cos(fallYaw)) / 2, across = Math.sin(fallYaw);
  const buckleHipZ = blendTo(K.buckleHipZForward, K.buckleHipZ, back), sitHipZ = blendTo(K.sitHipZForward, K.sitHipZ, back);
  const risenHipZ = blendTo(K.risenHipZForward, K.risenHipZ, back);
  const buckleFootZ = blendTo(K.buckleFootZForward, K.buckleFootZ, back), risenFootZ = blendTo(K.risenFootZForward, K.risenFootZ, back);
  const buckleLean = blendTo(K.buckleLeanForward, K.buckleLean, back), sitLean = blendTo(K.sitLeanForward, K.sitLean, back);
  const buckleCurl = blendTo(K.buckleCurlForward, K.buckleCurl, back);
  out.tuckForward = blendTo(K.tuckForwardForward, K.tuckForward, back);
  out.plantZ = sitHipZ - blendTo(K.plantBehindForward, K.plantBehind, back);
  out.armsForward = blendTo(K.armsForwardForward, K.armsForwardMetres, back);
  // A quick lurch away as the knees go (the rider lands then), back as they stand.
  const away = p < K.sideAwayShare ? ease(p / K.sideAwayShare) : p < K.pushEnd ? 1 : 1 - ease((p - K.pushEnd) / (1 - K.pushEnd));
  out.hipX = across * K.sideAwayMetres * away;
  out.arms = 0; out.plant = 0; out.brush = 0; out.brushPhase = 0;
  if (p < K.buckleEnd) {
    const t = ease(p / K.buckleEnd);
    out.hipY = blendTo(K.standHipY, K.buckleHipY, t); out.hipZ = blendTo(0, buckleHipZ, t);
    out.lean = blendTo(0, buckleLean, t); out.curl = blendTo(0, buckleCurl, t); out.tuck = 0; out.arms = t;
    out.footZ = blendTo(K.stanceForward, buckleFootZ, t);
  } else if (p < K.dropEnd) {
    // The drop accelerates like a fall; everything else eases into the sit,
    // the feet sliding out in front once the seat is nearly down.
    const t = (p - K.buckleEnd) / (K.dropEnd - K.buckleEnd), e = ease(t);
    out.hipY = blendTo(K.buckleHipY, K.sitHipY, t * t); out.hipZ = blendTo(buckleHipZ, sitHipZ, e);
    out.lean = blendTo(buckleLean, sitLean, e); out.curl = blendTo(buckleCurl, K.sitCurl, e);
    out.tuck = e; out.arms = 1 - e; out.plant = e; out.footZ = blendTo(buckleFootZ, out.tuckForward, e * e * e);
  } else if (p < K.sitEnd) {
    const t = (p - K.dropEnd) / K.bounceShare;
    out.hipY = K.sitHipY + (t < 1 ? K.bounceMetres * Math.sin(Math.PI * t) : 0);
    out.hipZ = sitHipZ; out.lean = sitLean; out.curl = K.sitCurl; out.tuck = 1; out.plant = 1; out.footZ = out.tuckForward;
  } else if (p < K.pushEnd) {
    const t = ease((p - K.sitEnd) / (K.pushEnd - K.sitEnd)), early = ease((p - K.sitEnd) / ((K.pushEnd - K.sitEnd) * 0.6));
    out.hipY = blendTo(K.sitHipY, K.risenHipY, t); out.hipZ = blendTo(sitHipZ, risenHipZ, t);
    out.lean = blendTo(sitLean, K.pushLean, t); out.curl = blendTo(K.sitCurl, K.risenCurl, t);
    // The feet are drawn in under the hips as they rise.
    out.tuck = 1; out.plant = 1 - early; out.footZ = blendTo(out.tuckForward, risenFootZ, t);
  } else {
    const u = (p - K.pushEnd) / (1 - K.pushEnd), t = ease(u);
    out.hipY = blendTo(K.risenHipY, K.standHipY, t); out.hipZ = blendTo(risenHipZ, 0, t);
    out.lean = blendTo(K.pushLean, 0, t); out.curl = blendTo(K.risenCurl, 0, t);
    // The brush is over before the last fifth, so the reaction ends standing still.
    out.tuck = 1 - t; out.brush = u < 0.8 ? Math.sin(Math.PI * u / 0.8) : 0; out.brushPhase = u / 0.8;
    out.footZ = blendTo(risenFootZ, K.stanceForward, t);
  }
  // Half down, a folded leg's knee must stand out level from the hip: when
  // the rider is in front it goes out to the sides as much as forward.
  out.splay = K.kneeSplay * back * Math.sin(Math.PI * clamp((K.standHipY - out.hipY) / (K.standHipY - K.sitHipY), 0, 1));
  return out;
}

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
    // The shirt's lower rim clears the pelvis instead of intersecting its
    // facets at a grazing angle (the old sawtooth waist).
    { y: 0, halfWidth: 0.176, halfDepth: 0.141, square: 3.0 },
    { y: 0.06, halfWidth: 0.176, halfDepth: 0.141, square: 3.2 },
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
    // Keep the hairline above the brows, and enclose the *faceted* skull
    // through its crown. The old rear offset exposed skin through the front.
    { y: 0, halfWidth: 0.120, halfDepth: 0.108, square: 2.2 },
    { y: 0.030, halfWidth: 0.114, halfDepth: 0.103, square: 2.1 },
    { y: 0.065, halfWidth: 0.095, halfDepth: 0.087, square: 2.0 },
    { y: 0.095, halfWidth: 0.032, halfDepth: 0.029, square: 2.0 },
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
      geometry.computeBoundingSphere();
      batch = { id, geometry, material: material(finish), casts, colours: [], slots: [], mesh: null, dirty: false };
      batches.set(id, batch);
    }
    return batch;
  };
  const slot = (batch: Batch, colour: number): Slot => {
    const index = batch.colours.length;
    batch.colours.push(colour);
    const entry = { batch, index, visibleForView: true };
    batch.slots.push(entry);
    return entry;
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
          casts: part.mesh.name === 'euc-tyre' || part.mesh.name === 'euc-shell', colours: [], slots: [], mesh: null, dirty: false };
        part.mesh.geometry.computeBoundingSphere();
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
      const visual: Visual = { spec, parts: {}, machine: [], slots: [],
        passenger: spec.kind === 'trafficVehicle' || (spec.kind === 'parkedVehicle' && spec.appearanceIndex % 2 !== 0),
        pose: createMutablePose(), pendingPose: createMutablePose(), visible: false, bounds: new THREE.Sphere() };
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
        p.mouth = humanPart('box', 'skin', 0x513f37);
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
    for (const visual of visuals) visual.slots.push(...Object.values(visual.parts), ...visual.machine.map(part => part.slot));
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
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
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
  const partBounds = new THREE.Sphere();
  const worldBounds = new THREE.Sphere();
  const viewFrustum = new THREE.Frustum(), shadowFrustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const updateBounds = (visual: Visual): void => {
    visual.bounds.makeEmpty();
    for (const slot of visual.slots) {
      slot.batch.mesh!.getMatrixAt(slot.index, matrix);
      partBounds.copy(slot.batch.geometry.boundingSphere!).applyMatrix4(matrix);
      visual.bounds.union(partBounds);
    }
  };
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
  const aim = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const footOrientation = new THREE.Quaternion();
  const pitchOrientation = new THREE.Quaternion();
  const localNormal = new THREE.Vector3();
  const previousById = new Map<string, PopulationRenderPose>();
  const currentById = new Map<string, PopulationRenderPose>();
  const knock: KnockdownFrame = { hipY: 0, hipZ: 0, lean: 0, curl: 0, footZ: 0, splay: 0, hipX: 0, tuck: 0, tuckForward: 0,
    arms: 0, armsForward: 0, plant: 0, plantZ: 0, brush: 0, brushPhase: 0 };

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
    forwardBend: number, out: THREE.Vector3, upBend = 0, outBend = 0): void => {
    axis.subVectors(b, a);
    const measured = axis.length();
    axis.multiplyScalar(1 / Math.max(measured, 1e-6));
    const span = clamp(measured, Math.abs(first - second) + 1e-5, first + second - 1e-5);
    const along = (first * first - second * second + span * span) / (2 * span);
    const bow = Math.sqrt(Math.max(0, first * first - along * along));
    // A knock-down's sit lays the hip-ankle line nearly level: the knees then
    // bend up as well as forward (M42). Upright legs keep the exact old plane.
    if (upBend !== 0 || outBend !== 0) bend.set(outBend, upBend, forwardBend)
      .addScaledVector(axis, -(axis.x * outBend + axis.y * upBend + axis.z * forwardBend)).normalize();
    else bend.set(0, 0, forwardBend).addScaledVector(axis, -axis.z * forwardBend).normalize();
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
    // M42: knocked down (a human rider crashed into them): they sit down hard
    // and get back up, inside their hull (KNOCKDOWN). NPC wheel riders never.
    const knocked = !riding && s.activity === 'impacted' && s.reaction === 'knockdown' && s.phase < 1;
    const k = knocked ? knockdownFrame(s.phase, s.fallYaw, knock) : null;
    const hull = visual.spec.hull;
    // The body keeps its own heading through any reaction: never a spin.
    const yaw = s.headingY;
    // The root never tilts, so on a slope the planted hands and their floor
    // follow the ground plane under the person: its model-frame height is
    // slopeX·x + slopeZ·z, from the pose normal (scale-corrected as the feet's
    // are). Exactly 0 on flat ground (M42 QA round 1, MINOR 3).
    let slopeX = 0, slopeZ = 0;
    if (k) {
      localNormal.set(s.normalX, s.normalY, s.normalZ).applyAxisAngle(up, -yaw);
      localNormal.set(localNormal.x * widthScale / heightScale, localNormal.y,
        localNormal.z * lengthScale / heightScale).normalize();
      if (localNormal.y > 0.5) { slopeX = -localNormal.x / localNormal.y; slopeZ = -localNormal.z / localNormal.y; }
    }
    // A bumped person flinches (VIS-CRASH-1, 2026-10-04): a quick lean and half
    // step back with the hands up, over in well under a second of the impact
    // pause. Feet stay planted; a seated person only leans and lifts the hands.
    const flinch = s.activity === 'impacted' && !knocked ? Math.sin(Math.PI * Math.sqrt(clamp(s.phase / 0.7, 0, 1))) : 0;
    // ...and staggers (M42): the hips shift and twist to one side and that arm
    // windmills, all inside the hull and gone by the same phase. The side is
    // the person's own, never a new fact from the simulation.
    const stagger = flinch > 0 && s.phase < 0.7 ? flinch : 0;
    const staggerSide = Math.abs(visual.spec.appearanceIndex) % 2 === 0 ? 1 : -1;
    // Knocked down from the side, the whole figure slides away from the rider instead.
    const shift = k ? k.hipX : stagger > 0 ? 0.05 * stagger * staggerSide : 0;
    const twist = stagger > 0 ? 0.16 * stagger * staggerSide : 0;
    const bob = targets.bobMetres;
    const pedal = riding ? POPULATION_MODEL.pedalHeight : 0;
    // Relaxed, speed-dependent riding crouch. No view clock or fake controller.
    const rideCrouch = riding ? 0.05 + Math.min(Math.abs(s.speed) / 6, 1) * 0.045 : 0;
    transform.position.set(s.x, s.y + pedal, s.z);
    transform.rotation.set(0, yaw, 0);
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
    // Knocked down on a slope, the seat rises with the ground under the
    // pelvis's widest ring (±0.17 × ±0.135 about the hip, its bottom 0.12
    // under it), only as far as needed: never on flat ground or once risen.
    const hipY = k ? k.hipY + Math.max(0, slopeX * k.hipX + slopeZ * k.hipZ + Math.abs(slopeX) * 0.17 + Math.abs(slopeZ) * 0.135 - (k.hipY - 0.12))
      : 0.95 - bob - rideCrouch + (targets.seatHeightLocalMetres + 0.12 - 0.95) * sitting;
    const hipZ = k ? k.hipZ : (riding ? 0.025 : jogging && moving ? 0.035 : 0) - 0.09 * sitting - 0.10 * flinch * (1 - sitting);
    // The knock-down leans the whole upper body about the waist (pitch only).
    const lean = k ? k.lean : 0, leanCos = Math.cos(lean), leanSin = Math.sin(lean);
    // Knockdown leg bend still follows the hips' descent, independent of clothing.
    const down = k ? clamp((KNOCKDOWN.standHipY - hipY) / (KNOCKDOWN.standHipY - KNOCKDOWN.sitHipY), 0, 1) : 0;
    write(p.pelvis, root, shift, hipY - 0.12, hipZ, 1, 1, 1, 0, twist * 0.5, 0);
    transform.position.set(shift, hipY + 0.025, hipZ);
    transform.rotation.set(k ? lean : (jogging && moving ? 0.07 : riding ? 0.055 : sitting * 0.045) - 0.08 * flinch,
      talk * 0.025 + twist, 0);
    transform.scale.set(1, 0.53, 1); transform.updateMatrix(); torsoMatrix.multiplyMatrices(root, transform.matrix);
    write(p.torso, torsoMatrix, 0, 0, 0);
    write(p.workBand, torsoMatrix, 0, 0.60, 0.132, 0.32, 0.045, 0.014);

    const neckY = hipY + 0.594;
    if (k) {
      // Neck and head ride the lean from the waist; the chin tucks (the protective curl).
      write(p.neck, root, shift, hipY + 0.025 + 0.554 * leanCos - 0.002 * leanSin, hipZ + 0.554 * leanSin + 0.002 * leanCos,
        0.059, 0.060, 0.055);
      transform.position.set(shift, hipY + 0.025 + 0.585 * leanCos - 0.014 * leanSin, hipZ + 0.585 * leanSin + 0.014 * leanCos);
      transform.rotation.set(-0.025 + lean + k.curl, 0, 0);
    } else {
      write(p.neck, root, shift, neckY - 0.015, hipZ + 0.002 - 0.04 * flinch, 0.059, 0.060, 0.055);
      transform.position.set(shift, hipY + 0.610, hipZ + 0.014 - 0.045 * flinch);
      transform.rotation.set(-0.025 - 0.18 * flinch, talk * 0.16 + twist * 0.6, 0);
    }
    transform.scale.setScalar(1);
    transform.updateMatrix(); headMatrix.multiplyMatrices(root, transform.matrix);
    write(p.head, headMatrix, 0, 0, 0);
    write(p.hair, headMatrix, 0, 0.19, 0, 1, 1, 1);
    write(p.brim, headMatrix, 0, 0.192, 0.019, 1.63, 0.25, 1.0);
    write(p.nose, headMatrix, 0, 0.095, 0.095);
    // The previous line's front was inside the jaw. Retain the same box and
    // batch, placing its dark front just outside the actual faceted face.
    write(p.mouth, headMatrix, 0, 0.061, 0.098, 0.059, 0.008, 0.012);
    for (const sign of [1, -1]) {
      const side = sign > 0 ? 'l' : 'r';
      write(p[`${side}-eye`], headMatrix, sign * 0.041, 0.153, 0.093, 0.011, 0.010, 0.009);
      write(p[`${side}-brow`], headMatrix, sign * 0.041, 0.178, 0.088, 0.045, 0.010, 0.012, 0, 0, sign * -0.04);
      write(p[`${side}-ear`], headMatrix, sign * 0.112, 0.129, -0.006, 0.022, 0.034, 0.023);
      // Terrain samples come from simulation at these exact shared targets.
      // Pedal targets instead come from the existing machine's transformed art.
      const index = sign > 0 ? 0 : 1, target = targets.feet![index]!;
      const support = riding ? null : s.footSupports[index]!;
      foot.set(support?.x ?? target.x, (support?.y ?? target.y) + target.liftMetres,
        support?.z ?? target.z).applyMatrix4(inverseRoot);
      // Knocked down, the feet keep their planted heights but slide forward of
      // the sit, in front of the pelvis along the person's own facing
      // (render-only): a leg folded under the pelvis reads as an injury, not
      // as comic.
      if (k) {
        const fromX = foot.x, fromZ = foot.z;
        foot.x = sign * blendTo(KNOCKDOWN.stanceOutward, KNOCKDOWN.tuckOutward, k.tuck) + shift;
        foot.z = k.footZ;
        // ...along the ground plane under them, so on a slope a sole never sinks or floats.
        foot.y += slopeX * (foot.x - fromX) + slopeZ * (foot.z - fromZ);
      }
      localNormal.set(support?.normalX ?? s.normalX, support?.normalY ?? s.normalY,
        support?.normalZ ?? s.normalZ).applyAxisAngle(up, -yaw).normalize();
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
      hip.set(sign * 0.123 + shift, hipY, hipZ);
      // Sat with the hip-ankle line nearly level, the knees come up, not out;
      // half down with the rider in front, they splay (never toward a rider
      // who came from that side).
      const towardRider = k ? -sign * Math.sin(s.fallYaw) : 0;
      joint(hip, ankle, 0.465, 0.455, 1, knee,
        down * 1.5, k ? sign * k.splay * (towardRider > 0 ? 1 - Math.abs(Math.sin(s.fallYaw)) : 1) : 0);
      // A compact arcade contact hull is not a licence for knees to escape it.
      // Preserve the connected solve while limiting flexion inside the model.
      knee.z = clamp(knee.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.082,
        visual.spec.hull.halfLengthMetres / lengthScale - 0.082);
      if (k) knee.x = clamp(knee.x, -hull.halfWidthMetres / widthScale + 0.082, hull.halfWidthMetres / widthScale - 0.082);
      directed(p[`${side}-thigh`]!, root, hip, knee);
      directed(p[`${side}-shin`]!, root, knee, ankle);

      if (k) {
        // The shoulder rides the waist's lean.
        shoulder.set(sign * 0.221 + shift, hipY + 0.025 + 0.455 * leanCos - 0.012 * leanSin, hipZ + 0.455 * leanSin + 0.012 * leanCos);
      } else {
        shoulder.set(sign * 0.221, hipY + 0.48, hipZ + 0.012 - 0.035 * flinch);
        if (twist !== 0) {
          // Turned with the twisting torso about its own upright axis.
          const dx = shoulder.x, dz = shoulder.z - hipZ, cos = Math.cos(twist), sin = Math.sin(twist);
          shoulder.x = dx * cos + dz * sin + shift; shoulder.z = hipZ - dx * sin + dz * cos;
        }
      }
      const armSwing = moving ? swing * sign : 0;
      wrist.set(sign * (riding ? 0.247 : 0.255) + shift, hipY + 0.065,
        hipZ + 0.07 - armSwing * (jogging ? 0.24 : 0.20));
      if (jogging && moving) wrist.y += 0.16;
      if (s.activity === 'social' && sign > 0) {
        wrist.y += 0.08 + Math.max(0, talk) * 0.13;
        wrist.z += 0.10 + talk * 0.04;
      }
      if (s.activity === 'working') {
        wrist.set(sign * 0.10, hipY + 0.17 + (sign > 0 ? 0.045 * reach : 0), 0.255 + reach * 0.015);
      }
      if (sitting > 0 && !k) wrist.lerp(foot.set(sign * 0.16, hipY + 0.16 + Math.max(0, talk) * 0.045,
        hipZ + 0.22), sitting);
      if (riding) { wrist.y += 0.075; wrist.z += 0.025; }
      if (flinch > 0) { wrist.y += 0.30 * flinch; wrist.z += 0.14 * flinch; }
      if (stagger > 0 && sign === staggerSide) {
        // One arm windmills a turn and a quarter below the raised hand while
        // the flinch plays: never up level with its shoulder, where the
        // elbow's bend plane is undefined.
        const turn = TAU * 1.25 * s.phase / 0.7;
        wrist.y += 0.12 * stagger * (Math.sin(turn) - 1); wrist.z += 0.12 * stagger * Math.cos(turn);
      }
      if (k) {
        // Flung up (and forward in a stumble) as the knees go, planted on the
        // ground behind or beside the sit, then brushing off the seat of the
        // trousers on the way up.
        const K = KNOCKDOWN;
        wrist.set(sign * blendTo(0.255, K.armsInOutward, k.arms) + shift, hipY + 0.065 + K.armsUpMetres * k.arms,
          hipZ + 0.07 + k.armsForward * k.arms);
        if (k.plant > 0) {
          const plantX = sign * K.plantOutward + shift, plantZ = k.plantZ;
          wrist.lerp(aim.set(plantX, K.plantHeight + slopeX * plantX + slopeZ * plantZ, plantZ), k.plant);
        }
        if (k.brush > 0) wrist.lerp(aim.set(sign * K.brushOutward + shift,
          hipY - K.brushDrop + K.brushPatMetres * Math.sin(TAU * K.brushPats * k.brushPhase), hipZ - K.brushBehind), k.brush);
      }
      // Elbows flex behind the shoulder-wrist chord; knees use the opposite plane.
      joint(shoulder, wrist, 0.295, 0.28, -1, elbow);
      elbow.z = Math.max(elbow.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.095);
      if (k) {
        elbow.z = Math.min(elbow.z, hull.halfLengthMetres / lengthScale - 0.095);
        elbow.x = clamp(elbow.x, -hull.halfWidthMetres / widthScale + 0.095, hull.halfWidthMetres / widthScale - 0.095);
      }
      directed(p[`${side}-upper-arm`]!, root, shoulder, elbow);
      directed(p[`${side}-forearm`]!, root, elbow, wrist);
      // Hands point along the forearm without being a detached ball at its end.
      delta.subVectors(wrist, elbow).normalize().multiplyScalar(0.12).add(wrist);
      delta.z = clamp(delta.z, -visual.spec.hull.halfLengthMetres / lengthScale + 0.046,
        visual.spec.hull.halfLengthMetres / lengthScale - 0.046);
      if (k) {
        // A planted hand rests on the ground, never through it.
        delta.x = clamp(delta.x, -hull.halfWidthMetres / widthScale + 0.046, hull.halfWidthMetres / widthScale - 0.046);
        delta.y = Math.max(delta.y, KNOCKDOWN.handFloor + slopeX * delta.x + slopeZ * delta.z);
      }
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
      // A stagger escalated to a knock-down (M42) is a new reaction: its phase starts afresh.
      s.reaction = b.impactReaction ?? 'none'; s.fallYaw = b.impactFallYaw ?? 0;
      const sameActivity = b.activity === a.activity && (a.impactReaction ?? 'none') === s.reaction;
      const phaseDelta = b.activityPhase - a.activityPhase;
      s.phase = sameActivity
        ? fraction(a.activityPhase + (phaseDelta < -0.5 ? phaseDelta + 1 : phaseDelta > 0.5 ? phaseDelta - 1 : phaseDelta) * alpha)
        : b.activityPhase;
      s.blend = sameActivity ? mix(a.activityBlend, b.activityBlend) : b.activityBlend;
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
      updateBounds(visual);
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
    prepareView(camera, shadowCamera) {
      if (disposed) return;
      group.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      viewFrustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
      if (shadowCamera) {
        shadowCamera.updateMatrixWorld(true);
        projection.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
        shadowFrustum.setFromProjectionMatrix(projection, shadowCamera.coordinateSystem, shadowCamera.reversedDepth);
      }
      for (const visual of visuals) {
        worldBounds.copy(visual.bounds).applyMatrix4(group.matrixWorld);
        const visible = visual.visible && (viewFrustum.intersectsSphere(worldBounds)
          || !!shadowCamera && shadowFrustum.intersectsSphere(worldBounds));
        for (const part of visual.slots) part.visibleForView = visible;
      }
      for (const batch of batches.values()) compactVisibleInstances(batch.mesh!, batch.slots);
    },
    restoreView() { for (const batch of batches.values()) batch.mesh!.count = batch.slots.length; },
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
