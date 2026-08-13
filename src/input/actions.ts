/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { INPUT } from '../data/tuning.ts';

/**
 * Semantic actions, and the state machine that produces them.
 *
 * Gameplay consumes actions, never device events (master starter 8). Nothing
 * under `simulation/` may know that a key called "KeyW" exists — which is also
 * what lets the controller be driven identically by a keyboard, by a gamepad
 * at M9, and by the QA bridge in a Playwright spec, with no branch anywhere
 * saying which one is talking.
 *
 * No DOM here on purpose: `keyboard.ts` owns the events, this file owns the
 * meaning, and the meaning is unit-testable with a fake clock.
 *
 * Values are raw. Smoothing belongs to the controller at M2 — lean is a state
 * variable driven toward the input target, so a pre-smoothed input would be
 * smoothing a smoothed thing and the two time constants would fight.
 */

/** Continuous intent, held for as long as the player holds it. */
export type HeldAction =
  | 'accelerate'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'crouch';

/** One-shot intent. Edge-latched, buffered, consumed exactly once. */
export type PressedAction = 'hop' | 'swing' | 'reset' | 'cameraCycle' | 'pause' | 'muteAudio';

/**
 * The same set as an array, and **the array is what is actually iterated**.
 *
 * `setScripted` and `Game`'s consume loop walk this; the union above only types
 * it. An entry added to the union and missed here compiles perfectly and turns
 * `setActions({ swing: true })` into a silent no-op — every browser spec then
 * fails with no clue why. `actions.test.ts` pins the two against each other so
 * the next addition cannot make that mistake.
 */
export const PRESSED_ACTIONS: readonly PressedAction[] = [
  'hop',
  'swing',
  'reset',
  'cameraCycle',
  'pause',
  'muteAudio',
];

/**
 * Which device an intent came from (M9).
 *
 * **Two devices cannot share one Boolean** (master starter 8.5). Before M9
 * there was only ever one device holding a key down, so a single Boolean per
 * action was the whole truth; with a gamepad in the room it is not. The
 * failure it prevents is specific and would be baffling to debug: a rider
 * accelerating with W while a pad's stick rests at centre would have the
 * throttle cut the moment the pad reported its resting frame, because the pad
 * would be writing "not accelerating" into the same slot the keyboard wrote
 * "accelerating" into a millisecond earlier.
 *
 * `script` is the QA bridge, and it deliberately outranks both — a spec that
 * says "full throttle" means it regardless of what the keyboard is doing.
 *
 * `touch` joined at M11.5 and needs the separation more than either: a phone
 * can have a thumb on the throttle and a thumb steering at the same moment, and
 * those are two independent fingers writing two different actions.
 */
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/**
 * What the simulation reads. One plain object per sample, no device state.
 *
 * `throttle` and `steer` are signed and unsmoothed: +1 throttle is full lean
 * forward, -1 is brake (and, below the reverse threshold from M2, reverse).
 * `steer` is +1 to the **rider's right** — the player's word, and what the
 * controller turns it into. It is deliberately *not* stated as an axis: in
 * this world the rider's right is -X and a right turn is a negative yaw about
 * +Y (see the corrected world conventions in `data/tuning.ts`). Actions carry
 * intent; the controller owns the frame.
 */
export interface ActionSnapshot {
  readonly throttle: number;
  readonly steer: number;
  readonly crouch: boolean;
  readonly hop: boolean;
  /**
   * Swing the paddle, M14's `F`.
   *
   * **An intent, not a mode.** Nothing here knows whether the player is riding
   * Knockabout, whether anything is in range, or who is holding a paddle — the
   * swing state machine keys off this action and the *mode* decides who carries
   * one. That is what lets the same weapon be the cop's in the chase direction
   * the owner set, without this file or the controller learning a second word
   * for it.
   */
  readonly swing: boolean;
  readonly reset: boolean;
  readonly cameraCycle: boolean;
  readonly pause: boolean;
  /**
   * Silence everything, M8's `M`.
   *
   * Carried here alongside `pause` and `cameraCycle` — actions the controller
   * has never read and never will. The options firewall (AGENTS.md invariant
   * 5) is about player *configuration* reaching `simulation/`; this is a
   * one-shot intent claimed by the composition root, and routing it any other
   * way would mean a second input path with its own buffering and its own
   * blur handling.
   */
  readonly muteAudio: boolean;
}

