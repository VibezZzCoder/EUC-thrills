/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, EUC, LIVE_TUNABLES, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { riderRollFor } from '../simulation/riderLean.ts';
import { createPlaceholderRider, createStanceInput, type StanceInput } from './rider.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  ADONISB2_LOOK,
  COOL_RIDER_LOOK,
  DRUNKARD_GLOVE_VERTICES,
  DRUNKARD_HAT,
  DRUNKARD_HEAD,
  DRUNKARD_HIP_DOME_APEX,
  DRUNKARD_LOOK,
  MARIBEL_LOOK,
  TROLLINA_LOOK,
  WHEEL_IN_MOTION_LOOK,
  WIM_HIP_DOME_APEX,
  type RiderLook,
} from './riderLook.ts';
import { loftGeometry, type LoftProfile } from './blockoutKit.ts';

/**
 * The skirt clears the legs, measured — M14.5 second look pass.
 *
 * **This file is the measurement behind an owner report.** "When carving the
 * outer leg clips the skirt" arrived on 2026-08-10, and it was the third
 * garment-versus-rig defect in as many passes; every one of them was found by
 * eye, after the fact, from one lucky camera angle. The legs are posed by IK
 * against planted pedals and the garment is rigid on the pelvis, so whether
 * they intersect is pure geometry — which means it is *testable*, and a
 * property this easy to break silently has to be.
 *
 * The rig is driven through the reachable stance envelope via the same
 * `applyStanceReaction` the game calls, with `torsoPitch` composed the way
 * `ridingRig.ts` composes it (the wheel takes `wheelPitchFactor` of the lean;
 * the constant rest tilt rides on top). Every vertex of both thighs and both
 * shins is then transformed into the pelvis frame — the frame the dress is
 * rigid in — and measured against the dress profile's own cross-section.
 *
 * ## Two tiers, because full containment is geometrically impossible
 *
 * A thigh the IK has folded toward horizontal (a full crouch inside a full
 * carve, or a held tuck) sweeps through any hem the character could wear —
 * real cloth drapes over the thigh at that point; rigid geometry can only
 * interpenetrate. No skirt "fixes" that, so the design splits the problem:
 *
 *   - **Asserted geometrically** — the held riding envelope (any carve × any
 *     lean, riding, resting, reversing, crashed) clears outright with margin,
 *     and so does the common transient (a preload, into a moderate carve).
 *     These are the stances the player holds and the ones the owner's report
 *     came from.
 *   - **Made invisible structurally** — the deep compound folds cross at the
 *     hem edge only, against tights that match the seat exactly
 *     (`RiderLook.parts`): no contrast, no value step, no silhouette break —
 *     a short skirt sitting on folded legs, which is what the real garment
 *     would do. The last test pins the material identities that property
 *     rests on.
 *
 * Cool Rider is deliberately not asserted here: his jacket, trousers and legs
 * are one suit in one material, so this class of intersection has never had
 * anything to show on him. The test is about the one look that wears a skirt
 * over a different garment; a third look that does the same must join it.
 */

/** Interpolate a loft profile's cross-section at a local height. */
function ringAtHeight(profile: LoftProfile, y: number): {
  halfWidth: number; halfDepth: number; x: number; z: number; square: number;
} {
  const last = profile.length - 1;
  if (y <= profile[0]!.y) return profile[0]!;
  if (y >= profile[last]!.y) return profile[last]!;
  for (let i = 1; i <= last; i += 1) {
    const above = profile[i]!;
    if (y <= above.y) {
      const below = profile[i - 1]!;
      const f = (y - below.y) / (above.y - below.y);
      return {
        halfWidth: below.halfWidth + (above.halfWidth - below.halfWidth) * f,
        halfDepth: below.halfDepth + (above.halfDepth - below.halfDepth) * f,
        x: below.x + (above.x - below.x) * f,
        z: below.z + (above.z - below.z) * f,
        square: below.square + (above.square - below.square) * f,
      };
    }
  }
  return profile[last]!;
}

/**
 * Signed distance from a point to **one** section's boundary, along the ray
 * from that section's centre. Positive is inside.
 *
 * Factored out of `depthInside` for q121: the jacket-hem contracts measure
 * against the loft's own *lowest* ring rather than against the ring at the
 * point's height, and both want the same section arithmetic.
 */
function depthInRing(
  ring: { halfWidth: number; halfDepth: number; x: number; z: number; square: number },
  point: THREE.Vector3,
): number {
  const dx = point.x - ring.x;
  const dz = point.z - ring.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return Math.min(ring.halfWidth, ring.halfDepth);
  // |x/hw|^sq + |z/hd|^sq = 1 is the section boundary (see `loftPoint`).
  const g = Math.abs(dx / ring.halfWidth) ** ring.square
    + Math.abs(dz / ring.halfDepth) ** ring.square;
  return (g ** (-1 / ring.square) - 1) * r;
}

/**
 * Signed distance from a point to the profile's surface at the point's own
 * height, along the ray from the section's centre. Positive is inside.
 */
function depthInside(profile: LoftProfile, point: THREE.Vector3): number {
  return depthInRing(ringAtHeight(profile, point.y), point);
}

/**
 * **How near a point comes to the garment's hem ring**, in the pelvis frame —
 * the radial half of q121's re-derived jacket-hem metric.
 *
 * The hem is the loft's own lowest section, so in the frame the garment is
 * rigid in it is a closed curve at one height. This is the distance to that
 * curve, taken in the (radial, vertical) half-plane at the point's own
 * azimuth: `depthInRing` gives the radial leg the same way `depthInside`
 * gives Trollina's, and the vertical leg is the drop below the ring's height.
 *
 * The radial leg's **sign does not matter** and `Math.hypot` drops it: a point
 * 50 mm inboard of the rim and one 50 mm outboard of it are both 50 mm from
 * the rim, which is the whole difference between this and a bare height. A leg
 * that has swung out in front of or beside the hip is *beside* the hem, not
 * above it, however the counter-roll has tilted the two frames apart.
 */
function hemRingClearance(profile: LoftProfile, point: THREE.Vector3): number {
  const ring = profile[0]!;
  return Math.hypot(depthInRing(ring, point), point.y - ring.y);
}

interface Fit {
  /** Worst shortfall: minimum radial depth inside the skirt, metres. */
  radial: number;
  /** Highest leg vertex that escapes the rigid skirt, in the pelvis frame. */
  highestOutside: number;
  points: number;
}

/** The composed torso hinge `ridingRig.ts` hands over for a given lean. */
function torsoPitchFor(riderPitch: number): number {
  return riderPitch * (1 - EUC.wheelPitchFactor) + RIDER_BLOCKOUT.torsoRestPitch;
}

/**
 * A stance for one of the sweeps below: the rig's own `StanceInput` fields,
 * plus **the rider's roll**, which since M30 Phase 3 is a channel the rig
 * receives rather than a number derivable from `rollAngle` (see
 * `riderRollsFor`). Absent means "whatever the low-speed schedule gives this
 * wheel roll", which is the pre-M30 pose to the bit.
 */
type StanceCase = Partial<StanceInput> & { riderRoll?: number };
/** The same, carrying the label a failure message prints. */
type LabelledStance = StanceCase & { label: string };
/** An assembled stance, ready for the rig. */
type Posed = StanceInput & { riderRoll?: number };

/**
 * The rider's own roll for a stance the sweep has not widened: the pre-M30
 * expression, which `simulation/riderLean.ts` keeps as its low band.
 *
 * `riderRollFor` at speed 0 is `rollAngle × lerp(riderUpperBodyRollFactor,
 * technicalTurnUpperBodyRollFactor, |technicalTurn|)` — the same operations in
 * the same order this file used to inline, which is why every stance nothing
 * widens keeps exactly the pose it held before M30.
 */
function lowSpeedRiderRoll(rollAngle: number, technicalTurn: number): number {
  // The wheel's roll stands in for `riderLean`, which below the first anchor
  // is not read at all: the blend is zero and the low term is the whole
  // result. (Past the ordinary ceiling the two part company — M30 Phase 2 —
  // and `riderRollsFor` is where that widening lives.)
  return riderRollFor(rollAngle, rollAngle, technicalTurn, 0, EUC);
}

/**
 * The counter-roll `ridingRig.ts` writes onto the pelvis before it hands the
 * stance over — **and the term this whole file used to be missing.**
 *
 * The rig's line is
 * `pelvis.rotation.z = -(riderRoll - rollAngle) * (1 - motion.overLean) - …`,
 * so what it writes for a look with no over-lean is exactly `rollAngle -
 * riderRoll`: the wheel's roll less the rider's own. Everything worn on the
 * pelvis — the skirt, the jacket, the pack — goes with it. The legs do not:
 * they are solved to pedals that take the wheel's roll in full.
 *
 * Until M30 the rider's roll was a *fraction* of the wheel's
 * (`EUC.riderUpperBodyRollFactor`, and a smaller one again inside the
 * low-speed technical turn), so this was `rollAngle × (1 - follow)` and
 * nothing else. At a 0.80 rad technical turn that is **0.66 rad of relative
 * rotation between the garment and the limbs inside it**, and this file
 * modelled none of it: it posed a rider whose skirt rolled with the wheel,
 * which is not a rider this game has ever drawn.
 *
 * That is why an owner ride found a thigh through Trollina's skirt in an
 * ordinary low-speed corner while every stance here passed with 21 mm to
 * spare. Measured with the term restored, the same build was **195 mm
 * outside**. A contract that omits the largest transform between the two
 * things it compares is not a loose contract, it is a different one.
 *
 * M30 Phase 3 keeps the term and takes away the derivation: `riderRoll` is
 * scheduled by *speed* now, so the same wheel roll produces three different
 * hinges depending on how fast the corner was taken, and this function reads
 * the one the sweep named. It is written as the *subtraction the rig writes*
 * rather than as the algebraically equal `rollAngle × (1 - follow)` this file
 * used to carry: the two differ in the last place, and of the two it is the
 * rig's form that is the contract.
 */
function pelvisCounterRoll(stance: Posed): number {
  const riderRoll = stance.riderRoll
    ?? lowSpeedRiderRoll(stance.rollAngle, stance.technicalTurn);
  return stance.rollAngle - riderRoll;
}

function measure(
  rider: ReturnType<typeof createPlaceholderRider>,
  overrides: StanceCase,
  zoneTop: number,
): Fit {
  const stance = Object.assign(createStanceInput(), overrides);
  // Written first, exactly as the rig writes it first — `render/rider.ts` owns
  // every other axis of this joint and never touches `z`.
  rider.pelvis.rotation.z = pelvisCounterRoll(stance);
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);

  const pelvis = rider.pelvis;
  const profile = TROLLINA_LOOK.profiles.torso;
  const hem = profile[0]!.y;

  const legMeshes: THREE.Mesh[] = [];
  for (const side of ['left', 'right']) {
    const hip = rider.root.getObjectByName(`rider-hip-${side}`)!;
    const knee = rider.root.getObjectByName(`rider-knee-${side}`)!;
    for (const joint of [hip, knee]) {
      const mesh = joint.children.find(
        (child) => (child as THREE.Mesh).isMesh === true && child.name === '',
      ) as THREE.Mesh | undefined;
      assert.ok(mesh, `no limb mesh under rider-${side}`);
      legMeshes.push(mesh);
    }
  }

  const point = new THREE.Vector3();
  let radial = Infinity;
  let highestOutside = -Infinity;
  let points = 0;
  for (const mesh of legMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      point.fromBufferAttribute(positions, i);
      mesh.localToWorld(point);
      pelvis.worldToLocal(point);
      // Only the span the skirt occupies. Below the hem a leg is *supposed*
      // to be outside the garment; above the zone the bodice is nowhere a
      // knee can reach in the stances that tier asserts.
      if (point.y < hem + 0.003 || point.y > zoneTop) continue;
      points += 1;
      const depth = depthInside(profile, point);
      radial = Math.min(radial, depth);
      if (depth < 0) highestOutside = Math.max(highestOutside, point.y);
    }
  }
  return { radial, highestOutside, points };
}

/**
 * The roll a carve can *hold* on pavement: `rollAngle = atan(lateral / g)` and
 * the lateral is grip-limited, so this is the ceiling at any speed where a
 * rider also has a fore-aft lean to spend.
 *
 * `carveReactionFullRoll` — the angle at which the rider's carve *reaction*
 * saturates — is nearly the same number and was standing in for it here. They
 * are not the same quantity, and the difference stopped being academic when
 * the technical turn arrived: see `TECHNICAL_ROLL`.
 */
const GRIP_ROLL = Math.atan(EUC.maxLateralG);
const CARVES = [-GRIP_ROLL, -0.45, 0, 0.45, GRIP_ROLL];
/**
 * **Past the grip limit, and reachable** — `EUC.technicalTurnBonusG` buys a
 * hard low-speed corner more lateral than the tyre alone can hold, so
 * `atan()` of it takes the roll past `GRIP_ROLL`. Measured in the running
 * game at 0.80 rad (9 km/h, `technicalTurn` −0.44), which is the screenshot
 * the owner sent. It arrives with **no fore-aft lean**, because the technique
 * fades out with speed and a lean is something acceleration buys.
 */
const TECHNICAL_ROLL = 0.80;
/**
 * The technical-turn blend, swept. Signed, and both signs are asserted: the
 * technique is not symmetric — one hip drops further than the other.
 */
const TECHNICAL_TURNS = [-1, -0.81, -0.44, 0, 0.44, 0.81, 1];

/**
 * **The F4 slider's own maximum, read from the panel rather than copied.**
 *
 * `EUC.carveLeanShareTop` is live-tunable (`LIVE_TUNABLES`), so the pose these
 * contracts have to clear is not the shipped 1.0 but anything the slider can
 * be dragged to. Hardcoding the number here would let the panel's maximum move
 * without the clearance sweep noticing, which is the whole failure mode
 * invariant 15 is about — so the sweep asks the panel.
 *
 * §30.3d's rule, stated at both ends: **a slider maximum the contracts cannot
 * clear is lowered, and the reason written beside it in `data/tuning.ts`** —
 * never the other way round. If this constant rises and a margin below goes
 * negative, the answer is in the tuning table, not in the bound.
 */
const LEAN_SHARE_TOP_MAX = ((): number => {
  const spec = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveLeanShareTop');
  assert.ok(spec, "the F4 panel has no 'EUC.carveLeanShareTop' slider to bound the sweep by");
  return spec.max;
})();

