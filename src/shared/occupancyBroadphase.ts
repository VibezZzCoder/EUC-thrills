/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Cheap coefficient-derived broadphase only. These boxes never become contact shapes. */
import type { RiderOccupancyCoefficients, RiderOccupancyIntervalInput, RiderOccupancyPose } from './riderOccupancy.ts';
import type { Aabb } from './occupancyExpressions.ts';

const magnitude = (a: number, b: number) => Math.max(Math.abs(a), Math.abs(b));
const cornerNorm = (b: RiderOccupancyCoefficients['torso']) => Math.hypot(magnitude(b.minX, b.maxX), magnitude(b.minY, b.maxY), magnitude(b.minZ, b.maxZ));
const poseMagnitude = (input: RiderOccupancyIntervalInput, key: Exclude<keyof RiderOccupancyPose, 'ragdoll'>) => magnitude(input.previous[key], input.current[key]);
function aroundBase(input: RiderOccupancyIntervalInput, radius: number): Aabb {
  // Each local coordinate of every primitive lies in [-radius,+radius]. The
  // helper's prism corners can combine different primitive extrema. A heading
  // rotation of that square has horizontal support <=sqrt(2)*radius.
  const horizontal = Math.SQRT2 * radius, a = input.previous, b = input.current;
  const result = { minX: Math.min(a.x, b.x) - horizontal, maxX: Math.max(a.x, b.x) + horizontal,
    minY: Math.min(a.y, b.y) - radius, maxY: Math.max(a.y, b.y) + radius,
    minZ: Math.min(a.z, b.z) - horizontal, maxZ: Math.max(a.z, b.z) + horizontal };
  if (!Object.values(result).every(Number.isFinite)) throw new RangeError('Non-finite occupancy broadphase');
  return result;
}
export function coarseWheelWorldAabb(input: RiderOccupancyIntervalInput): Aabb {
  const radius = poseMagnitude(input, 'wheelCrashPop') + Math.max(cornerNorm(input.coefficients.wheelTyre),
    poseMagnitude(input, 'suspensionOffset') + cornerNorm(input.coefficients.wheelBody));
  return aroundBase(input, radius);
}
export function coarseMountedHumanWorldAabb(input: RiderOccupancyIntervalInput): Aabb {
  if (input.previous.ragdollBlend > 0 || input.current.ragdollBlend > 0) throw new RangeError('Mounted broadphase rejects active rag');
  const k = input.coefficients, a = k.stance;
  if (!(a.carveReactionFullRoll > 0 && a.loadReactionFullPitch > 0)) throw new RangeError('Positive reaction denominators required');
  for (const value of [a.thighLength, a.shinLength, a.upperArmLength, a.forearmLength, k.legRadius, k.armRadius, k.handRadius])
    if (!(Number.isFinite(value) && value >= 0)) throw new RangeError('Nonnegative physical lengths/radii required');
  const suspension = poseMagnitude(input, 'suspensionOffset'), shift = Math.max(Math.abs(a.accelHipShiftMax), Math.abs(a.brakeHipShiftMax));
  const squat = Math.max(Math.abs(a.squatMax), Math.abs(a.carveSquatMax) + Math.abs(a.accelSquatMax) + Math.abs(a.brakeSquatMax)
    + Math.abs(a.crouchHipDrop) + Math.abs(a.tuckHipDrop) + Math.abs(a.attackHipDrop)
    + Math.abs(a.wobbleHipDrop) * Math.max(1, Math.abs(1 + k.motion.staggerHips)) + Math.abs(a.reverseSquat));
  const pelvis = Math.hypot(Math.abs(a.restHipShift), Math.max(Math.abs(k.hipHeight) + squat, Math.abs(a.restHipHeight)), shift + Math.abs(a.attackHipShift));
  const hip = Math.hypot(Math.abs(a.torsoWidth * .26) + Math.abs(a.restHipShift),
    Math.max(Math.abs(k.hipHeight) + squat + Math.max(Math.abs(a.carveInsideHipDropMax), Math.abs(a.technicalTurnOutsideHipDropMax)), Math.abs(a.restHipHeight)), shift);
  const pedal = Math.hypot(a.stanceHalfWidth, k.pedalHeight + a.ankleAbovePedal);
  const foot = Math.hypot(Math.max(pedal, Math.abs(a.crashFootOutboard), Math.abs(a.restFootOutboard)),
    Math.max(pedal + Math.abs(a.pedalStrikeFootLift), Math.abs(a.ankleAbovePedal) + suspension),
    Math.max(pedal + Math.abs(a.wobbleFootAdjust), Math.abs(a.restFootBack)));
  const freed = Math.max(foot, pedal + Math.hypot(a.oneFootOutboard, a.oneFootRise, a.oneFootTrail));
  const splay = Math.abs(a.armLoadSplay) + Math.max(Math.abs(a.armCarveInsideTuck), Math.abs(a.armCarveOutsideSplay)) + Math.abs(a.airArmSplay)
    + Math.abs(a.wobbleArmSplay) * Math.max(1, Math.abs(1 + k.motion.staggerArms)) + Math.abs(a.crashArmSplay) + Math.abs(k.motion.swayArmSplay)
    + Math.abs(a.tuckArmSplay) + Math.abs(a.attackArmSplay) + Math.abs(a.carveStanceOutsideSplay) + Math.abs(a.reverseArmSplay);
  const forward = Math.max(Math.abs(a.armBrakeForward), Math.abs(a.armAccelBack)) + Math.abs(a.tuckArmBack) + Math.abs(a.attackArmBack)
    + Math.max(Math.abs(a.carveStanceInsideBack), Math.abs(a.carveStanceOutsideForward)) + Math.abs(k.motion.swayArmSwing);
  const rise = Math.abs(a.armCarveOutsideRise) + Math.abs(a.airArmRise) + Math.abs(a.wobbleArmRise) * Math.max(1, Math.abs(1 + k.motion.staggerArms))
    + Math.abs(a.tuckArmDrop) + Math.abs(a.attackArmDrop) + Math.max(Math.abs(a.carveStanceInsideRise), Math.abs(a.carveStanceOutsideDrop)) + Math.abs(a.crashArmRise);
  const hand = Math.hypot(Math.abs(a.shoulderHalfWidth) + Math.abs(a.armSplay) + Math.abs(a.armAsymmetrySplay) + magnitude(k.carriage.minSplay, k.carriage.maxSplay) + splay,
    Math.abs(a.torsoLength - (a.upperArmLength + a.forearmLength) * a.armHangFraction) + magnitude(k.carriage.minRise, k.carriage.maxRise) + rise,
    Math.abs(a.handForward) + Math.abs(a.armAsymmetryForward) + forward);
  const shoulder = Math.hypot(a.shoulderHalfWidth, a.torsoLength), distal = Math.max(k.handRadius,
    Math.hypot(magnitude(k.handCarry.axialFrom, k.handCarry.axialTo), k.handCarry.radial));
  // A contact core's head sphere, and its lens spheres, whose far side can sit
  // up to sqrt(upper * lower) past the joint's own bone (2026-10-04).
  const lens = k.tightLimbs ? Math.max(hip + a.thighLength + Math.sqrt(a.thighLength * a.shinLength) + k.legRadius,
    pelvis + shoulder + a.upperArmLength + Math.sqrt(a.upperArmLength * a.forearmLength) + k.armRadius) : 0;
  const local = Math.max(pelvis + cornerNorm(k.torso), hip + a.thighLength + a.shinLength + k.legRadius,
    freed + Math.max(k.legRadius, cornerNorm(k.boot)), pelvis + Math.max(shoulder + a.upperArmLength + a.forearmLength + distal, hand + distal),
    k.head ? pelvis + Math.hypot(k.head.y, k.head.z) + k.head.radius : 0, lens);
  const root = Math.max(...[input.previous, input.current].map(p => Math.hypot(p.crashLateral, p.suspensionOffset - p.crashDrop, p.crashForward)));
  // Euler quaternion rotations preserve Euclidean norm; heading-frame bounds
  // enclose the exact native coefficients and any enabled folded spheres.
  return aroundBase(input, root + local);
}
export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}
export interface LazyCoarseComponent<T> {
  readonly ownerId: string; readonly componentId: string; readonly stopGroupId: string;
  /** Proven full fixed-step footprint box, including every chronological stopped prefix. */
  readonly coarseWorldAabb: Aabb;
  /** Called only for an admitted stop group. */
  readonly createCertificate: () => T;
}
export interface CoarseActor { readonly ownerId: string; readonly coarseWorldAabb: Aabb }
/** Admit complete stop groups so held sibling output never silently resumes. */
export function admitCoarseStopGroups<T>(components: readonly LazyCoarseComponent<T>[], actors: readonly CoarseActor[]): {
  admitted: { source: LazyCoarseComponent<T>; certificate: T }[]; omitted: readonly LazyCoarseComponent<T>[];
} {
  const groups = new Set<string>();
  for (const component of components) for (const actor of actors) if (actor.ownerId !== component.ownerId && aabbsOverlap(component.coarseWorldAabb, actor.coarseWorldAabb))
    groups.add(`${component.ownerId}/${component.stopGroupId}`);
  const admitted: { source: LazyCoarseComponent<T>; certificate: T }[] = [], omitted: LazyCoarseComponent<T>[] = [];
  for (const source of components) {
    if (groups.has(`${source.ownerId}/${source.stopGroupId}`)) admitted.push({ source, certificate: source.createCertificate() });
    else omitted.push(source);
  }
  return { admitted, omitted };
}

