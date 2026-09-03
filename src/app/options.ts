/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHARACTER_IDS, DEFAULT_CHARACTER, type PlayableCharacterId } from '../data/riders.ts';
import { SafeStorage } from '../platform/storage.ts';
import type { PressedAction, HeldAction } from '../input/actions.ts';

/**
 * Everything the player configures — M9, and the milestone's architectural
 * risk.
 *
 * **The options firewall** (master §4.3, AGENTS.md invariant 5): nothing in
 * this file may reach `src/simulation/`. Sensitivity, field of view,
 * quality, and volumes are presentation and device state; the ride is not
 * configurable. Until M9 nothing enforced that because nothing configurable
 * existed. Now it is enforced three ways, and the order matters:
 *
 *   1. **Structurally.** `src/architecture.test.ts` fails if anything under
 *      `simulation/` or `level/` imports this file, or anything else from the
 *      presentation half of the codebase. A layering rule that lives only in a
 *      document gets violated; this one fails a test.
 *   2. **By shape.** Not one field below is a physical quantity. There is no
 *      grip multiplier, no acceleration scale, no "easy mode" — because the
 *      moment one exists, two players' rides are no longer the same ride and
 *      every tuning conversation acquires a "with which options?" clause.
 *   3. **By route.** Options never travel to a consumer as an options object.
 *      `app/Game.ts` reads them and pushes plain scalars into the systems that
 *      need them, exactly as it already pushes developer tuning — so the chase
 *      camera receives a number between 0 and 1 and never learns that a player
 *      or a settings screen exists.
 *
 * The tuning table is the *other* half of that contract and stays where it is:
 * `src/data/tuning.ts` holds what a developer changes, this file holds what a
 * player changes, and the two never merge. A value that belongs in both is a
 * value that has not been thought about yet.
 *
 * Nothing here touches the DOM, so all of it is `node --test` territory.
 */

/** Rendering effort. Presentation only — the simulation is identical in each. */
export type QualityLevel = 'low' | 'medium' | 'high';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

/**
 * What the speed readout is labelled in.
 *
 * The world is metric everywhere else and stays that way — this changes one
 * number on the HUD and nothing else. It is here rather than in the HUD
 * because a player who picks mph means it next time too.
 */
export type SpeedUnit = 'kph' | 'mph';

export const SPEED_UNITS: readonly SpeedUnit[] = ['kph', 'mph'];

/**
 * Whether the on-screen controls are shown (M11.5).
 *
 * Three states rather than a Boolean, because the honest answer for most
 * players is "work it out". `auto` shows them on a device whose primary
 * pointer is a finger, and on any device the moment one actually touches the
 * screen — which is the only way to be right about a laptop with a
 * touchscreen, where the media query says mouse and the player may still reach
 * up and drive with a thumb. `on` and `off` are the overrides for the two
 * cases automatic detection cannot get right on its own: a desktop being used
 * from a touch monitor, and a phone with a pad paired to it.
 */
export type TouchControlsMode = 'auto' | 'on' | 'off';

export const TOUCH_CONTROL_MODES: readonly TouchControlsMode[] = ['auto', 'on', 'off'];

/** Control-size range, as a multiplier. Both ends are usable, neither is silly. */
export const TOUCH_SCALE_MIN = 0.8;
export const TOUCH_SCALE_MAX = 1.4;

/** Every action a player may rebind. Debug keys are deliberately not bindable. */
export type BindableAction = HeldAction | PressedAction;

/**
 * A saved binding override: action → the `KeyboardEvent.code` values bound to
 * it. An action absent from the map keeps its default bindings, so a record
 * written by an older build that knew fewer actions still loads.
 */
export type BindingOverrides = Readonly<Record<string, readonly string[]>>;

export interface GameOptions {
  // -- Rider ----------------------------------------------------------------
  /**
   * Who the player rides as.
   *
   * **The one field here that had to argue its way in.** Every other option is
   * plainly presentation; a character sounds like it could be gameplay, so the
   * constraint is written down rather than assumed: *this field may only ever
   * reach `render/` and `audio/`, and it carries appearance and a crash voice
   * — and, since M29, for one rider, a manner of riding — and nothing else.*
   * Every rider is built to one `RIDER_BLOCKOUT` skeleton, rides through one
   * controller, and is bit-identical to the simulation — which is what keeps
   * the firewall's substantive promise intact (two players on the same seed
   * have the same ride) rather than merely its structural one.
   *
   * The Drunkard's manner is the one exception, and it is shaped so that the
   * promise survives it: it is theatre on the path and the pose, competitively
   * neutral by measurement (`docs/PLANS.md` §29.4), the identity by default,
   * and the composition root installs it from the roster (`data/riders.ts`)
   * against the seat's character — never from this record, which is why this
   * file may not so much as name it (the census test beside the roster's
   * data reads this file and says so). The field still carries a name and
   * nothing physical.
   *
   * If a rider ever gets a physical quantity of its own — a speed, a grip, a
   * brake — it stops being an option that day: invariant 5 forbids player
   * configuration reaching `simulation/` at all, and a per-rider number would
   * belong in `data/tuning.ts` where it is the same for everybody. That is
   * `docs/PLANS.md` §13 q3, and it is the owner's to open; he opened it once,
   * for one rider, as a manner and never a stat.
   *
   * It is deliberately *not* level identity either. A personal best records
   * where a run happened; folding the rider into a level id would orphan every
   * existing time the first time somebody switched (`data/riders.ts`).
   */
  readonly character: PlayableCharacterId;

