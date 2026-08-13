/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  HAZARD_SURFACE_IDS,
  SURFACES,
  SURFACE_IDS,
  TERRAIN_SURFACE_IDS,
} from '../data/surfaces.ts';
import { MARKINGS, PAINTABLE_SURFACES } from '../data/markings.ts';
import {
  BUILDING_CLEARANCE,
  PROP_FOOTPRINTS,
  PROP_SOLIDS,
  PROP_SPREADS,
  PROP_VERTICAL_SPANS,
} from '../data/props.ts';
import { CHALLENGE, EUC, PHYSICS, TERRAIN, WHEEL } from '../data/tuning.ts';
import { insideCheckpoint } from '../simulation/challenge.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type SurfaceId } from '../simulation/world.ts';
import { buildLevelPlan, fieldHeightAt, planColliders, planSolids } from './buildPlan.ts';
import { createProvingGround } from './provingGround.ts';
import { cellCount, type Checkpoint, type LevelPlan } from './plan.ts';
import {
  ALLEY_ROUTE,
  SAFE_ROUTE,
  SLICE_BEATS,
  SLICE_CHECKPOINTS,
  SLICE_FOOTPRINT,
  SLICE_GRAPH,
  SLICE_POCKETS,
  createSliceLevel,
} from './sliceLevel.ts';
import {
  centrelineAt,
  headingAt,
  leftOf,
  placeGraph,
  propsOf,
  querySegment,
  surfaceHeightAt,
  type PlacedSegment,
} from './segments.ts';

/**
 * The vertical-slice level — M7.
 *
 * **These are the checks `docs/PLANS.md` §2.5 will make binding at M12**, written
 * a milestone early and against a hand-authored level, because that is the only
 * time they can be debugged against geometry somebody chose on purpose. Master
 * §6's contract asks a generator to "validate what cannot be seen": every jump
 * landable at the speed the approach produces, every shortcut reconnecting to
 * the main route, no gap narrower than the wheel can pass, no unrideable
 * gradient on the required path. All four are below, plus the two properties
 * that only a *closed* route has — that the loop comes home, and that no two
 * corridors cross at a height difference the wheel cannot deal with.
 *
 * Nothing here imports three.js, so all of it runs under `node --test`.
 */

const plan = createSliceLevel();
const sampler = new PlanTerrainSampler(plan);
const sample = createGroundSample();
const placed = placeGraph(SLICE_GRAPH, plan.spawn);
const byId = new Map<string, PlacedSegment>(placed.map((each) => [each.spec.id, each]));

/** The wheel's own numbers, derived rather than restated. */
const STEP_UP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
const HOP_HEIGHT = (EUC.hopLaunchSpeed ** 2) / (2 * PHYSICS.gravity);
const CHARGED_HOP = HOP_HEIGHT * (1 + EUC.hopChargeHeightBonus);

function segment(id: string): PlacedSegment {
  const found = byId.get(id);
  assert.ok(found !== undefined, `no segment "${id}"`);
  return found;
}

/** The world-space colliders a segment carries, from the emitted plan. */
function collidersOf(id: string): LevelPlan['segments'][number]['colliders'] {
  const found = plan.segments.find((each) => each.id === id);
  assert.ok(found !== undefined, `no segment "${id}" in the plan`);
  return found.colliders;
}

function surfaceAt(x: number, z: number): SurfaceId {
  sampler.sampleGround(x, z, sample);
  return sample.surface;
}

function heightAt(x: number, z: number): number {
  sampler.sampleGround(x, z, sample);
  return sample.height;
}

/** A world point on a segment's rideable surface. */
function pointOn(id: string, s: number, t = 0): { x: number; z: number; y: number } {
  const target = segment(id);
  const heading = headingAt(target.entry, target.spec, s);
  const centre = centrelineAt(target.entry, target.spec, s);
  const left = leftOf(heading);
  return {
    x: centre.x + left.x * t,
    z: centre.z + left.z * t,
    y: surfaceHeightAt(target.entry, target.spec, s, t),
  };
}

// ---------------------------------------------------------------------------
// The brief: ten beats, two routes, three pockets
// ---------------------------------------------------------------------------

test('all ten beats of the brief exist, and every one names real segments', () => {
  assert.equal(SLICE_BEATS.length, 10);
  SLICE_BEATS.forEach((beat, index) => {
    assert.equal(beat.index, index + 1, 'the beats are out of order');
    assert.ok(beat.segments.length > 0, `beat ${beat.index} has no geometry`);
    for (const id of beat.segments) assert.ok(byId.has(id), `beat ${beat.index} names "${id}"`);
  });

  // And every authored segment belongs to a beat or to a pocket, so nothing is
  // in the world that the level's own index cannot account for.
  const claimed = new Set([
    ...SLICE_BEATS.flatMap((beat) => beat.segments),
    ...SLICE_POCKETS.flatMap((pocket) => pocket.segments),
  ]);
  for (const each of placed) assert.ok(claimed.has(each.spec.id), `${each.spec.id} is orphaned`);
});

test('the three off-route pockets are present and off the route', () => {
  assert.equal(SLICE_POCKETS.length, 3);
  const onRoute = new Set(SLICE_BEATS.flatMap((beat) => beat.segments));
  for (const pocket of SLICE_POCKETS) {
    assert.ok(pocket.segments.length > 0, `${pocket.name} has no geometry`);
    for (const id of pocket.segments) {
      assert.ok(byId.has(id), `${pocket.name} names "${id}"`);
      assert.ok(!onRoute.has(id), `${pocket.name} is on the route`);
    }
  }
});

test('every socket still reports the five things a generator needs', () => {
  for (const each of plan.segments) {
    for (const socket of [each.entry, each.exit]) {
      assert.ok(SURFACE_IDS.includes(socket.surface), `${each.id} socket surface`);
      assert.ok(socket.halfWidth > 0, `${each.id} socket width`);
      assert.ok(Number.isFinite(socket.headingY), `${each.id} socket heading`);
      assert.ok(Number.isFinite(socket.gradient), `${each.id} socket gradient`);
      assert.ok(Number.isFinite(socket.position.y), `${each.id} socket elevation`);
    }
  }
});

test('every terrain surface is ridden somewhere in the slice, and no hazard surface is', () => {
  // Painted ground *or* the top face of something standing on it — the ford's
  // bridge is the only wood in the level and it is a deck, not a corridor.
  //
  // **Narrowed to the terrain palette at M13, and it lost no teeth doing it.**
  // The guard exists so that a surface cannot be declared, tuned, given a
  // particle and a tyre voice and then be ridden nowhere, and all seven of the
  // surfaces a level is *built* from are still required here. What a hazard
  // surface is exempt from is being in a corridor at all: nothing declares it
  // and no verge band chooses it, `buildPlan` paints it inside a `Hazard`
  // circle, and by the owner's §13 q9 answer the slice carries none — it is the
  // known-good reference the whole project is measured against and, by q5, every
  // new player's first ride, so it gets a hazard-free ramp and a fresh route is
  // where spills are met. Its coverage is with the machinery that can produce
  // one: `buildPlan.test.ts`'s "a spill paints the cells under it and leaves
  // every other cell alone", and the generated-route suites.
  //
  // The second half is the half that would otherwise go unchecked. Nothing else
  // in this file would notice a spill arriving in the slice, and one that did
  // would be a corridor the rider wobbles on with no hazard drawn under it.
  const ridden = new Set<SurfaceId>([
    ...plan.heightfield.surfaces,
    ...planColliders(plan).map((collider) => collider.surface),
  ]);
  for (const id of TERRAIN_SURFACE_IDS) {
    assert.ok(ridden.has(id), `${id} is declared but never ridden`);
  }
  for (const id of HAZARD_SURFACE_IDS) {
    assert.ok(!ridden.has(id), `${id} is in the slice, which §13 q9 keeps hazard-free`);
  }
  assert.equal(plan.hazards, undefined, 'the slice carries no hazards at all');
  // §13 q12, M14: Knockabout targets are generated-routes-only on the same
  // terms, and `undefined` rather than `[]` is the assertion that matters —
  // an empty array is a different plan with a different digest, and the pinned
  // slice digest is what this milestone is not allowed to move.
  assert.equal(plan.targets, undefined, 'the slice carries no targets at all');
});

// ---------------------------------------------------------------------------
// Beat 4: the fork actually forks, and the shortcut actually rejoins
// ---------------------------------------------------------------------------

test('both routes leave the fork and arrive at the park gate, to the millimetre', () => {
  const fork = segment('fork');
  const gate = segment('park-gate');

  for (const route of [SAFE_ROUTE, ALLEY_ROUTE]) {
    const first = segment(route[0]);
    const last = segment(route[route.length - 1]);

    assert.ok(
      Math.hypot(
        first.entry.position.x - fork.exit.position.x,
        first.entry.position.z - fork.exit.position.z,
      ) < 1e-6,
      `${route[0]} does not start at the fork`,
    );
    // The rejoin is the property master §6 makes binding at M12: "every shortcut
    // reconnecting to the main route". Authored to close in closed form rather
    // than to a tolerance, so a millimetre is a generous bound.
    assert.ok(
      Math.hypot(
        last.exit.position.x - gate.entry.position.x,
        last.exit.position.z - gate.entry.position.z,
      ) < 1e-3,
      `${route[route.length - 1]} misses the park gate`,
    );
    assert.ok(Math.abs(last.exit.position.y - gate.entry.position.y) < 1e-6, 'rejoin elevation');
    assert.ok(Math.abs(last.exit.headingY - gate.entry.headingY) < 1e-9, 'rejoin heading');
  }
});

