/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Which precise ground patches the exact street paving owner draws opaque.
 * Pure id/surface rules with no GPU or DOM resources, so the paving owner,
 * the shared-contour planning modules and browser pins share one definition. */
import type { GroundSurfacePatch } from '../level/plan.ts';

const WAREHOUSE_BAY = /^living-ground\/warehouse-\d+\/bay-[^/]+\//;

/** A living-world warehouse parking bay or its driveway that turns lawn into
 * pavement. Physics rides it as pavement, so it is drawn paved. Traffic turn
 * courts are not: their vehicle-sweep outlines are cell-clipped crescents that
 * read as glitches drawn on a lawn, so they keep the coarse cell's grass or
 * brick (2026-10-03, VIS-1 review). */
export function livingPavingPatch(patch: GroundSurfacePatch): boolean {
  return patch.sourceSurface === 'grass' && patch.surface === 'pavement' && WAREHOUSE_BAY.test(patch.id);
}

/** Every precise patch the exact paving owner draws opaque. */
export function exactPavingDrawsPatch(patch: GroundSurfacePatch): boolean {
  return patch.id.startsWith('street-') || livingPavingPatch(patch);
}
