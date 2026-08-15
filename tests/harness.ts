/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, type ConsoleMessage, type Page } from '@playwright/test';
import type { Game, GameSnapshot, ResourceCounts } from '../src/app/Game.ts';
import type { PressedAction, ScriptedActions } from '../src/input/actions.ts';

/**
 * Shared browser-test harness.
 *
 * Everything here drives the game through `window.game`, the QA bridge on the
 * game object. Three rules are baked in rather than left to each spec:
 *
 *   1. **Never wait on wall-clock time to reach a simulation state.** Automated
 *      tabs throttle animation frames, so a timeout can pass without a single
 *      step. `advance()` steps the real update path at a fixed `dt` and forces
 *      a render.
 *   2. **Freeze the loop first.** With simulation live it keeps stepping
 *      between two automation calls, so anything sampled in one call has moved
 *      on by the next — and a transient is always captured as its aftermath.
 *   3. **Loop inside the page, not across the wire.** A spec that steps from
 *      Node pays one round trip per chunk and dies on the test timeout without
 *      ever reaching an assertion. The loops live in `installToolkit`; the wire
 *      carries one summary per high-level operation (master starter 17.2).
 */

declare global {
  interface Window {
    game: Game;
    qa: Toolkit;
  }
}

/** One sample of the ride, small enough to send thousands of over the wire. */
export interface RideSample {
  x: number;
  z: number;
  speed: number;
  headingY: number;
  rollAngle: number;
  riderRoll: number;
  lateralAccel: number;
  lateralLimited: boolean;
  state: string;
  // -- Ground (M4) ----------------------------------------------------------
  y: number;
  surface: string;
  offCourse: boolean;
  slope: number;
  rollingResistance: number;
  lateralLimitG: number;
  suspensionOffset: number;
  curbAhead: number;
  lastStepUp: number;
  blocked: boolean;
  // -- Air (M5) -------------------------------------------------------------
  grounded: boolean;
  airHeight: number;
  verticalVelocity: number;
  pedalStrike: number;
  landings: number;
  landingQuality: string;
}

/** What the level produced on the render side. Names, counts, and materials. */
export interface TerrainScene {
  /** Present at M1-M3, and gone from M4: the renderer's own copy of the ground. */
  placeholderGroundPresent: boolean;
  placeholderGridPresent: boolean;
  heightfieldPresent: boolean;
  surroundPresent: boolean;
  /** One draw per surface group on the single heightfield geometry. */
  heightfieldGroups: number;
  heightfieldTriangles: number;
  /** Whether the mesh carries the per-vertex mottle that replaced the grid. */
  heightfieldHasVertexColours: boolean;
  /** Distinct albedo values across the heightfield's material groups. */
  heightfieldColours: string[];
  /** Merged block meshes, one per material. */
  blockMeshes: string[];
  blockTriangles: number;
  /**
   * Where the surround backstop currently sits. It follows the rider in X and
   * Z, and its **height must be below every sample in the plan** — a backstop
   * parked at the surround draws a lid over anything authored below it, which
   * is what hid M7's entire river valley until a ride found it.
   */
  surroundCentre: { x: number; z: number; y: number };
  fog: { near: number; far: number } | null;
  /**
   * M7.5 stage 4's road paint, as the scene actually built it.
   *
   * All of it is one mesh with two paints on the vertex colour, so `meshes` of
   * more than one means somebody split the material and spent a draw call.
   */
  paint: {
    meshes: number;
    triangles: number;
    hasVertexColours: boolean;
    /** Paint is the road, not a thing standing on it: it receives, never casts. */
    castsShadow: boolean;
    receivesShadow: boolean;
    /** Distinct linear tones on the mesh, rounded — the two paints plus wear. */
    darkestTone: number;
    brightestTone: number;
  };
}

export interface RideSegment {
  actions: ScriptedActions;
  steps: number;
}

export interface Toolkit {
  snap(): GameSnapshot;
  freeze(): GameSnapshot;
  thaw(): GameSnapshot;
  advance(steps: number): GameSnapshot;
  /**
   * Latch a one-shot, step, and report how many times it was claimed.
   *
   * **`PressedAction` rather than a hand-written union**, which is what this
   * parameter was until M14 — and it had already drifted, missing `muteAudio`
   * since M8. A copied union does not fail when the real one grows; it simply
   * makes the new action untestable through the harness, which is the quietest
   * possible way for a one-shot to ship unproven.
   */
  fireOnce(action: PressedAction, steps: number): {
    before: number;
    after: number;
    afterMoreSteps: number;
  };
  /** Sample GPU object counts across N rounds of work, in one round trip. */
  resourceTrace(rounds: number, stepsEach: number): ResourceCounts[];
  /** Record how far the rider has ridden, each frame, while the loop runs. */
  interpolationTrace(frames: number): Promise<{ alphas: number[]; ridden: number[] }>;

  // -- The ride ------------------------------------------------------------
  /** Freeze, reset the rider to spawn, and drop any scripted input. */
  resetRide(): GameSnapshot;
  /** Run a scripted ride; one snapshot per segment, one round trip in total. */
  drive(script: RideSegment[]): GameSnapshot[];
  /** Hold an input and sample the ride every `every` steps. */
  rideTrace(actions: ScriptedActions, steps: number, every: number): RideSample[];
  /** Hold an input until the wheel stops, and report what that cost. */
  rideUntilStopped(actions: ScriptedActions, maxSteps: number): {
    steps: number;
    distance: number;
    speed: number;
    stopped: boolean;
  };
  /** Where the rig actually is in the scene, as three.js has it. */
  rigTransform(): {
    position: { x: number; y: number; z: number };
    headingY: number;
    /** EUC-only local wobble yaw/roll beneath the clean rider root. */
    machineYaw: number;
    machineRoll: number;
    leanRoll: number;
    wheelPitch: number;
    wheelSpin: number;
    pelvisRoll: number;
    pelvisPitch: number;
    /** Chest twist about the torso's vertical: + opens toward rider-left. */
    pelvisYaw: number;
    pelvisY: number;
    /** Fore-aft hip shift in the rider's frame: + is ahead of neutral. */
    pelvisZ: number;
    /** Neck counter-pitch stabilising the head against the torso hinge. */
    neckPitch: number;
    /** Head yaw relative to the torso: + is toward rider-left. */
    neckYaw: number;
    leftHipY: number;
    rightHipY: number;
    /** Knee flex in radians: zero is straight, larger is more deeply bent. */
    leftKneeFlex: number;
    rightKneeFlex: number;
    /**
     * Each knee's lateral offset from its own ankle, in the rider's frame,
     * signed outboard (positive is away from the wheel on that leg's side).
     * This is what the inside knee opening toward the apex looks like as a
     * number.
     */
    leftKneeOutboard: number;
    rightKneeOutboard: number;
    /** Fore-aft ankle positions in the rider root's frame. */
    leftAnkleZ: number;
    rightAnkleZ: number;
    /** Ankle heights in the rider root's frame; moving pedals alternate them. */
    leftAnkleY: number;
    rightAnkleY: number;
    riderPresent: boolean;
    scaleReferencePresent: boolean;
  };
  /**
   * Project points around the rider into normalised device coordinates.
   *
   * The only measurement in the whole suite that can tell left from right.
   * Everything else — the controller, the rig, the headless assertions — is
   * expressed in the world frame, so if that frame is wrong they all agree
   * with each other and all of them are wrong. Screen space is the arbiter.
   * `x` is -1 at the left edge of the viewport and +1 at the right.
   */
  screenProbe(distance: number): {
    riderRight: { x: number; y: number; inFront: boolean };
    riderLeft: { x: number; y: number; inFront: boolean };
    ahead: { x: number; y: number; inFront: boolean };
    rider: { x: number; y: number; inFront: boolean };
  };
  /**
   * Project one fixed world point to NDC.
   *
   * The camera is rigidly locked to the heading at M2, so a point *ahead of
   * the rider* is always dead centre however hard they are turning. A
   * stationary landmark is the thing that moves.
   */
  projectPoint(x: number, y: number, z: number): { x: number; y: number; inFront: boolean };
  /** Where the camera is, and what it is looking at. */
  cameraTransform(): {
    mode: string;
    position: { x: number; y: number; z: number };
    /** Distance from the camera to the rider's contact patch. */
    distanceToRider: number;
    /** Signed offset of the rider from the camera's forward axis, in metres. */
    lateralOffset: number;
    /** Horizontal spring-arm length: camera to rider, ignoring the rise. */
    armLength: number;
    /** Vertical field of view actually on the projection matrix, in radians. */
    fov: number;
    /** The camera's own stepped state, as the QA bridge reports it. */
    state: {
      yaw: number;
      distance: number;
      armDistance: number;
      fov: number;
      bank: number;
      lookAhead: number;
    };
    /** World point the camera is aimed at. Near the centre of the screen. */
    target: { x: number; y: number; z: number };
    /** How far the camera trails the rider's heading, radians, wrapped. */
    yawLag: number;
  };
  /**
   * The on-screen lean of a world-vertical line, in NDC x.
   *
   * **The only measurement that can tell which way the camera banked.** A
   * camera whose up axis tilts toward the right of the screen makes the world
   * appear to rotate the other way, exactly as tilting your head does — so a
   * negative value here means the camera banked to the right. Reading the
   * camera's own transform instead would be a world-space check of a
   * screen-space claim, which is the failure `docs/LESSONS_LEARNED.md` is
   * about.
   */
  screenTilt(x: number, z: number, yBottom: number, yTop: number): {
    tilt: number;
    bottom: { x: number; y: number; inFront: boolean };
    top: { x: number; y: number; inFront: boolean };
  };
  /**
   * Which way the helmet is facing, on screen, relative to the torso.
   *
   * Projects a point in front of the helmet and one in front of the chest, and
   * reports each as an NDC offset from its own joint. Positive is toward the
   * right of the screen, so a right-hand corner must produce a positive head
   * offset — and one larger than the torso's, or the head has not turned
   * relative to the body at all.
   */
  lookProbe(): {
    headOffsetX: number;
    torsoOffsetX: number;
    neckYaw: number;
    neckPitch: number;
  };
  /**
   * Both hands in the TORSO's frame, which is the frame the arm targets are
   * authored in.
   *
   * Measuring in the rider's root frame instead would fold the braking
   * hip-shift and the torso hinge into the reading — a rider leaning back
   * 0.28 rad moves their shoulders 14 cm rearward, which would swamp a 5 cm
   * arm reaction and report it backwards. `outboard` is signed away from the
   * centreline on that hand's own side.
   */
  handPose(): {
    left: { outboard: number; height: number; forward: number };
    right: { outboard: number; height: number; forward: number };
    /** Hand height above the ground, for the never-handlebar-like check. */
    leftWorldY: number;
    rightWorldY: number;
  };
  /**
   * Where the centre of the screen meets the ground, and how far ahead of the
   * rider that is.
   *
   * The direct answer to "can I see where I'm going": it is the distance of
   * the ground the player is looking straight at, and it grows when the camera
   * lengthens its arm and aims further ahead.
   */
  groundAtScreenCentre(): { x: number; z: number; aheadOfRider: number; hitsGround: boolean };
  /** Sample the camera every `every` steps while an input is held. */
  cameraTrace(actions: ScriptedActions, steps: number, every: number): {
    headingY: number;
    yaw: number;
    yawLag: number;
    armDistance: number;
    fov: number;
    bank: number;
    lookAhead: number;
    speed: number;
  }[];
  /** Script a camera obstruction, or `null` to hand it back to the level. */
  setOcclusion(distance: number | null): GameSnapshot;

