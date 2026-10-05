/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Prepared once per installed source world; reused through render-tier rebuilds.
 * No GPU/DOM resources and no level or simulation writes. */
import { SURFACES, type MaterialId } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { groundEdgePrice, type GroundEdgePrice } from '../shared/groundEdgePrice.ts';
import { edgeFillForGrid } from './groundBoundary.ts';
import { groundBoundaryPolicy, groundEdgeCapCells, groundDrivableCapCells,
  groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';
import { edgeAssemblyJoinMismatches } from './sharedGroundEdgeAssembly.ts';
import { planSelectiveSharedGroundEdgeAssembly, type SelectiveEdgeAssemblyPlan } from './sharedGroundEdgeSelective.ts';

export interface PreparedGroundEdges {
  readonly source: LevelPlan;
  readonly assembly: SelectiveEdgeAssemblyPlan;
  /** Existing first appearance owner wins; added materials get one batch. */
  readonly materialKeys: ReadonlyMap<MaterialId, string>;
  readonly groupTriangleCounts: ReadonlyMap<string, number>;
  readonly price: GroundEdgePrice;
  readonly joinFailures: ReturnType<typeof edgeAssemblyJoinMismatches>;
}
export function prepareSharedGroundEdges(plan: LevelPlan): PreparedGroundEdges {
  const field = plan.heightfield, drawn = terrainCells(plan).bySurface;
  const cap = groundEdgeCapCells(field.spacing);
  const original = edgeFillForGrid({ columns: field.columns - 1, rows: field.rows - 1, surfaces: field.surfaces }, drawn as ReadonlyMap<SurfaceId, readonly number[]>,
    groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing))),
    groundPrecisePatchMask(plan, groundHazardMask(plan)));
  const contour = withSharedGroundContours(plan, drawn, original);
  const assembly = planSelectiveSharedGroundEdgeAssembly(plan, contour);
  const materialKeys = new Map<MaterialId, string>(), groupTriangleCounts = new Map<string, number>();
  for (const surface of drawn.keys()) {
    const material = SURFACES[surface as SurfaceId].material;
    if (!materialKeys.has(material)) materialKeys.set(material, surface);
    groupTriangleCounts.set(surface, 0);
  }
  for (const material of assembly.report.bandMaterials) {
    if (!materialKeys.has(material)) {
      const key = `edge/${material}`; materialKeys.set(material, key); groupTriangleCounts.set(key, 0);
    }
  }
  let cells = 0, appendedVertices = 0;
  const add = (key: string, triangles: number) => groupTriangleCounts.set(key, (groupTriangleCounts.get(key) ?? 0) + triangles);
  for (const [surface, list] of drawn) for (const cell of list) {
    cells++;
    const fragments = assembly.replacements.get(cell);
    if (!fragments) { add(surface, 2); continue; }
    for (const fragment of fragments) {
      add(fragment.role === 'base' ? surface : materialKeys.get(fragment.appearance)!, 1);
      appendedVertices += 3;
    }
  }
  const indices = [...groupTriangleCounts.values()].reduce((sum, triangles) => sum + triangles * 3, 0);
  const price = groundEdgePrice({ sourceVertices: cells * 4, appendedVertices, sourceIndices: cells * 6, indices,
    sourceDrawGroups: drawn.size, drawGroups: [...groupTriangleCounts.values()].filter(count => count > 0).length });
  return { source: plan, assembly, materialKeys, groupTriangleCounts, price,
    joinFailures: edgeAssemblyJoinMismatches(field, assembly, plan) };
}
