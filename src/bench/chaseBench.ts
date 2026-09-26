/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The chase bench — M39 Part P, §39.6b.4 / §39.6b.4b, `docs/M39_CHASE.md` §2g.
 *
 * "Three passes have needed it and rebuilt it from `/tmp`" — so it is checked
 * in: a headless composition of **production parts only** (`CpuRider`,
 * `EucController`, `Paddle`, `ChaseRoom`, `copPack`, `planRegroup`) against
 * the scripted riders of `chaseScripts.ts`, on real generated town seeds, at
 * the fixed step, with N outlaws and M cops from its first build so the couch
 * face adds rows and not a second tool. No browser, no three.js, and no new
 * abstraction over the game: each step runs the order `docs/M39_CHASE.md` §2h
 * says Game will run — every outlaw, then every pursuer (brain with the pack
 * input → controller → paddle, landed strikes to `recordStrike`), then
 * `room.step`, then its demands performed as Game performs them.
 *
 * This file measures and `tools/chase-bench.mjs` prints, the
 * `jumpBench.ts` / `jump-bench.mjs` split. The numbers are evidence, not
 * assertions: `chaseBench.test.ts` pins only determinism and the wiring. The
 * owner's ride is still the only judge of fun.
 *
 * Measuring rules (AGENTS, "Measuring performance"): the brain-cost rows are
 * `performance.now()` percentiles sampled inside our own code around the
 * pursuers' block of each fixed step — never a frame interval, never FPS.
 * Every other row is a count of simulated steps and is machine-independent.
 */

