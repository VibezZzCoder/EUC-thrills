/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { environmentEmitters, type EnvironmentEmitter,
  type EnvironmentOpening, type IndustrialBaySite } from '../level/environmentSites.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import type { PresentationCost } from './presentation.ts';
import { DEPOT_SIGN } from '../data/environment.ts';
import { PROTECTED_ACTIVITY } from '../data/tuning.ts';
import { paintDepotSign } from './environmentSignPaint.ts';
import { collectEnvironmentDecorPieces, type EnvironmentDecorPieces,
  type EnvironmentFinish as Finish } from './environmentDecorPieces.ts';
import { createDecorShapeGeometry } from './decorShapeGeometry.ts';

/** The phase-two exemplar is installed by the renderer's world owner.
 * Existing building solids protect every low object; the colour opening is a
 * closed service bay. Its steel gate never opens for gameplay. */
export interface EnvironmentObject {
  readonly kind: 'delivery-van' | 'bicycle' | 'bicycle-rack' | 'crate-stack' | 'storage';
  readonly position: Vec3;
  readonly size: Vec3;
  readonly yaw: number;
}

export interface EnvironmentDecorReport {
  readonly industrialBays: number;
  readonly vehicles: number;
  readonly bicycles: number;
  readonly people: 0;
  readonly motion: 'none' | 'ventilation';
  readonly ventilationFans: number;
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: 0;
  readonly textureBytes: number;
  readonly materialOwners: number;
  readonly shadowDrawCalls: 0;
}

export const EMPTY_ENVIRONMENT_DECOR_REPORT: EnvironmentDecorReport = Object.freeze({
  industrialBays: 0, vehicles: 0, bicycles: 0, people: 0, motion: 'none', ventilationFans: 0,
  drawCalls: 0, colourTriangles: 0, geometryBytes: 0, instanceBytes: 0,
  textureBytes: 0, materialOwners: 0, shadowDrawCalls: 0,
});

/** Add actual display work after the selected recipe, never to admission. */
export function withEnvironmentDecorCost<T extends Omit<PresentationCost, 'recipe'>>(
  cost: T, decor: EnvironmentDecorReport,
): T {
  const frame = (old: { drawCalls: number; triangles: number }, views: number) => ({
    drawCalls: old.drawCalls + decor.drawCalls * views,
    triangles: old.triangles + decor.colourTriangles * views,
  });
  return {
    ...cost,
    drawCalls: cost.drawCalls + decor.drawCalls,
    triangles: cost.triangles + decor.colourTriangles,
    colourTriangles: cost.colourTriangles + decor.colourTriangles,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) },
  };
}

export interface EnvironmentDecor {
  readonly group: THREE.Group;
  readonly sites: readonly IndustrialBaySite[];
  readonly openings: readonly EnvironmentOpening[];
  readonly objects: readonly EnvironmentObject[];
  readonly emitters: readonly EnvironmentEmitter[];
  /** One shared world clock poses only the protected ventilation rotor. */
  update(seconds: number, reducedMotion: boolean): void;
  report(): EnvironmentDecorReport;
  dispose(): void;
}

const FINISHES: Readonly<Record<Finish, { roughness: number; metalness: number }>> = Object.freeze({
  masonry: { roughness: 0.91, metalness: 0 },
  timber: { roughness: 0.79, metalness: 0 },
  paint: { roughness: 0.50, metalness: 0.05 },
  steel: { roughness: 0.47, metalness: 0.50 },
  rubber: { roughness: 0.96, metalness: 0 },
  glass: { roughness: 0.24, metalness: 0.14 },
});

/** Full shape and sign-texture ownership stays here: no extra lights, live
 * transparency, imported assets, physics, RAFs or audio nodes. */
