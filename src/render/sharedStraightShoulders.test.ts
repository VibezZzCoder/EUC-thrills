/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import { edgeSignedDistance, type EdgeFillCell, type EdgeFillField } from './groundBoundary.ts';
import { sharedShoulderCells, withSharedStraightShoulders } from './sharedStraightShoulders.ts';

function fixture(): LevelPlan {
  return { id: 'straight-interface', spawn: { position: { x: 8, y: 0, z: 8 }, headingY: 0 },
    surround: { surface: 'grass', height: 0 }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing: 2, columns: 4, rows: 3,
      heights: Array(12).fill(0), surfaces: ['dirt', 'pavement', 'pavement', 'dirt', 'pavement', 'pavement'] } };
}
const drawn = new Map([['dirt', [0, 3]], ['pavement', [1, 2, 4, 5]]]);
function empty(): EdgeFillField {
  return { cells: new Map(), lines: 0, capCells: 0.5, drivableCapCells: 0.5,
    pockets: { chain: 0, chamfer: 0 }, chains: 0, chainCells: 0, dropped: 0 };
}

test('straight source interfaces gain a bounded shoulder matching the neighbour at the join', () => {
  const plan = fixture(), digest = planDigest(plan), old = empty();
  assert.equal(old.cells.has(1), false, 'known-bad empty straight-interface field leaves a hard cut');
  const field = withSharedStraightShoulders(plan, drawn, old), shoulder = field.cells.get(1)!;
  assert.ok(shoulder); assert.equal(shoulder.towards, 'dirt'); assert.equal(shoulder.source, 0);
  assert.equal(field.cells.has(0), false, 'the higher-priority source keeps its own material');
  assert.equal(field.cells.has(2), false, 'the road interior is untouched');
  const width = sharedShoulderCells('pavement', plan.heightfield.spacing);
  const cover = (x: number) => Math.max(0, Math.min(1,
    edgeSignedDistance(shoulder.lines[0], x, 0.5) / width + 0.5));
  assert.ok(Math.abs(cover(1) - 1) < 1e-12, 'the join meets the unchanged source colour');
  assert.ok(Math.abs(cover(1 + width / 2) - 0.5) < 1e-12);
  assert.equal(cover(1 + width + 1e-8), 0, 'the fade stays on the target side');
  assert.equal(planDigest(plan), digest, 'no physical surface, height or plan identity changes');
});

test('precise source fragments and hazards refuse straight shoulders on either side', () => {
  const source = fixture();
  source.groundSurfacePatches = [{ id: 'precise', surface: 'brick', triangles: [{ cell: 0,
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, { x: 2, y: 0, z: 0 }] }] }];
  assert.equal(withSharedStraightShoulders(source, drawn, empty()).cells.has(1), false);
  const target = fixture(); target.hazards = [{ id: 'spill', kind: 'spill',
    centre: { x: 2.5, y: 0, z: 0.5 }, radius: 0.3 }];
  assert.equal(withSharedStraightShoulders(target, drawn, empty()).cells.has(1), false);
  assert.ok(sharedShoulderCells('dirt', 0.25) <= 0.45, 'small cells keep an untouched interior');
});

test('existing curved boundary decisions are preserved rather than repainted by neighbour cells', () => {
  const existing: EdgeFillCell = { lines: [{ nx: -1, nz: 0, d: -0.9 }], mode: 'union',
    towards: 'dirt', source: 0, pocket: 'chain' };
  const old = { ...empty(), cells: new Map([[1, existing]]) };
  assert.equal(withSharedStraightShoulders(fixture(), drawn, old).cells.get(1), existing);
});
