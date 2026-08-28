/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The application state machine — `docs/PLANS.md` §3.2, finished at M9.
 *
 * `Boot → Loading → FreeRide ⇄ Paused` has existed since M1 as three booleans
 * scattered across `Game.ts`. This file makes every state explicit and gives
 * each one the declaration §3.2 asks for: whether simulation advances, what
 * input is live, what the player is looking at, and which states it may go to
 * next. The project's style rule is the reason — loading, menus, riding,
 * pause, and results are **states, not scattered booleans** — but the concrete
 * payoff is that "is the rider allowed to accelerate right now?" has exactly
 * one answer, in one place, instead of being the conjunction of four flags
 * that four different features each thought they owned.
 *
 * **`riderSelect` was absent by owner decision (2026-08-05) and returned at
 * M14.5, on exactly the condition that decision named.** The rule was that a
 * state offering a single option is navigation the player pays for and gets
 * nothing back — "it returns when a second rider does". Trollina is that second
 * rider, so it is here, built to the same shape `routes` is: reachable only
 * from the title, leading only back to it, and never reachable from a pause.
 *
 * It leads *only* to the title, and that is the one field where it and `routes`
 * differ. Choosing a world is choosing where to ride and can sensibly start the
 * ride; choosing a rider is choosing what to look like, and a chooser that
 * launched a ride would make trying the other character a round trip through a
 * ride the player did not ask for.
 *
 * **`challenge` and `results` arrived at M10**, and they are states rather than
 * a flag on `freeRide` for the reason this file exists at all. "Is a timed run
 * happening" would otherwise be a sixth boolean sitting beside the five this
 * machine replaced, and every consumer of it — the HUD lane, the audio gate,
 * the reset key's meaning, the pause menu's resume target — would carry its own
 * copy of the answer. Riding is riding; what differs is whether a clock is
 * attached, and that difference is worth a state because *four* other systems
 * change behaviour with it.
 *
 * No DOM, no game objects, no imports: the whole machine is `node --test`
 * territory, which is what lets the transition table be asserted exhaustively
 * rather than sampled through a browser.
 */

export type AppStateId =
  | 'boot'
  | 'loading'
  | 'title'
  | 'settings'
  | 'routes'
  | 'riderSelect'
  | 'couchJoin'
  | 'freeRide'
  | 'challenge'
  | 'trackDay'
  | 'knockabout'
  | 'chase'
  | 'paused'
  | 'results';

export const APP_STATES: readonly AppStateId[] = [
  'boot',
  'loading',
  'title',
  'settings',
  'routes',
  'riderSelect',
  'couchJoin',
  'freeRide',
  'challenge',
  'trackDay',
  'knockabout',
  'chase',
  'paused',
  'results',
];

/**
 * The states in which the player is on the wheel.
 *
 * Exported because three separate consumers need to ask "is this a ride?" and
 * the alternative is three separate lists that drift. `paused` is deliberately
 * absent: a paused game is a ride the player has stepped out of, which is why
 * `AppState.rideReturn` exists to remember which one.
 */
export const RIDE_STATES: readonly AppStateId[] = [
  'freeRide', 'challenge', 'trackDay', 'knockabout', 'chase',
];

export function isRideState(state: AppStateId): boolean {
  return RIDE_STATES.includes(state);
}

/**
 * What a state means, in the terms `docs/PLANS.md` §3.2 requires each one to
 * declare.
 */
export interface AppStateSpec {
  readonly id: AppStateId;
  /**
   * Whether the fixed step runs.
   *
   * The pause contract from §8.2 is "a pause that genuinely stops simulation",
   * and it is genuinely stopped here rather than merely hidden: the loop is
   * told not to run. The QA bridge's `advance()` still steps a paused game,
   * which is the bridge's documented contract and not a hole in the pause.
   */
  readonly simulates: boolean;
  /**
   * Whether throttle, steering, hop, and crouch reach the controller.
   *
   * False everywhere the player is looking at a menu — including `title`,
   * where the wheel is on screen and a stray keypress would otherwise ride it
   * off into the distance behind the menu.
   */
  readonly acceptsRideInput: boolean;
  /** Whether the HUD is drawn. */
  readonly showsHud: boolean;
  /** Whether a menu surface is up, which is also what says "trap the focus". */
  readonly showsMenu: boolean;
  /**
   * Whether entering this state is an input-reset moment (master §8.2).
   *
   * Every menu boundary is one. A key held as the player hits Escape never
   * delivers its keyup to the game, so without this the rider resumes at full
   * throttle the moment the menu closes — the exact bug the blur handler was
   * written for, arriving through a different door.
   */
  readonly resetsInput: boolean;
  readonly successors: readonly AppStateId[];
}

