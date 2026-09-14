/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC, ONE_FOOT, SIMULATION, TRICKS } from '../data/tuning.ts';
import {
  createOneFootPose,
  oneFootQualifiedThisFlight,
  readableWindowSeconds,
  stepOneFootFromController,
  type OneFootPoseState,
} from '../app/oneFootPose.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { EucController, type CrashCause, type LandingQuality } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { METRES_PER_SECOND_PER_MPH } from '../simulation/topSpeedPreset.ts';
import {
  SHIPPED_TRICK_RULES,
  TrickRun,
  trickRulesRevision,
  type TrickAward,
  type TrickRunResult,
  type TrickRunRules,
} from '../simulation/trickRun.ts';
import {
  TrickObserver,
  createTrickFacts,
  type TrickEventKind,
  type TrickFlight,
  type TrickStepInput,
} from '../simulation/trickEvents.ts';
import { trickZoneAt } from '../level/trickZones.ts';
import { flatFixture } from './featureFixtures.ts';
import { recordTrickShuttle } from './trickShuttle.ts';
import {
  BUFFER_STEPS,
  COAST_STEPS,
  ON_TIME_STEPS,
  PLAYABLE_WHEELS,
  STEP_SECONDS,
  apexStepsBeforeLip,
  wheelTuning,
  type BenchCharge,
  type BenchTable,
  type BenchWheel,
  type Fixture,
} from './jumpBench.ts';
import {
  INSTALLED_FEATURES,
  PARK_PLAN,
  bypassFixture,
  installedFixture,
  type InstalledFeature,
} from './installedPark.ts';

/**
 * The Trick Run score bench — M38 §38.4's "headless score bench", and Phase 0's
 * scoring-opportunity measurements (§38.8 Phase 0, q182 and q185).
 *
 * **One formula, and it is not in this file.** Every point printed by this
 * bench was decided by `simulation/trickRun.ts` — the shipped referee, given
 * either `SHIPPED_TRICK_RULES` or an alternate `TrickRunRules` value through
 * the door §38.3 opened for exactly this ("an implementation may evaluate
 * alternate rule objects in the headless bench without making them player
 * configuration"). Nothing here multiplies a count by a value; there is no
 * second scorer to drift from the first. What this file owns is the *input*:
 * bounded, deterministic streams of `TrickStepInput` recorded off the real
 * `EucController` and the real `app/oneFootPose.ts`, and the printing.
 *
 * ## What a recording is, and what it is not
 *
 * A `TrickRecording` is a bounded array of per-step facts plus the identity of
 * the ride that produced it. §38.4: *"This is a development instrument, not a
 * saved gameplay replay format."* Nothing here is written to disk, nothing is
 * versioned, nothing is loaded back into a game, and no recording ships — the
 * report holds tables only. A recording is made, scored and discarded inside
 * one process, and the only thing that survives it is a number in a table.
 *
 * ## Why there is a driver here at all
 *
 * `jumpBench.runTrial` rides the same fixtures through the same controller and
 * is the instrument every window in `docs/JUMP_BENCH.md` was measured with —
 * but it answers with a *summary* (`TrialResult`), and a referee is fed per
 * step. So this file rides its own loop over the same `Fixture` values
 * (`installedFixture`, `bypassFixture`, `flatFixture` — imported, never
 * rebuilt) and writes the ten facts `app/Game.ts` writes, in `Game`'s order
 * and with `Game`'s gates: the press is raised only on a step where
 * `canAcceptHop || canAcceptSpin`, it otherwise waits `BUFFER_STEPS` in the
 * action buffer, `hopCharge` is read only on the `hopped` edge, and the
 * one-foot qualification is `oneFootQualifiedThisFlight` on the pose stepped
 * from the controller. The dry reference pass that turns "press N steps before
 * the lip" into a step number is the same idea `runTrial` uses, restated here
 * because it is private to that file.
 *
 * ## Determinism
 *
 * No `Date`, no `Math.random`, no wall clock, no `node:` import. Two replays
 * of one recording produce identical totals, awards and deadline, and
 * permuting the seats permutes the books and nothing else.
 * `trickRunBench.test.ts` asserts all three, and the adversarial fixtures
 * there — a fabricated touchdown, a duplicated landing step — are clearly
 * labelled synthetic and are the only fact streams in this bench that no ride
 * produced.
 */

/** The one wheel every row is measured on — §38.7 retired the 50 reference. */
export const TRICK_BENCH_WHEEL: BenchWheel = PLAYABLE_WHEELS[0];

/** The run lengths §38.8 Phase 0 compares, seconds. */
export const DURATION_CANDIDATES: readonly number[] = [60, 90, 120];

/** A candidate duration in fixed steps — what `TrickRunRules.durationSteps` is. */
export function durationStepsFor(seconds: number): number {
  return Math.round(seconds * SIMULATION.hz);
}

/** The caveat lines this report attaches to every number it prints. */
export const TRICK_BENCH_CAVEATS: readonly string[] = [
  'Every point in this report was banked by `src/simulation/trickRun.ts`, the shipped'
    + ' referee. This bench computes no points of its own and contains no second formula'
    + ' (§38.4).',
  'These are controller / `PlanTerrainSampler` / `oneFootPose` bench observations, not'
    + ' browser evidence and not owner acceptance. A landing tier is `EucController.land`\'s'
    + ' verdict, read rather than re-judged.',
  'A recording is a bounded per-step fact stream made, scored and discarded inside one'
    + ' process. Nothing is saved, nothing ships, and this is not a replay format (§38.4).',
  '**The routed lap is a spliced proxy.** Its feature trials use straight windows'
    + ' rather than steering around the whole lap. The separate q191 shuttle DOES steer'
    + ' from the normal run start and includes every travel, braking and idle step.',
  'The bench presses the Hop control; it does not model a thumb. A cadence here is the'
    + ' controller\'s own legality clock, which is the fastest a perfect player could go and'
    + ' the right bound for a farming question.',
];

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/** Where a fact stream came from. Only `ride` is evidence about the game. */
export type TrickRecordingSource = 'ride' | 'spliced' | 'synthetic';

/**
 * One seat's bounded per-step fact stream.
 *
 * `steps[i]` is the struct `app/Game.ts` would have handed the referee on the
 * i-th fixed step of that ride. Bounded by construction: every driver here
 * takes a hard step ceiling and every splice is a concatenation of bounded
 * parts.
 */
export interface TrickRecording {
  readonly id: string;
  readonly label: string;
  readonly source: TrickRecordingSource;
  readonly steps: readonly TrickStepInput[];
  /**
   * The launch zone the referee is handed on each step, parallel to `steps` —
   * q189's `record(seat, facts, launchZone)`.
   *
   * Non-null only on a takeoff step, and **never taken from the recipe**: it is
   * `trickZoneAt(plan.trickZones, x, z)` at the contact-patch XZ of the last
   * grounded step before the wheel left the ground. A flat fixture emits no
   * zones at all, so a standing hop comes out null on its own rather than by a
   * rule written here — which is the control that proves the zones are where
   * the features are.
   */
  readonly zones: readonly (string | null)[];
}

/** A recorded ride, with the ride facts a table wants beside its points. */
export interface TrickRide {
  readonly recording: TrickRecording;
  readonly steps: number;
  /** Takeoffs, hop launches and touchdowns seen, in the whole ride. */
  readonly takeoffs: number;
  readonly hopLaunches: number;
  readonly touchdowns: number;
  /** The charge latched at the first hop launch, 0..1; zero for a drop. */
  readonly takeoffCharge: number;
  /** The first touchdown's tier, or `none` for a ride that never landed. */
  readonly firstTier: LandingQuality | 'none';
  /** Every touchdown's tier, counted. */
  readonly tiers: Readonly<Record<string, number>>;
  readonly chargedHops: number;
  readonly spinsCompleted: number;
  readonly oneFootQualifications: number;
  readonly crashed: boolean;
  readonly crashCause: CrashCause;
  /** Steps from the first crash to the first rolling step again, or -1. */
  readonly recoveredAfterSteps: number;
  /** True when the ride stopped because it reached the window's merge. */
  readonly reachedEnd: boolean;
  readonly finalS: number;
  readonly finalMph: number;
  /** Steps between consecutive takeoffs, in order. The cadence, measured. */
  readonly takeoffGaps: readonly number[];
  /** True when the last recorded step still had a flight in the air. */
  readonly endsAirborne: boolean;
}

/**
 * Score one or more recordings through the real referee, seat by seat.
 *
 * Seat `i` is fed `recordings[i]`. The run is armed for that many seats, every
 * step is recorded and swept exactly once, and the loop stops when the referee
 * says the deadline fell — which is the referee's decision, never this file's.
 * A recording shorter than the duration simply stops recording; the clock runs
 * on, which is what a rider standing still looks like.
 */
export interface TrickReplay {
  readonly rulesRevision: string;
  readonly result: TrickRunResult;
  readonly awards: readonly TrickAward[];
  /** The run step each award banked on, parallel to `awards`. The repeat clock. */
  readonly awardSteps: readonly number[];
  /** Steps actually swept — the referee's `elapsedSteps`. */
  readonly steps: number;
  /** Seat totals, in seat order. The one number most rows print. */
  readonly scores: readonly number[];
}

export function replayTrickRun(
  recordings: readonly TrickRecording[],
  rules: TrickRunRules = SHIPPED_TRICK_RULES,
): TrickReplay {
  const run = new TrickRun(rules);
  run.arm(recordings.length);
  const awards: TrickAward[] = [];
  const awardSteps: number[] = [];
  for (let step = 0; step < rules.durationSteps; step += 1) {
    for (let seat = 0; seat < recordings.length; seat += 1) {
      const facts = recordings[seat].steps[step];
      if (facts !== undefined) run.record(seat, facts, recordings[seat].zones[step] ?? null);
    }
    const outcome = run.step(STEP_SECONDS);
    for (const award of outcome.awards) {
      awards.push(award);
      awardSteps.push(step);
    }
    if (outcome.ended) break;
  }
  const result = run.result();
  if (result === null) throw new Error('trickRunBench: the referee produced no result');
  return {
    rulesRevision: trickRulesRevision(rules),
    result,
    awards,
    awardSteps,
    steps: result.elapsedSteps,
    scores: result.books.map((book) => book.score),
  };
}

/**
 * Score one recording over exactly its own length.
 *
 * The rules are the shipped values with the clock set to the recording — the
 * question "what is this attempt worth" is about the value table, not about
 * where a 90-second deadline happened to fall inside it. The duration is the
 * only field that moves, and the referee is told so through the same
 * `TrickRunRules` door the alternate-rules control uses.
 */
export function scoreRecording(
  recording: TrickRecording,
  rules: TrickRunRules = SHIPPED_TRICK_RULES,
): TrickReplay {
  return replayTrickRun([recording], {
    ...rules,
    durationSteps: Math.max(1, recording.steps.length),
  });
}

/** A step of nothing at all, on the flight the rider is not in. */
function quietStep(flightIndex: number): TrickStepInput {
  const facts = createTrickFacts();
  facts.flightIndex = flightIndex;
  return facts;
}

/**
 * Concatenate recordings into one seat's stream, renumbering flight identity.
 *
 * **Splicing is the honest name for it.** The bench rider cannot steer through
 * a hairpin, so a lap of the park is measured as its straight windows and then
 * laid end to end with the connective corridor counted as time. Two rules keep
 * the splice from fabricating anything the referee would score:
 *
 *   - **A part must end on the ground.** A seam inside a flight would hand the
 *     referee a touchdown belonging to a takeoff from another world.
 *   - **Flight identity is offset, never repeated.** `flightIndex` counts up
 *     across the whole stream, exactly as the controller's does, so a second
 *     attempt at one feature cannot land the first attempt's flight.
 */
export interface SplicePart {
  readonly recording: TrickRecording;
  /** Quiet steps appended after this part — the connective corridor. */
  readonly fillerSteps: number;
}

export function spliceRecordings(
  id: string,
  label: string,
  parts: readonly SplicePart[],
): TrickRecording {
  const steps: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  let offset = 0;
  for (const part of parts) {
    let highest = 0;
    let index = 0;
    for (const facts of part.recording.steps) {
      const moved = createTrickFacts();
      moved.flightIndex = facts.flightIndex + offset;
      moved.tookOff = facts.tookOff;
      moved.hopped = facts.hopped;
      moved.hopCharge = facts.hopCharge;
      moved.spinCompleted = facts.spinCompleted;
      moved.oneFootQualified = facts.oneFootQualified;
      moved.touchedDown = facts.touchedDown;
      moved.landingQuality = facts.landingQuality;
      moved.crashed = facts.crashed;
      moved.reset = facts.reset;
      steps.push(moved);
      zones.push(part.recording.zones[index] ?? null);
      index += 1;
      if (moved.flightIndex > highest) highest = moved.flightIndex;
    }
    offset = highest;
    for (let filler = 0; filler < part.fillerSteps; filler += 1) {
      steps.push(quietStep(offset));
      zones.push(null);
    }
  }
  return { id, label, source: 'spliced', steps, zones };
}

/** Repeat one recording `times` over, with `fillerSteps` of quiet between. */
export function repeatRecording(
  id: string,
  label: string,
  recording: TrickRecording,
  times: number,
  fillerSteps = 0,
): TrickRecording {
  const parts: SplicePart[] = [];
  for (let index = 0; index < times; index += 1) parts.push({ recording, fillerSteps });
  return spliceRecordings(id, label, parts);
}

/** Cut or extend a stream to exactly `steps` — a line measured against a clock. */
export function fitRecording(recording: TrickRecording, steps: number): TrickRecording {
  if (recording.steps.length >= steps) {
    return {
      ...recording,
      steps: recording.steps.slice(0, steps),
      zones: recording.zones.slice(0, steps),
    };
  }
  const last = recording.steps[recording.steps.length - 1];
  const flight = last === undefined ? 0 : last.flightIndex;
  const padded = recording.steps.slice();
  const paddedZones = recording.zones.slice();
  while (padded.length < steps) {
    padded.push(quietStep(flight));
    paddedZones.push(null);
  }
  return { ...recording, steps: padded, zones: paddedZones };
}

/**
 * A fact stream nobody rode — the adversarial controls only.
 *
 * §38.4 allows synthetic streams as *separate, labelled* fixtures, and this is
 * the label. Nothing built by this function appears in a measured table; it
 * exists so `trickRunBench.test.ts` can hand the referee a struct full of true
 * flags with no takeoff behind it and prove that it banks nothing.
 */
