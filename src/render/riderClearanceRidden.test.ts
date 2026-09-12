/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIVE_TUNABLES, RIDER_BLOCKOUT, SIMULATION } from '../data/tuning.ts';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { machineForCharacter } from '../data/machines.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import { EucController, createPose, type EucTuning } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { createOneFootPose, stepOneFootFromController, type OneFootPoseState } from '../app/oneFootPose.ts';
import {
  DRUNKARD_GLOVE_VERTICES,
  DRUNKARD_LOOK,
  RIDER_LOOKS,
  TROLLINA_LOOK,
  WHEEL_IN_MOTION_LOOK,
  type RiderLook,
} from './riderLook.ts';
import { FLO_WITH_ZO_LOOK } from './floWithZoLook.ts';
import {
  SEAL_GARMENT_BAND,
  SEAL_GARMENT_KNOT,
  SEAL_GARMENT_TAIL,
  SEAL_GARMENT_VISIBLE_BOTTOM,
  SEAL_ON_A_WHEEL_LOOK,
} from './sealOnAWheelLook.ts';
import { machineLook } from './machineLook.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import type { LoftProfile } from './blockoutKit.ts';

/**
 * **The can's 40 mm floor, held as ridden** — M30 Phase 3's QA repair, and the
 * contract `riderClearance.test.ts` could not be.
 *
 * That file sweeps a **cross product**: every carve against every fold against
 * every sway against every rider roll. It is the right shape for a garment
 * question, and for one measure it stopped being the right shape for the
 * machine. Codex's Phase 3 QA (2026-09-03) found `SWAY_AT_ROLL` too narrow;
 * measuring it properly — every `?mph=` preset, the oscillator's true
 * amplitude, and the gate's lag on a corner entry — roughly tripled it at the
 * grip limit, and the can's constructed compound went under its floor on
 * *every* wheel, the shipped one included.
 *
 * The compound is not a pose the machine holds. AGENTS invariant 15's closing
 * sentence is the rule that says so — *bound the sweep by what the machine
 * reaches, measured in the running game* — and the honest way to keep the
 * 40 mm floor is therefore to measure it the way the game produces it: the
 * production `EucController` writing a real pose into the production
 * `createRidingRig`, every step, and the same can-versus-thigh and
 * can-versus-pad measures taken through the rig's own world matrices.
 *
 * **What this asserts.** In every sampled step of every ride below, the can in
 * the Drunkard's left fist stays 40 mm from the thigh's surface and 80 mm from
 * either of the machine's pads. Not the worst measured value — the floor. The
 * measurements are recorded beside it so a regression is legible.
 *
 * **What it rides.** The `?mph=` window's spine (shipped / 58 / 65 / 80 / 90 —
 * `level/levels.ts` builds 20 to 90, and the envelope grows with speed, so the
 * fast end is the binding one), both steering signs, thirteen steering
 * magnitudes, and eight entries per magnitude: a held corner, a snap from a
 * straight line (the entry that carries a straight line's full weave into an
 * established bank — the term the old table missed), a ramped entry, **a flick
 * — the stick thrown side to side every ten ticks for three seconds** (M30
 * Phase 3b, the entry that rides every settle value between the slow-band
 * share and the full one), **a reversal — full lock saturated, then thrown
 * into a gentle opposite corner** (Codex's final QA, 2026-09-07: the only ride
 * that lets the settle climb back *while* the wheel is still crossing upright,
 * which is where the body's lean lags the bank and the two briefly disagree
 * about which way the rider is leaning), braking inside the corner, a corner
 * held with the crouch down, and the hop's own compression at three charge
 * lengths, which is the only way `pose.crouch` passes `EUC.crouchHeldAmount`
 * — **and the phase ladder below**, which is the axis M30 Phase 2's QA found
 * missing. Ridden at `carveLeanShareTop`'s shipped 1.0 and at the F4 slider's
 * maximum read from
 * `LIVE_TUNABLES`, which is the share the garment contracts are bounded by;
 * since that QA the two are the same number and the list deduplicates itself.
 * Every preset rides the M30 Phase 2 grip schedule, so the hang —
 * the rider inside the wheel's saturated bank — is in every sample here
 * without this file naming it: it rides whatever the production controller
 * writes.
 *
 * **Measured minima, 2026-09-07 (Codex's final QA — the reversal entry)** —
 * 604,960 posed steps, the whole sweep, printed by the test:
 *
 * ```
 *   preset     can vs thigh   can vs pads      (share 1.00, the slider's max)
 *   shipped       41.4 mm       187.4 mm
 *   58 mph        41.4          185.1
 *   65 mph        41.4          187.4
 *   80 mph        41.0          183.5
 *   90 mph        41.9          176.5
 * ```
 *
 * **41.0 mm on the 80 mph wheel is the pin** — 1.0 mm of margin over the 40 mm
 * floor, and 183.5 mm against the pads' 80 mm.
 *
 * **The reversal moved the record and that is the point of adding it.** The
 * 2026-09-04 table read 52.7 / 42.4 / 42.2 / 41.9 / 42.2 mm over 550,360
 * steps; the shipped wheel's eleven millimetres of that were a pose the forty
 * held corners and the symmetric flick between them never reached, and the
 * finer six-hundred-rung ladder below had already found 51.8 / 41.4 / 41.4 /
 * 41.0 / 41.5 there. The reversal finds the same numbers at forty rungs, which
 * is the honest reading: the reserve was one millimetre before this entry and
 * is one millimetre after it, and the coarse ladder now says so.
 *
 * **What Phase 2 shipped, and what its QA found.** Phase 2 saturates the
 * wheel's bank at the ordinary 0.75 g and lets `riderLean` carry the whole
 * 1.05 g force lean, so the rider hangs 9.5° inside the machine's line before
 * the share multiplies anything, and the fist under the hanging pelvis rides
 * that much nearer the thigh. That phase measured 41.0 mm at a slider maximum
 * of 1.04 and set the maximum from it — on a sweep that rode every steering
 * magnitude but always after the same straight, so the sway oscillator was
 * effectively sampled at one phase. Swept properly, the same corner reads
 * **28.3 mm at the shipped share 1.00**: twelve millimetres under the floor
 * rather than one over it.
 *
 * **The repair is the lever this file has named since Phase 3: the can's
 * carry.** It is carried 8 mm outboard of the fist's axis (`riderLook.ts`,
 * `DRUNKARD_HAND_CAN.x`) — 0.96 mm of thigh per millimetre, measured by
 * perturbing the rig at the worst pose — and the floor comes back. What does
 * not come back is headroom above the shipped share: each 0.01 of
 * `carveLeanShareTop` costs about 1.3 mm, so **the slider's maximum is 1.00**,
 * §30.3d's rule applied for the third time. About 13 mm of carry would return
 * it to 1.04, and that is an owner decision with this measurement under it
 * (Phase 4, `docs/PLANS.md` q114).
 *
 * **The finer ladder, for the record.** At 600 rungs — a twenty-step
 * resolution on the oscillator's 12,000-step cycle, fifteen times this file's
 * — the *pre-reversal* rides read 51.8 / 41.4 / 41.4 / 41.0 / 41.5 mm against
 * forty rungs' 52.7 / 42.4 / 42.2 / 41.9 / 42.2: within 0.9 mm everywhere, and
 * a minute cheaper. Since the reversal entry landed, forty rungs read those
 * same fine-ladder numbers on four presets of five, which is the entry doing
 * what the finer phase resolution was doing and doing it for a reason rather
 * than by luck.
 *
 * The Phase 3b table this replaces, for the record — the same sweep before the
 * hang existed, at the 1.2 the slider then offered: 72.3 / 71.7 / 77.7 / 77.7 /
 * 77.7 mm at share 1.00 and 62.2 / 53.9 / 53.9 / 53.9 / 53.9 mm at 1.20.
 *
 * **If this contract ever goes red the lever is the can's carry** — where the
 * fist holds it relative to the thigh — not the floor and not the slider.
 *
 * **Why it is a separate file.** It drives a controller, so it costs seconds
 * rather than milliseconds, and it is the one clearance measure in the project
 * whose sweep is a *ride* instead of a stance list. Keeping it beside
 * `riderClearance.test.ts` rather than inside it keeps that file's runtime
 * where it was and makes the difference between the two methods visible in the
 * file list.
 */

