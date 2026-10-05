/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Reject only grass already collapsed completely by its existing shader.
 * The decision belongs to one draw's camera, including each split pane. The
 * fade end is the owning renderer's current tier's (RL-1), the same value its
 * grass program was compiled with, so the skip stays exact. */
import * as THREE from 'three';
import { HIGH_VEGETATION_DETAIL, type VegetationDistanceDetail } from './vegetationDistance.ts';

export function installGrassDistanceCell(mesh: THREE.InstancedMesh,
  detail: VegetationDistanceDetail = HIGH_VEGETATION_DETAIL): () => void {
  if (mesh.boundingSphere === null || mesh.geometry.groups.length !== 0 || mesh.castShadow)
    throw new Error('Grass distance rejection requires conservative bounds, one opaque draw and no caster');
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  const sphere = new THREE.Sphere();
  let activeCount = mesh.count, retired = false;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group): void {
    before.call(this, renderer, scene, camera, geometry, material, group);
    activeCount = mesh.count;
    sphere.copy(mesh.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    const position = camera.matrixWorld.elements;
    const nearest = Math.hypot(position[12] - sphere.center.x,
      position[13] - sphere.center.y, position[14] - sphere.center.z) - sphere.radius;
    if (Number.isFinite(nearest) && nearest >= detail().grassFadeEndMetres) mesh.count = 0;
  };
  mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group): void {
    try { after.call(this, renderer, scene, camera, geometry, material, group); }
    finally { mesh.count = activeCount; }
  };
  return (): void => {
    if (retired) return;
    retired = true;
    mesh.count = activeCount; mesh.onBeforeRender = before; mesh.onAfterRender = after;
  };
}
