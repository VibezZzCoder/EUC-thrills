/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { planDigest } from '../level/planDigest.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { ENVIRONMENT_VEGETATION, VEGETATION_COUCH_DETAIL, VEGETATION_TIER_DETAIL } from '../data/tuning.ts';
import { buildConiferDistanceForms, CONIFER_DISTANCE_COUNTS } from './vegetationForms.ts';
import { SHARED_VEGETATION_CONTRACTS, ordinaryVegetationBuilders, ultraVegetationBuilders } from './sharedVegetation.ts';
import { toneSharedVegetation } from './ultra/ultraFoliage.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ULTRA_FULL } from './ultra/ultraRecipe.ts';
import { ENHANCED_PRESENTATION } from './presentation.ts';
import { createProps } from './props.ts';
import { measureObject } from './renderCost.ts';
import { measuredPropColourTriangles } from './ultra/ultraRuntime.ts';
import { coniferDistanceLevel, installConiferDistanceCell, packConiferDistanceForms,
  potentialGeometryTriangles, vegetationDetailFor, vegetationDistanceRanges, type VegetationDistanceRules } from './vegetationDistance.ts';
import { installGrassDistanceCell } from './grassDistance.ts';

function closedOutward(position: THREE.BufferAttribute): boolean {
  const edges = new Map<string, number>();
  const key = (i: number): string => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  let volumeSix = 0;
  for (let i = 0; i < position.count; i += 3) {
    const a = key(i), b = key(i + 1), c = key(i + 2);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const edge = `${from}|${to}`; edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    const ax = position.getX(i), ay = position.getY(i), az = position.getZ(i);
    const bx = position.getX(i + 1), by = position.getY(i + 1), bz = position.getZ(i + 1);
    const cx = position.getX(i + 2), cy = position.getY(i + 2), cz = position.getZ(i + 2);
    volumeSix += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volumeSix > 0 && [...edges].every(([edge, count]) => count === 1
    && edges.get(edge.split('|').reverse().join('|')) === 1);
}

for (const detail of ['ordinary', 'ultra'] as const) {
  test(`${detail}: exact near attributes and bounded closed distance levels for every habit`, () => {
    for (const variant of [0, 1, 2] as const) {
      const source = detail === 'ultra' ? ultraVegetationBuilders(toneSharedVegetation, variant).coniferFoliage()
        : ordinaryVegetationBuilders(variant).coniferFoliage();
      const paint = detail === 'ultra' ? toneSharedVegetation : undefined;
      // An unpainted near comparison exercises the neutral builder too; the
      // packed factory below compares the finished ordinary/Ultra attributes.
      const forms = buildConiferDistanceForms(detail, variant, SHARED_VEGETATION_CONTRACTS.coniferFoliage, paint);
      const packed = detail === 'ultra' ? ultraVegetationBuilders(toneSharedVegetation, variant, true).coniferFoliage()
        : ordinaryVegetationBuilders(variant, true).coniferFoliage();
      try {
        const ranges = vegetationDistanceRanges(packed)!;
        assert.equal(packed.groups.length, 0); assert.ok(packed.index);
        // 2026-10-04: R27's accepted counts (kept by R32) give Ultra 25,200
        // near triangles = 75,600 corners, past Uint16's 65,536; ordinary's
        // 38,400 still fit. The index must be the narrowest word that
        // addresses every corner, and every value must stay in range (a
        // Uint16 here would wrap and draw the wrong corners).
        const corners = packed.getAttribute('position').count;
        assert.equal(corners, CONIFER_DISTANCE_COUNTS[detail].near * 3);
        const indices = Array.from(packed.index.array as ArrayLike<number>);
        if (corners <= 0x1_0000) assert.ok(packed.index.array instanceof Uint16Array, 'Conifer near corners fit Uint16');
        else {
          assert.ok(packed.index.array instanceof Uint32Array, 'Conifer near corners exceed Uint16 and need Uint32');
          assert.ok(indices.some(index => index > 0xffff), 'Uint32 storage is genuinely needed');
        }
        assert.ok(indices.every(index => index < corners), 'every index addresses an allocated corner');
        for (const attribute of ['position', 'normal', 'color']) {
          const original = source.getAttribute(attribute).array;
          assert.deepEqual(packed.getAttribute(attribute).array.slice(0, original.length), original,
            `${attribute}: accepted near template changed`);
        }
        for (const level of ['near', 'middle', 'far'] as const) {
          const geometry = forms[level], position = geometry.getAttribute('position') as THREE.BufferAttribute;
          assert.equal(position.count / 3, CONIFER_DISTANCE_COUNTS[detail][level]);
          assert.equal(ranges[level].triangles, CONIFER_DISTANCE_COUNTS[detail][level]);
          assert.equal(closedOutward(position), true, `${level}: open/reversed component`);
          const contract = SHARED_VEGETATION_CONTRACTS.coniferFoliage;
          for (let i = 0; i < position.count; i++) {
            const p = [position.getX(i), position.getY(i), position.getZ(i)];
            assert.ok(p.every((value, axis) => value >= contract.min[axis] - 1e-6 && value <= contract.max[axis] + 1e-6));
            assert.ok(Math.hypot(p[0], p[2]) <= contract.spreadRadius + 1e-6);
          }
          // The independent predicate must catch a single known-bad flipped face.
          const bad = position.clone();
          for (let axis = 0; axis < 3; axis++) {
            const held = bad.array[3 + axis]; bad.array[3 + axis] = bad.array[6 + axis]; bad.array[6 + axis] = held;
          }
          assert.equal(closedOutward(bad), false);
        }
        assert.equal(ranges.geometryBytes, Object.values(packed.attributes)
          .reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + packed.index!.array.byteLength);
        assert.equal(ranges.near.start, 0);
        assert.equal(ranges.middle.start, ranges.near.count);
        assert.equal(ranges.far.start, ranges.near.count + ranges.middle.count);
        assert.equal(potentialGeometryTriangles(packed), ranges.near.triangles);
        assert.ok(packed.index!.count / 3 > potentialGeometryTriangles(packed),
          'known-bad all-index allocation bill must differ from one submitted range');
      } finally {
        source.dispose(); packed.dispose(); forms.near.dispose(); forms.middle.dispose(); forms.far.dispose();
      }
    }
  });
}

test('world distance retains close detail, narrows lens conservatively and never discards a tree', () => {
  const rules = ENVIRONMENT_VEGETATION;
  assert.equal(coniferDistanceLevel(0, 55), 'near');
  assert.equal(coniferDistanceLevel(rules.treeDetailStartMetres, 55), 'near');
  assert.equal(coniferDistanceLevel(rules.treeDetailStartMetres + 0.01, 55), 'middle');
  assert.equal(coniferDistanceLevel(rules.treeFarStartMetres + 0.01, 55), 'far');
  assert.equal(coniferDistanceLevel(80, 25), 'near');
  assert.equal(coniferDistanceLevel(50, 100), 'near', 'wide split-view lenses cannot pull near toward player');
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(coniferDistanceLevel(invalid, 55), 'near');
  assert.equal(coniferDistanceLevel(500, 0), 'near');
});

test('opposite panes, shared-cell draws and both shadow paths select independently with unchanged instance buffers', () => {
  const geometry = ultraVegetationBuilders(toneSharedVegetation, 0, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const one = new THREE.InstancedMesh(geometry, material, 2), two = new THREE.InstancedMesh(geometry, material, 1);
  const matrix = new THREE.Matrix4();
  one.setMatrixAt(0, matrix.makeTranslation(0, 0, 0)); one.setMatrixAt(1, matrix.makeTranslation(12, 0, 0));
  two.setMatrixAt(0, matrix.makeTranslation(0, 0, 0));
  one.computeBoundingSphere(); two.computeBoundingSphere(); one.updateMatrixWorld(); two.updateMatrixWorld();
  const releaseOne = installConiferDistanceCell(one), releaseTwo = installConiferDistanceCell(two);
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene();
  const noGroup = null as unknown as THREE.Group;
  const near = new THREE.PerspectiveCamera(55, 1, .1, 1000), far = new THREE.PerspectiveCamera(55, 1, .1, 1000);
  near.position.set(0, 4, 14); far.position.set(0, 4, 800); near.updateMatrixWorld(); far.updateMatrixWorld();
  const staticFar = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, .1, 3000);
  staticFar.position.set(0, 300, 800); staticFar.updateMatrixWorld();
  const ranges = vegetationDistanceRanges(geometry)!;
  const oneArray = one.instanceMatrix.array, twoArray = two.instanceMatrix.array;
  const versions = [one.instanceMatrix.version, two.instanceMatrix.version];
  try {
    for (let repetition = 0; repetition < 100; repetition++) {
      one.onBeforeRender(renderer, scene, far, geometry, material, noGroup);
      assert.deepEqual(geometry.drawRange, { start: ranges.far.start, count: ranges.far.count });
      one.onAfterRender(renderer, scene, far, geometry, material, noGroup);
      // Cell two can be absent from the first pane's frustum. Its next near
      // draw must choose afresh, not reuse cell one's last far camera.
      two.onBeforeRender(renderer, scene, near, geometry, material, noGroup);
      assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
      two.onAfterRender(renderer, scene, near, geometry, material, noGroup);
      // Inject stale far state: without the shadow hook this exact predicate
      // fails. Both near shadows and manual orthographic far renders repair it.
      geometry.setDrawRange(ranges.far.start, ranges.far.count);
      assert.notEqual(geometry.drawRange.count, ranges.near.count, 'known-bad stale range was not armed');
      one.onBeforeShadow(renderer, scene, far, staticFar, geometry, material, noGroup);
      assert.equal(geometry.drawRange.count, ranges.near.count);
      one.onAfterShadow(renderer, scene, far, staticFar, geometry, material, noGroup);
      geometry.setDrawRange(ranges.far.start, ranges.far.count);
      one.onBeforeRender(renderer, scene, staticFar, geometry, material, noGroup);
      assert.equal(geometry.drawRange.count, ranges.near.count);
      one.onAfterRender(renderer, scene, staticFar, geometry, material, noGroup);
    }
    assert.equal(one.instanceMatrix.array, oneArray); assert.equal(two.instanceMatrix.array, twoArray);
    assert.deepEqual([one.instanceMatrix.version, two.instanceMatrix.version], versions);
    assert.equal(one.geometry, geometry); assert.equal(two.geometry, geometry);
    assert.equal(potentialGeometryTriangles(geometry), ranges.near.triangles);
    const originalHook = THREE.Object3D.prototype.onBeforeRender;
    releaseOne(); releaseOne(); releaseTwo();
    assert.equal(one.onBeforeRender, originalHook); assert.equal(two.onBeforeRender, originalHook);
    assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
  } finally { releaseOne(); releaseTwo(); one.dispose(); two.dispose(); geometry.dispose(); material.dispose(); }
});

test('packing failure releases all temporary templates and its failed destination', () => {
  const forms = buildConiferDistanceForms('ordinary', 0, SHARED_VEGETATION_CONTRACTS.coniferFoliage);
  let released = 0;
  for (const geometry of Object.values(forms)) geometry.addEventListener('dispose', () => released++);
  forms.far.deleteAttribute('normal');
  const original = THREE.BufferGeometry.prototype.dispose;
  let allReleases = 0;
  THREE.BufferGeometry.prototype.dispose = function (): void { allReleases++; original.call(this); };
  try {
    assert.throws(() => packConiferDistanceForms(forms), /attribute shape drift/);
    assert.equal(released, 3); assert.equal(allReleases, 4);
  } finally { THREE.BufferGeometry.prototype.dispose = original; }
});

test('built ordinary/Ultra views price near potential, complete packed bytes and one idempotent owner set', () => {
  const source = createSliceLevel();
  const plan = { ...source, props: Array.from({ length: 30 }, (_, i) => ({ kind: 'conifer' as const,
    position: { x: i * 16, y: 0, z: 0 }, scale: 1, rotationY: i * .37 })) };
  const digest = planDigest(plan);
  for (const recipe of [ENHANCED_PRESENTATION, ULTRA_FULL]) {
    const view = createProps(plan, recipe, recipe === ULTRA_FULL
      ? { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 } : undefined, { sharedVegetation: true });
    const meshes = view.group.children.filter(child => child.name.startsWith('level-props-coniferFoliage')) as THREE.InstancedMesh[];
    const geometries = new Set(meshes.map(mesh => mesh.geometry)), materials = new Set(meshes.map(mesh => mesh.material as THREE.Material));
    const report = view.sharedVegetation!, family = report.families.find(f => f.part === 'coniferFoliage')!;
    try {
      const expected = (recipe === ULTRA_FULL ? CONIFER_DISTANCE_COUNTS.ultra : CONIFER_DISTANCE_COUNTS.ordinary).near * 30;
      assert.equal(family.colourTriangles, expected); assert.equal(family.shadowTriangles, expected);
      assert.equal(family.distance?.shadowDetail, 'near');
      assert.equal(report.geometryOwners, geometries.size); assert.equal(report.materialOwners, materials.size);
      assert.ok(geometries.size <= 3 && meshes.length > geometries.size);
      assert.equal(report.geometryBytes, [...geometries].reduce((sum, geometry) => sum + vegetationDistanceRanges(geometry)!.geometryBytes, 0));
      assert.equal(measureObject(view.group).triangles, view.triangles);
      assert.equal(measuredPropColourTriangles(view.group), view.triangles);
      let releases = 0;
      for (const mesh of meshes) mesh.addEventListener('dispose', () => releases++);
      for (const geometry of geometries) geometry.addEventListener('dispose', () => releases++);
      for (const material of materials) material.addEventListener('dispose', () => releases++);
      view.dispose(); view.dispose();
      assert.equal(releases, meshes.length + geometries.size + materials.size);
      assert.equal(planDigest(plan), digest);
    } finally { view.dispose(); }
  }
});

function drawHookPrecedesSubmission(body: string, hook: string): boolean {
  const before = body.indexOf(hook), draw = body.indexOf('renderBufferDirect(');
  return before >= 0 && draw > before;
}

test('installed Three reads drawRange after colour/shadow hooks and caches no per-object range/group', () => {
  // 2026-10-04: resolve the installed package instead of a fixed relative
  // climb, which pointed above the project root (ENOENT in every checkout).
  const threeSource = new URL('../src/', import.meta.resolve('three'));
  const renderer = readFileSync(new URL('renderers/WebGLRenderer.js', threeSource), 'utf8');
  const shadow = readFileSync(new URL('renderers/webgl/WebGLShadowMap.js', threeSource), 'utf8');
  const colourBody = renderer.slice(renderer.indexOf('function renderObject( object, scene, camera, geometry, material, group )'));
  const shadowBody = shadow.slice(shadow.indexOf('function renderObject( object, camera, shadowCamera, light, type )'));
  assert.equal(drawHookPrecedesSubmission(colourBody, 'object.onBeforeRender('), true);
  assert.equal(drawHookPrecedesSubmission(shadowBody, 'object.onBeforeShadow('), true);
  assert.ok(renderer.includes('const drawRange = geometry.drawRange;'));
  assert.ok(renderer.includes('object.onAfterRender(')); assert.ok(shadow.includes('object.onAfterShadow('));
  const unsafeBody = colourBody.replace('object.onBeforeRender(', 'object.removedHook(');
  assert.equal(drawHookPrecedesSubmission(unsafeBody, 'object.onBeforeRender('), false,
    'known-bad missing hook must fail the upstream order pin');
});

// RL-1 (2026-10-03): Low and Medium move the per-camera boundaries nearer and
// judge the nearest instance; High keeps the accepted cell-sphere decision.
test('reduced tiers reach middle and far sooner from the nearest instance; High keeps the cell decision', () => {
  const geometry = ordinaryVegetationBuilders(0, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const ranges = vegetationDistanceRanges(geometry)!;
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene();
  const noGroup = null as unknown as THREE.Group;
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 1000);
  camera.position.set(0, 2, 0); camera.updateMatrixWorld();
  const levelFor = (gap: number, tier: 'low' | 'medium' | 'high' | 'default'): string => {
    // Two trees either side of the camera: the cell sphere contains the camera,
    // while each instance sphere's nearest point is exactly `gap` metres away.
    const mesh = new THREE.InstancedMesh(geometry, material, 2), matrix = new THREE.Matrix4();
    mesh.setMatrixAt(0, matrix.makeTranslation(-(gap + radius) - center.x, 2 - center.y, -center.z));
    mesh.setMatrixAt(1, matrix.makeTranslation(gap + radius - center.x, 2 - center.y, -center.z));
    mesh.computeBoundingSphere(); mesh.updateMatrixWorld();
    const release = tier === 'default' ? installConiferDistanceCell(mesh)
      : installConiferDistanceCell(mesh, () => VEGETATION_TIER_DETAIL[tier]);
    try {
      mesh.onBeforeRender(renderer, scene, camera, geometry, material, noGroup);
      const start = geometry.drawRange.start;
      mesh.onAfterRender(renderer, scene, camera, geometry, material, noGroup);
      assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count }, 'colour range restored after the draw');
      return start === ranges.near.start ? 'near' : start === ranges.middle.start ? 'middle' : 'far';
    } finally { release(); mesh.dispose(); }
  };
  try {
    const { low, medium } = VEGETATION_TIER_DETAIL;
    for (const tier of ['high', 'default'] as const) {
      assert.equal(levelFor(low.treeDetailStartMetres + 0.5, tier), 'near', `${tier}: one cell sphere around the camera stays near`);
      assert.equal(levelFor(VEGETATION_TIER_DETAIL.high.treeFarStartMetres + 0.5, tier), 'near', `${tier}: unchanged accepted decision`);
    }
    assert.equal(levelFor(low.treeDetailStartMetres - 0.5, 'low'), 'near', 'Low keeps a close tree on the near template');
    assert.equal(levelFor(low.treeDetailStartMetres + 0.5, 'low'), 'middle');
    assert.equal(levelFor(low.treeFarStartMetres + 0.5, 'low'), 'far');
    assert.equal(levelFor(low.treeDetailStartMetres + 0.5, 'medium'), 'near');
    assert.equal(levelFor(medium.treeDetailStartMetres + 0.5, 'medium'), 'middle');
    assert.equal(levelFor(medium.treeFarStartMetres + 0.5, 'medium'), 'far');
    assert.equal(coniferDistanceLevel(30, 55), coniferDistanceLevel(30, 55, VEGETATION_TIER_DETAIL.high));
    assert.equal(coniferDistanceLevel(low.treeDetailStartMetres + 0.01, 55, low), 'middle');
    assert.equal(coniferDistanceLevel(low.treeFarStartMetres + 0.01, 55, low), 'far');
  } finally { geometry.dispose(); material.dispose(); }
});

