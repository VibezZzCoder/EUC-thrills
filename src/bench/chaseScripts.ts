/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The chase bench's scripted people — M39 Part P, §39.6b.4 and
 * `docs/M39_CHASE.md` §2g (A-10, R-3, R-4, R-23).
 *
 * Everything here is a **production part driven by a script**, never a new
 * rider model: an outlaw is a `CpuRider` brain with no quarry riding the
 * player's own wheel, and the scripted human cop is the production brain fed
 * one target the way a person with the bearing readout would pick one. The
 * bench that composes them is `chaseBench.ts`; nothing in the game imports
 * either file (`src/bench/` is evidence, not runtime).
 *
 * The three outlaw scripts (§2g):
 *
 *   - **follower** — the canonical spine at skill 1: the M31 bench's route
 *     rider, and the one the one-cop baseline is restated on.
 *   - **evader** — turns at every street loop: a brain on the town ring's
 *     traversal with each loop's *alternate* arm in place of its main arm, so
 *     he leaves the through road at every block and the alley.
 *   - **baiter** — runs the hazards: hazard clearance at its F4 minimum (0 m)
 *     and `followLine` set to the edge of the next hazard on his line, so he
 *     skims every one he meets and a cop copying his line meets it too (R-4).
 *   - **hider** — the owner's 2026-09-25 exploit ("hiding behind obstacles (on
 *     the outside) and watching it run side to side"): rides the route to a
 *     hide spot off the road, behind a solid the road cannot see through
 *     (`findHideSpots`), and parks there, shuffling a couple of metres back
 *     and forth at walking pace.
 *   - **sprinter** — speeding away (the same ride): the canonical line flat
 *     out at the player's pace a human can hold, riding into the overspeed
 *     beeps and under the cutout (`SPRINT_SPEED_SHARE` of top speed), and
 *     cornering near the grip limit. Never hides, never turns back.
 *
 * Deterministic throughout: no clock, no random source.
 */

import { CAMERA, CHASE, EUC } from '../data/tuning.ts';
import type { ActionSnapshot } from '../input/actions.ts';
import type { LevelPlan } from '../level/plan.ts';
import { approach, clamp01, lerp } from '../shared/maths.ts';
import { CpuRider, type CpuPackInput, type CpuQuarry, type CpuView } from '../simulation/cpuRider.ts';
import { createPose, EucController, type EucPose, type Spawn } from '../simulation/EucController.ts';
import { HazardField } from '../simulation/hazards.ts';
import { buildRouteField, type RouteBlocker, type RouteField } from '../simulation/routeField.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from '../simulation/routeSpine.ts';
import { SoftBodyField } from '../simulation/softBodies.ts';
import type { StreetLoops } from '../simulation/streetLoops.ts';
import { createGroundSample, type TerrainSampler } from '../simulation/world.ts';

export type ScriptKind = 'follower' | 'evader' | 'baiter' | 'hider' | 'sprinter';
export const SCRIPT_KINDS: readonly ScriptKind[] = Object.freeze(['follower', 'evader', 'baiter', 'hider', 'sprinter']);

/** How far ahead on his line the baiter looks for the next hazard to skim, metres (§2g). */
export const BAIT_LOOK_METRES = 40;
/** A hazard this far across from the baiter's current line is "on his line", metres. */
export const BAIT_LINE_METRES = 4;

/**
 * How much of the ring the evader's course repeats past one lap, metres, when
 * `RouteSpine.fromTraversal(..., { closeWhenJoined: true })` cannot close it
 * (a seed whose all-alternates traversal does not end within `TIGHT_JOIN` of
 * its start; R-3's fallback). The brain brakes for an unclosed line's end (`routeEnd`) from its
 * braking horizon, so the course runs on past the lap's join by more than
 * that and the brain's cursor is re-seated one lap back at the join — the
 * body is never moved, so nothing is flagged `teleported`.
 */
export const EVADER_OVERLAP_METRES = 320;

// ---------------------------------------------------------------------------
// The evader's course
// ---------------------------------------------------------------------------

/**
 * The town ring ridden through every loop's alternate arm (§2g, A-10).
 *
 * The ring is `plan.streetLoops`' loop with no alternate. Walking its main
 * list, each run of segments that is some other loop's whole main arm is
 * replaced by that loop's alternate, longest match first (a district's whole
 * block beats its half-block through the cross street), so the rider leaves
 * the through road at every block and at the alley. The alternates are listed
 * in the main arm's direction (`StreetLoops` reverses them to close its own
 * rings), so every step rides forward. Null without a ring.
 */
