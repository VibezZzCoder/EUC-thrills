/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The barks' measured rate (M42, `docs/PLANS.md` §42.2h) — a number for the
 * owner, who judges the taste on his ride (q236, then owner round 2 on
 * 2026-10-10: "it was very rare … it should be easier to trigger").
 *
 * The real population on the default town (`euc`), prepared exactly as
 * `Game` installs it, drives the shipped `BarkModel`; the view's verdict comes
 * from `barkView.ts` with the shipped chase camera following the rider, the
 * world's own occlusion ray and the sight test against the other people and
 * vans (`candidateHidden`/`bubbleHidden`), as `Game.render` does it. The rider is a
 * scripted ghost that hands the population no occupant, so nobody steps
 * aside and walls do not stop it (the camera ray still does) — a rate
 * measurement of the presentation layer, not a ride. Two riders:
 *
 * - **The continuous ride** (`PathRider`, added after QA D r1): it rides the
 *   town's own path graph without a break — pavements (the people's paths)
 *   and roads (the traffic paths) — on through each path's end connections.
 *   It meets people only as often as the town has them, so it is **the
 *   honest figure**. Owner round 2 (facing −0.6, an 8–28 × 9 m pass box, 9 m/s
 *   cap, chances 1, a 15 s seat cooldown, 60 s person memory, and a candidate
 *   started only if it will still be on screen once read) measures it at
 *   0.75 per minute overall (30 bubbles in 40 min, from 0.33), and 1.31 per
 *   minute of the time somebody is within 30 m — the owner's "about 1–2 per
 *   minute when people are around". Both are pinned below with margin.
 *   On `euc` (20 people over ≈ 610 × 655 m) it measured 0.15 per minute at
 *   `passChance` 0.25, below that floor; q236 was ruled on 2026-10-10 for
 *   `passChance` 0.75 (the smallest measured lever inside the band), so the
 *   floor is an ordinary pin now. A retune that leaves the band fails here.
 *   Since the critic repair (a mixed hash, and askers hidden behind another
 *   person or a van no longer ask) it measured 0.30 at a 25 s seat cooldown;
 *   at the ruled 35 s (R15) it measures 0.33 (13 bubbles in 40 min).
 * - **The tour** (`TourRider`): a stress case that is re-placed 40 m from the
 *   next person for every leg, so every leg is a candidate. Owner round 2
 *   measures it at 1.40 per minute (was 1.10 at R18); its ceiling is 1.8.
 * - 5 minutes parked by a social group: exactly one bubble for the stop (a
 *   stop beside people always asks, and only once).
 * - 5 minutes at 12 m/s: none.
 *
 * The step is 1/60 s, one population step and one drawn frame each, to keep
 * the run short; the model reads drawn frames and does not care.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { createLevel } from '../level/levels.ts';
import type { PopulationPath } from '../level/populationPlan.ts';
import {
  ChaseCamera,
  createChaseCameraState,
  createChaseCameraView,
  resolveChaseView,
  type ChaseCameraInput,
} from '../render/chaseCamera.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { PopulationSimulation, createPopulationPresentationSnapshot } from '../simulation/population.ts';
import { BARKS } from '../data/tuning.ts';
import { BarkModel, BarkRoom, type BarkFrame } from '../ui/barkModel.ts';
import { BarkView, bubbleHidden, candidateHidden } from './barkView.ts';
import { preparePopulationWorld } from './populationWorld.ts';

const STEP = 1 / 60;
const PEOPLE: ReadonlySet<string> = new Set(['walker', 'jogger', 'social', 'worker']);
/** "People around": somebody within the pass box's far edge plus the exit margin (30 m). */
const AROUND_METRES = BARKS.passAheadMetres[1] + BARKS.encounterExitMarginMetres;

/** `Game.placeCamera`'s chase branch, solo 16:9, headless. */
class PaneCamera {
  readonly chase = new ChaseCamera();
  readonly state = createChaseCameraState();
  readonly view = createChaseCameraView();
  readonly camera = new PerspectiveCamera(65, 16 / 9, 0.1, 500);
  readonly input: ChaseCameraInput = {
    x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, speed: 0, groundY: 0, airborne: false, crashed: false,
    bodyX: 0, bodyY: 0, bodyZ: 0,
  };

