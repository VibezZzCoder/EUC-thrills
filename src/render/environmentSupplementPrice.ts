/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Complete render-owned supplements prepared before presentation selection.
 * No geometry, material, texture or actor allocation, and no source-world write.
 * Submission prices use the full installed near template (culling ignored).
 * Ordinary 1/2/4 panes each pay once per pane; Ultra stays solo.
 */
import { prepareAuthoredCanopies, type AuthoredCanopyRequest, type PreparedAuthoredCanopies } from './authoredCanopyOwner.ts';
import { prepareFeatureBlocks, type PreparedFeatureBlocks, type FeatureBlockPrice } from './featureBlockPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import { PART_COSTS, type PropPartId } from '../data/renderCost.ts';
import { ENVIRONMENT_VEGETATION as RULES } from '../data/tuning.ts';
import { districtExteriorSites, type DistrictExteriorSite } from './districtExteriorSites.ts';
import { scopedEnvironmentSites as environmentSites, scopedParkCaseSites as parkCaseSites,
  scopedResidentialSites as residentialSites, scopedStreetFronts as streetFronts } from './scopedSiteQueries.ts';
import { prepareEnvironmentVegetation, type PreparedEnvironmentVegetation } from './environmentVegetationPlan.ts';
import { countPopulation, type SupplementCount } from './populationPrice.ts';
import { collectStreetLifePieces, countStreetLifeDecor } from './streetLifePieces.ts';
import { collectEnvironmentDecorPieces, countEnvironmentDecor } from './environmentDecorPieces.ts';
import { collectDistrictDecorPieces, countDistrictDecor } from './districtDecorPieces.ts';
import { prepareVegetationPrice, priceVegetation, type PreparedVegetationPrice, type VegetationFamilyPrice } from './sharedVegetationPricePlan.ts';
import { prepareOriginalCapSlots, priceOriginalCapSlots, type PreparedOriginalCapSlots } from './originalCapSlotPrice.ts';
import { sharedGroundArrayPrice } from './sharedGroundArrayPrice.ts';
import type { PresentationCost } from './presentation.ts';
import { prepareMetricFacades, metricSourcePrice, type PreparedMetricFacades, type MetricFacadeRequest } from './metricFacadePreparation.ts';
import { prepareVisualWayfinding, type VisualWayfinding } from './wayfinding.ts';
import { EMPTY_SPATIAL_BATCHING_DELTA, exteriorSpatialBatchKey, priceGenericPropSpatialBatching,
  sumSpatialBatchingDeltas, validateSpatialBatchMetres, type SpatialBatchingDelta } from './spatialBatching.ts';

