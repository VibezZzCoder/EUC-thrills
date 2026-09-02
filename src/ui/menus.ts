/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {
  CHARACTERS,
  isPlayableCharacter,
  type CharacterId,
  type PlayableCharacterId,
} from '../data/riders.ts';
import {
  BINDINGS,
  CLAIM_CODES,
  RESERVED_CODES,
  keyLabel,
  type BindableAction,
} from '../input/bindings.ts';
import {
  MV_LOGO_HEIGHT,
  MV_LOGO_PNG_BASE64,
  MV_LOGO_WIDTH,
} from '../data/mvLogoAsset.ts';
import {
  WIM_LOGO_HEIGHT,
  WIM_LOGO_PNG_BASE64,
  WIM_LOGO_WIDTH,
} from '../data/wimLogoAsset.ts';
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
import {
  COUCH_RIDES,
  COUCH_RIDE_LABELS,
  COUCH_SEATS,
  type CouchRide,
} from '../app/couch.ts';
import { rowNeighbour, rowStep, type ControlRect } from './menuRows.ts';

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
  | 'none' | 'title' | 'pause' | 'settings' | 'results' | 'routes' | 'riders' | 'couch';

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
  /**
   * The player chose Track Day — M23.
   *
   * Unlike `onStartChallenge`, this one is never refused for want of a world:
   * the mode brings its own circuit, so the button is always live and pressing
   * it is also how a player reaches BelVar at all.
   */
  onStartTrackDay(): void;
  /**
   * The player pitted, from the pause card — M23.
   *
   * **The only control in the game that ends a ride from a menu.** Every other
   * mode ends by crossing something or by running a clock out; a track day ends
   * when the rider decides they are done, and there is nowhere else for that
   * decision to live.
   */
  onEndSession(): void;
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

  // -- M20 --------------------------------------------------------------------
  /**
   * Generate a brand-new route and ride it in the mode already being played.
   *
   * Reachable from the pause menu and from the results card. **Which mode is
   * the caller's to decide**, exactly as `onStartChase` is: this screen knows a
   * player pressed a button, and `app/Game.ts` knows whether they were being
   * chased.
   */
  onNewRoute(): void;

  // -- M14.5 ------------------------------------------------------------------
  /** Open the rider chooser from the title. */
  onOpenRiders(): void;
  /** Leave the rider chooser for the title. */
  onCloseRiders(): void;
  /** Ride as this one from now on. Applies immediately; the panel stays open. */
  onPickRider(id: PlayableCharacterId): void;

  // -- M25 Phase 5 ------------------------------------------------------------
  /** Open the two-player join panel from the title. */
  onOpenCouch(): void;
  /** Leave the join panel for the title. The guest seats go with it. */
  onCloseCouch(): void;
  /** Both seats are held; ride. */
  onStartCouch(): void;
  /**
   * Step one seat's rider card along the roster.
   *
   * The seat is a number rather than "player" or "guest" because this screen
   * has no opinion about which card is the machine's owner — and because what
   * the cards *do* differs (seat 0's choice is saved, the guests' are not) in
   * `app/Game.ts`, which is where the options firewall lives.
   */
  onCycleCouchRider(seat: number, delta: 1 | -1): void;

  // -- M26 Phase 5 ------------------------------------------------------------
  /**
   * Choose what this couch session is for — q78.
   *
   * **Deliberately not `onChange`**, which is the door to `GameOptions`. A
   * separate callback for a different kind of state is the options firewall
   * drawn in the callback list: what a session is for is not a saved
   * preference, and a control routed through the options path would be saved,
   * would reach `simulation/` through the store, and would be a physical
   * quantity in the player's record — all three of which invariant 5 refuses.
   *
   * The ride crosses as a plain string and `Game` refuses one it does not offer
   * (`app/couch.ts`'s `isCouchRide`), because a stale value left in the markup
   * would otherwise reach the state machine as a mode nobody built.
   *
   * `onSetCouchContact` used to sit beside this one. It is gone with its
   * control — the owner's 2026-08-27 ride: *"i think now that the toggle for
   * the bump is completely unnecessary. remove it and keep it always on"*
   * (§26.3, q81 amended).
   */
  onSetCouchRide(ride: string): void;

  // -- M26 Phase 5's ride repairs (2026-08-27) --------------------------------
  /**
   * Change what a *running* couch session is for, from the pause menu.
   *
   * **A different callback from `onSetCouchRide`, because it is a different
   * verb.** That one writes a choice a panel will act on when Start is
   * pressed; this one is the press — two people mid-session decide they would
   * rather fight, and the alternative today is quitting to the title and
   * seating both devices again. The owner asked for exactly that: *"2P pause
   * menu should allow 2P mode to change to another 2p mode without having to
   * quit to main menu."*
   */
  onSwitchCouchRide(ride: string): void;
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
/**
 * What each hand-built world is called, in the title's own voice.
 *
 * The generated case is not here because it is not a name — it is a seed, and
 * `setWorld` composes it. The proving ground is a diagnostic nobody reaches
 * from a menu and gets a line anyway, because "reachable only by typing a URL"
 * is not the same as "may show the wrong world's description".
 */
const WORLD_LINES: Readonly<Record<WorldView['world'], string>> = Object.freeze({
  slice: 'The hand-built city — the route everything else is measured against.',
  track: 'BelVar Circuit — a kart-scale technical lap, built to be raced.',
  proving: 'The proving ground — a flat instrument, not a place.',
  generated: '',
});

