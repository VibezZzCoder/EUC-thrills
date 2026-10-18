/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION, RIDER_CONTACT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyCoefficients, type RiderOccupancyPose } from './riderOccupancy.ts';
import { proposeFullRagWheelSideProjection, proposeWheelClearOfBodies, proposeWheelSideProjection,
  type RiderSideContactBlocker } from './riderSideContact.ts';

/**
 * Golden pins for the three wheel-only side-contact consumers (perf-actions
 * 2026-10-17, item "controller" A). They were recorded on the frozen pre-change
 * tree, where every one of them read `buildRiderOccupancyEnvelope(...).wheel`;
 * the wheel-only build must reproduce each output bit for bit, -0 included.
 * Cases: a crashed wheel pushing into a person beside it (one blocker and two,
 * so the two-plane corner is taken), one already clear of them, one that starts
 * inside them (null), and the airborne wheel let go above someone.
 */
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1;
  out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };

function crashedPose(ticks: number, headingY = 0): RiderOccupancyPose {
  const value = new EucController(flat);
  value.reset({ position: { x: 0, y: 0, z: 0 }, headingY }, 12);
  assert.equal(value.hardKnock(3 * Math.cos(headingY), -3 * Math.sin(headingY)), true);
  for (let i = 0; i < ticks; i += 1) value.step(DT, NEUTRAL_ACTIONS);
  const pose = createPose(); value.writePose(pose); return pose;
}

/**
 * A person `gap` metres off the wheel's own right side, `along` metres ahead
 * of it, turned `turn` from the wheel's heading.
 */
function besideWheel(pose: RiderOccupancyPose, k: RiderOccupancyCoefficients, gap: number, turn = 0.05, along = 0): RiderSideContactBlocker {
  const wheel = buildRiderOccupancyEnvelope(pose, k).wheel, h = wheel.headingY, side = wheel.halfWidth + 0.28 + gap;
  return { x: wheel.x + Math.cos(h) * side + Math.sin(h) * along, z: wheel.z - Math.sin(h) * side + Math.cos(h) * along,
    headingY: h + turn, halfWidthMetres: 0.28, halfLengthMetres: 0.28, minY: 0, maxY: 1.8 };
}

/** A person `gap` metres ahead of the wheel's nose, turned `turn` from its heading. */
function aheadOfWheel(pose: RiderOccupancyPose, k: RiderOccupancyCoefficients, gap: number, turn = -0.05): RiderSideContactBlocker {
  const wheel = buildRiderOccupancyEnvelope(pose, k).wheel, h = wheel.headingY, ahead = wheel.halfLength + 0.28 + gap;
  return { x: wheel.x + Math.sin(h) * ahead, z: wheel.z + Math.cos(h) * ahead,
    headingY: h + turn, halfWidthMetres: 0.28, halfLengthMetres: 0.28, minY: 0, maxY: 1.8 };
}

/** The pose moved `right` metres to the wheel's right and `ahead` metres forward. */
function shifted(pose: RiderOccupancyPose, right: number, ahead: number): RiderOccupancyPose {
  const h = pose.headingY;
  return { ...pose, x: pose.x + Math.cos(h) * right + Math.sin(h) * ahead, z: pose.z - Math.sin(h) * right + Math.cos(h) * ahead };
}

/** Numbers as themselves, but -0 and non-finite values spelled out so a JSON pin can hold them. */
function exact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'number' && (Object.is(v, -0) || !Number.isFinite(v)) ? `num:${Object.is(v, -0) ? '-0' : String(v)}` : v));
}

