/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE, EUC, PHYSICS } from '../data/tuning.ts';
import type { ActionSnapshot } from '../input/actions.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import {
  createSpineLocation,
  createSpineSample,
  type RouteSpine,
  type SpineLocation,
  type SpineSample,
} from './routeSpine.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';

/**
 * The cop's brain — M18 Phase 1.
 *
 * **It is not a second controller. It is a thing that fills in an
 * `ActionSnapshot`**, and that is the whole architectural claim of the
 * milestone: `input/actions.ts` has carried pure intent since M1 — throttle,
 * steer, crouch, hop, swing, and nothing about where they came from — so a CPU
 * rider is a keyboard that thinks. `EucController` cannot tell one from a
 * player, and gets no new branch, no new field and no new mode. Everything the
 * cop does, a player could do with the same four keys.
 *
 * The consequence worth stating: **the cop rides the player's ride.** Hazards,
 * wobble, kerbs, the wall standoff, the power ladder, the ragdoll — he is
 * subject to every one of them, because he is a second `EucController` over the
 * same `PlanTerrainSampler`. That is what makes the road the escaping player's
 * weapon (§13 q28): lead him through a spill or over a deep pothole and he goes
 * down exactly as the player would, and no code here or anywhere else has to
 * arrange it.
 *
 * Nothing here may import three.js (invariant 1), and nothing here reads a
 * player option (invariant 5). It is `node --test` territory in full, which is
 * why Phase 1's kill gate could be a headless sweep rather than a browser ride.
 *
 * ## What it senses, and what Phase 1 had to add
 *
 * The line ahead (`RouteSpine`), the hazards in it, its own pose and speed, and
 * where the quarry is. The first version of this file sensed exactly that and
 * **crashed on 33 of the 48 pinned seeds**, every one of them `cause=obstacle`:
 * a route is not an empty corridor, and the plaza gateways, traffic islands,
 * bollards and roadside trees a rider steers around are invisible to a brain
 * that only knows where the road *is*. So the world's solid geometry is
 * projected onto the line at construction and avoided by the same arithmetic
 * hazards are. That was the whole of the fix, and it is worth recording as the
 * shape of the failure rather than as a bug: **the road is not the obstacles.**
 *
 * It reads the plan rather than casting rays, which is a deliberate trade. A
 * feeler through `TerrainSampler.raycastObstacle` would be honest and would
 * also be a second cast per step per cop, answering with one distance where the
 * useful question is "which side has room". Projecting once at install costs a
 * few milliseconds in `Game.installLevel`, where a world is already being
 * built, and gives the brain the same picture for every step of the run.
 *
 * ## Why it steers with a lookahead rather than a plan
 *
 * Pure pursuit: aim at a point a fixed *time* ahead on the line and steer at
 * it. It is the same shape the browser suite's own `followRoute` has driven
 * full laps with since M10, on two gains and no eyes, and it needs no search at
 * ride time. The two ways it can look bad are both handled and both are
 * tunable: too short a lookahead saws at the wheel (`steerDamping`), and too
 * long a one cuts corners onto the verge (`lookaheadSeconds`).
 *
 * ## Why the speed is a profile rather than a number
 *
 * A cop who reads the corner he is *in* is a cop who is already too fast for
 * it. Everything that limits speed — a bend, a pothole he cannot pass, a
 * gateway pillar — is turned into "how fast may I be *there*", and then into
 * how fast he may be *here* to still get down to it: `v² = v_there² + 2·a·d`.
 * The minimum over the whole horizon is the speed he asks for. One arithmetic
 * covers braking for corners, hazards and obstacles, and the `skill` knob has
 * exactly one place to bite.
 *
 * ## Why the skill knob is not a speed knob
 *
 * §13 q27, and it is a hard rule rather than a preference. The cop is on the
 * player's wheel with the player's tuning, so a cop who is *faster* is a cop
 * who breaks the promise that two players ride the same machine (§13 q3).
 * `skill` therefore buys exactly two things — how close to the racing line he
 * rides and how early he brakes for what is coming — and both of them are
 * things a human is better or worse at. A poor cop is not slow; he is wide into
 * corners and late on the brakes, which is how the player watches him put
 * himself in the pothole they just rode around.
 */

/** What the brain is allowed to know about the body it is driving. */
export interface CpuView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The clean heading, radians about +Y. Never the wobbled one. */
  readonly headingY: number;
  readonly speed: number;
  readonly grounded: boolean;
  readonly crashed: boolean;
  /**
   * The kerb feeler's reading, metres — `EucSnapshot.curbAhead`.
   *
   * Read rather than derived, because the controller already casts this ray
   * every step for the player and a second cast from here would be the same
   * geometry answered twice (master §5.4).
   */
  readonly curbAhead: number;
  /**
   * The lateral acceleration the wheel can actually hold here, in g.
   *
   * **The surface's answer, not the tuning table's.** `EUC.maxLateralG` is what
   * pavement gives; dirt and gravel give less, and a cop who cornered as though
   * every surface were pavement understeered off the outside of every gravel
   * bend in the sweep. Reading the live limit means the brain never has to know
   * what a surface is.
   */
  readonly lateralLimitG: number;
}

/** Where the thing being chased is. Null when there is nobody to chase. */
export interface CpuQuarry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speed: number;
}

/**
 * Something on the line worth not hitting, in the line's own coordinates.
 *
 * One shape for hazards and solids alike: a span of route it occupies, the band
 * across the road it blocks, and how fast it may be met. A pothole may be met
 * slowly; a bollard may not be met at all, which is `Infinity`'s meaning here
 * and is why `safeSpeed` is a number rather than a flag.
 */
export interface RouteBlocker {
  /** Where it starts and ends along the line, metres. */
  readonly from: number;
  readonly to: number;
  /** The band it blocks across the road: positive is to the **left**. */
  readonly left: number;
  readonly right: number;
  /** How fast it may be passed through, m/s. Zero means "not at all". */
  readonly safeSpeed: number;
}

