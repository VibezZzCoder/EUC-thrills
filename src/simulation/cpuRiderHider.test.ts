/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, EUC, PADDLE, SIMULATION } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { COP_WHEEL_TUNING, CpuRider, type CpuQuarry, type CpuView } from './cpuRider.ts';
import { createPose, EucController } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { Paddle, type HittableSet, type HittableVolume } from './paddle.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';
import { createGroundSample } from './world.ts';

/**
 * The hider — the brutal pass (2026-09-25), the owner's ride: *"could easily
 * escape it in starting areas by hiding behind obstacles (on the outside) and
 * watching it run side to side (on the inside) like i'm invisible and it
 * can't see me."*
 *
 * A quarry parked off the road behind something solid, the cop coming along
 * the road a hundred metres back, the production brain → controller → paddle
 * handoff. Each camp is ridden twice: with the close-quarters search (the
 * shipped brain) and with it switched off (`navRangeMetres` below zero — the
 * brain as it was), and the second is the failing control.
 */

const STEP = 1 / SIMULATION.hz;
/** "Arrived nearby": the bench's `HIDER_NEAR_METRES`. */
const NEAR_METRES = 30;
/** The owner's bar: busted within about twenty seconds of the first cop arriving. */
const BAR_SECONDS = 20;
/** Where up the line the cop starts a camp, metres back of the quarry's projection. */
const CAMP_STARTS: readonly number[] = [100, 128, 156];
/** The bench hider's shuffle (`chaseScripts.ts`): how far, how fast, and the cop range he freezes at. */
const SHUFFLE_METRES = 2.5;
const SHUFFLE_SPEED = 1.2;
const SHUFFLE_FREEZE_METRES = 8;

interface CampResult {
  readonly arrivedAt: number;
  readonly hitAt: number;
  readonly crashes: number;
  readonly closest: number;
}

/**
 * Ride one camp: the cop on the road `back` metres up the line from the
 * quarry's projection, facing along it, the quarry parked and shuffling as the
 * bench's hider does; stop at the first landed strike (every landed strike is
 * a knockdown, `hardKnockShare` 0, so the first hit is the bust).
 */
function camp(plan: LevelPlan, quarry: { x: number; z: number }, back: number, seconds: number, search: boolean): CampResult {
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'no spine');
  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
    tuning: { ...COP_WHEEL_TUNING },
  });
  const brain = new CpuRider(spine, plan, sampler);
  if (!search) brain.navRangeMetres = -1;
  const located = spine.locate(quarry.x, quarry.z, -1, createSpineLocation());
  const start = spine.sample(located.distance - back, createSpineSample());
  const ground = createGroundSample();
  sampler.sampleGround(start.x, start.z, ground);
  controller.reset({ position: { x: start.x, y: ground.height, z: start.z }, headingY: start.headingY });
  sampler.sampleGround(quarry.x, quarry.z, ground);
  const target: { -readonly [K in keyof CpuQuarry]: CpuQuarry[K] } = { x: quarry.x, y: ground.height, z: quarry.z, speed: 0 };
  const volume: { -readonly [K in keyof HittableVolume]: HittableVolume[K] } = {
    id: 'rider', x: quarry.x, y: ground.height + CHASE.riderHitHeight, z: quarry.z, radius: CHASE.riderHitRadius,
  };
  // The bench's hider shuffle (`chaseScripts.ts`): back and forth along the
  // way he came in (toward the road 28 m up the line), at a walk, and still
  // while the cop is within the freeze range.
  const road = spine.sample(located.distance - 28, createSpineSample());
  const way = Math.hypot(road.x - quarry.x, road.z - quarry.z);
  const wayX = (road.x - quarry.x) / way;
  const wayZ = (road.z - quarry.z) / way;
  let shuffle = 0;
  let shuffleClock = 0;
  const targets: HittableSet = {
    eachNear(minX, minY, minZ, maxX, maxY, maxZ, visit) {
      if (volume.x + volume.radius < minX || volume.x - volume.radius > maxX) return;
      if (volume.y + volume.radius < minY || volume.y - volume.radius > maxY) return;
      if (volume.z + volume.radius < minZ || volume.z - volume.radius > maxZ) return;
      visit(volume);
    },
  };
  const paddle = new Paddle();
  const pose = createPose();
  controller.writePose(pose);
  const view: { -readonly [K in keyof CpuView]: CpuView[K] } = {
    x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: 0,
    grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG,
  };
  brain.place(view, spine.locate(pose.x, pose.z, -1, createSpineLocation()).distance);
  let arrivedAt = Infinity;
  let crashes = 0;
  let wasCrashed = false;
  let closest = Infinity;
  for (let step = 0; step < Math.round(seconds * SIMULATION.hz); step += 1) {
    controller.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead;
    view.lateralLimitG = controller.lateralLimit;
    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;
    const frozen = Math.hypot(pose.x - target.x, pose.z - target.z) <= SHUFFLE_FREEZE_METRES;
    const pace = frozen ? 0 : Math.floor(shuffleClock / (SHUFFLE_METRES / SHUFFLE_SPEED)) % 2 === 0 ? SHUFFLE_SPEED : -SHUFFLE_SPEED;
    if (!frozen) shuffleClock += STEP;
    shuffle += pace * STEP;
    target.x = quarry.x + wayX * shuffle;
    target.z = quarry.z + wayZ * shuffle;
    target.speed = Math.abs(pace);
    volume.x = target.x;
    volume.z = target.z;
    const intent = brain.step(STEP, view, target);
    controller.step(STEP, intent);
    controller.writePose(pose);
    const hits = paddle.step(STEP, pose, controller.crashed ? false : intent.swing, targets, brain.swingSide);
    const range = Math.hypot(pose.x - target.x, pose.z - target.z);
    closest = Math.min(closest, range);
    const seconds = (step + 1) * STEP;
    if (range <= NEAR_METRES && arrivedAt === Infinity) arrivedAt = seconds;
    if (hits.length > 0) return { arrivedAt, hitAt: seconds, crashes, closest };
  }
  return { arrivedAt, hitAt: Infinity, crashes, closest };
}