  // -- Display --------------------------------------------------------------
  readonly quality: QualityLevel;
  /**
   * Field-of-view trim, degrees, added to the camera's speed-eased value.
   *
   * A trim rather than an absolute setting on purpose. The 65°→78° ease is the
   * game's strongest speed cue (`docs/PLANS.md` §5) and an absolute FOV control
   * would let a player flatten it to nothing without ever meaning to; an
   * offset moves both ends together and keeps the cue intact at every setting.
   */
  readonly fieldOfViewTrim: number;
  readonly speedUnit: SpeedUnit;

  // -- Audio ----------------------------------------------------------------
  readonly volumeMaster: number;
  readonly volumeSfx: number;
  readonly volumeUi: number;
  readonly volumeMusic: number;
  /** `M`'s state, which is now a persisted option rather than a session flag. */
  readonly muted: boolean;

  // -- Input ----------------------------------------------------------------
  readonly bindings: BindingOverrides;
  readonly gamepadEnabled: boolean;
  /** Radial stick dead zone, 0..0.5. Device state, not a ride parameter. */
  readonly gamepadDeadZone: number;

  /** Whether the on-screen controls are drawn. See `TouchControlsMode`. */
  readonly touchControls: TouchControlsMode;
  /**
   * Put the two-axis ride stick under the right thumb and actions under the left.
   *
   * A left-handed player is not a preference to be talked out of, and mirroring
   * the two clusters costs one attribute. It is deliberately a *mirror* rather
   * than a free layout: a control the player can drag anywhere is a control
   * they can drag off the screen, and there is no way back from that on a
   * device with no keyboard.
   */
  readonly touchSwapSides: boolean;
  /**
   * Control size, as a multiplier on the drawn size *and* both stick axes.
   *
   * Phones differ by more than any other target: the same layout has to work
   * on a small phone held in one hand and on a tablet held in two. The two
   * scale together on purpose — see `input/touch.ts`.
   */
  readonly touchScale: number;

  // -- Onboarding -----------------------------------------------------------
  /**
   * Which first-ride prompts the player has already been shown and satisfied.
   *
   * `docs/PLANS.md` §3.6 reserved "seen-tutorial flags" for exactly this. A
   * list rather than a count, so adding a fourth prompt later does not
   * retroactively mark it seen for everybody who has ridden before.
   */
  readonly seenPrompts: readonly string[];

  /**
   * Whether the player has ever opened the rider chooser.
   *
   * The title chip advertises itself until this is true and then stops for
   * good — M23, and the owner's report: the chip *"is so small and what not
   * some casual players might not even realize there is a change rider
   * setting"*. It is the same failure M20 answered for fresh routes, and it
   * gets the same shape of answer: the affordance introduces itself once,
   * rather than a player being expected to find it.
   *
   * **Deliberately its own field rather than a member of `seenPrompts`
   * above.** That array is owned wholesale by `ui/onboarding.ts` — the
   * composition root re-writes it from the `Onboarding` instance's own set
   * whenever a ride prompt retires (`Game.persistOnboarding`), and that set
   * was seeded at boot. A flag written to the array mid-session by anybody
   * else would be silently dropped by the next prompt to finish, which is a
   * bug that would only show up as "the hint came back" days later.
   *
   * It is persisted rather than per-session because a returning player who
   * already knows where the roster is should never see it flash again — a
   * hint that reappears every launch is the nagging the standing annoyance
   * rule forbids. Clearing it is `Reset everything`, which is correct: a
   * player who reset the game back to its first run gets the first run.
   */
  readonly seenRiderChooser: boolean;
}

export const DEFAULT_OPTIONS: GameOptions = Object.freeze({
  character: DEFAULT_CHARACTER,

  quality: 'high' as QualityLevel,
  fieldOfViewTrim: 0,
  speedUnit: 'kph' as SpeedUnit,

  // Unity across the board, because the owner accepted the M8 mix at exactly
  // these levels on 2026-08-05. A default that trimmed anything would silently
  // re-open a balance question that is already closed.
  volumeMaster: 1,
  volumeSfx: 1,
  volumeUi: 1,
  volumeMusic: 1,
  muted: false,

  bindings: Object.freeze({}) as BindingOverrides,
  gamepadEnabled: true,
  gamepadDeadZone: 0.18,

  touchControls: 'auto' as TouchControlsMode,
  touchSwapSides: false,
  touchScale: 1,

  seenPrompts: Object.freeze([]) as readonly string[],
  seenRiderChooser: false,
});

