/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CINEMATIC_CAMERA } from '../data/tuning.ts';
import { clamp, lerp, wrapAngle } from '../shared/maths.ts';
import type { Vec3 } from '../simulation/world.ts';
import type { ChaseCameraView, OcclusionProbe } from './chaseCamera.ts';
import { CINEMATIC_PROFILES, type CinematicProfile, type CinematicViewId } from './cameraPresets.ts';

/**
 * The rider-relative camera views — 1.3.0 (`docs/PLANS.md` §50).
 *
 * The same three structural decisions as `chaseCamera.ts`, for the same
 * reasons: **no three.js and no vectors** (every number is reachable from
 * `node --test`), **stepped rather than driven from wall time** (the 120 Hz
 * fixed loop steps it and the frame interpolates two states, so `advance(n)`
 * reaches a named camera state), and **the controller is asked nothing** (the
 * input is the pose the rig is placed from, and the world is reached only
 * through `TerrainSampler.raycast`).
 *
 * **Polar, not Cartesian.** A view is an arm around the rider: a yaw, a
 * horizontal radius and a height, all relative to the rider, eased with
 * α = 1 − e^(−rate·dt). The rider's translation is followed immediately, so
 * nothing trails in world space at a rate that depends on the frame, and an
 * interpolated arm keeps its length — a lerp between two Cartesian endpoints
 * of a turning arm cuts the chord, through the rider. Angles stay
 * **unwrapped** (each step moves by the short way round and never reduces the
 * result), so interpolating two states never spins backwards across ±π.
 *
 * **Obstruction** pulls the camera along the segment from a probe anchor
 * (`probeHeight` over the rider) to the composed camera — never lifted off it,
 * which is how a camera goes through the underside of a deck — immediately when
 * blocked and back out at `restoreRate` when clear, with the look target pulled
 * toward the rider in step. The composition itself is never touched by the
 * correction, so it is still there to return to.
 */

/** What the camera reads each step (and each frame) about the rider it frames. */
export interface CinematicInput {
  x: number;
  y: number;
  z: number;
  /** Unwrapped, like the controller's. */
  headingY: number;
  /** Signed along the heading, m/s. */
  speed: number;
  /** The pose's ground tilt (`EucPose.groundPitch`): positive is nose down. */
  groundPitch: number;
  /**
   * How far below the rider the view's reference sits, m: the native chase's
   * own airborne height lag plus its landing dip, so a jump rises *in frame*
   * and a building's edge never drops the camera into the alley (M44).
   */
  drop: number;
  /** The pane's width over its height, from the seat's own view bounds. */
  aspect: number;
  /**
   * Which side of the rider other riders are on, by weight: positive is the
   * side `sideSign` +1 stands on, 0 is nobody near or evenly spread. A couch
   * room's co-riders are not in the world's ray answers, and a side view on
   * their side frames them instead of its own rider.
   */
  crowd: number;
}

export function createCinematicInput(): CinematicInput {
  return { x: 0, y: 0, z: 0, headingY: 0, speed: 0, groundPitch: 0, drop: 0, aspect: 16 / 9, crowd: 0 };
}

/** One step's camera, every field interpolatable by a plain lerp. */
export interface CinematicState {
  /** Bearing of the camera from the rider, unwrapped: camera = rider + r·(sin yaw, cos yaw). */
  yaw: number;
  /** Horizontal arm, m, before obstruction. */
  radius: number;
  /** Height above the reference, m. */
  height: number;
  /** Bearing the look-ahead is measured along, unwrapped. */
  lookYaw: number;
  lookAhead: number;
  lookHeight: number;
  /** Share of the arm the world allows, 0..1. */
  extension: number;
  /** Vertical field of view, radians. */
  fov: number;
}

export function createCinematicState(): CinematicState {
  return { yaw: 0, radius: 0, height: 0, lookYaw: 0, lookAhead: 0, lookHeight: 0, extension: 1, fov: 1 };
}