/**
 * The transition table.
 *
 * Written as data so the tests can walk all of it. Two edges are worth
 * pointing at because they look asymmetric and are not:
 *
 *   - `settings` lists both `title` and `paused` as successors, because it is
 *     reachable from both and must return where it came from. Which one is
 *     remembered by the machine below, not chosen by the settings screen.
 *   - `freeRide → title` exists (quit from the pause menu goes through
 *     `paused`), but `title → paused` does not: pausing something that is not
 *     running is meaningless, and allowing it would let a player reach the
 *     resume button with no ride to resume.
 *   - `paused` lists **both** rides as successors from M10, for exactly the
 *     reason `settings` lists two returns: Resume has to mean two different
 *     things and neither the button nor the player should have to know which.
 *     `rideReturn` remembers, and `resumeRide()` is the move.
 *   - `paused → results` arrived at M23 and is the only edge from a menu to an
 *     outcome. Every other ride ends by crossing something or by running a
 *     clock down; a track day ends when the player decides they are done, and
 *     the place a player decides that is the pause card's "End session". The
 *     alternative — routing it back through `trackDay` and out again inside one
 *     tick — would be two transitions describing one decision, and the second
 *     would be reporting a ride nobody resumed.
 *   - `results → challenge` is the retry, and it is the only edge into a ride
 *     that is not from the title or a pause. `results → freeRide` is absent on
 *     purpose: a player who wants to stop being timed goes to the title, which
 *     is one more click and removes any chance of "I pressed a button and my
 *     run silently stopped counting".
 */
