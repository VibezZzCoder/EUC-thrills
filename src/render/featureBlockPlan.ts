/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure render-owned source support, top partition and exact storage/work
 * records. No Three objects, GPU allocation, source-world mutation or names.
 */
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import type { MaterialId } from '../data/surfaces.ts';
import { SHARED_GROUND } from '../data/tuning.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { colliderMaterial } from '../level/renderBudget.ts';
import { groundEdgeIndexBytes as mergedIndexBytes } from '../shared/groundEdgePrice.ts';

export interface FeatureSupportPoint {
  readonly localX: number;
  readonly localZ: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly groundY: number;
}
export interface FeatureTopQuad {
  /** Fractions of the existing top's +X (s) and +Z (t) edges. */
  readonly s0: number;
  readonly s1: number;
  readonly t0: number;
  readonly t1: number;
  readonly band: boolean;
}
export interface FeatureBlockPlan {
  readonly material: 'dirt' | 'wood';
  readonly topY: number;
  readonly exposedMaximumMetres: number;
  readonly supports: readonly FeatureSupportPoint[];
  readonly takeoff: { readonly axis: 'x' | 'z'; readonly sign: -1 | 1; readonly supportDropMetres: number } | null;
  readonly topQuads: readonly FeatureTopQuad[];
}
export interface PreparedFeatureBlocks {
  readonly source: LevelPlan;
  readonly blocks: ReadonlyMap<BoxCollider, FeatureBlockPlan>;
  readonly disposed: boolean;
  dispose(): void;
}
const wholeTop = (): FeatureTopQuad => ({ s0: 0, s1: 1, t0: 0, t1: 1, band: false });

export function planFeatureBlock(plan: LevelPlan, collider: BoxCollider, material: MaterialId): FeatureBlockPlan | null {
  const rule = SHARED_GROUND.feature, e = collider.halfExtents, c = collider.centre;
  if ((material !== 'dirt' && material !== 'wood') || ![c.x, c.y, c.z, e.x, e.y, e.z, collider.rotationY].every(Number.isFinite)
    || e.y <= 0 || Math.min(e.x, e.z) * 2 < rule.minimumShortSideMetres
    || Math.max(e.x, e.z) * 2 < rule.minimumLongSideMetres) return null;
  const cos = Math.cos(collider.rotationY), sin = Math.sin(collider.rotationY), topY = c.y + e.y;
  const at = (localX: number, localZ: number): FeatureSupportPoint => {
    const worldX = c.x + cos * localX + sin * localZ, worldZ = c.z - sin * localX + cos * localZ;
    return { localX, localZ, worldX, worldZ, groundY: fieldHeightAt(plan.heightfield, plan.surround, worldX, worldZ) };
  };
  // Four yawed footprint corners bound exposed support, with both pairs of
  // axis endpoint midpoints. Buried collider base/height never classifies it.
  const supports = [at(-e.x, -e.z), at(-e.x, e.z), at(e.x, e.z), at(e.x, -e.z),
    at(-e.x, 0), at(e.x, 0), at(0, -e.z), at(0, e.z)];
  if (supports.some(point => !Number.isFinite(point.groundY))) throw new Error('Non-finite feature source support');
  const exposedMaximumMetres = Math.max(0, topY - Math.min(...supports.map(point => point.groundY)));
  if (exposedMaximumMetres <= 0 || exposedMaximumMetres > rule.maximumHeightMetres) return null;
  // Source endpoint drop chooses the axis/end. Width, segment label, seed and
  // longest side cannot tell which edge actually stands over lower support.
  const xDrop = supports[4].groundY - supports[5].groundY, zDrop = supports[6].groundY - supports[7].groundY;
  const axis = Math.abs(xDrop) > Math.abs(zDrop) ? 'x' : 'z', drop = axis === 'x' ? xDrop : zDrop;
  const ends = axis === 'x' ? supports.slice(4, 6) : supports.slice(6, 8);
  let takeoff: FeatureBlockPlan['takeoff'] = null, topQuads = [wholeTop()];
  if (material === 'dirt' && Math.abs(drop) >= rule.minimumTakeoffDropMetres
    && ends.every(point => point.groundY <= topY)) {
    const sign: -1 | 1 = drop > 0 ? 1 : -1, span = (axis === 'x' ? e.x : e.z) * 2;
    const share = rule.takeoffBandWidthMetres / span;
    if (!(share > 0 && share < 1)) throw new Error('Feature band must fit the original top');
    takeoff = { axis, sign, supportDropMetres: Math.abs(drop) };
    const main = wholeTop(), band = { ...wholeTop(), band: true };
    if (axis === 'x') topQuads = sign > 0
      ? [{ ...main, s1: 1 - share }, { ...band, s0: 1 - share }]
      : [{ ...main, s0: share }, { ...band, s1: share }];
    else topQuads = sign > 0
      ? [{ ...main, t1: 1 - share }, { ...band, t0: 1 - share }]
      : [{ ...main, t0: share }, { ...band, t1: share }];
  }
  return Object.freeze({ material, topY, exposedMaximumMetres,
    supports: Object.freeze(supports.map(point => Object.freeze(point))),
    takeoff: takeoff ? Object.freeze(takeoff) : null,
    topQuads: Object.freeze(topQuads.map(quad => Object.freeze(quad))) });
}

