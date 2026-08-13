/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { ActionState, HeldAction } from './actions.ts';
import {
  DEBUG_BINDINGS,
  resolveBindings,
  type BindingTables,
  type DebugAction,
} from './bindings.ts';

/**
 * Keyboard device layer: DOM events in, semantic actions out.
 *
 * The only file in the project that knows a key has a name. Everything
 * downstream reads an `ActionSnapshot`.
 *
 * Two behaviours here are not obvious and are worth stating:
 *
 *   - **A modifier means the key is not ours.** `Cmd+R` and `Ctrl+R` reload
 *     the page, and `R` alone is quick reset. Treating them the same either
 *     steals the reload or resets the rider every time someone refreshes.
 *   - **A key held when focus leaves never delivers its keyup.** Blur and
 *     visibility hiding clear all held state (master starter 8.2), or the
 *     rider returns from a tab switch already at full throttle.
 *   - **A held action stays held until every key bound to it is up.** W and
 *     ArrowUp both mean `accelerate`, and the action state stores one Boolean
 *     per action — so without per-key bookkeeping here, releasing either key
 *     cancels the action while the other is still physically down.
 */

export interface KeyboardInputOptions {
  /** Seconds, shared with the simulation clock. Injected so it is testable. */
  now(): number;
  /** Fired for F3/F4 and friends. Debug tooling, never gameplay. */
  onDebugAction?(action: DebugAction): void;
  /**
   * Fired when input was cleared by a focus or visibility change, so the loop
   * can re-anchor its clock at the same moment.
   */
  onInputReset?(reason: 'blur' | 'hidden'): void;
}

/** True when a key belongs to whatever the player is typing into, not to us. */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class KeyboardInput {
  private readonly state: ActionState;
  private readonly options: KeyboardInputOptions;
  private readonly target: Window;

  /**
   * Which physical keys currently hold each action down.
   *
   * The action state deliberately stores one Boolean per semantic action, so
   * alias pairs (W/ArrowUp, A/ArrowLeft, both Shifts) have to be reconciled
   * here, in the only file that knows keys have names: an action releases
   * when its *last* key does, not its first.
   */
  private readonly heldCodes = new Map<HeldAction, Set<string>>();

  /**
   * The live binding tables (M9).
   *
   * A field rather than a module import, which is the whole of what rebinding
   * cost this file: `setBindings` swaps the tables and every handler below
   * reads the new ones on the next event. `bindings.ts` was written as a
   * lookup table at M1 for exactly this moment.
   */
  private tables: BindingTables = resolveBindings();

  constructor(state: ActionState, options: KeyboardInputOptions, target: Window = window) {
    this.state = state;
    this.options = options;
    this.target = target;

    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Install a resolved binding table.
   *
   * Held state is cleared first, and it has to be: a key that was accelerating
   * under the old table may be unbound under the new one and would never
   * deliver a keyup this layer could act on, leaving the throttle stuck on
   * exactly the way a lost blur does.
   */
  setBindings(tables: BindingTables): void {
    this.reset();
    this.tables = tables;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditingTarget(event.target)) return;
    // A modified key belongs to the browser or the OS. Reload, close tab, and
    // the developer console must all keep working while the game has focus.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const debug = DEBUG_BINDINGS[event.code];
    if (debug) {
      // Auto-repeat must not toggle a panel dozens of times per second.
      if (!event.repeat) this.options.onDebugAction?.(debug);
      if (this.tables.suppress.has(event.code)) event.preventDefault();
      return;
    }

    const held = this.tables.held[event.code];
    if (held) {
      let codes = this.heldCodes.get(held);
      if (!codes) {
        codes = new Set();
        this.heldCodes.set(held, codes);
      }
      codes.add(event.code);
      this.state.setHeld(held, true);
      if (this.tables.suppress.has(event.code)) event.preventDefault();
      return;
    }

    const pressed = this.tables.pressed[event.code];
    if (pressed) {
      // Edge-triggered: the latch is set once per physical press. Key repeat
      // would otherwise refresh the buffer forever and turn one hop into a
      // hop that fires again the moment it becomes legal.
      if (!event.repeat) this.state.press(pressed, this.options.now());
      if (this.tables.suppress.has(event.code)) event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    // Deliberately no modifier check and no editing-target check on release:
    // a key pressed while unmodified and released after Cmd went down must
    // still clear, or it stays held forever.
    const held = this.tables.held[event.code];
    if (!held) return;
    const codes = this.heldCodes.get(held);
    if (codes) {
      codes.delete(event.code);
      // Another key bound to the same action is still physically down:
      // releasing ArrowUp must not cut the throttle while W is held.
      if (codes.size > 0) return;
    }
    // A release with no recorded press still releases — the press may have
    // been swallowed by a modifier or predate a reset, and a stale "held"
    // is the worse failure.
    this.state.setHeld(held, false);
  };

  /**
   * The input reset contract (master starter 8.2), keyboard edition: clears
   * the per-key bookkeeping alongside the semantic state so the two cannot
   * disagree about which keys are down. Blur and visibility hiding call it,
   * and the game calls it on pause, resume, and context loss.
   */
  reset(): void {
    this.heldCodes.clear();
    this.state.clearAll();
  }

  private readonly onBlur = (): void => {
    this.reset();
    this.options.onInputReset?.('blur');
  };

  private readonly onVisibilityChange = (): void => {
    if (this.target.document.visibilityState !== 'hidden') return;
    this.reset();
    this.options.onInputReset?.('hidden');
  };
}
