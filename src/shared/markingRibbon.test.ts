/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  appendMarking,
  arcLengths,
  createRibbonTarget,
  dashSpans,
  sampleAt,
  wearAt,
  type RibbonPoint,
} from './markingRibbon.ts';

/**
 * The paint's geometry, checked without a browser.
 *
 * The whole reason `markingRibbon.ts` imports nothing: every property worth
 * asserting about a painted line — that its dashes land where they should, that
 * it is the width it says, that it lies flat, that it is the same on every boot
 * — is arithmetic, and a browser would make each of these slower and no truer.
 */

const straight = (length: number, step = 1.25): RibbonPoint[] => {
  const points: RibbonPoint[] = [];
  for (let s = 0; s <= length + 1e-9; s += step) points.push({ x: 0, y: 2, z: s });
  return points;
};

test('arc length is measured in the ground plane, not up the hill', () => {
  // A dash pattern measured along a 7 degree climb would stretch its gaps
  // relative to the flat road it continues from, and the player reads the
  // pattern from above at a shallow angle where only the plan spacing shows.
  const climbing: RibbonPoint[] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 3, z: 4 },
    { x: 0, y: 6, z: 8 },
  ];
  assert.deepEqual(arcLengths(climbing), [0, 4, 8]);
});

test('a solid line is one span covering the whole run', () => {
  assert.deepEqual(dashSpans(40, 0, 0), [{ from: 0, to: 40 }]);
});

test('a broken line is centred on its run, so both ends are cut the same', () => {
  const spans = dashSpans(30, 3, 4.5);
  assert.ok(spans.length >= 3, 'a 30 m run carries several marks');
  const head = spans[0].from;
  const tail = 30 - spans[spans.length - 1].to;
  assert.ok(Math.abs(head - tail) < 1e-6, `run is lopsided: ${head} against ${tail}`);
});

test('every mark is inside its run and the gaps are the gap', () => {
  const spans = dashSpans(53.5, 3, 4.5);
  for (const span of spans) {
    assert.ok(span.from >= 0 && span.to <= 53.5, 'a mark left the run');
    assert.ok(span.to > span.from, 'a mark has no length');
  }
  for (let index = 1; index < spans.length; index += 1) {
    const gap = spans[index].from - spans[index - 1].to;
    assert.ok(Math.abs(gap - 4.5) < 1e-6, `gap came out at ${gap}`);
  }
});

test('a run too short for a whole mark still gets one', () => {
  // The builder clips paint out of anywhere it may not go, so short runs are
  // normal rather than exceptional — and a run that carries no paint at all is
  // a hole in the line nobody authored.
  const spans = dashSpans(2.2, 3, 4.5);
  assert.equal(spans.length, 1);
  assert.ok(spans[0].to - spans[0].from > 0);
});

test('sampling a polyline is exact at its ends and linear between', () => {
  const points = straight(10, 5);
  const out = { x: 0, y: 0, z: 0 };
  sampleAt(points, arcLengths(points), 0, out);
  assert.deepEqual(out, { x: 0, y: 2, z: 0 });
  sampleAt(points, arcLengths(points), 10, out);
  assert.deepEqual(out, { x: 0, y: 2, z: 10 });
  sampleAt(points, arcLengths(points), 2.5, out);
  assert.ok(Math.abs(out.z - 2.5) < 1e-9);
  // Off both ends clamps rather than extrapolating into the field beside the
  // road, which is what a naive parameter would do at a clipped run's edge.
  sampleAt(points, arcLengths(points), -5, out);
  assert.equal(out.z, 0);
  sampleAt(points, arcLengths(points), 99, out);
  assert.equal(out.z, 10);
});

test('wear is deterministic, bounded, and never inverts the paint', () => {
  assert.equal(wearAt(12.3, -4.5, 0.16), wearAt(12.3, -4.5, 0.16));
  assert.notEqual(wearAt(12.3, -4.5, 0.16), wearAt(38.1, 91.2, 0.16));
  for (let x = -50; x < 50; x += 0.7) {
    for (let z = -20; z < 20; z += 1.3) {
      const tone = wearAt(x, z, 0.26);
      assert.ok(tone > 0.74 && tone < 1.26, `wear reached ${tone}`);
    }
  }
  assert.equal(wearAt(3, 3, 0), 1, 'no wear is exactly no change');
});

test('most of a line stays near its own tone, and a scattered few are scuffed', () => {
  // The same distribution argument §4b makes about the ground: a uniform jitter
  // makes every metre disagree with the next, which on a solid line reads as
  // dashes. Squared about zero, most samples sit close to the paint's own tone.
  let near = 0;
  let total = 0;
  for (let s = 0; s < 400; s += 0.31) {
    const deviation = Math.abs(wearAt(s, s * 0.7, 0.2) - 1);
    if (deviation < 0.2 * 0.25) near += 1;
    total += 1;
  }
  assert.ok(near / total > 0.45, `only ${((near / total) * 100).toFixed(0)}% of the line is untouched`);
});

