/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Conservative source-band dependencies, before terminal treatment.
 * No source mutation, fragment selection, GPU allocation or tolerance waiver. */
import type { Heightfield } from '../level/plan.ts';
import { SHARED_EDGE_ASSEMBLY, type EdgeAssemblySourceSeam } from './sharedGroundEdgeAssembly.ts';

export const sharedEdgePairId = (a: number, b: number) => `${Math.min(a, b)}/${Math.max(a, b)}`;
export interface SharedEdgeComponent {
  /** Stable minimum source-pair ID in numerical source-cell order. */
  readonly id: string;
  readonly pairIds: readonly string[];
}
export interface SharedEdgeComponents {
  readonly components: readonly SharedEdgeComponent[];
  readonly ownerByCell: ReadonlyMap<number, string>;
  readonly componentByPair: ReadonlyMap<string, string>;
  /** Each cardinal boundary is inspected once, including zero-support ones. */
  readonly inspectedBoundaries: number;
  readonly dependencyBoundaries: number;
}

/** Is there any positive-length potential non-base band on this complete
 * physical cell edge? Distance and natural width are affine along the edge,
 * exactly as the authoritative corner planes in the original constructor.
 * Patch subtraction and terminal taper only remove support, so ignoring them
 * is conservative. Closed band-plane boundaries may overconnect components;
 * they never authorize a geometric join or change the strict checker. */
export function sourceBandCanReachEdge(field: Heightfield, seam: EdgeAssemblySourceSeam,
  direction: 'x' | 'z', bound: number, origin: number): boolean {
  const scale = Math.max(Math.abs(seam.line.nx), Math.abs(seam.line.nz));
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid accepted source-band normal');
  const point = (along: number) => direction === 'x' ? { x: bound, z: along } : { x: along, z: bound };
  const p = point(origin), q = point(origin + field.spacing);
  const distance = ({ x, z }: { x: number; z: number }) => (seam.line.nx * x + seam.line.nz * z - seam.line.d) / scale;
  const width = ({ x, z }: { x: number; z: number }) => seam.profile === 'urban'
    ? SHARED_EDGE_ASSEMBLY.flushStoneMetres
    : SHARED_EDGE_ASSEMBLY.wornShoulderMetres + SHARED_EDGE_ASSEMBLY.naturalWidthVariationMetres * Math.sin(x * 0.37 + z * 0.29);
  const d0 = distance(p), d1 = distance(q), w0 = width(p), w1 = width(q);
  if (![d0, d1, w0, w1].every(Number.isFinite)) throw new Error('Invalid accepted source-band endpoint');
  // Intersect affine half-planes f(t)>=0 on t in [0,1]. No sampling, offset,
  // arbitrary length threshold or contact/geometry epsilon is introduced.
  const positiveLength = (planes: readonly (readonly [number, number])[]) => {
    let from = 0, to = 1;
    for (const [a, b] of planes) {
      if (a < 0 && b < 0) return false;
      if (a < 0) from = Math.max(from, a / (a - b));
      else if (b < 0) to = Math.min(to, a / (a - b));
    }
    return to > from;
  };
  const positive = positiveLength([[d0, d1], [w0 - d0, w1 - d1]]);
  const negative = seam.profile !== 'trail' && positiveLength([
    [d0 + SHARED_EDGE_ASSEMBLY.drainageMetres, d1 + SHARED_EDGE_ASSEMBLY.drainageMetres], [-d0, -d1],
  ]);
  return positive || negative;
}

/** Two owners depend on each other when either original band can reach their
 * common cardinal source edge. Removal could otherwise add a terminal plane
 * to a survivor and move a different endpoint farther down the same run.
 * At most two forward cardinal boundaries per owned cell; no all-pairs scan. */
export function sharedEdgeSourceComponents(field: Heightfield, seams: readonly EdgeAssemblySourceSeam[]): SharedEdgeComponents {
  const ordered = [...seams].sort((a, b) => Math.min(a.a, a.b) - Math.min(b.a, b.b) || Math.max(a.a, a.b) - Math.max(b.a, b.b));
  const byId = new Map<string, EdgeAssemblySourceSeam>(), ownerByCell = new Map<number, string>();
  const parent = ordered.map((_, index) => index), rank = ordered.map(() => 0), indexById = new Map<string, number>();
  for (const [index, seam] of ordered.entries()) {
    const id = sharedEdgePairId(seam.a, seam.b);
    if (byId.has(id) || ownerByCell.has(seam.a) || ownerByCell.has(seam.b)) throw new Error('Source components require unique whole reciprocal owners');
    byId.set(id, seam); indexById.set(id, index); ownerByCell.set(seam.a, id); ownerByCell.set(seam.b, id);
  }
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) at = parent[at];
    while (parent[index] !== index) { const next = parent[index]; parent[index] = at; index = next; }
    return at;
  };
  const join = (a: number, b: number) => {
    a = root(a); b = root(b); if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a]++;
  };
  const columns = field.columns - 1, rows = field.rows - 1;
  let inspectedBoundaries = 0, dependencyBoundaries = 0;
  for (const [cell, first] of ownerByCell) {
    const row = Math.floor(cell / columns), column = cell % columns;
    for (const direction of ['x', 'z'] as const) {
      if (direction === 'x' ? column + 1 >= columns : row + 1 >= rows) continue;
      const neighbor = cell + (direction === 'x' ? 1 : columns), second = ownerByCell.get(neighbor);
      if (!second) continue;
      inspectedBoundaries++;
      if (first === second) continue; // Both cells already have one indivisible owner.
      const bound = direction === 'x' ? field.originX + (column + 1) * field.spacing : field.originZ + (row + 1) * field.spacing;
      const origin = direction === 'x' ? field.originZ + row * field.spacing : field.originX + column * field.spacing;
      if (!sourceBandCanReachEdge(field, byId.get(first)!, direction, bound, origin)
        && !sourceBandCanReachEdge(field, byId.get(second)!, direction, bound, origin)) continue;
      dependencyBoundaries++; join(indexById.get(first)!, indexById.get(second)!);
    }
  }
  const groups = new Map<number, string[]>();
  for (const [id, index] of indexById) { const at = root(index), list = groups.get(at); if (list) list.push(id); else groups.set(at, [id]); }
  const components = [...groups.values()].map(pairIds => ({ id: pairIds[0], pairIds }));
  // Lists are accumulated in numeric pair order, so the first member names
  // the stable component even when union-by-rank chose another internal root.
  components.sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!);
  const componentByPair = new Map<string, string>();
  for (const component of components) for (const id of component.pairIds) componentByPair.set(id, component.id);
  return { components, ownerByCell, componentByPair, inspectedBoundaries, dependencyBoundaries };
}