/** Pure conservative actor admission boxes; actor collision geometry remains native. */
import type { PopulationHullPrism } from './populationHull.ts';
export function coarseActorMotionWorldAabb(a: PopulationHullPrism, b: PopulationHullPrism): Aabb {
  if (a.sourceHull && b.sourceHull) {
    const first = a.sourceHull, last = b.sourceHull;
    const localRadius = Math.hypot(Math.max(first.hull.halfWidthMetres, last.hull.halfWidthMetres),
      Math.max(first.hull.halfLengthMetres, last.hull.halfLengthMetres), Math.max(first.hull.heightMetres, last.hull.heightMetres));
    // A grade transform is a unit rotation. Its heading-frame prism may
    // combine corners of different sources, hence sqrt(2) horizontal support.
    const margin = Math.max(first.marginMetres ?? 0, last.marginMetres ?? 0), horizontal = Math.SQRT2 * (localRadius + margin);
    const below = Math.max(first.verticalPaddingBelowMetres ?? 0, last.verticalPaddingBelowMetres ?? 0), above = Math.max(first.verticalPaddingAboveMetres ?? 0, last.verticalPaddingAboveMetres ?? 0);
    return { minX: Math.min(first.x, last.x) - horizontal, maxX: Math.max(first.x, last.x) + horizontal,
      minY: Math.min(first.y, last.y) - localRadius - below - margin, maxY: Math.max(first.y, last.y) + localRadius + above + margin,
      minZ: Math.min(first.z, last.z) - horizontal, maxZ: Math.max(first.z, last.z) + horizontal };
  }
  const radius = Math.max(Math.hypot(a.halfWidthMetres, a.halfLengthMetres), Math.hypot(b.halfWidthMetres, b.halfLengthMetres));
  return { minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius, minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
    minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius };
}
