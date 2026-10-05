/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { districtExteriorSites, type DistrictExteriorSite, type ExteriorFinish, type ExteriorPart }
  from './districtExteriorSites.ts';
import type { FacadeOpening } from './streetFacadeOpenings.ts';
import type { PresentationCost } from './presentation.ts';
import { EMPTY_SPATIAL_BATCHING_DELTA, exteriorSpatialBatchKey, validateSpatialBatchMetres,
  type SpatialBatchingDelta } from './spatialBatching.ts';

export interface DistrictExteriorAppearance {
  /** Borrowed, unmapped, opaque materials. Their owner installs any shared
   * environment response and retains sole colour/material/light authority. */
  readonly materials: Readonly<Record<ExteriorFinish, THREE.Material>>;
  /** Linear RGB, supplied by the existing appearance owner. */
  readonly colourFor: (building: Prop, finish: ExteriorFinish) => readonly [number, number, number];
  readonly protectedOpenings?: readonly FacadeOpening[];
  readonly replacedPropIndices?: ReadonlySet<number>;
  /** Optional spatial partition. Infinity (default) keeps five world batches;
   * a finite positive pitch trades more submissions for local frustum culling. */
  readonly spatialBatchMetres?: number;
}
export interface DistrictExteriorReport {
  readonly spatialBatching: SpatialBatchingDelta;
  readonly buildings: number;
  readonly byLook: Readonly<Record<string, number>>;
  readonly streetFacingBuildings: number;
  readonly closedEntries: number;
  readonly groundWindows: number;
  readonly parcels: number;
  readonly coverRoots: number;
  readonly sharedParts: number;
  readonly richParts: number;
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly textureBytes: 0;
  readonly geometryOwners: number;
  readonly materialOwners: 0;
  readonly borrowedMaterials: number;
  readonly shadowDrawCalls: 0;
  readonly rich: boolean;
  readonly disposed: boolean;
}
export interface DistrictExterior {
  readonly group: THREE.Group;
  readonly sites: readonly DistrictExteriorSite[];
  setDetail(rich: boolean): void;
  report(): DistrictExteriorReport;
  dispose(): void;
}

export function withDistrictExteriorCost<T extends Omit<PresentationCost, 'recipe'>>(
  cost: T, exterior: DistrictExteriorReport): T {
  const frame = (old: { drawCalls: number; triangles: number }, views: number) => ({
    drawCalls: old.drawCalls + exterior.drawCalls * views,
    triangles: old.triangles + exterior.colourTriangles * views,
  });
  return { ...cost, drawCalls: cost.drawCalls + exterior.drawCalls,
    triangles: cost.triangles + exterior.colourTriangles,
    colourTriangles: cost.colourTriangles + exterior.colourTriangles,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) } };
}

/** Four small closed foliage lobes. Ground cover is deliberately lower than
 * the original grass clumps, with no trunk, planter, fake path or collision. */
export function districtExteriorCoverGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let petal = 0; petal < 4; petal += 1) {
    const yaw = petal * Math.PI / 2, c = Math.cos(yaw), s = Math.sin(yaw), start = positions.length / 3;
    const vertices = [[0, 0.10, 0.02], [-0.24, 0.30, 0.48], [0, 0.10, 0.95],
      [0.24, 0.30, 0.48], [0, 1, 0.48], [0, 0.02, 0.48]];
    for (const [x, y, z] of vertices) positions.push(c * x + s * z, y, -s * x + c * z);
    for (const [a, b, d] of [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0],
      [1, 5, 0], [2, 5, 1], [3, 5, 2], [0, 5, 3]]) indices.push(start + a, start + d, start + b);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed(); indexed.dispose(); geometry.computeVertexNormals();
  return geometry;
}
function whiteVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const colours = new Float32Array(geometry.getAttribute('position').count * 3); colours.fill(1);
  geometry.deleteAttribute('uv'); geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}
function geometryBytes(geometry: THREE.BufferGeometry): number {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
}
interface Entry { readonly site: DistrictExteriorSite; readonly part: ExteriorPart }

/** Shared district depth, built once per world; tier changes change only the
 * richer corner-frame draw counts. The builder owns no materials, shader hooks,
 * textures, lights, clocks, listeners or source/simulation data. */
