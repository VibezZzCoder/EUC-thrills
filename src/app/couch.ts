/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHARACTER_IDS, type CharacterId, type PlayableCharacterId } from '../data/riders.ts';

/**
 * Couch multiplayer's two decisions that are not about devices — M25 Phase 5
 * (`docs/PLANS.md` §25.5).
 *
 * `InputRouter` owns who is holding what. This owns the two questions that sit
 * either side of it: **may this machine offer a couch session at all**, and
 * **who is the guest allowed to be**. Both are pure functions of values the
 * composition root already has, which is the whole reason they are here rather
 * than inline in `Game.ts` — the plan asks for a *named, unit-tested*
 * predicate, and a boolean expression buried in a 7,000-line file is neither.
 *
 * No DOM, no `three`, no imports but the roster: `node --test` territory.
 */

/**
 * The narrowest window this game will offer a second seat on.
 *
 * **1000 because that is the width the split was measured legible at**, not
 * because it is a round number. M25 Phase 3's HUD fit contract runs in the
 * browser suite's own 1000 × 700 window, which is two 500-wide halves, and
 * every lane, warning and speed readout in both halves is asserted to fit
 * there. A larger threshold would be a number nobody had measured; a smaller
 * one would offer a split this project has never proven readable.
 *
 * **CSS pixels, and the viewport's — never the screen's.** A player with a
 * 4K monitor and a half-width browser window has a half-width split, and the
 * device pixel ratio has nothing to do with how many words fit in a lane.
 */
export const COUCH_MIN_WIDTH_PX = 1000;

/**
 * How many seats a couch session has — **four since M27 Phase 1**.
 *
 * A named constant rather than a literal `2` scattered through the panel, the
 * view builder and the specs, because the number is a *decision* rather than
 * an accident of the current markup — and this is the milestone that took it.
 *
 * §25.6 named the three things that had to happen before it could move: the
 * render budget re-measured beyond two passes, the input model answered, and
 * (the owner's addition) HUD legibility proven at quarter-screen. M27 Phase 0
 * paid all three — `QUAD_NON_LEVEL_RESERVE` measured over the five distinct
 * four-subsets of the roster, `perf-window --views 4` built for the owner's
 * own frame verdict, and a 960x540 capture of the real HUD with its worst rows
 * lit. The owner then answered q98 **(a): four seats everywhere, no per-world
 * cap** — a weaker machine on a free game is the player's problem, not a
 * reason to cap the design (2026-08-31).
 *
 * **It is not a promise that four people are present.** The join panel's claim
 * step is what proves who is actually holding something, and a session arms on
 * two or more (`Game.couchReady`); three seats are explicitly allowed and put
 * the standings card in the empty quadrant (§27.3 q95). What this number
 * bounds is how many the panel will *offer*.
 *
 * **Knockabout is deliberately not four** (q94). Its four-player rules —
 * free-for-all or teams, first to what, N-way spawn fairness against a 2.15 m
 * reach, multi-way draws — are real unopened design, so `Game` keeps arming
 * the match referee at exactly two seats. That gate lives beside the referee,
 * not here: this constant answers how wide a couch can be, not what every ride
 * on it does with the width.
 */
export const COUCH_SEATS = 4;

/** What the eligibility question is asked about. */
export interface CouchMachine {
  /** The viewport's CSS width, re-read on every layout change. */
  readonly viewportWidth: number;
  /**
   * Whether a mouse, trackpad or stylus is available.
   *
   * `(pointer: fine)`, which `Game` already has a `MediaQueryList` for in the
   * other direction.
   */
  readonly finePointer: boolean;
  /** Whether a usable gamepad has been seen at any point this session. */
  readonly padSeen: boolean;
}

