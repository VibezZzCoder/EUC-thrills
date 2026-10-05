/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { planDigest } from '../level/planDigest.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import { edgeSignedDistance } from './groundBoundary.ts';
import { GROUND_BOUNDARY } from '../data/tuning.ts';
import { SURFACES } from '../data/surfaces.ts';
import { ordinaryBoundaryField, installOrdinaryGroundBoundary } from './ordinaryGroundBoundary.ts';
import { sharedShoulderCells } from './sharedStraightShoulders.ts';
import { withSharedGroundContours, sharedContourMask } from './sharedGroundContours.ts';
import { ordinaryBoundaryAttributes, GROUND_BOUNDARY_ATTRIBUTES } from './ordinaryGroundBoundary.ts';
import { createSharedGroundSurface } from './sharedGroundSurface.ts';
import { groundDetailKind, installUltraGroundPatch } from './ultra/ultraGroundDetail.ts';
import { edgeFillFor as ultraEdgeFillFor } from './ultra/groundContact.ts';

function staircase(band: SurfaceId = 'brick', lower: SurfaceId = 'pavement', spacing = 1): LevelPlan {
  const columns = 30, rows = 18;
  return { id: 'shared-contour-1-in-3', spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing, columns: columns + 1, rows: rows + 1,
      heights: Array((columns + 1) * (rows + 1)).fill(1),
      surfaces: Array.from({ length: columns * rows }, (_, cell) =>
        Math.floor(cell / columns) >= 7 + Math.floor((cell % columns) / 3) ? band : lower) } };
}
function fieldFor(plan: LevelPlan) {
  const drawn = terrainCells(plan).bySurface;
  return withSharedGroundContours(plan, drawn, ordinaryBoundaryField(plan, drawn));
}
function firstVertices(plan: LevelPlan): Map<number, number> {
  const first = new Map<number, number>(); let vertex = 0;
  for (const cells of terrainCells(plan).bySurface.values()) for (const cell of cells) { first.set(cell, vertex); vertex += 4; }
  return first;
}
function packed(plan: LevelPlan) {
  const drawn = terrainCells(plan).bySurface, vertices = [...drawn.values()].reduce((sum, cells) => sum + cells.length * 4, 0);
  return ordinaryBoundaryAttributes(plan, drawn, Array(vertices * 3).fill(1), true);
}

test('a 1:3 seam becomes one continuous straight contour instead of half-cell knees', () => {
  const plan = staircase(), original = JSON.stringify(plan), digest = planDigest(plan), cols = plan.heightfield.columns - 1;
  const drawn = terrainCells(plan).bySurface, legacy = ordinaryBoundaryField(plan, drawn), current = fieldFor(plan);
  const sourceBrick = 8 * cols + 4;
  assert.equal(legacy.cells.has(sourceBrick), false,
    'known-bad fill-only field cannot remove the protruding brick part of this source cell');
  assert.equal(current.cells.get(sourceBrick)?.towards, 'pavement', 'the source corner can now meet its paired road contour');
  for (let column = 4; column < 26; column++) {
    const level = 7 + Math.floor(column / 3), fill = current.cells.get((level - 1) * cols + column)!;
    assert.ok(fill, `lower interface cell ${column} has a contour`);
    const line = fill.lines[0];
    for (const x of [column, column + 0.25, column + 0.75, column + 1]) {
      const z = 7.5 + (x - 3) / 3;
      assert.ok(Math.abs(edgeSignedDistance(line, x, z)) < 1e-10,
        `the same analytic line reaches every riser, ${column}/${x}`);
      assert.ok(Math.abs(z - level) <= 0.5 + 1e-10, 'the contour remains within half a source cell');
    }
  }
  assert.ok(current.sharedContours.contours > 0);
  assert.equal(current.lines, [...current.cells.values()].reduce((sum, fill) => sum + fill.lines.length, 0));
  assert.equal(current.pockets.chain + current.pockets.chamfer, current.cells.size);
  assert.equal(JSON.stringify(plan), original); assert.equal(planDigest(plan), digest);
});

