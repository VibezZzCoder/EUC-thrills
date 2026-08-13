/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE, EUC, HAZARD, PADDLE, PHYSICS, RIDER, TARGET, TERRAIN, WHEEL } from '../data/tuning.ts';
import { SURFACES } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { DEFAULT_SPACING, fieldHeightAt, type HazardSpec, type TargetSpec } from './buildPlan.ts';
import type { BoxCollider, Checkpoint, HazardKind, LevelPlan } from './plan.ts';
import { withinRenderBudget } from './renderBudget.ts';
import {
  DEFAULT_SHOULDER,
  centrelineAt,
  gradientAt,
  headingAt,
  leftOf,
  querySegment,
  surfaceAtLateral,
  surfaceHeightAt,
  type PlacedSegment,
} from './segments.ts';
import { REQUIRED_ROUTE_FLOOR_METRES, transitionIsLegible } from './segmentLibrary.ts';

/**
 * What a route has to be true of before it is allowed to exist — M12 Phase 2.
 *
 * Master §6.4: **validate the invariants that cannot be seen.** A screenshot
 * shows a route that looks like a place; it cannot show that the jump is
 * landable at the speed its own approach produces, that the shortcut rejoins,
 * that no gap is narrower than the machine, or that the frame will survive the
 * scene. Those are the failures that cost the most time, and every one of them
 * is decided here, headlessly, before a mesh exists.
 *
 * ## Eight contracts
 *
 *   1. **Clearance and fit**, derived from the wheel rather than written down.
 *   2. **The required route meets the run-length floor on its own** — with every
 *      optional branch dropped, because a run that legitimately drops one must
 *      not ship short (master §6.3).
 *   3. **Every jump is landable at the speed its approach actually produces.**
 *   4. **Every shortcut reconnects** to the route it left.
 *   5. **No corridor crosses another at a height the wheel cannot climb**, which
 *      is the seam failure master §6.2 describes in this level's own terms.
 *   6. **No unrideable gradient on the required path.**
 *   7. **Surface transitions are legible** rather than arbitrary.
 *   8. **Predicted render cost is inside the §9 ceilings** — the seventh
 *      contract `docs/PLANS.md` §10 adds at M12, and the reason Phase 0 came
 *      first.
 *   9. **The route stays inside the band of ground the surround can blend to**
 *      — added after the owner's first ride, because a route perched above its
 *      own field turns every shoulder into an embankment.
 *  10. **No corridor banks into another** at a face no shoulder could make,
 *      which is the same ride's other structural finding: two corridors can
 *      miss each other in plan and still leave a vertical wall between them.
 *  11. **Every corridor's own shoulder can reach the surround**, so the route
 *      sits in ground rather than on a plinth of it.
 *  12. **Four rules about what the generator put in the road** — M13 Phase 3.
 *      Every hazard leaves a line past it, is not hidden by the ground until it
 *      is too late to steer aside, is far enough from the last one to have
 *      recovered, and is nowhere the rider has no choice: a jump, a gate, a
 *      socket, or road the timed run has not begun on. These four are
 *      **post-conditions on `placeHazards`** rather than filters it leans on —
 *      see the hazard section for why that is a different shape from the eleven
 *      above and has to be.
 *
 * ## Retry, never repair
 *
 * Nothing here fixes anything. A verdict is a list of failures and the
 * generator's only response to a failure is to draw another route (master
 * §6.4) — because a generator that trims dressing until a route fits is a
 * generator that ships a world with its own set pieces quietly removed, and
 * because repair is how a generator accumulates a hundred special cases and
 * still ships a world the player cannot leave.
 *
 * ## The fallback validates itself
 *
 * The hand-authored slice is the fallback, and master §6.4 is explicit that a
 * fallback is also an emitted world and must validate *itself* rather than be
 * grandfathered. Every rule below is one the slice passes, and
 * `generatedLevel.test.ts` proves it by running the whole validator over
 * `createSliceLevel()`. That constraint is what stops the validator drifting
 * into a set of opinions: a rule the accepted level fails is a wrong rule.
 *
 * Nothing here may import three.js (invariant 1).
 */

// ---------------------------------------------------------------------------
// Derived from the wheel
// ---------------------------------------------------------------------------

/**
 * Clearance, derived. Master §6.1: "derive it rather than writing it down."
 *
 * A constant sized for the smallest actor silently ships a world the biggest
 * one can wedge itself in, and adding a bigger variant is then a layout change
 * rather than a table edit. Every number here is a property of the machine in
 * `data/tuning.ts`, so a wider wheel moves the world rather than the world
 * quietly stopping to fit it.
 */
export const ROUTE_CLEARANCE = {
  /**
   * Half the widest travelling extent of the machine.
   *
   * The pedals, not the tyre: a 0.075 m tyre passes through gaps the 0.52 m
   * pedal span cannot, and it is the pedals that catch.
   */
  actorRadius: WHEEL.pedalSpan / 2,
  /**
   * The margin on top, in metres.
   *
   * One tyre diameter. A gap that admits the machine exactly is a gap a rider
   * cannot aim at — steering is a lean, not a slot car — so the room to miss by
   * is part of the clearance rather than a nicety. Deriving it from the wheel
   * keeps it in proportion to the thing being aimed.
   */
  margin: WHEEL.tyreDiameter,
  /** `MIN_GAP = MAX_ACTOR_RADIUS * 2 + CLEARANCE_MARGIN`, master §6.1 verbatim. */
  get minGap(): number {
    return this.actorRadius * 2 + this.margin;
  },
  /** The tallest step the wheel can lever itself onto. Shared with the controller. */
  get maxStepUp(): number {
    return WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
  },
} as const;

/**
 * The wheel's own limits, derived, as the speed model and the gradient rule need.
 */
export const RIDEABILITY = {
  /** Acceleration at full lean, m/s². */
  get driveAccel(): number {
    return EUC.leanToAccel * Math.sin(EUC.maxLeanPitch);
  },
  /**
   * Where drag balances drive, m/s. The wheel's top speed, emergent.
   *
   * `drag = dragCoefficient * v * |v|`, so `v = sqrt(driveAccel / dragCoefficient)`.
   * Read out of the controller's own constants rather than quoted from a
   * comment, so it follows a tuning change.
   */
  get topSpeed(): number {
    return Math.sqrt(this.driveAccel / EUC.dragCoefficient);
  },
  /** Lateral acceleration ceiling, m/s². The carve limit. */
  get lateralAccel(): number {
    return EUC.maxLateralG * PHYSICS.gravity;
  },
  /**
   * The gradient at which full lean exactly cancels gravity — the stall grade.
   *
   * Above it the wheel cannot climb at all. A required route may not go
   * anywhere near it: at the stall grade the rider has no authority left for
   * steering or for recovering a wobble, so the ceiling below reserves half of
   * it. The slice's steepest required grade is a long way inside that, which is
   * the check that keeps the reserve honest rather than arbitrary.
   */
  get stallGradient(): number {
    return Math.asin(Math.min(1, this.driveAccel / PHYSICS.gravity));
  },
  /** Half the stall grade: the wheel keeps half its authority in reserve. */
  get maxRequiredGradient(): number {
    return this.stallGradient / 2;
  },
  /**
   * How long the wheel is off the ground on a fully charged hop, seconds.
   *
   * `hopLaunchSpeed` gives the height at zero charge; `hopChargeHeightBonus`
   * raises the *height*, so the launch speed at full charge is the square root
   * of the ratio. Airtime is the up and the down.
   */
  get hopAirtime(): number {
    const height = (EUC.hopLaunchSpeed ** 2 / (2 * PHYSICS.gravity))
      * (1 + EUC.hopChargeHeightBonus);
    return 2 * Math.sqrt((2 * height) / PHYSICS.gravity);
  },
  /** How far a fully charged hop carries at a given speed, metres. */
  hopDistanceAt(speed: number): number {
    return speed * this.hopAirtime;
  },
  /** The fastest a corridor of this curvature may be taken, m/s. */
  curveSpeedLimit(curvature: number): number {
    const magnitude = Math.abs(curvature);
    if (magnitude < 1e-9) return Infinity;
    return Math.sqrt(this.lateralAccel / magnitude);
  },
} as const;

// ---------------------------------------------------------------------------
// What a validator is handed
// ---------------------------------------------------------------------------

/** A jump the route contains: a lip, and the corridor meant to catch the rider. */
export interface RouteJump {
  readonly name: string;
  readonly lipId: string;
  readonly landingId: string;
}

/** A second line that leaves the route and is expected back. */
export interface RouteShortcut {
  readonly name: string;
  /** The segment it leaves from. */
  readonly fromId: string;
  /** The last segment of the shortcut. */
  readonly exitId: string;
  /** The through-line segment it is expected to rejoin. */
  readonly rejoinId: string;
}

export interface RouteLayout {
  readonly plan: LevelPlan;
  readonly placed: readonly PlacedSegment[];
  /** Through-line segment ids, in riding order. */
  readonly throughIds: readonly string[];
  /** Everything a dropped-optional build would not contain. */
  readonly optionalIds: readonly string[];
  readonly jumps: readonly RouteJump[];
  readonly shortcuts: readonly RouteShortcut[];
  /**
   * What the generator put in the road, as it authored it — M13 Phase 3.
   *
   * **The authoring, not the resolved footprint**, and the difference is the
   * reason it is a layout fact rather than being read back off `plan.hazards`.
   * A hazard is authored as `(segment, s, t)` and every rule below is about
   * *that*: how far along the required route it sits, how near a socket, how
   * much lane it leaves in the corridor it was placed in. Recovering the
   * carrier from a world point instead would mean guessing, and on a route that
   * folds over itself two corridors share ground — so the contract could
   * measure a hazard against a segment the generator never put it on and fail a
   * route for a fact about a different piece of road.
   *
   * Absent on every layout that carries none, which is the hand-authored slice,
   * the proving ground and every fixture.
   */
  readonly hazards?: readonly HazardSpec[];
  /**
   * What the generator put on the verges, as it authored it — M14.
   *
   * `hazards` above, and the same argument: a target is authored as
   * `(segment, s, t)` and every rule below is about *that* — how far along the
   * required route it sits, how much of the corridor its pad reaches into, what
   * the ground under its foot is doing. Recovering the carrier from a world
   * point would mean guessing, and on a route that folds over itself two
   * corridors share ground.
   *
   * Absent on every layout that carries none, which is the slice, the proving
   * ground and every fixture.
   */
  readonly targets?: readonly TargetSpec[];
  /** Which segments touch which, so a seam is not mistaken for a crossing. */
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Which library piece each segment came from.
   *
   * The seam contract needs it: geometry *inside* an authored beat is the
   * owner's and is already accepted, and the generator is answerable only for
   * the joins it chose between pieces.
   */
  readonly pieceOf: ReadonlyMap<string, string>;
}

