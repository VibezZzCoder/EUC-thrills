/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 (docs/PLANS.md §47.3): the population the renderer prices, and the
 * rosters it agrees to draw. No three, so it is testable headlessly.
 *
 * **Pricing is the superset; the drawn roster is the tier's.** `setLevel`
 * receives the prepared plan (the living-r1 base carrying its density layer)
 * and prices the High roster, the largest any tier can draw (Ultra draws
 * High). The presentation recipe, ground-edge admission, environment
 * supplements, launch pads and Ultra admission are therefore judged once per
 * world and stay valid at every tier. `setPopulation` then draws the active
 * tier's roster, which must come from that same prepared plan.
 *
 * A world without a density layer (every hand-built venue) prices and draws
 * its one plan: `populationRoster` returns the plan itself for every layer.
 */
import { populationRoster } from '../level/populationDensity.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';

/** The density layer every world is priced at: the largest roster any tier draws. */
export const PRICED_POPULATION_LAYER = 'high' as const;

/** The roster the renderer prices for a prepared plan, or for any roster of one (it resolves to its base). */
export function pricedPopulationRoster(plan: PopulationPlan): PopulationPlan;
export function pricedPopulationRoster(plan: PopulationPlan | null): PopulationPlan | null;
export function pricedPopulationRoster(plan: PopulationPlan | null): PopulationPlan | null {
  return plan === null ? null : populationRoster(plan, PRICED_POPULATION_LAYER);
}

/**
 * Whether the renderer may draw `roster` after pricing `priced`: the priced
 * plan itself, or a roster derived from the same prepared plan, which shares
 * its `paths` array by reference and whose every actor the priced roster
 * holds. Anything else (another world's plan, a second preparation of this
 * one, an actor the price never counted, a missing population) is refused.
 */
export function populationRosterAdmitted(priced: PopulationPlan | null, roster: PopulationPlan | null): boolean {
  if (roster === priced) return true;
  if (roster === null || priced === null || roster.paths !== priced.paths) return false;
  const counted = new Set(priced.actors.map(actor => actor.id));
  return roster.actors.every(actor => counted.has(actor.id));
}
