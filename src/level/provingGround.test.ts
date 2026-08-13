/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HAZARD_SURFACE_IDS, SURFACE_IDS, TERRAIN_SURFACE_IDS } from '../data/surfaces.ts';
import { WHEEL, TERRAIN } from '../data/tuning.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type SurfaceId } from '../simulation/world.ts';
import { buildLevelPlan, planColliders } from './buildPlan.ts';
import { cellCount } from './plan.ts';
import { PROVING_GROUND_SPECS, createProvingGround } from './provingGround.ts';
import { placeChain } from './segments.ts';

/**
 * The plan builder and the M4 proving ground.
 *
 * These are the assertions that make invariant 2 mean something: the plan is
 * the single producer, so anything wrong here is wrong in the renderer *and*
 * in the controller simultaneously and identically — which is exactly the
 * property the invariant buys, and exactly why it is worth checking the plan
 * itself rather than each consumer's reading of it.
 */

const sample = createGroundSample();
const plan = createProvingGround();
const sampler = new PlanTerrainSampler(plan);

function surfaceAt(x: number, z: number): SurfaceId {
  sampler.sampleGround(x, z, sample);
  return sample.surface;
}

function heightAt(x: number, z: number): number {
  sampler.sampleGround(x, z, sample);
  return sample.height;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

test('the heightfield’s arrays are the size its dimensions claim', () => {
  const field = plan.heightfield;
  assert.equal(field.heights.length, field.columns * field.rows);
  assert.equal(field.surfaces.length, cellCount(field));
  assert.ok(field.columns > 2 && field.rows > 2);
  assert.ok(field.heights.every(Number.isFinite), 'a non-finite height would poison the sampler');
});

test('the heightfield’s border ring is pure surround', () => {
  // Not cosmetic. `render/terrain.ts` skips all-surround cells to avoid drawing
  // geometry coplanar with the surround plane, and the sampler answers surround
  // for anything off the grid. The two agree only if the grid's edge already
  // *is* the surround — otherwise there is a step at the boundary that nothing
  // draws and everything can ride off.
  const field = plan.heightfield;
  const at = (column: number, row: number): number => field.heights[row * field.columns + column];

  for (let column = 0; column < field.columns; column += 1) {
    assert.equal(at(column, 0), plan.surround.height, `top edge at column ${column}`);
    assert.equal(at(column, field.rows - 1), plan.surround.height, `bottom edge ${column}`);
  }
  for (let row = 0; row < field.rows; row += 1) {
    assert.equal(at(0, row), plan.surround.height, `left edge at row ${row}`);
    assert.equal(at(field.columns - 1, row), plan.surround.height, `right edge at row ${row}`);
  }
});

test('the shoulder blends the corridor down to the surround, monotonically', () => {
  // An elevated beat without a shoulder ends in a cliff at its own edge. The
  // blend is what turns the embankment into something a rider can climb, which
  // is the go-anywhere fantasy the vision LOCKS.
  const built = buildLevelPlan(
    [{ id: 'raised', length: 40, climb: 6, halfWidth: 5, surface: 'pavement', shoulder: 8 }],
    {
      id: 'shoulder',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
      spacing: 1,
    },
  );
  const localSampler = new PlanTerrainSampler(built);
  const localSample = createGroundSample();

  let previous = Infinity;
  for (let x = 5; x <= 14; x += 1) {
    localSampler.sampleGround(x, 30, localSample);
    assert.ok(localSample.height <= previous + 1e-9, `height rose again at x = ${x}`);
    previous = localSample.height;
  }
  assert.ok(previous < 0.05, `the shoulder never reached the surround: ${previous}`);
});

test('a level plan with no segments is refused rather than emitting an empty world', () => {
  assert.throws(() => buildLevelPlan([], {
    id: 'empty',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
  }));
});

// ---------------------------------------------------------------------------
// The proving ground
// ---------------------------------------------------------------------------

test('every authored segment reaches the plan, with sockets that stitch', () => {
  assert.equal(plan.segments.length, PROVING_GROUND_SPECS.length);

  for (let i = 1; i < plan.segments.length; i += 1) {
    const previous = plan.segments[i - 1].exit;
    const next = plan.segments[i].entry;
    assert.deepEqual(next.position, previous.position, `${plan.segments[i].id} is detached`);
    assert.equal(next.headingY, previous.headingY, `${plan.segments[i].id} kinks`);
    assert.equal(next.gradient, previous.gradient, `${plan.segments[i].id} creases`);
  }
});

test('every socket reports the five things a generator needs', () => {
  // `docs/PLANS.md` §6: surface, width, heading, gradient, elevation. Elevation
  // is `position.y`. A socket missing one of these is a socket M12 cannot match.
  for (const segment of [...plan.segments]) {
    for (const socket of [segment.entry, segment.exit]) {
      assert.ok(SURFACE_IDS.includes(socket.surface), `${segment.id} socket surface`);
      assert.ok(socket.halfWidth > 0, `${segment.id} socket width`);
      assert.ok(Number.isFinite(socket.headingY), `${segment.id} socket heading`);
      assert.ok(Number.isFinite(socket.gradient), `${segment.id} socket gradient`);
      assert.ok(Number.isFinite(socket.position.y), `${segment.id} socket elevation`);
    }
  }
});

test('the eased climbs make every socket a zero-gradient socket', () => {
  // Which is why these beats compose with each other in any order — the
  // property M12 inherits for free by authoring this way now.
  for (const segment of plan.segments) {
    assert.equal(segment.entry.gradient, 0, `${segment.id} entry`);
    assert.equal(segment.exit.gradient, 0, `${segment.id} exit`);
  }
});

test('all seven terrain surfaces are painted somewhere a rider can reach', () => {
  // The proving ground exists to answer one question — how does this ground
  // feel to ride — and it cannot answer it about a surface nobody can ride on.
  // Seven is still the honest count: the eighth surface is M13's spill, and a
  // hazard surface is not one a level is built from. Nothing declares it, no
  // verge band chooses it, and `buildPlan` paints it only inside a `Hazard`
  // footprint; §13 q9 puts hazards in generated routes alone, and this world is
  // an instrument rather than a route (`level/levels.ts`). Riding the spill is
  // covered where one can exist — `buildPlan.test.ts`'s "a spill paints the
  // cells under it and leaves every other cell alone", and the generated-route
  // suites.
  //
  // Asserting its *absence* here is not ceremony. This level is the M2–M6
  // measuring instrument: a stray spill in it would be a patch of ground that
  // feeds the wobble oscillator, in the one world whose entire purpose is that
  // the ride under it never changes.
  const painted = new Set(plan.heightfield.surfaces);
  for (const id of TERRAIN_SURFACE_IDS) {
    assert.ok(painted.has(id), `${id} is declared but never appears in the world`);
  }
  for (const id of HAZARD_SURFACE_IDS) {
    assert.ok(!painted.has(id), `${id} is painted on the instrument the ride is measured with`);
  }
  assert.equal(plan.hazards, undefined, 'the proving ground carries no hazards at all');
  // And no Knockabout targets, for the stronger version of the same reason
  // (§13 q12, M14). A target is never a collider, so one standing here would not
  // change what the wheel rolls over — but it would put a swingable thing in the
  // instrument the M2–M6 numbers were settled on, and the point of an instrument
  // is that it does not acquire features.
  assert.equal(plan.targets, undefined, 'the proving ground carries no targets at all');
});

test('the rider spawns on the pad, on pavement, facing down it', () => {
  // The reference surface, and the reason it exists: M2's and M3's evidence was
  // taken on flat pavement, so that is where a rider starts and where those
  // browser specs still ride.
  assert.deepEqual(plan.spawn.position, { x: 0, y: 0, z: 0 });
  assert.equal(plan.spawn.headingY, 0);
  assert.equal(surfaceAt(0, 0), 'pavement');
  assert.equal(heightAt(0, 0), 0);
  assert.equal(plan.segments[0].id, 'pad');
});

test('the pad is big enough for the manoeuvres it is the reference for', () => {
  const pad = plan.segments.find((segment) => segment.id === 'pad');
  assert.ok(pad !== undefined);

  // Thirteen seconds of full throttle covers about 155 m, which is what the
  // camera needs to settle at its speed reference; a full-lock carve at the
  // wheel's top speed swings 29 m off the line inside a quarter turn.
  const length = Math.hypot(
    pad.exit.position.x - pad.entry.position.x,
    pad.exit.position.z - pad.entry.position.z,
  );
  assert.ok(length > 155, `the pad is only ${length.toFixed(0)} m long`);
  assert.ok(pad.entry.halfWidth > 29, `the pad is only ${pad.entry.halfWidth * 2} m wide`);

  // And it is flat pavement from end to end, or it is not a reference surface.
  for (const along of [10, 60, 120, 170]) {
    for (const across of [-25, 0, 25]) {
      assert.equal(surfaceAt(across, along), 'pavement', `at ${across},${along}`);
      assert.equal(heightAt(across, along), 0, `at ${across},${along}`);
    }
  }
});

test('the gateway is a passage with depth, not a doorway in a thin wall', () => {
  // The geometry the M3 obstruction pull-in finally gets to fire against, and
  // the depth is the part that took a measurement. A chase camera follows the
  // rider through whatever gap they went through and swings to the *outside* of
  // a turn, so a thin wall with a hole in it never gets between the two; a
  // passage does, because the camera is still inside it.
  const plaza = plan.segments.find((segment) => segment.id === 'plaza');
  assert.ok(plaza !== undefined);
  const gateZ = plaza.entry.position.z + 38;

  const gate = plaza.colliders.filter(
    (collider) => Math.abs(collider.centre.z - gateZ) < 1,
  );
  assert.equal(gate.length, 2, 'expected exactly two gate blocks');
  for (const block of gate) {
    assert.ok(block.halfExtents.z > 2, `the gateway is only ${block.halfExtents.z * 2} m deep`);
  }

  // Down the middle: clear, at ground level, and wide enough to ride.
  for (const x of [-1.2, 0, 1.2]) {
    assert.equal(heightAt(x, gateZ), 0, `the gateway is blocked at x = ${x}`);
  }
  // Either side: solid, and taller than both the wheel and the camera's arm.
  for (const x of [-4, 4, -10, 10]) {
    const top = heightAt(x, gateZ);
    assert.ok(top > 1.9, `the gateway is only ${top} m tall at x = ${x}`);
    assert.ok(
      top > WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor,
      'a gate the wheel can ride over is not a gate',
    );
  }
});

test('the boulevard’s kerb is a genuine step of the height beat 3 asks for', () => {
  const boulevard = plan.segments.find((segment) => segment.id === 'boulevard');
  assert.ok(boulevard !== undefined);
  assert.equal(boulevard.colliders.length, 1);

  const kerb = boulevard.colliders[0];
  const top = kerb.centre.y + kerb.halfExtents.y;
  assert.ok(Math.abs(top - 0.15) < 1e-9, `kerb top at ${top}`);
  // Mountable, and therefore worth hopping at M5 rather than impossible.
  assert.ok(top < WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor);
  // On the rider's RIGHT, which is -X while the boulevard runs along +Z.
  assert.ok(kerb.centre.x < 0, `the kerb is on the left at x = ${kerb.centre.x}`);
  assert.equal(boulevard.entry.surface, 'pavement');
});

test('the trail carries one rock the wheel can roll and one it cannot', () => {
  const trail = plan.segments.find((segment) => segment.id === 'trail');
  assert.ok(trail !== undefined);

  const ceiling = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
  const tops = trail.colliders.map((rock) => rock.centre.y + rock.halfExtents.y);
  assert.ok(tops.some((top) => top < ceiling), 'no rollable rock');
  assert.ok(tops.some((top) => top > ceiling), 'no rock that has to be ridden around');
});

test('the course climbs and comes back down', () => {
  const elevations = plan.segments.map((segment) => segment.exit.position.y);
  assert.ok(Math.max(...elevations) > 5, `the course only reaches ${Math.max(...elevations)} m`);
  assert.ok(
    Math.abs(elevations[elevations.length - 1]) < 1e-9,
    'the course does not return to its own elevation',
  );
});

test('the surround is grass at the plaza’s own height, so leaving is riding not falling', () => {
  assert.equal(plan.surround.surface, 'grass');
  assert.equal(plan.surround.height, 0);

  sampler.sampleGround(-500, -500, sample);
  assert.equal(sample.surface, 'grass');
  assert.equal(sample.height, 0);
  assert.equal(sample.offCourse, true);
});

test('the world stays inside the budget it has to share with the rider', () => {
  // Triangles only — never a frame time (AGENTS.md). The ground is the largest
  // single thing in the scene, so it is the one worth bounding: 400k is the
  // whole budget and the rider, the wheel, and everything M5 onward adds have
  // to fit in the rest of it.
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

  assert.ok(drawn * 2 < 120_000, `the ground alone would draw ${drawn * 2} triangles`);
  // And the skip is doing real work: the bounding box is far larger than the
  // course inside it, which is what makes an L-shaped route affordable.
  assert.ok(
    drawn < cellCount(field) * 0.5,
    `${drawn} of ${cellCount(field)} cells are drawn — the surround skip is not firing`,
  );
  assert.ok(planColliders(plan).length > 5, 'the course has no furniture at all');
});

test('rebuilding the proving ground produces the same world every time', () => {
  // A hand-authored level has no seed, so this is cheap to guarantee and worth
  // guaranteeing anyway: it is the property M12's named seed streams will be
  // asserted against, and the assertion is easier to write before there is a
  // generator to blame.
  const again = createProvingGround();
  assert.deepEqual(again.heightfield.heights, plan.heightfield.heights);
  assert.deepEqual(again.heightfield.surfaces, plan.heightfield.surfaces);
  assert.deepEqual(planColliders(again), planColliders(plan));
});

test('the authored specs place the same chain the plan reports', () => {
  // The specs are exported for M7 to start from, so they have to describe the
  // world that actually shipped rather than an earlier draft of it.
  const chain = placeChain(PROVING_GROUND_SPECS, plan.spawn);
  assert.equal(chain.length, plan.segments.length);
  for (let i = 0; i < chain.length; i += 1) {
    assert.equal(chain[i].spec.id, plan.segments[i].id);
    assert.deepEqual(chain[i].entry.position, plan.segments[i].entry.position);
  }
});
