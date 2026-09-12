/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC, INPUT, PHYSICS, SIMULATION, TERRAIN, TRACK_DAY, WHEEL } from '../data/tuning.ts';
import { SURFACES } from '../data/surfaces.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import type { LevelPlan } from '../level/plan.ts';
import {
  EucController,
  type CrashCause,
  type EucTuning,
  type LandingQuality,
} from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { RaceRun } from '../simulation/raceRun.ts';
import { LapEnvelope, TrackDayRun } from '../simulation/trackDay.ts';
import {
  LAP_DECK,
  LAP_HALF_WIDTH,
  LAP_RADIUS,
  LAP_STRAIGHT,
  dropFixture,
  flatFixture,
  gapFixture,
  kickerFixture,
  lipFixture,
  skinnyFixture,
  spinPadFixture,
  lapFixture,
  parallelLegs,
  runupFor,
  stairsFixture,
  stepUpFixture,
} from './featureFixtures.ts';
import {
  METRES_PER_SECOND_PER_MPH,
  topSpeedPreset,
  topSpeedWrites,
} from '../simulation/topSpeedPreset.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';

/**
 * The jump bench — M36 Phase 0's measurement instrument (`docs/PLANS.md`
 * §36.2a, §36.4, §36.8 Phase 0).
 *
 * **§36.2a was a set of numbers nobody could re-derive.** Node ran the shipped
 * modules in memory, printed a table into the plan, and threw the harness away:
 * "Nothing was saved as a new fixture. Phase 0 must turn the method into
 * reproducible, checked-in feature measurements before dimensions are frozen."
 * This file is that method, and `jumpBench.test.ts` pins the numbers §36.2a
 * published so a controller change that moves them fails a test instead of
 * silently invalidating a feature catalogue.
 *
 * **What this is not.** It is a bench: the controller and `PlanTerrainSampler`
 * at 120 Hz with no browser, no camera, no rider mesh and no player. §36.2a's
 * own caveat governs every row it prints — "controller/PlanTerrainSampler bench
 * observations, not browser or owner acceptance and not certified dimensions
 * for an unbuilt obstacle". A tier here is the controller's verdict on a
 * fixture, not a promise about a feature that has not been built.
 *
 * **Layering.** `src/bench/` imports `level/` and `simulation/` and is imported
 * by nothing the game runs — not by `app/`, not by `render/`, not by a level
 * producer. It reaches no further up than `input/ActionSnapshot`, which is the
 * intent a controller reads, exactly as the headless controller suite does. It
 * is also free of `node:` imports on purpose, so `node --test` and
 * `tools/jump-bench.mjs` share one driver and the tool owns all the printing.
 *
 * Nothing here reads the clock or a random source. Two runs of one trial are
 * `deepEqual`, and `jumpBench.test.ts` asserts it.
 */

/** One fixed simulation step, seconds. The bench never uses another. */
export const STEP_SECONDS = 1 / SIMULATION.hz;

/** How many steps a press may wait in `app/Game.ts`'s buffer before it lapses. */
export const BUFFER_STEPS = Math.round(INPUT.actionBufferSeconds * SIMULATION.hz);

/** How far the coast runs past the last touchdown before a trial stops. */
export const COAST_STEPS = 60;

/** How long after a touchdown `speedAfterMph` is read, steps. */
export const SPEED_AFTER_STEPS = 10;

/**
 * The three wheels the bench measures, and only one of them is a playable
 * window.
 *
 * `shipped65` is the shipped table exactly as the game boots it — the default
 * tuning, `cutoutEnabled: 1`, no live-tuning writes at all. `diagnostic50` is
 * `?mph=50`, which §36.8 Phase 0 names as the second required preset: the
 * `EUC.*` writes `topSpeedPreset(50)` produces, cutout still on.
 *
 * **`nominal65-cutout-off` is a diagnostic and is never a window.** §36.2a:
 * "A 65-mph ballistic row, if needed in Phase 0, is explicitly an isolated
 * diagnostic with cutout disabled; it cannot certify a playable line." It is
 * printed in its own table under its own heading and no feature table uses it.
 */
export const BENCH_WHEELS = ['shipped65', 'diagnostic50', 'nominal65-cutout-off'] as const;

export type BenchWheel = (typeof BENCH_WHEELS)[number];

/** The wheels a playable window may be measured on. */
export const PLAYABLE_WHEELS: readonly BenchWheel[] = ['shipped65', 'diagnostic50'];

/**
 * The constructor `tuning` overrides for a wheel.
 *
 * The 50 preset goes through `topSpeedWrites` rather than through three
 * hand-copied fields, so the bench writes whatever `TOP_SPEED_PATHS` says the
 * game writes. Only the `EUC.*` paths are tuning: the camera and audio
 * references are presentation and the controller has never read them.
 */
export function wheelTuning(wheel: BenchWheel): Partial<EucTuning> {
  if (wheel === 'shipped65') return {};
  if (wheel === 'nominal65-cutout-off') return { cutoutEnabled: 0 };

  const writes = topSpeedWrites(topSpeedPreset(50));
  const tuning: Partial<EucTuning> = {};
  for (const [path, value] of Object.entries(writes)) {
    if (!path.startsWith('EUC.')) continue;
    const key = path.slice('EUC.'.length) as keyof EucTuning;
    (tuning as Record<string, number>)[key] = value;
  }
  return tuning;
}

/** How a wheel is spelled in a report. */
export function wheelLabel(wheel: BenchWheel): string {
  if (wheel === 'shipped65') return 'shipped 65';
  if (wheel === 'diagnostic50') return 'diagnostic 50 (?mph=50)';
  return 'nominal 65, cutout OFF (diagnostic)';
}

/** Where a touchdown landed, judged by the fixture that authored the heights. */
export type LandedOn = 'deck' | 'catch' | 'other';

/**
 * A built world plus what the bench needs to read a result off it.
 *
 * `lipS` is the launch feature's position in the fixture's own `s` frame, which
 * for every straight fixture IS world +Z: the segment chain starts at z = 0, so
 * `s` and `z` are one number. A fixture that starts the rider partway along —
 * the skinny's stopped restart — moves the spawn and leaves the chain where it
 * is, so its declared dimensions keep meaning the same thing. `classify`
 * is the fixture's own answer to "was that the deck or the catch ground",
 * because only the author of the geometry knows what the declared heights were.
 */
export interface Fixture {
  readonly plan: LevelPlan;
  readonly lipS: number | null;
  classify(y: number, s: number): LandedOn;
  readonly label: string;
  /** Declared dimensions, one phrase per line, printed above a feature table. */
  readonly geometry: readonly string[];
  /**
   * Where the authored corridor stops being the thing under measurement.
   *
   * **A fixture has an edge and the bench has to stop at it.** Past the last
   * segment's exit socket the heightfield pads out to the flat surround, so a
   * corridor that has descended five metres meets a ramp back up to zero and
   * then a crest — and the controller launches off that crest, correctly, and
   * the row reads as a feature measurement of something the fixture never
   * authored. The first version of T5b published three such launches. A trial
   * stops here instead and says it did.
   */
  readonly endS: number;
  /**
   * Where a trial starts, when the plan's own spawn is not it.
   *
   * **Phase 2's installed measurements are the reason this exists.** A straight
   * fixture spawns its rider at the chain's origin and rides +Z; a feature
   * standing at s = 431 m on a lap that has turned five times does not have a
   * plan spawn anywhere near it, and rebuilding the park per feature would
   * measure a different world from the one that ships. So an installed fixture
   * hands the bench the pose it wants and the same driver rides it.
   */
  readonly spawnPose?: { readonly position: Vec3; readonly headingY: number };
  /**
   * The axis `TrialScript.lateralOffset` moves the spawn along.
   *
   * `+X` by default, which is the rider's left on every straight fixture here
   * (they all face +Z). An installed fixture supplies its corridor's own left.
   */
  readonly lateralAxis?: { readonly x: number; readonly z: number };
  /**
   * The fixture's own `s` for a world point. Default: the point's `z`.
   *
   * Every straight fixture's chain starts at z = 0 and rides +Z, so `s` and `z`
   * are one number and the default is exact. A lap is not straight, so an
   * installed fixture projects the point onto the corridors it spans instead.
   */
  progressOf?(x: number, z: number): number;
  /** The fixture's own `t` for a world point. Default: the point's `x`. */
  lateralOf?(x: number, z: number): number;
}

/** How the crouch charge is spent on a trial. */
export type BenchCharge = 'none' | 'half' | 'full';

/** When — and whether — the trial presses Hop. */
export type BenchHop = 'none' | 'atSpeed' | { stepsFromLip: number };

export interface TrialScript {
  /**
   * The approach speed, mph, or null to coast from rest.
   *
   * Bang-bang: full throttle below it, nothing at or above it, so the wheel
   * arrives at the lip near the number rather than at whatever the run-up
   * happened to reach. §36.4: "A feature's window is speed at the lip".
   */
  readonly targetMph: number | null;
  /**
   * Start the run already at this speed, mph, instead of from a standstill.
   *
   * **Phase 2's installed windows need this and a straight fixture does not.**
   * A bench fixture buys its lip speed with a run-up (`runupFor`), which is
   * honest because the fixture is 240 m of level ground authored for it. A
   * feature installed on a lap has whatever run-up the corridor in front of it
   * happens to be — six metres, at the ledge — and a trial that could only
   * reach 12 mph there would be measuring the approach rather than the feature.
   * §36.4 is explicit that "a feature's window is speed at the lip", so an
   * installed trial is *placed* at the speed under test a few metres short of
   * the lip and the throttle law then holds it there. What that gives up is the
   * claim that the speed is reachable, which is measured separately and
   * reported as the corridor's own attainable band.
   */
  readonly startMph?: number;
  /** Where the launch feature is, in the fixture's `s` frame. */
  readonly lipS: number | null;
  readonly hop: BenchHop;
  readonly charge: BenchCharge;
  /** Held steer, -1..1. Zero unless a trial is deliberately steering. */
  readonly steer?: number;
  /** Air-tap the 180 on the first rising airborne step, and which way. */
  readonly spinTap?: 'left' | 'right' | null;
  readonly maxSteps?: number;
  /** Start the run this far left of the fixture's centreline, metres. */
  readonly lateralOffset?: number;
  /**
   * How long the coast after the LAST touchdown runs before the trial stops.
   *
   * `COAST_STEPS` by default, which is half a second and the right answer for a
   * feature with one flight. A rhythm feature is the reason it is a knob: three
   * treads three metres apart at 5 mph are more than a second apart, so the
   * default would stop the trial after the first tread and report a staircase
   * as one drop. A rhythm passes a value large enough to reach `Fixture.endS`.
   */
  readonly coastSteps?: number;
  /**
   * Keep regulating to `targetMph` after the launch instead of coasting.
   *
   * Off by default, because §36.2a's protocol releases the throttle at the
   * press and a single-feature window should be measured on a coast rather than
   * on whatever the throttle was doing mid-flight. A RHYTHM is the exception
   * and the staircase is why: a rider does not coast down three steps, they
   * hold a speed down them, and a coasting trial stops between the first tread
   * and the second at walking pace and reports a staircase as one drop.
   */
  readonly holdThrottle?: boolean;
  /**
   * Keep riding after a crash instead of stopping the trial at it.
   *
   * Off by default, because a fixture table's question is "what tier was that
   * landing" and a crashed run has answered it. §36.4 asks a second question of
   * every installed feature — "at least one credible outside-window miss must
   * demonstrate a readable consequence **and a recoverable exit**" — and the
   * only honest way to answer it is to keep the clock running: the controller
   * respawns itself `EUC.crashRecoverAutoSeconds` after a wipeout at
   * `crashRecoverSpeedFactor` of the speed it crashed at, in place, with no
   * reset and no teleport. A trial that stopped at the crash could not see it.
   */
  readonly rideThroughCrash?: boolean;
}

