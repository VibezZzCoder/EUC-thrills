/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { STREET_LIFE } from '../data/streetLife.ts';
import type { Vec3 } from '../simulation/world.ts';

/** One combined opening list per material, including each family's own height. */
export interface FacadeOpening {
  readonly position: Vec3;
  readonly yaw: number;
  readonly faceWidth: number;
  /** Omitted by legacy commercial front descriptors. */
  readonly height?: number;
  /** Inward return depth; the ordinary commercial opening uses 0.8 m. */
  readonly depth?: number;
}

/** The facade colour pass opens into real interior geometry. Closed glazing
 * retains the existing building-volume shadow proxy in both shadow maps;
 * no collider or caster silhouette is changed by this display treatment. */
export function installStreetFacadeOpenings(material: THREE.MeshStandardMaterial,
  fronts: readonly FacadeOpening[]): void {
  if (fronts.length === 0) return;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}/street-bays-v4/${fronts.length}`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.streetFronts = { value: fronts.map((front) =>
      new THREE.Vector4(front.position.x, front.position.y, front.position.z, front.yaw)) };
    shader.uniforms.streetWidths = { value: fronts.map((front) => front.faceWidth / 2 + 0.02) };
    shader.uniforms.streetHeights = { value: fronts.map((front) => front.height ?? STREET_LIFE.frontageHeight) };
    shader.uniforms.streetDepths = { value: fronts.map((front) => front.depth ?? 0.8) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vStreetWorld;').replace('#include <project_vertex>',
      `#include <project_vertex>
      vec4 streetWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        streetWorld = instanceMatrix * streetWorld;
      #endif
      vStreetWorld = (modelMatrix * streetWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      `#include <common>\nvarying vec3 vStreetWorld;
      uniform vec4 streetFronts[${fronts.length}];
      uniform float streetWidths[${fronts.length}];
      uniform float streetHeights[${fronts.length}];
      uniform float streetDepths[${fronts.length}];`).replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      for (int i = 0; i < ${fronts.length}; i++) {
        vec3 delta = vStreetWorld - streetFronts[i].xyz;
        float yaw = streetFronts[i].w;
        float lateral = dot(delta.xz, vec2(cos(yaw), -sin(yaw)));
        float depth = dot(delta.xz, vec2(sin(yaw), cos(yaw)));
        if (abs(lateral) < streetWidths[i] && delta.y > -0.05
          && delta.y < streetHeights[i]
          && depth > -streetDepths[i] && depth < 0.8) discard;
      }`);
  };
}

/** CPU counterpart for pins/negative controls; never a gameplay query. */
export function inStreetFacadeOpening(front: FacadeOpening, point: { x: number; y: number; z: number }): boolean {
  const dx = point.x - front.position.x, dz = point.z - front.position.z;
  const lateral = dx * Math.cos(front.yaw) - dz * Math.sin(front.yaw);
  const depth = dx * Math.sin(front.yaw) + dz * Math.cos(front.yaw);
  const y = point.y - front.position.y;
  return Math.abs(lateral) < front.faceWidth / 2 + 0.02 && y > -0.05
    && y < (front.height ?? STREET_LIFE.frontageHeight) && depth > -(front.depth ?? 0.8) && depth < 0.8;
}