export interface RouteFailure {
  readonly contract:
    | 'clearance'
    | 'run-length'
    | 'landable'
    | 'reconnect'
    | 'seam'
    | 'bank'
    | 'shoulder'
    | 'gradient'
    | 'surface'
    | 'elevation'
    | 'render-budget'
    // M13 Phase 3. Four post-conditions on `placeHazards`, not four filters it
    // relies on — see the hazard section below for why that distinction is the
    // whole design and not a nicety.
    | 'hazard-line'
    | 'hazard-sight'
    | 'hazard-density'
    | 'hazard-zone'
    // M14. Post-conditions on `placeTargets`, on exactly the same terms and for
    // exactly the same reason as the four above.
    | 'target-reach'
    | 'target-stand'
    | 'target-density';
  readonly detail: string;
}

/**
 * How far the route may stray from the ground around it, metres.
 *
 * **Derived from the accepted level, and added after the owner's first ride of
 * a generated route.** The hand-authored slice runs from 6.7 m below its
 * surround to 0.6 m above it: a river valley cut into a city, with shoulders
 * that blend back over seven metres and read as banks you can ride down.
 *
 * A generator has no such instinct. Strung together, the beats' own climbs —
 * the return climb rises five metres, the gravel spur and trailhead a metre
 * between them — put one of the seeds he rode **13.2 m above its surround**,
 * which turns every shoulder into an embankment: dressing on banks, kerbs
 * overhanging drops, buildings looming out of cuttings. None of it is invalid
 * and all of it looks wrong.
 *
 * Six point seven metres is what the slice spends, so it is what a generated
 * route gets, plus a centimetre so the reference level sits *inside* its own
 * bound rather than exactly on the line of it. It is a **deviation** rather
 * than a range, because a route that climbs and comes back is fine and one that
 * climbs and stays is not.
 */
export const ROUTE_ELEVATION_BAND = 6.71;

export interface RouteVerdict {
  readonly valid: boolean;
  readonly failures: readonly RouteFailure[];
  /** Through-line length, metres. */
  readonly requiredLength: number;
  /** Steepest gradient anywhere on the through line, radians. */
  readonly steepestRequiredGradient: number;
  /** Furthest the route strays from the surround, metres. */
  readonly worstElevationDrift: number;
  /** Speed reached at each through-line segment's exit, m/s. */
  readonly speedProfile: ReadonlyMap<string, number>;
}

// ---------------------------------------------------------------------------
// The speed model
// ---------------------------------------------------------------------------

/**
 * How fast the rider is going by the time they get there.
 *
 * **A deliberately conservative forward pass, not a simulation.** It integrates
 * `v² += 2·a·ds` along the through line with the controller's own drive, drag,
 * rolling-resistance and slope terms, clamped to the corridor's carve limit —
 * which under-reads the real ride, because it never brakes and never takes a
 * line. What it is *for* is a comparison: the M12 landability contract asks
 * whether a generated approach delivers at least what the hand-authored
 * approach delivers, and a model that is wrong in the same direction on both
 * sides answers that honestly. `EucController` remains the only authority on
 * what actually happens.
 */
export function speedProfile(
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
): Map<string, number> {
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const profile = new Map<string, number>();
  let speed = 0;

  for (const id of throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    const { spec } = segment;
    const surface = SURFACES[spec.surface];
    const limit = Math.min(
      RIDEABILITY.topSpeed,
      RIDEABILITY.curveSpeedLimit(spec.curvature ?? 0),
    );

    const steps = Math.max(1, Math.ceil(spec.length / 2));
    const ds = spec.length / steps;
    for (let step = 0; step < steps; step += 1) {
      const s = (step + 0.5) * ds;
      const gradient = gradientAt(spec, s);
      const accel = RIDEABILITY.driveAccel
        - EUC.dragCoefficient * speed * speed
        - surface.rollingResistance * TERRAIN.rollingResistanceScale
        - PHYSICS.gravity * Math.sin(gradient);
      const squared = speed * speed + 2 * accel * ds;
      speed = squared <= 0 ? 0 : Math.sqrt(squared);
      if (speed > limit) speed = limit;
    }

    profile.set(id, speed);
  }

  return profile;
}

// ---------------------------------------------------------------------------
// The contracts
// ---------------------------------------------------------------------------

/** Is a point inside a yawed box, in the ground plane? */
function insideBox(collider: BoxCollider, x: number, z: number): boolean {
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  const dx = x - collider.centre.x;
  const dz = z - collider.centre.z;
  // The inverse of the yaw above: local +X is the corridor's left and local +Z
  // runs along it, which is the frame `collidersOf` built the box in.
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= collider.halfExtents.x && Math.abs(localZ) <= collider.halfExtents.z;
}

/**
 * The widest clear lane through a corridor, and nothing narrower than the machine.
 *
 * **Master §6.1, translated honestly.** The master's rule is about a slot an
 * actor can be shoved into and cannot get out of, in a game with crowd push-out.
 * This game has neither a crowd nor push-out, and the hand-authored slice is
 * full of gaps narrower than the wheel that are not traps at all — the alley's
 * step treads sit a tenth of a metre apart because they are a *staircase*, and
 * a bench sits beside its bin. A pairwise minimum-gap rule rejects the level
 * the owner rides, which by master §6.4's fallback rule makes it the wrong rule.
 *
 * What the master is actually protecting is the property that matters here too:
 * **the route stays passable**. So the measurement is the one that answers it —
 * walk the required corridor, and at every station find the widest lateral run
 * of it that no unclimbable solid blocks. A pinch below `MIN_GAP` is a wall
 * across the route, and it is invisible on a map and invisible to any
 * connectivity check.
 *
 * A solid only blocks where its **top face** stands more than the wheel can
 * lever itself onto above the corridor surface. That is what keeps a kerb a
 * kerb and a stair tread a stair tread rather than either becoming a wall.
 */
function checkClearance(layout: RouteLayout): RouteFailure[] {
  const failures: RouteFailure[] = [];
  const byId = new Map(layout.placed.map((placed) => [placed.spec.id, placed]));
  const minGap = ROUTE_CLEARANCE.minGap;
  const solids = solidGrid(layout);

  for (const id of layout.throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    const { spec } = segment;
    const stations = Math.max(2, Math.ceil(spec.length / SWEEP_STATION_METRES));

    for (let station = 0; station <= stations; station += 1) {
      const s = (spec.length * station) / stations;
      const widest = widestClearLane(segment, s, solids, []);

      if (widest < minGap) {
        failures.push({
          contract: 'clearance',
          detail: `${id} is pinched to ${widest.toFixed(2)} m of clear lane ` +
            `${s.toFixed(0)} m in, under the ${minGap.toFixed(2)} m the machine needs ` +
            `(${(ROUTE_CLEARANCE.actorRadius * 2).toFixed(2)} m of pedal span plus ` +
            `${ROUTE_CLEARANCE.margin.toFixed(2)} m to aim with)`,
        });
        // One report is enough to reject a route; a hundred is noise.
        return failures;
      }
    }
  }

  return failures;
}

/** Longitudinal spacing of the lane sweep's stations, metres. */
const SWEEP_STATION_METRES = 3;

/**
 * Lateral spacing of the lane sweep's samples, metres.
 *
 * A fifth of the machine's own width, so a pinch cannot hide between two
 * samples: anything narrower than this is far narrower than a gap the wheel
 * could use, and anything wider is measured to within a fifth of a wheel.
 */
const SWEEP_LATERAL_METRES = 0.25;

/**
 * Every unclimbable solid in the level, bucketed for a walk across it.
 *
 * A hundred-station walk across a route with six hundred solids is sixty
 * thousand pair tests done the naive way, and this runs inside a seed sweep.
 * Built once per verdict and shared by both sweeps that need it (M13 Phase 3
 * added the second), because building it twice is the whole cost of the check.
 */
export interface SolidGrid {
  readonly cell: number;
  readonly buckets: ReadonlyMap<string, readonly BoxCollider[]>;
}

function solidGrid(layout: RouteLayout): SolidGrid {
  const solids: BoxCollider[] = [];
  for (const segment of layout.plan.segments) solids.push(...segment.colliders);
  solids.push(...(layout.plan.solids ?? []));
  return colliderGrid(solids);
}

/**
 * The same grid, from a bare collider list.
 *
 * `placeHazards` runs before a `LevelPlan` exists and has to measure the same
 * road the contract will, so it builds this from `collidersOf` directly.
 * Settling a block (`BuildOptions.settleBlocks`) only ever carries its *base*
 * downward and never moves its top face, and the top face is the whole of what
 * decides whether a solid blocks — so the pre-plan grid and the plan's grid
 * answer identically for every collider that matters here.
 */
export function colliderGrid(solids: readonly BoxCollider[]): SolidGrid {
  const cell = 12;
  const buckets = new Map<string, BoxCollider[]>();
  for (const solid of solids) {
    const reach = Math.hypot(solid.halfExtents.x, solid.halfExtents.z);
    for (let x = solid.centre.x - reach; x <= solid.centre.x + reach + cell; x += cell) {
      for (let z = solid.centre.z - reach; z <= solid.centre.z + reach + cell; z += cell) {
        const at = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
        const list = buckets.get(at);
        if (list === undefined) buckets.set(at, [solid]);
        else list.push(solid);
      }
    }
  }
  return { cell, buckets };
}

/**
 * The widest lateral run of a corridor that nothing blocks, at one station.
 *
 * **The measurement master §6.1 is actually asking for**, extracted at M13
 * Phase 3 so the clearance contract and the hazard-avoidability contract cannot
 * measure the same road two different ways. A solid blocks only where its top
 * face stands more than the wheel can lever itself onto above the corridor
 * surface, which is what keeps a kerb a kerb and a stair tread a stair tread.
 * A hazard footprint blocks unconditionally: a hole is not a thing you mount.
 */
function widestClearLane(
  segment: PlacedSegment,
  s: number,
  solids: SolidGrid,
  footprints: readonly BlockingFootprint[],
  rideable: ReadonlySet<SurfaceId> | null = null,
): number {
  const { spec, entry } = segment;
  const stepUp = ROUTE_CLEARANCE.maxStepUp;
  const centre = centrelineAt(entry, spec, s);
  const left = leftOf(headingAt(entry, spec, s));

  let widest = 0;
  let run = 0;
  for (let t = -spec.halfWidth; t <= spec.halfWidth; t += SWEEP_LATERAL_METRES) {
    const x = centre.x + left.x * t;
    const z = centre.z + left.z * t;
    const ground = surfaceHeightAt(entry, spec, s, t);

    let blocked = rideable !== null && !rideable.has(surfaceAtLateral(spec, t));
    for (const footprint of footprints) {
      if (blocked) break;
      const dx = x - footprint.x;
      const dz = z - footprint.z;
      if (dx * dx + dz * dz <= footprint.radius * footprint.radius) { blocked = true; break; }
    }
    if (!blocked) {
      const key = `${Math.floor(x / solids.cell)},${Math.floor(z / solids.cell)}`;
      for (const solid of solids.buckets.get(key) ?? []) {
        if (solid.centre.y + solid.halfExtents.y <= ground + stepUp) continue;
        if (insideBox(solid, x, z)) { blocked = true; break; }
      }
    }

    run = blocked ? 0 : run + SWEEP_LATERAL_METRES;
    if (run > widest) widest = run;
  }

  return widest;
}

