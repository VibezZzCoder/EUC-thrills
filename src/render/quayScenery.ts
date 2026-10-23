/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { buildQuayScenery, type SceneryLayer } from '../level/quayScenery.ts';

/** Two layers as one, in order: one buffer, one draw call. */
function joined(a: SceneryLayer, b: SceneryLayer): SceneryLayer {
  const cat = (x: Float32Array, y: Float32Array): Float32Array => { const out = new Float32Array(x.length + y.length); out.set(x); out.set(y, x.length); return out; };
  return { positions: cat(a.positions, b.positions), normals: cat(a.normals, b.normals), colours: cat(a.colours, b.colours) };
}

/**
 * Quay Quarter's dressing as two meshes (`level/quayScenery.ts`): the ground
 * layer, drawn just over the field and casting nothing, with the fine railing
 * bars that cast nothing either; and the raised layer, which casts. Both are
 * double-sided vertex-colour matte; neither is queried.
 */
export function quayScenery(plan: LevelPlan): THREE.Mesh[] {
  const built = buildQuayScenery(plan);
  if (built === null) return [];
  const mesh = (layer: SceneryLayer, name: string, casts: boolean): THREE.Mesh => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(layer.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(layer.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(layer.colours, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    // Under the markings (−2) and over the field: paint stays on top of paving.
    // The fine bars ride the same offset; a depth nudge that small is lost on a rail in the air.
    if (!casts) { material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1; }
    const out = new THREE.Mesh(geometry, material);
    out.name = name; out.receiveShadow = true; out.castShadow = casts;
    return out;
  };
  return [mesh(joined(built.ground, built.fine), 'quay-scenery-ground', false), mesh(built.raised, 'quay-scenery-raised', true)];
}
