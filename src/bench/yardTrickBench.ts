/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE, SIMULATION } from '../data/tuning.ts';
import {
  createOneFootPose,
  oneFootQualifiedThisFlight,
  stepOneFootFromController,
} from '../app/oneFootPose.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createSkateparkLevel } from '../level/skateparkLevel.ts';
import { trickZoneAt } from '../level/trickZones.ts';
import { EucController, type CrashCause } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createTrickFacts, type TrickStepInput } from '../simulation/trickEvents.ts';
import { SHIPPED_TRICK_RULES, type TrickRunRules } from '../simulation/trickRun.ts';
import { STEP_SECONDS, type BenchCharge, type BenchTable } from './jumpBench.ts';
import {
  FEATURE_RECIPES,
  durationStepsFor,
  replayTrickRun,
  scoreRecording,
  spliceRecordings,
  type SplicePart,
  type TrickRecording,
  type TrickReplay,
} from './trickRunBench.ts';

/**
 * The Trick Run score bench at Foundry Yard — 1.4.0, `docs/PLANS.md` §51.5.4
 * (the honest line), §51.5.5 (the q191 shuttle exposure) and decision D16.
 *
 * **The same referee and the same facts as Switchback's bench, on the real
 * `foundry-yard-r1` plan.** Every point below is banked by
 * `simulation/trickRun.ts` through `replayTrickRun` / `scoreRecording`, and
 * every fact stream is ridden off the real `EucController` (with the yard's
 * transition rules: wall turn, come-back air, kicker launch, crest and hop
 * caps) and the real `app/oneFootPose.ts`, assembled in `app/Game.ts`'s order:
 * the controller steps, the pose steps from it, then the ten facts. The launch
 * zone is `trickZoneAt(plan.trickZones, x, z)` at the last grounded XZ before
 * the takeoff, exactly as `trickRunBench.ts` records it.
 *
 * **What is new here is a steering driver.** Switchback's bench rides straight
 * windows of a corridor; a skate park has no corridor, so this driver steers a
 * pure-pursuit line through waypoints on the open floor, holds a speed, coasts
 * where a line says "hands off" (a wall's face), and presses Hop when the
 * wheel crosses a press line. The press semantics are `recordRide`'s: a press
 * waits in the action buffer until the controller can take it, a charged
 * recipe holds the crouch, a one-foot recipe holds the level through the
 * flight, a 180 is tapped on the first rising airborne step with full steer.
 *
 * **The honest run is a spliced proxy, like S4's.** Each of the seventeen
 * features in §51.5.4's order is ridden as its own attempt from an entry pose
 * on the line to an exit gate past it; an attempt "rides on" only when the
 * wheel crosses its exit gate facing the line's way, grounded and not crashed
 * — a 180 exits fakie, so it rides on only after the driver has turned the
 * wheel round, and that time is in the attempt. The connective floor between
 * one exit gate and the next entry is counted as quiet time at the next
 * attempt's speed. The q191 shuttles and farms are NOT proxies: each is one
 * continuous ride from the normal solo start, with no resets or teleports.
 *
 * Deterministic: no clock, no random source, no `node:` import.
 */

/** The yard, built once. Every ride here is on this exact plan. */
export const YARD_PLAN: LevelPlan = createSkateparkLevel();
const YARD_SAMPLER = new PlanTerrainSampler(YARD_PLAN);
const DEG = Math.PI / 180;

/** A point on the yard's floor plan, world metres. */
export interface YardPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * One waypoint of a steered line.
 *
 * `straight` holds the bars level while it is the target (a wall's face, a
 * kicker's run); `coast` releases the throttle while it is the target (hands
 * off up a transition, which is how the come-back air is ridden in G-C).
 * `radius` is how near counts as reaching it (default 2.5 m); a waypoint is
 * also passed once the wheel crosses the line through it square to the
 * segment that leads to it.
 */
export interface YardWaypoint extends YardPoint {
  readonly straight?: boolean;
  readonly coast?: boolean;
  readonly radius?: number;
}

/**
 * A press line: Hop is pressed on the first grounded step on which the wheel
 * has crossed `edge − sign · leadSeconds · speed` along `axis` in the `sign`
 * direction. `speed` is the attempt's held speed, so one lead in seconds means
 * the same timing at every speed.
 */
export interface YardPress {
  readonly axis: 'x' | 'z';
  readonly edge: number;
  readonly sign: 1 | -1;
  readonly leadSeconds: number;
}

/** What one recorded ride is asked to do. */
export interface YardScript {
  readonly start: YardPoint & { readonly headingDeg: number };
  /** Speed at the first step, m/s (0 = from rest). */
  readonly startSpeed: number;
  /** The held speed, m/s, wherever the target waypoint does not coast. */
  readonly speed: number;
  readonly path: readonly YardWaypoint[];
  /** The presses, in order; each fires once. */
  readonly presses: readonly YardPress[];
  readonly recipe: YardRecipe;
  readonly maxSteps: number;
}

/** An input recipe — `trickRunBench.ts`'s six, plus the uncharged one-foot and bundle. */
export interface YardRecipe {
  readonly id: string;
  readonly label: string;
  readonly charge: BenchCharge;
  readonly hop: boolean;
  readonly holdHop: boolean;
  readonly spinTap?: 'left' | 'right';
}

export const YARD_RECIPES: readonly YardRecipe[] = [
  ...FEATURE_RECIPES,
  { id: 'lightFoot', label: 'hop, Hop held', charge: 'none', hop: true, holdHop: true },
  { id: 'lightBoth', label: 'hop, 180 then re-hold', charge: 'none', hop: true, holdHop: true, spinTap: 'left' },
];

/** A recorded yard ride: the fact stream, and the facts a table prints beside its points. */
export interface YardRide {
  readonly recording: TrickRecording;
  readonly steps: number;
  readonly reachedEnd: boolean;
  readonly crashed: boolean;
  readonly crashCause: CrashCause;
  readonly takeoffs: number;
  readonly comeBackAirs: number;
  readonly distance: number;
  readonly endsAirborne: boolean;
}

function pressAt(press: YardPress, speed: number): number {
  return press.edge - press.sign * press.leadSeconds * speed;
}

/**
 * Ride one steered attempt on the yard and record the ten facts per step.
 *
 * The exit gate is the last waypoint: the ride has "reached its end" when the
 * wheel is grounded, not crashed, rolling forward at 1 m/s or more with its
 * heading within 60° of the last segment's direction, and either within the
 * waypoint's radius of it or past the line through it square to that segment.
 */
export function rideYard(id: string, label: string, script: YardScript, plan: LevelPlan = YARD_PLAN): YardRide {
  const sampler = plan === YARD_PLAN ? YARD_SAMPLER : new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: { position: { x: script.start.x, y: 0, z: script.start.z }, headingY: script.start.headingDeg * DEG },
  });
  controller.reset(undefined, script.startSpeed);
  const pose = createOneFootPose();
  const steps: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const path = script.path;
  const last = path.length - 1;
  let target = 0;
  let pressIndex = 0;
  let pressStep = -1;
  let pressPending = false;
  let spinRequested = false;
  let held = false;
  let sinceTouchdown = 1_000;
  let airborne = false;
  let takeoffs = 0;
  let crashed = false;
  let crashCause: CrashCause = 'none';
  let reachedEnd = false;
  const legDirection = (index: number): YardPoint => {
    const from = index === 0 ? script.start : path[index - 1];
    const dx = path[index].x - from.x;
    const dz = path[index].z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length };
  };
  for (let step = 0; step < script.maxSteps; step += 1) {
    const before = controller.snapshot();
    const px = before.position.x;
    const pz = before.position.z;
    while (target < last) {
      const point = path[target];
      const along = legDirection(target);
      const reached = Math.hypot(point.x - px, point.z - pz) < (point.radius ?? 2.5)
        || (point.x - px) * along.x + (point.z - pz) * along.z < 0;
      if (!reached) break;
      target += 1;
    }
    const point = path[target];
    const raw = Math.atan2(point.x - px, point.z - pz) - before.headingY;
    const error = Math.atan2(Math.sin(raw), Math.cos(raw));
    const steerable = before.grounded && point.straight !== true && sinceTouchdown > 30;
    let steer = steerable ? Math.max(-1, Math.min(1, -error * 1.8)) : 0;
    const throttle = point.coast === true ? 0 : Math.max(-1, Math.min(1, (script.speed - before.speed) * 2));

    if (pressIndex < script.presses.length && before.grounded && !pressPending) {
      const press = script.presses[pressIndex];
      const value = press.axis === 'x' ? px : pz;
      if (press.sign * (value - pressAt(press, script.speed)) >= 0) {
        pressPending = true;
        pressStep = step;
        pressIndex += 1;
      }
    }
    const recipe = script.recipe;
    const spinNow = recipe.spinTap !== undefined && !spinRequested && !before.grounded && controller.canAcceptSpin;
    if (spinNow) spinRequested = true;
    const pending = recipe.hop && pressPending && step - pressStep <= 12;
    if (pressPending && step - pressStep > 12) pressPending = false;
    const legal = controller.canAcceptHop || controller.canAcceptSpin;
    const hop = (pending || spinNow) && legal;
    if (pending && hop && !spinNow) pressPending = false;
    if (hop && !spinNow && recipe.holdHop) held = true;
    if (spinNow) steer = recipe.spinTap === 'right' ? 1 : -1;
    const action: ActionSnapshot = {
      ...NEUTRAL_ACTIONS,
      throttle,
      steer,
      crouch: recipe.charge === 'full',
      hop,
      hopHeld: held && !spinNow,
    };
    controller.step(STEP_SECONDS, action);
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, held && !spinNow, false);
    const after = controller.snapshot();
    const facts = createTrickFacts();
    facts.flightIndex = controller.flightIndex;
    facts.tookOff = controller.tookOff;
    facts.hopped = controller.hopped;
    facts.hopCharge = controller.hopped ? controller.lastHopCharge : 0;
    facts.spinCompleted = controller.spinCompleted;
    facts.oneFootQualified = oneFootQualifiedThisFlight(pose, controller.flightIndex);
    facts.touchedDown = controller.touchedDown;
    facts.landingQuality = controller.lastLandingQuality;
    facts.crashed = controller.crashed;
    facts.reset = false;
    steps.push(facts);
    zones.push(facts.tookOff ? trickZoneAt(plan.trickZones, px, pz) : null);
    sinceTouchdown += 1;
    if (facts.tookOff) {
      takeoffs += 1;
      airborne = true;
    }
    if (facts.touchedDown) {
      airborne = false;
      sinceTouchdown = 0;
      held = false;
      spinRequested = false;
    }
    if (after.crashed) {
      crashed = true;
      crashCause = after.crashCause;
      break;
    }
    if (target === last && !airborne && after.grounded && after.speed >= 1) {
      const along = legDirection(last);
      const facing = Math.sin(after.headingY) * along.x + Math.cos(after.headingY) * along.z;
      const ex = point.x - after.position.x;
      const ez = point.z - after.position.z;
      const near = Math.hypot(ex, ez) < (point.radius ?? 3.5);
      const past = ex * along.x + ez * along.z < 0;
      if (facing > Math.cos(60 * DEG) && (near || past)) {
        reachedEnd = true;
        break;
      }
    }
  }
  return {
    recording: { id, label, source: 'ride', steps, zones },
    steps: steps.length,
    reachedEnd,
    crashed,
    crashCause,
    takeoffs,
    comeBackAirs: controller.comeBackAirCount,
    distance: controller.snapshot().distanceTravelled,
    endsAirborne: airborne,
  };
}