  // -- Routes (M7) ----------------------------------------------------------
  /**
   * The centreline of a list of segments, as a polyline, from the plan alone.
   *
   * Reconstructed rather than exported: a `Segment` carries two sockets and the
   * arc between them is determined by the pair, so the polyline is derivable
   * from the plain data invariant 2 already ships. That matters — it means a
   * route can be driven against any `LevelPlan`, including one M12 generates,
   * without the level module having to hand the test an answer.
   */
  routePoints(ids: readonly string[], spacing: number): { x: number; z: number }[];
  /**
   * Drive a polyline with a pure-pursuit controller and report what it cost.
   *
   * **This is how "the shortcut is genuinely faster" stops being an assertion
   * about lengths and becomes a measurement of two rides.** The controller aims
   * at a point a fixed distance ahead on the line and steers toward it, which
   * is the simplest thing that follows a corridor at speed without knowing
   * anything about the level; it is deliberately not a good driver, so both
   * routes are driven equally badly and the comparison is fair.
   */
  followRoute(
    points: readonly { x: number; z: number }[],
    options: {
      lookAhead: number;
      maxSteps: number;
      throttle?: number;
      /**
       * Speed the driver will brake back to, m/s. Defaults to no limit.
       *
       * **A speed policy, added at M16 alongside the raised top speed.** This
       * driver has two gains and no eyes, and every route spec that used it was
       * calibrated against a wheel that ran out of pull at 15 m/s. Simply
       * lowering `throttle` to reach the same speed is not the same thing: it
       * lowers the wheel's *climbing* authority too, and a slice route that a
       * quarter-throttle wheel cannot get up a hill is not the route failing.
       * A cap leaves the acceleration and the hill climbing exactly as they
       * were and takes away only the speed a human would have braked off.
       */
      maxSpeed?: number;
    },
  ): {
    finished: boolean;
    steps: number;
    seconds: number;
    distance: number;
    meanSpeed: number;
    minSpeed: number;
    crashes: number;
    blockedSteps: number;
    offCourseSteps: number;
    landings: number;
    worstLanding: string;
  };

  // -- Terrain (M4) ---------------------------------------------------------
  /**
   * Hold an input until a named quantity passes a threshold, or give up.
   *
   * The terrain specs all need "ride to the kerb", "ride past the gate", "ride
   * onto the grass" — a fixed step count would have to be re-tuned every time a
   * surface's rolling resistance moves, which is a value the owner is expected
   * to move with F4 during this exact milestone.
   */
  rideUntil(
    actions: ScriptedActions,
    field: 'x' | 'z' | 'speed' | 'distance',
    beyond: number,
    maxSteps: number,
  ): { reached: boolean; steps: number; snapshot: GameSnapshot };
  /**
   * Put the rider at a stated place and heading, through the bridge.
   *
   * Freezes and drops scripted input first, so a spec that places the rider
   * and then holds a key is not also carrying whatever the previous spec held.
   */
  placeRider(x: number, z: number, headingY: number): GameSnapshot;
  /** What the level says the ground is at a point, through the real sampler. */
  groundAt(x: number, z: number): {
    height: number;
    normal: { x: number; y: number; z: number };
    surface: string;
    offCourse: boolean;
  };
  /** What the renderer built from the plan. */
  terrainScene(): TerrainScene;
  /**
   * The camera's arm against the arm it wanted, sampled over a ride.
   *
   * Reported as the ratio so an assertion does not have to know how far the
   * speed easing had got when the obstruction fired.
   */
  occlusionTrace(actions: ScriptedActions, steps: number, every: number): {
    z: number;
    x: number;
    distance: number;
    armDistance: number;
    ratio: number;
  }[];
  // -- Air (M5) --------------------------------------------------------------
  /**
   * Fire one hop and fly it to the ground, sampling every step.
   *
   * One round trip for the whole flight. A spec that stepped from Node would
   * pay a round trip per sample and would still be sampling the aftermath
   * rather than the transient (master starter 17.2).
   */
  hopTrace(actions: ScriptedActions, chargeSteps: number, maxSteps: number): {
    /** Steps spent compressing before the wheel left the ground. */
    compressSteps: number;
    airSteps: number;
    apex: number;
    landed: boolean;
    landingQuality: string;
    landingImpact: number;
    landingScore: number;
    speedBefore: number;
    speedAfter: number;
    hops: number;
    /** The rig's world height, sampled at the apex, as three.js has it. */
    rigApexY: number;
    /** Rider crouch at the deepest point of the compression, 0..1. */
    compressionCrouch: number;
    /** Camera height offset and dip at the apex and just after landing. */
    cameraLagAtApex: number;
    cameraDipAfterLanding: number;
    /** Live particles just after touchdown. */
    dustAfterLanding: number;
  };
  /**
   * Freeze the game mid-flight, at a stated fraction of the way to the apex.
   *
   * The rule the whole suite is built on: a transient has to be frozen before
   * it can be captured, or the screenshot is of its aftermath.
   */
  freezeMidHop(actions: ScriptedActions, fraction: number): GameSnapshot;
  /** Hold a carve until a pedal is scraping, and report what that cost. */
  scrapeTrace(steer: number, warmupSteps: number, steps: number): {
    rollAngle: number;
    pedalClearance: number;
    pedalStrike: number;
    state: string;
    speed: number;
    sparks: number;
    /** Which boot the rig actually lifted, in the rider's own frame. */
    leftAnkleY: number;
    rightAnkleY: number;
  };
  // -- Wobble, power, crash (M6) --------------------------------------------
  /**
   * Ride with a held input and report what the *rig* did about the wobble.
   *
   * The controller's oscillator is proved headlessly; what only a browser can
   * show is that the deviation reaches the screen — the wheel's rendered yaw
   * against the heading it is nominally holding, and the rider's stance
   * answering it. One round trip for the whole ride.
   */
  wobbleTrace(actions: ScriptedActions, steps: number, every: number): {
    wobbleEnergy: number;
    wobbleYaw: number;
    wobbleRoll: number;
    wobbleFootCorrection: number;
    /** Rider root remains on the clean heading. */
    rigYawOffset: number;
    /** The machine child carries the coupled yaw/roll. */
    machineYaw: number;
    machineRoll: number;
    /** Pelvis height and counter-yaw in the rider's own frame. */
    pelvisY: number;
    pelvisYaw: number;
    /** Hand splay, signed outboard, in the torso frame. */
    leftOutboard: number;
    rightOutboard: number;
    state: string;
    surface: string;
    /** The machine's status light, right now. */
    statusColour: string;
    statusIntensity: number;
  }[];
  /**
   * Crash the rider, then sample the whole event: the separation as the scene
   * has it, the camera's framing, and whether the recovery arrives.
   *
   * Steering is sawed back and forth on a rough surface, which is how a player
   * actually loses it — the two causes the vision names together.
   */
  crashRun(maxSteps: number): {
    crashed: boolean;
    cause: string;
    motion: string;
    /** Rider position relative to the wheel, in the wheel's own frame. */
    separation: { x: number; y: number; z: number };
    riderTilt: { pitch: number; roll: number };
    /** The riderless wheel's own lean, radians. */
    wheelLean: number;
    /** Both the rider and the wheel projected to NDC, at the crash framing. */
    riderOnScreen: { x: number; y: number; inFront: boolean };
    wheelOnScreen: { x: number; y: number; inFront: boolean };
    armBefore: number;
    armDuring: number;
    fovDuring: number;
    crashFrame: number;
    statusColour: string;
    /** After the recovery: where the rider ended up, and the run's counters. */
    recovered: boolean;
    recoveredAtSafeSpot: boolean;
    recoveryStatusColour: string;
    recoveryStatusIntensity: number;
    crashes: number;
    armAfter: number;
  };
  /** Read the machine's status light straight off its material. */
  statusLight(): { colour: string; intensity: number; present: boolean };

