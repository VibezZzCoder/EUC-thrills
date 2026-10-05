/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact authored native supports; tier-specific qualification never mutates the source. */
import * as THREE from 'three';
import type { BoxCollider, LevelPlan, Prop } from '../level/plan.ts';
import { positionHash01 } from '../shared/maths.ts';
import { SHARED_VEGETATION_CONTRACTS } from './sharedVegetation.ts';
import { buildVegetationForm, VEGETATION_DISTANCE_COUNTS, type VegetationDetail, type VegetationVariant } from './vegetationForms.ts';
import { proposeAuthoredCanopySupport } from './authoredCanopySupport.ts';
import { registerVegetationDistanceGeometry, vegetationDistanceRanges } from './vegetationDistance.ts';

export interface AuthoredCanopyRequest { readonly propIndices?: readonly number[]; readonly invalid?: string }
export interface AuthoredCanopyProfile {
  readonly adapterTriangles: number;
  readonly rootTriangles: number;
  readonly removedRootTriangles: number;
  readonly connectors: number;
  readonly nearTriangles: number;
  readonly middleTriangles: number;
  readonly farTriangles: number;
  /** Adapter owns its attributes; alias owns only its additional index. */
  readonly geometryBytes: number;
  readonly aliasIndexBytes: number;
}
export interface AuthoredCanopyRecord {
  readonly propIndex: number; readonly segmentIndex: number; readonly colliderIndex: number;
  readonly key: string; readonly prop: Prop; readonly support: BoxCollider;
  readonly variant: VegetationVariant; readonly signature: string;
  readonly matrix: readonly number[]; readonly source: LevelPlan;
}
export interface AuthoredCanopyBuiltReport extends AuthoredCanopyProfile {
  readonly propIndex: number; readonly key: string; readonly ordinaryTriangleDelta: number;
}
export interface AuthoredCanopyRefusal { readonly propIndex: number | null; readonly reason: string; readonly detail?: VegetationDetail }
export interface PreparedAuthoredCanopies {
  readonly source: LevelPlan; readonly records: ReadonlyMap<number, AuthoredCanopyRecord>;
  readonly refusals: readonly AuthoredCanopyRefusal[]; readonly disposed: boolean;
  qualified(detail: VegetationDetail): ReadonlyMap<number, AuthoredCanopyRecord>;
  profile(record: AuthoredCanopyRecord, detail: VegetationDetail): AuthoredCanopyProfile;
  dispose(): void;
}
export function authoredCanopyRequestFromSearch(search: string): AuthoredCanopyRequest {
  const values = new URLSearchParams(search).getAll('squarecanopy');
  if (!values.length) return {}; // Logical default: all actual authored supports.
  if (values.length === 1 && values[0] === 'none') return { propIndices: [] };
  if (values.length !== 1 || !/^(0|[1-9][0-9]*)$/.test(values[0])) return { invalid: 'One canonical source prop index or none is required' };
  const index = Number(values[0]);
  return Number.isSafeInteger(index) ? { propIndices: [index] } : { invalid: 'Source prop index is not a safe integer' };
}
const signature = (prop: Prop, support: BoxCollider): string => JSON.stringify({ prop, support });
export function prepareAuthoredCanopies(source: LevelPlan, request: AuthoredCanopyRequest = {}): PreparedAuthoredCanopies {
  const records = new Map<number, AuthoredCanopyRecord>(), refusals: AuthoredCanopyRefusal[] = [];
  const props = source.props ?? [], requested = request.propIndices ?? props.flatMap((p, i) => p.kind === 'treeCanopy' ? [i] : []);
  if (request.invalid || new Set(requested).size !== requested.length) refusals.push({ propIndex: null, reason: request.invalid ?? 'Duplicate requested source owner' });
  else for (const propIndex of requested) {
    const prop = props[propIndex];
    if (!Number.isSafeInteger(propIndex) || propIndex < 0 || prop?.kind !== 'treeCanopy') { refusals.push({ propIndex, reason: 'Requested source prop is not an authored canopy' }); continue; }
    const matches: { support: BoxCollider; segmentIndex: number; colliderIndex: number }[] = [];
    for (const [segmentIndex, segment] of source.segments.entries()) for (const [colliderIndex, support] of segment.colliders.entries())
      if (support.appearance === 'wood' && support.centre.x === prop.position.x && support.centre.z === prop.position.z) matches.push({ support, segmentIndex, colliderIndex });
    if (matches.length !== 1) { refusals.push({ propIndex, reason: matches.length ? 'Ambiguous exact native wood support' : 'No exact native wood support' }); continue; }
    if (props.filter(p => p.kind === 'treeCanopy' && p.position.x === prop.position.x && p.position.z === prop.position.z).length !== 1) {
      refusals.push({ propIndex, reason: 'Native support has multiple source canopy claimants' }); continue;
    }
    const { support, segmentIndex, colliderIndex } = matches[0];
    if (support.halfExtents.x !== support.halfExtents.z) { refusals.push({ propIndex, reason: 'Native support is not square' }); continue; }
    const variant = Math.floor(positionHash01(prop.position.x, prop.position.z, 617) * 3) as VegetationVariant;
    const matrix = Object.freeze(new THREE.Matrix4().compose(new THREE.Vector3(prop.position.x, prop.position.y, prop.position.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), prop.rotationY), new THREE.Vector3().setScalar(prop.scale)).elements.slice());
    records.set(propIndex, Object.freeze({ source, propIndex, segmentIndex, colliderIndex, prop, support, variant, matrix,
      key: `square-${propIndex}-s${segmentIndex}-c${colliderIndex}`, signature: signature(prop, support) }));
  }
  const profiles = new Map<string, AuthoredCanopyProfile>(), selected = new Map<VegetationDetail, ReadonlyMap<number, AuthoredCanopyRecord>>();
  let disposed = false;
  const assertRecord = (record: AuthoredCanopyRecord): void => {
    if (disposed || record.source !== source || records.get(record.propIndex) !== record || source.props?.[record.propIndex] !== record.prop
      || source.segments[record.segmentIndex]?.colliders[record.colliderIndex] !== record.support || record.signature !== signature(record.prop, record.support))
      throw Error('Square support source owner changed or was disposed');
  };
  const profile = (record: AuthoredCanopyRecord, detail: VegetationDetail): AuthoredCanopyProfile => {
    assertRecord(record); const key = `${record.key}/${detail}`, cached = profiles.get(key); if (cached) return cached;
    const form = buildVegetationForm('crown', detail, record.variant, SHARED_VEGETATION_CONTRACTS.crown);
    try {
      const adapter = proposeAuthoredCanopySupport(form, SHARED_VEGETATION_CONTRACTS.crown, record.prop, record.support);
      try {
        const triangles = adapter.geometry.getAttribute('position').count / 3, removed = adapter.removedRootTriangles, levels = VEGETATION_DISTANCE_COUNTS[detail].crown;
        const aliasIndexBytes = (levels.near + levels.middle + levels.far - removed * 3) * 3 * (levels.near * 3 <= 65536 ? 2 : 4);
        const out = Object.freeze({ adapterTriangles: triangles, rootTriangles: adapter.rootTriangles, removedRootTriangles: removed, connectors: adapter.connectors,
          nearTriangles: levels.near + triangles - removed, middleTriangles: levels.middle + triangles - removed,
          farTriangles: levels.far + triangles - removed, geometryBytes: adapter.geometryBytes, aliasIndexBytes });
        if (adapter.connectors > 5 || ![triangles, removed, out.geometryBytes, aliasIndexBytes].every(v => Number.isSafeInteger(v) && v > 0)
          || removed >= Math.min(levels.near, levels.middle, levels.far)) throw Error('Finite native adapter/alias price refused');
        profiles.set(key, out); return out;
      } finally { adapter.geometry.dispose(); }
    } catch (cause) { const refusal = new Error(cause instanceof Error ? cause.message : String(cause)); refusal.name = 'AuthoredCanopyQualificationRefusal'; throw refusal; }
    finally { form.geometry.dispose(); }
  };
  return { source, get records() { if (disposed) throw Error('Square support owner disposed'); return records; }, get refusals() { return refusals; }, get disposed() { return disposed; }, profile,
    qualified(detail) {
      if (disposed) throw Error('Square support owner disposed');
      for (const record of records.values()) assertRecord(record);
      const cached = selected.get(detail); if (cached) return cached;
      const accepted = new Map<number, AuthoredCanopyRecord>();
      for (const record of records.values()) {
        try { profile(record, detail); accepted.set(record.propIndex, record); }
        catch (error) { if (!(error instanceof Error) || error.name !== 'AuthoredCanopyQualificationRefusal') throw error;
          refusals.push({ propIndex: record.propIndex, detail, reason: error.message }); }
      }
      selected.set(detail, accepted); return accepted;
    }, dispose() { if (disposed) return; disposed = true; profiles.clear(); selected.clear(); records.clear(); refusals.length = 0; } };
}

