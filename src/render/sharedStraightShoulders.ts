/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared albedo shoulders on straight source interfaces that need no legacy
 * staircase fill. Reuses the existing two-line/tint attributes and samplers;
 * physical cells, triangle planes and protected ground remain authoritative. */
import { SHARED_GROUND } from '../data/tuning.ts';
import { SURFACES, materialAppearance, type MaterialId } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { EdgeFillField, EdgeLine } from './groundBoundary.ts';
import { GROUND_EDGE_RANKS, groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';

export function sharedShoulderCells(material: MaterialId, spacing: number): number {
  const width = SHARED_GROUND.shoulderMetres
    * (material === 'pavement' || material === 'roughPavement' ? SHARED_GROUND.pavedShoulderShare : 1);
  return Math.min(width / spacing, 0.45);
}

export function withSharedStraightShoulders(plan: LevelPlan, drawn: ReadonlyMap<string, readonly number[]>,
  original: EdgeFillField): EdgeFillField {
  const field = plan.heightfield, columns = field.columns - 1, rows = field.rows - 1;
  const visible = new Set([...drawn.values()].flat()), excluded = groundPrecisePatchMask(plan, groundHazardMask(plan));
  const cells = new Map(original.cells);
  let added = 0, lines = 0;
  for (const cell of visible) {
    if (excluded[cell] || cells.has(cell)) continue;
    const material = SURFACES[field.surfaces[cell]].material, rank = GROUND_EDGE_RANKS[material];
    if (rank === undefined) continue;
    const row = Math.floor(cell / columns), column = cell % columns, width = sharedShoulderCells(material, field.spacing);
    const candidates: { target: SurfaceId; source: number; line: EdgeLine; rank: number; encroach: number }[] = [];
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = column + dx, z = row + dz;
      if (x < 0 || z < 0 || x >= columns || z >= rows) continue;
      const source = z * columns + x, target = field.surfaces[source], targetMaterial = SURFACES[target].material;
      const targetRank = GROUND_EDGE_RANKS[targetMaterial], encroach = materialAppearance(targetMaterial).encroach;
      if (!visible.has(source) || excluded[source] || targetMaterial === material || targetRank === undefined
        || targetRank < rank || (targetRank === rank && encroach <= materialAppearance(material).encroach)) continue;
      const boundary = dx < 0 ? -column : dx > 0 ? column + 1 : dz < 0 ? -row : row + 1;
      candidates.push({ target, source, rank: targetRank, encroach,
        line: { nx: dx, nz: dz, d: boundary - width / 2 } });
    }
    candidates.sort((a, b) => b.rank - a.rank || b.encroach - a.encroach || a.source - b.source);
    const first = candidates[0]; if (!first) continue;
    const matching = candidates.filter(item => item.target === first.target).slice(0, 2);
    cells.set(cell, { lines: matching.map(item => item.line), mode: 'union', towards: first.target,
      source: first.source, pocket: 'chain' });
    added++; lines += matching.length;
  }
  return added ? { ...original, cells, lines: original.lines + lines,
    pockets: { ...original.pockets, chain: original.pockets.chain + added } } : original;
}
