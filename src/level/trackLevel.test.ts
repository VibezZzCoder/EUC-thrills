/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MARKINGS, PAINTABLE_SURFACES } from '../data/markings.ts';
import { MATERIALS, SURFACES } from '../data/surfaces.ts';
import { CHALLENGE, EUC, PHYSICS, RIDER_BLOCKOUT, TERRAIN, WHEEL } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { ChallengeRun } from '../simulation/challenge.ts';
import { EucController } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { buildLevelPlan } from './buildPlan.ts';
import type { BoxCollider, LevelPlan } from './plan.ts';
import {
  centrelineAt,
  collidersOf,
  headingAt,
  leftOf,
  placeGraph,
  querySegment,
  type PlacedSegment,
  type SegmentMarking,
} from './segments.ts';
import { PROP_SIZES } from '../data/props.ts';
import {
  BARRIER_GATES,
  GRAVEL_RUNOFF,
  PADDOCK,
  TRACK,
  TRACK_LAP_SEGMENT_IDS,
  TRACK_SITE,
  TRACK_SITE_PROPS,
  barrierGateForSide,
  barrierLine,
  TRACK_CHECKPOINTS,
  TRACK_ENTRY_DISTANCE,
  TRACK_GEOMETRY,
  TRACK_GRAPH,
  TRACK_LAP_METRES,
  TRACK_LOOP,
  TRACK_PROGRAM,
  TRACK_SPAWN,
  createTrackLevel,
  solveLoop,
  type LoopElement,
} from './trackLevel.ts';

/**
 * BelVar Circuit, checked headlessly — M23 Phase B0.
 *
 * Three kinds of claim live here, and they are different kinds.
 *
 * **The ring closes.** A circuit is the one thing in this project whose
 * geometry has to *meet itself*, and a lap that misses its own start line by
 * half a metre is a step in the road nobody authored. It is asserted rather
 * than eyeballed because the error is invisible on screen until a rider hits
 * it at 45 mph.
 *
 * **The layout is the §23.7 program.** Corner radii are the whole design here
 * — they are what decides the speed at every point of the lap — so the program
 * is stated as data (`TRACK_PROGRAM`) and held to numbers derived from the
 * ride's own tuning rather than from what looked right.
 *
 * **The barriers are honest.** This is the M17 lesson applied before the
 * defect rather than after it: a cast sweeps along its own direction and
 * proves nothing perpendicular to it, so a fixture that rides *at* a wall
 * passes on a build that clips through it while riding *alongside* one. The
 * last section here rides the length of every barrier line on the circuit,
 * pressed against it, and that is 36 runs rather than one.
 */

const STEP = 1 / 120;

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

const plan: LevelPlan = createTrackLevel();
const sample = createGroundSample();

/** The finished ground under a world point. */
function groundAt(sampler: PlanTerrainSampler, x: number, z: number): typeof sample {
  sampler.sampleGround(x, z, sample);
  return sample;
}
const placed: PlacedSegment[] = placeGraph({ main: TRACK_GRAPH }, TRACK_SPAWN);
const bySegment = new Map(placed.map((segment) => [segment.spec.id, segment]));
/** The whole venue, paddock included. `placed` stays the lap on purpose. */
const placedSite: PlacedSegment[] = placeGraph(TRACK_SITE, TRACK_SPAWN);

/**
 * The barrier panels alone.
 *
 * From Phase B1 the venue's colliders are not all barrier: the start gantry's
 * two legs are blocks too, and a test that walked every collider would hold a
 * gantry leg to a barrier's rules.
 */
function barrierColliders() {
  return plan.segments
    .flatMap((segment) => segment.colliders)
    .filter((collider) => Math.abs(collider.halfExtents.y * 2 - TRACK.barrierHeight) < 0.5);
}

/** The drag-only top speed the whole ride is a share of, m/s. */
const TOP_SPEED = Math.sqrt((Math.sin(EUC.maxLeanPitch) * EUC.leanToAccel) / EUC.dragCoefficient);

