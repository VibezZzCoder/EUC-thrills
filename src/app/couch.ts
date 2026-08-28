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
 * How many seats a couch session has — two, and stage 1 says so out loud.
 *
 * A named constant rather than a literal `2` scattered through the panel, the
 * view builder and the specs, because the number is a *decision* (§25.6: no
 * four-player couch until the render budget and the input model have been
 * re-measured for it) rather than an accident of the current markup.
 */
export const COUCH_SEATS = 2;

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
 * Somebody other than the rider named — q68's distinct-characters rule.
 *
 * The default the guest wears when nobody has chosen, and the re-dress the
 * player triggers by picking the rider already sitting beside them. Derived
 * from the roster rather than written down, so the day a sixth character ships
 * this keeps meaning "not that one" instead of naming a rider who may no
 * longer be first.
 *
 * The fallback is the roster's own first entry, unreachable while more than
 * one character exists and present because a total function is easier to
 * reason about than one that cannot fail *yet*.
 */
export function guestBeside(taken: CharacterId): PlayableCharacterId {
  return CHARACTER_IDS.find((id) => id !== taken) ?? CHARACTER_IDS[0];
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
 */
export function cycleGuest(
  current: PlayableCharacterId,
  taken: CharacterId,
  delta: 1 | -1,
): PlayableCharacterId {
  const count = CHARACTER_IDS.length;
  const from = CHARACTER_IDS.indexOf(current);
  // A `current` the roster does not contain is not a reason to throw at a
  // player pressing an arrow key; start the walk from the player's own seat so
  // the first step lands on a real neighbour.
  const start = from >= 0 ? from : CHARACTER_IDS.indexOf(taken as PlayableCharacterId);
  for (let step = 1; step <= count; step += 1) {
    const index = (((start + delta * step) % count) + count) % count;
    const id = CHARACTER_IDS[index];
    if (id !== taken) return id;
  }
  return current;
}

/**
 * What a couch session is *for* — M26 Phase 5, q78.
 *
 * **Two players is a session shape, not a mode** (M25's finding), so this is not
 * a sixth ride: it names which of the existing rides the two seats are about to
 * carry. `freeRide` and `knockabout` are the two the game has now, and the
 * couch race is a definite with a chosen venue that is priced as its own
 * milestone (§26.7) — it joins this list and the panel's own control when it is
 * built, without a new menu.
 *
 * Held as couch-session state on `Game`, never a `GameOption`, on the contact
 * toggle's exact terms: what a session is for is not a saved preference, and
 * the options firewall keeps `simulation/` free of both.
 */
export type CouchRide = 'freeRide' | 'knockabout';

/**
 * The rides a couch may be started into, in the order the panel offers them.
 *
 * A list rather than a union walked by hand, because the control, the default
 * and the specs all have to agree about what the choices are — and the day a
 * third one lands, a list is one edit and a hand-walked union is three.
 */
export const COUCH_RIDES: readonly CouchRide[] = Object.freeze(['freeRide', 'knockabout']);

/**
 * What each ride is called on the panel.
 *
 * The title screen's own words for the same two rides, because a player who
 * chose "Knockabout" from the title and "Knockabout" from the join panel should
 * not have to work out whether they are the same thing.
 */
export const COUCH_RIDE_LABELS: Readonly<Record<CouchRide, string>> = Object.freeze({
  freeRide: 'Free ride',
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
