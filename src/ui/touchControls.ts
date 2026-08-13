/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { TouchControl, TouchInput } from '../input/touch.ts';

/**
 * The on-screen controls — M11.5.
 *
 * **This file owns elements and pointer events. It owns no meaning.** What a
 * drag is worth, which finger holds what, and when a hop fires all live in
 * `input/touch.ts`, where they are provable with no browser. What is left here
 * is the same narrow job the HUD has: get intent into the input layer, and get
 * one number back out onto the screen.
 *
 * The same three rules the HUD is built on apply, plus one this layer adds:
 *
 *   1. **All geometry is in `game.css`.** Script writes three custom
 *      properties — the two stick axes and the two coordinates the stick
 *      floats to — and nothing else. It never measures an element, which is
 *      also why nothing here has to be re-measured on rotation.
 *   2. **Only the controls take pointers.** The root is transparent to them and
 *      the zones switch them back on, so a tap that misses a control reaches
 *      the game rather than being swallowed by an invisible overlay.
 *   3. **The layout is one anatomy in both orientations.** Riding under one
 *      thumb, CHARGE/HOP under the other, everything else small and central.
 *      Portrait and landscape differ in *size and inset*, not in where things
 *      are — a player who rotates the phone mid-ride must not have to find
 *      anything again.
 *
 * **Pointer events, not touch events**, so the same code answers a finger, a
 * stylus, and the discrete buttons still answer a mouse. The analog riding
 * surface ignores mouse pointers (master §8.5): on a hybrid device, making the
 * touch layer visible must not turn an ordinary mouse click in the lower-left
 * playfield into a riding drag.
 *
 * Every press is captured (`setPointerCapture`) the instant it lands. Without
 * it a thumb that slides a few pixels off CHARGE silently releases it,
 * which on a phone is most presses — a finger on glass does not hold still.
 */

/** Which pointer-driven buttons an element may expose. */
const ACTION_CONTROLS = new Set<string>(['crouch', 'hop', 'swing']);

const TEMPLATE = `
<div class="euc-touch__layer">
  <div class="euc-touch__stick" data-touch-stick data-active="false" aria-hidden="true">
    <span class="euc-touch__stick-hint euc-touch__stick-hint--left"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--right"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--up"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--down"></span>
    <span class="euc-touch__knob"></span>
  </div>
</div>

<div class="euc-touch__zone euc-touch__zone--stick" data-touch="stick"
     aria-label="Ride stick: push up to accelerate, down to brake or reverse, and sideways to carve"></div>

<div class="euc-touch__actions" data-touch-actions data-swing="false">
  <button type="button" class="euc-touch__button euc-touch__button--hop" data-touch="hop"
          aria-label="Hop, like Space on a keyboard">
    <span class="euc-touch__glyph" aria-hidden="true">HOP</span>
  </button>
  <button type="button" class="euc-touch__button euc-touch__button--swing" data-touch="swing"
          aria-label="Swing the paddle, like F on a keyboard">
    <span class="euc-touch__glyph" aria-hidden="true">SWING</span>
  </button>
  <button type="button" class="euc-touch__button euc-touch__button--crouch" data-touch="crouch"
          aria-label="Crouch and charge a bigger hop, like Shift on a keyboard">
    <span class="euc-touch__glyph" aria-hidden="true">CHARGE</span>
  </button>
</div>

<div class="euc-touch__system">
  <button type="button" class="euc-touch__chip" data-touch-tap="pause" aria-label="Pause">II</button>
  <button type="button" class="euc-touch__chip" data-touch-tap="reset"
          aria-label="Quick reset back to the start">RESET</button>
  <button type="button" class="euc-touch__chip" data-touch-tap="cameraCycle"
          aria-label="Change camera view">VIEW</button>
</div>
`;

export interface TouchControlsOptions {
  /** The device layer these controls write into. */
  readonly input: TouchInput;
  /**
   * Fired the first time a real finger touches the screen anywhere.
   *
   * The one signal automatic detection cannot get from a media query: a laptop
   * with a touchscreen reports a mouse until somebody reaches up and uses it.
   * Fires at most once.
   */
  onFirstTouch?(): void;
  /** Where to mount. Injected so a test can hand in a detached container. */
  parent?: HTMLElement;
}