export interface SupplementPassPolicy {
  readonly nearCasts: (part: PropPartId) => boolean;
  readonly buildings: boolean;
  readonly farShadow: boolean;
  /** Ordinary resources after an earlier Ultra selection still hold the cached capacity. */
  readonly grassUltraCached?: boolean;
}
export interface EnvironmentSupplementPrice extends SupplementCount {
  /** Static layer supplements only; dynamic population never joins far. */
  readonly farShadowDraws: number;
  readonly farShadowTriangles: number;
  /** Original cap bucket is repeated once when any cap closes a slot. */
  readonly capFarExtraDraws: number;
  readonly capFarExtraTriangles: number;
  readonly capSlotBytes: number;
  /** Terrain texture, kept OUTSIDE resourceBytes to preserve its one owner. */
  readonly sharedGroundArrayBytes: number;
  readonly vegetationFamilies: readonly VegetationFamilyPrice[];
  /** Replacement of the plan's original one bucket per vegetation part. */
  readonly propDrawDelta: number;
  readonly propColourDelta: number;
  readonly propShadowDelta: number;
  readonly resourceBytes: number;
  /** Source proxy attributes belong to terrain, not common supplement buffers. */
  readonly metricProxyBytes?: number;
  readonly metricCommonBytes?: number;
  /** Already included in original Ultra colour totals, never debited. */
  readonly metricDiscardedColourTriangles?: number;
  readonly featureCommonBytes?: number;
  /** Already in terrain attributes and their reservation; never add twice. */
  readonly featureAoBytes?: number;
}
export interface PreparedEnvironmentSupplements {
  readonly source: LevelPlan;
  readonly populationPlan: PopulationPlan | null;
  readonly grass: PreparedEnvironmentVegetation;
  readonly exterior: readonly DistrictExteriorSite[];
  readonly street: ReturnType<typeof collectStreetLifePieces>;
  readonly environment: ReturnType<typeof collectEnvironmentDecorPieces>;
  readonly district: ReturnType<typeof collectDistrictDecorPieces>;
  readonly population: SupplementCount;
  readonly metric: PreparedMetricFacades;
  readonly featureBlocks: PreparedFeatureBlocks;
  readonly vegetationPrice: PreparedVegetationPrice;
  readonly authoredCanopies: PreparedAuthoredCanopies;
  readonly capSlots: PreparedOriginalCapSlots;
  /** Final-plan visual runs merged into the pre-existing markings owner. */
  readonly wayfinding: VisualWayfinding;
  readonly disposed: boolean;
  dispose(): void;
}
export function prepareEnvironmentSupplements(plan: LevelPlan, population: PopulationPlan | null = null,
  metricRequest: MetricFacadeRequest = {}, authoredRequest: AuthoredCanopyRequest = {}): PreparedEnvironmentSupplements {
  const authoredCanopies = prepareAuthoredCanopies(plan, authoredRequest);
  const metric = prepareMetricFacades(plan, metricRequest), vegetationPrice = prepareVegetationPrice(plan, authoredCanopies), capSlots = prepareOriginalCapSlots(plan);
  let disposed = false;
  let featureBlocks: PreparedFeatureBlocks | null = null;
  try { featureBlocks = prepareFeatureBlocks(plan); const ownedFeatureBlocks = featureBlocks;
    return { source: plan, populationPlan: population, metric, vegetationPrice, authoredCanopies, capSlots, featureBlocks: ownedFeatureBlocks,
    wayfinding: prepareVisualWayfinding(plan, population), grass: prepareEnvironmentVegetation(plan),
    exterior: districtExteriorSites(plan, [...streetFronts(plan), ...environmentSites(plan), ...residentialSites(plan), ...parkCaseSites(plan)],
      new Set(metric.selectedPropIndices)),
    street: collectStreetLifePieces(plan), environment: collectEnvironmentDecorPieces(plan),
    district: collectDistrictDecorPieces(plan), population: countPopulation(population),
    get disposed() { return disposed; }, dispose() { if (disposed) return; disposed = true;
      metric.dispose(); vegetationPrice.dispose(); authoredCanopies.dispose(); capSlots.dispose(); ownedFeatureBlocks.dispose(); } }; }
  catch (error) { metric.dispose(); vegetationPrice.dispose(); authoredCanopies.dispose(); capSlots.dispose(); featureBlocks?.dispose(); throw error; }
}
const zero = (): SupplementCount => ({ colourDraws: 0, shadowDraws: 0, colourTriangles: 0,
  shadowTriangles: 0, geometryBytes: 0, instanceBytes: 0, textureBytes: 0 });
function grassCount(grass: PreparedEnvironmentVegetation, ultra: boolean, ultraCached: boolean): SupplementCount {
  const result = zero(), clumps = ultra ? grass.clumps.length : grass.ordinaryClumps;
  if (!grass.clumps.length) return result;
  const draws = ultra ? grass.batches.size * 2 : [...grass.batches.values()].filter(entries => entries.some(entry => entry.ordinary)).length;
  const blades = RULES.ordinaryBlades + (ultra ? RULES.enrichmentBlades : 0);
  return { ...result, colourDraws: draws, colourTriangles: clumps * blades * 16,
    // Original indexed blade: ten vertices × position/normal/colour, 48 U16 indices.
    // Work follows the active tier; resources follow actual cached capacity.
    geometryBytes: (RULES.ordinaryBlades + (ultraCached ? RULES.enrichmentBlades : 0)) * 456,
    instanceBytes: (ultraCached ? grass.clumps.length * 2 : grass.ordinaryClumps) * 76 };
}
function exteriorCount(sites: readonly DistrictExteriorSite[], rich: boolean, spatialMetres = Infinity): SupplementCount {
  const parts = sites.flatMap(site => site.parts), keys = new Set<string>(), shapes = new Set<string>();
  let triangles = 0;
  for (const part of parts) {
    const shape = part.shape === 'cover' ? 'cover' : 'box'; shapes.add(shape);
    if (part.rich && !rich) continue;
    keys.add(exteriorSpatialBatchKey(part, spatialMetres));
    triangles += shape === 'cover' ? 32 : 12;
  }
  return { ...zero(), colourDraws: keys.size, colourTriangles: triangles,
    // All rich instances are allocated even when hidden on ordinary tiers.
    geometryBytes: (shapes.has('box') ? 936 : 0) + (shapes.has('cover') ? 3456 : 0), instanceBytes: parts.length * 76 };
}

