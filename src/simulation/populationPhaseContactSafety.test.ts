/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucPose } from './EucController.ts';
import { CrashRagdoll } from './ragdoll.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EUC, POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { ragDynamicObstacleSampler } from './populationRagObstacleSampler.ts';
import type { TerrainSampler } from './world.ts';
import type { PopulationFootprint } from './population.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (value: EucController) => { const out = createPose(); value.writePose(out); return out; };
const ragOf = (value: EucController) => (value as unknown as { ragdoll: { positions: Float64Array; previous: Float64Array } }).ragdoll;
const exact = (value: EucController) => ({ pose: poseOf(value), snapshot: value.snapshot(), serial: value.discontinuitySerial,
  positions: Array.from(ragOf(value).positions), previous: Array.from(ragOf(value).previous) });
function flight() {
  const value = new EucController(flat); value.reset(undefined, 6);
  for (let tick = 0; tick < Math.ceil((EUC.hopChargeSeconds + .1) / DT); tick += 1) value.step(DT, { ...NEUTRAL_ACTIONS, crouch: true });
  value.step(DT, { ...NEUTRAL_ACTIONS, hop: true, crouch: true });
  for (let tick = 0; tick < 80 && value.snapshot().grounded; tick += 1) value.step(DT, NEUTRAL_ACTIONS);
  assert.equal(value.snapshot().grounded, false); assert.equal(value.crashed, false); return value;
}
test('horizontal native rag stop preserves all particle Y and vertical Verlet velocity exactly', () => {
  const rag = new CrashRagdoll(), previous = (rag as unknown as { previous: Float64Array }).previous;
  for (let index = 0; index < 11; index += 1) { const base = index * 3;
    rag.positions.set([.01 * index, 2 + .03 * index, -.02 * index], base); previous.set([-.1 + .01 * index, 1.9 + .03 * index, -.2 - .02 * index], base); }
  const before = Array.from(rag.positions), history = Array.from(previous); rag.constrainHorizontalContactVelocity();
  assert.deepEqual(Array.from(rag.positions), before);
  for (let index = 0; index < 11; index += 1) { const base = index * 3;
    assert.equal(previous[base], before[base]); assert.equal(previous[base + 2], before[base + 2]); assert.equal(previous[base + 1], history[base + 1]); }
});
test('actual airborne horizontal settlement preserves vertical state and phase; denied response stays atomic', () => {
  const value = flight(), before = exact(value), queries: string[] = [], notes: unknown[] = [];
  value.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    canReact: request => { queries.push(request.kind); return false; }, didPlace: request => notes.push(request) });
  assert.equal(value.settlePhysicalContact(), false); assert.deepEqual(exact(value), before); assert.deepEqual(queries, ['contactSettle']);
  value.setDynamicWorld(undefined); assert.equal(value.settlePhysicalContact(), true);
  const after = value.snapshot(); assert.equal(after.speed, 0); assert.equal(after.position.y, before.snapshot.position.y);
  assert.equal(after.verticalVelocity, before.snapshot.verticalVelocity); assert.equal(after.airTime, before.snapshot.airTime);
  assert.equal(after.grounded, false); assert.equal(value.crashed, false); assert.equal(value.discontinuitySerial, before.serial); assert.equal(notes.length, 0);
});
// 2026-10-04 (R2C-1/R2C-3): a crashed body is never held, so the partial-rag
// half of this pin now takes exactly its native dt, unasked; the airborne half
// still preserves everything when every late reaction is denied.
test('denied real partial and airborne held full-dt response: the crash falls its native dt, the flight preserves native clocks, serial, Verlet and journal', () => {
  const partial = new EucController(flat), native = new EucController(flat);
  for (const value of [partial, native]) { value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true); for (let tick = 0; tick < 12; tick += 1) value.step(DT, NEUTRAL_ACTIONS); }
  assert.ok(poseOf(partial).ragdollBlend > .8 && poseOf(partial).ragdollBlend < 1);
  {
    const queries: string[] = [];
    partial.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canPlace: () => false, canReact: request => { queries.push(request.kind); return false; } });
    const token = partial.prepareStep(DT, NEUTRAL_ACTIONS); partial.holdPreparedStep(token); partial.commitPreparedStep(token, false);
    assert.deepEqual(partial.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: true });
    native.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(partial), poseOf(native)); assert.deepEqual(queries, ['contactClock']);
    assert.throws(() => partial.respondToHeldPhysicalContact(token), /exactly once/); partial.publishPreparedPlacements(token);
  }
  for (const value of [flight()]) {
    const queries: string[] = [], notes: unknown[] = [];
    value.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canPlace: () => false,
      canReact: request => { queries.push(request.kind); return false; }, didPlace: request => notes.push(request) });
    const token = value.prepareStep(DT, NEUTRAL_ACTIONS); value.holdPreparedStep(token); value.commitPreparedStep(token, false); const before = exact(value);
    assert.deepEqual(value.respondToHeldPhysicalContact(token), { admitted: false, inputAdvanced: false }); assert.deepEqual(exact(value), before);
    assert.deepEqual(queries, ['contactClock', 'contactSettle']); assert.throws(() => value.respondToHeldPhysicalContact(token), /exactly once/);
    value.publishPreparedPlacements(token); assert.equal(notes.length, 0);
  }
});
test('common partial phase correction refuses authored wheel solids and changed ground frame before root or particle/history mutation', () => {
  for (const rejection of ['solid', 'ground'] as const) {
    let reject = false;
    const terrain: TerrainSampler = { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); if (reject && rejection === 'ground') out.normal.z = .01; return out; },
      raycastObstacle() { return reject && rejection === 'solid' ? 0 : null; } };
    const value = new EucController(terrain); value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true);
    for (let tick = 0; tick < 12; tick += 1) value.step(DT, NEUTRAL_ACTIONS);
    const first = poseOf(value); value.step(DT, NEUTRAL_ACTIONS); const proposed = poseOf(value), a = buildRiderOccupancyEnvelope(first, RIDER_CONTACT), b = buildRiderOccupancyEnvelope(proposed, RIDER_CONTACT),
      front = Math.max(...Object.values(a).map(p => p.z + p.halfLength)), lastFront = Math.max(...Object.values(b).map(p => p.z + p.halfLength));
    assert.ok(lastFront > front + .006);
    const actor: PopulationFootprint = { x: 0, z: (front + lastFront) / 2 + 2.4, headingY: 0, halfWidthMetres: 10,
      halfLengthMetres: 2.4, minY: -10, maxY: 10, velocityX: 0, velocityZ: 0 };
    const before = exact(value); reject = true;
    const privatePort = value as unknown as { constrainNativePhaseSideContact(previous: EucPose, bodies: readonly PopulationFootprint[]): boolean };
    assert.equal(privatePort.constrainNativePhaseSideContact(first, [actor]), false, rejection); assert.deepEqual(exact(value), before, rejection);
  }
});
test('unheld genuine partial-rag step at actual particle-ray actor proximity retains ORIGINAL native sampler and byte-identical pose/history', () => {
  const candidate = new EucController(flat), native = new EucController(flat);
  for (const value of [candidate, native]) { value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true); }
  const nativeRag = ragOf(native), initial = Float64Array.from(nativeRag.positions); native.step(DT, NEUTRAL_ACTIONS);
  assert.ok(poseOf(native).ragdollBlend < 1); let index = 0, travel = 0;
  for (let part = 0; part < 11; part += 1) { const length = Math.hypot(nativeRag.positions[part * 3] - initial[part * 3], nativeRag.positions[part * 3 + 2] - initial[part * 3 + 2]);
    if (length > travel) { travel = length; index = part; } }
  assert.ok(travel > .02); const base = index * 3, dx = nativeRag.positions[base] - initial[base], dz = nativeRag.positions[base + 2] - initial[base + 2], actor = {
    x: initial[base] + dx / 2, z: initial[base + 2] + dz / 2, headingY: 0, halfWidthMetres: .025, halfLengthMetres: .025,
    minY: Math.min(initial[base + 1], nativeRag.positions[base + 1]) - .2, maxY: Math.max(initial[base + 1], nativeRag.positions[base + 1]) + .2, velocityX: 0, velocityZ: 0 };
  const hit = ragDynamicObstacleSampler(flat, [actor]).raycastObstacle!({ x: initial[base], y: initial[base + 1], z: initial[base + 2] },
    { x: dx / travel, y: 0, z: dz / travel }, travel, .05);
  assert.ok(hit !== null && hit <= travel, 'actual native partial particle cast reaches actor; an unguarded sampler would alter this input');
  const notes: unknown[] = []; candidate.setDynamicWorld({ hull: POPULATION_OCCUPANT, ragObstacleBodies: () => [actor], didPlace: request => notes.push(request) });
  candidate.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(candidate), poseOf(native)); assert.deepEqual(candidate.snapshot(), native.snapshot());
  assert.deepEqual(Array.from(ragOf(candidate).positions), Array.from(nativeRag.positions)); assert.deepEqual(Array.from(ragOf(candidate).previous), Array.from(nativeRag.previous)); assert.equal(notes.length, 0);
});