import { AUDIO, CHASE, EUC, KNOCKABOUT, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import {
  ChaseRoom,
  roomSpec,
  type ChaseRoomInput,
  type OutlawFacts,
  type OutlawStatus,
  type PursuerFacts,
} from '../simulation/chase.ts';
import {
  chooseIntercept,
  choosePatrolPosts,
  choosePostReturn,
  followLine,
  framedByAnyPane,
  INTERCEPT_WAKE_MARGIN_METRES,
  packmatePositions,
  packmateBands,
  type PackBody,
  type PaneView,
  type PatrolPost,
  type PatrolPosts,
} from '../simulation/copPack.ts';
import { planRegroup, regroupFloor, type RegroupRefusals } from '../simulation/copRegroup.ts';
import { COP_WHEEL_TUNING, CpuRider } from '../simulation/cpuRider.ts';
import type { Spawn } from '../simulation/EucController.ts';
import { Paddle, type HittableSet, type HittableVolume } from '../simulation/paddle.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { buildRouteField, type RouteBlocker, type RouteField } from '../simulation/routeField.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from '../simulation/routeSpine.ts';
import { raceGridSlot } from '../simulation/spawnSlots.ts';
import { StreetLoops } from '../simulation/streetLoops.ts';
import { createGroundSample } from '../simulation/world.ts';
import {
  buildEvaderCourse,
  createBody,
  findHideSpots,
  hazardsOnLine,
  HumanCopTarget,
  movedByReset,
  OUTLAW_WHEEL,
  PaneCamera,
  paneHalfAngle,
  rememberPose,
  ScriptedOutlaw,
  writeQuarry,
  writeView,
  type BenchBody,
  type EvaderCourse,
  type HazardOnLine,
  type HideSpot,
  type ScriptKind,
  HIDE_FREEZE_METRES,
  HIDE_SHUFFLE_METRES,
  SEE_COP_METRES,
  SPRINT_CORNERING_MARGIN,
  SPRINT_SPEED_SHARE,
} from './chaseScripts.ts';

export { SCRIPT_KINDS, type ScriptKind } from './chaseScripts.ts';

// ---------------------------------------------------------------------------
// The corpus, the rooms, the bench's own constants
// ---------------------------------------------------------------------------

/**
 * The six-seed town corpus `docs/M39_PHASE0.md` pinned and the city and ring
 * revisions reused (§2g): the default `euc` town, the dense `route-41`, the
 * folded and chase cases `sweep-39` and `sweep-15`, the hilly `euc-7`, a word seed.
 */
export const CHASE_CORPUS = ['euc', 'route-41', 'sweep-39', 'sweep-15', 'euc-7', 'harbour-spark-42'] as const;

export type BenchRoomId = 'solo1' | 'solo3' | '2v2' | '3v1' | 'h1v1' | 'h2v1' | 'h3v1';

export interface BenchRoom {
  readonly id: BenchRoomId;
  readonly outlaws: number;
  readonly humanCop: boolean;
  /** CPU pursuers (0 beside a human cop). */
  readonly cpu: number;
  /** Human panes: the outlaws plus a seated cop. One pane is the solo face. */
  readonly views: number;
  readonly label: string;
}

function defineRoom(id: BenchRoomId, outlaws: number, humanCop: boolean, cpu: number, label: string): BenchRoom {
  return Object.freeze({ id, outlaws, humanCop, cpu, views: outlaws + (humanCop ? 1 : 0), label });
}

/**
 * The rooms (§2g): the solo rows at one and three CPU cops, the couch's CPU
 * rooms 2v2 and 3v1, and the human-cop rooms 1v1, 2v1 and 3v1. `solo1` is
 * `roomSpec(1, false, 1)` — the `?cops=1` probe, today's one-cop chase; `solo3`
 * is the rule at one human (q207).
 */
export const BENCH_ROOMS: Readonly<Record<BenchRoomId, BenchRoom>> = Object.freeze({
  solo1: defineRoom('solo1', 1, false, 1, '1 outlaw v 1 CPU cop (the one-cop baseline)'),
  solo3: defineRoom('solo3', 1, false, 3, '1 outlaw v 3 CPU cops (the solo face)'),
  '2v2': defineRoom('2v2', 2, false, 2, '2 outlaws v 2 CPU cops'),
  '3v1': defineRoom('3v1', 3, false, 1, '3 outlaws v 1 CPU cop'),
  h1v1: defineRoom('h1v1', 1, true, 0, '1 outlaw v a human cop'),
  h2v1: defineRoom('h2v1', 2, true, 0, '2 outlaws v a human cop'),
  h3v1: defineRoom('h3v1', 3, true, 0, '3 outlaws v a human cop'),
});

export const ROOM_IDS: readonly BenchRoomId[] = Object.freeze(['solo1', 'solo3', '2v2', '3v1', 'h1v1', 'h2v1', 'h3v1']);
/** The solo rooms are ridden by every script; the couch rooms by evaders (§2g, "The outlaws are evaders"). */
export const SOLO_ROOMS: readonly BenchRoomId[] = Object.freeze(['solo1', 'solo3']);
/**
 * The couch room ridden by every script as well (the brutal pass, 2026-09-25):
 * the owner's two-player ride against two CPU cops had "same issues as single
 * player", so 2v2 is measured with each script on both outlaws, beside the
 * evader rows every couch room keeps (C5).
 */
export const SCRIPTED_COUCH_ROOMS: readonly BenchRoomId[] = Object.freeze(['2v2']);
export const COUCH_ROOMS: readonly BenchRoomId[] = Object.freeze(['2v2', '3v1', 'h1v1', 'h2v1', 'h3v1']);
export const HUMAN_COP_ROOMS: readonly BenchRoomId[] = Object.freeze(['h1v1', 'h2v1', 'h3v1']);

/** Stacking: two cops this close to each other... (§39.6b.4, a bench constant off the panel, §39.6b.7). */
export const STACK_PAIR_METRES = 3;
/** ...while both are this close to the same standing outlaw. */
export const STACK_NEAR_METRES = 20;
/** The unseen-bust window: the seconds before the bust step a cop must have been heard or seen in. */
export const UNSEEN_WINDOW_SECONDS = 3;
/** Checkpoints for the human-cop viability curve: the share busted by each, seconds after GO. */
export const BELL_CURVE_SECONDS: readonly number[] = Object.freeze([60, 120, 180, 240, 300]);
/**
 * An interception (the brutal pass): a cop that was beyond the siren line of a
 * standing outlaw comes within `INTERCEPT_NEAR_METRES` of him inside
 * `INTERCEPT_CONE_RADIANS` of his heading — a cop met ahead, parked or riding.
 * It re-arms once that cop is beyond the siren line again.
 */
export const INTERCEPT_NEAR_METRES = 40;
export const INTERCEPT_CONE_RADIANS = Math.PI / 3;
/** A cop this close to a parked hider has "arrived nearby" (the hider's clock starts). */
export const HIDER_NEAR_METRES = 30;
/**
 * The hider's start (the owner's exploit is a rider already out of sight when
 * the cop comes by): he stands parked at his spot, facing the road, and
 * Dorkins starts on the road this far back up the ring from the spot's entry,
 * facing along it. The patrols stand at their posts as in every room.
 */
export const HIDDEN_COP_BACK_METRES = 100;

const STEP = 1 / SIMULATION.hz;

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

/** One seed's world, built once and shared by every room run on it (plan → spine → terrain → field). */
export interface ChaseWorld {
  readonly seed: string;
  readonly plan: LevelPlan;
  readonly sampler: PlanTerrainSampler;
  readonly spine: RouteSpine;
  readonly field: RouteField;
  readonly evader: EvaderCourse | null;
  readonly hazards: readonly HazardOnLine[];
  /** The hider's spots on this seed (`findHideSpots`), nearest the spawn first. */
  readonly hideSpots: readonly HideSpot[];
}

/** The world the way `cpuRider.test.ts`'s 48-seed gates build it: plan → spine → terrain sampler → one shared field. */
export function buildChaseWorld(seed: string): ChaseWorld {
  const { plan } = generateLevel(seed);
  const spine = RouteSpine.fromPlan(plan);
  if (spine === null) throw new Error(`chase bench: ${seed} has no route spine`);
  const sampler = new PlanTerrainSampler(plan);
  const field = buildRouteField(spine, plan, sampler);
  return {
    seed,
    plan,
    sampler,
    spine,
    field,
    evader: buildEvaderCourse(plan, sampler),
    hazards: hazardsOnLine(plan, spine),
    hideSpots: findHideSpots(plan, spine, sampler, new StreetLoops(plan, { rings: field.streetRings, mainLengths: field.streetMainLengths })),
  };
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** The bell, seconds. Absent: `CHASE.escapeSeconds` solo, `CHASE.couchEscapeSeconds` in a couch room. */
  readonly seconds?: number;
  /** Collect the per-step brain-cost samples (`performance.now()`). Off for the determinism test. */
  readonly timing?: boolean;
  /**
   * The seated human cop's wheel: 'seat' (default) is the player's table, as a
   * couch seat wearing the cop is built; 'cop' gives him `COP_WHEEL_TUNING`'s
   * cutout edge, the CPU cop's. A probe for the viability rows (§21.7), not a rule.
   */
  readonly humanCopWheel?: 'seat' | 'cop';
  /** The hider's spot, an index into `ChaseWorld.hideSpots` (outlaw k takes the next k-th). Default 0. */
  readonly hideSpot?: number;
  /** A probe's eyes: called after every running step with the bodies and brains. Never used by the report. */
  readonly onStep?: (seconds: number, outlaws: readonly BenchBody[], cops: readonly { readonly body: BenchBody; readonly brain: CpuRider; readonly parked: boolean }[]) => void;
}

export interface RunResult {
  readonly seed: string;
  readonly room: BenchRoomId;
  readonly script: ScriptKind;
  readonly outlaws: number;
  readonly pursuers: number;
  readonly bellSeconds: number;
  /** Room seconds run (GO to the end). */
  readonly seconds: number;
  readonly roomSteps: number;
  readonly standingOutlawSteps: number;
  readonly audibleSteps: number;
  readonly worstQuietSeconds: number;
  readonly caught: number;
  readonly touched: number;
  readonly strayed: number;
  readonly gaveUp: number;
  readonly escaped: number;
  /** Seconds from GO to the first caught or touched; null when nobody was busted. */
  readonly firstBustSeconds: number | null;
  /** Room seconds of every caught or touched, in order: the viability curve. */
  readonly bustSeconds: readonly number[];
  readonly stackSteps: number;
  readonly stackCandidateSteps: number;
  /** Unseen busts: the pane's measured half-angle (the row), `returnConeRadians` (the variant), and the strict "heard". */
  readonly unseen: number;
  readonly unseenWideCone: number;
  readonly unseenStrict: number;
  readonly wakesProximity: number;
  readonly wakesQuiet: number;
  readonly postReturnsAccepted: number;
  readonly postReturnsRefused: number;
  /** Patrols sent ahead of an outlaw (`intercept`): stood on his road, fell back to a post, or refused. */
  readonly interceptsAhead: number;
  readonly interceptsToPost: number;
  readonly interceptsRefused: number;
  readonly tailReturnsAccepted: number;
  readonly tailReturnsRefused: number;
  /** Tail returns dropped by Game's own two early-outs: the cop down, the outlaw on a loop's alternate. */
  readonly tailReturnsSkipped: number;
  readonly returnsInPane: number;
  readonly unchasedSteps: number;
  readonly reDeals: number;
  readonly outlawCrashes: number;
  readonly copCrashes: number;
  /** Times an evader's cursor went back one lap at the unclosed course's join (0 on a closed course). */
  readonly evaderLaps: number;
  readonly postSource: PatrolPosts['source'] | 'none';
  /** Cops met ahead (`INTERCEPT_NEAR_METRES`, `INTERCEPT_CONE_RADIANS`), over every standing outlaw. */
  readonly interceptions: number;
  /** The hider's spot label, or null for any other script. */
  readonly hideLabel: string | null;
  /** Room seconds when the (last) hider parked, null when none did. */
  readonly hiddenAt: number | null;
  /** Room seconds a cop first came within `HIDER_NEAR_METRES` of a parked hider, null for never. */
  readonly copNearAt: number | null;
  /**
   * Seconds from a cop arriving near a parked hider to his bust — the worst
   * over the hiders; 0 when every hider was busted before he could park;
   * null when a parked hider stood to the bell.
   */
  readonly hideBustAfterNear: number | null;
  /** Per running step, ms: all pursuers' brain + controller + paddle (the human cop's script excluded). */
  readonly copMs: Float64Array | null;
  /** Per running step, ms: the outlaws' controllers only (their scripts excluded). */
  readonly seatMs: Float64Array | null;
}

/** What one pursuer is in the bench: Game's `Pursuer` record (§2h), no more. */
interface BenchPursuer {
  readonly kind: 'cpu' | 'human';
  readonly role: 'tail' | 'patrol';
  readonly body: BenchBody;
  readonly brain: CpuRider;
  readonly paddle: Paddle;
  readonly post: PatrolPost | null;
  parked: boolean;
  strikeSwing: number;
  /** Placed by a demand since the last room step: his bust and touch facts are void for one step. */
  placed: boolean;
  readonly human: HumanCopTarget | null;
  readonly bands: RouteBlocker[];
  readonly quarry: { x: number; y: number; z: number; speed: number; id: number };
  readonly pack: { bands: readonly RouteBlocker[]; followLine: number | null; mates: readonly { x: number; z: number }[] };
  readonly mates: { x: number; z: number }[];
}

/** The outlaws as one paddle's hittable set: `rider-<k>` volumes, live while standing and up (Game's `chasing`). */
class OutlawTargets implements HittableSet {
  readonly volumes: (HittableVolume & { x: number; y: number; z: number; radius: number })[];
  readonly live: boolean[];

  constructor(count: number) {
    this.volumes = Array.from({ length: count }, (_unused, k) => ({ id: `rider-${k}`, x: 0, y: 0, z: 0, radius: CHASE.riderHitRadius }));
    this.live = new Array<boolean>(count).fill(false);
  }

  place(k: number, body: BenchBody, live: boolean): void {
    const volume = this.volumes[k];
    volume.x = body.pose.x;
    volume.y = body.pose.y + CHASE.riderHitHeight;
    volume.z = body.pose.z;
    this.live[k] = live;
  }

  eachNear(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, visit: (volume: HittableVolume) => void): void {
    for (let k = 0; k < this.volumes.length; k += 1) {
      if (!this.live[k]) continue;
      const volume = this.volumes[k];
      if (volume.x + volume.radius < minX || volume.x - volume.radius > maxX) continue;
      if (volume.y + volume.radius < minY || volume.y - volume.radius > maxY) continue;
      if (volume.z + volume.radius < minZ || volume.z - volume.radius > maxZ) continue;
      visit(volume);
    }
  }
}

function now(): number {
  return performance.now();
}

/**
 * Run one room on one world for one bell. Deterministic apart from the two
 * timing arrays: the same world, room and script give the same numbers.
 */
export function runRoom(world: ChaseWorld, roomId: BenchRoomId, script: ScriptKind, options: RunOptions = {}): RunResult {
  const room = BENCH_ROOMS[roomId];
  const { plan, sampler, spine, field } = world;
  const outlawCount = room.outlaws;
  const couch = room.views >= 2;
  const spec = roomSpec(outlawCount, room.humanCop, room.humanCop ? undefined : room.cpu);
  const pursuerCount = spec.pursuers.length;
  const bellSeconds = options.seconds ?? (couch ? CHASE.couchEscapeSeconds : CHASE.escapeSeconds);
  const timing = options.timing === true;
  const streetLoops = new StreetLoops(plan, { rings: field.streetRings, mainLengths: field.streetMainLengths });

  // -- The outlaws: the plain spawn alone, grid slots from two (R-22) --------
  const line = { centre: plan.spawn.position, headingY: plan.spawn.headingY };
  const ground = createGroundSample();
  const spineSample = createSpineSample();
  const spawns: Spawn[] = outlawCount === 1
    ? [plan.spawn]
    : Array.from({ length: outlawCount }, (_unused, k) => raceGridSlot(line, k, sampler));
  const hideSpots = world.hideSpots;
  const hideFor = (k: number): HideSpot | null => (script !== 'hider' || hideSpots.length === 0
    ? null
    : hideSpots[((options.hideSpot ?? 0) + k) % hideSpots.length]);
  // The hider starts parked at his spot, facing the road he left.
  if (script === 'hider') {
    for (let k = 0; k < outlawCount; k += 1) {
      const spot = hideFor(k);
      if (spot === null) continue;
      spine.sample(spot.entry, spineSample);
      sampler.sampleGround(spot.x, spot.z, ground);
      spawns[k] = {
        position: { x: spot.x, y: ground.height, z: spot.z },
        headingY: Math.atan2(spineSample.x - spot.x, spineSample.z - spot.z),
      };
    }
  }
  const outlaws = spawns.map((spawn, k) => new ScriptedOutlaw(
    script, plan, sampler, spine, field, world.evader, world.hazards, spawn, hideFor(k),
  ));
  for (const outlaw of outlaws) outlaw.startHidden();

  // The rearmost outlaw along the spawn heading: the tail starts spawnGap behind him.
  const headX = Math.sin(plan.spawn.headingY);
  const headZ = Math.cos(plan.spawn.headingY);
  let rear = 0;
  for (let k = 1; k < outlawCount; k += 1) {
    const along = (spawns[k].position.x - line.centre.x) * headX + (spawns[k].position.z - line.centre.z) * headZ;
    const rearAlong = (spawns[rear].position.x - line.centre.x) * headX + (spawns[rear].position.z - line.centre.z) * headZ;
    if (along < rearAlong) rear = k;
  }
  const behind = (metres: number): Spawn => {
    // `placeCopBehindRider`'s shape: behind along the rider's heading, on the ground.
    const pose = outlaws[rear].body.pose;
    const x = pose.x - Math.sin(pose.headingY) * metres;
    const z = pose.z - Math.cos(pose.headingY) * metres;
    sampler.sampleGround(x, z, ground);
    return { position: { x, y: ground.height, z }, headingY: pose.headingY };
  };

  // -- The pursuers ------------------------------------------------------------
  const makePursuer = (index: number, post: PatrolPost | null, spawn: Spawn): BenchPursuer => {
    const entry = spec.pursuers[index];
    const human = entry.kind === 'human';
    // A human cop is a seat on the player's wheel (§2h: a couch-chase seat
    // wearing the cop); a CPU cop keeps his own cutout edge (COP_WHEEL_TUNING).
    const seatWheel = human && options.humanCopWheel !== 'cop';
    const body = createBody(plan, sampler, spawn, seatWheel ? OUTLAW_WHEEL : COP_WHEEL_TUNING);
    const brain = new CpuRider(spine, plan, sampler, field);
    // The human cop's brain believes the wheel he rides: the player's edge.
    if (seatWheel) brain.cutoutSpeedShare = EUC.cutoutSpeedShare;
    return {
      kind: entry.kind,
      role: entry.role,
      body,
      brain,
      paddle: new Paddle(),
      post,
      parked: false,
      strikeSwing: -1,
      placed: false,
      human: human ? new HumanCopTarget() : null,
      bands: [],
      quarry: { x: 0, y: 0, z: 0, speed: 0, id: -1 },
      pack: { bands: [], followLine: null, mates: [] },
      mates: [],
    };
  };

  const tailSpawn = (): Spawn => {
    const spot = hideFor(0);
    if (spot === null) return behind(CHASE.spawnGapMetres);
    spine.sample(spot.entry - HIDDEN_COP_BACK_METRES, spineSample);
    sampler.sampleGround(spineSample.x, spineSample.z, ground);
    return { position: { x: spineSample.x, y: ground.height, z: spineSample.z }, headingY: spineSample.headingY };
  };
  const pursuers: BenchPursuer[] = [makePursuer(0, null, tailSpawn())];
  writeView(pursuers[0].body);
  pursuers[0].brain.place(pursuers[0].body.view);

  let posts: PatrolPosts | null = null;
  const patrols = pursuerCount - 1;
  if (patrols > 0) {
    const judgeBrain = pursuers[0].brain;
    posts = choosePatrolPosts(plan, spine, field.blockers, sampler, patrols, (distance, direction) => judgeBrain.landingAllowance(distance, direction));
    for (let i = 0; i < patrols; i += 1) {
      const post = posts.posts[i] ?? null;
      const spawn: Spawn = post === null
        ? behind(CHASE.spawnGapMetres + (i + 1) * CHASE.packSpacingMetres)
        : { position: { x: post.x, y: post.y, z: post.z }, headingY: post.headingY };
      const pursuer = makePursuer(i + 1, post, spawn);
      pursuer.parked = post !== null;
      writeView(pursuer.body);
      pursuer.brain.place(pursuer.body.view, post === null ? -1 : post.distance);
      pursuers.push(pursuer);
    }
  }

  // -- Panes: one camera per human (§2g; the seat camera re-derived three-free) --
  const outlawPanes = outlaws.map((outlaw) => {
    const camera = new PaneCamera();
    camera.snap(outlaw.body.pose);
    return camera;
  });
  const copPane = room.humanCop ? new PaneCamera() : null;
  copPane?.snap(pursuers[0].body.pose);
  const halfAngle = paneHalfAngle(room.views);
  const allPanes: PaneView[] = [];
  const ownPane: PaneView[] = [{ x: 0, z: 0, headingY: 0 }];
  const refreshPanes = (): void => {
    allPanes.length = 0;
    for (let k = 0; k < outlawCount; k += 1) {
      // A busted outlaw spectates (q226): his pane follows the nearest standing
      // outlaw, else the cop — the same camera, so the same view.
      let camera = outlawPanes[k];
      if (roomState.statusOf(k) !== 'standing') {
        let nearest = -1;
        let best = Infinity;
        for (let j = 0; j < outlawCount; j += 1) {
          if (roomState.statusOf(j) !== 'standing') continue;
          const d = Math.hypot(outlaws[j].body.pose.x - outlaws[k].body.pose.x, outlaws[j].body.pose.z - outlaws[k].body.pose.z);
          if (d < best) { best = d; nearest = j; }
        }
        if (nearest >= 0) camera = outlawPanes[nearest];
        else if (copPane !== null) camera = copPane;
      }
      allPanes.push({ x: camera.x, z: camera.z, headingY: camera.yaw });
    }
    if (copPane !== null) allPanes.push({ x: copPane.x, z: copPane.z, headingY: copPane.yaw });
  };

  // -- The referee ---------------------------------------------------------------
  const roomState = new ChaseRoom();
  const startDistances = pursuers.map((pursuer) => outlaws.map((outlaw) => Math.hypot(
    pursuer.body.pose.x - outlaw.body.pose.x, pursuer.body.pose.z - outlaw.body.pose.z,
  )));
  roomState.arm(spec, {
    bellSeconds,
    countdownSeconds: couch ? KNOCKABOUT.countdownSeconds : 0,
    startDistances,
  });

  // -- Preallocated facts -------------------------------------------------------
  const outlawFacts: { offRoute: number; crashed: boolean; teleported: boolean }[] =
    outlaws.map(() => ({ offRoute: 0, crashed: false, teleported: false }));
  const pursuerFacts: { crashed: boolean; parked: boolean; speed: number; teleported: boolean; paddleArmed: boolean; distance: number[]; outlawClosing: number[] }[] =
    pursuers.map(() => ({
      crashed: false, parked: false, speed: 0, teleported: false, paddleArmed: false,
      distance: new Array<number>(outlawCount).fill(0), outlawClosing: new Array<number>(outlawCount).fill(0),
    }));
  const input: ChaseRoomInput = {
    outlaws: outlawFacts as unknown as readonly OutlawFacts[],
    pursuers: pursuerFacts as unknown as readonly PursuerFacts[],
  };
  const bodies: { distance: number; lateral: number; speed: number; standing: boolean; x: number; z: number }[] =
    pursuers.map(() => ({ distance: 0, lateral: 0, speed: 0, standing: true, x: 0, z: 0 }));
  const targets = new OutlawTargets(outlawCount);
  const standingNow = new Array<boolean>(outlawCount).fill(true);
  const humanDistances = new Array<number>(outlawCount).fill(0);
  const spineAt = createSpineLocation();
  const halfWidthAt = createSpineSample();
  const regroupScratch = { at: createSpineLocation(), sample: createSpineSample() };
  const others: { x: number; z: number }[] = [];
  const pursuerTeleported = new Array<boolean>(pursuerCount).fill(false);
  const outlawWasCrashed = new Array<boolean>(outlawCount).fill(false);
  const copWasCrashed = new Array<boolean>(pursuerCount).fill(false);

  // -- The measurements -----------------------------------------------------------
  const hz = SIMULATION.hz;
  const windowSteps = Math.round(UNSEEN_WINDOW_SECONDS * hz);
  const never = -Infinity;
  const lastHeard = pursuers.map(() => new Array<number>(outlawCount).fill(never));
  const lastHeardStrict = pursuers.map(() => new Array<number>(outlawCount).fill(never));
  const lastSeen = pursuers.map(() => new Array<number>(outlawCount).fill(never));
  const lastSeenWide = pursuers.map(() => new Array<number>(outlawCount).fill(never));
  const quietRun = new Array<number>(outlawCount).fill(0);
  const maxSteps = Math.ceil((bellSeconds + KNOCKABOUT.countdownSeconds + 2) * hz);
  const copMs = timing ? new Float64Array(maxSteps) : null;
  const seatMs = timing ? new Float64Array(maxSteps) : null;
  const bustSeconds: number[] = [];
  const counts = {
    roomSteps: 0, standingOutlawSteps: 0, audibleSteps: 0, worstQuietSteps: 0,
    caught: 0, touched: 0, strayed: 0, gaveUp: 0,
    stackSteps: 0, stackCandidateSteps: 0,
    unseen: 0, unseenWideCone: 0, unseenStrict: 0,
    wakesProximity: 0, wakesQuiet: 0,
    postReturnsAccepted: 0, postReturnsRefused: 0,
    interceptsAhead: 0, interceptsToPost: 0, interceptsRefused: 0,
    tailReturnsAccepted: 0, tailReturnsRefused: 0, tailReturnsSkipped: 0,
    returnsInPane: 0, unchasedSteps: 0, reDeals: 0, outlawCrashes: 0, copCrashes: 0,
  };
  let firstBust: number | null = null;
  const dealtCount = new Array<number>(outlawCount).fill(0);
  // Interceptions: armed per (cop, outlaw) while the cop is beyond the siren line.
  const interceptArmed = pursuers.map((pursuer) => outlaws.map((outlaw) => Math.hypot(
    pursuer.body.pose.x - outlaw.body.pose.x, pursuer.body.pose.z - outlaw.body.pose.z,
  ) > AUDIO.sirenFarMetres));
  let interceptions = 0;
  // The hider's clocks, per outlaw.
  const hiddenAt = new Array<number>(outlawCount).fill(Number.NaN);
  const nearAt = new Array<number>(outlawCount).fill(Number.NaN);
  const bustAt = new Array<number>(outlawCount).fill(Number.NaN);
  const nearMetres = (): number => roomState.bustRadiusMetres + 1;
  const framedByAny = (x: number, z: number): boolean => framedByAnyPane(
    x, z, allPanes, CHASE.returnConeRadians, CHASE.patrolReturnMetres, nearMetres(),
  );
  const refusals: RegroupRefusals = { others, spacingMetres: CHASE.packSpacingMetres, framed: framedByAny };

  const place = (pursuer: BenchPursuer, index: number, spawn: Spawn, speed: number, near: number): void => {
    pursuer.body.controller.reset(spawn, speed);
    pursuer.body.controller.writePose(pursuer.body.pose);
    rememberPose(pursuer.body);
    writeView(pursuer.body);
    pursuer.brain.place(pursuer.body.view, near);
    pursuer.paddle.cancel();
    pursuer.placed = true;
    pursuerTeleported[index] = true;
  };

  const fillOthers = (except: number): void => {
    others.length = 0;
    for (let q = 0; q < pursuerCount; q += 1) {
      if (q === except) continue;
      others.push({ x: pursuers[q].body.pose.x, z: pursuers[q].body.pose.z });
    }
  };

  let stepIndex = 0;
  let evaderLaps = 0;

  for (let guard = 0; guard < maxSteps && roomState.phase !== 'ended'; guard += 1) {
    const counting = roomState.phase === 'countdown';
    const held = roomState.pursuersHeld;
    let seatTime = 0;
    let copTime = 0;

    // -- 1. Every outlaw (the count freezes everybody, q223) -------------------
    for (let k = 0; k < outlawCount; k += 1) {
      const outlaw = outlaws[k];
      const standing = roomState.statusOf(k) === 'standing';
      standingNow[k] = standing;
      if (counting || !standing) {
        rememberPose(outlaw.body);
        outlawFacts[k].teleported = false;
        continue;
      }
      let nearest = Infinity;
      outlaw.copsInSight.length = 0;
      for (const pursuer of pursuers) {
        if (pursuer.body.controller.crashed) continue;
        nearest = Math.min(nearest, Math.hypot(pursuer.body.pose.x - outlaw.body.pose.x, pursuer.body.pose.z - outlaw.body.pose.z));
        outlaw.copsInSight.push(pursuer.body.pose);
      }
      outlaw.nearestCopMetres = nearest;
      const intent = outlaw.think(STEP);
      const t0 = timing ? now() : 0;
      outlaw.ride(STEP, intent);
      if (timing) seatTime += now() - t0;
      outlawFacts[k].teleported = movedByReset(outlaw.body, STEP);
      outlawPanes[k].step(STEP, outlaw.body.pose);
    }

    // -- 2. Every pursuer: brain (with the pack input) → controller → paddle ---
    for (let p = 0; p < pursuerCount; p += 1) {
      const pursuer = pursuers[p];
      const { brain, body } = pursuer;
      bodies[p].distance = brain.routeDistance;
      bodies[p].lateral = brain.lineLateral;
      bodies[p].speed = Math.abs(body.pose.speed);
      bodies[p].standing = !body.controller.crashed;
      bodies[p].x = body.pose.x;
      bodies[p].z = body.pose.z;
    }
    for (let k = 0; k < outlawCount; k += 1) {
      targets.place(k, outlaws[k].body, standingNow[k] && !outlaws[k].body.controller.crashed);
    }
    for (let p = 0; p < pursuerCount; p += 1) {
      const pursuer = pursuers[p];
      const { brain, body, paddle } = pursuer;
      if (counting) {
        rememberPose(body);
        pursuerTeleported[p] = pursuer.placed;
        continue;
      }
      writeView(body);
      let intent: ActionSnapshot = NEUTRAL_ACTIONS;
      let t0 = timing ? now() : 0;
      if (pursuer.human !== null) {
        // The scripted human cop (§2g, R-23): no director, no regroup, the
        // nearest standing outlaw by straight line with the hysteresis. His
        // script is not timed; his controller and paddle are.
        for (let k = 0; k < outlawCount; k += 1) {
          humanDistances[k] = Math.hypot(outlaws[k].body.pose.x - body.pose.x, outlaws[k].body.pose.z - body.pose.z);
        }
        const k = pursuer.human.choose(STEP, humanDistances, standingNow);
        const quarry = k >= 0 && !outlaws[k].body.controller.crashed ? writeQuarry(pursuer.quarry, outlaws[k].body, k) : null;
        if (!held) intent = brain.step(STEP, body.view, quarry);
        t0 = timing ? now() : 0;
      } else if (!pursuer.parked && !held) {
        const k = roomState.quarryOf(p);
        const quarry = k >= 0 && !outlaws[k].body.controller.crashed ? writeQuarry(pursuer.quarry, outlaws[k].body, k) : null;
        pursuer.pack.bands = packmateBands(p, bodies as readonly PackBody[], spine, pursuer.bands);
        spine.sample(brain.routeDistance, halfWidthAt);
        pursuer.pack.followLine = followLine(p, pursuer.role, bodies as readonly PackBody[], halfWidthAt.halfWidth, CHASE.packSpacingMetres, spine);
        pursuer.pack.mates = packmatePositions(p, bodies as readonly PackBody[], pursuer.mates);
        intent = brain.step(STEP, body.view, quarry, pursuer.pack);
      }
      const wantsSwing = intent.swing;
      rememberPose(body);
      body.controller.step(STEP, intent);
      body.controller.writePose(body.pose);
      const hits = paddle.step(
        STEP,
        { x: body.pose.x, y: body.pose.y, z: body.pose.z, headingY: body.pose.headingY },
        body.controller.crashed ? false : wantsSwing,
        targets,
        brain.swingSide,
      );
      if (timing) copTime += now() - t0;
      for (const hit of hits) {
        // One swing, one strike (Game.stepCop's latch), then the hard or soft knock.
        if (pursuer.strikeSwing === paddle.swingCount) continue;
        const k = Number(hit.id.slice(6));
        pursuer.strikeSwing = paddle.swingCount;
        roomState.recordStrike(p, k);
        const victim = outlaws[k].body.controller;
        if (paddle.committed && victim.hardKnock(paddle.headTravelX, paddle.headTravelZ)) continue;
        victim.softKnock(CHASE.strikeSpeedCost);
      }
      pursuerTeleported[p] = pursuer.placed || movedByReset(body, STEP);
      const crashed = body.controller.crashed;
      if (crashed && !copWasCrashed[p]) counts.copCrashes += 1;
      copWasCrashed[p] = crashed;
    }
    if (copPane !== null && !counting) copPane.step(STEP, pursuers[0].body.pose);

    // -- 3. The facts, exactly as §2h's stepChase builds them ---------------------
    for (let k = 0; k < outlawCount; k += 1) {
      const pose = outlaws[k].body.pose;
      spine.locate(pose.x, pose.z, -1, spineAt);
      outlawFacts[k].offRoute = streetLoops.offRoute(pose.x, pose.z, spineAt.offRoute);
      const crashed = outlaws[k].body.controller.crashed;
      outlawFacts[k].crashed = crashed;
      // Counted here, after the pursuers: a strike's hard knock crashes him
      // on the pursuers' half of the step, and a caught outlaw rides no more.
      if (standingNow[k] && crashed && !outlawWasCrashed[k]) counts.outlawCrashes += 1;
      outlawWasCrashed[k] = crashed;
    }
    for (let p = 0; p < pursuerCount; p += 1) {
      const pursuer = pursuers[p];
      const facts = pursuerFacts[p];
      const cop = pursuer.body.pose;
      facts.crashed = pursuer.body.controller.crashed;
      facts.parked = pursuer.parked;
      facts.speed = Math.abs(cop.speed);
      facts.teleported = pursuerTeleported[p];
      facts.paddleArmed = pursuer.paddle.phase === 'windup' || pursuer.paddle.phase === 'active';
      for (let k = 0; k < outlawCount; k += 1) {
        const outlaw = outlaws[k].body;
        const distance = Math.hypot(cop.x - outlaw.pose.x, cop.z - outlaw.pose.z);
        facts.distance[k] = distance;
        // Today's riderClosingSpeed per pair (M24): the outlaw's move against
        // where the cop ended up, capped by the outlaw's own speed.
        facts.outlawClosing[k] = Math.min(
          (Math.hypot(outlaw.previous.x - cop.x, outlaw.previous.z - cop.z) - distance) / STEP,
          Math.abs(outlaw.pose.speed),
        );
      }
      pursuer.placed = false;
    }

    // -- 4. The referee ------------------------------------------------------------
    const running = roomState.phase === 'running';
    refreshPanes();
    const result = roomState.step(STEP, input);

    if (running) {
      counts.roomSteps += 1;
      if (timing) {
        copMs![stepIndex] = copTime;
        seatMs![stepIndex] = seatTime;
      }

      // Busts, judged against the history up to the step before (the window
      // excludes the bust step itself: a cop who is inside the radius now was
      // inside the siren line a step ago, trivially).
      for (const event of result.events) {
        if (event.kind !== 'out') continue;
        switch (event.status as OutlawStatus) {
          case 'caught': counts.caught += 1; break;
          case 'touched': counts.touched += 1; break;
          case 'strayed': counts.strayed += 1; break;
          case 'gaveUp': counts.gaveUp += 1; break;
          default: break;
        }
        if (event.status !== 'caught' && event.status !== 'touched') continue;
        bustAt[event.outlaw] = event.seconds;
        bustSeconds.push(event.seconds);
        if (firstBust === null) firstBust = event.seconds;
        const p = event.pursuer;
        const k = event.outlaw;
        if (p < 0) continue;
        const since = stepIndex - windowSteps;
        const heard = lastHeard[p][k] >= since;
        if (!heard && lastSeen[p][k] < since) counts.unseen += 1;
        if (!heard && lastSeenWide[p][k] < since) counts.unseenWideCone += 1;
        if (lastHeardStrict[p][k] < since && lastSeen[p][k] < since) counts.unseenStrict += 1;
      }

      // The per-outlaw rows, on the facts this step was judged on.
      let stackCandidate = false;
      let stacked = false;
      dealtCount.fill(0);
      for (let p = 0; p < pursuerCount; p += 1) {
        if (pursuers[p].kind !== 'cpu') continue;
        const k = roomState.quarryOf(p);
        if (k >= 0) dealtCount[k] += 1;
      }
      let unchased = false;
      let surplus = false;
      for (let k = 0; k < outlawCount; k += 1) {
        if (!standingNow[k]) continue;
        counts.standingOutlawSteps += 1;
        let nearest = -1;
        let nearestMetres = Infinity;
        for (let p = 0; p < pursuerCount; p += 1) {
          const facts = pursuerFacts[p];
          if (facts.crashed || facts.parked) continue;
          if (facts.distance[k] < nearestMetres) {
            nearestMetres = facts.distance[k];
            nearest = p;
          }
        }
        const audible = nearestMetres <= AUDIO.sirenFarMetres;
        if (audible) {
          counts.audibleSteps += 1;
          quietRun[k] = 0;
        } else {
          quietRun[k] += 1;
          if (quietRun[k] > counts.worstQuietSteps) counts.worstQuietSteps = quietRun[k];
        }
        if (audible && nearest >= 0) lastHeardStrict[nearest][k] = stepIndex;
        const pane = outlawPanes[k];
        ownPane[0] = { x: pane.x, z: pane.z, headingY: pane.yaw };
        for (let p = 0; p < pursuerCount; p += 1) {
          const facts = pursuerFacts[p];
          const cop = pursuers[p].body.pose;
          if (!facts.crashed && !facts.parked && facts.distance[k] <= AUDIO.sirenFarMetres) lastHeard[p][k] = stepIndex;
          if (framedByAnyPane(cop.x, cop.z, ownPane, halfAngle, CHASE.patrolReturnMetres, nearMetres())) lastSeen[p][k] = stepIndex;
          if (framedByAnyPane(cop.x, cop.z, ownPane, CHASE.returnConeRadians, CHASE.patrolReturnMetres, nearMetres())) lastSeenWide[p][k] = stepIndex;
          // Stacking: some pair of standing cops both inside 20 m of this outlaw.
          if (facts.crashed || facts.distance[k] > STACK_NEAR_METRES) continue;
          for (let q = p + 1; q < pursuerCount; q += 1) {
            const other = pursuerFacts[q];
            if (other.crashed || other.distance[k] > STACK_NEAR_METRES) continue;
            stackCandidate = true;
            const mate = pursuers[q].body.pose;
            if (Math.hypot(cop.x - mate.x, cop.z - mate.z) <= STACK_PAIR_METRES) stacked = true;
          }
        }
        if (roomState.statusOf(k) === 'standing') {
          if (dealtCount[k] === 0) unchased = true;
          if (dealtCount[k] >= 2) surplus = true;
        }
        // Interceptions: a cop met ahead of him (parked or riding).
        const pose = outlaws[k].body.pose;
        for (let p = 0; p < pursuerCount; p += 1) {
          const facts = pursuerFacts[p];
          const range = facts.distance[k];
          if (range > AUDIO.sirenFarMetres) {
            interceptArmed[p][k] = true;
            continue;
          }
          if (!interceptArmed[p][k] || facts.crashed || range > INTERCEPT_NEAR_METRES) continue;
          const cop = pursuers[p].body.pose;
          const bearing = Math.atan2(cop.x - pose.x, cop.z - pose.z) - pose.headingY;
          if (Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing))) > INTERCEPT_CONE_RADIANS) continue;
          interceptions += 1;
          interceptArmed[p][k] = false;
        }
        // The hider's clocks: parked, then the first riding cop nearby.
        const now = counts.roomSteps / hz;
        if (outlaws[k].hidePhase === 'parked' && Number.isNaN(hiddenAt[k])) hiddenAt[k] = now;
        if (!Number.isNaN(hiddenAt[k]) && Number.isNaN(nearAt[k])) {
          for (let p = 0; p < pursuerCount; p += 1) {
            const facts = pursuerFacts[p];
            if (facts.crashed || facts.parked || facts.distance[k] > HIDER_NEAR_METRES) continue;
            nearAt[k] = now;
            break;
          }
        }
      }
      options.onStep?.(counts.roomSteps / hz, outlaws.map((outlaw) => outlaw.body), pursuers);
      if (stackCandidate) counts.stackCandidateSteps += 1;
      if (stacked) counts.stackSteps += 1;
      if (!room.humanCop && unchased && surplus) counts.unchasedSteps += 1;
      stepIndex += 1;
    }

    // -- 5. The demands, performed as Game performs them (§2h) ---------------------
    for (const demand of roomState.takeDemands()) {
      const p = demand.pursuer;
      const pursuer = pursuers[p];
      const outlaw = outlaws[demand.outlaw].body.pose;
      switch (demand.kind) {
        case 're-deal':
          counts.reDeals += 1;
          break;
        case 'patrol-wake':
          if (demand.cause === 'proximity') counts.wakesProximity += 1;
          else if (demand.cause === 'quiet') counts.wakesQuiet += 1;
          pursuer.parked = false;
          writeView(pursuer.body);
          pursuer.brain.place(pursuer.body.view, pursuer.post?.distance ?? -1);
          break;
        case 'tail-return': {
          // `regroupTail`'s early-out: a cop mid-crash drops it. A rider on a
          // loop's alternate street is returned behind on *that* street (the
          // brutal pass), judged by what stands on it.
          if (pursuer.body.controller.crashed) { counts.tailReturnsSkipped += 1; break; }
          spine.locate(outlaw.x, outlaw.z, -1, spineAt);
          const ring = streetLoops.alternateRing(outlaw.x, outlaw.z, spineAt.offRoute, spineAt.halfWidth);
          fillOthers(p);
          const back = CHASE.trackerReturnMetres;
          const brain = pursuer.brain;
          const candidate = ring >= 0
            ? planRegroup(
              streetLoops.ring(ring), outlaw, back, regroupFloor(back, roomState.bustRadiusMetres), regroupScratch,
              (distance, direction) => brain.landingAllowanceOnStreet(ring, distance, direction), -1, refusals,
            )
            : planRegroup(
              spine, outlaw, back, regroupFloor(back, roomState.bustRadiusMetres), regroupScratch,
              (distance, direction) => brain.landingAllowance(distance, direction), brain.quarryDistance, refusals,
            );
          if (candidate === null) { counts.tailReturnsRefused += 1; break; }
          counts.tailReturnsAccepted += 1;
          if (framedByAny(candidate.x, candidate.z)) counts.returnsInPane += 1;
          place(
            pursuer, p,
            { position: { x: candidate.x, y: candidate.y, z: candidate.z }, headingY: candidate.headingY },
            Math.min(candidate.entrySpeed, Math.max(Math.abs(pursuer.body.pose.speed), Math.abs(outlaw.speed))),
            ring >= 0 ? -1 : candidate.distance,
          );
          break;
        }
        case 'post-return': {
          if (pursuer.body.controller.crashed || posts === null) { counts.postReturnsRefused += 1; break; }
          fillOthers(p);
          const post = choosePostReturn(posts.posts, outlaw, others, allPanes, {
            trackerGapMetres: roomState.trackerGapMetres,
            patrolReturnMetres: CHASE.patrolReturnMetres,
            returnConeRadians: CHASE.returnConeRadians,
            packSpacingMetres: CHASE.packSpacingMetres,
            nearMetres: nearMetres(),
          });
          if (post === null) { counts.postReturnsRefused += 1; break; }
          counts.postReturnsAccepted += 1;
          if (framedByAny(post.x, post.z)) counts.returnsInPane += 1;
          place(pursuer, p, { position: { x: post.x, y: post.y, z: post.z }, headingY: post.headingY }, 0, post.distance);
          pursuer.parked = true;
          break;
        }
        case 'intercept': {
          // Game's `interceptAhead`: a roadblock on his road, else a post, else keep riding.
          if (pursuer.body.controller.crashed) { counts.interceptsRefused += 1; break; }
          fillOthers(p);
          const brain = pursuer.brain;
          let spot = chooseIntercept(spine, field.blockers, sampler, outlaw, -1, others, framedByAny,
            (distance, direction) => brain.landingAllowance(distance, direction), {
              minAheadMetres: CHASE.interceptMinAheadMetres,
              maxAheadMetres: CHASE.interceptMaxAheadMetres,
              minStraightMetres: CHASE.patrolWakeMetres + INTERCEPT_WAKE_MARGIN_METRES,
              postStandoffMetres: CHASE.postStandoffMetres,
              packSpacingMetres: CHASE.packSpacingMetres,
              riderHitRadius: CHASE.riderHitRadius,
              streetMargin: CHASE.streetMargin,
            });
          if (spot !== null) counts.interceptsAhead += 1;
          else if (posts !== null) {
            spot = choosePostReturn(posts.posts, outlaw, others, allPanes, {
              trackerGapMetres: roomState.trackerGapMetres,
              patrolReturnMetres: CHASE.patrolReturnMetres,
              returnConeRadians: CHASE.returnConeRadians,
              packSpacingMetres: CHASE.packSpacingMetres,
              nearMetres: nearMetres(),
            });
            if (spot !== null) counts.interceptsToPost += 1;
          }
          if (spot === null) { counts.interceptsRefused += 1; break; }
          if (framedByAny(spot.x, spot.z)) counts.returnsInPane += 1;
          place(pursuer, p, { position: { x: spot.x, y: spot.y, z: spot.z }, headingY: spot.headingY }, 0, spot.distance);
          // Game's rule: a roadblock for a rider on the move; one standing still is ridden in on.
          pursuer.parked = Math.abs(outlaw.speed) >= CHASE.navSlowQuarrySpeed;
          break;
        }
        default:
          break;
      }
    }
  }

  for (const outlaw of outlaws) evaderLaps += outlaw.laps;
  const final = roomState.state.result;
  // The hider's summary: the worst bust-after-arrival over the hiders.
  let hideBustAfterNear: number | null = null;
  let hiddenLast: number | null = null;
  let nearFirst: number | null = null;
  if (script === 'hider') {
    let worst = 0;
    let stood = false;
    for (let k = 0; k < outlawCount; k += 1) {
      if (Number.isNaN(hiddenAt[k])) continue;
      hiddenLast = Math.max(hiddenLast ?? 0, hiddenAt[k]);
      if (!Number.isNaN(nearAt[k])) nearFirst = Math.min(nearFirst ?? Infinity, nearAt[k]);
      if (Number.isNaN(bustAt[k])) {
        stood = true;
        continue;
      }
      const from = Number.isNaN(nearAt[k]) ? hiddenAt[k] : nearAt[k];
      worst = Math.max(worst, bustAt[k] - from);
    }
    hideBustAfterNear = stood ? null : worst;
  }
  return {
    seed: world.seed,
    room: roomId,
    script,
    outlaws: outlawCount,
    pursuers: pursuerCount,
    bellSeconds,
    seconds: counts.roomSteps / hz,
    roomSteps: counts.roomSteps,
    standingOutlawSteps: counts.standingOutlawSteps,
    audibleSteps: counts.audibleSteps,
    worstQuietSeconds: counts.worstQuietSteps / hz,
    caught: counts.caught,
    touched: counts.touched,
    strayed: counts.strayed,
    gaveUp: counts.gaveUp,
    escaped: final?.escaped ?? 0,
    firstBustSeconds: firstBust,
    bustSeconds,
    stackSteps: counts.stackSteps,
    stackCandidateSteps: counts.stackCandidateSteps,
    unseen: counts.unseen,
    unseenWideCone: counts.unseenWideCone,
    unseenStrict: counts.unseenStrict,
    wakesProximity: counts.wakesProximity,
    wakesQuiet: counts.wakesQuiet,
    postReturnsAccepted: counts.postReturnsAccepted,
    postReturnsRefused: counts.postReturnsRefused,
    interceptsAhead: counts.interceptsAhead,
    interceptsToPost: counts.interceptsToPost,
    interceptsRefused: counts.interceptsRefused,
    tailReturnsAccepted: counts.tailReturnsAccepted,
    tailReturnsRefused: counts.tailReturnsRefused,
    tailReturnsSkipped: counts.tailReturnsSkipped,
    returnsInPane: counts.returnsInPane,
    unchasedSteps: counts.unchasedSteps,
    reDeals: counts.reDeals,
    outlawCrashes: counts.outlawCrashes,
    copCrashes: counts.copCrashes,
    evaderLaps,
    postSource: posts?.source ?? 'none',
    interceptions,
    hideLabel: script === 'hider' ? outlaws.map((_outlaw, k) => hideFor(k)?.label ?? 'none').join(' + ') : null,
    hiddenAt: hiddenLast,
    copNearAt: nearFirst,
    hideBustAfterNear,
    copMs: copMs === null ? null : copMs.slice(0, stepIndex),
    seatMs: seatMs === null ? null : seatMs.slice(0, stepIndex),
  };
}

