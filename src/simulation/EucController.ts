/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC, PHYSICS, SIMULATION, TERRAIN, WHEEL } from '../data/tuning.ts';
import { SURFACES, SURFACE_IDS } from '../data/surfaces.ts';
import type { ActionSnapshot } from '../input/actions.ts';
import { approach, clamp, clamp01, lerp } from '../shared/maths.ts';
import { roughnessAt } from './roughness.ts';
import { HazardField, NO_HAZARDS } from './hazards.ts';
import { CrashRagdoll, RAGDOLL_FLOATS } from './ragdoll.ts';
import { NO_SOFT_BODIES, SoftBodyField } from './softBodies.ts';
import {
  copyGroundSample,
  createGroundSample,
  type GroundSample,
  type ObstacleHit,
  type SurfaceId,
  type TerrainSampler,
  type Vec3,
} from './world.ts';

/**
 * The EUC controller — M2's ride, on M4's ground.
 *
 * **The game inverts the real EUC control loop.** On a real wheel the rider
 * leans and the firmware accelerates the wheel to stay underneath them. Here
 * `leanPitch` is a state variable driven toward the input target, and
 * acceleration is a function of lean. The player never balances. The visual,
 * audio, and camera feedback is identical to the real thing; the frustration is
 * absent. That inversion *is* the game (docs/PLANS.md §4).
 *
 * Two structural rules make this file what it is:
 *
 *   1. **No three.js import** (AGENTS.md invariant 1). Every curve below — the
 *      accel ramp, the top speed, the braking distance, the lateral clamp, the
 *      reverse gate, and now the slope term, the per-surface response, the
 *      step-up ceiling, and the suspension — is reachable from `node --test`
 *      with no browser, which is the only reason tuning by test is fast enough
 *      to be worth doing.
 *   2. **The world is reached only through `TerrainSampler`** (invariant 3).
 *
 * **What M4 changed, and what it deliberately did not.** The owner accepted the
 * M2/M3 ride, so terrain drives exactly the things `docs/PLANS.md` §4.1 and
 * §4.3 say terrain drives — the slope term, per-surface rolling resistance,
 * per-surface grip on the lateral limit, ground contact against real geometry,
 * and the suspension — and nothing else. On flat pavement every number below
 * reduces to the M2 controller exactly: the slope term is zero, pavement's
 * rolling resistance is the single value M2 shipped, and pavement's grip is
 * 1.0. The approved ride is unchanged on the ground it was approved on.
 *
 * Three specific restraints are worth naming so a later reader does not mistake
 * them for oversights:
 *
 *   - **Grip is lateral only.** It multiplies `maxLateralG` and nothing else.
 *     Folding it into brake authority would change an approved M2 number for a
 *     reason `docs/PLANS.md` does not state; rolling resistance already
 *     separates the surfaces longitudinally. Flagged for the owner.
 *   - **The reverse gate is untouched, so gravity cannot roll a stopped wheel
 *     backwards down a hill.** That is not an omission: an EUC actively holds
 *     its position on a slope, which is more authentic than a rollback, and the
 *     alternative would have terrain quietly rewriting a gate the owner
 *     approved. Hills still change climb and descent while moving, which is
 *     what the acceptance criteria ask for.
 *   - **No wobble on a kerb strike.** A kerb costs speed here and nothing more.
 *     Written at M4 as a deferral, answered at M6, and true again since M13
 *     removed the wobble half — this time permanently, because the owner's
 *     §13 q8 trigger set has no room in it for the ground you chose to ride on.
 *
 * **What M5 added: the wheel can leave the ground.** Everything under
 * `docs/PLANS.md` §4.4 is here — a one-button hop with a held-crouch bonus, a
 * ballistic airborne phase whose *travel direction is frozen at take-off*, a
 * three-input landing score, and a pedal strike whose clearance angle is
 * derived from the wheel's own geometry rather than written down. Two
 * structural consequences are worth reading before changing anything below:
 *
 *   - **Heading and travel direction are the same thing on the ground and two
 *     different things in the air.** §4.4 says velocity is never steerable in
 *     flight, so `airDirX/airDirZ` hold the take-off direction and the heading
 *     yaws independently at a quarter authority. The angle between them at
 *     touchdown is the landing score's misalignment term, and the component of
 *     the velocity across the new heading is simply scrubbed. Air control that
 *     cannot move the landing spot but can fix the attitude is precisely the
 *     trade the plan asks for.
 *   - **Riding off a ledge launches; riding down a hill does not.** The test
 *     is the same one that separates a kerb from a slope in `advance` below —
 *     a surface predicts its own fall, and only the excess beyond that
 *     prediction is a ledge. On a gradient the excess is zero at any steepness
 *     and any speed.
 *
 * **On flat pavement with nobody pressing hop, every number here is still bit-
 * for-bit M2's.** The airborne branches are gated on a state that only a hop or
 * a ledge can enter, the pedal strike cannot fire below 0.55 rad of lean, and a
 * landing that never happens costs nothing. A headless test asserts that
 * reduction directly.
 *
 * **What M6 added: consequences.** `docs/PLANS.md` §4.5's three systems are
 * here — a driven damped oscillator on yaw, one `loadFactor` scalar driving a
 * four-stage power ladder that ends in tilt-back, and a non-graphic crash with
 * a fast recovery at the last validated safe position. Four things about them
 * are worth reading before changing anything below:
 *
 *   - **The wobble is a real deviation, not a decoration.** `wobbleYaw` is
 *     added to the heading the wheel actually travels along, so a wobbling
 *     rider weaves. It averages to zero over a cycle, so it costs them their
 *     line and their nerve without stealing the direction they chose — and the
 *     *stored* heading never sees it, so an oscillation can never accumulate
 *     into a turn.
 *   - **Recovery has two layers.** Once a real wobble begins, Cool Rider's
 *     automatic foot correction adds damping even while throttle is held;
 *     easing off and steering smoothly adds more. That second layer is the
 *     whole of the owner's q8 rule — *if the rider does not reduce speed to
 *     correct it, they crash*.
 *   - **M13 replaced what starts one, and what it looks like when it does.**
 *     The trigger set is authored hazards and nothing else, so rough ground, speed, a
 *     scraping pedal, a reversed carve, a kerb and a hard landing all stopped
 *     feeding the oscillator; and the amplitude lost its visibility threshold,
 *     so the wheel weaves from the first hundredth of a point rather than
 *     staying still until a dead band is crossed. Those two changes are one
 *     change: the threshold only existed to stop rough ground weaving forever,
 *     and rough ground no longer supplies anything.
 *   - **Tilt-back is a ceiling on the force lean, not a separate force.** A
 *     real wheel tips its pedals back until the rider must lean back with them;
 *     in this inverted control loop that is exactly `min(demand, ceiling)` with
 *     the ceiling pulled past neutral. With no tilt-back the ceiling is
 *     `maxLeanPitch` and the expression reduces to M2's line unchanged.
 *   - **M15 gives the crash its own temporary body.** The scripted separation
 *     still exists as the A/B fallback, but the default crash seeds an
 *     eleven-particle ragdoll that exists only inside `crashing`, collides
 *     through the sampler, and maps back onto the existing rig. The wheel
 *     keeps rolling through the same `advance` every other step uses, so it
 *     cannot roll through a wall while nobody is steering it.
 *
 * On flat pavement none of it fires — and since M13 that is true of every
 * surface, because the only ground with a non-zero `wobbleInjection` is the
 * spill. Flat-out riding still produces about two thirds of the load tilt-back
 * needs. The same headless test that asserts the M2 reduction asserts that too.
 *
 * Still absent, with named owners: the beep and the amber HUD that
 * `docs/PLANS.md` §4.5 names as the ladder's first two rungs (audio is M8, the
 * HUD is M9 — M6 answers them with the machine's own status light instead, see
 * `data/tuning.ts`), and cutout (DEFERRED). Camera shake was briefly built at
 * M9 and then removed by the owner; simulation never owned it.
 *
 * **Refined after the owner's M4 ride (2026-08-02), forces untouched:** the
 * rig no longer tilts fore-aft with the terrain (an EUC holds its pedals level
 * with gravity — the M4 surface-normal alignment leaned the rider *away* from
 * climbs); the rider instead leans into the hill by the gradient
 * (`slopeLean`), and a genuinely stopped rider blends into a one-foot-down
 * rest stance (`restFactor`). All three are presentation state; the
 * longitudinal model, steering, and every approved M2 curve are bit-for-bit
 * what they were.
 */

/**
 * Rider and wheel states, from docs/PLANS.md §3.3.
 *
 * The full list is transcribed rather than trimmed, because it is a settled
 * decision and because a union that grows every milestone forces every `switch`
 * over it to be revisited for no reason. M4 produced the first four; M5 added
 * `compressing`, `airborne`, `landing`, and `pedalStrike`; M6 adds `wobbling`,
 * `tiltBack`, `crashing`, and `recovering`. Only `dismounted` is still
 * unproduced, and it stays that way until there is a reason to dismount
 * (`docs/PLANS.md` §4.7 defers the `E` binding for exactly that reason).
 */
export type EucState =
  | 'mounted'
  | 'rolling'
  | 'braking'
  | 'coasting'
  | 'compressing'
  | 'airborne'
  | 'landing'
  | 'wobbling'
  | 'pedalStrike'
  | 'tiltBack'
  | 'crashing'
  | 'recovering'
  | 'dismounted';

/**
 * How a landing went (`docs/PLANS.md` §4.4).
 *
 * `none` means no landing has happened since the last reset — a fifth value
 * rather than an optional, because "the rider has not landed yet" and "the
 * rider landed cleanly" are different facts and a HUD that cannot tell them
 * apart will announce a clean landing at the spawn.
 *
 * `wobble` and `crash` are **classifications, not states**. M5 scores them and
 * charges for them in speed; the wobble oscillator and the crash state machine
 * they will eventually drive belong to M6, which reads `landingQuality` and
 * `landingScore` off the snapshot.
 */
export type LandingQuality = 'none' | 'clean' | 'heavy' | 'wobble' | 'crash';

/**
 * The part of a surface the controller reads, as plain numbers.
 *
 * A copy rather than a reference to the frozen table in `data/surfaces.ts`, for
 * the same reason `EucTuning` is a copy of the frozen tuning: F4 writes through
 * to these while the game runs, and the defaults have to stay exact so that
 * "reset" means something.
 */
export interface SurfaceResponse {
  rollingResistance: number;
  grip: number;
  roughnessAmplitude: number;
  roughnessWavelength: number;
  /**
   * Wobble energy injected per second per m/s ridden (M6).
   *
   * Read from `data/surfaces.ts`, which has carried the column since M4 marked
   * it "M6". Deliberately not derived from `roughnessAmplitude`: what the
   * suspension has to absorb and what the steering does about it are two
   * different questions, and a smooth wood bridge is unsettling while rough
   * gravel squirms.
   */
  wobbleInjection: number;
}

export type SurfaceResponses = Record<SurfaceId, SurfaceResponse>;

export function defaultSurfaceResponses(): SurfaceResponses {
  const table = {} as SurfaceResponses;
  for (const id of SURFACE_IDS) {
    const surface = SURFACES[id];
    table[id] = {
      rollingResistance: surface.rollingResistance,
      grip: surface.grip,
      roughnessAmplitude: surface.roughnessAmplitude,
      roughnessWavelength: surface.roughnessWavelength,
      wobbleInjection: surface.wobbleInjection,
    };
  }
  return table;
}

/** Every number the controller reads. Plain data, so a test can state its own. */
export interface EucTuning {
  gravity: number;
  wheelRadius: number;

  maxLeanPitch: number;
  leanResponseSeconds: number;
  leanRateLimit: number;
  leanToAccel: number;
  brakeAuthority: number;
  dragCoefficient: number;
  stoppedSpeed: number;

  reverseEntrySpeed: number;
  reverseEngageSeconds: number;
  maxReverseSpeed: number;
  /** Share of the full look-behind pose shown during the confirmation dwell. */
  reverseGlanceFactor: number;
  /** 1 steers backwards relative to travel, 0 relative to the nose. */
  reverseSteerTravelRelative: number;
  /** Time constant for the look-behind pose blend, s. See `data/tuning.ts`. */
  reversePoseSeconds: number;

  yawRateLow: number;
  yawRateHigh: number;
  carveSpeed: number;
  /** Shape of the decay between the two yaw rates. See `data/tuning.ts`. */
  yawFalloffExponent: number;
  maxLateralG: number;
  /** Extra lateral authority for a hard low-speed technical turn, in g. */
  technicalTurnBonusG: number;
  /** Speed by which the technical-turn allowance has faded to nothing, m/s. */
  technicalTurnFadeSpeed: number;
  technicalTurnSteerStart: number;
  technicalTurnSteerFull: number;
  turnTechniqueResponseSeconds: number;
  gentleTurnTorsoTwist: number;
  technicalTurnUpperBodyRollFactor: number;

  rollResponseSeconds: number;
  riderUpperBodyRollFactor: number;
  maxRiderPitch: number;
  riderCruisePitchFactor: number;
  riderAccelerationPitchGain: number;
  riderPitchResponseSeconds: number;
  wheelPitchFactor: number;
  riderLookIntoTurn: number;
  riderLookResponseSeconds: number;

  /** Rider lean into the hill per radian of gradient. See `data/tuning.ts`. */
  riderSlopeLeanFactor: number;
  /** Speed at which the slope lean is fully expressed, m/s. */
  riderSlopeLeanFullSpeed: number;

  /** Stopped-with-no-input dwell before the rider steps a foot down, s. */
  restDelaySeconds: number;
  /** Time constant for settling into the rest stance, s. */
  restResponseSeconds: number;
  /** Time constant for stepping back onto the pedal, s. Fast on purpose. */
  restReleaseSeconds: number;

  // -- Terrain (M4) ---------------------------------------------------------
  /** Global multiplier on every surface's rolling resistance. */
  rollingResistanceScale: number;
  /** Rise beyond what the local gradient explains that counts as a step, m. */
  curbThreshold: number;
  /** Tallest step the wheel can mount, m. Derived from the pedal height. */
  maxStepUp: number;
  /** Speed lost per metre of step mounted, (m/s)/m. */
  curbImpactPerMetre: number;
  /** Deceleration while scraping something unclimbable, m/s^2. */
  wallScrubDecel: number;
  /** Closest the centreline may rest to a solid face, sideways, m. 0 disables. */
  wallStandoff: number;
  /** Ceiling on how fast the standoff may move the wheel, m/s. */
  wallStandoffRate: number;
  /** Normal speed into an unclimbable obstacle that takes the rider off, m/s. */
  obstacleCrashSpeed: number;
  /** How far ahead the kerb feeler probes, m. */
  feelerDistance: number;

  suspensionFrequencyHz: number;
  suspensionDamping: number;
  /** Bump-stop travel either way, m. */
  suspensionTravel: number;

  groundTiltResponseSeconds: number;
  maxGroundTilt: number;
  /** Fraction of the surface's fore-aft tilt the rig visually adopts. */
  groundTiltPitchFollow: number;
  /** Fraction of the surface's cross-slope tilt the rig visually adopts. */
  groundTiltRollFollow: number;

  // -- Hop, air, landing, pedal strike (M5) ---------------------------------
  /** Dwell between the hop press and the impulse, s. */
  hopCompressSeconds: number;
  /** Vertical speed at take-off with no charge, m/s. */
  hopLaunchSpeed: number;
  /** Held-crouch time for the full bonus, s. */
  hopChargeSeconds: number;
  /** Extra hop *height* at full charge, as a fraction. Applied as sqrt. */
  hopChargeHeightBonus: number;
  /** Suspension extension released at launch, per m/s of launch speed. */
  hopSuspensionRebound: number;
  /** How far a full crouch pushes the spring's input down, m. */
  suspensionPreload: number;

  /** Fraction of ground yaw authority available in the air. */
  airYawFactor: number;
  /** Fraction of the drag coefficient that still applies off the ground. */
  airDragFactor: number;
  /** Rider/wheel pitch the throttle sets in the air, rad. Presentation only. */
  airPitchAuthority: number;
  airPitchResponseSeconds: number;
  /** Knee bend held while airborne, 0..1 of a full crouch. */
  airTuck: number;
  /** Depth of a deliberate held crouch on the ground, 0..1. */
  crouchHeldAmount: number;
  crouchResponseSeconds: number;
  landingAbsorbSeconds: number;

  /** Unexplained fall that puts the wheel in the air, m. */
  dropLaunchThreshold: number;

  /** Normal closing speed that scores 1.0, m/s. */
  landingImpactReference: number;
  /** Heading-versus-travel angle that scores 1.0, rad. */
  landingMisalignReference: number;
  landingSurfaceWeight: number;
  landingRoughnessReference: number;
  landingHeavyScore: number;
  landingWobbleScore: number;
  landingCrashScore: number;
  landingSpeedLossPerScore: number;
  landingMaxSpeedLoss: number;
  landingStateSeconds: number;
  landingSuspensionKick: number;

  /**
   * Pedal geometry, copied here so the clearance angle is computed from the
   * wheel the controller is actually driving rather than from the frozen
   * table. **Derived, not written down** — see `defaultEucTuning`.
   */
  pedalHeight: number;
  pedalHalfSpan: number;
  /** Deceleration while scraping, m/s² per radian past clearance. */
  pedalStrikeDecel: number;
  pedalStrikeGraceAngle: number;
  /** One-shot suspension velocity at the onset of a scrape, m/s. */
  pedalStrikeJolt: number;

  // -- Wobble, power, crash, recovery (M6, retriggered at M13) --------------
  wobbleMasterGain: number;
  /** Oscillation frequency at rest, and at the crash threshold, Hz. */
  wobbleFrequencyHz: number;
  wobbleFrequencyAtCrashHz: number;
  /** Yaw amplitude at the crash threshold, rad. Added to the travel heading. */
  wobbleMaxYaw: number;
  /** Machine-only roll amplitude at the crash threshold, rad. */
  wobbleMaxRoll: number;
  wobbleCrashEnergy: number;
  /** Damping per second while fighting it, and while easing off. */
  wobbleDampingAggressive: number;
  wobbleDampingSmooth: number;
  wobbleSmoothThrottle: number;
  wobbleSmoothSteerSeconds: number;
  wobbleSmoothResponseSeconds: number;
  /** Energy at which the experienced rider begins adjusting their feet. */
  wobbleFootCorrectionStart: number;
  /** Damping per second contributed by that active correction. */
  wobbleFootCorrectionDamping: number;
  /** Time constant for the correction to engage and release. */
  wobbleFootCorrectionResponseSeconds: number;
  /** Energy per second per m/s ridden, per unit of the ground's own injection. */
  wobbleSurfaceGain: number;
  wobbleStateEnergy: number;
  /** Diagnostic probe: metres between impulses, and their size. 0 metres is off. */
  wobbleProbeMetres: number;
  wobbleProbeEnergy: number;

  /** What a pothole costs on contact (M13). A spill is ground, not an event. */
  hazardShallowEnergy: number;
  hazardShallowSpeedCost: number;
  hazardDeepEnergy: number;
  hazardDeepSpeedCost: number;
  /** Speed at or above which a deep hole crashes instead of being survived. */
  hazardCrashSpeed: number;

  powerComfortSpeed: number;
  powerLimitSpeed: number;
  powerSlopeLoad: number;
  powerAccelLoad: number;
  powerLandingLoad: number;
  powerLandingDecaySeconds: number;
  powerResponseSeconds: number;
  powerReliefSeconds: number;
  powerNoticeLoad: number;
  powerWarnLoad: number;
  powerTiltBackLoad: number;
  /** Fraction of the engage load tilt-back releases at. A ratio, not a level. */
  powerTiltBackRelease: number;
  /** Where tilt-back holds the force lean, rad past neutral. */
  tiltBackLeanBack: number;
  tiltBackEngageSeconds: number;
  tiltBackReleaseSeconds: number;
  /** Extra rearward pitch of the machine itself at full tilt-back, rad. */
  tiltBackPedalPitch: number;

  // -- The max-speed cutout (M20) --------------------------------------------
  /** Share of the derived top speed at which the over-speed beeps begin. */
  overspeedBeepShare: number;
  /** Share of the derived top speed at which the wheel gives up. */
  cutoutSpeedShare: number;
  /** How long above that speed before it does, s. */
  cutoutHoldSeconds: number;
  /** Master switch, 0 or 1. At 0 there is no cutout and no over-speed at all. */
  cutoutEnabled: number;

  crashWheelDecel: number;
  crashWheelFallSeconds: number;
  crashWheelLean: number;
  crashRecoverEarliestSeconds: number;
  crashRecoverAutoSeconds: number;
  crashRecoverSpeedFactor: number;
  crashSafeDelaySeconds: number;
  crashSafeWobbleCeiling: number;
  crashInvulnerableSeconds: number;
  crashRecoverBlendSeconds: number;
  crashStepOffSpeed: number;
  crashRunOutSpeed: number;
  crashSeparationForward: number;
  crashSeparationLateral: number;
  crashSeparationSeconds: number;
  crashRiderDrop: number;
  crashRiderTumble: number;
  crashSideFallDrop: number;
  crashSideFallRoll: number;
  crashTumbleHz: number;
  crashTumbleDampSeconds: number;
  crashTumbleRoll: number;
  crashTumblePitch: number;
  crashTumbleBounce: number;

  // -- Ragdoll, wheel flourish, soft foliage (M15) --------------------------
  ragdollEnabled: number;
  ragdollBlendSeconds: number;
  ragdollDamping: number;
  ragdollIterations: number;
  ragdollFriction: number;
  ragdollRestitution: number;
  ragdollCurlGain: number;
  ragdollTuckGain: number;
  ragdollLaunchPop: number;
  ragdollLaunchPopMax: number;
  ragdollLaunchCarry: number;
  ragdollLaunchSide: number;
  ragdollLaunchTumble: number;
  ragdollSoftDamping: number;
  crashWheelFlourishSpeed: number;
  crashWheelSpinRate: number;
  crashWheelSpinDampSeconds: number;
  crashWheelPopFactor: number;
  crashWheelPopMax: number;
  crashWheelPopRestitution: number;
  softBodyDrag: number;
  softBodyDragQuadratic: number;
  softBodyWobbleEnergy: number;
}

