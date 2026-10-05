/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose } from '../simulation/EucController.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { createRiderOccupancyTrajectory, type RiderOccupancyPrism } from './riderOccupancy.ts';
import { compileTightRagHumanTemplate } from './compiledOccupancy.ts';
import { boundRagFrameRanges } from './ragFrameRanges.ts';
/** Exact preserved native controller frame; no mesh/test module import. */
type TestPose = Omit<ReturnType<typeof createPose>, 'ragdoll'> & { ragdoll: Float32Array | Float64Array };
export function recordedDrunkard90CrashPose(): TestPose {
  return Object.assign(createPose(), {
    z: 31.63506726478276, wheelSpin: 126.54026905913103,
    suspensionOffset: -0.00033322566258938693, speed: 29.065786564084053,
    crashBlend: 0.6824305751252547, crashForward: 0.7165521038815175,
    crashLateral: 0.8871597476628312, crashDrop: 0.06824305751252548,
    crashRoll: 0.905161178267115, wheelCrashLean: 0.9895243339316194,
    wheelCrashSpin: -3.9652238467217407, ragdollBlend: 1,
    ragdoll: Float32Array.from([
      0.41067034006118774, 0.14000000059604645, 6.036489963531494,
      0.4061499238014221, 0.14000000059604645, 6.536549091339111,
      0.40287554264068604, 0.11999999731779099, 6.755771160125732,
      0.4907739460468292, 0.10000000149011612, 6.0373759269714355,
      0.32362088561058044, 0.15729959309101105, 6.035799980163574,
      0.5799219608306885, 0.1128053367137909, 6.537757396697998,
      0.23066532611846924, 0.13714304566383362, 6.534643650054932,
      0.5156385898590088, 0.05273155868053436, 7.066773891448975,
      0.39426666498184204, 0.05271805077791214, 7.0377349853515625,
      0.2285277545452118, 0.07237642258405685, 6.760343074798584,
      0.41662195324897766, 0.09258371591567993, 6.718786239624023,
    ]),
  });
}

export function collapsedRecordedCrashPose() {
  const p = recordedDrunkard90CrashPose();
  for (let i = 1; i < 11; i += 1) for (let axis = 0; axis < 3; axis += 1) p.ragdoll[i * 3 + axis] = p.ragdoll[axis];
  return p;
}

const KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'x', 'y', 'z', 'headingY', 'halfWidth', 'halfHeight', 'halfLength', 'baseY', 'topY'] as const;
function excess(actual: RiderOccupancyPrism, first: RiderOccupancyPrism, last: RiderOccupancyPrism, amount: number) {
  const mix = (a: number, b: number) => a + (b - a) * amount, h = mix(first.headingY, last.headingY), ch = Math.cos(h), sh = Math.sin(h), ca = Math.cos(actual.headingY), sa = Math.sin(actual.headingY);
  let result = Math.max(mix(first.baseY, last.baseY) - actual.baseY, actual.topY - mix(first.topY, last.topY));
  for (const x of [-actual.halfWidth, actual.halfWidth]) for (const z of [-actual.halfLength, actual.halfLength]) {
    const dx = actual.x + ca * x + sa * z - mix(first.x, last.x), dz = actual.z - sa * x + ca * z - mix(first.z, last.z);
    result = Math.max(result, Math.abs(ch * dx - sh * dz) - mix(first.halfWidth, last.halfWidth), Math.abs(sh * dx + ch * dz) - mix(first.halfLength, last.halfLength));
  }
  return result;
}
test('compiled active rag preserves native stationary conditioned and collapsed contact dimensions', () => {
  const template = compileTightRagHumanTemplate(RIDER_OCCUPANCY, createPose()), slot = template.createSlot();
  for (const pose of [recordedDrunkard90CrashPose(), collapsedRecordedCrashPose()]) {
    slot.load(pose, pose); const actual = slot.at(.5), live = createRiderOccupancyTrajectory(pose, pose, RIDER_OCCUPANCY).envelopeAt(.5).human;
    for (const key of KEYS) assert.ok(Math.abs(actual[key] - live[key]) < 1e-8, `${key}: ${actual[key]} vs ${live[key]}`);
    assert.ok(slot.intervalEnvelopeMetres(0, 1) < 1e-7, 'stationary frame contributes no interval residual');
  }
});
test('translated collapsed particle trajectories retain exact fallback frame and strict shrinking residual', () => {
  const before = collapsedRecordedCrashPose(), after = collapsedRecordedCrashPose(); after.x += .02; after.headingY += .001; after.crashRoll += .003;
  after.ragdoll = Float64Array.from(before.ragdoll, (v, i) => v + (i % 3 === 0 ? .02 : i % 3 === 1 ? .001 : .003));
  const input = { previous: before, current: after, coefficients: RIDER_OCCUPANCY }, frame = boundRagFrameRanges(input);
  assert.deepEqual(frame.quaternionRanges, [{ lo: 0, hi: 0 }, { lo: 0, hi: 0 }, { lo: 0, hi: 0 }, { lo: 1, hi: 1 }]);
  const slot = compileTightRagHumanTemplate(RIDER_OCCUPANCY, before).createSlot(); slot.load(before, after);
  const pads = [1, .01, .0001].map(width => slot.intervalEnvelopeMetres(0, width));
  assert.ok(pads[0] < .5 && pads[1] < .01 && pads[2] < .0001, `strict practical collapsed residual ${pads}`);
  assert.ok(pads[0] > pads[1] && pads[1] > pads[2]);
  const trajectory = createRiderOccupancyTrajectory(before, after, RIDER_OCCUPANCY);
  for (const time of [0, .17, .5, .83, 1]) {
    const live = trajectory.envelopeAt(time).human, actual = slot.at(time);
    for (const key of ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'] as const) assert.ok(key.startsWith('min') ? actual[key] <= live[key] + 1e-7 : actual[key] + 1e-7 >= live[key]);
    assert.ok(actual.halfWidth / live.halfWidth < 1.25, 'collapsed fallback stays component-sized');
    assert.ok(excess(actual, slot.at(0), slot.at(1), time) <= pads[0] + 1e-7);
  }
});
test('changing conditioned rag continuously encloses native replay and keeps trajectory-owned fold fields', () => {
  const before = recordedDrunkard90CrashPose(), after = recordedDrunkard90CrashPose(); after.x += .02; after.headingY += .001; after.crashRoll += .003;
  after.ragdoll = Float64Array.from(before.ragdoll, (v, i) => v + (i % 3 === 0 ? .02 : i % 3 === 1 ? .001 : .003));
  const template = compileTightRagHumanTemplate(RIDER_OCCUPANCY, before), slot = template.createSlot(), other = template.createSlot(); slot.load(before, after); other.load(before, before);
  const count = slot.enabledFoldCount, snapshot = slot.at(.5), trajectory = createRiderOccupancyTrajectory(before, after, RIDER_OCCUPANCY);
  for (const [from, to] of [[0, 1], [.4, .6], [.499, .501]] as const) {
    const pad = slot.intervalEnvelopeMetres(from, to), first = slot.at(from), last = slot.at(to);
    for (const amount of [0, .17, .5, .83, 1]) {
      const time = from + (to - from) * amount, actual = slot.at(time), live = trajectory.envelopeAt(time).human;
      for (const key of ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'] as const) assert.ok(key.startsWith('min') ? actual[key] <= live[key] + 1e-7 : actual[key] + 1e-7 >= live[key]);
      assert.ok(actual.halfWidth / live.halfWidth < 1.25); assert.ok(excess(actual, first, last, amount) <= pad + 1e-7);
    }
  }
  other.load(after, after); assert.equal(slot.enabledFoldCount, count); assert.deepEqual(slot.at(.5), snapshot);
  const pads = [.2, .02, .002].map(width => slot.intervalEnvelopeMetres(.4, .4 + width)); assert.ok(pads[0] > pads[1] && pads[1] > pads[2]);
});
test('true interior normalization collapse is bounded without treating a native frame jump as differentiable', () => {
  const before = recordedDrunkard90CrashPose(), after = recordedDrunkard90CrashPose();
  for (let axis = 0; axis < 3; axis += 1) after.ragdoll[3 + axis] = 2 * before.ragdoll[axis] - before.ragdoll[3 + axis];
  const slot = compileTightRagHumanTemplate(RIDER_OCCUPANCY, before).createSlot(); slot.load(before, after);
  const pad = slot.intervalEnvelopeMetres(.499, .501), first = slot.at(.499), last = slot.at(.501); assert.ok(Number.isFinite(pad));
  for (const amount of [0, .25, .5, .75, 1]) assert.ok(excess(slot.at(.499 + .002 * amount), first, last, amount) <= pad + 1e-7);
  // Refine on a certified one-sided branch, away from the source threshold.
  const pads = [.01, .001, .0001].map(width => slot.intervalEnvelopeMetres(.4, .4 + width)); assert.ok(pads[0] > pads[1] && pads[1] > pads[2]);
});
test('compiled rag retains strict zero-bound nonlinear-root negative control', () => {
  const before: TestPose = createPose(), after: TestPose = createPose(); before.ragdollBlend = 0; after.ragdollBlend = 1; before.ragdoll = new Float64Array(33); after.ragdoll = new Float64Array(33);
  for (let i = 0; i < 11; i += 1) before.ragdoll[i * 3] = 2;
  const zeroBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }, stance = Object.fromEntries(Object.keys(RIDER_OCCUPANCY.stance).map(key => [key, 0])); stance.carveReactionFullRoll = stance.loadReactionFullPitch = 1;
  const k = { ...RIDER_OCCUPANCY, hipHeight: 0, pedalHeight: 0, stance, torso: zeroBox, boot: zeroBox, headLollExpansion: 0,
    carriage: { minSplay: 0, maxSplay: 0, minRise: 0, maxRise: 0 }, legRadius: 0, armRadius: 0, handRadius: 0, handCarry: { axialFrom: 0, axialTo: 0, radial: 0 } };
  const slot = compileTightRagHumanTemplate(k, before).createSlot(); slot.load(before, after);
  const first = slot.at(0), last = slot.at(1), middle = slot.at(.5), miss = middle.x + middle.halfWidth - (first.x + first.halfWidth + last.x + last.halfWidth) / 2;
  assert.ok(miss > .1, `${miss}`); assert.ok(slot.intervalEnvelopeMetres(0, 1) >= miss - 1e-7);
});
