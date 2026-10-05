/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** CPU-only ownership and price of the same root/variant/cell selection that
 * createProps emits independently. Packed distance alternatives are resident
 * together, but each colour draw selects one range; both shadow paths use near.
 * This draft requires the frozen all-family VEGETATION_DISTANCE_COUNTS kit.
 */
import type { LevelPlan } from '../level/plan.ts';
import type { PreparedAuthoredCanopies, AuthoredCanopyRecord } from './authoredCanopyOwner.ts';
import type { PropPartId } from '../data/renderCost.ts';
import { ENVIRONMENT_VEGETATION } from '../data/tuning.ts';
import { positionHash01 } from '../shared/maths.ts';
import { vegetationPackedPrice } from '../shared/vegetationPackedPrice.ts';
import { VEGETATION_DISTANCE_COUNTS, type VegetationFamily } from './vegetationForms.ts';

export interface VegetationPriceFamily {
  readonly part: VegetationFamily;
  readonly instances: number;
  readonly variants: readonly number[];
  readonly buckets: readonly string[];
  readonly authoredInstances: number;
  readonly aliasVariants: readonly number[];
}
export interface PreparedVegetationPrice {
  readonly source: LevelPlan;
  readonly authored: PreparedAuthoredCanopies | null;
  readonly families: readonly VegetationPriceFamily[];
  readonly disposed: boolean;
  familiesFor(detail: 'ordinary' | 'ultra'): readonly VegetationPriceFamily[];
  dispose(): void;
}
export interface VegetationPassPolicy {
  readonly nearCasts: (part: PropPartId) => boolean;
  readonly farShadow: boolean;
}
export interface VegetationFamilyPrice {
  readonly part: VegetationFamily;
  readonly instances: number;
  readonly sourceInstances: number;
  readonly adapterInstances: number;
  readonly aliasOwners: number;
  readonly actualNearTriangles: number;
  readonly variants: number;
  readonly buckets: number;
  readonly nearTriangles: number;
  readonly middleTriangles: number;
  readonly farTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly colourDraws: number;
  readonly nearDraws: number;
  readonly staticFarDraws: number;
}
export interface VegetationPrice {
  readonly colourDrawDelta: number;
  readonly shadowDrawDelta: number;
  readonly farDrawDelta: number;
  readonly colourDelta: number;
  readonly shadowDelta: number;
  readonly farDelta: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly families: readonly VegetationFamilyPrice[];
}
const familyOf = (kind: string): VegetationFamily | null => kind === 'broadleafTree' || kind === 'treeCanopy'
  ? 'crown' : kind === 'conifer' ? 'coniferFoliage' : kind === 'shrub' ? 'shrub' : null;
const variantAt = (x: number, z: number): number => Math.floor(positionHash01(x, z, 617) * 3);
const bucketAt = (variant: number, x: number, z: number): string =>
  `${variant}/${Math.floor(x / ENVIRONMENT_VEGETATION.treeBatchMetres)}/${Math.floor(z / ENVIRONMENT_VEGETATION.treeBatchMetres)}`;

