/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DistrictSite } from '../level/districtSites.ts';
import type { EnvironmentOpening } from '../level/environmentSites.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { PresentationCost } from './presentation.ts';
import { collectDistrictDecorPieces, type DistrictDecorPieces,
  type DistrictFinish as Finish, DISTRICT_FINISH_ORDER as FINISH_ORDER } from './districtDecorPieces.ts';
import { createDecorShapeGeometry } from './decorShapeGeometry.ts';

/** Static, sparse composition installed once by the renderer's world owner. */
export interface DistrictDecorReport {
  readonly residentialRooms: number;
  readonly parkCases: number;
  readonly mapRouteSegments: number;
  readonly mapSourceSegments: number;
  readonly mapOmittedSegments: number;
  readonly people: 0;
  readonly motion: 'none';
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: 0;
  readonly textureBytes: 0;
  readonly materialOwners: number;
  readonly shadowDrawCalls: 0;
}

export const EMPTY_DISTRICT_DECOR_REPORT: DistrictDecorReport = Object.freeze({
  residentialRooms: 0, parkCases: 0, mapRouteSegments: 0, mapSourceSegments: 0,
  mapOmittedSegments: 0, people: 0, motion: 'none',
  drawCalls: 0, colourTriangles: 0, geometryBytes: 0, instanceBytes: 0,
  textureBytes: 0, materialOwners: 0, shadowDrawCalls: 0,
});

/** Actual colour work supplements each view; admission/catalogue stays fixed. */
export function withDistrictDecorCost<T extends Omit<PresentationCost, 'recipe'>>(
  cost: T, decor: DistrictDecorReport,
): T {
  const frame = (old: { drawCalls: number; triangles: number }, views: number) => ({
    drawCalls: old.drawCalls + decor.drawCalls * views,
    triangles: old.triangles + decor.colourTriangles * views,
  });
  return { ...cost,
    drawCalls: cost.drawCalls + decor.drawCalls,
    triangles: cost.triangles + decor.colourTriangles,
    colourTriangles: cost.colourTriangles + decor.colourTriangles,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) },
  };
}

export interface DistrictDecor {
  readonly group: THREE.Group;
  readonly sites: readonly DistrictSite[];
  readonly openings: readonly EnvironmentOpening[];
  /** Compatibility with the shared world clock; static geometry owns no clock. */
  update(seconds: number, reducedMotion: boolean): void;
  report(): DistrictDecorReport;
  dispose(): void;
}

// Existing environment finishes, with no additional lighting response or map.
const FINISHES: Readonly<Record<Finish, THREE.MeshStandardMaterialParameters>> = Object.freeze({
  masonry: { roughness: 0.91, metalness: 0 },
  timber: { roughness: 0.79, metalness: 0 },
  paint: { roughness: 0.50, metalness: 0.05 },
  steel: { roughness: 0.47, metalness: 0.50 },
  glazing: { roughness: 0.22, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false },
});

/** No lights, shadows, actors, maps, RAFs, timers or audio. One closed-case glazing batch.
 * Every low vertex is rendered behind the selected original protecting OBB. */
export function createDistrictDecor(plan: LevelPlan, pieces: DistrictDecorPieces = collectDistrictDecorPieces(plan)): DistrictDecor {
  const sites = pieces.sites, group = new THREE.Group();
  group.name = 'environment-district-decor';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<Finish, THREE.MeshStandardMaterial>();
  const { mapRouteSegments, mapSourceSegments } = pieces;
  let disposed = false;
  for (const emission of pieces.sitePieces) {
    const site = emission.site;
    const siteGroup = new THREE.Group();
    siteGroup.name = `district-${site.id}`;
    siteGroup.position.set(site.position.x, site.position.y, site.position.z);
    siteGroup.rotation.y = site.yaw;
    group.add(siteGroup);
    for (const finish of FINISH_ORDER) {
      const shapes = emission.batches[finish];
      if (shapes.length === 0) continue;
      const pieces = shapes.map(createDecorShapeGeometry);
      const geometry = mergeGeometries(pieces, false);
      for (const piece of pieces) piece.dispose();
      if (!geometry) throw new Error(`District ${finish} geometry attributes differ`);
      geometries.add(geometry);
      let material = materials.get(finish);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ vertexColors: true, ...FINISHES[finish] });
        material.name = `district-${finish}`;
        materials.set(finish, material);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `district-${site.id}-${finish}`;
      mesh.castShadow = false; mesh.receiveShadow = false;
      siteGroup.add(mesh);
    }
  }
  let drawCalls = 0, colourTriangles = 0, geometryBytes = 0;
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      drawCalls++;
      colourTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    }
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) geometryBytes += attribute.array.byteLength;
    geometryBytes += geometry.index?.array.byteLength ?? 0;
  }
  const report: DistrictDecorReport = Object.freeze({
    residentialRooms: sites.filter(site => site.kind === 'residential-domestic-room').length,
    parkCases: sites.filter(site => site.kind === 'park-closed-map-case').length,
    mapRouteSegments, mapSourceSegments, mapOmittedSegments: mapSourceSegments - mapRouteSegments,
    people: 0, motion: 'none', drawCalls, colourTriangles,
    geometryBytes, instanceBytes: 0, textureBytes: 0,
    materialOwners: materials.size, shadowDrawCalls: 0,
  });
  return { group, sites,
    openings: sites.map(site => ({ position: site.position, yaw: site.yaw,
      faceWidth: site.faceWidth, height: site.height, depth: site.depth })),
    update() {},
    report: () => report,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      group.clear();
    },
  };
}