/** The required route has to be long enough on its own. */
function checkRunLength(requiredLength: number): RouteFailure[] {
  if (requiredLength >= REQUIRED_ROUTE_FLOOR_METRES) return [];
  return [{
    contract: 'run-length',
    detail: `the required route is ${requiredLength.toFixed(0)} m with every optional `
      + `branch dropped, under the ${REQUIRED_ROUTE_FLOOR_METRES.toFixed(0)} m the `
      + 'hand-authored slice manages',
  }];
}

/**
 * Every jump landable at the speed the approach actually produces.
 *
 * The gap is measured from the lip's exit to where the landing corridor starts
 * catching, and compared against how far a fully charged hop carries at the
 * speed the forward pass says the rider arrives with. A jump nobody can clear
 * is a route the player cannot finish, and it is invisible in a screenshot.
 */
function checkLandable(layout: RouteLayout, speeds: ReadonlyMap<string, number>): RouteFailure[] {
  const failures: RouteFailure[] = [];
  const byId = new Map(layout.placed.map((segment) => [segment.spec.id, segment]));

  for (const jump of layout.jumps) {
    const lip = byId.get(jump.lipId);
    const landing = byId.get(jump.landingId);
    if (lip === undefined || landing === undefined) {
      failures.push({ contract: 'landable', detail: `${jump.name} has no lip or no landing` });
      continue;
    }

    const takeoff = centrelineAt(lip.entry, lip.spec, lip.spec.length);
    const catchPoint = landing.entry.position;
    const gap = Math.hypot(catchPoint.x - takeoff.x, catchPoint.z - takeoff.z);
    const speed = speeds.get(jump.lipId) ?? 0;
    const reach = RIDEABILITY.hopDistanceAt(speed);

    if (gap > reach) {
      failures.push({
        contract: 'landable',
        detail: `${jump.name}: a ${gap.toFixed(1)} m gap arrived at ${speed.toFixed(1)} m/s, `
          + `which carries ${reach.toFixed(1)} m`,
      });
    }
  }

  return failures;
}

/** Every shortcut has to come back. */
function checkReconnect(layout: RouteLayout): RouteFailure[] {
  const failures: RouteFailure[] = [];
  const byId = new Map(layout.placed.map((segment) => [segment.spec.id, segment]));

  for (const shortcut of layout.shortcuts) {
    const exit = byId.get(shortcut.exitId);
    const rejoin = byId.get(shortcut.rejoinId);
    if (exit === undefined || rejoin === undefined) {
      failures.push({
        contract: 'reconnect',
        detail: `${shortcut.name} names a segment the route does not contain`,
      });
      continue;
    }

    const end = centrelineAt(exit.entry, exit.spec, exit.spec.length);
    const query = querySegment(rejoin, end.x, end.z);
    // "Reconnects" means the shortcut's last metre is inside the corridor it is
    // rejoining, wide enough that a rider is on the route rather than beside it.
    const outside = query?.outside ?? Infinity;
    if (outside > ROUTE_CLEARANCE.minGap) {
      failures.push({
        contract: 'reconnect',
        detail: `${shortcut.name} ends ${outside.toFixed(1)} m outside ${shortcut.rejoinId}, `
          + 'so it is a dead end rather than a shortcut',
      });
    }
  }

  return failures;
}

/**
 * No two *different pieces* lay ground over each other at a step.
 *
 * Master §6.2's seam rule, in this level's terms. Two corridors that overlap in
 * plan view are resolved by `bestSegmentAt`, which takes the nearer one — so if
 * they disagree about the ground's height, the emitted heightfield gets a ledge
 * along the line where the winner changes, right across a corridor the route
 * expects to be ridden. It is invisible on a map, invisible to a connectivity
 * check, and immediately unpleasant to ride into.
 *
 * Two things about this rule were learned from the accepted level and are worth
 * recording, because both make it narrower than the obvious version:
 *
 * **1. It cannot apply inside a piece.** Beat 9 *is* a mound with a chicken
 * line round its foot, so `kicker-run` and `chicken-out` overlap with a 1.05 m
 * difference between them. That is the beat, not a bug. Authored geometry
 * inside a piece is the owner's and is already accepted; what the generator is
 * answerable for is the joins it chose.
 *
 * **2. Overlap between pieces is normal too, and only a *large* step is not.**
 * The slice folds tightly enough that `riverside` runs over `return-climb` and
 * over `kicker-land`. Its worst cross-piece disagreement is 0.379 m, which is
 * past the 0.216 m the wheel can lever itself onto — and the owner has ridden
 * it, published it, and not mentioned it, because it falls at the outer edge of
 * a corridor rather than on any line anybody takes.
 *
 * So the tolerance is **derived from the accepted level**: a generated route may
 * be no worse than the one that shipped. That is a defensible bound with an
 * argument behind it, where a round number would be an agent inventing a
 * standard. `generatedLevel.test.ts` regenerates the slice's own worst figure
 * and fails if it ever exceeds this.
 */
export const SEAM_TOLERANCE = 0.40;

function checkSeams(layout: RouteLayout): RouteFailure[] {
  const failures: RouteFailure[] = [];
  const segments = layout.placed;

  for (let a = 0; a < segments.length; a += 1) {
    for (let b = a + 1; b < segments.length; b += 1) {
      const first = segments[a];
      const second = segments[b];
      const firstPiece = layout.pieceOf.get(first.spec.id);
      const secondPiece = layout.pieceOf.get(second.spec.id);
      if (firstPiece !== undefined && firstPiece === secondPiece) continue;
      if (layout.adjacency.get(first.spec.id)?.has(second.spec.id) === true) continue;
      if (first.maxX < second.minX || second.maxX < first.minX) continue;
      if (first.maxZ < second.minZ || second.maxZ < first.minZ) continue;

      // Walk the first one's centreline and both its edges, which is where an
      // overlap starts, and ask the other what height it thinks the ground is.
      const stations = Math.max(4, Math.ceil(first.spec.length / 2));
      for (let station = 0; station <= stations; station += 1) {
        const s = (first.spec.length * station) / stations;
        const centre = centrelineAt(first.entry, first.spec, s);
        const heading = first.entry.headingY + (first.spec.curvature ?? 0) * s;
        const left = leftOf(heading);
        for (const lateral of [0, -first.spec.halfWidth, first.spec.halfWidth]) {
          const x = centre.x + left.x * lateral;
          const z = centre.z + left.z * lateral;

          const here = querySegment(first, x, z);
          const there = querySegment(second, x, z);
          if (here === null || there === null) continue;
          if (here.outside > 0 || there.outside > 0) continue;

          const drop = Math.abs(here.height - there.height);
          if (drop > SEAM_TOLERANCE) {
            failures.push({
              contract: 'seam',
              detail: `${first.spec.id} and ${second.spec.id} share ground at ` +
                `(${x.toFixed(1)}, ${z.toFixed(1)}) but disagree about its height by ` +
                `${drop.toFixed(2)} m — a ledge across a corridor, worse than the ` +
                `${SEAM_TOLERANCE.toFixed(2)} m the hand-authored slice's own worst join makes`,
            });
            return failures;
          }
        }
      }
    }
  }

  return failures;
}

/**
 * How steep the ground between two corridors may be, radians.
 *
 * **The seam tolerance, expressed as a slope**, so the two contracts meet at
 * the boundary instead of contradicting each other there: at zero gap this is
 * exactly `SEAM_TOLERANCE` over the half-metre below which two corridors are
 * touching rather than apart, and beyond zero gap it is the same wall laid back.
 * One derived number, two rules.
 *
 * The failure it catches is the one the owner's ride showed and no other
 * contract sees. Two corridors that do not overlap can still run *alongside*
 * each other a tenth of a metre apart and four metres different in height, and
 * the ground between them is then a vertical face no shoulder can blend.
 * Measured on the seeds he was given: the hand-authored slice's steepest is
 * 37.7°, and one generated route reached **83°**.
 */
export const BANK_SLOPE_CEILING = Math.atan(SEAM_TOLERANCE / 0.5);

/** How far apart two corridors have to be before neither can bank into the other. */
export const BANK_REACH = 14;

/**
 * The ground between two pieces' corridors is something a shoulder could make.
 *
 * Sampled along one corridor's own edges, because that is where a bank starts.
 */
function checkBanks(layout: RouteLayout): { failures: RouteFailure[]; steepest: number } {
  const segments = layout.placed;
  let steepest = 0;
  let worst: RouteFailure | null = null;

  for (let a = 0; a < segments.length; a += 1) {
    for (let b = a + 1; b < segments.length; b += 1) {
      const first = segments[a];
      const second = segments[b];
      const firstPiece = layout.pieceOf.get(first.spec.id);
      const secondPiece = layout.pieceOf.get(second.spec.id);
      if (firstPiece !== undefined && firstPiece === secondPiece) continue;
      if (layout.adjacency.get(first.spec.id)?.has(second.spec.id) === true) continue;
      if (first.maxX < second.minX - BANK_REACH || second.maxX < first.minX - BANK_REACH) continue;
      if (first.maxZ < second.minZ - BANK_REACH || second.maxZ < first.minZ - BANK_REACH) continue;

      const stations = Math.max(6, Math.ceil(first.spec.length / 2));
      for (let station = 0; station <= stations; station += 1) {
        const s = (first.spec.length * station) / stations;
        const centre = centrelineAt(first.entry, first.spec, s);
        const heading = first.entry.headingY + (first.spec.curvature ?? 0) * s;
        const left = leftOf(heading);
        for (const lateral of [-first.spec.halfWidth, first.spec.halfWidth]) {
          const x = centre.x + left.x * lateral;
          const z = centre.z + left.z * lateral;
          const here = querySegment(first, x, z);
          const there = querySegment(second, x, z);
          if (here === null || there === null) continue;
          if (there.outside > BANK_REACH) continue;

          const slope = Math.atan(
            Math.abs(here.height - there.height) / Math.max(there.outside, 0.5),
          );
          if (slope <= steepest) continue;
          steepest = slope;
          if (slope > BANK_SLOPE_CEILING) {
            worst = {
              contract: 'bank',
              detail: `${first.spec.id} runs ${there.outside.toFixed(1)} m from `
                + `${second.spec.id} and ${Math.abs(here.height - there.height).toFixed(1)} m `
                + `above it at (${x.toFixed(0)}, ${z.toFixed(0)}) — a `
                + `${(slope * 180 / Math.PI).toFixed(0)}° face where the ground between them `
                + `should be, past the ${(BANK_SLOPE_CEILING * 180 / Math.PI).toFixed(0)}° a `
                + 'shoulder can make',
            };
          }
        }
      }
    }
  }

  return { failures: worst === null ? [] : [worst], steepest };
}

