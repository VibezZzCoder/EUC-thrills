/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LAUNCH_PAD, SIMULATION, TERRAIN } from '../data/tuning.ts';
import { ActionState, NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { EucController, type EucTuning, type LandingQuality } from '../simulation/EucController.ts';
import { LaunchPadField, type LaunchPadVolume } from '../simulation/launchPadField.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { createGroundSample, type GroundSample, type TerrainSampler } from '../simulation/world.ts';
import type { LevelPlan } from '../level/plan.ts';
import { RouteSpine, createSpineSample } from '../simulation/routeSpine.ts';
import { buildRouteField, type RouteField } from '../simulation/routeField.ts';
import { flatFixture } from './featureFixtures.ts';
import { ScriptedOutlaw, buildEvaderCourse, evaderTraversal, writeView, type EvaderCourse } from './chaseScripts.ts';

/**
 * The launch-pad bench — M42 (`docs/PLANS.md` §42.5 "Pad bench").
 *
 * One pad on open ground, approached from any heading, ridden by the shipped
 * controller at 120 Hz with no browser: the measurement behind the pad's
 * numbers. Two fixtures: the jump bench's level pavement (`flatFixture`), and
 * a low mesa whose ground falls 0.6 m inside the clear disc, which is what the
 * per-site flight cap's Δh exists for.
 *
 * Like `jumpBench.ts` this imports nothing above `level/` and `simulation/`
 * (plus the input snapshot a controller reads) and nothing from `node:`, and
 * it reads no clock or random source: two runs of one trial are deep-equal.
 * Trick credits that need the one-foot pose observer (`app/oneFootPose.ts`)
 * are scored by the test through `onStep`, never here.
 */

export const STEP_SECONDS = 1 / SIMULATION.hz;

/** A world and the one pad standing in it. */
export interface PadFixture {
  readonly label: string;
  readonly pad: LaunchPadVolume;
  sampler(): TerrainSampler;
}

/** The pad's own constants, at a stated place and drop. */
export function padVolume(x: number, z: number, dropMetres: number): LaunchPadVolume {
  return {
    id: 'bench-pad', x, z,
    triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
    footprintRadius: LAUNCH_PAD.footprintRadiusMetres,
    dropMetres,
  };
}

/** The jump bench's level pavement, a pad 200 m down it: every approach meets identical ground. */
export function levelPadFixture(): PadFixture {
  const plan = flatFixture('pavement').plan;
  return { label: 'level pavement', pad: padVolume(0, 200, 0), sampler: () => new PlanTerrainSampler(plan) };
}

/**
 * A pad's own lawn: the same pad on level **grass** (every city pad stands on
 * grass by rule). Grass roughness adds to the landing score, so the lawn is
 * where the Pad lift's landing tier is decided (R12).
 */
export function lawnPadFixture(): PadFixture {
  const plan = flatFixture('grass').plan;
  return { label: 'level lawn', pad: padVolume(0, 200, 0), sampler: () => new PlanTerrainSampler(plan) };
}

/** The mesa: level within `top` m of the pad, a straight fall to `drop` m below by `foot` m, level beyond. */
export const MESA = Object.freeze({ top: 6, foot: 12, drop: 0.6 });

/**
 * A low mesa, radially symmetric about the pad: its ground falls 0.6 m within
 * the clear disc, so a flight from the pad lands below its takeoff. The fall
 * is a 10 % grade, gentle enough that riding up it at the `?mph=90` edge is a
 * slope and not a ledge (`TERRAIN.dropLaunchThreshold`).
 */
export function mesaPadFixture(): PadFixture {
  const pad = padVolume(0, 0, MESA.drop);
  const grade = MESA.drop / (MESA.foot - MESA.top);
  const sampler: TerrainSampler = {
    sampleGround(x: number, z: number, out: GroundSample): GroundSample {
      const r = Math.hypot(x - pad.x, z - pad.z);
      let slope = 0;
      if (r <= MESA.top) out.height = 0;
      else if (r >= MESA.foot) out.height = -MESA.drop;
      else { out.height = -(r - MESA.top) * grade; slope = grade; }
      // The ground's normal: up, tipped outward by the fall.
      const nx = r > 0 ? ((x - pad.x) / r) * slope : 0, nz = r > 0 ? ((z - pad.z) / r) * slope : 0;
      const length = Math.hypot(nx, 1, nz);
      out.normal.x = nx / length; out.normal.y = 1 / length; out.normal.z = nz / length;
      out.surface = 'pavement';
      out.offCourse = false;
      return out;
    },
    raycast: () => null,
  };
  return { label: 'low mesa (0.6 m fall in the clear disc)', pad, sampler: () => sampler };
}

/**
 * The wheel a trial rides. `shipped` is the default table. `cutoutOff` keeps
 * it but lets the wheel hold its top speed (the jump bench's diagnostic
 * wheel, never a playable window). `mph90` is the `?mph=90` preset's drag and
 * power, cutout off: the fastest a diagnostic link can make the wheel.
 */
export type PadWheel = 'shipped' | 'cutoutOff' | 'mph90';

export function padWheelTuning(wheel: PadWheel): Partial<EucTuning> {
  if (wheel === 'shipped') return {};
  if (wheel === 'cutoutOff') return { cutoutEnabled: 0 };
  const preset = topSpeedPreset(90);
  return {
    cutoutEnabled: 0,
    dragCoefficient: preset.dragCoefficient,
    powerComfortSpeed: preset.powerComfortSpeed,
    powerLimitSpeed: preset.powerLimitSpeed,
  };
}

export interface PadTrialScript {
  /** The approach heading, radians; the rider is aimed at the centre (plus `chord`). */
  readonly headingY: number;
  /**
   * The approach speed, m/s. At or above the minimum the throttle holds it
   * from above (bang-bang to speed + 0.02) so the takeoff is never under it;
   * below the minimum the wheel starts at it and coasts, so it never creeps
   * over it.
   */
  readonly speed: number;
  /** Lateral offset of the line from the pad centre, m (+ = the rider's left). */
  readonly chord?: number;
  readonly armed?: boolean;
  readonly wheel?: PadWheel;
  /** Start this far from the centre, m. Beyond the 8 m re-arm after the run's reset. */
  readonly approachMetres?: number;
  /** Tap Hop on the first rising airborne step, steering this way: the 180. */
  readonly spinTap?: 'left' | 'right' | null;
  /**
   * The pose's *level* alone, held from the start to the touchdown, with no
   * press — what the one-foot pose reads, not a player's input (a held key
   * always begins with a press, and a press on the ground is a hop). See
   * `hopKey` for the input a player produces.
   */
  readonly hopHeld?: boolean;
  /**
   * A real Hop key, worked as a finger works it: down at a stated moment and
   * held until the pad flight lands. The press is latched by the input layer
   * itself (`ActionState`, with its `INPUT.actionBufferSeconds` buffer) and
   * claimed only on a step the controller can take it (`canAcceptHop ||
   * canAcceptSpin`), exactly as `Game.stepSeat` claims it; the held level is
   * the key's. `metresBeforeTrigger`: down on the approach, that far before
   * the trigger circle; `stepsAfterLaunch`: down that many steps after the pad
   * threw the wheel.
   */
  readonly hopKey?: { readonly metresBeforeTrigger: number } | { readonly stepsAfterLaunch: number };
  /** F4's Pad lift for this trial, m/s (default the shipped `LAUNCH_PAD.verticalSpeed`). */
  readonly lift?: number;
  readonly maxSteps?: number;
}

export interface PadTrialResult {
  readonly launched: boolean;
  /** Speed on the takeoff step, m/s (signed). */
  readonly takeoffSpeed: number;
  /** The takeoff vertical speed after the flight cap, m/s. */
  readonly takeoffVz: number;
  readonly airSteps: number;
  /** Highest point above the takeoff height, m. */
  readonly apexMetres: number;
  /** Horizontal distance from the takeoff point to the touchdown, m. */
  readonly flightMetres: number;
  /** Distance from the pad centre to the touchdown, m. */
  readonly touchdownFromCentre: number;
  readonly tier: 'none' | LandingQuality;
  readonly score: number;
  /** Down in the flight or at the touchdown (the landing's own verdict). */
  readonly crashed: boolean;
  /**
   * Down in the half second after a clean or heavy touchdown, still rolling
   * with no input — what the rider met beyond the landing, not the landing.
   */
  readonly crashedAfter: boolean;
  /** Riding backwards after the touchdown: a landed 180 is fakie. */
  readonly reversing: boolean;
  readonly spinArmed: boolean;
  /** The pad flight's flight identity (`EucController.flightIndex`), or −1 with no pad flight. */
  readonly padFlightIndex: number;
  /** Takeoffs before the pad's (a hop the key fired on the approach). */
  readonly flightsBeforePad: number;
  readonly tookOffCount: number;
  readonly hopped: boolean;
  /**
   * Flight steps on which the ground refused the move while the wheel was
   * clearly in the air — more than `TERRAIN.dropLaunchThreshold` above the
   * ground under it: a terrain-only airborne refusal, a flight meeting rising
   * ground or a step mid-air.
   */
  readonly airborneRefusals: number;
  /**
   * Refusals on the step before touchdown, within that threshold of the
   * ground: the wheel touching a gently rising landing one step early. Counted
   * apart because it is the landing, not a collision; reported, not judged.
   */
  readonly touchdownRefusals: number;
}

/** Ride one approach across the pad and fly whatever it throws. */
export function runPadTrial(
  fixture: PadFixture,
  script: PadTrialScript,
  onStep?: (controller: EucController, action: ActionSnapshot) => void,
): PadTrialResult {
  const pad = fixture.pad;
  const approach = script.approachMetres ?? 14;
  const chord = script.chord ?? 0;
  const forwardX = Math.sin(script.headingY), forwardZ = Math.cos(script.headingY);
  // The rider's left (+X when facing +Z), the jump bench's lateral axis.
  const leftX = Math.cos(script.headingY), leftZ = -Math.sin(script.headingY);
  const controller = new EucController(fixture.sampler(), {
    tuning: padWheelTuning(script.wheel ?? 'shipped'),
    launchPads: new LaunchPadField([pad]),
  });
  const start = {
    position: {
      x: pad.x - forwardX * approach + leftX * chord, y: 0,
      z: pad.z - forwardZ * approach + leftZ * chord,
    },
    headingY: script.headingY,
  };
  const below = script.speed < LAUNCH_PAD.minimumLaunchSpeed;
  const target = below ? script.speed : script.speed + 0.02;
  if (!controller.reset(start, target)) throw new Error('pad bench: the start is refused');
  if (script.armed !== false) controller.setLaunchPadsArmed(true);
  if (script.lift !== undefined) controller.setLaunchPadVerticalSpeed(script.lift);
  const key = script.hopKey ?? null;
  const input = key === null ? null : new ActionState();
  let keyDown = false, now = 0, launchStep = -1, padFlightIndex = -1, flightsBeforePad = 0;

  let launched = false, takeoffSpeed = 0, takeoffVz = 0, takeoffX = 0, takeoffY = 0, takeoffZ = 0;
  let airSteps = 0, apex = 0, flightMetres = 0, touchdown = Number.NaN, tier: 'none' | LandingQuality = 'none';
  let score = 0, tapped = false, tookOffCount = 0, hopped = false, landed = false, after = 0, refusals = 0;
  let touchdownRefusals = 0, crashedInFlight = false;
  const maxSteps = script.maxSteps ?? 2400;
  for (let step = 0; step < maxSteps; step += 1) {
    now += STEP_SECONDS;
    const before = controller.snapshot();
    const spin = script.spinTap != null && launched && !landed && !tapped && !before.grounded
      && controller.canAcceptSpin;
    if (spin) tapped = true;
    let keyHop = false, keyHeld = false;
    if (key !== null && input !== null) {
      const toTrigger = (pad.x - before.position.x) * forwardX + (pad.z - before.position.z) * forwardZ
        - LAUNCH_PAD.triggerRadiusMetres;
      const goesDown = !keyDown && ('metresBeforeTrigger' in key
        ? !launched && toTrigger <= key.metresBeforeTrigger
        : launchStep >= 0 && step >= launchStep + key.stepsAfterLaunch);
      if (goesDown) { keyDown = true; input.press('hop', now); input.setHeld('hopHeld', true); }
      if (landed) input.setHeld('hopHeld', false);
      const sampled = input.sample(now);
      keyHop = sampled.hop && (controller.canAcceptHop || controller.canAcceptSpin) && input.consume('hop', now);
      keyHeld = sampled.hopHeld;
    }
    const throttle = launched || below ? 0 : before.speed < target ? 1 : 0;
    const action: ActionSnapshot = {
      ...NEUTRAL_ACTIONS, throttle,
      hop: spin || keyHop,
      steer: spin ? (script.spinTap === 'left' ? 1 : -1) : 0,
      hopHeld: (script.hopHeld === true && !landed) || keyHeld,
    };
    controller.step(STEP_SECONDS, action);
    onStep?.(controller, action);
    if (controller.tookOff) {
      tookOffCount += 1;
      if (!controller.padLaunched && !launched) flightsBeforePad += 1;
    }
    hopped ||= controller.hopped;
    const snap = controller.snapshot();
    if (controller.padLaunched && !launched) {
      launched = true;
      launchStep = step;
      padFlightIndex = controller.flightIndex;
      takeoffSpeed = snap.speed;
      takeoffVz = controller.verticalRate;
      takeoffX = snap.position.x; takeoffY = snap.position.y; takeoffZ = snap.position.z;
    }
    if (launched && !landed) {
      if (!snap.grounded) {
        airSteps += 1;
        apex = Math.max(apex, snap.position.y - takeoffY);
        if (snap.blocked) {
          if (snap.airHeight > TERRAIN.dropLaunchThreshold) refusals += 1;
          else touchdownRefusals += 1;
        }
      }
      if (controller.touchedDown || controller.crashed) {
        landed = true;
        crashedInFlight = controller.crashed;
        flightMetres = Math.hypot(snap.position.x - takeoffX, snap.position.z - takeoffZ);
        touchdown = Math.hypot(snap.position.x - pad.x, snap.position.z - pad.z);
        tier = controller.crashed ? 'crash' : controller.lastLandingQuality;
        score = snap.landingScore;
      }
    }
    if (landed) after += 1;
    // Long enough after the touchdown for a 180's fakie to show, then stop.
    if (landed && after > 30) break;
    // A run that never launched has passed the pad by a margin and stops.
    if (!launched && (snap.position.x - pad.x) * forwardX + (snap.position.z - pad.z) * forwardZ
      > LAUNCH_PAD.footprintRadiusMetres + 2) break;
  }
  const end = controller.snapshot();
  return {
    launched, takeoffSpeed, takeoffVz, airSteps, apexMetres: apex, flightMetres,
    touchdownFromCentre: touchdown, tier, score, crashed: crashedInFlight || tier === 'crash',
    crashedAfter: !crashedInFlight && tier !== 'crash' && end.crashed,
    reversing: end.speed < 0, spinArmed: tapped,
    padFlightIndex, flightsBeforePad, tookOffCount, hopped, airborneRefusals: refusals, touchdownRefusals,
  };
}

// ---------------------------------------------------------------------------
// The natural line: riding every road a chase or a free ride takes at speed
// ---------------------------------------------------------------------------

type Traversal = { id: string; forward: boolean }[];

/** One rideable line through a world, and the outlaw scripts that ride it. */
export interface PadLine {
  readonly label: string;
  readonly spine: RouteSpine;
  readonly field: RouteField;
  /** The evader's course on this line (the evader brain reads it), or null. */
  readonly course: EvaderCourse | null;
  /** How far one ride of it goes, metres. */
  readonly length: number;
  readonly kinds: readonly PadRiderKind[];
  /** The speed the ride starts at, m/s (0: from rest at the line's start). */
  readonly startSpeed: number;
}

/**
 * The outlaw scripts of `chaseScripts.ts`, plus the **overcooked** sprinter:
 * the sprinter's cornering margin raised to 1.15 of the grip limit, so he
 * runs wide at every bend — the overrun the missed-corner rule exists for.
 */
export type PadRiderKind = 'follower' | 'evader' | 'sprinter' | 'overcooked';

/** The overcooked sprinter's cornering margin (both the cool and the hot one). */
export const OVERCOOKED_MARGIN = 1.15;

function reversed(traversal: readonly { id: string; forward: boolean }[]): Traversal {
  return [...traversal].reverse().map(({ id, forward }) => ({ id, forward: !forward }));
}

function courseOf(plan: LevelPlan, ground: TerrainSampler, traversal: Traversal): EvaderCourse {
  const spine = RouteSpine.fromTraversal(plan, traversal, { closeWhenJoined: true });
  return { spine, field: buildRouteField(spine, plan, ground, { nav: false }), lapLength: spine.length,
    closed: spine.closed, alternates: 0 };
}

const SOCKET_METRES = 1.25;
/** A branch ride starts on the branch at this speed, m/s (27 mph): arriving from a road, not from a standstill. */
export const BRANCH_START_SPEED = 12;

/**
 * Every optional branch and chicken line — the segments no street loop
 * lists — as traversals. Branches that join end to end are one traversal; at
 * each joint the straightest continuation is followed. A branch leaves its
 * road part-way along it (no shared socket), so the ride starts on the branch
 * already moving (`BRANCH_START_SPEED`); the crossing between road and branch
 * is the finder's free-end capsule, not a ride.
 */
export function branchTraversals(plan: LevelPlan): Traversal[] {
  const segments = plan.segments;
  const loops = plan.streetLoops ?? [];
  const onLoop = new Set(loops.flatMap((loop) => [...loop.main, ...loop.alternate]));
  const at = (index: number, exit: boolean) => (exit ? segments[index].exit : segments[index].entry);
  const touching = (index: number, exit: boolean): { index: number; exit: boolean }[] => {
    const p = at(index, exit).position;
    const out: { index: number; exit: boolean }[] = [];
    segments.forEach((_, other) => {
      if (other === index) return;
      for (const end of [false, true]) {
        const q = at(other, end).position;
        if (Math.hypot(p.x - q.x, p.z - q.z) <= SOCKET_METRES) out.push({ index: other, exit: end });
      }
    });
    return out;
  };
  /** The travel heading leaving a step's far end. */
  const outHeading = (step: { index: number; forward: boolean }): number =>
    step.forward ? at(step.index, true).headingY : at(step.index, false).headingY + Math.PI;
  /** The travel heading entering a step's near end. */
  const inHeading = (step: { index: number; forward: boolean }): number =>
    step.forward ? at(step.index, false).headingY : at(step.index, true).headingY + Math.PI;
  const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  /** The straightest next step from a step's far end, among candidates passing `allow`. */
  const next = (step: { index: number; forward: boolean }, allow: (index: number) => boolean) => {
    let best: { index: number; forward: boolean } | null = null, bestTurn = Infinity;
    for (const touch of touching(step.index, step.forward)) {
      if (!allow(touch.index)) continue;
      const candidate = { index: touch.index, forward: !touch.exit };
      const t = turn(inHeading(candidate), outHeading(step));
      if (t < bestTurn) { bestTurn = t; best = candidate; }
    }
    return best;
  };
  const flip = (step: { index: number; forward: boolean }) => ({ index: step.index, forward: !step.forward });

  const visited = new Set<number>();
  const out: Traversal[] = [];
  segments.forEach((segment, index) => {
    if (onLoop.has(segment.id) || visited.has(index)) return;
    visited.add(index);
    let chain = [{ index, forward: true }];
    const offLoop = (other: number) => !onLoop.has(segments[other].id) && !visited.has(other);
    for (let step = next(chain[chain.length - 1], offLoop); step !== null; step = next(step, offLoop)) {
      visited.add(step.index); chain.push(step);
    }
    for (let step = next(flip(chain[0]), offLoop); step !== null; step = next(step, offLoop)) {
      visited.add(step.index); chain = [flip(step), ...chain];
    }
    out.push(chain.map((step) => ({ id: segments[step.index].id, forward: step.forward })));
  });
  return out;
}

/**
 * Every line the natural-line proof rides on a world: the canonical spine
 * forwards and the town ring backwards (follower, sprinter, overcooked), the
 * evader's course through every alternate both ways, and every branch and
 * chicken line both ways (follower, sprinter).
 */
export function padLines(plan: LevelPlan, ground: TerrainSampler): PadLine[] {
  const lines: PadLine[] = [];
  const canonical = RouteSpine.fromPlan(plan);
  if (canonical === null) return lines;
  const canonicalField = buildRouteField(canonical, plan, ground);
  const main: readonly PadRiderKind[] = ['follower', 'sprinter', 'overcooked'];
  lines.push({ label: 'spine forwards', spine: canonical, field: canonicalField, course: null,
    length: canonical.length, kinds: main, startSpeed: 0 });
  const ring = (plan.streetLoops ?? []).find((loop) => loop.alternate.length === 0);
  if (ring !== undefined) {
    const back = courseOf(plan, ground, reversed(ring.main.map((id) => ({ id, forward: true }))));
    lines.push({ label: 'town ring backwards', spine: back.spine, field: back.field, course: null,
      length: back.lapLength, kinds: main, startSpeed: 0 });
  }
  const evader = buildEvaderCourse(plan, ground);
  const evaderLap = evaderTraversal(plan);
  if (evader !== null && evaderLap !== null) {
    lines.push({ label: 'every alternate forwards', spine: canonical, field: canonicalField, course: evader,
      length: evader.lapLength, kinds: ['evader'], startSpeed: 0 });
    const back = courseOf(plan, ground, reversed(evaderLap));
    lines.push({ label: 'every alternate backwards', spine: canonical, field: canonicalField, course: back,
      length: back.lapLength, kinds: ['evader'], startSpeed: 0 });
  }
  for (const traversal of branchTraversals(plan)) {
    for (const [label, steps] of [['forwards', traversal], ['backwards', reversed(traversal)]] as const) {
      const spine = RouteSpine.fromTraversal(plan, steps);
      const field = buildRouteField(spine, plan, ground, { nav: false });
      const named = steps.find((step) => !(plan.streetLoops ?? []).some((loop) =>
        loop.main.includes(step.id) || loop.alternate.includes(step.id)))?.id ?? steps[0].id;
      lines.push({ label: `branch ${named} ${label}`, spine, field, course: null, length: spine.length,
        kinds: ['follower', 'sprinter'], startSpeed: BRANCH_START_SPEED });
    }
  }
  return lines;
}

export interface LineRide {
  readonly line: string;
  readonly kind: PadRiderKind;
  readonly steps: number;
  readonly crashes: number;
  /** Ridden distance over the line's length, at the end of the ride. */
  readonly covered: number;
  /** Nearest any upright position came to any pad centre, metres. */
  readonly nearest: number;
  /** Nearest any upright position off the paved road (an overrun) came to any pad centre, metres. */
  readonly nearestOverrun: number;
}

/** Ride one script along one line, watching every upright position against the pads. */
export function rideLine(plan: LevelPlan, ground: TerrainSampler, line: PadLine, kind: PadRiderKind,
  pads: readonly { readonly x: number; readonly z: number }[]): LineRide {
  const start = createSpineSample();
  (line.course?.spine ?? line.spine).sample(0, start);
  const sample = createGroundSample();
  ground.sampleGround(start.x, start.z, sample);
  const spawn = { position: { x: start.x, y: sample.height, z: start.z }, headingY: start.headingY };
  const outlaw = new ScriptedOutlaw(kind === 'overcooked' ? 'sprinter' : kind, plan, ground, line.spine, line.field,
    line.course, [], spawn);
  if (kind === 'overcooked') {
    outlaw.brain.corneringMargin = OVERCOOKED_MARGIN;
    outlaw.brain.hotCorneringMargin = OVERCOOKED_MARGIN;
  }
  const controller = outlaw.body.controller;
  if (line.startSpeed > 0) {
    if (!controller.reset(spawn, line.startSpeed)) throw new Error('pad line: the start is refused');
    controller.writePose(outlaw.body.pose);
    writeView(outlaw.body);
    outlaw.brain.place(outlaw.body.view, 0);
  }
  const maxSteps = Math.ceil((line.length / 5 + 30) * SIMULATION.hz);
  let nearest = Infinity, nearestOverrun = Infinity, crashes = 0, wasCrashed = false, steps = 0;
  for (; steps < maxSteps; steps += 1) {
    outlaw.ride(STEP_SECONDS, outlaw.think(STEP_SECONDS));
    const crashed = controller.crashed;
    if (crashed && !wasCrashed) crashes += 1;
    wasCrashed = crashed;
    const snap = controller.snapshot();
    if (!crashed) {
      const off = snap.surface === 'grass' || snap.offCourse;
      for (const pad of pads) {
        const d = Math.hypot(snap.position.x - pad.x, snap.position.z - pad.z);
        if (d < nearest) nearest = d;
        if (off && d < nearestOverrun) nearestOverrun = d;
      }
    }
    if (snap.distanceTravelled >= line.length) break;
  }
  return { line: line.label, kind, steps, crashes, covered: controller.snapshot().distanceTravelled / line.length,
    nearest, nearestOverrun };
}
