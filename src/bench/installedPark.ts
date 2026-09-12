/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {
  centrelineAt,
  headingAt,
  leftOf,
  placeChain,
  type PlacedSegment,
} from '../level/segments.ts';
import {
  SWITCHBACK_ENTRY_DISTANCE,
  SWITCHBACK_FEATURES,
  SWITCHBACK_GRAPH,
  SWITCHBACK_SPAWN,
  createSwitchbackLevel,
} from '../level/switchbackLevel.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import type { Fixture, LandedOn } from './jumpBench.ts';

/**
 * Switchback Park as the bench rides it — M36 Phase 2's installed measurements.
 *
 * **Phase 0's fixtures are not the park.** Every feature in `featureFixtures.ts`
 * stands on 240 m of level purpose-built run-up, in its own one-segment world,
 * with no hillside under it and no corridor turning away from it; §36.4 asks
 * Phase 2 to "repeat it on the installed geometry", and that means the plan
 * `createSwitchbackLevel()` emits, the heightfield `switchbackGroundAt` shaped,
 * the blocks `settleBlocks` carried down onto it and the corridor's own width.
 * The difference between the two is the whole reason the pass exists: the
 * hopped kicker's Phase 0 window was measured on a fixture and its installed
 * behaviour is what Phase 2 had to redesign.
 *
 * **What this module adds, and all it adds, is a frame.** The bench's driver
 * assumes `s` is world +Z, which is true of every straight fixture and of
 * nothing on a lap that turns five times. So `Fixture` grew four optional
 * members — a spawn pose, a lateral axis and two projections — and this file
 * fills them in with the lap's own arc length. The controller, the press
 * semantics, the landing bookkeeping and every number they produce are the
 * same code that produced T1–T10.
 *
 * Nothing here may import three.js (invariant 1), and nothing in the game
 * imports this: `src/bench/` is measurement, read by `jumpBench.test.ts` and
 * `tools/jump-bench.mjs`.
 */

/** The park, built once. Every installed trial rides this exact plan. */
export const PARK_PLAN: LevelPlan = createSwitchbackLevel();

/** The lap's corridors, placed once, in riding order. */
export const PARK_PLACED: readonly PlacedSegment[] = placeChain(
  SWITCHBACK_GRAPH,
  SWITCHBACK_SPAWN,
);

const BY_ID = new Map(PARK_PLACED.map((segment) => [segment.spec.id, segment]));

/** Lap distance to the entry socket of a corridor, metres. */
export function entryDistance(segment: string): number {
  const found = SWITCHBACK_ENTRY_DISTANCE.get(segment);
  if (found === undefined) throw new Error(`the lap carries no segment "${segment}"`);
  return found;
}

/** Lap distance of `(segment, s)` — the one conversion every record uses. */
export function lapDistance(segment: string, s: number): number {
  return entryDistance(segment) + s;
}

function placedOf(segment: string): PlacedSegment {
  const found = BY_ID.get(segment);
  if (found === undefined) throw new Error(`the lap carries no segment "${segment}"`);
  return found;
}

/**
 * The world pose at `(segment, s)`, offset `t` to the rider's LEFT.
 *
 * The height is the corridor's own surface, never a block's top: a trial that
 * spawned on a deck would start the feature already mounted.
 */
export function poseAt(
  segment: string,
  s: number,
  t: number,
): { position: Vec3; headingY: number } {
  const placed = placedOf(segment);
  const heading = headingAt(placed.entry, placed.spec, s);
  const centre = centrelineAt(placed.entry, placed.spec, s);
  const left = leftOf(heading);
  return {
    position: { x: centre.x + left.x * t, y: centre.y, z: centre.z + left.z * t },
    headingY: heading,
  };
}

/**
 * A point's `(s, t)` in one corridor's frame, unclamped along `s`.
 *
 * `querySegment` clamps `s` into the corridor, which is right for asking "is
 * this rider on the road" and wrong for asking "how far along the lap is it" —
 * a clamped `s` stops advancing at the exit socket and a flight that crossed
 * one would read as standing still. This is the same projection with the clamp
 * removed, and it is only ever evaluated over a window of corridors the trial
 * is known to be riding.
 */
