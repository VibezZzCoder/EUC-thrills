/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { planDigest } from '../level/planDigest.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createTerrain } from './terrain.ts';
import { createProps } from './props.ts';
import { measureObject } from './renderCost.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, presentationCost } from './presentation.ts';
import { buildVegetationForm, VEGETATION_HEIGHT_SHARES, VEGETATION_DISTANCE_COUNTS,
  type VegetationFamily, type VegetationVariant } from './vegetationForms.ts';
import { SHARED_VEGETATION_CONTRACTS, ordinaryVegetationBuilders, ultraVegetationBuilders, ordinaryVegetationPainter } from './sharedVegetation.ts';
import { PROP_COLOURS } from '../data/props.ts';
import { materialAppearance } from '../data/surfaces.ts';
import { linearFromHex } from './inkKit.ts';
import { withSharedVegetationCost } from './sharedVegetationCost.ts';
import { toneSharedVegetation, ultraTrunk } from './ultra/ultraFoliage.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ultraCost } from './ultra/ultraCost.ts';
import { measuredPropColourTriangles, ultraPresentationCost } from './ultra/ultraRuntime.ts';
import { isUltraRecipe, ULTRA_FULL, ULTRA_LIT } from './ultra/ultraRecipe.ts';
import type { BuildRecipe } from './ultra/ultraTypes.ts';
import { vegetationDistanceRanges, potentialGeometryTriangles } from './vegetationDistance.ts';
import { prepareFeatureBlocks } from './featureBlockPlan.ts';
import { priceFeatureBlockBuild } from './featureBlockBuildPrice.ts';