/**
 * May this machine be offered a two-player couch session?
 *
 * Two clauses, and the second is deliberately **not** `touchWanted` /
 * `usesTouch` (§25.9). A touchscreen laptop that has been touched once still
 * has the keyboard and the pads a couch needs, and `Game.ts`'s own comment on
 * the hybrid case is the argument: the touch question exists to decide what to
 * *draw on the screen*, and answering "should two people be able to play"
 * with it hides the mode from the exact machine most likely to run it.
 *
 * What it asks instead is whether this machine has any device a second player
 * could hold. A fine pointer means a desktop-shaped machine, which means a
 * keyboard; a pad that has ever been seen means a pad. Neither is a promise
 * that a second device is present — the join panel's claim step is what
 * actually proves that, and it refuses to arm until both seats are held.
 *
 * The width comparison is written `>=` on the left so that a `NaN` width —
 * which is what a viewport read before layout can be — is *false* rather than
 * accidentally eligible.
 */
export function couchEligible(machine: CouchMachine): boolean {
  if (!(machine.viewportWidth >= COUCH_MIN_WIDTH_PX)) return false;
  return machine.finePointer || machine.padSeen;
}

/**
 * Somebody nobody else on the couch is already wearing — q68's
 * distinct-characters rule.
 *
 * The default a guest wears when nobody has chosen, and the re-dress the
 * player triggers by picking a rider already sitting beside them. Derived from
 * the roster rather than written down, so the day a sixth character ships this
 * keeps meaning "not one of those" instead of naming a rider who may no longer
 * be first.
 *
 * **`taken` became a list at M27 Phase 1**, because q68 was always a statement
 * about a screen rather than about a pair: two riders who look identical are
 * confusing at two seats and unusable at four, where a player has to find
 * themselves in a quadrant. The roster holds five playable characters and the
 * couch holds four seats, so distinctness is always satisfiable — but the
 * fallback below is what makes that a fact about the data rather than an
 * assumption in the code.
 *
 * The fallback is the roster's own first entry: unreachable while the roster
 * is larger than the couch, and present because a total function is easier to
 * reason about than one that cannot fail *yet*.
 */
export function guestBeside(taken: readonly CharacterId[]): PlayableCharacterId {
  return CHARACTER_IDS.find((id) => !taken.includes(id)) ?? CHARACTER_IDS[0];
}

/**
 * A distinct rider for every guest seat, given who the host is wearing —
 * M27 Phase 1.
 *
 * Returns `seats - 1` entries, one per guest, each different from the host and
 * from every guest before it: q68 stated for a whole couch rather than for a
 * pair. It is what a session that nobody has touched starts as, and it is the
 * repair applied when the host changes into somebody a guest is already
 * wearing.
 *
 * **A fold rather than `map`**, because each answer depends on the ones before
 * it — mapping `guestBeside(host)` over four seats would dress all four guests
 * identically, which is the exact defect this exists to prevent and would look
 * completely reasonable in review.
 */
export function guestRoster(host: CharacterId, seats: number): PlayableCharacterId[] {
  const taken: CharacterId[] = [host];
  const roster: PlayableCharacterId[] = [];
  for (let seat = 1; seat < seats; seat += 1) {
    const id = guestBeside(taken);
    roster.push(id);
    taken.push(id);
  }
  return roster;
}

/**
 * Step the guest's card one place along the roster, skipping the player's own.
 *
 * **The skip is what makes q68 a property of the control rather than a rule
 * the control is checked against afterwards.** A card that could land on seat
 * 0's character and then be corrected would show the player a rider they
 * cannot have and take it away again; this one simply never stops there, so
 * the panel has no invalid state to recover from.
 *
 * `delta` is ±1 and the walk wraps, which is what makes a two-rider roster —
 * one of which is taken — a control with exactly one reachable value rather
 * than an infinite loop: the search runs at most `CHARACTER_IDS.length` steps
 * and falls back to where it started.
 *
 * **`taken` became a list at M27 Phase 1**, and the skip is what keeps four
 * cards from colliding: at four seats each card steps over the three riders
 * its neighbours are wearing, so the panel still has no invalid state to
 * recover from and nobody ever sees a rider offered and then taken away. With
 * five playables and four seats the walk always finds somebody; with a full
 * couch and a smaller roster it would return `current`, which is the honest
 * answer for a control with nowhere to go.
 */