  follow(x: number, y: number, z: number, headingY: number, speed: number, reset = false): PerspectiveCamera {
    const input = this.input;
    input.x = x;
    input.y = y;
    input.groundY = y;
    input.z = z;
    input.headingY = headingY;
    input.speed = speed;
    if (reset) this.chase.reset(input);
    // Two fixed camera steps per drawn frame, as the game's 120 Hz loop does.
    this.chase.step(STEP / 2, input);
    this.chase.step(STEP / 2, input);
    this.chase.writeState(this.state);
    resolveChaseView(this.state, input, this.chase.tuning, this.view);
    const camera = this.camera;
    camera.position.set(this.view.positionX, this.view.positionY, this.view.positionZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.view.targetX, this.view.targetY, this.view.targetZ);
    if (this.view.roll !== 0) camera.rotateZ(-this.view.roll);
    camera.fov = (this.view.fov * 180) / Math.PI;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }
}

class RateRig {
  readonly living = preparePopulationWorld(createLevel('generated', 'euc'));
  readonly sampler = new PlanTerrainSampler(this.living.level);
  readonly population = new PopulationSimulation(this.living.population, this.sampler);
  readonly previous = createPopulationPresentationSnapshot();
  readonly current = createPopulationPresentationSnapshot();
  readonly model = new BarkModel(0);
  readonly room = new BarkRoom();
  readonly view = new BarkView();
  readonly pane = new PaneCamera();
  readonly anticipation = { components: [], incompleteOwnerIds: [] };
  readonly frame: BarkFrame = {
    dt: STEP, controller: {}, world: {}, x: 0, z: 0, headingY: 0, speed: 0, crashed: false, airborne: false,
    discontinuitySerial: 1, modeAllows: true, quiet: false, previous: [], current: [], alpha: 1,
  };
  bubbles = 0;
  /** Frames on which a candidate qualified: each is one roll. */
  rolls = 0;
  /** Occlusion rays cast (one per qualifying-band frame that reached the ray). */
  rays = 0;
  /** Frames on which a shown bubble got brighter than the frame before (a strobe). */
  brightened = 0;
  /** Frames with a person within `AROUND_METRES` of the rider. */
  aroundFrames = 0;
  private wasVisible = false;
  private lastOpacity = 0;

  /** The town's people as they stand now, in a stable order. */
  people(): { x: number; y: number; z: number; headingY: number }[] {
    return this.current.actors.length > 0
      ? this.current.actors.filter((actor) => PEOPLE.has(actor.kind))
      : this.population.snapshot().actors.filter((actor) => PEOPLE.has(actor.kind));
  }
  private lastActor: string | null = null;
  private readonly origin = { x: 0, y: 0, z: 0 };
  private readonly direction = { x: 0, y: 0, z: 0 };

  /** One drawn frame with the rider at this pose. */
  frameAt(x: number, y: number, z: number, headingY: number, speed: number, resetCamera = false): void {
    this.population.step(STEP, [], [], this.anticipation);
    this.population.writePresentationEndpoints(this.previous, this.current);
    const frame = this.frame;
    frame.x = x;
    frame.z = z;
    frame.headingY = headingY;
    frame.speed = speed;
    frame.previous = this.previous.actors;
    frame.current = this.current.actors;
    for (const actor of frame.current) {
      if (PEOPLE.has(actor.kind) && Math.hypot(actor.x - x, actor.z - z) <= AROUND_METRES) {
        this.aroundFrames += 1;
        break;
      }
    }
    this.model.update(frame);
    const camera = this.pane.follow(x, y, z, headingY, speed, resetCamera);
    const output = this.model.output;
    let inBand: boolean | null = null;
    let askerHidden = false;
    if (output.visible && !output.leaving) {
      inBand = this.view.bubbleInBand(camera, output.anchor);
      askerHidden = inBand && bubbleHidden(camera.position, output.actorId ?? '', output.anchor, frame);
    }
    let seen: boolean | null = null;
    let occluded = false;
    const pending = output.pending;
    if (pending !== null && !output.visible) {
      seen = this.view.candidateSeen(camera, pending.anchor, pending.relativeVelocity, { x, y, z });
      if (seen) {
        this.origin.x = camera.position.x;
        this.origin.y = camera.position.y;
        this.origin.z = camera.position.z;
        this.direction.x = pending.anchor.x - this.origin.x;
        this.direction.y = pending.anchor.y - this.origin.y;
        this.direction.z = pending.anchor.z - this.origin.z;
        const distance = Math.hypot(this.direction.x, this.direction.y, this.direction.z);
        this.rays += 1;
        seen = distance > 0 && this.sampler.raycast(this.origin, this.direction, distance) === null;
        if (seen) seen = !candidateHidden(camera.position, pending, frame, speed * Math.sin(headingY), speed * Math.cos(headingY));
        occluded = !seen;
        if (seen) this.rolls += 1;
      }
    }
    this.model.reportView(seen, inBand, this.room, occluded, askerHidden);
    const fresh = output.visible && (!this.wasVisible || output.actorId !== this.lastActor);
    if (fresh) this.bubbles += 1;
    else if (output.visible && output.opacity > this.lastOpacity + 1e-9) this.brightened += 1;
    this.wasVisible = output.visible;
    this.lastActor = output.actorId;
    this.lastOpacity = output.visible ? output.opacity : 0;
  }
}

