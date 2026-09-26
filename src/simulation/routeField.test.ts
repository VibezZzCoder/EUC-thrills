/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import { CpuRider } from './cpuRider.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { buildRouteField } from './routeField.ts';
import { RouteSpine } from './routeSpine.ts';

/**
 * The shared route field — M39 Part P (`docs/PLANS.md` §39.6b.4 "Field
 * construction", `docs/M39_CHASE.md` §2c).
 *
 * A pack of three brains reads one field. What these cases pin is that the
 * move changed *where* the projection runs and nothing about what it
 * produces: the field a brain builds for itself and the field the world
 * builds once are the same structure, element for element, and a brain handed
 * the shared one keeps no copy of it.
 */

/** Three of the six-seed town corpus (`docs/M39_PHASE0.md`): the default town, the dense one, the folded chase case. */
const SEEDS = ['euc', 'route-41', 'sweep-39'] as const;

function world(seed: string) {
  const { plan } = generateLevel(seed);
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, `${seed} has no spine`);
  return { plan, spine, sampler: new PlanTerrainSampler(plan) };
}

test('the shared field equals the field a brain builds for itself, structurally', () => {
  for (const seed of SEEDS) {
    const { plan, spine, sampler } = world(seed);
    const shared = buildRouteField(spine, plan, sampler);
    const own = new CpuRider(spine, plan, sampler);
    assert.ok(shared.blockers.length > 0, `${seed}: the field found nothing on the line`);
    assert.deepStrictEqual(own.blockerField, shared.blockers, `${seed}: the canonical blockers differ`);
    assert.deepStrictEqual(own.routeField, shared, `${seed}: the whole field differs`);
    assert.equal(own.blockerCount, shared.blockers.length);
  }
});

test('a brain handed the field reads it in place and keeps no copy', () => {
  const { plan, spine, sampler } = world('euc');
  const field = buildRouteField(spine, plan, sampler);
  const brains = [0, 1, 2].map(() => new CpuRider(spine, plan, sampler, field));
  for (const brain of brains) {
    assert.equal(brain.routeField, field);
    assert.equal(brain.blockerField, field.blockers);
  }
});

test('the field is deterministic and read-only after construction', () => {
  const { plan, spine, sampler } = world('route-41');
  const first = buildRouteField(spine, plan, sampler);
  const second = buildRouteField(spine, plan, sampler);
  assert.deepStrictEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.blockers));
  assert.ok(Object.isFrozen(first.streetFields));
  assert.ok(Object.isFrozen(first.streetRings));
  assert.ok(Object.isFrozen(first.streetMainLengths));
  for (const street of first.streetFields) {
    assert.ok(Object.isFrozen(street) && Object.isFrozen(street.blockers));
  }
  assert.throws(() => (first.blockers as unknown as unknown[]).push({}));
});

test('the street rings are the street fields’ own instances, with StreetLoops’ arm lengths', () => {
  for (const seed of SEEDS) {
    const { plan, spine, sampler } = world(seed);
    const field = buildRouteField(spine, plan, sampler);
    const loops = plan.streetLoops ?? [];
    assert.equal(field.streetRings.length, loops.length);
    assert.equal(field.streetFields.length, loops.length);
    assert.equal(field.streetMainLengths.length, loops.length);
    loops.forEach((loop, index) => {
      // §2c R-18: one set of rings, built once.
      assert.equal(field.streetRings[index], field.streetFields[index].ring);
      const main = field.streetMainLengths[index];
      const whole = field.streetRings[index].length;
      if (loop.alternate.length === 0) {
        assert.equal(main, whole, `${seed}: the town ring's main arm is the whole ring`);
      } else {
        const own = RouteSpine.fromTraversal(plan, loop.main.map((id) => ({ id, forward: true }))).length;
        assert.equal(main, own, `${seed}: loop ${index}'s main arm`);
        assert.ok(main < whole, `${seed}: loop ${index}'s main arm is not shorter than its ring`);
      }
    });
    const town = loops.findIndex((loop) => loop.alternate.length === 0);
    assert.equal(field.townRing, town);
    assert.equal(field.townRingLength, town < 0 ? 0 : field.streetRings[town].length);
  }
});

test('a field built on another line is refused', () => {
  const { plan, spine, sampler } = world('euc');
  const field = buildRouteField(spine, plan, sampler);
  const other = RouteSpine.fromPlan(plan);
  assert.ok(other !== null && other !== spine);
  assert.throws(() => new CpuRider(other, plan, sampler, field), /different spine/);
});