/** Exact potential draw overhead for installed generic/exterior partitions.
 * This is deliberately separate from the historical supplement/admission
 * price: choosing a renderer partition cannot change the accepted art recipe. */
export function priceEnvironmentSpatialBatching(prepared: PreparedEnvironmentSupplements, spatialMetres: number,
  rich: boolean, policy: SupplementPassPolicy = { nearCasts: part => PART_COSTS[part].castsShadow,
    buildings: rich, farShadow: false }): SpatialBatchingDelta {
  if (prepared.disposed) throw new Error('Spatial batching price source owner is disposed');
  validateSpatialBatchMetres(spatialMetres);
  if (spatialMetres === Infinity) return EMPTY_SPATIAL_BATCHING_DELTA;
  const props = priceGenericPropSpatialBatching(prepared.source, spatialMetres, policy.nearCasts, policy.farShadow);
  const originalExterior = exteriorCount(prepared.exterior, rich), spatialExterior = exteriorCount(prepared.exterior, rich, spatialMetres);
  return sumSpatialBatchingDeltas(props, {
    colourDrawDelta: spatialExterior.colourDraws - originalExterior.colourDraws,
    shadowDrawDelta: 0, farShadowDrawDelta: 0, propDrawDelta: 0,
  });
}

/** Runtime accounting overlay, applied after admission. Spatial cells share
 * the original geometry/material and retain exactly the same instance bytes. */
