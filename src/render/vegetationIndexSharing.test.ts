/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Indexed distance storage controls. Root runs these after guarded composition.
 * Oracles expand actual indices into raw Float32 words, independently of the
 * packer's hash, price function, corner lookup and source allocation prefix. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { buildBroadleafDistanceForms, buildConiferDistanceForms, VEGETATION_DISTANCE_COUNTS,
  type VegetationDistanceForms } from './vegetationForms.ts';
import { SHARED_VEGETATION_CONTRACTS, ordinaryVegetationPainter } from './sharedVegetation.ts';
import { toneSharedVegetation } from './ultra/ultraFoliage.ts';
import { packConiferDistanceForms, vegetationDistanceRanges, potentialGeometryTriangles,
  installConiferDistanceCell, type VegetationDistanceRange } from './vegetationDistance.ts';

const attributes = ['position', 'normal', 'color'] as const;
const levels = ['near', 'middle', 'far'] as const;
function words(geometry: THREE.BufferGeometry, name: string): Uint32Array {
  const array = geometry.getAttribute(name).array as Float32Array;
  return new Uint32Array(array.buffer, array.byteOffset, array.length);
}
function expandDraw(geometry: THREE.BufferGeometry, range: VegetationDistanceRange,
  name: string): Uint32Array {
  const source = words(geometry, name), width = geometry.getAttribute(name).itemSize, result = new Uint32Array(range.count * width);
  const index = geometry.index;
  assert.ok(index, 'Indexed oracle needs an actual index allocation');
  for (let corner = 0; corner < range.count; corner++) {
    const original = index.getX(range.start + corner);
    assert.ok(Number.isInteger(original) && original >= 0 && original * width + width - 1 < source.length);
    for (let axis = 0; axis < width; axis++) result[corner * width + axis] = source[original * width + axis];
  }
  return result;
}

