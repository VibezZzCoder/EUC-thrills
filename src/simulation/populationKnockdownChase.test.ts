/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 (PLANS §42.2g, §42.8): the knock-down's two re-checks, on the contact
 * harness the transaction tests use (Game's fixed-step order, the real
 * controller, population, certificates and whole-step transaction).
 *
 * 1. **The chase re-check.** A knock-down holds a person still for
 *    `POPULATION_REACTION.knockdownPauseSeconds` where the stagger's flinch
 *    released a pending step aside after 0.4 s, and the CPU cop keeps his
 *    zero-speed yield on contact (POP-3). An outlaw crashes into a walker on
 *    the line a CPU cop (the production brain and controller) is riding: the
 *    cop must be moving again within the knock-down plus the existing bounded
 *    stand (POP-1: a stand ends in a back-out by 2 s), and is never pinned.
 *    The same scene with the knock-down switched off (the plain stagger) is
 *    run beside it and the delay delta is printed. Two sets of scenes:
 *    - **Seen early** (the production case): the brain sees the walker all
 *      along and rides round him, sitting or staggering; the cop never
 *      touches him (held 0, printed), so these alone cannot fail on a pin
 *      (M42 QA round 2, minor B).
 *    - **Met** (the stress case): the brain is handed the walker only from
 *      the outlaw's crash on, with the cop on his tail at chase pace, so the
 *      cop has no room to swerve or stop and meets the person — sitting, or
 *      staggering in the control — in the zero-speed yield (`held`). Here
 *      "never pinned" can fail, and a failing control proves it: a person
 *      who never gets up pins him, and the same check catches it. Before the
 *      finish-round fix in `population.ts` (a knock-down paused, rather than
 *      dropped, a step aside begun before the fall) the knock-down arm itself
 *      failed here: the cop stood held against the walker for good.
 * 2. **No re-crash on recovery.** A rider who knocked a person down recovers
 *    automatically with the stick neutral (the sit ends 0.3 s before the
 *    earliest recovery) and never crashes into the same person again.
 * 3. **The rider's recovery against a stagger-only control** (M42 QA round 1,
 *    MAJOR 1). Up is not out of the way: a person struck mid-step aside sits
 *    where they were hit and stands there, on the rider's recovery spot, where
 *    a staggered one would have walked on during the pause. The controller
 *    then waits out `POPULATION_CONTACT.recoveryFallbackSeconds` and takes the
 *    fallback, which is exactly what hitting a person who stood still costs
 *    today. Ruling R10 (Q-C1 option (a), 2026-10-10) accepted that cost as
 *    is: bounded at ≤ one `recoveryFallbackSeconds` (≈ 0.5 s), not removed.
 *    The bound is pinned here, asked (throttle held) and automatic (stick
 *    neutral), so a later change cannot grow it silently.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, POPULATION_CONTACT, POPULATION_OCCUPANT, POPULATION_REACTION, RIDER_CONTACT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { ActorSpec } from '../level/populationPlan.ts';
import { CpuRider, type CpuQuarry, type CpuView } from './cpuRider.ts';
import { createPose, EucController, type EucDynamicWorld, type EucPose } from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { PopulationSimulation, type PopulationFootprint, type PopulationReservation } from './population.ts';
import { resolvePopulationCompoundMotionBatch } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { HARNESS_DT as DT, PopulationContactHarness, populationPlanOf, stationaryPerson, straightPath } from './populationContactHarness.test-support.ts';
import { RouteSpine } from './routeSpine.ts';

/** POP-1's bound (`populationYield.test.ts`): a CPU stand on a living body ends in a back-out by 2 s. */
const COP_STAND_BOUND_SECONDS = 2;
const ride = (throttle: number): ActionSnapshot => ({ ...NEUTRAL_ACTIONS, throttle });
const holdSpeed = (speed: number, target: number) => ride(speed < target - .3 ? 1 : speed > target + .3 ? -0.3 : 0.05);

