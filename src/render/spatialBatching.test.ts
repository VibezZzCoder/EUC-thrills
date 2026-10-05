/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as THREE from 'three';
import { PART_COSTS, type PropPartId } from '../data/renderCost.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { planRenderCost } from '../level/renderBudget.ts';
import { createProps } from './props.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, presentationCost } from './presentation.ts';
import { headlessUltraContext } from './renderCost.ts';
import { createDistrictExterior, type DistrictExteriorAppearance } from './districtExterior.ts';
import type { DistrictExteriorSite } from './districtExteriorSites.ts';
import { prepareEnvironmentSupplements, priceEnvironmentSpatialBatching, priceEnvironmentSupplements,
  withSpatialBatchingSupplementPrice } from './environmentSupplementPrice.ts';
import { isUltraRecipe, ULTRA_FULL, ULTRA_LIT, ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { ultraCasts } from './ultra/ultraKit.ts';
import { EMPTY_SPATIAL_BATCHING_DELTA, priceGenericPropSpatialBatching, spatialCellKey,
  sumSpatialBatchingDeltas, validateSpatialBatchMetres, withSpatialBatchingCost } from './spatialBatching.ts';

function fixture(): LevelPlan {
  const props: Prop[] = [];
  for (const [index, kind] of (['lampPost', 'bench', 'litterBin', 'bollardCap', 'signpost',
    'fenceBay', 'tyreStack', 'gantrySpan'] as const).entries()) for (const x of [-64, 0, 256]) {
    props.push({ kind, position: { x, y: index * .03, z: index * 3 }, rotationY: index * .17, scale: 1 + index * .02 });
  }
  // Original cap/proxy/roof owners must retain their world names and attributes.
  props.push(...[0, 11].map(x => ({ kind: 'building' as const, position: { x, y: 0, z: 50 },
    rotationY: 0, scale: 1, look: 'residential' as const, size: { x: 10, y: 8, z: 10 } })));
  return { id: 'spatial-generic-control', props, segments: [], checkpoints: [],
    routeSigns: [
      { feature: 'spatial-sign-tech', propIndex: 13, rotationY: .3, upper: { word: 'TECH', side: -1 }, lower: { word: 'SAFE', side: 1 },
        approach: { x: 0, z: 0, headingY: 0 }, approachDistance: 8, commitDistance: 2, technicalT: 1, safeT: -1 },
      { feature: 'spatial-sign-air', propIndex: 14, rotationY: .4, upper: { word: 'AIR', side: -1 }, lower: { word: 'SAFE', side: 1 },
        approach: { x: 256, z: 0, headingY: 0 }, approachDistance: 8, commitDistance: 2, technicalT: 1, safeT: -1 },
    ],
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2,
      heights: [0, 0, 0, 0], surfaces: ['grass'] } };
}