/**
 * A rider touring the town's people, street by street: each leg starts 40 m
 * from the next person in a fixed rotation, rides a straight line along that
 * person's own heading (the way their path runs) 3 m to one side of them —
 * the road beside the pavement — and carries on 15 m past. Legs alternate
 * direction, so half the passes meet the person head-on and half come up
 * from behind, which is the honest mix for somebody riding up and down
 * populated streets. The camera is snapped to the rider at each leg's start.
 */
class TourRider {
  private leg = -1;
  private travelled = 0;
  private readonly legMetres = 55;
  private startX = 0;
  private startZ = 0;
  private dirX = 0;
  private dirZ = 0;
  x = 0;
  y = 0;
  z = 0;
  headingY = 0;
  legs = 0;

  /** True on the frame a new leg starts (the camera snaps). */
  advance(rig: RateRig, metres: number): boolean {
    this.travelled += metres;
    let fresh = false;
    if (this.leg < 0 || this.travelled >= this.legMetres) {
      this.beginLeg(rig);
      fresh = true;
    }
    this.x = this.startX + this.dirX * this.travelled;
    this.z = this.startZ + this.dirZ * this.travelled;
    return fresh;
  }

  private beginLeg(rig: RateRig): void {
    this.leg += 1;
    this.legs += 1;
    this.travelled = 0;
    const people = rig.people();
    const person = people[Math.floor(this.leg / 2) % people.length];
    const sign = this.leg % 2 === 0 ? 1 : -1;
    this.dirX = Math.sin(person.headingY) * sign;
    this.dirZ = Math.cos(person.headingY) * sign;
    // The road beside the pavement: 3 m to the rider's right of the person.
    const sideX = -this.dirZ;
    const sideZ = this.dirX;
    this.startX = person.x - this.dirX * 40 + sideX * 3;
    this.startZ = person.z - this.dirZ * 40 + sideZ * 3;
    this.y = person.y;
    this.headingY = Math.atan2(this.dirX, this.dirZ);
  }
}

/**
 * A rider riding the town's own path graph without a break: along one path
 * of `role`, then on through one of that end's connections to another path
 * of the same role (rotating through them, so it does not circle one block),
 * turning back only at a dead end. Nothing is re-placed; the camera is
 * snapped once, at the start. Pavements (`pedestrian`) are the people's own
 * paths; roads (`traffic`) run beside them.
 */
class PathRider {
  private readonly role: string;
  private readonly byId: Map<string, PopulationPath>;
  private path: PopulationPath;
  private along = 0;
  private direction = 1;
  private hops = 0;
  private started = false;
  x = 0;
  y = 0;
  z = 0;
  headingY = 0;
  metres = 0;

  constructor(rig: RateRig, role: string, start: number) {
    this.role = role;
    const paths = rig.living.population.paths;
    this.byId = new Map(paths.map((path) => [path.id, path]));
    const pool = paths.filter((path) => path.role === role && path.lengthMetres > 30);
    assert.ok(pool.length > 0, `the town has ${role} paths`);
    this.path = pool[start % pool.length];
  }

