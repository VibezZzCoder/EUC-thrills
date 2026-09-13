/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, GROUP_SPAWN, PADDLE, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { LEVEL_IDS, createLevel } from '../level/levels.ts';
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import { EucController } from './EucController.ts';
import type { Spawn } from './EucController.ts';
import {
  GROUP_OBSTACLE_CLEARANCE_METRES,
  groupObstaclesFrom,
  groupRingRadius,
  groupSeatDeal,
  groupSeparation,
  groupSpawns,
} from './groupSpawn.ts';
import type { GroupObstacle, GroupSpawnAccepted } from './groupSpawn.ts';
import { Paddle } from './paddle.ts';
import type { HittableSet, HittableVolume, SwingSide, WielderPose } from './paddle.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { SLOT_STEP_TOLERANCE_METRES } from './spawnSlots.ts';
import { createGroundSample } from './world.ts';
import type { SurfaceId } from './world.ts';

/**
 * Three and four riders at the start of a bout — M37 Phase 2
 * (`docs/PLANS.md` §37.4).
 *
 * **The weapon is the instrument, not a distance inequality.** §37.4 asks for
 * the opening swing to be *attempted*, in both directions of every pair, on
 * every proposed pack — because "2.4 m is more than 2.15 m" is arithmetic about
 * a bound and a forehand is a swept arc from a particular pose. So the plane
 * search `paddle.test.ts` uses to hold `reachAgainst` to the real sweep is
 * generalised here to an arbitrary wielder pose and both latched sides, and
 * calibrated before it is trusted: it must find the hit the old 1.6 m couch
 * spacing really permitted, and must refuse the 3 m one that replaced it.
 *
 * The other half is that the search is proved on **every world the game can
 * build** — five shipped producers and the same twenty-four generated seeds
 * `spawnSlots.test.ts` sweeps, at both seat counts, with three placement seeds
 * each — and that the refusals bite on worlds built to trigger them. A
 * validator that has never refused anything is a validator nobody has tested.
 *
 * Nothing here needs `three` or a DOM. The production `EucController` rides out
 * of every accepted position on the real sampler, which is the one thing a
 * stationary ground sample cannot do.
 */

const STEP = 1 / SIMULATION.hz;
const RADIUS = CHASE.riderHitRadius;
const SEPARATION = groupSeparation(new Paddle(), RADIUS);

/** The generated sweep, spelled as `spawnSlots.test.ts` and `generatedLevel.test.ts` spell it. */
const SWEEP = Array.from({ length: 24 }, (_, index) => `sweep-${index}`);

/**
 * Three placement seeds per world.
 *
 * §37.4 asks for more than one, because a pack that is safe under one deal and
 * not under another is a pack whose fairness depends on the draw.
 */
const PLACEMENT_SEEDS = ['bout-1', 'bout-2', 'bout-3'];

/** Every world the game can build, produced once and shared by the sweeps below. */
const WORLDS: { label: string; plan: LevelPlan }[] = (() => {
  const shipped = LEVEL_IDS.map((id) => ({ label: id, plan: createLevel(id, 'euc') }));
  // The producer count is part of the claim, exactly as `spawnSlots.test.ts`
  // states it: a sixth producer must arrive here rather than quietly ride on
  // five worlds' worth of evidence about where a bout can be started.
  assert.equal(shipped.length, 5, 'the producer list moved; the sweeps below no longer cover it');
  return [...shipped, ...SWEEP.map((seed) => ({ label: seed, plan: generateLevel(seed).plan }))];
})();

// ---------------------------------------------------------------------------
// The instrument: a real swing, from a real pose, at a real rider
// ---------------------------------------------------------------------------

/**
 * Does `attacker`'s opening swing put `victim` down?
 *
 * `paddle.test.ts:264`'s plane search with the wielder pose parameterised and
 * **both** `SwingSide` values tried. Both sides matter here and did not at a
 * duel: a ring gives every rider a different heading, so "the guest is on the
 * host's left and therefore safe" — the fact the 3 m duel spacing was tuned
 * around — stops being a fact the moment the pack is not a line.
 *
 * The whole cycle is run, not one phase: a swing strikes only while it is
 * `active`, and starting the search at the wrong moment would prove nothing.
 */
function lands(attacker: Spawn, victim: Spawn): boolean {
  for (const side of ['right', 'left'] as SwingSide[]) {
    const paddle = new Paddle();
    const pose: WielderPose = {
      x: attacker.position.x,
      y: attacker.position.y,
      z: attacker.position.z,
      headingY: attacker.headingY,
    };
    const volume: HittableVolume = {
      id: 'body',
      x: victim.position.x,
      // The hittable sphere rides at the paddle's own plane, as `paddle.test.ts`
      // places it: this is a reach question, not a height one.
      y: attacker.position.y + PADDLE.pivotHeight,
      z: victim.position.z,
      radius: RADIUS,
    };
    const set: HittableSet = {
      eachNear(minX, minY, minZ, maxX, maxY, maxZ, visit) {
        if (volume.x + RADIUS < minX || volume.x - RADIUS > maxX) return;
        if (volume.y + RADIUS < minY || volume.y - RADIUS > maxY) return;
        if (volume.z + RADIUS < minZ || volume.z - RADIUS > maxZ) return;
        visit(volume);
      },
    };
    paddle.step(STEP, pose, false, set, side);
    for (let step = 0; step < 200; step += 1) {
      if (paddle.step(STEP, pose, step === 0, set, side).length > 0) return true;
      if (step > 0 && paddle.phase === 'idle') break;
    }
  }
  return false;
}