function projectOn(placed: PlacedSegment, x: number, z: number): { s: number; t: number } {
  const { spec, entry } = placed;
  const k = spec.curvature ?? 0;
  const dx = x - entry.position.x;
  const dz = z - entry.position.z;

  if (k === 0) {
    const forward = { x: Math.sin(entry.headingY), z: Math.cos(entry.headingY) };
    const left = leftOf(entry.headingY);
    return { s: dx * forward.x + dz * forward.z, t: dx * left.x + dz * left.z };
  }

  const left = leftOf(entry.headingY);
  const centreX = entry.position.x + left.x / k;
  const centreZ = entry.position.z + left.z / k;
  const vx = x - centreX;
  const vz = z - centreZ;
  const radius = Math.hypot(vx, vz);
  const v0x = entry.position.x - centreX;
  const v0z = entry.position.z - centreZ;
  const cross = v0x * vz - v0z * vx;
  const dot = v0x * vx + v0z * vz;
  return {
    s: Math.atan2(cross, dot) / k,
    t: Math.sign(k) * (1 / Math.abs(k) - radius),
  };
}

/** How far outside a corridor's own span `(s, t)` lands, metres. */
function outsideBy(placed: PlacedSegment, s: number, t: number): number {
  return Math.hypot(
    Math.max(0, Math.abs(t) - placed.spec.halfWidth),
    Math.max(0, -s, s - placed.spec.length),
  );
}

/** The lap frame over one window of corridors: `(x, z)` to lap `s` and `t`. */
export interface LapFrame {
  progress(x: number, z: number): number;
  lateral(x: number, z: number): number;
}

/**
 * The lap frame over the corridors a trial rides, in riding order.
 *
 * The window matters: two legs of a hairpin are 21 m apart and a global nearest
 * projection would sometimes answer with the other one. Restricting the search
 * to the corridors the trial is actually on makes the answer unambiguous, and
 * the corridors a trial is on are declared by the feature record below.
 */
export function lapFrame(segments: readonly string[]): LapFrame {
  const window = segments.map(placedOf);
  const bases = segments.map(entryDistance);

  const resolve = (x: number, z: number): { index: number; s: number; t: number } => {
    let best = 0;
    let bestS = 0;
    let bestT = 0;
    let bestScore = Infinity;
    for (let index = 0; index < window.length; index += 1) {
      const { s, t } = projectOn(window[index], x, z);
      const spec = window[index].spec;
      // **A corridor the point is actually ON always wins.** An arc's
      // projection wraps — a point ahead of a 180° hairpin's entry can come
      // back as an angle most of the way round the circle, which reads as a
      // large negative `s` — and a hairpin is exactly what follows the
      // staircase. Ranking "inside the corridor's own span" ahead of "nearest"
      // makes the wrap unreachable while the rider is still on the straight.
      const inside = s >= -1e-6 && s <= spec.length + 1e-6 ? 0 : 1000;
      const score = inside + outsideBy(window[index], s, t);
      if (score < bestScore) {
        bestScore = score;
        best = index;
        bestS = s;
        bestT = t;
      }
    }
    return { index: best, s: bestS, t: bestT };
  };

  return {
    progress: (x, z) => {
      const { index, s } = resolve(x, z);
      return bases[index] + s;
    },
    lateral: (x, z) => resolve(x, z).t,
  };
}

/** A deck top in the lap's frame, for judging what a touchdown landed on. */
export interface InstalledTop {
  readonly from: number;
  readonly to: number;
  /** World height of the top face, metres. */
  readonly y: number;
}