/** One fixed step, the simulation's own. */
const STEP = 1 / SIMULATION.hz;

/**
 * `ringAtHeight` / `depthInRing` / `depthInside`, **copied** from
 * `riderClearance.test.ts`.
 *
 * Deliberately duplicated rather than imported: importing a `node --test` file
 * runs its tests a second time in this process. They are twenty lines of
 * section arithmetic that follow `blockoutKit.loftPoint`'s superellipse, and
 * if that changes both copies have to. The alternative — a shared helper
 * module under `render/` that ships in the bundle so two tests can share a
 * measure — is worse.
 */
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

function depthInRing(
  ring: { halfWidth: number; halfDepth: number; x: number; z: number; square: number },
  point: THREE.Vector3,
): number {
  const dx = point.x - ring.x;
  const dz = point.z - ring.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return Math.min(ring.halfWidth, ring.halfDepth);
  const g = Math.abs(dx / ring.halfWidth) ** ring.square
    + Math.abs(dz / ring.halfDepth) ** ring.square;
  return (g ** (-1 / ring.square) - 1) * r;
}

const depthInside = (profile: LoftProfile, point: THREE.Vector3): number =>
  depthInRing(ringAtHeight(profile, point.y), point);

/**
 * Four kilometres of straight pavement, eight hundred wide.
 *
 * The tightest turning circle at 90 mph is about 217 m of radius and the
 * corners below are held for seconds, so this keeps the whole sweep **on the
 * authored course**. A short fixture would put every sample past its end —
 * same surface, same height, but `offCourse`, which is a state this
 * measurement has no reason to be in.
 */
const PLAN = buildLevelPlan(
  [{ id: 'flat', length: 4000, halfWidth: 400, surface: 'pavement', shoulder: 2 }],
  {
    id: 'ridden-flat',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' },
    spacing: 20,
  },
);

/** The F4 panel's ceiling for the lean share — the same read the stance file makes. */
const LEAN_SHARE_TOP_MAX = ((): number => {
  const spec = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveLeanShareTop');
  assert.ok(spec, "the F4 panel has no 'EUC.carveLeanShareTop' slider to ride at");
  return spec.max;
})();

/**
 * The shares ridden: the shipped one and the slider's ceiling.
 *
 * Deduplicated, because M30 Phase 2's QA lowered that ceiling onto the shipped
 * value (§30.3d, the third application) and riding the identical share twice
 * costs a minute and proves nothing. If the slider ever offers more again this
 * becomes two entries on its own.
 */
const SHARES: readonly number[] = LEAN_SHARE_TOP_MAX > 1
  ? [1, LEAN_SHARE_TOP_MAX]
  : [LEAN_SHARE_TOP_MAX];

/**
 * The presets ridden. `null` is the shipped wheel — no `?mph=` at all.
 *
 * `level/levels.ts` builds 20 to 90 mph; the slow end is not swept because the
 * measure is monotone in speed for the reason the sway envelope is (a faster
 * wheel banks on less steering, which leaves more weave), and 20 mph cannot
 * even reach `EUC.carveLeanFullSpeed`, so its rider never leaves the low band.
 */
const PRESETS: ReadonlyArray<number | null> = [null, 58, 65, 80, 90];

/** Steering magnitudes. Dense across every preset's grip-limit knee (0.24-0.43). */
const STEERS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.75, 1] as const;

/** Hop charge lengths, in fixed steps — `pose.crouch` peaks inside the compression. */
const CHARGES = [12, 48, 144] as const;

/**
 * **The phase ladder** — M30 Phase 2's QA repair, and the axis this file was
 * missing.
 *
 * The Drunkard's `styleSway` is an oscillator, two cosines at 0.16 and
 * 0.115 Hz, and the pose it writes is a real input to the fist's position. The
 * sweep below rides every steering magnitude, both signs and seven entries —
 * but always after the *same* straight, so the oscillator's value at the moment
 * of deepest bank is effectively one number. The measured worst was at
 * `sway 0.000`; met a fifth of a second later in its cycle, the identical
 * corner reads **12 mm nearer the thigh**. A ride swept without its phase swept
 * is a ride sampled at one phase (AGENTS invariant 15).
 *
 * So each preset also rides a ladder: forty snaps into a held full-lock corner,
 * each after a straight long enough for the weave's gate to recharge and the
 * wheel to return to terminal. The rung is 481 steps, which is coprime with the
 * oscillator's own 12,000-step period (0.16 and 0.115 Hz share 0.005 Hz, so it
 * repeats exactly every 200 s), so forty rungs are forty different phases
 * spread round the whole cycle rather than forty samples of one.
 *
 * Forty is where it converges: against a 600-rung ladder — twenty-step
 * resolution on the cycle — the worst it finds is within 0.6 mm, and 100 and
 * 150 rungs find the same number 40 does. Full lock is where it binds, by
 * measurement: at 65 mph and the slider's ceiling the phase-swept worst is
 * 28.9 mm at ±1 against 43.4 mm at ±0.75 and 62.4 at ±0.3, because the deepest
 * bank and the biggest hang live there. It is ridden both signs even though
 * only the left fist carries a can, because a contract that assumed which way
 * the rider hangs would be assuming the thing it measures.
 */
const PHASE_RUNGS = 40;
/** The straight before each snap, in fixed steps. */
const PHASE_STRAIGHT = 181;
/** The corner held after it, in fixed steps. */
const PHASE_CORNER = 300;
/** The steering magnitudes the ladder is ridden at — full lock, both signs. */
const PHASE_STEERS = [1, -1] as const;

/** The ladder's legs for one steering magnitude. */
function phaseLadder(steer: number): Leg[] {
  const legs: Leg[] = [];
  for (let rung = 0; rung < PHASE_RUNGS; rung += 1) {
    legs.push({ steps: PHASE_STRAIGHT, steer: 0 });
    legs.push({ steps: PHASE_CORNER, steer });
  }
  return legs;
}

interface Leg {
  steps: number;
  steer: number | ((i: number) => number);
  crouch?: boolean;
  hop?: boolean;
  throttle?: number;
}

/** One corner, entered seven ways. */
function entries(steer: number): Leg[] {
  return [
    // Straight, long enough for the weave's gate to recharge to ~1.
    { steps: 240, steer: 0 },
    // The snap: a full gate carried into a bank that establishes in 0.11 s.
    { steps: 360, steer },
    { steps: 180, steer: 0 },
    // Ramped in over four tenths, then held.
    { steps: 48, steer: (i: number) => (steer * (i + 1)) / 48 },
    { steps: 240, steer },
    // **The flick** (M30 Phase 3b): the stick thrown side to side every ten
    // ticks for three seconds, which is the ride the owner described and the
    // one the settle exists for. Every pose between the slow-band share and
    // the full one is ridden here, and the transition poses are exactly the
    // ones no held corner reaches — the body part way down the schedule over a
    // wheel that is already banked the other way.
    { steps: 360, steer: (i: number) => (Math.floor(i / 10) % 2 === 0 ? steer : -steer) },
    { steps: 120, steer },
    // **The reversal** (Codex's final QA, 2026-09-07): full lock held long
    // enough to saturate the bank, thrown into a *gentle* opposite corner.
    // The flick above is symmetric, so its settle sits at zero through every
    // crossing and the body simply holds the M16 pose; this one lets the
    // settle climb back while the wheel is still near upright, which is the
    // only ride that puts `riderRoll` on the wheel's opposite side at all
    // (`simulation/EucController.test.ts` measures the band). The gentle half
    // takes this leg's own magnitude, capped, so the thirteen magnitudes ride
    // thirteen different reversals rather than one.
    { steps: 240, steer: Math.sign(steer) },
    { steps: 180, steer: -Math.sign(steer) * Math.min(Math.abs(steer), 0.2) },
    // Braking inside the corner: the fore-aft axis at its other end.
    { steps: 180, steer, throttle: -1 },
    // Held with the crouch down (`EUC.crouchHeldAmount`, 0.55).
    { steps: 300, steer, crouch: true },
    // And the hop's compression, which is the only path past that.
    ...CHARGES.flatMap((charge): Leg[] => [
      { steps: charge, steer, crouch: true, hop: true },
      { steps: 120, steer },
    ]),
  ];
}