  // -- Audio (M8) -----------------------------------------------------------
  /**
   * Ride, and sample what the audio layer decided as well as what the wheel
   * did.
   *
   * Deliberately one trace carrying both: every M8 acceptance sentence is a
   * *relation* between a ride quantity and an audio one — motor pitch against
   * speed, tyre voice against surface, wind against speed — and two traces
   * taken separately can only be compared by assuming they lined up.
   */
  audioTrace(actions: ScriptedActions, steps: number, every: number): AudioSample[];
  /**
   * Visit one patch of every surface the level actually paints, and report
   * what the tyre sounded like on each.
   *
   * Finds the patches from the plan's own heightfield rather than from
   * hard-coded coordinates, so it works on the slice, on the proving ground,
   * and on whatever M12 generates. A cell only qualifies if its whole 3×3
   * neighbourhood shares its surface — otherwise the rider is standing on a
   * boundary and the crossfade, correctly, reports a blend.
   */
  audioSurfaceSweep(): {
    surface: string;
    /** The `tyreAudio` id the surface table declares. */
    expected: string;
    /** The voice the audio layer actually selected. */
    voice: string;
    tyreGain: number;
  }[];
  /**
   * Force the power ladder to a rung and measure what the wheel does about it.
   *
   * The ladder's thresholds are live tunables, which is what makes this
   * reachable without riding the return climb at a specific speed — and the
   * override is reset before returning, so the spec after this one rides the
   * shipped wheel.
   */
  audioLadder(rungLoad: number, seconds: number): {
    stage: string;
    beeps: number;
    /** Deepest the ride bed was pushed while the rung sounded. */
    lowestBed: number;
    /** And where it sits with the ladder quiet, for the comparison. */
    quietBed: number;
    /**
     * Deepest duck seen, not the duck at the end.
     *
     * The duck is *pulsed* by each beep rather than held for the whole rung —
     * that is what makes the notice rung a brief dip and tilt-back a sustained
     * one — so a reading taken at an arbitrary moment lands between two beeps
     * about as often as not.
     */
    maxDuck: number;
  };
  /**
   * RMS actually leaving the master bus, after letting the audio clock run.
   *
   * The one measurement here that is not upstream of the graph: everything
   * else proves what *should* be playing. `settleMs` is real wall-clock time
   * on the audio thread, which is the one place in this harness where waiting
   * on the clock is correct rather than a flake.
   */
  audioOutput(settleMs: number): Promise<number>;
  /**
   * The loudest of several RMS windows spread across a real span, so a
   * transient's level cannot be missed by sampling one arbitrary instant.
   *
   * `audioOutput` reads a single ~43 ms analyser block after a wait, which is
   * the right shape for sustained content and the wrong one for a recording
   * whose level breathes — the M10 QA pass caught the crash test red purely
   * because its one window landed in a quiet stretch of the tumble. Same
   * audio-clock caveat as `audioOutput`.
   */
  audioOutputMax(spanMs: number, windows: number): Promise<number>;
  /**
   * The loudest sustained content above and below a frequency, in dBFS.
   *
   * **The arcade rule, as a measurement.** "No sustained tone up where a
   * continuous sound rings" is a claim about the spectrum, and the spectrum is
   * downstream of every model assertion in this file — the M8 first pass put a
   * carrier 66 dB clear of its neighbours with every headless test green, and
   * the owner heard it immediately. Same audio-clock caveat as `audioOutput`.
   */
  audioBandPeaks(splitHz: number, settleMs: number): Promise<{
    /** Loudest bin below `splitHz`, and the frequency it sits at. */
    lowDb: number;
    lowHz: number;
    /** Loudest bin above it, likewise. */
    highDb: number;
    highHz: number;
  }>;
  /** Where the rig's parts actually ended up, including the M4 additions. */
  groundRigTransform(): {
    groundPitch: number;
    groundRoll: number;
    /** World-space height of the sprung mass above the contact patch. */
    bodyOffset: number;
    riderOffset: number;
    rigY: number;
    /** The EUC's own resting tilt toward the pedal-side leg, radians. */
    eucRestLean: number;
    /** The rendered fore-aft hinge above the wheel: pelvis rotation about X. */
    pelvisPitch: number;
  };
}

/** One sample of the ride and of what the audio layer made of it (M8). */
export interface AudioSample {
  speed: number;
  surface: string;
  grounded: boolean;
  motorHz: number;
  motorGain: number;
  /** The motor filter — where load and braking are heard, since M8's rework. */
  motorCutoffHz: number;
  motorQ: number;
  regenGain: number;
  windGain: number;
  tyreGain: number;
  tyreVoice: string;
  scrapeGain: number;
  bedGain: number;
  duck: number;
  /** Beeps started since boot. Rises only while a warning rung is lit. */
  beeps: number;
}

/** Console errors and page exceptions, for the "zero errors" assertion. */
/**
 * Switch the max-speed cutout off for this page — M20.
 *
 * **A fixture-scoping helper, not a workaround.** M20 gave the wheel a failure
 * at the very top of its speed range: hold above 96.5% of top speed for 0.45 s
 * and the rider goes down. Ten browser specs written long before it hold full
 * throttle for ten or twenty seconds to *reach* a settled top-speed state and
 * then measure something else — the camera arm at speed, the arms' cruise pose,
 * braking authority, the shape of the spectrum, whether a reset silences the
 * ride. Every one of them had quietly assumed that riding flat out forever is
 * safe, because until M20 it was, and none of them said so.
 *
 * Switching the cutout off is what makes each of those tests claim again what
 * it was written to claim. It goes through the **live-tuning store**, which is
 * the mechanism the owner's own F4 switch uses, so a spec that calls this is
 * riding a configuration a player can actually be in rather than a test-only
 * one. The cutout has its own coverage in `tests/m20.spec.ts`,
 * `src/simulation/EucController.test.ts` and `src/shared/overspeed.test.ts`.
 *
 * Call it after boot and before the ride. `LiveTuning` survives a world swap
 * (`Game.installLevel` replays `applyTuning` onto the fresh controller), so one
 * call covers a spec that regenerates a route.
 */
export async function disableMaxSpeedCutout(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.game.tuning.set('EUC.cutoutEnabled', 0);
  });
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * The in-page toolkit.
 *
 * Runs in the browser, so it may not import anything and must not assume the
 * page has been through a bundler.
 */