/** One feature as the installed bench measures it. */
export interface InstalledFeature {
  /** The key in `SWITCHBACK_FEATURES`, which is the id signage will carry. */
  readonly id: string;
  readonly label: string;
  /** The corridors the trial rides, in order. All straights. */
  readonly segments: readonly string[];
  /** Lap distance of the edge the rider leaves, or the face they mount. */
  readonly lipS: number;
  /** Lap distance the trial starts from, on the technical line. */
  readonly spawnS: number;
  /** Lap distance the trial stops at — the merge, plus the settling zone. */
  readonly endS: number;
  /**
   * Where a comparison run stops, when that is not where a window run stops.
   *
   * Only the ledge needs it. Its window runs to the end of `terrace-drop`,
   * because a hopped ledge above 18 mph comes down on the gap's take-off deck
   * and a shorter window would report that as a flight with no landing — but a
   * bypass comparison over a span that contains a second feature would be
   * measuring both. T13 and T14 stop at the gap's leading edge instead.
   */
  readonly compareEndS?: number;
  /** Lateral of the technical line and of the bypass, metres left of centre. */
  readonly technicalT: number;
  readonly bypassT: number;
  /** Every top the rider can land ON, so a touchdown can be judged. */
  readonly tops: readonly InstalledTop[];
  /** Declared dimensions, printed above the feature's table. */
  readonly geometry: readonly string[];
  /**
   * Where an on-time press puts the impulse.
   *
   * `lip` for a feature the rider LEAVES — the impulse belongs on the last
   * grounded step at the edge, which is `EUC.hopCompressSeconds` before it.
   * `apex` for a feature they have to get ON TOP of — the hop's apex has to
   * arrive at the face, which is the compression plus the time gravity takes to
   * spend the impulse, and is therefore a different lead per charge.
   */
  readonly press: 'lip' | 'apex';
  /** The lip speeds the window is measured at, mph, under to over. */
  readonly speeds: readonly number[];
  /** True where a 180 and its fakie exit are part of the feature. */
  readonly spin?: true;
  /** Corridor gradient at the lip and at the landing, as a percentage. */
  readonly launchGrade: number;
  readonly landingGrade: number;
}

/** How close a touchdown must be to a declared top to count as on it. */
const TOP_TOLERANCE = 0.08;

/** The installed fixture for a feature — the park, in that feature's frame. */
export function installedFixture(feature: InstalledFeature): Fixture {
  const frame = lapFrame(feature.segments);
  const first = feature.segments[0];
  const spawnPose = poseAt(first, feature.spawnS - entryDistance(first), feature.technicalT);
  const axis = leftOf(spawnPose.headingY);

  const classify = (y: number, s: number): LandedOn => {
    for (const top of feature.tops) {
      if (s >= top.from - 0.25 && s <= top.to + 0.25 && Math.abs(y - top.y) <= TOP_TOLERANCE) {
        return 'deck';
      }
    }
    return s >= feature.spawnS && s <= feature.endS ? 'catch' : 'other';
  };

  return {
    plan: PARK_PLAN,
    lipS: feature.lipS,
    endS: feature.endS,
    classify,
    label: feature.label,
    geometry: feature.geometry,
    spawnPose,
    lateralAxis: { x: axis.x, z: axis.z },
    progressOf: (x, z) => frame.progress(x, z),
    lateralOf: (x, z) => frame.lateral(x, z),
  };
}

/**
 * The same park, ridden UP a corridor instead of down it.
 *
 * §36.4's second "must not be faked": "A stepped descent is a wall from below:
 * reuse the `RouteBlocker.facing` meaning, verify directional geometry, and
 * give free riders a ramp back up." There is no route blocker here and no
 * one-way collider — the risers are solid blocks and what stops a rider coming
 * back up them is their own height — so the way to verify it is to ride at
 * them from underneath and watch. The frame is mirrored about the start so the
 * bench's "progress increases toward `endS`" contract still holds while the
 * rider is travelling backwards along the lap.
 */
export function reverseFixture(
  feature: InstalledFeature,
  options: { readonly fromS: number; readonly metres: number; readonly t: number },
): Fixture {
  const frame = lapFrame(feature.segments);
  const first = feature.segments[0];
  const forward = poseAt(first, options.fromS - entryDistance(first), options.t);
  const headingY = forward.headingY + Math.PI;
  const axis = leftOf(headingY);
  return {
    plan: PARK_PLAN,
    lipS: options.fromS,
    endS: options.fromS + options.metres,
    classify: () => 'other',
    label: `${feature.label} — ridden up from lap s = ${options.fromS.toFixed(1)} m`,
    geometry: feature.geometry,
    spawnPose: { position: forward.position, headingY },
    lateralAxis: { x: axis.x, z: axis.z },
    progressOf: (x, z) => 2 * options.fromS - frame.progress(x, z),
    lateralOf: (x, z) => frame.lateral(x, z),
  };
}

