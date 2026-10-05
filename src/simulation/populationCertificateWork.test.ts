/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Certificate work per fixed step (RP-3, 2026-10-03). Every rider and cop is
 * certified at its present pose twice a step for the compact anticipation
 * census; only a moving trajectory reads endpoints or interval ranges.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose, type EucPose } from './EucController.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { compileRiderOccupancyCertificate, type CompiledOccupancySlot } from '../shared/compiledOccupancy.ts';
import { recordedDrunkard90CrashPose } from './physicalOccupancyFixtures.test-support.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';

type Counted = { at: number; interval: number };
type SlotPasses = { at: (t: number) => unknown; runInterval: (a: number, b: number) => void; runPoint: (t: number) => void };
/** Count the shared Slot prototype's at() calls and interval passes while `work` runs. */
function counting(slot: CompiledOccupancySlot, work: () => void): Counted {
  const proto = Object.getPrototypeOf(slot) as SlotPasses;
  const at = proto.at, runInterval = proto.runInterval, counts = { at: 0, interval: 0 };
  proto.at = function (this: unknown, t: number) { counts.at += 1; return at.call(this, t); };
  proto.runInterval = function (this: unknown, a: number, b: number) { counts.interval += 1; return runInterval.call(this, a, b); };
  try { work(); } finally { proto.at = at; proto.runInterval = runInterval; }
  return counts;
}
/** Count evaluated point and interval passes (not calls) while `work` runs. */
function passes(slot: CompiledOccupancySlot, work: () => void): { point: number; interval: number } {
  const proto = Object.getPrototypeOf(slot) as SlotPasses;
  const runPoint = proto.runPoint, runInterval = proto.runInterval, counts = { point: 0, interval: 0 };
  proto.runPoint = function (this: unknown, t: number) { counts.point += 1; return runPoint.call(this, t); };
  proto.runInterval = function (this: unknown, a: number, b: number) { counts.interval += 1; return runInterval.call(this, a, b); };
  try { work(); } finally { proto.runPoint = runPoint; proto.runInterval = runInterval; }
  return counts;
}
const riding = (): EucPose => Object.assign(createPose(), { x: 3.2, y: .4, z: -7.5, headingY: .7, rollAngle: .12,
  riderRoll: .09, crouch: .3, suspensionOffset: -.01, speed: 6 });

test('present-pose (placement and held) components evaluate nothing until a caller reads them', () => {
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  const pose = riding(), probe = compileRiderOccupancyCertificate('wheel', RIDER_CONTACT, createPose()).createSlot();
  for (const role of ['placement', 'held'] as const) {
    let parts: ReturnType<PopulationPhysicalCertificates['components']> = [];
    const counts = counting(probe, () => { parts = certificates.components('human-0', pose, pose, 0, role); });
    assert.deepEqual(counts, { at: 0, interval: 0 }, `${role}: load only, no endpoint or interval pass`);
    assert.deepEqual(parts.map(part => part.componentId), ['wheel', 'human']);
    // The caller's single read is the only point pass, and it is the pose's footprint.
    const read = counting(probe, () => { for (const part of parts) part.at(0); });
    assert.deepEqual(read, { at: 2, interval: 0 });
  }
  // A moving trajectory still evaluates both endpoints eagerly for its velocity.
  const after = { ...pose, x: pose.x + .05 };
  const moving = counting(probe, () => { certificates.components('human-0', pose, after, 1 / 120, 'moving'); });
  assert.deepEqual(moving, { at: 4, interval: 0 });
});

test('the load-time fold diagnostic is taken on demand and matches the eager pass', () => {
  for (const kind of ['wheel', 'mounted-human', 'rag-human'] as const) {
    const before = kind === 'rag-human' ? recordedDrunkard90CrashPose() : riding();
    const after = { ...before, x: before.x + .04, headingY: before.headingY + .01,
      ragdoll: Float64Array.from(before.ragdoll, (value, index) => value + (index % 3 === 0 ? .04 : 0)) };
    const slot = compileRiderOccupancyCertificate(kind, RIDER_CONTACT, createPose()).createSlot();
    const loaded = counting(slot, () => slot.load(before, after));
    assert.equal(loaded.interval, 0, `${kind}: load runs no whole-interval pass`);
    // Interleaved point and envelope passes do not disturb the loaded trajectory's count.
    slot.at(.4); slot.intervalEnvelopeMetres(.2, .6);
    const first = slot.enabledFoldCount, again = counting(slot, () => assert.equal(slot.enabledFoldCount, first));
    assert.equal(again.interval, 0, 'computed once per load');
    const eager = compileRiderOccupancyCertificate(kind, RIDER_CONTACT, createPose()).createSlot();
    eager.load(before, after); eager.intervalEnvelopeMetres(0, 1);
    assert.equal(eager.enabledFoldCount, first);
  }
});

test('a bit-identical reload keeps its evaluated trajectory; any change re-evaluates exactly', () => {
  // The transaction re-certifies an unchanged owner pass after pass, and its
  // compound sweep asks for the same dyadic envelopes pair after pair.
  for (const kind of ['wheel', 'mounted-human'] as const) {
    const before = riding(), after = { ...before, x: before.x + .05, headingY: before.headingY + .02, crouch: .4 };
    const slot = compileRiderOccupancyCertificate(kind, RIDER_CONTACT, createPose()).createSlot();
    slot.load(before, after);
    const envelope = slot.intervalEnvelopeMetres(0, 1), half = slot.intervalEnvelopeMetres(0, .5), point = slot.at(.5);
    const kept = passes(slot, () => {
      slot.load({ ...before }, { ...after });
      assert.equal(slot.intervalEnvelopeMetres(0, 1), envelope); assert.equal(slot.intervalEnvelopeMetres(0, .5), half);
      assert.deepEqual(slot.at(.5), point);
    });
    assert.deepEqual(kept, { point: 0, interval: 0 }, `${kind}: remembered across an identical reload`);
    assert.notEqual(slot.at(.5), slot.at(.5), 'every caller receives its own prism');
    const changed = { ...after, crouch: .41 }, fresh = compileRiderOccupancyCertificate(kind, RIDER_CONTACT, createPose()).createSlot();
    slot.load(before, changed); fresh.load(before, changed);
    assert.equal(slot.intervalEnvelopeMetres(0, 1), fresh.intervalEnvelopeMetres(0, 1));
    assert.deepEqual(slot.at(.5), fresh.at(.5));
  }
});
