/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure continuous clearance proof for a late reaction against an already sealed body.
 * Normal NPC chronology/contactSkin is unchanged. A skin-sized uncertain pad
 * cannot by itself reject a physically clear late response: narrow the SAME
 * trajectory certificate until a whole interval prunes or the bounded proof
 * budget declines admission. Point samples never authorize clearance. */
import { POPULATION as R } from '../data/tuning.ts';
import { sweepPopulationHulls, type PopulationFootprint } from './population.ts';
import type { PopulationCompoundTrajectory } from './populationCompound.ts';
const inflate = (body: PopulationFootprint, pad: number): PopulationFootprint => ({ ...body,
  halfWidthMetres: body.halfWidthMetres + pad, halfLengthMetres: body.halfLengthMetres + pad,
  minY: body.minY - pad, maxY: body.maxY + pad,
  ...(body.sourceHull ? { sourceHull: { ...body.sourceHull, marginMetres: (body.sourceHull.marginMetres ?? 0) + pad } } : {}) });
/** Search nodes a late-reaction admission may still spend, shared by its proofs. */
export interface ReactionProofBudget { remaining: number }
export function certifiedReactionTrajectoryClear(component: PopulationCompoundTrajectory, blocker: PopulationFootprint,
  budget: ReactionProofBudget = { remaining: Infinity }): boolean {
  const touches = (body: PopulationFootprint) => sweepPopulationHulls(body, body, blocker, blocker) !== null;
  // A bounded proof (CP-1, 2026-10-03): an exhausted budget declines, which
  // every live admission caller already treats as "keep the exact start".
  const search = (low: number, high: number, depth: number): boolean => {
    if (!(budget.remaining-- > 0)) return false;
    const first = component.at(low), last = component.at(high), pad = component.intervalEnvelopeMetres(low, high);
    if (!Number.isFinite(pad) || pad < 0) throw new RangeError('Late reaction requires a finite nonnegative interval certificate');
    // Exact point contacts can deny immediately; they never prove clearance.
    if (touches(first) || touches(last)) return false;
    if (Math.abs(last.headingY - first.headingY) >= Math.PI) {
      if (depth >= R.sweepMaximumSubdivisionDepth) return false;
      const middle = (low + high) / 2; return search(low, middle, depth + 1) && search(middle, high, depth + 1);
    }
    const possible = sweepPopulationHulls(inflate(first, pad), inflate(last, pad), blocker, blocker);
    if (!possible) return true; // This WHOLE interval is excluded by its supplied bound.
    // Within the sweep's resolution its own linear sweep decides (R2C-6, 2026-10-04).
    if (pad <= R.sweepResolutionMetres) return sweepPopulationHulls(first, last, blocker, blocker) === null;
    if (pad === 0 || depth >= R.sweepMaximumSubdivisionDepth) return false;
    const middle = (low + high) / 2;
    return search(low, middle, depth + 1) && search(middle, high, depth + 1);
  };
  return search(0, 1, 0);
}
