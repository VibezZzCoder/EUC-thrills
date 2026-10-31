/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { buildYardScenery } from '../level/yardScenery.ts';

/**
 * Foundry Yard's coping pipe and plinth panels as one mesh
 * (`level/yardScenery.ts`), with critic pass 1's pool coping, poured lips,
 * floor joints and stains and face paint in the same buffers: one draw call
 * in the colour pass, none in the shadow pass — a six-centimetre pipe flush
 * with the deck and paint a few centimetres off a surface cast nothing a
 * player could read. Vertex-colour matte, double-sided, never queried. Null
 * on every plan that carries neither. Critic pass 2 (F2): as rough as the
 * pavement it lies on (0.92 against 0.95), so a stain darker than the floor
 * never glints lighter than it toward the sun.
 */
/** The scenery mesh's roughness: the yard concrete's own, near enough (critic pass 2, F2). */
export const YARD_SCENERY_ROUGHNESS = 0.92;

export function yardScenery(plan: LevelPlan): THREE.Mesh | null {
  const built = buildYardScenery(plan);
  if (built === null) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(built.colours, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: YARD_SCENERY_ROUGHNESS, metalness: 0, side: THREE.DoubleSide });
  // Paint over a plinth face and a pipe half sunk in the deck: a small nudge
  // toward the camera keeps both off the surface they lie on at distance.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'level-yard-scenery';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
