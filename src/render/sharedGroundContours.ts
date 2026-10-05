/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared, symmetric material contours on the unchanged heightfield triangles.
 * A fill-only half-cell cap cannot straighten a 1:3 staircase: it is forced to
 * leave a knee at every riser. These contours may move to either side of the
 * sampled seam, within half a cell / 0.75 m. The physical surface never moves.
 * Uses the existing line/tint/material attributes, with no GPU allocation.
 */
import { GROUND_BOUNDARY } from '../data/tuning.ts';
import { SURFACES, materialAppearance, type MaterialId } from '../data/surfaces.ts';
import type { GroundSurfacePatch, LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { tautString, type EdgeFillCell, type EdgeFillField, type EdgeLine } from './groundBoundary.ts';
import { exactPavingDrawsPatch } from './exactPavingOwnership.ts';
import { isolatedLegacyPavingCells } from './legacyPavingIsolation.ts';
import { GROUND_EDGE_RANKS, groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';
import { sharedShoulderCells, withSharedStraightShoulders } from './sharedStraightShoulders.ts';

interface Node { level: number; band: SurfaceId; lower: SurfaceId }
interface Frame {
  width: number;
  cell(j: number, r: number): number;
  line(a: number, b: number, c: number): EdgeLine;
}
interface ContourClaim { cell: EdgeFillCell; length: number; pair: string; owner: number }
interface ContourOwner {
  readonly id: number;
  readonly expectedPairs: number;
  readonly pairs: { readonly lower: number; readonly band: number; readonly deeper: number;
    readonly lowerSurface: SurfaceId; readonly bandSurface: SurfaceId }[];
}

export interface SharedContourReport {
  /** Actual reconstructed taut contours and the columns / rows they span. */
  readonly contours: number;
  readonly spanCells: number;
  readonly replacedCells: number;
  /** Incompatible two-material contours at a junction retain the old treatment. */
  readonly conflictingCells: number;
  /** Superseded second-cell legacy claims retired by complete accepted owners. */
  readonly retiredLegacyCells: number;
  /** Independently proved isolated two-line legacy paving knees. */
  readonly retiredIsolatedLegacyCells: number;
}
export type SharedContourField = EdgeFillField & { readonly sharedContours: SharedContourReport };

/** Hazards and precise physical fragments without an exact opaque render stay
 * excluded. Street and warehouse-bay paving is drawn from its unchanged
 * triangles, at a negative polygon offset, so recolouring its hidden substrate
 * cannot alter the path's visible coverage. This avoids whole-cell holes
 * around a narrow exact walk.
 * Never borrow the patch's surface as the coarse cell's material.
 */
export function sharedContourMask(plan: LevelPlan): Uint8Array {
  const excluded = groundHazardMask(plan);
  for (const patch of plan.groundSurfacePatches ?? []) {
    if (exactPavingDrawsPatch(patch)) continue;
    for (const triangle of patch.triangles) excluded[triangle.cell] = 1;
  }
  return excluded;
}

/** Cells whose retained legacy fill is still deleted. A living-world traffic
 * court on a sidewalk or lawn is deliberately left undrawn, so the player sees
 * the coarse cell there and its original fill stays, as before the court
 * existed (2026-10-03, VIS-2: deleting it left 1 m stairs around every traffic
 * court on Ultra). It still builds no new contour: a chain through it would
 * move the seams of the long kerbs beside it. */
function sharedFallbackMask(plan: LevelPlan): Uint8Array {
  const excluded = groundHazardMask(plan), surfaces = plan.heightfield.surfaces;
  for (const patch of plan.groundSurfacePatches ?? []) {
    if (exactPavingDrawsPatch(patch)) continue;
    const coarseLook = livingCourtKeepsCoarseLook(patch);
    for (const triangle of patch.triangles) {
      if (!coarseLook || surfaces[triangle.cell] !== patch.sourceSurface) excluded[triangle.cell] = 1;
    }
  }
  return excluded;
}

/** Undrawn, physics-only living-world fragments on a ranked source cell
 * (brick, grass, ...). Rank-zero surfaces such as wood stay ineligible. */
function livingCourtKeepsCoarseLook(patch: GroundSurfacePatch): boolean {
  if (!patch.id.startsWith('living-ground/') || patch.sourceSurface === undefined) return false;
  const source = SURFACES[patch.sourceSurface]?.material, target = SURFACES[patch.surface]?.material;
  return source !== undefined && (GROUND_EDGE_RANKS[source] ?? 0) > 0
    && (target === 'pavement' || target === 'roughPavement');
}

/** Both sides of a pair must use the same metre-scale shoulder. A brick/dirt
 * material's wider natural shoulder cannot meet an asphalt material's narrow
 * shoulder across a cell seam. Packing scales the distance, not the line.
 */
export function sharedContourDistanceScale(own: MaterialId, other: MaterialId, spacing: number): number {
  const ownWidth = sharedShoulderCells(own, spacing), otherWidth = sharedShoulderCells(other, spacing);
  const pairWidth = Math.min(ownWidth, otherWidth);
  return pairWidth > 0 ? ownWidth / pairWidth : 1;
}

export function withSharedGroundContours(plan: LevelPlan,
  drawn: ReadonlyMap<string, readonly number[]>, original: EdgeFillField): SharedContourField {
  const field = plan.heightfield, columns = field.columns - 1, rows = field.rows - 1;
  const visible = new Uint8Array(columns * rows), excluded = sharedContourMask(plan);
  for (const cells of drawn.values()) for (const cell of cells) visible[cell] = 1;
  const material = (cell: number) => SURFACES[field.surfaces[cell]].material;
  const eligible = (cell: number) => cell >= 0 && cell < visible.length && visible[cell] === 1
    && excluded[cell] === 0 && (GROUND_EDGE_RANKS[material(cell)] ?? 0) > 0;
  const beats = (b: number, a: number) => {
    const bm = material(b), am = material(a), br = GROUND_EDGE_RANKS[bm] ?? 0, ar = GROUND_EDGE_RANKS[am] ?? 0;
    return bm !== am && (br > ar || (br === ar
      && materialAppearance(bm).encroach > materialAppearance(am).encroach));
  };
  const frames: readonly Frame[] = [
    { width: columns, cell: (j, r) => r * columns + j,
      line: (a, b, c) => ({ nx: a, nz: b, d: -c }) },
    { width: columns, cell: (j, r) => (rows - 1 - r) * columns + j,
      line: (a, b, c) => ({ nx: a, nz: -b, d: -(b * rows + c) }) },
    { width: rows, cell: (j, r) => j * columns + r,
      line: (a, b, c) => ({ nx: b, nz: a, d: -c }) },
    { width: rows, cell: (j, r) => j * columns + columns - 1 - r,
      line: (a, b, c) => ({ nx: -b, nz: a, d: -(b * columns + c) }) },
  ];
  const nodes: Node[][][] = frames.map(frame => Array.from({ length: frame.width }, () => []));
  for (const cells of drawn.values()) for (const cell of cells) {
    if (!eligible(cell)) continue;
    const row = Math.floor(cell / columns), column = cell % columns;
    for (let f = 0; f < 4; f++) {
      const x = column + (f === 2 ? 1 : f === 3 ? -1 : 0);
      const z = row + (f === 0 ? 1 : f === 1 ? -1 : 0);
      if (x < 0 || z < 0 || x >= columns || z >= rows) continue;
      const neighbour = z * columns + x;
      if (!eligible(neighbour) || !beats(neighbour, cell)) continue;
      const j = f < 2 ? column : row;
      const level = f === 0 ? row + 1 : f === 1 ? rows - row : f === 2 ? column + 1 : columns - column;
      nodes[f][j].push({ level, band: field.surfaces[neighbour], lower: field.surfaces[cell] });
    }
  }
  const claims = new Map<number, ContourClaim>(), conflicts = new Set<number>();
  const owners: ContourOwner[] = [];
  let contours = 0, spanCells = 0;
  const pairOf = (node: Node) => [SURFACES[node.band].material, SURFACES[node.lower].material].sort().join('/');
  const cap = Math.min(0.5, GROUND_BOUNDARY.capMetres / field.spacing);
  for (const [f, frame] of frames.entries()) {
    const bands = nodes[f];
    for (const column of bands) column.sort((a, b) => a.level - b.level || a.band.localeCompare(b.band) || a.lower.localeCompare(b.lower));
    const link = (j: number, index: number, step: -1 | 1) => {
      if (j + step < 0 || j + step >= frame.width) return -1;
      const node = bands[j][index], pair = pairOf(node);
      let found = -1;
      for (const [k, next] of bands[j + step].entries()) {
        if (next.band !== node.band || next.lower !== node.lower || pairOf(next) !== pair || Math.abs(next.level - node.level) > 1) continue;
        if (found >= 0) return -1;
        found = k;
      }
      return found;
    };
    const visited = bands.map(column => new Uint8Array(column.length));
    for (let j = 0; j < frame.width; j++) for (let at = 0; at < bands[j].length; at++) {
      if (visited[j][at]) continue;
      const back = link(j, at, -1);
      if (back >= 0 && link(j - 1, back, 1) === at) continue;
      const chain: Node[] = [];
      let column = j, index = at;
      for (;;) {
        visited[column][index] = 1; chain.push(bands[column][index]);
        const next = link(column, index, 1);
        if (next < 0 || link(column + 1, next, -1) !== index || visited[column + 1][next]) break;
        column++; index = next;
      }
      if (chain.length < 2) continue;
      const x = Array.from({ length: chain.length + 1 }, (_, k) => j + k);
      const lo: number[] = [chain[0].level], hi: number[] = [chain[0].level];
      let feasible = true;
      for (let k = 1; k < chain.length; k++) {
        lo.push(Math.max(chain[k - 1].level, chain[k].level) - cap);
        hi.push(Math.min(chain[k - 1].level, chain[k].level) + cap);
        if (lo[k] > hi[k]) feasible = false;
      }
      if (!feasible) continue; // Larger cells keep their existing bounded treatment.
      lo.push(chain.at(-1)!.level); hi.push(chain.at(-1)!.level);
      const z = tautString(x, lo, hi);
      const owner: ContourOwner = { id: owners.length, expectedPairs: chain.length, pairs: [] };
      owners.push(owner);
      contours++; spanCells += chain.length;
      for (let k = 0; k < chain.length; k++) {
        const node = chain[k], slope = z[k + 1] - z[k], length = Math.hypot(1, slope);
        const line = frame.line(-slope / length, 1 / length, (slope * (j + k) - z[k]) / length);
        const lower = frame.cell(j + k, node.level - 1), band = frame.cell(j + k, node.level);
        if (!eligible(lower) || !eligible(band)) continue;
        const pair = pairOf(node);
        owner.pairs.push({ lower, band, deeper: node.level >= 2 ? frame.cell(j + k, node.level - 2) : -1,
          lowerSurface: node.lower, bandSurface: node.band });
        stamp(lower, band, line, chain.length, pair, owner.id);
        stamp(band, lower, { nx: -line.nx, nz: -line.nz, d: -line.d }, chain.length, pair, owner.id);
      }
    }
  }
  function stamp(cell: number, source: number, line: EdgeLine, length: number, pair: string, owner: number): void {
    const prior = claims.get(cell);
    if (prior && prior.pair !== pair) { conflicts.add(cell); return; }
    if (prior && prior.cell.lines[0].nx * line.nx + prior.cell.lines[0].nz * line.nz < 0) {
      // Opposing sides of a one-cell feature cannot share one half-plane.
      // Keep the original feature rather than erase or paint it one-sided.
      conflicts.add(cell); return;
    }
    if (prior && prior.length >= length) return;
    claims.set(cell, { length, pair, owner, cell: { lines: [line], mode: 'union', towards: field.surfaces[source], source,
      pocket: 'chain', distanceScale: sharedContourDistanceScale(material(cell), material(source), field.spacing) } });
  }
  // Retain isolated source features and unresolved junctions. New contours
  // replace both cells along their paired seam; the old line cannot remain
  // underneath and reintroduce the very triangle this path straightens.
  const fallback = withSharedStraightShoulders(plan, drawn, original), cells = new Map(fallback.cells);
  const fallbackExcluded = sharedFallbackMask(plan);
  for (const [cell, fill] of cells) if (fallbackExcluded[cell] || fallbackExcluded[fill.source]) cells.delete(cell);
  // The legacy fill-only chain can reach a second lower cell at a riser.
  // The symmetric half-cell contour owns only the immediate source pair:
  // retaining that older deeper claim leaves a detached paving triangle.
  // Retire it only for an ENTIRE owner whose reciprocal pairs survived final
  // arbitration. Conflicted, partial and unowned chains retain their fallback.
  let retiredLegacyCells = 0;
  for (const owner of owners) {
    const accepted = owner.pairs.length === owner.expectedPairs && owner.pairs.every(pair => {
      const lower = claims.get(pair.lower), band = claims.get(pair.band);
      return !conflicts.has(pair.lower) && !conflicts.has(pair.band)
        && lower?.owner === owner.id && band?.owner === owner.id
        && lower.cell.source === pair.band && band.cell.source === pair.lower;
    });
    if (!accepted) continue;
    const bandSources = new Set(owner.pairs.map(pair => pair.band));
    for (const pair of owner.pairs) {
      const cell = pair.deeper, fallbackFill = cells.get(cell);
      // Exact original-object ownership excludes new straight shoulders and
      // chamfers. Explicit source ids and a source in this owner exclude an
      // unrelated nearby feature even when its material pair happens to match.
      if (cell < 0 || !fallbackFill || fallbackFill !== original.cells.get(cell)
        || fallbackFill.pocket !== 'chain' || claims.has(cell)
        || field.surfaces[cell] !== pair.lowerSurface || fallbackFill.towards !== pair.bandSurface
        || !bandSources.has(fallbackFill.source)) continue;
      cells.delete(cell); retiredLegacyCells++;
    }
  }
  let replacedCells = 0;
  for (const [cell, claim] of claims) {
    if (conflicts.has(cell)) continue;
    cells.set(cell, claim.cell); replacedCells++;
  }
  const isolationProtected = groundPrecisePatchMask(plan, groundHazardMask(plan));
  for (const cell of conflicts) isolationProtected[cell] = 1;
  const isolated = isolatedLegacyPavingCells({ columns, rows, surfaces: field.surfaces, visible,
    protectedCells: isolationProtected, original: original.cells, current: cells });
  for (const cell of isolated) cells.delete(cell);
  const pockets = { chain: 0, chamfer: 0 };
  let lines = 0;
  for (const fill of cells.values()) { pockets[fill.pocket]++; lines += fill.lines.length; }
  return { ...fallback, cells, lines, pockets,
    // These are construction counters: both legacy and symmetric taut paths
    // were constructed. sharedContours states the new work separately.
    chains: fallback.chains + contours, chainCells: fallback.chainCells + spanCells,
    dropped: fallback.dropped + conflicts.size,
    sharedContours: { contours, spanCells, replacedCells, conflictingCells: conflicts.size, retiredLegacyCells, retiredIsolatedLegacyCells: isolated.size } };
}