test('the alley is the shorter way round, by enough to be worth the risk', () => {
  const length = (ids: readonly string[]): number => ids
    .reduce((total, id) => total + segment(id).spec.length, 0);

  const safe = length(SAFE_ROUTE);
  const alley = length(ALLEY_ROUTE);
  assert.ok(safe > alley * 1.6, `the road is only ${(safe / alley).toFixed(2)}x the alley`);
  // And narrow enough that the rider pays for it in speed rather than distance.
  const widest = Math.max(...ALLEY_ROUTE.map((id) => segment(id).spec.halfWidth));
  const road = Math.min(...SAFE_ROUTE.map((id) => segment(id).spec.halfWidth));
  assert.ok(widest * 2 < road, `the alley is ${widest * 2} m wide against the road's ${road * 2}`);
});

test('the alley’s three steps are drops the wheel cannot climb back up', () => {
  const steps = segment('alley-steps');
  const tops = collidersOf('alley-steps')
    .filter((collider) => collider.halfExtents.y < 1)
    .map((collider) => collider.centre.y + collider.halfExtents.y)
    .sort((a, b) => b - a);

  assert.equal(tops.length, 3, 'the alley does not have three steps');
  // Level with the alley above, and each one a real step below the last.
  assert.ok(Math.abs(tops[0] - steps.entry.position.y) < 1e-9, 'the first step is not flush');
  for (let i = 1; i < tops.length; i += 1) {
    const drop = tops[i - 1] - tops[i];
    assert.ok(drop > STEP_UP, `step ${i} is only ${drop.toFixed(3)} m — the wheel could ride it`);
    assert.ok(drop > TERRAIN.dropLaunchThreshold, `step ${i} would not launch`);
  }
  const last = tops[tops.length - 1] - steps.exit.position.y;
  assert.ok(last > STEP_UP, `the last step is only ${last.toFixed(3)} m`);
});

// ---------------------------------------------------------------------------
// Beat 9: the kicker is landable at the speed its approach produces
// ---------------------------------------------------------------------------

test('the kicker’s lip is a genuine ledge over ground a rider can land on', () => {
  const run = segment('kicker-run');
  const landing = segment('kicker-land');
  const lip = collidersOf('kicker-run')[0];
  assert.ok(lip !== undefined, 'the kicker has no lip');

  const top = lip.centre.y + lip.halfExtents.y;
  const drop = top - landing.entry.position.y;
  assert.ok(Math.abs(drop - 1.20) < 1e-6, `the drop is ${drop.toFixed(3)} m, not 1.20`);

  // Master §6: "every jump landable at the speed the approach actually
  // produces". The approach is a 1.05 m climb on dirt, so a rider arrives at
  // well under top speed; the closing speed along the normal is what the landing
  // score reads, and a square landing has to stay inside the crash tier.
  const closing = Math.sqrt(2 * PHYSICS.gravity * drop);
  const impact = closing / EUC.landingImpactReference;
  const surface = (SURFACES.dirt.roughnessAmplitude / EUC.landingRoughnessReference)
    * EUC.landingSurfaceWeight;
  assert.ok(impact + surface < EUC.landingCrashScore, 'a square landing would crash');
  assert.ok(impact + surface > EUC.landingHeavyScore * 0.8, 'the kicker is not worth taking');

  // The landing corridor is under the lip and wider than the mound, so a rider
  // who drifts still meets ground rather than the mound's flank.
  assert.ok(landing.spec.halfWidth >= run.spec.halfWidth, 'the landing is narrower than the ramp');
  const flight = pointOn('kicker-land', 6);
  assert.ok(Math.abs(flight.y - landing.entry.position.y) < 1e-6, 'the landing is not flat');
});

test('the chicken line rejoins the landing exactly, and is not the faster way', () => {
  const chicken = segment('chicken-out');
  const landing = segment('kicker-land');
  // Where the S-bend puts the rider, measured against the landing's corridor.
  const query = querySegment(landing, chicken.exit.position.x, chicken.exit.position.z);
  assert.ok(query !== null && query.outside < 1e-6, 'the chicken line does not rejoin');
  assert.ok(Math.abs(chicken.exit.headingY - landing.exit.headingY) < 1e-9, 'it rejoins askew');

  const around = ['chicken-lead', 'chicken-in', 'chicken-out']
    .reduce((total, id) => total + segment(id).spec.length, 0);
  const over = segment('kicker-run').spec.length + query.s;
  assert.ok(around > over, 'the chicken line is shorter than the jump it avoids');
});

// ---------------------------------------------------------------------------
// The pockets, each of which is a wheel measurement rather than a taste
// ---------------------------------------------------------------------------

test('the alley-only ledge needs a charged hop, and cannot be rolled onto', () => {
  const ledge = segment('alley-ledge');
  const alley = segment('alley-upper');
  const rise = ledge.entry.position.y - alley.entry.position.y;

  assert.ok(rise > STEP_UP, `${rise.toFixed(2)} m can be ridden up — that is not a ledge`);
  assert.ok(rise > HOP_HEIGHT, 'a plain hop reaches it, so the crouch is pointless');
  assert.ok(rise < CHARGED_HOP, `${rise.toFixed(2)} m is above even a charged hop`);

  // A zero shoulder is what makes it a ledge rather than a ramp: one cell out,
  // the ground is back at the surround.
  assert.equal(ledge.spec.shoulder, 0);
  const off = pointOn('alley-ledge', 11, ledge.spec.halfWidth + 2);
  assert.ok(heightAt(off.x, off.z) < ledge.entry.position.y - 0.4, 'the ledge has a ramp on it');
});

test('the two low walls are one the wheel can mount and one it cannot', () => {
  const terrace = segment('terrace');
  const tops = collidersOf('terrace')
    .filter((collider) => collider.halfExtents.y < 1)
    .map((collider) => collider.centre.y + collider.halfExtents.y - terrace.entry.position.y);

  assert.ok(tops.some((top) => top < STEP_UP), 'no wall a rider can simply ride onto');
  assert.ok(tops.some((top) => top > STEP_UP && top < HOP_HEIGHT), 'no wall that has to be hopped');
  // Narrow enough that staying on one is the point.
  for (const collider of collidersOf('terrace')) {
    if (collider.halfExtents.y > 1) continue;
    assert.ok(collider.halfExtents.x < 1, 'a wall two metres wide is a floor');
  }
});

test('the drainage swale is a channel a rider can get out of again', () => {
  const drain = segment('drain-run');
  assert.ok((drain.spec.crown ?? 0) < 0, 'the swale does not hollow');

  const floor = pointOn('drain-run', drain.spec.length / 2, 0);
  const bank = pointOn('drain-run', drain.spec.length / 2, drain.spec.halfWidth);
  assert.ok(bank.y > floor.y + 0.3, 'the swale has no banks');

  // The bank's gradient against what the wheel can actually climb: full drive is
  // `leanToAccel * sin(maxLeanPitch)`, and gravity along the slope must be less.
  const drive = EUC.leanToAccel * Math.sin(EUC.maxLeanPitch);
  const rise = (bank.y - floor.y) + (drain.spec.shoulder ?? 0) * 0;
  const gradient = Math.atan(rise / drain.spec.halfWidth);
  assert.ok(
    PHYSICS.gravity * Math.sin(gradient) < drive,
    `the swale's ${(gradient * 57.3).toFixed(0)}° bank cannot be climbed out of`,
  );
});

// ---------------------------------------------------------------------------
// The route as a whole
// ---------------------------------------------------------------------------

test('the loop comes home: the return ramp arrives inside the plaza', () => {
  const home = segment('return-plaza');
  const plaza = segment('plaza');
  const arrival = querySegment(plaza, home.exit.position.x, home.exit.position.z);

  assert.ok(arrival !== null, 'the return ramp ends nowhere near the plaza');
  assert.equal(arrival.outside, 0, 'the return ramp ends outside the plaza');
  assert.ok(Math.abs(home.exit.position.y - plaza.entry.position.y) < 1e-6, 'and at a step');
});