/** The same fixture, started on the bypass half instead of the feature line. */
export function bypassFixture(feature: InstalledFeature): Fixture {
  const frame = lapFrame(feature.segments);
  const first = feature.segments[0];
  const spawnPose = poseAt(first, feature.spawnS - entryDistance(first), feature.bypassT);
  const axis = leftOf(spawnPose.headingY);
  return {
    plan: PARK_PLAN,
    lipS: feature.lipS,
    endS: feature.endS,
    classify: () => 'other',
    label: `${feature.label} — bypass at t = ${feature.bypassT.toFixed(2)} m`,
    geometry: feature.geometry,
    spawnPose,
    lateralAxis: { x: axis.x, z: axis.z },
    progressOf: (x, z) => frame.progress(x, z),
    lateralOf: (x, z) => frame.lateral(x, z),
  };
}

// ---------------------------------------------------------------------------
// The nine features, located on the lap
// ---------------------------------------------------------------------------

/** The world height of a corridor's entry socket, metres. */
function socketY(segment: string): number {
  return placedOf(segment).entry.position.y;
}

function deckFeature(key: 'ledge' | 'skinny' | 'stepUp' | 'spinShelf'): {
  from: number; to: number; top: number; segment: string;
} {
  const feature = SWITCHBACK_FEATURES[key];
  if (feature.kind !== 'deck') throw new Error(`${key} is not a deck`);
  const block = feature.report.blocks[0];
  return {
    segment: feature.segment,
    from: lapDistance(feature.segment, block.s - block.halfAlong),
    to: lapDistance(feature.segment, block.s + block.halfAlong),
    top: socketY(feature.segment) + feature.report.top,
  };
}

const LEDGE = deckFeature('ledge');
const SKINNY = deckFeature('skinny');
const STEP_UP = deckFeature('stepUp');
const SHELF = deckFeature('spinShelf');

const GAP = (() => {
  const feature = SWITCHBACK_FEATURES.gap;
  if (feature.kind !== 'steppedDecks') throw new Error('the gap is not stepped decks');
  const y = socketY(feature.segment);
  const decks = feature.report.decks.map((deck) => {
    const block = deck.blocks[0];
    return {
      from: lapDistance(feature.segment, block.s - block.halfAlong),
      to: lapDistance(feature.segment, block.s + block.halfAlong),
      y: y + deck.top,
    };
  });
  return { segment: feature.segment, decks, report: feature.report };
})();

const RHYTHM = (() => {
  const feature = SWITCHBACK_FEATURES.rhythm;
  if (feature.kind !== 'steppedDecks') throw new Error('the rhythm is not stepped decks');
  const y = socketY(feature.segment);
  const decks = feature.report.decks.map((deck) => {
    const block = deck.blocks[0];
    return {
      from: lapDistance(feature.segment, block.s - block.halfAlong),
      to: lapDistance(feature.segment, block.s + block.halfAlong),
      y: y + deck.top,
    };
  });
  return { segment: feature.segment, decks, report: feature.report };
})();

const STAIRS = (() => {
  const feature = SWITCHBACK_FEATURES.stairs;
  if (feature.kind !== 'stairs') throw new Error('the stairs are not stairs');
  const y = socketY(feature.segment);
  const treads = feature.report.blocks.map((block, index) => ({
    from: lapDistance(feature.segment, block.s - block.halfAlong),
    to: lapDistance(feature.segment, block.s + block.halfAlong),
    y: y + feature.report.treadTops[index],
  }));
  return { segment: feature.segment, treads, report: feature.report };
})();