export function evaderTraversal(plan: LevelPlan): { id: string; forward: boolean }[] | null {
  const loops = plan.streetLoops ?? [];
  const ringIndex = loops.findIndex((loop) => loop.alternate.length === 0);
  if (ringIndex < 0) return null;
  const ring = loops[ringIndex].main;
  const out: { id: string; forward: boolean }[] = [];
  for (let at = 0; at < ring.length;) {
    let best = -1;
    let bestLength = 0;
    for (let index = 0; index < loops.length; index += 1) {
      if (index === ringIndex) continue;
      const main = loops[index].main;
      if (main.length <= bestLength || at + main.length > ring.length) continue;
      let matches = true;
      for (let step = 0; step < main.length; step += 1) {
        if (ring[at + step] !== main[step]) { matches = false; break; }
      }
      if (!matches) continue;
      best = index;
      bestLength = main.length;
    }
    if (best >= 0) {
      for (const id of loops[best].alternate) out.push({ id, forward: true });
      at += bestLength;
    } else {
      out.push({ id: ring[at], forward: true });
      at += 1;
    }
  }
  return out;
}

export interface EvaderCourse {
  readonly spine: RouteSpine;
  /** The field the evader's brain reads: built on `spine`, with the overlap's blockers copied onto both laps. */
  readonly field: RouteField;
  /** One lap of the course, metres. Equal to `spine.length` when `closed`. */
  readonly lapLength: number;
  /** R-3's closed traversal: the brain laps on its own and is never re-seated. */
  readonly closed: boolean;
  /** Loops whose alternate arm the course takes. */
  readonly alternates: number;
}

/**
 * `fromTraversal` with R-3's `closeWhenJoined` (§2c): a traversal whose ends
 * meet comes back closed and the evader laps on it; one whose ends do not
 * comes back unclosed and the bench runs the lap-and-overlap course below.
 */
const fromTraversalJoined = (
  plan: LevelPlan,
  traversal: readonly { id: string; forward: boolean }[],
  options?: { readonly closeWhenJoined?: boolean },
): RouteSpine => RouteSpine.fromTraversal(plan, traversal, options);

/** The evader's course for a plan, or null when the plan has no town ring. */
export function buildEvaderCourse(plan: LevelPlan, ground: TerrainSampler): EvaderCourse | null {
  const lap = evaderTraversal(plan);
  if (lap === null || lap.length === 0) return null;
  const loops = plan.streetLoops ?? [];
  const alternateIds = new Set(loops.flatMap((loop) => loop.alternate));
  const alternates = countRuns(lap, alternateIds);

  const joined = fromTraversalJoined(plan, lap, { closeWhenJoined: true });
  if (joined.closed) {
    return { spine: joined, field: buildRouteField(joined, plan, ground, { nav: false }), lapLength: joined.length, closed: true, alternates };
  }

  // The unclosed fallback: one lap, then the lap's first segments again until
  // the course runs EVADER_OVERLAP_METRES past the join.
  const lapLength = joined.length;
  const course = [...lap];
  for (let index = 0; index < lap.length; index += 1) {
    course.push(lap[index]);
    if (fromTraversalJoined(plan, course).length >= lapLength + EVADER_OVERLAP_METRES) break;
  }
  const spine = fromTraversalJoined(plan, course);
  const field = buildRouteField(spine, plan, ground, { nav: false });
  // `routeBlockers` projects each object onto the line once, by a global
  // locate, so an object on the repeated stretch lands on one lap only. Copy
  // each such band onto the other lap, so the brain meets it on both.
  const overlap = spine.length - lapLength;
  const blockers: RouteBlocker[] = [...field.blockers];
  for (const band of field.blockers) {
    if (band.to >= 0 && band.from <= overlap) blockers.push(shiftBand(band, lapLength));
    else if (band.from >= lapLength) blockers.push(shiftBand(band, -lapLength));
  }
  blockers.sort((a, b) => a.from - b.from);
  const shared: RouteField = Object.freeze({ ...field, blockers: Object.freeze(blockers) });
  return { spine, field: shared, lapLength, closed: false, alternates };
}

function shiftBand(band: RouteBlocker, by: number): RouteBlocker {
  return { ...band, from: band.from + by, to: band.to + by };
}

function countRuns(traversal: readonly { id: string }[], ids: ReadonlySet<string>): number {
  let runs = 0;
  let inside = false;
  for (const step of traversal) {
    const here = ids.has(step.id);
    if (here && !inside) runs += 1;
    inside = here;
  }
  return runs;
}

// ---------------------------------------------------------------------------
// The baiter's hazards
// ---------------------------------------------------------------------------

export interface HazardOnLine {
  /** Canonical-spine distance of the centre, metres. */
  readonly distance: number;
  /** Metres left of the spine. */
  readonly lateral: number;
  readonly radius: number;
}