/**
 * **What the machine reaches** — measured headlessly on a real `EucController`
 * (M30 Phase 3, the `TECHNICAL_ROLL` treatment applied to the new axis), a
 * flat-out pavement run into full lock, throttle held:
 *
 * ```
 *   flat out, straight     22.2521 m/s (49.78 mph), roll 0
 *   full lock, settled     20.8609 m/s (46.66 mph)
 *     rollAngle            -0.643501 rad  = GRIP_ROLL exactly, lateralLimited
 *     riderLean            -0.643501 rad  = rollAngle to the bit
 *     riderRoll  share 1.0 -0.596913 rad  (0.928 × GRIP_ROLL)
 *                share 1.2 -0.714250 rad  (1.110 × GRIP_ROLL)
 *     peak riderRoll   1.0  0.631597 rad  (0.982 × GRIP_ROLL)
 *                      1.2  0.757571 rad  (1.177 × GRIP_ROLL)
 * ```
 *
 * (Measured on the Phase 3 build, while the wheel's bank and the rider's lean
 * were still the same number and the slider still offered 1.2. Phase 2 raises
 * every rider row and none of the wheel rows — see the paragraph below — and
 * the same full-lock carve now settles at −0.6435 rad of bank under a −0.79
 * rad lean.) The settled numbers fall short of the share because a full-lock
 * corner *costs* speed — 20.86 m/s is below `carveLeanFullSpeed` (22.25, the
 * flat terminal the wheel reaches), so the schedule is still blending. The
 * peaks are the entry, taken at terminal. The arithmetic ceiling is reached
 * outright on a faster build: under `?mph=65` the corner settles above the
 * anchor and the share is spent in full, and a downhill does the same on the
 * shipped one. So the bound is the arithmetic:
 *
 *   `riderRoll` ∈ [low-speed share × rollAngle, LEAN_SHARE_TOP_MAX × HANG_RATIO
 *   × rollAngle], and |riderRoll| ≤ `RIDER_ROLL_CEILING` (0.810 rad at 1.00).
 *
 * `GRIP_ROLL` stays the **wheel's** bound: the machine cannot bank past
 * `atan(maxLateralG)` at speed, which the settled measurement above confirms
 * to six decimal places — *settled*. The roll is `approach`ed over 0.11 s and
 * overshoots its target on the way in: the Phase 3 QA swept 252 ride shapes
 * and found the wheel 1.35 × 10⁻⁴ rad (0.008°) past `GRIP_ROLL` at 8.5 m/s
 * with the lean blend live. A gate written as an exact inequality on the
 * target is a hair loose on the state; the contracts have millimetres where
 * that hair is microns, and the `1e-9` below is about the target.
 *
 * **Phase 2 (`docs/PLANS.md` §30.7) raised it, and this is the widened
 * file.** That phase saturates the wheel's bank at the ordinary ceiling and
 * lets `riderLean` carry the whole cornering force, so `riderLean` stops
 * equalling `rollAngle`: at the 1.05 g top the force lean is
 * `atan(1.05)` = 0.8098 rad over a wheel still held at `GRIP_ROLL`
 * 0.6435 — the rider **hangs inside the machine's line** by 9.5°, and the
 * pelvis hinge that carries it is the thing every measure in this file has
 * between its two frames.
 *
 * So the rider's roll is no longer a multiple of the wheel's bank alone. Two
 * constants replace the one:
 *
 *   - `RIDER_LEAN_CEILING` = `atan(EUC.carveGripTopG)`, the largest force lean
 *     the schedule asks for. It reads the **shipped** constant rather than the
 *     F4 slider's maximum, exactly as `GRIP_ROLL` reads the shipped
 *     `maxLateralG` rather than that slider's 1.6: both are the machine's own
 *     numbers, and a ride that moves either is a ride that re-measures this
 *     file (Phase 4, q114). `carveLeanShareTop` is the exception because q115
 *     hands that one to the owner's ride by name.
 *   - `HANG_RATIO` = `RIDER_LEAN_CEILING / GRIP_ROLL` (1.2584 on pavement),
 *     the most the force lean can exceed the bank by. Both angles are
 *     `approach`ed from zero through the same `rollResponseSeconds` toward
 *     targets in that ratio, so it bounds the transient as well as the settled
 *     pose, and scaling a swept `rollAngle` by it is the honest widest lean
 *     that bank can be under.
 */
const RIDER_LEAN_CEILING = Math.atan(EUC.carveGripTopG);
const HANG_RATIO = RIDER_LEAN_CEILING / GRIP_ROLL;
const RIDER_ROLL_CEILING = LEAN_SHARE_TOP_MAX * RIDER_LEAN_CEILING;

/**
 * **The M30 axis: the rider's roll, swept independently of the wheel's.**
 *
 * Before M30 the upper body took a fixed fraction of `rollAngle`, so a sweep
 * over carves was a sweep over pelvis hinges too. `simulation/riderLean.ts`
 * schedules it by *speed* now: below 6 m/s the old share, rising linearly to
 * `carveLeanShareTop` of `riderLean` at 22.3 m/s. One wheel roll therefore has
 * a whole family of poses, and a contract that measured only one of them would
 * be back where invariant 15 found this file.
 *
 * Four values per wheel roll — the family's endpoints and one interior point:
 *
 *   - **the low band** — `riderRollFor(…, speed 0)`, the pre-M30 expression,
 *     and the pose everything below `carveLeanSpeed` still holds;
 *   - **share 1.00** — the whole cornering lean, which since Phase 2 is the
 *     rider **hanging inside** the wheel's line: the hinge is
 *     `(HANG_RATIO − 1) × rollAngle` **into** the inside thigh, not zero. It
 *     was the harmless end of this axis for one phase and is not any more;
 *   - **share `LEAN_SHARE_TOP_MAX`** — the slider's ceiling, the same hinge
 *     multiplied again. That is the worst case §30.3d names, and it is what
 *     the slider's maximum is bounded by — measured as ridden, lowered to 1.04
 *     the day Phase 2 landed and to 1.00 by that phase's QA, which is why this
 *     entry and the one above it are the same pose today;
 *   - **half a settle** (M30 Phase 3b) — `riderRollFor(…, settle 0.5)` at the
 *     top of the speed schedule, which is the pose a rider *transitioning*
 *     between two banks holds. It is a lerp between the first two and is
 *     therefore already bracketed; it is swept anyway because the settle made
 *     the interior of that segment a pose the game now draws for a third of a
 *     second at a time, and a bracketed axis nothing samples is the shape
 *     invariant 15 keeps finding. It costs about two seconds.
 *
 * The rest of the band is not sampled because every measure in this file is a
 * continuous function of one hinge angle and the endpoints bracket its whole
 * range; a stance that clears both ends clears what lies between.
 *
 * **Anything technical keeps the low band only, and that is a statement about
 * the machine rather than a saving.** `EUC.technicalTurnFadeSpeed` is 6.0 and
 * `EUC.carveLeanSpeed` is 6.0, and the tuning table says the equality is *by
 * design*: the lean schedule starts exactly where M16's hard low-speed
 * technique has finished fading, so the two never overlap. The controller
 * multiplies its technical target by `1 - |speed| / technicalTurnFadeSpeed`,
 * which is flatly zero at and above 6 m/s — so a stance with any technique
 * blend at all is, by construction, a stance in the schedule's low band.
 *
 * **"By construction" is true of the target; the state lags it.**
 * `technicalTurn` (and `reverseBlend`) are `approach`ed over
 * `turnTechniqueResponseSeconds` 0.12 s, so both are still non-zero for a
 * few hundred milliseconds after the lean blend has started. Measured by the
 * Phase 3 QA over 252 ride shapes: `|technicalTurn|` up to 0.042 at 6.007 m/s
 * (blend 4 × 10⁻⁴), 0.010 at blend 0.05, 0.0026 at blend 0.10, 1.4 × 10⁻⁶ at
 * blend 0.40. The largest composed pose the gate below excludes is within
 * 2.7 × 10⁻³ rad (0.15°) of the `technicalTurn = 0` row this file already
 * sweeps, which the sweep's own continuity covers — but the wedge is real,
 * and it widens if `turnTechniqueResponseSeconds` grows or
 * `technicalTurnFadeSpeed` ever parts from `carveLeanSpeed`. Re-measure it
 * then rather than trusting this paragraph.
 *
 * Two consequences, and both were found by measurement rather than reasoned:
 *
 *   - `TECHNICAL_ROLL` (0.80 rad at 9 km/h, past the grip limit) keeps the low
 *     band, as its own note already argued for the fore-aft lean;
 *   - **so does every `technicalTurn` ≠ 0**, at any roll. Without this the
 *     sweep asserts a grip-limit carve composed with a *full* technical turn
 *     at 22 m/s — the hip-dome contract fails there by 2.2 mm, on a pose the
 *     controller cannot produce and the game has never drawn.
 */
function riderRollsFor(
  rollAngle: number,
  technicalTurn = 0,
  reverse = 0,
): ReadonlyArray<{ riderRoll: number; tag: string }> {
  const cases = [{ riderRoll: lowSpeedRiderRoll(rollAngle, technicalTurn), tag: 'slow' }];
  // Past the grip limit is the technical corner, which is a low-speed pose —
  // and so is any stance the technique is still blended into at all.
  if (Math.abs(rollAngle) > GRIP_ROLL + 1e-9) return cases;
  if (Math.abs(technicalTurn) > 1e-9) return cases;
  // And so is every reverse stance: `leanBlend` reads a *signed* speed, so a
  // rider backing up is below the first anchor by construction
  // (`simulation/riderLean.ts`' header).
  if (reverse > 0) return cases;
  // **The hang** (M30 Phase 2): the force lean this bank can be under, which
  // past the ordinary ceiling is `HANG_RATIO` times it. Below the ceiling the
  // wheel is not saturated and the two are equal — but a sweep is not a ride,
  // and the widest lean a *swept* bank may be paired with is the ratio, for
  // the reason `HANG_RATIO` gives: the two angles chase targets in that ratio
  // through one response, so the transient holds it too.
  const hungLean = rollAngle * HANG_RATIO;
  const swept: Array<{ riderRoll: number; tag: string }> = [];
  // The shipped share and the slider's ceiling, deduplicated: M30 Phase 2's QA
  // lowered that ceiling onto the shipped value (§30.3d, the third time), and a
  // sweep that posed the same rider roll twice would double this file's stance
  // count for nothing. It becomes two entries again on its own if the slider
  // ever offers more.
  for (const share of LEAN_SHARE_TOP_MAX > 1 ? [1, LEAN_SHARE_TOP_MAX] : [LEAN_SHARE_TOP_MAX]) {
    swept.push({ riderRoll: hungLean * share, tag: `share ${share.toFixed(2)}` });
  }
  // The transition itself, through the production expression rather than an
  // arithmetic of this file's own: half a settle at the top of the speed
  // schedule (M30 Phase 3b), over the hung lean.
  swept.push({
    riderRoll: riderRollFor(rollAngle, hungLean, 0, EUC.carveLeanFullSpeed, EUC, 0.5),
    tag: 'settle 0.50',
  });
  for (const { riderRoll, tag } of swept) {
    assert.ok(
      Math.abs(riderRoll) <= RIDER_ROLL_CEILING + 1e-9,
      `a swept rider roll of ${riderRoll.toFixed(4)} is past the measured ceiling `
        + `${RIDER_ROLL_CEILING.toFixed(4)}`,
    );
    // Straight ahead they collapse onto zero; asserting one stance four times
    // is not more coverage.
    if (cases.some((seen) => Math.abs(seen.riderRoll - riderRoll) < 1e-12)) continue;
    cases.push({ riderRoll, tag });
  }
  return cases;
}
/**
 * **A hard brake saturates `EUC.maxRiderPitch` backwards and stays there.**
 *
 * Measured in the running game, throttle held to −1 from cruise: the rendered
 * lean crosses zero eleven ticks in, reaches −0.69 by tick sixty, and is still
 * −0.70 a hundred and thirty ticks later at walking pace. It is not a
 * transient. `riderAccelerationPitchGain` reads *actual* acceleration, and a
 * decelerating rider keeps decelerating until they stop — which is the half of
 * that constant's note (`tuning.ts`) that only applies going forwards, where
 * acceleration falls away as speed tops out.
 *
 * Swept as a held stance from §23.9m, where the owner's ride found the loose
 * hair sliding out from under the helmet during exactly this. Every hem and
 * garment contract in this file clears it.
 */
const BRAKING_LEAN = -0.70;
/**
 * The leans a rider can *hold*. `EUC.maxRiderPitch` is a launch reaction that
 * settles to cruise within a second (see `PRESENTATION_LEANS` below), so it
 * belongs with the transients rather than with the held stances — and it is
 * the one lean at which no hem can clear a thigh the IK has folded toward
 * horizontal, which this file has said since M14.5. **Backwards it is a held
 * stance and it is in this list**; see `BRAKING_LEAN` above.
 */
const LEANS = [BRAKING_LEAN, -0.35, 0, 0.35];
/**
 * The three fore-aft folds a rider can be in, and their pairwise sums — the
 * envelope every hair contract in this file sweeps, and (from q121) both
 * jacket-hem contracts.
 *
 * **The last two are M23's own**: the owner asked for the reference stances and
 * then asked for this exact check — *"obviously this adds another layer for the
 * hair verification (ensure it doesn't clip through body)"*. They fold further
 * than the tuck they join, so a hair build that cleared the old envelope proves
 * nothing about the new one.
 */
const FOLDS = [
  { tuck: 0, attack: 0, carveStance: 0 },
  { tuck: 1, attack: 0, carveStance: 0 },
  { tuck: 0, attack: 1, carveStance: 0 },
  { tuck: 0, attack: 0, carveStance: 1 },
  { tuck: 1, attack: 1, carveStance: 0 },
  { tuck: 0, attack: 1, carveStance: 1 },
  { tuck: 1, attack: 1, carveStance: 1 },
] as const;
// Both M23 channels require sustained speed. By the time either can reach 1,
// the 0.70 rad launch reaction has settled to cruise; 0.15 deliberately leaves
// more than the browser capture uses without inventing a full launch at the
// end of a multi-second charge.
const PRESENTATION_LEANS = [0, 0.15] as const;
const PRESENTATION_FOLDS = [
  { attack: 1, carveStance: 0 },
  { attack: 0, carveStance: 1 },
  { attack: 1, carveStance: 1 },
] as const;

