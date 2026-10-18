/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** 2026-10-17 audit §5 (perf item "memory"): the installed metric-facade view
 * releases `MetricFacadePlan.surfaces` once it has written them into its own
 * vertex buffers. Everything a GPU upload, a price, a report or a terrain
 * rebuild reads is compared with a never-released twin built from the same plan. */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { LANDMARK_SIZES } from '../data/buildingLooks.ts';
import { createTerrain } from './terrain.ts';
import { BASELINE_PRESENTATION, presentationCost } from './presentation.ts';
import { prepareEnvironmentSupplements, priceEnvironmentSupplements } from './environmentSupplementPrice.ts';
import { metricSourcePrice } from './metricFacadePreparation.ts';
import { metricFacadeCost, metricFacadeShadowCost, withoutEmittedSurfaces, type MetricFacadePlan } from './metricFacadePlan.ts';
import { createInstalledMetricFacade, createMetricFacade, type MetricFacade } from './metricFacade.ts';
import { createDistrictExteriorAppearance } from './districtExteriorAppearance.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ULTRA_FULL } from './ultra/ultraRecipe.ts';
import { ultraPartTriangles } from './ultra/ultraCost.ts';
import { ultraCasts } from './ultra/ultraKit.ts';

/** Two served residential bodies plus an unsupported landmark, as in metricFacadeIntegration.test.ts. */
function fixture(): LevelPlan {
  const props: Prop[] = [
    { kind:'building',look:'residential',position:{x:0,y:0,z:0},rotationY:0,scale:1,size:{x:42,y:7,z:12} },
    { kind:'building',look:'residential',position:{x:45,y:0,z:0},rotationY:0,scale:1,size:{x:42,y:7,z:12} },
    { kind:'building',look:'clockTower',position:{x:100,y:0,z:0},rotationY:0,scale:1,size:LANDMARK_SIZES.clockTower },
  ];
  return { id:'metric-release',props,solids:props.map(prop=>({centre:{...prop.position,y:prop.size!.y/2},
    halfExtents:{x:prop.size!.x/2,y:prop.size!.y/2,z:prop.size!.z/2},rotationY:prop.rotationY,surface:'pavement' as const})),
    segments:[],checkpoints:[],spawn:{position:{x:-60,y:0,z:-60},headingY:0},surround:{height:0,surface:'grass'},
    heightfield:{originX:0,originZ:0,spacing:1,columns:2,rows:2,heights:[0,0,0,0],surfaces:['grass']},
    districtAdjacency:{revision:'district-v1',sourceWorldId:'metric-release',physicalWorldId:'metric-release',
      frontages:[0,1].map(index=>({id:`existing-front-${index}`,propIndex:index,district:'residential',role:'frontage-lawn',
        streetSegmentId:'source-road',position:{x:props[index].position.x,y:0,z:6},yaw:0,width:42,reach:8,
        retainedOpening:false,patchIds:[]})),links:[],groups:[],rejected:[],addedTriangles:0,addedProps:0,addedSolids:0,addedSoftBodies:0} };
}
const triangles = (part: keyof typeof PART_COSTS): number => PART_COSTS[part].triangles;
const ultraTriangles = (part: keyof typeof PART_COSTS): number => ultraPartTriangles(part, ULTRA_FULL);
const ultraNearCasts = (part: keyof typeof PART_COSTS): boolean => ultraCasts(part, PART_COSTS[part].castsShadow, ULTRA_FULL.ultra);
const ultraPolicy = { nearCasts: ultraNearCasts, buildings: true, farShadow: true };