/** Every plan hazard projected onto a spine (globally, as `routeBlockers` does), sorted along it. */
export function hazardsOnLine(plan: LevelPlan, spine: RouteSpine): HazardOnLine[] {
  const located = createSpineLocation();
  const at = createSpineSample();
  const out: HazardOnLine[] = [];
  for (const hazard of plan.hazards ?? []) {
    spine.locate(hazard.centre.x, hazard.centre.z, -1, located);
    spine.sample(located.distance, at);
    const dx = hazard.centre.x - at.x;
    const dz = hazard.centre.z - at.z;
    const lateral = dx * Math.cos(at.headingY) - dz * Math.sin(at.headingY);
    if (Math.abs(lateral) > at.halfWidth + hazard.radius) continue;
    out.push({ distance: located.distance, lateral, radius: hazard.radius });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

// ---------------------------------------------------------------------------
// The hider's spots
// ---------------------------------------------------------------------------

/**
 * A place to hide off the road (the owner's 2026-09-25 exploit): a spot the
 * road beside it cannot see through a solid, and a road point the rider
 * reaches it from in a straight line.
 */
export interface HideSpot {
  readonly x: number;
  readonly z: number;
  /** Canonical-spine distance of the road point he leaves the road at, metres. */
  readonly entry: number;
  /** Metres past the spawn's own distance along the ring the entry lies. */
  readonly ahead: number;
  /** Distance from the road, as the stray rule measures it (`StreetLoops.offRoute`). */
  readonly offRoute: number;
  /** What hides him: `building`, `wall` (long and thin: fences, walls), `prop`, plus `yard` when walled in. */
  readonly label: string;
}

/** The nearest and furthest past the spawn a hide spot's entry may lie, metres of ring. */
export const HIDE_AHEAD_METRES: readonly [number, number] = [25, 450];
/** A hide spot's distance from the line (centre), metres: off the racing line, inside the stray limit (30 m). */
const HIDE_OFF_ROUTE: readonly [number, number] = [3, 27];
/** How much clear ground a hide spot keeps from any solid, metres. */
const HIDE_CLEARANCE = 1.2;
/** The road points a spot is hidden from: the line's centre this far either way along it, metres. */
const HIDE_SIGHT_OFFSETS: readonly number[] = [-24, -16, -8, 0, 8, 16, 24];
/** Of those, how many a solid must cut off at chest height. */
const HIDE_SIGHT_BLOCKED = 3;
/** How far along the ring either side of the spot a straight way in is looked for, metres. */
const HIDE_ENTRY_REACH = 40;
/** Spots at most this many per seed, at least this far apart. */
const HIDE_MAX_SPOTS = 4;
const HIDE_SPREAD_METRES = 40;
/** A spot with a solid this close is tucked in tight against it, metres. */
const HIDE_TIGHT_METRES = 2.5;
/** The shuffle: this far back and forth, at this pace. */
export const HIDE_SHUFFLE_METRES = 2.5;
const HIDE_SHUFFLE_SPEED = 1.2;
/** The hider holds still while a cop is this close, metres (see `nearestCopMetres`). */
export const HIDE_FREEZE_METRES = 8;
/** How far a scripted rider sees a cop in his road, metres, and the cop's size as he rides round him. */
export const SEE_COP_METRES = 60;
const SEE_COP_HALF_LENGTH = 1.0;
const SEE_COP_HALF_WIDTH = 0.8;

/**
 * Every hide spot worth testing on a plan, deterministic: walk the ring ahead
 * of the spawn in 6 m steps, both sides, outward in 2 m steps; keep a spot
 * that is clear ground, `HIDE_OFF_ROUTE` from the line (the stray rule's own
 * measure), cut off by a solid at chest height from at least
 * `HIDE_SIGHT_BLOCKED` of the road points `HIDE_SIGHT_OFFSETS` along the line
 * (behind a building corner, a block, a wall or a fence line), and reachable in
 * a straight line from a road point within `HIDE_ENTRY_REACH`. Then take up
 * to `HIDE_MAX_SPOTS`, `HIDE_SPREAD_METRES` apart, one of each kind first —
 * a building or block, a wall or fence line, a walled yard, a spot tucked
 * tight against its cover — nearest the spawn first.
 */
export function findHideSpots(plan: LevelPlan, spine: RouteSpine, ground: TerrainSampler, loops: StreetLoops, all = false): HideSpot[] {
  const boxes = [...plan.segments.flatMap((segment) => segment.colliders), ...(plan.solids ?? [])]
    .filter((box) => box.halfExtents.y * 2 >= 0.9);
  const at = createSpineSample();
  const located = createSpineLocation();
  const under = createGroundSample();
  /** Plan distance from a point to a box's footprint, metres (0 inside). */
  const toBox = (x: number, z: number, box: (typeof boxes)[number]): number => {
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    const dx = x - box.centre.x;
    const dz = z - box.centre.z;
    const lx = Math.max(0, Math.abs(dx * cos - dz * sin) - box.halfExtents.x);
    const lz = Math.max(0, Math.abs(dx * sin + dz * cos) - box.halfExtents.z);
    return Math.hypot(lx, lz);
  };
  const nearestBox = (x: number, z: number): { box: (typeof boxes)[number] | null; distance: number } => {
    let best: (typeof boxes)[number] | null = null;
    let distance = Infinity;
    for (const box of boxes) {
      const d = toBox(x, z, box);
      if (d < distance) {
        distance = d;
        best = box;
      }
    }
    return { box: best, distance };
  };
  /** Whether a solid cuts the straight line from a to b at `height` above a's ground. */
  const blocked = (ax: number, az: number, bx: number, bz: number, height: number, sweep: number): boolean => {
    ground.sampleGround(ax, az, under);
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6 || ground.raycastObstacle === undefined) return false;
    return ground.raycastObstacle({ x: ax, y: under.height + height, z: az }, { x: dx / length, y: 0, z: dz / length }, length, sweep) !== null;
  };
  const kindOf = (box: (typeof boxes)[number]): string => {
    const long = Math.max(box.halfExtents.x, box.halfExtents.z);
    const thin = Math.min(box.halfExtents.x, box.halfExtents.z);
    if (long >= 3 && thin >= 2) return 'block';
    if (thin <= 0.5 && long >= 1) return 'wall';
    return 'prop';
  };
  /** Solids within 5 m of the spot on at least five of eight bearings: a walled yard. */
  const walledIn = (x: number, z: number): boolean => {
    let sides = 0;
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2;
      if (blocked(x, z, x + Math.sin(angle) * 5, z + Math.cos(angle) * 5, 0.8, 0)) sides += 1;
    }
    return sides >= 5;
  };

  spine.locate(plan.spawn.position.x, plan.spawn.position.z, -1, located);
  const spawnAt = located.distance;
  const length = spine.length;
  const candidates: (HideSpot & { tight: boolean })[] = [];
  for (let ahead = HIDE_AHEAD_METRES[0]; ahead <= HIDE_AHEAD_METRES[1]; ahead += 6) {
    const along = spine.closed ? spawnAt + ahead : Math.min(length, spawnAt + ahead);
    spine.sample(along, at);
    const px = at.x;
    const pz = at.z;
    const heading = at.headingY;
    const halfWidth = at.halfWidth;
    for (const side of [1, -1] as const) {
      for (let off = HIDE_OFF_ROUTE[0]; off <= halfWidth + HIDE_OFF_ROUTE[1]; off += 2) {
        const x = px + Math.cos(heading) * side * off;
        const z = pz - Math.sin(heading) * side * off;
        const cover = nearestBox(x, z);
        if (cover.box === null || cover.distance < HIDE_CLEARANCE || cover.distance > 8) continue;
        spine.locate(x, z, along, located);
        const offRoute = loops.offRoute(x, z, located.offRoute);
        if (offRoute < HIDE_OFF_ROUTE[0] || offRoute > HIDE_OFF_ROUTE[1]) continue;
        const level = located.distance;
        let hidden = 0;
        for (const offset of HIDE_SIGHT_OFFSETS) {
          spine.sample(level + offset, at);
          if (blocked(at.x, at.z, x, z, 1.0, 0)) hidden += 1;
        }
        if (hidden < HIDE_SIGHT_BLOCKED) continue;
        let entry = Number.NaN;
        for (let reach = 0; reach <= HIDE_ENTRY_REACH && Number.isNaN(entry); reach += 4) {
          for (const sign of [-1, 1]) {
            spine.sample(level + sign * reach, at);
            if (!blocked(at.x, at.z, x, z, 0.5, 0.45)) {
              entry = at.distance;
              break;
            }
          }
        }
        if (Number.isNaN(entry)) continue;
        const entryAhead = spine.closed ? ((entry - spawnAt) % length + length) % length : entry - spawnAt;
        if (entryAhead > HIDE_AHEAD_METRES[1] + HIDE_ENTRY_REACH) continue;
        const tight = cover.distance <= HIDE_TIGHT_METRES;
        const label = `${kindOf(cover.box)}${walledIn(x, z) ? ' yard' : ''}${tight ? ' tight' : ''}`;
        candidates.push({ x, z, entry, ahead: entryAhead, offRoute, label, tight });
      }
    }
  }
  candidates.sort((a, b) => a.ahead - b.ahead);
  if (all) return candidates;
  const chosen: HideSpot[] = [];
  const far = (spot: HideSpot): boolean => chosen.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= HIDE_SPREAD_METRES);
  for (const kind of ['block', 'wall', 'yard', 'tight']) {
    const spot = candidates.find((candidate) => candidate.label.includes(kind) && far(candidate));
    if (spot !== undefined && chosen.length < HIDE_MAX_SPOTS) chosen.push(spot);
  }
  for (const spot of candidates) {
    if (chosen.length >= HIDE_MAX_SPOTS) break;
    if (!chosen.includes(spot) && far(spot)) chosen.push(spot);
  }
  chosen.sort((a, b) => a.ahead - b.ahead);
  return chosen.map(({ x, z, entry, ahead, offRoute, label }) => ({ x, z, entry, ahead, offRoute, label }));
}