test('every rideable route is clear down its own centreline', () => {
  // Master §6's "no gap narrower than the wheel can pass", in the form this
  // level can actually get wrong: a block authored relative to a *curving*
  // segment ends up somewhere the author did not picture, and a wall placed on
  // the outside of the alley's mouth stands in the road the shortcut just left.
  // That is exactly what the first draft did, and only a ride found it.
  //
  // Both routes plus the pockets, because a pocket a rider cannot enter is not
  // a pocket. The whole corridor width is swept, not just the centre: a corridor
  // whose middle is clear and whose sides are walled is a corridor, and one with
  // a bollard down the middle is a mistake.
  const routes = [
    ...SLICE_BEATS.flatMap((beat) => beat.segments),
    ...SLICE_POCKETS.flatMap((pocket) => pocket.segments),
  ];

  // **What counts as an obstruction is a wall, not a step.** Kerbs, the alley's
  // steps, the roots, the rocks, and the bridge deck are all deliberately proud
  // of the corridor and all of them are things a rider rides over, off, or
  // around at a cost. A metre is comfortably above every one of them and far
  // below the 3.4 m of anything authored as a sight-line block, so the threshold
  // separates the two without needing a list of exceptions to keep in step.
  const WALL = 1.0;

  for (const id of routes) {
    const each = segment(id);
    let clearLane = 0;
    const halfWidth = each.spec.halfWidth;
    for (let t = -halfWidth; t <= halfWidth; t += 0.5) {
      let clear = true;
      for (let s = 0; s <= each.spec.length; s += 1) {
        const point = pointOn(id, s, t);
        if (heightAt(point.x, point.z) > point.y + WALL) { clear = false; break; }
      }
      if (clear) clearLane += 0.5;
    }
    assert.ok(
      clearLane > Math.min(1.6, halfWidth),
      `${id} has only ${clearLane.toFixed(1)} m of clear lane across ${halfWidth * 2} m`,
    );
  }
});

test('no gradient on the required route is steeper than the wheel can climb', () => {
  // Master §6's "no unrideable gradient on the required path", against the drive
  // authority rather than against a written-down angle.
  const drive = EUC.leanToAccel * Math.sin(EUC.maxLeanPitch);
  for (const each of placed) {
    const climb = each.spec.climb ?? 0;
    if (climb <= 0) continue;
    // The eased profile's peak gradient is 1.5x its average.
    const peak = Math.atan((climb / each.spec.length) * (each.spec.linearClimb === true ? 1 : 1.5));
    assert.ok(
      PHYSICS.gravity * Math.sin(peak) < drive * 0.85,
      `${each.spec.id} peaks at ${(peak * 57.3).toFixed(1)}°, which the wheel cannot hold`,
    );
  }
});

test('the return climb is steep enough to make the power ladder speak', () => {
  // M6's evidence was taken on an 11° gradient. The slice has to give the ladder
  // something to do or beat 10 teaches nothing.
  const climb = segment('return-climb');
  const peak = Math.atan(((climb.spec.climb ?? 0) / climb.spec.length) * 1.5);
  assert.ok(peak > 0.15, `the return climb only reaches ${(peak * 57.3).toFixed(1)}°`);
});

test('every corner is inside the grip of the surface it is on', () => {
  // The lateral ceiling is `maxLateralG * grip * g`, and a corner the ground
  // refuses is a corner that throws the rider into a wall rather than teaching
  // them anything. Checked at the speed each surface can actually sustain, which
  // is what its own rolling resistance decides.
  for (const each of placed) {
    const curvature = Math.abs(each.spec.curvature ?? 0);
    if (curvature === 0) continue;
    const surface = SURFACES[each.spec.surface];
    const ceiling = EUC.maxLateralG * surface.grip * PHYSICS.gravity;
    // **A corner is allowed to be slower than flat out — that is what a corner
    // is.** What it may not be is a corner nobody can carry speed through: the
    // alley's two right angles are deliberately the shortcut's speed limiter,
    // and the berm is deliberately tight. So the bound is on the corner's own
    // limit speed rather than on the surface's top speed, and it is set at the
    // wheel's carve speed, above which yaw authority has fully decayed and the
    // corner starts reading as a corner rather than as a pivot.
    const limit = Math.sqrt(ceiling / curvature);
    assert.ok(
      limit > EUC.carveSpeed,
      `${each.spec.id}: R=${(1 / curvature).toFixed(1)} m on ${each.spec.surface} caps at `
      + `${limit.toFixed(1)} m/s, below the ${EUC.carveSpeed} m/s carve speed`,
    );
  }
});

test('no two corridors cross at a step the rider cannot hop', () => {
  // The property a closed route has and an open one does not: 1,347 m of course
  // inside a 260 x 354 m footprint has to fold, and a fold that puts two
  // corridors on the same ground at different heights is a cliff nothing draws.
  //
  // One crossing is authored on purpose — the kicker's mound stands over its own
  // landing, which is the entire beat — so it is named rather than excluded by a
  // threshold that would also hide a mistake.
  const intended = new Set(['kicker-run']);
  let worst = { pair: '', drop: 0 };

  for (const a of placed) {
    for (let s = 0; s <= a.spec.length; s += 1) {
      for (let t = -a.spec.halfWidth; t <= a.spec.halfWidth; t += 1) {
        const heading = headingAt(a.entry, a.spec, s);
        const centre = centrelineAt(a.entry, a.spec, s);
        const left = leftOf(heading);
        const x = centre.x + left.x * t;
        const z = centre.z + left.z * t;
        const y = surfaceHeightAt(a.entry, a.spec, s, t);

        for (const b of placed) {
          if (b === a || intended.has(a.spec.id) || intended.has(b.spec.id)) continue;
          const query = querySegment(b, x, z);
          if (query === null || query.outside > 0) continue;
          const drop = Math.abs(query.height - y);
          if (drop > worst.drop) worst = { pair: `${a.spec.id} / ${b.spec.id}`, drop };
        }
      }
    }
  }

  assert.ok(
    worst.drop < HOP_HEIGHT,
    `${worst.pair} crosses at ${worst.drop.toFixed(2)} m, which is above a hop`,
  );
});

test('the world stays inside the budget it shares with the rider', () => {
  const field = plan.heightfield;
  let drawn = 0;
  const cellColumns = field.columns - 1;
  for (let row = 0; row < field.rows - 1; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
      const cell = row * cellColumns + column;
      if (field.surfaces[cell] !== plan.surround.surface) {
        drawn += 1;
        continue;
      }
      const base = row * field.columns + column;
      if (
        field.heights[base] !== plan.surround.height
        || field.heights[base + 1] !== plan.surround.height
        || field.heights[base + field.columns] !== plan.surround.height
        || field.heights[base + field.columns + 1] !== plan.surround.height
      ) drawn += 1;
    }
  }

  assert.ok(drawn * 2 < 200_000, `the ground alone would draw ${drawn * 2} triangles`);
  assert.ok(
    drawn < cellCount(field) * 0.6,
    `${drawn} of ${cellCount(field)} cells are drawn — the surround skip is not firing`,
  );
  // Authored blocks are drawn as boxes by `render/terrain.ts`, so their count is
  // a draw-call and triangle cost. It stopped being a *step* cost at M8.6, when
  // the sampler's linear walk became a uniform grid and per-query work started
  // tracking local density instead of the level's total.
  assert.ok(planColliders(plan).length < 200, 'too many authored blocks to draw');
});

test('the slice is the size the brief asks for, and dense rather than large', () => {
  const field = plan.heightfield;
  const width = (field.columns - 1) * field.spacing;
  const depth = (field.rows - 1) * field.spacing;
  // §6 asks for "roughly 350 m x 250 m ... density over size". The footprint
  // below is that area within a few per cent, on a different aspect: the loop
  // came out taller and narrower than the brief's sketch.
  assert.ok(width < 400 && depth < 400, `${width} x ${depth} m is not compact`);
  assert.ok(width * depth < 110_000, `${(width * depth / 1000).toFixed(0)}k m² is too much ground`);

  const route = SLICE_BEATS
    .flatMap((beat) => beat.segments)
    .reduce((total, id) => total + segment(id).spec.length, 0);
  assert.ok(route > 1100, `the route is only ${route.toFixed(0)} m — too short for three minutes`);
});

test('the rider spawns in the plaza on brick, facing the arch', () => {
  assert.deepEqual(plan.spawn.position, { x: 0, y: 0, z: 0 });
  assert.equal(plan.spawn.headingY, 0);
  assert.equal(surfaceAt(0, 0), 'brick');
  assert.equal(heightAt(0, 0), 0);
  assert.equal(plan.segments[0].id, 'plaza');
  // Nothing to hit for the first ten metres: the first thing a new rider does is
  // find the throttle, and a plaza that punishes that teaches the wrong lesson.
  for (let z = 0; z <= 10; z += 2) assert.equal(heightAt(0, z), 0, `something is at z = ${z}`);
});

test('rebuilding the slice produces the same world every time', () => {
  const again = createSliceLevel();
  assert.deepEqual(again.heightfield.heights, plan.heightfield.heights);
  assert.deepEqual(again.heightfield.surfaces, plan.heightfield.surfaces);
  assert.deepEqual(planColliders(again), planColliders(plan));
});

// ---------------------------------------------------------------------------
// M7.5: the dressing, and what it does and does not move
// M8.6: the solid half of it
// ---------------------------------------------------------------------------

