/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { ParkSignWord } from '../data/markings.ts';
import { CHALLENGE, TRACK_DAY } from '../data/tuning.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { resolveVenueLook, type VenueLook } from '../data/venueLook.ts';
import { buildLevelPlan, type CheckpointSpec } from './buildPlan.ts';
import {
  blockExclusions,
  hillsideBlocks,
  plantForest,
  propExclusions,
  railProps,
  type HillsideSpan,
  type RailRun,
  type SunBearing,
} from './parkDressing.ts';
import { innerFences, type FencedBend, type InnerFence } from './parkFencing.ts';
import { parkSignage, type ParkSignage, type SignedFeature } from './parkSignage.ts';
import { turnArrowPadsBySegment, turnArrowsBySegment, type TurnArrow } from './parkTurnArrows.ts';
import {
  deck,
  lip,
  stairs,
  steppedDecks,
  type DeckReport,
  type LipReport,
  type StairsReport,
  type SteppedDecksReport,
} from './parkFeatures.ts';
import type { LevelPlan } from './plan.ts';
import {
  centrelineAt,
  placeChain,
  type PlacedProp,
  type PlacedSegment,
  type SegmentBlock,
  type SegmentProp,
  type SegmentSpec,
  type SurfaceBand,
} from './segments.ts';
import { curvatureOf, lengthOf, solveLoop, type LoopElement } from './trackLevel.ts';

/**
 * Switchback Park — the venue, and the fifth producer of a `LevelPlan`.
 *
 * `docs/PLANS.md` §36 asks for a technical jump lap on a forested hillside:
 * a lap that descends technically and climbs easily, whose every feature has a
 * rolling bypass, and which a rider can complete without hopping, spinning or
 * using one foot. This is Phase 1's **graybox** of it — the line and the
 * ground, with representative versions of every feature class and no dressing
 * at all. Phase 2 completes the catalogue; Phase 4 dresses it.
 *
 * Nothing in this file may import three.js (invariant 1), and it emits a
 * `LevelPlan` like the four producers before it (invariant 2). Nothing
 * anywhere branches on which venue is loaded.
 *
 * ## The five principles this layout is built on
 *
 * **1 — the ride-around IS the closed main chain, and every technical line is
 * the other lateral half of its own corridor.** There are no
 * `SegmentBranch`es here. §36.2 item 7 records the lap referee's topology
 * limit: `LapEnvelope` is horizontal, samples the main chain alone, and cannot
 * tell two stacked paths apart. So rather than ask it to judge branches, every
 * feature stands on the rider's **LEFT** half of a corridor the referee already
 * covers, and the plain right half is the bypass. A rider on either half is
 * inside the same envelope, and Track Day and Race referee this venue with no
 * change of any kind. `FEATURE_LATERAL_CLEAR` and the corridor edge are the two
 * bounds that keep it true, and `switchbackLevel.test.ts` measures every block
 * against both.
 *
 * **2 — launches are faces, not folds.** §36.2 item 3: the controller leaves
 * the ground only when the sampled fall beats the slope's own prediction by
 * `TERRAIN.dropLaunchThreshold` (0.05 m). A *level block ending over lower
 * ground* does that every time; a *fold between two gradients* does not — its
 * shortfall is one step's length times the fold angle, which is phase- and
 * speed-dependent and therefore not something to build a jump on. Every jump
 * here is a `parkFeatures` block with a measured `dropAtLip` or `exitDrop`, and
 * every socket join on the bypass half is held under `MAX_SOCKET_FOLD` so a
 * rider who takes no feature is never thrown by the geometry between them.
 *
 * **3 — every catch ground leads out.** A rider who lands short in the gap,
 * falls off the skinny, or misses a step lands on rideable ground with nothing
 * taller than the wheel's own step-up ahead of them
 * (`WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor`, 0.216 m). The gap's landing
 * deck is the case that has to be *authored* rather than asserted: its
 * `stepDown` is chosen so deck B's entry face is 0.135 m, which a rider who
 * dropped into the gap can simply ride up. Phase 2 measured that face on the
 * installed geometry and found 0.185 m was not low enough — a rider who lands
 * at its foot meets it while still absorbing the touchdown — so "under the
 * step-up limit" is necessary and was not sufficient, and the number moved.
 *
 * **4 — the hillside is real ground, not an embankment.** Every world before
 * this one sits in a level field, and a shoulder that eases a fifteen-metre
 * trail down to a flat surround builds a cone of the builder's own making.
 * `switchbackGroundAt` is the hill: a Gaussian-weighted mean of the trail's own
 * heights, faded to the surround over thirty metres, handed to
 * `BuildOptions.groundAt`. The trail is then cut *into* it, and the test
 * measures that no point of the lap runs more than `GROUND_HONESTY_METRES`
 * above or below the ground beside it.
 *
 * **5 — height closes by a solve, exactly as plan does.** BelVar closes its
 * ring in XZ with two solved straights (`solveLoop`); this closes in Y as well,
 * because a lap down a hill has to come home at the height it left. Every
 * climb-leg element carries `climbShare`, and its climb is its share of
 * whatever the descent spent — so the ring is closed in height *by
 * construction*, and moving any drop re-derives the climb instead of leaving
 * the summit a metre out.
 *
 * ## What the layout is
 *
 * A summit apron, a zig-zag descent down one side of the hill in five
 * switchbacks, and a fire road that climbs back up the other side. The eight
 * beats of §36.3 map onto it directly:
 *
 * | Beat | Corridors |
 * |---|---|
 * | 1 Trailhead | `apron`, `entrance` |
 * | 2 First terrace | `terrace-drop`, `terrace-turn` |
 * | 3 Timber line | `timber`, `timber-steps`, `timber-turn` |
 * | 4 Rock rhythm | `rock-rhythm`, `rhythm-turn` |
 * | 5 Kicker clearing | `kicker-approach`, `kicker-rise`, `kicker-lip`, `kicker-table`, `kicker-brow`, `kicker-landing`, `kicker-flare`, `kicker-runout` |
 * | 6 Spin shelf | `clearing-turn`, `shelf-in`, `shelf-pad`, `shelf-turn`, `shelf-out` |
 * | 7 Fire-road climb | `bottom`, `bottom-turn`, `fire-road-1`, `crest-up`, `crest-down`, `fire-road-2` |
 * | 8 Summit return | `summit-turn`, `summit-return` |
 *
 * **The compass, honestly.** The apron runs **west** along the summit, the
 * descent occupies the **west** half of the site and the fire road returns up
 * its **east** edge — which is three of the four spatial claims in the brief.
 * The fourth cannot be had: the descent marches *north* as it switches back and
 * the fire road therefore runs *south* before turning west onto the apron, and
 * no rotation of a ring whose turns are fixed can put a north-climbing return
 * east of a south-marching descent. The directions are recorded here rather
 * than quietly rotated, because a comment claiming a compass the geometry does
 * not have is worse than either.
 *
 * ## Flat is not available here, and that is the point
 *
 * BelVar is flat on purpose — it is a kart circuit and banking would remove the
 * lean it exists to show. This is its opposite: the whole venue is 14.2 m of
 * elevation, spent in nine measured features and recovered on one 6.5% road.
 * The descent's steepest corridor is the kicker's landing hill at 30%, which is
 * the face the big jump comes down on and the bypass rolls; nothing else passes
 * 12.5%, and nothing but the two folds either side of that face passes 10%.
 *
 * ## What Phase 2 changed, and why every one of them is a measurement
 *
 * Phase 1's geometry was a graybox and Phase 2 measured it on the built plan
 * (`docs/JUMP_BENCH.md` T11–T15, `src/bench/installedPark.ts`). Five things
 * moved, and each is named where it lives:
 *
 *   1. **The kicker got a table.** A lip at the head of a 12.5% face landed a
 *      hopped rider heavy at every speed on both presets; a level table lands
 *      every one of them clean. `kicker-lip` and `kicker-table`. (The owner's
 *      first rides then asked for a big jump, and beat 5 was rebuilt around a
 *      landing hill — see the loop's own comment; the table survives at twelve
 *      metres as the catch for every hop under 44 mph.)
 *   2. **The gap's landing deck dropped five centimetres**, because 0.185 m
 *      bonked a short landing at 21–26 mph and 0.135 m does not.
 *   3. **The spin shelf became a flush deck with a 0.15 m roll-off onto the
 *      level pad**, because 0.41 m put every hopped 180 in the heavy tier.
 *   4. **Two metres moved from `crest-up` to `crest-down`**, because a hop off
 *      the crest at 25 mph and up used to land on ground that had started
 *      climbing again.
 *   5. **The ledge moved two metres uphill and the gap two metres with it**, so
 *      a hopped ledge does not come down on the gap's leading edge and the
 *      gap's exit has five metres of run-out instead of three.
 *
 * None of them changed the lap's length, its descent, its derived climb grade
 * or any tuning constant. `kicker-runout` and `shelf-out` give back the height
 * the two new pitches spend, and `bottom` absorbs the thirty-two metres beat 5
 * gained.
 */

// ---------------------------------------------------------------------------
// The park's dimensions
// ---------------------------------------------------------------------------

/** The venue's name, and the only place it is spelled. */
export const PARK_NAME = 'Switchback Park';

/**
 * The numbers every corridor and every feature is measured against, in metres.
 *
 * Several of these are knife edges rather than tastes, and each says which.
 */
export const PARK = Object.freeze({
  /**
   * Least daylight between a feature block's inner edge and the centreline.
   *
   * **Principle 1's other half.** The bypass is the right half of the corridor,
   * and a rider taking it rides the centreline or outside it — so a feature
   * that crept across `t = 0` would put a 0.5 m wooden face in the middle of
   * the road a rider was told they could roll down. Three quarters of a metre
   * is a wheel and a half of daylight at the closest any block comes.
   */
  featureClear: 0.75,
  /**
   * The lateral centre of a wide feature on an eight-metre corridor, and its
   * half-width.
   *
   * Authored as a pair because they are one decision: the inner edge lands on
   * 1.0 m and the outer on 7.5 m, which is `featureClear` with margin at one
   * end and half a metre inside the corridor at the other. Both numbers are
   * exact in binary, so the edges do not land a rounding error the wrong side
   * of a bound the test checks with `>=`.
   */
  wideT: 4.25,
  wideHalf: 3.25,
  /** The skinny's centre and half-width: a 0.9 m plank, §36.4's own figure. */
  skinnyT: 4.25,
  skinnyHalf: 0.45,
  /** The same pair for the nine-metre kicker corridor: edges at 0.9 and 8.1. */
  kickerT: 4.5,
  kickerHalf: 3.6,
  /** And for the seven-metre shelf: edges at 1.0 and 6.5. */
  shelfT: 3.75,
  shelfHalf: 2.75,
  /** And for the six-metre fire road crest: edges at 1.0 and 6.0. */
  crestT: 3.5,
  crestHalf: 2.5,
  /**
   * How far the bypass arrow travels across the trail, metres.
   *
   * The mark is a lane change, and on this venue the lane it changes into is
   * the whole free half of every corridor — so the arrow only has to *be* a
   * diagonal, not cross the trail to prove it. A metre and a half of travel
   * over seven of run is a 13° sweep, which reads as a sweep and keeps the
   * boardwalk under it to a strip beside the bypass line.
   */
  bypassArrowAcross: 1.6,
  /** Distance along `apron` to the start/finish line. */
  lineAt: 62,
  /**
   * Distance along `apron` where the rider spawns.
   *
   * **Zero, because the builder's spawn *is* the chain's first socket.**
   * `buildLevelPlan` lays the graph from `options.spawn` and emits that same
   * pose as `plan.spawn`, so a venue cannot start its rider six metres down its
   * own first corridor without moving the corridor. BelVar takes the identical
   * shape — its rider begins at the main straight's entry, seventy metres short
   * of the line — and the number this was reaching for is the out-lap, which
   * here is the full sixty-two metres to the line: three and a half times
   * `CHALLENGE.startRunupMetres`, the shortest run-up the referee considers
   * fair anywhere. The four-seat grid is laid out behind the *line* rather than
   * behind the spawn and lands at 55.6 m and 58.8 m along the apron, with the
   * whole of it on level pavement.
   */
  spawnAt: 0,
  /** How wide a gravel band runs down each edge of the fire road. */
  gravelBand: 2,
  /**
   * Every corridor's shoulder, metres.
   *
   * **Twelve rather than the library's seven, and it is the hillside asking.**
   * `switchbackGroundAt` puts real ground beside the trail, and the shoulder is
   * the width over which the corridor's own height eases into it. Seven metres
   * against a hill that can be two metres higher than the road is a bank steep
   * enough to read as a wall; twelve is a cutting a rider can ride out of,
   * which is what "go anywhere" requires of a trail cut into a slope.
   */
  shoulder: 12,
});

/**
 * The steepest gradient discontinuity any socket join on the lap may carry,
 * radians — principle 2's bypass guarantee, as a number.
 *
 * **Derived from the launch rule, not chosen.** A fold's shortfall against the
 * previous surface's prediction is one step's travel times the fold angle. At
 * the M20 cutout's own speed — a shade under 29 m/s, which is the fastest
 * anything reaches here — a 120 Hz step covers 0.242 m, so a fold of 0.18 rad
 * costs 0.0435 m against `TERRAIN.dropLaunchThreshold`'s 0.05 m and cannot
 * launch at any speed or any phase. The lap's largest is the kicker crest at
 * 0.125 rad, which is exactly the fold the kicker's *bypass* half rolls while
 * the lip beside it throws.
 */