/** One touchdown, and every trial records all of them. */
export interface BenchLanding {
  readonly tier: LandingQuality;
  readonly score: number;
  readonly impact: number;
  readonly misalignment: number;
  readonly s: number;
  readonly t: number;
  readonly y: number;
  readonly surface: SurfaceId;
  readonly landedOn: LandedOn;
  /** Last grounded step to touchdown, including the first airborne tick. */
  readonly flightSeconds: number;
  readonly flightMetres: number;
  readonly apexMetres: number;
  readonly takeoffMph: number;
  readonly launched: 'hop' | 'drop';
  readonly speedAfterMph: number;
  readonly reversing: boolean;
  /** Heading at touchdown minus the spawn heading, radians. ±π after a 180. */
  readonly headingChange: number;
}

export interface TrialResult {
  /** Actual charge latched at the first takeoff, 0..1; zero for a drop. */
  readonly takeoffCharge: number;
  readonly wheel: BenchWheel;
  readonly label: string;
  /** Speed on the last grounded step of the first flight, mph. Signed. */
  readonly takeoffMph: number;
  readonly takeoffS: number;
  readonly takeoffY: number;
  readonly launched: 'hop' | 'drop' | 'none';
  readonly hopFired: 'on-request' | 'buffered' | 'expired' | 'none';
  readonly flightSeconds: number;
  readonly flightMetres: number;
  readonly apexMetres: number;
  readonly touchdownS: number;
  readonly touchdownT: number;
  readonly touchdownY: number;
  readonly touchdownSurface: SurfaceId | 'none';
  readonly landingTier: 'none' | LandingQuality;
  readonly landingScore: number;
  readonly landingImpact: number;
  readonly landingMisalignment: number;
  readonly landedOn: LandedOn;
  /** Signed speed `SPEED_AFTER_STEPS` after the first touchdown, mph. */
  readonly speedAfterMph: number;
  /** `takeoffMph` less the magnitude of `speedAfterMph`, mph. */
  readonly speedLossMph: number;
  readonly crashed: boolean;
  readonly crashCause: CrashCause;
  /** Steps the wheel spent refusing a move into something solid, at or before the lip. */
  readonly blockedSteps: number;
  readonly reversing: boolean;
  readonly spinArmed: boolean;
  /** Heading at the first touchdown minus the spawn heading, radians. */
  readonly headingChange: number;
  readonly steps: number;
  /** Every touchdown of the run, in order. Empty when the wheel never landed. */
  readonly landings: readonly BenchLanding[];
  /** Final position, for a trial that never left the ground. */
  readonly finalS: number;
  readonly finalT: number;
  readonly finalMph: number;
  readonly offCourse: boolean;
  /** True when the trial stopped because it ran out of authored corridor. */
  readonly reachedEnd: boolean;
  /**
   * Steps from the crash to the step the wheel was rolling again, or -1.
   *
   * Only a `rideThroughCrash` trial can observe this; every other trial stops
   * at the crash and reports -1 whether or not a recovery was available.
   */
  readonly recoveredAfterSteps: number;
}

function actionsOf(partial: Partial<ActionSnapshot>): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** The launch speed a charge buys, m/s — `EucController.launchHop`'s arithmetic. */
export function hopLaunchSpeed(charge: BenchCharge): number {
  const fraction = charge === 'full' ? 1 : charge === 'half' ? 0.5 : 0;
  return EUC.hopLaunchSpeed * Math.sqrt(1 + EUC.hopChargeHeightBonus * fraction);
}

/**
 * How many steps before the lip a hop must be pressed for its apex to arrive
 * there — the compression plus the time gravity takes to spend the impulse.
 *
 * A step count rather than a distance, and that is the point: the press-to-apex
 * interval is a *time*, so the same number serves every approach speed and a
 * step-up table does not have to guess a lead distance per row.
 */
export function apexStepsBeforeLip(charge: BenchCharge): number {
  const seconds = EUC.hopCompressSeconds + hopLaunchSpeed(charge) / PHYSICS.gravity;
  return Math.round(seconds / STEP_SECONDS);
}

/**
 * The tallest face the wheel can roll up, metres.
 *
 * The other half of every authored block, and the one a lip table has to print:
 * a lip is two faces, the one it launches off and the kerb the rider has to
 * mount to get on it, and past this the second one simply refuses them.
 */
export function stepUpLimit(): number {
  return TERRAIN.stepUpPedalFactor * WHEEL.pedalHeight;
}

/** The ideal flat apex a charge buys, metres — §36.2's 0.459 / 0.642. */
export function idealApex(charge: BenchCharge): number {
  const launch = hopLaunchSpeed(charge);
  return (launch * launch) / (2 * PHYSICS.gravity);
}

interface RunState {
  readonly controller: EucController;
}

function spawnFor(fixture: Fixture, lateralOffset: number): {
  position: { x: number; y: number; z: number };
  headingY: number;
} {
  const spawn = fixture.spawnPose ?? fixture.plan.spawn;
  const axis = fixture.lateralAxis ?? { x: 1, z: 0 };
  return {
    position: {
      x: spawn.position.x + axis.x * lateralOffset,
      y: spawn.position.y,
      z: spawn.position.z + axis.z * lateralOffset,
    },
    headingY: spawn.headingY,
  };
}

/** The fixture's `s` for a world point — its own frame, or plain `z`. */
function progressOf(fixture: Fixture, x: number, z: number): number {
  return fixture.progressOf === undefined ? z : fixture.progressOf(x, z);
}

/** The fixture's `t` for a world point — its own frame, or plain `x`. */
function lateralOf(fixture: Fixture, x: number, z: number): number {
  return fixture.lateralOf === undefined ? x : fixture.lateralOf(x, z);
}

function makeRun(
  fixture: Fixture,
  wheel: BenchWheel,
  lateralOffset: number,
  startMph?: number,
): RunState {
  const spawn = spawnFor(fixture, lateralOffset);
  // No `wobbleMasterGain` override: the shipped gate is 0 and a bench that
  // opened it would be measuring a mechanic the owner removed at M13.
  const controller = new EucController(new PlanTerrainSampler(fixture.plan), {
    tuning: wheelTuning(wheel),
    spawn,
  });
  if (startMph !== undefined) controller.reset(spawn, startMph * METRES_PER_SECOND_PER_MPH);
  return { controller };
}

/**
 * The dry pass, and the reason a timed press is expressible at all.
 *
 * A press "five steps before the lip" needs to know which step that is, and the
 * only honest way to learn it is to ride the same approach with no press and
 * watch. The reference run is identical to the real one in every other
 * respect — same wheel, same throttle law, same steer, same start — so the step
 * it reports is the step the real run would have reached.
 */
interface Reference {
  /** Last step before the wheel's `s` reached the lip, or its closest approach. */
  readonly lipStep: number;
  /** First step the speed reached the target, or -1. */
  readonly triggerStep: number;
}

function referencePass(
  fixture: Fixture,
  wheel: BenchWheel,
  script: TrialScript,
  maxSteps: number,
): Reference {
  const run = makeRun(fixture, wheel, script.lateralOffset ?? 0, script.startMph);
  const target = script.targetMph === null ? null : script.targetMph * METRES_PER_SECOND_PER_MPH;
  const lip = script.lipS;
  const steer = script.steer ?? 0;

  let lipStep = -1;
  let bestS = -Infinity;
  let bestStep = 0;
  let triggerStep = -1;
  let committed = false;

  for (let step = 0; step < maxSteps; step += 1) {
    const before = run.controller.snapshot();
    if (triggerStep < 0 && target !== null && before.speed >= target) triggerStep = step;
    const throttle = committed || target === null ? 0 : before.speed < target ? 1 : 0;
    run.controller.step(STEP_SECONDS, actionsOf({ throttle, steer }));
    const after = run.controller.snapshot();
    const s = progressOf(fixture, after.position.x, after.position.z);
    if (!after.grounded) committed = true;
    if (s > bestS) {
      bestS = s;
      bestStep = step;
    }
    if (lip !== null && lipStep < 0 && s >= lip) lipStep = Math.max(0, step - 1);
    if (after.crashed) break;
    if (s >= fixture.endS) break;
    // The reference only has to reach the lip; after that it is riding for
    // nothing. Stopping there is what keeps a timed table affordable.
    if (lipStep >= 0 && triggerStep >= 0) break;
    if (lipStep >= 0 && target === null) break;
  }

  return { lipStep: lipStep >= 0 ? lipStep : bestStep, triggerStep };
}

/**
 * Ride one scripted trial and read the controller's verdict.
 *
 * **The press is delivered exactly the way `app/Game.ts` delivers one.** The
 * composition root raises the flag only on a step where the controller says
 * `canAcceptHop || canAcceptSpin`; otherwise the press waits in the 0.15 s
 * action buffer and fires on the first legal step, or lapses. A bench that
 * handed the controller a press on an illegal step would be measuring an input
 * path the player does not have, and the difference is exactly the early/late
 * timing interval §36.4 asks every feature record to carry.
 */
