/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import {
  INSPECTION_CAMERA, AUDIO, CAMERA, CHALLENGE, CHASE, CONTACT, EUC, INPUT, RIDER, TARGET, WHEEL,
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
  type PlayableCharacterId,
} from '../data/riders.ts';
import {
  ChaseCamera,
  copyChaseCameraState,
  createChaseCameraState,
  createChaseCameraView,
  lerpChaseCameraState,
  resolveChaseView,
  type ChaseCameraInput,
  type OcclusionProbe,
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
import {
  InputRouter,
  KEYBOARD_DEVICE,
  padDeviceId,
  padIndexOf,
  type DeviceId,
} from '../input/inputRouter.ts';
import type { RiderSource } from '../input/riderSource.ts';
import type { CameraMode, RiderSeat } from './seats.ts';
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
import { spawnSlot } from '../simulation/spawnSlots.ts';
import { ContactPair, type ContactBody, type ContactTuning } from '../simulation/contact.ts';
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
  createSpineSample,
  type SpineLocation,
  type SpineSample,
} from '../simulation/routeSpine.ts';
import { ChaseRecordsStore, type ChaseRecord } from './chaseRecords.ts';
import { PlanTerrainSampler, paintedSurfaces } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { AudioEngine, type AudioSnapshot, parseLatencyHint } from '../audio/AudioEngine.ts';
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
  TrackDayRun,
  type TrackDayEvent,
  type TrackDaySessionResult,
  type TrackDayState,
} from '../simulation/trackDay.ts';
import {
  GhostPlayer,
  GhostRecorder,
  createGhostSample,
  decodeGhost,
  encodeGhost,
  type GhostSample,
} from '../simulation/ghost.ts';
import { Hud } from '../ui/hud.ts';
import {
  HudModel,
  formatDelta,
  formatRunTime,
  formatSpeed,
  type HudView,
  type LapFlash,
} from '../ui/hudModel.ts';
import {
  Menus,
  type CouchSeatView,
  type CouchSpare,
  type MenuScreen,
  type ResultsRow,
  type ResultsView,
  type RoutePurpose,
  type RouteStatus,
} from '../ui/menus.ts';
import { COUCH_SEATS, couchEligible, cycleGuest, guestBeside } from './couch.ts';
import { loudestWarning, nearestCutout, type RiderWarningState } from './riderMix.ts';
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
/**
 * Re-exported from `app/seats.ts`, where it moved at M25 Phase 3 — a camera
 * mode became a property of a seat the moment `cameraCycle` acted per seat.
 * The name stays here because that is where every reader has always found it.
 */