  /** True on the first frame only (the camera snaps once). */
  advance(_rig: RateRig, metres: number): boolean {
    this.metres += metres;
    this.along += this.direction * metres;
    // Through as many joints as this frame's distance crosses (short links).
    for (let guard = 0; guard < 8 && (this.along > this.path.lengthMetres || this.along < 0); guard += 1) {
      const end = this.along > this.path.lengthMetres ? 'end' : 'start';
      const overshoot = end === 'end' ? this.along - this.path.lengthMetres : -this.along;
      const next = this.path.connections.filter((link) => link.at === end && this.byId.get(link.pathId)?.role === this.role);
      if (next.length > 0) {
        const link = next[this.hops % next.length];
        this.path = this.byId.get(link.pathId)!;
        this.direction = link.enterAt === 'start' ? 1 : -1;
        this.along = link.enterAt === 'start' ? overshoot : this.path.lengthMetres - overshoot;
      } else {
        this.direction = -this.direction;
        this.along = end === 'end' ? this.path.lengthMetres - overshoot : overshoot;
      }
      this.hops += 1;
    }
    this.along = Math.min(this.path.lengthMetres, Math.max(0, this.along));
    const points = this.path.points;
    let index = 1;
    while (index < points.length - 1 && points[index].distanceMetres < this.along) index += 1;
    const a = points[index - 1];
    const b = points[index];
    const span = b.distanceMetres - a.distanceMetres;
    const t = span > 0 ? Math.min(1, Math.max(0, (this.along - a.distanceMetres) / span)) : 0;
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-6) {
      this.headingY = Math.atan2(b.x - a.x, b.z - a.z) + (this.direction < 0 ? Math.PI : 0);
    }
    const fresh = !this.started;
    this.started = true;
    return fresh;
  }
}

interface ScriptedRider {
  x: number;
  y: number;
  z: number;
  headingY: number;
  advance(rig: RateRig, metres: number): boolean;
}

function ride(rig: RateRig, rider: ScriptedRider, speed: number, seconds: number): number {
  const before = rig.bubbles;
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    const fresh = rider.advance(rig, speed * STEP);
    rig.frameAt(rider.x, rider.y, rider.z, rider.headingY, speed, fresh);
  }
  return rig.bubbles - before;
}

/** The tour's figure, measured once and shared by its two tests below. */
let tour: { rig: RateRig; rider: TourRider; atFour: number; atSix: number; perMinute: number } | null = null;

function rideTheTour(): NonNullable<typeof tour> {
  if (tour !== null) return tour;
  const rig = new RateRig();
  const rider = new TourRider();
  const atFour = ride(rig, rider, 4, 300);
  const atSix = ride(rig, rider, 6, 300);
  tour = { rig, rider, atFour, atSix, perMinute: (atFour + atSix) / 10 };
  return tour;
}

/**
 * The tour's stress ceiling: every leg meets somebody, and the seat cooldown
 * and person memory still keep it from nagging. 1.8 per minute since owner
 * round 2 (measured 1.40, 14 bubbles in 10 min; it was 1.1 at R18): the tour
 * teleports, so the continuous ride is the honest figure.
 */
const TOUR_CEILING_PER_MINUTE = 1.8;

