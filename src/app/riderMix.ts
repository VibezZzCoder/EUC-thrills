/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { POWER_STAGE_ORDER, type PowerStage } from '../simulation/EucController.ts';

/**
 * How several riders become one warning — M25 Phase 5 (q66), extracted by its
 * QA repair.
 *
 * The audio director holds **one** continuous model and one beep ladder, and
 * §25.5 is explicit that a couch session must not double it. So the warnings
 * are aggregated on the way in: the ladder answers to whichever rider is
 * nearest trouble, because a guest riding into tilt-back with no beep is being
 * told nothing at all, and a beep nobody can attribute is still better than
 * silence for the person it belongs to.
 *
 * **The rule "a rider on the ground is not warned about" lives here, and that
 * is the repair.** It used to be a `!input.crashed` clause inside the
 * director's own beep gate, which was the same statement while there was one
 * rider and stopped being one the moment there were two: the input's `crashed`
 * is seat 0's, so the *player* lying on the ground silenced the *guest's*
 * tilt-back — machine-verifiable, and exactly what q66 forbids. Asking it per
 * rider is only possible where the riders are, so it is asked here and the
 * director simply believes what it is handed.
 *
 * Pure functions over a minimal shape, with no DOM, no `three` and no `Game`:
 * `node --test` territory, which is what lets the rule keep a headless home
 * instead of surviving only in a browser spec.
 */

/** The part of a rider these two questions need. */
export interface RiderWarningState {
  /** True while this rider is off the wheel. */
  readonly crashed: boolean;
  /** Which rung of this rider's power ladder is lit. */
  readonly powerWarning: PowerStage;
  /** How near this rider is to the max-speed cutout, 0..1. */
  readonly overspeed: number;
}

/**
 * The most severe rung any upright rider is standing on.
 *
 * `'normal'` for an empty list and for a field of riders who are all down,
 * which is what makes the director's own `pattern === null` branch the single
 * place a silent ladder is decided.
 */
export function loudestWarning(riders: Iterable<RiderWarningState>): PowerStage {
  let worst = 0;
  for (const rider of riders) {
    if (rider.crashed) continue;
    const rung = POWER_STAGE_ORDER.indexOf(rider.powerWarning);
    if (rung > worst) worst = rung;
  }
  return POWER_STAGE_ORDER[worst];
}

/** How near the cutout the nearest upright rider is — `loudestWarning`'s twin. */
export function nearestCutout(riders: Iterable<RiderWarningState>): number {
  let worst = 0;
  for (const rider of riders) {
    if (rider.crashed) continue;
    if (rider.overspeed > worst) worst = rider.overspeed;
  }
  return worst;
}