/** A rider standing at `(x, z)` on flat ground, facing `headingY`. */
function standing(x: number, z: number, headingY = 0): Spawn {
  return { position: { x, y: 0, z }, headingY };
}

test('the swing instrument finds the hit the old spacing permitted and misses the new one', () => {
  /*
   * **The positive control, and it is the point of the test.** §37.4 asks for
   * the 1.6 m versus 3 m duel regression *and its positive control* to survive
   * M37; `spawnSlots.test.ts` keeps the distance form of it and this is the
   * swung form. An instrument that never lands a hit would pass every pack
   * below while proving nothing at all.
   */
  assert.equal(lands(standing(0, 0), standing(-1.6, 0)), true, 'no hit at the old couch spacing');
  // And on the wielder's left as well, which a duel never had to care about:
  // seat 1 always stood on seat 0's right, and a ring has no such promise.
  assert.equal(lands(standing(0, 0), standing(1.6, 0)), true, 'the mirrored swing does not exist');
  assert.equal(lands(standing(0, 0), standing(-2.14, 0)), true, 'the arc falls short of its own bound');
  assert.equal(lands(standing(0, 0), standing(-2.16, 0)), false, 'the arc reached past its own bound');
  assert.equal(lands(standing(0, 0), standing(-3.0, 0)), false, 'a hit at the duel spacing');

  // The bearing sweep the pair bound is actually claimed over: at the group
  // separation nothing lands from any direction, which is what lets the seat
  // deal put anybody anywhere.
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const angle = (degrees * Math.PI) / 180;
    const victim = standing(Math.sin(angle) * SEPARATION, Math.cos(angle) * SEPARATION);
    assert.equal(
      lands(standing(0, 0), victim),
      false,
      `a swing lands at ${degrees}° at the group separation of ${SEPARATION.toFixed(3)} m`,
    );
  }
});

test('the separation and the ring radius are read off the weapon', () => {
  // Derived, never copied: a retune of the arm, the head, the pivot or the
  // rider radius moves all of this, and `paddle.test.ts` is what holds
  // `reachAgainst` itself to a real sweep.
  const reach = new Paddle().reachAgainst(RADIUS);
  assert.equal(SEPARATION, reach + GROUP_SPAWN.pairMarginMetres);
  assert.ok(SEPARATION > reach, 'the margin is not a margin');

  for (const count of [3, 4]) {
    const radius = groupRingRadius(SEPARATION, count);
    const chord = 2 * radius * Math.sin(Math.PI / count);
    assert.ok(
      chord >= SEPARATION,
      `an N=${count} ring of ${radius.toFixed(3)} m puts its nearest pair ${chord.toFixed(3)} m apart`,
    );
    // Rounded up to a small step, so it is the bound plus a hair and not the
    // bound plus a metre — a pack stood absurdly wide would clear the weapon
    // and stop being a fight.
    assert.ok(
      chord < SEPARATION + 2 * GROUP_SPAWN.ringRadiusStepMetres,
      `an N=${count} ring is ${(chord - SEPARATION).toFixed(3)} m wider than it needs to be`,
    );
  }
});

// ---------------------------------------------------------------------------
// Every world the game can build, at both seat counts, on three deals
// ---------------------------------------------------------------------------

/** The whole-pack claims, asserted on one accepted result. */
function assertPackIsSound(label: string, plan: LevelPlan, pack: GroupSpawnAccepted, count: number): void {
  const terrain = new PlanTerrainSampler(plan);
  const sample = createGroundSample();

  assert.equal(pack.spawns.length, count, `${label}: the pack is not ${count} riders`);
  assert.ok(
    pack.minPairClearance >= SEPARATION,
    `${label}: the tightest pair is ${pack.minPairClearance.toFixed(3)} m apart, inside the `
      + `${SEPARATION.toFixed(3)} m a swing needs to miss`,
  );

  for (const [seat, spawn] of pack.spawns.entries()) {
    terrain.sampleGround(spawn.position.x, spawn.position.z, sample);
    assert.equal(sample.offCourse, false, `${label}: seat ${seat} starts off the course`);
    assert.equal(spawn.position.y, sample.height, `${label}: seat ${seat}'s height is not its ground`);

    // Facing the shared meeting area. Nobody is pointed at the verge, and
    // nobody has been handed the middle.
    const toCentre = Math.atan2(pack.centre.x - spawn.position.x, pack.centre.z - spawn.position.z);
    const off = Math.abs(Math.atan2(Math.sin(spawn.headingY - toCentre), Math.cos(spawn.headingY - toCentre)));
    assert.ok(off < 1e-6, `${label}: seat ${seat} faces ${off.toFixed(4)} rad away from the meeting area`);

    const fromCentre = Math.hypot(spawn.position.x - pack.centre.x, spawn.position.z - pack.centre.z);
    assert.ok(fromCentre > 1e-6, `${label}: seat ${seat} is standing on the meeting area itself`);
  }

  // Every unordered pair, measured, and then swung at in **both** directions.
  for (let a = 0; a < count; a += 1) {
    for (let b = 0; b < count; b += 1) {
      if (a === b) continue;
      const gap = Math.hypot(
        pack.spawns[a].position.x - pack.spawns[b].position.x,
        pack.spawns[a].position.z - pack.spawns[b].position.z,
      );
      assert.ok(
        gap >= pack.minPairClearance - 1e-9,
        `${label}: the reported minimum pair clearance is not the minimum`,
      );
      assert.equal(
        lands(pack.spawns[a], pack.spawns[b]),
        false,
        `${label}: seat ${a} opens on seat ${b} from ${gap.toFixed(3)} m before anybody has ridden`,
      );
    }
  }
}