// ---------------------------------------------------------------------------
// The honest line: seventeen features in §51.5.4's order
// ---------------------------------------------------------------------------

/** One feature on the line: where its attempt starts, the line through it, and its candidates. */
export interface YardLeg {
  readonly zone: string;
  readonly label: string;
  readonly start: YardPoint & { readonly headingDeg: number };
  readonly path: readonly YardWaypoint[];
  readonly speeds: readonly number[];
  /** Candidate press sequences; each is ridden with every recipe at every speed. */
  readonly presses: readonly (readonly YardPress[])[];
  /**
   * The floor ridden from the previous leg's exit gate to this leg's start,
   * as a polyline (the previous exit first). Counted as quiet time.
   */
  readonly approach: readonly YardPoint[];
}

const pressLines = (axis: 'x' | 'z', edge: number, sign: 1 | -1, leads: readonly number[]): YardPress[][] =>
  leads.map((leadSeconds) => [{ axis, edge, sign, leadSeconds }]);

/** A wall: hold the speed to the foot, hands off up the face, then the way out. */
function wall(x: number, z: number): YardWaypoint[] {
  return [{ x: x - 2.2, z, straight: true, radius: 0.3 }, { x: x + 0.5, z, straight: true, coast: true }];
}

/** The east wall's coping and foot (T75, 2.23 m of run). */
const QP_COPING = 162.5;

export const YARD_LEGS: readonly YardLeg[] = [
  {
    zone: 'kicker-k2', label: 'K2, the opener, +X from the line',
    start: { x: 112, z: 124, headingDeg: 90 }, speeds: [8, 10, 12],
    path: [{ x: 126.45, z: 124, straight: true, radius: 0.3 }, { x: 140, z: 124 }],
    presses: pressLines('x', 126.45, 1, [0, 0.1, 0.2, 0.3]),
    approach: [{ x: 118, z: 165.4 }, { x: 112, z: 166 }, { x: 94, z: 166 }, { x: 92, z: 160 }, { x: 92, z: 130 },
      { x: 96, z: 124 }, { x: 112, z: 124 }],
  },
  {
    zone: 'qp-east-mid', label: 'the east wall at z 124, come-back air',
    start: { x: 140, z: 124, headingDeg: 90 }, speeds: [7, 9, 11],
    path: [...wall(QP_COPING, 124), { x: 155, z: 128 }, { x: 152, z: 137 }],
    presses: pressLines('x', 161.5, 1, [-0.05, 0, 0.05]),
    approach: [{ x: 140, z: 124 }],
  },
  {
    zone: 'snake-berm', label: 'base lane south, the roll-in, the berm',
    start: { x: 151, z: 137, headingDeg: -10 }, speeds: [6, 8, 10],
    path: [{ x: 148, z: 145 }, { x: 148, z: 151 }, { x: 146.2, z: 156.5 }, { x: 142, z: 158.25 }, { x: 137, z: 158.25 }],
    presses: pressLines('z', 146, 1, [0, 0.05, 0.1]),
    approach: [{ x: 152, z: 137 }, { x: 151, z: 137 }],
  },
  {
    zone: 'snake-rollers', label: 'pump the three rollers, −X',
    start: { x: 137, z: 158.25, headingDeg: -90 }, speeds: [6, 8, 10],
    path: [{ x: 116, z: 158.25 }],
    presses: pressLines('x', 132, -1, [0.05, 0.1, 0.2]),
    approach: [{ x: 137, z: 158.25 }],
  },
  {
    zone: 'bowl', label: 'the snake mouth, the bowl\'s west wall, out the north roll-out',
    start: { x: 116, z: 158.25, headingDeg: -90 }, speeds: [6, 8, 10],
    path: [{ x: 96.5 + 2.2, z: 158.25, straight: true, radius: 0.3 }, { x: 96.0, z: 158.25, straight: true, coast: true },
      { x: 101, z: 157 }, { x: 103.5, z: 152 }, { x: 103.5, z: 148 }],
    presses: pressLines('x', 98.0, -1, [-0.05, 0, 0.05]),
    approach: [{ x: 116, z: 158.25 }],
  },
  {
    zone: 'manual-2', label: 'MP2, −Z (north) over the pad',
    start: { x: 103.5, z: 148, headingDeg: 180 }, speeds: [5, 6, 8],
    path: [{ x: 103.5, z: 131 }],
    presses: pressLines('z', 142, -1, [0.3, 0.4, 0.5]),
    approach: [{ x: 103.5, z: 148 }],
  },
  {
    zone: 'mini', label: 'across the run-up, in down the south bank, north-wall air, out the bank',
    start: { x: 97.75, z: 128, headingDeg: 180 }, speeds: [6, 8, 10],
    path: [{ x: 97.75, z: 100.25 + 2.23, straight: true, radius: 0.3 }, { x: 97.75, z: 99.75, straight: true, coast: true },
      { x: 97.75, z: 116 }],
    presses: pressLines('z', 101.8, -1, [-0.05, 0, 0.05]),
    approach: [{ x: 103.5, z: 131 }, { x: 97.75, z: 128 }],
  },
  {
    zone: 'ledge-l2', label: 'L2, +X along z 118.45',
    start: { x: 99, z: 118.45, headingDeg: 90 }, speeds: [5, 6, 8],
    path: [{ x: 117, z: 118.45 }],
    presses: pressLines('x', 104, 1, [0.3, 0.4, 0.5]),
    approach: [{ x: 97.75, z: 116 }, { x: 99, z: 118.45 }],
  },
  {
    zone: 'euro-gap', label: 'up bank-W, across the deck, the gap to the table',
    start: { x: 110, z: 99.5, headingDeg: 90 }, speeds: [7, 9, 11],
    path: [{ x: 136, z: 99.5 }],
    presses: pressLines('x', 127, 1, [0.05, 0.1, 0.2]),
    approach: [{ x: 117, z: 118.45 }, { x: 112, z: 113 }, { x: 110, z: 104 }, { x: 110, z: 99.5 }],
  },
  {
    zone: 'ledge-l1', label: 'L1, +X along z 101.45',
    start: { x: 137, z: 101.45, headingDeg: 90 }, speeds: [5, 6, 8],
    path: [{ x: 155, z: 101.45 }],
    presses: pressLines('x', 144, 1, [0.3, 0.4, 0.5]),
    approach: [{ x: 136, z: 99.5 }, { x: 137, z: 101.45 }],
  },
  {
    zone: 'qp-east-north', label: 'the east wall at z 104.5, come-back air',
    start: { x: 155, z: 104.5, headingDeg: 90 }, speeds: [6, 7, 9],
    path: [...wall(QP_COPING, 104.5), { x: 154, z: 108 }, { x: 153, z: 116 }],
    presses: pressLines('x', 161.5, 1, [-0.05, 0, 0.05]),
    approach: [{ x: 155, z: 101.45 }, { x: 155, z: 104.5 }],
  },
  {
    zone: 'manual-1', label: 'MP1, −X along z 117.2',
    start: { x: 153, z: 117.2, headingDeg: -90 }, speeds: [5, 6, 8],
    path: [{ x: 134, z: 117.2 }],
    presses: pressLines('x', 146, -1, [0.3, 0.4, 0.5]),
    approach: [{ x: 153, z: 116 }, { x: 153, z: 117.2 }],
  },
  {
    zone: 'stair-deck', label: 'up bank-E′, across the deck, off D1 heading +Z',
    start: { x: 133, z: 106, headingDeg: -90 }, speeds: [5, 6, 7],
    path: [{ x: 126, z: 106 }, { x: 121, z: 106 }, { x: 118.5, z: 108 }, { x: 118.5, z: 115 }],
    presses: pressLines('z', 108.5, 1, [0.05, 0.1, 0.2, 0.3]),
    approach: [{ x: 134, z: 117.2 }, { x: 133, z: 106 }],
  },
  {
    zone: 'hip-pyramid', label: 'across the lane at x 118, over the pyramid heading +Z',
    start: { x: 118, z: 128, headingDeg: -5 }, speeds: [6, 8, 10],
    path: [{ x: 116, z: 136 }, { x: 116, z: 146 }],
    presses: pressLines('z', 141.75, 1, [0.1, 0.2, 0.3]),
    approach: [{ x: 118.5, z: 115 }, { x: 118, z: 128 }],
  },
  {
    zone: 'kicker-k1', label: 'K1, +X along z 138.6',
    start: { x: 121, z: 138.6, headingDeg: 90 }, speeds: [8, 10, 12],
    path: [{ x: 130.45, z: 138.6, straight: true, radius: 0.3 }, { x: 144, z: 138.6 }],
    presses: pressLines('x', 130.45, 1, [0, 0.1, 0.2, 0.3]),
    approach: [{ x: 116, z: 146 }, { x: 121, z: 143 }, { x: 121, z: 138.6 }],
  },
  {
    zone: 'qp-east-south', label: 'the east wall at z 138.6, come-back air',
    start: { x: 144, z: 138.6, headingDeg: 90 }, speeds: [7, 9, 11],
    path: [...wall(QP_COPING, 138.6), { x: 155, z: 142 }, { x: 156, z: 150 }],
    presses: pressLines('x', 161.5, 1, [-0.05, 0, 0.05]),
    approach: [{ x: 144, z: 138.6 }],
  },
  {
    zone: 'planter-line', label: 'past the end bank, the alley −X over the planters',
    start: { x: 146, z: 165.4, headingDeg: -90 }, speeds: [5, 6, 7],
    path: [{ x: 118, z: 165.4 }],
    presses: [0.3, 0.4, 0.5].map((mount) => [
      { axis: 'x' as const, edge: 134.4, sign: -1 as const, leadSeconds: mount },
      { axis: 'x' as const, edge: 132.0, sign: -1 as const, leadSeconds: 0.15 },
      { axis: 'x' as const, edge: 128.4, sign: -1 as const, leadSeconds: 0.15 },
    ]),
    approach: [{ x: 156, z: 150 }, { x: 157, z: 160 }, { x: 152, z: 165.4 }, { x: 146, z: 165.4 }],
  },
];

