/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SurfaceId } from '../simulation/world.ts';
import type { EdgeFillCell } from './groundBoundary.ts';
import { isolatedLegacyPavingCells } from './legacyPavingIsolation.ts';
function fixture() {
  const surfaces: SurfaceId[] = Array(9).fill('grass'); surfaces[2] = 'brick';
  const fill: EdgeFillCell = { source: 2, towards: 'brick', pocket: 'chain', mode: 'union',
    lines: [{ nx: 0.6, nz: -0.8, d: 0.1 }, { nx: Math.SQRT1_2, nz: -Math.SQRT1_2, d: 0.1 }] };
  return { columns: 3, rows: 3, surfaces, visible: new Uint8Array(9).fill(1), protectedCells: new Uint8Array(9),
    original: new Map([[4, fill]]), current: new Map([[4, fill]]) };
}
test('a diagonal legacy union without a positive-length source connection is isolated', () => {
  const grid = fixture(), before = JSON.stringify([...grid.current]);
  assert.equal(isolatedLegacyPavingCells(grid).has(4), true);
  grid.visible[3] = 0;
  assert.equal(isolatedLegacyPavingCells(grid).has(4), true, 'unpainted west edge supplies no absence-based evidence');
  assert.equal(JSON.stringify([...grid.current]), before, 'classification never mutates its input');
});
test('supported corners and an arbitrarily narrow represented connection retain exact fallback', () => {
  const grid = fixture(); grid.surfaces[5] = 'brick';
  assert.equal(isolatedLegacyPavingCells(grid).has(4), false, 'physical brick meets the painted east edge');
  grid.surfaces[5] = 'grass';
  grid.current.set(1, { source: 2, towards: 'brick', pocket: 'chain', mode: 'union',
    lines: [{ nx: 1, nz: 0, d: 2 - 2 ** -40 }] });
  assert.equal(isolatedLegacyPavingCells(grid).has(4), false, 'no epsilon erases the narrow north-edge connection');
});
test('missing painted-edge data, protected cells and uncertain encoding cannot authorize deletion', () => {
  for (const mutate of [
    (g: ReturnType<typeof fixture>) => { g.visible[1] = 0; },
    (g: ReturnType<typeof fixture>) => { g.protectedCells[1] = 1; },
    (g: ReturnType<typeof fixture>) => { g.protectedCells[2] = 1; },
    (g: ReturnType<typeof fixture>) => { g.protectedCells[4] = 1; },
    (g: ReturnType<typeof fixture>) => { g.current.set(1, { ...g.current.get(4)!, round: true }); },
    (g: ReturnType<typeof fixture>) => { const f = { ...g.current.get(4)!, distanceScale: NaN }; g.current.set(4, f); g.original.set(4, f); },
  ]) { const grid = fixture(); mutate(grid); assert.equal(isolatedLegacyPavingCells(grid).has(4), false); }
});
test('new owners, one-line fallback and chamfers are outside the isolated legacy contract', () => {
  for (const kind of ['new', 'single', 'chamfer'] as const) {
    const grid = fixture(), old = grid.current.get(4)!;
    const changed = kind === 'single' ? { ...old, lines: old.lines.slice(0, 1) }
      : kind === 'chamfer' ? { ...old, pocket: 'chamfer' as const } : { ...old };
    grid.current.set(4, changed); if (kind !== 'new') grid.original.set(4, changed);
    assert.equal(isolatedLegacyPavingCells(grid).has(4), false);
  }
});
