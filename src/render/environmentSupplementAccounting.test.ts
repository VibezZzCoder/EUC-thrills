/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Source-only factory/owner controls; UNRUN by the draft author. Requires
 * root's sequential foliage + accounting hook composition, never a live write.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { PART_COSTS, type PropPartId } from '../data/renderCost.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { positionHash01 } from '../shared/maths.ts';
import { prepareVegetationPrice, priceVegetation, assertVegetationPriceEmission } from './sharedVegetationPricePlan.ts';
import { prepareOriginalCapSlots, priceOriginalCapSlots, assertOriginalCapSlotEmission } from './originalCapSlotPrice.ts';
import { sharedGroundArrayPrice } from './sharedGroundArrayPrice.ts';
import { VEGETATION_DISTANCE_COUNTS, type VegetationFamily } from './vegetationForms.ts';
import { ordinaryVegetationBuilders, ultraVegetationBuilders } from './sharedVegetation.ts';
import { vegetationDistanceRanges, potentialGeometryTriangles } from './vegetationDistance.ts';
import { toneSharedVegetation } from './ultra/ultraFoliage.ts';
import { ultraCasts } from './ultra/ultraKit.ts';
import { ULTRA_SLOT_ATTRIBUTE } from './ultra/ultraBuildings.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, presentationCost } from './presentation.ts';
import { ULTRA_FULL, ULTRA_LIT, ULTRA_STATIC_LAYER, isUltraRecipe } from './ultra/ultraRecipe.ts';
import { ultraPartTriangles, ultraCostBreakdown, ultraTargetBytes, ultraBytes } from './ultra/ultraCost.ts';
import { headlessUltraContext } from './renderCost.ts';
import { createProps } from './props.ts';
import { createTerrain } from './terrain.ts';
import { createEnvironmentVegetation } from './environmentVegetation.ts';
import { prepareEnvironmentSupplements, priceEnvironmentSupplements } from './environmentSupplementPrice.ts';

const ordinaryTriangles = (part: PropPartId): number => PART_COSTS[part].triangles;
const ordinaryPolicy = { nearCasts: (part: PropPartId) => PART_COSTS[part].castsShadow, buildings: false, farShadow: false };
function fixture(): LevelPlan {
  const roots = new Map<number, number>();
  for (let x = 1; roots.size < 3 && x < 1000; x++) roots.set(Math.floor(positionHash01(x, 0, 617) * 3), x);
  assert.equal(roots.size, 3);
  const props: Prop[] = [];
  for (const kind of ['broadleafTree', 'shrub', 'conifer'] as const) for (const x of roots.values())
    props.push({ kind, position: { x, y: 0, z: 0 }, rotationY: 0, scale: 1 });
  for (const x of [0, 11, 80]) props.push({ kind: 'building', position: { x, y: 0, z: 50 },
    rotationY: 0, scale: 1, size: { x: 10, y: 8, z: 10 } });
  return { id: 'accounting-controls', props, segments: [], checkpoints: [], spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: 0, originZ: 0, spacing: 1,
      columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['grass'] } };
}

