/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CAMERA, RIDER } from '../data/tuning.ts';
import { approach, clamp, clamp01, lerp } from '../shared/maths.ts';
import type { Vec3 } from '../simulation/world.ts';

/**
 * The chase camera — M3, and the second-most important system in the game.
 *
 * A spring arm anchored at the rider's hip, aimed at a point ahead of them,
 * lagging their heading, banking into the corner, and pulling in when
 * something solid gets between the two.
 *
 * Three structural decisions shape this file:
 *
 *   1. **It contains no three.js and no vectors.** Everything here is scalar
 *      arithmetic on plain numbers, so the whole camera — the speed easing,
 *      the yaw lag, the bank sign, the obstruction pull-in and its asymmetric
 *      restore — is reachable from `node --test` with no browser and no
 *      canvas. `app/Game.ts` is the only file that turns the result into a
 *      `THREE.PerspectiveCamera`. This is not the sealed-directory invariant
 *      (that covers `simulation/` and `level/`); it is the same trick applied
 *      voluntarily, for the same reason it made the controller fast to tune.
 *   2. **It is stepped, not driven from wall time.** Every smoothed value below
 *      advances inside the fixed 120 Hz step and the renderer interpolates
 *      between the two most recent states, exactly as the rider's pose does.
 *      That is what keeps `advance(n)` deterministic, which is what makes a
 *      frozen screenshot of a camera transient mean anything.
 *   3. **The controller answers no camera question and is asked none.** The
 *      input below is the same pose the rig is placed from, plus the two
 *      scalars the pose already carries. Obstruction goes through the
 *      `TerrainSampler`'s existing `raycast`, which `simulation/world.ts` has
 *      named as the camera's route to the world since M0.
 *
 * **Priority when goals conflict** (`EUC_THRILLS_GAME_VISION.md` 10) is
 * playability, terrain visibility, speed sensation, rider readability,
 * cinematic presentation — and `step()` below applies them in an order chosen
 * to honour it, with the obstruction pull-in last so it overrides everything.
 *
 * **M5 adds the airborne half of `docs/PLANS.md` §5** — "freeze pitch-follow,
 * keep the rider framed, ease back on landing" — as two pieces of state that
 * are both exactly zero while the wheel is on the ground:
 *
 *   - `heightLag`, how far *below* the rider the anchor sits. Until M5 the
 *     anchor was the rider's exact height, which is right on the ground and
 *     wrong the instant they leave it: a 0.46 m hop would throw the horizon
 *     and the upcoming ground up half a metre in a fifth of a second. The lag
 *     holds back most of the rise, so the rider gains height *in frame*, which
 *     is the only way a player can see how much air they got.
 *   - `dip`, one decaying impulse on landing (§4.4's "camera dip"). It is
 *     deliberately not shake: no oscillation, no per-frame noise, capped, and
 *     zero within half a second.
 *
 * **M6 adds the last clause of §5** — "Crash: detach and ease to a wider
 * framing keeping both rider and wheel in shot" — as one more blend that is
 * exactly zero whenever the rider is on the wheel. `crashFrame` takes the arm
 * out and up, widens the field of view, and retires the look-ahead, so the
 * rider on the ground and the wheel still rolling away from them are both in
 * frame. It eases out faster than it eases in, because a recovery should hand
 * the ordinary view back rather than make the player wait for the camera to
 * finish being cinematic.
 *
 * **1.3.1 moves where a crash is framed from.** Until then everything above
 * hung off the wheel, and a riderless wheel at speed rolls on long after the
 * rider has slid to a stop: on a 65 mph wipeout the camera drove past the
 * body inside a second and spent the next three looking at the wheel with the
 * rider behind it. Now a crash eases the camera's focus off the wheel onto
 * the rider's body (`focusX`/`focusY`/`focusZ`, an offset from the wheel).
 * The arm still stands back along the heading, so a wheel that rolls on ahead
 * of the rider — the usual case — stays in shot beyond them. A midpoint aim
 * was tried first and lost the body at 65 mph: the wheel outran the easing
 * and the short early arm let the body slip under the camera. Exactly zero
 * whenever the rider is on the wheel.
 *
 */

