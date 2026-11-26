/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { loftNormal, loftPoint, patchGeometry, vAtHeight, type LoftProfile } from './blockoutKit.ts';

/** A closed, opaque wrap shield. Its smoothly rounded lower edge covers the
 * cheeks and chin; it is not a pointed rectangular patch across the eyes. */
export function floWrapShield(profile: LoftProfile): THREE.BufferGeometry {
  const u0 = Math.PI / 2 - 1.30, u1 = Math.PI / 2 + 1.30;
  const geometry = patchGeometry(profile, {
    u0, u1, v0: 0, v1: 1, uSegments: 32, vSegments: 12,
    lift: 0.008, sink: -0.004,
  });
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const s = uv.getX(i), t = uv.getY(i), u = u0 + (u1 - u0) * s;
    loftPoint(profile, u, t, point);
    loftNormal(profile, u, t, normal);
    const offset = (position.getX(i) - point.x) * normal.x
      + (position.getY(i) - point.y) * normal.y + (position.getZ(i) - point.z) * normal.z;
    const side = Math.sin((s - 0.5) * Math.PI) ** 2;
    const bottom = 0.084 + 0.025 * side;
    const top = 0.220 - 0.010 * side;
    const v = vAtHeight(profile, bottom + (top - bottom) * t);
    loftPoint(profile, u, v, point);
    loftNormal(profile, u, v, normal);
    point.addScaledVector(normal, offset > 0 ? 0.008 : -0.004);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Ordinary tiers have no scene environment. This local fallback integrates a
 * desaturated sky/ground reflection on the two metal surfaces, using the true
 * view and surface normal. Ultra's real PMREM takes over under USE_ENVMAP.
 * No per-pose program, texture, light, emissive patch or global shader edit. */
function skyResponse(material: THREE.MeshStandardMaterial, strength: number, key: string): void {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function floMetalCompile(shader, renderer): void {
    previousCompile.call(this, shader, renderer);
    const anchor = '#include <aomap_fragment>';
    if (!shader.fragmentShader.includes(anchor)) throw new Error('Flo metal shader anchor changed');
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}
#ifndef USE_ENVMAP
    vec3 floRay = transformDirectionByInverseViewMatrix(
      reflect(-geometryViewDir, normal), viewMatrix);
    float floHorizon = smoothstep(-0.12, 0.18, floRay.y);
    vec3 floSky = mix(vec3(0.31, 0.33, 0.32), vec3(0.34, 0.39, 0.42),
      smoothstep(0.05, 0.85, floRay.y));
    vec3 floRadiance = mix(vec3(0.095, 0.105, 0.087), floSky, floHorizon);
    vec3 floFresnel = F_Schlick(material.specularColor, material.specularF90,
      saturate(dot(normal, geometryViewDir)));
    reflectedLight.indirectSpecular += floRadiance * floFresnel * ${strength.toFixed(3)};
#endif
`);
  };
  material.customProgramCacheKey = (): string => `${previousKey}|flo-${key}-sky-v1`;
}

export function configureFloPewter(material: THREE.MeshStandardMaterial): void {
  skyResponse(material, 0.85, 'pewter');
}

export function configureFloSmoke(material: THREE.MeshStandardMaterial): void {
  skyResponse(material, 2.65, 'smoke');
}
