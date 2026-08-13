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
 *   - **A pad that does not report the standard mapping is ignored, not
 *     guessed at.** `mapping` is the browser's promise that button 7 is the
 *     right trigger and 12 is d-pad up. Without it the indices are whatever
 *     the device's HID descriptor happened to list, so a "reasonable default"
 *     puts brake on a face button and hop on a shoulder — a pad whose controls
 *     land in unknown places is worse than no pad, because the player cannot
 *     tell a broken layout from a broken game.
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
   * Fired for menu navigation, edge-latched, with a slow repeat while held.
   *
   * Fires whether or not `setMenuMode` is on: this layer does not know what a
   * menu is, and a caller that is riding simply has no listener for it.
   */
  onMenuAction?(action: MenuAction): void;

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

export class GamepadInput {
  private readonly state: ActionState;
  private readonly options: GamepadInputOptions;
  private readonly target: Window;
  private readonly source: GamepadSource;

  private stickDeadZone: number;
  private readonly triggerThreshold: number;
  private readonly menuRepeatDelaySeconds: number;
  private readonly menuRepeatIntervalSeconds: number;
  private readonly menuStickThreshold: number;

  /** Index of the pad being followed, or -1 for none. First usable pad wins. */
  private activeIndex = -1;

  /**
   * True for the single frame after a pad is adopted, during which every
   * button is read as a level rather than an edge. See the header.
   */
  private priming = false;

  private menuMode = false;
  /** False while the player has turned the pad off in the settings screen. */
  private enabled = true;

  /** Last frame's button states, for edge detection. Preallocated. */
  private readonly previousButtons = new Uint8Array(STANDARD_BUTTON_COUNT);
  /** Which menu directions were engaged last frame, indexed by `MENU_*`. */
  private readonly menuDirectionHeld = new Uint8Array(MENU_DIRECTIONS.length);
  /** When each engaged direction next repeats, in seconds. */
  private readonly menuRepeatAt = new Float64Array(MENU_DIRECTIONS.length);

  constructor(
    state: ActionState,
    options: GamepadInputOptions,
    target: Window = window,
    source: GamepadSource = navigator,
  ) {
    this.state = state;
    this.options = options;
    this.target = target;
    this.source = source;

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
    return this.activeIndex >= 0;
  }

  /**
   * Turn the pad off entirely, from the settings screen.
   *
   * Device state rather than a ride parameter, so it stays on the presentation
   * side of the options firewall: what changes is whether this layer writes
   * intent, never what the intent means. Disabling clears the pad's
   * contribution, or a stick pushed at the moment the player unticks the box
   * would steer for ever.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.activeIndex = -1;
      this.state.clearDevice('gamepad');
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
    // Not `releasePad` — the owner tearing this down does not want a
    // disconnection callback for a pad that is still sitting on the desk.
    this.activeIndex = -1;
    this.state.clearDevice('gamepad');
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
    // nothing will overwrite it until riding resumes.
    if (inMenu) this.state.clearDevice('gamepad');
  }

  /**
   * Read the pad and publish its intent. Called once per frame.
   *
   * Takes the frame's timestamp so every press raised by one frame carries one
   * time; it defaults to the injected clock for callers that have no frame of
   * their own.
   */
  poll(nowSeconds: number = this.options.now()): void {
    const pad = this.resolvePad();
    if (pad === null) return;

    const buttons = pad.buttons;
    const rawX = axisValue(pad.axes, LEFT_STICK_X);
    const rawY = axisValue(pad.axes, LEFT_STICK_Y);
    const scale = radialDeadZoneScale(Math.hypot(rawX, rawY), this.stickDeadZone);

    // +X is already the rider's right, which is the sign `steer` wants. Y is
    // not: the Gamepad API reports a stick pushed *away* from the player as
    // negative, so accelerating arrives as -1 and has to be flipped.
    const steer = rawX * scale;
    const stickThrottle = -rawY * scale;

    const triggerThrottle =
      triggerLevel(analogValue(buttons, STANDARD_BUTTON.rightTrigger), this.triggerThreshold)
      - triggerLevel(analogValue(buttons, STANDARD_BUTTON.leftTrigger), this.triggerThreshold);

    // Menu intent is read from the stick alone. A trigger is a throttle, and a
    // player feathering it is not asking to move down a list.
    this.updateMenu(nowSeconds, steer, stickThrottle, buttons);
    if (!this.menuMode) {
      this.updateRide(nowSeconds, strongerAxis(stickThrottle, triggerThrottle), steer, buttons);
    }

    // Recorded last, and recorded even in menu mode: a button held across a
    // pause must not fire a hop on the frame the game resumes.
    for (let i = 0; i < STANDARD_BUTTON_COUNT; i += 1) {
      this.previousButtons[i] = isDown(buttons, i) ? 1 : 0;
    }
    this.priming = false;
  }

