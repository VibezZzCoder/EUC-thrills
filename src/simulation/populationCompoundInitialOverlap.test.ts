/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolvePopulationCompoundMotionBatch as legacy, type PopulationCompoundTrajectory } from './populationCompound.ts';
import { resolvePopulationCompoundMotionBatch as strict } from './populationCompound.ts';
import { resolvePopulationWholeStepRefusal } from './populationWholeStepRefusal.ts';
import { compileRiderOccupancyCertificate } from '../shared/compiledOccupancy.ts';
import { resolvePopulationCompoundMotionBatch as horizontalOnly } from './populationCompoundHorizontalEscape.test-support.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { createPose } from './EucController.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { sweepPopulationHulls, type PopulationFootprint } from './population.ts';
const policy = { certifiedInitialOverlap: 'continuous-proof' as const };
const body = (x = 0, z = 0): PopulationFootprint => ({ x, z, headingY: 0, halfWidthMetres: .28, halfLengthMetres: .28, minY: 0, maxY: 1.9, velocityX: 0, velocityZ: 0 });
const linear = (first: PopulationFootprint, last = first): PopulationCompoundTrajectory => ({ ownerId: 'human', componentId: 'human', stopGroupId: 'physical',
  at: time => ({ ...first, x: first.x + (last.x - first.x) * time, z: first.z + (last.z - first.z) * time }), intervalEnvelopeMetres: () => 0 });
test('actual compiled articulated initial overlap grows into the NPC before clearing its endpoint; strict policy refuses the endpoint escape', () => {
  const before = createPose(), after = createPose(); before.groundRoll = -.65; after.groundRoll = .65;
  const slot = compileRiderOccupancyCertificate('mounted-human', RIDER_CONTACT, before).createSlot(); slot.load(before, after);
  const firstTop = slot.at(0).topY, lastTop = slot.at(1).topY; after.y = firstTop - lastTop - .02; slot.load(before, after);
  const at: PopulationCompoundTrajectory['at'] = time => { const part = slot.at(time); return { ...body(part.x, part.z), headingY: part.headingY,
    halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength, minY: part.baseY, maxY: part.topY }; };
  const component: PopulationCompoundTrajectory = { ownerId: 'human', componentId: 'human', stopGroupId: 'physical', at,
    intervalEnvelopeMetres: (low, high) => slot.intervalEnvelopeMetres(low, high) };
  const first = at(0), last = at(1), middle = at(.5), npc = { ...body(first.x, first.z), minY: first.maxY - .005, maxY: first.maxY + 1.9 };
  assert.ok(sweepPopulationHulls(first, first, npc, npc)?.initiallyOverlapping, 'the actual compiled human must start inside the shallow NPC band');
  assert.equal(sweepPopulationHulls(last, last, npc, npc), null, 'exact endpoint must clear vertically');
  assert.ok(middle.maxY > first.maxY + .01, 'actual articulated torso must go further inward than its initial overlap');
  assert.ok(component.intervalEnvelopeMetres(0, 1) > .01, 'the trajectory must carry its real nonzero enclosure');
  const actors = [{ id: 'npc', previous: npc, current: npc }];
  assert.deepEqual(legacy(actors, [component]).hits, [], 'retained endpoint-only escape must fail this actual articulated witness');
  assert.equal(strict(actors, [component], policy).hits.length, 1);
  const held = { ...component, at: () => first, intervalEnvelopeMetres: () => 0 };
  const resolution = resolvePopulationWholeStepRefusal(actors, [{ ownerId: 'human', admitted: true, movingComponents: () => [component], heldComponents: () => [held] }]);
  assert.deepEqual(resolution.refusedOwnerIds, ['human']); assert.equal(resolution.ownerFractions.human, 0); assert.ok(resolution.passes <= 2);
});
test('a linear NPC may leave a held native component under the continuous fixed-support SAT proof', () => {
  const held = linear({ ...body(), halfWidthMetres: .4, halfLengthMetres: .4 });
  const actors = [{ id: 'npc', previous: body(.3), current: body(2) }];
  assert.ok(sweepPopulationHulls(held.at(0), held.at(0), actors[0].previous, actors[0].previous)?.initiallyOverlapping);
  assert.equal(sweepPopulationHulls(held.at(1), held.at(1), actors[0].current, actors[0].current), null);
  const result = strict(actors, [held], policy); assert.deepEqual(result, legacy(actors, [held])); assert.equal(result.actorFractions.npc, 1); assert.deepEqual(result.hits, []);
});
test('clear certified full steps retain legacy batch bytes under the strict policy', () => {
  const component = linear({ ...body(), halfWidthMetres: .4, halfLengthMetres: .4 }, body(.1, .1));
  const actors = [{ id: 'far', previous: body(20), current: body(21) }];
  assert.deepEqual(strict(actors, [component], policy), legacy(actors, [component]));
  const result = resolvePopulationWholeStepRefusal(actors, [{ ownerId: 'human', admitted: false, movingComponents: () => { throw new Error('coarse clear owner must stay lazy'); }, heldComponents: () => [] }]);
  assert.deepEqual(result.refusedOwnerIds, []); assert.equal(result.ownerFractions.human, 1); assert.equal(result.passes, 1);
});
test('legacy actor-only endpoint escape remains the default even when certified component policy is selected', () => {
  const actors = [{ id: 'first', previous: body(), current: body() }, { id: 'second', previous: body(.3), current: body(2) }];
  assert.deepEqual(strict(actors, [], policy), legacy(actors, [])); assert.equal(strict(actors, [], policy).actorFractions.second, 1);
});
test('a prior actor stop invalidates a once-outward certified escape before the moving component goes inward', () => {
  const component = linear({ ...body(), halfWidthMetres: .4, halfLengthMetres: .4 }, body(2));
  const actors = [{ id: 'escaping-npc', previous: body(.3), current: body(3.3) }, { id: 'blocker', previous: body(1.4), current: body(1.4) }];
  const old = legacy(actors, [component]), repaired = strict(actors, [component], policy);
  const oldHit = old.hits.find(hit => hit.actorId === 'escaping-npc'), newHit = repaired.hits.find(hit => hit.actorId === 'escaping-npc');
  assert.ok(oldHit && newHit, 'both chronologies must reach the actual initially touching owner pair');
  assert.ok(newHit.timeOfImpact < oldHit.timeOfImpact - 1e-4, 'strict proof must recheck the actual velocity change at the earlier actor stop');
  assert.ok(repaired.componentFractions['human/human'] < old.componentFractions['human/human']);
});