for (const detail of ['ordinary', 'ultra'] as const) for (const family of ['crown', 'shrub', 'coniferFoliage'] as const) {
  test(`${detail} ${family}: all3 habits/all3 rendered levels retain every P/N/C bit and triangle corner order`, () => {
    for (const variant of [0, 1, 2] as const) {
      const paint = detail === 'ordinary' ? ordinaryVegetationPainter : toneSharedVegetation;
      const forms = family === 'coniferFoliage'
        ? buildConiferDistanceForms(detail, variant, SHARED_VEGETATION_CONTRACTS[family], paint)
        : buildBroadleafDistanceForms(family, detail, variant, SHARED_VEGETATION_CONTRACTS[family], paint);
      const expected = levels.map(level => ({ count: forms[level].getAttribute('position').count,
        words: attributes.map(name => words(forms[level], name)),
        wood: forms[level].hasAttribute('vegetationWood') ? words(forms[level], 'vegetationWood') : null }));
      const sourceBounds = forms.near.boundingBox!.clone(), sourceSphere = forms.near.boundingSphere!.clone();
      let temporaryReleases = 0;
      for (const form of Object.values(forms)) form.addEventListener('dispose', () => temporaryReleases++);
      const packed = packConiferDistanceForms(forms);
      try {
        assert.equal(temporaryReleases, 3, 'One release per consumed CPU template');
        const ranges = vegetationDistanceRanges(packed)!;
        assert.ok(packed.index); assert.equal(packed.groups.length, 0);
        assert.equal(packed.getAttribute('position').count, expected[0].count);
        assert.notEqual(packed.getAttribute('position').array.buffer, expected[0].words[0].buffer,
          'Owned near allocation must survive disposal of source template arrays');
        assert.deepEqual(packed.boundingBox, sourceBounds); assert.deepEqual(packed.boundingSphere, sourceSphere);
        let start = 0;
        for (let level = 0; level < levels.length; level++) {
          const range = ranges[levels[level]], original = expected[level];
          assert.equal(range.start, start); assert.equal(range.count, original.count);
          assert.equal(range.triangles, VEGETATION_DISTANCE_COUNTS[detail][family][levels[level]]);
          for (let attribute = 0; attribute < attributes.length; attribute++)
            assert.deepEqual(expandDraw(packed, range, attributes[attribute]), original.words[attribute]);
          if (original.wood) {
            assert.equal(packed.getAttribute('vegetationWood').itemSize, 1);
            assert.deepEqual(expandDraw(packed, range, 'vegetationWood'), original.wood,
              'Wood semantic words preserve the same complete corner identity');
          } else assert.equal(packed.hasAttribute('vegetationWood'), false);
          start += original.count;
        }
        assert.equal(packed.index.count, start);
        const width = expected[0].count <= 65_536 ? 2 : 4;
        assert.equal(packed.index.array.BYTES_PER_ELEMENT, width);
        const actualBytes = Object.values(packed.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
          + packed.index.array.byteLength;
        assert.equal(ranges.geometryBytes, actualBytes);
        assert.equal(actualBytes, expected[0].count * 9 * 4 + (expected[0].wood?.byteLength ?? 0) + start * width);
        assert.equal(potentialGeometryTriangles(packed), expected[0].count / 3);

        if (expected[0].wood) {
          const wrongWood = packed.clone();
          try {
            words(wrongWood, 'vegetationWood')[wrongWood.index!.getX(ranges.near.start)] ^= 1;
            assert.notDeepEqual(expandDraw(wrongWood, ranges.near, 'vegetationWood'), expected[0].wood,
              'Known-bad wood semantic bit must fail complete corner identity');
          } finally { wrongWood.dispose(); }
        }
        // Each negative uses a real allocated index/attribute and this SAME
        // independent draw oracle, not the production hash/price validator.
        const wrongIndex = packed.clone();
        try {
          wrongIndex.index!.setX(ranges.near.start, 1);
          assert.notDeepEqual(expandDraw(wrongIndex, ranges.near, 'position'), expected[0].words[0],
            'Known-bad in-bounds wrong index must fail rendered position identity');
        } finally { wrongIndex.dispose(); }
        for (const name of ['normal', 'color'] as const) {
          const wrong = packed.clone();
          try {
            const first = wrong.index!.getX(ranges.near.start) * 3;
            words(wrong, name)[first] ^= 1; // exactly one stored Float32 bit
            assert.notDeepEqual(expandDraw(wrong, ranges.near, name),
              expected[0].words[attributes.indexOf(name)], `Known-bad ${name} bit must fail`);
          } finally { wrong.dispose(); }
        }
      } finally { packed.dispose(); }
    }
  });
}

function syntheticForms(corners: readonly Uint32Array[], order: readonly number[]): VegetationDistanceForms {
  const geometry = (sequence: readonly number[]): THREE.BufferGeometry => {
    const out = new THREE.BufferGeometry();
    for (let attribute = 0; attribute < attributes.length; attribute++) {
      const values = new Float32Array(sequence.length * 3), bits = new Uint32Array(values.buffer);
      for (let i = 0; i < sequence.length; i++) for (let axis = 0; axis < 3; axis++)
        bits[i * 3 + axis] = corners[sequence[i]][attribute * 3 + axis];
      out.setAttribute(attributes[attribute], new THREE.BufferAttribute(values, 3));
    }
    out.computeBoundingBox(); out.computeBoundingSphere(); return out;
  };
  return { near: geometry(corners.map((_, i) => i)), middle: geometry(order), far: geometry([...order].reverse()) };
}

test('hash collisions, same-position different attributes and signed zero retain complete corner identity', () => {
  const zero = new Uint32Array(9), collision = new Uint32Array(9), negativeZero = new Uint32Array(9);
  let prefix = 0x811c9dc5;
  for (let word = 0; word < 7; word++) prefix = Math.imul(prefix, 0x01000193);
  collision[7] = 1;
  collision[8] = (Math.imul(prefix ^ 1, 0x01000193) ^ Math.imul(prefix, 0x01000193)) >>> 0;
  const fnv = (tuple: Uint32Array): number => {
    let value = 0x811c9dc5;
    for (const word of tuple) value = Math.imul(value ^ word, 0x01000193);
    return value >>> 0;
  };
  assert.equal(fnv(zero), fnv(collision), 'Fixture forces equal hashes with unequal full P/N/C words');
  assert.notDeepEqual(zero, collision); negativeZero[0] = 0x8000_0000;
  const corners = [zero, collision, negativeZero], forms = syntheticForms(corners, [2, 1, 0]);
  const originals = levels.map(level => attributes.map(name => words(forms[level], name)));
  const packed = packConiferDistanceForms(forms);
  try {
    const ranges = vegetationDistanceRanges(packed)!;
    for (let level = 0; level < levels.length; level++) for (let attribute = 0; attribute < attributes.length; attribute++)
      assert.deepEqual(expandDraw(packed, ranges[levels[level]], attributes[attribute]), originals[level][attribute]);
    assert.ok(expandDraw(packed, ranges.near, 'position').includes(0x8000_0000),
      'Signed zero must not collapse into the positive-zero word');
  } finally { packed.dispose(); }
});

test('a lower normal/color word absent from near fails and releases all consumed templates/destination', () => {
  for (const name of ['normal', 'color'] as const) {
    const corners = [new Uint32Array(9), new Uint32Array(9), new Uint32Array(9)];
    const forms = syntheticForms(corners, [0, 1, 2]);
    words(forms.far, name)[0] = 0x3f80_0000;
    let templates = 0, all = 0;
    for (const form of Object.values(forms)) form.addEventListener('dispose', () => templates++);
    const original = THREE.BufferGeometry.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function (): void { all++; original.call(this); };
    try {
      assert.throws(() => packConiferDistanceForms(forms), /not bit-identical/);
      assert.equal(templates, 3); assert.equal(all, 4);
    } finally { THREE.BufferGeometry.prototype.dispose = original; }
  }
});

test('Uint16 maximum index boundary is actual65535; larger near-corner counts allocate Uint32', () => {
  for (const count of [65_535, 65_538]) { // triangle-multiple corners immediately around65,536
    const corners = [new Uint32Array(9), new Uint32Array(9), new Uint32Array(9)];
    const small = syntheticForms(corners, [0, 1, 2]);
    for (const name of attributes) small.near.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const packed = packConiferDistanceForms(small);
    try {
      assert.ok(packed.index);
      assert.equal(packed.index.array.BYTES_PER_ELEMENT, count <= 65_536 ? 2 : 4);
      assert.equal(packed.index.getX(count - 1), count - 1);
      assert.equal(vegetationDistanceRanges(packed)!.near.count, count);
    } finally { packed.dispose(); }
  }
});

for (const detail of ['ordinary', 'ultra'] as const) for (const family of ['crown', 'shrub', 'coniferFoliage'] as const) {
  test(`${detail} ${family}: return from far/pane/shadow draws preserves index and attribute owners through exceptional teardown`, () => {
    const paint = detail === 'ordinary' ? ordinaryVegetationPainter : toneSharedVegetation;
    const forms = family === 'coniferFoliage'
      ? buildConiferDistanceForms(detail, 1, SHARED_VEGETATION_CONTRACTS[family], paint)
      : buildBroadleafDistanceForms(family, detail, 1, SHARED_VEGETATION_CONTRACTS[family], paint);
    const geometry = packConiferDistanceForms(forms), material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4()); mesh.computeBoundingSphere(); mesh.updateMatrixWorld();
    let failAfter = false;
    const originalAfter = mesh.onAfterRender, originalShadowAfter = mesh.onAfterShadow;
    mesh.onAfterRender = (): void => { if (failAfter) throw new Error('known-bad after colour'); };
    mesh.onAfterShadow = (): void => { if (failAfter) throw new Error('known-bad after shadow'); };
    const heldAfter = mesh.onAfterRender, heldShadowAfter = mesh.onAfterShadow;
    const release = installConiferDistanceCell(mesh), ranges = vegetationDistanceRanges(geometry)!;
    const renderer = {} as THREE.WebGLRenderer, scene = new THREE.Scene(), group = null as unknown as THREE.Group;
    const near = new THREE.PerspectiveCamera(55, 1, .1, 1000), far = new THREE.PerspectiveCamera(55, 1, .1, 1000);
    near.position.set(0, 4, 12); far.position.set(0, 4, 800); near.updateMatrixWorld(); far.updateMatrixWorld();
    const shadow = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, .1, 3000);
    shadow.updateMatrixWorld();
    const arrays = attributes.map(name => geometry.getAttribute(name).array), index = geometry.index!.array;
    const versions = attributes.map(name => (geometry.getAttribute(name) as THREE.BufferAttribute).version).concat(geometry.index!.version);
    const instance = mesh.instanceMatrix.array, instanceVersion = mesh.instanceMatrix.version;
    try {
      for (let repeat = 0; repeat < 4; repeat++) {
        mesh.onBeforeRender(renderer, scene, far, geometry, material, group);
        assert.equal(geometry.drawRange.start, ranges.far.start);
        failAfter = true;
        assert.throws(() => mesh.onAfterRender(renderer, scene, far, geometry, material, group), /after colour/);
        assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
        failAfter = false;
        mesh.onBeforeRender(renderer, scene, near, geometry, material, group);
        mesh.onAfterRender(renderer, scene, near, geometry, material, group);
        geometry.setDrawRange(ranges.far.start, ranges.far.count);
        mesh.onBeforeShadow(renderer, scene, far, shadow, geometry, material, group);
        failAfter = true;
        assert.throws(() => mesh.onAfterShadow(renderer, scene, far, shadow, geometry, material, group), /after shadow/);
        assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
        failAfter = false;
        geometry.setDrawRange(ranges.far.start, ranges.far.count);
        mesh.onBeforeRender(renderer, scene, shadow, geometry, material, group);
        assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
        mesh.onAfterRender(renderer, scene, shadow, geometry, material, group);
      }
      for (let attribute = 0; attribute < attributes.length; attribute++)
        assert.equal(geometry.getAttribute(attributes[attribute]).array, arrays[attribute]);
      assert.equal(geometry.index!.array, index);
      assert.deepEqual(attributes.map(name => (geometry.getAttribute(name) as THREE.BufferAttribute).version).concat(geometry.index!.version), versions);
      assert.equal(mesh.instanceMatrix.array, instance); assert.equal(mesh.instanceMatrix.version, instanceVersion);
      release(); release();
      assert.equal(mesh.onAfterRender, heldAfter); assert.equal(mesh.onAfterShadow, heldShadowAfter);
      assert.deepEqual(geometry.drawRange, { start: 0, count: ranges.near.count });
    } finally {
      release(); mesh.onAfterRender = originalAfter; mesh.onAfterShadow = originalShadowAfter;
      mesh.dispose(); geometry.dispose(); material.dispose();
    }
  });
}