/** Fastest a clean line can hold an arc of this radius on asphalt, m/s. */
function cornerSpeed(radius: number): number {
  return Math.sqrt(EUC.maxLateralG * SURFACES.pavement.grip * PHYSICS.gravity * radius);
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

test('the lap closes on itself in position and in heading', () => {
  // The one geometric fact a circuit has that a route does not. `solveLoop`
  // computes the two straights that make it true; this is what would catch a
  // radius edited by hand without re-deriving them, and the tolerance is
  // double precision rather than a construction tolerance because the solve is
  // exact arithmetic and not an iteration.
  const first = placed[0].entry;
  const last = placed[placed.length - 1].exit;

  const gap = Math.hypot(last.position.x - first.position.x, last.position.z - first.position.z);
  assert.ok(gap < 1e-9, `the lap misses its own start by ${gap.toExponential(2)} m`);
  assert.ok(
    Math.abs(last.position.y - first.position.y) < 1e-9,
    'the lap comes home at a different height from the one it left at',
  );

  // A lap is one full turn, and its *sign* is the flow direction: negative yaw
  // is a right-hand turn (AGENTS.md's axis facts), so −2π is a clockwise
  // circuit. That is one of the ways §23.7 requires this venue to differ from
  // the reference, and it is a number rather than an adjective.
  const turned = last.headingY - first.headingY;
  assert.ok(
    Math.abs(turned + 2 * Math.PI) < 1e-9,
    `the lap turns ${(turned * 180 / Math.PI).toFixed(6)}°, not −360°`,
  );
});

test('the authored turns sum to −360° before anything is placed', () => {
  // The same claim one layer earlier, on the table rather than on the result,
  // because this is the one an author edits. A turn changed here without
  // another changed to match produces a spiral, and `solveLoop` cannot fix a
  // spiral — it can only move two straights.
  const turned = TRACK_GEOMETRY.reduce((total, element) => total + element.turn, 0);
  assert.equal(turned, -360);

  // Six rights against three lefts, and the lefts are not slack: the loop that
  // carries the hairpin and the second half of the flick pair are 215° of
  // left-hand turning, which is why the rights have to add up to 575 rather
  // than to 360. A circuit with no left-handers is one corner ridden nine
  // times in one direction.
  const rights = TRACK_GEOMETRY.filter((element) => element.turn < 0);
  const lefts = TRACK_GEOMETRY.filter((element) => element.turn > 0);
  assert.equal(rights.length, 6);
  assert.equal(lefts.length, 3);
  assert.equal(lefts.reduce((total, element) => total + element.turn, 0), 215);
});

test('the affine closure solve survives reasonable radius and turn edits', () => {
  const variants: readonly (readonly LoopElement[])[] = [
    TRACK_LOOP.map((element) => element.id === 'hairpin' ? { ...element, radius: 16 } : element),
    TRACK_LOOP.map((element) => {
      // A paired edit keeps the only heading precondition: the ring still
      // turns exactly once. The solve owns position, not heading.
      if (element.id === 'hairpin') return { ...element, turn: -170 };
      if (element.id === 'last') return { ...element, turn: -123 };
      return element;
    }),
  ];

  for (const loop of variants) {
    const solved = solveLoop(loop);
    for (const id of ['chute', 'breather']) {
      const length = solved.get(id);
      assert.ok(length !== undefined && length > 10 && length < 250, `${id} solved to ${String(length)} m`);
    }
    const geometry = loop.map((element) => {
      const curvature = element.radius === undefined || element.turn === undefined
        ? 0
        : Math.sign(element.turn) / element.radius;
      const length = element.straight === undefined
        ? Math.abs(element.turn ?? 0) * Math.PI / 180 * (element.radius ?? 0)
        : solved.get(element.id) ?? element.straight;
      return { id: element.id, length, halfWidth: TRACK.halfWidth, surface: 'pavement' as const, curvature };
    });
    const result = placeGraph({ main: geometry }, TRACK_SPAWN);
    const start = result[0].entry;
    const end = result[result.length - 1].exit;
    assert.ok(Math.hypot(end.position.x - start.position.x, end.position.z - start.position.z) < 1e-9);
    assert.ok(Math.abs(end.headingY - start.headingY + 2 * Math.PI) < 1e-9);
  }
});

test('the closure solve refuses a non-rideable negative straight', () => {
  const impossible = TRACK_LOOP.map((element) => {
    if (element.id === 'main') return { ...element, straight: 0 };
    return element;
  });
  assert.throws(() => solveLoop(impossible), /not rideable/);
});

test('the lap is kart scale and rides in the 40–70 s band', () => {
  // §23.7's own bound, and the modelled time behind it: a forward pass at the
  // drive curve and a backward pass at the brake curve over the corner speed
  // caps, which is the standard racing-line estimate and is *optimistic* by
  // construction — it assumes a perfect line and perfect braking. A real ride
  // is slower, so a model inside the band leaves the real lap inside it too.
  assert.ok(
    TRACK_LAP_METRES > 800 && TRACK_LAP_METRES < 1000,
    `lap is ${TRACK_LAP_METRES.toFixed(0)} m, outside compact kart scale`,
  );
  const seconds = modelledLapSeconds();
  assert.ok(seconds > 40 && seconds < 70, `modelled lap is ${seconds.toFixed(1)} s`);
});

test('the venue fits inside the world the surround backstop describes', () => {
  // `TERRAIN.surroundBackstopHalfExtent` is the edge of the drawn world. A
  // level that reached it would end in a visible lip, and the venue is placed
  // rather than grown, so this is cheap insurance against somebody scaling it.
  const field = plan.heightfield;
  const maxX = Math.max(Math.abs(field.originX), Math.abs(field.originX + field.columns * field.spacing));
  const maxZ = Math.max(Math.abs(field.originZ), Math.abs(field.originZ + field.rows * field.spacing));
  assert.ok(
    Math.max(maxX, maxZ) < TERRAIN.surroundBackstopHalfExtent,
    `the venue reaches ${Math.max(maxX, maxZ).toFixed(0)} m from the origin`,
  );
});

test('the lap never crosses itself, and no two corridors touch', () => {
  // **The structural half of the do-not-trace evidence.** The reference is a
  // crossing two-lobe layout — its lap passes through its own start/finish
  // area twice. This one is a simple closed curve, which is a difference in
  // kind rather than in degree and cannot be undone by rotating anything.
  //
  // It is also a rideability claim: two corridors closer together than their
  // own widths would merge into one sheet of asphalt with no infield between
  // them, and the shortest way round the lap would be across the join.
  const samples: { x: number; z: number; index: number }[] = [];
  let index = 0;
  for (const segment of placed) {
    const count = Math.max(1, Math.round(segment.spec.length));
    for (let step = 0; step < count; step += 1) {
      const point = centrelineAt(segment.entry, segment.spec, (segment.spec.length * step) / count);
      samples.push({ x: point.x, z: point.z, index });
      index += 1;
    }
  }

  let closest = Infinity;
  for (let a = 0; a < samples.length; a += 1) {
    for (let b = a + 1; b < samples.length; b += 1) {
      // Neighbours along the lap are supposed to be close. Only points that are
      // far apart *along the ring* are asked to be far apart in the world, and
      // the ring wraps, so the along-distance is the shorter of the two ways.
      const along = Math.min(b - a, samples.length - (b - a));
      if (along < 60) continue;
      closest = Math.min(closest, Math.hypot(samples[a].x - samples[b].x, samples[a].z - samples[b].z));
    }
  }

  // Two corridor half-widths plus a metre: the tightest the lap comes to
  // itself is the hairpin's own two legs, which is where a circuit is supposed
  // to be tight.
  const floor = 2 * TRACK.halfWidth + 1;
  assert.ok(closest > floor, `two parts of the lap pass ${closest.toFixed(1)} m apart`);
});

// ---------------------------------------------------------------------------
// The program
// ---------------------------------------------------------------------------

test('every item of the §23.7 program is a segment that exists', () => {
  const ids = new Set(TRACK_GEOMETRY.map((element) => element.id));
  for (const item of TRACK_PROGRAM) {
    for (const id of item.segments) {
      assert.ok(ids.has(id), `program item ${item.item} names "${id}", which the lap does not carry`);
    }
  }
  assert.equal(TRACK_PROGRAM.length, 7, 'the program is seven demands');
});

test('the corners are a rhythm rather than a repetition', () => {
  // The brief's own words — *"avoid making every corner equally tight. The
  // track should have rhythm"* — as a number. The slowest corner has to be
  // under half the speed of the fastest, or the lap is one corner ridden nine
  // times, and every corner has to differ from its neighbour by enough that a
  // rider changes what they are doing.
  const arcs = TRACK_GEOMETRY.filter((element) => element.turn !== 0);
  const speeds = arcs.map((element) => cornerSpeed(element.radius));
  const slowest = Math.min(...speeds);
  const fastest = Math.max(...speeds);
  assert.ok(slowest / fastest < 0.6, `corner speeds span only ${(slowest / fastest).toFixed(2)}`);

  // And no corner repeats the one before it. Two consecutive corners are
  // different work if they turn opposite ways — that is a transition, and the
  // flick pair is *built* out of two identical radii for exactly that reason —
  // so the speed test applies to same-handed neighbours, which are the pairs
  // where a rider would otherwise be doing the same thing twice.
  for (let index = 1; index < arcs.length; index += 1) {
    if (Math.sign(arcs[index].turn) !== Math.sign(arcs[index - 1].turn)) continue;
    const ratio = speeds[index] / speeds[index - 1];
    assert.ok(
      ratio < 0.85 || ratio > 1.18,
      `${arcs[index - 1].id} and ${arcs[index].id} are the same corner twice`,
    );
  }
});

test('the main straight reaches the M20 overspeed band before the sweeper', () => {
  // §23.7 item 1, and the reason the start/finish straight is the length it
  // is: the cutout is the one mechanic only a circuit can showcase, so the
  // straight has to be long enough that a rider who gets the final corner
  // right arrives at the sweeper's braking point already inside the band the
  // warning beep marks. Integrated from the ride's own curve — drive minus
  // quadratic drag minus the surface's rolling resistance — rather than
  // guessed, so a change to `driveAccel` or `dragCoefficient` fails here.
  const last = TRACK_GEOMETRY.find((element) => element.id === 'last');
  const sweeper = TRACK_GEOMETRY.find((element) => element.id === 'sweeper');
  const main = TRACK_GEOMETRY.find((element) => element.id === 'main');
  assert.ok(last !== undefined && sweeper !== undefined && main !== undefined);

  const reached = speedAfter(cornerSpeed(last.radius), main.length);
  assert.ok(
    reached > TOP_SPEED * EUC.overspeedBeepShare,
    `the straight tops out at ${reached.toFixed(1)} m/s, short of the `
      + `${(TOP_SPEED * EUC.overspeedBeepShare).toFixed(1)} m/s warning band`,
  );
  // And the sweeper is a lift rather than a stop: a rider has to give some of
  // that back, but not most of it, or the corner is a braking zone wearing a
  // sweeper's radius.
  const held = cornerSpeed(sweeper.radius);
  assert.ok(held / reached > 0.75, `the sweeper costs ${(1 - held / reached) * 100}% of the straight`);
});

test('the hairpin is slow enough to want the pivot and wide enough to ride', () => {
  // §23.7 item 4. Two bounds and they pull against each other: tight enough
  // that M16's slow-speed agility is the technique that gets a rider round it,
  // and wide enough that the racing line through it is an arc rather than a
  // three-point turn. The racing line's radius through a corner of this turn
  // is the centreline's plus the width a rider can use on each side.
  const hairpin = TRACK_GEOMETRY.find((element) => element.id === 'hairpin');
  assert.ok(hairpin !== undefined);
  assert.ok(Math.abs(hairpin.turn) > 150, 'a hairpin turns more than 150°');

  const line = cornerSpeed(hairpin.radius + TRACK.asphaltHalf);
  assert.ok(line < EUC.carveSpeed + 3, `the hairpin's racing line holds ${line.toFixed(1)} m/s`);
  // Below `carveSpeed` the wheel has its full yaw authority, which is what
  // makes the corner reward turning the machine rather than leaning it.
  assert.ok(line > 6, `the hairpin's racing line is only ${line.toFixed(1)} m/s and reads as a stop`);

  // The inside edge of the corridor still has to be a road. A centreline
  // radius under the corridor's own half-width would pinch the asphalt to
  // nothing at the apex.
  assert.ok(hairpin.radius > TRACK.asphaltHalf * 2, 'the hairpin pinches its own inside edge');
});

test('the flick pair is equal and opposite, so the complex costs no rotation', () => {
  // §23.7 item 5. The S-complex is a demand on transitions, not a corner: if
  // it turned the lap, its rotation would have to be paid for by making some
  // other corner tighter than its own job wanted.
  const right = TRACK_GEOMETRY.find((element) => element.id === 'flick-right');
  const left = TRACK_GEOMETRY.find((element) => element.id === 'flick-left');
  assert.ok(right !== undefined && left !== undefined);
  assert.equal(right.turn + left.turn, 0);
  assert.equal(right.radius, left.radius);

  // And the link between them is short enough that they read as one complex.
  const link = TRACK_GEOMETRY.find((element) => element.id === 'link');
  assert.ok(link !== undefined && link.length < 40, 'the flick pair is two separate corners');
});

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

test('the racing surface is asphalt and everything outside it costs grip', () => {
  // The mechanic §23.7 says the venue needs no new mechanic for: the corridor
  // is 20 m wide and only its middle 10 m is asphalt, so running wide is
  // punished by the surface system that already exists. Both verge surfaces
  // have to be genuinely worse than the racing line or the lap has no line.
  for (const spec of TRACK_GRAPH) {
    assert.equal(spec.surface, 'pavement', `${spec.id} is not asphalt`);
    assert.equal(spec.halfWidth, TRACK.halfWidth);
    const bands = spec.bands ?? [];
    assert.equal(bands.length, 2, `${spec.id} does not carry two verges`);
    for (const band of bands) {
      assert.ok(
        SURFACES[band.surface].grip < SURFACES.pavement.grip
          && SURFACES[band.surface].rollingResistance > SURFACES.pavement.rollingResistance,
        `${spec.id}'s verge is ${band.surface}, which does not punish anything`,
      );
      assert.equal(Math.abs(band.from) === TRACK.asphaltHalf || Math.abs(band.to) === TRACK.asphaltHalf, true);
    }
  }
});

test('gravel is only on the outside of the corners a rider arrives at fastest', () => {
  // Gravel is the harsher of the two verges (0.58 grip against grass's 0.70),
  // so where it goes is a fairness decision rather than a dressing one: it is
  // for the mistakes made at speed. A hairpin overshoot at 20 mph lands on
  // grass and costs a place; a sweeper overshoot at 40 lands in gravel.
  const gravelled: string[] = [];
  for (const spec of TRACK_GRAPH) {
    const geometry = TRACK_GEOMETRY.find((element) => element.id === spec.id);
    assert.ok(geometry !== undefined);
    for (const band of spec.bands ?? []) {
      if (band.surface !== 'gravel') continue;
      gravelled.push(spec.id);
      // The outside of a right-hander is the rider's LEFT, which is +t.
      const outsideIsLeft: boolean = geometry.turn <= 0;
      assert.equal(
        band.from > 0,
        outsideIsLeft,
        `${spec.id} carries gravel on the inside of its own corner`,
      );
    }
  }
  assert.deepEqual(gravelled.sort(), ['brakes', 'chute', 'last', 'sweeper']);

  // A straight has no outside of its own and carries run-off for the corner it
  // feeds, so a gravel straight has to be followed by a right-hander or the
  // trap is on the wrong side of the road. Stated rather than assumed.
  for (let index = 0; index < TRACK_GEOMETRY.length; index += 1) {
    const element = TRACK_GEOMETRY[index];
    if (element.turn !== 0 || !GRAVEL_RUNOFF.includes(element.id)) continue;
    const next = TRACK_GEOMETRY[(index + 1) % TRACK_GEOMETRY.length];
    assert.ok(next.turn < 0, `${element.id} carries gravel but feeds ${next.id}, a left-hander`);
  }
});

test('the venue carries no hazards and no targets', () => {
  // The absent-not-empty idiom is the contract (`LevelPlan.targets`): a plan
  // with no key is a world the pass never ran on. A circuit's demands come
  // from its corners and its surfaces; a pothole on a racing line would be
  // the venue apologising for its own layout.
  assert.equal(plan.hazards, undefined);
  assert.equal(plan.targets, undefined);
});

test('every piece of dressing the venue authors survives the builder', () => {
  // **The claim that matters about dressing, and the reason it is a count.**
  // `buildLevelPlan` drops a prop that would stand in a corridor, inside a
  // wall, or inside another building, and it says nothing at all about
  // dropping it — correct for a generator that must never emit a broken
  // world, and a silent hole in a venue somebody placed by hand. A fence bay
  // that quietly vanished where the site boundary passes a corner is exactly
  // the defect this exists to fail on.
  const authored = TRACK_SITE.main.reduce((total, spec) => total + (spec.props ?? []).length, 0)
    + (TRACK_SITE.branches ?? []).reduce(
      (total, branch) => total + branch.specs.reduce((sum, spec) => sum + (spec.props ?? []).length, 0),
      0,
    )
    + TRACK_SITE_PROPS.length;

  assert.ok(authored > 200, `the venue authors only ${authored} pieces of dressing`);
  assert.equal(
    (plan.props ?? []).length,
    authored,
    'the builder dropped dressing the venue authored — find it, do not lower this',
  );

  // And what it contributes to the simulation is derived from what survived.
  // The gantry span is the one kind here that is deliberately not solid.
  assert.ok((plan.solids ?? []).length > 0, 'nothing the venue dressed is physical');
  const spans = (plan.props ?? []).filter((prop) => prop.kind === 'gantrySpan');
  assert.equal(spans.length, 1, 'the venue has exactly one gantry');
  for (const solid of plan.solids ?? []) {
    assert.ok(
      solid.centre.y < TRACK.gantryLegHeight,
      `a solid at ${solid.centre.y.toFixed(1)} m is over the rider's head — `
        + 'the sampler reads a collider by its top face, so that is ground up there',
    );
  }
});

test('the dressing survivor count catches a deliberately culled paddock building', () => {
  // **Negative control for the count above.** Move one authored building onto
  // the middle of its own rideable apron. The builder must silently cull it,
  // and the exact count must move by one; otherwise an equality against the
  // current plan could be green while measuring the wrong population.
  let moved = false;
  const branches = (TRACK_SITE.branches ?? []).map((branch) => ({
    ...branch,
    specs: branch.specs.map((spec) => {
      if (spec.id !== 'paddock') return spec;
      return {
        ...spec,
        props: (spec.props ?? []).map((prop) => {
          if (moved || prop.kind !== 'building') return prop;
          moved = true;
          return { ...prop, t: 0 };
        }),
      };
    }),
  }));
  assert.equal(moved, true, 'the paddock carries no building for the culling control');

  const culled = buildLevelPlan({ main: TRACK_SITE.main, branches }, {
    id: 'track-dressing-culling-control',
    spawn: TRACK_SPAWN,
    surround: { height: 0, surface: 'grass' },
    checkpoints: TRACK_CHECKPOINTS,
    props: TRACK_SITE_PROPS,
  });
  assert.equal(
    (culled.props ?? []).length,
    (plan.props ?? []).length - 1,
    'moving one building into the apron did not remove exactly that building',
  );
});

test('the venue scatter is deterministic prop for prop', () => {
  // A resource-count plateau can pass while deterministic counts occupy
  // different places. This is the stronger B1 claim: every rebuilt prop has
  // the same kind, transform and dimensions in the same order.
  assert.deepEqual(createTrackLevel().props, plan.props);
});

test('the gantry stands on its own legs, and both of them are off the road', () => {
  // **The guard the builder structurally cannot run.** A prop is refused by
  // its footprint, and this one is authored `onCollider` with no footprint at
  // all — a truss standing on two blocks, the `treeCanopy` pattern one storey
  // up. So nothing in `buildPlan.ts` ever asks whether the *legs* are clear of
  // a corridor; this does.
  const legs = plan.segments
    .flatMap((segment) => segment.colliders)
    .filter((collider) => collider.halfExtents.y * 2 > TRACK.barrierHeight * 2);
  assert.equal(legs.length, 2, 'a gantry has two legs');

  for (const leg of legs) {
    assert.ok(
      Math.abs(leg.halfExtents.y * 2 - TRACK.gantryLegHeight) < 0.7,
      `a leg ${(leg.halfExtents.y * 2).toFixed(2)} m tall cannot carry a truss at `
        + `${TRACK.gantryLegHeight} m`,
    );
    for (const segment of placedSite) {
      const query = querySegment(segment, leg.centre.x, leg.centre.z);
      assert.ok(
        query === null || query.outside > 0,
        `a gantry leg stands inside ${segment.spec.id}`,
      );
    }
  }

  // The truss lands on them: same distance along, same span.
  const span = (plan.props ?? []).find((prop) => prop.kind === 'gantrySpan');
  assert.ok(span !== undefined);
  assert.ok(
    Math.abs(span.position.y - TRACK.gantryLegHeight) < 1e-6,
    `the truss sits at ${span.position.y.toFixed(2)} m and its legs end at ${TRACK.gantryLegHeight}`,
  );
  for (const leg of legs) {
    const reach = Math.hypot(leg.centre.x - span.position.x, leg.centre.z - span.position.z);
    assert.ok(
      Math.abs(reach - PROP_SIZES.gantrySpan.halfSpan) < TRACK.gantryLegHalf + 0.05,
      `a leg is ${reach.toFixed(2)} m from the truss centre, which spans `
        + `${PROP_SIZES.gantrySpan.halfSpan.toFixed(2)}`,
    );
  }
});

test('repeated field-side gantry-leg contacts leave the rider an escape', () => {
  // The truss is non-solid; its two legs are isolated posts beyond the
  // barriers. Approach each from the field at three shallow/head-on angles,
  // let the contact settle, then reverse back into the field. A leg that
  // overlaps the barrier response or leaves a sticky corner would keep
  // `blocked` set here.
  const legs = plan.segments
    .flatMap((segment) => segment.colliders)
    .filter((collider) => collider.halfExtents.y * 2 > TRACK.barrierHeight * 2);
  const sampler = new PlanTerrainSampler({ ...plan, checkpoints: [] });

  for (const leg of legs) {
    const outward = Math.sign(leg.centre.x - TRACK_SPAWN.position.x);
    const direct = outward > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const [angle, distance, throttle] of [
      [-0.28, 1.2, 0.45],
      [0, 2, 0.6],
      [0.28, 3, 0.75],
    ] as const) {
      const headingY = direct + angle;
      const forward = { x: Math.sin(headingY), z: Math.cos(headingY) };
      const euc = new EucController(sampler, {
        spawn: {
          position: {
            x: leg.centre.x - forward.x * distance,
            y: 0,
            z: leg.centre.z - forward.z * distance,
          },
          headingY,
        },
      });

      let hit = euc.snapshot();
      for (let step = 0; step < 720 && !hit.blocked; step += 1) {
        euc.step(STEP, actions({ throttle }));
        hit = euc.snapshot();
      }
      assert.equal(
        hit.blocked,
        true,
        `the ${angle} rad approach missed a gantry leg at ${JSON.stringify(hit.position)} `
          + `(speed ${hit.speed.toFixed(2)})`,
      );
      assert.equal(hit.crashed, false, `the ${distance} m approach manufactured a crash`);

      for (let step = 0; step < 360; step += 1) euc.step(STEP, actions());
      const settled = euc.snapshot();
      assert.ok(Math.abs(settled.speed) < 1e-9, `the rider settled at ${settled.speed} m/s`);
      for (let step = 0; step < 240; step += 1) euc.step(STEP, actions({ throttle: -1 }));
      const escaped = euc.snapshot();
      assert.equal(escaped.blocked, false, `the ${angle} rad contact stayed wedged at the leg`);
      assert.ok(
        Math.hypot(escaped.position.x - leg.centre.x, escaped.position.z - leg.centre.z) > 1.5,
        `the rider cleared the leg by only ${Math.hypot(
          escaped.position.x - leg.centre.x,
          escaped.position.z - leg.centre.z,
        ).toFixed(2)} m`,
      );
    }
  }
});