export function polylineMetres(points: readonly YardPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

/** The solo spawn: the start line less `CHALLENGE.startRunupMetres`, as `Game.resetChallengeRider` places it. */
export function yardSoloStart(plan: LevelPlan = YARD_PLAN): YardPoint & { headingDeg: number } {
  const line = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'start');
  if (line === undefined) throw new Error('yardTrickBench: the yard has no start checkpoint');
  return {
    x: line.centre.x - Math.sin(line.headingY) * CHALLENGE.startRunupMetres,
    z: line.centre.z - Math.cos(line.headingY) * CHALLENGE.startRunupMetres,
    headingDeg: line.headingY / DEG,
  };
}

// ---------------------------------------------------------------------------
// Attempts and the routed line
// ---------------------------------------------------------------------------

/** One measured attempt at one leg: the ride and what the referee banked for it alone. */
export interface YardAttempt {
  readonly leg: YardLeg;
  readonly speed: number;
  readonly recipe: YardRecipe;
  readonly presses: readonly YardPress[];
  readonly ride: YardRide;
  readonly replay: TrickReplay;
  readonly points: number;
  /** Reached its exit gate within the leg's own line (its length plus 20 m for a turn-round). */
  readonly ridesOn: boolean;
}

/** Steps an attempt may run before it is called lost. */
const ATTEMPT_STEPS = 2400;
/** The allowance over a leg's own line before an attempt is a second visit rather than a pass. */
const TURN_ROUND_METRES = 20;

export function legLineMetres(leg: YardLeg): number {
  return polylineMetres([leg.start, ...leg.path]);
}

function scriptFor(leg: YardLeg, speed: number, recipe: YardRecipe, presses: readonly YardPress[],
  fromSpawn: boolean): YardScript {
  return {
    start: fromSpawn ? yardSoloStart() : leg.start,
    startSpeed: fromSpawn ? 0 : speed,
    speed,
    path: leg.path,
    presses,
    recipe,
    maxSteps: ATTEMPT_STEPS,
  };
}

export function yardAttempt(leg: YardLeg, speed: number, recipe: YardRecipe, presses: readonly YardPress[],
  fromSpawn = false): YardAttempt {
  const ride = rideYard(`${leg.zone}-${speed}-${recipe.id}`, `${leg.label} at ${speed} m/s, ${recipe.label}`,
    scriptFor(leg, speed, recipe, presses, fromSpawn));
  const replay = scoreRecording(ride.recording);
  const allowance = legLineMetres(leg) + TURN_ROUND_METRES
    + (fromSpawn ? Math.hypot(leg.start.x - yardSoloStart().x, leg.start.z - yardSoloStart().z) : 0);
  return {
    leg, speed, recipe, presses, ride, replay, points: replay.scores[0],
    ridesOn: ride.reachedEnd && !ride.endsAirborne && ride.distance <= allowance,
  };
}

const attemptsCache = new Map<string, readonly YardAttempt[]>();
const attemptCost = { trials: 0, steps: 0 };

/** Every candidate at one leg: its speeds × the recipes × its press sequences. Cached. */
export function yardAttempts(leg: YardLeg): readonly YardAttempt[] {
  const cached = attemptsCache.get(leg.zone);
  if (cached !== undefined) return cached;
  const all: YardAttempt[] = [];
  for (const speed of leg.speeds) {
    for (const recipe of YARD_RECIPES) {
      for (const presses of leg.presses) {
        const value = yardAttempt(leg, speed, recipe, presses);
        attemptCost.trials += 1;
        attemptCost.steps += value.ride.steps;
        all.push(value);
      }
    }
  }
  attemptsCache.set(leg.zone, all);
  return all;
}

export type YardRouteSelector = 'points' | 'rate';

/** One feature's place in the routed lap. */
export interface YardRoutedLeg {
  readonly attempt: YardAttempt;
  readonly approachMetres: number;
  readonly approachSteps: number;
}

/**
 * The routed line: at each leg the attempt that rode on and banked the most
 * (`points`, greediest) or the most per second of attempt plus approach
 * (`rate`, briskest). `spins: false` keeps S4's Switchback rule — no 180 in
 * any leg — for the like-for-like comparison.
 */
export function yardRoutedLine(selector: YardRouteSelector, spins = true): readonly YardRoutedLeg[] {
  const legs: YardRoutedLeg[] = [];
  for (const leg of YARD_LEGS) {
    const metres = polylineMetres(leg.approach);
    let best: YardRoutedLeg | null = null;
    let bestScore = -Infinity;
    for (const value of yardAttempts(leg)) {
      if (!value.ridesOn) continue;
      if (!spins && value.recipe.spinTap !== undefined) continue;
      const approachSteps = Math.round(metres / Math.max(1, value.speed) / STEP_SECONDS);
      const legSteps = value.ride.steps + approachSteps;
      const score = selector === 'points' ? value.points : value.points / (legSteps * STEP_SECONDS);
      if (best === null || score > bestScore
        || (score === bestScore && legSteps < best.attempt.ride.steps + best.approachSteps)) {
        best = { attempt: value, approachMetres: metres, approachSteps };
        bestScore = score;
      }
    }
    if (best !== null) legs.push(best);
  }
  return legs;
}

/** Steps of one routed lap after the first: every attempt plus every approach. */
export function yardLapSteps(legs: readonly YardRoutedLeg[]): number {
  return legs.reduce((total, leg) => total + leg.attempt.ride.steps + leg.approachSteps, 0);
}

