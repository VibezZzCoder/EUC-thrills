/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sweepPopulationHulls } from './population.ts';
import { resolvePopulationCompoundMotionBatch } from './populationCompound.ts';
test('certified raw heading retains its interior long arc while endpoint wrapping misses it', () => {
  const body = { x: 1.4, z: 0, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 1, velocityX: 0, velocityZ: 0 };
  const component = { ownerId: 'rider', componentId: 'human', stopGroupId: 'physical',
    at: (time: number) => ({ ...body, x: 0, headingY: 3.12 - 6.24 * time, halfLengthMetres: 2 }),
    intervalEnvelopeMetres: () => 0 };
  assert.equal(sweepPopulationHulls(component.at(0), component.at(1), body, body), null,
    'known-bad shortest-wrap endpoint sweep must miss the actual interior long arc');
  const actual = resolvePopulationCompoundMotionBatch([{ id: 'walker', previous: body, current: body }], [component]);
  assert.equal(actual.hits.length, 1); assert.ok(actual.hits[0].timeOfImpact > 0 && actual.hits[0].timeOfImpact < .5);
  assert.ok(actual.stopGroupFractions['rider/physical'] < .5);
});