export const APP_STATE_SPECS: Readonly<Record<AppStateId, AppStateSpec>> = Object.freeze({
  boot: Object.freeze({
    id: 'boot' as AppStateId,
    simulates: false,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: false,
    resetsInput: false,
    successors: Object.freeze(['loading'] as AppStateId[]),
  }),
  loading: Object.freeze({
    id: 'loading' as AppStateId,
    simulates: false,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: false,
    resetsInput: false,
    successors: Object.freeze(['title'] as AppStateId[]),
  }),
  title: Object.freeze({
    id: 'title' as AppStateId,
    // The world is live behind the title card — the wheel sits at the spawn in
    // the real level rather than in front of a still image, which is most of
    // why the game looks like itself before the player has touched anything.
    // Simulation runs so the camera settles and the scene is not frozen; ride
    // input does not, so nothing rides away behind the menu.
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    // **Order is the Tab order and the gamepad's walk order**, and a browser
    // spec presses D-pad down a fixed number of times and names the stop it
    // expects. `riderSelect` goes last for that reason as much as for its own:
    // riding is why anyone opened the game.
    successors: Object.freeze(
      [
        'freeRide', 'couchJoin', 'challenge', 'trackDay', 'knockabout', 'chase',
        'settings', 'routes', 'riderSelect',
      ] as AppStateId[],
    ),
  }),
  settings: Object.freeze({
    id: 'settings' as AppStateId,
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    successors: Object.freeze(['title', 'paused'] as AppStateId[]),
  }),
  /**
   * Choosing a world — M12 Phase 4.
   *
   * A sibling of `settings` in every field and a sibling of nothing else in
   * what it means. Settings changes how the game presents itself; this changes
   * **which place the player is about to ride**, which is level identity rather
   * than a preference — so a seed reaches the game through this state and never
   * through `app/options.ts` (`AGENTS.md` invariant 5).
   *
   * It is reachable only from the title, and it is deliberately not reachable
   * from a pause. Swapping the world underneath a ride would mean disposing
   * the ground a rider is standing on; the same journey through the title costs
   * one more button and cannot express that.
   *
   * All three rides are successors because the panel can be opened directly
   * for free/timed riding or as Knockabout's target-bearing-world prerequisite
   * (`docs/PLANS.md` §13 q6 — generated routes are point-to-point and the time
   * trial runs on them through the unchanged checkpoint machinery).
   */
  routes: Object.freeze({
    id: 'routes' as AppStateId,
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    successors: Object.freeze(
      ['title', 'freeRide', 'challenge', 'knockabout', 'chase'] as AppStateId[],
    ),
  }),
  /**
   * Choosing a rider — M14.5, and the state this file has been holding open
   * since 2026-08-05.
   *
   * Identical to `routes` in every flag and different in exactly one successor
   * list. The world stays live behind it for the same reason it stays live
   * behind the title: the chooser swaps the rider *in the scene*, so a player
   * picking Trollina watches Trollina appear on the wheel behind the panel
   * rather than reading a description of her.
   */
  riderSelect: Object.freeze({
    id: 'riderSelect' as AppStateId,
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    successors: Object.freeze(['title'] as AppStateId[]),
  }),
  /**
   * Sitting down together — M25 Phase 5, and the state that is a *session
   * shape* rather than a mode.
   *
   * A sibling of `riderSelect` in every flag, and that is the point rather
   * than a copy. **There is no sixth ride here on purpose** (§25.9): "two
   * players" is who is riding, not what the ride is for, and this project's
   * own principle — *a mode is what a ride is for* — is what refused the
   * plan's first draft of a `twoPlayerFreeRide` row. So the join panel is a
   * menu that hands a two-seat session to the ride that already exists, and a
   * future couch chase reuses `chase` with two seats rather than breeding
   * `twoPlayerChase`.
   *
   * It differs from `riderSelect` in exactly one successor, and for the
   * mirror of that state's own reason. Choosing a rider is choosing what to
   * look like, so a chooser that launched a ride would make trying the other
   * character a round trip through a ride nobody asked for. Sitting a second
   * player down *is* asking for the ride: the panel's whole job is to hold
   * both players until they are both holding something, and the moment they
   * are, the only thing left to do is go.
   *
   * **`freeRide` and not the other four.** Stage 1 is two riders in one world
   * with nothing being refereed (§25.6): a couch chase, race or Knockabout is
   * real design rather than a second seat, and each one is named in the plan
   * as its own future milestone.
   */
  couchJoin: Object.freeze({
    id: 'couchJoin' as AppStateId,
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    // **Four exits since M26 Phase 5, and the list is the feature** — q78. The
    // join panel used to lead exactly one place, because a couch session was
    // free ride by definition; it now chooses what it is *for*, so `knockabout`
    // is a destination and `routes` is the answer `enterKnockabout` gives a
    // world with no discs in it. Enumerated here rather than left to `goTo` to
    // discover, because this table is where "what may follow what" is decided
    // and a transition missing from it fails silently: the button clicks, the
    // panel stays, and nothing says why.
    successors: Object.freeze(['title', 'freeRide', 'knockabout', 'routes'] as AppStateId[]),
  }),
  freeRide: Object.freeze({
    id: 'freeRide' as AppStateId,
    simulates: true,
    acceptsRideInput: true,
    showsHud: true,
    showsMenu: false,
    resetsInput: true,
    successors: Object.freeze(['paused', 'title'] as AppStateId[]),
  }),
  /**
   * A timed run — M10.
   *
   * Identical to `freeRide` in every field, and that is the point rather than a
   * missed abstraction: **the ride is the same ride**. The wheel, the camera,
   * the input, and the physics do not know a clock is running, which is what
   * makes a personal best comparable with one set in another session and what
   * keeps the options firewall's promise that two players' rides are the same.
   * What differs is only which systems are *listening* — the challenge clock,
   * the HUD lane, the ghost recorder — and every one of those lives outside
   * `simulation/`.
   *
   * It leaves to `results` when the finish gate is crossed, and that edge is
   * the only one the player does not press a button for.
   */
  challenge: Object.freeze({
    id: 'challenge' as AppStateId,
    simulates: true,
    acceptsRideInput: true,
    showsHud: true,
    showsMenu: false,
    resetsInput: true,
    successors: Object.freeze(['paused', 'results', 'title'] as AppStateId[]),
  }),
  /**
   * Track Day — M23, the fifth ride.
   *
   * Identical to `challenge` in every field, which by the fifth application is
   * the point rather than a copy: **a mode is what a ride is for.** The wheel,
   * the camera, the input and the physics do not know a lap is being timed, so
   * a rider who is good in free ride is good here, and a lap set on the circuit
   * is comparable with one set next month because nothing about the machine
   * changed in between.
   *
   * It reaches `results` for the same reason the timed run does, and it is the
   * one ride that gets there **without crossing a line**: a circuit has no
   * finish, so a session ends when the player pits — which is a button on the
   * pause card, and is why `paused` lists `results` as a successor.
   */
  trackDay: Object.freeze({
    id: 'trackDay' as AppStateId,
    simulates: true,
    acceptsRideInput: true,
    showsHud: true,
    showsMenu: false,
    resetsInput: true,
    successors: Object.freeze(['paused', 'results', 'title'] as AppStateId[]),
  }),
  /**
   * Knockabout — M14, the third ride.
   *
   * Identical to `challenge` in every field, which is the point: a mode is what
   * the ride is *for*, not a different kind of being on a wheel. The ride is
   * bit-identical in all three — no value the mode owns reaches the controller
   * — so a rider who is good in free ride is good here.
   *
   * It reaches `results` for the same reason the timed run does: the end of a
   * run has to tell the player how they did, and §13 q14 makes that a score out
   * of a total rather than a time.
   */
  knockabout: Object.freeze({
    id: 'knockabout' as AppStateId,
    simulates: true,
    acceptsRideInput: true,
    showsHud: true,
    showsMenu: false,
    resetsInput: true,
    successors: Object.freeze(['paused', 'results', 'title'] as AppStateId[]),
  }),
  /**
   * The police chase — M18, the fourth ride.
   *
   * Identical to `knockabout` in every field, which by now is the point rather
   * than a copy: **a mode is what a ride is for.** The wheel, the camera, the
   * input and the physics do not know a cop is behind them, and the cop rides
   * the same controller the player does — so a rider who is good in free ride
   * is good here, and the mode's difficulty lives entirely in what is chasing
   * rather than in a different kind of riding.
   *
   * It reaches `results` because a run ends with an outcome the player needs
   * told: escaped, or busted, and how long they lasted (`docs/PLANS.md` §13
   * q24, q25).
   */
  chase: Object.freeze({
    id: 'chase' as AppStateId,
    simulates: true,
    acceptsRideInput: true,
    showsHud: true,
    showsMenu: false,
    resetsInput: true,
    successors: Object.freeze(['paused', 'results', 'title'] as AppStateId[]),
  }),
  paused: Object.freeze({
    id: 'paused' as AppStateId,
    simulates: false,
    acceptsRideInput: false,
    // The HUD stays up behind the pause menu: a player pausing to read their
    // speed should not have the number they paused to read disappear. From M10
    // that includes the run clock, which is the number a player pausing during
    // a timed run is most likely to be looking at.
    showsHud: true,
    showsMenu: true,
    resetsInput: true,
    successors: Object.freeze(
      [
        'freeRide', 'challenge', 'trackDay', 'knockabout', 'chase',
        'settings', 'results', 'title',
      ] as AppStateId[],
    ),
  }),
  /**
   * The run is over and the numbers are on screen — M10.
   *
   * **Simulation keeps running behind the card**, exactly as it does behind the
   * title. The player has just crossed a line at speed and the wheel should
   * roll to a stop in front of them rather than freezing mid-carve the instant
   * the panel appears; the results are about a ride that happened, and a
   * snap-frozen world reads as a crash. Ride input is off, so nothing the
   * player presses while reading their splits moves the wheel.
   *
   * The HUD is down because everything it was saying is now on the panel in
   * larger type, and two live copies of the same time is the kind of detail
   * that makes a results screen feel unfinished.
   */
  results: Object.freeze({
    id: 'results' as AppStateId,
    simulates: true,
    acceptsRideInput: false,
    showsHud: false,
    showsMenu: true,
    resetsInput: true,
    // `knockabout` joins `challenge` here at M14, and for its reason: retry is
    // the one edge into a ride that is neither the title nor a pause, and a
    // mode with a score to beat needs it exactly as much as a mode with a time.
    // **`freeRide` joined at M23, and only through New route.** The rule that
    // kept it out — a player must not be dropped into an unscored ride they did
    // not choose — is about *accidentally* leaving a scored state, and neither
    // half of it applies here: the run is already over, and the button that
    // takes this edge says on its face that it swaps the world for a generated
    // one. A generated course is point-to-point and carries no lap, so the mode
    // whose card is on screen cannot exist on it; free ride is the only honest
    // destination, and refusing the edge left the player looking at a frozen
    // card over a world that had already been replaced underneath it.
    successors: Object.freeze(
      ['challenge', 'trackDay', 'knockabout', 'chase', 'freeRide', 'title'] as AppStateId[],
    ),
  }),
});

