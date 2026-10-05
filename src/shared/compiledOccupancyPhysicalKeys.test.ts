/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from '../simulation/EucController.ts';
import { compileRiderOccupancyCertificate } from './compiledOccupancy.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyPose } from './riderOccupancy.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import type { TerrainSampler } from '../simulation/world.ts';
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = .2; out.normal.y = Math.sqrt(.96); out.normal.z = 0; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const placement = () => new EucController(flat).placementOccupancyPose({ position: { x: 2, y: 0, z: 3 }, headingY: .7 });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
// A stationary rotated footprint projects world coordinates back into its own
// heading frame. Its mathematical residual is zero; floating addition, subtraction
// and the trigonometric round trip can leave a few ulps at the footprint's scale.
const stationaryResidual = (pad: number, pose: RiderOccupancyPose) => {
  const native = buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY);
  const scale = Math.max(1, Math.abs(pose.x), Math.abs(pose.y), Math.abs(pose.z),
    ...[native.wheel, native.human].flatMap(part => [Math.abs(part.x), Math.abs(part.y), Math.abs(part.z), part.halfWidth, part.halfHeight, part.halfLength]));
  const tolerance = 32 * Number.EPSILON * scale;
  assert.ok(pad >= 0 && pad <= tolerance, `stationary projection residual ${pad} > ${tolerance} m`);
};
test('minimal physical placement inputs load into a full native prototype template while the extras-dependent control rejects them', () => {
  const pose = placement(); assert.equal(Object.keys(pose).length, 41); assert.equal('wheelSpin' in pose, false);
  const knownBadValidate = (input: RiderOccupancyPose) => { for (const key of Object.keys(createPose()).filter(key => key !== 'ragdoll')) { if (!Number.isFinite((input as unknown as Record<string, number>)[key])) throw new Error('Non-finite legacy extra source'); } };
  assert.throws(() => knownBadValidate(pose), /Non-finite/, 'known-bad extras-dependent validation must reject a correct minimal physical pose');
  for (const kind of ['wheel', 'mounted-human', 'rag-human'] as const) {
    const full = compileRiderOccupancyCertificate(kind, RIDER_OCCUPANCY, createPose()), minimal = compileRiderOccupancyCertificate(kind, RIDER_OCCUPANCY, pose);
    assert.equal(full.instructionCount, minimal.instructionCount); assert.equal(full.primitiveCount, minimal.primitiveCount);
    const first = full.createSlot(), second = minimal.createSlot(); first.load(pose, pose); second.load(pose, pose);
    assert.deepEqual(first.at(.37), second.at(.37)); stationaryResidual(first.intervalEnvelopeMetres(.2, .8), pose); stationaryResidual(second.intervalEnvelopeMetres(.2, .8), pose);
  }
});
test('actual prospective placement wheel and human certificate footprints match native physical envelopes', () => {
  const pose = placement(), native = buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY);
  for (const kind of ['wheel', 'mounted-human'] as const) {
    const slot = compileRiderOccupancyCertificate(kind, RIDER_OCCUPANCY, createPose()).createSlot(); slot.load(pose, pose);
    const expected = native[kind === 'wheel' ? 'wheel' : 'human'], actual = slot.at(.5);
    close(actual.x, expected.x); close(actual.z, expected.z); close(actual.headingY, expected.headingY);
    close(actual.baseY, expected.baseY); close(actual.topY, expected.topY); close(actual.halfWidth, expected.halfWidth); close(actual.halfLength, expected.halfLength);
    stationaryResidual(slot.intervalEnvelopeMetres(0, 1), pose);
  }
});
test('unrelated extras cannot enter topology or validation while a required physical scalar still rejects', () => {
  const pose = placement(), extra = { ...pose, wheelSpin: NaN, speed: Infinity, recoverBlend: NaN };
  for (const kind of ['wheel', 'mounted-human', 'rag-human'] as const) {
    const clean = compileRiderOccupancyCertificate(kind, RIDER_OCCUPANCY, pose), contaminated = compileRiderOccupancyCertificate(kind, RIDER_OCCUPANCY, extra);
    assert.equal(contaminated.instructionCount, clean.instructionCount); assert.equal(contaminated.primitiveCount, clean.primitiveCount);
    const slot = contaminated.createSlot(), control = clean.createSlot(); slot.load(extra, extra); control.load(pose, pose);
    assert.deepEqual(slot.at(.37), control.at(.37)); stationaryResidual(slot.intervalEnvelopeMetres(.2, .8), pose);
    assert.throws(() => slot.load({ ...pose, groundRoll: NaN }, pose), /groundRoll/);
  }
});
