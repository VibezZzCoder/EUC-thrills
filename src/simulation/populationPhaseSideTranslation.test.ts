/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { RIDER_CONTACT, POPULATION } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPose } from '../shared/riderOccupancy.ts';
import { proposeRiderPhaseSideProjection } from '../shared/riderSideContact.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import type { TerrainSampler } from './world.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const posed = (value: EucController) => { const out = createPose(); value.writePose(out); return out; };
const move = (p: RiderOccupancyPose, x: number, z: number): RiderOccupancyPose => ({ ...p, x: p.x + x, z: p.z + z,
  ragdoll: Float64Array.from(p.ragdoll, (v, i) => v + (i % 3 === 0 ? x : i % 3 === 2 ? z : 0)) });
function samples() {
  const value = new EucController(flat); value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true);
  for (let tick = 0; tick < 24; tick += 1) value.step(DT, NEUTRAL_ACTIONS);
  const base = posed(value);
  return [0, .1, .3, .5, .833333333333, .999, 1].flatMap(blend => [-1, 0, 1].flatMap(style => [-.7, .2].map(spin => ({ ...base,
    ragdoll: Float64Array.from(base.ragdoll), ragdollBlend: blend, styleSway: style, styleYaw: style * .07, styleRoll: style * .04,
    wheelCrashSpin: spin, wheelCrashPop: .08, groundPitch: .03, groundRoll: -.02 }))));
}
test('common root and world-particle XZ translation preserves BOTH authoritative component shapes at all blends/styles/moving wheel states', () => {
  for (const before of samples()) {
    const after = move(before, -.037, .023), a = buildRiderOccupancyEnvelope(before, RIDER_CONTACT), b = buildRiderOccupancyEnvelope(after, RIDER_CONTACT);
    for (const key of ['wheel', 'human'] as const) {
      assert.ok(Math.abs(b[key].x - a[key].x + .037) < 2e-12, `${key} X blend ${before.ragdollBlend}`);
      assert.ok(Math.abs(b[key].z - a[key].z - .023) < 2e-12, `${key} Z blend ${before.ragdollBlend}`);
      for (const field of ['halfWidth', 'halfLength', 'baseY', 'topY'] as const) assert.ok(Math.abs(a[key][field] - b[key][field]) < 2e-12, `${key}/${field}`);
    }
  }
  const partial = samples().find(p => p.ragdollBlend === .5)!, source = buildRiderOccupancyEnvelope(partial, RIDER_CONTACT),
    incomplete = buildRiderOccupancyEnvelope({ ...partial, x: partial.x - .037, z: partial.z + .023 }, RIDER_CONTACT);
  assert.ok(Math.abs(incomplete.human.x - source.human.x + .037) > .005,
    'known-bad root-only correction fails the SAME exact partial human translation law');
});
test('same-expression continuous phase certificate contains actual common translations, with shrinking bounds across every blend', () => {
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, samples()[0]);
  for (const [index, before] of samples().entries()) {
    const after = move(before, -.037, .023), components = certificates.components(`phase-${index}`, before, after, DT, 'moving');
    for (const component of components) {
      for (const time of [0, .13, .41, .73, 1]) {
        const expected = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_CONTACT)[component.componentId as 'wheel' | 'human'], actual = component.at(time);
        assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.z - expected.z) < 1e-9);
        assert.ok(Math.abs(actual.halfWidthMetres - expected.halfWidth) < 1e-9 && Math.abs(actual.halfLengthMetres - expected.halfLength) < 1e-9);
      }
      const full = component.intervalEnvelopeMetres(0, 1), small = component.intervalEnvelopeMetres(.5, .501);
      assert.ok(Number.isFinite(full) && full >= 0 && Number.isFinite(small) && small >= 0 && small <= full + 1e-12);
    }
  }
});
test('joint halfplanes protect separate actual wheel/human bodies without unioning or inventing initial-intrusion escape', () => {
  for (const before of samples()) {
    const parts = buildRiderOccupancyEnvelope(before, RIDER_CONTACT), right = Math.max(parts.wheel.x + parts.wheel.halfWidth, parts.human.x + parts.human.halfWidth),
      blocker = { x: right + .28 + .05, z: 0, headingY: 0, halfWidthMetres: .28, halfLengthMetres: 10, minY: -10, maxY: 10 };
    const proposed = move(before, .1, .015), correction = proposeRiderPhaseSideProjection(before, proposed, [blocker], RIDER_CONTACT, POPULATION.contactSkinMetres);
    assert.ok(correction && correction.x < -.049);
    const actual = buildRiderOccupancyEnvelope(move(proposed, correction.x, correction.z), RIDER_CONTACT);
    for (const part of Object.values(actual)) assert.ok(blocker.x - blocker.halfWidthMetres - part.x - part.halfWidth >= POPULATION.contactSkinMetres - 1e-12);
    assert.equal(proposeRiderPhaseSideProjection(move(before, .1, 0), proposed, [blocker], RIDER_CONTACT, POPULATION.contactSkinMetres), null);
  }
});