/**
 * A person pacing the middle of the road along `fromZ..toZ`, away from the
 * riders (`direction` 1, a walker by default) or toward them (−1).
 */
function lineWalker(fromZ: number, toZ: number, startZ: number, direction: 1 | -1 = 1,
  kind: 'walker' | 'jogger' = 'walker', speedMetresPerSecond = 1.1): { path: ReturnType<typeof straightPath>; actor: ActorSpec } {
  return { path: straightPath('line-walk', 0, fromZ, toZ), actor: { id: `${kind}-0`, kind, pathId: 'line-walk',
    initialDistanceMetres: startZ - fromZ, direction, movement: 'shuttle', speedMetresPerSecond, idleSeconds: 0.5,
    appearanceIndex: 0, hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } } };
}

/**
 * Two seats in one population epoch, Game's order: a human outlaw and a CPU
 * cop whose intent is the production brain's, on a real plan's road.
 */
class ChaseScene {
  readonly plan = buildLevelPlan({ main: [{ id: 'knockdown-road', length: 220, halfWidth: 6, surface: 'pavement' }] }, {
    id: 'knockdown-chase-road', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    checkpoints: [
      { id: 'start', kind: 'start', segment: 'knockdown-road', s: 5, label: 'Start' },
      { id: 'finish', kind: 'finish', segment: 'knockdown-road', s: 215, label: 'Finish' },
    ],
  });
  readonly sampler = new PlanTerrainSampler(this.plan);
  readonly population: PopulationSimulation;
  readonly certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  readonly ids = ['human-0', 'cop-0'] as const;
  readonly kinds = ['human', 'cop'] as const;
  readonly riders: EucController[] = [];
  readonly brain: CpuRider;
  readonly view: { -readonly [K in keyof CpuView]: CpuView[K] };
  /** Far down the road: the cop rides through the scene at chase pace. */
  readonly quarry: CpuQuarry = { x: 0, y: 0, z: 200, speed: 0 };
  reservations: PopulationReservation[] = [];
  private epochOpen = false;
  copHeldSteps = 0;
  /** Whether the cop's last step was held by the zero-speed yield. */
  copHeld = false;
  /** Whether the brain is handed the population; the "met" scenes hand it over only from the outlaw's crash on. */
  brainSeesPeople = true;

  /**
   * `copZ` and `speed` place the cop behind the outlaw and start both riding
   * (the "met" scenes); by default both start stopped, the cop at 0.
   */
  constructor(part: ReturnType<typeof lineWalker>, outlawZ: number, knockDowns: boolean, copZ = 0, speed = 0) {
    this.population = new PopulationSimulation(populationPlanOf([part]), this.sampler);
    // The stagger-only control: the same scene with the M42 edge switched off.
    if (!knockDowns) this.population.knockDown = () => undefined;
    this.certificates.warm();
    for (const [index, z] of [outlawZ, copZ].entries()) {
      this.riders.push(new EucController(this.sampler, { spawn: { position: { x: 0, y: 0, z }, headingY: 0 }, dynamicWorld: this.port(index) }));
      if (speed > 0) assert.ok(this.riders[index].reset(undefined, speed), 'fixture: both riders start riding');
    }
    const spine = RouteSpine.fromPlan(this.plan);
    assert.ok(spine, 'fixture: a routed road');
    this.brain = new CpuRider(spine, this.plan, this.sampler);
    const pose = this.pose(1);
    this.view = { x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: pose.speed, grounded: true, crashed: false,
      curbAhead: 0, lateralLimitG: EUC.maxLateralG };
    this.brain.place(this.view);
  }