test('the can never comes within 40 mm of his thigh on any ride the machine can make', () => {
  const rig = createRidingRig(DRUNKARD_LOOK);
  try {
    const hand = rig.rider.root.getObjectByName('rider-hand-left') as THREE.Mesh;
    const hip = rig.rider.root.getObjectByName('rider-hip-left')!;
    const thigh = hip.children.find(
      (child) => (child as THREE.Mesh).isMesh === true && child.name === '',
    ) as THREE.Mesh;
    assert.ok(hand && thigh, 'the left hand and thigh are missing');
    const positions = hand.geometry.getAttribute('position');
    assert.ok(
      positions.count > DRUNKARD_GLOVE_VERTICES + 100,
      'the left hand carries no can',
    );

    // The two pads, each with its own local bounding box. A point's distance
    // to that box is a **lower bound** on its distance to the pad's surface,
    // so the cheap test is conclusive whenever it clears — which, at 115 mm of
    // real clearance, is every step but none of the interesting ones.
    const pads = ['left', 'right'].map((side) => {
      const mesh = rig.euc.group.getObjectByName(`euc-pad-${side}`) as THREE.Mesh;
      assert.ok(mesh, `the ${side} pad is missing`);
      mesh.geometry.computeBoundingBox();
      const local: THREE.Vector3[] = [];
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 1) local.push(new THREE.Vector3().fromBufferAttribute(p, i));
      return { mesh, box: mesh.geometry.boundingBox!.clone(), local };
    });

    const pose = createPose();
    const toThigh = new THREE.Matrix4();
    const toPad = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const probe = new THREE.Vector3();
    const thighProfile = DRUNKARD_LOOK.profiles.thigh;

    let sampled = 0;
    const worst: Array<{
      label: string; thigh: number; pad: number; where: string;
    }> = [];

    for (const mph of PRESETS) {
      for (const share of SHARES) {
        const label = `${mph === null ? 'shipped' : `${mph} mph`}, share ${share.toFixed(2)}`;
        const tuning: Record<string, number> = { carveLeanShareTop: share };
        if (mph !== null) {
          const preset = topSpeedPreset(mph);
          tuning.dragCoefficient = preset.dragCoefficient;
          tuning.powerComfortSpeed = preset.powerComfortSpeed;
          tuning.powerLimitSpeed = preset.powerLimitSpeed;
        }
        // The cutout is left exactly as it ships. Flat out on the flat *does*
        // reach `cutoutSpeedShare` and cut out (8.7 s on the shipped wheel), so
        // the throttle is governed off the over-speed warning below — which is
        // what a player who wants to stay fast does, and which keeps every
        // sample a riding sample rather than a crash one.
        const euc = new EucController(new PlanTerrainSampler(PLAN), {
          spawn: PLAN.spawn,
          tuning: tuning as never,
        });
        euc.setRideStyle(DRUNK_STYLE);

        const actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: 0, crouch: false, hop: false };
        let worstThigh = Infinity;
        let worstPad = Infinity;
        let where = '';
        let wherePad = '';

        const legs: Leg[] = [{ steps: 4200, steer: 0 }];
        for (const steer of STEERS) for (const sign of [1, -1]) legs.push(...entries(sign * steer));
        for (const steer of PHASE_STEERS) legs.push(...phaseLadder(steer));

        for (const leg of legs) {
          for (let i = 0; i < leg.steps; i += 1) {
            actions.steer = typeof leg.steer === 'function' ? leg.steer(i) : leg.steer;
            actions.crouch = leg.crouch === true;
            actions.hop = leg.hop === true;
            actions.throttle = leg.throttle ?? (euc.overspeed > 0.8 ? 0 : 1);
            euc.step(STEP, actions);
            euc.writePose(pose);
            // A crash is its own contract (`crash, settled` in the stance file)
            // and a ragdoll is not a rider holding a can.
            if (pose.crashBlend > 0) continue;
            rig.apply(pose);
            rig.group.updateMatrixWorld(true);
            sampled += 1;

            toThigh.copy(thigh.matrixWorld).invert().multiply(hand.matrixWorld);
            let thighGap = Infinity;
            for (let v = DRUNKARD_GLOVE_VERTICES; v < positions.count; v += 1) {
              point.fromBufferAttribute(positions, v).applyMatrix4(toThigh);
              // Beside the joint or below the leg's rounded end, a vertex is
              // not near anything the can could touch.
              if (point.y > 0.02 || point.y < -RIDER_BLOCKOUT.thighLength - 0.05) continue;
              thighGap = Math.min(thighGap, -depthInside(thighProfile, point));
            }

            let padGap = Infinity;
            for (const pad of pads) {
              toPad.copy(pad.mesh.matrixWorld).invert().multiply(hand.matrixWorld);
              for (let v = DRUNKARD_GLOVE_VERTICES; v < positions.count; v += 1) {
                point.fromBufferAttribute(positions, v).applyMatrix4(toPad);
                pad.box.clampPoint(point, probe);
                const bound = point.distanceTo(probe);
                if (bound >= padGap) continue;
                // Only when the box cannot settle it does the surface get asked.
                for (const q of pad.local) padGap = Math.min(padGap, point.distanceTo(q));
              }
            }

            if (thighGap < worstThigh || padGap < worstPad) {
              const at = `speed ${pose.speed.toFixed(1)} m/s, roll ${pose.rollAngle.toFixed(3)}, `
                + `riderRoll ${pose.riderRoll.toFixed(3)}, sway ${pose.styleSway.toFixed(3)}, `
                + `attack ${pose.attack.toFixed(2)}, carveStance ${pose.carveStance.toFixed(2)}, `
                + `crouch ${pose.crouch.toFixed(2)}, technical ${pose.technicalTurn.toFixed(2)}`;
              if (thighGap < worstThigh) { worstThigh = thighGap; where = at; }
              if (padGap < worstPad) { worstPad = padGap; wherePad = at; }
            }
          }
        }

        worst.push({ label, thigh: worstThigh, pad: worstPad, where });
    console.log(
      `  ${label}: thigh ${(worstThigh * 1000).toFixed(1)} mm, pads ${(worstPad * 1000).toFixed(1)} mm`,
    );
        assert.ok(
          worstThigh >= 0.040,
          `${label}: the can came within ${(worstThigh * 1000).toFixed(1)} mm of his thigh `
            + `(40 mm required) — ${where}`,
        );
        assert.ok(
          worstPad >= 0.080,
          `${label}: the can came within ${(worstPad * 1000).toFixed(1)} mm of a pad `
            + `(80 mm required) — ${wherePad}`,
        );
      }
    }

    // A ride that stopped riding would pass every assertion above by never
    // posing anything, which is the failure mode a contract built on a
    // simulation has and a contract built on a stance list does not.
    console.log(`  ${sampled.toLocaleString('en-GB')} posed steps measured`);
    assert.ok(sampled > 400_000, `only ${sampled} steps were posed and measured`);
    assert.equal(
      worst.length,
      PRESETS.length * SHARES.length,
      'a preset or a share was not ridden',
    );
    assert.ok(
      SHARES.includes(LEAN_SHARE_TOP_MAX),
      "the slider's own maximum was not among the shares ridden",
    );
  } finally {
    rig.dispose();
  }
});