test('every shipped producer and the generated sweep stand three and four riders, on three deals', () => {
  /*
   * **The claim M37 needs before a third seat can be offered anywhere.** Not
   * "the function answers" — the function always answers; §37.4's worry is a
   * world where the honest answer is no, and the only way to know is to ask
   * all of them. Twenty-nine worlds, two seat counts, three placement seeds:
   * one hundred and seventy-four packs, every pair swung in both directions.
   */
  let packs = 0;
  for (const { label, plan } of WORLDS) {
    const terrain = new PlanTerrainSampler(plan);
    const obstacles = groupObstaclesFrom(plan);
    for (const count of [3, 4]) {
      for (const seed of PLACEMENT_SEEDS) {
        const result = groupSpawns(plan.spawn, count, terrain, seed, obstacles, SEPARATION);
        assert.ok(
          result.ok,
          `${label} N=${count} ${seed}: no pack after ${result.ok ? 0 : result.tried} candidates — `
            + `${result.ok ? '' : result.refused.map((one) => one.reason).join('; ')}`,
        );
        assertPackIsSound(`${label} N=${count} ${seed}`, plan, result, count);
        packs += 1;
      }
    }
  }
  assert.equal(packs, WORLDS.length * 2 * PLACEMENT_SEEDS.length);
});

test('the same world, seed and seat count reproduce the same pack', () => {
  // §37.4: "replaying the same world, seed and participant count reproduces
  // the same pack". Resume and controller reconnect keep it because there is
  // nothing else to keep — the pack is a pure function of these four things.
  for (const { label, plan } of WORLDS.slice(0, 8)) {
    const terrain = new PlanTerrainSampler(plan);
    const obstacles = groupObstaclesFrom(plan);
    for (const count of [3, 4]) {
      const first = groupSpawns(plan.spawn, count, terrain, 'bout-1', obstacles, SEPARATION);
      const again = groupSpawns(plan.spawn, count, new PlanTerrainSampler(plan), 'bout-1', obstacles, SEPARATION);
      assert.deepEqual(again, first, `${label} N=${count}: two identical calls dealt different packs`);
    }
  }
});

test('a fresh placement seed deals the seats differently', () => {
  /*
   * The other half of reproducibility, and the one that makes it worth having:
   * a new bout is a new draw. §37.4 is explicit that this is not a promise two
   * successive packs can never resemble one another — with three seats there
   * are six deals — so the claim is made over a spread of seeds rather than
   * over a pair.
   */
  for (const count of [3, 4]) {
    const deals = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const deal = groupSeatDeal(`bout-${index}`, count);
      assert.deepEqual(
        [...deal].sort((a, b) => a - b),
        Array.from({ length: count }, (_, seat) => seat),
        'a deal is not a permutation of the positions',
      );
      deals.add(deal.join(','));
    }
    assert.ok(deals.size > 1, `every one of twelve seeds dealt the same ${count} seats`);
  }

  // And the deal reaches the pack: two seeds put different seats in different
  // places on a world that accepts the same candidate for both.
  const plan = createLevel('slice', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  const a = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [], SEPARATION);
  const b = groupSpawns(plan.spawn, 4, terrain, 'bout-2', [], SEPARATION);
  assert.ok(a.ok && b.ok);
  assert.equal(a.candidate, b.candidate, 'the two seeds did not even choose the same geometry');
  assert.notDeepEqual(a.spawns, b.spawns, 'two placement seeds seated everybody identically');
  // The *set* of places is the same; only who stands where moved.
  const places = (pack: GroupSpawnAccepted): string[] => pack.spawns
    .map((spawn) => `${spawn.position.x.toFixed(6)},${spawn.position.z.toFixed(6)}`)
    .sort();
  assert.deepEqual(places(a), places(b), 'the seed moved the geometry rather than the seats');
});

test('the pack is tested against its own ground plane, not a flat window', () => {
  /*
   * **The measurement that forced the change** (M37 Phase 0). `slotIsGround`
   * compares every candidate against one reference height with a 0.04 m
   * window, which on `sweep-19` — a 3.18 % route — is used up in 1.26 m, below
   * the N=3 ring radius. A legitimately graded road would refuse itself.
   *
   * So the accepted pack there is asserted to contain a rider the old window
   * would have thrown away, and to be flat *relative to its own plane* all the
   * same.
   */
  const plan = generateLevel('sweep-19').plan;
  const terrain = new PlanTerrainSampler(plan);
  const sample = createGroundSample();
  for (const count of [3, 4]) {
    const pack = groupSpawns(plan.spawn, count, terrain, 'bout-1', groupObstaclesFrom(plan), SEPARATION);
    assert.ok(pack.ok, `sweep-19 N=${count} found no pack`);
    terrain.sampleGround(pack.centre.x, pack.centre.z, sample);
    const centreHeight = sample.height;
    const spread = pack.spawns.map((spawn) => Math.abs(spawn.position.y - centreHeight));
    assert.ok(
      Math.max(...spread) > SLOT_STEP_TOLERANCE_METRES,
      `sweep-19 N=${count}: the pack sits within the old flat window, so this proves nothing`,
    );
    // And it is still a plane: the grade is the same all the way across, which
    // is what "not a step" means once the window has gone.
    assert.ok(
      Math.max(...spread) < GROUP_SPAWN.maxPackRiseMetres,
      `sweep-19 N=${count}: the pack spans more than a start should`,
    );
  }
});

// ---------------------------------------------------------------------------
// The production controller, riding out of every position
// ---------------------------------------------------------------------------