/** Every number the chase camera reads. Plain data, so a test can state its own. */
export interface ChaseCameraTuning {
  /** Height of the look anchor above the contact patch. */
  anchorHeight: number;
  armHeight: number;

  distanceAtRest: number;
  distanceAtSpeed: number;
  distanceResponseSeconds: number;

  fovAtRest: number;
  fovAtSpeed: number;
  fovResponseSeconds: number;

  speedReference: number;

  lookAheadSeconds: number;
  lookAheadMax: number;
  lookAheadResponseSeconds: number;

  yawLagAtRest: number;
  yawLagAtSpeed: number;

  bankFactor: number;
  bankMaxRadians: number;
  bankResponseSeconds: number;

  obstructionRadius: number;
  obstructionMinDistance: number;
  obstructionPullInSeconds: number;
  obstructionRestoreSeconds: number;

  // -- Airborne and landing (M5) --------------------------------------------
  /** Fraction of the rider's height above the ground the camera follows. */
  airHeightFollow: number;
  airHeightResponseSeconds: number;
  /** Time constant for easing the height offset out after touchdown, s. */
  landingRestoreSeconds: number;
  /**
   * Fall of the ground under a flight below the ground it left from, metres,
   * past which the hop is measured from the takeoff ground instead (M44).
   */
  deepDropMetres: number;
  /**
   * Fall of the ground under a flight in a single step, metres, that marks the
   * flight as leaving a building's edge rather than a hillside (M44). Only such
   * a flight may take the `deepDropMetres` path.
   */
  sheerDropMetres: number;
  /** Camera drop per m/s of normal impact, m, and its ceiling. */
  landingDipPerImpact: number;
  landingDipMax: number;
  landingDipRecoverSeconds: number;

  // -- Crash framing (M6) -----------------------------------------------------
  /** Arm length, arm height, and field of view held during a crash. */
  crashDistance: number;
  crashArmHeight: number;
  crashFov: number;
  crashFrameSeconds: number;
  crashRestoreSeconds: number;
  /** Time constant the crash focus follows the body with, s (1.3.1). */
  crashFocusSeconds: number;
  /** The fastest the focus moves against the wheel, m/s (1.3.1). */
  crashFocusMaxRate: number;
}

export function defaultChaseCameraTuning(): ChaseCameraTuning {
  return {
    anchorHeight: RIDER.hipHeight + CAMERA.targetHeightOffset,
    armHeight: CAMERA.armHeight,

    distanceAtRest: CAMERA.distanceAtRest,
    distanceAtSpeed: CAMERA.distanceAtSpeed,
    distanceResponseSeconds: CAMERA.distanceResponseSeconds,

    fovAtRest: CAMERA.fovAtRest,
    fovAtSpeed: CAMERA.fovAtSpeed,
    fovResponseSeconds: CAMERA.fovResponseSeconds,

    speedReference: CAMERA.speedReference,

    lookAheadSeconds: CAMERA.lookAheadSeconds,
    lookAheadMax: CAMERA.lookAheadMax,
    lookAheadResponseSeconds: CAMERA.lookAheadResponseSeconds,

    yawLagAtRest: CAMERA.yawLagAtRest,
    yawLagAtSpeed: CAMERA.yawLagAtSpeed,

    bankFactor: CAMERA.bankFactor,
    bankMaxRadians: CAMERA.bankMaxRadians,
    bankResponseSeconds: CAMERA.bankResponseSeconds,

    obstructionRadius: CAMERA.obstructionRadius,
    obstructionMinDistance: CAMERA.obstructionMinDistance,
    obstructionPullInSeconds: CAMERA.obstructionPullInSeconds,
    obstructionRestoreSeconds: CAMERA.obstructionRestoreSeconds,

    airHeightFollow: CAMERA.airHeightFollow,
    airHeightResponseSeconds: CAMERA.airHeightResponseSeconds,
    landingRestoreSeconds: CAMERA.landingRestoreSeconds,
    deepDropMetres: CAMERA.deepDropMetres,
    sheerDropMetres: CAMERA.sheerDropMetres,
    landingDipPerImpact: CAMERA.landingDipPerImpact,
    landingDipMax: CAMERA.landingDipMax,
    landingDipRecoverSeconds: CAMERA.landingDipRecoverSeconds,

    crashDistance: CAMERA.crashDistance,
    crashArmHeight: CAMERA.crashArmHeight,
    crashFov: CAMERA.crashFov,
    crashFrameSeconds: CAMERA.crashFrameSeconds,
    crashRestoreSeconds: CAMERA.crashRestoreSeconds,
    crashFocusSeconds: CAMERA.crashFocusSeconds,
    crashFocusMaxRate: CAMERA.crashFocusMaxRate,
  };
}