export const MAX_SOCKET_FOLD = 0.18;

/** How far the trail may sit above or below the hillside beside it, metres. */
export const GROUND_HONESTY_METRES = 2.5;

/**
 * Off-course hillside that must be left between two stretches of trail that
 * are not neighbours, metres — over and above what the referee can reach.
 *
 * **Phase 6's finding, as a number.** Two corridors far apart along the lap are
 * only far apart to a *rider* if the ground between them is off-course: the
 * referee's verdict is `LapEnvelope.contains`, whose reach is a half-width plus
 * `TRACK_DAY.offCourseMarginMetres`, and its test is inclusive. So two
 * envelopes that merely touch leave a legal bridge of zero width, and a rider
 * who walks across it has skipped whatever lies between the two — with no
 * off-course step to void the lap and nothing else to notice. A real gap is
 * what makes a cut fail, and half a metre is two 120 Hz steps at the fastest
 * anything travels here and eight at the speed this corner is taken — and a
 * single off-course step is all `TrackDayRun` needs.
 *
 * Half a metre is the *floor*, not the venue's own figure: nothing here stands
 * nearer than a full metre clear of its own reach, which is `shelf-turn`'s
 * documented "over the separation floor by a metre" and now the clearing
 * hairpin's too.
 */
export const SEPARATION_CLEAR_METRES = 0.5;

/**
 * How far apart two corridors' centrelines must be, metres — the bound §36.3's
 * "adjacent switchbacks cannot steal each other's projection" states.
 *
 * Stated against the referee's own reach rather than a bare metre count, so
 * that a future change to `TRACK_DAY.offCourseMarginMetres` moves the layout's
 * floor with it instead of leaving a number here that used to be right.
 */
export function separationFloor(halfWidthA: number, halfWidthB: number): number {
  return halfWidthA + halfWidthB + 2 * TRACK_DAY.offCourseMarginMetres + SEPARATION_CLEAR_METRES;
}

/**
 * How far apart along the lap two stretches of trail have to be before
 * `separationFloor` applies to them, metres.
 *
 * Corridors that follow each other round a bend are *meant* to be close — that
 * is what a bend is — so the floor is about pairs a rider could cut between
 * and gain something by it. Forty metres is a little over the shortest hairpin
 * arc on the venue (`shelf-turn`'s 31.4 m), so a hairpin's own two legs come
 * under the floor a few metres back from the bend rather than at the apex —
 * they are held there by the dedicated hairpin test above as well — and the
 * two cuts Phase 6 rode, 204 m and 111 m of lap skipped, are far inside it.
 */
export const SEPARATION_LAP_GAP_METRES = 40;

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * One element of the lap: BelVar's `LoopElement` plus what a hillside needs.
 *
 * The plan half is identical and is solved by the identical code — `solveLoop`,
 * `curvatureOf` and `lengthOf` are imported from `trackLevel.ts` rather than
 * copied, so a circuit and a trail close their rings by one piece of
 * arithmetic. What is added is the elevation half, which BelVar has no use for
 * because BelVar is flat.
 */
export interface SwitchbackElement extends LoopElement {
  readonly halfWidth: number;
  readonly surface: SurfaceId;
  /** Elevation change over the element, metres. Absent on a `climbShare` leg. */
  readonly climb?: number;
  /** Linear rather than eased. See `SegmentSpec.linearClimb`. */
  readonly linearClimb?: true;
  /**
   * This leg carries its share of the climb back to the summit.
   *
   * Principle 5. Every one of these gets `-(sum of every authored climb) ×
   * (its length / the total climbShare length)`, so they all share one mean
   * grade and the ring closes in height however the descent is edited.
   */
  readonly climbShare?: true;
  readonly bands?: readonly SurfaceBand[];
}

/** The gravel margins of the fire road, as bands on a six-metre corridor. */
const FIRE_ROAD_BANDS: readonly SurfaceBand[] = [
  { from: -6, to: -6 + PARK.gravelBand, surface: 'gravel' },
  { from: 6 - PARK.gravelBand, to: 6, surface: 'gravel' },
];

/**
 * The lap, in riding order from the summit apron.
 *
 * **The turns sum to exactly +360°** — five left-hand corners against three
 * right, an anticlockwise lap — which is what makes the ring a lap and not a
 * spiral. Positive is the rider's LEFT (`segments.ts`), so this is the mirror
 * of BelVar's sign and nothing else about it is different.
 *
 * **The two `solve: true` straights are `bottom` and `fire-road-1`**, whose
 * headings are exactly 90° apart — the best-conditioned pair the ring offers,
 * and the one place where a millimetre of closure costs a millimetre of
 * straight rather than tens of metres. They come out at 67.0 m and 74.0 m.
 *
 * **The descent's grades are authored and the climb's is derived.** Every
 * descending straight carries a linear climb at a round percentage, because a
 * linear ramp reports its true gradient at both sockets and is therefore the
 * only kind a feature can be measured against: `parkFeatures` computes a
 * deck's drop from the corridor's own fall under it, and an eased profile's
 * fall is not a grade, it is a curve. Every *turn* is eased, so the corners are
 * flat at both sockets and the folds live only where two straights meet.
 */
export const SWITCHBACK_LOOP: readonly SwitchbackElement[] = [
  // -- Beat 1, the trailhead ------------------------------------------------
  // Level pavement at the top of the hill: the start/finish line, the grid, the
  // out-lap and the braking room after the climb, all on one flat apron. It is
  // the only pavement on the venue and the only corridor with no gradient at
  // all, which is what the four-seat grid's same-surface, same-height test
  // needs and what makes it read as the one built thing in a forest.
  { id: 'apron', straight: 80, halfWidth: 9, surface: 'pavement', climb: 0 },
  { id: 'entrance', radius: 20, turn: 90, halfWidth: 8, surface: 'dirt', climb: -0.6 },

  // -- Beat 2, the first terrace -------------------------------------------
  // The gentlest features first: one marked ledge and one straight gap, both
  // with the right half of the road rolling straight past them.
  {
    id: 'terrace-drop',
    straight: 44,
    halfWidth: 8,
    surface: 'dirt',
    climb: -1.54,
    linearClimb: true,
  },
  { id: 'terrace-turn', radius: 16, turn: 90, halfWidth: 8, surface: 'dirt', climb: -0.6 },

  // -- Beat 3, the timber line ---------------------------------------------
  // A 0.9 m plank across the corridor's fall, then a charged step-up, then the
  // down staircase. The whole beat is precision with a recoverable miss: every
  // catch here is the corridor itself.
  { id: 'timber', straight: 46, halfWidth: 8, surface: 'dirt', climb: -1.38, linearClimb: true },
  {
    id: 'timber-steps',
    straight: 9,
    halfWidth: 8,
    surface: 'dirt',
    // Ten per cent, which is the slice's own alley: three 0.30 m treads need
    // the corridor beneath them to fall 0.30 m per tread or the treads bury
    // themselves, and `parkFeatures.stairs` throws rather than sink one.
    climb: -0.90,
    linearClimb: true,
  },
  { id: 'timber-turn', radius: 16, turn: -180, halfWidth: 8, surface: 'dirt', climb: -0.8 },

  // -- Beat 4, the rock rhythm ---------------------------------------------
  // Three 0.30 m drops in a row with ten metres between them: brake, settle,
  // re-aim, go again. §36.3's "spend height in a learned rhythm".
  {
    id: 'rock-rhythm',
    straight: 52,
    halfWidth: 8,
    surface: 'dirt',
    climb: -1.82,
    linearClimb: true,
  },
  { id: 'rhythm-turn', radius: 16, turn: 180, halfWidth: 8, surface: 'dirt', climb: -0.7 },

  // -- Beat 5, the kicker clearing -----------------------------------------
  // The descent's commitment beat, and the one place the corridor itself is the
  // feature: an eased rise whose crest is flat, a shallow pitch
  // carrying a level take-off block, a short level table, and then a LANDING
  // HILL — the ground steps away under the flight through a 12.5% brow onto a
  // 30% face, and flares back out at 12.5% before the run-out. A rider who
  // takes the right half rolls the whole of it (every fold held under
  // `MAX_SOCKET_FOLD`) and a rider who takes the left leaves the lip.
  //
  // **This is the big one, and it was rebuilt on the owner's first rides
  // (2026-09-12: "a lot of the jumps are tame ... add at least a big one").**
  // The shipped physics leaves exactly three levers — speed at the lip, the
  // face, and a LOWER landing — and the measured fact the shape is built on is
  // `EucController.land`'s impact term: the closing speed along the *surface
  // normal*, so a face that is already running away from the rider takes the
  // horizontal speed off the hit. A flight that comes down at eight metres a
  // second is a wobble on the flat, heavy on 12.5%, and clean on 30% at 45 mph.
  // What no landing can absorb is a flight that has fallen further than the
  // face beneath it — Phase 1's lip at the head of the old 12.5% descent was
  // exactly that — so the table stays, at twelve metres: it is where a hop
  // under 44 mph comes down, and it holds the trajectory up until the charged
  // fast one is past the brow and meets the 30% face while its own slope is
  // still shallower than the ground's. Measured on the installed park in
  // `docs/JUMP_BENCH.md` T11: every row from 20 to 47 mph, hopped or not,
  // charged or not, lands clean; the fully charged 50 mph row — the sign's
  // speed, and past what the approach can deliver — lands heavy on the face's
  // last metre; nothing on the sweep crashes.
  //
  // **The height is the rise's.** The landing hill spends 5.8 m from the lip;
  // the rise gives back 2.5 of it, the run-out climbs three quarters of a
  // metre, and beat 5 still costs the lap the 3.66 m it always cost over the
  // same 114 m of straight — so the ring, the descent total and the fire road's
  // derived grade are untouched to the last bit of a double.
  {
    id: 'kicker-approach',
    straight: 24,
    halfWidth: 9,
    surface: 'dirt',
    climb: -0.96,
    linearClimb: true,
  },
  // Two and a half metres up over eighteen, eased, so the crest is flat under
  // the block's flush start and the foot is flat against the approach: the
  // bypass rides a hump with no fold at either end and a 20.8% grade at its
  // middle. Eighteen rather than longer because the lip's lap distance is what
  // the kicker's sign is placed against: its pad stands at the mouth of
  // `rhythm-turn`, the last place on the lap a rider looks down a straight at
  // it, and `SWITCHBACK_SIGN_MAX_LEAD` is ninety metres from there. Two and a
  // half rather than three because the hill is a Gaussian mean of the trail
  // (`switchbackGroundAt`) and a three-metre mound stood 2.78 m proud of it at
  // the table's end, past `GROUND_HONESTY_METRES`; the flight is measured from
  // the lip down, so the half metre came off the mound and went onto the
  // run-out's climb. What the approach can still deliver to the lip is T11b's
  // business.
  { id: 'kicker-rise', straight: 18, halfWidth: 9, surface: 'dirt', climb: 2.5 },
  // The take-off pitch: six metres falling 0.15 m under a level block, which is
  // the only way this controller can be given a face at all (§36.2 item 3 — a
  // fold never launches, however steep). The block spans the whole corridor, so
  // its top is flush with the crest at s=0 and its far edge stands exactly
  // `kicker-lip`'s own fall above the table.
  {
    id: 'kicker-lip',
    straight: 6,
    halfWidth: 9,
    surface: 'dirt',
    climb: -0.15,
    linearClimb: true,
  },
  // Twelve, and the bench is why: at eleven the charged 47 mph flight meets the
  // face a metre later and lands heavy; at fourteen it comes down on the brow
  // at sixteen metres and the big line is gone. Every hop under 44 mph lands
  // here or on the brow, clean, exactly as the twenty-six metre table caught
  // them before.
  { id: 'kicker-table', straight: 12, halfWidth: 9, surface: 'dirt', climb: 0 },
  // The brow: the fold the bypass rolls off the table (0.124 rad) and the one
  // onto the face (0.167 rad), both under `MAX_SOCKET_FOLD`, which is why the
  // face cannot start at the table's edge.
  { id: 'kicker-brow', straight: 4, halfWidth: 9, surface: 'dirt', climb: -0.5, linearClimb: true },
  // The landing face: 30% over sixteen metres. Steep enough that a fast charged
  // flight's closing speed along its normal stays under the clean tier, long
  // enough that the fastest lip speed the approach delivers (T11b) is still on
  // it at touchdown. Also the steepest ground on the venue, by a wide margin.
  {
    id: 'kicker-landing',
    straight: 16,
    halfWidth: 9,
    surface: 'dirt',
    climb: -4.8,
    linearClimb: true,
  },
  // And the flare back out, the mirror of the brow.
  { id: 'kicker-flare', straight: 4, halfWidth: 9, surface: 'dirt', climb: -0.5, linearClimb: true },
  // A run-out that climbs three quarters of a metre at 2.5%: what closes beat
  // 5's height budget once the hill has spent it, and ground nobody lands on
  // short of ten miles an hour over the sign. Thirty metres, so the beat is
  // still 114 m of straight and the ring's two solved legs do not move.
  {
    id: 'kicker-runout',
    straight: 30,
    halfWidth: 9,
    surface: 'dirt',
    climb: 0.75,
    linearClimb: true,
  },

  // -- Beat 6, the spin shelf ----------------------------------------------
  // A style choice near the bottom, deliberately away from the fastest
  // airborne line: a low deck onto a broad level pad, then the tightest
  // hairpin on the venue.
  //
  // **R15 and seven metres, and Phase 6's QA bought both.** This corner is the
  // one place on the ring where the descent and the climb pass each other:
  // `fire-road-1` runs up the outside of it from s 20 to s 36, and `bottom`
  // runs along its far side. At Phase 1's R18 × 8 m their centrelines came to
  // 17.0 m and 20.0 m — against the 19.0 m and 20.0 m the two pairs of
  // envelopes reach — so the first pair's envelopes *overlapped by two metres*
  // and the second's were exactly tangent. Both left continuous legal ground
  // between two points 204 m and 111 m apart on the lap: a rider could cross
  // three metres of grass out of this bend onto the fire road, skip a fifth of
  // the ring, and the referee counted the lap. Tightening the arc moves the
  // apex away from `fire-road-1` and narrowing the corridor shortens the
  // envelope's own reach, and it takes both — the arc alone leaves the `bottom`
  // pair tangent, and the width alone leaves the fire road overlapping.
  // `switchbackLevel.test.ts` now states the floor against
  // `TRACK_DAY.offCourseMarginMetres` rather than a bare metre count, so the
  // next edit to this corner is measured against the referee's real reach.
  //
  // Seven is also the beat's own width: `shelf-in` through `shelf-out` are all
  // seven, so the spin shelf is now one corridor width from its mouth to its
  // exit. The metre came off ground nothing was using — this corner carries no
  // blocks, its rail and its signpost stand outside the trail either way, and
  // the widest thing on it is the spin sign's own boardwalk at 6.55 m.
  { id: 'clearing-turn', radius: 15, turn: -180, halfWidth: 7, surface: 'dirt', climb: -0.5 },
  // **1.25%, and the spin shelf chose it.** A signed 180 has to land clean, and
  // a landing's score is the hop's own launch speed plus whatever the take-off
  // stood above the ground it came down on — the same arithmetic the kicker's
  // table is built on. At Phase 1's 3% the twelve-metre shelf rolled off 0.41 m
  // and every hopped 180 landed heavy on both presets. At 1.25% it rolls off
  // 0.15 m onto the level pad and they land clean. The 0.35 m this gives up is
  // taken back by `shelf-out` below, so the descent is unchanged.
  { id: 'shelf-in', straight: 20, halfWidth: 7, surface: 'dirt', climb: -0.25, linearClimb: true },
  { id: 'shelf-pad', straight: 20, halfWidth: 7, surface: 'dirt', climb: 0 },
  // R10 puts its two legs 20 m apart, which is `2 × 7 + 6` — over the
  // separation floor principle 1 sets, by a metre. Worth knowing rather than
  // discovering: the arc's own centre is 10 m from either leg's centreline and
  // the envelope reaches 9.5 m, so the half-metre patch at the middle of this
  // hairpin's infield is the one piece of ground inside the loop that the lap
  // referee calls off-course. It is a patch of hillside nobody can ride to
  // without leaving the trail first.
  { id: 'shelf-turn', radius: 10, turn: 180, halfWidth: 7, surface: 'dirt', climb: -0.3 },
  { id: 'shelf-out', straight: 20, halfWidth: 7, surface: 'dirt', climb: -0.65, linearClimb: true },

  // -- Beat 7, the fire-road climb -----------------------------------------
  // The low point, then the whole climb back. Every leg from here to the apron
  // shares one grade, computed rather than typed.
  { id: 'bottom', straight: 67, solve: true, halfWidth: 7, surface: 'dirt', climb: -0.5 },
  { id: 'bottom-turn', radius: 20, turn: 90, halfWidth: 7, surface: 'dirt', climb: 0 },
  {
    id: 'fire-road-1',
    straight: 74,
    solve: true,
    halfWidth: 6,
    surface: 'dirt',
    bands: FIRE_ROAD_BANDS,
    climbShare: true,
  },
  // Fourteen and fourteen rather than sixteen and twelve: the crest's far side
  // is the ground a hop off it lands on, and Phase 1's ten metres of it ran out
  // under a flight from 25 mph up. The pair still adds to twenty-eight metres,
  // so the ring is untouched.
  { id: 'crest-up', straight: 14, halfWidth: 6, surface: 'dirt', climb: 1.4 },
  { id: 'crest-down', straight: 14, halfWidth: 6, surface: 'dirt', climb: -0.7, linearClimb: true },
  {
    id: 'fire-road-2',
    straight: 50,
    halfWidth: 6,
    surface: 'dirt',
    bands: FIRE_ROAD_BANDS,
    climbShare: true,
  },

  // -- Beat 8, the summit return -------------------------------------------
  { id: 'summit-turn', radius: 28, turn: 90, halfWidth: 6, surface: 'dirt', climbShare: true },
  // Eased, so the join onto the level apron is flat at both ends and a lap
  // begins on ground with no gradient in it at all.
  //
  // **Forty-six rather than Phase 1's forty, and the clearing hairpin bought
  // those six metres.** Tightening `clearing-turn` to R15 shortened the ring,
  // and the closure spent the whole of it on `fire-road-1` — a `climbShare`
  // leg — which would have left the same 13.5 m of descent to be recovered over
  // six metres less road and steepened the climb from 6.49 % to 6.68 %. The
  // climb is the one number §36.3 asks to be *derived from a gradient the slow
  // approach can ride*, and the owner rode it at 6.49 % at gate G1, so the six
  // metres are given back here instead: the climb-share legs still total
  // 207.98 m and `FIRE_ROAD_GRADE` is unchanged to the seventh decimal. What
  // moved is the ring's size, not the road's gradient.
  { id: 'summit-return', straight: 46, halfWidth: 7, surface: 'dirt', climbShare: true },
];

