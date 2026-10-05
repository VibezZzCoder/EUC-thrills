/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from '../simulation/EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPrism } from './riderOccupancy.ts';
import { compileRiderOccupancyCertificate } from './compiledOccupancy.ts';
import type { TerrainSampler } from '../simulation/world.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (value: EucController) => { const out = createPose(); value.writePose(out); return out; };
const KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'x', 'y', 'z', 'headingY', 'halfWidth', 'halfHeight', 'halfLength', 'baseY', 'topY'] as const;
function exact(actual: RiderOccupancyPrism, expected: RiderOccupancyPrism, label: string) {
  for (const key of KEYS) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-8, `${label}/${key}: ${actual[key]} vs ${expected[key]}`);
}
function excess(actual: RiderOccupancyPrism, first: RiderOccupancyPrism, last: RiderOccupancyPrism, amount: number) {
  const mix = (a: number, b: number) => a + (b - a) * amount, h = mix(first.headingY, last.headingY), ch = Math.cos(h), sh = Math.sin(h), ca = Math.cos(actual.headingY), sa = Math.sin(actual.headingY);
  let result = Math.max(mix(first.baseY, last.baseY) - actual.baseY, actual.topY - mix(first.topY, last.topY));
  for (const x of [-actual.halfWidth, actual.halfWidth]) for (const z of [-actual.halfLength, actual.halfLength]) {
    const dx = actual.x + ca * x + sa * z - mix(first.x, last.x), dz = actual.z - sa * x + ca * z - mix(first.z, last.z);
    result = Math.max(result, Math.abs(ch * dx - sh * dz) - mix(first.halfWidth, last.halfWidth), Math.abs(sh * dx + ch * dz) - mix(first.halfLength, last.halfLength));
  }
  return result;
}
test('actual native crash: exact concrete helper endpoints do not inherit a full-step possible-fold sphere', () => {
  const value = new EucController(flat); value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true);
  for (let tick = 0; tick < 12; tick += 1) value.step(DT, NEUTRAL_ACTIONS);
  const before = poseOf(value), token = value.prepareStep(DT, NEUTRAL_ACTIONS), after = createPose(); value.writePreparedPose(token, after);
  const good = compileRiderOccupancyCertificate('rag-human', RIDER_OCCUPANCY, before).createSlot(); good.load(before, after);
  const native = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY).human, actorFace = native.x + native.halfWidth + .05;
  const goodGap = actorFace - (good.at(0).x + good.at(0).halfWidth);
  assert.ok(goodGap > .04999999, `actual helper's +.05m gap must survive in the concrete certificate: ${goodGap}`);
  const rows = [0, .25, .5, .75, 1].map(time => {
    const expected = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_OCCUPANCY).human, actual = good.at(time);
    exact(actual, expected, `native crash t=${time}`);
    return { time, differences: Object.fromEntries(KEYS.map(key => [key, actual[key] - expected[key]])) };
  });
  console.log(JSON.stringify({ diagnostic: 'concrete-fold-endpoint-reconciliation', goodGap, rows }));
});
test('actual native crash transitions keep exact concrete replay and interval enclosure across fold changes', () => {
  const value = new EucController(flat); value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true);
  const template = compileRiderOccupancyCertificate('rag-human', RIDER_OCCUPANCY, poseOf(value)), slot = template.createSlot();
  for (let tick = 0; tick < 40; tick += 1) {
    const before = poseOf(value); value.step(DT, NEUTRAL_ACTIONS); const after = poseOf(value); slot.load(before, after);
    for (const [from, to] of [[0, 1], [.4, .6], [.499, .501]] as const) {
      const a = slot.at(from), b = slot.at(to), pad = slot.intervalEnvelopeMetres(from, to);
      for (const amount of [0, .17, .5, .83, 1]) {
        const time = from + amount * (to - from), actual = slot.at(time), native = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_OCCUPANCY).human;
        exact(actual, native, `tick=${tick}/t=${time}`);
        assert.ok(excess(actual, a, b, amount) <= pad + 1e-7, `certified interval ${tick}/${from}/${to}/${amount}: ${pad}`);
      }
    }
  }
});
test('true interior folded branch remains enclosed while non-folded endpoints stay exact and independently rebound slots stay unchanged', () => {
  const before = createPose(), after = createPose(); before.wobbleSway = -1; after.wobbleSway = 1; before.wobbleFootCorrection = after.wobbleFootCorrection = 1;
  // Remove unrelated torso/carriage dominance, and keep the released-foot
  // branch strictly outside the unequal-bone reach. The old fixture's released
  // target was folded at BOTH endpoints, hiding the intended interior fold.
  // All tested geometry still comes from the actual authoritative helper.
  const zeroBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  const stance = Object.fromEntries(Object.keys(RIDER_OCCUPANCY.stance).map(key => [key, 0]));
  Object.assign(stance, { carveReactionFullRoll: 1, loadReactionFullPitch: 1, thighLength: 1, shinLength: .5,
    wobbleFootAdjust: 1, oneFootOutboard: 3, oneFootTrail: 3 });
  const coefficients = { ...RIDER_OCCUPANCY, hipHeight: 0, pedalHeight: 0, stance, torso: zeroBox, boot: zeroBox,
    headLollExpansion: 0, carriage: { minSplay: 0, maxSplay: 0, minRise: 0, maxRise: 0 },
    legRadius: 0, armRadius: 0, handRadius: 0, handCarry: { axialFrom: 0, axialTo: 0, radial: 0 } };
  const template = compileRiderOccupancyCertificate('mounted-human', coefficients, before), slot = template.createSlot(), other = template.createSlot(); slot.load(before, after);
  const a = slot.at(0), b = slot.at(1), middle = slot.at(.5), pad = slot.intervalEnvelopeMetres(0, 1), miss = excess(middle, a, b, .5);
  assert.ok(miss > .49, `actual interior folded emission must defeat a zero residual by the derived .5m sphere growth: ${miss}`); assert.ok(pad >= miss - 1e-8);
  assert.ok(Math.abs(a.topY - 1) < 1e-8 && Math.abs(b.topY - 1) < 1e-8 && Math.abs(middle.topY - 1.5) < 1e-8,
    `endpoint upper-bone sphere and interior folded sphere must be the active authoritative supports: ${[a.topY, middle.topY, b.topY]}`);
  for (const time of [0, .005, .25, .5, .75, .995, 1]) exact(slot.at(time), buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), coefficients).human, `forced fold ${time}`);
  const snapshot = slot.at(.005); other.load(after, after); slot.intervalEnvelopeMetres(0, .01); assert.deepEqual(slot.at(.005), snapshot);
  const pads = [.01, .001, .0001].map(width => slot.intervalEnvelopeMetres(0, width)); assert.ok(pads[0] > pads[1] && pads[1] > pads[2], `branch-local shrinking ${pads}`);
});