/**
 * **The one-foot air gesture, ridden — M36 §36.5, on every look and the cop.**
 *
 * `riderClearance.test.ts` sweeps the gesture as a stance family and chose
 * its side; this rides it. The production `EucController` writes a real pose,
 * the production `app/oneFootPose.ts` state machine is stepped beside it from
 * the same held level and the same controller facts `app/Game.ts` hands it
 * (`stepOneFootFromController`, the one reading), and the production rig is
 * told the blend **before** `apply`, exactly as `Game.renderSeat` does. So the
 * pose enters when the game's would, at the amounts the game's would show —
 * a continuum through every interior value rather than three samples — over
 * the crouch the launch actually leaves, the bank the corner actually holds,
 * the rider roll the schedule actually writes, and the Drunkard's sway at the
 * phase the ride actually reaches.
 *
 * ## What is ridden, per rig (the honest bound)
 *
 * Ten rigs — the nine playable looks and the cop's — each on **its own
 * machine** (`machineForCharacter`; the cop rides the standard wheel), on the
 * shipped tuning, through these flights, each after a two-second straight:
 *
 *   - hold through takeoff, uncharged and charged;
 *   - a tap, and a hold released before the dwell (**must show nothing**);
 *   - the 180 both ways with the level held through the sweep, and the 180
 *     as a tap (nothing);
 *   - an abrupt release at the apex;
 *   - hold through landing, and sixty grounded steps after it;
 *   - a hop inside a held carve, both signs;
 *   - a fakie hop — the reverse engaged, the hop taken riding backwards, the
 *     ride turned forward again;
 *   - and three flights on the F4 hop slider's ceiling (`EUC.hopLaunchSpeed`
 *     6 m/s, ~1.2 s of air): a re-hold on the way down, a release at the
 *     apex, and a charged hold-through — the flights Switchback Park's
 *     kickers give and the flat cannot.
 *
 * The Drunkard rides all of it twice — the shipped wheel and the 80 mph
 * preset, the one the can's ridden pin binds on — with `DRUNK_STYLE`, and
 * adds a six-rung phase ladder of held hops so the sway is met at six
 * phases rather than one. **Not ridden here**, and said so: the other three
 * `?mph=` presets for the other nine looks (their garments are pelvis-worn and
 * the constructed family already carries the whole rider-roll axis), the
 * cross product of spin × carve × charge, and the technical over-grip corner
 * hop. This is a set of rides, not a Cartesian product, and the claim is
 * about these rides.
 *
 * ## The floors, and which look each is measured on
 *
 * Every floor this file and the stance file hold is measured *through the
 * ride* on the look that wears it, on every posed step (crash steps skipped,
 * as above):
 *
 *   - **the Drunkard's can**: 40 mm from his thigh, 80 mm from either pad —
 *     this file's own measure, unchanged;
 *   - **the hip domes** (Drunkard, Wheel in Motion, FloWithZo, Seal): the
 *     dome's apex 20 mm above the seat's hem in the pelvis frame — the
 *     contract the gesture has the most direct claim on, because it rotates
 *     the hip the dome sits on;
 *   - **Trollina's skirt**: a leg's escape stays inside the flare's structural
 *     cover (`highestOutside ≤ 100 mm` in the pelvis frame, the stance file's
 *     presentation-fold bound, read up to the bodice at 0.166 so the bound
 *     can bite) on every step, and on every *held* step — no crouch, no
 *     fold, no reverse, the stance file's own tier for the 3 mm containment —
 *     the leg stays 3 mm inside the skirt's surface;
 *   - **Seal's tied sweatshirt**: on every held step, the same tier, the band
 *     4 mm inside and the tail and both knot tubes 8 mm clear of a leg (a
 *     preload crouch folds a thigh into the knot's span with the gesture
 *     idle — the structural tier's compound, `DESIGN.md` §7g, measured here
 *     and deliberately not asserted);
 *   - **every look, the cost**: the released leg against the look's own torso
 *     section, with the gesture and without it on the same step, must not
 *     bring the leg nearer than the constructed sweep's pinned record for that
 *     look (`GESTURE_COST` in the stance file) — which is the reading that
 *     says the constructed family bounds what the machine reaches.
 *
 * And the sweep proves it rode: every flight expected to pose reaches the full
 * gesture on every rig, every flight expected not to shows nothing, the
 * grounded steps after a held landing draw both boots down, and the counts of
 * posed and gestured steps are pinned above a floor.
 */

/** The ten-rig roster's own machines, so a look rides the wheel it ships on. */
function rigFor(look: RiderLook): RidingRig {
  return createRidingRig(look, machineLook(machineForCharacter(look.id)));
}

/** Trollina's fitted bodice, in the pelvis frame — the stance file's "below the fitted bodice at 0.166". */
const TROLLINA_BODICE = 0.166;

/** The looks whose thighs end in a hip dome over the joint (the stance file's list). */
const DOME_LOOKS: readonly RiderLook[] = [DRUNKARD_LOOK, WHEEL_IN_MOTION_LOOK, FLO_WITH_ZO_LOOK, SEAL_ON_A_WHEEL_LOOK];

/** The stance file's pinned per-look gesture cost, metres (negative = nearer). */
const GESTURE_COST: ReadonlyMap<string, number> = new Map([
  ['cool-rider', -0.080],
  ['trollina', -0.120],
  ['red-rider', -0.075],
  ['adonisb2', -0.120],
  ['maribel-vargas', -0.140],
  ['wheel-in-motion', -0.110],
  ['drunkard', -0.025],
  ['flo-with-zo', -0.100],
  ['seal-on-a-wheel', -0.110],
  ['cop', -0.080],
]);

/** One flight's script. `held`/`hop` are asked before each step with the flight's own clock. */
interface Flight {
  readonly label: string;
  /** Crouch held for this many steps before the press (0 = uncharged). */
  readonly charge?: number;
  readonly steer?: number;
  /** A fixed throttle, else governed off the over-speed warning. */
  readonly throttle?: number;
  /** Air step of the airborne second press that arms the 180, if any. */
  readonly spinAt?: number;
  /** The held level, asked every step: `airSteps` is -1 before takeoff and keeps counting after landing. */
  readonly held: (airSteps: number, rising: boolean, landed: boolean) => boolean;
  /** Steps ridden after touchdown before the flight is over. */
  readonly after?: number;
  /** Whether this flight must reach the full gesture, or must show nothing. */
  readonly expect: 'pose' | 'none';
  /** Steps of straight riding before the press (the settle). */
  readonly straight?: number;
  /** Ride backwards first: brake to a stop and engage the reverse, then hop. */
  readonly fakie?: boolean;
  /**
   * Ride straight until the wheel is this far along the plan, then press —
   * for the graded plan, where *where* the hop is taken is what puts it on the
   * climb or on the descent. Replaces `straight` when set.
   */
  readonly untilZ?: number;
}

const THROUGH = (): boolean => true;
const NEVER_LANDED = (airSteps: number, _rising: boolean, landed: boolean): boolean => !landed && airSteps >= -1;