function closedOutward(positions: THREE.BufferAttribute): boolean {
  const key = (index: number) => [positions.getX(index), positions.getY(index), positions.getZ(index)]
    .map(value => value.toFixed(5)).join(',');
  const edges = new Map<string, number>();
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index); b.fromBufferAttribute(positions, index + 1);
    c.fromBufferAttribute(positions, index + 2); volume += a.dot(b.cross(c)) / 6;
    const keys = [key(index), key(index + 1), key(index + 2)];
    for (let side = 0; side < 3; side++) {
      const edge = `${keys[side]}|${keys[(side + 1) % 3]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  return volume > 0 && [...edges].every(([edge, count]) => count === 1
    && edges.get(edge.split('|').reverse().join('|')) === 1);
}

for (const detail of ['ordinary', 'ultra'] as const) for (const family of ['crown', 'coniferFoliage', 'shrub'] as const) {
  test(`${detail} ${family} habits are closed, outward, bounded and repeatable`, () => {
    const outputs: string[] = [];
    for (const variant of [0, 1, 2] as const) {
      const builders = detail === 'ultra' ? ultraVegetationBuilders(toneSharedVegetation, variant)
        : ordinaryVegetationBuilders(variant);
      const one = builders[family](), two = builders[family]();
      try {
        const positions = one.getAttribute('position') as THREE.BufferAttribute;
        assert.equal(one.index, null); assert.ok(closedOutward(positions));
        const contract = SHARED_VEGETATION_CONTRACTS[family];
        let low = Infinity, high = -Infinity;
        for (let index = 0; index < positions.count; index++) {
          const p = [positions.getX(index), positions.getY(index), positions.getZ(index)];
          for (let axis = 0; axis < 3; axis++) assert.ok(p[axis] >= contract.min[axis] - 1e-6
            && p[axis] <= contract.max[axis] + 1e-6);
          assert.ok(Math.hypot(p[0], p[2]) <= contract.spreadRadius + 1e-6);
          low = Math.min(low, p[1]); high = Math.max(high, p[1]);
          const n = one.getAttribute('normal');
          assert.ok(Math.abs(Math.hypot(n.getX(index), n.getY(index), n.getZ(index)) - 1) < 1e-5);
        }
        assert.ok(Math.abs(low - contract.min[1]) < 1e-6);
        const expectedTop = contract.min[1]
          + (contract.max[1] - contract.min[1]) * VEGETATION_HEIGHT_SHARES[family][variant];
        assert.ok(Math.abs(high - expectedTop) < 1e-6);
        for (const attribute of ['position', 'normal', 'color']) assert.deepEqual(
          Array.from(one.getAttribute(attribute).array), Array.from(two.getAttribute(attribute).array));
        const color = one.getAttribute('color');
        const semantic = buildVegetationForm(family, detail, variant, contract,
          detail === 'ultra' ? toneSharedVegetation : ordinaryVegetationPainter);
        const mask = semantic.context.wood;
        semantic.geometry.dispose();
        const wood = [...linearFromHex(materialAppearance('wood').albedo)];
        if (detail === 'ultra' && family === 'crown') {
          const original = ultraTrunk();
          try {
            const p = original.getAttribute('position'), n = original.getAttribute('normal'), c = original.getAttribute('color');
            const upper = Array.from({ length: p.count }, (_, i) => i).find(i => p.getY(i) > contract.rootY - 1e-6 && Math.abs(n.getY(i)) < .5);
            assert.notEqual(upper, undefined);
            for (let channel = 0; channel < 3; channel++) wood[channel] *= c.array[upper! * 3 + channel];
          } finally { original.dispose(); }
        }
        const leaf = linearFromHex(family === 'shrub' ? PROP_COLOURS.shrubFoliage : family === 'coniferFoliage' ? PROP_COLOURS.coniferFoliage : PROP_COLOURS.broadleafFoliage);
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0, count = 0;
          for (let index = 0; index < color.count; index++) {
            if (mask[index]) assert.ok(Math.abs(color.array[index * 3 + channel] * leaf[channel] - wood[channel]) < 1e-7,
              'Woody scaffold uses the actual original trunk albedo in the shared bucket');
            else { sum += color.array[index * 3 + channel]; count++; }
          }
          assert.ok(Math.abs(sum / count - 1) < 1e-6,
            'Authored foliage reflectance is normalized over leaves, independently of branch density');
        }
        outputs.push(Array.from(positions.array).join(','));
        // A flipped face can look like a detached sliver from one angle. The
        // independent topology predicate must reject that known-bad control.
        const bad = positions.clone();
        for (let axis = 0; axis < 3; axis++) {
          const first = bad.array[3 + axis]; bad.array[3 + axis] = bad.array[6 + axis]; bad.array[6 + axis] = first;
        }
        assert.equal(closedOutward(bad), false);
      } finally { one.dispose(); two.dispose(); }
    }
    assert.equal(new Set(outputs).size, 3);
  });
}

for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION, ULTRA_FULL, ULTRA_LIT] as readonly BuildRecipe[]) {
  test(`${recipe.id} reports exact shared form deltas without changing the plan or historical factories`, () => {
    const plan = createSliceLevel(), before = planDigest(plan);
    const context = isUltraRecipe(recipe) ? { recipe, shared: createUltraShared(), maxAnisotropy: 1 } : undefined;
    const legacy = createTerrain(plan, recipe, context);
    const shared = createTerrain(plan, recipe, context, { sharedSurface: true });
    const ordinary = isUltraRecipe(recipe) ? ENHANCED_PRESENTATION : recipe;
    const base = presentationCost(plan, ordinary);
    // Shared terrain also partitions native kicker tops. Its separately
    // proved source work must not be attributed to this foliage-only delta.
    const featureOwner = prepareFeatureBlocks(plan);
    const featurePrice = priceFeatureBlockBuild(featureOwner, recipe);
    const ordinaryFeaturePrice = priceFeatureBlockBuild(featureOwner, ordinary);
    const featureWork = featurePrice.colourTriangles + featurePrice.nearShadowTriangles;
    const ordinaryFeatureWork = ordinaryFeaturePrice.colourTriangles + ordinaryFeaturePrice.nearShadowTriangles;
    featureOwner.dispose();
    assert.ok(featureWork > 0, 'this integrated source fixture actually contains independently priced top partitions');
    const oldCost = isUltraRecipe(recipe) ? ultraPresentationCost(base, recipe, ultraCost(plan, recipe), {
      propColourTriangles: measuredPropColourTriangles(shared.group), blockColourTriangles: shared.blockTriangles,
    }) : base;
    try {
      assert.equal(legacy.sharedVegetation, null);
      const report = shared.sharedVegetation!;
      const measuredOld = measureObject(legacy.group), measuredNew = measureObject(shared.group);
      const cost = withSharedVegetationCost(oldCost, report, ordinary);
      assert.equal(cost.drawCalls - oldCost.drawCalls, measuredNew.totalDrawCalls - measuredOld.totalDrawCalls);
      assert.equal(cost.triangles - oldCost.triangles, measuredNew.totalTriangles - measuredOld.totalTriangles - featureWork);
      assert.equal(cost.propColourTriangles, measuredPropColourTriangles(shared.group));
      assert.equal(cost.frame.solo.triangles - oldCost.frame.solo.triangles,
        measuredNew.totalTriangles - measuredOld.totalTriangles - featureWork);
      const ordinaryView = createTerrain(plan, ordinary, undefined, { sharedSurface: true });
      const ordinaryLegacy = createTerrain(plan, ordinary);
      try {
        const ordinaryDelta = measureObject(ordinaryView.group).totalTriangles - measureObject(ordinaryLegacy.group).totalTriangles;
        assert.equal(cost.frame.split.triangles - oldCost.frame.split.triangles, (ordinaryDelta - ordinaryFeatureWork) * 2);
        assert.equal(cost.frame.quad.triangles - oldCost.frame.quad.triangles, (ordinaryDelta - ordinaryFeatureWork) * 4);
      } finally { ordinaryView.dispose(); ordinaryLegacy.dispose(); }
      assert.equal(planDigest(plan), before);
      const meshes = shared.group.getObjectByName('level-props')!.children as THREE.InstancedMesh[];
      const owned = meshes.filter(mesh => mesh.name.includes('-habit-'));
      const geometryOwners = new Set(owned.map(mesh => mesh.geometry)), materialOwners = new Set(owned.map(mesh => mesh.material as THREE.Material));
      assert.equal(report.geometryOwners, geometryOwners.size); assert.equal(report.materialOwners, materialOwners.size);
      assert.ok(owned.length > geometryOwners.size, 'spatial batches share habit resources');
      assert.ok(report.families.every(family => family.variants === 3));
      assert.equal(report.geometryBytes, [...geometryOwners].reduce((sum, geometry) => sum + Object.values(geometry.attributes)
        .reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0), 0));
      assert.equal(report.instanceBytes, owned.reduce((sum, mesh) => sum + mesh.instanceMatrix.array.byteLength
        + mesh.instanceColor!.array.byteLength, 0));
      let disposed = 0;
      for (const mesh of owned) {
        mesh.addEventListener('dispose', () => disposed++);
      }
      for (const geometry of geometryOwners) geometry.addEventListener('dispose', () => disposed++);
      for (const material of materialOwners) material.addEventListener('dispose', () => disposed++);
      shared.dispose(); shared.dispose();
      assert.equal(disposed, owned.length + geometryOwners.size + materialOwners.size);
    } finally { legacy.dispose(); shared.dispose(); }
  });
}

test('local tree batches cull distant instances while sharing immutable habit resources', () => {
  const source = createSliceLevel();
  const plan = { ...source, props: Array.from({ length: 20 }, (_, i) => ({ kind: 'conifer' as const,
    position: { x: i * 128, y: 0, z: 0 }, rotationY: 0, scale: 1 })) };
  const before = planDigest(plan), view = createProps(plan, ENHANCED_PRESENTATION, undefined, { sharedVegetation: true });
  try {
    const trees = view.group.children.filter(mesh => mesh.name.startsWith('level-props-coniferFoliage')) as THREE.InstancedMesh[];
    const camera = new THREE.PerspectiveCamera(55, 1, .1, 100);
    camera.position.set(0, 3, 18); camera.lookAt(0, 3, 0); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = trees.filter(mesh => frustum.intersectsObject(mesh));
    assert.ok(visible.length > 0 && visible.length < trees.length);
    const submitted = visible.reduce((sum, mesh) => sum + mesh.count, 0);
    assert.ok(submitted <= 4, `local frustum submitted ${submitted} of 20 trees`);
    assert.ok(new Set(trees.map(mesh => mesh.geometry)).size <= 3);
    assert.ok(new Set(trees.map(mesh => mesh.material)).size <= 3);
    const worldBatch = new THREE.InstancedMesh(trees[0].geometry, trees[0].material, 20), matrix = new THREE.Matrix4();
    try {
      for (let i = 0; i < 20; i++) worldBatch.setMatrixAt(i, matrix.makeTranslation(i * 128, 0, 0));
      worldBatch.computeBoundingSphere();
      assert.equal(frustum.intersectsObject(worldBatch), true,
        'known-bad world bucket still submits every distant instance when one near tree is visible');
    } finally { worldBatch.dispose(); }
    assert.equal(planDigest(plan), before);
  } finally { view.dispose(); }
});

test('a failed foliage paint releases temporary and output geometry', () => {
  const original = THREE.BufferGeometry.prototype.dispose;
  let releases = 0;
  THREE.BufferGeometry.prototype.dispose = function () { releases++; original.call(this); };
  try {
    assert.throws(() => buildVegetationForm('crown' as VegetationFamily, 'ordinary', 0 as VegetationVariant,
      SHARED_VEGETATION_CONTRACTS.crown, () => { throw new Error('known-bad painter'); }), /known-bad painter/);
    assert.equal(releases, 2);
  } finally { THREE.BufferGeometry.prototype.dispose = original; }
});

for (const detail of ['ordinary', 'ultra'] as const) {
  test(`${detail} packs every foliage family with an exact near prefix and shared indexed resident bytes`, () => {
    for (const variant of [0, 1, 2] as const) {
      const close = detail === 'ordinary' ? ordinaryVegetationBuilders(variant)
        : ultraVegetationBuilders(toneSharedVegetation, variant);
      const packed = detail === 'ordinary' ? ordinaryVegetationBuilders(variant, true)
        : ultraVegetationBuilders(toneSharedVegetation, variant, true);
      for (const family of ['crown', 'shrub', 'coniferFoliage'] as const) {
        const near = close[family](), owner = packed[family]();
        try {
          const ranges = vegetationDistanceRanges(owner)!;
          assert.ok(ranges);
          const prices = VEGETATION_DISTANCE_COUNTS[detail][family];
          for (const level of ['near', 'middle', 'far'] as const) {
            assert.equal(ranges[level].triangles, prices[level]);
            assert.equal(ranges[level].count, prices[level] * 3);
          }
          const indexWordBytes = prices.near * 3 <= 65_536 ? 2 : 4;
          const actualIndexBytes = (prices.near + prices.middle + prices.far) * 3 * indexWordBytes;
          assert.equal(ranges.geometryBytes, prices.near * (108 + (detail === 'ultra' && family !== 'coniferFoliage' ? 12 : 0)) + actualIndexBytes,
            'Near P/N/C and every draw index remain resident when the camera selects far');
          assert.equal(ranges.geometryBytes, Object.values(owner.attributes)
            .reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + owner.index!.array.byteLength);
          assert.equal(potentialGeometryTriangles(owner), prices.near);
          assert.equal(owner.groups.length, 0); assert.ok(owner.index);
          assert.equal(owner.index.array.BYTES_PER_ELEMENT, indexWordBytes);
          for (const name of ['position', 'normal', 'color']) {
            const original = near.getAttribute(name) as THREE.BufferAttribute;
            const allocation = owner.getAttribute(name) as THREE.BufferAttribute;
            assert.deepEqual(Array.from(allocation.array.slice(0, original.array.length)), Array.from(original.array));
          }
        } finally { near.dispose(); owner.dispose(); }
      }
    }
  });
}