function assertCanonicalCrown(source: THREE.BufferGeometry, detail: VegetationDetail): void {
  const levels = VEGETATION_DISTANCE_COUNTS[detail].crown, ranges = vegetationDistanceRanges(source), names = ['position', 'normal', 'color', ...(detail === 'ultra' ? ['vegetationWood'] : [])];
  if (!ranges || source.groups.length || !source.index || Object.keys(source.attributes).sort().join('/') !== names.slice().sort().join('/')
    || (['near', 'middle', 'far'] as const).some(level => ranges[level].triangles !== levels[level])) throw Error('Actual canonical crown shape/semantics refused');
  for (const name of names) {
    const attribute = source.getAttribute(name) as THREE.BufferAttribute;
    if (!(attribute.array instanceof Float32Array) || attribute.normalized || attribute.itemSize !== (name === 'vegetationWood' ? 1 : 3)
      || attribute.count !== levels.near * 3) throw Error('Actual canonical crown attribute storage refused');
  }
}
const borrowedAliases = new WeakSet<THREE.BufferGeometry>();
/** Partial release retains canonical GPU attributes for surviving drawables.
 * Final-owner release requires every borrowing drawable to be retired first:
 * keep attributes attached so an uploaded alias frees shared VBOs even when
 * its canonical geometry was never registered by Three. Later removes no-op. */