/** Where the record lives inside `SafeStorage`'s namespace. */
export const OPTIONS_KEY = 'options';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

/**
 * Trim range, degrees. Wide enough to matter, narrow enough that the horizon
 * stays where the level was authored against it.
 */
export const FOV_TRIM_MIN = -8;
export const FOV_TRIM_MAX = 12;

/**
 * Coerce anything at all into a valid `GameOptions`.
 *
 * **Every field is treated as hostile**, because every field can be: a record
 * written by a newer build and read by an older one, a player editing
 * `localStorage` by hand, or a half-written value from a tab killed mid-save.
 * The alternative — trusting the parse — is how a string ends up in a volume
 * field and silences the game with nothing in the console to explain it.
 *
 * Unknown fields are dropped and missing fields take their default, so this is
 * also the forward- and backward-compatibility story for the whole save
 * format. It never returns null: a record too broken to use degrades to the
 * defaults rather than losing the player their other settings.
 */
export function coerceOptions(raw: unknown, base: GameOptions = DEFAULT_OPTIONS): GameOptions {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const quality = QUALITY_LEVELS.includes(record.quality as QualityLevel)
    ? (record.quality as QualityLevel)
    : base.quality;

  return Object.freeze({
    character: CHARACTER_IDS.includes(record.character as PlayableCharacterId)
      ? (record.character as PlayableCharacterId)
      : base.character,

    quality,
    fieldOfViewTrim: typeof record.fieldOfViewTrim === 'number'
      ? clampRange(record.fieldOfViewTrim, FOV_TRIM_MIN, FOV_TRIM_MAX, base.fieldOfViewTrim)
      : base.fieldOfViewTrim,
    speedUnit: SPEED_UNITS.includes(record.speedUnit as SpeedUnit)
      ? (record.speedUnit as SpeedUnit)
      : base.speedUnit,

    volumeMaster: typeof record.volumeMaster === 'number'
      ? clamp01(record.volumeMaster)
      : base.volumeMaster,
    volumeSfx: typeof record.volumeSfx === 'number' ? clamp01(record.volumeSfx) : base.volumeSfx,
    volumeUi: typeof record.volumeUi === 'number' ? clamp01(record.volumeUi) : base.volumeUi,
    volumeMusic: typeof record.volumeMusic === 'number'
      ? clamp01(record.volumeMusic)
      : base.volumeMusic,
    muted: typeof record.muted === 'boolean' ? record.muted : base.muted,

    bindings: coerceBindings(record.bindings, base.bindings),
    gamepadEnabled: typeof record.gamepadEnabled === 'boolean'
      ? record.gamepadEnabled
      : base.gamepadEnabled,
    gamepadDeadZone: typeof record.gamepadDeadZone === 'number'
      ? clampRange(record.gamepadDeadZone, 0, 0.5, base.gamepadDeadZone)
      : base.gamepadDeadZone,

    touchControls: TOUCH_CONTROL_MODES.includes(record.touchControls as TouchControlsMode)
      ? (record.touchControls as TouchControlsMode)
      : base.touchControls,
    touchSwapSides: typeof record.touchSwapSides === 'boolean'
      ? record.touchSwapSides
      : base.touchSwapSides,
    touchScale: typeof record.touchScale === 'number'
      ? clampRange(record.touchScale, TOUCH_SCALE_MIN, TOUCH_SCALE_MAX, base.touchScale)
      : base.touchScale,

    seenPrompts: Array.isArray(record.seenPrompts)
      ? Object.freeze(record.seenPrompts.filter((id): id is string => typeof id === 'string'))
      : base.seenPrompts,
    seenRiderChooser: typeof record.seenRiderChooser === 'boolean'
      ? record.seenRiderChooser
      : base.seenRiderChooser,
  });
}

/**
 * Validate a saved binding map.
 *
 * Key codes are strings of bounded length and nothing else. The length cap is
 * not paranoia about attackers — it is about a corrupt record turning into a
 * settings screen that tries to render a megabyte of text as a key name.
 */
