/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import type { TerrainSampler } from '../simulation/world.ts';
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (controller: EucController) => { const pose = createPose(); controller.writePose(pose); return pose; };
test('refused late reaction cannot overwrite an already-resolved private step or its exact detached query journals', () => {
  const notes: string[] = []; let reactions = 0;
  const guarded = new EucController(flat), direct = new EucController(flat);
  for (const controller of [guarded, direct]) controller.reset(undefined, 12);
  guarded.setDynamicWorld({ hull: { halfWidthMetres: .3, halfLengthMetres: .3, heightMetres: 2 },
    resolveMotion: () => null, canPlace: () => true, didPlace: request => notes.push(request.reason),
    canReact: () => { reactions += 1; return false; } });
  const dt = 1 / 120, actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .5 }, start = poseOf(guarded), state = guarded.snapshot();
  const token = guarded.prepareStep(dt, actions); guarded.resolvePreparedStep(token);
  const pending = createPose(); guarded.writePreparedPose(token, pending);
  assert.equal(token.ready, true); assert.ok(Math.hypot(pending.x - start.x, pending.z - start.z) > .05, 'prepared step must contain actual uncommitted native movement');
  assert.ok(token.resolvedMotionRequests.length > 0, 'the token needs an actual detached movement journal');
  const motions = token.resolvedMotionRequests, placements = token.resolvedPlacementRequests;
  assert.equal(guarded.hardKnock(3, 0), false); assert.equal(reactions, 1);
  assert.deepEqual(poseOf(guarded), start); assert.deepEqual(guarded.snapshot(), state); assert.equal(token.ready, true);
  const retained = createPose(); guarded.writePreparedPose(token, retained); assert.deepEqual(retained, pending);
  assert.equal(token.resolvedMotionRequests, motions); assert.equal(token.resolvedPlacementRequests, placements); assert.equal(notes.length, 0);
  // Commit directly: replaying here could conceal an overwritten private copy.
  guarded.commitPreparedStep(token); direct.step(dt, actions);
  assert.deepEqual(poseOf(guarded), poseOf(direct)); assert.deepEqual(guarded.snapshot(), direct.snapshot()); assert.equal(notes.length, 0);
});