test('the skirt clears the legs through every held riding stance', () => {
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  let asserted = 0;
  const held: LabelledStance[] = [];
  // **The reverse stance is a composite, not a held stance, and it moved.**
  // Riding backwards is itself a blend — the rider squats and looks over the
  // shoulder — and composing a *second* blend on top of it (a full carve, with
  // the pelvis counter-roll now modelled) folds the outside thigh out through
  // the flare by 25 mm. That is the same family this file has always sent to
  // the structural tier: a fold no hem clears, crossing at the hem edge where
  // tights meet tights. It is asserted below, by where it crosses rather than
  // by whether it crosses.
  const composed: LabelledStance[] = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of LEANS) {
      for (const technicalTurn of TECHNICAL_TURNS) {
        for (const { riderRoll, tag } of riderRollsFor(rollAngle, technicalTurn)) {
          held.push({
            label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
              + `technical ${technicalTurn.toFixed(2)}, ${tag}`,
            rollAngle,
            riderPitch,
            torsoPitch: torsoPitchFor(riderPitch),
            technicalTurn,
            riderRoll,
          });
        }
      }
    }
  }
  // **The over-grip corner, at the lean it actually arrives with.** Nothing
  // else in this list reaches 0.80 rad, and nothing that reaches 0.80 rad has
  // a fore-aft lean to compose with it: `technicalTurnBonusG` fades out by
  // `technicalTurnFadeSpeed`, and a rider going slowly enough to spend it is
  // not also accelerating hard enough to fold forward. Sweeping the two as a
  // cross product would assert a pose the controller cannot produce.
  //
  // **And it keeps the low band of the M30 lean schedule**, for the same
  // reason and stated by `riderRollsFor`: 0.80 rad arrives at 9 km/h, which is
  // a quarter of `carveLeanSpeed`, so the share the rider takes there is the
  // pre-M30 one. The high shares are swept everywhere the machine can hold the
  // roll at speed, which is `GRIP_ROLL` and below.
  for (const sign of [-1, 1]) {
    for (const technicalTurn of [0.44, 0.81, 1]) {
      for (const { riderRoll, tag } of riderRollsFor(sign * TECHNICAL_ROLL, sign * technicalTurn)) {
        held.push({
          label: `technical corner ${(sign * TECHNICAL_ROLL).toFixed(2)}, `
            + `technical ${(sign * technicalTurn).toFixed(2)}, ${tag}`,
          rollAngle: sign * TECHNICAL_ROLL,
          riderPitch: 0,
          torsoPitch: torsoPitchFor(0),
          technicalTurn: sign * technicalTurn,
          riderRoll,
        });
      }
    }
  }
  // **Backwards riding used to have a smaller envelope, and M16 took that away.**
  // At the old 2.2 m/s cap the roll a reverse corner could demand was a fraction
  // of the forward limit, so this loop asserted a fraction of the forward
  // angles. `EUC.maxReverseSpeed` is now 6.7 m/s, which is fast enough for a
  // reverse corner to reach the full lateral limit — so the reverse stance now
  // has to compose with a real carve, and it is asserted against the same
  // `CARVES` the forward stances use. The lean list stays shorter because a
  // full-lean sprint still cannot be *held* while reversing; the blend frames
  // belong to the structural tier, like every blend.
  //
  // **Reverse takes the low band only, and `riderRollsFor`'s own gate says so
  // rather than this loop** — a rider backing up is below the schedule's first
  // anchor by construction, so the high shares here would be a pose the
  // controller cannot reach backwards.
  for (const rollAngle of CARVES) {
    for (const riderPitch of [-0.35, 0, 0.35]) {
      for (const technicalTurn of [-1, 0, 1]) {
        for (const { riderRoll, tag } of riderRollsFor(rollAngle, technicalTurn, 1)) {
          composed.push({
            label: `reverse, carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
              + `technical ${technicalTurn.toFixed(2)}, ${tag}`,
            rollAngle,
            riderPitch,
            torsoPitch: torsoPitchFor(riderPitch),
            technicalTurn,
            riderRoll,
            reverse: 1,
          });
        }
      }
    }
  }
  // The stopped stance and the settled crash. Both are *static* — rest only
  // ramps once the wheel has stopped and a settled crash has shed its motion —
  // so composing them with a live carve or lean is not a reachable held pose;
  // the blend frames where they overlap belong to the transient tier below.
  held.push({ label: 'rest', restFactor: 1, torsoPitch: torsoPitchFor(0) });
  held.push({ label: 'crash, settled', crash: 1, torsoPitch: torsoPitchFor(0) });

  try {
    for (const stance of held) {
      const fit = measure(rider, stance, 0.10);
      if (fit.points === 0) continue;
      asserted += 1;
      // **3 mm, where this said 5** — and the two numbers are not comparable,
      // because the pose is not the same pose. With the pelvis counter-roll
      // restored the same envelope is measured against a garment that is now
      // rotated up to 0.66 rad away from the limbs inside it; the margin that
      // survives that is 5 mm at the grip limit and 3 mm once the technical
      // corner's extra roll is included. Lowering a bar to fit a build would
      // be worthless, but this bar was never measuring the build.
      assert.ok(
        fit.radial >= 0.003,
        `${stance.label}: a leg comes within ${(fit.radial * 1000).toFixed(1)} mm `
          + `of the skirt surface (3 mm required); the highest escape is `
          + `${(fit.highestOutside * 1000).toFixed(1)} mm in the pelvis frame`,
      );
    }
    // The zone must actually contain leg samples, or the loop proved nothing.
    assert.ok(asserted > 90, `only ${asserted} stances had leg points in the skirt zone`);

    // The composites: where they cross, not whether. The hem is the profile's
    // own lowest ring, so this is "how far up the flare did a leg get out".
    const hem = TROLLINA_LOOK.profiles.torso[0]!.y;
    let worst = -Infinity;
    let worstLabel = '';
    for (const stance of composed) {
      const fit = measure(rider, stance, 0.10);
      if (fit.points === 0 || fit.highestOutside === -Infinity) continue;
      const above = fit.highestOutside - hem;
      if (above > worst) { worst = above; worstLabel = stance.label; }
    }
    assert.ok(
      worst <= 0.115,
      `${worstLabel}: a leg escapes ${(worst * 1000).toFixed(1)} mm above the hem `
        + '(115 mm allowed on a 274 mm flare)',
    );
  } finally {
    rider.dispose();
  }
});

test('the common transient — a preload, into a moderate carve — stays clear too', () => {
  // The deepest stance family this file asserts geometrically. Past it — a
  // full-depth crouch inside a full carve, a held tuck, a wobble fight — the
  // IK folds the thighs toward horizontal, and *no* hem the character could
  // wear clears a horizontal thigh: real cloth drapes over the leg at that
  // point, and rigid lofts can only cross. Those compounds are not asserted
  // here because they are not assertable; what makes them shippable is
  // structural, and the test below pins it: every crossing happens at the hem
  // edge against tights that match the seat exactly, which is how a short
  // skirt sits on folded legs — fabric on limbs, not a leg through a wall.
  // The capture set (`tools/rider-views.mjs --pose carve`) is the eye's check
  // on that claim.
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  try {
    // **Two metrics, because the counter-roll made one of them the wrong
    // question.** An uncrouched preload still has to clear outright. A full
    // preload composed with a carve is a second blend on a first, and with the
    // pelvis rotated up to 0.26 rad away from the legs at these angles the
    // outside thigh grazes the flare: 1.1 mm outside, at the hem edge. What
    // must hold there is not "no contact" but *where* — the same structural
    // claim the note above makes, and the same one the test below it pins.
    const hem = TROLLINA_LOOK.profiles.torso[0]!.y;
    for (const rollAngle of [-0.32, 0, 0.32]) {
      for (const riderPitch of [-0.35, 0, 0.35]) {
        for (const crouch of [0, 1]) {
          // A preload is a held crouch with nothing but the ground gating it,
          // so it composes with the whole M30 lean schedule — this is the
          // transient at a *fast* carve as well as at a slow one.
          for (const { riderRoll, tag } of riderRollsFor(rollAngle)) {
            const fit = measure(rider, {
              rollAngle,
              riderPitch,
              torsoPitch: torsoPitchFor(riderPitch),
              crouch,
              riderRoll,
            }, 0.10);
            if (fit.points === 0) continue;
            if (crouch === 0) {
              assert.ok(
                fit.radial >= 0.003,
                `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, ${tag}: `
                  + `a leg comes within ${(fit.radial * 1000).toFixed(1)} mm `
                  + 'of the skirt surface (3 mm required)',
              );
              continue;
            }
            const above = fit.highestOutside === -Infinity ? 0 : fit.highestOutside - hem;
            assert.ok(
              above <= 0.030,
              `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, crouch 1, ${tag}: `
                + `a leg escapes ${(above * 1000).toFixed(1)} mm above the hem `
                + '(30 mm allowed — a graze at the hem edge, where the tights '
                + 'match the seat exactly)',
            );
          }
        }
      }
    }
  } finally {
    rider.dispose();
  }
});

test("the new presentation folds keep Trollina's legs below the bodice", () => {
  // Attack and hard-carve fold more deeply than the old held envelope. A
  // rigid skirt cannot drape over a near-horizontal thigh, so demanding full
  // radial containment here would contradict the structural tier documented
  // above (and the fixed-angle captures, where the opaque skirt covers the
  // crossing). What must never happen is the folded leg escaping through the
  // fitted bodice above the flare. Walk both new channels, alone and together,
  // and pin that boundary instead.
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  let asserted = 0;
  try {
    for (const rollAngle of CARVES) {
      for (const riderPitch of PRESENTATION_LEANS) {
        for (const fold of PRESENTATION_FOLDS) {
          if (fold.attack > 0 && riderPitch < 0) continue;
          // Both presentation channels require sustained speed to reach 1
          // (their own note, above), which is the top of the M30 lean schedule
          // by definition — so these folds are swept at every share.
          for (const { riderRoll, tag } of riderRollsFor(rollAngle)) {
            const fit = measure(rider, {
              rollAngle,
              riderPitch,
              torsoPitch: torsoPitchFor(riderPitch),
              riderRoll,
              ...fold,
            }, 0.10);
            if (fit.points === 0 || fit.highestOutside === -Infinity) continue;
            asserted += 1;
            // **0.100, where this said 0.065** — and, as everywhere else in
            // this file, the number moved because the pose did. These folds are
            // now measured against a skirt rotated up to 0.53 rad away from the
            // legs inside it, which is what the game has always drawn and what
            // this file has never modelled. The bound is still the same claim:
            // the crossing stays inside the *flare*, below the fitted bodice at
            // 0.166, so what shows is a leg against a skirt and never a leg
            // through a waist.
            assert.ok(
              fit.highestOutside <= 0.100,
              `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                + `attack ${fold.attack}, carveStance ${fold.carveStance}, ${tag}: a leg `
                + `escapes to ${(fit.highestOutside * 1000).toFixed(1)} mm in the pelvis `
                + `frame, above the skirt flare's structural cover`,
            );
          }
        }
      }
    }
    assert.ok(asserted > 10, `only ${asserted} presentation stances crossed the rigid skirt`);
  } finally {
    rider.dispose();
  }
});

/**
 * **The jacket-hem contract, re-derived on the radial model** — q121, the
 * metric redesign M30 Phase 3 found and left standing (`docs/PLANS.md` §30.12).
 *
 * Adonisb2's guard green and Wheel in Motion's guard white are the same
 * contract on two looks: the coloured lower leg must never reach the black
 * jacket's hem, where what the eye expects is trouser-on-seat in one value.
 *
 * ## What was wrong, and it was the metric rather than the build
 *
 * Both contracts measured a leg — which hangs off the rig **root** — as a bare
 * *height* in the **pelvis** frame, and never wrote `pelvis.rotation.z`, the
 * counter-roll that stands between those two frames (invariant 15's own
 * finding, and the term Trollina's `measure` has carried since M23). Written,
 * at today's pose, both failed outright: −7 mm on the 20 mm hem buffer and
 * −53 / −57 mm on the 75 mm bodice ceiling.
 *
 * The failure was real and the metric was the reason. Measured, the vertex
 * that failed the hem buffer is **a knee 293 mm in front of the pelvis and
 * 192 mm outside the hem ring** (the ceiling's is 359 mm out front and 240 mm
 * outside), lifted there by a crouch: nowhere near the jacket, and green on a
 * raised knee is what a knee guard is *for*. A height in a rolled frame
 * conflates the hem's rotation with the leg's rise, so a leg that is merely
 * beside the hem reads as one above it — and the old bound only passed at all
 * because the hinge was missing.
 *
 * ## The metric now, and it is Trollina's
 *
 * Every stance is posed with the hinge written first, exactly as `measure`
 * writes it, and every coloured vertex is taken into the pelvis frame and
 * measured against the jacket loft's **own section** rather than against a
 * height:
 *
 *   - `hemRingClearance` — how near the colour comes to the hem ring, the
 *     loft's lowest section, in the (radial, vertical) half-plane. This is the
 *     contract's sentence stated geometrically: *the guard colour never
 *     reaches the hem*.
 *   - `depthInside`, for colour standing at or above the hem — how far
 *     **outside** the jacket's shell it stays. The old ceiling said a crossing
 *     must stay below the fitted bodice; measured, there is no crossing at
 *     all, and this asserts the stronger thing.
 *
 * ## The sweep, widened to what the machine reaches
 *
 * The old list swept carves and leans only. `technicalTurn` — a field of
 * `StanceInput` — went untouched, which is the second half of invariant 15's
 * warning, so it is swept now, with the over-grip technical corner, the
 * reverse stance, the held tuck (`FOLDS`, the file's whole fold envelope
 * rather than three of it), the crouch at full carve rather than at 0.8 of
 * one, and the M30 rider-roll axis through `riderRollsFor`. **905 stances**
 * since Phase 3b added the settle's interior sample (761 before that, 262
 * before the axis existed), and the metric clears every one of them.
 */
