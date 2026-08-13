/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { ActionState, PressedAction } from './actions.ts';

/**
 * Touch device layer: finger positions in, semantic actions out.
 *
 * There is no DOM here. `ui/touchControls.ts` owns the elements and pointer
 * events; this file owns what a gesture means, so the complete control mapping
 * remains headlessly testable.
 *
 * The floating stick carries the same two signed axes as desktop:
 *
 *   - up/down is forward lean and brake/reverse;
 *   - left/right is carve;
 *   - diagonal movement asks for both at once.
 *
 * The two riding buttons are deliberately literal desktop actions. CHARGE is
 * Shift (crouch while held) and HOP is Space (a one-shot on press). Pointer
 * identity still matters: a second finger must not steal a stick or release a
 * button that the first finger owns.
 */

/** Every distinct held or analog control the overlay offers. */
export type TouchControl = 'stick' | 'crouch' | 'hop' | 'swing';

/**
 * Shipped values live in `INPUT` in `src/data/tuning.ts`; these fallbacks keep
 * standalone tests honest. Lengths are CSS pixels, not device pixels.
 */
export const TOUCH_DEFAULTS = Object.freeze({
  /** Thumb travel from the floating origin to full intent on either axis. */
  stickTravelPx: 84,
  /** Slack around the floating origin before either axis responds. */
  stickDeadZonePx: 5,
  /** Shaping exponent, above 1 for fine control near the origin. */
  stickCurve: 1.35,
});

export interface TouchInputOptions {
  /** Seconds, shared with the simulation clock. Injected so it is testable. */
  now(): number;
  /**
   * Current client width. Injected to keep this layer DOM-free while allowing
   * a floating origin near a phone edge to reach full sideways intent.
   */
  viewportWidth?(): number;
  /** Fired when either stick axis changes, so the overlay can move its knob. */
  onStickChange?(throttle: number, steer: number): void;
  /** See `TOUCH_DEFAULTS`. All optional; all destined for `INPUT`. */
  stickTravelPx?: number;
  stickDeadZonePx?: number;
  stickCurve?: number;
}

