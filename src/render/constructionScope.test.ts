/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { districtSites, parkCaseSites, residentialSites } from '../level/districtSites.ts';
import { beginConstructionScope, constructionScopeOpen, withConstructionScope } from './constructionScope.ts';
import { scopedDistrictSites, scopedParkCaseSites, scopedResidentialSites } from './scopedSiteQueries.ts';
import { buildVegetationForm } from './vegetationForms.ts';
import { SHARED_VEGETATION_CONTRACTS, ordinaryVegetationPainter } from './sharedVegetation.ts';

/** One residential house (or clock tower) facing one paved street; the same
 * explicit source shape `level/districtSites.test.ts` uses. */
function fixture(look: 'residential' | 'clockTower'): LevelPlan {
  const heights: number[] = [], surfaces: SurfaceId[] = [];
  for (let row = 0; row <= 160; row++) for (let column = 0; column <= 160; column++) heights.push(0);
  for (let row = 0; row < 160; row++) for (let column = 0; column < 160; column++) {
    const z = -80 + row + 0.5;
    surfaces.push(z >= 48 && z <= 56 ? 'pavement' : 'grass');
  }
  const size = look === 'clockTower' ? { x: 7, y: 24, z: 7 } : { x: 12, y: 6, z: 10 };
  const building: Prop = { kind: 'building', look, scale: 1, position: { x: 0, y: 0, z: 25 }, size, rotationY: 0 };
  const socket = (x: number) => ({ position: { x, y: 0, z: 52 } as Vec3, headingY: Math.PI / 2,
    surface: 'pavement' as SurfaceId, halfWidth: 4, gradient: 0 });
  return { id: 'construction-scope-fixture', spawn: { position: { x: 0, y: 0, z: 52 }, headingY: 0 },
    heightfield: { originX: -80, originZ: -80, spacing: 1, columns: 161, rows: 161, heights, surfaces },
    surround: { surface: 'grass', height: 0 }, checkpoints: [],
    segments: [{ id: look === 'clockTower' ? 'park-gate@fixture' : 'residential-street',
      entry: socket(-60), exit: socket(60), colliders: [] }], props: [building],
    solids: [{ centre: { x: 0, y: size.y / 2, z: 25 }, halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
      rotationY: 0, surface: 'pavement', occludes: true }] };
}

test('scoped site queries are the level queries: fresh outside a scope, answered once inside one', () => {
  for (const look of ['residential', 'clockTower'] as const) {
    const plan = fixture(look);
    const expected = { residential: residentialSites(plan), park: parkCaseSites(plan), district: districtSites(plan) };
    assert.ok(expected.district.length > 0, `the ${look} fixture yields a protected site`);
    assert.equal(constructionScopeOpen(), false);
    const outside = scopedResidentialSites(plan);
    assert.deepStrictEqual(outside, expected.residential);
    assert.notEqual(scopedResidentialSites(plan), outside, 'no cache without an open scope');
    assert.deepStrictEqual(scopedDistrictSites(plan), expected.district);

    let first: readonly unknown[] = [];
    withConstructionScope(() => {
      first = scopedResidentialSites(plan);
      assert.deepStrictEqual(first, expected.residential);
      assert.equal(scopedResidentialSites(plan), first, 'one answer per plan inside the scope');
      assert.deepStrictEqual(scopedParkCaseSites(plan), expected.park);
      assert.deepStrictEqual(scopedDistrictSites(plan), expected.district, 'same composition as districtSites');
      // A nested scope (a tier rebuild inside a world build) shares the answers.
      withConstructionScope(() => assert.equal(scopedResidentialSites(plan), first));
      assert.equal(scopedResidentialSites(plan), first, 'an inner end does not clear the outer scope');
    });
    assert.equal(constructionScopeOpen(), false);
    const after = scopedResidentialSites(plan);
    assert.notEqual(after, first, 'the outermost end drops every answer');
    assert.deepStrictEqual(after, expected.residential);
  }
});

test('ending a scope is idempotent and survives a throwing build', () => {
  const end = beginConstructionScope();
  assert.equal(constructionScopeOpen(), true);
  end(); end();
  assert.equal(constructionScopeOpen(), false);
  assert.throws(() => withConstructionScope(() => { throw new Error('build failed'); }), /build failed/);
  assert.equal(constructionScopeOpen(), false);
});

test('vegetation forms reused inside a scope are byte-identical, fresh and caller-owned', () => {
  const contract = SHARED_VEGETATION_CONTRACTS.crown;
  const reference = buildVegetationForm('crown', 'ordinary', 1, contract, ordinaryVegetationPainter);
  const bytes = (array: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) =>
    Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  withConstructionScope(() => {
    const a = buildVegetationForm('crown', 'ordinary', 1, contract, ordinaryVegetationPainter);
    const b = buildVegetationForm('crown', 'ordinary', 1, contract, ordinaryVegetationPainter);
    for (const form of [a, b]) {
      assert.deepStrictEqual(Object.keys(form.geometry.attributes), Object.keys(reference.geometry.attributes));
      for (const [name, attribute] of Object.entries(reference.geometry.attributes)) {
        const actual = form.geometry.getAttribute(name) as THREE.BufferAttribute;
        assert.equal(actual.version, (attribute as THREE.BufferAttribute).version, `${name} version`);
        assert.ok(bytes(actual.array as Float32Array).equals(bytes(attribute.array as Float32Array)), `${name} bytes`);
      }
      assert.deepStrictEqual(form.geometry.boundingSphere, reference.geometry.boundingSphere);
      assert.equal(form.geometryBytes, reference.geometryBytes);
      for (const key of ['reach', 'height', 'mass', 'leaf', 'wood'] as const)
        assert.ok(bytes(form.context[key]).equals(bytes(reference.context[key])), `context ${key}`);
    }
    assert.notEqual(a.geometry.getAttribute('position').array, b.geometry.getAttribute('position').array);
    assert.notEqual(a.geometry.getAttribute('normal').array, b.geometry.getAttribute('normal').array);
    assert.notEqual(a.context.reach, b.context.reach);
    a.geometry.dispose(); b.geometry.dispose();
  });
  reference.geometry.dispose();
});