  get outlaw(): EucController { return this.riders[0]; }
  get cop(): EucController { return this.riders[1]; }
  pose(index: number): EucPose { const out = createPose(); this.riders[index].writePose(out); return out; }
  body(pose: EucPose): PopulationFootprint {
    return { x: pose.x, z: pose.z, headingY: pose.headingY, minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres,
      halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
      velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed };
  }
  private port(index: number): EucDynamicWorld {
    const id = this.ids[index];
    return { hull: POPULATION_OCCUPANT, occupantKind: this.kinds[index], ragObstacleBodies: () => this.population.actorFootprints(), resolveMotion: () => null,
      canReact: request => populationPhysicalReactionAllowed({ ownerId: id, request, population: this.population, certificates: this.certificates,
        occupants: this.ids.map((other, i) => ({ id: other, pose: this.riders[i] ? this.pose(i) : request.previous })), reservations: this.reservations }),
      // The contact harness's checked placement, for this seat alone (a seat never vetoes a seat).
      canPlace: request => {
        const parts = this.certificates.components(id, request.occupancyPose, request.occupancyPose, 0, 'placement');
        const reservations = this.reservations.filter(value => value.id.split('/')[0] !== id);
        if (!parts.every(component => this.population.recoveryClearance(component.at(0), [], reservations).clear)) return false;
        return !this.epochOpen || request.reason === 'construct' || this.population.contactsCommitted
          || resolvePopulationCompoundMotionBatch(this.population.actorMotions(), parts).hits.length === 0;
      },
      didPlace: () => undefined };
  }

  step(outlawActions: ActionSnapshot): void {
    const poses = this.riders.map((_, i) => this.pose(i));
    this.epochOpen = true;
    this.population.step(DT, this.ids.map((id, i) => ({ id, kind: this.kinds[i], previous: this.body(poses[i]), current: this.body(poses[i]) })), this.reservations);
    const copPose = poses[1], view = this.view;
    view.x = copPose.x; view.y = copPose.y; view.z = copPose.z; view.headingY = copPose.headingY; view.speed = copPose.speed;
    view.grounded = copPose.y - copPose.groundY <= 1e-6; view.crashed = this.cop.crashed;
    view.curbAhead = this.cop.curbHeightAhead; view.lateralLimitG = this.cop.lateralLimit;
    const copActions = this.brain.step(DT, view, this.quarry, { bands: [], followLine: null,
      livingBodies: this.brainSeesPeople ? this.population.actorFootprints() : [] });
    const seats = this.riders.map((controller, i) => {
      const token = controller.prepareStep(DT, i === 0 ? outlawActions : copActions), pose = createPose();
      controller.writePreparedPose(token, pose);
      return { id: this.ids[i], kind: this.kinds[i], controller, pose, token, world: this.port(i) };
    });
    commitPopulationPhysicalTransaction({ population: this.population, certificates: this.certificates,
      seats: seats.map((seat, i) => ({ ...seat, pose: poses[i] })), preparedSeats: seats,
      before: new Map(this.ids.map((id, i) => [id, { pose: poses[i], serial: this.riders[i].discontinuitySerial }])), dt: DT,
      reservations: this.reservations, contactResponse: 'yield',
      preferActorYieldOwnerIds: this.ids.filter((_, i) => this.riders[i].crashed || !this.riders[i].isGrounded),
      bodyFromPose: pose => this.body(pose) });
    this.epochOpen = false;
    this.copHeld = seats[1].token.held;
    this.copHeldSteps += Number(this.copHeld);
  }
}

interface ChaseRun {
  readonly knockDowns: number;
  readonly crashAt: number;
  /** Seconds from the outlaw's crash until the cop is 2 m past the walker; null if never, inside `CHASE_WINDOW_SECONDS`. */
  readonly passedAfter: number | null;
  /**
   * Longest stand from the crash on, seconds: consecutive steps on which the
   * cop travelled under 0.2 m/s. Read from his position, not his speed: a
   * held step keeps the speed he arrived with, so a cop held against a person
   * at chase pace reads 20 m/s while he stands (found in the finish round).
   */
  readonly longestStand: number;
  /** Slowest travel before the walker's spot, m/s. */
  readonly slowest: number;
  /** Steps from the crash on that the zero-speed yield held him. */
  readonly copHeldSteps: number;
  /** The walker at the cop's first held step after the crash: 'sitting', 'staggering', another activity, or null (never met). */
  readonly metWalker: string | null;
  readonly copCrashed: boolean;
}