/** Pure translation of the actual native envelope is exactly affine in y;
 * constant support and a zero residual are an analytic certificate here. */
function nativeVerticalWitness() {
  const human = buildRiderOccupancyEnvelope(createPose(), RIDER_CONTACT).human;
  const first: PopulationFootprint = { ...body(human.x, human.z), headingY: human.headingY,
    halfWidthMetres: human.halfWidth, halfLengthMetres: human.halfLength, minY: human.baseY, maxY: human.topY };
  const npc = { ...body(first.x, first.z), minY: first.maxY - .005, maxY: first.maxY + 1.9 };
  return { first, npc };
}
test('zero-residual actual native human translated vertically deepens an initial NPC overlap before its endpoint clears', () => {
  const { first, npc } = nativeVerticalWitness();
  const component: PopulationCompoundTrajectory = { ownerId: 'human', componentId: 'human', stopGroupId: 'physical',
    at: time => ({ ...first, minY: first.minY + 4 * time, maxY: first.maxY + 4 * time }), intervalEnvelopeMetres: () => 0 };
  const initial = sweepPopulationHulls(component.at(0), component.at(0), npc, npc), interior = sweepPopulationHulls(component.at(.5), component.at(.5), npc, npc);
  const verticalDepth = (value: PopulationFootprint) => Math.min(value.maxY, npc.maxY) - Math.max(value.minY, npc.minY);
  assert.ok(initial?.initiallyOverlapping && verticalDepth(component.at(0)) < .006); assert.ok(interior && verticalDepth(component.at(.5)) > verticalDepth(component.at(0)) + .01);
  assert.equal(sweepPopulationHulls(component.at(1), component.at(1), npc, npc), null); assert.equal(component.intervalEnvelopeMetres(0, 1), 0);
  const actors = [{ id: 'npc', previous: npc, current: npc }];
  assert.deepEqual(horizontalOnly(actors, [component], policy).hits, [], 'preserved v1 horizontal-only proof must miss this true vertical-affine interior intrusion');
  assert.deepEqual(legacy(actors, [component]).hits, [], 'legacy endpoint-only escape remains the known-bad default for this certified component');
  assert.equal(strict(actors, [component], policy).hits.length, 1);
});
test('vertical-affine NPC motion also declines the flat escape exception against a held native component', () => {
  const { first, npc } = nativeVerticalWitness(), component = linear(first);
  const last = { ...npc, minY: npc.minY - 4, maxY: npc.maxY - 4 }, interior = { ...npc, minY: npc.minY - 2, maxY: npc.maxY - 2 };
  const initial = sweepPopulationHulls(first, first, npc, npc), middle = sweepPopulationHulls(first, first, interior, interior);
  const verticalDepth = (value: PopulationFootprint) => Math.min(first.maxY, value.maxY) - Math.max(first.minY, value.minY);
  assert.ok(initial?.initiallyOverlapping); assert.ok(middle && verticalDepth(interior) > verticalDepth(npc) + .01); assert.equal(sweepPopulationHulls(first, first, last, last), null);
  const actors = [{ id: 'npc', previous: npc, current: last }];
  assert.deepEqual(horizontalOnly(actors, [component], policy).hits, [], 'preserved v1 must fail both vertical moving-body roles');
  assert.equal(strict(actors, [component], policy).hits.length, 1);
});