export function runTrial(fixture: Fixture, wheel: BenchWheel, script: TrialScript): TrialResult {
  const maxSteps = script.maxSteps ?? 3000;
  const coastLimit = script.coastSteps ?? COAST_STEPS;
  const lateralOffset = script.lateralOffset ?? 0;
  const steer = script.steer ?? 0;
  const target = script.targetMph === null ? null : script.targetMph * METRES_PER_SECOND_PER_MPH;
  const timed = typeof script.hop === 'object';
  const needsReference = timed || (script.charge === 'half' && script.hop !== 'none');

  const reference = needsReference
    ? referencePass(fixture, wheel, script, maxSteps)
    : null;

  let plannedPress = -1;
  if (timed && reference !== null) {
    plannedPress = reference.lipStep - (script.hop as { stepsFromLip: number }).stepsFromLip;
    if (plannedPress < 0) plannedPress = 0;
  } else if (script.hop === 'atSpeed' && reference !== null && reference.triggerStep >= 0) {
    plannedPress = reference.triggerStep;
  }

  // Half charge is `hopChargeSeconds / 2` of held crouch that ends at the
  // press, which is the "partial charge" §36.4 requires and is a different
  // thing from a full hold: the charge bookkeeping in `stepHop` zeroes on a
  // released crouch, so the half has to be contiguous with the press.
  const halfChargeSteps = Math.round((EUC.hopChargeSeconds / 2) / STEP_SECONDS);

  const controller = makeRun(fixture, wheel, lateralOffset, script.startMph).controller;
  const lip = script.lipS;
  const spawnHeading = (fixture.spawnPose ?? fixture.plan.spawn).headingY;

  let committed = false;
  let pressRequested = false;
  let pressFired = false;
  let pressRequestStep = -1;
  let hopFired: TrialResult['hopFired'] = 'none';
  let spinRequested = false;
  let spinFired = false;
  let blockedSteps = 0;
  let crashed = false;
  let crashCause: CrashCause = 'none';
  let crashStep = 0;
  let recoveredAfterSteps = -1;
  let steps = 0;

  const landings: BenchLanding[] = [];
  const pendingSpeedReads: { index: number; atStep: number }[] = [];
  const speedAfter: number[] = [];
  const reversingAfter: boolean[] = [];

  let airborne = false;
  let airSteps = 0;
  let apex = 0;
  let takeoffS = 0;
  let takeoffY = 0;
  let takeoffX = 0;
  let takeoffZ = 0;
  let takeoffMph = 0;
  let launchedBy: 'hop' | 'drop' = 'drop';
  let firstLaunched: 'hop' | 'drop' | 'none' = 'none';
  let takeoffCharge = 0;
  let lastHops = controller.snapshot().hops;
  let coast = 0;
  let reachedEnd = false;
  let final = controller.snapshot();

  for (let step = 0; step < maxSteps; step += 1) {
    const before = controller.snapshot();

    // -- What the player is doing this step ---------------------------------
    let wantsPress = false;
    if (!pressRequested) {
      if (plannedPress >= 0 && step === plannedPress) wantsPress = true;
      else if (script.hop === 'atSpeed' && plannedPress < 0 && target !== null
        && before.speed >= target) wantsPress = true;
    }
    if (wantsPress) {
      pressRequested = true;
      pressRequestStep = step;
    }

    const spinNow = script.spinTap != null
      && !spinRequested
      && !before.grounded
      && controller.canAcceptSpin;
    if (spinNow) spinRequested = true;

    const pressPending = pressRequested && !pressFired
      && step - pressRequestStep <= BUFFER_STEPS;
    const legal = controller.canAcceptHop || controller.canAcceptSpin;
    const hop = (pressPending || spinNow) && legal;

    if (pressRequested && !pressFired && hop && !spinNow) {
      pressFired = true;
      hopFired = step === pressRequestStep ? 'on-request' : 'buffered';
    }
    if (spinNow && hop) spinFired = true;

    // Throttle: bang-bang to the target until the trial commits, which is the
    // press or the launch, whichever comes first. §36.2a: "accelerate until the
    // named trigger speed, then release throttle and press Hop once".
    if (hop && pressRequested && !spinNow && script.holdThrottle !== true) committed = true;
    const throttle = committed || target === null ? 0 : before.speed < target ? 1 : 0;

    let crouch = script.charge === 'full';
    if (script.charge === 'half' && plannedPress >= 0) {
      crouch = step >= plannedPress - halfChargeSteps && step < plannedPress;
    }

    const stepSteer = spinNow ? (script.spinTap === 'right' ? 1 : -1) : steer;

    controller.step(STEP_SECONDS, actionsOf({ throttle, steer: stepSteer, crouch, hop }));
    steps = step + 1;
    const after = controller.snapshot();
    final = after;
    const s = progressOf(fixture, after.position.x, after.position.z);

    if (after.blocked && (lip === null || s <= lip)) blockedSteps += 1;
    if (after.crashed && !crashed) {
      crashed = true;
      crashCause = after.crashCause;
      crashStep = step;
    }
    if (crashed && recoveredAfterSteps < 0 && !after.crashed && after.grounded) {
      recoveredAfterSteps = step - crashStep;
    }

    // -- Flight bookkeeping -------------------------------------------------
    if (!after.grounded) {
      if (!airborne) {
        airborne = true;
        airSteps = 0;
        apex = 0;
        takeoffS = progressOf(fixture, before.position.x, before.position.z);
        takeoffY = before.position.y;
        takeoffX = before.position.x;
        takeoffZ = before.position.z;
        takeoffMph = before.speed / METRES_PER_SECOND_PER_MPH;
        launchedBy = after.hops > lastHops ? 'hop' : 'drop';
        if (firstLaunched === 'none') {
          firstLaunched = launchedBy;
          takeoffCharge = launchedBy === 'hop' ? after.hopCharge : 0;
        }
        if (script.holdThrottle !== true) committed = true;
      }
      airSteps += 1;
      if (after.airHeight > apex) apex = after.airHeight;
    } else if (airborne) {
      airborne = false;
      const landing: BenchLanding = {
        tier: after.landingQuality,
        score: after.landingScore,
        impact: after.landingImpact,
        misalignment: after.landingMisalignment,
        s,
        t: lateralOf(fixture, after.position.x, after.position.z),
        y: after.position.y,
        surface: after.surface,
        landedOn: fixture.classify(after.position.y, s),
        // The last grounded step to touchdown, the first airborne tick
        // included — §36.2a's own definition of the flight it reported.
        flightSeconds: (airSteps + 1) * STEP_SECONDS,
        flightMetres: Math.hypot(after.position.x - takeoffX, after.position.z - takeoffZ),
        apexMetres: apex,
        takeoffMph,
        launched: launchedBy,
        speedAfterMph: after.speed / METRES_PER_SECOND_PER_MPH,
        reversing: after.reversing,
        headingChange: after.headingY - spawnHeading,
      };
      pendingSpeedReads.push({ index: landings.length, atStep: step + SPEED_AFTER_STEPS });
      speedAfter.push(landing.speedAfterMph);
      reversingAfter.push(after.reversing);
      landings.push(landing);
      coast = 0;
    }
    lastHops = after.hops;

    for (let index = pendingSpeedReads.length - 1; index >= 0; index -= 1) {
      if (pendingSpeedReads[index].atStep > step) continue;
      speedAfter[pendingSpeedReads[index].index] = after.speed / METRES_PER_SECOND_PER_MPH;
      reversingAfter[pendingSpeedReads[index].index] = after.reversing;
      pendingSpeedReads.splice(index, 1);
    }

    if (crashed && script.rideThroughCrash !== true) break;
    if (s >= fixture.endS) {
      reachedEnd = true;
      break;
    }
    if (landings.length > 0 && !airborne) {
      coast += 1;
      if (coast >= coastLimit && pendingSpeedReads.length === 0) break;
    }
  }

  if (pressRequested && !pressFired) hopFired = 'expired';

  const resolved = landings.map((landing, index) => ({
    ...landing,
    speedAfterMph: speedAfter[index],
    reversing: reversingAfter[index],
  }));
  const first = resolved[0];

  return {
    wheel,
    label: fixture.label,
    takeoffMph: first === undefined ? 0 : first.takeoffMph,
    takeoffS: first === undefined ? 0 : takeoffS,
    takeoffY: first === undefined ? 0 : takeoffY,
    launched: firstLaunched,
    takeoffCharge,
    hopFired,
    flightSeconds: first === undefined ? 0 : first.flightSeconds,
    flightMetres: first === undefined ? 0 : first.flightMetres,
    apexMetres: first === undefined ? 0 : first.apexMetres,
    touchdownS: first === undefined ? 0 : first.s,
    touchdownT: first === undefined ? 0 : first.t,
    touchdownY: first === undefined ? 0 : first.y,
    touchdownSurface: first === undefined ? 'none' : first.surface,
    landingTier: first === undefined ? 'none' : first.tier,
    landingScore: first === undefined ? 0 : first.score,
    landingImpact: first === undefined ? 0 : first.impact,
    landingMisalignment: first === undefined ? 0 : first.misalignment,
    landedOn: first === undefined ? 'other' : first.landedOn,
    speedAfterMph: first === undefined ? final.speed / METRES_PER_SECOND_PER_MPH : first.speedAfterMph,
    speedLossMph: first === undefined
      ? 0
      : first.takeoffMph - Math.abs(first.speedAfterMph),
    crashed,
    crashCause,
    blockedSteps,
    reversing: first === undefined ? final.reversing : first.reversing,
    spinArmed: spinFired,
    headingChange: first === undefined
      ? final.headingY - spawnHeading
      : first.headingChange,
    steps,
    landings: resolved,
    finalS: progressOf(fixture, final.position.x, final.position.z),
    finalT: lateralOf(fixture, final.position.x, final.position.z),
    finalMph: final.speed / METRES_PER_SECOND_PER_MPH,
    offCourse: final.offCourse,
    reachedEnd,
    recoveredAfterSteps,
  };
}

// ---------------------------------------------------------------------------
// The shipped constants a reader needs to interpret a row
// ---------------------------------------------------------------------------

/**
 * Every constant the tables below depend on, as label/value pairs.
 *
 * Printed at the head of the report because a measured window is only
 * meaningful next to the numbers that produced it: a table that says a 0.50 m
 * step-up needs a charge is a statement about `hopLaunchSpeed` and
 * `hopChargeHeightBonus`, and a reader who cannot see those cannot tell a
 * feature finding from a tuning change.
 */