export function withSpatialBatchingSupplementPrice<T extends EnvironmentSupplementPrice>(price: T, delta: SpatialBatchingDelta): T {
  return { ...price, colourDraws: price.colourDraws + delta.colourDrawDelta,
    shadowDraws: price.shadowDraws + delta.shadowDrawDelta,
    farShadowDraws: price.farShadowDraws + delta.farShadowDrawDelta,
    propDrawDelta: price.propDrawDelta + delta.propDrawDelta };
}
function wayfindingCount(wayfinding: VisualWayfinding): SupplementCount {
  return { ...zero(), colourDraws: wayfinding.drawCalls, colourTriangles: wayfinding.triangles,
    geometryBytes: wayfinding.geometryBytes };
}
export function priceEnvironmentSupplements(prepared: PreparedEnvironmentSupplements,
  vegetationDetail: 'ordinary' | 'ultra', rich: boolean,
  legacyTriangles: (part: PropPartId) => number,
  policy: SupplementPassPolicy = { nearCasts: part => PART_COSTS[part].castsShadow,
    buildings: rich, farShadow: false }, featurePrice: FeatureBlockPrice | null = null): EnvironmentSupplementPrice {
  if (prepared.featureBlocks.source !== prepared.source || prepared.featureBlocks.disposed) throw new Error('Feature supplement source owner mismatch');
  if (prepared.authoredCanopies.source !== prepared.source || prepared.authoredCanopies.disposed) throw Error('Authored canopy supplement owner mismatch');
  if (prepared.disposed || prepared.metric.source !== prepared.source || prepared.metric.disposed
    || prepared.vegetationPrice.source !== prepared.source || prepared.vegetationPrice.disposed
    || prepared.capSlots.source !== prepared.source || prepared.capSlots.disposed) throw new Error('Supplement source owner mismatch');
  const metric = prepared.metric.price;
  const sourceDelta = metricSourcePrice(prepared.metric, rich, legacyTriangles, policy.nearCasts);
  const metricCount: SupplementCount = { ...zero(), colourDraws: metric?.drawCalls ?? 0,
    colourTriangles: metric?.colourTriangles ?? 0, geometryBytes: metric?.geometryBytes ?? 0,
    shadowDraws: metric?.shadowDrawCalls ?? 0, shadowTriangles: metric?.shadowTriangles ?? 0 };
  const counts = [metricCount, countStreetLifeDecor(prepared.source, prepared.street),
    countEnvironmentDecor(prepared.source, prepared.environment), countDistrictDecor(prepared.source, prepared.district),
    grassCount(prepared.grass, rich, rich || policy.grassUltraCached === true), exteriorCount(prepared.exterior, rich),
    wayfindingCount(prepared.wayfinding), prepared.population];
  const sum = zero() as { -readonly [K in keyof SupplementCount]: SupplementCount[K] };
  for (const count of counts) for (const key of Object.keys(sum) as (keyof SupplementCount)[]) sum[key] += count[key];
  const vegetation = priceVegetation(prepared.vegetationPrice, vegetationDetail, legacyTriangles, policy);
  const caps = priceOriginalCapSlots(prepared.capSlots, policy.buildings, policy.farShadow, legacyTriangles('buildingCap'));
  const out: EnvironmentSupplementPrice = { ...sum,
    colourDraws: sum.colourDraws + vegetation.colourDrawDelta + sourceDelta.colourDrawDelta,
    shadowDraws: sum.shadowDraws + vegetation.shadowDrawDelta + sourceDelta.shadowDrawDelta,
    colourTriangles: sum.colourTriangles + vegetation.colourDelta + sourceDelta.colourTriangleDelta,
    shadowTriangles: sum.shadowTriangles + vegetation.shadowDelta + sourceDelta.shadowTriangleDelta,
    geometryBytes: sum.geometryBytes + vegetation.geometryBytes,
    instanceBytes: sum.instanceBytes + vegetation.instanceBytes,
    // Metric roof hulls own the same near/static-far geometry. Selected original
    // gables are removed from both paths; source walls and fallback roofs remain.
    farShadowDraws: vegetation.farDrawDelta + (policy.farShadow ? (metric?.shadowDrawCalls ?? 0) + sourceDelta.shadowDrawDelta : 0),
    farShadowTriangles: vegetation.farDelta + (policy.farShadow ? (metric?.shadowTriangles ?? 0) + sourceDelta.shadowTriangleDelta : 0),
    capFarExtraDraws: caps.farExtraDraws, capFarExtraTriangles: caps.farExtraTriangles, capSlotBytes: caps.flagBytes,
    sharedGroundArrayBytes: sharedGroundArrayPrice(prepared.source), vegetationFamilies: vegetation.families,
    propDrawDelta: vegetation.colourDrawDelta + vegetation.shadowDrawDelta + sourceDelta.colourDrawDelta + sourceDelta.shadowDrawDelta,
    propColourDelta: vegetation.colourDelta + sourceDelta.colourTriangleDelta, propShadowDelta: vegetation.shadowDelta + sourceDelta.shadowTriangleDelta,
    metricProxyBytes: sourceDelta.proxyBytes, metricCommonBytes: metric?.geometryBytes ?? 0,
    metricDiscardedColourTriangles: sourceDelta.discardedColourTriangles,
    featureCommonBytes: featurePrice?.commonGeometryBytes ?? 0, featureAoBytes: featurePrice?.ultraAoBytes ?? 0,
    resourceBytes: sum.geometryBytes + sum.instanceBytes + sum.textureBytes + vegetation.geometryBytes + vegetation.instanceBytes };
  // Deltas may be negative (a richer baseline is replaced), actual final cost
  // validation remains in the existing ordinary/Ultra judges.
  if (Object.values(out).filter(value => typeof value === 'number').some(value => !Number.isSafeInteger(value))) throw new Error('Non-finite supplement price');
  if (out.geometryBytes < 0 || out.instanceBytes < 0 || out.textureBytes < 0) throw new Error('Negative supplement allocation price');
  return out;
}
export function withEnvironmentSupplementCost<T extends PresentationCost>(cost: T, price: EnvironmentSupplementPrice | null): T {
  if (!price) return cost;
  const draws = price.colourDraws + price.shadowDraws, triangles = price.colourTriangles + price.shadowTriangles;
  const frame = (old: { drawCalls: number; triangles: number }, panes: number) => ({
    drawCalls: old.drawCalls + draws * panes, triangles: old.triangles + triangles * panes });
  return { ...cost, drawCalls: cost.drawCalls + draws, triangles: cost.triangles + triangles,
    colourTriangles: cost.colourTriangles + price.colourTriangles, shadowTriangles: cost.shadowTriangles + price.shadowTriangles,
    propDrawCalls: cost.propDrawCalls + price.propDrawDelta,
    propTriangles: cost.propTriangles + price.propColourDelta + price.propShadowDelta,
    propColourTriangles: cost.propColourTriangles + price.propColourDelta,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) } };
}
