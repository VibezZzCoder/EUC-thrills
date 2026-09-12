/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TRACK_DAY } from '../data/tuning.ts';
import { buildLevelPlan, type CheckpointSpec } from '../level/buildPlan.ts';
import type { LapCourse, LevelPlan } from '../level/plan.ts';
import {
  corridorHeightAt,
  deck,
  lip,
  stairs,
  steppedDecks,
  type CorridorProfile,
} from '../level/parkFeatures.ts';
import type { SegmentSpec } from '../level/segments.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { Fixture, LandedOn } from './jumpBench.ts';

/**
 * The M36 Phase 0 feature fixtures — "minimal representative feature fixtures
 * through `buildLevelPlan` and `PlanTerrainSampler`" (§36.8 Phase 0).
 *
 * Every fixture here is **one straight corridor along +Z from a spawn at the
 * origin**, so a fixture's `s` frame and world `z` are the same number and a
 * measured touchdown can be quoted against an authored dimension without a
 * projection. The surround is the corridor's own surface at the corridor's own
 * starting height, which is `EucController.test.ts`'s `flatPlan` idea: a rider
 * who leaves the authored corridor carries on over ground identical in every
 * respect, so `offCourse` is the only thing that changes and no fixture has an
 * invisible wall or a cliff at its edge doing part of the measuring.
 *
 * **The geometry is built by `level/parkFeatures.ts`, not by this file.** A
 * bench that authored its own blocks would measure a deck the venue producer
 * will never build; every deck, stepped rhythm, staircase and lip below comes
 * out of the same builders §36 Phase 1 will author the park with, and each
 * fixture reports the builder's own declared heights in `geometry` so the
 * printed table ties a result to a dimension.
 *
 * Plans are cached by their parameters. A `LevelPlan` is plain immutable data
 * (invariant 2) and every trial builds its own `PlanTerrainSampler` and its own
 * controller over it, so sharing one costs nothing and changes nothing.
 */

const HALF_WIDTH = 6;
const SHOULDER = 2;

/** How close a touchdown must be to a declared deck top to count as on it. */
const DECK_TOLERANCE = 0.06;

const cache = new Map<string, LevelPlan>();

function cachedPlan(key: string, build: () => LevelPlan): LevelPlan {
  const found = cache.get(key);
  if (found !== undefined) return found;
  const plan = build();
  cache.set(key, plan);
  return plan;
}

/**
 * One straight chain, built the way every fixture here is built.
 *
 * `settleBlocks` is on for the reason `BuildOptions` gives: a deck authored
 * against a corridor that falls beneath it would otherwise keep its default
 * 0.6 m foundation and hang over ground that has dropped further than that.
 * It moves bases down and never moves a top, so no measured height changes.
 */
function straightPlan(
  id: string,
  specs: readonly SegmentSpec[],
  options: {
    readonly spawnZ?: number;
    readonly checkpoints?: readonly CheckpointSpec[];
  } = {},
): LevelPlan {
  return buildLevelPlan(specs, {
    id,
    spawn: { position: { x: 0, y: 0, z: options.spawnZ ?? 0 }, headingY: 0 },
    surround: { height: 0, surface: specs[0].surface },
    settleBlocks: true,
    ...(options.checkpoints === undefined ? {} : { checkpoints: options.checkpoints }),
  });
}