export type { CameraMode };

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
   * Which device drives which seat — M25 Phase 4.
   *
   * `devices[seat]` is what is holding that seat, `null` for a seat nothing
   * has claimed **and** for one whose pad has gone: the two look identical to
   * a panel drawing a card, and `awaiting` is what tells them apart. On the
   * bridge because claim-by-press is a *device* fact with no DOM of its own
   * until Phase 5 builds the panel, so this is the only way a spec can prove
   * a pad claimed the seat it meant to.
   */
  readonly input: {
    readonly claiming: boolean;
    readonly devices: readonly (DeviceId | null)[];
    /** The seat whose device went missing and is being held for it. */
    readonly awaiting: number | null;
    /** How many usable pads the pad layer is currently reading. */
    readonly pads: number;
  };

  /**
   * The couch session — M25 Phase 5.
   *
   * On the bridge because all three answers are decisions rather than DOM:
   * whether this machine may be offered the mode, whether the join panel would
   * let go, and who the guest is going to be. The last one especially — the
   * guest's character is session state that deliberately never reaches
   * `GameOptions`, so a spec that could only read the options record could not
   * see it at all, and q68's rule would be unobservable from here exactly as it
   * was from `installedCharacter` before Phase 2 gave the seat its own field.
   */
  readonly couch: {
    /** Whether the title is offering the entrance. See `app/couch.ts`. */
    readonly available: boolean;
    /** Whether every seat is held, which is what arms Start. */
    readonly ready: boolean;
    /** Who seat 1 will ride as. Never written to the options record. */
    readonly guest: PlayableCharacterId;
  };

  /**
   * Rider-to-rider contact — M26 Phase 1 (§26.3).
   *
   * Two booleans that answer different questions on purpose. `enabled` is the
   * couch session's own setting — default on, never a `GameOptions` field, and
   * what Phase 2's join-panel toggle writes. `live` is `Game.contactLive`: the
   * one expression the fixed step actually reads, which is `enabled` **and** a
   * pair of seats to test. Single player reports `enabled: true, live: false`,
   * which is the honest description of a setting with nothing to apply to.
   */
  readonly contact: {
    /** What the room asked for. Session state; never saved. */
    readonly enabled: boolean;
    /** Whether the fixed step is resolving a pair. `Game.contactLive`. */
    readonly live: boolean;
  };

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
   * The track day, as the referee has it — M23.
   *
   * On the bridge in full for `challenge`'s reason: a lap's *rules* are what a
   * browser spec has to assert — that a lap counted, that a cut one did not,
   * that the clock restarted on the line — and its appearance is a separate
   * question asked separately. `available` is a property of the loaded plan
   * rather than of the state, so a spec can assert that the city declines to be
   * lapped without entering anything.
   */
  readonly trackDay: TrackDayState & {
    readonly available: boolean;
    /** Lap length along the centreline, metres. Zero on a world with no lap. */
    readonly lapMetres: number;
    /** Samples the ghost recorder has kept for the lap in progress. */
    readonly recordedSamples: number;
    /**
     * Whether the ghost being raced is on screen this frame.
     *
     * Read off the renderer's own one-rider slot rather than from a flag this
     * file keeps, so a spec asserting "the ghost restarts on the line" is
     * asserting what is drawn rather than what was intended.
     */
    readonly ghostVisible: boolean;
    /** The finished session's best lap, or null while none has finished. */
    readonly sessionBest: number | null;
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

  /**
   * The controller named in that last paragraph moved to `seats[0].controller`
   * at M25 Phase 1 (docs/PLANS.md §25.5). Nothing about the argument changed:
   * `installLevel` rebuilds one per seat from the new plan, because a
   * controller outliving its plan carries the last route's hazards into this
   * one's road. See `app/seats.ts`.
   *
   * **The name survives here as a seat-0 alias on purpose**, on exactly the
   * argument `setActions`/`snapshot` keep theirs below: `tests/m20.spec.ts`
   * casts the game to `{ controller, copController, copBrain }` and compares
   * the player's `derivedTopSpeed` against the cop's. A cast reaches past the
   * compiler, so deleting this property would fail that spec at *runtime*,
   * with a message about `undefined`, and the phase's "zero spec edits" gate
   * would have been met by breaking a spec instead of by keeping it.
   */
  get controller(): EucController {
    return this.seats[0].controller;
  }

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
  /**
   * The lap referee — M23, and `challenge`'s sibling in every respect above.
   *
   * Public and mutable for the same two reasons: a browser spec asserts the
   * *rules* rather than the pixels, and a world swap replaces it because the
   * circuit it refereed no longer exists. It shares `records` with the timed
   * run, because a personal best is a personal best and the store is keyed by
   * the plan id rather than by the mode — the two can never collide, since a
   * plan is either a route or a lap and never both.
   */
  trackDay: TrackDayRun;
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
   * They differ in lifetime, and at M25 Phase 1 they differ in *owner* too.
   * `Paddle` holds no world — it is arithmetic about an arm — but it does
   * belong to whoever is swinging it, so it moved onto the seat
   * (`seats[0].paddle`): built once with the seat, retuned by F4, told to
   * `cancel()` when that rider teleports. `TargetField` *is* a world, stays
   * here, and is rebuilt with the sampler, the controllers and the referee on
   * every `installLevel` — one field of targets for every seat, because two
   * riders share one world.
   */
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
  /** Scratch for the HUD's "which way is the route" arrow (M20). Allocation-free. */
  private readonly spineSample: SpineSample = createSpineSample();
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
  /**
   * The world's potholes and its shrubs, built once per world and handed to
   * every rider in it — M25 Phase 2.
   *
   * They were built per controller until a second rider existed, which was
   * correct while "per controller" and "per world" meant the same thing. Both
   * classes are immutable spatial indexes over the plan, so one pair for
   * everybody is an allocation saved and, more to the point, is the type
   * system agreeing with §25.5's "both riders rustle the same bush".
   *
   * Rebuilt with the sampler and the referees on a world swap, and for the
   * same reason they always were: a hazard field outliving its plan puts the
   * last route's potholes in this one's road.
   */
  private hazards: HazardField;
  private softBodies: SoftBodyField;
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
   * Which rider the rig in the scene is actually wearing.
   *
   * Written only where the rig is built, so it cannot drift from the geometry
   * the way a value copied out of the options record could.
   */
  private installedCharacter: CharacterId = DEFAULT_CHARACTER;
  private readonly actionState: ActionState;
  /**
   * The seats — M25 Phases 0 and 1 (docs/PLANS.md §25.5).
   *
   * Seat 0 is the player. Phase 0 routed every per-seat *read* of intent
   * through `seats[0].source`; **Phase 1 moved the rider itself** — the
   * controller, the three poses, the rig, the paddle and its head, the
   * one-shot counters and the throttle/steer/crash edge flags — off this
   * class and into the seat, and extracted the two slices that are per-rider
   * rather than per-frame: `stepSeat` and `renderSeat`. The rest of this file
   * still says `seats[0]` at the sites that are genuinely about the player,
   * which is the honest spelling: in stage 1 the referees, the records, the
   * chase and the HUD are seat 0's and no other's.
   *
   * Device wiring, the QA bridge's scripted writes, and the layout-change
   * reset stay on the concrete `actionState` on purpose: lifecycle is not a
   * seat concern (§25.3), and moving those too would put a router in this
   * class that Phase 4 builds elsewhere.
   *
   * **Phase 2 made the array grow.** `spawnSecondRider` pushes a seat and
   * `despawnSecondRider` pops it, both reachable only from the QA bridge; the
   * step and the render frame iterate this array in index order, which is what
   * keeps `advance(n)` deterministic with more than one rider in the world.
   * **Phase 3 made the frame grow with it**: the render loop draws one pass
   * per seat, so the array's length is the number of views on the screen.
   * Everything that still says `seats[0]` says it because the thing it is
   * about — the audio mix, the saved options record, the referees, the chase
   * — is genuinely the world's rather than a rider's, and each of those sites
   * says which.
   */
  private readonly seats: RiderSeat[];
  /**
   * Which device drives which seat, and every seat's concrete input object —
   * M25 Phase 4 (docs/PLANS.md §25.5).
   *
   * **Deliberately beside the seats rather than on them.** A `RiderSeat` holds
   * a `RiderSource`, which is `sample` + `consume` and nothing else (§25.3);
   * writing a scripted value, clearing a device, deciding where a pad's
   * carving lands — all of that is *lifecycle*, and this is where lifecycle
   * lives. Phases 0 to 3 held it as a bare `ActionState[]` with a comment
   * saying Phase 4 would replace it; this is that replacement, and the array
   * is now inside `InputRouter` where the claims can see it.
   *
   * Seat 1's entry is an `ActionState` no device is wired to until one claims
   * it, which makes it a scripted source by construction rather than by a new
   * class: `setScripted` is the only thing that writes it in a QA session, and
   * `sample`/`consume` behave exactly as they do for the player either way.
   */
  private readonly router: InputRouter;
  /**
   * Whether any seat asked to pause this tick, and whether any asked to mute
   * — M25 Phase 4's any-seat-once aggregation (§25.9).
   *
   * Fields rather than locals threaded through `stepSeat`'s return, because
   * the two answers are the *tick's* and not a rider's: what they record is
   * "somebody pressed it", and the whole point is that it does not matter who
   * or how many. Cleared at the top of every step, so a claim can never
   * outlive the tick that made it.
   */
  private pauseAsked = false;
  private muteAsked = false;

  // -- Rider contact (M26 Phase 1) -------------------------------------------

  /**
   * The one unordered seat pair, and its edge — M26 Phase 1 (§26.3).
   *
   * **One `ContactPair` for one pair, held across steps, because the whole
   * mechanic is a piece of state**: the edge and the cooldown are what stop a
   * merged pair being punished on every one of the 120 steps a second they
   * spend overlapping. A pair rebuilt per step would be the cheap version
   * §25.6 retracted, wearing the new file's name.
   *
   * Stage 1 has two seats, so one pair covers them. A third seat is three
   * pairs and this becomes a keyed collection; it is deliberately not one
   * today, because a collection with one entry hides which rule decides pair
   * identity — and `contactLive` is where that decision is written down.
   */
  private readonly contactPair = new ContactPair();
  /**
   * Is contact on for this session? — §26.3, q71/q72. **Default on.**
   *
   * **Session state on `Game`, never a `GameOptions` field**, and the reason
   * is invariant 5 rather than convenience: a contact switch is a *physical*
   * quantity, and "no option is a physical quantity, so the ride is identical
   * for every player" is exactly the rule that keeps the options store out of
   * `simulation/`. It is held here on `guestCharacter`'s terms — a property of
   * the couch session, chosen by the room, forgotten when the room goes home.
   *
   * **Reachable from the QA bridge and nothing else in this phase**, on
   * `spawnSecondRider`'s discipline: no URL parameter, no menu, no option, on
   * purpose. Phase 2 gives it the join panel's toggle, and with it q81's
   * "resets to on at every session" — which needs a session boundary to reset
   * at, and the panel is what defines one.
   */
  private contactEnabled = true;
  /**
   * The live values one contact resolution reads, refilled every step.
   *
   * **Filled from `LiveTuning` rather than left to `ContactPair.step`'s
   * default, and that is the whole point of the field.** The default is the
   * frozen `CONTACT` group from `data/tuning.ts`; `LiveTuning.set` writes into
   * its own override map and never mutates that group, so a caller that takes
   * the default rides boot-time constants and the four `LIVE_TUNABLES` entries
   * do nothing at all — with every test still green, and the Phase 2 ride
   * gate, whose entire purpose is tuning this feel at F4, silently untunable.
   * `CHASE.strikeSpeedCost` is read at its use site for the same reason.
   *
   * One mutable struct rather than an object literal per step: at 120 Hz a
   * literal here is 120 short-lived objects a second, which is the shape of
   * garbage that shows up months later as an unexplained periodic hitch.
   */
  private readonly contactTuning: { -readonly [K in keyof ContactTuning]: ContactTuning[K] } = {
    radiusMetres: CONTACT.radiusMetres,
    cooldownSeconds: CONTACT.cooldownSeconds,
    separationSpeed: CONTACT.separationSpeed,
    speedCost: CONTACT.speedCost,
  };
  /**
   * The two bodies handed to the pair, filled in place from the seats' poses.
   *
   * Scratch for the same reason as `copView` and `spineSample`: this runs in
   * the fixed step and allocating here is allocating in the frame loop.
   */
  private readonly contactBodies: { -readonly [K in keyof ContactBody]: ContactBody[K] }[] = [
    { x: 0, z: 0, velocityX: 0, velocityZ: 0 },
    { x: 0, z: 0, velocityX: 0, velocityZ: 0 },
  ];

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
   * Whether a mouse, trackpad or stylus exists — M25 Phase 5.
   *
   * **`any-pointer`, not `pointer`, and the Phase 5 QA pass caught the
   * difference.** `(pointer: fine)` asks about the machine's *primary*
   * pointer, so a touchscreen laptop — coarse primary, fine trackpad —
   * answers no, and that is precisely the hybrid machine §25.9 said must not
   * lose the mode. The question the entrance actually wants is whether a
   * precise pointer exists at all, which is what `any-pointer` answers.
   *
   * **Its own query rather than `!coarsePointer.matches`**, because those are
   * different questions and a machine can answer no to both: a TV browser
   * driven entirely by a pad has no pointer at all. A negated coarse query
   * would answer yes for that television and offer a two-player panel to a
   * device with one d-pad.
   */
  private readonly finePointer: MediaQueryList | null;
  /**
   * Whether a usable gamepad has been seen at any point this session — M25
   * Phase 5, and the second half of `couchEligible`.
   *
   * **Sticky, and `Game`'s rather than the pad layer's.** `GamepadInput`
   * answers "is one connected right now", which is the wrong question for an
   * entrance: a pad that was plugged in a minute ago is evidence that this
   * machine has pads, and hiding the button the moment somebody's battery
   * dies would take the mode away from exactly the session that was about to
   * use it. Switching pads off in the settings screen does not clear it
   * either, for the same reason it does not clear the memory of the pad.
   */
  private padEverSeen = false;
  /** The last answer `updateCouchAvailable` computed. See it for why. */
  private couchAvailable = false;
  /**
   * Who the guest is going to be — M25 Phase 5, and **session state**.
   *
   * The one player-visible choice in this game that is deliberately never
   * saved. `GameOptions.character` answers "who does the person whose browser
   * this is ride as"; the guest is somebody else's answer, on somebody else's
   * evening, and writing it down would mean the owner's own rider silently
   * changed the next time they opened the game alone. The same firewall keeps
   * a guest's first-ride prompts out of `seenPrompts` (`app/seats.ts`).
   *
   * Held here rather than on the seat because it outlives the seat: the panel
   * lets both players pick before anybody is spawned, and the choice has to
   * survive Back and a second visit within one session.
   */
  private guestCharacter: PlayableCharacterId = guestBeside(DEFAULT_CHARACTER);
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

  private readonly menus: Menus;
  /**
   * Which device's names the first-ride prompts use **when nothing has been
   * claimed** — the machine-wide answer.
   *
   * It answers "what has this room been seen using", which is the only answer
   * available in a single-player session: the keyboard, the pad and the
   * touchscreen all cooperate on seat 0, so the prompts name whichever was
   * last picked up. **A claimed seat has a better answer** and
   * `promptDeviceFor` uses it — the reason this field's own note said Phase 4
   * would be where a device starts belonging to a seat.
   */
  private promptDevice: PromptDevice = 'keyboard';

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

  // -- Track Day — M23 --------------------------------------------------------

  /**
   * The lane flash the HUD is currently showing, latched from the fixed step.
   *
   * `pendingSplit`'s counterpart, and separate from it rather than shared
   * because a lap has three things to announce where a timed run has one: a
   * sector, a lap that counted, and a lap that did not. The union is composed
   * into words by `ui/hudModel.ts`, which is where every other string on the
   * HUD is composed.
   */
  private pendingLapFlash: LapFlash | null = null;
  /** The most recent finished session, for the results card and the bridge. */
  private lastTrackDay: TrackDaySessionResult | null = null;
  /** Whether that session's best lap was actually kept by the store. */
  private lastTrackDayWasRecord = false;
  /** Whether the store had to drop the ghost to fit that lap in. */
  private lastTrackDayGhostDropped = false;
  /**
   * The split table standing *before* the session, for the card's per-sector
   * deltas.
   *
   * `lastResultPreviousSplits` for laps, captured on the same argument and
   * against the same failure: by the time the card is built the store has been
   * given the new best, so re-reading it would compare a record lap with itself
   * and print a column of zeroes under a summary line correctly reading several
   * seconds faster.
   *
   * **Captured when the session's first record lands, not when it ends**, which
   * is the one place the two differ. A track day can beat the stored best four
   * times in an afternoon; the table worth comparing against on the card is the
   * one the player arrived with.
   */
  private lastTrackDayPreviousSplits: readonly number[] = [];

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
   * A scripted camera obstruction, or `null` for the level's own geometry.
   *
   * Every seat's camera reads through it, because it is a QA affordance about
   * the *world* rather than about a rider (see `setOcclusion`).
   */
  private scriptedOcclusion: number | null = null;

  /** Scratch for the pedal-strike spark origin. Filled in place, never held. */
  private readonly strikePoint = new THREE.Vector3();


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
    // Bound to seat 0's live counter map in the constructor, once, by
    // reference — the seats do not exist yet at field-initialiser time.
    consumed: {},
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
    this.hazards = new HazardField(this.levelPlan.hazards ?? []);
    this.softBodies = new SoftBodyField(this.levelPlan.softBodies ?? []);
    // A local rather than a field, because it is about to become seat 0's and
    // the seat cannot be built until the rig below exists — M25 Phase 1.
    const controller = new EucController(this.terrain, {
      spawn: this.levelPlan.spawn,
      hazards: this.hazards,
      softBodies: this.softBodies,
    });

    // The referee reads the same plan the sampler and the renderer do, which is
    // invariant 2 arriving at its third consumer: a checkpoint is authored
    // once, detected from that authoring, and drawn from that authoring, so a
    // gate cannot be somewhere different for the player than for the clock.
    // The proving ground carries no checkpoints and `available` is false there,
    // which is what keeps the time trial off a level that is a measuring
    // instrument rather than a place.
    this.challenge = new ChallengeRun(this.levelPlan.id, this.levelPlan.checkpoints);
    // And the lap referee beside it — M23. Same plan, same gates, different
    // question: `ChallengeRun` asks whether a route can start and stop and
    // `TrackDayRun` asks whether it closes on itself, so exactly one of them
    // says yes about any world and neither needs to know which world it is.
    this.trackDay = new TrackDayRun(
      this.levelPlan.id,
      this.levelPlan.checkpoints,
      this.levelPlan.lap ?? null,
    );
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
    const rig = createRidingRig(
      riderLook(this.installedCharacter),
      machineLook(machineForCharacter(this.installedCharacter)),
    );
    this.renderer.scene.add(rig.group);
    this.renderer.setCharacter(this.installedCharacter);

    // **Seat 0, and everything the player used to be** — M25 Phase 1
    // (docs/PLANS.md §25.5). Built here rather than beside the other input
    // objects below because a seat holds the controller and the rig, and both
    // of those are the world's and the character's rather than the device's.
    // `syncPoses()` at the end of this block is the first thing that reads it.
    this.actionState = new ActionState();
    // The router owns every seat's input from here on — M25 Phase 4. Seat 0's
    // state is the shared one the keyboard, the pad and the touchscreen all
    // cooperate on, which is what makes "no claims" the single-player game
    // rather than a mode the router has to check for.
    this.router = new InputRouter(this.actionState, {
      onKeyboardSeat: (state, rides) => {
        this.keyboard.setSink(state);
        // The other half of `sinkForPad`'s rule, finally applied to the device
        // it was always missing from — M25 Phase 5 QA.
        this.keyboard.setSpectating(!rides);
      },
      onClaimsChange: () => {
        this.updateGamepadStatus();
        // The join panel is the other reader of the same fact. One producer,
        // two writers, and neither is polled — a card that lit up a frame late
        // is a player who pressed their button twice.
        this.updateCouchPanel();
      },
    });
    this.seats = [this.createSeat(
      this.router.sourceFor(0),
      controller,
      rig,
      this.installedCharacter,
      this.options.current.seenPrompts,
    )];
    // A live reference, captured once, exactly as the field initialiser used
    // to capture it: the overlay reads whatever the counters currently say.
    this.debugContext.consumed = this.seats[0].consumed;

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
    // **Every seat's camera, not one camera** — M25 Phase 3. Each seat built
    // its own `ChaseCamera` in `createSeat`; this is where they learn what
    // they can be hidden behind. A loop rather than a line, so a seat added
    // later gets the same wiring from `spawnSecondRider` instead of a camera
    // whose arm pulls in against nothing.
    this.wireSeatCameras();
    this.syncPoses();

    this.profiler = new FrameProfiler();
    this.overlay = new DebugOverlay();
    this.panel = new TuningPanel(this.tuning);

    // The HUD, the menus, and the first-ride prompts (M9). The pause card that
    // `ui/notice.ts` carried since M1 is gone, replaced by the real pause
    // menu, exactly as that file's own header said it would be; the
    // context-loss panel below it stays, because it is stability tooling
    // rather than a placeholder.
    // Seat 0's HUD, in its own container — M25 Phase 3. The model and the
    // prompts were built with the seat; this is the DOM half, mounted here
    // because the document belongs to the composition root.
    this.mountSeatHud(this.seats[0]);
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
        // -- M23 ---------------------------------------------------------
        onStartTrackDay: () => this.enterTrackDay(),
        onEndSession: () => this.endTrackDaySession(),
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
          else if (this.lastTrackDay !== null) this.enterTrackDay();
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

        // -- M20 -------------------------------------------------------------
        onNewRoute: () => this.newRouteHere(),

        // -- M14.5 -----------------------------------------------------------
        // Opening the panel is what retires its advertisement, and it is
        // written here rather than in `ui/` because this is where the record
        // lives — the same reason picking a rider goes straight into the store
        // below. `set` is a no-op once the flag is true, so this costs one
        // comparison on every later visit and never writes again.
        onOpenRiders: () => {
          this.options.set({ seenRiderChooser: true });
          this.goTo('riderSelect');
        },
        onCloseRiders: () => this.goTo('title'),
        // Straight into the store, exactly like every other player choice: the
        // swap happens in `applyOptions`, so the one path that changes a rider
        // is the one path that persists it. A method that swapped the rig here
        // and wrote the option afterwards would be two sources of truth for who
        // is on the wheel.
        onPickRider: (id) => this.options.set({ character: id }),

        // -- M25 Phase 5 -----------------------------------------------------
        // Four buttons, four transitions, and no session teardown here: what a
        // couch session costs on the way in and gives back on the way out is
        // `enterState`'s, because this panel has four exits and only one of
        // them is a button on it.
        onOpenCouch: () => this.goTo('couchJoin'),
        onCloseCouch: () => this.goTo('title'),
        onStartCouch: () => this.startCouch(),
        onCycleCouchRider: (seat, delta) => this.cycleCouchRider(seat, delta),
        // M26 Phase 2. The same setter the QA bridge calls, because "the room
        // turned contact off" is one fact with one writer however it arrived.
        onSetCouchContact: (enabled) => this.setContactEnabled(enabled),
      },
      seedMaxLength: MAX_SEED_LENGTH,
    });
    this.menus.setPersistenceWarning(this.options.persistent);
    // The `New route` buttons introduce themselves at boot rather than on first
    // press — M20. Their note is the sentence that tells a player other courses
    // exist at all, which is the whole feature, and a control whose explanation
    // only appears after it has been used explains nothing.
    this.menus.setNewRouteStage('idle');
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
      //
      // **Every seat, not only the keyboard's** — M25 Phase 4. The keyboard
      // layer clears its own sink; focus leaving the window is the *world's*
      // event, so a pad-driven rider must not come back from a tab switch
      // still holding the throttle the browser stopped reporting.
      onInputReset: () => {
        this.router.clearAll();
        this.loop.resetTime();
      },
      onClaimPress: () => this.claimSeatFor(KEYBOARD_DEVICE),
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
      onMenuAction: (action, padIndex) => this.handleMenuAction(action, padDeviceId(padIndex)),
      // The status line's fourth state: a pad the browser reports without the
      // standard mapping is a fact the player can act on (another browser, a
      // different connection), where "searching" reads as "plug one in".
      onUnusablePad: () => this.updateGamepadStatus(),
      // **Where each pad's carving lands** — M25 Phase 4. With nothing
      // claimed this resolves to exactly what M9 shipped; a couch session is
      // a session that has made claims, not a flag either side checks.
      routing: this.router,
      onPadChange: (index, present) => {
        // A pad arriving is evidence this machine has pads, which is half of
        // whether it may be offered a couch — and the flag is sticky, so the
        // entrance does not blink out when a battery dies (`padEverSeen`).
        if (present && !this.padEverSeen) {
          this.padEverSeen = true;
          this.updateCouchAvailable();
        }
        if (!present) this.onPadLost(index);
      },
      onClaimPress: (index) => this.claimSeatFor(padDeviceId(index)),
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
    this.finePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(any-pointer: fine)')
      : null;
    this.finePointer?.addEventListener('change', this.onPointerKindChange);
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
    this.stopStateListener = this.appState.onChange((to, from) => this.enterState(to.id, from.id));
    this.applyTuning();
    this.applyOptions(this.options.current);
    this.enterState(this.appState.current);

    // Measure once before the first frame so a boot that lands before layout
    // does not draw one frame through a degenerate projection.
    this.renderer.resize();
    // **After that measure and not before it** — M25 Phase 5. The entrance
    // predicate is a question about the canvas's width, and a canvas that has
    // not been measured is zero pixels wide, so asking earlier hides the button
    // on every machine until the first resize happens to change something.
    this.updateCouchAvailable();
  }

  /**
   * Assemble one seat — M25 Phase 1 (docs/PLANS.md §25.5).
   *
   * **The composition root composes.** `app/seats.ts` is types only and
   * constructs nothing, so this is the single place a seat's preallocated
   * poses, paddle, head vector and counter map come into existence. Phase 2
   * calls it a second time; nothing else in this file may build a seat
   * literal, or the two seats will differ in the field somebody forgot.
   *
   * The three things a seat cannot make for itself are handed in, because
   * each belongs to a different owner: the **source** is the device layer's,
   * the **controller** is the world's (rebuilt by `installLevel`), and the
   * **rig** is the character's (rebuilt by `installCharacter`) — with the id
   * that rig was built from beside it, so the two cannot drift.
   */
  private createSeat(
    source: RiderSource,
    controller: EucController,
    rig: RidingRig,
    character: CharacterId,
    seenPrompts: readonly string[],
  ): RiderSeat {
    const hudModel = new HudModel({ speedUnit: this.options.current.speedUnit });
    return {
      source,
      controller,
      rig,
      character,
      previousPose: createPose(),
      currentPose: createPose(),
      renderPose: createPose(),
      paddle: new Paddle(),
      paddleHead: new THREE.Vector3(),
      // Every `PressedAction` needs a zero — see the note in `app/seats.ts`.
      // A missing key makes `consumed[action] += 1` evaluate `undefined + 1`,
      // which compiles, yields `NaN`, and survives the harness's `?? 0`.
      consumed: {
        hop: 0,
        swing: 0,
        reset: 0,
        cameraCycle: 0,
        pause: 0,
        muteAudio: 0,
      },
      lastThrottle: 0,
      lastSteer: 0,
      wasCrashed: false,

      // -- The seat's half of the screen — M25 Phase 3 -----------------------

      // Its own camera, with its own second of accumulated lag. The occlusion
      // probe and the F4 tuning are pushed in by `installLevel` and
      // `applyTuning`, which loop every seat — a camera wired here from a
      // level that may be replaced would answer the *last* route's geometry.
      chase: new ChaseCamera(),
      previousCamera: createChaseCameraState(),
      currentCamera: createChaseCameraState(),
      renderCamera: createChaseCameraState(),
      chaseView: createChaseCameraView(),
      chaseInput: {
        x: 0,
        y: 0,
        z: 0,
        headingY: 0,
        rollAngle: 0,
        speed: 0,
        groundY: 0,
        airborne: false,
        crashed: false,
      },
      cameraMode: 'chase',
      orbitAngle: 0,
      previousOrbitAngle: 0,

      // The HUD's *model* is built here; the DOM it drives is mounted
      // separately by `mountSeatHud`, because a second `.euc-hud` in the
      // document is only correct while a second rider is in the world.
      hud: null,
      hudModel,
      // **Seat 0 resumes the saved sequence; everybody else starts fresh.**
      // The player finished these prompts months ago and a guest on the couch
      // did not — and the guest's progress is session state that must never
      // reach the saved record (`persistSeenPrompts`).
      //
      // Handed in rather than decided here, and not only for clarity: this
      // factory builds seat 0 *before* `this.seats` exists, so anything that
      // reasoned about the seat count would read `undefined` at boot.
      onboarding: new Onboarding(seenPrompts),
      // Primed rather than left undefined: `snapshotFor` may be asked for this
      // seat before a frame has drawn it, and a HUD reading of `undefined` is
      // an automation wire that reports a bug it does not have.
      hudView: hudModel.update(0, {
        speed: 0,
        powerStage: 'normal',
        overspeed: 0,
        tiltBack: 0,
        offCourse: false,
        crashed: false,
      }),
      hudPrompt: null,
      hoppedSinceHudUpdate: false,
    };
  }

  /**
   * Give a seat its own HUD, in its own half of the screen — M25 Phase 3.
   *
   * The DOM is mounted here rather than in `createSeat` because the document
   * is the composition root's business and because a HUD's *lifetime* is the
   * seat's half of the screen rather than the seat's model. Each seat's HUD
   * lives inside its own container, and `game.css` owns what a container means
   * — `Hud` itself still only writes text, toggles `hidden`, and sets one data
   * attribute (`DESIGN.md`).
   */
  private mountSeatHud(seat: RiderSeat): void {
    const index = this.seats.indexOf(seat);
    const container = document.createElement('div');
    container.className = 'euc-hud-seat';
    container.dataset.seat = String(index);
    // **The container must not take clicks.** It covers the whole viewport in
    // single-player and half of it in a split, so without this it would sit
    // between the player and the canvas — the exact failure `m9.spec.ts`'s
    // `elementFromPoint` check exists to catch.
    container.dataset.split = 'false';
    document.body.appendChild(container);
    seat.hud = new Hud({
      parent: container,
      onDismissPrompt: () => this.dismissPromptFor(seat),
    });
    seat.hud.setVisible(this.appState.spec.showsHud);
    this.applySplitLayout();
  }

  /**
   * Take a seat's HUD off the screen and out of the document.
   *
   * The container goes with it, so a dismissed rider leaves no `.euc-hud-seat`
   * behind — which is what keeps a Playwright locator naming either class
   * resolving to exactly as many elements as there are riders.
   */
  private unmountSeatHud(seat: RiderSeat): void {
    const hud = seat.hud;
    if (hud === null) return;
    const container = hud.root.parentElement;
    hud.dispose();
    seat.hud = null;
    if (container !== null && container.classList.contains('euc-hud-seat')) {
      container.remove();
    }
    this.applySplitLayout();
  }

  /**
   * Tell every HUD container which half of the screen it is, or that there are
   * no halves — M25 Phase 3.
   *
   * **One data attribute, and the stylesheet owns every consequence of it** —
   * the idiom `Hud.setTouchLayout` established and that `DESIGN.md` states as
   * a rule. In particular the halves' geometry is keyed off this attribute and
   * never off a viewport media query: an `@media (max-width: 34rem)` rule
   * still measures the whole window, which is desktop-wide even when each pane
   * is 500 px, so the lane collision that rule exists to prevent would come
   * back inside both halves with every test still green.
   */
  private applySplitLayout(): void {
    const split = this.seats.length > 1;
    for (let index = 0; index < this.seats.length; index += 1) {
      const hud = this.seats[index].hud;
      if (hud === null) continue;
      hud.setSplit(split ? (index === 0 ? 'left' : 'right') : null);
    }
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
    // `?audiolatency=playback` — the Ubuntu Chrome wind diagnosis, on
    // `?wobble=`'s exact terms: the machine that can answer the question is
    // not this one, the F4 panel cannot reach a value fixed at context
    // construction, and a URL works identically on every machine the owner
    // plays on. See `parseLatencyHint` for what it means and why.
    const latency = parseLatencyHint(params.get('audiolatency'));
    if (latency !== null) this.audio.setLatencyHint(latency);
    // `?audiosamples=off` — the other half of the same diagnosis: hold the
    // pink-noise fallbacks so the one-time swap to the recorded loops never
    // happens. See `AudioEngine.samplesDisabled` for the reasoning.
    if (params.get('audiosamples') === 'off') this.audio.setSamplesDisabled();

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

  /**
   * Write semantic actions into one seat. See `ActionState.setScripted`.
   *
   * **Not routed through `seat.source`, deliberately.** A `RiderSource` is
   * `sample` + `consume` and nothing else (§25.3) — scripting is a *device*
   * write, which is the router's half of the world and not the seat's. So
   * this resolves the seat (which is what makes the address meaningful and
   * what rejects a bad index) and then asks the router for the concrete input
   * object behind it — the lifecycle half of the seam (§25.3). Seat 0's is the
   * shared `ActionState` every device cooperates on; seat 1's is an
   * `ActionState` no device is wired to until one claims it, which is what
   * makes it scripted.
   *
   * **This is the method Phase 2 had to teach.** Until it did, an index of 1
   * was validated and then thrown away, and `setActionsFor(1, …)` silently
   * steered the player — the failure mode that would have made a two-rider
   * spec pass while proving nothing.
   */
  setActionsFor(seat: number, actions: ScriptedActions): void {
    this.requireSeat(seat);
    this.router.stateFor(seat).setScripted(actions, this.simTimeSeconds);
  }

  /** Write semantic actions directly. Seat 0 — see `setActionsFor`. */
  setActions(actions: ScriptedActions): void {
    this.setActionsFor(0, actions);
  }

  /**
   * Hand the axes back to the devices — **every seat's, not seat 0's**.
   *
   * Identical to what it always did while one seat existed, and the honest
   * reading once two do: a spec that has finished scripting and clears its
   * input, or a harness that resets the ride, means "nobody is being driven
   * from a script now". Leaving seat 1 on a held throttle after that would be
   * a rider nothing in the test is still steering.
   */
  clearActions(): void {
    this.router.clearScripted();
  }

  /**
   * Resolve a seat index, or say so loudly — M25 Phase 1.
   *
   * The bridge is driven from a page-evaluated string, where a wrong index is
   * `undefined` and every read off it is a different confusing error several
   * lines later. One message naming the range is worth the branch.
   */
  private requireSeat(seat: number): RiderSeat {
    const found = this.seats[seat];
    if (found === undefined) {
      throw new Error(`no such seat: ${seat} (seats: ${this.seats.length})`);
    }
    return found;
  }

  /** How many riders this game is currently simulating. One, until asked. */
  get seatCount(): number {
    return this.seats.length;
  }

  /**
   * Seat a second rider in the world that is already running — M25 Phase 2
   * (docs/PLANS.md §25.5). Returns the new seat's index.
   *
   * **The bridge and nothing else.** No URL parameter, no menu, no option:
   * this is reachable from a spec and from the owner's own console, and that
   * is the whole of it until Phase 5 puts a join panel in front of it. It is
   * also why the phone contract is untouched — no path a phone player can
   * take arrives here, and `tests/touch.spec.ts` pins that.
   *
   * What it builds is a *seat*, not a companion. The ghost and the cop share
   * one mutually-exclusive slot in the renderer because the budget needed
   * them to (`render/Renderer.ts`, `secondRider`); this rider is a full
   * `RidingRig` of their own, added to the same scene the player's rig is in,
   * stepped by the same `stepSeat` and drawn by the same `renderSeat`. The
   * architecture proof of the phase is precisely that there is no second code
   * path.
   *
   * Three things are handed over and one is shared, which is the seat model's
   * whole claim (§25.3): the **source** is theirs (a scripted `ActionState`
   * nothing is wired to), the **controller** is theirs, the **rig** is theirs
   * — and the **world** is not. The same `TerrainSampler`, so both riders
   * read one ground; and the same hazard and soft-body fields as seat 0's
   * controller was built with, because both riders must rustle the same bush.
   *
   * `applyTuning()` afterwards rather than a pair of pushes: a fresh
   * `EucController` starts on `defaultEucTuning()`, so a seat spawned into a
   * session with F4 overrides live would otherwise ride a different physics
   * from the player beside them — the exact defect the Phase 1 follow-up
   * fixed for the seats that already existed.
   *
   * `character` is a *preference*, not an instruction: ask for the rider the
   * player is already wearing and you get somebody else, because q68 says two
   * riders on one screen are never the same character and seat 0 is the seat
   * that never moves. Omit it and the same rule picks for you.
   *
   * **They are seated where the world starts, not beside wherever the player
   * has ridden to.** The slot is derived from `plan.spawn` because that is the
   * one pose a world guarantees and validates (§25.5), and because Phase 5's
   * join panel enters the ride at the spawn with both riders on it. Spawn the
   * second rider before setting off — or press `R` first — and they are beside
   * you; do it three hundred metres out and they are back at the start, which
   * is the honest answer rather than a surprising one.
   */
  spawnSecondRider(character?: PlayableCharacterId): number {
    if (this.seats.length > 1) {
      throw new Error(`a second rider is already seated (seats: ${this.seats.length})`);
    }

    const index = this.seats.length;
    // **q68 at the door as well as at the chooser.** A named character is a
    // preference, not an override: seat 0 is already dressed, so an arriving
    // rider who asks for what the player is wearing is the one who moves.
    // That is `installCharacter`'s resolution read from the other direction —
    // **seat 0's character is the one that never moves** — and without it the
    // rule was enforced from the settings screen and bypassable from the very
    // call that seats the second player, which is not a rule.
    //
    // Compared against the *seat* rather than `installedCharacter` because
    // q68 is about who is on screen. The two agree today; this is the one
    // that stays right if they ever stop agreeing.
    const taken = this.seats[0].character;
    const id = character !== undefined && character !== taken
      ? character
      : this.characterBeside(taken);
    const controller = new EucController(this.terrain, {
      spawn: this.spawnForSeat(index),
      // **The world's own fields, shared rather than rebuilt.** Both are
      // immutable spatial indexes — every field on `HazardField` and
      // `SoftBodyField` is `readonly` — so this is an allocation saved, and
      // more importantly it is the statement that there is one world: a
      // second rider given their own copy would still hit the same potholes,
      // but nothing in the types would say they had to.
      hazards: this.hazards,
      softBodies: this.softBodies,
    });

    const rig = createRidingRig(riderLook(id), machineLook(machineForCharacter(id)));
    this.renderer.scene.add(rig.group);

    // A device-less `ActionState`, built by the router because the router is
    // what a device will later be claimed *to*: `setScripted` is the only
    // thing that writes it until then, which is what makes this seat scripted
    // without inventing a second kind of source (§25.3).
    // Index for index with `seats` by construction: the router held exactly
    // as many states as there are seats when this method began, so the seat it
    // appends is the one about to be pushed below.
    const seated = this.router.addSeat();
    if (seated !== index) {
      throw new Error(`seat ${index} does not match its input ${seated}`);
    }
    // **An empty seen set**: a guest is entitled to the hints even on a
    // machine whose owner finished them months ago (§25.5).
    this.seats.push(this.createSeat(this.router.sourceFor(index), controller, rig, id, []));

    // **After the push, and it has to be**: `applyTuning` and
    // `wireSeatCameras` both loop the seats, so a camera wired before the seat
    // existed is a camera that never gets either. This is the Phase 1
    // follow-up's lesson applied ahead of time rather than after a QA pass.
    this.applyTuning();
    this.wireSeatCameras();
    // Collapse the new seat's interpolation onto its spawn and draw it there,
    // or the first frame smears a rig from the origin to wherever it now is —
    // `installCharacter`'s reason, one seat along. Its camera snaps with it;
    // seat 0's is untouched, so nobody's view moves because somebody sat down.
    this.syncSeatPose(this.seats[index]);
    this.syncCamera(this.seats[index]);
    // **The screen splits here** — M25 Phase 3. The number of views and the
    // number of riders are the same number by construction rather than by two
    // places agreeing, which is why this is derived from `seats.length` rather
    // than passed in.
    this.renderer.setViewCount(this.seats.length);
    this.mountSeatHud(this.seats[index]);
    return index;
  }

  /**
   * Send the second rider home again, and give the GPU back what they cost.
   *
   * The order is `installCharacter`'s and it is load-bearing for the same
   * reason: **remove from the scene before disposing**, or the scene keeps a
   * node whose geometry has been freed and `resources().sceneObjects` climbs
   * by a whole rig every time. `RidingRig.dispose` detaches its own group as
   * well, which makes the explicit removal belt-and-braces rather than
   * redundant — the rule is what the plateau depends on, not the call.
   *
   * The controller and the source need no teardown: neither holds a GPU
   * handle, a listener or a timer, so dropping the seat is the whole of it.
   */
  despawnSecondRider(): void {
    if (this.seats.length < 2) throw new Error('there is no second rider to despawn');
    const index = this.seats.length - 1;
    const seat = this.seats[index];
    // The HUD first, while the seat is still in the array: `unmountSeatHud`
    // re-reads the split layout, and it must see the seat it is removing.
    this.unmountSeatHud(seat);
    this.renderer.scene.remove(seat.rig.group);
    seat.rig.dispose();
    // The fraction of a spark and of a droplet this rider was owed goes with
    // them, so the next rider seated at this index does not inherit it — and
    // their one-shot bookkeeping goes the same way, for the same reason: a
    // seat dismissed mid-ragdoll would otherwise hand its crash to whoever
    // sits down there next.
    this.renderer.forgetEmitter(index);
    this.audio.resetRider(index);
    this.seats.length = index;
    // The router drops the seat's input *and* any claim that pointed at it: a
    // pad claimed to the rider who just left has no opinion about the rider
    // who stayed, and inheriting one would hand the player's wheel to whoever
    // was holding the guest's controller.
    this.router.removeSeat();
    // The screen goes back to one view, and every remaining HUD is told it is
    // no longer a half.
    this.renderer.setViewCount(this.seats.length);
    this.applySplitLayout();
  }

  /**
   * Somebody other than the rider named — q68's distinct-characters rule, as
   * the default seat 1 wears when a caller states no preference.
   *
   * Derived from the roster rather than written down, so the day a sixth
   * character ships this keeps meaning "not that one" instead of naming a
   * rider who may no longer be first. The fallback is the roster's own first
   * entry, which is unreachable while more than one character exists and is
   * here because a total function is easier to reason about than one that
   * cannot fail *yet*.
   */
  private characterBeside(taken: CharacterId): PlayableCharacterId {
    return guestBeside(taken);
  }

  /**
   * Where seat `index` starts in the world that is loaded.
   *
   * Seat 0 is the plan's own spawn, byte for byte. Everyone else gets a slot
   * derived from it and checked against the terrain sampler
   * (`simulation/spawnSlots.ts`) — the validated contract §25.9 asked for, so
   * that a producer nobody had in mind cannot put the second rider inside a
   * wall.
   */
  private spawnForSeat(index: number): LevelPlan['spawn'] {
    return spawnSlot(this.levelPlan.spawn, index, this.terrain);
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
    // **Every seat**, because this scripts the *world* rather than a rider:
    // "something solid is three metres up the arm" is a statement about the
    // level, and a second camera left reading the real geometry would make the
    // override look like it had failed on one half of the screen.
    this.wireSeatCameras();
  }

  /**
   * Point every seat's camera at whatever it is currently allowed to hide
   * behind — M25 Phase 3.
   *
   * One place, called from the constructor, from `spawnSecondRider`, and from
   * `setOcclusion`, so that "which probe is live" has a single answer no
   * matter how many cameras are asking. The scripted override wins for all of
   * them or none of them.
   */
  private wireSeatCameras(): void {
    const scripted = this.scriptedOcclusion;
    const probe: OcclusionProbe = scripted === null
      ? (origin, direction, maxDistance) => this.terrain.raycast(origin, direction, maxDistance)
      : (_origin, _direction, maxDistance) => (scripted <= maxDistance ? scripted : null);
    for (const seat of this.seats) seat.chase.setOcclusionProbe(probe);
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
   *
   * **The rider it moves, and only that rider** — M25 Phase 2. This is seat
   * 0's teleport (a seat-addressed sibling is Phase 4's business if a spec
   * ever wants one), and the pose collapse is now that seat's alone: a second
   * rider whose history was collapsed because somebody else was teleported
   * would jump a frame for no reason a player could see.
   */
  placeRider(
    position: { x: number; y: number; z: number },
    headingY: number,
    index = 0,
  ): void {
    // **Addressed since M25 Phase 5's QA repair**, on `setActionsFor`'s and
    // `snapshotFor`'s pattern and for their reason: a spec that has to stand
    // the *guest* somewhere — in front of the one wall in the world that is
    // known to be solid, say — could otherwise only move the player, and the
    // per-seat rules that need a specific place would be untestable.
    const seat = this.requireSeat(index);
    seat.controller.reset({ position, headingY });
    this.syncSeatPose(seat);
    this.syncCamera(seat);
    // The world's own half, for the seat the world is following — `resetRider`'s
    // division exactly.
    if (this.ownsTheFrame(seat)) this.renderer.clearParticles();
    // **`seat.wasCrashed` is deliberately left alone**, unlike `resetRiderTo`
    // which clears it. That is what makes a teleport heal itself: the
    // controller comes back upright while this seat still remembers being
    // down, so the next step's own falling edge fires `recovered` and the
    // audio layer's crash flag clears through the one detector that owns it.
    // A second clear here would be a defensive line with nothing to defend —
    // and, worse, it would mask the two real ones (`resetRiderTo`,
    // `despawnSecondRider`) from every spec that stands a rider somewhere.
    // The automation wire's own teleport, and the one a spec uses to set a shot
    // up beside a target. Without it the first swing afterwards sweeps from
    // wherever the rider was parked before.
    seat.paddle.cancel();
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

  /** The whole picture, from seat 0's chair. See `snapshotFor`. */
  snapshot(): GameSnapshot {
    return this.snapshotFor(0);
  }

  /**
   * The whole picture, from one seat's chair — M25 Phase 1 (§25.5).
   *
   * **The same `GameSnapshot`, not a narrower per-seat one.** Four of its
   * fields are a rider's — `actions`, `consumed`, `euc`, and the three
   * swing fields inside `paddle` — and every other field is the *world's*,
   * which answers the same whichever seat asks. Splitting the type instead
   * would mean a spec that wanted a seat's speed and the world's clock had to
   * make two calls and correlate them, and this is a bridge rather than a
   * frame path: it already allocates a large object and nothing in the loop
   * calls it.
   *
   * `snapshot()` is `snapshotFor(0)` so every existing spec runs untouched,
   * which is this phase's gate. Phase 2's divergence proof — two seats ridden
   * apart, asserted apart — is `snapshotFor(0)` against `snapshotFor(1)`.
   *
   * **`camera` and `hud` became this seat's at Phase 3**, and both had to:
   * each read `this.` and so answered for seat 0 whichever seat was asked,
   * which is the same defect `rider.installed` had at Phase 2 and has the
   * same consequence — a spec asserting that seat 1's view followed seat 1
   * would have compared seat 0 with seat 0 and passed. What is still read off
   * `this.` below is the world's: the referees, the route, the render
   * counters, and the player's own saved options.
   */
  snapshotFor(index: number): GameSnapshot {
    const seat = this.requireSeat(index);
    const info = this.renderer.renderer.info;
    return {
      tick: this.tick,
      simTimeSeconds: this.simTimeSeconds,
      loop: this.loop.stats(),
      actions: seat.source.sample(this.simTimeSeconds),
      consumed: { ...seat.consumed },
      euc: seat.controller.snapshot(),
      // **This seat's camera, not the frame's** — M25 Phase 3. Every field
      // below was `this.currentCamera` while one camera existed, which would
      // have made `snapshotFor(1).camera` quietly report the *player's* view:
      // the same defect `rider.installed` had at Phase 2, and the same
      // consequence — a spec asserting that seat 1's camera followed seat 1
      // would have compared seat 0 with seat 0 and passed.
      camera: {
        mode: seat.cameraMode,
        orbitAngle: seat.orbitAngle,
        yaw: seat.currentCamera.yaw,
        distance: seat.currentCamera.distance,
        armDistance: seat.currentCamera.armDistance,
        fov: seat.currentCamera.fov,
        bank: seat.currentCamera.bank,
        lookAhead: seat.currentCamera.lookAhead,
        heightLag: seat.currentCamera.heightLag,
        dip: seat.currentCamera.dip,
        crashFrame: seat.currentCamera.crashFrame,
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
      // This seat's HUD, on the same terms as its camera above.
      hud: {
        ...seat.hudView,
        prompt: seat.hudPrompt,
        visible: seat.hud?.visible ?? false,
      },
      options: { ...this.options.current, persistent: this.options.persistent },
      gamepadConnected: this.gamepad.connected,
      input: {
        claiming: this.router.claiming,
        devices: this.router.claimList(),
        awaiting: this.router.awaitingSeat,
        pads: this.gamepad.padCount,
      },
      couch: {
        available: this.couchAvailable,
        ready: this.couchReady,
        guest: this.guestCharacter,
      },
      // Rider contact — M26 Phase 1. **Both halves, because they answer
      // different questions**: `enabled` is what the room asked for and what
      // Phase 2's toggle writes, `live` is whether the step is actually
      // resolving a pair. Reporting only the flag would make a spec unable to
      // see that single player never runs contact; reporting only the verdict
      // would make the flag itself unobservable.
      contact: {
        enabled: this.contactEnabled,
        live: this.contactLive,
      },
      touch: {
        visible: this.touchControls.visible,
        wanted: this.touchWanted,
        throttle: this.touch.throttle,
        steer: this.touch.steer,
        promptDevice: this.promptDeviceFor(index),
      },
      challenge: {
        ...this.challenge.state,
        available: this.challenge.available,
        resultsIn: this.resultsIn,
        recordedSamples: this.ghostRecorder.sampleCount,
      },
      trackDay: {
        ...this.trackDay.state,
        available: this.trackDay.available,
        lapMetres: this.trackDay.lapMetres,
        recordedSamples: this.ghostRecorder.sampleCount,
        ghostVisible: this.renderer.secondRiderShown === 'ghost',
        sessionBest: this.lastTrackDay?.bestLapSeconds ?? null,
      },
      paddle: {
        // `equipped` is the mode's answer and the same for every seat; the
        // three below are this seat's own arm.
        equipped: this.paddleEquipped,
        phase: seat.paddle.phase,
        head: seat.paddle.headPosition,
        reseeded: seat.paddle.reseeded,
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
          // Seat 0's, not `seat`'s: the chase is seat 0's in stage 1 (§25.3),
          // and reporting seat 1's distance off the route under a phase and a
          // gap that are seat 0's would be three numbers about two riders.
          const chased = this.seats[0].currentPose;
          this.spine.locate(chased.x, chased.z, -1, this.spineAt);
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
        // The player's saved pick, which is the *options* answer and the same
        // whichever seat asks. Seat 1's pick is session state and never
        // reaches the record (§25.5 Phase 5).
        chosen: this.options.current.character,
        // This seat's own rider, and its own voice — M25 Phase 2. It was
        // `this.installedCharacter` while one seat existed, which would have
        // made `snapshotFor(1).rider` quietly report the player and left
        // q68's distinct-characters rule not merely unenforced but
        // unobservable. For seat 0 the two are the same value by
        // construction, so nothing a spec already asserts moves.
        installed: seat.character,
        crashVoice: crashVoiceFor(seat.character),
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
   * Start a track day, for the automation wire — M23.
   *
   * `startTimeTrial`'s twin, and unlike every other entrance on this bridge it
   * changes the world: the mode brings BelVar with it, which is the shipped
   * behaviour and is the whole reason the button is always live.
   */
  startTrackDay(): void {
    this.enterTrackDay();
  }

  /**
   * Pit in, for the automation wire — M23.
   *
   * A session ends from the pause card, so this is the two presses a player
   * makes rather than a test-only door into `endTrackDaySession`: pause, then
   * End session. A spec that reached past the pause would be asserting a path
   * no player can take, and would keep passing on the day the button stopped
   * being reachable.
   */
  endTrackDay(): void {
    if (this.appState.current === 'trackDay') this.goTo('paused');
    this.endTrackDaySession();
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
    // A lap best is filed in `records` beside the timed run's, so `clearAll`
    // above already took it — what this re-points is the *live* session: a
    // referee still comparing against a record that no longer exists would go
    // on printing deltas against it, and its ghost would go on racing.
    this.loadLapReference();
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
    // **Seat 0 restarts from the record; every other seat restarts empty** —
    // M25 Phase 3. Restoring a guest's prompts from the player's saved list
    // would be the options firewall leaking in the one direction it has never
    // leaked: out of the record and onto somebody it is not about.
    for (const seat of this.seats) {
      seat.onboarding.restart(this.ownsTheFrame(seat) ? this.options.current.seenPrompts : []);
    }
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

    this.clearLastResults();
    this.chaseRun.abandon();
    this.trackDay.abandon();
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
   * Forget every mode's last result.
   *
   * **`buildResultsView` is a tagged union with no tag** — it picks whichever
   * of four nullable records is non-null, in a fixed precedence — so the whole
   * scheme rests on every entrance clearing the other three. That was three
   * hand-written blocks of five assignments each, kept in step by hand, and it
   * had already failed once: a completed chase survived a trip through the
   * title screen and turned Time trial's results card and its New route button
   * back into Police chase. A fourth mode would have made it four blocks of
   * seven, which is twenty-eight assignments and four chances to miss one.
   *
   * So there is one of them and every entrance calls it. Adding a fifth mode
   * means adding two lines here rather than remembering four call sites.
   */
  private clearLastResults(): void {
    this.lastResult = null;
    this.lastResultWasRecord = false;
    this.lastResultGhostDropped = false;
    this.lastResultPreviousSplits = [];
    this.lastKnockabout = null;
    this.lastKnockaboutWasRecord = false;
    this.lastChase = null;
    this.lastChaseWasRecord = false;
    this.lastTrackDay = null;
    this.lastTrackDayWasRecord = false;
    this.lastTrackDayGhostDropped = false;
    this.lastTrackDayPreviousSplits = [];
  }

  // ---------------------------------------------------------------------------
  // Track Day (M23 Phase B2)
  // ---------------------------------------------------------------------------

  /**
   * The player chose Track Day, from the title screen or from Retry.
   *
   * **This is the one entrance that brings its own world**, and that is what
   * makes it always available rather than conditionally offered. Every other
   * mode asks something of whatever is loaded — a route to time, targets to
   * hit, a through line for the cop — and refuses, or opens the fresh-route
   * panel, when the answer is no. A circuit is not a property a world might
   * happen to have; BelVar *is* the mode's venue, so pressing the button takes
   * the player there. The button's own note says so ("Lap BelVar Circuit"), so
   * this is a journey the player asked for rather than the silent world swap
   * M12's `no-route` rule forbids.
   *
   * The probes are replayed into the swap exactly as `rideTheCity` replays
   * them: a diagnostic session must not be able to ask for the circuit and
   * silently get a different circuit from the one everybody else rides.
   */
  private enterTrackDay(): void {
    // A world swap is in flight. Starting a mode on top of one would arm a
    // referee against a plan that is about to be replaced.
    if (this.pendingRoute !== null) return;

    if (this.levelId !== 'track') {
      this.installLevel(
        'track',
        '',
        createLevel('track', DEFAULT_SEED, this.hazardProbe, this.targetProbe),
      );
    }
    // After the swap, because `installLevel` rebuilt the referee this asks.
    if (!this.trackDay.available) return;

    this.clearLastResults();
    this.chaseRun.abandon();
    this.challenge.abandon();
    // The rider goes to the start line's own run-up rather than the level
    // spawn, exactly as a timed run does: an out lap that begins in the same
    // place every time is what makes the first flying lap comparable with the
    // fortieth. On this venue the two happen to be seventy metres apart, and
    // relying on that would be relying on a layout that iterates.
    this.resetChallengeRider();
    this.loadLapReference();
    this.trackDay.arm();
    // Point the gates at the armed line before `goTo` makes them visible, or a
    // retry shows the previous session's last sector for one frame.
    this.renderer.setCheckpointProgress(0);
    this.ghostRecorder.reset();
    this.resultsIn = 0;
    this.pendingLapFlash = null;
    this.pendingSplit = null;
    this.setRoutePurpose('ride');
    this.goTo('trackDay');
  }

  /**
   * Point the lap referee and the ghost at the stored best lap.
   *
   * `loadRecordReference`'s twin, and separate rather than shared because the
   * two hand the same record to different referees — and because the ghost the
   * two build is the same object read at a different clock: a time-trial ghost
   * is sampled at run seconds and a lap ghost at *lap* seconds, so it restarts
   * beside the player every time they cross the line.
   */
  private loadLapReference(): void {
    const best = this.recordForCurrentWorld();
    this.trackDay.setReference(
      best === null ? null : { totalSeconds: best.totalSeconds, splits: best.splits },
    );
    this.lastTrackDayPreviousSplits = best === null ? [] : best.splits;
    this.ghostPlayer = new GhostPlayer(best?.ghost ? decodeGhost(best.ghost) : null);
  }

  /**
   * One fixed step of a track day.
   *
   * `stepChallenge`'s shape, including the guard on the first line — which is
   * load-bearing for the reason recorded there: the results countdown must not
   * keep running behind the settings screen, which also simulates, because
   * `settings` lists no `results` successor and the transition would be refused
   * with the countdown already spent.
   *
   * **The ghost is recorded after the events are handled, not before.** A lap
   * that closes opens the next one inside the same step, and the recorder is
   * reset by that `open` event; recording first would put the closing lap's
   * final sample at the head of the new lap's track, at a clock of forty-odd
   * seconds, after which every genuine sample of the new lap would be silently
   * dropped for not moving the clock forward.
   */
  private stepTrackDay(stepSeconds: number): void {
    if (this.appState.current !== 'trackDay') return;

    if (this.resultsIn > 0) {
      this.resultsIn -= stepSeconds;
      if (this.resultsIn <= 0) {
        this.resultsIn = 0;
        this.goTo('results');
        return;
      }
    }

    // Whose lap the referee is timing. Seat 0's in stage 1 — a couch session
    // is free ride and keeps no records (§25.6).
    const seat = this.seats[0];
    const pose = seat.currentPose;
    const events = this.trackDay.step(stepSeconds, {
      x: pose.x,
      y: pose.y,
      z: pose.z,
      speed: pose.speed,
      landed: seat.controller.touchedDown,
      landingClean: seat.controller.lastLandingQuality === 'clean',
      crashed: seat.controller.crashed,
    });

    const state = this.trackDay.state;
    this.renderer.setCheckpointProgress(state.crossed);
    this.renderer.stepCheckpoints(stepSeconds);

    for (const event of events) this.handleTrackDayEvent(event);

    if (this.trackDay.state.phase === 'running' && !this.probing) {
      this.ghostRecorder.record(this.trackDay.state.elapsed, {
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
  }

  /** A line was crossed. Flare it, flash it, and file a lap if one ended. */
  private handleTrackDayEvent(event: TrackDayEvent): void {
    if (event.kind === 'open') {
      // A fresh lap is a fresh recording. This fires on the first crossing of
      // the session, on every lap close, and on the restart a lap that reached
      // no sector line gets — three doors into one requirement.
      this.ghostRecorder.reset();
      return;
    }

    this.renderer.flareCheckpoint(event.routeIndex);

    if (event.kind === 'sector') {
      this.pendingLapFlash = {
        kind: 'sector',
        label: event.label,
        delta: event.totalDelta,
      };
      return;
    }

    const lap = event.lap;
    if (lap === null) return;
    this.pendingLapFlash = lap.counted
      ? { kind: 'lap', seconds: lap.seconds, delta: event.totalDelta }
      : { kind: 'void' };
    if (lap.counted) this.fileLap(lap.seconds, lap.splits);
  }

  /**
   * A counting lap: keep it if it beat the record, and race it from now on.
   *
   * **The store is offered every counting lap, not only the session's best**,
   * and `RecordsStore.submit` is what decides — it holds the same
   * "a tie is not a record" law the referee reports on its own events, in the
   * same algebraic form, for the reason `challenge.ts` records at length.
   *
   * On a record the reference is replaced *immediately*, and so is the ghost.
   * That is the whole difference between a track day and a time trial: a rider
   * who improves on lap four is racing their lap-four ghost on lap five, not
   * the one they arrived with. Waiting until the session ended would make the
   * ghost a recording of a lap the player has already beaten, which is the one
   * thing a ghost must never be.
   */
  private fileLap(seconds: number, splits: readonly number[]): void {
    if (this.probing) {
      // The probe changes the course without changing its level id, so a lap
      // set on one is not a lap of the world anybody else rides. The session
      // still reports itself; the store and the ghost codec never see it.
      this.ghostRecorder.reset();
      return;
    }

    const track = this.ghostRecorder.finish(this.levelPlan.id, seconds);
    const candidate: RouteRecord = {
      levelId: this.levelPlan.id,
      totalSeconds: seconds,
      splits,
      // The only wall time in this mode, exactly as in the timed run: a label
      // on a saved record that reaches no clock the simulation reads.
      setAt: new Date().toISOString(),
      ghost: track === null ? null : encodeGhost(track),
    };

    const kept = this.records.submit(candidate);
    if (!kept) return;

    this.lastTrackDayWasRecord = true;
    const stored = this.recordForCurrentWorld();
    this.lastTrackDayGhostDropped = this.lastTrackDayGhostDropped
      || (candidate.ghost !== null && (stored === null || stored.ghost === null));
    this.trackDay.setReference({ totalSeconds: seconds, splits });
    this.ghostPlayer = new GhostPlayer(
      stored?.ghost ? decodeGhost(stored.ghost) : track,
    );
  }

  /**
   * The player pitted — the pause card's End session.
   *
   * **The only place a menu ends a ride**, and the reason `paused` lists
   * `results` as a successor. It goes straight to the card with no delay:
   * `CHALLENGE.resultsDelaySeconds` exists so a player who has just crossed a
   * finish line at speed sees themselves finish rather than a dialog, and there
   * is nothing to watch here — the player is stationary behind a pause menu and
   * pressed a button asking for exactly this screen.
   */
  private endTrackDaySession(): void {
    if (this.appState.current !== 'paused') return;
    if (this.appState.rideReturn !== 'trackDay') return;
    const result = this.trackDay.end();
    if (result === null) return;
    this.lastTrackDay = result;
    this.resultsIn = 0;
    this.pendingLapFlash = null;
    this.goTo('results');
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
    this.seats[0].paddle.cancel();
    this.knockaboutSeconds = 0;
    this.clearLastResults();
    this.chaseRun.abandon();
    this.trackDay.abandon();
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
      totalCaption: 'This run',
      bestCaption: 'Best',
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

    this.clearLastResults();
    this.trackDay.abandon();
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
    // The rider he is behind. Seat 0's in stage 1 — the cop is not a seat (§25.3).
    const seat = this.seats[0];
    const cop = this.copController;
    if (cop === null || this.copBrain === null) return;

    const gap = this.tuning.get('CHASE.spawnGapMetres');
    const heading = seat.currentPose.headingY;
    const x = seat.currentPose.x - Math.sin(heading) * gap;
    const z = seat.currentPose.z - Math.cos(heading) * gap;
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

  /**
   * The super tracker's regroup — M20.2, the owner's "always knows where you
   * are and goes to find you".
   *
   * The referee (`simulation/chase.ts`) has just ruled that the gap sat beyond
   * `CHASE.trackerGapMetres` for the whole hold, which two equal wheels can
   * never honestly close. So the cop is placed back **on the route**,
   * `CHASE.trackerReturnMetres` behind the rider's own projection, facing the
   * rider's direction of travel, arriving at the rider's pace — position is
   * granted, a faster wheel never is, and his own throttle law immediately
   * holds whatever his ceiling allows. On the route rather than straight
   * behind the rider's heading (`placeCopBehindRider`'s shape), because a
   * mid-ride heading can point across a field or into a block, and the spine
   * is the one line guaranteed to be road.
   *
   * The return distance sits beyond the siren's far edge, so he arrives
   * *silent* and the siren fades in as he closes — found, not spawned on. A
   * cop who is mid-crash drops the demand on the floor; the referee's timer
   * simply runs again and demands again one hold later, by which time he is
   * back on his wheel.
   */
  private regroupCop(): void {
    // The rider he is regrouping on. Seat 0's in stage 1 (§25.3).
    const seat = this.seats[0];
    const cop = this.copController;
    const brain = this.copBrain;
    const spine = this.spine;
    if (cop === null || brain === null || spine === null) return;
    if (cop.crashed) return;

    // Which way along the route the rider is travelling: their heading against
    // the spine's at their own projection. `spineAt` was located by the caller
    // this same step.
    spine.sample(this.spineAt.distance, this.spineSample);
    const along = Math.cos(seat.currentPose.headingY - this.spineSample.headingY);
    const direction = along >= 0 ? 1 : -1;

    const back = this.tuning.get('CHASE.trackerReturnMetres');
    spine.sample(this.spineAt.distance - direction * back, this.spineSample);

    // A route-distance request is not proof of a safe world-space placement.
    // `RouteSpine.sample` clamps at both ends, so asking for 30 m behind a
    // rider still at the first metre used to answer the rider's own spawn.
    // The M20.2 browser proof called the resulting 1.1 m overlap a successful
    // regroup because it only looked for a large reduction in the old gap.
    // A tightly folded route can collapse the two positions in world space
    // without clamping, too. Refuse both cases and let the referee demand
    // again after another hold; skipping one regroup is fair, materialising
    // inside the bust radius is not.
    const routeGap = Math.abs(this.spineAt.distance - this.spineSample.distance);
    if (routeGap + 1e-6 < back) return;
    const dx = this.spineSample.x - seat.currentPose.x;
    const dz = this.spineSample.z - seat.currentPose.z;
    const candidateGap = Math.sqrt(dx * dx + dz * dz);
    const minimumGap = Math.max(
      this.chaseRun.bustRadiusMetres + 1,
      Math.min(back, AUDIO.sirenFarMetres),
    );
    if (candidateGap < minimumGap) return;

    const heading = direction >= 0
      ? this.spineSample.headingY
      : this.spineSample.headingY + Math.PI;
    cop.reset(
      {
        position: { x: this.spineSample.x, y: this.spineSample.y, z: this.spineSample.z },
        headingY: heading,
      },
      Math.max(Math.abs(this.copCurrent.speed), Math.abs(seat.currentPose.speed)),
    );

    // The same body-was-moved bookkeeping `placeCopBehindRider` does: no
    // interpolation streak across the map, a globally re-found brain cursor,
    // and no swing surviving a relocation.
    cop.writePose(this.copCurrent);
    copyPose(this.copCurrent, this.copPrevious);
    copyPose(this.copCurrent, this.copRender);
    this.writeCopView();
    brain.place(this.copView);
    this.copPaddle.cancel();
    const placedX = this.copCurrent.x - seat.currentPose.x;
    const placedZ = this.copCurrent.z - seat.currentPose.z;
    this.copGap = Math.sqrt(placedX * placedX + placedZ * placedZ);
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
    // The rider he is chasing. Seat 0's in stage 1 (§25.3).
    const seat = this.seats[0];

    copyPose(this.copCurrent, this.copPrevious);
    this.writeCopView();

    // The quarry, and it is null while the rider is down: a cop who kept
    // steering at a crashed rider would ride into them, and the run is either
    // already over or the rider is getting up.
    const chasing = this.appState.current === 'chase' && !seat.controller.crashed;
    // The brain's intent is read *once* and used twice — the wheel rides it and
    // the paddle swings on it. Calling `step` a second time to ask about the
    // swing would advance a state machine that is only allowed to advance once
    // per fixed step, which is the shape of bug `advance(n)` cannot reproduce.
    const intent = brain.step(
      stepSeconds,
      this.copView,
      chasing
        ? {
          x: seat.currentPose.x,
          y: seat.currentPose.y,
          z: seat.currentPose.z,
          speed: seat.currentPose.speed,
        }
        : null,
    );
    const wantsSwing = intent.swing;
    const swingSide = brain.swingSide;
    cop.step(stepSeconds, intent);
    cop.writePose(this.copCurrent);

    const dx = this.copCurrent.x - seat.currentPose.x;
    const dz = this.copCurrent.z - seat.currentPose.z;
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
      seat.currentPose.x,
      seat.currentPose.y,
      seat.currentPose.z,
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
      seat.controller.softKnock(this.tuning.get('CHASE.strikeSpeedCost'));
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
    // The rider the referee is judging. Seat 0's in stage 1 (§25.3).
    const seat = this.seats[0];

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
    spine.locate(seat.currentPose.x, seat.currentPose.z, -1, this.spineAt);

    // How fast the rider's own motion is closing on the cop, for the touch
    // bust — M24. The rider's contribution alone, read off the step's real
    // displacement (which sees airborne travel and wobble weave, where a
    // heading would lie): the rider's move measured against where the cop
    // *ended up* this step, so the cop's own motion contributes nothing.
    // Capped by the rider's own physical speed, the `maxStepSweep` argument
    // one system over — a respawn or reset teleports a pose, and a teleport
    // must read as nothing rather than as a ram. `copGap` was refreshed by
    // `stepCop` this very step.
    const riderClosingSpeed = Math.min(
      stepSeconds > 0
        ? (Math.hypot(
          seat.previousPose.x - this.copCurrent.x,
          seat.previousPose.z - this.copCurrent.z,
        ) - this.copGap) / stepSeconds
        : 0,
      Math.abs(seat.currentPose.speed),
    );

    const ended = this.chaseRun.step(stepSeconds, {
      offRoute: this.spineAt.offRoute,
      copDistance: this.copGap,
      crashed: seat.controller.crashed,
      riderClosingSpeed,
      copCrashed: this.copController?.crashed ?? true,
    });
    if (ended) this.finishChase();
    // The super tracker (M20.2). Asked after the endings so a run that just
    // finished never regroups a cop onto its results card.
    else if (this.chaseRun.takeTrackerDemand()) this.regroupCop();
  }

  /** The clock ran out, or it did not. Score it, offer it, and show the card. */
  private finishChase(): void {
    const state = this.chaseRun.state;
    // The touch bust lands as a body knock — M24. The referee decided the run;
    // this is what the ram *feels* like: the strike's own thud and stagger, so
    // riding into him reads as hitting a person rather than a tripwire. The
    // same public `softKnock` the paddle strike spends, so the wobble-caller
    // census is untouched, and the ride is already over before the wobble can
    // cost anything.
    if (state.outcome === 'touched') {
      this.audio.hit();
      this.seats[0].controller.softKnock(this.tuning.get('CHASE.strikeSpeedCost'));
    }
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
    if (run.outcome === 'touched') notes.push('You touched Officer Dorkins — that is an instant bust');

    const heading = run.escaped
      ? (this.lastChaseWasRecord ? 'Escaped — new record' : 'Escaped')
      : run.outcome === 'strayed' ? 'Out of bounds' : 'Busted';

    return {
      heading,
      isRecord: this.lastChaseWasRecord,
      totalCaption: 'This run',
      bestCaption: 'Best',
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
   * Turn a finished track day into the words on the results card — M23.
   *
   * **The headline number is the best lap**, not the session: a track day is
   * not a race and the afternoon's total means nothing, which is exactly what
   * §23.6 settles by making the record the best lap. Everything else is the
   * story — how many laps, how many counted, and what the three sectors would
   * add up to if a rider ever put their best three together, which is the one
   * number that tells a rider there is more in it.
   *
   * The rows are the best lap's own sectors against the record that was
   * standing when the session began — `lastTrackDayPreviousSplits`, captured
   * at the entrance for `lastResultPreviousSplits`'s reason: by now the store
   * holds this session's lap and comparing it with itself prints a column of
   * zeroes under a summary that correctly reads seconds faster.
   */
  private buildTrackDayResults(session: TrackDaySessionResult): ResultsView {
    const unit = this.options.current.speedUnit;
    const best = session.bestLapSeconds;
    const previous = session.previousBest;
    const previousSplits = this.lastTrackDayPreviousSplits;

    const rows: ResultsRow[] = [];
    // Index zero is the line the lap started from, whose split is zero by
    // construction. A row reading `0:00.00` teaches the player nothing — the
    // same skip the timed run's card makes, one mode later.
    for (let index = 1; index < session.bestLapSplits.length; index += 1) {
      const delta = index < previousSplits.length
        ? session.bestLapSplits[index] - previousSplits[index]
        : null;
      rows.push({
        label: session.labels[index] ?? `Sector ${index}`,
        time: formatRunTime(session.bestLapSplits[index]),
        delta: delta === null ? '' : formatDelta(delta),
        ahead: delta === null || Math.round(delta * 100) < 0,
      });
    }

    const notes: string[] = [];
    notes.push(session.lapsCounted === session.lapsRidden
      ? `${lapCount(session.lapsCounted)} counted`
      : `${lapCount(session.lapsCounted)} counted of ${session.lapsRidden}`);
    // **Only when it is actually quicker than the best lap.** A rider who put
    // every sector together on one lap has an ideal lap equal to it, and
    // printing "there is 0.00 in it" would be furniture.
    if (
      session.idealLapSeconds !== null
      && best !== null
      && best - session.idealLapSeconds >= 0.01
    ) {
      notes.push(`Best sectors together ${formatRunTime(session.idealLapSeconds)}`);
    }
    notes.push(
      `Top speed ${formatSpeed(session.topSpeed, unit)} ${unit === 'mph' ? 'mph' : 'km/h'}`,
    );
    if (session.crashes > 0) {
      notes.push(session.crashes === 1 ? 'One crash' : `${session.crashes} crashes`);
    }
    if (this.probing) {
      notes.push('Diagnostic session — best lap and replay not saved');
    } else {
      if (this.lastTrackDayGhostDropped) notes.push('Replay not saved — storage full');
      if (!this.records.persistent) {
        notes.push('This browser will not save times after you close the tab');
      }
    }

    const delta = best !== null && previous !== null ? best - previous : null;

    return {
      // **The heading comes from what the store did**, never from the
      // referee's own `beatRecord` — the two are computed by layers that may
      // not import each other, and they disagreed once already at a margin of
      // exactly one hundredth of a second. Reporting the store's answer means a
      // future drift costs a wrong field on a snapshot rather than a
      // celebration over a lap the player will not find next session.
      heading: this.lastTrackDayWasRecord
        ? 'New best lap'
        : best === null ? 'No lap set' : 'Session complete',
      isRecord: this.lastTrackDayWasRecord,
      // **The afternoon's best lap, not "this run".** A track day has no run
      // to report — it has laps — and the number beside it is the record the
      // player arrived with rather than a best they are still chasing.
      totalCaption: 'Best lap',
      bestCaption: 'Record',
      total: best === null ? '—' : formatRunTime(best),
      best: previous === null ? '—' : formatRunTime(previous),
      deltaToBest: delta === null || Math.round(delta * 100) === 0 ? '' : formatDelta(delta),
      ahead: delta !== null && Math.round(delta * 100) < 0,
      rows,
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
   * Is rider-to-rider contact being resolved this step? — M26 Phase 1 (§26.3).
   *
   * **`paddleEquipped`'s exact model, and for its exact reason.** Something has
   * to decide whether contact exists, and the moment that decision is spelled
   * out in more than one place the step, a future mode and a future diagnostic
   * can each hold a different opinion — which is how a mechanic ends up on in
   * the simulation and off in the HUD. One expression, read by the step and
   * reported on `snapshot()`, so the two cannot disagree.
   *
   * Two clauses, and both are load-bearing:
   *
   *   - **`seatCount === 2`** is what keeps single player byte-identical.
   *     There is no pair to test with one rider, and this is the clause that
   *     says so rather than leaving `seats[1]` to be undefined somewhere
   *     downstream. It is `=== 2` rather than `>= 2` deliberately: a third
   *     seat is three pairs and a different question (§26.7), and answering it
   *     wrongly-but-quietly is worse than not answering it.
   *   - **`contactEnabled`** is the session's own answer, default on, and the
   *     thing Phase 2's join-panel toggle writes.
   */
  get contactLive(): boolean {
    return this.seatCount === 2 && this.contactEnabled;
  }

  /**
   * Turn contact on or off for this session — **the QA bridge and nothing
   * else in this phase**.
   *
   * `spawnSecondRider`'s discipline exactly: no URL parameter, no menu, no
   * option, on purpose. The player-facing control is the join panel's toggle
   * in Phase 2; until then this exists so a spec can prove the flag is a real
   * gate rather than a constant, which is the only way the `contactEnabled`
   * half of `contactLive` can be mutation-checked at all.
   */
  setContactEnabled(enabled: boolean): void {
    this.contactEnabled = enabled;
    // **The panel is redrawn from the flag, never from its own control** — so
    // the checkbox agrees with the ride whichever of its two writers moved it
    // (M26 Phase 2). Cheap and idempotent, `updateCouchAvailable`'s rule.
    this.updateCouchPanel();
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
  private canAcceptSwing(seat: RiderSeat): boolean {
    return this.paddleEquipped && !seat.paddle.swinging && !seat.controller.crashed;
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
  private stepPaddle(seat: RiderSeat, stepSeconds: number, swingRequested: boolean): void {
    if (!this.paddleEquipped) return;

    // A crashed rider keeps hold of the paddle — the owner's call, and it
    // matches the wheel's own spin-out flourish — but they are not swinging it.
    // The ragdoll carries the mesh because the renderer attaches it to a hand
    // group, which needs nothing from here.
    if (seat.controller.crashed) {
      if (seat.paddle.swinging) seat.paddle.cancel();
      return;
    }

    const pose = seat.currentPose;
    const hits = seat.paddle.step(
      stepSeconds,
      { x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY },
      swingRequested,
      this.targets,
    );

    // The whoosh goes with the press that was actually granted, not with the
    // press the player made: a request refused because a swing was already
    // running is buffered rather than consumed, and a whoosh on it would be a
    // sound with no motion under it.
    // Heard whoever swung — M25 Phase 5, q66. See the one-shot note in
    // `stepSeat` for what stopped being singular and what did not.
    if (swingRequested) this.audio.swing();

    // `renderer.stepTargets` used to be here. It is the tick's now (M25 Phase
    // 2) — a shared pool's clock, beside `stepParticles`, for the reasons
    // spelled out at its new home in `step`.

    for (const hit of hits) {
      // `strike` is the authority on whether this scored: it returns false for
      // a target already down, so a second swing at a fallen one costs nothing
      // and scores nothing (§13 q21) without this loop having to remember.
      if (!this.targets.strike(hit.id)) continue;
      // Seen and heard whoever swung — one mix, every rider's events (q66).
      this.renderer.strikeTarget(hit.id);
      this.audio.hit();
      // Presentation, through the suspension the pedal strike already kicks.
      // Nothing here reaches `injectWobble`, under the owner's standing rule.
      seat.controller.jolt(this.tuning.get('PADDLE.hitJolt'));
      seat.controller.shedSpeed(this.tuning.get('PADDLE.hitSpeedCost'));
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
        // The paddle hit above says why; this one can fire several times in
        // a step, which is what the cue ring's headroom is sized against.
        this.renderer.strikeTarget(volume.id);
        this.audio.hit();
        seat.controller.softKnock(this.tuning.get('TARGET.bodyKnockSpeedCost'));
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
    // Whose ride the clock is timing. Seat 0's in stage 1.
    const seat = this.seats[0];
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

    const pose = seat.currentPose;
    const events = this.challenge.step(stepSeconds, {
      // The contact patch, which is what the rig is positioned at and what the
      // gate volumes stand on. A centre-of-mass point would sit a metre up and
      // still be inside a gate, so this would not have failed loudly.
      x: pose.x,
      y: pose.y,
      z: pose.z,
      speed: pose.speed,
      landed: seat.controller.touchedDown,
      // The controller's own verdict, not a threshold applied out here. See
      // `EucController.lastLandingQuality`.
      landingClean: seat.controller.lastLandingQuality === 'clean',
      crashed: seat.controller.crashed,
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
    // And Track Day after those, on the same argument a fourth time.
    if (this.lastTrackDay !== null) return this.buildTrackDayResults(this.lastTrackDay);

    const result = this.lastResult;
    if (result === null) {
      return {
        heading: 'Run complete',
        isRecord: false,
        totalCaption: 'This run',
        bestCaption: 'Best',
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
      totalCaption: 'This run',
      bestCaption: 'Best',
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

  /**
   * A brand-new route, from wherever the player already is — M20.
   *
   * The owner's report is that Cop Chase always starts on the same course and
   * that the way to a different one — title → Fresh route → generate → quit →
   * re-enter the mode — is *"convoluted"* enough that casual players never
   * discover other courses exist. This is that whole journey as one press, from
   * the pause menu or the results card.
   *
   * **It rides the mode the player was already in**, which is the part that
   * makes it worth having: a player being chased who wants a change of scene
   * gets a new course *and a chase on it*, not a free ride they then have to
   * leave. `retry`'s own rule, one screen over.
   *
   * **`routes` is deliberately not entered on the way through**, and that is
   * the one recorded decision this touches. `app/appState.ts` says the route
   * chooser is unreachable from a pause because "swapping the world underneath
   * a ride would mean disposing the ground a rider is standing on". That
   * reasoning is honoured rather than overruled: nothing is swapped underneath
   * anybody. The player is paused or reading results — neither is a live ride —
   * `installLevel` resets the rider onto the new spawn as part of the swap, and
   * the mode is entered afterwards through its ordinary entrance. The edges
   * used (`paused → chase`, `results → chase`, and so on) all already existed.
   */
  private newRouteHere(): void {
    // A second press while the first is building. `beginRouteWork` would
    // overwrite the pending work and the button is disabled anyway; refusing
    // here is what makes that true of the QA bridge and the gamepad too.
    if (this.pendingRoute !== null) return;

    const destination = this.rideDestination();
    if (destination === null) return;
    this.menus.setNewRouteStage('building');
    this.beginRouteWork(
      { kind: 'surprise', destination },
      // The fresh-route panel is not on screen, so this status is for the world
      // line and the QA bridge rather than for a player. The words the player
      // reads are the button's own (`Menus.setNewRouteStage`).
      { kind: 'building', seed: 'a fresh route' },
    );
  }

  /**
   * Which mode a `New route` press should land in — M20.
   *
   * Three arrivals and one rule: **the mode the player is in the middle of.**
   * From a pause that is the ride the pause is a pause *of*, which `AppState`
   * already remembers for the Resume button. From the results card it is the
   * mode whose result is on screen, read exactly the way `onRetryChallenge`
   * reads it — each entrance clears the other two's last result, so at most one
   * of them is non-null.
   *
   * `null` is "not somewhere this button exists", which is every other state.
   * It cannot normally be reached, because the control is only on those two
   * cards; it is here so that a bridge call or a stray key cannot start a world
   * swap from the title.
   */
  private rideDestination(): RouteDestination | null {
    const current = this.appState.current;
    if (current === 'paused') {
      const ride = this.appState.rideReturn;
      return ride === 'challenge' || ride === 'knockabout' || ride === 'chase'
        ? ride
        : 'freeRide';
    }
    if (current !== 'results') return null;
    if (this.lastKnockabout !== null) return 'knockabout';
    if (this.lastChase !== null) return 'chase';
    // **A track day cannot follow a fresh route, so New route means free ride
    // here.** A generated course is point-to-point by construction (§13 q6) and
    // carries no lap for the referee to judge, so resuming the mode on one
    // would be offering a session that could never start. Free ride is what the
    // player actually asked for — a new place — with nothing pretending to keep
    // score on it.
    if (this.lastTrackDay !== null) return 'freeRide';
    return 'challenge';
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
        // **And the chase asks for a through line** — M20, and it is the same
        // argument one line up rather than a new one. A generated plan that
        // states no spine is a legal world everywhere else and cannot host a
        // chase (§13 q26); before this, `New route` from inside Cop Chase could
        // land on one and `enterChase` would bounce the player out to the
        // fresh-route panel — the exact journey this button exists to delete.
        // Built and thrown away: `installLevel` builds the real one, and a
        // Dijkstra over a few dozen sockets is nothing beside generating the
        // route it is checking.
        if (work.destination === 'chase' && RouteSpine.fromPlan(outcome.plan) === null) {
          continue;
        }
        this.installLevel('generated', outcome.seed, outcome.plan);
        this.menus.setSeed(outcome.seed);
        this.menus.setNewRouteStage('idle');
        if (work.destination === 'choose') {
          this.setRouteStatus({ kind: 'ready', seed: outcome.seed });
        } else {
          this.rideLoadedWorld(work.destination);
        }
        return;
      }
      // Every attempt refused. The world is untouched, which is the important
      // half; the other half is saying so on whichever surface asked, because
      // the pause and results cards have no status line of their own.
      this.menus.setNewRouteStage('failed');
      this.setRouteStatus(
        work.destination === 'knockabout' ? { kind: 'needs-targets' }
          : work.destination === 'chase' ? { kind: 'needs-route' }
            : { kind: 'blank' },
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
    // And a lap session belongs to the circuit that is leaving, for exactly
    // that reason. `enterTrackDay` calls this before it arms, so the abandon
    // here is of whatever the *previous* world was doing.
    if (this.trackDay.state.phase !== 'idle') this.trackDay.abandon();
    this.pendingLapFlash = null;
    this.lastTrackDay = null;
    this.lastTrackDayWasRecord = false;
    this.lastTrackDayGhostDropped = false;
    this.lastTrackDayPreviousSplits = [];
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
    // Rebuilt with the world, like the sampler and the referee above them, and
    // for the same reason: a hazard field outliving its plan would put the last
    // route's potholes in this one's road — or its bushes in this one's plaza.
    // **One pair for every seat since Phase 2**, which is where §25.5's "both
    // riders rustle the same bush" stops being a sentence and becomes the
    // object graph; both classes are immutable, so nothing is shared that
    // anyone can write to.
    this.hazards = new HazardField(plan.hazards ?? []);
    this.softBodies = new SoftBodyField(plan.softBodies ?? []);
    // **Every seat's controller, not the player's** — M25 Phase 1 (§25.5).
    // A loop rather than one assignment because the reason above is a reason
    // about worlds, not about who is riding: a second seat left holding the
    // previous plan's controller would ride the last route's hazards through
    // this one's road, which is precisely the bug this rebuild prevents for
    // seat 0.
    //
    // Each seat is rebuilt at **its own** slot in the new world, not at the
    // plan's spawn: seats stacked on one point is what a naive loop would
    // produce, and `resetSeats` below is what actually stands them there.
    for (let index = 0; index < this.seats.length; index += 1) {
      this.seats[index].controller = new EucController(this.terrain, {
        spawn: this.spawnForSeat(index),
        hazards: this.hazards,
        softBodies: this.softBodies,
      });
    }
    this.challenge = new ChallengeRun(plan.id, plan.checkpoints);
    this.trackDay = new TrackDayRun(plan.id, plan.checkpoints, plan.lap ?? null);
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
    // first sweep in the new world cannot be a spear across it. **Every seat's**
    // — a swing left running on seat 1 is the same spear.
    for (const seat of this.seats) seat.paddle.cancel();

    // **Every seat's camera learns the new geometry** — M25 Phase 3. The probe
    // closes over `this.terrain`, which the block above replaced, so a camera
    // left holding the old closure would pull its arm in against a building
    // that is no longer there. One loop, the same one the constructor uses.
    this.wireSeatCameras();

    this.applyTuning();
    this.menus.setChallengeAvailable(this.challenge.available);
    this.renderer.setCheckpointProgress(this.challenge.state.nextIndex);
    // Puts **every** rider at their own slot in the new world and clears every
    // trace of the old one they could still be carrying — smeared
    // interpolation, sparks in the air, a tyre still roaring over a surface
    // that is gone. `New route` from the pause card comes through here, so
    // this is what keeps a couch session together across a world swap.
    this.resetSeats();
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
   * rig every swap. **The pose sync after add**, or the next frame draws the
   * new rig at the origin while the chase camera eases across the map after it
   * — the same smear `Game.syncPoses` exists to prevent after a teleport.
   *
   * The status light is re-stated for the same reason `installLevel` replays
   * `applyTuning`: a fresh rig starts on its own defaults, and the wheel would
   * otherwise go dark mid-warning.
   */
  private installCharacter(id: CharacterId): void {
    // **The player's own seat, and deliberately not a loop over seats** —
    // unlike `installLevel` above. A world is everyone's; a character is one
    // rider's. `id` comes from `GameOptions.character`, which is the *player's*
    // saved choice, and §25.5 Phase 5 is explicit that seat 1's pick is session
    // state that never reaches the options record. A loop here would dress both
    // riders as whoever seat 0 last chose, which is the one thing q68 forbids.
    const seat = this.seats[0];
    this.installedCharacter = id;
    this.dressSeat(seat, id);
    this.renderer.setCharacter(id);
    // The camera half of what used to be a `syncPoses()` here. Split at M25
    // Phase 2 because that call looped **every** seat, so a rider who did
    // nothing had their interpolation history collapsed and jumped a frame —
    // exactly what `syncSeatPose`'s own note says it was extracted to stop.
    // The two lines below `dressSeat` moved past `setCharacter`, which is
    // provably free: that method touches only the ghost rig.
    this.syncCamera(seat);

    // **q68, held after the fact and not only at the join panel.** The rule is
    // that two riders on one screen are never the same character, and the
    // chooser is reachable from the title while a world is live — so a player
    // can pick the very rider sitting beside them. Their choice wins, and
    // whoever else was wearing it moves.
    for (const other of this.seats) {
      if (other === seat || other.character !== id) continue;
      const moved = this.characterBeside(id);
      this.dressSeat(other, moved);
      // **The session field moves with the geometry**, which is `dressSeat`'s
      // own rule (`seat.character` is written beside the rig) applied one level
      // up: `guestCharacter` is what the panel draws and what a re-entry
      // re-spawns from, so a guest re-dressed here and remembered as somebody
      // else would come back wearing the wrong rider.
      if (other === this.seats[1]) this.guestCharacter = moved;
    }
  }

  /**
   * Put one seat in a different character's geometry — M25 Phase 2.
   *
   * `installCharacter`'s body, made addressable so the q68 re-dress above can
   * use the same path the player's own swap does rather than a second copy of
   * it. Everything load-bearing about the order is stated on that method:
   * remove before dispose, sync after add, status last.
   *
   * The pose sync here is **this seat's only** — a character swap moves nobody
   * else, so nobody else's interpolation may be collapsed.
   */
  private dressSeat(seat: RiderSeat, id: CharacterId): void {
    this.renderer.scene.remove(seat.rig.group);
    seat.rig.dispose();
    seat.rig = createRidingRig(riderLook(id), machineLook(machineForCharacter(id)));
    // Written beside the rig, never anywhere else, so the id and the geometry
    // cannot drift — the rule `installedCharacter` has followed since M14.5.
    seat.character = id;
    this.renderer.scene.add(seat.rig.group);
    this.syncSeatPose(seat);
    seat.rig.applyStatus(
      seat.currentPose.alert,
      this.simTimeSeconds,
      1 - seat.currentPose.recoverBlend,
    );
  }

  /** Tell the menus which world is loaded. */
  private publishWorld(): void {
    this.menus.setWorld({ world: this.levelId, seed: this.seed });
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
    // **Before the pad layer, and it has to be** — M25 Phase 4. Disposing the
    // pad forgets every pad it was reading, which is exactly the signal a
    // claimed pad *dying* sends; a game being torn down must not answer that
    // by pausing itself and opening a claim window on a screen that is going
    // away. Forgetting the claims first makes the teardown say nothing.
    this.router.clearClaims();
    this.gamepad.dispose();
    this.touch.dispose();
    this.touchControls.dispose();
    this.coarsePointer?.removeEventListener('change', this.onPointerKindChange);
    this.finePointer?.removeEventListener('change', this.onPointerKindChange);
    this.reducedMotion?.removeEventListener('change', this.onReducedMotionChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.audio.dispose();
    this.stopTuningListener();
    this.stopOptionsListener();
    this.stopStateListener();
    this.overlay.dispose();
    this.panel.dispose();
    for (const seat of this.seats) this.unmountSeatHud(seat);
    this.menus.dispose();
    this.appState.dispose();
    this.options.dispose();
    this.records.dispose();
    this.contextNotice.dispose();
    this.tuning.dispose();
    // Every seat's rig, because invariant 10 is a claim about every geometry
    // and material this class ever built — one loop now rather than a second
    // line somebody has to remember when Phase 2 makes a seat 1.
    for (const seat of this.seats) seat.rig.dispose();
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
    // a fixed step. Two clocks go in because the pad serves two consumers on
    // different clocks: ride presses are stamped for `ActionState`, whose
    // buffer expiry compares against the simulation clock, while menu-repeat
    // pacing runs in the player's time — and the pause menu is exactly the
    // place the simulation clock is frozen, which is where repeats died.
    this.gamepad.poll(this.simTimeSeconds, nowMs / 1000);

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
    // A window dragged narrower stops being able to hold two halves — the
    // "re-evaluated on resize" half of the entrance predicate (§25.5 Phase 5).
    // It is deliberately not a reason to end a session already under way: the
    // players can see their own halves, and taking the game away from them
    // because a window lost forty pixels would be the rule outranking them.
    this.updateCouchAvailable();
    // The full input reset contract (master starter 8.2): a layout or
    // orientation change clears keyboard-held, gamepad, and analog state as
    // well as buffered one-shots, then re-anchors the clock. An earlier pass
    // kept held keys here on the theory that a desktop resize loses no keyup;
    // the M10 QA pass showed the other side of that trade — a throttle held
    // through an orientation change kept accelerating a rider the player could
    // no longer see framed correctly. A key still physically down re-expresses
    // itself on its next repeat, so the transient clear costs nothing real.
    // Scripted QA-bridge values survive; they are not a device.
    //
    // **Every seat's, since M25 Phase 4.** The window moved under both
    // players' hands, so the contract that held for the player holds for each
    // rider; the router is what turns "the player's input" into "every seat's"
    // without this line having to know how many there are.
    this.router.clearDevices();
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
    // **Every seat, in index order** — M25 Phase 2. The order is fixed rather
    // than incidental: two riders stepped in a different order on two runs
    // would take the same shared scratch state in a different sequence, and
    // `advance(n)` has to reach the same world every run for any of the browser
    // suite's assertions to mean anything.
    //
    // A reset step integrates nothing and, for seat 0, aborts the whole tick —
    // the single-seat semantics preserved exactly (see `stepSeat`). A *later*
    // seat's reset does not: it is one rider respawning, and stopping the cop,
    // the referees and the camera because somebody else pressed `R` would make
    // the second player able to stall the first player's world.
    let worldReset = false;
    // **And whether *any* seat respawned, which is a different question** — M26
    // Phase 1's QA repair. `worldReset` is seat 0's alone by design, because a
    // guest pressing `R` must not stall the player's cop, referees and camera;
    // but "somebody teleported this tick" is a fact about the world, and the
    // pair test below is the first thing that needed it. Enumerated rather than
    // inferred from `worldReset`, which is M25's own lesson about per-seat
    // contracts said one milestone later.
    let seatReset = false;
    this.pauseAsked = false;
    this.muteAsked = false;
    for (let index = 0; index < this.seats.length; index += 1) {
      const wasReset = this.stepSeat(this.seats[index], index, stepSeconds, riding);
      if (wasReset) seatReset = true;
      if (wasReset && index === 0) worldReset = true;
    }
    // **Any seat, once** — M25 Phase 4. Before the `worldReset` return rather
    // than after it, which is what keeps the single-seat semantics byte for
    // byte: seat 0 pressing R and Start on the same tick paused *and* reset
    // when both fired inside the claim loop, and nothing runs between the loop
    // ending and this, so one seat reaches exactly the game it always did.
    //
    // `M` is the keyboard shortcut for the settings screen's mute toggle
    // rather than a separate session flag, which is what `docs/PLANS.md` §4.7
    // said would happen when M9's faders landed: the key stays, and the state
    // it flips is the saved one.
    if (this.pauseAsked) this.goTo('paused');
    if (this.muteAsked) this.options.set({ muted: !this.options.current.muted });

    // **The pair, once, after both seats have stepped** — M26 Phase 1 (§26.3).
    //
    // Here rather than inside `stepSeat` for the reason the cop and the
    // referees are here: a contact is a fact about *two* riders, and a slice
    // that runs per seat would ask the question twice from two different
    // worlds — seat 0's against a seat 1 that had not moved yet, then seat 1's
    // against a seat 0 that had. One test, on the poses this step just
    // produced, so `advance(n)` reaches the same contact every run.
    //
    // **Above the `worldReset` return, and the QA repair moved it here.** It
    // sat below, on the reasoning that a respawn teleports a pose and a
    // teleport must read as nothing rather than as a ram — which was the right
    // rule attached to the wrong gate, because `worldReset` is seat 0's alone
    // and a *guest* respawning fell straight through it onto whoever was
    // standing at their spawn. The rule is now carried by `seatReset`, which
    // names every seat; and the call sits above the return so that seat 0's own
    // respawn — which never reaches this line otherwise — still clears the
    // pair's edge instead of leaving a cooldown armed across the teleport.
    // Contact is the only thing here that keeps state *between* steps, so it is
    // the only one that has to hear about a step it must not resolve.
    this.stepContact(stepSeconds, seatReset);

    if (worldReset) return;

    // **One particle system, one advance, whatever the seat count.** The
    // emitters inside the seat step run per rider and hand this shared pool
    // per-seat arguments; this is the pool's own clock, so it belongs to the
    // tick. It moved out of the seat slice at M25 Phase 1, past the audio
    // one-shots and the swing — neither of which touches `sparks` or `dust`,
    // so the move is an address change and not a frame of difference.
    this.renderer.stepParticles(stepSeconds);

    // **And the knock-downs beside it, hoisted at M25 Phase 2.** A struck
    // target's fall is a shared pool's animation, exactly as the particles
    // are, and it spent its whole life inside `stepPaddle` — per seat, gated
    // on `paddleEquipped` and on that rider not being crashed. Two
    // paddle-carrying seats would therefore have run every fall at double
    // rate, and one crashed rider would have stopped a fall the other rider
    // was watching.
    //
    // The move is a deliberate one-frame change and Phase 1's zero-change gate
    // is why it waited: a target now begins toppling on the step it was
    // struck rather than on the next one, and it keeps toppling through the
    // striker's own crash. Both readings are the better ones — the fall is the
    // *target's*, not the swinger's — and neither is something a scoring rule
    // can see, because `TargetField.strike` decides what counts and is
    // untouched.
    this.renderer.stepTargets(stepSeconds);

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
    this.stepTrackDay(stepSeconds);

    // Every seat's camera reacts to the state that step just produced, and is
    // stepped at the same fixed rate for the same reason the controller is: so
    // that `advance(n)` reaches a named camera state deterministically.
    //
    // **Here rather than inside `stepSeat`**, and the difference is a real
    // one: `stepSeat` returns early on a respawn, and a camera that skipped
    // its step on that tick would interpolate from a state one step stale
    // while the rider it follows had already been collapsed onto the spawn.
    // `resetRiderTo` collapses the camera too, so this loop is what puts it
    // back in step with the rider on the very next tick.
    const orbitRate = this.tuning.get('INSPECTION_CAMERA.orbitRate');
    for (const seat of this.seats) {
      copyChaseCameraState(seat.currentCamera, seat.previousCamera);
      seat.chase.step(stepSeconds, this.readChaseInput(seat, seat.currentPose));
      seat.chase.writeState(seat.currentCamera);

      // Diagnostic orbit. Also stepped rather than driven from wall time, so a
      // frozen inspection capture lands on the angle that was asked for.
      seat.previousOrbitAngle = seat.orbitAngle;
      seat.orbitAngle += orbitRate * stepSeconds;
    }
  };

  /**
   * One fixed step of one seat — M25 Phase 1 (docs/PLANS.md §25.5).
   *
   * Sample this seat's intent, claim its one-shots, integrate its
   * controller, dispatch the contact effects and audio events that step
   * produced, and swing its paddle. **Moved here verbatim from `step`**:
   * every comment below is the one that was written where the line used to
   * be, because the phase's gate is that nothing changed but the address.
   *
   * Two things deliberately stayed outside, and both are the tick's rather
   * than a rider's. The **clocks** (`tick`, `simTimeSeconds`,
   * `audioStepSeconds`, `hudStepSeconds`) advance once per step, so a
   * second seat must never touch them — running the audio accumulator per
   * seat would age the mix at twice the rate, invisibly, on the day Phase 2
   * lands. The **particle pool's own advance** left with them: the emitters
   * here are per seat and hand a shared pool per-seat arguments, but
   * `stepParticles` is that pool's clock.
   *
   * Two couplings that read as "this belongs to the cop" and do not:
   * `copyPose` at the top of the integration is what `stepChase` later
   * differences against the cop to get the M24 touch bust's closing speed,
   * and `chase.landingImpulse` must reach the camera in the same step as
   * the landing that caused it (the note on that line says why).
   *
   * **Returns whether this was a reset step**, which integrates nothing. For
   * seat 0 the caller then abandons the whole tick — the cop, the referees and
   * the camera all stand still for a step, which is the single-seat semantics
   * preserved exactly. For any later seat it is one rider respawning and the
   * world carries on; `step` says why.
   *
   * **What is per seat here and what is not** — M25 Phase 2. Everything the
   * method reaches through `seat.` is that rider's and always was. Everything
   * it reaches through `this.` is one of four things, and the phase's job was
   * to make each one deliberate:
   *
   *   - **Shared clocks**, read only: `simTimeSeconds`. Both riders see the
   *     same instant in the same tick, which is the point of a fixed step.
   *     The accumulating clocks (`tick`, `audioStepSeconds`, `hudStepSeconds`)
   *     and the particle pool's advance are outside this method entirely,
   *     because run per seat they would age at twice the rate — invisibly.
   *   - **Shared world**, correct as-is: the terrain through the controller,
   *     `targets` (whose `strike` is idempotent, so two riders racing for one
   *     target is safe), and `strikePoint`, a scratch vector written and read
   *     inside one statement pair with the seats stepped one at a time.
   *   - **Singular consumers** — at Phase 2 the camera, the HUD flag and the
   *     audio mix, all gated on `ownsTheFrame(seat)`. **Phase 3 gave the
   *     first two to the seat**, so the camera dip and the prompt edge are
   *     now simply addressed and the guard is gone from both. What still
   *     runs for `ownsTheFrame` only is the mix — one `RideAudioInput`, one
   *     selected crash voice, and q66's both-riders answer is Phase 5.
   *   - **Global one-shots** — `pause` and `muteAudio` are claimed here and
   *     *acted on* once per tick in `step`, however many seats pressed them
   *     (M25 Phase 4, §25.9's any-seat-once). `cameraCycle` and the rider
   *     half of `reset` are strictly per seat, because a second player's
   *     respawn teleporting the first, or their view swinging the other
   *     half of the screen, is not a design question. The referee half of
   *     `reset` stays the world's, and a couch session runs no referee at
   *     all.
   */
  private stepSeat(
    seat: RiderSeat,
    index: number,
    stepSeconds: number,
    riding: boolean,
  ): boolean {
    const sampledActions = riding
      ? seat.source.sample(this.simTimeSeconds)
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
      // actually begin another compression — unless the wheel is still on
      // the way *up*, where the press is the M24 spin jump and is delivered
      // now. The controller owns both answers.
      if (action === 'hop'
        && !seat.controller.canAcceptHop
        && !seat.controller.canAcceptSpin) continue;
      // The same contract for the swing, and the same reasoning: a press
      // thrown during the recovery of the last swing stays latched and is
      // claimed on the first step that can begin another one, so a player
      // swinging at two targets in quick succession is early rather than
      // ignored. Past the action buffer it lapses, which is what stops a
      // forgotten press firing at a target half a route later.
      if (action === 'swing' && !this.canAcceptSwing(seat)) continue;
      if (!seat.source.consume(action, this.simTimeSeconds)) continue;
      seat.consumed[action] += 1;
      if (action === 'hop') hopForController = true;
      if (action === 'swing') swingForPaddle = true;
      if (action === 'reset') {
        // A lap session resets to the start line's run-up exactly as a timed
        // run does, and for the reason below: `TrackDayRun.restart` throws the
        // lap in progress away, so a rider nine hundred metres round cannot
        // teleport to eighteen metres short of the line and close it.
        //
        // **Whoever pressed it, and only them** — M25 Phase 2. Both branches
        // were seat 0's while seat 0 was the only seat; a second player's
        // respawn teleporting the first is not something a later phase gets to
        // decide, so the rider half is addressed here and the referee half
        // below is not (a couch session runs no referee at all).
        const timed = this.challenge.state.phase !== 'idle'
          || this.trackDay.state.phase !== 'idle';
        if (timed) this.resetChallengeRider(seat);
        else this.resetRider(seat);
        // **During a timed run, `R` restarts the run rather than merely moving
        // the rider.** It is also the anti-exploit: the slice's route is a loop
        // that closes back into the plaza, so any teleport near the finish
        // that left the clock running would
        // teleport a rider two minutes in to within seconds of the line. See
        // `ChallengeRun.restart`, which is a no-op outside a run so free ride's
        // own `R` cannot arm one.
        this.challenge.restart();
        this.trackDay.restart();
        this.ghostRecorder.reset();
        this.pendingSplit = null;
        this.pendingLapFlash = null;
        this.resultsIn = 0;
        didReset = true;
      }
      if (action === 'cameraCycle') this.cycleCamera(seat);
      // **The two global one-shots are collected, not fired** — M25 Phase 4
      // (§25.9's any-seat-once). Every seat still *claims* its own latch here,
      // because a latch left pending would fire on the next tick instead; what
      // moved is the acting, to one place after every seat has stepped. Two
      // players hitting Start together must pause once, and `muteAudio` is the
      // one that made this non-optional: it is a toggle, so two claims in one
      // tick silenced and un-silenced the game and looked like a dead key.
      if (action === 'pause') this.pauseAsked = true;
      if (action === 'muteAudio') this.muteAsked = true;
    }

    // The reset step integrates nothing. `resetRider` has already collapsed
    // the poses and the camera onto the reset target; letting the rest of this step
    // run would apply the actions sampled above — a throttle still held when
    // R lands — *within the same step*, and "reset" would mean "almost the
    // target, moving slightly". Held input deliberately survives the reset and
    // takes effect from the next step: a rider holding W through a reset
    // expects to pull away again, not to have to re-press.
    if (didReset) return true;

    // Present a hop edge only on the step that legally claimed it. The sampled
    // action can remain true while its latch waits in the buffer; handing that
    // level to the controller would make an illegal airborne press look held.
    const actions: ActionSnapshot = sampledActions.hop === hopForController
      ? sampledActions
      : { ...sampledActions, hop: hopForController };

    seat.lastThrottle = actions.throttle;
    seat.lastSteer = actions.steer;

    copyPose(seat.currentPose, seat.previousPose);
    seat.controller.step(stepSeconds, actions);
    seat.controller.writePose(seat.currentPose);

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
    if (seat.controller.touchedDown) {
      const impact = seat.controller.lastLandingImpact;
      // **This seat's own camera dips, and only it** — M25 Phase 3. At Phase 2
      // this was `ownsTheFrame(seat)` guarding one shared camera, because a
      // second rider's landing shoving the player's view down is the plainest
      // possible way for two riders to stop being independent. The guard is
      // gone rather than relaxed: every seat has a camera now, so the impulse
      // is simply addressed and the two halves dip on their own landings.
      seat.chase.landingImpulse(impact);
      this.renderer.emitLandingParticles(
        seat.currentPose.x,
        seat.currentPose.y,
        seat.currentPose.z,
        seat.controller.currentSurface,
        impact / EUC.landingImpactReference,
      );
      // **Every rider's landing is heard** — M25 Phase 5, q66. One mix, but the
      // events in it belong to whoever produced them: a guest thumping down
      // beside you and making no sound is the plainest way for a couch session
      // to feel like one player and a decoration.
      this.audio.landing(impact / EUC.landingImpactReference, seat.controller.currentSurface);
    }
    const strike = seat.controller.pedalStrikeDepth;
    if (strike !== 0) {
      const side = strike > 0 ? 1 : -1;
      pedalEdgeWorld(seat.currentPose, side, this.strikePoint);
      this.renderer.emitSparks(
        index,
        this.strikePoint.x,
        this.strikePoint.y,
        this.strikePoint.z,
        Math.abs(strike),
        side,
        seat.currentPose.headingY,
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
    //
    // **`index` is which rider is throwing it** — M25 Phase 2. The pool, the
    // rate and the draw call stay shared; the *owed fraction* is per rider,
    // and it had to be, because this call fires on every step whether the
    // wheel is in water or not and a dry rider zeroes the debt. One shared
    // remainder plus a second seat would have deleted the spray outright.
    this.renderer.emitSurfaceSpray(
      index,
      seat.currentPose.y - seat.currentPose.groundY <= 1e-6,
      seat.currentPose.x,
      seat.currentPose.y,
      seat.currentPose.z,
      seat.controller.currentSurface,
      seat.currentPose.speed,
      seat.currentPose.headingY,
      stepSeconds,
    );

    // -- M8's four one-shots, dispatched from the same place, for the same
    // reason: a single-step edge seen from the render frame is a coin toss,
    // and `advance(n)` has to reach the same sounds every run.
    //
    // The pedal scrape is deliberately absent — it is continuous while the
    // pedal is down, so it is a voice driven from the pose below rather than
    // an event, exactly as its spark stream is.
    //
    // **Every rider's one-shots, and the mix is still one mix** — M25 Phase 5,
    // q66's answer. Phase 2 guarded these on `ownsTheFrame` because an ungated
    // second seat would have taken sound *away* from the player: one impact
    // retrigger window shared between two riders, and an eight-cue pool with
    // no headroom for two. Both are now paid for rather than avoided — the
    // retrigger window is per rider (`AudioDirector.riderBook`) and the pool
    // is sixteen — so the guards are gone rather than relaxed.
    //
    // What stays singular is what is genuinely the world's: the continuous
    // tyre-and-wind bed follows seat 0 and nobody else, because a focus that
    // followed the faster rider would chatter every time their speeds crossed
    // (§25.9).
    if (seat.controller.tookOff) {
      this.audio.hop(seat.controller.lastHopCharge);
      // The *prompt* edge is this seat's too, so a guest learning to hop
      // retires their own hint and nobody else's.
      seat.hoppedSinceHudUpdate = true;
    }
    const collision = seat.controller.obstacleImpact;
    // **A rider on the ground does not report kerb strikes**, and that rule is
    // the director's, per rider, since the Phase 5 QA repair — so this call is
    // unconditional again, exactly as it was before the phase. The order
    // matters and is deliberate: the strike is dispatched *before* the crash
    // edge below, so the wall that put a rider down is still heard on the step
    // it happened, and only their slide afterwards is silent.
    if (collision > 0) this.audio.impact(collision, index);
    if (seat.controller.crashed !== seat.wasCrashed) {
      // **Both ends, per seat** — one edge detector rather than one per seat
      // plus a spare in the audio layer. The start is a crash in this rider's
      // own voice (q66), which q68's distinct-characters rule is what makes
      // unambiguous: two riders on one screen are never the same character, so
      // a fall you hear is a fall you can place. The end is the recovery
      // chirp, and it is addressed for the same reason.
      //
      // It also moved the chirp from the render clock onto the fixed step,
      // which is strictly better and matches every other one-shot here:
      // `advance(n)` reaches the same sounds every run.
      if (seat.controller.crashed) {
        this.audio.crash(seat.currentPose.speed, crashVoiceFor(seat.character), index);
      } else {
        // **And the end, since the Phase 5 QA repair.** The director used to
        // watch for this itself, from the falling edge of the shared
        // `RideAudioInput.crashed` — which is seat 0's, so a guest who crashed
        // and picked themselves up got no recovery chirp at all. The edge is
        // already detected here, per seat, for the crash's *start*; both ends
        // of it belong at the same detector rather than one here and one in a
        // layer that cannot count riders.
        this.audio.recovered(index);
      }
      seat.wasCrashed = seat.controller.crashed;
    }

    // The swing, stepped here and nowhere else (M14), for the reason the timed
    // run below is: it is fed the pose this step just produced, at the fixed
    // rate, so a hit is reproducible under `advance(n)`.
    this.stepPaddle(seat, stepSeconds, swingForPaddle);

    return false;
  }

  /**
   * Is this the seat the world's singular things are following? — M25
   * Phase 2, narrowed at Phase 3.
   *
   * **Most of its sites did not change meaning — they went away.** The
   * predicate existed so that Phase 3 would have one name to find, and what
   * it found was that a second rider's landing dipping the player's camera,
   * and a second rider's hop retiring the player's prompt, were both symptoms
   * of there being one camera and one prompt. Each seat has both now, so
   * those two sites are addressed rather than guarded.
   *
   * What is left is what is genuinely the world's or the player's:
   *
   *   - the **continuous audio bed** — one `RideAudioInput`, fed from this
   *     seat's speed, load and surface. Phase 5 took the *one-shots* off this
   *     predicate (q66: every rider's events are heard, each crash in its own
   *     character's voice) and deliberately left the bed on it: a focus that
   *     followed the faster rider would chatter every time the two crossed;
   *   - the **saved options record** — `seenPrompts` and the FOV trim answer
   *     for the person whose browser this is, never for a guest;
   *   - the **cop, the particle field and the referees**, which a couch
   *     session does not run at all.
   */
  private ownsTheFrame(seat: RiderSeat): boolean {
    return seat === this.seats[0];
  }

  /**
   * Resolve one rider-to-rider contact — M26 Phase 1 (§26.3).
   *
   * The composition root's whole share of the mechanic: read the live tuning,
   * hand the pure pair the two bodies this step produced, and spend whatever
   * it returns on each side's own controller. `simulation/contact.ts` knows
   * nothing about seats and `EucController.bump` knows nothing about who hit
   * it; this is the only place that knows both, which is what keeps the
   * options firewall and invariant 1 intact by construction.
   *
   * **Velocity is derived from the pose the same way `bump` folds it back**,
   * from signed speed along the clean heading. The clean heading and never
   * `headingY + wobbleYaw`: the wobble lives on the machine child by M13's
   * visual-ownership rule, and a contact resolved on the wobbled heading would
   * shove two riders along an axis their bodies are not travelling on.
   *
   * A crashed rider, or one inside the recovery invulnerability window, is
   * refused by `bump` itself rather than here — a contact is a fact about two
   * positions, and what a rider *does* with one is the controller's answer.
   * The edge is therefore spent even when both sides refuse it, which is the
   * right reading: the pair met, and it is one meeting.
   */
  private stepContact(stepSeconds: number, seatReset: boolean): void {
    // **A pair that is not being resolved has no history** — the QA repair's
    // one rule, in the one place that knows when that is true.
    //
    // `ContactPair` clears its own cooldown the moment a pair separates, which
    // is what makes the next overlap a new contact; it cannot do that on a step
    // nobody hands it. So every reason to skip the test is also a reason to
    // forget: contact switched off, the guest sent home, or a rider teleported
    // this tick. Each of those used to leave a cooldown armed across a
    // discontinuity, and the symptom was always the *next* session's first bump
    // going missing rather than anything visible in the session that caused it.
    if (!this.contactLive || seatReset) {
      this.contactPair.clear();
      return;
    }

    const first = this.seats[0];
    const second = this.seats[1];

    // **Read through `LiveTuning`, never `CONTACT` directly** — see
    // `contactTuning`. The four F4 sliders exist for the Phase 2 ride gate and
    // reach the ride through exactly these four lines.
    const tuning = this.contactTuning;
    tuning.radiusMetres = this.tuning.get('CONTACT.radiusMetres');
    tuning.cooldownSeconds = this.tuning.get('CONTACT.cooldownSeconds');
    tuning.separationSpeed = this.tuning.get('CONTACT.separationSpeed');
    tuning.speedCost = this.tuning.get('CONTACT.speedCost');

    writeContactBody(first.currentPose, this.contactBodies[0]);
    writeContactBody(second.currentPose, this.contactBodies[1]);

    const contact = this.contactPair.step(
      stepSeconds,
      this.contactBodies[0],
      this.contactBodies[1],
      tuning,
    );
    if (contact === null) return;

    // **The separation first, and every step** — the two halves are on
    // different clocks (`simulation/contact.ts`). Two riders in the same place
    // is a fact that stays true until it stops being true, so it is answered
    // whenever it is asked; the wobble and the speed shed are an event, and
    // §26.3's cooldown is theirs alone. Each side moves its own half, along
    // the axis, in opposite directions.
    first.controller.separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
    second.controller.separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);

    const charge = contact.charge;
    if (charge === null) return;
    first.controller.bump(charge.first.pushX, charge.first.pushZ, charge.first.speedCost);
    second.controller.bump(charge.second.pushX, charge.second.pushZ, charge.second.speedCost);
  }

  /**
   * Fill this seat's camera input from a pose. Allocation-free.
   *
   * **The struct is the seat's own since M25 Phase 3.** One shared scratch was
   * correct while every caller filled it and consumed it inside a single
   * statement; the split frame has two callers per frame that want the value
   * to survive a `resolveChaseView`, and an invariant that has to hold for
   * every future caller is worth two objects a session to delete.
   */
  private readChaseInput(seat: RiderSeat, pose: EucPose): ChaseCameraInput {
    const input = seat.chaseInput;
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
    // **Every seat: interpolate it and draw it** — M25 Phase 2. `renderSeat`
    // was already seat-pure at Phase 1 (its only two reaches outside the seat
    // are the mode's paddle flag and the simulation clock, both read-only and
    // both the same for everyone), so drawing a second rider is this loop and
    // nothing else. Posing the rigs is done for every seat *before* the
    // passes below, because both rigs are in the one scene and both are drawn
    // by both passes — a rig posed inside the pass loop would be posed twice
    // per frame for no gain.
    for (const other of this.seats) this.renderSeat(other, alpha);
    const seat = this.seats[0];

    // Seat 0's interpolated pose, for the things that are still genuinely
    // singular below: the cop, the audio mix and the ghost. Everything that
    // split at Phase 3 reads its own seat's pose inside the pass loop.
    const pose = seat.renderPose;

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

    // **One mix, still seat 0's.** q66's answer — every one-shot and warning
    // for both riders — is Phase 5's plumbing, and it is plumbing rather than
    // a gate: the engine has one `RideAudioInput` and one selected crash
    // voice. Phase 3 splits the picture, not the sound.
    this.updateAudio(pose);
    this.updateGhost();

    // Both HUDs, before the passes, because the DOM is drawn by the browser
    // over the whole canvas rather than inside either half's scissor box.
    // The step clock is read once and cleared once (see `updateHud`).
    const hudSeconds = this.hudStepSeconds;
    this.hudStepSeconds = 0;
    for (let view = 0; view < this.seats.length; view += 1) {
      this.updateHud(this.seats[view], view, hudSeconds);
    }

    // **The frame, one pass per seat** — M25 Phase 3 (docs/PLANS.md §25.5).
    //
    // Clear once, then draw each half. The three things moved between the
    // passes are the three singular objects each half needs pointed at its own
    // rider: the shadow cascade (one directional light, one depth target), the
    // surround plane (one mesh, which is what stops the world running out
    // under a rider who has ridden far from the origin), and the camera. None
    // of them is duplicated — there is one world, and each pass is a different
    // window onto it.
    //
    // The order inside is load-bearing: the shadow map is re-rendered inside
    // `renderView`, so the focus has to move *before* the pass rather than
    // after it, or each half would be lit for the rider drawn before it.
    this.renderer.beginFrame();
    for (let view = 0; view < this.seats.length; view += 1) {
      const drawn = this.seats[view];
      const at = drawn.renderPose;
      this.renderer.setShadowFocus(at.x, at.y, at.z);
      this.terrainView.setSurroundCentre(at.x, at.z);
      this.placeCamera(drawn, view, alpha);
      this.renderer.renderView(view);
    }
  };

  /**
   * One drawn frame of one seat — M25 Phase 1 (docs/PLANS.md §25.5).
   *
   * Interpolate this seat's two most recent poses into its render pose, put
   * its paddle where that interpolated pose says, and draw its rig there.
   * Moved from `render` at M25 Phase 1.
   *
   * Returns nothing and leaves `seat.renderPose` filled, because the frame's
   * own work downstream reads it: since Phase 3 the shadow cascade, the
   * surround plane and the camera are re-pointed at **this seat's** pose
   * before this seat's pass, and the audio mix still reads seat 0's.
   *
   * **The interpolation is `lerpPose`'s, and must not be written out by hand
   * again.** That helper (`simulation/EucController.ts`, and the cop's path
   * since M18) walks `POSE_SCALARS`, which is *derived* from every numeric key
   * of a fresh pose. Until 2026-08-23 this method interpolated the player with
   * a hand-written block that named 43 of the type's 45 scalars, and the two
   * it did not name were `attack` and `carveStance` — added at M23, both
   * consumed by `RidingRig.apply`, and therefore frozen at their spawn value
   * of zero for every frame the player has ever been drawn in. The cop wore
   * both stances from the day he shipped; the player wore neither, and nothing
   * failed, because an enumeration that stops covering a struct is silent by
   * construction. One derived writer for both riders is the fix, and keeping
   * it derived is the part that matters.
   *
   * Order inside is load-bearing three times over and each note says why:
   * interpolate before the head is written, write the head before the stance
   * is solved, solve the stance before the status light is stated.
   */
  private renderSeat(seat: RiderSeat, alpha: number): void {
    // Interpolating between the two most recent states is the other half of a
    // fixed-step loop; without it the view stutters whenever the display
    // cadence and the step rate disagree, which is almost always.
    //
    // One helper, shared with the cop, and derived from the type rather than
    // enumerated: see the note above this method for what the hand-written
    // block it replaced had been quietly leaving out since M23.
    const pose = seat.renderPose;
    lerpPose(seat.previousPose, seat.currentPose, alpha, pose);

    // The swing, recorded before the stance is solved so the arm is posed on
    // this frame's angle rather than the last one's. The head is recomputed at
    // the *interpolated* pose: the hit test swept through a fixed-step head, and
    // drawing that one would leave the paddle up to a fifth of a metre behind
    // its own rider at 50 mph.
    if (this.paddleEquipped) {
      seat.paddle.writeHeadFor(pose, seat.paddleHead);
      seat.rig.applySwing(seat.paddleHead, seat.paddle.angle, seat.paddle.armCommitment);
    } else {
      seat.rig.applySwing(null, 0, 0);
    }
    seat.rig.apply(pose);

    // The machine's own status light (M6). Driven from the simulation clock
    // rather than wall time, so `advance(n)` reaches the same pulse every run.
    // The third argument is the power-on flare after a crash recovery: full
    // at the instant the rider is restored, gone as the recovery blend
    // finishes. It replaced the recovery chirp the owner silenced.
    seat.rig.applyStatus(pose.alert, this.simTimeSeconds, 1 - pose.recoverBlend);
  }

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
  private updateHud(seat: RiderSeat, index: number, hudSeconds: number): void {
    // **One HUD per seat since M25 Phase 3.** Everything below that was
    // `this.seats[0]` is now the seat that was asked for; everything that
    // reaches a *referee* is unchanged and shared, because a run, a lap, a
    // score and a chase are the world's rather than a rider's.
    //
    // `hudSeconds` is passed in rather than read off the field, and that is
    // the one thing about this method a second seat could have broken
    // silently: `hudStepSeconds` is an accumulator advanced once per fixed
    // step and zeroed by its consumer. Left as a field read, the first seat
    // would have consumed the whole interval and every later seat would have
    // been handed a dt of zero — the prompt timeout would never fire for the
    // guest, and nothing would have failed.
    const pose = seat.renderPose;
    const riding = this.appState.acceptsRideInput;

    const run = this.challenge.state;
    const lap = this.trackDay.state;
    seat.hudView = seat.hudModel.update(this.simTimeSeconds, {
      speed: pose.speed,
      powerStage: seat.controller.powerWarning,
      tiltBack: pose.tiltBack,
      offCourse: seat.controller.offRoute,
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
          // The two facts §4.4 asked for. The grace comes off the referee, so
          // the number on screen is the clock the rule is actually keeping
          // rather than a copy of it maintained here.
          strayGrace: this.chaseRun.state.strayGrace,
          homeRadians: this.directionToRoute(pose),
        }
        : undefined,
      // The lap lane — M23. It shares the run lane with the timed run and the
      // two can never both be present: they are different app states, and
      // `hudModel.ts` prefers this one when it is.
      // **Gated on the referee's phase, not on the app state**, which is what
      // the timed run's lane does one field up and for the reason a pause
      // exists: a player who paused to read their lap time must not have the
      // number they paused to read disappear. The gates stay lit through the
      // same pause (`enterState`), so a lane that vanished would leave the
      // lines on screen with no clock beside them.
      trackDay: lap.phase !== 'idle'
        ? {
          phase: lap.phase,
          lap: lap.lap,
          elapsed: lap.elapsed,
          valid: lap.valid,
          // **The time to beat, decided here rather than on screen.** It is
          // whichever of the stored record and this afternoon's best is
          // quicker, which is normally the same number — a lap that beats the
          // record replaces it immediately — and is not on the first lap of a
          // session on a world whose record was set by somebody else's browser
          // and then cleared. A lane that reasoned about which of two to show
          // would be a second opinion about what the player is racing.
          bestLapSeconds: lap.bestLapSeconds === null
            ? lap.recordSeconds
            : lap.recordSeconds === null
              ? lap.bestLapSeconds
              : Math.min(lap.bestLapSeconds, lap.recordSeconds),
          lastLapSeconds: lap.lastLapSeconds,
          nextLabel: lap.nextLabel,
          directionRadians: this.directionToCheckpoint(lap.nextIndex, pose),
          distanceMetres: lap.distanceToNext,
          // Consumed rather than read, exactly as the timed run's split is: a
          // crossing is one step's edge, and leaving it set would re-arm the
          // model's dwell on every frame for as long as the player rode.
          split: this.takePendingLapFlash(),
        }
        : undefined,
      // Read off the controller rather than derived from `pose.speed` — M20.
      // The cutout's thresholds are live-tunable and the controller owns them;
      // a HUD that recomputed the ratio would be a second opinion about when
      // the wheel is in trouble, and it would disagree the first time anybody
      // touched F4.
      overspeed: seat.controller.overspeed,
    });

    const prompt = seat.onboarding.update(this.simTimeSeconds, hudSeconds, {
      riding,
      throttle: seat.lastThrottle,
      steer: seat.lastSteer,
      speed: pose.speed,
      hopped: seat.hoppedSinceHudUpdate,
      crashed: pose.crashBlend > 1e-6,
      // **This seat's device, not the machine's** — M25 Phase 4. See
      // `promptDeviceFor`: the guest holding the keyboard must not be told to
      // press A because the player beside them picked up a pad.
      device: this.promptDeviceFor(index),
    });
    seat.hoppedSinceHudUpdate = false;
    seat.hudPrompt = prompt.prompt;
    // **Only seat 0's progress is ever written down.** A guest's prompts are
    // session state (§25.5), and the saved record answers for the person whose
    // browser this is. `takeSeenChanged` is consume-on-read, so seat 1's flag
    // is deliberately left unread rather than read and discarded — nothing
    // else looks at it, and a future reader should find it still set.
    if (this.ownsTheFrame(seat)) this.persistSeenPrompts();

    if (seat.hud?.visible === true) seat.hud.update(seat.hudView, prompt.text);
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
    const state = this.appState.current;
    if ((state !== 'challenge' && state !== 'trackDay') || !this.ghostPlayer.hasTrack) {
      this.renderer.setGhostVisible(false);
      return;
    }

    // **The lap ghost is the same recording read at a different clock, and
    // that is the whole of §23.6's "one genuine delta".** A time-trial ghost is
    // sampled at run seconds and plays once; a lap ghost is sampled at *lap*
    // seconds, so it restarts on the line beside the player and every flying
    // lap is raced side by side against the stored best. There is no second
    // representation, no seek, and no state — the referee's lap clock going
    // back to zero is the restart.
    const running = state === 'trackDay' ? this.trackDay.state : this.challenge.state;
    if (
      running.phase !== 'running'
      || !this.ghostPlayer.sample(running.elapsed, this.ghostSample)
    ) {
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

  /** The same, for the lap lane. See `pendingLapFlash`. */
  private takePendingLapFlash(): LapFlash | null {
    const flash = this.pendingLapFlash;
    this.pendingLapFlash = null;
    return flash;
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
    // **One mix, and two different questions asked of the seats** — M25 Phase
    // 5, q66. The continuous bed is seat 0's: the motor, the tyre, the wind and
    // the scrape are what *this* wheel is doing, and a bed that followed
    // whichever rider was faster would chatter every time their speeds crossed
    // (§25.9). The *warnings* are everybody's, two fields below, because a
    // guest riding into tilt-back with no beep is being told nothing.
    const seat = this.seats[0];
    const input = this.audio.input;
    input.speed = pose.speed;
    // What the player is *asking* for, not what the wheel achieved. A throttle
    // held into a hill is the sound of working hard even before the speed
    // answers, and that lead is most of why the motor feels connected. Taken
    // from the last step rather than sampled again here, because `sample()`
    // allocates and the step has already paid for it.
    input.throttle = seat.lastThrottle;
    input.load = seat.controller.powerLoad;
    input.powerStage = loudestWarning(this.warningStates());
    // M20. The same number the HUD glyph blinks at, from the same getter on the
    // same frame — the two cues are one warning on two channels, and a player
    // riding muted has to be told exactly what a player with sound is told.
    // The nearest *upright* seat's since M25 Phase 5 (`app/riderMix.ts`).
    input.overspeed = nearestCutout(this.warningStates());
    input.surface = seat.controller.currentSurface;
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
   * Every seat, as the two warning questions need them — M25 Phase 5.
   *
   * **The warnings are the one part of the mix that is not seat 0's** (q66):
   * a silent tilt-back for the guest would be unfair in the most concrete way
   * this game has, because the beep is how a rider knows to back off before
   * the wheel decides for them. One director, one ladder, one beep — fed the
   * worst answer among the riders rather than duplicated per seat, which is
   * §25.5's "without doubling the continuous director" taken literally.
   *
   * The arithmetic itself is `app/riderMix.ts`, so that "a rider on the ground
   * is not warned about" has a headless home; this is only the adapter from
   * the seats to it. A generator rather than an array because it runs on every
   * drawn frame and the answer is consumed immediately.
   */
  private *warningStates(): Generator<RiderWarningState> {
    for (const seat of this.seats) {
      yield {
        crashed: seat.controller.crashed,
        powerWarning: seat.controller.powerWarning,
        overspeed: seat.controller.overspeed,
      };
    }
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
  private placeCamera(seat: RiderSeat, view: number, alpha: number): void {
    const camera = this.renderer.cameraFor(view);
    const pose = seat.renderPose;

    if (seat.cameraMode === 'orbit') {
      const angle = seat.previousOrbitAngle
        + (seat.orbitAngle - seat.previousOrbitAngle) * alpha;
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
      this.renderer.setFieldOfView(view, seat.chase.tuning.fovAtRest);
      return;
    }

    lerpChaseCameraState(seat.previousCamera, seat.currentCamera, alpha, seat.renderCamera);
    const resolved = seat.chaseView;
    resolveChaseView(
      seat.renderCamera,
      this.readChaseInput(seat, pose),
      seat.chase.tuning,
      resolved,
    );

    camera.position.set(resolved.positionX, resolved.positionY, resolved.positionZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(resolved.targetX, resolved.targetY, resolved.targetZ);
    if (resolved.roll !== 0) camera.rotateZ(-resolved.roll);
    // The player's field-of-view trim is applied here rather than inside the
    // camera, and that is the options firewall being kept at the last possible
    // moment: `chaseCamera.ts` eases between two authored angles and knows
    // nothing about a preference. A trim moves both ends together, so the
    // speed ease survives at every setting.
    // **The player's trim, and only seat 0's.** `fieldOfViewTrimRadians` is a
    // saved option, so it answers for the person whose browser this is; a
    // guest's half takes the untrimmed angle. The renderer applies the split
    // widening on top of whatever arrives, so the trim still moves both ends
    // of the speed ease together (see `GameRenderer.splitFieldOfView`).
    const trim = this.ownsTheFrame(seat) ? this.fieldOfViewTrimRadians : 0;
    this.renderer.setFieldOfView(view, resolved.fov + trim);
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
    context.actions = this.seats[0].source.sample(this.simTimeSeconds);
    context.euc = this.seats[0].controller.snapshot();
    // The diagnostic reads seat 0 — the overlay is one panel about one rider,
    // and F3 during a couch session is the owner debugging his own half.
    context.cameraMode = this.seats[0].cameraMode;
    context.cameraDistance = this.seats[0].currentCamera.armDistance;
    context.cameraFov = this.seats[0].currentCamera.fov;
    context.cameraLookAhead = this.seats[0].currentCamera.lookAhead;
    context.cameraBank = this.seats[0].currentCamera.bank;
    // How far the camera is currently behind the rider's heading. The thing
    // the yaw-lag constants actually control, in the units they are set in.
    context.cameraYawLag = wrapAngle(
      this.seats[0].currentPose.headingY - this.seats[0].currentCamera.yaw,
    );
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
   * Quick reset — `R`, for one rider.
   *
   * Puts that rider back at their own slot in the world, stopped and upright,
   * and clears the interpolation history so the frame after a reset does not
   * draw a rig smeared between where they were and where they now are.
   *
   * **Addressed since M25 Phase 2.** It was seat 0's by construction while
   * seat 0 was the only seat; the moment a second rider could press `R` it had
   * to name whose reset it is, or one player's respawn would teleport the
   * other. Since Phase 3 the camera snap and the HUD's dwell timers went with
   * the rider — each seat has both — and what stays seat 0's inside
   * `resetRiderTo` is what is genuinely the *world's*: the particle field, the
   * mix, and where the cop stands.
   */
  private resetRider(seat: RiderSeat = this.seats[0]): void {
    this.resetRiderTo(this.spawnForSeat(this.seats.indexOf(seat)), seat);
  }

  /** Stand every rider at their own slot — a world swap, not a respawn. */
  private resetSeats(): void {
    for (const seat of this.seats) this.resetRider(seat);
  }

  /**
   * Put a timed attempt a short, derived run-up behind its start line.
   *
   * The first M10 pass sent every retry back to the level spawn, which happens
   * to be fifty metres from the slice's start. That is level authoring leaking
   * into retry cost. A generated course already owns the position and heading
   * of its start checkpoint, so deriving the run-up from that checkpoint keeps
   * retries quick on every producer without adding a slice-specific spawn.
   *
   * **The run-up is a spawn like any other, so it gets slots like any other**
   * — M25 Phase 2. The derived pose is the *base*, and `spawnSlot` puts each
   * seat beside it exactly as it does at the level spawn. Without that, this
   * branch and the plain reset beside it would disagree on the same key press:
   * `R` outside a run gives every rider their own slot, and `R` inside one
   * would stack them on a single point — the overlap the whole contract exists
   * to prevent. Seat 0's slot is the derived pose unchanged, so a
   * single-player retry lands exactly where it always has.
   */
  private resetChallengeRider(seat: RiderSeat = this.seats[0]): void {
    const start = this.levelPlan.checkpoints.find((checkpoint) => checkpoint.kind === 'start');
    if (start === undefined) {
      this.resetRider(seat);
      return;
    }

    const x = start.centre.x - Math.sin(start.headingY) * CHALLENGE.startRunupMetres;
    const z = start.centre.z - Math.cos(start.headingY) * CHALLENGE.startRunupMetres;
    const ground = createGroundSample();
    this.terrain.sampleGround(x, z, ground);
    const runup = { position: { x, y: ground.height, z }, headingY: start.headingY };
    this.resetRiderTo(spawnSlot(runup, this.seats.indexOf(seat), this.terrain), seat);
  }

  /**
   * Common half of the ordinary reset and the challenge run-up reset.
   *
   * Split at M25 Phase 2 and re-cut at Phase 3. The first two parts are
   * **this rider's** and run for whoever asked: the controller and the poses,
   * then the camera snap and the HUD's dwell timers, which moved up from the
   * frame's half when each seat got its own of both. What is left below the
   * early return is genuinely the **world's** — one particle field, one mix,
   * one cop — and runs only for the seat the world is following.
   */
  private resetRiderTo(spawn: LevelPlan['spawn'], seat: RiderSeat = this.seats[0]): void {
    seat.controller.reset(spawn);
    this.syncSeatPose(seat);
    seat.lastThrottle = 0;
    seat.lastSteer = 0;
    seat.wasCrashed = false;
    // A teleport, so the swing goes with the rider who was making it and the
    // previous head position is thrown away — M14. The unconditional distance
    // guard inside `Paddle` is the primary defence and does not depend on this
    // line; this is the half that does not depend on a threshold being right.
    // The two teleports it cannot cover are the automatic crash respawn, which
    // fires inside the controller on a timer with no signal out, and a reset
    // step, which returns from `step` before anything after it runs.
    seat.paddle.cancel();

    // -- This seat's own half of the screen — M25 Phase 3 --------------------
    //
    // Above the early return since Phase 3, and the move is the whole point of
    // the phase: a camera and a set of HUD dwell timers belong to the rider
    // who respawned. Left below it, a guest pressing `R` would keep the view
    // they had a moment ago and ease across the world after a rider who was
    // already standing at the spawn — and on a world swap, seat 1 would arrive
    // in a new level with a camera still resolving against the old one.
    this.syncCamera(seat);
    seat.orbitAngle = 0;
    seat.previousOrbitAngle = 0;
    // A rider back at the reset target is not still being warned about the
    // hill they were climbing, and is not still off the route they were off.
    // **This seat's dwell timers, not every seat's** — clearing the other
    // half's warning because somebody else respawned would hide a tilt-back
    // the moment a guest pressed `R`.
    seat.hudModel.reset();
    // And this rider's one-shot bookkeeping, which is per rider for the same
    // reason the dwell timers are — M25 Phase 5's QA repair. **Above the early
    // return, and it has to be**: `audio.reset()` below clears the whole mix
    // and runs only for seat 0, so a guest reset mid-ragdoll would otherwise
    // keep a crash flag nothing will ever clear and go silent against walls
    // for the rest of the session. Silent rather than a recovery chirp: a
    // rider put back at the spawn stopped having a crash, they did not survive
    // one.
    this.audio.resetRider(this.seats.indexOf(seat));

    // -- The world's half, and only for the seat the world is following ------
    if (seat !== this.seats[0]) return;

    // Sparks and dust are consequences of a ride that no longer happened.
    // Leaving them would hang a burst of them in the air at a place the rider
    // is no longer standing, which is the visual equivalent of the smeared rig
    // `syncPoses` exists to prevent.
    this.renderer.clearParticles();
    // And the audible equivalent: a tyre still roaring over gravel, a landing
    // thump still decaying, above a rider who is now standing still at the
    // spawn on pavement.
    this.audio.reset();
    this.lastSuspensionOffset = 0;
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

  /**
   * Which way the route is, relative to where the rider is pointing — M20, §4.4.
   *
   * `directionToCheckpoint`'s sibling, and it aims at a *line* rather than at a
   * point: the nearest place on the spine, which is where a rider who has
   * wandered onto the grass actually wants to go. Aiming at the next checkpoint
   * instead would send a rider who overshot a bend forward past the corner they
   * fell off, across whatever is between.
   *
   * **It reuses `spineAt` rather than locating again.** `stepChase` fills that
   * struct on the same step from the same pose, so this is one `sample` call on
   * a distance that is already known — and using a second, differently-windowed
   * `locate` here would risk the arrow pointing at the *other* road where a
   * generated route crosses itself, while the rule that ends the run measured
   * the one the rider is on.
   *
   * `NaN` when there is no spine, which `formatDirection` draws as no arrow at
   * all. A wrong arrow is worse than none: it is the one part of this banner a
   * player will follow without thinking.
   */
  private directionToRoute(pose: EucPose): number {
    const spine = this.spine;
    if (spine === null) return Number.NaN;
    spine.sample(this.spineAt.distance, this.spineSample);
    const dx = this.spineSample.x - pose.x;
    const dz = this.spineSample.z - pose.z;
    // Standing on the line is the one case with no bearing to give. It cannot
    // happen while the banner is up — it is 30 m away by definition — but the
    // struct is shared and a caller from anywhere else would get `atan2(0, 0)`.
    if (dx * dx + dz * dz < 1e-6) return Number.NaN;
    return wrapAngle(Math.atan2(dx, dz) - pose.headingY);
  }

  /**
   * Cycle one seat's view — M25 Phase 3.
   *
   * **Per seat, not global** (§25.5). It was ungated at Phase 2 because there
   * was one camera to cycle; with two, a guest pressing V to look at their own
   * wheel must not swing the player's view into an orbit mid-corner.
   */
  private cycleCamera(seat: RiderSeat): void {
    const next = (CAMERA_MODES.indexOf(seat.cameraMode) + 1) % CAMERA_MODES.length;
    seat.cameraMode = CAMERA_MODES[next];
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
  private enterState(state: AppStateId, from: AppStateId = state): void {
    const spec = this.appState.spec;

    // -- The couch session's two boundaries — M25 Phase 5 ---------------------
    //
    // **Both halves are here rather than at the buttons**, which is this
    // method's whole reason for existing: the join panel is reachable from one
    // button and left by four things (Back, Escape, the pad's B, and Start),
    // and a session torn down at three of them is a second rider who survives
    // the fourth.
    //
    // The seat is built on the way *in* to the panel and not on the way out of
    // it, which buys three things at once: the claim machinery has two seats to
    // hand devices to, both players watch the split they are about to ride
    // appear behind the card, and the rider each card names is standing in the
    // world wearing it. The cost is a rig for the length of a menu, and
    // `despawnSecondRider` gives every byte of it back — which invariant 10's
    // plateau test is what proves.
    if (state === 'couchJoin' && from !== 'couchJoin') this.openCouch();
    // Leaving for anywhere that is not the ride. `freeRide` is the one exit
    // that keeps the guest, because it is the exit that *is* the couch session.
    if (from === 'couchJoin' && state !== 'couchJoin' && state !== 'freeRide') this.closeCouch();
    // And leaving the couch ride itself. Quit lands on `title` from the pause
    // card; the results screen has no couch to come from in stage 1, and a
    // world swap keeps both seats on purpose (`installLevel`).
    if (state === 'title' && this.seats.length > 1) this.closeCouch();

    // **Every menu boundary is an input-reset moment** (master §8.2). A key
    // held as Escape lands never delivers its keyup to the game, so without
    // this the rider resumes at full throttle — the blur bug, arriving through
    // a different door. The loop's clock is re-anchored with it, or the time
    // spent reading a settings screen is replayed as simulation.
    if (spec.resetsInput) {
      // `KeyboardInput.reset` first, because it owns the per-key bookkeeping
      // that has to be cleared alongside the semantic state or the two
      // disagree about which keys are down.
      this.keyboard.reset();
      // **And then every seat, since M25 Phase 4.** The keyboard clears the
      // one sink it is pointing at; a menu boundary is the *world* stopping,
      // and a guest's buffered hop is exactly as stale as the player's. Before
      // this, a one-shot latched by seat 1 survived a pause and fired on the
      // first resumed step — the blur bug arriving through a third door, on a
      // rider whose device had not even been the one that opened the menu.
      this.router.clearAll();
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
    //
    // **Track Day joins on the same terms** — M23. Its gates are the same
    // volumes wearing the same renderer, and the `paused`/`settings` clause has
    // to ask *both* referees or a paused lap loses the lines it is being timed
    // against.
    const running = this.challenge.state.phase !== 'idle'
      || this.trackDay.state.phase !== 'idle';
    const timing = state === 'challenge'
      || state === 'trackDay'
      || state === 'results'
      || ((state === 'paused' || state === 'settings') && running);
    this.renderer.setCheckpointsVisible(timing);
    if (!timing) this.renderer.setGhostVisible(false);

    // The pit-in control exists only while there is a session to pit out of.
    this.menus.setEndSessionAvailable(
      state === 'paused' && this.appState.rideReturn === 'trackDay',
    );

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
    if (state === 'title' || state === 'freeRide' || state === 'challenge' || state === 'trackDay') {
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

    // A track day ends on exactly the two exits a timed run ends on, and for
    // the same reason: `paused` and the `settings` screen behind it are places
    // the player is coming back from, and every other way out is a decision to
    // stop. `results` is not here because a session reaches it by ending
    // itself — `endTrackDaySession` has already frozen the card.
    if ((state === 'title' || state === 'freeRide') && this.trackDay.state.phase !== 'idle') {
      this.trackDay.abandon();
      this.ghostRecorder.reset();
      this.resultsIn = 0;
      this.pendingLapFlash = null;
    }

    // The results panel is filled before it is shown, or the player reads one
    // frame of the previous run's numbers.
    if (state === 'results') this.menus.setResults(this.buildResultsView());

    for (const seat of this.seats) seat.hud?.setVisible(spec.showsHud);
    this.menus.show(menuScreenFor(state));
    // While a menu is up the pad drives the menu, not the wheel.
    this.gamepad.setMenuMode(spec.showsMenu);
    // And the on-screen controls leave the screen entirely, which also releases
    // whatever was under a thumb when the menu opened.
    this.updateTouchControls();

    // A rider who is not riding has no dwell timers worth keeping, and coming
    // back to the title must not leave a stale warning behind the card.
    // Every seat: leaving the ride is the world's event, not a rider's.
    if (!spec.acceptsRideInput) for (const seat of this.seats) seat.hudModel.reset();

    // After `menus.show`, so the panel it writes into is the one on screen —
    // and unconditionally, because the suppression flag has to be *cleared*
    // on every other screen as reliably as it is set on this one.
    this.updateCouchPanel();
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
  private handleMenuAction(
    action: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back',
    device: DeviceId,
  ): void {
    if (!this.appState.showsMenu) return;

    // **A claim press is not also a button press** — M25 Phase 5, and the pad's
    // half of the rule the keyboard's half is on `Menus.onKeyDown`. Both read
    // the same predicate: while the claim window is open, a device holding no
    // seat is a person sitting down, not a person choosing something.
    //
    // Only `confirm`. A pad with no seat may still walk the panel and may still
    // press B to leave — the guest is a person in the room, and refusing them
    // the Back button until they have sat down would be the panel arguing with
    // somebody who has decided not to play.
    if (action === 'confirm' && this.claimsFirst(device)) return;

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
    // And out of the two-player join panel — M25 Phase 5's QA repair. Its own
    // comment promised this ("a pad with no seat may still press B to leave")
    // and the branch was never written, so a guest who changed their mind was
    // stuck on the panel with nothing but the mouse. Every openable panel in
    // this game has exactly three doors — its Back button, Escape, and the
    // pad's B — and a missing one is a parity bug rather than a limitation.
    else if (this.appState.current === 'couchJoin') this.goTo('title');
    // `resumeRide()`, not `goTo('freeRide')`. The pad's Back is the third door
    // out of a pause, alongside Escape and the Resume button, and it is the one
    // that was still hard-coded to free ride — so a player who paused a timed
    // run and pressed B lost the run, the clock, and the ghost recording, with
    // no confirmation and nothing on screen to say what had happened.
    else if (this.appState.current === 'paused') this.appState.resumeRide();
  }

  /**
   * Which device's names one seat's first-ride prompts should use — M25
   * Phase 4.
   *
   * **From that seat's own claim when it has one**, because in a couch session
   * the machine-wide answer is wrong for at least one of the two players by
   * construction: with a pad on seat 0 and the keyboard on seat 1, "what has
   * this room been seen using" is `gamepad`, and the guest reading it is
   * looking at a keyboard. A claimed seat knows what is in its player's hands,
   * and nothing else does.
   *
   * Falls back to the machine-wide answer for an unclaimed seat, which is
   * every seat in every single-player session — so this changes nothing until
   * somebody claims something, and `touch` stays reachable exactly where it
   * always was (a touchscreen is never a claimable device, §25.5 Phase 4).
   */
  private promptDeviceFor(index: number): PromptDevice {
    const device = this.router.deviceFor(index);
    if (device === null) return this.promptDevice;
    return device === KEYBOARD_DEVICE ? 'keyboard' : 'gamepad';
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
    for (const seat of this.seats) seat.hud?.setTouchLayout(wanted);
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
   *
   * **A seat waiting for a device outranks everything but the off switch** —
   * M25 Phase 4. "Player 2's pad is gone" is the only one of these five a
   * player can be surprised by mid-ride, and reading "gamepad connected"
   * because the *other* pad is still fine would be the game agreeing that
   * nothing had happened.
   */
  private updateGamepadStatus(): void {
    const awaiting = this.router.awaitingSeat;
    this.menus.setGamepadStatus(
      !this.options.current.gamepadEnabled
        ? 'disabled'
        : awaiting !== null
          ? 'lost'
          : this.gamepad.connected
            ? 'connected'
            : this.gamepad.unusablePadSeen
              ? 'unsupported'
              : 'searching',
      awaiting ?? undefined,
    );
  }

  // ---------------------------------------------------------------------------
  // Claims — M25 Phase 4 (docs/PLANS.md §25.5)
  // ---------------------------------------------------------------------------

  /**
   * Open the claim window, and make every pad's current buttons stale.
   *
   * The two halves of *fresh press edge after the panel opens* are here in
   * one call because they are one rule: the router refuses claims while the
   * window is shut, and the pad layer refuses to see an already-held button
   * as a press. Either alone would let the button that opened the panel seat
   * a player who has not looked at it yet.
   *
   * Public because Phase 5's join panel and the pause card are what open it;
   * until they exist the QA bridge is the caller, which is what lets Phase 4
   * be proven before the screen that uses it is built.
   */
  beginClaiming(): void {
    this.gamepad.primeAll();
    this.router.openClaims();
  }

  /** Shut the claim window. Claims already made stand; they are session-only. */
  endClaiming(): void {
    this.router.closeClaims();
  }

  /** Every seat's device, indexed by seat. Null for empty *and* for waiting. */
  claimedDevices(): readonly (DeviceId | null)[] {
    return this.router.claimList();
  }

  /** Exchange the claimed devices between seats — the panel's Swap. */
  swapSeatDevices(): boolean {
    return this.router.swap();
  }

  /** Release one seat's device — the panel's Unclaim. */
  unclaimSeat(seat: number): boolean {
    this.requireSeat(seat);
    return this.router.unclaim(seat);
  }

  /** Forget every claim. The end of a couch session, and of `dispose`. */
  clearClaims(): void {
    this.router.clearClaims();
  }

  // ---------------------------------------------------------------------------
  // Two players — M25 Phase 5 (docs/PLANS.md §25.5)
  // ---------------------------------------------------------------------------

  /**
   * Would this device's confirm seat somebody rather than press something?
   *
   * **One predicate, two realisations**, because a confirm becomes a button
   * press in two different places: the pad's goes through `handleMenuAction`,
   * and the keyboard's is produced by the browser itself from a focused
   * `<button>` and can only be stopped by `preventDefault`. Writing the rule
   * twice is how one of them ends up not being updated; writing it once and
   * asking it twice is the version that stays true.
   *
   * And the predicate is the router's own, not a restatement of it: a press is
   * suppressed **exactly when it claims**, so the two can never drift into a
   * press that is swallowed and seats nobody.
   */
  private claimsFirst(device: DeviceId): boolean {
    return this.router.wouldClaim(device);
  }

  /**
   * Whether the title may offer a two-player session, recomputed from scratch.
   *
   * Cheap and idempotent, so every producer of a change simply calls it rather
   * than working out what the answer used to be: a layout change, the pointer
   * kind changing, and the first pad of the session all move it, and none of
   * them should have to know about the others.
   */
  private updateCouchAvailable(): void {
    this.couchAvailable = couchEligible({
      // The canvas's CSS width, not the screen's — it is the thing that gets
      // divided in two, and it is what `beforeFrame` already re-measures.
      viewportWidth: this.renderer.viewport().width,
      finePointer: this.finePointer?.matches ?? false,
      padSeen: this.padEverSeen,
    });
    // One field, two readers — the button and the QA bridge. A predicate
    // evaluated twice is a predicate that can be answered two ways.
    this.menus.setCouchAvailable(this.couchAvailable);
  }

  /**
   * Sit the second rider down and open the claim window — the join panel's
   * arrival, driven from `enterState` rather than from the button.
   *
   * The guest is re-derived here rather than only at boot, because the player
   * may have changed who *they* are since the last visit and q68 says the two
   * riders on one screen are never the same character. `spawnSecondRider`
   * enforces the same rule at its own door, so this is the panel agreeing with
   * the machinery rather than the only thing standing between them.
   */
  private openCouch(): void {
    // **Contact goes back on, every time, and that is a decision rather than a
    // consequence** — q81, M26 Phase 2. The owner asked for it about the
    // player: *"contact should reset to on in case players forget it
    // exists… so they're not left wondering later why no contact."* A couch is
    // a place where the person who turned something off is often not the person
    // who came back, and a setting that persists off silently removes a feature
    // from a room that has forgotten it exists. **Do not "improve" this by
    // remembering the setting** — §26.3 and §26.10 both say so, and this is the
    // line they are talking about.
    //
    // Here rather than in `closeCouch` because a session *starts* here: this is
    // the same moment, and the same argument, as the guest being re-derived on
    // the line below rather than only at boot.
    this.setContactEnabled(true);
    const taken = this.seats[0].character;
    if (this.guestCharacter === taken) this.guestCharacter = guestBeside(taken);
    if (this.seats.length < 2) this.spawnSecondRider(this.guestCharacter);
    this.beginClaiming();
    this.updateCouchPanel();
  }

  /**
   * End the couch session: forget the claims, then take the seat away.
   *
   * **Claims first, and the order is load-bearing.** `clearClaims` hands the
   * keyboard back to seat 0 through the router's own repoint; doing it after
   * the seat has gone would mean `removeSeat` doing that work instead, which
   * is a second path to the same state and the one Phase 4's QA pass found
   * broken. One path, taken deliberately.
   */
  private closeCouch(): void {
    this.endClaiming();
    this.clearClaims();
    if (this.seats.length > 1) this.despawnSecondRider();
    this.updateCouchPanel();
  }

  /**
   * Both seats are held; ride.
   *
   * Refused rather than throwing when they are not, exactly as `AppState.goTo`
   * refuses an illegal transition: the callers are a click and a pad press, and
   * a Start that arrived a frame after a pad went missing deserves to be
   * ignored rather than to end the session with an exception.
   *
   * The seats are reset on the way in so that both riders begin at the spawn
   * the world guarantees, whatever the panel spent its time doing — the
   * promise `spawnSecondRider`'s own note makes about this exact moment.
   */
  private startCouch(): void {
    if (!this.couchReady) return;
    this.endClaiming();
    this.resetSeats();
    this.goTo('freeRide');
  }

  /**
   * What is left for an empty seat to be claimed with.
   *
   * **Counted from the devices this machine has and the claims already made**,
   * rather than assumed. The title's entrance is deliberately loose about
   * whether a second device exists (see `app/couch.ts`), so this is where the
   * panel finds out — and a panel that could not say "there is nothing left"
   * would be telling a keyboard-only desktop to press a key that is already
   * spoken for.
   *
   * A pad the player has switched off in the settings screen is not a spare:
   * `padCount` is what the pad layer is *reading*, which is the same thing a
   * claim would need.
   */
  private spareDevice(): CouchSpare {
    const claimed = this.router.claimList();
    const keyboard = this.router.seatFor(KEYBOARD_DEVICE) === null;
    const padsHeld = claimed.filter((device) => device !== null && device !== KEYBOARD_DEVICE).length;
    const pad = this.gamepad.padCount > padsHeld;
    if (keyboard && pad) return 'both';
    if (pad) return 'pad';
    if (keyboard) return 'keyboard';
    return 'none';
  }

  /** True once every seat has a device holding it. What arms Start. */
  private get couchReady(): boolean {
    if (this.seats.length < 2) return false;
    return this.router.claimList().every((device) => device !== null);
  }

  /**
   * Step one seat's rider along the roster.
   *
   * **The two cards do the same thing to two different records**, and that
   * difference is the options firewall rather than a special case: seat 0's
   * choice goes into the store, which is the one path that changes a rider and
   * the one path that persists it, and the guest's is written here and nowhere
   * else. Each card steps over the other's pick, so q68 is a property of the
   * control and the panel has no invalid state to recover from.
   */
  private cycleCouchRider(seat: number, delta: 1 | -1): void {
    if (seat === 0) {
      this.options.set({ character: cycleGuest(this.options.current.character, this.guestCharacter, delta) });
      return;
    }
    this.guestCharacter = cycleGuest(this.guestCharacter, this.seats[0].character, delta);
    const guest = this.seats[seat];
    if (guest !== undefined) this.dressSeat(guest, this.guestCharacter);
    this.updateCouchPanel();
  }

  /**
   * Draw the join panel from the router and the roster.
   *
   * Called from every producer of a change rather than polled — a claim, a
   * rider step, a state transition — for `updateGamepadStatus`'s reason: one
   * writer, fed from the current state rather than from the last event.
   *
   * **Both seats are described whether or not the second one exists.** The
   * panel's markup is fixed at two cards, and a view that shrank to match the
   * seat count would leave the second card showing whatever it said last time
   * — which, on the frame after Back, is "Ready".
   */
  private updateCouchPanel(): void {
    const devices = this.router.claimList();
    const seats: CouchSeatView[] = [];
    for (let index = 0; index < COUCH_SEATS; index += 1) {
      const device = devices[index] ?? null;
      // Asked once and both answers derived from it, so "is it a pad" and
      // "which pad" cannot disagree.
      const pad = device === null ? null : padIndexOf(device);
      seats.push({
        device: device === null ? null : pad === null ? 'keyboard' : 'gamepad',
        // One-based for a player: the browser's pad 0 is the first gamepad.
        padNumber: pad === null ? null : pad + 1,
        awaiting: this.router.isAwaiting(index),
        // **The options record for seat 0, the session field for seat 1** —
        // which is the options firewall showing through the panel. It is also
        // the typed answer: `RiderSeat.character` is a `CharacterId`, and the
        // roster the cards cycle contains no cop.
        character: index === 0 ? this.options.current.character : this.guestCharacter,
      });
    }
    this.menus.setCouchView({
      seats,
      ready: this.couchReady,
      spare: this.spareDevice(),
      // Session state, straight from the field — M26 Phase 2. Not
      // `contactLive`: the panel is asking what the room chose, and the seat
      // count it would also have to satisfy is exactly what this screen exists
      // to arrange. A panel drawn from the verdict would show contact off to a
      // room that had turned nothing off.
      contact: this.contactEnabled,
    });
    // The keyboard's half of *a claim press is not also a button press*. Asked
    // fresh each time rather than latched, so the flag clears itself the moment
    // the keyboard takes a seat — including when it takes seat 0 and the panel
    // is still open for the guest.
    this.menus.setSuppressConfirmKeys(this.claimsFirst(KEYBOARD_DEVICE));
  }

  /**
   * A device pressed confirm. The router decides whether that means anything.
   *
   * Deliberately not gated on app state here: which screens can seat a player
   * is the *claim window's* answer, and asking it twice — once in the device
   * wiring and once in the router — is how the two come to disagree.
   */
  private claimSeatFor(device: DeviceId): void {
    this.router.claimPress(device);
  }

  /**
   * A pad this layer was reading has stopped being read — unplugged, dropped
   * from the browser's list, or switched off in the settings screen.
   *
   * **The seat is retained, never dissolved** (§25.5 Phase 4). A flat battery
   * is not a decision to leave the game, so the world stops, the status line
   * names the seat that lost its pad, and the claim window reopens so that
   * the same pad or a replacement rejoins by pressing a button. An unclaimed
   * pad leaving is nothing — that is the single-player unplug M9 shipped, and
   * it still just hands the axes back.
   */
  private onPadLost(index: number): void {
    const seat = this.router.noteDeviceLost(padDeviceId(index));
    // `noteDeviceLost` has already run `onClaimsChange`, which is what wrote
    // the status line; nothing more is owed for a pad nobody was holding.
    if (seat === null) return;
    this.beginClaiming();
    if (this.appState.acceptsRideInput) this.goTo('paused');
  }

  /**
   * One seat's prompt dismiss button, and the seen flag that follows from it.
   *
   * Addressed since M25 Phase 3: each HUD's own button was wired to its own
   * seat at mount, so a guest closing their hint cannot close the player's —
   * and only seat 0's dismissal is written down (`persistSeenPrompts`).
   */
  private dismissPromptFor(seat: RiderSeat): void {
    seat.onboarding.dismiss();
    if (this.ownsTheFrame(seat)) this.persistSeenPrompts();
  }

  private persistSeenPrompts(): void {
    // **Seat 0's, always.** Every caller already gates on `ownsTheFrame`; this
    // reads seat 0 directly rather than taking a seat so that there is no way
    // to call it *about* somebody else. A guest's progress through the hints
    // is session state and must never reach the saved record (§25.5).
    const onboarding = this.seats[0].onboarding;
    if (!onboarding.takeSeenChanged()) return;
    this.options.set({ seenPrompts: onboarding.seenPrompts() });
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
    // A tablet docked to a keyboard gains a fine pointer without a resize.
    this.updateCouchAvailable();
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
    for (const seat of this.seats) {
      this.syncSeatPose(seat);
      this.syncCamera(seat);
    }
  }

  /**
   * The rider half, for one seat: collapse the interpolation history onto the
   * controller's current truth and draw it there, so the next frame has no
   * stale endpoint to smear from.
   *
   * **Separated from the camera at M25 Phase 2**, because a second rider made
   * the two halves belong to different people. Collapsing every seat's history
   * because *one* of them respawned would freeze the other's interpolation for
   * a frame — a stutter nobody could explain, on a rider who did nothing.
   */
  private syncSeatPose(seat: RiderSeat): void {
    seat.controller.writePose(seat.currentPose);
    copyPose(seat.currentPose, seat.previousPose);
    copyPose(seat.currentPose, seat.renderPose);
    seat.rig.apply(seat.renderPose);
  }

  /**
   * Snap one seat's camera onto the rider it follows — M25 Phase 3.
   *
   * Addressed rather than global for the reason the pose sync beside it is:
   * collapsing *every* camera because one rider respawned would freeze the
   * other half's interpolation for a frame, which is a stutter on a rider who
   * did nothing.
   */
  private syncCamera(seat: RiderSeat): void {
    seat.chase.reset(this.readChaseInput(seat, seat.currentPose));
    seat.chase.writeState(seat.currentCamera);
    copyChaseCameraState(seat.currentCamera, seat.previousCamera);
    copyChaseCameraState(seat.currentCamera, seat.renderCamera);
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
    const controllerTuning = {
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
      // The max-speed cutout (M20). Live for the reason the ragdoll's switch
      // below is: the owner removed this feature once for being annoying, and
      // the gate is his own ride — so the edge, the ramp and the whole
      // feature's on/off have to move under him without a rebuild.
      overspeedBeepShare: this.tuning.get('EUC.overspeedBeepShare'),
      cutoutSpeedShare: this.tuning.get('EUC.cutoutSpeedShare'),
      cutoutHoldSeconds: this.tuning.get('EUC.cutoutHoldSeconds'),
      cutoutEnabled: this.tuning.get('EUC.cutoutEnabled'),
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
    };
    // **Every seat, then the cop.** F4 retunes the physics, not a rider: a
    // developer change that reached one controller and not another would put
    // two riders in one world on two different profiles, which is the silent
    // comparison this notification exists to prevent. Dorkins is a second
    // rider rather than a second ride, and so is seat 1 — the same argument
    // the paddle block below makes, and the one thing M25 Phase 1 left as a
    // singleton after claiming this method looped (§25.5).
    for (const seat of this.seats) {
      seat.controller.setTuning(controllerTuning);
    }
    this.copController?.setTuning(controllerTuning);

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
    this.chaseRun.touchBustMetres = this.tuning.get('CHASE.touchBustMetres');
    this.chaseRun.touchBustClosingSpeed = this.tuning.get('CHASE.touchBustClosingSpeed');
    this.chaseRun.strayLimitMetres = this.tuning.get('CHASE.strayLimitMetres');
    this.chaseRun.strayGraceSeconds = this.tuning.get('CHASE.strayGraceSeconds');
    this.chaseRun.trackerGapMetres = this.tuning.get('CHASE.trackerGapMetres');
    this.chaseRun.trackerHoldSeconds = this.tuning.get('CHASE.trackerHoldSeconds');
    if (this.copBrain !== null) {
      const brain = this.copBrain;
      brain.skill = this.tuning.get('CHASE.copSkill');
      brain.lookaheadSeconds = this.tuning.get('CHASE.lookaheadSeconds');
      brain.steerGain = this.tuning.get('CHASE.steerGain');
      brain.steerDamping = this.tuning.get('CHASE.steerDamping');
      brain.throttleGain = this.tuning.get('CHASE.throttleGain');
      brain.cutoutMarginShare = this.tuning.get('CHASE.cutoutMarginShare');
      // These are the controller values the high-speed policy reasons about.
      // Push them instead of importing today's frozen defaults in the brain,
      // so its ceiling and drag feedforward move with both riders on F4.
      brain.driveAcceleration = controllerTuning.leanToAccel
        * Math.sin(controllerTuning.maxLeanPitch);
      brain.dragCoefficient = controllerTuning.dragCoefficient;
      brain.cutoutSpeedShare = controllerTuning.cutoutSpeedShare;
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

    // **Every seat's paddle**, because F4 retunes the weapon rather than a
    // wielder — the same argument that gives the cop's paddle the identical
    // numbers three lines down. A loop, so a seat 1 that ever carries one is
    // not left swinging the defaults.
    for (const seat of this.seats) {
      seat.paddle.reach = this.tuning.get('PADDLE.reach');
      seat.paddle.headRadius = this.tuning.get('PADDLE.headRadius');
      seat.paddle.windupSeconds = this.tuning.get('PADDLE.windupSeconds');
      seat.paddle.activeSeconds = this.tuning.get('PADDLE.activeSeconds');
      seat.paddle.recoverSeconds = this.tuning.get('PADDLE.recoverSeconds');
      seat.paddle.startAngle = this.tuning.get('PADDLE.startAngle');
      seat.paddle.sweepRadians = this.tuning.get('PADDLE.sweepRadians');
    }
    // The cop's paddle is the same weapon with the same numbers — M18. Two
    // instances because two wielders cannot share one swing state machine, not
    // because the thing they are holding differs.
    //
    // Read off the tuning table rather than off seat 0's paddle, which is what
    // these seven lines used to copy. Same values by construction — the block
    // above sets that paddle from these very entries — and it stops the cop's
    // weapon depending on a *seat* existing, which is the coupling M25 Phase 1
    // would otherwise have written into the one subsystem it must not disturb.
    this.copPaddle.reach = this.tuning.get('PADDLE.reach');
    this.copPaddle.headRadius = this.tuning.get('PADDLE.headRadius');
    this.copPaddle.windupSeconds = this.tuning.get('PADDLE.windupSeconds');
    this.copPaddle.activeSeconds = this.tuning.get('PADDLE.activeSeconds');
    this.copPaddle.recoverSeconds = this.tuning.get('PADDLE.recoverSeconds');
    this.copPaddle.startAngle = this.tuning.get('PADDLE.startAngle');
    this.copPaddle.sweepRadians = this.tuning.get('PADDLE.sweepRadians');

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
      overspeedLevel: this.tuning.get('AUDIO.overspeedLevel'),
    });

    // Per-surface response, pushed the same way and for the same reason — and
    // to every seat and the cop for the same reason again: tarmac cannot be
    // one thing under one rider and another thing under the rider beside them.
    // Only the paths the registry actually exposes are read — a surface with
    // no slider keeps its frozen default, and asking `LiveTuning` for a path
    // it does not know about is an error rather than a silent zero.
    for (const id of SURFACE_IDS) {
      const overrides: Record<string, number> = {};
      for (const field of ['rollingResistance', 'grip', 'roughnessAmplitude'] as const) {
        const path = `SURFACES.${id}.${field}`;
        if (this.tuning.specFor(path) !== undefined) overrides[field] = this.tuning.get(path);
      }
      if (Object.keys(overrides).length > 0) {
        for (const seat of this.seats) {
          seat.controller.setSurfaceResponse(id, overrides);
        }
        this.copController?.setSurfaceResponse(id, overrides);
      }
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
      // Every seat: the unit is a preference about *reading numbers*, and two
      // halves of one screen disagreeing about miles and kilometres would be
      // a bug rather than a courtesy to the guest.
      for (const seat of this.seats) seat.hudModel.setSpeedUnit(options.speedUnit);
    }

    // **Guarded, and the guard is the point.** This record is rewritten
    // mid-ride whenever a first-ride prompt is satisfied (`persistSeenPrompts`),
    // so an unguarded push would tear the rider down and rebuild it on the
    // frame the player first brakes. `previous === null` is the boot case,
    // where the rig was already built wearing this character above — so the
    // swap is skipped and only the audio voice is (re)stated.
    if (previous !== null && options.character !== previous.character) {
      this.installCharacter(options.character);
      // **The join panel is a reader of this record too** — M25 Phase 5. Seat
      // 0's card names whoever the player has chosen, and the one control that
      // changes it goes through the options store rather than writing the card,
      // exactly as the rider chooser does. Written here rather than at that
      // control so the panel cannot be left stale by a *second* way of changing
      // the character arriving later.
      this.updateCouchPanel();
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
    // The split's own two numbers, pushed the way the quality ceiling is: the
    // store belongs to this layer and the renderer is told, never asked.
    this.renderer.setSplitFieldOfView(
      this.tuning.get('CAMERA.splitFovGain'),
      this.tuning.get('CAMERA.splitFovCap'),
    );
    // **Every seat's camera** — the Phase 1 follow-up's defect one object
    // along. A camera not reached here would silently ignore every F4
    // override, so one half of the screen would keep the shipped arm and
    // field of view while the owner tuned the other.
    for (const seat of this.seats) seat.chase.setTuning({
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
 * Fill one contact body from a rider's pose, in place — M26 Phase 1.
 *
 * The controller stores travel as signed speed along a heading, so a contact
 * body's Cartesian velocity is derived here rather than carried on the pose:
 * `EucController.bump` folds a push back into exactly this representation, and
 * deriving it the same way in both places is what makes the round trip through
 * `simulation/contact.ts` mean what it says.
 *
 * Ground plane only. A rider hopping over another one is a case §26.7 leaves
 * to a later phase; today a bump does not care about height, which is the
 * arcade reading and matches every other proximity rule in this game (the
 * touch bust included).
 */
function writeContactBody(
  pose: EucPose,
  body: { -readonly [K in keyof ContactBody]: ContactBody[K] },
): void {
  body.x = pose.x;
  body.z = pose.z;
  body.velocityX = Math.sin(pose.headingY) * pose.speed;
  body.velocityZ = Math.cos(pose.headingY) * pose.speed;
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

/**
 * `1 lap` / `4 laps`, because "1 laps counted" is the kind of thing a results
 * card says once and is remembered for.
 */
function lapCount(laps: number): string {
  return laps === 1 ? '1 lap' : `${laps} laps`;
}

function menuScreenFor(state: AppStateId): MenuScreen {
  if (state === 'title') return 'title';
  if (state === 'paused') return 'pause';
  if (state === 'settings') return 'settings';
  if (state === 'results') return 'results';
  if (state === 'routes') return 'routes';
  if (state === 'riderSelect') return 'riders';
  if (state === 'couchJoin') return 'couch';
  return 'none';
}
