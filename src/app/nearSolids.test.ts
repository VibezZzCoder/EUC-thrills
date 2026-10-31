/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NEAR_SOLID, WHEEL } from '../data/tuning.ts';
import { createLevel } from '../level/levels.ts';
import { createPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { createNearSolids, faceDirection, measureNearSolids, tyreStepLift } from './nearSolids.ts';

/**
 * The near-solid answers — 1.4.0 ride fixes (the owner's first Foundry Yard
 * ride, 2026-10-31), against the yard's own plan and sampler.
 *
 * Defect 1 was the tyre through the five-stair's risers: the contact patch
 * rises only when it crosses a riser, so the drawn circle stood up to 0.18 m
 * inside the next step's nose. The pin rides the contact up the stairs in
 * millimetre steps and holds the lifted circle clear of the ground the
 * sampler itself reports. What the rig does with the answers is
 * `render/ridingRigNearSolids.test.ts`'s.
 */

const yard = new PlanTerrainSampler(createLevel('skatepark'));
const RADIUS = WHEEL.tyreDiameter / 2;
const sample = createGroundSample();
const ground = (x: number, z: number): number => yard.sampleGround(x, z, sample).height;

/** How deep a tyre circle on the heading's vertical plane stands in the ground, metres. */
function depthIn(x: number, wheelY: number, z: number, forwardZ: number): number {
  let deepest = Number.NEGATIVE_INFINITY;
  for (let step = -250; step <= 250; step += 1) {
    const s = step / 1000;
    const bottom = wheelY + RADIUS - Math.sqrt(Math.max(0, RADIUS * RADIUS - s * s));
    deepest = Math.max(deepest, ground(x, z + forwardZ * s) - bottom);
  }
  return deepest;
}

test('up and down the five-stair, the lifted tyre never stands in a step (and the unlifted one did)', () => {
  let worstBefore = 0;
  let worstAfter = Number.NEGATIVE_INFINITY;
  for (const forwardZ of [-1, 1]) {
    for (let millimetre = 110_400; millimetre >= 108_200; millimetre -= 1) {
      const z = millimetre / 1000;
      const y = ground(121.6, z);
      const lift = tyreStepLift(yard, 121.6, y, z, 0, forwardZ);
      worstBefore = Math.max(worstBefore, depthIn(121.6, y, z, forwardZ));
      worstAfter = Math.max(worstAfter, depthIn(121.6, y + lift, z, forwardZ));
    }
  }
  assert.ok(worstBefore > 0.17, `the control lost the defect: ${worstBefore} m`);
  // The bisection places an edge to 0.4 mm and a 1 mm scan can see that much.
  assert.ok(worstAfter < 0.002, `the drawn tyre stands ${worstAfter} m inside a step`);
});

test('the lift is continuous across a riser: the drawn wheel lands on the tread as the contact does', () => {
  // The second riser (0.18 → 0.36) at z = 109.55, ridden up (heading −Z).
  const before = ground(121.6, 109.5505) + tyreStepLift(yard, 121.6, ground(121.6, 109.5505), 109.5505, 0, -1);
  const after = ground(121.6, 109.5495) + tyreStepLift(yard, 121.6, ground(121.6, 109.5495), 109.5495, 0, -1);
  assert.ok(Math.abs(before - after) < 0.002, `the drawn wheel jumps ${after - before} m at the riser`);
});

test('no lift on flat floor, on a bank, or against a face the wheel cannot climb', () => {
  // Open floor at the start lane.
  assert.equal(tyreStepLift(yard, 100, ground(100, 124), 124, 1, 0), 0);
  // Up bank-W's 25° face toward the deck: smooth ground is never a step.
  for (let x = 114.2; x <= 116.8; x += 0.05) {
    assert.equal(tyreStepLift(yard, x, ground(x, 102), 102, 1, 0), 0, `bank at x ${x.toFixed(2)}`);
  }
  // Nose to the deck's 0.90 m east face from the euro pit: a wall, not a nose.
  assert.equal(tyreStepLift(yard, 127.26, 0, 99.5, -1, 0), 0);
});

test('the faces: the deck to the left at the standoff in its low bands, riding or parked; nothing in the air or a crash', () => {
  const out = createNearSolids();
  const pose = createPose();
  pose.x = 127.26; pose.z = 99.5; pose.headingY = Math.PI;
  const bands = NEAR_SOLID.bandHeights;
  const count = NEAR_SOLID.directions;
  const left = count / 4;
  const direction: [number, number] = [0, 0];
  assert.deepEqual(faceDirection(left, direction).map((value) => Math.round(value * 1e9) / 1e9), [1, 0]);
  for (const rest of [0, 1]) {
    pose.restFactor = rest;
    measureNearSolids(yard, pose, out);
    for (let band = 0; band < bands.length; band += 1) {
      const distance = out.faces[band * count + left];
      if (bands[band] < 0.9) {
        assert.ok(Math.abs(distance - 0.26) < 1e-9, `rest ${rest}, band ${band} reads ${distance}`);
        // The deck's east face, facing +X toward the rider.
        const entry = band * count + left;
        assert.deepEqual([out.normals[2 * entry], out.normals[2 * entry + 1]].map((value) => Math.round(value * 1e9) / 1e9 + 0), [1, 0]);
      }
      else assert.equal(distance, Number.POSITIVE_INFINITY, `rest ${rest}: the probe over the deck top hit at band ${band}`);
    }
    // Straight to the right is open floor.
    for (let band = 0; band < bands.length; band += 1) {
      assert.equal(out.faces[band * count + 3 * count / 4], Number.POSITIVE_INFINITY);
    }
  }
  // Airborne or crashing: no faces reported, no lift.
  for (const change of [
    () => { pose.airHeight = 0.2; },
    () => { pose.airHeight = 0; pose.crashBlend = 0.5; },
  ]) {
    change();
    measureNearSolids(yard, pose, out);
    assert.ok(out.faces.every((distance) => distance === Number.POSITIVE_INFINITY));
    assert.equal(out.lift, 0);
  }
});

test('stopped with the tyre on a nose, the drawn wheel rolls back off it onto the tread its boot can reach', () => {
  const out = createNearSolids();
  const pose = createPose();
  for (const z of [109.58, 109.6, 109.65, 109.7, 109.75]) {
    pose.x = 121.6; pose.z = z; pose.y = ground(121.6, z); pose.headingY = Math.PI;
    pose.restFactor = 0;
    measureNearSolids(yard, pose, out);
    assert.ok(out.lift > NEAR_SOLID.restLiftMax, `riding at z ${z} the tyre climbs the nose (${out.lift})`);
    assert.equal(out.along, 0);
    pose.restFactor = 1;
    measureNearSolids(yard, pose, out);
    assert.ok(out.lift <= NEAR_SOLID.restLiftMax + 1e-9, `parked at z ${z}: ${out.lift} m of lift left`);
    // Heading −Z, so rolling back is a negative `along`.
    assert.ok(out.along < 0 && out.along > -RADIUS, `parked at z ${z}: rolled ${out.along} m`);
    const drawnZ = z - out.along;
    assert.ok(depthIn(121.6, pose.y + out.lift, drawnZ, -1) < 0.002, `parked at z ${z}: the tyre stands in a step`);
  }
});
