/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** UNRUN candidate regression controls. Root owns imports and execution. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import { GROUND_BOUNDARY } from '../data/tuning.ts';
import { edgeCovers } from './groundBoundary.ts';
import { ordinaryBoundaryField } from './ordinaryGroundBoundary.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';

function mixedStaircase(spacing = 1): LevelPlan {
  // A regular 1:3 staircase never exposes the retained second-cell claim.
  // This real 1:1/1:2 knee leaves a small legacy paving triangle in cell 2/10.
  const levels = [10, 11, 12, 13, 13], columns = levels.length, rows = 17;
  return { id: 'mixed-shared-contour-owner',
    spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing, columns: columns + 1, rows: rows + 1,
      // Non-coplanar native cells prove the arithmetic does not flatten or
      // reconstruct source heights to repair a material-only ownership bug.
      heights: Array.from({ length: (columns + 1) * (rows + 1) }, (_, at) =>
        1 + (at % (columns + 1)) * 0.031 + Math.floor(at / (columns + 1)) * 0.017
          + (at % 3 === 0 ? 0.1 : 0)),
      surfaces: Array.from({ length: columns * rows }, (_, cell) =>
        Math.floor(cell / columns) >= levels[cell % columns] ? 'brick' : 'grass') } };
}
const fieldSnapshot = (field: ReturnType<typeof ordinaryBoundaryField>) =>
  JSON.stringify({ ...field, cells: [...field.cells] });

test('a complete mixed 1:1/1:2 contour retires its detached deeper legacy triangle', () => {
  const plan = mixedStaircase(), source = JSON.stringify(plan);
  const heights = plan.heightfield.heights, surfaces = plan.heightfield.surfaces;
  const drawn = terrainCells(plan).bySurface, legacy = ordinaryBoundaryField(plan, drawn);
  const originalField = fieldSnapshot(legacy), orphan = 10 * 5 + 2;
  const old = legacy.cells.get(orphan);
  assert.ok(old, 'known-bad original field must actually contain the second-cell claim');
  assert.equal(old.pocket, 'chain'); assert.equal(old.towards, 'brick');
  assert.equal(edgeCovers(old, 2.1, 10.95, GROUND_BOUNDARY.kneeRoundCells), true,
    'known-bad control must paint the detached brick triangle before the repair');
  const current = withSharedGroundContours(plan, drawn, legacy);
  assert.equal(current.cells.has(orphan), false,
    'the accepted complete owner cannot retain its older deeper claim');
  assert.ok(current.sharedContours.retiredLegacyCells > 0);
  assert.equal(current.cells.get(11 * 5 + 2)?.towards, 'brick',
    'the immediate grass pair still carries the connected paved contour');
  assert.equal(current.cells.get(12 * 5 + 2)?.towards, 'grass',
    'the physical brick pair still carries its opposite shared contour');
  assert.equal(current.lines, [...current.cells.values()].reduce((sum, fill) => sum + fill.lines.length, 0));
  assert.equal(current.pockets.chain + current.pockets.chamfer, current.cells.size);
  assert.equal(fieldSnapshot(legacy), originalField, 'the supplied original fallback remains byte-exact');
  assert.equal(JSON.stringify(plan), source, 'all physical source data stay exact');
  assert.equal(plan.heightfield.heights, heights); assert.equal(plan.heightfield.surfaces, surfaces);
});

test('an infeasible shared contour preserves every original fallback owner', () => {
  const plan = mixedStaircase(2), source = JSON.stringify(plan);
  const drawn = terrainCells(plan).bySurface, legacy = ordinaryBoundaryField(plan, drawn);
  const originalField = fieldSnapshot(legacy);
  assert.ok(legacy.cells.size > 0, 'the rejected symmetric corridor must have a meaningful fallback');
  const current = withSharedGroundContours(plan, drawn, legacy);
  assert.equal(current.sharedContours.contours, 0, '0.75 m / 2 m cannot join a unit riser symmetrically');
  assert.equal(current.sharedContours.retiredLegacyCells, 0);
  for (const [cell, fill] of legacy.cells) assert.equal(current.cells.get(cell), fill,
    `rejected shared owner keeps exact original claim ${cell}`);
  assert.equal(fieldSnapshot(legacy), originalField); assert.equal(JSON.stringify(plan), source);
});

test('an unowned legacy claim is not erased by a nearby accepted material pair', () => {
  const plan = mixedStaircase(), drawn = terrainCells(plan).bySurface;
  const original = ordinaryBoundaryField(plan, drawn), cells = new Map(original.cells);
  const cell = 2 * 5 + 2, source = 14 * 5 + 4;
  const unowned = { lines: [{ nx: 0, nz: 1, d: 2.8 }], mode: 'union' as const,
    towards: 'brick' as const, source, pocket: 'chain' as const };
  cells.set(cell, unowned);
  const legacy = { ...original, cells, lines: [...cells.values()].reduce((sum, fill) => sum + fill.lines.length, 0),
    pockets: { chain: [...cells.values()].filter(fill => fill.pocket === 'chain').length,
      chamfer: [...cells.values()].filter(fill => fill.pocket === 'chamfer').length } };
  const before = fieldSnapshot(legacy), current = withSharedGroundContours(plan, drawn, legacy);
  assert.ok(current.sharedContours.retiredLegacyCells > 0, 'the accepted nearby repair still runs');
  assert.equal(current.cells.get(cell), unowned,
    'matching material ids do not grant an unrelated original claim to this owner');
  assert.equal(fieldSnapshot(legacy), before);
});

test('opposing contours of a thin brick feature retain the conflicted owner fallback', () => {
  const originalPlan = mixedStaircase(), levels = [10, 11, 12, 13, 13];
  const plan = { ...originalPlan, heightfield: { ...originalPlan.heightfield,
    surfaces: originalPlan.heightfield.surfaces.map((_, cell) =>
      Math.floor(cell / 5) === levels[cell % 5] ? 'brick' as const : 'grass' as const) } };
  const drawn = terrainCells(plan).bySurface, legacy = ordinaryBoundaryField(plan, drawn);
  const before = fieldSnapshot(legacy), current = withSharedGroundContours(plan, drawn, legacy);
  const orphan = 10 * 5 + 2, old = legacy.cells.get(orphan);
  assert.ok(old, 'the thin feature must exercise a real older second-cell fallback');
  assert.ok(current.sharedContours.conflictingCells > 0, 'opposing shared ownership must actually conflict');
  assert.equal(current.sharedContours.retiredLegacyCells, 0,
    'an incomplete/conflicted owner cannot authorize legacy cleanup');
  assert.equal(current.cells.get(orphan), old, 'the rejected owner retains its original deeper claim');
  assert.equal(fieldSnapshot(legacy), before);
});