test('the props move no ground, and only the solid kinds become colliders', () => {
  // **The contract as it stands after M8.6, proved rather than asserted.** The
  // same graph is built twice, once with every `props` array stripped out of
  // every spec and the world-space dressing omitted.
  //
  // Two things have to hold, and they used to be one. The *terrain* is still
  // untouched by dressing — same heights, same surfaces, same authored blocks —
  // because a prop is placed against the finished ground and never alters it.
  // What changed is that the solid kinds now contribute `plan.solids`, so the
  // bare plan carries none and the dressed one carries exactly one per solid
  // prop. A soft kind contributing a collider, or a solid kind failing to,
  // fails here rather than under somebody's wheel.
  const bare = buildLevelPlan(
    {
      main: SLICE_GRAPH.main.map(({ props: _props, ...rest }) => rest),
      branches: (SLICE_GRAPH.branches ?? []).map((branch) => ({
        ...branch,
        specs: branch.specs.map(({ props: _props, ...rest }) => rest),
      })),
    },
    { id: plan.id, spawn: plan.spawn, surround: plan.surround, settleBlocks: true },
  );

  assert.equal(bare.props, undefined, 'a stripped graph still produced dressing');
  assert.equal(bare.solids, undefined, 'a stripped graph still produced solids');
  assert.equal(bare.softBodies, undefined, 'a stripped graph still produced soft bodies');
  assert.deepEqual(bare.heightfield.heights, plan.heightfield.heights, 'the ground moved');
  assert.deepEqual(bare.heightfield.surfaces, plan.heightfield.surfaces, 'a surface changed');
  assert.deepEqual(
    planColliders(bare),
    planColliders(plan),
    'a prop became an authored segment collider',
  );

  const alreadySolid = new Set(
    placed.flatMap(propsOf)
      .filter((prop) => prop.onCollider === true)
      .map((prop) => `${prop.kind}|${prop.x.toFixed(6)}|${prop.z.toFixed(6)}`),
  );
  // M15 splits the contributing kinds: structure goes to `solids`, soft
  // foliage to `softBodies`, still exactly one box per contributing prop.
  const contributing = (plan.props ?? []).filter((prop) => (
    PROP_SOLIDS[prop.kind] !== null
    && !alreadySolid.has(
      `${prop.kind}|${prop.position.x.toFixed(6)}|${prop.position.z.toFixed(6)}`,
    )
  ));
  const expected = contributing.filter((prop) => PROP_SOLIDS[prop.kind]?.soft !== true).length;
  const expectedSoft = contributing.length - expected;
  assert.equal((plan.solids ?? []).length, expected, 'the solid count is not one per solid prop');
  assert.equal(
    (plan.softBodies ?? []).length,
    expectedSoft,
    'the soft-body count is not one per soft prop',
  );
  assert.ok(expected > 0, 'the slice produced no solid dressing at all');
  assert.ok(expectedSoft > 0, 'the slice produced no soft foliage at all');

  // The sampler reads both arrays, so its count is the sum.
  const bareSampler = new PlanTerrainSampler(bare);
  assert.equal(
    sampler.colliderCount - bareSampler.colliderCount,
    expected,
    'the sampler and the plan disagree about how much the dressing added',
  );

  // And end to end: under every prop deliberately represented by existing
  // authored geometry — and under every soft one, whose box the sampler must
  // never see — the ground has to be exactly what the bare plan reports.
  const bareSample = createGroundSample();
  for (const prop of plan.props ?? []) {
    if (PROP_SOLIDS[prop.kind] !== null && PROP_SOLIDS[prop.kind]?.soft !== true) continue;
    sampler.sampleGround(prop.position.x, prop.position.z, sample);
    bareSampler.sampleGround(prop.position.x, prop.position.z, bareSample);
    assert.equal(sample.height, bareSample.height, `the ground moved under a ${prop.kind}`);
    assert.equal(sample.surface, bareSample.surface, `the surface changed under a ${prop.kind}`);
  }
});

test('a rider is stopped by buildings and dragged by shrubs', () => {
  // The owner's M8 ride: "no collision against buildings out in the grass — I
  // went right through them as if they were a projection." A block is the
  // largest object in the level and it has to be there.
  //
  // Asked of the sampler rather than of the plan, because the plan carrying a
  // box proves nothing about whether the simulation can see it: the sampler is
  // the whole of `simulation/`'s window onto the world (invariant 3).
  const buildings = (plan.props ?? []).filter((prop) => prop.kind === 'building');
  assert.ok(buildings.length > 0, 'the slice has no buildings to test');
  for (const building of buildings) {
    sampler.sampleGround(building.position.x, building.position.z, sample);
    const height = building.size?.y ?? 0;
    assert.ok(
      sample.height >= building.position.y + height - 1e-6,
      'the ground under a building is not its roof — a rider would ride through it',
    );
  }

  // The shrub contract, revised twice and now settled at M15. The
  // shared-playtest pass made bushes solid because riding through one read
  // like a projection; the forum then reported the overcorrection — "a
  // collision with a bush now reacts like a boulder". A bush is now *soft*:
  // its box is in `plan.softBodies` where the controller drags on it, it is
  // never in `plan.solids`, and the sampler cannot see it — so no speed can
  // manufacture an obstacle crash against foliage.
  assert.ok(
    !(plan.solids ?? []).some((solid) => solid.surface === 'grass'),
    'a shrub body is still in plan.solids — a bush is a boulder again',
  );
  let shrubSoft = 0;
  for (const shrub of (plan.props ?? []).filter((prop) => prop.kind === 'shrub')) {
    const soft = (plan.softBodies ?? []).find((candidate) => (
      Math.abs(candidate.centre.x - shrub.position.x) < 1e-9
      && Math.abs(candidate.centre.z - shrub.position.z) < 1e-9
    ));
    sampler.sampleGround(shrub.position.x, shrub.position.z, sample);
    if (soft === undefined) {
      // Plaza planters stand on the fountain wall and inherit its collision;
      // their foliage sits on top of it where no wheel can reach.
      assert.ok(sample.height >= shrub.position.y - 1e-6, 'a planter shrub lost its support');
    } else {
      shrubSoft += 1;
      // The dense body reaches over the axle, so a wheel inside it is
      // genuinely *in* the bush — while the ground beneath stays the ground.
      assert.ok(
        soft.centre.y + soft.halfExtents.y
          >= shrub.position.y + PROP_VERTICAL_SPANS.shrub.top * shrub.scale - 1e-6,
        'a soft body does not cover its own shrub',
      );
      assert.ok(
        sample.height < shrub.position.y + 0.5,
        'the ground under a free-standing shrub is raised — its box leaked into the sampler',
      );
    }
  }
  assert.ok(shrubSoft > 100, `only ${shrubSoft} free-standing shrubs are soft`);
});

test('only genuinely view-blocking solids occlude the chase camera', () => {
  // A lamp post is narrower than the rider and crosses the camera's obstruction
  // ray for a handful of frames; a camera that obeyed it would duck dozens of
  // times down a lamp-lined avenue. Buildings are the only dressing wide enough
  // to mean it, and every authored segment block still occludes — the M4
  // gateway pull-in the obstruction was tuned against must not move.
  for (const collider of planColliders(plan)) {
    assert.notEqual(collider.occludes, false, 'an authored block stopped occluding');
  }
  for (const solid of plan.solids ?? []) {
    assert.equal(
      typeof solid.occludes,
      solid.occludes === undefined ? 'undefined' : 'boolean',
      'a solid carries a non-boolean occludes flag',
    );
  }
  const occluding = (plan.solids ?? []).filter((solid) => solid.occludes !== false).length;
  const blocks = (plan.props ?? []).filter((prop) => prop.kind === 'building').length;
  assert.equal(occluding, blocks, 'something other than a building occludes the camera');
});