export function syntheticRecording(
  id: string,
  label: string,
  steps: readonly Partial<TrickStepInput>[],
  zones: readonly (string | null)[] = [],
): TrickRecording {
  return {
    id,
    label,
    source: 'synthetic',
    steps: steps.map((partial) => {
      const facts = createTrickFacts();
      Object.assign(facts, partial);
      return facts;
    }),
    // A fabricated stream launches from wherever the fixture says, and the
    // default is the honest one for a struct nobody rode: nowhere. A control
    // that wants a zone names it.
    zones: steps.map((_, index) => zones[index] ?? null),
  };
}

/**
 * Every flight in a recording, as the observer saw it — **read-only**.
 *
 * A second `TrickObserver` fed the same facts the referee's own one is fed.
 * It touches no referee, changes no rule and banks nothing; it exists because
 * `TrickFlight.airSeconds` is §36.6's bounded diagnostic and the referee keeps
 * its observer private. Two observers fed one fact stream see one set of
 * flights, which is the whole reason the observer has no state of its own
 * beyond the flight it is in.
 */
export interface ObservedFlight {
  /** The controller's `flightIndex` — what `TrickAward.flight` names. */
  readonly id: number;
  readonly airSeconds: number;
  readonly charge: number;
  readonly spinCompleted: boolean;
  readonly oneFoot: boolean;
  readonly landing: TrickFlight['landing'];
  readonly ended: TrickFlight['ended'];
  /** The kinds the observer credited on this flight, in its fixed order. */
  readonly kinds: readonly TrickEventKind[];
}

export function observeFlights(recording: TrickRecording): readonly ObservedFlight[] {
  const observer = new TrickObserver();
  const flights: ObservedFlight[] = [];
  let open: TrickEventKind[] = [];
  let last: TrickFlight | null = null;
  for (const facts of recording.steps) {
    const events = observer.step(STEP_SECONDS, facts);
    for (const event of events) if (!open.includes(event.kind)) open.push(event.kind);
    const closed = observer.lastFlight;
    if (closed !== null && closed !== last) {
      flights.push({
        id: closed.id,
        airSeconds: closed.airSeconds,
        charge: closed.charge,
        spinCompleted: closed.spinCompleted,
        oneFoot: closed.oneFoot,
        landing: closed.landing,
        ended: closed.ended,
        kinds: Object.freeze(open),
      });
      last = closed;
      open = [];
    }
  }
  return flights;
}

/** A flight the observer credited at least one trick kind to, and that landed. */
export function banksATrick(flight: ObservedFlight): boolean {
  return flight.ended === 'landed' && flight.kinds.length > 0;
}

// ---------------------------------------------------------------------------
// The driver: a ride, recorded per step
// ---------------------------------------------------------------------------

function actionsOf(partial: Partial<ActionSnapshot>): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/**
 * The trick zone under a point on this fixture's plan, or null — q189.
 *
 * The whole of the bench's zone knowledge, and it is a lookup rather than a
 * lookup table: the plan's own `trickZones` answer for the contact-patch XZ
 * the wheel actually left the ground from. A fixture whose plan carries no
 * zones — every flat fixture here — answers null for every point, which is
 * why a standing hop comes out off-zone without this file saying so.
 */
function launchZoneAt(fixture: Fixture, x: number, z: number): string | null {
  return trickZoneAt(fixture.plan.trickZones, x, z);
}

/** The fixture's own `s` for a world point — its frame, or plain `z`. */
function progressOf(fixture: Fixture, x: number, z: number): number {
  return fixture.progressOf === undefined ? z : fixture.progressOf(x, z);
}

function spawnOf(fixture: Fixture): { position: { x: number; y: number; z: number }; headingY: number } {
  const spawn = fixture.spawnPose ?? fixture.plan.spawn;
  return { position: { ...spawn.position }, headingY: spawn.headingY };
}

/**
 * Grounded steps of held crouch that latch a full charge.
 *
 * `stepHop` reads `crouchHold / hopChargeSeconds` at the press, so a press is
 * worth `TRICKS.chargedHopMinCharge` once the hold has run that long. One step
 * of slack, because the charge is read before the step that would have topped
 * it up.
 */
export const FULL_CHARGE_STEPS = Math.ceil(
  (EUC.hopChargeSeconds * TRICKS.chargedHopMinCharge) / STEP_SECONDS,
) + 1;

/** What a recorded ride is asked to do. */
export interface TrickScript {
  /** Hold this speed, mph, or null to coast. */
  readonly targetMph: number | null;
  /** Start already at this speed, mph, instead of from rest. */
  readonly startMph?: number;
  /** Where the launch feature is, in the fixture's `s` frame, or null. */
  readonly lipS: number | null;
  /** Press Hop this many steps before the lip, or null for no press. */
  readonly hopStepsFromLip: number | null;
  readonly charge: BenchCharge;
  /** Keep the Hop control's *level* held through the flight — the one-foot air. */
  readonly holdHop?: boolean;
  /** Air-tap the 180 on the first rising airborne step, and which way. */
  readonly spinTap?: 'left' | 'right';
  readonly lateralOffset?: number;
  readonly maxSteps: number;
  /** Steps the ride runs past the last touchdown before it stops. */
  readonly coastSteps?: number;
  /** Keep riding after a crash instead of stopping at it. */
  readonly rideThroughCrash?: boolean;
}

/**
 * The dry pass that turns "press N steps before the lip" into a step number.
 *
 * Identical to the real ride in every other respect, so the step it reports is
 * the step the real ride would have reached. This is `runTrial`'s own reference
 * pass, restated because it is private to that file.
 */
function lipStepOf(fixture: Fixture, wheel: BenchWheel, script: TrickScript): number {
  const spawn = spawnOf(fixture);
  const axis = fixture.lateralAxis ?? { x: 1, z: 0 };
  const offset = script.lateralOffset ?? 0;
  spawn.position.x += axis.x * offset;
  spawn.position.z += axis.z * offset;
  const controller = new EucController(new PlanTerrainSampler(fixture.plan), {
    tuning: wheelTuning(wheel),
    spawn,
  });
  if (script.startMph !== undefined) {
    controller.reset(spawn, script.startMph * METRES_PER_SECOND_PER_MPH);
  }
  const target = script.targetMph === null ? null : script.targetMph * METRES_PER_SECOND_PER_MPH;
  let best = -Infinity;
  let bestStep = 0;
  for (let step = 0; step < script.maxSteps; step += 1) {
    const before = controller.snapshot();
    const throttle = target === null ? 0 : before.speed < target ? 1 : 0;
    controller.step(STEP_SECONDS, actionsOf({ throttle }));
    const after = controller.snapshot();
    const s = progressOf(fixture, after.position.x, after.position.z);
    if (s > best) {
      best = s;
      bestStep = step;
    }
    if (script.lipS !== null && s >= script.lipS) return Math.max(0, step - 1);
    if (after.crashed) break;
    if (s >= fixture.endS) break;
  }
  return bestStep;
}

/** The half charge is `hopChargeSeconds / 2` of hold ending at the press. */
const HALF_CHARGE_STEPS = Math.round((EUC.hopChargeSeconds / 2) / STEP_SECONDS);

/**
 * Ride one scripted attempt and record the ten facts, once per fixed step.
 *
 * The order is `app/Game.ts`'s: the controller steps, the one-foot pose steps
 * from the controller, and only then are the facts assembled — because
 * `oneFootQualified` has to be *this* step's qualification and not last
 * step's. `hopCharge` is gated on the `hopped` edge for the reason the
 * composition root states: `lastHopCharge` survives its launch, so on a ledge
 * drop it is a stale number from a hop taken a hundred metres back.
 */
export function recordRide(
  id: string,
  label: string,
  fixture: Fixture,
  wheel: BenchWheel,
  script: TrickScript,
): TrickRide {
  const timed = script.hopStepsFromLip !== null && script.lipS !== null;
  const plannedPress = timed
    ? Math.max(0, lipStepOf(fixture, wheel, script) - (script.hopStepsFromLip as number))
    : -1;

  const spawn = spawnOf(fixture);
  const axis = fixture.lateralAxis ?? { x: 1, z: 0 };
  const offset = script.lateralOffset ?? 0;
  spawn.position.x += axis.x * offset;
  spawn.position.z += axis.z * offset;
  const controller = new EucController(new PlanTerrainSampler(fixture.plan), {
    tuning: wheelTuning(wheel),
    spawn,
  });
  if (script.startMph !== undefined) {
    controller.reset(spawn, script.startMph * METRES_PER_SECOND_PER_MPH);
  }
  const pose = createOneFootPose();
  const target = script.targetMph === null ? null : script.targetMph * METRES_PER_SECOND_PER_MPH;
  const coastLimit = script.coastSteps ?? 1_000_000;

  const steps: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const takeoffSteps: number[] = [];
  const tiers: Record<string, number> = {};
  let pressRequested = false;
  let pressFired = false;
  let pressStep = -1;
  let spinRequested = false;
  let held = false;
  let takeoffs = 0;
  let hopLaunches = 0;
  let touchdowns = 0;
  let takeoffCharge = 0;
  let firstTier: LandingQuality | 'none' = 'none';
  let chargedHops = 0;
  let spinsCompleted = 0;
  let oneFootQualifications = 0;
  let crashed = false;
  let crashCause: CrashCause = 'none';
  let crashStep = -1;
  let recoveredAfterSteps = -1;
  let reachedEnd = false;
  let coast = 0;
  let airborne = false;
  let final = controller.snapshot();

  for (let step = 0; step < script.maxSteps; step += 1) {
    const before = controller.snapshot();

    if (!pressRequested && plannedPress >= 0 && step === plannedPress) {
      pressRequested = true;
      pressStep = step;
    }
    const spinNow = script.spinTap !== undefined
      && !spinRequested
      && !before.grounded
      && controller.canAcceptSpin;
    if (spinNow) spinRequested = true;

    const pending = pressRequested && !pressFired && step - pressStep <= BUFFER_STEPS;
    const legal = controller.canAcceptHop || controller.canAcceptSpin;
    const hop = (pending || spinNow) && legal;
    if (pending && hop && !spinNow) pressFired = true;
    if (hop && !spinNow && script.holdHop === true) held = true;

    let crouch = script.charge === 'full';
    if (script.charge === 'half' && plannedPress >= 0) {
      crouch = step >= plannedPress - HALF_CHARGE_STEPS && step < plannedPress;
    }

    const throttle = target === null ? 0 : before.speed < target ? 1 : 0;
    // **One physical control.** A 180 tap is a press of the same button the
    // one-foot pose reads the level of, so the tap releases the level on the
    // step it is made and the hold resumes on the next one — which is §36.5's
    // "release, then re-hold while rising", and the only way a rider can ask
    // for both on one flight.
    controller.step(STEP_SECONDS, actionsOf({
      throttle,
      steer: spinNow ? (script.spinTap === 'right' ? 1 : -1) : 0,
      crouch,
      hop,
      hopHeld: held && !spinNow,
    }));
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, held && !spinNow, false);

    const after = controller.snapshot();
    final = after;
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
    // **The launch zone, from the trajectory.** `before` is the last grounded
    // state — the same position `runTrial` records as the takeoff point — so
    // this is the ground the wheel actually left, asked of the plan's own
    // zones. Nothing here knows which feature the script was aiming at.
    zones.push(facts.tookOff
      ? launchZoneAt(fixture, before.position.x, before.position.z)
      : null);

    if (facts.tookOff) {
      takeoffs += 1;
      takeoffSteps.push(step);
      airborne = true;
      if (facts.hopped) {
        hopLaunches += 1;
        if (hopLaunches === 1) takeoffCharge = facts.hopCharge;
        if (facts.hopCharge >= TRICKS.chargedHopMinCharge) chargedHops += 1;
      }
    }
    if (facts.touchedDown) {
      touchdowns += 1;
      airborne = false;
      coast = 0;
      if (firstTier === 'none') firstTier = facts.landingQuality;
      tiers[facts.landingQuality] = (tiers[facts.landingQuality] ?? 0) + 1;
      if (facts.spinCompleted) spinsCompleted += 1;
      if (facts.oneFootQualified) oneFootQualifications += 1;
      // The flight is over; the level is released as a thumb would release it.
      held = false;
      spinRequested = false;
    }
    if (facts.crashed && !crashed) {
      crashed = true;
      crashCause = after.crashCause;
      crashStep = step;
      airborne = false;
    }
    if (crashed && recoveredAfterSteps < 0 && !facts.crashed && after.grounded) {
      recoveredAfterSteps = step - crashStep;
    }

    const s = progressOf(fixture, after.position.x, after.position.z);
    if (crashed && script.rideThroughCrash !== true) break;
    if (s >= fixture.endS) {
      reachedEnd = true;
      break;
    }
    if (touchdowns > 0 && !airborne) {
      coast += 1;
      if (coast >= coastLimit) break;
    }
  }

  const gaps = takeoffSteps.slice(1).map((value, index) => value - takeoffSteps[index]);
  return {
    recording: { id, label, source: 'ride', steps, zones },
    steps: steps.length,
    takeoffs,
    hopLaunches,
    touchdowns,
    takeoffCharge,
    firstTier,
    tiers,
    chargedHops,
    spinsCompleted,
    oneFootQualifications,
    crashed,
    crashCause,
    recoveredAfterSteps,
    reachedEnd,
    finalS: progressOf(fixture, final.position.x, final.position.z),
    finalMph: final.speed / METRES_PER_SECOND_PER_MPH,
    takeoffGaps: gaps,
    endsAirborne: airborne,
  };
}

/**
 * Hop where you stand, as fast as the controller will let you, for a fixed
 * number of steps.
 *
 * The farming instrument. There is no feature, no approach and no lip: the
 * ride presses Hop on every step `canAcceptHop` is true (after the charge hold,
 * when one is asked for), optionally holds the level for the one-foot air and
 * optionally taps the 180 on the way up. What it measures is the *legality
 * clock* — the shortest possible time between one launch and the next — which
 * is the right bound for "does farming beat riding the park".
 */
export interface HopLoopOptions {
  readonly charge: 'none' | 'full';
  readonly holdHop: boolean;
  readonly spinTap?: 'left' | 'right';
  /** Hold this ground speed, mph. Zero is the standing case. */
  readonly mph?: number;
  /** Minimum steps between launches; idle steps still run the controller. */
  readonly launchIntervalSteps?: number;
  readonly steps: number;
}