/** Everything an upload or a draw reads, per object, in traversal order. */
function groupDigest(group: THREE.Object3D): string {
  const hash = createHash('sha256');
  const bytes = (array: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }): Uint8Array =>
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  group.traverse((object) => {
    hash.update(`|${object.type}:${object.name}:${object.visible}:${object.castShadow}:${object.receiveShadow}:${object.layers.mask}`);
    hash.update(`:${object.position.toArray()}:${object.quaternion.toArray()}:${object.scale.toArray()}`);
    const mesh = object as THREE.Mesh;
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      hash.update(`|m:${material.type}:${material.name}:${material.customProgramCacheKey()}`);
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    hash.update(`|g:${geometry.drawRange.start}:${geometry.drawRange.count}:${JSON.stringify(geometry.groups)}`);
    for (const name of Object.keys(geometry.attributes).sort()) {
      const attribute = geometry.attributes[name] as THREE.BufferAttribute;
      hash.update(`|a:${name}:${attribute.itemSize}:${attribute.count}`); hash.update(bytes(attribute.array as Float32Array));
    }
    if (geometry.index) hash.update(bytes(geometry.index.array as Uint32Array));
    const instanced = object as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) {
      hash.update(`|i:${instanced.count}`); hash.update(bytes(instanced.instanceMatrix.array as Float32Array));
      if (instanced.instanceColor) hash.update(bytes(instanced.instanceColor.array as Float32Array));
    }
  });
  return hash.digest('hex');
}
function meshRecords(view: MetricFacade): unknown[] {
  return (view.group.children as THREE.Mesh[]).map(mesh => ({ name: mesh.name, castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow, layers: mesh.layers.mask, position: mesh.position.toArray(),
    material: mesh.material === undefined ? null : (mesh.material as THREE.Material).type,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) =>
      [name, createHash('sha256').update(new Uint8Array((attribute.array as Float32Array).buffer)).digest('hex')])) }));
}
/** A released twin and a never-released twin of the same prepared world. */
function twins(request: { propIndices: readonly number[] } = { propIndices: [0, 1] }) {
  const plan = fixture();
  return { plan, a: prepareEnvironmentSupplements(plan, null, request), b: prepareEnvironmentSupplements(plan, null, request),
    appearance: createDistrictExteriorAppearance() };
}

test('the installed view emits exactly what the legacy view emits, and only then releases the surfaces', () => {
  const { plan, a, b, appearance } = twins();
  const full = a.metric.descriptors!;
  assert.ok(full.surfaces.length > 0, 'positive control: the prepared plan carries surface records before installation');
  assert.equal(full.surfacesEmitted, undefined);
  const installed = createInstalledMetricFacade(plan, a.metric, appearance)!;
  const legacy = createMetricFacade(plan, b.metric.descriptors!, appearance);
  try {
    assert.ok(installed.group.children.length > 0);
    assert.deepEqual(meshRecords(installed), meshRecords(legacy));
    assert.equal(groupDigest(installed.group), groupDigest(legacy.group));
    // Release state: both holders now share one frozen slim plan.
    const slim = a.metric.descriptors!;
    assert.equal(slim.surfaces.length, 0); assert.equal(slim.surfacesEmitted, true);
    assert.ok(Object.isFrozen(slim)); assert.ok(Object.isFrozen(slim.surfaces));
    assert.equal(installed.descriptors, slim, 'the view and the prepared owner hold the same slim plan');
    assert.equal(withoutEmittedSurfaces(full), slim, 'memoised by the full plan');
    assert.equal(withoutEmittedSurfaces(slim), slim);
    for (const field of ['selectedPropIndices', 'replacements', 'faces', 'apertures', 'architecture', 'protectedOpenings',
      'batchMetres', 'chunkMetres'] as const) assert.equal(slim[field], full[field], `${field} is kept by reference`);
    assert.deepEqual(Object.keys(slim), [...Object.keys(full), 'surfacesEmitted'], 'only surfacesEmitted is added; key order kept');
    // The legacy entrance never touches its input plan; its view also keeps only the slim twin.
    assert.ok(b.metric.descriptors!.surfaces.length > 0);
    assert.equal(legacy.descriptors.surfaces.length, 0);
    assert.equal(legacy.descriptors, withoutEmittedSurfaces(b.metric.descriptors!));
  } finally { installed.dispose(); legacy.dispose(); appearance.dispose(); a.dispose(); b.dispose(); }
});

test('prices, reports and the presentation cost are invariant under the release', () => {
  const { plan, a, b, appearance } = twins();
  const installed = createInstalledMetricFacade(plan, a.metric, appearance)!;
  const legacy = createMetricFacade(plan, b.metric.descriptors!, appearance);
  try {
    assert.equal(a.metric.descriptors!.surfacesEmitted, true);
    assert.deepEqual(a.metric.price, b.metric.price);
    assert.ok(a.metric.price!.drawCalls > 0);
    assert.deepEqual(metricSourcePrice(a.metric, false, triangles), metricSourcePrice(b.metric, false, triangles));
    assert.deepEqual(metricSourcePrice(a.metric, true, ultraTriangles, ultraNearCasts),
      metricSourcePrice(b.metric, true, ultraTriangles, ultraNearCasts));
    assert.deepEqual(priceEnvironmentSupplements(a, 'ordinary', false, triangles), priceEnvironmentSupplements(b, 'ordinary', false, triangles));
    assert.deepEqual(priceEnvironmentSupplements(a, 'ultra', true, ultraTriangles, ultraPolicy),
      priceEnvironmentSupplements(b, 'ultra', true, ultraTriangles, ultraPolicy));
    assert.deepEqual(presentationCost(plan, BASELINE_PRESENTATION, null, a), presentationCost(plan, BASELINE_PRESENTATION, null, b));
    assert.deepEqual(installed.report(), legacy.report());
  } finally { installed.dispose(); legacy.dispose(); appearance.dispose(); a.dispose(); b.dispose(); }
});

