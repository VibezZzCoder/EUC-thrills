/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose } from '../simulation/EucController.ts';
import { RIDER_CONTACT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPrism } from './riderOccupancy.ts';
import { compileOccupancyTemplate, compileTightRagHumanTemplate } from './compiledOccupancy.ts';

const KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'x', 'y', 'z', 'headingY', 'halfWidth', 'halfHeight', 'halfLength', 'baseY', 'topY'] as const;
function supportExcess(actual: RiderOccupancyPrism, first: RiderOccupancyPrism, last: RiderOccupancyPrism, amount: number) {
  const mix = (a: number, b: number) => a + (b - a) * amount, heading = mix(first.headingY, last.headingY), ch = Math.cos(heading), sh = Math.sin(heading);
  const cx = mix(first.x, last.x), cz = mix(first.z, last.z), width = mix(first.halfWidth, last.halfWidth), length = mix(first.halfLength, last.halfLength);
  const ca = Math.cos(actual.headingY), sa = Math.sin(actual.headingY); let excess = 0;
  for (const x of [-actual.halfWidth, actual.halfWidth]) for (const z of [-actual.halfLength, actual.halfLength]) {
    const dx = actual.x + ca * x + sa * z - cx, dz = actual.z - sa * x + ca * z - cz;
    excess = Math.max(excess, Math.abs(ch * dx - sh * dz) - width, Math.abs(sh * dx + ch * dz) - length);
  }
  return Math.max(excess, mix(first.baseY, last.baseY) - actual.baseY, actual.topY - mix(first.topY, last.topY));
}
test('compiled wheel and mounted human preserve native static point envelopes and stationary rotated controls', () => {
  const base = createPose();
  for (const component of ['wheel', 'human'] as const) {
    const slot = compileOccupancyTemplate(component, RIDER_OCCUPANCY, base).createSlot();
    for (const i of [0, 1, 2, 3]) {
      const pose = Object.assign(createPose(), { x: i * .3, y: .24, z: -i * .2, headingY: .3 + i * .5,
        groundPitch: i * .02, groundRoll: -i * .035, rollAngle: i * .09, riderRoll: i * .13,
        riderPitch: i * .03, riderTurnTwist: i * .04, suspensionOffset: -i * .008, crouch: i * .09,
        tuck: i * .05, attack: i * .1, carveStance: i * .13, reverseBlend: i * .04,
        restFactor: i * .03, crashBlend: i * .02, crashLateral: i * .007, crashForward: i * .009,
        crashDrop: i * .004, crashRoll: i * .02, crashTumble: i * .03, wheelCrashLean: i * .025,
        styleSway: -i * .2, styleRoll: i * .015, styleYaw: i * .012, wobbleRoll: i * .01,
        wobbleYaw: i * .005, wobbleFight: i * .03, wobbleFootCorrection: i * .08, wobbleSway: i * .14 });
      slot.load(pose, pose); const actual = slot.at(.37), native = buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY)[component];
      for (const key of KEYS) assert.ok(Math.abs(actual[key] - native[key]) < 1e-8, `${component}/${i}/${key}: ${actual[key]} vs ${native[key]}`);
      assert.ok(slot.intervalEnvelopeMetres(0, 1) < 1e-8, 'stationary rotated geometry cannot manufacture padding');
    }
  }
});
test('continuous certificates enclose native replay and contract when chronological intervals narrow', () => {
  const before = createPose(), after = createPose(); Object.assign(before, { x: 2, y: .2, headingY: .4, rollAngle: -.12, riderRoll: -.17, crouch: .12 });
  Object.assign(after, before, { x: 2.08, y: .201, headingY: .403, rollAngle: -.124, riderRoll: -.174, crouch: .122, suspensionOffset: -.003 });
  for (const component of ['wheel', 'human'] as const) {
    const slot = compileOccupancyTemplate(component, RIDER_OCCUPANCY, before).createSlot(); slot.load(before, after);
    for (const [from, to] of [[0, 1], [.4, .6], [.499, .501]] as const) {
      const first = slot.at(from), last = slot.at(to), pad = slot.intervalEnvelopeMetres(from, to);
      for (const amount of [0, .17, .5, .83, 1]) {
        const time = from + (to - from) * amount, actual = slot.at(time), native = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_OCCUPANCY)[component];
        for (const key of ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'] as const) assert.ok(key.startsWith('min') ? actual[key] <= native[key] + 1e-8 : actual[key] + 1e-8 >= native[key]);
        assert.ok(supportExcess(actual, first, last, amount) <= pad + 1e-8, `${component}/${from}/${to}/${time}`);
      }
    }
    const pads = [1, .1, .01].map(width => slot.intervalEnvelopeMetres(0, width));
    assert.ok(pads[0] > pads[1] && pads[1] > pads[2], `${component} shrinking control ${pads}`);
  }
});
test('trajectory-owned forced-fold fields remain fixed while the solver narrows and other seats rebind', () => {
  const before = createPose(), after = createPose(); before.wobbleSway = -1; after.wobbleSway = 1; before.wobbleFootCorrection = after.wobbleFootCorrection = 1;
  const coefficients = { ...RIDER_OCCUPANCY, hipHeight: RIDER_OCCUPANCY.pedalHeight + RIDER_OCCUPANCY.stance.ankleAbovePedal,
    stance: { ...RIDER_OCCUPANCY.stance, thighLength: 1, shinLength: .5, wobbleFootAdjust: 1 } };
  const template = compileOccupancyTemplate('human', coefficients, before), first = template.createSlot(), second = template.createSlot();
  first.load(before, after); second.load(before, before); assert.ok(first.enabledFoldCount > second.enabledFoldCount);
  const count = first.enabledFoldCount, snapshot = first.at(.005), pad = first.intervalEnvelopeMetres(0, .01);
  second.load(after, after); assert.equal(first.enabledFoldCount, count); assert.deepEqual(first.at(.005), snapshot);
  assert.ok(supportExcess(first.at(.005), first.at(0), first.at(.01), .5) <= pad + 1e-8);
});
test('strict known-bad zero-bound interior controls remain positive for each component', () => {
  for (const component of ['wheel', 'human'] as const) {
    const before = createPose(), after = createPose();
    if (component === 'wheel') { before.rollAngle = -.8; after.rollAngle = .8; after.ragdollBlend = 1; }
    else { before.groundRoll = -.65; after.groundRoll = .65; }
    const slot = compileOccupancyTemplate(component, RIDER_OCCUPANCY, before).createSlot(); slot.load(before, after);
    const first = slot.at(0), last = slot.at(1), middle = slot.at(.5), miss = middle.topY - (first.topY + last.topY) / 2;
    assert.ok(miss > 1e-4, `${component} must defeat the known-bad zero residual: ${miss}`);
    assert.ok(slot.intervalEnvelopeMetres(0, 1) >= miss - 1e-8);
  }
  const pose = createPose(); assert.throws(() => compileOccupancyTemplate('human', RIDER_OCCUPANCY, pose).createSlot().load(pose, { ...pose, ragdollBlend: .1 }), /rejects active/);
});

