/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { MaterialId } from '../data/surfaces.ts';

/** The shared array's layer order, and the upper bits of the existing edge
 * byte. Brick uses its existing analytic paving bit and needs no array layer. */
export const SHARED_GROUND_KINDS = Object.freeze([
  'grass', 'dirt', 'gravel', 'pavement', 'roughPavement', 'concrete', 'wood',
] as const);
export type SharedGroundKind = typeof SHARED_GROUND_KINDS[number];
export function sharedGroundCode(material: MaterialId): number {
  return SHARED_GROUND_KINDS.indexOf(material as SharedGroundKind) + 1;
}
