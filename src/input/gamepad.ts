/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { ActionState } from './actions.ts';

/**
 * Gamepad device layer: polled pad state in, semantic actions out.
 *
 * The only file in the project that knows a button has a number, exactly as
 * `keyboard.ts` is the only one that knows a key has a name. Everything
 * downstream reads an `ActionSnapshot` and cannot tell which device is
 * talking — which is what made adding a pad at M9 a new file rather than a
 * branch in `simulation/`.
 *
 * Several behaviours here are not obvious and are worth stating:
 *
 *   - **There are no gamepad input events.** The Gamepad API reports button
 *     and stick state only when asked, so `poll` is the single entry point and
 *     the game calls it once per frame. That also makes this layer
 *     self-healing in a way the keyboard is not: a missed release cannot get
 *     stuck, because the next frame overwrites the entire reading. It is why
 *     there is no blur handler here — the browser stops reporting movement
 *     while unfocused, and the first frame after focus returns is
 *     authoritative again.
 *   - **Every usable pad is read; where each one's riding *goes* is somebody
 *     else's decision.** Until M25 Phase 4 this layer adopted exactly one pad
 *     and ignored the rest, which is right for one player and impossible for
 *     two. It now scans them all and asks a `GamepadRouting` for each pad's
 *     sink — and the routing that a bare construction gets is the old
 *     adopt-one rule written as a function, so single-player is the case
 *     where nothing has been claimed rather than a branch anywhere in here.
 *   - **A pad that does not report the standard mapping is ignored, not
 *     guessed at.** `mapping` is the browser's promise that button 7 is the
 *     right trigger and 12 is d-pad up. Without it the indices are whatever
 *     the device's HID descriptor happened to list, so a "reasonable default"
 *     puts brake on a face button and hop on a shoulder — a pad whose controls
 *     land in unknown places is worse than no pad, because the player cannot
 *     tell a broken layout from a broken game. What an ignored pad *does* get
 *     is a word in the settings screen: `onUnusablePad` fires when the scan
 *     sees a connected pad it will not read, because "the game never noticed
 *     my controller" and "the browser reported my controller unusably" call
 *     for different fixes and looked identical before (the owner's Linux QA
 *     pass — Firefox there is the documented producer of such pads).
 *   - **A standard-claiming pad may still be missing its d-pad buttons, and
 *     then the hat axes are read instead.** The Linux kernel exposes an Xbox
 *     d-pad as a hat — two axes quantised to −1/0/+1 — and Firefox on Linux
 *     has shipped that shape through the Gamepad API with fewer than sixteen
 *     buttons (bugzilla 952773, 1643358; w3c/gamepad#133). Buttons 12–15 stay
 *     authoritative whenever they exist; the fallback engages only for a pad
 *     that does not define them at all, where the choice is between reading
 *     the hat and a d-pad that silently does nothing.
 *   - **The dead zone is radial, then rescaled.** Radial because a per-axis
 *     cutoff makes a diagonal push behave differently from a straight one and
 *     carves a square hole the player can feel; rescaled because a plain
 *     cutoff means the stick does nothing until 0.18 and then jumps straight
 *     to 0.18, which reads as a loose, notchy stick.
 *   - **One-shots are edge-latched here**, for the same reason `keyboard.ts`
 *     filters `event.repeat`: a held button is one press. A polled device has
 *     no repeat flag to filter, so the previous frame's button states are kept
 *     and the rising edge is derived.
 *   - **The frame a pad first appears on is a level, not an edge.** Browsers
 *     do not expose a pad until the player uses it, so the very reading that
 *     reveals the pad already contains the press that woke it. Honouring that
 *     press would confirm a menu item the player had not looked at yet, or
 *     reset a run because someone nudged a pad on the desk. It is also what
 *     makes a reconnect safe, since a pad that flickers out and back would
 *     otherwise re-fire every button it is holding.
 *   - **Menu navigation is not an action.** `ActionState` carries riding
 *     intent, and a menu is not riding; d-pad up in a menu means "previous
 *     item", not "accelerate". Menu intents go straight to `onMenuAction` and
 *     fire whatever mode the game is in, because whether a menu is open is the
 *     caller's business — `setMenuMode` exists only to keep the pad out of
 *     `ActionState` while one is.
 *   - **Every threshold is a constructor option, not a literal.** The shipped
 *     values live in `INPUT` in `src/data/tuning.ts` (AGENTS.md invariant 4)
 *     and `app/Game.ts` passes them in. `GAMEPAD_DEFAULTS` below is the
 *     fallback a standalone construction gets, which is what keeps this layer
 *     unit-testable without the tuning table — the two are kept in step by
 *     `src/input/gamepad.test.ts`.
 *   - **`poll` allocates nothing of its own.** It runs every frame forever, so
 *     the per-frame bookkeeping is preallocated typed arrays. The one
 *     unavoidable allocation is the browser's: `getGamepads()` returns a fresh
 *     array on every call and there is no version of the API that does not.
 */

/** Menu intents. Consumed by `ui/`; `simulation/` never sees them. */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

/**
 * The slice of the Gamepad API this module reads, described structurally.
 *
 * A real `Gamepad` satisfies it, and so does a plain object in a test — which
 * is the point: the pad is injected exactly as `KeyboardInput` injects the
 * window, so every behaviour below is provable under `node --test` with no
 * browser and no fake DOM.
 */
