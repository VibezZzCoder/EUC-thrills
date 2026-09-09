/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, EUC, SIMULATION } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { planRegroup, regroupFloor, type RegroupCandidate } from './copRegroup.ts';
import { CpuRider, type CpuView } from './cpuRider.ts';
import { createPose, EucController, type EucPose } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';

/**
 * The super tracker's landing, ridden — Codex's M31 QA.
 *
 * `copRegroup.test.ts` pins the planner's rules with scripted judges; this
 * file stands the real cop on the real judge's word and rides the first two
 * seconds, which is where the QA found him crashing. The sweep is the QA's
 * own shape — a rider at every few metres of several routes, both ways, the
 * cop returned behind them at the rider's pace — and it is ridden twice: with
 * the judge, where it must be clean, and without, where it must not be, so
 * the judge is proven to be what makes the difference rather than a change in
 * the brain that happened to land at the same time.
 *
 * The pace is the shipped wheel's top speed rather than the QA's 22 m/s: the
 * game hands the cop the rider's speed, and a rider running from him is
 * flat out.
 */

const STEP = 1 / SIMULATION.hz;
/** The seeds the sweep rides: the chase pass's measuring route and two of the pinned sweep's. */
const SEEDS = ['route-41', 'sweep-15', 'sweep-39'];
/** A rider every this many metres of route, each way. */
const EVERY_METRES = 10;
/** How long each placement is ridden, seconds — the QA's window. */
const RIDE_SECONDS = 2;

interface SweepResult {
  readonly asked: number;
  readonly placed: number;
  readonly laterRung: number;
  readonly clamped: number;
  readonly crashes: string[];
}

/** Stand the cop behind a rider at every few metres of every seed, and ride each landing out. */
function sweepLandings(judged: boolean, pace: number): SweepResult {
  let asked = 0;
  let placed = 0;
  let laterRung = 0;
  let clamped = 0;
  const crashes: string[] = [];
  const back = CHASE.trackerReturnMetres;
  const floor = regroupFloor(back, CHASE.bustRadiusMetres);

  for (const seed of SEEDS) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan);
    assert.ok(spine !== null, `${seed} has no spine`);
    const sampler = new PlanTerrainSampler(plan);
    const cop = new EucController(sampler, {
      spawn: plan.spawn,
      hazards: new HazardField(plan.hazards ?? []),
      softBodies: new SoftBodyField(plan.softBodies ?? []),
    });
    const pose: EucPose = createPose();
    const riderAt = createSpineSample();
    const view: { -readonly [K in keyof CpuView]: CpuView[K] } = {
      x: 0, y: 0, z: 0, headingY: 0, speed: 0, grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG,
    };
    const readView = (): void => {
      view.x = pose.x;
      view.y = pose.y;
      view.z = pose.z;
      view.headingY = pose.headingY;
      view.speed = pose.speed;
      view.grounded = pose.y - pose.groundY <= 1e-6;
      view.crashed = cop.crashed;
      view.curbAhead = cop.curbHeightAhead;
      view.lateralLimitG = cop.lateralLimit;
    };

    for (const direction of [1, -1] as const) {
      for (let distance = back + 5; distance < spine.length - back - 5; distance += EVERY_METRES) {
        spine.sample(distance, riderAt);
        const rider = {
          x: riderAt.x, z: riderAt.z, headingY: riderAt.headingY + (direction < 0 ? Math.PI : 0),
        };
        // A fresh brain per placement, as a regroup is a placement with no history.
        const brain = new CpuRider(spine, plan, sampler);
        asked += 1;
        const candidate: RegroupCandidate | null = planRegroup(
          spine, rider, back, floor, { at: createSpineLocation(), sample: createSpineSample() },
          judged ? (at, facing) => brain.landingAllowance(at, facing) : null,
        );
        if (candidate === null) continue;
        placed += 1;
        if (candidate.back > back) laterRung += 1;
        // Exactly `Game.regroupCop`: the rider's pace, capped by the spot.
        const entry = Math.min(candidate.entrySpeed, pace);
        if (entry < pace) clamped += 1;
        cop.reset({ position: { x: candidate.x, y: candidate.y, z: candidate.z }, headingY: candidate.headingY }, entry);
        cop.writePose(pose);
        readView();
        brain.place(view, judged ? candidate.distance : -1);
        const quarry = { x: riderAt.x, y: riderAt.y, z: riderAt.z, speed: pace };
        for (let step = 0; step < RIDE_SECONDS * SIMULATION.hz; step += 1) {
          cop.writePose(pose);
          readView();
          cop.step(STEP, brain.step(STEP, view, quarry));
          if (cop.crashed) {
            crashes.push(`${seed} ${direction > 0 ? 'fwd' : 'rev'} rider ${distance} m, cop ${candidate.distance.toFixed(0)} m `
              + `at ${entry.toFixed(1)} m/s: ${cop.snapshot().crashCause} after ${((step + 1) * STEP).toFixed(2)} s`);
            break;
          }
        }
      }
    }
  }
  return { asked, placed, laterRung, clamped, crashes };
}

test('a judged return never stands the cop in a hazard or short of a wall: the swept landings are clean', () => {
  const pace = Math.sqrt((EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)) / EUC.dragCoefficient);
  const judged = sweepLandings(true, pace);
  assert.deepEqual(judged.crashes, [],
    `${judged.crashes.length} of ${judged.placed} judged landings crashed inside ${RIDE_SECONDS} s:\n${judged.crashes.join('\n')}`);
  // And the judge is a judge, not a blanket refusal: nearly every ask is
  // placed, most on the rung asked for, and the clamp is doing real work.
  assert.ok(judged.placed >= judged.asked * 0.95,
    `the judge placed only ${judged.placed} of ${judged.asked} asks`);
  assert.ok(judged.laterRung < judged.placed * 0.25,
    `${judged.laterRung} of ${judged.placed} landings walked the ladder — the return is rarely where it says`);
  assert.ok(judged.clamped > 0, 'the entry clamp never bound at top speed, which no swept road allows');
});

test('the same sweep unjudged is not clean, which is the proof the judge is what made it so', () => {
  // The QA's finding, kept as the control: 89 of 1,997 accepted returns
  // crashed within two seconds at 22 m/s. Ridden at the shipped top speed it
  // is worse. If this ever passes clean, the judge is no longer measurable
  // here and the test above proves nothing — move the sweep to a road that
  // still bites.
  const pace = Math.sqrt((EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)) / EUC.dragCoefficient);
  const unjudged = sweepLandings(false, pace);
  assert.ok(unjudged.crashes.length >= 10,
    `only ${unjudged.crashes.length} of ${unjudged.placed} unjudged landings crashed — the control no longer discriminates`);
  assert.equal(unjudged.clamped, 0, 'an unjudged landing was clamped');
});
