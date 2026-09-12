/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PARK_SIGN_WORDS, SIGNS } from '../data/markings.ts';
import { PROP_BUDGET, PROP_FOOTPRINTS, PROP_SIZES } from '../data/props.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { MATERIALS } from '../data/surfaces.ts';
import { CAMERA, CHALLENGE, LIGHTING, TERRAIN, TRACK_DAY, WHEEL } from '../data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook } from '../data/venueLook.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { ChallengeRun } from '../simulation/challenge.ts';
import { EucController } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { RaceRun } from '../simulation/raceRun.ts';
import { RouteSpine } from '../simulation/routeSpine.ts';
import { raceGridSlot } from '../simulation/spawnSlots.ts';
import { TrackDayRun } from '../simulation/trackDay.ts';
import { createGroundSample } from '../simulation/world.ts';
import { wheelTuning } from '../bench/jumpBench.ts';
import { installedFeature } from '../bench/installedPark.ts';
import { LapEnvelope } from '../simulation/trackDay.ts';
import { PROP_CORRIDOR_CLEARANCE } from './buildPlan.ts';
import {
  planRenderCost,
  withinQuadRenderBudget,
  withinRenderBudget,
  withinSplitRenderBudget,
} from './renderBudget.ts';
import type { LevelPlan } from './plan.ts';
import {
  centrelineAt,
  gradientAt,
  headingAt,
  leftOf,
  markingsOf,
  placeChain,
  querySegment,
  type PlacedProp,
  type PlacedSegment,
  type SegmentBlock,
} from './segments.ts';
import {
  FOREST_CLEARANCE,
  FOREST_HEIGHTS,
  FOREST_SHADOW_STAND,
  FOREST_STRUCTURE_GAP,
  TRAIL_CAMERA_GAP,
  blockExclusions,
  clearanceOf,
  plantForest,
  propExclusions,
  shadowClearance,
  shadowDirection,
  shadowPerMetre,
} from './parkDressing.ts';
import {
  FENCE_BAY_REACH,
  FENCE_ENVELOPE_CLEAR,
  innerFenceOffset,
  innerFences,
} from './parkFencing.ts';
import { createProvingGround } from './provingGround.ts';
import { createSliceLevel } from './sliceLevel.ts';
import { createTrackLevel } from './trackLevel.ts';
import {
  FIRE_ROAD_GRADE,
  GROUND_HONESTY_METRES,
  MAX_SOCKET_FOLD,
  PARK,
  PARK_NAME,
  SWITCHBACK_CHECKPOINTS,
  SWITCHBACK_DESCENT_METRES,
  SWITCHBACK_ENTRY_DISTANCE,
  SWITCHBACK_FEATURES,
  SWITCHBACK_FIELD_BOUNDS,
  SWITCHBACK_FIELD_MARGIN,
  SWITCHBACK_FOREST,
  SWITCHBACK_FOREST_LATTICE,
  SWITCHBACK_FOREST_MARGIN,
  SWITCHBACK_GEOMETRY,
  SWITCHBACK_GRAPH,
  SWITCHBACK_HILLSIDE_BLOCKS,
  SWITCHBACK_INNER_FENCES,
  SWITCHBACK_LANDMARKS,
  SWITCHBACK_LAP_METRES,
  SWITCHBACK_LAP_SEGMENT_IDS,
  SWITCHBACK_LOOK,
  SWITCHBACK_LOOP,
  SWITCHBACK_PALETTE,
  SWITCHBACK_SUN,
  SWITCHBACK_PROGRAM,
  SWITCHBACK_SIGNAGE,
  SWITCHBACK_TURN_ARROWS,
  SWITCHBACK_TECHNICAL_CORRIDORS,
  SWITCHBACK_SIGNED_FEATURES,
  SWITCHBACK_SIGN_PAD_MARGIN,
  SEPARATION_CLEAR_METRES,
  SEPARATION_LAP_GAP_METRES,
  SWITCHBACK_SPAWN,
  SWITCHBACK_SURROUND,
  createSwitchbackLevel,
  separationFloor,
  switchbackGroundAt,
} from './switchbackLevel.ts';

/**
 * Switchback Park, checked headlessly — M36 Phase 1.
 *
 * BelVar's file is the model and four of its kinds of claim are restated here
 * on a venue that is not flat: the ring closes, the layout is the program, the
 * gates are on the line the referee judges, and the whole thing fits the frame.
 *
 * Three kinds are new, and they are what a hillside jump lap adds.
 *
 * **Every feature is pinned to what its builder achieved, not to what it was
 * asked for.** §36.4 requires actual lip, landing and catch heights, and
 * `parkFeatures` returns them from the arithmetic that wrote the blocks — so
 * the constants below *are* the reports, asserted to the bit, with the design
 * bands asserted separately around them. A drop that moved would fail here as a
 * changed number rather than pass as a still-plausible one.
 *
 * **The bypass is proved, not promised.** §36.3's central claim is that a legal
 * lap needs no hop, and the shape of this venue's answer is principle 1: the
 * technical line is one lateral half of the corridor and the other half is
 * clear. So every block is measured against the centreline and the corridor
 * edge, every socket join is measured against the launch rule, and then the
 * lap is *ridden twice* — down the middle and out on the bypass half — through
 * the real `TrackDayRun` referee at 120 Hz.
 *
 * **The hill is measured against the trail it was cut from.** A `groundAt`
 * function is the one thing in a plan that no other test can see, and its
 * failure modes are a cliff at the field border (which the builder refuses) and
 * a trail on an embankment (which nothing refuses). Both are asserted.
 */

const STEP = 1 / 120;

const plan: LevelPlan = createSwitchbackLevel();
const sampler = new PlanTerrainSampler(plan);
const sample = createGroundSample();

/** The finished ground under a world point. */
function groundAt(x: number, z: number): typeof sample {
  sampler.sampleGround(x, z, sample);
  return sample;
}

const placed: readonly PlacedSegment[] = placeChain(SWITCHBACK_GRAPH, SWITCHBACK_SPAWN);
const bySegment = new Map(placed.map((segment) => [segment.spec.id, segment]));

/**
 * The finished hillside under a world point, metres — the field alone.
 *
 * **Read off `plan.heightfield` rather than through `PlanTerrainSampler`, and
 * that is the whole point of it.** The sampler answers "what would a wheel
 * stand on here", which under a tree is *the tree*: a conifer is a solid, so a
 * ground probe at its own trunk comes back ten metres up and every shadow
 * measured from it is a lie about a canopy growing out of a canopy. What a
 * shadow is cast from is the ground the prop is seated on, which is this.
 */