test('a ribbon is the width it says, lies flat, and faces up', () => {
  const target = createRibbonTarget();
  const triangles = appendMarking(straight(20), 0.08, 0, 0, { r: 0.4, g: 0.4, b: 0.38 }, 0, target);
  assert.ok(triangles > 0);

  const rows = target.positions.length / 6;
  for (let row = 0; row < rows; row += 1) {
    const ax = target.positions[row * 6];
    const az = target.positions[row * 6 + 2];
    const bx = target.positions[row * 6 + 3];
    const bz = target.positions[row * 6 + 5];
    assert.ok(Math.abs(Math.hypot(bx - ax, bz - az) - 0.16) < 1e-6, 'the line changed width');
  }
  for (let index = 0; index < target.normals.length; index += 3) {
    assert.deepEqual(
      [target.normals[index], target.normals[index + 1], target.normals[index + 2]],
      [0, 1, 0],
      'paint on a crowned road is still flat paint',
    );
  }
  for (const value of target.positions.filter((_v, i) => i % 3 === 1)) {
    assert.equal(value, 2, 'the ribbon left the height the builder resolved');
  }
});

test('every triangle winds up, so the paint is not a hole in the road', () => {
  const target = createRibbonTarget();
  appendMarking(straight(12), 0.08, 3, 4.5, { r: 0.4, g: 0.4, b: 0.38 }, 0.1, target);
  assert.ok(target.indices.length > 0);
  for (let index = 0; index < target.indices.length; index += 3) {
    const [a, b, c] = [target.indices[index], target.indices[index + 1], target.indices[index + 2]];
    const point = (i: number): [number, number] => ([target.positions[i * 3], target.positions[i * 3 + 2]]);
    const [ax, az] = point(a);
    const [bx, bz] = point(b);
    const [cx, cz] = point(c);
    // Counter-clockwise seen from above is +Y, matching `render/terrain.ts`.
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    assert.ok(cross < 0, `triangle ${index / 3} winds downward`);
  }
});

test('each finished edge vertex may follow the ground beneath that edge', () => {
  const target = createRibbonTarget();
  const heightAt = (x: number, z: number): number => 2 + x * 0.1 - z * 0.04;
  appendMarking(
    straight(12),
    0.08,
    0,
    0,
    { r: 0.4, g: 0.4, b: 0.38 },
    0,
    target,
    heightAt,
  );
  for (let index = 0; index < target.positions.length; index += 3) {
    const x = target.positions[index];
    const y = target.positions[index + 1];
    const z = target.positions[index + 2];
    assert.ok(Math.abs(y - heightAt(x, z)) < 1e-12, 'an edge left the sampled ground');
  }
});

test('a broken line paints less than a solid one over the same run', () => {
  const solid = createRibbonTarget();
  const broken = createRibbonTarget();
  const colour = { r: 0.4, g: 0.4, b: 0.38 };
  appendMarking(straight(60), 0.08, 0, 0, colour, 0, solid);
  appendMarking(straight(60), 0.08, 3, 4.5, colour, 0, broken);
  assert.ok(
    broken.indices.length < solid.indices.length,
    'a broken line has to cost fewer triangles than a solid one',
  );
});

test('the ribbon follows a curve rather than chording it', () => {
  // A quarter of a 34 m circle, at the sample step the builder uses.
  const radius = 34;
  const points: RibbonPoint[] = [];
  for (let angle = 0; angle <= Math.PI / 2; angle += 1.25 / radius) {
    points.push({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius });
  }
  const target = createRibbonTarget();
  appendMarking(points, 0.08, 0, 0, { r: 0.4, g: 0.4, b: 0.38 }, 0, target);

  // Every vertex sits within half a line-width of the true arc, on one side or
  // the other, which is what "the paint is on the curve" means numerically.
  for (let index = 0; index < target.positions.length; index += 3) {
    const distance = Math.hypot(target.positions[index], target.positions[index + 2]);
    assert.ok(
      Math.abs(distance - radius) < 0.09,
      `a ribbon vertex sat ${(distance - radius).toFixed(3)} m off a 34 m arc`,
    );
  }
});

test('a degenerate line produces nothing rather than a NaN', () => {
  const target = createRibbonTarget();
  assert.equal(appendMarking([{ x: 0, y: 0, z: 0 }], 0.08, 0, 0, { r: 1, g: 1, b: 1 }, 0, target), 0);
  assert.equal(appendMarking(straight(10), 0, 0, 0, { r: 1, g: 1, b: 1 }, 0, target), 0);
  const same: RibbonPoint[] = [{ x: 3, y: 1, z: 3 }, { x: 3, y: 1, z: 3 }];
  assert.equal(appendMarking(same, 0.08, 0, 0, { r: 1, g: 1, b: 1 }, 0, target), 0);
  assert.equal(target.positions.length, 0);
});

test('two builds of the same line are identical, down to the wear', () => {
  const colour = { r: 0.4, g: 0.4, b: 0.38 };
  const first = createRibbonTarget();
  const second = createRibbonTarget();
  appendMarking(straight(48), 0.08, 3, 4.5, colour, 0.16, first);
  appendMarking(straight(48), 0.08, 3, 4.5, colour, 0.16, second);
  assert.deepEqual(first, second);
});