// ---------------------------------------------------------------------------
// Field construction (§39.6b.4 "Field construction")
// ---------------------------------------------------------------------------

export interface FieldCost {
  readonly seed: string;
  /** ms for 3 × `new CpuRider(spine, plan, sampler)`: three private projections. */
  readonly tripleMs: number;
  /** ms for `buildRouteField` + 3 × `new CpuRider(..., field)`. */
  readonly sharedMs: number;
}

/** The median of three repetitions of each, per seed (§2g). Wall-clock ms inside our own code. */
export function measureFieldCost(world: ChaseWorld, repetitions = 3): FieldCost {
  const triple: number[] = [];
  const shared: number[] = [];
  for (let rep = 0; rep < repetitions; rep += 1) {
    let t0 = now();
    for (let i = 0; i < 3; i += 1) new CpuRider(world.spine, world.plan, world.sampler);
    triple.push(now() - t0);
    t0 = now();
    const field = buildRouteField(world.spine, world.plan, world.sampler);
    for (let i = 0; i < 3; i += 1) new CpuRider(world.spine, world.plan, world.sampler, field);
    shared.push(now() - t0);
  }
  return { seed: world.seed, tripleMs: median(triple), sharedMs: median(shared) };
}

// ---------------------------------------------------------------------------
// Jobs: what the tool runs, one world at a time
// ---------------------------------------------------------------------------

