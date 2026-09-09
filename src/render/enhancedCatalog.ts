/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The enhanced presentation's part prices — measured, never authored.
 *
 * `data/renderCost.ts:PART_COSTS` prices the baseline kit and is *admission
 * data*: `level/renderBudget.ts` reads it to decide whether a generated route
 * is accepted, so a richer crown priced there would change which layout a
 * seed produces. This catalogue is the same shape for the same part buckets
 * and lives under `render/` on purpose: nothing in `level/`, `simulation/` or
 * `data/` may import it (`src/architecture.test.ts`), so the richer geometry
 * can only ever be chosen *after* a plan is immutable
 * (`render/presentation.ts`).
 *
 * Only the parts the enhanced recipe rebuilds appear. Every other part is the
 * baseline geometry at the baseline price, and `render/presentation.test.ts`
 * asserts both halves of that sentence against a kit built with the recipe.
 *
 * **Nothing below is hand-maintained.** `node tools/render-cost.mjs --write`
 * regenerates every figure from the built enhanced kit, and the test fails if
 * the file and the geometry ever disagree. The two fields of each entry sit on
 * one line and nothing may come between them: the regenerator rewrites the
 * line with one pattern that spells the whole entry out.
 */
import type { PartCost, PropPartId } from '../data/renderCost.ts';

export const ENHANCED_PART_COSTS: Readonly<Partial<Record<PropPartId, PartCost>>> = Object.freeze({
  crown: { triangles: 80, castsShadow: true },
  coniferFoliage: { triangles: 48, castsShadow: true },
});

/** The parts the enhanced recipe rebuilds, in catalogue order. */
export const ENHANCED_PART_IDS: readonly PropPartId[] = Object.freeze(
  Object.keys(ENHANCED_PART_COSTS) as PropPartId[],
);