export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLElement;
  private readonly input: TouchInput;
  private readonly options: TouchControlsOptions;

  private active = false;
  private sawTouch = false;

  /**
   * Which element each held pointer pressed, so its ring can be cleared.
   *
   * Kept here rather than found again from the release event, because the
   * release deliberately does not know where the finger ended up — see
   * `endPointer`.
   */
  private readonly pressedElements = new Map<number, HTMLElement>();

  constructor(options: TouchControlsOptions) {
    this.options = options;
    this.input = options.input;

    const root = document.createElement('div');
    root.className = 'euc-touch euc-ui';
    root.hidden = true;
    root.dataset.side = 'right';
    root.innerHTML = TEMPLATE;

    root.addEventListener('pointerdown', this.onPointerDown);
    // A long press on a control is a press, not an invitation to select text or
    // open the browser's own menu over the top of the game.
    root.addEventListener('contextmenu', this.onContextMenu);
    root.addEventListener('click', this.onClick);

    /*
     * **Moves and releases are watched on the window, not on the controls.**
     *
     * Pointer capture normally keeps a press attached to the element it started
     * on, and it is requested below — but it is an *enhancement*, not the
     * mechanism. It fails in two ordinary ways: the browser refuses it for a
     * pointer it has already forgotten, and it reclaims it mid-gesture for a
     * scroll or a back-swipe it has decided is its own. Either way the release
     * arrives somewhere other than the control, and a layer listening only on
     * its own elements would keep CHARGE held for ever.
     *
     * Watching the window makes the release depend on the pointer's identity
     * rather than on where the finger happened to be when it lifted, which is
     * the only version of this that cannot get stuck.
     */
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    window.addEventListener('lostpointercapture', this.onLostPointerCapture, { passive: true });

    // ActionState is cleared by the keyboard layer on these boundaries, but the
    // touchscreen owns more than an action value: pointer ids, the floating
    // origin, and pressed rings. Reset that private state here as well, or a
    // phone returning from an app switch sees a lit control that refuses the
    // next finger because an old pointer still owns it (master §8.2).
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // Deliberately on the window rather than on the overlay: the whole point is
    // to notice a touch made *before* the controls exist on screen.
    window.addEventListener('pointerdown', this.onWindowPointerDown, { passive: true, capture: true });

    (options.parent ?? document.body).appendChild(root);
    this.root = root;
    this.stick = root.querySelector<HTMLElement>('[data-touch-stick]') as HTMLElement;
  }

  get visible(): boolean {
    return this.active;
  }

  /** True once a real finger has touched this screen, whatever the media query says. */
  get touchSeen(): boolean {
    return this.sawTouch;
  }

  /**
   * Show or hide the controls, and arm or disarm the device layer with them.
   *
   * The two always move together. Controls on screen that write nothing would
   * be a game that ignores the player; a layer still writing after the controls
   * are gone would be a rider who keeps accelerating behind a menu.
   */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.root.hidden = !active;
    this.input.setEnabled(active);
    // Taking the controls away already released every finger inside the input
    // layer; this drops what was drawn because of them, so a control removed
    // mid-press does not come back still lit under a stick still anchored to
    // where a thumb used to be.
    if (!active) this.reset();
  }

  /**
   * Drop every finger, and everything drawn because of one.
   *
   * The rotation contract, and it has to be the *pair*. Clearing only the input
   * layer leaves the stick anchored at the coordinate a thumb touched down on
   * before the screen changed shape — which after a rotation into landscape can
   * be below the bottom of the window, so the control the player is looking for
   * is not merely in the wrong place, it is gone. Ordered input-first so the
   * value-changed callback cannot re-anchor what this is about to release.
   */
  reset(): void {
    this.input.reset();
    this.releaseStick();
    for (const element of this.pressedElements.values()) element.removeAttribute('data-pressed');
    this.pressedElements.clear();
  }

  /** Mirror the two clusters, for a left-handed player. */
  setSwapSides(swapped: boolean): void {
    this.root.dataset.side = swapped ? 'left' : 'right';
  }

  /**
   * Show or hide SWING — M14.
   *
   * **Hidden outside Knockabout rather than disabled.** These controls sit on
   * top of the road the player is reading, which is why even the ones that ship
   * are held at 0.82 opacity; a fourth circle that does nothing in free ride
   * would be permanent clutter bought for one mode. The button is removed from
   * the layout rather than made transparent so no finger can land on a control
   * that is not there.
   *
   * A hide releases whatever finger is on it first, through the ordinary path:
   * a button removed under a held pointer never delivers its `pointerup`, and
   * the ring would stay lit on an element nobody can see.
   */
  setSwingVisible(visible: boolean): void {
    const actions = this.root.querySelector<HTMLElement>('[data-touch-actions]');
    if (actions === null) return;
    const next = visible ? 'true' : 'false';
    if (actions.dataset.swing === next) return;
    if (!visible) this.releaseControl('swing');
    actions.dataset.swing = next;
  }

  /** Control size, as a multiplier. Written as a custom property; CSS sizes. */
  setScale(scale: number): void {
    const usable = Number.isFinite(scale) && scale > 0 ? scale : 1;
    this.root.style.setProperty('--euc-touch-scale', String(usable));
  }

  /** Move the knob. Called by the device layer whenever either axis changes. */
  showStick(throttle: number, steer: number): void {
    this.root.style.setProperty('--euc-touch-throttle', String(throttle));
    this.root.style.setProperty('--euc-touch-steer', String(steer));
  }

  dispose(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('contextmenu', this.onContextMenu);
    this.root.removeEventListener('click', this.onClick);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointerdown', this.onWindowPointerDown, { capture: true });
    this.pressedElements.clear();
    this.root.remove();
  }

  // -------------------------------------------------------------------------

  private readonly onWindowPointerDown = (event: PointerEvent): void => {
    if (this.sawTouch || event.pointerType !== 'touch') return;
    this.sawTouch = true;
    this.options.onFirstTouch?.();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const element = this.elementFor(event.target);
    if (element === null) return;
    const control = element.dataset.touch as TouchControl;

    // Stops the browser synthesising a mouse event, scrolling the page under
    // the game, and putting a text selection across the controls.
    event.preventDefault();

    // **Arm first, capture second, and the order is the whole point.**
    // `setPointerCapture` throws for a pointer the browser has already
    // forgotten, and an exception here used to abandon the rest of this
    // handler — leaving a control that had been pressed, looked pressed, and
    // did nothing. Capture is an improvement to a press that already works.
    let accepted = false;
    if (control === 'stick') {
      // A mouse belongs to the desktop input layer. Discrete buttons continue
      // to accept it so a forced-on layout remains operable on a hybrid device.
      if (event.pointerType !== 'mouse') {
        accepted = this.input.stickStart(event.pointerId, event.clientX, event.clientY);
        if (accepted) this.anchorStick(event.clientX, event.clientY);
      }
    } else if (ACTION_CONTROLS.has(control)) {
      accepted = this.input.buttonDown(control, event.pointerId);
      if (accepted) {
        element.setAttribute('data-pressed', 'true');
        this.pressedElements.set(event.pointerId, element);
      }
    }

    // Do not capture a pointer the semantic layer rejected. In particular, a
    // second stick finger must not move the drawing or create a capture whose
    // later loss appears to release the real riding thumb.
    if (!accepted) return;

    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // No capture, so a finger that slides off this element will report its
      // release to the window instead. That path is watched precisely because
      // this one is allowed to fail.
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    // Unconditional: the stick layer ignores every pointer that is not the
    // one it is following, and asking it is cheaper than working out which
    // element this move belongs to.
    this.input.stickMove(event.pointerId, event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.endPointer(event.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.endPointer(event.pointerId);
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    this.endPointer(event.pointerId);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.reset();
  };

  /**
   * Release by pointer identity, wherever the finger ended up.
   *
   * Nothing here reads the event's target: a captured press reports on its
   * control, an uncaptured one reports wherever the finger drifted to, and a
   * cancelled one may report on the document. All three are the same release.
   */
  private endPointer(pointerId: number): void {
    const released = this.input.releasePointer(pointerId);
    if (released === null) return;

    if (released === 'stick') {
      this.releaseStick();
      return;
    }
    const element = this.pressedElements.get(pointerId);
    if (element !== undefined) {
      element.removeAttribute('data-pressed');
      this.pressedElements.delete(pointerId);
    }
  }

  /**
   * The one-shots.
   *
   * `click` rather than `pointerdown`, so these keep working for a mouse, for a
   * keyboard's Enter, and for a screen reader's activation — they are real
   * buttons with real labels, and the only controls here that can be reached
   * without a drag.
   */
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tap = target.closest<HTMLElement>('[data-touch-tap]')?.dataset.touchTap;
    if (tap === 'pause') this.input.tap('pause');
    else if (tap === 'reset') this.input.tap('reset');
    else if (tap === 'cameraCycle') this.input.tap('cameraCycle');
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  /**
   * Put the stick where the thumb landed.
   *
   * Client coordinates go straight into two custom properties because the
   * overlay is a fixed box at `inset: 0` — its padding box *is* the viewport,
   * so a client coordinate and an offset inside it are the same number. That is
   * the whole reason this layer never has to measure anything.
   */
  private anchorStick(clientX: number, clientY: number): void {
    this.root.style.setProperty('--euc-touch-x', String(Math.round(clientX)));
    this.root.style.setProperty('--euc-touch-y', String(Math.round(clientY)));
    this.stick.dataset.active = 'true';
  }

  private releaseStick(): void {
    this.stick.dataset.active = 'false';
    this.root.style.setProperty('--euc-touch-throttle', '0');
    this.root.style.setProperty('--euc-touch-steer', '0');
  }

  /**
   * Release one named control, whichever pointer is holding it.
   *
   * The complement of `endPointer`: that one starts from a pointer and finds
   * the control, and this one starts from the control because the control is
   * about to stop existing. Only `setSwingVisible` needs it, and it needs it for
   * the reason every removal-under-a-finger needs it — an element taken out of
   * the layout never delivers `pointerup`, so the semantic press and the drawn
   * ring would both stay held on something nobody can see.
   */
  private releaseControl(control: TouchControl): void {
    for (const [pointerId, element] of this.pressedElements) {
      if (element.dataset.touch !== control) continue;
      this.input.buttonUp(control, pointerId);
      element.removeAttribute('data-pressed');
      this.pressedElements.delete(pointerId);
    }
  }

  /** The control element a pointer landed on, or null for anything else. */
  private elementFor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLElement>('[data-touch]');
  }
}