/**
 * What the camera reads each step from the rider's pose. Nothing is asked of
 * the controller that the renderer did not already need.
 */
export interface ChaseCameraInput {
  x: number;
  y: number;
  z: number;
  headingY: number;
  /** Wheel and lower-body lean. Signed toward +X, the rider's LEFT. */
  rollAngle: number;
  /** Signed along the heading. Negative is reverse. */
  speed: number;
  /**
   * Ground height beneath the contact patch, metres. Equal to `y` on the
   * ground, which is what keeps every M3 and M4 camera number untouched.
   */
  groundY: number;
  /** True while the wheel is off the ground. */
  airborne: boolean;
  /**
   * True while the rider is off the wheel (M6).
   *
   * `docs/PLANS.md` §5: "Crash: detach and ease to a wider framing keeping both
   * rider and wheel in shot." A boolean rather than the crash blend, because
   * the framing is a mode the camera enters and leaves on its own time
   * constants rather than something that tracks the separation — a camera that
   * followed the rider's tumble frame by frame would be needlessly disorienting.
   */
  crashed: boolean;
  /**
   * Where the rider's body is, world metres (1.3.1): the ragdoll's pelvis
   * while the rider is thrown, and the wheel's own `x`/`y`/`z` otherwise.
   * Read only while `crashed`.
   */
  bodyX: number;
  bodyY: number;
  bodyZ: number;
}

/**
 * The camera's own smoothed state, at one simulation step.
 *
 * Every field is interpolatable by a plain lerp, which is why `yaw` is
 * unwrapped: it chases the controller's equally unwrapped heading, so the pair
 * can never disagree across the (-pi, pi] seam.
 */
export interface ChaseCameraState {
  /** Follow yaw, lagging the heading. Unwrapped. */
  yaw: number;
  /** Speed-eased arm length, before obstruction. */
  distance: number;
  /** Arm length actually used, after the obstruction pull-in. */
  armDistance: number;
  /** Vertical field of view, radians. */
  fov: number;
  /**
   * Camera roll, radians. Positive tilts the camera's up axis toward the
   * RIGHT of the screen, which is what leaning into a right-hand turn looks
   * like from behind. See `bankTargetFor` for the sign derivation.
   */
  bank: number;
  /** How far ahead of the anchor the camera is aiming, metres. */
  lookAhead: number;
  /**
   * How far BELOW the rider the anchor sits, metres (M5).
   *
   * Zero on the ground and while settled, which is exactly what keeps the M3
   * and M4 camera unchanged: on the ground the target is zero and the current
   * value is zero, so the smoothing has nothing to do. It grows only while the
   * wheel is off the ground, and eases back to zero after touchdown.
   */
  heightLag: number;
  /** Landing dip, metres. One decaying impulse; never oscillates (M5). */
  dip: number;
  /**
   * How far into the crash framing the camera is, 0..1 (M6).
   *
   * Zero whenever the rider is on the wheel, which is what keeps every M3, M4,
   * and M5 camera number untouched: with it at zero every blend below returns
   * its first argument exactly.
   */
  crashFrame: number;
  /**
   * Where the camera is centred, as an offset from the wheel, metres (1.3.1).
   * Zero whenever the rider is on the wheel; during a crash it eases toward
   * the rider's body. See the file comment.
   */
  focusX: number;
  focusY: number;
  focusZ: number;
}

export function createChaseCameraState(): ChaseCameraState {
  return {
    yaw: 0,
    distance: CAMERA.distanceAtRest,
    armDistance: CAMERA.distanceAtRest,
    fov: CAMERA.fovAtRest,
    bank: 0,
    lookAhead: 0,
    heightLag: 0,
    dip: 0,
    crashFrame: 0,
    focusX: 0,
    focusY: 0,
    focusZ: 0,
  };
}