test('the paddock is inside the loop, reached only through the barrier it already had', () => {
  // §23.14: the infield is dressed, not built on, and the paddock uses a gate
  // the barrier line already carries. Only one of the two gates can satisfy
  // that — the circuit turns a net −360°, so the infield is on the rider's
  // right and the `main` gate opens the other way. Asserted rather than
  // commented, because getting it backwards puts a paddock in a field.
  const paddock = placedSite.find((segment) => segment.spec.id === 'paddock');
  assert.ok(paddock !== undefined, 'the venue has no paddock');

  const lap = placedSite.filter((segment) => TRACK_LAP_SEGMENT_IDS.includes(segment.spec.id));
  const centre = centrelineAt(paddock.entry, paddock.spec, paddock.spec.length / 2);
  assert.ok(insideLap(centre.x, centre.z), 'the paddock is outside the circuit');

  // **And it opens no second way onto the racing surface.** The paddock has to
  // meet the circuit *somewhere* — that is what a junction is — but exactly
  // once, inside the gate the barrier line already carries. Anywhere else it
  // touched a lap corridor would be a third opening, and §23.15's cut-lap
  // catalog is written against there being two.
  const gate = BARRIER_GATES.find((candidate) => candidate.segment === PADDOCK.gate);
  assert.ok(gate !== undefined, 'the paddock leaves through a corridor that has no gate');

  for (const branch of placedSite.filter((segment) => !lap.includes(segment))) {
    for (let along = 0; along <= branch.spec.length; along += 1) {
      for (const side of [-1, 0, 1] as const) {
        const at = centrelineAt(branch.entry, branch.spec, along);
        const left = leftOf(headingAt(branch.entry, branch.spec, along));
        const x = at.x + left.x * side * branch.spec.halfWidth;
        const z = at.z + left.z * side * branch.spec.halfWidth;
        for (const segment of lap) {
          const query = querySegment(segment, x, z);
          if (query === null || query.outside > 0) continue;
          assert.equal(
            segment.spec.id,
            PADDOCK.gate,
            `${branch.spec.id} reaches into ${segment.spec.id} — that is a second way on`,
          );
          assert.ok(
            query.s >= gate.from - 0.5 && query.s <= gate.to + 0.5,
            `${branch.spec.id} meets ${segment.spec.id} at ${query.s.toFixed(1)} m, outside the `
              + `${gate.from}–${gate.to} m gap in its barrier`,
          );
          assert.equal(
            Math.sign(query.t),
            gate.side,
            `${branch.spec.id} meets ${segment.spec.id} on the wrong side of it`,
          );
        }
      }
    }
  }
});