// ---------------------------------------------------------------------------
// A rider on a wheel: the pose/view bookkeeping every bench body shares
// ---------------------------------------------------------------------------

export interface BenchBody {
  readonly controller: EucController;
  readonly pose: EucPose;
  /** The pose one step ago: closing speeds and teleport detection. */
  readonly previous: { x: number; z: number; speed: number };
  readonly view: { -readonly [K in keyof CpuView]: CpuView[K] };
}

/** A wheel on a plan, exactly as `Game.installChaseWorld` builds one: its own hazards and soft bodies. */
export function createBody(
  plan: LevelPlan,
  ground: TerrainSampler,
  spawn: Spawn,
  tuning: Readonly<Record<string, number>>,
): BenchBody {
  const controller = new EucController(ground, {
    spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
    tuning: { ...tuning },
  });
  const pose = createPose();
  controller.writePose(pose);
  const body: BenchBody = {
    controller,
    pose,
    previous: { x: pose.x, z: pose.z, speed: pose.speed },
    view: {
      x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: 0,
      grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG,
    },
  };
  writeView(body);
  return body;
}

/** `Game.writeCopView`'s fill, from the body's own pose. */
export function writeView(body: BenchBody): void {
  const { pose, view, controller } = body;
  view.x = pose.x;
  view.y = pose.y;
  view.z = pose.z;
  view.headingY = pose.headingY;
  view.speed = pose.speed;
  view.grounded = pose.y - pose.groundY <= 1e-6;
  view.crashed = controller.crashed;
  view.curbAhead = controller.curbHeightAhead;
  view.lateralLimitG = controller.lateralLimit;
}

