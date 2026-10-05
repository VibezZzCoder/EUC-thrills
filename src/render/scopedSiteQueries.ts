/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The level's protected-site queries, answered once per plan inside one world
 * construction (`constructionScope.ts`). Pricing, admission, metric facade
 * preparation and the terrain build each asked the same immutable plan for the
 * same readonly site lists; outside a scope these are the original functions.
 * Callers only read and spread the returned lists.
 */
import { streetFronts } from '../level/streetFronts.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { districtSites, residentialSites, parkCaseSites, type DistrictSite } from '../level/districtSites.ts';
import { constructionScopeOpen, scopedQuery } from './constructionScope.ts';

export const scopedStreetFronts = scopedQuery(streetFronts);
export const scopedEnvironmentSites = scopedQuery(environmentSites);
export const scopedResidentialSites = scopedQuery(residentialSites);
export const scopedParkCaseSites = scopedQuery(parkCaseSites);

/** `districtSites` is exactly the residential list followed by the park-case
 * list (`level/districtSites.ts`); inside a scope it is composed from the
 * scoped answers so the residential query is not run again. */
export function scopedDistrictSites(plan: Parameters<typeof districtSites>[0]): readonly DistrictSite[] {
  return constructionScopeOpen() ? [...scopedResidentialSites(plan), ...scopedParkCaseSites(plan)] : districtSites(plan);
}