/** The defaults, assembled from the frozen tuning root. */
export function defaultEucTuning(): EucTuning {
  return {
    gravity: PHYSICS.gravity,
    wheelRadius: WHEEL.tyreDiameter / 2,

    maxLeanPitch: EUC.maxLeanPitch,
    leanResponseSeconds: EUC.leanResponseSeconds,
    leanRateLimit: EUC.leanRateLimit,
    leanToAccel: EUC.leanToAccel,
    brakeAuthority: EUC.brakeAuthority,
    dragCoefficient: EUC.dragCoefficient,
    stoppedSpeed: EUC.stoppedSpeed,

    reverseEntrySpeed: EUC.reverseEntrySpeed,
    reverseEngageSeconds: EUC.reverseEngageSeconds,
    maxReverseSpeed: EUC.maxReverseSpeed,
    reverseGlanceFactor: EUC.reverseGlanceFactor,
    reverseSteerTravelRelative: EUC.reverseSteerTravelRelative,
    reversePoseSeconds: EUC.reversePoseSeconds,

    yawRateLow: EUC.yawRateLow,
    yawRateHigh: EUC.yawRateHigh,
    carveSpeed: EUC.carveSpeed,
    yawFalloffExponent: EUC.yawFalloffExponent,
    maxLateralG: EUC.maxLateralG,
    technicalTurnBonusG: EUC.technicalTurnBonusG,
    technicalTurnFadeSpeed: EUC.technicalTurnFadeSpeed,
    technicalTurnSteerStart: EUC.technicalTurnSteerStart,
    technicalTurnSteerFull: EUC.technicalTurnSteerFull,
    turnTechniqueResponseSeconds: EUC.turnTechniqueResponseSeconds,
    gentleTurnTorsoTwist: EUC.gentleTurnTorsoTwist,
    technicalTurnUpperBodyRollFactor: EUC.technicalTurnUpperBodyRollFactor,

    rollResponseSeconds: EUC.rollResponseSeconds,
    riderUpperBodyRollFactor: EUC.riderUpperBodyRollFactor,
    maxRiderPitch: EUC.maxRiderPitch,
    riderCruisePitchFactor: EUC.riderCruisePitchFactor,
    riderAccelerationPitchGain: EUC.riderAccelerationPitchGain,
    riderPitchResponseSeconds: EUC.riderPitchResponseSeconds,
    wheelPitchFactor: EUC.wheelPitchFactor,
    riderLookIntoTurn: EUC.riderLookIntoTurn,
    riderLookResponseSeconds: EUC.riderLookResponseSeconds,

    riderSlopeLeanFactor: EUC.riderSlopeLeanFactor,
    riderSlopeLeanFullSpeed: EUC.riderSlopeLeanFullSpeed,

    restDelaySeconds: EUC.restDelaySeconds,
    restResponseSeconds: EUC.restResponseSeconds,
    restReleaseSeconds: EUC.restReleaseSeconds,

    rollingResistanceScale: TERRAIN.rollingResistanceScale,
    curbThreshold: TERRAIN.curbThreshold,
    // **Derived, not written down** — the same rule master §6.1 puts on
    // generated clearance. The step a wheel can lever itself onto is a property
    // of the wheel, and a hand-picked constant stops agreeing with it silently
    // the first time the wheel changes.
    maxStepUp: WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor,
    curbImpactPerMetre: TERRAIN.curbImpactPerMetre,
    wallScrubDecel: TERRAIN.wallScrubDecel,
    wallStandoff: TERRAIN.wallStandoff,
    wallStandoffRate: TERRAIN.wallStandoffRate,
    obstacleCrashSpeed: EUC.obstacleCrashSpeed,
    feelerDistance: TERRAIN.feelerDistance,

    suspensionFrequencyHz: TERRAIN.suspensionFrequencyHz,
    suspensionDamping: TERRAIN.suspensionDamping,
    suspensionTravel: WHEEL.suspensionTravel,

    groundTiltResponseSeconds: TERRAIN.groundTiltResponseSeconds,
    maxGroundTilt: TERRAIN.maxGroundTilt,
    groundTiltPitchFollow: TERRAIN.groundTiltPitchFollow,
    groundTiltRollFollow: TERRAIN.groundTiltRollFollow,

    hopCompressSeconds: EUC.hopCompressSeconds,
    hopLaunchSpeed: EUC.hopLaunchSpeed,
    hopChargeSeconds: EUC.hopChargeSeconds,
    hopChargeHeightBonus: EUC.hopChargeHeightBonus,
    hopSuspensionRebound: EUC.hopSuspensionRebound,
    suspensionPreload: EUC.suspensionPreload,

    airYawFactor: EUC.airYawFactor,
    airDragFactor: EUC.airDragFactor,
    airPitchAuthority: EUC.airPitchAuthority,
    airPitchResponseSeconds: EUC.airPitchResponseSeconds,
    airTuck: EUC.airTuck,
    crouchHeldAmount: EUC.crouchHeldAmount,
    crouchResponseSeconds: EUC.crouchResponseSeconds,
    landingAbsorbSeconds: EUC.landingAbsorbSeconds,

    dropLaunchThreshold: TERRAIN.dropLaunchThreshold,

    landingImpactReference: EUC.landingImpactReference,
    landingMisalignReference: EUC.landingMisalignReference,
    landingSurfaceWeight: EUC.landingSurfaceWeight,
    landingRoughnessReference: EUC.landingRoughnessReference,
    landingHeavyScore: EUC.landingHeavyScore,
    landingWobbleScore: EUC.landingWobbleScore,
    landingCrashScore: EUC.landingCrashScore,
    landingSpeedLossPerScore: EUC.landingSpeedLossPerScore,
    landingMaxSpeedLoss: EUC.landingMaxSpeedLoss,
    landingStateSeconds: EUC.landingStateSeconds,
    landingSuspensionKick: EUC.landingSuspensionKick,

    // **Derived, not written down**, the same rule `maxStepUp` follows above.
    // The angle at which a pedal reaches the ground is a fact about where the
    // pedals are, and a hand-picked "pedal clearance angle" constant stops
    // agreeing with the wheel the first time the wheel changes. Both halves of
    // the geometry are copied rather than the angle itself so a test — or a
    // future wheel with a different pedal span — moves the clearance by moving
    // the thing it is a property of.
    pedalHeight: WHEEL.pedalHeight,
    pedalHalfSpan: WHEEL.pedalSpan / 2,
    pedalStrikeDecel: EUC.pedalStrikeDecel,
    pedalStrikeGraceAngle: EUC.pedalStrikeGraceAngle,
    pedalStrikeJolt: EUC.pedalStrikeJolt,

    wobbleMasterGain: EUC.wobbleMasterGain,
    wobbleFrequencyHz: EUC.wobbleFrequencyHz,
    wobbleFrequencyAtCrashHz: EUC.wobbleFrequencyAtCrashHz,
    wobbleMaxYaw: EUC.wobbleMaxYaw,
    wobbleMaxRoll: EUC.wobbleMaxRoll,
    wobbleCrashEnergy: EUC.wobbleCrashEnergy,
    wobbleDampingAggressive: EUC.wobbleDampingAggressive,
    wobbleDampingSmooth: EUC.wobbleDampingSmooth,
    wobbleSmoothThrottle: EUC.wobbleSmoothThrottle,
    wobbleSmoothSteerSeconds: EUC.wobbleSmoothSteerSeconds,
    wobbleSmoothResponseSeconds: EUC.wobbleSmoothResponseSeconds,
    wobbleFootCorrectionStart: EUC.wobbleFootCorrectionStart,
    wobbleFootCorrectionDamping: EUC.wobbleFootCorrectionDamping,
    wobbleFootCorrectionResponseSeconds: EUC.wobbleFootCorrectionResponseSeconds,
    wobbleSurfaceGain: EUC.wobbleSurfaceGain,
    wobbleStateEnergy: EUC.wobbleStateEnergy,
    wobbleProbeMetres: EUC.wobbleProbeMetres,
    wobbleProbeEnergy: EUC.wobbleProbeEnergy,
    hazardShallowEnergy: EUC.hazardShallowEnergy,
    hazardShallowSpeedCost: EUC.hazardShallowSpeedCost,
    hazardDeepEnergy: EUC.hazardDeepEnergy,
    hazardDeepSpeedCost: EUC.hazardDeepSpeedCost,
    hazardCrashSpeed: EUC.hazardCrashSpeed,

    powerComfortSpeed: EUC.powerComfortSpeed,
    powerLimitSpeed: EUC.powerLimitSpeed,
    powerSlopeLoad: EUC.powerSlopeLoad,
    powerAccelLoad: EUC.powerAccelLoad,
    powerLandingLoad: EUC.powerLandingLoad,
    powerLandingDecaySeconds: EUC.powerLandingDecaySeconds,
    powerResponseSeconds: EUC.powerResponseSeconds,
    powerReliefSeconds: EUC.powerReliefSeconds,
    powerNoticeLoad: EUC.powerNoticeLoad,
    powerWarnLoad: EUC.powerWarnLoad,
    powerTiltBackLoad: EUC.powerTiltBackLoad,
    powerTiltBackRelease: EUC.powerTiltBackRelease,
    tiltBackLeanBack: EUC.tiltBackLeanBack,
    tiltBackEngageSeconds: EUC.tiltBackEngageSeconds,
    tiltBackReleaseSeconds: EUC.tiltBackReleaseSeconds,
    tiltBackPedalPitch: EUC.tiltBackPedalPitch,

    overspeedBeepShare: EUC.overspeedBeepShare,
    cutoutSpeedShare: EUC.cutoutSpeedShare,
    cutoutHoldSeconds: EUC.cutoutHoldSeconds,
    cutoutEnabled: EUC.cutoutEnabled,

    crashWheelDecel: EUC.crashWheelDecel,
    crashWheelFallSeconds: EUC.crashWheelFallSeconds,
    crashWheelLean: EUC.crashWheelLean,
    crashRecoverEarliestSeconds: EUC.crashRecoverEarliestSeconds,
    crashRecoverAutoSeconds: EUC.crashRecoverAutoSeconds,
    crashRecoverSpeedFactor: EUC.crashRecoverSpeedFactor,
    crashSafeDelaySeconds: EUC.crashSafeDelaySeconds,
    crashSafeWobbleCeiling: EUC.crashSafeWobbleCeiling,
    crashInvulnerableSeconds: EUC.crashInvulnerableSeconds,
    crashRecoverBlendSeconds: EUC.crashRecoverBlendSeconds,
    crashStepOffSpeed: EUC.crashStepOffSpeed,
    crashRunOutSpeed: EUC.crashRunOutSpeed,
    crashSeparationForward: EUC.crashSeparationForward,
    crashSeparationLateral: EUC.crashSeparationLateral,
    crashSeparationSeconds: EUC.crashSeparationSeconds,
    crashRiderDrop: EUC.crashRiderDrop,
    crashRiderTumble: EUC.crashRiderTumble,
    crashSideFallDrop: EUC.crashSideFallDrop,
    crashSideFallRoll: EUC.crashSideFallRoll,
    crashTumbleHz: EUC.crashTumbleHz,
    crashTumbleDampSeconds: EUC.crashTumbleDampSeconds,
    crashTumbleRoll: EUC.crashTumbleRoll,
    crashTumblePitch: EUC.crashTumblePitch,
    crashTumbleBounce: EUC.crashTumbleBounce,

    ragdollEnabled: EUC.ragdollEnabled,
    ragdollBlendSeconds: EUC.ragdollBlendSeconds,
    ragdollDamping: EUC.ragdollDamping,
    ragdollIterations: EUC.ragdollIterations,
    ragdollFriction: EUC.ragdollFriction,
    ragdollRestitution: EUC.ragdollRestitution,
    ragdollCurlGain: EUC.ragdollCurlGain,
    ragdollTuckGain: EUC.ragdollTuckGain,
    ragdollLaunchPop: EUC.ragdollLaunchPop,
    ragdollLaunchPopMax: EUC.ragdollLaunchPopMax,
    ragdollLaunchCarry: EUC.ragdollLaunchCarry,
    ragdollLaunchSide: EUC.ragdollLaunchSide,
    ragdollLaunchTumble: EUC.ragdollLaunchTumble,
    ragdollSoftDamping: EUC.ragdollSoftDamping,
    crashWheelFlourishSpeed: EUC.crashWheelFlourishSpeed,
    crashWheelSpinRate: EUC.crashWheelSpinRate,
    crashWheelSpinDampSeconds: EUC.crashWheelSpinDampSeconds,
    crashWheelPopFactor: EUC.crashWheelPopFactor,
    crashWheelPopMax: EUC.crashWheelPopMax,
    crashWheelPopRestitution: EUC.crashWheelPopRestitution,
    softBodyDrag: EUC.softBodyDrag,
    softBodyDragQuadratic: EUC.softBodyDragQuadratic,
    softBodyWobbleEnergy: EUC.softBodyWobbleEnergy,
  };
}

/**
 * Where the power ladder currently stands (`docs/PLANS.md` §4.5).
 *
 * Four rungs, named rather than numbered, because the thing that matters about
 * them is what each one *means* to the rider: nothing, the wheel is near its
 * limit, the wheel is at its limit, and the wheel has stopped answering. The
 * first two have no mechanical effect at all — they exist to be shown.
 */
export type PowerStage = 'normal' | 'notice' | 'warn' | 'tiltBack';

/**
 * Why the rider came off (`EUC_RIDER_MOTION_REFERENCE.md` §16).
 *
 * `none` means no crash has happened since the last reset, for the same reason
 * `LandingQuality` carries a `none`: "has not crashed" and "recovered from a
 * crash" are different facts.
 */
export type CrashCause =
  | 'none' | 'wobble' | 'landing' | 'pedalStrike' | 'obstacle' | 'hazard'
  /**
   * The wheel gave up at its own top speed — M20, the owner's reopened cutout.
   *
   * The only cause in this union that is the *machine* rather than something
   * the rider hit, which is why it is tested last in the crash funnel: if a
   * rider at maximum speed also went through a pothole, the pothole is the
   * better story and the one the results card should name.
   */
  | 'cutout';

/**
 * Which non-graphic crash motion is playing (`EUC_RIDER_MOTION_REFERENCE.md`
 * §16). Chosen from the speed and the cause, not authored per trigger — with
 * one exception: `faceplant` belongs to the cutout alone, because a cutout is
 * the one crash whose direction physics dictates. The wheel stops holding the
 * rider up while nothing slows the rider down, so the body goes over the
 * *front* — which is also what every real cutout video shows. The first build
 * routed the cutout through `sideFall` and the owner read it as backwards:
 * *"he kinda falls back… looks like he got shot."*
 */
export type CrashMotion = 'none' | 'stepOff' | 'runOut' | 'sideFall' | 'faceplant';

export interface Spawn {
  readonly position: Vec3;
  readonly headingY: number;
}

/**
 * Everything the renderer needs to place the rig, and nothing else.
 *
 * Filled in place rather than returned, because the loop keeps two of these —
 * the previous step and the current one — and interpolates between them every
 * frame. Allocating a fresh object 120 times a second to be read 60 times is
 * the sort of garbage that only shows up as an occasional hitch, months later.
 */
export interface EucPose {
  x: number;
  y: number;
  z: number;
  headingY: number;
  /**
   * Wheel roll into a turn, radians. Signed toward +X, which in this world is
   * the rider's *left* — so a right turn produces a negative roll. Read the
   * corrected world conventions in `data/tuning.ts` before relying on the sign.
   */
  rollAngle: number;
  /** Upper-body roll after the hips counter-rotate against the wheel lean. */
  riderRoll: number;
  /** Rendered rider action pitch, radians. Positive leans forward, toward +Z. */
  riderPitch: number;
  /**
   * Head yaw toward the corner, radians, about the rider's own +Y.
   *
   * Positive turns the head toward +X — the rider's LEFT — so it carries the
   * same sign as `yawRate` and a left turn cannot arrive here as a right one.
  */
  riderLookYaw: number;
  /** Gentle-turn torso twist toward the corner, radians. */
  riderTurnTwist: number;
  /** Signed hard low-speed technique blend, -1..1. */
  technicalTurn: number;
  /**
   * How far into the backwards-riding stance the rider is, 0..1.
   *
   * Riding backwards is the one stance that is asymmetrical front-to-back by
   * its nature: a real rider opens their chest toward one side and looks back
   * over that shoulder at where they are actually going, because their eyes
   * face the wrong way for the travel. A rider who slides backwards posed
   * exactly like a forward rider reads as a rendering mistake, and the
   * shared-playtest riders said so.
   *
   * The blend rises to a *partial* glance during the reverse-confirmation
   * dwell — so the held second request visibly arms something instead of
   * being dead input time — and to 1 once reverse engages. Presentation only:
   * it changes no force, no gate, and no approved reverse mechanic.
   */
  reverseBlend: number;
  /** The wheel's own fore-aft tilt. A fraction of the rider's. */
  wheelPitch: number;
  /** Accumulated tyre rotation about its axle, radians. */
  wheelSpin: number;
  /**
   * Ground tilt, already in the rig's own rotation convention: apply
   * `groundPitch` about local +X and `groundRoll` about local +Z, both under
   * the heading and above the lean pivot.
   *
   * Stated in the rig's convention rather than as a slope angle on purpose.
   * The sign of a terrain tilt is exactly the kind of thing a world-space test
   * agrees with while being wrong (`docs/LESSONS_LEARNED.md`), so it is derived
   * once, here, from the sampled normal, and the renderer applies it without a
   * second opinion.
   */
  groundPitch: number;
  groundRoll: number;
  /**
   * Vertical displacement of the sprung mass — shell, pads, pedals, rider —
   * from its rest position, metres. The suspension's visible travel.
   */
  suspensionOffset: number;
  /**
   * How far into the stopped rest stance the rider is, 0..1.
   *
   * 0 is riding; 1 is fully rested — left boot on the ground, right boot on
   * its pedal, wheel tipped against the pedal-side shin. The blend lives in
   * the controller rather than the renderer because *when* a rider rests is a
   * simulation question (stopped, no input, a dwell) and the renderer answers
   * no gameplay question of its own.
   */
  restFactor: number;
  /**
   * Signed speed along the heading, m/s. Negative is reverse.
   *
   * Carried on the pose rather than fetched from a snapshot because the chase
   * camera is stepped and interpolated exactly as the rig is, and a camera that
   * read a fresh snapshot every step would allocate 120 objects a second to
   * look at one number.
   */
  speed: number;

  // -- Hop, air, landing, pedal strike (M5) ---------------------------------
  /**
   * How compressed the rider is, 0..1.
   *
   * One scalar for three motions that are the same motion: the hop preload
   * (`EUC_RIDER_MOTION_REFERENCE.md` §12.1), the partial tuck held in the air
   * (§12.3), and the sharp absorb at touchdown (§12.5). Hips drop and both
   * legs re-solve to their planted pedals, so the knees bend and the boots
   * stay where they are.
   */
  crouch: number;
  /**
   * How deep a *deliberate held* crouch the rider is in, 0..1 (M8.6).
   *
   * The narrower half of `crouch` above, and the one the owner meant by
   * crouching: hips down, torso hinged forward over the wheel, arms drawn back
   * and low, head still up. It targets one only while the player is holding
   * crouch with the wheel on the ground and otherwise eases to zero, so the hop
   * preload, the air tuck, and the landing absorb do not create it themselves.
   *
   * Presentation only. The suspension preload reads `crouch`, never this.
   */
  tuck: number;
  /**
   * How airborne the rider is, 0..1, smoothed at both edges.
   *
   * A blend rather than the boolean, because the arms opening and the head
   * dropping toward the landing must not switch on in one frame. The
   * authoritative "is the wheel on the ground" answer is `EucSnapshot.grounded`
   * and nothing presentational should be deciding it.
   */
  airBlend: number;
  /** Height of the contact patch above the ground beneath it, metres. */
  airHeight: number;
  /**
   * Ground height beneath the contact patch, metres.
   *
   * Carried so the chase camera can anchor to the *ground* rather than to the
   * rider while the rider is off it (`docs/PLANS.md` §5, "keep the rider
   * framed"). Equal to `y` whenever the wheel is on the ground.
   */
  groundY: number;
  /**
   * Pedal-strike overlap, radians, **signed by the side that is scraping**.
   *
   * Positive means the +X pedal — the rider's left — is on the ground. Signed
   * rather than carried as a magnitude and a side, because a side is not
   * interpolatable and a signed overlap is: a value that crosses zero between
   * two steps is a strike that ended, which is exactly right.
   */
  pedalStrike: number;

  // -- Wobble, power, crash (M6) --------------------------------------------
  /**
   * Wobble energy as a fraction of the crash threshold, 0..1.
   *
   * Drives every wobble reaction in the rig — the deeper knees, the widening
   * arms, the hips lagging the wheel — from the one scalar `docs/PLANS.md`
   * §4.5 asks the whole system to be readable from.
   */
  wobble: number;
  /** Active foot-adjustment recovery, 0..1. */
  wobbleFootCorrection: number;
  /**
   * The oscillation itself, radians, **already spent on the position**.
   *
   * Deliberately *not* folded into `headingY`. The wheel's rendered yaw is
   * `headingY + wobbleYaw`, so the machine visibly weaves and the position it
   * reached already reflects the weave — but the chase camera reads the clean
   * heading, so its aim does not saw back and forth at four hertz. A camera
   * that followed the wobble would make the wobble invisible and the player
   * ill, which is the opposite of both goals.
   */
  wobbleYaw: number;
  /** Coupled tyre-and-pedal roll, radians, signed toward rider-left (+X). */
  wobbleRoll: number;
  /**
   * The same oscillation with its amplitude divided out, -1..1.
   *
   * The rig phases the rider's foot correction against the wheel's swing, and
   * needs the *phase* rather than the deviation to do it. Published rather than
   * recovered by dividing `wobbleYaw` by an amplitude, because that division
   * has to be done with the tuning the controller actually used: `render/` sees
   * only the frozen default table, so a rig that divides for itself silently
   * detaches from the F4 panel and — once M13 removed the visibility threshold
   * — from a divisor that had collapsed to zero.
   */
  wobbleSway: number;
  /**
   * How hard the rider is fighting the wheel, 0..1.
   *
   * `wobble` says how far the oscillator has run; this says whether it has run
   * far enough to be an *event* — the same threshold that names the `wobbling`
   * state, so the pose and the state can never disagree about what is
   * happening. Zero through the small end of a wobble that the wheel shows and
   * the rider rides out.
   */
  wobbleFight: number;
  /**
   * How near the machine is to its own limit, 0..1, worst of power and wobble.
   *
   * One number rather than a stage, because a stage is not interpolatable and
   * because a machine with two independent warning lights is a machine nobody
   * reads. `render/euc.ts` turns it into the status light's colour and pulse.
   */
  alert: number;
  /**
   * How far into a crash the rider is, 0..1, and where that has put them.
   *
   * The offsets are in the wheel's own frame, in metres and radians, so the
   * rig applies them to the rider root without deciding anything. This remains
   * the exact M6 fallback when `ragdollBlend` is zero; M15's crash-only body
   * supplies the default pose through the fields below.
   */
  crashBlend: number;
  crashForward: number;
  crashLateral: number;
  crashDrop: number;
  crashTumble: number;
  crashRoll: number;
  /** The riderless wheel lying down, radians about its own +Z. */
  wheelCrashLean: number;
  /**
   * The wheel's crash flourish (M15): accumulated spin-out about +Y, radians,
   * and the bounce height, metres. Both zero outside a hard crash, so the
   * rendered wheel is bit-for-bit the M6 fall until the flourish speed is met.
   */
  wheelCrashSpin: number;
  wheelCrashPop: number;
  /**
   * How far the render rig has handed the rider to the particle ragdoll,
   * 0..1 (M15). Zero whenever the ragdoll is disabled or the rider is not
   * crashing — at zero the rig must not read `ragdoll` at all, so the
   * scripted M6 crash path is untouched by the feature existing.
   */
  ragdollBlend: number;
  /**
   * World-space ragdoll particle positions, x/y/z interleaved in the index
   * order `simulation/ragdoll.ts` exports. A typed block rather than fields
   * because the render rig consumes it as geometry, and because `copyPose`
   * and the render interpolation handle it as one run of numbers.
   */
  ragdoll: Float32Array;
  /**
   * How present the rider is after a recovery, 0..1.
   *
   * §4.5's "brief invulnerable fade-in". 1 is riding; 0 is the instant of the
   * restore. Carried as a blend rather than as a visibility flag so the rider
   * arrives rather than appears.
   */
  recoverBlend: number;
  /** Tilt-back, 0..1. The machine tipping its pedals back under the rider. */
  tiltBack: number;
}

export function createPose(): EucPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    headingY: 0,
    rollAngle: 0,
    riderRoll: 0,
    riderPitch: 0,
    riderLookYaw: 0,
    riderTurnTwist: 0,
    technicalTurn: 0,
    reverseBlend: 0,
    wheelPitch: 0,
    wheelSpin: 0,
    groundPitch: 0,
    groundRoll: 0,
    suspensionOffset: 0,
    restFactor: 0,
    speed: 0,
    crouch: 0,
    tuck: 0,
    airBlend: 0,
    airHeight: 0,
    groundY: 0,
    pedalStrike: 0,
    wobble: 0,
    wobbleFootCorrection: 0,
    wobbleYaw: 0,
    wobbleRoll: 0,
    wobbleSway: 0,
    wobbleFight: 0,
    alert: 0,
    crashBlend: 0,
    crashForward: 0,
    crashLateral: 0,
    crashDrop: 0,
    crashTumble: 0,
    crashRoll: 0,
    wheelCrashLean: 0,
    wheelCrashSpin: 0,
    wheelCrashPop: 0,
    ragdollBlend: 0,
    ragdoll: new Float32Array(RAGDOLL_FLOATS),
    recoverBlend: 1,
    tiltBack: 0,
  };
}

/**
 * Every scalar field of a pose, discovered once from a fresh one.
 *
 * Derived rather than listed, and that is the point: a pose field added later
 * is interpolated by `lerpPose` below without anybody remembering to add it,
 * where a hand-written list is a list that silently stops covering the newest
 * thing on screen. `ragdoll` is the one non-scalar and is handled separately.
 */
const POSE_SCALARS: readonly (keyof EucPose)[] = Object.freeze(
  (Object.entries(createPose()) as [keyof EucPose, unknown][])
    .filter(([, value]) => typeof value === 'number')
    .map(([key]) => key),
);

/**
 * Interpolate between two fixed-step poses — the other half of a fixed-step
 * loop, and the one the renderer draws from.
 *
 * Three facts about pose interpolation are worth having in one place, because
 * every one of them was learned the hard way:
 *
 *   - **Heading and wheel spin are unwrapped by the controller**, deliberately,
 *     so a plain lerp is correct. A wrapped angle would spin the rig a full
 *     turn every time it crossed the seam.
 *   - **`wobbleSway` is already `sin(phase)`**, so it is continuous when the
 *     phase wraps and interpolates like any other scalar. M13's first pass
 *     sampled the current step instead, on the theory that adjacent sine
 *     samples could jump from +1 to −1; at 120 Hz and at most 7 Hz they cannot,
 *     and sampling gave the feet a one-step phase lead.
 *   - **The ragdoll block is world positions**, so a per-float lerp is a lerp
 *     of each particle's own path — exactly what the fixed step integrated
 *     between these two states. It is skipped entirely at zero blend, which is
 *     every frame but a crash.
 */
export function lerpPose(from: EucPose, to: EucPose, alpha: number, out: EucPose): void {
  for (const key of POSE_SCALARS) {
    const a = from[key] as number;
    const b = to[key] as number;
    (out[key] as number) = a + (b - a) * alpha;
  }

  const blend = out.ragdollBlend;
  if (blend > 0) {
    for (let index = 0; index < out.ragdoll.length; index += 1) {
      out.ragdoll[index] = from.ragdoll[index]
        + (to.ragdoll[index] - from.ragdoll[index]) * alpha;
    }
  }
}

export function copyPose(from: EucPose, to: EucPose): void {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.headingY = from.headingY;
  to.rollAngle = from.rollAngle;
  to.riderRoll = from.riderRoll;
  to.riderPitch = from.riderPitch;
  to.riderLookYaw = from.riderLookYaw;
  to.riderTurnTwist = from.riderTurnTwist;
  to.technicalTurn = from.technicalTurn;
  to.reverseBlend = from.reverseBlend;
  to.wheelPitch = from.wheelPitch;
  to.wheelSpin = from.wheelSpin;
  to.groundPitch = from.groundPitch;
  to.groundRoll = from.groundRoll;
  to.suspensionOffset = from.suspensionOffset;
  to.restFactor = from.restFactor;
  to.speed = from.speed;
  to.crouch = from.crouch;
  to.tuck = from.tuck;
  to.airBlend = from.airBlend;
  to.airHeight = from.airHeight;
  to.groundY = from.groundY;
  to.pedalStrike = from.pedalStrike;
  to.wobble = from.wobble;
  to.wobbleFootCorrection = from.wobbleFootCorrection;
  to.wobbleYaw = from.wobbleYaw;
  to.wobbleRoll = from.wobbleRoll;
  to.wobbleSway = from.wobbleSway;
  to.wobbleFight = from.wobbleFight;
  to.alert = from.alert;
  to.crashBlend = from.crashBlend;
  to.crashForward = from.crashForward;
  to.crashLateral = from.crashLateral;
  to.crashDrop = from.crashDrop;
  to.crashTumble = from.crashTumble;
  to.crashRoll = from.crashRoll;
  to.wheelCrashLean = from.wheelCrashLean;
  to.wheelCrashSpin = from.wheelCrashSpin;
  to.wheelCrashPop = from.wheelCrashPop;
  to.ragdollBlend = from.ragdollBlend;
  to.ragdoll.set(from.ragdoll);
  to.recoverBlend = from.recoverBlend;
  to.tiltBack = from.tiltBack;
}