test('no prop stands anywhere a rider could be riding', () => {
  // Dressing inside a rideable corridor was always wrong — a rider met a tree
  // on the road by passing through it — and since M8.6 it is worse, because
  // most kinds are solid and the same tree is a wall across a lane. The builder
  // refuses to place it for exactly that reason (`buildPlan.ts`), and this is
  // the assertion that the refusal is doing its job — sixty-five props landed
  // in a corridor on the first pass, every one authored at a sensible offset
  // from its own beat.
  //
  // The exceptions are the two kinds that stand *on* a collider the level
  // already has: the crown over a trunk and the finial on a bollard. Both are
  // above something solid, so the rider is already stopped by the thing the
  // prop is sitting on.
  const onSolid = new Set(
    placed.flatMap(propsOf)
      .filter((prop) => prop.onCollider === true)
      .map((prop) => `${prop.kind}|${prop.x.toFixed(6)}|${prop.z.toFixed(6)}`),
  );
  let checked = 0;

  for (const prop of plan.props ?? []) {
    const key = `${prop.kind}|${prop.position.x.toFixed(6)}|${prop.position.z.toFixed(6)}`;
    if (onSolid.has(key)) continue;
    checked += 1;

    const footprint = PROP_FOOTPRINTS[prop.kind];
    const points: [number, number][] = [[prop.position.x, prop.position.z]];
    if (footprint.shape === 'circle') {
      const radius = footprint.radius * prop.scale;
      for (let index = 0; index < 16 && radius > 0; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        points.push([
          prop.position.x + Math.cos(angle) * radius,
          prop.position.z + Math.sin(angle) * radius,
        ]);
      }
    } else {
      const cos = Math.cos(prop.rotationY);
      const sin = Math.sin(prop.rotationY);
      const halfX = (prop.size?.x ?? footprint.halfX * 2) * prop.scale / 2;
      const halfZ = (prop.size?.z ?? footprint.halfZ * 2) * prop.scale / 2;
      for (const [dx, dz] of [
        [-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ],
        [-halfX, 0], [halfX, 0],
        [-halfX, halfZ], [0, halfZ], [halfX, halfZ],
      ] as const) {
        points.push([
          prop.position.x + cos * dx + sin * dz,
          prop.position.z - sin * dx + cos * dz,
        ]);
      }
    }

    for (const [x, z] of points) {
      for (const each of placed) {
        const query = querySegment(each, x, z);
        assert.ok(
          query === null || query.outside >= 0.5,
          `a ${prop.kind} footprint reaches ${each.spec.id} at `
          + `(${x.toFixed(1)}, ${z.toFixed(1)})`,
        );
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} props were checked`);
});

test('no derived solid reaches into a corridor either', () => {
  // The test above checks *footprints*. This checks the boxes that footprint
  // guard now stands behind, and they are not the same shape: a collider is a
  // box and a tree's footprint is a circle, so the box's corners reach about a
  // quarter further than the radius that was cleared. `PROP_CORRIDOR_CLEARANCE`
  // is half a metre and the widest overhang in the kit is under eight
  // centimetres of it, but "is comfortably inside the margin" is a claim about
  // arithmetic somebody changes later, so it is asserted rather than reasoned.
  //
  // Corners only. A box is convex and a corridor edge is locally straight, so
  // if every corner clears the corridor the whole box does.
  let checked = 0;
  for (const solid of plan.solids ?? []) {
    const cos = Math.cos(solid.rotationY);
    const sin = Math.sin(solid.rotationY);
    const { x: halfX, z: halfZ } = solid.halfExtents;
    checked += 1;
    for (const [dx, dz] of [
      [-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ],
    ] as const) {
      const x = solid.centre.x + cos * dx + sin * dz;
      const z = solid.centre.z - sin * dx + cos * dz;
      for (const each of placed) {
        const query = querySegment(each, x, z);
        assert.ok(
          query === null || query.outside > 0,
          `a solid corner is inside ${each.spec.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`,
        );
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} solids were checked`);
});

test('every trunk the level already had now has a crown on it', () => {
  // The trunks are colliders and have been since M7; the crowns are props. The
  // two are authored by separate calls with the same arguments, so this is
  // what keeps them from drifting apart — a bare 4.2 m post beside a road does
  // not read as a tree, which is most of what "the graphics look primitive"
  // was about.
  const crowns = (plan.props ?? []).filter((prop) => prop.kind === 'treeCanopy');
  const trunks = planColliders(plan).filter((collider) => (
    collider.appearance === 'wood'
    && collider.halfExtents.x < 0.4
    && collider.halfExtents.z < 0.4
    && collider.halfExtents.y > 1.5
  ));

  assert.ok(trunks.length > 20, `only ${trunks.length} trunks — has the level lost its trees?`);
  for (const trunk of trunks) {
    const found = crowns.some((crown) => Math.hypot(
      crown.position.x - trunk.centre.x,
      crown.position.z - trunk.centre.z,
    ) < 0.6);
    assert.ok(
      found,
      `the trunk at (${trunk.centre.x.toFixed(1)}, ${trunk.centre.z.toFixed(1)}) has no crown`,
    );
  }
});

test('the footprint the dressing is laid out from is the footprint that got built', () => {
  // The scatter and the skyline are both positioned from `SLICE_FOOTPRINT`,
  // which is the heightfield's own extent written down. A stale value puts the
  // skyline in the park and the scatter off the edge of the world, and neither
  // is visible from a unit test that does not check this.
  const field = plan.heightfield;
  assert.equal(field.originX, SLICE_FOOTPRINT.minX);
  assert.equal(field.originZ, SLICE_FOOTPRINT.minZ);
  assert.equal(field.originX + (field.columns - 1) * field.spacing, SLICE_FOOTPRINT.maxX);
  assert.equal(field.originZ + (field.rows - 1) * field.spacing, SLICE_FOOTPRINT.maxZ);
});

test('the skyline stands beyond the world and inside the haze', () => {
  // It exists to give the horizon scale, so it has to be outside the course and
  // inside the distance the camera can see: `LIGHTING.fogFar` is 470 m and the
  // camera's far plane is 500, so anything past the fog is invisible anyway and
  // anything clipped by the far plane was already fully hazed.
  const field = plan.heightfield;
  const maxX = field.originX + (field.columns - 1) * field.spacing;
  const maxZ = field.originZ + (field.rows - 1) * field.spacing;
  const centreX = (field.originX + maxX) / 2;
  const centreZ = (field.originZ + maxZ) / 2;

  const beyond = (plan.props ?? []).filter((prop) => (
    prop.position.x < field.originX || prop.position.x > maxX
    || prop.position.z < field.originZ || prop.position.z > maxZ
  ));
  assert.ok(beyond.length > 40, `only ${beyond.length} props stand beyond the course`);
  assert.ok(
    beyond.some((prop) => prop.kind === 'building' && (prop.size?.y ?? 0) > 25),
    'nothing on the horizon is tall enough to be a skyline',
  );
  assert.ok(
    beyond.some((prop) => prop.kind === 'conifer' || prop.kind === 'broadleafTree'),
    'the park’s horizon has no treeline on it',
  );

  for (const prop of beyond) {
    const distance = Math.hypot(prop.position.x - centreX, prop.position.z - centreZ);
    assert.ok(distance < 480, `a skyline prop is ${distance.toFixed(0)} m out, past the haze`);
  }
});

test('the dressing is dense enough to read as a place, and stays in budget', () => {
  // The count is a design claim as much as a performance one: M7's world was
  // "bare ground and a few grey slabs", and a dozen trees would not have fixed
  // it. The triangle side is measured in `render/props.test.ts` against the
  // real built scene; this is the level's half of it.
  const props = plan.props ?? [];
  assert.ok(props.length > 500, `${props.length} props is still an empty world`);
  assert.ok(props.length < 2000, `${props.length} props is more than the budget can carry`);

  const kinds = new Set(props.map((prop) => prop.kind));
  assert.ok(kinds.size >= 10, `only ${kinds.size} kinds — the world will read as repetition`);

  // The dressing contributes `plan.solids`, never authored segment blocks — see
  // the M8.6 test above for why the two arrays stay apart.
  assert.ok(planColliders(plan).length < 200, 'the dressing added authored blocks');
});

test('the props are the same on every boot', () => {
  // `DESIGN.md` §4 rule 3, for the dressing: an integer hash, never
  // `Math.random`, or every visual regression capture disagrees with the last.
  const again = createSliceLevel();
  assert.deepEqual(again.props, plan.props);
});

/*
 * M7 asserted here that `plan.checkpoints` was empty, because §6's "the same
 * ten beats become six checkpoint volumes" was a route-design decision M10
 * owned and emitting inert volumes early would have settled which six. M10 has
 * now settled it, and the six are tested in their own section at the foot of
 * this file. The old assertion is gone rather than weakened: it said the array
 * was empty, and the array is no longer empty.
 */

// ---------------------------------------------------------------------------
// M7.5 stage 4: the paint, and the same promise the dressing makes
// ---------------------------------------------------------------------------

test('the paint changes nothing the simulation reads — not one sample', () => {
  // The `props` proof above, repeated for `markings`, because the promise is
  // the same one and a second render-only array is a second chance to break it.
  const strip = <T extends { markings?: unknown }>(spec: T): Omit<T, 'markings'> => {
    const { markings: _markings, ...rest } = spec;
    return rest;
  };
  const bare = buildLevelPlan(
    {
      main: SLICE_GRAPH.main.map(strip),
      branches: (SLICE_GRAPH.branches ?? []).map((branch) => ({
        ...branch,
        specs: branch.specs.map(strip),
      })),
    },
    { id: plan.id, spawn: plan.spawn, surround: plan.surround, settleBlocks: true },
  );

  assert.equal(bare.markings, undefined, 'a stripped graph still produced paint');
  assert.deepEqual(bare.heightfield.heights, plan.heightfield.heights, 'the ground moved');
  assert.deepEqual(bare.heightfield.surfaces, plan.heightfield.surfaces, 'a surface changed');
  assert.deepEqual(planColliders(bare), planColliders(plan), 'a line became a collider');

  const bareSampler = new PlanTerrainSampler(bare);
  const bareSample = createGroundSample();
  // Asked at the one set of points where a difference would exist if paint were
  // reaching the simulation at all: every point of every painted line.
  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      sampler.sampleGround(point.x, point.z, sample);
      bareSampler.sampleGround(point.x, point.z, bareSample);
      assert.equal(sample.height, bareSample.height, 'the ground moved under a line');
      assert.equal(sample.surface, bareSample.surface, 'the surface changed under a line');
    }
  }
});