export interface WorldView {
  /**
   * Which world is loaded, as `level/levels.ts` names it.
   *
   * **A name rather than the `generated` boolean it replaced** — M23. That flag
   * asked one question ("is this a seeded route") and three controls read it as
   * if it answered another ("is this not the city"), which was the same
   * statement while the game had exactly two hand-built worlds and stopped
   * being one the day BelVar arrived: the circuit wore the city's own sentence
   * on the title, the pause card and the route panel, and the panel's way back
   * to the city was hidden on the one world where it was the thing a player
   * most needed.
   */
  readonly world: 'slice' | 'proving' | 'generated' | 'track';
  /** The loaded route's seed. Empty on every world but a generated one. */
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

/**
 * What the rows underneath are, in words — M26 Phase 6's QA repair.
 *
 * **The card grew four more modes and kept Time Trial's vocabulary.** The
 * caption said "Splits" and the columns said "Checkpoint", "Time" and "vs
 * best" on every screen this game can end on, so a finished couch match
 * printed `Knockdowns (first to 5) | 5 – 2` under a heading claiming it was a
 * checkpoint time compared against a personal best — three words, none of them
 * true, and all three of them read aloud by a screen reader ahead of every
 * value in the table.
 *
 * This is `totalCaption`'s lesson arriving a second time and one row lower
 * down: **words that describe numbers travel with the numbers.** The two big
 * captions above the table learned it at M23 when a track day's headline
 * stopped being "this run"; the table itself was left behind because nothing
 * about a *timed* run was wrong with it, and four modes were added before
 * anybody read it in one of theirs.
 */
export interface ResultsTable {
  /**
   * A fourth column, or empty for the four modes that have three — M27 Phase 4.
   *
   * The race's best lap: §27.4 asks the card for position, rider, time, gap
   * **and** best lap, which is one more figure than five milestones of this
   * table had a column for. Empty hides the heading *and* the cells rather
   * than leaving a nameless column, which is the defect M26 Phase 6 found in
   * this very table — three modes had been drawing an unlabelled empty third
   * since M10 because `table-layout: fixed` takes its columns from the first
   * row and nobody was looking.
   */
  readonly extra?: string;
  /** The `<caption>`. What the whole table is.  */
  readonly caption: string;
  /** The first column: what each row *is*. */
  readonly label: string;
  /** The second column: what each row's figure is. */
  readonly value: string;
  /**
   * The third column, or `''`.
   *
   * Empty means the rows carry no comparison — which is true of three of the
   * five modes, because only a timed run and a track day have a record to
   * measure a row against. The column stays (the table is `table-layout:
   * fixed`, and its widths are the same on every card) and loses its heading,
   * because a heading over a column of blanks is the defect this type exists
   * to remove rather than a smaller version of it.
   */
  readonly delta: string;
}

/** One checkpoint's line on the results screen. */
export interface ResultsRow {
  /** The fourth column's value. Ignored unless `ResultsTable.extra` is set. */
  readonly extra?: string;
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
  /**
   * What the big number is, in words — M23.
   *
   * **The two captions used to be markup and stopped being true when a fourth
   * mode arrived.** "This run" over a number is right for a timed lap, a
   * Knockabout score and a chase; a track day's headline is the best lap of
   * an afternoon, and calling that "this run" is a small lie on the one screen
   * whose whole job is to be believed. So the words travel with the numbers,
   * like every other string here.
   */
  readonly totalCaption: string;
  /** What the number beside it is. Usually the record standing before the run. */
  readonly bestCaption: string;
  readonly total: string;
  readonly best: string;           // '—' when this run is the first
  readonly deltaToBest: string;    // '' when this run is the record
  readonly ahead: boolean;
  /** What the table below the summary is, in this mode's own words. */
  readonly table: ResultsTable;
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
 * The way into the roster — M23, and the third time this game has answered the
 * same question.
 *
 * The owner's report: the chip *"is so small and what not some casual players
 * might not even realize there is a change rider setting"*. That is exactly
 * M20's finding about fresh routes (*"casual players might not figure the
 * convoluted UI out"*) and M14.5's about the one-word title buttons, and the
 * fix is the same shape both times: **the affordance introduces itself, rather
 * than waiting to be found.** Three changes, each doing a different job.
 *
 * **It says how many riders there are, without a sentence.** The single swatch
 * became one dot per rider in the roster's own colours, the current one filled
 * and ringed and the rest small. A player who has never opened this panel can
 * now see that there are five people behind it and that they are riding one of
 * them — which is the fact the old chip never carried, and the reason "Change
 * rider" read as a setting rather than as a cast list. It is built from
 * `CHARACTERS`, so a sixth rider adds a sixth dot and nothing here changes.
 *
 * **It looks like a control.** A transparent pill in dim ink beside four solid
 * buttons reads as a caption; it now carries the panel's own surface, a border,
 * and a chevron, which is the same visual grammar as everything above it.
 *
 * **And it advertises itself exactly once, ever.** `data-attract` is set while
 * `seenRiderChooser` is false and never again after the player opens the panel
 * — the arcade attract-loop idea the owner asked for ("like those insert coin
 * messages"), bounded by the standing rule that nothing may be annoying. The
 * bound is what makes it acceptable: a returning player has already been told,
 * so telling them again every launch would be nagging rather than teaching.
 * The animation is the *decoration* of that state and not the state itself —
 * under `prefers-reduced-motion` the movement stops and the emphasis stays,
 * which is the rule the tilt-back pulse and M20's two cues already follow.
 *
 * The dots are `aria-hidden`: a screen reader is told "Riding as Cool Rider,
 * change rider" by the text, and five unlabelled colours would add nothing but
 * noise to it.
 */
function riderChipTemplate(): string {
  const dots = CHARACTERS.map((character) => `
      <span class="euc-rider-chip__dot" data-rider-dot="${character.id}"
            style="--rider-swatch: ${character.swatch}"></span>`).join('');

  return `
  <button type="button" class="euc-rider-chip" data-menu="riders" data-attract="false">
    <span class="euc-rider-chip__roster" aria-hidden="true">${dots}
    </span>
    <span class="euc-rider-chip__label">Riding as <strong data-rider-name>Cool Rider</strong></span>
    <span class="euc-rider-chip__more">Change rider</span>
    <span class="euc-rider-chip__chevron" aria-hidden="true">›</span>
  </button>`;
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
    <button type="button" class="euc-button" data-menu="couch" hidden>
      <span class="euc-button__label">2–4 Players</span>
      <span class="euc-button__note">Up to four riders, one screen — the keyboard and your pads</span>
    </button>
    <button type="button" class="euc-button" data-menu="challenge">
      <span class="euc-button__label">Time trial</span>
      <span class="euc-button__note">Race the clock through the checkpoints</span>
    </button>
    <button type="button" class="euc-button" data-menu="track-day">
      <span class="euc-button__label">Track Day</span>
      <span class="euc-button__note">Lap BelVar Circuit. Your best lap rides with you</span>
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
  ${riderChipTemplate()}
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
/**
 * Where her mark sits on her card, in the portraits' own 96 × 96 units.
 *
 * The height is *derived* from the artwork's pixels and never typed, which is
 * the whole point: `MV_LOGO_ASSET_PACK`'s README forbids stretching the mark
 * in X against Y, and a hand-typed height is a stretch waiting for somebody to
 * change the width. Fifteen units wide is as much as the card's chest has —
 * the collar is at 68 and the shoulders end at 82 — so it starts at 64 and
 * runs to 81.9, which is the last unit of suit there is.
 */
const MV_CARD_MARK = (() => {
  const width = 17;
  return {
    x: (96 - width) / 2,
    y: 75,
    width,
    height: Number(((width * MV_LOGO_HEIGHT) / MV_LOGO_WIDTH).toFixed(2)),
  };
})();

/**
 * Where Wheel in Motion's mark sits on his card, in the same 96 × 96 units —
 * M28 Phase 0, on `MV_CARD_MARK`'s rule: the height is derived from the
 * artwork's pixels and never typed, because a hand-typed height is a stretch
 * waiting for somebody to change the width. His mark is wide (2.27 : 1 against
 * hers at 1.2 : 1), so it spans the jersey's chest rather than sitting on a
 * collar: 26 units wide across a torso that runs 18–78, centred, at the height
 * the target render prints it — below the collar, above the belly.
 */
const WIM_CARD_MARK = (() => {
  const width = 26;
  return {
    x: (96 - width) / 2,
    y: 79,
    width,
    height: Number(((width * WIM_LOGO_HEIGHT) / WIM_LOGO_WIDTH).toFixed(2)),
  };
})();

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
  /**
   * Adonisb2 — M22, the fourth card, and this `Record` doing its declared job:
   * the compiler refused the widened `PlayableCharacterId` until this entry
   * existed (`docs/PLANS.md` §22.5).
   *
   * Built from the same head-and-shoulders silhouette as the two helmeted
   * cards above, because he shares it — a full-face lid over a visor over
   * shoulders. What separates him at 30 m is what separates him here: the
   * black field, the neon-green striping, and a **pale mirrored visor** where
   * every other card's visor is dark. The visor's diagonal streaks are the
   * card's shorthand for "mirror" the way Red Rider's sheen band is his
   * shorthand for "smoke". The backpack straps sit a step darker than the
   * jacket — black webbing on black kit, which is what the photograph shows,
   * so the card does not invent contrast the rider does not have.
   *
   * **His name is not drawn into the art** — Red Rider's entry above records
   * why (a portrait that announces itself reads the name twice), and the
   * legible wordmark §22.5 requires is the name span two lines below the
   * portrait, rendering the spelling he typed. The colours are the authored
   * albedos from `BLOCKOUT_COLOURS.adonisb2*`, reading a little deeper on an
   * unlit card exactly as the three portraits above do.
   */
  adonisb2: {
    blurb: 'Black kit under big neon-green guards, a mirrored visor, and a wheel that glares back. '
      + 'A real rider, in the game so he could share it.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <path d="M18 76c6-5 17-8 30-8s24 3 30 8v6H18z" fill="#2b2d31"/>
        <path d="M31 71 47 82M65 71 49 82" stroke="#46474b" stroke-width="4.6"
              stroke-linecap="round" fill="none"/>
        <path d="M20 58c0-19 12-31 28-31s28 12 28 31c0 6-2 11-5 14H25c-3-3-5-8-5-14z"
              fill="#34373d"/>
        <path d="M23 52c3-14 12-22 25-22s22 8 25 22c-6-4-15-6-25-6s-19 2-25 6z"
              fill="#3f434a"/>
        <path d="M36 32l3.4 9M60 32l-3.4 9" stroke="#6fc814" stroke-width="3.4"
              stroke-linecap="round" fill="none"/>
        <path d="M26 55c4-4 12-7 22-7s18 3 22 7c-1 7-3 11-6 13H32c-3-2-5-6-6-13z"
              fill="#9cabb9"/>
        <path d="M28 56c4-3 11-5 20-5s16 2 20 5c-1 5-2 8-4 9H32c-2-1-3-4-4-9z"
              fill="#b9c7d3"/>
        <path d="M35 56l7 11M45 55l7 12" stroke="#e2ecf3" stroke-width="2.6"
              stroke-linecap="round" opacity="0.85" fill="none"/>
        <path d="M26 53c4.4-4 12.6-6.4 22-6.4s17.6 2.4 22 6.4" stroke="#6fc814"
              stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M27 68c5 2.6 12.6 4 21 4s16-1.4 21-4c-.8 2.4-1.8 4-3 5H30c-1.2-1-2.2-2.6-3-5z"
              fill="#6fc814"/>
      </svg>`,
  },
  /**
   * Maribel Vargas — M23, the fifth card, and the first one drawn from a
   * reference that is itself already in this game's visual language: the owner
   * had a low-poly render made of her, and it agrees with her photographs on
   * every point that matters here.
   *
   * Three things separate her at a glance. **The visor is bright cyan and
   * mirrored** where Cool Rider's is deep blue and Red Rider's is smoked — the
   * loudest single element she has. **The accents are asymmetric**: aqua on
   * one side, coral on the other, which no other card does and which is the
   * detail her friends would name first. And **her own mark sits on the
   * collar** (below).
   *
   * **The ponytail is not here, and it was — removed on the owner's look at
   * the finished card.** It is still hers and still committed for the rig in
   * Phase A1, where a head seen from six angles has somewhere to put it; on a
   * front-facing emblem it can only hang off the side of the shell, and at
   * this size a brown shape beside a dark helmet reads as a smudge rather than
   * as hair. The card's three-shape budget was already spent on the silhouette,
   * the visor and the mark — this is that rule collecting.
   *
   * **Viewer-left is her right, and the sides are not decorative.** Aqua sits
   * at her right hand and coral at her left, on her suit and on her knee
   * guards, so a portrait facing the viewer wears aqua on the left of the
   * image (`docs/PLANS.md` §23.2 — the brief's "left" is viewer-relative and
   * flipping it would mirror a real person). Phase A1 carries the same
   * handedness into three dimensions, where it becomes −X and +X.
   *
   * **Nothing purple is drawn here, although her swatch is purple**, and that
   * is the honest version rather than an oversight: the violet is her
   * *machine* — the pads on her wheel and the mark she rides under — and the
   * card wears it as the border, the swatch dot and the "Riding now" pill,
   * where it identifies her without claiming she wears a colour she does not.
   * The values below are measured off the render rather than picked by eye,
   * and Phase A1 authors the albedos the sun actually falls on.
   *
   * **The mark on her chest is her own logo, with her permission** — the
   * grinning devil over the M and the V she rides under, which she confirmed
   * and then sent a clean copy of unprompted (`docs/PLANS.md` §23.5,
   * `NOTICE.md`). It replaced
   * an invented white chevron that was standing in for the brand wings on the
   * real suit, and it is the better mark for the same reason it is the safer
   * one: it is hers.
   *
   * **It is her file, not a drawing of one — and that replaced a drawing that
   * had been defended here at length.** Two paragraphs used to stand in this
   * spot explaining why the card carried the monogram half of her lockup, hand
   * drawn as two strokes, because at 120 px on a card and 58 px on a phone the
   * devil's head resolves to a purple smudge while the M's zigzag survives all
   * the way down. That reasoning is still true and no longer decides anything:
   * `MV_LOGO_ASSET_PACK` is the authority the owner declared, it forbids
   * drawing the M from scratch anywhere, and `AGENTS.md` carries the rule. So
   * the card shows the same PNG the suit, the back and the wheel show — the
   * `<image>` below is `src/data/mvLogoAsset.ts`, byte for byte.
   *
   * **The smudge is real and it is the price.** At this size the head is about
   * seven pixels of purple. The alternative is a shape of ours wearing her
   * colours on the screen that names her, and the owner has now twice called
   * that unacceptable. It also fixes the thing he did not have to argue: the
   * V under the M is *hers*, at her proportions, without anybody having to
   * check whether we got the middle's plunge the right way up — which a first
   * pass here did not, and which he caught with *"what about the V under the
   * M?"*
   *
   * Her name is rendered by the name span below the portrait rather than drawn
   * into the art — the rule Red Rider's entry above established.
   *
   * **The loose hair arrived with Phase A1b**, and it belongs on the card for
   * the reason it belongs on the character: it is the identity that survives
   * being small. A helmet is a dark oval on every rider in this game, and hers
   * is the only one with a light mass falling either side of it — which is
   * exactly the read a 96-pixel emblem has room for. Two authored values, the
   * same pair the mesh carries: dark at the crown, ashy at the ends.
   */
  'maribel-vargas': {
    blurb: 'Black race leathers, a mirrored blue visor, aqua one side and pink the other, '
      + 'on a purple wheel. A real racer, in the game because she asked.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <path d="M26 40c-8 10-12 26-11 42h13c-2-16 0-30 5-39z" fill="#4c3e35"/>
        <path d="M70 40c8 10 12 26 11 42H68c2-16 0-30-5-39z" fill="#4c3e35"/>
        <path d="M15.4 68c-.4 5-.5 10-.4 14h13c-.5-4-.7-9-.6-14z" fill="#c0b6a5"/>
        <path d="M80.6 68c.4 5 .5 10 .4 14h-13c.5-4 .7-9 .6-14z" fill="#c0b6a5"/>
        <path d="M18 76c6-5 17-8 30-8s24 3 30 8v20H18z" fill="#2f3238"/>
        <path d="M20 58c0-19 12-31 28-31s28 12 28 31c0 6-2 11-5 14H25c-3-3-5-8-5-14z"
              fill="#23262b"/>
        <path d="M23 52c3-14 12-22 25-22s22 8 25 22c-6-4-15-6-25-6s-19 2-25 6z"
              fill="#2e323a"/>
        <path d="M26 55c4-4 12-7 22-7s18 3 22 7c-1 7-3 11-6 13H32c-3-2-5-6-6-13z"
              fill="#14161a"/>
        <path d="M28 56c4-3 11-5 20-5s16 2 20 5c-1 5-2 8-4 9H32c-2-1-3-4-4-9z"
              fill="#1b9ae0"/>
        <path d="M30 58c4-2 10-3.4 18-3.4S62 56 66 58c-1 1.6-2 2.6-3.4 3.2-4-1.6-9-2.4-14.6-2.4
                 s-10.6.8-14.6 2.4C32 60.6 31 59.6 30 58z" fill="#58d8fb"/>
        <path d="M27 68c5 2.6 12.6 4 21 4s16-1.4 21-4c-.8 2.4-1.8 4-3 5H30c-1.2-1-2.2-2.6-3-5z"
              fill="#24272c"/>
        <path d="M18.6 75.6c6-4.6 16.6-7.4 29.4-7.4v6.2c-11.6 0-21.8 2.4-27.6 5.8z"
              fill="#4fd6cf"/>
        <path d="M77.4 75.6c-6-4.6-16.6-7.4-29.4-7.4v6.2c11.6 0 21.8 2.4 27.6 5.8z"
              fill="#e8446a"/>
        <image href="data:image/png;base64,${MV_LOGO_PNG_BASE64}"
               x="${MV_CARD_MARK.x}" y="${MV_CARD_MARK.y}"
               width="${MV_CARD_MARK.width}" height="${MV_CARD_MARK.height}"
               preserveAspectRatio="xMidYMid meet"/>
      </svg>`,
  },
  /**
   * Wheel in Motion — M28, the sixth card, and the `Record` doing its job a
   * third time: the compiler refused the widened `PlayableCharacterId` until
   * this entry existed (`docs/PLANS.md` §28.7).
   *
   * Three shapes, decided at 58 px — the size a phone card gets. **The lid
   * is the road shell the helmeted cards share, in his blue with a yellow
   * chin bar** over a dark visor: Phase 1 drew an off-road lid here — peak,
   * goggles, an orange chin bar — and the owner's look pass (2026-09-01)
   * struck it with the rider's ("a normal helmet like the other characters",
   * "don't use orange on helmet"); orange is his wheel's. Blue over yellow on
   * the head is his colour pair before a letter is read. **The jersey is blue
   * over yellow** — the two saturated hues the reference photograph and the
   * target render agree on, with the yellow arriving as shoulder panels the
   * way the print does, and the two pack straps over them, so the card is
   * not a blue card with a yellow stripe painted on. **And his mark sits on
   * the chest**, as an `<image>` of `src/data/wimLogoAsset.ts`, byte for
   * byte — the second use of the rights-boundary exception `DESIGN.md` §9d
   * records for artwork this project may not redraw, for the reason it was
   * recorded: the brief forbids a drawing of it, and a portrait of him
   * without it is a portrait of a blue helmet.
   *
   * The visor is the dark mirror the photograph shows (`docs/PLANS.md`
   * §28.2's lens rule), with one cool sheen across it, because the card is a
   * portrait of the rider the chooser puts on the wheel and the two must
   * agree. The mark's white plate is the artwork's own ground and not
   * something added here. Nothing drawn is a letter, and his name is
   * rendered by the name span below the portrait, the rule Red Rider's entry
   * established. The colours are the authored albedos
   * `BLOCKOUT_COLOURS.wheelInMotion*` — one blue for jersey, shell and
   * trousers, the yellow, the gear black, the visor.
   */
  'wheel-in-motion': {
    blurb: 'Blue lid with yellow stripes and a yellow chin over a dark visor, a blue-and-yellow jersey '
      + 'with his mark on the chest, blue trousers and white knee armour. A real rider with a channel, in the game by permission.',
    portrait: `
      <svg viewBox="0 0 96 96" class="euc-rider-card__art" aria-hidden="true" focusable="false">
        <path d="M18 76c6-5 17-8 30-8s24 3 30 8v20H18z" fill="#1490dc"/>
        <path d="M18 76c4-3.4 9.6-6 16.6-7.2L30 96H18z" fill="#fad414"/>
        <path d="M78 76c-4-3.4-9.6-6-16.6-7.2L66 96h12z" fill="#fad414"/>
        <path d="M29.4 70.8c1.6-.8 3.2-1.4 5-1.9L32.6 96H28z" fill="#2e3136"/>
        <path d="M66.6 70.8c-1.6-.8-3.2-1.4-5-1.9L63.4 96H68z" fill="#2e3136"/>
        <path d="M20 58c0-19 12-31 28-31s28 12 28 31c0 6-2 11-5 14H25c-3-3-5-8-5-14z" fill="#1490dc"/>
        <path d="M23 52c3-14 12-22 25-22s22 8 25 22c-6-4-15-6-25-6s-19 2-25 6z" fill="#3ba6ea"/>
        <path d="M28.5 50.5L43.5 33.5h3.5L32.5 50.5z" fill="#fad414"/>
        <path d="M67.5 50.5L52.5 33.5H49L63.5 50.5z" fill="#fad414"/>
        <path d="M26 55c4-4 12-7 22-7s18 3 22 7c-1 7-3 11-6 13H32c-3-2-5-6-6-13z" fill="#2b343c"/>
        <path d="M28 56c4-3 11-5 20-5s16 2 20 5c-1 5-2 8-4 9H32c-2-1-3-4-4-9z" fill="#3a4652"/>
        <path d="M30 57.4c3.6-1.8 8.4-2.8 14-2.8h2.4L36.6 65H32c-1.2-1-2-2.6-2-4.2z"
              fill="#6b8c96" opacity="0.6"/>
        <path d="M26.4 66.4c5.4 3 13 4.8 21.6 4.8s16.2-1.8 21.6-4.8c-.6 2.4-1.6 4.2-3.2 5.6H29.6
                 c-1.6-1.4-2.6-3.2-3.2-5.6z" fill="#fad414"/>
        <rect x="44" y="67.8" width="8" height="3" rx="1" fill="#2e3136"/>
        <image href="data:image/png;base64,${WIM_LOGO_PNG_BASE64}"
               x="${WIM_CARD_MARK.x}" y="${WIM_CARD_MARK.y}"
               width="${WIM_CARD_MARK.width}" height="${WIM_CARD_MARK.height}"
               preserveAspectRatio="xMidYMid meet"/>
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
 * One seat, as the join panel needs to draw it — M25 Phase 5.
 *
 * Every field is already decided. This screen does not ask the router
 * anything, does not know what a `DeviceId` is, and cannot compose a device
 * name wrongly, which is the same split the fresh-route panel makes between a
 * tagged status and the sentence it prints.
 */
export interface CouchSeatView {
  /** What is driving this seat, or `null` while nothing is. */
  readonly device: 'keyboard' | 'gamepad' | null;
  /**
   * Which pad, counting from 1, when `device` is `'gamepad'`.
   *
   * A number rather than a name, because naming it is prose and prose belongs
   * to this screen (M12 Phase 4's rule). `app/Game.ts` knows the pad is at
   * index 1; only this file decides that a player reads that as "Gamepad 2".
   */
  readonly padNumber: number | null;
  /** True while this seat's device has gone and the seat is being held. */
  readonly awaiting: boolean;
  /** Who this seat will ride as. */
  readonly character: PlayableCharacterId;
  /**
   * Whether this chair is out — M27 Phase 1.
   *
   * The panel draws `COUCH_SEATS` cards whatever happens, and a *seat* is a
   * rider standing in the world; one is only created when the room still has a
   * device that could take it (`Game.growCouch`). So a card can be showing a
   * chair that is not out yet, and it has to say something different from "an
   * empty seat, press to sit down" — which is a promise to a room that has
   * nothing left to press with.
   */
  readonly seated: boolean;
}

/**
 * What is still available to sit down with — M25 Phase 5.
 *
 * **The panel has to be able to say "there is nothing left to press".** The
 * title's entrance predicate is deliberately loose — a desktop with a mouse
 * and no pad passes it, because a pad may be plugged in at any moment — and
 * the claim step is what actually proves a second device exists. Without this,
 * a keyboard-only machine reads "press Enter on the keyboard" beside a seat
 * the keyboard is already holding, and the panel looks broken rather than
 * honest.
 */
export type CouchSpare = 'both' | 'pad' | 'keyboard' | 'none';

/** Both seats, and whether the panel may leave. */
export interface CouchView {
  readonly seats: readonly CouchSeatView[];
  /** True once every seat is held. What arms Start. */
  readonly ready: boolean;
  /** What an empty seat could still be claimed with. */
  readonly spare: CouchSpare;
  /**
   * What this session is *for* — M26 Phase 5 (q78).
   *
   * Free ride, Knockabout, or the race — **which was built at M27 Phase 3**,
   * where this comment used to say "when it is built". What a room sitting
   * down is about to play is a property of the session, not a saved
   * preference, so it lives on `Game` and never reaches `GameOptions`.
   *
   * **This is not a sixth ride.** M25's finding holds — a couch is a session
   * shape — so the couch carries the `freeRide`, `knockabout` and `trackDay`
   * rows the game already has, and this chooses which.
   *
   * `contact` sat beside this until the owner's 2026-08-27 ride retired the
   * toggle it reported. Contact is still session state on `Game` and still not
   * an option; it simply has no control any more, because it is always on.
   */
  readonly ride: CouchRide;
  /**
   * Rides this room cannot start into — M27 Phase 1.
   *
   * The join panel had no blocked list while every couch was two seats and
   * every world it could open on had discs. Both stopped being true at once:
   * Knockabout is a two-player fight until q94 is opened, so a room of three
   * must not be *offered* the mode its own door would then refuse. The pause
   * menu's switch has answered this since M26; this is the same fact at the
   * entrance.
   */
  readonly blocked: readonly CouchRide[];
  /** Why, so the note under the buttons can say which of the two it is. */
  readonly blockReason: CouchBlockReason;
}

/**
 * Light whichever mode button is the current one, wherever the chooser is.
 *
 * A *report* of what `Game` holds, in both places the chooser stands, written
 * only where it differs — the panel's own rule, and the reason the pause menu's
 * copy could not simply latch its own last press.
 */
function writeModeChooser(root: HTMLElement, ride: CouchRide): void {
  for (const button of root.querySelectorAll<HTMLElement>('[data-couch-mode]')) {
    const pressed = button.dataset.couchMode === ride ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== pressed) {
      button.setAttribute('aria-pressed', pressed);
    }
  }
}

/**
 * The couch's mode picker, wherever it is standing — M26 Phase 5's ride
 * repairs (2026-08-27).
 *
 * **Two buttons, both visible, rather than a `<select>`**, and the owner's ride
 * is the whole of the argument: *"the game mode thing is kinda small and
 * secretive, makes it seems like we don't want players to change the default
 * mode. it's kinda cumbersome to change modes."* A closed dropdown shows one
 * choice and hides the fact that there is another; a segmented pair shows both
 * and costs one press to move between them.
 *
 * It also fixes a thing nobody had reported, because the panel is walked with a
 * gamepad: opening a native `<select>` from a pad is a control the pad cannot
 * finish (M25 Phase 5 found the same shape one control earlier), while two
 * buttons are two more stops on the walk `focusableSelector` already makes.
 *
 * **`aria-pressed`, not `role="radio"`.** A radiogroup takes every unselected
 * option out of the tab order, and the pad cursor walks exactly that order —
 * so the correct ARIA for a segmented control would have hidden the choice
 * from the device most likely to be making it. Toggle buttons keep both stops
 * and say the same thing to a screen reader.
 *
 * Emitted from `COUCH_RIDES` rather than written twice, so the couch race
 * arrives in both places at once when it is built.
 */
/**
 * Why a ride is off the menu, as a fact rather than as a sentence.
 *
 * **Two reasons since M27 Phase 1, and they are not interchangeable.** A world
 * with nothing to hit is fixed by building a route; a couch with three people
 * on it is not fixed by anything the player can do this session, and telling
 * them to make a new route would send them off to try. `Game` knows which is
 * true; only this file knows how to say it.
 */
export type CouchBlockReason = 'no-targets' | 'too-many-seats' | null;

/** The note under the mode chooser, whichever answer it is giving. */
function couchBlockNote(reason: CouchBlockReason): string {
  if (reason === 'no-targets') {
    return 'Knockabout needs a route with things to hit, and this one has none. '
      + 'New route will build you one to fight on.';
  }
  if (reason === 'too-many-seats') {
    return 'Knockabout is a two-player fight. Race and free ride take everybody.';
  }
  return MODE_CHOOSER_NOTE;
}

const MODE_CHOOSER_NOTE = 'Free ride is riding, with nothing to win. Race is three laps of '
  + 'BelVar Circuit from a standing grid. Knockabout gives two players a paddle: '
  + 'first to five knockdowns takes the match.';

function modeChooserTemplate(action: string, idBase: string, label = 'Playing'): string {
  const buttons = COUCH_RIDES.map((ride) => `
        <button type="button" class="euc-couch__mode-button" data-menu="${action}"
                data-couch-mode="${ride}" aria-pressed="false">${COUCH_RIDE_LABELS[ride]}</button>`).join('');
  return `
  <div class="euc-couch__mode">
    <span class="euc-couch__mode-label" id="${idBase}-label">${label}</span>
    <div class="euc-couch__modes" role="group" aria-labelledby="${idBase}-label"
         aria-describedby="${idBase}-note">${buttons}
    </div>
    <p class="euc-field__note" id="${idBase}-note">${MODE_CHOOSER_NOTE}</p>
  </div>
`;
}

/**
 * The two-player join panel — M25 Phase 5 (`docs/PLANS.md` §25.5).
 *
 * **A menu, not a mode.** Nothing on this screen is a ride: it exists to get
 * two people holding two devices and wearing two different riders, and then to
 * hand that arrangement to free ride. The state machine says the same thing —
 * `couchJoin` is a sibling of `riderSelect`, not a sixth entry in
 * `RIDE_STATES` — because "two players" is *who* is riding rather than what
 * the ride is for.
 *
 * **Nobody is asked to configure anything.** The one instruction is "press the
 * button you are going to play with", which is also the only instruction that
 * can be followed by somebody who has just been handed a controller. That is
 * why the seats are claimed by *pressing* rather than assigned from a list:
 * a dropdown of device names is a screen a guest cannot use, and it would be
 * wrong the moment two identical pads were plugged in.
 *
 * **The claim press is not also a menu press**, and that is a real rule rather
 * than an implementation detail — see `setSuppressConfirmKeys` and
 * `app/Game.ts`'s `claimsFirst`. Without it the second player's Enter would
 * seat them *and* activate whatever button happened to have focus, which at
 * the moment the panel arms is Start.
 *
 * **Every card cycles the roster and no two can ever agree** (q68). Each
 * card steps over the riders its neighbours are wearing rather than landing on
 * one and being corrected, so there is no invalid state for the panel to
 * recover from. What differs between the cards is invisible here and
 * load-bearing there: the player's choice is written to `GameOptions`, and the
 * guests' are session state that never reaches the saved record.
 *
 * The status lines are `role="status"` for the reason the route panel's is:
 * "Player 2 is in" is an announcement, and a player using a screen reader is
 * exactly the player who cannot see the card light up.
 */
function couchTemplate(): string {
  // **Emitted from `COUCH_SEATS` rather than written twice** — M27 Phase 1, on
  // `modeChooserTemplate`'s exact argument. The panel's markup was fixed at two
  // cards while the couch was two seats; the day the constant moved, a
  // hand-written pair would have been a panel that could not show the seats the
  // game had.
  const seats = Array.from({ length: COUCH_SEATS }, (_unused, seat) => `
      <div class="euc-couch__seat" data-couch-seat="${seat}" data-claimed="false">
        <h3 class="euc-couch__player">Player ${seat + 1}</h3>
        <p class="euc-couch__status" data-couch-status="${seat}" role="status"></p>
        <div class="euc-couch__rider">
          <button type="button" class="euc-couch__step" data-menu="couch-prev"
                  data-couch-step="${seat}" aria-label="Previous rider for player ${seat + 1}">&#8249;</button>
          <span class="euc-couch__pick">
            <span class="euc-couch__dot" aria-hidden="true"></span>
            <span class="euc-couch__name" data-couch-rider="${seat}"></span>
          </span>
          <button type="button" class="euc-couch__step" data-menu="couch-next"
                  data-couch-step="${seat}" aria-label="Next rider for player ${seat + 1}">&#8250;</button>
        </div>
        <p class="euc-couch__hint" aria-hidden="true">Change rider</p>
      </div>`).join('');

  return `
<div class="euc-menu__panel euc-couch" role="dialog" aria-modal="true"
     aria-labelledby="euc-couch-heading">
  <h2 class="euc-menu__title euc-couch__heading" id="euc-couch-heading">Players</h2>
  <p class="euc-menu__tagline">
    One screen, one world, and two to four riders. Each player takes their own
    controller — a gamepad, or this keyboard — and presses to sit down. Nothing
    is being timed; go wherever you like.
  </p>

  <fieldset class="euc-couch__seats">
    <legend class="euc-couch__legend">Seats</legend>
    ${seats}
  </fieldset>

  ${modeChooserTemplate('couch-mode', 'euc-couch-mode')}

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="couch-start" disabled>
      <span class="euc-button__label">Start riding</span>
    </button>
    <button type="button" class="euc-button" data-menu="couch-back">
      <span class="euc-button__label">Back</span>
    </button>
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
 * The one-press way to a brand-new course — M20, and the owner's own report.
 *
 * Cop Chase always starts on the same route, and the only way to a different
 * one was: back out to the title, open Fresh route, generate, quit, re-enter
 * the mode. His words: *"casual players might not figure the convoluted UI
 * out"* — meaning most players are riding one course forever without knowing
 * regeneration exists at all.
 *
 * **So it is one button, in the two places a player already is when they want
 * one**: the pause menu of any ride, and the results card at the end of a run.
 * It generates and drops them straight back into *the mode they were in* — no
 * typing, no seed, no journey through the title. The Fresh route panel keeps
 * everything it had (typing a friend's seed, copying a link, the time-trial
 * entrance); this is the affordance underneath it, for the player who does not
 * yet know any of that is there.
 *
 * `data-menu` is on the `<button>` and the label is a `<span>` inside it,
 * because M14.5 recorded that a click lands on the innermost element and a hook
 * inside a control is a silent no-op.
 *
 * **The note's own hook is `data-note`, and it must never be `data-menu`** —
 * the first build spelled it `data-menu="new-route-note"` and thereby walked
 * straight into the trap the paragraph above describes: `onClick` resolves the
 * nearest `data-menu` ancestor, so a tap landing on the note — which is most
 * of the button's height on a phone — resolved to an action nobody handles
 * and died silently. On the owner's handset that read as "the first tap after
 * Busted takes several presses" (§4.5): taps on the note line did nothing,
 * taps on the label line worked, and which one a thumb hits is luck.
 */
const NEW_ROUTE_BUTTON = `
    <button type="button" class="euc-button" data-menu="new-route">
      <span class="euc-button__label">New route</span>
      <span class="euc-button__note" data-note="new-route"></span>
    </button>`;

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
      <span class="euc-results__caption" data-menu="results-total-caption">This run</span>
      <span class="euc-results__total" data-menu="results-total">0:00.00</span>
    </div>
    <div class="euc-results__stat">
      <span class="euc-results__caption" data-menu="results-best-caption">Best</span>
      <span class="euc-results__best" data-menu="results-best">—</span>
      <span class="euc-results__delta" data-menu="results-delta" data-ahead="false"></span>
    </div>
  </div>

  <table class="euc-results__table" data-menu="results-table" data-compare="true">
    <caption class="euc-results__caption" data-menu="results-table-caption">Splits</caption>
    <thead>
      <tr>
        <th scope="col" data-menu="results-column-label">Checkpoint</th>
        <th scope="col" data-menu="results-column-value">Time</th>
        <th scope="col" data-menu="results-column-delta">vs best</th>
        <th scope="col" data-menu="results-column-extra" hidden></th>
      </tr>
    </thead>
    <tbody data-menu="results-rows"></tbody>
  </table>

  <ul class="euc-results__notes" data-menu="results-notes" hidden></ul>

  <div class="euc-results__couch" data-menu="results-couch" hidden>
${modeChooserTemplate('switch-mode', 'euc-results-mode', 'Play next')}
  </div>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="retry"
            data-focus-first>Ride it again</button>
${NEW_ROUTE_BUTTON}
    <button type="button" class="euc-button" data-menu="results-title">Back to title</button>
  </div>
</div>
`;

const PAUSE_TEMPLATE = `
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-pause-heading">
  <h2 class="euc-menu__title" id="euc-pause-heading">Paused</h2>
  <div class="euc-pause__couch" data-menu="pause-couch" hidden>
${modeChooserTemplate('switch-mode', 'euc-pause-mode')}
  </div>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="resume"
            data-focus-first>Resume</button>
    <button type="button" class="euc-button" data-menu="end-session" hidden>
      <span class="euc-button__label">End session</span>
      <span class="euc-button__note">Pit in and see your best lap</span>
    </button>
${NEW_ROUTE_BUTTON}
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
  private readonly couch: HTMLDivElement;
  /** The seed field, held because it is read as well as written. */
  private readonly seedField: HTMLInputElement | null;

  private screen: MenuScreen = 'none';
  /** What had focus before a menu opened, so it can be given back. */
  private returnFocus: HTMLElement | null = null;

  /** The binding row currently capturing a key, or null. */
  private listening: BindableAction | null = null;

  private options: GameOptions;

  /**
   * Whether Enter and Space are a seat claim rather than a button press — M25
   * Phase 5. See `setSuppressConfirmKeys`.
   */
  private claimKeys = false;

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
    this.couch = this.mount('euc-menu--couch', couchTemplate());
    this.seedField = this.routes.querySelector<HTMLInputElement>('[data-menu="seed"]');

    this.parent.addEventListener('click', this.onClick);
    // `input` rather than `change`, so a slider reports while it is being
    // dragged: the whole point of a volume control is that the player hears
    // the result before letting go.
    this.settings.addEventListener('input', this.onInput);
    // **The join panel is deliberately not listened to here.** It had a root
    // `input` listener of its own from M26 Phase 2 until 2026-08-27, kept off
    // `onInput` because every path through that handler ends at
    // `callbacks.onChange` — the door to `GameOptions` — and neither of the
    // panel's settings is an option. Both of those controls are now buttons on
    // the click dispatch, so the separation is structural rather than
    // maintained: there is nothing on that panel for an options handler to
    // hear. `tests/m26.spec.ts` asserts that, so a `<select>` arriving here
    // fails rather than working by accident.

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
   * came from on close. The rider chooser is the one deliberate exception: it
   * focuses the selected rider, so a saved third card is not opened below the
   * fold on a phone. Both halves matter: without the first a keyboard user has
   * to Tab in from the document, and without the second they are returned to
   * the top of the page every time.
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
    this.couch.hidden = screen !== 'couch';
    this.screen = screen;

    if (screen === 'none') {
      this.setPadCursor(null);
      this.returnFocus?.focus();
      this.returnFocus = null;
      return;
    }

    if (screen === 'riders') {
      const selected = [...this.riders.querySelectorAll<HTMLElement>('[data-rider]')]
        .find((card) => card.dataset.rider === this.options.character);
      if (selected !== undefined) {
        selected.focus();
        this.setPadCursor(this.padDriving ? selected : null);
        return;
      }
    }

    this.focusFirst(this.panelFor(screen));
  }

  /** Push a new options record into the controls. Called on every change. */
  sync(options: GameOptions): void {
    this.options = options;

    this.setRider(options.character);
    // The attract state is a fact about the player, not about this screen, so
    // it is read from the record on every sync rather than latched here: the
    // moment the composition root writes `seenRiderChooser`, the chip settles.
    this.setRiderAttract(!options.seenRiderChooser);

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

    // The chip's own `--rider-swatch` is what its border and its attract glow
    // are drawn in, so the way in to the roster is always in the colour of the
    // rider the player is currently wearing.
    const chip = this.title.querySelector<HTMLElement>('.euc-rider-chip');
    chip?.style.setProperty('--rider-swatch', character.swatch);
    for (const dot of this.title.querySelectorAll<HTMLElement>('[data-rider-dot]')) {
      const current = dot.dataset.riderDot === character.id ? 'true' : 'false';
      if (dot.dataset.current !== current) dot.dataset.current = current;
    }

    for (const card of this.riders.querySelectorAll<HTMLElement>('[data-rider]')) {
      const active = card.dataset.rider === character.id;
      const pressed = active ? 'true' : 'false';
      if (card.getAttribute('aria-pressed') !== pressed) card.setAttribute('aria-pressed', pressed);
    }
  }

  /**
   * Have the chip advertise the roster, or stop.
   *
   * An attribute rather than a class, and CSS decides what it looks like — the
   * same division `data-stage` makes on the fresh-route panel (`DESIGN.md` §9).
   * It is deliberately *not* announced to a screen reader: the button's name
   * already says "change rider", and a live region firing on the title screen
   * would be an interruption where this is only an invitation.
   */
  private setRiderAttract(attract: boolean): void {
    const chip = this.title.querySelector<HTMLElement>('.euc-rider-chip');
    const value = attract ? 'true' : 'false';
    if (chip && chip.dataset.attract !== value) chip.dataset.attract = value;
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
    this.setResultsText('results-total-caption', view.totalCaption);
    this.setResultsText('results-total', view.total);
    this.setResultsText('results-best-caption', view.bestCaption);
    this.setResultsText('results-best', view.best);
    this.setResultsText('results-delta', view.deltaToBest);

    const delta = this.results.querySelector<HTMLElement>('[data-menu="results-delta"]');
    if (delta) delta.dataset.ahead = view.ahead ? 'true' : 'false';

    // **The table says what it is, in the mode's own words** — see
    // `ResultsTable`. `data-compare` is the fact a stylesheet or a spec can
    // ask about without parsing a heading: whether these rows are measured
    // against anything.
    this.setResultsText('results-table-caption', view.table.caption);
    this.setResultsText('results-column-label', view.table.label);
    this.setResultsText('results-column-value', view.table.value);
    this.setResultsText('results-column-delta', view.table.delta);
    const table = this.results.querySelector<HTMLElement>('[data-menu="results-table"]');
    if (table) table.dataset.compare = view.table.delta === '' ? 'false' : 'true';
    const extra = view.table.extra ?? '';
    const extraHead = this.results.querySelector<HTMLElement>('[data-menu="results-column-extra"]');
    if (extraHead) {
      extraHead.textContent = extra;
      extraHead.hidden = extra === '';
    }

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

        // The fourth column exists only while the table names it, so a mode
        // with three columns emits three cells rather than a blank fourth.
        if (extra !== '') {
          const rowExtra = document.createElement('td');
          rowExtra.className = 'euc-results__row-extra';
          rowExtra.textContent = row.extra ?? '';
          tr.appendChild(rowExtra);
        }

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

  /**
   * Offer to pit, or do not — M23.
   *
   * **Not the mirror of `setChallengeAvailable`, and the difference is worth
   * stating.** That one hides an entrance on a world that cannot host the mode;
   * this hides an *exit* that only means anything inside one. A pause taken in
   * free ride offering "End session" would be a control with no session behind
   * it, and pressing it would have to do nothing — the exact failure the method
   * above was written for.
   *
   * There is no title-screen half: Track Day brings its own circuit, so its
   * entrance is always live.
   */
  setEndSessionAvailable(available: boolean): void {
    const button = this.pause.querySelector<HTMLElement>('[data-menu="end-session"]');
    if (button) button.hidden = !available;
  }

  // -- Two players (M25 Phase 5) ----------------------------------------------

  /**
   * Offer a couch session, or do not.
   *
   * `setChallengeAvailable`'s shape and not its reason. That one hides an
   * entrance on a world that cannot host the mode; this hides one on a
   * *machine* that cannot host it — a phone has one screen's width and one
   * pair of hands, and an entrance leading to a panel that could never arm is
   * worse than no entrance at all.
   *
   * The answer can change while the game is running, which is why this is a
   * method rather than a construction-time flag: a window dragged wider, or
   * the first gamepad of the session appearing, both make it true.
   */
  setCouchAvailable(available: boolean): void {
    const button = this.title.querySelector<HTMLElement>('[data-menu="couch"]');
    if (button) button.hidden = !available;
    // **And the panel says how many entrances it is holding**, because an
    // eighth one is a layout question as well as an offer: seven stacked
    // buttons fit an ordinary laptop and eight do not (M23's finding, one
    // button later). One data attribute, and the stylesheet owns every
    // consequence of it — the same division `data-stage` and `data-split`
    // make (`DESIGN.md` §9). Keying the layout off the *cause* rather than off
    // a second copy of the width threshold is what stops the two drifting.
    const value = available ? 'true' : 'false';
    if (this.title.dataset.couch !== value) this.title.dataset.couch = value;
  }

  /**
   * Draw every seat, and arm or disarm Start.
   *
   * Every sentence on the panel is composed here from the facts in the view,
   * for the reason the fresh-route panel's refusals are: a caller that could
   * compose "Player 2 is in" is a caller that could compose it wrongly, and
   * this is the screen where a wrong word is the difference between a guest
   * pressing the right button and giving up.
   */
  setCouchView(view: CouchView): void {
    for (let seat = 0; seat < view.seats.length; seat += 1) {
      const card = this.couch.querySelector<HTMLElement>(`[data-couch-seat="${seat}"]`);
      if (card === null) continue;
      const entry = view.seats[seat];
      const claimed = entry.device !== null;
      const value = claimed ? 'true' : 'false';
      if (card.dataset.claimed !== value) card.dataset.claimed = value;

      const character = CHARACTERS.find((one) => one.id === entry.character) ?? CHARACTERS[0];
      card.style.setProperty('--rider-swatch', character.swatch);

      const name = card.querySelector<HTMLElement>(`[data-couch-rider="${seat}"]`);
      if (name && name.textContent !== character.name) name.textContent = character.name;

      const status = card.querySelector<HTMLElement>(`[data-couch-status="${seat}"]`);
      const line = couchSeatLine(entry, view.spare);
      const text = seatLineText(line);
      // Compared as prose and drawn as segments — `renderSeatLine` says why the
      // two cannot disagree, and the comparison is what keeps a redraw from
      // rebuilding a line a player is halfway through reading.
      if (status && status.textContent !== text) renderSeatLine(status, line);
    }

    // The mode choice: a *report* of what `Game` holds, written only when it
    // differs, so the pad walking the panel and a claim redrawing it cannot
    // fight each other mid-press.
    //
    // The contact toggle used to be reported on the same terms. It is gone with
    // its control (the owner's 2026-08-27 ride); contact is on, always, and
    // nothing on this screen says otherwise.
    writeModeChooser(this.couch, view.ride);
    // **And grey out what this room cannot have** — M27 Phase 1, the pause
    // menu's rule brought to the entrance. `disabled` is the same right
    // spelling here as there: the pad's walk steps over a stop it could not
    // use, and a pointer gets the game's own unavailable styling for free.
    for (const button of this.couch.querySelectorAll<HTMLButtonElement>('[data-couch-mode]')) {
      const id = button.dataset.couchMode;
      const off = id !== undefined && view.blocked.includes(id as CouchRide);
      if (button.disabled !== off) button.disabled = off;
    }
    const modeNote = this.couch.querySelector<HTMLElement>('.euc-field__note');
    const modeText = couchBlockNote(view.blockReason);
    if (modeNote && modeNote.textContent?.trim() !== modeText) modeNote.textContent = modeText;

    const start = this.couch.querySelector<HTMLButtonElement>('[data-menu="couch-start"]');
    // **Disabled rather than hidden.** A player who can see the control they
    // are working towards knows the panel is going somewhere; one that appears
    // out of nowhere the instant the second seat fills is also one that can be
    // pressed by the very keystroke that filled it.
    if (start) start.disabled = !view.ready;
  }

  /**
   * Show — or hide — the pause menu's mode switch, and light the current one.
   *
   * **Hidden rather than absent, and hidden by the same rule `end-session`
   * uses**: a control that exists only in some sessions is a control the pad's
   * walk has to be able to skip, and `focusableControls` skips a `hidden`
   * subtree for free. Passing `null` is "this is not a couch session", which is
   * every single-player pause in the game and therefore the common case.
   *
   * The chooser is a report here exactly as it is on the join panel: `Game`
   * holds what the session is for, and a switch that latched its own last press
   * would disagree with the ride the moment a mode entrance refused.
   */
  setPauseCouchRide(
    ride: CouchRide | null,
    blocked: readonly CouchRide[] = [],
    reason: CouchBlockReason = null,
  ): void {
    this.writeCouchSwitch(this.pause, 'pause-couch', ride, blocked, reason);
  }

  /**
   * The same control on the results card — the owner's 2026-08-28 ride.
   *
   * **The same method, the same words, a different card**, and that is the
   * whole design: a player who learned to change mode from the pause menu must
   * not have to learn a second control at the end of a match. Its own label
   * ("Play next" rather than "Playing") is the one thing that differs, because
   * a finished match is not a session in progress and a chooser that said
   * `Playing` over a results card would be reporting a ride nobody is on.
   *
   * `null` is every single-player results card in the game, which is almost all
   * of them.
   */
  setResultsCouchRide(
    ride: CouchRide | null,
    blocked: readonly CouchRide[] = [],
    reason: CouchBlockReason = null,
  ): void {
    this.writeCouchSwitch(this.results, 'results-couch', ride, blocked, reason);
  }

  /** One writer for both copies of the switch, so the two cannot drift. */
  private writeCouchSwitch(
    panel: HTMLElement,
    hook: string,
    ride: CouchRide | null,
    blocked: readonly CouchRide[],
    reason: CouchBlockReason = null,
  ): void {
    const block = panel.querySelector<HTMLElement>(`[data-menu="${hook}"]`);
    if (block === null) return;
    const hidden = ride === null;
    if (block.hidden !== hidden) block.hidden = hidden;
    if (ride === null) return;
    writeModeChooser(block, ride);

    // **A mode this world cannot carry is disabled rather than dead**, and
    // `disabled` is the exact right spelling twice over: `focusableSelector`
    // excludes it, so the pad's walk steps over a stop it could not use, and a
    // pointer gets the game's own unavailable styling for free.
    //
    // The reason goes in the note, because the note is the only line either
    // button shares — and a player who presses nothing and is told nothing is a
    // player who thinks the game is broken (the fresh-route panel's rule).
    for (const button of block.querySelectorAll<HTMLButtonElement>('[data-couch-mode]')) {
      const id = button.dataset.couchMode;
      const off = id !== undefined && blocked.includes(id as CouchRide);
      if (button.disabled !== off) button.disabled = off;
    }
    const note = block.querySelector<HTMLElement>('.euc-field__note');
    const text = couchBlockNote(reason);
    if (note && note.textContent?.trim() !== text) note.textContent = text;
  }

  /**
   * Treat Enter and Space as a seat claim rather than as a button press.
   *
   * Set while a device that holds no seat could press them — which is exactly
   * while the join panel is up and the keyboard is unclaimed. The rule and the
   * reason are on `onKeyDown`; this is only the switch.
   */
  setSuppressConfirmKeys(suppress: boolean): void {
    this.claimKeys = suppress;
  }

  // -- New route from inside a ride (M20) -------------------------------------

  /**
   * What the two `New route` buttons say, and whether they can be pressed.
   *
   * **The words belong to this screen** — M12 Phase 4's rule, applied to the
   * one control that has to speak while it works. Generating a route is not
   * instant, the button lives on a card with no status line of its own, and a
   * button that looked idle while the game built a world would be pressed
   * twice. So it narrates itself, in three states and no more:
   *
   *   - `idle` — the offer, and the sentence that tells a player who has never
   *     opened Fresh route that other courses exist at all. That sentence is
   *     the whole point of this feature.
   *   - `building` — pressed, working, and disabled so it cannot be pressed
   *     again. `app/Game.ts` refuses a second request anyway; this is so the
   *     player is not left wondering whether the first one landed.
   *   - `failed` — the generator refused every attempt. Rare (one in sixteen
   *     billion by the retry budget) and it still needs words, because the
   *     alternative is a button that does nothing and a player who concludes
   *     the game is broken. Names the fix, does not apologise — the same shape
   *     the fresh-route panel's own refusals take.
   */
  setNewRouteStage(stage: 'idle' | 'building' | 'failed'): void {
    const note = stage === 'building'
      ? 'Generating…'
      : stage === 'failed'
        ? 'That one did not build — press again for another'
        : 'Swap to a brand-new procedurally generated course';
    // Both cards carry the control, and neither knows about the other: a player
    // pauses mid-run *or* finishes one, and whichever card they are looking at
    // has to be the one that speaks.
    for (const panel of [this.pause, this.results]) {
      const button = panel.querySelector<HTMLButtonElement>('[data-menu="new-route"]');
      if (button) button.disabled = stage === 'building';
      const target = panel.querySelector<HTMLElement>('[data-note="new-route"]');
      if (target && target.textContent !== note) target.textContent = note;
    }
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
    const generated = view.world === 'generated';
    const line = generated ? `Fresh route · ${view.seed}` : WORLD_LINES[view.world];
    for (const panel of [this.title, this.pause, this.routes]) {
      const node = panel.querySelector<HTMLElement>('[data-menu="world"]');
      if (node && node.textContent !== line) node.textContent = line;
      if (node) node.dataset.generated = generated ? 'true' : 'false';
    }

    // Both of these are answers to "what else can I do from here", and both are
    // wrong when the world already is what they offer.
    //
    // **The city button asks whether this *is* the city, not whether the world
    // was generated**, which used to be the same question and stopped being one
    // at M23. On the circuit the old test hid the one control that leads back
    // to the hand-built world, which is exactly where a player who arrived by
    // pressing Track Day would look for it.
    const city = this.routes.querySelector<HTMLElement>('[data-menu="ride-city"]');
    if (city) city.hidden = view.world === 'slice';
    // The copy button stays generated-only: a link is only worth copying when
    // it carries a seed somebody else could not otherwise guess.
    const copy = this.routes.querySelector<HTMLElement>('[data-menu="copy-link"]');
    if (copy) copy.hidden = !generated;
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
   * Five states rather than a boolean, because each calls for different
   * advice — telling a player who unticked the box to press a button to wake
   * the pad would be advice the game ignores. Written at construction and on
   * every change (M10 QA, F4): the paragraph used to be filled only by a
   * connection *transition*, so a player who opened Settings with no pad ever
   * attached read an empty line. `unsupported` joined at the Linux QA pass:
   * a browser can report a pad without the standard button layout (Firefox on
   * Linux is the documented case), and that pad looked exactly like no pad —
   * the one situation where the right advice is a different browser rather
   * than a different cable. `lost` joined at M25 Phase 4, and it is the only
   * one that names a *seat*: a couch player's pad dying holds their place
   * rather than dissolving it, and the line has to say so or the game looks
   * like it forgot them.
   */
  setGamepadStatus(
    status: 'connected' | 'searching' | 'disabled' | 'unsupported' | 'lost',
    seat: number = 0,
  ): void {
    const node = this.settings.querySelector<HTMLElement>('[data-menu="gamepad-status"]');
    if (node) {
      node.textContent = status === 'connected'
        ? 'Gamepad connected. The keyboard keeps working at the same time.'
        : status === 'disabled'
          ? 'Gamepad input is switched off. Tick the box to use a pad.'
          : status === 'lost'
            ? `Player ${seat + 1}'s gamepad disconnected. Their seat is being held — `
              + 'reconnect a pad and press A or Start to take it back.'
            : status === 'unsupported'
              ? 'A controller is connected, but this browser reports it without the '
                + 'standard button layout, so the game cannot read it safely. '
                + 'Another browser may report it correctly.'
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
    this.couch.remove();
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
    if (screen === 'couch') return this.couch;
    return null;
  }

  /**
   * The control the gamepad's cursor is sitting on — M25 Phase 5 QA.
   *
   * **`:focus-visible` is a heuristic about *keys*, and a gamepad presses
   * none.** The ring below `game.css`'s focus rule is granted by the browser
   * only when it believes the human is navigating by keyboard, and every
   * engine re-arms that belief differently: Chrome takes any keydown at all,
   * even one this game swallows; Firefox takes only a focus-moving Tab. A pad
   * emits neither. So one mouse click on a menu button ends the ring for the
   * rest of the session and the pad walks an invisible cursor — reported from
   * Firefox on Ubuntu, and reproducible in Chromium the moment nobody happens
   * to touch a key.
   *
   * The fix is the one this file already uses for the couch cards: the script
   * writes an attribute and the stylesheet owns the consequence. Nothing here
   * asks a browser what it thinks the player is doing.
   *
   * Deliberately *not* set for every scripted focus. A panel opened with the
   * mouse must still come up ringless — that is the whole reason the rule is
   * `:focus-visible` and not `:focus` — so the marker follows `padDriving`,
   * which is a fact about who is steering rather than about how focus moved.
   */
  private padCursor: HTMLElement | null = null;
  /**
   * Whether the gamepad is the device currently walking the menus.
   *
   * True from any pad menu action (`navigate`/`confirm` are reachable from
   * nothing else — `Game.handleMenuAction` is wired only to `onMenuAction`),
   * false again the moment a real pointer or a real key arrives. A synthetic
   * click does not count, because `confirm()` produces one on the pad's behalf
   * and a pad confirming a button must not hand the cursor to the mouse.
   */
  private padDriving = false;

  /** Move the drawn cursor, or take it away. Idempotent. */
  private setPadCursor(node: HTMLElement | null): void {
    if (this.padCursor === node) return;
    if (this.padCursor !== null) delete this.padCursor.dataset.padCursor;
    this.padCursor = node;
    if (node !== null) node.dataset.padCursor = 'true';
  }

  /** The pointer or the keyboard has taken over; the pad's ring goes away. */
  private releasePadCursor(): void {
    this.padDriving = false;
    this.setPadCursor(null);
  }

  /**
   * Where a panel starts, which is **not always its first focusable node**.
   *
   * DOM order is the default and was the whole rule until the owner's
   * 2026-08-31 couch ride. The couch mode switch is drawn *above* the actions
   * on the pause card and the results card — the right place for it to read —
   * so "the first focusable node" put the cursor on **Free ride** while a race
   * was running, one confirm press away from ending everybody's race for them.
   * A player pausing on the last lap and pressing A to carry on lost the race.
   *
   * So a panel may name where focus starts, and the two that carry a control
   * which changes what the whole room is doing must. `data-focus-first` is
   * honoured only while it is on screen and focusable, so a named button that
   * is hidden or disabled falls back to the DOM order rather than swallowing
   * the focus; a panel that names nothing behaves exactly as it always has.
   */
  private focusFirst(panel: HTMLElement | null): void {
    if (panel === null) return;
    const shown = (node: Element): node is HTMLElement =>
      node instanceof HTMLElement && node.offsetParent !== null;
    const named = panel.querySelector('[data-focus-first]');
    const first = (named !== null && shown(named) && named.matches(focusableSelector()) ? named : null)
      ?? [...panel.querySelectorAll(focusableSelector())].find(shown)
      ?? null;
    first?.focus();
    // A pad that opened this panel keeps its cursor across the boundary; a
    // mouse that opened it gets the ringless panel `:focus-visible` promises.
    this.setPadCursor(this.padDriving ? first : null);
  }

  private readonly onClick = (event: MouseEvent): void => {
    // **`detail > 0` is what makes this a *pointer* click.** `confirm()` calls
    // `.click()` on the pad's behalf and a keyboard Enter on a focused button
    // produces one too; both arrive here with `detail === 0`. Clearing on
    // those would mean the pad switched its own cursor off every time it
    // pressed A, which is the bug this method is helping to fix.
    if (event.detail > 0) this.releasePadCursor();

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
    // -- M23 -----------------------------------------------------------------
    else if (action === 'track-day') this.callbacks.onStartTrackDay();
    else if (action === 'end-session') this.callbacks.onEndSession();
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
    // -- M20 -----------------------------------------------------------------
    else if (action === 'new-route') this.callbacks.onNewRoute();
    // -- M14.5 ---------------------------------------------------------------
    else if (action === 'riders') this.callbacks.onOpenRiders();
    else if (action === 'riders-back') this.callbacks.onCloseRiders();
    // -- M25 Phase 5 ---------------------------------------------------------
    else if (action === 'couch') this.callbacks.onOpenCouch();
    else if (action === 'couch-back') this.callbacks.onCloseCouch();
    else if (action === 'couch-start') this.callbacks.onStartCouch();
    // -- M26 Phase 5, and its 2026-08-27 ride repairs ------------------------
    // **Two actions for two verbs, and they are dispatched apart on purpose.**
    // The join panel's chooser records what the session *will* be; the pause
    // menu's chooser changes what a running one *is*. One handler with a
    // "which screen am I on" branch would be the same code deciding a question
    // the DOM has already answered.
    else if (action === 'couch-mode' || action === 'switch-mode') {
      const ride = target.closest<HTMLElement>('[data-couch-mode]')?.dataset.couchMode;
      if (ride !== undefined) {
        if (action === 'couch-mode') this.callbacks.onSetCouchRide(ride);
        else this.callbacks.onSwitchCouchRide(ride);
      }
    }
    else if (action === 'couch-prev' || action === 'couch-next') {
      const seat = target.closest<HTMLElement>('[data-couch-step]')?.dataset.couchStep;
      if (seat !== undefined) {
        this.callbacks.onCycleCouchRider(Number(seat), action === 'couch-next' ? 1 : -1);
      }
    }
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

    // A real key means a human at the keyboard, and from here the browser's
    // own `:focus-visible` draws the ring — so the pad's explicit one must go,
    // or two cursors would be lit at once the moment somebody reached over.
    this.releasePadCursor();

    // **A claim press is not also a button press** — M25 Phase 5.
    //
    // The browser turns Enter and Space on a focused `<button>` into a click,
    // and the keyboard layer turns the same keys into a seat claim. While a
    // device holds no seat those are the same physical press meaning one
    // thing, and letting both happen is how the second player's "I'm in"
    // also fires whatever button had focus — which, at the exact moment the
    // panel arms, is Start.
    //
    // `preventDefault` and **not** `stopPropagation`: the claim itself lives
    // downstream in `input/keyboard.ts`, and killing the event here would
    // suppress the very thing this is protecting. The flag is cleared the
    // moment the keyboard holds a seat, so the next Enter is an ordinary
    // confirm — see `app/Game.ts`'s `claimsFirst`.
    if (this.claimKeys && CLAIM_CODES.has(event.code)) {
      event.preventDefault();
      return;
    }

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
      // The join panel goes back the way every other openable panel does. The
      // guest seats leave with it, which is `app/Game.ts`'s business.
      else if (this.screen === 'couch') this.callbacks.onCloseCouch();
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
    const focusable = this.focusableControls(document.activeElement);
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
   * The open panel's operable controls, in DOM order.
   *
   * One census for `navigate`, `confirm`, `trapFocus` and `focusFirst`, and
   * the filters are the M24 lesson rather than tidiness: the selector's old
   * bare `[href]` clause matched the SVG `<image>` inside Maribel's card
   * portrait — an `SVGImageElement`, which is not focusable, so the pad's
   * walk called `.focus()` on it, nothing happened, and the rider chooser
   * jammed on the card beside it with Done unreachable (§4.6). The
   * `instanceof HTMLElement` filter makes that class of element structurally
   * impossible whatever the selector says, and `offsetParent` keeps hidden
   * controls out exactly as before. `keep` lets the Tab trap retain a focused
   * control that is mid-transition.
   */
  private focusableControls(keep: Element | null = null): HTMLElement[] {
    const panel = this.panelFor(this.screen);
    if (!panel) return [];
    return [...panel.querySelectorAll(focusableSelector())]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => node.offsetParent !== null || node === keep);
  }

  /**
   * Move or adjust the real focused control from a gamepad menu direction.
   *
   * The Gamepad API does not synthesize keyboard events, so the browser cannot
   * move DOM focus on the pad's behalf. What a direction *means* is
   * geometric, not list-shaped — the M24 §4.6 report ("only left and right,
   * not up and down") came from walking the one-dimensional Tab order for
   * every direction, which reads as vertical movement only while a panel is a
   * single column, and the rider chooser is a card grid:
   *
   *   - **up/down move between the visual rows** the player sees, landing on
   *     the horizontally nearest control, wrapping at the ends
   *     (`ui/menuRows.ts` owns the arithmetic, headlessly pinned);
   *   - **left/right first adjust the focused control** (a select, slider or
   *     checkbox), then move within the row, and deliberately stop at its
   *     edge — bleeding into vertical movement is the confusion this fixes;
   *   - a panel with focus elsewhere admits the walk at its first or last
   *     control, exactly as before.
   */
  navigate(action: 'up' | 'down' | 'left' | 'right'): void {
    // Reachable from the gamepad and nothing else: the keyboard walks menus by
    // native Tab, which the browser rings for us.
    this.padDriving = true;
    const focusable = this.focusableControls();
    if (focusable.length === 0) return;

    const active = document.activeElement;
    if ((action === 'left' || action === 'right') && active instanceof HTMLElement) {
      if (this.adjustControl(active, action === 'right' ? 1 : -1)) return;
    }

    const current = focusable.indexOf(active as HTMLElement);
    const forward = action === 'down' || action === 'right';
    let next: number;
    if (current < 0) {
      next = forward ? 0 : focusable.length - 1;
    } else {
      const rects: ControlRect[] = focusable.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      if (action === 'up' || action === 'down') {
        next = rowStep(rects, current, action === 'down' ? 1 : -1);
      } else {
        const beside = rowNeighbour(rects, current, action === 'right' ? 1 : -1);
        if (beside === null) return;
        next = beside;
      }
    }
    focusable[next].focus();
    this.setPadCursor(focusable[next]);
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
    // Same door as `navigate`, and it matters for the panel this press opens:
    // `focusFirst` reads `padDriving` to decide whether the new panel arrives
    // with a cursor on it.
    this.padDriving = true;
    const focused = document.activeElement;
    if (this.seedField !== null && focused === this.seedField) {
      this.callbacks.onRideRoute(this.seed);
      return;
    }
    // A `.click()` on a native `<select>` opens nothing and changes nothing in
    // any browser this game runs in, and on a checkbox it toggles only by the
    // grace of the default click action — which is why the owner's §4.6
    // report named the quality and speed-unit dropdowns as "not accepting the
    // action button" (M24). Confirm on a select means what a click cannot:
    // step to the next option, wrapping, through the same `input` event the
    // pointer path fires. Everything else keeps the click, which is right for
    // buttons and cards.
    if (focused instanceof HTMLSelectElement) {
      if (focused.options.length === 0) return;
      focused.selectedIndex = (focused.selectedIndex + 1) % focused.options.length;
      focused.dispatchEvent(new Event('input', { bubbles: true }));
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
/**
 * What an empty seat is waiting for, named as buttons a person can press.
 *
 * **It names only what is actually left.** Seats are not assigned — whoever
 * presses first sits first — so the first empty seat offers both devices; the
 * second offers whatever the first did not take. The `none` line is the one
 * that matters most and is the easiest to leave out: on a machine with one
 * keyboard and no pad the panel can never arm, and a screen that goes on
 * saying "press Enter" beside a seat the keyboard is already holding is a
 * screen the player concludes is broken.
 */
/**
 * One piece of a seat's status line: prose, or a button to press.
 *
 * **A key is a different thing from a sentence about a key** — the owner's
 * 2026-08-27 ride: *"the press A or start or Enter thing… its just so plaintext
 * like…. not everyone is a hardcore gamer that knows how games function without
 * looking at the screen."* A player scanning this panel has to find the thing
 * to press, and the thing to press was the same weight as the words around it.
 *
 * Segments rather than markup so the line stays one composed value with one
 * author (M12 Phase 4's rule): the panel decides that `A` is drawn as a cap and
 * a screen reader still hears the sentence, because `renderSeatLine` writes the
 * same words either way. That equality is what lets `setCouchView` keep
 * comparing plain text before it redraws.
 */
type SeatLineSegment = string | { readonly key: string };

const COUCH_SPARE_LINES: Readonly<Record<CouchSpare, readonly SeatLineSegment[]>> = Object.freeze({
  both: Object.freeze<SeatLineSegment[]>([
    'Empty — press ', { key: 'A' }, ' or ', { key: 'Start' },
    ' on a gamepad, or ', { key: 'Enter' }, ' on the keyboard.',
  ]),
  pad: Object.freeze<SeatLineSegment[]>([
    'Empty — press ', { key: 'A' }, ' or ', { key: 'Start' }, ' on a gamepad.',
  ]),
  keyboard: Object.freeze<SeatLineSegment[]>([
    'Empty — press ', { key: 'Enter' }, ' on the keyboard.',
  ]),
  none: Object.freeze<SeatLineSegment[]>([
    'Empty — plug in a gamepad, then press ', { key: 'A' }, ' or ', { key: 'Start' }, ' on it.',
  ]),
});

/**
 * What one seat's status line says — M25 Phase 5.
 *
 * Four states since M27 Phase 1: a chair that is not out, waiting for a device
 * that went away, empty, or held by something that is named.
 */
function couchSeatLine(seat: CouchSeatView, spare: CouchSpare): readonly SeatLineSegment[] {
  // **Before the empty line, because it is a different sentence.** A card for
  // a chair the room cannot fill must not print "press A to sit down": there
  // is no spare device, that is precisely why the chair is not out, and the
  // instruction would be a promise the panel cannot keep. It says what would
  // change the answer instead.
  if (!seat.seated) {
    return ['Free for a third or fourth player — plug in another gamepad.'];
  }
  if (seat.awaiting) {
    return [
      'Controller lost — press ', { key: 'A' }, ' on a pad, or ', { key: 'Enter' },
      ', to take this seat back.',
    ];
  }
  if (seat.device === null) return COUCH_SPARE_LINES[spare];
  if (seat.device === 'keyboard') return ['Keyboard. Ready.'];
  return [`${seat.padNumber === null ? 'Gamepad' : `Gamepad ${seat.padNumber}`}. Ready.`];
}

/** The same line as plain prose — what a screen reader hears, and what a redraw compares. */
function seatLineText(line: readonly SeatLineSegment[]): string {
  return line.map((part) => (typeof part === 'string' ? part : part.key)).join('');
}

/**
 * Draw one status line into its paragraph, keys as caps.
 *
 * Built as nodes rather than assigned as markup: the strings here are this
 * file's own constants today, and a status line is exactly the kind of place a
 * later edit interpolates a device name into. `textContent` is what a caller
 * compares first, so this only ever runs on a line that really changed.
 */
function renderSeatLine(into: HTMLElement, line: readonly SeatLineSegment[]): void {
  into.replaceChildren(...line.map((part) => {
    if (typeof part === 'string') return document.createTextNode(part);
    const cap = document.createElement('kbd');
    cap.className = 'euc-key';
    cap.textContent = part.key;
    return cap;
  }));
}

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
  // `a[href]`, never bare `[href]`: an SVG `<image href>` — Maribel's card
  // mark — matched the bare clause and jammed the pad's walk on the rider
  // chooser (M24 §4.6). `focusableControls` filters non-HTML elements out
  // structurally as well; the selector stays honest so the two never argue.
  return 'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
    + 'a[href], [tabindex]:not([tabindex="-1"])';
}