const KICKER = (() => {
  const feature = SWITCHBACK_FEATURES.kicker;
  if (feature.kind !== 'lip') throw new Error('the kicker is not a lip');
  const block = feature.report.blocks[0];
  return {
    segment: feature.segment,
    from: lapDistance(feature.segment, block.s - block.halfAlong),
    to: lapDistance(feature.segment, block.s + block.halfAlong),
    top: socketY(feature.segment) + feature.report.top,
    report: feature.report,
  };
})();

const CREST = (() => {
  const feature = SWITCHBACK_FEATURES.crest;
  if (feature.kind !== 'lip') throw new Error('the crest is not a lip');
  const block = feature.report.blocks[0];
  return {
    segment: feature.segment,
    from: lapDistance(feature.segment, block.s - block.halfAlong),
    to: lapDistance(feature.segment, block.s + block.halfAlong),
    top: socketY(feature.segment) + feature.report.top,
    report: feature.report,
  };
})();

const metres = (value: number): string => `${value.toFixed(3)} m`;

/**
 * Every installed feature, in riding order, located on the lap it stands on.
 *
 * `lipS` is the edge the measurement is about: the far edge of a deck the rider
 * leaves, the near face of one they have to mount. `endS` is where the trial
 * stops — always inside the last straight corridor of the window, because the
 * bench's driver does not steer and a trial that ran on into a hairpin would be
 * measuring the absence of a steering input.
 */
