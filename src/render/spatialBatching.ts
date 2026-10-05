/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-only partitioning. Source admission and presentation selection keep
 * their original world batches; installed potential work adds these deltas. */
import { propPartCounts, type PropPartId } from '../data/renderCost.ts';
import { ENVIRONMENT_BATCHING } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { ExteriorPart } from './districtExteriorSites.ts';
import type { PresentationCost } from './presentation.ts';

/** Installed render partition pitch; historical factories remain opt-in. */
export const DEFAULT_SPATIAL_BATCH_METRES = ENVIRONMENT_BATCHING.spatialBatchMetres;

export interface SpatialBatchingDelta {
  readonly colourDrawDelta: number;
  readonly shadowDrawDelta: number;
  /** Activation-only Ultra static far-map overhead, never a frame pass. */
  readonly farShadowDrawDelta: number;
  readonly propDrawDelta: number;
}
export const EMPTY_SPATIAL_BATCHING_DELTA: SpatialBatchingDelta = Object.freeze({
  colourDrawDelta: 0, shadowDrawDelta: 0, farShadowDrawDelta: 0, propDrawDelta: 0,
});

/** Infinity explicitly preserves historical unpartitioned factories. */
export function validateSpatialBatchMetres(metres: number): void {
  if (!(metres > 0) || (!Number.isFinite(metres) && metres !== Infinity)) {
    throw new RangeError('Spatial batch pitch must be positive and finite or Infinity');
  }
}

/** Callers validate the pitch once before their emission loop. */
export function spatialCellKey(x: number, z: number, metres: number): string {
  return metres === Infinity ? 'world' : `${Math.floor(x / metres)},${Math.floor(z / metres)}`;
}

const GENERIC_PARTS: ReadonlySet<PropPartId> = new Set([
  'trunk', 'lampPost', 'lampHead', 'benchWood', 'benchMetal', 'litterBin',
  'bollardCap', 'signPost', 'signPlate', 'routeSignPlate', 'routeSignTech',
  'routeSignAir', 'fenceBay', 'tyreStack', 'gantrySpan',
]);
/** Building/proxy/roof/slot owners and existing foliage cells stay untouched. */
export const isSpatialGenericPart = (part: PropPartId): boolean => GENERIC_PARTS.has(part);

export function genericPropSpatialKey(part: PropPartId, x: number, z: number, metres: number): string | null {
  return metres === Infinity || !isSpatialGenericPart(part) ? null
    : `${part}-cell-${spatialCellKey(x, z, metres)}`;
}

export function exteriorSpatialBatchKey(part: ExteriorPart, metres: number): string {
  const point = part.shape === 'beam' ? part.from : part.position;
  return `${part.rich ? 'rich' : 'shared'}/${part.finish}/${part.shape === 'cover' ? 'cover' : 'box'}/${spatialCellKey(point.x, point.z, metres)}`;
}

export interface GenericPropSpatialBatchPrice extends SpatialBatchingDelta {
  readonly sourceColourDraws: number;
  readonly colourDraws: number;
  readonly sourceShadowDraws: number;
  readonly shadowDraws: number;
  readonly instances: number;
}

/** Independent source census: generic pieces use their original prop's pivot.
 * No meshes, instance arrays, geometry, materials or admission data are changed. */
export function priceGenericPropSpatialBatching(plan: LevelPlan, metres: number,
  nearCasts: (part: PropPartId) => boolean, farShadow = false): GenericPropSpatialBatchPrice {
  validateSpatialBatchMetres(metres);
  const cells = new Map<PropPartId, Set<string>>();
  const routeSigns = new Map((plan.routeSigns ?? []).map(sign => [sign.propIndex, sign.upper.word]));
  let instances = 0;
  for (const [index, prop] of (plan.props ?? []).entries()) {
    const upper = routeSigns.get(index);
    if (upper !== undefined && upper !== 'TECH' && upper !== 'AIR') throw new Error('Spatial route sign has no priced upper template');
    for (const [part, count] of propPartCounts(prop, undefined, upper)) {
      if (!isSpatialGenericPart(part)) continue;
      const occupied = cells.get(part) ?? new Set<string>();
      occupied.add(spatialCellKey(prop.position.x, prop.position.z, metres)); cells.set(part, occupied);
      instances += count;
    }
  }
  let colourDraws = 0, sourceShadowDraws = 0, shadowDraws = 0;
  for (const [part, occupied] of cells) {
    colourDraws += occupied.size;
    if (nearCasts(part)) { sourceShadowDraws++; shadowDraws += occupied.size; }
  }
  const colourDrawDelta = colourDraws - cells.size, shadowDrawDelta = shadowDraws - sourceShadowDraws;
  return { sourceColourDraws: cells.size, colourDraws, sourceShadowDraws, shadowDraws, instances,
    colourDrawDelta, shadowDrawDelta, farShadowDrawDelta: farShadow ? shadowDrawDelta : 0,
    propDrawDelta: colourDrawDelta + shadowDrawDelta };
}

export function sumSpatialBatchingDeltas(...deltas: readonly (SpatialBatchingDelta | null | undefined)[]): SpatialBatchingDelta {
  let colourDrawDelta = 0, shadowDrawDelta = 0, farShadowDrawDelta = 0, propDrawDelta = 0;
  for (const delta of deltas) if (delta) {
    colourDrawDelta += delta.colourDrawDelta; shadowDrawDelta += delta.shadowDrawDelta;
    farShadowDrawDelta += delta.farShadowDrawDelta; propDrawDelta += delta.propDrawDelta;
  }
  return { colourDrawDelta, shadowDrawDelta, farShadowDrawDelta, propDrawDelta };
}

/** Potential overhead only; frustum savings belong to actual submission probes.
 * Apply after recipe selection, never to a source or presentation admission. */
export function withSpatialBatchingCost<T extends Pick<PresentationCost, 'drawCalls' | 'propDrawCalls' | 'frame'>>(
  cost: T, delta: SpatialBatchingDelta): T {
  const draws = delta.colourDrawDelta + delta.shadowDrawDelta;
  if (draws === 0 && delta.propDrawDelta === 0) return cost;
  const frame = (old: { drawCalls: number; triangles: number }, panes: number) => ({
    ...old, drawCalls: old.drawCalls + draws * panes });
  return { ...cost, drawCalls: cost.drawCalls + draws, propDrawCalls: cost.propDrawCalls + delta.propDrawDelta,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) } };
}