/** Remember this step's pose as the previous one, before the body moves. */
export function rememberPose(body: BenchBody): void {
  body.previous.x = body.pose.x;
  body.previous.z = body.pose.z;
  body.previous.speed = body.pose.speed;
}

/**
 * Did the last step move the body further than its own wheel could — a crash
 * respawn? The same test `Paddle`'s teleport guard makes: the step's travel
 * against the faster of the two speeds, plus a metre of slack.
 */
export function movedByReset(body: BenchBody, dt: number): boolean {
  const travel = Math.hypot(body.pose.x - body.previous.x, body.pose.z - body.previous.z);
  return travel > Math.max(Math.abs(body.pose.speed), Math.abs(body.previous.speed)) * dt + 1;
}

// ---------------------------------------------------------------------------
// The scripted outlaw
// ---------------------------------------------------------------------------

/** The player's wheel for a scripted outlaw: the default table, cutout share included (no cop share). */
export const OUTLAW_WHEEL: Readonly<Record<string, number>> = Object.freeze({});

/**
 * The sprinter's speed ceiling, a share of the wheel's derived top speed: into
 * the player's overspeed beeps (`EUC.overspeedBeepShare`, 0.87) and under his
 * cutout (`EUC.cutoutSpeedShare`, 0.94) — the pace a human holds flat out
 * without riding the cutout's edge.
 */
export const SPRINT_SPEED_SHARE = 0.90;
/** The sprinter's cornering: the share of the grip limit a committed human carries. */
export const SPRINT_CORNERING_MARGIN = 0.95;

export class ScriptedOutlaw {
  readonly kind: ScriptKind;
  readonly body: BenchBody;
  readonly brain: CpuRider;
  /** Times the evader's cursor was re-seated one lap back (the unclosed-course fallback). */
  laps = 0;
  /** The hider's phase: riding to his spot, turning off the road to it, or parked there. */
  hidePhase: 'ride' | 'approach' | 'parked' = 'ride';
  private readonly course: EvaderCourse | null;
  private readonly hazards: readonly HazardOnLine[];
  private readonly hide: HideSpot | null;
  private readonly pack: { bands: readonly RouteBlocker[]; followLine: number | null } = { bands: [], followLine: null };
  /** The hider's own intent (the brain's is reused only while he rides the road). */
  private readonly hideActions = {
    throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false, swing: false,
    reset: false, cameraCycle: false, pause: false, muteAudio: false,
  };
  private hideLastHeading = Number.NaN;
  private hideClock = 0;
  /**
   * The nearest cop's range, metres, handed in by the bench before `think`:
   * the hider freezes while one is within `HIDE_FREEZE_METRES`, so his shuffle
   * never rides into a cop (a touch is the rider's own bust, and the bench is
   * measuring the cop's).
   */
  nearestCopMetres = Infinity;
  /**
   * The cops he can see, handed in by the bench before `think` (world x/z):
   * a rider with eyes rides round a cop in his road — a parked roadblock, a
   * cop coming at him head-on — the way he rides round a bollard. Each one
   * within `SEE_COP_METRES` is filed as a solid band in his own line's frame
   * (the pack input's bands, which the brain already steers round), so a
   * touch on the bench is a cop who got to him, not a script that could not
   * see (the brutal pass: the scripts rode blind into roadblocks).
   */
  readonly copsInSight: { x: number; z: number }[] = [];
  private readonly copBands: RouteBlocker[] = [];
  private readonly copBandPool: { from: number; to: number; left: number; right: number; safeSpeed: number; facing: 0 | 1 | -1 }[] = [];
  private readonly copAt = createSpineLocation();
  private readonly copSample = createSpineSample();

