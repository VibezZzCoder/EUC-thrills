/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { materialAppearance } from '../data/surfaces.ts';
import { COURSE_MOTTLE, groundTint, linearFromSrgbHex } from './groundNoise.ts';
import { assertStreetPavingLocal, createStreetPavingMaterial } from './streetPavingMaterial.ts';
import { exactPavingDrawsPatch, livingPavingPatch } from './exactPavingOwnership.ts';

export interface StreetPavingPieces {
  readonly positions: readonly number[];
  readonly colours: readonly number[];
  readonly pavingLocal: readonly number[];
  readonly pavingFrame: readonly number[];
  readonly pavingService: readonly number[];
  readonly colourTriangles: number;
  readonly geometryBytes: number;
}

/** Plain source arrays shared by pre-allocation admission and the installed
 * owner. The painter arguments, support fragments and service flags are unchanged. */
export function collectStreetPavingPieces(plan: LevelPlan): StreetPavingPieces | null {
  const patches = (plan.groundSurfacePatches ?? []).filter(exactPavingDrawsPatch);
  if (!patches.some(patch => patch.triangles.length)) return null;
  const positions: number[] = [], colours: number[] = [], pavingLocal: number[] = [], pavingFrame: number[] = [], pavingService: number[] = [];
  const appearance = materialAppearance('stone');
  const base = linearFromSrgbHex(appearance.albedo, { r: 1, g: 1, b: 1 });
  const tint = { r: 1, g: 1, b: 1 };
  const field = plan.heightfield, columns = field.columns - 1;
  for (const patch of patches) for (const triangle of patch.triangles) {
    // The admitted industrial service footprint and the living-world warehouse
    // bay use a plain concrete finish; surface, height and normal remain the
    // shared plan fragments.
    const service = Number(patch.footprint?.id.endsWith('-service-apron') === true || livingPavingPatch(patch));
    const row = Math.floor(triangle.cell / columns), column = triangle.cell % columns;
    groundTint(column, row, field.originX + (column + 0.5) * field.spacing,
      field.originZ + (row + 0.5) * field.spacing, appearance.mottle, base, COURSE_MOTTLE, tint);
    for (const point of triangle.vertices) {
      positions.push(point.x, point.y, point.z);
      colours.push(tint.r, tint.g, tint.b);
      const footprint = patch.footprint;
      const dx = point.x - (footprint?.origin.x ?? 0), dz = point.z - (footprint?.origin.z ?? 0);
      const yaw = footprint?.yaw ?? 0;
      pavingLocal.push(Math.cos(yaw) * dx - Math.sin(yaw) * dz,
        Math.sin(yaw) * dx + Math.cos(yaw) * dz);
      pavingFrame.push(footprint?.width ?? 1e6, footprint?.near ?? -1e6, footprint?.far ?? 1e6);
      pavingService.push(service);
    }
  }
  const vertices = positions.length / 3;
  return { positions, colours, pavingLocal, pavingFrame, pavingService,
    colourTriangles: vertices / 3,
    geometryBytes: vertices * 57 };
}

/** Exact surface fragments, on the unchanged source heightfield planes. */
export function createStreetPaving(plan: LevelPlan, pieces = collectStreetPavingPieces(plan)): {
  mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial;
} | null {
  if (!pieces) return null;
  const { positions, colours, pavingLocal, pavingFrame, pavingService } = pieces;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('streetPavingLocal', new THREE.Float32BufferAttribute(pavingLocal, 2));
  geometry.setAttribute('streetPavingFrame', new THREE.Float32BufferAttribute(pavingFrame, 3));
  geometry.setAttribute('streetPavingService', new THREE.BufferAttribute(new Uint8Array(pavingService), 1));
  geometry.computeVertexNormals();
  assertStreetPavingLocal(geometry);
  const material = createStreetPavingMaterial();
  // groundTint returns multipliers; the material owns the stone albedo.
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'street-life-paving';
  mesh.receiveShadow = true;
  return { mesh, geometry, material };
}