function round(value: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function nothingSpecial(): LandedOn {
  return 'other';
}

/**
 * How much level ground a bang-bang run-up needs to reach `mph`, metres.
 *
 * **A fixed run-up is wrong at both ends.** 240 m is the wrong answer for an
 * 8 mph trial — the wheel spends seventy seconds of simulated time crawling to
 * the lip and the trial's step cap expires before it arrives — and 40 m is the
 * wrong answer for 58 mph, where the wheel simply never gets there. Three
 * metres per mph is comfortably above what the shipped wheel actually needs
 * (about 87 m at 58 mph, measured) at every speed these tables sweep, with a
 * floor so a slow row still has room to settle.
 */
export function runupFor(mph: number): number {
  return Math.max(40, Math.ceil(mph * 3));
}

// ---------------------------------------------------------------------------
// Flat — the §36.2a hop protocol's own ground
// ---------------------------------------------------------------------------

/**
 * 400 m of level `surface`, for the flat hop tables.
 *
 * `lipS` is null: nothing launches here but the hop itself, which is exactly
 * what §36.2a's first table isolates.
 */
export function flatFixture(surface: SurfaceId = 'pavement', length = 400): Fixture {
  const plan = cachedPlan(`flat-${surface}-${length}`, () => straightPlan(
    `bench-flat-${surface}`,
    [{ id: 'flat', length, halfWidth: HALF_WIDTH, surface, shoulder: SHOULDER }],
  ));
  return {
    plan,
    lipS: null,
    classify: nothingSpecial,
    endS: Number.POSITIVE_INFINITY,
    label: `flat ${surface}, ${length} m`,
    geometry: [`level corridor, half-width ${HALF_WIDTH} m, surface ${surface}`],
  };
}

// ---------------------------------------------------------------------------
// Drop — §36.2a's raised block, with a landing surface and a landing grade
// ---------------------------------------------------------------------------

export interface DropOptions {
  readonly approach?: number;
  readonly drop: number;
  readonly landingSurface: SurfaceId;
  /** Zero or negative. The landing's linear gradient. */
  readonly landingGrade: number;
  readonly deckSurface?: SurfaceId;
}

/**
 * A level deck ending over a landing corridor — §36.2a's "40 m of level wood
 * ending over a flat landing", with the landing's surface and gradient opened
 * up as the two axes §36.4 requires ("landing normals", "landing slopes").
 *
 * The deck is a block on the level approach and the landing is the next
 * segment, so the drop the rider actually takes is the deck top minus the
 * landing surface at the lip — reported in the label, because §36.2 item 2 is
 * the whole warning: the slice's kicker is a 1.05 m branch offset and a 1.20 m
 * drop, and copying the first number into a feature contract measures the
 * wrong two surfaces.
 */
export interface DropFixture extends Fixture {
  /** Deck top minus the landing surface at the lip — the drop actually taken. */
  readonly lipDrop: number;
  readonly deckTop: number;
}

export function dropFixture(options: DropOptions): DropFixture {
  const approach = options.approach ?? 40;
  const { drop, landingSurface, landingGrade } = options;
  const deckSurface = options.deckSurface ?? 'wood';
  const landingLength = 80;
  const key = `drop-${approach}-${drop}-${landingSurface}-${landingGrade}-${deckSurface}`;

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [
    {
      id: 'approach',
      length: approach,
      halfWidth: HALF_WIDTH,
      surface: landingSurface,
      shoulder: SHOULDER,
      blocks: deck(
        { length: approach },
        {
          from: 0,
          length: approach,
          t: 0,
          halfLateral: HALF_WIDTH,
          lift: drop,
          surface: deckSurface,
          depth: drop + 4,
        },
      ).blocks,
    },
    {
      id: 'landing',
      length: landingLength,
      climb: landingGrade * landingLength,
      linearClimb: true,
      halfWidth: HALF_WIDTH,
      surface: landingSurface,
      shoulder: SHOULDER,
    },
  ]));

  const deckTop = drop;
  return {
    plan,
    lipS: approach,
    lipDrop: deckTop,
    deckTop,
    endS: approach + landingLength - 4,
    classify: (y: number): LandedOn => (y >= deckTop - DECK_TOLERANCE ? 'deck' : 'other'),
    label: `drop ${round(drop, 2)} m onto ${landingSurface} at grade ${landingGrade}`,
    geometry: [
      `deck top +${round(deckTop, 3)} m, ${approach} m of level ${deckSurface}; lip at s=${approach}`,
      `landing ${landingSurface}, linear grade ${landingGrade}, ${landingLength} m`,
      `actual lip drop (deck top − landing surface at the lip) = ${round(deckTop, 3)} m`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Gap — two stepped decks over lower catch ground
// ---------------------------------------------------------------------------

export interface GapOptions {
  readonly gap: number;
  readonly deckLift?: number;
  readonly stepDown: number;
  readonly landingLength?: number;
  readonly surface?: SurfaceId;
  readonly catchSurface?: SurfaceId;
  readonly grade?: number;
}

/**
 * A straight gap between two decks, with rideable catch ground beneath it.
 *
 * §36.3: "Jump gaps have lower rideable catch ground", and §36.4's recovery
 * line for a straight gap is "broad lower catch ground continues to the same
 * merge". So a rider who comes up short lands on the corridor between the
 * decks rather than in a hole, and `gapCatchDrops[0]` is how far that fall is.
 *
 * The run-up is a wide deck flush with the first stepped deck, because the
 * first deck stands `deckLift` proud of its own corridor and a rider cannot
 * roll up a half-metre face — the approach has to be the deck, which is what a
 * park's entrance ramp is.
 */
export interface GapFixture extends Fixture {
  /** Deck 1 top minus the corridor in the middle of the gap. */
  readonly catchDrop: number;
  /** Deck 1 top minus deck 2 top. */
  readonly deckDrop: number;
  readonly takeOffTop: number;
  readonly landingTop: number;
  readonly gap: number;
}

export function gapFixture(options: GapOptions): GapFixture {
  const gap = options.gap;
  const deckLift = options.deckLift ?? 0.5;
  const stepDown = options.stepDown;
  const landingLength = options.landingLength ?? 12;
  const surface = options.surface ?? 'wood';
  const catchSurface = options.catchSurface ?? 'dirt';
  const grade = options.grade ?? -0.04;
  const approach = 60;
  const runLength = 2 * landingLength + gap + 24;
  const key = `gap-${gap}-${deckLift}-${stepDown}-${landingLength}-${surface}-${catchSurface}-${grade}`;

  const runProfile: CorridorProfile = {
    length: runLength,
    climb: grade * runLength,
    linearClimb: true,
  };
  const pair = steppedDecks(runProfile, {
    from: 0,
    count: 2,
    deckLength: landingLength,
    gap,
    stepDown,
    t: 0,
    halfLateral: HALF_WIDTH,
    lift: deckLift,
    surface,
    depth: 4,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [
    {
      id: 'approach',
      length: approach,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
      blocks: deck(
        { length: approach },
        {
          from: 0,
          length: approach,
          t: 0,
          halfLateral: HALF_WIDTH,
          lift: deckLift,
          surface,
          depth: 4,
        },
      ).blocks,
    },
    {
      id: 'run',
      length: runLength,
      climb: grade * runLength,
      linearClimb: true,
      halfWidth: HALF_WIDTH,
      surface: catchSurface,
      shoulder: SHOULDER,
      blocks: pair.blocks,
    },
  ]));

  const landingTop = pair.decks[1].top;
  return {
    plan,
    lipS: approach + landingLength,
    catchDrop: pair.gapCatchDrops[0],
    deckDrop: pair.drops[0],
    takeOffTop: pair.decks[0].top,
    landingTop,
    gap,
    endS: approach + runLength - 4,
    classify: (y: number): LandedOn => (y >= landingTop - DECK_TOLERANCE ? 'deck' : 'catch'),
    label: `gap ${round(gap, 2)} m, step down ${round(stepDown, 2)} m`,
    geometry: [
      `run-up deck ${surface} top +${round(deckLift, 3)} m, ${approach} m, flush with deck 1`,
      `deck 1 top +${round(pair.decks[0].top, 3)} m, ${landingLength} m; take-off lip at s=${approach + landingLength}`,
      `deck 2 top +${round(landingTop, 3)} m, ${landingLength} m; deck-to-deck fall ${round(pair.drops[0], 3)} m`,
      `catch ground ${catchSurface} at grade ${grade}; catch drop into the gap ${round(pair.gapCatchDrops[0], 3)} m`,
      `run-out drop off deck 2 ${round(pair.drops[1], 3)} m`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Step-up — the charged mount
// ---------------------------------------------------------------------------

export interface StepUpOptions {
  readonly rise: number;
  readonly length?: number;
  readonly surface?: SurfaceId;
  readonly grade?: number;
}

/**
 * A deck face standing in the road — §36.4's charged step-up.
 *
 * "Charged clears with margin; uncharged is refused at the face." The refusal
 * is the controller's own: `advance` declines the part of a move that enters a
 * solid and raises `blocked`, which is the bonk this fixture measures rather
 * than a rule the bench applies.
 */
export interface StepUpFixture extends Fixture {
  /** The face at the deck's uphill end — what the wheel has to clear. */
  readonly face: number;
  readonly top: number;
}

export function stepUpFixture(options: StepUpOptions): StepUpFixture {
  const rise = options.rise;
  const length = options.length ?? 8;
  const surface = options.surface ?? 'wood';
  const grade = options.grade ?? 0;
  const approach = 60;
  const total = approach + length + 30;
  const key = `stepup-${rise}-${length}-${surface}-${grade}`;

  const profile: CorridorProfile = {
    length: total,
    climb: grade * total,
    linearClimb: true,
  };
  const shelf = deck(profile, {
    from: approach,
    length,
    t: 0,
    halfLateral: HALF_WIDTH,
    lift: rise,
    surface,
    depth: 2,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [{
    id: 'run',
    length: total,
    climb: grade * total,
    linearClimb: true,
    halfWidth: HALF_WIDTH,
    surface: 'pavement',
    shoulder: SHOULDER,
    blocks: shelf.blocks,
  }]));

  return {
    plan,
    lipS: approach,
    face: shelf.entryFace,
    top: shelf.top,
    endS: total - 4,
    classify: (y: number): LandedOn => (y >= shelf.top - DECK_TOLERANCE ? 'deck' : 'other'),
    label: `step-up ${round(rise, 2)} m`,
    geometry: [
      `face at s=${approach}, rise ${round(shelf.entryFace, 3)} m, deck ${length} m of ${surface}`,
      `deck top +${round(shelf.top, 3)} m; drop off its far end ${round(shelf.exitDrop, 3)} m`,
      `corridor grade ${grade}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Lip and crest — proving a crest can create air through the existing path
// ---------------------------------------------------------------------------

export interface LipOptions {
  readonly riseOver?: number;
  readonly rise?: number;
  readonly eased?: boolean;
  /** The drop at the lip itself, metres. Zero is a crest with no face. */
  readonly lipHeight: number;
  readonly reach?: number;
  readonly lead?: number;
  readonly landingGrade: number;
  readonly landingLinear?: boolean;
  readonly landingLength?: number;
  readonly runout?: number;
  readonly surface?: SurfaceId;
  /** The bypass half: the same hill with no lip block at all. */
  readonly smoothSide?: boolean;
  readonly runup?: number;
}

/**
 * A crest with an authored lip, and the same crest without one.
 *
 * §36.2 item 3 is the thing this fixture exists to prove: "The controller
 * leaves ground when the sampled fall exceeds the previous slope's prediction
 * by `dropLaunchThreshold` ... Ordinary smooth hills remain grounded. A rounded
 * hill does not acquire airborne cresting just because its drawing looks
 * convex." So the lip is a level block whose far end stands `lipHeight` above
 * the corridor — a face — and `smoothSide` is the identical hill with the block
 * removed, which must stay on the ground at every speed the wheel can reach.
 *
 * **`lipHeight` is the drop at the lip, not the block's authored height.** The
 * eased rise is still climbing under the block, so the two differ; the fixture
 * compensates and then reports `lip()`'s own `dropAtLip` and `stepUpAtStart`
 * in its geometry, which is what §36.4 asks a feature record to carry.
 */
export interface LipFixture extends Fixture {
  /** The face at the lip — zero on the smooth side, which has no block. */
  readonly dropAtLip: number;
  /** The kerb the wheel mounts to get onto the lip block. */
  readonly stepUpAtStart: number;
  readonly crestY: number;
  readonly landingGrade: number;
}

export function lipFixture(options: LipOptions): LipFixture {
  const riseOver = options.riseOver ?? 14;
  const rise = options.rise ?? 0.9;
  const eased = options.eased ?? true;
  const reach = options.reach ?? 2;
  const lead = options.lead ?? 1;
  const landingGrade = options.landingGrade;
  const landingLinear = options.landingLinear ?? true;
  const landingLength = options.landingLength ?? 30;
  const runout = options.runout ?? 20;
  const surface = options.surface ?? 'dirt';
  const smooth = options.smoothSide === true;
  const runup = options.runup ?? 240;
  const key = `lip-${riseOver}-${rise}-${eased}-${options.lipHeight}-${reach}-${lead}`
    + `-${landingGrade}-${landingLinear}-${landingLength}-${runout}-${surface}-${smooth}-${runup}`;

  const riseProfile: CorridorProfile = {
    length: riseOver,
    climb: rise,
    linearClimb: !eased,
  };
  const at = riseOver - reach;
  // The block's `height` is measured at `at`; the fall the wheel launches off
  // is measured at `at + reach`. On a corridor still rising between the two,
  // asking for a 0.10 m lip and writing 0.10 as the height would author a
  // smaller face than the table says it measured.
  const correction = corridorHeightAt(riseProfile, at + reach, 0)
    - corridorHeightAt(riseProfile, at, 0);
  const crest = lip(riseProfile, {
    at,
    lead,
    reach,
    height: options.lipHeight + correction,
    t: 0,
    halfLateral: HALF_WIDTH,
    surface,
    depth: 2,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [
    { id: 'runup', length: runup, halfWidth: HALF_WIDTH, surface, shoulder: SHOULDER },
    {
      id: 'rise',
      length: riseOver,
      climb: rise,
      linearClimb: !eased,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
      ...(smooth ? {} : { blocks: crest.blocks }),
    },
    {
      id: 'landing',
      length: landingLength,
      climb: landingGrade * landingLength,
      linearClimb: landingLinear,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
    },
    {
      id: 'runout',
      length: runout,
      climb: -0.03 * runout,
      linearClimb: true,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
    },
  ]));

  const lipS = runup + riseOver;
  return {
    plan,
    lipS,
    endS: runup + riseOver + landingLength + runout - 3,
    dropAtLip: smooth ? 0 : crest.dropAtLip,
    stepUpAtStart: smooth ? 0 : crest.stepUpAtStart,
    crestY: rise,
    landingGrade,
    classify: nothingSpecial,
    label: smooth
      ? `smooth side (no lip), grade ${landingGrade}`
      : `lip ${round(options.lipHeight, 2)} m, landing grade ${landingGrade}`,
    geometry: smooth
      ? [
        `${runup} m level run-up, then ${eased ? 'eased' : 'linear'} rise ${rise} m over ${riseOver} m`,
        `NO lip block: crest at s=${lipS}, height +${round(rise, 3)} m`,
        `landing ${landingLinear ? 'linear' : 'eased'} grade ${landingGrade} over ${landingLength} m, run-out −0.03 over ${runout} m`,
      ]
      : [
        `${runup} m level run-up, then ${eased ? 'eased' : 'linear'} rise ${rise} m over ${riseOver} m`,
        `lip block ${surface}, s ∈ [${round(runup + at - lead, 2)}, ${round(lipS, 2)}], top +${round(crest.top, 3)} m`,
        `step up onto the lip ${round(crest.stepUpAtStart, 3)} m; DROP AT THE LIP ${round(crest.dropAtLip, 3)} m`,
        `landing ${landingLinear ? 'linear' : 'eased'} grade ${landingGrade} over ${landingLength} m, run-out −0.03 over ${runout} m`,
      ],
  };
}

/** §36.4's kicker gap: a bigger rise, a real lip and a steep landing. */
export function kickerFixture(landingGrade = -0.20, runup = 240, lead = 1): LipFixture {
  const fixture = lipFixture({
    rise: 1.0,
    lipHeight: 0.12,
    reach: 2,
    lead,
    landingGrade,
    landingLength: 24,
    runup,
  });
  return { ...fixture, label: `kicker, landing grade ${landingGrade}, lead ${lead} m` };
}

// ---------------------------------------------------------------------------
// Down staircase
// ---------------------------------------------------------------------------

export interface StairsOptions {
  readonly steps?: number;
  readonly tread?: number;
  readonly rise?: number;
  readonly surface?: SurfaceId;
  readonly appearance?: 'concrete' | 'stone';
}

/**
 * Solid treads over a corridor that falls beneath them — §36.4's down
 * staircase, and its own instruction: "Use solid treads, not a heightfield
 * texture that samples as a ramp."
 */
export interface StairsFixture extends Fixture {
  readonly treadTops: readonly number[];
  readonly treadHeights: readonly number[];
  readonly exitDrop: number;
  readonly stepRise: number;
}

export function stairsFixture(options: StairsOptions = {}): StairsFixture {
  const steps = options.steps ?? 3;
  const tread = options.tread ?? 3;
  const rise = options.rise ?? 0.30;
  const surface = options.surface ?? 'roughPavement';
  const appearance = options.appearance ?? 'concrete';
  const approach = 40;
  const run = steps * tread;
  const key = `stairs-${steps}-${tread}-${rise}-${surface}-${appearance}`;

  const profile: CorridorProfile = {
    length: run,
    climb: -steps * rise,
    linearClimb: true,
  };
  const flight = stairs(profile, {
    from: 0,
    steps,
    tread,
    rise,
    t: 0,
    halfLateral: HALF_WIDTH,
    surface,
    appearance,
    depth: 2,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [
    { id: 'approach', length: approach, halfWidth: HALF_WIDTH, surface, shoulder: SHOULDER },
    {
      id: 'stairs',
      length: run,
      climb: -steps * rise,
      linearClimb: true,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
      blocks: flight.blocks,
    },
    { id: 'runout', length: 30, halfWidth: HALF_WIDTH, surface, shoulder: SHOULDER },
  ]));

  const tops = flight.treadTops;
  return {
    plan,
    lipS: approach,
    endS: approach + run + 26,
    treadTops: tops,
    treadHeights: flight.treadHeights,
    exitDrop: flight.exitDrop,
    stepRise: rise,
    classify: (y: number): LandedOn => (
      tops.some((top) => Math.abs(y - top) < DECK_TOLERANCE) ? 'deck' : 'other'
    ),
    label: `${steps} down-steps, ${round(rise, 2)} m rise, ${tread} m tread`,
    geometry: [
      `${approach} m level approach of ${surface}; tread 0 is flush at s=${approach}`,
      `tread tops ${tops.map((top) => round(top, 3)).join(' / ')} m; block heights `
        + `${flight.treadHeights.map((height) => round(height, 3)).join(' / ')} m`,
      `each tread-to-tread fall ${round(rise, 2)} m; drop off the last tread ${round(flight.exitDrop, 3)} m`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Skinny
// ---------------------------------------------------------------------------

export interface SkinnyOptions {
  readonly width: number;
  readonly lift: number;
  readonly length?: number;
  readonly grade?: number;
  readonly surface?: SurfaceId;
  /** Start the trial on the plank at rest, for §36.4's stopped restart. */
  readonly spawnOnPlank?: boolean;
}

/**
 * A narrow plank over rideable catch ground.
 *
 * §36.4's skinny: "Upper line has no forced hop; off either side, a 0.30–0.55 m
 * catch drop should be clean when aligned. Width comes from the wheel,
 * articulated rider and camera, not a plank texture." The approach is a wide
 * deck flush with the plank, so the only thing that narrows is the plank, and
 * the ground each side is the corridor — the lower deck a rider falls onto,
 * never a hole.
 */
export interface SkinnyFixture extends Fixture {
  readonly plankTop: number;
  readonly plankFrom: number;
  readonly plankTo: number;
  readonly exitDrop: number;
  readonly width: number;
}

export function skinnyFixture(options: SkinnyOptions): SkinnyFixture {
  const width = options.width;
  const lift = options.lift;
  const length = options.length ?? 8;
  const grade = options.grade ?? -0.03;
  const surface = options.surface ?? 'wood';
  const approach = 30;
  const plankRun = length + 12;
  const key = `skinny-${width}-${lift}-${length}-${grade}-${surface}-${options.spawnOnPlank === true}`;

  const plankProfile: CorridorProfile = {
    length: plankRun,
    climb: grade * plankRun,
    linearClimb: true,
  };
  const plank = deck(plankProfile, {
    from: 0,
    length,
    t: 0,
    halfLateral: width / 2,
    lift,
    surface,
    depth: 2,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [
    {
      id: 'approach',
      length: approach,
      halfWidth: HALF_WIDTH,
      surface,
      shoulder: SHOULDER,
      blocks: deck(
        { length: approach },
        {
          from: 0,
          length: approach,
          t: 0,
          halfLateral: 3,
          lift,
          surface,
          depth: 2,
        },
      ).blocks,
    },
    {
      id: 'plank',
      length: plankRun,
      climb: grade * plankRun,
      linearClimb: true,
      halfWidth: HALF_WIDTH,
      surface: 'dirt',
      shoulder: SHOULDER,
      blocks: plank.blocks,
    },
  ]));

  const spawnZ = options.spawnOnPlank === true ? approach + 0.5 : 0;
  const spawned = options.spawnOnPlank !== true ? plan : cachedPlan(`${key}-spawn`, () => ({
    ...plan,
    spawn: { position: { x: 0, y: 0, z: spawnZ }, headingY: 0 },
  }));

  const plankTop = plank.top;
  return {
    plan: spawned,
    lipS: approach,
    endS: approach + plankRun - 3,
    plankTop,
    plankFrom: approach,
    plankTo: approach + length,
    exitDrop: plank.exitDrop,
    width,
    classify: (y: number): LandedOn => (y >= plankTop - DECK_TOLERANCE ? 'deck' : 'catch'),
    label: `skinny ${round(width, 2)} m wide, lift ${round(lift, 2)} m`
      + (options.spawnOnPlank === true ? ', stopped restart on the plank' : ''),
    geometry: [
      `${approach} m wide run-up deck (6 m across) at +${round(lift, 3)} m, flush with the plank`,
      `plank ${surface} ${length} m long, ${round(width, 2)} m wide, top +${round(plankTop, 3)} m`,
      `catch ground dirt at grade ${grade}: ${round(lift, 3)} m below the plank at its start, `
        + `${round(lift - grade * length, 3)} m at its end`,
      `drop off the plank's far end ${round(plank.exitDrop, 3)} m`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Spin pad
// ---------------------------------------------------------------------------

/** A low deck end onto a broad level pad — §36.4's signed spin pad. */
export interface SpinPadFixture extends Fixture {
  readonly drop: number;
  readonly padLength: number;
}

export function spinPadFixture(options: { drop?: number; padLength?: number } = {}): SpinPadFixture {
  const drop = options.drop ?? 0.3;
  const padLength = options.padLength ?? 20;
  const approach = 60;
  const total = approach + padLength;
  const key = `spinpad-${drop}-${padLength}`;

  const shelf = deck({ length: total }, {
    from: 0,
    length: approach,
    t: 0,
    halfLateral: HALF_WIDTH,
    lift: drop,
    surface: 'pavement',
    depth: 2,
  });

  const plan = cachedPlan(key, () => straightPlan(`bench-${key}`, [{
    id: 'pad',
    length: total,
    halfWidth: HALF_WIDTH,
    surface: 'pavement',
    shoulder: SHOULDER,
    blocks: shelf.blocks,
  }]));

  return {
    plan,
    lipS: approach,
    drop,
    padLength,
    endS: total - 2,
    classify: (y: number): LandedOn => (y >= drop - DECK_TOLERANCE ? 'deck' : 'other'),
    label: `spin pad, ${round(drop, 2)} m drop onto a ${padLength} m level pad`,
    geometry: [
      `${approach} m level deck at +${round(drop, 3)} m; lip at s=${approach}`,
      `drop off the deck ${round(shelf.exitDrop, 3)} m onto a level pavement pad ${padLength} m long`,
    ],
  };
}

// ---------------------------------------------------------------------------
// The lap — §36.8's smallest alternate-line envelope/progress case
// ---------------------------------------------------------------------------

export const LAP_HALF_WIDTH = 8;
export const LAP_STRAIGHT = 60;
/** Hairpin radius: half-width plus two, so the infield centre is still inside. */
export const LAP_RADIUS = LAP_HALF_WIDTH + 2;
export const LAP_DECK = Object.freeze({ t: 4, halfLateral: 3, lift: 0.2, length: 10, from: 24 });

export interface LapFixture {
  readonly plan: LevelPlan;
  readonly label: string;
  readonly geometry: readonly string[];
  /** The deck's four top corners in world XZ, and its top height. */
  readonly deckTop: number;
  readonly deckCorners: readonly { readonly x: number; readonly z: number }[];
}

/**
 * A closed stadium lap: two 60 m straights and two 180° hairpins.
 *
 * §36.8 Phase 0's third bullet — "Prototype the smallest alternate-line
 * envelope/progress case ... decide whether the existing representation fits
 * before committing to the full layout" — and §36.2 item 7 is the limit it is
 * testing against: `LapEnvelope.contains` and `progressAt` are horizontal, so a
 * deck on one half of a straight and the bypass on the other are two lines the
 * envelope cannot tell apart. That is the property being measured, not a defect
 * to design around here.
 *
 * The ring closes by construction: two equal opposed straights and two equal
 * opposed 180° arcs sum to zero displacement and 360° of turn, well inside
 * `buildPlan`'s 1.25 m closure tolerance, so no loop solver is needed.
 */
export function lapFixture(): LapFixture {
  const curvature = 1 / LAP_RADIUS;
  const arcLength = Math.PI * LAP_RADIUS;
  const deckReport = deck({ length: LAP_STRAIGHT }, {
    from: LAP_DECK.from,
    length: LAP_DECK.length,
    t: LAP_DECK.t,
    halfLateral: LAP_DECK.halfLateral,
    lift: LAP_DECK.lift,
    surface: 'wood',
    depth: 1,
  });

  const specs: SegmentSpec[] = [
    {
      id: 'straight-a',
      length: LAP_STRAIGHT,
      halfWidth: LAP_HALF_WIDTH,
      surface: 'pavement',
      shoulder: SHOULDER,
      blocks: deckReport.blocks,
    },
    {
      id: 'hairpin-a',
      length: arcLength,
      curvature,
      halfWidth: LAP_HALF_WIDTH,
      surface: 'pavement',
      shoulder: SHOULDER,
    },
    {
      id: 'straight-b',
      length: LAP_STRAIGHT,
      halfWidth: LAP_HALF_WIDTH,
      surface: 'pavement',
      shoulder: SHOULDER,
    },
    {
      id: 'hairpin-b',
      length: arcLength,
      curvature,
      halfWidth: LAP_HALF_WIDTH,
      surface: 'pavement',
      shoulder: SHOULDER,
    },
  ];

  const checkpoints: CheckpointSpec[] = [
    { id: 'line', segment: 'straight-a', s: 2, kind: 'start', label: 'Start/finish' },
    { id: 'sector-1', segment: 'straight-a', s: 48, kind: 'split', label: 'Sector 1' },
    { id: 'sector-2', segment: 'straight-b', s: 30, kind: 'split', label: 'Sector 2' },
  ];

  const plan = cachedPlan('lap-stadium', () => straightPlan('bench-lap', specs, { checkpoints }));

  // The straight runs along +Z from the origin with the rider's LEFT at +X, so
  // the deck's four top corners are the block's own footprint in world XZ.
  const from = LAP_DECK.from;
  const to = LAP_DECK.from + LAP_DECK.length;
  const near = LAP_DECK.t - LAP_DECK.halfLateral;
  const far = LAP_DECK.t + LAP_DECK.halfLateral;
  const corners = [
    { x: near, z: from },
    { x: far, z: from },
    { x: near, z: to },
    { x: far, z: to },
  ];

  return {
    plan,
    label: 'stadium lap: two 60 m straights, two 180° hairpins',
    deckTop: deckReport.top,
    deckCorners: corners,
    geometry: [
      `straights ${LAP_STRAIGHT} m, hairpins R=${LAP_RADIUS} m (${round(arcLength, 2)} m of arc each)`,
      `corridor half-width ${LAP_HALF_WIDTH} m, envelope margin ${TRACK_DAY.offCourseMarginMetres} m`
        + ` → reach ${LAP_HALF_WIDTH + TRACK_DAY.offCourseMarginMetres} m`,
      `deck on the left half of straight-a: t=${LAP_DECK.t} ± ${LAP_DECK.halfLateral} m,`
        + ` s ∈ [${from}, ${to}], top +${round(deckReport.top, 3)} m`,
      'gates: start + two splits, all on the straights',
    ],
  };
}

/**
 * Two parallel legs of a ring, `separation` apart, as plain `LapCourse` data.
 *
 * §36.2 item 7's warning made testable: "adjacent switchbacks cannot steal each
 * other's projection". A `LapCourse` is plain data, so the smallest honest
 * experiment is two legs and one point between them — no heightfield, no
 * producer, no venue.
 */
export function parallelLegs(separation: number, halfWidth = LAP_HALF_WIDTH): LapCourse {
  const legLength = 120;
  const points = [
    { x: 0, z: 0, halfWidth },
    { x: 0, z: legLength, halfWidth },
    { x: separation, z: legLength, halfWidth },
    { x: separation, z: 0, halfWidth },
    { x: 0, z: 0, halfWidth },
  ];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].z - points[index - 1].z,
    );
  }
  return { points, length };
}