export function copyChaseCameraState(from: ChaseCameraState, to: ChaseCameraState): void {
  to.yaw = from.yaw;
  to.distance = from.distance;
  to.armDistance = from.armDistance;
  to.fov = from.fov;
  to.bank = from.bank;
  to.lookAhead = from.lookAhead;
  to.heightLag = from.heightLag;
  to.dip = from.dip;
  to.crashFrame = from.crashFrame;
  to.focusX = from.focusX;
  to.focusY = from.focusY;
  to.focusZ = from.focusZ;
}

export function lerpChaseCameraState(
  from: ChaseCameraState,
  to: ChaseCameraState,
  alpha: number,
  out: ChaseCameraState,
): void {
  out.yaw = lerp(from.yaw, to.yaw, alpha);
  out.distance = lerp(from.distance, to.distance, alpha);
  out.armDistance = lerp(from.armDistance, to.armDistance, alpha);
  out.fov = lerp(from.fov, to.fov, alpha);
  out.bank = lerp(from.bank, to.bank, alpha);
  out.lookAhead = lerp(from.lookAhead, to.lookAhead, alpha);
  out.heightLag = lerp(from.heightLag, to.heightLag, alpha);
  out.dip = lerp(from.dip, to.dip, alpha);
  out.crashFrame = lerp(from.crashFrame, to.crashFrame, alpha);
  out.focusX = lerp(from.focusX, to.focusX, alpha);
  out.focusY = lerp(from.focusY, to.focusY, alpha);
  out.focusZ = lerp(from.focusZ, to.focusZ, alpha);
}

/** Where the camera goes and what it looks at. Filled in place; no allocation. */
export interface ChaseCameraView {
  positionX: number;
  positionY: number;
  positionZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Vertical field of view, radians. */
  fov: number;
  /** Roll, radians, positive tilting the camera's up axis toward screen-right. */
  roll: number;
}

export function createChaseCameraView(): ChaseCameraView {
  return {
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    fov: CAMERA.fovAtRest,
    roll: 0,
  };
}

/**
 * Distance along a ray until something solid, or null.
 *
 * Deliberately the shape of `TerrainSampler.raycast`, which
 * `simulation/world.ts` has documented as the camera's route to the world
 * since M0. A test supplies its own; the game supplies the level's.
 */
export type OcclusionProbe = (
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
) => number | null;

/**
 * The bank target for a given lean, with the sign derived rather than guessed.
 *
 * Exported because the sign is the one thing here a world-space test cannot
 * check (`docs/LESSONS_LEARNED.md`), so it is worth having in one named place
 * that both the implementation and the browser's screen-space proof point at.
 *
 * The derivation: +X is the rider's LEFT, so steering right produces a
 * negative yaw rate, a negative lateral acceleration, and a negative
 * `rollAngle` — the wheel leans toward -X, the rider's right. Leaning *into*
 * that corner means the camera's up axis tilts the same way the rider does,
 * toward the right of the screen, which this file calls a positive bank.
 * Hence the negation.
 */
export function bankTargetFor(rollAngle: number, tuning: ChaseCameraTuning): number {
  return clamp(
    -rollAngle * tuning.bankFactor,
    -tuning.bankMaxRadians,
    tuning.bankMaxRadians,
  );
}

export class ChaseCamera {
  readonly tuning: ChaseCameraTuning;

  private yaw = 0;
  private distance: number;
  private armDistance: number;
  private fov: number;
  private bank = 0;
  private lookAhead = 0;
  private heightLag = 0;
  private dip = 0;
  private crashFrame = 0;
  private focusX = 0;
  private focusY = 0;
  private focusZ = 0;
  /** The wheel on the previous step, for telling a placement from travel. */
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastSpeed = 0;