export function copyCinematicState(from: CinematicState, to: CinematicState): void {
  to.yaw = from.yaw;
  to.radius = from.radius;
  to.height = from.height;
  to.lookYaw = from.lookYaw;
  to.lookAhead = from.lookAhead;
  to.lookHeight = from.lookHeight;
  to.extension = from.extension;
  to.fov = from.fov;
}

/**
 * Interpolate two steps. The extension takes the **shorter** of the two, not
 * the lerp: a pull-in happened at one of them, and a frame between a blocked
 * step and a clear one must not lean back into the thing that blocked it.
 */
export function lerpCinematicState(
  from: CinematicState,
  to: CinematicState,
  alpha: number,
  out: CinematicState,
): void {
  out.yaw = lerp(from.yaw, to.yaw, alpha);
  out.radius = lerp(from.radius, to.radius, alpha);
  out.height = lerp(from.height, to.height, alpha);
  out.lookYaw = lerp(from.lookYaw, to.lookYaw, alpha);
  out.lookAhead = lerp(from.lookAhead, to.lookAhead, alpha);
  out.lookHeight = lerp(from.lookHeight, to.lookHeight, alpha);
  out.extension = Math.min(from.extension, to.extension);
  out.fov = lerp(from.fov, to.fov, alpha);
}

/** The composed (unobstructed) targets of one view at one moment. Scratch, filled in place. */
interface Composition {
  yaw: number;
  radius: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
  fov: number;
}

/**
 * Where a view resolves to. Pure; fills `out` (the `ChaseCameraView` shape,
 * so the composition root applies every view the same way). Roll is zero:
 * only the native chase banks.
 */
export function resolveCinematicView(
  state: CinematicState,
  input: CinematicInput,
  profile: CinematicProfile,
  out: ChaseCameraView,
): void {
  const reference = input.y - (profile.airLag ? input.drop : 0);
  const desiredX = input.x + Math.sin(state.yaw) * state.radius;
  const desiredY = reference + state.height;
  const desiredZ = input.z + Math.cos(state.yaw) * state.radius;
  const lookX = input.x + Math.sin(state.lookYaw) * state.lookAhead;
  const lookZ = input.z + Math.cos(state.lookYaw) * state.lookAhead;
  const lookY = reference + state.lookHeight;
  if (profile.obstruction && state.extension < 1) {
    const anchorY = reference + CINEMATIC_CAMERA.probeHeight;
    const e = state.extension;
    out.positionX = input.x + (desiredX - input.x) * e;
    out.positionY = anchorY + (desiredY - anchorY) * e;
    out.positionZ = input.z + (desiredZ - input.z) * e;
    // The aim comes in with the arm, to the rider at full retraction, so a
    // camera pulled in close is not left pointing past the person it frames.
    out.targetX = input.x + (lookX - input.x) * e;
    out.targetY = lookY;
    out.targetZ = input.z + (lookZ - input.z) * e;
  } else {
    out.positionX = desiredX;
    out.positionY = desiredY;
    out.positionZ = desiredZ;
    out.targetX = lookX;
    out.targetY = lookY;
    out.targetZ = lookZ;
  }
  out.fov = state.fov;
  out.roll = 0;
}

/** The probe anchor of a view: straight up from the contact patch. */
export function cinematicAnchorY(input: CinematicInput, profile: CinematicProfile): number {
  return input.y - (profile.airLag ? input.drop : 0) + CINEMATIC_CAMERA.probeHeight;
}

export class CinematicCamera {
  private view: CinematicViewId = 'avenue';
  private profile: CinematicProfile = CINEMATIC_PROFILES.avenue;

  private yaw = 0;
  private radius = 0;
  private height = 0;
  private lookYaw = 0;
  private lookAhead = 0;
  private lookHeight = 0;
  private extension = 1;
  private fov = 1;