/** Shortest signed difference between two angles, radians. */
function wrapAngle(radians: number): number {
  let value = radians;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * A repeatable pseudo-noise in -1..1 from a distance along the route.
 *
 * **Deterministic on purpose and `Math.random` is forbidden here.** A chase
 * that wandered differently on every run could not be replayed, could not be
 * asserted, and would make `advance(n)` disagree with itself — the same rule
 * that governs the generator's seeded streams. Two sines at incommensurable
 * rates is enough irregularity for a line that should look human and is
 * cheaper than a hash.
 */
function wander(distance: number, cycles: number): number {
  const phase = distance * cycles * 0.01 * Math.PI * 2;
  return Math.sin(phase) * 0.65 + Math.sin(phase * 1.618 + 1.3) * 0.35;
}

export class CpuRider {
  // -- Live tuning. Seeded from the frozen defaults, replaced by F4 -----------
  //
  // Mutable fields rather than reads through the tuning table, on the pattern
  // `simulation/paddle.ts` and `EucController` already use: `Game.applyTuning`
  // writes them and a world swap constructs a fresh brain and replays the same
  // writes. Annotated `: number` rather than inferred, because the tuning table
  // is `as const` and an inferred field would take the literal type of today's
  // default and refuse every value F4 could write into it.
  skill: number = CHASE.copSkill;
  lookaheadSeconds: number = CHASE.lookaheadSeconds;
  lookaheadMinMetres: number = CHASE.lookaheadMinMetres;
  steerGain: number = CHASE.steerGain;
  steerDamping: number = CHASE.steerDamping;
  throttleGain: number = CHASE.throttleGain;
  corneringMargin: number = CHASE.corneringMargin;
  hazardClearanceMetres: number = CHASE.hazardClearanceMetres;
  hazardSwerveShare: number = CHASE.hazardSwerveShare;
  brakeSafety: number = CHASE.brakeSafety;
  skillWanderMetres: number = CHASE.skillWanderMetres;
  skillWanderPerHundredMetres: number = CHASE.skillWanderPerHundredMetres;
  skillBrakeLateness: number = CHASE.skillBrakeLateness;
  hopCurbHeight: number = CHASE.hopCurbHeight;
  swingRangeMetres: number = CHASE.swingRangeMetres;
  swingConeRadians: number = CHASE.swingConeRadians;
  swingCooldownSeconds: number = CHASE.swingCooldownSeconds;
  pursuitLateralFollow: number = CHASE.pursuitLateralFollow;
  fieldRangeMetres: number = CHASE.fieldRangeMetres;

  private readonly spine: RouteSpine;
  private readonly blockers: readonly RouteBlocker[];

  /** Where the brain believes it is on the line. Windowed, so it cannot jump. */
  private cursor = 0;
  /** Which way along the route the quarry currently is: +1 toward the end. */
  private pursuitDirection: 1 | -1 = 1;
  /** Whether the chase has left the road for the grass. Hysteretic; see step. */
  private fieldPursuit = false;
  /** Previous heading, for the turn rate the damping term needs. */
  private lastHeading = 0;
  private hasHeading = false;
  private swingCooldown = 0;
  /** How long the wheel has been going nowhere while asking to. */
  private stuckSeconds = 0;

  // Scratch. One brain steps 120 times a second and every one of these would
  // otherwise be garbage.
  private readonly location: SpineLocation = createSpineLocation();
  private readonly aim: SpineSample = createSpineSample();
  private readonly curveA: SpineSample = createSpineSample();
  private readonly curveB: SpineSample = createSpineSample();
  private readonly quarryAt: SpineLocation = createSpineLocation();
  /** Blockers close enough to matter this step. Reused; never grows unbounded. */
  private readonly conflicts: RouteBlocker[] = [];
  /** Blocked lateral bands at the gate, as flat low/high pairs. Reused. */
  private readonly gaps: number[] = [];
  private readonly actions = {
    throttle: 0,
    steer: 0,
    crouch: false,
    hop: false,
    swing: false,
    reset: false,
    cameraCycle: false,
    pause: false,
    muteAudio: false,
  };

  /**
   * `ground` is read **at construction only**, never in the step.
   *
   * It is the one honest way to ask how high the road is under a point
   * (invariant 3), and the projection below needs that to tell a bridge deck —
   * which the rider rides *on* — from the railing beside it. Keeping it out of
   * the step is what keeps the brain sensing what a rider senses rather than
   * querying the world 120 times a second.
   */
  constructor(spine: RouteSpine, plan: LevelPlan, ground: TerrainSampler) {
    this.spine = spine;
    this.blockers = routeBlockers(spine, plan, ground);
  }

  /** How far along the route the brain believes it is, metres. */
  get routeDistance(): number {
    return this.cursor;
  }

  /** How many things on the line it is steering around. Diagnostics and tests. */
  get blockerCount(): number {
    return this.blockers.length;
  }

  /**
   * What it believes is in the way, in the line's own coordinates.
   *
   * For tests and for the bench: the projection from world boxes into
   * curvilinear coordinates is the part of this file that has been wrong twice,
   * and it is not visible from the outside in any other way.
   */
  get blockerField(): readonly RouteBlocker[] {
    return this.blockers;
  }

  /**
   * Put the brain where the body is, with no history.
   *
   * Called on every teleport the composition root can see — the spawn, a
   * restart, a world swap — for the reason `Paddle.reseed` exists: the cursor
   * is a windowed search around the last answer, so a body that moved a hundred
   * metres between two steps would otherwise search the wrong hundred metres
   * and steer at a road it is no longer on. The search here is global, which is
   * the only place in the step path one happens.
   */
  place(view: CpuView): void {
    this.spine.locate(view.x, view.z, -1, this.location);
    this.cursor = this.location.distance;
    this.lastHeading = view.headingY;
    this.hasHeading = true;
    this.swingCooldown = 0;
    this.stuckSeconds = 0;
    this.pursuitDirection = 1;
    this.fieldPursuit = false;
  }

  /**
   * One fixed step of thinking. Returns the intent for this step.
   *
   * The returned object is reused between steps and is only valid until the
   * next call — the controller reads it immediately and keeps nothing, which is
   * what makes that safe and allocation-free.
   */
  step(dt: number, view: CpuView, quarry: CpuQuarry | null): ActionSnapshot {
    const actions = this.actions;
    actions.throttle = 0;
    actions.steer = 0;
    actions.crouch = false;
    actions.hop = false;
    actions.swing = false;

    this.swingCooldown = Math.max(0, this.swingCooldown - dt);

    // A crashed rider is not riding. The controller respawns him on its own
    // timer exactly as it does the player, and thinking through a crash would
    // hand held throttle to the step he stands up on.
    if (view.crashed) {
      this.lastHeading = view.headingY;
      this.stuckSeconds = 0;
      return actions;
    }

    if (!this.hasHeading) this.place(view);

    // -- Where am I ----------------------------------------------------------
    this.spine.locate(view.x, view.z, this.cursor, this.location);
    // **Lost, and able to be found again.** The windowed search is what stops a
    // route that crosses itself from teleporting the cursor onto the other
    // road, and its cost is that a rider who ends up further from the line than
    // the window is half its width can never be located again — cursor frozen,
    // aim point fixed, riding away from the map forever, which one pinned seed
    // did for four solid minutes. Falling back to the global search when the
    // windowed answer is absurd costs one scan of a few hundred points, on the
    // rare steps where it is the only correct thing to do.
    if (this.location.offRoute > RELOCATE_METRES) {
      this.spine.locate(view.x, view.z, -1, this.location);
    }
    this.cursor = this.location.distance;
    // Which side of the line he is on, signed. `SpineLocation.offRoute` is
    // deliberately unsigned; the gap choice below is the one consumer that
    // needs the side, and it needs it badly — see the hysteresis note there.
    this.spine.sample(this.cursor, this.curveA);
    const selfLateral = (view.x - this.curveA.x) * Math.cos(this.curveA.headingY)
      - (view.z - this.curveA.z) * Math.sin(this.curveA.headingY);

    const skill = clamp(this.skill, 0, 1);
    const lookahead = Math.max(this.lookaheadMinMetres, view.speed * this.lookaheadSeconds);
    let routeGap = Infinity;
    let quarryRange = Infinity;
    let quarrySpeed = 0;

    // **A pursuit has a direction; a route follower does not.** The M18 first
    // pass only copied the quarry's lateral line when the quarry happened to be
    // ahead. Once the cop passed them he kept riding toward the route end, which
    // made the player chase the cop. Locate the quarry globally — players can
    // reset, reverse and cross a branch — and turn the route follower around
    // when the quarry is genuinely on the other side of him. The hysteresis is
    // the swing range plus the clearance already used for line choice: inside
    // that band he holds his approach instead of flipping direction every time
    // the two riders trade half a metre.
    if (quarry !== null) {
      this.spine.locate(quarry.x, quarry.z, -1, this.quarryAt);
      routeGap = this.quarryAt.distance - this.cursor;
      quarryRange = Math.hypot(quarry.x - view.x, quarry.z - view.z);
      quarrySpeed = Math.abs(quarry.speed);
      const switchGap = this.swingRangeMetres + this.hazardClearanceMetres;
      if (this.pursuitDirection > 0 && routeGap < -switchGap) {
        this.pursuitDirection = -1;
      } else if (this.pursuitDirection < 0 && routeGap > switchGap) {
        this.pursuitDirection = 1;
      }
    } else {
      // The chase probe and Phase 1's solo sweep remain a forward route ride.
      this.pursuitDirection = 1;
    }
    const direction = this.pursuitDirection;

    // **The field is part of the chase.** The corridor-clamped follow below
    // chases a rider *along the route*, and the stray rule busts one who rides
    // far from it — but between the road's edge and the stray limit there was a
    // band where a rider could simply stand, watching a cop who would not leave
    // the tarmac circle below them. The owner stood in it on his first ride.
    // So: a quarry clear of the corridor and near enough to reach is pursued
    // **directly, across the grass** — the spine, its blockers and its corner
    // profile are the road's facts, and none of them lies between two riders in
    // a field. Both edges are hysteretic, because both are edges a chase
    // oscillates across at speed: the corridor's (a rider skimming the verge)
    // and the range's (a rider pulling away). Leaving the road is not free for
    // him — the off-road speed cap below applies to the cop like anybody, the
    // surround's trees and rocks are things he can be led into, and a faster
    // quarry that pulls out of range is chased along the road again until he
    // draws level. That leapfrog is the balance, not a failure of it.
    if (quarry !== null) {
      const quarryOff = this.quarryAt.offRoute - this.quarryAt.halfWidth;
      this.fieldPursuit = this.fieldPursuit
        ? quarryOff > FIELD_EXIT_MARGIN
          && quarryRange < this.fieldRangeMetres * FIELD_RANGE_EXIT_SHARE
        : quarryOff > FIELD_ENTER_MARGIN && quarryRange < this.fieldRangeMetres;
    } else {
      this.fieldPursuit = false;
    }
    const field = this.fieldPursuit && quarry !== null;

    this.spine.sample(this.cursor + direction * lookahead, this.aim);

    // -- Which line to take --------------------------------------------------
    //
    // Lateral offsets are composed in the aim point's own frame and clamped to
    // the corridor once, at the end. Positive is to the **left** of travel: in
    // this world +X is the rider's left, so the left vector at heading h is
    // (cos h, −sin h) and this sign is the same one `paddle.ts` derives.
    let offset = 0;

    // Follow the quarry's own lateral line, so a cop on the same stretch does
    // not run parallel. Longitudinal pursuit is the direction and closing-speed
    // profile above and below; conflating the two is how the original racer
    // passed its route sweep without ever proving it could pursue. Clamped to
    // the corridor: this is the *road* half of the pursuit, and a rider clear
    // of the road entirely is the field pursuit's job above.
    if (quarry !== null) {
      this.spine.sample(this.quarryAt.distance, this.curveA);
      const dx = quarry.x - this.curveA.x;
      const dz = quarry.z - this.curveA.z;
      const left = dx * Math.cos(this.curveA.headingY) - dz * Math.sin(this.curveA.headingY);
      offset += clamp(left, -this.aim.halfWidth, this.aim.halfWidth) * this.pursuitLateralFollow;
    }

    // The skill wander: the whole visible difference between a cop who rides
    // well and one who does not, and it is zero at skill 1 by construction.
    offset += wander(this.cursor, this.skillWanderPerHundredMetres)
      * this.skillWanderMetres * (1 - skill);

    // -- How fast the road ahead allows --------------------------------------
    //
    // **A poor cop leaves his braking later, and the direction of that is worth
    // stating because it shipped backwards first.** `skillBrakeLateness` is the
    // share of the distance he needs that he actually uses at skill 0 — 45% —
    // so he behaves as though he had `1 / 0.45` times the room he really has,
    // arrives too fast, and runs wide or clips the thing he was avoiding. At
    // skill 1 the belief is exact, less the safety factor. The first version
    // divided the other way round: an unskilled cop believed he had *less*
    // room, braked earlier than a good one, and was measurably safer — a
    // difficulty knob that made the game easier at both ends.
    const braking = Math.max(1, EUC.brakeAuthority);
    const lateness = this.skillBrakeLateness + (1 - this.skillBrakeLateness) * skill;
    const reaction = Math.max(0.05, 1 / (Math.max(0.05, lateness) * this.brakeSafety));
    /** The same belief as a plain multiplier: 1 at full skill, optimistic below. */
    const optimism = reaction * this.brakeSafety;
    const stopping = (view.speed * view.speed) / (2 * braking);
    const horizon = Math.max(30, lookahead + stopping + 10);

    let cap = Infinity;
    /** Speed here that still allows `limit` at `distance` metres ahead. */
    const allow = (limit: number, distance: number): number => (
      Math.sqrt(Math.max(0, limit * limit + 2 * braking * Math.max(0, distance) * reaction))
    );

    // The corner profile. Sampled along the horizon rather than read at the
    // lookahead, because the corner that decides a cop's speed is the one he is
    // about to arrive at, not the one he is in.
    const lateralLimit = Math.max(0.1, view.lateralLimitG) * PHYSICS.gravity
      * this.corneringMargin
      // A poor cop also corners wider, which reads as him running out of road
      // rather than as him being underpowered.
      * (0.7 + 0.3 * skill);
    if (!field) {
      for (let ahead = 0; ahead <= horizon; ahead += CORNER_SCAN_METRES) {
        const curvature = Math.abs(this.spine.curvature(
          this.cursor + direction * ahead,
          this.cursor + direction * (ahead + CORNER_SCAN_METRES),
          this.curveA,
          this.curveB,
        ));
        if (curvature <= 1e-4) continue;
        cap = Math.min(cap, allow(Math.sqrt(lateralLimit / curvature), ahead));
      }
    }

    // -- What is in the way --------------------------------------------------
    //
    // **Every blocker in the window at once, never one at a time.** The first
    // version of this steered past each blocker in turn and let the next one
    // overwrite the offset — so the bollard three metres ahead was avoided and
    // then un-avoided by a gateway thirty metres further on, and the cop rode
    // into the bollard at full speed with a perfectly good line chosen for
    // something he never reached. What a rider actually picks is a **gap**: one
    // offset that clears everything close enough to matter, as near as possible
    // to the line they wanted.
    const room = this.hazardClearanceMetres;
    const near = Math.max(MIN_AIM_METRES, lookahead + stopping);

    // A field pursuit reads none of this: the blockers are projected in the
    // line's own coordinates and describe the road's furniture, and a cop on
    // the grass steering by them would brake for bollards that are nowhere near
    // him. What is actually around him out there — the surround's trees, rocks
    // and fences — he meets the way the escaping player means him to: with the
    // wall standoff, the stuck reversal, and sometimes with his face.

    // **The nearest thing actually in the way, and then only its own
    // cross-section.** Two rules, and both were learned by watching the cop sit
    // still. *Nothing level with or behind the wheel is an obstacle* — you
    // cannot brake for something you are already alongside, and the plaza's
    // own back wall projects onto the line at the spawn, which pinned the very
    // first version to zero speed before it had moved a metre. And *the gap is
    // chosen across one gate, not across the whole horizon* — a wall thirty
    // metres ahead at a corner blocks every offset when its band is merged with
    // a bollard's here, so a version that intersected them all found no line
    // through an empty road and stopped.
    //
    // The conflict is tested against **the band between where he is and where
    // he wants to be**, not against the wanted line alone. A cop a couple of
    // metres wide of his own line — which is ordinary tracking error, not a
    // mistake — is heading through everything in between, and testing the
    // wanted line alone declared a park gate's piers no obstacle at all
    // because the *centre* of the opening was clear. He was two metres from
    // the centre and clipped the pier at speed.
    const lineLow = Math.min(selfLateral, offset);
    const lineHigh = Math.max(selfLateral, offset);
    let blocking: RouteBlocker | null = null;
    if (field) {
      // Nothing on the line is in the way of a chase that has left it.
    } else if (direction > 0) {
      for (const blocker of this.blockers) {
        if (blocker.to < this.cursor + BEHIND_MARGIN) continue;
        if (blocker.from > this.cursor + near) break;
        if (blocker.right - room > lineHigh || blocker.left + room < lineLow) continue;
        blocking = blocker;
        break;
      }
    } else {
      for (let index = this.blockers.length - 1; index >= 0; index -= 1) {
        const blocker = this.blockers[index];
        if (blocker.from > this.cursor - BEHIND_MARGIN) continue;
        if (blocker.to < this.cursor - near) break;
        if (blocker.right - room > lineHigh || blocker.left + room < lineLow) continue;
        blocking = blocker;
        break;
      }
    }

    let avoidAt = Infinity;
    if (blocking !== null) {
      avoidAt = direction > 0 ? blocking.from - this.cursor : this.cursor - blocking.to;
      // Everything in the same gate: what a rider sees as one thing to get
      // past, which is a pillar and the kerb beside it rather than a pillar and
      // a wall at the next junction.
      const gateLow = blocking.from - GATE_SPAN_METRES;
      const gateHigh = blocking.to + GATE_SPAN_METRES;
      this.conflicts.length = 0;
      for (const blocker of this.blockers) {
        if (blocker.to < gateLow) continue;
        if (blocker.from > gateHigh) break;
        this.conflicts.push(blocker);
      }

      // **He aims at the middle of the gap, not at its edge.** A gateway is
      // two pillars with a rideable opening between them, and there are two
      // ways to describe the line through it. Picking the nearest clear *edge*
      // is what this did first, and it fails twice over: the candidate is
      // generated from a blocker's own edge, so it has to be compared against
      // that blocker with a tolerance or it rejects itself — and even when it
      // is accepted, a rider tracking a line that exactly grazes a pillar
      // clips the pillar, because pure pursuit has lateral error of its own.
      // Subtracting the blocked bands from the corridor and steering at what
      // is *left* gives the same line through a wide gap and a much better one
      // through a narrow gap, with no tolerance anywhere.
      const limit = this.aim.halfWidth * SHOULDER_SHARE;
      this.gaps.length = 0;
      for (const blocker of this.conflicts) {
        this.gaps.push(blocker.right - TIGHT_ROOM, blocker.left + TIGHT_ROOM);
      }

      let bestLow = 0;
      let bestHigh = 0;
      let bestWidth = -1;
      let cursorEdge = -limit;
      // The blocked bands, in order, with the free stretch before each one.
      const order: number[] = [];
      for (let i = 0; i < this.gaps.length; i += 2) order.push(i);
      order.sort((a, b) => this.gaps[a] - this.gaps[b]);
      const takeGap = (low: number, high: number): void => {
        const width = high - low;
        if (width < MIN_GAP_METRES) return;
        // **Scored by how far he would have to move from where he actually is,
        // and that is hysteresis rather than an optimisation.** Scoring against
        // the *wanted* line instead put the two gaps either side of a bollard
        // in the middle of a nine-metre road within a few centimetres of each
        // other, so the winner changed as the road curved and the cop swerved
        // left, then right, then arrived at the bollard dead centre and hit it
        // at full speed. Measuring from his own line makes the gap he is
        // already entering win every subsequent step by construction.
        const target = clamp(offset, low + Math.min(room, width / 2), high - Math.min(room, width / 2));
        // Nearest, less a credit for width. A plaza's bollards stand in rows
        // with metre-and-a-half slots between them and five metres of clear
        // brick beside them, and a purely nearest rule threads the slot — which
        // is a line with no margin for the pursuit's own error, and the one
        // remaining way the sweep put him into a bollard.
        const score = Math.abs(target - selfLateral) - Math.min(width, GAP_WIDTH_CAP) * GAP_WIDTH_BIAS;
        if (bestWidth >= 0 && score >= bestScore) return;
        bestScore = score;
        bestWidth = width;
        bestLow = low;
        bestHigh = high;
      };
      let bestScore = Infinity;
      for (const index of order) {
        const low = this.gaps[index];
        const high = this.gaps[index + 1];
        if (low > cursorEdge) takeGap(cursorEdge, low);
        cursorEdge = Math.max(cursorEdge, high);
      }
      if (cursorEdge < limit) takeGap(cursorEdge, limit);

      if (bestWidth >= 0) {
        // Inside the gap by as much as it can spare, up to the clearance he
        // would have taken anyway. A wide opening therefore costs him nothing
        // and a tight one puts him exactly down the middle.
        const margin = Math.min(room, bestWidth / 2);
        offset = clamp(offset, bestLow + margin, bestHigh - margin);
      } else {
        // Nowhere to go at all: arrive at a speed it can be met at. For a wall
        // that is zero, which is a cop stopping — correct, and rare, because a
        // route the validator passed has a rideable line through it and the
        // subtraction above is what finds it.
        cap = Math.min(cap, allow(blocking.safeSpeed, Math.max(0, avoidAt)));
      }

      // **Aim at the thing being avoided, not past it.** Pure pursuit corrects
      // by the *angle* to its aim point, so an offset applied twelve metres out
      // is a four-degree correction — nowhere near enough to miss a bollard
      // three metres away. Pulling the aim in to the obstacle is what turns the
      // same offset into a real swerve, and it is why this is a lookahead in
      // metres here and a lookahead in seconds everywhere else.
      if (avoidAt < lookahead) {
        this.spine.sample(
          this.cursor + direction * Math.max(MIN_AIM_METRES, avoidAt),
          this.aim,
        );
      }
    }

    // **The end of the line is a place to stop, not to ride past.** A route is
    // point-to-point (§13 q6) and the cop rides roads (§18.7), so past the last
    // sample there is nothing to follow and the surround is what he ploughs
    // into — which is what he did, at speed, on eight of the pinned seeds. The
    // player who rides off the end is answered by the stray rule instead.
    // Not in a field pursuit: a quarry camped off-road beside the route's last
    // metres would otherwise be protected by this very cap, the cop braking to
    // a stand at the line's end while aiming at somebody standing past it.
    if (!field) {
      const endMargin = quarry === null ? END_MARGIN_METRES : 0;
      const routeLeft = direction > 0
        ? this.spine.length - endMargin - this.cursor
        : this.cursor - endMargin;
      cap = Math.min(cap, allow(0, routeLeft));
    }

    // Close to striking distance, then match the quarry instead of sailing
    // past. This is the same braking equation used for corners and obstacles:
    // the quarry's current speed is the allowed speed at the stand-off point,
    // and the cop may spend only the distance left before it. No multiplier can
    // make his wheel faster than the player's; this only decides when he asks
    // their shared controller to brake.
    if (quarry !== null) {
      const standOff = Math.max(0, this.swingRangeMetres - this.hazardClearanceMetres);
      // Route projection clamps both riders to an endpoint. At chase spawn the
      // player is on distance zero and the cop is physically `spawnGapMetres`
      // behind that endpoint, so their route gap is zero while their real gap
      // is not. Treating the projected gap as the whole closing distance made
      // the cop hold still at the start. The road distance is never shorter
      // than the straight-line range, so the larger of the two remains the
      // conservative distance available on bends and the truthful one at a
      // clamped endpoint.
      // In the field the road distance means nothing — a switchback can put
      // two hundred metres of route between riders fifteen metres apart — so
      // the straight line is the whole closing distance there.
      const closingDistance = field
        ? quarryRange
        : Math.max(Math.abs(routeGap), quarryRange);
      cap = Math.min(cap, allow(quarrySpeed, closingDistance - standOff));
    }

    // Off the road is somewhere to leave, not somewhere to hurry through: the
    // dressing lives out here and the grip does not. Scaled rather than
    // switched, so there is no edge for him to oscillate across.
    // Measured from a *share* of the corridor rather than from its edge: by the
    // time a rider is off the road they are already in the dressing, and the
    // useful moment to shed speed is while they are still running wide on it.
    const strayed = Math.max(0, this.location.offRoute - this.location.halfWidth * CORRIDOR_SHARE);
    if (strayed > 0) cap = Math.min(cap, Math.max(6, 20 - strayed * 2));

    // -- Turn the aim point into intent --------------------------------------
    let aimX: number;
    let aimZ: number;
    if (field && quarry !== null) {
      // Straight at them. Pure pursuit needs no line when the target is the
      // point; the closing-speed cap above already stops him sailing past.
      aimX = quarry.x;
      aimZ = quarry.z;
    } else {
      const clamped = clamp(offset, -this.aim.halfWidth * 0.9, this.aim.halfWidth * 0.9);

      // **Never ask for more sideways than the tyre can give.** Choosing a line
      // is not the same as reaching it: moving Δ across the road within the
      // distance d that is left needs `d ≥ v·sqrt(2Δ/a)`, and inverting that
      // for v is the speed at which the line he has chosen is a line he can
      // take. It covers every case rather than only avoidance — threading a
      // gateway, rejoining after running wide, following the quarry across the
      // road — and it reuses the lateral limit the corners are taken on, so it
      // slows for a swerve on gravel by exactly as much more as it should.
      // Floored, because this answers "how fast may I be" and not "should I
      // stop": three pinned seeds crawled to a halt before the floor was added.
      const sideways = Math.abs(clamped - selfLateral);
      const aimAt = Math.max(MIN_AIM_METRES, Math.abs(this.aim.distance - this.cursor));
      if (sideways > 0.05) {
        // Optimism rather than `reaction` itself: the same knob seen a second
        // time, normalised so a full-skill cop swerves at exactly the physics
        // (1.0) and a poor one believes he can cross the road in twice the
        // distance he has. Using `reaction` raw here would have made the
        // skilled cop conservative *twice over* and left him crawling through
        // the park gate, which is what it did.
        cap = Math.min(cap, Math.max(
          SWERVE_SPEED_FLOOR,
          aimAt * optimism * Math.sqrt(lateralLimit / (2 * sideways)),
        ));
      }
      aimX = this.aim.x + Math.cos(this.aim.headingY) * clamped;
      aimZ = this.aim.z - Math.sin(this.aim.headingY) * clamped;
    }

    const bearing = wrapAngle(Math.atan2(aimX - view.x, aimZ - view.z) - view.headingY);
    // A quarry behind asks for a U-turn, not reverse gear. Backing toward the
    // rider would leave the paddle pointing away from the person it has to hit.
    // Shed speed until the normal low-speed steering can turn inside the road,
    // but keep moving: ordinary steer is deliberately disarmed at a standstill.
    if (Math.abs(bearing) > Math.PI / 2) {
      cap = Math.min(cap, Math.min(EUC.technicalTurnFadeSpeed, this.lookaheadMinMetres));
    }
    actions.throttle = Number.isFinite(cap)
      ? clamp((cap - Math.max(0, view.speed)) * this.throttleGain, -1, 1)
      : 1;
    // The turn rate, from the heading the body actually reached. Derived rather
    // than asked for, so the brain keeps sensing only what a rider senses.
    const turnRate = dt > 0 ? wrapAngle(view.headingY - this.lastHeading) / dt : 0;
    this.lastHeading = view.headingY;

    // **Both signs come from one convention and neither is guessed.** Positive
    // yaw about +Y turns left, and `steer` is +1 to the rider's *right*: so an
    // aim point to the left (positive bearing) is a negative steer, and a body
    // already turning left (positive turn rate) is damped by a positive one.
    actions.steer = clamp(-this.steerGain * bearing + this.steerDamping * turnRate, -1, 1);

    // **Stuck is its own state, and it exists because being blocked is not
    // crashing.** A wheel held against a pillar by its own throttle sits there
    // at zero for as long as the brain keeps asking, and a chase in which the
    // cop is quietly parked against a bollard for four minutes reads as the
    // mode being broken. Backing out and turning is what a rider does.
    // Deliberately not conditioned on the throttle: the commonest way to be
    // stuck is to have braked for something unpassable and then have nothing
    // ask the wheel to move again, which is a stopped cop with a *negative*
    // throttle. He never wants to be stationary, so any long stop is a fault.
    const standOff = Math.max(0, this.swingRangeMetres - this.hazardClearanceMetres);
    // Holding is a physical relationship, not a projection relationship. Two
    // riders clamped to the same endpoint can still be many metres apart.
    const holdingQuarry = quarry !== null && quarryRange <= standOff;
    if (holdingQuarry) this.stuckSeconds = 0;
    else if (view.grounded && Math.abs(view.speed) < STUCK_SPEED) this.stuckSeconds += dt;
    else if (Math.abs(view.speed) > STUCK_SPEED * 3) this.stuckSeconds = 0;
    if (this.stuckSeconds > STUCK_SECONDS) {
      actions.throttle = -1;
      actions.steer = bearing >= 0 ? 1 : -1;
      if (this.stuckSeconds > STUCK_SECONDS + STUCK_REVERSE_SECONDS) this.stuckSeconds = 0;
    }

    // The kerb, hopped off the controller's own feeler. `canAcceptHop` is the
    // authority on whether it happens, exactly as it is for a player holding
    // the key down: this is a request, not a jump.
    actions.hop = view.grounded && view.curbAhead > this.hopCurbHeight;

    // -- The swing -----------------------------------------------------------
    if (quarry !== null && this.swingCooldown <= 0) {
      const dx = quarry.x - view.x;
      const dz = quarry.z - view.z;
      const range = Math.sqrt(dx * dx + dz * dz);
      if (range <= this.swingRangeMetres) {
        const toQuarry = wrapAngle(Math.atan2(dx, dz) - view.headingY);
        if (Math.abs(toQuarry) <= this.swingConeRadians) {
          actions.swing = true;
          this.swingCooldown = this.swingCooldownSeconds;
        }
      }
    }

    return actions;
  }
}

/** How finely the corner profile is sampled along the horizon, metres. */
const CORNER_SCAN_METRES = 6;
/** The closest the aim point may be pulled in while avoiding, metres. */
const MIN_AIM_METRES = 4;
/** How far ahead of the wheel a blocker has to end to still be in the way, metres. */
const BEHIND_MARGIN = 1;
/** How much route past a blocker counts as the same gate to thread, metres. */
const GATE_SPAN_METRES = 6;
/**
 * The narrowest line the cop will take past something, metres.
 *
 * The wheel's own half-width plus the rider stood on it, and no comfort at all.
 * It is what he squeezes down to rather than stopping, and it is deliberately a
 * constant rather than a slider: below it he is clipping things, and that is a
 * physical fact rather than a difficulty choice.
 */
const TIGHT_ROOM = 0.7;
/** The narrowest opening the cop will thread rather than brake for, metres. */
const MIN_GAP_METRES = 0.35;
/** How far onto the shoulder he will go when the corridor has no gap, ×halfWidth. */
const SHOULDER_SHARE = 1.35;
/** How far short of the line's end the cop brings himself to a halt, metres. */
const END_MARGIN_METRES = 6;
/** How much a metre of gap width is worth against a metre of detour. */
const GAP_WIDTH_BIAS = 0.6;
/** Past this width a gap is simply wide, metres. */
const GAP_WIDTH_CAP = 6;
/** The share of the corridor he uses before running wide starts costing speed. */
const CORRIDOR_SHARE = 0.8;
/** How far off the line the windowed search stops being believed, metres. */
const RELOCATE_METRES = 30;
/** The slowest a swerve may ask him to go, m/s. Below this he is stopping. */
const SWERVE_SPEED_FLOOR = 5;
/** Below this the wheel is going nowhere, m/s. */
const STUCK_SPEED = 0.6;
/** How long it may go nowhere before the brain backs it out, seconds. */
const STUCK_SECONDS = 1.4;
/** How long it backs out for, seconds. */
const STUCK_REVERSE_SECONDS = 1.0;
/**
 * How far past the road's edge a quarry must be before the cop leaves it,
 * metres — and how close to it he still counts as being *on* it once he has.
 *
 * Two numbers rather than one because the corridor's edge is a line a skimming
 * rider crosses several times a second, and a cop who reconsidered his whole
 * strategy at that rate would weave between two aims and hold neither. Enter
 * wide, leave narrow: once he is on the grass he stays committed until the
 * rider is genuinely back on the road.
 */
const FIELD_ENTER_MARGIN = 2.0;
const FIELD_EXIT_MARGIN = 0.75;
/** The range hysteresis: engaged at the tunable range, dropped at this share over. */
const FIELD_RANGE_EXIT_SHARE = 1.3;

/**
 * How high something has to be before it is worth steering around, metres.
 *
 * Below this it is a kerb, a ledge or a ramp lip — things the wheel climbs, and
 * things `curbAhead` and the hop already answer. A brain that swerved around
 * every kerb would refuse to ride the kerb run, which is a beat.
 */
const BLOCKER_MIN_HEIGHT = 0.35;
/** How far outside the corridor a blocker still matters, metres. */
const BLOCKER_MARGIN = 5;
/** Roughly how large a piece a solid is chopped into before projecting, metres. */
const PIECE_METRES = 1.5;
/** The most pieces a solid is chopped into on one axis. A building is not a wall. */
const PIECE_MAX = 8;

/**
 * Everything on the line worth avoiding, in the line's own coordinates.
 *
 * Run once per world at `Game.installLevel`, never in the step. The hazards
 * come from `plan.hazards` and the solid geometry from the segments' own
 * colliders and `plan.solids` — the two arrays `simulation/planSampler.ts`
 * reads and cannot tell apart, which is the correct reading: a wall is a wall.
 *
 * **`plan.softBodies` is deliberately absent.** A shrub is pass-through by
 * construction (M15) and a cop who steered around bushes would be a cop who
 * cannot be lured into one — which is half of what the escaping player has
 * (§13 q28).
 */
function routeBlockers(
  spine: RouteSpine,
  plan: LevelPlan,
  ground: TerrainSampler,
): RouteBlocker[] {
  const out: RouteBlocker[] = [];
  const located = createSpineLocation();
  const at = createSpineSample();
  const under = createGroundSample();

  /**
   * How high the road is where the line passes `distance`.
   *
   * **Sampled at the *line*, never at the box**, and the difference is the
   * whole point. The sampler resolves a collider by its top face, so asking it
   * about the railing's own footprint answers with the top of the railing and
   * every railing in the game becomes invisible. Asking it about the road
   * beside one answers with the deck, which is what the rider is standing on
   * and what a thing's height has to be measured against.
   */
  const roadHeightAt = (distance: number): number => {
    spine.sample(distance, at);
    ground.sampleGround(at.x, at.z, under);
    return under.height;
  };

  /**
   * Where a world point sits on the line: how far along, and how far across.
   *
   * **The along-line component is added back, and that is not a refinement.**
   * `locate` clamps to the ends of the line, so everything behind the start
   * projects onto distance zero — and its across-the-line offset is then
   * measured in a frame it is nowhere near, which smears a building standing
   * *behind* the spawn into a band right across the road in front of it. One
   * pinned seed sat at the start line for four minutes waiting for a gap in it.
   * Adding the forward component gives a signed distance that is negative
   * behind the start and past the length beyond the end, and both are then
   * simply not on the route.
   */
  const lateralOf = (x: number, z: number, near: number): { distance: number; lateral: number } => {
    spine.locate(x, z, near, located);
    spine.sample(located.distance, at);
    const dx = x - at.x;
    const dz = z - at.z;
    const cos = Math.cos(at.headingY);
    const sin = Math.sin(at.headingY);
    return {
      distance: located.distance + (dx * sin + dz * cos),
      lateral: dx * cos - dz * sin,
    };
  };

  for (const hazard of plan.hazards ?? []) {
    const { distance, lateral } = lateralOf(hazard.centre.x, hazard.centre.z, -1);
    if (distance < -hazard.radius || distance > spine.length + hazard.radius) continue;
    out.push({
      from: distance - hazard.radius,
      to: distance + hazard.radius,
      left: lateral + hazard.radius,
      right: lateral - hazard.radius,
      // A deep pothole is the wipeout (`level/plan.ts`); a spill and a shallow
      // hole cost a wobble a cop rides out like anybody else, so they are worth
      // a swerve and never worth braking for.
      safeSpeed: hazard.kind === 'potholeDeep' ? EUC.hazardCrashSpeed * 0.7 : Infinity,
    });
  }

  const solids: BoxCollider[] = [
    ...plan.segments.flatMap((segment) => segment.colliders),
    ...(plan.solids ?? []),
  ];

  for (const box of solids) {
    // The cheap rejection first: a route carries hundreds of these and almost
    // all of them are dressing well off the road. One projection each.
    const circum = Math.hypot(box.halfExtents.x, box.halfExtents.z);
    const centre = lateralOf(box.centre.x, box.centre.z, -1);
    if (centre.distance < -circum || centre.distance > spine.length + circum) continue;
    spine.sample(centre.distance, at);
    const halfWidthHere = at.halfWidth;
    if (Math.abs(centre.lateral) > halfWidthHere + circum + BLOCKER_MARGIN) continue;
    // Low enough to ride over or hop — a kerb, a ledge, a ramp lip, or the deck
    // of the ford, which is a two-metre-wide box whose top face *is* the road.
    // Measured against the road under the line rather than against the line's
    // own interpolated height: the line runs straight between two sockets and
    // the ford's deck is flat, so on the approach the two disagree by enough to
    // make the road the rider crosses read as a wall across it. Two of the
    // pinned seeds stopped dead at the water's edge on exactly that.
    if (box.centre.y + box.halfExtents.y - roadHeightAt(centre.distance) < BLOCKER_MIN_HEIGHT) {
      continue;
    }

    // **Then in pieces, and the subdivision is the whole correctness of this
    // function.** Distance-along and offset-across are curvilinear coordinates,
    // and a shape large compared with the bend it sits on distorts wildly in
    // them: a fourteen-metre wall on the outside of a corner has corners that
    // project ten metres apart across the road, so its bounding band covers the
    // entire corridor and the cop brakes to a stop in front of an open bend.
    // That is exactly what two of the pinned seeds did. Chopped into pieces
    // roughly a wheel's length across, every piece is small compared with the
    // curve and its band is where it actually is.
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    const alongX = Math.min(PIECE_MAX, Math.max(1, Math.ceil(box.halfExtents.x / PIECE_METRES)));
    const alongZ = Math.min(PIECE_MAX, Math.max(1, Math.ceil(box.halfExtents.z / PIECE_METRES)));
    const halfX = box.halfExtents.x / alongX;
    const halfZ = box.halfExtents.z / alongZ;
    const radius = Math.hypot(halfX, halfZ);

    for (let i = 0; i < alongX; i += 1) {
      for (let j = 0; j < alongZ; j += 1) {
        const ox = -box.halfExtents.x + (2 * i + 1) * halfX;
        const oz = -box.halfExtents.z + (2 * j + 1) * halfZ;
        const piece = lateralOf(
          box.centre.x + ox * cos + oz * sin,
          box.centre.z - ox * sin + oz * cos,
          centre.distance,
        );
        // Off either end of the line is not on the route at all.
        if (piece.distance < -radius || piece.distance > spine.length + radius) continue;
        spine.sample(piece.distance, at);
        // Per piece, so the half of a building that faces the road is a blocker
        // and the half behind it is not.
        if (Math.abs(piece.lateral) > at.halfWidth + radius + BLOCKER_MARGIN) continue;
        if (box.centre.y + box.halfExtents.y - roadHeightAt(piece.distance)
          < BLOCKER_MIN_HEIGHT) continue;
        out.push({
          from: piece.distance - radius,
          to: piece.distance + radius,
          left: piece.lateral + radius,
          right: piece.lateral - radius,
          safeSpeed: 0,
        });
      }
    }
  }

  out.sort((a, b) => a.from - b.from);
  return out;
}
