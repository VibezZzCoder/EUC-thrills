/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Presentation recipes — richer environment art chosen *after* generation.
 *
 * The environment pass of 2026-09-08 wanted trees that read as vegetation and
 * near walls that read as masonry, and the audit that scoped it found two
 * couplings that made "just improve the geometry" a gameplay change:
 *
 * - `data/props.ts` dimensions are placement data, so the richer geometry has
 *   to live inside the existing envelopes (`render/foliageKit.ts` asserts it).
 * - `data/renderCost.ts:PART_COSTS` is admission data: `level/renderBudget.ts`
 *   prices a generated route with it and `level/routeValidator.ts` rejects a
 *   breach, so pricing a richer crown there changes which layout a seed
 *   accepts. A finite corpus of unchanged seeds could never prove otherwise.
 *
 * So the plan is never re-priced. Generation and admission run exactly as
 * before on the baseline catalogue, the `LevelPlan` becomes immutable, and
 * only then does this file ask a presentation question: *does the enhanced
 * topology fit every contract this plan will be drawn under?* If it does, the
 * renderer builds the enhanced kit; if it does not, it builds the baseline
 * topology with the same improved colour and facade art. It never rerolls,
 * trims, moves, adds or removes anything the plan says.
 *
 * **The one-way boundary is structural, not a habit.** This file and
 * `render/enhancedCatalog.ts` sit under `render/`, which `level/`,
 * `simulation/` and `data/` cannot import (`src/architecture.test.ts`), so the
 * enhanced prices have no path back into admission whatever any seed does.
 *
 * **Selected once per installed world.** `Renderer.setLevel` chooses against
 * the solo, two-view and four-view contracts at once, with every non-level
 * reserve and shadows counted, and keeps that answer while seats join and
 * leave and the camera moves. There is no per-view LOD, no popping, and no
 * second quality system: `setQuality` still changes only pixels and shadows.
 *
 * **The average-per-prop guard is not a selection rule here.** `PROP_BUDGET`'s
 * 60 colour triangles per prop is asserted on the slice in
 * `render/props.test.ts` where it was calibrated (for both recipes), not
 * promoted into a gate on generated worlds whose mix of buildings, fences and
 * trees moves that average without describing GPU cost.
 */
import {
  NON_LEVEL_RESERVE,
  PART_COSTS,
  QUAD_NON_LEVEL_RESERVE,
  QUAD_PASSES,
  RENDER_BUDGET,
  RENDER_BUDGET_QUAD,
  RENDER_BUDGET_SPLIT,
  SPLIT_NON_LEVEL_RESERVE,
  SPLIT_PASSES,
  type PropPartId,
} from '../data/renderCost.ts';
import { PROP_BUDGET } from '../data/props.ts';
import { colliderMaterial, planRenderCost, type RenderCost } from '../level/renderBudget.ts';
import type { LevelPlan } from '../level/plan.ts';
import { ENHANCED_PART_COSTS } from './enhancedCatalog.ts';
import { colliderTriangles } from './wallCourses.ts';

export type PresentationRecipeId = 'baseline' | 'enhanced';

export interface PresentationRecipe {
  readonly id: PresentationRecipeId;
  /** Enhanced crown and conifer geometry in the same part buckets. */
  readonly foliage: boolean;
  /** Running-bond coursing on the stone walls (`render/wallCourses.ts`). */
  readonly walls: boolean;
}

/** The topology every world was admitted with. Always buildable. */
export const BASELINE_PRESENTATION: PresentationRecipe = Object.freeze({
  id: 'baseline',
  foliage: false,
  walls: false,
});

/** The richer topology, built only where the contracts say it fits. */
export const ENHANCED_PRESENTATION: PresentationRecipe = Object.freeze({
  id: 'enhanced',
  foliage: true,
  walls: true,
});