  // -- The takeoff latch (M44) ------------------------------------------------
  // Private, and deliberately not on `ChaseCameraState`: nothing interpolates
  // or copies them, because what the renderer needs from them is already in
  // `heightLag`. `reset` clears them; `step` is the only other writer.
  /** Ground under the wheel on the latest grounded step, m. NaN until one is seen. */
  private groundedY = Number.NaN;
  /** Ground the current flight left from, m. NaN while the wheel is down. */
  private takeoffY = Number.NaN;
  /**
   * Did the current or latest flight fall more than `deepDropMetres` below its
   * takeoff ground? Held through the landing that follows, so the lag it leaves
   * behind can be held above the ground the rider came down on.
   */
  private deepFlight = false;
  /** Ground under the wheel on the flight's previous step, m. NaN while the wheel is down. */
  private flightGroundY = Number.NaN;
  /** Has the ground under this flight fallen more than `sheerDropMetres` in one step? */
  private sheerFlight = false;

  private probe: OcclusionProbe | null = null;

  /**
   * Two scratch vectors for the occlusion probe.
   *
   * The probe runs once per step at 120 Hz. Allocating a pair of objects for
   * it would be 240 short-lived objects a second — the same class of garbage
   * the pose interpolation is preallocated to avoid.
   */
  private readonly probeOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly probeDirection: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(options: { tuning?: Partial<ChaseCameraTuning> } = {}) {
    this.tuning = { ...defaultChaseCameraTuning(), ...options.tuning };
    this.distance = this.tuning.distanceAtRest;
    this.armDistance = this.tuning.distanceAtRest;
    this.fov = this.tuning.fovAtRest;
  }

  /** Change tuning while the game runs — this is what F4 writes through. */
  setTuning(values: Partial<ChaseCameraTuning>): void {
    Object.assign(this.tuning, values);
  }

  /**
   * Install the world probe, or remove it with `null`.
   *
   * Nullable rather than required because the camera is complete without one:
   * a level with nothing to hide behind simply never pulls in, and that is the
   * M2 plane exactly.
   */
  setOcclusionProbe(probe: OcclusionProbe | null): void {
    this.probe = probe;
  }

  /**
   * Snap the whole camera onto a rider. Used at construction and on `R`.
   *
   * A quick reset that eased the camera across the map would draw several
   * seconds of the rider being chased from wherever they used to be.
   */
  reset(input: ChaseCameraInput): void {
    this.yaw = input.headingY;
    this.distance = this.tuning.distanceAtRest;
    this.armDistance = this.tuning.distanceAtRest;
    this.fov = this.tuning.fovAtRest;
    this.bank = 0;
    this.lookAhead = 0;
    this.heightLag = 0;
    this.dip = 0;
    this.crashFrame = 0;
    this.focusX = 0;
    this.focusY = 0;
    this.focusZ = 0;
    this.lastX = input.x;
    this.lastZ = input.z;
    this.lastSpeed = input.speed;
    // A snap is a new place: no flight carries across it. A rider snapped onto
    // the ground is standing on the ground a flight would leave from; one
    // snapped into the air has stood on nothing yet (M44).
    this.groundedY = input.airborne ? Number.NaN : input.groundY;
    this.takeoffY = Number.NaN;
    this.deepFlight = false;
    this.flightGroundY = Number.NaN;
    this.sheerFlight = false;
  }

  /**
   * A landing, as an impulse on the dip (M5).
   *
   * Called from the composition root on the one step the wheel touched down,
   * rather than derived from the input, because a landing is an *event* and
   * the input is a state — a camera that inferred it from a height crossing
   * would fire twice on a bounce and never on a landing that happened between
   * two steps.
   */
  landingImpulse(impact: number): void {
    const t = this.tuning;
    if (!(impact > 0)) return;
    this.dip = Math.min(t.landingDipMax, this.dip + impact * t.landingDipPerImpact);
  }