export function disposeAuthoredCanopyCrownAlias(geometry: THREE.BufferGeometry,
  mode: 'partial-borrower' | 'final-owner' = 'partial-borrower'): boolean {
  if (mode !== 'partial-borrower' && mode !== 'final-owner') throw Error('Unknown authored canopy alias release mode');
  if (!borrowedAliases.has(geometry)) return false;
  borrowedAliases.delete(geometry);
  if (mode === 'partial-borrower') for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
  geometry.dispose(); return true;
}

/** One alias per selected habit: borrow actual immutable attributes, own only
 * root-omitting native index ranges. Canonical attribute/index owners stay resident. */
export function buildAuthoredCanopyCrownAlias(source: THREE.BufferGeometry, detail: VegetationDetail, removed: number): THREE.BufferGeometry {
  assertCanonicalCrown(source, detail);
  const ranges = vegetationDistanceRanges(source), levels = VEGETATION_DISTANCE_COUNTS[detail].crown;
  if (!ranges || source.groups.length || !source.index || !Number.isSafeInteger(removed) || removed <= 0 || removed >= levels.far) throw Error('Actual native crown alias refused');
  const geometry = new THREE.BufferGeometry(); borrowedAliases.add(geometry);
  try {
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    const counts = { near: levels.near - removed, middle: levels.middle - removed, far: levels.far - removed };
    const count = (counts.near + counts.middle + counts.far) * 3, vertices = source.getAttribute('position').count;
    const indices = vertices <= 65536 ? new Uint16Array(count) : new Uint32Array(count); let cursor = 0;
    for (const level of ['near', 'middle', 'far'] as const) {
      const range = ranges[level]; if (range.triangles !== levels[level]) throw Error('Canonical distance range changed');
      for (let i = removed * 3; i < range.count; i++) indices[cursor++] = source.index.array[range.start + i];
    }
    if (cursor !== count) throw Error('Root-omitting alias index count changed');
    geometry.setIndex(new THREE.BufferAttribute(indices, 1)); registerVegetationDistanceGeometry(geometry, counts);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = `${source.name}-authored-root-omitted`;
    return geometry;
  } catch (error) { disposeAuthoredCanopyCrownAlias(geometry); throw error; }
}

/** Per-support native adapter owns small non-indexed P/N/C/wood arrays only.
 * Unchanged crown attributes are borrowed by the separately cached alias. */
export function buildAuthoredCanopyAdapter(prepared: PreparedAuthoredCanopies, record: AuthoredCanopyRecord,
  detail: VegetationDetail, source: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; report: AuthoredCanopyBuiltReport } {
  if (prepared.qualified(detail).get(record.propIndex) !== record) throw Error('Square adapter lacks actual tier qualification');
  assertCanonicalCrown(source, detail);
  const expected = prepared.profile(record, detail), form = buildVegetationForm('crown', detail, record.variant, SHARED_VEGETATION_CONTRACTS.crown);
  try {
    for (const name of ['position', 'normal']) {
      const a = source.getAttribute(name) as THREE.BufferAttribute, b = form.geometry.getAttribute(name) as THREE.BufferAttribute;
      if (!(a.array instanceof Float32Array) || !(b.array instanceof Float32Array) || a.itemSize !== 3 || a.count !== b.count) throw Error('Actual native crown attribute shape differs');
      const first = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length), second = new Uint32Array(b.array.buffer, b.array.byteOffset, b.array.length);
      for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) throw Error('Actual native crown differs from exact adapter source');
    }
    const color = source.getAttribute('color') as THREE.BufferAttribute;
    if (!(color.array instanceof Float32Array) || color.count !== form.geometry.getAttribute('position').count) throw Error('Actual source colour refused');
    form.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(color.array), 3));
    const adapter = proposeAuthoredCanopySupport(form, SHARED_VEGETATION_CONTRACTS.crown, record.prop, record.support);
    try {
      if (adapter.geometry.index || adapter.geometry.getAttribute('position').count / 3 !== expected.adapterTriangles || adapter.geometryBytes !== expected.geometryBytes
        || adapter.removedRootTriangles !== expected.removedRootTriangles || adapter.rootTriangles !== expected.rootTriangles || adapter.connectors !== expected.connectors
        || (detail === 'ultra') !== adapter.geometry.hasAttribute('vegetationWood')) throw Error('Actual adapter emission differs from its finite price');
      const ordinary = prepared.qualified('ordinary').has(record.propIndex) ? prepared.profile(record, 'ordinary') : null;
      return { geometry: adapter.geometry, report: { ...expected, propIndex: record.propIndex, key: record.key,
        ordinaryTriangleDelta: ordinary ? ordinary.adapterTriangles - ordinary.removedRootTriangles : 0 } };
    } catch (error) { adapter.geometry.dispose(); throw error; }
  } finally { form.geometry.dispose(); }
}