  constructor(
    kind: ScriptKind,
    plan: LevelPlan,
    ground: TerrainSampler,
    canonical: RouteSpine,
    canonicalField: RouteField,
    evaderCourse: EvaderCourse | null,
    hazards: readonly HazardOnLine[],
    spawn: Spawn,
    hide: HideSpot | null = null,
  ) {
    this.kind = kind;
    this.hide = kind === 'hider' ? hide : null;
    this.body = createBody(plan, ground, spawn, OUTLAW_WHEEL);
    // The evader falls back to the follower's line on a plan with no ring
    // (none in the corpus; the report prints the course either way).
    this.course = kind === 'evader' ? evaderCourse : null;
    this.brain = this.course === null
      ? new CpuRider(canonical, plan, ground, canonicalField)
      : new CpuRider(this.course.spine, plan, ground, this.course.field);
    this.brain.skill = 1;
    // On the player's wheel, so the brain believes the player's cutout edge.
    this.brain.cutoutSpeedShare = EUC.cutoutSpeedShare;
    if (kind === 'baiter') this.brain.hazardClearanceMetres = 0;
    if (kind === 'sprinter') {
      this.brain.cutoutMarginShare = SPRINT_SPEED_SHARE / EUC.cutoutSpeedShare;
      this.brain.corneringMargin = SPRINT_CORNERING_MARGIN;
      this.brain.hotCorneringMargin = SPRINT_CORNERING_MARGIN;
    }
    this.hazards = kind === 'baiter' ? hazards : [];
    // Near the course's metre 0: on the unclosed course the lap's first metres
    // are repeated past the join, and a global locate could seat him there.
    this.brain.place(this.body.view, this.course === null ? -1 : 0);
  }

  /**
   * Think one fixed step: the script's half, which the brain-cost rows leave
   * out (a human's controller is timed, his script is not, §2g). The returned
   * intent is the brain's reused object, valid until its next `step`.
   */
  think(dt: number): ActionSnapshot {
    const { body, brain } = this;
    writeView(body);
    const course = this.course;
    if (course !== null && !course.closed && brain.routeDistance >= course.lapLength + 1) {
      // The lap's join: the course's metre `lapLength` is its metre 0 (the
      // traversal closes exactly on the corpus), so the cursor goes back one
      // lap and the body stays where it is.
      brain.place(body.view, brain.routeDistance - course.lapLength);
      this.laps += 1;
    }
    if (this.hide !== null) {
      const intent = this.hideStep(dt);
      if (intent !== null) return intent;
    }
    this.pack.bands = this.fileCops();
    this.pack.followLine = this.kind === 'baiter' ? this.baitLine() : null;
    return brain.step(dt, body.view, null, this.pack as CpuPackInput);
  }

  /** The cops in sight as solid bands on his own line (see `copsInSight`). */
  private fileCops(): readonly RouteBlocker[] {
    const bands = this.copBands;
    bands.length = 0;
    const spine = this.brain.routeField.spine;
    const here = this.brain.routeDistance;
    const view = this.body.view;
    for (const cop of this.copsInSight) {
      if (Math.hypot(cop.x - view.x, cop.z - view.z) > SEE_COP_METRES) continue;
      spine.locate(cop.x, cop.z, here, this.copAt);
      spine.sample(this.copAt.distance, this.copSample);
      const lateral = (cop.x - this.copSample.x) * Math.cos(this.copSample.headingY)
        - (cop.z - this.copSample.z) * Math.sin(this.copSample.headingY);
      let band = this.copBandPool[bands.length];
      if (band === undefined) {
        band = { from: 0, to: 0, left: 0, right: 0, safeSpeed: 0, facing: 0 };
        this.copBandPool[bands.length] = band;
      }
      band.from = this.copAt.distance - SEE_COP_HALF_LENGTH;
      band.to = this.copAt.distance + SEE_COP_HALF_LENGTH;
      band.left = lateral + SEE_COP_HALF_WIDTH;
      band.right = lateral - SEE_COP_HALF_WIDTH;
      bands.push(band);
    }
    return bands;
  }

  /**
   * Start already hidden: parked at his spot (the bench stands the body there
   * and puts Dorkins on the road up the ring, `HIDDEN_COP_BACK_METRES`).
   */
  startHidden(): void {
    if (this.hide === null) return;
    this.hidePhase = 'parked';
    this.hideClock = 0;
  }

