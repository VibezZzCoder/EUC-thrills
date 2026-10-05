/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Retire only a proved isolated legacy paving knee. No source/mesh/material writes. */
import { DataUtils } from 'three';
import { SURFACES } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { edgeSignedDistance, type EdgeFillCell } from './groundBoundary.ts';

interface Interval { from: number; to: number }
interface Grid {
  readonly columns: number; readonly rows: number; readonly surfaces: readonly SurfaceId[];
  readonly visible: Uint8Array; readonly protectedCells: Uint8Array;
  readonly original: ReadonlyMap<number, EdgeFillCell>;
  readonly current: ReadonlyMap<number, EdgeFillCell>;
}
function overlap(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const p of a) for (const q of b) {
    const from = Math.max(p.from, q.from), to = Math.min(p.to, q.to);
    if (from < to) result.push({ from, to });
  }
  return result;
}
function positive(a: number, b: number): Interval[] | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  if (a <= 0 && b <= 0) return [];
  if (a >= 0 && b >= 0) return [{ from: 0, to: 1 }];
  const at = a / (a - b);
  // A crossing rounded onto an endpoint is unproved; never discard its sliver.
  if (!(at > 0 && at < 1)) return null;
  return a > 0 ? [{ from: 0, to: at }] : [{ from: at, to: 1 }];
}
/** Region of brick on an edge, conservatively including both source-double
 * and actual half-float interpolation. No epsilon, sample grid or widened cap.
 * null means uncertainty. Two co-facing half-planes give a connected knee;
 * opposing, rounded or unknown material regions are deliberately unproved.
 */
function brickEdge(grid: Grid, cell: number, x0: number, z0: number, x1: number, z1: number): Interval[] | null {
  const own = SURFACES[grid.surfaces[cell]]?.material, fill = grid.current.get(cell);
  if (own !== 'grass' && own !== 'brick') return null;
  if (!fill) return own === 'brick' ? [{ from: 0, to: 1 }] : [];
  const towards = SURFACES[fill.towards]?.material;
  if (towards !== 'grass' && towards !== 'brick') return null;
  if (own === towards) return own === 'brick' ? [{ from: 0, to: 1 }] : [];
  if ((fill.mode !== 'union' && fill.mode !== 'intersection') || fill.round || fill.lines.length < 1 || fill.lines.length > 2) return null;
  if (fill.lines.length === 2 && fill.lines[0].nx * fill.lines[1].nx
    + fill.lines[0].nz * fill.lines[1].nz <= 0) return null;
  const scale = fill.distanceScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const reverse = own === 'brick';
  const intersection = (fill.mode === 'intersection') !== reverse;
  const result: Interval[] = [];
  for (const packed of [false, true]) {
    let region: Interval[] = intersection ? [{ from: 0, to: 1 }] : [];
    for (const line of fill.lines) {
      if (![line.nx, line.nz, line.d].every(Number.isFinite) || Math.hypot(line.nx, line.nz) === 0) return null;
      let a = edgeSignedDistance(line, x0, z0) * scale, b = edgeSignedDistance(line, x1, z1) * scale;
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 65504 || Math.abs(b) > 65504) return null;
      if (packed) {
        a = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(a));
        b = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(b));
      }
      const next = positive(reverse ? -a : a, reverse ? -b : b);
      if (next === null) return null;
      region = intersection ? overlap(region, next) : [...region, ...next];
    }
    result.push(...region);
  }
  return result;
}

export function isolatedLegacyPavingCells(grid: Grid): ReadonlySet<number> {
  const isolated = new Set<number>();
  // O(original cells), at most four neighboring regions per narrow candidate.
  // Decisions read one immutable final field; deletion cannot cascade.
  for (const [cell, fill] of grid.original) {
    if (grid.current.get(cell) !== fill || fill.pocket !== 'chain' || fill.mode !== 'union'
      || fill.lines.length !== 2 || fill.round || grid.protectedCells[cell] || !grid.visible[cell]
      || SURFACES[grid.surfaces[cell]]?.material !== 'grass'
      || SURFACES[fill.towards]?.material !== 'brick') continue;
    const column = cell % grid.columns, row = Math.floor(cell / grid.columns);
    const source = fill.source, sourceColumn = source % grid.columns, sourceRow = Math.floor(source / grid.columns);
    if (!Number.isInteger(source) || source < 0 || source >= grid.columns * grid.rows
      || Math.abs(sourceColumn - column) !== 1 || Math.abs(sourceRow - row) !== 1
      || grid.surfaces[source] !== fill.towards || !grid.visible[source] || grid.protectedCells[source]) continue;
    const edges = [
      { neighbour: column > 0 ? cell - 1 : -1, x0: column, z0: row, x1: column, z1: row + 1 },
      { neighbour: column + 1 < grid.columns ? cell + 1 : -1, x0: column + 1, z0: row, x1: column + 1, z1: row + 1 },
      { neighbour: row > 0 ? cell - grid.columns : -1, x0: column, z0: row, x1: column + 1, z1: row },
      { neighbour: row + 1 < grid.rows ? cell + grid.columns : -1, x0: column, z0: row + 1, x1: column + 1, z1: row + 1 },
    ];
    let proved = true, paintedEdge = false;
    for (const edge of edges) {
      const own = brickEdge(grid, cell, edge.x0, edge.z0, edge.x1, edge.z1);
      if (own === null) { proved = false; break; }
      if (own.length === 0) continue; // No connection is claimed through this edge.
      paintedEdge = true;
      const neighbour = edge.neighbour;
      if (neighbour < 0 || !grid.visible[neighbour] || grid.protectedCells[neighbour]) { proved = false; break; }
      const other = brickEdge(grid, neighbour, edge.x0, edge.z0, edge.x1, edge.z1);
      if (other === null || overlap(own, other).length > 0) { proved = false; break; }
    }
    if (proved && paintedEdge) isolated.add(cell);
  }
  return isolated;
}