export function createDistrictExterior(plan: LevelPlan, appearance: DistrictExteriorAppearance, preparedSites?: readonly DistrictExteriorSite[]): DistrictExterior {
  const pitch = appearance.spatialBatchMetres ?? Infinity;
  validateSpatialBatchMetres(pitch);
  const sites = preparedSites ?? districtExteriorSites(plan, appearance.protectedOpenings, appearance.replacedPropIndices), group = new THREE.Group();
  group.name = 'environment-district-exterior';
  const geometries = new Set<THREE.BufferGeometry>(), meshes: THREE.InstancedMesh[] = [];
  const richMeshes = new Map<THREE.InstancedMesh, number>(), borrowed = new Set<THREE.Material>();
  let rich = false, disposed = false;
  const release = (): void => {
    group.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    group.clear();
  };
  try {
    const batches = new Map<string, Entry[]>();
    for (const site of sites) for (const part of site.parts) {
      const key = exteriorSpatialBatchKey(part, pitch);
      const entries = batches.get(key) ?? []; entries.push({ site, part }); batches.set(key, entries);
    }
    let box: THREE.BufferGeometry | undefined, cover: THREE.BufferGeometry | undefined;
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion(), normalRotation = new THREE.Quaternion(), yawRotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), colour = new THREE.Color();
    for (const [key, entries] of batches) {
      const first = entries[0].part;
      let geometry: THREE.BufferGeometry;
      if (first.shape === 'cover') {
        if (!cover) { cover = whiteVertices(districtExteriorCoverGeometry()); geometries.add(cover); }
        geometry = cover;
      } else {
        if (!box) { box = whiteVertices(new THREE.BoxGeometry(1, 1, 1)); geometries.add(box); }
        geometry = box;
      }
      const material = appearance.materials[first.finish];
      if (!material) throw new Error(`Missing borrowed exterior material: ${first.finish}`);
      if (material.transparent || material.opacity < 1 || ('map' in material && material.map)) {
        throw new Error('Exterior appearance owner must supply opaque unmapped materials');
      }
      borrowed.add(material);
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length); meshes.push(mesh);
      mesh.name = `district-exterior/${key}`; mesh.castShadow = false; mesh.receiveShadow = true;
      for (let index = 0; index < entries.length; index += 1) {
        const { site, part } = entries[index];
        if (part.shape === 'beam') {
          position.set((part.from.x + part.to.x) / 2, (part.from.y + part.to.y) / 2, (part.from.z + part.to.z) / 2);
          direction.set(part.to.x - part.from.x, part.to.y - part.from.y, part.to.z - part.from.z);
          scale.set(part.thickness, direction.length(), part.thickness);
          if (part.faceYaw !== undefined) {
            const localX = direction.x * Math.cos(part.faceYaw) - direction.z * Math.sin(part.faceYaw);
            rotation.setFromAxisAngle(direction.set(0, 0, 1), -Math.atan2(localX, part.to.y - part.from.y));
            yawRotation.setFromAxisAngle(up, part.faceYaw); rotation.premultiply(yawRotation);
          } else rotation.setFromUnitVectors(up, direction.normalize());
        } else {
          position.set(part.position.x, part.position.y, part.position.z);
          if (part.shape === 'cover') {
            normalRotation.setFromUnitVectors(up, direction.set(part.normal.x, part.normal.y, part.normal.z).normalize());
            yawRotation.setFromAxisAngle(up, part.yaw); rotation.copy(normalRotation).multiply(yawRotation);
            scale.set(part.radius, part.height, part.radius);
          } else {
            rotation.setFromAxisAngle(up, part.yaw); scale.set(part.size.x, part.size.y, part.size.z);
          }
        }
        matrix.compose(position, rotation, scale); mesh.setMatrixAt(index, matrix);
        const rgb = appearance.colourFor(site.building, part.finish);
        if (rgb.length !== 3 || !rgb.every(value => Number.isFinite(value) && value >= 0)) {
          throw new Error('Exterior appearance owner must supply finite nonnegative linear RGB');
        }
        colour.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace); mesh.setColorAt(index, colour);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      if (first.rich) { richMeshes.set(mesh, entries.length); mesh.count = 0; mesh.visible = false; }
      group.add(mesh);
    }
  } catch (error) { release(); throw error; }
  const byLook: Record<string, number> = {};
  for (const site of sites) {
    const key = site.look ?? 'untagged'; byLook[key] = (byLook[key] ?? 0) + 1;
  }
  const parts = sites.flatMap(site => site.parts), sharedParts = parts.filter(part => !part.rich).length;
  const richParts = parts.length - sharedParts;
  const ordinarySourceDraws = new Set(parts.filter(part => !part.rich).map(part => exteriorSpatialBatchKey(part, Infinity))).size;
  const richSourceDraws = new Set(parts.map(part => exteriorSpatialBatchKey(part, Infinity))).size;
  const bytes = [...geometries].reduce((sum, geometry) => sum + geometryBytes(geometry), 0);
  const instances = meshes.reduce((sum, mesh) => sum + mesh.instanceMatrix.array.byteLength
    + (mesh.instanceColor?.array.byteLength ?? 0), 0);
  return { group, sites,
    setDetail(value) {
      if (disposed || value === rich) return; rich = value;
      for (const [mesh, capacity] of richMeshes) { mesh.count = value ? capacity : 0; mesh.visible = value; }
    },
    report() {
      const active = disposed ? [] : meshes.filter(mesh => mesh.visible && mesh.count > 0);
      const colourDrawDelta = disposed ? 0 : active.length - (rich ? richSourceDraws : ordinarySourceDraws);
      return { spatialBatching: disposed ? EMPTY_SPATIAL_BATCHING_DELTA
        : { colourDrawDelta, shadowDrawDelta: 0, farShadowDrawDelta: 0, propDrawDelta: 0 },
        buildings: sites.length, byLook, streetFacingBuildings: sites.filter(site => site.streetSegmentId).length,
        closedEntries: parts.filter(part => part.kind === 'closed-entry').length,
        groundWindows: parts.filter(part => part.kind === 'ground-window').length,
        parcels: sites.reduce((sum, site) => sum + site.parcels.length, 0),
        coverRoots: parts.filter(part => part.shape === 'cover').length, sharedParts, richParts,
        drawCalls: active.length, colourTriangles: active.reduce((sum, mesh) => sum
          + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0),
        geometryBytes: disposed ? 0 : bytes, instanceBytes: disposed ? 0 : instances, textureBytes: 0,
        geometryOwners: disposed ? 0 : geometries.size, materialOwners: 0,
        borrowedMaterials: disposed ? 0 : borrowed.size, shadowDrawCalls: 0, rich, disposed };
    },
    dispose() { if (disposed) return; disposed = true; release(); },
  };
}
