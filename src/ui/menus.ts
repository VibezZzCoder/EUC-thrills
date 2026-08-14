/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {
  CHARACTERS,
  isPlayableCharacter,
  type CharacterId,
  type PlayableCharacterId,
} from '../data/riders.ts';
import { BINDINGS, RESERVED_CODES, keyLabel, type BindableAction } from '../input/bindings.ts';
import {
  FOV_TRIM_MAX,
  FOV_TRIM_MIN,
  QUALITY_LEVELS,
  SPEED_UNITS,
  TOUCH_CONTROL_MODES,
  TOUCH_SCALE_MAX,
  TOUCH_SCALE_MIN,
  type GameOptions,
  type TouchControlsMode,
} from '../app/options.ts';

/**
 * Title, pause, and settings — the menu surfaces M9 owes, and the file that
 * replaces `ui/notice.ts`'s placeholder pause card. M10 adds a fourth, the
 * results screen, and M12 Phase 4 a fifth, the fresh-route panel; both are
 * built to exactly the same rules rather than as special cases, and the
 * paragraphs below apply to them unchanged.
 *
 * **The fifth one brought the first text input this game has ever had**, which
 * is worth flagging to anyone adding another. Three of the rules below were
 * written when every control was a button, a slider, a checkbox or a select,
 * and a field tests all three: the capture-phase keydown handler has to let a
 * typed character through (it does — it returns on anything that is not Tab or
 * Escape, and the rebinding branch only arms on the settings screen), the
 * gamepad's confirm has to mean something on a control a pad cannot operate
 * (see `confirm()`), and the coarse-pointer target floor has to cover it
 * (`DESIGN.md` §9c).
 *
 * **Accessibility here is structural, not a pass at the end** (`docs/PLANS.md`
 * §8.2, master §14.1). The rule that shaped every decision below is that an
 * ARIA role is a *description* of behaviour that already exists, never a
 * substitute for it. So:
 *
 *   - Every control is the native element for the job — `<button>`,
 *     `<input type="range">`, `<input type="checkbox">`, `<select>`. Each
 *     arrives with keyboard behaviour, an accessible name from its `<label>`,
 *     and a value announcement that no amount of `role="slider"` on a `<div>`
 *     would have reproduced correctly.
 *   - The panel is a real modal dialog: `role="dialog"`, `aria-modal`, a
 *     label, a focus trap on Tab, Escape to leave, and focus **restored** to
 *     whatever had it before the menu opened. A trap without a restore is how
 *     a keyboard user ends up back at the top of the document every time they
 *     close a menu.
 *   - Groups are `<fieldset>`/`<legend>`, so a screen reader announces which
 *     section a control is in rather than reading nine sliders in a row.
 *
 * **The rebinding capture is the one place a raw key event is read outside
 * `input/`,** and it is deliberate: while a row is listening, the key the
 * player presses is not an action, it is a *name*. That is why the game's own
 * keyboard layer ignores it — `input/keyboard.ts` already declines any event
 * aimed at a focused control — and why this handler runs in the capture phase
 * and stops the event dead.
 *
 * Nothing here touches the simulation, and nothing here is imported by it.
 * The panel reads a `GameOptions` and reports edits back through one callback;
 * `app/Game.ts` is what turns those into behaviour (the options firewall,
 * invariant 5).
 */

export type MenuScreen =
  | 'none' | 'title' | 'pause' | 'settings' | 'results' | 'routes' | 'riders';

/**
 * The touch-mode select's words.
 *
 * "Automatic" says nothing on its own, so each option says what it *does* —
 * a player deciding whether to force the controls on needs to know that the
 * default already handles the ordinary case.
 */
const TOUCH_MODE_LABELS: Readonly<Record<TouchControlsMode, string>> = Object.freeze({
  auto: 'Automatic',
  on: 'Always show',
  off: 'Never show',
});

/** Which touch state the controls section is describing. */
export type TouchStatus = 'shown' | 'waiting' | 'forced' | 'disabled';

export interface MenuCallbacks {
  onStartRide(): void;
  onResume(): void;
  onOpenSettings(): void;
  onCloseSettings(): void;
  onQuitToTitle(): void;
  onChange(patch: Partial<GameOptions>): void;
  onResetOptions(): void;
  /** The player chose the time trial from the title screen. */
  onStartChallenge(): void;
  /**
   * The player chose Knockabout from the title screen — M14.
   *
   * The button is always there (§13 q13), so this may well be reached on a
   * world with nothing to hit; deciding what that means is the caller's, not
   * this screen's.
   */
  onStartKnockabout(): void;
  /**
   * Start a police chase from the title — M18.
   *
   * `onStartKnockabout`'s twin, and always offered for the same reason: a
   * button that appears and disappears is a mode nobody learns exists. On a
   * world that cannot host a chase this opens the fresh-route panel and says
   * so, which is the caller's decision rather than this screen's.
   */
  onStartChase(): void;
  /** Ride the same route again, from the results screen. */
  onRetryChallenge(): void;
  /** Leave the results screen for the title. */
  onResultsToTitle(): void;

  // -- M12 Phase 4 ------------------------------------------------------------
  /** Open the fresh-route panel from the title. */
  onOpenRoutes(): void;
  /** Leave the fresh-route panel for the title. */
  onCloseRoutes(): void;
  /** Build this seed's route and ride it, untimed. */
  onRideRoute(seed: string): void;
  /** Build this seed's route and start a timed run on it. */
  onTimeTrialRoute(seed: string): void;
  /** Put a seed that is known to build into the field. */
  onSurpriseSeed(): void;
  /** Go back to the hand-authored city, which is the default world. */
  onRideTheCity(): void;
  /** Copy a link to the loaded world. */
  onCopyLink(): void;

  // -- M14.5 ------------------------------------------------------------------
  /** Open the rider chooser from the title. */
  onOpenRiders(): void;
  /** Leave the rider chooser for the title. */
  onCloseRiders(): void;
  /** Ride as this one from now on. Applies immediately; the panel stays open. */
  onPickRider(id: PlayableCharacterId): void;
}

/**
 * Which world is loaded, as facts rather than as a sentence.
 *
 * The words are this file's — `app/Game.ts` knows whether a route is generated
 * and what its seed is, and knowing how to say that in English is not its job.
 * It is the same split the results screen uses in the other direction: numbers
 * are formatted upstream because two places must not disagree about what
 * 92.005 seconds looks like, and prose is written here because there is only
 * one place it appears.
 */
export interface WorldView {
  /** True when a seeded route is loaded rather than the hand-authored slice. */
  readonly generated: boolean;
  /** The loaded route's seed. Empty on the slice. */
  readonly seed: string;
}

/**
 * What the fresh-route panel is currently saying about a seed.
 *
 * A tagged union rather than a string, for the reason above and for one more:
 * `refused` is the state the owner's q6 answer turns on — *"the entrance says
 * plainly that the seed doesn't make a route and stays on seed entry — no
 * silent world swap, ever."* A message the caller composes is a message a
 * caller could compose wrongly.
 */
export type RouteStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'building'; readonly seed: string }
  | { readonly kind: 'ready'; readonly seed: string }
  | { readonly kind: 'blank' }
  | { readonly kind: 'no-route'; readonly seed: string }
  | { readonly kind: 'copied' }
  | { readonly kind: 'copy-failed'; readonly link: string }
  /**
   * The player chose Knockabout on a world with nothing to hit — M14, §13 q13.
   *
   * The entrance is always visible rather than hidden on a target-free world,
   * because a mode that appears and disappears is a mode nobody learns exists.
   * What it does instead is bring them here and say what the mode needs, which
   * is the same shape as `no-route` above: name the fix, do not apologise, and
   * never silently swap the world for one that would have worked.
   */
  | { readonly kind: 'needs-targets' }
  /**
   * The player chose the chase on a world that cannot host one — M18, §13 q26.
   *
   * `needs-targets`' twin, on the same terms and for the same reason. The
   * chase runs on generated routes only, because the cop follows the route's
   * own through line and the hand-authored city has one the mode was never
   * measured on. Same shape again: name the fix, do not apologise, never
   * silently swap the world.
   */
  | { readonly kind: 'needs-route' };

/** Why the player arrived at Fresh route. The chooser must not erase it. */
export type RoutePurpose = 'ride' | 'knockabout' | 'chase';

/** One checkpoint's line on the results screen. */
export interface ResultsRow {
  readonly label: string;
  readonly time: string;
  readonly delta: string;   // '' when there is no record to compare
  readonly ahead: boolean;
}

/**
 * A finished run, ready to write.
 *
 * Every field is already a string. The results screen does no arithmetic and
 * no formatting — `ui/hudModel.ts`'s `formatRunTime` and `formatDelta` are what
 * produce these, so the clock in the corner of the frame and the total on this
 * screen cannot disagree about what 92.005 seconds looks like.
 */
