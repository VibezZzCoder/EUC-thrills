/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Root supplies the visual constants from its street-life tuning table. */
export interface ProtectedActivityTuning {
  /** Total lateral travel, metres: 0.6 means endpoints at -0.3 and +0.3. */
  readonly travelMetres: number;
  /** One endpoint-to-endpoint traversal, excluding turns and idle, seconds. */
  readonly walkSeconds: number;
  /** A quarter-turn at departure and arrival, seconds per turn. */
  readonly turnSeconds: number;
  /** Counter-facing pause at each endpoint after arrival, seconds. */
  readonly idleSeconds: number;
  /** Full alternating foot cycles during one traversal, a positive integer. */
  readonly strideCyclesPerLeg: number;
}

export interface ProtectedActivityPose {
  /** Lateral displacement from the worker's authored resting position, metres. */
  offsetX: number;
  /** Relative to the counter-facing idle pose, radians; bounded to ±π/2. */
  yaw: number;
  /** Normalized alternating foot displacement; the opposite foot takes -stride. */
  stride: number;
  /** Normalized arm displacement, opposite the same side's foot. */
  armSwing: number;
  /** Smooth 0..1 walk blend proportional to the traversal's eased speed. */
  walking: number;
  /** Brief counter-facing hand reach during endpoint idle; zero during travel. */
  service: number;
}

/** A quintic ease gives zero velocity and acceleration at both endpoints. */
function ease(t: number): number {
  return Math.min(1, Math.max(0, t * t * t * (t * (6 * t - 15) + 10)));
}

/**
 * Small protected worker activity, sampled directly from the shared world
 * clock. It owns no elapsed-time accumulator, options, body transform, random
 * generator, timer, animation callback or resource. The composition root must
 * prove its actual body's swept clearance inside the existing protected room.
 *
 * Each leg turns from counter-facing rest toward the direction of travel,
 * traverses with eased starts/stops, turns back toward the counter, then rests.
 * Feet alternate during traversal; a brief shoulder-connected hand reach
 * marks the counter-facing pause. A single pose is reused on
 * every sample; reduced motion is a fixed centered rest independent of time.
 */
export class ProtectedActivity {
  readonly pose: ProtectedActivityPose = {
    offsetX: 0, yaw: 0, stride: 0, armSwing: 0, walking: 0, service: 0,
  };
  readonly periodSeconds: number;
  private readonly travelMetres: number;
  private readonly walkSeconds: number;
  private readonly turnSeconds: number;
  private readonly idleSeconds: number;
  private readonly strideCyclesPerLeg: number;
  private readonly legSeconds: number;

  constructor(tuning: ProtectedActivityTuning) {
    if (!Number.isFinite(tuning.travelMetres) || tuning.travelMetres < 0
      || !Number.isFinite(tuning.walkSeconds) || tuning.walkSeconds <= 0
      || !Number.isFinite(tuning.turnSeconds) || tuning.turnSeconds <= 0
      || !Number.isFinite(tuning.idleSeconds) || tuning.idleSeconds < 0
      || !Number.isSafeInteger(tuning.strideCyclesPerLeg) || tuning.strideCyclesPerLeg <= 0) {
      throw new RangeError('Protected activity needs finite travel, positive walk/turn times and whole stride cycles');
    }
    this.travelMetres = tuning.travelMetres;
    this.walkSeconds = tuning.walkSeconds;
    this.turnSeconds = tuning.turnSeconds;
    this.idleSeconds = tuning.idleSeconds;
    this.strideCyclesPerLeg = tuning.strideCyclesPerLeg;
    this.legSeconds = this.walkSeconds + 2 * this.turnSeconds + this.idleSeconds;
    this.periodSeconds = 2 * this.legSeconds;
    if (!Number.isFinite(this.periodSeconds)) throw new RangeError('Protected activity period exceeds finite seconds');
  }

  sample(seconds: number, reducedMotion: boolean): ProtectedActivityPose {
    const pose = this.pose;
    if (reducedMotion || !Number.isFinite(seconds) || seconds < 0 || this.travelMetres === 0) {
      return this.rest();
    }
    const phase = seconds % this.periodSeconds;
    const direction = phase < this.legSeconds ? 1 : -1;
    const local = direction === 1 ? phase : phase - this.legSeconds;
    const startX = -direction * this.travelMetres * 0.5;
    const walkStart = this.turnSeconds;
    const walkEnd = walkStart + this.walkSeconds;
    const turnEnd = walkEnd + this.turnSeconds;
    const heading = direction * Math.PI * 0.5;

    pose.stride = 0;
    pose.armSwing = 0;
    pose.walking = 0;
    pose.service = 0;
    if (local < walkStart) {
      pose.offsetX = startX;
      pose.yaw = heading * ease(local / this.turnSeconds);
    } else if (local < walkEnd) {
      const t = (local - walkStart) / this.walkSeconds;
      const remaining = 1 - t;
      pose.offsetX = startX + direction * this.travelMetres * ease(t);
      pose.yaw = heading;
      // The derivative of the positional ease, normalized to a maximum of 1.
      pose.walking = Math.min(1, 16 * t * t * remaining * remaining);
      pose.stride = Math.sin(t * this.strideCyclesPerLeg * Math.PI * 2) * pose.walking;
      pose.armSwing = -pose.stride;
    } else if (local < turnEnd) {
      pose.offsetX = -startX;
      pose.yaw = heading * (1 - ease((local - walkEnd) / this.turnSeconds));
    } else {
      pose.offsetX = -startX;
      pose.yaw = 0;
      const t = (local - turnEnd) / this.idleSeconds;
      pose.service = this.idleSeconds > 0 ? Math.sin(Math.PI * t) ** 2 : 0;
    }
    return pose;
  }

  private rest(): ProtectedActivityPose {
    this.pose.offsetX = 0;
    this.pose.yaw = 0;
    this.pose.stride = 0;
    this.pose.armSwing = 0;
    this.pose.walking = 0;
    this.pose.service = 0;
    return this.pose;
  }
}
