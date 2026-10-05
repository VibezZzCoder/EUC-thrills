/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_OCCUPANT } from '../data/tuning.ts';
import type { TerrainSampler } from '../simulation/world.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (value: EucController) => { const out = createPose(); value.writePose(out); return out; };
// 2026-10-04 (R2C-1/R2C-3): this pinned a crashed body's denied response as an
// exact no-op, which is what held statues for seconds. A crashed body is never
// held now: its held step takes exactly the native dt, unasked, once per token.
test('a denied late reaction cannot hold a crashed body: its held step advances exactly one native dt, once per token', () => {
  const value = new EucController(flat), native = new EucController(flat);
  for (const rider of [value, native]) { rider.reset(undefined, 12); assert.equal(rider.hardKnock(3, 0), true); for (let tick = 0; tick < 24; tick += 1) rider.step(DT, NEUTRAL_ACTIONS); }
  const notes: unknown[] = [], queries: unknown[] = [];
  value.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    canPlace: () => false, didPlace: request => notes.push(request), canReact: request => { queries.push(request.kind); return false; } });
  const token = value.prepareStep(DT, NEUTRAL_ACTIONS); value.holdPreparedStep(token); value.commitPreparedStep(token, false);
  const before = poseOf(value);
  assert.deepEqual(value.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: true });
  native.step(DT, NEUTRAL_ACTIONS);
  assert.notDeepEqual(poseOf(value), before, 'the fall moved');
  assert.deepEqual(poseOf(value), poseOf(native), 'exactly the native dt');
  assert.equal(value.snapshot().crashTime, native.snapshot().crashTime);
  assert.deepEqual(queries, ['contactClock'], 'asked, denied, and the fall is taken anyway'); assert.equal(notes.length, 0);
  assert.throws(() => value.respondToHeldPhysicalContact(token), /exactly once/); value.publishPreparedPlacements(token); assert.equal(notes.length, 0);
});
