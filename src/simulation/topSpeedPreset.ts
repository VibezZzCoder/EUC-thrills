/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CAMERA, EUC, TERRAIN } from '../data/tuning.ts';
import { SURFACES } from '../data/surfaces.ts';

/**
 * The top-speed preset — M30 Phase 0's switch, `docs/PLANS.md` §30.3a.
 *
 * **One pure function that turns "a wheel whose flat-pavement terminal is
 * `mph`" into the live-tuning writes that make it so**, derived exactly the
 * way `docs/PLANS.md` §30.2 fact 1 derives 65 and the way M16 derived 50 —
 * and the reason it is arithmetic rather than a checklist is M16's own
 * lesson: four constants that were secretly defined as the old top speed had
 * to be found and rescaled by hand, and one of them silently reintroduced a
 * feature the owner had removed. Written down as a recipe, the recipe can be
 * tested against M16's numbers (`topSpeedPreset.test.ts` reproduces
 * 17.0 / 25.1 / 22.3 / 22.3 from M16's own inputs) and re-run for any speed
 * the owner types.
 *
 * The recipe, on flat pavement:
 *
 *   - `driveAccel = EUC.leanToAccel · sin(EUC.maxLeanPitch)` — the drive is
 *     never touched (M16's decision: cutting drag changes one thing, which is
 *     how long the wheel keeps pulling; raising drive would re-tune every
 *     launch and every hill the owner has accepted).
 *   - `rolling = SURFACES.pavement.rollingResistance · TERRAIN.rollingResistanceScale`.
 *   - the pavement terminal `v = mph · 0.44704`, where drag balances what the
 *     rolling resistance leaves: `dragCoefficient = (driveAccel − rolling) / v²`.
 *   - `ratio` is the new **drag-only** top over the shipped one,
 *     `sqrt(driveAccel / drag)` each — the top speed every share in the game is
 *     a share *of* (`EucController.derivedTopSpeed`), so the beeps, the cutout
 *     and the cop's cap follow on their own and are deliberately not written.
 *   - `powerComfortSpeed` and `powerLimitSpeed` scale by `ratio`, as M16 did by
 *     1.476: they are the shape of "how near its own limit is the wheel", and
 *     the limit moved. Left behind, flat-out on the flat would score 1.0 and
 *     tilt the rider back on an empty straight — the removed speed limiter,
 *     back by accident.
 *   - `CAMERA.speedReference` and `AUDIO.speedReference` are **the new pavement
 *     terminal itself**, because that is their stated definition — "the
 *     wheel's approximate flat-pavement top speed" — rather than a number
 *     scaled from a rounded one.
 *   - `CAMERA.crashDistance` scales by `ratio` to `CRASH_DISTANCE_EXPONENT`.
 *     M16 measured 8.6 → 11.5 against a thrown ragdoll rather than scaling it,
 *     and Phase 0 repeats that measurement at 65 (`tests/m30.spec.ts`); the
 *     constant's comment records what it found.
 *
 * **What the preset deliberately does not touch**, each for the reason in its
 * own tuning comment: `hazardCrashSpeed` (a faster wheel slows down *further*
 * for a hole), `maxReverseSpeed` (15 mph by the owner's word),
 * `windOnsetSpeed` (the ramp widens, which is what he asked for at 50), the
 * cop's 18 m/s feedforward gate, the absolute crash-speed bands, and the pose
 * gates (`carveStanceSpeed`, `attackSpeed` — a pose at a speed, not a share).
 *
 * Under `simulation/` and free of `three` (invariant 1) so the whole recipe is
 * `node --test` territory; it reads only the frozen table and the surface
 * table, exactly as the controller does.
 */

/** One mile per hour, in metres per second. */
export const METRES_PER_SECOND_PER_MPH = 0.44704;