export function benchConstants(): readonly { readonly name: string; readonly value: string }[] {
  return [
    { name: 'SIMULATION.hz', value: `${SIMULATION.hz} Hz (step ${STEP_SECONDS.toFixed(6)} s)` },
    { name: 'PHYSICS.gravity', value: `${PHYSICS.gravity} m/s²` },
    { name: 'EUC.hopLaunchSpeed', value: `${EUC.hopLaunchSpeed} m/s` },
    { name: 'EUC.hopCompressSeconds', value: `${EUC.hopCompressSeconds} s` },
    { name: 'EUC.hopChargeSeconds', value: `${EUC.hopChargeSeconds} s` },
    { name: 'EUC.hopChargeHeightBonus', value: `${EUC.hopChargeHeightBonus}` },
    { name: 'ideal flat apex', value: `${idealApex('none').toFixed(4)} m uncharged / ${idealApex('full').toFixed(4)} m charged` },
    { name: 'EUC.airDragFactor', value: `${EUC.airDragFactor}` },
    { name: 'EUC.spinYawRate', value: `${EUC.spinYawRate} rad/s` },
    { name: 'EUC.maxReverseSpeed', value: `${EUC.maxReverseSpeed} m/s (${(EUC.maxReverseSpeed / METRES_PER_SECOND_PER_MPH).toFixed(1)} mph)` },
    { name: 'TERRAIN.dropLaunchThreshold', value: `${TERRAIN.dropLaunchThreshold} m` },
    {
      name: 'step the wheel can mount',
      value: `${stepUpLimit().toFixed(3)} m`
        + ` (TERRAIN.stepUpPedalFactor ${TERRAIN.stepUpPedalFactor} × WHEEL.pedalHeight ${WHEEL.pedalHeight})`,
    },
    { name: 'INPUT.actionBufferSeconds', value: `${INPUT.actionBufferSeconds} s (${BUFFER_STEPS} steps)` },
    { name: 'EUC.landingImpactReference', value: `${EUC.landingImpactReference} m/s` },
    { name: 'EUC.landingMisalignReference', value: `${EUC.landingMisalignReference} rad` },
    { name: 'EUC.landingSurfaceWeight', value: `${EUC.landingSurfaceWeight}` },
    { name: 'EUC.landingRoughnessReference', value: `${EUC.landingRoughnessReference} m` },
    { name: 'landing tiers', value: `clean < ${EUC.landingHeavyScore} ≤ heavy < ${EUC.landingWobbleScore} ≤ wobble < ${EUC.landingCrashScore} ≤ crash` },
    { name: 'EUC.landingSpeedLossPerScore', value: `${EUC.landingSpeedLossPerScore} per point, capped at ${EUC.landingMaxSpeedLoss}` },
    { name: 'EUC.cutoutEnabled', value: `${EUC.cutoutEnabled} (shipped)` },
  ];
}

/** The surfaces a bench row can land on, and what each costs a landing score. */
export const BENCH_SURFACES: readonly SurfaceId[] = ['pavement', 'wood', 'dirt', 'roughPavement'];

export function surfaceLandingPoints(surface: SurfaceId): number {
  return EUC.landingSurfaceWeight
    * (SURFACES[surface].roughnessAmplitude / EUC.landingRoughnessReference);
}

/** The caveat lines §36.2a attaches to every number this bench prints. */
export const BENCH_CAVEATS: readonly string[] = [
  'These are controller/`PlanTerrainSampler` bench observations, not browser or owner'
    + ' acceptance, and not certified dimensions for an unbuilt obstacle (§36.2a).',
  '**65 mph is not a required approach window.** A feature\'s window is speed at the lip,'
    + ' not a nominal wheel top speed (§36.2a, §36.4).',
  'The `nominal65-cutout-off` rows are an isolated diagnostic with the max-speed cutout'
    + ' disabled. They cannot certify a playable line and no feature table uses them (§36.2a).',
  'A tier is `EucController.land`\'s verdict, read rather than re-judged: score ='
    + ' impact / 5 + misalignment / 0.80 + 0.30 × roughness / 0.040 (§36.2 item 4).',
];


// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

/**
 * One printed table, as plain data.
 *
 * Rows are strings because the tool is a *printer*: every decision about how
 * many places a distance is worth and what a missing value should say belongs
 * next to the measurement that produced it, not in a formatter that has to
 * guess. `trials` and `simulatedSteps` are what the report's final line adds
 * up, and they are simulated work — never wall time, which `AGENTS.md` does
 * not let an agent report as a frame figure and which would make a checked-in
 * table depend on the machine that ran it.
 */
export interface BenchTable {
  readonly id: string;
  readonly title: string;
  readonly geometry: readonly string[];
  readonly notes: readonly string[];
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly trials: number;
  readonly simulatedSteps: number;
}

/** The press that puts the hop's impulse on the last grounded step at the lip. */
export const ON_TIME_STEPS = Math.round(EUC.hopCompressSeconds / STEP_SECONDS);

function mphText(value: number): string {
  return value.toFixed(2);
}

function metres(value: number): string {
  return value.toFixed(3);
}

function seconds(value: number): string {
  return value.toFixed(3);
}

/** A measurement that only exists when the wheel actually flew and landed. */
function ifLanded(result: TrialResult, render: (result: TrialResult) => string): string {
  return result.landings.length === 0 ? '—' : render(result);
}

/** A running tally of what a table cost, so the report can add it up. */
class Tally {
  trials = 0;
  steps = 0;

  run(fixture: Fixture, wheel: BenchWheel, script: TrialScript): TrialResult {
    const result = runTrial(fixture, wheel, script);
    this.trials += 1;
    this.steps += result.steps;
    return result;
  }
}

const terminalCache = new Map<string, number>();

/**
 * The fastest the wheel actually gets on this fixture, mph.
 *
 * A trigger speed above it is not a slow row, it is a row that never happens:
 * the flat-pavement terminal *is* the nominal top speed, so a 65 mph trigger on
 * the 65 wheel is an asymptote, and on the shipped cutout the wheel falls off
 * before it arrives. §36.8 Phase 0 says to skip a trigger the wheel cannot
 * reach; this is how the bench knows which those are rather than asserting it.
 */
export function terminalMph(fixture: Fixture, wheel: BenchWheel): number {
  const key = `${fixture.plan.id}|${wheel}`;
  const found = terminalCache.get(key);
  if (found !== undefined) return found;

  const run = makeRun(fixture, wheel, 0);
  let best = 0;
  for (let step = 0; step < 5400; step += 1) {
    run.controller.step(STEP_SECONDS, actionsOf({ throttle: 1 }));
    const snapshot = run.controller.snapshot();
    if (snapshot.speed > best) best = snapshot.speed;
    if (snapshot.crashed) break;
  }
  const mph = best / METRES_PER_SECOND_PER_MPH;
  terminalCache.set(key, mph);
  return mph;
}

const T1_TRIGGERS = [20, 40, 50, 60];
const T1_CHARGES: readonly BenchCharge[] = ['none', 'full', 'half'];
const T1_SURFACES: readonly SurfaceId[] = ['pavement', 'wood', 'dirt'];

/**
 * T1 — the flat hop, §36.2a's own protocol turned into a fixture.
 *
 * "Flat pavement, standard sober controller, no steer, cutout enabled:
 * accelerate until the named trigger speed, then release throttle and press Hop
 * once; for charged trials, hold crouch throughout the run-up and flight. The
 * table reports the actual speed immediately before the first airborne step,
 * not the trigger speed. Distance runs from that last grounded position to
 * touchdown, including the first airborne tick."
 */
