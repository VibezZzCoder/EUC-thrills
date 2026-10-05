/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SHARED_GROUND } from '../data/tuning.ts';
import { SURFACES, materialAppearance } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { COURSE_MOTTLE, groundTint, linearFromSrgbHex, type GroundTint } from './groundNoise.ts';
import { fillTint } from './groundBoundary.ts';
import { Color } from 'three';

const profile = { ...COURSE_MOTTLE, cellWeight: SHARED_GROUND.cellWeight,
  midWeight: SHARED_GROUND.midWeight, coarseWeight: SHARED_GROUND.coarseWeight };

/** Evaluate both materials at the SAME world corner. A neighbour's first
 * corner repeated over a whole filled cell leaves rectangular tone steps.
 * Source heights, topology and physical surfaces remain the plan's. */
export function createSharedBoundaryTint(plan: LevelPlan):
  (own: SurfaceId, towards: SurfaceId, column: number, row: number, out: GroundTint) => void {
  const field = plan.heightfield;
  const looks = new Map(Object.entries(SURFACES).map(([surface, spec]) => {
    const appearance = materialAppearance(spec.material), base = { r: 1, g: 1, b: 1 };
    linearFromSrgbHex(plan.palette?.[appearance.id] ?? appearance.albedo, base);
    // The mottle's historical authoring convention is a 2.2 power; the
    // material itself is decoded by Three's piecewise sRGB conversion. Use
    // the actual material colour for the fill ratio, or adjacent regions
    // disagree even when they evaluate the same world corner.
    const material = new Color(plan.palette?.[appearance.id] ?? appearance.albedo);
    return [surface as SurfaceId, { appearance, base, material }] as const;
  }));
  const ownTint = { r: 1, g: 1, b: 1 }, targetTint = { r: 1, g: 1, b: 1 };
  return (own, towards, column, row, out) => {
    const x = field.originX + column * field.spacing, z = field.originZ + row * field.spacing;
    const a = looks.get(own)!, b = looks.get(towards)!;
    groundTint(column, row, x, z, a.appearance.mottle, a.base, profile, ownTint);
    groundTint(column, row, x, z, b.appearance.mottle, b.base, profile, targetTint);
    fillTint(a.material, ownTint, b.material, targetTint, out);
  };
}
