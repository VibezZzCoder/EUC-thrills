/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SHARED_GROUND } from '../data/tuning.ts';
import type { FeatureBlockPlan } from './featureBlockPlan.ts';

/** Use the one source-support qualifier prepared before geometry and price.
 * Existing top/side multipliers stay root-owned. The takeoff band is relative
 * to the existing earth top and lies exactly on the original top face.
 */
export function featureBlockTone(feature: FeatureBlockPlan | null,
  normalY: number, heightFraction: number, topBand = false): number {
  if (!feature) return 1;
  const rule = SHARED_GROUND.feature;
  if (normalY > 0) return feature.material === 'dirt'
    ? rule.earthTop * (topBand ? rule.takeoffBandRelativeReflectance : 1) : rule.timberTop;
  if (normalY < 0) return 1;
  return rule.sideFoot + (rule.sideLip - rule.sideFoot) * heightFraction;
}