export interface HopLoopRide extends TrickRide {
  /** Maximum horizontal distance from the spawn over the continuous ride. */
  readonly maxDisplacementMetres: number;
}

export function recordHopLoop(
  id: string,
  label: string,
  fixture: Fixture,
  wheel: BenchWheel,
  options: HopLoopOptions,
): HopLoopRide {
  const spawn = spawnOf(fixture);
  const controller = new EucController(new PlanTerrainSampler(fixture.plan), {
    tuning: wheelTuning(wheel),
    spawn,
  });
  const mph = options.mph ?? 0;
  if (mph > 0) controller.reset(spawn, mph * METRES_PER_SECOND_PER_MPH);
  const target = mph > 0 ? mph * METRES_PER_SECOND_PER_MPH : null;
  const pose: OneFootPoseState = createOneFootPose();

  const steps: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const takeoffSteps: number[] = [];
  const tiers: Record<string, number> = {};
  let grounded = 0;
  let held = false;
  let spinRequested = false;
  let takeoffs = 0;
  let hopLaunches = 0;
  let touchdowns = 0;
  let takeoffCharge = 0;
  let firstTier: LandingQuality | 'none' = 'none';
  let chargedHops = 0;
  let spinsCompleted = 0;
  let oneFootQualifications = 0;
  let crashed = false;
  let crashCause: CrashCause = 'none';
  let crashStep = -1;
  let recoveredAfterSteps = -1;
  let airborne = false;
  let final = controller.snapshot();
  let maxDisplacementMetres = 0;

  for (let step = 0; step < options.steps; step += 1) {
    const before = controller.snapshot();
    grounded = before.grounded ? grounded + 1 : 0;
    const charged = options.charge === 'full';
    const lastLaunch = takeoffSteps[takeoffSteps.length - 1];
    const cadenceReady = lastLaunch === undefined
      || step - lastLaunch >= (options.launchIntervalSteps ?? 0);
    const wantHop = cadenceReady && controller.canAcceptHop
      && (!charged || grounded >= FULL_CHARGE_STEPS);
    const spinNow = options.spinTap !== undefined
      && !spinRequested
      && !before.grounded
      && controller.canAcceptSpin;
    if (spinNow) spinRequested = true;
    if (wantHop && options.holdHop) held = true;

    const throttle = target === null ? 0 : before.speed < target ? 1 : 0;
    controller.step(STEP_SECONDS, actionsOf({
      throttle,
      steer: spinNow ? (options.spinTap === 'right' ? 1 : -1) : 0,
      crouch: charged,
      hop: wantHop || spinNow,
      hopHeld: held && !spinNow,
    }));
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, held && !spinNow, false);

    const after = controller.snapshot();
    final = after;
    maxDisplacementMetres = Math.max(maxDisplacementMetres,
      Math.hypot(after.position.x - spawn.position.x, after.position.z - spawn.position.z));
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
    zones.push(facts.tookOff
      ? launchZoneAt(fixture, before.position.x, before.position.z)
      : null);

    if (facts.tookOff) {
      takeoffs += 1;
      takeoffSteps.push(step);
      airborne = true;
      if (facts.hopped) {
        hopLaunches += 1;
        if (hopLaunches === 1) takeoffCharge = facts.hopCharge;
        if (facts.hopCharge >= TRICKS.chargedHopMinCharge) chargedHops += 1;
      }
    }
    if (facts.touchedDown) {
      touchdowns += 1;
      airborne = false;
      if (firstTier === 'none') firstTier = facts.landingQuality;
      tiers[facts.landingQuality] = (tiers[facts.landingQuality] ?? 0) + 1;
      if (facts.spinCompleted) spinsCompleted += 1;
      if (facts.oneFootQualified) oneFootQualifications += 1;
      held = false;
      spinRequested = false;
    }
    if (facts.crashed && !crashed) {
      crashed = true;
      crashCause = after.crashCause;
      crashStep = step;
      airborne = false;
    }
    if (crashed && recoveredAfterSteps < 0 && !facts.crashed && after.grounded) {
      recoveredAfterSteps = step - crashStep;
    }
  }

  const gaps = takeoffSteps.slice(1).map((value, index) => value - takeoffSteps[index]);
  return {
    recording: { id, label, source: 'ride', steps, zones },
    maxDisplacementMetres,
    steps: steps.length,
    takeoffs,
    hopLaunches,
    touchdowns,
    takeoffCharge,
    firstTier,
    tiers,
    chargedHops,
    spinsCompleted,
    oneFootQualifications,
    crashed,
    crashCause,
    recoveredAfterSteps,
    reachedEnd: false,
    finalS: progressOf(fixture, final.position.x, final.position.z),
    finalMph: final.speed / METRES_PER_SECOND_PER_MPH,
    takeoffGaps: gaps,
    endsAirborne: airborne,
  };
}

/**
 * One feature, ridden, reset to its own start, ridden again — for a fixed
 * number of steps.
 *
 * §38.8 Phase 0's "reset-assisted repetition", measured at its most generous:
 * the rider is put back at the feature's own approach rather than at the
 * park's start, stationary, exactly as `Game.resetRider` puts one somewhere.
 * The reset step integrates nothing and records the one thing that happened —
 * `reset: true` on this rider's slot — which is the composition root's own
 * behaviour, and which the referee answers by discarding the pending flight.
 */
export interface ResetLoopOptions {
  readonly mph: number;
  readonly charge: BenchCharge;
  readonly holdHop: boolean;
  readonly spinTap?: 'left' | 'right';
  /** Steps to keep riding after a touchdown before pulling the reset. */
  readonly settleSteps: number;
  readonly steps: number;
}

export function recordResetLoop(
  id: string,
  label: string,
  feature: InstalledFeature,
  wheel: BenchWheel,
  options: ResetLoopOptions,
): TrickRide {
  const fixture = installedFixture(feature);
  const script: TrickScript = {
    targetMph: options.mph,
    startMph: options.mph,
    lipS: feature.lipS,
    hopStepsFromLip: feature.press === 'apex'
      ? apexStepsBeforeLip(options.charge)
      : ON_TIME_STEPS,
    charge: options.charge,
    holdHop: options.holdHop,
    maxSteps: 4000,
    rideThroughCrash: true,
    ...(options.spinTap === undefined ? {} : { spinTap: options.spinTap }),
  };
  const lipStep = lipStepOf(fixture, wheel, script);
  const plannedPress = Math.max(0, lipStep - (script.hopStepsFromLip as number));

  const baseSpawn = spawnOf(fixture);
  const controller = new EucController(new PlanTerrainSampler(fixture.plan), {
    tuning: wheelTuning(wheel),
    spawn: baseSpawn,
  });
  controller.reset(baseSpawn, options.mph * METRES_PER_SECOND_PER_MPH);
  const pose = createOneFootPose();
  const target = options.mph * METRES_PER_SECOND_PER_MPH;

  const steps: TrickStepInput[] = [];
  const zones: (string | null)[] = [];
  const takeoffSteps: number[] = [];
  const tiers: Record<string, number> = {};
  let cycleStep = 0;
  let sinceTouchdown = -1;
  let pressRequested = false;
  let pressFired = false;
  let pressStep = -1;
  let spinRequested = false;
  let held = false;
  let takeoffs = 0;
  let hopLaunches = 0;
  let touchdowns = 0;
  let takeoffCharge = 0;
  let firstTier: LandingQuality | 'none' = 'none';
  let chargedHops = 0;
  let spinsCompleted = 0;
  let oneFootQualifications = 0;
  let crashed = false;
  let crashCause: CrashCause = 'none';
  let airborne = false;
  let final = controller.snapshot();

  for (let step = 0; step < options.steps; step += 1) {
    if (sinceTouchdown >= 0 && sinceTouchdown >= options.settleSteps) {
      // **The reset step integrates nothing** — `Game`'s own early return.
      controller.reset(baseSpawn, options.mph * METRES_PER_SECOND_PER_MPH);
      const reset = createTrickFacts();
      reset.flightIndex = controller.flightIndex;
      reset.reset = true;
      steps.push(reset);
      zones.push(null);
      cycleStep = 0;
      sinceTouchdown = -1;
      pressRequested = false;
      pressFired = false;
      pressStep = -1;
      spinRequested = false;
      held = false;
      airborne = false;
      continue;
    }

    const before = controller.snapshot();
    if (!pressRequested && cycleStep === plannedPress) {
      pressRequested = true;
      pressStep = cycleStep;
    }
    const spinNow = options.spinTap !== undefined
      && !spinRequested
      && !before.grounded
      && controller.canAcceptSpin;
    if (spinNow) spinRequested = true;
    const pending = pressRequested && !pressFired && cycleStep - pressStep <= BUFFER_STEPS;
    const legal = controller.canAcceptHop || controller.canAcceptSpin;
    const hop = (pending || spinNow) && legal;
    if (pending && hop && !spinNow) pressFired = true;
    if (hop && !spinNow && options.holdHop) held = true;

    let crouch = options.charge === 'full';
    if (options.charge === 'half') {
      crouch = cycleStep >= plannedPress - HALF_CHARGE_STEPS && cycleStep < plannedPress;
    }

    controller.step(STEP_SECONDS, actionsOf({
      throttle: before.speed < target ? 1 : 0,
      steer: spinNow ? (options.spinTap === 'right' ? 1 : -1) : 0,
      crouch,
      hop,
      hopHeld: held && !spinNow,
    }));
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, held && !spinNow, false);

    const after = controller.snapshot();
    final = after;
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
    zones.push(facts.tookOff
      ? launchZoneAt(fixture, before.position.x, before.position.z)
      : null);

    if (facts.tookOff) {
      takeoffs += 1;
      takeoffSteps.push(step);
      airborne = true;
      if (facts.hopped) {
        hopLaunches += 1;
        if (hopLaunches === 1) takeoffCharge = facts.hopCharge;
        if (facts.hopCharge >= TRICKS.chargedHopMinCharge) chargedHops += 1;
      }
    }
    if (facts.touchedDown) {
      touchdowns += 1;
      airborne = false;
      sinceTouchdown = 0;
      if (firstTier === 'none') firstTier = facts.landingQuality;
      tiers[facts.landingQuality] = (tiers[facts.landingQuality] ?? 0) + 1;
      if (facts.spinCompleted) spinsCompleted += 1;
      if (facts.oneFootQualified) oneFootQualifications += 1;
      held = false;
      spinRequested = false;
    } else if (sinceTouchdown >= 0) sinceTouchdown += 1;
    if (facts.crashed && !crashed) {
      crashed = true;
      crashCause = after.crashCause;
    }
    cycleStep += 1;
  }

  const gaps = takeoffSteps.slice(1).map((value, index) => value - takeoffSteps[index]);
  return {
    recording: { id, label, source: 'ride', steps, zones },
    steps: steps.length,
    takeoffs,
    hopLaunches,
    touchdowns,
    takeoffCharge,
    firstTier,
    tiers,
    chargedHops,
    spinsCompleted,
    oneFootQualifications,
    crashed,
    crashCause,
    recoveredAfterSteps: -1,
    reachedEnd: false,
    finalS: 0,
    finalMph: final.speed / METRES_PER_SECOND_PER_MPH,
    takeoffGaps: gaps,
    endsAirborne: airborne,
  };
}

// ---------------------------------------------------------------------------
// The recipes the tables ride
// ---------------------------------------------------------------------------

/** The input recipes every feature is ridden with. T11's charges, plus the level. */
export const FEATURE_RECIPES: readonly {
  readonly id: string;
  readonly label: string;
  readonly charge: BenchCharge;
  readonly hop: boolean;
  readonly holdHop: boolean;
  readonly spinTap?: 'left' | 'right';
}[] = [
  { id: 'roll', label: 'no hop', charge: 'none', hop: false, holdHop: false },
  { id: 'hop', label: 'hop', charge: 'none', hop: true, holdHop: false },
  { id: 'charged', label: 'hop + full', charge: 'full', hop: true, holdHop: false },
  { id: 'oneFoot', label: 'hop + full, Hop held', charge: 'full', hop: true, holdHop: true },
  { id: 'spin', label: 'hop + full, 180 tapped left', charge: 'full', hop: true, holdHop: false, spinTap: 'left' },
  { id: 'both', label: 'hop + full, 180 then re-hold', charge: 'full', hop: true, holdHop: true, spinTap: 'left' },
];

function featureScript(
  feature: InstalledFeature,
  mph: number,
  recipe: (typeof FEATURE_RECIPES)[number],
  overrides: Partial<TrickScript> = {},
): TrickScript {
  return {
    targetMph: mph,
    startMph: mph,
    lipS: feature.lipS,
    hopStepsFromLip: recipe.hop
      ? (feature.press === 'apex' ? apexStepsBeforeLip(recipe.charge) : ON_TIME_STEPS)
      : null,
    charge: recipe.charge,
    holdHop: recipe.holdHop,
    maxSteps: 4000,
    rideThroughCrash: true,
    // **A 180 exits fakie, and the throttle law then drives the wheel back up
    // the lap**, so `s >= endS` never fires and the ride runs its whole
    // ceiling off the park and into the woods. `docs/JUMP_BENCH.md` T13 met
    // the same thing and answered it the same way: a spin row stops when the
    // landing has settled rather than at the merge.
    ...(recipe.spinTap === undefined ? {} : { spinTap: recipe.spinTap, coastSteps: COAST_STEPS }),
    ...overrides,
  };
}

/**
 * The park's lap length, metres — the wrap a routed proxy has to cross.
 *
 * `LevelPlan.lap` is optional because most worlds are point-to-point; the park
 * has one, and a park that lost it would make every routed row meaningless
 * rather than slightly wrong, so it is asserted here once.
 */
export const PARK_LAP_METRES: number = (() => {
  const lap = PARK_PLAN.lap;
  if (lap === undefined) throw new Error('trickRunBench: the park has no lap');
  return lap.length;
})();

/** Every feature in lap order — the order a routed run meets them. */
export function featuresInLapOrder(): readonly InstalledFeature[] {
  return [...INSTALLED_FEATURES].sort((left, right) => left.spawnS - right.spawnS);
}

/** One measured feature attempt: the ride, and what the referee banked for it. */
export interface FeatureAttempt {
  readonly feature: InstalledFeature;
  readonly mph: number;
  readonly recipe: (typeof FEATURE_RECIPES)[number];
  readonly ride: TrickRide;
  readonly replay: TrickReplay;
  readonly points: number;
}

