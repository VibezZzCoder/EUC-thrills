/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Existing source topology callbacks; this helper allocates no render resource. */
import type { BuildRecipe } from './ultra/ultraTypes.ts';
import { colliderTriangles } from './wallCourses.ts';
import { ultraColliderTriangles } from './ultra/ultraBlocks.ts';
import { priceFeatureBlocks, type PreparedFeatureBlocks, type FeatureBlockPrice } from './featureBlockPlan.ts';

export function priceFeatureBlockBuild(prepared: PreparedFeatureBlocks, recipe: BuildRecipe): FeatureBlockPrice {
  const kit = 'ultra' in recipe ? recipe.ultra : null;
  return priceFeatureBlocks(prepared, (collider, material) => kit
    ? ultraColliderTriangles(collider, material, kit)
    : recipe.walls ? colliderTriangles(collider, material) : 12,
  kit?.blocks === true, kit?.farShadow === true);
}