/** The §36.3 beat program, as data, so a test can hold the layout to it. */
export const SWITCHBACK_PROGRAM: readonly {
  readonly beat: number;
  readonly name: string;
  readonly segments: readonly string[];
}[] = [
  { beat: 1, name: 'Trailhead', segments: ['apron', 'entrance'] },
  { beat: 2, name: 'First terrace', segments: ['terrace-drop', 'terrace-turn'] },
  { beat: 3, name: 'Timber line', segments: ['timber', 'timber-steps', 'timber-turn'] },
  { beat: 4, name: 'Rock rhythm', segments: ['rock-rhythm', 'rhythm-turn'] },
  {
    beat: 5,
    name: 'Kicker clearing',
    segments: [
      'kicker-approach', 'kicker-rise', 'kicker-lip', 'kicker-table',
      'kicker-brow', 'kicker-landing', 'kicker-flare', 'kicker-runout',
    ],
  },
  {
    beat: 6,
    name: 'Spin shelf',
    segments: ['clearing-turn', 'shelf-in', 'shelf-pad', 'shelf-turn', 'shelf-out'],
  },
  {
    beat: 7,
    name: 'Fire-road climb',
    segments: ['bottom', 'bottom-turn', 'fire-road-1', 'crest-up', 'crest-down', 'fire-road-2'],
  },
  { beat: 8, name: 'Summit return', segments: ['summit-turn', 'summit-return'] },
];

const SOLVED = solveLoop(SWITCHBACK_LOOP);

/** One element of the lap with every derived number resolved. */
export interface SwitchbackSegment {
  readonly id: string;
  readonly length: number;
  readonly curvature: number;
  readonly turn: number;
  readonly radius: number;
  readonly halfWidth: number;
  readonly surface: SurfaceId;
  /** Metres gained (positive) or lost over the element. */
  readonly climb: number;
  readonly linearClimb: boolean;
  readonly bands?: readonly SurfaceBand[];
}

/**
 * Every element with its final length, curvature and climb — the lap as
 * geometry, and principle 5's arithmetic in one place.
 *
 * The descent is added up first; whatever it spent is then divided among the
 * `climbShare` legs in proportion to their lengths, which gives them all one
 * mean grade and closes the ring in height to the last bit of a double. Edit
 * any drop above and the climb re-derives; there is no number to keep in step.
 */
export const SWITCHBACK_GEOMETRY: readonly SwitchbackSegment[] = (() => {
  const lengths = SWITCHBACK_LOOP.map((element) => lengthOf(element, SOLVED));
  let authored = 0;
  let shareLength = 0;
  SWITCHBACK_LOOP.forEach((element, index) => {
    if (element.climbShare === true) shareLength += lengths[index];
    else authored += element.climb ?? 0;
  });
  if (shareLength <= 0) throw new Error('the lap has no climb-share leg to come home on');

  return SWITCHBACK_LOOP.map((element, index) => ({
    id: element.id,
    length: lengths[index],
    curvature: curvatureOf(element),
    turn: element.turn ?? 0,
    radius: element.radius ?? 0,
    halfWidth: element.halfWidth,
    surface: element.surface,
    climb: element.climbShare === true
      ? -authored * (lengths[index] / shareLength)
      : element.climb ?? 0,
    linearClimb: element.linearClimb === true,
    ...(element.bands === undefined ? {} : { bands: element.bands }),
  }));
})();

/** Total centreline length of one lap, metres. */
export const SWITCHBACK_LAP_METRES = SWITCHBACK_GEOMETRY
  .reduce((total, element) => total + element.length, 0);

/** Distance along the lap to the entry socket of each segment, metres. */
export const SWITCHBACK_ENTRY_DISTANCE: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>();
  let along = 0;
  for (const element of SWITCHBACK_GEOMETRY) {
    out.set(element.id, along);
    along += element.length;
  }
  return out;
})();

/** The mean grade every climb-share leg carries back to the summit, 0..1. */
export const FIRE_ROAD_GRADE = (() => {
  const climbing = SWITCHBACK_GEOMETRY.filter(
    (element) => SWITCHBACK_LOOP.find((loop) => loop.id === element.id)?.climbShare === true,
  );
  const metres = climbing.reduce((total, element) => total + element.climb, 0);
  const length = climbing.reduce((total, element) => total + element.length, 0);
  return metres / length;
})();

const BY_ID = new Map(SWITCHBACK_GEOMETRY.map((element) => [element.id, element]));

/** The element of the lap with this id, or a throw naming the typo. */
function element(id: string): SwitchbackSegment {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`the lap carries no segment "${id}"`);
  return found;
}

// ---------------------------------------------------------------------------
// The features
// ---------------------------------------------------------------------------

/**
 * One built feature: where it is, and exactly what the builder achieved.
 *
 * **The report is the record.** §36.4 requires a feature's actual lip, landing
 * and catch heights rather than its authored intent, and `parkFeatures` returns
 * them from the same arithmetic that wrote the blocks. Keeping them here means
 * `switchbackLevel.test.ts` — and Phase 2's measurement pass after it — reads
 * the numbers the geometry *has* rather than recomputing what it ought to,
 * which is the difference between a pinned fact and a restated assumption.
 */
export type SwitchbackFeature =
  | { readonly kind: 'deck'; readonly segment: string; readonly report: DeckReport }
  | { readonly kind: 'steppedDecks'; readonly segment: string; readonly report: SteppedDecksReport }
  | { readonly kind: 'stairs'; readonly segment: string; readonly report: StairsReport }
  | { readonly kind: 'lip'; readonly segment: string; readonly report: LipReport };

/** Wood, for a deck or a plank — the only place the material pair is written. */
const WOOD = { surface: 'wood' as SurfaceId, appearance: 'wood' as MaterialId };
/** Concrete on rough pavement, for the staircase treads. */
const STEP = { surface: 'roughPavement' as SurfaceId, appearance: 'concrete' as MaterialId };
/** Stone on rough pavement, for the rock terraces. */
const ROCK = { surface: 'roughPavement' as SurfaceId, appearance: 'stone' as MaterialId };
/** Packed earth, for a lip that has to read as part of the trail. */
const EARTH = { surface: 'dirt' as SurfaceId, appearance: 'dirt' as MaterialId };

/**
 * Every feature on the venue, keyed by a stable id, with its builder's report.
 *
 * Nine features across six corridors, one of each class §36.4 names that
 * Phase 1 is asked to graybox — a marked ledge drop, a straight gap, a skinny,
 * a charged step-up, a down staircase, a drop rhythm, a kicker, a climb crest
 * and a spin shelf. Every one of them stands on the rider's left; the right
 * half of each corridor is the bypass, and carries nothing at all.
 */