/**
 * VIS-CRASH-1 (2026-10-04): the living world's contact core (`RIDER_CONTACT`:
 * shoulder-height torso box, head sphere, lens elbows and knees, no released
 * boot) compiles to exactly the native builder's prism, its certificates still
 * enclose the native replay, and it is the smaller body it was made to be.
 */
test('the contact core compiles to the native builder exactly, encloses its replay, and is tighter than the containment envelope', () => {
  const poses = [0, 1, 2, 3].map(i => Object.assign(createPose(), { x: i * .3, y: .24, z: -i * .2, headingY: .3 + i * .5,
    groundPitch: i * .02, groundRoll: -i * .035, rollAngle: i * .09, riderRoll: i * .13, riderPitch: i * .17, wheelPitch: i * .08,
    riderTurnTwist: i * .04, suspensionOffset: -i * .008, crouch: i * .09, tuck: i * .05, attack: i * .1, carveStance: i * .13,
    reverseBlend: i * .04, restFactor: i * .03, crashBlend: i * .02, airBlend: i * .3, airHeight: i * .1, styleSway: -i * .2,
    wobbleFight: i * .03, wobbleFootCorrection: i * .08, wobbleSway: i * .14 }));
  const template = compileOccupancyTemplate('human', RIDER_CONTACT, poses[0]), slot = template.createSlot();
  for (const [index, pose] of poses.entries()) {
    slot.load(pose, pose); const actual = slot.at(.5), native = buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).human;
    for (const key of KEYS) assert.ok(Math.abs(actual[key] - native[key]) < 1e-8, `core ${index}/${key}: ${actual[key]} vs ${native[key]}`);
    const envelope = buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY).human;
    assert.ok(native.halfWidth < envelope.halfWidth - .1 && native.maxZ < envelope.maxZ - .15, `core ${index} is tighter than the envelope`);
  }
  const before = poses[1], after = Object.assign(createPose(), before, { x: before.x + .08, headingY: before.headingY + .003, riderPitch: before.riderPitch + .01, airBlend: before.airBlend + .05 });
  slot.load(before, after);
  for (const [from, to] of [[0, 1], [.4, .6]] as const) {
    const first = slot.at(from), last = slot.at(to), pad = slot.intervalEnvelopeMetres(from, to);
    for (const amount of [0, .25, .5, .75, 1]) {
      const time = from + (to - from) * amount, native = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_CONTACT).human;
      assert.ok(supportExcess(native, first, last, amount) <= pad + 1e-8, `core enclosure ${from}/${to}/${time}`);
    }
  }
  // The head sphere is the core's top: a rider who tucks keeps it above the torso box.
  const head = buildRiderOccupancyEnvelope(createPose(), RIDER_CONTACT).human;
  assert.ok(Math.abs(head.maxY - (RIDER_CONTACT.hipHeight + RIDER_CONTACT.head.y + RIDER_CONTACT.head.radius)) < .05, `head top ${head.maxY}`);
  // The rag certificate compiles the same head sphere (grown by the loll).
  const rag = Object.assign(createPose(), { ragdollBlend: 1, crashBlend: 1 }); rag.ragdoll.set(Array.from({ length: 33 }, (_, i) => [0, RIDER_CONTACT.hipHeight + (i % 3) * .1, 0][i % 3]));
  const ragSlot = compileTightRagHumanTemplate(RIDER_CONTACT, rag).createSlot(); ragSlot.load(rag, rag);
  const ragNative = buildRiderOccupancyEnvelope(rag, RIDER_CONTACT).human, ragActual = ragSlot.at(0);
  for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) assert.ok(Math.abs(ragActual[key] - ragNative[key]) < 1e-6, `rag core ${key}`);
});