test('opposite packed half-planes share a material shoulder and join at the same colour weight', () => {
  const plan = staircase(), current = fieldFor(plan), first = firstVertices(plan), cols = plan.heightfield.columns - 1;
  const data = packed(plan), edge = data.attributes.find(([name]) => name === GROUND_BOUNDARY_ATTRIBUTES.edge)![1];
  const column = 5, level = 7 + Math.floor(column / 3), bandCell = level * cols + column, lowerCell = (level - 1) * cols + column;
  const materialWeight = (cell: number, x: number, z: number) => {
    const fill = current.cells.get(cell)!;
    const row = Math.floor(cell / cols), c = cell % cols, at = first.get(cell)!;
    const localX = x - c, localZ = z - row;
    const a = edge.getX(at), b = edge.getX(at + 1), cc = edge.getX(at + 2);
    const distance = a + (b - a) * localX + (cc - a) * localZ;
    const width = sharedShoulderCells(SURFACES[plan.heightfield.surfaces[cell]].material, plan.heightfield.spacing);
    const cover = Math.max(0, Math.min(1, distance / width + 0.5));
    return fill.towards === 'brick' ? cover : 1 - cover;
  };
  for (const x of [column + 0.1, column + 0.5, column + 0.9]) {
    assert.ok(Math.abs(materialWeight(bandCell, x, level) - materialWeight(lowerCell, x, level)) < 0.008,
      'actual half-float packing meets across the raw cell seam');
  }
  assert.equal(data.bytes, first.size * 4 * 11, 'existing attribute footprint only');
  assert.ok(current.cells.get(bandCell)); assert.ok(current.cells.get(lowerCell));
});

test('hazards, wood and unrendered precise semantics stay excluded; opaque street fragments stay byte-identical', () => {
  const plan = staircase(), cols = plan.heightfield.columns - 1;
  const protectedCell = 8 * cols + 4;
  const triangle = { cell: protectedCell, vertices: [
    { x: 4, y: 1, z: 8 }, { x: 4, y: 1, z: 8.4 }, { x: 4.4, y: 1, z: 8 },
  ] as const };
  plan.groundSurfacePatches = [{ id: 'population-precise-lane', surface: 'pavement', triangles: [triangle] }];
  assert.equal(sharedContourMask(plan)[protectedCell], 1);
  const protectedField = fieldFor(plan);
  for (const [cell, fill] of protectedField.cells) {
    assert.notEqual(cell, protectedCell); assert.notEqual(fill.source, protectedCell);
  }
  plan.groundSurfacePatches = [{ id: 'street-exact-walk', surface: 'pavement', sourceSurface: 'brick', triangles: [triangle] }];
  const before = JSON.stringify(plan), mask = sharedContourMask(plan);
  assert.equal(mask[protectedCell], 0, 'only the hidden substrate of a rendered opaque path is eligible');
  assert.ok(fieldFor(plan).cells.has(protectedCell));
  assert.equal(JSON.stringify(plan), before, 'exact footprint, source plane and physical lookup remain unchanged');
  plan.hazards = [{ id: 'spill', kind: 'spill', centre: { x: 4.5, y: 1, z: 8.5 }, radius: 0.4 }];
  assert.equal(sharedContourMask(plan)[protectedCell], 1, 'a hazard exclusion wins over an opaque path');
  for (const [cell, fill] of fieldFor(plan).cells) {
    assert.notEqual(cell, protectedCell); assert.notEqual(fill.source, protectedCell);
  }
  const wood = staircase('wood', 'pavement');
  assert.equal(fieldFor(wood).cells.size, 0, 'a physical wood band is never recoloured or used as a tone source');
});

