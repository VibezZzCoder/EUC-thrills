/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import { SURFACES } from '../data/surfaces.ts';
import type { BoxCollider } from '../level/plan.ts';
import { colliderMaterial } from '../level/renderBudget.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION } from './presentation.ts';
import { createTerrain } from './terrain.ts';
import {
  WALL_COURSES,
  colliderTriangles,
  isCoursed,
  stoneTone,
  wallFaceGrid,
  wallFaceQuads,
} from './wallCourses.ts';

/**
 * The running bond on the near walls: what it costs, what it leaves alone,
 * and that the wall it draws is the wall the rider collides with.
 */

function collider(halfX: number, halfY: number, halfZ: number, material: 'stone' | 'concrete' | 'wood'): BoxCollider {
  return {
    centre: { x: 10, y: halfY, z: -4 },
    halfExtents: { x: halfX, y: halfY, z: halfZ },
    rotationY: 0.3,
    surface: 'pavement',
    appearance: material,
  };
}

test('only stone tall enough to be a wall is coursed; kerbs, concrete and wood keep their single quad', () => {
  assert.ok(isCoursed(collider(0.2, 1.5, 12, 'stone'), 'stone'));
  assert.equal(isCoursed(collider(0.2, 0.45, 12, 'stone'), 'stone'), false, 'a stone kerb is not a wall');
  assert.equal(isCoursed(collider(0.2, 1.5, 12, 'concrete'), 'concrete'), false, 'BelVar\'s barrier is its own treatment');
  assert.equal(isCoursed(collider(0.2, 1.5, 12, 'wood'), 'wood'), false);
  assert.equal(colliderTriangles(collider(0.2, 0.45, 12, 'stone'), 'stone'), 12);
  assert.equal(colliderTriangles(collider(0.2, 1.5, 12, 'concrete'), 'concrete'), 12);
  // The threshold sits above every kerb in the authored worlds, so kerb
  // concrete keeps the exact value the kerb-contrast contract asserts.
  for (const plan of [createSliceLevel(), createTrackLevel()]) {
    for (const segment of plan.segments) {
      for (const box of segment.colliders) {
        const material = colliderMaterial(box);
        if (material === 'concrete') {
          assert.equal(isCoursed(box, material), false, 'concrete is never coursed');
        }
      }
    }
  }
});

test('the grid fills the face with whole courses and bays, and odd rows carry the half stones', () => {
  const grid = wallFaceGrid(48, 5.9);
  assert.equal(grid.rows, Math.round(5.9 / WALL_COURSES.course));
  assert.equal(grid.columns, Math.round(48 / WALL_COURSES.bay));
  assert.equal(wallFaceQuads({ rows: 1, columns: 1 }), 1);
  assert.equal(wallFaceQuads({ rows: 2, columns: 5 }), 5 + 6);
  assert.equal(wallFaceQuads({ rows: 3, columns: 4 }), 4 + 5 + 4);
  // A wall's end is narrower than a stone and stays one quad.
  assert.deepEqual(wallFaceGrid(0.4, 5.9), { rows: 1, columns: 1 });
});

test('the price is two triangles a quad on the four sides plus a plain top and underside', () => {
  const box = collider(0.2, 1.5, 12, 'stone');
  const long = wallFaceQuads(wallFaceGrid(24, 3));
  const short = wallFaceQuads(wallFaceGrid(0.4, 3));
  assert.equal(colliderTriangles(box, 'stone'), 4 + 2 * (2 * long + 2 * short));
  assert.ok(colliderTriangles(box, 'stone') > 12);
});

test('a stone\'s tone is flat, bounded, deterministic, and belongs to where it stands', () => {
  const a = stoneTone(12.5, -3.25, 2);
  assert.equal(stoneTone(12.5, -3.25, 2), a);
  assert.ok(Math.abs(a - 1) <= WALL_COURSES.toneSpread + WALL_COURSES.courseBias / 2 + 1e-9);
  assert.notEqual(stoneTone(12.5, -3.25, 3), a, 'the row is part of the key');
  assert.notEqual(stoneTone(14.4, -3.25, 2), a, 'the stone\'s own centre is part of the key');
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < 500; i += 1) {
    const tone = stoneTone(i * 1.9, i * 0.7, i % 7);
    min = Math.min(min, tone); max = Math.max(max, tone);
  }
  assert.ok(max - min > WALL_COURSES.toneSpread, 'the tones do not use the spread');
});

