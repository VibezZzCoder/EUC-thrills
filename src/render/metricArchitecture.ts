/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN. Dwelling source dimensions and conservative area qualification. */
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { nativeEntryWalkArea } from './metricNativeEntryArea.ts';
export { nativeEntrySurfaceAt } from './metricNativeEntryArea.ts';

export interface DwellingSpan { readonly left: number; readonly right: number }
/** Anchor an approximately 6m dwelling at the actual served entry, then fill
 * the original width. Merge a short end remainder into its next dwelling. */
export function dwellingSpans(width: number, anchor: number): readonly DwellingSpan[] {
  if (!(width > 0) || !Number.isFinite(width) || !Number.isFinite(anchor)) throw new Error('Invalid dwelling source span');
  if (width < 12) return [{ left: -width / 2, right: width / 2 }];
  const pitch = 6, left = -width / 2, right = width / 2;
  const centre = Math.max(left + 3, Math.min(right - 3, anchor));
  const cuts = [left, right];
  for (let index = Math.floor((left - centre - 3) / pitch); centre + 3 + index * pitch < right; index++) {
    const cut = centre + 3 + index * pitch; if (cut > left) cuts.push(cut);
  }
  cuts.sort((a, b) => a - b);
  if (cuts[1] - cuts[0] < 3) cuts.splice(1, 1);
  if (cuts[cuts.length - 1] - cuts[cuts.length - 2] < 3) cuts.splice(cuts.length - 2, 1);
  return cuts.slice(1).map((right, index) => ({ left: cuts[index], right }));
}

/** A secondary CLOSED entry needs the entire native source-ground strip,
 * not nine traces. Invalid, malformed, numerically unproved or over-budget
 * areas refuse. The original served entry does not call this function.
 * This authors no paving, walkable volume, opening, collider or plan field. */
export function existingEntryWalkBottom(plan: LevelPlan, origin: Vec3, yaw: number,
  x: number, servedX: number, doorHalfWidth: number): number | null {
  return nativeEntryWalkArea(plan, origin, yaw, x, servedX, doorHalfWidth)?.bottom ?? null;
}