export const SWITCHBACK_FEATURES: Readonly<Record<string, SwitchbackFeature>> = Object.freeze({
  /**
   * The marked ledge drop — §36.4's gentlest feature, first on the lap.
   *
   * Flush at its uphill end and eight metres long on a 3.5% corridor, so the
   * drop off the end is the corridor's own fall plus the 0.05 m the deck stands
   * proud: 0.33 m, in the middle of the 0.30–0.55 m band §36.4 opens with and
   * well under the 1.05 m wood landing the measurement pass found to be nearly
   * heavy.
   */
  ledge: {
    kind: 'deck',
    segment: 'terrace-drop',
    report: deck(element('terrace-drop'), {
      // Four rather than Phase 1's six, so there are eight metres of clear
      // trail between this deck's edge and the gap's take-off deck instead of
      // six: a rider who hops the ledge at 18 mph flies six metres, and at six
      // metres of clearance they came down on the gap's leading edge and took
      // a heavy landing for it. Every measured height is unchanged — the
      // corridor falls linearly, so sliding the deck along it moves nothing.
      from: 4,
      length: 8,
      t: PARK.wideT,
      halfLateral: PARK.wideHalf,
      lift: 0.05,
      ...WOOD,
    }),
  },

  /**
   * The straight gap — two decks with three metres of corridor showing.
   *
   * **`stepDown` is chosen by principle 3, not by taste.** A rider who comes up
   * short lands in the gap, 0.43 m below the take-off deck, and then has to get
   * out: without the step the landing deck's face would be 0.485 m and they
   * would be stuck in a slot. Dropping the second deck 0.30 m puts that face at
   * 0.185 m — under the wheel's own 0.216 m step-up — so the gap catches a
   * missed jump and lets it ride away, which is exactly what §36.3 means by
   * "costs time rather than demanding a reset".
   */
  gap: {
    kind: 'steppedDecks',
    segment: 'terrace-drop',
    report: steppedDecks(element('terrace-drop'), {
      // Twenty rather than Phase 1's twenty-two, and the run-out is why: the
      // landing deck used to end three metres short of the socket into
      // `terrace-turn`, so a rider taking its 0.415 m exit drop touched down
      // exactly on the seam with nothing in front of them. Two metres uphill
      // buys five, and every measured height is unchanged — the corridor's
      // fall is linear, so sliding the whole feature along it moves nothing.
      from: 20,
      count: 2,
      deckLength: 8,
      gap: 3,
      // **0.35 rather than Phase 1's 0.30, and it is the installed sweep's
      // finding.** A no-hop rider at 21.0–26.0 mph lands within five
      // centimetres of the landing deck's foot, and at the 0.185 m face that
      // 0.30 m produced the wheel met the face while it was still absorbing
      // the touchdown and bonked — an `obstacle` crash that recovered in
      // 2.51 s, which is "demanding a reset" in everything but name. The
      // boundary sits between 0.160 m (rides away) and 0.185 m (bonks); this
      // puts the face at 0.135 m.
      stepDown: 0.35,
      t: PARK.wideT,
      halfLateral: PARK.wideHalf,
      lift: 0.1,
      ...WOOD,
    }),
  },

  /**
   * The skinny — a 0.9 m plank, 0.30 m proud at its start.
   *
   * The width is §36.4's own instruction taken literally: "width comes from the
   * wheel, articulated rider and camera, not a plank texture". Falling off
   * either side is a 0.30 m drop at the start and 0.54 m at the end, both
   * inside the band the drop bench measured clean on dirt, and the ground under
   * both sides is the corridor — so a rider who steps off simply carries on
   * down the trail.
   */
  skinny: {
    kind: 'deck',
    segment: 'timber',
    report: deck(element('timber'), {
      from: 4,
      length: 8,
      t: PARK.skinnyT,
      halfLateral: PARK.skinnyHalf,
      lift: 0.3,
      ...WOOD,
    }),
  },

  /**
   * The charged step-up — 0.50 m, which is the whole of the feature.
   *
   * §36.2a measured the sampled hop apex at 0.4463 m uncharged and 0.6275 m
   * charged. Half a metre sits between them on purpose: an uncharged hop is
   * refused at the face and a charged one clears with 0.13 m in hand, which is
   * what makes the crouch a decision rather than a decoration. The far end is a
   * 0.68 m roll-off back onto the trail.
   */
  stepUp: {
    kind: 'deck',
    segment: 'timber',
    report: deck(element('timber'), {
      from: 20,
      length: 6,
      t: PARK.wideT,
      halfLateral: PARK.wideHalf,
      lift: 0.5,
      ...WOOD,
    }),
  },

  /**
   * The down staircase — the slice's alley recipe on a 10% corridor.
   *
   * Three treads of 0.30 m over nine metres. The corridor under them falls at
   * exactly the staircase's own rate, so every tread is 0.15 m of block and the
   * rider takes three equal steps: the third of them is off the bottom tread
   * onto the trail, which is why the exit drop reads 0.30 m and not zero. The
   * right half of this corridor is the 10% ramp, which is the bypass §36.4 asks
   * for, and it is the same ground the stairs stand on rather than a second
   * route round.
   */
  stairs: {
    kind: 'stairs',
    segment: 'timber-steps',
    report: stairs(element('timber-steps'), {
      from: 0,
      steps: 3,
      tread: 3,
      rise: 0.3,
      t: PARK.wideT,
      halfLateral: PARK.wideHalf,
      ...STEP,
    }),
  },

  /**
   * The rock rhythm — three 0.30 m drops, ten metres apart.
   *
   * The tops are pinned to each other rather than to the corridor, which is
   * what makes every edge in the rhythm the same drop whatever the ground
   * beneath is doing; the corridor's own 3.5% is absorbed into the blocks and
   * shows up only where the rider leaves the last deck, at 0.50 m. Ten metres
   * between edges is about a second and a half at the speed this arrives at:
   * land, settle, aim, go again, which is §36.4's "not one long fall spanning
   * all the decks".
   */
  rhythm: {
    kind: 'steppedDecks',
    segment: 'rock-rhythm',
    report: steppedDecks(element('rock-rhythm'), {
      from: 8,
      count: 3,
      deckLength: 10,
      gap: 0,
      stepDown: 0.3,
      t: PARK.wideT,
      halfLateral: PARK.wideHalf,
      lift: 0.05,
      ...ROCK,
    }),
  },

  /**
   * The kicker lip — flush with the crest, six metres long, 0.15 m of face.
   *
   * **The corridor is the ramp and the block is the launch**, which is §36.2
   * item 3 built rather than argued with: `kicker-rise` is an eased climb, so
   * its crest has a gradient of exactly zero, this block starts flush with that
   * crest (`stepUpAtStart` is 0 — there is no kerb to mount) and holds it level
   * for six metres while `kicker-lip` falls 0.15 m beneath it. The face at the
   * far edge is therefore 0.15 m, three times `TERRAIN.dropLaunchThreshold`, so
   * the launch is guaranteed at any speed; and what it launches onto is
   * `kicker-table`, which is level, and past it the landing hill.
   *
   * **0.15 m is a measured ceiling, not a taste.** A flight that begins and
   * ends at the same height lands at the speed the hop launched with, so a
   * table landing's score is `(launch speed + the face's fall) / 5` plus dirt's
   * own 0.195 — and the fully charged hop already spends 0.71 of the 1.0 that
   * separates clean from heavy. The bench swept the face at 0.10, 0.12, 0.15,
   * 0.18, 0.20 and 0.25 m on both presets at 20–50 mph, uncharged, half and
   * fully charged: 0.18 m is the last face that is clean everywhere (0.9893 at
   * its worst) and 0.20 m is the first that is not (1.0056, heavy). 0.15 m is
   * that ceiling with 0.027 of margin — enough that a rider who also arrives
   * misaligned has somewhere to go. See `docs/JUMP_BENCH.md` T11 and T15.
   *
   * **The block is deliberately level, and it is why the launch is the same
   * launch every time.** `EucController.launchHop` adds `speed × sin(slope)` to
   * a hop taken on a gradient, and a 12.5% ramp would put two and a half
   * metres a second under a 47 mph hop — but the heightfield rounds a crest
   * over one 1.5 m cell, so the slope on the last grounded step depends on
   * where in that cell the step happens to fall. Measured on a ramp crest with
   * no block: 0.93 m of apex at 47 mph and 1.96 m at 50, from the same press.
   * §36.2 item 3's reasoning about folds applies to that bonus too, so the
   * bigness of this jump is all in the landing hill and none of it in a phase.
   */
  kicker: {
    kind: 'lip',
    segment: 'kicker-lip',
    report: lip(element('kicker-lip'), {
      at: 0,
      lead: 0,
      reach: 6,
      height: 0,
      t: PARK.kickerT,
      halfLateral: PARK.kickerHalf,
      ...EARTH,
    }),
  },

  /**
   * The climb crest — the fire road's one measured opportunity.
   *
   * Small on purpose: 0.05 m of lip and a 0.17 m face, which is a hop a rider
   * chooses on the way up rather than something the road does to them. The
   * smooth crossing beside it is a 0.058 rad fold, a third of `MAX_SOCKET_FOLD`
   * and nowhere near a launch, so §36.3's "no mandatory air to recover the
   * summit" holds by measurement.
   */
  crest: {
    kind: 'lip',
    segment: 'crest-down',
    report: lip(element('crest-down'), {
      at: 0,
      lead: 0,
      reach: 2,
      height: 0.05,
      t: PARK.crestT,
      halfLateral: PARK.crestHalf,
      ...EARTH,
    }),
  },

  /**
   * The spin shelf — a low deck onto the broad level pad beyond it.
   *
   * §36.3 beat 6 wants the signed 180 line *away* from the fastest airborne
   * line, so it is here at the bottom of the hill rather than at the kicker: a
   * 0.41 m roll-off at low speed onto twenty metres of corridor with no
   * gradient at all, which is the room a fakie exit at the 15 mph reverse
   * ceiling needs. The signage is Phase 2's.
   */
  spinShelf: {
    kind: 'deck',
    segment: 'shelf-in',
    report: deck(element('shelf-in'), {
      from: 8,
      length: 12,
      t: PARK.shelfT,
      halfLateral: PARK.shelfHalf,
      // Flush, so the rider rolls on with no kerb at all and the only face on
      // the feature is the one they leave. The deck ends exactly at the socket
      // into `shelf-pad`, so what they land on is level ground 0.15 m below.
      lift: 0,
      ...WOOD,
    }),
  },
});

/** Every feature's blocks, gathered by the corridor that carries them. */
const FEATURE_BLOCKS: ReadonlyMap<string, readonly SegmentBlock[]> = (() => {
  const out = new Map<string, SegmentBlock[]>();
  for (const feature of Object.values(SWITCHBACK_FEATURES)) {
    const list = out.get(feature.segment);
    if (list === undefined) out.set(feature.segment, [...feature.report.blocks]);
    else list.push(...feature.report.blocks);
  }
  return out;
})();


// ---------------------------------------------------------------------------
// The signage
// ---------------------------------------------------------------------------

/**
 * How far apart the heightfield is sampled, metres.
 *
 * Hoisted out of `createSwitchbackLevel` because the signage has to know it:
 * a cell takes the surface under its *centre*, so a boardwalk patch has to
 * reach past its paint by enough to catch that centre wherever the grid
 * happens to fall.
 */
export const SWITCHBACK_FIELD_SPACING = 1.5;

/**
 * How far a sign's boardwalk reaches past the paint standing on it, metres.
 *
 * **Derived from the grid, not chosen.** A painted point is at most half a cell
 * from its own cell's centre in each world axis, and the trail runs at every
 * angle to that grid — so in a corridor's own `(s, t)` frame the offset can be
 * the whole half-diagonal along either axis. `1.5 × √2 / 2 = 1.0607` is
 * therefore the smallest margin that *cannot* lose a stroke, and
 * `switchbackLevel.test.ts` proves it by building the level and measuring that
 * every authored metre of paint survived the clipper. Measurement agrees and is
 * the reason the bound is taken rather than tuned: 0.95 happens to keep all of
 * this layout's paint and 0.85 loses three metres of it, so anything under the
 * derived figure is a number that works until the geometry moves.
 *
 * It is also the venue's whole boardwalk bill. Paint is roughly 0.2 m wide and
 * the patch under it is 2.1 m wider than it is, so what is planked is the
 * margin rather than the mark, which is why the patches are per-mark: one
 * rectangle around a whole sign plants boardwalk across the trail between the
 * chevrons and the bypass arrow, and that trail is most of the corridor.
 */
export const SWITCHBACK_SIGN_PAD_MARGIN = (SWITCHBACK_FIELD_SPACING * Math.SQRT2) / 2;

/**
 * The furthest ahead of its feature a sign on this venue may stand, metres.
 *
 * Ninety is a little over the kicker's own required lead (57.2 m at 50 mph) and
 * about six seconds at the speed the fast half of the lap is ridden. Past that
 * a rider has passed a corner and two other features and the mark is no longer
 * about anything they can see.
 */
const SWITCHBACK_SIGN_MAX_LEAD = 90;

/** What a feature's sign has to say, beyond what its geometry already says. */
interface SwitchbackSignPlan {
  /**
   * Which edge of the first block the rider commits at.
   *
   * `leave` for a feature they ride off — a lip, a ledge, a take-off deck, the
   * first tread of a staircase measured at its far edge. `enter` for one they
   * have to get onto or into, and for the staircase, whose commitment is its
   * top rather than the edge the bench measures the flight from: a sign is
   * about the decision, and the decision is made before the first tread.
   */
  readonly commit: 'leave' | 'enter';
  /**
   * The fastest speed the measurement pass arrives at, mph.
   *
   * Transcribed from `bench/installedPark.ts`'s `speeds` — the last entry of
   * each sweep, which is the fastest ridden — and pinned against it in
   * `switchbackLevel.test.ts`. The fastest rather than the median because the
   * lead has to hold for the rider who is going quickest, and because a sign
   * sized for the median is a sign that is late exactly when it matters.
   *
   * This file may not import the bench: `bench/installedPark.ts` builds the
   * park to measure it, so reading it here would be a cycle.
   */
  readonly approachMph: number;
  readonly technicalT: number;
  readonly bypassT: number;
  readonly words?: readonly ParkSignWord[];
  /** Shorten the sign, for a corridor with no room for a full one. */
  readonly compact?: true;
  /** Where the rider comes down, in the host corridor's own frame. */
  readonly landing: {
    readonly segment: string;
    readonly fromS: number;
    readonly toS: number;
    readonly t: number;
    readonly halfLateral: number;
    readonly onGround: boolean;
  };
}