/** The full readout, for the QA bridge and the debug overlay. Allocates. */
export interface EucSnapshot {
  readonly state: EucState;
  readonly position: Vec3;
  readonly headingY: number;
  /** Signed, along the heading. Negative is reverse. */
  readonly speed: number;
  readonly speedKph: number;
  /** Net signed change in speed during the latest step, m/s^2. */
  readonly longitudinalAccel: number;
  /** Force-demand lean that drives acceleration. */
  readonly leanPitch: number;
  /**
   * Rendered fore-aft pitch: the action pose plus the slope lean. Positive
   * leans forward, toward +Z.
   */
  readonly riderPitch: number;
  /** The slope lean alone — the rider's smoothed tilt into the hill, rad. */
  readonly slopeLean: number;
  /** How far into the stopped rest stance the rider is, 0..1. */
  readonly restFactor: number;
  /** Head yaw toward the corner. Positive is toward the rider's left. */
  readonly riderLookYaw: number;
  /** Gentle-turn torso twist toward the corner, radians. */
  readonly riderTurnTwist: number;
  /** Signed hard low-speed technique blend, -1..1. */
  readonly technicalTurn: number;
  readonly wheelPitch: number;
  readonly rollAngle: number;
  readonly riderRoll: number;
  readonly yawRate: number;
  readonly lateralAccel: number;
  /** True while the lateral-acceleration ceiling is widening the turn. */
  readonly lateralLimited: boolean;
  readonly reversing: boolean;
  /** The backwards-riding stance blend, 0..1. Presentation only. */
  readonly reverseBlend: number;
  readonly grounded: boolean;
  readonly surface: SurfaceId;
  readonly wheelSpin: number;
  /** Path length ridden since the last reset, metres. */
  readonly distanceTravelled: number;

  // -- Terrain (M4) ---------------------------------------------------------
  /** True when the wheel is on the surround rather than the authored course. */
  readonly offCourse: boolean;
  /** Unit surface normal under the contact patch. */
  readonly groundNormal: Vec3;
  /** Gradient along the heading, radians. Positive is climbing. */
  readonly slope: number;
  /** The slope term applied to the longitudinal model this step, m/s^2. */
  readonly slopeAccel: number;
  /** Rolling resistance actually applied, after the surface and the scale. */
  readonly rollingResistance: number;
  /** Lateral limit actually applied, in g, after the surface's grip. */
  readonly lateralLimitG: number;
  /** Sprung-mass displacement from rest, metres. */
  readonly suspensionOffset: number;
  /** Spring closure — how far the suspension has compressed, metres. */
  readonly suspensionCompression: number;
  /**
   * Height of the step the forward feeler can see, metres, or 0 for none.
   * Negative is a drop. M5's hop assist and M6's wobble injection read this.
   */
  readonly curbAhead: number;
  /** Height of the last step the wheel mounted, metres. */
  readonly lastStepUp: number;
  /** True while the wheel is refusing part of a move into something solid. */
  readonly blocked: boolean;
  /** Normal component of the latest solid-obstacle impact, m/s. */
  readonly collisionImpact: number;

  // -- Hop, air, landing, pedal strike (M5) ---------------------------------
  /** True from the hop press until the impulse fires. */
  readonly compressing: boolean;
  /** Charge captured when the compression began, 0..1. */
  readonly hopCharge: number;
  /** Charge currently available from held crouch, 0..1. */
  readonly crouchCharge: number;
  /** Hops taken since the last reset. */
  readonly hops: number;
  /** Vertical speed of the contact patch, m/s. Positive is rising. */
  readonly verticalVelocity: number;
  /** Height of the contact patch above the ground beneath it, metres. */
  readonly airHeight: number;
  /** Highest that height has reached during the current flight, metres. */
  readonly airApex: number;
  /** Seconds since the wheel left the ground, or 0 while grounded. */
  readonly airTime: number;
  /**
   * Angle between the wheel's heading and its frozen travel direction, rad.
   *
   * The thing air steering actually changes, and the misalignment term the
   * landing score will read at touchdown. Zero on the ground.
   */
  readonly airMisalignment: number;
  /** How the most recent landing scored. `none` until the first one. */
  readonly landingQuality: LandingQuality;
  /** Its normal closing speed, m/s. */
  readonly landingImpact: number;
  /** Its heading-versus-travel angle, radians. */
  readonly landingMisalignment: number;
  /** Its total score. The tier boundaries are in `data/tuning.ts`. */
  readonly landingScore: number;
  /** Fraction of speed it cost, 0..1. */
  readonly landingSpeedLoss: number;
  /** Landings since the last reset. */
  readonly landings: number;
  /**
   * How far past pedal clearance the wheel is leaning, radians, signed by the
   * scraping side. Positive is the rider's left (+X). Zero when clear.
   */
  readonly pedalStrike: number;
  /** The clearance angle itself, radians. Derived, and it moves with travel. */
  readonly pedalClearance: number;

  // -- Wobble, power, crash, recovery (M6) ----------------------------------
  /**
   * Wobble energy, where `EUC.wobbleCrashEnergy` (1.0) is a crash.
   *
   * The single scalar `docs/PLANS.md` §4.5 asks every wobble consumer to read:
   * the wheel's oscillation, the rider's stance, and the machine's status
   * light all come off this one number.
   */
  readonly wobbleEnergy: number;
  /** Current oscillation, radians. Already spent on the position. */
  readonly wobbleYaw: number;
  /** Coupled tyre-and-pedal roll, radians. */
  readonly wobbleRoll: number;
  /** Net energy change this step, per second. Negative means it is settling. */
  readonly wobbleRate: number;
  /** How smoothly the rider is riding, 0..1. 1 selects the high damping. */
  readonly wobbleSmoothness: number;
  /** How strongly Cool Rider is correcting through their feet, 0..1. */
  readonly wobbleFootCorrection: number;

  /** The power ladder's single scalar. 1.0 is tilt-back. */
  readonly loadFactor: number;
  readonly powerStage: PowerStage;
  /** How far tilt-back has engaged, 0..1. */
  readonly tiltBack: number;
  /** How near the max-speed cutout the wheel is, 0..1 — M20. */
  readonly overspeed: number;
  /** Seconds spent past the cutout speed. Zero whenever it is not. */
  readonly overspeedHeld: number;

  /** True while the rider is off the wheel. */
  readonly crashed: boolean;
  readonly crashCause: CrashCause;
  readonly crashMotion: CrashMotion;
  /** True while the particle ragdoll owns the crashing rider's body (M15). */
  readonly ragdolling: boolean;
  /** True while the wheel is inside soft foliage and shedding speed (M15). */
  readonly inFoliage: boolean;
  /** Seconds since the rider came off, or 0 when riding. */
  readonly crashTime: number;
  /** Crashes since the last reset. */
  readonly crashes: number;
  /** True while a recovery would be accepted — §4.5's "available in ≤1.2 s". */
  readonly recoveryReady: boolean;
  /** Seconds of invulnerability left after a recovery. */
  readonly invulnerable: number;
  /** The last validated safe position, and the heading it was ridden on. */
  readonly safePosition: Vec3;
  readonly safeHeading: number;
}

export class EucController {
  readonly tuning: EucTuning;
  readonly surfaces: SurfaceResponses;

  private readonly sampler: TerrainSampler;
  private spawn: Spawn;

  private x = 0;
  private y = 0;
  private z = 0;
  /**
   * Unwrapped, and deliberately so. A heading wrapped into (-pi, pi] produces
   * a full-speed spin every time the renderer interpolates across the seam.
   * `wrapAngle` exists for display.
   */
  private headingY = 0;

  private speed = 0;
  private leanPitch = 0;
  private riderPitch = 0;
  /**
   * The rider's smoothed lean into the hill, radians. Kept apart from
   * `riderPitch` so the wheel's share (`wheelPitchFactor`) never includes it:
   * the pedals stay level with gravity on a slope — that is the firmware's
   * whole job — while the rider hinges above them.
   */
  private slopeLean = 0;
  private riderLookYaw = 0;
  private riderTurnTwist = 0;
  private technicalTurn = 0;
  private longitudinalAccel = 0;
  private rollAngle = 0;
  private yawRate = 0;
  private lateralAccel = 0;
  private lateralLimited = false;
  private wheelSpin = 0;
  private distanceTravelled = 0;

  /** Sticky once reverse engages, so leaving the entry window cannot cancel it. */
  private reversing = false;
  /** Seconds of held lean-back at a near standstill. Arms `reversing`. */
  private reverseHold = 0;
  /**
   * The backwards-riding stance blend, 0..1. Presentation only: the shoulder
   * check during the dwell and the held look-behind while reversing. See
   * `EucPose.reverseBlend`.
   */
  private reverseBlend = 0;

  /** Seconds of stopped-with-no-input. Arms the rest stance. */
  private restHold = 0;
  /** The rest stance blend, 0..1. */
  private restFactor = 0;

  private grounded = true;
  private surface: SurfaceId = 'pavement';
  private state: EucState = 'mounted';

  /**
   * Two preallocated ground samples: one for the contact patch, one for the
   * feeler and for the candidate positions a blocked move tries. Filled in
   * place, never escaping the step (`simulation/world.ts`).
   */
  private readonly ground: GroundSample = createGroundSample();
  private readonly probe: GroundSample = createGroundSample();
  /** Reused obstacle-cast metadata; never allocated inside the fixed step. */
  private readonly obstacleHit: ObstacleHit = {
    distance: 0,
    halfExtentX: Infinity,
    halfExtentZ: Infinity,
  };
  private lastObstacleNarrow = false;
  /** Reused standoff-cast vectors; never allocated inside the fixed step. */
  private readonly standoffOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly standoffRay: Vec3 = { x: 0, y: 0, z: 0 };

  private slope = 0;
  private slopeAccel = 0;
  private rollingResistance = 0;
  private lateralLimitG = 0;
  private groundPitch = 0;
  private groundRoll = 0;
  private suspensionOffset = 0;
  private suspensionVelocity = 0;
  private suspensionCompression = 0;
  private curbAhead = 0;
  private lastStepUp = 0;
  private blocked = false;
  /**
   * A solid recently refused movement and the rider has not yet travelled
   * clear of it. This survives the last deceleration steps after `blocked`
   * itself falls false, so a fully stopped rider can still pivot away.
   */
  private obstacleEscapeArmed = false;
  private collisionImpact = 0;
  private offCourse = false;

  // -- Hazards (M13) ----------------------------------------------------------

  /** The world's potholes. Empty unless `installLevel` handed some over. */
  private readonly hazards: HazardField;
  /**
   * Whether the contact patch is inside a pothole footprint right now.
   *
   * Two jobs, and they need different halves of it. The **edge** is the contact
   * event: a hole two metres across is thirty-two steps wide at fifteen metres
   * a second, and charging for every one of them would make a wide hole an
   * instant crash and a narrow one a scratch, which is the opposite of what
   * the shape means. The **level** is what stops a rider who is standing in a
   * hole from having that spot recorded as their safe position — see
   * `updateSafePosition`.
   *
   * False while airborne by construction, which is what makes hopping a hole
   * work with no hop-specific code: the query only runs on the ground, so a
   * rider who takes off before the rim and lands past it never enters one.
   */
  private inHazard = false;

  // -- Soft foliage (M15) -----------------------------------------------------

  /** The world's shrub bodies. Empty unless `installLevel` handed some over. */
  private readonly softBodies: SoftBodyField;
  /**
   * Whether the contact patch is inside soft foliage right now. The edge is
   * the contact event — the wobble is injected once on entry, exactly as a
   * pothole charges once — and the level applies the drag. Also consulted by
   * `updateSafePosition`: a rider ploughing through a bush is not somewhere a
   * recovery should return them to.
   */
  private inSoftBody = false;

  // -- Hop, air, landing, pedal strike (M5) -----------------------------------

  private airborne = false;
  private verticalVelocity = 0;
  /**
   * The travel direction, frozen at take-off. Unit, horizontal.
   *
   * This is the whole of "velocity direction is never steerable in the air"
   * (`docs/PLANS.md` §4.4): while airborne the wheel moves along *this* and
   * `headingY` turns independently. On the ground the two are the same vector
   * and this is simply not read.
   */
  private airDirX = 0;
  private airDirZ = 1;
  private groundY = 0;
  private airTime = 0;
  private airApex = 0;

  /** Seconds remaining in the hop compression, or 0 when not compressing. */
  private compressTimer = 0;
  private compressing = false;
  /** Seconds of held crouch on the ground. Charges the hop. */
  private crouchHold = 0;
  /** The charge captured at the moment the compression began, 0..1. */
  private hopCharge = 0;
  /** Last step's hop flag, so a hop is a rising edge rather than a level. */
  private hopWasHeld = false;
  private hops = 0;

  /** Rider compression, 0..1. Preload, air tuck, and landing absorb. */
  private crouch = 0;
  /**
   * The *deliberate* held crouch alone, 0..1. Presentation only (M8.6).
   *
   * `crouch` above answers "how compressed is the rider", which the preload,
   * the air tuck, and the landing absorb all raise. This answers the narrower
   * question the rider pose actually needs — "is the player holding a crouch
   * on the ground" — because the tuck in the reference photograph is a
   * whole-body shape with a hinged torso and drawn-back arms, and a landing
   * absorb is emphatically not. It eases back to zero after takeoff rather than
   * snapping the torso upright. Nothing reads it but the rig.
   */
  private tuck = 0;
  /** The landing absorb alone, added on top of `crouch` and decaying. */
  private absorb = 0;
  /** Smoothed 0..1 airborne blend, for presentation only. */
  private airBlend = 0;
  /** Fore-aft pitch the rider has set in the air. Presentation only. */
  private airPitch = 0;

  private landingTimer = 0;
  private landingQuality: LandingQuality = 'none';
  private landingImpact = 0;
  private landingMisalignment = 0;
  private landingScore = 0;
  private landingSpeedLoss = 0;
  private landings = 0;

  /** Overlap past pedal clearance, radians, signed by the scraping side. */
  private pedalStrike = 0;
  private pedalClearance = 0;

  /**
   * Single-step events, for the composition root.
   *
   * True on exactly the step they happened and cleared at the top of the next
   * one. Read through the getters below rather than through `snapshot()`,
   * which allocates — `app/Game.ts` asks every step, and a camera impulse and
   * a particle burst are not worth an object each at 120 Hz.
   */
  private justTookOff = false;
  private justTouchedDown = false;

  // -- Wobble, power, crash, recovery (M6) ------------------------------------

  /** Wobble energy, where `wobbleCrashEnergy` is a crash. */
  private wobbleEnergy = 0;
  /** Oscillator phase, radians. Advanced by the step, never by wall time. */
  private wobblePhase = 0;
  /** The current deviation, already applied to the travel heading. */
  private wobbleYaw = 0;
  /** Coupled machine roll, applied to the EUC and pedals but not the rider root. */
  private wobbleRoll = 0;
  /**
   * The oscillator's current swing, -1..1, with the amplitude divided out.
   *
   * Published so the rig can phase the rider's foot correction against the
   * wheel without re-deriving the amplitude from the frozen tuning table —
   * which is how `render/rider.ts` got a divisor that collapsed to zero the
   * moment M13 removed the visibility threshold.
   */
  private wobbleSway = 0;
  private wobbleRate = 0;
  /** Ground covered since the diagnostic probe last fired, m. */
  private wobbleProbeDistance = 0;
  /** How smoothly the rider is riding, 0..1. Blended, so damping cannot chatter. */
  private wobbleSmoothness = 0;
  /** Experienced-rider foot correction, 0..1. Stacks with easing off. */
  private wobbleFootCorrection = 0;
  /**
   * Sign of the steering input last step, and how long it has held.
   *
   * **Recovery only.** M6 also charged a *reversal* of this sign against the
   * lean it threw away; M13 deleted that, because the owner's trigger set
   * (§13 q8, clarified at M15 to include soft foliage) is authored hazards and
   * nothing else, and reversing a carve is exactly the input he named as the
   * one wobble must never punish. What survives is the
   * smoothness blend below, which reads how long the steering has been left
   * alone to decide how hard a wobble already running is damped.
   */
  private steerSign = 0;
  private steerHold = 0;

  private loadFactor = 0;
  private powerStage: PowerStage = 'normal';
  /** Decaying contribution of the most recent landing to the load. */
  private landingLoad = 0;
  /** How far tilt-back has engaged, 0..1. */
  private tiltBack = 0;
  /** Sticky above the engage threshold, released below the lower one. */
  private tiltBackLatched = false;

  /**
   * How near the cutout the wheel is, 0 at the first beep and 1 at the edge.
   *
   * Held as a field rather than recomputed by every reader because three
   * separate consumers ask for it every frame — the beeps, the HUD glyph, and
   * the QA bridge — and because a value the crash funnel acts on and the HUD
   * draws must be the *same* value on the same step. It is written once per
   * fixed step in `stepPower`.
   */
  private overspeedFactor = 0;
  /** Seconds spent continuously past the cutout speed. Reset the moment it drops. */
  private overspeedHold = 0;

  private crashing = false;
  private crashCause: CrashCause = 'none';
  private crashMotion: CrashMotion = 'none';
  private crashTime = 0;
  private crashes = 0;
  /** Speed the rider was carrying when they came off, m/s. */
  private crashSpeed = 0;
  /** Which way the rider was thrown: +1 toward +X (their left), -1 right. */
  private crashSide = 1;
  private crashBlend = 0;
  private wheelCrashLean = 0;
  private recoverTimer = 0;
  private invulnerableTimer = 0;

  // -- The crash ragdoll and the wheel flourish (M15) -------------------------

  /** The particle body. Allocated once; runs only while `ragdolling`. */
  private readonly ragdoll = new CrashRagdoll();
  private ragdolling = false;
  /** The wheel's spin-out: accumulated angle, rad, and current rate, rad/s. */
  private wheelCrashSpin = 0;
  private wheelCrashSpinRate = 0;
  /** The wheel's bounce: height above ground, m, and vertical velocity, m/s. */
  private wheelCrashPop = 0;
  private wheelCrashPopVelocity = 0;

  /**
   * The last validated safe position, and how long the current one has been
   * unremarkable.
   *
   * "Restoring the rider at the last validated safe position"
   * (`docs/PLANS.md` §4.5). Validated is doing real work: grounded, on the
   * authored course, not being refused by anything solid, moving, and not
   * already in trouble. A wobble crash therefore restores well before the
   * wobble started, and riding into a wall restores just short of the wall.
   */
  private safeX = 0;
  private safeZ = 0;
  private safeHeading = 0;
  private safeHold = 0;

  constructor(
    sampler: TerrainSampler,
    options: {
      tuning?: Partial<EucTuning>;
      spawn?: Spawn;
      surfaces?: Partial<SurfaceResponses>;
      /**
       * The world's potholes — M13.
       *
       * **Not routed through `TerrainSampler`, and the reason is invariant 3's
       * own subject matter.** That interface answers questions about *the
       * ground*: how high it is here, which way it faces, what it is made of,
       * what a ray hits. A pothole is not a property of a point of ground; it
       * is a discrete event with an identity, and `GroundSample` is filled
       * twice per step — once under the contact patch and once at the kerb
       * feeler, which wants no hazard answer at all — so putting one on that
       * struct would compute it twice, use it once, and grow every headless
       * sampler double in the suite to say so.
       *
       * The precedent is `challenge.ts`, which reads `Checkpoint` straight from
       * `level/plan.ts` for the same reason: authored trigger volumes are their
       * own kind of thing, and the composition root hands them over at
       * `installLevel`.
       *
       * Default empty, so every existing caller — the whole headless suite
       * included — keeps a world where nothing can be hit.
       */
      hazards?: HazardField;
      /**
       * The world's shrub bodies — M15, by the same door for the same
       * reason. Soft foliage is an authored trigger volume with drag rather
       * than a property of a point of ground; `Game.installLevel` hands it
       * over, and the default keeps every headless world foliage-free.
       */
      softBodies?: SoftBodyField;
    } = {},
  ) {
    this.sampler = sampler;
    this.tuning = { ...defaultEucTuning(), ...options.tuning };
    this.surfaces = { ...defaultSurfaceResponses(), ...options.surfaces };
    this.spawn = options.spawn ?? { position: { x: 0, y: 0, z: 0 }, headingY: 0 };
    this.hazards = options.hazards ?? NO_HAZARDS;
    this.softBodies = options.softBodies ?? NO_SOFT_BODIES;
    this.reset();
  }

  /**
   * Change tuning while the game runs — this is what F4 writes through.
   *
   * Developer tuning, not a player option. The options firewall (invariant 5)
   * keeps player-configurable presentation out of `simulation/`; developer
   * tuning is the opposite thing and was always expected to reach the
   * controller from M2. They stay two mechanisms on purpose.
   */
  setTuning(values: Partial<EucTuning>): void {
    Object.assign(this.tuning, values);
  }

  /** Change one surface's response while the game runs. Also F4. */
  setSurfaceResponse(id: SurfaceId, values: Partial<SurfaceResponse>): void {
    const surface = this.surfaces[id];
    if (surface === undefined) return;
    Object.assign(surface, values);
  }

  /**
   * Put the rider back at the spawn, stopped and upright. `R` does this.
   *
   * `initialSpeed` is the one exception to "stopped", and it exists for the
   * chase's super tracker (M20.2): a cop regrouped onto the route mid-pursuit
   * arrives *riding*, because a cop who materialised at a standstill would be
   * re-outrun before he finished accelerating and the regroup would have
   * bought nothing. Every player-facing reset leaves it at its default.
   */
  reset(spawn?: Spawn, initialSpeed = 0): void {
    if (spawn) this.spawn = spawn;

    this.x = this.spawn.position.x;
    this.z = this.spawn.position.z;
    this.headingY = this.spawn.headingY;

    this.speed = initialSpeed;
    this.leanPitch = 0;
    this.riderPitch = 0;
    this.slopeLean = 0;
    this.riderLookYaw = 0;
    this.riderTurnTwist = 0;
    this.technicalTurn = 0;
    this.longitudinalAccel = 0;
    this.rollAngle = 0;
    this.yawRate = 0;
    this.lateralAccel = 0;
    this.lateralLimited = false;
    this.wheelSpin = 0;
    this.distanceTravelled = 0;
    this.reversing = false;
    this.reverseHold = 0;
    this.reverseBlend = 0;
    this.restHold = 0;
    this.restFactor = 0;
    this.state = 'mounted';

    this.slope = 0;
    this.slopeAccel = 0;
    this.suspensionOffset = 0;
    this.suspensionVelocity = 0;
    this.suspensionCompression = 0;
    this.curbAhead = 0;
    this.lastStepUp = 0;
    this.blocked = false;
    this.obstacleEscapeArmed = false;
    this.collisionImpact = 0;
    // Cleared rather than re-probed, so a rider restored *onto* a hazard is
    // charged for it on the first step of the new life. That is the honest
    // reading — the restore put them there, and if they are still in it when
    // invulnerability lapses they are genuinely in it.
    this.inHazard = false;
    this.inSoftBody = false;

    // A reset lands the rider on the ground, upright, with nothing in flight.
    // Quick reset is also M6's crash recovery and M10's checkpoint respawn, and
    // a respawn that inherited a hop in progress would drop the rider out of
    // the sky at the checkpoint.
    this.airborne = false;
    this.verticalVelocity = 0;
    this.airDirX = Math.sin(this.headingY);
    this.airDirZ = Math.cos(this.headingY);
    this.airTime = 0;
    this.airApex = 0;
    this.compressTimer = 0;
    this.compressing = false;
    this.crouchHold = 0;
    this.hopCharge = 0;
    this.hopWasHeld = false;
    this.hops = 0;
    this.crouch = 0;
    this.tuck = 0;
    this.absorb = 0;
    this.airBlend = 0;
    this.airPitch = 0;
    this.landingTimer = 0;
    this.landingQuality = 'none';
    this.landingImpact = 0;
    this.landingMisalignment = 0;
    this.landingScore = 0;
    this.landingSpeedLoss = 0;
    this.landings = 0;
    this.pedalStrike = 0;
    this.justTookOff = false;
    this.justTouchedDown = false;

    // A reset is a fresh run: the crash count and the wobble the rider had
    // built up both belong to a ride that no longer happened. Crash *recovery*
    // is a different operation and keeps them — see `respawn`.
    this.crashes = 0;
    this.clearInstability();
    this.crashCause = 'none';
    this.crashMotion = 'none';
    this.safeX = this.x;
    this.safeZ = this.z;
    this.safeHeading = this.headingY;
    this.safeHold = 0;

    this.sampler.sampleGround(this.x, this.z, this.ground);
    this.y = this.ground.height;
    this.groundY = this.ground.height;
    this.surface = this.ground.surface;
    this.offCourse = this.ground.offCourse;
    this.grounded = true;
    this.pedalClearance = Math.atan2(this.tuning.pedalHeight, this.tuning.pedalHalfSpan);

    const response = this.surfaceResponse();
    this.rollingResistance = response.rollingResistance * this.tuning.rollingResistanceScale;
    this.lateralLimitG = this.tuning.maxLateralG * response.grip;
    // A reset onto a slope must land already tilted, or the first frame after
    // `R` draws the rig level on a hill and eases into the truth.
    this.writeGroundTilt(1);
    // And a reset onto rough ground must land already settled. Starting the
    // spring at zero when the roughness field under the wheel is not zero makes
    // every reset onto grass or gravel bounce for a second, which reads as the
    // rider landing from a drop they did not take.
    this.suspensionOffset = roughnessAt(
      this.x,
      this.z,
      response.roughnessAmplitude,
      response.roughnessWavelength,
    );
  }

