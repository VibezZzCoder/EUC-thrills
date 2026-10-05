/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import { compileRiderOccupancyCertificate } from '../shared/compiledOccupancy.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { resolvePopulationWholeStepRefusal, type PopulationPhysicalOwner } from './populationWholeStepRefusal.ts';
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const footprint = (x: number) => ({ x, z: 0, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 });
function linearOwner(ownerId: string, first: number, last: number, admitted = true): PopulationPhysicalOwner {
  return { ownerId, admitted,
    movingComponents: () => [{ ownerId, componentId: 'wheel', stopGroupId: 'physical', at: time => footprint(first + (last - first) * time), intervalEnvelopeMetres: () => 0 }],
    heldComponents: () => [{ ownerId, componentId: 'wheel', stopGroupId: 'physical', at: () => footprint(first), intervalEnvelopeMetres: () => 0 }] };
}
test('whole-step refusal holds exact starts and recomputes original actor chronology independent of owner order', () => {
  const actor = [{ id: 'walker', previous: footprint(0), current: { ...footprint(4), velocityX: 480 } }], owners = [linearOwner('early', 1, 1.2), linearOwner('late', 3, 3.2)];
  const result = resolvePopulationWholeStepRefusal(actor, owners), reversed = resolvePopulationWholeStepRefusal(actor, [...owners].reverse());
  assert.deepEqual(result.refusedOwnerIds, ['early']); assert.equal(result.ownerFractions.early, 0); assert.equal(result.ownerFractions.late, 1);
  assert.ok(result.batch.actorFractions.walker < .21); assert.deepEqual(result.batch.hits.map(hit => hit.ownerId), ['early']); assert.equal(result.batch.hits[0].componentVelocityX, 0);
  assert.deepEqual({ ...reversed, components: reversed.components.map(c => c.at(.5)) }, { ...result, components: result.components.map(c => c.at(.5)) });
});
test('coarse-miss and clear-world owners allocate no certificate and keep original controller evolution', () => {
  let allocations = 0; const omitted = { ...linearOwner('far', 100, 101, false), movingComponents: () => { allocations += 1; throw new Error('far certificate allocated'); }, heldComponents: () => { allocations += 1; throw new Error('far held certificate allocated'); } };
  const result = resolvePopulationWholeStepRefusal([{ id: 'walker', previous: footprint(0), current: footprint(.1) }], [omitted]); assert.equal(allocations, 0); assert.equal(result.ownerFractions.far, 1); assert.deepEqual(result.refusedOwnerIds, []);
  const direct = new EucController(flat), prepared = new EucController(flat), actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .7 };
  direct.step(1 / 120, actions); const token = prepared.prepareStep(1 / 120, actions); prepared.resolvePreparedStep(token); prepared.commitPreparedStep(token);
  assert.deepEqual(prepared.snapshot(), direct.snapshot());
});
test('certified native prepared components refuse the owner and commit its exact untouched pose without suffix events', () => {
  const controller = new EucController(flat); controller.reset(undefined, 12);
  const before = createPose(); controller.writePose(before);
  const token = controller.prepareStep(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 1, steer: .8 }), after = createPose(); controller.writePreparedPose(token, after);
  const human = compileRiderOccupancyCertificate('mounted-human', RIDER_CONTACT, before).createSlot(), held = compileRiderOccupancyCertificate('mounted-human', RIDER_CONTACT, before).createSlot(); human.load(before, after); held.load(before, before);
  const wheel = compileRiderOccupancyCertificate('wheel', RIDER_CONTACT, before).createSlot(), heldWheel = compileRiderOccupancyCertificate('wheel', RIDER_CONTACT, before).createSlot(); wheel.load(before, after); heldWheel.load(before, before);
  const asFootprint = (p: ReturnType<typeof human.at>) => ({ x: p.x, z: p.z, headingY: p.headingY, halfWidthMetres: p.halfWidth, halfLengthMetres: p.halfLength, minY: p.baseY, maxY: p.topY, velocityX: 0, velocityZ: 0 });
  const farZ = (p: ReturnType<typeof human.at>) => p.z + Math.abs(Math.sin(p.headingY)) * p.halfWidth + Math.abs(Math.cos(p.headingY)) * p.halfLength;
  const start = human.at(0), end = human.at(1), travel = farZ(end) - farZ(start);
  assert.ok(travel > .04, 'fixture must use actual forward native candidate motion');
  const actor = { ...footprint(0), z: farZ(start) + travel * .5, halfWidthMetres: .02, halfLengthMetres: .01 };
  const owner: PopulationPhysicalOwner = { ownerId: 'seat', admitted: true,
    movingComponents: () => [{ ownerId: 'seat', componentId: 'human', stopGroupId: 'physical', at: t => asFootprint(human.at(t)), intervalEnvelopeMetres: (a, b) => human.intervalEnvelopeMetres(a, b) },
      { ownerId: 'seat', componentId: 'wheel', stopGroupId: 'physical', at: t => asFootprint(wheel.at(t)), intervalEnvelopeMetres: (a, b) => wheel.intervalEnvelopeMetres(a, b) }],
    heldComponents: () => [{ ownerId: 'seat', componentId: 'human', stopGroupId: 'physical', at: () => asFootprint(held.at(0)), intervalEnvelopeMetres: () => 0 },
      { ownerId: 'seat', componentId: 'wheel', stopGroupId: 'physical', at: () => asFootprint(heldWheel.at(0)), intervalEnvelopeMetres: () => 0 }] };
  const result = resolvePopulationWholeStepRefusal([{ id: 'walker', previous: actor, current: actor }], [owner]);
  assert.deepEqual(result.refusedOwnerIds, ['seat']); assert.equal(result.ownerFractions.seat, 0);
  const exactBefore = createPose(); controller.writePose(exactBefore); controller.holdPreparedStep(token); controller.commitPreparedStep(token);
  const committed = createPose(); controller.writePose(committed); assert.deepEqual(committed, exactBefore); assert.equal(controller.obstacleImpact, 0); assert.equal(controller.tookOff, false);
});
test('conditioning and blocked placement refusals remain explicit and cannot allocate an uncertified moving graph', () => {
  const base = linearOwner('uncertain', 2, 3), owner = { ...base, requiresConditioningHold: true, movingComponents: () => { throw new Error('uncertified moving graph was queried'); } };
  const conditioned = resolvePopulationWholeStepRefusal([], [owner]); assert.deepEqual(conditioned.refusedOwnerIds, ['uncertain']); assert.equal(conditioned.refusalReasons.uncertain, 'conditioning'); assert.equal(conditioned.ownerFractions.uncertain, 0);
  const placement = resolvePopulationWholeStepRefusal([], [{ ...linearOwner('recovery', 10, 11), placementAllowed: () => false }]); assert.deepEqual(placement.refusedOwnerIds, ['recovery']); assert.equal(placement.refusalReasons.recovery, 'placement'); assert.ok(placement.passes <= 2);
});
