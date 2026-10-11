/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * When the city launch pads are shown and armed — M42 (`docs/PLANS.md` §42.2a).
 *
 * Pure: a state in, two booleans out. `Game.enterState` asks it on every
 * transition and applies the answer to every human seat's controller
 * (`setLaunchPadsArmed`) and to the renderer (`setLaunchPadsVisible`); a seat
 * built later (a couch join, a world swap) asks it again in
 * `buildSeatController`. Nothing here knows which world is loaded: whether a
 * world *has* pads is the finder's plan predicate, and this table only says
 * whether the mode wants the ones that exist (invariant 22).
 *
 * The table, by the owner's defaults (q234, q237):
 *
 *   - free ride: shown and armed — the pads are the free-ride world's own;
 *   - free ride's pause, and Settings opened from it: shown, **never armed**.
 *     Visibility follows the world on screen (the effective state below);
 *     arming follows the state actually up, and only a state whose
 *     `acceptsRideInput` is true arms (QA A r2 minor 1). Settings *simulates*
 *     with no ride input, so a rider still coasting toward a pad behind the
 *     card would otherwise be thrown where nobody can see it. No rider is
 *     thrown by a pad behind a menu; on Resume the arming latches from
 *     position (`EucController.setLaunchPadsArmed`), so a wheel stopped on
 *     the pad's octagon rolls off it before the pad can fire;
 *   - the title, and every menu opened over it: shown, never armed — nobody
 *     is riding, and the boot warm pass uploads them under the cover;
 *   - every other state — Challenge, Chase, Knockabout, Track Day, Trick Run,
 *     results, boot, loading: hidden and disarmed. A timed run must not meet
 *     geometry its record key does not describe, and the chase stays untouched
 *     by construction;
 *   - `?chaseprobe`: hidden and disarmed everywhere, because the probe cop
 *     rides the bare ground.
 */
import { APP_STATE_SPECS, type AppStateId } from './appState.ts';

/** What a mode wants of the pads that exist. */
export interface LaunchPadLive {
  readonly visible: boolean;
  readonly armed: boolean;
}

/** Menus that open over the title's own live world. */
const TITLE_MENUS: ReadonlySet<AppStateId> = new Set<AppStateId>(['routes', 'riderSelect', 'couchJoin']);

const SHOWN_ARMED: LaunchPadLive = Object.freeze({ visible: true, armed: true });
const SHOWN_DISARMED: LaunchPadLive = Object.freeze({ visible: true, armed: false });
const HIDDEN: LaunchPadLive = Object.freeze({ visible: false, armed: false });

/**
 * The state whose world is on screen behind a menu.
 *
 * Settings resolves to where it was opened from, then a pause resolves to the
 * ride it paused, and the title's own menus resolve to the title. The order
 * matters: settings opened from the title is the title even when `rideReturn`
 * is stale from an earlier chase, and settings opened from a paused
 * Knockabout is Knockabout. Opening a menu over a live world therefore never
 * pops the pads.
 */
export function effectiveState(
  state: AppStateId,
  settingsReturn: AppStateId,
  rideReturn: AppStateId,
): AppStateId {
  let effective = state;
  if (effective === 'settings') effective = settingsReturn;
  if (effective === 'paused') effective = rideReturn;
  if (TITLE_MENUS.has(effective)) effective = 'title';
  return effective;
}

/**
 * The pads' presentation and arming.
 *
 * `effective` (from `effectiveState`) decides what is drawn; `state`, the one
 * actually up, decides arming: a pad fires only while that state passes ride
 * input to the seats (`AppStateSpec.acceptsRideInput`). Both are required so
 * no caller can arm a menu by passing the world behind it twice.
 */
export function launchPadsLive(effective: AppStateId, chaseProbe: boolean, state: AppStateId): LaunchPadLive {
  if (chaseProbe) return HIDDEN;
  if (effective === 'freeRide') return APP_STATE_SPECS[state].acceptsRideInput ? SHOWN_ARMED : SHOWN_DISARMED;
  if (effective === 'title') return SHOWN_DISARMED;
  return HIDDEN;
}
