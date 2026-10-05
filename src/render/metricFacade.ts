/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R20 SOURCE-ONLY ARCHITECTURAL CADENCE PROPOSAL. Intended target: src/render/metricFacade.ts.
 * Build exactly the CPU emission records; all five appearances are borrowed. */
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { metricFacadeCost, metricFacadeShadowCost, type MetricFacadePlan, type MetricSurface, type MetricFinish } from './metricFacadePlan.ts';

export interface MetricFacadeAppearance {
  readonly materials: Readonly<Record<MetricFinish, THREE.Material>>;
  readonly colourFor: (building: Prop, finish: MetricFinish) => readonly [number, number, number];
}
export interface MetricFacadeReport {
  readonly selectedBuildings: number;
  readonly roofModules?: number;
  readonly structuralSeams?: number;
  readonly servedPortals?: number;
  readonly walkServedEntries?: number;
  readonly replacedPieces: number;
  readonly bodyFaces: number;
  readonly roomWindows: number;
  readonly entries: number;
  readonly serviceBays: number;
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly geometryOwners: number;
  readonly materialOwners: 0;
  readonly borrowedMaterials: number;
  readonly textureBytes: 0;
  readonly instanceBytes: 0;
  /** Selected roof hull replaces roof casting; original wall proxies remain. */
  readonly shadowDrawCalls: number;
  readonly shadowTriangles: number;
  readonly disposed: boolean;
}
export interface MetricFacade {
  readonly group: THREE.Group;
  readonly descriptors: MetricFacadePlan;
  report(): MetricFacadeReport;
  dispose(): void;
}

function bytes(geometry: THREE.BufferGeometry): number {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
}

export function createMetricFacade(level: LevelPlan, descriptors: MetricFacadePlan,
  appearance: MetricFacadeAppearance): MetricFacade {
  const expected = metricFacadeCost(descriptors), expectedShadow = metricFacadeShadowCost(descriptors), group = new THREE.Group();
  group.name = 'environment-metric-facade';
  const geometries: THREE.BufferGeometry[] = [], meshes: THREE.Mesh[] = [];
  const borrowed = new Set<THREE.Material>();
  let disposed = false;
  let ownedDescriptors: MetricFacadePlan | null = descriptors;
  const summary = { selectedBuildings: descriptors.selectedPropIndices.length,
    roofModules: descriptors.architecture?.filter(record => record.kind === 'roof-module').length ?? 0,
    structuralSeams: descriptors.architecture?.filter(record => record.kind === 'wall-seam').length ?? 0,
    servedPortals: descriptors.architecture?.filter(record => record.kind === 'served-portal').length ?? 0,
    walkServedEntries: descriptors.architecture?.filter(record => record.kind === 'walk-entry').length ?? 0, replacedPieces: descriptors.replacements.length,
    bodyFaces: descriptors.faces.length, roomWindows: descriptors.apertures.filter(a => a.kind === 'window').length,
    entries: descriptors.apertures.filter(a => a.kind === 'entry').length,
    serviceBays: descriptors.apertures.filter(a => a.kind === 'service').length };
  const release = (): void => {
    group.removeFromParent(); group.clear();
    for (const geometry of geometries) geometry.dispose();
    // Meshes have no instance buffers, materials, textures or custom depth owners.
    // Only these geometry arrays are ours; the appearance lifetime stays with Renderer.
    geometries.length = 0; meshes.length = 0; borrowed.clear(); ownedDescriptors = null;
  };
  try {
    const batches = new Map<string, MetricSurface[]>();
    for (const surface of descriptors.surfaces) {
      const batch = batches.get(surface.batchKey) ?? [];
      batch.push(surface); batches.set(surface.batchKey, batch);
    }
    for (const [key, batch] of batches) {
      const [finishToken, cellToken] = key.split('/'), [cellX, cellZ] = cellToken.split(',').map(Number);
      const finish = finishToken as MetricFinish;
      const material = appearance.materials[finish];
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.vertexColors
        || material.transparent || material.opacity !== 1 || material.map !== null) {
        throw new Error(`Metric facade requires an opaque unmapped borrowed vertex-colour appearance: ${finish}`);
      }
      borrowed.add(material);
      const offsetX = (cellX + 0.5) * descriptors.batchMetres;
      const offsetZ = (cellZ + 0.5) * descriptors.batchMetres;
      const triangleCount = batch.reduce((sum, surface) => sum + surface.vertices.length - 2, 0);
      const positions = new Float32Array(triangleCount * 9), normals = new Float32Array(triangleCount * 9);
      const colours = new Float32Array(triangleCount * 9);
      let cursor = 0;
      for (const surface of batch) {
        const building = level.props?.[surface.propIndex];
        if (!building || building.kind !== 'building') throw new Error('Metric source owner disappeared before allocation');
        const rgb = appearance.colourFor(building, surface.finish);
        if (rgb.length !== 3 || !rgb.every(value => Number.isFinite(value) && value >= 0))
          throw new Error('Metric facade appearance must supply finite nonnegative linear RGB');
        for (let triangle = 1; triangle < surface.vertices.length - 1; triangle++) {
          for (const vertex of [surface.vertices[0], surface.vertices[triangle], surface.vertices[triangle + 1]]) {
            positions[cursor] = vertex.x - offsetX; positions[cursor + 1] = vertex.y; positions[cursor + 2] = vertex.z - offsetZ;
            normals[cursor] = surface.normal.x; normals[cursor + 1] = surface.normal.y; normals[cursor + 2] = surface.normal.z;
            colours[cursor] = rgb[0]; colours[cursor + 1] = rgb[1]; colours[cursor + 2] = rgb[2]; cursor += 3;
          }
        }
      }
      const geometry = new THREE.BufferGeometry(); geometries.push(geometry);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); meshes.push(mesh);
      mesh.position.set(offsetX, 0, offsetZ); mesh.name = `metric-facade/${key}`;
      const roofCaster = batch[0].roofCaster === true;
      if (batch.some(surface => (surface.roofCaster === true) !== roofCaster)) throw new Error('Metric roof caster mixed with a non-casting facade batch');
      mesh.castShadow = roofCaster; mesh.receiveShadow = true;
      if (roofCaster) mesh.layers.enable(ULTRA_STATIC_LAYER);
      group.add(mesh);
    }
    const actualBytes = geometries.reduce((sum, geometry) => sum + bytes(geometry), 0);
    const actualTriangles = geometries.reduce((sum, geometry) => sum + geometry.getAttribute('position').count / 3, 0);
    if (meshes.length !== expected.drawCalls || actualBytes !== expected.geometryBytes
      || actualTriangles !== expected.colourTriangles || geometries.length !== expected.geometryOwners)
      throw new Error('Metric facade CPU emission price differs from allocated buffers');
  } catch (error) { release(); disposed = true; throw error; }
  return { group, get descriptors() {
      if (!ownedDescriptors) throw new Error('Disposed metric facade descriptors');
      return ownedDescriptors;
    },
    report() {
      return { ...summary,
        drawCalls: disposed ? 0 : meshes.length, colourTriangles: disposed ? 0 : expected.colourTriangles,
        geometryBytes: disposed ? 0 : expected.geometryBytes, geometryOwners: disposed ? 0 : geometries.length,
        materialOwners: 0, borrowedMaterials: disposed ? 0 : borrowed.size, textureBytes: 0, instanceBytes: 0,
        shadowDrawCalls: disposed ? 0 : expectedShadow.shadowDrawCalls,
        shadowTriangles: disposed ? 0 : expectedShadow.shadowTriangles, disposed };
    }, dispose() { if (disposed) return; disposed = true; release(); },
  };
}