/** Ride away from `spawn` for `seconds` at `throttle`, and report what went wrong. */
function rideAway(
  terrain: PlanTerrainSampler,
  spawn: Spawn,
  seconds: number,
  throttle: number,
): { fault: string | null; travelled: number } {
  const controller = new EucController(terrain, { spawn });
  const steps = Math.round(seconds / STEP);
  for (let step = 0; step < steps; step += 1) {
    controller.step(STEP, { ...NEUTRAL_ACTIONS, throttle });
    const snapshot = controller.snapshot();
    if (snapshot.state === 'crashing' || snapshot.state === 'recovering') {
      return { fault: `crashed after ${(step * STEP).toFixed(2)} s`, travelled: snapshot.distanceTravelled };
    }
    if (snapshot.offCourse) {
      return { fault: `left the course after ${(step * STEP).toFixed(2)} s`, travelled: snapshot.distanceTravelled };
    }
    if (snapshot.state === 'wobbling') {
      return { fault: `was wobbled after ${(step * STEP).toFixed(2)} s`, travelled: snapshot.distanceTravelled };
    }
  }
  return { fault: null, travelled: controller.snapshot().distanceTravelled };
}

test('the production controller rides away from every accepted position', () => {
  /*
   * §37.4: "Add a short production-controller ride from each spawn to catch an
   * immediate obstacle/hazard or an unusable facing that a stationary sample
   * cannot show." The validator's departure probe walks the ground; this is the
   * wheel actually rolling over it, with the surfaces, the kerb feeler, the
   * wall standoff and the crash machine all live.
   *
   * Two seconds at a quarter throttle carries the rider 1.6-2.9 m, inside the
   * `GROUP_SPAWN.departureMetres` the validator checked — which is the point of
   * that constant being the larger of the two.
   *
   * **Both ends of that range are asserted, and the near end is the one that
   * matters.** A ride of zero metres catches no obstacle and no unusable
   * facing, yet it crashes nothing, leaves no course and never passes the
   * far-end bound — so with an upper bound alone, an edit that stopped the
   * throttle reaching the wheel would turn all 609 rides into a no-op that
   * still reported green (measured: `throttle: 0` gives 609 rides, 0 faults,
   * 0.000 m). The floor below is under the measured minimum of 1.61 m.
   */
  let rides = 0;
  let furthest = 0;
  let shortest = Infinity;
  for (const { label, plan } of WORLDS) {
    const terrain = new PlanTerrainSampler(plan);
    const obstacles = groupObstaclesFrom(plan);
    for (const count of [3, 4]) {
      for (const seed of PLACEMENT_SEEDS) {
        const pack = groupSpawns(plan.spawn, count, terrain, seed, obstacles, SEPARATION);
        assert.ok(pack.ok);
        for (const [seat, spawn] of pack.spawns.entries()) {
          const ride = rideAway(terrain, spawn, 2, 0.25);
          assert.equal(
            ride.fault,
            null,
            `${label} N=${count} ${seed}: seat ${seat} ${ride.fault} riding out of its own spawn`,
          );
          furthest = Math.max(furthest, ride.travelled);
          shortest = Math.min(shortest, ride.travelled);
          rides += 1;
        }
      }
    }
  }
  assert.ok(rides > 0, 'no ride was attempted, so nothing was checked');
  assert.ok(
    shortest > 1,
    `a ride covered only ${shortest.toFixed(2)} m — a wheel that never left its spawn cannot be said `
      + 'to have ridden away from it',
  );
  assert.ok(
    furthest <= GROUP_SPAWN.departureMetres,
    `a ride covered ${furthest.toFixed(2)} m, past the ${GROUP_SPAWN.departureMetres} m the validator checked`,
  );
});

test('neutral input does NOT freeze a sloped spawn — the countdown has to', () => {
  /*
   * **§37.4's freeze concern, measured rather than assumed.** The plan says
   * neutral input "must be tested rather than assumed to freeze a sloped
   * spawn", and it does not: the longitudinal model applies `-g·sin(slope)`
   * whatever the input is, and only rolling resistance holds a parked wheel.
   * On pavement that is 0.35 m/s², so anything steeper than about a 2 %
   * descent rolls away on its own.
   *
   * Measured here on a 5 % ramp, which the group validator accepts: the rider
   * facing downhill covers **0.63 m in three seconds and is doing 0.42 m/s** at
   * the end of it. At 10 % it is 2.80 m and 1.85 m/s. Nothing in this milestone
   * changes the controller — §37.4 says the *match* freezes movement until GO,
   * and this is the number that says it must actually do so rather than hand
   * every seat neutral input and hope.
   *
   * The shipped worlds are luckier than that and it is luck: `sweep-19` stands
   * a rider on a 5.4 % descent and does not creep at all, because its surface
   * is `roughPavement` and 0.85 m/s² of rolling resistance beats the 0.53 m/s²
   * the slope asks for. A surface retune would move that, which is exactly why
   * the claim is stated over a fixture as well.
   */
  const ramp = rampFixture(0.05);
  const terrain = new PlanTerrainSampler(ramp);
  const pack = groupSpawns(ramp.spawn, 4, terrain, 'bout-1', [], SEPARATION);
  assert.ok(pack.ok, 'the 5 % ramp was refused, so there is nothing to stand on it');

  let worstDrift = 0;
  let worstSpeed = 0;
  for (const spawn of pack.spawns) {
    const controller = new EucController(terrain, { spawn });
    for (let step = 0; step < Math.round(3 / STEP); step += 1) controller.step(STEP, NEUTRAL_ACTIONS);
    const snapshot = controller.snapshot();
    worstDrift = Math.max(worstDrift, Math.hypot(
      snapshot.position.x - spawn.position.x,
      snapshot.position.z - spawn.position.z,
    ));
    worstSpeed = Math.max(worstSpeed, Math.abs(snapshot.speed));
  }
  assert.ok(
    worstDrift > 0.5,
    `a downhill rider drifted only ${worstDrift.toFixed(3)} m at neutral — if the controller has `
      + 'learned to hold a slope, this test is the record that says so and §37.4 can stop worrying',
  );
  assert.ok(
    worstDrift < 1.5 && worstSpeed < 1,
    `a downhill rider ran ${worstDrift.toFixed(3)} m at ${worstSpeed.toFixed(3)} m/s in three seconds, `
      + 'which is a good deal more creep than the 0.63 m this was written against',
  );

  // And the shipped graded world, for the record: held by its surface, not by
  // the input.
  const graded = generateLevel('sweep-19').plan;
  const gradedTerrain = new PlanTerrainSampler(graded);
  const gradedPack = groupSpawns(graded.spawn, 3, gradedTerrain, 'bout-1', groupObstaclesFrom(graded), SEPARATION);
  assert.ok(gradedPack.ok);
  for (const spawn of gradedPack.spawns) {
    const controller = new EucController(gradedTerrain, { spawn });
    for (let step = 0; step < Math.round(3 / STEP); step += 1) controller.step(STEP, NEUTRAL_ACTIONS);
    const snapshot = controller.snapshot();
    assert.ok(
      Math.hypot(snapshot.position.x - spawn.position.x, snapshot.position.z - spawn.position.z) < 1e-6,
      'sweep-19 crept at neutral input, so the surface is no longer holding it either',
    );
  }
});

