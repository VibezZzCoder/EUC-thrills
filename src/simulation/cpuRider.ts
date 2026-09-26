/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { StreetLoops } from './streetLoops.ts';
import { CHASE, EUC, PADDLE, PHYSICS } from '../data/tuning.ts';
import type { ActionSnapshot } from '../input/actions.ts';
import type { LevelPlan } from '../level/plan.ts';
import { lateralCeilingG, type LateralCeilingTuning } from './lateralCeiling.ts';
import type { SwingSide } from './paddle.ts';
import { NavPlanner, navBesideWall, navFree, navLineClear, type NavGrid } from './navGrid.ts';
import { BLOCKER_MARGIN, buildRouteField, type RouteBlocker, type RouteField } from './routeField.ts';
import {
  createSpineLocation,
  createSpineSample,
  type RouteSpine,
  type SpineLocation,
  type SpineSample,
} from './routeSpine.ts';
import type { TerrainSampler } from './world.ts';

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
  /**
   * Who this is — the outlaw's index in the room (M39 Part P, §39.6b.3b).
   *
   * A change of id between steps resets every memory the brain keeps about
   * *the* quarry: where he was found on the line, where he was last step, the
   * last range, the orbit detector and the flank. Everything the brain
   * derives from consecutive quarry positions — the closing speed that leads
   * a head-on swing above all — would otherwise be measured across two
   * different riders (§21.8's finding: a per-step nearest pick thrashed
   * `lastQuarryRange`, and a thrashed range reads as a head-on pass). Absent
   * means "the same quarry always", which is every caller before Part P.
   */
  readonly id?: number;
}

/**
 * The pack's per-step input — M39 Part P, §39.6b.3 "Not stacking".
 *
 * **Two rules, both in the brain's own vocabulary, so no steering law is
 * written for a pack.** The composition root builds this each step (from
 * `copPack.packmateBands` and `copPack.followLine`) and the brain never learns
 * why: nothing in this file knows which cop is which or what a pack is for.
 */
export interface CpuPackInput {
  /**
   * The other standing cops as moving blockers, in this brain's canonical
   * frame (seam-shifted by the builder on a closed spine). Filed into the
   * nearest-blocking search, the gate's conflict set and the course test
   * alongside the field's blockers, so the gap search and the swerve law
   * spread the pack across the corridor the way they spread round a bollard
   * row. A second, separately scanned list (two entries at most): the field's
   * list is sorted and its scans break early.
   */
  readonly bands: readonly RouteBlocker[];
  /**
   * The lateral line to follow instead of the quarry's, metres left of the
   * spine; `null` copies the quarry's line as shipped. Applied with or
   * without a quarry (§2c R-4), with the range blend of the quarry's line.
   */
  readonly followLine: number | null;
  /**
   * The other standing cops where they are, world x/z (the brutal pass).
   * Read by the close-quarters search alone: a packmate nearer the quarry
   * makes the ground round him and his way in cost more, so this cop comes
   * round the other side of the block rather than queueing behind him.
   * Absent or empty: no packmates to weigh.
   */
  readonly mates?: readonly { readonly x: number; readonly z: number }[];
}

export type { RouteBlocker } from './routeField.ts';

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

/**
 * Which rule decided the speed the brain asked for on its last step.
 *
 * A diagnostic, read by the bench and the suite and by nothing in the game:
 * the cop's pace is the minimum over a dozen caps and, measured over a route,
 * the one that binds is not the one the eye expects. `none` is the cutout
 * ceiling alone — flat out.
 */
export type CapReason =
  | 'none' | 'corner' | 'blocker' | 'endAround' | 'routeEnd' | 'standOff'
  | 'strayed' | 'detour' | 'flank' | 'swerve' | 'nextGate' | 'uTurn'
  // A packmate's band decided it (M39 Part P, §39.6b.3): the gate he is
  // threading is another cop's, or the pace through it is. Never below
  // `TURN_TO_FACE_SPEED` — a packmate may shape the line, never park him.
  | 'packmate'
  // The close-quarters search decided it (the brutal pass): a corner of the
  // path round what stands between them, or the pass through a strike.
  | 'nav' | 'attack';

/**
 * The ride-tuning fields the cop's *wheel* takes on top of the player's —
 * spread after the shared record wherever his `EucController` is built or
 * retuned (`Game.installChaseWorld`, `Game.applyTuning`, and every harness that
 * rides him), so the wheel under him cuts out where this brain believes it does.
 *
 * One field since the owner tightened the player's cutout on 2026-09-22:
 * `CHASE.copCutoutSpeedShare` keeps his edge — and with it his top speed —
 * where it was. Everything else about his ride is still the player's.
 */
export const COP_WHEEL_TUNING: Readonly<{ cutoutSpeedShare: number }> = Object.freeze({
  cutoutSpeedShare: CHASE.copCutoutSpeedShare,
});