function cases(): Record<string, unknown> {
  const skin = POPULATION.contactSkinMetres, reserve = skin + POPULATION.nativePhaseRetryReserveMetres;
  const out: Record<string, unknown> = {};
  for (const [label, k] of [['contact', RIDER_CONTACT], ['occupancy', RIDER_OCCUPANCY]] as const) {
    for (const [phase, ticks, heading] of [['onset', 3, 0], ['rag', 24, 0], ['turned', 30, 1.1]] as const) {
      const before = crashedPose(ticks, heading), inward = shifted(before, 0.1, 0.02), diagonal = shifted(before, 0.1, 0.1);
      const near = besideWheel(before, k, 0.05), corner = aheadOfWheel(before, k, 0.04);
      const far = besideWheel(before, k, 2.5);
      const inside = besideWheel(before, k, -0.08);
      const key = `${label}/${phase}`;
      out[`${key}/side/push`] = proposeWheelSideProjection(before, inward, [near], k, skin);
      out[`${key}/side/push-reserve`] = proposeWheelSideProjection(before, inward, [near], k, reserve);
      out[`${key}/side/corner`] = proposeWheelSideProjection(before, diagonal, [near, corner], k, reserve);
      out[`${key}/side/clear`] = proposeWheelSideProjection(before, before, [far], k, skin);
      out[`${key}/side/inside`] = proposeWheelSideProjection(before, inward, [inside], k, skin);
      out[`${key}/full-rag/push`] = proposeFullRagWheelSideProjection(before, inward, [near], k, skin);
      out[`${key}/full-rag/corner`] = proposeFullRagWheelSideProjection(before, diagonal, [near, corner], k, reserve);
      out[`${key}/full-rag/clear`] = proposeFullRagWheelSideProjection(before, before, [far], k, skin);
      // Let go in the air above someone: the person straddles the wheel's footprint.
      const hung = { ...before, y: before.y + 0.6 };
      const under = { ...besideWheel(hung, k, -0.3, 0.3), maxY: hung.y + 0.2 };
      out[`${key}/clear-of/under`] = proposeWheelClearOfBodies(hung, [under], k, reserve);
      out[`${key}/clear-of/two`] = proposeWheelClearOfBodies(hung, [under, { ...under, x: under.x - 0.2, z: under.z + 0.3, headingY: -0.5 }], k, reserve);
      out[`${key}/clear-of/far`] = proposeWheelClearOfBodies(hung, [far], k, reserve);
      out[`${key}/clear-of/above`] = proposeWheelClearOfBodies(before, [{ ...near, x: near.x - 0.3, minY: 5, maxY: 6 }], k, reserve);
    }
  }
  return exact(out) as Record<string, unknown>;
}

