/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Plain anatomical/contact arithmetic shared by simulation sampling and rendering.
 * No world, options, renderer, clock or sampler is owned here. Distances are metres.
 */
export interface PopulationGroundSupport {
  readonly x: number; readonly y: number; readonly z: number;
  readonly normalX: number; readonly normalY: number; readonly normalZ: number;
}
export interface PopulationSupportInput {
  readonly kind: string; readonly appearanceIndex: number;
  readonly x: number; readonly y: number; readonly z: number; readonly headingY: number;
  readonly speedMetresPerSecond: number; readonly gaitDistanceMetres: number; readonly activity: string;
  readonly groundNormalX: number; readonly groundNormalY: number; readonly groundNormalZ: number;
  readonly hull: { readonly halfWidthMetres: number; readonly halfLengthMetres: number; readonly heightMetres: number };
  /** Seated expression requires a real authored seat at this actor origin/heading. */
  readonly posture?: 'standing' | 'seated';
  readonly sittingBlend?: number;
  /** Authored seat cushion height above the actor's sampled ground origin. */
  readonly seatHeightMetres?: number;
}
export interface PopulationSupportTarget {
  readonly x: number; readonly y: number; readonly z: number;
  readonly localX: number; readonly localY: number; readonly localZ: number;
  readonly liftMetres: number; readonly pitchRadians: number;
  readonly contact: 'ground' | 'pedal';
  readonly radiusMetres: number;
}
export interface PopulationSupportTargets {
  /** Left/right, +X is left. Human targets are sole origins, not ankle centres. */
  readonly feet: readonly [PopulationSupportTarget, PopulationSupportTarget] | null;
  /** Left-front, left-rear, right-front, right-rear. Targets are tyre tread contact points. */
  readonly tyres: readonly [PopulationSupportTarget, PopulationSupportTarget, PopulationSupportTarget, PopulationSupportTarget] | null;
  readonly widthScale: number; readonly heightScale: number; readonly lengthScale: number;
  readonly phase: number; readonly bobMetres: number; readonly moving: boolean; readonly sittingBlend: number;
  readonly seatHeightLocalMetres: number;
}
/** Local model dimensions, shared with geometry/tests; these do not tune movement physics.
 * Pedal/stance dimensions must match the existing standard EUC's actual modelling metres.
 */
export const POPULATION_MODEL = Object.freeze({
  adultHeight: 1.9, adultHalfWidth: 0.42, adultHalfLength: 0.42,
  footHalfWidth: 0.088, footHalfDepth: 0.145, footForwardOffset: 0.018,
  footOutward: 0.116, seatedFootOutward: 0.14, seatedFootForward: 0.22,
  ankleHeight: 0.085, ankleRearward: -0.024,
  pedalHeight: 0.16, pedalHalfStance: 0.185,
  walkerStepExtent: 0.47, walkerStanceShare: 0.62, walkerSwingHeight: 0.105,
  joggerStepExtent: 0.50, joggerStanceShare: 0.43, joggerSwingHeight: 0.17,
  swingPitch: -0.24,
  tyreOutwardShare: 0.87, tyreAxleShare: 0.62, tyreWidthShare: 0.18,
  rimOutwardShare: 0.964, rimWidthShare: 0.025,
  tyreHeightRadiusShare: 0.132, tyreLengthRadiusShare: 0.16,
});
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
const fract = (n: number): number => n - Math.floor(n);
const smooth = (n: number): number => n * n * (3 - 2 * n);

/** Same up-to-normal * yaw transform as populationHull and the render chassis. */
export function populationGradePoint(input: Pick<PopulationSupportInput, 'x' | 'y' | 'z' | 'headingY'
  | 'groundNormalX' | 'groundNormalY' | 'groundNormalZ'>, localX: number, localY: number, localZ: number):
  Readonly<{ x: number; y: number; z: number }> {
  const length = Math.hypot(input.groundNormalX, input.groundNormalY, input.groundNormalZ);
  const valid = Number.isFinite(length) && length > 0 && input.groundNormalY > 0;
  const nx = valid ? input.groundNormalX / length : 0;
  const ny = valid ? input.groundNormalY / length : 1;
  const nz = valid ? input.groundNormalZ / length : 0;
  const denominator = 1 + ny, c = Math.cos(input.headingY), s = Math.sin(input.headingY);
  const yawX = c * localX + s * localZ, yawZ = -s * localX + c * localZ;
  return {
    x: input.x + (1 - nx * nx / denominator) * yawX + nx * localY - nx * nz / denominator * yawZ,
    y: input.y - nx * yawX + ny * localY - nz * yawZ,
    z: input.z - nx * nz / denominator * yawX + nz * localY + (1 - nz * nz / denominator) * yawZ,
  };
}