/** Twenty seconds after the crash is "for good" here: a pin, not a wait. */
const CHASE_WINDOW_SECONDS = 20;
/** The re-check's bound: the knock-down plus POP-1's bounded stand. */
const CHASE_BOUND_SECONDS = POPULATION_REACTION.knockdownPauseSeconds + COP_STAND_BOUND_SECONDS;
const round2 = (value: number | null) => value === null ? null : +value.toFixed(2);

interface ChaseOptions {
  /** The cop's start, metres down the road (the outlaw starts at `outlawZ`). */
  readonly copZ?: number;
  /** Both riders start riding at this speed, m/s; 0 starts them stopped. */
  readonly speed?: number;
  /** The brain is handed the population only from the outlaw's crash on (the "met" scenes). */
  readonly seenLate?: boolean;
  /** The failing control: whenever the knock-down ends, the walker is knocked down again — a person who never gets up. */
  readonly neverUp?: boolean;
}

/** One chase: the outlaw rides into the walker on the cop's line, then the cop's way past is timed. */
function chase(knockDowns: boolean, outlawZ: number, walker: ReturnType<typeof lineWalker> = lineWalker(56, 68, 60), options: ChaseOptions = {}): ChaseRun {
  const scene = new ChaseScene(walker, outlawZ, knockDowns, options.copZ ?? 0, options.speed ?? 0);
  scene.brainSeesPeople = !options.seenLate;
  const id = walker.actor.id;
  const person = () => {
    const row = scene.population.snapshot().actors.find(actor => actor.id === id);
    assert.ok(row, 'fixture: the walker');
    return row;
  };
  let crashAt = -1, knocked = 0, wasKnocked = false, stand = 0, longestStand = 0, slowest = Infinity, passedAfter: number | null = null;
  let walkerZ = 0, copCrashed = false, heldSteps = 0, metWalker: string | null = null;
  let lastX = scene.cop.snapshot().position.x, lastZ = scene.cop.snapshot().position.z;
  for (let tick = 0; passedAfter === null && (crashAt < 0 ? tick < Math.ceil(10 / DT) : tick * DT - crashAt <= CHASE_WINDOW_SECONDS); tick += 1) {
    scene.step(crashAt < 0 ? holdSpeed(scene.outlaw.snapshot().speed, options.speed || 10) : ride(0));
    let row = person();
    if (options.neverUp && wasKnocked && row.impactReaction !== 'knockdown') { scene.population.knockDown(id, 0, -1); row = person(); }
    const seconds = tick * DT, cop = scene.cop.snapshot();
    const down = row.impactReaction === 'knockdown';
    knocked += Number(down && !wasKnocked); wasKnocked = down;
    copCrashed ||= scene.cop.crashed;
    const travel = Math.hypot(cop.position.x - lastX, cop.position.z - lastZ) / DT;
    lastX = cop.position.x; lastZ = cop.position.z;
    if (crashAt < 0 && scene.outlaw.crashed) { crashAt = seconds; walkerZ = row.z; scene.brainSeesPeople = true; }
    if (crashAt < 0) continue;
    if (scene.copHeld) { heldSteps += 1; metWalker ??= down ? 'sitting' : row.activity === 'impacted' ? 'staggering' : row.activity; }
    stand = travel < 0.2 ? stand + DT : 0;
    longestStand = Math.max(longestStand, stand);
    if (cop.position.z < walkerZ) slowest = Math.min(slowest, travel);
    if (cop.position.z > walkerZ + 2) passedAfter = seconds - crashAt;
  }
  return { knockDowns: knocked, crashAt, passedAfter, longestStand, slowest, copHeldSteps: heldSteps, metWalker, copCrashed };
}