const squareBucketAt = (variant: number, x: number, z: number): string => `${bucketAt(variant, x, z)}/square`;
const adapterBucketAt = (record: AuthoredCanopyRecord): string => `${record.variant}/adapter/${record.key}`;
export function prepareVegetationPrice(plan: LevelPlan, authored: PreparedAuthoredCanopies | null = null): PreparedVegetationPrice {
  if (authored && (authored.source !== plan || authored.disposed)) throw Error('Vegetation square owner belongs to another/disposed source');
  const cached = new Map<'ordinary' | 'ultra', readonly VegetationPriceFamily[]>(); let disposed = false;
  const familiesFor = (detail: 'ordinary' | 'ultra'): readonly VegetationPriceFamily[] => {
    if (disposed) throw Error('Vegetation price owner disposed');
    const squares = authored?.qualified(detail), known = cached.get(detail); if (known) return known;
    const selected = new Map<VegetationFamily, { instances: number; variants: Set<number>; buckets: Set<string>; authoredInstances: number; aliasVariants: Set<number> }>();
    for (const [propIndex, prop] of (plan.props ?? []).entries()) {
      const part = familyOf(prop.kind); if (!part) continue;
      const family = selected.get(part) ?? { instances: 0, variants: new Set<number>(), buckets: new Set<string>(), authoredInstances: 0, aliasVariants: new Set<number>() };
      const variant = variantAt(prop.position.x, prop.position.z), square = squares?.get(propIndex);
      family.instances++; family.variants.add(variant);
      family.buckets.add(square ? squareBucketAt(variant, prop.position.x, prop.position.z) : bucketAt(variant, prop.position.x, prop.position.z));
      if (square) { family.authoredInstances++; family.aliasVariants.add(variant); family.buckets.add(adapterBucketAt(square)); }
      selected.set(part, family);
    }
    const families = [...selected].map(([part, family]) => ({ part, instances: family.instances, variants: [...family.variants].sort(),
      buckets: [...family.buckets].sort(), authoredInstances: family.authoredInstances, aliasVariants: [...family.aliasVariants].sort() }));
    cached.set(detail, families); return families;
  };
  return { source: plan, authored, get families() { return familiesFor('ordinary'); }, familiesFor,
    get disposed() { return disposed; }, dispose() { if (disposed) return; disposed = true; cached.clear(); } };
}

/** Actual independently emitted alias + adapter buckets prove source ownership
 * separately. Every selected source prop owns one alias instance and one small
 * adapter; complete circular props remain original source instances only. */
export function assertVegetationPriceEmission(prepared: PreparedVegetationPrice,
  actual: Iterable<{ readonly part: PropPartId; readonly variant: number | null; readonly matrices: readonly number[];
    readonly authored?: readonly AuthoredCanopyRecord[]; readonly adapter?: boolean }>, detail: 'ordinary' | 'ultra' = 'ordinary'): void {
  const squares = prepared.authored?.qualified(detail);
  const observed = new Map<VegetationFamily, { instances: number; variants: Set<number>; buckets: Set<string>; authoredInstances: number; aliasVariants: Set<number> }>();
  const aliases = new Set<number>(), adapters = new Set<number>();
  for (const bucket of actual) {
    if (bucket.part !== 'crown' && bucket.part !== 'shrub' && bucket.part !== 'coniferFoliage') continue;
    if (bucket.variant === null || !bucket.matrices.length || bucket.matrices.length % 16) throw Error('Unprepared vegetation emission');
    const family = observed.get(bucket.part) ?? { instances: 0, variants: new Set<number>(), buckets: new Set<string>(), authoredInstances: 0, aliasVariants: new Set<number>() };
    const owners = bucket.authored ?? [], count = bucket.matrices.length / 16;
    if (owners.length && (bucket.part !== 'crown' || owners.length !== count) || bucket.adapter && count !== 1) throw Error('Authored square source bucket shape mismatch');
    let cell: string | undefined;
    for (let offset = 0; offset < bucket.matrices.length; offset += 16) {
      const x = bucket.matrices[offset + 12], z = bucket.matrices[offset + 14], variant = variantAt(x, z), square = owners[offset / 16];
      if (square && (squares?.get(square.propIndex) !== square || square.source !== prepared.source
        || square.matrix.some((value, i) => value !== bucket.matrices[offset + i]))) throw Error('Authored square source emission owner mismatch');
      if (bucket.adapter && !square) throw Error('Adapter lacks qualified original source owner');
      const key = bucket.adapter ? adapterBucketAt(square!) : square ? squareBucketAt(variant, x, z) : bucketAt(variant, x, z);
      if (variant !== bucket.variant || (cell !== undefined && cell !== key)) throw Error('Vegetation emitted cell/variant mismatch');
      if (cell === undefined && family.buckets.has(key)) throw Error('Vegetation cell emitted twice');
      cell = key; family.buckets.add(key);
      if (bucket.adapter) { if (adapters.has(square!.propIndex)) throw Error('Square adapter emitted twice'); adapters.add(square!.propIndex); }
      else { family.instances++; family.variants.add(variant);
        if (square) { if (aliases.has(square.propIndex)) throw Error('Square crown source emitted twice'); aliases.add(square.propIndex); family.authoredInstances++; family.aliasVariants.add(variant); }
      }
    }
    observed.set(bucket.part, family);
  }
  const expected = prepared.familiesFor(detail);
  if (aliases.size !== (squares?.size ?? 0) || adapters.size !== aliases.size || [...aliases].some(i => !adapters.has(i))
    || observed.size !== expected.length || expected.some(family => {
      const got = observed.get(family.part); return !got || got.instances !== family.instances || got.authoredInstances !== family.authoredInstances
        || [...got.variants].sort().join('/') !== family.variants.join('/') || [...got.aliasVariants].sort().join('/') !== family.aliasVariants.join('/')
        || [...got.buckets].sort().join('|') !== family.buckets.join('|');
    })) throw Error('Vegetation prepared owner differs from actual source emission');
}