// RL-3 (2026-10-03): a shadow draw submits only the prefix ending at the last
// instance that can reach that pane's shadow box; skipped casters are proved
// outside the box vertex by vertex, and the colour pass keeps every instance.
test('shadow draws submit only casters that reach the pane\'s box, and every count is restored', () => {
  const geometry = ordinaryVegetationBuilders(1, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const ranges = vegetationDistanceRanges(geometry)!;
  const xs = [0, 100, 200, 300];
  const mesh = new THREE.InstancedMesh(geometry, material, xs.length), matrix = new THREE.Matrix4();
  xs.forEach((x, index) => mesh.setMatrixAt(index, matrix.makeTranslation(x, 0, 0)));
  mesh.position.set(3, 0, -2); mesh.updateMatrixWorld(); mesh.computeBoundingSphere();
  const release = installConiferDistanceCell(mesh);
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene();
  const noGroup = null as unknown as THREE.Group;
  const sun = new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 120);
  const colour = new THREE.PerspectiveCamera(55, 1, .1, 1000);
  colour.position.set(0, 2, 10); colour.updateMatrixWorld();
  const aim = (x: number): void => {
    sun.position.set(x + 20, 60, 25); sun.lookAt(x, 0, 0); sun.updateMatrixWorld(); sun.updateProjectionMatrix();
  };
  // Independent predicate: every near-range vertex of a skipped instance lies
  // outside the box in the shadow camera's own view space.
  const inBox = (index: number): boolean => {
    const position = geometry.getAttribute('position'), indices = geometry.index!;
    const point = new THREE.Vector3(), world = new THREE.Matrix4();
    mesh.getMatrixAt(index, world); world.premultiply(mesh.matrixWorld);
    for (let corner = ranges.near.start; corner < ranges.near.start + ranges.near.count; corner++) {
      point.fromBufferAttribute(position, indices.getX(corner)).applyMatrix4(world).applyMatrix4(sun.matrixWorldInverse);
      if (point.x >= sun.left && point.x <= sun.right && point.y >= sun.bottom && point.y <= sun.top
        && -point.z >= sun.near && -point.z <= sun.far) return true;
    }
    return false;
  };
  const shadowCount = (x: number): number => {
    aim(x);
    mesh.onBeforeShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    const submitted = mesh.count;
    assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count }, 'shadows keep the near silhouette');
    for (let index = submitted; index < xs.length; index++) assert.equal(inBox(index), false, `skipped caster ${index} reaches the box`);
    mesh.onAfterShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    assert.equal(mesh.count, xs.length, 'a later pane or the colour pass sees every instance');
    return submitted;
  };
  try {
    assert.equal(shadowCount(0), 1);
    assert.equal(inBox(0), true, 'the kept caster really reaches the box');
    assert.equal(shadowCount(100), 2);
    assert.equal(shadowCount(300), 4);
    assert.equal(shadowCount(1000), 0, 'a cell with no caster in the box submits nothing');
    // A shadow draw that never reached its after-hook cannot shorten colour.
    aim(0); mesh.onBeforeShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    assert.equal(mesh.count, 1);
    mesh.onBeforeRender(renderer, scene, colour, geometry, material, noGroup);
    assert.equal(mesh.count, xs.length);
    mesh.onAfterRender(renderer, scene, colour, geometry, material, noGroup);
    release(); release();
    assert.equal(mesh.count, xs.length);
    assert.equal(mesh.onBeforeShadow, THREE.Object3D.prototype.onBeforeShadow);
  } finally { release(); mesh.dispose(); geometry.dispose(); material.dispose(); }
});

