/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { edgeFillForGrid } from './groundBoundary.ts';
import { groundBoundaryPolicy, groundDrivableCapCells, groundEdgeCapCells,
  groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';
import { edgeAssemblyJoinMismatches, planSharedGroundEdgeAssembly, type EdgeAssemblyPlan } from './sharedGroundEdgeAssembly.ts';
import { SHARED_EDGE_SELECTION, planSelectiveSharedGroundEdgeAssembly } from './sharedGroundEdgeSelective.ts';

// The corner seed's surfaces around the reported shards at (573.5, 111.5) and
// (589.5, 113.5), flattened: one long brick/asphalt kerb run plus scattered
// one- to three-pair urban fragments on a curved sidewalk edge.
const CORNER_SHARDS = [
  '....................BPPPPPPPPPPPPP', '......................PPPPPPPPPPPP', '.....................BBPPPPPPPPPPP',
  '....................BBBPPPPPPPPPPP', 'B..................BBBPPPPPPPPPPPP', 'BBB...............BBBPPPPPPPPPPPPP',
  'PPBBB............BBBPPPPPPPPPPPPPP', 'PPPPBBBB......BBBBPPPPPPPPPPPPPBPP', 'PPPPPPBBBBBBBBBBPPPPPPPPPPPPPPPBB.',
  'PPPPPPPPPPBBPPPPPPPPPPPPPPPPPPPB..', 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPBB..', 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPBB..',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPB...', 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPB...', 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPBB...',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPBB...', 'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPBB...', 'BBPPPPPPPPPPPPPPPPPPPPPPPPPPPPB...',
  'BBBBBPPPPPPPPPPPPBBBPPPPPPPPPPB...', '...BBBBBBBBBBBBBBBBBPPPPPPPPPPBB..',
];
function cornerShards(): LevelPlan {
  const columns = CORNER_SHARDS[0].length, rows = CORNER_SHARDS.length;
  const letter: Record<string, SurfaceId> = { P: 'pavement', B: 'brick', '.': 'grass' };
  return { id: 'corner-shard-window', spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: columns + 1, rows: rows + 1,
      heights: Array((columns + 1) * (rows + 1)).fill(1), surfaces: CORNER_SHARDS.join('').split('').map(ch => letter[ch]) } };
}
/** The prepared world's contour, exactly as sharedGroundEdgePlan builds it. */
function contourFor(plan: LevelPlan) {
  const field = plan.heightfield, drawn = terrainCells(plan).bySurface, cap = groundEdgeCapCells(field.spacing);
  const original = edgeFillForGrid({ columns: field.columns - 1, rows: field.rows - 1, surfaces: field.surfaces },
    drawn as ReadonlyMap<SurfaceId, readonly number[]>,
    groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing))), groundPrecisePatchMask(plan, groundHazardMask(plan)));
  return withSharedGroundContours(plan, drawn, original);
}
/** Eight-connected visible flush-stone runs: cell -> run length. */
function flushRuns(plan: LevelPlan, assembly: EdgeAssemblyPlan, cells: Iterable<number> = assembly.replacements.keys()): Map<number, number> {
  const columns = plan.heightfield.columns - 1, flush = new Set<number>(), run = new Map<number, number>();
  for (const cell of cells) if (assembly.replacements.get(cell)?.some(triangle => triangle.role === 'flush-stone')) flush.add(cell);
  for (const start of flush) {
    if (run.has(start)) continue;
    const members = [start], stack = [start]; run.set(start, 0);
    while (stack.length) {
      const cell = stack.pop()!, row = Math.floor(cell / columns), column = cell % columns;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const next = (row + dz) * columns + column + dx;
        if (column + dx >= 0 && column + dx < columns && flush.has(next) && !run.has(next)) { run.set(next, 0); members.push(next); stack.push(next); }
      }
    }
    for (const cell of members) run.set(cell, members.length);
  }
  return run;
}

// 2026-10-03, VIS-4: tiny disconnected flush-stone kerb fragments read as pale shards.
const MINIMUM_RUN = 6;
test('short urban kerb fragments are restored whole; the long kerb run stays byte-identical', () => {
  const plan = cornerShards(), before = JSON.stringify(plan), contour = contourFor(plan);
  const raw = planSharedGroundEdgeAssembly(plan, contour), selected = planSelectiveSharedGroundEdgeAssembly(plan, contour);
  const report = selected.report;
  assert.equal(report.selectionRefusal, null);
  assert.equal(edgeAssemblyJoinMismatches(plan.heightfield, selected, plan).length, 0);
  assert.equal(report.selectionMaximumPasses, SHARED_EDGE_SELECTION.maximumPasses, 'no extra pass or retreat loop');
  // Control: the join-safe raw construction carries short flush runs.
  const rawRuns = flushRuns(plan, raw);
  const shortRaw = [...rawRuns].filter(([, length]) => length < MINIMUM_RUN);
  assert.ok(shortRaw.length >= 6, 'control: the window reproduces the scattered shards');
  const finalRuns = flushRuns(plan, selected);
  assert.ok(finalRuns.size >= MINIMUM_RUN, 'the long kerb run survives');
  for (const [cell, length] of finalRuns) {
    assert.ok(length >= MINIMUM_RUN, `no visible flush fragment shorter than the minimum at ${cell}`);
  }
  assert.ok(report.shortUrbanRunComponents >= 5, 'short all-urban components are rejected as whole components');
  assert.equal(SHARED_EDGE_SELECTION.minimumUrbanRunCells, MINIMUM_RUN);
  // Every surviving source cell keeps exactly its first-pass construction.
  for (const [cell, triangles] of selected.replacements) assert.deepEqual(triangles, raw.replacements.get(cell), `cell ${cell}`);
  assert.equal(report.componentBoundaryFailures.length, 0);
  assert.equal(JSON.stringify(plan), before, 'render-only selection; plan data untouched');
});

test('a one-pass request and a world of only long kerbs keep the old selection', () => {
  const plan = cornerShards(), contour = contourFor(plan);
  const single = planSelectiveSharedGroundEdgeAssembly(plan, contour, { maximumPasses: 1 });
  assert.equal(single.report.shortUrbanRunComponents, 0);
  // A clean 1:4 diagonal sidewalk edge: one long run, no joins, no suppression.
  const diagonal = cornerShards(), columns = 34;
  diagonal.heightfield = { ...diagonal.heightfield, surfaces: Array.from({ length: columns * 20 }, (_, cell) =>
    Math.floor(cell / columns) >= 4 + Math.floor((cell % columns) / 4) ? 'brick' : 'pavement') };
  const long = planSelectiveSharedGroundEdgeAssembly(diagonal, contourFor(diagonal));
  assert.equal(long.report.selectionRefusal, null);
  assert.equal(long.report.shortUrbanRunComponents, 0);
  assert.equal(long.report.selectedPairs, long.report.originalCandidatePairs, 'every long-run pair kept');
});