const EMPTY: TrickRecording = { id: 'approach', label: 'the floor between features', source: 'spliced', steps: [], zones: [] };

/**
 * The routed line as one seat's stream: the first leg ridden from the solo
 * spawn at rest (its own run-up, no approach), then every leg with its
 * approach before it, lap after lap, until `steps` are covered.
 */
export function yardRoutedRecording(legs: readonly YardRoutedLeg[], steps: number): {
  readonly recording: TrickRecording;
  readonly firstLapSteps: number;
  readonly opener: YardAttempt;
} {
  const head = legs[0];
  const opener = yardAttempt(head.attempt.leg, head.attempt.speed, head.attempt.recipe, head.attempt.presses, true);
  const parts: SplicePart[] = [{ recording: opener.ride.recording, fillerSteps: 0 }];
  let covered = opener.ride.steps;
  for (let index = 1; index < legs.length; index += 1) {
    parts.push({ recording: EMPTY, fillerSteps: legs[index].approachSteps });
    parts.push({ recording: legs[index].attempt.ride.recording, fillerSteps: 0 });
    covered += legs[index].approachSteps + legs[index].attempt.ride.steps;
  }
  const firstLapSteps = covered;
  while (covered < steps) {
    for (const leg of legs) {
      parts.push({ recording: EMPTY, fillerSteps: leg.approachSteps });
      parts.push({ recording: leg.attempt.ride.recording, fillerSteps: 0 });
      covered += leg.approachSteps + leg.attempt.ride.steps;
    }
  }
  return { recording: spliceRecordings('yard-routed', 'the routed Foundry Yard line (spliced proxy)', parts),
    firstLapSteps, opener };
}

/** Score a stream at a clock of `seconds` through the shipped referee (only the clock moves). */
export function scoreAt(recording: TrickRecording, seconds: number,
  rules: TrickRunRules = SHIPPED_TRICK_RULES): TrickReplay {
  return replayTrickRun([recording], { ...rules, durationSteps: durationStepsFor(seconds) });
}

// ---------------------------------------------------------------------------
// q191 at the yard: continuous shuttles from the normal solo start
// ---------------------------------------------------------------------------

/** One stop of a shuttle: the floor it rides over to get there, and where it stands. */
export interface ShuttleStop {
  /** Waypoints ridden (steered, at `travelSpeed`) before the final creep to `spot`. */
  readonly via: readonly YardPoint[];
  readonly spot: YardPoint;
  /** Overrides `ShuttleOptions.spin` at this stop (a stop that must not turn the rider round). */
  readonly spin?: boolean;
}

export interface ShuttleOptions {
  /** The route from the solo spawn to the first stop. */
  readonly approach: readonly YardPoint[];
  readonly approachSpeed: number;
  /** The stops, visited in order and then again from the first. */
  readonly cycle: readonly ShuttleStop[];
  /** The steered speed between stops, m/s; the last metre or so is a creep. */
  readonly travelSpeed: number;
  /** Tap the 180 on each flight (each flight then also turns the rider round). */
  readonly spin: boolean;
  /** Fixed steps to stand still before each hop (Switchback's shuttle uses 80). */
  readonly settleSteps: number;
  /** Extra standing steps before every hop after the first — the paced camper. */
  readonly restSteps?: number;
  /**
   * A human-rate settle (QA R2-TR2): the brake-or-drive choice is taken only
   * every `everySteps` steps, from the speed `latencySteps` old, and a speed
   * within `deadband` m/s of zero is let go. Without it the settle decides on
   * every step from the current speed, at 120 Hz, as no player can.
   */
  readonly humanSettle?: { readonly everySteps: number; readonly latencySteps: number; readonly deadband: number };
}

export interface YardShuttle {
  readonly recording: TrickRecording;
  readonly actions: readonly ActionSnapshot[];
  readonly distance: number;
  readonly launchSpeeds: readonly number[];
  readonly crashed: boolean;
}

/**
 * One uninterrupted ride: the normal solo start, the approach, then stopped
 * hop + (180) + held one-foot at each stop in turn — the q191 attack on this
 * plan. No teleports, resets or spliced travel; every point is the referee's.
 * The constants are this adversarial input script, not gameplay tuning.
 */
export function recordYardShuttle(id: string, label: string, options: ShuttleOptions,
  steps = durationStepsFor(90), plan: LevelPlan = YARD_PLAN): YardShuttle {
  const sampler = plan === YARD_PLAN ? YARD_SAMPLER : new PlanTerrainSampler(plan);
  const start = yardSoloStart(plan);
  const controller = new EucController(sampler, {
    spawn: { position: { x: start.x, y: 0, z: start.z }, headingY: start.headingDeg * DEG },
  });
  controller.reset(undefined, 0);
  const pose = createOneFootPose();
  const facts: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const actions: ActionSnapshot[] = [];
  const launchSpeeds: number[] = [];
  let mode: 'route' | 'creep' | 'settle' | 'flight' = 'route';
  let route: readonly YardPoint[] = [...options.approach, ...options.cycle[0].via];
  let routeIndex = 0;
  let speedCap = options.approachSpeed;
  let stop = 0;
  let spot = options.cycle[0].spot;
  let flights = 0;
  let wait = 0;
  let held = false;
  let spun = false;
  let launched = false;
  let crashed = false;
  const human = options.humanSettle;
  const speeds: number[] = [];
  let settleChoice = 0;
  for (let step = 0; step < steps; step += 1) {
    const before = controller.snapshot();
    const px = before.position.x;
    const pz = before.position.z;
    if (human) speeds.push(before.speed);
    let throttle = 0;
    let steer = 0;
    let hop = false;
    let spin = false;
    const aim = (point: YardPoint): number => {
      const raw = Math.atan2(point.x - px, point.z - pz) - before.headingY;
      return Math.atan2(Math.sin(raw), Math.cos(raw));
    };
    if (mode === 'route') {
      while (routeIndex < route.length && Math.hypot(route[routeIndex].x - px, route[routeIndex].z - pz) < 1.5) routeIndex += 1;
      if (routeIndex >= route.length) {
        mode = 'creep';
      } else {
        const error = aim(route[routeIndex]);
        steer = Math.max(-1, Math.min(1, -error * 1.8));
        const wanted = Math.abs(error) > 1.2 ? Math.min(speedCap, 1.5) : speedCap;
        throttle = Math.max(-1, Math.min(1, (wanted - before.speed) * 2));
      }
    }
    if (mode === 'creep') {
      const error = aim(spot);
      const distance = Math.hypot(spot.x - px, spot.z - pz);
      const ahead = (spot.x - px) * Math.sin(before.headingY) + (spot.z - pz) * Math.cos(before.headingY);
      if (distance > 0.4) steer = Math.max(-1, Math.min(1, -error * 1.8));
      const wanted = Math.abs(error) > 1.2 && distance > 0.4
        ? 1.2
        : Math.sign(ahead) * Math.min(2, Math.sqrt(Math.max(0, Math.abs(ahead) - 0.03) * 3));
      throttle = Math.max(-1, Math.min(1, (wanted - before.speed) * 2));
      if (Math.abs(ahead) < 0.16 && distance < 0.6 && Math.abs(before.speed) < 0.2) {
        mode = 'settle';
        wait = 0;
      }
    }
    if (mode === 'settle') {
      if (human) {
        if (wait === 0 || step % human.everySteps === 0) {
          const seen = speeds[Math.max(0, speeds.length - 1 - human.latencySteps)];
          settleChoice = seen > human.deadband ? -1 : seen < -human.deadband ? 1 : 0;
        }
        throttle = settleChoice;
      } else {
        throttle = before.speed > 0.005 ? -1 : before.speed < -0.005 ? 1 : 0;
      }
      wait += 1;
      const settle = options.settleSteps + (flights > 0 ? options.restSteps ?? 0 : 0);
      if (wait > settle && Math.abs(before.speed) < 0.005 && controller.canAcceptHop) {
        mode = 'flight';
        hop = true;
        held = true;
        spun = false;
        launched = false;
      }
    }
    if (mode === 'flight') {
      spin = (options.cycle[stop].spin ?? options.spin) && !before.grounded && !spun && controller.canAcceptSpin;
      if (spin) spun = true;
    }
    const action: ActionSnapshot = { ...NEUTRAL_ACTIONS, throttle, steer: spin ? -1 : steer,
      hop: hop || spin, hopHeld: held && !spin };
    actions.push(action);
    controller.step(STEP_SECONDS, action);
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, action.hopHeld, false);
    const out = createTrickFacts();
    out.flightIndex = controller.flightIndex;
    out.tookOff = controller.tookOff;
    out.hopped = controller.hopped;
    out.hopCharge = controller.hopped ? controller.lastHopCharge : 0;
    out.spinCompleted = controller.spinCompleted;
    out.oneFootQualified = oneFootQualifiedThisFlight(pose, controller.flightIndex);
    out.touchedDown = controller.touchedDown;
    out.landingQuality = controller.lastLandingQuality;
    out.crashed = controller.crashed;
    facts.push(out);
    zones.push(out.tookOff ? trickZoneAt(plan.trickZones, px, pz) : null);
    if (controller.tookOff) {
      launched = true;
      launchSpeeds.push(before.speed);
    }
    if (controller.crashed) crashed = true;
    if (mode === 'flight' && launched && controller.touchedDown) {
      held = false;
      flights += 1;
      stop = (stop + 1) % options.cycle.length;
      spot = options.cycle[stop].spot;
      route = options.cycle[stop].via;
      routeIndex = 0;
      speedCap = options.travelSpeed;
      mode = 'route';
    }
  }
  return {
    recording: { id, label, source: 'ride', steps: facts, zones },
    actions,
    distance: controller.snapshot().distanceTravelled,
    launchSpeeds,
    crashed,
  };
}