/** Richest first. `selectPresentation` takes the first that fits. */
export const PRESENTATION_LADDER: readonly PresentationRecipe[] = Object.freeze([
  ENHANCED_PRESENTATION,
  BASELINE_PRESENTATION,
]);

export function presentationRecipe(id: PresentationRecipeId): PresentationRecipe {
  return id === 'enhanced' ? ENHANCED_PRESENTATION : BASELINE_PRESENTATION;
}

/**
 * What a plan costs under a recipe, on the same terms as
 * `level/renderBudget.ts` — colour and shadow passes, frustum culling ignored.
 */
export interface PresentationCost {
  readonly recipe: PresentationRecipeId;
  /** Level draw calls, colour and shadow. Identical across recipes. */
  readonly drawCalls: number;
  /** Level triangles, colour and shadow. */
  readonly triangles: number;
  readonly colourTriangles: number;
  readonly shadowTriangles: number;
  /** The prop family alone, colour and shadow — what `PROP_BUDGET` bounds. */
  readonly propDrawCalls: number;
  readonly propTriangles: number;
  readonly propColourTriangles: number;
  /** The collider blocks alone, colour pass. */
  readonly blockColourTriangles: number;
  /** The three frame shapes, reserves included. */
  readonly frame: {
    readonly solo: RenderCost;
    readonly split: RenderCost;
    readonly quad: RenderCost;
  };
}

/**
 * Price a plan under a recipe: the baseline model plus the measured per-part
 * deltas times instances times passes, plus the coursed walls.
 *
 * The baseline arithmetic is `planRenderCost` itself rather than a copy, so a
 * baseline `PresentationCost` is that function's answer restated —
 * `render/presentation.test.ts` pins the restatement to `frameRenderCost` and
 * the two split verdicts.
 */