export interface GamepadButtonReading {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadReading {
  readonly index: number;
  readonly connected: boolean;
  /** `'standard'` or nothing we are willing to interpret. */
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonReading[];
}

/** The navigator-like source of pad readings. `navigator` satisfies it. */
export interface GamepadSource {
  getGamepads(): readonly (GamepadReading | null)[];
}

/**
 * Standard-mapping indices, from the W3C Gamepad "standard" layout.
 *
 * Named rather than inlined for the same reason `bindings.ts` is a lookup
 * table: the M9 rebinding surface replaces the *mapping*, not the call sites.
 * Face-button names are the Xbox ones because that is the layout the standard
 * mapping is defined against; a PlayStation pad reports the same indices.
 */
export const STANDARD_BUTTON = Object.freeze({
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftShoulder: 4,
  rightShoulder: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  guide: 16,
});

/** Standard mapping defines seventeen buttons; the bookkeeping is sized to it. */
const STANDARD_BUTTON_COUNT = 17;

const LEFT_STICK_X = 0;
const LEFT_STICK_Y = 1;

/**
 * Where the Linux joystick layout puts the d-pad hat, and what counts as
 * pressed on it.
 *
 * Protocol facts rather than tuning: the kernel's xpad driver places the hat
 * on the seventh and eighth axes and quantises each to −1/0/+1 (up and left
 * are negative, matching the sticks' sign convention), so half travel is not
 * a feel choice — it splits a quantised press from noise with the widest
 * possible margin on both sides. Consulted only for a pad whose d-pad
 * *buttons* are absent; see the header.
 */
const HAT_AXIS_X = 6;
const HAT_AXIS_Y = 7;
const HAT_PRESS = 0.5;

const STANDARD_MAPPING = 'standard';

/**
 * Menu directions, in the order the repeat bookkeeping indexes them.
 *
 * A frozen table rather than four sets of fields, so the repeat logic is
 * written once — indexing it allocates nothing.
 */
const MENU_DIRECTIONS: readonly MenuAction[] = Object.freeze(['up', 'down', 'left', 'right']);
const MENU_UP = 0;
const MENU_DOWN = 1;
const MENU_LEFT = 2;
const MENU_RIGHT = 3;

/**
 * Every number this module needs, with the reasoning that picked it.
 *
 * **The shipped values live in `INPUT` in `src/data/tuning.ts`** (invariant 4:
 * no unexplained numeric literal outside the tuning table), and the game
 * passes them in. These are the fallbacks for a construction that supplies
 * none — which is every unit test, and is what keeps this file provable
 * without a tuning table. A test asserts the two agree.
 */
export const GAMEPAD_DEFAULTS = Object.freeze({
  /**
   * Radial dead zone on the left stick, as a fraction of full deflection.
   *
   * Sized for a worn pad rather than a new one: a stick that has been carved
   * with for a year rests around 0.1 off centre, and a rider who cannot let go
   * of the throttle blames the game, not the hardware.
   */
  stickDeadZone: 0.18,
  /**
   * Trigger dead zone, as a fraction of full pull.
   *
   * Much smaller than the stick's, because a trigger's resting position is
   * mechanically defined by a spring against a stop while a stick's is not,
   * and because the first millimetre of trigger travel is where fine throttle
   * control lives.
   */
  triggerThreshold: 0.08,
  /**
   * Seconds a menu direction must be held before it starts repeating.
   *
   * Long enough that a deliberate single step never double-steps, short enough
   * that holding down to run through a long options list does not feel stuck.
   */
  menuRepeatDelaySeconds: 0.42,
  /**
   * Seconds between menu repeats once repeating has started.
   *
   * About seven items a second: fast enough to travel, slow enough to read the
   * item you land on and stop there.
   */
  menuRepeatIntervalSeconds: 0.14,
  /**
   * How far the left stick must be pushed to count as a menu direction.
   *
   * Deliberately far past the dead zone. A stick that navigates at the same
   * deflection that steers would make a menu impossible to rest a thumb on.
   */
  menuStickThreshold: 0.5,
});

export interface GamepadInputOptions {
  /**
   * Seconds, shared with the simulation clock. Injected so it is testable,
   * exactly as `KeyboardInput` does it.
   *
   * `poll` takes the frame's own timestamp and falls back to this, because the
   * loop already holds the frame time and re-reading a clock that has since
   * moved on would stamp two presses from one frame differently.
   */
  now(): number;
  /**
   * Fired when a usable pad is adopted or lost, so the UI can switch its
   * prompts between keys and buttons. Never fired for a pad that was ignored.
   */
  onConnectionChange?(connected: boolean): void;
  /**
   * Fired when the scan's verdict about ignored pads changes: `true` when a
   * pad is connected that this layer will not read (non-standard mapping) and
   * no usable pad is, `false` when that stops being the case. The settings
   * screen tells the player, because a pad the browser reports unusably and a
   * pad the browser never reported look identical from the couch.
   */
  onUnusablePad?(present: boolean): void;
  /**
   * Fired for menu navigation, edge-latched, with a slow repeat while held.
   *
   * Fires whether or not `setMenuMode` is on: this layer does not know what a
   * menu is, and a caller that is riding simply has no listener for it. From
   * M25 Phase 4 it fires for **every** usable pad, not only the one driving
   * seat 0 — the paused player is not necessarily the one holding the pad the
   * game adopted first (§25.5 Phase 4).
   */
  onMenuAction?(action: MenuAction, padIndex: number): void;
  /**
   * Fired when a usable pad starts or stops being read, named by its poll
   * slot — M25 Phase 4.
   *
   * Narrower than `onConnectionChange`, which is a verdict about whether
   * *any* pad is present. This one is per pad, because the router's answer to
   * a claimed pad going away — retain the seat, ask for a device — needs to
   * know which pad went.
   */
  onPadChange?(padIndex: number, present: boolean): void;
  /**
   * Fired on a fresh confirm-family press (A or Start) from any usable pad —
   * the device half of claim-by-press (§25.5 Phase 4).
   *
   * Fires whatever the game is doing, for `onMenuAction`'s reason: this layer
   * does not know what a join panel is. Two conditions are its own, because
   * only it can see them — the press must be a genuine rising edge since the
   * last `primeAll`, and the pad's stick must have been seen at rest since
   * then, so a pad face-down on the couch cannot seat a player who is not
   * there.
   */
  onClaimPress?(padIndex: number): void;
  /**
   * Where each pad's ride intent goes — M25 Phase 4.
   *
   * Omitted, every pad routes by `GamepadRouting`'s documented default: the
   * first standard pad drives the `ActionState` this layer was constructed
   * against and the rest are read for menus and claims only, which is exactly
   * the adopt-one behaviour M9 shipped.
   */
  routing?: GamepadRouting;