export type AppStateListener = (to: AppStateSpec, from: AppStateSpec) => void;

export class AppState {
  private state: AppStateId;
  /**
   * Where `settings` came from.
   *
   * Held here rather than in the settings screen because "go back" is a
   * property of the navigation, not of the panel: the same Back button has to
   * mean two different things and neither the DOM nor the player should have
   * to know which.
   */
  private settingsOrigin: AppStateId = 'title';
  /**
   * Which ride a pause is a pause *of* — M10's counterpart to
   * `settingsOrigin`, and held here for the identical reason.
   *
   * Resume has to mean two different things once there are two rides, and the
   * button, the Escape key, and the gamepad's Back all press the same one. The
   * alternative — a pause menu that reads some other system's "is a run
   * active" flag — is how a player who pauses during a timed run resumes into
   * free ride with their clock silently discarded.
   *
   * It defaults to `freeRide` rather than to null so that a pause reached by a
   * path nobody anticipated resumes into the ride that has no state to lose.
   */
  private rideOrigin: AppStateId = 'freeRide';
  private readonly listeners = new Set<AppStateListener>();

  constructor(initial: AppStateId = 'boot') {
    this.state = initial;
  }

  get current(): AppStateId {
    return this.state;
  }

  get spec(): AppStateSpec {
    return APP_STATE_SPECS[this.state];
  }