// ---------------------------------------------------------------------------
// q191 at the yard: wall-air farms (come-back airs are flights, D19)
// ---------------------------------------------------------------------------

/** A wall run: a +X or −X face, the lanes to hit it on in turn, and the input. */
export interface WallFarmOptions {
  readonly approach: readonly YardPoint[];
  /** +1 for a face ridden toward +X (the east wall), −1 toward −X. */
  readonly sign: 1 | -1;
  /** x of the face's foot; the press line is `pressX`. */
  readonly footX: number;
  readonly pressX: number;
  /** z of each run in turn. */
  readonly lanes: readonly number[];
  readonly speed: number;
  /** Tap the 180 (the rider then lands facing the face and rolls straight back out). */
  readonly spin: boolean;
  /** The run-up: the rider rolls back out to this far from the foot before each run. */
  readonly lineUpMetres: number;
}

/**
 * One continuous ride from the solo start: charged hop on the face, 180, re-held
 * one-foot, land facing the wall, roll back out, brake, and go again on the
 * next lane. The come-back air is the controller's own (`EucController`'s C4);
 * nothing here launches anything.
 */
export function recordWallFarm(id: string, label: string, options: WallFarmOptions,
  steps = durationStepsFor(90), plan: LevelPlan = YARD_PLAN): YardShuttle {
  const sampler = plan === YARD_PLAN ? YARD_SAMPLER : new PlanTerrainSampler(plan);
  const start = yardSoloStart(plan);
  const controller = new EucController(sampler, {
    spawn: { position: { x: start.x, y: 0, z: start.z }, headingY: start.headingDeg * DEG },
  });
  controller.reset(undefined, 0);
  const pose = createOneFootPose();
  const facts: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const actions: ActionSnapshot[] = [];
  const launchSpeeds: number[] = [];
  let mode: 'route' | 'run' | 'back' = 'route';
  const route: readonly YardPoint[] = options.approach;
  let routeIndex = 0;
  let lane = 0;
  let pressed = false;
  let held = false;
  let spun = false;
  let launched = false;
  let crashed = false;
  for (let step = 0; step < steps; step += 1) {
    const before = controller.snapshot();
    const px = before.position.x;
    const pz = before.position.z;
    let throttle = 0;
    let steer = 0;
    let hop = false;
    let spin = false;
    const aim = (point: YardPoint): number => {
      const raw = Math.atan2(point.x - px, point.z - pz) - before.headingY;
      return Math.atan2(Math.sin(raw), Math.cos(raw));
    };
    if (mode === 'route') {
      while (routeIndex < route.length && Math.hypot(route[routeIndex].x - px, route[routeIndex].z - pz) < 1.5) routeIndex += 1;
      if (routeIndex >= route.length) {
        mode = 'run';
        pressed = false;
        spun = false;
        launched = false;
      } else {
        const error = aim(route[routeIndex]);
        steer = Math.max(-1, Math.min(1, -error * 1.8));
        const wanted = Math.abs(error) > 1.2 ? 1.5 : 5;
        throttle = Math.max(-1, Math.min(1, (wanted - before.speed) * 2));
      }
    }
    if (mode === 'run') {
      const z = options.lanes[lane];
      if (before.grounded && !pressed) {
        steer = Math.max(-1, Math.min(1, -aim({ x: options.footX + options.sign * 1.2, z }) * 1.8));
        if (options.sign * (px - options.footX) > -0.5) steer = 0;
        throttle = options.sign * (px - options.footX) < 0 ? Math.max(-1, Math.min(1, (options.speed - before.speed) * 2)) : 0;
        if (options.sign * (px - options.pressX) >= 0 && controller.canAcceptHop) {
          hop = true;
          pressed = true;
          held = true;
        }
      }
      if (pressed) {
        spin = options.spin && !before.grounded && !spun && controller.canAcceptSpin;
        if (spin) spun = true;
      }
    }
    if (mode === 'back') {
      // Roll straight back out, facing the face, to the line-up: `lineUpMetres`
      // from the foot, more when the next lane is far (an angled run needs room).
      const next = options.lanes[(lane + 1) % options.lanes.length];
      const room = Math.max(options.lineUpMetres, Math.abs(next - pz) * 0.9);
      const lineUp = options.footX - options.sign * room;
      const ahead = (lineUp - px) * Math.sin(before.headingY);
      const wanted = Math.sign(ahead) * Math.min(4, Math.sqrt(Math.max(0, Math.abs(ahead) - 0.05) * 3));
      throttle = Math.max(-1, Math.min(1, (wanted - before.speed) * 2));
      if (Math.abs(ahead) < 0.3 && Math.abs(before.speed) < 0.2 && before.grounded) {
        lane = (lane + 1) % options.lanes.length;
        mode = 'run';
        pressed = false;
        spun = false;
        launched = false;
      }
    }
    const action: ActionSnapshot = { ...NEUTRAL_ACTIONS, throttle, steer: spin ? -1 : steer,
      crouch: mode === 'run' && !pressed, hop: hop || spin, hopHeld: held && !spin };
    actions.push(action);
    controller.step(STEP_SECONDS, action);
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, action.hopHeld, false);
    const out = createTrickFacts();
    out.flightIndex = controller.flightIndex;
    out.tookOff = controller.tookOff;
    out.hopped = controller.hopped;
    out.hopCharge = controller.hopped ? controller.lastHopCharge : 0;
    out.spinCompleted = controller.spinCompleted;
    out.oneFootQualified = oneFootQualifiedThisFlight(pose, controller.flightIndex);
    out.touchedDown = controller.touchedDown;
    out.landingQuality = controller.lastLandingQuality;
    out.crashed = controller.crashed;
    facts.push(out);
    zones.push(out.tookOff ? trickZoneAt(plan.trickZones, px, pz) : null);
    if (controller.tookOff) {
      launched = true;
      launchSpeeds.push(before.speed);
    }
    if (controller.crashed) crashed = true;
    if (mode === 'run' && launched && controller.touchedDown) {
      held = false;
      mode = 'back';
    }
  }
  return {
    recording: { id, label, source: 'ride', steps: facts, zones },
    actions,
    distance: controller.snapshot().distanceTravelled,
    launchSpeeds,
    crashed,
  };
}

// ---------------------------------------------------------------------------
// The attack lines, named once: what the tables print and the test pins
// ---------------------------------------------------------------------------

/** Standing spots, each inside one zone's flat part (contact patch XZ). */
export const YARD_SPOTS = Object.freeze({
  /** stair-deck's 0.5 m deck strip by D1 and the bank-S crest. */
  stairStrip: { x: 126.6, z: 108.1 },
  /** euro-gap's 0.5 m take-off strip on the same 0.90 deck, 5.65 m north. */
  euroStrip: { x: 126.6, z: 102.45 },
  /** stair-deck's floor under D1. */
  stairFloor: { x: 117.6, z: 111.3 },
  /** ledge-l2's run-out floor east of the ledge. */
  ledgeFloor: { x: 117.4, z: 116.7 },
  /** snake-berm's 0.5 m pad past the berm's outer lip: the alley floor, level. */
  bermStrip: { x: 140.9, z: 161.8 },
  /** planter-line's mount floor, level, 3.4 m from `bermStrip`. */
  planterFloor: { x: 137.8, z: 164.4 },
  /** snake-rollers' lip, the top of its 34.9° channel side. */
  rollersLip: { x: 134.2, z: 161.45 },
});

/** The solo start to the deck: round L2's east end, up bank-W, along the deck. */
const TO_DECK: readonly YardPoint[] = [{ x: 106, z: 123 }, { x: 113.5, z: 120 }, { x: 112.5, z: 112 },
  { x: 112, z: 104 }, { x: 118, z: 103.5 }, { x: 124, z: 104 }, { x: 126.6, z: 104.2 }];
/** The east wall's lanes either side of the north|mid and mid|south seams. */
const QP_FOOT = QP_COPING - 2.23;
const TO_WALL = (z: number): YardPoint[] => [{ x: 112, z: 130 }, { x: 140, z: 130 }, { x: 150, z }];
/** The solo start round the base lane, past QP-E's south end and west along the alley (QA R2-Q191-SNAKE). */
const TO_SNAKE: readonly YardPoint[] = [{ x: 112, z: 130 }, { x: 140, z: 140 }, { x: 155, z: 150 },
  { x: 156, z: 164 }, { x: 145, z: 163.2 }];
