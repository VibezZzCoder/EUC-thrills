/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { GLOBAL_PRESSED_ACTIONS, type ActionState, type HeldAction } from './actions.ts';
import {
  CLAIM_CODES,
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
  /**
   * Fired on a fresh Enter or Space press — the keyboard half of
   * claim-by-press (M25 Phase 4, docs/PLANS.md §25.5).
   *
   * Fires whatever the game is doing, exactly as the pad's equivalent does:
   * this layer does not know what a join panel is, and the router refuses a
   * claim outside a claim window. The *fresh edge* the pad needs a priming
   * frame for is free here — a key held when the panel opened delivers only
   * auto-repeats, which the handler below already filters — which is why
   * there is no keyboard equivalent of `primeAll`.
   */
  onClaimPress?(): void;
}

/**
 * True when a key belongs to whatever the player is typing into, not to us.
 *
 * **A checkbox is not something you type into** — M26 Phase 2, and this was
 * already wrong before the join panel made it visible. The test was on the tag
 * alone, so *any* focused `<input>` silenced this whole layer: the claim press,
 * pause, mute and the debug keys all gated behind a control the player was
 * merely standing on. The settings screen has carried three checkboxes since
 * M9 and never showed it, because Escape is `ui/menus.ts`'s and leaves by
 * another door.
 *
 * The join panel is where it bit. A room that clicked the contact toggle left
 * focus on the box, and the second player's Enter — the one press the whole
 * screen exists to receive — was read as typing and dropped. Nothing on the
 * panel said why.
 *
 * **So the rule is per key, not per element**, and the first attempt at this
 * fix is why it had to be. Exempting the checkbox outright let Space reach the
 * binding tables, where it is `hop` — and `ALWAYS_SUPPRESSED` contains `Space`,
 * so `preventDefault` ran and **the checkbox stopped toggling for a keyboard at
 * all**. That is the shipped behaviour of every `<button>` in this game (Space
 * on a focused button has been suppressed since M9; Enter is what activates
 * one), and it is right for a button and wrong for a checkbox, whose one and
 * only key is Space.
 *
 * A checkbox therefore owns exactly `Space` and nothing else. Enter — which a
 * checkbox ignores — stays the game's, which is the whole point: Enter is the
 * key the join panel's own status line asks the second player to press.
 *
 * `SELECT`, `TEXTAREA` and `range` are deliberately untouched. Arrows adjust a
 * slider or a dropdown and this layer steers with them too, so those are
 * controls that genuinely consume keys the game wants — which is the difference
 * between "cannot be typed into" and "consumes no keys".
 */
function isEditingTarget(target: EventTarget | null, code: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  // Read off the tag and the `type` attribute rather than `instanceof
  // HTMLInputElement`: this function is exercised headlessly, where the only
  // DOM global the rig supplies is `HTMLElement` (`keyboard.test.ts`), and
  // asking for a second constructor would make a rule about keys depend on how
  // many classes the test environment happens to define.
  if (tag === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') return code === 'Space';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class KeyboardInput {
  /**
   * Where this keyboard writes — one seat at a time, and re-pointed rather
   * than resolved per event (M25 Phase 4).
   *
   * The keyboard is claimable **as a unit** (q65: no two-players-one-keyboard
   * in stage 1), so unlike the pad it never needs a per-device routing
   * question: it has exactly one sink, and `setSink` moves it. Resolving the
   * sink inside each handler instead would let it change between a keydown
   * and its keyup — the one reliable way to leave a key held on a seat that
   * nothing is clearing any more.
   */
  private state: ActionState;
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

  /**
   * Point the keyboard at another seat — M25 Phase 4.
   *
   * The keys the player is holding are released from the seat being left,
   * along with anything it had buffered, and are *not* carried across: a
   * throttle held at the moment the couch swapped sides belongs to the rider
   * who was being driven, not to the one who just inherited the keys.
   *
   * Deliberately narrower than `reset`, which is the focus-loss contract and
   * clears the scripted values too. Moving a sink is not a focus loss, and a
   * spec that scripted the seat it is leaving still means it.
   */
  /**
   * Stop steering, keep the machine's keys — M25 Phase 5 QA.
   *
   * A keyboard that holds no seat in a two-seat session is a spectator's, and
   * `InputRouter.keyboardRides` is the whole of the decision; this method only
   * carries it out. Held keys are released from the seat on the way in, or a
   * throttle held at the moment the second player sat down would stay latched
   * on a rider nobody is driving any more.
   *
   * Pause and mute are unaffected: see `GLOBAL_PRESSED_ACTIONS`.
   */
  setSpectating(spectating: boolean): void {
    if (this.spectating === spectating) return;
    this.spectating = spectating;
    if (!spectating) return;
    this.heldCodes.clear();
    this.state.clearDevice('keyboard');
  }

  setSink(state: ActionState): void {
    if (this.state === state) return;
    this.heldCodes.clear();
    this.state.clearDevice('keyboard');
    this.state.clearPending();
    this.state = state;
  }

  /** See `setSpectating`. False for the whole of a single-player session. */
  private spectating = false;

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditingTarget(event.target, event.code)) return;
    // A modified key belongs to the browser or the OS. Reload, close tab, and
    // the developer console must all keep working while the game has focus.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Before the binding tables, and deliberately not instead of them: Space
    // is also `hop`, and a player claiming a seat with it should not have to
    // learn that the key means something different in a panel. The claim is a
    // second reading of the same press, not a redirection of it.
    if (!event.repeat && CLAIM_CODES.has(event.code)) this.options.onClaimPress?.();

    const debug = DEBUG_BINDINGS[event.code];
    if (debug) {
      // Auto-repeat must not toggle a panel dozens of times per second.
      if (!event.repeat) this.options.onDebugAction?.(debug);
      if (this.tables.suppress.has(event.code)) event.preventDefault();
      return;
    }

    const held = this.tables.held[event.code];
    if (held) {
      // Every held action is ride intent — there is no held global — so a
      // spectating keyboard writes none of them. `preventDefault` still runs
      // below by falling into the same suppression check: the browser must not
      // scroll the page because somebody who is not riding leant on an arrow.
      if (this.spectating) {
        if (this.tables.suppress.has(event.code)) event.preventDefault();
        return;
      }
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
      // Pause and mute survive spectating; hop, swing, reset and the camera do
      // not, because those are a rider talking to their own wheel.
      if (this.spectating && !GLOBAL_PRESSED_ACTIONS.has(pressed)) {
        if (this.tables.suppress.has(event.code)) event.preventDefault();
        return;
      }
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