test('every metre of paint is on a corridor, on a paved surface, and off the kerbs', () => {
  // The three rules `level/plan.ts` states, measured against the assembled
  // level rather than against the beat that authored each line — the slice
  // folds tightly enough that a line drawn down one beat crosses several.
  const placed = placeGraph(SLICE_GRAPH, plan.spawn);
  const colliders = planColliders(plan);
  const field = plan.heightfield;

  const surfaceAt = (x: number, z: number): SurfaceId => {
    const column = Math.floor((x - field.originX) / field.spacing);
    const row = Math.floor((z - field.originZ) / field.spacing);
    if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) {
      return plan.surround.surface;
    }
    return field.surfaces[row * (field.columns - 1) + column];
  };

  let points = 0;
  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      points += 1;

      const onCorridor = placed.some((segment) => {
        const query = querySegment(segment, point.x, point.z);
        return query !== null && query.outside === 0;
      });
      assert.ok(onCorridor, `paint at ${point.x.toFixed(1)}, ${point.z.toFixed(1)} is off the route`);

      const surface = surfaceAt(point.x, point.z);
      assert.ok(
        PAINTABLE_SURFACES.includes(surface),
        `paint at ${point.x.toFixed(1)}, ${point.z.toFixed(1)} is on ${surface}`,
      );

      for (const collider of colliders) {
        const dx = point.x - collider.centre.x;
        const dz = point.z - collider.centre.z;
        const cos = Math.cos(collider.rotationY);
        const sin = Math.sin(collider.rotationY);
        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;
        const inside = Math.abs(localX) <= collider.halfExtents.x + MARKINGS.colliderClearance
          && Math.abs(localZ) <= collider.halfExtents.z + MARKINGS.colliderClearance;
        assert.ok(!inside, `paint at ${point.x.toFixed(1)}, ${point.z.toFixed(1)} is on a collider`);
      }
    }
  }
  // A clip that removed everything would satisfy every rule above vacuously.
  assert.ok(points > 800, `only ${points} painted points survived the clip`);
});

test('a line sits on the ground it was resolved against, to the lift', () => {
  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      sampler.sampleGround(point.x, point.z, sample);
      const above = point.y - sample.height;
      assert.ok(
        Math.abs(above - MARKINGS.lift) < 1e-6,
        `paint floated ${above.toFixed(4)} m above the ground`,
      );
    }
  }
});

test('no run of paint is a dab, and the whole world carries a road’s worth', () => {
  const lengthOf = (marking: { points: readonly { x: number; z: number }[] }): number => {
    let total = 0;
    for (let index = 1; index < marking.points.length; index += 1) {
      total += Math.hypot(
        marking.points[index].x - marking.points[index - 1].x,
        marking.points[index].z - marking.points[index - 1].z,
      );
    }
    return total;
  };

  let painted = 0;
  for (const marking of plan.markings ?? []) {
    const length = lengthOf(marking);
    assert.ok(
      length >= MARKINGS.minRunLength,
      `a ${length.toFixed(2)} m run survived the minimum`,
    );
    assert.ok(marking.width > 0 && marking.points.length >= 2);
    painted += length;
  }
  // The slice carries 1,347 m of route, most of it paved. Under a kilometre of
  // paint would mean whole beats had lost their lines to a clipping bug.
  assert.ok(painted > 1000, `only ${painted.toFixed(0)} m of paint in the world`);
});

test('the paint stops where the city does', () => {
  // The park gate is an identity beat, and the paint is the fifth thing that
  // changes at it (`level/sliceLevel.ts`). Beyond the gate the line is the
  // park's duller paint; on the trail there is none at all.
  const paints = new Set((plan.markings ?? []).map((marking) => marking.paint));
  assert.deepEqual([...paints].sort(), ['path', 'road'], 'both paints have to be used');

  const placed = placeGraph(SLICE_GRAPH, plan.spawn);
  const unpainted = ['gravel-spur', 'trailhead', 'berm', 'kicker-run', 'kicker-land'];
  for (const id of unpainted) {
    const segment = placed.find((each) => each.spec.id === id);
    assert.ok(segment !== undefined, `no segment ${id}`);
    assert.equal(segment.spec.markings, undefined, `${id} is a trail and must carry no paint`);
  }

  // And every beat that *is* painted is one whose own surface takes paint.
  for (const segment of placed) {
    if (segment.spec.markings === undefined) continue;
    assert.ok(
      PAINTABLE_SURFACES.includes(segment.spec.surface),
      `${segment.spec.id} is painted and is ${segment.spec.surface}`,
    );
  }
});

test('the boulevard’s island breaks its centre line without anybody authoring it', () => {
  // The argument for clipping rather than rejecting, as an assertion. One
  // marking is authored down the whole of `boulevard-bend`; the island standing
  // in the middle of that road is a collider; paint does not go on colliders, so
  // the plan has to contain two runs where the author wrote one.
  const bend = placeGraph(SLICE_GRAPH, plan.spawn).find((each) => each.spec.id === 'boulevard-bend');
  assert.ok(bend !== undefined);
  const authored = (bend.spec.markings ?? []).filter((marking) => marking.broken === true);
  assert.equal(authored.length, 1, 'the bend authors exactly one centre line');

  const island = plan.segments
    .find((segment) => segment.id === 'boulevard-bend')!
    .colliders.find((collider) => Math.abs(collider.halfExtents.z - 7) < 1e-9);
  assert.ok(island !== undefined, 'the traffic island moved — this test is about it');

  // Runs of broken paint whose points all sit within the bend's own length.
  const near = (plan.markings ?? []).filter((marking) => marking.dash > 0
    && marking.points.every((point) => Math.hypot(
      point.x - island.centre.x,
      point.z - island.centre.z,
    ) < 40));
  assert.ok(near.length >= 2, `the island did not split the centre line (${near.length} runs)`);
});

test('the island stands tall enough to be a refuge rather than a dropped slab', () => {
  // **From the owner's second ride of a generated route, 2026-08-08.** He
  // photographed the island twice across two rides and called it a chunk of
  // pavement in the middle of the road both times, which is what a 0.15 m plate
  // of pale concrete on a grey road is from six metres behind a rider. It was
  // never the wrong *object* — it was an object with no silhouette.
  //
  // A bollard at each end is what gives it one. Asserted here so a later edit
  // that tidies them away has to answer for it.
  const bend = plan.segments.find((segment) => segment.id === 'boulevard-bend')!;
  const island = bend.colliders.find((collider) => Math.abs(collider.halfExtents.z - 7) < 1e-9);
  assert.ok(island !== undefined, 'the traffic island moved — this test is about it');

  const markers = bend.colliders.filter((collider) => collider.appearance === 'metal');
  assert.equal(markers.length, 2, 'the island lost its markers');
  for (const marker of markers) {
    const top = marker.centre.y + marker.halfExtents.y;
    assert.ok(
      top - (island.centre.y + island.halfExtents.y) > 0.7,
      'a marker no taller than the kerb it stands on is not a silhouette',
    );
    // On the island, along it, and far enough apart to read as two.
    assert.ok(
      Math.hypot(marker.centre.x - island.centre.x, marker.centre.z - island.centre.z)
        <= island.halfExtents.z,
      'a marker stands off the island it marks',
    );
  }
  assert.ok(
    Math.hypot(
      markers[0].centre.x - markers[1].centre.x,
      markers[0].centre.z - markers[1].centre.z,
    ) > 8,
    'both markers are at the same end',
  );
});

test('nothing the slice authored hangs in the air over its own ground', () => {
  // The hand-authored half of the contract `generatedLevel.test.ts` states for
  // the generated one, and the slice had a case of its own: the return climb's
  // 40 m retaining wall stood 1.88 m clear of the ground beside it, because a
  // block is placed against its corridor's surface and that wall sits outside
  // the corridor. `BuildOptions.settleBlocks` foots it. Buried is fine; air is
  // the defect.
  let worst = 0;
  for (const segment of plan.segments) {
    for (const collider of segment.colliders) {
      const cos = Math.cos(collider.rotationY);
      const sin = Math.sin(collider.rotationY);
      let lowest = Infinity;
      for (const i of [-1, 0, 1]) {
        for (const j of [-1, 0, 1]) {
          const localX = i * collider.halfExtents.x;
          const localZ = j * collider.halfExtents.z;
          lowest = Math.min(lowest, fieldHeightAt(
            plan.heightfield,
            plan.surround,
            collider.centre.x + cos * localX + sin * localZ,
            collider.centre.z - sin * localX + cos * localZ,
          ));
        }
      }
      const air = (collider.centre.y - collider.halfExtents.y) - lowest;
      worst = Math.max(worst, air);
      assert.ok(air <= 0.05, `${segment.id} stands ${air.toFixed(2)} m clear of its ground`);
    }
  }
  assert.ok(worst <= 0.05, `worst air gap ${worst.toFixed(3)} m`);
});

test('the paint is the same on every boot', () => {
  const again = createSliceLevel();
  assert.deepEqual(again.markings, plan.markings);
});

// ---------------------------------------------------------------------------
// From the owner's ride, 2026-08-03: nothing grows out of a wall
// ---------------------------------------------------------------------------

/** Whether a world point is inside a building's footprint, plus a margin. */
function insideBuilding(
  building: { position: { x: number; z: number }; rotationY: number; scale: number; size?: { x: number; z: number } },
  x: number,
  z: number,
  margin: number,
): boolean {
  const cos = Math.cos(building.rotationY);
  const sin = Math.sin(building.rotationY);
  const dx = x - building.position.x;
  const dz = z - building.position.z;
  return Math.abs(cos * dx - sin * dz) <= (building.size?.x ?? 12) / 2 * building.scale + margin
    && Math.abs(sin * dx + cos * dz) <= (building.size?.z ?? 12) / 2 * building.scale + margin;
}