  /** One fixed simulation step. */
  step(dt: number, input: ChaseCameraInput): void {
    if (dt <= 0) return;
    const t = this.tuning;

    const speedFactor = clamp01(Math.abs(input.speed) / t.speedReference);

    // -- Crash framing (M6, `docs/PLANS.md` §5) -----------------------------
    // "Detach and ease to a wider framing keeping both rider and wheel in
    // shot." One blend, and every use of it below reduces to the M3/M4/M5
    // camera exactly when it is zero — which it is at every moment the rider is
    // on the wheel. It eases *out* faster than it eases in, so a recovery hands
    // the ordinary view back promptly rather than making the player wait for
    // the camera to finish being cinematic.
    this.crashFrame = approach(
      this.crashFrame,
      input.crashed ? 1 : 0,
      input.crashed ? t.crashFrameSeconds : t.crashRestoreSeconds,
      Infinity,
      dt,
    );

    // -- Crash focus (1.3.1): keep the rider, not just the wheel, in shot ---
    // On the body while the rider is down, on the wheel otherwise — a zero
    // target, so riding is untouched.
    const focusWeight = input.crashed ? 1 : 0;
    const bodyDX = input.bodyX - input.x;
    const bodyDY = input.bodyY - input.y;
    const bodyDZ = input.bodyZ - input.z;
    // A wheel that moved further than it could travel was *put* somewhere —
    // a crash recovery at the last safe spot, a respawn — and the camera has
    // always moved with it in one step; the focus goes with it rather than
    // gliding across the map from where the body lay. The bench's teleport
    // rule (`movedByReset`): the faster speed's travel plus a metre.
    const travel = Math.hypot(input.x - this.lastX, input.z - this.lastZ);
    const placed = travel > Math.max(Math.abs(input.speed), Math.abs(this.lastSpeed)) * dt + 1;
    this.lastX = input.x;
    this.lastZ = input.z;
    this.lastSpeed = input.speed;
    if (placed) {
      this.focusX = 0;
      this.focusY = 0;
      this.focusZ = 0;
    }
    this.focusX = approach(this.focusX, bodyDX * focusWeight, t.crashFocusSeconds, t.crashFocusMaxRate, dt);
    this.focusY = approach(this.focusY, bodyDY * focusWeight, t.crashFocusSeconds, t.crashFocusMaxRate, dt);
    this.focusZ = approach(this.focusZ, bodyDZ * focusWeight, t.crashFocusSeconds, t.crashFocusMaxRate, dt);

    // -- Terrain visibility: aim at ground the rider has not reached yet ----
    // Expressed as seconds of travel, so it scales with speed for free.
    // Reverse contributes nothing: a rider backing up to reposition does not
    // want the camera aiming behind them.
    //
    // A crash retires it entirely: there is nowhere the rider is going, and
    // aiming down the road would put the thing that just happened at the bottom
    // of the frame.
    const lookAheadTarget = (1 - this.crashFrame) * clamp(
      Math.max(0, input.speed) * t.lookAheadSeconds,
      0,
      t.lookAheadMax,
    );
    this.lookAhead = approach(
      this.lookAhead,
      lookAheadTarget,
      t.lookAheadResponseSeconds,
      Infinity,
      dt,
    );

    // -- Speed sensation: arm length and field of view ----------------------
    // Both first-order, so neither can overshoot; the field of view moves the
    // more slowly of the two so it reads as a build rather than as a pulse.
    this.distance = approach(
      this.distance,
      lerp(
        lerp(t.distanceAtRest, t.distanceAtSpeed, speedFactor),
        t.crashDistance,
        this.crashFrame,
      ),
      t.distanceResponseSeconds,
      Infinity,
      dt,
    );
    this.fov = approach(
      this.fov,
      lerp(lerp(t.fovAtRest, t.fovAtSpeed, speedFactor), t.crashFov, this.crashFrame),
      t.fovResponseSeconds,
      Infinity,
      dt,
    );

    // -- Yaw follow, with a lag that SHORTENS as speed rises ----------------
    // Backwards from the intuitive choice, and deliberately so: at a standstill
    // the wheel can pivot at 2.4 rad/s and a tight camera would whip, while at
    // speed the player wants to feel locked in behind the wheel. Both headings
    // are unwrapped, so this converges without ever crossing the seam.
    this.yaw = approach(
      this.yaw,
      input.headingY,
      lerp(t.yawLagAtRest, t.yawLagAtSpeed, speedFactor),
      Infinity,
      dt,
    );

    // -- Rider readability: bank into the corner, capped --------------------
    this.bank = approach(
      this.bank,
      bankTargetFor(input.rollAngle, t),
      t.bankResponseSeconds,
      Infinity,
      dt,
    );

    // -- Airborne: keep the rider framed without taking the horizon with them
    // `docs/PLANS.md` §5. On the ground both the target and the current value
    // are zero, so this is a no-op and the M3/M4 camera is untouched; the only
    // moments it can do anything are a flight and the ease-out after one.
    //
    // **M44: a flight over a hole measures the hop from where it left.** The
    // rule above reads the hop off the ground directly under the rider, which
    // is the hop on every ground that stays put. Over an EUClaude alley the
    // ground falls 11 m in one step, and the same rule turned that into ~7 m of
    // lag in a tenth of a second: the camera dropped into the alley, below the
    // roof decks, and filled the frame with a building front; a short flight
    // that crashed then left that lag easing out while the rider lay on the
    // alley floor, which put the camera under the ground. So the camera latches
    // the ground the flight left from, and only when the ground beneath has
    // fallen more than `deepDropMetres` below it does it measure the hop from
    // there instead — **and only when that ground fell away in a single step
    // by more than `sheerDropMetres` somewhere in the flight**, which is a
    // building's edge and never a hillside. Switchback's summit stands 16 m
    // over its slopes and a fast rider off its rim does fly more than 9 m over
    // them, but its terrain never falls more than 0.37 m between two steps, so
    // it keeps the pre-M44 camera along with every other world without a sheer
    // drop. Otherwise the pre-M44 expression runs verbatim, bit for bit.
    let fromTakeoff = false;
    if (input.airborne) {
      if (Number.isNaN(this.takeoffY)) {
        // The first airborne step. A camera snapped into the air has seen no
        // ground, so that one flight starts from the ground under it now.
        this.takeoffY = Number.isNaN(this.groundedY) ? input.groundY : this.groundedY;
        this.flightGroundY = this.takeoffY;
        this.deepFlight = false;
        this.sheerFlight = false;
      }
      if (this.flightGroundY - input.groundY > t.sheerDropMetres) this.sheerFlight = true;
      this.flightGroundY = input.groundY;
      fromTakeoff = this.sheerFlight && this.takeoffY - input.groundY > t.deepDropMetres;
      if (fromTakeoff) this.deepFlight = true;
    } else {
      this.groundedY = input.groundY;
      this.takeoffY = Number.NaN;
      this.flightGroundY = Number.NaN;
    }
    this.heightLag = approach(
      this.heightLag,
      input.airborne
        ? fromTakeoff
          ? Math.max(0, input.y - this.takeoffY) * (1 - t.airHeightFollow)
          : Math.max(0, input.y - input.groundY) * (1 - t.airHeightFollow)
        : 0,
      input.airborne ? t.airHeightResponseSeconds : t.landingRestoreSeconds,
      Infinity,
      dt,
    );
    // After a deep flight the lag is held to the rider's own height above the
    // ground beneath, so the anchor can never sit under the ground the rider
    // comes down on: a flight that comes up short lands in the alley with the
    // lag it carried, and easing that out over the landing restore was the
    // camera under the ground. Only on this path, so every shallow landing
    // keeps its eased restore.
    if (this.deepFlight) {
      this.heightLag = Math.min(this.heightLag, Math.max(0, input.y - input.groundY));
    }
    // The landing dip decays. It is only ever *set* by `landingImpulse`.
    this.dip = approach(this.dip, 0, t.landingDipRecoverSeconds, Infinity, dt);

    // -- Playability: obstruction, applied last so it overrides the rest ----
    const clearance = this.clearance(input);
    const limited = Math.max(
      t.obstructionMinDistance,
      Math.min(this.distance, clearance),
    );
    // Fast in, slow out. Symmetric rates give you either a camera that spends
    // frames inside a wall or one that snaps outward past every pillar.
    const response = limited < this.armDistance
      ? t.obstructionPullInSeconds
      : t.obstructionRestoreSeconds;
    this.armDistance = approach(this.armDistance, limited, response, Infinity, dt);
  }