test('the coursed wall is the same wall: every vertex lies on the box the rider collides with', () => {
  const plan = createSliceLevel();
  const enhanced = createTerrain(plan, ENHANCED_PRESENTATION);
  const baseline = createTerrain(plan, BASELINE_PRESENTATION);
  try {
    const stone = enhanced.group.children.find((child) => child.name === 'level-blocks-stone') as THREE.Mesh;
    const plain = baseline.group.children.find((child) => child.name === 'level-blocks-stone') as THREE.Mesh;
    assert.ok(stone !== undefined && plain !== undefined);
    const position = stone.geometry.getAttribute('position');
    const colour = stone.geometry.getAttribute('color');
    assert.ok(colour !== undefined, 'the coursed wall carries its tones');
    assert.equal(colour.count, position.count);
    assert.ok(stone.geometry.index!.count / 3 > plain.geometry.index!.count / 3, 'the enhanced wall spent no triangles');

    // Every coursed vertex lies on the surface of one of the stone colliders:
    // the coursing subdivides faces and moves no plane, edge or corner.
    const boxes = plan.segments.flatMap((segment) => segment.colliders)
      .filter((box) => colliderMaterial(box) === 'stone');
    const onBox = (x: number, y: number, z: number): boolean => boxes.some((box) => {
      const cos = Math.cos(box.rotationY); const sin = Math.sin(box.rotationY);
      const dx = x - box.centre.x; const dy = y - box.centre.y; const dz = z - box.centre.z;
      // Inverse of `appendBox`'s yaw: local x = cos·dx − sin·dz, local z = sin·dx + cos·dz.
      const lx = cos * dx - sin * dz; const lz = sin * dx + cos * dz;
      const inside = Math.abs(lx) <= box.halfExtents.x + 1e-4 && Math.abs(dy) <= box.halfExtents.y + 1e-4 && Math.abs(lz) <= box.halfExtents.z + 1e-4;
      const onFace = Math.abs(Math.abs(lx) - box.halfExtents.x) < 1e-4 || Math.abs(Math.abs(dy) - box.halfExtents.y) < 1e-4 || Math.abs(Math.abs(lz) - box.halfExtents.z) < 1e-4;
      return inside && onFace;
    });
    for (let i = 0; i < position.count; i += 1) {
      assert.ok(onBox(position.getX(i), position.getY(i), position.getZ(i)), `vertex ${i} left its collider`);
    }
    // And the top faces are untouched: no vertex above any box's top.
    const highest = Math.max(...boxes.map((box) => box.centre.y + box.halfExtents.y));
    for (let i = 0; i < position.count; i += 1) assert.ok(position.getY(i) <= highest + 1e-4);

    // The plain recipe's stone mesh is white throughout and twelve a box.
    const plainColour = plain.geometry.getAttribute('color');
    for (let i = 0; i < plainColour.count; i += 1) assert.equal(plainColour.getX(i), 1);
    assert.equal(plain.geometry.index!.count / 3, boxes.length * 12);
    assert.equal(enhanced.blockTriangles > baseline.blockTriangles, true);
    assert.equal(baseline.recipe, 'baseline');
    assert.equal(enhanced.recipe, 'enhanced');
  } finally {
    enhanced.dispose();
    baseline.dispose();
  }
});

test('BelVar\'s barrier is untouched by the enhanced recipe', () => {
  const plan = createTrackLevel();
  const enhanced = createTerrain(plan, ENHANCED_PRESENTATION);
  const baseline = createTerrain(plan, BASELINE_PRESENTATION);
  try {
    for (const name of ['level-blocks-concrete', 'level-blocks-signalRed']) {
      const a = enhanced.group.children.find((child) => child.name === name) as THREE.Mesh | undefined;
      const b = baseline.group.children.find((child) => child.name === name) as THREE.Mesh | undefined;
      assert.ok(a !== undefined && b !== undefined, `${name} missing`);
      assert.deepEqual(Array.from(a.geometry.getAttribute('position').array), Array.from(b.geometry.getAttribute('position').array));
    }
    assert.equal(enhanced.blockTriangles, baseline.blockTriangles, 'the circuit\'s blocks gained triangles');
  } finally {
    enhanced.dispose();
    baseline.dispose();
  }
  assert.ok(SURFACES.pavement !== undefined);
});