const FLIGHTS: readonly Flight[] = [
  { label: 'hold through takeoff', held: THROUGH, expect: 'pose' },
  { label: 'hold through takeoff, charged', charge: 60, held: THROUGH, expect: 'pose' },
  { label: 'tap', held: (airSteps) => airSteps === -1, expect: 'none' },
  { label: 'released before the dwell', held: (airSteps) => airSteps < 8, expect: 'none' },
  { label: 'spin left, held', spinAt: 4, steer: -1, held: THROUGH, expect: 'pose' },
  { label: 'spin right, held', spinAt: 4, steer: 1, held: THROUGH, expect: 'pose' },
  { label: 'spin tap', spinAt: 4, steer: 1, held: (airSteps) => airSteps === -1 || airSteps === 4, expect: 'none' },
  { label: 'release at the apex', held: (airSteps, rising) => airSteps === -1 || rising, expect: 'pose' },
  { label: 'hold through landing', held: THROUGH, after: 60, expect: 'pose' },
  { label: 'carve left hop', steer: -0.5, straight: 300, held: NEVER_LANDED, expect: 'pose' },
  { label: 'carve right hop', steer: 0.5, straight: 300, held: NEVER_LANDED, expect: 'pose' },
  { label: 'fakie hop', fakie: true, throttle: -1, held: THROUGH, expect: 'pose' },
];

/** The three flights ridden on the hop slider's ceiling. */
const BIG_AIR: readonly Flight[] = [
  { label: 'big air, re-hold descending', held: (airSteps, rising) => airSteps >= 0 && !rising, expect: 'pose' },
  { label: 'big air, release at the apex', held: (airSteps, rising) => airSteps === -1 || rising, expect: 'pose' },
  { label: 'big air, charged hold-through', charge: 60, held: THROUGH, expect: 'pose' },
];

/**
 * A graded road, for the flights the park gives and the flat cannot — M36
 * Phase 6's review (p3-review, 2026-09-11): the pose composes with the slope
 * lean (`torsoPitch` gains `slopeLean` on a grade, the one pelvis-frame term a
 * flat ride can never reach) and the projection it returns on reads the
 * ground under the wheel *now*. An 8 % climb, which Switchback Park's steepest
 * faces exceed only over their kickers, and a 3 % descent, which is the
 * steepest grade a held plain hop still poses on at the governed speed: the
 * controller's `secondsToTouchdown` does not know the ground is falling away
 * beneath a flight, so on a 5 % descent at 20 m/s (7 % at 15, 10 % at 12) the
 * readable window is refused for the whole flight and nothing is drawn to
 * measure. That limit is the controller's and is recorded in the review; the
 * ride here stays on the grade where the gesture shows.
 */
const SLOPES = buildLevelPlan(
  [
    { id: 'lead', length: 60, halfWidth: 12, surface: 'pavement', shoulder: 2 },
    { id: 'climb', length: 300, climb: Math.tan(0.08) * 300, linearClimb: true, halfWidth: 12, surface: 'pavement', shoulder: 2 },
    { id: 'crest', length: 60, halfWidth: 12, surface: 'pavement', shoulder: 2 },
    { id: 'descent', length: 600, climb: -Math.tan(0.03) * 600, linearClimb: true, halfWidth: 12, surface: 'pavement', shoulder: 2 },
    { id: 'run-out', length: 600, halfWidth: 12, surface: 'pavement', shoulder: 2 },
  ],
  {
    id: 'one-foot-slopes',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' },
    spacing: 4,
  },
);

/** The graded flights: on the climb and on the descent, plain and charged. */
const SLOPE_FLIGHTS: readonly Flight[] = [
  { label: 'climb hop (8 %)', untilZ: 150, held: THROUGH, expect: 'pose' },
  { label: 'climb hop (8 %), charged', untilZ: 240, charge: 60, held: THROUGH, expect: 'pose' },
  { label: 'descent hop (3 %)', untilZ: 600, held: THROUGH, expect: 'pose' },
  { label: 'descent hop (3 %), charged', untilZ: 800, charge: 60, held: THROUGH, expect: 'pose' },
];

/** The Drunkard's phase ladder: six held hops after straights of coprime lengths. */
const SWAY_RUNGS: readonly Flight[] = Array.from({ length: 6 }, (_, rung) => ({
  label: `sway rung ${rung}`,
  straight: 181 + rung * 97,
  held: THROUGH,
  expect: 'pose' as const,
}));

/** Distance measures, each a lower-bound-first probe like the can's above. */
class Probes {
  private readonly point = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private readonly toThigh = new THREE.Matrix4();
  private readonly toPad = new THREE.Matrix4();
  private readonly hand: THREE.Mesh | null;
  private readonly leftThigh: THREE.Mesh | null;
  private readonly pads: { mesh: THREE.Mesh; box: THREE.Box3; local: THREE.Vector3[] }[] = [];
  private readonly thighs: THREE.Mesh[] = [];
  private readonly legs: { mesh: THREE.Mesh; side: number }[] = [];
  private readonly pelvis: THREE.Object3D;
  private readonly domeApexY: number;
  private readonly seatHem: number;
  private readonly look: RiderLook;