test('near P/N/C and all-level indices have unique actual resident owners, and colour submits one range', () => {
  const plan = fixture(), prepared = prepareVegetationPrice(plan);
  try {
    for (const detail of ['ordinary', 'ultra'] as const) {
      const price = priceVegetation(prepared, detail, ordinaryTriangles, ordinaryPolicy);
      let resident = 0;
      for (const family of prepared.families) for (const variant of family.variants) {
        const builders = detail === 'ordinary' ? ordinaryVegetationBuilders(variant as 0 | 1 | 2, true)
          : ultraVegetationBuilders(toneSharedVegetation, variant as 0 | 1 | 2, true);
        const geometry = builders[family.part]();
        try {
          const ranges = vegetationDistanceRanges(geometry); assert.ok(ranges, family.part);
          const levels = VEGETATION_DISTANCE_COUNTS[detail][family.part];
          assert.deepEqual([ranges.near.triangles, ranges.middle.triangles, ranges.far.triangles],
            [levels.near, levels.middle, levels.far]);
          assert.ok(geometry.index); assert.equal(geometry.groups.length, 0);
          const actualAttributeBytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0);
          const actualBytes = actualAttributeBytes + geometry.index.array.byteLength;
          const indexWordBytes = levels.near * 3 <= 65_536 ? 2 : 4;
          assert.equal(actualAttributeBytes, levels.near * (108 + (detail === 'ultra' && family.part !== 'coniferFoliage' ? 12 : 0)));
          assert.equal(geometry.index.array.BYTES_PER_ELEMENT, indexWordBytes);
          assert.equal(geometry.index.array.byteLength, (levels.near + levels.middle + levels.far) * 3 * indexWordBytes);
          assert.equal(ranges.geometryBytes, actualBytes);
          assert.equal(potentialGeometryTriangles(geometry), levels.near);
          for (const level of ['near', 'middle', 'far'] as const) {
            geometry.setDrawRange(ranges[level].start, ranges[level].count);
            assert.equal(geometry.drawRange.count / 3, levels[level]);
          }
          resident += actualBytes;
        } finally { geometry.dispose(); }
      }
      assert.equal(price.geometryBytes, resident);
      const semanticBytes = detail === 'ultra' ? price.families.filter(f => f.part !== 'coniferFoliage').reduce((sum, f) => sum + f.nearTriangles * f.variants * 12, 0) : 0;
      // 2026-10-04: the old 9,368,208 / 20,124,288 pins were R22's UNRUN
      // conifer proposal (4,736/2,368/928 and 11,760/5,880/1,656; see
      // r22-conifer-coherence-repair-v1/PRICE-DERIVATION.json), never a built
      // state. R27's conifer counts superseded it and R32 kept them
      // (CHANGELOG 2026-10-03; pinned in vegetationForms.test.ts). Three
      // habits each, P/N/C plus every index, semantic bytes excluded:
      //   ordinary crown 4,490,640 + shrub 3,198,528 + conifer 4,519,872
      //   Ultra    crown 9,607,680 + shrub 6,359,040 + conifer 9,626,688
      // (Ultra crown and conifer use Uint32 indices: >65,536 near corners).
      // Only the conifer terms differ from the R22 proposal.
      const pinned = detail === 'ordinary' ? 4_490_640 + 3_198_528 + 4_519_872
        : 9_607_680 + 6_359_040 + 9_626_688;
      assert.equal(resident, pinned + semanticBytes);
      console.log(JSON.stringify({ detail, resident, semanticBytes }));
      assert.notEqual(price.geometryBytes, price.families.reduce((sum, f) => sum + f.nearTriangles * f.variants * 108, 0),
        'negative control: omitted index storage must undercount');
      const historicalUnindexed = detail === 'ordinary' ? 20_215_008 : 38_211_264;
      assert.notEqual(resident, historicalUnindexed, 'Archived all-LOD unindexed pins must not bill the new format');
    }
    const single = prepareVegetationPrice({ ...plan, props: [plan.props![0], plan.props![0]] });
    try { const price = priceVegetation(single, 'ordinary', ordinaryTriangles, ordinaryPolicy);
      assert.equal(price.families[0].variants, 1); assert.equal(price.families[0].buckets, 1);
      assert.equal(price.instanceBytes, 152); assert.equal(price.colourDrawDelta, 0);
      assert.equal(price.geometryBytes, 1_496_880);
    } finally { single.dispose(); }
  } finally { prepared.dispose(); }
});

