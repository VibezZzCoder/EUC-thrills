/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import {
  INSPECTION_CAMERA, CAMERA, CHALLENGE, CHASE, EUC, INPUT, RIDER, TARGET, WHEEL,
} from '../data/tuning.ts';
import { LiveTuning } from '../data/liveTuning.ts';
import { GameRenderer } from '../render/Renderer.ts';
import { createRidingRig, pedalEdgeWorld, type RidingRig } from '../render/ridingRig.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from '../render/machineLook.ts';
import { riderLook } from '../render/riderLook.ts';
import {
  DEFAULT_CHARACTER,
  characterSpec,
  type CharacterId,
  type CrashVoiceId,
} from '../data/riders.ts';
import {
  ChaseCamera,
  copyChaseCameraState,
  createChaseCameraState,
  createChaseCameraView,
  lerpChaseCameraState,
  resolveChaseView,
  type ChaseCameraInput,
  type ChaseCameraState,
  type ChaseCameraView,
} from '../render/chaseCamera.ts';
import {
  DEFAULT_LEVEL,
  DEFAULT_SEED,
  MAX_SEED_LENGTH,
  ROUTE_SEED_SPACE,
  createLevel,
  normaliseSeed,
  requestRoute,
  routeSeedFrom,
  type LevelId,
} from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { TerrainView } from '../render/terrain.ts';
import { SURFACE_IDS } from '../data/surfaces.ts';
import {
  ActionState,
  NEUTRAL_ACTIONS,
  PRESSED_ACTIONS,
  type ActionSnapshot,
  type ScriptedActions,
} from '../input/actions.ts';
import { KeyboardInput } from '../input/keyboard.ts';
import { GamepadInput } from '../input/gamepad.ts';
import { TouchInput } from '../input/touch.ts';
import { TouchControls } from '../ui/touchControls.ts';
import { resolveBindings } from '../input/bindings.ts';
import {
  EucController,
  copyPose,
  createPose,
  lerpPose,
  type EucPose,
  type EucSnapshot,
} from '../simulation/EucController.ts';
import { clamp, wrapAngle } from '../shared/maths.ts';
import { HazardField } from '../simulation/hazards.ts';
import { SoftBodyField } from '../simulation/softBodies.ts';
import {
  Paddle,
  type HittableSet,
  type HittableVolume,
  type SwingPhase,
} from '../simulation/paddle.ts';
import { TargetField } from '../simulation/targets.ts';
import { ChaseRun, type ChaseOutcome, type ChasePhase } from '../simulation/chase.ts';
import { CpuRider, type CpuView } from '../simulation/cpuRider.ts';
import {
  RouteSpine,
  createSpineLocation,
  type SpineLocation,
} from '../simulation/routeSpine.ts';
import { ChaseRecordsStore, type ChaseRecord } from './chaseRecords.ts';
import { PlanTerrainSampler, paintedSurfaces } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { AudioEngine, type AudioSnapshot } from '../audio/AudioEngine.ts';
import { SAMPLE_URLS } from '../audio/samples.ts';
import type { BusVolumes } from '../audio/mix.ts';
import { FixedStepLoop, createBrowserScheduler, type FrameSample, type LoopStats } from './loop.ts';
import { FrameProfiler, type ProfileReport } from '../diagnostics/profile.ts';
import { DebugOverlay, type DebugContext } from '../diagnostics/DebugOverlay.ts';
import { TuningPanel } from '../diagnostics/TuningPanel.ts';
import { ScreenNotice } from '../ui/notice.ts';
import { SafeStorage } from '../platform/storage.ts';
import { OptionsStore, type GameOptions } from './options.ts';
import { RecordsStore, type RouteRecord } from './records.ts';
import { KnockaboutRecordsStore, type KnockaboutRecord } from './knockaboutRecords.ts';
import { AppState, type AppStateId } from './appState.ts';
import {
  ChallengeRun,
  type ChallengeEvent,
  type ChallengeResult,
  type ChallengeState,
} from '../simulation/challenge.ts';
import {
  GhostPlayer,
  GhostRecorder,
  createGhostSample,
  decodeGhost,
  encodeGhost,
  type GhostSample,
} from '../simulation/ghost.ts';
import { Hud } from '../ui/hud.ts';
import { HudModel, formatDelta, formatRunTime, formatSpeed, type HudView } from '../ui/hudModel.ts';
import {
  Menus,
  type MenuScreen,
  type ResultsRow,
  type ResultsView,
  type RoutePurpose,
  type RouteStatus,
} from '../ui/menus.ts';
import { Onboarding, type PromptDevice } from '../ui/onboarding.ts';

/**
 * The game object, and the QA bridge that hangs off it.
 *
 * M1 built the machinery every later milestone tunes against: one fixed-step
 * loop, one input abstraction, one measurement window, and one way for an
 * automated browser to drive all of it. M2 puts the EUC controller inside it,
 * which is the point all of that machinery existed for — `step` advances the
 * controller and `render` interpolates between the two most recent poses, so
 * the loop's central claim ("simulation is fixed-step, rendering interpolates")
 * is now made about the thing the game actually is.
 *
 * M3 adds the chase camera to the same arrangement. Its smoothed state is
 * stepped inside `step` and interpolated inside `render`, exactly as the
 * rider's pose is, so `advance(n)` reaches a named camera state as
 * deterministically as it reaches a named rider state — which is the only
 * reason a frozen screenshot of a camera transient means anything. The camera
 * maths itself lives in `render/chaseCamera.ts` and contains no three.js; this
 * file is the only place the result becomes a `PerspectiveCamera`.
 *
 * **The bridge is durable tooling, not a debug leftover** (master starter
 * 16.1). It ships. An automated browser throttles and defers, so a test that
 * waits on wall-clock time for the simulation to reach a state is a test that
 * either flakes or lies; `advance()` steps the real update path a known number
 * of times and forces a draw, and `loop.setRunning(false)` freezes simulation
 * while rendering continues, which is what makes a transient capturable at all.
 */

/**
 * Which camera is showing. `C` cycles them.
 *
 * `chase` is the game's camera and the only acceptance view — a pose or a
 * framing is only proven readable from the view the player actually rides
 * behind. `orbit` is kept deliberately as a diagnostic: it is the only view
 * that can show fore/aft articulation, which the chase camera looks almost
 * straight down the axis of (`docs/LESSONS_LEARNED.md`).
 */
export type CameraMode = 'chase' | 'orbit';

type RouteDestination = 'freeRide' | 'challenge' | 'knockabout' | 'chase';
type RouteArrival = RouteDestination | 'choose';

const CAMERA_MODES: readonly CameraMode[] = ['chase', 'orbit'];

/**
 * The empty action list, for states that take no ride input.
 *
 * A frozen constant rather than a filter on `PRESSED_ACTIONS`, so the
 * not-riding path allocates nothing at all — it runs at 120 Hz behind the
 * title screen.
 */
const NO_ACTIONS: readonly never[] = Object.freeze([]);

export interface ResourceCounts {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly sceneObjects: number;
  readonly lights: number;
}

export interface GameSnapshot {
  readonly tick: number;
  readonly simTimeSeconds: number;
  readonly loop: LoopStats;
  readonly actions: ActionSnapshot;
  /** How many times each one-shot has been claimed. Exactly one per press. */
  readonly consumed: Readonly<Record<string, number>>;
  /** The whole of the EUC controller's state. M2's authoritative readout. */
  readonly euc: EucSnapshot;
  readonly camera: {
    readonly mode: CameraMode;
    readonly orbitAngle: number;
    /** Follow yaw, lagging the rider's heading. Unwrapped, like the heading. */
    readonly yaw: number;
    /** Speed-eased spring-arm length, before obstruction. */
    readonly distance: number;
    /** Arm length actually used, after the obstruction pull-in. */
    readonly armDistance: number;
    /** Vertical field of view, radians. */
    readonly fov: number;
    /** Bank, radians. Positive tilts the camera's up axis toward screen-right. */
    readonly bank: number;
    /** How far ahead of the rider the camera is aiming, metres. */
    readonly lookAhead: number;
    /** How far below the rider the anchor sits while airborne, metres (M5). */
    readonly heightLag: number;
    /** Landing dip, metres. Decays to zero and never oscillates (M5). */
    readonly dip: number;
    /** How far into the wider crash framing the camera is, 0..1 (M6). */
    readonly crashFrame: number;
    /** True while a QA-scripted obstruction is installed. */
    readonly scriptedOcclusion: boolean;
  };
  /** Live particle counts, for the QA bridge and the resource audit (M5). */
  readonly particles: { readonly sparks: number; readonly dust: number };
  readonly viewport: { readonly width: number; readonly height: number; readonly pixelRatio: number };
  readonly render: { readonly drawCalls: number; readonly triangles: number };
  readonly resources: ResourceCounts;
  readonly tuning: {
    readonly overrides: Record<string, number>;
    readonly overrideCount: number;
    readonly exposure: number;
    readonly fieldOfView: number;
  };
  readonly debug: { readonly overlayVisible: boolean; readonly panelVisible: boolean };
  readonly levelPlanId: string;
  /**
   * What the one plan produced, on both sides of it.
   *
   * Reported together on purpose: `cells` and `triangles` are the renderer's
   * reading and `colliders` and `segments` are the simulation's, and the point
   * of invariant 2 is that they came out of the same structure. A browser spec
   * that finds terrain triangles but no colliders has found a drift.
   */
  readonly level: {
    readonly segments: number;
    /** Authored segment blocks — kerbs, walls, plinths. What the renderer draws. */
    readonly colliders: number;
    /**
     * Colliders derived from the dressing (M8.6). Zero on the proving ground,
     * which carries no props.
     *
     * Reported apart from `colliders` because they are apart in the plan and
     * for the same reason: the renderer draws boxes for the first set and
     * meshes for the second, so a spec that added them together would be
     * asserting that a tree is drawn twice.
     */
    readonly solids: number;
    /** Knockabout targets the plan carries — M14. Zero on every hand-authored world. */
    readonly targets: number;
    readonly cellsDrawn: number;
    readonly triangles: number;
    /** Every surface the heightfield actually paints, sorted. */
    readonly surfaces: readonly string[];
  };
  /** Layout changes seen. A pixel-ratio-only change must not increment this. */
  readonly layoutChanges: number;
  /** True while the player has paused with the pause action. Distinct from
   *  `loop.running`, which the QA bridge also freezes. */
  readonly paused: boolean;
  /** True while the WebGL context is lost and the recovery notice is up. */
  readonly contextLost: boolean;
  /** The audio layer's model and its context state (M8). */
  readonly audio: AudioSnapshot;

  // -- M9 --------------------------------------------------------------------
  /** Which application state is current, and what it permits. */
  readonly app: {
    readonly state: AppStateId;
    readonly menu: MenuScreen;
    readonly acceptsRideInput: boolean;
    readonly simulates: boolean;
  };
  /**
   * What the HUD is currently saying, as the model decided it.
   *
   * On the bridge rather than left to a DOM query so a spec can assert the
   * *decision* — that a warning is up, that the off-route hint has cleared —
   * separately from whether the DOM agrees. When those two disagree the bug is
   * in `ui/hud.ts`, and a test that could only see the DOM would not be able
   * to say so.
   */
  readonly hud: HudView & { readonly prompt: string | null; readonly visible: boolean };
  /** The player's options, and whether they will survive a reload. */
  readonly options: GameOptions & { readonly persistent: boolean };
  /** Whether a gamepad is connected and being read. */
  readonly gamepadConnected: boolean;

  /**
   * The on-screen controls (M11.5).
   *
   * `visible` is what is on screen; `wanted` is what the device and the option
   * say *should* be, which differ in exactly one interesting case — a menu,
   * where the controls leave and the answer to "is this a touch device" does
   * not change. A spec that could only see one of the two could not tell a
   * correctly hidden control from a broken one.
   */
  readonly touch: {
    readonly visible: boolean;
    readonly wanted: boolean;
    /** Live fore/aft stick intent, -1..1, exactly as the knob is drawing it. */
    readonly throttle: number;
    /** Live carve intent, -1..1, exactly as the knob is drawing it. */
    readonly steer: number;
    /** Which device's names the first-ride prompts are currently using. */
    readonly promptDevice: PromptDevice;
  };

  // -- M10 -------------------------------------------------------------------
  /**
   * The timed run, as the referee has it.
   *
   * On the bridge in full because a challenge is the one system in the game
   * whose *rules* a browser spec has to assert rather than its appearance: that
   * a gate was crossed, that an out-of-order gate was not, that the clock ran
   * from the right instant. The HUD's rendering of all that is a separate
   * question, asked separately, exactly as `hud` is kept apart from the DOM.
   */
  readonly challenge: ChallengeState & {
    /** Whether this level can be timed at all. False on the proving ground. */
    readonly available: boolean;
    /** Seconds until the results screen appears. Zero unless one is pending. */
    readonly resultsIn: number;
    /** Samples the ghost recorder has kept for the run in progress. */
    readonly recordedSamples: number;
  };
  /**
   * The stored personal best for the level being ridden, if there is one.
   *
   * `ghost` is reported as a sample count rather than as the track, because a
   * snapshot is serialised across the automation wire and a ghost is eighty
   * kilobytes of it.
   */
  /**
   * The paddle and this world's targets — M14.
   *
   * On the snapshot because the browser suite cannot otherwise see a swing at
   * all: the whole cycle is 0.44 s and the strike window inside it is 0.12 s,
   * so a spec that could only watch the screen would be sampling for a
   * transient it has no way to freeze on.
   */
  readonly paddle: {
    /** True when the rider is carrying one at all. Gates the button and the mesh. */
    readonly equipped: boolean;
    readonly phase: SwingPhase;
    /** Where the head is, in world space, at the end of the last fixed step. */
    readonly head: { readonly x: number; readonly y: number; readonly z: number };
    /** True if the last step threw its previous position away — the teleport guard. */
    readonly reseeded: boolean;
  };
  readonly targets: {
    readonly total: number;
    readonly struck: number;
    /** The best score saved for this world, or null. Never a timed record. */
    readonly best: number | null;
  };
  /**
   * The chase, as a browser spec can see it — M18.
   *
   * Everything the mode decides and nothing it draws. `available` is a property
   * of the loaded plan rather than of the state, so a spec can assert the
   * entrance's refusal on the city without entering anything; `copGap` is what
   * the bust is judged on and is otherwise invisible; and `secondRider` is the
   * renderer's own slot, which is the assertion that keeps the render budget
   * honest — the ghost and the cop must never both be up.
   */
  readonly chase: {
    readonly available: boolean;
    readonly phase: ChasePhase;
    readonly outcome: ChaseOutcome;
    readonly remaining: number;
    readonly survived: number;
    readonly straying: boolean;
    readonly copGap: number;
    /** How far the rider is from the route spine, metres. Infinity with none. */
    readonly offRoute: number;
    readonly secondRider: 'none' | 'ghost' | 'cop';
    readonly best: number | null;
    readonly bestEscaped: boolean;
  };
  readonly record: {
    readonly totalSeconds: number | null;
    readonly splits: readonly number[];
    readonly hasGhost: boolean;
    readonly persistent: boolean;
  };

  // -- M12 Phase 4 -------------------------------------------------------------
  /**
   * Which world is loaded — level identity, and deliberately not an option.
   *
   * `docs/PLANS.md` §10 puts it plainly: *the seed is level identity, not an
   * option — it flows through app state the way level selection does and never
   * through the options firewall.* So it is reported here, beside the app
   * state, rather than inside `options`. A seed in `GameOptions` would be a
   * seed that persists across sessions, that a settings reset could silently
   * change, and — worst — that would be a *player configuration* reaching
   * `simulation/`, which is exactly what invariant 5 exists to forbid.
   */
  /**
   * Who is on the wheel — M14.5.
   *
   * **Separate from `options.character`, and the split is the same one
   * `touch.visible` makes against `touch.wanted`.** That field is what the
   * player *asked for*; this is what is *installed*, read off the rig's own
   * root the way a spec would read it off the scene. A swap that silently
   * failed — a rebuild that threw, a guard that skipped — would leave the two
   * disagreeing, and only one of them can be asserted from a bridge call.
   */
  readonly rider: {
    /** What the store says. */
    readonly chosen: CharacterId;
    /** What the scene is drawing. */
    readonly installed: CharacterId;
    /** Which crash recording the audio layer will play. */
    readonly crashVoice: CrashVoiceId;
  };

  readonly world: {
    readonly levelId: LevelId;
    /** The route's seed. Empty on the slice and on the proving ground. */
    readonly seed: string;
    readonly generated: boolean;
    /** The address that reproduces this world, and the thing "share" shares. */
    readonly link: string;
  };
  /**
   * What the fresh-route panel is doing, as the panel itself has it.
   *
   * On the bridge because the rejected-seed path is the one player-facing flow
   * with no visible consequence to assert: nothing moves, no state changes, and
   * the correct behaviour is precisely that *the world did not change*. A spec
   * that could only watch the DOM could not tell a refusal from a click that
   * did nothing at all.
   */
  readonly route: {
    readonly status: RouteStatus['kind'];
    /** The seed the status is about. */
    readonly seed: string;
    /** True while a route is being built and the panel is waiting. */
    readonly pending: boolean;
  };
}

export class Game {
  readonly renderer: GameRenderer;
  readonly loop: FixedStepLoop;
  readonly tuning: LiveTuning;
  /**
   * The world, and everything built from it.
   *
   * **These five stopped being `readonly` at M12 Phase 4, and that is the
   * milestone rather than a compromise in it.** Until now the world was chosen
   * before construction and could not change — `app/main.ts` still carries the
   * comment saying a mid-life swap "would be three teardowns for a developer
   * diagnostic", and it was right while the only other world was reached by
   * typing a query parameter. Phase 4 makes choosing a world something a player
   * does, from a menu, without losing their session, so the swap is now the
   * feature and `installLevel` is the single path that performs it.
   *
   * What makes it safe is that Phase 3 already proved the expensive half:
   * twelve sequential regenerations through `renderer.setLevel` return every
   * GPU counter to its boot value (invariant 10, `tests/m12.spec.ts`). The
   * plain-data half — sampler, controller, referee — is rebuilt from the new
   * plan here, and nothing else in this file holds a reference to any of them
   * across a frame.
   */
  levelPlan: LevelPlan;
  controller: EucController;
  /**
   * The audio layer (M8).
   *
   * Owned here rather than by the renderer because it is driven by the
   * simulation's state, not by the scene: `render/` answers no gameplay
   * question, and "how hard is the wheel working" is a gameplay question. It
   * arms itself from the first real user gesture and is otherwise silent, so a
   * player who never touches the page never hears a thing — which is the
   * autoplay contract rather than a preference.
   */
  readonly audio: AudioEngine;

  /**
   * The player's options, and the state machine that decides what is on screen
   * (M9).
   *
   * Public because the QA bridge reaches both, and because the composition
   * root is the only place they may be read from: **nothing under
   * `simulation/` may see either of them** (AGENTS.md invariant 5, enforced in
   * `src/architecture.test.ts`). Everything below turns options into plain
   * scalars and pushes them into the systems that need them, exactly as
   * `applyTuning` has pushed developer values since M2.
   */
  readonly options: OptionsStore;
  readonly appState: AppState;

  /**
   * The timed run and the personal bests it is measured against (M10).
   *
   * `challenge` lives in `simulation/` because it is a rule rather than a
   * presentation — it decides what happened, not how it looks — and it takes
   * no options, so the firewall is untouched. `records` lives in `app/` beside
   * `options`, because persistence and hostile-input coercion are composition
   * concerns and `simulation/` may not reach `platform/` at all.
   *
   * They are separate objects rather than one because they answer to different
   * clocks: the run advances inside the fixed step and must be deterministic
   * under `advance(n)`, while a record is written once, from wall time, on the
   * frame a lap ends.
   */
  challenge: ChallengeRun;
  readonly records: RecordsStore;

  /**
   * The paddle and this world's targets — M14.
   *
   * **Game fields beside `challenge`, deliberately not options on the
   * controller.** `HazardField` and `SoftBodyField` are handed to
   * `EucController` because the *wheel* meets them: they change what riding
   * feels like, every step, under the contact patch. A swing is not something
   * the wheel meets. Putting these in the controller's options object would
   * pull swing state, target reading and scoring into a 4,400-line ride file
   * that has no business knowing a mode exists — and would make the paddle a
   * property of the machine at exactly the moment the project needs it to be a
   * property of *whoever is holding one*.
   *
   * They differ in lifetime, which is why one is `readonly` and one is not.
   * `Paddle` holds no world — it is arithmetic about an arm — so it is built
   * once, retuned by F4, and merely told to `cancel()` when the rider teleports.
   * `TargetField` *is* a world, and is rebuilt with the sampler, the controller
   * and the referee on every `installLevel`.
   */
  readonly paddle = new Paddle();
  targets: TargetField;
  /**
   * Knockabout's own personal bests — M14, §13 q15.
   *
   * **A second store rather than a second row in the first one.** `records.ts`
   * keys by level id alone and decides a record with `totalSeconds`, lower
   * winning; a score filed there would read as a lap time, beat every real lap
   * on the route, and evict its ghost. `knockaboutRecords.ts` says the rest.
   */
  readonly knockaboutRecords: KnockaboutRecordsStore;
  /** Simulation seconds this Knockabout run has lasted. Shown, worth nothing. */
  private knockaboutSeconds = 0;
  /** What the last finished run scored, for the results screen. */
  private lastKnockabout: { struck: number; total: number; seconds: number } | null = null;
  private lastKnockaboutWasRecord = false;

  // -- The chase (M18) --------------------------------------------------------
  //
  // Everything here is null on a world that cannot host a chase, and the mode's
  // entrance is what refuses such a world (§13 q26). The alternative — a cop
  // built on every world and hidden — would pay for a rig and a controller on
  // the title screen of the hand-authored city, which is where most players
  // spend their first minute.

  /** The referee: the clock, the bust, and the boundary. */
  readonly chaseRun = new ChaseRun();
  readonly chaseRecords: ChaseRecordsStore;
  /**
   * The route as one line, derived once per world.
   *
   * Null when the plan states no through line, which is the proving ground and
   * every fixture. `Game.chaseAvailable` is that fact said as a question.
   */
  private spine: RouteSpine | null = null;
  /**
   * The cop's body and his brain.
   *
   * **A second `EucController` over the same sampler**, which is the whole of
   * what makes him ride like a player: hazards, wobble, kerbs, the wall
   * standoff and the ragdoll are all his too, and none of it is code this file
   * had to write. Rebuilt with the world beside the player's own controller,
   * for the reason the hazard field is: one outliving its plan would put the
   * last route's potholes under this one's cop.
   */
  private copController: EucController | null = null;
  private copBrain: CpuRider | null = null;
  /**
   * His paddle. **His, and only his** — §13 q28.
   *
   * A separate `Paddle` from the player's, because two wielders swinging one
   * state machine would share a cooldown and a swing phase. `Game.paddle` stays
   * exactly what it was: Knockabout's, in the player's hands.
   */
  private readonly copPaddle = new Paddle();
  private readonly copPrevious: EucPose = createPose();
  private readonly copCurrent: EucPose = createPose();
  private readonly copRender: EucPose = createPose();
  private readonly copHead = new THREE.Vector3();
  /** Filled in place each step; the brain reads it and keeps nothing. */
  private readonly copView: { -readonly [K in keyof CpuView]: CpuView[K] } = {
    x: 0, y: 0, z: 0, headingY: 0, speed: 0,
    grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG,
  };
  /** The rider, as the one thing the cop's paddle can hit. See `RiderTarget`. */
  private readonly riderTarget = new RiderTarget();
  private readonly spineAt: SpineLocation = createSpineLocation();
  /** How far the cop is from the rider right now, metres. */
  private copGap = Infinity;
  /** What the last finished chase did, for the results screen. */
  private lastChase: { survived: number; escaped: boolean; outcome: string } | null = null;
  private lastChaseWasRecord = false;
  /**
   * `?chaseprobe=1` — a brain-ridden cop on any route, with no chase rules.
   *
   * M13's `?hazardprobe=` and M14's `?targetprobe=` on the same terms: it is
   * read at boot, held for the session, replayed into every world swap, and is
   * neither an option nor level identity. It is **not** in `Game.probing`,
   * because unlike those two it changes nothing about the world — no plan, no
   * placement, no id — so a personal best set while it is on is a best set on
   * the world everybody else rides.
   */
  private readonly chaseProbe: boolean;

  /**
   * M13 Phase 2's diagnostic hazard cadence, metres, or undefined.
   *
   * **Not an option and never one** (invariant 5): what is lying in the road is
   * a fact about the world, not presentation the player configures, and it
   * reaches `simulation/` only as the plan that got built. It is also not part
   * of level *identity* — `worldLink` never writes it and records are still
   * filed under the same level id — so it sits here beside the renderer's
   * fields rather than in `GameOptions` or in the seed.
   */
  private readonly hazardProbe: number | undefined;
  /**
   * M14 phase 2's diagnostic target cadence, metres, or undefined.
   *
   * `hazardProbe`'s twin, on `?hazardprobe=`'s exact terms — read at boot
   * because it decides what is *in* the world and the world is settled before
   * the first frame, held for the session, replayed into every world swap, not
   * an option, and not level identity.
   */
  private readonly targetProbe: number | undefined;