  /** Fill a caller-owned state. Allocation-free; called twice per step. */
  writeState(target: ChaseCameraState): void {
    target.yaw = this.yaw;
    target.distance = this.distance;
    target.armDistance = this.armDistance;
    target.fov = this.fov;
    target.bank = this.bank;
    target.lookAhead = this.lookAhead;
    target.heightLag = this.heightLag;
    target.dip = this.dip;
    target.crashFrame = this.crashFrame;
    target.focusX = this.focusX;
    target.focusY = this.focusY;
    target.focusZ = this.focusZ;
  }

  /**
   * Longest arm the world allows, in arm-length units.
   *
   * The plan asks for a sphere-cast. The level's collider set answers rays, so
   * this casts one along the arm and insets the result by the radius the
   * camera wants kept clear — the same answer for a convex obstruction
   * approached head on, and conservative rather than optimistic elsewhere. A
   * true swept sphere becomes worth writing when M4 brings geometry with
   * corners to catch on; the interface above does not change when it does.
   *
   * The hit comes back as a distance along the anchor-to-camera line, which
   * rises as it goes; scaling by `distance / length` converts it back into the
   * horizontal arm length the rest of the camera is expressed in.
   */
  private clearance(input: ChaseCameraInput): number {
    if (this.probe === null) return Infinity;
    const t = this.tuning;

    // From the crash focus, which is the wheel itself whenever riding.
    const centreX = input.x + this.focusX;
    const centreY = input.y + this.focusY;
    const centreZ = input.z + this.focusZ;
    const anchorY = centreY - this.heightLag + t.anchorHeight;
    const desiredX = centreX - Math.sin(this.yaw) * this.distance;
    const desiredY = centreY + t.armHeight;
    const desiredZ = centreZ - Math.cos(this.yaw) * this.distance;

    const dx = desiredX - centreX;
    const dy = desiredY - anchorY;
    const dz = desiredZ - centreZ;
    const length = Math.hypot(dx, dy, dz);
    if (length <= 1e-6) return Infinity;

    this.probeOrigin.x = centreX;
    this.probeOrigin.y = anchorY;
    this.probeOrigin.z = centreZ;
    this.probeDirection.x = dx;
    this.probeDirection.y = dy;
    this.probeDirection.z = dz;

    const hit = this.probe(this.probeOrigin, this.probeDirection, length);
    if (hit === null) return Infinity;

    return Math.max(0, hit - t.obstructionRadius) * (this.distance / length);
  }
}