function attempt(
  feature: InstalledFeature,
  mph: number,
  recipe: (typeof FEATURE_RECIPES)[number],
  overrides: Partial<TrickScript> = {},
): FeatureAttempt {
  const ride = recordRide(
    `${feature.id}-${mph}-${recipe.id}`,
    `${feature.label} at ${mph} mph, ${recipe.label}`,
    installedFixture(feature),
    TRICK_BENCH_WHEEL,
    featureScript(feature, mph, recipe, overrides),
  );
  const replay = scoreRecording(ride.recording);
  return { feature, mph, recipe, ride, replay, points: replay.scores[0] };
}

// ---------------------------------------------------------------------------
// Printing helpers
// ---------------------------------------------------------------------------

const seconds = (value: number): string => value.toFixed(2);
const rate = (value: number): string => value.toFixed(1);

function stepsToSeconds(steps: number): number {
  return steps * STEP_SECONDS;
}

function tierText(ride: TrickRide): string {
  const parts = Object.entries(ride.tiers)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => (count === 1 ? tier : `${tier} ×${count}`));
  if (ride.crashed) parts.push(`CRASH (${ride.crashCause})`);
  return parts.length === 0 ? 'never landed' : parts.join(', ');
}

/** Where each takeoff of an attempt launched from — the plan's answer, in order. */
function zoneText(value: FeatureAttempt): string {
  const zones = value.ride.recording.zones.filter((_, index) =>
    value.ride.recording.steps[index].tookOff);
  if (zones.length === 0) return '—';
  return zones.map((zone) => zone ?? '**off-zone**').join(', ');
}

/** What the referee credited, named from the award list rather than re-counted. */
function eventText(replay: TrickReplay): string {
  const kinds: string[] = [];
  for (const award of replay.awards) {
    for (const kind of award.kinds) if (!kinds.includes(kind)) kinds.push(kind);
  }
  const book = replay.result.books[0];
  if (book !== undefined && book.tally.cleanLandings > 0) kinds.push(`clean ×${book.tally.cleanLandings}`);
  return kinds.length === 0 ? '—' : kinds.join(', ');
}

/** A running tally of what a table cost, so the report can add it up. */
export class Tally {
  trials = 0;
  steps = 0;

  add(ride: TrickRide): TrickRide {
    this.trials += 1;
    this.steps += ride.steps;
    return ride;
  }

  addAttempt(value: FeatureAttempt): FeatureAttempt {
    this.trials += 1;
    this.steps += value.ride.steps;
    return value;
  }
}

// ---------------------------------------------------------------------------
// S1 — the per-feature event mix
// ---------------------------------------------------------------------------

/**
 * S1 — what each installed feature is worth, per attempt, at its own speeds.
 *
 * One row per feature × published approach speed × input recipe. The events
 * column is the referee's award attribution, not a second count; the points
 * column is `TrickRun`'s banked total for that one attempt. Misses and crashes
 * are in the sweep because §38.8 Phase 0 asks for them: a crashed attempt
 * banks nothing and says so.
 */