/** The verdict on one run, shared by every scene and the failing control: null, or why the cop counts as pinned. */
function pinned(run: ChaseRun): string | null {
  if (run.passedAfter === null) {
    return `never past the walker in ${CHASE_WINDOW_SECONDS} s (longest stand ${run.longestStand.toFixed(2)} s, held ${run.copHeldSteps} steps)`;
  }
  if (run.longestStand > CHASE_BOUND_SECONDS) return `stood ${run.longestStand.toFixed(2)} s, over the ${CHASE_BOUND_SECONDS} s bound`;
  return null;
}

const summary = (run: ChaseRun) => ({ passedAfter: round2(run.passedAfter), longestStand: round2(run.longestStand),
  slowest: round2(run.slowest), held: run.copHeldSteps, met: run.metWalker });

/** The re-check proper, on one scene and its stagger-only control. */
function assertReCheck(label: string, knockdown: ChaseRun, stagger: ChaseRun): void {
  for (const [kind, run] of [['knock-down', knockdown], ['stagger only', stagger]] as const) {
    assert.ok(run.crashAt > 0, `${label}, ${kind}: fixture — the outlaw crashes into the walker`);
    assert.equal(run.copCrashed, false, `${label}, ${kind}: the CPU cop never crashes on a person`);
    assert.equal(pinned(run), null, `${label}, ${kind}: never pinned — ${pinned(run)}`);
  }
  assert.equal(knockdown.knockDowns, 1, `${label}: the outlaw's crash knocks the walker down, once`);
  assert.equal(stagger.knockDowns, 0, `${label}: the control is the plain stagger`);
  assert.ok(knockdown.passedAfter! <= stagger.passedAfter! + CHASE_BOUND_SECONDS,
    `${label}: past within the knock-down plus his bounded stand of the stagger's time (${knockdown.passedAfter!.toFixed(2)} s against ${stagger.passedAfter!.toFixed(2)} s)`);
}

test('the chase re-check, seen early: the CPU cop rides round an outlaw\'s knock-down on his line and is never pinned', () => {
  const rows: unknown[] = [];
  let arrivalsDuringTheSit = 0;
  for (const outlawZ of [24, 34, 44, 54]) {
    const knockdown = chase(true, outlawZ), stagger = chase(false, outlawZ);
    rows.push({ outlawZ, crashAt: round2(knockdown.crashAt), knockdown: summary(knockdown), stagger: summary(stagger),
      delayDeltaSeconds: knockdown.passedAfter !== null && stagger.passedAfter !== null ? round2(knockdown.passedAfter - stagger.passedAfter) : null });
    assertReCheck(`seen early, outlaw ${outlawZ} m ahead`, knockdown, stagger);
    arrivalsDuringTheSit += Number(knockdown.passedAfter! > 0.5 && knockdown.passedAfter! < POPULATION_REACTION.knockdownPauseSeconds);
  }
  // Printed, not asserted: seen early, the brain keeps him off the person
  // (held 0), which is why the "met" scenes below exist.
  console.log(JSON.stringify({ chaseRecheckSeenEarly: rows }));
  assert.ok(arrivalsDuringTheSit > 0, 'fixture: in at least one scene the cop reaches the walker while they are down');
});