  /**
   * The pad this frame, adopting or releasing one as needed.
   *
   * Polling decides connection as well as the events do, because the events
   * can be missed — attached after the pad was already live, or never
   * delivered at all by a browser that only populates `getGamepads()`.
   */
  private resolvePad(): GamepadReading | null {
    // Turned off in the settings screen: nothing is read, nothing is adopted,
    // and no connection callback fires. Cheapest possible answer, because this
    // is the first thing a frame asks.
    if (!this.enabled) return null;

    const pads = this.source.getGamepads();

    if (this.activeIndex >= 0) {
      const active: GamepadReading | null | undefined = pads[this.activeIndex];
      if (active !== null && active !== undefined && active.connected && isStandard(active)) {
        return active;
      }
      this.releasePad();
    }

    for (let i = 0; i < pads.length; i += 1) {
      const pad = pads[i];
      // A non-standard pad is skipped rather than adopted, and skipped
      // silently: it may well be a dance mat or a flight yoke sharing the bus.
      if (pad === null || pad === undefined || !pad.connected || !isStandard(pad)) continue;
      this.adopt(i);
      return pad;
    }
    return null;
  }

  private adopt(index: number): void {
    this.activeIndex = index;
    this.priming = true;
    this.previousButtons.fill(0);
    this.menuDirectionHeld.fill(0);
    this.options.onConnectionChange?.(true);
  }

  private releasePad(): void {
    this.activeIndex = -1;
    this.priming = false;
    this.previousButtons.fill(0);
    this.menuDirectionHeld.fill(0);
    // The whole reason `clearDevice` exists: a pad pulled out mid-carve would
    // otherwise leave its last steer reading held, and the rider would circle
    // until it was plugged back in. Only this device's contribution goes — a
    // key the player is still holding is still held.
    this.state.clearDevice('gamepad');
    this.options.onConnectionChange?.(false);
  }

  private updateRide(
    nowSeconds: number,
    throttle: number,
    steer: number,
    buttons: readonly GamepadButtonReading[],
  ): void {
    this.state.setAxes('gamepad', throttle, steer);

    // The d-pad means exactly what the arrow keys mean. Written every frame,
    // including the false cases: an analog device has to say it let go.
    this.state.setHeld('accelerate', isDown(buttons, STANDARD_BUTTON.dpadUp), 'gamepad');
    this.state.setHeld('brake', isDown(buttons, STANDARD_BUTTON.dpadDown), 'gamepad');
    this.state.setHeld('steerLeft', isDown(buttons, STANDARD_BUTTON.dpadLeft), 'gamepad');
    this.state.setHeld('steerRight', isDown(buttons, STANDARD_BUTTON.dpadRight), 'gamepad');
    this.state.setHeld('crouch', isDown(buttons, STANDARD_BUTTON.leftShoulder), 'gamepad');

    if (this.priming) return;
    if (this.rose(buttons, STANDARD_BUTTON.a)) this.state.press('hop', nowSeconds);
    if (this.rose(buttons, STANDARD_BUTTON.x)) this.state.press('reset', nowSeconds);
    if (this.rose(buttons, STANDARD_BUTTON.y)) this.state.press('cameraCycle', nowSeconds);
    if (this.rose(buttons, STANDARD_BUTTON.start)) this.state.press('pause', nowSeconds);
    // The right shoulder swings the paddle — §13 q18, M14. It was held unbound
    // until now under a written reservation for "the camera work M9 has not
    // opened", on the grounds that binding a button early means unbinding it
    // later and breaking muscle memory. The owner spent that reservation
    // deliberately rather than by accident: the camera work is still unopened,
    // the paddle is a ride action that wants a shoulder rather than a face
    // button, and the left shoulder already carries the other one (crouch), so
    // the pair reads as the two things you do with your hands.
    if (this.rose(buttons, STANDARD_BUTTON.rightShoulder)) this.state.press('swing', nowSeconds);
    // B remains deliberately unbound while riding: it is "back" everywhere else
    // on this pad, and a rider who taps it expecting to leave should not hop.
  }

