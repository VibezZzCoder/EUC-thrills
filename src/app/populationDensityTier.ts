/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 (docs/PLANS.md §47.2–47.3): which density roster the effective quality
 * tier rides. Pure and headless; `app/Game.ts` gathers the facts and hands the
 * chosen roster (`level/populationDensity.ts:populationRoster`) to every
 * consumer. `level/` and `simulation/` never see a tier or an option: they
 * receive a roster, which is plain prepared data (AGENTS invariant 5's
 * structural rule holds; the M47 amendment is that the effective ordinary tier
 * chooses which prepared actors exist, and nothing else physical).
 *
 *   - Low → 'base' (living-r1 exactly: the same plan object as before M47);
 *   - Medium → 'medium';
 *   - High → 'high', and Ultra draws over High, so Ultra → 'high' too;
 *   - three or four seats (the 2×2 grid) ride at most 'medium': the four-pane
 *     High frame already spends ~9–10 ms rendering on the M1 (§47.1). The
 *     threshold is the vegetation's own couch threshold, read from tuning.
 */
import { VEGETATION_COUCH_DETAIL } from '../data/tuning.ts';
import type { PopulationDensityTier } from '../level/populationDensity.ts';
import type { OrdinaryQuality } from './options.ts';

/** A production roster: the living-r1 base, or a density layer over it. */
export type PopulationRosterLayer = 'base' | PopulationDensityTier;

/** The roster an effective ordinary tier draws with `seatCount` seated riders. */
export function densityLayerFor(ordinary: OrdinaryQuality, seatCount = 1): PopulationRosterLayer {
  const layer: PopulationRosterLayer = ordinary === 'low' ? 'base' : ordinary === 'medium' ? 'medium' : 'high';
  return layer === 'high' && seatCount >= VEGETATION_COUCH_DETAIL.minimumPanes ? 'medium' : layer;
}