  /** One fixed simulation step. */
  step(dt: number, actions: ActionSnapshot): void {
    if (dt <= 0) return;
    const t = this.tuning;

    const throttle = clamp(safeAxis(actions.throttle), -1, 1);
    const steer = clamp(safeAxis(actions.steer), -1, 1);

    this.justTookOff = false;
    this.justTouchedDown = false;
    this.collisionImpact = 0;

    // -- 0a. A crash owns the whole step (M6) -------------------------------
    // Everything below is a rider riding. While they are off the wheel there is
    // no lean, no steering, no hop, and no landing score — there is a wheel
    // rolling on under its own momentum and a scripted separation playing out.
    // Returning here rather than threading a flag through forty lines of force
    // model is what keeps the riding path exactly what it was.
    if (this.crashing) {
      this.stepCrash(dt, throttle, steer, actions.crouch);
      return;
    }

    const previousSpeed = this.speed;

    // The surface and normal under the wheel come from the previous step's
    // probe, which is one fixed step — eight milliseconds — of lag at a
    // surface boundary. Sampling again here to remove it would double the
    // ground queries per step to erase something nobody can perceive.
    const response = this.surfaceResponse();
    const forwardX = Math.sin(this.headingY);
    const forwardZ = Math.cos(this.headingY);

    // -- 0. Hop: charge, compression, launch (M5) ---------------------------
    // Runs first because everything below branches on whether the wheel is on
    // the ground, and a hop pressed this step should leave on this step.
    this.stepHop(dt, actions);
    const airborne = this.airborne;

    // -- 0b. The power ladder (M6) ------------------------------------------
    // Placed before the lean because tilt-back is a *ceiling* on it, and a
    // ceiling applied after the fact would be a second force rather than the
    // wheel refusing the rider's demand. It reads the previous step's speed,
    // slope, and acceleration — the same eight milliseconds of lag the surface
    // sample carries, for the same reason, and invisible against a load whose
    // own time constant is half a second.
    this.stepPower(dt);

    // -- 1. Lean, the state variable everything longitudinal hangs off ------
    // In the air the force lean decays to neutral: there is no contact patch to
    // push against, and letting it build through a flight would fire a full-
    // authority launch at the instant of touchdown.
    //
    // **Tilt-back enters here and nowhere else** (`docs/PLANS.md` §4.5). A real
    // wheel tips its pedals back until the rider has to lean back with them; in
    // this game's inverted control loop that is exactly a ceiling on the force
    // lean, pulled past neutral as the stage engages. With `tiltBack` at zero
    // the ceiling is `maxLeanPitch` and `Math.min` returns the demand
    // unchanged, which is why the M2 ride survives this line untouched. Braking
    // is never capped: a rider asking for more lean-back than the ceiling still
    // gets all of it.
    const leanCeiling = lerp(t.maxLeanPitch, -t.tiltBackLeanBack, this.tiltBack);
    this.leanPitch = approach(
      this.leanPitch,
      airborne ? 0 : Math.min(throttle * t.maxLeanPitch, leanCeiling),
      t.leanResponseSeconds,
      t.leanRateLimit,
      dt,
    );

    // -- 2. Drive or brake --------------------------------------------------
    const demand = Math.sin(this.leanPitch);
    // A demand below the idle threshold is not a demand. Lean decays
    // exponentially and never exactly reaches zero, so without this guard a
    // released brake leaves an epsilon of opposing lean that classifies every
    // subsequent coast as `braking` forever.
    const idle = Math.abs(demand) < 0.01;
    // Lean opposing travel is a brake, and a wheel brakes far harder than it
    // pulls. Below the stopped threshold there is no travel to oppose, so the
    // drive coefficient applies and the reverse gate below decides the rest.
    const braking = !airborne
      && !idle && demand * this.speed < 0 && Math.abs(this.speed) > t.stoppedSpeed;
    const accel = airborne ? 0 : (braking ? t.brakeAuthority : t.leanToAccel) * demand;

    // -- 2b. The slope term (M4) -------------------------------------------
    // `docs/PLANS.md` §4.1 has had this line since the plan was approved:
    // `- g * sin(slopeAngle)`, with the note that "hills fall out for free".
    // They do. It is written against the surface normal rather than against an
    // authored gradient, so it is exactly right on an arbitrary heightfield and
    // exactly zero on flat ground — which is what keeps the M2 ride the owner
    // approved bit-for-bit unchanged on the pavement it was approved on.
    //
    // Zero in the air, where there is no surface to be on. Gravity has not
    // stopped acting — it is integrated on the *vertical* axis in section 8b,
    // which is the whole difference between rolling down a hill and falling.
    this.slopeAccel = airborne
      ? 0
      : slopeAccelFor(this.ground.normal, forwardX, forwardZ, t.gravity);
    this.slope = this.slopeAccel === 0
      ? 0
      : Math.asin(clamp(-this.slopeAccel / t.gravity, -1, 1));

    let speed = this.speed + (accel + this.slopeAccel) * dt;

    // -- 3. Resistance ------------------------------------------------------
    // Quadratic drag gives a top speed that emerges from the model instead of
    // being clamped. Rolling resistance is now the surface's own, scaled — the
    // one read `data/tuning.ts` said M4 would replace, and the only change to
    // the longitudinal model besides the slope term above. Both terms are
    // applied as a magnitude that cannot push the speed through zero: a
    // resistance that flips the sign of the thing it resists is a resistance
    // that drives the wheel backwards at a standstill.
    //
    // Rolling resistance needs a contact patch, so an airborne wheel loses it
    // outright — and keeps only a fraction of the drag, because
    // `dragCoefficient` is a top-speed shaper rather than an aerodynamic
    // model and most of what it stands in for cannot act on a wheel that is
    // not touching the ground. The full argument, with the number a hop cost
    // before the fraction existed, is in `data/tuning.ts`.
    this.rollingResistance = airborne
      ? 0
      : response.rollingResistance * t.rollingResistanceScale;
    const drag = t.dragCoefficient * (airborne ? t.airDragFactor : 1);
    const resist = (drag * speed * speed + this.rollingResistance) * dt;
    if (speed > 0) speed = Math.max(0, speed - resist);
    else if (speed < 0) speed = Math.min(0, speed + resist);

    // -- 4. The reverse gate ------------------------------------------------
    // Untouched by M4. Reverse exists for repositioning and turning around, not
    // as a fantasy, so it is reachable only from a near standstill and only
    // after the rider asks a second time. The consequence on a hill — a stopped
    // wheel does not roll backwards — is deliberate and is argued at the top of
    // this file.
    //
    // Skipped entirely in the air, where a held brake commands nothing and a
    // stopped-means-stopped clamp would be arguing with a ballistic
    // trajectory. The dwell is cleared rather than paused: a rider who wants
    // reverse after landing can ask again, which is the whole point of a gate
    // that has to be asked twice.
    if (airborne) {
      this.reverseHold = 0;
    } else if (!this.reversing) {
      // Intent comes from the semantic input, not from smoothed lean.
      const askingBackward = throttle < -0.01;
      if (askingBackward && Math.abs(this.speed) <= t.reverseEntrySpeed) {
        this.reverseHold += dt;
      } else {
        this.reverseHold = 0;
      }
      if (this.reverseHold >= t.reverseEngageSeconds && askingBackward) {
        this.reversing = true;
      }
      // Not yet cleared to reverse: a stop is a stop.
      if (speed < 0) speed = 0;
    } else {
      this.reverseHold = 0;
      speed = Math.max(speed, -t.maxReverseSpeed);
      // Leaving reverse is asking to go forward again, once actually stopped.
      if (throttle >= 0 && speed >= -t.stoppedSpeed) {
        this.reversing = false;
        if (speed < 0) speed = 0;
      }
    }

    // -- 5. Steering, and the clamp that makes fast turns wide --------------
    // The falloff exponent (M16) shapes the decay without moving either end:
    // the first moving step gets `yawRateLow`, `carveSpeed` still gets
    // `yawRateHigh`, and above 1 the authority holds up through the slow band
    // instead of being half spent by ten miles an hour. `Math.pow` on a
    // clamped non-negative base is safe for any exponent the panel allows.
    const speedFactor = clamp01(Math.abs(speed) / t.carveSpeed) ** t.yawFalloffExponent;
    const maxYawRate = lerp(t.yawRateLow, t.yawRateHigh, speedFactor);

    // **The sign here is load-bearing, and it is not the obvious one.**
    //
    // The world is right-handed with +Y up and +Z forward, so the rider's right
    // hand points along `forward x up`, which is -X — not +X. A positive
    // rotation about +Y swings the nose from +Z toward +X, which is the rider's
    // *left*. Steering right therefore has to produce a negative yaw rate.
    //
    // This is the exact failure AGENTS.md warns about, it survived the whole
    // headless suite because every assertion there was written in the same
    // wrong frame as the code, and it was caught by projecting a point on the
    // rider's right to screen space and finding it on the left.
    // A quarter authority in the air (`docs/PLANS.md` §4.4). It turns the
    // *wheel*, not the trajectory — see the air-direction note at the top of
    // this file — so the ceiling on it is about how much attitude a rider can
    // fix in flight, not about how far they can steer a jump.
    // The supplied real-rider breakdown names an on-the-spot body flick as a
    // separate emergency technique. Ordinary steer therefore cannot smuggle
    // that move in while the tyre is stopped; a future quick-turn action would
    // need its own input, risk and pose. Once the wheel is moving, even slowly,
    // this is the normal gentle/technical turn blend below.
    // A stationary rider normally cannot get the separate emergency body
    // pivot for free. Contact with a solid is the one contextual exception:
    // without it, a wheel that has come fully to rest pointing into a wall or
    // prop has no way to turn away and the only practical escape is Reset.
    const steeringArmed = airborne
      || Math.abs(speed) > t.stoppedSpeed
      || this.obstacleEscapeArmed;
    // **Steering is relative to travel, not to the nose** (M17).
    //
    // Yaw used to be applied in the machine's own frame at any speed, which is
    // faithful — twist right, the wheel yaws right, whichever way it is rolling
    // — and which nobody reads that way. Travelling backwards it put the input
    // at odds with both of the things the player is actually watching: press
    // right and the rider went backwards *left*, while leaning right, because
    // `lateralAccel = speed * yawRate` already reverses with the speed and so
    // the lean was travel-relative all along. Flipping the request with the
    // direction of travel is what puts the button, the lean and the path the
    // rider traces back into agreement.
    //
    // The owner reported it from play on both desktop and phone, and a player
    // had reported it before that (`FEEDBACK-TRIAGE.md` §1). It was never a
    // decision: it was the sign nobody had a reason to write down until reverse
    // became a 15 mph mechanic at M16 rather than a walking-pace nudge.
    //
    // The flip is discontinuous at a standstill, which costs nothing: steering
    // is disarmed below `stoppedSpeed` anyway, so the sense can only change
    // while the rider is stopped and the reverse gate is being asked twice.
    const travelRelative = t.reverseSteerTravelRelative > 0 && speed < 0 ? -1 : 1;
    const requestedYawRate = steeringArmed
      ? -steer * maxYawRate * (airborne ? t.airYawFactor : 1) * travelRelative
      : 0;

    // Clamping *lateral acceleration* rather than steering input is the key
    // detail of the whole steering model: the turn goes wide because of a limit
    // the rider can feel and learn, not because the game quietly threw away
    // part of the input. Surface grip scales both the ordinary limit and the
    // hard low-speed technique, so the same corner stays wider across grass.
    this.lateralLimitG = t.maxLateralG * response.grip;
    const absSteer = Math.abs(steer);
    const hardSteer = clamp01(
      (absSteer - t.technicalTurnSteerStart)
        / Math.max(1e-6, t.technicalTurnSteerFull - t.technicalTurnSteerStart),
    );
    const techniqueFade = 1 - clamp01(
      Math.abs(speed) / Math.max(1e-6, t.technicalTurnFadeSpeed),
    );
    const technicalLimitG = t.technicalTurnBonusG
      * hardSteer
      * techniqueFade
      * response.grip;
    const steeringLimit = (this.lateralLimitG + technicalLimitG) * t.gravity;
    let yawRate = requestedYawRate;
    let lateralAccel = 0;
    let lateralLimited = false;

    // No contact patch, no lateral force, and so no lateral limit: in the air
    // the heading simply turns. The clamp exists to model a tyre's grip, and
    // applying it to a wheel that is not touching anything would be modelling
    // the wrong thing — it would also make the wheel lean into a corner it is
    // not taking, because roll follows lateral acceleration.
    if (!airborne) {
      const absSpeed = Math.abs(speed);
      // A wheel that is not travelling generates no cornering force. Ordinary
      // steering also leaves its heading alone: the emergency body pivot is a
      // distinct technique, not a free side effect of full analog lock.
      if (absSpeed > 1e-6) {
        const magnitude = Math.abs(requestedYawRate);
        const direction = requestedYawRate < 0 ? -1 : 1;
        const delivered = Math.min(magnitude, steeringLimit / absSpeed);
        lateralLimited = delivered < magnitude - 1e-12;
        yawRate = direction * delivered;
        // Ground velocity follows heading, so every delivered degree of yaw
        // curves the path. M16's first pass omitted its "pivot" share here and
        // made the pose disagree with the trajectory the player was riding.
        lateralAccel = speed * yawRate;
      }
    }

    this.yawRate = yawRate;
    this.lateralAccel = lateralAccel;
    this.lateralLimited = lateralLimited;
    this.headingY += yawRate * dt;

    // -- 6. Roll ------------------------------------------------------------
    // The angle a rider actually leans to balance a cornering force. At the
    // 0.75 g pavement ceiling this is about 37 degrees, which is where a real
    // carve looks committed rather than like a crash in progress; on grass the
    // ceiling is lower, so the same corner is taken at less lean and more
    // radius, which is exactly the tell the exit question is about.
    this.rollAngle = approach(
      this.rollAngle,
      Math.atan(lateralAccel / t.gravity),
      t.rollResponseSeconds,
      Infinity,
      dt,
    );

    // A gentle analog input twists the hips and shoulders toward a wide turn.
    // A hard low-speed input fades that twist out and selects the differential
    // leg technique: wheel committed, outside leg bent, torso facing forward.
    const technicalTarget = airborne || Math.abs(speed) <= 1e-6
      ? 0
      : Math.sign(lateralAccel) * hardSteer * techniqueFade;
    this.technicalTurn = approach(
      this.technicalTurn,
      technicalTarget,
      t.turnTechniqueResponseSeconds,
      Infinity,
      dt,
    );
    const gentleSteer = absSteer <= 1e-6
      ? 0
      : clamp01(absSteer / Math.max(1e-6, t.technicalTurnSteerStart)) * (1 - hardSteer);
    const gentleTarget = airborne || this.reversing
      ? 0
      : -Math.sign(steer) * gentleSteer * t.gentleTurnTorsoTwist;
    this.riderTurnTwist = approach(
      this.riderTurnTwist,
      gentleTarget,
      t.turnTechniqueResponseSeconds,
      Infinity,
      dt,
    );

    // -- 6b. Pedal strike (M5) ----------------------------------------------
    // Placed here because it is a consequence of the lean the previous line
    // just settled, and its speed cost has to land before the move below
    // spends it. `updatePedalStrike` derives the clearance angle from the
    // wheel's own pedal geometry and the suspension's current travel.
    this.updatePedalStrike(airborne);
    if (this.pedalStrike !== 0) {
      const scrub = t.pedalStrikeDecel * Math.abs(this.pedalStrike) * dt;
      speed = speed > 0 ? Math.max(0, speed - scrub) : Math.min(0, speed + scrub);
    }
    // Scrub changes the speed this step will actually move at. Keep the public
    // force readout on that final path; otherwise the very pedal event caused
    // by the bank makes `lateralAccel !== speed * yawRate` in the snapshot.
    if (!airborne) this.lateralAccel = speed * yawRate;

    // -- 6c. Wobble (M6) ----------------------------------------------------
    // After the roll and the scrape it reads, and before the move it steers.
    // The two impulse sources that happen later in the step — mounting a kerb
    // and landing — add to the energy where they occur and are answered on the
    // following step, which is eight milliseconds and is what keeps this in one
    // place instead of three.
    this.stepWobble(dt, throttle, steer, speed, airborne, response);

    // -- 7. Rider fore-aft presentation -------------------------------------
    // Force lean and visible body pitch are related but not identical: lean
    // farther while speed is changing, then settle once acceleration is over.
    // Only acceleration whose sign agrees with the current demand counts as the
    // rider's own effort — drag overrunning a partial forward hold is not a
    // brake, and the wheel still slowing after a brake-to-throttle swap is not
    // a deepening brake.
    //
    // In the air the action pose goes to neutral — "torso centered", motion
    // reference §12.3 — because nothing the rider does with the throttle is
    // producing force. The small attitude a rider *does* set in flight is
    // `airPitch` below, kept as its own state so it cannot be mistaken for
    // acceleration by anything that reads the action pose.
    const activeAcceleration = airborne
      ? 0
      : throttle > 0
        ? Math.max(0, this.longitudinalAccel)
        : throttle < 0
          ? Math.min(0, this.longitudinalAccel)
          : 0;
    // The generic load pose belongs to acceleration and braking while moving
    // forward. Once the near-standstill reverse request has begun, the
    // look-behind stance is the complete presentation: carrying the old deep
    // brake lean into its dwell and then into reverse makes the rider hinge
    // backwards underneath an otherwise natural shoulder check. This changes
    // presentation only; the force lean above still drives the approved gate
    // and reverse acceleration exactly as before.
    const reversePoseActive = this.reversing || this.reverseHold > 0;
    const riderPitchTarget = airborne || reversePoseActive ? 0 : clamp(
      this.leanPitch * t.riderCruisePitchFactor
        + activeAcceleration * t.riderAccelerationPitchGain,
      -t.maxRiderPitch,
      t.maxRiderPitch,
    );
    this.riderPitch = approach(
      this.riderPitch,
      riderPitchTarget,
      t.riderPitchResponseSeconds,
      t.leanRateLimit,
      dt,
    );

    // -- 7c. Attitude in the air (M5) ---------------------------------------
    // §4.4's "small pitch correction for landing alignment". Presentation
    // only: it changes no force and no landing score. It is here because a
    // blockout that stays rigidly level through a drop looks dead, and because
    // a rider genuinely does set the wheel's attitude in flight.
    this.airPitch = approach(
      this.airPitch,
      airborne ? throttle * t.airPitchAuthority : 0,
      t.airPitchResponseSeconds,
      Infinity,
      dt,
    );

    // -- 7a. Lean into the hill ---------------------------------------------
    // The rig no longer tilts fore-aft with the terrain (the pedals stay level
    // with gravity — see `writeGroundTilt`), so the hill has to be answered by
    // the *rider*: uphill of vertical by the gradient, which is the balance
    // equilibrium for holding a slope (`data/tuning.ts`). Faded out toward a
    // standstill, where the equilibrium really is vertical, and smoothed with
    // the ground-tilt constant because it chases the same faceted normal.
    // Kept out of `riderPitch` so the wheel's `wheelPitchFactor` share never
    // sees it; the sum is assembled in `writePose` and `snapshot`.
    const slopeLeanTarget = this.slope
      * t.riderSlopeLeanFactor
      * clamp01(Math.abs(this.speed) / Math.max(1e-6, t.riderSlopeLeanFullSpeed));
    this.slopeLean = approach(
      this.slopeLean,
      slopeLeanTarget,
      t.groundTiltResponseSeconds,
      Infinity,
      dt,
    );

    // -- 7b. Look into the turn ---------------------------------------------
    // Driven from steering *intent* rather than achieved yaw rate: the head
    // leads the turn, and yaw rate is throttled at speed by the lateral clamp,
    // so reading it would turn the head least in exactly the committed
    // high-speed carve where a real rider looks furthest through the corner.
    this.riderLookYaw = approach(
      this.riderLookYaw,
      -steer * t.riderLookIntoTurn,
      t.riderLookResponseSeconds,
      Infinity,
      dt,
    );

    // -- 7d. The look behind ------------------------------------------------
    // Riding backwards, the rider's eyes face away from the travel, so a real
    // rider opens their chest and looks back over a shoulder — the defining
    // asymmetry of the stance (`EUC_RIDER_MOTION_REFERENCE.md` §31 lists
    // "looking behind" as a required pose). During the confirmation dwell the
    // blend rises only to a *glance*, which turns the deliberate 0.35 s of
    // held second request from dead input time into the rider visibly
    // checking behind before rolling — and releasing the lean cancels the
    // glance exactly as it cancels the dwell. Presentation only: it changes
    // no force and no gate, and the gate's own tests are untouched.
    const reverseTarget = this.reversing
      ? 1
      : t.reverseGlanceFactor
        * clamp01(this.reverseHold / Math.max(1e-6, t.reverseEngageSeconds));
    this.reverseBlend = approach(
      this.reverseBlend,
      reverseTarget,
      t.reversePoseSeconds,
      Infinity,
      dt,
    );

    // -- 8. Gravity, then the move against ground that can refuse -----------
    // The vertical integration runs *before* the horizontal move so the wheel
    // is already at this step's height when the level is asked whether the
    // move is legal. The other order refuses a hop that starts against the
    // face of the kerb it is obviously meant to clear.
    //
    // The move itself uses the heading *after* this step's yaw, exactly as M2
    // did — except in the air, where it uses the direction the wheel took off
    // in and the heading is nobody's business but the landing score's.
    const previousY = this.y;
    if (airborne) {
      this.verticalVelocity -= t.gravity * dt;
      this.y += this.verticalVelocity * dt;
      this.airTime += dt;
    }

    // **The wobble is spent here** (M6). On the ground the wheel travels along
    // `headingY + wobbleYaw`, so an oscillating wheel genuinely weaves; the
    // stored heading never sees the offset, so a wobble can never accumulate
    // into a turn, and the chase camera reads the clean heading so its aim does
    // not saw back and forth at four hertz. In the air `wobbleYaw` is zero —
    // there is no contact patch to oscillate against.
    const travelHeading = this.headingY + this.wobbleYaw;
    const travelX = airborne ? this.airDirX : Math.sin(travelHeading);
    const travelZ = airborne ? this.airDirZ : Math.cos(travelHeading);
    const intended = speed * dt;
    const moved = this.advance(travelX * intended, travelZ * intended, dt, speed, airborne);
    speed = moved.speed;
    this.collisionImpact = moved.impactSpeed;

    this.surface = this.ground.surface;
    this.offCourse = this.ground.offCourse;
    this.groundY = this.ground.height;

    // **The kerb costs speed, and only speed** (M13). M6 added the wobble half
    // that `docs/PLANS.md` §6 beat 3 had asked for since the plan was approved
    // — "rolling over it unhopped costs speed and injects wobble" — and M13
    // removed it again, because the owner's §13 q8 trigger set is hazards and
    // nothing else. Hopping a kerb is still the fast line; it is no longer also
    // the safe one. The speed cost is upstream in `advance`, untouched.

    // -- 8b. Contact: land, leave the ground, or stay on it -----------------
    let landed = false;
    if (airborne) {
      if (this.y <= this.groundY && this.verticalVelocity <= 0) {
        // `response` was captured at the top of the step for the surface the
        // wheel occupied before moving. Landing quality belongs to the contact
        // patch just sampled by `advance`, which may be a different material
        // on this very step (pavement takeoff, gravel touchdown).
        speed = this.land(speed, this.surfaceResponse());
        landed = true;
      } else if (this.y - this.groundY > this.airApex) {
        this.airApex = this.y - this.groundY;
      }
    } else if (moved.excess < -t.dropLaunchThreshold) {
      // The ground fell away by more than the surface the wheel is on
      // predicted it would: a ledge, not a gradient. The wheel leaves at the
      // height it was riding at, carrying the vertical rate the slope was
      // already giving it — which is what turns a ramp crest into a jump with
      // no ramp-specific code anywhere.
      this.leaveGround(previousY, speed * Math.sin(this.slope), travelX, travelZ);
    } else {
      this.y = this.groundY;
    }
    this.grounded = !this.airborne;

    // -- 8b2. Hazards (M13) -------------------------------------------------
    // **Charged once, on the way in.** `inHazard` holds the level and this
    // branch fires on its rising edge, so what a hole costs is a property of
    // the hole rather than of how long the rider spent crossing it.
    //
    // Asked only on the ground, which is the whole of "you can hop a pothole":
    // a rider airborne over one is not in it, so the edge never rises and the
    // hole never fires. It is also why the query is skipped rather than
    // discarded — a jump is not the moment to pay for a spatial lookup.
    //
    // A spill is not tested here at all. It is ground, its response arrives
    // through `response.wobbleInjection` in `stepWobble` for as long as the
    // wheel is on it, and the difference is the gameplay: you ride *out* of a
    // puddle, and you have already hit the pothole.
    let hazardCrash = false;
    let hazardStruck = false;
    const hazard = this.airborne ? null : this.hazards.at(this.x, this.z);
    if (hazard !== null && !this.inHazard) {
      hazardStruck = true;
      const deep = hazard.kind === 'potholeDeep';
      // **The owner's speed gate** (§13): a deep hole is a wipeout at riding
      // speed and a survivable disaster below it. Tested on the speed the
      // wheel arrived with, before this step's cost is taken off it, or the
      // cost would be deciding the outcome it is supposed to be part of.
      if (deep && Math.abs(speed) >= t.hazardCrashSpeed) {
        hazardCrash = true;
      } else {
        this.injectWobble(deep ? t.hazardDeepEnergy : t.hazardShallowEnergy);
        const cost = deep ? t.hazardDeepSpeedCost : t.hazardShallowSpeedCost;
        // Toward zero rather than through it: a hole slows a wheel down, and a
        // rider who hits one slowly enough should stop, not reverse out of it.
        speed = speed >= 0
          ? Math.max(0, speed - cost)
          : Math.min(0, speed + cost);
      }
    }
    this.inHazard = hazard !== null;

    // -- 8b3. Soft foliage (M15) --------------------------------------------
    // A bush is a cushion, not a wall: heavy drag for as long as the wheel is
    // inside the dense body, a wobble charged once on the way in, and no
    // direct crash funnel at any speed. The forum's "reacts like a boulder" was the
    // M12 shrub fix overcorrecting into `plan.solids`; the boxes now arrive
    // as trigger volumes through the same door hazards use, so the sampler's
    // obstacle casts never see them. Skipped in the air for the hazard's own
    // reason — a rider hopping *over* a hedge is not in it. The owner classified
    // bushes as soft hazards on 2026-08-11: they may trigger wobble, while clean
    // riding, speed, carving, and ordinary rough ground still may not.
    let softStruck = false;
    const inFoliage = !this.airborne
      && !this.softBodies.empty
      && this.softBodies.contains(this.x, this.y, this.z);
    if (inFoliage) {
      if (!this.inSoftBody) {
        softStruck = true;
        this.injectWobble(t.softBodyWobbleEnergy);
      }
      const drag = (t.softBodyDrag + t.softBodyDragQuadratic * speed * speed) * dt;
      speed = speed >= 0 ? Math.max(0, speed - drag) : Math.min(0, speed + drag);
    }
    this.inSoftBody = inFoliage;

    this.speed = speed;
    // **A landing scrub is the ground taking speed, not the rider braking.**
    // Left in the reported acceleration it would drive the action pose into a
    // hard braking crouch for the two steps after every drop, which is the
    // opposite of the absorb the motion reference asks for. A hazard's speed
    // cost is the same kind of thing arriving through a different door, and a
    // bigger step change than any landing scrub, so it is excluded for the
    // same reason rather than left to slam the pose into a brake it never made.
    // A soft body's *entry* lurch is excluded with them; the sustained drag
    // while ploughing on through is left in, because a rider bracing against
    // deceleration is exactly what pushing through a hedge looks like.
    this.longitudinalAccel = landed || hazardStruck || softStruck
      ? 0
      : (speed - previousSpeed) / dt;

    // The tyre rolls along its own axis, so it turns by the displacement along
    // the direction of *travel* — which is not the path length once a blocked
    // move has been resolved onto one axis, and is not the heading once the
    // wheel is in the air and yawing away from where it is going.
    this.wheelSpin += (moved.keptX * travelX + moved.keptZ * travelZ) / t.wheelRadius;
    this.distanceTravelled += moved.distance;

    this.writeGroundTilt(dt);
    this.stepCrouch(dt, actions);
    this.stepSuspension(dt, response);
    this.readFeeler(Math.sin(this.headingY), Math.cos(this.headingY));

    // Presentation only, and smoothed at both edges so the arms opening and
    // the head dropping toward the landing cannot switch on in one frame.
    this.airBlend = approach(
      this.airBlend,
      this.airborne ? 1 : 0,
      t.crouchResponseSeconds,
      Infinity,
      dt,
    );

    // -- 8c. Has this become a crash? (M6, a fourth funnel at M13) ----------
    // Wobble past its threshold is §4.5's own rule; a landing scored `crash` is
    // §4.4's tier finally having the consequence M5 declined to guess at; a
    // sufficiently hard collision is the vision §9's named "collision with an
    // obstacle" crash; and a deep pothole taken at speed is the owner's own
    // §13 answer — "deep potholes = wipeout".
    //
    // The hazard funnel is tested **first among the real ones**, ahead of the
    // obstacle and the oscillator, because it is the only one that already
    // knows its own cause. A deep hole hit at speed while a wobble happened to
    // be running out would otherwise be reported as a wobble crash, and the
    // results screen would name the thing the rider recovered from instead of
    // the thing that got them. Invulnerability still outranks all four: the
    // rider restored into a world cannot be killed by it on arrival.
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    } else if (hazardCrash) {
      this.beginCrash('hazard', speed);
    } else if (this.collisionImpact >= t.obstacleCrashSpeed) {
      this.beginCrash('obstacle', speed);
    } else if (this.wobbleEnergy >= t.wobbleCrashEnergy) {
      // Attributed to the scrape if a pedal is on the ground at the moment the
      // oscillation runs away, because that is a different motion: the wheel
      // has been deflected out from under the rider rather than left behind.
      this.beginCrash(this.pedalStrike !== 0 ? 'pedalStrike' : 'wobble', speed);
    } else if (landed && this.landingQuality === 'crash') {
      this.beginCrash('landing', speed);
    } else if (this.overspeedHold >= t.cutoutHoldSeconds) {
      // **Last of the five, and the ordering is the story rather than the
      // physics** — M20. Every funnel above is something the rider rode into
      // and this one is the machine letting go, so a rider who reaches the edge
      // of the speed range *and* drops into a pothole on the same step is told
      // about the pothole. It cannot fire before the beeps have been sounding
      // at their fastest for `cutoutHoldSeconds`, which is what makes it the
      // consequence of a warning rather than an ambush.
      this.beginCrash('cutout', speed);
    }