/** The solo start round the base lane and up QP-E's south end bank onto its deck (QA TR-2). */
const TO_QP_DECK: readonly YardPoint[] = [{ x: 112, z: 130 }, { x: 140, z: 140 }, { x: 155, z: 154 },
  { x: 164.8, z: 155 }, { x: 164.8, z: 147 }, { x: 164.6, z: 136 }];

export interface YardAttack {
  readonly id: string;
  readonly label: string;
  record(steps: number): YardShuttle;
}

const shuttle = (id: string, label: string, options: ShuttleOptions): YardAttack =>
  ({ id, label, record: (steps) => recordYardShuttle(id, label, options, steps) });
const farm = (id: string, label: string, options: WallFarmOptions): YardAttack =>
  ({ id, label, record: (steps) => recordWallFarm(id, label, options, steps) });

/**
 * Every q191 line measured at the yard, worst first within each kind. Each is
 * one continuous ride from the normal solo start; the stand-still lines use a
 * 30-step settle (Switchback's shuttle uses 80; 30 is the more adversarial).
 */
export const YARD_ATTACKS: readonly YardAttack[] = [
  shuttle('pair-stair-euro', 'shuttle: stair-deck ↔ euro-gap deck strips (D16\'s worst pair, 5.65 m)', {
    approach: TO_DECK, approachSpeed: 5, travelSpeed: 2, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: YARD_SPOTS.stairStrip }, { via: [], spot: YARD_SPOTS.euroStrip }],
  }),
  shuttle('pair-stair-l2', 'shuttle: stair-deck floor under D1 ↔ ledge-l2 floor (5.4 m)', {
    approach: [{ x: 106, z: 123 }, { x: 113.5, z: 121.5 }, { x: 117.6, z: 119.5 }], approachSpeed: 5,
    travelSpeed: 2, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: YARD_SPOTS.stairFloor }, { via: [], spot: YARD_SPOTS.ledgeFloor }],
  }),
  shuttle('cluster-euro-stair-l2', 'three-zone cluster: euro-gap → stair-deck → ledge-l2 (down bank-S and back)', {
    approach: TO_DECK, approachSpeed: 5, travelSpeed: 3, spin: true, settleSteps: 30,
    cycle: [
      { via: [], spot: YARD_SPOTS.euroStrip },
      { via: [], spot: YARD_SPOTS.stairStrip },
      { via: [{ x: 124.8, z: 106.0 }, { x: 125.2, z: 110.6 }, { x: 122, z: 113.5 }, { x: 119.5, z: 115.8 }],
        spot: YARD_SPOTS.ledgeFloor },
    ],
  }),
  farm('wall-three', 'wall airs: the east wall\'s three sections in turn (lanes z 112.8, 114.7, 132.7)', {
    approach: TO_WALL(112.8), sign: 1, footX: QP_FOOT, pressX: 161.6, lanes: [112.8, 114.7, 132.7],
    speed: 8, spin: true, lineUpMetres: 3,
  }),
  farm('wall-pair', 'wall airs: the north|mid seam, two sections (lanes z 112.8, 114.7)', {
    approach: TO_WALL(112.8), sign: 1, footX: QP_FOOT, pressX: 161.2, lanes: [112.8, 114.7],
    speed: 6, spin: true, lineUpMetres: 3,
  }),
  farm('wall-one', 'wall airs: one section (qp-east-mid, lane z 124)', {
    approach: TO_WALL(124), sign: 1, footX: QP_FOOT, pressX: 161.2, lanes: [124],
    speed: 6, spin: true, lineUpMetres: 3,
  }),
  farm('wall-mini', 'wall airs: the mini\'s west wall, back to back', {
    approach: [{ x: 97.75, z: 116 }, { x: 97.75, z: 111 }, { x: 98.5, z: 105.5 }, { x: 98, z: 105 }],
    sign: -1, footX: 92 + 2.23, pressX: 93.6, lanes: [105], speed: 6, spin: true, lineUpMetres: 2.5,
  }),
  farm('wall-bowl', 'wall airs: the bowl\'s west wall, back to back', {
    approach: [{ x: 100, z: 135 }, { x: 103.5, z: 149 }, { x: 103.5, z: 156.5 }, { x: 103, z: 158 }],
    sign: -1, footX: 96.5 + 2.23, pressX: 98, lanes: [158], speed: 6, spin: true, lineUpMetres: 3,
  }),
  // QA TR-2: the deck past the east wall's coping, up its end bank. Before the
  // sections were clipped to the coping it was a stand-still pair 0.9 m apart
  // across a seam (1,792 at 90 s) and a three-section route (2,212).
  shuttle('deck-qp-pair', 'shuttle: the east wall\'s deck either side of the mid|south seam (0.9 m)', {
    approach: TO_QP_DECK, approachSpeed: 4, travelSpeed: 1.5, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: { x: 162.65, z: 131.3 } }, { via: [], spot: { x: 162.65, z: 132.2 } }],
  }),
  shuttle('deck-qp-three', 'three-section route along the east wall\'s deck (both seams)', {
    approach: TO_QP_DECK, approachSpeed: 4, travelSpeed: 1.5, spin: true, settleSteps: 30,
    cycle: [
      { via: [], spot: { x: 162.65, z: 132.2 } },
      { via: [], spot: { x: 162.65, z: 131.3 } },
      { via: [{ x: 164.5, z: 125 }, { x: 164.5, z: 116 }], spot: { x: 162.65, z: 113.3 } },
      { via: [], spot: { x: 162.65, z: 114.2 } },
      { via: [{ x: 164.5, z: 120 }, { x: 164.5, z: 128 }], spot: { x: 162.65, z: 131.3 } },
    ],
  }),
  // QA R2-TR2: the same seams on the wall's own face, below the coping. A
  // brake feathered facing down held the wheel still anywhere on the 24–66°
  // transition (1,792 for the pair at x 162.40–162.45, 2,212 for the three
  // sections), at the bench's 120 Hz settle or a human 10 Hz one; since the
  // face brake (`SKATE_TRANSITION.faceBrakeShare`) the slope always wins, the
  // rider rolls off the foot of the section, and the hops land off-feature.
  ...([['face-qp-pair', 162.4], ['face-qp-pair-top', 162.45], ['face-qp-pair-low', 162.0]] as const).map(([id, x]) =>
    shuttle(id, `shuttle: the east wall's face either side of the mid|south seam (x ${x.toFixed(2)})`, {
      approach: TO_QP_DECK, approachSpeed: 4, travelSpeed: 1.5, spin: true, settleSteps: 30,
      cycle: [{ via: [], spot: { x, z: 131.3 } }, { via: [], spot: { x, z: 132.2 } }],
    })),
  shuttle('face-qp-pair-human', 'the face pair at x 162.40, settled at a human rate (10 Hz, 150 ms late)', {
    approach: TO_QP_DECK, approachSpeed: 4, travelSpeed: 1.5, spin: true, settleSteps: 30,
    humanSettle: { everySteps: 12, latencySteps: 18, deadband: 0.05 },
    cycle: [{ via: [], spot: { x: 162.4, z: 131.3 } }, { via: [], spot: { x: 162.4, z: 132.2 } }],
  }),
  shuttle('face-qp-three', 'three-section route along the east wall\'s face (x 162.45, both seams)', {
    approach: TO_QP_DECK, approachSpeed: 4, travelSpeed: 1.5, spin: true, settleSteps: 30,
    cycle: [
      { via: [], spot: { x: 162.45, z: 132.2 } },
      { via: [], spot: { x: 162.45, z: 131.3 } },
      { via: [{ x: 164.5, z: 125 }, { x: 164.5, z: 116 }], spot: { x: 162.45, z: 113.3 } },
      { via: [], spot: { x: 162.45, z: 114.2 } },
      { via: [{ x: 164.5, z: 120 }, { x: 164.5, z: 128 }], spot: { x: 162.45, z: 131.3 } },
    ],
  }),
  // QA R2-Q191-SNAKE: §51.5.5 rated the snake ↔ planter pairs weak (a 1.0 m
  // climb out of the channel each cycle), but snake-berm's polygon reaches
  // 0.5 m past the berm's outer lip onto the alley floor, 3.4 m from
  // planter-line's mount floor: flat floor to flat floor, no climb. The
  // cluster adds snake-rollers' lip, where a feathered brake parked the wheel
  // on the 34.9° face (2,604 at 90 s before the face brake; now its hop rolls
  // off the lip first and lands off-feature).
  shuttle('pair-berm-planter', 'shuttle: snake-berm\'s alley strip ↔ planter-line\'s mount floor (3.4 m, flat)', {
    approach: TO_SNAKE, approachSpeed: 4, travelSpeed: 2, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: YARD_SPOTS.bermStrip }, { via: [], spot: YARD_SPOTS.planterFloor }],
  }),
  shuttle('cluster-berm-planter-rollers', 'three-zone cluster: snake-berm → planter-line → snake-rollers\' lip', {
    approach: TO_SNAKE, approachSpeed: 4, travelSpeed: 2, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: YARD_SPOTS.bermStrip }, { via: [], spot: YARD_SPOTS.planterFloor },
      { via: [], spot: YARD_SPOTS.rollersLip }],
  }),
  shuttle('camp-stair', 'camping one feature: continuous stopped hops on the stair-deck strip', {
    approach: TO_DECK, approachSpeed: 5, travelSpeed: 2, spin: true, settleSteps: 30,
    cycle: [{ via: [], spot: YARD_SPOTS.stairStrip }],
  }),
  shuttle('paced-stair', 'camping one feature, paced: one stopped hop per 60.5 s on the stair-deck strip', {
    approach: TO_DECK, approachSpeed: 5, travelSpeed: 2, spin: true, settleSteps: 30,
    restSteps: Math.round((SHIPPED_TRICK_RULES.repeatWindowSeconds + 0.5) * SIMULATION.hz),
    cycle: [{ via: [], spot: YARD_SPOTS.stairStrip }],
  }),
];