export interface ResultsView {
  readonly heading: string;        // 'New record' | 'Run complete'
  readonly isRecord: boolean;
  readonly total: string;
  readonly best: string;           // '—' when this run is the first
  readonly deltaToBest: string;    // '' when this run is the record
  readonly ahead: boolean;
  readonly rows: readonly ResultsRow[];
  readonly notes: readonly string[];
}

export interface MenuOptions {
  readonly callbacks: MenuCallbacks;
  readonly parent?: HTMLElement;
  /**
   * The longest seed the field will accept.
   *
   * Handed in rather than imported, so `ui/` learns nothing about `level/`.
   * The number is derived from the record store's level-id cap and lives in
   * `level/levels.ts` beside the function that enforces it; a field that let a
   * player type past it would produce a personal best that is silently never
   * saved.
   */
  readonly seedMaxLength: number;
}

/**
 * The title screen.
 *
 * Two changes at M14.5, and both are about a player who has never seen the
 * game before knowing what is behind a word.
 *
 * **Every entrance now says what it gives you.** `Fresh route` was the third of
 * four one-or-two-word buttons and read as a synonym for the others; the owner's
 * report was that players did not realise other courses existed at all. A
 * second line inside the same button costs nothing structurally — it is still
 * one `<button>`, still one `data-menu`, still in the same place in the Tab
 * order, and the browser spec that walks the pad down this list still names the
 * same stops — and it turns four verbs into four offers.
 *
 * **"Riding as Cool Rider." became a control.** It was a full stop; it is now
 * the way in to the chooser, which is where the owner's 2026-08-05 note said a
 * rider-select entrance should go once a second rider existed. Putting it here
 * rather than adding a fifth action button also respects a decision already
 * taken once: `Controls` was removed from this screen after playtest for
 * duplicating Settings, and this screen does not want to grow.
 *
 * **The credit line is the game's only anchor.** People share the play link
 * without naming the author, so the title screen — the one surface inside
 * every share and screenshot — carries the credit itself. It is an `<a>`
 * because it navigates rather than acts, and it does not join the action
 * list above: it is a colophon, not a fifth offer. `focusableSelector()`
 * already walks `[href]`, so keyboard and pad reach it with no new code.
 */
const TITLE_TEMPLATE = `
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-title-heading">
  <h1 class="euc-menu__title" id="euc-title-heading">EUC&nbsp;<span class="accent">THRILLS</span></h1>
  <p class="euc-menu__tagline">One wheel. Total freedom. Ride anywhere.</p>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="start">
      <span class="euc-button__label">Start ride</span>
    </button>
    <button type="button" class="euc-button" data-menu="challenge">
      <span class="euc-button__label">Time trial</span>
      <span class="euc-button__note">Race the clock through the checkpoints</span>
    </button>
    <button type="button" class="euc-button" data-menu="knockabout">
      <span class="euc-button__label">Knockabout</span>
      <span class="euc-button__note">Swing a paddle at everything on the way past</span>
    </button>
    <button type="button" class="euc-button" data-menu="chase">
      <span class="euc-button__label">Police chase</span>
      <span class="euc-button__note">Officer Dorkins is behind you. Stay ahead for five minutes</span>
    </button>
    <button type="button" class="euc-button" data-menu="routes">
      <span class="euc-button__label">Fresh route</span>
      <span class="euc-button__note">Have the game procedurally generate a brand-new place to ride</span>
    </button>
    <button type="button" class="euc-button" data-menu="settings">
      <span class="euc-button__label">Settings</span>
    </button>
  </div>
  <p class="euc-world" data-menu="world"></p>
  <button type="button" class="euc-rider-chip" data-menu="riders">
    <span class="euc-rider-chip__swatch" data-rider-swatch aria-hidden="true"></span>
    <span>Riding as <strong data-rider-name>Cool Rider</strong></span>
    <span class="euc-rider-chip__more">Change rider</span>
  </button>
  <p class="euc-credit">An open-source game by
    <a class="euc-credit__link" href="https://github.com/VibezZzCoder/EUC-thrills"
      target="_blank" rel="noopener">VibezZzCoder</a></p>
</div>
`;

/**
 * What each rider is, in words and in a picture.
 *
 * **Kept here rather than in `data/riders.ts` on purpose**, and it is the same
 * split this file already makes for the fresh-route panel: the *roster* — who
 * exists, what they are called, what colour they are — is a fact about the game
 * and lives in `data/`; a sentence and a portrait are words and pictures, and
 * there is exactly one screen they appear on.
 *
 * The portraits are inline SVG. Nothing in this UI has ever shipped an image
 * and this does not start: an SVG costs no request, scales to any card, and
 * respects the colour tokens, where a PNG would be a build asset, a hashed
 * filename, and a second thing to keep in step with the geometry it depicts.
 * They are `aria-hidden` because the name beside them already says who it is —
 * a portrait that announces itself reads the character's name twice.
 */