test('actual independently emitted source batches match complete family/habit ownership for both ordinary and Ultra rungs', () => {
  const plan = fixture(), before = JSON.stringify(plan), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  try {
    for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION, ULTRA_FULL, ULTRA_LIT]) {
      const ultra = isUltraRecipe(recipe), detail = ultra && recipe.ultra.forms ? 'ultra' : 'ordinary';
      const policy = ultra ? { nearCasts: (part: PropPartId) => ultraCasts(part, PART_COSTS[part].castsShadow, recipe.ultra),
        buildings: recipe.ultra.buildings, farShadow: recipe.ultra.farShadow } : ordinaryPolicy;
      const price = priceVegetation(prepared.vegetationPrice, detail, ordinaryTriangles, policy);
      const view = createProps(plan, recipe, ultra ? headlessUltraContext(recipe) : undefined,
        { sharedVegetation: true, vegetationPrice: prepared.vegetationPrice, capSlots: prepared.capSlots });
      try {
        assert.equal(view.sharedVegetation!.geometryBytes, price.geometryBytes);
        assert.equal(view.sharedVegetation!.instanceBytes, price.instanceBytes);
        const owned = new Set<THREE.BufferGeometry>();
        for (const mesh of view.group.children as THREE.InstancedMesh[]) if (vegetationDistanceRanges(mesh.geometry)) owned.add(mesh.geometry);
        assert.equal(owned.size, prepared.vegetationPrice.families.reduce((sum, f) => sum + f.variants.length, 0));
        for (const family of price.families) {
          const actual = view.sharedVegetation!.families.find(f => f.part === family.part)!;
          assert.equal(actual.colourTriangles, family.nearTriangles * family.instances);
          assert.equal(actual.shadowTriangles, family.nearTriangles * family.instances);
          assert.equal(actual.drawCalls, family.buckets); assert.equal(actual.shadowDrawCalls, family.nearDraws);
        }
        const observed = (view.group.children as THREE.InstancedMesh[]).filter(mesh => vegetationDistanceRanges(mesh.geometry))
          .map(mesh => ({ part: mesh.name.includes('coniferFoliage') ? 'coniferFoliage' as VegetationFamily
            : mesh.name.includes('crown') ? 'crown' as VegetationFamily : 'shrub' as VegetationFamily,
            variant: Number(mesh.name.match(/habit-(\d+)/)![1]), matrices: Array.from(mesh.instanceMatrix.array) }));
        assertVegetationPriceEmission(prepared.vegetationPrice, observed);
        assert.throws(() => assertVegetationPriceEmission(prepared.vegetationPrice, observed.slice(1)), /differs/);
      } finally { view.dispose(); }
    }
    assert.equal(JSON.stringify(plan), before);
  } finally { prepared.dispose(); }
});