  /**
   * The hider's half: null while he still rides the road to his entry (the
   * follower's brain drives), then his own intent — straight at the spot at a
   * pace that stops on it, then the shuffle. The steering law is the brain's
   * (`steerGain` on the bearing, `steerDamping` on the turn rate).
   */
  private hideStep(dt: number): ActionSnapshot | null {
    const hide = this.hide!;
    const { body, brain } = this;
    const view = body.view;
    if (this.hidePhase === 'ride') {
      let toEntry = hide.entry - brain.routeDistance;
      const whole = brain.routeField.spine.length;
      if (brain.routeField.spine.closed) {
        if (toEntry > whole / 2) toEntry -= whole;
        else if (toEntry < -whole / 2) toEntry += whole;
      }
      if (toEntry > 1) {
        this.hideLastHeading = view.headingY;
        return null;
      }
      this.hidePhase = 'approach';
    }
    const actions = this.hideActions;
    const dx = hide.x - view.x;
    const dz = hide.z - view.z;
    const range = Math.hypot(dx, dz);
    const turnRate = Number.isFinite(this.hideLastHeading) && dt > 0
      ? Math.atan2(Math.sin(view.headingY - this.hideLastHeading), Math.cos(view.headingY - this.hideLastHeading)) / dt
      : 0;
    this.hideLastHeading = view.headingY;
    if (this.hidePhase === 'approach') {
      const bearing = Math.atan2(Math.sin(Math.atan2(dx, dz) - view.headingY), Math.cos(Math.atan2(dx, dz) - view.headingY));
      const wanted = Math.min(7, Math.sqrt(2 * 2.0 * Math.max(0, range - 0.4)), Math.abs(bearing) > 1.2 ? 2.5 : Infinity);
      actions.throttle = Math.max(-1, Math.min(1, (wanted - view.speed) * 0.6));
      actions.steer = Math.max(-1, Math.min(1, -brain.steerGain * bearing + brain.steerDamping * turnRate));
      if (range < 0.8 && Math.abs(view.speed) < 0.6) {
        this.hidePhase = 'parked';
        this.hideClock = 0;
      }
      return actions;
    }
    // Parked: back and forth along his heading at walking pace, never
    // turning — and still while a cop is close.
    const frozen = this.nearestCopMetres <= HIDE_FREEZE_METRES;
    if (!frozen) this.hideClock += dt;
    const leg = HIDE_SHUFFLE_METRES / HIDE_SHUFFLE_SPEED;
    const wanted = frozen ? 0 : Math.floor(this.hideClock / leg) % 2 === 0 ? HIDE_SHUFFLE_SPEED : -HIDE_SHUFFLE_SPEED;
    actions.throttle = Math.max(-1, Math.min(1, (wanted - view.speed) * 0.8));
    actions.steer = 0;
    return actions;
  }

  /** Ride one fixed step on an intent: the controller's half, the one a human seat has too. */
  ride(dt: number, intent: ActionSnapshot): void {
    rememberPose(this.body);
    this.body.controller.step(dt, intent);
    this.body.controller.writePose(this.body.pose);
  }