// ---------------------------------------------------------------------------
// The refusals, on worlds built to trigger them
// ---------------------------------------------------------------------------

/**
 * A rectangle of authored ground on a constant grade, half-metre cells.
 *
 * Half-metre rather than the one-metre cells `spawnSlots.test.ts` uses, because
 * a pack is placed to the centimetre and its edges need to land where the
 * fixture says they do rather than a cell away.
 */
function gradedField(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  grade = 0,
  surfaceAt: (x: number, z: number) => SurfaceId = () => 'pavement',
): Heightfield {
  const spacing = 0.5;
  const columns = Math.round((maxX - minX) / spacing) + 1;
  const rows = Math.round((maxZ - minZ) / spacing) + 1;
  const heights: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) heights.push((minZ + row * spacing) * grade);
  }
  const surfaces: SurfaceId[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      surfaces.push(surfaceAt(minX + (column + 0.5) * spacing, minZ + (row + 0.5) * spacing));
    }
  }
  return { originX: minX, originZ: minZ, spacing, columns, rows, heights, surfaces };
}

/** A fixture world: the given ground, spawning at the origin facing +Z. */
function fixture(heightfield: Heightfield): LevelPlan {
  const socket = {
    position: { x: 0, y: 0, z: 0 },
    headingY: 0,
    surface: 'pavement' as const,
    halfWidth: 1,
    gradient: 0,
  };
  return {
    id: 'group-spawn-fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    // Well below the authored ground, so "off the course" is unambiguous and a
    // pack cannot quietly step down onto the surround.
    surround: { height: -50, surface: 'grass' },
    heightfield,
    segments: [{ id: 'fixture-segment', entry: socket, exit: socket, colliders: [] }],
    checkpoints: [],
  };
}

/** A long, wide, constant grade. */
function rampFixture(grade: number): LevelPlan {
  return fixture(gradedField(-20, 20, -20, 40, grade));
}

test('a handed-in obstacle refuses a candidate that was otherwise fine', () => {
  /*
   * The sampler folds colliders into the ground, so a wall is caught without
   * anything here knowing what a wall is. Hazards, soft bodies and targets are
   * not ground and have no sampler query at all — they arrive as plain data
   * under §37.4's own permission, and this is the test that they are actually
   * read rather than accepted and ignored.
   */
  const plan = createLevel('slice', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  const clean = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [], SEPARATION);
  assert.ok(clean.ok);

  const onTopOfSeatZero: GroupObstacle = {
    kind: 'hazard',
    shape: 'circle',
    x: clean.spawns[0].position.x,
    z: clean.spawns[0].position.z,
    radius: 0.6,
  };
  const blocked = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [onTopOfSeatZero], SEPARATION);
  assert.ok(blocked.ok, 'one hazard should move the pack, not cancel the bout');
  assert.ok(
    blocked.candidate > clean.candidate,
    'the hazard did not move the pack off the candidate it was standing on',
  );
  const refusal = blocked.refused.find((one) => one.candidate === clean.candidate);
  assert.ok(refusal, 'the blocked candidate is not in the refusal list');
  assert.match(refusal.reason, /hazard/, `the refusal does not name the hazard: ${refusal.reason}`);

  // And the clearance is a real distance rather than a containment test: a
  // hazard beside a rider refuses just as a hazard under one does.
  const beside: GroupObstacle = {
    kind: 'soft',
    shape: 'circle',
    x: clean.spawns[1].position.x + GROUP_OBSTACLE_CLEARANCE_METRES * 0.5,
    z: clean.spawns[1].position.z,
    radius: 0,
  };
  const nudged = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [beside], SEPARATION);
  assert.ok(nudged.ok);
  assert.ok(
    nudged.refused.some((one) => one.candidate === clean.candidate && /soft/.test(one.reason)),
    'a soft body inside the clearance radius did not refuse anything',
  );

  // And when two volumes both breach, the sentence names the nearer one
  // **whichever order the plan enumerated them in** — otherwise two plans
  // carrying identical geometry would report the same pack differently, and
  // the refusal's distance would not be a distance to anything in particular.
  const near: GroupObstacle = {
    kind: 'hazard',
    shape: 'circle',
    x: clean.spawns[2].position.x + 0.1,
    z: clean.spawns[2].position.z,
    radius: 0,
  };
  const far: GroupObstacle = {
    kind: 'solid',
    shape: 'circle',
    x: clean.spawns[2].position.x + 0.5,
    z: clean.spawns[2].position.z,
    radius: 0,
  };
  for (const order of [[near, far], [far, near]]) {
    const both = groupSpawns(plan.spawn, 4, terrain, 'bout-1', order, SEPARATION);
    const refused = both.refused.find((one) => one.candidate === clean.candidate);
    assert.ok(refused, 'two volumes on a rider refused nothing');
    assert.match(
      refused.reason,
      /0\.100 m from a hazard/,
      `the refusal named the enumeration order rather than the nearer volume: ${refused.reason}`,
    );
  }
});

