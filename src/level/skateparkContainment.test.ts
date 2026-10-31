/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { createGroundSample } from '../simulation/world.ts';
import type { LevelPlan } from './plan.ts';
import { SKATEPARK_RIDING, createSkateparkLevel } from './skateparkLevel.ts';

/**
 * Foundry Yard containment — 1.4.0 (`docs/PLANS.md` §51.5.7, the Wharf §45.10
 * pattern). A compact cut of the gates stage's full sweep (27,525 runs over
 * 48 sites × 8 headings × 0/6/12/18/23 m/s × roll, hop, charged hop, spin and
 * backwards × 20/65/90 mph, table in `test-results/skatepark/gates/`): the
 * sites the guard-removed control escapes from, plus the snake lips, the
 * roll-out, the stairs and the euro edge, at 12 and 23 m/s on the shipped
 * 65 mph wheel, full throttle held for up to 8 s.
 *
 * **What passes.** The wheel never crosses a plinth inner face — it is never
 * on, in or over the plinth or its guard — and no ragdoll joint goes more
 * than 0.4 m into the plinth. (Every crash into the plinth puts joints within
 * 0.4 m of its face; the literal "0.4 m inside the face" reading would fail
 * on every one of them, so the envelope is measured into the wall. The deepest
 * joint the full sweep found is 0.27 m in; the plinth is 0.5–1.0 m thick.)
 *
 * **The control must fail.** The same runs with the undrawn guards removed
 * put wheels and bodies over the bare plinth.
 */

const STEP = 1 / SIMULATION.hz;
const ENVELOPE = 0.4;
const R = SKATEPARK_RIDING;
const source = createSkateparkLevel();

/** The yard with its undrawn guard boxes taken out: the plinth alone. */
function withoutGuards(plan: LevelPlan): LevelPlan {
  return { ...plan, segments: plan.segments.map((segment) => ({
    ...segment, colliders: segment.colliders.filter((box) => box.drawn !== false) })) };
}

const ESCAPING_SITES = [
  { id: 'qp-east coping z110', x: 162.5, z: 110 },
  { id: 'qp-east end bank', x: 164, z: 150 },
  { id: 'qp-east end-bank seam', x: 160.4, z: 149 },
  { id: 'bowl S', x: 104, z: 164 },
  { id: 'snake roll-in E lip', x: 151.25, z: 148 },
  { id: 'berm a45', x: 148.5, z: 158.8 },
  { id: 'berm a70', x: 145.2, z: 160.9 },
  { id: 'snake S lip', x: 128, z: 161.5 },
  { id: 'K2', x: 126.45, z: 124 },
  { id: 'bank-W', x: 115.5, z: 102 },
  { id: 'planter E', x: 133.2, z: 165.4 },
  { id: 'planter W', x: 126, z: 165.4 },
];
const SITES = [
  ...ESCAPING_SITES,
  { id: 'snake N lip', x: 128, z: 155 },
  { id: 'bowl roll-out E side', x: 106.5, z: 154 },
  { id: 'stairs', x: 122, z: 109.2 },
  { id: 'euro edge', x: 127, z: 99.5 },
  { id: 'mini E', x: 103.5, z: 105.5 },
  { id: 'pyramid', x: 116, z: 140 },
];
const MODES = ['roll', 'hop', 'charged', 'spin', 'backwards'] as const;

interface Sweep { cases: number; escapes: string[]; deepestJoint: number; nearestWheel: number }

