/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, lerpPose, type EucPose } from '../simulation/EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { createRiderOccupancyTrajectory, interpolateRiderOccupancyPose, type RiderOccupancyPose } from './riderOccupancy.ts';
import { PopulationPhysicalCertificates } from '../simulation/populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from '../simulation/populationPhysicalReactionAdmission.ts';
import { PopulationSimulation } from '../simulation/population.ts';
import { populationPlanOf, stationaryPerson } from '../simulation/populationContactHarness.test-support.ts';
import type { TerrainSampler } from '../simulation/world.ts';

const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) {
  out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1;
  out.surface = 'pavement'; out.offCourse = false; return out;
}, raycast() { return null; } };
const poseOf = (controller: EucController): EucPose => { const out = createPose(); controller.writePose(out); return out; };
function nativePair(): [EucPose, EucPose] {
  const controller = new EucController(flat);
  assert.equal(controller.reset(undefined, 6), true); assert.equal(controller.hardKnock(3, 0), true);
  for (let tick = 0; tick < 8; tick++) controller.step(DT, NEUTRAL_ACTIONS);
  const first = poseOf(controller); controller.step(DT, NEUTRAL_ACTIONS);
  return [first, poseOf(controller)];
}
const clone = (pose: EucPose): EucPose => ({ ...pose, ragdoll: Float32Array.from(pose.ragdoll), ragdollJointPoles: Float32Array.from(pose.ragdollJointPoles) });

test('shared joint interpolation matches presented entry/exit and ignores poisoned inactive pole blocks', () => {
  const [first, last] = nativePair(), inactive = createPose();
  inactive.ragdoll.fill(NaN); inactive.ragdollJointPoles.fill(NaN);
  for (const [from, to] of [[inactive, first], [first, last], [last, inactive]] as const) {
    for (const alpha of [.01, .25, .5, .75, .99]) {
      const presented = createPose(); lerpPose(from, to, alpha, presented);
      const physical = interpolateRiderOccupancyPose(from, to, alpha);
      assert.equal(physical.ragdollJointPoles?.length, 12);
      assert.notEqual(physical.ragdollJointPoles, from.ragdollJointPoles);
      assert.notEqual(physical.ragdollJointPoles, to.ragdollJointPoles);
      for (let index = 0; index < 12; index++) {
        assert.ok(Number.isFinite(physical.ragdollJointPoles![index]));
        assert.ok(Math.abs(physical.ragdollJointPoles![index] - presented.ragdollJointPoles[index]) < 2e-6,
          `shared/presented pole ${index} differs at ${alpha}`);
      }
    }
  }
  const inactiveResult = interpolateRiderOccupancyPose(inactive, inactive, .5);
  assert.deepEqual(Array.from(inactiveResult.ragdollJointPoles!), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const knownBad = first.ragdollJointPoles.map((value, index) => inactive.ragdollJointPoles[index]
    + (value - inactive.ragdollJointPoles[index]) * .5);
  assert.ok(knownBad.some(value => !Number.isFinite(value)), 'raw interpolation of an inactive pole block must fail the control');
});

test('trajectory snapshots retain frozen twelve-float pole blocks after caller buffers are overwritten', () => {
  const [first, last] = nativePair(), expectedFirst = Array.from(first.ragdollJointPoles), expectedLast = Array.from(last.ragdollJointPoles);
  const trajectory = createRiderOccupancyTrajectory(first, last, RIDER_CONTACT);
  const knownBad = { ...first, ragdoll: Float32Array.from(first.ragdoll) };
  first.ragdollJointPoles.fill(99); last.ragdollJointPoles.fill(-99);
  assert.notDeepEqual(Array.from(knownBad.ragdollJointPoles), expectedFirst, 'a particle-only clone aliases the new physical pole channel');
  for (const [pose, expected] of [[trajectory.intervalInput.previous, expectedFirst], [trajectory.intervalInput.current, expectedLast]] as const) {
    assert.ok(Array.isArray(pose.ragdollJointPoles) && Object.isFrozen(pose.ragdollJointPoles));
    assert.equal(pose.ragdollJointPoles.length, 12, 'typed blocks must not become objects without length during freezing');
    assert.deepEqual(Array.from(pose.ragdollJointPoles), expected);
    assert.throws(() => { (pose.ragdollJointPoles as number[])[0] = 0; }, TypeError);
  }
});

test('a native-fall certificate owner detaches caller poles and treats equal copied blocks as the same physical pose', () => {
  const [first] = nativePair(), last = clone(first), expected = Array.from(first.ragdollJointPoles);
  const bank = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  const observed: { before: RiderOccupancyPose; after: RiderOccupancyPose; only: unknown }[] = [];
  const components = bank.components.bind(bank);
  bank.components = (...args) => { observed.push({ before: args[1], after: args[2], only: args[5] }); return components(...args); };
  const population = new PopulationSimulation(populationPlanOf([stationaryPerson('near', 1.3, .4)]), flat);
  population.step(DT);
  const owner = bank.owner('owner', first, last, DT, population.actorMotions(), false, true);
  assert.equal(owner.admitted, true, 'nearby real actor must bind the physical owner');
  first.ragdollJointPoles.fill(99); last.ragdollJointPoles.fill(-99);
  owner.movingComponents();
  assert.equal(observed.length, 1);
  assert.equal(observed[0].only, undefined, 'equal separately owned poles must not switch a zero-motion owner to a changed-native-fall sweep');
  for (const physical of [observed[0].before, observed[0].after]) {
    assert.notEqual(physical.ragdollJointPoles, first.ragdollJointPoles);
    assert.notEqual(physical.ragdollJointPoles, last.ragdollJointPoles);
    assert.deepEqual(Array.from(physical.ragdollJointPoles!), expected);
  }
});

test('logical zero contact compares copied pole values and cannot mask a pole-only physical change', () => {
  const previous = createPose(), proposed = clone(previous);
  assert.notEqual(previous.ragdollJointPoles, proposed.ragdollJointPoles);
  const population = new PopulationSimulation(populationPlanOf([stationaryPerson('near', 0, 0)]), flat);
  const bank = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  // Observe whether production's logical-zero fast path requires a new proof.
  // A pole-only changed response must reach admission even though this contact
  // certificate deliberately encloses every joint orientation.
  bank.owner = () => { throw new Error('changed physical response requires admission'); };
  const allowed = () => populationPhysicalReactionAllowed({ ownerId: 'owner',
    request: { kind: 'contactClock', previous, proposed }, population, certificates: bank, occupants: [], reservations: [] });
  assert.equal(allowed(), true);
  for (let changed = 0; changed < 12; changed++) {
    proposed.ragdollJointPoles.fill(0); proposed.ragdollJointPoles[changed] = 1;
    const knownBadIgnoresPoles = Object.keys(previous).filter(key => key !== 'ragdollJointPoles').every(key => key === 'ragdoll'
      ? previous.ragdoll.every((value, index) => value === proposed.ragdoll[index]) : previous[key as keyof EucPose] === proposed[key as keyof EucPose]);
    assert.equal(knownBadIgnoresPoles, true, 'the particle-only predicate incorrectly calls this changed state identical');
    assert.throws(allowed, /requires admission/, `joint pole ${changed} must reach admission`);
    proposed.ragdollJointPoles[changed] = NaN;
    assert.throws(allowed, /requires admission/, `poisoned joint pole ${changed} cannot be accepted as a logical zero`);
  }
});