export const INSTALLED_FEATURES: readonly InstalledFeature[] = [
  {
    id: 'ledge',
    label: 'the marked ledge drop',
    segments: ['terrace-drop'],
    lipS: LEDGE.to,
    spawnS: LEDGE.from - 5,
    // The whole corridor, because six metres of clear trail is all there is
    // between the ledge and the gap's take-off deck and a hopped ledge at
    // 18 mph and up lands ON that deck. The gap's tops are declared here so
    // the row says so rather than reading as a landing on open ground.
    endS: lapDistance('terrace-drop', 44),
    compareEndS: lapDistance('terrace-drop', 20),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: [
      { from: LEDGE.from, to: LEDGE.to, y: LEDGE.top },
      ...GAP.decks.map((deck) => ({ from: deck.from, to: deck.to, y: deck.y })),
    ],
    geometry: [
      `wood deck on \`terrace-drop\`, lap s ∈ [${LEDGE.from.toFixed(1)}, ${LEDGE.to.toFixed(1)}] m,`
      + ` t ∈ [1.00, 7.50] m, top ${LEDGE.top.toFixed(3)} m`,
      'entry face 0.050 m (rolled onto), exit drop 0.330 m onto the 3.5% corridor',
    ],
    press: 'lip',
    speeds: [8, 12, 18, 25],
    launchGrade: -3.5,
    landingGrade: -3.5,
  },
  {
    id: 'gap',
    label: 'the straight gap',
    segments: ['terrace-drop'],
    lipS: GAP.decks[0].to,
    spawnS: GAP.decks[0].from - 6,
    endS: lapDistance('terrace-drop', 44),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: GAP.decks.map((deck) => ({ from: deck.from, to: deck.to, y: deck.y })),
    geometry: [
      `two wood decks on \`terrace-drop\`, lap s ∈ [${GAP.decks[0].from.toFixed(1)},`
      + ` ${GAP.decks[0].to.toFixed(1)}] and [${GAP.decks[1].from.toFixed(1)},`
      + ` ${GAP.decks[1].to.toFixed(1)}] m — a 3.0 m opening`,
      `catch ${metres(GAP.report.gapCatchDrops[0])} below the take-off deck;`
      + ` landing deck face ${metres(GAP.report.decks[1].entryFace)};`
      + ` exit drop ${metres(GAP.report.drops[1])}`,
    ],
    press: 'lip',
    // Eight is in the sweep because it is the gap's failing bound: a hop at
    // 8 mph and under does not reach the landing deck and comes down in the
    // opening, which is a heavy landing and a ride-away rather than a clean
    // crossing. Every feature owes its window a failing end (§36.4).
    speeds: [8, 10, 15, 20, 25, 30],
    launchGrade: -3.5,
    landingGrade: -3.5,
  },
  {
    id: 'skinny',
    label: 'the skinny',
    segments: ['timber'],
    lipS: SKINNY.from,
    spawnS: SKINNY.from - 4,
    endS: lapDistance('timber', 18),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: [{ from: SKINNY.from, to: SKINNY.to, y: SKINNY.top }],
    geometry: [
      `0.9 m wood plank on \`timber\`, lap s ∈ [${SKINNY.from.toFixed(1)},`
      + ` ${SKINNY.to.toFixed(1)}] m, t ∈ [3.80, 4.70] m`,
      'stands 0.300 m proud at its start and 0.540 m at its end',
    ],
    press: 'apex',
    speeds: [5, 8, 12, 15],
    launchGrade: -3.0,
    landingGrade: -3.0,
  },
  {
    id: 'stepUp',
    label: 'the charged step-up',
    segments: ['timber'],
    lipS: STEP_UP.from,
    // Six metres, not eight: the skinny's far edge is exactly eight metres back
    // and a trial that spawned on it would begin by falling off it.
    spawnS: STEP_UP.from - 6,
    endS: lapDistance('timber', 46),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: [{ from: STEP_UP.from, to: STEP_UP.to, y: STEP_UP.top }],
    geometry: [
      `wood deck on \`timber\`, lap s ∈ [${STEP_UP.from.toFixed(1)}, ${STEP_UP.to.toFixed(1)}] m,`
      + ' t ∈ [1.00, 7.50] m',
      'face to mount 0.500 m; roll-off 0.680 m at the far end',
    ],
    press: 'apex',
    speeds: [8, 12, 16, 20],
    launchGrade: -3.0,
    landingGrade: -3.0,
  },
  {
    id: 'stairs',
    label: 'the down staircase',
    // The staircase alone. `timber-turn` is deliberately NOT in the window: it
    // is a 180° hairpin, and lap progress measured through one is not monotonic
    // for a wheel flying straight — a flight that overshoots the socket moves
    // *away* from the arc it would be projected onto. A hop off the top tread
    // above 15 mph clears all nine metres, and the honest thing to say about
    // that is that it left the staircase, which is what the row says.
    segments: ['timber-steps'],
    lipS: STAIRS.treads[0].to,
    spawnS: lapDistance('timber-steps', 0),
    endS: lapDistance('timber-steps', 9),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: STAIRS.treads.map((tread) => ({ from: tread.from, to: tread.to, y: tread.y })),
    geometry: [
      'three 0.150 m concrete treads over a 10% corridor, 3 m apart, lap s ∈'
      + ` [${STAIRS.treads[0].from.toFixed(1)}, ${STAIRS.treads[2].to.toFixed(1)}] m`,
      `three equal 0.30 m drops; exit ${metres(STAIRS.report.exitDrop)} onto the trail`,
    ],
    press: 'lip',
    speeds: [5, 8, 12, 15, 20],
    launchGrade: -10.0,
    landingGrade: -10.0,
  },
  {
    id: 'rhythm',
    label: 'the rock rhythm',
    segments: ['rock-rhythm'],
    lipS: RHYTHM.decks[0].to,
    spawnS: RHYTHM.decks[0].from - 8,
    endS: lapDistance('rock-rhythm', 52),
    technicalT: 4.25,
    bypassT: -3.5,
    tops: RHYTHM.decks.map((deck) => ({ from: deck.from, to: deck.to, y: deck.y })),
    geometry: [
      `three stone terraces on \`rock-rhythm\`, 10 m each, lap s ∈`
      + ` [${RHYTHM.decks[0].from.toFixed(1)}, ${RHYTHM.decks[2].to.toFixed(1)}] m`,
      `drops ${metres(RHYTHM.report.drops[0])} / ${metres(RHYTHM.report.drops[1])} /`
      + ` ${metres(RHYTHM.report.drops[2])}`,
    ],
    press: 'lip',
    speeds: [12, 16, 20, 25],
    launchGrade: -3.5,
    landingGrade: -3.5,
  },
  {
    id: 'kicker',
    label: 'the kicker, its table and the landing hill',
    // The whole of the clearing past the lip, in order: the level table the
    // sub-speed hops come down on, the 12.5% brow, the 30% landing face the
    // charged fast flight is aimed at, the 12.5% flare and the run-out. All
    // straights, collinear with the lip.
    segments: [
      'kicker-lip', 'kicker-table', 'kicker-brow', 'kicker-landing', 'kicker-flare',
      'kicker-runout',
    ],
    lipS: KICKER.to,
    spawnS: KICKER.from - 0.5,
    endS: lapDistance('kicker-runout', 24),
    technicalT: 4.5,
    bypassT: -4,
    tops: [{ from: KICKER.from, to: KICKER.to, y: KICKER.top }],
    geometry: [
      `packed-earth lip on \`kicker-lip\`, lap s ∈ [${KICKER.from.toFixed(1)},`
      + ` ${KICKER.to.toFixed(1)}] m, t ∈ [0.90, 8.10] m, at the crest of an eased 2.5 m rise`,
      `flush at its start (step up ${metres(KICKER.report.stepUpAtStart)});`
      + ` face ${metres(KICKER.report.dropAtLip)} onto the table`,
      `\`kicker-table\` is level, lap s ∈ [${KICKER.to.toFixed(1)},`
      + ` ${(KICKER.to + 12).toFixed(1)}] m; then \`kicker-brow\` 4 m at 12.5%,`
      + ` \`kicker-landing\` 16 m at 30% (lap s ∈ [${(KICKER.to + 16).toFixed(1)},`
      + ` ${(KICKER.to + 32).toFixed(1)}] m), \`kicker-flare\` 4 m at 12.5%,`
      + ' and a run-out climbing at 2.5%',
      'the landing face is 0.65 m below the lip where it starts and 5.45 m below it where it ends',
    ],
    press: 'lip',
    speeds: [20, 30, 40, 50],
    launchGrade: -2.5,
    // The face the sign's flight is aimed at. A hop under 44 mph comes down on
    // the level table or the 12.5% brow instead, and T11's rows say which.
    landingGrade: -30.0,
  },
  {
    id: 'crest',
    label: 'the climb crest',
    segments: ['crest-down', 'fire-road-2'],
    lipS: CREST.to,
    spawnS: CREST.from - 0.5,
    endS: lapDistance('fire-road-2', 20),
    technicalT: 3.5,
    bypassT: -3.5,
    tops: [{ from: CREST.from, to: CREST.to, y: CREST.top }],
    geometry: [
      `packed-earth lip on \`crest-down\`, lap s ∈ [${CREST.from.toFixed(1)},`
      + ` ${CREST.to.toFixed(1)}] m, t ∈ [1.00, 6.00] m`,
      `kerb ${metres(CREST.report.stepUpAtStart)}; face ${metres(CREST.report.dropAtLip)}`,
    ],
    press: 'lip',
    speeds: [15, 25, 35],
    launchGrade: -5.0,
    landingGrade: -5.0,
  },
  {
    id: 'spinShelf',
    label: 'the spin shelf',
    segments: ['shelf-in', 'shelf-pad'],
    lipS: SHELF.to,
    spawnS: SHELF.from - 6,
    endS: lapDistance('shelf-pad', 18),
    technicalT: 3.75,
    bypassT: -3,
    tops: [{ from: SHELF.from, to: SHELF.to, y: SHELF.top }],
    geometry: [
      `wood deck on \`shelf-in\`, lap s ∈ [${SHELF.from.toFixed(1)}, ${SHELF.to.toFixed(1)}] m,`
      + ' t ∈ [1.00, 6.50] m',
      'flush at its start, and rolls off 0.150 m onto `shelf-pad`, which is level',
    ],
    press: 'lip',
    speeds: [8, 12, 15],
    launchGrade: -1.25,
    landingGrade: 0.0,
    spin: true,
  },
];

/** One installed feature by id, or a throw naming the typo. */
export function installedFeature(id: string): InstalledFeature {
  const found = INSTALLED_FEATURES.find((feature) => feature.id === id);
  if (found === undefined) throw new Error(`no installed feature "${id}"`);
  return found;
}
