/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { materialAppearance, type MaterialId } from '../../data/surfaces.ts';
import { ULTRA } from '../../data/tuning.ts';
import { planColliders } from '../../level/buildPlan.ts';
import { generateLevel } from '../../level/generateRoute.ts';
import type { BoxCollider, LevelPlan } from '../../level/plan.ts';
import { createProvingGround } from '../../level/provingGround.ts';
import { colliderMaterial } from '../../level/renderBudget.ts';
import { createSliceLevel } from '../../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../../level/switchbackLevel.ts';
import { createTrackLevel } from '../../level/trackLevel.ts';
import { createTerrain } from '../terrain.ts';
import { colliderTriangles, wallFaceGrid, wallFaceQuads } from '../wallCourses.ts';
import { ULTRA_GROUND_ATTRIBUTES } from './groundContact.ts';
import {
  ULTRA_BLOCK_ANCHORS,
  ULTRA_BLOCK_FIXED_GEOMETRY,
  blockBaseAo,
  patchUltraBlockFragment,
  plankTone,
  ultraColliderTriangles,
  ultraFaceDivision,
} from './ultraBlocks.ts';
import { createUltraShared, patchUltraFragment, ultraBlockMaterial } from './ultraMaterials.ts';
import { ULTRA_FULL, ULTRA_LIT, applyKitOverride } from './ultraRecipe.ts';

/**
 * The Ultra collider blocks (M39 T9): how a face divides, what that costs,
 * and that the price is the built scene.
 *
 * The price matters as much as the look. `ultraCost` (W7) admits an Ultra
 * world on `ultraColliderTriangles` before a mesh exists; if the builder drew
 * one triangle the price did not, the envelope would be enforced against a
 * scene that is not the one on screen. So the central test builds every
 * shipped world and sums.
 */

function box(height: number, material: MaterialId, halfX = 0.2, halfZ = 6): BoxCollider {
  return {
    centre: { x: 3, y: height / 2, z: -2 },
    halfExtents: { x: halfX, y: height / 2, z: halfZ },
    rotationY: 0.4,
    surface: 'pavement',
    appearance: material,
  };
}

test('a face divides by material and height, and the barrier materials never divide', () => {
  for (const material of ULTRA_BLOCK_FIXED_GEOMETRY) {
    assert.deepEqual(ultraFaceDivision(box(3, material), material, 12), { kind: 'single' }, `${material} was re-tessellated`);
  }
  // Tall wood takes planks at about the course height; short wood does not.
  const deck = ultraFaceDivision(box(1.0, 'wood'), 'wood', 12);
  assert.deepEqual(deck, { kind: 'planks', rows: Math.round(1.0 / ULTRA.blocks.plankCourse) });
  assert.deepEqual(ultraFaceDivision(box(0.3, 'wood'), 'wood', 12), { kind: 'single' });
  // A coursed stone wall keeps the enhanced bond exactly …
  const wall = box(3, 'stone');
  assert.deepEqual(ultraFaceDivision(wall, 'stone', 12), { kind: 'coursed', grid: wallFaceGrid(12, 3) });
  // … and its narrow end, which the bond leaves whole, is split at the AO line.
  assert.deepEqual(ultraFaceDivision(wall, 'stone', 0.4), { kind: 'split', at: ULTRA.blocks.baseAoMetres / 3 });
  // A tall metal leg splits; a kerb-height block does not; a face just over
  // the AO line stays whole rather than growing a sliver.
  assert.deepEqual(ultraFaceDivision(box(4, 'metal'), 'metal', 0.3), { kind: 'split', at: ULTRA.blocks.baseAoMetres / 4 });
  assert.deepEqual(ultraFaceDivision(box(0.15, 'stone'), 'stone', 12), { kind: 'single' });
  assert.deepEqual(ultraFaceDivision(box(0.7, 'metal'), 'metal', 12), { kind: 'single' });
});