  constructor(rig: RidingRig, look: RiderLook) {
    this.look = look;
    const root = rig.rider.root;
    this.pelvis = rig.rider.pelvis;
    for (const name of ['left', 'right']) {
      const hip = root.getObjectByName(`rider-hip-${name}`)!;
      const knee = root.getObjectByName(`rider-knee-${name}`)!;
      const thigh = hip.children.find((c) => (c as THREE.Mesh).isMesh === true && c.name === '') as THREE.Mesh;
      const shin = knee.children.find((c) => (c as THREE.Mesh).isMesh === true && c.name === '') as THREE.Mesh;
      assert.ok(thigh && shin, `${look.id}: no limb mesh under rider-${name}`);
      this.thighs.push(thigh);
      this.legs.push({ mesh: thigh, side: name === 'left' ? 1 : -1 });
      this.legs.push({ mesh: shin, side: name === 'left' ? 1 : -1 });
    }
    this.hand = look === DRUNKARD_LOOK ? (root.getObjectByName('rider-hand-left') as THREE.Mesh) : null;
    this.leftThigh = this.thighs[0]!;
    if (look === DRUNKARD_LOOK) {
      assert.ok(this.hand, 'the left hand is missing');
      assert.ok(
        this.hand.geometry.getAttribute('position').count > DRUNKARD_GLOVE_VERTICES + 100,
        'the left hand carries no can',
      );
      for (const side of ['left', 'right']) {
        const mesh = rig.euc.group.getObjectByName(`euc-pad-${side}`) as THREE.Mesh;
        assert.ok(mesh, `the ${side} pad is missing`);
        mesh.geometry.computeBoundingBox();
        const local: THREE.Vector3[] = [];
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i += 1) local.push(new THREE.Vector3().fromBufferAttribute(p, i));
        this.pads.push({ mesh, box: mesh.geometry.boundingBox!.clone(), local });
      }
    }
    const thigh = look.profiles.thigh;
    this.domeApexY = thigh[thigh.length - 1]!.y;
    this.seatHem = look.profiles.seat[0]!.y;
  }

  /** The can's two distances, metres — this file's own measure. */
  can(): { thigh: number; pad: number } {
    const hand = this.hand!;
    const positions = hand.geometry.getAttribute('position');
    this.toThigh.copy(this.leftThigh!.matrixWorld).invert().multiply(hand.matrixWorld);
    let thighGap = Infinity;
    for (let v = DRUNKARD_GLOVE_VERTICES; v < positions.count; v += 1) {
      this.point.fromBufferAttribute(positions, v).applyMatrix4(this.toThigh);
      if (this.point.y > 0.02 || this.point.y < -RIDER_BLOCKOUT.thighLength - 0.05) continue;
      thighGap = Math.min(thighGap, -depthInside(DRUNKARD_LOOK.profiles.thigh, this.point));
    }
    let padGap = Infinity;
    for (const pad of this.pads) {
      this.toPad.copy(pad.mesh.matrixWorld).invert().multiply(hand.matrixWorld);
      for (let v = DRUNKARD_GLOVE_VERTICES; v < positions.count; v += 1) {
        this.point.fromBufferAttribute(positions, v).applyMatrix4(this.toPad);
        pad.box.clampPoint(this.point, this.probe);
        if (this.point.distanceTo(this.probe) >= padGap) continue;
        for (const q of pad.local) padGap = Math.min(padGap, this.point.distanceTo(q));
      }
    }
    return { thigh: thighGap, pad: padGap };
  }

  /** The lowest hip-dome apex vertex above the seat's hem, metres, in the pelvis frame. */
  dome(): number {
    let lowest = Infinity;
    for (const mesh of this.thighs) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        if (positions.getY(i) < this.domeApexY - 1e-6) continue;
        mesh.localToWorld(this.point.fromBufferAttribute(positions, i));
        this.pelvis.worldToLocal(this.point);
        lowest = Math.min(lowest, this.point.y - this.seatHem);
      }
    }
    return lowest;
  }

  /**
   * The stance file's `measure`: both legs in the torso garment's zone, in
   * the pelvis frame — the least depth inside, and the highest vertex outside.
   */
  skirt(zoneTop = 0.10): { radial: number; highestOutside: number; points: number } {
    const profile = this.look.profiles.torso;
    const hem = profile[0]!.y;
    let radial = Infinity;
    let highestOutside = -Infinity;
    let points = 0;
    for (const { mesh } of this.legs) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        mesh.localToWorld(this.point.fromBufferAttribute(positions, i));
        this.pelvis.worldToLocal(this.point);
        if (this.point.y < hem + 0.003 || this.point.y > zoneTop) continue;
        points += 1;
        const depth = depthInside(profile, this.point);
        radial = Math.min(radial, depth);
        if (depth < 0) highestOutside = Math.max(highestOutside, this.point.y);
      }
    }
    return { radial, highestOutside, points };
  }

  /** Seal's band, tail and knot — the stance file's three readings. */
  band(): { inside: number; clear: number; banded: number } {
    const bandTop = SEAL_GARMENT_BAND[SEAL_GARMENT_BAND.length - 1]!.y;
    let inside = Infinity;
    let clear = -Infinity;
    let banded = 0;
    for (const { mesh } of this.legs) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        mesh.localToWorld(this.point.fromBufferAttribute(positions, i));
        this.pelvis.worldToLocal(this.point);
        if (this.point.y >= SEAL_GARMENT_VISIBLE_BOTTOM && this.point.y <= bandTop) {
          banded += 1;
          inside = Math.min(inside, depthInside(SEAL_GARMENT_BAND, this.point));
        }
        for (const profile of [SEAL_GARMENT_TAIL, SEAL_GARMENT_KNOT[0]!, SEAL_GARMENT_KNOT[1]!]) {
          if (this.point.y < profile[0]!.y || this.point.y > profile[profile.length - 1]!.y) continue;
          clear = Math.max(clear, depthInside(profile, this.point));
        }
      }
    }
    return { inside, clear, banded };
  }

  /** The released leg alone against the torso section — the stance file's selection metric. */
  releasedLegFit(side: number): { radial: number; points: number } {
    const profile = this.look.profiles.torso;
    const hem = profile[0]!.y;
    let radial = Infinity;
    let points = 0;
    for (const { mesh, side: legSide } of this.legs) {
      if (legSide !== Math.sign(side)) continue;
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        mesh.localToWorld(this.point.fromBufferAttribute(positions, i));
        this.pelvis.worldToLocal(this.point);
        if (this.point.y < hem + 0.003 || this.point.y > 0.10) continue;
        points += 1;
        radial = Math.min(radial, depthInside(profile, this.point));
      }
    }
    return { radial, points };
  }
}

/** Worst readings for one rig, and where each was found. */
interface Worst {
  canThigh: number; canPad: number; dome: number;
  skirtHeld: number; bandHeld: number; bandClear: number;
  cost: number;
  /**
   * What the gesture itself adds, on gestured steps: the same step posed with
   * the foot out and on its pedal, subtracted. Metres of clearance *spent* —
   * positive is nearer, the sign a rider would read.
   */
  spent: { can: number; dome: number; skirtEscape: number; skirtRadial: number; band: number; bandClear: number };
  where: Record<string, string>;
}

function freshWorst(): Worst {
  return {
    canThigh: Infinity, canPad: Infinity, dome: Infinity,
    skirtHeld: Infinity, bandHeld: Infinity, bandClear: -Infinity, cost: Infinity,
    spent: { can: -Infinity, dome: -Infinity, skirtEscape: -Infinity, skirtRadial: -Infinity, band: -Infinity, bandClear: -Infinity },
    where: {},
  };
}

/** Every probe this look carries, read off the rig as it stands. */
interface Reading {
  can: { thigh: number; pad: number } | null;
  dome: number | null;
  skirt: { radial: number; highestOutside: number; points: number } | null;
  escape: { radial: number; highestOutside: number; points: number } | null;
  band: { inside: number; clear: number; banded: number } | null;
  released: { radial: number; points: number };
}

/**
 * Ride every flight in `flights` on one controller, posing the rig with the
 * gesture the state machine produces, and measure every posed step.
 */