  /** Which side a two-sided view stands on: +1 the rider's left (+X at heading 0), −1 the right. */
  private sideSign = 1;
  /** Until the next side comparison, s. */
  private sideTimer = 0;
  /** Until a just-chosen side may change again, s. */
  private sideHold = 0;
  /** Director's orbit, radians; wrapped, because only the short way to it is ever taken. */
  private phase = 0;
  /** Action's smoothed |speed|, m/s. */
  private speed = 0;

  private probe: OcclusionProbe | null = null;
  private readonly composition: Composition = { yaw: 0, radius: 0, height: 0, lookAhead: 0, lookHeight: 0, fov: 1 };
  private readonly origin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly direction: Vec3 = { x: 0, y: 0, z: 0 };

  get selected(): CinematicViewId { return this.view; }
  get side(): number { return this.sideSign; }
  get directorPhase(): number { return this.phase; }

  setOcclusionProbe(probe: OcclusionProbe | null): void {
    this.probe = probe;
  }

  /**
   * Snap onto a view: every eased quantity at its target, the obstruction
   * answered now rather than eased into. `entering` is a view *change* — it
   * starts Director's orbit deliberately at its base angle and stands a
   * two-sided view on its default side; a respawn or a teleport (`false`)
   * keeps both, because the player's view did not change, only the place.
   */
  reset(input: CinematicInput, view: CinematicViewId, entering: boolean): void {
    this.view = view;
    this.profile = CINEMATIC_PROFILES[view];
    if (entering) {
      this.phase = 0;
      this.sideSign = 1;
    }
    this.sideTimer = 0;
    this.sideHold = 0;
    this.speed = Math.abs(input.speed);
    const target = this.compose(input, this.sideSign);
    this.yaw = target.yaw;
    this.radius = target.radius;
    this.height = target.height;
    this.lookYaw = input.headingY;
    this.lookAhead = target.lookAhead;
    this.lookHeight = target.lookHeight;
    this.fov = target.fov;
    this.extension = this.allowedExtension(input, this.yaw, this.radius, this.height);
    // A snap may also be onto the other side: if the default side is buried
    // and the other is clear, start there instead of easing round from a wall.
    if (this.profile.sideChoice) {
      const other = this.sideScore(input, -this.sideSign);
      if (other > this.sideScore(input, this.sideSign) + CINEMATIC_CAMERA.sideThreshold) {
        this.sideSign = -this.sideSign;
        const flipped = this.compose(input, this.sideSign);
        this.yaw = flipped.yaw;
        this.extension = this.allowedExtension(input, this.yaw, this.radius, this.height);
      }
    }
  }

  /** One fixed step. */
  step(dt: number, input: CinematicInput): void {
    if (dt <= 0) return;
    const profile = this.profile;
    const tuning = CINEMATIC_CAMERA;

    if (profile.orbitRate !== 0) {
      this.phase = wrapAngle(this.phase + profile.orbitRate * dt);
    }
    if (profile.kind === 'action') {
      this.speed += (Math.abs(input.speed) - this.speed) * (1 - Math.exp(-tuning.actionSpeedRate * dt));
    }

    if (profile.sideChoice) {
      this.sideHold = Math.max(0, this.sideHold - dt);
      this.sideTimer -= dt;
      if (this.sideTimer <= 0) {
        this.sideTimer = tuning.sideCheckSeconds;
        if (this.sideHold <= 0) {
          const here = this.sideScore(input, this.sideSign);
          const there = this.sideScore(input, -this.sideSign);
          if (there > here + tuning.sideThreshold) {
            this.sideSign = -this.sideSign;
            this.sideHold = tuning.sideHoldSeconds;
          }
        }
      }
    }

    const target = this.compose(input, this.sideSign);
    const alpha = 1 - Math.exp(-profile.followRate * dt);
    // The short way round, onto an unwrapped value: never reduced, never a spin.
    this.yaw += wrapAngle(target.yaw - this.yaw) * alpha;
    this.lookYaw += wrapAngle(input.headingY - this.lookYaw) * alpha;
    this.radius += (target.radius - this.radius) * alpha;
    this.height += (target.height - this.height) * alpha;
    this.lookAhead += (target.lookAhead - this.lookAhead) * alpha;
    this.lookHeight += (target.lookHeight - this.lookHeight) * alpha;
    this.fov += (target.fov - this.fov) * alpha;

    // Safety is never throttled: every step, against the arm as it now stands.
    const allowed = this.allowedExtension(input, this.yaw, this.radius, this.height);
    if (allowed < this.extension) this.extension = allowed;
    else this.extension += (allowed - this.extension) * (1 - Math.exp(-tuning.restoreRate * dt));
  }

