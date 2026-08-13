/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { HeldAction, PressedAction } from './actions.ts';

/**
 * Keyboard bindings — the defaults from `docs/PLANS.md` §4.7, and from M9 the
 * override map that replaces them.
 *
 * Keyed by `KeyboardEvent.code`, which is the physical key rather than the
 * character it produces. `code` keeps WASD on the same three-plus-one cluster
 * on AZERTY and Dvorak; `key` would put "Z" where the accelerator should be
 * for a French rider and give them no way to tell why.
 *
 * **Rebinding is a data swap, and it was designed to be one before it
 * existed.** Since M1 this file has been a lookup table rather than a switch
 * statement precisely so that a saved override map could replace it without a
 * single call site changing, and that is exactly what happened: `resolve`
 * below produces the same two code-to-action records the keyboard layer has
 * always read, and `keyboard.ts` gained one setter. Nothing else moved.
 *
 * The direction of the tables is worth stating because it flips here. The
 * *authoring* direction is action → keys, because that is the question a
 * player asks ("what accelerates?") and because an action may have several
 * keys. The *lookup* direction is key → action, because that is the question
 * an event asks. `resolve` is the only place the two meet, and it is where
 * every conflict is settled.
 */

/** Every action a player may bind a key to. */
export type BindableAction = HeldAction | PressedAction;

export interface BindingSpec {
  readonly action: BindableAction;
  /** Held actions and one-shots take different routes through `ActionState`. */
  readonly kind: 'held' | 'pressed';
  /** What the settings screen calls it. */
  readonly label: string;
  readonly defaults: readonly string[];
}

/**
 * The bindable set, in the order the settings screen lists them.
 *
 * Ordered by how often a rider uses it rather than alphabetically or by type:
 * the first four are the ride, and quick reset near the bottom is deliberate
 * because it is the one a player rebinds after hitting it by accident.
 */
export const BINDINGS: readonly BindingSpec[] = Object.freeze([
  Object.freeze({
    action: 'accelerate' as BindableAction,
    kind: 'held' as const,
    label: 'Accelerate',
    defaults: Object.freeze(['KeyW', 'ArrowUp']),
  }),
  Object.freeze({
    action: 'brake' as BindableAction,
    kind: 'held' as const,
    label: 'Brake / reverse',
    defaults: Object.freeze(['KeyS', 'ArrowDown']),
  }),
  Object.freeze({
    action: 'steerLeft' as BindableAction,
    kind: 'held' as const,
    label: 'Carve left',
    defaults: Object.freeze(['KeyA', 'ArrowLeft']),
  }),
  Object.freeze({
    action: 'steerRight' as BindableAction,
    kind: 'held' as const,
    label: 'Carve right',
    defaults: Object.freeze(['KeyD', 'ArrowRight']),
  }),
  Object.freeze({
    action: 'hop' as BindableAction,
    kind: 'pressed' as const,
    label: 'Hop',
    defaults: Object.freeze(['Space']),
  }),
  Object.freeze({
    action: 'crouch' as BindableAction,
    kind: 'held' as const,
    label: 'Crouch / charge hop',
    defaults: Object.freeze(['ShiftLeft', 'ShiftRight']),
  }),
  // M14. `KeyF` was free — it is not in any earlier row, not reserved, and not
  // a scrolling key, so it costs no existing muscle memory and needs no
  // suppression. It sits with the ride actions rather than below Camera view
  // because in Knockabout it is used as often as hop.
  Object.freeze({
    action: 'swing' as BindableAction,
    kind: 'pressed' as const,
    label: 'Swing paddle',
    defaults: Object.freeze(['KeyF']),
  }),
  Object.freeze({
    action: 'cameraCycle' as BindableAction,
    kind: 'pressed' as const,
    label: 'Camera view',
    defaults: Object.freeze(['KeyC']),
  }),
  Object.freeze({
    action: 'muteAudio' as BindableAction,
    kind: 'pressed' as const,
    label: 'Mute',
    defaults: Object.freeze(['KeyM']),
  }),
  Object.freeze({
    action: 'reset' as BindableAction,
    kind: 'pressed' as const,
    label: 'Quick reset',
    defaults: Object.freeze(['KeyR']),
  }),
]);

/**
 * `Escape` is bound to pause and is deliberately **not** in `BINDINGS`.
 *
 * It has one owner and cannot be given another: from the moment pointer lock
 * exists, Escape belongs to the lock, with the explicit pause edge owning it
 * only while unlocked (master §8.3). Offering it as a rebindable row would let
 * a player move pause off the only key every browser already agrees means
 * "get me out of this", and leave them with a full-screen game they cannot
 * escape from.
 */
export const PAUSE_CODE = 'Escape';

/**
 * Keys a player may not bind to.
 *
 * Escape for the reason above. The function keys because they are the
 * developer tooling and a player who rebinds hop onto F3 has bound it to a
 * diagnostic overlay. Tab because it is how a keyboard user reaches the menus
 * at all, and binding over it would trap them.
 */