export function tableFlatHop(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const wheel of PLAYABLE_WHEELS) {
    for (const surface of T1_SURFACES) {
      const fixture = flatFixture(surface);
      const ceiling = terminalMph(fixture, wheel);
      for (const trigger of T1_TRIGGERS) {
        if (trigger >= ceiling) {
          rows.push([
            wheelLabel(wheel), surface, `${trigger}`, '—',
            `not reached (this fixture tops out at ${mphText(ceiling)} mph)`,
            '', '', '', '', '',
          ]);
          continue;
        }
        for (const charge of T1_CHARGES) {
          const result = tally.run(fixture, wheel, {
            targetMph: trigger,
            lipS: null,
            hop: 'atSpeed',
            charge,
            maxSteps: 2600,
          });
          rows.push([
            wheelLabel(wheel), surface, `${trigger}`, charge,
            mphText(result.takeoffMph),
            metres(result.flightMetres),
            seconds(result.flightSeconds),
            metres(result.apexMetres),
            result.landingTier,
            result.landingScore.toFixed(5),
          ]);
        }
      }
    }
  }

  return {
    id: 'T1',
    title: 'T1 — flat hop, by trigger speed, charge and surface',
    geometry: [
      'level corridor, half-width 6 m, no lip: the hop is the only launch',
      'takeoff is the speed on the LAST GROUNDED step, not the trigger',
      'distance runs from that position to touchdown, first airborne tick included',
    ],
    notes: [
      'Charge: `none` never crouches; `full` holds crouch through the run-up and the'
        + ' flight; `half` holds it for `EUC.hopChargeSeconds / 2` and releases at the press.',
      'Every row is the shipped cutout, enabled. A trigger at or above the fixture\'s own'
        + ' terminal is reported as not reached rather than approximated.',
    ],
    columns: ['wheel', 'surface', 'trigger mph', 'charge', 'takeoff mph', 'distance m',
      'time s', 'apex m', 'tier', 'score'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T1b — the isolated cutout-off diagnostic. Never a playable window. */
export function tableFlatHopDiagnostic(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const fixture = flatFixture('pavement', 1600);
  const wheel: BenchWheel = 'nominal65-cutout-off';
  const ceiling = terminalMph(fixture, wheel);

  for (const trigger of [60, 64, 65]) {
    if (trigger >= ceiling) {
      rows.push([`${trigger}`, '—',
        `not reached (full throttle tops out at ${mphText(ceiling)} mph — 65 mph IS the`
        + ' flat-pavement terminal, so it is an asymptote, not a speed)', '', '', '', '', '']);
      continue;
    }
    for (const charge of ['none', 'full'] as const) {
      const result = tally.run(fixture, wheel, {
        targetMph: trigger,
        lipS: null,
        hop: 'atSpeed',
        charge,
        maxSteps: 6000,
      });
      rows.push([
        `${trigger}`, charge,
        mphText(result.takeoffMph),
        metres(result.flightMetres),
        seconds(result.flightSeconds),
        metres(result.apexMetres),
        result.landingTier,
        result.landingScore.toFixed(5),
      ]);
    }
  }

  return {
    id: 'T1b',
    title: 'T1b — DIAGNOSTIC ONLY: nominal 65, max-speed cutout OFF',
    geometry: ['level pavement, 1600 m, so a full-throttle run-up has room to converge'],
    notes: [
      '**This table is not a playable window.** §36.2a: "A 65-mph ballistic row, if needed'
        + ' in Phase 0, is explicitly an isolated diagnostic with cutout disabled; it cannot'
        + ' certify a playable line. Keep normal validation at shipped tuning with cutout'
        + ' enabled."',
      'No feature table below uses this wheel.',
    ],
    columns: ['trigger mph', 'charge', 'takeoff mph', 'distance m', 'time s', 'apex m',
      'tier', 'score'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

const T2_DROPS = [0.30, 0.55, 0.80, 1.05, 1.20, 1.50];
const T2_SURFACES: readonly SurfaceId[] = ['wood', 'dirt', 'pavement', 'roughPavement'];
const T2_GRADES = [0, -0.10, -0.20];
const T2_SPEEDS = [8, 15, 25];

/**
 * T2 — drop only, no hop: §36.2a's drop bench with a landing surface and a
 * landing gradient swept across it.
 *
 * §36.2a measured four heights on two flat surfaces and observed that "each
 * reached case gave the same tier/score for the same height and surface below".
 * That is true of a *level* landing, where the normal is vertical and the score
 * has no horizontal term to read — and it stops being true the moment the
 * landing tilts, which is exactly why §36.2 item 4 says "a downhill landing
 * normal can reduce impact" and why the gradient is an axis here.
 */
export function tableDropOnly(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const surface of T2_SURFACES) {
    for (const grade of T2_GRADES) {
      for (const drop of T2_DROPS) {
        const fixture = dropFixture({ drop, landingSurface: surface, landingGrade: grade });
        for (const speed of T2_SPEEDS) {
          const result = tally.run(fixture, 'shipped65', {
            targetMph: speed,
            lipS: fixture.lipS,
            hop: 'none',
            charge: 'none',
            maxSteps: 2600,
          });
          rows.push([
            surface, grade.toFixed(2), metres(drop), `${speed}`,
            ifLanded(result, (r) => mphText(r.takeoffMph)),
            result.launched,
            ifLanded(result, (r) => seconds(r.flightSeconds)),
            ifLanded(result, (r) => metres(r.flightMetres)),
            ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
            result.landingTier,
            ifLanded(result, (r) => r.landingScore.toFixed(4)),
            ifLanded(result, (r) => r.landingImpact.toFixed(3)),
            ifLanded(result, (r) => mphText(r.speedLossMph)),
          ]);
        }
      }
    }
  }

  return {
    id: 'T2',
    title: 'T2 — drop only (no hop, no steer), by landing surface, landing grade and lip speed',
    geometry: [
      'a level deck ending over a landing corridor; the drop quoted is the deck top minus'
        + ' the landing surface AT THE LIP (§36.2 item 2)',
      '40 m of level deck, 60 m of landing at the stated linear gradient',
    ],
    notes: [
      'The approach is bang-bang to the stated speed, so the lip speed is controlled'
        + ' rather than observed — §36.4: "A feature\'s window is speed at the lip".',
      '`landed at` is the touchdown\'s distance past the lip.',
      'Shipped 65 only; the diagnostic 50 cross-check is T2c.',
    ],
    columns: ['landing', 'grade', 'drop m', 'lip mph target', 'lip mph', 'launch',
      'air s', 'air m', 'landed at m', 'tier', 'score', 'impact m/s', 'speed lost mph'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T2c — the same drops on `?mph=50`, to show the preset does not move a tier. */
export function tableDropPresetCheck(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const surface of ['wood', 'dirt'] as const) {
    for (const drop of T2_DROPS) {
      const fixture = dropFixture({ drop, landingSurface: surface, landingGrade: 0 });
      for (const speed of [8, 15, 25]) {
        const shipped = tally.run(fixture, 'shipped65', {
          targetMph: speed, lipS: fixture.lipS, hop: 'none', charge: 'none', maxSteps: 2600,
        });
        const fifty = tally.run(fixture, 'diagnostic50', {
          targetMph: speed, lipS: fixture.lipS, hop: 'none', charge: 'none', maxSteps: 2600,
        });
        rows.push([
          surface, metres(drop), `${speed}`,
          `${mphText(shipped.takeoffMph)} / ${shipped.landingTier} / ${shipped.landingScore.toFixed(4)}`,
          `${mphText(fifty.takeoffMph)} / ${fifty.landingTier} / ${fifty.landingScore.toFixed(4)}`,
          shipped.landingTier === fifty.landingTier ? 'same tier' : 'DIFFERENT',
        ]);
      }
    }
  }

  return {
    id: 'T2c',
    title: 'T2c — drop only on both presets (§36.8 Phase 0: "both wheel presets")',
    geometry: ['level landing, flat wood and flat dirt, the six swept drops'],
    notes: [
      'The two presets have the same vertical hop and different drag (§36.2a). With the lip'
        + ' speed controlled, a drop\'s landing is a question about the fall and the surface,'
        + ' so the presets are expected to agree; the column exists to say so rather than assume it.',
    ],
    columns: ['landing', 'drop m', 'lip mph target', 'shipped 65: lip / tier / score',
      'diagnostic 50: lip / tier / score', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/**
 * T2b — a hop taken at the lip, and the early/late interval around it.
 *
 * "On-time" is `ON_TIME_STEPS` before the lip, which puts the hop's impulse on
 * the last grounded step: the compression is 0.09 s and a press any later is
 * spent in the air, where `stepHop` cancels it outright. That is not a bench
 * convention, it is the mechanic — and the late rows below are what it looks
 * like from the player's side.
 */
export function tableDropWithHop(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const surface of ['wood', 'dirt'] as const) {
    for (const grade of [0, -0.20]) {
      for (const drop of T2_DROPS) {
        const fixture = dropFixture({ drop, landingSurface: surface, landingGrade: grade });
        for (const charge of ['none', 'full'] as const) {
          const result = tally.run(fixture, 'shipped65', {
            targetMph: 15,
            lipS: fixture.lipS,
            hop: { stepsFromLip: ON_TIME_STEPS },
            charge,
            maxSteps: 2600,
          });
          rows.push([
            surface, grade.toFixed(2), metres(drop), 'on-time', charge,
            ifLanded(result, (r) => mphText(r.takeoffMph)), result.launched, result.hopFired,
            ifLanded(result, (r) => seconds(r.flightSeconds)),
            ifLanded(result, (r) => metres(r.flightMetres)),
            ifLanded(result, (r) => metres(r.apexMetres)),
            ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
            result.landingTier, ifLanded(result, (r) => r.landingScore.toFixed(4)),
          ]);
        }
      }
    }
  }

  for (const offset of [10, 5, 0, -5, -10]) {
    for (const drop of T2_DROPS) {
      const fixture = dropFixture({ drop, landingSurface: 'wood', landingGrade: 0 });
      const result = tally.run(fixture, 'shipped65', {
        targetMph: 15,
        lipS: fixture.lipS,
        hop: { stepsFromLip: ON_TIME_STEPS + offset },
        charge: 'none',
        maxSteps: 2600,
      });
      rows.push([
        'wood', '0.00', metres(drop),
        offset === 0 ? 'on-time' : `${offset > 0 ? '+' : ''}${offset} steps`,
        'none',
        ifLanded(result, (r) => mphText(r.takeoffMph)), result.launched, result.hopFired,
        ifLanded(result, (r) => seconds(r.flightSeconds)),
        ifLanded(result, (r) => metres(r.flightMetres)),
        ifLanded(result, (r) => metres(r.apexMetres)),
        ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
        result.landingTier, ifLanded(result, (r) => r.landingScore.toFixed(4)),
      ]);
    }
  }

  return {
    id: 'T2b',
    title: 'T2b — the same drops with a hop at the lip, and the early/late interval',
    geometry: [
      `on-time = pressed ${ON_TIME_STEPS} steps before the lip, so the impulse fires on the`
        + ' last grounded step (compression is 0.09 s)',
      'timing column: + is earlier than on-time, − is later',
    ],
    notes: [
      'All rows are 15 mph at the lip on the shipped 65 wheel.',
      'A press made after the wheel has left the deck is cancelled: `stepHop` clears the'
        + ' compression the moment it is airborne, and `canAcceptSpin` is false because a'
        + ' drop off a level deck leaves with no upward rate. The `launch` and `hop press`'
        + ' columns say which happened.',
    ],
    columns: ['landing', 'grade', 'drop m', 'timing', 'charge', 'lip mph', 'launch',
      'hop press', 'air s', 'air m', 'apex m', 'landed at m', 'tier', 'score'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

const T3_GAPS = [2.5, 3, 3.5, 4, 5];
const T3_SPEEDS = [10, 12.5, 15, 17.5, 20, 25];
export const GAP_STEP_DOWN = 0.20;

interface GapSample {
  readonly gap: number;
  readonly charge: BenchCharge;
  readonly speed: number;
  readonly passed: boolean;
  readonly landedOn: LandedOn;
  readonly tier: string;
}

const gapSamples: GapSample[] = [];

/**
 * T3 — the straight gap, hopped.
 *
 * §36.4's straight gap: "Clean across the accepted timing window ... Start
 * shorter than the flat-flight distances above", with "broad lower catch ground
 * [continuing] to the same merge" as the recovery. A pass is a touchdown on the
 * landing deck that is not a crash; anything else fell into the gap, which is
 * the readable consequence rather than a reset.
 */
export function tableGap(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  gapSamples.length = 0;
  let geometry: readonly string[] = [];

  for (const gap of T3_GAPS) {
    const fixture = gapFixture({ gap, stepDown: GAP_STEP_DOWN });
    if (gap === T3_GAPS[0]) geometry = fixture.geometry;
    for (const charge of ['none', 'full'] as const) {
      for (const speed of T3_SPEEDS) {
        const result = tally.run(fixture, 'shipped65', {
          targetMph: speed,
          lipS: fixture.lipS,
          hop: { stepsFromLip: ON_TIME_STEPS },
          charge,
          maxSteps: 2600,
        });
        const passed = result.landedOn === 'deck' && !result.crashed;
        gapSamples.push({ gap, charge, speed, passed, landedOn: result.landedOn, tier: result.landingTier });
        rows.push([
          metres(gap), charge, `${speed}`, 'on-time',
          ifLanded(result, (r) => mphText(r.takeoffMph)), result.launched, result.hopFired,
          ifLanded(result, (r) => metres(r.flightMetres)),
          ifLanded(result, (r) => seconds(r.flightSeconds)),
          ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
          result.landings.length === 0 ? '—' : result.landedOn, result.landingTier,
          ifLanded(result, (r) => mphText(r.speedLossMph)),
          passed ? 'PASS' : 'fail',
        ]);
      }
    }
    for (const offset of [6, -6]) {
      const result = tally.run(fixture, 'shipped65', {
        targetMph: 15,
        lipS: fixture.lipS,
        hop: { stepsFromLip: ON_TIME_STEPS + offset },
        charge: 'none',
        maxSteps: 2600,
      });
      rows.push([
        metres(gap), 'none', '15', `${offset > 0 ? '+' : ''}${offset} steps`,
        ifLanded(result, (r) => mphText(r.takeoffMph)), result.launched, result.hopFired,
        ifLanded(result, (r) => metres(r.flightMetres)),
        ifLanded(result, (r) => seconds(r.flightSeconds)),
        ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
        result.landings.length === 0 ? '—' : result.landedOn, result.landingTier,
        ifLanded(result, (r) => mphText(r.speedLossMph)),
        result.landedOn === 'deck' && !result.crashed ? 'PASS' : 'fail',
      ]);
    }
  }

  return {
    id: 'T3',
    title: 'T3 — straight gap between two decks, over rideable catch ground',
    geometry,
    notes: [
      `Every gap uses the same deck lift (0.50 m), step down (${GAP_STEP_DOWN} m), 12 m landing`
        + ' deck and −0.04 catch corridor; only the opening changes.',
      'A pass is a touchdown on the landing deck with no crash. A fail lands on the catch'
        + ' ground in the gap, which is the recovery line, not a reset.',
    ],
    columns: ['gap m', 'charge', 'lip mph target', 'timing', 'lip mph', 'launch', 'hop press',
      'air m', 'air s', 'landed at m', 'landed on', 'tier', 'speed lost mph', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T3b — the passing speed interval per gap, every interior sample listed. */
export function tableGapIntervals(): BenchTable {
  const rows: string[][] = [];
  for (const gap of T3_GAPS) {
    for (const charge of ['none', 'full'] as const) {
      const samples = gapSamples.filter((s) => s.gap === gap && s.charge === charge);
      const passing = samples.filter((s) => s.passed).map((s) => s.speed);
      rows.push([
        metres(gap), charge,
        samples.map((s) => `${s.speed}${s.passed ? '✓' : '✗'}`).join(' '),
        passing.length === 0 ? 'none' : `${Math.min(...passing)} mph`,
        passing.length === 0 ? 'none' : `${Math.max(...passing)} mph`,
        passing.length === 0
          ? 'no passing sample in 10–25 mph'
          : `${passing.length} of ${samples.length} samples`,
      ]);
    }
  }
  return {
    id: 'T3b',
    title: 'T3b — passing speed intervals, with every interior sample',
    geometry: [],
    notes: [
      '§36.4: "Measure an interval with interior samples, not two isolated successful speeds.'
        + ' Publish passing and failing bounds, not just a highlight." The sample column is'
        + ' every speed tried, in order, ✓ passed / ✗ fell into the gap.',
      'Bounds are the lowest and highest PASSING samples on this 10–25 mph sweep. A bound'
        + ' equal to an end of the sweep is a bound of the sweep, not of the feature.',
    ],
    columns: ['gap m', 'charge', 'samples (mph)', 'lowest passing', 'highest passing', 'count'],
    rows,
    trials: 0,
    simulatedSteps: 0,
  };
}

const T4_RISES = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65];
const T4_SPEEDS = [8, 12, 16, 20];
const T4_CHARGES: readonly BenchCharge[] = ['none', 'half', 'full'];

/**
 * T4 — the charged step-up.
 *
 * §36.4: "Charged clears with margin; uncharged is refused at the face. Sampled
 * flat peaks are 0.446/0.627 m, but body clearance and the approach consume
 * part of the difference." The press is placed so the hop's apex arrives at the
 * face, which is a time and therefore the same step count at every speed.
 */
export function tableStepUp(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  let geometry: readonly string[] = [];

  for (const rise of T4_RISES) {
    const fixture = stepUpFixture({ rise });
    if (rise === T4_RISES[0]) geometry = fixture.geometry;
    for (const speed of T4_SPEEDS) {
      for (const charge of T4_CHARGES) {
        const lead = apexStepsBeforeLip(charge);
        const result = tally.run(fixture, 'shipped65', {
          targetMph: speed,
          lipS: fixture.lipS,
          hop: { stepsFromLip: lead },
          charge,
          maxSteps: 2600,
        });
        const mounted = result.landedOn === 'deck';
        rows.push([
          metres(rise), `${speed}`, charge, `${lead}`,
          ifLanded(result, (r) => mphText(r.takeoffMph)), result.hopFired,
          ifLanded(result, (r) => metres(r.apexMetres)),
          mounted ? 'MOUNTED' : result.blockedSteps > 0 ? 'bonk' : 'no mount',
          `${result.blockedSteps}`,
          result.landingTier,
          ifLanded(result, (r) => mphText(r.speedLossMph)),
          result.crashed ? `crash: ${result.crashCause}` : '—',
        ]);
      }
    }
  }

  return {
    id: 'T4',
    title: 'T4 — charged step-up: mount, or bonk at the face',
    geometry,
    notes: [
      `Press lead is \`apexStepsBeforeLip\`: ${apexStepsBeforeLip('none')} steps uncharged,`
        + ` ${apexStepsBeforeLip('half')} half, ${apexStepsBeforeLip('full')} full — the`
        + ' compression plus the time gravity takes to spend the impulse, so the apex arrives'
        + ' at the face whatever the approach speed.',
      'MOUNTED means the first touchdown was on the shelf. `blocked` counts the steps the'
        + ' controller refused part of a move into the face, which is the bonk signature.',
      `The ideal flat apexes are ${idealApex('none').toFixed(3)} m uncharged,`
        + ` ${idealApex('half').toFixed(3)} m half and ${idealApex('full').toFixed(3)} m full;`
        + ' the sampled peaks at 120 Hz are lower, which is what decides the top rows.',
    ],
    columns: ['rise m', 'lip mph target', 'charge', 'press lead steps', 'lip mph', 'hop press',
      'apex m', 'result', 'blocked steps', 'tier', 'speed lost mph', 'crash'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

const T5_LIPS = [0, 0.06, 0.10, 0.15];
const T5_GRADES = [-0.12, -0.18, -0.24];
const T5_SPEEDS = [8, 15, 25, 35];
const T5_SMOOTH_SPEEDS = [8, 15, 25, 35, 45, 58];

/**
 * T5 — the lip and the crest, and the bypass that must never launch.
 *
 * §36.2 item 3, which is the capability §36.8 Phase 0 requires be proved rather
 * than assumed: "The controller leaves ground when the sampled fall exceeds the
 * previous slope's prediction by `dropLaunchThreshold` ... Ordinary smooth
 * hills remain grounded." The launch primitive is a FACE. The smooth-side rows
 * are the same hill with the lip block deleted, at every speed up to 58 mph.
 */
export function tableLip(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  let geometry: readonly string[] = [];

  for (const lipHeight of T5_LIPS) {
    for (const grade of T5_GRADES) {
      for (const speed of T5_SPEEDS) {
        const fixture = lipFixture({ lipHeight, landingGrade: grade, runup: runupFor(speed) });
        if (lipHeight === T5_LIPS[0] && grade === T5_GRADES[0] && speed === T5_SPEEDS[0]) {
          geometry = fixture.geometry;
        }
        for (const hop of ['none', 'on-time'] as const) {
          const result = tally.run(fixture, 'shipped65', {
            targetMph: speed,
            lipS: fixture.lipS,
            hop: hop === 'none' ? 'none' : { stepsFromLip: ON_TIME_STEPS },
            charge: 'none',
            maxSteps: 3400,
          });
          rows.push([
            metres(lipHeight), metres(fixture.dropAtLip), grade.toFixed(2), `${speed}`, hop,
            ifLanded(result, (r) => mphText(r.takeoffMph)),
            result.launched,
            ifLanded(result, (r) => seconds(r.flightSeconds)),
            ifLanded(result, (r) => metres(r.flightMetres)),
            ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
            result.landingTier, ifLanded(result, (r) => r.landingScore.toFixed(4)),
            metres(fixture.stepUpAtStart),
            `${result.blockedSteps}`,
          ]);
        }
      }
    }
  }

  return {
    id: 'T5',
    title: 'T5 — lip and crest: does an authored face launch, and how far',
    geometry,
    notes: [
      'The `lip m` column is the height asked for; `face m` is `lip()`\'s own `dropAtLip`,'
        + ' the fall the wheel actually leaves. `TERRAIN.dropLaunchThreshold` is'
        + ` ${TERRAIN.dropLaunchThreshold} m, so a face below it cannot launch by itself.`,
      '**`step up m` is the kerb the wheel mounts to get ONTO the lip block, and past'
        + ` ${stepUpLimit().toFixed(3)} m — TERRAIN.stepUpPedalFactor × WHEEL.pedalHeight — the wheel`
        + ' simply cannot.** A lip has two faces and only one of them is the jump; the'
        + ' `blocked steps` column is the rider being refused at the other one. It is why the'
        + ' 0.15 m rows below never launch: with a 1 m lead on this eased rise the kerb is'
        + ' 0.256 m and the feature is unrideable as authored, not merely hard.',
      'A launch of `none` on a 0 m face is the fold answer: a gradient change is not a face,'
        + ' and the shortfall per step is `stepLength × foldAngle`, which grows with speed.',
      '**The entry kerb is also a speed tax, and it is the reason `lip mph` falls short of the'
        + ' target.** The same hill with no block holds its target exactly (T5b), so the'
        + ' missing speed is spent mounting the lip, and it scales with the kerb: about 2.3 mph'
        + ' lost at 25 mph over a 0.106 m kerb and about 4 mph over 0.166 m. A lip is not free'
        + ' to arrive at, and the approach a sign has to allow for is the one in the `lip mph`'
        + ' column, not the one in the target.',
    ],
    columns: ['lip m', 'face m', 'landing grade', 'lip mph target', 'hop', 'lip mph', 'launch',
      'air s', 'air m', 'landed at m', 'tier', 'score', 'step up m', 'blocked steps'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T5b — the bypass half: the same hill with no lip block. */
export function tableSmoothSide(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  let geometry: readonly string[] = [];

  for (const grade of T5_GRADES) {
    for (const speed of T5_SMOOTH_SPEEDS) {
      const fixture = lipFixture({
        lipHeight: 0, landingGrade: grade, smoothSide: true, runup: runupFor(speed),
      });
      if (grade === T5_GRADES[0] && speed === T5_SMOOTH_SPEEDS[0]) geometry = fixture.geometry;
      const result = tally.run(fixture, 'shipped65', {
        targetMph: speed,
        lipS: fixture.lipS,
        hop: 'none',
        charge: 'none',
        maxSteps: 3400,
      });
      const fold = Math.abs(grade) * (speed * METRES_PER_SECOND_PER_MPH) * STEP_SECONDS;
      rows.push([
        grade.toFixed(2), `${speed}`,
        mphText(result.finalMph),
        result.launched,
        result.landings.length === 0
          ? `never left the ground${result.reachedEnd ? ', rode to the corridor end' : ''}`
          : `${result.landings.length} touchdown(s)`,
        metres(fold),
        fold >= TERRAIN.dropLaunchThreshold ? 'ABOVE the threshold' : 'below the threshold',
      ]);
    }
  }

  return {
    id: 'T5b',
    title: 'T5b — the smooth bypass: the same crest with NO lip block',
    geometry,
    notes: [
      '§36.2 item 3: "A rounded hill does not acquire airborne cresting just because its'
        + ' drawing looks convex." Every row must read `none`.',
      'The last two columns are an UPPER BOUND, not the verdict: if a corridor folded from'
        + ' level to the landing grade inside one step the unpredicted fall would be'
        + ` stepLength × foldAngle against a ${TERRAIN.dropLaunchThreshold} m threshold. The`
        + ' measured answer is `none` even on the row where that bound is exceeded, because'
        + ' the heightfield samples at 1 m and the fold arrives spread over a cell rather'
        + ' than inside one 8 ms step. A smooth crest is not a launch at any speed the wheel'
        + ' can reach — which is exactly §36.2 item 3, and is the reason a lip has to be a block.',
    ],
    columns: ['landing grade', 'lip mph target', 'speed at the end mph', 'launch', 'touchdowns',
      'fold fall per step m', 'versus threshold'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T6 — the down staircase, every touchdown recorded. */
export function tableStairs(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const fixture = stairsFixture();

  for (const speed of [5, 10, 15, 20, 25]) {
    const result = tally.run(fixture, 'shipped65', {
      targetMph: speed,
      lipS: fixture.lipS,
      hop: 'none',
      charge: 'none',
      // Run to the fixture's own end rather than half a second past the first
      // tread: at 5 mph the treads are more than a second apart and the default
      // coast would report a staircase as a single drop.
      coastSteps: 4000,
      holdThrottle: true,
      maxSteps: 3400,
    });
    rows.push([
      `${speed}`,
      mphText(result.takeoffMph),
      `${result.landings.length}`,
      result.landings.map((landing) => landing.tier).join(' → ') || 'none',
      result.landings.map((landing) => landing.score.toFixed(3)).join(' / ') || '—',
      result.landings.map((landing) => metres(landing.s - (fixture.lipS ?? 0))).join(' / ') || '—',
      result.crashed ? `CRASH: ${result.crashCause}` : 'no',
      mphText(result.finalMph),
    ]);
  }

  return {
    id: 'T6',
    title: 'T6 — down staircase, ridden tread by tread',
    geometry: fixture.geometry,
    notes: [
      '§36.4: "Default line should remain clean; compare ridden tread-by-tread and'
        + ' skipped-tread contacts." The touchdown count says which happened: three'
        + ' touchdowns is tread-by-tread, fewer means treads were skipped in one flight.',
      'The tiers column is every touchdown in order, not just the first.',
      'These rows hold the throttle to the target rather than coasting off the first tread:'
        + ' a staircase is a rhythm, and a coasting wheel stops between two treads at walking'
        + ' pace and reports three drops as one.',
    ],
    columns: ['approach mph target', 'mph at the top', 'touchdowns', 'tiers', 'scores',
      'landed at m past the top', 'crashed', 'speed at the end mph'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

const T7_WIDTHS = [0.8, 1.0, 1.2];
const T7_LIFTS = [0.35, 0.55];

/**
 * T7 — the skinny, ridden straight, ridden off the side, and restarted from
 * a standstill on the plank.
 *
 * §36.4: "5–15 mph, including steer corrections and a stopped restart. Upper
 * line has no forced hop; off either side, a 0.30–0.55 m catch drop should be
 * clean when aligned."
 */
export function tableSkinny(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  let geometry: readonly string[] = [];

  for (const width of T7_WIDTHS) {
    for (const lift of T7_LIFTS) {
      const fixture = skinnyFixture({ width, lift });
      if (width === T7_WIDTHS[0] && lift === T7_LIFTS[0]) geometry = fixture.geometry;

      for (const speed of [5, 10, 15]) {
        const result = tally.run(fixture, 'shipped65', {
          targetMph: speed,
          lipS: fixture.lipS,
          hop: 'none',
          charge: 'none',
          maxSteps: 3200,
        });
        const stayedOn = result.landings.length === 0
          || result.landings[0].s >= fixture.plankTo - 0.25;
        rows.push([
          metres(width), metres(lift), `${speed}`, 'centred',
          result.landings.length === 0 ? 'never left the plank' : metres(result.landings[0].s),
          stayedOn ? 'STAYED ON' : 'fell off the side',
          result.landingTier, result.landingScore === 0 ? '—' : result.landingScore.toFixed(4),
          result.crashed ? `crash: ${result.crashCause}` : 'no',
        ]);
      }

      for (const offset of [0.6, -0.6]) {
        const result = tally.run(fixture, 'shipped65', {
          targetMph: 10,
          lipS: fixture.lipS,
          hop: 'none',
          charge: 'none',
          lateralOffset: offset,
          maxSteps: 3200,
        });
        const stayedOn = result.landings.length === 0
          || result.landings[0].s >= fixture.plankTo - 0.25;
        rows.push([
          metres(width), metres(lift), '10', `${offset > 0 ? '+' : ''}${offset} m off centre`,
          result.landings.length === 0 ? 'never left the plank' : metres(result.landings[0].s),
          stayedOn ? 'STAYED ON' : 'fell off the side',
          result.landingTier, result.landingScore === 0 ? '—' : result.landingScore.toFixed(4),
          result.crashed ? `crash: ${result.crashCause}` : 'no',
        ]);
      }

      const restart = skinnyFixture({ width, lift, spawnOnPlank: true });
      const result = tally.run(restart, 'shipped65', {
        targetMph: 15,
        lipS: null,
        hop: 'none',
        charge: 'none',
        maxSteps: 1600,
      });
      rows.push([
        metres(width), metres(lift), 'from rest', 'on the plank',
        result.landings.length === 0 ? 'never left the plank' : metres(result.landings[0].s),
        result.landings.length === 0
          ? 'still rolling at the cap'
          : result.landings[0].s >= restart.plankTo - 0.25 ? 'RODE IT OFF THE END' : 'fell off the side',
        result.landingTier, result.landingScore === 0 ? '—' : result.landingScore.toFixed(4),
        result.crashed ? `crash: ${result.crashCause}` : 'no',
      ]);
    }
  }

  return {
    id: 'T7',
    title: 'T7 — the skinny: centred, off centre, and restarted from a standstill',
    geometry,
    notes: [
      'The run-up is a 6 m-wide deck flush with the plank, so the only thing that narrows'
        + ' is the plank itself and a rider never has to mount a face to get on it.',
      'STAYED ON means the first touchdown was at or past the plank\'s far end — the rider'
        + ' rode the plank and took its exit drop rather than falling off the side.',
      'The catch ground beside the plank is the corridor, one continuous rideable surface;'
        + ' §36.3 forbids a recovery route that passes beneath an upper deck and there is none here.',
    ],
    columns: ['width m', 'lift m', 'mph target', 'line', 'first touchdown at m', 'verdict',
      'tier', 'score', 'crashed'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T8 — the signed spin pad, both directions. */
export function tableSpinPad(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const fixture = spinPadFixture();

  for (const speed of [8, 12, 15]) {
    for (const direction of ['left', 'right'] as const) {
      const result = tally.run(fixture, 'shipped65', {
        targetMph: speed,
        lipS: fixture.lipS,
        hop: { stepsFromLip: ON_TIME_STEPS },
        charge: 'none',
        spinTap: direction,
        maxSteps: 2600,
      });
      rows.push([
        `${speed}`, direction,
        mphText(result.takeoffMph),
        result.spinArmed ? 'armed' : 'NOT ARMED',
        result.headingChange.toFixed(4),
        seconds(result.flightSeconds),
        result.landingMisalignment.toFixed(4),
        result.landingTier, result.landingScore.toFixed(4),
        result.reversing ? 'FAKIE' : 'forward',
        mphText(result.speedAfterMph),
        mphText(result.speedLossMph),
      ]);
    }
  }

  return {
    id: 'T8',
    title: 'T8 — spin pad: a landed 180, both directions',
    geometry: fixture.geometry,
    notes: [
      'The launch is a hop at the lip, not the drop: a drop off a LEVEL deck leaves with no'
        + ' upward rate, and `canAcceptSpin` is the rising half of the flight only. So a spin'
        + ' pad needs a hop or a rising launch — a flat ledge alone cannot carry the trick.',
      '§36.2 item 5: `snapshot().spins` increments on ARMING, not on completion. The columns'
        + ' that say whether the 180 landed are the misalignment (distance from π, so a clean'
        + ' 180 reads near zero) and `fakie`.',
      `A fakie landing meets the reverse ceiling on the next step:`
        + ` EUC.maxReverseSpeed is ${EUC.maxReverseSpeed} m/s`
        + ` (${(EUC.maxReverseSpeed / METRES_PER_SECOND_PER_MPH).toFixed(1)} mph).`,
    ],
    columns: ['lip mph target', 'tap', 'lip mph', 'spin', 'heading change rad', 'air s',
      'misalignment rad', 'tier', 'score', 'exit', 'speed after mph', 'speed lost mph'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** T9 — the kicker gap: a real ramp, hop and no-hop, three landing slopes. */
export function tableKicker(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  let geometry: readonly string[] = [];

  for (const lead of [1, 0]) {
    for (const grade of [-0.15, -0.20, -0.25]) {
      for (const speed of [20, 25, 30, 35, 40]) {
        const fixture = kickerFixture(grade, runupFor(speed), lead);
        if (lead === 1 && grade === -0.15 && speed === 20) geometry = fixture.geometry;
        for (const hop of ['none', 'on-time', 'on-time + full charge'] as const) {
          const result = tally.run(fixture, 'shipped65', {
            targetMph: speed,
            lipS: fixture.lipS,
            hop: hop === 'none' ? 'none' : { stepsFromLip: ON_TIME_STEPS },
            charge: hop === 'on-time + full charge' ? 'full' : 'none',
            maxSteps: 3400,
          });
          rows.push([
            `${lead}`, metres(fixture.stepUpAtStart), grade.toFixed(2), `${speed}`, hop,
            ifLanded(result, (r) => mphText(r.takeoffMph)), result.launched,
            ifLanded(result, (r) => seconds(r.flightSeconds)),
            ifLanded(result, (r) => metres(r.flightMetres)),
            ifLanded(result, (r) => metres(r.touchdownS - (fixture.lipS ?? 0))),
            ifLanded(result, (r) => metres(r.apexMetres)),
            result.landingTier, ifLanded(result, (r) => r.landingScore.toFixed(4)),
            ifLanded(result, (r) => mphText(r.speedAfterMph)),
            result.crashed ? `crash: ${result.crashCause}` : '—',
          ]);
        }
      }
    }
  }

  return {
    id: 'T9',
    title: 'T9 — kicker gap: 1.0 m rise, 0.12 m lip, three landing slopes',
    geometry,
    notes: [
      '§36.4 asks the kicker to "isolate ramp contribution, actual lip height, hop/no-hop and'
        + ' landing slope". The no-hop rows are the ramp and the lip alone; the two hop rows'
        + ' add the impulse on top of them at the same lip speed.',
      '`landed at m` is the touchdown\'s distance past the lip — where on the landing face it'
        + ' arrives, which is what decides how much face is left to run out on.',
      `**The lead is the finding.** With the brief\'s 1 m lead the kerb onto the lip block is`
        + ` 0.238 m — past the ${stepUpLimit().toFixed(3)} m the wheel can mount — so every`
        + ' no-hop approach is REFUSED at the entry and crashes into it at 20 mph and up. That'
        + ' is a readable consequence (§36.4 wants one) and it is also a design instruction:'
        + ' an authored lip needs a flush or ramped entry. The `lead 0` rows are the same'
        + ' kicker with its top starting at the crest, and they are the ones that isolate the'
        + ' ramp\'s own contribution with no hop.',
    ],
    columns: ['lead m', 'entry kerb m', 'landing grade', 'lip mph target', 'hop', 'lip mph',
      'launch', 'air s', 'air m', 'landed at m', 'apex m', 'tier', 'score', 'speed after mph',
      'crash'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** One T10 assertion, as data, so the tool and the test read the same answer. */
export interface LapCheck {
  readonly name: string;
  readonly expected: string;
  readonly observed: string;
  readonly passed: boolean;
}

/**
 * T10 — the smallest alternate-line envelope/progress case (§36.8 Phase 0).
 *
 * §36.2 item 7 is the limit this is measuring against, not a defect to design
 * around: "`LapEnvelope.contains` and `progressAt` are horizontal; branches are
 * not automatically included and nearest progress does not distinguish stacked
 * paths." So the questions are (i) does one sampled main-chain ring with local
 * widths already cover a deck line AND its bypass, (ii) does progress stay
 * monotonic along both, and (iii) can two adjacent legs steal each other's
 * projection — which is §36.3's "adjacent switchbacks cannot steal each other's
 * projection" made into an experiment rather than a hope.
 */
export function lapChecks(): readonly LapCheck[] {
  const fixture = lapFixture();
  const plan = fixture.plan;
  const checks: LapCheck[] = [];
  const margin = TRACK_DAY.offCourseMarginMetres;
  const reach = LAP_HALF_WIDTH + margin;

  const add = (name: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ name, expected, observed, passed });
  };

  // (a) the lap exists and both referees will arm on it.
  const lap = plan.lap ?? null;
  add(
    'plan.lap emitted by buildLevelPlan',
    'a closed ring with ≥ 2 samples',
    lap === null ? 'null — the chain did not close' : `${lap.points.length} points, ${lap.length.toFixed(2)} m`,
    lap !== null,
  );
  const trackDay = new TrackDayRun(plan.id, plan.checkpoints ?? [], lap);
  add('TrackDayRun.available', 'true', `${trackDay.available}`, trackDay.available);
  const race = new RaceRun(plan.checkpoints ?? [], lap);
  add('RaceRun.available', 'true', `${race.available}`, race.available);

  if (lap === null) return checks;
  const envelope = new LapEnvelope(lap);

  // (b) containment, including the deck line and the bypass half.
  const corners = fixture.deckCorners;
  const cornersIn = corners.every((corner) => envelope.contains(corner.x, corner.z));
  add(
    'contains: all four deck-top corners',
    'true',
    corners.map((corner) => `(${corner.x}, ${corner.z})=${envelope.contains(corner.x, corner.z)}`).join(' '),
    cornersIn,
  );
  const besideDeck = envelope.contains(-4, LAP_DECK.from + LAP_DECK.length / 2);
  add('contains: catch ground beside the deck at t = −4', 'true', `${besideDeck}`, besideDeck);
  const bypass = [10, 20, 30, 40, 50].every((z) => envelope.contains(-4, z));
  add('contains: the bypass half (t = −4) the length of the straight', 'true', `${bypass}`, bypass);
  const infield = envelope.contains(LAP_RADIUS, LAP_STRAIGHT);
  add(
    `contains: hairpin infield centre (${LAP_RADIUS}, ${LAP_STRAIGHT})`,
    `true — R=${LAP_RADIUS} is inside the reach of ${reach} m`,
    `${infield}`,
    infield,
  );
  const outside = envelope.contains(-(reach + 0.1), 30);
  add(
    `contains: a point ${(reach + 0.1).toFixed(1)} m off the straight`,
    'false',
    `${outside}`,
    !outside,
  );

  // (c) progress along both lines.
  const deckLine: number[] = [];
  const bypassLine: number[] = [];
  for (let z = 5; z <= 55; z += 1) {
    deckLine.push(envelope.progressAt(LAP_DECK.t, z));
    bypassLine.push(envelope.progressAt(-4, z));
  }
  const monotonic = (values: readonly number[]): boolean =>
    values.every((value, index) => index === 0 || value > values[index - 1]);
  add(
    'progressAt strictly increasing along the deck line (t = +4), 1 m samples',
    'strictly increasing',
    `${deckLine[0].toFixed(2)} → ${deckLine[deckLine.length - 1].toFixed(2)} m over ${deckLine.length} samples`,
    monotonic(deckLine),
  );
  add(
    'progressAt strictly increasing along the bypass (t = −4), 1 m samples',
    'strictly increasing',
    `${bypassLine[0].toFixed(2)} → ${bypassLine[bypassLine.length - 1].toFixed(2)} m`,
    monotonic(bypassLine),
  );
  let worst = 0;
  for (let index = 0; index < deckLine.length; index += 1) {
    worst = Math.max(worst, Math.abs(deckLine[index] - bypassLine[index]));
  }
  add(
    'the two lines agree on progress at the same s',
    '< 1 m apart',
    `worst disagreement ${worst.toFixed(4)} m`,
    worst < 1,
  );

  // (d) two adjacent legs, and the separation at which they stop stealing.
  const probeX = LAP_HALF_WIDTH + 2.4;
  const wide = new LapEnvelope(parallelLegs(2 * LAP_HALF_WIDTH + 2 * margin));
  const tight = new LapEnvelope(parallelLegs(19));
  const wideProgress = wide.progressAt(probeX, 60);
  const tightProgress = tight.progressAt(probeX, 60);
  add(
    `adjacent legs ${(2 * LAP_HALF_WIDTH + 2 * margin).toFixed(0)} m apart:`
      + ` a point ${probeX.toFixed(1)} m out projects onto leg A`,
    'progress in leg A\'s range [0, 120] m',
    `${wideProgress.toFixed(2)} m`,
    wideProgress >= 0 && wideProgress <= 120,
  );
  add(
    'control: the SAME point with the legs 19 m apart projects onto leg B',
    'progress in leg B\'s range [139, 259] m',
    `${tightProgress.toFixed(2)} m`,
    tightProgress > 120,
  );

  return checks;
}

/** T10 as a printed checklist. */
export function tableLap(): BenchTable {
  const fixture = lapFixture();
  const checks = lapChecks();
  return {
    id: 'T10',
    title: 'T10 — the alternate-line envelope and progress case',
    geometry: fixture.geometry,
    notes: [
      'No trials are ridden here: the questions are about the lap representation, which is'
        + ' plain data and answers without a controller.',
      'The deck and the bypass are two lines on ONE corridor, so the shared envelope covers'
        + ' both and their progress is the same number — which is §36.2 item 7 exactly:'
        + ' "nearest progress does not distinguish stacked paths". An airborne branch that'
        + ' left the corridor laterally would need the bounded legal-branch-span extension'
        + ' §36.3 prices, and this fixture is the evidence for deciding that.',
      'The last two rows are the switchback test: at 21 m of centreline separation a point'
        + ' 2.4 m outside leg A still belongs to leg A, and at 19 m it does not. That is the'
        + ' spacing a layout owes its own referee.',
    ],
    columns: ['check', 'expected', 'observed', 'verdict'],
    rows: checks.map((check) => [check.name, check.expected, check.observed, check.passed ? 'PASS' : 'FAIL']),
    trials: 0,
    simulatedSteps: 0,
  };
}

/** Every table, in report order. Built once; each call re-measures. */
export function allTables(): readonly BenchTable[] {
  return [
    tableFlatHop(),
    tableFlatHopDiagnostic(),
    tableDropOnly(),
    tableDropPresetCheck(),
    tableDropWithHop(),
    tableGap(),
    tableGapIntervals(),
    tableStepUp(),
    tableLip(),
    tableSmoothSide(),
    tableStairs(),
    tableSkinny(),
    tableSpinPad(),
    tableKicker(),
    tableLap(),
  ];
}