function pixels(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

/** Normalise one signed thumb displacement into a signed -1..1 intent. */
export function axisFromDisplacement(
  displacementPx: number,
  travelPx: number,
  deadZonePx: number,
  curve: number,
): number {
  if (!Number.isFinite(displacementPx)) return 0;
  const magnitude = Math.abs(displacementPx);
  if (!(magnitude > deadZonePx)) return 0;
  const span = Math.max(1, travelPx - deadZonePx);
  const normalised = Math.min(1, (magnitude - deadZonePx) / span);
  const shaped = curve === 1 ? normalised : Math.pow(normalised, curve);
  return displacementPx < 0 ? -shaped : shaped;
}

export class TouchInput {
  private readonly state: ActionState;
  private readonly options: TouchInputOptions;

  private stickTravelPx: number;
  private readonly stickDeadZonePx: number;
  private readonly stickCurve: number;
  private enabled = false;

  private stickPointer: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private throttleValue = 0;
  private steerValue = 0;

  /** First pointer down owns each button until it comes up. */
  private readonly buttonPointers = new Map<TouchControl, number>();

  constructor(state: ActionState, options: TouchInputOptions) {
    this.state = state;
    this.options = options;
    this.stickTravelPx = pixels(options.stickTravelPx, TOUCH_DEFAULTS.stickTravelPx);
    this.stickDeadZonePx = pixels(options.stickDeadZonePx, TOUCH_DEFAULTS.stickDeadZonePx);
    this.stickCurve = options.stickCurve !== undefined && Number.isFinite(options.stickCurve)
      && options.stickCurve > 0
      ? options.stickCurve
      : TOUCH_DEFAULTS.stickCurve;
  }

  get throttle(): number {
    return this.throttleValue;
  }

  get steer(): number {
    return this.steerValue;
  }

  get active(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  /** Scale the drawn stick and its two-axis throw together. */
  setScale(scale: number): void {
    const usable = Number.isFinite(scale) && scale > 0 ? scale : 1;
    this.stickTravelPx = pixels(this.options.stickTravelPx, TOUCH_DEFAULTS.stickTravelPx) * usable;
  }

  // -- Floating two-axis stick ---------------------------------------------

  /**
   * A finger landed in the stick zone. Its position becomes the origin.
   * Returns false when disabled or another pointer already owns the stick.
   */
  stickStart(pointerId: number, clientX: number, clientY: number): boolean {
    if (!this.enabled || this.stickPointer !== null) return false;
    this.stickPointer = pointerId;
    this.stickOriginX = clientX;
    this.stickOriginY = clientY;
    this.writeStick(0, 0);
    return true;
  }

  stickMove(pointerId: number, clientX: number, clientY: number): void {
    if (!this.enabled || this.stickPointer !== pointerId) return;
    const steerDisplacement = clientX - this.stickOriginX;
    const steer = axisFromDisplacement(
      steerDisplacement,
      this.steerTravel(steerDisplacement),
      this.stickDeadZonePx,
      this.stickCurve,
    );
    // Client Y grows down the screen; throttle grows forward, so the sign is
    // reversed. Pulling down therefore brakes and reverses from a standstill.
    const throttle = axisFromDisplacement(
      this.stickOriginY - clientY,
      this.stickTravelPx,
      this.stickDeadZonePx,
      this.stickCurve,
    );
    this.writeStick(throttle, steer);
  }

  stickEnd(pointerId: number): boolean {
    if (this.stickPointer !== pointerId) return false;
    this.stickPointer = null;
    this.writeStick(0, 0);
    return true;
  }

  // -- Desktop-equivalent action buttons ----------------------------------

  /**
   * A finger landed on a button.
   *
   * **Exhaustive rather than defaulted, and that is a bug fix.** Until M14 the
   * tail of this method was `else this.state.press('hop', …)`, which was correct
   * for two buttons and a trap for the third: a SWING button wired up through it
   * would light up, feel perfectly responsive, and jump the rider — with nothing
   * to type-check and nothing to see in a screenshot. The `never` arm below
   * turns "a control the overlay offers and this file forgot" from a silent
   * wrong action into a compile error.
   */
  buttonDown(control: TouchControl, pointerId: number): boolean {
    if (!this.enabled || control === 'stick' || this.buttonPointers.has(control)) return false;
    this.buttonPointers.set(control, pointerId);
    switch (control) {
      case 'crouch':
        this.state.setHeld('crouch', true, 'touch');
        break;
      case 'hop':
        this.state.press('hop', this.options.now());
        break;
      case 'swing':
        this.state.press('swing', this.options.now());
        break;
      default: {
        const unhandled: never = control;
        throw new Error(`touch control ${String(unhandled)} has no action`);
      }
    }
    return true;
  }

  buttonUp(control: TouchControl, pointerId: number): void {
    if (this.buttonPointers.get(control) !== pointerId) return;
    this.buttonPointers.delete(control);
    if (control === 'crouch') this.state.setHeld('crouch', false, 'touch');
  }

  /** Release whatever this pointer owns, wherever it ended up. */
  releasePointer(pointerId: number): TouchControl | null {
    for (const [control, owner] of this.buttonPointers) {
      if (owner !== pointerId) continue;
      this.buttonUp(control, pointerId);
      return control;
    }
    return this.stickEnd(pointerId) ? 'stick' : null;
  }

  /** Pause, quick reset, and camera view. */
  tap(action: PressedAction): void {
    if (!this.enabled) return;
    this.state.press(action, this.options.now());
  }

  /** Drop all private touch ownership and clear only this device's actions. */
  reset(): void {
    this.stickPointer = null;
    this.buttonPointers.clear();
    this.writeStick(0, 0);
    this.state.clearDevice('touch');
  }

  dispose(): void {
    this.reset();
  }

  private writeStick(throttle: number, steer: number): void {
    this.state.setAxes('touch', throttle, steer);
    if (throttle === this.throttleValue && steer === this.steerValue) return;
    this.throttleValue = throttle;
    this.steerValue = steer;
    this.options.onStickChange?.(throttle, steer);
  }

  /**
   * Keep full lock reachable when a thumb begins closer to a side of the
   * viewport than the normal stick throw. This is directional: the constrained
   * edge becomes slightly more sensitive, while the other direction and every
   * roomy landscape gesture retain the authored travel exactly.
   */
  private steerTravel(displacementPx: number): number {
    const width = this.options.viewportWidth?.();
    if (width === undefined || !Number.isFinite(width) || !(width > 0)) {
      return this.stickTravelPx;
    }
    const available = displacementPx < 0
      ? this.stickOriginX
      : width - this.stickOriginX;
    if (!Number.isFinite(available) || !(available > 0)) return this.stickTravelPx;
    return Math.min(this.stickTravelPx, Math.max(this.stickDeadZonePx, available));
  }
}