/** Recorded on the frozen pre-change tree (2026-10-17). Re-record only for a deliberate crash-physics change, never to make a refactor pass. */
const PINNED: Record<string, unknown> = {
  'contact/onset/side/push': {"x":-0.06464424030638055,"z":0,"planes":[{"x":-1,"z":0,"required":0.06464424030638055}],"normals":[{"x":-1,"z":0}]},
  'contact/onset/side/push-reserve': {"x":-0.08964424030638055,"z":0,"planes":[{"x":-1,"z":0,"required":0.08964424030638055}],"normals":[{"x":-1,"z":0}]},
  'contact/onset/side/corner': {"x":-0.08964424030638055,"z":-0.09964424030638044,"planes":[{"x":-1,"z":0,"required":0.08964424030638055},{"x":"num:-0","z":-1,"required":0.09964424030638044}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'contact/onset/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'contact/onset/side/inside': null,
  'contact/onset/full-rag/push': null,
  'contact/onset/full-rag/corner': null,
  'contact/onset/full-rag/clear': null,
  'contact/onset/clear-of/under': {"x":-0.3962398748203447,"z":0,"planes":[{"x":-1,"z":0,"required":0.3962398748203447}],"normals":[{"x":-1,"z":0}]},
  'contact/onset/clear-of/two': {"x":-0.3962398748203447,"z":-0.4646921202937134,"planes":[{"x":-1,"z":0,"required":0.3962398748203447},{"x":"num:-0","z":-1,"required":0.4646921202937134}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'contact/onset/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'contact/onset/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
  'contact/rag/side/push': {"x":-0.0646442403063805,"z":0,"planes":[{"x":-1,"z":0,"required":0.0646442403063805}],"normals":[{"x":-1,"z":0}]},
  'contact/rag/side/push-reserve': {"x":-0.08964424030638049,"z":0,"planes":[{"x":-1,"z":0,"required":0.08964424030638049}],"normals":[{"x":-1,"z":0}]},
  'contact/rag/side/corner': {"x":-0.08964424030638049,"z":-0.09964424030638067,"planes":[{"x":-1,"z":0,"required":0.08964424030638049},{"x":"num:-0","z":-1,"required":0.09964424030638067}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'contact/rag/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'contact/rag/side/inside': null,
  'contact/rag/full-rag/push': {"x":-0.0646442403063805,"z":0,"planes":[{"x":-1,"z":0,"required":0.0646442403063805}],"normals":[{"x":-1,"z":0}]},
  'contact/rag/full-rag/corner': {"x":-0.08964424030638049,"z":-0.09964424030638067,"planes":[{"x":-1,"z":0,"required":0.08964424030638049},{"x":"num:-0","z":-1,"required":0.09964424030638067}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'contact/rag/full-rag/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'contact/rag/clear-of/under': {"x":-0.3962398748203448,"z":0,"planes":[{"x":-1,"z":0,"required":0.3962398748203448}],"normals":[{"x":-1,"z":0}]},
  'contact/rag/clear-of/two': {"x":-0.3962398748203448,"z":-0.5273877481951084,"planes":[{"x":-1,"z":0,"required":0.3962398748203448},{"x":"num:-0","z":-1,"required":0.5273877481951084}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'contact/rag/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'contact/rag/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
  'contact/turned/side/push': {"x":-0.02932237667547704,"z":0.05761142274662615,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.06464424030638022}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'contact/turned/side/push-reserve': {"x":-0.040662279711116474,"z":0.07989160674816204,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638021}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'contact/turned/side/corner': {"x":-0.12946596005989316,"z":0.03469336582278976,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638032},{"x":-0.8912073600614354,"z":-0.4535961214255773,"required":0.0996442403063805}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354},{"x":-0.8912073600614354,"z":-0.4535961214255773}]},
  'contact/turned/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":-2.4853557596936198}]},
  'contact/turned/side/inside': null,
  'contact/turned/full-rag/push': {"x":-0.02932237667547704,"z":0.05761142274662615,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.06464424030638022}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'contact/turned/full-rag/corner': {"x":-0.12946596005989316,"z":0.03469336582278976,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638032},{"x":-0.8912073600614354,"z":-0.4535961214255773,"required":0.0996442403063805}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354},{"x":-0.8912073600614354,"z":-0.4535961214255773}]},
  'contact/turned/full-rag/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":-2.4853557596936198}]},
  'contact/turned/clear-of/under': {"x":-0.1797328703726647,"z":0.3531318927897132,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.39623987482034484}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'contact/turned/clear-of/two': null,
  'contact/turned/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'contact/turned/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/onset/side/push': {"x":-0.06464424030638055,"z":0,"planes":[{"x":-1,"z":0,"required":0.06464424030638055}],"normals":[{"x":-1,"z":0}]},
  'occupancy/onset/side/push-reserve': {"x":-0.08964424030638055,"z":0,"planes":[{"x":-1,"z":0,"required":0.08964424030638055}],"normals":[{"x":-1,"z":0}]},
  'occupancy/onset/side/corner': {"x":-0.08964424030638055,"z":-0.09964424030638044,"planes":[{"x":-1,"z":0,"required":0.08964424030638055},{"x":"num:-0","z":-1,"required":0.09964424030638044}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'occupancy/onset/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'occupancy/onset/side/inside': null,
  'occupancy/onset/full-rag/push': null,
  'occupancy/onset/full-rag/corner': null,
  'occupancy/onset/full-rag/clear': null,
  'occupancy/onset/clear-of/under': {"x":-0.3962398748203447,"z":0,"planes":[{"x":-1,"z":0,"required":0.3962398748203447}],"normals":[{"x":-1,"z":0}]},
  'occupancy/onset/clear-of/two': {"x":-0.3962398748203447,"z":-0.4646921202937134,"planes":[{"x":-1,"z":0,"required":0.3962398748203447},{"x":"num:-0","z":-1,"required":0.4646921202937134}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'occupancy/onset/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/onset/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/rag/side/push': {"x":-0.0646442403063805,"z":0,"planes":[{"x":-1,"z":0,"required":0.0646442403063805}],"normals":[{"x":-1,"z":0}]},
  'occupancy/rag/side/push-reserve': {"x":-0.08964424030638049,"z":0,"planes":[{"x":-1,"z":0,"required":0.08964424030638049}],"normals":[{"x":-1,"z":0}]},
  'occupancy/rag/side/corner': {"x":-0.08964424030638049,"z":-0.09964424030638067,"planes":[{"x":-1,"z":0,"required":0.08964424030638049},{"x":"num:-0","z":-1,"required":0.09964424030638067}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'occupancy/rag/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'occupancy/rag/side/inside': null,
  'occupancy/rag/full-rag/push': {"x":-0.0646442403063805,"z":0,"planes":[{"x":-1,"z":0,"required":0.0646442403063805}],"normals":[{"x":-1,"z":0}]},
  'occupancy/rag/full-rag/corner': {"x":-0.08964424030638049,"z":-0.09964424030638067,"planes":[{"x":-1,"z":0,"required":0.08964424030638049},{"x":"num:-0","z":-1,"required":0.09964424030638067}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'occupancy/rag/full-rag/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-1,"z":0,"required":-2.4853557596936193}]},
  'occupancy/rag/clear-of/under': {"x":-0.3962398748203448,"z":0,"planes":[{"x":-1,"z":0,"required":0.3962398748203448}],"normals":[{"x":-1,"z":0}]},
  'occupancy/rag/clear-of/two': {"x":-0.3962398748203448,"z":-0.5273877481951084,"planes":[{"x":-1,"z":0,"required":0.3962398748203448},{"x":"num:-0","z":-1,"required":0.5273877481951084}],"normals":[{"x":-1,"z":0},{"x":"num:-0","z":-1}]},
  'occupancy/rag/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/rag/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/turned/side/push': {"x":-0.02932237667547704,"z":0.05761142274662615,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.06464424030638022}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'occupancy/turned/side/push-reserve': {"x":-0.040662279711116474,"z":0.07989160674816204,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638021}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'occupancy/turned/side/corner': {"x":-0.12946596005989316,"z":0.03469336582278976,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638032},{"x":-0.8912073600614354,"z":-0.4535961214255773,"required":0.0996442403063805}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354},{"x":-0.8912073600614354,"z":-0.4535961214255773}]},
  'occupancy/turned/side/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":-2.4853557596936198}]},
  'occupancy/turned/side/inside': null,
  'occupancy/turned/full-rag/push': {"x":-0.02932237667547704,"z":0.05761142274662615,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.06464424030638022}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'occupancy/turned/full-rag/corner': {"x":-0.12946596005989316,"z":0.03469336582278976,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.08964424030638032},{"x":-0.8912073600614354,"z":-0.4535961214255773,"required":0.0996442403063805}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354},{"x":-0.8912073600614354,"z":-0.4535961214255773}]},
  'occupancy/turned/full-rag/clear': {"x":0,"z":0,"normals":[],"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":-2.4853557596936198}]},
  'occupancy/turned/clear-of/under': {"x":-0.1797328703726647,"z":0.3531318927897132,"planes":[{"x":-0.4535961214255773,"z":0.8912073600614354,"required":0.39623987482034484}],"normals":[{"x":-0.4535961214255773,"z":0.8912073600614354}]},
  'occupancy/turned/clear-of/two': null,
  'occupancy/turned/clear-of/far': {"x":0,"z":0,"normals":[],"planes":[]},
  'occupancy/turned/clear-of/above': {"x":0,"z":0,"normals":[],"planes":[]},
};

test('the wheel-only side-contact consumers reproduce their pre-change outputs bit for bit', () => {
  const now = cases();
  assert.deepStrictEqual(Object.keys(now), Object.keys(PINNED));
  for (const key of Object.keys(PINNED)) assert.deepStrictEqual(now[key], PINNED[key], key);
});

test('the pins are not vacuous: pushes, a two-plane corner, clear answers and nulls all occur', () => {
  const now = cases() as Record<string, { x: number; z: number; normals: unknown[] } | null>;
  const pushes = Object.entries(now).filter(([, v]) => v && typeof v.x === 'number' && v.x !== 0).map(([k]) => k);
  for (const family of ['/side/push', '/side/corner', '/full-rag/push', '/clear-of/under', '/clear-of/two'])
    assert.ok(pushes.some((key) => key.endsWith(family)), `some ${family} case must push the wheel`);
  assert.ok(Object.entries(now).some(([k, v]) => k.endsWith('/side/corner') && v && v.normals.length === 2), 'a two-plane corner is pinned');
  assert.ok(Object.entries(now).some(([k, v]) => k.endsWith('/side/inside') && v === null), 'an initial intrusion is pinned as null');
  assert.ok(Object.entries(now).some(([k, v]) => k.endsWith('/full-rag/push') && v === null), 'a partial blend full-rag refusal is pinned');
  const zero = (n: unknown): boolean => n === 0 || n === 'num:-0';
  assert.ok(Object.entries(now).every(([k, v]) => !k.endsWith('/clear') || (v ? zero(v.x) && zero(v.z) : k.includes('/onset/full-rag/'))),
    'clear cases stay put (the partial-blend full-rag refusal aside)');
});