function hemStances(): LabelledStance[] {
  const stances: LabelledStance[] = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of LEANS) {
      for (const technicalTurn of TECHNICAL_TURNS) {
        for (const crouch of [0, 1]) {
          for (const { riderRoll, tag } of riderRollsFor(rollAngle, technicalTurn)) {
            stances.push({
              label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                + `technical ${technicalTurn.toFixed(2)}, crouch ${crouch}, ${tag}`,
              rollAngle,
              riderPitch,
              torsoPitch: torsoPitchFor(riderPitch),
              technicalTurn,
              crouch,
              riderRoll,
            });
          }
        }
      }
    }
    // The presentation folds, at the leans they can be reached with, and each
    // of them again inside a preload — the deepest thing the rig folds to.
    for (const riderPitch of PRESENTATION_LEANS) {
      for (const fold of FOLDS) {
        for (const crouch of [0, 1]) {
          for (const { riderRoll, tag } of riderRollsFor(rollAngle)) {
            stances.push({
              label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                + `tuck ${fold.tuck}, attack ${fold.attack}, `
                + `carveStance ${fold.carveStance}, crouch ${crouch}, ${tag}`,
              rollAngle,
              riderPitch,
              torsoPitch: torsoPitchFor(riderPitch),
              crouch,
              riderRoll,
              ...fold,
            });
          }
        }
      }
    }
  }
  // The over-grip corner, at the lean and the band it arrives with — the
  // skirt contract's own reasoning, which `riderRollsFor` states.
  for (const sign of [-1, 1]) {
    for (const technicalTurn of [0.44, 0.81, 1]) {
      for (const { riderRoll, tag } of riderRollsFor(sign * TECHNICAL_ROLL, sign * technicalTurn)) {
        stances.push({
          label: `technical corner ${(sign * TECHNICAL_ROLL).toFixed(2)}, `
            + `technical ${(sign * technicalTurn).toFixed(2)}, ${tag}`,
          rollAngle: sign * TECHNICAL_ROLL,
          riderPitch: 0,
          torsoPitch: torsoPitchFor(0),
          technicalTurn: sign * technicalTurn,
          riderRoll,
        });
      }
    }
  }
  // Backwards, where the rider squats and the legs splay: the stance that
  // brings the guard colour nearest the hem on both looks, and the one the
  // old list never asserted at all.
  for (const rollAngle of CARVES) {
    for (const riderPitch of [-0.35, 0, 0.35]) {
      for (const technicalTurn of [-1, 0, 1]) {
        for (const { riderRoll, tag } of riderRollsFor(rollAngle, technicalTurn, 1)) {
          stances.push({
            label: `reverse, carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
              + `technical ${technicalTurn.toFixed(2)}, ${tag}`,
            rollAngle,
            riderPitch,
            torsoPitch: torsoPitchFor(riderPitch),
            technicalTurn,
            riderRoll,
            reverse: 1,
          });
        }
      }
    }
  }
  stances.push({ label: 'rest', restFactor: 1, torsoPitch: torsoPitchFor(0) });
  stances.push({ label: 'crash, settled', crash: 1, torsoPitch: torsoPitchFor(0) });
  return stances;
}

/**
 * **The two floors, re-authored from measurement** (q121), and they are the
 * same number by measurement rather than by copying.
 *
 * Worst over the stances, per band of the M30 lean schedule, in mm
 * (re-measured 2026-09-03 with M30 Phase 2's hang, which widened the axis and
 * lowered the slider's maximum from 1.20 to 1.04, and again after that phase's
 * QA lowered it to 1.00 — which folds the last row into the one above it, the
 * slider's ceiling now *being* the shipped share):
 *
 * ```
 *                        Adonisb2              Wheel in Motion
 *                     ring     outside       ring     outside
 *   low band         137.9     138.4        137.6     136.4
 *   settle 0.50      173.0     152.9        173.4     155.7
 *   share 1.00       174.0     173.3        175.0     177.5
 * ```
 *
 * (The 1.04 row this replaces read 173.9 / 174.7 and 174.9 / 177.9 — above the
 * low band either way, so nothing about the floors moved with it.)
 *
 * (Before the hang, at the 1.20 slider: 172.3 / 148.5 and 173.0 / 150.0 for
 * the settle row, 174.4 / 164.6 and 174.5 / 168.4 at share 1.00, and
 * 174.1 / 171.1 and 175.2 / 175.6 at 1.20. The hang **improves** every one of
 * these, for the reason the low band is the worst.)
 *
 * The low band is the worst everywhere, which is what the hinge predicts: it
 * is `rollAngle − riderRoll`, so it is largest where the upper body keeps
 * least of the wheel's roll — it passes through zero at share 1.00 on an
 * unsaturated bank and goes the other way past it. Both low-band worsts are a
 * reverse corner (the splayed squat); the shares' are a hard carve inside a
 * fold, which the reverse stance does not compose with. **The settle's own row
 * sits between the two**, as its arithmetic says it must — which is the whole
 * reason the interior sample is cheap insurance rather than a new risk.
 *
 * **120 mm, and what the reserve buys.** Roughly 17 mm under the worst
 * measurement, which is the room a pose change may take; and, measured by
 * walking the paint boundary up the thigh, the guard colour would have to
 * climb **30 mm** on Wheel in Motion (the ring it reaches there reads 108 mm)
 * or **90 mm** on Adonisb2 before either floor trips. That is a contract with
 * a grip on the thing it is about — the boundary between trouser and guard —
 * rather than on an incidental knee.
 *
 * Nothing here softened: the buffers are not the old numbers loosened, they
 * are different quantities, and the old ones measured a stance the game draws
 * on purpose.
 */
const HEM_RING_CLEARANCE = 0.120;
/** The same, for guard colour standing at or above the hem: it stays outside. */
const HEM_SHELL_CLEARANCE = 0.120;

/** What one stance says about one look's guard colour against its jacket. */
interface HemFit {
  /** Closest approach of the guard colour to the hem ring, metres. */
  ring: number;
  /** Where that happened, in the pelvis frame. */
  ringAt: THREE.Vector3;
  /** Least distance *outside* the shell, for colour at or above the hem. */
  shell: number;
  /** Where that happened; null when no colour stands that high. */
  shellAt: THREE.Vector3 | null;
  /** Coloured vertices seen. */
  sampled: number;
}

/**
 * Pose one look, and measure its guard colour against its own jacket loft.
 *
 * Shared by the two hem contracts because they *are* one contract: a look that
 * paints its legs against a black jacket joins this list, and a second copy of
 * the measurement is how the two drift apart.
 */
function hemFit(
  rider: ReturnType<typeof createPlaceholderRider>,
  profile: LoftProfile,
  overrides: StanceCase,
  isGuard: (colours: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => boolean,
): HemFit {
  const stance = Object.assign(createStanceInput(), overrides);
  // The hinge, written first and exactly as `measure` writes it. This is the
  // line whose absence made the old metric measure a different rider.
  rider.pelvis.rotation.z = pelvisCounterRoll(stance);
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);

  const pelvis = rider.pelvis;
  const hem = profile[0]!.y;
  // Above the loft's last ring there is no garment to be inside of, and
  // `ringAtHeight` clamps rather than saying so; the shell measure stops
  // there. Nothing reaches it — the highest guard colour any stance produces
  // is 313 mm, against a collar at 548 — but a clamp that silently reports
  // "inside" is exactly the kind of quiet lie this file exists to refuse.
  const collar = profile[profile.length - 1]!.y;

  const point = new THREE.Vector3();
  const fit: HemFit = {
    ring: Infinity,
    ringAt: new THREE.Vector3(),
    shell: Infinity,
    shellAt: null,
    sampled: 0,
  };
  for (const side of ['left', 'right']) {
    for (const jointName of [`rider-hip-${side}`, `rider-knee-${side}`]) {
      const joint = rider.root.getObjectByName(jointName)!;
      for (const child of joint.children) {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh !== true) continue;
        const positions = mesh.geometry.getAttribute('position');
        const colours = mesh.geometry.getAttribute('color');
        for (let i = 0; i < positions.count; i += 1) {
          if (!isGuard(colours, i)) continue;
          point.fromBufferAttribute(positions, i);
          mesh.localToWorld(point);
          pelvis.worldToLocal(point);
          fit.sampled += 1;
          const ring = hemRingClearance(profile, point);
          if (ring < fit.ring) { fit.ring = ring; fit.ringAt.copy(point); }
          if (point.y < hem || point.y > collar) continue;
          const outside = -depthInside(profile, point);
          if (outside < fit.shell) {
            fit.shell = outside;
            fit.shellAt = (fit.shellAt ?? new THREE.Vector3()).copy(point);
          }
        }
      }
    }
  }
  return fit;
}

/** The failure message both contracts print, so the two read alike. */
function hemReport(label: string, fit: HemFit): string {
  const at = (v: THREE.Vector3): string => `(${(v.x * 1000).toFixed(0)}, `
    + `${(v.y * 1000).toFixed(0)}, ${(v.z * 1000).toFixed(0)}) mm in the pelvis frame`;
  return `${label}: nearest the hem ring at ${(fit.ring * 1000).toFixed(1)} mm, `
    + `${at(fit.ringAt)}`
    + (fit.shellAt === null
      ? '; no guard colour stands at hem height'
      : `; nearest the shell at ${(fit.shell * 1000).toFixed(1)} mm outside, ${at(fit.shellAt)}`);
}

/**
 * Adonisb2 — M22, the third look with a garment-versus-leg contrast problem,
 * and the reason this file's header says a look like his "must join" it.
 *
 * Cool Rider's exemption was that his jacket, trousers and legs are one black
 * suit: a hem graze has nothing to show. Adonisb2's legs are the *green* base
 * material painted down to trousers (§22.3 fact 4), which hands the legs
 * contrast again — a fold that swung guard-green up through the black jacket
 * hem would be Trollina's skirt defect in a new colour. The clearance is
 * therefore asserted the way hers is, but for the coloured region rather than
 * the whole limb: no green-based vertex may come near the jacket's hem ring in
 * any stance of the swept envelope. Green vertices are found by their painted
 * colour, not by height arithmetic, so the assertion survives the paint
 * boundary moving — which, since q121, is the thing it is measured against.
 */
test("Adonisb2's guard green never reaches the jacket hem", () => {
  const rider = createPlaceholderRider(ADONISB2_LOOK);
  const profile = ADONISB2_LOOK.profiles.torso;

  try {
    let sampled = 0;
    let stood = 0;
    for (const { label, ...overrides } of hemStances()) {
      // Green base or the bright guard plate: the multiplier's green channel
      // sits near 1; the trouser and cuff tints paint it far below. 0.5 splits
      // the two populations with margin either way.
      const fit = hemFit(rider, profile, overrides, (colours, i) => colours.getY(i) >= 0.5);
      sampled += fit.sampled;
      assert.ok(
        fit.ring >= HEM_RING_CLEARANCE,
        `${hemReport(label, fit)} — ${(HEM_RING_CLEARANCE * 1000).toFixed(0)} mm required `
          + 'of the hem ring',
      );
      if (fit.shellAt === null) continue;
      stood += 1;
      assert.ok(
        fit.shell >= HEM_SHELL_CLEARANCE,
        `${hemReport(label, fit)} — ${(HEM_SHELL_CLEARANCE * 1000).toFixed(0)} mm required `
          + 'outside the jacket shell',
      );
    }
    assert.ok(sampled > 1000, `only ${sampled} green vertices sampled — the guards are missing`);
    // The shell half is only asserted where guard colour actually stands at or
    // above the hem, so it has to be shown that the stances put it there —
    // 353 of the 905 do, and an assertion that skipped itself would otherwise
    // pass in silence.
    assert.ok(stood > 200, `only ${stood} stances raised guard green to hem height`);
  } finally {
    rider.dispose();
  }
});

test("Adonisb2's trousers agree with his seat across the hip join", () => {
  // The other half of his exemption from the radial assertion Trollina needs:
  // where his leg CAN graze the hem, it must be painted to exactly the black
  // the seat wears, so a graze has nothing to show — Cool Rider's property,
  // recovered by arithmetic on a green-based leg. The painted trouser colour
  // is base × tint; the seat is suit × shades.seat; the two must be one value.
  const look = ADONISB2_LOOK;
  assert.equal(look.parts.legs, 'accent', 'his legs must be the green base material');
  assert.equal(look.parts.seat, 'body', 'his seat is the suit, inside the torso mesh');

  const rider = createPlaceholderRider(look);
  try {
    const thigh = rider.root.getObjectByName('rider-hip-left')!.children.find(
      (child) => (child as THREE.Mesh).isMesh === true,
    ) as THREE.Mesh;
    const positions = thigh.geometry.getAttribute('position');
    const colours = thigh.geometry.getAttribute('color');
    const base = new THREE.Color(BLOCKOUT_COLOURS.adonisb2Guard);
    const seat = new THREE.Color(BLOCKOUT_COLOURS.adonisb2Suit).multiplyScalar(look.shades.seat);
    let checked = 0;
    for (let i = 0; i < positions.count; i += 1) {
      // **The trouser band is the top half of the thigh**, which is the only
      // part of it that can reach the hem and therefore the only part this
      // contract is about.
      //
      // It used to be selected as "every vertex that is not green", on the
      // reasoning that a green-based leg has exactly two painted populations.
      // It has three since the knee cup's dark was painted onto the limb
      // beneath the cup patches (a hinge opens, and what shows through it has
      // to be the cup's own value) — near-black paint at the knee, correct,
      // deliberate, and nowhere near a jacket hem. Selecting by height keeps
      // the assertion aimed at what it was written to protect instead of
      // failing on a third colour it never anticipated.
      if (positions.getY(i) < -RIDER_BLOCKOUT.thighLength * 0.5) continue;
      if (colours.getY(i) >= 0.5) continue;
      checked += 1;
      const painted = new THREE.Color(
        base.r * colours.getX(i) * look.shades.legs,
        base.g * colours.getY(i) * look.shades.legs,
        base.b * colours.getZ(i) * look.shades.legs,
      );
      assert.ok(
        Math.abs(painted.r - seat.r) < 2e-3
          && Math.abs(painted.g - seat.g) < 2e-3
          && Math.abs(painted.b - seat.b) < 2e-3,
        `trouser vertex ${i} paints to (${painted.r.toFixed(4)}, ${painted.g.toFixed(4)}, `
          + `${painted.b.toFixed(4)}) against the seat's (${seat.r.toFixed(4)}, `
          + `${seat.g.toFixed(4)}, ${seat.b.toFixed(4)}) — the hip join would show a seam`,
      );
    }
    assert.ok(checked > 50, `only ${checked} trouser vertices found`);
  } finally {
    rider.dispose();
  }
});

test("Wheel in Motion's guard white never reaches the jacket hem", () => {
  // Adonisb2's contract, for the guard-over-trouser version of the garment
  // problem (`docs/PLANS.md` §28.8): his legs are the pale print ground
  // painted *down* to the jersey's blue above the guard, so the population
  // that must stay clear of the hem is the pale one — guard-white paint on the
  // limb, and the shell patches at 1 — against trouser blue and cup-dark,
  // which sit far below 0.5 in the red channel.
  const rider = createPlaceholderRider(WHEEL_IN_MOTION_LOOK);
  const profile = WHEEL_IN_MOTION_LOOK.profiles.torso;

  try {
    let sampled = 0;
    let stood = 0;
    for (const { label, ...overrides } of hemStances()) {
      const fit = hemFit(rider, profile, overrides, (colours, i) => colours.getX(i) >= 0.5);
      sampled += fit.sampled;
      assert.ok(
        fit.ring >= HEM_RING_CLEARANCE,
        `${hemReport(label, fit)} — ${(HEM_RING_CLEARANCE * 1000).toFixed(0)} mm required `
          + 'of the hem ring',
      );
      if (fit.shellAt === null) continue;
      stood += 1;
      assert.ok(
        fit.shell >= HEM_SHELL_CLEARANCE,
        `${hemReport(label, fit)} — ${(HEM_SHELL_CLEARANCE * 1000).toFixed(0)} mm required `
          + 'outside the jacket shell',
      );
    }
    assert.ok(sampled > 1000, `only ${sampled} pale vertices sampled — the guards are missing`);
    // 257 of the 761, and the same reason as his.
    assert.ok(stood > 200, `only ${stood} stances raised guard white to hem height`);
  } finally {
    rider.dispose();
  }
});

test("Wheel in Motion's trousers agree with his seat across the hip join", () => {
  // Cool Rider's property, recovered by arithmetic on a print-ground leg: the
  // thigh's blue is a vertex tint on the pale material, and the seat inside
  // the torso mesh is the *same* tint, written by the body painter over the
  // seat shade it uses as an address. Where the leg can graze the hem, both
  // sides of the join must be one value.
  const look = WHEEL_IN_MOTION_LOOK;
  assert.equal(look.materials[look.parts.legs], look.materials.body, 'his legs must be the print material');
  assert.equal(look.parts.seat, 'body', 'his seat is inside the torso mesh');

  const rider = createPlaceholderRider(look);
  try {
    const thigh = rider.root.getObjectByName('rider-hip-left')!.children.find(
      (child) => (child as THREE.Mesh).isMesh === true,
    ) as THREE.Mesh;
    const torso = rider.pelvis.children.find(
      (child) => (child as THREE.Mesh).isMesh === true && (child as THREE.Mesh).castShadow,
    ) as THREE.Mesh;
    const print = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionPrint);
    const trousers = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionBlue);
    const painted = (colours: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, shade: number): THREE.Color => (
      new THREE.Color(print.r * colours.getX(i) * shade, print.g * colours.getY(i) * shade, print.b * colours.getZ(i) * shade)
    );
    const close = (a: THREE.Color, b: THREE.Color): boolean => (
      Math.abs(a.r - b.r) < 2e-3 && Math.abs(a.g - b.g) < 2e-3 && Math.abs(a.b - b.b) < 2e-3
    );

    // The upper half of the thigh is the only part that can reach the hem.
    const positions = thigh.geometry.getAttribute('position');
    const colours = thigh.geometry.getAttribute('color');
    let checked = 0;
    for (let i = 0; i < positions.count; i += 1) {
      if (positions.getY(i) < -RIDER_BLOCKOUT.thighLength * 0.5) continue;
      checked += 1;
      const value = painted(colours, i, look.shades.legs);
      assert.ok(close(value, trousers), `trouser vertex ${i} paints to (${value.r.toFixed(4)}, ${value.g.toFixed(4)}, ${value.b.toFixed(4)}), not the trouser blue`);
    }
    assert.ok(checked > 50, `only ${checked} trouser vertices found`);

    // And the seat — the vertices of the torso mesh below the hem — is that
    // blue too, which is what the body painter exists to do.
    const seatPositions = torso.geometry.getAttribute('position');
    const seatColours = torso.geometry.getAttribute('color');
    let seat = 0;
    for (let i = 0; i < seatPositions.count; i += 1) {
      if (seatPositions.getY(i) > look.profiles.torso[0]!.y - 0.030) continue;
      seat += 1;
      const value = painted(seatColours, i, 1);
      assert.ok(close(value, trousers), `seat vertex ${i} paints to (${value.r.toFixed(4)}, ${value.g.toFixed(4)}, ${value.b.toFixed(4)}), not the trouser blue`);
    }
    assert.ok(seat > 20, `only ${seat} seat vertices found below the hem`);
  } finally {
    rider.dispose();
  }
});

