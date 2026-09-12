/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { ONE_FOOT, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { clamp01 } from '../shared/maths.ts';
import type { EucController } from '../simulation/EucController.ts';

/**
 * The one-foot air pose — M36, `docs/PLANS.md` §36.5.
 *
 * **A pure fixed-step state machine, one per rider, fed plain scalars.** It
 * turns the Hop control's *held* level (`ActionSnapshot.hopHeld`, the input
 * layer's) and the controller's air facts (`EucController`'s getters) into one
 * render blend, `oneFoot` in 0..1, which `render/ridingRig.ts` spends through
 * `setTrickPose` before every `apply`. Nothing here is physics: the
 * controller never sees this state, this state never reaches the controller,
 * and §36.5's *physical equality* contract is proved by digest in
 * `oneFootPose.test.ts` rather than promised here.
 *
 * ## The lifecycle, in §36.5's own table
 *
 *   - **Tap Hop on the ground, release** — never eligible (grounded), no blend.
 *   - **Hold through takeoff** — eligible from the first airborne step; the
 *     dwell counts from there, the pose qualifies after
 *     `ONE_FOOT.holdQualifySeconds`, enters, holds while held, and returns
 *     before the projected touchdown. No spin is armed: the spin is a press
 *     and this reads a level.
 *   - **Release, then tap Hop while rising** — the 180 fires from the press
 *     (not read here); a tap shorter than the dwell never blends anything.
 *   - **Release, then re-hold while rising** — a fresh dwell; qualifies the
 *     same way if the flight has a readable window left.
 *   - **Re-hold while descending** — the same rule with less air: the pose
 *     starts only if `secondsToTouchdown` covers the entry, a readable hold,
 *     the return and the margin. Otherwise `refused`, visibly nothing.
 *   - **Hold through touchdown** — the ground suppresses the pose; whatever
 *     is still out comes back at the abort rate, and the hold that continues
 *     into the *next* flight is a new dwell in a new flight. No hop and no
 *     credit come from here: the hop is the controller's, the credit the
 *     observer's, and neither reads this.
 *
 * **One qualification per flight.** `qualifiedFlight` latches the
 * controller's `flightIndex` the moment a pose starts; a release and re-hold
 * inside the same flight reads `spent` and shows nothing, so a foot cannot
 * bob on a flicked key. The latch is keyed by identity rather than by a
 * counter zeroed on reset, which is why `flightIndex` exists.
 *
 * ## The estimate the refusal and the return are made from
 *
 * The controller supplies `secondsToTouchdown` in closed form —
 * `(v + √(v² + 2gh)) / g` from `groundClearance` and `verticalRate` under
 * `tuning.gravity` — deliberately without a margin, and this module adds
 * one: `ONE_FOOT.touchdownMarginSeconds`. The ground it projects onto is the
 * ground under the wheel *now*, so the number is re-read every step rather
 * than latched at takeoff; a landing that drops away lengthens the pose and a
 * rising face shortens it, and if the face wins the touchdown's own
 * suppression finishes the return at `abortSeconds`. While rising the same
 * form includes the rest of the climb, which is why one rule serves the
 * rising and the descending re-hold alike.
 *
 * ## What this module does not know
 *
 * No device ids, no venue, no `GameOptions`, no `three`, no seat. The side
 * the foot leaves on is `RIDER_BLOCKOUT.oneFootReleaseSide`, one constant for
 * every look chosen by the clearance sweep (§36.5), carried on the state so
 * a test can drive the other sign.
 */

/** Where the pose is in its life. Diagnostic names, exposed on the QA bridge. */
export type OneFootStateName =
  /** Not held, or not in the air: both boots on their pedals. */
  | 'idle'
  /** Held in the air, the dwell counting toward `holdQualifySeconds`. */
  | 'qualifying'
  /** Held and dwelt, but the flight has no readable window left. Nothing shows. */
  | 'refused'
  /** The foot is leaving or out, and staying out while held and air remains. */
  | 'posing'
  /** The foot is on its way back — released, out of air, or suppressed. */
  | 'returning'
  /** This flight already had its pose; the hold continues and shows nothing. */
  | 'spent';

/**
 * What one step is told. Plain scalars, read off the controller by
 * `stepOneFootFromController` in the composition root's own place.
 */
export interface OneFootFacts {
  /** The fixed step, seconds. */
  readonly dt: number;
  /** The Hop control's level on the *presented* snapshot — post-freeze. */
  readonly held: boolean;
  /** Off the ground and not crashed: `groundClearance > 0 && !crashed`. */
  readonly airborne: boolean;
  /** Inside the hop's preload dwell — grounded, so suppressed either way. */
  readonly compressing: boolean;
  /** The rider is off the wheel. */
  readonly crashing: boolean;
  /** The recovery blend after a respawn has not finished. */
  readonly recovering: boolean;
  /** The race countdown is on: intent is neutral and the pose is suppressed. */
  readonly countdownFrozen: boolean;
  /** Metres between the contact patch and the ground under it. */
  readonly groundClearance: number;
  /** Metres per second, positive up. Rising is `> 0`. */
  readonly verticalRate: number;
  /** The controller's closed-form projection, no margin; 0 grounded or crashed. */
  readonly secondsToTouchdown: number;
  /** Flight identity: +1 at every takeoff, never reset. */
  readonly flightIndex: number;
}

/** The clock the pose runs on — `ONE_FOOT` unless a test hands in another. */
export interface OneFootTiming {
  readonly holdQualifySeconds: number;
  readonly enterSeconds: number;
  readonly returnSeconds: number;
  readonly readableSeconds: number;
  readonly touchdownMarginSeconds: number;
  readonly abortSeconds: number;
}

export interface OneFootPoseState {
  /**
   * The render blend, 0..1 — what `RidingRig.setTrickPose` is handed.
   *
   * An eased reading of `phase`: the foot leaves and returns with a
   * smoothstep rather than a ramp, so the kick reads as a gesture and not as
   * a target sliding. Zero exactly whenever `phase` is zero.
   */
  oneFoot: number;
  /**
   * The gesture's linear clock, 0..1, moved by `enterSeconds`, `returnSeconds`
   * and `abortSeconds`. The return estimate is made in this, not in `oneFoot`.
   */
  phase: number;
  /** Which foot leaves: +1 the rider's left, -1 their right. Never 0 here. */
  readonly side: number;
  state: OneFootStateName;
  /** Seconds of eligible hold accumulated toward qualification. */
  holdSeconds: number;
  /** The `flightIndex` whose pose has been spent, or -1. */
  qualifiedFlight: number;
}

export function createOneFootPose(side: number = RIDER_BLOCKOUT.oneFootReleaseSide): OneFootPoseState {
  return {
    oneFoot: 0,
    phase: 0,
    side: side >= 0 ? 1 : -1,
    state: 'idle',
    holdSeconds: 0,
    qualifiedFlight: -1,
  };
}

/**
 * The seconds of air a pose needs to be worth starting: the entry, a readable
 * hold, the return, and the margin the projection is not allowed to promise.
 */
export function readableWindowSeconds(timing: OneFootTiming = ONE_FOOT): number {
  return timing.enterSeconds
    + timing.readableSeconds
    + timing.returnSeconds
    + timing.touchdownMarginSeconds;
}

/** The seconds a pose at this phase needs to be back on the pedal, with margin. */
export function returnNeededSeconds(
  state: OneFootPoseState,
  timing: OneFootTiming = ONE_FOOT,
): number {
  return state.phase * timing.returnSeconds + timing.touchdownMarginSeconds;
}

/** Whether the pose in `state` belongs to the flight the controller is in. */
export function oneFootQualifiedThisFlight(state: OneFootPoseState, flightIndex: number): boolean {
  return state.qualifiedFlight === flightIndex;
}

/**
 * Hard reset: both boots on their pedals, no dwell, no flight remembered.
 *
 * For the moments a rider is *put* somewhere — a teleport, a quick reset, a
 * world swap, a re-dress, a seat's birth — where the rig is re-synced anyway
 * and there is nothing to return from.
 */
export function resetOneFoot(state: OneFootPoseState): void {
  state.oneFoot = 0;
  state.phase = 0;
  state.state = 'idle';
  state.holdSeconds = 0;
  state.qualifiedFlight = -1;
}

/**
 * Soft cancel: what a release does, done now.
 *
 * For the input doors — blur, a menu boundary, a layout resize, a lost pad,
 * race GO — where the held level is being taken away underneath the pose.
 * The dwell is dropped so nothing qualifies off a level that no longer
 * exists; a foot that is out comes back through the ordinary return, because
 * §36.5 says a cancel *begins recovery* and the free foot visibly returns.
 * The flight's latch is kept: a cancelled pose was still this flight's one.
 */
export function cancelOneFoot(state: OneFootPoseState): void {
  state.holdSeconds = 0;
  state.state = state.phase > 0 ? 'returning' : 'idle';
}

function smoothstep(phase: number): number {
  const p = clamp01(phase);
  return p * p * (3 - 2 * p);
}

function advance(dt: number, seconds: number): number {
  // A zero travel time is a legal setting and means "now", not "never".
  return seconds > 0 ? dt / seconds : 1;
}

/**
 * One fixed step. Deterministic, allocation-free, and the whole rule.
 */
export function stepOneFoot(
  state: OneFootPoseState,
  facts: OneFootFacts,
  timing: OneFootTiming = ONE_FOOT,
): void {
  const dt = facts.dt > 0 && Number.isFinite(facts.dt) ? facts.dt : 0;
  const eligible = facts.airborne
    && !facts.crashing
    && !facts.recovering
    && !facts.compressing
    && !facts.countdownFrozen;

  if (!eligible) {
    // Suppressed: on the ground, in the preload, off the wheel, in the
    // recovery, or behind the lights. Whatever is still out comes back at the
    // abort rate — a landing that arrived early gets its pedal contact back
    // inside its own absorb — and the dwell cannot count. The flight latch is
    // untouched: a landing is what makes the *next* flight a new one.
    state.holdSeconds = 0;
    if (state.phase > 0) {
      state.phase = Math.max(0, state.phase - advance(dt, timing.abortSeconds));
      state.state = state.phase > 0 ? 'returning' : 'idle';
    } else {
      state.state = 'idle';
    }
    state.oneFoot = smoothstep(state.phase);
    return;
  }

  const qualified = state.qualifiedFlight === facts.flightIndex;

  if (state.phase > 0) {
    // A pose in progress. It keeps going out (or stays out) only while three
    // things hold: it has not begun returning, the level is still held, and
    // the air left covers the return from *this* phase plus the margin. The
    // third is read every step because the ground under the wheel moves; the
    // first is what makes a release final — a foot that has started back
    // does not turn round for a re-press, and the latch below makes the
    // re-press `spent` once it lands.
    const keep = state.state === 'posing'
      && facts.held
      && facts.secondsToTouchdown > returnNeededSeconds(state, timing);
    if (keep) {
      state.phase = Math.min(1, state.phase + advance(dt, timing.enterSeconds));
      state.state = 'posing';
    } else {
      state.phase = Math.max(0, state.phase - advance(dt, timing.returnSeconds));
      if (state.phase > 0) state.state = 'returning';
      else state.state = facts.held && qualified ? 'spent' : 'idle';
    }
    state.holdSeconds = 0;
    state.oneFoot = smoothstep(state.phase);
    return;
  }

  // Nothing is out.
  state.oneFoot = 0;
  if (!facts.held) {
    state.holdSeconds = 0;
    state.state = 'idle';
    return;
  }
  if (qualified) {
    // This flight has had its pose. The hold continues and shows nothing —
    // one qualification per flight, however the key is worked.
    state.holdSeconds = 0;
    state.state = 'spent';
    return;
  }
  // The dwell: a tap is a press, a hold is a hold, and the line between them
  // is measured in fixed steps here rather than in the input layer, so every
  // device and the QA bridge measure the same one.
  state.holdSeconds += dt;
  // Compared with a hair of slack so the boundary is a whole number of steps:
  // eighteen 120 Hz steps sum to 0.15 s in exact arithmetic and to one ulp
  // either side of it in floating point, and the dwell must not read 19 on
  // one machine and 18 on another.
  if (state.holdSeconds < timing.holdQualifySeconds - 1e-9) {
    state.state = 'qualifying';
    return;
  }
  // Qualified — but only worth starting if the flight can carry the whole
  // gesture: entry, a readable hold, the return, and the margin. A late
  // re-hold on the way down that cannot is refused outright and shows
  // nothing, which is §36.5's rule verbatim. The dwell is not reset, so the
  // reading stays `refused` rather than flickering back to `qualifying`.
  if (facts.secondsToTouchdown < readableWindowSeconds(timing)) {
    state.state = 'refused';
    return;
  }
  state.qualifiedFlight = facts.flightIndex;
  state.holdSeconds = 0;
  state.state = 'posing';
  state.phase = Math.min(1, advance(dt, timing.enterSeconds));
  state.oneFoot = smoothstep(state.phase);
}

/**
 * The facts, read off a controller the way `app/Game.ts` reads them — and the
 * only reading, so the ridden clearance sweep and the game cannot drift.
 *
 * Reused rather than allocated: one seat asks at 120 Hz.
 */
const scratch: {
  dt: number;
  held: boolean;
  airborne: boolean;
  compressing: boolean;
  crashing: boolean;
  recovering: boolean;
  countdownFrozen: boolean;
  groundClearance: number;
  verticalRate: number;
  secondsToTouchdown: number;
  flightIndex: number;
} = {
  dt: 0,
  held: false,
  airborne: false,
  compressing: false,
  crashing: false,
  recovering: false,
  countdownFrozen: false,
  groundClearance: 0,
  verticalRate: 0,
  secondsToTouchdown: 0,
  flightIndex: 0,
};

/**
 * Step the pose from a live controller.
 *
 * `recoverBlend` is the pose's, written by `writePose` on this same step, so
 * the recovery gate reads the number the rig will draw. `airborne` is derived
 * from `groundClearance`, which the controller holds at exactly 0 on the
 * ground *and through a crash* — the controller's own `airborne` stays true
 * through a mid-air crash, which is why `crashing` is gated explicitly and
 * the clearance is what decides flight. `compressing` is the preload dwell,
 * which the controller exposes only through `canAcceptHop` (grounded, not
 * compressing, not crashing); grounded and not crashing, that getter's
 * negation is the compression. It is belt and braces — the ground already
 * suppresses the pose — and stated because §36.5 states it.
 */
export function stepOneFootFromController(
  state: OneFootPoseState,
  euc: EucController,
  recoverBlend: number,
  dt: number,
  held: boolean,
  countdownFrozen: boolean,
  timing: OneFootTiming = ONE_FOOT,
): void {
  const crashing = euc.crashed;
  const clearance = euc.groundClearance;
  const airborne = clearance > 0 && !crashing;
  scratch.dt = dt;
  scratch.held = held;
  scratch.airborne = airborne;
  scratch.compressing = !airborne && !crashing && !euc.canAcceptHop;
  scratch.crashing = crashing;
  scratch.recovering = recoverBlend < 1;
  scratch.countdownFrozen = countdownFrozen;
  scratch.groundClearance = clearance;
  scratch.verticalRate = euc.verticalRate;
  scratch.secondsToTouchdown = euc.secondsToTouchdown;
  scratch.flightIndex = euc.flightIndex;
  stepOneFoot(state, scratch, timing);
}
