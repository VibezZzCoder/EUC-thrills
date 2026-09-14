/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { EucController } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createTrickFacts } from '../simulation/trickEvents.ts';
import { trickZoneAt } from '../level/trickZones.ts';
import { createGroundSample } from '../simulation/world.ts';
import { createOneFootPose, stepOneFootFromController, oneFootQualifiedThisFlight } from '../app/oneFootPose.ts';
import { PARK_PLAN, poseAt, lapFrame, entryDistance } from './installedPark.ts';
import type { TrickRecording } from './trickRunBench.ts';

/**
 * q191: one uninterrupted ride from Trick Run's normal solo start to two
 * adjacent scoring zones. No teleports, resets, synthetic flight facts or
 * spliced travel. The tiny path is deliberately beside the physical features:
 * the current launch polygons cover their whole lateral half of the trail.
 *
 * The constants below describe this adversarial input script, not gameplay
 * tuning. Every point still comes from TrickRun. The action trace is returned
 * for replay through Game's real input/physics/scoring seam in browser QA.
 */
export function recordTrickShuttle(steps = 90 * SIMULATION.hz): {
  recording: TrickRecording;
  actions: ActionSnapshot[];
  distance: number;
  launchSpeeds: number[];
} {
  const sampler = new PlanTerrainSampler(PARK_PLAN);
  const line = PARK_PLAN.checkpoints.find((checkpoint) => checkpoint.kind === 'start')!;
  const x = line.centre.x - Math.sin(line.headingY) * CHALLENGE.startRunupMetres;
  const z = line.centre.z - Math.cos(line.headingY) * CHALLENGE.startRunupMetres;
  const ground = createGroundSample();
  sampler.sampleGround(x, z, ground);
  const spawn = { position: { x, y: ground.height, z }, headingY: line.headingY };
  const controller = new EucController(sampler, { spawn });
  const pose = createOneFootPose();
  const frame = lapFrame(['timber', 'timber-steps']);
  const base = entryDistance('timber');
  const points = PARK_PLAN.lap!.points;
  let nearest = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (Math.hypot(points[i].x - x, points[i].z - z)
      < Math.hypot(points[nearest].x - x, points[nearest].z - z)) nearest = i;
  }
  const route: { x: number; z: number }[] = [];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    if (i > nearest && length < base + 12) route.push(points[i]);
  }
  route.push(poseAt('timber', 16, 0.75).position);
  const facts: ReturnType<typeof createTrickFacts>[] = [];
  const zones: (string | null)[] = [];
  const actions: ActionSnapshot[] = [];
  const launchSpeeds: number[] = [];
  let mode: 'approach' | 'travel' | 'settle' | 'flight' = 'approach';
  let index = 0;
  let target = 16;
  let next = 13;
  let held = false;
  let spun = false;
  let launched = false;
  let wait = 0;
  const dt = 1 / SIMULATION.hz;
  for (let step = 0; step < steps; step += 1) {
    const before = controller.snapshot();
    const s = frame.progress(before.position.x, before.position.z) - base;
    let throttle = 0;
    let steer = 0;
    let hop = false;
    let spin = false;
    if (mode === 'approach') {
      while (index < route.length - 1
        && Math.hypot(route[index].x - before.position.x, route[index].z - before.position.z) < 3) index += 1;
      const p = route[index];
      const distance = Math.hypot(p.x - before.position.x, p.z - before.position.z);
      const rawError = Math.atan2(p.x - before.position.x, p.z - before.position.z) - before.headingY;
      const error = Math.atan2(Math.sin(rawError), Math.cos(rawError));
      steer = Math.max(-1, Math.min(1, -error * 1.8));
      const limit = index === route.length - 1 ? Math.min(6, Math.sqrt(Math.max(0, distance - 0.04) * 3)) : 6;
      throttle = Math.max(-1, Math.min(1, (limit - before.speed) * 2));
      if (index === route.length - 1 && distance < 0.16 && Math.abs(before.speed) < 0.2) {
        mode = 'settle'; wait = 0;
      }
    }
    if (mode === 'travel') {
      const p = poseAt('timber', target, 0.75).position;
      const along = (p.x - before.position.x) * Math.sin(before.headingY)
        + (p.z - before.position.z) * Math.cos(before.headingY);
      const desired = Math.min(2, Math.sqrt(Math.max(0, Math.abs(along) - 0.03) * 3));
      throttle = Math.max(-1, Math.min(1, (desired - before.speed) * 2));
      if (Math.abs(s - target) < 0.16 && Math.abs(before.speed) < 0.2) {
        mode = 'settle'; wait = 0;
      }
    }
    if (mode === 'settle') {
      throttle = before.speed > 0.005 ? -1 : 0;
      wait += 1;
      if (wait > 80 && Math.abs(before.speed) < 0.005 && controller.canAcceptHop) {
        mode = 'flight'; hop = true; held = true; spun = false; launched = false;
      }
    }
    if (mode === 'flight') {
      spin = !before.grounded && !spun && controller.canAcceptSpin;
      if (spin) spun = true;
    }
    const action = { ...NEUTRAL_ACTIONS, throttle, steer: spin ? -1 : steer,
      hop: hop || spin, hopHeld: held && !spin };
    actions.push(action);
    controller.step(dt, action);
    stepOneFootFromController(pose, controller, 1, dt, action.hopHeld, false);
    const out = createTrickFacts();
    Object.assign(out, { flightIndex: controller.flightIndex, tookOff: controller.tookOff,
      hopped: controller.hopped, hopCharge: controller.hopped ? controller.lastHopCharge : 0,
      spinCompleted: controller.spinCompleted, oneFootQualified: oneFootQualifiedThisFlight(pose, controller.flightIndex),
      touchedDown: controller.touchedDown, landingQuality: controller.lastLandingQuality, crashed: controller.crashed });
    facts.push(out);
    zones.push(out.tookOff ? trickZoneAt(PARK_PLAN.trickZones, before.position.x, before.position.z) : null);
    if (controller.tookOff) { launched = true; launchSpeeds.push(before.speed); }
    if (mode === 'flight' && launched && controller.touchedDown) {
      mode = 'travel'; held = false; target = next; next = next === 16 ? 13 : 16;
    }
  }
  return { recording: { id: 'continuous-shuttle', label: 'continuous two-zone shuttle from the normal run start',
    source: 'ride', steps: facts, zones }, actions, distance: controller.snapshot().distanceTravelled, launchSpeeds };
}