/**
 * The shipped ride's inputs to the recipe — everything the preset is relative
 * to. Read from the frozen table rather than from the live store on purpose:
 * `?mph=65` means "the wheel whose terminal is 65 mph", not "65 mph on top of
 * whatever F4 has already done to the drag".
 */
export interface TopSpeedBase {
  /** Full-lean drive authority on the flat, m/s². */
  readonly driveAccel: number;
  /** Flat pavement's rolling resistance after the global scale, m/s². */
  readonly rollingResistance: number;
  /** The drag the ratio is measured against, 1/m. */
  readonly dragCoefficient: number;
  readonly powerComfortSpeed: number;
  readonly powerLimitSpeed: number;
  readonly crashDistance: number;
}

/** What `topSpeedPreset` returns: the derived numbers and the six writes. */
export interface TopSpeedPreset {
  /** The speed asked for. */
  readonly mph: number;
  /** The flat-pavement terminal, m/s — `mph` converted, and both speed references. */
  readonly pavementTerminal: number;
  /** `sqrt(driveAccel / dragCoefficient)` — what every share is a share of. */
  readonly dragOnlyTop: number;
  /** The new drag-only top over the base's. 1 at the shipped speed. */
  readonly ratio: number;
  readonly dragCoefficient: number;
  readonly powerComfortSpeed: number;
  readonly powerLimitSpeed: number;
  /** Written to both `CAMERA.speedReference` and `AUDIO.speedReference`. */
  readonly speedReference: number;
  readonly crashDistance: number;
}

/** The six live-tuning paths the preset writes, in the order `Game` writes them. */
export const TOP_SPEED_PATHS = Object.freeze([
  'EUC.dragCoefficient',
  'EUC.powerComfortSpeed',
  'EUC.powerLimitSpeed',
  'CAMERA.speedReference',
  'AUDIO.speedReference',
  'CAMERA.crashDistance',
] as const);

export type TopSpeedPath = (typeof TOP_SPEED_PATHS)[number];

/**
 * How the crash camera's arm follows the top speed: `crashDistance · ratio^k`.
 *
 * **1 — a plain linear scale (14.97 m at 65), and the Phase 0 measurement
 * found nothing for a different exponent to act on.** M16 measured 8.6 →
 * 11.5 against a thrown ragdoll rather than scaling it ("a 50 mph wipeout
 * threw the ragdoll out through the *top* of the frame at the old arm
 * length"), so `tests/m30.spec.ts` repeated that measurement on today's
 * crash: the natural cutout faceplant ridden flat out at the shipped 65 and
 * under `?mph=50` (the measurement was taken at Phase 0, when those two were
 * the other way round), the eight corners of every visible rider mesh's bounding
 * box projected through the real chase camera on every other fixed step of
 * the crash — a bound on the body rather than its every vertex, and the times
 * below are the *first* corner behind the camera plane (Codex's independent
 * per-vertex probe, 2026-09-03: whole body off-screen by 0.40 s, behind the
 * camera by 0.45 s at 65). What it measured (2026-09-03, proving-ground
 * straight):
 *
 *   - the body never approaches the top of the frame at either speed — its
 *     highest point is y ≈ +0.04 of ±1, in the first 0.05 s;
 *   - it leaves through the **bottom** instead — its first corner passes the
 *     camera plane at 0.65 s (50) and 0.40 s (65) — and is behind the camera
 *     for the rest of the crash. The
 *     camera is anchored on the wheel, the riderless wheel rolls on at ~22
 *     m/s (~28 at 65, `EUC.crashWheelDecel` 2.2 m/s²), and the ragdoll stops
 *     within a few metres — so the camera drives past the body while its arm
 *     is still 6.3–6.6 m of the crash target, because the arm eases at
 *     `CAMERA.distanceResponseSeconds` (0.55 s) *under* the crash blend and
 *     has not moved yet;
 *   - consequently the arm length decides nothing about the body: at 65,
 *     11.5 / 13.0 / 13.8 / 15.0 / 16.5 / 18.0 m all put the body behind the
 *     camera at 0.35–0.37 s, and M16's own 8.6 m at 50 exits at 0.60 s
 *     against 11.5's 0.63 s. A full-speed side fall (wobble at terminal,
 *     cutout off) measures the same shape at both speeds.
 *
 * So the exponent stays at 1: the arm's *eventual* width (reached after
 * ~3 s) frames the riderless wheel's run-off, which grows with the speed it
 * was rolling at, and scaling the arm with the wheel keeps that wide shot
 * proportionate. **What would keep a 65 mph body in shot is not an arm
 * length** — it is the anchor (the camera follows the wheel, not the body)
 * or the arm's easing — and that is a camera decision for the owner
 * (§30.4 item 2's finding, surfaced rather than settled here).
 */