function rideFlights(
  look: RiderLook,
  rig: RidingRig,
  probes: Probes,
  tuning: Partial<EucTuning>,
  flights: readonly Flight[],
  worst: Worst,
  counts: { sampled: number; gestured: number },
  label: string,
  plan: LevelPlan = PLAN,
): void {
  const euc = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn, tuning });
  if (look === DRUNKARD_LOOK) euc.setRideStyle(DRUNK_STYLE);
  const state: OneFootPoseState = createOneFootPose();
  const side = state.side;
  const pose = createPose();
  const actions = { ...NEUTRAL_ACTIONS } as { -readonly [K in keyof ActionSnapshot]: ActionSnapshot[K] };

  const describe = (flight: Flight): string => (
    `${label}, ${flight.label}: speed ${pose.speed.toFixed(1)} m/s, roll ${pose.rollAngle.toFixed(3)}, `
    + `riderRoll ${pose.riderRoll.toFixed(3)}, crouch ${pose.crouch.toFixed(2)}, air ${pose.airHeight.toFixed(2)} m, `
    + `oneFoot ${state.oneFoot.toFixed(2)} (${state.state}), sway ${pose.styleSway.toFixed(3)}, `
    + `reverse ${pose.reverseBlend.toFixed(2)}`
  );

  const read = (): Reading => ({
    can: look === DRUNKARD_LOOK ? probes.can() : null,
    dome: DOME_LOOKS.includes(look) ? probes.dome() : null,
    skirt: look === TROLLINA_LOOK ? probes.skirt() : null,
    escape: look === TROLLINA_LOOK ? probes.skirt(TROLLINA_BODICE) : null,
    band: look === SEAL_ON_A_WHEEL_LOOK ? probes.band() : null,
    released: probes.releasedLegFit(side),
  });

  const posed = (amount: number): void => {
    rig.setTrickPose(amount, side);
    rig.apply(pose);
    rig.group.updateMatrixWorld(true);
  };

  const noteSpent = (key: keyof Worst['spent'], spent: number, flight: Flight, detail = ''): void => {
    if (spent > worst.spent[key]) { worst.spent[key] = spent; worst.where[`spent.${key}`] = describe(flight) + detail; }
  };
  const mm = (m: number): string => `${(m * 1000).toFixed(1)} mm`;

  const measure = (flight: Flight): void => {
    if (pose.crashBlend > 0) return;
    // The gesture first, exactly as the frame draws it.
    posed(state.oneFoot);
    counts.sampled += 1;
    const swung = read();

    // -- The floors, at the tiers the stance file certifies them at ---------
    if (swung.can) {
      if (swung.can.thigh < worst.canThigh) { worst.canThigh = swung.can.thigh; worst.where.canThigh = describe(flight); }
      if (swung.can.pad < worst.canPad) { worst.canPad = swung.can.pad; worst.where.canPad = describe(flight); }
    }
    if (swung.dome !== null && swung.dome < worst.dome) { worst.dome = swung.dome; worst.where.dome = describe(flight); }
    const held = pose.crouch < 0.02 && pose.tuck < 0.02 && pose.attack < 0.02
      && pose.carveStance < 0.02 && pose.reverseBlend < 0.02;
    if (held && swung.skirt && swung.skirt.points > 0 && swung.skirt.radial < worst.skirtHeld) {
      worst.skirtHeld = swung.skirt.radial; worst.where.skirtHeld = describe(flight);
    }
    if (held && swung.band) {
      if (swung.band.clear > worst.bandClear) { worst.bandClear = swung.band.clear; worst.where.bandClear = describe(flight); }
      if (swung.band.banded > 0 && swung.band.inside < worst.bandHeld) { worst.bandHeld = swung.band.inside; worst.where.bandHeld = describe(flight); }
    }
    if (state.oneFoot <= 0) return;

    // -- What the gesture itself spends, on the steps it is out --------------
    //
    // The same step with the foot on its pedal, subtracted. Two solves on the
    // gestured steps only, and the rig is left posed with the gesture, as the
    // frame leaves it. This is the reading that isolates §36.5's question —
    // does the pose spend clearance the look already has — from the folds the
    // launch and the landing put the rider through with or without it.
    counts.gestured += 1;
    posed(0);
    const still = read();
    posed(state.oneFoot);
    if (swung.released.points > 0 && still.released.points > 0) {
      const cost = swung.released.radial - still.released.radial;
      if (cost < worst.cost) { worst.cost = cost; worst.where.cost = describe(flight); }
    }
    if (swung.can && still.can) noteSpent('can', still.can.thigh - swung.can.thigh, flight);
    if (swung.dome !== null && still.dome !== null) noteSpent('dome', still.dome - swung.dome, flight);
    if (swung.skirt && still.skirt && swung.skirt.points > 0 && still.skirt.points > 0) {
      noteSpent('skirtRadial', still.skirt.radial - swung.skirt.radial, flight);
    }
    if (swung.escape && still.escape) {
      // An escape the gesture *creates* is infinite; one it merely keeps is 0.
      const withOut = swung.escape.highestOutside;
      const without = still.escape.highestOutside;
      const spent = withOut === -Infinity ? -Infinity : (without === -Infinity ? Infinity : withOut - without);
      noteSpent('skirtEscape', spent, flight);
    }
    if (swung.band && still.band) {
      if (swung.band.banded > 0 && still.band.banded > 0) {
        noteSpent('band', still.band.inside - swung.band.inside, flight,
          `; band inside ${mm(swung.band.inside)} with the gesture, ${mm(still.band.inside)} without`);
      }
      noteSpent('bandClear', swung.band.clear - still.band.clear, flight,
        `; tail/knot ${mm(-swung.band.clear)} clear with the gesture, ${mm(-still.band.clear)} without`);
    }
  };

  const step = (flight: Flight, input: Partial<ActionSnapshot>, held: boolean): void => {
    actions.steer = input.steer ?? 0;
    actions.crouch = input.crouch === true;
    actions.hop = input.hop === true;
    actions.throttle = input.throttle ?? (euc.overspeed > 0.8 ? 0 : 1);
    actions.hopHeld = held;
    euc.step(STEP, actions);
    euc.writePose(pose);
    stepOneFootFromController(state, euc, pose.recoverBlend, STEP, held, false);
    measure(flight);
  };

  for (const flight of flights) {
    // The settle — or, for a fakie, the brake to a stop and the reverse.
    if (flight.fakie) {
      for (let i = 0; i < 960; i += 1) step(flight, { throttle: -1 }, false);
      assert.ok(pose.reverseBlend > 0.9, `${label}, ${flight.label}: the reverse never engaged (${pose.reverseBlend.toFixed(2)})`);
    } else if (flight.untilZ !== undefined) {
      let guard = 0;
      while (pose.z < flight.untilZ && guard < 8000) { step(flight, { steer: 0 }, false); guard += 1; }
      assert.ok(pose.z >= flight.untilZ, `${label}, ${flight.label}: never reached z ${flight.untilZ} (at ${pose.z.toFixed(0)})`);
    } else {
      for (let i = 0; i < (flight.straight ?? 240); i += 1) step(flight, { steer: flight.steer ?? 0 }, false);
    }
    for (let i = 0; i < (flight.charge ?? 0); i += 1) {
      step(flight, { crouch: true, steer: flight.steer ?? 0, throttle: flight.throttle }, flight.held(-1, false, false));
    }
    let airSteps = -1;
    let took = false;
    let landed = false;
    let pressed = false;
    let spun = false;
    let peak = 0;
    let groundedAfter = 0;
    let groundedDrawn = 0;
    for (let i = 0; i < 500; i += 1) {
      const rising = euc.verticalRate > 0;
      const hop = !pressed || (flight.spinAt !== undefined && !spun && airSteps === flight.spinAt);
      if (hop && pressed) spun = true;
      pressed = true;
      step(flight, {
        steer: flight.steer ?? 0,
        hop,
        crouch: (flight.charge ?? 0) > 0 && i < 2,
        throttle: flight.throttle,
      }, flight.held(airSteps, rising, landed));
      if (euc.tookOff) { took = true; airSteps = 0; }
      else if (airSteps >= 0) airSteps += 1;
      if (took && euc.touchedDown) landed = true;
      peak = Math.max(peak, state.oneFoot);
      if (landed) {
        groundedAfter += 1;
        if (state.oneFoot > 0) groundedDrawn += 1;
        if (groundedAfter >= (flight.after ?? 30)) break;
      }
    }
    assert.ok(took && landed, `${label}, ${flight.label}: the hop did not fly and land`);
    if (flight.spinAt !== undefined) assert.ok(euc.spinCompleted, `${label}, ${flight.label}: the 180 did not complete`);
    if (flight.expect === 'pose') {
      assert.ok(peak >= 0.999, `${label}, ${flight.label}: the pose peaked at ${peak.toFixed(3)} — the ride did not ride the gesture`);
    } else {
      assert.equal(peak, 0, `${label}, ${flight.label}: a foot was drawn (${peak.toFixed(3)})`);
    }
    // On the ground after a held landing, both boots are down within the
    // abort return: at most the abort's own steps may still be easing.
    assert.ok(
      groundedDrawn <= 7,
      `${label}, ${flight.label}: a foot was drawn on ${groundedDrawn} grounded steps after landing`,
    );
    if (flight.after !== undefined) {
      assert.equal(state.oneFoot, 0, `${label}, ${flight.label}: still ${state.oneFoot.toFixed(3)} out on the ground`);
    }
    // Forward again after a fakie, so the next flight is an ordinary one.
    if (flight.fakie) for (let i = 0; i < 360; i += 1) step(flight, { throttle: 1 }, false);
  }
}