test('a rotation and the lenient pass are ACCEPTED, not only refused', () => {
  /*
   * §37.4 asks the search for "deterministic translations, rotations and a
   * roomy arc". Across every shipped producer and the whole seed sweep the
   * accepted candidate is only ever 0 or 3 — both `rot 0.000 strict` — and the
   * arc fixture asserts its twenty-four ring candidates are *refused*. So
   * without this test the rotations and the lenient pass are exercised as
   * rejections only: a sign error on the rotation, or a `strict` flag read
   * backwards, would leave every one of those assertions still passing.
   *
   * Two fixtures, each the smallest defect that reaches the branch.
   */

  // 1. One pinpoint hazard under a single seat of the otherwise clean `slice`
  //    pack. It cannot be translated away — every forward offset puts somebody
  //    back on the verge — so the search turns the ring instead.
  const plan = createLevel('slice', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  const leftX = Math.cos(plan.spawn.headingY);
  const leftZ = -Math.sin(plan.spawn.headingY);
  const forwardX = Math.sin(plan.spawn.headingY);
  const forwardZ = Math.cos(plan.spawn.headingY);

  for (const [count, candidate, rotation] of [
    // Candidate order is shape → pass → offset → rotation, rotations
    // `[0, π/N, π/2N]`: 5 is the +2 m strict ring turned by π/2N, 4 the same
    // ring turned by π/N. N=3's π/6 is the case that can tell `+rotation`
    // from `-rotation` — at π/N the two are the same set of points.
    [3, 5, Math.PI / 6],
    [4, 4, Math.PI / 4],
  ] as const) {
    const clean = groupSpawns(plan.spawn, count, terrain, 'bout-1', [], SEPARATION);
    assert.ok(clean.ok);
    const pinpoint: GroupObstacle = {
      kind: 'hazard',
      shape: 'circle',
      x: clean.spawns[0].position.x,
      z: clean.spawns[0].position.z,
      radius: 0.05,
    };
    const turned = groupSpawns(plan.spawn, count, terrain, 'bout-1', [pinpoint], SEPARATION);
    assert.ok(turned.ok, `N=${count}: a 0.05 m hazard cancelled the bout instead of turning the ring`);
    assert.equal(turned.candidate, candidate, `N=${count}: the search did not reach the rotated ring`);

    // The accepted points ARE `rotation + i·2π/N` on the ring, in the start
    // frame — not merely "somewhere acceptable".
    const expected = Array.from({ length: count }, (_, index) => {
      const angle = rotation + (index * 2 * Math.PI) / count;
      return {
        x: turned.centre.x + forwardX * Math.cos(angle) * turned.radius + leftX * Math.sin(angle) * turned.radius,
        z: turned.centre.z + forwardZ * Math.cos(angle) * turned.radius + leftZ * Math.sin(angle) * turned.radius,
      };
    });
    for (const point of expected) {
      assert.ok(
        turned.spawns.some((spawn) => Math.hypot(spawn.position.x - point.x, spawn.position.z - point.z) < 1e-5),
        `N=${count}: the accepted pack is not the ring turned by ${rotation.toFixed(4)} rad`,
      );
    }
    assertPackIsSound(`turned ring N=${count}`, plan, turned, count);
  }

  // 2. A one-metre strip of pavement down the middle of a dirt field. Every
  //    strict candidate has somebody off the strip, and there is no offset or
  //    rotation that helps; the lenient pass — same ring, surface no longer
  //    required to match the centre's — is what stands the pack, on ground
  //    that is authored, level and clear.
  const striped = fixture(gradedField(-20, 20, -20, 40, 0, (x) => (Math.abs(x) < 0.5 ? 'pavement' : 'dirt')));
  const stripedTerrain = new PlanTerrainSampler(striped);
  for (const count of [3, 4]) {
    const pack = groupSpawns(striped.spawn, count, stripedTerrain, 'bout-1', [], SEPARATION);
    assert.ok(pack.ok, `the striped world refused N=${count} altogether`);
    // Twelve strict ring candidates come first — four offsets, three
    // rotations — so an accepted candidate at or past twelve is the lenient
    // pass, and every one before it was refused for the surface.
    assert.ok(pack.candidate >= 12, `N=${count} was answered by a strict candidate at ${pack.candidate}`);
    assert.equal(pack.refused.length, 12, `N=${count}: the strict ring candidates were not all refused`);
    for (const one of pack.refused) {
      assert.match(
        one.reason,
        /stands on dirt beside a centre on pavement/,
        `N=${count}: a strict candidate was refused for something other than the surface: ${one.reason}`,
      );
    }
    assertPackIsSound(`striped N=${count}`, striped, pack, count);
  }
});

test('an oblique box is tested in the sampler\u2019s frame, not its mirror', () => {
  /*
   * **The one containment test a shrub gets.** `plan.solids` reach the
   * validator twice — as handed-in volumes here, and through the sampler,
   * which folds every collider's top face into `sampleGround`. `plan.softBodies`
   * reach it once: `PlanTerrainSampler` never reads them, so this arithmetic
   * is the only thing between a rider and a spawn inside a bush, and a
   * generated world carries thousands of them.
   *
   * The frame has to be the project's. A yaw of h maps local +X onto the
   * rider's left and local +Z onto the heading, so world→local is that
   * rotation's transpose — `planSampler.ts` and `routeValidator.ts` both write
   * `cos·dx − sin·dz`, `sin·dx + cos·dz` with cos/sin of **+h**. Rotating the
   * offset by −h instead builds the box's mirror image, which agrees for a
   * square box or a quarter-turn yaw and inverts for everything else.
   *
   * So: one 4 × 1 m box at 45°, and the point that is 1.4 m along each world
   * axis from its centre. In the real frame that point is inside the box; in
   * the mirrored one it is 1.48 m clear. The assertion is made against the
   * sampler rather than against arithmetic repeated here, so the two cannot
   * drift apart in the same direction.
   */
  const OBLIQUE = Math.PI / 4;
  const probe = { x: 1.4, z: -1.4 };

  // The sampler's own verdict, from a solid of the same shape standing 1 m
  // proud on flat ground: if the probe point is inside, it stands on the top
  // face at y = 1.
  const solid = {
    centre: { x: 0, y: 0.5, z: 0 },
    halfExtents: { x: 2, y: 0.5, z: 0.5 },
    rotationY: OBLIQUE,
    surface: 'pavement' as const,
  };
  const boxed: LevelPlan = { ...fixture(gradedField(-10, 10, -10, 10)), solids: [solid] };
  const sample = createGroundSample();
  new PlanTerrainSampler(boxed).sampleGround(probe.x, probe.z, sample);
  assert.ok(sample.height > 0.9, 'the fixture is wrong: the sampler does not put this point inside the box');

  // The producer's verdict on the same geometry, reached through a real pack.
  const plan = createLevel('slice', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  const clean = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [], SEPARATION);
  assert.ok(clean.ok);
  const swallowing: GroupObstacle = {
    kind: 'soft',
    shape: 'box',
    x: clean.spawns[0].position.x - probe.x,
    z: clean.spawns[0].position.z - probe.z,
    halfExtentX: solid.halfExtents.x,
    halfExtentZ: solid.halfExtents.z,
    rotationY: OBLIQUE,
  };
  const blocked = groupSpawns(plan.spawn, 4, terrain, 'bout-1', [swallowing], SEPARATION);
  const refusal = blocked.refused.find((one) => one.candidate === clean.candidate);
  assert.ok(
    refusal,
    'a rider standing inside an oblique soft body was accepted — the box is being tested in its mirror',
  );
  assert.match(refusal.reason, /inside a soft/, `the refusal does not say the rider is in it: ${refusal.reason}`);
});

test('a narrow start and an impossible world fail honestly, with every refusal', () => {
  // Two metres of road, and one square metre of it. Both are worlds no bout
  // can be held on, and §37.4's rule is that the producer says so rather than
  // standing everybody on the plan's spawn.
  const narrow = fixture(gradedField(-1, 1, -10, 40));
  const tiny = fixture(gradedField(-1, 1, -1, 1));
  for (const [label, plan] of [['a two-metre corridor', narrow], ['one square metre', tiny]] as const) {
    for (const count of [3, 4]) {
      const result = groupSpawns(plan.spawn, count, new PlanTerrainSampler(plan), 'bout-1', [], SEPARATION);
      assert.equal(result.ok, false, `${label} N=${count} seated a pack it has no room for`);
      assert.ok(!result.ok && result.tried > 0, `${label}: nothing was even tried`);
      assert.ok(!result.ok && result.refused.length === result.tried, `${label}: a candidate went unreported`);
      for (const one of (result as { refused: typeof result extends { refused: infer R } ? R : never }).refused) {
        assert.ok(one.reason.length > 0, `${label}: a refusal came back without a reason`);
      }
    }
  }
});

test('an unsupported seat count is refused rather than guessed at', () => {
  // Two seats keep `spawnSlot` and its duel spacing — §37.4 is explicit that
  // the group producer is for three and four. A silent answer for two would be
  // a second, untested start for the mode that already ships one.
  const plan = createLevel('slice', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  for (const count of [0, 1, 2, 5, 8]) {
    const result = groupSpawns(plan.spawn, count, terrain, 'bout-1', [], SEPARATION);
    assert.equal(result.ok, false, `a pack of ${count} was produced`);
    assert.ok(!result.ok && result.tried === 0);
    assert.ok(!result.ok && /unsupported participant count/.test(result.refused[0].reason));
  }
  // A nonsense separation is the other way in, and it must not throw either.
  for (const separation of [0, -1, Number.NaN]) {
    const result = groupSpawns(plan.spawn, 3, terrain, 'bout-1', [], separation);
    assert.equal(result.ok, false, `a separation of ${separation} produced a pack`);
  }
  // And a nonsense start pose is the third. Producers author `plan.spawn`, so
  // this cannot reach the game — but nothing downstream would catch it: a NaN
  // probe is not reported off the course, and every `Math.abs(NaN) > limit` in
  // the validator is false, so without the guard a NaN spawn comes back as an
  // accepted pack of NaN positions rather than as the producer bug it is.
  for (const broken of [
    { position: { x: Number.NaN, y: 0, z: 0 }, headingY: 0 },
    { position: { x: 0, y: 0, z: Number.NaN }, headingY: 0 },
    { position: { x: 0, y: 0, z: 0 }, headingY: Number.POSITIVE_INFINITY },
  ]) {
    const result = groupSpawns(broken, 3, terrain, 'bout-1', [], SEPARATION);
    assert.equal(result.ok, false, 'a non-finite start pose produced a pack');
    assert.ok(!result.ok && /not a finite pose/.test(result.refused[0].reason));
  }
});

test('the arc fallback is reachable, and every rider on it can still ride away', () => {
  /*
   * **A world built to refuse a ring.** The clear ground runs from 1.5 m behind
   * the spawn to 3.5 m in front of it and is wide either side — which is the
   * shape of a real apron, and the shape §37.4's "the road cannot fit the ring"
   * describes. Every ring candidate needs either the ground behind the spawn
   * (its own rearmost rider, or the front rider's backward departure) or more
   * road ahead than there is. The arc needs neither: it is half as deep, and
   * nobody on it departs backwards.
   */
  const plan = fixture(gradedField(-10, 10, -1.5, 3.5));
  const terrain = new PlanTerrainSampler(plan);
  for (const count of [3, 4]) {
    const pack = groupSpawns(plan.spawn, count, terrain, 'bout-1', [], SEPARATION);
    assert.ok(pack.ok, `the arc world refused N=${count} altogether`);
    // Twenty-four ring candidates come first — four offsets, three rotations,
    // two passes — so an accepted candidate at or past twenty-four is the arc.
    assert.ok(pack.candidate >= 24, `N=${count} was answered by a ring at candidate ${pack.candidate}`);
    assert.equal(pack.refused.length, 24, `N=${count}: the ring candidates were not all refused`);
    assertPackIsSound(`arc N=${count}`, plan, pack, count);

    // **The arc sits where its comment says it sits.** Candidate 24 is the
    // arc at offset zero, so its candidate centre is the plan's own spawn at
    // z = 0, and the riders' fore-aft extent is centred on it. Built off the
    // sector's sagitta instead, the N=4 arc came out 0.107 m forward of that
    // — the sagitta is the riders' own depth only when somebody sits at each
    // end AND at the middle, which N=4 does not.
    assert.equal(pack.candidate, 24, `N=${count} was not answered by the arc at offset zero`);
    const along = pack.spawns.map((spawn) => spawn.position.z);
    const midpoint = (Math.min(...along) + Math.max(...along)) / 2;
    assert.ok(
      Math.abs(midpoint) < 1e-9,
      `arc N=${count}: the riders sit ${midpoint.toFixed(3)} m off the candidate centre they are measured from`,
    );

    // The property the arc exists for: nobody is pointed back up the route.
    for (const [seat, spawn] of pack.spawns.entries()) {
      assert.ok(
        Math.cos(spawn.headingY) > 0,
        `arc N=${count}: seat ${seat} faces backwards, which is what the ring already did`,
      );
      assert.equal(rideAway(terrain, spawn, 2, 0.25).fault, null, `arc N=${count}: seat ${seat} cannot ride away`);
    }
  }
});

test('a bank is refused even though it has no step in it', () => {
  /*
   * The half of "safe height change" the plane residual cannot see. A constant
   * grade has a residual of zero everywhere by construction, so without
   * `GROUP_SPAWN.maxPackRiseMetres` a pack would be stood happily across a
   * thirty-percent slope. The gentle ramp is the control: the plane test must
   * *admit* an honest grade, which is the whole reason the flat window was
   * replaced.
   */
  for (const grade of [0.03, 0.05, 0.1]) {
    const result = groupSpawns(rampFixture(grade).spawn, 4, new PlanTerrainSampler(rampFixture(grade)), 'bout-1', [], SEPARATION);
    assert.ok(result.ok, `a ${(grade * 100).toFixed(0)} % grade was refused, which is a rideable road`);
  }
  const steep = rampFixture(0.3);
  const refused = groupSpawns(steep.spawn, 4, new PlanTerrainSampler(steep), 'bout-1', [], SEPARATION);
  assert.equal(refused.ok, false, 'a thirty-percent bank was accepted as a start');
  assert.ok(
    !refused.ok && refused.refused.some((one) => /bank rather than a start/.test(one.reason)),
    'the bank was refused for some other reason, so the height bound is not what bit',
  );
});

test('the plan’s authored volumes reach the producer as plain data', () => {
  // The mapping lives in one place so `Game` and this file cannot disagree
  // about whether `plan.solids` counts. It does: the nearest solid to any
  // shipped spawn is a prop box rather than a segment collider.
  const plan = generateLevel('sweep-10').plan;
  const obstacles = groupObstaclesFrom(plan);
  assert.ok(obstacles.length > 0, 'a generated world handed over no volumes at all');
  const kinds = new Set(obstacles.map((one) => one.kind));
  assert.ok(kinds.has('solid'), 'the solid props did not come through');
  assert.equal(
    obstacles.filter((one) => one.shape === 'box').length,
    (plan.solids?.length ?? 0) + (plan.softBodies?.length ?? 0),
    'the box volumes do not match the plan',
  );
  assert.equal(
    obstacles.filter((one) => one.kind === 'hazard').length,
    plan.hazards?.length ?? 0,
    'the hazards do not match the plan',
  );
});