test('original cap slot bytes price every cap and actual far callback repeats the entire source bucket once', () => {
  const plan = fixture(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  const view = createProps(plan, ULTRA_FULL, headlessUltraContext(ULTRA_FULL),
    { sharedVegetation: true, vegetationPrice: prepared.vegetationPrice, capSlots: prepared.capSlots });
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(), override = new THREE.MeshDepthMaterial();
  camera.layers.set(ULTRA_STATIC_LAYER); scene.overrideMaterial = override;
  let calls = 0, triangles = 0;
  const counter = { renderBufferDirect(_camera: THREE.Camera, _scene: THREE.Scene, geometry: THREE.BufferGeometry,
    _material: THREE.Material, object: THREE.InstancedMesh) {
    calls++; const available = geometry.index?.count ?? geometry.getAttribute('position').count;
    const count = Math.min(available - geometry.drawRange.start, geometry.drawRange.count);
    triangles += count / 3 * object.count;
  } } as unknown as THREE.WebGLRenderer;
  try {
    const caps = view.group.children.find(mesh => mesh.name === 'level-props-buildingCap') as THREE.InstancedMesh;
    const flags = caps.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE); assert.ok(flags);
    assert.equal(flags.array.byteLength, prepared.capSlots.count * 4);
    assert.equal(view.capSlotBytes, flags.array.byteLength);
    assert.ok(Array.from(flags.array).some(value => value > 0)); assert.ok(Array.from(flags.array).some(value => value === 0));
    // createProps checked its independent Float64 source array before upload;
    // the installed instance attribute rounds that array to Float32.
    assert.deepEqual(caps.instanceMatrix.array, new Float32Array(prepared.capSlots.matrices));
    assertOriginalCapSlotEmission(prepared.capSlots, prepared.capSlots.matrices, flags.array as Uint8Array, true);
    const wrong = Uint8Array.from(flags.array); wrong[0] ^= 255;
    assert.throws(() => assertOriginalCapSlotEmission(prepared.capSlots, prepared.capSlots.matrices, wrong, true), /Prepared cap slots differ from actual original source allocation/);
    for (const mesh of view.group.children as THREE.InstancedMesh[]) if (mesh.castShadow && mesh.layers.isEnabled(ULTRA_STATIC_LAYER)) {
      mesh.onBeforeRender(counter, scene, camera, mesh.geometry, override, null as unknown as THREE.Group);
      counter.renderBufferDirect(camera, scene, mesh.geometry, override, mesh, null as unknown as THREE.GeometryGroup);
      mesh.onAfterRender(counter, scene, camera, mesh.geometry, override, null as unknown as THREE.Group);
    }
    const price = priceOriginalCapSlots(prepared.capSlots, true, true, ultraPartTriangles('buildingCap', ULTRA_FULL));
    assert.equal(price.farExtraDraws, 1); assert.equal(price.farExtraTriangles, potentialGeometryTriangles(caps.geometry) * caps.count);
    assert.equal(view.farCapExtraTriangles, price.farExtraTriangles);
    const far = ultraCostBreakdown(plan, ULTRA_FULL, null, prepared).frame.passes.find(p => p.name === 'far-shadow-build')!;
    assert.deepEqual({ calls, triangles }, { calls: far.drawCalls, triangles: far.triangles });
    assert.notEqual(far.triangles - price.farExtraTriangles, triangles, 'negative control: omitting the repeat must fail');
    assert.equal(priceOriginalCapSlots(prepared.capSlots, true, false, 44).farExtraTriangles, 0);
    const isolated = prepareOriginalCapSlots({ ...plan, props: [plan.props!.at(-1)!] });
    try { assert.deepEqual(priceOriginalCapSlots(isolated, true, true, 44), { flagBytes: 0, farExtraDraws: 0, farExtraTriangles: 0 }); }
    finally { isolated.dispose(); }
  } finally { override.dispose(); view.dispose(); prepared.dispose(); }
});