test('shared ordinary brick keeps its own running bond even with a neutral protected mode', () => {
  const plan = staircase(), owner = createSharedGroundSurface(1, plan), material = new THREE.MeshStandardMaterial();
  installOrdinaryGroundBoundary(material, false, true); owner.install(material, 'brick', 'ordinary', true);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.match(shader.fragmentShader, /sharedBrickCover = mix\(1\.0, mod\(floor\(vGroundBoundaryMode \/ 4\.0\), 2\.0\), boundaryCover\)/);
  assert.doesNotMatch(shader.fragmentShader, /sharedBrickCover = mix\(step\(7\.5/,
    'known-bad decoder interprets protected mode=0 as no own brick');
  assert.ok(shader.uniforms.sharedGroundMap.value instanceof THREE.DataArrayTexture,
    'brick cells taking non-brick detail bind the existing owned array sampler');
  assert.match(shader.fragmentShader, /if \(code < 0\.5\) return vec3\(0\.5\)/);
  assert.match(shader.fragmentShader, /sharedOwnSample = sharedDetailOf\(0\.0\)/);
  let disposed = 0; shader.uniforms.sharedGroundMap.value.addEventListener('dispose', () => disposed++);
  owner.dispose(); owner.dispose(); material.dispose(); assert.equal(disposed, 1);
});

test('the shared Ultra brick path decodes an opposite material and binds its array without a null sampler', () => {
  const plan = staircase(), owner = createSharedGroundSurface(1, plan), material = new THREE.MeshStandardMaterial();
  installUltraGroundPatch(material, { kind: groundDetailKind('brick'), edge: true, detail: null });
  owner.install(material, 'brick', 'ultra', true);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.ok(shader.fragmentShader.includes('floor(vUltraFillKind / 32.0)'));
  assert.ok(shader.fragmentShader.includes('mod(vUltraFillKind,32.0) - 16.0'));
  assert.ok(shader.fragmentShader.includes('sharedFillSample = sharedDetailOf(sharedFillCode)'));
  assert.ok(shader.fragmentShader.includes('sharedBrickCover = mix(sharedBrickCover, step(3.5, ultraFillKindOnly), ultraEdgeCover)'));
  const declarations = [...shader.fragmentShader.matchAll(/uniform\s+(?:highp\s+)?(sampler\w*)\s+(shared\w*)\s*;/g)];
  assert.equal(declarations.length, 1);
  for (const [, sampler, name] of declarations) {
    const value = shader.uniforms[name]?.value;
    assert.ok(value instanceof THREE.Texture && value.version > 0);
    if (sampler === 'sampler2DArray') assert.ok((value as THREE.DataArrayTexture).isDataArrayTexture);
  }
  owner.dispose(); material.dispose();
});

test('larger-cell contours refuse impossible half-cell gates instead of widening the truth bound', () => {
  const plan = staircase('grass', 'dirt', 2), current = fieldFor(plan);
  assert.equal(current.sharedContours.contours, 0, 'a one-cell riser cannot meet a 0.75 m / 2 m symmetric cap');
  assert.ok(current.cells.size > 0, 'the existing bounded shoulder treatment remains available');
  assert.equal(GROUND_BOUNDARY.capMetres, 0.75);
});

// 2026-10-03, VIS-2: a living-world traffic court on a brick sidewalk or a
// lawn is physics-only and drawn as the coarse brick or grass. Ultra must keep
// M39's original fill there instead of deleting it back to a 1 m staircase.
for (const band of ['brick', 'grass'] as const) {
  test(`Ultra keeps the original fill around a living court drawn as its ${band}, without moving any contour`, () => {
    const courtPlan = (id: string) => {
      const plan = staircase(band), cols = plan.heightfield.columns - 1, triangles = [];
      for (let column = 6; column <= 14; column++) {
        const level = 7 + Math.floor(column / 3);
        for (const row of [level, level + 1]) {
          const cell = row * cols + column;
          triangles.push({ cell, vertices: [{ x: column, y: 1, z: row }, { x: column + 1, y: 1, z: row + 1 },
            { x: column + 1, y: 1, z: row }] as const });
        }
      }
      plan.groundSurfacePatches = [{ id, surface: 'pavement', sourceSurface: band, triangles }];
      return { plan, court: new Set(triangles.map(triangle => triangle.cell)) };
    };
    const { plan, court } = courtPlan(`living-ground/city-commercial/local-side-street/24/0.5/0/turn-0/piece-6/${band}`);
    const drawn = terrainCells(plan).bySurface, original = ultraEdgeFillFor(plan, drawn);
    const touching = [...original.cells].filter(([cell, fill]) => court.has(cell) || court.has(fill.source));
    assert.ok(touching.length > 4, 'control: the original Ultra fill reaches the court cells');
    assert.equal(sharedContourMask(plan)[[...court][0]], 1, 'control: the court stays outside new contour chains');
    const current = withSharedGroundContours(plan, drawn, original);
    for (const [cell, fill] of touching) {
      const kept = current.cells.get(cell);
      assert.ok(kept, `court-adjacent cell ${cell} keeps an edge fill`);
      if (!court.has(cell) && kept !== fill) continue; // a non-court cell may carry a newer contour claim
      assert.equal(kept, fill, `court cell ${cell} keeps its original Ultra fill`);
    }
    // An unrecognised precise patch on the same cells keeps the old exclusion,
    // and the court changes no contour claim: long kerb seams beside it stay put.
    const unknown = courtPlan('population-precise-lane');
    const excluded = withSharedGroundContours(unknown.plan, drawn, ultraEdgeFillFor(unknown.plan, drawn));
    for (const [cell, fill] of excluded.cells) assert.ok(!court.has(cell) && !court.has(fill.source));
    assert.deepEqual(current.sharedContours, excluded.sharedContours, 'identical contour construction');
    for (const [cell, fill] of excluded.cells) assert.deepEqual(current.cells.get(cell), fill, `cell ${cell} unchanged`);
  });
}