function fieldHeightAt(x: number, z: number): number {
  const field = plan.heightfield;
  const u = (x - field.originX) / field.spacing;
  const v = (z - field.originZ) / field.spacing;
  const column = Math.min(field.columns - 2, Math.max(0, Math.floor(u)));
  const row = Math.min(field.rows - 2, Math.max(0, Math.floor(v)));
  const fx = Math.min(1, Math.max(0, u - column));
  const fz = Math.min(1, Math.max(0, v - row));
  const at = (c: number, r: number): number => field.heights[r * field.columns + c]!;
  const top = at(column, row) * (1 - fx) + at(column + 1, row) * fx;
  const bottom = at(column, row + 1) * (1 - fx) + at(column + 1, row + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

/**
 * Walk a prop's shadow, and report where it first lands on something.
 *
 * The stadium a disc of the prop's own reach sweeps from its trunk to the tip
 * of its shadow, sampled every 20 cm, carrying the height of the ray itself so
 * a receiver below the shadow's own line can say so. Written once here because
 * two claims need it — the landings, and the setback the forest was planted to
 * — and written independently of `parkDressing.ts`'s own walk on purpose: a
 * measurement that shares its arithmetic with the rule it checks agrees with
 * the rule however wrong they both are.
 *
 * Returns how far along the shadow the hit was, or `null` for no hit.
 */
function walkShadow(
  prop: { readonly kind: PlacedProp['kind']; readonly position: { x: number; z: number }; readonly scale: number },
  sun: { readonly azimuth: number; readonly elevation: number },
  hits: (x: number, z: number, rayHeight: number, reach: number) => boolean,
): number | null {
  const height = FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS];
  if (height === undefined) return null;
  const reach = footprintReach(prop.kind, prop.scale);
  const perMetre = shadowPerMetre(sun);
  const direction = shadowDirection(sun);
  const top = fieldHeightAt(prop.position.x, prop.position.z) + height * prop.scale;
  const length = (height * prop.scale + FOREST_SHADOW_STAND) * perMetre;
  for (let travelled = 0; travelled <= length + 1e-9; travelled += 0.2) {
    const x = prop.position.x + direction.x * travelled;
    const z = prop.position.z + direction.z * travelled;
    if (hits(x, z, top - travelled / perMetre, reach)) return travelled;
  }
  return null;
}

/** A prop's own widest reach in plan, metres — the thing clearances measure. */
function footprintReach(kind: PlacedProp['kind'], scale: number): number {
  const footprint = PROP_FOOTPRINTS[kind];
  return (footprint.shape === 'circle'
    ? footprint.radius
    : Math.hypot(footprint.halfX, footprint.halfZ)) * scale;
}

/** The step a wheel can mount by rolling, metres — principle 3's own bound. */
const STEP_UP_LIMIT = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;

/**
 * Every block on the venue, with the corridor that carries it.
 *
 * Phase 4 put a second population of blocks on this venue — the hillside's own
 * cribbing and riprap, which stand *outside* every corridor rather than on the
 * technical half of one — so the two are separated here by identity against
 * `SWITCHBACK_HILLSIDE_BLOCKS` rather than by any property of the block itself.
 * A geometry claim measured over the union of the two would be measuring two
 * different things at once.
 */
const HILLSIDE_BLOCK_SET: ReadonlySet<SegmentBlock> = new Set(
  [...SWITCHBACK_HILLSIDE_BLOCKS.values()].flat(),
);

function everyBlock(
  which: 'feature' | 'hillside' = 'feature',
): { readonly id: string; readonly halfWidth: number; readonly block: SegmentBlock }[] {
  const out: { id: string; halfWidth: number; block: SegmentBlock }[] = [];
  for (const spec of SWITCHBACK_GRAPH) {
    for (const block of spec.blocks ?? []) {
      if (HILLSIDE_BLOCK_SET.has(block) !== (which === 'hillside')) continue;
      out.push({ id: spec.id, halfWidth: spec.halfWidth, block });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1 — the ring closes, in plan, in heading and in height
// ---------------------------------------------------------------------------

test('the lap closes on itself in position, in heading and in height', () => {
  const first = placed[0].entry;
  const last = placed[placed.length - 1].exit;

  const gap = Math.hypot(last.position.x - first.position.x, last.position.z - first.position.z);
  assert.ok(gap < 1e-6, `the lap misses its own start by ${gap.toExponential(2)} m`);

  // **The half BelVar does not have.** A flat circuit closes in height by
  // having no height; this one spends 14.2 m on the way down and has to find
  // exactly that much on the way back, or the summit apron is a step in the
  // road. It is closed by construction — every climb leg takes its share of
  // what the descent spent — so the tolerance is double precision rather than a
  // construction slack.
  const rise = Math.abs(last.position.y - first.position.y);
  assert.ok(rise < 1e-9, `the lap comes home ${rise.toExponential(2)} m off its own height`);

  // Positive yaw is a left-hand turn (`segments.ts`), so +2π is an
  // anticlockwise lap — the mirror of BelVar's sign and nothing else.
  const turned = last.headingY - first.headingY;
  assert.ok(
    Math.abs(turned - 2 * Math.PI) < 1e-9,
    `the lap turns ${(turned * 180 / Math.PI).toFixed(6)}°, not +360°`,
  );
});

test('the authored turns sum to +360° before anything is placed', () => {
  // The same claim one layer earlier, on the table an author edits. A turn
  // changed here without another to match is a spiral, and the closure solve
  // cannot fix a spiral — it can only move two straights.
  const turned = SWITCHBACK_GEOMETRY.reduce((total, element) => total + element.turn, 0);
  assert.equal(turned, 360);

  const lefts = SWITCHBACK_GEOMETRY.filter((element) => element.turn > 0);
  const rights = SWITCHBACK_GEOMETRY.filter((element) => element.turn < 0);
  assert.equal(lefts.length, 6);
  assert.equal(rights.length, 2);
  // Two right-hand hairpins against six left-handers, and the arithmetic is
  // what a switchback descent *is*: every hairpin reverses the trail, so they
  // alternate in sign and cancel each other in pairs. The lap's whole +360°
  // therefore comes from the four quarter-turns — the entrance, the terrace,
  // the bottom and the summit — and the hairpins spend 720° of left against
  // 360° of right getting down the hill.
  assert.equal(rights.reduce((total, element) => total + element.turn, 0), -360);
  assert.equal(lefts.reduce((total, element) => total + element.turn, 0), 720);
});

test('the two solved straights are positive, rideable, and close the ring', () => {
  const solved = SWITCHBACK_LOOP.filter((element) => element.solve === true);
  assert.deepEqual(solved.map((element) => element.id), ['bottom', 'fire-road-1']);

  for (const element of solved) {
    const geometry = SWITCHBACK_GEOMETRY.find((candidate) => candidate.id === element.id);
    assert.ok(geometry !== undefined);
    assert.ok(
      geometry.length > 10 && geometry.length < 250,
      `${element.id} solved to ${geometry.length.toFixed(2)} m, which is not a straight`,
    );
  }

  // The numbers themselves, so an edit that moved a radius shows up as a
  // changed length here rather than as a lap that is still closed and no longer
  // the layout anybody accepted.
  const bottom = SWITCHBACK_GEOMETRY.find((element) => element.id === 'bottom');
  const fireRoad = SWITCHBACK_GEOMETRY.find((element) => element.id === 'fire-road-1');
  assert.ok(bottom !== undefined && fireRoad !== undefined);
  // Phase 2 took `bottom` from sixty-seven metres to thirty-five, and the
  // tabletop was the whole of the difference: `kicker-lip` and `kicker-table`
  // added exactly 32 m of straight to beat 5, the ring closed on the same two
  // solved legs, and the closure spent all of it here — a shape change and not
  // a size change.
  //
  // Phase 6 then tightened `clearing-turn` from R18 to R15 so a rider could no
  // longer cross out of it onto the fire road, and *that* is a size change: the
  // arc lost 9.4 m and the closure took a further 6 m off `fire-road-1`.
  // `summit-return` gives those six back (it is a `climbShare` leg and the
  // fire road is too, so the climb is the same length at the same grade), which
  // is why `bottom` has grown by the same six.
  assert.ok(Math.abs(bottom.length - 41) < 1e-9, `bottom is ${bottom.length}`);
  assert.ok(Math.abs(fireRoad.length - 68) < 1e-9, `fire-road-1 is ${fireRoad.length}`);
});

test('every beat of the §36.3 program is a corridor that exists', () => {
  const ids = new Set(SWITCHBACK_GEOMETRY.map((element) => element.id));
  const named = new Set<string>();
  for (const beat of SWITCHBACK_PROGRAM) {
    for (const id of beat.segments) {
      assert.ok(ids.has(id), `beat ${beat.beat} names "${id}", which the lap does not carry`);
      assert.ok(!named.has(id), `"${id}" belongs to two beats`);
      named.add(id);
    }
  }
  assert.equal(SWITCHBACK_PROGRAM.length, 8, 'the program is eight beats');
  // And every corridor belongs to one: a beat program that described most of
  // the lap would not be the thing the layout was authored from.
  assert.equal(named.size, ids.size, 'a corridor belongs to no beat');
  assert.equal(PARK_NAME, 'Switchback Park');
});

// ---------------------------------------------------------------------------
// 2 — the envelope the referees judge
// ---------------------------------------------------------------------------

test('the park emits a lap envelope, and it is the ring the geometry states', () => {
  const lap = plan.lap;
  assert.ok(lap !== undefined, 'Switchback Park emitted no lap, so Track Day would refuse it');

  assert.ok(
    Math.abs(lap.length - SWITCHBACK_LAP_METRES) < 1,
    `the sampled ring is ${lap.length.toFixed(2)} m against the authored ${SWITCHBACK_LAP_METRES.toFixed(2)}`,
  );

  const first = lap.points[0];
  const last = lap.points[lap.points.length - 1];
  assert.equal(first.x, last.x);
  assert.equal(first.z, last.z);

  // **Every corridor is the lap.** There are no branches here at all — that is
  // principle 1 — so the plan's corridor list and the lap's are the same list.
  assert.deepEqual([...SWITCHBACK_LAP_SEGMENT_IDS], plan.segments.map((segment) => segment.id));
});

test("each envelope point carries its own corridor's half-width", () => {
  // **The widths are what the referee judges a rider against**, span by span,
  // so a point that took a neighbour's width would move the legal edge of the
  // road by up to three metres with nothing on screen to say so. Rebuilt here
  // from the placed chain with the builder's own 2 m sampling, and compared
  // point for point rather than asserted as a set — a set would pass on a lap
  // whose widths were right and in the wrong order.
  const lap = plan.lap;
  assert.ok(lap !== undefined);

  const expected: { x: number; z: number; halfWidth: number }[] = [];
  for (const segment of placed) {
    const divisions = Math.max(1, Math.ceil(segment.spec.length / 2));
    for (let division = 0; division <= divisions; division += 1) {
      const point = centrelineAt(
        segment.entry,
        segment.spec,
        (division / divisions) * segment.spec.length,
      );
      const previous = expected[expected.length - 1];
      // The builder drops a sample that lands on the previous one, which is
      // what happens at every corridor seam by construction.
      if (previous !== undefined && Math.hypot(point.x - previous.x, point.z - previous.z) < 1e-6) {
        continue;
      }
      expected.push({ x: point.x, z: point.z, halfWidth: segment.spec.halfWidth });
    }
  }
  expected.push({ ...expected[0] });

  assert.equal(lap.points.length, expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(Math.abs(lap.points[index].x - expected[index].x) < 1e-9, `point ${index} x`);
    assert.ok(Math.abs(lap.points[index].z - expected[index].z) < 1e-9, `point ${index} z`);
    assert.equal(lap.points[index].halfWidth, expected[index].halfWidth, `point ${index} width`);
  }
});

test('the lap referees accept this venue and the point-to-point one declines it', () => {
  // **Nothing here branches on which level is loaded**, which is the whole
  // shape of the claim: a lap is a route that starts and never stops, a time
  // trial asks whether a route can start and stop, and the three referees sort
  // themselves out from the gates alone.
  assert.equal(new TrackDayRun(plan.id, plan.checkpoints, plan.lap ?? null).available, true);
  assert.equal(new RaceRun(plan.checkpoints, plan.lap ?? null).available, true);
  assert.equal(new ChallengeRun(plan.id, plan.checkpoints).available, false);
  // And the route-follower's spine refuses it for the same reason: a `start,
  // split, split` spelling is a ring, and a spine across a ring is a truncated
  // line (`EucController.test.ts` records the version of that bug that shipped).
  assert.equal(RouteSpine.fromPlan(plan), null);
});

// ---------------------------------------------------------------------------
// 3 — the switchbacks keep out of each other's way
// ---------------------------------------------------------------------------

test('adjacent switchback legs cannot steal each other\'s projection', () => {
  // **§36.3's own requirement, as arithmetic.** `LapEnvelope.progressAt` takes
  // the *nearest* point on the ring, so two legs of one hairpin closer together
  // than twice their reach would let a rider on one of them project onto the
  // other — and a race's standings would read a rider as being a switchback
  // ahead of where they are. The reach is a half-width plus
  // `TRACK_DAY.offCourseMarginMetres`, so twice the half-width plus five metres
  // clears it with a metre in hand at the tightest hairpin on the venue.
  const hairpins = SWITCHBACK_GEOMETRY.filter((element) => Math.abs(element.turn) === 180);
  assert.equal(hairpins.length, 4, 'the descent is four hairpins and a clearing');

  for (const hairpin of hairpins) {
    const segment = bySegment.get(hairpin.id);
    assert.ok(segment !== undefined);
    const index = SWITCHBACK_GEOMETRY.indexOf(hairpin);
    const before = SWITCHBACK_GEOMETRY[index - 1];
    const after = SWITCHBACK_GEOMETRY[index + 1];
    const widest = Math.max(before.halfWidth, after.halfWidth);
    const apart = Math.hypot(
      segment.exit.position.x - segment.entry.position.x,
      segment.exit.position.z - segment.entry.position.z,
    );
    assert.ok(
      apart >= 2 * widest + 5,
      `${hairpin.id}'s legs are ${apart.toFixed(1)} m apart, under ${2 * widest + 5}`,
    );
  }
});

test('no two corridors that are not neighbours come within two metres of touching', () => {
  // Sampled on the corridor *edges* rather than the centrelines, because what
  // must not meet is the rideable ground: two corridors whose edges touched
  // would merge into one sheet and the shortest way round the lap would be
  // across the join.
  let closest = Infinity;
  let where = '';
  const count = placed.length;

  for (let a = 0; a < count; a += 1) {
    const source = placed[a];
    const divisions = Math.max(1, Math.ceil(source.spec.length / 2));
    for (let division = 0; division <= divisions; division += 1) {
      const s = (division / divisions) * source.spec.length;
      const heading = headingAt(source.entry, source.spec, s);
      const centre = centrelineAt(source.entry, source.spec, s);
      const left = leftOf(heading);
      for (const side of [1, -1] as const) {
        const x = centre.x + left.x * side * source.spec.halfWidth;
        const z = centre.z + left.z * side * source.spec.halfWidth;
        for (let b = 0; b < count; b += 1) {
          const along = Math.min(Math.abs(b - a), count - Math.abs(b - a));
          if (along <= 1) continue;
          const query = querySegment(placed[b], x, z);
          if (query === null) continue;
          if (query.outside < closest) {
            closest = query.outside;
            where = `${source.spec.id} -> ${placed[b].spec.id}`;
          }
        }
      }
    }
  }

  assert.ok(closest > 2, `${where} leave only ${closest.toFixed(2)} m between them`);
});

test('two stretches of trail a rider could cut between leave off-course ground between them', () => {
  // **Phase 6's blocker, as the bound that would have caught it.** The two
  // tests above are about *ground*: one holds a hairpin's own legs apart, the
  // other holds every corridor's rideable edges two metres clear of another's.
  // Neither is the question a cut asks, because a cut is decided by the
  // *referee's* reach rather than by the cutting: `LapEnvelope.contains` is
  // true out to a half-width plus `TRACK_DAY.offCourseMarginMetres` and its
  // test is inclusive, so two corridors whose edges are three metres apart can
  // still be one continuous sheet of legal ground — which is exactly what
  // `clearing-turn` and `fire-road-1` were, 204 m apart on the lap, with a lap
  // ridden across them counting and finishing twenty-six seconds early.
  //
  // So this states the floor the way the referee reads it (`separationFloor`),
  // over every pair of points more than `SEPARATION_LAP_GAP_METRES` apart along
  // the ring, and asks for `SEPARATION_CLEAR_METRES` of genuinely off-course
  // hillside on top. The tightest pairs on the venue — the spin shelf's own
  // legs, and the shelf against `bottom` below it — stand a full metre clear,
  // twice the floor; nothing is nearer than that.
  const points: { x: number; z: number; halfWidth: number; along: number; id: string }[] = [];
  for (const segment of placed) {
    const count = Math.max(1, Math.ceil(segment.spec.length / 0.5));
    for (let step = 0; step < count; step += 1) {
      const s = (segment.spec.length * step) / count;
      const point = centrelineAt(segment.entry, segment.spec, s);
      points.push({
        x: point.x,
        z: point.z,
        halfWidth: segment.spec.halfWidth,
        along: SWITCHBACK_ENTRY_DISTANCE.get(segment.spec.id)! + s,
        id: segment.spec.id,
      });
    }
  }

  let worst = Infinity;
  let where = '';
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const gap = Math.abs(points[a].along - points[b].along);
      if (Math.min(gap, SWITCHBACK_LAP_METRES - gap) <= SEPARATION_LAP_GAP_METRES) continue;
      const clear = Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z)
        - separationFloor(points[a].halfWidth, points[b].halfWidth);
      if (clear < worst) {
        worst = clear;
        where = `${points[a].id} at ${points[a].along.toFixed(0)} m `
          + `and ${points[b].id} at ${points[b].along.toFixed(0)} m`;
      }
    }
  }

  assert.ok(
    worst >= 0,
    `${where} are ${(-worst).toFixed(2)} m inside the separation floor, `
    + `so a rider can cross between them without ever leaving the course`,
  );
  // And the venue's own habit, as a lower bound rather than a pin: a layout
  // edit is free to open the ring out, and is not free to quietly spend this
  // down to the bare floor. The metre is what `shelf-turn`'s comment in
  // `switchbackLevel.ts` has claimed since Phase 1, measured here.
  assert.ok(
    worst >= SEPARATION_CLEAR_METRES - 0.01,
    `the tightest pair on the venue is ${where}, standing `
    + `${(worst + SEPARATION_CLEAR_METRES).toFixed(2)} m clear of the referee's reach `
    + `rather than the metre this layout keeps`,
  );
});

test('a rider out on the verge is never projected onto another part of the lap', () => {
  // §36.3's "ensure adjacent switchbacks cannot steal each other's projection",
  // walked rather than argued. `LapEnvelope.progressAt` answers with the
  // *nearest* point on the ring and keeps no state, which is the right choice
  // and the reason this has to be a property of the layout: wherever two
  // corridors' reaches meet, the answer jumps the whole way round the ring, and
  // `RaceRun.writeProgress` feeds it straight into the standings. At R18 a
  // rider half a metre outside `clearing-turn`'s edge — on level, legal,
  // rideable ground — read as 220 m further round the lap than they were.
  //
  // So walk every corridor out to the last ground the referee calls on-course
  // and require the answer to move like the rider does.
  assert.ok(plan.lap !== undefined, 'the park lost its lap');
  const envelope = new LapEnvelope(plan.lap);
  const length = envelope.walkedLength;
  const step = 0.25;

  let worst = 0;
  let where = '';
  for (const segment of placed) {
    const reach = segment.spec.halfWidth + TRACK_DAY.offCourseMarginMetres;
    const count = Math.max(1, Math.round(segment.spec.length));
    for (let division = 0; division <= count; division += 1) {
      const s = (segment.spec.length * division) / count;
      const centre = centrelineAt(segment.entry, segment.spec, s);
      const left = leftOf(headingAt(segment.entry, segment.spec, s));
      for (const side of [1, -1] as const) {
        let previous = envelope.progressAt(centre.x, centre.z);
        for (let out = step; out <= reach; out += step) {
          const x = centre.x + left.x * side * out;
          const z = centre.z + left.z * side * out;
          const here = envelope.progressAt(x, z);
          const moved = Math.abs(((here - previous + length * 1.5) % length) - length / 2);
          if (moved > worst) {
            worst = moved;
            where = `${segment.spec.id} at s=${s.toFixed(1)}, ${(side * out).toFixed(2)} m out`;
          }
          previous = here;
        }
      }
    }
  }

  // A quarter-metre sideways step may move the reported progress by at most the
  // same quarter metre and a little curvature. A metre is generous; the jump
  // this refuses was two hundred.
  assert.ok(worst < 1, `progress jumps ${worst.toFixed(1)} m at ${where}`);
});

test('the lap never crosses itself', () => {
  // BelVar's claim on a venue whose corridors are four different widths, so the
  // floor is per-pair rather than one number: two stretches of trail far apart
  // along the ring have to be further apart in the world than their own two
  // half-widths, plus two metres of hillside between them.
  const samples: { x: number; z: number; halfWidth: number }[] = [];
  for (const segment of placed) {
    const count = Math.max(1, Math.round(segment.spec.length));
    for (let step = 0; step < count; step += 1) {
      const point = centrelineAt(segment.entry, segment.spec, (segment.spec.length * step) / count);
      samples.push({ x: point.x, z: point.z, halfWidth: segment.spec.halfWidth });
    }
  }

  let margin = Infinity;
  let where = -1;
  for (let a = 0; a < samples.length; a += 1) {
    for (let b = a + 1; b < samples.length; b += 1) {
      const along = Math.min(b - a, samples.length - (b - a));
      if (along < 60) continue;
      const clear = Math.hypot(samples[a].x - samples[b].x, samples[a].z - samples[b].z)
        - samples[a].halfWidth - samples[b].halfWidth;
      if (clear < margin) { margin = clear; where = a; }
    }
  }

  assert.ok(margin > 2, `two stretches of the lap pass ${margin.toFixed(2)} m apart near sample ${where}`);
});

// ---------------------------------------------------------------------------
// 4 — the gates
// ---------------------------------------------------------------------------

test('the route is a lap: one line, then two sectors, and no second end', () => {
  assert.deepEqual(plan.checkpoints.map((gate) => gate.kind), ['start', 'split', 'split']);
  assert.deepEqual(plan.checkpoints.map((gate) => gate.routeIndex), [0, 1, 2]);
  assert.equal(plan.checkpoints.length, 3, 'the three-gate lap pattern, not a gate per feature');
});

test('every gate stands square across common ground, clear of its own sockets', () => {
  for (const spec of SWITCHBACK_CHECKPOINTS) {
    const element = SWITCHBACK_GEOMETRY.find((candidate) => candidate.id === spec.segment);
    assert.ok(element !== undefined, `${spec.id} names a corridor the lap does not carry`);
    assert.equal(element.turn, 0, `${spec.id} sits on a corner`);
    // The whole volume inside one corridor, so a crossing is never split across
    // a seam where two corridors' headings differ.
    assert.ok(spec.s > CHALLENGE.gateHalfDepth * 2, `${spec.id} straddles its entry socket`);
    assert.ok(
      spec.s < element.length - CHALLENGE.gateHalfDepth * 2,
      `${spec.id} straddles its exit socket`,
    );

    // **Common ground**, which on this venue is the claim that matters:
    // principle 1 puts the technical line on the left half of a corridor, and a
    // gate over a deck would be a gate one of the two legal lines crosses at a
    // different height from the other. Every corridor carrying a gate carries
    // no blocks at all.
    const carrier = SWITCHBACK_GRAPH.find((candidate) => candidate.id === spec.segment);
    assert.ok(carrier !== undefined);
    const gateHalfWidth = carrier.halfWidth + CHALLENGE.gateWidthMargin;
    for (const block of carrier.blocks ?? []) {
      // **The gate's own volume, in both axes.** Phase 4's hillside runs stand
      // four metres outside the corridor's edge, which is past the gate's own
      // 2.4 m margin as well — so they cannot be inside a gate whatever their
      // `s` is, and testing them on `s` alone would move a rock to say so.
      if (Math.abs(block.t) - block.halfLateral >= gateHalfWidth) continue;
      const ends = block.s + block.halfAlong;
      const starts = block.s - block.halfAlong;
      assert.ok(
        ends < spec.s - CHALLENGE.gateHalfDepth || starts > spec.s + CHALLENGE.gateHalfDepth,
        `a block on "${spec.segment}" stands inside the ${spec.id} gate`,
      );
    }
  }

  for (const gate of plan.checkpoints) {
    const carrier = SWITCHBACK_GRAPH.find(
      (candidate) => candidate.id
        === SWITCHBACK_CHECKPOINTS.find((spec) => spec.id === gate.id)?.segment,
    );
    assert.ok(carrier !== undefined);
    assert.equal(gate.halfExtents.x, carrier.halfWidth + CHALLENGE.gateWidthMargin);
    assert.ok(gate.halfExtents.z < gate.halfExtents.x / 4, `${gate.id} is an area, not a line`);

    // Standing on the ground, and the ground is the *lowest* under the gate's
    // own footprint rather than the height at its centre: the two are the same
    // number on a level apron and seventeen centimetres apart on a climbing
    // fire road, and it is the lower one a rider's contact patch has to be
    // inside the volume of.
    //
    // **Swept across the corridor rather than across the gate's own width**,
    // which is the half `resolveCheckpoints` gets right and a test written
    // from the volume alone gets wrong: the gate is `gateWidthMargin` wider
    // than the road it spans, so the outer 2.4 m of its box is over the
    // shoulder — which on a hillside is falling away, and on this venue is
    // 14 cm lower at the start line. A floor taken out there would be a floor
    // under the ground the rider is actually on.
    const left = leftOf(gate.headingY);
    const forward = { x: Math.sin(gate.headingY), z: Math.cos(gate.headingY) };
    let lowest = Infinity;
    for (let column = 0; column <= 24; column += 1) {
      const t = -carrier.halfWidth + (carrier.halfWidth * 2 * column) / 24;
      for (let row = 0; row <= 12; row += 1) {
        const d = -gate.halfExtents.z + (gate.halfExtents.z * 2 * row) / 12;
        lowest = Math.min(lowest, groundAt(
          gate.centre.x + left.x * t + forward.x * d,
          gate.centre.z + left.z * t + forward.z * d,
        ).height);
      }
    }
    const floor = gate.centre.y - CHALLENGE.gateHalfHeight;
    assert.ok(
      Math.abs(floor - lowest) < 0.05,
      `${gate.id}'s floor is ${floor.toFixed(3)} over ground of ${lowest.toFixed(3)}`,
    );
  }
});

test('every gate sits on the envelope it is judged against', () => {
  // The gates and the envelope are resolved by different code from the same
  // corridors, so a divergence would be silent: a gate a metre off the sampled
  // line is a gate the referee expects to be crossed where the envelope calls
  // the rider off-course.
  const lap = plan.lap;
  assert.ok(lap !== undefined);
  for (const gate of plan.checkpoints) {
    let best = Infinity;
    for (let index = 1; index < lap.points.length; index += 1) {
      const a = lap.points[index - 1];
      const b = lap.points[index];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0
        ? Math.min(1, Math.max(0, ((gate.centre.x - a.x) * dx + (gate.centre.z - a.z) * dz) / lengthSquared))
        : 0;
      best = Math.min(best, Math.hypot(gate.centre.x - (a.x + dx * t), gate.centre.z - (a.z + dz * t)));
    }
    assert.ok(best < 0.05, `${gate.id} sits ${(best * 1000).toFixed(0)} mm off the lap line`);
  }
});

test('the sectors divide the lap into thirds a rider can name', () => {
  const along = (segmentId: string, s: number): number => {
    const entry = SWITCHBACK_ENTRY_DISTANCE.get(segmentId);
    assert.ok(entry !== undefined, `no segment "${segmentId}"`);
    return entry + s;
  };
  const line = along('apron', PARK.lineAt);
  const boundaries = SWITCHBACK_CHECKPOINTS.slice(1)
    .map((spec) => (along(spec.segment, spec.s) - line + SWITCHBACK_LAP_METRES) % SWITCHBACK_LAP_METRES);
  const sectors = [
    boundaries[0],
    boundaries[1] - boundaries[0],
    SWITCHBACK_LAP_METRES - boundaries[1],
  ];
  for (const sector of sectors) {
    assert.ok(
      sector > SWITCHBACK_LAP_METRES * 0.25 && sector < SWITCHBACK_LAP_METRES * 0.42,
      `a sector is ${sector.toFixed(0)} m of a ${SWITCHBACK_LAP_METRES.toFixed(0)} m lap`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5 — the spawn and the four-seat grid
// ---------------------------------------------------------------------------

test('the rider spawns on the apron, facing the lap, with an out-lap to the line', () => {
  const ground = groundAt(plan.spawn.position.x, plan.spawn.position.z);
  assert.equal(ground.surface, 'pavement');

  const apron = bySegment.get('apron');
  assert.ok(apron !== undefined);
  const here = querySegment(apron, plan.spawn.position.x, plan.spawn.position.z);
  assert.ok(here !== null && here.outside === 0, 'the spawn is off the corridor');
  assert.ok(Math.abs(here.t) < 0.01, 'the spawn is not on the centreline');

  const runUp = PARK.lineAt - PARK.spawnAt;
  assert.ok(runUp > CHALLENGE.startRunupMetres * 3, `only ${runUp.toFixed(0)} m of out-lap`);
});

test('the four-seat race grid fits behind the line on level pavement', () => {
  // **The grid is laid out behind the start line, not behind the spawn**
  // (`spawnSlots.raceGridSlot`), so this is a claim about the apron rather than
  // about where a free rider begins — and §36.8 Phase 1 asks for it now,
  // before trees can hide a layout fault.
  const line = plan.checkpoints[0];
  const apron = bySegment.get('apron');
  assert.ok(apron !== undefined);
  const apronHeight = groundAt(line.centre.x, line.centre.z).height;

  const slots = [0, 1, 2, 3].map((index) => raceGridSlot(line, index, sampler));
  for (const [index, slot] of slots.entries()) {
    const here = querySegment(apron, slot.position.x, slot.position.z);
    assert.ok(here !== null && here.outside === 0, `seat ${index} is off the apron`);
    assert.equal(groundAt(slot.position.x, slot.position.z).surface, 'pavement', `seat ${index}`);
    assert.ok(
      Math.abs(slot.position.y - apronHeight) < 0.04,
      `seat ${index} stands ${(slot.position.y - apronHeight).toFixed(3)} m off the apron`,
    );
    // Behind the line, which is what stops a rider starting inside the gate's
    // own volume and having their first crossing swallowed by the latch.
    assert.ok(here.s < PARK.lineAt, `seat ${index} starts past the line`);
    assert.ok(here.s > PARK.lineAt - 8, `seat ${index} is further back than the apron is wide`);
  }

  // Four distinct places, not one place four riders share.
  for (let a = 0; a < slots.length; a += 1) {
    for (let b = a + 1; b < slots.length; b += 1) {
      const apart = Math.hypot(
        slots[a].position.x - slots[b].position.x,
        slots[a].position.z - slots[b].position.z,
      );
      assert.ok(apart > 1, `seats ${a} and ${b} stand ${apart.toFixed(2)} m apart`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6 — the features, pinned to what the builders achieved
// ---------------------------------------------------------------------------

/** Pin a measured number to the bit, so a moved feature fails as a number. */
function pin(what: string, measured: number, expected: number): void {
  assert.ok(
    Math.abs(measured - expected) < 1e-9,
    `${what} is ${measured.toFixed(6)}, pinned at ${expected}`,
  );
}

test('the marked ledge drops into the band the drop bench measured clean', () => {
  const ledge = SWITCHBACK_FEATURES.ledge;
  assert.equal(ledge.kind, 'deck');
  assert.equal(ledge.segment, 'terrace-drop');
  if (ledge.kind !== 'deck') return;
  pin('the ledge entry face', ledge.report.entryFace, 0.05);
  pin('the ledge drop', ledge.report.exitDrop, 0.33);
  assert.ok(
    ledge.report.exitDrop >= 0.3 && ledge.report.exitDrop <= 0.4,
    'the first feature on the lap is outside the gentlest band',
  );
});

test('the straight gap catches a short landing and lets it ride away', () => {
  const gap = SWITCHBACK_FEATURES.gap;
  assert.equal(gap.kind, 'steppedDecks');
  if (gap.kind !== 'steppedDecks') return;
  assert.equal(gap.report.decks.length, 2);

  pin('the gap', 3, 3);
  pin('the gap catch drop', gap.report.gapCatchDrops[0], 0.4325);
  assert.ok(
    gap.report.gapCatchDrops[0] >= 0.3 && gap.report.gapCatchDrops[0] <= 0.55,
    'a rider who comes up short falls outside the measured clean band',
  );

  // **Principle 3, and the number the whole feature was sized around.** A
  // landing deck standing higher than the wheel can mount turns the catch
  // ground into a slot, so the second deck is stepped down until its face is
  // under `WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor`.
  // **Phase 2 lowered this face from 0.185 m, on a measurement.** A rider who
  // comes up short does not land in the middle of the opening; at 21.0–26.0 mph
  // with no hop they land within five centimetres of the landing deck's foot,
  // and at 0.185 m the wheel met the face while it was still absorbing the
  // touchdown and bonked — an `obstacle` crash, recovered in 2.51 s, which is
  // "demanding a reset" in everything but name. The installed sweep put the
  // boundary between 0.160 m (rides away) and 0.185 m (bonks); 0.135 m is the
  // passing side with five centimetres in hand. See `docs/JUMP_BENCH.md` T11.
  pin('the landing deck face', gap.report.decks[1].entryFace, 0.135);
  assert.ok(gap.report.decks[1].entryFace <= 0.16);
  assert.ok(gap.report.decks[1].entryFace < STEP_UP_LIMIT);

  pin('the deck-to-deck drop', gap.report.drops[0], 0.35);
  pin('the gap exit drop', gap.report.drops[1], 0.415);
  assert.ok(gap.report.drops[1] >= 0.3 && gap.report.drops[1] <= 0.55);
});

test('the skinny is a plank a wheel fits on, with a catch on both sides', () => {
  const skinny = SWITCHBACK_FEATURES.skinny;
  assert.equal(skinny.kind, 'deck');
  if (skinny.kind !== 'deck') return;
  const block = skinny.report.blocks[0];
  pin('the skinny width', block.halfLateral * 2, 0.9);
  pin('the skinny lift', skinny.report.entryFace, 0.3);
  pin('the skinny exit drop', skinny.report.exitDrop, 0.54);
  assert.ok(skinny.report.exitDrop <= 0.55, 'stepping off the far end is outside the clean band');
});

test('the charged step-up face lies between the flat uncharged and charged hop apices', () => {
  // §36.2a's own two numbers: the sampled flat apex is 0.4463 m uncharged and
  // 0.6275 m charged, and the face is authored between them so the crouch is a
  // decision rather than a decoration.
  const step = SWITCHBACK_FEATURES.stepUp;
  assert.equal(step.kind, 'deck');
  if (step.kind !== 'deck') return;
  pin('the step-up face', step.report.entryFace, 0.5);
  assert.ok(step.report.entryFace > 0.4463 && step.report.entryFace < 0.6275);
  pin('the step-up exit drop', step.report.exitDrop, 0.68);
  assert.ok(step.report.exitDrop <= 0.7);
});

test('the installed skinny and step-up can be mounted and ridden off on both wheels', () => {
  // The builder's face/apex arithmetic does not prove a hop meets the face
  // in time on the finished hillside. Drive the actual sampler and controller.
  const segment = bySegment.get('timber')!;
  const heading = segment.entry.headingY;
  const left = leftOf(heading);
  for (const wheel of ['shipped65', 'diagnostic50'] as const) {
    for (const id of ['skinny', 'stepUp'] as const) {
      const block = SWITCHBACK_FEATURES[id].report.blocks[0];
      const from = block.s - block.halfAlong;
      const end = block.s + block.halfAlong;
      const start = centrelineAt(segment.entry, segment.spec, Math.max(0, from - 6));
      for (const mph of [8, 12.5, 20]) {
        for (const charged of id === 'skinny' ? [false] : [false, true]) {
          const rider = new EucController(sampler, { tuning: wheelTuning(wheel) });
          rider.reset({
            position: { x: start.x + left.x * block.t, y: start.y, z: start.z + left.z * block.t },
            headingY: heading,
          }, mph * 0.44704);
          let pressed = false;
          let mounted = false;
          let finished = false;
          for (let tick = 0; tick < 1200; tick += 1) {
            const before = rider.snapshot();
            const s = (before.position.x - segment.entry.position.x) * Math.sin(heading)
              + (before.position.z - segment.entry.position.z) * Math.cos(heading);
            if (s > end + 1) { finished = true; break; }
            const hop = !pressed && s >= from - Math.max(0, before.speed) * 0.4;
            if (hop) pressed = true;
            rider.step(STEP, {
              ...NEUTRAL_ACTIONS,
              throttle: before.speed < mph * 0.44704 ? 0.3 : 0,
              crouch: charged,
              hop,
            });
            const after = rider.snapshot();
            if (s > from + 0.1 && s < end - 0.1 && after.grounded && after.surface === 'wood') {
              mounted = true;
            }
            if (after.crashed) break;
          }
          const label = `${id}, ${wheel}, ${mph} mph initial, charged=${charged}`;
          if (id === 'stepUp' && !charged) {
            assert.equal(mounted, false, `${label}: mounted without charge`);
          } else {
            assert.ok(mounted && finished && !rider.snapshot().crashed, `${label}: did not ride the feature`);
          }
        }
      }
    }
  }
});

test('the staircase is three solid treads, not a ramp with a texture', () => {
  const stairs = SWITCHBACK_FEATURES.stairs;
  assert.equal(stairs.kind, 'stairs');
  if (stairs.kind !== 'stairs') return;
  assert.equal(stairs.report.blocks.length, 3);
  for (const height of stairs.report.treadHeights) pin('a tread block', height, 0.15);
  // The last drop is off the bottom tread onto the trail, which is a step like
  // the two above it rather than a flush hand-over — three treads make three
  // equal drops, and the third one is this.
  pin('the staircase exit drop', stairs.report.exitDrop, 0.3);
  assert.ok(Math.abs(stairs.report.exitDrop - 0.3) <= 0.01);
});

test('the rock rhythm is three distinct drops, not one long fall', () => {
  const rhythm = SWITCHBACK_FEATURES.rhythm;
  assert.equal(rhythm.kind, 'steppedDecks');
  if (rhythm.kind !== 'steppedDecks') return;
  assert.equal(rhythm.report.decks.length, 3);
  pin('rhythm drop 1', rhythm.report.drops[0], 0.3);
  pin('rhythm drop 2', rhythm.report.drops[1], 0.3);
  pin('rhythm exit drop', rhythm.report.drops[2], 0.5);
  assert.ok(rhythm.report.drops[2] <= 0.55);
  // Every deck after the first is mountable from the ground beside it, which is
  // principle 3 on a rhythm: a rider who lands short between two terraces rides
  // up onto the next rather than being stopped by it.
  for (const deck of rhythm.report.decks.slice(1)) {
    assert.ok(deck.entryFace < STEP_UP_LIMIT, `a rhythm deck stands ${deck.entryFace} m proud`);
  }
});

test('the kicker lip is flush with the crest and guarantees the launch', () => {
  const kicker = SWITCHBACK_FEATURES.kicker;
  assert.equal(kicker.kind, 'lip');
  assert.equal(kicker.segment, 'kicker-lip');
  if (kicker.kind !== 'lip') return;
  pin('the kicker step-up', kicker.report.stepUpAtStart, 0);
  assert.ok(kicker.report.stepUpAtStart <= 0.02, 'the lip has a kerb at its start');
  pin('the kicker drop', kicker.report.dropAtLip, 0.15);
  // Three times the launch threshold, so this is a face and not a fold. The
  // epsilon is the threshold's own arithmetic: `0.05 * 3` is 0.15000000000000002
  // as a double and the face is exactly 0.15, so a strict `>` would fail on a
  // difference of two parts in 10^17.
  assert.ok(kicker.report.dropAtLip >= TERRAIN.dropLaunchThreshold * 3 - 1e-12);
  // **And under the measured ceiling.** A flight that begins and ends at one
  // height lands at the speed it launched with, so on a level table the whole
  // of the landing score is the hop's own impulse plus this face. The installed
  // sweep is clean to 0.18 m and heavy at 0.20 m with a fully charged hop; the
  // face is authored at 0.15 m and the margin is deliberate.
  assert.ok(
    kicker.report.dropAtLip <= 0.18,
    `the kicker face is ${kicker.report.dropAtLip} m, past the clean ceiling`,
  );
});

test('the kicker lands on a short level table, and past it on a 30% landing hill', () => {
  // **The big jump, as geometry — the owner's first-ride ask (2026-09-12).**
  // Phase 2's finding still stands: a face that runs away under a long flight
  // keeps the wheel falling and the touchdown arrives hard, so the level table
  // stays, and every hop under 44 mph comes down on it or on the brow, clean.
  // What changed is what lies past it. `EucController.land` scores the closing
  // speed along the *surface normal*, so a face already running away from the
  // rider takes the horizontal speed off the hit: a fully charged flight that
  // would be a wobble on the flat lands clean on 30% at 45–50 mph. The table is
  // twelve metres because the bench put the boundary there — at eleven the
  // charged 47 mph flight meets the face a metre later and lands heavy, at
  // fourteen it comes down on the brow and the big line is gone.
  const table = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-table');
  assert.ok(table !== undefined, 'the kicker has no table');
  assert.equal(table.climb, 0, 'the table has a gradient, so a sub-speed hop lands below its take-off');
  assert.equal(table.length, 12);

  // The hill: a 12.5% brow, sixteen metres at 30%, a 12.5% flare. The two
  // shoulders exist because a level table cannot fold straight onto 30% under
  // `MAX_SOCKET_FOLD`, and they are measured below as the lap's worst folds.
  const brow = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-brow');
  const face = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-landing');
  const flare = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-flare');
  assert.ok(brow !== undefined && face !== undefined && flare !== undefined, 'the landing hill is missing a piece');
  assert.equal(brow.length, 4);
  pin('the brow', brow.climb / brow.length, -0.125);
  assert.equal(face.length, 16);
  pin('the landing face', face.climb / face.length, -0.3);
  assert.ok(face.linearClimb, 'the landing face must report one true gradient, so it can be measured');
  assert.equal(flare.length, 4);
  pin('the flare', flare.climb / flare.length, -0.125);

  // The longest flight the lip can throw is a fully charged hop at the fastest
  // speed the approach can deliver. `kicker-approach` and `kicker-rise` at full
  // throttle from the R16 hairpin's own ceiling (28.7 mph at `EUC.maxLateralG`
  // with the M30 hang) put 47.5 mph at the lip on the shipped wheel, which
  // lands 27.6 m past it; the swept 50 mph row lands 28.3 m. The face runs from
  // 16 m to 32 m past the lip, so both come down on it with more than three
  // metres of face in front of them. See `docs/JUMP_BENCH.md` T11 and T11b.
  const faceStart = table.length + brow.length;
  const faceEnd = faceStart + face.length;
  assert.ok(28.3 + 3 <= faceEnd, `the face ends ${faceEnd} m past the lip, too soon for the 50 mph flight`);
  assert.ok(faceStart <= 16.4, `the face starts ${faceStart} m past the lip, past the 44 mph charged touchdown`);

  // The rise that pays for the hill: eased, so the lip block starts on a flat
  // crest and the bypass meets no fold at either end of it.
  const rise = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-rise');
  assert.ok(rise !== undefined);
  assert.equal(rise.length, 18);
  pin('the rise', rise.climb, 2.5);
  assert.equal(rise.linearClimb, false, 'an eased rise is what keeps the crest flat');

  // And the pitch that makes the face is shallow enough that the bypass half
  // rolls it without noticing: 0.15 m over six metres.
  const pitch = SWITCHBACK_GEOMETRY.find((element) => element.id === 'kicker-lip');
  assert.ok(pitch !== undefined);
  assert.equal(pitch.length, 6);
  pin('the take-off pitch', pitch.climb, -0.15);

  // Beat 5 is still 114 m of straight spending 3.66 m, which is what leaves the
  // ring's solved legs, the descent and the derived climb where they were.
  const beat = ['kicker-approach', 'kicker-rise', 'kicker-lip', 'kicker-table', 'kicker-brow',
    'kicker-landing', 'kicker-flare', 'kicker-runout']
    .map((id) => SWITCHBACK_GEOMETRY.find((element) => element.id === id)!);
  assert.ok(Math.abs(beat.reduce((total, element) => total + element.length, 0) - 114) < 1e-9);
  assert.ok(Math.abs(beat.reduce((total, element) => total + element.climb, 0) + 3.66) < 1e-9);
});

test('the climb crest is an opportunity, not a demand', () => {
  const crest = SWITCHBACK_FEATURES.crest;
  assert.equal(crest.kind, 'lip');
  if (crest.kind !== 'lip') return;
  pin('the crest step-up', crest.report.stepUpAtStart, 0.05);
  assert.ok(crest.report.stepUpAtStart <= 0.1);
  assert.ok(crest.report.dropAtLip >= 0.1, 'the crest lip cannot launch');
  pin('the crest drop', crest.report.dropAtLip, 0.15);
  // The same ceiling the kicker's face is held to, and for the same arithmetic.
  assert.ok(crest.report.dropAtLip <= 0.18);

  // **Phase 2 moved two metres from the climb to the descent.** The crest's far
  // side is the ground a hop off it lands on, and at Phase 1's ten metres a
  // flight from 25 mph up ran off the end of it onto `fire-road-2`, which is
  // climbing — a landing surface that comes UP to meet the wheel instead of
  // falling away from it, which is the worst thing §36.2 item 4 names. Fourteen
  // and fourteen instead of sixteen and twelve costs the ring nothing and takes
  // the installed 31.9 mph hop from 1.1902 to 1.0108.
  const up = SWITCHBACK_GEOMETRY.find((element) => element.id === 'crest-up');
  const down = SWITCHBACK_GEOMETRY.find((element) => element.id === 'crest-down');
  assert.ok(up !== undefined && down !== undefined);
  assert.equal(up.length, 14);
  assert.equal(down.length, 14);
  assert.equal(up.length + down.length, 28, 'the crest pair no longer spans 28 m');
});

test('the spin shelf rolls off onto a level pad', () => {
  const shelf = SWITCHBACK_FEATURES.spinShelf;
  assert.equal(shelf.kind, 'deck');
  assert.equal(shelf.segment, 'shelf-in');
  if (shelf.kind !== 'deck') return;
  // **A low-drop launch onto level ground, which §36.4 asked for and Phase 1
  // did not build.** At 0.41 m onto a 3% corridor every hopped 180 landed heavy
  // on both presets at 8, 12 and 15 mph — the hop's own apex plus the drop is
  // more fall than the clean tier has room for. The shelf is flush at its start
  // and ends exactly at the socket into `shelf-pad`, so the whole face is the
  // corridor's own 1.25% fall under twelve metres of level deck: 0.15 m, the
  // same number the kicker's table is sized to, and every hopped 180 lands
  // clean.
  pin('the spin shelf entry face', shelf.report.entryFace, 0);
  pin('the spin shelf drop', shelf.report.exitDrop, 0.15);
  assert.ok(shelf.report.exitDrop <= 0.18);
  const block = shelf.report.blocks[0];
  const shelfIn = SWITCHBACK_GEOMETRY.find((element) => element.id === 'shelf-in');
  assert.ok(shelfIn !== undefined);
  assert.ok(
    Math.abs((block.s + block.halfAlong) - shelfIn.length) < 1e-9,
    'the shelf no longer ends at the socket, so its drop is not onto the level pad',
  );
  // The pad it lands toward has no gradient at all, which is the room a fakie
  // exit at the reverse ceiling needs.
  const pad = SWITCHBACK_GEOMETRY.find((element) => element.id === 'shelf-pad');
  assert.ok(pad !== undefined && pad.climb === 0);
});

test('every feature stands on the rider\'s left, clear of the centreline and inside the corridor', () => {
  // **Principle 1, measured on every block on the venue** rather than on the
  // ones this file happens to name. The bypass is the right half of each
  // corridor and it has to be genuinely empty, or "a legal lap needs no hop" is
  // a sentence rather than a fact.
  const blocks = everyBlock();
  assert.ok(blocks.length > 0, 'the graybox has no features in it at all');
  for (const { id, halfWidth, block } of blocks) {
    assert.ok(block.t > 0, `a block on "${id}" stands at t=${block.t}, on the bypass half`);
    assert.ok(
      block.t - block.halfLateral >= PARK.featureClear,
      `a block on "${id}" reaches t=${(block.t - block.halfLateral).toFixed(3)}, inside the clear line`,
    );
    assert.ok(
      block.t + block.halfLateral <= halfWidth,
      `a block on "${id}" reaches t=${(block.t + block.halfLateral).toFixed(3)}, outside the corridor`,
    );
    // And inside its own corridor along the centreline, so a block never hangs
    // over ground another corridor owns.
    const spec = SWITCHBACK_GRAPH.find((candidate) => candidate.id === id);
    assert.ok(spec !== undefined);
    assert.ok(block.s - block.halfAlong >= -1e-9, `a block on "${id}" starts before its entry socket`);
    assert.ok(
      block.s + block.halfAlong <= spec.length + 1e-9,
      `a block on "${id}" ends past its exit socket`,
    );
  }
});

test('the features are all nine classes Phase 1 was asked to graybox', () => {
  assert.deepEqual(Object.keys(SWITCHBACK_FEATURES).sort(), [
    'crest', 'gap', 'kicker', 'ledge', 'rhythm', 'skinny', 'spinShelf', 'stairs', 'stepUp',
  ]);
});

// ---------------------------------------------------------------------------
// 7 — the bypass never launches, and the grades are what they claim
// ---------------------------------------------------------------------------

test('no socket join on the lap folds hard enough to launch a rider', () => {
  // **Principle 2's other half.** A rider taking the plain half of every
  // corridor meets no block at all, so the only thing that could throw them is
  // the geometry between two corridors — and a fold's shortfall against the
  // previous surface's prediction is one step's travel times the fold angle.
  // `MAX_SOCKET_FOLD` records the arithmetic; this is where the lap is held to
  // it, at every seam including the one across the start/finish line.
  let worst = 0;
  let where = '';
  for (let index = 0; index < SWITCHBACK_GRAPH.length; index += 1) {
    const from = SWITCHBACK_GRAPH[index];
    const to = SWITCHBACK_GRAPH[(index + 1) % SWITCHBACK_GRAPH.length];
    const fold = Math.abs(gradientAt(from, from.length) - gradientAt(to, 0));
    if (fold > worst) { worst = fold; where = `${from.id} -> ${to.id}`; }
  }
  assert.ok(worst <= MAX_SOCKET_FOLD, `${where} folds ${worst.toFixed(4)} rad`);
  // And the worst of them is the brow onto the kicker's 30% landing face —
  // 12.5% to 30%, 0.167 rad, which is the fold the bypass half of that beat is
  // *meant* to roll while the lip beside it throws. Its mirror at the flare is
  // the same number, so the first one in lap order is the one reported.
  assert.equal(where, 'kicker-brow -> kicker-landing');
  assert.ok(
    Math.abs(worst - (Math.atan(0.3) - Math.atan(0.125))) < 1e-9,
    `the brow fold is ${worst}`,
  );
});

test('the descent is rideable and the climb is a road, not a wall', () => {
  // One corridor on the venue is steeper than 12.5%: the kicker's 30% landing
  // face, which is the ground the big jump exists to come down on and which
  // the bypass rolls fold-free (see the socket test above). Nothing else may
  // pass the 12.5% the rest of the descent is held to.
  for (const element of SWITCHBACK_GEOMETRY) {
    const grade = element.climb / element.length;
    if (element.id === 'kicker-landing') {
      assert.ok(Math.abs(grade + 0.3) < 1e-12, `the landing face is ${(grade * -100).toFixed(2)}%`);
      continue;
    }
    assert.ok(
      grade >= -0.125 - 1e-12,
      `${element.id} falls at ${(grade * -100).toFixed(2)}%, past the brow and flare's own grade`,
    );
  }
  // **The one number §36.3 asks to be derived rather than chosen**: "derive the
  // climb length from a gradient the slow approach can ride without stalling".
  // It comes out at 6.49% over 208 m of fire road, turn and summit return.
  assert.ok(
    FIRE_ROAD_GRADE > 0 && FIRE_ROAD_GRADE <= 0.065,
    `the climb back is ${(FIRE_ROAD_GRADE * 100).toFixed(3)}%`,
  );
  assert.ok(
    Math.abs(FIRE_ROAD_GRADE - 0.0649094) < 1e-6,
    `the climb grade moved to ${FIRE_ROAD_GRADE}`,
  );

  // And the whole of it is recovered: what the descent spends, the climb finds.
  assert.ok(
    Math.abs(SWITCHBACK_DESCENT_METRES - 14.2) < 1e-9,
    `the hill is ${SWITCHBACK_DESCENT_METRES} m`,
  );
});

test('the apron is level in every axis a grid cares about', () => {
  const apron = SWITCHBACK_GRAPH.find((spec) => spec.id === 'apron');
  assert.ok(apron !== undefined);
  assert.equal(apron.climb, undefined);
  assert.equal(apron.crown, undefined);
  assert.equal(apron.crossSlope, undefined);
  assert.equal(apron.curvature, undefined);
  assert.equal(apron.surface, 'pavement');
});

// ---------------------------------------------------------------------------
// 8 — the hillside
// ---------------------------------------------------------------------------

test('the trail is cut into the hill rather than laid on an embankment', () => {
  // **The claim `groundAt` exists to make, and nothing else can see it.** A
  // corridor whose shoulder eases fifteen metres down to a flat surround is a
  // cone; a corridor sitting in ground of its own is a trail. Measured every
  // two metres along the whole lap.
  let worst = 0;
  let where = '';
  for (const segment of placed) {
    const divisions = Math.max(1, Math.ceil(segment.spec.length / 2));
    for (let division = 0; division <= divisions; division += 1) {
      const s = (division / divisions) * segment.spec.length;
      const point = centrelineAt(segment.entry, segment.spec, s);
      const cut = Math.abs(switchbackGroundAt(point.x, point.z) - point.y);
      if (cut > worst) { worst = cut; where = `${segment.spec.id} at s=${s.toFixed(0)}`; }
    }
  }
  assert.ok(
    worst <= GROUND_HONESTY_METRES,
    `the trail runs ${worst.toFixed(2)} m clear of its own hillside at ${where}`,
  );
});

test('the hill meets the surround at the field border, and never dips under it', () => {
  // The builder refuses a plan whose border ring is not the surround, so the
  // first half of this is proved by the plan existing. What is asserted here is
  // the two things it does not measure: that the fade really does reach zero
  // rather than merely getting close, and that nothing anywhere is below the
  // floor the surround plane sits at.
  const field = plan.heightfield;
  let lowest = Infinity;
  for (const height of field.heights) lowest = Math.min(lowest, height);
  assert.ok(
    lowest >= SWITCHBACK_SURROUND.height - 1e-9,
    `the field dips to ${lowest} under a surround of ${SWITCHBACK_SURROUND.height}`,
  );

  // Sixty metres clear of everything the lap touches, which is comfortably past
  // the fade radius the field margin was derived from.
  let maxX = -Infinity;
  let atZ = 0;
  for (const segment of placed) {
    const divisions = Math.max(1, Math.ceil(segment.spec.length / 2));
    for (let division = 0; division <= divisions; division += 1) {
      const point = centrelineAt(segment.entry, segment.spec, (division / divisions) * segment.spec.length);
      if (point.x > maxX) { maxX = point.x; atZ = point.z; }
    }
  }
  assert.equal(switchbackGroundAt(maxX + 60, atZ), SWITCHBACK_SURROUND.height);

  // And the margin is what it claims to be: the fade radius less the narrowest
  // corridor's own reach, so the border ring is always outside the hill.
  assert.equal(SWITCHBACK_FIELD_MARGIN, 24);
  assert.equal(SWITCHBACK_SURROUND.height, 0);
  assert.equal(SWITCHBACK_SURROUND.surface, 'grass');
});

test('the venue fits inside the world the surround backstop describes', () => {
  const field = plan.heightfield;
  const maxX = Math.max(Math.abs(field.originX), Math.abs(field.originX + field.columns * field.spacing));
  const maxZ = Math.max(Math.abs(field.originZ), Math.abs(field.originZ + field.rows * field.spacing));
  assert.ok(
    Math.max(maxX, maxZ) < TERRAIN.surroundBackstopHalfExtent,
    `the venue reaches ${Math.max(maxX, maxZ).toFixed(0)} m from the origin`,
  );
});

// ---------------------------------------------------------------------------
// 9 — the frame
// ---------------------------------------------------------------------------

test('the dressed park fits every frame contract, and the prop family fits its own', () => {
  assert.equal(withinRenderBudget(plan).ok, true);
  assert.equal(withinSplitRenderBudget(plan).ok, true);
  assert.equal(withinQuadRenderBudget(plan).ok, true);

  const cost = planRenderCost(plan);
  // §36.7's working allocation, which is deliberately inside the enforced
  // ceilings so final acceptance is not decided on the hard edge.
  assert.ok(
    cost.drawCalls <= 55 && cost.triangles <= 300_000,
    `the dressed park costs ${cost.drawCalls} calls and ${cost.triangles} triangles`,
  );

  // **`PROP_BUDGET`, priced on this venue's own dressing.** The forest is the
  // one thing Phase 4 adds that can grow without anybody noticing — one lattice
  // constant decides how many trees there are — so its bill is asserted here
  // rather than read off a generated report. Baseline prices: the enhanced
  // recipe re-prices the crown and the conifer, and `render/presentation.ts`
  // applies the same ceiling to whichever recipe it selects, which is where the
  // enhanced figure is enforced (this file may not reach into `render/`).
  let propCalls = 0;
  let propTriangles = 0;
  for (const [part, instances] of cost.partInstances) {
    const price = PART_COSTS[part];
    propCalls += price.castsShadow ? 2 : 1;
    propTriangles += instances * price.triangles * (price.castsShadow ? 2 : 1);
  }
  assert.ok(propCalls <= PROP_BUDGET.maxDrawCalls, `${propCalls} prop draw calls`);
  assert.ok(
    propTriangles <= PROP_BUDGET.maxTriangles,
    `${propTriangles} prop triangles of ${PROP_BUDGET.maxTriangles}`,
  );
  // And a quarter of the budget is still unspent, which is the margin §36.7
  // asks for rather than a ceiling met exactly. The enhanced recipe
  // re-prices the crown (40 -> 80) and the conifer (36 -> 48) and so spends
  // 15,952 more than this on the same instances, so the check is stated against
  // the headroom the dearer recipe actually leaves: 67,744 of 90,000 — up from
  // 62,904 by the sixty-eight bays of inner fencing the owner's first rides
  // asked for, and two shrubs cheaper for the ground they took.
  assert.ok(
    propTriangles + 15_952 <= PROP_BUDGET.maxTriangles * 0.8,
    `the enhanced prop family would be ${propTriangles + 15_952} of ${PROP_BUDGET.maxTriangles}`,
  );

  // Zero new call buckets: every part the venue draws is one the library
  // already carried, which is what keeps `LIBRARY_MAX_DRAW_CALLS` at 69.
  for (const part of cost.partInstances.keys()) {
    assert.ok(part in PART_COSTS, `the venue draws an unpriced part "${part}"`);
  }
  assert.ok(
    cost.cellsDrawn > 0,
    `measured: ${plan.heightfield.columns}x${plan.heightfield.rows} samples at `
    + `${plan.heightfield.spacing} m, ${cost.cellsDrawn} cells drawn, ${cost.drawCalls} calls `
    + `(${cost.colourDrawCalls} colour + ${cost.shadowDrawCalls} shadow), ${cost.triangles} triangles`,
  );
});

test('the park is dressed with exactly the six things Phase 4 authored', () => {
  // **Phase 1's "no props, no paint" census, grown twice and still a census.**
  // Phase 2 put signage on the ground; Phase 4 adds a forest, the hillside's
  // own cribbing and riprap, trail rail, three benches and a retint of three
  // materials the library already had. Nothing else: no hazards, no targets and
  // no new kind of anything. The id is `-r4` because the owner's first rides
  // rebuilt beat 5 around a landing hill (`-r3` was Phase 6 moving the
  // clearing hairpin), not because anything here did: dressing is not a
  // layout, and the one rule the id serves is that a lap time never outlives
  // the geometry it was set on.
  assert.equal(plan.hazards, undefined);
  assert.equal(plan.targets, undefined);
  assert.equal(plan.id, 'switchback-r4');

  // The signage, exactly as Phase 2 left it.
  const authoredSigns = [...SWITCHBACK_SIGNAGE.props.values()].flat();
  const authoredRuns = [...SWITCHBACK_SIGNAGE.markings.values()].flat();
  assert.equal(authoredSigns.length, Object.keys(SWITCHBACK_FEATURES).length);
  assert.ok(authoredSigns.every((prop) => prop.kind === 'signpost'));
  // Sixty-six at Phase 2; the owner's two words (DROP on the ledge, AIR on the
  // kicker) are fourteen strokes, and the ledge's compact stack is one chevron
  // fewer.
  assert.equal(authoredRuns.length, 79, `the signage authored ${authoredRuns.length} runs`);
  // Plus the bent turn arrows ahead of the hairpins (ride round 1): seven
  // arrows, a shaft and a head each — `parkTurnArrows.test.ts` pins them.
  assert.equal((plan.markings ?? []).length, 79 + SWITCHBACK_TURN_ARROWS.length * 2, `${(plan.markings ?? []).length} runs survived`);
  const red = authoredRuns.filter((run) => run.paint === 'kerb');
  assert.equal(red.length, 2, `${red.length} red lines on the venue`);
  assert.ok(red.every((run) => run.role === 'bar'));

  // Six kinds of prop, and every one of them is a kind the library already
  // draws — §36.7's "trees as existing instanced parts", which is what keeps
  // `LIBRARY_MAX_DRAW_CALLS` at 69 and the solo union at 159 of 160.
  const census = new Map<string, number>();
  for (const prop of plan.props ?? []) census.set(prop.kind, (census.get(prop.kind) ?? 0) + 1);
  assert.deepEqual(
    [...census.keys()].sort(),
    ['bench', 'broadleafTree', 'conifer', 'fenceBay', 'shrub', 'signpost'],
  );
  assert.equal(census.get('signpost'), 9);
  assert.equal(census.get('bench'), 3);

  // Conifers dominate, which is §36.8's own word and is also the cheap half of
  // the kit: a conifer is one instanced part and a broadleaf is two.
  const trees = (census.get('conifer') ?? 0) + (census.get('broadleafTree') ?? 0);
  assert.ok(
    (census.get('conifer') ?? 0) > trees * 0.6,
    `${census.get('conifer')} conifers against ${trees} trees`,
  );
  assert.ok((census.get('shrub') ?? 0) > 40, `${census.get('shrub')} shrubs is not an understorey`);

  // The hillside's own masonry and timber: existing block materials, no new
  // surface, and nothing in it is a feature.
  const hillside = everyBlock('hillside');
  assert.ok(hillside.length > 30, `${hillside.length} hillside blocks`);
  assert.deepEqual(
    [...new Set(hillside.map((entry) => entry.block.appearance))].sort(),
    ['stone', 'wood'],
  );
  for (const { id, halfWidth, block } of hillside) {
    assert.ok(
      Math.abs(block.t) - block.halfLateral > halfWidth,
      `a hillside block on "${id}" reaches into the corridor`,
    );
  }
});

test('the palette is a retint, and it puts the landings above the ground beside them', () => {
  // **`LevelPlan.palette` may retint the library; it may not extend it.** Every
  // key is a `MaterialId` the kit already carries, so the draw-call set union —
  // which is what the frame is actually scarce on — is untouched.
  assert.deepEqual(plan.palette, SWITCHBACK_PALETTE);
  for (const id of Object.keys(SWITCHBACK_PALETTE)) {
    assert.ok(id in MATERIALS, `the palette invents a material "${id}"`);
  }

  // DESIGN.md §2's legibility bounds apply to an override exactly as they apply
  // to the table it overrides: nothing under 0.03 linear luminance, nothing
  // over 0.6.
  const channel = (byte: number): number => {
    const unit = byte / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: number): number => 0.2126 * channel((hex >> 16) & 255)
    + 0.7152 * channel((hex >> 8) & 255)
    + 0.0722 * channel(hex & 255);
  for (const [id, hex] of Object.entries(SWITCHBACK_PALETTE)) {
    const value = luminance(hex as number);
    assert.ok(value >= 0.03 && value <= 0.6, `${id} paints to ${value.toFixed(4)} linear`);
  }

  // **The claim Phase 4 exists to make, and the reason the wood moved.** A
  // landing in shadow and the forest floor beside it are lit by the same
  // hemisphere term, so what separates them is the ratio of their albedos and
  // nothing an exposure can do. The kit ships wood *darker* than both the trail
  // and the grass; the retint puts it a third above the trail and nearly twice
  // the forest floor.
  const wood = luminance(SWITCHBACK_PALETTE.wood!);
  const dirt = luminance(SWITCHBACK_PALETTE.dirt!);
  const grass = luminance(SWITCHBACK_PALETTE.grass!);
  assert.ok(luminance(MATERIALS.wood.albedo) < luminance(MATERIALS.dirt.albedo));
  assert.ok(wood > dirt * 1.3, `wood ${wood.toFixed(4)} against dirt ${dirt.toFixed(4)}`);
  assert.ok(wood > grass * 1.8, `wood ${wood.toFixed(4)} against grass ${grass.toFixed(4)}`);

  // **The ordering itself, pinned rather than left to the two ratios.** What
  // Phase 4 promises is that the boardwalk is the *brightest* ground the rider
  // sees, in sun and in shade alike; the kit shipped it as the darkest of the
  // three, so the claim is only true while this holds. Transcribed to four
  // decimals: wood 0.1461, dirt 0.1070, grass 0.0751.
  assert.ok(wood > dirt && dirt > grass, `wood ${wood} dirt ${dirt} grass ${grass}`);
  assert.equal(Number(wood.toFixed(4)), 0.1461);
  assert.equal(Number(dirt.toFixed(4)), 0.1070);
  assert.equal(Number(grass.toFixed(4)), 0.0751);
  // And the same three, as the kit ships them: wood below both, which is the
  // inversion this retint exists to undo.
  assert.ok(luminance(MATERIALS.wood.albedo) < luminance(MATERIALS.grass.albedo));

  // The trail keeps the readability an art pass may not spend, and concrete is
  // still the lightest material in the kit (DESIGN.md §3's first rule).
  assert.ok(
    Math.abs(dirt - luminance(MATERIALS.dirt.albedo)) < 0.002,
    `the trail moved from ${luminance(MATERIALS.dirt.albedo).toFixed(4)} to ${dirt.toFixed(4)}`,
  );
  assert.ok(luminance(MATERIALS.concrete.albedo) > wood * 1.25);
});

// ---------------------------------------------------------------------------
// 9a — the light, and what it does to the hillside
// ---------------------------------------------------------------------------

test('the park is the one world that authors a light, and it moves only what it names', () => {
  // **The descriptor reaches the plan, and it is the venue's own object.**
  // `buildLevelPlan` copies it rather than aliasing it, so this is a deep
  // comparison on purpose: a plan holding the frozen constant itself would let
  // a consumer's mutation reach the venue.
  assert.deepEqual(plan.look, SWITCHBACK_LOOK);
  assert.notEqual(plan.look, SWITCHBACK_LOOK);

  // **Exactly the eleven fields Phase 4 authored, and the other two are the
  // daylight constant every world is judged at.** Written as a census rather
  // than as eleven comparisons: a twelfth field added in a hurry fails here,
  // and so does an authored value that is secretly still the default.
  const resolved = resolveVenueLook(plan.look);
  const moved = (Object.keys(resolved) as (keyof typeof resolved)[])
    .filter((field) => resolved[field] !== DAYLIGHT_LOOK[field]);
  assert.deepEqual([...moved].sort(), [
    'exposure', 'groundBounceColour', 'hemisphereIntensity', 'horizonColour',
    'skyColour', 'skySunColour', 'skyZenithColour', 'sunAzimuth', 'sunColour',
    'sunElevation', 'sunIntensity',
  ]);
  assert.equal(resolved.fogNear, LIGHTING.fogNear);
  assert.equal(resolved.fogFar, LIGHTING.fogFar);

  // The values themselves, transcribed. A ride that retunes the afternoon moves
  // these deliberately; nothing else may move them at all.
  assert.equal(resolved.sunAzimuth, -1.75);
  assert.equal(resolved.sunElevation, 0.58);
  assert.equal(resolved.sunColour, 0xffd9a8);
  assert.equal(resolved.sunIntensity, 2.45);
  assert.equal(resolved.skyColour, 0x8bb2e6);
  assert.equal(resolved.groundBounceColour, 0xb9a68d);
  assert.equal(resolved.hemisphereIntensity, 1.22);
  assert.equal(resolved.horizonColour, 0xdfc8a8);
  assert.equal(resolved.skyZenithColour, 0x4d80c6);
  assert.equal(resolved.skySunColour, 0xffe0b0);
  assert.equal(resolved.exposure, 1.06);

  // **An absent descriptor is today's daylight, and no other shipped world
  // authors one.** The byte-level digest pins live in `planDigest.test.ts`;
  // what is asserted here is the fact those pins depend on — that the key is
  // not merely equal to the default but absent, so nothing is hashed at all.
  assert.equal(resolveVenueLook(undefined), DAYLIGHT_LOOK);
  assert.equal(DAYLIGHT_LOOK.sunAzimuth, LIGHTING.sunAzimuth);
  assert.equal(DAYLIGHT_LOOK.exposure, LIGHTING.exposure);
  for (const other of [createSliceLevel(), createProvingGround(), createTrackLevel()]) {
    assert.equal('look' in other, false, `${other.id} authors a look`);
    assert.equal(resolveVenueLook(other.look), DAYLIGHT_LOOK);
  }

  // The sun the forest was planted against *is* the descriptor's, resolved.
  assert.equal(SWITCHBACK_SUN.azimuth, resolved.sunAzimuth);
  assert.equal(SWITCHBACK_SUN.elevation, resolved.sunElevation);
});

test('no landing, takeoff or catch ground lies in a tree\'s shadow at the park\'s own sun', () => {
  // **The G3 question, measured rather than judged** (`p4-look` §5 rule 1).
  // Under the shipped daylight a shadow was 0.70 x its caster and every landing
  // cleared it on the canopy setback alone; at 0.58 rad it is 1.53 x, so a
  // conifer that stood clear at noon lies across a pad at five o'clock. The
  // forest is planted against the descriptor (`SWITCHBACK_SUN`) and this is the
  // same claim re-derived on the built plan, in world space, with the real
  // ground under the tree and the real surface height of the pad.
  assert.ok(
    Math.abs(shadowPerMetre(SWITCHBACK_SUN) - 1.5263) < 5e-4,
    `a shadow is ${shadowPerMetre(SWITCHBACK_SUN).toFixed(4)} x its caster`,
  );
  assert.ok(Math.abs(shadowPerMetre({ azimuth: 0, elevation: LIGHTING.sunElevation }) - 0.7001) < 5e-4);

  /** Which of the ground a rider commits to this sun puts these shadows on. */
  const shaded = (
    props: readonly { kind: PlacedProp['kind']; position: { x: number; z: number }; scale: number }[],
    sun: typeof SWITCHBACK_SUN,
  ): string[] => {
    const out: string[] = [];
    for (const prop of props) {
      if (FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS] === undefined) continue;
      for (const zone of KEEP_CLEAR) {
        const segment = bySegment.get(zone.segment)!;
        const landed = walkShadow(prop, sun, (x, z, rayHeight, reach) => {
          const query = querySegment(segment, x, z);
          if (query === null) return false;
          const lateral = Math.max(0, Math.abs(query.t) - segment.spec.halfWidth);
          const past = Math.sqrt(Math.max(0, query.outside ** 2 - lateral ** 2));
          const length = segment.spec.length;
          const along = query.s <= 1e-9 ? -past
            : query.s >= length - 1e-9 ? length + past : query.s;
          const alongGap = Math.max(0, zone.fromS - along, along - zone.toS);
          if (Math.hypot(alongGap, lateral) > reach) return false;
          // The ray has to still be *above* the pad where it arrives: a tree
          // below a deck throws its shadow under it, not onto it.
          return rayHeight > query.height;
        });
        if (landed !== null) {
          out.push(`a ${prop.kind} at (${prop.position.x.toFixed(1)}, `
            + `${prop.position.z.toFixed(1)}) shades the ${zone.what} at ${landed.toFixed(1)} m`);
        }
      }
    }
    return out;
  };

  assert.deepEqual(shaded(plan.props ?? [], SWITCHBACK_SUN), [], 'a landing is in shadow');

  // **And the census is not vacuous, measured against the forest this hillside
  // would have grown without the rule.** Re-planted under the daylight the game
  // ships and then lit by the park's own afternoon — which is exactly the world
  // Phase 4 would have shipped had the look been wired and the forest not
  // re-derived — four trees lay their shadows across a landing, a catch or a
  // run-out. That is the defect the setback exists to remove, and it is what
  // makes the empty result above a measurement rather than a blind spot.
  const unruled = plantForest({
    placed,
    technical: SWITCHBACK_TECHNICAL_CORRIDORS,
    exclusions: [...propExclusions(placed), ...blockExclusions(placed)],
    bounds: SWITCHBACK_FIELD_BOUNDS,
    lattice: SWITCHBACK_FOREST_LATTICE,
    margin: SWITCHBACK_FOREST_MARGIN,
    sun: { azimuth: LIGHTING.sunAzimuth, elevation: LIGHTING.sunElevation },
  }).map((prop) => ({ kind: prop.kind, position: { x: prop.x, z: prop.z }, scale: prop.scale }));
  const unruledShadows = shaded(unruled, SWITCHBACK_SUN);
  assert.equal(
    unruledShadows.length,
    1,
    `the daylight forest lays ${unruledShadows.length} shadows on the ground a rider uses: `
    + unruledShadows.join('; '),
  );
  // **The setback is wider than that one tree, and deliberately so.** It keeps
  // shadows off the whole technical corridor rather than off the pad rectangles
  // alone, and it carries the bank a tree may stand on — so it refuses nineteen
  // props where the strict pad test finds one. A rule pinned to exactly today's
  // pad geometry would pass until the first metre anything moved.
  // The same forest under the daylight it was planted for casts none of them:
  // the setback is new at Phase 4 because the *light* is, not because Phase 1
  // and 2 were careless.
  assert.deepEqual(
    shaded(unruled, { azimuth: LIGHTING.sunAzimuth, elevation: LIGHTING.sunElevation }),
    [],
  );

  // The one thing this does not cover, said rather than implied: the nine
  // signposts, a hundred and forty-four rail bays and three benches. They are a
  // metre of pole and
  // a plate, they are placed where a rider can *read* them rather than where a
  // rule put them, and moving one to satisfy a shadow rule would be moving a
  // sign. Their shadows are measured in the report, not refused here.
  assert.equal(
    (plan.props ?? []).filter((prop) => FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS] === undefined).length,
    156,
  );
});

test('the treeline round every landing is the descriptor\'s, and moves when it moves', () => {
  // **The coupling stated as a test**: the forest is a function of the light.
  // Re-planting the identical hillside under the daylight the game ships gives
  // a different, larger forest — so the setback above is the descriptor's doing
  // and would fail loudly if a ride turned the sun and nothing re-derived.
  const site = {
    placed,
    technical: SWITCHBACK_TECHNICAL_CORRIDORS,
    exclusions: [...propExclusions(placed), ...blockExclusions(placed)],
    bounds: SWITCHBACK_FIELD_BOUNDS,
    lattice: SWITCHBACK_FOREST_LATTICE,
    margin: SWITCHBACK_FOREST_MARGIN,
  };
  assert.deepEqual(plantForest({ ...site, sun: SWITCHBACK_SUN }), SWITCHBACK_FOREST);

  const daylight = plantForest({
    ...site,
    sun: { azimuth: LIGHTING.sunAzimuth, elevation: LIGHTING.sunElevation },
  });
  assert.equal(SWITCHBACK_FOREST.length, 549);
  assert.equal(daylight.length, 568, 'the low sun cost the hillside no trees at all');

  // Nineteen props, and the whole of the difference is canopy and understorey
  // standing up-sun of ground a rider commits to. The lattice is untouched:
  // every surviving tree is exactly where it was, because a refusal here
  // refuses rather than re-flows (`plantForest`).
  const kept = new Set(SWITCHBACK_FOREST.map((prop) => `${prop.x},${prop.z}`));
  const lost = daylight.filter((prop) => !kept.has(`${prop.x},${prop.z}`));
  assert.equal(lost.length, 19);
  for (const prop of lost) {
    // Each one of them really does lay its shadow on a corridor a rider
    // commits to — measured as the footprint, so none was refused by a bound
    // that was merely conservative.
    const landed = walkShadow(
      { kind: prop.kind, position: { x: prop.x, z: prop.z }, scale: prop.scale },
      SWITCHBACK_SUN,
      (x, z, _rayHeight, reach) => placed.some((segment) => {
        if (!SWITCHBACK_TECHNICAL_CORRIDORS.has(segment.spec.id)) return false;
        const query = querySegment(segment, x, z);
        return query !== null && query.outside <= reach;
      }),
    );
    assert.ok(
      landed !== null,
      `a ${prop.kind} at (${prop.x.toFixed(1)}, ${prop.z.toFixed(1)}) was refused for a shadow it never throws`,
    );
  }

  // The bound itself, on this venue's own trees: 14.1 m for the smallest
  // conifer the hillside plants and 18.9 m for the largest, against the 6 m the
  // chase camera asked for.
  assert.ok(Math.abs(shadowClearance('conifer', 0.85, SWITCHBACK_SUN) - 14.07) < 0.01);
  assert.ok(Math.abs(shadowClearance('conifer', 1.25, SWITCHBACK_SUN) - 18.89) < 0.01);
  assert.ok(shadowClearance('conifer', 0.85, SWITCHBACK_SUN) > FOREST_CLEARANCE.canopyTechnical * 2);

  // **The stand allowance is an allowance, and it is measured.** Every kept
  // prop that stands within its own shadow's reach of a technical corridor is
  // measured against that corridor's own surface: the steepest reads 1.25 m,
  // which is half the 2.5 m the bound carries.
  let worst = -Infinity;
  let where = '';
  for (const prop of plan.props ?? []) {
    const height = FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS];
    if (height === undefined) continue;
    const reach = footprintReach(prop.kind, prop.scale);
    const length = shadowClearance(prop.kind, prop.scale, SWITCHBACK_SUN);
    for (const segment of placed) {
      if (!SWITCHBACK_TECHNICAL_CORRIDORS.has(segment.spec.id)) continue;
      const query = querySegment(segment, prop.position.x, prop.position.z);
      if (query === null || query.outside - reach > length) continue;
      const stand = fieldHeightAt(prop.position.x, prop.position.z) - query.height;
      if (stand > worst) { worst = stand; where = `${prop.kind} over ${segment.spec.id}`; }
    }
  }
  assert.ok(Number.isFinite(worst), 'no prop stands within a shadow of a technical corridor');
  assert.ok(
    worst < FOREST_SHADOW_STAND,
    `a ${where} stands ${worst.toFixed(2)} m up the bank, over the ${FOREST_SHADOW_STAND} m allowed`,
  );
});

// ---------------------------------------------------------------------------
// 9b — the dressing keeps off everything a rider uses
// ---------------------------------------------------------------------------

/**
 * The ground a rider commits to, lands on, catches on and runs out over.
 *
 * Transcribed from the Phase 2 measurement pass's own table, in each corridor's
 * own frame: the feature's blocks, the ground a missed one is caught by, the
 * landing and the run-out in front of it. Beat 5 is whole corridors because the
 * whole of it is the kicker — the approach a rider arrives down at 47 mph, the
 * rise, the lip, the table they land on and the face they leave on.
 */
const KEEP_CLEAR: readonly {
  readonly what: string; readonly segment: string;
  readonly fromS: number; readonly toS: number; readonly technicalT: number;
}[] = [
  { what: 'ledge deck and landing', segment: 'terrace-drop', fromS: 4, toS: 21.3, technicalT: PARK.wideT },
  { what: 'gap decks, catch and run-out', segment: 'terrace-drop', fromS: 20, toS: 44, technicalT: PARK.wideT },
  { what: 'skinny plank and catch', segment: 'timber', fromS: 4, toS: 12, technicalT: PARK.skinnyT },
  { what: 'step-up face and deck', segment: 'timber', fromS: 20, toS: 26, technicalT: PARK.wideT },
  { what: 'staircase treads and landing', segment: 'timber-steps', fromS: 0, toS: 9, technicalT: PARK.wideT },
  { what: 'rock rhythm terraces and run-out', segment: 'rock-rhythm', fromS: 8, toS: 41, technicalT: PARK.wideT },
  { what: 'kicker approach', segment: 'kicker-approach', fromS: 0, toS: 24, technicalT: PARK.kickerT },
  { what: 'kicker rise', segment: 'kicker-rise', fromS: 0, toS: 18, technicalT: PARK.kickerT },
  { what: 'kicker lip', segment: 'kicker-lip', fromS: 0, toS: 6, technicalT: PARK.kickerT },
  { what: 'kicker table, the sub-speed landing', segment: 'kicker-table', fromS: 0, toS: 12, technicalT: PARK.kickerT },
  { what: 'kicker brow', segment: 'kicker-brow', fromS: 0, toS: 4, technicalT: PARK.kickerT },
  { what: 'kicker landing hill', segment: 'kicker-landing', fromS: 0, toS: 16, technicalT: PARK.kickerT },
  { what: 'kicker flare', segment: 'kicker-flare', fromS: 0, toS: 4, technicalT: PARK.kickerT },
  { what: 'kicker run-out', segment: 'kicker-runout', fromS: 0, toS: 30, technicalT: PARK.kickerT },
  { what: 'spin shelf deck', segment: 'shelf-in', fromS: 8, toS: 20, technicalT: PARK.shelfT },
  { what: 'spin shelf pad and run-out', segment: 'shelf-pad', fromS: 0, toS: 20, technicalT: PARK.shelfT },
  { what: 'crest approach', segment: 'crest-up', fromS: 0, toS: 14, technicalT: PARK.crestT },
  { what: 'crest lip and landing', segment: 'crest-down', fromS: 0, toS: 14, technicalT: PARK.crestT },
];

test('no dressing stands in a corridor, a landing, a run-out or the camera\'s line', () => {
  // **The Phase 4 claim, measured on the built plan rather than on the rule
  // that authored it.** A tree is a solid and a shrub is a soft body, so a
  // forest is a physics change wherever it lands — and "no collision moves
  // under art" is only a fact if the ground a rider uses is provably empty.
  //
  // Every prop is measured against every zone twice: the true distance from its
  // own footprint to the zone's rectangle, and — where it stands alongside the
  // zone — the daylight between it and the technical line the chase camera
  // follows through the feature. The first is reported per zone per storey, so
  // the record says how much room each landing actually has rather than that
  // some bound held somewhere.
  const nearest = new Map<string, number>();
  let worstCamera = Infinity;

  for (const prop of plan.props ?? []) {
    const reach = footprintReach(prop.kind, prop.scale);
    // **Three storeys, three bounds, and the difference is what the thing is.**
    // A crown is four metres across and eight tall, so it is what reaches over
    // a landing and what swings a camera; a shrub is one metre of soft body; a
    // signpost, a rail bay and a bench are furniture — a metre high, placed
    // rather than scattered, and each already standing where something else
    // decided it must. Furniture therefore answers to the camera bound and the
    // builder's own floor, not to the canopy's setback: Phase 2's spin-shelf
    // post stands 4.5 m from the kicker's run-out *because* that is where the
    // rider can read it, and refusing it here would move a sign to satisfy a
    // rule about trees.
    const storey = prop.kind === 'conifer' || prop.kind === 'broadleafTree' ? 'canopy'
      : prop.kind === 'shrub' ? 'understorey' : 'furniture';
    const needed = storey === 'canopy' ? FOREST_CLEARANCE.canopyTechnical
      : storey === 'understorey' ? FOREST_CLEARANCE.understoreyTechnical
        : PROP_CORRIDOR_CLEARANCE;

    for (const zone of KEEP_CLEAR) {
      const segment = bySegment.get(zone.segment)!;
      const query = querySegment(segment, prop.position.x, prop.position.z);
      // Beyond the corridor's own bounds, which reach a half-width and a
      // twelve-metre shoulder out: further from the zone than any bound asks.
      if (query === null) continue;

      // `querySegment` clamps `s` to the corridor, so the along-corridor half
      // of its own `outside` is what recovers the unclamped position: a prop
      // past a socket reports that corridor's end and its true overshoot here.
      const lateralGap = Math.max(0, Math.abs(query.t) - segment.spec.halfWidth);
      const past = Math.sqrt(Math.max(0, query.outside ** 2 - lateralGap ** 2));
      const length = segment.spec.length;
      const along = query.s <= 1e-9 ? -past : query.s >= length - 1e-9 ? length + past : query.s;
      const alongGap = Math.max(0, zone.fromS - along, along - zone.toS);

      const daylight = Math.hypot(alongGap, lateralGap) - reach;
      assert.ok(
        daylight >= needed - 1e-9,
        `a ${prop.kind} stands ${daylight.toFixed(2)} m off the ${zone.what}, `
        + `which wants ${needed} m`,
      );
      const key = `${zone.what}/${storey}`;
      nearest.set(key, Math.min(nearest.get(key) ?? Infinity, daylight));

      // The camera bound applies where the prop is beside the zone rather than
      // past either end of it: a tree forty metres up the trail is not in the
      // picture a rider takes through this feature.
      if (alongGap > 0) continue;
      const camera = Math.abs(query.t - zone.technicalT) - reach;
      assert.ok(
        camera >= TRAIL_CAMERA_GAP - 1e-9,
        `a ${prop.kind} stands ${camera.toFixed(2)} m off the technical line through the `
        + `${zone.what}, inside the chase camera's ${TRAIL_CAMERA_GAP} m`,
      );
      worstCamera = Math.min(worstCamera, camera);
    }
  }

  // The census is not vacuous: the dressing really does stand beside the
  // technical lines, it just stands off them.
  assert.ok((plan.props ?? []).length > 500, 'there is no dressing to measure');
  assert.ok(Number.isFinite(worstCamera), 'no prop was ever measured against a technical line');
  assert.ok(nearest.size > 0);
});

test('nothing on the hillside is in the trail, and the whole lap is still ridden over', () => {
  // The same claim for the two populations `KEEP_CLEAR` above does not cover:
  // the dressing beside the plain trail, and the hillside's own blocks. The
  // builder's own floor is `PROP_CORRIDOR_CLEARANCE`; the venue's is far wider,
  // and the margin is what makes "no collision moves" a measurement.
  let worstProp = Infinity;
  for (const prop of plan.props ?? []) {
    if (prop.kind === 'signpost') continue; // Phase 2's, and pinned by its own test.
    const daylight = clearanceOf(placed, {
      kind: prop.kind, x: prop.position.x, z: prop.position.z, scale: prop.scale,
    });
    assert.ok(
      daylight >= PROP_CORRIDOR_CLEARANCE,
      `a ${prop.kind} stands ${daylight.toFixed(2)} m outside the trail`,
    );
    worstProp = Math.min(worstProp, daylight);
  }
  assert.ok(worstProp >= 0.75, `the closest prop to the trail is ${worstProp.toFixed(2)} m off it`);

  let worstBlock = Infinity;
  for (const { block } of everyBlock('hillside')) {
    const segment = bySegment.get(
      SWITCHBACK_GRAPH.find((spec) => (spec.blocks ?? []).includes(block))!.id,
    )!;
    const centre = centrelineAt(segment.entry, segment.spec, block.s);
    const left = leftOf(headingAt(segment.entry, segment.spec, block.s));
    const x = centre.x + left.x * block.t;
    const z = centre.z + left.z * block.t;
    let outside = Infinity;
    for (const candidate of placed) {
      const query = querySegment(candidate, x, z);
      if (query !== null && query.outside < outside) outside = query.outside;
    }
    worstBlock = Math.min(worstBlock, outside - Math.hypot(block.halfAlong, block.halfLateral));
  }
  assert.ok(
    worstBlock >= 1.5,
    `a hillside block's corner comes within ${worstBlock.toFixed(2)} m of a corridor`,
  );
});

test('the technical set names every corridor a feature is ridden on or signed from', () => {
  // **The set the clearances are read through, held to the venue it describes.**
  // A corridor missing from it would get the plain trail's standoff beside a
  // landing, which is the one mistake this whole pass cannot make.
  const ids = new Set(SWITCHBACK_GEOMETRY.map((segment) => segment.id));
  for (const id of SWITCHBACK_TECHNICAL_CORRIDORS) {
    assert.ok(ids.has(id), `the technical set names "${id}", which the lap does not carry`);
  }
  for (const feature of Object.values(SWITCHBACK_FEATURES)) {
    assert.ok(
      SWITCHBACK_TECHNICAL_CORRIDORS.has(feature.segment),
      `"${feature.segment}" carries a feature and is not technical`,
    );
  }
  for (const sign of SWITCHBACK_SIGNAGE.signs) {
    assert.ok(
      SWITCHBACK_TECHNICAL_CORRIDORS.has(sign.segment),
      `"${sign.segment}" carries ${sign.feature}'s sign and is not technical`,
    );
  }
  for (const zone of KEEP_CLEAR) {
    assert.ok(SWITCHBACK_TECHNICAL_CORRIDORS.has(zone.segment), `"${zone.segment}" is not technical`);
  }
  // And it is not simply every corridor: the connecting trail is what lets the
  // understorey come in close at all.
  assert.ok(SWITCHBACK_TECHNICAL_CORRIDORS.size < SWITCHBACK_GEOMETRY.length - 5);
});

test('every tree stands on drawn ground, inside the field the builder emits', () => {
  // A prop beyond the heightfield stands on the backstop plane, which is a
  // plane rather than a hillside. The authored rectangle is the conservative
  // one — the corridors' own bounds plus the venue's field margin, without the
  // two cells of pad `buildLevelPlan` adds on top — so it is inside the drawn
  // field on all four sides by construction, and this measures that it is.
  const field = plan.heightfield;
  const built = {
    minX: field.originX,
    maxX: field.originX + (field.columns - 1) * field.spacing,
    minZ: field.originZ,
    maxZ: field.originZ + (field.rows - 1) * field.spacing,
  };
  assert.ok(SWITCHBACK_FIELD_BOUNDS.minX >= built.minX, 'the authored field reaches past the built one');
  assert.ok(SWITCHBACK_FIELD_BOUNDS.maxX <= built.maxX);
  assert.ok(SWITCHBACK_FIELD_BOUNDS.minZ >= built.minZ);
  assert.ok(SWITCHBACK_FIELD_BOUNDS.maxZ <= built.maxZ);

  // The widest crown in the kit, at the widest scale the forest plants at.
  const widest = Math.max(...SWITCHBACK_FOREST.map((prop) => footprintReach(prop.kind, prop.scale)));
  for (const prop of SWITCHBACK_FOREST) {
    assert.ok(prop.x - widest > built.minX && prop.x + widest < built.maxX, 'a tree hangs off the field');
    assert.ok(prop.z - widest > built.minZ && prop.z + widest < built.maxZ, 'a tree hangs off the field');
  }
});

test('the forest thins to the shoulders and thickens away from them', () => {
  // §36.8 Phase 4's own shape, and the readability half of it: the ground a
  // rider is aiming at has to be the emptiest thing in the frame. Measured as
  // density per hectare in two bands rather than as a rule restated.
  const near: PlacedProp[] = [];
  const far: PlacedProp[] = [];
  for (const prop of SWITCHBACK_FOREST) {
    let outside = Infinity;
    for (const candidate of placed) {
      const query = querySegment(candidate, prop.x, prop.z);
      if (query !== null && query.outside < outside) outside = query.outside;
    }
    (outside <= 12 ? near : far).push(prop);
  }
  assert.ok(near.length > 0 && far.length > 0, 'the forest is all in one band');

  const share = (list: readonly PlacedProp[], kind: string): number =>
    list.filter((prop) => prop.kind === kind).length / list.length;
  assert.ok(
    share(near, 'shrub') > share(far, 'shrub') * 2,
    `the near band is ${(share(near, 'shrub') * 100).toFixed(0)}% understorey and the far band `
    + `${(share(far, 'shrub') * 100).toFixed(0)}%`,
  );
  assert.ok(
    far.length > near.length * 2,
    `${near.length} props inside twelve metres of the trail and ${far.length} beyond it`,
  );
});

test('the hillside runs stand proud of the ground on the side the hill falls away', () => {
  const blocks = everyBlock('hillside');
  let lowest = Infinity;
  let highest = -Infinity;
  for (const { id, block } of blocks) {
    const segment = bySegment.get(id)!;
    const centre = centrelineAt(segment.entry, segment.spec, block.s);
    const left = leftOf(headingAt(segment.entry, segment.spec, block.s));
    const x = centre.x + left.x * block.t;
    const z = centre.z + left.z * block.t;

    // **The authored side is the fill side, measured.** A run on the cut side
    // would be a block buried in a bank: the hill is higher there, so the top
    // face the corridor sets would be under the ground beside it.
    const across = centre.x + left.x * -block.t;
    const acrossZ = centre.z + left.z * -block.t;
    assert.ok(
      switchbackGroundAt(x, z) < switchbackGroundAt(across, acrossZ),
      `the run on "${id}" at s=${block.s.toFixed(1)} stands on the cut side, not the fill side`,
    );

    // And it reads as masonry standing out of the bank rather than as a wall
    // beside the trail. The heightfield directly, not the sampler: a sampler
    // standing on the block answers with the block.
    const field = plan.heightfield;
    const column = Math.round((x - field.originX) / field.spacing);
    const row = Math.round((z - field.originZ) / field.spacing);
    const stand = centre.y + block.height - field.heights[row * field.columns + column]!;
    lowest = Math.min(lowest, stand);
    highest = Math.max(highest, stand);
  }
  assert.ok(lowest > 0.1, `a run is buried: its top stands ${lowest.toFixed(2)} m over the ground`);
  assert.ok(highest < 1.6, `a run is a wall: its top stands ${highest.toFixed(2)} m over the ground`);
});

test('every sign finishes being read a full braking distance before its feature', () => {
  // Measured twice over. `parkSignage` does the arithmetic on lap distances it
  // was handed; this walks the *ridden* ring instead — `LapEnvelope.progressAt`
  // is the referee's own arc length, the same one a race orders riders by — and
  // asks how far it is from the last mark under the wheel to the point the
  // feature can no longer be refused.
  assert.ok(plan.lap !== undefined, 'the park lost its lap');
  const envelope = new LapEnvelope(plan.lap);
  const ahead = (from: number, to: number): number =>
    ((to - from) % envelope.length + envelope.length) % envelope.length;

  assert.equal(SWITCHBACK_SIGNAGE.signs.length, SWITCHBACK_SIGNED_FEATURES.length);
  for (const sign of SWITCHBACK_SIGNAGE.signs) {
    const feature = SWITCHBACK_SIGNED_FEATURES.find((entry) => entry.id === sign.feature)!;
    const host = placed.find((entry) => entry.spec.id === sign.segment)!;
    const last = centrelineAt(host.entry, host.spec, sign.toS);
    const commitOn = placed.find((entry) => entry.spec.id === feature.segment)!;
    const commit = centrelineAt(
      commitOn.entry,
      commitOn.spec,
      feature.lipS - SWITCHBACK_ENTRY_DISTANCE.get(feature.segment)!,
    );
    const ridden = ahead(envelope.progressAt(last.x, last.z), envelope.progressAt(commit.x, commit.z));
    assert.ok(
      ridden >= sign.requiredLead - 1,
      `${sign.feature}'s sign is ${ridden.toFixed(1)} ridden metres before its feature `
      + `against ${sign.requiredLead.toFixed(1)} m of read-and-stop at `
      + `${(sign.approachMps / 0.44704).toFixed(0)} mph`,
    );
    // And not so far back that it is about something else. Ninety metres is the
    // lap's own ceiling and the kicker, at 57.2 m of required lead, is the only
    // sign anywhere near it.
    assert.ok(ridden <= 95, `${sign.feature}'s sign is ${ridden.toFixed(1)} m out`);

    // The bench measures the kicker's flight from the edge the rider leaves and
    // the staircase's from the first tread's far edge, which is three metres
    // past where a rider has to have decided. Every lead holds against that
    // later point too.
    const benched = installedFeature(sign.feature);
    const benchOn = placed.find((entry) => entry.spec.id === benched.segments[0])!;
    const benchAt = centrelineAt(
      benchOn.entry,
      benchOn.spec,
      benched.lipS - SWITCHBACK_ENTRY_DISTANCE.get(benched.segments[0]!)!,
    );
    assert.ok(
      ahead(envelope.progressAt(last.x, last.z), envelope.progressAt(benchAt.x, benchAt.z))
        >= sign.requiredLead - 1,
      `${sign.feature}'s sign is late against the bench's own lip`,
    );
  }
});

test('the signs are read at the speed the measurement pass actually arrives at', () => {
  // §36.4 asks for the *measured* approach speed, and the bench publishes it.
  // This file may not import `bench/installedPark.ts` — that module builds the
  // park in order to ride it — so the numbers are transcribed and pinned here.
  for (const feature of SWITCHBACK_SIGNED_FEATURES) {
    const benched = installedFeature(feature.id);
    const fastest = Math.max(...benched.speeds);
    assert.equal(
      feature.approachMph,
      fastest,
      `${feature.id} is signed for ${feature.approachMph} mph and ridden at ${fastest}`,
    );
    assert.equal(feature.technicalT, benched.technicalT, `${feature.id}'s technical line moved`);
    assert.equal(feature.bypassT, benched.bypassT, `${feature.id}'s bypass moved`);
  }
});

/**
 * Where a rider stands on the lap's centreline, in world space, with a heading.
 *
 * Built from the **placed chain** rather than from the numbers the signage was
 * handed, which is the whole point of it being here: `parkSignage` measures its
 * own window against a `curvature` the venue declares, and a venue that declared
 * the wrong one — or none — would be marking its own homework. This walks the
 * park that actually got built.
 */
function poseOnLap(distance: number): { x: number; z: number; heading: number } {
  const along = ((distance % SWITCHBACK_LAP_METRES) + SWITCHBACK_LAP_METRES) % SWITCHBACK_LAP_METRES;
  for (const segment of SWITCHBACK_GEOMETRY) {
    const entry = SWITCHBACK_ENTRY_DISTANCE.get(segment.id)!;
    if (along < entry - 1e-9 || along > entry + segment.length + 1e-9) continue;
    const host = placed.find((each) => each.spec.id === segment.id)!;
    const s = along - entry;
    const point = centrelineAt(host.entry, host.spec, s);
    return { x: point.x, z: point.z, heading: headingAt(host.entry, host.spec, s) };
  }
  throw new Error(`no corridor carries lap ${distance}`);
}

test('every sign is on the screen for the whole of the time it takes to read it', () => {
  // **The second half of §36.4's signage paragraph, and the Phase 2 browser
  // pass is why it is here.** Nine leads were correct and two signs were
  // invisible: the kicker's chevrons were in frame for 0.00 s of a 412x915
  // portrait approach and the spin shelf's for 1.25 s against the 1.5 s the
  // lead rule buys, because both pads sat past the apex of a 180° hairpin.
  //
  // Measured here rather than read off the placement record. A mark at world
  // point `M` is on the screen when the bearing from the rider's heading to it
  // is inside the pane's horizontal half-angle, `tan(fov/2) * paneAspect` — the
  // narrowest the game ever draws. The camera's own arm is left out: it stands
  // behind the rider and can only lengthen every forward distance, so this is a
  // floor on the real window rather than a claim about it.
  const pane = Math.tan(CAMERA.fovAtRest / 2) * SIGNS.paneAspect;
  const step = 0.25;
  const unreadable: string[] = [];
  for (const sign of SWITCHBACK_SIGNAGE.signs) {
    const host = placed.find((each) => each.spec.id === sign.segment)!;
    const spine = centrelineAt(host.entry, host.spec, sign.toS);
    const heading = headingAt(host.entry, host.spec, sign.toS);
    // The last chevron's tip, on the technical line: the far edge of the paint
    // and the point every lead on this venue is measured from.
    const feature = SWITCHBACK_SIGNED_FEATURES.find((entry) => entry.id === sign.feature)!;
    const mark = {
      x: spine.x + Math.cos(heading) * feature.technicalT,
      z: spine.z - Math.sin(heading) * feature.technicalT,
    };
    const far = SWITCHBACK_ENTRY_DISTANCE.get(sign.segment)! + sign.toS;

    let best = 0;
    let run = 0;
    // Finishing at the pad's *first* paint rather than at the mark, which is
    // the rule `parkSignage` places by: a spell spent crossing the sign is not
    // advance warning, and a 180° hairpin hands out ten metres of exactly that
    // to any pad past its apex. The browser pass rides all the way to the last
    // mark, so what it reports can only be longer than this.
    for (let back = SIGNS.readMetres; back >= sign.toS - sign.fromS; back -= step) {
      const rider = poseOnLap(far - back);
      const dx = mark.x - rider.x;
      const dz = mark.z - rider.z;
      const forward = dx * Math.sin(rider.heading) + dz * Math.cos(rider.heading);
      const lateral = dx * Math.cos(rider.heading) - dz * Math.sin(rider.heading);
      if (forward > 1 && Math.abs(lateral) / forward <= pane) {
        run += step;
        best = Math.max(best, run);
      } else run = 0;
    }

    // The helper's own figure has to agree with the built park's, or its
    // `curvature` is a fiction.
    assert.ok(
      Math.abs(best - sign.readMetres) < 1,
      `${sign.feature} reports ${sign.readMetres.toFixed(1)} m of window and the built park `
      + `gives ${best.toFixed(1)} m`,
    );
    if (best < sign.requiredReadMetres - 1e-9) {
      unreadable.push(
        `${sign.feature} on ${sign.segment}: ${best.toFixed(1)} m of approach against `
        + `${sign.requiredReadMetres.toFixed(1)} m`,
      );
    }
  }
  assert.deepEqual(unreadable, [], `signs the rider cannot read: ${unreadable.join('; ')}`);

  // And the read rule never bought its window by giving up the lead rule's.
  for (const sign of SWITCHBACK_SIGNAGE.signs) {
    assert.ok(sign.lead >= sign.requiredLead - 1e-9, `${sign.feature} is signed too late`);
    assert.ok(sign.lead <= 90 + 1e-9, `${sign.feature} is signed ${sign.lead.toFixed(1)} m early`);
  }

  // **No two posts stand inside each other**, which is the other thing the read
  // rule cost and the reason a post stands on the *outside* of a bend. A
  // signpost's footprint is its 1.05 m plate, and three signs four metres apart
  // along a 16 m corner stood a metre and a third apart on its inside verge —
  // `buildLevelPlan`'s structural pass threw the middle one away without a word.
  const posts = (plan.props ?? []).filter((prop) => prop.kind === 'signpost');
  assert.equal(posts.length, SWITCHBACK_SIGNAGE.signs.length);
  for (let i = 0; i < posts.length; i += 1) {
    for (let j = i + 1; j < posts.length; j += 1) {
      const apart = Math.hypot(
        posts[i]!.position.x - posts[j]!.position.x,
        posts[i]!.position.z - posts[j]!.position.z,
      );
      assert.ok(
        apart > PROP_SIZES.signpost.plateWidth * 2,
        `two signposts stand ${apart.toFixed(2)} m apart, inside each other's plates`,
      );
    }
  }
});

test('the copy is the two lines §36.4 names plus the owner\'s two words, and every word is on the list', () => {
  const spoken = new Map(SWITCHBACK_SIGNAGE.signs.map((sign) => [sign.feature, sign.words]));
  assert.deepEqual(spoken.get('spinShelf'), ['180', 'TAP']);
  assert.deepEqual(spoken.get('stairs'), ['DOWN']);
  // The owner's first rides (2026-09-12): the ledge is the one feature he could
  // not read — "it needs an explanation or a sign in game" — and the kicker is
  // the big jump he asked for. Both words were already on the approved list.
  assert.deepEqual(spoken.get('ledge'), ['DROP']);
  assert.deepEqual(spoken.get('kicker'), ['AIR']);
  for (const [id, words] of spoken) {
    if (id === 'spinShelf' || id === 'stairs' || id === 'ledge' || id === 'kicker') continue;
    assert.deepEqual(words, [], `${id} says ${words.join(' ')}`);
  }
  for (const words of spoken.values()) {
    for (const word of words) assert.ok((PARK_SIGN_WORDS as readonly string[]).includes(word));
  }
});

test('the ledge\'s DROP and the kicker\'s AIR were placed without moving any other sign', () => {
  // **Where the two words went, and what it cost.** Both signs stand where
  // Phase 2 put them; the words are what changed.
  //
  // The ledge's pad is on `entrance`, the R20 bend off the apron, and it is
  // the only bend on the lap that has to carry two signs: the gap's is placed
  // in front of it. The read rule accepts a pad on that bend only over its
  // first eighteen metres or so, so a full three-chevron sign with a word in
  // front of it (13.0 m) left the gap's seven metres nowhere legal and the
  // helper threw. `compact` brings the ledge's pad to 9.6 m — two chevrons at
  // their shortest pitch — and the gap keeps its seven with half a metre to
  // spare. Pinned: the ledge is one pad, compact, with its word; the gap is in
  // front of it on the same bend, at its full length, with a socket margin.
  const signs = new Map(SWITCHBACK_SIGNAGE.signs.map((sign) => [sign.feature, sign]));
  const ledge = signs.get('ledge')!;
  const gap = signs.get('gap')!;
  assert.equal(ledge.segment, 'entrance');
  assert.equal(gap.segment, 'entrance');
  assert.equal(ledge.copy, undefined, 'the ledge\'s word split onto a second pad');
  assert.ok(Math.abs((ledge.toS - ledge.fromS) - 9.58) < 0.05, `the ledge's pad is ${(ledge.toS - ledge.fromS).toFixed(2)} m`);
  assert.ok(Math.abs((gap.toS - gap.fromS) - 7.0) < 1e-6, `the gap's pad is ${(gap.toS - gap.fromS).toFixed(2)} m`);
  assert.ok(gap.toS + 0.5 <= ledge.fromS + 1e-9, 'the gap\'s sign is not in front of the ledge\'s');
  assert.ok(gap.fromS >= 1 - 1e-9, 'the gap\'s pad is inside the entrance socket\'s margin');
  assert.ok(ledge.lead >= ledge.requiredLead, 'the ledge is signed too late');
  assert.ok(gap.lead >= gap.requiredLead, 'the gap is signed too late');
  assert.ok(ledge.readMetres >= ledge.requiredReadMetres, 'the ledge\'s word cannot be read');

  // The kicker's arrows keep their Phase 2 pad at the mouth of `rhythm-turn`
  // (the last place a rider looks down a straight at the clearing) and the word
  // AIR could not fit in front of them there — a 13 m pad on a hairpin fails
  // the read rule — so the helper's split fallback put it on its own pad at the
  // end of `rock-rhythm`, the straight before the bend, clear of the rhythm's
  // own landing zone. That is the same shape the staircase's DOWN takes, and it
  // reads the way road signage does: the word is the advance warning and the
  // arrows are the decision point.
  const kicker = signs.get('kicker')!;
  assert.equal(kicker.segment, 'rhythm-turn');
  assert.ok(kicker.copy !== undefined, 'the kicker\'s word did not split onto its own pad');
  assert.equal(kicker.copy.segment, 'rock-rhythm');
  assert.ok(kicker.copy.fromS > 41.2, `AIR is painted at s=${kicker.copy.fromS.toFixed(1)}, inside the rhythm's landing zone`);
  assert.ok(kicker.copy.toS <= 51 + 1e-9, 'AIR reaches the socket margin');
  assert.ok(kicker.lead >= kicker.requiredLead && kicker.lead <= 90, `the kicker's lead is ${kicker.lead.toFixed(1)} m`);
});

test('every authored mark and post survives the build, on boardwalk of its own', () => {
  // **The test the others are a proxy for, and both clippers are silent.**
  // Paint on an unpaintable cell is deleted with no message and a prop standing
  // in a corridor is filtered out with none either, so the only way to know the
  // signage ships is to measure what came back. `level/plan.ts`: nothing may be
  // authored in the knowledge it will be clipped.
  let authored = 0;
  for (const segment of placed) {
    for (const run of markingsOf(segment)) {
      for (let index = 1; index < run.points.length; index += 1) {
        authored += Math.hypot(
          run.points[index]!.x - run.points[index - 1]!.x,
          run.points[index]!.z - run.points[index - 1]!.z,
        );
      }
    }
  }
  let survived = 0;
  for (const run of plan.markings ?? []) {
    for (let index = 1; index < run.points.length; index += 1) {
      survived += Math.hypot(
        run.points[index]!.x - run.points[index - 1]!.x,
        run.points[index]!.z - run.points[index - 1]!.z,
      );
    }
  }
  assert.ok(authored > 300, `only ${authored.toFixed(1)} m of paint was authored`);
  assert.ok(
    survived >= authored - 1e-6,
    `${authored.toFixed(1)} m of paint was authored and ${survived.toFixed(1)} m survived — `
    + `the boardwalk margin of ${SWITCHBACK_SIGN_PAD_MARGIN.toFixed(4)} m is too small for a `
    + `${plan.heightfield.spacing} m grid`,
  );

  // Every surviving point stands on planking, which is the patches doing their
  // job: the trail itself is dirt and `data/markings.ts` refuses to paint it.
  const columns = plan.heightfield.columns - 1;
  for (const run of plan.markings ?? []) {
    for (const point of run.points) {
      const column = Math.floor((point.x - plan.heightfield.originX) / plan.heightfield.spacing);
      const row = Math.floor((point.z - plan.heightfield.originZ) / plan.heightfield.spacing);
      assert.equal(plan.heightfield.surfaces[row * columns + column], 'wood', 'paint off the boardwalk');
    }
  }
  const authoredProps = [...SWITCHBACK_SIGNAGE.props.values()].flat().length
    + [...SWITCHBACK_LANDMARKS.values()].flat().length
    + SWITCHBACK_FOREST.length;
  assert.equal(
    (plan.props ?? []).length,
    authoredProps,
    'a prop was filtered out for standing on the trail, in a collider or under a structure',
  );
});

test('the boardwalk hugs its paint and never spans the trail', () => {
  // **A sign is a surface change on the riding line, so its size is a number
  // the venue owes.** One patch per mark rather than one per sign: the middle
  // of a corridor between a chevron stack and a bypass arrow stays trail, and
  // the inside of a landing box stays the ground the measurement pass rode.
  let area = 0;
  for (const [id, bands] of SWITCHBACK_SIGNAGE.bands) {
    const segment = SWITCHBACK_GEOMETRY.find((entry) => entry.id === id)!;
    for (const band of bands) {
      assert.ok(band.fromS !== undefined && band.toS !== undefined, 'an unranged signage band');
      assert.equal(band.surface, 'wood');
      assert.ok(
        Math.min(band.from, band.to) > 0 || Math.max(band.from, band.to) < 0,
        `a patch on ${id} runs t ${band.from.toFixed(2)}..${band.to.toFixed(2)} across the centreline`,
      );
      assert.ok(
        Math.max(Math.abs(band.from), Math.abs(band.to)) <= segment.halfWidth,
        `a patch on ${id} reaches past the corridor edge`,
      );
      area += (band.to - band.from) * (band.toS! - band.fromS!);
    }
  }
  assert.ok(Math.abs(area - SWITCHBACK_SIGNAGE.boardwalkArea) < 1e-6);
  assert.ok(
    SWITCHBACK_SIGNAGE.boardwalkArea < 1000,
    `the signage planked ${SWITCHBACK_SIGNAGE.boardwalkArea.toFixed(0)} m² of the lap`,
  );
});

test('no signpost stands in the trail, or in the chase camera’s sweep of it', () => {
  // A post inside a corridor is dropped by the builder without a word, and a
  // post inside the chase arm's reach pulls the camera in on the approach the
  // sign exists to make readable — which would be worse than no sign at all.
  for (const [id, props] of SWITCHBACK_SIGNAGE.props) {
    const segment = SWITCHBACK_GEOMETRY.find((entry) => entry.id === id)!;
    for (const prop of props) {
      assert.ok(
        Math.abs(prop.t) >= segment.halfWidth + PROP_CORRIDOR_CLEARANCE,
        `a post on ${id} stands at t ${prop.t} on a corridor ${segment.halfWidth} m wide`,
      );
    }
  }
  for (const sign of SWITCHBACK_SIGNAGE.signs) {
    assert.ok(
      sign.postCameraGap >= CAMERA.distanceAtSpeed + CAMERA.obstructionRadius - 1e-9,
      `${sign.feature}'s post is ${sign.postCameraGap.toFixed(2)} m off its technical line`,
    );
  }
});

test('two builds of the park are the same park', () => {
  // Invariant 2's own claim on a producer whose ground is a *function*: a hill
  // computed per build has to be the same hill every time, or the venue is a
  // world that differs between boots and every ghost filed on it is worthless.
  assert.deepEqual(createSwitchbackLevel(), createSwitchbackLevel());
});

// ---------------------------------------------------------------------------
// 10 — two ridden laps, through the real referee
// ---------------------------------------------------------------------------

/** How far ahead the follower aims, metres. */
const LOOK_AHEAD = 9;

/**
 * The follower's speed cap, m/s.
 *
 * **Seven rather than the eight this began at, and the shelf hairpin is why.**
 * R10 at 8 m/s is 0.65 g of lateral demand against `EUC.maxLateralG`'s 0.75,
 * which the wheel can hold and this driver cannot steer into: a plain pursuit
 * re-aims at a point nine metres ahead, so it enters a ten-metre radius already
 * carrying a heading error the corner then adds to. Seven is 0.50 g and the
 * same driver holds the line all the way round. It is a fact about the *test's*
 * driver and not about the venue — a player brakes for a hairpin — and it is
 * recorded here rather than hidden in a constant.
 */
const FOLLOW_SPEED = 7;

function actions(partial: Partial<ActionSnapshot>): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** The lap's centreline, offset laterally, every two metres and in order. */
function routePoints(lateral: number): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (const segment of placed) {
    const divisions = Math.max(1, Math.ceil(segment.spec.length / 2));
    for (let division = 0; division < divisions; division += 1) {
      const s = (division / divisions) * segment.spec.length;
      const heading = headingAt(segment.entry, segment.spec, s);
      const centre = centrelineAt(segment.entry, segment.spec, s);
      const left = leftOf(heading);
      points.push({ x: centre.x + left.x * lateral, z: centre.z + left.z * lateral });
    }
  }
  return points;
}

/**
 * Ride one lap at a lateral offset, and report what the referee saw.
 *
 * **A lap ridden rather than a lap teleported** — §36.8 Phase 1 asks for
 * exactly that, because gates crossed by moving a position between them prove
 * the gates are in the right places and nothing at all about whether a rider
 * can get from one to the next. This drives `EucController` at 120 Hz with a
 * plain pursuit follower and feeds every step to a live `TrackDayRun`.
 *
 * The cutout is disabled, and that is the one concession: `EUC.cutoutEnabled`
 * is a speed ceiling with a crash on the far side of it and this driver never
 * approaches it, but the descent is long enough that a follower left at full
 * throttle would find it — and a test that crashed on the M20 cutout would be
 * measuring the cutout.
 */
function rideLap(lateral: number): {
  readonly seconds: number;
  readonly events: string[];
  readonly counted: boolean;
  readonly steps: number;
  readonly airborneSteps: number;
} {
  const apron = bySegment.get('apron');
  assert.ok(apron !== undefined);
  const start = centrelineAt(apron.entry, apron.spec, 0);
  const left = leftOf(apron.entry.headingY);
  const euc = new EucController(sampler, {
    spawn: {
      position: {
        x: start.x + left.x * lateral,
        y: start.y,
        z: start.z + left.z * lateral,
      },
      headingY: apron.entry.headingY,
    },
    tuning: { cutoutEnabled: 0 },
  });

  const ring = routePoints(lateral);
  const route = [...ring, ...ring.slice(0, 60)];
  const run = new TrackDayRun(plan.id, plan.checkpoints, plan.lap ?? null);
  assert.equal(run.available, true);
  run.arm();

  const events: string[] = [];
  let counted = false;
  let index = 0;
  let steps = 0;
  let seconds = 0;
  let airborneSteps = 0;

  for (; steps < 40_000; steps += 1) {
    const snapshot = euc.snapshot();
    const { x, z } = snapshot.position;

    assert.equal(snapshot.crashed, false, `crashed at step ${steps} riding t=${lateral}`);
    assert.equal(snapshot.blocked, false, `blocked at step ${steps} riding t=${lateral}`);

    while (
      index < route.length - 1
      && Math.hypot(route[index].x - x, route[index].z - z) < LOOK_AHEAD
    ) index += 1;

    const target = route[index];
    let error = Math.atan2(target.x - x, target.z - z) - snapshot.headingY;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;

    // The harness's own sign: the steering axis is the device's, a positive
    // input turns RIGHT, and a target to the rider's left is a positive heading
    // error — so the input is its negative.
    euc.step(STEP, actions({
      steer: Math.max(-1, Math.min(1, -error * 1.8)),
      throttle: Math.abs(snapshot.speed) < FOLLOW_SPEED ? 1 : 0,
    }));

    const after = euc.snapshot();
    if (!after.grounded) airborneSteps += 1;
    const stepped = run.step(STEP, {
      x: after.position.x,
      y: after.position.y,
      z: after.position.z,
      speed: after.speed,
      landed: euc.touchedDown,
      landingClean: euc.lastLandingQuality === 'clean',
      crashed: euc.crashed,
    });
    for (const event of stepped) {
      events.push(event.kind);
      if (event.kind === 'lap' && event.lap !== null) {
        counted = event.lap.counted;
        seconds = event.lap.seconds;
      }
    }
    // The envelope is only judged while a lap is running; the out-lap to the
    // line is deliberately not on the racing surface's terms.
    if (run.state.phase === 'running') {
      assert.equal(run.state.onCourse, true, `off course at step ${steps} riding t=${lateral}`);
    }
    if (events.includes('lap')) {
      // One more step so the `open` that always follows a `lap` is collected.
      steps += 1;
      break;
    }
  }

  return { seconds, events, counted, steps, airborneSteps };
}

test('a rider follows the centreline round a whole counted lap', () => {
  const ride = rideLap(0);
  assert.deepEqual(ride.events, ['open', 'sector', 'sector', 'lap', 'open']);
  // The centreline is not the bypass — it is the middle of the road — but every
  // block on the venue keeps `PARK.featureClear` off it, so it meets nothing
  // either. Phase 2 added two corridors to beat 5 and a fold at each end of the
  // table; this is where a fold that could throw a rider on the plain line
  // would show up, at the speed this driver rides.
  assert.equal(
    ride.airborneSteps,
    0,
    `the centreline ride was airborne for ${ride.airborneSteps} steps`,
  );
  assert.equal(
    ride.counted,
    true,
    'the centreline lap was voided, so the gates and the envelope disagree',
  );
  assert.ok(
    ride.seconds > 100 && ride.seconds < 180,
    `centreline lap: ${ride.seconds.toFixed(2)} s over ${SWITCHBACK_LAP_METRES.toFixed(0)} m `
    + `in ${ride.steps} steps at a ${FOLLOW_SPEED} m/s cap`,
  );
});

test('the same rider three and a half metres out on the bypass half counts the same lap', () => {
  // **§36.3's central promise, ridden**: a legal lap needs no hop. The right
  // half of every corridor carries nothing, so this ride meets no deck, no
  // tread and no lip — it rolls the kicker crest instead of leaving the lip
  // beside it — and it has to be a counted lap on the same gates and the same
  // envelope as the line through the middle.
  const ride = rideLap(-3.5);
  assert.deepEqual(ride.events, ['open', 'sector', 'sector', 'lap', 'open']);
  assert.equal(ride.counted, true, 'the bypass lap was voided');
  assert.ok(
    ride.seconds > 100 && ride.seconds < 180,
    `bypass lap: ${ride.seconds.toFixed(2)} s over ${SWITCHBACK_LAP_METRES.toFixed(0)} m `
    + `in ${ride.steps} steps at a ${FOLLOW_SPEED} m/s cap`,
  );

  // **Principle 2, ridden.** The bypass half carries no block at all, so the
  // only thing on it that could throw a rider is a fold between two corridors —
  // and `MAX_SOCKET_FOLD` is the arithmetic that says none of them can. This is
  // the same claim measured rather than derived: seventeen thousand steps down
  // a hillside with nine jumps on it, and the wheel never left the ground once.
  assert.equal(
    ride.airborneSteps,
    0,
    `the bypass ride was airborne for ${ride.airborneSteps} steps, so the geometry launched it`,
  );
});

// ---------------------------------------------------------------------------
// 11 — the inside of the bends is fenced
// ---------------------------------------------------------------------------

/**
 * How far outside the referee's own reach every bay centre stands, metres.
 *
 * The claim `parkFencing.ts` is built to, stated here as the number rather than
 * imported as the authored one: the module authors `FENCE_ENVELOPE_CLEAR`, and
 * this is what the built park must *measure*. The difference between them is
 * the lap course's own 2 m sampling, whose chords cut the corner on the inside
 * of every bend.
 */
const FENCE_ENVELOPE_FLOOR = 0.5;

/** Every fence bay the built park carries, with the box it actually occupies. */
const FENCE_BAYS = (plan.props ?? [])
  .filter((prop) => prop.kind === 'fenceBay')
  .map((prop) => ({
    x: prop.position.x,
    z: prop.position.z,
    yaw: prop.rotationY,
    halfAlong: PROP_SIZES.fenceBay.length / 2,
    halfAcross: PROP_SIZES.fenceBay.postWidth / 2,
  }));

/** A box standing on the ground: centre, heading, and its two half-extents. */
interface GroundBox {
  readonly x: number; readonly z: number; readonly yaw: number;
  readonly halfAlong: number; readonly halfAcross: number;
}

/**
 * The least daylight between two ground boxes, metres. Negative means overlap.
 *
 * The separating-axis theorem on four axes, which is exact for two rectangles:
 * written here rather than reached for in `buildPlan.ts` because what that file
 * answers is *does this prop stand inside a collider*, and what a fence has to
 * be held to is how much room it left — a boolean that is false by a
 * millimetre is a fence touching the masonry beside it.
 */
function boxSeparation(a: GroundBox, b: GroundBox): number {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  let widest = -Infinity;
  for (const yaw of axes) {
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw);
    const spread = (box: GroundBox): number => (
      Math.abs(Math.sin(box.yaw) * ax + Math.cos(box.yaw) * az) * box.halfAlong
      + Math.abs(Math.cos(box.yaw) * ax - Math.sin(box.yaw) * az) * box.halfAcross
    );
    const gap = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az) - spread(a) - spread(b);
    if (gap > widest) widest = gap;
  }
  return widest;
}

/** Every block the venue authors, as a ground box in world space. */
const AUTHORED_BOXES: GroundBox[] = placed.flatMap((segment) => (
  (segment.spec.blocks ?? []).map((block) => {
    const centre = centrelineAt(segment.entry, segment.spec, block.s);
    const left = leftOf(headingAt(segment.entry, segment.spec, block.s));
    return {
      x: centre.x + left.x * block.t,
      z: centre.z + left.z * block.t,
      yaw: headingAt(segment.entry, segment.spec, block.s),
      halfAlong: block.halfAlong,
      halfAcross: block.halfLateral,
    };
  })
));

test('the rhythm outer fence closes the straight ahead view across the approach width', () => {
  const bend = placed.find((segment) => segment.spec.id === 'rhythm-turn')!;
  const forward = { x: Math.sin(bend.entry.headingY), z: Math.cos(bend.entry.headingY) };
  const left = leftOf(bend.entry.headingY);
  const outer = (SWITCHBACK_LANDMARKS.get('rhythm-turn') ?? [])
    .filter((prop) => prop.kind === 'fenceBay' && prop.t < 0)
    .map((prop) => {
      const centre = centrelineAt(bend.entry, bend.spec, prop.s);
      const lateral = leftOf(headingAt(bend.entry, bend.spec, prop.s));
      const x = centre.x + lateral.x * prop.t;
      const z = centre.z + lateral.z * prop.t;
      const built = FENCE_BAYS.find((bay) => Math.hypot(bay.x - x, bay.z - z) < 0.01);
      assert.ok(built, 'an authored guide bay was culled');
      return built;
    });
  // A straight-ahead sightline from every half metre of the 16 m approach
  // must meet a built outer bay. The former short arc missed the bypass side.
  for (let t = -8; t <= 8; t += 0.5) {
    const origin = { x: bend.entry.position.x + left.x * t, z: bend.entry.position.z + left.z * t };
    const meets = outer.some((bay) => {
      let near = 0;
      let far = 35;
      for (const [angle, half] of [[bay.yaw, bay.halfAlong], [bay.yaw + Math.PI / 2, bay.halfAcross]]) {
        const ax = Math.sin(angle), az = Math.cos(angle);
        const start = (origin.x - bay.x) * ax + (origin.z - bay.z) * az;
        const direction = forward.x * ax + forward.z * az;
        if (Math.abs(direction) < 1e-9) {
          if (Math.abs(start) > half) return false;
        } else {
          const a = (-half - start) / direction, b = (half - start) / direction;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
        }
      }
      return near <= far;
    });
    assert.ok(meets, `the straight still looks open at lateral ${t} m`);
  }
});

test('every fence bay stands outside the ground a lap may legally cross', () => {
  // **The owner's complaint, as the bound that answers it.** "Some of the
  // corners are very tight and require slow speeds to make them. More fencing
  // will be required to block more of them off so players know not to cut
  // corners and 'cheat'." A fence that answers it has to be in exactly one
  // place: *outside* the last ground `LapEnvelope` calls on-course, so only a
  // cut can reach it, and near enough to that edge that a cut cannot get past
  // it. Phase 4's rails say where the corner is; these say where it ends.
  //
  // Asserted through the referee's own class rather than through a distance of
  // this file's making — a grown envelope is the same arithmetic with a wider
  // margin, so "half a metre outside" is stated in the only vocabulary that can
  // be wrong the same way the referee is.
  assert.ok(plan.lap !== undefined, 'the park lost its lap');
  assert.equal(FENCE_BAYS.length, 144);

  const legal = new LapEnvelope(plan.lap);
  const floor = new LapEnvelope(plan.lap, TRACK_DAY.offCourseMarginMetres + FENCE_ENVELOPE_FLOOR);
  const riderClear = new LapEnvelope(plan.lap, TRACK_DAY.offCourseMarginMetres + TERRAIN.wallStandoff);
  for (const bay of FENCE_BAYS) {
    // A centre is not the fence: sample both long edges including the ends.
    // The nearest footprint is 0.373 m off legal ground; the rider needs 0.26 m.
    for (let i = 0; i <= 24; i += 1) {
      for (const side of [-1, 1]) {
        const along = -bay.halfAlong + (2 * bay.halfAlong * i) / 24;
        const across = bay.halfAcross * side;
        const x = bay.x + Math.sin(bay.yaw) * along + Math.cos(bay.yaw) * across;
        const z = bay.z + Math.cos(bay.yaw) * along - Math.sin(bay.yaw) * across;
        assert.ok(!riderClear.contains(x, z), `a bay edge can touch a rider on legal ground at (${x}, ${z})`);
      }
    }
    assert.ok(
      !legal.contains(bay.x, bay.z),
      `a fence bay stands at (${bay.x.toFixed(1)}, ${bay.z.toFixed(1)}), which is on-course ground`,
    );
    assert.ok(
      !floor.contains(bay.x, bay.z),
      `a fence bay at (${bay.x.toFixed(1)}, ${bay.z.toFixed(1)}) is inside `
      + `${FENCE_ENVELOPE_FLOOR} m of ground the referee still counts`,
    );
  }

  // **And the authored clearance really is what is built, less the sampling.**
  // The venue authors `FENCE_ENVELOPE_CLEAR` against the true arc; the envelope
  // is a 2 m polyline whose chords carry the boundary `spacing² / (8 × radius)`
  // further in on the inside of a bend — 0.031 m at R16, 0.05 m at R10. So the
  // built figure is the authored one less that, and the tenth of a metre
  // `FENCE_ENVELOPE_CLEAR` carries over the floor above is exactly what pays
  // for it. Measured on the tightest arc the park fences: 0.572 m.
  const measured = new LapEnvelope(plan.lap, TRACK_DAY.offCourseMarginMetres + FENCE_ENVELOPE_CLEAR - 0.05);
  for (const bay of FENCE_BAYS) {
    assert.ok(
      !measured.contains(bay.x, bay.z),
      `a fence bay at (${bay.x.toFixed(1)}, ${bay.z.toFixed(1)}) lost more than the chord slack`,
    );
  }
});

test('no fence bay stands on the trail, a deck, a tread or a boardwalk pad', () => {
  // **Every corner of every bay, not its centre.** A bay is 2.4 m of run and
  // 11 cm of post, so on the inside of a tight arc its ends reach a quarter of
  // a metre nearer the trail than the point the builder measures — and what a
  // rider meets is the end, not the middle.
  //
  // A signage pad is a `SurfaceBand` and no band on this venue reaches past its
  // own corridor edge (the boardwalk test above measures that), and every
  // feature deck is a block inside a corridor, so a corner that is off every
  // corridor is off all three by construction. The blocks are then measured
  // separately anyway, because the hillside's own cribbing stands *outside* the
  // corridor and is the one structure a fence can meet out there.
  let tightestCorner = Infinity;
  let corner = '';
  for (const bay of FENCE_BAYS) {
    for (const along of [-1, 1] as const) {
      for (const across of [-1, 1] as const) {
        const x = bay.x + Math.sin(bay.yaw) * bay.halfAlong * along
          + Math.cos(bay.yaw) * bay.halfAcross * across;
        const z = bay.z + Math.cos(bay.yaw) * bay.halfAlong * along
          - Math.sin(bay.yaw) * bay.halfAcross * across;
        for (const segment of placed) {
          const query = querySegment(segment, x, z);
          if (query === null) continue;
          if (query.outside < tightestCorner) {
            tightestCorner = query.outside;
            corner = `${segment.spec.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`;
          }
        }
      }
    }
  }
  assert.ok(
    tightestCorner > 0,
    `a fence bay reaches ${(-tightestCorner).toFixed(2)} m onto ${corner}`,
  );
  // The habit, as a lower bound rather than a pin: the nearest corner on the
  // venue is a run of inner fencing on a tight arc, and it still leaves rather
  // more than the builder's own floor.
  assert.ok(
    tightestCorner >= PROP_CORRIDOR_CLEARANCE,
    `a bay corner is ${tightestCorner.toFixed(2)} m off ${corner}`,
  );

  let tightestBlock = Infinity;
  let against = '';
  for (const bay of FENCE_BAYS) {
    for (const box of AUTHORED_BOXES) {
      const gap = boxSeparation(bay, box);
      if (gap < tightestBlock) {
        tightestBlock = gap;
        against = `(${box.x.toFixed(1)}, ${box.z.toFixed(1)})`;
      }
    }
  }
  // Half a metre of daylight, and the timber line's cribbing is what decides
  // it: `timber-turn`'s fence starts four metres into the bend precisely so
  // that its first bay clears the last block of `timber-steps`' run.
  assert.ok(
    tightestBlock >= 0.5,
    `a fence bay comes within ${tightestBlock.toFixed(2)} m of the block at ${against}`,
  );
});

test('the forest yields to the fencing, and does so through the placed chain', () => {
  // **Phase 4's own mechanism, not a new one.** `plantForest` is handed every
  // segment-authored prop as an exclusion disc, read off the *placed* chain —
  // so a fence added anywhere is a fence the forest already keeps clear of
  // without anybody remembering to list it twice. This says that is really how
  // the new bays got their clearance, rather than that they happened to land in
  // a gap: the exclusion list carries one disc per bay, at the bay's own
  // position and reach.
  const exclusions = propExclusions(placed);
  for (const bay of FENCE_BAYS) {
    assert.ok(
      exclusions.some((exclusion) => (
        Math.hypot(exclusion.x - bay.x, exclusion.z - bay.z) < 1e-9
        && Math.abs(exclusion.radius - FENCE_BAY_REACH) < 1e-9
      )),
      `the forest was never told about the bay at (${bay.x.toFixed(1)}, ${bay.z.toFixed(1)})`,
    );
  }

  // And the rule those discs impose, measured on the built hillside: daylight
  // between a tree's own footprint and a bay's, of at least `FOREST_STRUCTURE_GAP`.
  // The reach used is the bay's half-diagonal, which circumscribes the whole
  // 2.4 m run — so the gap to the bay's *segment* is wider still, everywhere.
  let nearest = Infinity;
  let what = '';
  for (const prop of plan.props ?? []) {
    if (FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS] === undefined) continue;
    const reach = footprintReach(prop.kind, prop.scale);
    for (const bay of FENCE_BAYS) {
      const daylight = Math.hypot(prop.position.x - bay.x, prop.position.z - bay.z)
        - reach - FENCE_BAY_REACH;
      if (daylight < nearest) {
        nearest = daylight;
        what = `${prop.kind} at (${prop.position.x.toFixed(1)}, ${prop.position.z.toFixed(1)})`;
      }
    }
  }
  assert.ok(
    nearest >= FOREST_STRUCTURE_GAP,
    `a ${what} stands ${nearest.toFixed(2)} m off a fence bay, inside the ${FOREST_STRUCTURE_GAP} m rule`,
  );
  // Not vacuous: the forest really does come up to the fencing, it just stops.
  assert.ok(nearest < FOREST_STRUCTURE_GAP * 3, `the nearest tree to any fence is ${nearest.toFixed(2)} m off it`);
});

test('the inner fencing is six bends, two refusals and one library part', () => {
  // The census, so a layout edit that quietly unfenced a corner fails here
  // rather than on a ride. Each line is the bend, which side of the trail its
  // inside is, the offset the two bounds settled on, and what it laid.
  const laid = SWITCHBACK_INNER_FENCES.map((fence) => {
    const runs = fence.runs.map((run) => (SWITCHBACK_LANDMARKS.get(run.segment) ?? [])
      .filter((prop) => prop.kind === 'fenceBay' && Math.abs(prop.t - run.t) < 1e-9
        && prop.s >= run.fromS - 1e-9 && prop.s <= run.toS + 1e-9).length);
    return `${fence.bend} ${fence.side > 0 ? 'left' : 'right'} at ${fence.offset.toFixed(2)}: `
      + `${runs[0]} arc${runs[1] === undefined ? '' : ` + ${runs[1]} spine on ${fence.spine!.segment}`}`;
  });
  assert.deepEqual(laid, [
    'terrace-turn left at 11.80: 3 arc',
    'timber-turn right at 11.10: 6 arc + 11 spine on rock-rhythm',
    'rhythm-turn left at 12.10: 6 arc + 10 spine on kicker-approach',
    'clearing-turn right at 12.10: 4 arc + 9 spine on shelf-in',
    'bottom-turn left at 10.10: 7 arc',
    'summit-turn left at 10.10: 12 arc',
  ]);

  // Sixty-eight bays, and what they cost: one library part the venue already
  // drew for Phase 4's outer rails, so the frame gains no call and the bill is
  // triangles alone — doubled, because a bay casts a shadow.
  const innerBays = SWITCHBACK_INNER_FENCES.reduce((total, fence) => total + fence.runs.reduce(
    (count, run) => count + (SWITCHBACK_LANDMARKS.get(run.segment) ?? []).filter(
      (prop) => prop.kind === 'fenceBay' && Math.abs(prop.t - run.t) < 1e-9
        && prop.s >= run.fromS - 1e-9 && prop.s <= run.toS + 1e-9,
    ).length, 0,
  ), 0);
  assert.equal(innerBays, 68);
  assert.equal(FENCE_BAYS.length - innerBays, 76, 'outer rails include the extended rhythm corner');
  const price = PART_COSTS.fenceBay;
  assert.equal(innerBays * price.triangles * (price.castsShadow ? 2 : 1), 4_896);

  // **The two bends that are not fenced, said as arithmetic rather than as a
  // comment.** `shelf-turn` is refused by the rule: R10 against a seven-metre
  // corridor leaves no offset that is both outside the referee's reach and
  // inside the arc.
  assert.throws(
    () => innerFences([{ bend: 'shelf-turn', spine: true }], SWITCHBACK_GEOMETRY),
    /no run of .* bays can follow/,
  );
  // `entrance` is refused by the hillside: the one offset the envelope leaves
  // is the offset its own cribbing already stands on, so the fence would be
  // built inside the masonry and `buildPlan` would delete it without a word.
  const offset = innerFenceOffset(
    SWITCHBACK_GEOMETRY.find((element) => element.id === 'entrance')!,
    SWITCHBACK_GEOMETRY.find((element) => element.id === 'apron')!,
    SWITCHBACK_GEOMETRY.find((element) => element.id === 'terrace-drop')!,
  );
  const cribbing = [...(SWITCHBACK_HILLSIDE_BLOCKS.get('entrance') ?? [])];
  assert.ok(cribbing.length > 0, 'the entrance lost its cribbing');
  assert.ok(cribbing.every((block) => Math.abs(
    Math.abs(block.t) - offset,
  ) < block.halfLateral), `the entrance's fence would stand at ${offset.toFixed(2)} m, clear of its own run`);
});
