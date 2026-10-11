/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { AppStateId } from './appState.ts';
import type { ChaseRoomPhase } from '../simulation/chase.ts';

/**
 * The barks' quiet line (M42, `docs/PLANS.md` §42.2h): pedestrians do not ask
 * a rider questions while a siren is near. Pure, so every phase and every
 * distance is assertable headlessly (`barkQuiet.test.ts`).
 *
 * Read from the chase room's own facts, never from the audio mix: the mix's
 * siren priority is muted with the volume, and a muted player is still being
 * chased.
 */
export interface BarkQuietInput {
  /** The app state the seat is riding in. */
  readonly state: AppStateId;
  /** `ChaseRoom.phase`. */
  readonly roomPhase: ChaseRoomPhase;
  /** `ChaseRoom.pursuersHeld` — the start hold, which lives inside `'running'`. */
  readonly pursuersHeld: boolean;
  /** This seat's outlaw index (`Game.chaseSeatOutlaw`), −1 for the cop's seat or a chair outside the room. */
  readonly outlaw: number;
  /** `ChaseRoom.nearestCopMetres(outlaw)` — this seat's nearest standing cop, parked included. */
  readonly nearestCopMetres: number;
  /** `ChaseRoom.sirenRangeMetres` — the room's siren bed; Infinity unless running. */
  readonly sirenRangeMetres: number;
  /**
   * The shipped quiet line, `CHASE.trackerQuietGapMetres` (60 m, equal to
   * `AUDIO.sirenFarMetres`; `simulation/chase.test.ts` pins the pair). The
   * caller reads the constant; nothing here copies it.
   */
  readonly quietLineMetres: number;
}

/**
 * True while this seat must not bark.
 *
 * - Outside a chase: never quiet (the mode table decides the rest).
 * - A chase room that is not running (idle, countdown, results): quiet.
 * - The start hold: quiet.
 * - The cop's own seat, or a chair outside the room: quiet — he carries the siren.
 * - Otherwise quiet while this outlaw's nearest cop, or the room's siren, is
 *   within the quiet line.
 */
export function quietNow(input: BarkQuietInput): boolean {
  if (input.state !== 'chase') return false;
  if (input.roomPhase !== 'running') return true;
  if (input.pursuersHeld) return true;
  if (input.outlaw < 0) return true;
  return input.nearestCopMetres <= input.quietLineMetres
    || input.sirenRangeMetres <= input.quietLineMetres;
}