export const CRASH_DISTANCE_EXPONENT = 1;

/** The frozen table's inputs — what the preset is relative to unless a test says otherwise. */
export function shippedTopSpeedBase(): TopSpeedBase {
  return {
    driveAccel: EUC.leanToAccel * Math.sin(EUC.maxLeanPitch),
    rollingResistance: SURFACES.pavement.rollingResistance * TERRAIN.rollingResistanceScale,
    dragCoefficient: EUC.dragCoefficient,
    powerComfortSpeed: EUC.powerComfortSpeed,
    powerLimitSpeed: EUC.powerLimitSpeed,
    crashDistance: CAMERA.crashDistance,
  };
}

/** The shipped wheel's flat-pavement terminal, mph — the speed the preset is the identity at. */
export function shippedTopSpeedMph(base: TopSpeedBase = shippedTopSpeedBase()): number {
  return Math.sqrt((base.driveAccel - base.rollingResistance) / base.dragCoefficient)
    / METRES_PER_SECOND_PER_MPH;
}

/**
 * The writes for a wheel whose flat-pavement terminal is `mph`.
 *
 * Throws on a speed that is not a positive finite number, or on a base whose
 * drive cannot beat its own rolling resistance — both are programming errors,
 * because the URL parser (`level/levels.ts:topSpeedFromQuery`) bounds the
 * player-typed value long before it reaches here.
 */
export function topSpeedPreset(mph: number, base: TopSpeedBase = shippedTopSpeedBase()): TopSpeedPreset {
  if (!Number.isFinite(mph) || mph <= 0) throw new Error(`topSpeedPreset: ${mph} mph is not a speed`);
  const net = base.driveAccel - base.rollingResistance;
  if (!(net > 0)) throw new Error('topSpeedPreset: the drive cannot beat the rolling resistance');

  const pavementTerminal = mph * METRES_PER_SECOND_PER_MPH;
  const dragCoefficient = net / (pavementTerminal * pavementTerminal);
  const dragOnlyTop = Math.sqrt(base.driveAccel / dragCoefficient);
  const ratio = dragOnlyTop / Math.sqrt(base.driveAccel / base.dragCoefficient);

  return {
    mph,
    pavementTerminal,
    dragOnlyTop,
    ratio,
    dragCoefficient,
    powerComfortSpeed: base.powerComfortSpeed * ratio,
    powerLimitSpeed: base.powerLimitSpeed * ratio,
    speedReference: pavementTerminal,
    crashDistance: base.crashDistance * ratio ** CRASH_DISTANCE_EXPONENT,
  };
}

/** The same preset as a path → value record, for a test that walks the registry. */
export function topSpeedWrites(preset: TopSpeedPreset): Readonly<Record<TopSpeedPath, number>> {
  return Object.freeze({
    'EUC.dragCoefficient': preset.dragCoefficient,
    'EUC.powerComfortSpeed': preset.powerComfortSpeed,
    'EUC.powerLimitSpeed': preset.powerLimitSpeed,
    'CAMERA.speedReference': preset.speedReference,
    'AUDIO.speedReference': preset.speedReference,
    'CAMERA.crashDistance': preset.crashDistance,
  });
}