test('the bark rate on the euc town: slow riding, a parked stop, and speed', { timeout: 900_000 }, (t) => {
  // -- Slow riding ------------------------------------------------------------
  const { rig: slow, rider: slowRider, atFour, atSix, perMinute } = rideTheTour();

  // -- Parked by a social group ------------------------------------------------
  const parked = new RateRig();
  const people = parked.population.snapshot().actors.filter((actor) => actor.kind === 'social');
  assert.ok(people.length >= 2, 'the town has a social group');
  const first = people[0];
  const group = people.filter((actor) => Math.hypot(actor.x - first.x, actor.z - first.z) < 4);
  const centreX = group.reduce((sum, actor) => sum + actor.x, 0) / group.length;
  const centreZ = group.reduce((sum, actor) => sum + actor.z, 0) / group.length;
  const centreY = group.reduce((sum, actor) => sum + actor.y, 0) / group.length;
  // Approach along whichever of eight bearings gives the parked camera a clear
  // view of the group (the ghost rider ignores walls; the camera must not).
  let approach = 0;
  for (let k = 0; k < 8; k += 1) {
    const bearing = (k * Math.PI) / 4;
    const cameraX = centreX - Math.sin(bearing) * 9;
    const cameraZ = centreZ - Math.cos(bearing) * 9;
    const direction = { x: centreX - cameraX, y: 0, z: centreZ - cameraZ };
    const clear = parked.sampler.raycast({ x: cameraX, y: centreY + 2, z: cameraZ }, direction, 9) === null
      && parked.sampler.raycast({ x: centreX - Math.sin(bearing) * 33, y: centreY + 1, z: centreZ - Math.cos(bearing) * 33 },
        direction, 30) === null;
    if (clear) {
      approach = bearing;
      break;
    }
  }
  // Ride in from 30 m out at 4 m/s, stopping 3 m short of the group's middle.
  const stopX = centreX - Math.sin(approach) * 3;
  const stopZ = centreZ - Math.cos(approach) * 3;
  const startDistance = 30;
  const rideFrames = Math.round(startDistance / 4 / STEP);
  for (let i = 0; i < rideFrames; i += 1) {
    const left = startDistance - 4 * STEP * (i + 1);
    parked.frameAt(stopX - Math.sin(approach) * left, centreY, stopZ - Math.cos(approach) * left, approach, 4, i === 0);
  }
  const beforeParking = parked.bubbles;
  for (let i = 0; i < Math.round(300 / STEP); i += 1) parked.frameAt(stopX, centreY, stopZ, approach, 0);
  const parkedBubbles = parked.bubbles - beforeParking;

  // -- At speed ------------------------------------------------------------------
  const fast = new RateRig();
  const fastRider = new TourRider();
  const atTwelve = ride(fast, fastRider, 12, 300);

  const report = [
    `the tour (stress case, re-placed by the next person every leg): ${atFour} bubbles in 5 min at 4 m/s, ${atSix} in 5 min at 6 m/s → ${perMinute.toFixed(2)} per minute (${slowRider.legs} passes, ${slow.model.encounterCount} encounters, ${slow.rolls} rolls)`,
    `parked 5 min by a social group of ${group.length}: ${parkedBubbles} bubble(s) (${parked.bubbles - parkedBubbles} on the ride in)`,
    `5 min at 12 m/s: ${atTwelve} bubbles (${fastRider.legs} passes)`,
  ].join('\n');
  t.diagnostic(report);
  console.log(`[bark rate] ${report.replaceAll('\n', '\n[bark rate] ')}`);

  // The tour's floor is only a guard that the pipeline barks at all; the
  // plan's floor is pinned on the continuous ride below, and the tour's
  // ceiling has its own test after this one.
  assert.ok(perMinute >= 0.2, `the tour barked ${perMinute.toFixed(2)} per minute`);
  assert.equal(parkedBubbles, 1, `a parked stop showed ${parkedBubbles} bubbles: a stop beside people asks, once`);
  assert.equal(atTwelve, 0, 'nothing at speed');
  for (const rig of [slow, parked, fast]) assert.equal(rig.brightened, 0, 'a shown bubble never brightens');
});

// The tour's stress ceiling. History: with `passChance` 0.75 (q236) the tour
// measured 1.20 per minute at a 25 s seat cooldown; R15 ruled 35 s (continuous
// 0.33 / tour 1.10 after the critic repair) and R18 pinned 1.1. Owner round 2
// (2026-10-10) asked for barks "easier to trigger": continuous 0.75 / tour 1.40.
test(`the tour stays at or under its stress ceiling of ${TOUR_CEILING_PER_MINUTE} per minute`, { timeout: 900_000 }, () => {
  const { perMinute } = rideTheTour();
  assert.ok(perMinute <= TOUR_CEILING_PER_MINUTE, `the tour barked ${perMinute.toFixed(2)} per minute`);
});

/**
 * Barks per minute of slow riding through the town, owner round 2 (was the
 * plan's 0.3–1.0, §42.3e): measured 0.75 overall, so 0.6–1.2 keeps a margin
 * either way.
 */
const PLAN_RATE_PER_MINUTE = [0.6, 1.2] as const;
/** …and per minute of the time somebody is within 30 m: the owner's "about 1–2 per minute when people are around" (measured 1.31). */
const AROUND_RATE_PER_MINUTE = [1.0, 2.0] as const;