  /** The edge of the next hazard on his line within BAIT_LOOK_METRES, or null (§2g's baiter). */
  private baitLine(): number | null {
    const here = this.brain.routeDistance;
    const lateral = this.brain.lineLateral;
    for (const hazard of this.hazards) {
      if (hazard.distance <= here) continue;
      if (hazard.distance > here + BAIT_LOOK_METRES) break;
      if (Math.abs(hazard.lateral - lateral) > hazard.radius + BAIT_LINE_METRES) continue;
      const side = lateral >= hazard.lateral ? 1 : -1;
      return hazard.lateral + side * hazard.radius;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// The scripted human cop's target (R-23)
// ---------------------------------------------------------------------------

/** A nearer standing outlaw must be this much nearer before the scripted human cop swaps, metres (R-23). */
export const HUMAN_SWAP_METRES = 10;
/** ... and stay that much nearer this long, seconds (R-23). */
export const HUMAN_SWAP_SECONDS = 1;

/**
 * Who a human in the cop seat is riding at: the nearest standing outlaw by
 * straight line, as the bearing readout (q220) names him — with R-23's
 * hysteresis, so `CpuQuarry.id` does not flip on every near-tie and reset the
 * brain's range memory (the §21.8 thrash the id exists to prevent). A downed
 * target is dropped at once.
 */
export class HumanCopTarget {
  target = -1;
  private challenger = -1;
  private challengeSeconds = 0;

  choose(dt: number, distances: readonly number[], standing: readonly boolean[]): number {
    let nearest = -1;
    for (let k = 0; k < distances.length; k += 1) {
      if (!standing[k]) continue;
      if (nearest < 0 || distances[k] < distances[nearest]) nearest = k;
    }
    if (this.target >= 0 && !standing[this.target]) this.target = -1;
    if (this.target < 0) {
      this.target = nearest;
      this.challenger = -1;
      this.challengeSeconds = 0;
      return this.target;
    }
    if (nearest >= 0 && nearest !== this.target
      && distances[nearest] <= distances[this.target] - HUMAN_SWAP_METRES) {
      if (this.challenger !== nearest) {
        this.challenger = nearest;
        this.challengeSeconds = 0;
      }
      this.challengeSeconds += dt;
      if (this.challengeSeconds >= HUMAN_SWAP_SECONDS) {
        this.target = nearest;
        this.challenger = -1;
        this.challengeSeconds = 0;
      }
    } else {
      this.challenger = -1;
      this.challengeSeconds = 0;
    }
    return this.target;
  }
}

/** The quarry a brain is handed for body `body`, id'd as outlaw `k`. Allocates once per caller. */
export function writeQuarry(out: { x: number; y: number; z: number; speed: number; id: number }, body: BenchBody, k: number): CpuQuarry {
  out.x = body.pose.x;
  out.y = body.pose.y;
  out.z = body.pose.z;
  out.speed = body.pose.speed;
  out.id = k;
  return out;
}

// ---------------------------------------------------------------------------
// A seat's camera, three-free
// ---------------------------------------------------------------------------

/**
 * One human pane's camera as `render/chaseCamera.ts` places it, re-derived from
 * the pose so the bench stays three-free: the follow yaw approaches the rider's
 * heading with the lag `lerp(yawLagAtRest, yawLagAtSpeed, speedFactor)`, the arm
 * approaches `lerp(distanceAtRest, distanceAtSpeed, speedFactor)` over
 * `distanceResponseSeconds`, and the camera stands `arm` behind the rider along
 * that yaw — `chaseCamera.ts`'s `input − sin(yaw) × distance` exactly. The crash
 * framing, obstruction pull-in and bank are left out: they move the camera
 * along its own arm or roll it, never turn it, and the cone rows ask only
 * where it points.
 */
export class PaneCamera {
  x = 0;
  z = 0;
  /** Unwrapped, as the camera's own yaw is. */
  yaw = 0;
  private distance: number = CAMERA.distanceAtRest;
  private lastHeading = 0;

  /** Snap behind a pose: `ChaseCamera.snap`'s arithmetic. */
  snap(pose: { readonly x: number; readonly z: number; readonly headingY: number }): void {
    this.yaw = pose.headingY;
    this.lastHeading = pose.headingY;
    this.distance = CAMERA.distanceAtRest;
    this.place(pose);
  }

  step(dt: number, pose: { readonly x: number; readonly z: number; readonly headingY: number; readonly speed: number }): void {
    // Unwrap the pose's heading onto the camera's own branch, so the approach
    // never crosses the seam the long way.
    const turn = Math.atan2(Math.sin(pose.headingY - this.lastHeading), Math.cos(pose.headingY - this.lastHeading));
    const heading = this.lastHeading + turn;
    this.lastHeading = heading;
    const speedFactor = clamp01(Math.abs(pose.speed) / CAMERA.speedReference);
    this.distance = approach(
      this.distance,
      lerp(CAMERA.distanceAtRest, CAMERA.distanceAtSpeed, speedFactor),
      CAMERA.distanceResponseSeconds,
      Infinity,
      dt,
    );
    this.yaw = approach(this.yaw, heading, lerp(CAMERA.yawLagAtRest, CAMERA.yawLagAtSpeed, speedFactor), Infinity, dt);
    this.place(pose);
  }

  private place(pose: { readonly x: number; readonly z: number }): void {
    this.x = pose.x - Math.sin(this.yaw) * this.distance;
    this.z = pose.z - Math.cos(this.yaw) * this.distance;
  }
}

/**
 * A pane's horizontal half-angle at speed, radians (§2g, R-21):
 * `atan(tan(fov / 2) × aspect)` for the layout the room's human count makes —
 * one view the 16:9 solo pane at `fovAtSpeed`; two the side-by-side split
 * (960 × 1080 of a 1080p screen) at `min(fovAtSpeed × splitFovGain,
 * splitFovCap)`; three or four the 16:9 quadrant at `fovAtSpeed × quadFovGain`.
 */
export function paneHalfAngle(views: number): number {
  if (views <= 1) return Math.atan(Math.tan(CAMERA.fovAtSpeed / 2) * (16 / 9));
  if (views === 2) {
    const fov = Math.min(CAMERA.fovAtSpeed * CAMERA.splitFovGain, CAMERA.splitFovCap);
    return Math.atan(Math.tan(fov / 2) * (960 / 1080));
  }
  return Math.atan(Math.tan((CAMERA.fovAtSpeed * CAMERA.quadFovGain) / 2) * (16 / 9));
}

/** Re-export for the bench: the CHASE constants the scripts share with it. */
export const SCRIPT_CONSTANTS = Object.freeze({
  baitLookMetres: BAIT_LOOK_METRES,
  baitLineMetres: BAIT_LINE_METRES,
  evaderOverlapMetres: EVADER_OVERLAP_METRES,
  humanSwapMetres: HUMAN_SWAP_METRES,
  humanSwapSeconds: HUMAN_SWAP_SECONDS,
  riderHitRadius: CHASE.riderHitRadius,
});