export function cycleGuest(
  current: PlayableCharacterId,
  taken: readonly CharacterId[],
  delta: 1 | -1,
): PlayableCharacterId {
  const count = CHARACTER_IDS.length;
  const from = CHARACTER_IDS.indexOf(current);
  // A `current` the roster does not contain is not a reason to throw at a
  // player pressing an arrow key; start the walk from the first taken rider so
  // the first step lands on a real neighbour.
  const start = from >= 0
    ? from
    : Math.max(0, CHARACTER_IDS.indexOf(taken[0] as PlayableCharacterId));
  for (let step = 1; step <= count; step += 1) {
    const index = (((start + delta * step) % count) + count) % count;
    const id = CHARACTER_IDS[index];
    if (!taken.includes(id)) return id;
  }
  return current;
}

/**
 * What a couch session is *for* — M26 Phase 5, q78.
 *
 * **Two players is a session shape, not a mode** (M25's finding), so this is not
 * a sixth ride: it names which of the existing rides the two seats are about to
 * carry. `freeRide` and `knockabout` are the two the game has now, and the
 * couch race joined at M27 Phase 3, exactly as §26.7 said it would: this list
 * and the panel's own control, with no new menu and **no new `AppStateId`**.
 * Choosing it loads the circuit and hands an N-seat session to the existing
 * `trackDay` row, where `Game` picks the referee by seat count — which
 * supersedes §21.9's pricing line, written three milestones before the
 * session-shape pattern existed.
 *
 * The order below is the order the panel offers them, and it is deliberate:
 * free ride first because it is the default and the quietest, the race second
 * because it is what most rooms sitting down together are here for, and
 * Knockabout last because choosing a fight is a thing you do on purpose.
 *
 * Held as couch-session state on `Game`, never a `GameOption`, on the contact
 * toggle's exact terms: what a session is for is not a saved preference, and
 * the options firewall keeps `simulation/` free of both.
 */
export type CouchRide = 'freeRide' | 'knockabout' | 'race';

/**
 * The rides a couch may be started into, in the order the panel offers them.
 *
 * A list rather than a union walked by hand, because the control, the default
 * and the specs all have to agree about what the choices are — and the day a
 * third one lands, a list is one edit and a hand-walked union is three.
 */
export const COUCH_RIDES: readonly CouchRide[] = Object.freeze(['freeRide', 'race', 'knockabout']);

/**
 * What each ride is called on the panel.
 *
 * The title screen's own words for the rides it also offers, because a player
 * who chose "Knockabout" from the title and "Knockabout" from the join panel
 * should not have to work out whether they are the same thing. Three of them
 * since the race landed, and "Race" is the one word this list adds — the title
 * has no row for it, because a race is a couch session rather than a ride one
 * person can take.
 */
export const COUCH_RIDE_LABELS: Readonly<Record<CouchRide, string>> = Object.freeze({
  freeRide: 'Free ride',
  race: 'Race',
  knockabout: 'Knockabout',
});

/**
 * The ride a fresh session starts on.
 *
 * **Free ride, and for q81's reason rather than by accident.** The contact
 * toggle resets to on every time the panel opens so that a room which forgot it
 * exists is never left wondering why riders pass through each other; the same
 * argument makes the *quietest* ride the default here. Two people sitting down
 * together get the one with no rules attached, and choosing a fight is a thing
 * you do on purpose.
 */
export const DEFAULT_COUCH_RIDE: CouchRide = 'freeRide';

/** Is this string one of the rides a couch may be started into? */
export function isCouchRide(value: string): value is CouchRide {
  return (COUCH_RIDES as readonly string[]).includes(value);
}