  /** See `GAMEPAD_DEFAULTS`. All optional; all destined for `INPUT`. */
  stickDeadZone?: number;
  triggerThreshold?: number;
  menuRepeatDelaySeconds?: number;
  menuRepeatIntervalSeconds?: number;
  menuStickThreshold?: number;
}

/**
 * The scale a dead-zoned stick reading is multiplied by, given its magnitude.
 *
 * Returns zero inside the zone, and outside it rescales the remaining travel
 * back across the full 0..1 range so the player can still reach full
 * deflection — a plain subtraction would cap the stick at `1 - deadZone` and
 * quietly cost the top of the throttle. The result is capped at unit
 * magnitude rather than per axis, because pads that report a square gate reach
 * 1.41 in the corners and clamping the components would bend a diagonal push
 * towards the axis it was already closest to.
 *
 * Exported because it is the one piece of arithmetic here worth testing on its
 * own; the rest only means anything against an `ActionState`.
 */
export function radialDeadZoneScale(magnitude: number, deadZone: number): number {
  // Written as a negated comparison so a NaN magnitude falls out as zero.
  if (!(magnitude > deadZone)) return 0;
  return Math.min(1, (magnitude - deadZone) / (1 - deadZone)) / magnitude;
}

/** Same rescale, one-sided, for a trigger's 0..1 pull. */
function triggerLevel(value: number, threshold: number): number {
  if (!(value > threshold)) return 0;
  return Math.min(1, (value - threshold) / (1 - threshold));
}

/**
 * Whichever reading is asking for more, never their sum.
 *
 * Mirrors `strongerAxis` in `actions.ts`, for the reason stated there: a stick
 * pushed half forward while the trigger is buried means full throttle, not one
 * and a half, and the clamp that would catch the sum would make every partial
 * input behave like a full one.
 */
function strongerAxis(a: number, b: number): number {
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

function isStandard(pad: GamepadReading): boolean {
  return pad.mapping === STANDARD_MAPPING;
}

function isDown(buttons: readonly GamepadButtonReading[], index: number): boolean {
  // Annotated rather than indexed blind: a pad may report fewer buttons than
  // the standard mapping names, and reading `.pressed` off nothing throws.
  const button: GamepadButtonReading | undefined = buttons[index];
  return button !== undefined && button.pressed === true;
}

function analogValue(buttons: readonly GamepadButtonReading[], index: number): number {
  const button: GamepadButtonReading | undefined = buttons[index];
  if (button === undefined) return 0;
  const value = button.value;
  // Some pads wire a digital trigger into a standard-mapping slot and report
  // it as pressed with no analog travel at all. Treating that as zero throttle
  // would leave the player pulling a trigger that does nothing.
  if (!Number.isFinite(value) || value <= 0) return button.pressed ? 1 : 0;
  return value;
}

function axisValue(axes: readonly number[], index: number): number {
  const value: number | undefined = axes[index];
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/**
 * Whether a d-pad direction is held, reading the button when the pad defines
 * one and the hat axis only when it does not.
 *
 * The gate is the button slot's *existence*, not its state: a defined button
 * that reads false means "not pressed" and is believed, so a pad with a real
 * d-pad can never have a stray value on axes 6/7 held against it. Only a pad
 * missing the slot entirely — the documented Firefox-on-Linux shape — falls
 * through to the hat, where the alternative is a d-pad that does nothing.
 */
function dpadHeld(
  pad: GamepadReading,
  buttonIndex: number,
  hatAxis: number,
  sign: 1 | -1,
): boolean {
  const button: GamepadButtonReading | undefined = pad.buttons[buttonIndex];
  if (button !== undefined) return button.pressed === true;
  return sign * axisValue(pad.axes, hatAxis) >= HAT_PRESS;
}

/**
 * Which pad a reading *is*, as the number everything else names it by.
 *
 * The Gamepad API defines `gamepad.index` as the pad's position in
 * `getGamepads()`, so for a browser keeping that promise this is just the loop
 * counter. It is read off the pad anyway, for two reasons that outlive one
 * scan: the **disconnect event** carries nothing but `gamepad.index`, and a
 * **claim** is an identity a player expects to survive another pad being
 * unplugged beside them. Keying either off an array position would hand a seat
 * to the wrong body the day a browser compacted its list — and the list is
 * sparse, not compact: an unplugged pad leaves a `null` hole where it was.
 */
function padSlot(pad: GamepadReading, position: number): number {
  return Number.isInteger(pad.index) ? pad.index : position;
}

/** A configured fraction, or the documented default if it is not usable. */
function fraction(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  // Capped below 1 because both rescales divide by `1 - threshold`, and a dead
  // zone of 1 is a stick that cannot be pushed anywhere.
  return Math.min(0.9, Math.max(0, value));
}

/** A configured duration in seconds, or the documented default. */
function seconds(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return fallback;
  return value;
}


/**
 * Where each pad's ride intent goes — M25 Phase 4 (docs/PLANS.md §25.5).
 *
 * The whole of what "routing" cost this file. `InputRouter` implements it;
 * a construction that supplies none gets `defaultSink` below, which is the
 * adopt-one rule M9 shipped written as a function rather than as a branch —
 * so there is one code path through `poll` and single-player is the case
 * where nothing has been claimed, not a mode it checks for.
 */
export interface GamepadRouting {
  /**
   * The action sink for a usable pad, or null for a pad that is read for
   * menus and claims only.
   *
   * `order` is the pad's position among the usable pads in this scan, which
   * is what lets a router express "the first standard pad" without knowing
   * how the browser numbered the slots.
   */
  sinkForPad(padIndex: number, order: number): ActionState | null;
}

/**
 * One pad's frame-to-frame state.
 *
 * Per pad since M25 Phase 4, and every field here is a reason it had to be:
 * two players holding A must each get their own edge, two players resting
 * their thumbs must each get their own menu repeat, and the frame a *second*
 * pad appears on is a level for that pad and not for the one already in
 * someone's hands. Allocated when a pad is first seen and reused for as long
 * as it is plugged in, which keeps `poll`'s own allocation at zero.
 */
interface PadBookkeeping {
  /**
   * Which pad this is — the slot it is keyed by, carried on the book itself.
   *
   * Added at M25 Phase 5 because a menu intent has to say **which device sent
   * it**: on the join panel a confirm from a pad that holds no seat is a
   * claim rather than a button press, and a caller handed only the action
   * cannot tell the two apart. Every other consumer of a menu action ignores
   * it, which is the right shape — the answer travels with the event instead
   * of being reconstructed by whoever needs it.
   */
  readonly index: number;
  /** Last frame's button states, for edge detection. */
  readonly previousButtons: Uint8Array;
  /** Which menu directions were engaged last frame, indexed by `MENU_*`. */
  readonly menuDirectionHeld: Uint8Array;
  /** When each engaged direction next repeats, in seconds. */
  readonly menuRepeatAt: Float64Array;
  /**
   * True for the single frame after this pad appears or is re-primed, during
   * which every button is read as a level rather than an edge.
   */
  priming: boolean;
  /**
   * Whether this pad's stick has been seen at rest since it was primed.
   *
   * The "an analog stick must pass through neutral before its device can
   * claim" half of claim-by-press (§25.5 Phase 4). A pad face-down on the
   * couch with a stick resting off centre is a pad nobody is holding, and
   * letting it take a seat means the join panel fills itself.
   */
  stickSettled: boolean;
  /** Where this pad last wrote, so its contribution can be cleared when it stops. */
  sink: ActionState | null;
}

export class GamepadInput {
  private readonly options: GamepadInputOptions;
  private readonly target: Window;
  private readonly source: GamepadSource;
  private readonly routing: GamepadRouting;

  private stickDeadZone: number;
  private readonly triggerThreshold: number;
  private readonly menuRepeatDelaySeconds: number;
  private readonly menuRepeatIntervalSeconds: number;
  private readonly menuStickThreshold: number;

  /**
   * Every usable pad this layer is currently reading, keyed by its poll slot.
   *
   * The slot rather than the reading's own `index` because they are the same
   * number — the Gamepad API defines `gamepad.index` as the position in
   * `getGamepads()` — and the slot is what the disconnect event and the
   * router both name a pad by. Empty means no usable pad, which is what
   * `connected` reports.
   */
  private readonly pads = new Map<number, PadBookkeeping>();

  /** Slots seen in the current scan. A field so a scan allocates nothing. */
  private readonly live = new Set<number>();

  /** The last value `onConnectionChange` was told, so it stays a verdict. */
  private connectedSeen = false;

  private menuMode = false;
  /** False while the player has turned the pad off in the settings screen. */
  private enabled = true;

  /** Whether the last scan saw a connected pad it refused. See the header. */
  private unusableSeen = false;

  /**
   * `state` is the **default sink** rather than a field: with no routing it is
   * where the first standard pad writes, which is the whole of what this layer
   * meant by "the action state" before M25 Phase 4. A routed construction
   * never reads it, because a router knows every seat's state including this
   * one.
   */
  constructor(
    state: ActionState,
    options: GamepadInputOptions,
    target: Window = window,
    source: GamepadSource = navigator,
  ) {
    this.options = options;
    this.target = target;
    this.source = source;
    this.routing = options.routing ?? {
      // Adopt-one, as a routing rule: the first standard pad is the seat this
      // layer was constructed against, and any others are read for menus and
      // claims only. Every unit test in this file runs through this object,
      // which is what keeps the M9 behaviour a *tested* default rather than a
      // paragraph in the router.
      sinkForPad: (_padIndex, order) => (order === 0 ? state : null),
    };

    this.stickDeadZone = fraction(options.stickDeadZone, GAMEPAD_DEFAULTS.stickDeadZone);
    this.triggerThreshold = fraction(options.triggerThreshold, GAMEPAD_DEFAULTS.triggerThreshold);
    this.menuStickThreshold = fraction(
      options.menuStickThreshold,
      GAMEPAD_DEFAULTS.menuStickThreshold,
    );
    this.menuRepeatDelaySeconds = seconds(
      options.menuRepeatDelaySeconds,
      GAMEPAD_DEFAULTS.menuRepeatDelaySeconds,
    );
    this.menuRepeatIntervalSeconds = seconds(
      options.menuRepeatIntervalSeconds,
      GAMEPAD_DEFAULTS.menuRepeatIntervalSeconds,
    );

    // The events carry no input; they exist so the UI can swap its prompts the
    // moment a pad appears, and so an unplug is noticed between frames rather
    // than on the next poll.
    target.addEventListener('gamepadconnected', this.onGamepadConnected);
    target.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  /** Whether a usable, standard-mapping pad is currently being read. */
  get connected(): boolean {
    return this.pads.size > 0;
  }

  /** How many usable pads are being read. One in every single-player session. */
  get padCount(): number {
    return this.pads.size;
  }

  /**
   * Whether a pad is connected that this layer refuses to read, while no
   * usable pad is. The settings screen's status line reads it, so a player
   * whose browser reports the pad without the standard mapping is told that
   * rather than left watching "no gamepad detected" with a pad in hand.
   */
  get unusablePadSeen(): boolean {
    return this.unusableSeen;
  }

  /**
   * Treat every pad's current buttons as already held — M25 Phase 4.
   *
   * The device half of claim-by-press's *fresh press edge* (§25.5 Phase 4).
   * A join panel or a pause card opened with A held would otherwise seat a
   * player on the frame it appeared, which is the same failure the priming
   * frame already exists to prevent one level down: the press that opened the
   * panel is not a press aimed at the panel. Re-priming also resets the
   * neutral-stick latch, so a pad whose stick is deflected when the window
   * opens has to be let go of before it can claim.
   */
  primeAll(): void {
    for (const book of this.pads.values()) {
      book.priming = true;
      book.stickSettled = false;
      book.previousButtons.fill(0);
      book.menuDirectionHeld.fill(0);
    }
  }

  /**
   * Turn the pad off entirely, from the settings screen.
   *
   * Device state rather than a ride parameter, so it stays on the presentation
   * side of the options firewall: what changes is whether this layer writes
   * intent, never what the intent means. Disabling clears every pad's
   * contribution, or a stick pushed at the moment the player unticks the box
   * would steer for ever.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      // Silent on `onConnectionChange`, exactly as it has always been: the
      // player just told the settings screen the pad is off, and the screen
      // re-reads the status itself. `connectedSeen` goes back to false so that
      // re-ticking the box announces the pad again.
      this.forgetAll();
      // Each pad is still reported *individually*, because the router's answer
      // to a claimed pad going away — retain the seat, ask for a device — is
      // the right answer whether the pad was unplugged or switched off.
      this.connectedSeen = false;
      // A disabled layer scans nothing, so it has no opinion about unusable
      // pads either; leaving the flag set would outlive the evidence for it.
      this.noteUnusable(false);
    }
  }

  /** The radial stick dead zone, 0..0.5. Clamped, because a player set it. */
  setDeadZone(deadZone: number): void {
    this.stickDeadZone = fraction(deadZone, GAMEPAD_DEFAULTS.stickDeadZone);
  }

  dispose(): void {
    this.target.removeEventListener('gamepadconnected', this.onGamepadConnected);
    this.target.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    // Invariant 10, applied to input: the last stick reading must not outlive
    // the layer that wrote it, or a torn-down game leaves a rider carving.
    // Silent, for `releasePad`'s old reason — the owner tearing this down does
    // not want a disconnection callback for pads that are still on the desk.
    this.forgetAll();
    this.connectedSeen = false;
  }

  /**
   * Suppress ride intent while the game is in a menu.
   *
   * Menu callbacks keep firing — this layer does not know what a menu is. What
   * stops is writing into `ActionState`, so a stick pushed while choosing an
   * option is not also steering a rider who is meant to be standing still.
   */
  setMenuMode(inMenu: boolean): void {
    if (this.menuMode === inMenu) return;
    this.menuMode = inMenu;
    // Entering with the stick pushed would otherwise leave that last reading
    // frozen in the action state for as long as the menu stays open, since
    // nothing will overwrite it until riding resumes. Every pad's own sink,
    // because in a couch session there is more than one.
    if (inMenu) for (const book of this.pads.values()) book.sink?.clearDevice('gamepad');
  }

  /**
   * Read every usable pad and publish its intent. Called once per frame.
   *
   * Takes the frame's timestamp so every press raised by one frame carries one
   * time; it defaults to the injected clock for callers that have no frame of
   * their own.
   *
   * `menuNowSeconds` is a second clock for the menu-repeat bookkeeping, and it
   * exists because the two consumers genuinely live on different clocks: a
   * ride press is stamped for `ActionState`, whose buffer expiry is compared
   * against the *simulation* clock, while a held menu direction repeats in the
   * *player's* time — and the one menu where that distinction bites is the
   * pause menu, where the simulation clock is deliberately frozen. Scheduling
   * repeats from the frozen clock made "hold down to travel the list" work on
   * every screen except that one. Callers with only one clock (every unit
   * test) pass one; the game passes the frame's wall clock alongside the sim
   * clock.
   *
   * **Every usable pad since M25 Phase 4**, where it read exactly one before.
   * The scan is the same scan; what changed is that finding a usable pad no
   * longer ends it, because a second pad has to be read to drive the second
   * seat, and an *unclaimed* second pad still has to be read to navigate a
   * menu and to press the button that claims it.
   */
  poll(nowSeconds: number = this.options.now(), menuNowSeconds: number = nowSeconds): void {
    // Turned off in the settings screen: nothing is read, nothing is adopted,
    // and no connection callback fires. Cheapest possible answer, because this
    // is the first thing a frame asks.
    if (!this.enabled) return;

    const readings = this.source.getGamepads();
    this.live.clear();
    let unusable = false;
    let order = 0;

    // **Pass one: who is here, and where each one writes.** Nothing is read
    // yet, and that separation is load-bearing rather than tidy. Re-routing a
    // pad hands its old seat back the axes it was holding, and two pads
    // exchanging seats — the join panel's Swap, one layer down — would have
    // the second one's hand-back wipe the write the first had already made
    // this frame. Every release happens before every write, so a seat can only
    // be cleared by the pad that actually left it.
    for (let i = 0; i < readings.length; i += 1) {
      const reading = readings[i];
      if (reading === null || reading === undefined || !reading.connected) continue;
      // A non-standard pad is skipped rather than read — it may well be a
      // dance mat or a flight yoke sharing the bus — but no longer silently:
      // the scan remembers it saw one, so the settings screen can say why a
      // pad in the player's hands is doing nothing.
      if (!isStandard(reading)) {
        unusable = true;
        continue;
      }
      this.live.add(padSlot(reading, i));
      this.route(padSlot(reading, i), order);
      order += 1;
    }

    // Pads the scan no longer lists, released in the same pass and for the
    // same reason. Some browsers only stop listing a pad; the disconnect event
    // is not guaranteed to arrive, and a rider stuck in a left turn is the
    // cost.
    for (const [index, book] of this.pads) {
      if (this.live.has(index)) continue;
      this.forget(index, book);
    }

    // **Pass two: read them.**
    for (let i = 0; i < readings.length; i += 1) {
      const reading = readings[i];
      if (reading === null || reading === undefined) continue;
      const slot = padSlot(reading, i);
      if (!this.live.has(slot)) continue;
      this.readPad(slot, reading, nowSeconds, menuNowSeconds);
    }

    // Only meaningful while nothing usable was found: a pad in hand that works
    // is the answer to "why is my controller doing nothing".
    this.noteUnusable(unusable && order === 0);
    this.noteConnected();
  }

  /**
   * Adopt a pad if it is new, and settle where its riding goes this frame.
   *
   * Asked every frame because a claim, a swap or an unclaim can move it
   * between two seats. A pad that has just stopped writing somewhere hands
   * that seat its axes back, which is `clearDevice`'s whole purpose one level
   * up — and it happens here, in the release pass, rather than beside the
   * write it precedes.
   */
  private route(index: number, order: number): void {
    let book = this.pads.get(index);
    if (book === undefined) {
      book = {
        index,
        previousButtons: new Uint8Array(STANDARD_BUTTON_COUNT),
        menuDirectionHeld: new Uint8Array(MENU_DIRECTIONS.length),
        menuRepeatAt: new Float64Array(MENU_DIRECTIONS.length),
        priming: true,
        stickSettled: false,
        sink: null,
      };
      this.pads.set(index, book);
      this.options.onPadChange?.(index, true);
    }

    const sink = this.routing.sinkForPad(index, order);
    if (sink === book.sink) return;
    book.sink?.clearDevice('gamepad');
    book.sink = sink;
  }

  /** One routed pad. Allocates nothing; `route` did that on the frame it appeared. */
  private readPad(
    index: number,
    pad: GamepadReading,
    nowSeconds: number,
    menuNowSeconds: number,
  ): void {
    const book = this.pads.get(index);
    if (book === undefined) return;

    const buttons = pad.buttons;
    const rawX = axisValue(pad.axes, LEFT_STICK_X);
    const rawY = axisValue(pad.axes, LEFT_STICK_Y);
    const magnitude = Math.hypot(rawX, rawY);
    // The neutral-stick latch (see `PadBookkeeping.stickSettled`). The dead
    // zone is the definition of "at rest" everywhere else in this file, so it
    // is the definition here too rather than a second threshold to keep in
    // step with it.
    if (!book.stickSettled && magnitude <= this.stickDeadZone) book.stickSettled = true;
    const scale = radialDeadZoneScale(magnitude, this.stickDeadZone);

    // +X is already the rider's right, which is the sign `steer` wants. Y is
    // not: the Gamepad API reports a stick pushed *away* from the player as
    // negative, so accelerating arrives as -1 and has to be flipped.
    const steer = rawX * scale;
    const stickThrottle = -rawY * scale;

    const triggerThrottle =
      triggerLevel(analogValue(buttons, STANDARD_BUTTON.rightTrigger), this.triggerThreshold)
      - triggerLevel(analogValue(buttons, STANDARD_BUTTON.leftTrigger), this.triggerThreshold);

    // The d-pad, resolved once for both consumers: buttons when the pad
    // defines them, the Linux hat axes when it does not (see `dpadHeld`).
    const dpadUp = dpadHeld(pad, STANDARD_BUTTON.dpadUp, HAT_AXIS_Y, -1);
    const dpadDown = dpadHeld(pad, STANDARD_BUTTON.dpadDown, HAT_AXIS_Y, 1);
    const dpadLeft = dpadHeld(pad, STANDARD_BUTTON.dpadLeft, HAT_AXIS_X, -1);
    const dpadRight = dpadHeld(pad, STANDARD_BUTTON.dpadRight, HAT_AXIS_X, 1);

    // Menu intent is read from the stick alone. A trigger is a throttle, and a
    // player feathering it is not asking to move down a list. Read for *every*
    // usable pad since M25 Phase 4: the paused player is not necessarily the
    // one holding the pad the game happened to adopt first (§25.5 Phase 4).
    this.updateMenu(
      book, menuNowSeconds, steer, stickThrottle, buttons, dpadUp, dpadDown, dpadLeft, dpadRight,
    );

    // Claim-by-press: the confirm family, on a fresh edge, from a pad that is
    // being held rather than resting on a cushion. Emitted whatever the game
    // is doing, for `onMenuAction`'s reason — this layer does not know what a
    // panel is, and the router refuses the claim outside a claim window.
    if (!book.priming
      && book.stickSettled
      && (this.rose(book, buttons, STANDARD_BUTTON.a)
        || this.rose(book, buttons, STANDARD_BUTTON.start))) {
      this.options.onClaimPress?.(index);
    }

    const sink = book.sink;
    if (!this.menuMode && sink !== null) {
      this.updateRide(
        book,
        sink,
        nowSeconds,
        strongerAxis(stickThrottle, triggerThrottle),
        steer,
        buttons,
        dpadUp,
        dpadDown,
        dpadLeft,
        dpadRight,
      );
    }

    // Recorded last, and recorded even in menu mode: a button held across a
    // pause must not fire a hop on the frame the game resumes.
    for (let i = 0; i < STANDARD_BUTTON_COUNT; i += 1) {
      book.previousButtons[i] = isDown(buttons, i) ? 1 : 0;
    }
    book.priming = false;
  }

  /**
   * Stop reading a pad, and hand back whatever it was holding.
   *
   * The whole reason `clearDevice` exists: a pad pulled out mid-carve would
   * otherwise leave its last steer reading held, and the rider would circle
   * until it was plugged back in. Only this device's contribution goes — a
   * key the player is still holding is still held — and only from the seat it
   * was actually writing to.
   */
  private forget(index: number, book: PadBookkeeping): void {
    book.sink?.clearDevice('gamepad');
    this.pads.delete(index);
    this.options.onPadChange?.(index, false);
  }

  private forgetAll(): void {
    for (const [index, book] of this.pads) this.forget(index, book);
  }

  private noteConnected(): void {
    const connected = this.pads.size > 0;
    if (this.connectedSeen === connected) return;
    this.connectedSeen = connected;
    this.options.onConnectionChange?.(connected);
  }

  private noteUnusable(present: boolean): void {
    if (this.unusableSeen === present) return;
    this.unusableSeen = present;
    this.options.onUnusablePad?.(present);
  }

  private updateRide(
    book: PadBookkeeping,
    state: ActionState,
    nowSeconds: number,
    throttle: number,
    steer: number,
    buttons: readonly GamepadButtonReading[],
    dpadUp: boolean,
    dpadDown: boolean,
    dpadLeft: boolean,
    dpadRight: boolean,
  ): void {
    state.setAxes('gamepad', throttle, steer);

    // The d-pad means exactly what the arrow keys mean. Written every frame,
    // including the false cases: an analog device has to say it let go.
    state.setHeld('accelerate', dpadUp, 'gamepad');
    state.setHeld('brake', dpadDown, 'gamepad');
    state.setHeld('steerLeft', dpadLeft, 'gamepad');
    state.setHeld('steerRight', dpadRight, 'gamepad');
    state.setHeld('crouch', isDown(buttons, STANDARD_BUTTON.leftShoulder), 'gamepad');

    if (book.priming) return;
    if (this.rose(book, buttons, STANDARD_BUTTON.a)) state.press('hop', nowSeconds);
    if (this.rose(book, buttons, STANDARD_BUTTON.x)) state.press('reset', nowSeconds);
    if (this.rose(book, buttons, STANDARD_BUTTON.y)) state.press('cameraCycle', nowSeconds);
    if (this.rose(book, buttons, STANDARD_BUTTON.start)) state.press('pause', nowSeconds);
    // The right shoulder swings the paddle — §13 q18, M14. It was held unbound
    // until now under a written reservation for "the camera work M9 has not
    // opened", on the grounds that binding a button early means unbinding it
    // later and breaking muscle memory. The owner spent that reservation
    // deliberately rather than by accident: the camera work is still unopened,
    // the paddle is a ride action that wants a shoulder rather than a face
    // button, and the left shoulder already carries the other one (crouch), so
    // the pair reads as the two things you do with your hands.
    if (this.rose(book, buttons, STANDARD_BUTTON.rightShoulder)) state.press('swing', nowSeconds);
    // B remains deliberately unbound while riding: it is "back" everywhere else
    // on this pad, and a rider who taps it expecting to leave should not hop.
  }

  private updateMenu(
    book: PadBookkeeping,
    nowSeconds: number,
    steer: number,
    forward: number,
    buttons: readonly GamepadButtonReading[],
    dpadUp: boolean,
    dpadDown: boolean,
    dpadLeft: boolean,
    dpadRight: boolean,
  ): void {
    // A stick is never exactly on an axis, so a diagonal push resolves to its
    // dominant component. Firing "down" and "left" from one flick would move
    // the selection twice and land somewhere the player did not aim.
    const vertical = Math.abs(forward) >= Math.abs(steer);
    const threshold = this.menuStickThreshold;

    this.updateMenuDirection(book, MENU_UP, nowSeconds, dpadUp || (vertical && forward >= threshold));
    this.updateMenuDirection(
      book,
      MENU_DOWN,
      nowSeconds,
      dpadDown || (vertical && forward <= -threshold),
    );
    this.updateMenuDirection(
      book,
      MENU_LEFT,
      nowSeconds,
      dpadLeft || (!vertical && steer <= -threshold),
    );
    this.updateMenuDirection(
      book,
      MENU_RIGHT,
      nowSeconds,
      dpadRight || (!vertical && steer >= threshold),
    );

    // Confirm and back never repeat. A held direction wanting to travel a list
    // is a real intent; a held A wanting to activate the same button eight
    // times is not, and would fire whatever screen the first one opened.
    if (this.rose(book, buttons, STANDARD_BUTTON.a)) this.emitMenu(book, 'confirm');
    if (this.rose(book, buttons, STANDARD_BUTTON.b)) this.emitMenu(book, 'back');
  }

  private updateMenuDirection(
    book: PadBookkeeping,
    direction: number,
    nowSeconds: number,
    engaged: boolean,
  ): void {
    if (!engaged) {
      book.menuDirectionHeld[direction] = 0;
      return;
    }

    const wasEngaged = book.menuDirectionHeld[direction] === 1;
    book.menuDirectionHeld[direction] = 1;

    if (!wasEngaged) {
      book.menuRepeatAt[direction] = nowSeconds + this.menuRepeatDelaySeconds;
      this.emitMenu(book, MENU_DIRECTIONS[direction]);
      return;
    }
    if (nowSeconds < book.menuRepeatAt[direction]) return;
    // Scheduled from `now` rather than from the previous due time: a frame
    // spike must not owe the menu a burst of moves it then delivers at once.
    book.menuRepeatAt[direction] = nowSeconds + this.menuRepeatIntervalSeconds;
    this.emitMenu(book, MENU_DIRECTIONS[direction]);
  }

  /**
   * Deliver a menu intent, unless this is the frame the pad appeared on.
   *
   * The repeat bookkeeping still runs while priming, so the direction that
   * woke the pad is treated as already held rather than as a fresh press.
   */
  private emitMenu(book: PadBookkeeping, action: MenuAction): void {
    if (book.priming) return;
    this.options.onMenuAction?.(action, book.index);
  }

  /** True on the frame a button goes down, and not again until it comes up. */
  private rose(
    book: PadBookkeeping,
    buttons: readonly GamepadButtonReading[],
    index: number,
  ): boolean {
    return isDown(buttons, index) && book.previousButtons[index] === 0;
  }

  private readonly onGamepadConnected = (): void => {
    // Deliberately does not read the event's own pad. `poll` adopts from the
    // array the game will actually be polling, so there is exactly one place
    // that can pick a pad and one place that can reject a non-standard one;
    // the event only makes it happen now instead of on the next frame, which
    // is what lets the UI swap its prompts as the pad is plugged in. A second
    // pad arriving needs no such hurry — it is claimed from a panel, and the
    // next frame is sixteen milliseconds away.
    if (this.pads.size > 0) return;
    this.poll();
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    const book = this.pads.get(event.gamepad.index);
    // A second, idle pad leaving is still a pad leaving — but one this layer
    // never read is not.
    if (book === undefined) return;
    this.forget(event.gamepad.index, book);
    this.noteConnected();
  };
}