test('no tree, shrub or lamp stands inside a building', () => {
  // **The defect the owner photographed on 2026-08-03**: foliage growing out of
  // a wall. The corridor guard could not have caught it — it protects the ride,
  // so it reads a street tree's *trunk*, and the crown four metres up is what
  // overlaps a twenty-metre block. This reads `PROP_SPREADS` instead: the widest
  // each kind gets at any height.
  const props = plan.props ?? [];
  const buildings = props.filter((prop) => prop.kind === 'building');
  assert.ok(buildings.length > 40, 'the skyline has been lost');

  let checked = 0;
  for (const prop of props) {
    if (prop.kind === 'building') continue;
    // Crowns and finials sit on colliders the level already has and take the
    // same documented exception both guards make for them.
    if (prop.kind === 'treeCanopy' || prop.kind === 'bollardCap') continue;

    const spread = PROP_SPREADS[prop.kind];
    const points: [number, number][] = [[prop.position.x, prop.position.z]];
    if (spread.shape === 'circle') {
      const radius = spread.radius * prop.scale;
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        points.push([
          prop.position.x + Math.cos(angle) * radius,
          prop.position.z + Math.sin(angle) * radius,
        ]);
      }
    } else {
      const cos = Math.cos(prop.rotationY);
      const sin = Math.sin(prop.rotationY);
      const halfX = spread.halfX * prop.scale;
      const halfZ = spread.halfZ * prop.scale;
      for (const [ax, az] of [
        [-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ],
        [-halfX, 0], [halfX, 0],
        [-halfX, halfZ], [0, halfZ], [halfX, halfZ],
      ] as const) {
        points.push([prop.position.x + cos * ax + sin * az, prop.position.z - sin * ax + cos * az]);
      }
    }

    for (const [x, z] of points) {
      for (const building of buildings) {
        assert.ok(
          !insideBuilding(building, x, z, 0),
          `a ${prop.kind} at ${prop.position.x.toFixed(1)}, ${prop.position.z.toFixed(1)} is inside a building`,
        );
      }
    }
    checked += 1;
  }
  assert.ok(checked > 600, `only ${checked} props were checked — the dressing has thinned`);
});

test('no building is buried inside another', () => {
  // Abutting is fine and wanted: two blocks sharing a corner read as one
  // L-shaped building, and a skyline forbidden to touch reads as a row of
  // towers. A block whose *centre* is inside another is a fused shape with a
  // seam through it, and the slice produced two of them — both from frontages
  // authored a comfortable distance apart along an arc, at an offset where that
  // distance shrinks by a quarter.
  const buildings = (plan.props ?? []).filter((prop) => prop.kind === 'building');
  for (const a of buildings) {
    for (const b of buildings) {
      if (a === b) continue;
      assert.ok(
        !insideBuilding(a, b.position.x, b.position.z, 0),
        `a building at ${b.position.x.toFixed(0)}, ${b.position.z.toFixed(0)} is buried in another`,
      );
    }
  }
});

test('the building guard clears the wall, rather than merely touching it', () => {
  // The clearance is what stops a canopy grazing a render and reading as a tree
  // growing out of it. Measured at the closest surviving prop in the world.
  const props = plan.props ?? [];
  const buildings = props.filter((prop) => prop.kind === 'building');
  let closest = Infinity;
  for (const prop of props) {
    if (prop.kind === 'building' || prop.kind === 'treeCanopy' || prop.kind === 'bollardCap') continue;
    const spread = PROP_SPREADS[prop.kind];
    const radius = spread.shape === 'circle'
      ? spread.radius * prop.scale
      : Math.hypot(spread.halfX, spread.halfZ) * prop.scale;
    for (const building of buildings) {
      const cos = Math.cos(building.rotationY);
      const sin = Math.sin(building.rotationY);
      const dx = prop.position.x - building.position.x;
      const dz = prop.position.z - building.position.z;
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      const halfX = (building.size?.x ?? 12) / 2 * building.scale;
      const halfZ = (building.size?.z ?? 12) / 2 * building.scale;
      const gap = Math.hypot(
        Math.max(0, Math.abs(localX) - halfX),
        Math.max(0, Math.abs(localZ) - halfZ),
      ) - radius;
      if (gap < closest) closest = gap;
    }
  }
  assert.ok(
    closest >= BUILDING_CLEARANCE - 1e-6,
    `the closest prop clears a wall by ${closest.toFixed(3)} m`,
  );
});

// ---------------------------------------------------------------------------
// M10: the timed route
// ---------------------------------------------------------------------------

/**
 * The six gates, and why not one assertion below is made against the maths that
 * placed them.
 *
 * A checkpoint is the only thing in the level that is **pure data with no
 * geometry to check it against**: a wall that is in the wrong place is visible
 * from the saddle, and a gate that is in the wrong place is invisible until a
 * run does not count. So every property below is asserted against something
 * derived independently of the code that placed it — `querySegment` inverts the
 * corridor's geometry rather than restating it, and the detector under test is
 * `simulation/challenge.ts`'s own `insideCheckpoint` rather than a copy of it
 * written here, which is the only version of this file that can catch the
 * convention error `AGENTS.md` warns about.
 */

/** The gate with an id, and the segment its spec named. */
function gate(id: string): { checkpoint: Checkpoint; carrier: PlacedSegment; s: number } {
  const spec = SLICE_CHECKPOINTS.find((each) => each.id === id);
  assert.ok(spec !== undefined, `no checkpoint "${id}" is authored`);
  const checkpoint = plan.checkpoints.find((each) => each.id === id);
  assert.ok(checkpoint !== undefined, `checkpoint "${id}" was authored and never built`);
  return { checkpoint, carrier: segment(spec.segment), s: spec.s };
}

/** A world point placed in a gate's own frame: +X across to the left, +Z along. */
function fromGate(checkpoint: Checkpoint, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(checkpoint.headingY);
  const sin = Math.sin(checkpoint.headingY);
  // The forward transform of the inverse `insideCheckpoint` applies.
  return {
    x: checkpoint.centre.x + cos * localX + sin * localZ,
    z: checkpoint.centre.z - sin * localX + cos * localZ,
  };
}

test('the timed route is six gates: one start, four splits, one finish, in order', () => {
  assert.equal(plan.checkpoints.length, 6);
  assert.deepEqual(
    plan.checkpoints.map((checkpoint) => checkpoint.kind),
    ['start', 'split', 'split', 'split', 'split', 'finish'],
  );
  assert.deepEqual(
    plan.checkpoints.map((checkpoint) => checkpoint.label),
    ['Start', 'Curb run', 'Park gate', 'Gravel spur', 'The kicker', 'Finish'],
  );

  const ids = new Set<string>();
  plan.checkpoints.forEach((checkpoint, index) => {
    assert.equal(checkpoint.routeIndex, index, `${checkpoint.id} is out of order`);
    assert.equal(ids.has(checkpoint.id), false, `two gates called "${checkpoint.id}"`);
    ids.add(checkpoint.id);
    assert.ok(checkpoint.label.length > 0, `${checkpoint.id} has nothing to call itself`);
  });

  // And the run can be refereed: `ChallengeRun.available` is exactly this.
  assert.equal(plan.checkpoints.filter((each) => each.kind === 'start').length, 1);
  assert.equal(plan.checkpoints.filter((each) => each.kind === 'finish').length, 1);
});

test('every gate stands square across the corridor its beat authored it on', () => {
  // **Against `querySegment` rather than against the placement maths.** That
  // function goes the other way — world point to `(s, t)`, by solving the arc —
  // so a gate placed on the wrong side, facing backwards, or a metre off the
  // road disagrees with it. A test written from `centrelineAt` and `leftOf`
  // would agree with any consistent error, which is the trap `AGENTS.md`
  // records about world-space sign tests.
  for (const spec of SLICE_CHECKPOINTS) {
    const { checkpoint, carrier, s } = gate(spec.id);

    const here = querySegment(carrier, checkpoint.centre.x, checkpoint.centre.z);
    assert.ok(here !== null, `${spec.id} is nowhere near ${spec.segment}`);
    assert.equal(here.outside, 0, `${spec.id} is off the corridor it belongs to`);
    assert.ok(Math.abs(here.t) < 1e-6, `${spec.id} is ${here.t.toFixed(3)} m off the centreline`);
    assert.ok(Math.abs(here.s - s) < 1e-6, `${spec.id} landed at s=${here.s.toFixed(3)}, not ${s}`);

    // A metre along the gate's own +Z is a metre further down the route, and a
    // metre along its +X is a metre toward the rider's left — which is what
    // `SegmentQuery.t` reports as positive. Both are what make `halfExtents.x`
    // the width and `.z` the thickness rather than the other way round.
    const ahead = fromGate(checkpoint, 0, 1);
    const alongside = fromGate(checkpoint, 1, 0);
    const downroute = querySegment(carrier, ahead.x, ahead.z);
    const toTheLeft = querySegment(carrier, alongside.x, alongside.z);
    assert.ok(downroute !== null && Math.abs(downroute.s - (s + 1)) < 1e-3,
      `${spec.id}'s gate faces the wrong way along the route`);
    assert.ok(toTheLeft !== null && Math.abs(toTheLeft.t - 1) < 1e-3,
      `${spec.id}'s gate has its width on the wrong axis, or its left on the right`);

    // The width is the corridor's own, so a gate on a 5.8 m alley could never
    // reach into the road beside it.
    assert.equal(checkpoint.halfExtents.x, carrier.spec.halfWidth + CHALLENGE.gateWidthMargin);
    assert.equal(checkpoint.halfExtents.y, CHALLENGE.gateHalfHeight);
    assert.equal(checkpoint.halfExtents.z, CHALLENGE.gateHalfDepth);
  }
});