export function presentationCost(plan: LevelPlan, recipe: PresentationRecipe): PresentationCost {
  const base = planRenderCost(plan);

  let propDrawCalls = 0;
  let propColour = 0;
  let propShadow = 0;
  for (const [part, count] of base.partInstances) {
    const baseline = PART_COSTS[part];
    const enhanced = recipe.foliage ? ENHANCED_PART_COSTS[part as PropPartId] : undefined;
    if (enhanced !== undefined && enhanced.castsShadow !== baseline.castsShadow) {
      throw new Error(`enhanced ${part} changes its shadow flag; the catalogue may only reprice`);
    }
    const triangles = (enhanced?.triangles ?? baseline.triangles) * count;
    propDrawCalls += baseline.castsShadow ? 2 : 1;
    propColour += triangles;
    if (baseline.castsShadow) propShadow += triangles;
  }

  let baselineBlocks = 0;
  let blocks = 0;
  for (const segment of plan.segments) {
    for (const collider of segment.colliders) {
      baselineBlocks += 12;
      blocks += recipe.walls ? colliderTriangles(collider, colliderMaterial(collider)) : 12;
    }
  }

  // Everything the recipe does not touch is the model's own figure; the
  // deltas ride on top. Blocks cast, so a coursed wall is charged twice.
  const baselinePropColour = propColourOf(base.partInstances);
  const colourTriangles = base.colourTriangles
    + (propColour - baselinePropColour)
    + (blocks - baselineBlocks);
  const shadowTriangles = base.shadowTriangles
    + (propShadow - propShadowOf(base.partInstances))
    + (blocks - baselineBlocks);
  const triangles = colourTriangles + shadowTriangles;
  const drawCalls = base.drawCalls;

  return {
    recipe: recipe.id,
    drawCalls,
    triangles,
    colourTriangles,
    shadowTriangles,
    propDrawCalls,
    propTriangles: propColour + propShadow,
    propColourTriangles: propColour,
    blockColourTriangles: blocks,
    frame: {
      solo: {
        drawCalls: drawCalls + NON_LEVEL_RESERVE.drawCalls,
        triangles: triangles + NON_LEVEL_RESERVE.triangles,
      },
      split: {
        drawCalls: (drawCalls + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES,
        triangles: (triangles + SPLIT_NON_LEVEL_RESERVE.triangles) * SPLIT_PASSES,
      },
      quad: {
        drawCalls: (drawCalls + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES,
        triangles: (triangles + QUAD_NON_LEVEL_RESERVE.triangles) * QUAD_PASSES,
      },
    },
  };
}

function propColourOf(instances: ReadonlyMap<PropPartId, number>): number {
  let total = 0;
  for (const [part, count] of instances) total += PART_COSTS[part].triangles * count;
  return total;
}

function propShadowOf(instances: ReadonlyMap<PropPartId, number>): number {
  let total = 0;
  for (const [part, count] of instances) {
    if (PART_COSTS[part].castsShadow) total += PART_COSTS[part].triangles * count;
  }
  return total;
}

export interface PresentationVerdict {
  readonly recipe: PresentationRecipeId;
  readonly cost: PresentationCost;
  /** Empty when the recipe fits every declared limit. */
  readonly breaches: readonly string[];
}

/**
 * Judge one recipe against the declared limits: the prop family's own
 * ceilings and all three frame contracts, reserves included.
 *
 * Worded for the diagnostics panel and a generation report, like
 * `withinRenderBudget`'s reasons: a person reading them decides whether a
 * world fell back because of its trees or because of its walls.
 */
export function judgePresentation(plan: LevelPlan, recipe: PresentationRecipe): PresentationVerdict {
  const cost = presentationCost(plan, recipe);
  const breaches: string[] = [];
  const over = (what: string, value: number, ceiling: number): void => {
    if (value > ceiling) breaches.push(`${value} ${what} against a ceiling of ${ceiling}`);
  };
  over('prop draw calls', cost.propDrawCalls, PROP_BUDGET.maxDrawCalls);
  over('prop triangles (shadows included)', cost.propTriangles, PROP_BUDGET.maxTriangles);
  over('solo draw calls', cost.frame.solo.drawCalls, RENDER_BUDGET.maxDrawCalls);
  over('solo triangles', cost.frame.solo.triangles, RENDER_BUDGET.maxTriangles);
  over('split draw calls', cost.frame.split.drawCalls, RENDER_BUDGET_SPLIT.maxDrawCalls);
  over('split triangles', cost.frame.split.triangles, RENDER_BUDGET_SPLIT.maxTriangles);
  over('quad draw calls', cost.frame.quad.drawCalls, RENDER_BUDGET_QUAD.maxDrawCalls);
  over('quad triangles', cost.frame.quad.triangles, RENDER_BUDGET_QUAD.maxTriangles);
  return { recipe: recipe.id, cost, breaches };
}

export interface PresentationSelection {
  readonly recipe: PresentationRecipe;
  readonly cost: PresentationCost;
  /** Every rung of the ladder, richest first, with why it was or was not taken. */
  readonly verdicts: readonly PresentationVerdict[];
}

/**
 * The recipe an installed world is drawn with.
 *
 * Walks `PRESENTATION_LADDER` and takes the first recipe with no breach. The
 * baseline rung is taken whatever its verdict says: it is the representation
 * the plan was admitted with, and a world is never trimmed to fit its art.
 */
export function selectPresentation(plan: LevelPlan): PresentationSelection {
  const verdicts = PRESENTATION_LADDER.map((recipe) => judgePresentation(plan, recipe));
  for (let index = 0; index < verdicts.length; index += 1) {
    const recipe = PRESENTATION_LADDER[index];
    const verdict = verdicts[index];
    if (verdict.breaches.length === 0 || recipe.id === 'baseline') {
      return { recipe, cost: verdict.cost, verdicts };
    }
  }
  // Unreachable while the ladder ends in the baseline, which is a contract
  // `render/presentation.test.ts` pins.
  throw new Error('the presentation ladder has no baseline rung');
}