function installToolkit(): void {
  const game = window.game;

  const toolkit: Toolkit = {
    snap: () => game.snapshot(),

    freeze() {
      game.loop.setRunning(false);
      return game.snapshot();
    },

    thaw() {
      game.loop.setRunning(true);
      return game.snapshot();
    },

    advance(steps: number) {
      game.advance(steps);
      return game.snapshot();
    },

    fireOnce(action, steps) {
      const before = game.snapshot().consumed[action] ?? 0;
      game.setActions({ [action]: true });
      game.advance(steps);
      const after = game.snapshot().consumed[action] ?? 0;
      // A one-shot claimed twice would show up here and nowhere else: the
      // action still "works", it just fires again the moment it becomes legal.
      game.advance(240);
      const afterMoreSteps = game.snapshot().consumed[action] ?? 0;
      return { before, after, afterMoreSteps };
    },

    resourceTrace(rounds: number, stepsEach: number) {
      const trace: ResourceCounts[] = [];
      for (let i = 0; i < rounds; i += 1) {
        game.advance(stepsEach);
        trace.push(game.resources());
      }
      return trace;
    },

    interpolationTrace(frames: number) {
      // Driven from requestAnimationFrame deliberately: this is the one
      // measurement that has to observe the *real* loop rather than synthetic
      // frames, because interpolation only happens on real frames.
      game.setActions({ throttle: 1 });
      return new Promise((resolve) => {
        const alphas: number[] = [];
        const ridden: number[] = [];
        const tick = (): void => {
          const snapshot = game.snapshot();
          alphas.push(snapshot.loop.alpha);
          ridden.push(snapshot.euc.distanceTravelled);
          if (alphas.length >= frames) {
            game.setActions({ throttle: 0 });
            resolve({ alphas, ridden });
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      });
    },

    resetRide() {
      game.loop.setRunning(false);
      // Hand the axes back to the device rather than scripting them to zero:
      // a scripted zero *overrides* the keyboard until it is cleared, so a
      // spec that resets and then holds a real key would silently measure a
      // stationary wheel.
      game.clearActions();
      // Quick reset is a one-shot claimed inside `step`, so it needs a step to
      // be claimed in — driving the controller directly would bypass the wire
      // this is here to exercise.
      game.setActions({ reset: true });
      game.advance(1);
      return game.snapshot();
    },

    drive(script) {
      const results: GameSnapshot[] = [];
      for (const segment of script) {
        game.setActions(segment.actions);
        game.advance(segment.steps);
        results.push(game.snapshot());
      }
      return results;
    },

    rideTrace(actions, steps, every) {
      const samples: RideSample[] = [];
      game.setActions(actions);
      for (let taken = 0; taken < steps; taken += every) {
        game.advance(Math.min(every, steps - taken));
        const euc = game.snapshot().euc;
        samples.push({
          x: euc.position.x,
          z: euc.position.z,
          speed: euc.speed,
          headingY: euc.headingY,
          rollAngle: euc.rollAngle,
          riderRoll: euc.riderRoll,
          lateralAccel: euc.lateralAccel,
          lateralLimited: euc.lateralLimited,
          state: euc.state,
          y: euc.position.y,
          surface: euc.surface,
          offCourse: euc.offCourse,
          slope: euc.slope,
          rollingResistance: euc.rollingResistance,
          lateralLimitG: euc.lateralLimitG,
          suspensionOffset: euc.suspensionOffset,
          curbAhead: euc.curbAhead,
          lastStepUp: euc.lastStepUp,
          blocked: euc.blocked,
          grounded: euc.grounded,
          airHeight: euc.airHeight,
          verticalVelocity: euc.verticalVelocity,
          pedalStrike: euc.pedalStrike,
          landings: euc.landings,
          landingQuality: euc.landingQuality,
        });
      }
      return samples;
    },

    rideUntil(actions, field, beyond, maxSteps) {
      game.setActions(actions);
      const read = (): number => {
        const euc = game.snapshot().euc;
        if (field === 'x') return euc.position.x;
        if (field === 'z') return euc.position.z;
        if (field === 'speed') return euc.speed;
        return euc.distanceTravelled;
      };

      let steps = 0;
      while (steps < maxSteps && read() < beyond) {
        game.advance(4);
        steps += 4;
      }
      return { reached: read() >= beyond, steps, snapshot: game.snapshot() };
    },

    placeRider(x: number, z: number, headingY: number) {
      game.loop.setRunning(false);
      game.clearActions();
      game.placeRider({ x, y: 0, z }, headingY);
      return game.snapshot();
    },

    groundAt(x: number, z: number) {
      return game.sampleGround(x, z);
    },

    routePoints(ids, spacing) {
      const points: { x: number; z: number }[] = [];
      for (const id of ids) {
        const segment = game.levelPlan.segments.find((each) => each.id === id);
        if (segment === undefined) throw new Error(`no segment "${id}"`);
        const segmentPoints: { x: number; z: number; headingY: number }[] = [];

        // The arc between two sockets: the heading turns linearly along it, so
        // the curvature is the heading change over the length, and the length
        // is recovered from the chord when the beat is curved.
        const turn = segment.exit.headingY - segment.entry.headingY;
        const dx = segment.exit.position.x - segment.entry.position.x;
        const dz = segment.exit.position.z - segment.entry.position.z;
        const chord = Math.hypot(dx, dz);
        const length = Math.abs(turn) < 1e-9
          ? chord
          : (chord * (turn / 2)) / Math.sin(turn / 2);
        const curvature = length > 0 ? turn / length : 0;

        const count = Math.max(1, Math.round(length / spacing));
        for (let i = 0; i <= count; i += 1) {
          const s = (length * i) / count;
          const h0 = segment.entry.headingY;
          if (Math.abs(curvature) < 1e-9) {
            segmentPoints.push({
              x: segment.entry.position.x + Math.sin(h0) * s,
              z: segment.entry.position.z + Math.cos(h0) * s,
              headingY: h0,
            });
          } else {
            const h = h0 + curvature * s;
            segmentPoints.push({
              x: segment.entry.position.x + (Math.cos(h0) - Math.cos(h)) / curvature,
              z: segment.entry.position.z + (Math.sin(h) - Math.sin(h0)) / curvature,
              headingY: h,
            });
          }
        }

        // A physical route has to go around physical posts. The boulevard's
        // traffic refuge deliberately puts two metal bollards on the
        // centreline; before those narrow colliders used the machine's pedal
        // width, this reference driver could pass its tyre beside one and
        // accidentally treat the island's centre as the route. Find only
        // post-sized metal colliders that actually sit on this segment's
        // centreline (the plaza's flanking slalom stays untouched), then ease
        // the fixture three metres into the open lane around them. Two posts
        // eleven metres apart overlap into one continuous island detour.
        const centrePosts = segment.colliders.filter((collider) => (
          collider.appearance === 'metal'
          && Math.max(collider.halfExtents.x, collider.halfExtents.z) <= 0.12
          && segmentPoints.some((point) => Math.hypot(
            point.x - collider.centre.x,
            point.z - collider.centre.z,
          ) <= 1)
        ));
        for (const point of segmentPoints) {
          let detour = 0;
          for (const post of centrePosts) {
            const distance = Math.hypot(point.x - post.centre.x, point.z - post.centre.z);
            // Full lane offset within seven metres; a linear seven-metre lead
            // in/out beyond it is shallow enough for the ordinary follower.
            detour = Math.max(detour, Math.max(0, Math.min(1, (14 - distance) / 7)));
          }
          points.push({
            x: point.x + Math.cos(point.headingY) * 3 * detour,
            z: point.z - Math.sin(point.headingY) * 3 * detour,
          });
        }
      }
      return points;
    },

    followRoute(points, options) {
      if (points.length < 2) throw new Error('a route needs at least two points');
      game.loop.setRunning(false);
      game.clearActions();

      const start = points[0];
      const next = points[1];
      game.placeRider(
        { x: start.x, y: 0, z: start.z },
        Math.atan2(next.x - start.x, next.z - start.z),
      );

      const throttle = options.throttle ?? 1;
      const maxSpeed = options.maxSpeed ?? Infinity;
      let index = 0;
      let steps = 0;
      let sumSpeed = 0;
      let samples = 0;
      let minSpeed = Infinity;
      let blockedSteps = 0;
      let offCourseSteps = 0;
      const before = game.snapshot().euc;
      const startCrashes = before.crashes;
      const startLandings = before.landings;
      const startDistance = before.distanceTravelled;
      const tiers = ['clean', 'heavy', 'wobble', 'crash'];
      let worst = 0;

      while (steps < options.maxSteps) {
        const euc = game.snapshot().euc;
        const { x, z } = euc.position;

        // Advance the index past everything already behind the rider, then aim
        // at the first point beyond the look-ahead distance.
        while (
          index < points.length - 1
          && Math.hypot(points[index].x - x, points[index].z - z) < options.lookAhead
        ) index += 1;
        if (index >= points.length - 1
          && Math.hypot(points[points.length - 1].x - x, points[points.length - 1].z - z)
            < options.lookAhead) break;

        const target = points[index];
        const desired = Math.atan2(target.x - x, target.z - z);
        let error = desired - euc.headingY;
        while (error > Math.PI) error -= Math.PI * 2;
        while (error < -Math.PI) error += Math.PI * 2;

        // Two gains and nothing else: steer proportionally to the heading error,
        // and ease the throttle when the error is large so a corner is taken
        // rather than run wide out of. Both routes get the same driver.
        //
        // **The sign is negative and that is not a slip.** The steering axis is
        // the device's, and the device's is `steerRight - steerLeft`
        // (`input/bindings.ts`), so a positive input turns RIGHT — which is a
        // negative yaw rate about +Y (`data/tuning.ts`). A target to the rider's
        // left is a positive heading error and therefore a negative input. The
        // first draft of this driver had it the other way and rode in circles.
        const steer = Math.max(-1, Math.min(1, -error * 1.8));
        // The speed policy: shut the throttle above the cap, otherwise ride.
        // Closing the throttle rather than braking, because a brake held into
        // a corner is a second way to lose the wheel and this driver is not
        // meant to be tested on its recoveries.
        const eased = throttle * Math.max(0.25, 1 - Math.abs(error));
        game.setActions({ throttle: euc.speed > maxSpeed ? 0 : eased, steer });
        game.advance(2);
        steps += 2;

        const after = game.snapshot().euc;
        sumSpeed += after.speed;
        samples += 1;
        minSpeed = Math.min(minSpeed, after.speed);
        if (after.blocked) blockedSteps += 1;
        if (after.offCourse) offCourseSteps += 1;
        const tier = tiers.indexOf(after.landingQuality);
        if (tier > worst) worst = tier;
      }

      const end = game.snapshot().euc;
      const last = points[points.length - 1];
      game.clearActions();
      return {
        finished: Math.hypot(last.x - end.position.x, last.z - end.position.z) < options.lookAhead * 2,
        steps,
        seconds: steps / 120,
        distance: end.distanceTravelled - startDistance,
        meanSpeed: samples > 0 ? sumSpeed / samples : 0,
        minSpeed: minSpeed === Infinity ? 0 : minSpeed,
        crashes: end.crashes - startCrashes,
        blockedSteps,
        offCourseSteps,
        landings: end.landings - startLandings,
        worstLanding: tiers[worst],
      };
    },

    terrainScene() {
      const scene = game.renderer.scene;
      const heightfield = scene.getObjectByName('level-heightfield');
      const surround = scene.getObjectByName('level-surround');

      let groups = 0;
      let triangles = 0;
      let vertexColours = false;
      const colours: string[] = [];
      if (heightfield && 'geometry' in heightfield) {
        const mesh = heightfield as unknown as {
          geometry: {
            groups: { count: number }[];
            index: { count: number } | null;
            attributes: Record<string, unknown>;
          };
          material: { color: { getHexString(): string }; vertexColors: boolean }[];
        };
        groups = mesh.geometry.groups.length;
        triangles = (mesh.geometry.index?.count ?? 0) / 3;
        vertexColours = mesh.material.every((material) => material.vertexColors)
          && mesh.geometry.attributes.color !== undefined;
        for (const material of mesh.material) colours.push(material.color.getHexString());
      }

      const blockMeshes: string[] = [];
      let blockTriangles = 0;
      scene.traverse((object) => {
        if (!object.name.startsWith('level-blocks-')) return;
        blockMeshes.push(object.name);
        const mesh = object as unknown as { geometry: { index: { count: number } | null } };
        blockTriangles += (mesh.geometry.index?.count ?? 0) / 3;
      });

      const fog = scene.fog as unknown as { near: number; far: number } | null;

      const paint = (): TerrainScene['paint'] => {
        let meshes = 0;
        let triangles = 0;
        let hasVertexColours = true;
        let castsShadow = false;
        let receivesShadow = false;
        let darkestTone = Number.POSITIVE_INFINITY;
        let brightestTone = 0;
        scene.traverse((object) => {
          if (!object.name.startsWith('level-markings-')) return;
          meshes += 1;
          const mesh = object as unknown as {
            castShadow: boolean;
            receiveShadow: boolean;
            geometry: {
              index: { count: number } | null;
              attributes: { color?: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } };
            };
            material: { vertexColors: boolean };
          };
          triangles += (mesh.geometry.index?.count ?? 0) / 3;
          castsShadow = castsShadow || mesh.castShadow;
          receivesShadow = receivesShadow || mesh.receiveShadow;
          const colour = mesh.geometry.attributes.color;
          if (colour === undefined || !mesh.material.vertexColors) {
            hasVertexColours = false;
            return;
          }
          for (let i = 0; i < colour.count; i += 1) {
            const luminance = 0.2126 * colour.getX(i)
              + 0.7152 * colour.getY(i)
              + 0.0722 * colour.getZ(i);
            if (luminance < darkestTone) darkestTone = luminance;
            if (luminance > brightestTone) brightestTone = luminance;
          }
        });
        return {
          meshes,
          triangles,
          hasVertexColours,
          castsShadow,
          receivesShadow,
          darkestTone: Number.isFinite(darkestTone) ? darkestTone : 0,
          brightestTone,
        };
      };

      return {
        placeholderGroundPresent: scene.getObjectByName('placeholder-ground') !== undefined,
        placeholderGridPresent: scene.getObjectByName('placeholder-grid') !== undefined,
        heightfieldPresent: heightfield !== undefined,
        surroundPresent: surround !== undefined,
        heightfieldGroups: groups,
        heightfieldTriangles: triangles,
        heightfieldHasVertexColours: vertexColours,
        heightfieldColours: [...new Set(colours)],
        blockMeshes: blockMeshes.sort(),
        blockTriangles,
        surroundCentre: {
          x: surround?.position.x ?? Number.NaN,
          z: surround?.position.z ?? Number.NaN,
          y: surround?.position.y ?? Number.NaN,
        },
        fog: fog === null ? null : { near: fog.near, far: fog.far },
        paint: paint(),
      };
    },

    occlusionTrace(actions, steps, every) {
      const samples: ReturnType<Toolkit['occlusionTrace']> = [];
      game.setActions(actions);
      for (let taken = 0; taken < steps; taken += every) {
        game.advance(Math.min(every, steps - taken));
        const snapshot = game.snapshot();
        const { distance, armDistance } = snapshot.camera;
        samples.push({
          x: snapshot.euc.position.x,
          z: snapshot.euc.position.z,
          distance,
          armDistance,
          ratio: distance > 0 ? armDistance / distance : 1,
        });
      }
      return samples;
    },

    groundRigTransform() {
      const scene = game.renderer.scene;
      const rig = scene.getObjectByName('riding-rig');
      const ground = scene.getObjectByName('riding-ground-pivot');
      const body = scene.getObjectByName('euc-body');
      const euc = scene.getObjectByName('euc-blockout');
      const rider = scene.getObjectByName('rider-blockout');
      const pelvis = scene.getObjectByName('rider-pelvis');
      if (!rig || !ground || !body || !euc || !rider || !pelvis) {
        throw new Error('the riding rig is incomplete');
      }

      return {
        groundPitch: ground.rotation.x,
        groundRoll: ground.rotation.z,
        bodyOffset: body.position.y,
        riderOffset: rider.position.y,
        rigY: rig.position.y,
        eucRestLean: euc.rotation.z,
        pelvisPitch: pelvis.rotation.x,
      };
    },

    rideUntilStopped(actions, maxSteps) {
      const start = game.snapshot().euc.distanceTravelled;
      game.setActions(actions);
      let steps = 0;
      while (steps < maxSteps && game.snapshot().euc.speed > 0) {
        game.advance(1);
        steps += 1;
      }
      const euc = game.snapshot().euc;
      return {
        steps,
        distance: euc.distanceTravelled - start,
        speed: euc.speed,
        stopped: euc.speed === 0,
      };
    },

    rigTransform() {
      // Read out of the scene graph by name rather than through a widened
      // public surface on Game: it proves the object is actually in the scene,
      // which is the thing a screenshot would otherwise have to establish.
      const scene = game.renderer.scene;
      const rig = scene.getObjectByName('riding-rig');
      const pivot = scene.getObjectByName('riding-lean-pivot');
      const machine = scene.getObjectByName('euc-blockout');
      const tyre = scene.getObjectByName('euc-tyre');
      const pelvis = scene.getObjectByName('rider-pelvis');
      const neck = scene.getObjectByName('rider-neck');
      const blockout = scene.getObjectByName('rider-blockout');
      const leftHip = scene.getObjectByName('rider-hip-left');
      const rightHip = scene.getObjectByName('rider-hip-right');
      const leftKnee = scene.getObjectByName('rider-knee-left');
      const rightKnee = scene.getObjectByName('rider-knee-right');
      const leftAnkle = scene.getObjectByName('rider-ankle-left');
      const rightAnkle = scene.getObjectByName('rider-ankle-right');
      if (
        !rig || !pivot || !machine || !tyre || !pelvis || !neck || !blockout
        || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle
      ) {
        throw new Error('the articulated riding rig is not in the scene');
      }

      // Knee-versus-ankle lateral offsets are measured in the rider root's
      // own frame, so wheel roll and heading cannot masquerade as knee
      // articulation. Signed outboard: positive is away from the wheel on
      // that leg's side (+X is rider-left, so the left knee's outboard is +X
      // and the right knee's is -X).
      scene.updateMatrixWorld(true);
      const kneeOutboard = (kneeObj: typeof leftKnee, ankleObj: typeof leftAnkle, side: number) => {
        const knee = blockout.worldToLocal(kneeObj.getWorldPosition(kneeObj.position.clone()));
        const ankle = blockout.worldToLocal(ankleObj.getWorldPosition(ankleObj.position.clone()));
        return side * (knee.x - ankle.x);
      };
      const leftKneeOutboard = kneeOutboard(leftKnee, leftAnkle, 1);
      const rightKneeOutboard = kneeOutboard(rightKnee, rightAnkle, -1);
      const kneeFlex = (
        hipObj: typeof leftHip,
        kneeObj: typeof leftKnee,
        ankleObj: typeof leftAnkle,
      ) => {
        const hip = hipObj.getWorldPosition(hipObj.position.clone());
        const knee = kneeObj.getWorldPosition(kneeObj.position.clone());
        const ankle = ankleObj.getWorldPosition(ankleObj.position.clone());
        const thigh = hip.sub(knee).normalize();
        const shin = ankle.sub(knee).normalize();
        const included = Math.acos(Math.max(-1, Math.min(1, thigh.dot(shin))));
        return Math.PI - included;
      };
      const leftAnkleLocal = blockout.worldToLocal(leftAnkle.getWorldPosition(leftAnkle.position.clone()));
      const rightAnkleLocal = blockout.worldToLocal(
        rightAnkle.getWorldPosition(rightAnkle.position.clone()),
      );

      return {
        position: { x: rig.position.x, y: rig.position.y, z: rig.position.z },
        headingY: rig.rotation.y,
        machineYaw: machine.rotation.y,
        machineRoll: machine.rotation.z,
        leanRoll: pivot.rotation.z,
        wheelPitch: pivot.rotation.x,
        wheelSpin: tyre.rotation.x,
        pelvisRoll: pelvis.rotation.z,
        pelvisPitch: pelvis.rotation.x,
        pelvisYaw: pelvis.rotation.y,
        pelvisY: pelvis.position.y,
        pelvisZ: pelvis.position.z,
        neckPitch: neck.rotation.x,
        neckYaw: neck.rotation.y,
        leftHipY: leftHip.position.y,
        rightHipY: rightHip.position.y,
        leftKneeFlex: kneeFlex(leftHip, leftKnee, leftAnkle),
        rightKneeFlex: kneeFlex(rightHip, rightKnee, rightAnkle),
        leftKneeOutboard,
        rightKneeOutboard,
        leftAnkleZ: leftAnkleLocal.z,
        rightAnkleZ: rightAnkleLocal.z,
        leftAnkleY: leftAnkleLocal.y,
        rightAnkleY: rightAnkleLocal.y,
        riderPresent: true,
        // The M0 scale post is replaced by the rider at M2, and a debug aid
        // left in the scene is game content nobody decided to ship.
        scaleReferencePresent: scene.getObjectByName('debug-scale-reference') !== undefined,
      };
    },

    projectPoint(x: number, y: number, z: number) {
      const camera = game.renderer.camera;
      camera.updateMatrixWorld();
      // The view-projection applied by hand rather than through
      // THREE.Vector3.project, because the toolkit runs in the page and may
      // not import anything.
      const view = camera.matrixWorldInverse.elements;
      const projection = camera.projectionMatrix.elements;

      const ex = view[0] * x + view[4] * y + view[8] * z + view[12];
      const ey = view[1] * x + view[5] * y + view[9] * z + view[13];
      const ez = view[2] * x + view[6] * y + view[10] * z + view[14];

      const cx = projection[0] * ex + projection[4] * ey + projection[8] * ez + projection[12];
      const cy = projection[1] * ex + projection[5] * ey + projection[9] * ez + projection[13];
      const cw = projection[3] * ex + projection[7] * ey + projection[11] * ez + projection[15];

      return { x: cx / cw, y: cy / cw, inFront: cw > 0 };
    },

    screenProbe(distance: number) {
      const snapshot = game.snapshot();
      const project = (x: number, y: number, z: number) => toolkit.projectPoint(x, y, z);

      const heading = snapshot.euc.headingY;
      const position = snapshot.euc.position;
      // The rider's right is `forward x up`, which in this right-handed world
      // with +Y up and +Z forward is -X at rest — not +X.
      const forward = { x: Math.sin(heading), z: Math.cos(heading) };
      const right = { x: -Math.cos(heading), z: Math.sin(heading) };
      const eyeY = position.y + 1;

      return {
        riderRight: project(
          position.x + right.x * distance,
          eyeY,
          position.z + right.z * distance,
        ),
        riderLeft: project(
          position.x - right.x * distance,
          eyeY,
          position.z - right.z * distance,
        ),
        ahead: project(
          position.x + forward.x * distance,
          eyeY,
          position.z + forward.z * distance,
        ),
        rider: project(position.x, eyeY, position.z),
      };
    },

    cameraTransform() {
      const snapshot = game.snapshot();
      const camera = game.renderer.camera;
      camera.updateMatrixWorld();
      const m = camera.matrixWorld.elements;
      const state = snapshot.camera;

      const toRider = {
        x: snapshot.euc.position.x - camera.position.x,
        y: snapshot.euc.position.y - camera.position.y,
        z: snapshot.euc.position.z - camera.position.z,
      };

      const heading = snapshot.euc.headingY;
      const wrapped = (radians: number): number => {
        const shifted = (radians + Math.PI) % (Math.PI * 2);
        return (shifted <= 0 ? shifted + Math.PI * 2 : shifted) - Math.PI;
      };

      return {
        mode: state.mode,
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        distanceToRider: Math.hypot(toRider.x, toRider.y, toRider.z),
        // Column 0 of the world matrix is the camera's right axis, so this is
        // how far off-centre the rider sits.
        lateralOffset: toRider.x * m[0] + toRider.y * m[1] + toRider.z * m[2],
        armLength: Math.hypot(toRider.x, toRider.z),
        // Read off the camera three.js is actually rendering with, not off the
        // number the game meant to write there.
        fov: (camera.fov * Math.PI) / 180,
        state: {
          yaw: state.yaw,
          distance: state.distance,
          armDistance: state.armDistance,
          fov: state.fov,
          bank: state.bank,
          lookAhead: state.lookAhead,
        },
        target: {
          x: snapshot.euc.position.x + Math.sin(heading) * state.lookAhead,
          y: snapshot.euc.position.y,
          z: snapshot.euc.position.z + Math.cos(heading) * state.lookAhead,
        },
        yawLag: wrapped(heading - state.yaw),
      };
    },

    screenTilt(x: number, z: number, yBottom: number, yTop: number) {
      const bottom = toolkit.projectPoint(x, yBottom, z);
      const top = toolkit.projectPoint(x, yTop, z);
      return { tilt: top.x - bottom.x, bottom, top };
    },

    lookProbe() {
      const scene = game.renderer.scene;
      const neck = scene.getObjectByName('rider-neck');
      const pelvis = scene.getObjectByName('rider-pelvis');
      if (!neck || !pelvis) throw new Error('rider joints missing');
      scene.updateMatrixWorld(true);

      // A metre in front of each joint, in that joint's own frame, projected
      // to the screen and reported relative to the joint itself. The head has
      // turned only if its offset differs from the torso's.
      const facing = (joint: typeof neck): number => {
        const origin = joint.getWorldPosition(joint.position.clone());
        // The toolkit runs in the page and may not import three, so a spare
        // Vector3 is borrowed from the joint rather than constructed.
        const ahead = joint.localToWorld(joint.position.clone().set(0, 0, 1));
        const originNdc = toolkit.projectPoint(origin.x, origin.y, origin.z);
        const aheadNdc = toolkit.projectPoint(ahead.x, ahead.y, ahead.z);
        return aheadNdc.x - originNdc.x;
      };

      return {
        headOffsetX: facing(neck),
        torsoOffsetX: facing(pelvis),
        neckYaw: neck.rotation.y,
        neckPitch: neck.rotation.x,
      };
    },

    handPose() {
      const scene = game.renderer.scene;
      const pelvis = scene.getObjectByName('rider-pelvis');
      const leftHand = scene.getObjectByName('rider-hand-left');
      const rightHand = scene.getObjectByName('rider-hand-right');
      if (!pelvis || !leftHand || !rightHand) throw new Error('rider hands missing');
      scene.updateMatrixWorld(true);

      // The torso's own frame — the frame the arm targets are authored in — so
      // the braking hip-shift and the torso hinge cannot be read as an arm
      // reaction. +X is rider-left, so the left hand's outboard direction is
      // +X and the right hand's is -X.
      const inTorsoFrame = (hand: typeof leftHand, side: number) => {
        const local = pelvis.worldToLocal(hand.getWorldPosition(hand.position.clone()));
        return { outboard: side * local.x, height: local.y, forward: local.z };
      };

      return {
        left: inTorsoFrame(leftHand, 1),
        right: inTorsoFrame(rightHand, -1),
        leftWorldY: leftHand.getWorldPosition(leftHand.position.clone()).y,
        rightWorldY: rightHand.getWorldPosition(rightHand.position.clone()).y,
      };
    },

    groundAtScreenCentre() {
      const camera = game.renderer.camera;
      camera.updateMatrixWorld();
      const m = camera.matrixWorld.elements;
      // Column 2 of the world matrix is the camera's +Z, which points
      // backwards along the view, so forward is its negation.
      const forward = { x: -m[8], y: -m[9], z: -m[10] };
      const snapshot = game.snapshot();
      const rider = snapshot.euc.position;

      if (forward.y >= -1e-6) {
        return { x: 0, z: 0, aheadOfRider: 0, hitsGround: false };
      }
      const t = (rider.y - camera.position.y) / forward.y;
      const x = camera.position.x + forward.x * t;
      const z = camera.position.z + forward.z * t;

      const heading = snapshot.euc.headingY;
      return {
        x,
        z,
        aheadOfRider: (x - rider.x) * Math.sin(heading) + (z - rider.z) * Math.cos(heading),
        hitsGround: true,
      };
    },

    cameraTrace(actions, steps, every) {
      const samples: ReturnType<Toolkit['cameraTrace']> = [];
      game.setActions(actions);
      for (let taken = 0; taken < steps; taken += every) {
        game.advance(Math.min(every, steps - taken));
        const view = toolkit.cameraTransform();
        const euc = game.snapshot().euc;
        samples.push({
          headingY: euc.headingY,
          yaw: view.state.yaw,
          yawLag: view.yawLag,
          armDistance: view.state.armDistance,
          fov: view.state.fov,
          bank: view.state.bank,
          lookAhead: view.state.lookAhead,
          speed: euc.speed,
        });
      }
      return samples;
    },

    setOcclusion(distance: number | null) {
      game.setOcclusion(distance);
      return game.snapshot();
    },

    hopTrace(actions, chargeSteps, maxSteps) {
      const rigY = (): number => {
        const rig = game.renderer.scene.getObjectByName('riding-rig');
        return rig ? rig.position.y : Number.NaN;
      };

      game.setActions(actions);
      if (chargeSteps > 0) {
        game.setActions({ crouch: true });
        game.advance(chargeSteps);
      }
      const speedBefore = game.snapshot().euc.speed;

      game.setActions({ hop: true });
      let compressSteps = 0;
      let compressionCrouch = 0;
      while (compressSteps < 120 && game.snapshot().euc.grounded) {
        game.advance(1);
        compressSteps += 1;
        // Read the rider's compression through the rig, which is where a
        // player would see it, rather than through the controller's own state.
        const pelvis = game.renderer.scene.getObjectByName('rider-pelvis');
        if (pelvis) compressionCrouch = Math.max(compressionCrouch, -pelvis.position.y);
      }
      // Crouch is released the moment the compression ends, so the charge must
      // not survive into the flight and start a second one.
      game.setActions({ crouch: false, hop: false });

      let airSteps = 0;
      let apex = 0;
      let rigApexY = Number.NaN;
      let cameraLagAtApex = 0;
      const landingsBefore = game.snapshot().euc.landings;
      let landed = false;
      while (airSteps < maxSteps) {
        game.advance(1);
        airSteps += 1;
        const snapshot = game.snapshot();
        if (snapshot.euc.airHeight > apex) {
          apex = snapshot.euc.airHeight;
          rigApexY = rigY();
          cameraLagAtApex = snapshot.camera.heightLag;
        }
        if (snapshot.euc.landings > landingsBefore) {
          landed = true;
          break;
        }
      }

      const after = game.snapshot();
      return {
        compressSteps,
        airSteps,
        apex,
        landed,
        landingQuality: after.euc.landingQuality,
        landingImpact: after.euc.landingImpact,
        landingScore: after.euc.landingScore,
        speedBefore,
        speedAfter: after.euc.speed,
        hops: after.euc.hops,
        rigApexY,
        compressionCrouch,
        cameraLagAtApex,
        cameraDipAfterLanding: after.camera.dip,
        dustAfterLanding: after.particles.dust,
      };
    },

    freezeMidHop(actions, fraction) {
      game.loop.setRunning(false);
      game.setActions(actions);
      game.setActions({ hop: true });
      while (game.snapshot().euc.grounded) game.advance(1);
      game.setActions({ hop: false });

      // Fly to the requested fraction of the apex by watching the height stop
      // rising, rather than by counting steps against a launch speed the F4
      // panel is allowed to move.
      const apexTime = game.snapshot().euc.verticalVelocity / 9.81;
      const steps = Math.max(1, Math.round(apexTime * fraction * 120));
      game.advance(steps);
      return game.snapshot();
    },

    wobbleTrace(actions, steps, every) {
      const samples: ReturnType<Toolkit['wobbleTrace']> = [];
      const scene = game.renderer.scene;
      game.setActions(actions);
      for (let taken = 0; taken < steps; taken += every) {
        game.advance(Math.min(every, steps - taken));
        const snapshot = game.snapshot();
        const rig = scene.getObjectByName('riding-rig');
        const machine = scene.getObjectByName('euc-blockout');
        const pelvis = scene.getObjectByName('rider-pelvis');
        const light = scene.getObjectByName('euc-status-light');
        const hands = toolkit.handPose();
        const material = light === undefined
          ? null
          : (light as unknown as {
            material: { emissive: { getHexString(): string }; emissiveIntensity: number };
          }).material;
        samples.push({
          wobbleEnergy: snapshot.euc.wobbleEnergy,
          wobbleYaw: snapshot.euc.wobbleYaw,
          wobbleRoll: snapshot.euc.wobbleRoll,
          wobbleFootCorrection: snapshot.euc.wobbleFootCorrection,
          rigYawOffset: (rig?.rotation.y ?? Number.NaN) - snapshot.euc.headingY,
          machineYaw: machine?.rotation.y ?? Number.NaN,
          machineRoll: machine?.rotation.z ?? Number.NaN,
          pelvisY: pelvis?.position.y ?? Number.NaN,
          pelvisYaw: pelvis?.rotation.y ?? Number.NaN,
          leftOutboard: hands.left.outboard,
          rightOutboard: hands.right.outboard,
          state: snapshot.euc.state,
          surface: snapshot.euc.surface,
          statusColour: material?.emissive.getHexString() ?? '',
          statusIntensity: material?.emissiveIntensity ?? Number.NaN,
        });
      }
      return samples;
    },

    audioTrace(actions, steps, every) {
      const samples: AudioSample[] = [];
      game.setActions(actions);
      let taken = 0;
      while (taken < steps) {
        const chunk = Math.min(every, steps - taken);
        game.advance(chunk);
        taken += chunk;
        const snap = game.snapshot();
        const audio = snap.audio;
        samples.push({
          speed: snap.euc.speed,
          surface: snap.euc.surface,
          grounded: snap.euc.grounded,
          motorHz: audio.motorHz,
          motorGain: audio.motorGain,
          motorCutoffHz: audio.motorCutoffHz,
          motorQ: audio.motorQ,
          regenGain: audio.regenGain,
          windGain: audio.windGain,
          tyreGain: audio.tyreGain,
          tyreVoice: audio.tyreVoice,
          scrapeGain: audio.scrapeGain,
          bedGain: audio.bedGain,
          duck: audio.duck,
          beeps: audio.played.beep,
        });
      }
      return samples;
    },

    audioSurfaceSweep() {
      const field = game.levelPlan.heightfield;
      const columns = field.columns - 1;
      const rows = field.rows - 1;
      const surfaceAt = (column: number, row: number): string | null => (
        column < 0 || row < 0 || column >= columns || row >= rows
          ? null
          : field.surfaces[row * columns + column]
      );

      // One well-inside patch per surface. "Well inside" means the whole 3x3
      // neighbourhood agrees: on a boundary cell the crossfade is mid-flight
      // and reporting a blend would be correct behaviour failing a test.
      const chosen = new Map<string, { x: number; z: number }>();
      for (let row = 1; row < rows - 1; row += 1) {
        for (let column = 1; column < columns - 1; column += 1) {
          const surface = surfaceAt(column, row);
          if (surface === null || chosen.has(surface)) continue;
          let uniform = true;
          for (let dz = -1; dz <= 1 && uniform; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (surfaceAt(column + dx, row + dz) !== surface) {
                uniform = false;
                break;
              }
            }
          }
          if (!uniform) continue;
          chosen.set(surface, {
            x: field.originX + (column + 0.5) * field.spacing,
            z: field.originZ + (row + 0.5) * field.spacing,
          });
        }
      }

      const results: { surface: string; expected: string; voice: string; tyreGain: number }[] = [];
      for (const [surface, point] of chosen) {
        toolkit.placeRider(point.x, point.z, 0);
        // Long enough for the crossfade to finish and the level to reach its
        // speed term; short enough that the rider is still on the same patch.
        game.setActions({ throttle: 0.35 });
        game.advance(90);
        const snap = game.snapshot();
        results.push({
          // Read the surface the wheel is *actually* on, which may differ from
          // the cell that was chosen if 0.75 s of riding left it.
          surface: snap.euc.surface,
          expected: surface,
          voice: snap.audio.tyreVoice,
          tyreGain: snap.audio.tyreGain,
        });
        game.setActions({ throttle: 0 });
      }
      return results;
    },

    audioLadder(rungLoad, seconds) {
      toolkit.resetRide();
      // A steady ride first, so `quietBed` is the bed of a wheel that is
      // working rather than one that has not started moving.
      game.setActions({ throttle: 1 });
      game.advance(180);
      const quietBed = game.snapshot().audio.bedGain;
      const beforeBeeps = game.snapshot().audio.played.beep;

      // `LiveTuning.set` clamps to the slider's range, so asking for a
      // threshold below the panel's floor lands on the floor rather than
      // failing — which is what is wanted here.
      game.tuning.set('EUC.powerTiltBackLoad', rungLoad);
      game.tuning.set('EUC.powerComfortSpeed', 0);

      // Track the *highest* rung reached rather than the rung at the end. The
      // slice is a place, not a treadmill: six seconds of full throttle from
      // the spawn can end against a wall, and a wheel standing still is
      // correctly reporting `normal` about a warning that genuinely sounded.
      const rungs = ['normal', 'notice', 'warn', 'tiltBack'];
      let stage = 'normal';
      let lowestBed = Infinity;
      let maxDuck = 0;
      const steps = Math.round(seconds * 120);
      let taken = 0;
      while (taken < steps) {
        game.advance(6);
        taken += 6;
        const snap = game.snapshot();
        if (rungs.indexOf(snap.euc.powerStage) > rungs.indexOf(stage)) {
          stage = snap.euc.powerStage;
        }
        // Only while a rung is lit: the bed before the ladder engages is the
        // baseline this is being compared against, not part of the measurement.
        if (snap.euc.powerStage !== 'normal') {
          lowestBed = Math.min(lowestBed, snap.audio.bedGain);
          maxDuck = Math.max(maxDuck, snap.audio.duck);
        }
      }
      const snap = game.snapshot();
      const result = {
        stage,
        beeps: snap.audio.played.beep - beforeBeeps,
        lowestBed: Number.isFinite(lowestBed) ? lowestBed : quietBed,
        quietBed,
        maxDuck,
      };
      game.setActions({ throttle: 0 });
      game.tuning.reset('EUC.powerTiltBackLoad');
      game.tuning.reset('EUC.powerComfortSpeed');
      return result;
    },

    async audioOutput(settleMs) {
      // Prime the analyser: it is created on first use and its first read is a
      // buffer that has not been written yet.
      game.audioLevel();
      await new Promise((resolve) => window.setTimeout(resolve, settleMs));
      return game.audioLevel();
    },

    async audioOutputMax(spanMs, windows) {
      // Primed for the same reason as `audioOutput`; then every window is a
      // real audio-clock wait, and the answer is the loudest of them.
      game.audioLevel();
      const count = Math.max(1, Math.floor(windows));
      const interval = Math.max(1, spanMs / count);
      let loudest = 0;
      for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, interval));
        loudest = Math.max(loudest, game.audioLevel());
      }
      return loudest;
    },

    async audioBandPeaks(splitHz, settleMs) {
      // Primed for the same reason as `audioOutput`, and then given real time:
      // the analyser averages over several blocks, so an immediate second read
      // is still mostly the silence it was created during.
      game.audioSpectrum();
      await new Promise((resolve) => window.setTimeout(resolve, settleMs));
      const spectrum = game.audioSpectrum();
      const empty = { lowDb: -Infinity, lowHz: 0, highDb: -Infinity, highHz: 0 };
      if (!spectrum) return empty;
      const result = { ...empty };
      for (let bin = 1; bin < spectrum.db.length; bin += 1) {
        const hz = bin * spectrum.binHz;
        const db = spectrum.db[bin];
        if (!Number.isFinite(db)) continue;
        if (hz < splitHz) {
          if (db > result.lowDb) { result.lowDb = db; result.lowHz = hz; }
        } else if (db > result.highDb) { result.highDb = db; result.highHz = hz; }
      }
      return result;
    },

    statusLight() {
      const light = game.renderer.scene.getObjectByName('euc-status-light');
      if (light === undefined) return { colour: '', intensity: Number.NaN, present: false };
      const material = (light as unknown as {
        material: { emissive: { getHexString(): string }; emissiveIntensity: number };
      }).material;
      return {
        colour: material.emissive.getHexString(),
        intensity: material.emissiveIntensity,
        present: true,
      };
    },

    crashRun(maxSteps: number) {
      const scene = game.renderer.scene;
      const armBefore = game.snapshot().camera.armDistance;

      // **Crash the rider the way M13's hazards will.** This used to saw the
      // steering at an absurd cadence, because a reversed carve was then the
      // cheapest route to the crash funnel. The owner's §13 q8 answer removed
      // that trigger by name — carving is the thing he enjoys — so the saw is
      // now correctly inert and the probe delivers the deep pothole instead.
      // The gate has to be opened too, since the shipped default silences every
      // source including this one.
      game.tuning.set('EUC.wobbleMasterGain', 1);
      game.tuning.set('EUC.wobbleProbeEnergy', 1);
      game.tuning.set('EUC.wobbleProbeMetres', 10);
      let steps = 0;
      while (steps < maxSteps && !game.snapshot().euc.crashed) {
        game.setActions({ throttle: 1 });
        game.advance(6);
        steps += 6;
      }
      game.setActions({ throttle: 0, steer: 0 });
      game.tuning.set('EUC.wobbleProbeMetres', 0);

      const atCrash = game.snapshot();
      // Let the separation and the framing both settle before reading them —
      // and read every one of them into a plain number *here*. The scene graph
      // is live, and a field read in the returned object literal below would be
      // sampled after the recovery had already put it back to zero.
      game.advance(110);
      const settled = game.snapshot();

      const rig = scene.getObjectByName('riding-rig');
      const rider = scene.getObjectByName('rider-blockout');
      const euc = scene.getObjectByName('euc-blockout');
      scene.updateMatrixWorld(true);
      const separation = rider && rig
        ? { x: rider.position.x, y: rider.position.y, z: rider.position.z }
        : { x: Number.NaN, y: Number.NaN, z: Number.NaN };
      const riderTilt = {
        pitch: rider?.rotation.x ?? Number.NaN,
        roll: rider?.rotation.z ?? Number.NaN,
      };
      const wheelLean = euc?.rotation.z ?? Number.NaN;

      const riderWorld = rider
        ? rider.getWorldPosition(rider.position.clone())
        : { x: Number.NaN, y: Number.NaN, z: Number.NaN };
      const wheelWorld = euc
        ? euc.getWorldPosition(euc.position.clone())
        : { x: Number.NaN, y: Number.NaN, z: Number.NaN };

      const riderOnScreen = toolkit.projectPoint(riderWorld.x, riderWorld.y + 0.9, riderWorld.z);
      const wheelOnScreen = toolkit.projectPoint(wheelWorld.x, wheelWorld.y + 0.3, wheelWorld.z);
      const status = toolkit.statusLight();

      // Nothing held, so only the automatic recovery can end it.
      let recovering = 0;
      while (recovering < 600 && game.snapshot().euc.crashed) {
        game.advance(6);
        recovering += 6;
      }
      const after = game.snapshot();
      const recoveryStatus = toolkit.statusLight();
      const safe = atCrash.euc.safePosition;
      const recoveredAtSafeSpot = Math.hypot(
        after.euc.position.x - safe.x,
        after.euc.position.z - safe.z,
      ) < 0.05;
      // And let the camera hand the ordinary view back. Slower than it took it,
      // because the obstruction restore is deliberately the slow half of the
      // asymmetric pair the arm shares with it.
      game.advance(240);

      return {
        crashed: atCrash.euc.crashed,
        cause: atCrash.euc.crashCause,
        motion: atCrash.euc.crashMotion,
        separation,
        riderTilt,
        wheelLean,
        riderOnScreen,
        wheelOnScreen,
        armBefore,
        armDuring: settled.camera.armDistance,
        fovDuring: settled.camera.fov,
        crashFrame: settled.camera.crashFrame,
        statusColour: status.colour,
        recovered: !after.euc.crashed,
        recoveredAtSafeSpot,
        recoveryStatusColour: recoveryStatus.colour,
        recoveryStatusIntensity: recoveryStatus.intensity,
        crashes: after.euc.crashes,
        armAfter: game.snapshot().camera.armDistance,
      };
    },

    scrapeTrace(steer, warmupSteps, steps) {
      game.setActions({ throttle: 1, steer: 0 });
      game.advance(warmupSteps);
      game.setActions({ throttle: 1, steer });
      game.advance(steps);

      const scene = game.renderer.scene;
      const blockout = scene.getObjectByName('rider-blockout');
      const leftAnkle = scene.getObjectByName('rider-ankle-left');
      const rightAnkle = scene.getObjectByName('rider-ankle-right');
      if (!blockout || !leftAnkle || !rightAnkle) throw new Error('the rider has no ankles');
      scene.updateMatrixWorld(true);
      const ankleY = (joint: typeof leftAnkle): number => blockout
        .worldToLocal(joint.getWorldPosition(joint.position.clone())).y;

      const snapshot = game.snapshot();
      return {
        rollAngle: snapshot.euc.rollAngle,
        pedalClearance: snapshot.euc.pedalClearance,
        pedalStrike: snapshot.euc.pedalStrike,
        state: snapshot.euc.state,
        speed: snapshot.euc.speed,
        sparks: snapshot.particles.sparks,
        leftAnkleY: ankleY(leftAnkle),
        rightAnkleY: ankleY(rightAnkle),
      };
    },
  };

  window.qa = toolkit;
}