test('the finished heightfield stays flat through the track-to-paddock junction', () => {
  // Sample the line a rider actually turns through: a quadratic tangent to the
  // exit corridor at one end and the access road at the other. Both source
  // corridors are flat, but only the finished sampler can prove their raster
  // composition did not manufacture a lip or tilted triangle between them.
  const exit = placedSite.find((segment) => segment.spec.id === PADDOCK.gate);
  const road = placedSite.find((segment) => segment.spec.id === 'paddock-road');
  assert.ok(exit !== undefined && road !== undefined);
  const start = centrelineAt(exit.entry, exit.spec, 0);
  const control = centrelineAt(exit.entry, exit.spec, PADDOCK.at);
  const end = centrelineAt(road.entry, road.spec, 0);
  const sampler = new PlanTerrainSampler(plan);

  for (let step = 0; step <= 80; step += 1) {
    const t = step / 80;
    const one = 1 - t;
    const x = one * one * start.x + 2 * one * t * control.x + t * t * end.x;
    const z = one * one * start.z + 2 * one * t * control.z + t * t * end.z;
    const ground = groundAt(sampler, x, z);
    assert.ok(Math.abs(ground.height) < 1e-9, `the junction rises to ${ground.height} m at ${t}`);
    assert.ok(
      Math.abs(ground.normal.x) < 1e-9 && Math.abs(ground.normal.z) < 1e-9,
      `the junction tilts at ${t}: ${JSON.stringify(ground.normal)}`,
    );
  }
});

/** Whether a world point is inside the lap's own closed centreline. */
function insideLap(px: number, pz: number): boolean {
  const ring: [number, number][] = [];
  for (const segment of placedSite) {
    if (!TRACK_LAP_SEGMENT_IDS.includes(segment.spec.id)) continue;
    const steps = Math.max(2, Math.ceil(segment.spec.length / 3));
    for (let step = 0; step < steps; step += 1) {
      const at = centrelineAt(segment.entry, segment.spec, (segment.spec.length * step) / steps);
      ring.push([at.x, at.z]);
    }
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// The paint
// ---------------------------------------------------------------------------

test('every painted line lands on asphalt and clear of the barriers', () => {
  // The builder clips paint that would break either rule, so this is really a
  // check on the *authoring*: a line that had to be clipped is a line somebody
  // put in the wrong place, and clipping hides that rather than reporting it.
  assert.ok((plan.markings ?? []).length > 0);
  const sampler = new PlanTerrainSampler(plan);
  const barriers = plan.segments.flatMap((segment) => segment.colliders);

  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      const ground = groundAt(sampler, point.x, point.z);
      assert.ok(
        PAINTABLE_SURFACES.includes(ground.surface),
        `paint landed on ${ground.surface} at ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`,
      );
      const clearance = Math.min(...barriers.map((box) => boxClearance(box, point.x, point.z)));
      assert.ok(
        clearance > MARKINGS.colliderClearance,
        `paint came ${clearance.toFixed(2)} m from a barrier`,
      );
    }
  }
});

/**
 * The quads one painted run actually becomes, in world metres.
 *
 * A marking is a ribbon of a fixed half-width around its own points, and every
 * ribbon in a level is drawn in one mesh at one height, so two of them that
 * share ground do not stack — they fight for the depth buffer and strobe.
 */
function paintQuads(points: readonly { x: number; z: number }[], half: number): { x: number; z: number }[][] {
  const quads: { x: number; z: number }[][] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-9) continue;
    const nx = -(b.z - a.z) / length * half;
    const nz = (b.x - a.x) / length * half;
    quads.push([
      { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
      { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz },
    ]);
  }
  return quads;
}

/** Separating-axis overlap of two convex quads, with touching allowed. */
function quadsOverlap(a: readonly { x: number; z: number }[], b: readonly { x: number; z: number }[]): boolean {
  for (const poly of [a, b]) {
    for (let index = 0; index < poly.length; index += 1) {
      const p = poly[index];
      const q = poly[(index + 1) % poly.length];
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      if (length < 1e-9) continue;
      const ux = -(q.z - p.z) / length;
      const uz = (q.x - p.x) / length;
      const spread = (poly2: readonly { x: number; z: number }[]): [number, number] => {
        let low = Infinity;
        let high = -Infinity;
        for (const v of poly2) {
          const d = v.x * ux + v.z * uz;
          low = Math.min(low, d);
          high = Math.max(high, d);
        }
        return [low, high];
      };
      const [aLow, aHigh] = spread(a);
      const [bLow, bHigh] = spread(b);
      // A shared edge is a hairline, not a fight. Only real area counts.
      if (aHigh - 1e-4 <= bLow || bHigh - 1e-4 <= aLow) return false;
    }
  }
  return true;
}

/** Every pair of painted runs that share ground, as readable positions. */
function paintFights(markings: readonly { points: readonly { x: number; z: number }[]; width: number; paint?: string }[]): string[] {
  const runs = markings.map((marking) => ({
    paint: marking.paint ?? 'road',
    quads: paintQuads(marking.points, marking.width / 2),
  }));
  const found: string[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    for (let j = i + 1; j < runs.length; j += 1) {
      for (const one of runs[i].quads) {
        for (const other of runs[j].quads) {
          if (!quadsOverlap(one, other)) continue;
          found.push(
            `${runs[i].paint} over ${runs[j].paint} near `
              + `${one[0].x.toFixed(1)}, ${one[0].z.toFixed(1)}`,
          );
        }
      }
    }
  }
  return found;
}