test('the chase re-check, met: the CPU cop held against a sitting or a staggering walker is never pinned, and a person who never gets up would pin him (the failing control)', () => {
  const rows: unknown[] = [];
  // The walker paces away down the middle of the road; the outlaw (from 30 m)
  // and the cop (`lead` behind him) both start at 10 m/s, and the cop runs up
  // to chase pace on the outlaw's tail.
  const walker = () => lineWalker(50, 80, 54);
  for (const lead of [18, 20, 22]) {
    const options = { copZ: 30 - lead, speed: 10, seenLate: true };
    const knockdown = chase(true, 30, walker(), options), stagger = chase(false, 30, walker(), options);
    const never = chase(true, 30, walker(), { ...options, neverUp: true });
    const label = `met, cop ${lead} m behind the outlaw`;
    rows.push({ lead, crashAt: round2(knockdown.crashAt), knockdown: summary(knockdown), stagger: summary(stagger),
      delayDeltaSeconds: knockdown.passedAfter !== null && stagger.passedAfter !== null ? round2(knockdown.passedAfter - stagger.passedAfter) : null,
      failingControl: { ...summary(never), pinned: pinned(never) } });
    // The meeting the seen-early scenes never reach: held against the person.
    assert.equal(knockdown.metWalker, 'sitting', `${label}: fixture — the cop is held against the walker while they sit`);
    assert.equal(stagger.metWalker, 'staggering', `${label}: fixture — and, in the control, while they stagger`);
    assertReCheck(label, knockdown, stagger);
    // The failing control: the same meeting with a person who never gets up.
    // The check that passed above must fail here, or it could not fail at all.
    assert.equal(never.metWalker, 'sitting', `${label}, failing control: fixture — held against the sitting walker`);
    assert.notEqual(pinned(never), null, `${label}, failing control: a person who never gets up pins the cop, and "never pinned" says so`);
  }
  console.log(JSON.stringify({ chaseRecheckMet: rows }));
});

test('no re-crash on recovery: a rider who knocked a person down at 10, 12 and 15 m/s recovers with the stick neutral and never crashes into them again', () => {
  for (const speed of [10, 12, 15]) for (const walking of [false, true]) {
    const label = `${speed} m/s, ${walking ? 'walking' : 'standing'} walker`;
    const part = walking ? lineWalker(78, 90, 80) : stationaryPerson('walker-0', 0, 80, 'walker');
    const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    let crashes = 0, wasCrashed = false, crashTick = -1, recoveredTick = -1, upTick = -1, tick = 0, knocked = false;
    for (; tick < Math.ceil(30 / DT); tick += 1) {
      harness.step(crashTick < 0 ? holdSpeed(harness.controller.snapshot().speed, speed) : NEUTRAL_ACTIONS);
      const crashed = harness.controller.crashed, row = harness.population.snapshot().actors[0];
      crashes += Number(crashed && !wasCrashed); wasCrashed = crashed;
      if (crashTick < 0 && crashed) { crashTick = tick; knocked = row.impactReaction === 'knockdown'; }
      if (crashTick >= 0 && upTick < 0 && row.impactReaction === undefined) upTick = tick;
      if (crashTick >= 0 && recoveredTick < 0 && !crashed) recoveredTick = tick;
      // Three seconds after the recovery is plenty to see a second crash.
      if (recoveredTick >= 0 && tick > recoveredTick + Math.ceil(3 / DT)) break;
    }
    console.log(JSON.stringify({ label, crashedAtSeconds: +(crashTick * DT).toFixed(2), upAfter: +((upTick - crashTick) * DT).toFixed(2),
      recoveredAfter: +((recoveredTick - crashTick) * DT).toFixed(2), crashes }));
    assert.ok(crashTick >= 0, `${label}: fixture — the rider crashes into the person`);
    assert.equal(knocked, true, `${label}: and knocks them down`);
    assert.ok(upTick > crashTick && (upTick - crashTick) * DT <= POPULATION_REACTION.knockdownPauseSeconds + 2 * DT, `${label}: they are up on time`);
    assert.ok(recoveredTick > upTick, `${label}: up before the rider who hit them`);
    assert.ok((recoveredTick - crashTick) * DT <= EUC.crashRecoverAutoSeconds + 1, `${label}: the rider recovers automatically`);
    assert.equal(crashes, 1, `${label}: the recovered rider never crashes into them again`);
  }
});

interface RecoveryRun {
  readonly crashed: boolean;
  readonly knocked: boolean;
  readonly crashes: number;
  /** Seconds from the crash to upright again. */
  readonly recoveredAfter: number | null;
}

/**
 * One crash into `part` at `speed`, then the recovery: asked (throttle held,
 * an active player) or automatic (stick neutral). With `knockDowns` false the
 * M42 edge is switched off, which leaves today's plain stagger: the control.
 */
