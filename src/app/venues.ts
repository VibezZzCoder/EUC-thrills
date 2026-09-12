/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelId } from '../level/levels.ts';

/**
 * The places a player may choose between — M36 Phase 5 (`docs/PLANS.md`
 * §36.8).
 *
 * **A roster, not a branch.** This file says *which worlds the chooser
 * offers*; it says nothing about what any of them is like. That distinction is
 * invariant 2 (`AGENTS.md`): a venue is a `LevelPlan` producer and nothing
 * anywhere may ask *which* producer built the plan on screen in order to
 * decide behaviour. Asking "is this world lappable" is `LevelPlan.lap`'s job,
 * "can it host a fight" is `targets.count`'s and "can it host a chase" is
 * `RouteSpine`'s — all three read the plan, and all three keep working the day
 * a sixth producer is registered. What a list of ids cannot answer, this file
 * deliberately does not offer to answer.
 *
 * It is `app/couch.ts`'s neighbour in every way that matters: a small pure
 * module of session identity, no DOM, no three.js, no `GameOptions`, and a
 * `node --test` file beside it. The shape of `isVenueId` is `isCouchRide`'s
 * exactly, and for the same reason — the chooser hands `app/Game.ts` a plain
 * string and the door refuses one it does not offer, because a stale value in
 * the markup must not reach `createLevel` as a world nobody built.
 *
 * **Venue is world/session identity and never a saved option** (invariant 5).
 * Nothing here is persisted, nothing here enters `GameOptions`, and the venue
 * a session ends on is not the venue the next one starts on: the link is what
 * carries a place between sessions (`?level=`), exactly as a seed does.
 */

/**
 * A hand-built place the game offers by name.
 *
 * **Two of the five `LevelId`s are deliberately absent.** `proving` is an
 * instrument rather than a place — it is flat by construction and exists to
 * measure the wheel — and offering it from a menu would be offering a
 * diagnostic as a destination. `generated` is not a name at all: it is a seed,
 * and the fresh-route panel above this chooser is the control that supplies
 * one. Both remain reachable through `?level=`, which is what a diagnostic
 * entrance is.
 *
 * `Extract` rather than a hand-written union, so a venue id is a level id *by
 * construction*: removing a builder from `level/levels.ts` fails this file's
 * type-check rather than leaving a chooser button that would build the slice.
 */
export type VenueId = Extract<LevelId, 'slice' | 'track' | 'switchback'>;

/**
 * Every venue, in the order the chooser draws them.
 *
 * The shipped city first because it is the world the game boots into and the
 * one everything else is measured against, then the two circuits in the order
 * they were built. A player reading the row left to right reads the game's own
 * history, which is as good an order as any and is at least stable.
 */
export const VENUE_IDS: readonly VenueId[] = Object.freeze([
  'slice',
  'track',
  'switchback',
] as VenueId[]);

/** The title's Track Day destinations. This roster offers choices; the
 * entrance still validates the selected plan's lap before installing it. */
export const TRACK_VENUE_IDS = Object.freeze(['track', 'switchback'] as const);

export function isTrackVenueId(value: string): value is typeof TRACK_VENUE_IDS[number] {
  return (TRACK_VENUE_IDS as readonly string[]).includes(value);
}

/**
 * Is this string one of the venues?
 *
 * **A `Set` rather than `in`**, for `isLevelId`'s reason one layer up: the
 * value arrives from a `data-` attribute in markup, and `in` also accepts
 * inherited names such as `toString` and `constructor`. A chooser button whose
 * attribute had been edited would otherwise hand `createLevel` a key that is
 * not a builder.
 */
const VENUE_SET: ReadonlySet<string> = new Set<string>(VENUE_IDS);

export function isVenueId(value: string | null | undefined): value is VenueId {
  return value !== null && value !== undefined && VENUE_SET.has(value);
}
