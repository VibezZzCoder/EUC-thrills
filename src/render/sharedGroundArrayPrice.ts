/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** The common terrain texture owner is outside supplement geometry. Its one
 * seven-layer RGBA8 array is lazily allocated when an installed material can
 * sample a layer. Brick's analytic paving needs no layer of its own.
 */
import type { LevelPlan } from '../level/plan.ts';
import { SHARED_GROUND } from '../data/tuning.ts';
import { SURFACES } from '../data/surfaces.ts';
import { colliderMaterial } from '../level/renderBudget.ts';
import { SHARED_GROUND_KINDS, sharedGroundCode } from './sharedGroundCodes.ts';

export function sharedGroundArrayPrice(plan: LevelPlan): number {
  // terrainCells only skips cells already covered by an identical surround
  // surface. Therefore any source array-kind is installed by the surround or
  // a drawn heightfield material. Blocks independently install their material.
  const sampled = sharedGroundCode(SURFACES[plan.surround.surface].material) > 0
    || plan.heightfield.surfaces.some(surface => sharedGroundCode(SURFACES[surface].material) > 0)
    || plan.segments.some(segment => segment.colliders.some(collider => sharedGroundCode(colliderMaterial(collider)) > 0));
  if (!sampled) return 0;
  let bytes = 0;
  for (let side = SHARED_GROUND.textureSize; side >= 1; side /= 2) bytes += side * side * 4;
  return bytes * SHARED_GROUND_KINDS.length;
}