// PERF-R2-3 (2026-10-04): when the casters reaching a pane's box are not a
// gap-free prefix, a draw after the first submits a compacted slot holding
// exactly them, in their original order, once three has uploaded it; the
// colour pass, every count and the instance buffer stay untouched.
test('shadow draws submit exactly the reaching casters from an uploaded per-pane slot', () => {
  const geometry = ordinaryVegetationBuilders(1, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const ranges = vegetationDistanceRanges(geometry)!;
  const xs = [0, 100, 200, 300, 400];
  const mesh = new THREE.InstancedMesh(geometry, material, xs.length), matrix = new THREE.Matrix4();
  xs.forEach((x, index) => mesh.setMatrixAt(index, matrix.makeTranslation(x, index * 0.25, 0)));
  mesh.position.set(3, 0, -2); mesh.updateMatrixWorld(); mesh.computeBoundingSphere();
  const colourMatrices = mesh.instanceMatrix, colourArray = Array.from(colourMatrices.array), version = colourMatrices.version;
  const attributeNames = Object.keys(geometry.attributes).sort();
  const release = installConiferDistanceCell(mesh);
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene();
  const noGroup = null as unknown as THREE.Group;
  const sun = new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 120);
  const colour = new THREE.PerspectiveCamera(55, 1, .1, 1000);
  colour.position.set(0, 2, 10); colour.updateMatrixWorld();
  const carriers = (): THREE.InterleavedBufferAttribute[] => Object.entries(geometry.attributes)
    .filter(([name]) => !attributeNames.includes(name)).map(([, attribute]) => attribute as THREE.InterleavedBufferAttribute);
  const upload = (): void => { for (const carrier of carriers()) carrier.data.onUploadCallback(); };
  // The world x of each instance the draw submits, read through the bound view.
  const shadowDraw = (x: number): number[] => {
    sun.position.set(x + 20, 60, 25); sun.lookAt(x, 0, 0); sun.updateMatrixWorld(); sun.updateProjectionMatrix();
    mesh.onBeforeShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count }, 'shadows keep the near silhouette');
    const bound = mesh.instanceMatrix as unknown as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const offset = (bound as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (bound as THREE.InterleavedBufferAttribute).offset : 0;
    const submitted = Array.from({ length: mesh.count }, (_, index) => bound.array[offset + index * 16 + 12] + mesh.position.x);
    mesh.onAfterShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    assert.equal(mesh.instanceMatrix, colourMatrices, 'a later pane or the colour pass draws the colour instances');
    assert.equal(mesh.count, xs.length);
    return submitted;
  };
  try {
    // First draw for a box: RL-3's prefix while the slot is only written.
    assert.deepEqual(shadowDraw(100), [3, 103]);
    assert.deepEqual(shadowDraw(100), [3, 103], 'a slot three has not uploaded is never bound');
    upload();
    assert.deepEqual(shadowDraw(100), [103], 'the uploaded slot holds exactly the reaching caster');
    assert.equal(carriers().length, 1, 'one carrier attribute per cell, created on first need');
    // Four panes: each box gets its own slot and none evicts another.
    for (const x of [200, 300, 400]) assert.equal(shadowDraw(x).length, xs.findIndex(v => v === x) + 1);
    upload();
    for (let round = 0; round < 3; round++)
      for (const x of [100, 200, 300, 400]) assert.deepEqual(shadowDraw(x), [x + 3], `pane box ${x}, round ${round}`);
    // Gap-free prefixes and empty boxes need no slot.
    assert.deepEqual(shadowDraw(0), [3]);
    assert.deepEqual(shadowDraw(2000), []);
    // A slot left bound by a draw that never reached its after-hook cannot
    // reach the colour pass.
    sun.position.set(120, 60, 25); sun.lookAt(100, 0, 0); sun.updateMatrixWorld();
    mesh.onBeforeShadow(renderer, scene, colour, sun, geometry, material, noGroup);
    assert.notEqual(mesh.instanceMatrix, colourMatrices, 'known-bad held slot was not armed');
    mesh.onBeforeRender(renderer, scene, colour, geometry, material, noGroup);
    assert.equal(mesh.instanceMatrix, colourMatrices); assert.equal(mesh.count, xs.length);
    mesh.onAfterRender(renderer, scene, colour, geometry, material, noGroup);
    assert.deepEqual(Array.from(colourMatrices.array), colourArray); assert.equal(colourMatrices.version, version);
    // Three's dispose listener is added when it first draws the geometry, so
    // before any carrier exists; at disposal it must still find the carrier
    // to delete its GL buffer (review r3, 2026-10-04).
    let freed: string[] = [];
    const three = (): void => { freed = Object.keys(geometry.attributes); };
    geometry.addEventListener('dispose', three);
    release(); release();
    assert.equal(mesh.instanceMatrix, colourMatrices);
    assert.equal(carriers().length, 1, 'a released cell leaves its carrier for the geometry to free');
    geometry.dispose();
    assert.equal(freed.filter(name => !attributeNames.includes(name)).length, 1, 'three frees the carrier with the geometry');
    assert.deepEqual(Object.keys(geometry.attributes).sort(), attributeNames, 'then the carrier leaves the geometry');
    geometry.removeEventListener('dispose', three);
  } finally { release(); mesh.dispose(); geometry.dispose(); material.dispose(); }
});

