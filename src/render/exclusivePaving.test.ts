/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { GroundSurfaceTriangle } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { exclusivePavingTriangle } from './exclusivePaving.ts';
const triangle = (points: number[][], cell = 0): GroundSurfaceTriangle => ({ cell,
  vertices: points.map(([x, z]) => ({ x, y: 2 + x * 0.02 + z * 0.03, z })) as unknown as GroundSurfaceTriangle['vertices'] });
const area = (t: GroundSurfaceTriangle): number => {
  const [a, b, c] = t.vertices; return Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
};
test('paving union removes duplicate and partial coverage, preserves native planes and source data', () => {
  const a = triangle([[0, 0], [0, 2], [2, 0]]), b = triangle([[0, 0], [0, 2], [2, 2]]);
  const before = JSON.stringify([a, b]), covered = new Map<number, (readonly Vec3[])[]>();
  const first = exclusivePavingTriangle(a, covered);
  assert.deepEqual(first, [a]);
  assert.deepEqual(exclusivePavingTriangle(a, covered), [], 'known duplicated layer must disappear');
  const rest = exclusivePavingTriangle(b, covered);
  assert.ok(Math.abs(first.concat(rest).reduce((sum, t) => sum + area(t), 0) - 3) < 1e-9,
    'union area is 3, not the doubled 4');
  for (const t of rest) for (const v of t.vertices) assert.ok(Math.abs(v.y - (2 + v.x * 0.02 + v.z * 0.03)) < 1e-12);
  assert.deepEqual(exclusivePavingTriangle(triangle([[3, 0], [3, 2], [5, 0]]), covered).length, 1, 'disjoint triangle unchanged');
  assert.deepEqual(exclusivePavingTriangle({ ...a, cell: 1 }, covered).length, 1, 'independent source cell');
  assert.equal(JSON.stringify([a, b]), before);
});