/**
 * Turn an interpolated camera state and an interpolated rider pose into a
 * placeable view. Pure, and fills a caller-owned object.
 *
 * The camera slides *along* the arm when it is pulled in rather than dropping
 * straight down, which is what keeps a pull-in from becoming a sudden
 * looking-down-at-the-rider shot. The look target uses the rider's true
 * heading rather than the camera's lagged yaw, on purpose: during a corner the
 * arm trails behind while the aim already leads into the turn, which is what
 * makes the lag read as the camera catching up rather than as the rider
 * sliding sideways out of frame.
 *
 * The landing dip moves the camera **and** its target by the same amount, so
 * the view direction is unchanged and the whole image shifts. Dropping only
 * the camera would pitch the view up at the moment of impact, which reads as
 * looking at the sky rather than as absorbing a landing.
 */
export function resolveChaseView(
  state: ChaseCameraState,
  input: ChaseCameraInput,
  tuning: ChaseCameraTuning,
  out: ChaseCameraView,
): void {
  // The crash focus is exactly zero while riding (1.3.1).
  const centreX = input.x + state.focusX;
  const centreZ = input.z + state.focusZ;
  const anchorY = input.y + state.focusY - state.heightLag + tuning.anchorHeight - state.dip;
  const extension = state.distance > 1e-6 ? state.armDistance / state.distance : 1;
  // Higher as well as further back during a crash, so a rider on the ground
  // beside a wheel that is still rolling both fit in the shot. Zero crash
  // frame returns `tuning.armHeight` exactly.
  const armHeight = lerp(tuning.armHeight, tuning.crashArmHeight, state.crashFrame);

  out.positionX = centreX - Math.sin(state.yaw) * state.armDistance;
  out.positionY = anchorY + (armHeight - tuning.anchorHeight) * extension;
  out.positionZ = centreZ - Math.cos(state.yaw) * state.armDistance;

  out.targetX = centreX + Math.sin(input.headingY) * state.lookAhead;
  out.targetY = anchorY;
  out.targetZ = centreZ + Math.cos(input.headingY) * state.lookAhead;

  out.fov = state.fov;
  out.roll = state.bank;
}
