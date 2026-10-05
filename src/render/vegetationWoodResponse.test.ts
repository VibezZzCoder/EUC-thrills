/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildBroadleafDistanceForms, buildVegetationForm } from './vegetationForms.ts';
import { SHARED_VEGETATION_CONTRACTS } from './sharedVegetation.ts';
import { toneSharedVegetation } from './ultra/ultraFoliage.ts';
import { packConiferDistanceForms, vegetationDistanceRanges } from './vegetationDistance.ts';

for (const family of ['crown', 'shrub'] as const) for (const variant of [0, 1, 2] as const) {
  test(`${family}/${variant}: rendered Ultra wood meaning survives every indexed distance range`, () => {
    const contract = SHARED_VEGETATION_CONTRACTS[family];
    const form = buildVegetationForm(family, 'ultra', variant, contract, toneSharedVegetation);
    try {
      const a = form.geometry.getAttribute('vegetationWood');
      assert.equal(a.itemSize, 1); assert.equal(a.count, form.context.wood.length);
      assert.deepEqual(Array.from(a.array), Array.from(form.context.wood));
      assert.ok(form.context.wood.includes(0) && form.context.wood.includes(1));
    } finally { form.geometry.dispose(); }
    const forms = buildBroadleafDistanceForms(family, 'ultra', variant, contract, toneSharedVegetation);
    const expected = Object.fromEntries(Object.entries(forms).map(([level, geometry]) => [level, Array.from(geometry.getAttribute('vegetationWood').array)]));
    const packed = packConiferDistanceForms(forms);
    try {
      const ranges = vegetationDistanceRanges(packed)!;
      for (const level of ['near', 'middle', 'far'] as const) {
        const range = ranges[level], actual = Array.from({ length: range.count }, (_, i) => packed.getAttribute('vegetationWood').getX(packed.index!.getX(range.start + i)));
        assert.deepEqual(actual, expected[level]);
        assert.ok(actual.includes(0) && actual.includes(1));
      }
    } finally { packed.dispose(); }
    const ordinary = buildBroadleafDistanceForms(family, 'ordinary', variant, contract);
    for (const geometry of Object.values(ordinary)) { assert.equal(geometry.hasAttribute('vegetationWood'), false); geometry.dispose(); }
  });
  test(`${family}/${variant}: mismatched and absent actual semantic corners cannot borrow leaf/wood storage`, () => {
    for (const negative of ['changed', 'missing'] as const) {
      const forms = buildBroadleafDistanceForms(family, 'ultra', variant, SHARED_VEGETATION_CONTRACTS[family], toneSharedVegetation);
      if (negative === 'changed') forms.middle.getAttribute('vegetationWood').setX(0, .5);
      else forms.middle.deleteAttribute('vegetationWood');
      assert.throws(() => packConiferDistanceForms(forms), /bit-identical/);
    }
  });
}
