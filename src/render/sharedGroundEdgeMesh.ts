/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Actual replacement emission into the one owned terrain geometry. */
import * as THREE from 'three';
import type { MaterialId } from '../data/surfaces.ts';
import { GROUND_BOUNDARY } from '../data/tuning.ts';
import { assertGroundEdgePrice, groundEdgeIndexBytes, type GroundEdgePrice } from '../shared/groundEdgePrice.ts';
import type { EdgeAssemblyTriangle, EdgeAssemblyVertex } from './sharedGroundEdgeAssembly.ts';
import type { PreparedGroundEdges } from './sharedGroundEdgePlan.ts';
import { GROUND_BOUNDARY_ATTRIBUTES } from './ordinaryGroundBoundary.ts';
import { ULTRA_GROUND_ATTRIBUTES } from './ultra/groundContact.ts';

export interface SharedGroundEdgeMeshReport {
  readonly price: GroundEdgePrice;
  readonly bufferBytes: number;
  readonly indexBytes: number;
  readonly ordinaryAttributeBytes: number;
  readonly ultraAttributeBytes: number;
  readonly addedMaterialOwners: number;
  readonly actualDrawGroups: number;
  readonly triangles: number;
  readonly joinFailures: number;
}
const component = (attribute: THREE.BufferAttribute, at: number, channel: number): number => {
  // Float16BufferAttribute overrides X/Y/Z/W, but NOT getComponent. Using
  // getComponent would interpolate half-float bit patterns as coordinates.
  if (channel === 0) return attribute.getX(at);
  if (channel === 1) return attribute.getY(at);
  if (channel === 2) return attribute.getZ(at);
  return attribute.getW(at);
};
const setComponent = (attribute: THREE.BufferAttribute, at: number, channel: number, value: number): void => {
  if (channel === 0) attribute.setX(at, value);
  else if (channel === 1) attribute.setY(at, value);
  else if (channel === 2) attribute.setZ(at, value);
  else attribute.setW(at, value);
};
const weighted = (attribute: THREE.BufferAttribute, first: number, vertex: EdgeAssemblyVertex, channel: number) =>
  vertex.cornerWeights.reduce((sum, weight, corner) => sum + weight * component(attribute, first + corner, channel), 0);