export function createEnvironmentDecor(plan: LevelPlan, pieces: EnvironmentDecorPieces = collectEnvironmentDecorPieces(plan)): EnvironmentDecor {
  const sites = pieces.sites;
  const group = new THREE.Group();
  group.name = 'environment-industrial-exemplar';
  const objects = pieces.objects;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let disposed = false;
  const rotors: { mesh: THREE.Mesh; mount: THREE.Matrix4 }[] = [];
  const rotorTurn = new THREE.Matrix4();
  let lastSeconds = Number.NaN, lastReduced = false;

  for (const emission of pieces.sitePieces) {
    const colour = new THREE.Color();
    const signPieces = emission.signPieces.map(createDecorShapeGeometry);
    const signGeometry = mergeGeometries(signPieces)!;
    for (const piece of signPieces) piece.dispose();
    const signTexture = new THREE.DataTexture(paintDepotSign(), DEPOT_SIGN.atlasWidth, DEPOT_SIGN.atlasHeight);
    signTexture.name = 'original-environment-depot-sign';
    signTexture.colorSpace = THREE.SRGBColorSpace;
    signTexture.generateMipmaps = true;
    signTexture.minFilter = THREE.LinearMipmapLinearFilter;
    signTexture.needsUpdate = true;
    const signMaterial = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.9 });
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.name = 'environment-industrial-depot-sign';
    sign.castShadow = false; sign.receiveShadow = false;
    group.add(sign); geometries.add(signGeometry); materials.add(signMaterial); textures.add(signTexture);
    let fanMaterial: THREE.MeshStandardMaterial | undefined;
    for (const finish of Object.keys(emission.batches) as Finish[]) {
      const shapes = emission.batches[finish];
      if (!shapes.length) continue;
      const pieces = shapes.map(createDecorShapeGeometry);
      const geometry = mergeGeometries(pieces, false);
      for (const piece of pieces) piece.dispose();
      if (!geometry) throw new Error(`environment decor: incompatible ${finish} geometry`);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...FINISHES[finish] });
      materials.add(material);
      if (finish === 'paint') fanMaterial = material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `environment-industrial-${finish}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
    }
    const fanPieces = emission.fanPieces.map(createDecorShapeGeometry);
    const fanGeometry = mergeGeometries(fanPieces)!;
    for (const piece of fanPieces) piece.dispose();
    const fanColours = new Float32Array(fanGeometry.getAttribute('position').count * 3);
    colour.setHex(0xe1d4a8);
    for (let index = 0; index < fanColours.length; index += 3) colour.toArray(fanColours, index);
    fanGeometry.setAttribute('color', new THREE.BufferAttribute(fanColours, 3));
    fanGeometry.computeBoundingBox(); fanGeometry.computeBoundingSphere();
    geometries.add(fanGeometry);
    if (!fanMaterial) throw new Error('Protected fan needs its existing matte paint material owner');
    const fan = new THREE.Mesh(fanGeometry, fanMaterial);
    fan.name = 'environment-industrial-ventilation-fan';
    fan.castShadow = false; fan.receiveShadow = false;
    fan.matrixAutoUpdate = false;
    const mount = new THREE.Matrix4().fromArray(emission.mount);
    fan.matrix.copy(mount); fan.matrixWorldNeedsUpdate = true;
    rotors.push({ mesh: fan, mount }); group.add(fan);
  }

  const report: EnvironmentDecorReport = Object.freeze({
    industrialBays: sites.length,
    vehicles: objects.filter(object => object.kind === 'delivery-van').length,
    bicycles: objects.filter(object => object.kind === 'bicycle').length,
    people: 0, motion: rotors.length ? 'ventilation' : 'none', ventilationFans: rotors.length,
    drawCalls: group.children.length,
    colourTriangles: [...geometries].reduce((sum, geometry) => sum + geometry.index!.count / 3, 0),
    geometryBytes: [...geometries].reduce((sum, geometry) => sum + geometry.index!.array.byteLength
      + Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0), 0),
    instanceBytes: 0, textureBytes: textures.size * Math.ceil(DEPOT_SIGN.atlasWidth * DEPOT_SIGN.atlasHeight * 4 * 4 / 3),
    materialOwners: materials.size, shadowDrawCalls: 0,
  });
  return {
    group, sites, objects,
    openings: sites.map(site => ({ position: site.position, yaw: site.yaw, faceWidth: site.faceWidth, height: site.height, depth: site.depth })),
    emitters: environmentEmitters(sites),
    update: (seconds, reducedMotion) => {
      if (disposed || (lastSeconds === seconds && lastReduced === reducedMotion)) return;
      lastSeconds = seconds; lastReduced = reducedMotion;
      const phase = reducedMotion || !Number.isFinite(seconds) || seconds < 0 ? 0
        : (seconds % PROTECTED_ACTIVITY.fanPeriodSeconds) / PROTECTED_ACTIVITY.fanPeriodSeconds;
      rotorTurn.makeRotationZ(phase * Math.PI * 2);
      for (const { mesh, mount } of rotors) {
        mesh.matrix.multiplyMatrices(mount, rotorTurn);
        mesh.matrixWorldNeedsUpdate = true;
      }
    },
    report: () => report,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
