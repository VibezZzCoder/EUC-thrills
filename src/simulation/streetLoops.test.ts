/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { buildRouteField } from './routeField.ts';
import { RouteSpine, createSpineSample } from './routeSpine.ts';
import { StreetLoops } from './streetLoops.ts';

/**
 * `StreetLoops` on a route field's shared rings — M39 Part P (`docs/M39_CHASE.md`
 * §2c, R-18). Three cops in a room would each rebuild the town's street rings;
 * handed the field's rings instead, an instance must answer exactly as one
 * that built its own, because the rings are only ever read.
 */

const SEEDS = ['euc', 'route-41', 'sweep-39'] as const;

test('a shared-rings instance answers offRoute, onAlternate and aim identically to a private one', () => {
  for (const seed of SEEDS) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan);
    assert.ok(spine !== null, `${seed} has no spine`);
    const field = buildRouteField(spine, plan, new PlanTerrainSampler(plan));
    assert.ok(field.streetRings.length > 0, `${seed} has no street loops to share`);
    const own = new StreetLoops(plan);
    const shared = new StreetLoops(plan, { rings: field.streetRings, mainLengths: field.streetMainLengths });
    const point = createSpineSample();
    const quarry = createSpineSample();
    let aimed = 0;
    // Probe along every ring (on the road and off to each side) with the
    // quarry a short way ahead, so the alternate arms and the seam are read.
    for (const ring of field.streetRings) {
      for (let distance = 0; distance < ring.length; distance += 11) {
        ring.sample(distance, point);
        ring.sample(distance + 40, quarry);
        for (const offset of [-6, 0, 6]) {
          const x = point.x + Math.cos(point.headingY) * offset;
          const z = point.z - Math.sin(point.headingY) * offset;
          assert.equal(shared.offRoute(x, z, 1e9), own.offRoute(x, z, 1e9), `${seed}: offRoute at ${distance} m`);
          assert.equal(shared.onAlternate(x, z, 50, 4), own.onAlternate(x, z, 50, 4), `${seed}: onAlternate at ${distance} m`);
          const self = { x, z, speed: 12 };
          const a = own.aim(self, quarry, 30);
          const aCopy = a === null ? null : { ...a, bendAt: [...a.bendAt], bendCurvature: [...a.bendCurvature] };
          const b = shared.aim(self, quarry, 30);
          assert.deepStrictEqual(b, aCopy, `${seed}: aim at ${distance} m`);
          if (a !== null) aimed += 1;
        }
      }
    }
    assert.ok(aimed > 0, `${seed}: no probe reached the aim, so the case proves nothing`);
  }
});

test('a shared ring list that does not match the plan\'s loops is refused', () => {
  const { plan } = generateLevel('euc');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null);
  const field = buildRouteField(spine, plan, new PlanTerrainSampler(plan));
  assert.throws(
    () => new StreetLoops(plan, { rings: field.streetRings.slice(1), mainLengths: field.streetMainLengths }),
    /do not match/,
    'a ring list that does not match the plan\'s loops is refused',
  );
});