test('below the hem there is nothing a crossing could show', () => {
  // The other half of the tier-B contract, asserted structurally: everything a
  // folded leg can pass through under the hem — the seat and both legs — is
  // one material spec at one vertex shade, so the geometry that does cross
  // (real cloth would drape; rigid lofts cannot) has no contrast to show.
  const look = TROLLINA_LOOK;
  assert.notEqual(look.parts.seat, 'body', 'the seat must not be part of the pink dress');
  assert.equal(
    look.materials[look.parts.seat],
    look.materials[look.parts.legs],
    'seat and legs must share one material spec',
  );
  assert.equal(
    look.shades.seat,
    look.shades.legs,
    'seat and legs must share one vertex shade',
  );
});

/**
 * Her hair stays on her back through every stance — M23, the owner's ride.
 *
 * **"When going all the way forward it sinks inside the body. Same when
 * turning."** The report is the skirt's report one character later, and it has
 * the same shape: a rigid mass, rigid in one joint's frame, driven through a
 * rig that moves that joint. What made it non-obvious is *which* joint. The
 * hair hangs off the neck, and the neck **stabilises** — it cranes the head up
 * out of a fold, backwards, by more than half a radian in a deep lean. Anything
 * hanging from it therefore swings the other way, forward, through her chest.
 * Measured before the fix: 133 mm inside her torso at a 0.70 lean.
 *
 * `RiderExtra.sways` is the fix and this is its contract. The threshold is not
 * "no contact": hair lies *on* a back, so its inner surface is inside the torso
 * loft at rest by design, and the number that matters is whether any reachable
 * stance is **worse than resting**. So the resting depth is measured first and
 * every other stance is held to it.
 *
 * The envelope is the same one the skirt is asserted through, plus the two axes
 * the owner named — the head's yaw, and the held tuck.
 */
function hairDepth(
  rider: ReturnType<typeof createPlaceholderRider>,
  overrides: StanceCase,
): { deepest: number; at: THREE.Vector3 | null; localAt: THREE.Vector3 | null; points: number } {
  const stance = Object.assign(createStanceInput(), overrides);
  // **Written even though it provably cannot move this measure**, because
  // "provably" is what invariant 15 exists to distrust: the hair hangs off the
  // neck, the neck is a child of the pelvis, and the depth is taken in the
  // pelvis frame, so the hinge rotates the mass and the ruler together. The
  // three Maribel contracts sweep the M30 rider-roll axis anyway and read the
  // same numbers at every share, which is the claim *measured* rather than
  // argued — and the day something moves between those two frames, they will
  // be the tests that say so.
  rider.pelvis.rotation.z = pelvisCounterRoll(stance);
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);
  const hair = rider.root.getObjectByName('rider-hair') as THREE.Mesh | undefined;
  assert.ok(hair, 'Maribel has no hair mesh');
  const profile = MARIBEL_LOOK.profiles.torso;
  const positions = hair.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let deepest = -Infinity;
  let at: THREE.Vector3 | null = null;
  let localAt: THREE.Vector3 | null = null;
  let points = 0;
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i);
    const local = point.clone();
    hair.localToWorld(point);
    rider.pelvis.worldToLocal(point);
    // **Everything below the helmet's rim** — where this said 0.30, which is
    // 240 mm below the neck joint and was written when the mass reached the
    // waist. It was already the reason nothing here could see hair coming out
    // through the *crown*; once the curtain was shortened to the shoulder
    // blades it excluded the entire mesh and this test measured nothing at
    // all, which it reports as a failure rather than as a pass. The liner and
    // the nape gather are their own mesh now (`rider-hair-cap`, asserted
    // below), so what is left here is the falls and only the falls; the one
    // thing still excluded is the root band tucked up inside the shell, above
    // the torso profile's own top ring.
    if (point.y > 0.52) continue;
    points += 1;
    const depth = depthInside(profile, point);
    if (depth > deepest) {
      deepest = depth;
      at = point.clone();
      localAt = local;
    }
  }
  return { deepest, at, localAt, points };
}

test('the hair never sinks deeper into her than it rests', () => {
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const resting = hairDepth(rider, { torsoPitch: torsoPitchFor(0) });
    assert.ok(resting.points > 100, `only ${resting.points} hair vertices below the collar`);
    // The drape itself. Stated as a number so that a future hair build which
    // buries the mass in the torso — the cheap way to make a clipping report
    // go away — fails here instead of shipping.
    assert.ok(
      resting.deepest < 0.030,
      `at rest the hair is already ${(resting.deepest * 1000).toFixed(1)} mm inside her torso`,
    );

    // Four millimetres of slack over the resting drape, **or twenty
    // millimetres, whichever is larger**.
    //
    // The slack is not zero, and the reason is anatomy rather than tolerance:
    // twisting the spine and folding it move the shoulder blades under a mass
    // that is rigid, so the upper falls press a few millimetres further into
    // the trapezius in the extreme stances than they do standing still. Real
    // hair compresses there. What the number forbids is the failure the owner
    // reported — a fall *disappearing* into her, which measured 133 mm before
    // `RiderExtra.sways` existed and 64 mm before the sway was solved as an
    // orientation instead of as three Euler angles.
    //
    // **The floor arrived because the relative rule ratchets** (M23, third
    // hair pass). Stated as `resting + 4 mm` alone, this contract tightens
    // every time the drape gets better: that pass took the resting depth from
    // 16.8 mm to 4.9 mm, and a stance nobody had touched then failed by six
    // tenths of a millimetre — not because anything had got worse, but because
    // the budget had shrunk under it. A rule that punishes a build for
    // improving is measuring the wrong thing. Twenty millimetres is four times
    // the drape this build actually rests at, twice its worst stance, and six
    // times under the defect being guarded; and unlike the delta it stops
    // moving when the geometry does.
    const allowed = Math.max(resting.deepest + 0.004, 0.020);
    let asserted = 0;
    for (const rollAngle of CARVES) {
      for (const riderPitch of LEANS) {
        for (const lookYaw of [-EUC.riderLookIntoTurn, 0, EUC.riderLookIntoTurn]) {
          for (const fold of FOLDS) {
            for (const reverse of [0, 1]) {
              for (const { riderRoll, tag } of riderRollsFor(rollAngle, 0, reverse)) {
                const label = `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                  + `look ${lookYaw.toFixed(2)}, tuck ${fold.tuck}, attack ${fold.attack}, `
                  + `carveStance ${fold.carveStance}, reverse ${reverse}, ${tag}`;
                const fit = hairDepth(rider, {
                  rollAngle,
                  riderPitch,
                  torsoPitch: torsoPitchFor(riderPitch),
                  lookYaw,
                  riderRoll,
                  ...fold,
                  reverse,
                });
                asserted += 1;
                assert.ok(
                  fit.deepest <= allowed,
                  `${label}: the hair reaches ${(fit.deepest * 1000).toFixed(1)} mm into her torso `
                    + `against ${(resting.deepest * 1000).toFixed(1)} mm at rest, at `
                    + `(${fit.at!.x.toFixed(3)}, ${fit.at!.y.toFixed(3)}, ${fit.at!.z.toFixed(3)})`
                    + ` from hair-local (${fit.localAt!.x.toFixed(3)}, ${fit.localAt!.y.toFixed(3)}, `
                    + `${fit.localAt!.z.toFixed(3)})`,
                );
              }
            }
          }
        }
      }
    }
    assert.ok(asserted >= 600, `only ${asserted} stances asserted`);
  } finally {
    rider.dispose();
  }
});

test('the helmet liner stays inside the crown while the loose hair sways', () => {
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const liner = rider.root.getObjectByName('rider-hair-cap') as THREE.Mesh | undefined;
    assert.ok(liner, 'Maribel has no fixed helmet liner');
    assert.equal(liner.parent, rider.neck, 'the helmet liner must be fixed to the neck, outside the sway pivot');

    const profile = MARIBEL_LOOK.profiles.head;
    // The first two rings are the opening and rear skirt: loose hair is meant
    // to emerge there. From the third ring to the last non-zero ring is the
    // closed crown, where any hair outside the shell is a visible bump.
    const crownBottom = profile[2]!.y;
    const crownTop = profile[profile.length - 2]!.y;
    const point = new THREE.Vector3();
    let asserted = 0;

    for (const rollAngle of CARVES) {
      for (const riderPitch of LEANS) {
        for (const lookYaw of [-EUC.riderLookIntoTurn, 0, EUC.riderLookIntoTurn]) {
          for (const fold of FOLDS) {
            for (const reverse of [0, 1]) {
              for (const { riderRoll, tag } of riderRollsFor(rollAngle, 0, reverse)) {
                const stance = Object.assign(createStanceInput(), {
                  rollAngle,
                  riderPitch,
                  torsoPitch: torsoPitchFor(riderPitch),
                  lookYaw,
                  riderRoll,
                  ...fold,
                  reverse,
                });
                // See `hairDepth`: the liner is a neck child measured in the
                // neck's own frame, so the hinge is outside this comparison —
                // written and swept so that stays a measurement.
                rider.pelvis.rotation.z = pelvisCounterRoll(stance);
                rider.applyStanceReaction(stance);
                rider.root.updateMatrixWorld(true);

                let worst = 0;
                let samples = 0;
                const mesh = rider.root.getObjectByName('rider-hair-cap') as THREE.Mesh | undefined;
                assert.ok(mesh, 'Maribel has no rider-hair-cap mesh');
                const positions = mesh.geometry.getAttribute('position');
                for (let i = 0; i < positions.count; i += 1) {
                  point.fromBufferAttribute(positions, i);
                  mesh.localToWorld(point);
                  rider.neck.worldToLocal(point);
                  if (point.y < crownBottom || point.y > crownTop) continue;
                  samples += 1;
                  worst = Math.max(worst, -depthInside(profile, point));
                }
                assert.ok(samples > 100, `only ${samples} hair vertices sampled inside the crown band`);
                assert.ok(
                  worst <= 0.001,
                  `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                    + `look ${lookYaw.toFixed(2)}, tuck ${fold.tuck}, attack ${fold.attack}, `
                    + `carveStance ${fold.carveStance}, reverse ${reverse}, ${tag}: hair stands `
                    + `${(worst * 1000).toFixed(1)} mm outside the closed helmet crown`,
                );
                asserted += 1;
              }
            }
          }
        }
      }
    }
    assert.ok(asserted >= 600, `only ${asserted} helmet stances asserted`);
  } finally {
    rider.dispose();
  }
});

/**
 * Her hair keeps its roots under the helmet — §23.9m, the owner's report
 * *"the hair detaches when hard breaking."*
 *
 * **The sway pivot's pitch term was reasoned entirely from a forward fold.**
 * Folding down over the wheel, the head *cranes up* — the stabiliser rotates
 * the neck backwards — and handing that rotation back to the mass is what
 * keeps it lying on a back instead of driving through it. A hard brake runs
 * the same stabiliser the other way: the lean settles at `BRAKING_LEAN` and
 * holds, which tips the head 0.39 rad forward, and a mass that insisted on the
 * torso's rest angle underneath it swung 0.46 rad *down and forward* about the
 * neck joint. Measured on that build, the root band fell **53 mm** below where
 * it sits at rest — straight out from under the helmet's rim, leaving the gap
 * the owner photographed at 8 km/h.
 *
 * Two reasons the existing sweeps could not see it. The depth test measures
 * penetration *into* her torso and this direction moves the mass away from it,
 * so it read as an improvement; and the crown test watches the fixed liner,
 * which is a neck child outside the pivot and never moves at all.
 *
 * **So the axis is stated directly.** Hair grows out of a scalp: it may lag a
 * head that turns and it may lift off a back that folds, but it cannot rotate
 * below where it is attached. Measured in the *head's* own frame, the roots
 * may rise — every forward stance lifts them, by up to 113 mm at a full tuck,
 * and that is the approved trail — and they may never drop. The floor is not
 * a tolerance: the fixed build measures zero at every stance in the envelope,
 * and 2 mm is there so a future drape can breathe without reviving a 53 mm
 * detachment.
 */
test('her hair keeps its roots under the helmet through every held stance', () => {
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const hair = rider.root.getObjectByName('rider-hair') as THREE.Mesh | undefined;
    assert.ok(hair, 'Maribel has no hair mesh');
    const positions = hair.geometry.getAttribute('position');
    // The root band: the curtain's highest row, the part tucked into the shell.
    let crown = -Infinity;
    for (let i = 0; i < positions.count; i += 1) crown = Math.max(crown, positions.getY(i));
    const band: number[] = [];
    for (let i = 0; i < positions.count; i += 1) {
      if (positions.getY(i) > crown - 1e-4) band.push(i);
    }
    assert.ok(band.length > 12, `only ${band.length} vertices in her hair's root band`);

    const point = new THREE.Vector3();
    const rootsFor = (overrides: StanceCase): number[] => {
      const stance = Object.assign(createStanceInput(), overrides);
      // See `hairDepth`: swept, and outside the hinge by construction.
      rider.pelvis.rotation.z = pelvisCounterRoll(stance);
      rider.applyStanceReaction(stance);
      rider.root.updateMatrixWorld(true);
      return band.map((i) => {
        point.fromBufferAttribute(positions, i);
        hair.localToWorld(point);
        // The **head's** frame, not the pelvis': the claim is about where the
        // roots sit relative to the skull they grow out of.
        rider.neck.worldToLocal(point);
        return point.y;
      });
    };

    const rest = rootsFor({ torsoPitch: torsoPitchFor(0) });
    let asserted = 0;
    for (const rollAngle of CARVES) {
      for (const riderPitch of LEANS) {
        for (const lookYaw of [-EUC.riderLookIntoTurn, 0, EUC.riderLookIntoTurn]) {
          for (const fold of FOLDS) {
            for (const reverse of [0, 1]) {
              for (const { riderRoll, tag } of riderRollsFor(rollAngle, 0, reverse)) {
                const now = rootsFor({
                  rollAngle,
                  riderPitch,
                  torsoPitch: torsoPitchFor(riderPitch),
                  lookYaw,
                  riderRoll,
                  ...fold,
                  reverse,
                });
                let drop = 0;
                for (let i = 0; i < now.length; i += 1) drop = Math.max(drop, rest[i]! - now[i]!);
                asserted += 1;
                assert.ok(
                  drop <= 0.002,
                  `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
                    + `look ${lookYaw.toFixed(2)}, tuck ${fold.tuck}, attack ${fold.attack}, `
                    + `carveStance ${fold.carveStance}, reverse ${reverse}, ${tag}: her hair's `
                    + `roots fall ${(drop * 1000).toFixed(1)} mm below the helmet rim they rest `
                    + 'against',
                );
              }
            }
          }
        }
      }
    }
    assert.ok(asserted >= 800, `only ${asserted} root stances asserted`);
  } finally {
    rider.dispose();
  }
});

