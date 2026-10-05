/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Both runtime factories must render the physical ground planes. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { createTerrain as candidateTerrain } from './terrain.ts';
function sampleTriangle(vertices: readonly Vec3[], x: number, z: number): { height: number; interior: boolean } | null {
  const [a, b, c] = vertices;
  const determinant = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  if (Math.abs(determinant) < 1e-12) return null;
  const u = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / determinant;
  const v = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / determinant;
  if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) return null;
  return { height: a.y + u * (b.y - a.y) + v * (c.y - a.y), interior: u > 1e-9 && v > 1e-9 && u + v < 1 - 1e-9 };
}
function actualHeight(mesh: THREE.Mesh, x: number, z: number): number {
  const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index!;
  for (let at = 0; at < indices.count; at += 3) {
    const vertices = [0, 1, 2].map(offset => {
      const index = indices.getX(at + offset);
      return { x: positions.getX(index), y: positions.getY(index), z: positions.getZ(index) };
    });
    const sample = sampleTriangle(vertices, x, z); if (sample) return sample.height;
  }
  throw new Error('No actual rendered triangle covers the probe');
}
test('actual shared and default terrain factories match authoritative nonplanar physical triangles', () => {
  const plan: LevelPlan = { id: 'r18-saddle', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: -10, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2,
      heights: [0, 1, 1, 0], surfaces: ['pavement'] } };
  const before = JSON.stringify(plan), sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  const fixed = candidateTerrain(plan, undefined, undefined, { sharedSurface: true });
  const fixedDefault = candidateTerrain(plan);
  try {
    const fixedMesh = fixed.group.getObjectByName('level-heightfield') as THREE.Mesh;
    const fixedDefaultMesh = fixedDefault.group.getObjectByName('level-heightfield') as THREE.Mesh;
    for (const [x, z] of [[0.2, 0.7], [0.7, 0.2], [0.45, 0.55], [0.55, 0.45], [0.5, 0.5]]) {
      sampler.sampleGround(x, z, sample);
      assert.ok(Math.abs(actualHeight(fixedMesh, x, z) - sample.height) < 1e-8);
      assert.ok(Math.abs(actualHeight(fixedDefaultMesh, x, z) - sample.height) < 1e-8);
    }
    assert.deepEqual(Array.from(fixedDefaultMesh.geometry.index!.array), [0, 3, 1, 0, 2, 3],
      'the default factory also emits the exact authoritative diagonal and upward winding');
    assert.equal(fixed.triangles, fixedDefault.triangles);
    assert.equal(fixedMesh.geometry.index!.count, 6);
    assert.equal(JSON.stringify(plan), before);
  } finally { fixed.dispose(); fixedDefault.dispose(); }
});