/**
 * How steep a corridor's own shoulder may be, radians.
 *
 * A shoulder is the ground that eases a corridor down to the field around it,
 * and its width is authored per beat — twelve metres at the park gate, four
 * beside the kicker's chicken line, two down the alley, none at all on the
 * alley's ledge. Whatever it is, it has to *cover the drop*: a corridor five
 * metres above its surround with a two-metre shoulder is a corridor with a wall
 * around it.
 *
 * **The ceiling is the slice's own worst, again.** Its steepest is the kicker's
 * approach at 45° along the required route, and 51° once the chicken line's
 * flank is counted — which is the mound, and is meant to be a mound. Fifty-two
 * degrees admits everything the owner has ridden and refuses the 85° wall a
 * generated route produced when the whole world drifted upward beneath a pocket
 * authored with no shoulder at all.
 */
export const SHOULDER_SLOPE_CEILING = Math.PI * 52 / 180;

/**
 * The ground each corridor sits on is ground its shoulder could have made.
 *
 * **The required route only**, and that is master §6.3 rather than leniency: an
 * optional branch that cannot sit where the route has climbed to is *dropped*,
 * not retried, and the generator drops it. A whole regeneration spent on a
 * pocket trades a valid world for a slightly more interesting one.
 */
function checkShoulders(layout: RouteLayout): { failures: RouteFailure[]; steepest: number } {
  const through = new Set(layout.throughIds);
  const surround = layout.plan.surround.height;
  let steepest = 0;
  let worst: RouteFailure | null = null;

  for (const placed of layout.placed) {
    if (!through.has(placed.spec.id)) continue;
    const shoulder = placed.spec.shoulder ?? DEFAULT_SHOULDER;
    for (const socket of [placed.entry, placed.exit]) {
      const drop = Math.abs(socket.position.y - surround);
      const slope = Math.atan(drop / Math.max(shoulder, 0.5));
      if (slope <= steepest) continue;
      steepest = slope;
      if (slope > SHOULDER_SLOPE_CEILING) {
        worst = {
          contract: 'shoulder',
          detail: `${placed.spec.id} sits ${drop.toFixed(1)} m off the surround behind a `
            + `${shoulder} m shoulder — a ${(slope * 180 / Math.PI).toFixed(0)}° bank rather `
            + `than the ${(SHOULDER_SLOPE_CEILING * 180 / Math.PI).toFixed(0)}° the slice's `
            + 'own steepest makes',
        };
      }
    }
  }

  return { failures: worst === null ? [] : [worst], steepest };
}

/** Nothing on the required path steeper than the wheel can ride with authority left. */
function checkGradient(layout: RouteLayout): { failures: RouteFailure[]; steepest: number } {
  const byId = new Map(layout.placed.map((segment) => [segment.spec.id, segment]));
  const ceiling = RIDEABILITY.maxRequiredGradient;
  let steepest = 0;
  let worst = '';

  for (const id of layout.throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    const steps = Math.max(1, Math.ceil(segment.spec.length / 2));
    for (let step = 0; step <= steps; step += 1) {
      const gradient = Math.abs(gradientAt(segment.spec, (segment.spec.length * step) / steps));
      if (gradient > steepest) {
        steepest = gradient;
        worst = id;
      }
    }
  }

  if (steepest <= ceiling) return { failures: [], steepest };
  return {
    failures: [{
      contract: 'gradient',
      detail: `${worst} reaches ${(steepest * 180 / Math.PI).toFixed(1)}°, past the `
        + `${(ceiling * 180 / Math.PI).toFixed(1)}° the wheel can climb with half its `
        + 'authority still in hand',
    }],
    steepest,
  };
}

/**
 * The route stays inside the band of ground the surround can blend to.
 *
 * A shoulder is seven metres wide; a route perched thirteen metres above the
 * field around it is asking that shoulder to be a cliff, and everything that
 * stands beside it — dressing, kerbs, the buildings behind — inherits the
 * problem. This is the contract that stops it, and it is the reason the terrain
 * pass draws with a pull toward the surround rather than freely.
 */
function checkElevation(layout: RouteLayout): { failures: RouteFailure[]; drift: number } {
  const surround = layout.plan.surround.height;
  let drift = 0;
  let worst = '';
  for (const placed of layout.placed) {
    for (const socket of [placed.entry, placed.exit]) {
      const away = Math.abs(socket.position.y - surround);
      if (away > drift) {
        drift = away;
        worst = placed.spec.id;
      }
    }
  }

  if (drift <= ROUTE_ELEVATION_BAND) return { failures: [], drift };
  return {
    failures: [{
      contract: 'elevation',
      detail: `${worst} sits ${drift.toFixed(1)} m from the surround, past the `
        + `${ROUTE_ELEVATION_BAND} m the hand-authored slice spends — every shoulder `
        + 'beyond that is an embankment rather than a bank',
    }],
    drift,
  };
}

