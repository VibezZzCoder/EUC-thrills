/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { AuthoredCanopyBuiltReport } from './authoredCanopyOwner.ts';
import type { PropPartId } from '../data/renderCost.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { ENHANCED_PART_COSTS } from './enhancedCatalog.ts';
import type { PresentationRecipe } from './presentation.ts';
import { isUltraRecipe } from './ultra/ultraRecipe.ts';
import { ultraPartTriangles } from './ultra/ultraCost.ts';
import type { BuildRecipe } from './ultra/ultraTypes.ts';
import type { BuiltPresentationCost } from './ultra/ultraRuntime.ts';
import { VEGETATION_FORM_COUNTS, type VegetationFamily } from './vegetationForms.ts';

export interface SharedVegetationFamilyReport {
  readonly part: VegetationFamily;
  readonly instances: number;
  readonly sourceInstances?: number;
  readonly variants: number;
  readonly drawCalls: number;
  readonly shadowDrawCalls: number;
  readonly colourTriangles: number;
  readonly shadowTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  /** Colour alternatives per instance, never summed as simultaneous work.
   * Both near and static-far shadow paths use the accepted near template. */
  readonly distance?: {
    readonly nearTriangles: number;
    readonly middleTriangles: number;
    readonly farTriangles: number;
    readonly shadowDetail: 'near';
  };
}

/** Actual built buffers, separate from the immutable source admission kit. */
export interface SharedVegetationReport {
  readonly recipe: BuildRecipe;
  readonly detail: 'ordinary' | 'ultra';
  readonly families: readonly SharedVegetationFamilyReport[];
  readonly geometryOwners: number;
  readonly materialOwners: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly textures: 0;
  readonly authoredSupports?: readonly AuthoredCanopyBuiltReport[];
  readonly authoredAliasOwners?: number;
  readonly authoredAliases?: readonly { readonly variant: number; readonly nearTriangles: number; readonly middleTriangles: number; readonly farTriangles: number; readonly indexBytes: number }[];
  readonly ordinaryAuthoredTriangleDelta?: number;
  readonly ordinaryBatchDrawDelta?: number;
  readonly authoredSupportRefusals?: readonly { readonly propIndex: number | null; readonly reason: string; readonly detail?: 'ordinary' | 'ultra' }[];
  readonly authoredUnselectedCanopies?: number;
}

function legacyTriangles(part: PropPartId, recipe: BuildRecipe): number {
  return isUltraRecipe(recipe) ? ultraPartTriangles(part, recipe)
    : (recipe.foliage ? ENHANCED_PART_COSTS[part]?.triangles : undefined) ?? PART_COSTS[part].triangles;
}

/** Restate every drawn frame shape. Ultra's hypothetical split/quad demote to
 * the selected ordinary recipe, with ordinary forms and the same variant set.
 * UltraRuntime already measures prop colour; do not add that delta twice. */
export function withSharedVegetationCost<T extends BuiltPresentationCost>(cost: T,
  report: SharedVegetationReport | null, ordinary: PresentationRecipe): T {
  if (!report) return cost;
  let calls = 0, colour = 0, shadow = 0, ordinaryTriangles = 0;
  for (const family of report.families) {
    const legacy = legacyTriangles(family.part, report.recipe) * (family.sourceInstances ?? family.instances);
    calls += family.drawCalls + family.shadowDrawCalls - 2;
    colour += family.colourTriangles - legacy;
    shadow += family.shadowTriangles - legacy;
    ordinaryTriangles += 2 * (VEGETATION_FORM_COUNTS.ordinary[family.part]
      - legacyTriangles(family.part, ordinary)) * (family.sourceInstances ?? family.instances);
  }
  ordinaryTriangles += 2 * (report.ordinaryAuthoredTriangleDelta ?? (report.authoredSupports ?? []).reduce((sum, support) => sum + support.ordinaryTriangleDelta, 0));
  const triangles = colour + shadow;
  const frame = (old: { drawCalls: number; triangles: number }, views: number) => ({
    drawCalls: old.drawCalls + (views === 1 ? calls : report.ordinaryBatchDrawDelta ?? calls) * views,
    triangles: old.triangles + (views === 1 ? triangles : ordinaryTriangles) * views,
  });
  return { ...cost,
    drawCalls: cost.drawCalls + calls,
    triangles: cost.triangles + triangles,
    colourTriangles: cost.colourTriangles + colour,
    shadowTriangles: cost.shadowTriangles + shadow,
    propDrawCalls: cost.propDrawCalls + calls,
    propTriangles: cost.propTriangles + triangles,
    propColourTriangles: cost.propColourTriangles + (isUltraRecipe(report.recipe) ? 0 : colour),
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) },
  };
}