test('ordinary and Ultra terrain rebuilds after the release match a never-released world', () => {
  const { plan, a, b, appearance } = twins();
  const installed = createInstalledMetricFacade(plan, a.metric, appearance)!;
  try {
    assert.equal(a.metric.descriptors!.surfacesEmitted, true);
    const ordinaryA = createTerrain(plan, BASELINE_PRESENTATION, undefined, { sharedSurface: true, environmentSupplements: a });
    const ordinaryB = createTerrain(plan, BASELINE_PRESENTATION, undefined, { sharedSurface: true, environmentSupplements: b });
    try {
      assert.equal(ordinaryA.triangles, ordinaryB.triangles);
      assert.deepEqual(ordinaryA.metricSource, ordinaryB.metricSource);
      assert.ok(ordinaryA.metricSource!.removedColourPieces > 0, 'the release keeps the extraction ledger working');
      assert.equal(groupDigest(ordinaryA.group), groupDigest(ordinaryB.group));
    } finally { ordinaryA.dispose(); ordinaryB.dispose(); }
    const context = () => ({ recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 });
    const ultraA = createTerrain(plan, ULTRA_FULL, context(), { sharedSurface: true, environmentSupplements: a });
    const ultraB = createTerrain(plan, ULTRA_FULL, context(), { sharedSurface: true, environmentSupplements: b });
    try {
      assert.equal(ultraA.triangles, ultraB.triangles);
      assert.deepEqual(ultraA.metricSource, ultraB.metricSource);
      assert.equal(groupDigest(ultraA.group), groupDigest(ultraB.group));
    } finally { ultraA.dispose(); ultraB.dispose(); }
  } finally { installed.dispose(); appearance.dispose(); a.dispose(); b.dispose(); }
});

test('negative controls: released surfaces are refused, a failed build releases nothing, disposal is unchanged', () => {
  const { plan, a, appearance } = twins();
  const full: MetricFacadePlan = a.metric.descriptors!;
  // A failed installation releases nothing.
  const translucent = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true });
  const broken = { ...appearance, materials: Object.fromEntries(Object.keys(appearance.materials)
    .map(finish => [finish, translucent])) as unknown as typeof appearance.materials };
  assert.throws(() => createInstalledMetricFacade(plan, a.metric, broken), /opaque unmapped/);
  assert.equal(a.metric.descriptors, full, 'a throwing build leaves the prepared plan untouched');
  assert.ok(full.surfaces.length > 0);
  translucent.dispose();
  const view = createInstalledMetricFacade(plan, a.metric, appearance)!;
  const slim = a.metric.descriptors!;
  try {
    assert.throws(() => metricFacadeCost(slim), /released after emission/);
    assert.throws(() => metricFacadeShadowCost(slim), /released after emission/);
    assert.throws(() => createMetricFacade(plan, slim, appearance), /released after emission/);
    assert.throws(() => createInstalledMetricFacade(plan, a.metric, appearance), /released after emission/);
    a.metric.releaseEmittedSurfaces(); a.metric.releaseEmittedSurfaces();
    assert.equal(a.metric.descriptors, slim, 'idempotent');
  } finally { view.dispose(); }
  assert.throws(() => view.descriptors, /Disposed metric facade/);
  a.metric.dispose();
  assert.throws(() => a.metric.descriptors, /Disposed metric/);
  assert.throws(() => a.metric.releaseEmittedSurfaces(), /Disposed metric/);
  a.dispose();
  // No selection: no view, no price, and nothing to release.
  const off = prepareEnvironmentSupplements(plan, null, { propIndices: [] });
  try {
    assert.equal(createInstalledMetricFacade(plan, off.metric, appearance), null);
    assert.equal(off.metric.price, null); assert.equal(off.metric.descriptors, null);
  } finally { off.dispose(); appearance.dispose(); }
});

test('the renderer installs the facade through the releasing entrance only', () => {
  const source = readFileSync(new URL('./Renderer.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('createInstalledMetricFacade(plan, supplements.metric'), 'levelBuildSteps installs through the releasing entrance');
  assert.ok(!source.includes('createMetricFacade('), 'no unreleased facade view is built by the renderer');
  assert.ok(!/supplements\.metric\.descriptors/.test(source), 'no renderer local holds the full plan across a slice');
});