// TIER-LOW-1 (2026-10-04): the open middle form read as a see-through lattice
// beside Switchback's trail from 24 m (Low) and 40 m (Medium); a tree keeps
// its near form to 40 m on Low and 56 m on Medium, never past High's 64 m.
test('Low and Medium keep trail-side conifers on the near form', () => {
  const { low, medium, high } = VEGETATION_TIER_DETAIL;
  for (const [rules, nearTo] of [[low, 40], [medium, 56]] as const) {
    assert.equal(coniferDistanceLevel(nearTo - 0.01, 55, rules), 'near');
    assert.equal(coniferDistanceLevel(30, 55, rules), 'near', 'a tree 30 m from the trail stays solid');
    assert.equal(coniferDistanceLevel(nearTo + 0.01, 55, rules), 'middle');
    assert.ok(rules.treeDetailStartMetres <= high.treeDetailStartMetres && rules.treeFarStartMetres <= high.treeFarStartMetres);
    assert.ok(rules.grassFadeEndMetres < high.grassFadeEndMetres, 'the grass saving is kept');
  }
  assert.equal(coniferDistanceLevel(50, 55, medium), 'near');
  assert.equal(coniferDistanceLevel(low.treeFarStartMetres + 0.01, 55, low), 'far');
});

// PERF-R2-1 (2026-10-04): from three panes on, each quarter pane draws with
// its tier's boundaries halved; one and two panes and Ultra keep theirs, as
// the same frozen objects, so their decisions and grass programs are unchanged.
test('three or more panes take the couch rules; one and two panes and Ultra keep their own', () => {
  for (const quality of ['low', 'medium', 'high'] as const) {
    const tier = VEGETATION_TIER_DETAIL[quality];
    for (const panes of [1, 2]) assert.equal(vegetationDetailFor(quality, panes, false), tier);
    for (const panes of [3, 4]) {
      const couch = vegetationDetailFor(quality, panes, false);
      assert.equal(couch, VEGETATION_COUCH_DETAIL[quality]); assert.ok(Object.isFrozen(couch));
      for (const key of ['treeDetailStartMetres', 'treeFarStartMetres', 'grassFadeStartMetres', 'grassFadeEndMetres'] as const)
        assert.equal(couch[key], tier[key] * VEGETATION_COUCH_DETAIL.paneScale, `${quality} ${key}`);
    }
    for (const panes of [1, 2, 3, 4]) assert.equal(vegetationDetailFor(quality, panes, true), VEGETATION_TIER_DETAIL.high);
  }
  // Cells read the pane count at draw time.
  let panes = 2;
  const detail = () => vegetationDetailFor('high', panes, false);
  const geometry = ordinaryVegetationBuilders(0, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const ranges = vegetationDistanceRanges(geometry)!;
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene(), noGroup = null as unknown as THREE.Group;
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 1000);
  camera.position.set(0, 2, 0); camera.updateMatrixWorld();
  const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 1);
  grass.geometry.clearGroups();
  const releaseGrass = (grass.computeBoundingSphere(), installGrassDistanceCell(grass, detail));
  const treeAt = (gap: number): string => {
    const tree = new THREE.InstancedMesh(geometry, material, 1);
    tree.setMatrixAt(0, new THREE.Matrix4().makeTranslation(gap + radius - center.x, 2 - center.y, -center.z));
    tree.computeBoundingSphere(); tree.updateMatrixWorld(true);
    const release = installConiferDistanceCell(tree, detail);
    try {
      tree.onBeforeRender(renderer, scene, camera, geometry, material, noGroup);
      const start = geometry.drawRange.start;
      tree.onAfterRender(renderer, scene, camera, geometry, material, noGroup);
      return start === ranges.near.start ? 'near' : start === ranges.middle.start ? 'middle' : 'far';
    } finally { release(); tree.dispose(); }
  };
  const grassAt = (gap: number): number => {
    grass.position.set(gap + grass.boundingSphere!.radius, 2, 0); grass.updateMatrixWorld(true);
    grass.onBeforeRender(renderer, scene, camera, grass.geometry, material, noGroup);
    const count = grass.count;
    grass.onAfterRender(renderer, scene, camera, grass.geometry, material, noGroup);
    return count;
  };
  try {
    assert.equal(treeAt(40), 'near'); assert.equal(treeAt(100), 'middle'); assert.equal(grassAt(70), 1);
    panes = 4;
    assert.equal(treeAt(40), 'middle', 'a quarter pane reaches the middle form at half the distance');
    assert.equal(treeAt(100), 'far'); assert.equal(treeAt(20), 'near');
    assert.equal(grassAt(70), 0, 'and skips grass its halved fade has collapsed');
    assert.equal(grassAt(40), 1);
    panes = 2;
    assert.equal(treeAt(40), 'near'); assert.equal(grassAt(70), 1);
  } finally { releaseGrass(); grass.dispose(); grass.geometry.dispose(); geometry.dispose(); material.dispose(); }
});

