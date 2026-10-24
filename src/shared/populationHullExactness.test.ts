/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-WHARF (2026-10-23): physicalPopulationHull forms the plumb prism
 * directly from the transform's values, and the hull sweep mixes a body held
 * at both ends once. Both must equal the general path to the float bit.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { physicalPopulationHull, physicalPopulationPrism, transformPopulationHull } from './populationHull.ts';
import { sweepPopulationHulls, type PopulationFootprint } from '../simulation/population.ts';
import { bits } from '../simulation/populationPerfExactness.test-support.ts';

let seed = 12345;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (values: readonly number[]) => values[Math.floor(random() * values.length)];

test('the direct plumb prism equals physicalPopulationPrism of the full transform', () => {
  for (let index = 0; index < 4000; index += 1) {
    const x = pick([0, -0, 3.25, -17.5]) + random() * 40 - 20, z = pick([0, -0]) + random() * 40 - 20, y = random() * 2 - .5;
    const heading = pick([0, -0, Math.PI, -Math.PI / 2]) + (random() < .5 ? random() * 7 - 3.5 : 0);
    const normal = random() < .3 ? [0, 1, 0] : random() < .5 ? [-0, 1, -0] : [random() * .4 - .2, .8 + random() * .3, random() * .4 - .2];
    const hull = { halfWidthMetres: .1 + random() * 1.4, halfLengthMetres: .1 + random() * 2.6, heightMetres: .5 + random() * 2.5 };
    const vx = pick([0, -0, 1.5]), vz = pick([0, -0, -2.25]);
    const direct = physicalPopulationHull(x, y, z, heading, normal[0], normal[1], normal[2], hull, vx, vz);
    const general = physicalPopulationPrism(transformPopulationHull(x, y, z, heading, normal[0], normal[1], normal[2], hull, vx, vz).footprint);
    assert.equal(bits(direct), bits(general), `case ${index}`);
  }
  assert.throws(() => physicalPopulationHull(0, 0, 0, 0, 0, -1, 0, { halfWidthMetres: 1, halfLengthMetres: 1, heightMetres: 1 }), RangeError);
});

test('a held sweep body passed as one object sweeps exactly as two equal copies', () => {
  const body = (graded: boolean): PopulationFootprint => {
    const x = random() * 6 - 3, z = random() * 6 - 3, heading = random() * 7 - 3.5;
    if (!graded) return { x, z, headingY: heading, minY: pick([0, -0, .2]), maxY: 1.9, halfWidthMetres: .42, halfLengthMetres: .42,
      velocityX: pick([0, -0, .7]), velocityZ: pick([0, -0, -.4]) };
    const hull = physicalPopulationHull(x, .3, z, heading, .08, 1, -.05, { halfWidthMetres: .4, halfLengthMetres: .45, heightMetres: 1.8 }, .3, -0);
    return { ...hull, sourceHull: { ...hull.sourceHull!, marginMetres: pick([0, -0, .01]), verticalPaddingBelowMetres: .02, verticalPaddingAboveMetres: .03 } };
  };
  for (let index = 0; index < 3000; index += 1) {
    const a = body(random() < .5), b = body(random() < .5), b1 = { ...b, x: b.x + random() - .5 };
    assert.equal(bits(sweepPopulationHulls(a, a, b, b)), bits(sweepPopulationHulls(a, { ...a }, b, { ...b })), `static ${index}`);
    assert.equal(bits(sweepPopulationHulls(a, a, b, b1)), bits(sweepPopulationHulls(a, { ...a }, b, b1)), `held a ${index}`);
  }
});