function coerceBindings(raw: unknown, base: BindingOverrides): BindingOverrides {
  if (typeof raw !== 'object' || raw === null) return base;
  const out: Record<string, readonly string[]> = {};
  for (const [action, codes] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(codes)) continue;
    const valid = codes.filter(
      (code): code is string => typeof code === 'string' && code.length > 0 && code.length <= 32,
    );
    // An action bound to nothing is stored as an empty array on purpose: it is
    // how "the player unbound this" is distinguished from "the player never
    // touched it", and only the second may fall back to the defaults.
    out[action] = Object.freeze(valid);
  }
  // **Identity is preserved when nothing changed**, and that is load-bearing
  // rather than tidy. Every `set()` re-coerces the whole record, so a fresh
  // object here would make the bindings look changed on every single option
  // change — including the seen-prompt flag written mid-ride. The composition
  // root reinstalls the keyboard's tables when they change, and reinstalling
  // them clears held keys by design, so a new object per save cut the throttle
  // from under a rider a few seconds into their first ride.
  return sameBindings(out, base) ? base : Object.freeze(out);
}

/** Value equality for a binding map. */
function sameBindings(a: BindingOverrides, b: BindingOverrides): boolean {
  const actions = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const action of actions) {
    const left = a[action];
    const right = b[action];
    if (left === undefined || right === undefined) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}

export type OptionsListener = (options: GameOptions) => void;

/**
 * The live options record, its persistence, and its change notification.
 *
 * Notification rather than polling, for the same reason `LiveTuning` uses it:
 * the systems that read an option read it once when it changes, so nothing in
 * the frame loop asks a question whose answer changes a few times an hour.
 */
export class OptionsStore {
  private readonly storage: SafeStorage;
  private readonly listeners = new Set<OptionsListener>();
  private readonly defaults: GameOptions;
  private options: GameOptions;

  /**
   * @param storage Where the record lives.
   * @param defaults Overrides for the shipped defaults. Reserved for harnesses
   *   and future platform-derived defaults; the running game currently uses
   *   the shipped record unchanged.
   */
  constructor(storage: SafeStorage, defaults: Partial<GameOptions> = {}) {
    this.storage = storage;
    this.defaults = coerceOptions(defaults, DEFAULT_OPTIONS);
    this.options = this.storage.readJson(
      OPTIONS_KEY,
      (raw) => coerceOptions(raw, this.defaults),
    ) ?? this.defaults;
  }

  get current(): GameOptions {
    return this.options;
  }

  /** True while changes here will still be here after a reload. */
  get persistent(): boolean {
    return this.storage.persistent;
  }

  /**
   * Change some options. Clamped, saved, and announced — in that order.
   *
   * A patch rather than a whole record, because every caller changes one
   * thing: a slider, a toggle, a rebind. Announcing after saving means a
   * listener that reads `current` during the notification sees exactly what
   * was persisted.
   */
  set(patch: Partial<GameOptions>): void {
    const next = coerceOptions({ ...this.options, ...patch }, this.options);
    if (sameOptions(next, this.options)) return;
    this.options = next;
    this.storage.writeJson(OPTIONS_KEY, next);
    for (const listener of this.listeners) listener(next);
  }

  /** Back to the defaults this store was built with. */
  reset(): void {
    if (sameOptions(this.defaults, this.options)) return;
    this.options = this.defaults;
    this.storage.writeJson(OPTIONS_KEY, this.defaults);
    for (const listener of this.listeners) listener(this.defaults);
  }

  /** Record that a first-ride prompt has done its job. Idempotent. */
  markPromptSeen(id: string): void {
    if (this.options.seenPrompts.includes(id)) return;
    this.set({ seenPrompts: [...this.options.seenPrompts, id] });
  }

  onChange(listener: OptionsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}

/**
 * Value equality, so a slider dragged back to where it started does not save
 * and does not notify.
 *
 * Written out rather than compared as JSON: key order in a serialized record
 * is an implementation detail, and two equal records that stringify
 * differently would make every listener fire on a no-op change.
 */
export function sameOptions(a: GameOptions, b: GameOptions): boolean {
  if (
    a.character !== b.character
    || a.quality !== b.quality
    || a.fieldOfViewTrim !== b.fieldOfViewTrim
    || a.speedUnit !== b.speedUnit
    || a.volumeMaster !== b.volumeMaster
    || a.volumeSfx !== b.volumeSfx
    || a.volumeUi !== b.volumeUi
    || a.volumeMusic !== b.volumeMusic
    || a.muted !== b.muted
    || a.gamepadEnabled !== b.gamepadEnabled
    || a.gamepadDeadZone !== b.gamepadDeadZone
    || a.touchControls !== b.touchControls
    || a.touchSwapSides !== b.touchSwapSides
    || a.touchScale !== b.touchScale
    || a.seenRiderChooser !== b.seenRiderChooser
  ) {
    return false;
  }

  if (a.seenPrompts.length !== b.seenPrompts.length) return false;
  for (let i = 0; i < a.seenPrompts.length; i += 1) {
    if (a.seenPrompts[i] !== b.seenPrompts[i]) return false;
  }

  return sameBindings(a.bindings, b.bindings);
}
