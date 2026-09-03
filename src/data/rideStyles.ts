/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ride styles — M29 (`docs/PLANS.md` §29.4).
 *
 * **A style is theatre. A stat would be a different rider.** The Drunkard is
 * the first rider on the roster who *rides* differently, by the owner's own
 * scope change — the players asked for a rider who behaves drunk — and this
 * file is the narrowest way that ask can be answered: a record of numbers
 * that shape what the path and the pose do when the player is *not* doing
 * something, and never what the wheel does when they are. The wheel goes
 * where the player points it; everything else looks drunk. Same top speed,
 * same launch, same brakes, same grip, same wobble physics, same crash, same
 * knock — M26 spent a milestone making the couch fair, and a style may not
 * spend it back.
 *
 * Three rules, and the tests that hold them:
 *
 *   - **Plain data, no `three`, no `simulation`.** `data/` is the one layer
 *     both `simulation/` and `app/` may read, which is what lets the
 *     controller take a `RideStyle` without the composition root reaching
 *     into it. Numbers only; the geometry a style moves is the rig's.
 *   - **Zero is the identity, by arithmetic.** `SOBER_STYLE` is every field at
 *     zero, and every term the controller adds for a style is a product with
 *     one of these fields, every factor finite — so with this record installed
 *     each term is exactly `+ 0` and the ride is bit-for-bit the ride without
 *     it. The six sober digests in `simulation/EucController.test.ts` were
 *     recorded before this file existed and hold that claim forever.
 *   - **Nothing but roster data installs one.** `riders.ts`' `rideStyleFor`
 *     is the one source; the composition root applies it wherever a seat's
 *     character or controller is written, and no option, URL or F4 control
 *     can put a style on a seat (safeguards S2, S6, S7).
 *
 * **Phase 0 (2026-09-02): the type, the sober record, and a controller that
 * stores one and reads nothing from it.** **Phase 1 (2026-09-02): the
 * reader** — `EucController.stepStyle` — and `DRUNK_STYLE`, read off the
 * `DRUNK` block in `tuning.ts` so F4 can move its numbers through the
 * live-tuning path without ever installing a style (S7).
 */

import { DRUNK } from './tuning.ts';

/**
 * What a style may shape. Rates rather than periods and spacings rather than
 * ratios wherever a zero would otherwise divide: a sober record has to be
 * safe to multiply by, not merely safe to skip.
 */
export interface RideStyle {
  /**
   * Peak heading offset of the hands-off weave at cruising speed, rad. 0 is
   * no weave. An *offset* and not a rate, deliberately: the controller feeds
   * the offset's per-step change to the steering request, so the heading
   * returns exactly to where it was whenever the weave's gate closes and a
   * hands-off straight can never drift into a turn. Above `weaveSpeedFull`
   * it is held to a constant lateral excursion.
   */
  readonly weaveHeading: number;
  /** The weave's first sine, Hz. Two incommensurate rates keep it from reading as a metronome. */
  readonly weaveRateA: number;
  /** The weave's second sine, Hz. */
  readonly weaveRateB: number;
  /** Below this speed the weave is zero, m/s — walking pace. */
  readonly weaveSpeedFloor: number;
  /** At and above this speed the weave is full, m/s — cruising. */
  readonly weaveSpeedFull: number;
  /**
   * How fast the weave and the sway fade in and out at the gates, 1/s. A rate
   * rather than a time constant on purpose: at the sober zero the gate never
   * opens, which is one more way the identity is a product and not a branch.
   */
  readonly weaveFadeRate: number;
  /** Metres of riding between stumbles. 0 is never. */
  readonly stumbleEvery: number;
  /** How long a stumble lasts, s. */
  readonly stumbleSeconds: number;
  /** The stumble's shimmy, Hz. */
  readonly stumbleRate: number;
  /** The stumble's peak machine roll, rad. */
  readonly stumbleRoll: number;
  /** The stumble's peak machine yaw, rad — spent on the travel heading, symmetric, so it drifts nothing. */
  readonly stumbleYaw: number;
}

/** Every field at zero: the identity, and the style every seat is born with. */
export const SOBER_STYLE: RideStyle = Object.freeze({
  weaveHeading: 0,
  weaveRateA: 0,
  weaveRateB: 0,
  weaveSpeedFloor: 0,
  weaveSpeedFull: 0,
  weaveFadeRate: 0,
  stumbleEvery: 0,
  stumbleSeconds: 0,
  stumbleRate: 0,
  stumbleRoll: 0,
  stumbleYaw: 0,
});

/**
 * The Drunken Master — every field off `DRUNK` in `tuning.ts`, frozen.
 *
 * The shipped numbers. The F4 panel does not write here (nothing writes a
 * default): `Game.applyTuning` builds a live copy of this record from the
 * store and hands it to `rideStyleFor`, which still decides *who* gets it.
 * Nothing about the wheel is in it — `EucController.test.ts` asserts that no
 * key of this record is a key of `EucTuning`.
 */
export const DRUNK_STYLE: RideStyle = Object.freeze({
  weaveHeading: DRUNK.weaveHeading,
  weaveRateA: DRUNK.weaveRateA,
  weaveRateB: DRUNK.weaveRateB,
  weaveSpeedFloor: DRUNK.weaveSpeedFloor,
  weaveSpeedFull: DRUNK.weaveSpeedFull,
  weaveFadeRate: DRUNK.weaveFadeRate,
  stumbleEvery: DRUNK.stumbleEvery,
  stumbleSeconds: DRUNK.stumbleSeconds,
  stumbleRate: DRUNK.stumbleRate,
  stumbleRoll: DRUNK.stumbleRoll,
  stumbleYaw: DRUNK.stumbleYaw,
});