export const RESERVED_CODES: ReadonlySet<string> = Object.freeze(
  new Set(['Escape', 'F3', 'F4', 'Tab']),
);

/** Developer tooling. Never gameplay, and never bound to a gameplay key. */
export type DebugAction = 'toggleOverlay' | 'toggleTuningPanel';

export const DEBUG_BINDINGS: Readonly<Record<string, DebugAction>> = Object.freeze({
  F3: 'toggleOverlay',
  F4: 'toggleTuningPanel',
});

/** The resolved lookup tables the keyboard layer reads on every event. */
export interface BindingTables {
  readonly held: Readonly<Record<string, HeldAction>>;
  readonly pressed: Readonly<Record<string, PressedAction>>;
  /** Keys whose browser default is suppressed while the game has focus. */
  readonly suppress: ReadonlySet<string>;
}

/**
 * Keys whose browser default we suppress **whatever they are bound to**.
 *
 * Space scrolls the page and the arrows scroll it too, both of which move the
 * canvas out from under the player mid-jump. Escape is deliberately absent:
 * suppressing it fights the browser for full-screen exit.
 *
 * From M9 this is a floor rather than the whole list — `resolve` adds every
 * bound key whose default would move the page, so a player who rebinds hop to
 * PageDown does not get a scrolled page with it.
 */
const ALWAYS_SUPPRESSED = Object.freeze([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'F3',
  'F4',
]);

/** Bound keys that also scroll, page, or otherwise move the document. */
const SCROLLING_CODES = Object.freeze([
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Backspace',
  'Enter',
  'NumpadEnter',
]);

/**
 * Turn an override map into the two lookup records, with every conflict
 * settled.
 *
 * Three rules, and each exists because of a way a rebinding screen can leave a
 * player stuck:
 *
 *   1. **An action absent from the overrides keeps its defaults.** That is
 *      what makes a saved record from an older build — one that had never
 *      heard of `muteAudio` — load without silently unbinding it.
 *   2. **An action present but empty is genuinely unbound.** A player who
 *      cleared a row meant to clear it, and falling back to the default there
 *      would make the row impossible to clear.
 *   3. **A key can drive only one action, and the later spec wins.** Two
 *      actions on one key is not a conflict a player can see or resolve from
 *      the settings screen, so the screen removes the key from its previous
 *      owner when it assigns it — and this settles the case anyway for a
 *      hand-edited record, rather than leaving whichever action happened to be
 *      iterated last in charge by accident.
 */
export function resolveBindings(
  overrides: Readonly<Record<string, readonly string[]>> = {},
): BindingTables {
  const held: Record<string, HeldAction> = {};
  const pressed: Record<string, PressedAction> = {};
  const suppress = new Set<string>(ALWAYS_SUPPRESSED);

  for (const spec of BINDINGS) {
    const codes = overrides[spec.action] ?? spec.defaults;
    for (const code of codes) {
      if (RESERVED_CODES.has(code)) continue;
      // One key, one action. Clear it from the other table too, so a key moved
      // from a held action to a one-shot does not keep doing both.
      delete held[code];
      delete pressed[code];
      if (spec.kind === 'held') held[code] = spec.action as HeldAction;
      else pressed[code] = spec.action as PressedAction;
      if (SCROLLING_CODES.includes(code)) suppress.add(code);
    }
  }

  // Pause is not rebindable and is therefore not in the loop above.
  pressed[PAUSE_CODE] = 'pause';

  return {
    held: Object.freeze(held),
    pressed: Object.freeze(pressed),
    suppress,
  };
}

/**
 * What a player would call a key.
 *
 * `KeyboardEvent.code` is a physical position, not a label, and showing
 * "ShiftLeft" or "Digit1" in a settings row is showing the player our
 * implementation. Only the regular patterns are translated; anything else
 * falls through as-is, which is right — a key we have no better name for is
 * still better identified by its code than by a guess.
 */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Left shift',
    ShiftRight: 'Right shift',
    ControlLeft: 'Left ctrl',
    ControlRight: 'Right ctrl',
    AltLeft: 'Left alt',
    AltRight: 'Right alt',
    Escape: 'Esc',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  return named[code] ?? code;
}

/**
 * The defaults, as the two lookup records.
 *
 * Kept as named exports because they were the module's interface before M9 and
 * several tests state their expectations against them; they are now simply
 * `resolveBindings()` with no overrides.
 */
const DEFAULT_TABLES = resolveBindings();

export const HELD_BINDINGS: Readonly<Record<string, HeldAction>> = DEFAULT_TABLES.held;
export const PRESSED_BINDINGS: Readonly<Record<string, PressedAction>> = DEFAULT_TABLES.pressed;
export const SUPPRESS_DEFAULT: ReadonlySet<string> = DEFAULT_TABLES.suppress;