/** Call in makePose, sample finished ground at each ground target x/z, and publish
 * those samples. Renderer consumes the same targets plus samples; it never samples ground.
 * A swing target's lift is deliberately separate from the queried ground location.
 */
export function populationSupportTargets(input: PopulationSupportInput): PopulationSupportTargets {
  const m = POPULATION_MODEL;
  const vehicle = input.kind.endsWith('Vehicle');
  const riding = input.kind === 'fictionalEuc', jogging = input.kind === 'jogger';
  const pedal = riding ? m.pedalHeight : 0;
  const widthScale = Math.min(1, input.hull.halfWidthMetres / m.adultHalfWidth);
  const heightScale = (input.hull.heightMetres - pedal) / m.adultHeight;
  const lengthScale = Math.min(1, input.hull.halfLengthMetres / m.adultHalfLength);
  const sittingBlend = input.posture === 'seated' && Number.isFinite(input.seatHeightMetres)
    && input.seatHeightMetres! > 0 && input.seatHeightMetres! / heightScale <= 0.83
    ? clamp(input.sittingBlend ?? 1, 0, 1) : 0;
  const moving = !riding && sittingBlend === 0 && ['walking', 'jogging'].includes(input.activity)
    && Math.abs(input.speedMetresPerSecond) > 0.03;
  const stanceShare = jogging ? m.joggerStanceShare : m.walkerStanceShare;
  const extent = jogging ? m.joggerStepExtent : m.walkerStepExtent;
  const phase = fract(input.gaitDistanceMetres / (extent / stanceShare) + fract(input.appearanceIndex / 11));
  const bobMetres = moving ? (jogging ? 0.045 : 0.018) * (0.5 - 0.5 * Math.cos(phase * Math.PI * 4)) : 0;
  const common = { widthScale, heightScale, lengthScale, phase, bobMetres, moving, sittingBlend,
    seatHeightLocalMetres: sittingBlend > 0 ? input.seatHeightMetres! / heightScale : 0 };
  if (vehicle) {
    const w = input.hull.halfWidthMetres, l = input.hull.halfLengthMetres;
    const radiusMetres = Math.min(input.hull.heightMetres * m.tyreHeightRadiusShare, l * m.tyreLengthRadiusShare);
    const tyre = (sign: number, front: number): PopulationSupportTarget => {
      const localX = sign * m.tyreOutwardShare * w, localZ = front * m.tyreAxleShare * l;
      return { ...populationGradePoint(input, localX, 0, localZ), localX, localY: 0, localZ,
        liftMetres: 0, pitchRadians: 0, contact: 'ground', radiusMetres };
    };
    return { ...common, feet: null, tyres: [tyre(1, 1), tyre(1, -1), tyre(-1, 1), tyre(-1, -1)] };
  }
  const foot = (sign: number): PopulationSupportTarget => {
    let localX = sign * m.footOutward, localZ = 0.035, lift = 0, pitchRadians = 0;
    if (moving) {
      const f = fract(phase + (sign < 0 ? 0.5 : 0));
      if (f < stanceShare) localZ = extent * (0.5 - f / stanceShare);
      else {
        const t = (f - stanceShare) / (1 - stanceShare);
        localZ = extent * (-0.5 + smooth(t));
        pitchRadians = m.swingPitch * Math.sin(t * Math.PI);
        lift = Math.sin(t * Math.PI) * (jogging ? m.joggerSwingHeight : m.walkerSwingHeight)
          + Math.abs(Math.sin(pitchRadians)) * (m.footHalfDepth + m.footForwardOffset);
      }
    }
    localX += (sign * m.seatedFootOutward - localX) * sittingBlend;
    localZ += (m.seatedFootForward - localZ) * sittingBlend;
    if (riding) {
      const localX = sign * m.pedalHalfStance;
      return { ...populationGradePoint(input, localX, m.pedalHeight, 0), localX, localY: m.pedalHeight, localZ: 0,
        liftMetres: 0, pitchRadians: 0, contact: 'pedal', radiusMetres: 0 };
    }
    const c = Math.cos(input.headingY), s = Math.sin(input.headingY);
    return { x: input.x + c * localX * widthScale + s * localZ * lengthScale, y: input.y,
      z: input.z - s * localX * widthScale + c * localZ * lengthScale,
      localX, localY: 0, localZ, liftMetres: lift * heightScale, pitchRadians, contact: 'ground', radiusMetres: 0 };
  };
  return { ...common, feet: [foot(1), foot(-1)], tyres: null };
}