export function prepareFeatureBlocks(plan: LevelPlan): PreparedFeatureBlocks {
  const blocks = new Map<BoxCollider, FeatureBlockPlan>();
  for (const segment of plan.segments) for (const collider of segment.colliders) {
    const feature = planFeatureBlock(plan, collider, colliderMaterial(collider));
    if (feature) blocks.set(collider, feature);
  }
  let disposed = false;
  return { source: plan, get blocks() { if (disposed) throw new Error('Feature source owner disposed'); return blocks; },
    get disposed() { return disposed; }, dispose() { if (disposed) return; disposed = true; blocks.clear(); } };
}

export interface FeatureBlockBucketPrice {
  readonly material: MaterialId;
  readonly bands: number;
  readonly sourceVertices: number;
  readonly sourceIndices: number;
  readonly vertices: number;
  readonly indices: number;
  readonly commonGeometryBytes: number;
}
export interface FeatureBlockPrice {
  readonly bands: number;
  readonly addedVertices: number;
  readonly addedIndices: number;
  readonly colourTriangles: number;
  readonly nearShadowTriangles: number;
  readonly staticFarTriangles: number;
  readonly commonGeometryBytes: number;
  /** Existing one normalized U8 AO per vertex; included in terrain attributes. */
  readonly ultraAoBytes: number;
  readonly buckets: readonly FeatureBlockBucketPrice[];
}
/** The source callback reads the existing baseline/enhanced/Ultra box count,
 * excluding this partition. Every original box face is emitted as quads:
 * two triangles, four vertices, six indices each. Exact index width is chosen
 * for the whole original material bucket, including a U16→U32 promotion.
 */
export function priceFeatureBlocks(prepared: PreparedFeatureBlocks,
  sourceTriangles: (collider: BoxCollider, material: MaterialId) => number,
  ultraAo: boolean, staticFar: boolean): FeatureBlockPrice {
  const grouped = new Map<MaterialId, { sourceTriangles: number; bands: number }>();
  for (const segment of prepared.source.segments) for (const collider of segment.colliders) {
    const material = colliderMaterial(collider), triangles = sourceTriangles(collider, material);
    if (!Number.isSafeInteger(triangles) || triangles <= 0 || triangles % 2) throw new Error('Feature source box count is not complete quads');
    const bucket = grouped.get(material) ?? { sourceTriangles: 0, bands: 0 };
    bucket.sourceTriangles += triangles;
    bucket.bands += Number(prepared.blocks.get(collider)?.topQuads.length === 2);
    grouped.set(material, bucket);
  }
  const buckets: FeatureBlockBucketPrice[] = [];
  let bands = 0, commonGeometryBytes = 0;
  for (const [material, bucket] of grouped) {
    if (!bucket.bands) continue;
    const sourceVertices = bucket.sourceTriangles * 2, sourceIndices = bucket.sourceTriangles * 3;
    const vertices = sourceVertices + bucket.bands * 4, indices = sourceIndices + bucket.bands * 6;
    const common = bucket.bands * 4 * 36 + mergedIndexBytes(vertices, indices) - mergedIndexBytes(sourceVertices, sourceIndices);
    buckets.push({ material, bands: bucket.bands, sourceVertices, sourceIndices, vertices, indices, commonGeometryBytes: common });
    bands += bucket.bands; commonGeometryBytes += common;
  }
  return { bands, addedVertices: bands * 4, addedIndices: bands * 6, colourTriangles: bands * 2,
    nearShadowTriangles: bands * 2, staticFarTriangles: staticFar ? bands * 2 : 0,
    commonGeometryBytes, ultraAoBytes: ultraAo ? bands * 4 : 0, buckets };
}