export function emitSharedGroundEdges(geometry: THREE.BufferGeometry, materials: THREE.Material[],
  drawn: ReadonlyMap<string, readonly number[]>, prepared: PreparedGroundEdges,
  material: (id: MaterialId) => THREE.Material,
  bandTint: (id: MaterialId, vertex: EdgeAssemblyVertex) => readonly [number, number, number]): SharedGroundEdgeMeshReport {
  const price = prepared.price; assertGroundEdgePrice(price);
  const sourcePositions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const sourceCommonBytes = ['position', 'normal', 'color'].reduce((sum, name) =>
    sum + (geometry.getAttribute(name) as THREE.BufferAttribute).array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0);
  if (sourcePositions.count !== price.sourceVertices || geometry.index?.count !== price.sourceIndices) {
    throw new Error('Shared edge emission source buffers do not match the prepared world');
  }
  const firstByCell = new Map<number, number>(), materialByKey = new Map<string, number>();
  let first = 0, group = 0;
  for (const [surface, cells] of drawn) {
    materialByKey.set(surface, group++);
    for (const cell of cells) { firstByCell.set(cell, first); first += 4; }
  }
  const groups = new Map<string, number[]>();
  for (const key of prepared.groupTriangleCounts.keys()) groups.set(key, []);
  const appended: { triangle: EdgeAssemblyTriangle; vertex: EdgeAssemblyVertex; first: number }[] = [];
  for (const [surface, cells] of drawn) for (const cell of cells) {
    const first = firstByCell.get(cell)!, fragments = prepared.assembly.replacements.get(cell);
    if (!fragments) { groups.get(surface)!.push(first, first + 3, first + 1, first, first + 2, first + 3); continue; }
    for (const triangle of fragments) {
      const key = triangle.role === 'base' ? surface : prepared.materialKeys.get(triangle.appearance)!;
      const start = price.sourceVertices + appended.length;
      groups.get(key)!.push(start, start + 1, start + 2);
      for (const vertex of triangle.vertices) appended.push({ triangle, vertex, first });
    }
  }
  if (appended.length !== price.appendedVertices) throw new Error('Shared edge emitted vertex count differs from price');
  let ordinaryAttributeBytes = 0, ultraAttributeBytes = 0;
  const ordinaryNames = new Set<string>(Object.values(GROUND_BOUNDARY_ATTRIBUTES));
  const ultraNames = new Set<string>(Object.values(ULTRA_GROUND_ATTRIBUTES));
  for (const [name, raw] of Object.entries(geometry.attributes)) {
    if (!(raw instanceof THREE.BufferAttribute) || raw.itemSize > 4) throw new Error(`Unsupported shared edge source attribute ${name}`);
    const source = raw;
    if (source.count !== price.sourceVertices) throw new Error(`Shared edge source attribute count differs: ${name}`);
    const ArrayType = source.array.constructor as typeof Float32Array;
    const array = new ArrayType(price.vertices * source.itemSize); array.set(source.array);
    const AttributeType = source.constructor as new(values: typeof array, itemSize: number, normalized: boolean) => THREE.BufferAttribute;
    const expanded = new AttributeType(array, source.itemSize, source.normalized);
    expanded.setUsage(source.usage);
    expanded.gpuType = source.gpuType; expanded.name = source.name;
    for (const [index, entry] of appended.entries()) {
      const at = price.sourceVertices + index, { triangle, vertex, first } = entry;
      const tint = name === 'color' && triangle.role !== 'base' ? bandTint(triangle.appearance, vertex) : null;
      for (let channel = 0; channel < source.itemSize; channel++) {
        let value: number;
        if (name === 'position') value = [vertex.x, vertex.y, vertex.z][channel];
        else if (name === 'color' && tint) value = tint[channel];
        else if (triangle.role !== 'base' && (name === GROUND_BOUNDARY_ATTRIBUTES.edge || name === ULTRA_GROUND_ATTRIBUTES.edge)) value = GROUND_BOUNDARY.sentinel;
        else if (triangle.role !== 'base' && (name === GROUND_BOUNDARY_ATTRIBUTES.tint || name === ULTRA_GROUND_ATTRIBUTES.fillTint)) value = 1;
        else if (triangle.role !== 'base' && (name === GROUND_BOUNDARY_ATTRIBUTES.mode || name === ULTRA_GROUND_ATTRIBUTES.fillKind)) value = 0;
        else value = weighted(source, first, vertex, channel);
        if (!Number.isFinite(value)) throw new Error(`Nonfinite shared edge ${name}/${channel}`);
        setComponent(expanded, at, channel, value);
      }
    }
    geometry.setAttribute(name, expanded);
    const extra = expanded.array.byteLength - source.array.byteLength;
    if (ordinaryNames.has(name)) ordinaryAttributeBytes += extra;
    if (ultraNames.has(name)) ultraAttributeBytes += extra;
  }
  const sourceMaterialOwners = materials.length, indices: number[] = [];
  geometry.clearGroups();
  for (const [key, groupIndices] of groups) {
    const expected = prepared.groupTriangleCounts.get(key)! * 3;
    if (groupIndices.length !== expected) throw new Error(`Shared edge group ${key} differs from its source price`);
    if (!groupIndices.length) continue;
    let materialIndex = materialByKey.get(key);
    if (materialIndex === undefined) {
      const id = [...prepared.materialKeys].find(([, value]) => value === key)?.[0];
      if (!id) throw new Error(`Shared edge has no appearance owner for ${key}`);
      materialIndex = materials.length; materials.push(material(id)); materialByKey.set(key, materialIndex);
    }
    geometry.addGroup(indices.length, groupIndices.length, materialIndex);
    for (const index of groupIndices) indices.push(index);
  }
  geometry.setIndex(indices);
  const indexBytes = geometry.index!.array.byteLength;
  if (indices.length !== price.indices || geometry.groups.length !== price.drawGroups
    || indexBytes !== groundEdgeIndexBytes(price.vertices, price.indices)) {
    throw new Error('Shared edge actual index/group allocation differs from its source price');
  }
  const commonBytes = ['position', 'normal', 'color'].reduce((sum, name) =>
    sum + (geometry.getAttribute(name) as THREE.BufferAttribute).array.byteLength, 0) + indexBytes;
  if (commonBytes - sourceCommonBytes !== price.commonGeometryBytes) throw new Error('Shared edge common bytes differ from source price');
  if (ordinaryAttributeBytes !== (ordinaryNames.size && geometry.hasAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge) ? price.ordinaryAttributeBytes : 0)) {
    throw new Error('Shared edge ordinary packed bytes differ from their source price');
  }
  if (ultraAttributeBytes > price.maximumUltraAttributeBytes) throw new Error('Shared edge Ultra packed bytes exceed source price');
  geometry.computeBoundingSphere();
  return { price, bufferBytes: Object.values(geometry.attributes).reduce((sum, attribute) => sum + (attribute as THREE.BufferAttribute).array.byteLength, 0) + indexBytes,
    indexBytes, ordinaryAttributeBytes, ultraAttributeBytes, addedMaterialOwners: materials.length - sourceMaterialOwners,
    actualDrawGroups: geometry.groups.length, triangles: indices.length / 3, joinFailures: prepared.joinFailures.length };
}