  private updateMenu(
    nowSeconds: number,
    steer: number,
    forward: number,
    buttons: readonly GamepadButtonReading[],
  ): void {
    // A stick is never exactly on an axis, so a diagonal push resolves to its
    // dominant component. Firing "down" and "left" from one flick would move
    // the selection twice and land somewhere the player did not aim.
    const vertical = Math.abs(forward) >= Math.abs(steer);
    const threshold = this.menuStickThreshold;

    this.updateMenuDirection(
      MENU_UP,
      nowSeconds,
      isDown(buttons, STANDARD_BUTTON.dpadUp) || (vertical && forward >= threshold),
    );
    this.updateMenuDirection(
      MENU_DOWN,
      nowSeconds,
      isDown(buttons, STANDARD_BUTTON.dpadDown) || (vertical && forward <= -threshold),
    );
    this.updateMenuDirection(
      MENU_LEFT,
      nowSeconds,
      isDown(buttons, STANDARD_BUTTON.dpadLeft) || (!vertical && steer <= -threshold),
    );
    this.updateMenuDirection(
      MENU_RIGHT,
      nowSeconds,
      isDown(buttons, STANDARD_BUTTON.dpadRight) || (!vertical && steer >= threshold),
    );

    // Confirm and back never repeat. A held direction wanting to travel a list
    // is a real intent; a held A wanting to activate the same button eight
    // times is not, and would fire whatever screen the first one opened.
    if (this.rose(buttons, STANDARD_BUTTON.a)) this.emitMenu('confirm');
    if (this.rose(buttons, STANDARD_BUTTON.b)) this.emitMenu('back');
  }

  private updateMenuDirection(direction: number, nowSeconds: number, engaged: boolean): void {
    if (!engaged) {
      this.menuDirectionHeld[direction] = 0;
      return;
    }

    const wasEngaged = this.menuDirectionHeld[direction] === 1;
    this.menuDirectionHeld[direction] = 1;

    if (!wasEngaged) {
      this.menuRepeatAt[direction] = nowSeconds + this.menuRepeatDelaySeconds;
      this.emitMenu(MENU_DIRECTIONS[direction]);
      return;
    }
    if (nowSeconds < this.menuRepeatAt[direction]) return;
    // Scheduled from `now` rather than from the previous due time: a frame
    // spike must not owe the menu a burst of moves it then delivers at once.
    this.menuRepeatAt[direction] = nowSeconds + this.menuRepeatIntervalSeconds;
    this.emitMenu(MENU_DIRECTIONS[direction]);
  }

  /**
   * Deliver a menu intent, unless this is the frame the pad appeared on.
   *
   * The repeat bookkeeping still runs while priming, so the direction that
   * woke the pad is treated as already held rather than as a fresh press.
   */
  private emitMenu(action: MenuAction): void {
    if (this.priming) return;
    this.options.onMenuAction?.(action);
  }

  /** True on the frame a button goes down, and not again until it comes up. */
  private rose(buttons: readonly GamepadButtonReading[], index: number): boolean {
    return isDown(buttons, index) && this.previousButtons[index] === 0;
  }

  private readonly onGamepadConnected = (): void => {
    // Deliberately does not read the event's own pad. `resolvePad` adopts from
    // the array the game will actually be polling, so there is exactly one
    // place that can pick a pad and one place that can reject a non-standard
    // one; the event only makes it happen now instead of on the next frame,
    // which is what lets the UI swap its prompts as the pad is plugged in.
    if (this.activeIndex >= 0) return;
    void this.resolvePad();
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    // A second, idle pad leaving is not our pad leaving.
    if (event.gamepad.index !== this.activeIndex) return;
    this.releasePad();
  };
}
