/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { LevelPlan } from '../level/plan.ts';
import { groundOwnsFlushFloor } from './coplanarGround.ts';

test('only fully coplanar source ground owns an entrance floor, with crown and raised-sill controls', () => {
  const heights = Array(16).fill(0);
  const plan: LevelPlan = { id: 'floor', segments: [], checkpoints: [], spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 4, rows: 4,
      heights, surfaces: Array(9).fill('brick') } };
  const floor = [{ x: 0.1, y: 0, z: 0.1 }, { x: 0.1, y: 0, z: 2.9 },
    { x: 2.9, y: 0, z: 2.9 }, { x: 2.9, y: 0, z: 0.1 }];
  const before = JSON.stringify(plan);
  assert.equal(groundOwnsFlushFloor(plan, floor), true);
  assert.equal(groundOwnsFlushFloor(plan, [...floor].reverse()), true);
  assert.equal(groundOwnsFlushFloor(plan, floor.map(v => ({ ...v, y: 0.025 }))), false, 'raised sill remains');
  heights[5] = 0.05;
  assert.equal(groundOwnsFlushFloor(plan, floor), false, 'interior crown invisible to four corner samples');
  heights[5] = -0.05;
  assert.equal(groundOwnsFlushFloor(plan, floor), false, 'interior hollow retains a real floor');
  heights[5] = 0;
  assert.equal(groundOwnsFlushFloor(plan, floor.map(v => ({ ...v, x: v.x - 3 }))), false, 'outside native field remains');
  assert.equal(JSON.stringify(plan), before);
});