    // -- 9. State -----------------------------------------------------------
    // The M5 conditions are tested first, in this order: being off the ground
    // outranks everything, a compression is a hop already committed to, a
    // landing is the moment just after one, and a scraping pedal is something
    // the rider has to be told about. When none of them holds — which is every
    // step of the riding the owner accepted at M2 — what remains below is
    // exactly M2's classification, unchanged.
    //
    // **M6 inserts its four states by the same rule.** A crash outranks
    // everything, because the rider is not on the wheel. `tiltBack` goes above
    // `braking` because it *is* a demand — the machine's, overriding the
    // rider's. `wobbling` goes last of all, below even `pedalStrike`, and that
    // ordering is deliberate: a scrape is a specific condition the rider fixes
    // by leaning less, and it is usually the *cause* of the wobble sitting
    // above it, so reporting the general symptom over the specific cause would
    // lose the actionable half. Wobble is the one M6 state that loses nothing
    // by being masked — it has its own scalar on the snapshot, its own colour
    // on the machine's status light, and its own stance in the rig.
    if (this.landingTimer > 0) this.landingTimer = Math.max(0, this.landingTimer - dt);
    if (this.recoverTimer > 0) this.recoverTimer = Math.max(0, this.recoverTimer - dt);

    if (this.crashing) this.state = 'crashing';
    else if (this.airborne) this.state = 'airborne';
    else if (this.compressing) this.state = 'compressing';
    else if (this.recoverTimer > 0) this.state = 'recovering';
    else if (this.landingTimer > 0) this.state = 'landing';
    else if (this.tiltBackLatched) this.state = 'tiltBack';
    // Classified from lean rather than from the key, because lean is what the
    // wheel is actually doing.
    //
    // **Braking outranks a scrape**, which is the opposite of the first
    // arrangement and is worth the sentence. A brake is a demand the rider is
    // making; a scrape is a condition they are in, and it is already on the
    // snapshot as a signed depth with its own field. Letting the condition
    // mask the demand lost information — a hard brake into a corner reported
    // `pedalStrike` and nothing downstream could tell it was braking — for no
    // gain at all.
    else if (braking) this.state = 'braking';
    else if (this.pedalStrike !== 0) this.state = 'pedalStrike';
    else if (this.wobbleEnergy >= t.wobbleStateEnergy) this.state = 'wobbling';
    // During the reverse-confirmation dwell the rider is asking backward but
    // the wheel is intentionally held at zero. Calling that `rolling` makes
    // every consumer disagree with the authoritative speed.
    else if (Math.abs(speed) <= t.stoppedSpeed && !this.reversing) this.state = 'mounted';
    else if (idle) this.state = 'coasting';
    else this.state = 'rolling';

    // -- 10. The stopped rest stance ----------------------------------------
    // An EUC cannot stand on its own, so a genuinely stopped rider grounds a
    // foot (the owner's photographs; motion reference §15 "Stopped balance").
    // "Genuinely" is the work here: stopped AND asking for nothing. Steering
    // pivots the wheel on the spot at a standstill and the reverse dwell is a
    // held backward request, so either keeps both boots on the pedals. This is
    // a presentation blend, not a state — `mounted` stays the authoritative
    // state, no input is gated on it, and the wheel pulls away from rest at
    // exactly the speed it pulls away from a plain stop.
    const wantsRest = this.state === 'mounted'
      && Math.abs(throttle) < 0.01
      && Math.abs(steer) < 0.01;
    this.restHold = wantsRest ? this.restHold + dt : 0;
    const resting = this.restHold >= t.restDelaySeconds;
    this.restFactor = approach(
      this.restFactor,
      resting ? 1 : 0,
      resting ? t.restResponseSeconds : t.restReleaseSeconds,
      Infinity,
      dt,
    );