function recoveryAfterCrash(part: ReturnType<typeof lineWalker>, speed: number, asked: boolean, knockDowns: boolean): RecoveryRun {
  const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  if (!knockDowns) harness.population.knockDown = () => undefined;
  let crashTick = -1, recoveredTick = -1, crashes = 0, wasCrashed = false, knocked = false;
  for (let tick = 0; tick < Math.ceil(25 / DT); tick += 1) {
    harness.step(crashTick < 0 ? holdSpeed(harness.controller.snapshot().speed, speed)
      : recoveredTick < 0 && asked ? ride(0.4) : NEUTRAL_ACTIONS);
    const crashed = harness.controller.crashed;
    crashes += Number(crashed && !wasCrashed); wasCrashed = crashed;
    if (crashTick < 0 && crashed) crashTick = tick;
    if (crashTick >= 0 && harness.population.snapshot().actors[0].impactReaction === 'knockdown') knocked = true;
    if (crashTick >= 0 && recoveredTick < 0 && !crashed) recoveredTick = tick;
    // Two seconds after the recovery is plenty to see a second crash.
    if (recoveredTick >= 0 && tick > recoveredTick + Math.ceil(2 / DT)) break;
  }
  return { crashed: crashTick >= 0, knocked, crashes, recoveredAfter: recoveredTick < 0 ? null : (recoveredTick - crashTick) * DT };
}

test('the rider\'s recovery against a stagger-only control: a knock-down costs him at most one recovery fallback, asked and automatic', () => {
  const fixed = (value: number | null) => value === null ? null : +value.toFixed(2);
  // QA round 1's geometries: the person had begun a step aside for the rider
  // (toward) or was walking on ahead of him (away) when he crashed into them.
  const scenes = {
    'walker toward the rider': () => lineWalker(10, 40, 30, -1),
    'jogger toward the rider': () => lineWalker(10, 40, 30, -1, 'jogger', 2.6),
    'walker walking away': () => lineWalker(20, 60, 30),
  };
  const bound = POPULATION_CONTACT.recoveryFallbackSeconds + DT;
  const rows: unknown[] = [];
  let worst = -Infinity;
  for (const [name, make] of Object.entries(scenes)) for (const speed of [5, 8, 12]) for (const asked of [true, false]) {
    const label = `${name}, ${speed} m/s, recovery ${asked ? 'asked' : 'automatic'}`;
    const knockdown = recoveryAfterCrash(make(), speed, asked, true), stagger = recoveryAfterCrash(make(), speed, asked, false);
    assert.ok(knockdown.crashed && stagger.crashed, `${label}: fixture — the rider crashes into the person in both runs`);
    assert.equal(knockdown.knocked, true, `${label}: the crash knocks them down`);
    assert.equal(stagger.knocked, false, `${label}: the control is the plain stagger`);
    assert.ok(knockdown.recoveredAfter !== null && stagger.recoveredAfter !== null, `${label}: the rider recovers in both runs`);
    const delta = knockdown.recoveredAfter - stagger.recoveredAfter;
    worst = Math.max(worst, delta);
    rows.push({ label, knockdown: fixed(knockdown.recoveredAfter), stagger: fixed(stagger.recoveredAfter), delta: fixed(delta) });
    assert.ok(delta <= bound, `${label}: the knock-down costs his recovery ${delta.toFixed(2)} s, more than the one recovery fallback R10 accepted (${knockdown.recoveredAfter.toFixed(2)} s against ${stagger.recoveredAfter.toFixed(2)} s)`);
    assert.equal(knockdown.crashes, 1, `${label}: the recovered rider never crashes into them again`);
    assert.equal(stagger.crashes, 1, `${label}: nor in the control`);
  }
  console.log(JSON.stringify({ recoveryAgainstStaggerControl: rows, worstDeltaSeconds: fixed(worst) }));
});