/**
 * What each of the nine features is signed with, and why.
 *
 * **Copy is limited to what §36.4 names.** Every feature gets the same two
 * marks — a stack of three chevrons along its technical line and one long
 * diagonal arrow onto the bypass — because that pair is the instruction, and
 * four features get a word on top of it: the staircase, whose direction is
 * the whole point and which a rider meets at the end of a straight; the spin
 * shelf, where §36.4 asks in so many words for a line that "says 180 and
 * explains the air tap in-world"; and, since the owner's first rides
 * (2026-09-12), the ledge and the kicker. He circled the ledge — "it is not
 * clear to me at all what that is for" — and a 0.05 m deck that drops off its
 * far edge is a thing whose whole meaning is the edge, so it says DROP; the
 * kicker is the venue's big jump and says AIR, the one word on the approved
 * list for what the rider is about to be in. Nothing else is told anything a
 * chevron does not already say; every word is 30–40 m² of planking and a
 * metre of pad the crowded half of this lap does not have.
 *
 * **Landing boxes go where the rider cannot see what they are landing on**:
 * the kicker's landing face, which is below the lip's own horizon and steeper
 * than anything else on the venue; the shelf pad, which is behind them by the
 * time they touch it; and the ledge, whose landing ends eight metres short of
 * the gap's take-off deck and is the one place on the lap where running out
 * means landing on the next feature. The crest's landing is the fire road
 * straight ahead and §36.4 calls the crest "an opportunity, not a demand", so
 * it is marked with chevrons and nothing else.
 */
const SWITCHBACK_SIGN_PLAN: Readonly<Record<string, SwitchbackSignPlan>> = Object.freeze({
  ledge: {
    commit: 'leave',
    approachMph: 25,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    // The owner's word for the thing he could not read: the deck is five
    // centimetres proud where he rolls onto it and the whole feature is the
    // 0.33 m edge he leaves from. Its pad is on `entrance`, the R20 bend before
    // the terrace, at the lead rule's full 25 mph distance.
    words: ['DROP'],
    // **Compact, because the entrance has to carry two signs.** The read rule
    // accepts a pad on this bend only over its first eighteen metres or so, and
    // the gap's seven-metre sign has to fit there too, in front of this one: a
    // full three-chevron stack with the word in front of it is thirteen metres
    // and starved the gap of any legal pad at all (`parkSignage` throws rather
    // than signing the gap from the far side of the lap). Two chevrons at their
    // shortest pitch bring it to 9.6 m, which leaves the gap the seven it
    // needs with half a metre to spare — measured, and pinned in
    // `switchbackLevel.test.ts`.
    compact: true,
    // **Unmarked, and the bench decided it.** A landing box is paint, paint
    // needs planking, and planking is a metre wider than the line it carries on
    // every side — so a box drawn round a landing puts wood *in* it. On the
    // kicker's table and the shelf pad that costs nothing: every touchdown
    // there is clean by a margin and stays clean. On the ledge it moved a
    // published boundary the other way — the 18 mph fully charged hop went
    // heavy (1.1141) to clean, on both presets and on the +1.2 m lateral miss,
    // because the far bar's strip landed exactly where that flight comes down.
    // §36.4: new scenery must not move any of these boundaries. The ledge is a
    // 0.33 m roll-off onto trail the rider can see the whole way, so what it
    // loses is the least of the three.
    landing: { segment: 'terrace-drop', fromS: 12.5, toS: 19, t: PARK.wideT, halfLateral: 2, onGround: false },
  },
  gap: {
    commit: 'leave',
    approachMph: 30,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    landing: { segment: 'terrace-drop', fromS: 31, toS: 39, t: PARK.wideT, halfLateral: PARK.wideHalf, onGround: false },
  },
  skinny: {
    commit: 'enter',
    approachMph: 15,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    compact: true,
    landing: { segment: 'timber', fromS: 4, toS: 12, t: PARK.skinnyT, halfLateral: PARK.skinnyHalf, onGround: false },
  },
  stepUp: {
    commit: 'enter',
    approachMph: 20,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    compact: true,
    landing: { segment: 'timber', fromS: 20, toS: 26, t: PARK.wideT, halfLateral: PARK.wideHalf, onGround: false },
  },
  stairs: {
    commit: 'enter',
    approachMph: 20,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    words: ['DOWN'],
    // The one compact sign on the venue, and the bench is why: see
    // `SignedFeature.compact`. The staircase's only legal pad is the eight
    // metres of trail between the skinny's plank and the step-up's deck, and a
    // full-length one plants boardwalk under the point the step-up's own
    // trials spawn from.
    compact: true,
    landing: { segment: 'timber-steps', fromS: 3, toS: 9, t: PARK.wideT, halfLateral: PARK.wideHalf, onGround: false },
  },
  rhythm: {
    commit: 'leave',
    approachMph: 25,
    technicalT: PARK.wideT,
    bypassT: -3.5,
    landing: { segment: 'rock-rhythm', fromS: 18, toS: 40.7, t: PARK.wideT, halfLateral: PARK.wideHalf, onGround: false },
  },
  kicker: {
    commit: 'leave',
    approachMph: 50,
    technicalT: PARK.kickerT,
    bypassT: -4,
    // The big one, said in the one approved word for it.
    words: ['AIR'],
    // The landing face rather than the table: the box is drawn where the
    // charged flight the sign is for comes down — T11 puts the 45–50 mph
    // fully charged touchdowns 7.6 to 15.4 m down `kicker-landing` — from six
    // metres in, clear of the brow's socket where a heightfield cell belongs to
    // whichever corridor claims its centre, to a metre inside the face's end. A
    // hop under 44 mph lands on the table or the brow, which the rider can see
    // the whole way, and is not marked.
    landing: { segment: 'kicker-landing', fromS: 6, toS: 15, t: PARK.kickerT, halfLateral: 2.5, onGround: true },
  },
  crest: {
    commit: 'leave',
    approachMph: 35,
    technicalT: PARK.crestT,
    bypassT: -3.5,
    landing: { segment: 'crest-down', fromS: 2.5, toS: 13.5, t: PARK.crestT, halfLateral: 2, onGround: false },
  },
  spinShelf: {
    commit: 'leave',
    approachMph: 15,
    technicalT: PARK.shelfT,
    bypassT: -3,
    words: ['180', 'TAP'],
    // Three and a half metres wide rather than four: `shelf-pad` is the
    // narrowest corridor the signage paints on, and the patch under the box's
    // bars has to stay inside it.
    landing: { segment: 'shelf-pad', fromS: 2, toS: 9, t: PARK.shelfT, halfLateral: 1.75, onGround: true },
  },
});

/**
 * The nine features as the signage helper wants them, in riding order.
 *
 * Every distance here is derived from `SWITCHBACK_ENTRY_DISTANCE` and the
 * builder's own block extents, so beat 5 growing by thirty-two metres moved
 * every sign behind it without a number being retyped.
 */
export const SWITCHBACK_SIGNED_FEATURES: readonly SignedFeature[] = (() => {
  const ordered = Object.entries(SWITCHBACK_FEATURES)
    .map(([id, feature]) => {
      const plan = SWITCHBACK_SIGN_PLAN[id];
      if (plan === undefined) throw new Error(`the feature "${id}" has no signage`);
      const entry = SWITCHBACK_ENTRY_DISTANCE.get(feature.segment)!;
      const first = feature.report.blocks[0]!;
      const lipS = entry + first.s + (plan.commit === 'enter' ? -first.halfAlong : first.halfAlong);
      const signed: SignedFeature = {
        id,
        kind: feature.kind,
        segment: feature.segment,
        lipS,
        approachMph: plan.approachMph,
        technicalSide: 1,
        bypassSide: -1,
        technicalT: plan.technicalT,
        bypassT: plan.bypassT,
        // **The bypass arrow starts on the bypass half, not on the centreline.**
        // Every feature here stands on the rider's left and the whole right
        // half of every corridor is the roll-past, so nobody needs telling
        // which half is the easy one — and a taper authored from the middle of
        // the trail drags its boardwalk all the way across it. The mark keeps
        // its shape, a single long diagonal against three chevrons, on a strip
        // of its own beside the bypass line.
        bypassFromT: plan.bypassT + PARK.bypassArrowAcross,
        ...(plan.words === undefined ? {} : { words: plan.words }),
        ...(plan.compact === undefined ? {} : { compact: plan.compact }),
        landing: plan.landing,
        blocks: feature.report.blocks.map((block) => ({
          s: block.s,
          t: block.t,
          halfAlong: block.halfAlong,
          halfLateral: block.halfLateral,
        })),
      };
      return signed;
    })
    .sort((left, right) => left.lipS - right.lipS);
  return ordered;
})();

/**
 * Every band, mark and post the signage adds, by the corridor that carries it.
 *
 * **Built here rather than in `parkSignage.ts`**, which knows nothing about
 * this venue and is asked only to obey the rule: a sign finishes being read
 * `SIGNS.readSeconds × v + v²/(2a)` before the point its feature can no longer
 * be refused, at the speed the measurement pass says the rider arrives.
 */
export const SWITCHBACK_SIGNAGE: ParkSignage = parkSignage(SWITCHBACK_SIGNED_FEATURES, {
  metres: SWITCHBACK_LAP_METRES,
  segments: SWITCHBACK_GEOMETRY.map((segment) => ({
    id: segment.id,
    length: segment.length,
    halfWidth: segment.halfWidth,
    entryDistance: SWITCHBACK_ENTRY_DISTANCE.get(segment.id)!,
    // **The read rule needs the lap's shape**, and this is the whole of the
    // shape it needs: a bearing is the thing a pane clips, and a corridor that
    // has swung a hundred degrees away from the trail the rider is looking down
    // carries its paint out of the picture with it. `curvature` is already
    // derived for every element above by `trackLevel.ts`'s own `curvatureOf`.
    curvature: segment.curvature,
    // The apron is the start straight: it carries the line, the four-seat grid
    // and the out-lap, and the nearest feature is a hundred and thirty metres
    // and two corners away. A pad there would be legal by arithmetic and about
    // nothing a rider standing on it can see.
    ...(segment.id === 'apron' ? { pads: false } : {}),
  })),
  padMargin: SWITCHBACK_SIGN_PAD_MARGIN,
  landingPadMargin: SWITCHBACK_SIGN_PAD_MARGIN,
  maxLead: SWITCHBACK_SIGN_MAX_LEAD,
});

// ---------------------------------------------------------------------------
// The dressing — M36 Phase 4
// ---------------------------------------------------------------------------

/**
 * The corridors a feature is ridden on, approached down or landed and run out
 * onto — the ground the forest keeps its distance from.
 *
 * **Named rather than derived from `blocks`, because the approach carries no
 * block and is the half that matters.** A rider commits to the kicker on
 * `kicker-approach`, forty metres before the lip stands on `kicker-lip`, and it
 * is on that approach that a tree on the shoulder swings the chase camera. The
 * same is true of every corridor carrying a sign: the sign exists precisely
 * because the decision is made there.
 *
 * The nine that are left — the apron, the four hairpins past their signs, the
 * fire road's two straights, the shelf's exit and the summit's return — are
 * plain trail, and they are where the understorey is allowed to come in close.
 */
export const SWITCHBACK_TECHNICAL_CORRIDORS: ReadonlySet<string> = new Set([
  // Beat 2: the ledge and the gap, signed from `entrance`, run out into the turn.
  'entrance', 'terrace-drop', 'terrace-turn',
  // Beat 3: the skinny, the step-up and the staircase; the rhythm's sign.
  'timber', 'timber-steps', 'timber-turn',
  // Beat 4: the rock rhythm; the kicker's sign.
  'rock-rhythm', 'rhythm-turn',
  // Beat 5: the whole clearing, approach to run-out.
  'kicker-approach', 'kicker-rise', 'kicker-lip', 'kicker-table',
  'kicker-brow', 'kicker-landing', 'kicker-flare', 'kicker-runout',
  // Beat 6: the spin shelf and the sign that leads into it.
  'clearing-turn', 'shelf-in', 'shelf-pad',
  // Beat 7: the crest and the straight its sign stands on.
  'fire-road-1', 'crest-up', 'crest-down',
]);

/**
 * The fill side of every benched corridor, as runs of cribbing and riprap.
 *
 * **A trail on a hillside is half cut and half fill**, and the fill half is the
 * one that needs holding up. So each run stands on the side the ground falls
 * away on — authored here, measured in the test — and is timber where the beat
 * is timber and stone where the beat is rock. The decks themselves need no
 * supports: `settleBlocks` already grows every feature block a foundation down
 * to the ground under it (see `createSwitchbackLevel`), so a deck is a plinth
 * and a post under one would be geometry nobody can see.
 *
 * Twelve triangles a block and no new draw call — `wood` and `stone` are two of
 * the four block materials this venue already merges, which is §36.7's
 * "supports and rock faces as existing merged wood/stone geometry" taken
 * literally.
 */