/** A point `lateral` metres left of the line at `distance` (AGENTS: left is (cos h, −sin h)). */
function beside(spine: RouteSpine, distance: number, lateral: number): { x: number; z: number; headingY: number } {
  const at = spine.sample(distance, createSpineSample());
  return { x: at.x + Math.cos(at.headingY) * lateral, z: at.z - Math.sin(at.headingY) * lateral, headingY: at.headingY };
}

/** A solid box `lateral` left of the line at `distance`, turned with the road: `across` × `along` metres, 2 m tall. */
function wallAt(plan: LevelPlan, spine: RouteSpine, distance: number, lateral: number, across: number, along: number): BoxCollider {
  const point = beside(spine, distance, lateral);
  const ground = createGroundSample();
  new PlanTerrainSampler(plan).sampleGround(point.x, point.z, ground);
  return {
    centre: { x: point.x, y: ground.height + 1, z: point.z },
    halfExtents: { x: across / 2, y: 1, z: along / 2 },
    rotationY: point.headingY,
    surface: 'brick',
  };
}

test('the owner’s camp: parked behind the plaza block, busted within the bar — and the old brain never gets there', () => {
  // The start plaza's two big blocks (every corpus town starts in it): the
  // rider parks against the outside end of one, the cop comes up the plaza
  // from 100 m back. Measured before the pass: the cop ran up and down the
  // plaza's middle for the whole bell on `euc` and `harbour-spark-42`.
  const { plan } = generateLevel('euc');
  const blocks = plan.segments[0].colliders.filter((box) => box.halfExtents.y * 2 >= 3 && box.halfExtents.x * box.halfExtents.z >= 10);
  assert.ok(blocks.length >= 1, 'the plaza has no block to hide behind');
  for (const block of blocks) {
    // Past the block's outer end, away from the plaza's middle line.
    const sign = block.centre.x >= 0 ? 1 : -1;
    const cos = Math.cos(block.rotationY);
    const sin = Math.sin(block.rotationY);
    const quarry = {
      x: block.centre.x + sign * cos * (block.halfExtents.x + 1.5),
      z: block.centre.z - sign * sin * (block.halfExtents.x + 1.5),
    };
    // From three places up the plaza's approach: the old brain's failure is
    // an orbit whose length depends on how he arrives, so the control is
    // its worst over the three, and the shipped brain must clear every one.
    let worstSearched = 0;
    let worstControl = 0;
    for (const back of CAMP_STARTS) {
      const searched = camp(plan, quarry, back, 90, true);
      assert.ok(Number.isFinite(searched.arrivedAt), 'the cop never came near');
      assert.equal(searched.crashes, 0, `the cop crashed finding his way round the block (from ${back} m)`);
      worstSearched = Math.max(worstSearched, searched.hitAt - searched.arrivedAt);
      const control = camp(plan, quarry, back, 90, false);
      worstControl = Math.max(worstControl, control.hitAt - control.arrivedAt);
    }
    assert.ok(worstSearched <= BAR_SECONDS, `busted at worst ${worstSearched.toFixed(1)} s after arriving`);
    assert.ok(worstControl > BAR_SECONDS,
      `control: the brain without the search reached him within ${worstControl.toFixed(1)} s from every start — the fixture no longer shows the defect`);
  }
});