    // -- 11. Remember somewhere safe to come back to (M6) -------------------
    this.updateSafePosition(dt);
  }

  /**
   * Keep the last validated safe position up to date (`docs/PLANS.md` §4.5).
   *
   * **Validated is doing real work.** The rider has to be on the ground, on the
   * authored course rather than the surround, not being refused by anything
   * solid, actually moving, and not already in trouble — and all of that has to
   * have held continuously for `crashSafeDelaySeconds`. The delay is what makes
   * this useful rather than merely recent: without it a wobble crash would
   * restore the rider a tenth of a second before they lost it, on the same
   * gravel, at the same speed, and they would lose it again immediately.
   *
   * Once the hold is satisfied the position keeps updating every step, so what
   * is stored is always "where the rider was after the last stretch of
   * unremarkable riding" — which for a wall is just short of the wall, and for
   * a wobble is before the wobble began.
   */
  private updateSafePosition(dt: number): void {
    const t = this.tuning;
    const safe = this.grounded
      && !this.crashing
      && !this.offCourse
      && !this.blocked
      && !this.compressing
      // **Not standing in one, and not standing on one** — M13, and the two
      // halves come from different places on purpose. `inHazard` is the
      // pothole broadphase; the spill is read straight off the ground, because
      // it *is* the ground and asking the surface is both cheaper and the only
      // answer that cannot disagree with what the wheel is actually riding on.
      //
      // Without this a rider who loses it inside a wide spill can have that
      // exact spot stored as the last place they were riding cleanly, and be
      // restored into it. The invulnerable window holds energy at zero on
      // arrival so it is not an infinite loop — it is worse than a loop: they
      // come out of invulnerability already standing in the thing that got
      // them, with no idea why it happened twice.
      && !this.inHazard
      // A rider ploughing through a hedge is not somewhere to restore to,
      // for the pothole's own reason (M15).
      && !this.inSoftBody
      && this.surface !== 'spill'
      && this.wobbleEnergy < t.crashSafeWobbleCeiling
      && this.tiltBack < 1e-6
      && Math.abs(this.speed) > t.stoppedSpeed;

    if (!safe) {
      this.safeHold = 0;
      return;
    }

    this.safeHold = Math.min(this.safeHold + dt, t.crashSafeDelaySeconds);
    if (this.safeHold < t.crashSafeDelaySeconds) return;

    this.safeX = this.x;
    this.safeZ = this.z;
    this.safeHeading = this.headingY;
  }

  /**
   * The power ladder (`docs/PLANS.md` §4.5), as one scalar and four rungs.
   *
   * "The system should not require the player to understand electrical
   * engineering" (the vision, §8.2), so there is no battery here, no
   * temperature, and no motor curve — only the four inputs §4.5 names: how fast
   * the wheel is going, how steep the ground is, how hard the rider is asking,
   * and what the last landing cost.
   *
   * **The response is asymmetric, and that is what the ladder is about.** Load
   * rises in half a second and falls back over more than a second, so a moment
   * of full throttle does not climb it and a long climb at speed does — which
   * is the difference between a number and a *demand*. It also stops a faceted
   * heightfield normal from flickering the stage on rolling ground.
   *
   * **Cutout is DEFERRED**, and the slice's "generous invisible assist" is
   * simply that there is no failure rung: the ladder ends at tilt-back, which
   * caps speed until the demand falls and which the rider can ride out of.
   */
  private stepPower(dt: number): void {
    const t = this.tuning;

    // The decaying memory of the last landing. `land` tops it up.
    this.landingLoad = approach(this.landingLoad, 0, t.powerLandingDecaySeconds, Infinity, dt);

    const speed = Math.abs(this.speed);
    const speedTerm = clamp01(
      (speed - t.powerComfortSpeed)
        / Math.max(1e-6, t.powerLimitSpeed - t.powerComfortSpeed),
    );
    // **The hill term is power, not torque** — and the distinction is not
    // pedantry, it is what stops tilt-back from becoming a trap.
    //
    // Climbing costs `m g sin(theta) * v`, so it scales with how fast the hill
    // is being taken. Read as torque instead — a constant per gradient — the
    // load stays put while tilt-back removes the speed that produced it, the
    // release threshold is never reached, and a rider is stranded partway up a
    // hill by the very mechanism that was supposed to protect them. Scaled by
    // speed, tilt-back slows the wheel, the load falls, the stage lets go, and
    // the climb continues more slowly. Which is what a wheel at its limit
    // actually does.
    //
    // Climbing only: a descent gives headroom back rather than costing it, and
    // letting it subtract would allow a downhill to mask a demand the rider is
    // making.
    const slopeTerm = Math.max(0, Math.sin(this.slope))
      * t.powerSlopeLoad
      * clamp01(speed / Math.max(1e-6, t.powerLimitSpeed));
    // Only acceleration the rider asked for, normalised by the wheel's own
    // drive authority. Drag slowing the wheel is not a demand on it, and this
    // one is deliberately *not* scaled by speed: a launch is a torque spike
    // rather than sustained power, and at 0.25 it is small enough to register
    // as one without ever climbing a rung by itself.
    const accelTerm = Math.max(0, this.longitudinalAccel)
      / Math.max(1e-6, t.leanToAccel) * t.powerAccelLoad;

    // Nothing is being asked of a motor that is not touching the ground.
    const demand = this.airborne
      ? this.landingLoad
      : speedTerm + slopeTerm + accelTerm + this.landingLoad;

    this.loadFactor = approach(
      this.loadFactor,
      demand,
      demand > this.loadFactor ? t.powerResponseSeconds : t.powerReliefSeconds,
      Infinity,
      dt,
    );

    // Latched with hysteresis, because a stage that engages and releases at one
    // number hunts: tilt-back removes the drive that produced the load, the
    // load falls through the threshold, the drive comes back, and the wheel
    // surges. Engaging high and releasing lower is what makes it one event.
    if (this.tiltBackLatched) {
      if (this.loadFactor < t.powerTiltBackLoad * t.powerTiltBackRelease) {
        this.tiltBackLatched = false;
      }
    } else if (this.loadFactor >= t.powerTiltBackLoad) {
      this.tiltBackLatched = true;
    }

    this.tiltBack = approach(
      this.tiltBack,
      this.tiltBackLatched ? 1 : 0,
      this.tiltBackLatched ? t.tiltBackEngageSeconds : t.tiltBackReleaseSeconds,
      Infinity,
      dt,
    );

    this.powerStage = this.tiltBackLatched
      ? 'tiltBack'
      : this.loadFactor >= t.powerWarnLoad
        ? 'warn'
        : this.loadFactor >= t.powerNoticeLoad
          ? 'notice'
          : 'normal';

    this.stepOverspeed(dt, speed);
  }

  /**
   * The max-speed cutout's own clock — M20.
   *
   * **Deliberately not a fifth rung of the ladder above.** The ladder measures
   * *load*, which is what a hill and a hard landing produce; this measures
   * *speed*, which is what a straight and a full throttle produce. A rider
   * grinding up a gradient at half speed is on the ladder's top rung and is in
   * no danger here at all, and that is the correct answer to both questions.
   *
   * Everything is derived from `derivedTopSpeed`, so a tuning change to drag or
   * to lean authority moves the beeps and the edge together — M16's lesson,
   * where four constants that were secretly the old top speed had to be chased
   * down by hand and one of them silently revived a removed feature.
   *
   * **Airborne does not count.** A wheel with nothing under it is being asked
   * for no torque, so a jump taken at full speed does not cut out at the top of
   * its arc — and seeding a ragdoll in mid-air is not the wipeout anybody wants
   * to watch. The beeps keep sounding through the flight, because the rider is
   * still doing the speed that is about to be a problem when they land.
   */
  private stepOverspeed(dt: number, speed: number): void {
    const t = this.tuning;
    if (t.cutoutEnabled < 0.5) {
      this.overspeedFactor = 0;
      this.overspeedHold = 0;
      return;
    }

    const top = this.derivedTopSpeed;
    const from = top * t.overspeedBeepShare;
    const to = top * t.cutoutSpeedShare;
    // A guard rather than an assertion: both are live-tunable and an owner who
    // drags the start above the edge should get a silent wheel, not a division
    // by nothing and a rider who cuts out at walking pace.
    this.overspeedFactor = to > from ? clamp01((speed - from) / (to - from)) : 0;

    if (speed >= to && !this.airborne) {
      this.overspeedHold += dt;
    } else {
      // Reset rather than decayed, on the stray clock's own argument: a rider
      // who touches the edge twice in a minute is never punished for the first
      // one, and backing off is supposed to be the whole counterplay.
      this.overspeedHold = 0;
    }
  }

  /**
   * Wobble — the driven damped oscillator of `docs/PLANS.md` §4.5.
   *
   * ```
   * wobbleEnergy += ground.wobbleInjection * speed        (the spill, at M13)
   *              +  discrete hazard impulses              (the potholes)
   * wobbleEnergy -= damping(smoothInput) * wobbleEnergy * dt
   * yawOffset     = maxYaw * (energy / crashEnergy) * sin(phase)
   * ```
   *
   * **M13 replaced the trigger set with the owner's, and it is a short one.**
   * §13 q8 names liquid spills and shallow potholes as *the* things that start
   * a wobble, with deeper potholes bypassing it into a crash — and his reason
   * is the load-bearing part: the trigger has to be a situation the player can
   * see and choose to avoid, never a variable the ride imposes on them. So M6's
   * six sources are gone. Speed above a comfort threshold, ordinary surface
   * roughness, a scraping pedal, and a reversed carve all used to feed this and
   * no longer do; the kerb and the harsh landing kept their other costs (speed,
   * and the power ladder's landing load) but stopped feeding the oscillator.
   * What is left is the ground the rider is standing on and the impulses
   * `injectWobble` is handed, which after M13 means hazards.
   *
   * Two details survive from M6 unchanged because they were never the problem.
   *
   * **Damping is proportional to the energy**, which is what makes this a
   * damped oscillator rather than a constant drain. Passive damping is joined
   * by two recovery layers: Cool Rider automatically re-centres their feet once
   * a real wobble begins, and easing/slowing adds the stronger player-
   * controlled damping. That second layer is the whole answer to q8's "if the
   * rider does not reduce speed to correct it, they crash".
   *
   * **The amplitude is simply proportional to the energy**, with no visibility
   * threshold — which is the look the owner accepted before M6's rework and
   * asked for back (`data/tuning.ts`). It is only safe to ship that way because
   * of the paragraph above: with no continuous background source, any energy at
   * all means the rider hit something, so a permanently visible weave cannot
   * happen. Restoring the old look without also removing the old triggers would
   * have made every gravel spur weave forever.
   *
   * Nothing here fires on ordinary ground. Every surface but the spill carries
   * a zero `wobbleInjection`, so the M2–M5 ride stays bit-for-bit intact and
   * the hand-authored slice — which carries no hazards by the owner's §13 q9
   * answer — cannot wobble at all.
   */
  private stepWobble(
    dt: number,
    throttle: number,
    steer: number,
    speed: number,
    airborne: boolean,
    response: SurfaceResponse,
  ): void {
    const t = this.tuning;
    const before = this.wobbleEnergy;

    // -- Steering: has it been left alone? ----------------------------------
    // **Only ever read as recovery.** M6 charged a reversal of this sign
    // against the lean it threw away, and that is precisely the input the owner
    // ruled out at §13 q8 — carving is the thing he enjoys, so it cannot be the
    // thing that punishes him. All this tracks now is how long the steering has
    // held, which feeds the smoothness blend below.
    const steerSign = Math.abs(steer) < 0.01 ? 0 : steer > 0 ? 1 : -1;
    if (steerSign !== this.steerSign) {
      this.steerSign = steerSign;
      this.steerHold = 0;
    } else {
      this.steerHold += dt;
    }

    // Blended rather than switched, so damping cannot chatter on a rider
    // hovering at the throttle threshold — and so recovery reads as the wobble
    // settling rather than as it being switched off with a key.
    const smooth = Math.abs(throttle) <= t.wobbleSmoothThrottle
      && this.steerHold >= t.wobbleSmoothSteerSeconds
      ? 1
      : 0;
    this.wobbleSmoothness = approach(
      this.wobbleSmoothness,
      smooth,
      t.wobbleSmoothResponseSeconds,
      Infinity,
      dt,
    );

    // Experienced riders correct wobble through their feet. This is an active
    // recovery layer, not a second input binding: Cool Rider starts adjusting
    // once the instability is large enough to be a genuine event, while the
    // player's decision to ease off still adds the stronger damping above.
    // Blending both directions prevents a threshold chatter from flickering
    // the feet or switching damping on and off every fixed step.
    const footCorrectionTarget = !airborne
      && this.wobbleEnergy >= t.wobbleFootCorrectionStart
      ? 1
      : 0;
    this.wobbleFootCorrection = approach(
      this.wobbleFootCorrection,
      footCorrectionTarget,
      t.wobbleFootCorrectionResponseSeconds,
      Infinity,
      dt,
    );

    // The invulnerable window after a recovery holds the whole system at zero,
    // so a rider restored onto the gravel spur that just got them is not
    // immediately crashed again by the same ground (`docs/PLANS.md` §4.5).
    if (this.invulnerableTimer > 0) {
      this.wobbleEnergy = 0;
      this.wobblePhase = 0;
      this.wobbleYaw = 0;
      this.wobbleRoll = 0;
      this.wobbleSway = 0;
      this.wobbleRate = 0;
      this.wobbleFootCorrection = 0;
      return;
    }

    // -- Injection. Nothing off the ground: no contact patch, nothing to
    // oscillate against, and a wobble carried through a flight would land the
    // rider already half-crashed for something that happened before take-off.
    //
    // One term, where M6 had three. The two that went are the ones that made
    // wobble something the ride did *to* the player: speed above a comfort
    // threshold, and a scraping pedal — which is a hard carve, so it failed the
    // owner's rule twice over. What is left is the ground itself, and after M13
    // the only surface carrying a non-zero `wobbleInjection` is the spill.
    if (!airborne) {
      const injection = response.wobbleInjection * Math.abs(speed) * t.wobbleSurfaceGain;
      this.wobbleEnergy += injection * clamp01(t.wobbleMasterGain) * dt;
    }

    // -- The diagnostic probe (M13 Phase 0), off at zero metres and shipped off.
    //
    // Wobble's redesign has to be *ridden* before the hazards that trigger it
    // are worth building — §12 records a second fun-test failure as the top risk
    // of this milestone, and the cheapest place to discover one is before any
    // level data exists. But at Phase 0 nothing in any world can start a wobble,
    // and the owner rides on a handset where the F4 panel cannot be reached at
    // all. So the probe delivers a hazard-shaped impulse every so many metres of
    // ground covered: no input to bind, no touch affordance to design, nothing
    // that has to be aimed at, and — because it counts distance on the fixed
    // step rather than seconds on a clock — `advance(n)` still reaches the same
    // wobble every run.
    if (t.wobbleProbeMetres > 0 && !airborne) {
      this.wobbleProbeDistance += Math.abs(speed) * dt;
      if (this.wobbleProbeDistance >= t.wobbleProbeMetres) {
        this.wobbleProbeDistance -= t.wobbleProbeMetres;
        this.injectWobble(t.wobbleProbeEnergy);
      }
    }

    const damping = lerp(t.wobbleDampingAggressive, t.wobbleDampingSmooth, this.wobbleSmoothness)
      + this.wobbleFootCorrection * t.wobbleFootCorrectionDamping;
    this.wobbleEnergy = Math.max(0, this.wobbleEnergy - damping * this.wobbleEnergy * dt);
    this.wobbleRate = (this.wobbleEnergy - before) / dt;

    // -- The oscillation. Advanced by the fixed step, never by wall time, for
    // the same reason the particles are: `advance(n)` has to reach the same
    // phase every run or a frozen capture of a wobble means nothing.
    //
    // **The frequency rises with the energy** (M13). The owner's second Phase
    // 0 ride supplied the missing physical constraint: real EUC wobble is a
    // continuous 3–8 Hz roll-yaw resonance. It does not stop, pose, and start
    // again at each side; one phase drives both axes continuously while energy
    // decays. Tightening toward the crash is the visual warning — there is no
    // synthetic wobble tone competing with the physical ride bed.
    const level = clamp01(this.wobbleEnergy / Math.max(1e-6, t.wobbleCrashEnergy));
    const frequency = lerp(t.wobbleFrequencyHz, t.wobbleFrequencyAtCrashHz, level);
    this.wobblePhase += 2 * Math.PI * frequency * dt;
    if (this.wobblePhase >= 2 * Math.PI) this.wobblePhase -= 2 * Math.PI;

    // **Amplitude is proportional to the energy, with no visibility threshold**
    // — the pre-rework look the owner accepted, restored at M13. M6's threshold
    // existed to stop ordinary rough ground producing a permanent weave; with
    // the surface and speed injectors gone that ground no longer supplies any
    // energy, so the threshold is protecting against a case that can no longer
    // occur, and it was costing the small end of every real wobble its visible
    // onset. `wobbleStateEnergy` still names the `wobbling` state and gates the
    // rider's bracing stance — that is a question about when a wobble is an
    // *event*, which is not the same question as how far the wheel is swinging.
    this.wobbleSway = airborne ? 0 : Math.sin(this.wobblePhase);
    // **The `+ 0` normalises a negative zero, and it is not superstition.** The
    // phase keeps advancing while the oscillator is idle, so on every step whose
    // phase lands in the sine's negative half this product is `maxYaw * 0 * -x`
    // — which is `-0`, and `-0` is not `0` to `Object.is`, to a deep-equality
    // check, or to a plan digest. `level/segments.ts` and `level/planDigest.ts`
    // already guard the same thing for the same reason. Left alone it makes a
    // "the wheel travels dead straight" assertion fail for a wheel that is
    // travelling perfectly straight, which is a day lost to a sign bit.
    this.wobbleYaw = t.wobbleMaxYaw * level * this.wobbleSway + 0;
    this.wobbleRoll = t.wobbleMaxRoll * level * this.wobbleSway + 0;
  }

  /**
   * Add an impulse to the oscillator.
   *
   * One door for every discrete source, so that "what can make the wheel
   * wobble" is answerable by finding the callers rather than by reading the
   * whole file. At M6 that list was a kerb, a landing and a steering reversal;
   * M13 replaced all three with the owner's own trigger set; M15 added one
   * caller for the soft-foliage hazard; the owner's 2026-08-12 M14 ride added
   * `softKnock`, classifying a body-struck Knockabout target as the same kind
   * of soft hazard a bush is. Refused during the
   * invulnerable window and during a crash, where there is no rider to unsettle.
   */
  private injectWobble(energy: number): void {
    if (!(energy > 0) || this.crashing || this.invulnerableTimer > 0) return;
    // The master gate scales every discrete impulse as well as the continuous
    // line above, so zero means no energy path into the oscillator exists at
    // all — not a weave too small to see, but a system that provably cannot
    // start. Owner decision, 2026-08-02: shipped at zero until a
    // non-disruptive wobble design replaces this one (`data/tuning.ts`).
    this.wobbleEnergy += energy * clamp01(this.tuning.wobbleMasterGain);
  }

  /**
   * The rider comes off (`docs/PLANS.md` §4.5, the vision §9).
   *
   * **Non-graphic and crash-local.** M15's default path seeds a deterministic
   * particle ragdoll that exists only during `crashing`; the scripted offset
   * remains intact behind `ragdollEnabled` for A/B and fallback. Neither path
   * creates a persistent world body. Which motion plays comes from the speed and the cause rather than
   * from the trigger (`EUC_RIDER_MOTION_REFERENCE.md` §16): a slow loss is a
   * step-off, a moderate one a run-out, a fast one a side fall, and a pedal
   * strike is a side fall at any speed because the wheel has been deflected out
   * from under the rider rather than left behind them. A solid-obstacle impact
   * also falls sideways so the recovery pose never carries the rider through
   * the collider that stopped the wheel.
   */
  private beginCrash(cause: CrashCause, speed: number): void {
    const t = this.tuning;

    this.crashing = true;
    this.crashCause = cause;
    this.crashSpeed = Math.abs(speed);
    this.crashes += 1;
    this.crashTime = 0;
    this.crashBlend = 0;
    this.wheelCrashLean = 0;
    this.recoverTimer = 0;
    this.state = 'crashing';

    // The cutout is directional by physics rather than by speed band: power
    // dies, the wheel stops balancing, momentum does the rest — forward, over
    // the front. Everything else keeps the speed-banded choice.
    this.crashMotion = cause === 'cutout'
      ? 'faceplant'
      : cause === 'pedalStrike'
          || cause === 'obstacle'
          || this.crashSpeed > t.crashRunOutSpeed
        ? 'sideFall'
        : this.crashSpeed > t.crashStepOffSpeed
          ? 'runOut'
          : 'stepOff';

    // Which side they go down. A scrape throws them over the pedal that caught;
    // otherwise they follow the lean they were carrying, and a rider who was
    // dead upright steps off to their left (+X) — the foot that grounds at
    // every stop in the owner's photographs.
    this.crashSide = this.pedalStrike !== 0
      ? Math.sign(this.pedalStrike)
      : this.rollAngle !== 0
        ? Math.sign(this.rollAngle)
        : 1;

    // -- The ragdoll takes the body (M15) -----------------------------------
    // Seeded from the riding pose *before* the demand-clearing below unwinds
    // it, with the fixed step the loop always runs — `1 / SIMULATION.hz` is
    // the dt every `step` receives, so the backdated verlet velocity is
    // exact. At `ragdollEnabled: 0` none of this exists and the crash is the
    // scripted M6 separation bit-for-bit; a headless test pins that.
    this.ragdolling = t.ragdollEnabled >= 0.5;
    if (this.ragdolling) {
      this.ragdoll.seed({
        x: this.x,
        y: this.groundY,
        z: this.z,
        headingY: this.headingY,
        rollAngle: this.rollAngle,
        riderPitch: this.riderPitch,
        hipDrop: this.crouch * 0.2,
        speed,
        cause: this.crashMotion,
        intoSolid: cause === 'obstacle',
        side: this.crashSide,
      }, t, 1 / SIMULATION.hz);
    }

    // -- The wheel's own flourish (M15, §15.5 q4) ---------------------------
    // Only a hard stop earns it: an obstacle face or a genuine side fall at
    // speed bounces the machine and spins it out before it lies down. The
    // quiet M6 fall is untouched below the threshold, so a step-off still
    // reads as a step-off.
    // The faceplant keeps the flourish the cutout had when it was a side fall:
    // a dead wheel at ~49 mph absolutely does bounce and spin out.
    if (
      (cause === 'obstacle'
        || this.crashMotion === 'sideFall'
        || this.crashMotion === 'faceplant')
      && this.crashSpeed >= t.crashWheelFlourishSpeed
    ) {
      this.wheelCrashSpinRate = -this.crashSide * t.crashWheelSpinRate;
      this.wheelCrashPopVelocity = Math.min(
        this.crashSpeed * t.crashWheelPopFactor,
        t.crashWheelPopMax,
      );
      this.wheelCrashPop = 0;
      this.wheelCrashSpin = 0;
    }

    // Every demand the rider was making stops being made. Clearing these here
    // rather than testing `crashing` in forty places is what lets the riding
    // path stay exactly what it was.
    this.leanPitch = 0;
    this.compressing = false;
    this.compressTimer = 0;
    this.crouchHold = 0;
    this.hopCharge = 0;
    this.hopWasHeld = false;
    this.reversing = false;
    this.reverseHold = 0;
    this.restHold = 0;
    this.restFactor = 0;
    this.yawRate = 0;
    this.lateralAccel = 0;
    this.lateralLimited = false;
    this.pedalStrike = 0;
    this.tiltBackLatched = false;
    // The over-speed state stops being true on the step the rider leaves the
    // wheel, not on the step after it — M20. `stepCrash` clears it too, but
    // that runs a step later, and the HUD and the director both read these on
    // the *crash* step. A beep or a glyph over the top of a wipeout describes
    // something that has stopped existing.
    this.overspeedFactor = 0;
    this.overspeedHold = 0;
    this.wobbleEnergy = 0;
    this.wobblePhase = 0;
    this.wobbleYaw = 0;
    this.wobbleRoll = 0;
    this.wobbleSway = 0;
    this.wobbleRate = 0;
    this.wobbleSmoothness = 0;
    this.wobbleFootCorrection = 0;
  }

  /**
   * One step of a crash: the wheel rolls on, the rider ends up somewhere, and
   * the recovery arrives quickly.
   *
   * §4.5 asks for exactly three things and this does exactly those three. The
   * wheel "rolls on with damped motion" — through the same `advance` every
   * other step uses, so a riderless wheel cannot roll through a wall. Recovery
   * is "available in ≤1.2 s" — any riding input takes it — and "auto-triggers
   * at ~1.5 s", so a player who lets go still gets going again. "Avoid long
   * realistic recovery" (`EUC_RIDER_MOTION_REFERENCE.md` §15) is the whole
   * reason those two numbers are as small as they are.
   *
   * The hop is deliberately *not* a recovery input: `canAcceptHop` is false
   * throughout, so a Space press during a crash stays in the 0.15 s action
   * buffer and fires as a real hop on the first legal step after the restore,
   * which is a much better answer than consuming it here.
   */
  private stepCrash(dt: number, throttle: number, steer: number, crouch: boolean): void {
    const t = this.tuning;
    this.crashTime += dt;

    const response = this.surfaceResponse();
    const forwardX = Math.sin(this.headingY);
    const forwardZ = Math.cos(this.headingY);

    // A wheel with nobody on it still answers gravity and the ground it is on.
    this.slopeAccel = slopeAccelFor(this.ground.normal, forwardX, forwardZ, t.gravity);
    this.slope = this.slopeAccel === 0
      ? 0
      : Math.asin(clamp(-this.slopeAccel / t.gravity, -1, 1));
    this.rollingResistance = response.rollingResistance * t.rollingResistanceScale;

    let speed = this.speed + this.slopeAccel * dt;
    const resist = (t.crashWheelDecel
      + this.rollingResistance
      + t.dragCoefficient * speed * speed) * dt;
    if (speed > 0) speed = Math.max(0, speed - resist);
    else if (speed < 0) speed = Math.min(0, speed + resist);

    const intended = speed * dt;
    const moved = this.advance(forwardX * intended, forwardZ * intended, dt, speed, false);
    speed = moved.speed;

    this.speed = speed;
    this.longitudinalAccel = 0;
    this.surface = this.ground.surface;
    this.offCourse = this.ground.offCourse;
    this.groundY = this.ground.height;
    this.y = this.groundY;
    this.grounded = true;
    this.wheelSpin += (moved.keptX * forwardX + moved.keptZ * forwardZ) / t.wheelRadius;
    this.distanceTravelled += moved.distance;

    this.writeGroundTilt(dt);
    this.stepSuspension(dt, response);

    // The separation, and the wheel lying down.
    this.crashBlend = approach(this.crashBlend, 1, t.crashSeparationSeconds, Infinity, dt);
    this.wheelCrashLean = approach(
      this.wheelCrashLean,
      t.crashWheelLean,
      t.crashWheelFallSeconds,
      Infinity,
      dt,
    );

    // The particle body tumbles through the same ground and solids the wheel
    // answers, plus whatever foliage it lands in (M15).
    if (this.ragdolling) {
      this.ragdoll.step(dt, this.crashTime, this.x, this.z, this.sampler, this.softBodies, t);
    }

    // The wheel's flourish (M15): a ballistic bounce with a couple of damped
    // returns, and a spin-out that decays to nothing before recovery opens.
    if (this.wheelCrashPop > 0 || this.wheelCrashPopVelocity !== 0) {
      this.wheelCrashPopVelocity -= t.gravity * dt;
      this.wheelCrashPop += this.wheelCrashPopVelocity * dt;
      if (this.wheelCrashPop <= 0) {
        this.wheelCrashPop = 0;
        // A fall below walking pace stops bouncing rather than buzzing.
        this.wheelCrashPopVelocity = this.wheelCrashPopVelocity < -0.8
          ? -this.wheelCrashPopVelocity * t.crashWheelPopRestitution
          : 0;
      }
    }
    this.wheelCrashSpin += this.wheelCrashSpinRate * dt;
    this.wheelCrashSpinRate = approach(
      this.wheelCrashSpinRate,
      0,
      t.crashWheelSpinDampSeconds,
      Infinity,
      dt,
    );

    // Every riding pose unwinds toward neutral so the rider who comes back is
    // not still braced against a corner they were taking two seconds ago.
    this.rollAngle = approach(this.rollAngle, 0, t.rollResponseSeconds, Infinity, dt);
    this.riderPitch = approach(this.riderPitch, 0, t.riderPitchResponseSeconds, Infinity, dt);
    this.slopeLean = approach(this.slopeLean, 0, t.groundTiltResponseSeconds, Infinity, dt);
    this.airPitch = approach(this.airPitch, 0, t.airPitchResponseSeconds, Infinity, dt);
    this.riderLookYaw = approach(this.riderLookYaw, 0, t.riderLookResponseSeconds, Infinity, dt);
    this.riderTurnTwist = approach(
      this.riderTurnTwist,
      0,
      t.turnTechniqueResponseSeconds,
      Infinity,
      dt,
    );
    this.technicalTurn = approach(
      this.technicalTurn,
      0,
      t.turnTechniqueResponseSeconds,
      Infinity,
      dt,
    );
    this.reverseBlend = approach(this.reverseBlend, 0, t.reversePoseSeconds, Infinity, dt);
    this.crouch = approach(this.crouch, 0, t.crouchResponseSeconds, Infinity, dt);
    this.tuck = approach(this.tuck, 0, t.crouchResponseSeconds, Infinity, dt);
    this.absorb = approach(this.absorb, 0, t.landingAbsorbSeconds, Infinity, dt);
    this.airBlend = approach(this.airBlend, 0, t.crouchResponseSeconds, Infinity, dt);
    this.tiltBack = approach(this.tiltBack, 0, t.tiltBackReleaseSeconds, Infinity, dt);
    this.loadFactor = approach(this.loadFactor, 0, t.powerReliefSeconds, Infinity, dt);
    this.landingLoad = approach(this.landingLoad, 0, t.powerLandingDecaySeconds, Infinity, dt);
    this.powerStage = 'normal';
    // The wheel is on its side and the rider is not on it, so both halves of
    // the over-speed state stop being true immediately rather than decaying —
    // a beep or a glyph over the top of a wipeout is describing a situation
    // that has stopped existing, which is `ui/hudModel.ts`'s own rule for a
    // crash, and a hold left running would cut the rider out again the instant
    // they respawned.
    this.overspeedFactor = 0;
    this.overspeedHold = 0;
    this.landingTimer = 0;
    this.state = 'crashing';

    const asked = Math.abs(throttle) > 0.01 || Math.abs(steer) > 0.01 || crouch;
    const ready = this.crashTime >= t.crashRecoverEarliestSeconds;
    if ((ready && asked) || this.crashTime >= t.crashRecoverAutoSeconds) this.respawn();
  }

  /**
   * Put the rider back on the wheel at the last validated safe position.
   *
   * **Deliberately not `reset`.** Quick reset is a fresh run: it goes to the
   * spawn and zeroes the hop, landing, crash, and distance counters. A recovery
   * is the middle of a run that went wrong, so it keeps every one of them and
   * moves the rider to somewhere the ride had recently been fine
   * (`updateSafePosition`).
   *
   * Restored carrying a fraction of the speed that was lost, which is a
   * decision worth the owner's eye and is on F4 as `crashRecoverSpeedFactor`:
   * a recovery that always stood the rider still would answer "do I immediately
   * want another go?" with two seconds of re-acceleration every single time.
   */
  private respawn(): void {
    const t = this.tuning;
    const restored = this.crashSpeed * t.crashRecoverSpeedFactor;

    this.x = this.safeX;
    this.z = this.safeZ;
    this.headingY = this.safeHeading;
    this.speed = restored;

    this.leanPitch = 0;
    this.riderPitch = 0;
    this.slopeLean = 0;
    this.riderLookYaw = 0;
    this.riderTurnTwist = 0;
    this.technicalTurn = 0;
    this.longitudinalAccel = 0;
    this.rollAngle = 0;
    this.yawRate = 0;
    this.lateralAccel = 0;
    this.lateralLimited = false;
    this.reversing = false;
    this.reverseHold = 0;
    this.reverseBlend = 0;
    this.restHold = 0;
    this.restFactor = 0;
    this.blocked = false;
    this.collisionImpact = 0;
    this.inHazard = false;
    this.inSoftBody = false;
    this.lastStepUp = 0;
    this.curbAhead = 0;
    this.slope = 0;
    this.slopeAccel = 0;

    this.airborne = false;
    this.verticalVelocity = 0;
    this.airTime = 0;
    this.airApex = 0;
    this.airDirX = Math.sin(this.headingY);
    this.airDirZ = Math.cos(this.headingY);
    this.airPitch = 0;
    this.airBlend = 0;
    this.compressing = false;
    this.compressTimer = 0;
    this.crouchHold = 0;
    this.hopCharge = 0;
    this.hopWasHeld = false;
    this.crouch = 0;
    this.tuck = 0;
    this.absorb = 0;
    this.landingTimer = 0;
    this.pedalStrike = 0;

    this.clearInstability();
    this.invulnerableTimer = t.crashInvulnerableSeconds;
    this.recoverTimer = t.crashRecoverBlendSeconds;
    this.safeHold = 0;
    this.state = 'recovering';

    // Landed already settled, for the reason `reset` gives: a respawn that
    // started the spring at zero on rough ground would bounce for a second,
    // which reads as the rider dropping in from a height they never had.
    this.sampler.sampleGround(this.x, this.z, this.ground);
    this.y = this.ground.height;
    this.groundY = this.ground.height;
    this.surface = this.ground.surface;
    this.offCourse = this.ground.offCourse;
    this.grounded = true;

    const response = this.surfaceResponse();
    this.rollingResistance = response.rollingResistance * t.rollingResistanceScale;
    this.lateralLimitG = t.maxLateralG * response.grip;
    this.writeGroundTilt(1);
    this.suspensionVelocity = 0;
    this.suspensionCompression = 0;
    this.suspensionOffset = roughnessAt(
      this.x,
      this.z,
      response.roughnessAmplitude,
      response.roughnessWavelength,
    );
  }

  /**
   * Zero everything wobble, power, and crash related.
   *
   * Shared by `reset` and `respawn` because the list is long enough that two
   * copies of it would eventually disagree — and a field missed here is a rider
   * who comes back from a crash already wobbling, which is the exact failure
   * this milestone exists to make impossible.
   */
  private clearInstability(): void {
    this.wobbleEnergy = 0;
    this.wobblePhase = 0;
    this.wobbleYaw = 0;
    this.wobbleRoll = 0;
    this.wobbleSway = 0;
    this.wobbleRate = 0;
    this.wobbleSmoothness = 0;
    this.wobbleFootCorrection = 0;
    this.wobbleProbeDistance = 0;
    this.steerSign = 0;
    this.steerHold = 0;

    this.loadFactor = 0;
    this.landingLoad = 0;
    this.powerStage = 'normal';
    this.tiltBack = 0;
    this.tiltBackLatched = false;
    this.overspeedFactor = 0;
    this.overspeedHold = 0;

    this.crashing = false;
    this.crashTime = 0;
    this.crashBlend = 0;
    this.crashSpeed = 0;
    this.crashSide = 1;
    this.wheelCrashLean = 0;
    this.recoverTimer = 0;
    this.invulnerableTimer = 0;

    this.ragdolling = false;
    this.wheelCrashSpin = 0;
    this.wheelCrashSpinRate = 0;
    this.wheelCrashPop = 0;
    this.wheelCrashPopVelocity = 0;
  }

  /**
   * Apply one step's displacement, letting the ground refuse part of it.
   *
   * **A step is not a slope, and telling them apart is the whole trick.** The
   * naive test — "did the ground go up more than a few centimetres?" — calls a
   * 45-degree embankment a kerb at any real speed, because at 15 m/s one step
   * covers 12 cm of ground and a 45-degree embankment rises 12 cm in it. What
   * separates them is that a slope's rise is *predicted by the surface the
   * wheel is already on*: a plane's normal says exactly how far the next
   * position should be above this one, and only the excess over that prediction
   * is a step. On a hill the excess is zero at any gradient and any speed; on a
   * kerb it is the kerb's height.
   *
   * Excess beyond `maxStepUp` is something the wheel cannot climb. It refuses
   * the part of the move that goes into it and keeps the part that goes along
   * it — one axis at a time, which is the cheapest resolution that is neither a
   * teleport onto the obstacle nor a dead stop at a glancing angle — and bleeds
   * speed in proportion to how square-on the contact was.
   *
   * **In the air both halves of that change** (M5). There is no surface under
   * the wheel to predict a rise from, so the prediction is zero and the excess
   * is simply how far the ground at the destination is above the wheel's
   * current height; and the step-up allowance is zero, because a wheel cannot
   * lever itself onto anything it is not standing on. The result is the one
   * that reads: a hop passes freely over anything below it, and a hop that
   * came up short meets the kerb's face and slides along it rather than
   * snapping onto the top of it.
   *
   * The excess it committed to is reported back, because the caller needs the
   * *negative* half of that number — a ground that fell away by more than the
   * surface predicted is a ledge, and a ledge puts the wheel in the air.
   */
  private advance(
    deltaX: number,
    deltaZ: number,
    dt: number,
    speed: number,
    airborne: boolean,
  ): {
    speed: number;
    distance: number;
    excess: number;
    keptX: number;
    keptZ: number;
    impactSpeed: number;
  } {
    const t = this.tuning;
    this.blocked = false;
    this.lastStepUp = 0;

    const ceiling = airborne ? 0 : t.maxStepUp;

    if (deltaX === 0 && deltaZ === 0) {
      // Still re-sample: the wheel may be standing where the ground changed.
      this.sampler.sampleGround(this.x, this.z, this.ground);
      // And a wheel that is not moving is exactly the case a reset beside a
      // wall produces, so the standoff belongs on this path too.
      this.applyWallStandoff(dt, airborne);
      return { speed, distance: 0, excess: 0, keptX: 0, keptZ: 0, impactSpeed: 0 };
    }

    const full = this.excessAt(deltaX, deltaZ, airborne);
    // A jump clears an obstacle only when the machine's swept envelope is
    // actually above it. Skipping this cast in the air let a wall refusal
    // repeatedly scrub speed without ever reporting an obstacle impact, so a
    // rider could jump immediately before a high-speed collision and survive.
    const fullHasClearance = !this.obstacleWithinWheelRadius(deltaX, deltaZ);
    // Saved before the axis candidates below overwrite the shared cast output.
    const fullObstacleNarrow = this.lastObstacleNarrow;
    if (full <= ceiling && fullHasClearance) {
      this.obstacleEscapeArmed = false;
      // `excessAt` has just sampled exactly where the wheel is going, so the
      // common path takes that answer instead of asking the level twice.
      this.commit(deltaX, deltaZ, true);
      this.applyWallStandoff(dt, airborne);
      let next = speed;
      if (!airborne && full > t.curbThreshold) {
        // Mounting a kerb costs speed and nothing else at M4. The wobble
        // injection `docs/PLANS.md` §6 beat 3 also asks for is M6's.
        this.lastStepUp = full;
        const cost = full * t.curbImpactPerMetre;
        next = speed > 0 ? Math.max(0, speed - cost) : Math.min(0, speed + cost);
      }
      return {
        speed: next,
        distance: Math.hypot(deltaX, deltaZ),
        excess: full,
        keptX: deltaX,
        keptZ: deltaZ,
        impactSpeed: 0,
      };
    }

    // Blocked head-on. Try each axis alone. A clear axis is a wall tangent and
    // is safe to keep; preserving the historical X-first choice when both are
    // clear matters on curved route edges. A narrow post is the exception: its
    // point-like contact has no world-axis tangent, so `fullObstacleNarrow`
    // suppresses both candidates instead of letting the resolver walk through
    // it one component at a time.
    this.blocked = true;
    if (!fullHasClearance) this.obstacleEscapeArmed = true;
    const excessAlongX = this.excessAt(deltaX, 0, airborne);
    const excessAlongZ = this.excessAt(0, deltaZ, airborne);
    const clearAlongX = !fullObstacleNarrow && excessAlongX <= ceiling
      && !this.obstacleWithinWheelRadius(deltaX, 0, deltaX, deltaZ);
    const clearAlongZ = !fullObstacleNarrow && excessAlongZ <= ceiling
      && !this.obstacleWithinWheelRadius(0, deltaZ, deltaX, deltaZ);

    let slideX = 0;
    let slideZ = 0;
    let slideExcess = 0;
    if (clearAlongX) {
      slideX = deltaX;
      slideExcess = excessAlongX;
    } else if (clearAlongZ) {
      slideZ = deltaZ;
      slideExcess = excessAlongZ;
    }

    // Re-sampled rather than copied: `this.probe` currently holds whichever
    // candidate was tested *last*, which is not necessarily the one that won.
    if (slideX === 0 && slideZ === 0) {
      // Nowhere to go. Re-sample where the wheel already is so the ground it
      // reports is the ground it is standing on, not the one it was refused.
      this.sampler.sampleGround(this.x, this.z, this.ground);
    } else {
      this.commit(slideX, slideZ, false);
    }
    this.applyWallStandoff(dt, airborne);

    // How square-on the contact was: 1 for straight into it, near 0 for a
    // graze. **Squared**, and that is not cosmetic. Linear in the contact angle,
    // a forty-five-degree scrape costs 12 m/s^2 against a drive authority of
    // 7.7, so a rider brushing a wall grinds to a halt over a few seconds for no
    // reason they can see. Squared, the same scrape costs 3.6 and the wheel
    // settles at about 11 m/s along the wall, while a head-on hit still stops
    // it in a third of a second.
    const length = Math.hypot(deltaX, deltaZ);
    const kept = Math.hypot(slideX, slideZ);
    const intoWall = length > 0 ? clamp01(1 - kept / length) : 1;
    const scrub = t.wallScrubDecel * intoWall * intoWall * dt;
    const next = speed > 0 ? Math.max(0, speed - scrub) : Math.min(0, speed + scrub);

    return {
      speed: next,
      distance: kept,
      excess: slideExcess,
      keptX: slideX,
      keptZ: slideZ,
      // A terrain-only airborne refusal is contact the landing scorer owns.
      // An authored solid is different: it is a wall/tree/post impact even in
      // flight, and must enter the same speed-gated crash funnel as on ground.
      impactSpeed: airborne && fullHasClearance ? 0 : Math.abs(speed) * intoWall,
    };
  }

  /**
   * Push the wheel back out to its own pedal width after the move (M17).
   *
   * **This refuses nothing.** The obstacle cast decides what may move and where
   * a crash happens, and it is untouched here; this only decides where the
   * machine is allowed to come to rest. Everything the resolver established —
   * sliding along a wall, the axis candidates, the crash funnel, what the route
   * validator cut the corridors for — is bit-identical with this on or off.
   *
   * The defect it exists for: the forward cast reaches a wheel radius *along
   * the direction of travel*, so a head-on stop leaves a clean tyre radius of
   * air, but a shallow approach only ever buys `wheelRadius · sin(angle)` of
   * sideways room. Riding parallel to a wall therefore parked the centreline
   * almost exactly on the face and buried a fifth of a metre of machine and
   * rider in it — a player reported it as riding through the wall.
   *
   * **Cast sideways, not perpendicular to the face, and that is deliberate.**
   * The thing that visibly enters the mesh is the pedal tip, and the pedal tip
   * sits at `wallStandoff` along the machine's own lateral axis. Measuring
   * along that axis asks exactly where the pedal is; a face normal would answer
   * a question nobody is looking at. It also costs no new sampler API.
   *
   * Both sides are resolved together so a gap narrower than two standoffs
   * centres the machine instead of ejecting it out of the far wall, the move is
   * rate-capped so a wall appearing beside a reset eases the wheel out rather
   * than snapping it, and a push that would land on ground more than a step
   * away is dropped — nobody gets nudged off a ledge to keep a pedal clean.
   */
  private applyWallStandoff(dt: number, airborne: boolean): void {
    const t = this.tuning;
    const standoff = t.wallStandoff;
    const raycastObstacle = this.sampler.raycastObstacle;
    // In the air there is no resting place to be wrong, and a body on a
    // ballistic arc must not be nudged off it.
    if (airborne || standoff <= 0 || raycastObstacle === undefined) return;

    // The same origin height the envelope query uses, so a mountable kerb
    // stays mountable instead of shouldering the machine sideways.
    const originY = this.y + t.maxStepUp + 1e-6;
    const leftX = Math.cos(this.headingY);
    const leftZ = -Math.sin(this.headingY);

    this.standoffOrigin.x = this.x;
    this.standoffOrigin.y = originY;
    this.standoffOrigin.z = this.z;
    this.standoffRay.x = leftX;
    this.standoffRay.z = leftZ;
    const left = raycastObstacle.call(
      this.sampler,
      this.standoffOrigin,
      this.standoffRay,
      standoff,
    );
    this.standoffRay.x = -leftX;
    this.standoffRay.z = -leftZ;
    const right = raycastObstacle.call(
      this.sampler,
      this.standoffOrigin,
      this.standoffRay,
      standoff,
    );
    if (left === null && right === null) return;

    // Positive pushes toward the rider's left. Both sides shortening cancels,
    // which is what centres the machine in a gap too narrow for two standoffs.
    const shortLeft = left === null ? 0 : standoff - left;
    const shortRight = right === null ? 0 : standoff - right;
    let push = shortRight - shortLeft;
    const cap = t.wallStandoffRate * dt;
    if (push > cap) push = cap;
    else if (push < -cap) push = -cap;
    if (push === 0) return;

    const nextX = this.x + leftX * push;
    const nextZ = this.z + leftZ * push;
    this.sampler.sampleGround(nextX, nextZ, this.probe);
    // A push is a correction, never a climb and never a drop. Anything beyond
    // the step the wheel could mount is somewhere it did not ask to be.
    if (Math.abs(this.probe.height - this.ground.height) > t.maxStepUp) return;
    this.x = nextX;
    this.z = nextZ;
    copyGroundSample(this.probe, this.ground);
    // Being held off a wall by the pedal *is* contact, and saying so keeps two
    // things right. A shallow scrape used to alternate between refused and
    // clear frames; with the standoff holding the machine a pedal's width out,
    // the refusal can stop firing while the rider is plainly still grinding
    // along the wall. And `updateSafePosition` reads this — a respawn point
    // must never be recorded with the machine pressed against scenery. The
    // scrape's speed cost is not applied here: that belongs to a refused move,
    // and a graze the resolver allowed should not be charged for one.
    this.blocked = true;
  }

  /**
   * Does the wheel's circular visual envelope meet an unclimbable face?
   *
   * The contact patch is a point, but the wheel is not. Sampling only the next
   * contact-patch position lets the axle reach a wall before the move is
   * refused, burying roughly one tyre radius in the rendered block. Cast the
   * machine's envelope one radius beyond the requested move at the step-up
   * ceiling instead:
   * a mountable kerb lies below it, while a wall or ledge meets it before the
   * tyre does. The sideways width is the pedal span rather than the tyre: a
   * narrow lamp post or bollard touched by a pedal is still a real collision,
   * even when the centreline happens to miss it. The sampler applies that
   * lateral width only to post-sized colliders; walls and fences keep their
   * established centre-ray/slide behaviour. This is deliberately an
   * authored-box-only query: using the full terrain ray here turns a steep but
   * rideable heightfield bank into a wall.
   */
  private obstacleWithinWheelRadius(
    deltaX: number,
    deltaZ: number,
    envelopeDeltaX = deltaX,
    envelopeDeltaZ = deltaZ,
  ): boolean {
    const raycastObstacle = this.sampler.raycastObstacle;
    this.lastObstacleNarrow = false;
    if (raycastObstacle === undefined) return false;
    const horizontal = Math.hypot(deltaX, deltaZ);
    if (horizontal === 0) return false;

    const normal = this.ground.normal;
    const rise = normal.y > 1e-4
      ? -(normal.x * deltaX + normal.z * deltaZ) / normal.y
      : 0;
    const distance = Math.hypot(deltaX, rise, deltaZ) + this.tuning.wheelRadius;
    const hit = raycastObstacle.call(
      this.sampler,
      {
        x: this.x,
        // One micrometre keeps a collider exactly at the derived step-up
        // ceiling mountable instead of treating its top plane as an interior.
        y: this.y + this.tuning.maxStepUp + 1e-6,
        z: this.z,
      },
      { x: deltaX, y: rise, z: deltaZ },
      distance,
      this.tuning.pedalHalfSpan,
      // Keep the physical pedal axis fixed while the resolver tries X and Z
      // separately. Re-deriving it from a fallback axis lets a rotated narrow
      // post be caught by the full move and then leak through both candidates.
      { x: -envelopeDeltaZ, y: 0, z: envelopeDeltaX },
      this.obstacleHit,
    );
    if (hit !== null) {
      // A post is smaller than the machine on both horizontal axes. World-axis
      // fallback sliding has no valid tangent for that point-like contact and
      // can walk sideways around it one component at a time, so it remains a
      // stop. Walls, fences and buildings keep the established slide; shrubs
      // are M15 soft volumes and never reach this obstacle path.
      this.lastObstacleNarrow = Math.max(
        this.obstacleHit.halfExtentX,
        this.obstacleHit.halfExtentZ,
      ) <= this.tuning.pedalHalfSpan;
    }
    return hit !== null && hit <= distance;
  }

  /**
   * How far above the current surface's own prediction the ground is, if the
   * wheel moved by this delta. Leaves the answer in `this.probe`.
   *
   * In the air there is no surface under the wheel to predict from, so the
   * prediction is zero and this reduces to "how far above the wheel is the
   * ground over there" — which is the right question for a body following a
   * ballistic arc rather than a contour.
   */
  private excessAt(deltaX: number, deltaZ: number, airborne = false): number {
    this.sampler.sampleGround(this.x + deltaX, this.z + deltaZ, this.probe);
    if (airborne) return this.probe.height - this.y;
    const normal = this.ground.normal;
    const predicted = normal.y > 1e-4
      ? -(normal.x * deltaX + normal.z * deltaZ) / normal.y
      : 0;
    return this.probe.height - this.y - predicted;
  }

  /**
   * Take a move, adopting the sample `excessAt` already took for it.
   *
   * Copying rather than re-sampling saves one ground query per step, which
   * matters here because the alternative is not one extra query but one extra
   * walk of every collider in the level.
   */
  private commit(deltaX: number, deltaZ: number, fromProbe: boolean): void {
    this.x += deltaX;
    this.z += deltaZ;
    if (fromProbe) copyGroundSample(this.probe, this.ground);
    else this.sampler.sampleGround(this.x, this.z, this.ground);
  }

  /**
   * Turn the sampled normal into the rig's two tilt rotations, smoothed.
   *
   * The sampler returns the exact plane of the triangle under the wheel, which
   * is what the slope force must use and which steps at every cell boundary on
   * a curved hill. Smoothing here removes the faceting from what the player
   * sees without touching what the wheel feels. `dt` of 1 snaps, which is what
   * a reset onto a slope needs.
   */
  private writeGroundTilt(dt: number): void {
    const t = this.tuning;
    const normal = this.ground.normal;
    const cos = Math.cos(this.headingY);
    const sin = Math.sin(this.headingY);

    // The normal in the heading's own frame. A yaw of -heading, applied to the
    // world normal.
    const localX = cos * normal.x - sin * normal.z;
    const localZ = sin * normal.x + cos * normal.z;

    // Solving `Rz(roll) * Rx(pitch) * up = n` gives these two directly, which
    // is why the pose carries rig rotations rather than a slope angle: the sign
    // is derived once, here, instead of being guessed at the renderer.
    //
    // The follow fractions then decide how much of the surface's tilt the rig
    // actually adopts — near zero, after the owner's M4 ride. An EUC is not a
    // skateboard: the firmware holds the pedals level with *gravity*, so on a
    // hill the machine stays plumb and the rider leans into the slope
    // (`slopeLean`, above) instead of the whole rig lying back with the
    // ground. The full derivation is kept because the fractions are live on F4
    // and because a fraction of a correctly-signed angle is still correctly
    // signed.
    const targetPitch = clamp(
      Math.asin(clamp(localZ, -1, 1)),
      -t.maxGroundTilt,
      t.maxGroundTilt,
    ) * t.groundTiltPitchFollow;
    const targetRoll = clamp(
      Math.atan2(-localX, Math.max(1e-4, normal.y)),
      -t.maxGroundTilt,
      t.maxGroundTilt,
    ) * t.groundTiltRollFollow;

    if (dt >= 1) {
      this.groundPitch = targetPitch;
      this.groundRoll = targetRoll;
      return;
    }
    this.groundPitch = approach(
      this.groundPitch, targetPitch, t.groundTiltResponseSeconds, Infinity, dt,
    );
    this.groundRoll = approach(
      this.groundRoll, targetRoll, t.groundTiltResponseSeconds, Infinity, dt,
    );
  }

  /**
   * The spring-damper on the contact offset (`docs/PLANS.md` §4.3).
   *
   * Cosmetic by design — it drives visible travel and, later, audio, and it
   * does not modulate grip. What makes it read is that its input is a *spatial*
   * roughness field, so the excitation frequency is speed over wavelength: the
   * same patch of grass does nothing at a standstill and works the rider hard
   * at speed, without a single speed term appearing here.
   *
   * Integrated semi-implicitly (velocity first, then position), which is stable
   * at 120 Hz for every frequency the F4 slider can reach, and bump-stopped at
   * the wheel's own declared travel rather than clamped after the fact — a
   * clamp without killing the velocity sticks against the stop.
   *
   * **M5 feeds it three more things, and all three go in through the same
   * input.** A crouch displaces the spring's rest point downward, so the hop
   * preload and its rebound at launch are the damper doing what a damper does
   * rather than an animation played over the top of one. The landing kick and
   * the pedal-strike jolt are velocity impulses set elsewhere and integrated
   * here. Nothing about the M4 ride changes when nobody is crouching: the
   * preload term is exactly zero.
   */
  private stepSuspension(dt: number, response: SurfaceResponse): void {
    const t = this.tuning;
    // Preload only on the ground. A rider tucked in mid-flight is not pushing
    // the wheel down against anything, and pretending otherwise would have the
    // suspension compress in the air and rebound against nothing on landing.
    const preload = this.airborne ? 0 : this.crouch * t.suspensionPreload;
    const input = roughnessAt(
      this.x,
      this.z,
      response.roughnessAmplitude,
      response.roughnessWavelength,
    ) - preload;

    const omega = 2 * Math.PI * t.suspensionFrequencyHz;
    const acceleration = -omega * omega * (this.suspensionOffset - input)
      - 2 * t.suspensionDamping * omega * this.suspensionVelocity;

    this.suspensionVelocity += acceleration * dt;
    this.suspensionOffset += this.suspensionVelocity * dt;

    const travel = t.suspensionTravel;
    if (this.suspensionOffset > travel) {
      this.suspensionOffset = travel;
      if (this.suspensionVelocity > 0) this.suspensionVelocity = 0;
    } else if (this.suspensionOffset < -travel) {
      this.suspensionOffset = -travel;
      if (this.suspensionVelocity < 0) this.suspensionVelocity = 0;
    }

    this.suspensionCompression = input - this.suspensionOffset;
  }

  /**
   * The forward feeler (`docs/PLANS.md` §4.3).
   *
   * The plan asks for "one short forward feeler ray at pedal height for curb
   * detection ahead of contact". A downward probe at the feeler distance,
   * compared against the same gradient prediction the step logic uses, answers
   * the same question and answers it better: it reports *how tall* the step is
   * rather than whether a ray happened to hit something, which is what M5's hop
   * assist and M6's wobble injection will both want.
   *
   * Nothing in the M4 ride depends on it. It is on the snapshot and in the
   * debug overlay, and it exists now because the sensor is specified and a
   * milestone that adds the consumer without the sensor adds both at once.
   */
  private readFeeler(forwardX: number, forwardZ: number): void {
    const distance = this.tuning.feelerDistance;
    const deltaX = forwardX * distance;
    const deltaZ = forwardZ * distance;
    const excess = this.excessAt(deltaX, deltaZ);
    this.curbAhead = Math.abs(excess) > this.tuning.curbThreshold ? excess : 0;
  }

  /**
   * The hop, from charge to impulse (`docs/PLANS.md` §4.4).
   *
   * **The edge is detected here rather than assumed.** `app/Game.ts` claims
   * every one-shot exactly once per press and hands the controller the
   * snapshot taken before the claim, so `actions.hop` is already true on
   * exactly one step per press — but a controller that *relies* on that is one
   * upstream change away from a hop that re-fires on every landing for as long
   * as the key is held. A headless test holds the flag true for four seconds
   * and asserts exactly one hop, which is a claim about this file rather than
   * about the composition root.
   */
  private stepHop(dt: number, actions: ActionSnapshot): void {
    const t = this.tuning;
    const requested = actions.hop && !this.hopWasHeld;
    this.hopWasHeld = actions.hop;

    if (this.airborne) {
      // No second hop in flight. The press is simply dropped rather than
      // queued: a hop that fires the instant the wheel touches down is not
      // what the player asked for, and the 0.15 s input buffer upstream
      // already covers a press made slightly too early. A rider cannot
      // preload against air either, so the charge goes with it.
      this.compressTimer = 0;
      this.compressing = false;
      this.crouchHold = 0;
      return;
    }

    if (this.compressing) {
      this.compressTimer = Math.max(0, this.compressTimer - dt);
      if (this.compressTimer === 0) this.launchHop();
      return;
    }

    if (requested) {
      this.hopCharge = clamp01(this.crouchHold / Math.max(1e-6, t.hopChargeSeconds));
      this.compressing = true;
      this.compressTimer = t.hopCompressSeconds;
      this.crouchHold = 0;
      // A zero compression time is a legal F4 setting, and it must fire now
      // rather than a step later — otherwise the slider's own extreme is the
      // one value at which the hop feels laggy.
      if (this.compressTimer <= 0) this.launchHop();
      return;
    }

    // **The charge bookkeeping runs last, and the order is the whole point.**
    // Standing up before committing spends the preload — that is the design,
    // and §4.4's "holding crouch beforehand" says so. But a player pressing
    // Space and letting go of Shift in the same eight-millisecond step has not
    // stood up first; they have jumped. Zeroing the charge before reading it
    // gave that rider an uncharged hop at random, which is exactly the kind of
    // "sometimes my charged hop isn't charged" that makes a mechanic feel
    // broken rather than demanding.
    if (actions.crouch) {
      this.crouchHold = Math.min(this.crouchHold + dt, t.hopChargeSeconds);
    } else {
      this.crouchHold = 0;
    }
  }

  /** Fire the impulse. Called only from `stepHop`, only while grounded. */
  private launchHop(): void {
    const t = this.tuning;
    // **The charge bonus is a height, not a velocity.** §4.4 promises "up to
    // 40% height", height goes as the square of launch speed, so the bonus
    // arrives here through a square root. Writing it the other way would
    // quietly deliver a 96% height bonus and the constant would stop meaning
    // what the plan says it means.
    const launch = t.hopLaunchSpeed * Math.sqrt(1 + t.hopChargeHeightBonus * this.hopCharge);
    // Hopping off a rise keeps the vertical rate the slope was already
    // giving the wheel, so a hop taken over a crest goes higher than the same
    // hop on the flat. The slope is one step stale — the same eight
    // milliseconds of lag the surface sample carries, for the same reason.
    this.leaveGround(this.y, launch + this.speed * Math.sin(this.slope), 0, 0);
    this.compressing = false;
    this.compressTimer = 0;
    this.crouchHold = 0;
    this.hops += 1;
    // The preload the compression put into the spring comes back out.
    // "Suspension rebounds, tire leaves ground" (motion reference §12.2).
    this.suspensionVelocity += launch * t.hopSuspensionRebound;
  }

  /**
   * Leave the ground, freezing the travel direction.
   *
   * One entry point for both ways it can happen — a hop and a ledge — because
   * the thing that has to be right in both cases is the same: after this
   * returns, the wheel moves along `airDir` and the heading is free.
   *
   * A zero direction means "use the current heading", which is what a hop
   * wants; the ledge case passes the direction it was actually travelling in,
   * which is the same vector on the ground and is passed explicitly so this
   * function never has to know which caller it is serving.
   */
  private leaveGround(
    fromY: number,
    verticalVelocity: number,
    directionX: number,
    directionZ: number,
  ): void {
    const length = Math.hypot(directionX, directionZ);
    if (length > 1e-9) {
      this.airDirX = directionX / length;
      this.airDirZ = directionZ / length;
    } else {
      this.airDirX = Math.sin(this.headingY);
      this.airDirZ = Math.cos(this.headingY);
    }
    this.y = fromY;
    this.verticalVelocity = verticalVelocity;
    this.airborne = true;
    this.grounded = false;
    this.airTime = 0;
    this.airApex = 0;
    this.justTookOff = true;
  }

  /**
   * Touch down, and score it (`docs/PLANS.md` §4.4).
   *
   * Three inputs, each normalised by its own reference so that a point of
   * score means the same amount of trouble whichever produced it:
   *
   *   - **Impact**, as the closing speed along the *surface normal*. On flat
   *     ground that is just the fall speed; on a slope the horizontal velocity
   *     contributes, so landing hard into a rising face hurts and dropping
   *     onto a face that is already running away from you does not. This is
   *     the term that makes a landing transition read as terrain.
   *   - **Misalignment**, the angle between the heading and the direction the
   *     wheel is actually travelling. Zero unless the rider used the air yaw,
   *     which is exactly the authority §4.4 grants and the reason granting it
   *     is interesting.
   *   - **Surface**, from the roughness the suspension is about to have to
   *     absorb. Gravel scores the full weight; pavement a tenth of it.
   *
   * The misaligned component of the velocity is scrubbed by geometry before
   * the score is charged, so a sideways landing is paid for twice. That is
   * deliberate: lining the wheel up is the skill the air yaw exists to reward.
   */
  private land(speed: number, response: SurfaceResponse): number {
    const t = this.tuning;
    const normal = this.ground.normal;
    const forwardX = Math.sin(this.headingY);
    const forwardZ = Math.cos(this.headingY);

    const velocityX = speed * this.airDirX;
    const velocityZ = speed * this.airDirZ;
    const impact = Math.max(
      0,
      -(velocityX * normal.x + this.verticalVelocity * normal.y + velocityZ * normal.z),
    );
    const alignment = clamp(this.airDirX * forwardX + this.airDirZ * forwardZ, -1, 1);
    const misalignment = Math.acos(alignment);

    const score = impact / Math.max(1e-6, t.landingImpactReference)
      + misalignment / Math.max(1e-6, t.landingMisalignReference)
      + t.landingSurfaceWeight
        * (response.roughnessAmplitude / Math.max(1e-6, t.landingRoughnessReference));

    const loss = clamp(
      (score - t.landingHeavyScore) * t.landingSpeedLossPerScore,
      0,
      t.landingMaxSpeedLoss,
    );

    this.landingQuality = score >= t.landingCrashScore
      ? 'crash'
      : score >= t.landingWobbleScore
        ? 'wobble'
        : score >= t.landingHeavyScore
          ? 'heavy'
          : 'clean';
    this.landingImpact = impact;
    this.landingMisalignment = misalignment;
    this.landingScore = score;
    this.landingSpeedLoss = loss;
    this.landings += 1;
    this.landingTimer = t.landingStateSeconds;
    this.justTouchedDown = true;

    this.y = this.groundY;
    this.verticalVelocity = 0;
    this.airborne = false;
    this.grounded = true;
    this.airTime = 0;
    this.airApex = 0;

    // The suspension takes the hit and the rider absorbs it. "Tire contacts
    // first, suspension compresses, rebound follows ... knees compress
    // sharply, hips lower, torso absorbs force" (motion reference §12.5).
    this.suspensionVelocity -= impact * t.landingSuspensionKick;
    this.absorb = clamp01(impact / Math.max(1e-6, t.landingImpactReference));

    // **The landing spends power headroom** — §4.5 lists "recent landing force"
    // among the four inputs to the load, which is what makes a heavy landing
    // while already fast the thing that tips the ladder into tilt-back.
    //
    // M6 also fed the oscillator here, in proportion to how far past clean the
    // landing was, and M13 removed that with the rest of the old trigger set
    // (§13 q8). The `wobble` landing tier survives as a *classification* — the
    // results screen still names it and `landingQuality` still reports it — but
    // it no longer starts an oscillation. A misjudged landing costs the rider
    // their speed and their score, not their balance.
    this.landingLoad = Math.min(
      this.landingLoad + (impact / Math.max(1e-6, t.landingImpactReference)) * t.powerLandingLoad,
      t.powerLandingLoad * 2,
    );

    return speed * alignment * (1 - loss);
  }

  /**
   * Is a pedal on the ground, and how far past clearance is it?
   *
   * **The clearance angle is derived from the wheel, not written down.** The
   * pedal's outer edge sits `pedalHalfSpan` from the centreline at
   * `pedalHeight` above the tread, so rolling about the contact patch brings
   * it to the ground at `atan(height / halfSpan)`. At the blocked-out
   * dimensions that is 0.55 rad — 31.7 degrees — which is where a real 18-inch
   * wheel with these pedals would scrape, and it moves on its own the moment
   * either dimension does.
   *
   * **The suspension is deliberately not in it, and that was a decision.**
   * `EUC_RIDER_MOTION_REFERENCE.md` §14 lists "hard compression while turning"
   * as a trigger, and folding the spring's travel into the height above is one
   * line. It was built that way and then taken out again, for three reasons
   * worth recording so nobody puts it back without meaning to:
   *
   *   - `docs/PLANS.md` §4.4 states the condition as `grounded and |rollAngle|
   *     > PEDAL_CLEARANCE_ANGLE` — a constant angle, not a moving one.
   *   - §4.3 says the suspension "only lightly modulates grip and is not
   *     load-bearing". Letting it decide when a pedal scrapes makes it
   *     load-bearing, which is a settled decision to reopen rather than to
   *     take in passing.
   *   - The spring is driven by a *spatial* roughness field, so two mirrored
   *     carves ride different ground. Coupling it in made a left-hand corner
   *     cost measurably more than the right-hand one for reasons no player
   *     could see, and broke two pieces of accepted M2/M3 evidence that assert
   *     the two are identical. That asymmetry is the tell: it was not a
   *     feature, it was terrain noise reaching the force model.
   *
   * Reopening it is a real feature and a good one — flagged in `CHANGELOG.md`
   * for the owner rather than settled here.
   *
   * Two consequences worth being explicit about. Pavement's 0.75 g lateral
   * ceiling allows 0.64 rad of lean, so a sustained full-lock carve on a hard
   * surface scrapes — that is §4.4's "learnable limit". Grass and gravel cap
   * the lean below the clearance angle through their grip, so they never do,
   * which is exactly how it works in life.
   */
  private updatePedalStrike(airborne: boolean): void {
    const t = this.tuning;
    const previous = this.pedalStrike;

    this.pedalClearance = Math.atan2(t.pedalHeight, t.pedalHalfSpan);

    // The clearance stays purely geometric (asserted by the M5 evidence); the
    // grace angle on top of it is where a strike *begins* — a glancing touch
    // at the geometric limit neither sparks nor sounds, so the whole event
    // (sound, sparks, jolt, drag — all keyed off `pedalStrike`) is saved for
    // genuinely hard carves. Owner, 2026-08-04: "save it for hard carves not
    // every basic turn like it is now."
    const overlap = Math.abs(this.rollAngle) - this.pedalClearance - t.pedalStrikeGraceAngle;
    if (airborne || overlap <= 0) {
      this.pedalStrike = 0;
      return;
    }

    // Signed by the side that is scraping. A positive roll leans the rig
    // toward +X, the rider's LEFT, so that is the pedal on the ground.
    this.pedalStrike = this.rollAngle > 0 ? overlap : -overlap;

    // "Sharp lower-body jolt" (§14), on the onset edge only. A continuous
    // forcing here would fight the damper into a rattle and would also feed
    // back into the clearance angle it just raised.
    if (previous === 0) this.suspensionVelocity += t.pedalStrikeJolt;
  }

  /**
   * The rider's compression, 0..1 — one scalar for three motions.
   *
   * The hop preload, the partial tuck held in the air, and the sharp absorb at
   * touchdown are the same joint articulation at different depths, so they are
   * one blend rather than three animations that would have to be told not to
   * fight each other. The absorb decays on its own constant on top, because it
   * is something the ground did rather than something the rider chose.
   */
  private stepCrouch(dt: number, actions: ActionSnapshot): void {
    const t = this.tuning;
    // A charged hop is still on the ground during its short compression. Keep
    // the deliberate tuck while Shift remains held, even though `crouch`
    // itself is being driven by the hop preload for those steps. Otherwise a
    // rider who folds, then hops, briefly stands their torso back up immediately
    // before takeoff — the opposite of the composed stance the rig promises.
    const heldOnGround = !this.airborne && actions.crouch;
    const heldCompression = !this.compressing && heldOnGround;
    const target = this.compressing
      ? 1
      : this.airborne
        ? t.airTuck
        : heldCompression
          ? t.crouchHeldAmount
          : 0;
    this.crouch = approach(this.crouch, target, t.crouchResponseSeconds, Infinity, dt);
    this.absorb = approach(this.absorb, 0, t.landingAbsorbSeconds, Infinity, dt);
    // The held tuck rides the same time constant, so the two never disagree
    // about how fast the rider is folding. It is deliberately *not* raised by
    // the compression, the air tuck, or the absorb: those are knee events, and
    // this is the one that hinges the torso and draws the arms back.
    this.tuck = approach(this.tuck, heldOnGround ? 1 : 0, t.crouchResponseSeconds, Infinity, dt);
  }

  private surfaceResponse(): SurfaceResponse {
    return this.surfaces[this.surface] ?? this.surfaces.pavement;
  }

  // -- Single-step events, for the composition root -------------------------
  //
  // Getters rather than snapshot fields because `app/Game.ts` asks every step
  // and `snapshot()` allocates. A camera impulse and a particle burst are not
  // worth an object each at 120 Hz.

  /** True on exactly the step the wheel left the ground. */
  get tookOff(): boolean {
    return this.justTookOff;
  }

  /**
   * Whether a buffered hop may be claimed on the next controller step.
   *
   * The action buffer lives above simulation, but legality lives here. A Space
   * press during the last few steps of a flight must remain pending until the
   * tyre touches down instead of being consumed and discarded in mid-air.
   *
   * A crash refuses it for the same reason and to better effect (M6): a Space
   * press made while the rider is off the wheel stays in the buffer and fires
   * as a real hop on the first legal step after the recovery.
   */
  get canAcceptHop(): boolean {
    return !this.airborne && !this.compressing && !this.crashing;
  }

  /** True while the rider is off the wheel. `app/Game.ts` frames the camera. */
  get crashed(): boolean {
    return this.crashing;
  }

  /** True on exactly the step the wheel touched down. */
  get touchedDown(): boolean {
    return this.justTouchedDown;
  }

  /** Normal closing speed of the most recent landing, m/s. */
  get lastLandingImpact(): number {
    return this.landingImpact;
  }

  /**
   * How the most recent landing was judged. `none` until the first one.
   *
   * A getter beside the impact rather than only on the snapshot, because M10's
   * results screen counts clean landings and `snapshot()` allocates a large
   * object it would otherwise have to build inside the fixed step.
   *
   * **Read the verdict, never re-derive it from `landingScore`.** That number
   * is not normalised and runs the wrong way — it climbs from about 0 to past
   * 3 as a landing gets *worse*, and the tiers above are what turn it into a
   * judgement. A consumer applying its own threshold to the raw score gets the
   * polarity backwards, which is exactly what happened once already
   * (`simulation/challenge.ts`, `ChallengeStepInput.landingClean`).
   */
  get lastLandingQuality(): LandingQuality {
    return this.landingQuality;
  }

  /** Overlap past pedal clearance, signed by the scraping side. 0 when clear. */
  get pedalStrikeDepth(): number {
    return this.pedalStrike;
  }

  /** The surface under the contact patch. */
  get currentSurface(): SurfaceId {
    return this.surface;
  }

  /**
   * How much of a step the kerb feeler can see in front of the wheel, metres —
   * M18.
   *
   * Already computed every step for the player's own kerb handling and already
   * reported by `snapshot()`; this is the same number without the thirty-odd
   * allocations that come with a snapshot, because `simulation/cpuRider.ts`
   * reads it at 120 Hz. A second cast from the brain would be the same ray
   * traced twice and the two could disagree (master §5.4).
   */
  get curbHeightAhead(): number {
    return this.curbAhead;
  }

  /**
   * The lateral acceleration the wheel can hold on the surface it is on, in g —
   * M18.
   *
   * The same field `snapshot()` reports, exposed for the same reason
   * `curbHeightAhead` is: `simulation/cpuRider.ts` reads it every step, and it
   * is what keeps a CPU rider from cornering on gravel as though it were
   * pavement without the brain ever learning what a surface is.
   */
  get lateralLimit(): number {
    return this.lateralLimitG;
  }

  // -- What the composition root may push in (M14) --------------------------
  //
  // Two small, deliberately *neutral* doors. Neither knows a paddle exists, a
  // target exists, or a mode exists — they are "something knocked the machine"
  // and "something slowed it down", which is the whole of what the controller
  // needs to be told when a swing connects. The alternative was routing the
  // paddle through the controller so it could reach these privately, and that
  // would have made the weapon a property of the machine at exactly the moment
  // the project needs it to be a property of whoever is holding one.

  /**
   * A one-shot suspension impulse, m/s. **Presentation only.**
   *
   * The same device the pedal strike uses on its onset edge: one kick into the
   * spring–damper, which is the only thing that decays it. A continuous forcing
   * here would fight the damper into a rattle.
   *
   * **This is not a wobble door and must never become one.** The owner's
   * standing rule from the M13 exit ride is that nothing but a real hazard may
   * trigger wobble in play, and any other trigger found later is removed rather
   * than tuned. `injectWobble` stays private with its four sanctioned callers;
   * `simulation/paddle.test.ts` pins the census.
   */
  jolt(velocity: number): void {
    if (!Number.isFinite(velocity)) return;
    this.suspensionVelocity += velocity;
  }

  /**
   * Take speed off, toward zero rather than through it, m/s.
   *
   * The hazard rule expressed once and shared: a knock slows a wheel down, and
   * a rider going slowly enough when it lands should stop rather than reverse.
   * Zero is the shipped cost of a paddle hit (§13 q17) and this is here for the
   * slider behind it, so raising that slider cannot also reverse anybody.
   */
  shedSpeed(metresPerSecond: number): void {
    if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return;
    this.speed = this.speed >= 0
      ? Math.max(0, this.speed - metresPerSecond)
      : Math.min(0, this.speed + metresPerSecond);
  }

  /**
   * The rider bodily knocks a Knockabout target out — the fourth sanctioned
   * wobble caller.
   *
   * The owner classified a ridden-into target as a soft hazard on 2026-08-12,
   * the same classification bushes received on 2026-08-11: one bush-grade
   * wobble on the way in, a speed cost toward zero, and no crash funnel at any
   * speed. **The wobble energy is the soft-body constant read here, not a
   * parameter** — an energy the caller chose would make this a wobble door
   * with the standing rule's name on it, and the census in
   * `simulation/paddle.test.ts` exists to catch exactly that drift.
   */
  softKnock(speedCost: number): void {
    if (this.crashed) return;
    this.injectWobble(this.tuning.softBodyWobbleEnergy);
    this.shedSpeed(speedCost);
  }

  // -- What the audio layer reads (M8) --------------------------------------
  //
  // Getters for the same reason as the block above: `app/audio` is handed the
  // ride once per render frame and the events once per step, and `snapshot()`
  // allocates a large object with two nested vectors. None of these are new
  // state — every one is already on the snapshot — and nothing here knows that
  // sound exists, which is what keeps the options firewall and invariant 1
  // both intact.

  /** Charge captured by the hop that just fired, 0..1. A stamp is not a flick. */
  get lastHopCharge(): number {
    return this.hopCharge;
  }

  /** The power ladder's load scalar. 1.0 is tilt-back. */
  get powerLoad(): number {
    return this.loadFactor;
  }

  /**
   * True while the wheel is on the surround rather than the authored course.
   *
   * Already on the snapshot; exposed as a getter at M9 because the HUD reads
   * it every drawn frame and `snapshot()` allocates a large object. Same
   * reason `powerWarning` and `powerLoad` above are getters.
   */
  get offRoute(): boolean {
    return this.offCourse;
  }

  /** Which rung is lit. The beep pattern is chosen from this and nothing else. */
  get powerWarning(): PowerStage {
    return this.powerStage;
  }

  /**
   * Where drag balances drive for *this* controller's live tuning, m/s — M20.
   *
   * The same expression as `level/routeValidator.ts`'s `RIDEABILITY.topSpeed`,
   * and a colocated test asserts the two agree. It is computed here rather than
   * imported because that module is under `level/` and reads the frozen table,
   * while this one has to answer for whatever the developer panel has just
   * dragged — an over-speed ladder pinned to the shipped default would go on
   * beeping at 40 mph after the owner halved the drag on F4, which is the
   * precise shape of the M16 defect.
   *
   * Rolling resistance is deliberately absent, exactly as it is there: this is
   * the wheel's ceiling rather than any particular surface's, and the shares
   * that read it are calibrated against it (`data/tuning.ts`).
   */
  get derivedTopSpeed(): number {
    const t = this.tuning;
    return Math.sqrt((t.leanToAccel * Math.sin(t.maxLeanPitch)) / Math.max(1e-9, t.dragCoefficient));
  }

  /**
   * How near the cutout the wheel is, 0..1 — M20.
   *
   * 0 below the first beep, 1 at the speed the wheel gives up. The beeps, the
   * HUD glyph and the QA bridge all read *this* rather than recomputing it from
   * the speed, so what the player hears, what they see, and what a spec asserts
   * cannot disagree about the same step.
   */
  get overspeed(): number {
    return this.overspeedFactor;
  }

  /**
   * Seconds the wheel has been past the cutout speed. Zero whenever it is not.
   *
   * Exposed for the browser spec that has to prove the hold is a hold — that
   * touching the edge for one step is survivable and that staying there is not.
   */
  get overspeedHeld(): number {
    return this.overspeedHold;
  }

  /** Wobble energy as a fraction of the crash threshold, 0..1. */
  get wobbleLevel(): number {
    return clamp01(this.wobbleEnergy / Math.max(1e-6, this.tuning.wobbleCrashEnergy));
  }

  /** Normal closing speed of a solid-obstacle hit this step, m/s. 0 for none. */
  get obstacleImpact(): number {
    return this.collisionImpact;
  }

  /** Fill a caller-owned pose. Allocation-free; called twice per step. */
  writePose(target: EucPose): void {
    const t = this.tuning;
    // Tilt-back is the machine tipping its pedals back *under* the rider, so
    // wheel and rider take it in full and the difference between them — which
    // is what `ridingRig.ts` turns into the pelvis hinge — is unchanged. A
    // rider who merely chose to lean back would look like a rider braking.
    const tiltPitch = this.tiltBack * t.tiltBackPedalPitch;

    target.x = this.x;
    target.y = this.y;
    target.z = this.z;
    target.headingY = this.headingY;
    target.rollAngle = this.rollAngle;
    target.riderRoll = this.rollAngle * lerp(
      this.tuning.riderUpperBodyRollFactor,
      this.tuning.technicalTurnUpperBodyRollFactor,
      Math.abs(this.technicalTurn),
    );
    // The rider carries the slope lean; the wheel's share is of the action
    // pitch alone, because the pedals stay level with gravity on a hill.
    //
    // The air attitude is the one thing both take in full. On the ground the
    // firmware holds the pedals level and only a fraction of the rider's
    // hinge reaches the machine; off the ground there is nothing holding
    // anything level, so wheel and rider pitch together — which is what makes
    // a drop read as the whole rig setting up for the landing rather than as
    // the rider bowing at a wheel that stayed flat.
    target.riderPitch = this.riderPitch + this.slopeLean + this.airPitch - tiltPitch;
    target.riderLookYaw = this.riderLookYaw;
    target.riderTurnTwist = this.riderTurnTwist;
    target.technicalTurn = this.technicalTurn;
    target.reverseBlend = this.reverseBlend;
    target.wheelPitch = this.riderPitch * t.wheelPitchFactor + this.airPitch - tiltPitch;
    target.wheelSpin = this.wheelSpin;
    target.groundPitch = this.groundPitch;
    target.groundRoll = this.groundRoll;
    target.suspensionOffset = this.suspensionOffset;
    target.restFactor = this.restFactor;
    target.speed = this.speed;
    target.crouch = clamp01(this.crouch + this.absorb);
    target.tuck = this.tuck;
    target.airBlend = this.airBlend;
    target.airHeight = this.y - this.groundY;
    target.groundY = this.groundY;
    target.pedalStrike = this.pedalStrike;

    // -- Wobble, power, crash (M6) ------------------------------------------
    target.wobble = clamp01(this.wobbleEnergy / Math.max(1e-6, t.wobbleCrashEnergy));
    target.wobbleFootCorrection = this.wobbleFootCorrection;
    target.wobbleYaw = this.wobbleYaw;
    target.wobbleRoll = this.wobbleRoll;
    target.wobbleSway = this.wobbleSway;
    // **Both wobble remaps live here, and only here** (M13). The rig used to
    // re-derive this one from the frozen tuning table, which detached the
    // rider's pose from the F4 panel and, worse, divided by a threshold the
    // controller had stopped applying. One owner, so they cannot disagree.
    target.wobbleFight = clamp01(
      (this.wobbleEnergy - t.wobbleStateEnergy)
        / Math.max(1e-6, t.wobbleCrashEnergy - t.wobbleStateEnergy),
    );
    // **`alert` counts rungs, not raw load** — and that is not cosmetic. The
    // power ladder's rungs are at 0.60, 0.82, and 1.00, which are deliberately
    // not evenly spaced, so a light driven from the raw load showed nearly the
    // amber colour while the debug overlay was still reporting `notice`. A
    // machine whose warning light disagrees with its own state is worse than
    // one with no light. Mapped through the rungs, each colour stop lands
    // exactly on the rung it names.
    target.alert = Math.max(
      ladder(this.wobbleEnergy, [
        t.wobbleStateEnergy * 0.5,
        t.wobbleStateEnergy,
        t.wobbleCrashEnergy,
      ]),
      ladder(this.loadFactor, [t.powerNoticeLoad, t.powerWarnLoad, t.powerTiltBackLoad]),
    );
    target.tiltBack = this.tiltBack;
    target.recoverBlend = clamp01(
      1 - this.recoverTimer / Math.max(1e-6, t.crashRecoverBlendSeconds),
    );

    // **The ragdoll and the wheel flourish (M15), before the early return
    // below** — the first crashing step has `crashBlend` still at zero, and a
    // pose written that frame must already carry the truth about both.
    target.wheelCrashSpin = this.wheelCrashSpin;
    target.wheelCrashPop = this.wheelCrashPop;
    if (this.ragdolling) {
      target.ragdollBlend = Math.min(
        1,
        this.crashTime / Math.max(1e-6, t.ragdollBlendSeconds),
      );
      target.ragdoll.set(this.ragdoll.positions);
    } else {
      target.ragdollBlend = 0;
    }

    // **The crash motion, resolved here rather than in the renderer.** Which
    // motion is playing is a simulation fact, and an enum does not interpolate;
    // three signed offsets and two angles do. The rig applies them to the rider
    // root without a second opinion, exactly as it applies the ground tilt.
    const blend = this.crashBlend;
    target.crashBlend = blend;
    if (blend <= 0) {
      target.crashForward = 0;
      target.crashLateral = 0;
      target.crashDrop = 0;
      target.crashTumble = 0;
      target.crashRoll = 0;
      target.wheelCrashLean = 0;
      return;
    }

    const sideFall = this.crashMotion === 'sideFall';
    // A run-out carries the rider well past the wheel on their feet; a step-off
    // barely separates at all; a side fall goes down beside it; a faceplant
    // (cutout, ragdoll-off fallback) throws them almost as far forward as a
    // run-out but face-down through the non-side-fall drop-and-tumble below.
    // An obstacle fall goes sideways from the contact point. Sending the rider
    // forward along the generic side-fall path would put them through the same
    // solid face that just took the wheel out from under them.
    const reach = this.crashCause === 'obstacle'
      ? 0
      : sideFall
        ? 0.5
        : this.crashMotion === 'runOut'
          ? 1
          : this.crashMotion === 'faceplant'
            ? 0.85
            : 0.35;
    const spread = sideFall ? 1 : this.crashMotion === 'stepOff' ? 0.5 : 0.18;
    target.crashForward = t.crashSeparationForward * reach * blend;
    target.crashLateral = this.crashSide * t.crashSeparationLateral * spread * blend;

    // **A side fall lies the rider down by rotating them, not by sinking
    // them.** The rider root sits at the contact patch, so a roll of 1.35 rad
    // swings hips that were 0.92 m up out to 0.90 m aside and 0.21 m above the
    // ground — which is a person on their side. Dropping the root as well, as
    // the first pass did, put the whole figure through the floor. Only the
    // rider *on their feet* drops, and only by the difference between riding
    // hips and standing hips.
    //
    // For the same reason a side fall carries no forward tumble: rotating about
    // both axes at once reads as a face-plant rather than as "rider falls
    // laterally, arms protect body" (`EUC_RIDER_MOTION_REFERENCE.md` §16). The
    // pitch belongs to the run-out, where it is the forward lean of somebody
    // running the wheel off.
    //
    // **The tumble wave** — the "more wipeout ish" the owner asked for when
    // the crash stretched to cover his recording. One damped sine over
    // `crashTime`: the roll rocks past flat and settles, the body bounces off
    // the ground on the positive half-cycles, and the on-their-feet motions
    // bob forward instead of rolling. Effectively zero by the time manual
    // recovery opens, so the recovery blend never fights it.
    const wave = Math.sin(2 * Math.PI * t.crashTumbleHz * this.crashTime)
      * Math.exp(-this.crashTime / Math.max(1e-6, t.crashTumbleDampSeconds));
    const bounce = t.crashTumbleBounce * Math.max(0, wave) * blend;
    if (sideFall) {
      target.crashDrop = t.crashSideFallDrop * blend - bounce;
      target.crashTumble = 0;
      target.crashRoll = this.crashSide
        * (t.crashSideFallRoll * blend + t.crashTumbleRoll * wave * blend);
    } else {
      target.crashDrop = t.crashRiderDrop * blend - bounce * 0.5;
      target.crashTumble = (t.crashRiderTumble + t.crashTumblePitch * wave) * blend;
      target.crashRoll = 0;
    }
    target.wheelCrashLean = this.crashSide * this.wheelCrashLean;
  }

  snapshot(): EucSnapshot {
    const t = this.tuning;
    const tiltPitch = this.tiltBack * t.tiltBackPedalPitch;
    return {
      state: this.state,
      position: { x: this.x, y: this.y, z: this.z },
      headingY: this.headingY,
      speed: this.speed,
      speedKph: this.speed * 3.6,
      longitudinalAccel: this.longitudinalAccel,
      leanPitch: this.leanPitch,
      riderPitch: this.riderPitch + this.slopeLean + this.airPitch - tiltPitch,
      slopeLean: this.slopeLean,
      restFactor: this.restFactor,
      riderLookYaw: this.riderLookYaw,
      riderTurnTwist: this.riderTurnTwist,
      technicalTurn: this.technicalTurn,
      wheelPitch: this.riderPitch * t.wheelPitchFactor + this.airPitch - tiltPitch,
      rollAngle: this.rollAngle,
      riderRoll: this.rollAngle * lerp(
        t.riderUpperBodyRollFactor,
        t.technicalTurnUpperBodyRollFactor,
        Math.abs(this.technicalTurn),
      ),
      yawRate: this.yawRate,
      lateralAccel: this.lateralAccel,
      lateralLimited: this.lateralLimited,
      reversing: this.reversing,
      reverseBlend: this.reverseBlend,
      grounded: this.grounded,
      surface: this.surface,
      wheelSpin: this.wheelSpin,
      distanceTravelled: this.distanceTravelled,

      offCourse: this.offCourse,
      groundNormal: { ...this.ground.normal },
      slope: this.slope,
      slopeAccel: this.slopeAccel,
      rollingResistance: this.rollingResistance,
      lateralLimitG: this.lateralLimitG,
      suspensionOffset: this.suspensionOffset,
      suspensionCompression: this.suspensionCompression,
      curbAhead: this.curbAhead,
      lastStepUp: this.lastStepUp,
      blocked: this.blocked,
      collisionImpact: this.collisionImpact,

      compressing: this.compressing,
      hopCharge: this.hopCharge,
      crouchCharge: clamp01(this.crouchHold / Math.max(1e-6, this.tuning.hopChargeSeconds)),
      hops: this.hops,
      verticalVelocity: this.verticalVelocity,
      airHeight: this.y - this.groundY,
      airApex: this.airApex,
      airTime: this.airTime,
      airMisalignment: this.airborne
        ? Math.acos(clamp(
          this.airDirX * Math.sin(this.headingY) + this.airDirZ * Math.cos(this.headingY),
          -1,
          1,
        ))
        : 0,
      landingQuality: this.landingQuality,
      landingImpact: this.landingImpact,
      landingMisalignment: this.landingMisalignment,
      landingScore: this.landingScore,
      landingSpeedLoss: this.landingSpeedLoss,
      landings: this.landings,
      pedalStrike: this.pedalStrike,
      pedalClearance: this.pedalClearance,

      wobbleEnergy: this.wobbleEnergy,
      wobbleYaw: this.wobbleYaw,
      wobbleRoll: this.wobbleRoll,
      wobbleRate: this.wobbleRate,
      wobbleSmoothness: this.wobbleSmoothness,
      wobbleFootCorrection: this.wobbleFootCorrection,

      loadFactor: this.loadFactor,
      powerStage: this.powerStage,
      tiltBack: this.tiltBack,
      overspeed: this.overspeedFactor,
      overspeedHeld: this.overspeedHold,

      crashed: this.crashing,
      crashCause: this.crashCause,
      crashMotion: this.crashMotion,
      ragdolling: this.ragdolling,
      inFoliage: this.inSoftBody,
      crashTime: this.crashing ? this.crashTime : 0,
      crashes: this.crashes,
      recoveryReady: this.crashing && this.crashTime >= t.crashRecoverEarliestSeconds,
      invulnerable: this.invulnerableTimer,
      safePosition: { x: this.safeX, y: 0, z: this.safeZ },
      safeHeading: this.safeHeading,
    };
  }
}