  writeState(target: CinematicState): void {
    target.yaw = this.yaw;
    target.radius = this.radius;
    target.height = this.height;
    target.lookYaw = this.lookYaw;
    target.lookAhead = this.lookAhead;
    target.lookHeight = this.lookHeight;
    target.extension = this.extension;
    target.fov = this.fov;
  }

  /**
   * A drawn frame's last check: is the segment from the anchor to the resolved
   * camera clear? If not, pull the camera in along it. **Writes only `view`**
   * — no timer, no eased value — so a frame can never advance the camera; it
   * covers the frame that falls between a clear step and a blocked one, and
   * an interpolated rider who is somewhere neither step put him.
   */
  constrain(input: CinematicInput, profile: CinematicProfile, view: ChaseCameraView): boolean {
    if (!profile.obstruction || this.probe === null) return false;
    const anchorY = cinematicAnchorY(input, profile);
    const dx = view.positionX - input.x;
    const dy = view.positionY - anchorY;
    const dz = view.positionZ - input.z;
    const length = Math.hypot(dx, dy, dz);
    if (length <= CINEMATIC_CAMERA.minimumArm) return false;
    const hit = this.cast(input.x, anchorY, input.z, dx, dy, dz, length);
    if (hit === null) return false;
    const keep = Math.max(CINEMATIC_CAMERA.minimumArm, hit - CINEMATIC_CAMERA.clearance) / length;
    if (keep >= 1) return false;
    view.positionX = input.x + dx * keep;
    view.positionY = anchorY + dy * keep;
    view.positionZ = input.z + dz * keep;
    return true;
  }

  /** The view's composed targets for this input on this side. Scratch; read before the next call. */
  private compose(input: CinematicInput, sideSign: number): Composition {
    const profile = this.profile;
    const out = this.composition;
    const back = profile.kind === 'action'
      ? profile.back + this.speed * CINEMATIC_CAMERA.actionLagPerSpeed
      : profile.back;
    const portraitNarrow = 1 - Math.min(1, input.aspect > 0 ? input.aspect : 1);
    const side = profile.side * sideSign * (1 + profile.portraitSide * portraitNarrow);
    // The narrow-pane rule, on the seat's own pane (`portraitArm`,
    // `portraitLead`): 0 at a square or wider pane, 1 at an upright phone.
    const narrow = 1 - Math.min(1, input.aspect > 0 ? input.aspect : 1);
    const scale = 1 + profile.portraitArm * narrow;
    out.yaw = input.headingY + Math.atan2(side, -back) + this.phase;
    out.radius = Math.hypot(back, side) * scale;
    out.height = profile.height * scale;
    out.lookAhead = profile.lookAhead + profile.portraitLead * narrow;
    out.lookHeight = profile.lookHeight;
    out.fov = profile.fov + profile.portraitFov * narrow;
    if (profile.kind === 'eye') {
      // The eye keeps a level horizon and looks up a climb and down a descent
      // by the slope under the wheel, capped, so a crest never points it at
      // the sky. `groundPitch` is positive nose-down.
      const pitch = clamp(-input.groundPitch, -CINEMATIC_CAMERA.eyeSlopeMax, CINEMATIC_CAMERA.eyeSlopeMax);
      out.lookHeight = profile.lookHeight + Math.tan(pitch) * profile.lookAhead;
    }
    return out;
  }