/** Every surface change along the route is one the slice already makes. */
function checkSurfaces(layout: RouteLayout): RouteFailure[] {
  const failures: RouteFailure[] = [];
  const byId = new Map(layout.placed.map((segment) => [segment.spec.id, segment]));

  for (let index = 1; index < layout.throughIds.length; index += 1) {
    const before = byId.get(layout.throughIds[index - 1]);
    const after = byId.get(layout.throughIds[index]);
    if (before === undefined || after === undefined) continue;
    // The surface at the join, honouring any lateral band: a corridor whose
    // centre is grass at the seam reads as a different transition from one
    // whose centre is pavement.
    const from = surfaceAtLateral(before.spec, 0);
    const to = surfaceAtLateral(after.spec, 0);
    if (!transitionIsLegible(from, to)) {
      failures.push({
        contract: 'surface',
        detail: `${before.spec.id} lays ${from} into ${after.spec.id}'s ${to}, `
          + 'a transition the slice never makes',
      });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Hazards — M13 Phase 3
// ---------------------------------------------------------------------------

/**
 * What a hazard rule is allowed to know, and why there are four of them.
 *
 * **These are post-conditions, not filters.** `generateRoute.ts` places
 * hazards *constructively*: it only ever puts one where every rule below
 * already holds, using these same functions, so a firing contract is a
 * `placeHazards` bug and says so in its own message. That is not the ordinary
 * retry-never-repair shape and the difference is deliberate — `attemptSeed`
 * renumbers the **route** domain alone, so rejecting a world because a hazard
 * landed badly would throw away a perfectly good route and redraw it for a
 * reason that had nothing to do with the route. Master §6.4's rule is about
 * *layouts*; a hazard is content laid on a layout that has already passed.
 *
 * Every number here is derived from the machine or from the wobble model. The
 * one thing deliberately **not** derived is whether a hazard can be *seen* in
 * time — that is perception, it needs the camera, the fog and the props the
 * dressing stream had not placed yet, and `docs/PLANS.md` §10 assigns it to the
 * owner's ride rather than to a static proxy. What is here is the weaker,
 * honest half: the ground must not *hide* a hazard within the distance in which
 * the machine could physically respond to it.
 */
export const HAZARD_RULES = {
  /**
   * Fraction of a corridor's half width that hazards may occupy.
   *
   * **It is the innermost a verge band can ever reach**, read off
   * `generateRoute.ts`'s own `vergeBands` rather than chosen: a band runs from
   * `halfWidth · (0.62 + width · 0.26)` outward, so nothing inside 0.62 of the
   * half width can be turned into grass or gravel by a later draw. Bounding a
   * hazard by it is what keeps the **hazards** stream independent of the
   * **surfaces** stream — the alternative is placing hazards after the verge
   * pass and reading the bands, which makes rerolling the surfaces move the
   * potholes and quietly turns two domains into one.
   */
  lateralFraction: 0.62,
  /**
   * How much of its authority the rider keeps in reserve when responding.
   *
   * The doctrine `RIDEABILITY.maxRequiredGradient` already applies to climbing,
   * applied to dodging: a hazard that can only be missed by spending the whole
   * lateral budget is a hazard that leaves nothing for the wobble, the line, or
   * the corner it sits in.
   */
  authorityReserve: 0.5,
  /**
   * How far the raster can carry a spill past the circle it was authored as.
   *
   * A spill is painted by **cell centres** (`buildPlan.ts`), so a selected cell
   * occupies ground up to a half-diagonal outside the mathematical footprint.
   * The rider is slowed by the cell, not by the circle, so every rule that asks
   * "how much road does this take away" has to charge for the cell.
   */
  get rasterMargin(): number {
    return DEFAULT_SPACING * Math.SQRT1_2;
  },
  /**
   * How far the ground may stand above a line of sight before it hides.
   *
   * The step the wheel can lever itself onto, which is the smallest rise this
   * project anywhere treats as a feature rather than as noise. Below it a crest
   * is a ripple in an eased profile; above it, it is a brow.
   */
  get sightBlockMetres(): number {
    return ROUTE_CLEARANCE.maxStepUp;
  },
  /**
   * Height the sight line is drawn from, metres.
   *
   * `RIDER.hipHeight` — the one height the table states for a rider *in the
   * riding pose*. It is deliberately the conservative choice: the real eye is
   * most of a torso higher, so anything a hip cannot see over is certainly
   * hidden, and the rule refuses more than a truthful eye height would. The
   * chase camera sits higher again and is `render/`'s, which this file may not
   * reach into.
   */
  get eyeMetres(): number {
    return RIDER.hipHeight;
  },
  /** Along-route spacing of the required route's sampled profile, metres. */
  profileStep: 2,
  /**
   * How far a footprint must stay clear of either socket of its own segment.
   *
   * One machine width. Two pieces may legitimately disagree about the ground's
   * height at a join by up to `SEAM_TOLERANCE`, and a hazard straddling that is
   * a hole drawn across a ledge — visually shared between two beats and, on the
   * simulation side, a footprint whose floor is on the wrong side of a step.
   */
  get socketClearMetres(): number {
    return ROUTE_CLEARANCE.minGap;
  },
  /**
   * How far a footprint must stay clear of a checkpoint gate, metres.
   *
   * The gate's own half depth plus a machine width. A gate is the one place on
   * the route where the line is *forced* — the rider must go through it — so a
   * hazard in its mouth removes the choice the avoidable-line rule exists to
   * guarantee, at exactly the point where there is no choice left to spend.
   */
  get gateClearMetres(): number {
    return CHALLENGE.gateHalfDepth + ROUTE_CLEARANCE.minGap;
  },
  /**
   * The distance in which the machine can steer one clear lane aside, metres.
   *
   * `d = ½·a·(t/2)²·2` for an accelerate-then-settle lane change, solved for
   * time and multiplied by the speed: `2·√(minGap / a)·v`, at half the lateral
   * authority. Steering rather than braking because steering is the response
   * that avoids *every* kind — braking below `hazardCrashSpeed` saves a rider
   * from a deep hole and does nothing about a spill — and because at the speeds
   * where a deep hole is fatal it is also the longer of the two, so requiring
   * it is the stricter reading.
   */
  respondMetres(speed: number): number {
    const lateral = RIDEABILITY.lateralAccel * this.authorityReserve;
    return 2 * Math.sqrt(ROUTE_CLEARANCE.minGap / lateral) * Math.max(0, speed);
  },
  /**
   * How far apart two hazards have to be, metres.
   *
   * **Derived from the wobble, and it is the milestone's own fairness question
   * in arithmetic.** A shallow hazard injects `hazardShallowEnergy` (0.55) and
   * the worst survivable thing that can follow it is a deep hole below the
   * crash speed, which injects `hazardDeepEnergy` (0.88) — so the first must
   * have decayed to under `wobbleCrashEnergy − hazardDeepEnergy` before the
   * second arrives, or the crash was unavoidable from the moment the rider met
   * the first. Energy decays as `e·exp(−damping·t)` and the slowest damping the
   * model offers is `wobbleDampingAggressive`, which is the rider still hard on
   * the throttle — the case that has to be survivable, not the case that is
   * easy. At top speed that is about 43 m.
   *
   * Floored at one response distance, so a retune that made the wobble decay
   * instantly could not collapse this to zero and stack two holes in a metre.
   */
  get separationMetres(): number {
    const headroom = Math.max(1e-3, EUC.wobbleCrashEnergy - EUC.hazardDeepEnergy);
    const seconds = Math.max(
      0,
      Math.log(Math.max(headroom, EUC.hazardShallowEnergy) / headroom)
        / EUC.wobbleDampingAggressive,
    );
    return Math.max(
      this.respondMetres(RIDEABILITY.topSpeed),
      seconds * RIDEABILITY.topSpeed,
    );
  },
  /**
   * How many hazards a hundred metres of required route may carry.
   *
   * The separation above already caps this near two, so this is the tighter
   * *pace* rule rather than a second fairness rule. One per hundred metres is a
   * hazard about every six seconds at riding speed, which is the same argument
   * `Game.applyWobbleQuery` makes for its own sixty-metre probe cadence: often
   * enough that the mechanic is in every run, rare enough that the ride between
   * them is still a ride. §13 q9's "nothing may be annoying" is a design
   * constraint on this milestone and a slalom is annoying.
   *
   * **Two rather than three**, which is what the separation alone would allow
   * over a hundred metres. Each of three at the minimum gap is individually
   * survivable and together they are a *combination* — and a combination is a
   * set piece, which is precisely the thing this generator does not author. It
   * composes beats somebody designed and lays neutral joins between them; a
   * three-hazard sequence would be the one piece of level design it invented.
   */
  perHundredMetres: 2,
  /**
   * Extra lane the generator insists on beyond what the contract measures, m.
   *
   * **The one blocker `placeHazards` cannot see.** It runs before a `LevelPlan`
   * exists, so it measures the road against the segments' own authored blocks
   * and not against `plan.solids`, which `buildLevelPlan` derives from dressing
   * placed afterwards. A solid prop stands clear of every corridor by
   * construction, so at worst a bin's corner reaches a little way over the kerb
   * line — a sweep step covers it, and a hazard that still closed the road with
   * a prop's help is a legitimate rejection rather than a placement bug.
   */
  get laneSlack(): number {
    return SWEEP_LATERAL_METRES;
  },
  /**
   * How finely the hazard lane sweep walks along the road, metres.
   *
   * Half a machine width, rather than the three metres the whole-route
   * clearance walk uses. That walk is looking for a wall somewhere in a
   * kilometre; this one is measuring an eight-metre window around a circle, and
   * a pinch the machine could not use must not be able to hide between two
   * stations.
   */
  get laneStepMetres(): number {
    return ROUTE_CLEARANCE.minGap / 2;
  },
} as const;

/**
 * How much road a footprint actually takes away, metres.
 *
 * A pothole takes its own circle. A spill takes its circle plus the raster,
 * because what is slippery is the set of metre cells the overpaint selected and
 * those reach outside the circle their centres fell inside.
 */
export function hazardBlockRadius(kind: HazardKind, radius: number): number {
  return kind === 'spill' ? radius + HAZARD_RULES.rasterMargin : radius;
}

/** A circle on the ground that no line through the corridor may touch. */
interface BlockingFootprint {
  /** Where it sits along its carrier's centreline — the station that must be swept. */
  readonly s: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Ground a rider can actually take a line on.
 *
 * **By exclusion rather than by list**, so a surface added later is rideable
 * until somebody says otherwise — the safe direction, since the failure this
 * set prevents is *certifying a lane nobody could take* and a new hard surface
 * is not that. Grass is out because a corridor's grass band is its verge: low
 * grip, and the shoulder begins there. Spill is out because it is the hazard —
 * "the line past the puddle" cannot itself be a puddle.
 *
 * The plain clearance contract deliberately does **not** use this. Its question
 * is whether the machine physically fits, and the hand-authored slice is full
 * of legal ground that is not pavement; narrowing it here would fail the level
 * the validator is calibrated against, which by master §6.4 makes it wrong.
 */
const RIDEABLE_LANE: ReadonlySet<SurfaceId> = new Set<SurfaceId>(
  (Object.keys(SURFACES) as SurfaceId[]).filter((id) => id !== 'grass' && id !== 'spill'),
);

/** One sample of the required route, with everything a sight line needs. */
export interface RouteStation {
  /** Distance from the first metre of the required route, metres. */
  readonly distance: number;
  readonly segmentId: string;
  /** Distance along that segment's own centreline, metres. */
  readonly s: number;
  readonly x: number;
  readonly z: number;
  /** Corridor surface height on the centreline. */
  readonly height: number;
  readonly halfWidth: number;
}

export interface RouteProfile {
  readonly stations: readonly RouteStation[];
  /** Route distance at each through segment's entry socket. */
  readonly startOf: ReadonlyMap<string, number>;
  readonly metres: number;
}

/**
 * The required route as one continuous line, sampled.
 *
 * **Continuous across sockets on purpose.** A crest does not care which segment
 * it is on, and the joins are exactly where a graded connector meets a beat and
 * puts one there. Sampling per segment and testing per segment would miss every
 * brow that straddles a join, which after `applyGrades` is most of them.
 */
export function routeProfile(
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
): RouteProfile {
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const stations: RouteStation[] = [];
  const startOf = new Map<string, number>();
  let distance = 0;

  for (const id of throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    const { spec, entry } = segment;
    startOf.set(id, distance);

    const steps = Math.max(1, Math.ceil(spec.length / HAZARD_RULES.profileStep));
    // `< steps` rather than `<= steps`: a segment's exit socket is the next
    // one's entry, and two stations at one point would make the sight walk
    // report a zero-length step at every join.
    for (let step = 0; step < steps; step += 1) {
      const s = (spec.length * step) / steps;
      const centre = centrelineAt(entry, spec, s);
      stations.push({
        distance: distance + s,
        segmentId: id,
        s,
        x: centre.x,
        z: centre.z,
        height: surfaceHeightAt(entry, spec, s, 0),
        halfWidth: spec.halfWidth,
      });
    }
    distance += spec.length;
  }

  // And the very last metre, which the loop above deliberately never emits.
  const last = throughIds.length > 0 ? byId.get(throughIds[throughIds.length - 1]) : undefined;
  if (last !== undefined) {
    const centre = centrelineAt(last.entry, last.spec, last.spec.length);
    stations.push({
      distance,
      segmentId: last.spec.id,
      s: last.spec.length,
      x: centre.x,
      z: centre.z,
      height: surfaceHeightAt(last.entry, last.spec, last.spec.length, 0),
      halfWidth: last.spec.halfWidth,
    });
  }

  return { stations, startOf, metres: distance };
}

/** Where a hazard sits in world space, from the way it was authored. */
export function hazardPoint(
  carrier: PlacedSegment,
  s: number,
  t: number,
): { x: number; z: number } {
  const centre = centrelineAt(carrier.entry, carrier.spec, s);
  const left = leftOf(headingAt(carrier.entry, carrier.spec, s));
  return { x: centre.x + left.x * t, z: centre.z + left.z * t };
}

/**
 * Is a hazard on this corridor still leaving a line through it?
 *
 * The clearance sweep with the footprints added, run only where they reach.
 * Returns the narrowest lane found, so the caller can say by how much.
 */
export function hazardLaneThrough(
  carrier: PlacedSegment,
  footprints: readonly BlockingFootprint[],
  solids: SolidGrid,
): { narrowest: number; at: number } {
  const { spec } = carrier;
  const reach = ROUTE_CLEARANCE.minGap;

  // **Every footprint's own station is swept, not just a grid across the
  // window**, and that is not a refinement — it is the only station that
  // matters. A circle is widest at its centre, so the narrowest lane it leaves
  // is at exactly the `s` it was authored at; a uniform grid over a window
  // centred on it steps *over* that point whenever the station count comes out
  // odd. Measured before it was fixed: 48 of 178 hazards across twenty-four
  // seeds were never measured where they are widest, which made this contract
  // unable to fire on precisely the case it exists to catch.
  const anchors = new Set<number>();
  let first = Infinity;
  let last = -Infinity;
  for (const footprint of footprints) {
    anchors.add(Math.max(0, Math.min(spec.length, footprint.s)));
    first = Math.min(first, footprint.s - footprint.radius - reach);
    last = Math.max(last, footprint.s + footprint.radius + reach);
  }
  if (anchors.size === 0) return { narrowest: Infinity, at: 0 };

  first = Math.max(0, Math.min(spec.length, first));
  last = Math.max(0, Math.min(spec.length, last));
  const steps = Math.max(1, Math.ceil((last - first) / HAZARD_RULES.laneStepMetres));
  for (let step = 0; step <= steps; step += 1) {
    anchors.add(first + ((last - first) * step) / steps);
  }

  let narrowest = Infinity;
  let at = first;
  for (const s of anchors) {
    const lane = widestClearLane(carrier, s, solids, footprints, RIDEABLE_LANE);
    if (lane < narrowest) {
      narrowest = lane;
      at = s;
    }
  }
  return { narrowest, at };
}

/**
 * Does the ground hide this hazard from the rider approaching it?
 *
 * **One clause: the crest.** Walk the required route's own profile back from
 * the hazard and require every metre of ground between to sit below the line
 * from the rider's hip to the hazard's own footprint, by more than a step-up. A
 * hazard just over a brow is the one placement no reaction time can save, and
 * the graded connectors the terrain stream chooses are what put brows on a
 * route nobody authored one into.
 *
 * **A corner clause was written and then deleted, and the algebra is worth
 * keeping.** It asked whether the straight line to the hazard leaves the road —
 * the chord cuts the inside of a bend, and past a half width it is cutting
 * across the verge. It can never fire. The sagitta of an arc of length `L` and
 * curvature `k` is `L²k/8`; a corridor's speed ceiling is `√(a/k)` and the
 * look-back is proportional to that speed, so `L² ∝ 1/k` and the `k` cancels
 * exactly: at the carve limit the chord leaves the road by `minGap/(2·reserve)`
 * whatever the radius — measured across every curvature the library uses, a
 * maximum of 1.06 m against corridors no narrower than 2.3 m of half width.
 * *The distance in which the machine can dodge one lane width is the distance
 * in which the corner has swung one lane width away, because the same lateral
 * acceleration sets both.* A clause that provably cannot fire is a clause
 * nobody would notice breaking, so it is gone rather than decorative.
 *
 * The window is `HAZARD.readMetres` rather than the machine's own response
 * distance, and the difference matters. The machine can steer a lane aside in
 * about sixteen metres, and a rule with a sixteen-metre window fires on nothing
 * this library can build. Forty metres is not a guess either — it is the
 * distance Phase 2 *measured* a pothole's contrast at through the real chase
 * camera (`DESIGN.md` §6j), so the two halves compose into one honest claim:
 * the mark reads at forty metres, and the ground does not hide it inside forty
 * metres. This is still not a perception model. It says nothing about fog,
 * props, or the camera, and Phase 2's owner gate remains the only thing that
 * decides whether a hazard is *readable*.
 *
 * Returns null when the hazard is in the open, or the reason it is not.
 */
export function hazardSightBlocked(
  profile: RouteProfile,
  distance: number,
  point: { readonly x: number; readonly z: number },
): string | null {
  const lookBack = HAZARD.readMetres;
  const from = distance - lookBack;
  // Nothing to prove about a hazard the route does not reach from behind: the
  // zone rule already refuses anything before the start gate, which is a long
  // way past the first metre of the world.
  if (from < 0) return null;

  const stations = profile.stations;
  const eye = sampleProfile(stations, from);
  const target = sampleProfile(stations, distance);
  if (eye === null || target === null) return null;

  const eyeY = eye.height + HAZARD_RULES.eyeMetres;
  const span = distance - from;

  for (const station of stations) {
    if (station.distance <= from || station.distance >= distance) continue;

    // Interpolated along the *route*, not along the straight line, because the
    // profile is the road's own elevation and that is what a crest is made of.
    // The far end is the hazard's own ground rather than the centreline's: a
    // footprint sits up to a corridor's half width off the middle of the road,
    // and on a crowned or banked beat that is a real difference in height.
    const along = (station.distance - from) / span;
    const line = eyeY + (target.height - eyeY) * along;
    if (station.height - line > HAZARD_RULES.sightBlockMetres) {
      return `the ground stands ${(station.height - line).toFixed(2)} m above the line of `
        + `sight ${(distance - station.distance).toFixed(0)} m short of it`;
    }

    // And the road itself has to run past the hazard, not somewhere else: a
    // station whose centreline is further from the footprint than the corridor
    // is wide means the route has turned away from it entirely.
    const away = Math.hypot(station.x - point.x, station.z - point.z);
    if (away > station.halfWidth + (distance - station.distance)) {
      return `the route runs ${away.toFixed(1)} m wide of it `
        + `${(distance - station.distance).toFixed(0)} m short of it`;
    }
  }

  return null;
}

/** The profile station nearest a route distance. */
function sampleProfile(
  stations: readonly RouteStation[],
  distance: number,
): RouteStation | null {
  if (stations.length === 0) return null;
  let best = stations[0];
  let gap = Math.abs(best.distance - distance);
  for (const station of stations) {
    const away = Math.abs(station.distance - distance);
    if (away < gap) {
      gap = away;
      best = station;
    }
  }
  return best;
}

/**
 * Everything the zone rule compares a hazard against, measured along the route.
 *
 * **Along the route rather than in world space, and that is what lets one
 * function serve both callers.** The generator knows a gate as `(segment, s)`
 * and the emitted plan knows it as a yawed box in world coordinates; neither
 * can see the other's spelling, and two spellings of one rule is how a
 * post-condition starts disagreeing with the pass it is meant to be checking.
 * A distance along the required route is the one description both can produce.
 */
export interface HazardZoneContext {
  readonly throughIds: readonly string[];
  readonly jumps: readonly RouteJump[];
  /** Route distance of the hazard being judged, metres. */
  readonly distance: number;
  /** Route distance of every checkpoint gate, metres. */
  readonly gateDistances: readonly number[];
  /** Route distance of the start gate, metres. */
  readonly startDistance: number;
  /**
   * Extra margin the caller wants on the distance rules, metres.
   *
   * **The generator passes the profile's own sampling step and the contract
   * passes zero**, so the pass is stricter than the check by exactly the
   * resolution at which it can locate a gate. A post-condition that could fire
   * on a rounding term is a post-condition that rejects worlds nobody built
   * wrongly.
   */
  readonly slack: number;
}

/**
 * The four exclusions a hazard has to clear, checked one hazard at a time.
 *
 * Shared verbatim with `placeHazards`, which is what makes the contract a
 * post-condition rather than a second opinion. Returns null when the placement
 * is legal, or the reason it is not.
 */
export function hazardZoneRefusal(
  spec: HazardSpec,
  carrier: PlacedSegment,
  context: HazardZoneContext,
): string | null {
  if (!context.throughIds.includes(spec.segment)) {
    return 'it sits on a segment the required route does not contain';
  }

  // A lip is a take-off and a landing is a rider with no steering authority at
  // all. Whole segments rather than a margin, because both are short, authored
  // as one gesture, and there is no part of either where a hole is fair.
  for (const jump of context.jumps) {
    if (spec.segment === jump.lipId) return `it sits on ${jump.name}'s lip`;
    if (spec.segment === jump.landingId) return `it sits in ${jump.name}'s landing`;
  }

  const block = hazardBlockRadius(spec.kind, spec.radius);
  const clear = HAZARD_RULES.socketClearMetres + context.slack;
  if (spec.s - block < clear || spec.s + block > carrier.spec.length - clear) {
    return `its footprint comes within ${clear.toFixed(2)} m of a socket of `
      + `${spec.segment}, where two pieces may disagree about the ground`;
  }

  if (context.distance < context.startDistance - context.slack) {
    return `it sits ${(context.startDistance - context.distance).toFixed(0)} m before the `
      + 'start gate, on road the timed run has not begun on';
  }

  const gateClear = HAZARD_RULES.gateClearMetres + block + context.slack;
  for (const gate of context.gateDistances) {
    if (Math.abs(gate - context.distance) < gateClear) {
      return `its footprint comes within ${gateClear.toFixed(1)} m of a checkpoint gate, `
        + 'the one place on the route where the line is not the rider\'s to choose';
    }
  }

  return null;
}

/** Which through segment a hazard was authored on, if the route still has it. */
function carrierOf(
  layout: RouteLayout,
  spec: HazardSpec,
): PlacedSegment | undefined {
  return layout.placed.find((segment) => segment.spec.id === spec.segment);
}

/** Everything the four hazard contracts need, assembled once. */
interface HazardContext {
  readonly specs: readonly HazardSpec[];
  readonly profile: RouteProfile;
  readonly startDistance: number;
  readonly gateDistances: readonly number[];
  readonly distanceOf: ReadonlyMap<string, number>;
  readonly pointOf: ReadonlyMap<string, { x: number; z: number }>;
}

/**
 * Where along the required route a gate stands.
 *
 * The plan knows a gate only as a world box, so this is a lookup rather than
 * arithmetic — the nearest sampled station, which is exact to half the profile
 * step. The generator locates the same gate exactly, from the `(segment, s)` it
 * authored it at, and pads its own rules by a whole step so the two can never
 * disagree in the direction that fires this contract.
 */
export function gateDistance(profile: RouteProfile, gate: Checkpoint): number {
  let best = Infinity;
  let distance = 0;
  for (const station of profile.stations) {
    const away = Math.hypot(station.x - gate.centre.x, station.z - gate.centre.z);
    if (away < best) {
      best = away;
      distance = station.distance;
    }
  }
  return distance;
}

function hazardContext(layout: RouteLayout): HazardContext | null {
  const specs = layout.hazards ?? [];
  if (specs.length === 0) return null;

  const profile = routeProfile(layout.placed, layout.throughIds);
  const distanceOf = new Map<string, number>();
  const pointOf = new Map<string, { x: number; z: number }>();
  for (const spec of specs) {
    const carrier = carrierOf(layout, spec);
    if (carrier === undefined) continue;
    const start = profile.startOf.get(spec.segment);
    if (start !== undefined) distanceOf.set(spec.id, start + spec.s);
    pointOf.set(spec.id, hazardPoint(carrier, spec.s, spec.t));
  }

  // Where the timed run begins. Absent gates (a fixture, the proving ground)
  // leave it at zero, which excludes nothing — a rule that could not be
  // evaluated must not silently reject.
  const gateDistances = layout.plan.checkpoints.map((gate) => gateDistance(profile, gate));
  const start = layout.plan.checkpoints.findIndex((gate) => gate.kind === 'start');
  const startDistance = start < 0 ? 0 : gateDistances[start];

  return { specs, profile, startDistance, gateDistances, distanceOf, pointOf };
}

/** Every hazard leaves a line through the corridor it sits in. */
function checkHazardLine(layout: RouteLayout, context: HazardContext): RouteFailure[] {
  const solids = solidGrid(layout);
  const minGap = ROUTE_CLEARANCE.minGap;

  // Grouped by carrier, because two hazards on one segment close a road
  // together that neither closes alone — the exact failure a per-hazard sweep
  // would let through.
  const bySegment = new Map<string, HazardSpec[]>();
  for (const spec of context.specs) {
    const list = bySegment.get(spec.segment);
    if (list === undefined) bySegment.set(spec.segment, [spec]);
    else list.push(spec);
  }

  for (const [segmentId, specs] of bySegment) {
    const carrier = layout.placed.find((segment) => segment.spec.id === segmentId);
    if (carrier === undefined) continue;

    const footprints: BlockingFootprint[] = [];
    for (const spec of specs) {
      const point = context.pointOf.get(spec.id);
      if (point === undefined) continue;
      footprints.push({
        s: spec.s,
        x: point.x,
        z: point.z,
        radius: hazardBlockRadius(spec.kind, spec.radius),
      });
    }
    if (footprints.length === 0) continue;

    const { narrowest, at } = hazardLaneThrough(carrier, footprints, solids);
    if (narrowest < minGap) {
      return [{
        contract: 'hazard-line',
        detail: `${segmentId} is left with ${narrowest.toFixed(2)} m of clear lane `
          + `${at.toFixed(0)} m in by ${specs.map((spec) => spec.id).join(', ')}, under the `
          + `${minGap.toFixed(2)} m the machine needs — nothing gets past it`,
      }];
    }
  }

  return [];
}

/** No hazard is hidden by the ground until it is too late to steer aside. */
function checkHazardSight(layout: RouteLayout, context: HazardContext): RouteFailure[] {
  for (const spec of context.specs) {
    const carrier = carrierOf(layout, spec);
    const distance = context.distanceOf.get(spec.id);
    if (carrier === undefined || distance === undefined) continue;

    const point = context.pointOf.get(spec.id);
    if (point === undefined) continue;
    const blocked = hazardSightBlocked(context.profile, distance, point);
    if (blocked !== null) {
      return [{
        contract: 'hazard-sight',
        detail: `${spec.id} on ${spec.segment} is hidden until the rider is on it: `
          + `${blocked} — placeHazards put a hazard the ground conceals`,
      }];
    }
  }
  return [];
}

/**
 * Are these hazards far enough apart to recover between, and sparse enough to ride?
 *
 * Takes bare `(id, distance)` pairs so `placeHazards` can ask the question of a
 * list it has not finished building. Returns null when the spacing is legal, or
 * the reason it is not. Both rules are stated in the `HAZARD_RULES` block above.
 */
export function hazardSpacingRefusal(
  placements: readonly { readonly id: string; readonly distance: number }[],
): string | null {
  const ordered = [...placements].sort((a, b) => a.distance - b.distance);

  const separation = HAZARD_RULES.separationMetres;
  for (let index = 1; index < ordered.length; index += 1) {
    const gap = ordered[index].distance - ordered[index - 1].distance;
    if (gap < separation) {
      return `${ordered[index - 1].id} and ${ordered[index].id} sit ${gap.toFixed(0)} m apart, `
        + `inside the ${separation.toFixed(0)} m a rider needs for the first one's wobble to `
        + 'decay enough that the second is survivable';
    }
  }

  for (let index = 0; index < ordered.length; index += 1) {
    let inWindow = 0;
    for (let other = index; other < ordered.length; other += 1) {
      if (ordered[other].distance - ordered[index].distance > HAZARD_WINDOW_METRES) break;
      inWindow += 1;
    }
    if (inWindow > HAZARD_RULES.perHundredMetres) {
      return `${inWindow} hazards inside ${HAZARD_WINDOW_METRES} m from ${ordered[index].id}, `
        + `past the ${HAZARD_RULES.perHundredMetres} this route may carry — a run of them at `
        + 'the minimum gap is a set piece, and this generator does not author set pieces';
    }
  }

  return null;
}

/** The window the density cap is stated over, metres. */
const HAZARD_WINDOW_METRES = 100;

/** Hazards are far enough apart to recover between, and sparse enough to ride. */
function checkHazardDensity(context: HazardContext): RouteFailure[] {
  const placements: { id: string; distance: number }[] = [];
  for (const spec of context.specs) {
    const distance = context.distanceOf.get(spec.id);
    if (distance !== undefined) placements.push({ id: spec.id, distance });
  }

  const refusal = hazardSpacingRefusal(placements);
  return refusal === null ? [] : [{ contract: 'hazard-density', detail: refusal }];
}

/** No hazard on a jump, in a gate, on a socket, or before the run begins. */
function checkHazardZone(layout: RouteLayout, context: HazardContext): RouteFailure[] {
  const seen = new Set<string>();
  const drawn = new Map((layout.plan.hazards ?? []).map((hazard) => [hazard.id, hazard]));

  for (const spec of context.specs) {
    if (seen.has(spec.id)) {
      return [{
        contract: 'hazard-zone',
        detail: `two hazards are both called "${spec.id}", so a drawn rim and a contact `
          + 'record cannot agree about which hole the rider went into',
      }];
    }
    seen.add(spec.id);

    const carrier = carrierOf(layout, spec);
    if (carrier === undefined) {
      return [{
        contract: 'hazard-zone',
        detail: `${spec.id} is authored on "${spec.segment}", which the route never places`,
      }];
    }
    const point = context.pointOf.get(spec.id);
    const distance = context.distanceOf.get(spec.id);
    if (point === undefined || distance === undefined) continue;

    const refusal = hazardZoneRefusal(spec, carrier, {
      throughIds: layout.throughIds,
      jumps: layout.jumps,
      gateDistances: context.gateDistances,
      startDistance: context.startDistance,
      distance,
      slack: 0,
    });
    if (refusal !== null) {
      return [{
        contract: 'hazard-zone',
        detail: `${spec.id}: ${refusal} — placeHazards put a hazard somewhere it excludes`,
      }];
    }

    // And the world actually built it where the route says it is. The two
    // arithmetics are `hazardPoint` here and `segmentPoint` in `buildPlan.ts`;
    // they are the same composition and this is what says they stayed the same.
    const built = drawn.get(spec.id);
    if (built === undefined) {
      return [{
        contract: 'hazard-zone',
        detail: `${spec.id} is in the route's placement and not in the emitted plan`,
      }];
    }
    const away = Math.hypot(built.centre.x - point.x, built.centre.z - point.z);
    if (away > 1e-6 || built.radius !== spec.radius || built.kind !== spec.kind) {
      return [{
        contract: 'hazard-zone',
        detail: `${spec.id} is drawn ${away.toFixed(3)} m from where the route placed it`,
      }];
    }
  }

  // There is deliberately no "and nothing else" clause. A plan may legitimately
  // carry *more* hazards than the route placed, because `?hazardprobe=` scatters
  // its own through the same resolution — and a diagnostic that made every
  // generated route fail its contracts and fall back to the slice would be a
  // diagnostic that destroyed the thing it was pointed at. Every hazard the
  // route placed is proven present and in the right place above, which is the
  // direction that can hide a bug.
  return [];
}

/** The four hazard contracts, or nothing at all on a world that carries none. */
function checkHazards(layout: RouteLayout): RouteFailure[] {
  const context = hazardContext(layout);
  if (context === null) {
    // A plan may not carry hazards a layout never placed: that is a build that
    // invented content, and the diagnostic scatter is the one thing allowed to
    // do it (`BuildOptions.hazardProbeMetres`, which no generated route sets).
    return [];
  }
  return [
    ...checkHazardZone(layout, context),
    ...checkHazardLine(layout, context),
    ...checkHazardSight(layout, context),
    ...checkHazardDensity(context),
  ];
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Targets — M14
// ---------------------------------------------------------------------------

/**
 * What a target rule is allowed to know, and why there are three of them.
 *
 * **Post-conditions, not filters**, on exactly the terms `HAZARD_RULES` sets
 * out: `generateRoute.ts` places targets constructively, using these same
 * functions, so a firing contract is a `placeTargets` bug and says so in its own
 * message. Rejecting a world because a target landed badly would renumber the
 * *route* domain and throw away a route that satisfied a dozen contracts for a
 * reason that had nothing to do with the route.
 *
 * **`target-reach` is its own contract and deliberately does not reuse
 * `hazardSightBlocked`.** That function's second clause is a "the route did not
 * turn away entirely" guard rather than a reach rule: for a pad 1.3 m off the
 * centreline on a six-metre half-width corridor it cannot fire at any station,
 * so reusing it here would ship `target-sight` and no reach guarantee at all.
 * What reach actually means is arithmetic about the paddle, and it is below.
 */
export const TARGET_RULES = {
  /**
   * How far outside the rideable half-width a stand's foot goes, metres.
   *
   * Just past the kerb line. Far enough that the stand is plainly furniture on
   * the verge rather than an obstacle in the road — nothing here is a collider,
   * so what this buys is the player *believing* the right thing about where the
   * obstacle is — and near enough that the pad's own cantilever brings it back
   * within a swing of a line they were already riding.
   */
  vergeStandoff: 0.55,
  /**
   * How far inside the paddle's own reach a pad has to sit, metres.
   *
   * The reach is measured from the swing pivot to the centre of the head, and a
   * pad exactly at that distance is a pad only a perfect line and a perfect
   * moment can touch. This is the margin that makes it a shot rather than a
   * coincidence, and it is why the contract is not simply `<= PADDLE.reach`.
   */
  reachMargin: 0.30,
  /**
   * The furthest a pad may sit from the corridor's centreline, metres.
   *
   * The whole reach arithmetic in one place: the pivot is offset onto the
   * rider's right by `PADDLE.pivotOffset` and the head is `PADDLE.reach` beyond
   * it, less the margin above. Read off the paddle's own constants rather than
   * chosen, so dragging the reach slider on F4 and opening a fresh route gives
   * the owner a world whose targets are placed for the paddle he just tuned.
   */
  get reachLimit(): number {
    return PADDLE.reach + PADDLE.pivotOffset - this.reachMargin;
  },
  /**
   * How far the ground under a foot may sit from the ground under its own pad,
   * metres.
   *
   * **This is what makes the rigid stand honest.** `level/plan.ts` resolves both
   * of a target's heights from one sample under the foot, because one rigid
   * shape is one `InstancedMesh` and two draw calls where a per-station shape is
   * a merged mesh rebuilt whenever anything moves. The price of that is a stand
   * on a raised verge holding its pad the same amount high — so the verge and
   * the road under the pad have to be within a kerb of each other, and here is
   * where that is checked rather than assumed. A kerb is exactly the right
   * measure: it is the step the wheel can lever itself onto, which is this
   * project's own smallest rise that counts as a feature.
   */
  get standStepMetres(): number {
    return ROUTE_CLEARANCE.maxStepUp;
  },
  /**
   * How far apart two targets have to be, metres.
   *
   * **Derived from the swing, and it is this milestone's fairness question in
   * arithmetic.** A whole swing cycle is wind-up plus strike plus recovery, and
   * during it no second swing can begin — so two targets closer together than
   * one cycle of travel cannot both be struck however well the route is ridden,
   * and placing them would be authoring a miss.
   *
   * Doubled, because one cycle is the floor at which the second is *barely*
   * reachable and the difference between a choice and a combination is having
   * time to spare. That is `HAZARD_RULES.perHundredMetres`'s argument in the
   * other units: three hazards at the minimum gap is a combination, a
   * combination is a set piece, and a set piece is the one thing this generator
   * does not author.
   *
   * At the shipped constants and the shipped top speed that is a little under
   * twenty metres, so the density rule below is the binding one on an ordinary
   * route and this is what stops a burst.
   */
  get separationMetres(): number {
    const cycle = PADDLE.windupSeconds + PADDLE.activeSeconds + PADDLE.recoverSeconds;
    return 2 * cycle * RIDEABILITY.topSpeed;
  },
  /**
   * How many targets a hundred metres of required route may carry — §13 q20.
   *
   * Two, the owner's answer, read from the table both this and `placeTargets`
   * consult so the pass and its post-condition cannot disagree.
   */
  get perHundredMetres(): number {
    return TARGET.perHundredMetres;
  },
  /**
   * How far a stand must stay clear of either socket of its own segment, and of
   * a checkpoint gate.
   *
   * `HAZARD_RULES`'s two, verbatim and for the same reasons. A seam is where two
   * pieces may legitimately disagree about the ground's height, which is exactly
   * where a rigid stand would float or sink; and a gate is the one place on the
   * route where the line is *forced*, so a pad hanging into its mouth is a swing
   * the player cannot choose to set up for.
   */
  get socketClearMetres(): number {
    return HAZARD_RULES.socketClearMetres;
  },
  get gateClearMetres(): number {
    return HAZARD_RULES.gateClearMetres;
  },
} as const;

/** Where a target's foot and pad sit laterally, from its authored offset. */
export function targetLaterals(t: number): { foot: number; pad: number } {
  // The arm always reaches back toward the centreline — `-sign(t)` and never a
  // field anybody can set inconsistently (`buildPlan.ts`, `TargetSpec`).
  const inward = t > 0 ? -1 : 1;
  return { foot: t, pad: t + inward * TARGET.cantilever };
}

/**
 * Is this stand somewhere a stand can be? Shared verbatim with `placeTargets`.
 *
 * Returns a refusal string, or null when the station is legal. Three questions,
 * in cheapest-first order: is the foot off the road, is the pad within a swing
 * of the line, and is the ground under the foot level enough with the ground
 * under the pad for one rigid post to reach both.
 */
export function targetStandRefusal(
  carrier: PlacedSegment,
  s: number,
  t: number,
  groundAt: (x: number, z: number) => number,
): string | null {
  const { foot, pad } = targetLaterals(t);

  // The foot is on the verge, never in the road. A stand is not a collider and
  // cannot be crashed into, so what this protects is the player's belief about
  // where the obstacle is — and a pole apparently in the carriageway that the
  // wheel passes through is the worst version of that belief being wrong.
  if (Math.abs(foot) < carrier.spec.halfWidth + TARGET_RULES.vergeStandoff * 0.5) {
    return `target foot at t=${foot.toFixed(2)} is inside the ${carrier.spec.halfWidth} m corridor`;
  }
  // And the pad is not on the far side of the road, which a cantilever longer
  // than the corridor would put it on.
  if (Math.sign(pad) !== Math.sign(foot) && Math.abs(pad) > 0.1) {
    return `target pad at t=${pad.toFixed(2)} reaches past the centreline from t=${foot.toFixed(2)}`;
  }

  // -- Reach, and it is measured from a line the rider may actually take ----
  //
  // **Not from the centreline**, which is the version of this rule that reads
  // correctly and is wrong: a stand is on the verge by construction, so on any
  // corridor wider than a swing no target would ever be placed, and the first
  // build of this pass placed exactly zero across six adversarial seeds. What
  // the player does with a verge target is *take a line near it*, so what has
  // to be within reach is the nearest lateral position the machine may legally
  // occupy on that side — `halfWidth` less the actor radius, which is the pedal
  // span rather than the tyre because it is the pedals that catch.
  const rideableEdge = Math.max(0, carrier.spec.halfWidth - ROUTE_CLEARANCE.actorRadius);
  const line = Math.min(Math.abs(pad), rideableEdge);
  if (Math.abs(pad) - line > TARGET_RULES.reachLimit) {
    return `target pad at t=${pad.toFixed(2)} is ${(Math.abs(pad) - line).toFixed(2)} m outside `
      + `the outermost rideable line, past the ${TARGET_RULES.reachLimit.toFixed(2)} m a swing reaches`;
  }
  // And that line has to be ground somebody would ride on. A pad reachable only
  // from the grass is a pad reachable only by leaving the road, which is the
  // one thing `RIDEABLE_LANE` exists to stop a contract certifying.
  if (!RIDEABLE_LANE.has(surfaceAtLateral(carrier.spec, Math.sign(pad) * line))) {
    return `the only line within reach of ${pad.toFixed(2)} is `
      + `${surfaceAtLateral(carrier.spec, Math.sign(pad) * line)}, which is not a lane`;
  }
  // The pad must also leave a clear centre lane, so a rider who does not want
  // this target can hold a line past it without one at chest height in the way.
  const centreClear = ROUTE_CLEARANCE.minGap / 2 + TARGET.discRadius;
  if (Math.abs(pad) < centreClear) {
    return `target pad at t=${pad.toFixed(2)} leaves under ${centreClear.toFixed(2)} m `
      + 'of clear centre lane beside it';
  }

  const footPoint = hazardPoint(carrier, s, foot);
  const padPoint = hazardPoint(carrier, s, pad);
  const step = Math.abs(groundAt(footPoint.x, footPoint.z) - groundAt(padPoint.x, padPoint.z));
  if (step > TARGET_RULES.standStepMetres) {
    return `target ground steps ${step.toFixed(2)} m between its foot and its pad, `
      + `which one rigid post cannot span`;
  }
  return null;
}

/** The density and spacing half, shared verbatim with `placeTargets`. */
export function targetSpacingRefusal(
  placements: readonly { id: string; distance: number }[],
  requiredLength: number,
): string | null {
  const sorted = [...placements].sort((a, b) => a.distance - b.distance);
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index].distance - sorted[index - 1].distance;
    if (gap < TARGET_RULES.separationMetres) {
      return `${sorted[index - 1].id} and ${sorted[index].id} are ${gap.toFixed(1)} m apart, `
        + `inside the ${TARGET_RULES.separationMetres.toFixed(1)} m one swing cycle needs`;
    }
  }
  const allowed = Math.ceil((requiredLength / 100) * TARGET_RULES.perHundredMetres) + 1;
  if (sorted.length > allowed) {
    return `${sorted.length} targets over ${requiredLength.toFixed(0)} m is past the `
      + `${TARGET_RULES.perHundredMetres} per hundred metres §13 q20 allows`;
  }
  return null;
}

/**
 * The three target contracts.
 *
 * Nothing here re-derives a rule: every predicate is one of the exported
 * functions above, which is what makes "post-condition" true rather than
 * aspirational. A route with no targets returns nothing at all, which is the
 * normal case for the slice, the proving ground and every fixture.
 */
function checkTargets(layout: RouteLayout): RouteFailure[] {
  const specs = layout.targets;
  if (specs === undefined || specs.length === 0) return [];

  const failures: RouteFailure[] = [];
  const byId = new Map(layout.placed.map((placed) => [placed.spec.id, placed]));
  const profile = routeProfile(layout.placed, layout.throughIds);
  const groundAt = (x: number, z: number): number =>
    fieldHeightAt(layout.plan.heightfield, layout.plan.surround, x, z);

  const gateDistances: number[] = [];
  for (const gate of layout.plan.checkpoints) {
    // A gate's own world point, matched to the nearest station on the required
    // route — the contract has no `(segment, s)` for it, and the slack the pass
    // allows is what keeps the difference from mattering.
    let best = Infinity;
    let at = 0;
    for (const station of profile.stations) {
      const distance = Math.hypot(station.x - gate.centre.x, station.z - gate.centre.z);
      if (distance >= best) continue;
      best = distance;
      at = station.distance;
    }
    if (best < Infinity) gateDistances.push(at);
  }

  const placements: { id: string; distance: number }[] = [];
  for (const spec of specs) {
    const carrier = byId.get(spec.segment);
    if (carrier === undefined) {
      failures.push({
        contract: 'target-stand',
        detail: `${spec.id} is on segment "${spec.segment}", which the graph never places`,
      });
      continue;
    }

    const stand = targetStandRefusal(carrier, spec.s, spec.t, groundAt);
    if (stand !== null) {
      failures.push({ contract: 'target-reach', detail: `${spec.id}: ${stand}` });
    }

    // Sockets and gates. A stand straddling a seam is a rigid post founded on
    // two pieces that are allowed to disagree about the ground; a stand at a
    // gate is a swing the player has no room to choose.
    if (spec.s < TARGET_RULES.socketClearMetres
      || carrier.spec.length - spec.s < TARGET_RULES.socketClearMetres) {
      failures.push({
        contract: 'target-stand',
        detail: `${spec.id} is ${spec.s.toFixed(1)} m into a ${carrier.spec.length} m beat, `
          + `inside the ${TARGET_RULES.socketClearMetres.toFixed(1)} m a socket needs`,
      });
    }

    const start = profile.startOf.get(spec.segment);
    if (start !== undefined) {
      const distance = start + spec.s;
      placements.push({ id: spec.id, distance });
      for (const gate of gateDistances) {
        if (Math.abs(distance - gate) < TARGET_RULES.gateClearMetres) {
          failures.push({
            contract: 'target-stand',
            detail: `${spec.id} stands in the mouth of a checkpoint gate`,
          });
          break;
        }
      }
    }
  }

  let requiredLength = 0;
  for (const id of layout.throughIds) requiredLength += byId.get(id)?.spec.length ?? 0;
  const spacing = targetSpacingRefusal(placements, requiredLength);
  if (spacing !== null) failures.push({ contract: 'target-density', detail: spacing });

  return failures;
}

export function validateRoute(layout: RouteLayout): RouteVerdict {
  const byId = new Map(layout.placed.map((placed) => [placed.spec.id, placed]));
  let requiredLength = 0;
  for (const id of layout.throughIds) requiredLength += byId.get(id)?.spec.length ?? 0;

  const speeds = speedProfile(layout.placed, layout.throughIds);
  const gradient = checkGradient(layout);
  const elevation = checkElevation(layout);
  const banks = checkBanks(layout);
  const shoulders = checkShoulders(layout);

  const failures: RouteFailure[] = [
    ...checkClearance(layout),
    ...checkRunLength(requiredLength),
    ...checkLandable(layout, speeds),
    ...checkReconnect(layout),
    ...checkSeams(layout),
    ...banks.failures,
    ...shoulders.failures,
    ...gradient.failures,
    ...checkSurfaces(layout),
    ...elevation.failures,
    ...checkHazards(layout),
    ...checkTargets(layout),
  ];

  const budget = withinRenderBudget(layout.plan);
  for (const breach of budget.breaches) {
    failures.push({ contract: 'render-budget', detail: breach });
  }

  return {
    valid: failures.length === 0,
    failures,
    requiredLength,
    steepestRequiredGradient: gradient.steepest,
    worstElevationDrift: elevation.drift,
    speedProfile: speeds,
  };
}