const SWITCHBACK_HILLSIDE_SPANS: readonly HillsideSpan[] = [
  // Beat 1–2. The entrance falls away to the rider's left as it swings off the
  // summit; the terrace is cut into the slope above its own boardwalk.
  { segment: 'entrance', fromS: 5, toS: 26, pitch: 7, side: 1, ...ROCK },
  { segment: 'terrace-drop', fromS: 5, toS: 40, pitch: 7, side: 1, ...WOOD },
  // Beat 3, the timber line: cribbing under the whole of it, both corridors.
  { segment: 'timber', fromS: 5, toS: 40, pitch: 7, side: -1, ...WOOD },
  { segment: 'timber-steps', fromS: 2, toS: 7, pitch: 5, side: -1, ...WOOD },
  // Beat 4, the rock rhythm — the one beat whose own features are stone.
  { segment: 'rock-rhythm', fromS: 6, toS: 41, pitch: 7, side: 1, ...ROCK },
  // Beat 5. Not the lip, the rise or the landing face: those three carry the
  // flight, and the clearing reads better for having nothing beside them.
  { segment: 'kicker-approach', fromS: 5, toS: 19, pitch: 7, side: -1, ...ROCK },
  // The table is twelve metres now, so one run of two rather than three; and
  // the run-out lost its run, because it lies at the foot of the landing hill
  // in a cutting the hill itself makes — measured: its riprap stood 0.07 m out
  // of the ground on what used to be the fill side.
  { segment: 'kicker-table', fromS: 3, toS: 10, pitch: 7, side: -1, ...ROCK },
  // Beat 6 carries none. The shelf's own hairpin runs twenty metres from its
  // approach, and the only fill side the pad has is four metres from the far
  // leg's edge — closer than anything else on the venue stands to a corridor it
  // does not belong to. The shelf is the most-dressed beat on the lap already:
  // a deck, a painted landing box, a sign and a bench.
  //
  // Beat 7, the crest, and beat 8's return onto the summit.
  { segment: 'crest-up', fromS: 3, toS: 9, pitch: 6, side: -1, ...ROCK },
  { segment: 'crest-down', fromS: 3, toS: 9, pitch: 6, side: -1, ...ROCK },
  { segment: 'summit-return', fromS: 5, toS: 29, pitch: 8, side: 1, ...ROCK },
];

/** Those runs as blocks, keyed by the corridor that carries them. */
export const SWITCHBACK_HILLSIDE_BLOCKS: ReadonlyMap<string, readonly SegmentBlock[]> =
  hillsideBlocks(SWITCHBACK_HILLSIDE_SPANS, (id) => element(id).halfWidth);

/**
 * Which bends are fenced on the inside — the owner's first rides of the park.
 *
 * **"Some of the corners are very tight and require slow speeds to make them.
 * More fencing will be required to block more of them off so players know not
 * to cut corners and 'cheat'."** The rails below mark the *outside* of a bend,
 * which is what a rider reads the corner's severity from; nothing marked the
 * inside, so the only thing that caught a cut was `LapEnvelope.contains`
 * voiding the lap a corner later and without a word. `parkFencing.ts` puts a
 * run of bays round the inside of each bend, `FENCE_ENVELOPE_CLEAR` outside the
 * last ground the referee calls on-course — near enough that only a cut can
 * touch it, far enough that a rider out on the verge never does.
 *
 * Six of the eight bends are here. The two that are not are refusals rather
 * than oversights, and both are about ground that is already spoken for:
 *
 *   - **`entrance`.** Its inside is its *fill* side, and Phase 4 already put
 *     twenty-one metres of stone cribbing along it at t = +12
 *     (`SWITCHBACK_HILLSIDE_SPANS`). The fence wants t = +12.10, which is four
 *     centimetres inside the masonry's own lateral half — the one offset the
 *     envelope leaves is the one the hillside is standing on. The cribbing is
 *     the boundary there, and it is a better one than a fence: it is what the
 *     trail is actually held up by.
 *   - **`shelf-turn`.** R10 with a seven-metre corridor, so the referee reaches
 *     9.5 m and the arc's own centre is 10 m away: the whole of that hairpin's
 *     infield is on-course ground but for a 0.45 m disc at its apex and a
 *     one-metre strip between its legs. There is nowhere to put a bay that a
 *     legal line cannot reach, and `innerFences` refuses the bend rather than
 *     standing a solid half a metre off the trail on the tightest corner of the
 *     venue. Its outside rail below is what marks it.
 *
 * The four hairpins that are fenced also carry a spine down the leg they leave
 * on, which is the leg whose infield side is its *cut* side and therefore the
 * one with no cribbing on it; the leg they arrive on is fill, and its cribbing
 * already stands where a spine would.
 */
const SWITCHBACK_INNER_FENCED_BENDS: readonly FencedBend[] = [
  // **The one bend the camera decides rather than the referee.** The gap's
  // run-out reaches the socket this arc starts at, so its first bay stands
  // beside the line a rider lands the gap on: the envelope wants 11.10 m and
  // the chase camera wants 11.80, and the wider of the two is what is built.
  { bend: 'terrace-turn', spine: false, technicalT: PARK.wideT },
  // Four metres in, and the timber line's own cribbing bought them: the last
  // block of `timber-steps`' run stands at s 5.7–8.3 of a nine-metre corridor,
  // so a bay at this bend's entry socket reaches back into the masonry and
  // `buildPlan` deletes it silently. At four metres the two stand 0.74 m apart
  // and the gap is the cribbing's own, which is the boundary a rider reads
  // there anyway.
  { bend: 'timber-turn', fromS: 4, spine: true, technicalT: PARK.wideT },
  { bend: 'rhythm-turn', spine: true, technicalT: PARK.kickerT },
  { bend: 'clearing-turn', spine: true, technicalT: PARK.kickerT },
  { bend: 'bottom-turn', spine: false },
  { bend: 'summit-turn', spine: false },
];

/** Those bends' fences, offsets and arcs — the report, and the runs. */
export const SWITCHBACK_INNER_FENCES: readonly InnerFence[] =
  innerFences(SWITCHBACK_INNER_FENCED_BENDS, SWITCHBACK_GEOMETRY);

/**
 * Trail rail at the four hairpins and along the summit apron.
 *
 * **The one landmark that answers a question the rider is actually asking.** A
 * hairpin on a forested hillside is invisible until it is close, because the
 * trail ahead is the same trail and the trees beside it are the same trees; a
 * rail on the *outside* of the bend is a horizontal line across the picture
 * thirty metres out, and it says "it turns, and it turns this hard". The apron's
 * run does the other half of the job — it is the only built edge on the venue,
 * so the summit reads as a trailhead rather than as a wide bit of trail.
 *
 * Each run stands outside its own bend and outside the signpost already there
 * (Phase 2 puts them at |t| of 9.8 to 10.6), so a bay and a plate never contest
 * the same ground — `buildPlan.resolveStructuralConflicts` would settle it by
 * dropping one of them, quietly.
 */
const SWITCHBACK_RAILS: readonly RailRun[] = [
  // The trailhead, on the apron's outer edge, stopping well short of the line.
  { segment: 'apron', fromS: 12, toS: 48, t: -13 },
  // R16 right, R16 left, R15 right, R10 left — the outside of each is the side
  // the bend curves away from, which is the sign of the turn, negated.
  { segment: 'timber-turn', fromS: 16, toS: 32, t: 14 },
  // Wrap the mouth as well as the apex: the old short arc read as distant
  // scenery, leaving the rock-rhythm straight apparently open. This closer
  // outer run crosses the rider's forward sightline and continues into the
  // left turn, outside the lap envelope and the signpost's footprint.
  { segment: 'rhythm-turn', fromS: 5, toS: 43, t: -12 },
  // **The clearing hairpin's rail is at its mouth rather than at its apex**, and
  // the fire road is why: `fire-road-1` climbs past the outside of this bend
  // from s 20 to s 36, so the ground a rail would want there is another
  // corridor. The mouth is where the rail is read from anyway — the rider
  // meets it head on down `kicker-runout`.
  { segment: 'clearing-turn', fromS: 5, toS: 15, t: 14 },
  { segment: 'shelf-turn', fromS: 10, toS: 20, t: -12 },
  // And the inside of every bend that can carry one. Laid by the same helper
  // and out of the same bays, so this costs the library no new part and the
  // frame no new draw call — only triangles.
  ...SWITCHBACK_INNER_FENCES.flatMap((fence) => fence.runs),
];

/**
 * The venue's three benches — the summit, and the spin shelf.
 *
 * A bench is furniture that only exists where somebody would stop, so it says
 * *this is a place* in a way no amount of forest can. Two at the trailhead,
 * facing the trail the rider is about to drop into; one beside the spin pad,
 * on the bypass side, facing the pad — which is the venue's one piece of
 * spectator geometry and the closest this graybox comes to saying that the 180
 * is the thing to come here for.
 *
 * `yaw` of `+PI/2` turns a prop's own front onto the rider's left
 * (`segments.propsOf` composes it onto the corridor's heading), so a bench on
 * the right-hand verge faces the road and one on the left faces it at `-PI/2`.
 */
const SWITCHBACK_BENCHES: readonly { segment: string; prop: SegmentProp }[] = [
  { segment: 'apron', prop: { s: 22, t: -11.5, kind: 'bench', yaw: Math.PI / 2 } },
  { segment: 'apron', prop: { s: 46, t: -11.5, kind: 'bench', yaw: Math.PI / 2 } },
  // Fourteen metres out rather than eleven, and the pad is why: the spin
  // shelf's landing is a zone the whole of Phase 4's clearance rule applies to,
  // and a bench inside it would be furniture beside a landing. Seven metres of
  // daylight past a seven-metre corridor, facing the pad across it.
  { segment: 'shelf-pad', prop: { s: 10, t: -14, kind: 'bench', yaw: Math.PI / 2 } },
];

/** Every landmark prop, keyed by the corridor that carries it. */
export const SWITCHBACK_LANDMARKS: ReadonlyMap<string, readonly SegmentProp[]> = (() => {
  const out = new Map<string, SegmentProp[]>(
    [...railProps(SWITCHBACK_RAILS, (id) => element(id).curvature)]
      .map(([id, props]) => [id, [...props]] as [string, SegmentProp[]]),
  );
  for (const bench of SWITCHBACK_BENCHES) {
    const list = out.get(bench.segment);
    if (list === undefined) out.set(bench.segment, [bench.prop]);
    else list.push(bench.prop);
  }
  return out;
})();

/**
 * The fixed warm late afternoon Switchback Park is ridden in — §36.7, q160.
 *
 * **A venue's light is authored, not selected** (`data/venueLook.ts`): every
 * field is optional and resolves to the `LIGHTING` constant every other world
 * is judged at, so this descriptor is exactly the list of things about the park
 * that are not today's daylight. Eleven of the thirteen are here; `fogNear` and
 * `fogFar` are inherited on purpose.
 *
 * Every number is derived from the venue's own compass — the apron runs **west**
 * along the summit, the descent marches **north**, the fire road climbs back
 * south — and from the one thing §36.8 will not trade: the landings stay
 * brighter and clearer than the dressing around them.
 *
 * **This descriptor is load-bearing on the hillside, not only on the frame.**
 * `SWITCHBACK_SUN` below quotes its two bearing fields and the forest is
 * planted against them (`parkDressing.shadowClearance`), so moving the sun
 * lower moves the treeline. That is the intended coupling and it is asserted:
 * `switchbackLevel.test.ts` re-derives the setback from *this* object and
 * measures the built forest's shadows against the landings.
 */
export const SWITCHBACK_LOOK: VenueLook = Object.freeze({
  // 10.3° south of due west. Due west is -PI/2 in this convention (bearing from
  // +Z toward +X) and the apron runs due west along the summit, so dead west
  // would put the sun on the out-lap's nose; ten degrees off it does not. The
  // descent marches north, so on every switchback this is a cross-light: the
  // faces of lips, decks and steps are lit from the side, which is what makes
  // an edge read at speed.
  sunAzimuth: -1.75,
  // 33.2°. Late afternoon, and a measured ceiling rather than a taste: a shadow
  // is height / tan(0.58) = 1.53x long, so a full-scale conifer lays 15.1 m of
  // it downhill and the forest is set back by that much from everything a rider
  // commits to. Lower reads more golden, and starts banding the landings.
  sunElevation: 0.58,
  // ~4000 K key. Warm without going sunset-orange, which would start fighting
  // the signage.
  sunColour: 0xffd9a8,
  // Slightly under the 2.6 daylight key: a low sun has more atmosphere in front
  // of it. The hemisphere below gives back what the landings need.
  sunIntensity: 2.45,

  // Cooler and deeper than daylight's 0x9dc4ea, so shadows read blue against
  // the warm key — the warm/cool separation that makes a low sun legible rather
  // than merely orange.
  skyColour: 0x8bb2e6,
  // Warm earth bounce for a forest floor at this hour.
  groundBounceColour: 0xb9a68d,
  // Up from 1.10, and this is the q160 lever: it is the fill that decides how
  // much of a landing in shadow the rider can still read.
  hemisphereIntensity: 1.22,

  // Hazy warm horizon. One field, so the haze and the sky's bottom stop move
  // together (`DESIGN.md` §6). It also does half of "landings brighter than
  // peripheral dressing" for free: the far treeline is dissolved toward this
  // value while the near landing keeps full contrast.
  horizonColour: 0xdfc8a8,
  skyZenithColour: 0x4d80c6,
  skySunColour: 0xffe0b0,

  // `fogNear` / `fogFar` deliberately absent: the park inherits 120 / 470.
  // Pulling the haze in would strengthen the contrast above and would also
  // start fogging the far end of a 168 x 200 m lap. One axis at a time (§36.7).

  // The mid-tone, after a 6% warmer and dimmer key and a lifted fill. **This
  // decides where the shadowed wood lands on the ACES curve; it does not decide
  // whether wood beats the forest floor** — see `SWITCHBACK_PALETTE`.
  exposure: 1.06,
});

