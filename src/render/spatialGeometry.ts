/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { spatialCellKey, validateSpatialBatchMetres } from './spatialBatching.ts';

/** Unique allocations for one indexed source, not attribute references per tile. */
export interface SpatialGeometryPartitionReport {
  readonly chunks: number;
  readonly sourceDrawGroups: number;
  readonly drawGroups: number;
  readonly triangles: number;
  readonly attributeBytes: number;
  readonly indexBytes: number;
}

interface TileGroup {
  readonly materialIndex: number;
  count: number;
  start: number;
  written: number;
}

interface Tile {
  readonly key: string;
  readonly groups: Map<number, TileGroup>;
  readonly bounds: THREE.Box3;
  count: number;
  geometry: THREE.BufferGeometry | null;
}

/**
 * Partition final static triangles without clipping, reindexing vertices or repacking
 * any attribute. A source triangle belongs to its centroid's XZ tile; its full
 * extent contributes to that tile's bounds, including triangles crossing a
 * tile edge. Original winding and material-group ordering remain intact.
 *
 * Attributes are the same BufferAttribute objects on every result geometry.
 * Three therefore uploads one vertex buffer per attribute. Index arrays retain
 * the source width, so their combined allocation equals the source index. The
 * caller owns the source and every returned geometry, and must retire all tiles
 * together: Three's geometry disposal releases shared attributes immediately.
 * Infinity preserves the historical whole-world geometry by identity.
 */
export function partitionIndexedGeometry(
  source: THREE.BufferGeometry,
  metres: number,
): { readonly geometries: readonly THREE.BufferGeometry[]; readonly report: SpatialGeometryPartitionReport } {
  validateSpatialBatchMetres(metres);
  const position = source.getAttribute('position');
  const index = source.index;
  if (!position || !index || index.itemSize !== 1 || index.count % 3 !== 0) {
    throw new Error('Spatial partition requires indexed complete triangles and positions');
  }
  if (Object.keys(source.morphAttributes).length > 0) {
    throw new Error('Spatial partition requires static non-morph geometry');
  }
  if (source.drawRange.start !== 0 || (source.drawRange.count !== Infinity && source.drawRange.count !== index.count)) {
    throw new Error('Spatial partition requires the complete source draw range');
  }
  if (!(index.array instanceof Uint16Array) && !(index.array instanceof Uint32Array)) {
    throw new Error('Spatial partition requires unsigned 16- or 32-bit source indices');
  }

  // Explicit source groups must cover each index exactly once. Without groups,
  // the caller has a single material and results likewise need no groups.
  const grouped = source.groups.length > 0;
  const groups = grouped ? source.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
  let end = 0;
  for (const group of groups) {
    if (group.start !== end || group.count < 0 || group.count % 3 !== 0) {
      throw new Error('Spatial partition requires ordered, non-overlapping triangle groups');
    }
    end += group.count;
  }
  if (end !== index.count) throw new Error('Spatial partition groups do not cover the source index');

  const buffers = new Set<THREE.BufferAttribute | THREE.InterleavedBuffer>();
  for (const attribute of Object.values(source.attributes)) {
    buffers.add(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute);
  }
  const attributeBytes = [...buffers].reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
  const sourceDrawGroups = grouped ? groups.filter(group => group.count > 0).length : Number(index.count > 0);
  const sourceReport: SpatialGeometryPartitionReport = {
    chunks: 1, sourceDrawGroups, drawGroups: sourceDrawGroups, triangles: index.count / 3,
    attributeBytes, indexBytes: index.array.byteLength,
  };
  if (metres === Infinity || index.count === 0) return { geometries: [source], report: sourceReport };

  // One assignment per triangle avoids retaining boxed-number index lists or
  // repeating centroid work when exact-sized typed index arrays are filled.
  const assignments = new Uint32Array(index.count / 3);
  const tiles: Tile[] = [];
  const tileByKey = new Map<string, number>();
  const point = new THREE.Vector3();
  for (const [ordinal, group] of groups.entries()) {
    for (let at = group.start; at < group.start + group.count; at += 3) {
      const a = index.getX(at), b = index.getX(at + 1), c = index.getX(at + 2);
      if (a >= position.count || b >= position.count || c >= position.count) {
        throw new Error('Spatial partition source index exceeds its positions');
      }
      const key = spatialCellKey((position.getX(a) + position.getX(b) + position.getX(c)) / 3,
        (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3, metres);
      let tileIndex = tileByKey.get(key);
      if (tileIndex === undefined) {
        tileIndex = tiles.length;
        tileByKey.set(key, tileIndex);
        tiles.push({ key, groups: new Map(), bounds: new THREE.Box3(), count: 0, geometry: null });
      }
      const tile = tiles[tileIndex];
      assignments[at / 3] = tileIndex;
      let tileGroup = tile.groups.get(ordinal);
      if (!tileGroup) {
        tileGroup = { materialIndex: group.materialIndex ?? 0, count: 0, start: 0, written: 0 };
        tile.groups.set(ordinal, tileGroup);
      }
      tileGroup.count += 3;
      tile.count += 3;
      for (let offset = 0; offset < 3; offset++) {
        const vertex = index.getX(at + offset);
        point.fromBufferAttribute(position, vertex);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
          throw new Error('Spatial partition source has nonfinite positions');
        }
        tile.bounds.expandByPoint(point);
      }
    }
  }

  let drawGroups = 0;
  for (const tile of tiles) {
    const geometry = new THREE.BufferGeometry();
    geometry.name = `${source.name || 'spatial-geometry'}:${tile.key}`;
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    const indices = index.array instanceof Uint32Array ? new Uint32Array(tile.count) : new Uint16Array(tile.count);
    const chunkIndex = new THREE.BufferAttribute(indices, 1, index.normalized);
    chunkIndex.setUsage(index.usage); chunkIndex.gpuType = index.gpuType; chunkIndex.name = index.name;
    geometry.setIndex(chunkIndex);
    let start = 0;
    for (const tileGroup of tile.groups.values()) {
      tileGroup.start = start;
      if (grouped) geometry.addGroup(start, tileGroup.count, tileGroup.materialIndex);
      start += tileGroup.count;
    }
    drawGroups += grouped ? tile.groups.size : 1;
    // computeBoundingSphere/Box would inspect every shared vertex, yielding the
    // entire world's bounds for every tile and defeating frustum culling.
    geometry.boundingBox = tile.bounds;
    geometry.boundingSphere = tile.bounds.getBoundingSphere(new THREE.Sphere());
    tile.geometry = geometry;
  }

  for (const [ordinal, group] of groups.entries()) {
    for (let at = group.start; at < group.start + group.count; at += 3) {
      const tile = tiles[assignments[at / 3]], tileGroup = tile.groups.get(ordinal)!;
      const target = tile.geometry!.index!.array;
      const start = tileGroup.start + tileGroup.written;
      target[start] = index.getX(at); target[start + 1] = index.getX(at + 1); target[start + 2] = index.getX(at + 2);
      tileGroup.written += 3;
    }
  }
  return { geometries: tiles.map(tile => tile.geometry!),
    report: { ...sourceReport, chunks: tiles.length, drawGroups } };
}
