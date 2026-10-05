/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ragDynamicObstacleSampler } from './populationRagObstacleSampler.ts';
import { CrashRagdoll, defaultRagdollTuning } from '../simulation/ragdoll.ts';
import { SoftBodyField } from '../simulation/softBodies.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import type { PopulationFootprint } from './population.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const box: PopulationFootprint = { x: 0, z: .8, headingY: 0, halfWidthMetres: 3, halfLengthMetres: .25, minY: 0, maxY: 3, velocityX: 0, velocityZ: 0 };
test('dynamic side cast preserves native ground exactly and never returns an NPC roof as terrain', () => {
  const sampler = ragDynamicObstacleSampler(flat, [box]), ground = { height: -1, normal: { x: 1, y: 0, z: 0 }, surface: 'grass' as const, offCourse: true };
  assert.equal(sampler.sampleGround(0, .8, ground).height, 0); assert.equal(sampler.raycast({ x: 0, y: 4, z: .8 }, { x: 0, y: -1, z: 0 }, 10), null);
  assert.equal(sampler.raycastObstacle!({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 2, .1), .55);
  assert.equal(sampler.raycastObstacle!({ x: 0, y: 4, z: 0 }, { x: 0, y: 0, z: 1 }, 2, .1), null);
  assert.equal(ragDynamicObstacleSampler(flat, []), flat, 'clear worlds add no wrapper or changed query');
});
test('actual eleven-particle native fall moves and settles against dynamic side casts; ignoring the actor lets real particles cross its face', () => {
  const guarded = new CrashRagdoll(), ignored = new CrashRagdoll(), t = defaultRagdollTuning(), soft = new SoftBodyField([]);
  const seed = { x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, riderPitch: 0, hipDrop: 0, speed: 12, cause: 'runOut' as const, intoSolid: false, side: 1 };
  guarded.seed(seed, t, DT); ignored.seed(seed, t, DT); const original = Array.from(guarded.positions);
  let knownBad = false;
  for (let tick = 0; tick < 120; tick += 1) {
    guarded.step(DT, tick * DT, 0, -10, ragDynamicObstacleSampler(flat, [box]), soft, t);
    ignored.step(DT, tick * DT, 0, -10, flat, soft, t);
    for (let index = 0; index < ignored.positions.length; index += 3) knownBad ||= ignored.positions[index + 2] > box.z - box.halfLengthMetres + .05;
    for (let index = 0; index < guarded.positions.length; index += 3) if (guarded.positions[index + 1] >= box.minY && guarded.positions[index + 1] <= box.maxY)
      assert.ok(guarded.positions[index + 2] < box.z - box.halfLengthMetres, 'every actually cast native particle stays outside the dynamic face');
  }
  assert.equal(knownBad, true, 'the no-NPC-cast negative must defeat an actual particle face predicate');
  assert.ok(Array.from(guarded.positions).some((value, index) => Math.abs(value - original[index]) > .1), 'native fall must progress rather than freeze pose');
});