/**
 * The continuous figure, measured once and shared by the two tests below: the
 * hard checks, and the plan's pin (q236, ruled 2026-10-10).
 */
let continuous: {
  perMinute: number; aroundPerMinute: number; aroundMinutes: number; bubbles: number; minutes: number; lines: string[]; brightened: number;
} | null = null;

function rideContinuously(): NonNullable<typeof continuous> {
  if (continuous !== null) return continuous;
  const lines: string[] = [];
  let bubbles = 0;
  let minutes = 0;
  let brightened = 0;
  let aroundFrames = 0;
  for (const [role, label] of [['pedestrian', 'pavements'], ['traffic', 'roads']] as const) {
    for (const start of [0, 7]) {
      const rig = new RateRig();
      const rider = new PathRider(rig, role, start);
      const atFour = ride(rig, rider, 4, 300);
      const atSix = ride(rig, rider, 6, 300);
      bubbles += atFour + atSix;
      minutes += 10;
      brightened += rig.brightened;
      aroundFrames += rig.aroundFrames;
      lines.push(`${label}, start ${start}: ${atFour} bubbles in 5 min at 4 m/s, ${atSix} in 5 min at 6 m/s `
        + `over ${rider.metres.toFixed(0)} m (${rig.model.encounterCount} encounters, ${rig.rolls} rolls, ${rig.rays} occlusion rays)`);
    }
  }
  const aroundMinutes = (aroundFrames * STEP) / 60;
  continuous = {
    perMinute: bubbles / minutes, aroundPerMinute: bubbles / Math.max(1e-9, aroundMinutes), aroundMinutes,
    bubbles, minutes, lines, brightened,
  };
  return continuous;
}

test('the continuous ride: the euc town\'s pavements and roads, no teleporting', { timeout: 900_000 }, (t) => {
  const measured = rideContinuously();
  const report = [
    ...measured.lines,
    `continuous: ${measured.bubbles} bubbles in ${measured.minutes} min → ${measured.perMinute.toFixed(2)} per minute `
      + `(pin ${PLAN_RATE_PER_MINUTE[0]}–${PLAN_RATE_PER_MINUTE[1]}, owner round 2)`,
    `with somebody within ${AROUND_METRES} m: ${measured.aroundMinutes.toFixed(1)} min → ${measured.aroundPerMinute.toFixed(2)} per minute `
      + `(pin ${AROUND_RATE_PER_MINUTE[0]}–${AROUND_RATE_PER_MINUTE[1]})`,
  ].join('\n');
  t.diagnostic(report);
  console.log(`[bark rate] ${report.replaceAll('\n', '\n[bark rate] ')}`);

  // Whatever the owner rules, the promise has to be reachable by just riding,
  // not nag, and never strobe.
  assert.ok(measured.bubbles >= 1, 'riding the town continuously never met a bark');
  assert.ok(measured.perMinute <= PLAN_RATE_PER_MINUTE[1], `continuous riding barked ${measured.perMinute.toFixed(2)} per minute`);
  assert.equal(measured.brightened, 0, 'a shown bubble never brightens');
});

// Owner round 2's band on the honest figure (it was the plan's 0.3–1.0 under
// q236): a minute of slow riding among people should meet a bark or two, and
// the cooldowns keep it from nagging.
test(`owner round 2: ${PLAN_RATE_PER_MINUTE[0]}–${PLAN_RATE_PER_MINUTE[1]} per minute on the continuous ride, `
  + `${AROUND_RATE_PER_MINUTE[0]}–${AROUND_RATE_PER_MINUTE[1]} while people are around`, { timeout: 900_000 }, () => {
  const measured = rideContinuously();
  assert.ok(measured.perMinute >= PLAN_RATE_PER_MINUTE[0] && measured.perMinute <= PLAN_RATE_PER_MINUTE[1],
    `continuous riding barked ${measured.perMinute.toFixed(2)} per minute`);
  assert.ok(measured.aroundPerMinute >= AROUND_RATE_PER_MINUTE[0] && measured.aroundPerMinute <= AROUND_RATE_PER_MINUTE[1],
    `riding among people barked ${measured.aroundPerMinute.toFixed(2)} per minute`);
});
