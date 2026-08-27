/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { Vector3 } from 'three';
import type { CharacterId } from '../data/riders.ts';
import type { EucController, EucPose } from '../simulation/EucController.ts';
import type { Paddle } from '../simulation/paddle.ts';
import type { RidingRig } from '../render/ridingRig.ts';
import type {
  ChaseCamera,
  ChaseCameraInput,
  ChaseCameraState,
  ChaseCameraView,
} from '../render/chaseCamera.ts';
import type { RiderSource } from '../input/riderSource.ts';
import type { Hud } from '../ui/hud.ts';
import type { HudModel, HudView } from '../ui/hudModel.ts';
import type { Onboarding } from '../ui/onboarding.ts';

/**
 * Which way a seat is looking at its own rider.
 *
 * Defined here rather than in `Game.ts` since M25 Phase 3, because it became
 * a property of a seat the moment `cameraCycle` started acting per seat. The
 * list of modes and the cycling stay in the composition root; this is only
 * the name of the thing a seat holds.
 */
export type CameraMode = 'chase' | 'orbit';

/**
 * The seat model — what "the player" becomes at M25 (docs/PLANS.md §25.3).
 *
 * A seat is one rider's slice of the game: who is steering it (`source`), the
 * controller that integrates that intent, the three poses the fixed step and
 * the render frame pass between them, the rig those poses are drawn onto, the
 * paddle that rider swings, and the small edge flags that only mean anything
 * per rider. Phase 0 held only the source; **Phase 1 moved the rest off
 * `Game`**, where every one of these existed as a singleton.
 *
 * **Type-only imports on purpose, so this module has no runtime imports at
 * all** — `verbatimModuleSyntax` erases every line above, including the one
 * naming `three`. A seat *refers* to render and simulation objects; it is not
 * one, and it constructs none of them. The composition root builds seats
 * (`Game.createSeat`), which is the same rule that puts every other `new` in
 * this project's app layer.
 *
 * **Phase 3 kept that promise for the camera and the HUD**: both are below,
 * because the screen genuinely splits and a half of it is a rider's own.
 *
 * What is deliberately **not** here, and where it goes instead:
 *
 *   - **Device lifecycle.** A seat reads its source and never clears it
 *     (§25.3): claims, resets and disconnects belong to the Phase 4 router.
 *     `promptDevice` stays singular on `Game` for the same reason — it
 *     answers "what has this machine seen", not "what is this seat holding",
 *     and it becomes a seat's own the moment claims exist.
 *   - **The world.** The scene, the sun and its one shadow cascade, the sky,
 *     the particle pools, the audio mix, the app state machine, the pause and
 *     every referee stay singular. Two riders share one world; the world does
 *     not become plural. The shadow cascade and the surround plane are moved
 *     *between* the two render passes rather than duplicated, which is what
 *     "one world, two windows" means inside a frame.
 */
export interface RiderSeat {
  /**
   * Where this seat's intent comes from.
   *
   * Read-only by design (§25.3): a seat samples and consumes, it never
   * clears devices or writes scripted values — that is lifecycle, owned by
   * the concrete `ActionState`'s holder today and by the Phase 4 router
   * later.
   */
  readonly source: RiderSource;

  /**
   * This seat's physics.
   *
   * **Not readonly, because a world swap replaces it.** `Game.installLevel`
   * builds a new `EucController` on the new plan's sampler for every seat, on
   * the same argument the sampler and the referees are rebuilt: a controller
   * outliving its plan carries the last route's hazards into this one's road.
   */
  controller: EucController;

  /**
   * What this seat is drawn as.
   *
   * Not readonly for the sibling reason: `Game.installCharacter` disposes and
   * rebuilds the rig when the rider changes, because two characters are
   * different geometry rather than a recolour.
   */
  rig: RidingRig;

  /**
   * Who this seat is — M25 Phase 2.
   *
   * The id the rig above was built from, written only where the rig is
   * written so it cannot drift from the geometry. **Per seat rather than one
   * `Game.installedCharacter`**, because with a second rider that field
   * answers for the wrong person: `snapshotFor(1).rider.installed` would
   * report the player, which makes q68's distinct-characters rule not merely
   * unenforced but unobservable — and a spec that cannot see seat 1's
   * character cannot fail when seat 1 wears seat 0's.
   *
   * `Game.installedCharacter` survives beside it and is still seat 0's,
   * because it is the *options* answer — what the player last chose and what
   * `applyOptions` compares against. Seat 1's pick is session state that never
   * reaches `GameOptions` (§25.5 Phase 5), which is exactly why it lives here
   * and not there.
   */
  character: CharacterId;

  /**
   * The pose at the two most recent steps, and the interpolation between them.
   *
   * Three preallocated objects rather than three allocations per frame: at
   * 120 Hz simulation and 60 Hz rendering that would be 180 short-lived
   * objects a second, which is exactly the shape of garbage that shows up
   * months later as an unexplained periodic hitch. Per seat now, so two
   * riders cost six objects once rather than 360 a second.
   */
  readonly previousPose: EucPose;
  readonly currentPose: EucPose;
  readonly renderPose: EucPose;