export function priceVegetation(prepared: PreparedVegetationPrice, detail: 'ordinary' | 'ultra',
  legacyTriangles: (part: PropPartId) => number, policy: VegetationPassPolicy): VegetationPrice {
  if (prepared.disposed || prepared.authored && (prepared.authored.disposed || prepared.authored.source !== prepared.source)) throw Error('Vegetation finite owner disposed or mismatched');
  let colourDrawDelta = 0, shadowDrawDelta = 0, farDrawDelta = 0;
  let colourDelta = 0, shadowDelta = 0, farDelta = 0, geometryBytes = 0, instanceBytes = 0;
  const families: VegetationFamilyPrice[] = [];
  for (const family of prepared.familiesFor(detail)) {
    const levels = VEGETATION_DISTANCE_COUNTS[detail][family.part], casts = policy.nearCasts(family.part);
    const squareProfiles = family.part === 'crown' ? [...(prepared.authored?.qualified(detail).values() ?? [])].map(record => prepared.authored!.profile(record, detail)) : [];
    const squareDelta = squareProfiles.reduce((sum, profile) => sum + profile.nearTriangles - levels.near, 0);
    const delta = (levels.near - legacyTriangles(family.part)) * family.instances + squareDelta;
    const batchDelta = family.buckets.length - 1;
    colourDrawDelta += batchDelta; colourDelta += delta;
    if (casts) { shadowDrawDelta += batchDelta; shadowDelta += delta; }
    if (casts && policy.farShadow) { farDrawDelta += batchDelta; farDelta += delta; }
    // Exact near P/N/C plus all-level Uint16/32 indices; the emitted packer
    // independently checks actual typed arrays against this storage contract.
    // One geometry per present family/habit; spatial cells borrow it once.
    const geometry = vegetationPackedPrice(levels, detail === 'ultra' && family.part !== 'coniferFoliage' ? 4 : 0).geometryBytes * family.variants.length
      + squareProfiles.reduce((sum, profile) => sum + profile.geometryBytes, 0)
      + family.aliasVariants.reduce((sum, variant) => {
        const records = [...(prepared.authored?.qualified(detail).values() ?? [])].filter(record => record.variant === variant);
        const prices = records.map(record => prepared.authored!.profile(record, detail));
        if (!prices.length || prices.some(price => price.aliasIndexBytes !== prices[0].aliasIndexBytes || price.removedRootTriangles !== prices[0].removedRootTriangles)) throw Error('Shared crown alias native profile changed');
        return sum + prices[0].aliasIndexBytes;
      }, 0);
    const instances = (family.instances + family.authoredInstances) * (16 + 3) * 4; // Matrix4 + instance RGB.
    geometryBytes += geometry; instanceBytes += instances;
    families.push({ part: family.part, instances: family.instances + family.authoredInstances, sourceInstances: family.instances,
      adapterInstances: family.authoredInstances, aliasOwners: family.aliasVariants.length, actualNearTriangles: levels.near * family.instances + squareDelta, variants: family.variants.length,
      buckets: family.buckets.length, nearTriangles: levels.near, middleTriangles: levels.middle, farTriangles: levels.far,
      geometryBytes: geometry, instanceBytes: instances, colourDraws: family.buckets.length,
      nearDraws: casts ? family.buckets.length : 0, staticFarDraws: casts && policy.farShadow ? family.buckets.length : 0 });
  }
  return { colourDrawDelta, shadowDrawDelta, farDrawDelta, colourDelta, shadowDelta, farDelta, geometryBytes, instanceBytes, families };
}