function geometryDigest(geometry: THREE.BufferGeometry): string {
  const hash = createHash('sha256');
  for (const [name, attribute] of Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${name}/${attribute.itemSize}/${attribute.normalized}/${attribute.array.constructor.name}`);
    hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
  return hash.digest('hex');
}

function canonicalName(name: string): string {
  return name.startsWith('district-exterior/') ? name.replace(/\/[^/]+$/, '/world') : name.replace(/-cell-.+$/, '');
}
/** Compare complete instance records independently of their batching/order. */
function instanceCensus(root: THREE.Group): [string, string[]][] {
  const result = new Map<string, string[]>(), matrix = new THREE.Matrix4();
  for (const mesh of root.children as THREE.InstancedMesh[]) {
    const name = canonicalName(mesh.name), records = result.get(name) ?? [];
    const material = mesh.material as THREE.MeshStandardMaterial;
    const geometry = geometryDigest(mesh.geometry);
    for (let index = 0; index < mesh.instanceMatrix.count; index++) {
      mesh.getMatrixAt(index, matrix);
      records.push(JSON.stringify({ matrix: matrix.elements, colour: mesh.instanceColor
        ? [mesh.instanceColor.getX(index), mesh.instanceColor.getY(index), mesh.instanceColor.getZ(index)] : null,
      geometry, cast: mesh.castShadow, receive: mesh.receiveShadow, layers: mesh.layers.mask,
      roughness: material.roughness, metalness: material.metalness, program: material.customProgramCacheKey() }));
    }
    result.set(name, records);
  }
  return [...result].map(([name, records]): [string, string[]] => [name, records.sort()]).sort(([a], [b]) => a.localeCompare(b));
}

function resources(root: THREE.Group): { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>;
  geometryBytes: number; instanceBytes: number } {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let instanceBytes = 0;
  for (const mesh of root.children as THREE.InstancedMesh[]) {
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    instanceBytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
  }
  const geometryBytes = [...geometries].reduce((sum, geometry) => sum
    + Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0), 0);
  return { geometries, materials, geometryBytes, instanceBytes };
}

test('spatial keys cover negative/boundary cells and historical Infinity; invalid pitches refuse', () => {
  for (const pitch of [64, Infinity]) assert.doesNotThrow(() => validateSpatialBatchMetres(pitch));
  for (const pitch of [0, -64, NaN, -Infinity]) assert.throws(() => validateSpatialBatchMetres(pitch), /positive/);
  assert.equal(spatialCellKey(-.01, 64, 64), '-1,1');
  assert.equal(spatialCellKey(64, -.01, 64), '1,-1');
  assert.equal(spatialCellKey(1000, -1000, Infinity), 'world');
});

test('generic partitions retain every matrix/colour/shape/appearance/caster and share original GPU owners across recipes', () => {
  const plan = fixture(), source = JSON.stringify(plan), sourceCost = planRenderCost(plan);
  for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION, ULTRA_LIT, ULTRA_FULL]) {
    const context = isUltraRecipe(recipe) ? headlessUltraContext(recipe) : undefined;
    const legacy = createProps(plan, recipe, context), spatial = createProps(plan, recipe, context, { spatialBatchMetres: 64 });
    try {
      assert.deepEqual(instanceCensus(spatial.group), instanceCensus(legacy.group));
      assert.equal(spatial.triangles, legacy.triangles); assert.equal(spatial.shadowTriangles, legacy.shadowTriangles);
      assert.equal(spatial.instances, legacy.instances); assert.equal(spatial.textures, legacy.textures); assert.equal(spatial.bytes, legacy.bytes);
      assert.deepEqual(legacy.spatialBatching, EMPTY_SPATIAL_BATCHING_DELTA);
      const casts = (part: PropPartId) => isUltraRecipe(recipe)
        ? ultraCasts(part, PART_COSTS[part].castsShadow, recipe.ultra) : PART_COSTS[part].castsShadow;
      const price = priceGenericPropSpatialBatching(plan, 64, casts, isUltraRecipe(recipe) && recipe.ultra.farShadow);
      assert.equal(spatial.drawCalls - legacy.drawCalls, price.colourDrawDelta);
      assert.equal(spatial.shadowDrawCalls - legacy.shadowDrawCalls, price.shadowDrawDelta);
      assert.deepEqual(spatial.spatialBatching, price);
      assert.ok(price.colourDrawDelta > 0 && price.shadowDrawDelta > 0);
      const before = resources(legacy.group), after = resources(spatial.group);
      assert.equal(after.geometries.size, before.geometries.size); assert.equal(after.materials.size, before.materials.size);
      assert.equal(after.geometryBytes, before.geometryBytes); assert.equal(after.instanceBytes, before.instanceBytes);
      const benches = spatial.group.children.filter(mesh => mesh.name.startsWith('level-props-benchWood-cell-')) as THREE.InstancedMesh[];
      assert.equal(benches.length, 3);
      assert.ok(benches.every(mesh => mesh.geometry === benches[0].geometry && mesh.material === benches[0].material));
      assert.deepEqual(spatial.group.children.filter(mesh => /building|roofGable/.test(mesh.name)).map(mesh => mesh.name),
        legacy.group.children.filter(mesh => /building|roofGable/.test(mesh.name)).map(mesh => mesh.name));
      if (isUltraRecipe(recipe)) assert.ok(benches.every(mesh => mesh.layers.isEnabled(ULTRA_STATIC_LAYER)));
      let released = 0;
      const owners: (THREE.InstancedMesh | THREE.BufferGeometry | THREE.Material)[] = [
        ...spatial.group.children as THREE.InstancedMesh[], ...after.geometries, ...after.materials];
      for (const owner of owners) {
        const dispose = () => { released++; };
        if (owner instanceof THREE.InstancedMesh) owner.addEventListener('dispose', dispose);
        else if (owner instanceof THREE.BufferGeometry) owner.addEventListener('dispose', dispose);
        else owner.addEventListener('dispose', dispose);
      }
      spatial.dispose(); spatial.dispose(); assert.equal(released, owners.length);
    } finally { legacy.dispose(); spatial.dispose(); }
  }
  assert.equal(JSON.stringify(plan), source); assert.deepEqual(planRenderCost(plan), sourceCost);
});

test('native camera/light frusta can reject a remote generic cell while retaining the nearby original part', () => {
  const base = fixture(), plan = { ...base, routeSigns: [], props: [0, 256].map(x => ({ kind: 'bench' as const,
    position: { x, y: 0, z: 0 }, rotationY: 0, scale: 1 })) };
  const legacy = createProps(plan), spatial = createProps(plan, undefined, undefined, { spatialBatchMetres: 64 });
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 500);
  camera.position.set(0, 2, 15); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const colour = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const light = new THREE.OrthographicCamera(-18, 18, 18, -18, .1, 100);
  light.position.set(0, 30, 0); light.lookAt(0, 0, 0); light.updateMatrixWorld();
  const shadow = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(light.projectionMatrix, light.matrixWorldInverse));
  try {
    legacy.group.updateMatrixWorld(true); spatial.group.updateMatrixWorld(true);
    const world = legacy.group.children.find(mesh => mesh.name === 'level-props-benchWood') as THREE.InstancedMesh;
    const near = spatial.group.children.find(mesh => mesh.name === 'level-props-benchWood-cell-0,0') as THREE.InstancedMesh;
    const far = spatial.group.children.find(mesh => mesh.name === 'level-props-benchWood-cell-4,0') as THREE.InstancedMesh;
    assert.ok(colour.intersectsObject(world)); assert.ok(colour.intersectsObject(near)); assert.equal(colour.intersectsObject(far), false);
    assert.ok(shadow.intersectsObject(near)); assert.equal(shadow.intersectsObject(far), false);
    const local = far.boundingSphere!; far.boundingSphere = world.boundingSphere!.clone();
    assert.equal(colour.intersectsObject(far), true, 'negative control: world bounds defeat remote-cell rejection');
    far.boundingSphere = local;
  } finally { legacy.dispose(); spatial.dispose(); }
});

test('trunks partition while existing foliage buckets and geometry owners stay unchanged', () => {
  const plan: LevelPlan = { ...fixture(), routeSigns: [], props: [-64, 0, 256].map(x => ({
    kind: 'broadleafTree', position: { x, y: 0, z: 0 }, rotationY: .2, scale: 1 })) };
  const legacy = createProps(plan, BASELINE_PRESENTATION), spatial = createProps(plan, BASELINE_PRESENTATION, undefined, { spatialBatchMetres: 64 });
  try {
    assert.deepEqual(instanceCensus(spatial.group), instanceCensus(legacy.group));
    const foliage = (root: THREE.Group) => root.children.filter(mesh => mesh.name.startsWith('level-props-crown')).map(mesh => mesh.name);
    assert.deepEqual(foliage(spatial.group), foliage(legacy.group));
    assert.equal(spatial.group.children.filter(mesh => mesh.name.startsWith('level-props-trunk-cell-')).length, 3);
    const before = resources(legacy.group), after = resources(spatial.group);
    assert.equal(after.geometryBytes, before.geometryBytes); assert.equal(after.materials.size, before.materials.size);
    assert.equal(after.instanceBytes, before.instanceBytes);
  } finally { legacy.dispose(); spatial.dispose(); }
});

test('boundary-crossing generic pieces retain source-pivot cells and their complete transformed bounds', () => {
  const plan: LevelPlan = { ...fixture(), routeSigns: [], props: [63.99, 64.01].map(x => ({
    kind: 'bench', position: { x, y: 0, z: 0 }, rotationY: Math.PI / 4, scale: 2 })) };
  const spatial = createProps(plan, BASELINE_PRESENTATION, undefined, { spatialBatchMetres: 64 });
  try {
    const price = priceGenericPropSpatialBatching(plan, 64, part => PART_COSTS[part].castsShadow);
    assert.equal(spatial.drawCalls, price.colourDraws); assert.equal(spatial.shadowDrawCalls, price.shadowDraws);
    assert.deepEqual(spatial.group.children.map(mesh => mesh.name).sort(), [
      'level-props-benchMetal-cell-0,0', 'level-props-benchMetal-cell-1,0',
      'level-props-benchWood-cell-0,0', 'level-props-benchWood-cell-1,0',
    ]);
    const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
    let crossesBoundary = false;
    for (const mesh of spatial.group.children as THREE.InstancedMesh[]) {
      mesh.getMatrixAt(0, matrix); const positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
        assert.ok(point.distanceTo(mesh.boundingSphere!.center) <= mesh.boundingSphere!.radius + 1e-6);
        if (mesh.name.endsWith('-0,0') && point.x > 64) crossesBoundary = true;
      }
    }
    assert.ok(crossesBoundary, 'negative control: assigning the cell must not clip a straddling shape at its boundary');
  } finally { spatial.dispose(); }
});

function exteriorFixture(): DistrictExteriorSite[] {
  return [0, 256].map((x, index): DistrictExteriorSite => ({ id: `spatial-exterior-${index}`, propIndex: index,
    building: { kind: 'building', position: { x, y: 0, z: 0 }, rotationY: 0, scale: 1, size: { x: 10, y: 8, z: 10 } },
    body: { centre: { x, y: 4, z: 0 }, halfExtents: { x: 5, y: 4, z: 5 }, rotationY: 0, surface: 'pavement' },
    look: undefined, parcels: [], parts: [
      { shape: 'box', kind: 'base-panel', finish: 'masonry', position: { x, y: 1, z: 5 }, size: { x: 8, y: 2, z: .1 }, yaw: .2, rich: false },
      { shape: 'box', kind: 'pier', finish: 'frame', position: { x: x + 1, y: 2, z: 5 }, size: { x: .1, y: 4, z: .1 }, yaw: .2, rich: true },
      { shape: 'beam', kind: 'roof-edge', finish: 'roofEdge', from: { x: x + 63, y: 8, z: 0 }, to: { x: x + 66, y: 8, z: 0 }, thickness: .1, rich: false },
      { shape: 'cover', kind: 'ground-cover', finish: 'planting', position: { x, y: 0, z: 8 }, normal: { x: 0, y: 1, z: 0 }, radius: .5, height: .15, yaw: .2, rich: false },
    ] }));
}

test('exterior spatial/rich draws match independent source prices with unchanged parts, buffers and borrowed appearances', () => {
  const plan = fixture(), prepared = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  const sites = exteriorFixture(), priced = { ...prepared, exterior: sites };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const supplied: DistrictExteriorAppearance = { materials: {
    masonry: material, frame: material, roofEdge: material, planting: material, entry: material, glazing: material },
    colourFor: () => [.3, .4, .5] };
  const legacy = createDistrictExterior(plan, supplied, sites), spatial = createDistrictExterior(plan, { ...supplied, spatialBatchMetres: 64 }, sites);
  let materialDisposals = 0; material.addEventListener('dispose', () => { materialDisposals++; });
  try {
    assert.deepEqual(instanceCensus(spatial.group), instanceCensus(legacy.group));
    const before = resources(legacy.group), after = resources(spatial.group);
    assert.equal(after.geometryBytes, before.geometryBytes); assert.equal(after.instanceBytes, before.instanceBytes);
    assert.equal(after.geometries.size, before.geometries.size); assert.equal(after.materials.size, before.materials.size);
    for (const rich of [false, true, false]) {
      legacy.setDetail(rich); spatial.setDetail(rich);
      const report = spatial.report(), original = legacy.report();
      const generic = priceGenericPropSpatialBatching(plan, 64, part => PART_COSTS[part].castsShadow);
      const delta = priceEnvironmentSpatialBatching(priced, 64, rich);
      assert.equal(report.colourTriangles, original.colourTriangles);
      assert.equal(delta.colourDrawDelta, generic.colourDrawDelta + report.drawCalls - original.drawCalls);
      assert.equal(report.spatialBatching.colourDrawDelta, report.drawCalls - original.drawCalls);
      const oldPrice = priceEnvironmentSupplements(priced, 'ordinary', rich, part => PART_COSTS[part].triangles);
      const nextPrice = withSpatialBatchingSupplementPrice(oldPrice, delta);
      assert.equal(nextPrice.colourDraws - oldPrice.colourDraws, delta.colourDrawDelta);
      assert.equal(nextPrice.shadowDraws - oldPrice.shadowDraws, delta.shadowDrawDelta);
      assert.equal(nextPrice.resourceBytes, oldPrice.resourceBytes);
      assert.equal(nextPrice.colourTriangles, oldPrice.colourTriangles); assert.equal(nextPrice.shadowTriangles, oldPrice.shadowTriangles);
    }
    const beam = spatial.group.children.find(mesh => mesh.name.endsWith('/0,0') && mesh.name.includes('/roofEdge/')) as THREE.InstancedMesh;
    const point = new THREE.Vector3(), matrix = new THREE.Matrix4(); beam.getMatrixAt(0, matrix);
    point.set(0, .5, 0).applyMatrix4(matrix);
    assert.ok(beam.boundingSphere!.containsPoint(point), 'straddling beam is bounded by its full transformed volume');
    spatial.dispose(); spatial.dispose(); assert.equal(materialDisposals, 0);
    assert.deepEqual(spatial.report().spatialBatching, EMPTY_SPATIAL_BATCHING_DELTA);
  } finally { legacy.dispose(); spatial.dispose(); material.dispose(); prepared.dispose(); }
});

test('combined potential overlays count each pane and keep static far work outside recurring frames', () => {
  const plan = fixture(), cost = presentationCost(plan, BASELINE_PRESENTATION);
  const generic = priceGenericPropSpatialBatching(plan, 64, part => PART_COSTS[part].castsShadow, true);
  const delta = sumSpatialBatchingDeltas(generic, { colourDrawDelta: 3, shadowDrawDelta: 2, farShadowDrawDelta: 2, propDrawDelta: 0 });
  const updated = withSpatialBatchingCost(cost, delta), recurring = delta.colourDrawDelta + delta.shadowDrawDelta;
  assert.equal(updated.drawCalls - cost.drawCalls, recurring); assert.equal(updated.propDrawCalls - cost.propDrawCalls, generic.propDrawDelta);
  for (const [shape, panes] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
    assert.equal(updated.frame[shape].drawCalls - cost.frame[shape].drawCalls, recurring * panes);
    assert.equal(updated.frame[shape].triangles, cost.frame[shape].triangles);
  }
  assert.ok(delta.farShadowDrawDelta > 0);
  assert.notEqual(updated.drawCalls - cost.drawCalls, recurring + delta.farShadowDrawDelta,
    'negative control: activation-only far draws must not enter recurring frames');
  assert.equal(updated.triangles, cost.triangles); assert.equal(updated.recipe, cost.recipe);
  assert.equal(withSpatialBatchingCost(cost, EMPTY_SPATIAL_BATCHING_DELTA), cost);
});