test('the one-foot air gesture is ridden on every look and the cop, and every floor holds', () => {
  const counts = { sampled: 0, gestured: 0 };
  const records: Array<{ id: string; worst: Worst }> = [];
  const bigAir: Partial<EucTuning> = {
    hopLaunchSpeed: ((): number => {
      const spec = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.hopLaunchSpeed');
      assert.ok(spec, "the F4 panel has no 'EUC.hopLaunchSpeed' slider to ride at");
      return spec.max;
    })(),
  };
  const eighty = ((): Partial<EucTuning> => {
    const preset = topSpeedPreset(80);
    return {
      dragCoefficient: preset.dragCoefficient,
      powerComfortSpeed: preset.powerComfortSpeed,
      powerLimitSpeed: preset.powerLimitSpeed,
    };
  })();

  for (const look of RIDER_LOOKS) {
    const rig = rigFor(look);
    try {
      const probes = new Probes(rig, look);
      const worst = freshWorst();
      rideFlights(look, rig, probes, {}, FLIGHTS, worst, counts, `${look.id}, shipped`);
      rideFlights(look, rig, probes, bigAir, BIG_AIR, worst, counts, `${look.id}, big air`);
      rideFlights(look, rig, probes, {}, SLOPE_FLIGHTS, worst, counts, `${look.id}, graded`, SLOPES);
      if (look === DRUNKARD_LOOK) {
        rideFlights(look, rig, probes, {}, SWAY_RUNGS, worst, counts, `${look.id}, shipped, ladder`);
        rideFlights(look, rig, probes, eighty, FLIGHTS, worst, counts, `${look.id}, 80 mph`);
        rideFlights(look, rig, probes, { ...eighty, ...bigAir }, BIG_AIR, worst, counts, `${look.id}, 80 mph big air`);
        rideFlights(look, rig, probes, eighty, SWAY_RUNGS, worst, counts, `${look.id}, 80 mph, ladder`);
      }
      records.push({ id: look.id, worst });

      const mm = (m: number): string => (Number.isFinite(m) ? `${(m * 1000).toFixed(1)} mm` : 'none');
      const parts = [`cost ${mm(worst.cost)}`];
      const spent: string[] = [];
      if (look === DRUNKARD_LOOK) {
        parts.push(`can↔thigh ${mm(worst.canThigh)}`, `can↔pads ${mm(worst.canPad)}`);
        spent.push(`can ${mm(worst.spent.can)}`);
      }
      if (DOME_LOOKS.includes(look)) { parts.push(`dome ${mm(worst.dome)} above hem`); spent.push(`dome ${mm(worst.spent.dome)}`); }
      if (look === TROLLINA_LOOK) {
        parts.push(`skirt held ${mm(worst.skirtHeld)} inside`);
        spent.push(`skirt ${mm(worst.spent.skirtRadial)}`, `escape ${mm(worst.spent.skirtEscape)}`);
      }
      if (look === SEAL_ON_A_WHEEL_LOOK) {
        parts.push(`band held ${mm(worst.bandHeld)} inside`, `tail/knot ${mm(-worst.bandClear)} clear`);
        spent.push(`band ${mm(worst.spent.band)}`, `tail/knot ${mm(worst.spent.bandClear)}`);
      }
      console.log(`  ${look.id}: ${parts.join(', ')}${spent.length > 0 ? ` — the gesture spends ${spent.join(', ')}` : ''}`);
      if (look === SEAL_ON_A_WHEEL_LOOK) console.log(`    band spend at: ${worst.where['spent.band']}`);

      // **The sweep measures.** A rig never told the gesture would read a
      // cost of exactly zero on every look and pass every floor above by
      // never posing anything; the released leg moves measurably on every
      // rig ridden here (2.6 mm on Cool Rider is the least of the ten).
      assert.ok(
        worst.cost <= -0.001,
        `${look.id}: the gesture moved the released leg by only ${mm(-worst.cost)} — the rig is not being told the pose`,
      );

      // -- The floors, at the tiers the stance file certifies them at ---------
      if (look === DRUNKARD_LOOK) {
        assert.ok(worst.canThigh >= 0.040, `the can came within ${mm(worst.canThigh)} of his thigh (40 mm required) — ${worst.where.canThigh}`);
        assert.ok(worst.canPad >= 0.080, `the can came within ${mm(worst.canPad)} of a pad (80 mm required) — ${worst.where.canPad}`);
      }
      if (DOME_LOOKS.includes(look)) {
        assert.ok(worst.dome >= 0.020, `${look.id}: the hip dome's apex comes down to ${mm(worst.dome)} above the hem (20 mm required) — ${worst.where.dome}`);
      }
      if (look === TROLLINA_LOOK) {
        assert.ok(worst.skirtHeld >= 0.003, `held, a leg comes within ${mm(worst.skirtHeld)} of the skirt surface (3 mm required) — ${worst.where.skirtHeld}`);
      }
      if (look === SEAL_ON_A_WHEEL_LOOK) {
        assert.ok(worst.bandClear <= -0.008, `held, a leg reaches ${mm(-worst.bandClear)} of the tail or knot (8 mm clear required) — ${worst.where.bandClear}`);
        assert.ok(worst.bandHeld >= 0.004, `held, a leg comes within ${mm(worst.bandHeld)} of the band's surface (4 mm inside required) — ${worst.where.bandHeld}`);
      }

      // -- What the gesture spends, pinned at what it reads ------------------
      //
      // Records in `CAN_BANDS`'s shape — rounded away from the reading, never
      // margins. The trailing gesture leaves the thigh where it was (the
      // stance file's reason for redirecting it), and the readings say so:
      // the can and every hip dome spend **0.0 mm** ridden (the released foot
      // is the right one and the can hangs off the left thigh; a dome sits on
      // the joint but the gesture's flexion does not lower its apex against
      // the hem). The one garment that reads a spend is Seal's band, **15.9 mm
      // at the fold tier** — a charged big-air flight with the air tuck still
      // at 0.33, where the constructed contract asserts nothing and the
      // structural tier (`DESIGN.md` §7g, one black below the garment) is the
      // answer; at the held tier the ridden band reads 31.2 mm inside against
      // its 4 mm floor. If a reading moves, the lever is the gesture in
      // `data/tuning.ts` (the outboard term is the sensitive one), never these.
      if (look === DRUNKARD_LOOK) assert.ok(worst.spent.can <= 0.001, `the gesture moved the can ${mm(worst.spent.can)} nearer his thigh — ${worst.where['spent.can']}`);
      if (look === TROLLINA_LOOK) {
        // The radial spend is the `cost` reading on both legs and is pinned
        // there against the constructed record; what is pinned here is that
        // the gesture never *creates* an escape above the hem nor lifts one.
        assert.ok(worst.spent.skirtEscape <= 0.002, `the gesture lifts a leg's escape ${mm(worst.spent.skirtEscape)} higher above the hem — ${worst.where['spent.skirtEscape']}`);
      }
      if (look === SEAL_ON_A_WHEEL_LOOK) {
        assert.ok(worst.spent.band <= 0.020, `the gesture brings a leg ${mm(worst.spent.band)} nearer the band's surface (20 mm is the record) — ${worst.where['spent.band']}`);
        assert.ok(worst.spent.bandClear <= 0.005, `the gesture brings a leg ${mm(worst.spent.bandClear)} nearer the tail or knot — ${worst.where['spent.bandClear']}`);
      }
      if (DOME_LOOKS.includes(look)) {
        assert.ok(worst.spent.dome <= 0.005, `${look.id}: the gesture brings the dome's apex ${mm(worst.spent.dome)} nearer the hem — ${worst.where['spent.dome']}`);
      }
      const record = GESTURE_COST.get(look.id);
      assert.ok(record !== undefined, `${look.id} has no pinned gesture cost — a new look must be measured`);
      assert.ok(
        worst.cost >= record,
        `${look.id}: ridden, the gesture brings the leg ${mm(-worst.cost)} nearer its garment; `
          + `the constructed sweep certified ${mm(-record)} — ${worst.where.cost}`,
      );
    } finally {
      rig.dispose();
    }
  }

  console.log(`  ${counts.sampled.toLocaleString('en-GB')} posed steps measured, ${counts.gestured.toLocaleString('en-GB')} with the foot off its pedal`);
  assert.equal(records.length, RIDER_LOOKS.length, 'a look went unridden');
  assert.ok(counts.sampled > 60_000, `only ${counts.sampled} steps were posed and measured`);
  assert.ok(counts.gestured > 3_000, `only ${counts.gestured} steps carried the gesture`);
});