export const NEUTRAL_ACTIONS: ActionSnapshot = Object.freeze({
  throttle: 0,
  steer: 0,
  crouch: false,
  hop: false,
  swing: false,
  reset: false,
  cameraCycle: false,
  pause: false,
  muteAudio: false,
});

/** What `setActions` on the QA bridge accepts. */
export type ScriptedActions = Partial<{
  throttle: number;
  steer: number;
  crouch: boolean;
  hop: boolean;
  swing: boolean;
  reset: boolean;
  cameraCycle: boolean;
  pause: boolean;
  muteAudio: boolean;
}>;

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

/**
 * Combine two readings of the same axis: whichever is asking for more.
 *
 * Not a sum — a rider holding W while a pad's stick is pushed half forward
 * means "full throttle", not "one and a half throttle", and the clamp that
 * would have to catch the sum would silently make every partial stick input
 * behave like a full one whenever a key was also down.
 */
function strongerAxis(a: number, b: number): number {
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

export class ActionState {
  private readonly bufferSeconds: number;

  /**
   * Which devices are currently holding each action down.
   *
   * A set rather than a Boolean, for the reason `InputDevice` states: an
   * action releases when its *last* device releases it, exactly as the
   * keyboard layer already reconciles W and ArrowUp among themselves.
   */
  private readonly held = new Map<HeldAction, Set<InputDevice>>();
  /** Press time in seconds for each unconsumed one-shot. */
  private readonly latched = new Map<PressedAction, number>();

  /** Analog axes per device. Absent means that device is not asking. */
  private readonly axes = new Map<InputDevice, { throttle: number; steer: number }>();

  /** Values written by the QA bridge. Absent means "the device decides". */
  private scriptedThrottle: number | null = null;
  private scriptedSteer: number | null = null;
  private scriptedCrouch = false;

  constructor(bufferSeconds: number = INPUT.actionBufferSeconds) {
    this.bufferSeconds = bufferSeconds;
  }

  setHeld(action: HeldAction, held: boolean, device: InputDevice = 'keyboard'): void {
    let devices = this.held.get(action);
    if (!devices) {
      if (!held) return;
      devices = new Set();
      this.held.set(action, devices);
    }
    if (held) devices.add(device);
    else devices.delete(device);
  }

  isHeld(action: HeldAction): boolean {
    const devices = this.held.get(action);
    return devices !== undefined && devices.size > 0;
  }

  /**
   * A device's analog reading of a signed axis, -1..1.
   *
   * Held keys stay a separate channel rather than being folded in here: a key
   * is a digital fact, and a stick that has been let go still has to say so
   * every frame, which a device writing into the same slot as the keyboard
   * would turn into a fight neither side wins.
   */
  setAxes(device: InputDevice, throttle: number, steer: number): void {
    let axes = this.axes.get(device);
    if (!axes) {
      axes = { throttle: 0, steer: 0 };
      this.axes.set(device, axes);
    }
    axes.throttle = clampAxis(throttle);
    axes.steer = clampAxis(steer);
  }

  /**
   * Drop everything one device is saying, without touching the others.
   *
   * A pad pulled out of its socket mid-carve would otherwise leave its last
   * steer reading held forever, and the rider would circle until they
   * reconnected it. Deliberately narrower than `clearAll`, which is the
   * focus-loss contract and clears the keyboard too.
   */
  clearDevice(device: InputDevice): void {
    for (const devices of this.held.values()) devices.delete(device);
    this.axes.delete(device);
  }

  /**
   * Latch a one-shot press.
   *
   * Re-pressing before the previous latch is consumed refreshes it rather than
   * queueing a second one: two hops from one finger is never what the player
   * meant, and a queue would fire the stale one first.
   */
  press(action: PressedAction, nowSeconds: number): void {
    this.latched.set(action, nowSeconds);
  }

  /**
   * True while a press is latched and still inside the buffer window.
   *
   * Reading this does not consume it — a system that acts on the press must
   * call `consume`, or the action fires on every step until the buffer lapses.
   */
  isPending(action: PressedAction, nowSeconds: number): boolean {
    const pressedAt = this.latched.get(action);
    if (pressedAt === undefined) return false;
    if (nowSeconds - pressedAt > this.bufferSeconds) {
      this.latched.delete(action);
      return false;
    }
    return true;
  }

  /** Claim a pending press. True at most once per press. */
  consume(action: PressedAction, nowSeconds: number): boolean {
    if (!this.isPending(action, nowSeconds)) return false;
    this.latched.delete(action);
    return true;
  }

  /**
   * The QA bridge's direct write.
   *
   * Held and analog fields set here replace what the device is saying, and
   * persist until overwritten — a spec that sets full throttle expects it to
   * stay on across many `advance` calls. Setting a one-shot to `true` latches
   * a single press, exactly as a key would; setting it to `false` drops an
   * unconsumed latch.
   */
  setScripted(actions: ScriptedActions, nowSeconds: number): void {
    if (actions.throttle !== undefined) this.scriptedThrottle = clampAxis(actions.throttle);
    if (actions.steer !== undefined) this.scriptedSteer = clampAxis(actions.steer);
    if (actions.crouch !== undefined) this.scriptedCrouch = actions.crouch;

    for (const action of PRESSED_ACTIONS) {
      const value = actions[action];
      if (value === true) this.press(action, nowSeconds);
      else if (value === false) this.latched.delete(action);
    }
  }

  /**
   * Drop unconsumed one-shots without touching held or scripted state.
   *
   * For events that invalidate a buffered press but not the player's grip on
   * the keys. A hop latched before the window was resized is aimed at a frame
   * that no longer applies.
   */
  clearPending(): void {
    this.latched.clear();
  }

  /**
   * The layout-change reset: every device's held and analog state, plus any
   * buffered one-shots (master starter 8.2's "any resize that actually changed
   * the layout").
   *
   * Narrower than `clearAll` in exactly one way: scripted values survive. The
   * QA bridge is not a device — a resize cannot lose its "keyup", and a spec
   * that set full throttle across a viewport change still means it. A player's
   * key or stick is different: the resize may have moved the window under
   * their hand, and a still-held key re-expresses the intent on its next
   * repeat, so the transient clear costs nothing real.
   */
  clearDevices(): void {
    this.held.clear();
    this.latched.clear();
    this.axes.clear();
  }

  /** Hand the axes back to the device without clearing device state. */
  clearScripted(): void {
    this.scriptedThrottle = null;
    this.scriptedSteer = null;
    this.scriptedCrouch = false;
  }

  /**
   * The input reset contract (master starter 8.2).
   *
   * Called on blur, visibility hiding, pause and resume, restart, menu return,
   * and any resize that actually changed the layout. A key held when the tab
   * loses focus never delivers its keyup, so without this the rider comes back
   * from a tab switch already at full throttle.
   */
  clearAll(): void {
    this.held.clear();
    this.latched.clear();
    this.axes.clear();
    this.clearScripted();
  }

  /** One plain snapshot of current intent. Allocates; small and per-step. */
  sample(nowSeconds: number): ActionSnapshot {
    let deviceThrottle = (this.isHeld('accelerate') ? 1 : 0) - (this.isHeld('brake') ? 1 : 0);
    let deviceSteer = (this.isHeld('steerRight') ? 1 : 0) - (this.isHeld('steerLeft') ? 1 : 0);
    for (const axes of this.axes.values()) {
      deviceThrottle = strongerAxis(deviceThrottle, axes.throttle);
      deviceSteer = strongerAxis(deviceSteer, axes.steer);
    }

    return {
      throttle: this.scriptedThrottle ?? deviceThrottle,
      steer: this.scriptedSteer ?? deviceSteer,
      // Two devices cannot share one held Boolean (master starter 8.5): each
      // retains its own intent and the action is their logical OR.
      crouch: this.isHeld('crouch') || this.scriptedCrouch,
      hop: this.isPending('hop', nowSeconds),
      swing: this.isPending('swing', nowSeconds),
      reset: this.isPending('reset', nowSeconds),
      cameraCycle: this.isPending('cameraCycle', nowSeconds),
      pause: this.isPending('pause', nowSeconds),
      muteAudio: this.isPending('muteAudio', nowSeconds),
    };
  }
}