  private terrain: PlanTerrainSampler;
  private terrainView: TerrainView;
  /** Which world is loaded. See `GameSnapshot.world`. */
  private levelId: LevelId;
  /** Its seed, normalised. Empty unless `levelId` is `generated`. */
  private seed = '';
  /**
   * The fresh-route panel's state, mirrored so the QA bridge can read it.
   *
   * The panel is the authority on what the player sees; this is the same fact
   * in a form a browser spec can assert without parsing prose.
   */
  private routeStatus: RouteStatus = { kind: 'idle' };
  /** The mode that sent the player through Fresh route, if it was a prerequisite. */
  private routePurpose: RoutePurpose = 'ride';
  /**
   * A route the player has asked for, and how many frames to wait first.
   *
   * **The wait is one frame and it is the whole point.** Generating a route is
   * a synchronous call that takes up to about a second and a half on the seeds
   * that need all twelve attempts — which is exactly the seeds that are then
   * refused. Doing it inside the click handler means the game stops dead and
   * then says no, with nothing in between. Resolving it on the second frame
   * instead lets the "Building…" line the click wrote actually reach the
   * screen first, because a rAF callback runs *before* the paint of its own
   * frame and never after it.
   *
   * Driven from the loop's `beforeFrame` rather than from a timer of its own,
   * so the game keeps exactly one `requestAnimationFrame` owner and this adds
   * nothing that needs disposing.
   */
  private pendingRoute:
    | { readonly kind: 'seed'; readonly seed: string; readonly destination: RouteDestination }
    | { readonly kind: 'surprise'; readonly destination: RouteArrival }
    | null = null;
  private pendingRouteFrames = 0;
  /**
   * The player's rig.
   *
   * **Not `readonly` from M14.5**, for the same reason `levelPlan`, `controller`
   * and `challenge` stopped being at M12 Phase 4: a character swap is a
   * teardown and a rebuild, not a mutation. `installCharacter` is the one place
   * it is reassigned, and it is the only place that may be.
   */
  private rig: RidingRig;
  /**
   * Which rider the rig in the scene is actually wearing.
   *
   * Written only where the rig is built, so it cannot drift from the geometry
   * the way a value copied out of the options record could.
   */
  private installedCharacter: CharacterId = DEFAULT_CHARACTER;
  private readonly actionState: ActionState;
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private readonly touch: TouchInput;
  private readonly touchControls: TouchControls;
  /**
   * Whether this device's *primary* pointer is a finger, from the media query.
   *
   * Live rather than sampled once: a tablet docked to a keyboard changes the
   * answer while the game is running, and a player who undocks it should get
   * the controls back without reloading.
   */
  private readonly coarsePointer: MediaQueryList | null;
  /**
   * `prefers-reduced-motion`, watched rather than read once — M14.
   *
   * The knock-down is WebGL motion, so no CSS media query can reach it and the
   * composition root has to carry the preference across itself. Watched because
   * a player can change it while the game is running, and a target that keeps
   * toppling after they asked it not to is the preference being ignored.
   */
  private readonly reducedMotion: MediaQueryList | null;
  private readonly profiler: FrameProfiler;
  private readonly overlay: DebugOverlay;
  private readonly panel: TuningPanel;
  private readonly stopTuningListener: () => void;
  private readonly stopOptionsListener: () => void;
  private readonly stopStateListener: () => void;

  private readonly hud: Hud;
  private readonly hudModel: HudModel;
  private readonly menus: Menus;
  private readonly onboarding: Onboarding;
  /** Which device's names the first-ride prompts use. */
  private promptDevice: PromptDevice = 'keyboard';
  /** The most recent HUD reading, for the QA bridge. */
  private hudView: HudView;
  private hudPrompt: string | null = null;

  // -- M10 --------------------------------------------------------------------
  /**
   * The ghost, in its two halves.
   *
   * Both exist for the whole session rather than being built when a run starts,
   * because a `GhostRecorder` that is allocated on the start gate is an
   * allocation on the most latency-sensitive frame of the mode. Recording is
   * gated by the run's phase, not by whether the object exists.
   */
  private readonly ghostRecorder = new GhostRecorder();
  private ghostPlayer = new GhostPlayer(null);
  /** One preallocated sample, filled in place on the render frame. */
  private readonly ghostSample: GhostSample = createGhostSample();
  /**
   * Seconds of simulation left before the results screen appears, or zero.
   *
   * **Held here rather than in `ChallengeRun` deliberately.** The run is over
   * the instant the finish gate is crossed — that is a fact about the ride and
   * the referee owns it. How long the game waits before putting a dialog over
   * the top of the player's own finish is a fact about the *screen*, and it
   * belongs to the composition root along with every other decision about what
   * the player is looking at.
   */
  private resultsIn = 0;
  /**
   * The split the HUD is currently showing, handed to the model each frame.
   *
   * Latched from the fixed step for the same reason the audio one-shots are: a
   * crossing is a single step's edge, and a render frame that sampled for it
   * would miss most of them. The model owns how long it stays up.
   */
  private pendingSplit: { label: string; delta: number | null } | null = null;
  /** The most recent finished run, kept for the results screen and the bridge. */
  private lastResult: ChallengeResult | null = null;
  /** Whether the last finished run was actually kept by the store. */
  private lastResultWasRecord = false;
  /** Whether the store had to drop the ghost to fit the record in. */
  private lastResultGhostDropped = false;
  /**
   * The split table that was standing *before* the finished run, for the
   * results screen's per-leg deltas.
   *
   * **Captured rather than re-read, because by the time the panel is built the
   * store has already been given the new run.** Reading `records.best()` there
   * compares a record lap against itself and prints a column of `0.00`s under
   * a summary line correctly reading several seconds faster — which looks
   * exactly like the split table being broken, on the one screen whose whole
   * job is to be believed.
   *
   * Empty when there was no previous record, or when the stored table did not
   * line up with this route; `challenge.ts` refuses a misaligned reference for
   * the same reason and the results screen has to refuse it too, or a record
   * whose splits were dropped by coercion prints every leg as a loss of the
   * entire elapsed time.
   */
  private lastResultPreviousSplits: readonly number[] = [];

  private tick = 0;
  private simTimeSeconds = 0;
  private layoutChanges = 0;
  /** True while the document is hidden. A hidden ride is a frozen ride. */
  private pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

  /**
   * Context loss, which is the one reason the game freezes the loop that is
   * not an application state.
   *
   * **Player pause moved into `appState` at M9.** It was a boolean here from
   * M1, and `docs/PLANS.md` §3.2 has always described it as a state; now that
   * there are five of them and each declares whether simulation advances, the
   * boolean would have been a sixth opinion about the same question. Context
   * loss stays separate on purpose: it is not a pause, it is the GPU going
   * away, it can happen in any state, and simulating behind a dead canvas
   * serves nobody.
   */
  private contextLost = false;
  private readonly contextNotice: ScreenNotice;

  /**
   * The pose at the two most recent steps, and the interpolation between them.
   *
   * Three preallocated objects rather than three allocations per frame: at
   * 120 Hz simulation and 60 Hz rendering that would be 180 short-lived
   * objects a second, which is exactly the shape of garbage that shows up
   * months later as an unexplained periodic hitch.
   */
  private readonly previousPose: EucPose = createPose();
  private readonly currentPose: EucPose = createPose();
  private readonly renderPose: EucPose = createPose();

  /**
   * The chase camera, and its state at the two most recent steps.
   *
   * Same arrangement as the pose above, and for the same reason: the camera is
   * stepped at the fixed rate so `advance(n)` is deterministic, and the render
   * frame interpolates so the view does not stutter whenever the display
   * cadence and the step rate disagree — which is almost always.
   */
  private readonly chase: ChaseCamera;
  private readonly previousCamera: ChaseCameraState = createChaseCameraState();
  private readonly currentCamera: ChaseCameraState = createChaseCameraState();
  private readonly renderCamera: ChaseCameraState = createChaseCameraState();
  private readonly chaseView: ChaseCameraView = createChaseCameraView();
  /** One preallocated camera input, filled from the pose each step and frame. */
  private readonly chaseInput: ChaseCameraInput = {
    x: 0,
    y: 0,
    z: 0,
    headingY: 0,
    rollAngle: 0,
    speed: 0,
    groundY: 0,
    airborne: false,
    crashed: false,
  };
  private scriptedOcclusion: number | null = null;

  /** Scratch for the pedal-strike spark origin. Filled in place, never held. */
  private readonly strikePoint = new THREE.Vector3();
  /** Where the paddle head is this render frame, in world space — M14. */
  private readonly paddleHead = new THREE.Vector3();

  /** Diagnostic orbit state, at the two most recent steps. */
  private orbitAngle = 0;
  private previousOrbitAngle = 0;
  private cameraMode: CameraMode = 'chase';

  /**
   * How many times each one-shot has been claimed. The automation wire reads it.
   *
   * **Every `PressedAction` needs a zero here and the map is typed loosely
   * enough not to say so.** `this.consumed[action] += 1` on a missing key
   * evaluates `undefined + 1`, which compiles, yields `NaN`, and survives the
   * harness's `?? 0` — so every `after − before === 1` assertion silently reads
   * false while the overlay shows `NaN`.
   */
  private readonly consumed: Record<string, number> = {
    hop: 0,
    swing: 0,
    reset: 0,
    cameraCycle: 0,
    pause: 0,
    muteAudio: 0,
  };

  /**
   * Simulation seconds owed to the audio model, and the wall clock behind them.
   *
   * **The audio model advances on simulation time while the game is
   * simulating, and on wall time while it is not**, and both halves are
   * needed. Simulation time is what makes `advance(n)` reach the same beep
   * count and the same duck level every run — the whole reason a browser spec
   * can assert anything about sound. Wall time is what covers pause and
   * context loss, where no steps run at all and the only thing left to do is
   * fade to silence: driven from the step clock, that fade would freeze
   * half-way and the wheel would hum behind the pause card forever.
   */
  private audioStepSeconds = 0;
  private lastFrameMs = -1;
  private frameSeconds = 0;
  /** Previous crashed state, so the composition root can see the edge. */
  private wasCrashed = false;
  /** Throttle and steer from the most recent step, so the render frame need
   *  not resample. `sample()` allocates, and the step has already paid. */
  private lastThrottle = 0;
  private lastSteer = 0;
  /**
   * Simulation seconds owed to the HUD, and whether a hop left the ground in
   * them.
   *
   * Kept apart from `audioStepSeconds` even though both count the same thing:
   * that one is consumed and zeroed by the audio update, which runs first, so
   * sharing it would hand the HUD a zero every frame. The hop flag is latched
   * here for the same reason the audio one-shots are dispatched from `step` —
   * a single step's edge seen from the render frame is a coin toss.
   */
  private hudStepSeconds = 0;
  private hoppedSinceHudUpdate = false;
  /** The FOV trim in radians, converted once per change rather than per frame. */
  private fieldOfViewTrimRadians = 0;
  /**
   * The options record that is currently installed, so `applyOptions` can push
   * only what actually changed. Null until the first push.
   */
  private appliedOptions: GameOptions | null = null;
  /** Previous suspension travel, for the tyre's grain rate. */
  private lastSuspensionOffset = 0;
  /** Previous cop gap, for the siren's closing speed (M18). Infinity between pursuits. */
  private lastSirenGap = Number.POSITIVE_INFINITY;
  /**
   * One preallocated overlay context, filled in place.
   *
   * The overlay is only handed this when it is both visible and due a refresh,
   * so the assembly below runs about five times a second at most — and never
   * at all for a player who has not opened it.
   */
  private readonly debugContext: DebugContext = {
    tick: 0,
    simTimeSeconds: 0,
    loop: {} as LoopStats,
    actions: {} as ActionSnapshot,
    consumed: this.consumed,
    euc: {} as EucSnapshot,
    cameraMode: 'chase',
    cameraDistance: 0,
    cameraFov: 0,
    cameraLookAhead: 0,
    cameraBank: 0,
    cameraYawLag: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    pixelRatio: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    profile: {} as ProfileReport,
    tuningOverrides: 0,
    audio: {} as AudioSnapshot,
  };

  /**
   * @param levelId Which world to build. The default is the shipped slice
   *   level; `proving` is the M4 course, kept as the movement phase's measuring
   *   instrument and reachable only through `?level=proving`. See
   *   `level/levels.ts` for the decision and its reasons.
   */
  constructor(
    canvas: HTMLCanvasElement,
    levelId: LevelId = DEFAULT_LEVEL,
    /** Only read when `levelId` is `generated`. See `level/levels.ts`. */
    seed: string = DEFAULT_SEED,
    /**
     * M13 Phase 2's diagnostic hazard cadence, metres. Absent for every player.
     *
     * Held for the life of the session and replayed into **every** world swap
     * below, for `?wobble=`'s reason one layer up: `installLevel` rebuilds the
     * plan, so a probe that only reached the boot world would vanish the moment
     * the owner opened a fresh route — which is exactly the moment he wants to
     * see whether a hole reads on a road he has not memorised.
     */
    hazardProbe?: number,
    targetProbe?: number,
    /**
     * `?chaseprobe=1` — M18 Phase 2's early ride. Absent for every player.
     *
     * The third of these and the cheapest: it puts a brain-ridden cop on
     * whatever world is loaded with no chase rules attached, so the owner can
     * answer "does a second rider on the road read instantly, and is his look
     * right" before the mode exists to answer it inside.
     */
    chaseProbe = false,
  ) {
    this.hazardProbe = hazardProbe;
    this.targetProbe = targetProbe;
    this.chaseProbe = chaseProbe;
    this.tuning = new LiveTuning();

    // **Options are read before anything they configure is built.** Quality
    // decides a pixel ratio and whether the sun casts, and both are cheaper to
    // set once at construction than to change on the first frame — a player
    // who chose Low should never see one High frame.
    // One `SafeStorage` shared by both stores, so the probe that decides
    // whether this browser can save anything runs once rather than twice and
    // both stores agree about the answer. A settings screen saying persistence
    // works while the records screen says it does not would be a bug nobody
    // could reproduce without a private window.
    const storage = new SafeStorage();
    this.options = new OptionsStore(storage);
    this.records = new RecordsStore(storage);
    // The same `SafeStorage`, a different namespaced slot — M14, §13 q15.
    this.knockaboutRecords = new KnockaboutRecordsStore(storage);
    this.chaseRecords = new ChaseRecordsStore(storage);
    this.appState = new AppState();

    this.renderer = new GameRenderer(canvas);

    // One LevelPlan, two consumers that cannot drift (invariant 2). At M4 this
    // is no longer a claim about a future: the sampler builds the controller's
    // ground from the plan's heightfield and colliders, the renderer builds its
    // meshes from the same two arrays, and the renderer's own copy of the
    // ground — the M1 placeholder plane — no longer exists. From M7 there are
    // two producers of that structure and neither consumer can tell them apart,
    // which is the invariant finally being demonstrated rather than asserted.
    //
    // **A generated world asked for at boot goes through the same refusal a
    // typed seed does** (M12 Phase 4). `?level=generated&seed=<seed>` stopped
    // being purely a developer's diagnostic the moment the fresh-route panel
    // started writing that address into the URL bar as the shareable form of a
    // route: a link is now something one player sends another. About one seed
    // in 360 fails every attempt, and the owner's decision (`docs/PLANS.md`
    // §13, under q6) admits no exception — *no silent world swap, ever*. So a
    // failing seed lands on the shipped slice **and says so**, on the title
    // screen, rather than looking like the route the link promised.
    const boot = levelId === 'generated'
      ? requestRoute(seed, hazardProbe, targetProbe)
      : null;
    if (boot !== null && boot.ok) {
      this.levelId = 'generated';
      this.seed = boot.seed;
      this.levelPlan = boot.plan;
    } else {
      this.levelId = levelId === 'generated' ? DEFAULT_LEVEL : levelId;
      this.levelPlan = createLevel(this.levelId, seed, hazardProbe, targetProbe);
      if (boot !== null) this.routeStatus = { kind: 'no-route', seed: boot.seed };
    }
    this.terrain = new PlanTerrainSampler(this.levelPlan);
    // Both construction sites hand the controller the same three things, and
    // this one exists because the boot path cannot call `installLevel` — it is
    // building the fields `installLevel` replaces. Anything added to one must
    // be added to the other or the first world of a session behaves unlike
    // every world after it, which is the least findable class of bug this file
    // can produce.
    this.terrainView = this.renderer.setLevel(this.levelPlan);
    this.controller = new EucController(this.terrain, {
      spawn: this.levelPlan.spawn,
      hazards: new HazardField(this.levelPlan.hazards ?? []),
      softBodies: new SoftBodyField(this.levelPlan.softBodies ?? []),
    });

    // The referee reads the same plan the sampler and the renderer do, which is
    // invariant 2 arriving at its third consumer: a checkpoint is authored
    // once, detected from that authoring, and drawn from that authoring, so a
    // gate cannot be somewhere different for the player than for the clock.
    // The proving ground carries no checkpoints and `available` is false there,
    // which is what keeps the time trial off a level that is a measuring
    // instrument rather than a place.
    this.challenge = new ChallengeRun(this.levelPlan.id, this.levelPlan.checkpoints);
    // Built here as well as in `installLevel`, for the reason stated above the
    // controller: this path constructs the fields that one replaces, and
    // anything added to one and not the other makes the first world of a
    // session behave unlike every world after it.
    this.targets = new TargetField(this.levelPlan.targets ?? []);
    // And the chase's world half, on exactly that argument — M18. A boot
    // straight onto a generated route through `?level=generated&seed=` is a
    // world a chase can run on, and building the spine only in `installLevel`
    // would make the first world of a session the one world the mode refuses.
    this.installChaseWorld(this.levelPlan);

    // Wearing whoever the player last chose. Read straight from the store
    // rather than left to `applyOptions` below, because a rig built as Cool
    // Rider and swapped one frame later is a frame of the wrong character on
    // every boot — and because `installCharacter` would then dispose a rig that
    // had never drawn anything.
    this.installedCharacter = this.options.current.character;
    this.rig = createRidingRig(
      riderLook(this.installedCharacter),
      machineLook(machineForCharacter(this.installedCharacter)),
    );
    this.renderer.scene.add(this.rig.group);
    this.renderer.setCharacter(this.installedCharacter);

    // Constructed at boot, silent until a gesture. The model runs from the
    // first frame regardless of whether anything is audible, so the wheel is
    // already at the right pitch on the step the context comes alive rather
    // than sliding up to it over the following second.
    this.audio = new AudioEngine();
    // The approved recordings' URLs, handed in here because only the
    // composition root may know the bundler exists. Fetching starts now;
    // decoding waits for the arm gesture.
    this.audio.setSampleUrls(SAMPLE_URLS);
    // Whose crash plays. A plain string across the boundary, never an options
    // record (invariant 5). Set here as well as in `applyOptions` because the
    // engine holds it until a gesture builds the sink.
    this.audio.setCrashVoice(crashVoiceFor(this.options.current.character));

    // The camera reaches the world through the same `TerrainSampler` the
    // controller does, which `simulation/world.ts` has named as the route for
    // camera obstruction since M0. The renderer still answers no gameplay
    // question, and the controller is asked no camera question: both of them
    // read one plan (invariants 2 and 3).
    this.chase = new ChaseCamera();
    this.chase.setOcclusionProbe(
      (origin, direction, maxDistance) => this.terrain.raycast(origin, direction, maxDistance),
    );
    this.syncPoses();

    this.actionState = new ActionState();
    this.profiler = new FrameProfiler();
    this.overlay = new DebugOverlay();
    this.panel = new TuningPanel(this.tuning);

    // The HUD, the menus, and the first-ride prompts (M9). The pause card that
    // `ui/notice.ts` carried since M1 is gone, replaced by the real pause
    // menu, exactly as that file's own header said it would be; the
    // context-loss panel below it stays, because it is stability tooling
    // rather than a placeholder.
    this.hudModel = new HudModel({ speedUnit: this.options.current.speedUnit });
    this.hudView = this.hudModel.update(0, {
      speed: 0,
      powerStage: 'normal',
      tiltBack: 0,
      offCourse: false,
      crashed: false,
    });
    this.hud = new Hud({ onDismissPrompt: () => this.dismissPrompt() });
    this.onboarding = new Onboarding(this.options.current.seenPrompts);
    this.menus = new Menus(this.options.current, {
      callbacks: {
        onStartRide: () => this.goTo('freeRide'),
        // **Not `goTo('freeRide')`.** From M10 there are two rides and Resume
        // has to return to the one that was paused; sending every resume to
        // free ride would silently end a timed run the player had two minutes
        // invested in, with the clock still on screen as they were paused.
        onResume: () => {
          this.appState.resumeRide();
        },
        onOpenSettings: () => this.goTo('settings'),
        onCloseSettings: () => {
          this.appState.exitSettings();
        },
        onQuitToTitle: () => {
          this.resetRider();
          this.goTo('title');
        },
        onChange: (patch) => this.options.set(patch),
        onResetOptions: () => this.resetOptions(),

        // -- M10 -------------------------------------------------------------
        onStartChallenge: () => this.startChallenge(),
        onStartKnockabout: () => this.enterKnockabout(),
        onStartChase: () => this.enterChase(),
        // **Retry means the mode the run that just finished was in** — M14.
        // One button, two modes, and the results screen must not have to know
        // which: `lastKnockabout` is set only by a Knockabout run and cleared
        // by the next one starting, so it is the honest record of what the
        // player is looking at the results of.
        onRetryChallenge: () => {
          // Retry means "again", and again means the mode that just ended.
          // Each entrance clears the other two's last result, so exactly one of
          // these is non-null on any results screen.
          if (this.lastKnockabout !== null) this.enterKnockabout();
          else if (this.lastChase !== null) this.enterChase();
          else this.startChallenge();
        },
        onResultsToTitle: () => {
          this.resetRider();
          this.goTo('title');
        },

        // -- M12 Phase 4 -----------------------------------------------------
        onOpenRoutes: () => this.openRoutes(),
        onCloseRoutes: () => this.closeRoutes(),
        onRideRoute: (typed) => this.requestFreshRoute(typed, false),
        onTimeTrialRoute: (typed) => this.requestFreshRoute(typed, true),
        onSurpriseSeed: () => this.surpriseSeed(),
        onRideTheCity: () => this.rideTheCity(),
        onCopyLink: () => this.copyWorldLink(),

        // -- M14.5 -----------------------------------------------------------
        onOpenRiders: () => this.goTo('riderSelect'),
        onCloseRiders: () => this.goTo('title'),
        // Straight into the store, exactly like every other player choice: the
        // swap happens in `applyOptions`, so the one path that changes a rider
        // is the one path that persists it. A method that swapped the rig here
        // and wrote the option afterwards would be two sources of truth for who
        // is on the wheel.
        onPickRider: (id) => this.options.set({ character: id }),
      },
      seedMaxLength: MAX_SEED_LENGTH,
    });
    this.menus.setPersistenceWarning(this.options.persistent);
    // Whether a level has a route is a property of the plan, so this is asked
    // at construction *and* again on every world swap (`installLevel`). It was
    // a construction-time question only until M12 Phase 4, when the plan
    // started being able to change while the game is running.
    this.menus.setChallengeAvailable(this.challenge.available);
    this.publishWorld();
    this.menus.setRouteStatus(this.routeStatus);
    // A link whose seed did not build is a link that now names a world the
    // player is not in. Rewriting it is the same honesty the title screen's
    // message is, applied to the address bar — and it is the only boot-time
    // rewrite, so `?level=proving`, `?debug=1` and the capture tools' own
    // addresses are left exactly as they arrived.
    if (this.routeStatus.kind === 'no-route') this.syncWorldUrl();

    this.contextNotice = new ScreenNotice({
      id: 'euc-context-notice',
      role: 'alert',
      title: 'Graphics interrupted',
      message:
        'The browser took the graphics context away — usually a GPU reset or '
        + 'the machine waking up. The game is paused while it waits for the '
        + 'context to come back. If nothing happens, reload.',
      actionLabel: 'Reload the game',
      onAction: () => window.location.reload(),
    });
    this.renderer.setContextLossCallbacks({
      onLost: () => this.handleContextLost(),
      onRestored: () => this.handleContextRestored(),
    });

    this.loop = new FixedStepLoop(
      {
        beforeFrame: this.beforeFrame,
        step: this.step,
        render: this.render,
        onFrameSampled: this.onFrameSampled,
      },
      createBrowserScheduler(),
    );

    this.keyboard = new KeyboardInput(this.actionState, {
      now: () => this.simTimeSeconds,
      onDebugAction: (action) => {
        if (action === 'toggleOverlay') this.overlay.toggle();
        else this.panel.toggle();
      },
      // A key held when focus leaves never delivers its keyup, and the clock
      // kept running while nothing was drawn. Both are reset together.
      onInputReset: () => this.loop.resetTime(),
    });

    // The pad (M9). Keyboard remains authoritative and both are live at once —
    // `ActionState` carries one set of devices per action for exactly this
    // reason. Polled from `beforeFrame`, because the Gamepad API has no events
    // for button state.
    this.gamepad = new GamepadInput(this.actionState, {
      now: () => this.simTimeSeconds,
      // From the tuning table rather than the module's own defaults, because
      // invariant 4 says every tuning constant lives in one place. The device
      // layer keeps documented fallbacks so it stays testable standalone.
      stickDeadZone: INPUT.gamepadStickDeadZone,
      triggerThreshold: INPUT.gamepadTriggerThreshold,
      menuStickThreshold: INPUT.menuStickThreshold,
      menuRepeatDelaySeconds: INPUT.menuRepeatDelaySeconds,
      menuRepeatIntervalSeconds: INPUT.menuRepeatIntervalSeconds,
      onConnectionChange: (connected) => {
        // The prompts change their wording rather than their timing: a player
        // who picks up a pad mid-ride should not be told to press W.
        //
        // **A pad leaving hands the prompts back to whatever is actually
        // there**, which since M11.5 is not always a keyboard: a phone with a
        // pad paired to it falls back to the on-screen controls, not to keys
        // it does not have. `updateTouchControls` is the one place that
        // decides, so this asks it rather than guessing a second time.
        if (connected) this.promptDevice = 'gamepad';
        else this.updateTouchControls();
        this.updateGamepadStatus();
      },
      onMenuAction: (action) => this.handleMenuAction(action),
    });

    // The touchscreen (M11.5). Split in two on purpose: `TouchInput` holds what
    // a drag means and is provable headlessly, `TouchControls` holds the
    // elements. Neither knows the other's half.
    this.touch = new TouchInput(this.actionState, {
      now: () => this.simTimeSeconds,
      viewportWidth: () => this.renderer.viewport().width,
      stickTravelPx: INPUT.touchStickTravelPx,
      stickDeadZonePx: INPUT.touchStickDeadZonePx,
      stickCurve: INPUT.touchStickCurve,
      onStickChange: (throttle, steer) => this.touchControls.showStick(throttle, steer),
    });
    this.touchControls = new TouchControls({
      input: this.touch,
      // The media query cannot answer for a laptop with a touchscreen, which
      // reports a mouse until somebody reaches up and uses it. This is that
      // moment, and it is the only signal that gets that case right.
      onFirstTouch: () => {
        this.updateTouchControls();
        this.updateTouchStatus();
      },
    });
    this.coarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;
    this.coarsePointer?.addEventListener('change', this.onPointerKindChange);
    this.reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.reducedMotion?.addEventListener('change', this.onReducedMotionChange);
    this.renderer.setTargetsReducedMotion(this.reducedMotion?.matches ?? false);

    // A second `visibilitychange` observer, and unlike the `resize` case above
    // that is fine: observing visibility is idempotent, so nothing is consumed
    // and neither observer can hide the event from the other. The keyboard's
    // handler clears held keys; this one gives the audio thread back, which is
    // a different job with a different lifetime — it has to *undo* itself when
    // the tab comes back, and an input reset never does.
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.stopTuningListener = this.tuning.onChange(() => this.applyTuning());
    this.stopOptionsListener = this.options.onChange((options) => this.applyOptions(options));
    this.stopStateListener = this.appState.onChange((to) => this.enterState(to.id));
    this.applyTuning();
    this.applyOptions(this.options.current);
    this.enterState(this.appState.current);

    // Measure once before the first frame so a boot that lands before layout
    // does not draw one frame through a degenerate projection.
    this.renderer.resize();
  }