const RIDER_CARDS: Readonly<Record<PlayableCharacterId, { blurb: string; portrait: string }>> = {
  'cool-rider': {
    blurb: 'Black moto gear, reflective blue, full-face lid. '
      + 'Rides like he has nothing to prove.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <path d="M20 58c0-19 12-31 28-31s28 12 28 31c0 6-2 11-5 14H25c-3-3-5-8-5-14z"
              fill="#50555e"/>
        <path d="M23 52c3-14 12-22 25-22s22 8 25 22c-6-4-15-6-25-6s-19 2-25 6z"
              fill="#5c626c"/>
        <path d="M26 55c4-4 12-7 22-7s18 3 22 7c-1 7-3 11-6 13H32c-3-2-5-6-6-13z"
              fill="#22252b"/>
        <path d="M28 56c4-3 11-5 20-5s16 2 20 5c-1 5-2 8-4 9H32c-2-1-3-4-4-9z"
              fill="#2f7fe8" opacity="0.92"/>
        <path d="M18 76c6-5 17-8 30-8s24 3 30 8v6H18z" fill="#474b53"/>
        <path d="M30 74c5-2 11-3 18-3s13 1 18 3l-2 8H32z" fill="#2f7fe8"/>
      </svg>`,
  },
  trollina: {
    blurb: 'Wild magenta hair, a skater dress over black tights, knee pads and a grin. '
      + 'Started life as a joke drawing and refused to leave.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <ellipse cx="48" cy="34" rx="27" ry="24" fill="#e0389f"/>
        <g stroke="#e0389f" stroke-width="3.4" stroke-linecap="round" fill="none">
          <path d="M48 28 42 5M48 28 58 7M48 28 30 9M48 28 70 12M48 28 20 22M48 28 82 25"/>
          <path d="M48 32 14 36M48 32 84 42M48 32 17 52M48 32 81 56M48 36 26 64M48 36 72 66"/>
        </g>
        <path d="M28 44c0-12 8.5-21 20-21s20 9 20 21c0 14-8.5 24-20 24s-20-10-20-24z"
              fill="#c08e6e"/>
        <path d="M27 44c1-13 9.5-22 21-22s20 9 21 22c-4-8-11-12-21-12s-17 4-21 12z"
              fill="#e0389f"/>
        <ellipse cx="39.5" cy="46" rx="6.6" ry="8" fill="#f4efe6"/>
        <ellipse cx="56.5" cy="46" rx="6.6" ry="8" fill="#f4efe6"/>
        <ellipse cx="41" cy="47" rx="3" ry="4" fill="#241f22"/>
        <ellipse cx="55" cy="47" rx="3" ry="4" fill="#241f22"/>
        <ellipse cx="42" cy="45" rx="1.1" ry="1.4" fill="#f4f7fb"/>
        <ellipse cx="56" cy="45" rx="1.1" ry="1.4" fill="#f4f7fb"/>
        <path d="M31 36c2-2 5-3 8-2M65 36c-2-2-5-3-8-2" stroke="#241f22"
              stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M40 58c2.5 4.5 13.5 4.5 16 0c-2 1.4-14 1.4-16 0z" fill="#241f22"/>
        <path d="M40 58c3 4 13 4 16 0" stroke="#241f22" stroke-width="2.6"
              stroke-linecap="round" fill="none"/>
        <path d="M20 84c4-8 9-13 15-15l4 5h18l4-5c6 2 11 7 15 15z" fill="#c22c8a"/>
        <path d="M36 76h24l1.6 4H34.4z" fill="#2c2e34"/>
      </svg>`,
  },
  /**
   * Red Rider — M19, and built from Cool Rider's portrait rather than a new
   * drawing, because they are the same silhouette: a full-face lid over a
   * visor over shoulders. What separates them on a card is what separates them
   * at 30 m — the colour field, and the black harness across the chest.
   *
   * **His name is deliberately not drawn into the art**, although the reference
   * plate on his wheel carries it and the plan first said it would go here.
   * The card already renders "Red Rider" in the name span two lines below, and
   * this file's own rule is the one that settles it: a portrait that announces
   * itself reads the character's name twice. The legible wordmark is therefore
   * the name element that was always going to be there.
   *
   * His bolted nameplate was then drawn here as a wordless *badge*, and removed
   * again after looking at it: with nothing to attach to it floated below his
   * shoulder like a sticker, and neither of the portraits above carries a
   * detached element. The plate belongs on the machine it is bolted to, which
   * is where Phase 3 puts it. What stands in for it here is the harness buckle
   * on his chest — connected, and the same piece of hardware his rig carries in
   * three dimensions.
   *
   * The colours are the authored albedos from `BLOCKOUT_COLOURS.redRider*`,
   * exactly as the two cards above use theirs. A card is lit by nothing and a
   * rider is lit by the sun, so these will read a little deeper here than on
   * the wheel — which is the right direction, and the same discrepancy the
   * other two portraits have always carried.
   */
  'red-rider': {
    blurb: 'Gloss red lid, dark visor, red over black armour, and a wheel he built to match. '
      + 'A real rider, in the game because he asked.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <path d="M18 76c6-5 17-8 30-8s24 3 30 8v6H18z" fill="#ba262b"/>
        <path d="M31 71 47 82M65 71 49 82" stroke="#26282e" stroke-width="4.6"
              stroke-linecap="round" fill="none"/>
        <rect x="41" y="78" width="14" height="6" rx="1.6" fill="#26282e"/>
        <path d="M20 58c0-19 12-31 28-31s28 12 28 31c0 6-2 11-5 14H25c-3-3-5-8-5-14z"
              fill="#ba262b"/>
        <path d="M23 52c3-14 12-22 25-22s22 8 25 22c-6-4-15-6-25-6s-19 2-25 6z"
              fill="#d4333a"/>
        <path d="M26 55c4-4 12-7 22-7s18 3 22 7c-1 7-3 11-6 13H32c-3-2-5-6-6-13z"
              fill="#101216"/>
        <path d="M28 56c4-3 11-5 20-5s16 2 20 5c-1 5-2 8-4 9H32c-2-1-3-4-4-9z"
              fill="#1b1d22"/>
        <path d="M30 58c4-2 10-3.4 18-3.4S62 56 66 58c-1 1.6-2 2.6-3.4 3.2-4-1.6-9-2.4-14.6-2.4
                 s-10.6.8-14.6 2.4C32 60.6 31 59.6 30 58z" fill="#2f343d"/>
        <path d="M27 68c5 2.6 12.6 4 21 4s16-1.4 21-4c-.8 2.4-1.8 4-3 5H30c-1.2-1-2.2-2.6-3-5z"
              fill="#d4333a"/>
      </svg>`,
  },
};

/**
 * The rider chooser — M14.5, and the state `app/appState.ts` has been holding
 * open since 2026-08-05.
 *
 * Four decisions, each of which could have gone the other way:
 *
 *   - **A card is a `<button>`, not a styled `<div>`.** Everything on this
 *     screen has to work on a keyboard, a pad and a thumb, and a native button
 *     arrives with all three plus a focus ring, an accessible name, and a place
 *     in the Tab order. The one extra thing it needs is `aria-pressed`, because
 *     these are not four actions — they are one choice with two positions.
 *   - **Choosing applies immediately and the panel stays open.** The world is
 *     live behind every menu in this game, so picking a rider swaps the rider
 *     *on the wheel*, two metres behind the card. Closing on select would hide
 *     the only thing worth showing; making the player confirm would ask them to
 *     agree to something they can already see.
 *   - **The way back is on this panel**, which is the same argument the
 *     fresh-route panel makes about the hand-built city: this is where a rider
 *     is chosen, and putting half that choice on the title would be two screens
 *     answering one question.
 *   - **Nothing here mentions stats, speed, or difficulty**, because there are
 *     none. Both riders are the same ride, deliberately and by construction
 *     (`data/riders.ts`), and a card that hinted otherwise would be a promise
 *     the simulation cannot keep.
 */
function ridersTemplate(): string {
  const cards = CHARACTERS.map((character) => {
    const card = RIDER_CARDS[character.id];
    return `
      <button type="button" class="euc-rider-card" data-menu="pick-rider"
              data-rider="${character.id}" aria-pressed="false"
              style="--rider-swatch: ${character.swatch}">
        ${card.portrait}
        <span class="euc-rider-card__name">${character.name}</span>
        <span class="euc-rider-card__blurb">${card.blurb}</span>
        <span class="euc-rider-card__state" aria-hidden="true">Riding now</span>
      </button>`;
  }).join('');

  return `
<div class="euc-menu__panel euc-riders" role="dialog" aria-modal="true"
     aria-labelledby="euc-riders-heading">
  <h2 class="euc-menu__title euc-riders__heading" id="euc-riders-heading">Choose your rider</h2>
  <p class="euc-menu__tagline">
    Looks only — every rider rides exactly the same, and your best times carry across.
    Swap whenever you like; the game remembers.
  </p>

  <fieldset class="euc-riders__grid">
    <legend class="euc-riders__legend">Rider</legend>
    ${cards}
  </fieldset>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="riders-back">Done</button>
  </div>
</div>
`;
}

/**
 * The fresh-route panel — M12 Phase 4, reworked for a casual player at M14.5.
 *
 * **The shape is the owner's and only the wording is mine.** He settled it on
 * 2026-08-08: the hand-authored slice stays the default world, and generated
 * routes are *"a clearly labelled second entry — a 'fresh route' offering with
 * its seed visible, plus a way to enter a seed — rather than a replacement for
 * free ride."* So this is a fourth title-screen button and not a mode switch,
 * nothing here is reachable without asking for it, and a new player never
 * lands in a generated route by accident. All of that is unchanged.
 *
 * **What changed at M14.5, and why.** The owner's report was that players did
 * not realise they could play anything but the city — that "seed" and
 * "surprise me" are read instantly by anyone who grew up on roguelikes and
 * mean nothing to everybody else. Four things were wrong, and none of them was
 * the shape:
 *
 *   - **The first control was a demand.** An empty box labelled `Seed` was the
 *     first focusable thing on the panel, so the first thing a new player met
 *     was a field asking for a word they had no way to invent. It is now a
 *     `<fieldset>` further down, opened by a legend that asks a question
 *     instead — *Got a route name?* — which is a control you can decline.
 *   - **The one control anybody could use was the smallest.** `Surprise me`
 *     sat in the third column beside the field while `Ride this route`, which
 *     does nothing until the field has content, carried the primary style.
 *     They have swapped: Surprise me is first, full width, and says what it
 *     does underneath its own name — the phrase is kept because it is the one
 *     the game has always used and it still reads correctly to somebody who
 *     already knew.
 *   - **Nothing said what a route *was*.** The tagline explained the property
 *     ("the same seed always builds the same one") before ever saying that the
 *     game builds you a whole new place to ride. It now says the second thing
 *     first.
 *   - **The panel had one emphasis for its whole life.** It has two states now
 *     — before a route is built and after — carried on `data-stage`, so `Ride
 *     this route` becomes the primary action at the moment there is a route to
 *     ride. CSS decides what that looks like; this file only ever writes the
 *     value (`DESIGN.md` §9).
 *
 * **The soft keyboard argument that put the field first still holds, and is
 * answered differently.** A phone keyboard eats the bottom half of the screen,
 * so the field and the line that judges it must both be visible while typing.
 * The status line now sits *above* the field rather than below it, and the
 * field carries `aria-describedby` to both it and its own hint — so the two
 * things a player needs are on the half of the screen the keyboard leaves.
 *
 * Four earlier decisions are unchanged and must stay:
 *
 *   - **"Surprise me" exists because a gamepad cannot type.** It is also the
 *     one affordance the owner's q6 answer explicitly permits to skip failing
 *     seeds internally — *"choosing a different seed is not the repair master
 *     §6.4 forbids"* — so the pad's path to a route is never a dead end. It is
 *     now also the panel's first focusable control, which is strictly better
 *     parity than the field it replaced there.
 *   - **The panel is in two halves, and the split is the route you are
 *     *choosing* against the route you are *on*.** They are different routes
 *     for as long as it takes to type a name, and a refused one leaves them
 *     different indefinitely — so "copy a link to it" had to stop saying "it".
 *   - **The status line is `role="status"`**, so a rejection is announced
 *     rather than merely printed, and it reserves its height while empty.
 *   - **The words on this screen belong to this screen.** Every sentence is
 *     composed here from a tagged status and a two-field world record. A caller
 *     that could compose the refusal message is a caller that could compose it
 *     wrongly, and that message is the one the owner specified.
 */
function routesTemplate(seedMaxLength: number): string {
  return `
<div class="euc-menu__panel euc-routes" role="dialog" aria-modal="true"
     aria-labelledby="euc-routes-heading">
  <h2 class="euc-menu__title euc-routes__heading" id="euc-routes-heading">Fresh route</h2>
  <p class="euc-menu__tagline">
    The game can procedurally generate a whole new place to ride — its own
    roads, kerbs, jumps and shortcuts. Every route has a name, and the same name always
    builds the same route, so one worth riding is one worth sending to a friend.
  </p>

  <div class="euc-routes__actions" data-menu="route-stage" data-stage="pick"
       data-purpose="ride">
    <button type="button" class="euc-button euc-routes__pick" data-menu="surprise">
      <span class="euc-button__label">Surprise me</span>
      <span class="euc-button__note">Procedurally generate a brand-new route, no typing</span>
    </button>

    <p class="euc-routes__status" id="euc-routes-status" data-menu="route-status"
       role="status" data-tone="idle"></p>

    <div class="euc-menu__actions">
      <button type="button" class="euc-button" data-menu="ride-route">Ride this route</button>
      <button type="button" class="euc-button" data-menu="trial-route">Time trial on it</button>
    </div>
  </div>

  <fieldset class="euc-routes__entry">
    <legend class="euc-routes__legend">Got a route name?</legend>
    <label class="euc-field__label" for="euc-seed">Route name</label>
    <input id="euc-seed" class="euc-seed" type="text" data-menu="seed"
           maxlength="${seedMaxLength}"
           autocomplete="off" autocapitalize="none" autocorrect="off"
           spellcheck="false" enterkeyhint="go"
           aria-describedby="euc-routes-status euc-routes-hint"
           placeholder="ember-quay" />
    <p class="euc-field__note" id="euc-routes-hint">
      Type one a friend sent you, or invent one — most words make a route.
      Old hands call it the seed.
    </p>
  </fieldset>

  <div class="euc-routes__loaded">
    <p class="euc-world" data-menu="world"></p>
    <div class="euc-menu__actions">
      <button type="button" class="euc-button" data-menu="copy-link" hidden>
        Copy a link to the route above
      </button>
      <button type="button" class="euc-button euc-button--quiet" data-menu="ride-city" hidden>
        Go back to the hand-built city
      </button>
    </div>
  </div>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--quiet" data-menu="routes-back">Back</button>
  </div>
</div>
`;
}

/**
 * The results screen.
 *
 * **A real dialog, exactly like the other three**, and for the reason stated at
 * the top of this file: the role is a description of behaviour that already
 * exists. It gets `role="dialog"`, `aria-modal`, a heading it is labelled by, a
 * focus trap on Tab, focus restored on close, and two native `<button>`s — so
 * the gamepad's `navigate()` walks it with no special case, because there is
 * nothing here that is not already in the panel's own Tab order.
 *
 * The splits are a real `<table>` with a `<caption>` and column headers rather
 * than a grid of `<div>`s. It is tabular data — three columns, one row per
 * checkpoint — and a screen reader reading "Curb run, 0:24.31, minus 1.24"
 * with the column names attached is the entire difference between a results
 * screen and a wall of numbers.
 *
 * Retry is the primary action and is first in the Tab order, because the reason
 * anyone reads a results screen is to decide whether to go again.
 */
const RESULTS_TEMPLATE = `
<div class="euc-menu__panel euc-results" role="dialog" aria-modal="true"
     aria-labelledby="euc-results-heading" data-menu="results-panel" data-record="false">
  <h2 class="euc-menu__title euc-results__heading" id="euc-results-heading"
      data-menu="results-heading">Run complete</h2>

  <div class="euc-results__summary">
    <div class="euc-results__stat">
      <span class="euc-results__caption">This run</span>
      <span class="euc-results__total" data-menu="results-total">0:00.00</span>
    </div>
    <div class="euc-results__stat">
      <span class="euc-results__caption">Best</span>
      <span class="euc-results__best" data-menu="results-best">—</span>
      <span class="euc-results__delta" data-menu="results-delta" data-ahead="false"></span>
    </div>
  </div>

  <table class="euc-results__table">
    <caption class="euc-results__caption">Splits</caption>
    <thead>
      <tr>
        <th scope="col">Checkpoint</th>
        <th scope="col">Time</th>
        <th scope="col">vs best</th>
      </tr>
    </thead>
    <tbody data-menu="results-rows"></tbody>
  </table>

  <ul class="euc-results__notes" data-menu="results-notes" hidden></ul>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="retry">Ride it again</button>
    <button type="button" class="euc-button" data-menu="results-title">Back to title</button>
  </div>
</div>
`;

const PAUSE_TEMPLATE = `
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-pause-heading">
  <h2 class="euc-menu__title" id="euc-pause-heading">Paused</h2>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="resume">Resume</button>
    <button type="button" class="euc-button" data-menu="settings">Settings</button>
    <button type="button" class="euc-button euc-button--quiet" data-menu="quit">Quit to title</button>
  </div>
  <p class="euc-world" data-menu="world"></p>
  <p class="euc-controls-note">Escape resumes.</p>
</div>
`;

export class Menus {
  private readonly callbacks: MenuCallbacks;
  private readonly parent: HTMLElement;

  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly settings: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly routes: HTMLDivElement;
  private readonly riders: HTMLDivElement;
  /** The seed field, held because it is read as well as written. */
  private readonly seedField: HTMLInputElement | null;

  private screen: MenuScreen = 'none';
  /** What had focus before a menu opened, so it can be given back. */
  private returnFocus: HTMLElement | null = null;

  /** The binding row currently capturing a key, or null. */
  private listening: BindableAction | null = null;

  private options: GameOptions;

  constructor(initial: GameOptions, config: MenuOptions) {
    this.callbacks = config.callbacks;
    this.parent = config.parent ?? document.body;
    this.options = initial;

    this.title = this.mount('euc-menu--title', TITLE_TEMPLATE);
    this.pause = this.mount('euc-menu--pause', PAUSE_TEMPLATE);
    this.settings = this.mount('euc-menu--settings', this.settingsTemplate());
    this.results = this.mount('euc-menu--results', RESULTS_TEMPLATE);
    this.routes = this.mount('euc-menu--routes', routesTemplate(config.seedMaxLength));
    this.riders = this.mount('euc-menu--riders', ridersTemplate());
    this.seedField = this.routes.querySelector<HTMLInputElement>('[data-menu="seed"]');

    this.parent.addEventListener('click', this.onClick);
    // `input` rather than `change`, so a slider reports while it is being
    // dragged: the whole point of a volume control is that the player hears
    // the result before letting go.
    this.settings.addEventListener('input', this.onInput);
    // **Scoped to the field, not to the window**, unlike everything else this
    // file listens for. Enter inside a text box means "I have finished typing
    // this", which is a fact about the box; a window-level handler would have
    // to work out which control the player was in, and would then be a second
    // opinion about focus alongside the browser's own.
    //
    // It also matters most on the device that has no other way to say it: a
    // phone's soft keyboard shows a "go" key (`enterkeyhint`) and dismisses
    // itself when it is pressed, and without this that key would do nothing at
    // all while the player watched the keyboard slide away.
    this.seedField?.addEventListener('keydown', this.onSeedKeyDown);
    // Capture, so a listening rebind row sees the key before anything else can
    // act on it — including the browser's own focus handling for Tab.
    window.addEventListener('keydown', this.onKeyDown, true);

    this.sync(initial);
  }

  get current(): MenuScreen {
    return this.screen;
  }

  /**
   * Show a screen, or `none`.
   *
   * Focus moves to the panel's first control on open and back to wherever it
   * came from on close. Both halves matter: without the first a keyboard user
   * has to Tab in from the document, and without the second they are returned
   * to the top of the page every time.
   */
  show(screen: MenuScreen): void {
    if (screen === this.screen) return;

    const opening = this.screen === 'none' && screen !== 'none';
    if (opening) {
      const active = document.activeElement;
      this.returnFocus = active instanceof HTMLElement ? active : null;
    }

    this.stopListening();
    this.title.hidden = screen !== 'title';
    this.pause.hidden = screen !== 'pause';
    this.settings.hidden = screen !== 'settings';
    this.results.hidden = screen !== 'results';
    this.routes.hidden = screen !== 'routes';
    this.riders.hidden = screen !== 'riders';
    this.screen = screen;

    if (screen === 'none') {
      this.returnFocus?.focus();
      this.returnFocus = null;
      return;
    }

    this.focusFirst(this.panelFor(screen));
  }

  /** Push a new options record into the controls. Called on every change. */
  sync(options: GameOptions): void {
    this.options = options;

    this.setRider(options.character);

    this.setValue('fieldOfViewTrim', options.fieldOfViewTrim);
    this.setText('fieldOfViewTrim-value', `${options.fieldOfViewTrim > 0 ? '+' : ''}${options.fieldOfViewTrim}°`);
    this.setSelect('quality', options.quality);
    this.setSelect('speedUnit', options.speedUnit);

    this.setValue('volumeMaster', Math.round(options.volumeMaster * 100));
    this.setText('volumeMaster-value', `${Math.round(options.volumeMaster * 100)}%`);
    this.setValue('volumeSfx', Math.round(options.volumeSfx * 100));
    this.setText('volumeSfx-value', `${Math.round(options.volumeSfx * 100)}%`);
    this.setValue('volumeUi', Math.round(options.volumeUi * 100));
    this.setText('volumeUi-value', `${Math.round(options.volumeUi * 100)}%`);
    this.setChecked('muted', options.muted);

    this.setChecked('gamepadEnabled', options.gamepadEnabled);
    this.setValue('gamepadDeadZone', Math.round(options.gamepadDeadZone * 100));
    this.setText('gamepadDeadZone-value', `${Math.round(options.gamepadDeadZone * 100)}%`);

    this.setSelect('touchControls', options.touchControls);
    this.setChecked('touchSwapSides', options.touchSwapSides);
    this.setValue('touchScale', Math.round(options.touchScale * 100));
    this.setText('touchScale-value', `${Math.round(options.touchScale * 100)}%`);

    this.renderBindings();
  }

  /**
   * Say who is on the wheel, on the title chip and on the chooser.
   *
   * Two surfaces and one source, for the same reason `setWorld` writes the
   * world line on three panels: the answer to "who am I riding as" has to be
   * the same wherever it is asked, and the only way to guarantee that is for
   * one method to write all of them.
   *
   * `aria-pressed` rather than a class is what carries the state to a screen
   * reader — the "Riding now" pill is decorative and marked so, because a card
   * that announces both its name and its own selected-ness reads twice.
   */
  private setRider(id: CharacterId): void {
    const character = CHARACTERS.find((entry) => entry.id === id) ?? CHARACTERS[0];

    const name = this.title.querySelector<HTMLElement>('[data-rider-name]');
    if (name && name.textContent !== character.name) name.textContent = character.name;
    const swatch = this.title.querySelector<HTMLElement>('[data-rider-swatch]');
    if (swatch) swatch.style.setProperty('--rider-swatch', character.swatch);

    for (const card of this.riders.querySelectorAll<HTMLElement>('[data-rider]')) {
      const active = card.dataset.rider === character.id;
      const pressed = active ? 'true' : 'false';
      if (card.getAttribute('aria-pressed') !== pressed) card.setAttribute('aria-pressed', pressed);
    }
  }

  /**
   * Tell the player their settings will not survive a reload.
   *
   * Shown only when it is true. A player in a private window who is never told
   * simply learns that this game forgets their settings, which is a bug report
   * nobody can act on.
   */
  setPersistenceWarning(persistent: boolean): void {
    const node = this.settings.querySelector<HTMLElement>('[data-menu="persistence"]');
    if (node) node.hidden = persistent;
  }

  /**
   * Fill the results screen. Called once, just before it is shown.
   *
   * Everything arrives pre-formatted (see `ResultsView`), so this method is
   * only DOM writing. The two rebuilt regions — the split rows and the notes —
   * are cleared and re-created rather than diffed, which would be the wrong
   * trade in the HUD and is the right one here: this runs once per finished
   * run, and a diffing table is a great deal of code to avoid building six
   * rows.
   */
  setResults(view: ResultsView): void {
    const panel = this.results.querySelector<HTMLElement>('[data-menu="results-panel"]');
    if (panel) panel.dataset.record = view.isRecord ? 'true' : 'false';

    this.setResultsText('results-heading', view.heading);
    this.setResultsText('results-total', view.total);
    this.setResultsText('results-best', view.best);
    this.setResultsText('results-delta', view.deltaToBest);

    const delta = this.results.querySelector<HTMLElement>('[data-menu="results-delta"]');
    if (delta) delta.dataset.ahead = view.ahead ? 'true' : 'false';

    const body = this.results.querySelector<HTMLElement>('[data-menu="results-rows"]');
    if (body) {
      body.textContent = '';
      for (const row of view.rows) {
        const tr = document.createElement('tr');

        // The checkpoint's name is the row's header, not a cell. That is what
        // lets a screen reader announce "Curb run" ahead of each value in the
        // row instead of reading three unlabelled numbers.
        const label = document.createElement('th');
        label.scope = 'row';
        label.className = 'euc-results__row-label';
        label.textContent = row.label;
        tr.appendChild(label);

        const time = document.createElement('td');
        time.className = 'euc-results__row-time';
        time.textContent = row.time;
        tr.appendChild(time);

        const rowDelta = document.createElement('td');
        rowDelta.className = 'euc-results__row-delta';
        rowDelta.dataset.ahead = row.ahead ? 'true' : 'false';
        rowDelta.textContent = row.delta;
        tr.appendChild(rowDelta);

        body.appendChild(tr);
      }
    }

    const notes = this.results.querySelector<HTMLElement>('[data-menu="results-notes"]');
    if (notes) {
      notes.textContent = '';
      for (const note of view.notes) {
        const item = document.createElement('li');
        item.textContent = note;
        notes.appendChild(item);
      }
      // An empty `<ul>` still occupies its own margins, so the panel would gain
      // a gap for a list that is not there.
      notes.hidden = view.notes.length === 0;
    }
  }

  /**
   * Offer the time trial, or do not.
   *
   * A level with no authored route cannot be timed — the proving ground is a
   * measuring instrument rather than a place and carries no checkpoints — and
   * `ChallengeRun.available` has always answered the question. Nothing asked
   * it, so the button sat on the title screen doing precisely nothing when
   * clicked: no state change, no message, no focus movement. A control that
   * silently ignores the player is worse than one that is not there.
   */
  setChallengeAvailable(available: boolean): void {
    // Two buttons offer the same mode from two screens, and from M12 Phase 4
    // the answer can change while the game is running — a world swap is a new
    // plan, and whether a plan carries a route is a property of the plan.
    const title = this.title.querySelector<HTMLElement>('[data-menu="challenge"]');
    if (title) title.hidden = !available;
    const routes = this.routes.querySelector<HTMLElement>('[data-menu="trial-route"]');
    if (routes) routes.hidden = !available;
  }

  // -- Fresh routes (M12 Phase 4) ---------------------------------------------

  /** Whatever is in the seed field right now, unnormalised. */
  get seed(): string {
    return this.seedField?.value ?? '';
  }

  /**
   * Put a seed in the field.
   *
   * Guarded like every other write in this file, and here the guard is what
   * stops the caret jumping to the end of the field while somebody is editing
   * the middle of a seed — assigning `value` moves the selection even when the
   * string is unchanged.
   */
  setSeed(seed: string): void {
    if (this.seedField && this.seedField.value !== seed) this.seedField.value = seed;
  }

  /**
   * Keep the mode that sent the player here visible in the controls.
   *
   * Knockabout may need Fresh route as a prerequisite, but that detour is not
   * a change of mind. Its primary route action therefore names Knockabout and
   * the unrelated Time trial choice leaves the focus order until the player
   * returns to the ordinary Fresh-route entrance.
   */
  setRoutePurpose(purpose: RoutePurpose): void {
    const stage = this.routes.querySelector<HTMLElement>('[data-menu="route-stage"]');
    if (stage) stage.dataset.purpose = purpose;

    const ride = this.routes.querySelector<HTMLButtonElement>('[data-menu="ride-route"]');
    if (ride) {
      ride.textContent = purpose === 'knockabout'
        ? 'Play Knockabout on this route'
        : purpose === 'chase'
          ? 'Start the chase on this route'
          : 'Ride this route';
    }

    const note = this.routes.querySelector<HTMLElement>('[data-menu="surprise"] .euc-button__note');
    if (note) {
      note.textContent = purpose === 'knockabout'
        ? 'Generate a brand-new route and start Knockabout, no typing'
        : purpose === 'chase'
          ? 'Generate a brand-new route and start the chase, no typing'
          : 'Procedurally generate a brand-new route, no typing';
    }
  }

  /**
   * Say which world is loaded, on every screen that should say it.
   *
   * Three panels carry the line and they carry the same one: the title, where
   * it says what Start ride will ride; the pause card, which is where a player
   * mid-route goes to find out what they are on; and the fresh-route panel
   * itself. The seed is the point of all three — `docs/PLANS.md` §13 q5 asks
   * for generated routes to be *seed-forward*, and a route whose seed the
   * player can only recover by remembering what they typed is not.
   *
   * The riding HUD deliberately does not carry it. A seed is something a player
   * needs when they are choosing, sharing, or comparing a time — never at
   * 15 m/s with a kerb coming.
   */
  setWorld(view: WorldView): void {
    const line = view.generated
      ? `Fresh route · ${view.seed}`
      : 'The hand-built city — the route everything else is measured against.';
    for (const panel of [this.title, this.pause, this.routes]) {
      const node = panel.querySelector<HTMLElement>('[data-menu="world"]');
      if (node && node.textContent !== line) node.textContent = line;
      if (node) node.dataset.generated = view.generated ? 'true' : 'false';
    }

    // Both of these are answers to "what else can I do from here", and both are
    // wrong when the world already is what they offer.
    const city = this.routes.querySelector<HTMLElement>('[data-menu="ride-city"]');
    if (city) city.hidden = !view.generated;
    const copy = this.routes.querySelector<HTMLElement>('[data-menu="copy-link"]');
    if (copy) copy.hidden = !view.generated;
  }

  /**
   * The fresh-route panel's one line about the seed in the field.
   *
   * `building` is the reason this is a state rather than a message written once
   * on failure. Generating a route is up to a second and a half of blocked main
   * thread on the seeds that need every attempt — which is exactly the seeds
   * that are about to be refused — so without this the player presses a button,
   * the game stops dead, and then tells them no. Saying so first costs one
   * frame (`app/Game.ts` defers the work by one) and turns a freeze into a wait.
   */
  setRouteStatus(status: RouteStatus): void {
    const node = this.routes.querySelector<HTMLElement>('[data-menu="route-status"]');
    if (!node) return;

    const [tone, message] = routeStatusLine(status);
    if (node.textContent !== message) node.textContent = message;
    node.dataset.tone = tone;

    // The panel's emphasis moves with the state: before a route exists the one
    // useful control is the one that makes one, and the instant one exists the
    // useful control is the one that rides it. Written as a value and styled in
    // `game.css`; this file never decides what "primary" looks like.
    const stage = this.routes.querySelector<HTMLElement>('[data-menu="route-stage"]');
    if (stage) stage.dataset.stage = status.kind === 'ready' ? 'ready' : 'pick';
  }

  /**
   * The controls section's one line about the pad.
   *
   * Three states rather than a boolean, because "no pad" and "pad switched
   * off" call for different advice — telling a player who unticked the box to
   * press a button to wake the pad would be advice the game ignores. Written
   * at construction and on every change (M10 QA, F4): the paragraph used to be
   * filled only by a connection *transition*, so a player who opened Settings
   * with no pad ever attached read an empty line.
   */
  setGamepadStatus(status: 'connected' | 'searching' | 'disabled'): void {
    const node = this.settings.querySelector<HTMLElement>('[data-menu="gamepad-status"]');
    if (node) {
      node.textContent = status === 'connected'
        ? 'Gamepad connected. The keyboard keeps working at the same time.'
        : status === 'disabled'
          ? 'Gamepad input is switched off. Tick the box to use a pad.'
          : 'No gamepad detected. Connect one and press a button to wake it.';
    }
  }

  /**
   * The touch section's one line, written the same way the pad's is: from the
   * current state rather than from the last transition.
   *
   * Four states rather than three, because "Automatic, and they are on screen"
   * and "Automatic, and they are not" are the two a player is actually trying
   * to tell apart when they open this screen — usually on a laptop that has a
   * touchscreen the game has not seen used yet.
   */
  setTouchStatus(status: TouchStatus): void {
    const node = this.settings.querySelector<HTMLElement>('[data-menu="touch-status"]');
    if (!node) return;
    node.textContent = status === 'shown'
      ? 'On-screen controls are showing. A keyboard or pad keeps working alongside them.'
      : status === 'forced'
        ? 'On-screen controls are always shown, on every device.'
        : status === 'disabled'
          ? 'On-screen controls are switched off. This device needs a keyboard or a pad.'
          : 'Automatic: the controls appear on a touchscreen, or the first time you '
            + 'touch this screen.';
  }

  dispose(): void {
    this.parent.removeEventListener('click', this.onClick);
    this.settings.removeEventListener('input', this.onInput);
    this.seedField?.removeEventListener('keydown', this.onSeedKeyDown);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.title.remove();
    this.pause.remove();
    this.settings.remove();
    this.results.remove();
    this.routes.remove();
    this.riders.remove();
  }

  // -------------------------------------------------------------------------

  private mount(modifier: string, html: string): HTMLDivElement {
    const root = document.createElement('div');
    root.className = `euc-menu euc-ui ${modifier}`;
    root.hidden = true;
    root.innerHTML = html;
    this.parent.appendChild(root);
    return root;
  }

  private panelFor(screen: MenuScreen): HTMLElement | null {
    if (screen === 'title') return this.title;
    if (screen === 'pause') return this.pause;
    if (screen === 'settings') return this.settings;
    if (screen === 'results') return this.results;
    if (screen === 'routes') return this.routes;
    if (screen === 'riders') return this.riders;
    return null;
  }

  private focusFirst(panel: HTMLElement | null): void {
    panel?.querySelector<HTMLElement>(focusableSelector())?.focus();
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    // **`Element`, not `HTMLElement`, and that is not pedantry.** The rider
    // cards carry an inline SVG portrait that covers most of their area, and an
    // `SVGElement` is not an `HTMLElement` — so the narrower guard returned
    // early on every click that landed on a picture, and the card silently did
    // nothing. `closest` is defined on `Element`, which is all this handler
    // needs from it.
    if (!(target instanceof Element)) return;

    const binding = target.closest<HTMLElement>('[data-binding-set]');
    if (binding) {
      this.startListening(binding.dataset.bindingSet as BindableAction);
      return;
    }

    const clear = target.closest<HTMLElement>('[data-binding-clear]');
    if (clear) {
      this.assign(clear.dataset.bindingClear as BindableAction, []);
      return;
    }

    // **The nearest `data-menu` ancestor, and the two attributes above are why
    // the chip's own label is not one.** A click lands on whatever element is
    // under the pointer — the `<strong>` inside a button, not the button — and
    // an unknown action here is a silent no-op by design. So a query hook that
    // lives *inside* a control must not be spelled `data-menu`, or the control
    // stops working with nothing to show for it. The routes panel's `world`,
    // `seed` and `route-status` hooks are safe because none of them is inside a
    // button; the rider chip's name and swatch are, and are not.
    const action = target.closest<HTMLElement>('[data-menu]')?.dataset.menu;
    if (action === undefined) return;

    if (action === 'start') this.callbacks.onStartRide();
    else if (action === 'challenge') this.callbacks.onStartChallenge();
    else if (action === 'knockabout') this.callbacks.onStartKnockabout();
    else if (action === 'chase') this.callbacks.onStartChase();
    else if (action === 'resume') this.callbacks.onResume();
    else if (action === 'settings') this.callbacks.onOpenSettings();
    else if (action === 'back') this.callbacks.onCloseSettings();
    else if (action === 'quit') this.callbacks.onQuitToTitle();
    else if (action === 'reset') this.callbacks.onResetOptions();
    else if (action === 'retry') this.callbacks.onRetryChallenge();
    else if (action === 'results-title') this.callbacks.onResultsToTitle();
    // -- M12 Phase 4 ---------------------------------------------------------
    else if (action === 'routes') this.callbacks.onOpenRoutes();
    else if (action === 'routes-back') this.callbacks.onCloseRoutes();
    else if (action === 'ride-route') this.callbacks.onRideRoute(this.seed);
    else if (action === 'trial-route') this.callbacks.onTimeTrialRoute(this.seed);
    else if (action === 'surprise') this.callbacks.onSurpriseSeed();
    else if (action === 'ride-city') this.callbacks.onRideTheCity();
    else if (action === 'copy-link') this.callbacks.onCopyLink();
    // -- M14.5 ---------------------------------------------------------------
    else if (action === 'riders') this.callbacks.onOpenRiders();
    else if (action === 'riders-back') this.callbacks.onCloseRiders();
    else if (action === 'pick-rider') {
      const id = target.closest<HTMLElement>('[data-rider]')?.dataset.rider;
      // Guarded rather than cast, because M18 put a rider in `CharacterId` that
      // nobody may choose. A `data-rider` attribute is a string off the DOM, so
      // a straight cast would make "the cop is not on the chooser" a fact about
      // the markup rather than about the code.
      if (id !== undefined && isPlayableCharacter(id as CharacterId)) {
        this.callbacks.onPickRider(id as PlayableCharacterId);
      }
    }
  };

  /**
   * Enter in the seed field means "ride this one".
   *
   * The same operation the primary button performs, because the field and that
   * button are one control in every way except the DOM: a player who has just
   * typed a seed is telling the game to use it, and asking them to reach for a
   * second target to say so is the difference between a search box and a form.
   */
  private readonly onSeedKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.callbacks.onRideRoute(this.seed);
  };

  /**
   * A control moved.
   *
   * Percent sliders carry integers because a range input's value is a string
   * and "0.35" invites float drift on every round trip; the division happens
   * once, here, at the boundary. Everything else is reported verbatim and the
   * options store does the clamping — this file is not the place where a valid
   * value is decided.
   */
  private readonly onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const option = target.dataset.option;
    if (option === undefined) return;

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      this.callbacks.onChange({ [option]: target.checked } as Partial<GameOptions>);
      return;
    }

    if (option === 'quality' || option === 'speedUnit' || option === 'touchControls') {
      this.callbacks.onChange({ [option]: target.value } as Partial<GameOptions>);
      return;
    }

    const numeric = Number(target.value);
    const percent = option === 'gamepadDeadZone'
      || option === 'touchScale'
      || option.startsWith('volume');
    this.callbacks.onChange({
      [option]: percent ? numeric / 100 : numeric,
    } as Partial<GameOptions>);
  };

  /**
   * The menu layer's own keyboard behaviour.
   *
   * Three jobs, in strict order, and the order is the whole of the logic:
   * capturing a rebind outranks everything; then Escape, which means "leave
   * this screen" wherever you are; then the focus trap.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.listening !== null) {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') this.stopListening();
      else if (!RESERVED_CODES.has(event.code)) this.assign(this.listening, [event.code]);
      else this.stopListening();
      return;
    }

    if (this.screen === 'none') return;

    if (event.code === 'Escape') {
      // The title screen has nowhere to go back to, so Escape does nothing
      // there rather than dropping the player into a ride they did not ask
      // for. Pause and settings both leave.
      //
      // **Results is deliberately in the same group as the title**, and this
      // is a correctness argument rather than a taste one: it is not an
      // overlay on top of something the player wants back. The run is over,
      // and the two buttons are the only two things that can happen next.
      // Dismissing the dialog would leave the game showing no UI at all in a
      // state that has no ride to return to.
      // **The fresh-route panel leaves on Escape even while the seed field has
      // focus**, and that is deliberate rather than overlooked. A text box
      // conventionally eats Escape to revert itself, but this game has taught
      // the player one meaning for the key across four screens, and a field
      // that is the only control on a panel is not worth a fifth. The seed is
      // one keystroke from being retyped; the way out of a screen should not
      // depend on where the caret is.
      if (this.screen === 'settings') this.callbacks.onCloseSettings();
      else if (this.screen === 'pause') this.callbacks.onResume();
      else if (this.screen === 'routes') this.callbacks.onCloseRoutes();
      // Same rule as the fresh-route panel: one meaning for Escape across every
      // screen that has somewhere to go back to.
      else if (this.screen === 'riders') this.callbacks.onCloseRiders();
      else return;

      // **The event has to die here, and this is not defensive coding.**
      //
      // Escape has two owners — this handler while a menu is up, and the
      // pause action while one is not — and they see the same event. This
      // listener is on the capture phase, so without stopping propagation the
      // resume happens first and *then* `input/keyboard.ts` latches a pause
      // from the very same keypress, which the next step consumes: the game
      // resumes and re-pauses within one frame, and Escape can never resume a
      // ride at all. Only the Resume button would have worked, and the pause
      // menu would have looked merely stubborn rather than broken.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.code !== 'Tab') return;
    this.trapFocus(event);
  };

  /**
   * Keep Tab inside the open panel.
   *
   * Without this, Tab walks out of the dialog and into the page behind it —
   * which here is a canvas and a debug overlay — and the player has no way to
   * tell where focus went, because the thing that has it is not visible.
   */
  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panelFor(this.screen);
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector())]
      .filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Move or adjust the real focused control from a gamepad menu direction.
   *
   * The Gamepad API does not synthesize keyboard events, so the browser cannot
   * move DOM focus on the pad's behalf. Up/down follow the panel's actual Tab
   * order; left/right adjust native controls and otherwise follow that order.
   */
  navigate(action: 'up' | 'down' | 'left' | 'right'): void {
    const panel = this.panelFor(this.screen);
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector())]
      .filter((node) => node.offsetParent !== null);
    if (focusable.length === 0) return;

    const active = document.activeElement;
    if ((action === 'left' || action === 'right') && active instanceof HTMLElement) {
      if (this.adjustControl(active, action === 'right' ? 1 : -1)) return;
    }

    const current = focusable.indexOf(active as HTMLElement);
    const delta = action === 'up' || action === 'left' ? -1 : 1;
    const next = current < 0
      ? (delta > 0 ? 0 : focusable.length - 1)
      : (current + delta + focusable.length) % focusable.length;
    focusable[next].focus();
    focusable[next].scrollIntoView({ block: 'nearest' });
  }

  /**
   * A gamepad's confirm, acting on whatever the panel has focused.
   *
   * **Moved out of `app/Game.ts` at M12 Phase 4**, where it was one line —
   * click whatever has focus — and where that line stopped being enough. The
   * seed field is the first control in this game a pad cannot operate: it takes
   * focus when the fresh-route panel opens, and clicking a text box does
   * nothing at all, so A appeared to be broken on the very first control a pad
   * player met.
   *
   * Confirm on the field now means what Enter means, which is the only reading
   * that leaves a pad a complete path: press A on an empty field and the panel
   * says a seed is needed and names the button that supplies one; press A on a
   * filled field and it rides.
   *
   * It lives here rather than in the composition root because "what does
   * confirm mean on this control" is a fact about the panel, and `Game` should
   * not be the second file that knows what the seed field is.
   */
  confirm(): void {
    const focused = document.activeElement;
    if (this.seedField !== null && focused === this.seedField) {
      this.callbacks.onRideRoute(this.seed);
      return;
    }
    if (focused instanceof HTMLElement) focused.click();
  }

  private adjustControl(control: HTMLElement, delta: -1 | 1): boolean {
    if (control instanceof HTMLInputElement && control.type === 'range') {
      if (delta > 0) control.stepUp();
      else control.stepDown();
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = delta > 0;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (control instanceof HTMLSelectElement) {
      const next = Math.max(0, Math.min(control.options.length - 1, control.selectedIndex + delta));
      if (next !== control.selectedIndex) {
        control.selectedIndex = next;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  private startListening(action: BindableAction): void {
    this.stopListening();
    this.listening = action;
    const row = this.settings.querySelector<HTMLElement>(`[data-binding-row="${action}"]`);
    if (row) row.dataset.listening = 'true';
    const button = this.settings.querySelector<HTMLElement>(`[data-binding-set="${action}"]`);
    if (button) button.textContent = 'Press a key';
  }

  private stopListening(): void {
    if (this.listening === null) return;
    const action = this.listening;
    this.listening = null;
    const row = this.settings.querySelector<HTMLElement>(`[data-binding-row="${action}"]`);
    if (row) row.dataset.listening = 'false';
    const button = this.settings.querySelector<HTMLElement>(`[data-binding-set="${action}"]`);
    if (button) button.textContent = 'Change';
  }

  /**
   * Give a key to an action, taking it off whoever had it.
   *
   * Done here rather than left to `resolveBindings` because a player has to
   * *see* it happen: the row that lost the key updates in front of them, and
   * they are never left wondering why brake stopped working after they bound
   * S to something else.
   */
  private assign(action: BindableAction, codes: readonly string[]): void {
    const bindings: Record<string, readonly string[]> = { ...this.options.bindings };
    bindings[action] = codes;

    // **Only actions that actually lose a key are written.** Recording every
    // action's current keys here would look equivalent and is not: it freezes
    // today's defaults into the saved record, so a player who once rebound
    // hop would never receive a later change to any *other* default. An action
    // the player has not touched stays absent, and absent means "use the
    // defaults" (`input/bindings.ts`).
    for (const spec of BINDINGS) {
      if (spec.action === action) continue;
      const current = this.options.bindings[spec.action] ?? spec.defaults;
      const kept = current.filter((code) => !codes.includes(code));
      if (kept.length !== current.length) bindings[spec.action] = kept;
    }

    this.stopListening();
    this.callbacks.onChange({ bindings });
  }

  private renderBindings(): void {
    for (const spec of BINDINGS) {
      const keys = this.settings.querySelector<HTMLElement>(`[data-binding-keys="${spec.action}"]`);
      if (!keys) continue;
      const codes = this.options.bindings[spec.action] ?? spec.defaults;
      keys.textContent = '';
      if (codes.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'euc-key euc-key--empty';
        empty.textContent = 'Unbound';
        keys.appendChild(empty);
        continue;
      }
      for (const code of codes) {
        const key = document.createElement('span');
        key.className = 'euc-key';
        key.textContent = keyLabel(code);
        keys.appendChild(key);
      }
    }
  }

  // -- Small typed DOM writes ------------------------------------------------

  private input(name: string): HTMLInputElement | null {
    return this.settings.querySelector<HTMLInputElement>(`[data-option="${name}"]`);
  }

  private setValue(name: string, value: number): void {
    const node = this.input(name);
    if (node && node.value !== String(value)) node.value = String(value);
  }

  private setChecked(name: string, checked: boolean): void {
    const node = this.input(name);
    if (node && node.checked !== checked) node.checked = checked;
  }

  private setSelect(name: string, value: string): void {
    const node = this.settings.querySelector<HTMLSelectElement>(`[data-option="${name}"]`);
    if (node && node.value !== value) node.value = value;
  }

  private setText(name: string, text: string): void {
    const node = this.settings.querySelector<HTMLElement>(`[data-readout="${name}"]`);
    if (node && node.textContent !== text) node.textContent = text;
  }

  private setResultsText(name: string, text: string): void {
    const node = this.results.querySelector<HTMLElement>(`[data-menu="${name}"]`);
    if (node && node.textContent !== text) node.textContent = text;
  }

  private settingsTemplate(): string {
    const qualityOptions = QUALITY_LEVELS
      .map((level) => `<option value="${level}">${level[0].toUpperCase()}${level.slice(1)}</option>`)
      .join('');
    const unitOptions = SPEED_UNITS
      .map((unit) => `<option value="${unit}">${unit === 'kph' ? 'km/h' : 'mph'}</option>`)
      .join('');
    const touchOptions = TOUCH_CONTROL_MODES
      .map((mode) => `<option value="${mode}">${TOUCH_MODE_LABELS[mode]}</option>`)
      .join('');

    const bindingRows = BINDINGS.map((spec) => `
      <div class="euc-binding" data-binding-row="${spec.action}" data-listening="false">
        <span id="euc-bind-${spec.action}">${spec.label}</span>
        <span class="euc-binding__keys" data-binding-keys="${spec.action}"></span>
        <span>
          <button type="button" class="euc-button euc-binding__set"
                  data-binding-set="${spec.action}"
                  aria-describedby="euc-bind-${spec.action}">Change</button>
          <button type="button" class="euc-button euc-binding__set euc-button--quiet"
                  data-binding-clear="${spec.action}"
                  aria-label="Clear the keys bound to ${spec.label}">Clear</button>
        </span>
      </div>`).join('');

    return `
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-settings-heading">
  <h2 class="euc-menu__title" id="euc-settings-heading">Settings</h2>

  <div class="euc-settings">
    <p class="euc-settings__status" data-menu="persistence" hidden>
      This browser will not let the game save settings, so these changes last
      until you close the tab.
    </p>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Display</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-quality">Quality</label>
        <select id="euc-opt-quality" data-option="quality">${qualityOptions}</select>
        <span class="euc-field__value"></span>
        <p class="euc-field__note">
          Lower settings reduce resolution and shadow detail. The ride itself is
          identical at every setting.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-fov">Field of view</label>
        <input id="euc-opt-fov" type="range" min="${FOV_TRIM_MIN}" max="${FOV_TRIM_MAX}" step="1"
               data-option="fieldOfViewTrim" />
        <span class="euc-field__value" data-readout="fieldOfViewTrim-value">0°</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-units">Speed units</label>
        <select id="euc-opt-units" data-option="speedUnit">${unitOptions}</select>
        <span class="euc-field__value"></span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Audio</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-master">Master</label>
        <input id="euc-opt-master" type="range" min="0" max="100" step="5"
               data-option="volumeMaster" />
        <span class="euc-field__value" data-readout="volumeMaster-value">100%</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-sfx">Ride and effects</label>
        <input id="euc-opt-sfx" type="range" min="0" max="100" step="5" data-option="volumeSfx" />
        <span class="euc-field__value" data-readout="volumeSfx-value">100%</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-ui">Warnings</label>
        <input id="euc-opt-ui" type="range" min="0" max="100" step="5" data-option="volumeUi" />
        <span class="euc-field__value" data-readout="volumeUi-value">100%</span>
        <p class="euc-field__note">
          Kept separate from the ride so the wheel can still tell you it is
          about to give up with everything else turned down.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-muted">Mute everything</label>
        <input id="euc-opt-muted" type="checkbox" data-option="muted" />
        <span class="euc-field__value">M</span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Controls</legend>
      <div class="euc-bindings">${bindingRows}</div>
      <p class="euc-controls-note">
        Escape always pauses and cannot be reassigned. F3 and F4 open the
        developer overlays.
      </p>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-pad">Gamepad</label>
        <input id="euc-opt-pad" type="checkbox" data-option="gamepadEnabled" />
        <span class="euc-field__value"></span>
        <p class="euc-controls-note" data-menu="gamepad-status"></p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-deadzone">Stick dead zone</label>
        <input id="euc-opt-deadzone" type="range" min="0" max="50" step="1"
               data-option="gamepadDeadZone" />
        <span class="euc-field__value" data-readout="gamepadDeadZone-value">18%</span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Touch controls</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch">On-screen controls</label>
        <select id="euc-opt-touch" data-option="touchControls">${touchOptions}</select>
        <span class="euc-field__value"></span>
        <p class="euc-controls-note" data-menu="touch-status"></p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch-side">Left-handed layout</label>
        <input id="euc-opt-touch-side" type="checkbox" data-option="touchSwapSides" />
        <span class="euc-field__value"></span>
        <p class="euc-field__note">
          Puts the ride stick under your right thumb and CHARGE / HOP under your left.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch-size">Control size</label>
        <input id="euc-opt-touch-size" type="range" min="${Math.round(TOUCH_SCALE_MIN * 100)}"
               max="${Math.round(TOUCH_SCALE_MAX * 100)}" step="5" data-option="touchScale" />
        <span class="euc-field__value" data-readout="touchScale-value">100%</span>
        <p class="euc-field__note">
          Sizes the controls and both stick axes together, so a bigger stick
          is a gentler one rather than a twitchier one.
        </p>
      </div>
    </fieldset>

    <div class="euc-menu__actions">
      <button type="button" class="euc-button euc-button--primary" data-menu="back">Back</button>
      <button type="button" class="euc-button euc-button--quiet" data-menu="reset">
        Reset everything to defaults
      </button>
    </div>
  </div>
</div>
`;
  }
}

/**
 * The fresh-route status line's tone and words — M12 Phase 4.
 *
 * A free function so it can be read as a table. The refusal wording is the part
 * that matters and it is written to the owner's instruction: it says the seed
 * did not make a route and it asks for another. It does not apologise, does not
 * mention attempts or validators, and above all does not offer to ride
 * something else — the whole point of the decision is that the game never
 * quietly substitutes a world.
 */
function routeStatusLine(status: RouteStatus): [string, string] {
  if (status.kind === 'building') return ['busy', `Building ${status.seed}…`];
  if (status.kind === 'ready') return ['ready', `${status.seed} is built and ready to ride.`];
  // Device-neutral on purpose: a pad player who cannot type reaches this line
  // first, and "tap" would name the one thing they cannot do.
  if (status.kind === 'blank') return ['refused', 'Type a route name, or choose Surprise me.'];
  if (status.kind === 'no-route') {
    // **It names the fix.** The refusal still does not apologise, does not
    // mention attempts or validators, and above all does not offer to ride
    // something else — the game never quietly substitutes a world. Pointing at
    // the control that picks a *different* route is not that substitution; it
    // is the owner's own q6 answer, which says choosing another seed is not the
    // repair master §6.4 forbids. Without it a casual player reads "try another
    // seed" as "you typed it wrong".
    return [
      'refused',
      `${status.seed} doesn’t make a route. Try another name, or choose Surprise me.`,
    ];
  }
  if (status.kind === 'needs-targets') {
    return [
      'refused',
      'Knockabout needs a route with things to hit. Generate a fresh one below.',
    ];
  }
  if (status.kind === 'needs-route') {
    return [
      'refused',
      'The chase needs a generated route to run on. Generate a fresh one below.',
    ];
  }
  if (status.kind === 'copied') return ['ready', 'Link copied. Anyone who opens it rides this route.'];
  if (status.kind === 'copy-failed') {
    return ['refused', `This browser wouldn’t let the game copy it. The link is ${status.link}`];
  }
  return ['idle', ''];
}

function focusableSelector(): string {
  return 'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
    + '[href], [tabindex]:not([tabindex="-1"])';
}