export function tableFeatureEventMix(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of featuresInLapOrder()) {
    for (const mph of feature.speeds) {
      for (const recipe of FEATURE_RECIPES) {
        const value = tally.addAttempt(attempt(feature, mph, recipe));
        const ride = value.ride;
        rows.push([
          feature.id,
          `${mph}`,
          recipe.label,
          ride.takeoffCharge.toFixed(3),
          `${ride.takeoffs}`,
          `${ride.touchdowns}`,
          tierText(ride),
          eventText(value.replay),
          zoneText(value),
          `${value.points}`,
          `${value.replay.result.books[0].breakdown.offZoneFlights}`,
          `${value.replay.result.books[0].breakdown.chargedHopsForfeited}`,
          `${value.replay.result.books[0].crashes}`,
          seconds(stepsToSeconds(ride.steps)),
          ride.reachedEnd ? 'merged' : `stopped at s = ${ride.finalS.toFixed(1)}`,
        ]);
      }
    }
  }

  return {
    id: 'S1',
    title: 'S1 — the event mix and the points each installed feature banks, per attempt',
    geometry: featuresInLapOrder().map((feature) =>
      `**${feature.id}** — ${feature.label}; lip at lap s = ${feature.lipS.toFixed(1)} m,`
      + ` window [${feature.spawnS.toFixed(1)}, ${feature.endS.toFixed(1)}] m,`
      + ` published speeds ${feature.speeds.join(' / ')} mph`),
    notes: [
      '**Every `points` cell was banked by `simulation/trickRun.ts`.** The recording is'
        + ' replayed through the shipped referee with the shipped value table and the clock'
        + ' set to the recording\'s own length, so the number is what that one attempt is'
        + ' worth and not where a 60/90/120 s deadline happened to fall inside it.',
      'Each attempt is placed on the feature\'s own corridor at the stated lip speed and the'
        + ' throttle holds it there — `docs/JUMP_BENCH.md` T11\'s protocol, unchanged. The'
        + ' press is delivered exactly as `app/Game.ts` delivers one and the on-time lead is'
        + ` \`${ON_TIME_STEPS}\` steps for a feature the rider LEAVES and \`apexStepsBeforeLip\``
        + ' for one they MOUNT.',
      '`Hop held` is the one-foot air: the Hop control\'s *level* stays held through the'
        + ' flight and `app/oneFootPose.ts` decides whether that qualified. `180 then'
        + ' re-hold` is the same flight with a 180 tapped on the way up — one physical'
        + ' control, so the tap drops the level for one step and the hold resumes.',
      '`events` is the referee\'s own attribution of what it paid for, read off its awards.'
        + ' `forfeited` is a charged hop the observer counted at the launch that never'
        + ' banked, which §38.3 requires to stay visible.',
      'A row can bank points on more than one flight: a ride to the merge keeps going, and'
        + ' a ledge or a staircase throws several. That is the attempt, honestly.',
      '**`launch zones` is q189, measured rather than assumed.** It is'
        + ' `trickZoneAt(plan.trickZones, x, z)` at the contact-patch XZ of the last grounded'
        + ' step before each takeoff — the ground the wheel actually left. Nothing in this'
        + ' bench tells it which feature the script was aiming at, which is what makes it a'
        + ' control on where the zones are. `off-zone` is'
        + ' `TrickBreakdown.offZoneFlights`: flights that carried trick kinds and launched'
        + ' from no zone, so `TRICK_RUN.featureLaunchRequired` paid them their landing and'
        + ' nothing for the tricks.',
      '**All nine features now launch their tricks from their own zone.** The two the rider'
        + ' MOUNTS — the skinny and the step-up, the `press: \'apex\'` features — did not at'
        + ' first: the hop that gets them on top of the deck leaves the approach corridor,'
        + ' and the zones were drawn over the decks alone, so their mounting flights were'
        + ' off-zone and banked their landings only. The level extended both zones back over'
        + ' their run-ups and this table is where that shows: `off-zone` is zero on every'
        + ' feature row that banks a trick.',
    ],
    columns: ['feature', 'lip mph', 'input', 'actual charge', 'takeoffs', 'touchdowns',
      'tiers', 'events banked', 'launch zones', 'points', 'off-zone', 'forfeited hops',
      'crashes', 'attempt s', 'exit'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S2 — cadence
// ---------------------------------------------------------------------------

/** The flat ground a standing hop is measured on — a bench fixture, not the park. */
function flatGround(): Fixture {
  return flatFixture('pavement', 400);
}

/** Stationary attack on the installed park; no fabricated zone or flat sampler. */
export function stationaryFeatureFixture(id: string): Fixture {
  const zone = PARK_PLAN.trickZones?.find((candidate) => candidate.id === id);
  if (zone === undefined) throw new Error(`Unknown trick feature: ${id}`);
  const x = zone.corners.reduce((sum, corner) => sum + corner.x, 0) / zone.corners.length;
  const z = zone.corners.reduce((sum, corner) => sum + corner.z, 0) / zone.corners.length;
  return {
    plan: PARK_PLAN,
    label: `stationary on ${id}`,
    lipS: null,
    geometry: ['The installed feature zone centre, at rest.'],
    endS: Number.POSITIVE_INFINITY,
    classify: () => 'other',
    spawnPose: { position: { x, y: 0, z }, headingY: 0 },
  };
}

/** The hop-loop scripts S2 and S3 both ride. */
export const HOP_LOOPS: readonly {
  readonly id: string;
  readonly label: string;
  readonly options: Omit<HopLoopOptions, 'steps'>;
}[] = [
  { id: 'plain', label: 'standing hop, nothing held', options: { charge: 'none', holdHop: false } },
  { id: 'charged', label: 'standing hop, fully charged', options: { charge: 'full', holdHop: false } },
  { id: 'oneFoot', label: 'standing hop, Hop held (one-foot air)', options: { charge: 'none', holdHop: true } },
  { id: 'chargedOneFoot', label: 'standing charged hop, Hop held', options: { charge: 'full', holdHop: true } },
  { id: 'spin', label: 'standing hop, 180 tapped', options: { charge: 'none', holdHop: false, spinTap: 'left' } },
  { id: 'everything', label: 'standing hop, 180 then re-hold', options: { charge: 'none', holdHop: true, spinTap: 'left' } },
  { id: 'chargedEverything', label: 'standing charged hop, 180 then re-hold', options: { charge: 'full', holdHop: true, spinTap: 'left' } },
];

/** The window every cadence row is measured over — 60 s of fixed steps. */
export const CADENCE_STEPS = durationStepsFor(60);

/**
 * S2 — how long it takes to be able to launch again.
 *
 * Three cadences, and §38.8 Phase 0 names all three: standing repeated hops on
 * flat ground, repeated attempts at one feature, and reset-assisted
 * repetition. The first is the controller's legality clock and is exact; the
 * other two are bounded honestly and the limitation is stated on the row.
 */
export function tableCadence(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const loop of HOP_LOOPS) {
    const ride = tally.add(recordHopLoop(
      `hop-loop-${loop.id}`,
      loop.label,
      flatGround(),
      TRICK_BENCH_WHEEL,
      { ...loop.options, steps: CADENCE_STEPS },
    ));
    const gaps = ride.takeoffGaps;
    const mean = gaps.length === 0 ? 0 : gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
    const shortest = gaps.length === 0 ? 0 : Math.min(...gaps);
    const replay = replayTrickRun([ride.recording], {
      ...SHIPPED_TRICK_RULES,
      durationSteps: CADENCE_STEPS,
    });
    rows.push([
      '(a) standing, flat ground',
      loop.label,
      `${ride.takeoffs}`,
      gaps.length === 0 ? '—' : seconds(stepsToSeconds(shortest)),
      gaps.length === 0 ? '—' : seconds(stepsToSeconds(mean)),
      `${ride.chargedHops}`,
      `${ride.spinsCompleted}`,
      `${ride.oneFootQualifications}`,
      tierText(ride),
      `${replay.scores[0]}`,
      rate(replay.scores[0] / stepsToSeconds(CADENCE_STEPS)),
      `${replay.result.books[0].breakdown.repeatAdjustment}`,
      `${replay.result.books[0].breakdown.repeatedFlights} of ${replay.result.books[0].flights}`,
    ]);
  }

  // (b) One feature, again. The bench rider does not steer, so the loop-back is
  //     not drivable: what is measured is the attempt itself, spawn to merge.
  for (const feature of featuresInLapOrder()) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const value = tally.addAttempt(attempt(feature, mph, FEATURE_RECIPES[3]));
    rows.push([
      '(b) one feature, again',
      `${feature.id} at ${mph} mph, ${FEATURE_RECIPES[3].label}`,
      `${value.ride.takeoffs}`,
      '—',
      seconds(stepsToSeconds(value.ride.steps)),
      `${value.ride.chargedHops}`,
      `${value.ride.spinsCompleted}`,
      `${value.ride.oneFootQualifications}`,
      tierText(value.ride),
      `${value.points}`,
      rate(value.points / stepsToSeconds(value.ride.steps)),
      `${value.replay.result.books[0].breakdown.repeatAdjustment}`,
      `${value.replay.result.books[0].breakdown.repeatedFlights} of ${value.replay.result.books[0].flights}`,
    ]);
  }

  // (c) Reset-assisted. The most generous reading: the rider is put back at the
  //     feature's own approach, not at the park's start.
  const settle = Math.round(0.5 * SIMULATION.hz);
  for (const id of ['gap', 'kicker', 'spinShelf']) {
    const feature = INSTALLED_FEATURES.find((candidate) => candidate.id === id);
    if (feature === undefined) continue;
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const ride = tally.add(recordResetLoop(
      `reset-${id}`,
      `${feature.label}, reset to its own approach`,
      feature,
      TRICK_BENCH_WHEEL,
      { mph, charge: 'full', holdHop: true, settleSteps: settle, steps: CADENCE_STEPS },
    ));
    const gaps = ride.takeoffGaps;
    const mean = gaps.length === 0 ? 0 : gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
    const replay = replayTrickRun([ride.recording], {
      ...SHIPPED_TRICK_RULES,
      durationSteps: CADENCE_STEPS,
    });
    rows.push([
      '(c) reset-assisted',
      `${feature.id} at ${mph} mph, reset ${seconds(stepsToSeconds(settle))} s after each landing`,
      `${ride.takeoffs}`,
      gaps.length === 0 ? '—' : seconds(stepsToSeconds(Math.min(...gaps))),
      gaps.length === 0 ? '—' : seconds(stepsToSeconds(mean)),
      `${ride.chargedHops}`,
      `${ride.spinsCompleted}`,
      `${ride.oneFootQualifications}`,
      tierText(ride),
      `${replay.scores[0]}`,
      rate(replay.scores[0] / stepsToSeconds(CADENCE_STEPS)),
      `${replay.result.books[0].breakdown.repeatAdjustment}`,
      `${replay.result.books[0].breakdown.repeatedFlights} of ${replay.result.books[0].flights}`,
    ]);
  }

  return {
    id: 'S2',
    title: 'S2 — cadence: how soon can the rider launch again, and what it pays',
    geometry: [],
    notes: [
      `Every (a) and (c) row is one continuous ${seconds(stepsToSeconds(CADENCE_STEPS))} s`
        + ' recording scored by the real referee over exactly that clock. The (b) rows are'
        + ' one attempt each, scored over their own length.',
      '**(a) is the controller\'s legality clock.** The ride presses Hop on every step'
        + ' `canAcceptHop` is true — after the charge hold where one is asked for — so the'
        + ' gap column is the shortest possible time between launches, not a human\'s.',
      '**(b) is the attempt, not the loop-back.** The bench driver rides straight windows and'
        + ' does not steer through a hairpin, so it cannot turn the rider round and ride the'
        + ' same kicker again. What is measured instead is the honest lower bound on a'
        + ' repeat: the approach, the flight, the landing and the ride out to the merge.'
        + ' A real loop-back costs that plus the corner and the ride back.',
      '**(c) resets to the feature\'s own approach**, stationary at the window\'s start speed,'
        + ' which is more generous than the game\'s quick reset (the park\'s start is one'
        + ' corridor, not nine). The reset step integrates nothing and carries `reset: true`,'
        + ' exactly as `Game`\'s early return writes it; the referee answers by discarding'
        + ' the pending flight, which is why a reset costs the flight it interrupts.',
      '**A cadence is now also a price.** `repeat cost` is `TrickBreakdown.repeatAdjustment`,'
        + ' the points diminishing repeats took off this line (q185); a launch inside'
        + ` \`TRICK_RUN.repeatWindowSeconds\` of the last time the same kind banked pays`
        + ' a fraction of it. The fast cadences are exactly the ones it bites.',
      'On a (b) row the gap column is the **attempt** — spawn to merge — because there is'
        + ' only one attempt in it to measure a gap between.',
      `A charged hop needs \`${FULL_CHARGE_STEPS}\` grounded steps of held crouch to latch`
        + ` \`TRICKS.chargedHopMinCharge\` = ${TRICKS.chargedHopMinCharge}, and that hold is`
        + ' why the charged cadences are slower than the plain ones.',
    ],
    columns: ['cadence', 'line', 'launches', 'shortest gap s', 'mean gap / attempt s',
      'charged hops',
      '180s landed', 'one-foot airs', 'tiers', 'points', 'points/s', 'repeat cost',
      'repeated flights'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// The routed line, spliced
// ---------------------------------------------------------------------------

/** One feature's place in a routed lap: the attempt, and the corridor to the next. */
export interface RoutedLeg {
  readonly attempt: FeatureAttempt;
  /** Metres of connective corridor before this feature's window opens. */
  readonly connectiveMetres: number;
  readonly connectiveSteps: number;
}

/**
 * The routed technical line, as the best each feature measured.
 *
 * For each feature in lap order, the attempt that banked the most points among
 * the measured recipes at the measured speeds — ties broken by the shorter
 * attempt — and then the corridor between one window's merge and the next
 * window's start, ridden at the next feature's own approach speed. That splice
 * is the proxy §38.8 Phase 0 allows and this bench states: there is no full-lap
 * driver, because the bench rider does not steer.
 */
/**
 * How a routed lap picks its attempt at each feature.
 *
 * `points` is the greediest line that still rides on — what a rider chasing a
 * number does. `rate` is the briskest — the attempt with the best points per
 * second of lap, which is the line a clock rewards. Both are reported, because
 * q182 is a question about lap *time* and q185 is a question about points.
 */
export type RouteSelector = 'points' | 'rate';

const routedCache = new Map<RouteSelector, readonly RoutedLeg[]>();
const routedCost = { trials: 0, steps: 0 };
let routedRidden = false;

export function routedLine(
  selector: RouteSelector = 'points',
  tally?: Tally,
): readonly RoutedLeg[] {
  const cached = routedCache.get(selector);
  if (cached !== undefined) {
    if (tally !== undefined && !routedRidden) {
      tally.trials += routedCost.trials;
      tally.steps += routedCost.steps;
      routedRidden = true;
    }
    return cached;
  }
  const cost = new Tally();
  const legs: RoutedLeg[] = [];
  const order = featuresInLapOrder();
  let previousEnd = order[order.length - 1].endS - PARK_LAP_METRES;
  for (const feature of order) {
    const metres = Math.max(0, feature.spawnS - previousEnd);
    let best: FeatureAttempt | null = null;
    let bestConnective = 0;
    let bestScore = -Infinity;
    for (const mph of feature.speeds) {
      for (const recipe of FEATURE_RECIPES) {
        const value = cost.addAttempt(attempt(feature, mph, recipe));
        // **Only an attempt that rode on can be a leg of a lap.** A ride that
        // ended in the air, or that never reached the window's merge — every
        // 180, which exits fakie — is a measurement of that feature and not a
        // step of a lap. The 180's own worth is S1's and S5's business.
        if (value.ride.endsAirborne || !value.ride.reachedEnd) continue;
        const connective = Math.round(
          metres / (Math.max(1, value.mph) * METRES_PER_SECOND_PER_MPH) / STEP_SECONDS,
        );
        const legSteps = value.ride.steps + connective;
        const score = selector === 'points'
          ? value.points
          : value.points / Math.max(1, stepsToSeconds(legSteps));
        if (best === null || score > bestScore
          || (score === bestScore && legSteps < best.ride.steps + bestConnective)) {
          best = value;
          bestScore = score;
          bestConnective = connective;
        }
      }
    }
    if (best === null) continue;
    legs.push({ attempt: best, connectiveMetres: metres, connectiveSteps: bestConnective });
    previousEnd = feature.endS;
  }
  routedCache.set(selector, legs);
  routedCost.trials += cost.trials;
  routedCost.steps += cost.steps;
  if (tally !== undefined) {
    tally.trials += cost.trials;
    tally.steps += cost.steps;
    routedRidden = true;
  }
  return legs;
}

/** The routed lap as one seat's fact stream, spliced from its legs. */
export function routedRecording(legs: readonly RoutedLeg[], laps: number): TrickRecording {
  const parts: SplicePart[] = [];
  for (let lap = 0; lap < laps; lap += 1) {
    for (const leg of legs) {
      // The connective corridor is quiet time *before* the window, so it is
      // appended to the previous part. The first leg of the first lap carries
      // its own lead-in, which is the wrap from the last feature.
      parts.push({ recording: leg.attempt.ride.recording, fillerSteps: 0 });
      parts.push({
        recording: {
        id: 'connective', label: 'connective corridor', source: 'spliced', steps: [], zones: [],
      },
        fillerSteps: leg.connectiveSteps,
      });
    }
  }
  return spliceRecordings('routed', 'the routed technical line (spliced proxy)', parts);
}

/** The bypass lap: the same endpoints, on the other lateral half, no press. */
export function bypassRecording(tally?: Tally): TrickRecording {
  const parts: SplicePart[] = [];
  const order = featuresInLapOrder();
  let previousEnd = order[order.length - 1].endS - PARK_LAP_METRES;
  for (const feature of order) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const ride = recordRide(
      `bypass-${feature.id}`,
      `${feature.label}, bypassed`,
      bypassFixture(feature),
      TRICK_BENCH_WHEEL,
      {
        targetMph: mph,
        startMph: mph,
        lipS: null,
        hopStepsFromLip: null,
        charge: 'none',
        maxSteps: 4000,
        rideThroughCrash: true,
      },
    );
    tally?.add(ride);
    const metres = Math.max(0, feature.spawnS - previousEnd);
    parts.push({ recording: ride.recording, fillerSteps: 0 });
    parts.push({
      recording: {
        id: 'connective', label: 'connective corridor', source: 'spliced', steps: [], zones: [],
      },
      fillerSteps: Math.round(metres / (mph * METRES_PER_SECOND_PER_MPH) / STEP_SECONDS),
    });
    previousEnd = feature.endS;
  }
  return spliceRecordings('bypass', 'the safe/bypass line (spliced proxy)', parts);
}

// ---------------------------------------------------------------------------
// S3 — points per 60 / 90 / 120 s, and q185
// ---------------------------------------------------------------------------

/**
 * S3 — the five lines, scored against each candidate clock.
 *
 * This is q185's evidence. Every cell is one recording handed to the real
 * referee with `durationSteps` set to the candidate, so the deadline, the
 * sweep and the banking are the shipped ones and only the clock moves.
 */
/** One scored line: a label and the seat-0 fact stream that is that line. */
export interface ScoringLine {
  readonly id: string;
  readonly label: string;
  readonly recording: TrickRecording;
}

let linesCache: readonly ScoringLine[] | null = null;
const linesCost = { trials: 0, steps: 0 };
let linesCharged = false;

/**
 * Every line S3 and S7 score, ridden once.
 *
 * Two routings of the park, the bypass, the seven stationary loops, the best
 * single feature back to back and two reset-assisted loops. Cached, because
 * both tables score the same recordings and re-riding them would be a second
 * measurement of the same thing.
 */
export function scoringLines(tally?: Tally): readonly ScoringLine[] {
  if (linesCache !== null) {
    if (tally !== undefined && !linesCharged) {
      tally.trials += linesCost.trials;
      tally.steps += linesCost.steps;
      linesCharged = true;
    }
    return linesCache;
  }
  const cost = new Tally();
  const legs = routedLine('points', cost);
  const brisk = routedLine('rate', cost);
  const longest = durationStepsFor(DURATION_CANDIDATES[DURATION_CANDIDATES.length - 1]);
  const lapStepsOf = (route: readonly RoutedLeg[]): number => route.reduce(
    (total, leg) => total + leg.attempt.ride.steps + leg.connectiveSteps,
    0,
  );
  const lapsFor = (route: readonly RoutedLeg[]): number =>
    Math.max(1, Math.ceil(longest / Math.max(1, lapStepsOf(route))));
  const routed = routedRecording(legs, lapsFor(legs));
  const bypass = bypassRecording(cost);

  const lines: ScoringLine[] = [
    {
      id: 'routed',
      label: `the routed technical line, greediest (spliced proxy, ${seconds(stepsToSeconds(lapStepsOf(legs)))} s a lap)`,
      recording: routed,
    },
    {
      id: 'brisk',
      label: `the routed technical line, briskest (spliced proxy, ${seconds(stepsToSeconds(lapStepsOf(brisk)))} s a lap)`,
      recording: routedRecording(brisk, lapsFor(brisk)),
    },
    { id: 'bypass', label: 'the safe / bypass line (spliced proxy)', recording: bypass },
  ];

  const shuttle = recordTrickShuttle(longest);
  cost.trials += 1;
  cost.steps += shuttle.recording.steps.length;
  lines.push({ id: shuttle.recording.id, label: shuttle.recording.label, recording: shuttle.recording });

  for (const loop of HOP_LOOPS) {
    const ride = cost.add(recordHopLoop(
      `farm-${loop.id}`,
      loop.label,
      flatGround(),
      TRICK_BENCH_WHEEL,
      { ...loop.options, steps: durationStepsFor(DURATION_CANDIDATES[DURATION_CANDIDATES.length - 1]) },
    ));
    lines.push({ id: `stand-${loop.id}`, label: `stationary farming — ${loop.label}`, recording: ride.recording });
  }

  // A zone gate must be attacked from INSIDE a zone. Flat fixtures cannot
  // reveal a stationary farmer camping on a feature. Idle time is simulated,
  // and the continuous recording includes every legal hop and landing.
  for (const [id, interval] of [
    ['continuous', 0],
    ['paced', Math.round((SHIPPED_TRICK_RULES.repeatWindowSeconds + 0.5) * SIMULATION.hz)],
  ] as const) {
    const ride = cost.add(recordHopLoop(
      `feature-camp-${id}`,
      `${id} stationary hops inside the ledge zone`,
      stationaryFeatureFixture('ledge'),
      TRICK_BENCH_WHEEL,
      { charge: 'none', holdHop: true, spinTap: 'left',
        launchIntervalSteps: interval, steps: longest },
    ));
    lines.push({ id: `feature-camp-${id}`, label: ride.recording.label, recording: ride.recording });
  }

  // **Rotating the timber corridor** — the cheapest answer to per-feature
  // clocks, and the one worth measuring: three different features within
  // fifty-five metres of each other, so a rider can visit all three and come
  // back without ever loading one clock twice in a row. The return leg is the
  // same fifty-five metres ridden back at the rotation's own approach speed,
  // counted as quiet time; the bench rider does not turn round, so this is a
  // spliced proxy on the same terms as the routed lap.
  {
    // Measured per feature rather than taken from the routed legs, because the
    // staircase has no attempt that reaches its merge and is therefore not a
    // leg of a lap — but a rider rotating three features rides it and turns
    // round, so it belongs in this line.
    const rotation = ['skinny', 'stepUp', 'stairs'].map((id) => {
      const feature = INSTALLED_FEATURES.find((candidate) => candidate.id === id);
      if (feature === undefined) return null;
      // **The same rule the routed lap uses**, so the two lines are comparable:
      // an attempt that rode on to its merge. A 180 exits fakie and reaches no
      // merge, so it is out of this line exactly as it is out of a lap. The
      // staircase has no attempt that reaches its merge at any published
      // speed, so it falls back to its best attempt that at least lands — and
      // the label says the rotation is a proxy.
      let best: FeatureAttempt | null = null;
      let fallback: FeatureAttempt | null = null;
      for (const mph of feature.speeds) {
        for (const recipe of FEATURE_RECIPES) {
          const value = cost.addAttempt(attempt(feature, mph, recipe));
          if (value.ride.endsAirborne) continue;
          if (fallback === null || value.points > fallback.points) fallback = value;
          if (!value.ride.reachedEnd) continue;
          if (best === null || value.points > best.points
            || (value.points === best.points && value.ride.steps < best.ride.steps)) best = value;
        }
      }
      return best ?? fallback;
    }).filter((value): value is FeatureAttempt => value !== null);
    if (rotation.length === 3) {
      const first = rotation[0].feature;
      const last = rotation[rotation.length - 1].feature;
      const returnMetres = Math.max(0, last.endS - first.spawnS);
      const returnSpeed = Math.max(1, rotation[0].mph) * METRES_PER_SECOND_PER_MPH;
      const returnSteps = Math.round(returnMetres / returnSpeed / STEP_SECONDS);
      const cycle: SplicePart[] = [];
      let previousEnd = first.spawnS;
      for (const leg of rotation) {
        const connective = Math.max(0, leg.feature.spawnS - previousEnd);
        cycle.push({
          recording: {
            id: 'connective', label: 'connective', source: 'spliced', steps: [], zones: [],
          },
          fillerSteps: Math.round(
            connective / (Math.max(1, leg.mph) * METRES_PER_SECOND_PER_MPH) / STEP_SECONDS,
          ),
        });
        cycle.push({ recording: leg.ride.recording, fillerSteps: 0 });
        previousEnd = leg.feature.endS;
      }
      cycle.push({
        recording: {
          id: 'return', label: 'the ride back', source: 'spliced', steps: [], zones: [],
        },
        fillerSteps: returnSteps,
      });
      const cycleSteps = cycle.reduce(
        (total, part) => total + part.recording.steps.length + part.fillerSteps,
        0,
      );
      const laps = Math.max(1, Math.ceil(longest / Math.max(1, cycleSteps)));
      const parts: SplicePart[] = [];
      for (let lap = 0; lap < laps; lap += 1) parts.push(...cycle);
      lines.push({
        id: 'timber-rotation',
        label: `rotating the timber corridor — ${rotation.map((leg) => leg.feature.id).join(' → ')}`
          + ` and back, ${seconds(stepsToSeconds(cycleSteps))} s a round`,
        recording: spliceRecordings('timber-rotation', 'rotating the timber corridor', parts),
      });
    }
  }

  // Single-feature farming: the best single attempt, repeated back to back with
  // no corner in between — the optimistic bound on riding one feature forever.
  let bestLeg = legs[0];
  for (const leg of legs) if (leg.attempt.points > bestLeg.attempt.points) bestLeg = leg;
  const singleFeature = repeatRecording(
    'single-feature',
    `single-feature farming — ${bestLeg.attempt.feature.id}, back to back`,
    bestLeg.attempt.ride.recording,
    Math.max(1, Math.ceil(durationStepsFor(120) / Math.max(1, bestLeg.attempt.ride.steps))),
    0,
  );
  lines.push({
    id: 'single-feature',
    label: `single-feature farming — ${bestLeg.attempt.feature.id} back to back, no corner`,
    recording: singleFeature,
  });

  const settle = Math.round(0.5 * SIMULATION.hz);
  for (const id of ['gap', 'kicker']) {
    const feature = INSTALLED_FEATURES.find((candidate) => candidate.id === id);
    if (feature === undefined) continue;
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const ride = cost.add(recordResetLoop(
      `reset-farm-${id}`,
      `${feature.label}, reset-assisted`,
      feature,
      TRICK_BENCH_WHEEL,
      { mph, charge: 'full', holdHop: true, settleSteps: settle, steps: durationStepsFor(120) },
    ));
    lines.push({
      id: `reset-${id}`,
      label: `reset-assisted farming — ${feature.id} at ${mph} mph`,
      recording: ride.recording,
    });
  }

  // **The rest-cycling farmer**, which is the line diminishing repeats leaves
  // standing: burst until the marginal award rounds to zero, then wait out
  // `repeatWindowSeconds` doing nothing, then burst again. The burst is cut at
  // the last award that was still worth a point, which is the optimal length —
  // a farmer who kept going would be spamming for nothing.
  const restSteps = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz) + 60;
  for (const id of ['farm-everything', 'reset-farm-gap']) {
    const source = lines.find((line) => line.recording.id === id);
    if (source === undefined) continue;
    const scored = scoreRecording(source.recording);
    let burst = source.recording.steps.length;
    for (let index = scored.awards.length - 1; index >= 0; index -= 1) {
      if (scored.awards[index].points > 0) {
        burst = scored.awardSteps[index] + 1;
        break;
      }
    }
    const cycle = Math.max(1, burst) + restSteps;
    lines.push({
      id: `rest-${id}`,
      label: `rest-cycled farming — ${source.label.replace(/^[a-z-]+ farming — /, '')}`
        + `, ${seconds(stepsToSeconds(burst))} s burst then`
        + ` ${seconds(stepsToSeconds(restSteps))} s idle`,
      recording: repeatRecording(
        `rest-${id}`,
        'rest-cycled',
        {
          ...source.recording,
          steps: source.recording.steps.slice(0, burst),
          zones: source.recording.zones.slice(0, burst),
        },
        Math.max(1, Math.ceil(longest / cycle)),
        restSteps,
      ),
    });
  }

  // **The paced hopper** — one flight every so often, and nothing in between.
  // The residual the owner's fade is aimed at: a rider who never spams but
  // never rides either, spacing landings just past the window (and at twice
  // it) so the fade has time to give the value back.
  {
    const source = lines.find((line) => line.recording.id === 'farm-everything');
    if (source !== undefined) {
      const scored = scoreRecording(source.recording);
      // One flight: cut at the first award, which is its touchdown.
      const burst = scored.awardSteps.length === 0
        ? source.recording.steps.length
        : scored.awardSteps[0] + 1;
      const one: TrickRecording = {
        ...source.recording,
        steps: source.recording.steps.slice(0, burst),
        zones: source.recording.zones.slice(0, burst),
      };
      const windowSteps = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz);
      for (const [id, gapSteps] of [
        ['paced-window', windowSteps + Math.round(0.5 * SIMULATION.hz)],
        ['paced-double', windowSteps * 2],
      ] as const) {
        lines.push({
          id,
          label: `paced hopping — one hop + 180 + one-foot every`
            + ` ${seconds(stepsToSeconds(gapSteps))} s, standing still between`,
          recording: repeatRecording(
            id,
            'paced',
            one,
            Math.max(1, Math.ceil(longest / gapSteps)),
            Math.max(0, gapSteps - burst),
          ),
        });
      }
    }
  }

  linesCache = lines;
  linesCost.trials = cost.trials;
  linesCost.steps = cost.steps;
  if (tally !== undefined) {
    tally.trials += cost.trials;
    tally.steps += cost.steps;
    linesCharged = true;
  }
  return lines;
}