  start(): void {
    this.profiler.begin();
    // Boot → Loading → Title. The two early states have no duration of their
    // own in the slice — there is nothing to stream — so the machine walks
    // through them rather than pretending to load. They exist because
    // `docs/PLANS.md` §3.2 names them and because M12's generated level will
    // have something real to put in Loading.
    this.appState.goTo('loading');
    this.appState.goTo('title');
    this.loop.start();
  }

  /** Open the overlay and/or panel from the URL, for QA and for screenshots. */
  applyDebugQuery(search: string): void {
    const params = new URLSearchParams(search);
    if (params.get('debug') === '1') this.overlay.setVisible(true);
    if (params.get('panel') === '1') this.panel.setVisible(true);
    this.applyWobbleQuery(params);
  }

  /**
   * `?wobble=<gain>` — the one switch that turns M13 on, for the owner's ride.
   *
   * **It exists because the gate device is a phone.** `wobbleMasterGain` ships
   * at zero and stays there until the owner rides the redesign and says
   * otherwise (`docs/PLANS.md` §10, M13), so something has to open it for that
   * ride — and the F4 panel that would normally do it is a keyboard surface the
   * touch layout has no route to. A query parameter is the only affordance that
   * works identically on both machines he plays on, and it is the same
   * diagnostic terms `?level=proving` already ships under.
   *
   * **Written into the live-tuning store rather than onto the controller**, and
   * that is the load-bearing detail: `installLevel` builds a *new*
   * `EucController` on every world swap and replays `applyTuning()` onto it, so
   * a value set directly on the controller would vanish the moment the player
   * opened a fresh route — which is exactly what the ride would do. It also
   * means the F4 sliders and this parameter are writing to one place and cannot
   * disagree. It is deliberately **not** an option: `wobbleMasterGain` is a
   * physical quantity, and invariant 5 keeps player options out of
   * `simulation/`.
   *
   * **This parameter opens the gate and does nothing else.** It used to also
   * arm a distance-cadence probe (an impulse every 60 m of travel) because at
   * Phase 0 no hazard existed and an armed gate with nothing to trigger it
   * proved nothing. Phase 3 put real hazards on every generated route, and the
   * owner's Phase 4 exit ride caught the leftover exactly as a rider would:
   * the weave felt "always on", because it was — the road was wobbling him on
   * a timer, not the hazards. His standing rule is that nothing but a hazard
   * may ever trigger wobble, so no URL arms the probe any more. The cadence
   * mechanism itself survives in `EucController` as a bench instrument —
   * `EUC.wobbleProbeMetres` ships at zero and only a test or the F4 panel can
   * raise it — because the wobble suites charge the oscillator through it
   * deterministically, which riding over a placed hazard cannot do.
   */
  private applyWobbleQuery(params: URLSearchParams): void {
    const gain = readNumberParam(params, 'wobble', 0, 1);
    if (gain === null) return;
    this.tuning.set('EUC.wobbleMasterGain', gain);
  }

  // ---------------------------------------------------------------------------
  // QA bridge
  // ---------------------------------------------------------------------------

  /**
   * Run exactly `steps` fixed steps through the real update path, then draw.
   *
   * Not a fast-forward: it is the same `step` a real frame calls, at the same
   * `dt`, so anything it reaches is reachable in play.
   */
  advance(steps: number): void {
    this.loop.advance(steps);
  }

  /**
   * Build a `LevelPlan` without installing it — M12 Phase 3's regeneration
   * audit.
   *
   * Phase 3 has to prove that N sequential generations plateau GPU objects
   * (`docs/PLANS.md` §10, invariant 10), and that measurement needs several
   * worlds inside one page: a reload proves nothing about a leak, because a
   * reload throws away the renderer too. So the spec builds worlds with this
   * and hands them to `renderer.setLevel`, which is the real rebuild path and
   * already disposes what it replaces.
   *
   * **It installs nothing and changes nothing.** `createLevel` is a pure
   * function of an id and a seed, so this is the plan as data — the caller
   * decides whether anything ever draws it. Making the *game* swap levels
   * mid-life is Phase 4's business (the seed becomes level identity and flows
   * through app state), and nothing here anticipates that decision.
   */
  buildLevel(levelId: LevelId, seed: string): LevelPlan {
    // **Carries this session's hazard probe**, so the plan it returns is a
    // world like the one that is loaded rather than a hazard-free twin of it.
    // A regeneration audit that rebuilt a *different* shape of world would
    // plateau perfectly while leaking the family it never built (M13 Phase 2);
    // undefined for every session that did not ask for the diagnostic, which
    // leaves M12's use of this untouched.
    return createLevel(levelId, seed, this.hazardProbe, this.targetProbe);
  }

  /** Write semantic actions directly. See `ActionState.setScripted`. */
  setActions(actions: ScriptedActions): void {
    this.actionState.setScripted(actions, this.simTimeSeconds);
  }

  /** Hand the axes back to the keyboard. */
  clearActions(): void {
    this.actionState.clearScripted();
  }

  /**
   * Pretend something solid sits `distance` metres along the spring arm, or
   * `null` to hand obstruction back to the level.
   *
   * The M2 plane is a single ground slab with nothing above it to hide behind,
   * so the obstruction pull-in has no way to fire in the shipped world until
   * M4 brings geometry. Rather than add level content nobody asked for, this
   * scripts the probe the same way `setActions` scripts the input — one
   * override, cleared explicitly, driving the real code path rather than a
   * parallel one. The general probe is covered headlessly with a test double
   * in `src/render/chaseCamera.test.ts`.
   */
  setOcclusion(distance: number | null): void {
    this.scriptedOcclusion = distance;
    if (distance === null) {
      this.chase.setOcclusionProbe(
        (origin, direction, maxDistance) => this.terrain.raycast(origin, direction, maxDistance),
      );
      return;
    }
    this.chase.setOcclusionProbe((_origin, _direction, maxDistance) => (
      distance <= maxDistance ? distance : null
    ));
  }

  /**
   * Put the rider somewhere and point them, exactly as quick reset does but at
   * a stated place rather than at the spawn.
   *
   * Durable tooling, not a test-only hook. It is the same operation M6's crash
   * recovery ("restore the rider at the last validated safe position") and
   * M10's checkpoint respawn both need, and it exists now because M4's terrain
   * specs have to ask questions about specific places — is the camera occluded
   * *behind the gateway*, does the wheel mount *this* kerb — and riding to each
   * of them would make every one of those specs a test of the route as much as
   * of the thing it names.
   *
   * Collapses the interpolation history and snaps the camera, for the same
   * reason `resetRider` does: otherwise the next frame draws a rig smeared
   * across the map and several seconds of the rider being chased from wherever
   * they used to be.
   */
  placeRider(position: { x: number; y: number; z: number }, headingY: number): void {
    this.controller.reset({ position, headingY });
    this.syncPoses();
    this.renderer.clearParticles();
    // The automation wire's own teleport, and the one a spec uses to set a shot
    // up beside a target. Without it the first swing afterwards sweeps from
    // wherever the rider was parked before.
    this.paddle.cancel();
  }

  /**
   * Ask the level what the ground is at a point, through the same sampler the
   * controller uses.
   *
   * On the bridge rather than reachable only from the controller because a
   * browser spec's most useful terrain question is about ground the rider is
   * not standing on — is the kerb where the plan says, is the far side of the
   * gate solid, does the surround start where the heightfield ends. Allocates,
   * which is fine: nothing in the frame loop calls it.
   */
  sampleGround(x: number, z: number): {
    height: number;
    normal: { x: number; y: number; z: number };
    surface: string;
    offCourse: boolean;
  } {
    const sample = createGroundSample();
    this.terrain.sampleGround(x, z, sample);
    return {
      height: sample.height,
      normal: { ...sample.normal },
      surface: sample.surface,
      offCourse: sample.offCourse,
    };
  }