  /** Share of a proposed arm the world allows, 0..1, from the five-ray bundle. */
  private allowedExtension(input: CinematicInput, yaw: number, radius: number, height: number): number {
    const profile = this.profile;
    if (!profile.obstruction || this.probe === null) return 1;
    const anchorY = cinematicAnchorY(input, profile);
    const reference = anchorY - CINEMATIC_CAMERA.probeHeight;
    const dx = Math.sin(yaw) * radius;
    const dy = reference + height - anchorY;
    const dz = Math.cos(yaw) * radius;
    const length = Math.hypot(dx, dy, dz);
    if (length <= CINEMATIC_CAMERA.minimumArm) return 1;
    let nearest = this.cast(input.x, anchorY, input.z, dx, dy, dz, length);
    // Four parallel guards a quarter-metre out in X and Z: a cheap corner
    // precaution, not a swept sphere. A guard that starts inside something
    // (the rider brushing a wall) is ignored rather than slamming the arm in.
    const offset = CINEMATIC_CAMERA.guardOffset;
    for (let guard = 0; guard < 4; guard += 1) {
      const ox = guard === 0 ? offset : guard === 1 ? -offset : 0;
      const oz = guard === 2 ? offset : guard === 3 ? -offset : 0;
      const hit = this.cast(input.x + ox, anchorY, input.z + oz, dx, dy, dz, length);
      if (hit === null || hit < CINEMATIC_CAMERA.guardSwallowed) continue;
      if (nearest === null || hit < nearest) nearest = hit;
    }
    if (nearest === null) return 1;
    const allowed = Math.max(CINEMATIC_CAMERA.minimumArm, nearest - CINEMATIC_CAMERA.clearance);
    return clamp(allowed / length, 0, 1);
  }

  /**
   * One side's score: how much of its arm is clear (0..1), less a penalty
   * when the other riders are on that side (`crowd`), so a couch room's side
   * views stand on the side nobody else is.
   */
  private sideScore(input: CinematicInput, sideSign: number): number {
    const crowded = input.crowd * sideSign > 0 ? Math.min(1, Math.abs(input.crowd)) : 0;
    return this.clearFraction(input, sideSign) - crowded * CINEMATIC_CAMERA.crowdPenalty;
  }

  /** How much of one side's arm is clear, 0..1, from its single centre ray. */
  private clearFraction(input: CinematicInput, sideSign: number): number {
    if (this.probe === null) return 1;
    const target = this.compose(input, sideSign);
    const anchorY = cinematicAnchorY(input, this.profile);
    const reference = anchorY - CINEMATIC_CAMERA.probeHeight;
    const dx = Math.sin(target.yaw) * target.radius;
    const dy = reference + target.height - anchorY;
    const dz = Math.cos(target.yaw) * target.radius;
    const length = Math.hypot(dx, dy, dz);
    if (length <= 1e-6) return 1;
    const hit = this.cast(input.x, anchorY, input.z, dx, dy, dz, length);
    return hit === null ? 1 : clamp(hit / length, 0, 1);
  }

  private cast(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    length: number,
  ): number | null {
    if (this.probe === null) return null;
    this.origin.x = x;
    this.origin.y = y;
    this.origin.z = z;
    this.direction.x = dx;
    this.direction.y = dy;
    this.direction.z = dz;
    return this.probe(this.origin, this.direction, length);
  }
}

// ---------------------------------------------------------------------------
// The local blend between two views
// ---------------------------------------------------------------------------

/**
 * A view change, eased locally around the rider — 1.3.0's explicit choice
 * (NYC cut on every press). Seeded from the view last drawn, held **relative
 * to the rider** so a blend at speed travels with him instead of being left
 * behind, and interpolated in polar terms (bearing the short way, radius,
 * height) so it swings round the rider rather than through him. The aim and
 * the lens lerp. `progress` runs 0 → 1 on the fixed step; 1 is no blend.
 */