  /** Where Back from the settings screen goes. */
  get settingsReturn(): AppStateId {
    return this.settingsOrigin;
  }

  /** Which ride Resume goes back to. See `rideOrigin`. */
  get rideReturn(): AppStateId {
    return this.rideOrigin;
  }

  /** Whether the player is on the wheel right now. */
  get riding(): boolean {
    return isRideState(this.state);
  }

  get simulates(): boolean {
    return this.spec.simulates;
  }

  get acceptsRideInput(): boolean {
    return this.spec.acceptsRideInput;
  }

  get showsMenu(): boolean {
    return this.spec.showsMenu;
  }

  get showsHud(): boolean {
    return this.spec.showsHud;
  }

  canGoTo(next: AppStateId): boolean {
    return APP_STATE_SPECS[this.state].successors.includes(next);
  }

  /**
   * Take a transition, or refuse it.
   *
   * Refusing rather than throwing is the right failure here: the callers are
   * a keypress and a click, and an illegal one means the player pressed
   * Escape twice quickly or a menu button raced a state change. Neither
   * deserves an exception, and both deserve to be ignored rather than acted
   * on. Returns whether the move happened, so a caller that needs to know can
   * ask.
   */
  goTo(next: AppStateId): boolean {
    if (next === this.state) return false;
    if (!this.canGoTo(next)) return false;

    const from = APP_STATE_SPECS[this.state];
    if (next === 'settings') this.settingsOrigin = this.state;
    // Recorded on the way *out* of a ride rather than on the way into a pause,
    // so that the settings screen — which is reachable from a pause and returns
    // to it — cannot overwrite which ride is waiting underneath.
    if (isRideState(this.state)) this.rideOrigin = this.state;
    this.state = next;
    const to = APP_STATE_SPECS[next];
    for (const listener of this.listeners) listener(to, from);
    return true;
  }

  /** Leave the settings screen for wherever it was opened from. */
  exitSettings(): boolean {
    if (this.state !== 'settings') return false;
    return this.goTo(this.settingsOrigin);
  }

  /**
   * Resume from a pause, into whichever ride the pause interrupted.
   *
   * The counterpart of `exitSettings`, and the only correct implementation of
   * the Resume button from M10 onward. A call site that says `goTo('freeRide')`
   * instead is a timed run thrown away.
   */
  resumeRide(): boolean {
    if (this.state !== 'paused') return false;
    return this.goTo(this.rideOrigin);
  }

  onChange(listener: AppStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}