/**
 * Her hip slider sits **on** the leather rather than half-sunk in it — the
 * second finding of §23.9m, and the reason the pad had a stair-stepped notch
 * bitten out of its rear edge.
 *
 * The slider is a lens 108 mm long and 20 mm thick lying along a hip that runs
 * the same way, so the two surfaces are very nearly parallel: the *steepest*
 * crossing anywhere on its rim moved clearance by 0.3 mm per millimetre of
 * travel. A grazing intersection like that is not a line, it is an amplifier —
 * the 3.9 mm chord sagitta of a ten-segment ring and the seat's own 0.3 mm
 * pushed the crossing eight millimetres along the pad, landing on a different
 * facet each row. It renders as a staircase, and against a pale pad on
 * near-black leather it is the first thing the eye finds in profile.
 *
 * **No tightening of the mesh fixes that**, because the amplification is a
 * property of the two shapes rather than of their resolution. What fixes it is
 * moving the crossing somewhere nothing can see: each ring slid outboard, its
 * thickness giving up exactly what its centre gained, until the whole outboard
 * half of its rim stands clear of the seat. The pale patch is then bounded by
 * the pad's own rim — a loft edge, which cannot step — and what still crosses
 * the leather is the inner face, buried behind the pad's bulk.
 *
 * This is the contract, and it is deliberately one-sided: proud outboard, and
 * still genuinely buried inboard, because a pad clear on *both* faces is a
 * puck floating off her hip.
 *
 * **The one contract in this file the M30 axis has nothing to say to**: it
 * poses no rider at all. The armour rides the pelvis and the seat profile is
 * read in the pelvis frame, so both sides of the comparison are the same rigid
 * body — the pad's placement is a property of the two lofts, not of a stance,
 * and a sweep over rider rolls would assert the identical numbers as many
 * times as it had values.
 */
test('her hip slider crosses the seat only where the pad itself hides it', () => {
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const armour = rider.root.getObjectByName('rider-armour') as THREE.Mesh | undefined;
    assert.ok(armour, 'Maribel has no armour mesh');
    assert.equal(armour.parent, rider.pelvis, 'her armour must ride the pelvis with the seat');
    const positions = armour.geometry.getAttribute('position');
    // The sliders only: her shoulder pods share this buffer and live at
    // y ≈ 0.42–0.52, five hundred millimetres above the hip line.
    const hip: number[] = [];
    for (let i = 0; i < positions.count; i += 1) if (positions.getY(i) < 0.10) hip.push(i);
    assert.ok(hip.length > 40, `only ${hip.length} hip-slider vertices found`);

    // Each ring's centre, recovered from the geometry rather than from the
    // profile: a superellipse sampled at an even number of even angles is
    // symmetric about its own centre, so the mean of a ring is that centre.
    // **Keyed by side as well as by height** — she wears two of these at the
    // same four heights, and averaging them together puts every centre on the
    // spine, which passes the whole pad as outboard of itself.
    const ringKey = (i: number): string =>
      `${positions.getX(i) < 0 ? 'L' : 'R'}${positions.getY(i).toFixed(4)}`;
    const rings = new Map<string, { x: number; n: number }>();
    for (const i of hip) {
      const key = ringKey(i);
      const ring = rings.get(key) ?? { x: 0, n: 0 };
      ring.x += positions.getX(i);
      ring.n += 1;
      rings.set(key, ring);
    }
    assert.equal(rings.size, 8, `her hip sliders have ${rings.size} rings, not two of four`);

    const seat = MARIBEL_LOOK.profiles.seat;
    const point = new THREE.Vector3();
    let worstProud = Infinity;
    let worstProudAt = '';
    let deepestInboard = 0;
    let outboard = 0;
    for (const i of hip) {
      const ring = rings.get(ringKey(i))!;
      point.fromBufferAttribute(positions, i);
      const proud = -depthInside(seat, point);
      // Outboard of its own ring centre is the half a camera outside her can
      // see. `>=` rather than `>` on purpose: the two cap centres sit exactly
      // on the axis and are part of the claim.
      if (Math.abs(point.x) >= Math.abs(ring.x / ring.n) - 1e-6) {
        outboard += 1;
        if (proud < worstProud) {
          worstProud = proud;
          worstProudAt = `(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)})`;
        }
      } else {
        deepestInboard = Math.max(deepestInboard, -proud);
      }
    }
    assert.ok(outboard > 20, `only ${outboard} outboard slider vertices sampled`);
    assert.ok(
      worstProud >= 0.002,
      `her hip slider's outboard face reaches ${(worstProud * 1000).toFixed(1)} mm of the seat at `
        + `${worstProudAt} — that is a grazing crossing in the half of the pad the camera sees`,
    );
    assert.ok(
      deepestInboard >= 0.002,
      `her hip slider's inner face is only ${(deepestInboard * 1000).toFixed(1)} mm inside the seat `
        + '— a pad clear on both faces floats off her hip',
    );
  } finally {
    rider.dispose();
  }
});

/**
 * The Drunkard — M29 Phase 2, and the two things on him that swing through
 * the envelope in frames the rest of this file never measured.
 *
 * **The can in his fist** hangs off the left elbow, whose target every arm
 * reaction moves — the carve's splay, the wobble's bracing, the sway's own
 * `swayArmSplay` — beside a thigh the IK folds toward it in every deep
 * stance. **The hat's tubes** hang off the neck, which the look-around yaws,
 * the stabiliser pitches and, for the first time on the roster, the ride
 * style *rolls* (`neck.rotation.z` through his `motion.swayHeadTilt`). A
 * clearance contract must apply every transform the rig writes between the
 * two things it compares (invariant 15), so the sway joins the sweep here:
 * `StanceInput.styleSway` over −1..1, which is the first time a look's own
 * motion table has been part of one.
 *
 * The pelvis roll is written the way `ridingRig.ts` writes it for *him*:
 * the counter-roll less the share the over-lean forgets, less the sway's
 * own roll — the term this file restored for Trollina, restated with the
 * two channels his table adds to it.
 */
function drunkardPelvisRoll(stance: Posed): number {
  const motion = DRUNKARD_LOOK.motion!;
  const sway = Math.max(-1, Math.min(1, stance.styleSway));
  // The over-lean composes on the counter-roll, so it composes on the M30 axis
  // too: `pelvisCounterRoll` is `rollAngle - riderRoll` now, and a quarter of
  // it is forgotten. At the top of the lean schedule the counter-roll is near
  // zero anyway and he converges with everyone; his sway is what is left.
  return pelvisCounterRoll(stance) * (1 - motion.overLean) - sway * motion.swayPelvisRoll;
}

/**
 * **What the machine reaches on the sway axis, measured — across every wheel
 * the game will build.** The reachable `(rollAngle, styleSway)` pairs, and the
 * second thing M30 Phase 3 had to measure rather than assume.
 *
 * `EucController` gates the Drunken Master's weave by
 * `handsOff = (1 - |steer|)²`: a rider holding lock is not weaving. So roll
 * and sway are related, and the cross product this file sweeps — every carve
 * against every sway — contains corners the controller cannot produce. The
 * tables below are where the sweep stops asserting them.
 *
 * **The first cut of this table was wrong three ways, and every one of them
 * made it too narrow.** Codex's independent Phase 3 QA (2026-09-03) found the
 * first two; measuring the third is what this repair is. It read a
 * *ten-second sample* of the oscillator at *seven held steering values* on the
 * *shipped wheel*, and concluded that a grip-limit carve carries at most 0.21
 * of sway. None of the three qualifiers survives measurement:
 *
 *   - **Bank depends on speed, not only on steer.** `?mph=` builds any wheel
 *     from 20 to 90 mph (`level/levels.ts`, `simulation/topSpeedPreset.ts`),
 *     and a faster wheel reaches the same bank with less steering. The least
 *     *held* steer that keeps a settled corner at `GRIP_ROLL`, and the gate it
 *     leaves — flat pavement, throttle held, sixty seconds past the settle:
 *
 *     ```
 *       preset   steer   settled speed   styleGate   peak |styleSway|
 *       shipped  0.43     20.11 m/s        0.325          0.320
 *       58 mph   0.37     23.38            0.397          0.391
 *       65 mph   0.33     26.22            0.449          0.442
 *       80 mph   0.27     32.10            0.533          0.525
 *       90 mph   0.24     36.12            0.578          0.569
 *     ```
 *
 *     Codex's own reproduction is the 65 row: throttle 1 into a held −0.35,
 *     `|styleSway|` 0.4217 where the old table permitted 0.2123.
 *   - **A sampled peak is not an amplitude bound.** The oscillator is
 *     `(cos A + cos B)/2` at `weaveRateA` 0.16 Hz and `weaveRateB` 0.115 Hz,
 *     so its amplitude is **1** and the two free-running clocks realign only
 *     every 200 s. Ten seconds sees a fraction of that; sixty sees ~98 % (the
 *     two right-hand columns above). The bound is the gate — the phase is a
 *     clock uncorrelated with the ride, so any phase is reachable at any gate
 *     — and the sampled column then confirms that rather than assuming it.
 *   - **The gate lags the corner, and that is the largest of the three
 *     terms.** `styleGate` eases at `weaveFadeRate` (3/s — a third of a
 *     second) while the wheel's roll follows at `rollResponseSeconds`
 *     (0.11 s). An entry therefore carries most of a straight line's weave
 *     into a bank that is already established: on the **shipped** wheel a
 *     grip-limit carve holds 0.60 of gate on the way in, against 0.325
 *     settled and the old table's 0.21.
 *
 * **What was measured, and how** (`phase3/sway/sweep.mjs` in the QA scratch
 * folder). The production `EucController` at `DRUNK_STYLE`, on 4 km of flat
 * pavement — long enough that a sixty-second corner never leaves the authored
 * road — across the presets 20 / 30 / 40 / shipped / 58 / 65 / 80 / 90 mph,
 * 61 steering magnitudes (0.01 apart to 0.5, 0.05 above), both signs, and
 * five trace shapes: a 60 s hold, a pulse train that recharges the gate on a
 * straight and snaps into the corner, seven entry ramps from one step to
 * 1.6 s, and a full-lock flick across the centre. **Sampled every step**, so
 * every transition and every lag is in it — 64.5 million samples per run.
 * Two runs: the cutout as shipped (with the throttle governed off the
 * over-speed warning, because flat out on the flat *does* reach
 * `cutoutSpeedShare` and cut out — 8.7 s in on the shipped wheel), and the
 * cutout disabled, which is faster and is included because that switch lives
 * on the same F4 panel `LEAN_SHARE_TOP_MAX` is read from. Both tables take
 * the larger of the two.
 *
 * Each roll is bucketed at 0.01 of `GRIP_ROLL` and each bucket keeps its
 * largest `styleGate`; the anchors below are then solved right-to-left for the
 * smallest piecewise-linear table that **dominates every bucket**. The
 * dominating is the point: the measured envelope is concave, so a table read
 * off it at coarse anchors passes *below* the measurement in between, which is
 * how a bound quietly stops being one. Verified rather than assumed
 * (`phase3/sway/fit.mjs` — no breach at 0.01 resolution).
 *
 * **The two bands are the split the can's contract needs.** `SWAY_AT_ROLL` is
 * every wheel the game will build; `SWAY_AT_ROLL_SHIPPED` is the wheel a
 * player who types no URL parameter is riding. At the grip limit they are
 * 0.753 and 0.602, against the old table's 0.211.
 *
 * **It is applied to the high shares only.** The low band keeps the full cross
 * product it has always swept: it clears with margin there, and narrowing a
 * contract that is already green buys nothing. What the cap prevents is the
 * *new* stances asserting a pose the machine has never held — the closing
 * sentence of invariant 15, and the difference between a real finding and a
 * phantom one.
 */
const SWAY_AT_ROLL: ReadonlyArray<{ roll: number; sway: number }> = [
  { roll: 0.00, sway: 1.000 },
  { roll: 0.02, sway: 1.000 },
  { roll: 0.05, sway: 0.997 },
  { roll: 0.10, sway: 0.990 },
  { roll: 0.15, sway: 0.983 },
  { roll: 0.20, sway: 0.976 },
  { roll: 0.25, sway: 0.968 },
  { roll: 0.30, sway: 0.961 },
  { roll: 0.35, sway: 0.951 },
  { roll: 0.40, sway: 0.944 },
  { roll: 0.45, sway: 0.933 },
  { roll: 0.50, sway: 0.924 },
  { roll: 0.55, sway: 0.915 },
  { roll: 0.60, sway: 0.902 },
  { roll: 0.65, sway: 0.891 },
  { roll: 0.70, sway: 0.875 },
  { roll: 0.75, sway: 0.860 },
  { roll: 0.80, sway: 0.847 },
  { roll: 0.85, sway: 0.821 },
  { roll: 0.90, sway: 0.806 },
  { roll: 0.95, sway: 0.761 },
  { roll: 1.00, sway: 0.753 },
];

/**
 * The same measurement on the **shipped** wheel alone — no `?mph=`, which is
 * the game every player who does not type a URL parameter is riding.
 *
 * It exists because the can's floor is a statement about that wheel: see the
 * contract below, where 40 mm is asserted against this table and the faster
 * presets get their own recorded number.
 */
const SWAY_AT_ROLL_SHIPPED: ReadonlyArray<{ roll: number; sway: number }> = [
  { roll: 0.00, sway: 1.000 },
  { roll: 0.02, sway: 1.000 },
  { roll: 0.05, sway: 0.994 },
  { roll: 0.10, sway: 0.982 },
  { roll: 0.15, sway: 0.971 },
  { roll: 0.20, sway: 0.959 },
  { roll: 0.25, sway: 0.946 },
  { roll: 0.30, sway: 0.934 },
  { roll: 0.35, sway: 0.920 },
  { roll: 0.40, sway: 0.907 },
  { roll: 0.45, sway: 0.891 },
  { roll: 0.50, sway: 0.875 },
  { roll: 0.55, sway: 0.857 },
  { roll: 0.60, sway: 0.843 },
  { roll: 0.65, sway: 0.817 },
  { roll: 0.70, sway: 0.805 },
  { roll: 0.75, sway: 0.771 },
  { roll: 0.80, sway: 0.751 },
  { roll: 0.85, sway: 0.712 },
  { roll: 0.90, sway: 0.699 },
  { roll: 0.95, sway: 0.614 },
  { roll: 1.00, sway: 0.602 },
];

/** One of the two measured envelopes above. */
type SwayEnvelope = ReadonlyArray<{ roll: number; sway: number }>;

/**
 * The sway that survives a wheel roll at the top of the lean schedule, under
 * one of the two envelopes above. The default is the wider one, because a
 * contract with no reason to distinguish them should be asserting the whole
 * `?mph=` window.
 */
function swayAtSpeed(
  rollAngle: number,
  styleSway: number,
  envelope: SwayEnvelope = SWAY_AT_ROLL,
): number {
  const ratio = Math.min(1, Math.abs(rollAngle) / GRIP_ROLL);
  let cap = envelope[0]!.sway;
  for (let i = 1; i < envelope.length; i += 1) {
    const below = envelope[i - 1]!;
    const above = envelope[i]!;
    if (ratio > above.roll) { cap = above.sway; continue; }
    if (ratio <= below.roll) break;
    const f = (ratio - below.roll) / (above.roll - below.roll);
    cap = below.sway + (above.sway - below.sway) * f;
    break;
  }
  return Math.sign(styleSway) * Math.min(Math.abs(styleSway), cap);
}