/**
 * A come-back air off the snake berm's outer wall (QA TR-1): east along the
 * channel at z 158.25 into the wall at 8 m/s, hop pressed at x 148.3, the
 * charged hop + 180 + re-held one-foot. The wall D28 retuned the come-back
 * angle for; its launch latches on the lip, which the zone now passes.
 */
export const YARD_BERM_WALL_AIR: YardScript = {
  start: { x: 136, z: 158.25, headingDeg: 90 }, startSpeed: 8, speed: 8,
  path: [{ x: 147.2, z: 158.25, straight: true, radius: 0.3 }, { x: 150, z: 158.25, straight: true, coast: true },
    { x: 140, z: 158.25 }],
  presses: [{ axis: 'x', edge: 148.3, sign: 1, leadSeconds: 0 }],
  recipe: YARD_RECIPES.find((recipe) => recipe.id === 'both')!,
  maxSteps: 1200,
};

let bermWallAir: { ride: YardRide; replay: TrickReplay } | null = null;

/** `YARD_BERM_WALL_AIR` ridden and scored, once. */
export function yardBermWallAir(): { ride: YardRide; replay: TrickReplay } {
  if (bermWallAir === null) {
    const ride = rideYard('berm-wall-air', 'the berm\'s outer wall, come-back air', YARD_BERM_WALL_AIR);
    bermWallAir = { ride, replay: scoreRecording(ride.recording) };
  }
  return bermWallAir;
}

// ---------------------------------------------------------------------------
// The measurement, once, and the tables
// ---------------------------------------------------------------------------

/** The longest clock the tables score. */
const LONGEST_SECONDS = 120;
export const YARD_CLOCKS: readonly number[] = [60, 90, 120];

export interface YardLine {
  readonly id: string;
  readonly label: string;
  readonly recording: TrickRecording;
  /** Per clock in `YARD_CLOCKS`. */
  readonly replays: readonly TrickReplay[];
  readonly distance: number | null;
  readonly crashed: boolean;
  /** The speed on the last grounded step of every takeoff, for a continuous ride; null for a splice. */
  readonly launchSpeeds: readonly number[] | null;
}

export interface YardMeasurement {
  readonly routes: Readonly<Record<'greedy' | 'brisk' | 'greedyNo180' | 'briskNo180', {
    readonly legs: readonly YardRoutedLeg[];
    readonly firstLapSteps: number;
    readonly openerPoints: number;
  }>>;
  readonly honest: readonly YardLine[];
  readonly attacks: readonly YardLine[];
  /** The honest run the q191 ratio is taken against: the lower of the two 180 routings at 90 s. */
  readonly honestAt90: number;
  readonly trials: number;
  readonly simulatedSteps: number;
}

let measured: YardMeasurement | null = null;

export function measureYard(): YardMeasurement {
  if (measured !== null) return measured;
  const longest = durationStepsFor(LONGEST_SECONDS);
  let trials = 0;
  let simulatedSteps = 0;
  const lineOf = (id: string, label: string, recording: TrickRecording, distance: number | null,
    crashed: boolean, launchSpeeds: readonly number[] | null = null): YardLine => ({
    id, label, recording, distance, crashed, launchSpeeds,
    replays: YARD_CLOCKS.map((seconds) => scoreAt(recording, seconds)),
  });
  const routes = {} as Record<'greedy' | 'brisk' | 'greedyNo180' | 'briskNo180', {
    legs: readonly YardRoutedLeg[]; firstLapSteps: number; openerPoints: number;
  }>;
  const honest: YardLine[] = [];
  for (const [key, selector, spins] of [
    ['greedy', 'points', true], ['brisk', 'rate', true],
    ['greedyNo180', 'points', false], ['briskNo180', 'rate', false],
  ] as const) {
    const legs = yardRoutedLine(selector, spins);
    const spliced = yardRoutedRecording(legs, longest);
    trials += 1;
    simulatedSteps += spliced.opener.ride.steps;
    routes[key] = { legs, firstLapSteps: spliced.firstLapSteps, openerPoints: spliced.opener.points };
    const routing = selector === 'points' ? 'greediest' : 'briskest';
    honest.push(lineOf(`routed-${key}`,
      `the routed line, ${routing}${spins ? '' : ', no 180 (S4\'s rule)'} (spliced proxy, ${
        (spliced.firstLapSteps * STEP_SECONDS).toFixed(2)} s the first lap)`,
      spliced.recording, null, false));
  }
  trials += attemptCost.trials;
  simulatedSteps += attemptCost.steps;
  const attacks = YARD_ATTACKS.map((attack) => {
    const ride = attack.record(longest);
    trials += 1;
    simulatedSteps += ride.recording.steps.length;
    return lineOf(attack.id, attack.label, ride.recording, ride.distance, ride.crashed, ride.launchSpeeds);
  });
  const at90 = YARD_CLOCKS.indexOf(90);
  const honestAt90 = Math.min(honest[0].replays[at90].scores[0], honest[1].replays[at90].scores[0]);
  measured = { routes, honest, attacks, honestAt90, trials, simulatedSteps };
  return measured;
}

/** The q191 verdict at this venue, read off the measurement (D16's rule). */
export function yardQ191(measurement: YardMeasurement = measureYard()): {
  readonly pair: number;
  readonly honest: number;
  readonly ratio: number;
  readonly merge: boolean;
} {
  const at90 = YARD_CLOCKS.indexOf(90);
  const pairLine = measurement.attacks.find((line) => line.id === 'pair-stair-euro');
  if (pairLine === undefined) throw new Error('yardTrickBench: the D16 pair was not measured');
  const pair = pairLine.replays[at90].scores[0];
  const ratio = pair / Math.max(1, measurement.honestAt90);
  return { pair, honest: measurement.honestAt90, ratio, merge: ratio >= 0.5 };
}

const fixed = (value: number, digits = 2): string => value.toFixed(digits);

function legRows(legs: readonly YardRoutedLeg[], firstLapOpener: number): string[][] {
  const rows: string[][] = [];
  let at = 0;
  legs.forEach((leg, index) => {
    const steps = index === 0 ? firstLapOpener : leg.approachSteps + leg.attempt.ride.steps;
    at += steps;
    const awards = leg.attempt.replay.awards.filter((award) => award.kinds.length > 0);
    rows.push([
      String(index + 1),
      leg.attempt.leg.zone,
      fixed(leg.attempt.speed, 0),
      leg.attempt.recipe.label,
      String(leg.attempt.points),
      awards.map((award) => `${award.kinds.join(' + ')} (${award.landing})`).join('; ') || '—',
      fixed(at * STEP_SECONDS, 1),
    ]);
  });
  return rows;
}