test('the venue repaints the palette without stepping outside it', () => {
  // **An override is held to every rule the table it overrides is held to.**
  // `data/surfaces.test.ts` bounds every material's luminance because a value
  // picked by eye as "dark grey" crushes to a silhouette under ACES; a level
  // that could dodge that assertion by repainting would have made the bound
  // advisory. The same arithmetic, on the same authority.
  const painted = plan.palette ?? {};
  assert.ok(Object.keys(painted).length > 0, 'the venue authored no palette at all');

  for (const [id, albedo] of Object.entries(painted) as [string, number][]) {
    assert.ok(
      id in MATERIALS,
      `the venue repaints ${id}, which is not a material — a palette may retint, not extend`,
    );
    const linear = [(albedo >> 16) & 0xff, (albedo >> 8) & 0xff, albedo & 0xff]
      .map((channel) => (channel / 255) ** 2.2);
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    assert.ok(luminance > 0.03, `${id} is repainted to ${luminance.toFixed(3)} linear — it will crush`);
    assert.ok(luminance < 0.6, `${id} is repainted to ${luminance.toFixed(3)} linear — it will blow out`);
  }

  // The turf is the point of the override, and it has to stay under the
  // asphalt it borders or the racing surface stops being what the eye lands on.
  const turf = painted.grass;
  assert.ok(turf !== undefined, 'the venue is supposed to repaint its grass');
  const luminanceOf = (hex: number): number => {
    const linear = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
      .map((channel) => (channel / 255) ** 2.2);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  assert.ok(
    luminanceOf(turf) > luminanceOf(MATERIALS.grass.albedo),
    'the venue turf is meant to be the brighter, mown one',
  );
  assert.ok(
    luminanceOf(turf) < luminanceOf(MATERIALS[SURFACES.pavement.material].albedo),
    'the turf outshines the racing surface, so the asphalt stops leading the eye',
  );
});

test('no two painted runs on this venue share ground', () => {
  // The defect this was written for: B1 authored the kerbs on `paintOffset`,
  // which is where the edge line already is, on the reasoning that the wider
  // bar would swallow the narrower line. A depth buffer does not swallow — it
  // fights, and the fight was invisible for as long as both runs were white.
  // The owner saw it the moment a kerb bar turned red: the edge line strobing
  // on and off under the kerbs through every corner.
  //
  // 636 pairs of quads shared ground when he reported it: 386 kerb-over-line,
  // 246 white-bar-over-line and start/finish bars crossing the edge lines, and
  // 4 sector lines crossing them. Do not relax this to a count.
  const fights = paintFights(plan.markings ?? []);
  assert.deepEqual(
    fights.slice(0, 8),
    [],
    `${fights.length} pairs of painted quads share ground; paint is one mesh at `
      + 'one height, so a shared metre is a depth fight rather than a layer',
  );
});

test('the paint overlap check can fail, so its silence means something', () => {
  // Put one kerb bar back on the edge line, exactly as B1 authored it.
  const markings = plan.markings ?? [];
  const edge = markings.find((marking) => marking.width === MARKINGS.edgeWidth);
  assert.ok(edge !== undefined, 'the venue has no edge line to lay a kerb back onto');
  const relaid = [...markings, {
    points: edge.points.slice(0, 3),
    width: MARKINGS.barWidth,
    paint: 'kerb' as const,
  }];
  assert.ok(
    paintFights(relaid).length > 0,
    'the overlap check cannot see a kerb bar laid straight down the edge line',
  );
});

test('the start line and the two sector lines are painted across the track', () => {
  // A bar is the only transverse role the paint kit has, and the three lines
  // the mode will read have to be visible before the mode exists — the owner's
  // gate is a lap ride, and a lap needs somewhere to start.
  const transverse = TRACK_GRAPH.flatMap((spec) => (spec.markings ?? [])
    .filter((marking) => marking.path[0].s === marking.path[marking.path.length - 1].s)
    .map((marking) => ({ id: spec.id, marking })));

  // Two for the start/finish, so it reads as a line rather than as a marking,
  // and one apiece for the sectors.
  assert.equal(transverse.length, 4);
  assert.equal(transverse.filter((entry) => entry.id === 'main').length, 2);
  assert.deepEqual(
    transverse.filter((entry) => entry.marking.paint === 'path').map((entry) => entry.id),
    ['backstretch', 'climb'],
  );
  for (const entry of transverse) {
    assert.equal(entry.marking.role, 'bar');
    const span = Math.abs(entry.marking.path[0].t - entry.marking.path[1].t);
    assert.ok(span > TRACK.asphaltHalf, `a bar spans ${span.toFixed(1)} m of a 10 m track`);
  }
});

test('not one metre of paint on this venue needed clipping', () => {
  // **The strong version of the claim, and the reason the offsets are what
  // they are.** `buildPlan` clips paint that would leave the asphalt, leave a
  // corridor, or land on a collider — and clipping *hides* an authoring
  // mistake rather than reporting it. A line authored at 4.75 m from the
  // centreline looked right and shipped as 103 broken pieces of a continuous
  // 1,859 m, because the heightfield's surface is one value per one-metre cell
  // and `clipMarking` tests the whole ribbon rather than its centre. One
  // marking in, one marking out is the only version of this that is checkable.
  const authored = TRACK_GRAPH.reduce((total, spec) => total + (spec.markings ?? []).length, 0);
  assert.equal((plan.markings ?? []).length, authored);
});

test('every corner kerb uses the striped path rather than the plain fallback', () => {
  // `kerbStripes` deliberately has a one-bar fallback for a run too short to
  // survive the marking clipper. That is valid machinery and would be a
  // silent visual downgrade on this circuit: every authored B1 kerb is long
  // enough to read red/white at speed, so none may take that branch.
  let runs = 0;
  for (const spec of TRACK_GRAPH) {
    if ((spec.curvature ?? 0) === 0) continue;
    const bySide = new Map<number, SegmentMarking[]>();
    for (const marking of spec.markings ?? []) {
      const first = marking.path[0];
      const last = marking.path[marking.path.length - 1];
      if (marking.role !== 'bar' || Math.abs(last.s - first.s) < 1e-9) continue;
      const list = bySide.get(first.t);
      if (list === undefined) bySide.set(first.t, [marking]);
      else list.push(marking);
    }
    for (const [side, markings] of bySide) {
      runs += 1;
      assert.ok(markings.length > 1, `${spec.id}'s ${side} m kerb took the plain one-bar fallback`);
      for (let index = 0; index < markings.length; index += 1) {
        assert.equal(
          markings[index].paint ?? 'road',
          index % 2 === 0 ? 'kerb' : 'road',
          `${spec.id}'s ${side} m kerb loses alternation at stripe ${index}`,
        );
      }
    }
  }
  assert.equal(runs, 16, `the nine corners expose ${runs} kerb runs rather than sixteen`);
});

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

test('the route is a lap: one line, then sectors, and no second end', () => {
  assert.deepEqual(
    plan.checkpoints.map((gate) => gate.kind),
    ['start', 'split', 'split'],
  );
  assert.deepEqual(plan.checkpoints.map((gate) => gate.routeIndex), [0, 1, 2]);

  // **And the M10 referee declines it, which is the point.** A time trial asks
  // whether a route can start and stop; a lap cannot, so the existing mode
  // reports the venue un-timeable without a branch anywhere on which level is
  // loaded. Phase B2's lap referee is what reads these three as a lap.
  assert.equal(new ChallengeRun(plan.id, plan.checkpoints).available, false);
});

test('the gates stand on the racing surface, square across it', () => {
  const sampler = new PlanTerrainSampler(plan);
  for (const gate of plan.checkpoints) {
    const ground = groundAt(sampler, gate.centre.x, gate.centre.z);
    assert.equal(ground.surface, 'pavement', `${gate.id} is not on the asphalt`);
    assert.ok(
      Math.abs(gate.centre.y - CHALLENGE.gateHalfHeight - ground.height) < 0.05,
      `${gate.id} floats or is buried`,
    );
    // The volume spans the corridor and is thin along travel, which is what
    // makes "passed the gate" mean a line rather than an area.
    assert.equal(gate.halfExtents.x, TRACK.halfWidth + CHALLENGE.gateWidthMargin);
    assert.ok(gate.halfExtents.z < gate.halfExtents.x / 4);
  }
});

test('the sectors divide the lap into thirds a rider can name', () => {
  // Not equal thirds — each boundary is on a straight, just past the end of a
  // stretch that means something: the fast run, then the technical run. A
  // sector line inside a braking zone would make a split time a measurement of
  // where somebody happened to brake.
  const along = (segmentId: string, s: number): number => {
    const entry = TRACK_ENTRY_DISTANCE.get(segmentId);
    assert.ok(entry !== undefined, `no segment "${segmentId}"`);
    return entry + s;
  };

  const line = along('main', TRACK.lineAt);
  const boundaries = TRACK_CHECKPOINTS.slice(1)
    .map((spec) => (along(spec.segment, spec.s) - line + TRACK_LAP_METRES) % TRACK_LAP_METRES);
  const sectors = [boundaries[0], boundaries[1] - boundaries[0], TRACK_LAP_METRES - boundaries[1]];

  for (const sector of sectors) {
    assert.ok(
      sector > TRACK_LAP_METRES * 0.25 && sector < TRACK_LAP_METRES * 0.42,
      `a sector is ${sector.toFixed(0)} m of a ${TRACK_LAP_METRES.toFixed(0)} m lap`,
    );
  }

  // Every gate is on a straight, and far enough from either socket that the
  // whole volume is inside one corridor.
  for (const spec of TRACK_CHECKPOINTS) {
    const element = TRACK_GEOMETRY.find((candidate) => candidate.id === spec.segment);
    assert.ok(element !== undefined && element.turn === 0, `${spec.id} sits on a corner`);
    assert.ok(spec.s > CHALLENGE.gateHalfDepth * 2, `${spec.id} straddles its entry socket`);
    assert.ok(
      spec.s < element.length - CHALLENGE.gateHalfDepth * 2,
      `${spec.id} straddles its exit socket`,
    );
  }
});

test('the rider spawns on the circuit, facing the lap, short of the line', () => {
  const sampler = new PlanTerrainSampler(plan);
  const ground = groundAt(sampler, plan.spawn.position.x, plan.spawn.position.z);
  assert.equal(ground.surface, 'pavement');

  const main = bySegment.get('main');
  assert.ok(main !== undefined);
  const here = querySegment(main, plan.spawn.position.x, plan.spawn.position.z);
  assert.ok(here !== null && here.outside === 0, 'the spawn is off the corridor');
  assert.ok(Math.abs(here.t) < 0.01, 'the spawn is not on the centreline');

  // The out-lap. `CHALLENGE.startRunupMetres` is the shortest run-up the
  // referee considers fair anywhere; a track day gives four times it.
  const runUp = TRACK.lineAt - here.s;
  assert.ok(runUp > CHALLENGE.startRunupMetres * 3, `only ${runUp.toFixed(0)} m of out-lap`);
});

// ---------------------------------------------------------------------------
// The barriers, as data
// ---------------------------------------------------------------------------

test('each barrier side has exactly one gate to define its ring walk', () => {
  for (const side of [-1, 1] as const) {
    assert.equal(barrierGateForSide(side), BARRIER_GATES.find((gate) => gate.side === side));
    assert.throws(
      () => barrierGateForSide(side, BARRIER_GATES.filter((gate) => gate.side !== side)),
      /carries 0 gates; its ring needs exactly one/,
    );
    const own = BARRIER_GATES.find((gate) => gate.side === side);
    assert.ok(own !== undefined);
    assert.throws(
      () => barrierGateForSide(side, [...BARRIER_GATES, { ...own, what: 'duplicate control' }]),
      /carries 2 gates; its ring needs exactly one/,
    );
  }
});

test('a barrier stands where a rider can see over it', () => {
  // Not a style rule. A block occludes the chase camera by default and only
  // derived dressing ever says otherwise (`BoxCollider.occludes`), so a barrier
  // tall enough to hide a rider would pull the camera in on every corner of
  // every lap — and corner readability at speed is the one thing this venue
  // may not compromise (§23.13's gate).
  const riderHeight = RIDER_BLOCKOUT.restHipHeight + RIDER_BLOCKOUT.torsoLength
    + RIDER_BLOCKOUT.neckLength + RIDER_BLOCKOUT.helmetRadius;
  assert.ok(
    TRACK.barrierHeight < riderHeight * 0.7,
    `a ${TRACK.barrierHeight} m barrier is not under a ${riderHeight.toFixed(2)} m rider`,
  );
  // And over the wheel, or it is a kerb rather than a barrier: a rider must
  // not be able to hop it and leave the circuit sideways.
  assert.ok(TRACK.barrierHeight > WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor + EUC.hopLaunchSpeed ** 2 / (2 * PHYSICS.gravity));

  for (const collider of barrierColliders()) {
    assert.ok(
      collider.appearance === 'concrete' || collider.appearance === 'signalRed',
      `a barrier panel in ${String(collider.appearance)} — the venue has two colourways`,
    );
    // The red panel is the proud one; see `TRACK.barrierPanelStep` for the
    // depth-fight this twelve millimetres exists to settle.
    const expected = collider.appearance === 'signalRed'
      ? TRACK.barrierHalfLateral
      : TRACK.barrierHalfLateral - TRACK.barrierPanelStep;
    assert.ok(Math.abs(collider.halfExtents.x - expected) < 1e-9);
  }
});

test('each side of the barrier alternates all the way round, seaming only at its gate', () => {
  // **The reason `barrierRing` walks the lap instead of dressing each corridor
  // on its own.** A phase that restarts at every entry socket repeats a colour
  // at whichever seams the previous corridor's length did not divide, which is
  // most of the eighteen, and reads as a defect rather than as a barrier. A
  // closed ring's arc length is not a whole number of panels either, so one
  // repeat is unavoidable — the walk puts it inside the gate, where the
  // barrier is a hole and nobody can see it.
  for (const side of [-1, 1] as const) {
    const gate = BARRIER_GATES.find((candidate) => candidate.side === side);
    assert.ok(gate !== undefined, `side ${side} carries no gate`);
    const origin = (TRACK_ENTRY_DISTANCE.get(gate.segment) ?? 0) + gate.to;

    const panels = TRACK_GRAPH.flatMap((spec) => (spec.blocks ?? [])
      .filter((block) => Math.sign(block.t) === side
        && Math.abs(Math.abs(block.t) - TRACK.barrierOffset) < 1e-9)
      .map((block) => ({
        along: (((TRACK_ENTRY_DISTANCE.get(spec.id) ?? 0) + block.s - origin) + TRACK_LAP_METRES)
          % TRACK_LAP_METRES,
        red: block.appearance === 'signalRed',
      })))
      .sort((a, b) => a.along - b.along);

    // A 930 m lap at 2.2 m panels is about four hundred a side, finer around
    // the hairpin where the sagitta rule overrides the module.
    assert.ok(panels.length > 350, `side ${side} carries only ${panels.length} panels`);
    for (let index = 1; index < panels.length; index += 1) {
      assert.notEqual(
        panels[index].red,
        panels[index - 1].red,
        `side ${side} repeats a colour at ${panels[index].along.toFixed(1)} m past the ${gate.what}`,
      );
    }
  }
});

test('the assembled barrier boxes overlap at every ordinary joint and corridor seam', () => {
  // The centreline coverage walk below cannot see a corner opening at the
  // *outer* edge of two yawed boxes. Test the actual world-space rectangles
  // with SAT instead. This is deliberately not a sample against an ideal arc:
  // the chord's sagitta would report empty curve outside a perfectly closed
  // pair of panels, which is the false alarm this B1 audit first produced.
  let ordinaryJoints = 0;
  let corridorSeams = 0;
  let tightest = Infinity;
  let tightestSeam = Infinity;
  let openedWithoutJoint = 0;

  for (const side of [-1, 1] as const) {
    const gate = BARRIER_GATES.find((candidate) => candidate.side === side);
    assert.ok(gate !== undefined, `side ${side} carries no gate`);
    const origin = (TRACK_ENTRY_DISTANCE.get(gate.segment) ?? 0) + gate.to;
    const panels = placed.flatMap((segment) => {
      const boxes = collidersOf(segment);
      return (segment.spec.blocks ?? []).flatMap((block, index) => {
        if (
          Math.sign(block.t) !== side
          || Math.abs(Math.abs(block.t) - TRACK.barrierOffset) > 1e-9
        ) return [];
        return [{
          segment: segment.spec.id,
          along: (((TRACK_ENTRY_DISTANCE.get(segment.spec.id) ?? 0) + block.s - origin)
            + TRACK_LAP_METRES) % TRACK_LAP_METRES,
          box: boxes[index],
          joint: barrierLine(segment.spec.curvature ?? 0, side).joint,
        }];
      });
    }).sort((a, b) => a.along - b.along);

    for (let index = 1; index < panels.length; index += 1) {
      const previous = panels[index - 1];
      const next = panels[index];
      const penetration = footprintPenetration(previous.box, next.box);
      ordinaryJoints += 1;
      tightest = Math.min(tightest, penetration);
      assert.ok(
        penetration > 0,
        `side ${side}'s assembled boxes open ${(penetration * -1000).toFixed(1)} mm `
          + `between ${previous.segment} and ${next.segment}`,
      );

      if (previous.segment !== next.segment) {
        corridorSeams += 1;
        tightestSeam = Math.min(tightestSeam, penetration);
      }

      const withoutJoint = footprintPenetration(
        shortenBox(previous.box, previous.joint),
        shortenBox(next.box, next.joint),
      );
      if (withoutJoint <= 0) openedWithoutJoint += 1;
    }
  }

  assert.ok(ordinaryJoints > 700, `only ${ordinaryJoints} barrier joints were checked`);
  assert.equal(corridorSeams, TRACK_GEOMETRY.length * 2);
  assert.ok(tightest >= 0.039, `the tightest joint overlaps only ${(tightest * 1000).toFixed(1)} mm`);
  assert.ok(
    tightestSeam >= 0.048,
    `the tightest corridor seam overlaps only ${(tightestSeam * 1000).toFixed(1)} mm`,
  );
  assert.ok(
    openedWithoutJoint > 300,
    `removing the authored joint opens only ${openedWithoutJoint} pairs — the control is not sensitive`,
  );
});

test('the barrier line is inside the corridor and outside the asphalt', () => {
  // Both halves. Inside the corridor, so a barrier stands on ground the
  // segment authored rather than on the shoulder easing away beneath it.
  // Outside the asphalt with room to spare, so the racing surface is the full
  // ten metres and a rider using all of it is not scraping.
  const face = TRACK.barrierOffset - TRACK.barrierHalfLateral;
  assert.ok(face > TRACK.asphaltHalf + 2.5, 'the barriers crowd the racing surface');
  assert.ok(TRACK.barrierOffset + TRACK.barrierHalfLateral < TRACK.halfWidth, 'a barrier stands on the shoulder');
});

test('every barrier line is continuous except at the two authored gates', () => {
  // **Walked in world space, and that is the whole point of this test.** The
  // first version of it walked `s` — the centreline's own frame — and passed on
  // a build whose every outside barrier had a hole in it every few metres,
  // because `s` and a block's world `halfAlong` are not the same unit on an
  // arc. The defect was found by looking at the venue. This is written in the
  // frame a wheel is actually in, so it cannot be fooled the same way twice.
  //
  // A gap in a barrier is otherwise indistinguishable from a gate somebody
  // meant, and the gates are load-bearing rather than decorative: "go
  // anywhere" is LOCKED, so a venue ringed by an unbroken wall would be the
  // first ride in this game with an edge.
  const holes = barrierHoles(placed);
  assert.equal(holes.length, BARRIER_GATES.length, `barrier gaps: ${JSON.stringify(holes)}`);
  for (const gate of BARRIER_GATES) {
    const gap = holes.find((candidate) => candidate.segment === gate.segment && candidate.side === gate.side);
    assert.ok(gap !== undefined, `${gate.what} is not a gap in the barrier`);
    assert.ok(
      gap.from >= gate.from - 0.5 && gap.to <= gate.to + 0.5,
      `${gate.what} opens ${gap.from.toFixed(1)}–${gap.to.toFixed(1)} rather than ${gate.from}–${gate.to}`,
    );
    // Wide enough to ride out through, which is the whole reason it is here.
    assert.ok(gap.to - gap.from > 8, `${gate.what} is only ${(gap.to - gap.from).toFixed(1)} m wide`);
  }
});

/**
 * Every gap in either barrier line, walked in **world** metres.
 *
 * Shared by the coverage claim and by its negative control below, so the two
 * cannot measure different things — a control that exercises a different walk
 * proves nothing about the walk that is silent.
 */
function barrierHoles(
  segments: readonly PlacedSegment[],
): { segment: string; side: number; from: number; to: number }[] {
  const found: { segment: string; side: number; from: number; to: number }[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const spec = segment.spec;
    // Seams are covered by whichever segment owns the metre, so a sample near
    // one is offered its neighbours' boxes too.
    const nearby = [index, (index + 1) % segments.length, (index + segments.length - 1) % segments.length]
      .flatMap((at) => collidersOf(segments[at]));

    for (const side of [-1, 1] as const) {
      const t = side * TRACK.barrierOffset;
      let open: { from: number; to: number } | null = null;
      const close = (): void => {
        if (open !== null) found.push({ segment: spec.id, side, from: open.from, to: open.to });
        open = null;
      };
      for (let s = 0.05; s < spec.length; s += 0.05) {
        const centre = centrelineAt(segment.entry, spec, s);
        const left = leftOf(headingAt(segment.entry, spec, s));
        const x = centre.x + left.x * t;
        const z = centre.z + left.z * t;
        const inside = nearby.some((box) => boxClearance(box, x, z) <= 0);
        if (inside) close();
        else if (open === null) open = { from: s, to: s };
        else open.to = s;
      }
      close();
    }
  }
  // Anything under a tenth of a metre is the sampling step catching a corner of
  // an overlap, not a hole a wheel could find.
  return found.filter((gap) => gap.to - gap.from > 0.1);
}

test('put the s-versus-world confusion back and the coverage walk finds it', () => {
  // **The control that makes the test above worth its silence.** B1 rewrote
  // the panel arithmetic, so *it fails on the old build* stopped describing
  // the code being trusted; this reproduces the original defect against the
  // current one instead. Every barrier panel's world half-length is divided by
  // its own `arcScale` — which is exactly the mistake B0 shipped: `s` read as
  // if it were a world length, so panels on the outside of every corner fall
  // short of each other.
  //
  // **What this control also settles is what the walk does *not* prove.** It
  // samples the barrier's own centreline, where two chords meet exactly; the
  // corner splay the joint overlap exists to close opens at the *corners*, and
  // a line down the middle can never see it. That is M17's lesson in a third
  // place — a sweep proves nothing perpendicular to itself — and it is why the
  // splay is answered by the ride-alongside fixtures below rather than here.
  const broken = placed.map((segment) => ({
    ...segment,
    spec: {
      ...segment.spec,
      blocks: (segment.spec.blocks ?? []).map((block) => {
        if (Math.abs(Math.abs(block.t) - TRACK.barrierOffset) > 1e-9) return block;
        const line = barrierLine(segment.spec.curvature ?? 0, Math.sign(block.t) as 1 | -1);
        return { ...block, halfAlong: block.halfAlong / line.arcScale };
      }),
    },
  }));

  const holes = barrierHoles(broken);
  assert.ok(
    holes.length > BARRIER_GATES.length + 50,
    `the s-frame build opened only ${holes.length} gaps — the walk is not measuring coverage`,
  );
  // On the *outside* of the corners, which is where a barrier's own arc is
  // longer than the centreline it is spaced against, and where the defect was.
  const outside = holes.filter((hole) => {
    const element = TRACK_GEOMETRY.find((candidate) => candidate.id === hole.segment);
    return element !== undefined && element.curvature !== 0
      && Math.sign(hole.side) === -Math.sign(element.curvature);
  });
  assert.ok(
    outside.length > holes.length * 0.6,
    `${outside.length} of ${holes.length} gaps are on an outside barrier — that is not the defect`,
  );
});

test('a barrier on an arc is faceted finely enough to read as a curve', () => {
  // A block is a box and a box is straight, so a barrier on a corner is a
  // chain of chords. Two claims, and the second is the one that matters for
  // collision: the chords stay close to the arc, and consecutive chords
  // *overlap*, because tangent-aligned rectangles meet at their faces but not
  // at their corners and the joint opens by about `halfLateral × Δθ`.
  for (const segment of placed) {
    const curvature = segment.spec.curvature ?? 0;
    if (curvature === 0) continue;
    for (const side of [-1, 1] as const) {
      const t = side * TRACK.barrierOffset;
      const radius = 1 / Math.abs(curvature) - t * Math.sign(curvature);
      const facets = (segment.spec.blocks ?? [])
        .filter((block) => Math.abs(block.t - t) < 1e-9)
        .sort((a, b) => a.s - b.s);
      assert.ok(facets.length > 0, `${segment.spec.id} has no barrier on one side`);

      assert.ok(radius > 0, `${segment.spec.id}'s inside barrier is past its own arc centre`);
      // `halfAlong` is a world length and the box's ends sit that far along its
      // own tangent, so the chord's bulge is measured from the barrier's own
      // radius rather than the corridor's.
      // Derived from what the panel machinery promises rather than from a
      // slack factor: a panel is at most `panelMax` of its own arc long and
      // carries `joint` of overlap at each end, so this is the longest
      // half-chord it can produce and the deepest sagitta that implies.
      const line = barrierLine(curvature, side);
      const allowedHalf = line.panelMax / 2 + line.joint;
      const allowed = Math.sqrt(radius * radius + allowedHalf * allowedHalf) - radius + 1e-9;
      for (const facet of facets) {
        assert.ok(
          facet.halfAlong <= allowedHalf + 1e-9,
          `${segment.spec.id}'s barrier panel is ${facet.halfAlong.toFixed(3)} m long, `
            + `past the ${allowedHalf.toFixed(3)} m the module and its joint allow`,
        );
        const sag = Math.sqrt(radius * radius + facet.halfAlong * facet.halfAlong) - radius;
        assert.ok(
          sag <= allowed,
          `${segment.spec.id}'s barrier chords ${(sag * 1000).toFixed(0)} mm off its arc`,
        );
      }
      // Overlap, checked in world metres: `halfAlong` is one and the gap
      // between two `s` values is not, which is the unit confusion that put
      // holes in every outside barrier on the first build.
      const arcScale = radius * Math.abs(curvature);
      for (let index = 1; index < facets.length; index += 1) {
        const previous = facets[index - 1];
        const next = facets[index];
        const apart = (next.s - previous.s) * arcScale;
        assert.ok(
          previous.halfAlong + next.halfAlong > apart,
          `${segment.spec.id}'s barrier facets ${index - 1} and ${index} leave `
            + `${(apart - previous.halfAlong - next.halfAlong).toFixed(3)} m open`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The barriers, ridden
// ---------------------------------------------------------------------------

test('riding the length of every barrier line keeps the machine out of it', () => {
  // **The M17 fixture, applied to all 36 barrier lines rather than to one.**
  // AGENTS.md: a cast sweeps along its own direction and proves nothing
  // perpendicular to it, so a rider driven *at* a wall passes on a build that
  // clips through one *beside* them. Her brief names this exact worry —
  // *"barrier placement that looks believable without constantly trapping the
  // rider"* — and a circuit is barriers on both sides for nine hundred metres.
  //
  // Each run holds the machine a fifth of a metre off the barrier's face for
  // the whole length of one side of one segment, with a lateral controller
  // that keeps pressing into it. Three things are asserted per run: the
  // centreline never reaches the face, the run is not stopped by a snag, and
  // scraping along a barrier never manufactures a crash.
  const barriers = plan.segments.flatMap((segment) => segment.colliders);
  const failures: string[] = [];

  for (const segment of placed) {
    for (const side of [-1, 1] as const) {
      const run = rideAlongside(segment, side, barriers);
      const floor = TERRAIN.wallStandoff * 0.5;
      const name = `${segment.spec.id} ${side > 0 ? 'left' : 'right'}`;
      if (run.closest < floor) {
        failures.push(`${name}: reached ${run.closest.toFixed(3)} m of the face (floor ${floor.toFixed(3)})`);
      }
      if (run.crashed) failures.push(`${name}: a scrape became a crash`);
      if (run.covered < segment.spec.length * 0.8) {
        failures.push(`${name}: snagged after ${run.covered.toFixed(0)} of ${segment.spec.length.toFixed(0)} m`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('the shoulder strip outside each authored gate is rideable without a wedge', () => {
  const barriers = plan.segments.flatMap((segment) => segment.colliders);
  const strip = TRACK.halfWidth - TRACK.barrierOffset - TRACK.barrierHalfLateral;
  assert.ok(strip > TERRAIN.wallStandoff * 2, `the outside strip is only ${strip.toFixed(2)} m`);

  for (const gate of BARRIER_GATES) {
    const segment = bySegment.get(gate.segment);
    assert.ok(segment !== undefined);
    const run = rideAlongside(segment, gate.side, barriers, { outside: true });
    assert.equal(run.crashed, false, `${gate.what}: the outside shoulder caused a crash`);
    assert.ok(
      run.covered > segment.spec.length * 0.8,
      `${gate.what}: the outside shoulder wedged the rider after ${run.covered.toFixed(1)} m`,
    );
    assert.ok(
      run.closest > TERRAIN.wallStandoff * 0.5,
      `${gate.what}: the outside line reached ${run.closest.toFixed(3)} m from a barrier face`,
    );
  }
});

test('the barrier fixture can fail, so its silence means something', () => {
  // The M17 control. With the standoff switched off the same run puts the
  // centreline on the face — which is what the assertion above is claiming
  // does not happen, and the only way to know it is measuring the standoff
  // rather than something else that happens to hold the rider out.
  const barriers = plan.segments.flatMap((segment) => segment.colliders);
  const sweeper = bySegment.get('sweeper');
  assert.ok(sweeper !== undefined);
  const off = rideAlongside(sweeper, 1, barriers, { wallStandoff: 0 });
  const on = rideAlongside(sweeper, 1, barriers);
  assert.ok(off.closest < on.closest - 0.1, `standoff bought only ${(on.closest - off.closest).toFixed(3)} m`);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SAT penetration of two actual yawed box footprints; positive means overlap. */
function footprintPenetration(a: BoxCollider, b: BoxCollider): number {
  const axes = [
    { x: Math.cos(a.rotationY), z: -Math.sin(a.rotationY) },
    { x: Math.sin(a.rotationY), z: Math.cos(a.rotationY) },
    { x: Math.cos(b.rotationY), z: -Math.sin(b.rotationY) },
    { x: Math.sin(b.rotationY), z: Math.cos(b.rotationY) },
  ];
  const radius = (box: BoxCollider, axis: { x: number; z: number }): number => {
    const lateral = { x: Math.cos(box.rotationY), z: -Math.sin(box.rotationY) };
    const along = { x: Math.sin(box.rotationY), z: Math.cos(box.rotationY) };
    return box.halfExtents.x * Math.abs(axis.x * lateral.x + axis.z * lateral.z)
      + box.halfExtents.z * Math.abs(axis.x * along.x + axis.z * along.z);
  };
  const dx = b.centre.x - a.centre.x;
  const dz = b.centre.z - a.centre.z;
  return Math.min(...axes.map((axis) => radius(a, axis) + radius(b, axis)
    - Math.abs(dx * axis.x + dz * axis.z)));
}

/** Remove the deliberate overlap at both ends without mutating the built plan. */
function shortenBox(box: BoxCollider, joint: number): BoxCollider {
  return {
    ...box,
    halfExtents: { ...box.halfExtents, z: box.halfExtents.z - joint },
  };
}

/**
 * Exterior distance from a world point to a yawed box, in the XZ plane.
 *
 * Negative inside. The box's local +X is the corridor's left and its local +Z
 * runs along the corridor, which is what `collidersOf` builds and what
 * `rotationY` means here (`segments.ts`).
 */
function boxClearance(box: BoxCollider, x: number, z: number): number {
  const dx = x - box.centre.x;
  const dz = z - box.centre.z;
  const cos = Math.cos(box.rotationY);
  const sin = Math.sin(box.rotationY);
  const lateral = Math.abs(dx * cos - dz * sin) - box.halfExtents.x;
  const along = Math.abs(dx * sin + dz * cos) - box.halfExtents.z;
  if (lateral <= 0 && along <= 0) return Math.max(lateral, along);
  return Math.hypot(Math.max(lateral, 0), Math.max(along, 0));
}

interface AlongsideRun {
  /** Closest the machine's centreline came to any barrier face, metres. */
  readonly closest: number;
  /** How far along the segment the run got, metres. */
  readonly covered: number;
  readonly crashed: boolean;
}

/**
 * Ride one side of one corridor pressed against its barrier.
 *
 * A pursuit law rather than a fixed heading, because a fixed heading leaves
 * the barrier within a few metres on any arc and would test the first facet
 * nine times instead of every facet once. The rider aims at a point on the
 * target line ahead of them, which is the same shape as the browser toolkit's
 * route follower and has the same two gains and no eyes.
 */
function rideAlongside(
  segment: PlacedSegment,
  side: 1 | -1,
  barriers: readonly BoxCollider[],
  options?: { wallStandoff?: number; outside?: boolean },
): AlongsideRun {
  const spec = segment.spec;
  // A fifth of a metre off the face, which is inside the standoff: the
  // controller has to push back, and if it does not, the machine is in the
  // barrier.
  const target = side * (options?.outside === true
    ? TRACK.barrierOffset + TRACK.barrierHalfLateral + 0.2
    : TRACK.barrierOffset - TRACK.barrierHalfLateral - 0.2);
  const start = centrelineAt(segment.entry, spec, 1.5);
  const left = leftOf(headingAt(segment.entry, spec, 1.5));

  const euc = new EucController(new PlanTerrainSampler({ ...plan, checkpoints: [] }), {
    spawn: {
      position: { x: start.x + left.x * target, y: start.y, z: start.z + left.z * target },
      headingY: headingAt(segment.entry, spec, 1.5),
    },
    ...(options?.wallStandoff === undefined ? {} : { tuning: { wallStandoff: options.wallStandoff } }),
  });

  // Slow enough that the corner is not what stops the run: the fixture is
  // about the barrier, so the rider holds a speed the *barrier line's* own
  // radius supports rather than the centreline's, at three quarters of its
  // lateral limit.
  const curvature = spec.curvature ?? 0;
  const lineRadius = curvature === 0
    ? 1e4
    : 1 / Math.abs(curvature) - target * Math.sign(curvature);
  const cruise = Math.min(9, cornerSpeed(Math.max(3, lineRadius)) * 0.75);

  let closest = Infinity;
  let covered = 0;
  let crashed = false;

  for (let step = 0; step < 120 * 60; step += 1) {
    const now = euc.snapshot();
    const here = querySegment(segment, now.position.x, now.position.z);
    if (here === null) break;
    covered = Math.max(covered, here.s);
    if (here.s > spec.length - 1.5) break;

    // Aim at the target line a look-ahead in front, then steer at the bearing
    // error. Steering right is a negative yaw rate, so a positive bearing
    // error — a target to the rider's left — wants a negative steer.
    const ahead = Math.min(spec.length, here.s + 6);
    const point = centrelineAt(segment.entry, spec, ahead);
    const aim = leftOf(headingAt(segment.entry, spec, ahead));
    const goalX = point.x + aim.x * target;
    const goalZ = point.z + aim.z * target;
    // `forward = (sin h, cos h)` and `left = (cos h, -sin h)`, so a positive
    // bearing is a goal on the rider's left.
    const toX = goalX - now.position.x;
    const toZ = goalZ - now.position.z;
    const bearing = Math.atan2(
      Math.cos(now.headingY) * toX - Math.sin(now.headingY) * toZ,
      Math.sin(now.headingY) * toX + Math.cos(now.headingY) * toZ,
    );
    const steer = Math.max(-1, Math.min(1, -bearing * 2.2));
    euc.step(STEP, actions({ throttle: now.speed < cruise ? 1 : 0, steer }));

    const after = euc.snapshot();
    if (after.crashed) crashed = true;
    if (here.s > 2) {
      for (const box of barriers) {
        closest = Math.min(closest, boxClearance(box, after.position.x, after.position.z));
      }
    }
  }

  return { closest, covered, crashed };
}

/** Speed after accelerating from `from` over `distance` on flat asphalt. */
function speedAfter(from: number, distance: number): number {
  const drive = Math.sin(EUC.maxLeanPitch) * EUC.leanToAccel;
  let speed = from;
  const step = 0.25;
  for (let along = 0; along < distance; along += step) {
    const accel = drive - EUC.dragCoefficient * speed * speed - SURFACES.pavement.rollingResistance;
    speed = Math.sqrt(Math.max(0, speed * speed + 2 * Math.max(0, accel) * step));
  }
  return speed;
}

/**
 * The lap, modelled: a forward pass at the drive curve and a backward pass at
 * the brake curve over the corner speed caps, relaxed until it is periodic.
 *
 * The standard racing-line estimate, and deliberately optimistic — it assumes
 * a perfect line and perfect braking, so a real ride is slower than this and a
 * model inside the 40–70 s band leaves the real lap inside it.
 */
function modelledLapSeconds(): number {
  const drive = Math.sin(EUC.maxLeanPitch) * EUC.leanToAccel;
  const brake = Math.sin(EUC.maxLeanPitch) * EUC.brakeAuthority;
  const step = 1;
  const points: { ds: number; cap: number }[] = [];
  for (const element of TRACK_GEOMETRY) {
    const count = Math.max(1, Math.round(element.length / step));
    const cap = element.turn === 0
      ? TOP_SPEED * EUC.cutoutSpeedShare
      : Math.min(TOP_SPEED * EUC.cutoutSpeedShare, cornerSpeed(element.radius));
    for (let index = 0; index < count; index += 1) points.push({ ds: element.length / count, cap });
  }

  const speeds = points.map((point) => point.cap);
  for (let pass = 0; pass < 6; pass += 1) {
    for (let index = 0; index < speeds.length; index += 1) {
      const before = speeds[(index - 1 + speeds.length) % speeds.length];
      const accel = Math.max(0, drive - EUC.dragCoefficient * before * before - SURFACES.pavement.rollingResistance);
      speeds[index] = Math.min(speeds[index], Math.sqrt(before * before + 2 * accel * points[index].ds));
    }
    for (let index = speeds.length - 1; index >= 0; index -= 1) {
      const after = speeds[(index + 1) % speeds.length];
      const decel = brake + EUC.dragCoefficient * after * after + SURFACES.pavement.rollingResistance;
      speeds[index] = Math.min(speeds[index], Math.sqrt(after * after + 2 * decel * points[index].ds));
    }
  }

  return points.reduce((total, point, index) => total + point.ds / speeds[index], 0);
}

// ---------------------------------------------------------------------------
// The lap envelope — Phase B2
// ---------------------------------------------------------------------------

test('the venue emits a lap envelope, and it is the ring the geometry states', () => {
  // **A venue that meant to be a circuit says so here.** `buildPlan` answers
  // "is this a ring" by measuring, and answers *no* by emitting nothing — which
  // is right for a fixture and would be a silent catastrophe for BelVar: Track
  // Day's entrance asks for an envelope and would simply decline the venue,
  // with no error anywhere and a title-screen button that stopped working.
  const lap = plan.lap;
  assert.ok(lap !== undefined, 'BelVar emitted no lap, so Track Day would refuse it');

  assert.ok(
    Math.abs(lap.length - TRACK_LAP_METRES) < 1,
    `the sampled ring is ${lap.length.toFixed(1)} m against the authored ${TRACK_LAP_METRES.toFixed(1)}`,
  );
  assert.equal(lap.points[0].x, lap.points[lap.points.length - 1].x);
  assert.equal(lap.points[0].z, lap.points[lap.points.length - 1].z);
  for (const point of lap.points) {
    assert.equal(point.halfWidth, TRACK.halfWidth, 'a corridor is not the authored width');
  }

  // The paddock is rideable ground on the same plan and is deliberately not on
  // it: the envelope is the *racing surface*, and the branch that reaches the
  // infield must never read as a piece of the lap.
  const paddockIds = new Set(['paddock', 'paddock-road']);
  const lapIds = new Set(TRACK_LAP_SEGMENT_IDS);
  for (const id of paddockIds) {
    assert.ok(!lapIds.has(id), `"${id}" is on the lap`);
  }
  assert.equal(
    plan.segments.length,
    TRACK_LAP_SEGMENT_IDS.length + paddockIds.size,
    'the plan grew a corridor nobody classified as lap or paddock',
  );
});

test('every sector gate stands on the envelope it is judged against', () => {
  // The two are resolved by different code from the same corridors, so a
  // divergence would be silent: a gate a metre off the sampled line is a gate
  // the referee expects to be crossed at a place the envelope calls off-track.
  const lap = plan.lap!;
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
      best = Math.min(best, Math.hypot(
        gate.centre.x - (a.x + dx * t),
        gate.centre.z - (a.z + dz * t),
      ));
    }
    assert.ok(best < 0.05, `${gate.id} sits ${(best * 1000).toFixed(0)} mm off the lap line`);
  }
});