/**
 * **The two bands the can's constructed sweep is asserted over — regression
 * tripwires under a floor that is held somewhere else.**
 *
 * The can's floor is **40 mm and it is held**, by
 * `render/riderClearanceRidden.test.ts`: the production `EucController`
 * writing a real pose into the production `createRidingRig`, every step,
 * across the `?mph=` window, and since Phase 2's QA across the Drunkard's sway
 * *phase* as well. It measures **41.9 mm** at its worst (M30 Phase 2 — the hang
 * spent 16.4 mm of the 57.9 mm Phase 3b read; the phase axis spent another
 * 12 mm; the F4 share slider came down 1.2 → 1.04 → **1.00**, and the can is
 * now carried 8 mm further outboard, which is what put the floor back).
 * Read that file before either number below is touched.
 *
 * What is asserted *here* is something weaker on purpose. This file sweeps a
 * **cross product** — every carve against every fold against every sway
 * against every rider roll — and once M30 Phase 3's QA corrected
 * `SWAY_AT_ROLL` (Codex, 2026-09-03: the old table was the shipped wheel only,
 * a ten-second sample, and no entry transient — roughly a third of the true
 * envelope at the grip limit) that cross product stopped clearing 40 mm on any
 * wheel, the shipped one included:
 *
 * ```
 *   (M30 Phase 3, the day the axis arrived)
 *                          shipped wheel    every ?mph= wheel
 *   low band                  61.7 mm           61.7 mm      (unchanged)
 *   share 1.00                23.5 mm           16.2 mm
 *   share 1.02                22.0 mm           14.7 mm      (the day's slider max)
 *   share 1.20 (slider max)    8.6 mm            1.6 mm
 *   the pads (80 mm floor)   121.4 mm          118.7 mm
 *
 *   (M30 Phase 2 — the hang, and the same sweep)
 *   low band                  61.7 mm           61.7 mm      (unchanged again)
 *   settle 0.50               45.9 mm           38.4 mm
 *   share 1.00                 4.1 mm           −2.4 mm
 *   share 1.04 (slider max)    0.3 mm           −6.2 mm
 *   the pads (80 mm floor)    97.3 mm           95.7 mm
 *
 *   (M30 Phase 2's QA — the can carried 8 mm outboard, slider max now 1.00)
 *   low band                  70.9 mm           70.9 mm
 *   settle 0.50               53.5 mm           46.0 mm
 *   share 1.00 (slider max)   11.4 mm            4.8 mm
 *   the pads (80 mm floor)   107.8 mm          105.3 mm
 * ```
 *
 * (Against the old, too-narrow sway table the Phase 3 sweep read 61.7 / 42.2 /
 * 40.5.)
 *
 * **A negative number there is not a garment defect; it is the measure of how
 * far this sweep now sits from the ride.** Phase 2 saturates the wheel's bank
 * and lets the rider hang inside it, so the constructed pose composes the
 * *whole* force lean at 1.05 g with a full crouch, a full presentation fold
 * and a full sway — and buries the can six millimetres in a corner of the
 * space no trajectory reaches. The ridden file measures the same geometry at
 * **41.9 mm** with the slider at its maximum. The two rows below are pinned at
 * what this sweep reads, rounded down to the millimetre, and their only job is
 * to go red when the geometry moves.
 *
 * **Those poses are not poses the machine reaches**, which is AGENTS invariant
 * 15's closing sentence and the whole reason the ridden contract exists. Two
 * measurements say so rather than an argument:
 *
 *   - **`crouch` 1 is unreachable.** Every stance under 40 mm here carries it
 *     on top of a presentation fold at a grip-limit carve; the same stance at
 *     `crouch` 0 reads 51.0 mm on the shipped band, and the worst crouch-free
 *     stance in that whole sweep is 40.8 mm — over the floor. But
 *     `EUC.crouchHeldAmount` is **0.55**, and 1 is only the hop's own
 *     compression target, which the 0.07 s response never finishes reaching:
 *     measured over corners with the hop pressed at six charge lengths,
 *     `pose.crouch` peaks at **0.930** anywhere and **0.738** above 0.95 of
 *     `GRIP_ROLL`, and `min(crouch, carveStance)` never passes **0.730**
 *     (`phase3/sway/crouch.txt` in the QA scratch folder).
 *   - **And the four axes never coincide at their extremes.** The ridden
 *     minimum is not at the grip limit at all — it is a three-quarter bank at
 *     21.2 m/s where the weave is still near full amplitude, because at full
 *     lock the weave's own gate has closed. A cross product of per-axis
 *     maxima composes a corner of the space the ride has no trajectory
 *     through.
 *
 * **So why keep them at all?** Because they are cheap, they are a *different*
 * measure of the same geometry, and a look change that re-carries the can —
 * the arms drawn back to make him read more relaxed, say — moves both. The
 * floors are the measurement rounded down to the millimetre, so this file goes
 * red on any regression while the ridden file goes red on any real breach.
 * Two tripwires on one wire, and the numbers below are *records*, not design
 * intent: **do not soften them to close a regression, and do not read them as
 * the can's margin** — 41.9 mm is the margin, and 1.9 mm of it is the reserve.
 *
 * The lever if either file ever fails is the *can's carry* — where the fist
 * holds it relative to the thigh — never the floor and never the slider
 * (Phase 4, `docs/PLANS.md` q114). `EUC.carveLeanShareTop`'s maximum came down
 * from 1.2 to 1.02 on 2026-09-03 on the strength of the *old* table's numbers,
 * went **back to 1.2 the same evening** on the ridden measurement, came down
 * again to **1.04** when Phase 2's hang landed, and to **1.00** when Phase 2's
 * QA gave the ridden sweep the sway oscillator's phase — every one of those
 * moves decided by the ridden file, never by this one. **And that last time
 * the lever was pulled at last**: the can is carried 8 mm outboard of the
 * fist's axis (`riderLook.ts`, `DRUNKARD_HAND_CAN.x`), which is why the rows
 * above rose rather than the floor falling.
 */
const CAN_BANDS: ReadonlyArray<{ name: string; envelope: SwayEnvelope; floor: number }> = [
  { name: 'the shipped wheel', envelope: SWAY_AT_ROLL_SHIPPED, floor: 0.011 },
  { name: 'every ?mph= wheel', envelope: SWAY_AT_ROLL, floor: 0.004 },
];

/**
 * The held envelope this file sweeps, plus the sway, as stances for the rig —
 * **and, since M30 Phase 3, the rider roll** (`riderRollsFor`).
 *
 * Two of the four contracts built on this list have the pelvis hinge between
 * the things they compare — the can (a hand under the pelvis against a thigh
 * under the *root*) and the hip dome (a thigh under the root against a hem in
 * the pelvis frame) — and two do not: the hat kit hangs off the neck and the
 * pack rides the pelvis, both above the hinge, measured against a head that is
 * also above it. The axis is swept for all four regardless. Reasoning that a
 * transform cancels is exactly the reasoning invariant 15 exists to distrust,
 * Phase 2 (§30.7) is going to move what sits between those frames, and the
 * whole sweep costs seconds.
 */
function drunkardHeldStances(
  sways: readonly number[],
  envelope: SwayEnvelope = SWAY_AT_ROLL,
): LabelledStance[] {
  const stances: LabelledStance[] = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of LEANS) {
      for (const technicalTurn of TECHNICAL_TURNS) {
        for (const styleSway of sways) {
          for (const { riderRoll, tag } of riderRollsFor(rollAngle, technicalTurn)) {
            // The sway the machine still has at this roll and this speed.
            const sway = tag === 'slow' ? styleSway : swayAtSpeed(rollAngle, styleSway, envelope);
            stances.push({
              label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, technical ${technicalTurn.toFixed(2)}, sway ${sway.toFixed(2)}, ${tag}`,
              rollAngle,
              riderPitch,
              torsoPitch: torsoPitchFor(riderPitch),
              technicalTurn,
              styleSway: sway,
              riderRoll,
            });
          }
        }
      }
    }
  }
  for (const sign of [-1, 1]) {
    for (const technicalTurn of [0.44, 0.81, 1]) {
      for (const styleSway of sways) {
        for (const { riderRoll, tag } of riderRollsFor(sign * TECHNICAL_ROLL, sign * technicalTurn)) {
          stances.push({
            label: `technical corner ${(sign * TECHNICAL_ROLL).toFixed(2)}, technical ${(sign * technicalTurn).toFixed(2)}, sway ${styleSway.toFixed(2)}, ${tag}`,
            rollAngle: sign * TECHNICAL_ROLL,
            riderPitch: 0,
            torsoPitch: torsoPitchFor(0),
            technicalTurn: sign * technicalTurn,
            styleSway,
            riderRoll,
          });
        }
      }
    }
  }
  for (const rollAngle of CARVES) {
    for (const riderPitch of PRESENTATION_LEANS) {
      for (const fold of PRESENTATION_FOLDS) {
        for (const crouch of [0, 1]) {
          for (const styleSway of sways) {
            for (const { riderRoll, tag } of riderRollsFor(rollAngle)) {
              const sway = tag === 'slow' ? styleSway : swayAtSpeed(rollAngle, styleSway, envelope);
              stances.push({
                label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, attack ${fold.attack}, carveStance ${fold.carveStance}, crouch ${crouch}, sway ${sway.toFixed(2)}, ${tag}`,
                rollAngle,
                riderPitch,
                torsoPitch: torsoPitchFor(riderPitch),
                ...fold,
                crouch,
                styleSway: sway,
                riderRoll,
              });
            }
          }
        }
      }
    }
  }
  stances.push({ label: 'rest', restFactor: 1, torsoPitch: torsoPitchFor(0) });
  stances.push({ label: 'crash, settled', crash: 1, torsoPitch: torsoPitchFor(0) });
  // The stagger: his wobble fought bigger and looser, at both phases.
  for (const wobbleFight of [0.5, 1]) {
    for (const wobbleSway of [-1, 1]) {
      stances.push({ label: `wobble ${wobbleFight}, phase ${wobbleSway}`, wobbleFight, wobbleSway, torsoPitch: torsoPitchFor(0) });
    }
  }
  return stances;
}

test("the can in the Drunkard's fist clears his thigh and the wheel's pads through the held envelope", () => {
  // 40 mm from the thigh's surface and 80 mm from either pad, in every held
  // stance and at every sway. The build measures 83 mm and 138 mm at its
  // worst (a full attack-carve fold with the sway leaning him onto the can's
  // side); the floors are half of that so a re-carriage of the arms that
  // brings the can onto his leg — the cheap way to make him look more
  // relaxed — fails here instead of on the owner's ride.
  //
  // **This is the one contract in the file the M30 lean schedule moves past
  // its floor, and it is a slider question** (Phase 3, §30.3d's last
  // sentence). The counter-roll was doing the work: at the low band the pelvis
  // is rotated half a radian away from the leg and the arm goes with it; at the
  // top of the schedule that rotation is gone, and since Phase 2 it has
  // *reversed* — the rider hangs inside the wheel's line, so the pelvis rolls
  // the can toward the thigh rather than away from it.
  //
  // **The 40 mm floor is held by `render/riderClearanceRidden.test.ts`**, not
  // here: that file rides the production controller through the production
  // rig — and, since that phase's QA, the sway oscillator's phase — and
  // measures 41.9 mm at its worst, with the share slider at the 1.00 that
  // measurement set and the can carried 8 mm outboard. What is asserted here is
  // the
  // constructed cross product against the two measured sway envelopes, at the
  // numbers that product reaches — a regression tripwire on the same
  // geometry. `CAN_BANDS` above carries the full reasoning, including the two
  // measurements that show the failing compound is a corner of the space the
  // machine has no trajectory through. Read it before touching either number,
  // and do not soften them to close a regression.
  //
  // The slider is still swept here and still bounded the same way: a maximum
  // the contracts cannot hold is lowered with the reason written beside it in
  // `data/tuning.ts`, never the other way round. `LEAN_SHARE_TOP_MAX` reads
  // it from the panel, and the ridden file records what the shares above the
  // present ceiling actually measure.
  const rider = createPlaceholderRider(DRUNKARD_LOOK);
  const euc = createBlockoutEUC();
  euc.group.updateMatrixWorld(true);
  try {
    const hand = rider.root.getObjectByName('rider-hand-left') as THREE.Mesh;
    const hip = rider.root.getObjectByName('rider-hip-left')!;
    const thigh = hip.children.find((child) => (child as THREE.Mesh).isMesh === true && child.name === '') as THREE.Mesh;
    assert.ok(hand && thigh, 'the left hand and thigh are missing');
    const positions = hand.geometry.getAttribute('position');
    assert.ok(positions.count > DRUNKARD_GLOVE_VERTICES + 100, 'the left hand carries no can');
    const pads: THREE.Vector3[] = [];
    for (const side of ['left', 'right']) {
      const pad = euc.group.getObjectByName(`euc-pad-${side}`) as THREE.Mesh;
      assert.ok(pad, `the ${side} pad is missing`);
      const padPositions = pad.geometry.getAttribute('position');
      for (let j = 0; j < padPositions.count; j += 1) {
        pads.push(pad.localToWorld(new THREE.Vector3().fromBufferAttribute(padPositions, j)));
      }
    }
    const point = new THREE.Vector3();
    for (const band of CAN_BANDS) {
      let asserted = 0;
      let worstThigh = Infinity;
      let whereThigh = '';
      let worstPad = Infinity;
      let wherePad = '';
      for (const overrides of drunkardHeldStances([-1, 0, 1], band.envelope)) {
        const stance = Object.assign(createStanceInput(), overrides);
        rider.pelvis.rotation.z = drunkardPelvisRoll(stance);
        rider.applyStanceReaction(stance);
        rider.root.updateMatrixWorld(true);
        let thighClearance = Infinity;
        let padClearance = Infinity;
        for (let i = DRUNKARD_GLOVE_VERTICES; i < positions.count; i += 1) {
          hand.localToWorld(point.fromBufferAttribute(positions, i));
          for (const pad of pads) padClearance = Math.min(padClearance, point.distanceTo(pad));
          thigh.worldToLocal(point);
          // Only where the thigh is: beside the joint or below its rounded end
          // a leg vertex is not what the can could touch.
          if (point.y > 0.02 || point.y < -RIDER_BLOCKOUT.thighLength - 0.05) continue;
          thighClearance = Math.min(thighClearance, -depthInside(DRUNKARD_LOOK.profiles.thigh, point));
        }
        asserted += 1;
        if (thighClearance < worstThigh) { worstThigh = thighClearance; whereThigh = overrides.label!; }
        if (padClearance < worstPad) { worstPad = padClearance; wherePad = overrides.label!; }
      }
      assert.ok(asserted > 500, `only ${asserted} stances asserted`);
      console.log(
        `  ${band.name}: thigh ${(worstThigh * 1000).toFixed(1)} mm (${whereThigh}), `
          + `pads ${(worstPad * 1000).toFixed(1)} mm`,
      );
      assert.ok(
        worstThigh >= band.floor,
        `${band.name}: ${whereThigh}: the can comes within ${(worstThigh * 1000).toFixed(1)} mm of his thigh `
          + `(${(band.floor * 1000).toFixed(0)} mm required)`,
      );
      assert.ok(
        worstPad >= 0.080,
        `${band.name}: ${wherePad}: the can comes within ${(worstPad * 1000).toFixed(1)} mm of a pad (80 mm required)`,
      );
    }
  } finally {
    rider.dispose();
    euc.dispose();
  }
});

