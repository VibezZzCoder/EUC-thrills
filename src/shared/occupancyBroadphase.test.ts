/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose } from '../simulation/EucController.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose } from './riderOccupancy.ts';
import { compileOccupancyTemplate } from './compiledOccupancy.ts';
import { admitCoarseStopGroups, coarseMountedHumanWorldAabb, coarseWheelWorldAabb } from './occupancyBroadphase.ts';
test('coefficient-only broadphase contains native and folded-field prism corners across heading and articulation motion', () => {
  const before = createPose(), after = createPose(); Object.assign(before, { x: 1, y: .3, headingY: 3.12, groundRoll: -.65, rollAngle: -.4, riderRoll: -.6, crouch: .6 });
  Object.assign(after, before, { x: 1.2, y: .31, headingY: -3.12, groundRoll: .65, rollAngle: .4, riderRoll: .6, crouch: .3,
    restFactor: .3, crashBlend: .3, crashLateral: .4, crashForward: -.3, crashDrop: .1, crashRoll: .6, crashTumble: .5, wheelCrashPop: .4 });
  for (const component of ['wheel', 'human'] as const) {
    const input = { previous: before, current: after, coefficients: RIDER_OCCUPANCY }, box = component === 'wheel' ? coarseWheelWorldAabb(input) : coarseMountedHumanWorldAabb(input);
    const slot = compileOccupancyTemplate(component, RIDER_OCCUPANCY, before).createSlot(); slot.load(before, after);
    for (const time of [0, .13, .29, .5, .71, .89, 1]) for (const body of [slot.at(time), buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, time), RIDER_OCCUPANCY)[component]]) {
      const c = Math.cos(body.headingY), s = Math.sin(body.headingY);
      for (const x of [-body.halfWidth, body.halfWidth]) for (const z of [-body.halfLength, body.halfLength]) {
        const wx = body.x + c * x + s * z, wz = body.z - s * x + c * z;
        assert.ok(wx >= box.minX - 1e-8 && wx <= box.maxX + 1e-8 && wz >= box.minZ - 1e-8 && wz <= box.maxZ + 1e-8);
        assert.ok(body.baseY >= box.minY - 1e-8 && body.topY <= box.maxY + 1e-8);
      }
    }
  }
});
test('far and self actors construct no certificate; one near component admits the complete stop group', () => {
  const near = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }, far = { ...near, minX: 99, maxX: 101 }; let calls = 0;
  const components = [{ ownerId: 'seat', stopGroupId: 'physical', componentId: 'human', coarseWorldAabb: near, createCertificate: () => { calls += 1; return 'human'; } },
    { ownerId: 'seat', stopGroupId: 'physical', componentId: 'wheel', coarseWorldAabb: far, createCertificate: () => { calls += 1; return 'wheel'; } }];
  const absent = admitCoarseStopGroups(components, [{ ownerId: 'seat', coarseWorldAabb: near }, { ownerId: 'actor', coarseWorldAabb: { ...far, minX: 199, maxX: 201 } }]);
  assert.equal(calls, 0); assert.equal(absent.omitted.length, 2);
  const present = admitCoarseStopGroups(components, [{ ownerId: 'actor', coarseWorldAabb: near }]);
  assert.equal(calls, 2); assert.equal(present.admitted.length, 2); assert.equal(present.omitted.length, 0);
});
test('coarse bounds translate covariantly and cannot authorize active rag as mounted geometry', () => {
  const a = createPose(), b = createPose(), input = { previous: a, current: b, coefficients: RIDER_OCCUPANCY }, before = coarseMountedHumanWorldAabb(input);
  a.x = b.x = 17; a.y = b.y = 3; a.z = b.z = -11; const after = coarseMountedHumanWorldAabb(input);
  for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) assert.ok(Math.abs(after[key] - before[key] - (key.endsWith('X') ? 17 : key.endsWith('Y') ? 3 : -11)) < 1e-8);
  b.ragdollBlend = .1; assert.throws(() => coarseMountedHumanWorldAabb(input), /rejects active/);
});

import { physicalPopulationHull } from './populationHull.ts';
import { coarseActorMotionWorldAabb } from './occupancyBroadphase.ts';
test('coarse grade-aligned actor bounds include intermediate normals, raw dimensions and support paddings', () => {
  const a = { x: 0, y: .2, z: 0, headingY: 3.12, normalX: .3, normalY: .9, normalZ: -.2, hull: { halfWidthMetres: .3, halfLengthMetres: .6, heightMetres: 1.8 }, marginMetres: .02, verticalPaddingBelowMetres: .04, verticalPaddingAboveMetres: .06 };
  const b = { ...a, x: .12, y: .22, z: .05, headingY: -3.12, normalX: -.4, normalY: .8, normalZ: .3, hull: { halfWidthMetres: .32, halfLengthMetres: .55, heightMetres: 1.75 } };
  const footprint = (s: typeof a) => ({ ...physicalPopulationHull(s.x, s.y, s.z, s.headingY, s.normalX, s.normalY, s.normalZ, s.hull), sourceHull: s });
  const box = coarseActorMotionWorldAabb(footprint(a), footprint(b));
  for (const t of [0, .125, .25, .5, .75, .875, 1]) {
    const mix = (x: number, y: number) => x + (y - x) * t, heading = a.headingY + .043185307179586 * t;
    const body = physicalPopulationHull(mix(a.x, b.x), mix(a.y, b.y), mix(a.z, b.z), heading, mix(a.normalX, b.normalX), mix(a.normalY, b.normalY), mix(a.normalZ, b.normalZ),
      { halfWidthMetres: mix(a.hull.halfWidthMetres, b.hull.halfWidthMetres), halfLengthMetres: mix(a.hull.halfLengthMetres, b.hull.halfLengthMetres), heightMetres: mix(a.hull.heightMetres, b.hull.heightMetres) });
    const c = Math.cos(heading), s = Math.sin(heading);
    for (const x of [-body.halfWidthMetres - a.marginMetres, body.halfWidthMetres + a.marginMetres]) for (const z of [-body.halfLengthMetres - a.marginMetres, body.halfLengthMetres + a.marginMetres]) {
      const wx = body.x + c * x + s * z, wz = body.z - s * x + c * z;
      assert.ok(wx >= box.minX && wx <= box.maxX && wz >= box.minZ && wz <= box.maxZ);
    }
    assert.ok(body.minY - a.verticalPaddingBelowMetres - a.marginMetres >= box.minY && body.maxY + a.verticalPaddingAboveMetres + a.marginMetres <= box.maxY);
  }
});