/**
 * The component of gravity along the heading, on a surface with this normal.
 *
 * Exported because the derivation is worth having in one named place: project
 * the horizontal heading onto the surface plane, then take gravity's component
 * along the result. On a plane rising at angle theta in the direction of
 * travel it evaluates to exactly `-g sin(theta)`, which is the line
 * `docs/PLANS.md` §4.1 writes — and unlike that line it needs no authored
 * gradient, so it is correct on arbitrary terrain.
 */
export function slopeAccelFor(
  normal: Vec3,
  forwardX: number,
  forwardZ: number,
  gravity: number,
): number {
  const alongNormal = forwardX * normal.x + forwardZ * normal.z;
  if (alongNormal === 0) return 0;

  const tangentX = forwardX - alongNormal * normal.x;
  const tangentY = -alongNormal * normal.y;
  const tangentZ = forwardZ - alongNormal * normal.z;
  const length = Math.hypot(tangentX, tangentY, tangentZ);
  if (length <= 1e-6) return 0;

  return -gravity * (tangentY / length);
}

/**
 * Map a value through named, unevenly spaced rungs onto an even 0..1 ladder.
 *
 * The power ladder's rungs sit at 0.60, 0.82, and 1.00 because that is where
 * each of them *means* something — the first just above what flat-out riding on
 * the flat produces, the last where the throttle stops answering. A consumer
 * that wants "how far up the ladder is this" cannot divide by the top rung and
 * get an answer that agrees with the rung names, which is exactly the mismatch
 * the machine's status light showed in its first browser capture: nearly amber
 * while the state was still `notice`.
 *
 * The result is `k / rungs.length` at the k-th rung, and it interpolates
 * linearly between them.
 *
 * **Rungs are forced to ascend rather than assumed to.** Every one of them is
 * on F4, and an owner who drags the tilt-back rung below the amber one would
 * otherwise get a status light running backwards — which is precisely what the
 * first browser capture of a lowered tilt-back showed: a wheel reporting
 * `tiltBack` with a yellow-green light. A rung dragged under its predecessor
 * simply becomes unreachable, which is also what the stage machine does with
 * it.
 */
export function ladder(value: number, rungs: readonly number[]): number {
  if (!(value > 0) || rungs.length === 0) return 0;
  const span = 1 / rungs.length;
  let low = 0;
  for (let i = 0; i < rungs.length; i += 1) {
    const high = Math.max(rungs[i], low + 1e-6);
    if (value < high) return (i + (value - low) / (high - low)) * span;
    low = high;
  }
  return 1;
}

/**
 * A non-finite axis would poison every downstream number silently — position
 * becomes NaN, the rig disappears, and nothing in the console says why. The
 * input layer already clamps, so this only catches a caller that bypassed it.
 */
function safeAxis(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