test('the price is two triangles a quad, and the enhanced price when the kit builds no Ultra blocks', () => {
  const kit = ULTRA_FULL.ultra;
  const noBlocks = applyKitOverride(ULTRA_FULL, { blocks: false }).ultra;
  const wall = box(3, 'stone');
  const long = wallFaceQuads(wallFaceGrid(12, 3));
  assert.equal(ultraColliderTriangles(wall, 'stone', kit), 4 + 2 * (2 * long) + 2 * 4);
  assert.equal(ultraColliderTriangles(wall, 'stone', noBlocks), colliderTriangles(wall, 'stone'));
  const deck = box(1.0, 'wood');
  const rows = Math.round(1.0 / ULTRA.blocks.plankCourse);
  assert.equal(ultraColliderTriangles(deck, 'wood', kit), 4 + 4 * 2 * rows);
  for (const material of ULTRA_BLOCK_FIXED_GEOMETRY) {
    assert.equal(ultraColliderTriangles(box(1.2, material), material, kit), 12);
  }
});

function blockTotal(plan: LevelPlan, kit = ULTRA_FULL.ultra): number {
  let sum = 0;
  for (const collider of planColliders(plan)) sum += ultraColliderTriangles(collider, colliderMaterial(collider), kit);
  return sum;
}

test('the model is the built scene: every shipped world\'s Ultra blocks cost exactly what they are priced at', () => {
  const worlds: readonly [string, LevelPlan][] = [
    ['slice', createSliceLevel()],
    ['belvar', createTrackLevel()],
    ['switchback', createSwitchbackLevel()],
    ['proving', createProvingGround()],
    ['town', generateLevel('euc').plan],
  ];
  for (const [name, plan] of worlds) {
    for (const recipe of [ULTRA_FULL, ULTRA_LIT, applyKitOverride(ULTRA_FULL, { blocks: false })]) {
      const view = createTerrain(plan, recipe, { recipe, shared: createUltraShared(), maxAnisotropy: 1 });
      try {
        assert.equal(view.blockTriangles, blockTotal(plan, recipe.ultra), `${name} ${recipe.id} blocks disagree with their price`);
        let drawn = 0;
        for (const child of view.group.children) {
          if (child.name.startsWith('level-blocks-')) drawn += (child as THREE.Mesh).geometry.index!.count / 3;
        }
        assert.equal(drawn, view.blockTriangles);
      } finally {
        view.dispose();
      }
    }
  }
});

test('base AO ramps from the floor to one over the bottom 0.6 m, and leaves a kerb alone', () => {
  assert.equal(blockBaseAo(0, 2), ULTRA.blocks.baseAoFloor);
  assert.equal(blockBaseAo(ULTRA.blocks.baseAoMetres, 2), 1);
  assert.equal(blockBaseAo(1.8, 2), 1);
  assert.equal(blockBaseAo(0, 0.15), 1, 'a kerb was darkened');
  let previous = 0;
  for (let h = 0; h <= 0.8; h += 0.05) {
    const value = blockBaseAo(h, 2);
    assert.ok(value >= previous - 1e-12, 'the ramp is not monotone');
    assert.ok(value >= ULTRA.blocks.baseAoFloor && value <= 1);
    previous = value;
  }
});

test('a plank course is one flat tone, within its spread, and belongs to its face and row', () => {
  const a = plankTone(12.5, -4.25, 2);
  assert.equal(plankTone(12.5, -4.25, 2), a);
  assert.notEqual(plankTone(12.5, -4.25, 3), a, 'the row is not part of the key');
  assert.notEqual(plankTone(14.5, -4.25, 2), a, 'the face is not part of the key');
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 400; i += 1) {
    const tone = plankTone(i * 1.3, i * 0.7, i % 5);
    assert.ok(Math.abs(tone - 1) <= ULTRA.blocks.plankTone + 1e-12);
    min = Math.min(min, tone);
    max = Math.max(max, tone);
  }
  assert.ok(max - min > ULTRA.blocks.plankTone, 'the tones do not use the spread');
});