test('tree geometry/instances and common array have unique model/actual owners; both Ultra rungs retain building casters', () => {
  const plan = fixture(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  try {
    for (const recipe of [ULTRA_FULL, ULTRA_LIT]) {
      const policy = { nearCasts: (part: PropPartId) => ultraCasts(part, PART_COSTS[part].castsShadow, recipe.ultra),
        buildings: recipe.ultra.buildings, farShadow: recipe.ultra.farShadow };
      const price = priceEnvironmentSupplements(prepared, recipe.ultra.forms ? 'ultra' : 'ordinary', true,
        part => ultraPartTriangles(part, recipe), policy);
      const terrain = createTerrain(plan, recipe, headlessUltraContext(recipe), { sharedSurface: true, environmentSupplements: prepared });
      try {
        assert.equal(price.sharedGroundArrayBytes, terrain.sharedGround!.bytes); assert.equal(price.sharedGroundArrayBytes, 2_446_668);
        assert.equal(price.capSlotBytes, terrain.ultra!.capSlotBytes);
        assert.ok(terrain.group.children.some(group => group.name === 'level-props' && group.children.some(child => child.name.includes('building') && (child as THREE.Mesh).castShadow)));
        const targets = ultraTargetBytes(recipe, { width: 2880, height: 1800 }, undefined, null, price);
        const working = ultraBytes(recipe, { width: 2880, height: 1800 }, null, price);
        assert.equal(working.steady, targets.reduce((sum, row) => sum + row.bytes, 0));
        assert.equal(working.peakSwitch - working.steady, 10 * 1024 * 1024);
        for (const [name, bytes] of [['shared-ground-material-array', price.sharedGroundArrayBytes], ['original-cap-slot-flags', price.capSlotBytes]] as const) {
          assert.equal(targets.filter(row => row.name === name).length, 1); assert.equal(targets.find(row => row.name === name)!.bytes, bytes);
        }
        const supplementRows = targets.filter(row => ['shared-environment-supplements', 'metric-shared-facade-common'].includes(row.name));
        assert.equal(supplementRows.reduce((sum, row) => sum + row.bytes, 0), price.resourceBytes);
        if (!recipe.ultra.farShadow) assert.equal(ultraCostBreakdown(plan, recipe, null, prepared).frame.passes.some(p => p.name === 'far-shadow-build'), false);
      } finally { terrain.dispose(); }
    }
    const brickOnly = { ...plan, props: [], surround: { height: 0, surface: 'brick' as const },
      heightfield: { ...plan.heightfield, surfaces: ['brick' as const] } };
    assert.equal(sharedGroundArrayPrice(brickOnly), 0);
  } finally { prepared.dispose(); }
});

test('ordinary fresh and Ultra-cached grass prices separate resident capacity from identical ordinary work', () => {
  const plan = createSliceLevel(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  const grass = createEnvironmentVegetation(plan, prepared.grass);
  try {
    assert.ok(prepared.grass.clumps.length);
    const fresh = priceEnvironmentSupplements(prepared, 'ordinary', false, ordinaryTriangles);
    const actualFresh = grass.report(); grass.setDetail(true); grass.setDetail(false);
    const actualCached = grass.report();
    const cached = priceEnvironmentSupplements(prepared, 'ordinary', false, ordinaryTriangles, { ...ordinaryPolicy, grassUltraCached: true });
    assert.equal(cached.colourTriangles, fresh.colourTriangles); assert.equal(cached.colourDraws, fresh.colourDraws);
    assert.equal(cached.geometryBytes - fresh.geometryBytes, actualCached.geometryBytes - actualFresh.geometryBytes);
    assert.equal(cached.instanceBytes - fresh.instanceBytes, actualCached.instanceBytes - actualFresh.instanceBytes);
    assert.ok(cached.resourceBytes > fresh.resourceBytes);
  } finally { grass.dispose(); prepared.dispose(); }
});

test('ordinary replacement work is once per 1/2/4 pane and CPU prepared caches reject reuse after idempotent disposal', () => {
  const plan = fixture(), before = JSON.stringify(plan), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  const price = priceEnvironmentSupplements(prepared, 'ordinary', false, ordinaryTriangles);
  const without = presentationCost(plan, BASELINE_PRESENTATION), withSupplements = presentationCost(plan, BASELINE_PRESENTATION, null, prepared);
  for (const [mode, panes] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
    assert.equal(withSupplements.frame[mode].triangles - without.frame[mode].triangles,
      (price.colourTriangles + price.shadowTriangles) * panes);
    assert.equal(withSupplements.frame[mode].drawCalls - without.frame[mode].drawCalls,
      (price.colourDraws + price.shadowDraws) * panes);
  }
  prepared.dispose(); prepared.dispose(); assert.equal(prepared.disposed, true);
  assert.equal(prepared.metric.disposed, true); assert.equal(prepared.vegetationPrice.disposed, true); assert.equal(prepared.capSlots.disposed, true);
  assert.throws(() => prepared.vegetationPrice.families, /disposed/); assert.throws(() => prepared.capSlots.matrices, /disposed/);
  assert.throws(() => priceEnvironmentSupplements(prepared, 'ordinary', false, ordinaryTriangles), /owner/);
  assert.equal(JSON.stringify(plan), before);
});