test('a rider anywhere across the corridor crosses the gate, and one beside it does not', () => {
  // The property the whole feature rests on: a run must not be voided by the
  // line the rider chose. Swept across the full rideable width at the ground
  // the heightfield actually carries there — a crowned road's gutter, the park
  // gate's descent, the spur's cross-fall — because the box is founded on the
  // lowest of that and a box founded on the crown misses the gutter entirely.
  for (const spec of SLICE_CHECKPOINTS) {
    const { checkpoint, carrier, s } = gate(spec.id);
    // The rideable corridor, edge to edge. Not the gate's own half-extent: the
    // box is straight and the corridor bends through it, so the far corner of a
    // curved beat's own width sits a few millimetres outside the rectangle —
    // which is one of the things `CHALLENGE.gateWidthMargin` absorbs, and the
    // reason the sweep is of the road rather than of the volume.
    const halfWidth = carrier.spec.halfWidth;

    for (let t = -halfWidth; t <= halfWidth + 1e-9; t += 0.25) {
      for (const along of [-1.5, 0, 1.5]) {
        const here = pointOn(spec.segment, s + along, t);
        // A millimetre off the ground, and it is not a fudge of the detector:
        // the builder founds the box on a swept minimum, this sweeps a
        // different grid over the same creased field, and the two disagree in
        // the last few tenths of a millimetre at the very edge of the widest
        // gate. A tenth of a millimetre of ground is below what the game can
        // express — the ghost records position to the centimetre — and the
        // failure this test exists for is the eight-centimetre one.
        const ground = fieldHeightAt(plan.heightfield, plan.surround, here.x, here.z) + 1e-3;
        assert.ok(
          insideCheckpoint(checkpoint, here.x, ground, here.z),
          `${spec.id} missed a rider at t=${t.toFixed(2)}, ${along} m along`,
        );
      }
    }

    // And it is a gate rather than a region: a gate-depth past it, and a metre
    // beyond the margin to either side, are both outside.
    const beyond = fromGate(checkpoint, 0, 2 * CHALLENGE.gateHalfDepth);
    assert.equal(
      insideCheckpoint(checkpoint, beyond.x, checkpoint.centre.y, beyond.z), false,
      `${spec.id} is still catching riders a gate-depth past it`,
    );
    for (const side of [1, -1]) {
      const wide = fromGate(checkpoint, side * (checkpoint.halfExtents.x + 1), 0);
      assert.equal(
        insideCheckpoint(checkpoint, wide.x, checkpoint.centre.y, wide.z), false,
        `${spec.id} reaches a metre beyond its own margin`,
      );
    }
  }
});

test('every gate is founded on the lowest ground it spans, and is not sunk in it', () => {
  // The rule behind the sweep above, stated on its own so that a change to the
  // foundation fails here with a number rather than there with a missed rider.
  for (const spec of SLICE_CHECKPOINTS) {
    const { checkpoint, s } = gate(spec.id);
    // The whole volume's width this time, margin included: the *foundation* has
    // to be under every square metre of ground the box covers, even the strip
    // of shoulder beyond the road that the sweep above deliberately skips.
    const halfWidth = checkpoint.halfExtents.x;

    let lowest = Infinity;
    for (let t = -halfWidth; t <= halfWidth + 1e-9; t += 0.1) {
      for (let along = -CHALLENGE.gateHalfDepth; along <= CHALLENGE.gateHalfDepth + 1e-9; along += 0.2) {
        const here = pointOn(spec.segment, s + along, t);
        lowest = Math.min(lowest, fieldHeightAt(plan.heightfield, plan.surround, here.x, here.z));
      }
    }

    const floor = checkpoint.centre.y - checkpoint.halfExtents.y;
    // A millimetre of slack, and it is the sweep's rather than the builder's:
    // both walk a planar-within-a-cell field on a finite grid, so neither lands
    // exactly on the lowest crossing and they disagree in the last few microns.
    // A tenth of a millimetre of ground is not a thing this game can express —
    // the ghost quantises position at a centimetre.
    assert.ok(
      floor <= lowest + 1e-3,
      `${spec.id} floats ${(floor - lowest).toFixed(4)} m over its own ground`,
    );
    // The other direction is not about precision at all: it catches a gate
    // founded on something that is not the road — a ditch, a shoulder, the
    // swale — which would miss by metres rather than by microns. Half the
    // wheel's hop is a bound the worst honest case (the park gate's descent,
    // 0.10 m) clears twice over.
    const surface = pointOn(spec.segment, s, 0).y;
    assert.ok(
      floor > surface - HOP_HEIGHT / 2,
      `${spec.id} is founded ${(surface - floor).toFixed(3)} m below the road it crosses`,
    );
  }
});

test('no gate sits on either branch of the fork, by name or by ground', () => {
  // The rule that makes one split table describe both routes. Both halves are
  // checked: the authored names, and the world — a gate authored onto a shared
  // beat could still land on top of a branch corridor where the level folds.
  const branchOnly = new Set<string>(['fork', ...SAFE_ROUTE, ...ALLEY_ROUTE]);
  for (const id of branchOnly) assert.ok(byId.has(id), `"${id}" is not a segment any more`);

  for (const spec of SLICE_CHECKPOINTS) {
    assert.equal(branchOnly.has(spec.segment), false, `${spec.id} is authored on ${spec.segment}`);
    const { checkpoint } = gate(spec.id);
    for (const id of branchOnly) {
      const here = querySegment(segment(id), checkpoint.centre.x, checkpoint.centre.z);
      assert.ok(here === null || here.outside > 0, `${spec.id} stands on ${id}`);
    }
  }
});

test('the kicker’s gate is past where the chicken line rejoins, so both routes cross it', () => {
  // Beat 9 is the level's *other* route choice and it is the one the M10 brief
  // does not mention. A gate anywhere before this point would void the run of
  // every rider who took the way around the jump — a line the level offers on
  // purpose, so refusing to count it is the annoyance rule with a stopwatch.
  const rejoin = querySegment(
    segment('kicker-land'),
    segment('chicken-out').exit.position.x,
    segment('chicken-out').exit.position.z,
  );
  assert.ok(rejoin !== null && rejoin.outside === 0, 'the chicken line no longer rejoins the landing');

  const { checkpoint, s } = gate('kicker');
  assert.ok(
    s - checkpoint.halfExtents.z > rejoin.s,
    `the kicker's gate starts at s=${(s - checkpoint.halfExtents.z).toFixed(2)}, `
    + `before the chicken line arrives at ${rejoin.s.toFixed(2)}`,
  );

  // And no gate is on the jump's own approach or on the way around it, which is
  // the same rule stated where a future edit would break it.
  for (const spec of SLICE_CHECKPOINTS) {
    assert.ok(
      spec.segment !== 'kicker-run' && !spec.segment.startsWith('chicken-'),
      `${spec.id} is on ${spec.segment}, which only one of beat 9's two lines uses`,
    );
  }
});

test('a gate is detection data: not a collider, not a solid, not a prop', () => {
  // `plan.ts`'s M7 trap, on the shipped level. The sampler resolves a collider
  // by its top face, so a gate that had become one would be ground 3.2 m over
  // the road — and the rider would land on the start line.
  const solids = planSolids(plan);
  const props = plan.props ?? [];

  for (const checkpoint of plan.checkpoints) {
    for (const collider of solids) {
      const dx = checkpoint.centre.x - collider.centre.x;
      const dz = checkpoint.centre.z - collider.centre.z;
      const cos = Math.cos(collider.rotationY);
      const sin = Math.sin(collider.rotationY);
      const inside = Math.abs(cos * dx - sin * dz) <= collider.halfExtents.x
        && Math.abs(sin * dx + cos * dz) <= collider.halfExtents.z
        && Math.abs(checkpoint.centre.y - collider.centre.y) <= collider.halfExtents.y;
      assert.equal(inside, false, `${checkpoint.id} stands inside something solid`);

      assert.equal(
        collider.centre.x === checkpoint.centre.x && collider.centre.z === checkpoint.centre.z
          && collider.halfExtents.x === checkpoint.halfExtents.x,
        false,
        `${checkpoint.id} was emitted as a collider as well`,
      );
    }
    for (const prop of props) {
      assert.equal(
        prop.position.x === checkpoint.centre.x && prop.position.z === checkpoint.centre.z,
        false,
        `${checkpoint.id} was emitted as a prop as well`,
      );
    }
  }
});

test('the proving ground carries no checkpoints, because it is an instrument', () => {
  // `levels.ts` in full: the M4 course is a measuring instrument rather than a
  // place. A timed route on it would invite a personal best on geometry that
  // exists to keep the M2–M6 evidence comparable, and `ChallengeRun.available`
  // is false for exactly this level.
  assert.deepEqual(createProvingGround().checkpoints, []);
});

test('the gates are the same on every boot', () => {
  assert.deepEqual(createSliceLevel().checkpoints, plan.checkpoints);
});