/**
 * The query that boots the M4 proving ground instead of the shipped slice.
 *
 * The M2–M6 suites measure the movement model, and `docs/PLANS.md` §2.5 makes
 * the level the instrument that measurement is taken with. M7 authored a new
 * world and deliberately did not move that instrument — see `src/level/levels.ts`
 * for the decision. Anything about the *slice* is proven in `m7.spec.ts`, on the
 * level the player actually rides.
 */
export const PROVING_GROUND = 'level=proving';

/**
 * Load the page, wait for the QA bridge, install the in-page toolkit, and
 * **start the ride**.
 *
 * That last step arrived with M9 and is the reason this comment exists. Before
 * M9 the game booted straight into a live ride; now it boots to a title screen,
 * and `docs/PLANS.md` §3.2's state machine deliberately refuses ride input
 * anywhere a menu is up — otherwise a key pressed while reading the controls
 * would ride the wheel off behind the card. Every spec from M1 to M8.6 is
 * about riding, so the shared boot puts them in a ride rather than making
 * thirty tests each remember to.
 *
 * `tests/m9.spec.ts` is the exception and uses `bootToTitle` below, because the
 * title screen is the thing it is testing.
 */
export async function boot(page: Page, query = ''): Promise<void> {
  await bootToTitle(page, query);
  await page.evaluate(() => {
    // Through the real state machine, so a spec reaches the state a player
    // reaches rather than a parallel one only tests can see.
    window.game.setAppState('freeRide');
  });
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
}

/** Boot and stop at the title screen, without starting a ride. */
export async function bootToTitle(page: Page, query = ''): Promise<void> {
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null, undefined, {
    timeout: 90_000,
  });
  // A refused WebGL context replaces the loading shell with an error panel, and
  // every later assertion would then fail for the wrong reason.
  await expect(page.locator('#boot-error')).toBeHidden();
  await page.evaluate(installToolkit);
  // The first animation frame must have landed, or the loop is still on its
  // probe and nothing below describes a running game.
  await page.waitForFunction(() => window.game.snapshot().loop.frames > 0);
  // A screenshot taken while the 320 ms boot transition is still fading is a
  // screenshot of the loading shell, not of the game state the test names.
  await expect(page.locator('#boot')).toBeHidden();
}