export interface CameraBlend {
  /** How long this blend takes, s: longer for a wide swing round the rider. */
  seconds: number;
  progress: number;
  previousProgress: number;
  fromRadius: number;
  fromBearing: number;
  fromHeight: number;
  fromTargetX: number;
  fromTargetY: number;
  fromTargetZ: number;
  fromFov: number;
  fromRoll: number;
}

export function createCameraBlend(): CameraBlend {
  return {
    seconds: CINEMATIC_CAMERA.blendSeconds, progress: 1, previousProgress: 1,
    fromRadius: 0, fromBearing: 0, fromHeight: 0,
    fromTargetX: 0, fromTargetY: 0, fromTargetZ: 0, fromFov: 1, fromRoll: 0,
  };
}

/**
 * Start a blend from `view`, drawn around a rider who stood at `at`, toward a
 * view standing on `toBearing` (the camera's bearing from the rider). A swing
 * wider than a quarter turn takes longer — `blendSecondsPerQuarter` per
 * extra quarter — so a half-turn round the rider is a move, not a whip.
 */
export function beginCameraBlend(
  blend: CameraBlend,
  view: ChaseCameraView,
  at: { readonly x: number; readonly y: number; readonly z: number },
  toBearing: number,
): void {
  const dx = view.positionX - at.x;
  const dz = view.positionZ - at.z;
  blend.fromRadius = Math.hypot(dx, dz);
  blend.fromBearing = Math.atan2(dx, dz);
  const swing = Math.abs(wrapAngle(toBearing - blend.fromBearing));
  blend.seconds = CINEMATIC_CAMERA.blendSeconds
    + Math.max(0, swing - Math.PI / 2) / (Math.PI / 2) * CINEMATIC_CAMERA.blendSecondsPerQuarter;
  blend.fromHeight = view.positionY - at.y;
  blend.fromTargetX = view.targetX - at.x;
  blend.fromTargetY = view.targetY - at.y;
  blend.fromTargetZ = view.targetZ - at.z;
  blend.fromFov = view.fov;
  blend.fromRoll = view.roll;
  blend.progress = 0;
  blend.previousProgress = 0;
}

export function endCameraBlend(blend: CameraBlend): void {
  blend.progress = 1;
  blend.previousProgress = 1;
}

export function stepCameraBlend(blend: CameraBlend, dt: number): void {
  blend.previousProgress = blend.progress;
  if (blend.progress >= 1) return;
  blend.progress = Math.min(1, blend.progress + dt / blend.seconds);
}

/** The blend's weight on the new view for a drawn frame: eased in and out. */
export function cameraBlendWeight(blend: CameraBlend, alpha: number): number {
  const t = clamp(lerp(blend.previousProgress, blend.progress, alpha), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Mix the blend's starting view into `view` (the new view, already resolved
 * around a rider at `at`) at weight `w` on the new one. Pure in `blend`.
 */
export function applyCameraBlend(
  blend: CameraBlend,
  w: number,
  at: { readonly x: number; readonly y: number; readonly z: number },
  view: ChaseCameraView,
): void {
  if (w >= 1) return;
  const dx = view.positionX - at.x;
  const dz = view.positionZ - at.z;
  const radius = lerp(blend.fromRadius, Math.hypot(dx, dz), w);
  const bearing = blend.fromBearing + wrapAngle(Math.atan2(dx, dz) - blend.fromBearing) * w;
  const height = lerp(blend.fromHeight, view.positionY - at.y, w);
  view.positionX = at.x + Math.sin(bearing) * radius;
  view.positionY = at.y + height;
  view.positionZ = at.z + Math.cos(bearing) * radius;
  view.targetX = at.x + lerp(blend.fromTargetX, view.targetX - at.x, w);
  view.targetY = at.y + lerp(blend.fromTargetY, view.targetY - at.y, w);
  view.targetZ = at.z + lerp(blend.fromTargetZ, view.targetZ - at.z, w);
  view.fov = lerp(blend.fromFov, view.fov, w);
  view.roll = lerp(blend.fromRoll, view.roll, w);
}