/** The yard's tables, in print order. */
export function yardTables(): readonly BenchTable[] {
  const m = measureYard();
  const at90 = YARD_CLOCKS.indexOf(90);
  const q191 = yardQ191(m);
  const lapMetres = (legs: readonly YardRoutedLeg[]): number =>
    legs.reduce((total, leg) => total + leg.approachMetres + leg.attempt.ride.distance, 0);
  const census = YARD_LEGS.map((leg) => {
    const all = yardAttempts(leg);
    const on = all.filter((value) => value.ridesOn);
    const best = on.reduce<YardAttempt | null>((top, value) => top === null || value.points > top.points ? value : top, null);
    return [leg.zone, leg.label, leg.speeds.join(' / '), String(all.length), String(on.length),
      String(all.filter((value) => value.ride.crashed).length), best === null ? '—' : String(best.points),
      fixed(polylineMetres(leg.approach), 1)];
  });

  const y1: BenchTable = {
    id: 'Y1',
    title: 'Y1 — Foundry Yard: the honest line, leg by leg (§51.5.4)',
    geometry: [
      `\`foundry-yard-r1\` ridden through \`EucController\` with the yard's transition rules; ${YARD_LEGS.length} legs in §51.5.4's order, the first ridden from the solo start at rest.`,
      `Greediest lap: ${fixed(yardLapSteps(m.routes.greedy.legs) * STEP_SECONDS)} s and ${fixed(lapMetres(m.routes.greedy.legs), 0)} m after the first (first lap ${fixed(m.routes.greedy.firstLapSteps * STEP_SECONDS)} s). Briskest: ${fixed(yardLapSteps(m.routes.brisk.legs) * STEP_SECONDS)} s and ${fixed(lapMetres(m.routes.brisk.legs), 0)} m (first lap ${fixed(m.routes.brisk.firstLapSteps * STEP_SECONDS)} s). §51.5.4's polyline lap is 568 m.`,
      `No 180 (S4's rule): greediest first lap ${fixed(m.routes.greedyNo180.firstLapSteps * STEP_SECONDS)} s, briskest ${fixed(m.routes.briskNo180.firstLapSteps * STEP_SECONDS)} s.`,
    ],
    notes: [
      '**A leg is one steered attempt from its entry pose to its exit gate.** Every leg is ridden at each of its speeds with all eight recipes (`trickRunBench.ts`\'s six, plus an uncharged hop with Hop held and an uncharged hop + 180 + re-hold) and each of its press timings. An attempt **rides on** when the wheel crosses the exit gate grounded, uncrashed, rolling forward within 60° of the line, inside the leg\'s own line plus 20 m. A 180 lands fakie: it rides on only once the driver has turned the wheel round, and that time is in the attempt.',
      '**Why the 180 is in this lap and not in Switchback\'s.** S4\'s driver rides straight windows and cannot ride out of a fakie landing, so no 180 ever reached a merge there. This driver steers, so a 180 is an ordinary leg here; the no-180 routings are printed beside it for the like-for-like comparison with S4.',
      '**The approaches are quiet time** at the next attempt\'s speed, measured along a polyline from the previous exit gate (Y4\'s last column). The breather (alley → bowl S deck → W deck → x 92 → run-up) is the K2 leg\'s approach from the second lap on.',
      '`banked by` is the end of that leg on the first lap, in run seconds. The columns are the greediest routing\'s; the briskest picks the same attempt at most legs.',
    ],
    columns: ['#', 'zone', 'm/s', 'recipe', 'points', 'tricked flights (landing)', 'banked by s'],
    rows: legRows(m.routes.greedy.legs, yardAttempt(m.routes.greedy.legs[0].attempt.leg,
      m.routes.greedy.legs[0].attempt.speed, m.routes.greedy.legs[0].attempt.recipe,
      m.routes.greedy.legs[0].attempt.presses, true).ride.steps),
    trials: 0,
    simulatedSteps: 0,
  };

  const lineRow = (line: YardLine): string[] => {
    const replay = line.replays[at90];
    const book = replay.result.books[0];
    const first = replay.awardSteps.length === 0 ? '—' : fixed((replay.awardSteps[0] + 1) * STEP_SECONDS, 1);
    return [
      line.label,
      ...line.replays.map((value) => String(value.scores[0])),
      fixed(replay.scores[0] / Math.max(1, m.honestAt90)),
      String(replay.awards.length),
      String(book.breakdown.repeatAdjustment),
      first,
      line.distance === null ? '—' : fixed(line.distance, 0),
      line.crashed ? 'yes' : 'no',
    ];
  };
  const y2: BenchTable = {
    id: 'Y2',
    title: 'Y2 — Foundry Yard: points per 60 / 90 / 120 s, the honest line against every q191 attack',
    geometry: [
      `The honest run at 90 s is **${m.honestAt90}** — the lower of the two 180 routings. D16's pair (stair-deck ↔ euro-gap) banks **${q191.pair}**, **${fixed(q191.ratio)}×** the honest run.`,
      `The best attack measured is *${[...m.attacks].sort((a, b) => b.replays[at90].scores[0] - a.replays[at90].scores[0])[0].label}* at ${[...m.attacks].sort((a, b) => b.replays[at90].scores[0] - a.replays[at90].scores[0])[0].replays[at90].scores[0]}.`,
    ],
    notes: [
      '**Every attack row is one continuous ride from the normal solo start** — `Game.resetChallengeRider`\'s pose, 18 m behind the start line, at rest — with every approach, braking, settling and travel step in it, and no reset or teleport. The stand-still rows stop dead (|speed| < 0.005 m/s) and settle 30 steps before each hop; the wall rows hop on the face with a full charge, tap the 180 in the come-back air, re-hold for the one-foot, land facing the wall and roll straight back out to re-line-up.',
      '**What the per-feature clock does to each attack.** A zone camped continuously halves its whole flight value on every landing: about two full flights (896 for a stopped 448 bundle, 958 for the wall\'s 479) is the cap per zone, whatever the cadence. An attack therefore banks at most that cap times the zones it can keep loaded; the pairs reach it, the three-zone lines spend too long travelling to.',
      '`× honest` divides the 90 s total by the honest run above. `repeat cost` is the referee\'s `repeatAdjustment` at 90 s.',
    ],
    columns: ['line', ...YARD_CLOCKS.map((seconds) => `${seconds} s points`), '× honest at 90 s',
      'flights at 90 s', 'repeat cost at 90 s', 'first award s', 'distance m (120 s)', 'crashed'],
    rows: [...m.honest, ...m.attacks].map(lineRow),
    trials: m.trials,
    simulatedSteps: m.simulatedSteps,
  };

  const wallLegs = YARD_LEGS.filter((leg) => leg.zone.startsWith('qp-east-'));
  const d19Rows: string[][] = [];
  let unspunSpins = 0;
  let wallFlights = 0;
  for (const leg of wallLegs) {
    for (const value of yardAttempts(leg)) {
      for (const award of value.replay.awards) {
        if (award.zone === null || !award.zone.startsWith('qp-east-')) continue;
        wallFlights += 1;
        if (award.kinds.includes('spin-landed') && value.recipe.spinTap === undefined) unspunSpins += 1;
      }
    }
  }
  const mid = YARD_LEGS.find((leg) => leg.zone === 'qp-east-mid');
  if (mid !== undefined) {
    for (const speed of mid.speeds) {
      for (const id of ['roll', 'lightFoot', 'oneFoot', 'spin', 'both']) {
        const recipe = YARD_RECIPES.find((candidate) => candidate.id === id);
        if (recipe === undefined) continue;
        const value = yardAttempts(mid).find((candidate) => candidate.speed === speed
          && candidate.recipe.id === id && candidate.presses === mid.presses[1]);
        if (value === undefined) continue;
        const wall = value.replay.awards.find((award) => award.zone === 'qp-east-mid');
        d19Rows.push([
          `${fixed(speed, 0)} m/s`, recipe.label, String(value.ride.comeBackAirs),
          wall === undefined ? '—' : (wall.kinds.join(' + ') || 'none'),
          wall === undefined ? '—' : wall.landing,
          wall === undefined ? '0' : String(wall.points),
        ]);
      }
    }
  }
  {
    const berm = yardBermWallAir();
    const wall = berm.replay.awards.find((award) => award.kinds.length > 0) ?? berm.replay.awards[0];
    d19Rows.push([
      `${fixed(YARD_BERM_WALL_AIR.speed, 0)} m/s, the berm's outer wall (z 158.25)`, YARD_BERM_WALL_AIR.recipe.label,
      String(berm.ride.comeBackAirs),
      wall === undefined ? '—' : `${wall.zone ?? 'off-feature'}: ${wall.kinds.join(' + ') || 'none'}`,
      wall === undefined ? '—' : wall.landing,
      wall === undefined ? '0' : String(wall.points),
    ]);
  }
  const y3: BenchTable = {
    id: 'Y3',
    title: 'Y3 — Foundry Yard: D19 in the referee — a come-back air is a flight, and its half turn is never a spin',
    geometry: [
      `Across every attempt at the three east-wall legs, ${wallFlights} flights launched from a \`qp-east-*\` zone were banked; **${unspunSpins}** of them paid the 180 without a 180 tap.`,
    ],
    notes: [
      'The rows are the `qp-east-mid` leg at its middle press timing, and one come-back air off the snake berm\'s outer wall (its zone named). A hands-off come-back air pays its landing and nothing else; a hop up the face carries the hop\'s credit (the charged hop at full crouch) and the held one-foot into the come-back air; the 180 pays only when it is tapped, and then once — two half turns land the rider facing the wall, and the controller rolls them back out in reverse.',
    ],
    columns: ['approach', 'recipe', 'come-back airs', 'kinds banked on the wall flight', 'landing', 'points'],
    rows: d19Rows,
    trials: 0,
    simulatedSteps: 0,
  };

  const y4: BenchTable = {
    id: 'Y4',
    title: 'Y4 — Foundry Yard: every leg\'s attempts',
    geometry: [],
    notes: [
      '`ride on` counts the attempts that crossed their exit gate (Y1\'s rule); the rest crashed (a roll into a ledge, pad or planter is a kerb above the step-up limit, by design), ran out of steps, or wandered past the turn-round allowance. `best` is the highest single-attempt total among those that ride on.',
    ],
    columns: ['zone', 'leg', 'speeds m/s', 'attempts', 'ride on', 'crashed', 'best', 'approach m'],
    rows: census,
    trials: 0,
    simulatedSteps: 0,
  };
  return [y2, y1, y3, y4];
}
