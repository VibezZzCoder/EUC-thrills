/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIVE_TUNABLES, RIDER_BLOCKOUT, SIMULATION } from '../data/tuning.ts';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { DRUNKARD_GLOVE_VERTICES, DRUNKARD_LOOK } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';
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
 * magnitudes, and seven entries per magnitude: a held corner, a snap from a
 * straight line (the entry that carries a straight line's full weave into an
 * established bank — the term the old table missed), a ramped entry, **a flick
 * — the stick thrown side to side every ten ticks for three seconds** (M30
 * Phase 3b, the entry that rides every settle value between the slow-band
 * share and the full one), braking inside the corner, a corner held with the
 * crouch down, and the hop's own compression at three charge lengths, which is
 * the only way `pose.crouch` passes `EUC.crouchHeldAmount` — **and the phase
 * ladder below**, which is the axis M30 Phase 2's QA found missing. Ridden at
 * `carveLeanShareTop`'s shipped 1.0 and at the F4 slider's maximum read from
 * `LIVE_TUNABLES`, which is the share the garment contracts are bounded by;
 * since that QA the two are the same number and the list deduplicates itself.
 * Every preset rides the M30 Phase 2 grip schedule, so the hang —
 * the rider inside the wheel's saturated bank — is in every sample here
 * without this file naming it: it rides whatever the production controller
 * writes.
 *
 * **Measured minima, 2026-09-04 (M30 Phase 2's QA — the phase axis, and the
 * can's carry)** — 550,360 posed steps, the whole sweep, printed by the test:
 *
 * ```
 *   preset     can vs thigh   can vs pads      (share 1.00, the slider's max)
 *   shipped       52.7 mm       186.0 mm
 *   58 mph        42.4          185.7
 *   65 mph        42.2          186.4
 *   80 mph        41.9          178.5
 *   90 mph        42.2          181.0
 * ```
 *
 * **41.9 mm on the 80 mph wheel is the pin** — 1.9 mm of margin over the 40 mm
 * floor, and 178.5 mm against the pads' 80 mm. A finer phase ladder finds
 * 41.0 mm there (below), so the honest reserve is one millimetre.
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
 * — the same rides read 51.8 / 41.4 / 41.4 / 41.0 / 41.5 mm. Forty rungs are
 * within 0.9 mm of that everywhere and cost a minute less.
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