test('Ultra blocks carry their base AO: the floor at the foot of a tall face, one on top', () => {
  const plan = createSwitchbackLevel();
  const view = createTerrain(plan, ULTRA_FULL, { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 });
  try {
    const colliders = planColliders(plan);
    let feet = 0;
    for (const child of view.group.children) {
      if (!child.name.startsWith('level-blocks-')) continue;
      const geometry = (child as THREE.Mesh).geometry;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const ao = geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.ao);
      assert.ok(ao !== undefined && ao.count === position.count, `${child.name} lacks its AO`);
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const value = ao.getX(vertex);
        assert.ok(value >= ULTRA.blocks.baseAoFloor && value <= 1);
        if (normal.getY(vertex) !== 0) {
          assert.equal(value, 1, 'a top or underside was darkened');
          continue;
        }
        // The box this vertex belongs to, by its foot.
        const y = position.getY(vertex);
        const owner = colliders.find((c) => Math.abs(y - (c.centre.y - c.halfExtents.y)) < 1e-6 && c.halfExtents.y * 2 >= ULTRA.blocks.minFaceHeight);
        if (owner !== undefined && Math.abs(value - ULTRA.blocks.baseAoFloor) < 0.01) feet += 1;
      }
    }
    assert.ok(feet > 0, 'no tall block wears a darkened foot');
  } finally {
    view.dispose();
  }
});

test('Wave 3: a lit block takes the ground\'s sheen and lift on its top and a reduced fill on its faces', () => {
  const context = (override: Parameters<typeof applyKitOverride>[1] = null) => ({
    recipe: applyKitOverride(ULTRA_FULL, override),
    shared: createUltraShared(),
    maxAnisotropy: 1,
  });
  const compile = (material: THREE.MeshStandardMaterial): { fragmentShader: string; uniforms: Record<string, THREE.IUniform> } => {
    const lib = THREE.ShaderLib.standard;
    const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
  };
  const lit = ultraBlockMaterial(materialAppearance('wood'), 'wood', context());
  assert.ok('ULTRA_BLOCK_RESPONSE' in (lit.defines ?? {}), 'the response has its own define, so its program has its own key');
  const text = compile(lit).fragmentShader;
  // After the shared patch's AO and before the light is summed.
  const aomap = text.indexOf('#include <aomap_fragment>');
  const response = text.indexOf('ultraBlockSide');
  const lift = text.indexOf('ultraLiftShade');
  const total = text.indexOf('vec3 totalDiffuse');
  assert.ok(aomap >= 0 && aomap < response && response < lift && lift < total, 'the response is not between the AO and the sum');
  assert.ok(text.includes(`mix( 1.0, ${String(ULTRA.shade.blockSideFill)}, ultraBlockSide )`), 'the side fill is not the table\'s');
  assert.ok(text.includes(`mix( 1.0, ${String(ULTRA.shade.blockTopSpec)}, ultraBlockTop )`), 'the top does not take its sheen share');
  assert.ok(text.includes(`mix( 1.0, ${String(ULTRA.shade.blockSideSpec)}, ultraBlockSide )`), 'the side sheen is not the table\'s');
  // `-lighting` keeps the surfaces (base AO) and drops the response.
  const plain = ultraBlockMaterial(materialAppearance('wood'), 'wood', context({ lighting: false }));
  assert.ok(!('ULTRA_BLOCK_RESPONSE' in (plain.defines ?? {})));
  assert.ok(!compile(plain).fragmentShader.includes('ultraBlockSide'));
  // Every anchor is there once after the shared patch, and a missing one fails loudly.
  const after = patchUltraFragment(THREE.ShaderLib.standard.fragmentShader);
  for (const anchor of Object.values(ULTRA_BLOCK_ANCHORS)) assert.equal(after.split(anchor).length - 1, 1, `${anchor} is not unique`);
  assert.throws(() => patchUltraBlockFragment('void main() {}'), /Ultra block patch anchor missing/);
});