export interface BenchJob {
  readonly seed: string;
  readonly rooms: readonly BenchRoomId[];
  readonly scripts: readonly ScriptKind[];
  readonly seconds?: number;
  readonly timing: boolean;
  readonly fieldCost: boolean;
}

export interface JobResult {
  readonly seed: string;
  readonly runs: RunResult[];
  readonly field: FieldCost | null;
  readonly evader: { readonly closed: boolean; readonly lapLength: number; readonly alternates: number } | null;
}

/** Every requested run on one seed: the solo rooms with each script, the couch rooms with evaders. */
export function runJob(job: BenchJob): JobResult {
  const world = buildChaseWorld(job.seed);
  const field = job.fieldCost ? measureFieldCost(world) : null;
  const runs: RunResult[] = [];
  for (const roomId of job.rooms) {
    const scripts = SOLO_ROOMS.includes(roomId) || SCRIPTED_COUCH_ROOMS.includes(roomId) ? job.scripts : (['evader'] as const);
    for (const script of scripts) {
      // The hider rides every spot the seed offers, one run each.
      const spots = script === 'hider' ? Math.max(1, world.hideSpots.length) : 1;
      for (let spot = 0; spot < spots; spot += 1) {
        runs.push(runRoom(world, roomId, script, { seconds: job.seconds, timing: job.timing, hideSpot: spot }));
      }
    }
  }
  const course = world.evader;
  return {
    seed: job.seed,
    runs,
    field,
    evader: course === null ? null : { closed: course.closed, lapLength: course.lapLength, alternates: course.alternates },
  };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Nearest-rank percentile of a sample (q in 0..1). */
export function percentile(sorted: Float64Array | readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank];
}