test('a walled yard open at the back: he goes round to the gate', () => {
  // Three walls, the one facing the road and its two ends; the way in is the
  // far side. Straight at the rider is a wall, and so is every sideways walk
  // along the front: only a way round to the back reaches him.
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null);
  const mid = 60;
  plan.solids = [
    ...(plan.solids ?? []),
    wallAt(plan, spine, mid, 11.5, 0.4, 12),
    wallAt(plan, spine, mid - 6, 15.5, 8, 0.4),
    wallAt(plan, spine, mid + 6, 15.5, 8, 0.4),
  ];
  const quarry = beside(spine, mid, 15);
  const searched = camp(plan, quarry, 100, 60, true);
  assert.ok(searched.hitAt - searched.arrivedAt <= BAR_SECONDS,
    `busted ${(searched.hitAt - searched.arrivedAt).toFixed(1)} s after arriving (closest ${searched.closest.toFixed(1)} m)`);
  assert.ok(searched.crashes <= 1, `${searched.crashes} crashes getting into one yard`);
  const control = camp(plan, quarry, 100, 60, false);
  assert.ok(control.hitAt - control.arrivedAt > BAR_SECONDS,
    `control: the brain without the search got into the yard in ${(control.hitAt - control.arrivedAt).toFixed(1)} s`);
});

test('behind a long fence line: he takes the nearer end, not a sideways walk', () => {
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null);
  const mid = 60;
  plan.solids = [...(plan.solids ?? []), wallAt(plan, spine, mid, 11, 0.2, 36)];
  const quarry = beside(spine, mid, 13.5);
  const searched = camp(plan, quarry, 100, 60, true);
  assert.ok(searched.hitAt - searched.arrivedAt <= BAR_SECONDS,
    `busted ${(searched.hitAt - searched.arrivedAt).toFixed(1)} s after arriving (closest ${searched.closest.toFixed(1)} m)`);
  assert.equal(searched.crashes, 0, 'the cop crashed going round a fence');
});

test('a cop creeping up on a parked rider winds up inside his reach, and lands it', () => {
  // The swing's floor was `swingRangeMetres` (3.4 m): at a walking closure the
  // swing ended three metres short, and the cooldown then parked him inside
  // the arc's reach. Scripted kinematics, the production brain and paddle:
  // the cop rolls straight at a stopped rider at 2 m/s.
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null);
  const brain = new CpuRider(spine, plan, new PlanTerrainSampler(plan));
  const at = spine.sample(60, createSpineSample());
  const quarry: CpuQuarry = { x: at.x + Math.sin(at.headingY) * 8, y: at.y, z: at.z + Math.cos(at.headingY) * 8, speed: 0 };
  const volume: HittableVolume = { id: 'rider', x: quarry.x, y: quarry.y + CHASE.riderHitHeight, z: quarry.z, radius: CHASE.riderHitRadius };
  const targets: HittableSet = { eachNear(_a, _b, _c, _d, _e, _f, visit) { visit(volume); } };
  const envelope = PADDLE.pivotOffset + PADDLE.reach + PADDLE.headRadius + CHASE.riderHitRadius;
  const run = (trigger: (swing: boolean, range: number) => boolean): { firstSwing: number; hits: number } => {
    const paddle = new Paddle();
    let firstSwing = Infinity;
    let hits = 0;
    for (let step = 0; step < 5 * SIMULATION.hz; step += 1) {
      const travelled = Math.min(8 - 0.9, 2 * step * STEP);
      const view: CpuView = {
        x: at.x + Math.sin(at.headingY) * travelled, y: at.y, z: at.z + Math.cos(at.headingY) * travelled,
        headingY: at.headingY, speed: 2, grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG,
      };
      if (step === 0) brain.place(view);
      const range = Math.hypot(quarry.x - view.x, quarry.z - view.z);
      const swing = trigger(brain.step(STEP, view, quarry).swing, range);
      if (swing && !Number.isFinite(firstSwing)) firstSwing = range;
      hits += paddle.step(STEP, view, swing, targets, brain.swingSide).length;
    }
    return { firstSwing, hits };
  };
  const shipped = run((swing) => swing);
  assert.ok(shipped.firstSwing <= envelope, `wound up at ${shipped.firstSwing.toFixed(2)} m, out of his own reach (${envelope.toFixed(2)} m)`);
  assert.ok(shipped.hits > 0, 'the creeping cop never landed the swing');
  // Control: the old trigger — the first step inside `swingRangeMetres`.
  let fired = false;
  const old = run((_swing, range) => {
    if (fired || range > CHASE.swingRangeMetres) return false;
    fired = true;
    return true;
  });
  assert.equal(old.hits, 0, 'control: the 3.4 m trigger landed at a walking closure — the fixture no longer shows the defect');
});