/**
 * The sun the forest is planted against — the descriptor's own two bearings.
 *
 * Resolved rather than read off `SWITCHBACK_LOOK` directly, so a field the park
 * ever stops authoring still yields the number the renderer would actually use
 * (`resolveVenueLook` fills a gap from `LIGHTING`) instead of `undefined`.
 */
export const SWITCHBACK_SUN: SunBearing = (() => {
  const look = resolveVenueLook(SWITCHBACK_LOOK);
  return Object.freeze({ azimuth: look.sunAzimuth, elevation: look.sunElevation });
})();

/**
 * What the park paints its existing materials with — §36.7's warm forest.
 *
 * **A retint, never an extension** (`LevelPlan.palette`): the keys are
 * `MaterialId`s the library already carries, so the draw-call set union is
 * untouched and this costs nothing on either axis. Every value is authored in
 * *linear* reflectance and converted (`DESIGN.md` §2), with the linear triple
 * beside it so the conversion can be checked rather than re-picked by eye.
 *
 * Three changes, and only one of them is a taste:
 *
 *   1. **`wood` is lifted by 60%**, and it is the one Phase 4 could not do
 *      without. §36.8 asks that a landing stay brighter and clearer than the
 *      dressing around it — and the kit ships `wood` at 0.0913 linear
 *      luminance against `dirt`'s 0.1075, so the venue's boardwalk landings
 *      were the *darkest* ground on it. Exposure cannot fix that: two surfaces
 *      in the same shadow are lit by the same hemisphere term, so what the eye
 *      compares is the ratio of their albedos and exposure scales both. At
 *      0.1461 the boardwalk beats the trail by 1.37x and the forest floor by
 *      1.95x, in sun and in shade alike.
 *   2. **`grass` drops by 23%** to a forest floor, so the hillside reads as
 *      what the lap is cut into rather than as a lawn it is laid on.
 *   3. **`dirt` keeps its luminance to the third decimal and moves its hue**
 *      — 0.1075 to 0.1070. The trail is the surface the rider is standing on
 *      and its readability is not something an art pass may spend; what it can
 *      have is the warmth, which is red up and blue down at the same value.
 *
 * `concrete` is untouched and stays the lightest material in the kit at 0.2859
 * (DESIGN.md §3's first rule), and `stone` at 0.2002 still reads well clear of
 * the retinted wood beside it.
 */
export const SWITCHBACK_PALETTE: Readonly<Partial<Record<MaterialId, number>>> = Object.freeze({
  /** linear (0.0513, 0.0865, 0.0319), Y 0.0751 — was (0.0561, 0.1144, 0.0452). */
  grass: 0x405332,
  /** linear (0.1470, 0.0999, 0.0595), Y 0.1070 — was (0.1384, 0.1022, 0.0685). */
  dirt: 0x6b5945,
  /** linear (0.1912, 0.1384, 0.0887), Y 0.1461 — was (0.1195, 0.0865, 0.0561). */
  wood: 0x796854,
});

// ---------------------------------------------------------------------------
// The corridors
// ---------------------------------------------------------------------------

/** The authored park, one `SegmentSpec` per element of the lap. */
/**
 * Bent lane arrows ahead of the hairpins (ride round 1, 2026-09-12).
 *
 * The owner's note was the clearing hairpin off the kicker's run-out — at the
 * fastest approach on the lap the bend "is a bit hard to notice". The same
 * instruction is painted before every hairpin whose approach has clean
 * ground for it, on the bypass half where a feature holds the technical half,
 * so the language is one language: a bent arrow means the trail turns.
 *
 * - `kicker-runout` (30 m, empty): two arrows on the bypass half, right.
 * - `timber` after the step-up deck (s 20–26): two on the bypass half, right,
 *   read across the nine metres of stairs into `timber-turn`.
 * - `rock-rhythm` beside the rhythm decks (s 8–38, t ≥ 1) and clear of the AIR
 *   pad (s 46.3+): two on the bypass half, left.
 * - `shelf-in` beside the spin shelf (s 8–20, t ≥ 1): one on the bypass half,
 *   left, for the R10 bend — the tightest on the lap.
 *
 * `timber-steps` is nine metres of treads and gets none; the stairs are ridden
 * at 15 mph and the arrows on `timber` are its warning.
 */
export const SWITCHBACK_TURN_ARROWS: readonly TurnArrow[] = Object.freeze([
  { segment: 'timber', s: 28, t: -2.5, turn: 'right' },
  { segment: 'timber', s: 37.5, t: -2.5, turn: 'right' },
  { segment: 'rock-rhythm', s: 28, t: -5.0, turn: 'left' },
  { segment: 'rock-rhythm', s: 38, t: -5.0, turn: 'left' },
  { segment: 'kicker-runout', s: 8, t: -2.5, turn: 'right' },
  { segment: 'kicker-runout', s: 19, t: -2.5, turn: 'right' },
  { segment: 'shelf-in', s: 9, t: -4.5, turn: 'left', across: 2.0 },
]);

const SWITCHBACK_TURN_ARROW_RUNS = turnArrowsBySegment(SWITCHBACK_TURN_ARROWS);
/** Wood under every arrow, for the same reason every sign has it: dirt takes no paint. */
export const SWITCHBACK_TURN_ARROW_PADS = turnArrowPadsBySegment(SWITCHBACK_TURN_ARROWS, SWITCHBACK_SIGN_PAD_MARGIN);

export const SWITCHBACK_GRAPH: readonly SegmentSpec[] = SWITCHBACK_GEOMETRY.map((segment) => {
  const feature = FEATURE_BLOCKS.get(segment.id);
  const hillside = SWITCHBACK_HILLSIDE_BLOCKS.get(segment.id);
  // The features first, so a corridor's own geometry keeps the array order it
  // had before Phase 4 dressed the hillside beside it.
  const blocks = feature === undefined && hillside === undefined
    ? undefined
    : [...(feature ?? []), ...(hillside ?? [])];
  // **The boardwalk patches come first, and the order is the point.**
  // `surfaceAtLateral` takes the first band whose span contains the query, and
  // the fire road already carries gravel margins from t = ±4 out. The crest's
  // chevrons reach t = 4.6, so a signage band listed after the gravel would
  // lose a wing of every chevron to it — measured, before this line was
  // written: three runs, one point each, gone whatever the margin.
  const signage = SWITCHBACK_SIGNAGE.bands.get(segment.id);
  const arrowPads = SWITCHBACK_TURN_ARROW_PADS.get(segment.id);
  const bands = signage === undefined && arrowPads === undefined
    ? segment.bands
    : [...(arrowPads ?? []), ...(signage ?? []), ...(segment.bands ?? [])];
  const signageRuns = SWITCHBACK_SIGNAGE.markings.get(segment.id);
  const arrowRuns = SWITCHBACK_TURN_ARROW_RUNS.get(segment.id);
  const markings = signageRuns === undefined && arrowRuns === undefined
    ? undefined
    : [...(signageRuns ?? []), ...(arrowRuns ?? [])];
  const signs = SWITCHBACK_SIGNAGE.props.get(segment.id);
  const landmarks = SWITCHBACK_LANDMARKS.get(segment.id);
  // Signs before landmarks, which is also the order `resolveStructuralConflicts`
  // would settle a contest in (`signpost` outranks `fenceBay` and `bench`) —
  // they are placed so that no contest arises, and the order says which way it
  // would go if one ever did.
  const props = signs === undefined && landmarks === undefined
    ? undefined
    : [...(signs ?? []), ...(landmarks ?? [])];
  const spec: SegmentSpec = {
    id: segment.id,
    length: segment.length,
    halfWidth: segment.halfWidth,
    surface: segment.surface,
    shoulder: PARK.shoulder,
    ...(segment.curvature === 0 ? {} : { curvature: segment.curvature }),
    ...(segment.climb === 0 ? {} : { climb: segment.climb }),
    ...(segment.linearClimb ? { linearClimb: true } : {}),
    ...(bands === undefined ? {} : { bands }),
    ...(blocks === undefined ? {} : { blocks }),
    ...(markings === undefined ? {} : { markings: [...markings] }),
    ...(props === undefined ? {} : { props }),
  };
  return spec;
});

/** The lap's own corridors, in riding order. Every corridor here is the lap. */
export const SWITCHBACK_LAP_SEGMENT_IDS: readonly string[] = SWITCHBACK_GEOMETRY
  .map((segment) => segment.id);

/**
 * On the summit apron, six metres in, facing the lap.
 *
 * **The height is chosen so the surround lands on zero.** Everything on this
 * venue descends from here, the low point is 14.2 m below it, and
 * `SWITCHBACK_SURROUND` is a metre under the lowest ground rounded down — so
 * sixteen metres at the top puts the field's floor at exactly 0 and every
 * height in the plan is a positive number a reader can hold in their head.
 *
 * The XZ offset centres the venue's footprint on the world origin, which is
 * what keeps a 300 m-wide hillside inside `TERRAIN.surroundBackstopHalfExtent`
 * with room to spare, and the heading points the apron west (see the compass
 * note at the top of this file).
 */
export const SWITCHBACK_SPAWN: { position: Vec3; headingY: number } = {
  position: { x: 16, y: 16, z: -100 },
  headingY: -Math.PI / 2,
};

/** The lap, placed once, so everything below measures the same geometry. */
const PLACED: readonly PlacedSegment[] = placeChain(SWITCHBACK_GRAPH, SWITCHBACK_SPAWN);

// ---------------------------------------------------------------------------
// The hillside
// ---------------------------------------------------------------------------

/** How far apart the trail is sampled to build the hill from it, metres. */
const CHAIN_SAMPLE_SPACING = 2;

/**
 * The Gaussian kernel's standard deviation, metres.
 *
 * Forty-five is a little over half the shortest distance between two
 * switchback legs, which is the scale that matters: narrower and the hill
 * would follow each leg individually and leave a ridge between every pair of
 * them; wider and the whole site would average to one plane and the trail would
 * sit in a cutting at the top and on an embankment at the bottom. At this width
 * the measured worst case is 2.10 m of cut or fill anywhere on the lap.
 */
const GROUND_KERNEL = 45;

/** Inside this distance of the trail, the ground is the hill's own. */
const GROUND_FLAT_RADIUS = 12;

/** And past this, it is the surround. The fade between them is a smoothstep. */
const GROUND_FADE_RADIUS = 42;

function ease01(u: number): number {
  return u * u * (3 - 2 * u);
}

/** The trail's centreline, every two metres, in world space. */
const CHAIN_SAMPLES: readonly { readonly x: number; readonly y: number; readonly z: number }[] =
  (() => {
    const out: { x: number; y: number; z: number }[] = [];
    for (const segment of PLACED) {
      const divisions = Math.max(1, Math.ceil(segment.spec.length / CHAIN_SAMPLE_SPACING));
      for (let division = 0; division <= divisions; division += 1) {
        const point = centrelineAt(
          segment.entry,
          segment.spec,
          (division / divisions) * segment.spec.length,
        );
        out.push({ x: point.x, y: point.y, z: point.z });
      }
    }
    return out;
  })();

/**
 * The lowest and highest ground the trail touches, metres.
 *
 * Measured on the samples rather than on the sockets, which is the same answer
 * here — every climb profile is monotonic, so an extreme is always at an end —
 * and stays the right answer if one ever is not.
 */
const CHAIN_LOW = Math.min(...CHAIN_SAMPLES.map((sample) => sample.y));
const CHAIN_HIGH = Math.max(...CHAIN_SAMPLES.map((sample) => sample.y));

/**
 * Grass, a whole metre under the lowest ground the trail reaches.
 *
 * The surround is what the hillside fades *to* at the edge of the field, and
 * `buildPlan` measures the border ring and refuses anything else. A metre of
 * clearance under the low point keeps the fade descending all the way out, so
 * the park sits on a rise in a field rather than in a saucer.
 */
export const SWITCHBACK_SURROUND = Object.freeze({
  height: Math.floor(CHAIN_LOW - 1),
  surface: 'grass' as SurfaceId,
});

/** Total height spent on the way down, metres. */
export const SWITCHBACK_DESCENT_METRES = CHAIN_HIGH - CHAIN_LOW;

/**
 * The hillside, as a height at any world point — `BuildOptions.groundAt`.
 *
 * **A hill built from the trail that is cut into it**, which is the only
 * source of shape this graybox has and is the right one: a switchback descent
 * *is* a description of a slope, sampled every two metres, and the surface that
 * fits it is the surface it was cut from. The kernel-weighted mean does the
 * fitting; nothing here is noise, a fractal or a seed, so the hill is the same
 * on every boot by construction rather than by discipline (`DESIGN.md` §4).
 *
 * Three parts, and each answers something:
 *
 *   1. **The mean.** Every trail sample, weighted `exp(-d² / 2σ²)`. Near the
 *      trail it is dominated by the trail; between two switchbacks it is the
 *      average of both, which is what a slope between two cuts looks like.
 *   2. **The fade.** One inside `GROUND_FLAT_RADIUS`, zero past
 *      `GROUND_FADE_RADIUS`, smoothstepped between. Past the far radius this
 *      returns `surround.height` *exactly*, which is what lets the builder's
 *      border-ring contract be met rather than approximated — and
 *      `SWITCHBACK_FIELD_MARGIN` is derived from the same radius so the ring is
 *      always out there.
 *   3. **The fallback.** An empty or vanishing weight sum answers with the
 *      nearest sample's height instead of dividing by zero. It cannot happen at
 *      the scales here — the field is 300 m across and σ is 45 — and a height
 *      function that could return `NaN` at any input is a heightfield full of
 *      holes, so it is answered rather than assumed away.
 *
 * Exported so the test can measure the hill against the trail directly, which
 * is where "honest shoulders" is asserted.
 */
