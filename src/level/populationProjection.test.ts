/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Tripwires for unsafe projection pruning and lost original NaN/touch behavior. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { LevelPlan, BoxCollider } from './plan.ts';
import { createPopulationValidationContext, districtActivityReservedLane,
  populationFootprintExclusion, type PopulationSpanFootprint } from './populationPlan.ts';
import { boxOverlapsPolygon } from './streetFronts.ts';

const rect = (left: number, right: number, near: number, far: number) => [
  { x: left, y: 0, z: near }, { x: right, y: 0, z: near },
  { x: right, y: 0, z: far }, { x: left, y: 0, z: far },
];
const solid: BoxCollider = { centre: { x: 0, y: 1, z: 0 },
  halfExtents: { x: 1, y: 1, z: 1 }, rotationY: 0, surface: 'wood' };
const plan = (): LevelPlan => ({ id: 'projection-control',
  heightfield: { originX: -20, originZ: -20, spacing: 1, columns: 41, rows: 41,
    heights: new Array<number>(1681).fill(0), surfaces: new Array<'pavement'>(1600).fill('pavement') },
  surround: { height: 0, surface: 'pavement' }, spawn: { position: { x: -18, y: 0, z: -18 }, headingY: 0 },
  checkpoints: [], solids: [solid], softBodies: [], props: [], segments: [] });
const footprint = (polygon: PopulationSpanFootprint['polygon']): PopulationSpanFootprint => {
  const hull = { x: 0, z: 0, headingY: 0, halfWidthMetres: .5,
    halfLengthMetres: .5, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 };
  return { polygon, minY: 0, maxY: 2, fromFraction: 0, toFraction: 1, fromHull: hull, toHull: hull };
};

test('unordered original movement SAT keeps its rotated witness outside the raw coordinate bounds', () => {
  const source = { ...plan(), solids: [] };
  source.populationPaths = [{ id: 'original', role: 'traffic', district: 'commercial', closed: false,
    serviceShuttle: false, frames: [0, .5].map(z => ({ x: 0, y: 0, z, headingY: 0,
      distanceMetres: z, halfWidthMetres: 1.3, sourceSegmentId: 'owned' })) }];
  const theta = Math.PI / 4, query = rect(-.1, .1, -.1, .1).map(p => ({
    x: Math.cos(theta) * p.x + Math.sin(theta) * p.z,
    z: 2.4 - Math.sin(theta) * p.x + Math.cos(theta) * p.z,
  }));
  assert.ok(Math.min(...query.map(p => p.z)) > 1.92, 'a raw-coordinate bounds shortcut would wrongly prune this witness');
  assert.equal(districtActivityReservedLane(source, query, undefined, undefined,
    createPopulationValidationContext(source)), true);
});

test('a NaN projection preserves original poisoning instead of inventing a clear exclusion', () => {
  const source = plan(), query = [{ x: NaN, z: NaN }, ...rect(8, 10, -1, 1).slice(1)];
  assert.equal(populationFootprintExclusion(source, footprint(query), createPopulationValidationContext(source)), 'solid');
  const ignored = query.filter(p => Number.isFinite(p.x));
  assert.equal(populationFootprintExclusion(source, footprint(ignored), createPopulationValidationContext(source)), null,
    'ignoring the malformed vertex is the known-bad clear answer');
});

test('inclusive population contact and positive-area frontage overlap retain different edge-touch policies', () => {
  const source = plan(), touching = rect(1, 1.4, -.2, .2), separated = rect(1.01, 1.4, -.2, .2);
  assert.equal(populationFootprintExclusion(source, footprint(touching), createPopulationValidationContext(source)), 'solid');
  assert.equal(boxOverlapsPolygon(solid, touching), false);
  assert.equal(populationFootprintExclusion(source, footprint(separated), createPopulationValidationContext(source)), null);
  assert.equal(boxOverlapsPolygon(solid, rect(.9, 1.4, -.2, .2)), true);
});

test('empty and repeated zero-edge population polygons retain their original exclusion answers', () => {
  const source = plan();
  // The legacy empty convex containment falls through the separating solid
  // axes and reaches the spawn guard; projection pruning must preserve it.
  assert.equal(populationFootprintExclusion(source, footprint([]), createPopulationValidationContext(source)), 'spawn');
  assert.equal(populationFootprintExclusion(source, footprint([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }]),
    createPopulationValidationContext(source)), 'solid');
  assert.equal(populationFootprintExclusion(source, footprint([{ x: 8, z: 8 }]), createPopulationValidationContext(source)), 'spawn');
});