test("the hat's tubes clear the shoulders through the look-around and the sway's full amplitude", () => {
  // Every kit vertex — the cans, the tubes down to the stub in his mouth,
  // the peak — that comes down to the jersey's height stays 10 mm clear of
  // the jersey's surface, measured in the pelvis frame against the torso
  // profile's own section at the vertex's height, through every held
  // stance, every look into a turn and over the shoulder, and the sway at
  // −1, −½, 0, ½ and 1. The slope from the shoulder ring to the neck ring
  // is that surface, so a tube that dropped onto a shoulder would first
  // show up here. The deepest the kit reaches is the stub in his mouth, in
  // a hard brake composed with a grip-limit carve, a full technical turn, a
  // full sway and a look into the turn, where the stabiliser, the tilt and
  // the yaw all lower the mouth at once — and it is ahead of the collar,
  // over the chest, not on a shoulder. And the sway is proven
  // live in the sweep: the mouth end of the tubes moves between −1 and 1,
  // so a future sway that stopped reaching the neck could not pass by
  // never moving anything.
  const rider = createPlaceholderRider(DRUNKARD_LOOK);
  try {
    const kit = rider.root.getObjectByName('rider-drunkard-hat-kit') as THREE.Mesh;
    assert.ok(kit, 'the hat kit is missing');
    const positions = kit.geometry.getAttribute('position');
    const neckRing = DRUNKARD_LOOK.profiles.torso[DRUNKARD_LOOK.profiles.torso.length - 1]!.y;
    const point = new THREE.Vector3();
    // The lowest kit vertex at rest: the stub in his mouth.
    let lowestIndex = 0;
    for (let i = 1; i < positions.count; i += 1) if (positions.getY(i) < positions.getY(lowestIndex)) lowestIndex = i;
    const mouthAt = new Map<number, THREE.Vector3>();
    let asserted = 0;
    const sways = [-1, -0.5, 0, 0.5, 1];
    for (const base of drunkardHeldStances(sways)) {
      for (const lookYaw of [-EUC.riderLookIntoTurn, 0, EUC.riderLookIntoTurn]) {
        for (const reverse of [0, 1]) {
          const stance = Object.assign(createStanceInput(), base, { lookYaw, reverse });
          rider.pelvis.rotation.z = drunkardPelvisRoll(stance);
          rider.applyStanceReaction(stance);
          rider.root.updateMatrixWorld(true);
          let deepest = -Infinity;
          for (let i = 0; i < positions.count; i += 1) {
            kit.localToWorld(point.fromBufferAttribute(positions, i));
            rider.pelvis.worldToLocal(point);
            // Only at the jersey's height: above its top ring the section
            // the measure would use is the collar's, and a vertex over the
            // cap is not near a shoulder.
            if (point.y <= neckRing) deepest = Math.max(deepest, depthInside(DRUNKARD_LOOK.profiles.torso, point));
            if (i === lowestIndex && lookYaw === 0 && reverse === 0 && base.label.startsWith('carve 0.00, lean 0.00, technical 0.00')) {
              mouthAt.set(stance.styleSway, point.clone());
            }
          }
          asserted += 1;
          assert.ok(
            deepest <= -0.010,
            `${base.label}, look ${lookYaw.toFixed(2)}, reverse ${reverse}: the hat kit comes within `
              + `${(-deepest * 1000).toFixed(1)} mm of the jersey's surface at the shoulders (10 mm required)`,
          );
        }
      }
    }
    assert.ok(asserted > 3000, `only ${asserted} stances asserted`);
    const left = mouthAt.get(-1);
    const right = mouthAt.get(1);
    assert.ok(left && right, 'the neutral stance was not swept at both sways');
    assert.ok(
      left.distanceTo(right) > 0.020,
      `the sway moves the tubes by only ${(left.distanceTo(right) * 1000).toFixed(1)} mm between −1 and 1 — the channel is not live`,
    );
  } finally {
    rider.dispose();
  }
});

/**
 * The folds the head contract sweeps on top of the held envelope: every
 * fore-aft fold the rig can hold, at every lean up to the launch reaction,
 * crouched and not. The tuck is a held crouch with nothing but the ground
 * gating it (`EucController.tuck`), so a launch held in a crouch is an
 * ordinary thing to do — and it is where the neck reaches its full
 * extension (the general stabilisation saturates on the launch lean and the
 * tuck's own on top of it).
 */
function drunkardFoldStances(
  sways: readonly number[],
  envelope: SwayEnvelope = SWAY_AT_ROLL,
): LabelledStance[] {
  const stances: LabelledStance[] = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of [0, 0.15, 0.35, EUC.maxRiderPitch]) {
      for (const fold of FOLDS) {
        for (const crouch of [0, 1]) {
          for (const styleSway of sways) {
            for (const { riderRoll, tag } of riderRollsFor(rollAngle)) {
              const sway = tag === 'slow' ? styleSway : swayAtSpeed(rollAngle, styleSway, envelope);
              stances.push({
                label: `fold carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, tuck ${fold.tuck}, attack ${fold.attack}, carveStance ${fold.carveStance}, crouch ${crouch}, sway ${sway.toFixed(2)}, ${tag}`,
                rollAngle,
                riderPitch,
                torsoPitch: torsoPitchFor(riderPitch),
                ...fold,
                crouch,
                styleSway: sway,
                riderRoll,
              });
            }
          }
        }
      }
    }
  }
  return stances;
}

test("the Drunkard's pack clears his skull and his hat through every fold, the launch and the look", () => {
  // Codex's QA after Phase 2: the pint gauntlet round 1 stood over the
  // pack's box put its front face 48 mm inside the skull in an ordinary
  // attack stance. The pack rides the pelvis and the head rides the neck,
  // and the neck counter-pitches against the torso's whole hinge — 0.68 rad
  // at attack-plus-lean, 0.95 in a launch held in a crouch — so the skull's
  // back, 190 mm from the joint, sweeps an arc that owns everything within
  // ~470 mm of the pelvis behind it. Every neck axis is swept here: the
  // pitch through the folds and the launch, the yaw through the look, the
  // roll through the sway and the stagger's loll. 20 mm from any point of
  // the pack's own surface, measured as the built pack's vertices against
  // the skull's and the shell's lofts; the build measures 28 mm at its
  // worst (the launch-crouch with the look into the turn and a full sway)
  // and 68 mm in any held stance.
  const rider = createPlaceholderRider(DRUNKARD_LOOK);
  const skull = loftGeometry(DRUNKARD_HEAD, { radialSegments: 22 });
  const hat = loftGeometry(DRUNKARD_HAT, { radialSegments: 28 });
  try {
    const pack = rider.root.getObjectByName('rider-drunkard-pack') as THREE.Mesh;
    assert.ok(pack, 'the pack is missing');
    const packPositions = pack.geometry.getAttribute('position');
    const packColour = pack.geometry.getAttribute('color');
    // The pack body is page-coloured at 1; the hose and the valve are tints.
    // Only the top of the body can meet the head, so only its upper rings
    // are sampled — the box's front is buried in the jersey anyway.
    const cloud: THREE.Vector3[] = [];
    for (let i = 0; i < packPositions.count; i += 1) {
      if (packColour.getX(i) < 0.999 || packPositions.getY(i) < 0.35) continue;
      cloud.push(new THREE.Vector3().fromBufferAttribute(packPositions, i));
    }
    assert.ok(cloud.length > 60, `only ${cloud.length} pack vertices above 350 mm`);
    const crown = Math.max(...cloud.map((p) => p.y));
    const point = new THREE.Vector3();
    let worst = Infinity;
    let where = '';
    let asserted = 0;
    const sways = [-1, 0, 1];
    for (const base of [...drunkardHeldStances(sways), ...drunkardFoldStances(sways)]) {
      for (const lookYaw of [-EUC.riderLookIntoTurn, 0, EUC.riderLookIntoTurn]) {
        const stance = Object.assign(createStanceInput(), base, { lookYaw });
        rider.pelvis.rotation.z = drunkardPelvisRoll(stance);
        rider.applyStanceReaction(stance);
        rider.root.updateMatrixWorld(true);
        let gap = Infinity;
        for (const geometry of [skull, hat]) {
          const positions = geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i += 1) {
            rider.neck.localToWorld(point.fromBufferAttribute(positions, i));
            rider.pelvis.worldToLocal(point);
            // Nothing 80 mm over the crown can touch it.
            if (point.y > crown + 0.08) continue;
            for (const q of cloud) gap = Math.min(gap, point.distanceTo(q));
          }
        }
        asserted += 1;
        if (gap < worst) {
          worst = gap;
          where = `${base.label}, look ${lookYaw.toFixed(2)}, neck ${rider.neck.rotation.x.toFixed(3)}`;
        }
      }
    }
    assert.ok(asserted > 4000, `only ${asserted} stances asserted`);
    assert.ok(worst >= 0.020, `the pack comes within ${(worst * 1000).toFixed(1)} mm of his head — ${where} (20 mm required)`);
    // And the pack never climbs back into the arc: its crown stays under
    // the shoulder ring by a stated margin. The number the pint broke.
    const shoulder = DRUNKARD_LOOK.profiles.torso.find((ring) => ring.y >= 0.50)!.y;
    assert.ok(crown <= shoulder - 0.030, `the pack's crown at ${(crown * 1000).toFixed(0)} mm is within 30 mm of the shoulder ring at ${(shoulder * 1000).toFixed(0)}`);
  } finally {
    skull.dispose();
    hat.dispose();
    rider.dispose();
  }
});

/**
 * The riders whose trousers show the hip cut, and what closes it on each:
 * the dome's apex height, and the pelvis roll the rig writes for that look
 * (the Drunkard's carries his sway and over-lean; Wheel in Motion's is the
 * plain counter-roll, and his sweep has no sway to add).
 *
 * **The cop is not on this list, and M30 Phase 3 measured him to be sure.**
 * He rides the shared rig through the same controller and the same lean
 * schedule (§30.3c), his paddle is on the arms, and his pelvis carries nothing
 * this file does not already contract for on Cool Rider — so the only question
 * he raises is this one, the hip cut, and he raises it loudly: `COP_THIGH` is
 * a plain `limbProfile` ending in a flat cap, his seat is the shared `SEAT` at
 * Cool Rider's hem, and his legs are **bare skin** against navy shorts, which
 * is the contrast M29 said black hides and amber could not. Measured, worst
 * over the held envelope, as how far the cap's ring falls below his hem:
 *
 * ```
 *              the cop        Cool Rider     the Drunkard (domed)
 *   low band   −90.9 mm 67%   −84.9 mm 67%    0.0 mm  0%
 *   share 1.00 −68.0 mm 47%   −61.0 mm 47%    0.0 mm  0%
 *   share 1.20 −60.3 mm 33%   −53.0 mm 33%    0.0 mm  0%
 * ```
 *
 * (Measured on the M30 Phase 3 build, when share 1.20 was what the slider
 * offered and the rider could not lean past the wheel. Phase 2's hang moves
 * every row in the *improving* direction for the same reason the trend
 * already shows — the further the torso goes with the machine, the less of
 * the cap the hem leaves showing — and the slider's maximum is 1.00 now, so
 * the third row is a value the panel no longer reaches. Left as it stands
 * because it is a record of a look question for whoever takes it, not a
 * contract.)
 *
 * Two readings. The cut is **already there on him today**, at the low band and
 * on the roster's highest-contrast hip join — the same defect the owner found
 * on Wheel in Motion, one look further along, and it is a look question for
 * whoever takes it, not Phase 3's. And **M30 improves it**: the counter-roll
 * was what lifted the hem off the outside leg, so the further up the lean
 * schedule the rider goes the less of the cap shows. There is nothing on the
 * cop's pelvis that the M30 axis makes worse, which is why he stays off this
 * list rather than being added to it untested.
 */
const HIP_DOME_RIDERS: ReadonlyArray<{
  name: string;
  look: RiderLook;
  apexY: number;
  sways: readonly number[];
  pelvisRoll: (stance: Posed) => number;
}> = [
  { name: 'the Drunkard', look: DRUNKARD_LOOK, apexY: DRUNKARD_HIP_DOME_APEX, sways: [-1, 0, 1], pelvisRoll: drunkardPelvisRoll },
  { name: 'Wheel in Motion', look: WHEEL_IN_MOTION_LOOK, apexY: WIM_HIP_DOME_APEX, sways: [0], pelvisRoll: pelvisCounterRoll },
];

for (const { name, look, apexY, sways, pelvisRoll } of HIP_DOME_RIDERS) test(`${name}'s thighs end in a hip dome that stays inside his seat through every held corner`, () => {
  // The owner's ride (2026-09-03): "in some tight turns the legs kinda
  // detach from the torso (upper back end of the legs)". The rig drops the
  // inside hip 85 mm under the pelvis in a carve and the outside hip 150 mm
  // in a technical corner, and counter-rolls the seat's hem up on the
  // outside on top of that; a thigh that ends in a flat cap at the joint
  // then ends in a flat cap below the hem, with the seat's underside
  // showing over it. Every rider does it (70 % of the cap below the hem in
  // a full carve on Cool Rider, Wheel in Motion and him alike) and hides it
  // in black; amber cannot, and neither can trouser blue — the owner checked
  // the rest of the roster after the Drunkard's release and found it on
  // Wheel in Motion. So each of their thighs closes in a dome over the
  // joint and their seat's hem is 30 mm lower, and this proves the two
  // meet: through every held stance (at every sway, where the look has
  // one), the dome's apex stays at least 20 mm above the hem — the leg is
  // continuous into the trousers. The Drunkard measures 38 mm at his worst
  // (a grip-limit carve composed with a full technical turn and the sway
  // leaning him the other way).
  const thigh = look.profiles.thigh;
  const seat = look.profiles.seat;
  const apex = thigh[thigh.length - 1]!;
  assert.equal(apex.y, apexY, 'the thigh does not end at the dome\'s apex');
  assert.equal(apex.halfWidth, 0, 'the dome does not close');
  assert.ok(thigh.some((ring) => ring.y > 0.02 && ring.y < apexY && ring.halfWidth > 0.05), 'the dome has no shoulder — it is a spike');
  const hem = seat[0]!.y;
  const coolHem = COOL_RIDER_LOOK.profiles.seat[0]!.y;
  assert.ok(hem <= coolHem - 0.025, `the hem at ${(hem * 1000).toFixed(0)} mm is not 25 mm under Cool Rider's at ${(coolHem * 1000).toFixed(0)}`);

  const rider = createPlaceholderRider(look);
  try {
    const thighs: THREE.Mesh[] = [];
    for (const side of ['left', 'right']) {
      const hip = rider.root.getObjectByName(`rider-hip-${side}`)!;
      const mesh = hip.children.find((child) => (child as THREE.Mesh).isMesh === true && child.name === '') as THREE.Mesh | undefined;
      assert.ok(mesh, `no thigh under rider-hip-${side}`);
      thighs.push(mesh);
    }
    const point = new THREE.Vector3();
    let lowest = Infinity;
    let where = '';
    let asserted = 0;
    for (const overrides of drunkardHeldStances(sways)) {
      const stance = Object.assign(createStanceInput(), overrides);
      rider.pelvis.rotation.z = pelvisRoll(stance);
      rider.applyStanceReaction(stance);
      rider.root.updateMatrixWorld(true);
      for (const mesh of thighs) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += 1) {
          if (positions.getY(i) < apexY - 1e-6) continue;
          mesh.localToWorld(point.fromBufferAttribute(positions, i));
          rider.pelvis.worldToLocal(point);
          const above = point.y - hem;
          if (above < lowest) {
            lowest = above;
            where = `${overrides.label}, ${mesh.parent!.name}`;
          }
        }
      }
      asserted += 1;
    }
    assert.ok(asserted >= 160 * sways.length, `only ${asserted} stances asserted`);
    assert.ok(lowest >= 0.020, `the hip dome's apex comes down to ${(lowest * 1000).toFixed(1)} mm above the hem — ${where} (20 mm required)`);
  } finally {
    rider.dispose();
  }
});