export function switchbackGroundAt(x: number, z: number): number {
  const floor = SWITCHBACK_SURROUND.height;
  const spread = 2 * GROUND_KERNEL * GROUND_KERNEL;

  let weight = 0;
  let weighted = 0;
  let nearestSquared = Infinity;
  let nearestHeight = floor;

  for (const sample of CHAIN_SAMPLES) {
    const dx = x - sample.x;
    const dz = z - sample.z;
    const squared = dx * dx + dz * dz;
    if (squared < nearestSquared) {
      nearestSquared = squared;
      nearestHeight = sample.y;
    }
    const kernel = Math.exp(-squared / spread);
    weight += kernel;
    weighted += kernel * sample.y;
  }

  const mean = weight > 1e-12 ? weighted / weight : nearestHeight;
  const distance = Math.sqrt(nearestSquared);
  if (distance >= GROUND_FADE_RADIUS) return floor;
  const fade = distance <= GROUND_FLAT_RADIUS
    ? 1
    : 1 - ease01((distance - GROUND_FLAT_RADIUS) / (GROUND_FADE_RADIUS - GROUND_FLAT_RADIUS));
  return floor + (mean - floor) * fade;
}

/**
 * How many metres of heightfield the hill needs outside the corridors.
 *
 * **Derived from the fade radius and the narrowest corridor, not chosen.** The
 * builder refuses to emit a plan whose border ring is not the surround, and
 * `switchbackGroundAt` returns the surround exactly once a point is
 * `GROUND_FADE_RADIUS` from the trail. The field's bounds already reach one
 * corridor half-width plus one shoulder beyond the centreline, so what is left
 * to buy is the difference — measured against the *narrowest* corridor, because
 * the border runs past all of them and the tightest is the one that decides.
 * `buildPlan` then adds two more cells of its own on top, which is bonus rather
 * than budget.
 */
export const SWITCHBACK_FIELD_MARGIN = Math.max(
  0,
  GROUND_FADE_RADIUS - Math.min(...SWITCHBACK_GRAPH.map((spec) => spec.halfWidth + PARK.shoulder)),
);

// ---------------------------------------------------------------------------
// The forest
// ---------------------------------------------------------------------------

/**
 * The drawn field, in world XZ — the rectangle the forest is planted inside.
 *
 * Derived exactly as `buildLevelPlan` derives it: every corridor's own bounds
 * already reach one half-width and one shoulder past its centreline, then the
 * venue's `fieldMargin`, then the builder's two cells of pad. Reproduced here
 * rather than read off a built plan because the forest is an *input* to that
 * plan, and `switchbackLevel.test.ts` measures this rectangle against the
 * heightfield the builder actually emits.
 */
export const SWITCHBACK_FIELD_BOUNDS = Object.freeze({
  minX: Math.min(...PLACED.map((segment) => segment.minX)) - SWITCHBACK_FIELD_MARGIN,
  maxX: Math.max(...PLACED.map((segment) => segment.maxX)) + SWITCHBACK_FIELD_MARGIN,
  minZ: Math.min(...PLACED.map((segment) => segment.minZ)) - SWITCHBACK_FIELD_MARGIN,
  maxZ: Math.max(...PLACED.map((segment) => segment.maxZ)) + SWITCHBACK_FIELD_MARGIN,
});

/**
 * How far apart the forest's lattice sites sit, metres — the one density lever.
 *
 * **Chosen against `PROP_BUDGET`, and it is the only number here that was.**
 * Every other figure in `parkDressing.ts` is a clearance derived from the
 * camera or the corridor; this one decides how much forest there is, and it was
 * swept: 6.5 m puts the prop family over the 90,000-triangle ceiling on the
 * enhanced recipe, 7.0 m lands it at about four fifths of it, and 8.0 m starts
 * to read as parkland rather than woods from the chase camera. Seven and a
 * quarter is the sweep's answer with a fifth of the budget still unspent, which
 * is what §36.7's "price trees, shrubs, signs, supports and terrain cells
 * together" asks for.
 */
export const SWITCHBACK_FOREST_LATTICE = 7.25;

/**
 * How far inside the field's own edge the last tree stands, metres.
 *
 * A conifer at full scale is 2.75 m across its widest tier, and the outermost
 * ring of the heightfield is pure surround by contract (`switchbackGroundAt`).
 * Four metres keeps the whole of the widest crown over drawn ground, so no tree
 * on this venue is standing half on the backstop plane.
 */
export const SWITCHBACK_FOREST_MARGIN = 4;

/**
 * The forest — every tree and shrub on the hillside, in world XZ.
 *
 * Level-scope dressing (`BuildOptions.props`), for BelVar's reason: it belongs
 * to the hill rather than to whichever switchback points at it. Everything it
 * yields to — the nine signposts, the rails, the benches, the hillside's own
 * cribbing and riprap — is read back off the placed chain, so nothing has to be
 * listed in two places for the forest to keep clear of it.
 *
 * **Nothing here is dropped by the builder.** `switchbackLevel.test.ts` builds
 * the plan and counts: every prop authored above survives `standsOnCorridor`,
 * `standsInCollider`, the building pass and `resolveStructuralConflicts`. A
 * forest that is quietly one-tenth thinner than its author thinks is a forest
 * whose budget means nothing.
 */
export const SWITCHBACK_FOREST: readonly PlacedProp[] = plantForest({
  placed: PLACED,
  technical: SWITCHBACK_TECHNICAL_CORRIDORS,
  exclusions: [...propExclusions(PLACED), ...blockExclusions(PLACED)],
  bounds: SWITCHBACK_FIELD_BOUNDS,
  lattice: SWITCHBACK_FOREST_LATTICE,
  margin: SWITCHBACK_FOREST_MARGIN,
  // The venue's own light decides the treeline round everything a rider
  // commits to, and it is the descriptor's own two numbers that decide it.
  sun: SWITCHBACK_SUN,
});

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

/**
 * The start/finish line and the two sector lines — the same three-gate pattern
 * BelVar uses, and for §36.7's reason: gate geometry is charged to the
 * non-level reserve, so a venue that wanted a gate per feature would spend its
 * dressing on gantries.
 *
 * **There is no `finish`**, which is the spelling of a lap rather than an
 * omission — `buildPlan.lapCourse` reads it, `TrackDayRun` and `RaceRun` accept
 * it, and `ChallengeRun` declines the venue on its own terms with no branch
 * anywhere on which level is loaded.
 *
 * Where each one sits, and why:
 *
 * - **the line**, 62 m along the level apron. Far enough past the summit turn's
 *   exit that a lap is timed from a rider at speed, and eighteen metres short of
 *   the descent's entrance so nobody is braking as they cross it.
 * - **sector 1**, 12 m into `kicker-approach`, closing the terraces, the timber
 *   line and the rock rhythm. The gate is on a straight with the whole
 *   technical third behind it and the kicker in front.
 * - **sector 2**, 30 m up `fire-road-1`, closing the kicker and the spin shelf.
 *   The rider is climbing in a straight line through it.
 *
 * That splits 949 m into 338 / 343 / 268, and each third is a stretch a rider
 * can name. Every gate is on a straight, clear of both its sockets by more than
 * the gate's own depth, and on a corridor that carries **no blocks at all** —
 * §36.3's "sector gates on common ground", which here means the gate spans a
 * width both the technical half and the bypass half ride through.
 */
export const SWITCHBACK_CHECKPOINTS: readonly CheckpointSpec[] = [
  { id: 'line', segment: 'apron', s: PARK.lineAt, kind: 'start', label: 'Start/finish' },
  { id: 'sector-1', segment: 'kicker-approach', s: 12, kind: 'split', label: 'Sector 1' },
  { id: 'sector-2', segment: 'fire-road-1', s: 30, kind: 'split', label: 'Sector 2' },
];

// The out-lap is a promise the referee makes, so it is checked at module load
// rather than left to the test: a spawn that crept past the line would mint a
// lap the moment the session armed.
if (PARK.lineAt - PARK.spawnAt <= CHALLENGE.startRunupMetres * 3) {
  throw new Error(
    `the out-lap is ${PARK.lineAt - PARK.spawnAt} m, which is not three run-ups`,
  );
}

// ---------------------------------------------------------------------------
// The venue
// ---------------------------------------------------------------------------

/**
 * Build Switchback Park.
 *
 * **`-r4` is room to retire records, not decoration** — BelVar's rule. A lap
 * time is filed under this string, and a time set on a layout that has since
 * moved is a lie the store cannot detect. Ordinary Phase 1 Track Day laps
 * already filed under `switchback-r1`, and Phase 2 moved the layout: beat 5
 * gained a take-off pitch and a twenty-six metre table, the gap's landing deck
 * dropped five centimetres and `bottom` lost thirty-two metres to the closure.
 * Phase 6 moved it again, and by more: the clearing hairpin tightened from R18
 * to R15 and narrowed by a metre so a rider could no longer cross out of it
 * onto the fire road (`SEPARATION_CLEAR_METRES`), which re-solved the ring and
 * took fifteen metres off the lap. The owner's first rides moved beat 5 a
 * third time (`-r4`): the rise grew to three metres, the table shrank to
 * twelve and the 12.5% descent became a 30% landing hill — the same 114 m of
 * straight and the same 3.66 m of height, so the ring and the lap's length are
 * untouched, but a lap through it is a different lap. Every one of those
 * changes a lap time, so the id is bumped each time and the older records
 * retire with the layout they were set on.
 *
 * **Phase 4 dresses the accepted geometry, and moves none of it.** Phase 1
 * shipped no props, no paint and no palette because a line is cheap to change
 * at gate G1 and expensive to change once it has trees standing in it; Phase 2
 * signed it; this adds the forest, the hillside's own cribbing and riprap,
 * three landmarks, a warm retint of three existing materials and the venue's
 * own late-afternoon light. Every one of them is off the corridor, and
 * `switchbackLevel.test.ts` rides the lap twice afterwards to say so.
 *
 * **The light is the only part of this that is not dressing**, and it is the
 * only part that reaches back into the dressing: `SWITCHBACK_LOOK` fixes the
 * sun at 0.58 rad, which lengthens every shadow to 1.53 times its caster and
 * is what sets the forest's setback round the landings (`SWITCHBACK_SUN`).
 *
 * `settleBlocks` is on for the reason the generator turns it on: a block is
 * authored in its corridor's frame and carried *down* onto the finished field,
 * never up, so its top face — the thing a rider mounts, lands on and is stopped
 * by — is exactly where `parkFeatures` measured it, while its foundation
 * reaches whatever ground the hillside put underneath.
 *
 * `spacing: 1.5` rather than the default metre, and it is the largest single
 * number in this venue's bill. A `groundAt` hill draws *every* cell of its
 * field, where a flat surround draws none off the corridors, so the grid is the
 * cost: measured on the dressed park at 67,552 cells and 229,902 triangles on
 * a one-metre grid, 30,379 and 155,828 here, and 16,864 and 128,830 at two
 * metres — about ninety-five thousand triangles of corridor, block and prop
 * under all three, and the rest is grid. Two is cheaper
 * again and starts to show the corridor edges as a staircase; 1.5 is where
 * slopes tens of metres long still read and the edges do not.
 */
export function createSwitchbackLevel(
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): LevelPlan {
  return buildLevelPlan(SWITCHBACK_GRAPH, {
    id: 'switchback-r4',
    spawn: SWITCHBACK_SPAWN,
    surround: { ...SWITCHBACK_SURROUND },
    spacing: SWITCHBACK_FIELD_SPACING,
    settleBlocks: true,
    groundAt: switchbackGroundAt,
    fieldMargin: SWITCHBACK_FIELD_MARGIN,
    checkpoints: SWITCHBACK_CHECKPOINTS,
    // The hillside's forest: level dressing rather than any one corridor's, so
    // it keeps the shape of the hill instead of snaking around every switchback.
    props: SWITCHBACK_FOREST,
    palette: SWITCHBACK_PALETTE,
    // The one world that authors a light of its own. Everything else — BelVar,
    // the slice, the proving ground, every generated route — emits no `look`
    // key at all and resolves to the daylight it shipped with, byte for byte
    // (`data/venueLook.ts`, `level/planDigest.test.ts`).
    look: SWITCHBACK_LOOK,
    // `settleProps` stays off, which is BelVar's choice and this venue's too.
    // It exists for a *generator*, whose dressing nobody looked at: it sinks a
    // prop to the lowest ground under it and refuses anything on a bank over
    // `PROP_MAX_GROUND_SLOPE`. Turning it on here would also re-resolve Phase
    // 2's nine signposts, whose positions are pinned, to fix a problem the
    // forest's own clearances already answer — every tree stands at least four
    // metres outside a corridor, which on this venue's twelve-metre shoulders
    // is ground the hill itself decides rather than the cutting.
    ...(hazardProbeMetres === undefined ? {} : { hazardProbeMetres }),
    ...(targetProbeMetres === undefined ? {} : { targetProbeMetres }),
  });
}
