/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose } from '../simulation/EucController.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { recordedDrunkard90CrashPose, collapsedRecordedCrashPose } from './physicalOccupancyFixtures.test-support.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { resolvePopulationWholeStepRefusal } from './populationWholeStepRefusal.ts';
const body = (x: number, z: number) => ({ x, z, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 });
test('coarse-miss ordinary and detached-rag owners allocate no runtime certificate slots', () => {
  const cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose()), far = body(500, 500), actors = [{ id: 'far', previous: far, current: far }];
  for (const before of [createPose(), recordedDrunkard90CrashPose()]) {
    const after = { ...before, x: before.x + .02, headingY: before.headingY + .001, ragdoll: Float64Array.from(before.ragdoll, (v, i) => v + (i % 3 === 0 ? .02 : 0)) };
    const owner = cache.owner('seat', before, after, 1 / 120, actors); assert.equal(owner.admitted, false);
    assert.deepEqual(resolvePopulationWholeStepRefusal(actors, [owner]).refusedOwnerIds, []);
  }
  assert.equal(cache.allocatedSlotCount, 0);
});
test('active human and wheel remain separate native-sized bodies and stable collapsed translation stays admitted', () => {
  const cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  for (const before of [recordedDrunkard90CrashPose(), collapsedRecordedCrashPose()]) {
    const live = buildRiderOccupancyEnvelope(before, RIDER_CONTACT), nearby = body(live.human.x, live.human.z), actors = [{ id: 'near', previous: nearby, current: nearby }];
    const after = { ...before, x: before.x + .02, headingY: before.headingY + .001, ragdoll: Float64Array.from(before.ragdoll, (v, i) => v + (i % 3 === 0 ? .02 : i % 3 === 1 ? .001 : .003)) };
    const owner = cache.owner('seat', before, after, 1 / 120, actors); assert.equal(owner.admitted, true); assert.equal(owner.requiresConditioningHold, false);
    const held = owner.heldComponents(); assert.deepEqual(held.map(c => c.componentId), ['wheel', 'human']);
    for (const component of held) {
      const actual = component.at(.73), expected = live[component.componentId as 'wheel' | 'human'];
      assert.ok(Math.abs(actual.halfWidthMetres - expected.halfWidth) < 1e-8); assert.ok(Math.abs(actual.halfLengthMetres - expected.halfLength) < 1e-8);
      assert.equal(actual.velocityX, 0); assert.equal(actual.velocityZ, 0); assert.equal(component.intervalEnvelopeMetres(0, 1), 0);
    }
    assert.ok(Math.abs(held[0].at(0).z - held[1].at(0).z) > 20, 'detached human may not be teleported into a merged wheel field');
  }
});
// 2026-10-04 (R2C-1/CR-1): this used to pin a whole-step 'conditioning' hold
// for a near frame collapse. That hold froze ordinary wipeouts into statues,
// so a rag's moving human is now the straight particle-bounded sweep, which
// needs no frame certificate, and no rag trajectory is held for one.
test('near true frame-collapse trajectory is never a conditioning hold; its human is the straight particle sweep', () => {
  const before = recordedDrunkard90CrashPose(), after = recordedDrunkard90CrashPose();
  for (let axis = 0; axis < 3; axis += 1) after.ragdoll[3 + axis] = 2 * before.ragdoll[axis] - before.ragdoll[3 + axis];
  const live = buildRiderOccupancyEnvelope(before, RIDER_CONTACT), nearby = body(live.human.x + 2, live.human.z), actors = [{ id: 'near', previous: nearby, current: nearby }];
  const cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose()), owner = cache.owner('seat', before, after, 1 / 120, actors);
  assert.equal(owner.admitted, true); assert.equal(owner.requiresConditioningHold, false);
  assert.notEqual(resolvePopulationWholeStepRefusal(actors, [owner]).refusalReasons.seat, 'conditioning');
  assert.equal(resolvePopulationWholeStepRefusal(actors, [{ ...owner, nativeFall: true }]).refusalReasons.seat, undefined, 'a crashed owner is never refused by contact');
  // 2026-10-04: the straight sweep is a crashed body's; a body whose fall only
  // starts in this step keeps the certified enclosure (review r3, minor).
  assert.ok(owner.movingComponents().find(c => c.componentId === 'human')!.intervalEnvelopeMetres(0, 1) > 0);
  const fallen = cache.owner('seat', before, after, 1 / 120, actors, false, true);
  const human = fallen.movingComponents().find(c => c.componentId === 'human')!;
  assert.equal(human.intervalEnvelopeMetres(0, 1), 0);
  const end = buildRiderOccupancyEnvelope(after, RIDER_CONTACT).human, radii = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07];
  for (const [t, prism, pose] of [[0, live.human, before], [1, end, after]] as const) {
    const at = human.at(t), c = Math.cos(at.headingY), s = Math.sin(at.headingY);
    const inside = (x: number, z: number, hx: number, hz: number) => { const dx = x - at.x, dz = z - at.z;
      return Math.abs(dx * c - dz * s) + hx <= at.halfWidthMetres + 1e-9 && Math.abs(dx * s + dz * c) + hz <= at.halfLengthMetres + 1e-9; };
    assert.ok(Math.abs(at.headingY - prism.headingY) < 1e-12 && inside(prism.x, prism.z, prism.halfWidth, prism.halfLength), 'the sweep contains each end');
    for (let i = 0; i < 11; i += 1) assert.ok(inside(pose.ragdoll[i * 3], pose.ragdoll[i * 3 + 2], radii[i], radii[i]), `and each particle (${i})`);
  }
});
test('R2C-1: a wipeout is admitted only within its particles\' physical reach, however large its frame gain', () => {
  // The frame-collapse step above had a ~300 m gain-squared admission radius.
  const before = recordedDrunkard90CrashPose(), after = recordedDrunkard90CrashPose();
  for (let axis = 0; axis < 3; axis += 1) after.ragdoll[3 + axis] = 2 * before.ragdoll[axis] - before.ragdoll[3 + axis];
  const cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose()), pelvis = { x: before.ragdoll[0], z: before.ragdoll[2] };
  for (const distance of [50, 8, 3]) {
    const actor = body(pelvis.x + distance, pelvis.z), owner = cache.owner('seat', before, after, 1 / 120, [{ id: 'a', previous: actor, current: actor }]);
    assert.equal(owner.admitted, false, `an actor ${distance} m from the body is not admitted`);
  }
  const touching = body(pelvis.x + .9, pelvis.z);
  assert.equal(cache.owner('seat', before, after, 1 / 120, [{ id: 'a', previous: touching, current: touching }]).admitted, true, 'an actor within reach is');
  assert.equal(cache.allocatedSlotCount, 0, 'admission allocates no certificate slot');
});
