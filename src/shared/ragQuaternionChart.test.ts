/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RIDER_OCCUPANCY, POPULATION } from '../data/tuning.ts';
import { RagQuaternionFields } from './ragQuaternionFields.ts';
import { boundRagFrameRanges } from './ragFrameRanges.ts';
import { compileRiderOccupancyCertificate } from './compiledOccupancy.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPrism } from './riderOccupancy.ts';
import { PopulationPhysicalCertificates } from '../simulation/populationPhysicalCertificates.ts';
import { branchBefore, branchAfter, branchInterval, branchActor } from './ragBasisSignBoundaryFixture.ts';
const input = { previous: branchBefore, current: branchAfter, coefficients: RIDER_OCCUPANCY };
function excess(actual: RiderOccupancyPrism, first: RiderOccupancyPrism, last: RiderOccupancyPrism, amount: number) {
  const mix = (a: number, b: number) => a + (b - a) * amount, h = mix(first.headingY, last.headingY), ch = Math.cos(h), sh = Math.sin(h), ca = Math.cos(actual.headingY), sa = Math.sin(actual.headingY);
  let result = Math.max(mix(first.baseY, last.baseY) - actual.baseY, actual.topY - mix(first.topY, last.topY));
  for (const x of [-actual.halfWidth, actual.halfWidth]) for (const z of [-actual.halfLength, actual.halfLength]) {
    const dx = actual.x + ca * x + sa * z - mix(first.x, last.x), dz = actual.z - sa * x + ca * z - mix(first.z, last.z);
    result = Math.max(result, Math.abs(ch * dx - sh * dz) - mix(first.halfWidth, last.halfWidth), Math.abs(sh * dx + ch * dz) - mix(first.halfLength, last.halfLength));
  }
  return result;
}
const exact = (a: RiderOccupancyPrism, b: RiderOccupancyPrism, label: string) => {
  for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'x', 'y', 'z', 'halfWidth', 'halfLength', 'baseY', 'topY'] as const)
    assert.ok(Math.abs(a[key] - b[key]) < 1e-8, `${label}/${key}: ${a[key]} vs ${b[key]}`);
};
test('actual native tick62 basis-sign crossing has a certified trajectory-owned chart, exact physical points and a shrinking sub-skin interval', () => {
  const raw = boundRagFrameRanges(input, ...branchInterval), fields = new RagQuaternionFields(input);
  assert.equal(raw.normalizedFrameCertified, true); assert.ok(raw.quaternionBranches.length >= 2, 'preserved native interval crosses actual basis extraction branches');
  assert.ok(raw.quaternionRanges[1].lo < -.6 && raw.quaternionRanges[1].hi > .6, 'the raw q/-q representation union supplies the exact adversarial width');
  assert.equal(fields.rotationChartsCertified, true, 'chart is proved against full loaded [0,1], not chosen at the failed interval midpoint');
  for (const kind of ['frame', 'root'] as const) for (let axis = 0; axis < 4; axis += 1) {
    const bound = fields.range(kind, axis, ...branchInterval);
    assert.ok(bound.hi - bound.lo < 1e-4, `${kind}/${axis} must preserve quaternion sign correlation`);
    for (const t of [branchInterval[0], (branchInterval[0] + branchInterval[1]) / 2, branchInterval[1]]) {
      const point = fields.range(kind, axis, t, t).lo; assert.ok(point >= bound.lo - 1e-12 && point <= bound.hi + 1e-12);
    }
  }
  const slot = compileRiderOccupancyCertificate('rag-human', RIDER_OCCUPANCY, branchBefore).createSlot(); slot.load(branchBefore, branchAfter);
  const width = branchInterval[1] - branchInterval[0], middle = (branchInterval[0] + branchInterval[1]) / 2,
    intervals = [[0, 1], branchInterval, [middle - width / 20, middle + width / 20]] as const;
  const pads = intervals.map(([lo, hi]) => {
    const first = slot.at(lo), last = slot.at(hi), pad = slot.intervalEnvelopeMetres(lo, hi);
    for (const amount of [0, .13, .5, .77, 1]) {
      const t = lo + (hi - lo) * amount, actual = slot.at(t), source = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(branchBefore, branchAfter, t), RIDER_OCCUPANCY).human;
      exact(actual, source, `native tick62 t=${t}`); assert.ok(excess(source, first, last, amount) <= pad + 1e-8, `continuous enclosure ${lo}/${hi}/${amount}`);
    }
    return pad;
  });
  console.log(JSON.stringify({ diagnostic: 'native-basis-sign-chart-v8', branchInterval, pads, rawQuaternionBranches: raw.quaternionBranches.length }));
  assert.ok(pads[1] < POPULATION.contactSkinMetres, 'same actual interval must refine below unchanged contact skin');
  assert.ok(pads[2] < pads[1], 'further narrowing must strictly tighten the same loaded expression fields');
});
test('whole-quaternion sign representative preserves the exact quadratic rotation without any unit-norm assumption', () => {
  const rotate = (q: readonly number[], p: readonly number[]) => {
    const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
      t = cross(q, p).map(value => 2 * value), second = cross(q, t);
    return p.map((value, i) => value + t[i] * q[3] + second[i]);
  };
  for (const q of [[.6, -.8, .2, .55], [-.3, .1, -.7, 1.2]]) {
    assert.ok(Math.abs(Math.hypot(...q) - 1) > .1, 'nonunit source-compatible quaternion is intentional');
    for (const p of [[.2, .7, -.4], [-.8, .1, .35]]) assert.deepEqual(rotate(q, p), rotate(q.map(value => -value), p));
  }
});
// 2026-10-04 (R2C-1/CR-1): the near-owner conditioning hold this pinned is
// retired; the slot's conservative union below is unchanged.
test('unproven common chart retains conservative raw union; the near owner is no longer held for conditioning', () => {
  const before = { ...branchBefore, ragdollBlend: .25, crashRoll: 0 }, after = { ...before, ragdoll: Float64Array.from(before.ragdoll), crashRoll: 4 * Math.PI },
    broad = { previous: before, current: after, coefficients: RIDER_OCCUPANCY }, fields = new RagQuaternionFields(broad),
    slot = compileRiderOccupancyCertificate('rag-human', RIDER_OCCUPANCY, before).createSlot();
  assert.equal(fields.rotationChartsCertified, false, 'whole trajectory has no proved common root coordinate'); slot.load(before, after);
  const first = slot.at(0), last = slot.at(1), pad = slot.intervalEnvelopeMetres(0, 1); assert.ok(Number.isFinite(pad) && pad >= 0);
  for (const t of [0, .125, .375, .5, .75, 1]) {
    const actual = slot.at(t), source = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, t), RIDER_OCCUPANCY).human;
    exact(actual, source, `uncharted source t=${t}`); assert.ok(excess(source, first, last, t) <= pad + 1e-8);
  }
  const certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, before), owner = certificates.owner('uncharted', before, after, 1 / 120,
    [{ id: 'parked', previous: branchActor, current: branchActor }]);
  assert.equal(owner.admitted, true); assert.equal(owner.requiresConditioningHold, false, 'a rag sweep needs no chart: no conditioning hold');
});