  /** This seat's swing state — M14. The paddle is wielder-agnostic; a seat is a wielder. */
  readonly paddle: Paddle;
  /** Where this seat's paddle head is this render frame, in world space — M14. */
  readonly paddleHead: Vector3;

  /**
   * How many times each one-shot has been claimed by this seat. The
   * automation wire reads it, per seat, through `Game.snapshotFor`.
   *
   * **Every `PressedAction` needs a zero here and the map is typed loosely
   * enough not to say so.** `consumed[action] += 1` on a missing key
   * evaluates `undefined + 1`, which compiles, yields `NaN`, and survives the
   * harness's `?? 0` — so every `after − before === 1` assertion silently
   * reads false while the overlay shows `NaN`. `Game.createSeat` is the one
   * place the zeros are written; keep it exhaustive.
   */
  readonly consumed: Record<string, number>;

  /**
   * Throttle and steer from this seat's most recent step, so the render frame
   * need not resample. `sample()` allocates, and the step has already paid.
   */
  lastThrottle: number;
  lastSteer: number;

  /** Previous crashed state, so the composition root can see this seat's edge. */
  wasCrashed: boolean;

  // -- The seat's half of the screen — M25 Phase 3 ---------------------------

  /**
   * This seat's chase camera, stepped at the fixed rate like its controller.
   *
   * **A whole `ChaseCamera`, not one shared camera aimed twice.** It carries a
   * second of accumulated state — yaw lag, arm length, height lag, landing
   * dip, crash frame — every field of it a first-order response to *this*
   * rider's motion. One instance re-aimed per pass would give both halves the
   * lag of whichever rider was drawn last.
   *
   * Two things must reach it that a bare `new ChaseCamera()` does not have,
   * and both are loops in the composition root rather than arguments here:
   * the occlusion probe (`Game.installLevel`, so the arm pulls in against
   * *this* level's geometry) and the F4 tuning push (`Game.applyTuning`) —
   * which is the Phase 1 follow-up's defect exactly, one object along.
   */
  readonly chase: ChaseCamera;

  /**
   * The camera at the two most recent steps, and the interpolation between
   * them — the same triple as the poses above, and for the same reason.
   */
  readonly previousCamera: ChaseCameraState;
  readonly currentCamera: ChaseCameraState;
  readonly renderCamera: ChaseCameraState;

  /** Where this seat's interpolated camera resolves to in world space. */
  readonly chaseView: ChaseCameraView;

  /**
   * This seat's camera input, filled from its pose and read immediately.
   *
   * **Per seat rather than one shared scratch struct.** The single shared
   * input was safe while one seat filled it and consumed it inside a single
   * statement; with two seats it stays safe only while that remains true of
   * every caller, present and future. One struct each costs two objects for
   * the life of a session and removes the invariant instead of documenting it.
   */
  readonly chaseInput: ChaseCameraInput;

  /** Which way this seat is looking. `cameraCycle` acts per seat — §25.5. */
  cameraMode: CameraMode;

  /** The diagnostic orbit's angle, at the two most recent steps. */
  orbitAngle: number;
  previousOrbitAngle: number;

  /**
   * This seat's HUD, or `null` when the seat has no half of the screen.
   *
   * **Seat 0 always has one; seat 1's exists only while seat 1 does.** The DOM
   * is the reason it is nullable rather than always present and hidden: two
   * `.euc-hud` roots in the document break every Playwright locator naming
   * that class — loudly, which is the good kind — and a permanently mounted
   * second HUD would break them in single-player too, where nothing is split.
   */
  hud: Hud | null;

  /**
   * The dwell timers behind this seat's HUD — warnings, off-route, splits.
   *
   * Per seat because every field it holds is a latch on *this* rider's
   * situation. One shared model would let the second player's tilt-back
   * warning reset the first player's dwell, and the visible symptom would be
   * a warning that flickers when somebody else rides badly.
   */
  readonly hudModel: HudModel;

  /**
   * This seat's first-ride prompts.
   *
   * **Seat 1 starts from an empty seen set and never writes one back.** P2 may
   * be a genuine first-timer even on a machine whose owner finished the
   * sequence months ago, so the prompts have to be offered; and their progress
   * is session state, so it must never reach `GameOptions.seenPrompts` — the
   * same options firewall that keeps seat 1's character out of the saved
   * record (§25.5 Phase 5).
   */
  readonly onboarding: Onboarding;

  /** What this seat's HUD last resolved to, for the automation wire. */
  hudView: HudView;
  /** The prompt this seat is being shown, or `null`. */
  hudPrompt: string | null;

  /**
   * Whether this seat hopped since its HUD last updated.
   *
   * A step-rate edge consumed at the frame rate, so it cannot be read off the
   * pose: several steps happen per frame and the hop is over before the frame
   * arrives. Per seat since Phase 3 — it was gated on `ownsTheFrame` at Phase
   * 2 precisely so a second player's hop could not retire the player's prompt,
   * and the honest version of that guard is that it retires their own.
   */
  hoppedSinceHudUpdate: boolean;
}