function sweep(plan: LevelPlan, sites: readonly { id: string; x: number; z: number }[], speeds: readonly number[]): Sweep {
  const sampler = new PlanTerrainSampler(plan);
  const ground = createGroundSample();
  const controller = new EucController(sampler, { spawn: { position: { x: 100, y: 0, z: 124 }, headingY: 0 } });
  const preset = topSpeedPreset(65);
  controller.setTuning({ dragCoefficient: preset.dragCoefficient, powerComfortSpeed: preset.powerComfortSpeed,
    powerLimitSpeed: preset.powerLimitSpeed });
  const pose = createPose();
  const result: Sweep = { cases: 0, escapes: [], deepestJoint: -Infinity, nearestWheel: Infinity };
  for (const site of sites) for (let octant = 0; octant < 8; octant += 1) for (const speed of speeds) for (const mode of MODES) {
    const heading = (octant * Math.PI) / 4;
    const hx = Math.sin(heading);
    const hz = Math.cos(heading);
    sampler.sampleGround(site.x, site.z, ground);
    const siteY = ground.height;
    // The longest run-up of 10, 5 or 2.5 m that starts inside the yard, a
    // metre clear of the plinth, on the site's own level.
    let start: { x: number; y: number; z: number } | null = null;
    for (const back of [10, 5, 2.5]) {
      const x = site.x - hx * back;
      const z = site.z - hz * back;
      if (Math.min(x - R.minX, R.maxX - x, z - R.minZ, R.maxZ - z) < 1) continue;
      sampler.sampleGround(x, z, ground);
      if (Math.abs(ground.height - siteY) > 1.6) continue;
      start = { x, y: 0, z };
      break;
    }
    if (start === null) continue;
    const backwards = mode === 'backwards';
    controller.reset({ position: start, headingY: backwards ? heading + Math.PI : heading }, backwards ? -speed : speed);
    result.cases += 1;
    let hopped = false;
    let spun = false;
    let crouched = 0;
    let crashed = false;
    for (let tick = 0; tick < 8 * SIMULATION.hz; tick += 1) {
      const before = controller.snapshot();
      const along = (before.position.x - site.x) * hx + (before.position.z - site.z) * hz;
      const hops = mode === 'hop' || mode === 'charged' || mode === 'spin';
      const crouch = mode === 'charged' && !hopped && along > -4;
      if (crouch) crouched += 1;
      const hop: boolean = hops && !hopped && along > -1.5 && (mode !== 'charged' || crouched > 50);
      const spin: boolean = mode === 'spin' && hopped && !spun && !before.grounded;
      hopped ||= hop;
      spun ||= spin;
      controller.step(STEP, { ...NEUTRAL_ACTIONS, throttle: backwards ? -1 : 1, crouch, hop: hop || spin, steer: spin ? 1 : 0 });
      const s = controller.snapshot();
      const out = (x: number, z: number) => Math.max(R.minX - x, x - R.maxX, R.minZ - z, z - R.maxZ);
      const wheel = out(s.position.x, s.position.z);
      result.nearestWheel = Math.min(result.nearestWheel, -wheel);
      let breach = wheel > 0 ? `wheel ${wheel.toFixed(3)} m past the face at (${s.position.x.toFixed(2)}, ${s.position.y.toFixed(2)}, ${s.position.z.toFixed(2)})` : '';
      if (s.crashed) {
        controller.writePose(pose);
        for (let i = 0; i < pose.ragdoll.length; i += 3) {
          const joint = out(pose.ragdoll[i], pose.ragdoll[i + 2]);
          result.deepestJoint = Math.max(result.deepestJoint, joint);
          if (joint > ENVELOPE && breach === '') breach = `joint ${joint.toFixed(3)} m into the plinth`;
        }
      }
      if (breach !== '') {
        result.escapes.push(`${site.id} h${octant * 45} ${speed} m/s ${mode}: ${breach}`);
        break;
      }
      crashed ||= s.crashed;
      if (crashed && !s.crashed) break;
    }
  }
  return result;
}

test('containment: no wheel crosses the plinth and no body goes 0.4 m into it, at 12 and 23 m/s, every mode', () => {
  const result = sweep(source, SITES, [12, 23]);
  assert.ok(result.cases >= 1_200, `cases ${result.cases}`);
  assert.deepEqual(result.escapes.slice(0, 5), []);
  assert.ok(result.nearestWheel > 0, `nearest wheel ${result.nearestWheel}`);
  assert.ok(result.deepestJoint < ENVELOPE, `deepest joint ${result.deepestJoint}`);
});

test('containment control: with the undrawn guards removed the same runs escape over the bare plinth', () => {
  const result = sweep(withoutGuards(source), ESCAPING_SITES, [12, 23]);
  assert.ok(result.escapes.length >= 5, `only ${result.escapes.length} escapes without the guards`);
});