/**
 * S3 — the lines, scored against each candidate clock.
 *
 * This is q185's evidence, now with the owner's answer to it in the referee.
 * Every cell is one recording handed to the real referee with `durationSteps`
 * set to the candidate, so the deadline, the sweep, the banking and the
 * diminishing repeats are the shipped ones and only the clock moves.
 */
export function tableLineRates(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const lines = scoringLines(tally);
  const legs = routedLine('points');
  const brisk = routedLine('rate');
  const lapStepsOf = (route: readonly RoutedLeg[]): number => route.reduce(
    (total, leg) => total + leg.attempt.ride.steps + leg.connectiveSteps,
    0,
  );

  for (const line of lines) {
    const cells: string[] = [line.label];
    for (const duration of DURATION_CANDIDATES) {
      const replay = replayTrickRun([fitRecording(line.recording, durationStepsFor(duration))], {
        ...SHIPPED_TRICK_RULES,
        durationSteps: durationStepsFor(duration),
      });
      const book = replay.result.books[0];
      cells.push(`${replay.scores[0]}`);
      if (duration === DURATION_CANDIDATES[DURATION_CANDIDATES.length - 1]) {
        cells.push(rate(replay.scores[0] / duration));
        cells.push(`${book.flights}`);
        cells.push(`${book.tally.chargedHops}/${book.tally.spinsLanded}/${book.tally.oneFootAirs}/${book.tally.cleanLandings}`);
        cells.push(`${book.breakdown.repeatAdjustment}`);
        cells.push(`${book.breakdown.repeatedFlights} of ${book.flights}`);
        cells.push(`${book.crashes}`);
      }
    }
    rows.push(cells);
  }

  return {
    id: 'S3',
    title: 'S3 — points per 60 / 90 / 120 s, by line (q185)',
    geometry: [
      `The routed lap splices ${legs.length} feature windows and`
      + ` ${legs.reduce((total, leg) => total + leg.connectiveMetres, 0).toFixed(0)} m of`
      + ` connective corridor: ${seconds(stepsToSeconds(lapStepsOf(legs)))} s a lap greediest,`
      + ` ${seconds(stepsToSeconds(lapStepsOf(brisk)))} s briskest.`,
      `The park's lap is ${PARK_LAP_METRES.toFixed(1)} m; the spliced windows overlap`
      + ' where two features share a corridor, so the proxy lap is slightly longer than a'
      + ' ridden one and the routed line is if anything flattered downward.',
    ],
    notes: [
      '**Every cell is the shipped referee\'s total**, with `durationSteps` set to the'
        + ' candidate and every other value shipped. The deadline, the final-step sweep and'
        + ' the forfeits are the run\'s own.',
      '**The routed and bypass rows are spliced proxies and nothing stronger.** The bench'
        + ' rider does not steer, so a lap is measured as its straight windows laid end to'
        + ' end with the connective corridor counted as quiet time at the next feature\'s'
        + ' approach speed. Flight identity is renumbered across the splice so no attempt'
        + ' can land another attempt\'s flight, and every spliced part ends on the ground.',
      '**The stationary rows are not a proxy.** They are one continuous recording of a rider'
        + ' who never moves. Feature-camp rows start inside the installed ledge zone;'
        + ' they omit travel from the run start and are an upper bound on time available there.',
      '**The continuous two-zone shuttle starts at the normal solo run start.** It rides'
        + ' to the timber corridor and alternates stopped spin-plus-one-foot hops between'
        + ' the skinny and step-up launch zones, roughly three metres apart. No resets,'
        + ' teleports, synthetic scoring facts or omitted travel; `tests/m38-review.spec.ts`'
        + ' replays its inputs through the browser and checks the saved personal best.'
        + ' This is a known balance weakness (q191), not a balance acceptance.',
      'A feature appears in a routed lap only if some measured attempt at it reached the'
        + ' window\'s merge. The staircase has no such attempt at any of its published'
        + ' speeds — a hop off the top tread above 15 mph clears all nine metres and leaves'
        + ' the corridor, and the slower rows stop inside it — so a routed lap here visits'
        + ' eight of the nine features and the ninth is S1\'s business.',
      'The `events` column is `charged hops / 180s landed / one-foot airs / clean landings`'
        + ' at 120 s, as the referee\'s own tally reports them.',
      '**Rapid continuous farming saturates.** Every unpaced stationary, feature-camp,'
        + ' single-feature and reset-assisted row banks the same total at 60, 90 and 120 s: a'
        + ' rider who never leaves a feature\'s window halves that feature\'s whole flight'
        + ' value on every landing until the rounding takes it to zero, and it never recovers'
        + ' while the spam continues. After about a dozen flights the rule is an absolute cap'
        + ' rather than a slowdown.',
      '**The paced rows are the residual the per-feature keying is aimed at**, and the two'
        + ' kinds of paced row now answer differently. Paced hopping on FLAT ground is stopped'
        + ' by q189\'s zone gate, not by the clock: it banks its clean landings and nothing'
        + ' else. Paced hopping INSIDE a feature\'s zone is stopped by neither — one flight'
        + ' per `repeatWindowSeconds + 0.5 s` from the same feature pays full value with a'
        + ' repeat cost of exactly zero, which is what a minute of rest per feature buys.'
        + ' S7 prices both.',
      '**The rest-cycled rows are what the owner\'s FADE was added for** (2026-09-13, second'
        + ' decision). A farmer who bursts until the marginal award rounds to zero, waits'
        + ` out \`repeatWindowSeconds\` and bursts again used to get the full value back every`
        + ' cycle. With the fade a run of repeats loses only one level per'
        + ' `repeatFadeSeconds` of rest, so one window of idling buys one level back and'
        + ' not a dozen. S7 prices it. Their burst lengths here are the optimal ones — cut'
        + ' at the last award still worth a point.',
      '**The timber rotation is what the per-feature keying costs to work around.** Three'
        + ' different features within fifty-five metres, ridden in turn and back, so no'
        + ' clock is loaded twice in a row. It is measured on the routed lap\'s own rule —'
        + ' an attempt that rode on to its merge, which excludes every 180 — and the'
        + ' staircase, which has no such attempt, falls back to its best landing attempt.',
      '**`repeat cost` is the owner\'s q185 answer, priced.** It is'
        + ' `TrickBreakdown.repeatAdjustment` — the signed, never positive difference'
        + ' diminishing repeats made to the total — and `repeated` is'
        + ' `repeatedFlights` of `flights`. Since 2026-09-14 the clock it moves is the'
        + ' **launch feature\'s**, and the whole flight — tricks, bonus and clean landing —'
        + ' is scaled by one factor. S7 isolates each of the three rules in turn.',
    ],
    columns: ['line', ...DURATION_CANDIDATES.map((duration) => `${duration} s points`),
      'points/s at 120 s', 'flights at 120 s', 'events at 120 s', 'repeat cost at 120 s',
      'repeated at 120 s', 'crashes at 120 s'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S7 — the diminishing-repeat rule, isolated
// ---------------------------------------------------------------------------

/** The shipped rules with q185's rule switched off. `0` disables the window. */
export const NO_REPEAT_RULES: TrickRunRules = Object.freeze({
  ...SHIPPED_TRICK_RULES,
  repeatWindowSeconds: 0,
});

/**
 * The shipped rules with the owner's **fade** off and the window still on.
 *
 * `repeatFadeSeconds: 0` is the referee's own documented reproduction of the
 * behaviour before 2026-09-13's second decision: a kind's run of repeats is
 * forgotten entirely the moment the window passes, rather than one level per
 * `repeatFadeSeconds` of rest. Scoring a line through all three tells the
 * window's effect apart from the fade's.
 */
export const NO_FADE_RULES: TrickRunRules = Object.freeze({
  ...SHIPPED_TRICK_RULES,
  repeatFadeSeconds: 0,
});

/**
 * The shipped rules with q189's feature-launch gate off.
 *
 * `featureLaunchRequired: 0` is the referee's own documented reproduction of
 * the behaviour before the owner's 2026-09-13 zone decision: a flight banks
 * its tricks wherever it launched from. Scoring a line with and without it
 * isolates the gate from the repeat window and from the fade.
 */
export const NO_ZONE_GATE_RULES: TrickRunRules = Object.freeze({
  ...SHIPPED_TRICK_RULES,
  featureLaunchRequired: 0,
});

/** The clock S7 isolates the rule at. */
export const REPEAT_TABLE_SECONDS = 90;

/**
 * S7 — the same recordings, with the rule and without it.
 *
 * The owner chose diminishing repeats for q185 on 2026-09-13 and the referee
 * implements it. This table is the rule's own price list: every line S3 scores,
 * scored twice through the **same** referee — once with `SHIPPED_TRICK_RULES`
 * and once with a copy whose `repeatWindowSeconds` is zero, which is the
 * referee's own documented off switch. Nothing else differs, so the two columns
 * are the rule and only the rule.
 *
 * The last two columns are the question the routing turns on: how far apart a
 * line's awards fall, and how many flights the referee actually docked.
 */
export function tableRepeatRule(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const steps = durationStepsFor(REPEAT_TABLE_SECONDS);

  for (const line of scoringLines(tally)) {
    const fitted = fitRecording(line.recording, steps);
    const shipped = replayTrickRun([fitted], { ...SHIPPED_TRICK_RULES, durationSteps: steps });
    const off = replayTrickRun([fitted], { ...NO_REPEAT_RULES, durationSteps: steps });
    // The third pass isolates the owner's FADE from the window: the same rule
    // with `repeatFadeSeconds: 0`, which the referee documents as the old
    // reset behaviour — a kind's run of repeats is forgotten entirely the
    // moment the window passes, instead of one level per fade.
    const noFade = replayTrickRun([fitted], { ...NO_FADE_RULES, durationSteps: steps });
    // The fourth pass isolates q189's feature-launch gate: the shipped rules
    // with `featureLaunchRequired: 0`, which the referee documents as the
    // behaviour before the owner's zone decision.
    const noGate = replayTrickRun([fitted], { ...NO_ZONE_GATE_RULES, durationSteps: steps });
    const book = shipped.result.books[0];
    // **Per FEATURE, since 2026-09-14.** The clocks are keyed on the launch
    // zone, so the interval that decides a repeat is the one between two
    // paying flights **from the same feature** — a lap that visits eight
    // different features in ninety seconds loads eight different clocks and
    // the intervals between them decide nothing. Off-feature flights share
    // one clock of their own, which is how a flat clean landing still decays.
    const lastPaid = new Map<string, number>();
    const gaps: number[] = [];
    shipped.awards.forEach((award, index) => {
      if (award.points === 0 && !award.repeated) return;
      const key = award.zone ?? 'off-feature';
      const previous = lastPaid.get(key);
      if (previous !== undefined) gaps.push(shipped.awardSteps[index] - previous);
      lastPaid.set(key, shipped.awardSteps[index]);
    });
    const shortest = gaps.length === 0 ? 0 : Math.min(...gaps);
    const inside = gaps.filter(
      (gap) => gap <= Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz),
    ).length;
    rows.push([
      line.label,
      `${off.scores[0]}`,
      `${noFade.scores[0]}`,
      `${noGate.scores[0]}`,
      `${shipped.scores[0]}`,
      off.scores[0] === 0 ? '—' : `${(100 * (1 - shipped.scores[0] / off.scores[0])).toFixed(1)} %`,
      `${shipped.scores[0] - noFade.scores[0]}`,
      `${shipped.scores[0] - noGate.scores[0]}`,
      `${book.breakdown.offZoneFlights}`,
      `${book.breakdown.repeatAdjustment}`,
      `${book.breakdown.repeatedFlights} of ${book.flights}`,
      `${shipped.awards.length}`,
      gaps.length === 0 ? '—' : seconds(stepsToSeconds(shortest)),
      gaps.length === 0 ? '—' : `${inside} of ${gaps.length}`,
    ]);
  }

  // **The spacing the rule's premise rests on**, measured on the proxy: the
  // interval between one leg's last banked award and the next leg's first.
  const windowSteps = Math.round(SHIPPED_TRICK_RULES.repeatWindowSeconds * SIMULATION.hz);
  const spacing: string[] = [];
  for (const selector of ['points', 'rate'] as const) {
    const route = routedLine(selector);
    const first: number[] = [];
    const last: number[] = [];
    let offset = 0;
    for (const leg of route) {
      const marks = leg.attempt.replay.awardSteps;
      first.push(offset + (marks.length === 0 ? Number.NaN : marks[0]));
      last.push(offset + (marks.length === 0 ? Number.NaN : marks[marks.length - 1]));
      offset += leg.attempt.ride.steps + leg.connectiveSteps;
    }
    const parts: string[] = [];
    let tight = 0;
    for (let index = 1; index < route.length; index += 1) {
      const gap = first[index] - last[index - 1];
      if (!Number.isFinite(gap)) continue;
      if (gap <= windowSteps) tight += 1;
      parts.push(`${route[index - 1].attempt.feature.id}→${route[index].attempt.feature.id}`
        + ` ${seconds(stepsToSeconds(gap))} s${gap <= windowSteps ? ' **inside**' : ''}`);
    }
    spacing.push(`**${selector === 'points' ? 'greediest' : 'briskest'} feature-to-feature`
      + ` spacing** — ${tight} of ${parts.length} transitions fall inside the`
      + ` ${SHIPPED_TRICK_RULES.repeatWindowSeconds} s window: ${parts.join('; ')}.`);
  }

  return {
    id: 'S7',
    title: `S7 — the diminishing-repeat rule, isolated (q185, at ${REPEAT_TABLE_SECONDS} s)`,
    geometry: spacing,
    notes: [
      '**All four columns come out of the same referee.** `no repeat rule` is'
        + ' `SHIPPED_TRICK_RULES` with `repeatWindowSeconds: 0`; `window only (no fade)` is'
        + ' the shipped rules with `repeatFadeSeconds: 0`; `no zone gate` is the shipped'
        + ' rules with `featureLaunchRequired: 0`; `shipped` is the table as it ships. All'
        + ' three alternates are switches the referee documents itself, and every other'
        + ' value — points, multipliers, bonus, decay, floor — is the shipped one.',
      '**`what the zone gate took` is q189, priced** (the owner\'s 2026-09-13 decision):'
        + ' the shipped total less the no-gate total. It is zero on a line whose flights all'
        + ' launch from a feature and it is nearly the whole total on a line that never'
        + ' leaves flat ground — and `off-zone flights` is the referee\'s own count of'
        + ' flights that carried trick kinds and launched from nowhere.',
      '**`what the fade took` is the owner\'s second decision, priced** (2026-09-13): the'
        + ' shipped total less the no-fade total. It is zero on a line that never rests,'
        + ' because a rider inside the window fades nothing; it is negative on every line'
        + ' with rest in it, because a run that used to be forgotten outright now only'
        + ' loses one level per `repeatFadeSeconds` of that rest.',
      `The rule is \`repeatWindowSeconds\` = ${SHIPPED_TRICK_RULES.repeatWindowSeconds} s,`
        + ` \`repeatDecay\` = ${SHIPPED_TRICK_RULES.repeatDecay},`
        + ` \`repeatFloor\` = ${SHIPPED_TRICK_RULES.repeatFloor}. A kind landed again inside`
        + ' the window pays half, then a quarter, and so on, on its own clock; a landing'
        + ' outside the window pays according to the repeat levels remaining after fade. The flight bonus'
        + ' and the clean-landing award are kinds too.',
      '**The last two columns are the routing question, and since 2026-09-14 they are read'
        + ' per FEATURE.** The clocks are keyed on the launch zone, so what decides a repeat'
        + ' is the interval between two paying flights **from the same feature** — a lap that'
        + ' visits eight different features in ninety seconds loads eight different clocks,'
        + ' and the gaps between them decide nothing at all. Off-feature flights share one'
        + ' clock of their own, which is how a flat clean landing still decays.',
      '**The routed dock is now small, and what is left of it is inside single features.**'
        + ' A lap comes back to the same feature only once a lap, which is longer than'
        + ` \`repeatWindowSeconds\` = ${SHIPPED_TRICK_RULES.repeatWindowSeconds} s — so a`
        + ' second lap pays in full. What still docks a routed rider is a feature that'
        + ' throws two or three touchdowns a fraction of a second apart out of its own zone:'
        + ' the ledge, the gap and the rock rhythm each land more than once inside their own'
        + ' window, and the second and third landings are repeats of that feature.',
      '**The timber rotation is the line this keying was worth measuring against.** Three'
        + ' different features inside fifty-five metres, so a rider can visit all three and'
        + ' come back without loading one clock twice in a row. Its row is measured with the'
        + ' same rule the routed lap uses — an attempt that rode on to its merge, which'
        + ' excludes every 180 because a 180 exits fakie; the staircase has no such attempt'
        + ' at any published speed and falls back to its best landing attempt.',
    ],
    columns: ['line', `no repeat rule, ${REPEAT_TABLE_SECONDS} s`,
      'window only (no fade)', 'no zone gate', `shipped, ${REPEAT_TABLE_SECONDS} s`,
      'docked vs no repeat rule', 'what the fade took', 'what the zone gate took',
      'off-zone flights', 'repeat cost', 'repeated flights', 'awards',
      'shortest SAME-feature gap s', 'same-feature gaps inside the window'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S8 — air time, and a bench-side what-if
// ---------------------------------------------------------------------------

/**
 * A candidate air-time ramp. **Not the referee's formula and not proposed as
 * a value table** — a bench-side what-if the coordinator asked for, so the
 * owner can be shown what an optional air-time add-on would and would not
 * separate. Nothing here is in `TRICK_RUN` and nothing here scores a run.
 */
export interface AirRamp {
  readonly id: string;
  readonly label: string;
  /** Below this, a trick subtotal would be worth nothing. */
  readonly t0: number;
  /** At or above this, full value. */
  readonly t1: number;
}

export const AIR_RAMPS: readonly AirRamp[] = [
  { id: 'A', label: 'permissive: 0.60 → 0.85 s', t0: 0.60, t1: 0.85 },
  { id: 'B', label: 'gating: 0.72 → 0.95 s', t0: 0.72, t1: 0.95 },
];

/** `clamp((air − t0) / (t1 − t0), 0, 1)`. The what-if, and only that. */
export function airFactor(airSeconds: number, ramp: AirRamp): number {
  if (!(ramp.t1 > ramp.t0)) return airSeconds >= ramp.t1 ? 1 : 0;
  return Math.min(1, Math.max(0, (airSeconds - ramp.t0) / (ramp.t1 - ramp.t0)));
}

function quantiles(values: readonly number[]): { min: number; median: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0],
    median: sorted[(sorted.length - 1) >> 1],
    max: sorted[sorted.length - 1],
  };
}

const air = (value: number): string => value.toFixed(3);

function airCells(values: readonly number[]): string[] {
  const q = quantiles(values);
  return q === null
    ? ['0', '—', '—', '—']
    : [`${values.length}`, air(q.min), air(q.median), air(q.max)];
}

/**
 * S8 — how long each kind of flight is actually in the air.
 *
 * §36.6's `TrickFlight.airSeconds`, read off a **second** `TrickObserver` fed
 * the same recordings: read-only, no referee involved, no rule changed. The
 * question behind it is whether air time separates a flat hop from a feature
 * flight cleanly enough to gate or scale trick points by — a possible optional
 * add-on the owner has not been offered yet, and which this bench does not
 * implement.
 */
export function tableAirTime(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  const row = (
    group: string,
    label: string,
    flights: readonly ObservedFlight[],
  ): void => {
    const landed = flights.filter((flight) => flight.ended === 'landed');
    const tricked = landed.filter(banksATrick).map((flight) => flight.airSeconds);
    const q = quantiles(tricked);
    rows.push([
      group, label,
      ...airCells(landed.map((flight) => flight.airSeconds)),
      ...airCells(tricked),
      ...AIR_RAMPS.map((ramp) => (q === null
        ? '—'
        : `${airFactor(q.min, ramp).toFixed(2)} / ${airFactor(q.median, ramp).toFixed(2)}`)),
    ]);
  };

  // Every S1 attempt, aggregated per feature.
  for (const feature of featuresInLapOrder()) {
    const flights: ObservedFlight[] = [];
    for (const mph of feature.speeds) {
      for (const recipe of FEATURE_RECIPES) {
        const value = tally.addAttempt(attempt(feature, mph, recipe));
        for (const flight of observeFlights(value.ride.recording)) flights.push(flight);
      }
    }
    row('feature', feature.id, flights);
  }

  for (const line of scoringLines(tally)) {
    const group = line.id.startsWith('routed') || line.id === 'brisk' || line.id === 'bypass'
      ? 'line'
      : 'farm';
    row(group, line.label, observeFlights(fitRecording(line.recording, durationStepsFor(90))));
  }

  return {
    id: 'S8',
    title: 'S8 — air time per flight, by feature and by farming line',
    geometry: [],
    notes: [
      '**Read-only, and no rule changed.** Every number is'
        + ' `TrickFlight.airSeconds` off a second `TrickObserver` fed the same recordings the'
        + ' referee is fed. `src/simulation/trickRun.ts` and `TRICK_RUN` were not touched and'
        + ' the shipped referee has no air-time rule.',
      '`landed` counts flights that ended on the wheel; `banks a trick` narrows that to the'
        + ' ones the observer credited a charged hop, a landed 180 or a one-foot air to —'
        + ' the only flights an air-time gate would ever change the value of.',
      '`ramp A / ramp B` show `clamp((air − T0) / (T1 − T0), 0, 1)` at that row\'s **minimum**'
        + ' and **median** tricked air, for the two candidate ramps'
        + ` (${AIR_RAMPS.map((ramp) => ramp.label).join('; ')}). A bench-side what-if only.`,
      'The feature rows aggregate every S1 attempt at that feature — every published speed'
        + ' and every input recipe — so the spread is the feature\'s, not one row\'s.',
    ],
    columns: ['group', 'line', 'landed', 'min air s', 'median air s', 'max air s',
      'banks a trick', 'min air s', 'median air s', 'max air s',
      ...AIR_RAMPS.map((ramp) => `ramp ${ramp.id} min/median`)],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/**
 * S8b — what an air-time add-on would do to the lines, arithmetically.
 *
 * **This is a bench-side what-if and explicitly NOT the referee's formula.**
 * The shipped referee has no air-time rule; nothing in `TRICK_RUN` changed and
 * nothing here was scored differently. Each of S3's lines is scored once by the
 * real referee at 90 s — diminishing repeats and all — and then this table
 * *post-processes its awards*: each award's `trickPoints` is multiplied by
 * `clamp((air − T0) / (T1 − T0), 0, 1)` for that award's own flight, rounded,
 * and the clean-landing award is left alone. It is arithmetic on a published
 * result, not a second scorer, and it decides nothing.
 */
export function tableAirWhatIf(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const steps = durationStepsFor(REPEAT_TABLE_SECONDS);

  for (const line of scoringLines(tally)) {
    const fitted = fitRecording(line.recording, steps);
    const replay = replayTrickRun([fitted], { ...SHIPPED_TRICK_RULES, durationSteps: steps });
    const airOf = new Map<number, number>();
    for (const flight of observeFlights(fitted)) airOf.set(flight.id, flight.airSeconds);

    const cells = [line.label, `${replay.scores[0]}`];
    for (const ramp of AIR_RAMPS) {
      let total = 0;
      for (const award of replay.awards) {
        const seconds = airOf.get(award.flight) ?? 0;
        total += Math.round(award.trickPoints * airFactor(seconds, ramp)) + award.cleanPoints;
      }
      cells.push(`${total}`);
      cells.push(replay.scores[0] === 0
        ? '—'
        : `${(100 * (1 - total / replay.scores[0])).toFixed(1)} %`);
    }
    rows.push(cells);
  }

  return {
    id: 'S8b',
    title: `S8b — a bench-side air-time what-if on S3's lines, at ${REPEAT_TABLE_SECONDS} s`,
    geometry: [],
    notes: [
      '**NOT THE REFEREE\'S FORMULA.** The shipped `TrickRun` has no air-time rule and none'
        + ' was added. Every `shipped` cell is the real referee\'s total at'
        + ` ${REPEAT_TABLE_SECONDS} s with diminishing repeats applied; the ramp columns are`
        + ' this bench multiplying each published award\'s `trickPoints` by'
        + ' `clamp((air − T0) / (T1 − T0), 0, 1)` for that award\'s own flight and rounding.'
        + ' The clean-landing award is outside the ramp, as it is outside the landing'
        + ' multiplier.',
      'If the owner is offered this add-on it would belong in the referee, in one place, as'
        + ' every other scoring decision does. This table exists to say what it would buy,'
        + ' not to be it.',
      ...AIR_RAMPS.map((ramp) => `**Ramp ${ramp.id}** — ${ramp.label}.`),
    ],
    columns: ['line', `shipped, ${REPEAT_TABLE_SECONDS} s`,
      ...AIR_RAMPS.flatMap((ramp) => [`ramp ${ramp.id}`, `ramp ${ramp.id} docked`])],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S4 — the duration candidates
// ---------------------------------------------------------------------------

/**
 * S4 — what each candidate clock buys a routed attempt, and what a crash costs.
 *
 * §38.8 Phase 0: "Compare 60/90/120-second candidates against measured full
 * technical-lap times and recoveries." The features column is how many of the
 * nine a routed attempt gets through; the recovery column is the controller's
 * own, measured rather than quoted.
 */
export function tableDurationCandidates(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const routes: readonly { readonly id: string; readonly legs: readonly RoutedLeg[] }[] = [
    { id: 'greediest', legs: routedLine('points', tally) },
    { id: 'briskest', legs: routedLine('rate', tally) },
  ];

  const marks = new Map<string, readonly number[]>();
  const lapStepsOf = new Map<string, number>();
  for (const route of routes) {
    let elapsed = 0;
    const cumulative: number[] = [];
    for (const leg of route.legs) {
      elapsed += leg.connectiveSteps + leg.attempt.ride.steps;
      cumulative.push(elapsed);
    }
    marks.set(route.id, cumulative);
    lapStepsOf.set(route.id, Math.max(1, elapsed));
  }

  for (const route of routes) {
    const lapSteps = lapStepsOf.get(route.id) as number;
    const cumulative = marks.get(route.id) as readonly number[];
    const routed = routedRecording(
      route.legs,
      Math.max(1, Math.ceil(durationStepsFor(120) / lapSteps)),
    );
    for (const duration of DURATION_CANDIDATES) {
      const steps = durationStepsFor(duration);
      const done = cumulative.filter((mark) => mark <= steps).length;
      const replay = replayTrickRun([fitRecording(routed, steps)], {
        ...SHIPPED_TRICK_RULES,
        durationSteps: steps,
      });
      const book = replay.result.books[0];
      rows.push([
        route.id,
        `${duration} s`,
        `${steps}`,
        `${done} of ${route.legs.length}`,
        (steps / lapSteps).toFixed(2),
        `${replay.scores[0]}`,
        `${book.flights}`,
        `${book.crashes}`,
        seconds(EUC.crashRecoverAutoSeconds),
        ((EUC.crashRecoverAutoSeconds / duration) * 100).toFixed(1),
      ]);
    }
  }

  return {
    id: 'S4',
    title: 'S4 — the 60 / 90 / 120 s candidates against a measured routed attempt (q182)',
    geometry: routes.flatMap((route) => [
      `**${route.id}** — one spliced routed lap is`
      + ` ${seconds(stepsToSeconds(lapStepsOf.get(route.id) as number))} s`
      + ` (${lapStepsOf.get(route.id)} fixed steps) and visits ${route.legs.length} features.`,
      ...route.legs.map((leg, index) =>
        `  ${index + 1}. ${leg.attempt.feature.id} — reached at`
        + ` ${seconds(stepsToSeconds((marks.get(route.id) as readonly number[])[index]))} s,`
        + ` ${leg.attempt.mph} mph, ${leg.attempt.recipe.label}, ${leg.attempt.points} points`),
    ]),
    notes: [
      '**Two routings, because the two questions differ.** `greediest` takes the'
        + ' highest-scoring attempt that still rides on at every feature; `briskest` takes'
        + ' the one with the best points per second of lap. A 180 is in neither: it exits'
        + ' fakie and the ride never reaches the merge, so it cannot be a leg of a lap'
        + ' (its own worth is S1\'s and S5\'s).',
      '`features reached` counts the windows whose merge falls inside the clock on the'
        + ' spliced routed lap. `laps` is the same number as a fraction.',
      `\`crash recovery\` is \`EUC.crashRecoverAutoSeconds\` = ${EUC.crashRecoverAutoSeconds} s,`
        + ' the controller\'s own automatic respawn after a wipeout — the clock keeps running'
        + ' through it (§38.3), so the last column is what one crash costs the attempt.',
      'The points column is the routed proxy scored by the shipped referee at that clock,'
        + ' and is the same number S3\'s routed rows print.',
      '**This table rides nothing new**, which is why its trial count is zero: it re-scores'
        + ' the recordings S3 already made, at three clocks instead of one.',
    ],
    columns: ['route', 'candidate', 'fixed steps', 'features reached', 'laps',
      'routed points', 'flights', 'crashes', 'crash recovery s', 'one crash costs %'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S5 — the near-miss recheck (q180 / q186) and the one-foot window
// ---------------------------------------------------------------------------

/**
 * S5 — how much air a one-foot air needs, and which features have it.
 *
 * Not a value table: the evidence behind S1's empty one-foot cells. The pose
 * refuses to start unless the flight can carry the whole gesture, so a feature
 * whose flight is shorter than `readableWindowSeconds` plus the dwell can
 * never pay a one-foot air however the control is worked.
 */
export function tableOneFootWindow(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const needed = ONE_FOOT.holdQualifySeconds + readableWindowSeconds();

  for (const feature of featuresInLapOrder()) {
    for (const mph of feature.speeds) {
      const value = tally.addAttempt(attempt(feature, mph, FEATURE_RECIPES[3]));
      const ride = value.ride;
      rows.push([
        feature.id,
        `${mph}`,
        `${ride.takeoffs}`,
        `${ride.oneFootQualifications}`,
        `${ride.spinsCompleted}`,
        ride.oneFootQualifications > 0 ? 'yes' : 'no',
        `${value.points}`,
      ]);
    }
  }

  return {
    id: 'S5',
    title: 'S5 — the one-foot air\'s window on the installed features',
    geometry: [],
    notes: [
      `A one-foot air needs \`ONE_FOOT.holdQualifySeconds\` (${ONE_FOOT.holdQualifySeconds} s)`
        + ` of eligible hold and then a readable window of ${needed.toFixed(2)} s total before`
        + ' the pose will start at all — `app/oneFootPose.ts` refuses a late request outright.'
        + ' A feature whose flight is shorter than that cannot pay the award, and no input'
        + ' can change that.',
      'Every row holds the Hop level through the flight. `qualified` is'
        + ' `oneFootQualifiedThisFlight` on the real pose module, stepped from the real'
        + ' controller — the same call `app/Game.ts` makes.',
      '**The finding is that the column is almost all `yes`.** Every installed feature'
        + ' throws a flight long enough for the pose at almost every published speed, so the'
        + ' one-foot air is not a hard trick to *earn* — it is a held button. That is what'
        + ' makes it the dominant award in S2 and S3, and it is the measured basis of the'
        + ' q185 flag rather than a claim about difficulty.',
    ],
    columns: ['feature', 'lip mph', 'takeoffs', 'one-foot qualifications', '180s completed',
      'pays a one-foot air', 'points'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

// ---------------------------------------------------------------------------
// S6 — misses
// ---------------------------------------------------------------------------

/**
 * S6 — the lateral misses, and what a missed feature is worth.
 *
 * `docs/JUMP_BENCH.md` T13's two offsets, ridden with the best-paying recipe
 * and scored by the referee: `+1.2 m left` walks the line into the feature's
 * outer half and `−1.2 m right` walks it off the inner edge toward the bypass.
 * §38.8 Phase 0 asks for misses and crashes by name, and this is them — a
 * missed feature banks whatever the rider still landed, which is usually a
 * clean touchdown and nothing else.
 */
export function tableMisses(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of featuresInLapOrder()) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const centred = tally.addAttempt(attempt(feature, mph, FEATURE_RECIPES[3]));
    for (const offset of [1.2, -1.2]) {
      const value = tally.addAttempt(attempt(feature, mph, FEATURE_RECIPES[3], {
        lateralOffset: offset,
      }));
      rows.push([
        feature.id,
        `${mph}`,
        `${offset > 0 ? '+' : ''}${offset.toFixed(1)} m ${offset > 0 ? 'left' : 'right'}`,
        `${value.ride.takeoffs}`,
        `${value.ride.touchdowns}`,
        tierText(value.ride),
        eventText(value.replay),
        `${value.points}`,
        `${centred.points}`,
        `${value.points - centred.points}`,
        `${value.replay.result.books[0].crashes}`,
        value.ride.crashed && value.ride.recoveredAfterSteps >= 0
          ? `${seconds(stepsToSeconds(value.ride.recoveredAfterSteps))} s`
          : '—',
      ]);
    }
  }

  return {
    id: 'S6',
    title: 'S6 — the lateral misses, and what a missed feature banks',
    geometry: [],
    notes: [
      'Every row is the same input the centred row used (`hop + full, Hop held`) at the'
        + ' feature\'s middle speed, started 1.2 m off the technical line. `on line` is the'
        + ' centred attempt\'s points and `cost` is what the miss gave up.',
      'A crash banks nothing for its flight and does not deduct what is already banked'
        + ' (§38.3); the recovery column is the controller\'s own, measured — it respawns in'
        + ` place after \`EUC.crashRecoverAutoSeconds\` = ${EUC.crashRecoverAutoSeconds} s and`
        + ' the ride keeps going, with the run\'s clock running through it.',
      'A miss that still lands cleanly still earns the clean-landing award. That is the'
        + ' design: §38.3 pays for what the rider landed, and a bypassed feature is not a'
        + ' penalty.',
    ],
    columns: ['feature', 'lip mph', 'line', 'takeoffs', 'touchdowns', 'tiers', 'events banked',
      'points', 'on line', 'cost', 'crashes', 'recovery'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** Every table this bench prints, in report order. */
export function trickTables(): readonly BenchTable[] {
  return [
    tableFeatureEventMix(),
    tableOneFootWindow(),
    tableMisses(),
    tableCadence(),
    tableLineRates(),
    tableRepeatRule(),
    tableAirTime(),
    tableAirWhatIf(),
    tableDurationCandidates(),
  ];
}

/** The constants a reader needs to interpret a row. */
export function trickBenchConstants(): readonly { readonly name: string; readonly value: string }[] {
  return [
    { name: 'SIMULATION.hz', value: `${SIMULATION.hz} Hz (step ${STEP_SECONDS.toFixed(6)} s)` },
    { name: 'TRICK_RUN.durationSteps', value: `${SHIPPED_TRICK_RULES.durationSteps} steps (${(SHIPPED_TRICK_RULES.durationSteps / SIMULATION.hz).toFixed(0)} s) — provisional, q182` },
    { name: 'TRICK_RUN.cleanLandingPoints', value: `${SHIPPED_TRICK_RULES.cleanLandingPoints}` },
    { name: 'TRICK_RUN.chargedHopPoints', value: `${SHIPPED_TRICK_RULES.chargedHopPoints}` },
    { name: 'TRICK_RUN.spinLandedPoints', value: `${SHIPPED_TRICK_RULES.spinLandedPoints}` },
    { name: 'TRICK_RUN.oneFootAirPoints', value: `${SHIPPED_TRICK_RULES.oneFootAirPoints}` },
    { name: 'TRICK_RUN.multiTrickMinKinds', value: `${SHIPPED_TRICK_RULES.multiTrickMinKinds}` },
    { name: 'TRICK_RUN.multiTrickBonusPoints', value: `${SHIPPED_TRICK_RULES.multiTrickBonusPoints}` },
    { name: 'TRICK_RUN multipliers', value: `clean ${SHIPPED_TRICK_RULES.cleanMultiplier} / heavy ${SHIPPED_TRICK_RULES.heavyMultiplier} / wobble ${SHIPPED_TRICK_RULES.wobbleMultiplier}` },
    { name: 'rules revision', value: trickRulesRevision(SHIPPED_TRICK_RULES) },
    { name: 'TRICKS.chargedHopMinCharge', value: `${TRICKS.chargedHopMinCharge}` },
    { name: 'EUC.hopChargeSeconds', value: `${EUC.hopChargeSeconds} s (${FULL_CHARGE_STEPS} grounded steps to a full charge)` },
    { name: 'EUC.hopCompressSeconds', value: `${EUC.hopCompressSeconds} s (${ON_TIME_STEPS} steps — the on-time lead)` },
    { name: 'EUC.crashRecoverAutoSeconds', value: `${EUC.crashRecoverAutoSeconds} s` },
    { name: 'ONE_FOOT.holdQualifySeconds', value: `${ONE_FOOT.holdQualifySeconds} s` },
    { name: 'one-foot readable window', value: `${readableWindowSeconds().toFixed(2)} s` },
    { name: 'INPUT buffer', value: `${BUFFER_STEPS} steps` },
    { name: 'the park\'s lap', value: `${PARK_LAP_METRES.toFixed(1)} m, ${INSTALLED_FEATURES.length} installed features` },
  ];
}