  snapshot(): GameSnapshot {
    const info = this.renderer.renderer.info;
    return {
      tick: this.tick,
      simTimeSeconds: this.simTimeSeconds,
      loop: this.loop.stats(),
      actions: this.actionState.sample(this.simTimeSeconds),
      consumed: { ...this.consumed },
      euc: this.controller.snapshot(),
      camera: {
        mode: this.cameraMode,
        orbitAngle: this.orbitAngle,
        yaw: this.currentCamera.yaw,
        distance: this.currentCamera.distance,
        armDistance: this.currentCamera.armDistance,
        fov: this.currentCamera.fov,
        bank: this.currentCamera.bank,
        lookAhead: this.currentCamera.lookAhead,
        heightLag: this.currentCamera.heightLag,
        dip: this.currentCamera.dip,
        crashFrame: this.currentCamera.crashFrame,
        scriptedOcclusion: this.scriptedOcclusion !== null,
      },
      particles: this.renderer.particleCounts(),
      viewport: this.renderer.viewport(),
      render: { drawCalls: info.render.calls, triangles: info.render.triangles },
      resources: this.resources(),
      tuning: {
        overrides: this.tuning.overrides(),
        overrideCount: this.tuning.overrideCount(),
        exposure: this.renderer.renderer.toneMappingExposure,
        fieldOfView: this.renderer.camera.fov,
      },
      debug: { overlayVisible: this.overlay.visible, panelVisible: this.panel.visible },
      levelPlanId: this.levelPlan.id,
      level: {
        segments: this.levelPlan.segments.length,
        colliders: this.levelPlan.segments.reduce(
          (total, segment) => total + segment.colliders.length,
          0,
        ),
        solids: this.levelPlan.solids?.length ?? 0,
        targets: this.levelPlan.targets?.length ?? 0,
        cellsDrawn: this.terrainView.cellsDrawn,
        triangles: this.terrainView.triangles,
        surfaces: [...paintedSurfaces(this.levelPlan)].sort(),
      },
      layoutChanges: this.layoutChanges,
      paused: this.appState.current === 'paused',
      contextLost: this.contextLost,
      audio: this.audio.snapshot(),
      app: {
        state: this.appState.current,
        menu: this.menus.current,
        acceptsRideInput: this.appState.acceptsRideInput,
        simulates: this.appState.simulates,
      },
      hud: { ...this.hudView, prompt: this.hudPrompt, visible: this.hud.visible },
      options: { ...this.options.current, persistent: this.options.persistent },
      gamepadConnected: this.gamepad.connected,
      touch: {
        visible: this.touchControls.visible,
        wanted: this.touchWanted,
        throttle: this.touch.throttle,
        steer: this.touch.steer,
        promptDevice: this.promptDevice,
      },
      challenge: {
        ...this.challenge.state,
        available: this.challenge.available,
        resultsIn: this.resultsIn,
        recordedSamples: this.ghostRecorder.sampleCount,
      },
      paddle: {
        equipped: this.paddleEquipped,
        phase: this.paddle.phase,
        head: this.paddle.headPosition,
        reseeded: this.paddle.reseeded,
      },
      targets: {
        total: this.targets.count,
        struck: this.targets.struckCount,
        best: this.probing ? null : this.knockaboutRecords.best(this.levelPlan.id)?.struck ?? null,
      },
      chase: (() => {
        const state = this.chaseRun.state;
        const best = this.probing ? null : this.chaseRecords.best(this.levelPlan.id);
        let offRoute = Infinity;
        if (this.spine !== null) {
          this.spine.locate(this.currentPose.x, this.currentPose.z, -1, this.spineAt);
          offRoute = this.spineAt.offRoute;
        }
        return {
          available: this.chaseAvailable,
          phase: state.phase,
          outcome: state.outcome,
          remaining: state.remaining,
          survived: state.survived,
          straying: state.straying,
          copGap: this.copGap,
          offRoute,
          secondRider: this.renderer.secondRiderShown,
          best: best?.seconds ?? null,
          bestEscaped: best?.escaped ?? false,
        };
      })(),
      record: (() => {
        const best = this.recordForCurrentWorld();
        return {
          totalSeconds: best?.totalSeconds ?? null,
          splits: best?.splits ?? [],
          hasGhost: best?.ghost != null,
          persistent: this.records.persistent,
        };
      })(),
      rider: {
        chosen: this.options.current.character,
        installed: this.installedCharacter,
        crashVoice: crashVoiceFor(this.installedCharacter),
      },

      world: {
        levelId: this.levelId,
        seed: this.seed,
        generated: this.levelId === 'generated',
        link: this.worldLink(),
      },
      route: {
        status: this.routeStatus.kind,
        seed: 'seed' in this.routeStatus ? this.routeStatus.seed : '',
        pending: this.pendingRoute !== null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Menus and options, on the QA bridge (M9)
  // ---------------------------------------------------------------------------

  /**
   * Drive the application state machine directly.
   *
   * The same operation a menu button performs, and it goes through the same
   * `AppState`, so a spec that reaches a ride this way has reached the state a
   * player reaches — not a parallel one. Returns whether the move was legal,
   * which is itself worth asserting.
   */
  setAppState(state: AppStateId): boolean {
    return this.goTo(state);
  }

  /** Change options exactly as the settings screen does. */
  setOptions(patch: Partial<GameOptions>): void {
    this.options.set(patch);
  }

  /**
   * Start a timed run exactly as the title screen's Time trial button does
   * (M10).
   *
   * On the bridge for the same reason `setAppState` is: a spec that reaches a
   * run this way has reached the state a player reaches, through the same
   * reset, the same reference load, and the same state transition — not a
   * parallel one that only the tests can see.
   */
  /**
   * Start Knockabout, for the automation wire — M14.
   *
   * `startTimeTrial`'s twin, and it exists for the same reason: a browser spec
   * cannot press a title-screen button that may be one gamepad walk away from
   * where the last spec left the focus. On a world with nothing to hit this
   * opens the fresh-route panel instead, which is the shipped behaviour rather
   * than a test-only branch.
   */
  startKnockabout(): void {
    this.enterKnockabout();
  }

  startTimeTrial(): void {
    this.startChallenge();
  }

  /**
   * Start a police chase, for the automation wire — M18.
   *
   * `startKnockabout`'s twin and it exists for the same reason: a browser spec
   * cannot press a title-screen button that may be one gamepad walk away from
   * wherever the last spec left the focus. On a world that cannot host a chase
   * this opens the fresh-route panel instead, which is the shipped behaviour
   * rather than a test-only branch.
   */
  startChase(): void {
    this.enterChase();
  }

  /**
   * Forget every saved personal best and ghost.
   *
   * Deliberately **not** offered anywhere in the game's own UI. It exists so a
   * browser spec can start from a known-empty store, and because a records
   * feature with no way to clear it during development is a feature nobody can
   * test twice. A player-facing "delete all my times" button with no undo is
   * one misclick away from being the worst thing this game can do to somebody,
   * and nothing in M10's brief asked for one.
   */
  clearRecords(): void {
    this.records.clearAll();
    // Both stores — M14. "Clear my records" that left half of them behind
    // would be the kind of half-answer a player only discovers by opening the
    // mode that still remembers.
    this.knockaboutRecords.clearAll();
    this.chaseRecords.clearAll();
    this.loadRecordReference();
  }

  /**
   * Forget every saved option, exactly as the settings screen's reset does.
   *
   * The onboarding is re-armed with it, because "reset everything to defaults"
   * clears the seen-prompt flags in the saved record and a live `Onboarding`
   * holding its own set would go on believing the player had seen them. The
   * button would look like it worked, the record would say the prompts were
   * unseen, and they would never appear again.
   */
  resetOptions(): void {
    this.options.reset();
    this.onboarding.restart(this.options.current.seenPrompts);
  }

  /**
   * Whether saving works in this browser.
   *
   * Separate from `snapshot()` so a spec can ask before doing anything that
   * would depend on the answer — a private-window run asserting persistence
   * would otherwise fail for a reason that says nothing about the game.
   */
  optionsPersist(): boolean {
    return this.options.persistent;
  }

  // ---------------------------------------------------------------------------
  // The challenge (M10)
  // ---------------------------------------------------------------------------

  /**
   * Begin a timed run, from the title screen or from the results screen's
   * Retry. Both are the same operation and neither is a special case.
   *
   * The rider goes to the start checkpoint's derived run-up first, so every
   * attempt starts from an identical wheel — same place, same heading, stopped
   * — and a personal best measures riding rather than leftover momentum. The
   * plan owns that checkpoint, so a generated course inherits the same rule.
   */
  private startChallenge(): void {
    if (!this.challenge.available) return;

    this.resetChallengeRider();
    this.loadRecordReference();
    this.challenge.arm();
    // `goTo('challenge')` makes the gate group visible immediately. Point it
    // at the armed start before that happens, or a retry can show the previous
    // attempt's finish for one frame.
    this.renderer.setCheckpointProgress(this.challenge.state.nextIndex);
    this.ghostRecorder.reset();
    this.resultsIn = 0;
    this.pendingSplit = null;
    this.lastResult = null;
    this.lastResultWasRecord = false;
    this.lastResultGhostDropped = false;
    this.goTo('challenge');
  }

  /**
   * The player chose Knockabout — M14.
   *
   * **The entrance is always on the title screen** (§13 q13), so this is
   * reached on worlds that carry nothing to hit, and what happens then is not a
   * shrug: it opens the fresh-route panel with a line saying what the mode
   * needs. That is `no-route`'s shape — name the fix, do not apologise, never
   * silently swap the world for one that would have worked — and it is why the
   * button is not simply hidden. A control that appears and disappears is a
   * mode nobody learns exists.
   *
   * §13 q21 makes a target-free generated route legal rather than a world to
   * throw away, so this path is a real one and not only a slice-and-proving
   * -ground case.
   */
  private enterKnockabout(): void {
    if (this.targets.count === 0) {
      this.openRoutes('knockabout');
      this.setRouteStatus({ kind: 'needs-targets' });
      return;
    }

    // Every target back up, and the run's own clock at zero. A fresh run on the
    // same world, which is not the same thing as a reload — the plan is
    // immutable and standing is what a target is when a world is built.
    this.targets.reset();
    this.renderer.resetTargets();
    this.paddle.cancel();
    this.knockaboutSeconds = 0;
    this.lastKnockabout = null;
    this.lastKnockaboutWasRecord = false;
    // The other mode's card is not this mode's card — M18. `buildResultsView`
    // picks by whichever last result is non-null, so an entrance that left the
    // previous mode's standing would show it.
    this.lastChase = null;
    this.chaseRun.abandon();
    this.resultsIn = 0;
    // Deliberately **not** `resetChallengeRider`: there is no start gate to run
    // up to. Knockabout begins where the world begins, which is also what makes
    // "ride it again" mean the same thing every time.
    this.resetRider();
    this.setRoutePurpose('ride');
    this.goTo('knockabout');
  }

  /**
   * One fixed step of the Knockabout run — M14.
   *
   * The clock and the ending, and nothing else: the swings themselves are
   * `stepPaddle`, which runs in every ride state because the paddle is a
   * property of whoever is carrying one rather than of the mode.
   *
   * **A run ends when the last target is down.** There is no timer to run out
   * and no finish line to cross — §13 q14 makes elapsed a number that is shown
   * and counts zero — so the only two ways out are clearing the route and
   * choosing to stop, which is the pause menu's quit.
   */
  private stepKnockabout(stepSeconds: number): void {
    if (this.appState.current !== 'knockabout') return;

    if (this.resultsIn > 0) {
      this.resultsIn -= stepSeconds;
      if (this.resultsIn <= 0) {
        this.resultsIn = 0;
        this.goTo('results');
      }
      return;
    }

    this.knockaboutSeconds += stepSeconds;
    if (this.targets.struckCount < this.targets.count) return;
    this.finishKnockabout();
  }

  /** The last target went down. Score it, offer it, and show the results. */
  private finishKnockabout(): void {
    const result = {
      struck: this.targets.struckCount,
      total: this.targets.count,
      seconds: this.knockaboutSeconds,
    };
    this.lastKnockabout = result;
    this.lastKnockaboutWasRecord = false;

    // A probe session changes the course without changing its id, so a best set
    // on one would be filed against a world nobody else can ride. One
    // chokepoint, shared with the timed run's three.
    if (!this.probing) {
      const candidate: KnockaboutRecord = {
        levelId: this.levelPlan.id,
        struck: result.struck,
        total: result.total,
        seconds: result.seconds,
        setAt: new Date().toISOString(),
      };
      this.lastKnockaboutWasRecord = this.knockaboutRecords.submit(candidate);
    }

    // The same pause the finish line gets, and for the same reason: the last
    // target going down is the payoff, and a results dialog on that frame
    // steals the moment the player just earned.
    this.resultsIn = CHALLENGE.resultsDelaySeconds;
  }

  /**
   * A finished Knockabout run, as words — M14, §13 q14.
   *
   * **The score is targets struck out of the total, elapsed is shown and counts
   * zero, and a miss costs nothing.** All three are the owner's answer, and the
   * third is why there is no "missed" row and no per-target line: the recorded
   * rule against scolding a player for exploring cut the "Missed: Park gate"
   * line at M10, and a results screen listing what you did not hit is that line
   * twelve times over.
   *
   * The rows are the two facts a player wants and nothing else. Formatting is
   * upstream, like every other number that reaches this screen, so the HUD's
   * clock and this total cannot disagree about what 92.005 seconds looks like.
   */
  private buildKnockaboutResults(
    run: { struck: number; total: number; seconds: number },
  ): ResultsView {
    const best = this.probing ? null : this.knockaboutRecords.best(this.levelPlan.id);
    // The score to compare against is the one standing *before* this run. On a
    // record run the store already holds this run, so the comparison has to come
    // off the run itself rather than off the store.
    const previous = this.lastKnockaboutWasRecord ? null : best;
    const notes: string[] = [];
    if (this.levelId === 'generated') notes.push(`Route seed ${this.seed}`);
    if (this.probing) notes.push('Diagnostic run — personal best not saved');
    else if (!this.knockaboutRecords.persistent) {
      notes.push('This browser is not keeping personal bests');
    }

    return {
      heading: this.lastKnockaboutWasRecord ? 'New record' : 'Route cleared',
      isRecord: this.lastKnockaboutWasRecord,
      total: `${run.struck} of ${run.total}`,
      best: previous === null ? '—' : `${previous.struck} of ${previous.total}`,
      deltaToBest: previous === null || previous.struck === run.struck
        ? ''
        : `${run.struck > previous.struck ? '+' : ''}${run.struck - previous.struck}`,
      ahead: previous !== null && run.struck > previous.struck,
      rows: [
        {
          label: 'Targets struck',
          time: `${run.struck} of ${run.total}`,
          delta: '',
          ahead: false,
        },
        {
          // Shown because a player wants to know, and worth nothing because the
          // owner said so. Naming it "Time taken" rather than "Time" is the
          // difference between a fact and a scoreboard.
          label: 'Time taken',
          time: formatRunTime(run.seconds),
          delta: '',
          ahead: false,
        },
      ],
      notes,
    };
  }


  // ---------------------------------------------------------------------------
  // The chase (M18)
  // ---------------------------------------------------------------------------

  /**
   * Build the chase's world half — M18.
   *
   * Called from the constructor and from `installLevel`, because those are the
   * two places a world arrives and anything built in one and not the other
   * makes the first world of a session behave unlike every world after it.
   */
  private installChaseWorld(plan: LevelPlan): void {
    this.chaseRun.abandon();
    this.copPaddle.cancel();
    this.spine = RouteSpine.fromPlan(plan);
    if (this.spine === null) {
      this.copController = null;
      this.copBrain = null;
      this.copGap = Infinity;
      return;
    }
    this.copController = new EucController(this.terrain, {
      spawn: plan.spawn,
      hazards: new HazardField(plan.hazards ?? []),
      softBodies: new SoftBodyField(plan.softBodies ?? []),
    });
    this.copBrain = new CpuRider(this.spine, plan, this.terrain);
  }

  /**
   * Can this world host a chase? — §13 q26.
   *
   * One expression, and it is a property of the *plan* rather than of the level
   * id: a world can host a chase when its own data states a through line to
   * follow. Generated routes do; the hand-authored city and the proving ground
   * do not, and `RouteSpine.fromPlan` refuses rather than guessing.
   */
  get chaseAvailable(): boolean {
    // **Two conditions, and the second is the owner's rather than the code's.**
    // A spine is what the cop follows, and the hand-authored city produces a
    // perfectly good one — it has six checkpoints and a stitched segment graph
    // like any generated route, so `fromPlan` succeeds there. §13 q26 still says
    // generated routes only, on Knockabout's argument: the mode's pacing, its
    // hazards and its cop were measured on generated routes, and the city is
    // the tuned first impression rather than a place to be chased around.
    return this.spine !== null && this.levelId === 'generated';
  }

  /**
   * The player chose the chase — M18, and `enterKnockabout`'s twin.
   *
   * The entrance is always on the title screen, so this is reached on worlds
   * that cannot host one, and what happens then is Knockabout's answer rather
   * than a shrug: it opens the fresh-route panel with a line saying what the
   * mode needs. Name the fix, do not apologise, never silently swap the world.
   */
  private enterChase(): void {
    if (!this.chaseAvailable || this.copController === null || this.copBrain === null) {
      this.openRoutes('chase');
      this.setRouteStatus({ kind: 'needs-route' });
      return;
    }

    this.lastChase = null;
    this.lastChaseWasRecord = false;
    this.lastKnockabout = null;
    this.resultsIn = 0;
    // Deliberately **not** `resetChallengeRider`: there is no start gate to run
    // up to, and the chase begins where the world begins — which is also what
    // makes "ride it again" mean the same thing every time.
    this.resetRider();
    this.chaseRun.arm();
    this.setRoutePurpose('ride');
    this.goTo('chase');
  }

  /**
   * Put the cop `CHASE.spawnGapMetres` behind the rider, stopped.
   *
   * Behind along the rider's own heading rather than back along the route,
   * because the two agree at a spawn and only the first is defined when this is
   * called from a reset in the middle of one. Resolved against the ground so a
   * spawn on a slope does not bury him or drop him from a height.
   */
  private placeCopBehindRider(): void {
    const cop = this.copController;
    if (cop === null || this.copBrain === null) return;

    const gap = this.tuning.get('CHASE.spawnGapMetres');
    const heading = this.currentPose.headingY;
    const x = this.currentPose.x - Math.sin(heading) * gap;
    const z = this.currentPose.z - Math.cos(heading) * gap;
    const ground = createGroundSample();
    this.terrain.sampleGround(x, z, ground);
    cop.reset({ position: { x, y: ground.height, z }, headingY: heading });

    cop.writePose(this.copCurrent);
    copyPose(this.copCurrent, this.copPrevious);
    copyPose(this.copCurrent, this.copRender);
    // The brain's cursor is a windowed search around its last answer, so a body
    // that has just been put somewhere else has to be found again globally —
    // `Paddle.reseed`'s reasoning, one object along.
    this.writeCopView();
    this.copBrain.place(this.copView);
    this.copPaddle.cancel();
    this.copGap = gap;
  }

  /** Fill the brain's view from the cop's own pose. Allocation-free. */
  private writeCopView(): void {
    const cop = this.copController;
    if (cop === null) return;
    const view = this.copView;
    view.x = this.copCurrent.x;
    view.y = this.copCurrent.y;
    view.z = this.copCurrent.z;
    view.headingY = this.copCurrent.headingY;
    view.speed = this.copCurrent.speed;
    view.grounded = this.copCurrent.y - this.copCurrent.groundY <= 1e-6;
    view.crashed = cop.crashed;
    view.curbAhead = cop.curbHeightAhead;
    view.lateralLimitG = cop.lateralLimit;
  }

  /**
   * Is the cop riding this step?
   *
   * The mode, plus the diagnostic — `paddleEquipped`'s shape exactly, and for
   * the same reason: something has to decide when a second rider is in the
   * world, and one expression is what keeps the step, the renderer and the
   * budget from each having their own opinion.
   */
  private get copRiding(): boolean {
    return this.copController !== null
      && (this.appState.current === 'chase' || this.chaseProbe);
  }

  /**
   * One fixed step of the cop — M18.
   *
   * Stepped here, at the fixed rate, from the pose the player's own step just
   * produced, so `advance(n)` reaches the same chase every run. The order
   * inside is the order the player's own step uses and for the same reasons:
   * think, ride, then swing at the pose that riding produced.
   */
  private stepCop(stepSeconds: number): void {
    const cop = this.copController;
    const brain = this.copBrain;
    if (cop === null || brain === null || !this.copRiding) return;

    copyPose(this.copCurrent, this.copPrevious);
    this.writeCopView();

    // The quarry, and it is null while the rider is down: a cop who kept
    // steering at a crashed rider would ride into them, and the run is either
    // already over or the rider is getting up.
    const chasing = this.appState.current === 'chase' && !this.controller.crashed;
    // The brain's intent is read *once* and used twice — the wheel rides it and
    // the paddle swings on it. Calling `step` a second time to ask about the
    // swing would advance a state machine that is only allowed to advance once
    // per fixed step, which is the shape of bug `advance(n)` cannot reproduce.
    const intent = brain.step(
      stepSeconds,
      this.copView,
      chasing
        ? {
          x: this.currentPose.x,
          y: this.currentPose.y,
          z: this.currentPose.z,
          speed: this.currentPose.speed,
        }
        : null,
    );
    const wantsSwing = intent.swing;
    const swingSide = brain.swingSide;
    cop.step(stepSeconds, intent);
    cop.writePose(this.copCurrent);

    const dx = this.copCurrent.x - this.currentPose.x;
    const dz = this.copCurrent.z - this.currentPose.z;
    this.copGap = Math.sqrt(dx * dx + dz * dz);

    // **The strike.** The rider is a one-entry `HittableSet` and the paddle is
    // M14's same generic weapon — the swept segment, the teleport guard and the
    // sort are the same code that knocks targets down. The cop only supplies
    // which mirrored side to commit when a new swing starts. What a hit *means* is this
    // method's answer, and it is the M14 body knock: one soft-body wobble and a
    // shove through `EucController.softKnock`, the fourth and last sanctioned
    // wobble caller. Nothing here reaches `injectWobble`, and a strike never
    // ends a run on its own (§13 q25).
    this.riderTarget.place(
      this.currentPose.x,
      this.currentPose.y,
      this.currentPose.z,
      this.tuning.get('CHASE.riderHitRadius'),
      chasing,
    );
    const hits = this.copPaddle.step(
      stepSeconds,
      {
        x: this.copCurrent.x,
        y: this.copCurrent.y,
        z: this.copCurrent.z,
        // The clean heading, never `headingY + wobbleYaw` — M13's visual
        // ownership rule, and the same argument `stepPaddle` states at length.
        headingY: this.copCurrent.headingY,
      },
      this.copView.crashed ? false : wantsSwing,
      this.riderTarget,
      swingSide,
    );

    for (const hit of hits) {
      if (hit.id !== 'rider') continue;
      this.audio.hit();
      this.controller.softKnock(this.tuning.get('CHASE.strikeSpeedCost'));
    }
  }

  /**
   * One fixed step of the chase's rules — M18.
   *
   * The referee owns all three endings; this hands it the three facts it needs
   * and spends the results delay, exactly as `stepKnockabout` does.
   */
  private stepChase(stepSeconds: number): void {
    if (this.appState.current !== 'chase') return;

    if (this.resultsIn > 0) {
      this.resultsIn -= stepSeconds;
      if (this.resultsIn <= 0) {
        this.resultsIn = 0;
        this.goTo('results');
      }
      return;
    }

    const spine = this.spine;
    if (spine === null) return;
    spine.locate(this.currentPose.x, this.currentPose.z, -1, this.spineAt);

    const ended = this.chaseRun.step(stepSeconds, {
      offRoute: this.spineAt.offRoute,
      copDistance: this.copGap,
      crashed: this.controller.crashed,
    });
    if (ended) this.finishChase();
  }

  /** The clock ran out, or it did not. Score it, offer it, and show the card. */
  private finishChase(): void {
    const state = this.chaseRun.state;
    this.lastChase = {
      survived: state.survived,
      escaped: state.outcome === 'escaped',
      outcome: state.outcome,
    };
    this.lastChaseWasRecord = false;

    // A probe session rides a world nobody else can ride, so no best is filed
    // from one. The chase probe is deliberately absent from `probing` — it
    // changes no world — but a *hazard* or *target* probe changes this one.
    if (!this.probing) {
      const candidate: ChaseRecord = {
        levelId: this.levelPlan.id,
        seconds: state.survived,
        escaped: state.outcome === 'escaped',
        setAt: new Date().toISOString(),
      };
      this.lastChaseWasRecord = this.chaseRecords.submit(candidate);
    }

    // Read off the frozen table rather than the store, like the timed run's own
    // delay: how long a card waits is not a thing anybody tunes by feel at a
    // gate, and only registered paths may be read through `LiveTuning`.
    this.resultsIn = CHASE.resultsDelaySeconds;
  }

  /**
   * A finished chase, as words — M18.
   *
   * Three outcomes and three headings, because the player already knows which
   * one happened and a card that hedged would be describing something else.
   * The rows are the two facts worth having: how long they lasted, and what the
   * best on this route is. Formatting is upstream, like every number that
   * reaches this screen.
   */
  private buildChaseResults(run: { survived: number; escaped: boolean; outcome: string }): ResultsView {
    const best = this.probing ? null : this.chaseRecords.best(this.levelPlan.id);
    // The score to beat is the one standing *before* this run, so on a record
    // run the comparison comes off the run rather than off the store.
    const previous = this.lastChaseWasRecord ? null : best;
    const notes: string[] = [];
    if (this.levelId === 'generated') notes.push(`Route seed ${this.seed}`);
    if (this.probing) notes.push('Diagnostic run — personal best not saved');
    else if (!this.chaseRecords.persistent) {
      notes.push('This browser is not keeping personal bests');
    }
    if (run.outcome === 'strayed') notes.push('You left the route and the clock ran out on it');

    const heading = run.escaped
      ? (this.lastChaseWasRecord ? 'Escaped — new record' : 'Escaped')
      : run.outcome === 'strayed' ? 'Out of bounds' : 'Busted';

    return {
      heading,
      isRecord: this.lastChaseWasRecord,
      total: formatRunTime(run.survived),
      best: previous === null ? '—' : formatRunTime(previous.seconds),
      deltaToBest: previous === null || Math.abs(previous.seconds - run.survived) < 0.005
        ? ''
        : `${run.survived > previous.seconds ? '+' : ''}${(run.survived - previous.seconds).toFixed(2)}`,
      ahead: previous !== null && run.survived > previous.seconds,
      rows: [
        {
          label: run.escaped ? 'Survived' : 'Lasted',
          time: formatRunTime(run.survived),
          delta: '',
          ahead: false,
        },
        {
          label: 'Best on this route',
          time: previous === null ? '—' : formatRunTime(previous.seconds),
          delta: '',
          ahead: false,
        },
      ],
      notes,
    };
  }

  /**
   * The record that is comparable with the world under the wheel.
   *
   * `?hazardprobe=` deliberately replaces a generated route's placed hazards
   * while retaining its ordinary level id: it is a diagnostic, not another
   * seed. That also means a time or ghost from either version is not evidence
   * about the other one. Keep the records store completely outside a probe
   * run — no reference loaded, no replay shown, and no result written — rather
   * than letting one id silently name two timed courses.
   */
  private recordForCurrentWorld(): RouteRecord | null {
    return this.probing ? null : this.records.best(this.levelPlan.id);
  }

  /**
   * Point the run and the ghost at the stored personal best for this level.
   *
   * Done at the start of every attempt rather than once at boot, because a
   * record set on the previous attempt is the one the next attempt should be
   * racing — the ghost a player wants is the one that just beat them.
   */
  private loadRecordReference(): void {
    const best = this.recordForCurrentWorld();
    this.challenge.setReference(
      best === null ? null : { totalSeconds: best.totalSeconds, splits: best.splits },
    );
    // A ghost that fails to decode costs the replay and nothing else — the
    // time still stands and the deltas still work. `records.ts` already
    // refuses to store an undecodable one, so this is the second line of the
    // same defence rather than the first.
    this.ghostPlayer = new GhostPlayer(best?.ghost ? decodeGhost(best.ghost) : null);
  }

  /**
   * Is the rider carrying a paddle at all? — M14.
   *
   * **The one seam between the weapon and the mode**, and it is deliberately a
   * single expression rather than a check scattered through the step. The
   * paddle is wielder-agnostic by construction, so *something* has to decide
   * who is holding one, and the plan's answer is that the mode decides. Until
   * the Knockabout mode itself lands, the honest reading of "is a paddle in
   * play" is "does this world have anything to swing at" — and when the cop
   * arrives with the chase direction, this is the expression that grows a
   * second clause rather than the step growing a second concept.
   *
   * It also gates the touch button and the drawn paddle, so all three answers
   * come from one place and cannot disagree.
   */
  get paddleEquipped(): boolean {
    // The mode, plus the diagnostic. `?targetprobe=` exists so the owner can
    // ride the phase-2 and phase-1 gates in the same session — "does a target
    // read far enough ahead" and "does throwing the paddle at nothing feel like
    // swinging something" — and both need a paddle in hand outside the mode.
    return this.appState.current === 'knockabout' || this.targetProbe !== undefined;
  }

  /**
   * Is this session riding a world a diagnostic changed?
   *
   * **One expression, and that is the point.** `?hazardprobe=` and
   * `?targetprobe=` both change the course *without changing its id*, so a
   * personal best set on one would be filed against a world nobody else can
   * ride, and a ghost recorded on one would replay through geometry that is not
   * there. Three call sites refuse records on this basis, and before M14 each
   * of them named the hazard probe directly — which meant adding a second probe
   * silently reopened the loophole in all three at once. Anything similar
   * joins this getter rather than the call sites.
   */
  private get probing(): boolean {
    return this.hazardProbe !== undefined || this.targetProbe !== undefined;
  }

  /** Can a swing start on this step? Legality, exactly as `canAcceptHop` is. */
  private get canAcceptSwing(): boolean {
    return this.paddleEquipped && !this.paddle.swinging && !this.controller.crashed;
  }

  /**
   * One fixed step of the swing — M14.
   *
   * Fed the pose this step just produced, at the fixed rate, so a hit is
   * reproducible under `advance(n)`.
   *
   * **`pose.headingY`, never `headingY + wobbleYaw`.** The clean heading lives
   * on the rider root and the wobble yaw on the machine child, deliberately and
   * by M13's visual-ownership rule. Swinging on the wobbled heading would make
   * the hit test disagree with the drawn paddle exactly while the player is
   * wobbling — the worst moment for the two to part company, and the one a
   * chase-camera screenshot is least able to show.
   */
  private stepPaddle(stepSeconds: number, swingRequested: boolean): void {
    if (!this.paddleEquipped) return;

    // A crashed rider keeps hold of the paddle — the owner's call, and it
    // matches the wheel's own spin-out flourish — but they are not swinging it.
    // The ragdoll carries the mesh because the renderer attaches it to a hand
    // group, which needs nothing from here.
    if (this.controller.crashed) {
      if (this.paddle.swinging) this.paddle.cancel();
      return;
    }

    const pose = this.currentPose;
    const hits = this.paddle.step(
      stepSeconds,
      { x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY },
      swingRequested,
      this.targets,
    );

    // The whoosh goes with the press that was actually granted, not with the
    // press the player made: a request refused because a swing was already
    // running is buffered rather than consumed, and a whoosh on it would be a
    // sound with no motion under it.
    if (swingRequested) this.audio.swing();

    // The knock-downs, on the simulation clock beside the gate flares, so
    // `advance(n)` reaches the same frame of the same fall every run.
    this.renderer.stepTargets(stepSeconds);

    for (const hit of hits) {
      // `strike` is the authority on whether this scored: it returns false for
      // a target already down, so a second swing at a fallen one costs nothing
      // and scores nothing (§13 q21) without this loop having to remember.
      if (!this.targets.strike(hit.id)) continue;
      this.renderer.strikeTarget(hit.id);
      this.audio.hit();
      // Presentation, through the suspension the pedal strike already kicks.
      // Nothing here reaches `injectWobble`, under the owner's standing rule.
      this.controller.jolt(this.tuning.get('PADDLE.hitJolt'));
      this.controller.shedSpeed(this.tuning.get('PADDLE.hitSpeedCost'));
    }

    // **The body knock — the second way a target goes down.** The owner's
    // 2026-08-12 ride found paddle-only scoring more exacting than the mode is
    // about, and chose contact over a wider swing: riding into a target counts
    // as a knockout, and it costs the rider a bush — `softKnock` is one
    // soft-body wobble plus a speed cost, never a crash. Same downstream as a
    // paddle hit, so the HUD, the fall, the flare, the sound and the finish
    // check cannot tell the two ways apart. Gated on `paddleEquipped` with the
    // rest of this method: in free ride and the timed run the targets stay
    // level furniture the wheel passes straight through.
    const knockRadius = this.tuning.get('TARGET.bodyKnockRadius');
    if (knockRadius <= 0) return;
    this.targets.eachNear(
      pose.x - knockRadius,
      pose.y,
      pose.z - knockRadius,
      pose.x + knockRadius,
      pose.y + TARGET.bodyKnockHeight,
      pose.z + knockRadius,
      (volume) => {
        // `eachNear` is the grid broadphase: it returns every target whose
        // bounding box overlaps this box. The corner of that box is outside
        // the two circular bodies, so it is not contact. Keep the broadphase
        // cheap and make the mode owner decide the exact plan-distance test.
        const dx = volume.x - pose.x;
        const dz = volume.z - pose.z;
        const reach = knockRadius + volume.radius;
        if (dx * dx + dz * dz > reach * reach) return;
        if (!this.targets.strike(volume.id)) return;
        this.renderer.strikeTarget(volume.id);
        this.audio.hit();
        this.controller.softKnock(this.tuning.get('TARGET.bodyKnockSpeedCost'));
      },
    );
  }

  /**
   * One fixed step of the timed run.
   *
   * **The results delay is ticked outside the `challenge` guard**, because it
   * has to keep running after the run has ended and the state is on its way to
   * `results`. Driven by simulation seconds like everything else in this file,
   * so `advance(n)` reaches the results screen on the same step every run.
   */
  private stepChallenge(stepSeconds: number): void {
    // **The countdown runs only in `challenge`, and the guard is load-bearing.**
    //
    // It was written outside this check so it would survive the run ending —
    // which it does not need to, because `challenge` is the state the run ends
    // *in*. What that version actually did was keep counting behind the
    // settings screen, which also simulates: the timer expired while the panel
    // was up, `goTo('results')` was refused because `settings` does not list
    // `results` as a successor, and `resultsIn` had already been zeroed. The
    // player came back to a finished run with no results screen, no way to
    // reach one, and their splits gone. A pause is safe by accident (a paused
    // game runs no steps at all); settings was not.
    if (this.appState.current !== 'challenge') return;

    if (this.resultsIn > 0) {
      this.resultsIn -= stepSeconds;
      if (this.resultsIn <= 0) {
        this.resultsIn = 0;
        this.goTo('results');
        return;
      }
    }

    const pose = this.currentPose;
    const events = this.challenge.step(stepSeconds, {
      // The contact patch, which is what the rig is positioned at and what the
      // gate volumes stand on. A centre-of-mass point would sit a metre up and
      // still be inside a gate, so this would not have failed loudly.
      x: pose.x,
      y: pose.y,
      z: pose.z,
      speed: pose.speed,
      landed: this.controller.touchedDown,
      // The controller's own verdict, not a threshold applied out here. See
      // `EucController.lastLandingQuality`.
      landingClean: this.controller.lastLandingQuality === 'clean',
      crashed: this.controller.crashed,
    });

    const state = this.challenge.state;
    // **A finished run has passed everything, not nothing.** `nextIndex` is
    // `-1` once there is no gate left to seek, and handing that straight to the
    // renderer repainted every gate on the course back to the "still ahead"
    // colour on the exact frame the player crossed the line — so the 1.4 s they
    // spend watching their own finish, and then the whole results screen behind
    // it, showed a course they had apparently not ridden.
    this.renderer.setCheckpointProgress(
      state.phase === 'finished' ? state.total : state.nextIndex,
    );
    this.renderer.stepCheckpoints(stepSeconds);

    if (state.phase === 'running' && !this.probing) {
      this.ghostRecorder.record(state.elapsed, {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        groundY: pose.groundY,
        headingY: pose.headingY,
        rollAngle: pose.rollAngle,
        speed: pose.speed,
        crouch: pose.crouch,
      });
    }

    for (const event of events) this.handleChallengeEvent(event);
  }

  /** A gate was crossed. Flare it, show the split, and finish if it was the last. */
  private handleChallengeEvent(event: ChallengeEvent): void {
    this.renderer.flareCheckpoint(event.routeIndex);

    if (event.kind === 'split') {
      this.pendingSplit = { label: event.label, delta: event.totalDelta };
    } else if (event.kind === 'finish') {
      // **No split for the finish.** The delta it would show is the same
      // number the results screen is about to present in much larger type, and
      // a 2.6 s HUD cue that the dialog interrupts after 1.4 s is a cue that
      // exists only to be cut off.
      this.pendingSplit = null;
      this.finishRun();
    }
  }

  /**
   * The finish gate has been crossed. Save what deserves saving and queue the
   * results screen.
   *
   * The ordering here is the whole method: the record is submitted *before* the
   * results view is built, so the heading the player reads is a report of what
   * the store actually did rather than a second, independent prediction of it.
   * Those two disagreed once already during this milestone, at a margin of
   * exactly one hundredth of a second, and the symptom was the worst kind —
   * "New record" over a time that was silently never saved.
   */
  private finishRun(): void {
    const result = this.challenge.result();
    if (result === null) return;

    this.lastResult = result;

    // Read before `submit` replaces it. See `lastResultPreviousSplits`.
    const previous = this.recordForCurrentWorld();
    this.lastResultPreviousSplits = previous !== null
      && previous.splits.length === result.splits.length
      ? previous.splits
      : [];

    // The probe changes the timed course without changing its level id. Saving
    // this result would let its ghost replay against the ordinary route (or
    // vice versa), the same identity failure the generated-r2 content revision
    // exists to prevent. The result screen still reports the run, but the
    // records store and ghost codec never see it.
    if (this.probing) {
      this.lastResultWasRecord = false;
      this.lastResultGhostDropped = false;
      this.ghostRecorder.reset();
      this.resultsIn = CHALLENGE.resultsDelaySeconds;
      return;
    }

    const track = this.ghostRecorder.finish(this.levelPlan.id, result.totalSeconds);
    const candidate: RouteRecord = {
      levelId: this.levelPlan.id,
      totalSeconds: result.totalSeconds,
      splits: result.splits,
      // Wall time, and the only wall time in the whole feature. It is a label
      // on a saved record and reaches no clock the simulation reads, which is
      // why `records.ts` refuses to produce it and takes it from here instead.
      setAt: new Date().toISOString(),
      ghost: track === null ? null : encodeGhost(track),
    };

    this.lastResultWasRecord = this.records.submit(candidate);
    // A record that was kept but whose ghost was shed to fit the storage quota.
    // Worth one quiet line on the results screen and nothing more: the player
    // still has their time, and a warning they cannot act on would be noise.
    const stored = this.recordForCurrentWorld();
    this.lastResultGhostDropped = this.lastResultWasRecord
      && candidate.ghost !== null
      && (stored === null || stored.ghost === null);

    this.resultsIn = CHALLENGE.resultsDelaySeconds;
  }

  /**
   * Turn a finished run into the words on the results panel.
   *
   * Every number here goes through `hudModel.ts`'s formatters, which is what
   * stops the clock in the corner of the frame and the total on this panel
   * disagreeing about what the same instant looked like.
   *
   * **The heading comes from `lastResultWasRecord` — what the store did — and
   * not from `result.beatRecord`.** The two are computed by different layers
   * that may not import each other, and they disagreed once already during
   * this milestone. Reporting the store's answer means a future drift produces
   * a wrong field on a snapshot rather than a celebration over a time the
   * player will not find next session.
   */
  private buildResultsView(): ResultsView {
    // Knockabout first, because a Knockabout run leaves `lastResult` untouched
    // and would otherwise be shown the previous timed run's numbers — the exact
    // "one frame of the last run" failure the panel is filled before it is
    // shown to avoid, arriving through a different door.
    if (this.lastKnockabout !== null) return this.buildKnockaboutResults(this.lastKnockabout);
    // And the chase after it, on the same argument again: a chase leaves both
    // of the other two untouched. The three are mutually exclusive because a
    // ride is one mode, and each entrance clears the other two's last result.
    if (this.lastChase !== null) return this.buildChaseResults(this.lastChase);

    const result = this.lastResult;
    if (result === null) {
      return {
        heading: 'Run complete',
        isRecord: false,
        total: formatRunTime(0),
        best: '—',
        deltaToBest: '',
        ahead: false,
        rows: [],
        notes: [],
      };
    }

    const isRecord = this.lastResultWasRecord;
    // The time to compare against is the one that was standing *before* this
    // run, not the one now in the store — which, on a record run, is this run.
    const previous = result.previousBest;
    const previousSplits = this.lastResultPreviousSplits;

    const rows: ResultsRow[] = [];
    // Index 0 is the start gate, whose split is zero by construction. A row
    // reading `0:00.00` is a row that teaches the player nothing.
    for (let index = 1; index < result.splits.length; index += 1) {
      // No previous table, or one that did not line up, means no per-leg
      // comparison at all — never a comparison against zero, which would print
      // the whole elapsed time as a loss on every row.
      const delta = index < previousSplits.length
        ? result.splits[index] - previousSplits[index]
        : null;
      rows.push({
        label: result.labels[index] ?? `Checkpoint ${index}`,
        time: formatRunTime(result.splits[index]),
        delta: delta === null ? '' : formatDelta(delta),
        // Rounded to the hundredth that is actually printed, matching
        // `hudModel.ts`'s rule: a delta that displays as `0.00` must not be
        // coloured as though the player gained something invisible.
        ahead: delta === null || Math.round(delta * 100) < 0,
      });
    }

    // **Shown, and scored at zero** (`docs/PLANS.md` §10, M10 decision 1). The
    // information is here for a player who wants it; the run is ranked on time
    // alone, so nothing below can make a slower lap beat a faster one.
    const unit = this.options.current.speedUnit;
    const notes: string[] = [
      `Top speed ${formatSpeed(result.topSpeed, unit)} ${unit === 'mph' ? 'mph' : 'km/h'}`,
    ];
    if (result.landings > 0) {
      notes.push(`Clean landings ${result.cleanLandings} of ${result.landings}`);
    }
    if (result.crashes > 0) {
      notes.push(result.crashes === 1 ? 'One crash' : `${result.crashes} crashes`);
    }
    // **Which route this time is a time on** (M12 Phase 4). A personal best is
    // filed against the seed and is only comparable against the same ground, so
    // a results screen that did not name the route would be showing a number
    // the player cannot place a week later — and cannot send to anybody who
    // wants to beat it.
    if (this.levelId === 'generated') notes.push(`Route seed ${this.seed}`);
    if (this.probing) {
      notes.push('Diagnostic run — personal best and replay not saved');
    } else {
      // One quiet line, once, and never a recurring warning. The player has
      // their time; the replay is what did not fit.
      if (this.lastResultGhostDropped) notes.push('Replay not saved — storage full');
      if (!this.records.persistent) {
        notes.push('This browser will not save times after you close the tab');
      }
    }

    return {
      heading: isRecord ? 'New record' : 'Run complete',
      isRecord,
      total: formatRunTime(result.totalSeconds),
      best: previous === null ? '—' : formatRunTime(previous),
      deltaToBest: previous === null ? '' : formatDelta(result.totalSeconds - previous),
      // Same rounded rule as the rows and as the HUD lane. Three definitions of
      // "ahead" in one milestone is how the record predicate went wrong twice.
      ahead: previous === null || Math.round((result.totalSeconds - previous) * 100) < 0,
      rows,
      notes,
    };
  }

  // ---------------------------------------------------------------------------
  // Fresh routes — the seed becomes interface (M12 Phase 4)
  // ---------------------------------------------------------------------------

  /**
   * Open the fresh-route panel, with the field already saying something true.
   *
   * Three arrivals, three different right answers. Riding a generated route
   * already: the field holds its seed, so "share this" and "ride it again" are
   * both one glance away. Arriving after a link whose seed did not build: the
   * field holds the seed that failed and the line still says why, because the
   * player's next move is almost certainly to edit one character of it. Coming
   * from the slice with nothing to say: an empty field and no message, rather
   * than a stale one from a previous visit.
   */
  private openRoutes(purpose: RoutePurpose = 'ride'): void {
    this.setRoutePurpose(purpose);
    if (this.appState.current !== 'routes' && !this.goTo('routes')) return;

    if (this.levelId === 'generated') {
      this.menus.setSeed(this.seed);
      this.setRouteStatus({ kind: 'ready', seed: this.seed });
    } else if (this.routeStatus.kind === 'no-route') {
      this.menus.setSeed(this.routeStatus.seed);
      this.setRouteStatus(this.routeStatus);
    } else {
      this.menus.setSeed('');
      this.setRouteStatus({ kind: 'idle' });
    }
  }

  /** Leave the route chooser without allowing deferred work to follow us. */
  private closeRoutes(): void {
    if (this.pendingRoute !== null) {
      this.pendingRoute = null;
      this.pendingRouteFrames = 0;
      // Cancelling a proposed replacement restores the truth about the world
      // already behind the panel. A generated world is still ready to ride;
      // the city has no seed to report.
      if (this.levelId === 'generated') {
        this.menus.setSeed(this.seed);
        this.setRouteStatus({ kind: 'ready', seed: this.seed });
      } else {
        this.setRouteStatus({ kind: 'idle' });
      }
    }
    this.setRoutePurpose('ride');
    this.goTo('title');
  }

  /**
   * The player asked for a seed's route.
   *
   * **A seed that is already loaded is not rebuilt**, and that is a
   * correctness statement rather than an optimisation: the same seed is the
   * same world by construction (`generateRoute.ts` — a seed produces a
   * deep-equal plan on every run), so rebuilding it would spend a second
   * proving something the generator guarantees. It also means the second ride
   * of a route, which is the one the exit question is about, starts instantly.
   */
  private requestFreshRoute(typed: string, timed: boolean): void {
    if (this.pendingRoute !== null) return;

    // An explicit Time trial click changes the destination. The generic Ride
    // button (and Enter/gamepad confirm on the field) preserve Knockabout or
    // Police Chase when that is what sent the player through this prerequisite
    // screen. Losing either purpose here makes the first attempt silently
    // become Free Ride while a second title-screen attempt appears to work.
    const destination: RouteDestination = timed
      ? 'challenge'
      : this.routePurpose === 'knockabout'
        ? 'knockabout'
        : this.routePurpose === 'chase' ? 'chase' : 'freeRide';

    const seed = normaliseSeed(typed);
    if (seed.length === 0) {
      this.setRouteStatus({ kind: 'blank' });
      return;
    }

    if (this.levelId === 'generated' && seed === this.seed) {
      this.menus.setSeed(seed);
      this.rideLoadedWorld(destination);
      return;
    }

    this.menus.setSeed(seed);
    this.beginRouteWork({ kind: 'seed', seed, destination }, { kind: 'building', seed });
  }

  /**
   * Hand the player a route without making them think of a word.
   *
   * **This is the affordance the owner's q6 answer explicitly allows to skip a
   * failing seed** — *"choosing a different seed is not the repair master §6.4
   * forbids"* — and it is also the only way a gamepad reaches a route at all,
   * because a pad cannot type. Both of those make it worth having; neither
   * would justify letting it substitute a world for a seed the player named.
   */
  private surpriseSeed(): void {
    if (this.pendingRoute !== null) return;
    const destination: RouteArrival = this.routePurpose === 'knockabout'
      ? 'knockabout'
      : this.routePurpose === 'chase' ? 'chase' : 'choose';
    this.beginRouteWork(
      { kind: 'surprise', destination },
      { kind: 'building', seed: 'a fresh route' },
    );
  }

  /** Put the shipped slice back and return to the title, which is its home. */
  private rideTheCity(): void {
    if (this.pendingRoute !== null) return;
    if (this.levelId !== 'slice') {
      this.installLevel(
      'slice',
      '',
      createLevel('slice', DEFAULT_SEED, this.hazardProbe, this.targetProbe),
    );
    }
    this.setRouteStatus({ kind: 'idle' });
    this.setRoutePurpose('ride');
    this.goTo('title');
  }

  /**
   * Copy the address that reproduces this world.
   *
   * The URL rather than the bare seed, because a link is what actually travels:
   * a friend taps it and is riding, with no explanation of what a seed is or
   * where to type it. The seed is still in the URL and still on screen for
   * anyone who wants to read it out instead.
   *
   * The clipboard API is permission-gated and absent on insecure origins, so
   * the failure is handled by *showing the link* rather than by apologising —
   * on a phone in standalone mode there is no address bar to fall back to,
   * which is precisely the case this button exists for.
   */
  private copyWorldLink(): void {
    const link = this.worldLink();
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      this.setRouteStatus({ kind: 'copy-failed', link });
      return;
    }
    clipboard.writeText(link).then(
      () => this.setRouteStatus({ kind: 'copied' }),
      () => this.setRouteStatus({ kind: 'copy-failed', link }),
    );
  }

  /** Arm the deferred build. See `pendingRoute` for why it is deferred. */
  private beginRouteWork(
    work: { readonly kind: 'seed'; readonly seed: string; readonly destination: RouteDestination }
      | { readonly kind: 'surprise'; readonly destination: RouteArrival },
    status: RouteStatus,
  ): void {
    this.pendingRoute = work;
    // One frame. A `requestAnimationFrame` callback runs before its own
    // frame's paint, so resolving on the next one would still block before the
    // message reached the screen.
    this.pendingRouteFrames = 1;
    this.setRouteStatus(status);
  }

  /**
   * Build the route the player asked for, on the frame after they asked.
   *
   * The refusal path is the one that matters and it does exactly nothing to the
   * world: no level is installed, no state changes, the panel stays where it
   * is, and the line says which seed failed. `level/levels.ts:requestRoute`
   * throws the generator's slice fallback away before it can get this far.
   */
  private resolveFreshRoute(): void {
    const work = this.pendingRoute;
    this.pendingRoute = null;
    if (work === null) return;

    if (work.kind === 'surprise') {
      // Four tries covers a one-in-360 failure rate to about one chance in
      // sixteen billion, and the loop is bounded rather than "until it works"
      // because an unbounded retry is how a rejection budget becomes a hang.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const seed = routeSeedFrom(Math.floor(Math.random() * ROUTE_SEED_SPACE));
        if (seed === this.seed) continue;
        const outcome = requestRoute(seed, this.hazardProbe, this.targetProbe);
        if (!outcome.ok) continue;
        // Surprise me is allowed to choose another seed, and Knockabout asked
        // specifically for things to hit. A legal target-free generated world
        // remains legal everywhere else; it is merely not this request's answer.
        if (work.destination === 'knockabout' && (outcome.plan.targets?.length ?? 0) === 0) {
          continue;
        }
        this.installLevel('generated', outcome.seed, outcome.plan);
        this.menus.setSeed(outcome.seed);
        if (work.destination === 'choose') {
          this.setRouteStatus({ kind: 'ready', seed: outcome.seed });
        } else {
          this.rideLoadedWorld(work.destination);
        }
        return;
      }
      this.setRouteStatus(
        work.destination === 'knockabout' ? { kind: 'needs-targets' } : { kind: 'blank' },
      );
      return;
    }

    const outcome = requestRoute(work.seed, this.hazardProbe, this.targetProbe);
    if (!outcome.ok) {
      this.setRouteStatus({ kind: 'no-route', seed: work.seed });
      return;
    }

    this.installLevel('generated', outcome.seed, outcome.plan);
    this.setRouteStatus({ kind: 'ready', seed: outcome.seed });
    this.rideLoadedWorld(work.destination);
  }

  /** Start the mode the player chose before (or on) the route panel. */
  private rideLoadedWorld(destination: RouteDestination): void {
    if (destination === 'challenge') this.startChallenge();
    else if (destination === 'knockabout') this.enterKnockabout();
    else if (destination === 'chase') this.enterChase();
    else this.goTo('freeRide');
  }

  /**
   * Install a world. **The only path that swaps one.**
   *
   * Five things are built from a `LevelPlan` and all five are rebuilt here, in
   * the order the dependencies run: the renderer's meshes (which disposes what
   * it replaces), the terrain sampler, the controller that reads it, and the
   * referee that reads the plan's checkpoints. The camera's occlusion probe
   * needs no rebuild because it reads `this.terrain` at call time rather than
   * holding it.
   *
   * `applyTuning()` is not an afterthought: a fresh `EucController` starts on
   * the module's own defaults, and the live tuning values — including whatever
   * the developer panel has overridden — live in `LiveTuning`, not in the
   * controller. Skipping it would make a world swap silently reset the ride.
   *
   * A generated plan's id is `generated-r3-<seed>`, personal bests are filed
   * under `levelPlan.id`, and a stored ghost refuses to load against a
   * different id (`app/records.ts:coerceGhost`). `recordForCurrentWorld` closes
   * the diagnostic exception: `?hazardprobe=` changes the course without
   * changing that id, so a probe session neither loads nor saves a record.
   */
  private installLevel(levelId: LevelId, seed: string, plan: LevelPlan): void {
    // A timed run belongs to the world that is leaving. Ending it here rather
    // than letting `enterState` notice keeps the abandonment attached to the
    // cause, and means the ghost recorder is never carrying samples taken on
    // ground that no longer exists.
    if (this.challenge.state.phase !== 'idle') this.challenge.abandon();
    this.ghostRecorder.reset();
    this.ghostPlayer = new GhostPlayer(null);
    this.renderer.setGhostVisible(false);
    this.resultsIn = 0;
    this.pendingSplit = null;
    this.lastResult = null;
    this.lastResultPreviousSplits = [];

    this.levelId = levelId;
    this.seed = seed;
    this.levelPlan = plan;
    this.terrainView = this.renderer.setLevel(plan);
    this.terrain = new PlanTerrainSampler(plan);
    this.controller = new EucController(this.terrain, {
      spawn: plan.spawn,
      // Rebuilt with the world, like the sampler and the referee above it, and
      // for the same reason: a hazard field outliving its plan would put the
      // last route's potholes in this one's road — or its bushes in this
      // one's plaza.
      hazards: new HazardField(plan.hazards ?? []),
      softBodies: new SoftBodyField(plan.softBodies ?? []),
    });
    this.challenge = new ChallengeRun(plan.id, plan.checkpoints);
    this.targets = new TargetField(plan.targets ?? []);

    // **The chase's world half, rebuilt with everything else and for the same
    // reason** — a spine or a cop outliving its plan would follow the last
    // route's road through this one's buildings. `fromPlan` returns null on a
    // world that states no through line, and that null is what the mode's
    // entrance refuses on (§13 q26); building the cop only when it does not is
    // what keeps the hand-authored city's title screen free of a rig and a
    // controller nobody is going to use.
    this.installChaseWorld(plan);
    // The paddle survives the swap because it holds no world, but a swing in
    // progress does not: the rider it belonged to is standing somewhere else
    // now, and `cancel` also throws away the previous head position so the
    // first sweep in the new world cannot be a spear across it.
    this.paddle.cancel();

    this.applyTuning();
    this.menus.setChallengeAvailable(this.challenge.available);
    this.renderer.setCheckpointProgress(this.challenge.state.nextIndex);
    // Puts the rider at the new spawn and clears every trace of the old world
    // the rider could still be carrying — smeared interpolation, sparks in the
    // air, a tyre still roaring over a surface that is gone.
    this.resetRider();
    this.publishWorld();
    this.syncWorldUrl();
  }

  /**
   * Swap the rider — M14.5, and the sibling of `installLevel` above.
   *
   * **A sibling, not a case of it.** A character is orthogonal to a world: the
   * plan, the sampler, the controller, the referee, the records and the level
   * id are all untouched, and none of them may learn that a rider changed. What
   * this replaces is exactly two objects — the player's rig and the ghost's —
   * because the two riders are different geometry rather than a recolour, and a
   * rig that kept both and toggled visibility would charge the frame for a
   * character nobody is riding.
   *
   * The order is the one `Renderer.setLevel` established and it is load-bearing
   * at both ends. **Remove before dispose**, or the scene keeps a node whose
   * geometry has been freed and `resources().sceneObjects` climbs by a whole
   * rig every swap. **`syncPoses` after add**, or the next frame draws the new
   * rig at the origin while the chase camera eases across the map after it —
   * the same smear `Game.syncPoses` exists to prevent after a teleport.
   *
   * The status light is re-stated for the same reason `installLevel` replays
   * `applyTuning`: a fresh rig starts on its own defaults, and the wheel would
   * otherwise go dark mid-warning.
   */
  private installCharacter(id: CharacterId): void {
    this.installedCharacter = id;
    this.renderer.scene.remove(this.rig.group);
    this.rig.dispose();
    this.rig = createRidingRig(riderLook(id), machineLook(machineForCharacter(id)));
    this.renderer.scene.add(this.rig.group);
    this.renderer.setCharacter(id);
    this.syncPoses();
    this.rig.applyStatus(this.currentPose.alert, this.simTimeSeconds, 1 - this.currentPose.recoverBlend);
  }

  /** Tell the menus which world is loaded. */
  private publishWorld(): void {
    this.menus.setWorld({ generated: this.levelId === 'generated', seed: this.seed });
  }

  /**
   * Keep the address bar honest about which world is on screen.
   *
   * **This is what makes a route shareable**, and it is why the query parameter
   * `levels.ts` calls a diagnostic is now also the product: the player never
   * has to be taught what a seed is or where to put it, because the thing they
   * already know how to send — a link — carries it.
   *
   * `replaceState` rather than `pushState`, because choosing a world is not a
   * navigation and Back should leave the game rather than walk a player
   * backwards through every route they tried. Every other parameter is
   * preserved: `?debug=1` and `?panel=1` are how the capture tools drive the
   * game, and silently dropping them would break a screenshot run in a way
   * nothing would report.
   */
  private syncWorldUrl(): void {
    if (typeof window === 'undefined' || !window.history) return;
    window.history.replaceState(null, '', this.worldLink());
  }

  /** The address that reproduces the loaded world. */
  private worldLink(): string {
    const url = new URL(window.location.href);
    if (this.levelId === 'slice') {
      url.searchParams.delete('level');
      url.searchParams.delete('seed');
    } else if (this.levelId === 'generated') {
      url.searchParams.set('level', 'generated');
      url.searchParams.set('seed', this.seed);
    } else {
      url.searchParams.set('level', this.levelId);
      url.searchParams.delete('seed');
    }
    return url.toString();
  }

  /** One writer for the fresh-route line, so the bridge cannot disagree with it. */
  private setRouteStatus(status: RouteStatus): void {
    this.routeStatus = status;
    this.menus.setRouteStatus(status);
  }

  /** One writer for the route chooser's purpose, like its tagged status. */
  private setRoutePurpose(purpose: RoutePurpose): void {
    this.routePurpose = purpose;
    this.menus.setRoutePurpose(purpose);
  }

  // ---------------------------------------------------------------------------
  // Audio, on the QA bridge (M8)
  // ---------------------------------------------------------------------------

  /**
   * Build the audio graph now.
   *
   * **Only legitimate from a real user gesture.** A Playwright key press is a
   * trusted event, so a spec calls this immediately after one rather than
   * hoping the engine's own gesture listener fired first — the difference
   * being that the spec then knows exactly which frame the context came alive
   * on, which is what makes a resource count before and after it meaningful.
   */
  armAudio(): void {
    this.audio.arm();
  }

  /**
   * Player volumes, 0..1.
   *
   * **Routed through the options store from M9**, rather than straight into
   * the audio engine as at M8. There is exactly one place a volume lives now,
   * and anything that wrote past it would be silently undone the next time any
   * option changed — which is a bug that would only ever appear as "mute
   * sometimes stops working", minutes later, with nothing to connect it to.
   */
  setVolumes(volumes: Partial<BusVolumes>): void {
    this.options.set({
      ...(volumes.master === undefined ? {} : { volumeMaster: volumes.master }),
      ...(volumes.sfx === undefined ? {} : { volumeSfx: volumes.sfx }),
      ...(volumes.ui === undefined ? {} : { volumeUi: volumes.ui }),
      ...(volumes.music === undefined ? {} : { volumeMusic: volumes.music }),
    });
  }

  setMuted(muted: boolean): void {
    this.options.set({ muted });
  }

  /** The audio model and context state alone, without assembling a snapshot. */
  audioSnapshot(): AudioSnapshot {
    return this.audio.snapshot();
  }

  /**
   * RMS of what is actually leaving the master bus.
   *
   * The one measurement that separates "the model is right" from "the game is
   * making a sound". It reads the audio clock, so a caller has to let real
   * milliseconds pass after changing the mix — unlike everything else on this
   * bridge, which is driven by `advance`.
   */
  audioLevel(): number {
    return this.audio.outputLevel();
  }

  /**
   * The output's spectrum, as plain arrays a page evaluation can carry back.
   *
   * **This is how the owner's "no annoying sounds" rule is enforced rather than
   * merely asserted.** Every other audio measurement on this bridge reads the
   * model; this one reads what the speakers are given, which is the only place
   * a fatiguing shape can be seen. The M8 rework was driven by a spectrum of
   * the running game, and `tests/m8.spec.ts` keeps taking one.
   */
  audioSpectrum(): { binHz: number; db: number[] } | null {
    const spectrum = this.audio.outputSpectrum();
    if (!spectrum) return null;
    return { binHz: spectrum.binHz, db: Array.from(spectrum.db) };
  }

  /**
   * GPU object counts, for leak audits.
   *
   * These must plateau across repeated restarts. There is nothing to restart
   * yet, so at M1 the claim this supports is narrower: opening and closing the
   * diagnostics, resizing, and advancing must not grow them.
   */
  resources(): ResourceCounts {
    const memory = this.renderer.renderer.info.memory;
    const programs = this.renderer.renderer.info.programs?.length ?? 0;
    let sceneObjects = 0;
    let lights = 0;
    this.renderer.scene.traverse((object) => {
      sceneObjects += 1;
      if ((object as { isLight?: boolean }).isLight === true) lights += 1;
    });
    return {
      geometries: memory.geometries,
      textures: memory.textures,
      programs,
      sceneObjects,
      lights,
    };
  }

  /** Open a fresh measurement window. */
  profileBegin(): void {
    this.profiler.begin();
  }

  /** Read the window. Percentiles of our own code only — never a frame rate. */
  profile(): ProfileReport {
    return this.profiler.report();
  }

  setOverlayVisible(visible: boolean): void {
    this.overlay.setVisible(visible);
  }

  setTuningPanelVisible(visible: boolean): void {
    this.panel.setVisible(visible);
  }

  dispose(): void {
    this.loop.dispose();
    this.keyboard.dispose();
    this.gamepad.dispose();
    this.touch.dispose();
    this.touchControls.dispose();
    this.coarsePointer?.removeEventListener('change', this.onPointerKindChange);
    this.reducedMotion?.removeEventListener('change', this.onReducedMotionChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.audio.dispose();
    this.stopTuningListener();
    this.stopOptionsListener();
    this.stopStateListener();
    this.overlay.dispose();
    this.panel.dispose();
    this.hud.dispose();
    this.menus.dispose();
    this.appState.dispose();
    this.options.dispose();
    this.records.dispose();
    this.contextNotice.dispose();
    this.tuning.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------------
  // Loop callbacks
  // ---------------------------------------------------------------------------

  private readonly beforeFrame = (nowMs: number): void => {
    // Wall-clock frame length, for the one thing that has to keep moving while
    // nothing is being simulated: the audio fade to silence. Clamped with the
    // same `max(0, …)` the loop clamps its own boundary with, and ceilinged so
    // that returning from a five-minute tab switch is one frame of fade rather
    // than a jump.
    this.frameSeconds = this.lastFrameMs < 0
      ? 0
      : Math.min(0.25, Math.max(0, nowMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = nowMs;

    // The pad is polled here rather than in `step`, and it has to be: a paused
    // or title-screen loop runs no steps at all, and a pad that only reported
    // while simulating could not press Start to unpause. It is also the wrong
    // clock for a device — the Gamepad API describes the present moment, not
    // a fixed step.
    this.gamepad.poll(this.simTimeSeconds);

    // A route the player asked for on the previous frame (M12 Phase 4). Here
    // rather than in `step`, because it must run whether or not the loop is
    // simulating and exactly once per real frame — and because building a
    // world inside the fixed step would charge a second of generation to the
    // simulation clock and be replayed as dropped steps.
    if (this.pendingRoute !== null) {
      if (this.pendingRouteFrames > 0) this.pendingRouteFrames -= 1;
      else this.resolveFreshRoute();
    }

    // Cheap and idempotent; see GameRenderer.resize. Polling here is what makes
    // the first sizing self-healing when boot lands before layout, and it
    // covers container and pixel-ratio changes without a listener for each.
    const change = this.renderer.resize();
    if (!change.layoutChanged) return;

    this.layoutChanges += 1;
    // The full input reset contract (master starter 8.2): a layout or
    // orientation change clears keyboard-held, gamepad, and analog state as
    // well as buffered one-shots, then re-anchors the clock. An earlier pass
    // kept held keys here on the theory that a desktop resize loses no keyup;
    // the M10 QA pass showed the other side of that trade — a throttle held
    // through an orientation change kept accelerating a rider the player could
    // no longer see framed correctly. A key still physically down re-expresses
    // itself on its next repeat, so the transient clear costs nothing real.
    // Scripted QA-bridge values survive; they are not a device.
    this.actionState.clearDevices();
    // **The touchscreen needs more than its action state cleared**, and this is
    // the case that motivated the whole rule: a rotation moves every control
    // out from under the hand using it, the `pointerup` that would have
    // released them may never arrive, the origin a ride-stick drag was measured
    // from now describes a screen that no longer exists, and the stick is still
    // drawn at a coordinate that may now be off the bottom of the window.
    // `TouchControls.reset` is the pair — the fingers and everything drawn
    // because of them.
    this.touchControls.reset();
    this.loop.resetTime();
  };

  private readonly step = (stepSeconds: number): void => {
    this.tick += 1;
    this.simTimeSeconds += stepSeconds;
    // The audio model is advanced once per render frame, by however much
    // simulation happened since the last one. See `audioStepSeconds`.
    this.audioStepSeconds += stepSeconds;
    this.hudStepSeconds += stepSeconds;

    // **Ride input exists only in a ride** (M9). The title screen and the
    // settings screen both keep simulating so the world stays alive behind the
    // card, and without this gate a key pressed while reading the controls
    // would ride the wheel off into the distance behind the menu — with the
    // player unable to see it happen. `AppState` answers this once, for every
    // state, and a unit test asserts that exactly one state says yes.
    const riding = this.appState.acceptsRideInput;
    const sampledActions = riding
      ? this.actionState.sample(this.simTimeSeconds)
      : NEUTRAL_ACTIONS;

    // Claim one-shots exactly once each, before the controller reads the step:
    // a hop buffered on the previous frame belongs to this step, not the next.
    let didReset = false;
    let hopForController = false;
    let swingForPaddle = false;
    for (const action of riding ? PRESSED_ACTIONS : NO_ACTIONS) {
      // The latch is a buffer, not merely an edge detector. Legality belongs
      // to the controller, so an early Space press stays pending while the
      // wheel is airborne and is claimed on the first grounded step that can
      // actually begin another compression.
      if (action === 'hop' && !this.controller.canAcceptHop) continue;
      // The same contract for the swing, and the same reasoning: a press
      // thrown during the recovery of the last swing stays latched and is
      // claimed on the first step that can begin another one, so a player
      // swinging at two targets in quick succession is early rather than
      // ignored. Past the action buffer it lapses, which is what stops a
      // forgotten press firing at a target half a route later.
      if (action === 'swing' && !this.canAcceptSwing) continue;
      if (!this.actionState.consume(action, this.simTimeSeconds)) continue;
      this.consumed[action] += 1;
      if (action === 'hop') hopForController = true;
      if (action === 'swing') swingForPaddle = true;
      if (action === 'reset') {
        const timed = this.challenge.state.phase !== 'idle';
        if (timed) this.resetChallengeRider();
        else this.resetRider();
        // **During a timed run, `R` restarts the run rather than merely moving
        // the rider.** It is also the anti-exploit: the slice's route is a loop
        // that closes back into the plaza, so any teleport near the finish
        // that left the clock running would
        // teleport a rider two minutes in to within seconds of the line. See
        // `ChallengeRun.restart`, which is a no-op outside a run so free ride's
        // own `R` cannot arm one.
        this.challenge.restart();
        this.ghostRecorder.reset();
        this.pendingSplit = null;
        this.resultsIn = 0;
        didReset = true;
      }
      if (action === 'cameraCycle') this.cycleCamera();
      if (action === 'pause') this.goTo('paused');
      // `M` is now the keyboard shortcut for the settings screen's mute
      // toggle rather than a separate session flag, which is what
      // `docs/PLANS.md` §4.7 said would happen when M9's faders landed:
      // the key stays, and the state it flips is the saved one.
      if (action === 'muteAudio') this.options.set({ muted: !this.options.current.muted });
    }

    // The reset step integrates nothing. `resetRider` has already collapsed
    // the poses and the camera onto the reset target; letting the rest of this step
    // run would apply the actions sampled above — a throttle still held when
    // R lands — *within the same step*, and "reset" would mean "almost the
    // target, moving slightly". Held input deliberately survives the reset and
    // takes effect from the next step: a rider holding W through a reset
    // expects to pull away again, not to have to re-press.
    if (didReset) return;

    // Present a hop edge only on the step that legally claimed it. The sampled
    // action can remain true while its latch waits in the buffer; handing that
    // level to the controller would make an illegal airborne press look held.
    const actions: ActionSnapshot = sampledActions.hop === hopForController
      ? sampledActions
      : { ...sampledActions, hop: hopForController };

    this.lastThrottle = actions.throttle;
    this.lastSteer = actions.steer;

    copyPose(this.currentPose, this.previousPose);
    this.controller.step(stepSeconds, actions);
    this.controller.writePose(this.currentPose);

    // -- M5's two contact events --------------------------------------------
    //
    // Read through the controller's getters rather than a snapshot, which
    // allocates; and spent here in the fixed step rather than in the render
    // frame, so `advance(n)` reaches the same camera dip and the same particle
    // field every run. That determinism is what makes a frozen capture of a
    // landing mean anything.
    //
    // **Before the camera is stepped, not after.** The camera writes its state
    // at the end of its own step, so an impulse applied afterwards would not
    // reach the snapshot until the following step — one frame of the landing
    // happening and nothing moving, and a dip that appears to rise before it
    // falls, which is exactly the oscillation the dip is not allowed to have.
    if (this.controller.touchedDown) {
      const impact = this.controller.lastLandingImpact;
      this.chase.landingImpulse(impact);
      this.renderer.emitLandingParticles(
        this.currentPose.x,
        this.currentPose.y,
        this.currentPose.z,
        this.controller.currentSurface,
        impact / EUC.landingImpactReference,
      );
      this.audio.landing(impact / EUC.landingImpactReference, this.controller.currentSurface);
    }
    const strike = this.controller.pedalStrikeDepth;
    if (strike !== 0) {
      const side = strike > 0 ? 1 : -1;
      pedalEdgeWorld(this.currentPose, side, this.strikePoint);
      this.renderer.emitSparks(
        this.strikePoint.x,
        this.strikePoint.y,
        this.strikePoint.z,
        Math.abs(strike),
        side,
        this.currentPose.headingY,
        stepSeconds,
      );
    }
    // -- M13's third contact effect, and the only continuous one -------------
    //
    // Dispatched from the same place and in the same step as the two above,
    // for the same reason: a rate spent on the render frame would throw a
    // different sheet of water on every machine, and `advance(n)` has to reach
    // the same field every run.
    //
    // Grounded is derived from the pose exactly as `readChaseInput` derives it,
    // rather than from a second boolean that could disagree — a wheel in flight
    // over a puddle is not in the puddle, which is the same rule that lets a
    // hop clear a pothole with no hop-specific code.
    this.renderer.emitSurfaceSpray(
      this.currentPose.y - this.currentPose.groundY <= 1e-6,
      this.currentPose.x,
      this.currentPose.y,
      this.currentPose.z,
      this.controller.currentSurface,
      this.currentPose.speed,
      this.currentPose.headingY,
      stepSeconds,
    );
    this.renderer.stepParticles(stepSeconds);

    // -- M8's four one-shots, dispatched from the same place, for the same
    // reason: a single-step edge seen from the render frame is a coin toss,
    // and `advance(n)` has to reach the same sounds every run.
    //
    // The pedal scrape is deliberately absent — it is continuous while the
    // pedal is down, so it is a voice driven from the pose below rather than
    // an event, exactly as its spark stream is.
    if (this.controller.tookOff) {
      this.audio.hop(this.controller.lastHopCharge);
      this.hoppedSinceHudUpdate = true;
    }
    const collision = this.controller.obstacleImpact;
    if (collision > 0) this.audio.impact(collision);
    if (this.controller.crashed !== this.wasCrashed) {
      // Only the start is dispatched here. The *end* of a crash is a state
      // change rather than a step flag, and the director already watches for
      // it to fire the recovery chirp — one edge detector, not two.
      if (this.controller.crashed) this.audio.crash(this.currentPose.speed);
      this.wasCrashed = this.controller.crashed;
    }

    // The swing, stepped here and nowhere else (M14), for the reason the timed
    // run below is: it is fed the pose this step just produced, at the fixed
    // rate, so a hit is reproducible under `advance(n)`.
    this.stepPaddle(stepSeconds, swingForPaddle);

    // The cop, and then the chase's rules — M18, stepped here for the reason
    // everything above is: he is fed the pose this step just produced, at the
    // fixed rate, so `advance(n)` reaches the same chase every run. He rides
    // before the referee looks, so the gap the bust is judged on is this step's
    // gap rather than the last one's.
    this.stepCop(stepSeconds);

    // The Knockabout run — M14, stepped beside the timed one and never inside
    // it: the two are alternatives, and a mode that had to check whether the
    // other was running would be two modes wearing one state.
    this.stepKnockabout(stepSeconds);
    this.stepChase(stepSeconds);

    // The timed run, stepped here and nowhere else (M10). It is fed the pose
    // that this step just produced, at the same fixed rate as everything else,
    // which is what makes a split time reproducible under `advance(n)` — and a
    // split time that is not reproducible is a personal best nobody can trust.
    this.stepChallenge(stepSeconds);

    // The camera reacts to the state that step just produced, and is stepped
    // at the same fixed rate for the same reason the controller is: so that
    // `advance(n)` reaches a named camera state deterministically.
    copyChaseCameraState(this.currentCamera, this.previousCamera);
    this.chase.step(stepSeconds, this.readChaseInput(this.currentPose));
    this.chase.writeState(this.currentCamera);

    // Diagnostic orbit. Also stepped rather than driven from wall time, so a
    // frozen inspection capture lands on the angle that was asked for.
    this.previousOrbitAngle = this.orbitAngle;
    this.orbitAngle += this.tuning.get('INSPECTION_CAMERA.orbitRate') * stepSeconds;
  };

  /** Fill the preallocated camera input from a pose. Allocation-free. */
  private readChaseInput(pose: EucPose): ChaseCameraInput {
    const input = this.chaseInput;
    input.x = pose.x;
    input.y = pose.y;
    input.z = pose.z;
    input.headingY = pose.headingY;
    input.rollAngle = pose.rollAngle;
    input.speed = pose.speed;
    input.groundY = pose.groundY;
    // A pose whose contact patch is above the ground beneath it is a pose in
    // flight. Derived rather than carried as a boolean because a boolean does
    // not interpolate, and this is read from the interpolated pose too.
    input.airborne = pose.y - pose.groundY > 1e-6;
    // Derived from the crash blend for the same reason `airborne` is derived
    // from the height: a boolean does not interpolate, and this is read from
    // the interpolated pose on the render frame as well as from the stepped one.
    input.crashed = pose.crashBlend > 1e-6;
    return input;
  }

  private readonly render = (alpha: number): void => {
    // Interpolating between the two most recent states is the other half of a
    // fixed-step loop; without it the view stutters whenever the display
    // cadence and the step rate disagree, which is almost always.
    const pose = this.renderPose;
    const previous = this.previousPose;
    const current = this.currentPose;

    pose.x = previous.x + (current.x - previous.x) * alpha;
    pose.y = previous.y + (current.y - previous.y) * alpha;
    pose.z = previous.z + (current.z - previous.z) * alpha;
    // Heading and wheel spin are deliberately unwrapped in the controller, so
    // a plain lerp is correct. A wrapped angle would spin the rig a full turn
    // every time it crossed the seam.
    pose.headingY = previous.headingY + (current.headingY - previous.headingY) * alpha;
    pose.rollAngle = previous.rollAngle + (current.rollAngle - previous.rollAngle) * alpha;
    pose.riderRoll = previous.riderRoll + (current.riderRoll - previous.riderRoll) * alpha;
    pose.riderPitch = previous.riderPitch + (current.riderPitch - previous.riderPitch) * alpha;
    pose.riderLookYaw = previous.riderLookYaw
      + (current.riderLookYaw - previous.riderLookYaw) * alpha;
    pose.riderTurnTwist = previous.riderTurnTwist
      + (current.riderTurnTwist - previous.riderTurnTwist) * alpha;
    pose.technicalTurn = previous.technicalTurn
      + (current.technicalTurn - previous.technicalTurn) * alpha;
    pose.reverseBlend = previous.reverseBlend
      + (current.reverseBlend - previous.reverseBlend) * alpha;
    pose.wheelPitch = previous.wheelPitch + (current.wheelPitch - previous.wheelPitch) * alpha;
    pose.wheelSpin = previous.wheelSpin + (current.wheelSpin - previous.wheelSpin) * alpha;
    pose.groundPitch = previous.groundPitch + (current.groundPitch - previous.groundPitch) * alpha;
    pose.groundRoll = previous.groundRoll + (current.groundRoll - previous.groundRoll) * alpha;
    pose.suspensionOffset = previous.suspensionOffset
      + (current.suspensionOffset - previous.suspensionOffset) * alpha;
    pose.restFactor = previous.restFactor
      + (current.restFactor - previous.restFactor) * alpha;
    pose.speed = previous.speed + (current.speed - previous.speed) * alpha;
    pose.crouch = previous.crouch + (current.crouch - previous.crouch) * alpha;
    pose.tuck = previous.tuck + (current.tuck - previous.tuck) * alpha;
    pose.airBlend = previous.airBlend + (current.airBlend - previous.airBlend) * alpha;
    pose.airHeight = previous.airHeight + (current.airHeight - previous.airHeight) * alpha;
    pose.groundY = previous.groundY + (current.groundY - previous.groundY) * alpha;
    // Signed by the scraping side, so a value that crosses zero between two
    // steps is a scrape that ended — which is exactly what interpolating it
    // should mean. See the note on `EucPose.pedalStrike`.
    pose.pedalStrike = previous.pedalStrike
      + (current.pedalStrike - previous.pedalStrike) * alpha;
    // M6. Every one of these is a scalar that is exactly zero while the rider
    // is riding cleanly, so interpolating them costs nothing and changes
    // nothing about the M2-M5 frame.
    pose.wobble = previous.wobble + (current.wobble - previous.wobble) * alpha;
    pose.wobbleFootCorrection = previous.wobbleFootCorrection
      + (current.wobbleFootCorrection - previous.wobbleFootCorrection) * alpha;
    pose.wobbleYaw = previous.wobbleYaw + (current.wobbleYaw - previous.wobbleYaw) * alpha;
    pose.wobbleRoll = previous.wobbleRoll
      + (current.wobbleRoll - previous.wobbleRoll) * alpha;
    pose.wobbleFight = previous.wobbleFight
      + (current.wobbleFight - previous.wobbleFight) * alpha;
    // `wobbleSway` is already sin(phase), so it is continuous when the phase
    // wraps from 2π to 0 and interpolates like every other pose scalar. The M13
    // first pass sampled the current step after claiming adjacent sine samples
    // could jump from +1 to -1; at 120 Hz and at most 7 Hz they cannot, and
    // sampling instead of lerping gave the feet a one-step phase lead.
    pose.wobbleSway = previous.wobbleSway
      + (current.wobbleSway - previous.wobbleSway) * alpha;
    pose.alert = previous.alert + (current.alert - previous.alert) * alpha;
    pose.tiltBack = previous.tiltBack + (current.tiltBack - previous.tiltBack) * alpha;
    pose.crashBlend = previous.crashBlend + (current.crashBlend - previous.crashBlend) * alpha;
    pose.crashForward = previous.crashForward
      + (current.crashForward - previous.crashForward) * alpha;
    pose.crashLateral = previous.crashLateral
      + (current.crashLateral - previous.crashLateral) * alpha;
    pose.crashDrop = previous.crashDrop + (current.crashDrop - previous.crashDrop) * alpha;
    pose.crashTumble = previous.crashTumble + (current.crashTumble - previous.crashTumble) * alpha;
    pose.crashRoll = previous.crashRoll + (current.crashRoll - previous.crashRoll) * alpha;
    pose.wheelCrashLean = previous.wheelCrashLean
      + (current.wheelCrashLean - previous.wheelCrashLean) * alpha;
    // M15. The flourish scalars and the ragdoll block interpolate like every
    // other pose value — the particles are world positions, so a per-float
    // lerp of the block is a lerp of each particle's path, which is exactly
    // what the fixed step's own integration did between these two states.
    pose.wheelCrashSpin = previous.wheelCrashSpin
      + (current.wheelCrashSpin - previous.wheelCrashSpin) * alpha;
    pose.wheelCrashPop = previous.wheelCrashPop
      + (current.wheelCrashPop - previous.wheelCrashPop) * alpha;
    pose.ragdollBlend = previous.ragdollBlend
      + (current.ragdollBlend - previous.ragdollBlend) * alpha;
    if (pose.ragdollBlend > 0) {
      for (let index = 0; index < pose.ragdoll.length; index += 1) {
        pose.ragdoll[index] = previous.ragdoll[index]
          + (current.ragdoll[index] - previous.ragdoll[index]) * alpha;
      }
    }
    pose.recoverBlend = previous.recoverBlend
      + (current.recoverBlend - previous.recoverBlend) * alpha;

    // The swing, recorded before the stance is solved so the arm is posed on
    // this frame's angle rather than the last one's. The head is recomputed at
    // the *interpolated* pose: the hit test swept through a fixed-step head, and
    // drawing that one would leave the paddle up to a fifth of a metre behind
    // its own rider at 50 mph.
    if (this.paddleEquipped) {
      this.paddle.writeHeadFor(pose, this.paddleHead);
      this.rig.applySwing(this.paddleHead, this.paddle.angle, this.paddle.armCommitment);
    } else {
      this.rig.applySwing(null, 0, 0);
    }
    this.rig.apply(pose);

    // **The cop, at the same interpolated moment as the player** — M18. He is a
    // live rider stepped at the fixed rate, so drawing him at his stepped pose
    // would leave him juddering beside a player who is smooth, and at 50 mph
    // one step is a fifth of a metre. `setCopVisible` is the single writer of
    // the second-rider slot, so showing him hides the ghost by construction.
    if (this.copRiding) {
      lerpPose(this.copPrevious, this.copCurrent, alpha, this.copRender);
      this.copPaddle.writeHeadFor(this.copRender, this.copHead);
      this.renderer.setCopVisible(true);
      this.renderer.applyCop(
        this.copRender,
        this.copHead,
        this.copPaddle.angle,
        this.copPaddle.armCommitment,
      );
    } else if (this.renderer.secondRiderShown === 'cop') {
      this.renderer.setCopVisible(false);
    }

    // The machine's own status light (M6). Driven from the simulation clock
    // rather than wall time, so `advance(n)` reaches the same pulse every run.
    // The third argument is the power-on flare after a crash recovery: full
    // at the instant the rider is restored, gone as the recovery blend
    // finishes. It replaced the recovery chirp the owner silenced.
    this.rig.applyStatus(pose.alert, this.simTimeSeconds, 1 - pose.recoverBlend);
    // A single tight shadow cascade parked at the origin loses the rider's
    // contact shadow within a couple of seconds of riding away from it.
    this.renderer.setShadowFocus(pose.x, pose.y, pose.z);
    // The surround is one plane and it follows the rider, so the world never
    // runs out. It carries no mottle, so moving it is invisible.
    this.terrainView.setSurroundCentre(pose.x, pose.z);
    this.placeCamera(pose, alpha);
    this.updateAudio(pose);
    this.updateHud(pose);
    this.updateGhost();

    this.renderer.render();
  };

  /**
   * The HUD and the first-ride prompt, once per drawn frame.
   *
   * Driven from the **simulation** clock rather than wall time, like almost
   * everything else in this file: it makes `advance(n)` reach the same warning
   * dwell and the same prompt every run, which is what lets a browser spec
   * assert anything about either. It also means the HUD holds its state behind
   * a pause instead of ageing while nobody is riding.
   *
   * Reading the *interpolated* pose rather than the controller's snapshot is
   * deliberate: `snapshot()` allocates a large object and this runs sixty
   * times a second, while the pose is already here and already interpolated —
   * so the speed the player reads matches the speed they are watching rather
   * than the last fixed step's.
   */
  private updateHud(pose: EucPose): void {
    const riding = this.appState.acceptsRideInput;

    const run = this.challenge.state;
    this.hudView = this.hudModel.update(this.simTimeSeconds, {
      speed: pose.speed,
      powerStage: this.controller.powerWarning,
      tiltBack: pose.tiltBack,
      offCourse: this.controller.offRoute,
      crashed: pose.crashBlend > 1e-6,
      // The lane draws itself only while a run is live. `idle` is free ride,
      // where the reserved lane stays empty exactly as it has since M9.
      challenge: run.phase === 'idle' ? undefined : {
        phase: run.phase,
        elapsed: run.elapsed,
        nextLabel: run.nextLabel,
        passed: run.passed,
        total: run.total,
        directionRadians: this.directionToCheckpoint(run.nextIndex, pose),
        // Handed over raw. `hudModel.ts` owns the quantisation, so the armed
        // phase gets the distance too — it was composed here first and only
        // used while running, which lost it in the one phase it was written
        // for. See `ChallengeState.distanceToNext`.
        distanceMetres: run.distanceToNext,
        // Consumed here rather than read: a crossing is one step's edge, and
        // leaving it set would re-arm the model's dwell on every frame.
        split: this.takePendingSplit(),
      },
      // The score lane, on the same terms — M14. Absent outside the mode, so
      // "not in Knockabout" and "in Knockabout having hit nothing yet" are
      // different things: the first draws no lane and the second draws `0 / 17`,
      // which is what a player starting a run wants to see.
      knockabout: this.appState.current === 'knockabout'
        ? { struck: this.targets.struckCount, total: this.targets.count }
        : undefined,
      // The chase lane, sharing that corner — M18. Absent outside the mode on
      // the same terms, and it carries the two cues the player cannot see for
      // themselves: whether the boundary's clock is running, and whether the
      // cop is inside the radius where a crash would end the run.
      chase: this.appState.current === 'chase'
        ? {
          remaining: this.chaseRun.state.remaining,
          straying: this.chaseRun.state.straying,
          copClose: this.copGap <= this.chaseRun.bustRadiusMetres,
        }
        : undefined,
    });

    const prompt = this.onboarding.update(this.simTimeSeconds, this.hudStepSeconds, {
      riding,
      throttle: this.lastThrottle,
      steer: this.lastSteer,
      speed: pose.speed,
      hopped: this.hoppedSinceHudUpdate,
      crashed: pose.crashBlend > 1e-6,
      device: this.promptDevice,
    });
    this.hudStepSeconds = 0;
    this.hoppedSinceHudUpdate = false;
    this.hudPrompt = prompt.prompt;
    this.persistSeenPrompts();

    if (this.hud.visible) this.hud.update(this.hudView, prompt.text);
  }

  /**
   * Place the ghost for one drawn frame, or hide it.
   *
   * On the **render** frame rather than in the step, unlike everything else
   * this milestone added, and the difference is the point: the ghost changes
   * nothing about the game. It is not simulated, nothing can collide with it,
   * and no rule reads its position — so stepping it would buy determinism
   * nobody needs and spend it at 120 Hz instead of 60. The run clock it is
   * sampled at *is* deterministic, which is what makes a frozen capture of the
   * ghost reproducible anyway.
   *
   * `sample()` returns false before the recorded run started and after it
   * ended, and both are cases where the honest thing on screen is nothing at
   * all — a ghost frozen at the finish line, watched by the rider it just beat,
   * is the annoyance rule almost word for word.
   */
  private updateGhost(): void {
    if (this.appState.current !== 'challenge' || !this.ghostPlayer.hasTrack) {
      this.renderer.setGhostVisible(false);
      return;
    }

    const run = this.challenge.state;
    if (run.phase !== 'running' || !this.ghostPlayer.sample(run.elapsed, this.ghostSample)) {
      this.renderer.setGhostVisible(false);
      return;
    }

    this.renderer.setGhostVisible(true);
    this.renderer.applyGhost(this.ghostSample);
  }

  /** Take the latched split, leaving nothing behind. See `pendingSplit`. */
  private takePendingSplit(): { label: string; delta: number | null } | null {
    const split = this.pendingSplit;
    this.pendingSplit = null;
    return split;
  }

  /**
   * Hand the ride to the audio layer, once per drawn frame.
   *
   * Continuous state here and events in `step`, which is the same split the
   * particles and the camera already use and for the same reason: an event is
   * a single step's edge and would be missed at frame rate, while a gain is a
   * quantity nobody can hear updating faster than they can see.
   *
   * Filled in place into the engine's own preallocated input. Sixty objects a
   * second is exactly the shape of garbage the pose comments above exist to
   * avoid.
   */
  private updateAudio(pose: EucPose): void {
    const input = this.audio.input;
    input.speed = pose.speed;
    // What the player is *asking* for, not what the wheel achieved. A throttle
    // held into a hill is the sound of working hard even before the speed
    // answers, and that lead is most of why the motor feels connected. Taken
    // from the last step rather than sampled again here, because `sample()`
    // allocates and the step has already paid for it.
    input.throttle = this.lastThrottle;
    input.load = this.controller.powerLoad;
    input.powerStage = this.controller.powerWarning;
    input.surface = this.controller.currentSurface;
    input.grounded = pose.y - pose.groundY <= 1e-6;
    // **Three clocks, and each one is the only correct answer to its case.**
    //
    //   - Simulation happened: advance by exactly that much. Deterministic, so
    //     `advance(n)` reaches the same beep count and duck level every run.
    //   - Paused or context-lost: nothing is being simulated and never will be
    //     until the player acts, so advance by wall time — that fade to silence
    //     has to complete, and driven from a step clock that has stopped it
    //     would freeze half-way and hum behind the pause card forever.
    //   - Otherwise (the QA bridge has frozen the loop and is not advancing):
    //     hold. The ride is not changing, so neither should its sound, and a
    //     model that drifted on wall time between two `advance` calls would
    //     make every level a spec measures depend on how long the automation
    //     protocol happened to take.
    // **Any state that is not a ride is silent** (M9), not merely a pause.
    // The world keeps simulating behind the title and settings cards so the
    // scene stays alive, and before M9 that meant a wheel humming at the
    // player from behind the menu they had not left yet. A rider who is not
    // riding makes no sound.
    const halted = !this.appState.acceptsRideInput || this.contextLost;
    const dt = this.audioStepSeconds > 0
      ? this.audioStepSeconds
      : halted ? this.frameSeconds : 0;
    input.suspensionSpeed = dt > 0
      ? (pose.suspensionOffset - this.lastSuspensionOffset) / dt
      : 0;
    this.lastSuspensionOffset = pose.suspensionOffset;
    input.scrape = Math.abs(pose.pedalStrike);
    input.crashed = pose.crashBlend > 1e-6;
    // The siren's whole feed (M18): a distance while the pursuit is live,
    // Infinity the moment it is not — the director owes escape, bust, and
    // quit no separate treatment because they all arrive as the same fact.
    // The probe (`?chaseprobe=1`) has no rules and no pursuit, and stays
    // silent through the same expression. Closing speed is the gap's own
    // derivative, clamped against the teleports a reset can produce.
    const pursuing = this.appState.current === 'chase'
      && this.chaseRun.state.phase === 'running';
    if (pursuing) {
      input.copRangeMetres = this.copGap;
      input.copClosingSpeed = dt > 0 && Number.isFinite(this.lastSirenGap)
        ? clamp((this.lastSirenGap - this.copGap) / dt, -15, 15)
        : 0;
      this.lastSirenGap = this.copGap;
    } else {
      input.copRangeMetres = Number.POSITIVE_INFINITY;
      input.copClosingSpeed = 0;
      this.lastSirenGap = Number.POSITIVE_INFINITY;
    }
    // The two states that genuinely have no sound — named explicitly rather
    // than derived from "the loop is not running", which is also true of a
    // loop the QA bridge froze in order to *listen* to something.
    input.idle = halted;

    this.audio.update(dt);
    this.audioStepSeconds = 0;
  }

  /**
   * Place the camera for one drawn frame.
   *
   * The chase camera's numbers were all decided in `step`; this interpolates
   * them and turns the result into a transform. The only three.js-specific
   * decision here is the bank, and it is worth stating precisely because it is
   * the kind of sign a world-space test agrees with while being wrong
   * (`docs/LESSONS_LEARNED.md`).
   *
   * `rotateZ` turns about the camera's own +Z, which points *backwards* along
   * the view. A positive rotation about it takes the camera's up axis toward
   * screen-LEFT, so tilting the up axis toward screen-right — which is what
   * leaning into a right-hand corner looks like from behind — is a negative
   * rotation. `tests/m3.spec.ts` proves the resulting screen tilt rather than
   * trusting this paragraph.
   */
  private placeCamera(pose: EucPose, alpha: number): void {
    const camera = this.renderer.camera;

    if (this.cameraMode === 'orbit') {
      const angle = this.previousOrbitAngle
        + (this.orbitAngle - this.previousOrbitAngle) * alpha;
      const radius = CAMERA.distanceAtRest * INSPECTION_CAMERA.distanceFactor;
      camera.position.set(
        pose.x + Math.sin(angle) * radius,
        pose.y + WHEEL.shellHeight * INSPECTION_CAMERA.heightFactor,
        pose.z + Math.cos(angle) * radius,
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(pose.x, pose.y + RIDER.hipHeight * INSPECTION_CAMERA.targetHeightFactor, pose.z);
      // The diagnostic view holds the resting field of view: a speed-eased FOV
      // would make an inspection capture depend on how fast the rider happened
      // to be going when it was taken.
      this.renderer.setFieldOfView(this.chase.tuning.fovAtRest);
      return;
    }

    lerpChaseCameraState(this.previousCamera, this.currentCamera, alpha, this.renderCamera);
    const view = this.chaseView;
    resolveChaseView(this.renderCamera, this.readChaseInput(pose), this.chase.tuning, view);

    camera.position.set(view.positionX, view.positionY, view.positionZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(view.targetX, view.targetY, view.targetZ);
    if (view.roll !== 0) camera.rotateZ(-view.roll);
    // The player's field-of-view trim is applied here rather than inside the
    // camera, and that is the options firewall being kept at the last possible
    // moment: `chaseCamera.ts` eases between two authored angles and knows
    // nothing about a preference. A trim moves both ends together, so the
    // speed ease survives at every setting.
    this.renderer.setFieldOfView(view.fov + this.fieldOfViewTrimRadians);
  }

  private readonly onFrameSampled = (sample: FrameSample): void => {
    this.profiler.record(sample);

    // Gate on visibility at the call site, not inside the widget: the cost
    // being avoided is assembling this report, not writing it to the DOM
    // (master starter 16.2).
    const nowMs = performance.now();
    if (!this.overlay.shouldRefresh(nowMs)) return;

    const context = this.debugContext;
    const info = this.renderer.renderer.info;
    const viewport = this.renderer.viewport();

    context.tick = this.tick;
    context.simTimeSeconds = this.simTimeSeconds;
    context.loop = this.loop.stats();
    context.actions = this.actionState.sample(this.simTimeSeconds);
    context.euc = this.controller.snapshot();
    context.cameraMode = this.cameraMode;
    context.cameraDistance = this.currentCamera.armDistance;
    context.cameraFov = this.currentCamera.fov;
    context.cameraLookAhead = this.currentCamera.lookAhead;
    context.cameraBank = this.currentCamera.bank;
    // How far the camera is currently behind the rider's heading. The thing
    // the yaw-lag constants actually control, in the units they are set in.
    context.cameraYawLag = wrapAngle(this.currentPose.headingY - this.currentCamera.yaw);
    context.viewportWidth = viewport.width;
    context.viewportHeight = viewport.height;
    context.pixelRatio = viewport.pixelRatio;
    context.drawCalls = info.render.calls;
    context.triangles = info.render.triangles;
    context.geometries = info.memory.geometries;
    context.textures = info.memory.textures;
    context.programs = info.programs?.length ?? 0;
    context.profile = this.profiler.report();
    context.tuningOverrides = this.tuning.overrideCount();
    context.audio = this.audio.snapshot();

    this.overlay.update(context, nowMs);
  };

  // ---------------------------------------------------------------------------

  /**
   * Quick reset — `R`.
   *
   * Puts the rider back at the spawn, stopped and upright, and clears the
   * interpolation history so the frame after a reset does not draw a rig
   * smeared between where the rider was and where they now are.
   */
  private resetRider(): void {
    this.resetRiderTo(this.levelPlan.spawn);
  }

  /**
   * Put a timed attempt a short, derived run-up behind its start line.
   *
   * The first M10 pass sent every retry back to the level spawn, which happens
   * to be fifty metres from the slice's start. That is level authoring leaking
   * into retry cost. A generated course already owns the position and heading
   * of its start checkpoint, so deriving the run-up from that checkpoint keeps
   * retries quick on every producer without adding a slice-specific spawn.
   */
  private resetChallengeRider(): void {
    const start = this.levelPlan.checkpoints.find((checkpoint) => checkpoint.kind === 'start');
    if (start === undefined) {
      this.resetRider();
      return;
    }

    const x = start.centre.x - Math.sin(start.headingY) * CHALLENGE.startRunupMetres;
    const z = start.centre.z - Math.cos(start.headingY) * CHALLENGE.startRunupMetres;
    const ground = createGroundSample();
    this.terrain.sampleGround(x, z, ground);
    this.resetRiderTo({
      position: { x, y: ground.height, z },
      headingY: start.headingY,
    });
  }

  /** Common half of the ordinary reset and the challenge run-up reset. */
  private resetRiderTo(spawn: LevelPlan['spawn']): void {
    this.controller.reset(spawn);
    this.syncPoses();
    this.orbitAngle = 0;
    this.previousOrbitAngle = 0;
    // Sparks and dust are consequences of a ride that no longer happened.
    // Leaving them would hang a burst of them in the air at a place the rider
    // is no longer standing, which is the visual equivalent of the smeared rig
    // `syncPoses` exists to prevent.
    this.renderer.clearParticles();
    // And the audible equivalent: a tyre still roaring over gravel, a landing
    // thump still decaying, above a rider who is now standing still at the
    // spawn on pavement.
    this.audio.reset();
    this.lastThrottle = 0;
    this.lastSteer = 0;
    this.lastSuspensionOffset = 0;
    this.wasCrashed = false;
    // A rider back at the reset target is not still being warned about the hill they
    // were climbing, and is not still off the route they were off.
    this.hudModel.reset();
    // A teleport, so the swing goes with the rider who was making it and the
    // previous head position is thrown away — M14. The unconditional distance
    // guard inside `Paddle` is the primary defence and does not depend on this
    // line; this is the half that does not depend on a threshold being right.
    // The two teleports it cannot cover are the automatic crash respawn, which
    // fires inside the controller on a timer with no signal out, and a reset
    // step, which returns from `step` before anything after it runs.
    this.paddle.cancel();
    // And the cop goes back behind whoever he is chasing — M18. After
    // `syncPoses`, because it reads the rider's freshly written pose to decide
    // where "behind" is.
    this.placeCopBehindRider();
  }

  /** Eight-way HUD bearing, derived from the active plan checkpoint. */
  private directionToCheckpoint(routeIndex: number, pose: EucPose): number {
    if (routeIndex < 0) return Number.NaN;
    const checkpoint = this.levelPlan.checkpoints.find(
      (candidate) => candidate.routeIndex === routeIndex,
    );
    if (checkpoint === undefined) return Number.NaN;
    return wrapAngle(
      Math.atan2(checkpoint.centre.x - pose.x, checkpoint.centre.z - pose.z)
        - pose.headingY,
    );
  }

  private cycleCamera(): void {
    const next = (CAMERA_MODES.indexOf(this.cameraMode) + 1) % CAMERA_MODES.length;
    this.cameraMode = CAMERA_MODES[next];
  }

  // ---------------------------------------------------------------------------
  // Application state (M9)
  // ---------------------------------------------------------------------------

  /** Ask for a transition. Refused moves are ignored, as `AppState` documents. */
  private goTo(state: AppStateId): boolean {
    return this.appState.goTo(state);
  }

  /**
   * Everything a state change costs, in one place.
   *
   * Driven off the machine's own listener rather than written at each call
   * site, so a state entered from two directions — `settings`, which is
   * reachable from the title and from a pause — cannot be set up two slightly
   * different ways.
   */
  private enterState(state: AppStateId): void {
    const spec = this.appState.spec;

    // **Every menu boundary is an input-reset moment** (master §8.2). A key
    // held as Escape lands never delivers its keyup to the game, so without
    // this the rider resumes at full throttle — the blur bug, arriving through
    // a different door. The loop's clock is re-anchored with it, or the time
    // spent reading a settings screen is replayed as simulation.
    if (spec.resetsInput) {
      this.keyboard.reset();
      this.loop.resetTime();
    }

    // **The gates exist only inside the mode that uses them** (M10). Hidden
    // rather than faded in free ride, so they cost nothing at all in the mode
    // the owner's five-minute no-objective test is judged in — and so that a
    // player who never opens the time trial never sees furniture belonging to
    // a mode they did not choose.
    //
    // **A pause keeps them**, for the reason this file already applies to the
    // HUD: a player pausing to work out where the next gate is should not have
    // the gates disappear when they pause. `settings` opened from that pause
    // keeps them too, since it is the same interruption one screen deeper.
    const timing = state === 'challenge'
      || state === 'results'
      || ((state === 'paused' || state === 'settings') && this.challenge.state.phase !== 'idle');
    this.renderer.setCheckpointsVisible(timing);
    if (!timing) this.renderer.setGhostVisible(false);

    // **Only two states actually end a run, and they are named rather than
    // derived.** `title` is quitting and `freeRide` is choosing the untimed
    // ride; everything else a player can reach from a challenge — `paused`,
    // and `settings` opened from that pause — is somewhere they are coming
    // back from.
    //
    // This was first written as "not a ride state and not paused", which reads
    // as the same rule and is not: `settings` satisfied it, so checking the
    // volume slider mid-run silently threw the run away and resumed into a
    // dead clock. Naming the two exits leaves no third state to be wrong
    // about, and `tests/m10.spec.ts` walks the settings round trip because
    // that is the path that found it.
    // A Knockabout run ends the moment the player leaves it for anything that
    // is not the results screen or a pause — M14. `lastKnockabout` is cleared
    // with it, which is what makes `buildResultsView` and the retry button able
    // to tell which mode they are looking at.
    if (state === 'title' || state === 'freeRide' || state === 'challenge') {
      this.lastKnockabout = null;
      this.lastKnockaboutWasRecord = false;
      this.knockaboutSeconds = 0;
    }

    if ((state === 'title' || state === 'freeRide') && this.challenge.state.phase !== 'idle') {
      this.challenge.abandon();
      this.ghostRecorder.reset();
      this.resultsIn = 0;
      this.pendingSplit = null;
    }

    // The results panel is filled before it is shown, or the player reads one
    // frame of the previous run's numbers.
    if (state === 'results') this.menus.setResults(this.buildResultsView());

    this.hud.setVisible(spec.showsHud);
    this.menus.show(menuScreenFor(state));
    // While a menu is up the pad drives the menu, not the wheel.
    this.gamepad.setMenuMode(spec.showsMenu);
    // And the on-screen controls leave the screen entirely, which also releases
    // whatever was under a thumb when the menu opened.
    this.updateTouchControls();

    // A rider who is not riding has no dwell timers worth keeping, and coming
    // back to the title must not leave a stale warning behind the card.
    if (!spec.acceptsRideInput) this.hudModel.reset();

    this.updateRunning();
  }

  /**
   * A gamepad menu intent.
   *
   * Directions act on the menu's real focus order and controls. The Gamepad
   * API produces no DOM keyboard events, so the browser cannot do that job on
   * its own; discarding these intents left a controller able to ride but unable
   * to choose Start Ride or Settings.
   */
  private handleMenuAction(action: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): void {
    if (!this.appState.showsMenu) return;

    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      this.menus.navigate(action);
      return;
    }

    // What confirm means depends on the control it lands on, and from M12
    // Phase 4 that is no longer always "click it": the fresh-route panel opens
    // with focus in a text field a pad cannot type into. `ui/menus.ts` owns the
    // answer, because it owns the controls.
    if (action === 'confirm') {
      this.menus.confirm();
      return;
    }

    if (action !== 'back') return;
    if (this.appState.current === 'settings') this.appState.exitSettings();
    // Back leaves the fresh-route panel, exactly as Escape and the Back button
    // do — the pad's third door out, matching the pause menu's.
    else if (this.appState.current === 'routes') this.closeRoutes();
    // And out of the rider chooser, which has exactly one way back for the
    // same reason: a control a device cannot operate is a parity bug.
    else if (this.appState.current === 'riderSelect') this.goTo('title');
    // `resumeRide()`, not `goTo('freeRide')`. The pad's Back is the third door
    // out of a pause, alongside Escape and the Resume button, and it is the one
    // that was still hard-coded to free ride — so a player who paused a timed
    // run and pressed B lost the run, the clock, and the ghost recording, with
    // no confirmation and nothing on screen to say what had happened.
    else if (this.appState.current === 'paused') this.appState.resumeRide();
  }

  /**
   * Whether this device should be offered on-screen controls at all.
   *
   * Separate from whether they are *showing*, which also depends on what the
   * game is doing. `auto` is two questions because one of them cannot be asked
   * up front: the media query settles a phone and a desktop immediately, and
   * the first real touch settles everything in between — a laptop with a
   * touchscreen, a tablet in a keyboard case, a monitor nobody told us about.
   */
  private get touchWanted(): boolean {
    const mode = this.options.current.touchControls;
    if (mode === 'off') return false;
    if (mode === 'on') return true;
    return (this.coarsePointer?.matches ?? false) || this.touchControls.touchSeen;
  }

  /**
   * Show or hide the on-screen controls, and move the HUD's lanes with them.
   *
   * **The HUD layout follows the controls, not the device.** A player who
   * switches them off on a phone gets the bottom corners back, and a player who
   * forces them on at a desk gets them taken away — either way the speed is
   * never underneath a control that is on screen.
   */
  private updateTouchControls(): void {
    const wanted = this.touchWanted;
    // Only while riding. A menu is a menu on every device: the buttons on it
    // are real buttons, and a throttle floating over the settings list would be
    // a control that does nothing on a screen full of controls that do.
    this.touchControls.setActive(wanted && this.appState.acceptsRideInput);
    // SWING is shown only when the rider is actually carrying a paddle — M14.
    // These controls sit on top of the road the player is reading, which is
    // why even the ones that ship are held back to 0.82 opacity; a fourth
    // circle that does nothing in free ride would be permanent clutter bought
    // for one mode. One expression decides the button, the drawn paddle and
    // the swing legality together, so the three cannot disagree.
    this.touchControls.setSwingVisible(this.paddleEquipped);
    this.hud.setTouchLayout(wanted);
    // The prompts name the control the player actually has. A touchscreen
    // player told to "hold W" has been told nothing at all — and the pad keeps
    // priority, because somebody holding a pad is using the pad.
    if (!this.gamepad.connected) this.promptDevice = wanted ? 'touch' : 'keyboard';
  }

  /** One writer for the touch section's status line. See `updateGamepadStatus`. */
  private updateTouchStatus(): void {
    const mode = this.options.current.touchControls;
    this.menus.setTouchStatus(
      mode === 'off'
        ? 'disabled'
        : mode === 'on'
          ? 'forced'
          : this.touchWanted
            ? 'shown'
            : 'waiting',
    );
  }

  /**
   * One writer for the controls section's pad status, fed from the current
   * device state rather than from the last transition event.
   */
  private updateGamepadStatus(): void {
    this.menus.setGamepadStatus(
      !this.options.current.gamepadEnabled
        ? 'disabled'
        : this.gamepad.connected
          ? 'connected'
          : 'searching',
    );
  }

  /** The prompt's dismiss button, and the seen flag that follows from it. */
  private dismissPrompt(): void {
    this.onboarding.dismiss();
    this.persistSeenPrompts();
  }

  private persistSeenPrompts(): void {
    if (!this.onboarding.takeSeenChanged()) return;
    this.options.set({ seenPrompts: this.onboarding.seenPrompts() });
  }

  private handleContextLost(): void {
    this.contextLost = true;
    // A player pause is dropped rather than stacked: after a restore the game
    // should come back on its own, not sit behind a second notice. The state
    // machine refuses the move if there was no ride to pause, which is the
    // right answer at the title screen.
    //
    // **Back to whichever ride was paused.** This said `freeRide` until M10's
    // review: a GPU reset or a laptop waking while the pause card happened to
    // be up would have destroyed a timed run, which is a spectacular thing to
    // lose to an event the player did not cause and cannot avoid.
    if (this.appState.current === 'paused') this.appState.resumeRide();
    this.keyboard.reset();
    this.contextNotice.show();
    this.updateRunning();
  }

  /**
   * Give the audio thread back while nobody is looking at the page.
   *
   * Distinct from the pause fade, which keeps the graph running and merely
   * silent so that resuming is instantaneous. A hidden tab is not a pause:
   * it can last hours, and holding an audio device open through it is the
   * kind of thing that shows up as a browser-level battery warning rather
   * than as anything the player can hear.
   */
  /**
   * The device's primary pointer changed kind — a tablet leaving its keyboard
   * case, or arriving in one.
   *
   * Worth answering live rather than at boot because the alternative is telling
   * somebody to reload the page, on the one device where reloading loses the
   * ride they were in the middle of.
   */
  private readonly onPointerKindChange = (): void => {
    this.updateTouchControls();
    this.updateTouchStatus();
  };

  /**
   * The player changed `prefers-reduced-motion` while the game was running.
   *
   * Nothing else needs to happen: the target family repaints from the flag, and
   * the brightness step it falls back on is authored to be the whole hit signal
   * on its own (`data/tuning.ts`, `TARGET.struckBrightness`).
   */
  private readonly onReducedMotionChange = (): void => {
    this.renderer.setTargetsReducedMotion(this.reducedMotion?.matches ?? false);
  };

  private readonly onVisibilityChange = (): void => {
    const hidden = document.visibilityState === 'hidden';
    this.audio.setSuspended(hidden);
    // **A hidden ride is a frozen ride** (M10 QA, F2). The loop used to keep
    // simulating whichever state was live, which meant a timed run's clock
    // advanced while the player could not see it — a fairness defect, not a
    // convenience. The originating state is preserved untouched; only the loop
    // stops, and `setRunning(true)` re-anchors the clock on return so the
    // hidden interval is never replayed as simulation time. The keyboard's own
    // visibility handler has already cleared held input by the time this runs.
    this.pageHidden = hidden;
    this.updateRunning();
  };

  private handleContextRestored(): void {
    this.contextLost = false;
    this.contextNotice.hide();
    // Resume is an input-reset moment too, and it also drops any pause press
    // latched while the notice was up — otherwise the restore would instantly
    // re-freeze the game.
    this.keyboard.reset();
    this.updateRunning();
  }

  /**
   * The loop runs only when nobody has a reason to stop it. `setRunning`
   * re-anchors the clock on resume itself, so the frozen interval is never
   * replayed as simulation time.
   */
  private updateRunning(): void {
    this.loop.setRunning(this.appState.simulates && !this.contextLost && !this.pageHidden);
  }

  /**
   * Collapse both interpolation endpoints onto the controller's state, and
   * snap the camera onto the rider.
   *
   * A reset that left the camera easing would draw several seconds of the
   * rider being chased from wherever they used to be, and a reset that left
   * the previous camera state in the interpolation history would draw one
   * frame smeared across the map.
   */
  private syncPoses(): void {
    this.controller.writePose(this.currentPose);
    copyPose(this.currentPose, this.previousPose);
    copyPose(this.currentPose, this.renderPose);
    this.rig.apply(this.renderPose);

    this.chase.reset(this.readChaseInput(this.currentPose));
    this.chase.writeState(this.currentCamera);
    copyChaseCameraState(this.currentCamera, this.previousCamera);
    copyChaseCameraState(this.currentCamera, this.renderCamera);
  }

  /**
   * Push the current tuning values into the systems that own them.
   *
   * Called once at construction and on every change, rather than polled every
   * frame — the store notifies, so nothing has to ask.
   */
  private applyTuning(): void {
    this.renderer.applyLighting({
      exposure: this.tuning.get('LIGHTING.exposure'),
      sunIntensity: this.tuning.get('LIGHTING.sunIntensity'),
      hemisphereIntensity: this.tuning.get('LIGHTING.hemisphereIntensity'),
    });
    this.renderer.setMaxPixelRatio(this.tuning.get('RENDER.maxPixelRatio'));
    this.loop.setMaxStepsPerFrame(this.tuning.get('SIMULATION.maxStepsPerFrame'));

    this.pushCameraTuning();

    // Developer tuning reaching the controller, exactly as `liveTuning.ts`
    // says it was always meant to from M2. This is not the options firewall
    // being bent: player options are a separate mechanism that stays out of
    // `simulation/` (invariant 5). Pushed on change rather than polled, so the
    // controller reads plain numbers and stays trivially unit-testable.
    this.controller.setTuning({
      maxLeanPitch: this.tuning.get('EUC.maxLeanPitch'),
      leanResponseSeconds: this.tuning.get('EUC.leanResponseSeconds'),
      leanRateLimit: this.tuning.get('EUC.leanRateLimit'),
      leanToAccel: this.tuning.get('EUC.leanToAccel'),
      brakeAuthority: this.tuning.get('EUC.brakeAuthority'),
      dragCoefficient: this.tuning.get('EUC.dragCoefficient'),
      rollingResistanceScale: this.tuning.get('TERRAIN.rollingResistanceScale'),
      curbImpactPerMetre: this.tuning.get('TERRAIN.curbImpactPerMetre'),
      // The rate is deliberately absent: only paths registered in
      // `LIVE_TUNABLES` may be read here, and a knob for how fast a correction
      // eases is not one a rider needs. It keeps the value it was built with.
      wallStandoff: this.tuning.get('TERRAIN.wallStandoff'),
      suspensionFrequencyHz: this.tuning.get('TERRAIN.suspensionFrequencyHz'),
      suspensionDamping: this.tuning.get('TERRAIN.suspensionDamping'),
      maxReverseSpeed: this.tuning.get('EUC.maxReverseSpeed'),
      reverseSteerTravelRelative: this.tuning.get('EUC.reverseSteerTravelRelative'),
      yawRateLow: this.tuning.get('EUC.yawRateLow'),
      yawRateHigh: this.tuning.get('EUC.yawRateHigh'),
      carveSpeed: this.tuning.get('EUC.carveSpeed'),
      yawFalloffExponent: this.tuning.get('EUC.yawFalloffExponent'),
      maxLateralG: this.tuning.get('EUC.maxLateralG'),
      technicalTurnBonusG: this.tuning.get('EUC.technicalTurnBonusG'),
      technicalTurnFadeSpeed: this.tuning.get('EUC.technicalTurnFadeSpeed'),
      technicalTurnSteerStart: this.tuning.get('EUC.technicalTurnSteerStart'),
      technicalTurnSteerFull: this.tuning.get('EUC.technicalTurnSteerFull'),
      turnTechniqueResponseSeconds: this.tuning.get('EUC.turnTechniqueResponseSeconds'),
      gentleTurnTorsoTwist: this.tuning.get('EUC.gentleTurnTorsoTwist'),
      technicalTurnUpperBodyRollFactor: this.tuning.get(
        'EUC.technicalTurnUpperBodyRollFactor',
      ),
      rollResponseSeconds: this.tuning.get('EUC.rollResponseSeconds'),
      riderUpperBodyRollFactor: this.tuning.get('EUC.riderUpperBodyRollFactor'),
      maxRiderPitch: this.tuning.get('EUC.maxRiderPitch'),
      riderCruisePitchFactor: this.tuning.get('EUC.riderCruisePitchFactor'),
      riderAccelerationPitchGain: this.tuning.get('EUC.riderAccelerationPitchGain'),
      riderPitchResponseSeconds: this.tuning.get('EUC.riderPitchResponseSeconds'),
      wheelPitchFactor: this.tuning.get('EUC.wheelPitchFactor'),
      riderLookIntoTurn: this.tuning.get('EUC.riderLookIntoTurn'),
      riderSlopeLeanFactor: this.tuning.get('EUC.riderSlopeLeanFactor'),
      groundTiltPitchFollow: this.tuning.get('TERRAIN.groundTiltPitchFollow'),
      groundTiltRollFollow: this.tuning.get('TERRAIN.groundTiltRollFollow'),
      hopLaunchSpeed: this.tuning.get('EUC.hopLaunchSpeed'),
      hopCompressSeconds: this.tuning.get('EUC.hopCompressSeconds'),
      hopChargeHeightBonus: this.tuning.get('EUC.hopChargeHeightBonus'),
      airYawFactor: this.tuning.get('EUC.airYawFactor'),
      pedalStrikeDecel: this.tuning.get('EUC.pedalStrikeDecel'),
      landingImpactReference: this.tuning.get('EUC.landingImpactReference'),
      landingSpeedLossPerScore: this.tuning.get('EUC.landingSpeedLossPerScore'),
      wobbleMasterGain: this.tuning.get('EUC.wobbleMasterGain'),
      wobbleDampingAggressive: this.tuning.get('EUC.wobbleDampingAggressive'),
      wobbleDampingSmooth: this.tuning.get('EUC.wobbleDampingSmooth'),
      wobbleFootCorrectionDamping: this.tuning.get('EUC.wobbleFootCorrectionDamping'),
      wobbleMaxYaw: this.tuning.get('EUC.wobbleMaxYaw'),
      wobbleMaxRoll: this.tuning.get('EUC.wobbleMaxRoll'),
      wobbleFrequencyHz: this.tuning.get('EUC.wobbleFrequencyHz'),
      wobbleFrequencyAtCrashHz: this.tuning.get('EUC.wobbleFrequencyAtCrashHz'),
      wobbleSurfaceGain: this.tuning.get('EUC.wobbleSurfaceGain'),
      // The diagnostic probe rides this bridge like everything else, and that
      // is the whole reason it works: `installLevel` builds a *new*
      // `EucController` on every world swap and replays this method onto it, so
      // a switch that wrote to the controller would be lost the moment the
      // player opened a fresh route. Written into the live-tuning store, it
      // survives the swap (M13 Phase 0).
      wobbleProbeMetres: this.tuning.get('EUC.wobbleProbeMetres'),
      wobbleProbeEnergy: this.tuning.get('EUC.wobbleProbeEnergy'),
      hazardShallowEnergy: this.tuning.get('EUC.hazardShallowEnergy'),
      hazardShallowSpeedCost: this.tuning.get('EUC.hazardShallowSpeedCost'),
      hazardDeepEnergy: this.tuning.get('EUC.hazardDeepEnergy'),
      hazardDeepSpeedCost: this.tuning.get('EUC.hazardDeepSpeedCost'),
      hazardCrashSpeed: this.tuning.get('EUC.hazardCrashSpeed'),
      powerComfortSpeed: this.tuning.get('EUC.powerComfortSpeed'),
      powerSlopeLoad: this.tuning.get('EUC.powerSlopeLoad'),
      powerTiltBackLoad: this.tuning.get('EUC.powerTiltBackLoad'),
      tiltBackLeanBack: this.tuning.get('EUC.tiltBackLeanBack'),
      obstacleCrashSpeed: this.tuning.get('EUC.obstacleCrashSpeed'),
      crashRecoverSpeedFactor: this.tuning.get('EUC.crashRecoverSpeedFactor'),
      crashRecoverAutoSeconds: this.tuning.get('EUC.crashRecoverAutoSeconds'),
      // The ragdoll's owner A/B switch and the knobs his ride will judge it
      // by (M15). On the store rather than the controller for the diagnostic
      // probe's reason above: `installLevel` builds a fresh controller and
      // replays this method onto it.
      ragdollEnabled: this.tuning.get('EUC.ragdollEnabled'),
      ragdollDamping: this.tuning.get('EUC.ragdollDamping'),
      ragdollFriction: this.tuning.get('EUC.ragdollFriction'),
      ragdollRestitution: this.tuning.get('EUC.ragdollRestitution'),
      ragdollCurlGain: this.tuning.get('EUC.ragdollCurlGain'),
      ragdollLaunchPop: this.tuning.get('EUC.ragdollLaunchPop'),
      crashWheelFlourishSpeed: this.tuning.get('EUC.crashWheelFlourishSpeed'),
      crashWheelSpinRate: this.tuning.get('EUC.crashWheelSpinRate'),
      softBodyDrag: this.tuning.get('EUC.softBodyDrag'),
    });

    // The paddle's live subset — M14. Pushed here rather than read through the
    // tuning table inside the swing, on the pattern the controller above uses:
    // the simulation object holds plain numbers, the composition root owns the
    // registry, and a world swap replays this method onto whatever it built.
    // `hitJolt` and `hitSpeedCost` are deliberately absent — those are read at
    // the moment of a hit in `stepPaddle`, which is once in a while rather than
    // 120 times a second, and reading them there keeps the two values that
    // change *what a hit does* next to the code that does it.
    // The chase's live subset — M18, on the paddle's pattern below and for the
    // same reason: the milestone is decided by one owner ride, and a knob that
    // is not pushed here cannot move during it. `installLevel` builds a fresh
    // brain and referee on every world swap and replays this method onto them,
    // so a value written to either directly would vanish on the next route.
    //
    // `spawnGapMetres`, `riderHitRadius`, `strikeSpeedCost` and
    // `resultsDelaySeconds` are deliberately absent: each is read at the moment
    // it is used — a spawn, a strike, a finish — which is once in a while
    // rather than 120 times a second, and reading them there keeps the value
    // beside the code it decides.
    this.chaseRun.escapeSeconds = this.tuning.get('CHASE.escapeSeconds');
    this.chaseRun.bustRadiusMetres = this.tuning.get('CHASE.bustRadiusMetres');
    this.chaseRun.strayLimitMetres = this.tuning.get('CHASE.strayLimitMetres');
    this.chaseRun.strayGraceSeconds = this.tuning.get('CHASE.strayGraceSeconds');
    if (this.copBrain !== null) {
      const brain = this.copBrain;
      brain.skill = this.tuning.get('CHASE.copSkill');
      brain.lookaheadSeconds = this.tuning.get('CHASE.lookaheadSeconds');
      brain.steerGain = this.tuning.get('CHASE.steerGain');
      brain.steerDamping = this.tuning.get('CHASE.steerDamping');
      brain.throttleGain = this.tuning.get('CHASE.throttleGain');
      brain.corneringMargin = this.tuning.get('CHASE.corneringMargin');
      brain.brakeSafety = this.tuning.get('CHASE.brakeSafety');
      brain.hazardClearanceMetres = this.tuning.get('CHASE.hazardClearanceMetres');
      brain.swingRangeMetres = this.tuning.get('CHASE.swingRangeMetres');
      brain.swingCooldownSeconds = this.tuning.get('CHASE.swingCooldownSeconds');
      // The brain predicts the cop paddle's forward contact time from the same
      // live values the paddle below receives. If F4 retunes the weapon, a
      // head-on swing must not keep leading against the defaults.
      brain.paddleReachMetres = this.tuning.get('PADDLE.reach');
      brain.paddleWindupSeconds = this.tuning.get('PADDLE.windupSeconds');
      brain.paddleActiveSeconds = this.tuning.get('PADDLE.activeSeconds');
      brain.fieldRangeMetres = this.tuning.get('CHASE.fieldRangeMetres');
    }

    this.paddle.reach = this.tuning.get('PADDLE.reach');
    this.paddle.headRadius = this.tuning.get('PADDLE.headRadius');
    this.paddle.windupSeconds = this.tuning.get('PADDLE.windupSeconds');
    this.paddle.activeSeconds = this.tuning.get('PADDLE.activeSeconds');
    this.paddle.recoverSeconds = this.tuning.get('PADDLE.recoverSeconds');
    this.paddle.startAngle = this.tuning.get('PADDLE.startAngle');
    this.paddle.sweepRadians = this.tuning.get('PADDLE.sweepRadians');
    // The cop's paddle is the same weapon with the same numbers — M18. Two
    // instances because two wielders cannot share one swing state machine, not
    // because the thing they are holding differs.
    this.copPaddle.reach = this.paddle.reach;
    this.copPaddle.headRadius = this.paddle.headRadius;
    this.copPaddle.windupSeconds = this.paddle.windupSeconds;
    this.copPaddle.activeSeconds = this.paddle.activeSeconds;
    this.copPaddle.recoverSeconds = this.paddle.recoverSeconds;
    this.copPaddle.startAngle = this.paddle.startAngle;
    this.copPaddle.sweepRadians = this.paddle.sweepRadians;

    // The audio layer's live subset, pushed the same way. Balance is what M8's
    // exit question is judged on and balance is judged by ear, so the levels
    // that decide it move on F4 while the game is running rather than only in
    // a rebuild. Player volume is a different mechanism entirely and does not
    // come through here (AGENTS.md invariant 5).
    this.audio.setTuning({
      bedTrim: this.tuning.get('AUDIO.bedTrim'),
      motorPolePairs: this.tuning.get('AUDIO.motorPolePairs'),
      motorIdleLevel: this.tuning.get('AUDIO.motorIdleLevel'),
      motorLoadLevel: this.tuning.get('AUDIO.motorLoadLevel'),
      motorSingLevel: this.tuning.get('AUDIO.motorSingLevel'),
      motorAirLevel: this.tuning.get('AUDIO.motorAirLevel'),
      motorLoadBrighten: this.tuning.get('AUDIO.motorLoadBrighten'),
      regenLevel: this.tuning.get('AUDIO.regenLevel'),
      windLevel: this.tuning.get('AUDIO.windLevel'),
      beepLevel: this.tuning.get('AUDIO.beepLevel'),
      tyreLevel: this.tuning.get('AUDIO.tyreLevel'),
      tiltBackLevel: this.tuning.get('AUDIO.tiltBackLevel'),
      duckTiltBack: this.tuning.get('AUDIO.duckTiltBack'),
      swingLevel: this.tuning.get('AUDIO.swingLevel'),
      hitLevel: this.tuning.get('AUDIO.hitLevel'),
      sirenLevel: this.tuning.get('AUDIO.sirenLevel'),
    });

    // Per-surface response, pushed the same way and for the same reason. Only
    // the paths the registry actually exposes are read — a surface with no
    // slider keeps its frozen default, and asking `LiveTuning` for a path it
    // does not know about is an error rather than a silent zero.
    for (const id of SURFACE_IDS) {
      const overrides: Record<string, number> = {};
      for (const field of ['rollingResistance', 'grip', 'roughnessAmplitude'] as const) {
        const path = `SURFACES.${id}.${field}`;
        if (this.tuning.specFor(path) !== undefined) overrides[field] = this.tuning.get(path);
      }
      if (Object.keys(overrides).length > 0) this.controller.setSurfaceResponse(id, overrides);
    }

    // INSPECTION_CAMERA.orbitRate is read in `step` rather than pushed here:
    // it is consumed once per step, so a pushed copy could only ever be stale.
  }

  /**
   * Push the player's options into the systems that answer to them (M9).
   *
   * **This method is the options firewall in practice.** Every line below
   * takes a value out of the options record and hands a *plain number, string,
   * or boolean* to a presentation system. Nothing receives the record, nothing
   * under `simulation/` is called at all, and the controller's own
   * `setTuning` above is untouched by any of it — read the two methods
   * together and the invariant is visible rather than merely asserted
   * (`src/architecture.test.ts` is what makes it enforced).
   *
   * Note what is *absent*: there is no grip, drag, lean, or authority value
   * here, because the ride is not configurable. Two players' wheels behave
   * identically and every tuning conversation stays free of a "with which
   * options?" clause.
   */
  private applyOptions(options: GameOptions): void {
    const previous = this.appliedOptions;
    // **Every push below is guarded, and that is not an optimization.**
    //
    // The options record carries the onboarding's seen flags, so it changes
    // during an ordinary ride — the first time a prompt is satisfied. An
    // unguarded `applyOptions` therefore re-installed the key bindings at that
    // moment, and `KeyboardInput.setBindings` clears held state by design,
    // which cut the throttle from under a rider who was holding it. The
    // symptom was a wheel that hesitated once, a few seconds into somebody's
    // first ride, and nothing anywhere to explain it. Guarding by value is
    // what makes "changing one option touches one system" true rather than
    // merely intended.
    if (previous === null || options.quality !== previous.quality) {
      // Quality: resolution and shadow detail. Both are presentation, and the
      // ride is bit-identical at every setting.
      this.renderer.setQuality(options.quality, this.tuning.get('RENDER.maxPixelRatio'));
    }

    if (
      previous === null
      || options.volumeMaster !== previous.volumeMaster
      || options.volumeSfx !== previous.volumeSfx
      || options.volumeUi !== previous.volumeUi
      || options.volumeMusic !== previous.volumeMusic
    ) {
      this.audio.setVolumes({
        master: options.volumeMaster,
        sfx: options.volumeSfx,
        ui: options.volumeUi,
        music: options.volumeMusic,
      });
    }
    if (previous === null || options.muted !== previous.muted) this.audio.setMuted(options.muted);

    // Rebinding is the data swap `input/bindings.ts` was written for at M1.
    if (previous === null || options.bindings !== previous.bindings) {
      this.keyboard.setBindings(resolveBindings(options.bindings));
    }
    if (previous === null || options.gamepadEnabled !== previous.gamepadEnabled) {
      this.gamepad.setEnabled(options.gamepadEnabled);
      // Disabling never fires `onConnectionChange` — the pad is still on the
      // desk — so the status line is refreshed here as well as on transitions,
      // and the `previous === null` arm doubles as the initial fill (M10 QA,
      // F4: the paragraph was blank until the first connection event).
      this.updateGamepadStatus();
    }
    if (previous === null || options.gamepadDeadZone !== previous.gamepadDeadZone) {
      this.gamepad.setDeadZone(options.gamepadDeadZone);
    }

    if (previous === null || options.touchControls !== previous.touchControls) {
      this.updateTouchControls();
      this.updateTouchStatus();
    }
    if (previous === null || options.touchSwapSides !== previous.touchSwapSides) {
      this.touchControls.setSwapSides(options.touchSwapSides);
    }
    if (previous === null || options.touchScale !== previous.touchScale) {
      // Both halves of the size setting, and they have to move together: the
      // drawn control and the travel it takes to reach full lock. See
      // `TouchInput.setScale`.
      this.touchControls.setScale(options.touchScale);
      this.touch.setScale(options.touchScale);
    }

    if (previous === null || options.fieldOfViewTrim !== previous.fieldOfViewTrim) {
      this.fieldOfViewTrimRadians = THREE.MathUtils.degToRad(options.fieldOfViewTrim);
    }
    if (previous === null || options.speedUnit !== previous.speedUnit) {
      this.hudModel.setSpeedUnit(options.speedUnit);
    }

    // **Guarded, and the guard is the point.** This record is rewritten
    // mid-ride whenever a first-ride prompt is satisfied (`persistSeenPrompts`),
    // so an unguarded push would tear the rider down and rebuild it on the
    // frame the player first brakes. `previous === null` is the boot case,
    // where the rig was already built wearing this character above — so the
    // swap is skipped and only the audio voice is (re)stated.
    if (previous !== null && options.character !== previous.character) {
      this.installCharacter(options.character);
    }
    if (previous === null || options.character !== previous.character) {
      this.audio.setCrashVoice(crashVoiceFor(options.character));
    }

    // The settings screen is always resynced: it diffs every write against
    // what is already in the DOM, and it is the one consumer that has to be
    // correct even for a change it did not originate — `M` toggling mute has
    // to move the checkbox.
    this.menus.sync(options);
    this.appliedOptions = options;
  }

  /**
   * Camera tuning has one writer, so the F4 panel cannot partially overwrite
   * the camera with a stale record.
   */
  private pushCameraTuning(): void {
    this.chase.setTuning({
      distanceAtRest: this.tuning.get('CAMERA.distanceAtRest'),
      distanceAtSpeed: this.tuning.get('CAMERA.distanceAtSpeed'),
      armHeight: this.tuning.get('CAMERA.armHeight'),
      fovAtRest: this.tuning.get('CAMERA.fovAtRest'),
      // The full speed widening stays: it is the strongest speed cue in the
      // game and the owner explicitly retained it when shake was removed.
      fovAtSpeed: this.tuning.get('CAMERA.fovAtSpeed'),
      lookAheadSeconds: this.tuning.get('CAMERA.lookAheadSeconds'),
      yawLagAtRest: this.tuning.get('CAMERA.yawLagAtRest'),
      yawLagAtSpeed: this.tuning.get('CAMERA.yawLagAtSpeed'),
      bankFactor: this.tuning.get('CAMERA.bankFactor'),
      airHeightFollow: this.tuning.get('CAMERA.airHeightFollow'),
      landingDipMax: this.tuning.get('CAMERA.landingDipMax'),
      crashDistance: this.tuning.get('CAMERA.crashDistance'),
    });
  }
}

/**
 * Read one numeric query parameter, or `null` if it is absent or unusable.
 *
 * A query string is the least trustworthy input the game takes — it is typed,
 * pasted, and shared — so a missing parameter, a word, an empty value, an
 * infinity and a `NaN` all have to land on the same "as if it were not there"
 * rather than on a tuning value of `NaN`, which would silently poison every
 * step downstream of it. Anything real is clamped into range instead of being
 * rejected, because a player who types 5 into a 0..1 field means "on".
 */
function readNumberParam(
  params: URLSearchParams,
  name: string,
  min: number,
  max: number,
): number | null {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

/** Which menu each application state puts on screen. */
/**
 * Which recording a rider crashes with.
 *
 * A one-line map rather than the id being passed straight through, because the
 * two vocabularies are allowed to differ: `audio/` declares its own
 * `CrashVoiceId` so it owes nothing to `data/` and stays runnable under
 * `node --test` with no bundler, and two riders could legitimately end up
 * sharing a voice without either type moving.
 */
function crashVoiceFor(id: CharacterId): CrashVoiceId {
  return characterSpec(id).crashVoice;
}

/**
 * The escaping rider, as the one thing the cop's paddle can hit — M18.
 *
 * **This is the second implementer `simulation/paddle.ts` was written for.**
 * Its one-entry sphere set plugs into the same generic swept query as
 * `TargetField`; choosing a mirrored swing side changes the path the generic
 * paddle takes, never what kind of thing it is allowed to hit.
 *
 * One volume, moved rather than rebuilt, because there is exactly one quarry
 * and it is somewhere different every step. `live` is what makes the set empty
 * while the rider is down: a cop flailing at a crashed rider on the ground is
 * both unpleasant and pointless — the run is either already over or the strike
 * would land on somebody who cannot answer it.
 */
class RiderTarget implements HittableSet {
  private readonly volume: HittableVolume & { x: number; y: number; z: number; radius: number } = {
    id: 'rider', x: 0, y: 0, z: 0, radius: CHASE.riderHitRadius,
  };
  private live = false;

  /** Put it where the rider is. `live` false empties the set for this step. */
  place(x: number, y: number, z: number, radius: number, live: boolean): void {
    this.volume.x = x;
    this.volume.y = y + CHASE.riderHitHeight;
    this.volume.z = z;
    this.volume.radius = radius;
    this.live = live;
  }

  eachNear(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    visit: (volume: HittableVolume) => void,
  ): void {
    if (!this.live) return;
    const { volume } = this;
    // The same bounds-grown-by-radius comparison `TargetField` makes, without
    // the grid: one volume needs no broadphase, and the box the paddle hands in
    // is already grown by the head's own radius.
    if (volume.x + volume.radius < minX || volume.x - volume.radius > maxX) return;
    if (volume.y + volume.radius < minY || volume.y - volume.radius > maxY) return;
    if (volume.z + volume.radius < minZ || volume.z - volume.radius > maxZ) return;
    visit(volume);
  }
}

function menuScreenFor(state: AppStateId): MenuScreen {
  if (state === 'title') return 'title';
  if (state === 'paused') return 'pause';
  if (state === 'settings') return 'settings';
  if (state === 'results') return 'results';
  if (state === 'routes') return 'routes';
  if (state === 'riderSelect') return 'riders';
  return 'none';
}