export function percentiles(samples: readonly (Float64Array | null)[]): { p50: number; p95: number; p99: number; n: number } {
  let length = 0;
  for (const sample of samples) length += sample?.length ?? 0;
  const pooled = new Float64Array(length);
  let at = 0;
  for (const sample of samples) {
    if (sample === null) continue;
    pooled.set(sample, at);
    at += sample.length;
  }
  pooled.sort();
  return { p50: percentile(pooled, 0.5), p95: percentile(pooled, 0.95), p99: percentile(pooled, 0.99), n: length };
}

// ---------------------------------------------------------------------------
// Tables: what the tool prints (jumpBench's { title, notes, columns, rows })
// ---------------------------------------------------------------------------

export interface BenchTable {
  readonly id: string;
  readonly title: string;
  readonly notes: readonly string[];
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const pct = (share: number): string => (Number.isFinite(share) ? `${(share * 100).toFixed(1)} %` : '—');
const secs = (value: number | null): string => (value === null || !Number.isFinite(value) ? 'none' : `${value.toFixed(1)} s`);
const num = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const ms = (value: number): string => (Number.isFinite(value) ? value.toFixed(4) : '—');

/** Standing-outlaw minutes of a run. */
function outlawMinutes(run: RunResult): number {
  return run.standingOutlawSteps / SIMULATION.hz / 60;
}

export function audibleShare(run: RunResult): number {
  return run.standingOutlawSteps === 0 ? Number.NaN : run.audibleSteps / run.standingOutlawSteps;
}

export function stackingShare(run: RunResult): number {
  return run.stackCandidateSteps === 0 ? 0 : run.stackSteps / run.stackCandidateSteps;
}

export function unchasedShare(run: RunResult): number {
  return run.roomSteps === 0 ? 0 : run.unchasedSteps / run.roomSteps;
}

function perMinute(count: number, minutes: number): number {
  return minutes > 0 ? count / minutes : Number.NaN;
}

function outcomeOf(run: RunResult): string {
  if (run.outlaws === 1) {
    if (run.escaped === 1) return 'escaped';
    if (run.caught > 0) return 'caught';
    if (run.touched > 0) return 'touched';
    if (run.strayed > 0) return 'strayed';
    return 'gave up';
  }
  return `${run.caught + run.touched} busted, ${run.escaped} escaped`;
}

/** A per-seed row block plus the corpus median and max rows (§2g: "per seed, and the corpus median and max"). */
function withCorpus(
  runs: readonly RunResult[],
  cells: readonly ((run: RunResult) => number | null)[],
  format: readonly ((value: number | null) => string)[],
  lead: (run: RunResult) => string[],
  leadWidth: number,
  extra: (run: RunResult) => string[] = () => [],
  extraWidth = 0,
): string[][] {
  const rows: string[][] = runs.map((run) => [
    ...lead(run),
    ...cells.map((cell, index) => format[index](cell(run))),
    ...extra(run),
  ]);
  if (runs.length > 1) {
    for (const [label, reduce] of [['corpus median', median], ['corpus max', (values: number[]) => Math.max(...values)]] as const) {
      const row: string[] = [`**${label}**`, ...new Array<string>(leadWidth - 1).fill('')];
      for (let index = 0; index < cells.length; index += 1) {
        const values = runs.map(cells[index]).filter((value): value is number => value !== null && Number.isFinite(value));
        row.push(values.length === 0 ? format[index](null) : format[index](reduce(values)));
      }
      row.push(...new Array<string>(extraWidth).fill(''));
      rows.push(row);
    }
  }
  return rows;
}

/** The chase-quality columns every solo and couch row carries. */
const QUALITY_COLUMNS = ['audible share', 'worst quiet spell', 'caught /min', 'touched /min', 'strayed /min', 'gave up /min', 'time to first bust'];
const QUALITY_CELLS: ((run: RunResult) => number | null)[] = [
  audibleShare,
  (run) => run.worstQuietSeconds,
  (run) => perMinute(run.caught, outlawMinutes(run)),
  (run) => perMinute(run.touched, outlawMinutes(run)),
  (run) => perMinute(run.strayed, outlawMinutes(run)),
  (run) => perMinute(run.gaveUp, outlawMinutes(run)),
  (run) => run.firstBustSeconds,
];
const QUALITY_FORMAT: ((value: number | null) => string)[] = [
  (value) => pct(value ?? Number.NaN),
  (value) => secs(value),
  (value) => num(value ?? Number.NaN, 3),
  (value) => num(value ?? Number.NaN, 3),
  (value) => num(value ?? Number.NaN, 3),
  (value) => num(value ?? Number.NaN, 3),
  (value) => secs(value),
];

const PACK_COLUMNS = ['stacking share (steps)', 'unseen busts (pane / 1.2 rad / strict)', 'wakes prox / quiet', 'post returns acc / ref', 'roadblocks ahead / post / ref', 'tail returns acc / ref / skipped', 'returns inside a pane'];
function packExtra(run: RunResult): string[] {
  return [
    `${pct(stackingShare(run))} (${run.stackSteps} / ${run.stackCandidateSteps})`,
    `${run.unseen} / ${run.unseenWideCone} / ${run.unseenStrict}`,
    `${run.wakesProximity} / ${run.wakesQuiet}`,
    `${run.postReturnsAccepted} / ${run.postReturnsRefused}`,
    `${run.interceptsAhead} / ${run.interceptsToPost} / ${run.interceptsRefused}`,
    `${run.tailReturnsAccepted} / ${run.tailReturnsRefused} / ${run.tailReturnsSkipped}`,
    `${run.returnsInPane}`,
  ];
}

/** The brutal pass's columns (2026-09-25): cops met ahead, and the hider's clock. */
const BRUTAL_COLUMNS = ['intercepts /min', 'hider: bust after cop near'];
const BRUTAL_CELLS: ((run: RunResult) => number | null)[] = [
  (run) => perMinute(run.interceptions, outlawMinutes(run)),
  (run) => (run.script === 'hider' ? run.hideBustAfterNear : null),
];
const BRUTAL_FORMAT: ((value: number | null) => string)[] = [
  (value) => num(value ?? Number.NaN, 2),
  (value) => (value === null ? '—' : secs(value)),
];

/** The hider's row detail: his spot, when he hid, when a cop came near, and whether he stood. */
function hiderExtra(run: RunResult): string {
  if (run.script !== 'hider') return '—';
  const stood = run.hideBustAfterNear === null && run.hiddenAt !== null ? ', stood to the bell' : '';
  return `${run.hideLabel ?? 'no spot'}; hid ${secs(run.hiddenAt)}, cop near ${secs(run.copNearAt)}${stood}`;
}

export const SCRIPT_ORDER: readonly ScriptKind[] = Object.freeze(['follower', 'evader', 'baiter', 'hider', 'sprinter']);

function soloTable(id: string, roomId: BenchRoomId, runs: readonly RunResult[], title: string, notes: string[]): BenchTable {
  const chosen = runs.filter((run) => run.room === roomId);
  const rows: string[][] = [];
  const pack = BENCH_ROOMS[roomId].cpu > 1;
  for (const script of SCRIPT_ORDER) {
    const mine = chosen.filter((run) => run.script === script);
    if (mine.length === 0) continue;
    rows.push(...withCorpus(
      mine,
      [...QUALITY_CELLS, ...BRUTAL_CELLS],
      [...QUALITY_FORMAT, ...BRUTAL_FORMAT],
      (run) => [run.script, run.seed],
      2,
      (run) => [
        outcomeOf(run),
        `${run.outlawCrashes} / ${run.copCrashes}`,
        ...(pack ? packExtra(run) : [`${run.tailReturnsAccepted} / ${run.tailReturnsRefused} / ${run.tailReturnsSkipped}`]),
        hiderExtra(run),
      ],
      (pack ? 2 + PACK_COLUMNS.length : 3) + 1,
    ));
  }
  return {
    id,
    title,
    notes,
    columns: [
      'rider', 'seed', ...QUALITY_COLUMNS, ...BRUTAL_COLUMNS, 'outcome', 'crashes outlaw / cops',
      ...(pack ? PACK_COLUMNS : ['tail returns acc / ref / skipped']), 'hider: spot; hid; cop near',
    ],
    rows,
  };
}

export interface BenchMeta {
  readonly seconds: number;
  readonly seeds: readonly string[];
  readonly timing: boolean;
  readonly jobs: number;
}

/** Every table the report prints, in order. Timing tables only when the runs carried samples. */
export function chaseTables(results: readonly JobResult[], meta: BenchMeta): BenchTable[] {
  const runs = results.flatMap((result) => result.runs);
  const tables: BenchTable[] = [];
  const has = (roomId: BenchRoomId): boolean => runs.some((run) => run.room === roomId);

  if (has('solo1')) {
    tables.push(soloTable('C1', 'solo1', runs, 'C1. One cop — the baseline on the town corpus (solo1)', [
      '`roomSpec(1, false, 1)`: the `?cops=1` probe, which is today\'s one-cop chase on `ChaseRoom` through the new referee. Each run ends at the first ending (the solo room), so "busts / min" is one over the standing minutes of a busted run and zero for an escape.',
      '**The M31 baseline restated.** M31 measured audible 93 % and quiet spells of 20 s on the 48 `sweep-N` seeds with its own `/tmp` bench (the route-follower against one cop). The follower rows here are that measurement on the six-seed town corpus, with this bench\'s definitions (§2g): the siren line is `AUDIO.sirenFarMetres` = 60 m.',
      '**No F1 → F2 delta.** §2g\'s F1 (the shipped `ChaseRun` before A-1/A-12) could not be run: when this bench was built, `ChaseRun` already delegated to `ChaseRoom` (A-2) and A-1 had landed, so F1 no longer exists to measure. These rows are F2.',
    ]));
  }
  if (has('solo3')) {
    tables.push(soloTable('C2', 'solo3', runs, 'C2. Three cops — the solo face (solo3)', [
      'The rule at one human (q207): the tail 20 m behind and two patrols parked at the ring\'s thirds (A-5). Stacking share = steps with two standing cops ≤ 3 m apart while both ≤ 20 m of the same standing outlaw ÷ steps with two standing cops both ≤ 20 m of him. Unseen busts: over the 3 s before the bust step, the cop was never ≤ 60 m of the outlaw (parked cops are silent, R-19) **and** never inside his own pane at its measured half-angle (0.963 rad solo, R-21); the "1.2 rad" variant uses `returnConeRadians`, and the strict variant counts "heard" only when that cop was the nearest riding cop. Target 0. Returns inside a pane: accepted tail, post or intercept returns whose landing spot `framedByAnyPane` framed at that moment (target 0: the predicate refuses them, so this checks the wiring).',
      `The brutal pass (2026-09-25) added two scripts and two columns. **hider**: rides to a spot off the road that a solid hides from the road beside it (\`findHideSpots\`: a building corner, a wall or fence line, a walled yard), parks and shuffles ${HIDE_SHUFFLE_METRES} m back and forth; one run per spot. **sprinter**: the canonical line at ${SPRINT_SPEED_SHARE} of top speed (into the beeps, under the cutout), cornering at ${SPRINT_CORNERING_MARGIN} of the grip limit. **Intercepts /min**: a cop that was beyond the siren line comes within ${INTERCEPT_NEAR_METRES} m inside ±${(INTERCEPT_CONE_RADIANS * 180 / Math.PI).toFixed(0)}° of the outlaw's heading (met ahead, parked or riding), per standing minute. **Hider: bust after cop near**: seconds from the first riding cop within ${HIDER_NEAR_METRES} m of the parked hider to his bust (0 s = busted before he could park; — = a parked hider stood to the bell).`,
    ]));
  }
  if (runs.some((run) => run.room === '2v2' && run.script !== 'evader')) {
    tables.push(soloTable('C2b', '2v2', runs, 'C2b. Two outlaws v two CPU cops, every script (2v2)', [
      'The couch room the owner rode at two humans (2026-09-25), with both outlaws on the same script (grid slots from R-22, the 3 s count first); two hiders take two different spots. Columns as C2; the rates are over both outlaws\' standing minutes. The evader rows are the same runs as C5\'s 2v2 rows.',
    ]));
  }

  // Brain cost.
  if (meta.timing) {
    const timingRows: string[][] = [];
    const seeds = [...new Set(runs.map((run) => run.seed))];
    const block = (roomId: BenchRoomId, label: string, withSeats: boolean, divide: number): void => {
      const chosen = runs.filter((run) => run.room === roomId && run.copMs !== null);
      if (chosen.length === 0) return;
      const sample = (run: RunResult): Float64Array => {
        if (!withSeats) return run.copMs!;
        const out = new Float64Array(run.copMs!.length);
        for (let i = 0; i < out.length; i += 1) out[i] = run.copMs![i] + run.seatMs![i];
        return out;
      };
      for (const seed of seeds) {
        const mine = chosen.filter((run) => run.seed === seed);
        if (mine.length === 0) continue;
        const stats = percentiles(mine.map(sample));
        timingRows.push([label, seed, ms(stats.p50), ms(stats.p95), ms(stats.p99), ms(stats.p99 / divide), `${stats.n}`]);
      }
      const stats = percentiles(chosen.map(sample));
      timingRows.push([`**${label}**`, '**corpus, pooled**', ms(stats.p50), ms(stats.p95), ms(stats.p99), ms(stats.p99 / divide), `${stats.n}`]);
    };
    block('solo1', '1 cop (brain + controller + paddle)', false, 1);
    block('solo3', '3 cops (brains + controllers + paddles)', false, 3);
    block('2v2', '{2 outlaw controllers + 2 brains} (2v2 CPU)', true, 2);
    block('3v1', '{3 outlaw controllers + 1 brain} (3v1 CPU)', true, 1);
    block('h3v1', '{4 human controllers + 0 brains} (3v1 human cop)', true, 4);
    tables.push({
      id: 'C3',
      title: 'C3. Brain cost at the fixed step (reference Mac)',
      notes: [
        '`performance.now()` around the pursuers\' block of every running fixed step: every CPU cop\'s pack input, brain, controller and paddle (the solo rows); for the couch rows, plus the outlaws\' controllers. The scripted outlaws\' brains and the scripted human cop\'s brain are excluded — a human\'s controller is timed, his script is not (§2g). Render passes are not headless and are not in this row. Percentiles are nearest-rank over every sampled step of every script and seed in the row, in milliseconds; "p99 per body" divides p99 by the brains timed (by the controllers timed in the four-human row). Judged against the 8.33 ms step.',
        `Measured on this machine, the reference Mac, ${meta.jobs === 1 ? 'one run at a time' : `with ${meta.jobs} runs in parallel worker threads (so the percentiles include contention between them; rerun with \`--jobs 1\` for an isolated figure)`}. **The Ubuntu desktop rows: not measured here** — they need the owner's machine.`,
      ],
      columns: ['block', 'seed', 'p50 ms', 'p95 ms', 'p99 ms', 'p99 per body ms', 'steps sampled'],
      rows: timingRows,
    });
  }

  const fields = results.map((result) => result.field).filter((field): field is FieldCost => field !== null);
  if (fields.length > 0) {
    const rows = fields.map((field) => [field.seed, num(field.tripleMs, 1), num(field.sharedMs, 1), num(field.tripleMs / field.sharedMs, 2)]);
    rows.push(['**median**', num(median(fields.map((f) => f.tripleMs)), 1), num(median(fields.map((f) => f.sharedMs)), 1), num(median(fields.map((f) => f.tripleMs / f.sharedMs)), 2)]);
    tables.push({
      id: 'C4',
      title: 'C4. Field construction: shared against triple',
      notes: [
        '`3 × new CpuRider(spine, plan, sampler)` (three private projections) against `buildRouteField` + `3 × new CpuRider(..., field)`, the median of three repetitions per seed, wall-clock milliseconds inside our own code. `StreetLoops(plan, shared)` rides the field\'s rings (§2c, R-18), so the shared figure builds the street rings once.',
      ],
      columns: ['seed', 'triple ms', 'shared ms', 'triple ÷ shared'],
      rows,
    });
  }

  // The couch rooms.
  const couchRows: string[][] = [];
  for (const roomId of COUCH_ROOMS) {
    const chosen = runs.filter((run) => run.room === roomId && run.script === 'evader');
    if (chosen.length === 0) continue;
    couchRows.push(...withCorpus(
      chosen,
      [
        audibleShare,
        (run) => run.worstQuietSeconds,
        stackingShare,
        (run) => run.unseen,
        (run) => run.unseenStrict,
        (run) => run.returnsInPane,
        (run) => (BENCH_ROOMS[run.room].humanCop ? null : unchasedShare(run)),
        (run) => perMinute(run.reDeals, run.seconds / 60),
        (run) => run.firstBustSeconds,
      ],
      [
        (value) => pct(value ?? Number.NaN),
        (value) => secs(value),
        (value) => pct(value ?? Number.NaN),
        (value) => (value === null ? '—' : `${value}`),
        (value) => (value === null ? '—' : `${value}`),
        (value) => (value === null ? '—' : `${value}`),
        (value) => (value === null ? 'n/a (human cop)' : pct(value)),
        (value) => num(value ?? Number.NaN, 2),
        (value) => secs(value),
      ],
      (run) => [run.room, run.seed],
      2,
      (run) => [
        outcomeOf(run),
        `${run.wakesProximity} / ${run.wakesQuiet}`,
        `${run.postReturnsAccepted} / ${run.postReturnsRefused}`,
        `${run.tailReturnsAccepted} / ${run.tailReturnsRefused} / ${run.tailReturnsSkipped}`,
      ],
      4,
    ));
  }
  if (couchRows.length > 0) {
    tables.push({
      id: 'C5',
      title: 'C5. Every couch room against the scripted evaders — fairness per pane',
      notes: [
        'Every outlaw is an evader (§2g), starting on `raceGridSlot` slots from two outlaws (R-22), with the couch count (q223, 3 s) before GO. Panes: one per human — each outlaw\'s seat camera and, beside a human cop, his (a busted outlaw spectates the nearest standing outlaw, q226). Split rooms (two humans) have 0.70 rad panes, three and four humans 0.963 rad quadrants (§2i).',
        'Unseen busts are per outlaw against **that outlaw\'s own pane** (target 0; the strict column counts "heard" only for the nearest riding cop). Returns inside a pane: accepted returns whose spot any human pane framed (target 0). Unchased share: running steps with a standing outlaw no CPU cop is dealt while another outlaw has two CPU cops dealt (target 0; not defined beside a human cop, who is never dealt). Deal swaps: `re-deal` demands per room minute (bounded, reported). The wake / return columns are counts over the round.',
      ],
      columns: ['room', 'seed', 'audible share', 'worst quiet spell', 'stacking share', 'unseen busts (own pane)', 'unseen, strict', 'returns inside a pane', 'unchased share', 'deal swaps /min', 'time to first bust', 'outcome', 'wakes prox / quiet', 'post returns acc / ref', 'tail returns acc / ref / skipped'],
      rows: couchRows,
    });
  }

  // Human-cop viability.
  const viabilityRows: string[][] = [];
  for (const roomId of [...HUMAN_COP_ROOMS, '2v2', '3v1'] as const) {
    const chosen = runs.filter((run) => run.room === roomId && run.script === 'evader');
    if (chosen.length === 0) continue;
    const busted = (run: RunResult): number => run.caught + run.touched;
    const cells: ((run: RunResult) => number | null)[] = [
      (run) => busted(run) / run.outlaws,
      (run) => run.firstBustSeconds,
      busted,
      ...BELL_CURVE_SECONDS.map((limit) => (run: RunResult) => run.bustSeconds.filter((s) => s <= limit).length / run.outlaws),
    ];
    const format: ((value: number | null) => string)[] = [
      (value) => pct(value ?? Number.NaN),
      (value) => secs(value),
      (value) => num(value ?? Number.NaN, 1),
      ...BELL_CURVE_SECONDS.map(() => (value: number | null) => pct(value ?? Number.NaN)),
    ];
    const label = (run: RunResult): string[] => [BENCH_ROOMS[run.room].humanCop ? `${run.room} (human cop)` : `${run.room} (CPU, for context)`, run.seed];
    viabilityRows.push(...withCorpus(chosen, cells, format, label, 2));
    // The corpus mean too: a share over the corpus is its busted outlaws over its outlaws.
    const outlawsTotal = chosen.reduce((sum, run) => sum + run.outlaws, 0);
    const bustedTotal = chosen.reduce((sum, run) => sum + busted(run), 0);
    viabilityRows.push([
      `**${roomId}**`, '**corpus total**', pct(bustedTotal / outlawsTotal), '', num(bustedTotal / chosen.length, 2),
      ...BELL_CURVE_SECONDS.map((limit) => pct(chosen.reduce((sum, run) => sum + run.bustSeconds.filter((s) => s <= limit).length, 0) / outlawsTotal)),
    ]);
  }
  if (viabilityRows.length > 0) {
    tables.push({
      id: 'C6',
      title: 'C6. Human-cop viability (1v1, 2v1, 3v1) — no pass mark',
      notes: [
        'The scripted cop is the production brain with the director off and no regroup (the referee gives a human pursuer no clocks and no demands), on the seat\'s wheel (the player\'s cutout edge, not `COP_WHEEL_TUNING`), paddle armed, fed the nearest standing outlaw by straight line as a human with the bearing readout (q220) would be — keeping his target until another is ≥ 10 m nearer for ≥ 1 s (R-23). The outlaws are evaders. Intercept share = outlaws busted (caught or touched) before the bell ÷ outlaws; busts per round = caught + touched; the "by N s" columns are the share busted by that many seconds after GO, which is what a shorter couch bell would leave (a bell of N s ends every round at N). The CPU rooms 2v2 and 3v1 are listed for context only.',
        '**No pass mark** (§39.6b.4b). These go to the owner with the three remedies on record named beside them: (1) a shorter couch bell, `CHASE.couchEscapeSeconds` on F4 (q217; 300 s today); (2) the cop\'s hold at the start, `CHASE.copHoldSeconds` on F4 (q224; 0 s today — the 20 m is the head start); (3) the manual call-in, which the owner declined at q220. GC — his ride with four humans — is the judge.',
      ],
      columns: ['room', 'seed', 'intercept share', 'time to first bust', 'busts per round', ...BELL_CURVE_SECONDS.map((s) => `by ${s} s`)],
      rows: viabilityRows,
    });
  }

  // The evader's course.
  const courseRows = results.map((result) => {
    const laps = result.runs.filter((run) => run.script === 'evader').reduce((sum, run) => sum + run.evaderLaps, 0);
    const posts = result.runs.find((run) => run.room === 'solo3')?.postSource ?? result.runs.find((run) => run.room === '2v2')?.postSource ?? 'none';
    return [
      result.seed,
      result.evader === null ? 'no ring' : result.evader.closed ? 'closed (R-3)' : 'unclosed: lap + overlap',
      result.evader === null ? '—' : `${result.evader.lapLength.toFixed(0)} m`,
      result.evader === null ? '—' : `${result.evader.alternates}`,
      `${laps}`,
      posts,
    ];
  });
  tables.push({
    id: 'C7',
    title: 'C7. The scripted courses',
    notes: [
      'The evader rides the town ring through every loop\'s alternate arm (the district blocks\' side streets and the alley). R-3\'s `fromTraversal(..., { closeWhenJoined: true })` closes the course when its ends meet (course `closed`); when they do not, the course is one lap plus the lap\'s first segments again (320 m), the overlap\'s blockers copied onto both laps, and the brain\'s cursor is re-seated one lap back at the join. The body is never moved, so no re-seat is a `teleported` step; the lap count below is the re-seats over every evader run on the seed. Posts: `choosePatrolPosts`\' source in the pack rooms.',
    ],
    columns: ['seed', 'evader course', 'lap', 'alternate arms taken', 'lap re-seats', 'patrol posts'],
    rows: courseRows,
  });

  return tables;
}

/** The bench's constants, printed at the top of the report. */
export function benchConstants(): { name: string; value: string }[] {
  return [
    { name: 'SIMULATION.hz', value: `${SIMULATION.hz} (the fixed step, ${(1000 / SIMULATION.hz).toFixed(2)} ms)` },
    { name: 'CHASE.escapeSeconds / couchEscapeSeconds', value: `${CHASE.escapeSeconds} s / ${CHASE.couchEscapeSeconds} s` },
    { name: 'KNOCKABOUT.countdownSeconds (couch count, q223)', value: `${KNOCKABOUT.countdownSeconds} s` },
    { name: 'AUDIO.sirenFarMetres (the siren line)', value: `${AUDIO.sirenFarMetres} m` },
    { name: 'CHASE.bustRadiusMetres / touchBustMetres', value: `${CHASE.bustRadiusMetres} m / ${CHASE.touchBustMetres} m` },
    { name: 'CHASE.trackerGapMetres / trackerReturnMetres / trackerHoldSeconds', value: `${CHASE.trackerGapMetres} m / ${CHASE.trackerReturnMetres} m / ${CHASE.trackerHoldSeconds} s` },
    { name: 'CHASE.trackerQuietSeconds / trackerStallSeconds / trackerRespiteSeconds', value: `${CHASE.trackerQuietSeconds} s / ${CHASE.trackerStallSeconds} s / ${CHASE.trackerRespiteSeconds} s` },
    { name: 'CHASE.navRangeMetres / navSlowQuarrySpeed / attackPassSpeed (the close-quarters search)', value: `${CHASE.navRangeMetres} m / ${CHASE.navSlowQuarrySpeed} m/s / ${CHASE.attackPassSpeed} m/s` },
    { name: 'CHASE.interceptMin/MaxAheadMetres / roadblockIdleSeconds (the roadblock)', value: `${CHASE.interceptMinAheadMetres}–${CHASE.interceptMaxAheadMetres} m / ${CHASE.roadblockIdleSeconds} s` },
    { name: 'CHASE.corneringMargin / hotCorneringMargin / brakeSafety', value: `${CHASE.corneringMargin} / ${CHASE.hotCorneringMargin} / ${CHASE.brakeSafety}` },
    { name: 'CHASE.patrolWakeMetres / patrolReturnMetres', value: `${CHASE.patrolWakeMetres} m / ${CHASE.patrolReturnMetres} m` },
    { name: 'CHASE.packSpacingMetres / dealHoldSeconds / copHoldSeconds', value: `${CHASE.packSpacingMetres} m / ${CHASE.dealHoldSeconds} s / ${CHASE.copHoldSeconds} s` },
    { name: 'CHASE.returnConeRadians', value: `${CHASE.returnConeRadians} rad` },
    { name: 'pane half-angle at speed: solo / split / quadrant', value: `${paneHalfAngle(1).toFixed(3)} / ${paneHalfAngle(2).toFixed(3)} / ${paneHalfAngle(4).toFixed(3)} rad` },
    { name: 'stacking pair / near (bench constants)', value: `${STACK_PAIR_METRES} m / ${STACK_NEAR_METRES} m` },
    { name: 'unseen-bust window (bench constant)', value: `${UNSEEN_WINDOW_SECONDS} s` },
    { name: 'human-cop target swap (R-23)', value: '10 m nearer for 1 s' },
    { name: 'baiter', value: 'hazard clearance 0 m (F4 minimum); skims hazards within 40 m on his line' },
    { name: 'hider', value: `parked at a hide spot (\`findHideSpots\`), shuffling ${HIDE_SHUFFLE_METRES} m at a walk, still within ${HIDE_FREEZE_METRES} m of a cop; Dorkins starts on the road ${HIDDEN_COP_BACK_METRES} m up the ring` },
    { name: 'sprinter', value: `the canonical line at ${SPRINT_SPEED_SHARE} of top speed, cornering at ${SPRINT_CORNERING_MARGIN} of the grip limit` },
    { name: 'every script', value: `sees a cop in his road within ${SEE_COP_METRES} m and rides round him as round a bollard (the brutal pass)` },
    { name: 'intercept / hider-near (bench constants)', value: `a cop met within ${INTERCEPT_NEAR_METRES} m inside ±${(INTERCEPT_CONE_RADIANS * 180 / Math.PI).toFixed(0)}° of his heading / a riding cop within ${HIDER_NEAR_METRES} m of a parked hider` },
  ];
}