// Review r3 (2026-10-04): High's couch rules scale High's boundaries but keep
// its cell-sphere judging, so a quarter pane changes form where solo High
// would at the same on-screen size; reduced tiers keep judging instances.
test('couch High judges the cell sphere as solo High does; reduced couch tiers judge instances', () => {
  const geometry = ordinaryVegetationBuilders(0, true).coniferFoliage();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const ranges = vegetationDistanceRanges(geometry)!;
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene(), noGroup = null as unknown as THREE.Group;
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 1000);
  camera.position.set(0, 2, 0); camera.updateMatrixWorld();
  // Two trees 40 m aside, 60 m ahead and behind: the cell sphere reaches the
  // camera while the nearest tree stands about 70 m away.
  const tree = new THREE.InstancedMesh(geometry, material, 2);
  [-60, 60].forEach((z, index) => tree.setMatrixAt(index, new THREE.Matrix4().makeTranslation(40 - center.x, 2 - center.y, z - center.z)));
  tree.computeBoundingSphere(); tree.updateMatrixWorld(true);
  let rules: VegetationDistanceRules = VEGETATION_TIER_DETAIL.high;
  const release = installConiferDistanceCell(tree, () => rules);
  const levelWith = (next: VegetationDistanceRules): string => {
    rules = next;
    tree.onBeforeRender(renderer, scene, camera, geometry, material, noGroup);
    const start = geometry.drawRange.start;
    tree.onAfterRender(renderer, scene, camera, geometry, material, noGroup);
    return start === ranges.near.start ? 'near' : start === ranges.middle.start ? 'middle' : 'far';
  };
  const nearestTree = Math.hypot(40, 60) - radius, fov = camera.getEffectiveFOV();
  try {
    assert.notEqual(coniferDistanceLevel(nearestTree, fov, VEGETATION_COUCH_DETAIL.high), 'near', 'fixture: judged by tree, couch High would leave near');
    assert.equal(levelWith(VEGETATION_TIER_DETAIL.high), 'near');
    assert.equal(levelWith(vegetationDetailFor('high', 4, false)), 'near', 'a quarter pane keeps the cell on near, as solo High does');
    for (const quality of ['low', 'medium'] as const) {
      for (const couch of [VEGETATION_TIER_DETAIL[quality], vegetationDetailFor(quality, 4, false)])
        assert.equal(levelWith(couch), coniferDistanceLevel(nearestTree, fov, couch), `${quality} judges the nearest tree`);
    }
    assert.equal(levelWith(vegetationDetailFor('medium', 4, false)), 'far');
  } finally { release(); tree.dispose(); geometry.dispose(); material.dispose(); }
});