/** The pack input's "no packmates": one frozen empty list, so no step allocates. */
const NO_BANDS: readonly RouteBlocker[] = Object.freeze([]);


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
  /** Full-throttle forward acceleration used by the shared live ride, m/s². */
  driveAcceleration: number = EUC.leanToAccel * Math.sin(EUC.maxLeanPitch);
  /**
   * Full-brake deceleration used by the shared live ride, m/s² — the same
   * shape as the drive term above, and derived the same way: `brakeAuthority`
   * is per unit of `sin(lean)` and the wheel's brake lean is capped by
   * `maxLeanPitch`, so the belief is their product. `Game.applyTuning` pushes
   * that product from the live table, so F4's *Force lean* moves the brain's
   * braking exactly as it moves the wheel's brake. (Codex's M31 QA: the first
   * cut of the chase pass took the sine from the frozen table, and at a lean
   * of 0.25 rad the brain believed 1.94× the deceleration the wheel had.)
   *
   * The M18 law read `brakeAuthority` raw — 22 m/s² against a measured 7.3
   * from 13 m/s and 11.1 from 22 — and M30 Phase 2's QA measured the
   * correction and left it for a chase pass, because an honest model brakes
   * about 1.7 m earlier into everything with a face and took M18 §4.2's wall
   * camp with it. The chase pass (§31, q124) applied it and made the flank
   * robust to it.
   */
  brakeDeceleration: number = EUC.brakeAuthority * Math.sin(EUC.maxLeanPitch);
  /** Quadratic drag used by the shared live ride, 1/m. */
  dragCoefficient: number = EUC.dragCoefficient;
  /**
   * His wheel's cutout threshold as a share of derived top speed.
   *
   * `CHASE.copCutoutSpeedShare`, not the player's `EUC.cutoutSpeedShare`,
   * since the owner tightened the player's edge on 2026-09-22: the cop's
   * ceiling is pinned where it was, and `Game.applyTuning` hands his
   * controller the same share so the wheel under him agrees with this belief.
   */
  cutoutSpeedShare: number = CHASE.copCutoutSpeedShare;
  /**
   * **The give's schedule, pushed rather than imported** — M30 Phase 2's QA
   * repair.
   *
   * Phase 2 shipped this brain reading the module-level frozen `EUC` for the
   * lateral ceiling, so F4's *Grip at speed* and *Grip rise shape* reached his
   * wheel (through `Game.applyTuning`'s `controllerTuning`) and not his belief
   * about a corner: dragged to the slider's floor — the setting documented as
   * "today's ride exactly", the A/B the owner is asked to ride — he believed a
   * 90 m bend held 18 % more speed than it did, and dragged to 1.6 he was 21 %
   * too slow. The rule was already written three lines above this field's
   * writer: *push them instead of importing today's frozen defaults in the
   * brain*.
   *
   * The whole record travels rather than Phase 2's three new constants alone,
   * because `lateralCeilingG` reads five and two of the other four
   * (`maxLateralG`, `carveSpeed`) are F4 sliders of their own; a partial push
   * would leave a smaller copy of the same defect. `carveGripFullSpeed` is not
   * on the panel and arrives as the default, exactly as the controller's does.
   */
  lateralCeiling: LateralCeilingTuning = EUC;
  /**
   * How close to the wheel's cutout speed the cop will ride, as a share of it
   * — M20.
   *
   * **The max-speed cutout applies to him too, and it has to**: the cop rides
   * the player's ride with the player's tuning and gets no private physics path
   * (AGENTS.md, the M18 section). But a pursuit that ends because the pursuer
   * fell off a straight is not a pursuit, and the shipped brain held throttle
   * to infinity whenever nothing was clamping it — which after M20 means he
   * reached the edge and wiped out on the long straights of two pinned seeds.
   *
   * So this is the same kind of decision as braking for a corner or swerving
   * around a pothole: **a `CHASE.*` number the brain reasons with**, not a rule
   * the machine treats him differently under. A rider who is good enough to
   * take the spine's own line is good enough not to ride into a known cutout.
   *
   * Deliberately *not* coupled to `skill` yet, though the coupling is obvious
   * and would be a good higher difficulty tier — an aggressive cop who
   * occasionally cuts out is close to what a player asked for in §5's tiers
   * entry. That is a design change and the owner's to open.
   */
  cutoutMarginShare: number = CHASE.cutoutMarginShare;
  corneringMargin: number = CHASE.corneringMargin;
  hazardClearanceMetres: number = CHASE.hazardClearanceMetres;
  hazardSwerveShare: number = CHASE.hazardSwerveShare;
  brakeSafety: number = CHASE.brakeSafety;
  skillWanderMetres: number = CHASE.skillWanderMetres;
  skillWanderPerHundredMetres: number = CHASE.skillWanderPerHundredMetres;
  skillBrakeLateness: number = CHASE.skillBrakeLateness;
  hopCurbHeight: number = CHASE.hopCurbHeight;
  hopMaxCurbHeight: number = CHASE.hopMaxCurbHeight;
  swingRangeMetres: number = CHASE.swingRangeMetres;
  swingConeRadians: number = CHASE.swingConeRadians;
  swingCooldownSeconds: number = CHASE.swingCooldownSeconds;
  /** Side of the paddle arc chosen with the current swing request. */
  swingSide: SwingSide = 'right';
  /** The shared paddle geometry/timing needed to lead a closing swing. */
  paddleReachMetres: number = PADDLE.reach;
  paddleWindupSeconds: number = PADDLE.windupSeconds;
  paddleActiveSeconds: number = PADDLE.activeSeconds;
  pursuitLateralFollow: number = CHASE.pursuitLateralFollow;
  pursuitNearMetres: number = CHASE.pursuitNearMetres;
  pursuitFarMetres: number = CHASE.pursuitFarMetres;
  hotCorneringMargin: number = CHASE.hotCorneringMargin;
  fieldRangeMetres: number = CHASE.fieldRangeMetres;
  navRangeMetres: number = CHASE.navRangeMetres;
  navSlowQuarrySpeed: number = CHASE.navSlowQuarrySpeed;
  attackPassSpeed: number = CHASE.attackPassSpeed;
  attackOffsetMetres: number = CHASE.attackOffsetMetres;

  private readonly spine: RouteSpine;
  private readonly streets: StreetLoops;
  /**
   * The route field — the canonical line's blockers and the street loops'
   * rings — shared read-only with every other brain in the world (M39 Part P,
   * `simulation/routeField.ts`). The brain keeps only cursors into it.
   */
  private readonly field: RouteField;
  private readonly blockers: readonly RouteBlocker[];
  /**
   * Each street loop's own road and what stands on it, in its own line's
   * coordinates — for the street aim, which rides roads the canonical line
   * does not carry (M39: the town ring's seam, a block's alternate arm).
   */
  private readonly streetFields: RouteField['streetFields'];
  /** The town ring's length, metres — the loop with no alternate; 0 without one. */
  private readonly townRingLength: number;
  /** The world's navigation grid (the shared field's), or null for a field built without one. */
  private readonly navGrid: NavGrid | null;
  /** This brain's search over it, made on first use (a scripted outlaw never pays for one). */
  private navPlanner: NavPlanner | null = null;
  /** Whether the close-quarters search has the wheel. Hysteretic; see `navigate`. */
  private navEngaged = false;
  /** Whether the last search found a path, and which of its corners he is riding at. */
  private navHasPath = false;
  private navNext = 1;
  /** Seconds to the next search, and where the last one was aimed. */
  private navReplanIn = 0;
  private navGoalX = Number.NaN;
  private navGoalZ = Number.NaN;
  /** Which side of a standing quarry the strike pass goes by: +1 his left of the line in, −1 his right. */
  private attackSide: 1 | -1 = 1;
  /** Scratch for the packmates the search steers round. */
  private readonly repelX = new Float64Array(NAV_MAX_REPEL);
  private readonly repelZ = new Float64Array(NAV_MAX_REPEL);
  /** This step's navigation answer, read by `step`. */
  private readonly navOut = {
    aimX: 0,
    aimZ: 0,
    cap: Infinity,
    reason: 'nav' as CapReason,
    remaining: Infinity,
    attack: false,
  };
  private readonly streetHere: SpineLocation = createSpineLocation();
  private readonly streetThere: SpineLocation = createSpineLocation();
  private readonly streetAt: SpineSample = createSpineSample();
  /** `streetFieldFor`'s answer, reused between steps. */
  private readonly streetRide = {
    field: null as RouteField['streetFields'][number] | null,
    here: 0,
    direction: 1 as 1 | -1,
    lateral: 0,
  };

  /** Where the brain believes it is on the line. Windowed, so it cannot jump. */
  private cursor = 0;
  /** His signed lateral on the line at the last step or placement, metres left. */
  private selfLateralValue = 0;
  /** The last non-null quarry's id; a change resets the quarry memory. */
  private lastQuarryId: number | undefined = undefined;
  /** This step's packmate bands; empty without a pack. Set per step, never kept. */
  private packBands: readonly RouteBlocker[] = NO_BANDS;
  /** Which way along the route the quarry currently is: +1 toward the end. */
  private pursuitDirection: 1 | -1 = 1;
  /** Whether the chase has left the road for the grass. Hysteretic; see step. */
  private fieldPursuit = false;
  /** Previous heading, for the turn rate the damping term needs. */
  private lastHeading = 0;
  private hasHeading = false;
  private swingCooldown = 0;
  /** Last straight-line quarry range, for deterministic observed closure. */
  private lastQuarryRange = Infinity;
  /** How long the wheel has been going nowhere while asking to. */
  private stuckSeconds = 0;
  /**
   * Whether he is working his way *around* something rather than chasing.
   *
   * The first field report against the mode (FEEDBACK-TRIAGE §4.2): a player
   * can stand behind a wall and the cop parks against the face, riding side to
   * side until the clock runs out — the stuck escape below backed him out and
   * then recommitted straight at the quarry, an infinite ram with no memory
   * that the last five rams failed. The flank is that memory. It begins when a
   * stuck escape completes with a quarry in hand, and while it is on the cop
   * rides *at the rider* the way a field pursuit does — the spine's line and
   * its blockers are what walled him in, and a wall that spans the corridor
   * has no gap the corridor-clamped search can ever find. It ends when the
   * quarry abandons the spot (they broke cover; chase them normally) or stops
   * existing (crash, bust, escape). Reaching them needs no explicit exit: the
   * hold, the swing and contact resolve it physically.
   */
  private flanking = false;
  /** Where the quarry stood when the flank began. Them leaving it ends it. */
  private flankQuarryX = 0;
  private flankQuarryZ = 0;
  /** Metres of travel left in the current sideways detour. Zero: aim direct. */
  private detourRemaining = 0;
  /** The direction the current detour slides, a world-space unit vector. */
  private detourDirX = 0;
  private detourDirZ = 0;
  /** Which side the next detour tries. Alternates on every failed attempt. */
  private detourSide: 1 | -1 = 1;
  /**
   * The heading he was wedged on, frozen the moment the stuck escape arms.
   *
   * The detour's slide runs perpendicular to *this*, not to the heading at
   * the moment the slide begins — the escape reverses with full steer, and
   * at pivot-first low-speed agility (M16) a second of that rotates the nose
   * anywhere. Slides taken off the rotated heading pointed back into the
   * wall or diagonally away from the chase; the heading with the nose still
   * buried in the face is the one whose perpendicular is the face.
   */
  private wedgeHeading = 0;
  /**
   * How far the next detour commits to, metres. Doubles on every failed
   * attempt, capped — alternate sides with a doubling span walks around any
   * finite obstacle eventually, which is the property a pursuer an adversarial
   * player is deliberately wedging has to have. Deterministic throughout:
   * the same camp produces the same flank on every run, per `advance(n)`.
   */
  private detourSpan = DETOUR_SPAN_BASE_METRES;
  /** How long the flank's direct leg has run freely, seconds. See below. */
  private flankFreeSeconds = 0;
  /**
   * The spin-jump escape — M24, the owner's own remedy for the §4.2 wedge.
   *
   * A cop parked nose-into a face with his aim on the far side is the one
   * pose the ladder below could not leave: the end-around wants speed, the
   * flank's slides arc his nose back into the wall, and both restart from a
   * pinned standstill — the 90-second reproduction in `cpuRider.test.ts`
   * never moved at all. The 180° spin jump is the exit: hop, tap, land
   * facing *away*, and ride off with the full forward agility every other
   * part of the brain already knows how to use. `spinTapPending` carries the
   * two-press grammar across steps (the controller reads a rising edge, so
   * the press that launches and the tap that spins must be separate
   * presses); the cooldown keeps a still-wedged cop from pogoing the trick.
   */
  private spinTapPending = false;
  /** Seconds left for the pending tap's flight to begin before it is dropped. */
  private spinTapTimeout = 0;
  private spinEscapeCooldown = 0;
  /**
   * Stuck escapes spent from a stand since the wheel last genuinely rode.
   *
   * The siege detector. The first trigger design read the curb feeler — spin
   * when a tall face is dead ahead — and the measured deadlocks laughed at
   * it: a cop pinned obliquely on a prop, or between two, reads 0.00 on a
   * feeler that probes straight ahead (M17's shallow-angle lesson all over
   * again), and froze forever with the feeler swearing the way was clear.
   * What every deadlock *does* share is the ladder cycling uselessly:
   * stuck → crawl → detour armed → still parked → stuck again, ~2.4 s per
   * lap, nothing moving. So the trigger counts exactly that — detours armed
   * from a stand — and two in a row with no real riding between them is a
   * siege whatever the feeler thinks it sees.
   */
  private stuckDetours = 0;
  /** Where the wedge last armed, so re-arms in the same place count up. */
  private lastWedgeX = Number.NaN;
  private lastWedgeZ = Number.NaN;
  /**
   * Seconds of committed forward riding left after a spin escape lands.
   *
   * The half that turned out to be load-bearing: the about-face puts the wall
   * *behind* him, and the stuck crawl's reverse-and-steer — correct with a
   * nose on a face — backs a spun cop straight into the wall he just escaped.
   * The first build did exactly that, a pirouette show at 0 m/s forever.
   * Landing a spin therefore commits to riding straight ahead for a beat,
   * which restores the speed every other escape (the detour, the flank, the
   * end-around) was designed to work from.
   */
  private spinRideOutSeconds = 0;
  /**
   * Seconds of close pursuit of a standing quarry without the range improving
   * — the orbit detector, the chase pass.
   *
   * Honest braking (q124) ended the approach that used to *wedge* him on
   * §4.2's wall: he arrives at the end-around with speed to spare and circles
   * its aim point at walking pace, never slow enough to read as stuck and
   * never nearer the rider. M24's lesson generalised — measure the outcome of
   * trying, not the wall — so a few seconds with no new closest range arms
   * the same flank a wedge does.
   */
  private noProgressSeconds = 0;
  private bestRecentRange = Infinity;
  /**
   * A crash mid-flank ends that leg — the chase pass. The controller stands
   * him up a few metres back from where he went down, and a leg that kept its
   * metres would send him straight back into the same fence; the next leg is
   * the other way, exactly as a failed ram flips the walk.
   */
  private flankCrashed = false;
  /** Diagnostics: the rule that decided the last step's speed, and the speed. */
  private capReasonValue: CapReason = 'none';
  private capSpeedValue = Infinity;
  /** Diagnostics: the lateral line the last step chose, in the line's own frame. */
  private lastOffset = 0;
  private lastAimX = 0;
  private lastAimZ = 0;

  // Scratch. One brain steps 120 times a second and every one of these would
  // otherwise be garbage.
  private readonly location: SpineLocation = createSpineLocation();
  private readonly aim: SpineSample = createSpineSample();
  private readonly curveA: SpineSample = createSpineSample();
  private readonly curveB: SpineSample = createSpineSample();
  /** Scratch for the course prediction; nothing else writes it. */
  private readonly courseAt: SpineSample = createSpineSample();
  private readonly quarryAt: SpineLocation = createSpineLocation();
  /** Scratch for `acrossSeam`. */
  private readonly seamAt: SpineLocation = createSpineLocation();
  /**
   * Where the quarry was last found along the line, metres; negative for
   * never. The quarry is located *windowed* around this, the way the cop's
   * own cursor is — Codex's M31 QA. A global search cannot tell two lanes of
   * a divided road apart (`sweep-39` runs a hundred metres of route beside a
   * later hundred, 2.5 m over, the same way, a wall between), so a rider on
   * one lane read as 335 m away on the other and the cop turned to chase the
   * reading. A window tracks the rider along the lane they are on; a rider
   * who resets across the map is absurdly far from the window's answer and
   * is found again globally, on the cursor's own rule.
   */
  private quarryCursor = -1;
  /** Where the quarry was on the previous step, for the facing its motion gives. */
  private quarryLastX = Number.NaN;
  private quarryLastZ = Number.NaN;
  private readonly probeAt: SpineLocation = createSpineLocation();
  /** Scratch for the side probe's reaches. Reused; never grows past the cap. */
  private readonly sideProbe: number[] = [];
  /** Blockers close enough to matter this step. Reused; never grows unbounded. */
  private readonly conflicts: RouteBlocker[] = [];
  /** Blocked lateral bands at the gate, as flat low/high pairs. Reused. */
  private readonly gaps: number[] = [];
  private readonly actions = {
    throttle: 0,
    steer: 0,
    crouch: false,
    hop: false,
    // Presentation intent only (`ActionSnapshot.hopHeld`, M36 §36.5). The cop
    // never poses, and this stays false for the life of the brain.
    hopHeld: false,
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
   * (invariant 3), and the projection that builds the route field needs that
   * to tell a bridge deck — which the rider rides *on* — from the railing
   * beside it. Keeping it out of the step is what keeps the brain sensing what
   * a rider senses rather than querying the world 120 times a second.
   *
   * **`field` is the world's shared route field** (M39 Part P, §39.6b.4
   * "Field construction"): built once by `buildRouteField` and handed to every
   * brain, so a pack of three projects the world once rather than three
   * times. Absent, the brain builds its own — the same pure builder on the
   * same inputs, so a lone cop is byte-identical to the brain that projected
   * the world in its own constructor. A field built on another line is
   * refused outright: its blockers would be distances along a road this brain
   * is not riding.
   */
  constructor(spine: RouteSpine, plan: LevelPlan, ground: TerrainSampler, field?: RouteField) {
    if (field !== undefined && field.spine !== spine) {
      throw new Error('CpuRider: the route field was built on a different spine');
    }
    const shared = field ?? buildRouteField(spine, plan, ground);
    this.spine = spine;
    this.field = shared;
    // The field's own rings, not a second set (§2c R-18): three brains on one
    // field build the town's street rings once, in `buildRouteField`.
    this.streets = new StreetLoops(plan, { rings: shared.streetRings, mainLengths: shared.streetMainLengths });
    this.blockers = shared.blockers;
    this.streetFields = shared.streetFields;
    this.townRingLength = shared.townRingLength;
    this.navGrid = shared.nav ?? null;
  }

  /** The route field this brain reads — the shared one, or the one it built. */
  get routeField(): RouteField {
    return this.field;
  }

  /**
   * His signed lateral on the line, metres left of the spine, as of the last
   * step (or placement) — what `copPack.packmateBands` files him at in the
   * other brains' conflict sets.
   */
  get lineLateral(): number {
    return this.selfLateralValue;
  }

  /** How far along the route the brain believes it is, metres. */
  get routeDistance(): number {
    return this.cursor;
  }

  /**
   * How far along the route the brain last found the quarry, metres, or a
   * negative number before it has seen one. The composition root hands this
   * to the regroup planner so the return is measured from the lane the rider
   * is actually on.
   */
  get quarryDistance(): number {
    return this.quarryCursor;
  }

  /** Which cap decided the last step's speed. Diagnostics and tests. */
  get capReason(): CapReason {
    return this.capReasonValue;
  }

  /** The speed the last step asked the wheel to hold, m/s. Diagnostics and tests. */
  get capSpeed(): number {
    return this.capSpeedValue;
  }

  /** The lateral line the last step chose, metres left of the spine. Diagnostics. */
  get chosenOffset(): number {
    return this.lastOffset;
  }

  /** Where the last step aimed, world space. Diagnostics. */
  get aimPoint(): { x: number; z: number } {
    return { x: this.lastAimX, z: this.lastAimZ };
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
   * How fast a cop may be *stood* at `distance` along the line facing
   * `direction`, m/s — or `null` when the spot itself is inside something the
   * field knows about. The super tracker's landing judge (Codex's M31 QA).
   *
   * A regroup grants position with no approach: `EucController.reset` hands
   * him the rider's pace and a straight wheel, and the first cut of the chase
   * pass judged the spot by its route distance and its straight-line gap
   * alone. Swept over five routes both ways, 89 of 1,997 accepted returns
   * put him into a hazard or a wall within two seconds — a deep hole three
   * metres on, a bollard row met at 22 m/s with no room to brake — and every
   * one of those crashes then bought the rider the respite a *baited* crash
   * is for. So the spot is judged with the brain's own beliefs before the
   * body is moved: everything the field knows on his own line ahead, within
   * his room, bounds his entry speed by the braking law the step uses, and
   * the corner profile ahead bounds it by the grip he corners with. What the
   * field does not know — the surround's trees — a placement on the spine
   * never meets, because the spine is road.
   *
   * At the honest full-skill belief whatever `skill` says, and at the
   * close-pursuit margin: the return is the referee's act, not his riding,
   * and he has no run-up to read the road with.
   */
  landingAllowance(distance: number, direction: 1 | -1): number | null {
    return this.landingAllowanceOn(this.spine, this.blockers, distance, direction);
  }

  /**
   * `landingAllowance` on one street loop's ring rather than the canonical
   * line — the brutal pass: a regroup onto the side street the rider took is
   * judged by what stands on that street (the field's own `streetFields`).
   */
  landingAllowanceOnStreet(ring: number, distance: number, direction: 1 | -1): number | null {
    const street = this.streetFields[ring];
    if (street === undefined) return null;
    return this.landingAllowanceOn(street.ring, street.blockers, distance, direction);
  }

  private landingAllowanceOn(
    spine: RouteSpine,
    blockers: readonly RouteBlocker[],
    distance: number,
    direction: 1 | -1,
  ): number | null {
    const braking = Math.max(1, this.brakeDeceleration);
    const reaction = 1 / this.brakeSafety;
    let allowance = Infinity;
    for (const blocker of blockers) {
      if (blocker.facing !== 0 && blocker.facing !== direction) continue;
      // A wobble is not a landing hazard, and it is never worth braking for.
      if (blocker.safeSpeed === Infinity) continue;
      if (blocker.left < -LANDING_ROOM_METRES || blocker.right > LANDING_ROOM_METRES) continue;
      const ahead = direction > 0 ? blocker.from - distance : distance - blocker.to;
      const past = direction > 0 ? blocker.to - distance : distance - blocker.from;
      if (past < -LANDING_ROOM_METRES) continue;
      if (ahead <= LANDING_ROOM_METRES) return null;
      if (ahead > LANDING_LOOK_METRES) continue;
      allowance = Math.min(allowance, Math.sqrt(
        blocker.safeSpeed * blocker.safeSpeed
          + 2 * braking * (ahead - LANDING_ROOM_METRES) * reaction,
      ));
    }
    const cornerFactor = PHYSICS.gravity * this.corneringMargin;
    for (let ahead = 0; ahead <= LANDING_LOOK_METRES; ahead += CORNER_SCAN_METRES) {
      const curvature = Math.abs(spine.curvature(
        distance + direction * ahead,
        distance + direction * (ahead + CORNER_SCAN_METRES),
        this.curveA,
        this.curveB,
      ));
      if (curvature <= 1e-4) continue;
      const limit = speedAtLateralLimit(1 / Math.sqrt(curvature), cornerFactor, this.lateralCeiling);
      allowance = Math.min(allowance, Math.sqrt(limit * limit + 2 * braking * ahead * reaction));
    }
    return allowance;
  }

  /**
   * Put the brain where the body is, with no history.
   *
   * Called on every teleport the composition root can see — the spawn, a
   * restart, a world swap — for the reason `Paddle.reseed` exists: the cursor
   * is a windowed search around the last answer, so a body that moved a hundred
   * metres between two steps would otherwise search the wrong hundred metres
   * and steer at a road it is no longer on. The search here is global — the
   * only place in the step path one happens — unless the caller knows where
   * it put him: a regroup lands on a route distance the planner chose, and on
   * a folded route a global search from that spot can answer the other arm
   * (Codex's M31 QA: placed at 655 m on `sweep-39`, read as 317 m, turned
   * round into the wall between the lanes). A `near` hint searches its
   * window and falls back to the whole route only if the answer is absurd.
   */
  place(view: CpuView, near = -1): void {
    this.spine.locate(view.x, view.z, near, this.location);
    if (near >= 0 && this.location.offRoute > RELOCATE_METRES) {
      this.spine.locate(view.x, view.z, -1, this.location);
    }
    this.cursor = this.location.distance;
    this.spine.sample(this.cursor, this.curveA);
    this.selfLateralValue = (view.x - this.curveA.x) * Math.cos(this.curveA.headingY)
      - (view.z - this.curveA.z) * Math.sin(this.curveA.headingY);
    this.lastHeading = view.headingY;
    this.hasHeading = true;
    this.swingCooldown = 0;
    this.swingSide = 'right';
    this.lastQuarryRange = Infinity;
    this.stuckSeconds = 0;
    this.pursuitDirection = 1;
    this.fieldPursuit = false;
    this.noProgressSeconds = 0;
    this.bestRecentRange = Infinity;
    this.navEngaged = false;
    this.navHasPath = false;
    this.navReplanIn = 0;
    // **The quarry cursor is kept** (M39 Part P, A-12 narrowed —
    // `docs/M39_CHASE.md` §2c). §39.6b.3b asked `place()` to clear it with
    // the rest of the quarry state, and measured on the folded fixture's
    // divided road that is the M31 lane bug back: a regroup that lands the
    // cop behind a rider hugging the lane divider turns the next quarry
    // locate global, and the global answer is the other lane, 510 m away
    // along the line — the brain then tracked that lane for the rest of the
    // stretch. His own teleport says nothing about where the *rider* is, so
    // the window that was tracking the rider keeps tracking him; what the
    // plan's clearing was for — a new quarry must not inherit the old one's
    // memory — is the quarry id's rule in `step`, which forgets it all on a
    // swap. The range is still forgotten above: his own jump would read as
    // the rider's closing speed.
    this.endFlank();
  }

  /**
   * One fixed step of thinking. Returns the intent for this step.
   *
   * The returned object is reused between steps and is only valid until the
   * next call — the controller reads it immediately and keeps nothing, which is
   * what makes that safe and allocation-free.
   */
  step(dt: number, view: CpuView, quarry: CpuQuarry | null, pack?: CpuPackInput): ActionSnapshot {
    const actions = this.actions;
    this.packBands = pack === undefined ? NO_BANDS : pack.bands;
    const followLine = pack === undefined ? null : pack.followLine;
    actions.throttle = 0;
    actions.steer = 0;
    actions.crouch = false;
    actions.hop = false;
    actions.swing = false;

    this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    this.spinEscapeCooldown = Math.max(0, this.spinEscapeCooldown - dt);

    // A crashed rider is not riding. The controller respawns him on its own
    // timer exactly as it does the player, and thinking through a crash would
    // hand held throttle to the step he stands up on.
    if (view.crashed) {
      this.lastHeading = view.headingY;
      this.stuckSeconds = 0;
      this.lastQuarryRange = Infinity;
      this.spinTapPending = false;
      this.spinRideOutSeconds = 0;
      this.stuckDetours = 0;
      if (this.flanking && this.detourRemaining > 0) {
        this.detourRemaining = 0;
        this.flankCrashed = true;
      }
      return actions;
    }

    if (!this.hasHeading) this.place(view);

    // -- Where am I ----------------------------------------------------------
    const previousCursor = this.cursor;
    this.spine.locate(view.x, view.z, this.cursor, this.location);
    // **A cursor that jumps is asked which way he is facing** (Codex's M31
    // QA). A hairpin's other arm sits inside the window and, when he runs
    // wide at the apex, nearer in plan — the plain answer jumped forty
    // metres along the route, read him as riding the wrong way and turned
    // him into the wall between the arms. Only a jump is adjudicated: the
    // plain nearest point is kept for ordinary riding, because a cursor
    // biased by heading leads the wheel through a corner and drops the
    // bollard level with it as "behind" — the first cut of this applied the
    // facing every step and put three clean seeds down.
    if (Math.abs(this.location.distance - previousCursor) > CURSOR_JUMP_METRES) {
      const facing = this.pursuitDirection > 0 ? view.headingY : view.headingY + Math.PI;
      this.spine.locate(view.x, view.z, previousCursor, this.location, facing);
    }
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
    this.acrossSeam(view.x, view.z, this.location);
    this.cursor = this.location.distance;
    // Which side of the line he is on, signed. `SpineLocation.offRoute` is
    // deliberately unsigned; the gap choice below is the one consumer that
    // needs the side, and it needs it badly — see the hysteresis note there.
    this.spine.sample(this.cursor, this.curveA);
    const selfLateral = (view.x - this.curveA.x) * Math.cos(this.curveA.headingY)
      - (view.z - this.curveA.z) * Math.sin(this.curveA.headingY);
    this.selfLateralValue = selfLateral;

    const skill = clamp(this.skill, 0, 1);
    const lookahead = Math.max(this.lookaheadMinMetres, view.speed * this.lookaheadSeconds);
    let routeGap = Infinity;
    let quarryRange = Infinity;
    let quarrySpeed = 0;
    let quarryClosingSpeed = 0;

    // **A pursuit has a direction; a route follower does not.** The M18 first
    // pass only copied the quarry's lateral line when the quarry happened to be
    // ahead. Once the cop passed them he kept riding toward the route end, which
    // made the player chase the cop. Locate the quarry globally — players can
    // reset, reverse and cross a branch — and turn the route follower around
    // when the quarry is genuinely on the other side of him. The hysteresis is
    // the swing range plus the clearance already used for line choice: inside
    // that band he holds his approach instead of flipping direction every time
    // the two riders trade half a metre.
    // **A different rider is a different quarry** (M39 Part P, §39.6b.3b,
    // §21.8). Every memory below is about *the* quarry — where he was found
    // on the line, where he stood last step, the last range the closing speed
    // is observed from, the orbit detector's best range, the flank's spot —
    // and a swap carried across in them reads the distance between two riders
    // as one rider's motion: a thrashed range is a closing speed of tens of
    // metres a second, and a closing speed leads a head-on swing. So a change
    // of id forgets them, the way a teleport of his own does in `place()`,
    // and the new quarry is found on the whole line rather than in the old
    // one's window. An absent id is the same quarry always.
    if (quarry !== null && quarry.id !== this.lastQuarryId) {
      this.lastQuarryId = quarry.id;
      this.quarryCursor = -1;
      this.quarryLastX = Number.NaN;
      this.quarryLastZ = Number.NaN;
      this.lastQuarryRange = Infinity;
      this.noProgressSeconds = 0;
      this.bestRecentRange = Infinity;
      this.navEngaged = false;
      this.navHasPath = false;
      this.navReplanIn = 0;
      this.endFlank();
    }
    if (quarry !== null) {
      const previousQuarry = this.quarryCursor;
      this.spine.locate(quarry.x, quarry.z, this.quarryCursor, this.quarryAt);
      if (previousQuarry >= 0 && this.quarryAt.offRoute > RELOCATE_METRES) {
        this.spine.locate(quarry.x, quarry.z, -1, this.quarryAt);
      } else if (previousQuarry >= 0
        && Math.abs(this.quarryAt.distance - previousQuarry) > CURSOR_JUMP_METRES
        && dt > 0 && Number.isFinite(this.quarryLastX)) {
        // The quarry's cursor jumped inside its window — a hairpin's other
        // arm, a rider running wide at the apex — and is adjudicated the way
        // the cop's own is, by facing. A quarry states no heading, so its
        // motion is the facing, and only when it is moving: a parked rider
        // has nothing to adjudicate with and nothing to jump for.
        const moveX = quarry.x - this.quarryLastX;
        const moveZ = quarry.z - this.quarryLastZ;
        if (Math.hypot(moveX, moveZ) > QUARRY_FACING_SPEED * dt) {
          this.spine.locate(quarry.x, quarry.z, previousQuarry, this.quarryAt, Math.atan2(moveX, moveZ));
        }
      }
      this.acrossSeam(quarry.x, quarry.z, this.quarryAt);
      this.quarryCursor = this.quarryAt.distance;
      this.quarryLastX = quarry.x;
      this.quarryLastZ = quarry.z;
      routeGap = this.quarryAt.distance - this.cursor;
      // On a closed ring the short way round is the gap (M39 r6 QA): a rider
      // just past the seam is metres ahead, not a lap behind.
      if (this.spine.closed) {
        const whole = this.spine.length;
        if (routeGap > whole / 2) routeGap -= whole;
        else if (routeGap < -whole / 2) routeGap += whole;
      }
      quarryRange = Math.hypot(quarry.x - view.x, quarry.z - view.z);
      quarrySpeed = Math.abs(quarry.speed);
      // Range rate is the one fact a scalar-speed quarry cannot state directly:
      // two riders at 22 m/s may be travelling together or meeting at 44 m/s.
      // Observe it from consecutive deterministic fixed steps, capped by the
      // sum of their physical speeds so a reset/teleport cannot manufacture an
      // enormous one-frame closing rate and throw a swing across the map.
      if (dt > 0 && Number.isFinite(this.lastQuarryRange)) {
        const observed = (this.lastQuarryRange - quarryRange) / dt;
        quarryClosingSpeed = clamp(
          observed,
          0,
          Math.abs(view.speed) + quarrySpeed,
        );
      }
      this.lastQuarryRange = quarryRange;
      const switchGap = this.swingRangeMetres + this.hazardClearanceMetres;
      if (this.pursuitDirection > 0 && routeGap < -switchGap) {
        this.pursuitDirection = -1;
      } else if (this.pursuitDirection < 0 && routeGap > switchGap) {
        this.pursuitDirection = 1;
      }
    } else {
      // The chase probe and Phase 1's solo sweep remain a forward route ride.
      this.pursuitDirection = 1;
      this.lastQuarryRange = Infinity;
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

    // -- The close-quarters search (the brutal pass) -------------------------
    //
    // A quarry near and off the road, or near and barely moving, is found on
    // the navigation grid rather than along the spine: the owner's plaza camp
    // (a rider parked behind the plaza block, a cop running up and down the
    // plaza's middle "like i'm invisible") was a spine pursuit that could not
    // see round the block and a field pursuit that could only ram it. The
    // search replaces both there, and the flank with them — it knows where
    // the block's ends are, so there is nothing to walk along. What it does
    // not know (a wall the plan does not state) the stuck crawl and the spin
    // escape still answer, and the search starts again from wherever they
    // leave him.
    const navigating = quarry !== null
      && this.navigate(dt, view, quarry, quarryRange, quarrySpeed, pack?.mates);
    if (quarry === null) {
      this.navEngaged = false;
      this.navHasPath = false;
    }
    if (navigating) this.endFlank();
    const nav = this.navOut;

    // -- The flank -----------------------------------------------------------
    //
    // Kept and consumed here; *entered* down in the stuck escape, which is the
    // only place that knows a ram failed. The quarry moving well off the spot
    // he was wedged against is the one exit: they broke cover, so the ordinary
    // pursuit — which was never the problem — takes over again.
    if (quarry === null) {
      this.endFlank();
    } else if (this.flanking
      && Math.hypot(quarry.x - this.flankQuarryX, quarry.z - this.flankQuarryZ)
        > FLANK_QUARRY_MOVE_METRES) {
      this.endFlank();
    }
    if (this.detourRemaining > 0) this.detourRemaining -= Math.abs(view.speed) * dt;
    // **A slide ends when the rider is in reach** — the chase pass. The M18
    // note says reaching them needs no explicit exit, and for the direct leg
    // that is true; a *slide* is sideways and carries on past a rider it
    // brushes at four metres. In reach with a clear line, the leg is over and
    // the close pursuit below takes the wheel.
    // Not in the field: out there the blockers are the road's and say nothing
    // about the wall he is actually pressed against, so a "clear" line is no
    // such thing and the walk must run its course, as M24 built it.
    if (this.detourRemaining > 0 && quarry !== null && !this.fieldPursuit
      && quarryRange <= CLOSE_PURSUIT_METRES && Math.abs(routeGap) <= CLOSE_PURSUIT_ROUTE_METRES
      && this.lineClear(view.x, view.z, quarry.x, quarry.z)) {
      this.detourRemaining = 0;
    }
    if (this.flankCrashed) {
      this.flankCrashed = false;
      if (this.flanking && quarry !== null) this.beginDetour(quarry, quarryRange, view, selfLateral);
    }
    // The flank also expires on its own once the direct leg rides freely for
    // a few seconds: he is moving at the rider unobstructed, so whatever he
    // was wedged on is behind him. Without this an armed flank is permanent —
    // it skips the gate that could notice the road sees the way, so nothing
    // else can retire it while the quarry holds still.
    if (this.flanking && this.detourRemaining <= 0
      && Math.abs(view.speed) > STUCK_SPEED * 3) {
      this.flankFreeSeconds += dt;
      if (this.flankFreeSeconds > FLANK_FREE_SECONDS) {
        // Softly: the widening walk's span and side survive, so a re-stick
        // on the same obstacle resumes the walk instead of restarting it.
        this.flanking = false;
        this.flankFreeSeconds = 0;
      }
    } else if (this.flanking) {
      this.flankFreeSeconds = 0;
    }
    const flanking = this.flanking && quarry !== null;
    /** Sliding sideways past the thing he was stuck on, not aiming at anyone. */
    const detouring = flanking && this.detourRemaining > 0;
    /**
     * Riding at the rider rather than along the line. A field pursuit and a
     * flank skip the same road-shaped reasoning for the same reason: the
     * spine's corner profile, its blockers and its corridor describe the road,
     * and neither chase is on it.
     */
    let streetAim = quarry === null ? null : this.streets.aim(view, quarry, lookahead);
    // **A loop street's merge is not the loop street** — M39's town ring,
    // ridden back (`sweep-0`, `sweep-22`, `sweep-39`). `StreetLoops` is meant
    // to take the wheel only where the canonical brain cannot see the answer:
    // a rider on an alternate arm, or the short way round across the seam.
    // It tells an alternate arm by where the nearest point of its ring lies,
    // and where the alley's exit merges into the road's last metres that
    // point is on the alley for a cop riding the road — so a cop heading
    // back past the merge read as *in* the alley, took its reversed stairs
    // and dog-leg as the short way to a rider 150 m behind him on the open
    // road, and rode them blind until a wall put him down, 45 m off the
    // line, over and over from the same respawn. So the brain asks the
    // question the way the stray rule and the regroup already do — against
    // the canonical road (`StreetLoops.onAlternate`) — and with both riders
    // on the canonical road it keeps a street aim only for the seam, the
    // one thing the canonical line cannot answer.
    if (streetAim !== null && quarry !== null
      && !this.streets.onAlternate(view.x, view.z, this.location.offRoute, this.location.halfWidth)
      && !this.streets.onAlternate(quarry.x, quarry.z, this.quarryAt.offRoute, this.quarryAt.halfWidth)
      && !(this.townRingLength > 0 && Math.abs(routeGap) > this.townRingLength / 2)) {
      streetAim = null;
    }
    // The search has the wheel: the streets' aim is a road aim, and he is not
    // riding a road to this quarry.
    if (navigating) streetAim = null;
    const direct = field || flanking || streetAim !== null || navigating;

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
    // **Catching up is not closing in** — the chase pass (`data/tuning.ts`,
    // `pursuitFarMetres`). Far behind, the rider's line is a line for a
    // corner he has not reached; he takes his own. The share fades in with
    // range so there is no edge to weave across.
    const far = quarry === null
      ? 1
      : clamp(
        (quarryRange - this.pursuitNearMetres)
          / Math.max(1e-6, this.pursuitFarMetres - this.pursuitNearMetres),
        0,
        1,
      );
    // **A packmate's line is offset from the rider's, not stacked on it**
    // (M39 Part P, §39.6b.3 "Not stacking"). The composition root hands a cop
    // with a packmate close by the roomier side of him to follow instead; the
    // term and its blend with range are the quarry's own, so no new steering
    // law is written. It applies with or without a quarry (§2c R-4), and
    // with none there is no range to blend by, so it is followed in full.
    if (followLine !== null) {
      offset += clamp(followLine, -this.aim.halfWidth, this.aim.halfWidth)
        * this.pursuitLateralFollow * (1 - (quarry === null ? 0 : far));
    } else if (quarry !== null) {
      this.spine.sample(this.quarryAt.distance, this.curveA);
      const dx = quarry.x - this.curveA.x;
      const dz = quarry.z - this.curveA.z;
      const left = dx * Math.cos(this.curveA.headingY) - dz * Math.sin(this.curveA.headingY);
      offset += clamp(left, -this.aim.halfWidth, this.aim.halfWidth)
        * this.pursuitLateralFollow * (1 - far);
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
    // **Honest, at last** — q124, the chase pass. `brakeDeceleration` is the
    // m/s² the wheel really has (`brakeAuthority · sin(maxLeanPitch)`, pushed
    // live — see the field); the M18 law read the authority raw and believed
    // about twice the deceleration the wheel has (22 m/s² against a measured
    // 7.3 from 13 m/s and 11.1 from 22). The optimism was what put him into
    // `sweep-15`'s deep hole at 11.6 m/s believing 4.6, and it was
    // load-bearing for nothing but §4.2's wall approach, which the flank
    // below now survives on its own terms.
    const braking = Math.max(1, this.brakeDeceleration);
    const lateness = this.skillBrakeLateness + (1 - this.skillBrakeLateness) * skill;
    const reaction = Math.max(0.05, 1 / (Math.max(0.05, lateness) * this.brakeSafety));
    /** The same belief as a plain multiplier: 1 at full skill, optimistic below. */
    const optimism = reaction * this.brakeSafety;
    const stopping = (view.speed * view.speed) / (2 * braking);
    const horizon = Math.max(30, lookahead + stopping + 10);

    let cap = Infinity;
    let capReason: CapReason = 'none';
    /** Lower the cap to `value` if it binds, and remember which rule did. */
    const bind = (value: number, reason: CapReason): number => {
      if (value < cap) {
        capReason = reason;
        return value;
      }
      return cap;
    };
    /** Speed here that still allows `limit` at `distance` metres ahead. */
    const allow = (limit: number, distance: number): number => (
      Math.sqrt(Math.max(0, limit * limit + 2 * braking * Math.max(0, distance) * reaction))
    );

    // **The grip he has, separated from the speed he happens to be doing**
    // (M30 Phase 2). `view.lateralLimitG` is the schedule's value at his
    // *current* speed times the surface's grip, and from M30 the schedule rises
    // with speed (`simulation/lateralCeiling.ts`) — so dividing it by the
    // schedule at that same speed recovers the grip alone, and the brain still
    // never has to learn what a surface is. A flat schedule (`carveGripTopG`
    // dragged to `maxLateralG` on F4) makes this ratio exactly today's
    // arithmetic again.
    const gripFactor = Math.max(0.1, view.lateralLimitG)
      / Math.max(1e-6, lateralCeilingG(view.speed, this.lateralCeiling));
    /** Everything but the ceiling itself: gravity, the margin, and his skill. */
    // The margin he keeps under the grip limit: the close-pursuit one near
    // the rider, the hot one far behind (the chase pass), and a route ride
    // with nobody to chase is far by definition — the kill gate rides hot.
    const margin = this.corneringMargin + (this.hotCorneringMargin - this.corneringMargin) * far;
    const cornerFactor = PHYSICS.gravity
      * gripFactor
      * margin
      // A poor cop also corners wider, which reads as him running out of road
      // rather than as him being underpowered.
      * (0.7 + 0.3 * skill);
    // The corner profile. Sampled along the horizon rather than read at the
    // lookahead, because the corner that decides a cop's speed is the one he is
    // about to arrive at, not the one he is in.
    if (!direct) {
      for (let ahead = 0; ahead <= horizon; ahead += CORNER_SCAN_METRES) {
        const curvature = Math.abs(this.spine.curvature(
          this.cursor + direction * ahead,
          this.cursor + direction * (ahead + CORNER_SCAN_METRES),
          this.curveA,
          this.curveB,
        ));
        if (curvature <= 1e-4) continue;
        cap = bind(allow(
          speedAtLateralLimit(1 / Math.sqrt(curvature), cornerFactor, this.lateralCeiling),
          ahead,
        ), 'corner');
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
    /**
     * The swerve law: the fastest he may be now and still move `sideways`
     * metres across before `distance` metres of road run out, braking as he
     * goes. The seconds the move needs are read at the lateral the corner
     * solver would grant — once, at the speed he is doing, which for a lane
     * change ahead of a gate is the safe side (`k = 1`, the solver's fixed
     * point in lateral units) — and spread along the approach the way the
     * corner profile is (see the cap below, which is its first consumer).
     */
    const swerveSpeed = (sideways: number, distance: number): number => {
      const lateral = Math.max(0.5, speedAtLateralLimit(1, cornerFactor, this.lateralCeiling) ** 2);
      const seconds = Math.sqrt((2 * sideways) / lateral) / Math.max(0.05, optimism);
      const brakeIn = braking * reaction;
      const turnIn = brakeIn * seconds * seconds;
      const atLine = (distance / seconds) ** 2;
      const spread = turnIn < distance
        ? 2 * brakeIn * distance - brakeIn * brakeIn * seconds * seconds
        : atLine;
      return Math.sqrt(Math.max(0, Math.min(atLine, spread)));
    };
    // How far up the line a blocker is looked for. Floored, and the floor is
    // the chase pass's: a window of lookahead plus stopping distance is seven
    // metres at 9 m/s, so a cop easing out of one gate met the next — a post
    // in a plaza, eleven metres on — with his aim just snapped back to the
    // centreline and his lateral momentum pointing the wrong way. A rider
    // sees the plaza; the brain now sees `GATE_LOOK_METRES` of it whatever
    // his speed.
    const near = Math.max(MIN_AIM_METRES, lookahead + stopping, GATE_LOOK_METRES);

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
    // **Where his present course is taking him, not only where he is** — M39's
    // town ring (`sweep-39`). The band above is where he is and where he wants
    // to be, and both are points: out of an S-bend at pace the wheel's yaw
    // builds for most of a second, and he crossed his own line at 14 m/s with
    // a quarter of a metre of sideways travel for every metre of road. The
    // deep hole on the outside of the riverside's left-hander was two metres
    // clear of both points and dead on his course; it entered the band eight
    // metres out, which is no distance to shed nine metres a second in. So the
    // course is carried forward as the arc he is actually on — his heading
    // and his measured turn rate, the controller's facts rather than the
    // line's — and a thing that would put him down at the pace he is doing is
    // in the way when that arc meets it.
    const courseTurnRate = dt > 0 ? wrapAngle(view.headingY - this.lastHeading) / dt : 0;
    const courseBend = view.speed > 1 ? clamp(courseTurnRate / view.speed, -COURSE_MAX_BEND, COURSE_MAX_BEND) : 0;
    /** His lateral on the line `ahead` metres on, if he holds his present arc. */
    const courseLateral = (ahead: number): number => {
      if (view.speed <= 1 || ahead <= 0) return selfLateral;
      const heading = view.headingY;
      let x: number;
      let z: number;
      if (Math.abs(courseBend * ahead) < 1e-4) {
        x = view.x + Math.sin(heading) * ahead;
        z = view.z + Math.cos(heading) * ahead;
      } else {
        x = view.x + (Math.cos(heading) - Math.cos(heading + courseBend * ahead)) / courseBend;
        z = view.z + (Math.sin(heading + courseBend * ahead) - Math.sin(heading)) / courseBend;
      }
      this.spine.sample(this.cursor + direction * ahead, this.courseAt);
      return (x - this.courseAt.x) * Math.cos(this.courseAt.headingY)
        - (z - this.courseAt.z) * Math.sin(this.courseAt.headingY);
    };
    /** Whether his course meets `blocker`, which would put him down at this pace. */
    const onCourse = (blocker: RouteBlocker): boolean => {
      if (blocker.safeSpeed >= view.speed) return false;
      const ahead = direction > 0 ? blocker.from - this.cursor : this.cursor - blocker.to;
      const course = courseLateral(Math.max(0, ahead));
      return course > blocker.right - TIGHT_ROOM && course < blocker.left + TIGHT_ROOM;
    };
    /** The chosen line rounds the conflict set's end, outside the corridor. */
    let endAround = false;
    let blocking: RouteBlocker | null = null;
    if (direct) {
      // Nothing on the line is in the way of a chase that has left it.
    } else if (direction > 0) {
      for (const blocker of this.blockers) {
        if (blocker.to < this.cursor + BEHIND_MARGIN) continue;
        if (blocker.from > this.cursor + near) break;
        if (blocker.facing === -1) continue;
        if ((blocker.right - room > lineHigh || blocker.left + room < lineLow) && !onCourse(blocker)) continue;
        blocking = blocker;
        break;
      }
    } else {
      for (let index = this.blockers.length - 1; index >= 0; index -= 1) {
        const blocker = this.blockers[index];
        if (blocker.from > this.cursor - BEHIND_MARGIN) continue;
        if (blocker.to < this.cursor - near) break;
        if (blocker.facing === 1) continue;
        if ((blocker.right - room > lineHigh || blocker.left + room < lineLow) && !onCourse(blocker)) continue;
        blocking = blocker;
        break;
      }
    }
    // **A packmate is a moving blocker** (M39 Part P, §39.6b.3 "Not
    // stacking"). The other cops arrive as bands in the field's own
    // vocabulary and are asked the field's own questions — in the window, on
    // his line or his course — so the gap search and the swerve law below
    // spread the pack across the road the way they spread round a bollard
    // row. Scanned apart from the field (two entries at most) because the
    // field's list is sorted and its scans break early; the nearer face wins.
    const bands = this.packBands;
    if (!direct) {
      for (const band of bands) {
        const ahead = direction > 0 ? band.from - this.cursor : this.cursor - band.to;
        const past = direction > 0 ? band.to - this.cursor : this.cursor - band.from;
        if (past < BEHIND_MARGIN || ahead > near) continue;
        // **A packmate he is not gaining on is not in his way.** A band's
        // `safeSpeed` is the packmate's own pace, and the field's meaning of
        // it — how fast the thing may be met — makes one riding at his pace
        // or faster a thing he never meets: the course test already reads it
        // so. Filed as a standing post instead, the band had a cop swerve
        // round a packmate pulling away from him and drop more than ten metres
        // behind him inside five seconds on every seed of the two-cop fixture
        // (`cpuRider.test.ts`, measured before this line); the echelon is
        // meant to form "without anyone braking for anyone" (§39.6b.3).
        if (band.safeSpeed >= view.speed) continue;
        if (band.facing !== 0 && band.facing !== direction) continue;
        if ((band.right - room > lineHigh || band.left + room < lineLow) && !onCourse(band)) continue;
        if (blocking !== null
          && ahead >= (direction > 0 ? blocking.from - this.cursor : this.cursor - blocking.to)) continue;
        blocking = band;
      }
    }
    /** Whether the gate he is threading is a packmate's rather than the road's. */
    const packmateGate = blocking !== null && bands.length > 0 && bands.indexOf(blocking) >= 0;

    let avoidAt = Infinity;
    /** The width of the opening he is threading at the nearest gate; -1 for none. */
    let gapWidth = -1;
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
        if (blocker.facing !== 0 && blocker.facing !== direction) continue;
        this.conflicts.push(blocker);
      }
      // The packmates in the same gate, after the road's own furniture.
      for (const band of bands) {
        if (band.to < gateLow || band.from > gateHigh) continue;
        if (band.safeSpeed >= view.speed) continue;
        if (band.facing !== 0 && band.facing !== direction) continue;
        this.conflicts.push(band);
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
      /**
       * The widest-and-nearest opening left when the given bands are taken out
       * of the corridor. `tier` 1 drops the blockers that only cost a wobble
       * (see the yield rule below); tier 2 drops everything that can be passed
       * at all and leaves the walls (the slow-through rule after it).
       */
      const search = (
        tier: 0 | 1 | 2,
        reach = limit,
        reachable: ((line: number) => boolean) | null = null,
      ): { low: number; high: number; width: number; line: number } => {
        this.gaps.length = 0;
        for (const blocker of this.conflicts) {
          if (tier === 1 && blocker.safeSpeed === Infinity) continue;
          if (tier === 2 && blocker.safeSpeed > 0) continue;
          // A packmate is never a wall: cops pass through each other (no
          // cop-to-cop physics, §39.6b.3), so the walls-alone search that
          // decides whether any line exists does not count a parked one.
          if (tier === 2 && bands.length > 0 && bands.indexOf(blocker) >= 0) continue;
          this.gaps.push(blocker.right - TIGHT_ROOM, blocker.left + TIGHT_ROOM);
        }

        let bestLow = 0;
        let bestHigh = 0;
        let bestWidth = -1;
        let cursorEdge = -reach;
        // The blocked bands, in order, with the free stretch before each one.
        const order: number[] = [];
        for (let i = 0; i < this.gaps.length; i += 2) order.push(i);
        order.sort((a, b) => this.gaps[a] - this.gaps[b]);
        let bestScore = Infinity;
        const takeGap = (low: number, high: number): void => {
          const width = high - low;
          if (width < MIN_GAP_METRES) return;
          // **Scored by how far he would have to move from where he actually
          // is, and that is hysteresis rather than an optimisation.** Scoring
          // against the *wanted* line instead put the two gaps either side of a
          // bollard in the middle of a nine-metre road within a few centimetres
          // of each other, so the winner changed as the road curved and the cop
          // swerved left, then right, then arrived at the bollard dead centre
          // and hit it at full speed. Measuring from his own line makes the gap
          // he is already entering win every subsequent step by construction.
          const target = clamp(offset, low + Math.min(room, width / 2), high - Math.min(room, width / 2));
          // Nearest, less a credit for width. A plaza's bollards stand in rows
          // with metre-and-a-half slots between them and five metres of clear
          // brick beside them, and a purely nearest rule threads the slot —
          // which is a line with no margin for the pursuit's own error, and the
          // one remaining way the sweep put him into a bollard.
          const score = Math.abs(target - selfLateral) - Math.min(width, GAP_WIDTH_CAP) * GAP_WIDTH_BIAS;
          if (bestWidth >= 0 && score >= bestScore) return;
          if (reachable !== null && !reachable(target)) return;
          bestScore = score;
          bestWidth = width;
          bestLow = low;
          bestHigh = high;
        };
        for (const index of order) {
          const low = this.gaps[index];
          const high = this.gaps[index + 1];
          if (low > cursorEdge) takeGap(cursorEdge, low);
          cursorEdge = Math.max(cursorEdge, high);
        }
        if (cursorEdge < reach) takeGap(cursorEdge, reach);
        const margin = Math.min(room, bestWidth / 2);
        return {
          low: bestLow,
          high: bestHigh,
          width: bestWidth,
          line: clamp(offset, bestLow + margin, bestHigh - margin),
        };
      };

      // **A line on the far side of a wall is only a line while he can still
      // get across in front of it** — M39's town ring (`sweep-40`). The score
      // above credits width, and width is measured across the whole gate: a
      // bollard on the boulevard's traffic island with a shallow hole twelve
      // metres beyond it left a 0.8 m slot on his side and ten clear metres
      // on the other, and six metres short of the post at 12 m/s the wide
      // side's credit finally outweighed the three metres to reach it. He
      // turned across the post's own band with no room to finish the move,
      // and met the post. Every opening is still offered; one reached by
      // crossing something that would put him down at the pace he is doing
      // is refused while the swerve law — the same one that prices his
      // speed below — says the crossing cannot be finished before it. When
      // nothing passes, the choice is exactly what it was, so this only ever
      // keeps him on his side of a wall he has already committed to.
      const crossable = (line: number): boolean => {
        for (const blocker of this.conflicts) {
          if (blocker.safeSpeed >= view.speed) continue;
          const low = blocker.right - TIGHT_ROOM;
          const high = blocker.left + TIGHT_ROOM;
          // Inside its band already: every way out is a crossing, and the
          // choice between them is the score's.
          if (selfLateral > low && selfLateral < high) continue;
          const across = line > selfLateral
            ? low > selfLateral && low < line
            : high < selfLateral && high > line;
          if (!across) continue;
          const ahead = direction > 0 ? blocker.from - this.cursor : this.cursor - blocker.to;
          const clear = line > selfLateral ? high - selfLateral : selfLateral - low;
          if (view.speed > swerveSpeed(clear, Math.max(0, ahead))) return false;
        }
        return true;
      };
      /** The search, preferring openings he can still reach without a crossing he cannot make. */
      const searchCommitted = (tier: 0 | 1 | 2): ReturnType<typeof search> => {
        const committed = search(tier, limit, crossable);
        return committed.width >= 0 ? committed : search(tier);
      };

      let chosen = searchCommitted(0);
      // **A wobble never closes an opening a wall left him** — M30 Phase 2's
      // QA repair.
      //
      // `safeSpeed` already says which kind of thing this is: a wall is `0`,
      // and a spill or a shallow hole is `Infinity` because they cost a wobble
      // a cop rides out like anybody else — *worth a swerve and never worth
      // braking for*. What that left out is the price of the swerve. Subtracted
      // like a wall, a two-metre spill lying across the mouth of a gateway
      // shuts the gateway, and the only openings left are the slivers at the
      // corridor's edge.
      //
      // `sweep-40` at `?mph=65`: a shallow pothole at 597.7 m and the ford's
      // two rails from 602.7 m with a 2.6 m channel between them. Together
      // their bands closed the channel, the widest thing left was 0.4 m of
      // verge outside the rails, and he set off for it — and clipped a rail at
      // 4.8 m/s. With that one hazard deleted the seed is clean, which is the
      // measurement that names the cause: it is not the speed and not the
      // corner, it is a hole being treated as a wall.
      //
      // So when the soft bands cost him most of his opening, he takes the
      // opening and rides the wobble. The comparison is against what the walls
      // alone leave, and `TIGHT_ROOM` — the wheel plus its rider, the narrowest
      // line he will take past anything — is the width worth a wobble.
      // The criterion is the road, not a width: a soft band is worth going
      // round while going round it is still a line on the road, and is not
      // worth going round when the only opening it leaves is the verge outside
      // the walls. That is a physical test rather than a threshold, and it is
      // silent in the ordinary case — the swerve past a spill on an open road
      // stays on the road and this never fires. And it is deliberately not
      // asked when the corridor offers *no* opening at all: that is the
      // end-around's case (§4.2's wall camp), and answering it here would take
      // the flank away from a pursuit that needs it.
      if (chosen.width >= 0 && Math.abs(chosen.line) > this.aim.halfWidth) {
        const hard = searchCommitted(1);
        if (hard.width >= 0 && Math.abs(hard.line) <= this.aim.halfWidth) chosen = hard;
      }
      // **And a wobble is worth a swerve, not a lane change** — the chase
      // pass. Measured on route-41's plaza: a spill lying beside his line
      // sent him three metres across the road at 7 m/s to keep a clearance
      // from something that costs a shimmy, then three metres back for the
      // post beyond it. When the walls alone leave a line on the road that is
      // `SOFT_SWERVE_WORTH_METRES` nearer where he already is, he takes it and
      // rides whatever is spilt on it.
      if (chosen.width >= 0) {
        const hard = searchCommitted(1);
        if (hard.width >= 0 && Math.abs(hard.line) <= this.aim.halfWidth
          && Math.abs(hard.line - selfLateral) + SOFT_SWERVE_WORTH_METRES
            < Math.abs(chosen.line - selfLateral)) {
          chosen = hard;
        }
      }
      // **A passable thing is not a wall** — the chase pass. A deep hole is
      // met at a crawl and a step is hopped, and both were subtracted from the
      // corridor like brick: the ford's channel with a deep hole in its mouth
      // (`sweep-15`, ridden back) and the alley staircase ridden up
      // (`route-41`) left no opening, and a pursuit answered "no opening"
      // with the end-around — aimed past the rails, into the water, and into
      // the alley's walls. Ask the walls alone; if they leave a line on the
      // road, take it at the pace the slowest thing on it allows.
      let slowThrough = Infinity;
      /** Whether the slowest thing on that line is a packmate (§39.6b.3). */
      let slowThroughPackmate = false;
      if (chosen.width < 0) {
        const walls = searchCommitted(2);
        if (walls.width >= 0 && Math.abs(walls.line) <= this.aim.halfWidth) {
          chosen = walls;
          for (const blocker of this.conflicts) {
            if (blocker.safeSpeed === 0 || blocker.safeSpeed === Infinity) continue;
            if (walls.line + TIGHT_ROOM > blocker.right && walls.line - TIGHT_ROOM < blocker.left
              && blocker.safeSpeed < slowThrough) {
              slowThrough = blocker.safeSpeed;
              slowThroughPackmate = bands.length > 0 && bands.indexOf(blocker) >= 0;
            }
          }
        }
      }
      // **And the shoulders, before going round** — the chase pass. A wall
      // wider than the road (§4.2's camp) leaves no opening in the corridor,
      // and the end-around aims past its end plus a clearance — a point,
      // not a line, through whatever stands on the verge there. The blockers
      // know the verge as far as `BLOCKER_MARGIN`, so the walls are asked
      // once more over that width: a slot between the wall's end and the
      // fence beyond it is a line the ordinary machinery can thread, with
      // the swerve law pricing it, where the end-around was a guess.
      // A slot is only a slot if he can get to it: the left verge's slot past
      // a bench and a post is a line through the bench, and the first cut of
      // this wedged him on exactly that. The gate's own point on each
      // candidate line is tested against the walls from where he is.
      if (chosen.width < 0) {
        const gateAt = this.cursor + direction * Math.max(0, avoidAt);
        this.spine.sample(gateAt, this.curveA);
        const gateX = this.curveA.x;
        const gateZ = this.curveA.z;
        const gateHeading = this.curveA.headingY;
        const wide = search(2, this.aim.halfWidth + BLOCKER_MARGIN, (line) => this.lineClear(
          view.x,
          view.z,
          gateX + Math.cos(gateHeading) * line,
          gateZ - Math.sin(gateHeading) * line,
        ));
        if (wide.width >= 0) chosen = wide;
      }
      const bestLow = chosen.low;
      const bestHigh = chosen.high;
      const bestWidth = chosen.width;
      gapWidth = bestWidth;

      if (bestWidth >= 0) {
        // Inside the gap by as much as it can spare, up to the clearance he
        // would have taken anyway. A wide opening therefore costs him nothing
        // and a tight one puts him exactly down the middle.
        const margin = Math.min(room, bestWidth / 2);
        offset = clamp(offset, bestLow + margin, bestHigh - margin);
        if (slowThrough < Infinity) {
          // Behind a packmate he matches the packmate's pace at him — and no
          // lower than a cop needs to turn to face his quarry: a cap derived
          // from a packmate may never park him (§39.6b.3).
          cap = slowThroughPackmate
            ? bind(Math.max(allow(slowThrough, Math.max(0, avoidAt)), TURN_TO_FACE_SPEED), 'packmate')
            : bind(allow(slowThrough, Math.max(0, avoidAt)), 'blocker');
        }
      } else if (quarry !== null) {
        // **No gap the corridor offers — but a wall has ends, and the
        // blockers know exactly where they are.** Braking to a stop here is
        // correct for a route ride, and it is also FEEDBACK-TRIAGE §4.2: a
        // player who parks behind something spanning the corridor turns the
        // stop into a stalemate they win by waiting. So a pursuit goes
        // *around*: aim past the nearer lateral end of the whole conflict
        // set, off the shoulder if that is where the end is. The ordinary
        // machinery does the rest — the aim pulled in to the obstacle makes
        // the offset a real swerve, and the sideways-feasibility cap below
        // keeps the pace honest for how far across he has to move.
        let lowEnd = Infinity;
        let highEnd = -Infinity;
        for (const blocker of this.conflicts) {
          lowEnd = Math.min(lowEnd, blocker.right);
          highEnd = Math.max(highEnd, blocker.left);
        }
        const below = lowEnd - room;
        const above = highEnd + room;
        // The side that ends *nearer the line* is the side whose end is
        // actually an end. Shoulder rows — trees, fences — line both verges
        // and merge into the conflict set, and picking by his own proximity
        // aimed him beyond the fence row: an offset on the far side of
        // something unpassable, which he then wedged against, which made
        // that side nearer still. Only a genuine tie falls back to the
        // shorter detour.
        if (Math.abs(above) < Math.abs(below) - END_AROUND_TIE_METRES) {
          offset = above;
        } else if (Math.abs(below) < Math.abs(above) - END_AROUND_TIE_METRES) {
          offset = below;
        } else {
          offset = Math.abs(below - selfLateral) <= Math.abs(above - selfLateral)
            ? below
            : above;
        }
        endAround = true;
        // While his own lateral is still inside the blocked band the face is
        // dead ahead, so arrive below the crash threshold — floored rather
        // than braked to zero, because zero is the parked cop again.
        if (selfLateral > lowEnd - TIGHT_ROOM && selfLateral < highEnd + TIGHT_ROOM) {
          cap = bind(Math.max(allow(0, Math.max(0, avoidAt)), FLANK_PROBE_SPEED), 'endAround');
        }
      } else {
        // Nowhere to go at all: arrive at a speed it can be met at. For a wall
        // that is zero, which is a cop stopping — correct, and rare, because a
        // route the validator passed has a rideable line through it and the
        // subtraction above is what finds it.
        cap = packmateGate
          ? bind(Math.max(allow(blocking.safeSpeed, Math.max(0, avoidAt)), TURN_TO_FACE_SPEED), 'packmate')
          : bind(allow(blocking.safeSpeed, Math.max(0, avoidAt)), 'blocker');
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

    // **Close pursuit: near the end of a chase, the target is the rider, not
    // the road.** The spine frame steers at a point *ahead on the line*, and
    // for a cop who has just worked around something — the §4.2 end-around —
    // that point is past the quarry: he overshot, turned, met the same wall
    // from the other side, went around it again, and orbited a rider he
    // could see the whole time. So once the quarry is close and the gate
    // reports nothing between them, he aims straight at them, exactly as a
    // field pursuit would. The closing-speed cap still holds the stand-off,
    // and a wall between the two keeps `blocking` non-null, which keeps this
    // off until the end-around has actually cleared it.
    // **The line to the rider is what has to be clear, not the gate** — the
    // chase pass. `blocking === null` was the test, and in a plaza there is
    // always something in the window: a cop six metres from a standing rider
    // with a post beside them kept aiming up the road instead. The road's
    // furniture is known, so ask it whether anything stands between the two.
    // **And near along the route, not only in plan** (Codex's M31 QA): a
    // rider six metres away across a hairpin's inner wall is forty metres
    // away by road, and the line-clear probe, sat on the fold, could not
    // see the wall. He aimed straight at them at 17 m/s.
    const closePursuit = quarry !== null && !direct
      && quarryRange <= CLOSE_PURSUIT_METRES
      && Math.abs(routeGap) <= CLOSE_PURSUIT_ROUTE_METRES
      && (blocking === null || this.lineClear(view.x, view.z, quarry.x, quarry.z));

    // **The end of the line is a place to stop, not to ride past.** A route is
    // point-to-point (§13 q6) and the cop rides roads (§18.7), so past the last
    // sample there is nothing to follow and the surround is what he ploughs
    // into — which is what he did, at speed, on eight of the pinned seeds. The
    // player who rides off the end is answered by the stray rule instead.
    // Not in a field pursuit: a quarry camped off-road beside the route's last
    // metres would otherwise be protected by this very cap, the cop braking to
    // a stand at the line's end while aiming at somebody standing past it.
    // Nor in close pursuit, whose whole leg is shorter than the margin.
    // A closed town ring has no end to stop at (M39 r6 QA): its last metre is
    // the plaza's first, and the cursor re-seats across the seam.
    if (!direct && !closePursuit && !this.spine.closed) {
      const endMargin = quarry === null ? END_MARGIN_METRES : 0;
      const routeLeft = direction > 0
        ? this.spine.length - endMargin - this.cursor
        : this.cursor - endMargin;
      cap = bind(allow(0, routeLeft), 'routeEnd');
    }

    // Close to striking distance, then match the quarry instead of sailing
    // past. This is the same braking equation used for corners and obstacles:
    // the quarry's current speed is the allowed speed at the stand-off point,
    // and the cop may spend only the distance left before it. No multiplier can
    // make his wheel faster than the player's; this only decides when he asks
    // their shared controller to brake.
    const strikeStandOff = Math.max(0, this.paddleReachMetres);
    if (quarry !== null && !detouring) {
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
      // the straight line is the whole closing distance there. A detour skips
      // this cap entirely: it is a slide *across* the quarry's range, and a
      // cop wedged at arm's length behind a wall would otherwise crawl the
      // whole flank at walking pace — which is the parked cop again, slower.
      // Searching, the way in is the path, never shorter than the line.
      const closingDistance = navigating
        ? Math.max(quarryRange, nav.remaining)
        : direct
          ? quarryRange
          : Math.max(Math.abs(routeGap), quarryRange);
      const standOff = allow(quarrySpeed, closingDistance - strikeStandOff);
      // **Matching a stationary quarry is a deadlock unless he is already
      // facing them, because a stationary wheel cannot turn** — M26 Phase 3's
      // chase finding, and it is older than that phase.
      //
      // Measured against a rider who simply stops: he closes, overshoots by a
      // metre, brakes to match their zero, and comes to rest with them **121°
      // off his nose** — outside `swingConeRadians`, so he never swings again,
      // and stationary, so `EucController` gives him no yaw to fix it with. He
      // stood there for the whole three hundred seconds of the escape clock.
      // It was invisible until M26 stopped one swing being counted on every
      // active step of its own sweep: the single swing he *did* land used to
      // deliver three body knocks at once, which crossed `wobbleCrashEnergy`
      // and busted the rider about a second after he arrived.
      //
      // So this cap may hold him at arm's length, and it may not hold him
      // still while he is pointed the wrong way. The floor is applied to *this*
      // constraint alone rather than to `cap`, so a wall, a corner or a hazard
      // can still stop him dead — raising the whole cap here would drive him
      // into the thing some other rule had just braked for.
      const facingQuarry = Math.abs(wrapAngle(
        Math.atan2(quarry.x - view.x, quarry.z - view.z) - view.headingY,
      )) <= this.swingConeRadians;
      // The strike pass rides *through* a standing quarry at its own pace
      // (below), so the hold at arm's length is not his.
      if (!(navigating && nav.attack)) {
        cap = bind(facingQuarry ? standOff : Math.max(standOff, TURN_TO_FACE_SPEED), 'standOff');
      }
    }

    // Off the road is somewhere to leave, not somewhere to hurry through: the
    // dressing lives out here and the grip does not. Scaled rather than
    // switched, so there is no edge for him to oscillate across.
    // Measured from a *share* of the corridor rather than from its edge: by the
    // time a rider is off the road they are already in the dressing, and the
    // useful moment to shed speed is while they are still running wide on it.
    // A side street the rider may legally take is road for the cop too (M39
    // QA): measured to the nearest loop street, not only the canonical road.
    const strayed = Math.max(0, this.streets.offRoute(view.x, view.z, this.location.offRoute)
      - this.location.halfWidth * CORRIDOR_SHARE);
    if (strayed > 0) cap = bind(Math.max(6, 20 - strayed * 2), 'strayed');

    // -- Turn the aim point into intent --------------------------------------
    let aimX: number;
    let aimZ: number;
    if (navigating) {
      // Corner to corner round what stands between them, then the strike.
      aimX = nav.aimX;
      aimZ = nav.aimZ;
      cap = bind(this.navCornerCap(view, cornerFactor, allow), 'nav');
      if (nav.attack) cap = bind(nav.cap, 'attack');
    } else if (detouring) {
      // Sideways, deliberately: the detour's whole content is an aim point
      // held a fixed reach away in the direction chosen when the ram failed.
      // Recomputed from where he *is* each step so pure pursuit always has it
      // ahead of him, and speed-capped because this is feeling along a wall,
      // not a chase.
      aimX = view.x + this.detourDirX * DETOUR_AIM_METRES;
      aimZ = view.z + this.detourDirZ * DETOUR_AIM_METRES;
      // Gently until the wheel actually points along the slide: the turn out
      // of the wedge is an arc, and an arc ridden at slide speed carries the
      // nose back through the wall it starts against — a ragdoll, not a
      // detour.
      const detourBearing = wrapAngle(
        Math.atan2(aimX - view.x, aimZ - view.z) - view.headingY,
      );
      cap = bind(
        Math.abs(detourBearing) > DETOUR_ALIGN_RADIANS ? FLANK_PROBE_SPEED : DETOUR_SPEED,
        'detour',
      );
      // **A slide feels the road's furniture** — the chase pass. The detour
      // rides blind on purpose (the road's blockers describe the road and a
      // flank is not on it), and at `DETOUR_SPEED` a fence beside the wall
      // he is sliding along is a ragdoll: the siege fixture crashed four
      // times working round one wall once honest braking changed the wedge
      // heading its slides run from. So the slide looks at the furniture the
      // field already projected, a few metres up its own direction, and
      // drops to probe pace when something other than the face it is sliding
      // along is there. What is not in the field — the surround's trees —
      // he still meets the way the escaping player means him to.
      const furnitureAt = this.slideBlocked(
        view.x,
        view.z,
        this.detourDirX,
        this.detourDirZ,
        selfLateral,
        DETOUR_PROBE_METRES,
      );
      if (Number.isFinite(furnitureAt)) {
        // Fast enough to stop before it, and never above probe pace at it.
        cap = bind(Math.max(FLANK_PROBE_SPEED, allow(0, furnitureAt - TIGHT_ROOM)), 'detour');
      }
    } else if ((direct || closePursuit) && quarry !== null) {
      // Straight at them. Pure pursuit needs no line when the target is the
      // point; the closing-speed cap above already stops him sailing past.
      aimX = quarry.x;
      aimZ = quarry.z;
      // A flank's direct legs are probes at a wall that has already beaten
      // him once, so they arrive below the crash threshold: a failed probe
      // costs the 1.4 s stuck cycle, where a ragdoll costs several times
      // that — which is how the first cut of this fix spent a whole clock
      // crashing its way around one planter.
      if (flanking) cap = bind(FLANK_PROBE_SPEED, 'flank');
    } else {
      // An end-around's whole point is a line the corridor cannot hold, so
      // the corridor does not clamp it. The offset came from real blocker
      // extents plus clearance, which is its own bound.
      const clamped = endAround
        ? offset
        : clamp(offset, -this.aim.halfWidth * 0.9, this.aim.halfWidth * 0.9);

      // **Never ask for more sideways than the tyre can give.** Choosing a line
      // is not the same as reaching it: moving Δ across the road within the
      // distance d that is left needs `d ≥ v·sqrt(2Δ/a)`, and inverting that
      // for v is the speed at which the line he has chosen is a line he can
      // take. It reuses the lateral limit the corners are taken on, so it
      // slows for a swerve on gravel by exactly as much more as it should.
      // Floored, because this answers "how fast may I be" and not "should I
      // stop": three pinned seeds crawled to a halt before the floor was added.
      //
      // **It charges for the sideways he OWES, not the sideways he happens to
      // be off his line** — the chase pass. The M18 form asked this of every
      // step: Δ was the distance from where he was to the line he *wanted*,
      // and d was the lookahead. Pure pursuit is never on its line — a metre
      // or two of tracking error at speed is ordinary — and a metre of error
      // read as "a metre to cross inside eleven metres" is a 17 m/s ceiling
      // on an empty straight. Measured over the pinned sweep this one rule
      // decided his speed on 70 % of every route at an average of 12 m/s,
      // which is the whole of why a 65 mph cop averaged 25 mph and any player
      // who held the throttle walked away from him (`docs/PLANS.md` §31).
      //
      // What he owes is defined by the gate: the move from where he is to
      // the line through the opening, to be finished by the time he reaches
      // it. On an open road with nothing in the window there is no gate and
      // no debt: running a little wide is the corner profile's and the stray
      // cap's business, not a lane change. The end-around keeps its M18 form
      // untouched, because §4.2's wall choreography was tuned against it.
      //
      // And the distance is the gate's, composed with braking rather than
      // read as a constant-speed sum. A move of Δ at lateral `a` takes
      // `T = sqrt(2Δ/a)` whatever the speed, so the speed he may hold at `d`
      // metres from the gate is `d / T` — and that is a ceiling that falls
      // as he closes, faster than any wheel can shed speed if he first meets
      // it at the gate. Spread along the approach the way the corner profile
      // is (`allow`), it is the speed now from which every point of the
      // approach is reachable: the minimum over `d'` of
      // `(d'/T)² + 2·b·(avoidAt − d')`, which is `b·T²` in from the gate when
      // that is inside the approach and the gate itself otherwise.
      let sideways = 0;
      let aimAt = Math.max(MIN_AIM_METRES, Math.abs(this.aim.distance - this.cursor));
      let atGate = false;
      if (endAround) {
        sideways = Math.abs(clamped - selfLateral);
      } else if (gapWidth >= 0) {
        sideways = Math.abs(clamped - selfLateral);
        aimAt = Math.max(MIN_AIM_METRES, avoidAt);
        atGate = true;
        // **And from his course when his course is what meets it** (`sweep-39`,
        // above): crossing his line on the way to the far side of it, he owes
        // nothing measured from where he is and everything measured from where
        // he is going. Only when the course actually meets something in the
        // gate that would put him down — on an open gate the ordinary tracking
        // error is the corner profile's business, as it always was.
        if (blocking !== null && this.conflicts.some(onCourse)) {
          sideways = Math.max(sideways, Math.abs(clamped - courseLateral(Math.max(0, avoidAt))));
        }
      }
      if (atGate && sideways > 0.05) {
        cap = bind(Math.max(SWERVE_SPEED_FLOOR, swerveSpeed(sideways, aimAt)), packmateGate ? 'packmate' : 'swerve');
      } else if (sideways > 0.05) {
        // Optimism rather than `reaction` itself: the same knob seen a second
        // time, normalised so a full-skill cop swerves at exactly the physics
        // (1.0) and a poor one believes he can cross the road in twice the
        // distance he has. Using `reaction` raw here would have made the
        // skilled cop conservative *twice over* and left him crawling through
        // the park gate, which is what it did.
        cap = bind(Math.max(
          SWERVE_SPEED_FLOOR,
          speedAtLateralLimit(
            (aimAt * optimism) / Math.sqrt(2 * sideways),
            cornerFactor,
            this.lateralCeiling,
          ),
        ), 'swerve');
      }

      // **And the gate after this one** — M30 Phase 2's QA repair.
      //
      // The line above is chosen for the nearest thing in the way and the
      // others in its own gate, which is what a rider does and is deliberate
      // (`GATE_SPAN_METRES`). The *speed* cannot be chosen that way. On the
      // shipped route the next cluster is far enough back that passing one
      // gate leaves room to plan the next; M30 Phase 1's 65 mph route is
      // denser by design (a faster wheel must never thin the road), and
      // `sweep-30` met a spill seven metres past a bollard at 19 m/s with the
      // spill invisible until the bollard was behind him — three tenths of a
      // second to cross nearly four metres, half of them spent airborne over a
      // boardwalk. He did not overcook a corner; he was never told to slow
      // down.
      //
      // So the same swerve law is asked of every blocker further up the window
      // that the chosen line runs into: how fast may he be, given the sideways
      // he will owe and the metres he has left to pay it in. It only ever
      // lowers the cap, it is silent at distance (the answer grows as `d`), and
      // it re-plans from scratch each step, so a gate he will actually route
      // around costs him nothing once the line moves off it.
      // Not during an end-around: that leg is deliberately a line the corridor
      // cannot hold, its own offset came from real blocker extents plus
      // clearance, and the far pieces of the very wall it is going around are
      // exactly what it must be allowed to drive past.
      if (!direct && !endAround) {
        const scanFrom = Math.max(avoidAt, 0) + GATE_SPAN_METRES;
        for (let index = 0; index < this.blockers.length; index += 1) {
          const blocker = direction > 0
            ? this.blockers[index]!
            : this.blockers[this.blockers.length - 1 - index]!;
          const ahead = direction > 0
            ? blocker.from - this.cursor
            : this.cursor - blocker.to;
          if (ahead > near) break;
          if (ahead <= scanFrom) continue;
          if (blocker.facing !== 0 && blocker.facing !== direction) continue;
          const low = blocker.right - TIGHT_ROOM;
          const high = blocker.left + TIGHT_ROOM;
          if (clamped <= low || clamped >= high) continue;
          // The cheaper of the two ways out of its band. Which side he will
          // actually take is the next gate's decision, not this one's; the
          // nearer edge is the bound that holds either way.
          const escape = Math.min(clamped - low, high - clamped);
          cap = bind(Math.max(
            SWERVE_SPEED_FLOOR,
            speedAtLateralLimit(
              (ahead * optimism) / Math.sqrt(2 * escape),
              cornerFactor,
              this.lateralCeiling,
            ),
          ), 'nextGate');
        }
      }
      aimX = this.aim.x + Math.cos(this.aim.headingY) * clamped;
      aimZ = this.aim.z - Math.sin(this.aim.headingY) * clamped;
    }

    if (streetAim !== null) {
      aimX = streetAim.x;
      aimZ = streetAim.z;
      // The corner rule the ordinary brain uses, in its units: the square root
      // of the radius, allowed the braking distance to each bend (M39 QA — the
      // first version passed the radius itself and never slowed for a block).
      for (let bend = 0; bend < streetAim.bendCount; bend += 1) {
        cap = bind(allow(
          speedAtLateralLimit(1 / Math.sqrt(streetAim.bendCurvature[bend]), cornerFactor, this.lateralCeiling),
          streetAim.bendAt[bend],
        ), 'corner');
      }
      // **And the things on that street** — M39's town ring. The street aim
      // is a road aim, but it is `direct`, so the canonical line's blockers
      // were never read — and across the town ring's seam there is no
      // canonical line to read them from: the eighty-odd metres that close
      // the ring are nobody's route. Ridden back toward a rider at the start
      // (`sweep-24`, `qa-chase-4`), he turned for the short way round and met
      // a deep hole on the closing street at 17 m/s. The street's own field
      // has it. The aim holds the street's centre and does not steer round
      // anything, so what is on the way is met at a pace it can be met at:
      // a hole or a step at its own, a face at the probe pace the flank's
      // straight-at-them legs use, after which the wall standoff and the stuck
      // ladder own it exactly as they did.
      const street = this.streetFieldFor(view, streetAim);
      if (street.field !== null) {
        const { field, here, direction: way, lateral } = street;
        const whole = field.ring.length;
        for (const blocker of field.blockers) {
          let ahead = way > 0 ? blocker.from - here : here - blocker.to;
          if (ahead < -BEHIND_MARGIN) ahead += whole;
          if (ahead > near || ahead < -BEHIND_MARGIN) continue;
          if (blocker.facing !== 0 && blocker.facing !== way) continue;
          if (blocker.right - room > Math.max(lateral, 0) || blocker.left + room < Math.min(lateral, 0)) continue;
          cap = bind(allow(Math.max(blocker.safeSpeed, FLANK_PROBE_SPEED), Math.max(0, ahead)), 'blocker');
        }
      }
    }
    this.lastOffset = offset;
    this.lastAimX = aimX;
    this.lastAimZ = aimZ;
    const bearing = wrapAngle(Math.atan2(aimX - view.x, aimZ - view.z) - view.headingY);
    // A quarry behind asks for a U-turn, not reverse gear. Backing toward the
    // rider would leave the paddle pointing away from the person it has to hit.
    // Shed speed until the normal low-speed steering can turn inside the road,
    // but keep moving: ordinary steer is deliberately disarmed at a standstill.
    if (Math.abs(bearing) > Math.PI / 2) {
      cap = bind(Math.min(EUC.technicalTurnFadeSpeed, this.lookaheadMinMetres), 'uTurn');
    }
    // **And under the wheel's own cutout, always** — M20. Applied last so it
    // binds every branch above, including the ones that deliberately leave `cap`
    // unclamped: an end-around and a straight-line pursuit are exactly the
    // situations that used to run him into the edge. Derived from the same
    // expression the controller uses, so it moves with the ride rather than
    // being a number that has to be remembered.
    cap = Math.min(cap, this.cutoutSpeed());
    this.capReasonValue = capReason;
    this.capSpeedValue = cap;
    // **Feedforward for the cost of holding speed** — the second half of the
    // owner's "still very easy to lose him by speeding away" (2026-08-14).
    // Proportional-only throttle can only produce the ~0.93 of throttle that
    // holding near-top speed costs by carrying a ~1.7 m/s standing error, so
    // whatever cap the branches above computed, he actually cruised ~4 mph
    // under it and a player riding the beeps walked away on every straight.
    // Raising `throttleGain` instead is the known-bad fix (audible throttle
    // pumping — see its note in `data/tuning.ts`); paying the drag bill
    // up front is not a correction, so the gentle gain stays gentle. The term
    // is drag-only, exactly like `derivedTopSpeed`: rolling resistance is
    // deliberately unpaid, so his equilibrium sits a shade *under* the cap
    // rather than on it, which is his cutout safety margin on real pavement.
    // Faded out both above the cap and below the over-speed band, and both
    // fades carry their own reason. Above the cap it is absent so braking for
    // corners and for the quarry is exactly the law it always was. Below
    // `CRUISE_FEEDFORWARD_FROM` it is absent because the term is worthless
    // there (drag is quadratic, so the bill it pays is pennies at walking
    // pace) and because it is *harmful* there — see that constant's note for
    // the wall-camp cop it left circling when it was allowed lower.
    const speed = Math.max(0, view.speed);
    const error = cap - speed;
    const holdThrottle = (this.dragCoefficient * speed * speed)
      / Math.max(1e-9, this.driveAcceleration);
    const feedforward = holdThrottle
      * clamp(error * 4, 0, 1)
      * clamp((speed - CRUISE_FEEDFORWARD_FROM) / CRUISE_FEEDFORWARD_FADE, 0, 1);
    actions.throttle = clamp(feedforward + error * this.throttleGain, -1, 1);
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
    // Holding is a physical relationship, not a projection relationship. Two
    // riders clamped to the same endpoint can still be many metres apart.
    const holdingQuarry = quarry !== null && quarryRange <= strikeStandOff;
    // Frozen from the last step before the escape arms; see `wedgeHeading`.
    if (this.stuckSeconds <= STUCK_SECONDS) this.wedgeHeading = view.headingY;
    if (holdingQuarry) this.stuckSeconds = 0;
    // Not conditioned on `grounded`: a wheel pressed on a wall micro-bounces
    // its suspension, and gating on ground contact made the timer accrue at a
    // seventh of real time — a 1.4 s threshold that took ten seconds to arm,
    // measured against the §4.2 wall. Airborne is covered by the speed reset:
    // a wheel with anywhere to fly is a wheel moving faster than this.
    else if (Math.abs(view.speed) < STUCK_SPEED) {
      const wasArmed = this.stuckSeconds > STUCK_SECONDS;
      this.stuckSeconds += dt;
      if (!wasArmed && this.stuckSeconds > STUCK_SECONDS) {
        // A wedge lap begins. Laps count up only while they keep happening in
        // the same few metres — a re-arm across the map is a new problem, not
        // a siege — and the brief bursts of motion inside a siege (a reverse
        // that gains two metres and re-pins) deliberately do NOT reset the
        // count, which is the mistake the first counter made.
        const moved = Math.hypot(view.x - this.lastWedgeX, view.z - this.lastWedgeZ);
        this.stuckDetours = moved > WEDGE_SAME_SPOT_METRES ? 1 : this.stuckDetours + 1;
        this.lastWedgeX = view.x;
        this.lastWedgeZ = view.z;
      }
    }
    else if (Math.abs(view.speed) > STUCK_SPEED * 3) {
      // An escape that got the wheel moving again has finished its job — and
      // the fact it was needed at all is what arms the flank. Recommitting
      // straight at the quarry from here is what the wall report caught: the
      // ram that just failed, replayed forever. Detour instead. Even when
      // the blockers see the obstacle: the end-around had its chance before
      // the wedge, and a wheel with its nose on a face cannot steer out of
      // one — power into a wall kills its speed, and steer is disarmed at a
      // standstill. The flank's sideways slide from a stand is the one
      // manoeuvre that regains room.
      // Searching, the search is the memory: it starts again from here.
      if (this.stuckSeconds > STUCK_SECONDS) {
        if (navigating) this.navReplanIn = 0;
        else this.beginDetour(quarry, quarryRange, view, selfLateral);
      }
      this.stuckSeconds = 0;
    }
    // **Circling is a siege too** — see `noProgressSeconds`. Only a quarry
    // who is standing: a moving rider holds a constant range on an honest
    // road pursuit for as long as they like, and that is a chase, not a wall.
    // Never on top of the ladder: a wedge arms its own detour, and a second
    // `beginDetour` in the same breath flips the side back and doubles the
    // span — M24's pumped alternation, which shredded the walk's legs.
    if (quarry !== null && !holdingQuarry && !this.flanking && !navigating
      && this.stuckSeconds <= STUCK_SECONDS && Math.abs(view.speed) > STUCK_SPEED * 3
      && quarrySpeed < NO_PROGRESS_QUARRY_SPEED && quarryRange < NO_PROGRESS_RANGE_METRES
      && Math.abs(routeGap) <= CLOSE_PURSUIT_ROUTE_METRES) {
      if (quarryRange < this.bestRecentRange - NO_PROGRESS_GAIN_METRES) {
        this.bestRecentRange = quarryRange;
        this.noProgressSeconds = 0;
      } else {
        this.noProgressSeconds += dt;
      }
      if (this.noProgressSeconds > NO_PROGRESS_SECONDS) {
        this.wedgeHeading = view.headingY;
        this.beginDetour(quarry, quarryRange, view, selfLateral);
        this.noProgressSeconds = 0;
        this.bestRecentRange = quarryRange;
      }
    } else {
      this.noProgressSeconds = 0;
      this.bestRecentRange = quarryRange;
    }
    // Which exit the wedge takes — M24. A face taller than any hop is the
    // pose the reverse-and-steer crawl could never leave (the 90-second
    // reproduction in the suite): the spin-jump escape below owns that case,
    // so the crawl only runs when the way ahead is something reversing can
    // actually help with.
    // Two full ladder laps from a stand and still parked: the siege is real,
    // whatever the feeler reads (see `stuckDetours`). A first wedge keeps the
    // ordinary escape, which the field probes showed resolving faster and
    // with fewer crashes than a spin thrown at every wall.
    const spinEscapeReady = this.stuckDetours >= 2 && this.spinEscapeCooldown <= 0;
    if (this.stuckSeconds > STUCK_SECONDS && !spinEscapeReady && !this.spinTapPending
      && this.spinRideOutSeconds <= 0) {
      actions.throttle = -1;
      actions.steer = bearing >= 0 ? 1 : -1;
      if (this.stuckSeconds > STUCK_SECONDS + STUCK_REVERSE_SECONDS) {
        // Boxed in enough that even reversing went nowhere. Detour from a
        // stand rather than reverse forever — or, searching, search again
        // from where the crawl left him.
        if (navigating) this.navReplanIn = 0;
        else this.beginDetour(quarry, quarryRange, view, selfLateral);
        this.stuckSeconds = 0;
      }
    }

    // The kerb, hopped off the controller's own feeler. `canAcceptHop` is the
    // authority on whether it happens, exactly as it is for a player holding
    // the key down: this is a request, not a jump. Bounded above as well as
    // below (M24): the feeler reports walls too, and a face taller than an
    // uncharged hop's apex is unclearable — hopping at it was the §4.2 pogo,
    // dozens of jumps against a wall each buying a few degrees of airborne
    // yaw, which read as "slowly jumping to correct himself".
    actions.hop = view.grounded
      && view.curbAhead > this.hopCurbHeight
      && view.curbAhead <= this.hopMaxCurbHeight;

    // -- The spin-jump escape (M24) ------------------------------------------
    // The two-press grammar, spelled out across steps: press to launch,
    // *release*, tap again in the air. Runs after the kerb request above so a
    // pending sequence owns the hop flag outright — a stray kerb-shaped
    // request mid-sequence would merge the two presses into one held level
    // and the controller's rising edge would never see the tap.
    if (this.spinTapPending) {
      // Riding inputs stand down while the trick is thrown: reverse throttle
      // under the launch would fight the hop, and held steer through the
      // flight would spend air yaw on top of the scripted sweep.
      actions.throttle = 0;
      actions.steer = 0;
      this.spinTapTimeout -= dt;
      if (!view.grounded) {
        actions.hop = true;
        this.spinTapPending = false;
        this.spinRideOutSeconds = SPIN_RIDE_OUT_SECONDS;
        // Make sure the landing has a leg to aim along — but never stomp one
        // already running: `beginDetour` flips the side and doubles the span
        // on every call, and an extra call per spin pumped the alternation so
        // hard the widening walk shredded its own half-finished legs (the
        // from-distance camp fixture caught it at 6.3 m closest). A leg in
        // progress keeps its direction; the ride-out below just drives it.
        if (this.detourRemaining <= 0 && !navigating) this.beginDetour(quarry, quarryRange, view, selfLateral);
      } else {
        actions.hop = false;
        // A launch that never happened — refused hop, retuned compression —
        // must not leave a tap armed to fire on some later, unrelated flight.
        if (this.spinTapTimeout <= 0) this.spinTapPending = false;
      }
    } else if (this.spinRideOutSeconds > 0) {
      // The landing's committed exit — M24, and its shape was measured twice.
      // Riding blind straight ahead parked the first build nose-into the
      // verge furniture opposite the wall, pinned in a pocket the feeler
      // cannot see; commanding reverse (the crawl's instinct) backed the
      // second into the wall it had just spun away from, a pirouette show at
      // 0 m/s. So the ride-out changes exactly one thing: the throttle is
      // held open. The steer stays the aim machinery's own, which — with the
      // detour armed at the tap — is the flank's slide, a forward diagonal
      // off the face, from real speed.
      this.spinRideOutSeconds -= dt;
      if (view.grounded) {
        actions.throttle = 1;
      }
    } else if (this.stuckSeconds > STUCK_SECONDS && spinEscapeReady && view.grounded) {
      actions.hop = true;
      actions.throttle = 0;
      actions.steer = 0;
      this.spinTapPending = true;
      this.spinTapTimeout = SPIN_TAP_TIMEOUT_SECONDS;
      this.spinEscapeCooldown = SPIN_ESCAPE_COOLDOWN_SECONDS;
    }

    // -- The swing -----------------------------------------------------------
    if (quarry !== null && this.swingCooldown <= 0) {
      const dx = quarry.x - view.x;
      const dz = quarry.z - view.z;
      const range = Math.sqrt(dx * dx + dz * dz);
      // **A head-on pass has to be led.** At two top-speed wheels the ordinary
      // 3.4 m range disappears inside the paddle's 0.10 s wind-up, so the
      // strike begins after the quarry is already behind the cop. The swept hit
      // test can cover motion *during* an active step; it cannot repair a swing
      // requested too late. Predict the range at the end of the strike — where
      // either committed arc reaches forward — from observed closure, and
      // start when that future contact point is one paddle reach away. The
      // ordinary range remains the floor for slow and same-direction chases.
      const contactSeconds = Math.max(0, this.paddleWindupSeconds)
        + Math.max(0, this.paddleActiveSeconds);
      // **And never from further than the paddle reaches** (the brutal pass).
      // The floor was `swingRangeMetres`, 3.4 m, which leads a swing only for
      // a closure the lead already covers: a cop creeping up on a parked
      // rider at 2 m/s wound up at 3.4 m and ended the swing 3 m short — then
      // sat inside the arc's reach on the cooldown. The floor is now the
      // nearer of that and the swing's own envelope for a rider's body.
      const envelope = PADDLE.pivotOffset + Math.max(0, this.paddleReachMetres)
        + PADDLE.headRadius + CHASE.riderHitRadius - STRIKE_ENVELOPE_MARGIN;
      const ledRange = Math.max(
        Math.min(this.swingRangeMetres, envelope),
        Math.max(0, this.paddleReachMetres) + quarryClosingSpeed * contactSeconds,
      );
      if (range <= ledRange) {
        const toQuarry = wrapAngle(Math.atan2(dx, dz) - view.headingY);
        // **Beside him counts, at arm's length** (the brutal pass). The arc
        // sweeps from well behind the shoulder to the nose, so a rider a
        // paddle's reach off to the side is struck — measured, 1.2–1.4 m
        // out, to ±105° — and the 60° cone left a cop circling a parked
        // rider at arm's length, never swinging. Past arm's length the cone
        // is the tuned one: that swing has to be led onto him.
        const cone = range <= CLOSE_SWING_METRES
          ? Math.max(this.swingConeRadians, CLOSE_SWING_CONE_RADIANS)
          : this.swingConeRadians;
        if (Math.abs(toQuarry) <= cone) {
          // The authored player forehand travels through the rider's right.
          // A cop has a target on either side, so mirror the same physical arc
          // when the quarry is left of his nose. The paddle latches this value
          // when it accepts the request; crossing the nose during wind-up
          // cannot reverse a committed swing.
          this.swingSide = toQuarry > 0 ? 'left' : 'right';
          actions.swing = true;
          this.swingCooldown = this.swingCooldownSeconds;
        }
      }
    }

    return actions;
  }

  /**
   * Commit to sliding past whatever the failed ram was into.
   *
   * The direction is the perpendicular of the line to the quarry, on the side
   * whose turn it is — which for a wall he just hit square-on is along its
   * face. Each call flips the side and doubles the next commitment, so a
   * detour that was not enough is followed by a longer one the other way:
   * the walk widens until one end of the obstacle is inside it, however long
   * the wall the player found. Everything here is arithmetic on state the
   * step already has; a flank replays identically under `advance(n)`.
   */
  /**
   * The fastest the cop will ask for, m/s — M20.
   *
   * `EucController.derivedTopSpeed` × his wheel's cutout share × his own
   * margin, and the drive and drag are pushed from the same live tuning record
   * as his controller, so a drag or drive change moves this with both riders.
   * The cutout share is his own (`CHASE.copCutoutSpeedShare`, 2026-09-22), so
   * a change to the *player's* edge does not move it. He is
   * not handed the controller: a brain that held one could read anything on
   * it, and it has never needed more than the `CpuView` it is given.
   *
   * The cutout being switched off does not lift the ceiling. That is
   * deliberate: `EUC.cutoutEnabled` is an owner A/B for the *player's* ride, and
   * a cop whose top speed changed depending on which side of that switch the
   * owner was on would make the A/B compare two different chases.
   */
  private cutoutSpeed(): number {
    const top = Math.sqrt(this.driveAcceleration / Math.max(1e-9, this.dragCoefficient));
    return top * this.cutoutSpeedShare * this.cutoutMarginShare;
  }

  /**
   * How far up a slide from a point the road's furniture stands, metres —
   * `Infinity` for nothing within the reaches given.
   *
   * The road's blockers, tested at each reach of the slide for the wheel's
   * own room. The face he is pressed against — its band holds the starting
   * point — is not ahead of him. Soft bands are not furniture.
   */
  private slideBlocked(
    fromX: number,
    fromZ: number,
    dirX: number,
    dirZ: number,
    fromLateral: number,
    reaches: readonly number[],
  ): number {
    for (const reach of reaches) {
      const px = fromX + dirX * reach;
      const pz = fromZ + dirZ * reach;
      this.spine.locate(px, pz, this.cursor, this.probeAt);
      this.spine.sample(this.probeAt.distance, this.curveB);
      const probeLateral = (px - this.curveB.x) * Math.cos(this.curveB.headingY)
        - (pz - this.curveB.z) * Math.sin(this.curveB.headingY);
      for (const blocker of this.blockers) {
        if (blocker.to < this.probeAt.distance - TIGHT_ROOM) continue;
        if (blocker.from > this.probeAt.distance + TIGHT_ROOM) break;
        if (blocker.safeSpeed === Infinity) continue;
        if (probeLateral < blocker.right - TIGHT_ROOM || probeLateral > blocker.left + TIGHT_ROOM) continue;
        if (this.cursor >= blocker.from - DETOUR_OWN_FACE_METRES
          && this.cursor <= blocker.to + DETOUR_OWN_FACE_METRES
          && fromLateral >= blocker.right - DETOUR_OWN_FACE_METRES
          && fromLateral <= blocker.left + DETOUR_OWN_FACE_METRES) continue;
        return reach;
      }
    }
    return Infinity;
  }

  /**
   * Is the straight line between two world points clear of the road's walls?
   *
   * Sampled every `LINE_CLEAR_STEP_METRES`, each point located on the line and
   * tested against every wall's band grown by the wheel's own room. Unlike
   * the slide probe, the face he is pressed against is **not** excused: in a
   * wall camp it is exactly the thing between him and the rider, and the
   * first cut of this excused it and ended every slide on the spot. Soft
   * bands are not walls.
   */
  /**
   * Which loop's road the street aim is riding, where he is on it, which way,
   * and how far off its centre — `field` is `null` when none can be told. The
   * answer is reused between steps, like the step's own intent. The aim
   * point is sampled on a ring's centreline by construction, so the ring it
   * lies on is the one being ridden; loops sharing a street share its
   * furniture, so the first such ring answers for all of them.
   */
  private streetFieldFor(
    view: CpuView,
    aim: { x: number; z: number },
  ): typeof this.streetRide {
    const ride = this.streetRide;
    ride.field = null;
    for (const field of this.streetFields) {
      field.ring.locate(aim.x, aim.z, -1, this.streetThere);
      if (this.streetThere.offRoute > STREET_AIM_ON_RING_METRES) continue;
      field.ring.locate(view.x, view.z, -1, this.streetHere);
      if (this.streetHere.offRoute > this.streetHere.halfWidth + CHASE.streetJoinReach) continue;
      const whole = field.ring.length;
      let gap = this.streetThere.distance - this.streetHere.distance;
      if (gap > whole / 2) gap -= whole;
      if (gap < -whole / 2) gap += whole;
      field.ring.sample(this.streetHere.distance, this.streetAt);
      const lateral = (view.x - this.streetAt.x) * Math.cos(this.streetAt.headingY)
        - (view.z - this.streetAt.z) * Math.sin(this.streetAt.headingY);
      ride.field = field;
      ride.here = this.streetHere.distance;
      ride.direction = gap < 0 ? -1 : 1;
      ride.lateral = lateral;
      return ride;
    }
    return ride;
  }

  /**
   * **A closed ring's seam is ridden through, not stopped at (M39 r6 Codex
   * QA).** The town spine ends where it began, in the plaza, but its distances
   * are open, so a windowed locate near one end cannot see the other: a cop
   * riding home kept a cursor pinned at the last metre while he stood in the
   * plaza, read a rider 25 m in as 2,475 m behind and dithered at the seam.
   * Near either end the other end's window is asked too, and the clearly
   * nearer answer wins — the two ends coincide, so at the seam itself the
   * answers tie and the cursor keeps its side.
   */
  private acrossSeam(x: number, z: number, located: SpineLocation): void {
    if (!this.spine.closed) return;
    const whole = this.spine.length;
    let other: number;
    if (located.distance > whole - SEAM_WINDOW_METRES) other = 0;
    else if (located.distance < SEAM_WINDOW_METRES) other = whole;
    else return;
    this.spine.locate(x, z, other, this.seamAt);
    if (this.seamAt.offRoute >= located.offRoute - SEAM_PREFERENCE_METRES) return;
    located.distance = this.seamAt.distance;
    located.offRoute = this.seamAt.offRoute;
    located.halfWidth = this.seamAt.halfWidth;
  }

  private lineClear(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return true;
    const steps = Math.max(1, Math.ceil(length / LINE_CLEAR_STEP_METRES));
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const px = fromX + dx * t;
      const pz = fromZ + dz * t;
      this.spine.locate(px, pz, this.cursor, this.probeAt);
      this.spine.sample(this.probeAt.distance, this.curveB);
      const lateral = (px - this.curveB.x) * Math.cos(this.curveB.headingY)
        - (pz - this.curveB.z) * Math.sin(this.curveB.headingY);
      for (const blocker of this.blockers) {
        if (blocker.to < this.probeAt.distance - TIGHT_ROOM) continue;
        if (blocker.from > this.probeAt.distance + TIGHT_ROOM) break;
        if (blocker.safeSpeed !== 0) continue;
        if (lateral < blocker.right - TIGHT_ROOM || lateral > blocker.left + TIGHT_ROOM) continue;
        return false;
      }
    }
    return true;
  }

  private beginDetour(quarry: CpuQuarry | null, range: number, view?: CpuView, selfLateral = 0): void {
    // **A flank is close-quarters work** (Codex's M31 QA, `qa-chase-4` ridden
    // back). Its direct leg aims straight at the rider and switches the
    // road's reasoning off, which is right for a rider behind a wall a few
    // metres away and wrong for one a kilometre away by route: a cop wedged
    // on a slab's flank at the far end of a folded route flanked at a rider
    // on the far arm, rode seventeen metres into the field and met a post at
    // 10 m/s. Beyond `FLANK_RANGE_METRES` the wedge is road furniture, the
    // crawl backs him out, and the road pursuit — which reads the furniture
    // — takes him on.
    if (quarry === null || range <= 1e-6 || range > FLANK_RANGE_METRES) return;
    if (!this.flanking) {
      this.flanking = true;
      this.flankQuarryX = quarry.x;
      this.flankQuarryZ = quarry.z;
    }
    // Perpendicular to the heading he was wedged on, not to the quarry line.
    // His nose was buried in the thing he rammed, so that heading's
    // perpendicular is the obstacle's face — the tangent a wall-follower
    // actually wants. The quarry-line perpendicular is the same thing only
    // for a square-on ram; wedged obliquely near a wall's end it points
    // diagonally backward, and the first cut of this walked away from the
    // chase on exactly that.
    // Left of heading h is (cos h, −sin h) — the file's one sign convention.
    //
    // **And a side that is furnished within a few metres is not tried** —
    // the chase pass. The walk alternates sides so that it cannot repeat a
    // failed leg forever, and a leg into a post two metres off is a failed
    // leg the field can already see: a slide into a pocket between a post
    // and a pillar parked him there for the whole of a fixture. When the
    // side whose turn it is reads blocked and the other is clear, the other
    // goes first; when both read blocked, the alternation stands and the
    // ladder's next rung — the spin — is what gets him out.
    let side = this.detourSide;
    if (view !== undefined) {
      // As far as the leg itself would go, capped: a post at the far end of
      // a seven-metre slide is the pocket that parked him.
      const reach = Math.min(DETOUR_SIDE_PROBE_MAX_METRES, Math.ceil(this.detourSpan));
      for (let metres = 1; metres <= reach; metres += 1) this.sideProbe[metres - 1] = metres;
      this.sideProbe.length = reach;
      const room = (candidate: 1 | -1): number => this.slideBlocked(
        view.x,
        view.z,
        candidate * Math.cos(this.wedgeHeading),
        candidate * -Math.sin(this.wedgeHeading),
        selfLateral,
        this.sideProbe,
      );
      // The side whose turn it is unless the other has more room ahead —
      // and no slide at all when neither has `DETOUR_MIN_ROOM_METRES`: a leg
      // into a post two metres off is the pocket that parked him, and the
      // crawl that backs him out the way he came in is the rung for that.
      const other: 1 | -1 = side === 1 ? -1 : 1;
      const roomHere = room(side);
      const roomThere = room(other);
      if (roomThere > roomHere) side = other;
      if (Math.max(roomHere, roomThere) < DETOUR_MIN_ROOM_METRES) return;
    }
    this.detourDirX = side * Math.cos(this.wedgeHeading);
    this.detourDirZ = side * -Math.sin(this.wedgeHeading);
    this.detourRemaining = this.detourSpan;
    this.detourSpan = Math.min(DETOUR_SPAN_MAX_METRES, this.detourSpan * 2);
    this.detourSide = side === 1 ? -1 : 1;
  }

  /** Forget the whole flank: the quarry moved, vanished, or we teleported. */
  private endFlank(): void {
    this.flanking = false;
    this.detourRemaining = 0;
    this.detourSpan = DETOUR_SPAN_BASE_METRES;
    this.detourSide = 1;
    this.flankFreeSeconds = 0;
  }

  /**
   * The close-quarters search, one step — the brutal pass. Answers whether it
   * has the wheel, and leaves its aim, the path still to ride and the strike
   * pass (if any) in `navOut`.
   *
   * **When.** A quarry inside `navRangeMetres` who is off the road (measured
   * to the nearest street a rider may legally take) or slower than
   * `navSlowQuarrySpeed`; both edges hysteretic, the range and the pace, on
   * the field pursuit's pattern. A moving rider on the road is the spine's.
   *
   * **How.** A* on the shared grid from where he is to where the quarry is,
   * again every `NAV_REPLAN_SECONDS` or when the quarry has moved; a packmate
   * already nearer the quarry costs the ground round him and his way in, so a
   * second cop takes the other end of the block. He rides at the first corner
   * of the path he cannot already see past, so a corner is never cut through
   * a wall. In sight and within `NAV_ATTACK_METRES` of a quarry standing
   * still, the aim goes past him a paddle's reach to one side — the strike
   * pass — at `attackPassSpeed`, never faster than stops short of what lies
   * past him.
   */
  private navigate(
    dt: number,
    view: CpuView,
    quarry: CpuQuarry,
    range: number,
    quarrySpeed: number,
    mates: readonly { readonly x: number; readonly z: number }[] | undefined,
  ): boolean {
    const grid = this.navGrid;
    if (grid === null) {
      this.navEngaged = false;
      return false;
    }
    const engaged = this.navEngaged;
    const reach = this.navRangeMetres * (engaged ? NAV_RANGE_EXIT_SHARE : 1);
    const slow = quarrySpeed < this.navSlowQuarrySpeed * (engaged ? NAV_SLOW_EXIT_SHARE : 1);
    // The cheap tests first: the street rings are located only for a quarry
    // in range and moving, the one case the answer turns on.
    const offRoad = range < reach && !slow
      && this.streets.offRoute(quarry.x, quarry.z, this.quarryAt.offRoute) - this.quarryAt.halfWidth
        > (engaged ? FIELD_EXIT_MARGIN : FIELD_ENTER_MARGIN);
    this.navEngaged = range < reach && (offRoad || slow);
    if (!this.navEngaged) {
      this.navHasPath = false;
      return false;
    }

    // Searched at a bounded rate whatever the answer was: a failed search (a
    // quarry walled off, or out of the window) waits its turn like any other,
    // so a hopeless search is a cost four times a second, never every step.
    // **And no step pays for a long one**: a search runs at most
    // `NAV_STEP_EXPANSIONS` cells a step and carries on the next, the last
    // path found steering him meanwhile.
    this.navReplanIn -= dt;
    if (this.navPlanner === null) this.navPlanner = new NavPlanner(grid);
    const searcher = this.navPlanner;
    if (searcher.searching) {
      const state = searcher.advance(NAV_STEP_EXPANSIONS);
      if (state === 1) {
        this.navHasPath = true;
        this.navNext = 1;
      } else if (state === -1) {
        this.navHasPath = false;
      }
    } else {
      const moved = Math.hypot(quarry.x - this.navGoalX, quarry.z - this.navGoalZ);
      if (this.navReplanIn <= 0 || (this.navHasPath && !(moved < NAV_GOAL_MOVE_METRES))) {
        let repel = 0;
        if (mates !== undefined) {
          for (const mate of mates) {
            if (repel > NAV_MAX_REPEL - 2) break;
            const mateRange = Math.hypot(mate.x - quarry.x, mate.z - quarry.z);
            // Only a packmate ahead of him on the way in: the nearer cop takes
            // the short way, the next one the other.
            if (mateRange > range - NAV_REPEL_LEAD_METRES || mateRange > this.navRangeMetres) continue;
            this.repelX[repel] = mate.x;
            this.repelZ[repel] = mate.z;
            repel += 1;
            this.repelX[repel] = (mate.x + quarry.x) / 2;
            this.repelZ[repel] = (mate.z + quarry.z) / 2;
            repel += 1;
          }
        }
        this.navReplanIn = NAV_REPLAN_SECONDS;
        this.navGoalX = quarry.x;
        this.navGoalZ = quarry.z;
        if (searcher.start(
          view.x, view.z, quarry.x, quarry.z,
          this.repelX, this.repelZ, repel, NAV_REPEL_METRES, NAV_REPEL_COST,
        )) {
          const state = searcher.advance(NAV_STEP_EXPANSIONS);
          if (state === 1) {
            this.navHasPath = true;
            this.navNext = 1;
          } else if (state === -1) {
            this.navHasPath = false;
          }
        } else {
          this.navHasPath = false;
        }
      }
    }
    if (!this.navHasPath) return false;

    const planner = this.navPlanner!;
    const px = planner.pathX;
    const pz = planner.pathZ;
    const count = planner.pathLength;
    // The corner he rides at: the first one he cannot already see past.
    const switchRadius = Math.max(NAV_SWITCH_METRES, Math.abs(view.speed) * NAV_SWITCH_SECONDS);
    while (this.navNext < count - 1) {
      const near = Math.hypot(px[this.navNext] - view.x, pz[this.navNext] - view.z) < switchRadius;
      if (!near && !navLineClear(grid, view.x, view.z, px[this.navNext + 1], pz[this.navNext + 1], NAV_LOS_SKIP_METRES)) break;
      this.navNext += 1;
    }
    // Wide of the leg he is on (a crash, a knock, a slide): search again next step.
    {
      const ax = px[this.navNext - 1];
      const az = pz[this.navNext - 1];
      const bx = px[this.navNext];
      const bz = pz[this.navNext];
      const lx = bx - ax;
      const lz = bz - az;
      const length2 = lx * lx + lz * lz;
      const t = length2 > 1e-9 ? Math.max(0, Math.min(1, ((view.x - ax) * lx + (view.z - az) * lz) / length2)) : 0;
      if (Math.hypot(view.x - (ax + lx * t), view.z - (az + lz * t)) > NAV_OFF_PATH_METRES) this.navReplanIn = 0;
    }

    const out = this.navOut;
    let remaining = Math.hypot(px[this.navNext] - view.x, pz[this.navNext] - view.z);
    for (let k = this.navNext; k < count - 1; k += 1) remaining += Math.hypot(px[k + 1] - px[k], pz[k + 1] - pz[k]);
    out.remaining = remaining;
    out.aimX = px[this.navNext];
    out.aimZ = pz[this.navNext];
    out.attack = false;
    out.cap = Infinity;

    // The strike pass: in sight, near, and standing still.
    if (remaining <= NAV_ATTACK_METRES && quarrySpeed < NAV_ATTACK_SLOW_SPEED
      && navLineClear(grid, view.x, view.z, quarry.x, quarry.z, NAV_LOS_SKIP_METRES)) {
      const dx = quarry.x - view.x;
      const dz = quarry.z - view.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-3 && length < NAV_ATTACK_TOO_CLOSE) {
        // On top of him: the paddle passes outside a rider this close. Open
        // the range away from him — the most open of eight bearings, nearest
        // straight away first, so the back-off never runs into the wall he is
        // hiding against — and come again.
        const away = Math.atan2(-dx, -dz);
        let bestX = view.x - (dx / length) * NAV_ATTACK_BACK_OFF_METRES;
        let bestZ = view.z - (dz / length) * NAV_ATTACK_BACK_OFF_METRES;
        let bestRun = -1;
        for (const turn of BACK_OFF_TURNS) {
          const bearing = away + turn;
          const sx = Math.sin(bearing);
          const sz = Math.cos(bearing);
          let run = 0;
          while (run < NAV_ATTACK_BACK_OFF_METRES && navFree(grid, view.x + sx * (run + 0.5), view.z + sz * (run + 0.5))) run += 0.5;
          if (run > bestRun + 0.5) {
            bestRun = run;
            bestX = view.x + sx * NAV_ATTACK_BACK_OFF_METRES;
            bestZ = view.z + sz * NAV_ATTACK_BACK_OFF_METRES;
          }
          if (run >= NAV_ATTACK_BACK_OFF_METRES) break;
        }
        out.aimX = bestX;
        out.aimZ = bestZ;
        out.attack = true;
        out.cap = Math.min(this.attackPassSpeed, NAV_TIGHT_SPEED);
      } else if (length > 1e-3) {
        const ux = dx / length;
        const uz = dz / length;
        // Left of the line in is (uz, −ux): the file's one convention.
        const offset = this.attackOffsetMetres;
        const freeSide = (side: 1 | -1): boolean => navFree(grid, quarry.x + side * uz * offset, quarry.z - side * ux * offset);
        let side: 1 | -1 = this.attackSide;
        // Away from a packmate already on him, so the two come from both sides.
        if (mates !== undefined) {
          let nearest = Infinity;
          let mateSide = 0;
          for (const mate of mates) {
            const mateRange = Math.hypot(mate.x - quarry.x, mate.z - quarry.z);
            if (mateRange > NAV_ATTACK_METRES || mateRange >= nearest) continue;
            nearest = mateRange;
            mateSide = (mate.x - quarry.x) * uz - (mate.z - quarry.z) * ux >= 0 ? 1 : -1;
          }
          if (mateSide !== 0) side = mateSide > 0 ? -1 : 1;
        }
        if (!freeSide(side)) side = side === 1 ? -1 : 1;
        if (freeSide(side)) {
          this.attackSide = side;
          const beside = { x: quarry.x + side * uz * offset, z: quarry.z - side * ux * offset };
          // How far past him the ground stays open, so the pass stops short of a wall.
          let run = 0;
          while (run < NAV_ATTACK_THROUGH_METRES && navFree(grid, beside.x + ux * (run + 0.5), beside.z + uz * (run + 0.5))) run += 0.5;
          out.aimX = beside.x + ux * Math.max(run, 1);
          out.aimZ = beside.z + uz * Math.max(run, 1);
          out.attack = true;
          const braking = Math.max(1, this.brakeDeceleration) / Math.max(1, this.brakeSafety);
          const room = Math.max(0, length + run - NAV_ATTACK_STOP_ROOM);
          out.cap = Math.min(this.attackPassSpeed, Math.sqrt(FLANK_PROBE_SPEED * FLANK_PROBE_SPEED + 2 * braking * room));
        } else {
          out.aimX = quarry.x;
          out.aimZ = quarry.z;
        }
      }
    }
    return true;
  }

  /**
   * The pace the path allows from here, m/s: every corner still ahead within
   * `NAV_CORNER_LOOK_METRES`, taken on the arc tangent to both of its legs at
   * half the shorter one, at the grip he corners with, and braked for by the
   * step's own law. Never below `NAV_CORNER_FLOOR` — a corner is a turn, not
   * a stop.
   */
  private navCornerCap(
    view: CpuView,
    cornerFactor: number,
    allow: (limit: number, distance: number) => number,
  ): number {
    const planner = this.navPlanner;
    if (planner === null) return Infinity;
    const px = planner.pathX;
    const pz = planner.pathZ;
    const count = planner.pathLength;
    let cap = Infinity;
    let along = 0;
    let fromX = view.x;
    let fromZ = view.z;
    for (let k = this.navNext; k < count - 1; k += 1) {
      const inX = px[k] - fromX;
      const inZ = pz[k] - fromZ;
      const outX = px[k + 1] - px[k];
      const outZ = pz[k + 1] - pz[k];
      const lengthIn = Math.hypot(inX, inZ);
      const lengthOut = Math.hypot(outX, outZ);
      along += lengthIn;
      if (along > NAV_CORNER_LOOK_METRES) break;
      if (lengthIn > 1e-3 && lengthOut > 1e-3) {
        const cosine = (inX * outX + inZ * outZ) / (lengthIn * lengthOut);
        const turn = Math.acos(Math.max(-1, Math.min(1, cosine)));
        if (turn > NAV_CORNER_MIN_TURN) {
          const tangent = Math.min(lengthIn, lengthOut) / 2;
          const radius = Math.max(0.25, tangent / Math.tan(turn / 2));
          const limit = Math.max(NAV_CORNER_FLOOR, speedAtLateralLimit(Math.sqrt(radius), cornerFactor, this.lateralCeiling));
          cap = Math.min(cap, allow(limit, Math.max(0, along - tangent)));
        }
      }
      fromX = px[k];
      fromZ = pz[k];
    }
    // And past a wall's edge at a pace that does not clip it: every metre of
    // the path within `NAV_TIGHT_LOOK_METRES` over a cell beside a solid.
    const grid = this.navGrid;
    if (grid !== null) {
      let travelled = 0;
      let ax = view.x;
      let az = view.z;
      for (let k = this.navNext; k < count && travelled < NAV_TIGHT_LOOK_METRES; k += 1) {
        const bx = px[k];
        const bz = pz[k];
        const leg = Math.hypot(bx - ax, bz - az);
        for (let along = 1; along <= leg && travelled + along <= NAV_TIGHT_LOOK_METRES; along += 1) {
          const t = along / leg;
          if (navBesideWall(grid, ax + (bx - ax) * t, az + (bz - az) * t)) {
            cap = Math.min(cap, allow(NAV_TIGHT_SPEED, Math.max(0, travelled + along - 1)));
            travelled = NAV_TIGHT_LOOK_METRES;
            break;
          }
        }
        travelled += leg;
        ax = bx;
        az = bz;
      }
    }
    return cap;
  }
}

/** How finely the corner profile is sampled along the horizon, metres. */
const CORNER_SCAN_METRES = 6;

/**
 * **A lateral-limited speed is a fixed point, not a division** — M30 Phase 2.
 *
 * Two questions the brain asks have the shape `v = k · sqrt(a(v))`: a corner
 * of curvature κ allows `sqrt(a / κ)`, so `k = 1 / sqrt(κ)`; and crossing Δ of
 * road in the d metres left allows `d · sqrt(a / 2Δ)`. `perG` is everything
 * about the surface and the rider that multiplies the ceiling — gravity, the
 * grip, the cornering margin, his skill — so `a(v) = ceiling(v) · perG`.
 *
 * Before M30 the available `a` was a constant and this was one division. The
 * schedule (`simulation/lateralCeiling.ts`) makes it a function of the speed,
 * and **the speed that matters is the one he will be doing at the corner, not
 * the one he is doing now**: a cop who read the ceiling at 27 m/s would
 * believe a bend he is about to brake into holds 1.05 g, and arrive at it far
 * too fast. That is the overcooking `docs/PLANS.md` §30.3b names.
 *
 * **From the schedule's floor rather than from his current value.** The plan's
 * letter says "from the current value", and the direction is the reason for the
 * change: for a rising schedule the map is increasing and a contraction, so
 * iterates started *above* the fixed point stay above it however many times
 * they are run — and above it is exactly the belief this exists to prevent.
 * Started from a ceiling no speed can be under, `min(maxLateralG,
 * carveGripTopG)`, they rise toward it and every iterate is a speed the road
 * genuinely allows.
 *
 * **Four passes, and the count is even on purpose** — M30 Phase 2's QA repair.
 * Two were recorded at 0.85 % under the true fixed point, measured on the
 * shipped schedule at one cornering margin; swept over the margin as well it is
 * 0.85 %, and the sliders the same QA pass made reachable (they moved the
 * wheel and not the brain until now) take it to 2.53 % at *Grip rise shape* 2
 * and 18.2 % with both sliders at their ceilings. Four passes bring those to
 * 0.047 %, 0.45 % and 12.2 %.
 *
 * The parity is not a detail. F4's `maxLateralG` reaches 1.6 and
 * `carveGripTopG` starts at 0.75, so the panel can describe a schedule that
 * *falls* with speed — and a decreasing map does not contract onto the fixed
 * point from one side, it alternates about it. An odd number of passes lands
 * above it there: measured, three passes are above the true allowance on 119 of
 * the 1,680 corners the test sweeps, and two and four on none of them. So the
 * one-sided guarantee this function exists for is a statement about an even
 * number of passes, and `cpuRider.test.ts` sweeps a decreasing schedule to keep
 * it that way.
 *
 * Under is a shade early on the brakes, which is the safe side and the side
 * `corneringMargin` is already on. A flat schedule — `carveGripTopG` dragged to
 * `maxLateralG` on F4 — converges on the first pass, so today's arithmetic is
 * reproduced outright however many follow.
 *
 * `t` is the live schedule the brain was handed, never the frozen table: F4
 * moves both anchors of this curve and a corner allowance that did not move
 * with them was Phase 2's second QA finding.
 */
export function speedAtLateralLimit(
  k: number,
  perG: number,
  t: LateralCeilingTuning,
): number {
  const floor = Math.min(t.maxLateralG, t.carveGripTopG);
  let v = k * Math.sqrt(floor * perG);
  for (let pass = 0; pass < 3; pass += 1) v = k * Math.sqrt(lateralCeilingG(v, t) * perG);
  return k * Math.sqrt(lateralCeilingG(v, t) * perG);
}
/** The closest the aim point may be pulled in while avoiding, metres. */
const MIN_AIM_METRES = 4;
/** How far ahead of the wheel a blocker has to end to still be in the way, metres. */
const BEHIND_MARGIN = 1;
/** How much route past a blocker counts as the same gate to thread, metres. */
const GATE_SPAN_METRES = 12;
/** The least distance up the line blockers are looked for, metres. */
const GATE_LOOK_METRES = 25;
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
/** How near either end of a closed spine a cursor asks the other end, metres. */
const SEAM_WINDOW_METRES = 40;
/** How much nearer the other end's answer must be to re-seat a cursor, metres. */
const SEAM_PREFERENCE_METRES = 0.5;
/**
 * A cursor moving further than this along the route in one step has jumped
 * — a fold's other arm, or a genuine cut across one — and is adjudicated by
 * facing, metres. Well above what a wheel covers in a step at any speed.
 */
const CURSOR_JUMP_METRES = 10;
/** An aim point this close to a ring's centreline is on that ring, metres. */
const STREET_AIM_ON_RING_METRES = 0.5;
/**
 * The tightest arc his course is carried forward on, 1/m — a guard against a
 * respawn's heading step reading as a turn rate, far above any bend ridden.
 */
const COURSE_MAX_BEND = 0.25;
/** The slowest a swerve may ask him to go, m/s. Below this he is stopping. */
const SWERVE_SPEED_FLOOR = 5;
/**
 * Below this speed the hold-speed feedforward is fully off, m/s — see the
 * throttle law. 18 m/s (~40 mph) is the bottom of the over-speed band, and
 * the choice is not aesthetic: everything below it — wedge walks, swerves,
 * detours, and the *approach* runs of the §4.2 adversarial scenarios, which
 * top out around 17 — replays bit-for-bit the proportional-only trajectories
 * those scenarios were tuned against. A first draft that faded in at 12 m/s
 * changed the wall-camp cop's arrival by a fraction of a metre per second and
 * the wedge dance downstream of it never converged. There is no dead zone
 * left above the gate either: the proportional term alone saturates the
 * throttle until ~20 m/s, so the feedforward only ever matters exactly where
 * the droop it cures did — the last two metres per second of a cruise.
 */
const CRUISE_FEEDFORWARD_FROM = 18;
/** And it fades in over this many m/s above that, rather than stepping. */
const CRUISE_FEEDFORWARD_FADE = 2;
/** The first detour's commitment, metres of travel. */
const DETOUR_SPAN_BASE_METRES = 7;
/**
 * The longest a single detour commits to, metres. Past this the walk stops
 * widening: an obstacle bigger than this on both sides is not something the
 * generator builds, and a cop forty metres out is visibly working the problem
 * rather than parked, which is the defect's actual content.
 */
const DETOUR_SPAN_MAX_METRES = 48;
/** How far ahead of the wheel the detour's aim point is held, metres. */
const DETOUR_AIM_METRES = 8;
/** The fastest a detour rides, m/s. Feeling along a wall, not chasing. */
/**
 * The least speed the strike stand-off may hold a cop to while his quarry is
 * outside his swing cone, m/s — M26 Phase 3.
 *
 * Walking pace: enough travel for the shared controller to give him yaw, and
 * slow enough that circling back to face somebody reads as circling rather
 * than as a second charge. `DETOUR_SPEED` and `FLANK_PROBE_SPEED` are the same
 * device — a floor under one constraint so a cop can keep manoeuvring — and
 * this is the third of them.
 */
const TURN_TO_FACE_SPEED = 2;

const DETOUR_SPEED = 8;
/** A flank's straight-at-them legs stay below the obstacle crash speed. */
const FLANK_PROBE_SPEED = EUC.obstacleCrashSpeed * 0.7;
/** How much short of the swing's full envelope the led-swing floor sits, metres: the head must be *through* him. */
const STRIKE_ENVELOPE_MARGIN = 0.25;
/** Inside this range a swing is thrown at a rider beside him, not only ahead, metres... */
const CLOSE_SWING_METRES = 1.6;
/** ...within this of his nose, radians (the arc's measured reach at arm's length is ±105°). */
const CLOSE_SWING_CONE_RADIANS = 1.8;
/** Closer than this the paddle passes outside him: the strike pass backs off first, metres. */
const NAV_ATTACK_TOO_CLOSE = 1.0;
/** How far the back-off opens the range, metres. */
const NAV_ATTACK_BACK_OFF_METRES = 4;
/** The bearings the back-off tries, radians off straight away from him, nearest first. */
const BACK_OFF_TURNS: readonly number[] = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
/**
 * The pace a path allows past a wall's edge (a cell beside a solid), m/s:
 * under the wheel's own obstacle crash speed, so a post or a face brushed on
 * the way in is a scrape (the wall standoff) and never a ragdoll.
 */
const NAV_TIGHT_SPEED = EUC.obstacleCrashSpeed * 0.9;
/** How far along the path the tight-passage pace is looked for, metres. */
const NAV_TIGHT_LOOK_METRES = 20;
/** The close-quarters search's hysteresis: disengaged only past this share of `navRangeMetres`... */
const NAV_RANGE_EXIT_SHARE = 1.3;
/** ...or once the quarry is moving faster than this share of `navSlowQuarrySpeed` (and on the road). */
const NAV_SLOW_EXIT_SHARE = 1.5;
/** How often the search runs while it has the wheel, seconds (four times a second). */
const NAV_REPLAN_SECONDS = 0.25;
/**
 * The most cells one step of a search expands, per brain: a plaza's search
 * finishes in one step (a few hundred cells), a long detour round a block is
 * spread over a handful, and no fixed step pays for a whole search.
 */
const NAV_STEP_EXPANSIONS = 500;
/** A quarry who has moved this far from the last search's goal is searched for again at once, metres. */
const NAV_GOAL_MOVE_METRES = 1.5;
/** A corner this near is passed, metres, or this many seconds of his travel ahead. */
const NAV_SWITCH_METRES = 1.5;
const NAV_SWITCH_SECONDS = 0.3;
/** The first metres of a sight line from the wheel are not asked (it may stand in a wall's clearance). */
const NAV_LOS_SKIP_METRES = 0.75;
/** Wider than this off the leg he rides, the path is searched again, metres. */
const NAV_OFF_PATH_METRES = 3.5;
/** Corners further along the path than this do not bound his pace yet, metres. */
const NAV_CORNER_LOOK_METRES = 45;
/** A turn gentler than this is no corner, radians. */
const NAV_CORNER_MIN_TURN = 0.12;
/** The slowest a path corner asks for, m/s: a turn, not a stop. */
const NAV_CORNER_FLOOR = 2.5;
/** Within this much path of a quarry in sight, the strike pass begins, metres. */
const NAV_ATTACK_METRES = 9;
/** Only a quarry slower than this is struck in passing; a moving one is matched, m/s. */
const NAV_ATTACK_SLOW_SPEED = 2.5;
/** How far past a standing quarry the pass aims when the ground is open, metres. */
const NAV_ATTACK_THROUGH_METRES = 4;
/** The pass stops this short of whatever ends the open ground past him, metres. */
const NAV_ATTACK_STOP_ROOM = 1.2;
/** Packmates the search weighs, two points each (his body and his way in). */
const NAV_MAX_REPEL = 6;
/** A packmate this much nearer the quarry is ahead of him on the way in, metres. */
const NAV_REPEL_LEAD_METRES = 2;
/** How far round a packmate the ground costs more, metres, and how much (tenths of a cell a cell). */
const NAV_REPEL_METRES = 6;
const NAV_REPEL_COST = 30;
/** The furthest a side is felt before a slide commits to it, metres. */
const DETOUR_SIDE_PROBE_MAX_METRES = 12;
/** A slide needs at least this much room on one side or it is not thrown, metres. */
const DETOUR_MIN_ROOM_METRES = 3;
/** How far up a slide the road's furniture is felt for, metres. */
const DETOUR_PROBE_METRES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** A blocker this close around the wheel is the face it is sliding along, metres. */
const DETOUR_OWN_FACE_METRES = 0.3;
/** Within this of the slide's direction the detour opens up to full speed. */
const DETOUR_ALIGN_RADIANS = 0.5;
/** Free direct riding for this long retires the flank, softly. */
const FLANK_FREE_SECONDS = 3;
/** Inside this range, with a clear line, the aim is the rider not the road. */
const CLOSE_PURSUIT_METRES = 12;
/**
 * How near along the *route* a rider must be for close-quarters reasoning
 * — the straight-at-them pursuit, a slide's end, the orbit detector — to
 * apply, metres (Codex's M31 QA). A rider six metres away in plan across a
 * hairpin's inner wall is forty metres away by road: aimed at straight, at
 * 17 m/s, the wall is where he ends up. Wider than any wall a §4.2 camp
 * puts between the two of them on one stretch, narrower than a fold.
 */
const CLOSE_PURSUIT_ROUTE_METRES = 30;
/** How fast a quarry must be moving for its motion to serve as a facing, m/s. */
const QUARRY_FACING_SPEED = 2;
/** How finely a line between two points is tested against the walls, metres. */
const LINE_CLEAR_STEP_METRES = 1.5;
/** Ends within this of each other count as equally near the line, metres. */
const END_AROUND_TIE_METRES = 0.5;
/**
 * How far the quarry has to move off the spot the cop was wedged against
 * before the flank is abandoned for ordinary pursuit, metres. Generous on
 * purpose: shuffling behind the wall must not reset the widening walk, or
 * wiggling in cover becomes the new exploit.
 */
const FLANK_QUARRY_MOVE_METRES = 12;
/** Below this the wheel is going nowhere, m/s. */
const STUCK_SPEED = 0.6;
/** How long it may go nowhere before the brain backs it out, seconds. */
const STUCK_SECONDS = 1.4;
/** How long it backs out for, seconds. */
const STUCK_REVERSE_SECONDS = 1.0;
/**
 * How long a spin escape's launch may wait to leave the ground before the
 * pending air-tap is dropped, seconds — M24. Longer than the hop compression,
 * far shorter than anything that could re-arm by accident.
 */
const SPIN_TAP_TIMEOUT_SECONDS = 1.0;
/**
 * Dwell between spin escapes, seconds — M24. Long enough that a cop still
 * wedged after one spin rides the ordinary ladder (reverse, detour, flank)
 * before trying another, so the trick reads as a recovery rather than a tic.
 */
const SPIN_ESCAPE_COOLDOWN_SECONDS = 5;
/**
 * How long a landed spin escape commits to the throttle, seconds — M24.
 *
 * Long enough to actually travel the flank leg the tap armed: at 1.6 s the
 * blocker caps re-parked him two metres into every leg and the siege cycled
 * — spin, creep, park, spin — at the same wall face forever. Three and a
 * half seconds is ten-plus metres of committed riding, which is past the end
 * of any wall the detour ladder is mid-way through walking around.
 */
const SPIN_RIDE_OUT_SECONDS = 3.5;
/**
 * Wedge re-arms this close together belong to the same siege, metres — M24.
 * Wider than the reverse crawl's whole excursion, far narrower than any real
 * change of scenery.
 */
const WEDGE_SAME_SPOT_METRES = 8;
/**
 * A wobble is worth this much swerve and no more, metres — the chase pass.
 * When the walls alone leave a line on the road this much nearer where he is
 * than the line that also dodges every spill, he takes the nearer one.
 */
const SOFT_SWERVE_WORTH_METRES = 2.0;
/** Seconds of close pursuit with no new closest range before the flank arms. */
const NO_PROGRESS_SECONDS = 4;
/** Inside this range a standing quarry that is not getting nearer is a siege, metres. */
const NO_PROGRESS_RANGE_METRES = 40;
/**
 * How close the rider must be for a wedge or an orbit to arm a flank at all,
 * metres. Further than this, a wedge is road furniture and the road pursuit
 * owns the escape (see `beginDetour`).
 */
const FLANK_RANGE_METRES = 40;
/** The room a landing keeps from anything on the line, each side and ahead, metres. */
const LANDING_ROOM_METRES = 1.0;
/**
 * How far up the line a landing is judged, metres: a stop from the cutout
 * ceiling under the honest brake and its safety is 54 m, so nothing beyond
 * this can bind the entry speed.
 */
const LANDING_LOOK_METRES = 60;
/** A closest range has to improve by this much to count as progress, metres. */
const NO_PROGRESS_GAIN_METRES = 1.0;
/** Only a quarry slower than this is being besieged rather than chased, m/s. */
const NO_PROGRESS_QUARRY_SPEED = 1.5;
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

