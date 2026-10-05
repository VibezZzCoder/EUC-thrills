/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** SOURCE-ONLY controls. Authored but UNRUN by the proposal author. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { SHARED_GROUND } from '../data/tuning.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { planFeatureBlock, prepareFeatureBlocks, priceFeatureBlocks, type PreparedFeatureBlocks } from './featureBlockPlan.ts';
import { featureBlockTone } from './featureBlockTone.ts';
import { priceFeatureBlockBuild } from './featureBlockBuildPrice.ts';
import { prepareEnvironmentSupplements, priceEnvironmentSupplements } from './environmentSupplementPrice.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, presentationCost } from './presentation.ts';
import { createTerrain } from './terrain.ts';
import { ULTRA_FULL, ULTRA_LIT, ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { ultraCostBreakdown, ultraTargetBytes, ultraPartTriangles } from './ultra/ultraCost.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ULTRA_GROUND_ATTRIBUTES } from './ultra/groundContact.ts';
import type { BuildRecipe } from './ultra/ultraTypes.ts';

function fixture(axis: 'x' | 'z' = 'z', drop = 0.6, yaw = 0.73, top = 1): LevelPlan {
  const e = { x: 3, y: 1.025, z: 4 }, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const spacing = 2.5, columns = 15, rows = 15, originX = -16, originZ = -16;
  const slope = -drop / (2 * e[axis]);
  const heights = Array.from({ length: columns * rows }, (_, index) => {
    const x = originX + (index % columns) * spacing, z = originZ + Math.floor(index / columns) * spacing;
    return slope * (axis === 'x' ? cos * x - sin * z : sin * x + cos * z);
  });
  const socket = { position: { x: 0, y: 0, z: 0 }, headingY: 0, surface: 'dirt' as const, halfWidth: 4, gradient: 0 };
  return { id: 'arbitrary-feature-fixture', props: [], checkpoints: [], spawn: { position: { x: 0, y: 0, z: -10 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: { originX, originZ, spacing, columns, rows, heights, surfaces: Array.from({ length: (columns - 1) * (rows - 1) }, () => 'grass' as const) },
    segments: [{ id: 'arbitrary-source', entry: socket,
      exit: { ...socket, position: { x: 0, y: slope * (axis === 'x' ? -sin * 10 : cos * 10), z: 10 } },
      colliders: [{ centre: { x: 0, y: top - e.y, z: 0 }, halfExtents: e, rotationY: yaw, surface: 'dirt', appearance: 'dirt' }] }] };
}
const boxOf = (plan: LevelPlan): BoxCollider => plan.segments[0].colliders[0];
const close = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≠ ${b}`);

test('real native slice kicker qualifies despite its 2.05m buried hull; full top is 6m × 8m', () => {
  const plan = createSliceLevel(), before = JSON.stringify(plan);
  const source = plan.segments.find(segment => segment.id === 'kicker-run')!;
  const box = source.colliders.find(collider => collider.appearance === 'dirt' && collider.halfExtents.x === 3 && collider.halfExtents.z === 4)!;
  assert.ok(box); close(box.halfExtents.y * 2, 2.05);
  const feature = planFeatureBlock(plan, box, 'dirt');
  assert.ok(feature, 'Known-bad R19 full-height rejection must fail this control');
  assert.ok(feature.exposedMaximumMetres <= 1.4); assert.equal(feature.topQuads.length, 2);
  assert.ok(feature.takeoff!.supportDropMetres >= 0.30);
  for (const point of feature.supports) close(point.groundY, fieldHeightAt(plan.heightfield, plan.surround, point.worldX, point.worldZ));
  assert.equal(JSON.stringify(plan), before);
});

test('rotated nonunit source fields choose both real drop axes/signs, including the shorter side', () => {
  for (const axis of ['x', 'z'] as const) for (const drop of [-0.6, 0.6]) {
    const plan = fixture(axis, drop), box = boxOf(plan), before = JSON.stringify(plan);
    const feature = planFeatureBlock(plan, box, 'dirt')!;
    assert.equal(feature.takeoff!.axis, axis); assert.equal(feature.takeoff!.sign, drop > 0 ? 1 : -1);
    close(feature.takeoff!.supportDropMetres, Math.abs(drop)); assert.equal(feature.supports.length, 8);
    for (const point of feature.supports) {
      close(point.worldX, box.centre.x + Math.cos(box.rotationY) * point.localX + Math.sin(box.rotationY) * point.localZ);
      close(point.worldZ, box.centre.z - Math.sin(box.rotationY) * point.localX + Math.cos(box.rotationY) * point.localZ);
    }
    const renamed = { ...plan, id: 'different-seed-venue-label', segments: plan.segments.map(segment => ({ ...segment, id: 'unrelated-label' })) };
    assert.deepEqual(planFeatureBlock(renamed, box, 'dirt'), feature); assert.equal(JSON.stringify(plan), before);
  }
});

test('support bounds/drop threshold reject tall exposure and retain whole flat ledges/wood', () => {
  const flat = fixture('z', 0), flatBox = boxOf(flat), ledge = planFeatureBlock(flat, flatBox, 'dirt')!;
  assert.equal(ledge.takeoff, null); assert.equal(ledge.topQuads.length, 1);
  assert.equal(planFeatureBlock(fixture('z', 0.9), boxOf(fixture('z', 0.9)), 'dirt'), null);
  const below = fixture('x', 0.2999), above = fixture('x', 0.3001);
  assert.equal(planFeatureBlock(below, boxOf(below), 'dirt')!.topQuads.length, 1);
  assert.equal(planFeatureBlock(above, boxOf(above), 'dirt')!.topQuads.length, 2);
  const woodPlan = fixture(), wood = planFeatureBlock(woodPlan, boxOf(woodPlan), 'wood')!;
  assert.equal(wood.takeoff, null); assert.equal(wood.topQuads.length, 1);
  assert.equal(featureBlockTone(wood, 1, 1), SHARED_GROUND.feature.timberTop);
  for (const material of ['signalRed', 'concrete', 'stone'] as const) assert.equal(planFeatureBlock(flat, flatBox, material), null);
  const tiny = { ...flatBox, halfExtents: { ...flatBox.halfExtents, x: 0.34 } };
  assert.equal(planFeatureBlock(flat, tiny, 'dirt'), null);
});

test('two exact top fractions cover once, keep 0.14m width and preserve original finish numbers', () => {
  const plan = fixture(), box = boxOf(plan), feature = planFeatureBlock(plan, box, 'dirt')!;
  const [main, band] = feature.topQuads;
  close(main.t1, band.t0); close((band.t1 - band.t0) * box.halfExtents.z * 2, 0.14);
  close(feature.topQuads.reduce((sum, quad) => sum + (quad.s1 - quad.s0) * (quad.t1 - quad.t0), 0), 1);
  assert.equal(featureBlockTone(feature, 1, 1), 1.42);
  close(featureBlockTone(feature, 1, 1, true), 1.42 * 0.62);
  assert.equal(featureBlockTone(feature, 0, 0), 0.76); assert.equal(featureBlockTone(feature, 0, 1), 0.96);
  assert.equal(featureBlockTone(feature, -1, 0), 1); assert.equal(featureBlockTone(null, 1, 1, true), 1);
});

test('exact merged price covers normal U16/U32 and whole-bucket U16-to-U32 promotion', () => {
  const prepared = prepareFeatureBlocks(fixture());
  try {
    const ordinary = priceFeatureBlocks(prepared, () => 12, false, false);
    assert.equal(ordinary.commonGeometryBytes, 156); assert.equal(ordinary.addedVertices, 4); assert.equal(ordinary.addedIndices, 6);
    assert.equal(ordinary.colourTriangles, 2); assert.equal(ordinary.nearShadowTriangles, 2); assert.equal(ordinary.staticFarTriangles, 0);
    assert.equal(ordinary.ultraAoBytes, 0);
    const promotion = priceFeatureBlocks(prepared, () => 32766, true, true);
    assert.equal(promotion.buckets[0].sourceVertices, 65532); assert.equal(promotion.buckets[0].vertices, 65536);
    assert.equal(promotion.commonGeometryBytes, 196764); assert.equal(promotion.ultraAoBytes, 4); assert.equal(promotion.staticFarTriangles, 2);
    assert.equal(priceFeatureBlocks(prepared, () => 32768, false, false).commonGeometryBytes, 168);
    assert.throws(() => priceFeatureBlocks(prepared, () => 13, false, false), /complete quads/);
  } finally { prepared.dispose(); }
});

/** A deliberately disabled owner is a known-bad control, never a product option. */
function noFeatures(source: LevelPlan): PreparedFeatureBlocks {
  const blocks = new Map(); let disposed = false;
  return { source, blocks, get disposed() { return disposed; }, dispose() { blocks.clear(); disposed = true; } };
}
function blockMesh(group: THREE.Group, material = 'dirt'): THREE.Mesh<THREE.BufferGeometry> {
  return group.getObjectByName(`level-blocks-${material}`) as THREE.Mesh<THREE.BufferGeometry>;
}
function pnciBytes(geometry: THREE.BufferGeometry): number {
  return ['position', 'normal', 'color'].reduce((sum, name) => sum + (geometry.getAttribute(name) as THREE.BufferAttribute).array.byteLength, 0)
    + geometry.index!.array.byteLength;
}

test('actual baseline/enhanced/Full/Lit emit +4 vertices/+2 triangles and exact common/AO bytes', () => {
  for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION, ULTRA_FULL, ULTRA_LIT] as readonly BuildRecipe[]) {
    const plan = fixture(), before = JSON.stringify(plan), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
    const empty = noFeatures(plan), off = { ...prepared, featureBlocks: empty };
    const context = 'ultra' in recipe ? { recipe, shared: createUltraShared(), maxAnisotropy: 1 } : undefined;
    const original = createTerrain(plan, recipe, context, { sharedSurface: true, environmentSupplements: off });
    const candidate = createTerrain(plan, recipe, context, { sharedSurface: true, environmentSupplements: prepared });
    try {
      const old = blockMesh(original.group), mesh = blockMesh(candidate.group), price = priceFeatureBlockBuild(prepared.featureBlocks, recipe);
      assert.equal(mesh.geometry.getAttribute('position').count - old.geometry.getAttribute('position').count, 4);
      assert.equal(mesh.geometry.index!.count - old.geometry.index!.count, 6);
      assert.equal(candidate.blockTriangles - original.blockTriangles, 2);
      assert.equal(pnciBytes(mesh.geometry) - pnciBytes(old.geometry), price.commonGeometryBytes);
      assert.deepEqual(candidate.featureBlocks, price); assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
      assert.equal(mesh.layers.isEnabled(ULTRA_STATIC_LAYER), 'ultra' in recipe);
      assert.equal(candidate.group.children.length, original.group.children.length, 'No additional material/draw bucket');
      if ('ultra' in recipe) {
        assert.equal(candidate.ultra!.attributeBytes - original.ultra!.attributeBytes, 4);
        assert.equal((mesh.geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.ao) as THREE.BufferAttribute).array.byteLength,
          mesh.geometry.getAttribute('position').count);
      } else assert.equal(mesh.geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.ao), undefined);
      const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal'), box = boxOf(plan);
      let topVertices = 0;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const dx = positions.getX(vertex) - box.centre.x, dz = positions.getZ(vertex) - box.centre.z;
        const x = Math.cos(box.rotationY) * dx - Math.sin(box.rotationY) * dz;
        const z = Math.sin(box.rotationY) * dx + Math.cos(box.rotationY) * dz;
        const y = positions.getY(vertex) - box.centre.y;
        assert.ok(Math.abs(x) <= box.halfExtents.x + 2e-6 && Math.abs(y) <= box.halfExtents.y + 2e-6 && Math.abs(z) <= box.halfExtents.z + 2e-6);
        assert.ok(Math.min(Math.abs(Math.abs(x) - box.halfExtents.x), Math.abs(Math.abs(y) - box.halfExtents.y), Math.abs(Math.abs(z) - box.halfExtents.z)) < 2e-6,
          'Every vertex remains on an original source face');
        if (normals.getY(vertex) > 0) { topVertices++; close(positions.getY(vertex), box.centre.y + box.halfExtents.y, 2e-6); }
      }
      assert.equal(topVertices, 8);
      let topTriangles = 0, topArea = 0;
      for (let index = 0; index < mesh.geometry.index!.count; index += 3) {
        const a = mesh.geometry.index!.getX(index), b = mesh.geometry.index!.getX(index + 1), c = mesh.geometry.index!.getX(index + 2);
        if (normals.getY(a) <= 0 || normals.getY(b) <= 0 || normals.getY(c) <= 0) continue;
        const signedY = (positions.getZ(b) - positions.getZ(a)) * (positions.getX(c) - positions.getX(a))
          - (positions.getX(b) - positions.getX(a)) * (positions.getZ(c) - positions.getZ(a));
        assert.ok(signedY > 0, 'Original upward top winding'); topArea += signedY / 2; topTriangles++;
      }
      assert.equal(topTriangles, 4); close(topArea, box.halfExtents.x * box.halfExtents.z * 4, 3e-5);
      const colours = mesh.geometry.getAttribute('color');
      for (let vertex = 0; vertex < 8; vertex++) close(colours.getX(vertex), vertex < 4 ? 1.42 : 1.42 * 0.62, 2e-6);
      assert.equal(JSON.stringify(plan), before);
    } finally { candidate.dispose(); original.dispose(); prepared.dispose(); empty.dispose(); }
  }
});

test('ordinary pane and Ultra near/far cost deltas price the same source bands before admission', () => {
  const plan = fixture(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] }), empty = noFeatures(plan), off = { ...prepared, featureBlocks: empty };
  try {
    for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION]) {
      const a = presentationCost(plan, recipe, null, off), b = presentationCost(plan, recipe, null, prepared);
      assert.equal(b.drawCalls, a.drawCalls); assert.equal(b.colourTriangles - a.colourTriangles, 2); assert.equal(b.shadowTriangles - a.shadowTriangles, 2);
      for (const [key, panes] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
        assert.equal(b.frame[key].triangles - a.frame[key].triangles, 4 * panes); assert.equal(b.frame[key].drawCalls, a.frame[key].drawCalls);
      }
    }
    for (const recipe of [ULTRA_FULL, ULTRA_LIT]) {
      const a = ultraCostBreakdown(plan, recipe, null, off), b = ultraCostBreakdown(plan, recipe, null, prepared);
      assert.equal(b.colourTriangles - a.colourTriangles, 2); assert.equal(b.shadowTriangles - a.shadowTriangles, 2);
      const farA = a.frame.passes.find(pass => pass.name === 'far-shadow-build'), farB = b.frame.passes.find(pass => pass.name === 'far-shadow-build');
      if (recipe.ultra.farShadow) { assert.equal(farB!.triangles - farA!.triangles, 2); assert.equal(farB!.drawCalls, farA!.drawCalls); }
      else assert.equal(farB, undefined);
      const feature = priceFeatureBlockBuild(prepared.featureBlocks, recipe);
      const price = priceEnvironmentSupplements(prepared, recipe.ultra.forms ? 'ultra' : 'ordinary', true, part => ultraPartTriangles(part, recipe), undefined, feature);
      const offPrice = priceEnvironmentSupplements(off, recipe.ultra.forms ? 'ultra' : 'ordinary', true, part => ultraPartTriangles(part, recipe), undefined, priceFeatureBlockBuild(empty, recipe));
      assert.equal(price.resourceBytes, offPrice.resourceBytes, 'Terrain buffers never charged again as supplements');
      const targets = ultraTargetBytes(recipe, { width: 800, height: 600 }, undefined, null, price);
      assert.equal(targets.filter(target => target.name === 'shared-feature-block-common').length, 1);
      assert.equal(targets.find(target => target.name === 'shared-feature-block-common')!.bytes, feature.commonGeometryBytes);
      assert.equal(price.featureAoBytes, 4);
    }
  } finally { prepared.dispose(); empty.dispose(); }
});

test('nonfeature signal/hazard/wall geometry and vertex colours remain byte-identical', () => {
  const plan = fixture(), box = boxOf(plan); box.appearance = 'signalRed';
  const prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] }), empty = noFeatures(plan), off = { ...prepared, featureBlocks: empty };
  const a = createTerrain(plan, BASELINE_PRESENTATION, undefined, { sharedSurface: true, environmentSupplements: off });
  const b = createTerrain(plan, BASELINE_PRESENTATION, undefined, { sharedSurface: true, environmentSupplements: prepared });
  try {
    const old = blockMesh(a.group, 'signalRed').geometry, next = blockMesh(b.group, 'signalRed').geometry;
    for (const key of ['position', 'normal', 'color']) assert.deepEqual((next.getAttribute(key) as THREE.BufferAttribute).array, (old.getAttribute(key) as THREE.BufferAttribute).array);
    assert.deepEqual(next.index!.array, old.index!.array); assert.equal(b.featureBlocks!.bands, 0);
    assert.equal(b.hazards.triangles, a.hazards.triangles);
  } finally { b.dispose(); a.dispose(); prepared.dispose(); empty.dispose(); }
});

test('prepared cache ownership expires idempotently and rejects foreign/disposed sources before allocation', () => {
  const plan = fixture(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  assert.throws(() => createTerrain({ ...plan }, BASELINE_PRESENTATION, undefined, { sharedSurface: true, environmentSupplements: prepared }), /different or disposed source/);
  prepared.dispose(); prepared.dispose(); assert.equal(prepared.featureBlocks.disposed, true); assert.equal(prepared.metric.disposed, true);
  assert.throws(() => prepared.featureBlocks.blocks, /disposed/);
  assert.throws(() => priceEnvironmentSupplements(prepared, 'ordinary', false, part => PART_COSTS[part].triangles), /Feature supplement source owner mismatch/);
});
