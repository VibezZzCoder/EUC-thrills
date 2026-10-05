/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { materialAppearance } from '../data/surfaces.ts';

/** Physical pattern scale, in metres; a local attribute supplied by the
 * paving geometry anchors the bond to each authored frontage. */
export const STREET_PAVING_PATTERN = Object.freeze({
  tileWidth: 0.6,
  tileDepth: 0.4,
  groutWidth: 0.01,
  groutMultiplier: 0.82,
  tileVariation: 0.025,
  detailFadeStarts: 0.12,
  detailFadeEnds: 0.35,
  borderWidth: 0.28,
  borderMultiplier: 0.78,
  /** A service apron has no pedestrian bond or ornamental edge, only a quiet
   * whole-footprint concrete value. No new material owner or sampler. */
  serviceConcreteMultiplier: 0.94,
});

export const STREET_PAVING_ATTRIBUTE = 'streetPavingLocal';
export const STREET_PAVING_SHADER_ANCHORS = Object.freeze({
  vertex: ['#include <common>', '#include <begin_vertex>'],
  fragment: ['#include <common>', '#include <color_fragment>'],
});

const patched = new WeakSet<THREE.MeshStandardMaterial>();

function insertOnce(source: string, anchor: string, insertion: string): string {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`street paving shader: expected one ${anchor}`);
  }
  return source.replace(anchor, `${anchor}\n${insertion}`);
}

/** Optional pre-draw contract for the root's geometry builder. Reads only;
 * never creates, rewrites or assumes world-space geometry coordinates. */
export function assertStreetPavingLocal(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const local = geometry.getAttribute(STREET_PAVING_ATTRIBUTE);
  const frame = geometry.getAttribute('streetPavingFrame');
  const service = geometry.getAttribute('streetPavingService');
  if (!position || !local || local.itemSize !== 2 || local.count !== position.count || local.normalized) {
    throw new Error('street paving geometry: streetPavingLocal must contain one unnormalized vec2 in metres per vertex');
  }
  if (!frame || frame.itemSize !== 3 || frame.count !== position.count || frame.normalized) {
    throw new Error('street paving geometry: streetPavingFrame must contain width/near/far per vertex');
  }
  if (!service || service.itemSize !== 1 || service.count !== position.count || service.normalized) {
    throw new Error('street paving geometry: streetPavingService must contain one unnormalized service flag per vertex');
  }
  for (let index = 0; index < local.count; index++) {
    if (service.getX(index) !== 0 && service.getX(index) !== 1) {
      throw new Error('street paving geometry: invalid streetPavingService flag');
    }
    if (!Number.isFinite(local.getX(index)) || !Number.isFinite(local.getY(index))) {
      throw new Error('street paving geometry: non-finite streetPavingLocal coordinate');
    }
    if (![frame.getX(index), frame.getY(index), frame.getZ(index)].every(Number.isFinite)
      || frame.getX(index) <= 0 || frame.getZ(index) <= frame.getY(index)) {
      throw new Error('street paving geometry: invalid streetPavingFrame bounds');
    }
  }
}

/** Per-material patch; prior hooks/cache keys remain chained. The ground is
 * still opaque stock Standard material and receives its native shadow path.
 * No textures, samplers, global chunks, normal/displacement or new light. */
export function installStreetPavingPattern(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (patched.has(material)) return material;
  patched.add(material);
  const compile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const p = STREET_PAVING_PATTERN;
  const number = (value: number): string => value.toFixed(6);
  const constants = [p.tileWidth, p.tileDepth, p.groutWidth, p.groutMultiplier,
    p.tileVariation, p.detailFadeStarts, p.detailFadeEnds, p.borderWidth, p.borderMultiplier, p.serviceConcreteMultiplier].map(number).join('/');
  material.customProgramCacheKey = () => `${previousKey}/street-paving-metres-v2/${constants}`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = insertOnce(shader.vertexShader, STREET_PAVING_SHADER_ANCHORS.vertex[0],
      `attribute vec2 ${STREET_PAVING_ATTRIBUTE};\nvarying vec2 vStreetPavingLocal;
      attribute vec3 streetPavingFrame;\nvarying vec3 vStreetPavingFrame;
      attribute float streetPavingService;\nvarying float vStreetPavingService;`);
    shader.vertexShader = insertOnce(shader.vertexShader, STREET_PAVING_SHADER_ANCHORS.vertex[1],
      `vStreetPavingLocal = ${STREET_PAVING_ATTRIBUTE};\nvStreetPavingFrame = streetPavingFrame;\nvStreetPavingService = streetPavingService;`);
    shader.fragmentShader = insertOnce(shader.fragmentShader, STREET_PAVING_SHADER_ANCHORS.fragment[0],
      `varying vec2 vStreetPavingLocal;
      varying vec3 vStreetPavingFrame;
      varying float vStreetPavingService;
      float streetPavingHash(vec2 tile) {
        vec3 p = fract(vec3(tile.xyx) * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      // Integrate a narrow grout interval over a pixel footprint. This keeps
      // a distant joint's average energy instead of widening a dark line.
      float streetPavingJoint(float edge, float footprint) {
        float width = max(footprint, 0.00001);
        float halfGrout = ${number(p.groutWidth / 2)};
        return clamp((halfGrout + width * 0.5 - edge) / width, 0.0, 1.0)
          - clamp((-halfGrout + width * 0.5 - edge) / width, 0.0, 1.0);
      }`);
    shader.fragmentShader = insertOnce(shader.fragmentShader, STREET_PAVING_SHADER_ANCHORS.fragment[1],
      `vec2 pavingModule = vec2(${number(p.tileWidth)}, ${number(p.tileDepth)});
      float pavingCourse = floor(vStreetPavingLocal.y / pavingModule.y);
      vec2 pavingPosition = vStreetPavingLocal
        + vec2(mod(pavingCourse, 2.0) * pavingModule.x * 0.5, 0.0);
      vec2 pavingTile = floor(pavingPosition / pavingModule);
      vec2 pavingWithin = fract(pavingPosition / pavingModule);
      vec2 pavingEdge = min(pavingWithin, vec2(1.0) - pavingWithin) * pavingModule;
      vec2 pavingPixel = fwidth(vStreetPavingLocal);
      float pavingDetail = 1.0 - smoothstep(${number(p.detailFadeStarts)},
        ${number(p.detailFadeEnds)}, max(pavingPixel.x, pavingPixel.y));
      float pavingJointX = streetPavingJoint(pavingEdge.x, pavingPixel.x);
      float pavingJointY = streetPavingJoint(pavingEdge.y, pavingPixel.y);
      float pavingJoint = 1.0 - (1.0 - pavingJointX) * (1.0 - pavingJointY);
      float pavingVariation = (streetPavingHash(pavingTile) * 2.0 - 1.0)
        * ${number(p.tileVariation)} * pavingDetail;
      float pavingGrout = mix(1.0, ${number(p.groutMultiplier)}, pavingJoint * pavingDetail);
      float pavingBorderDistance = min(vStreetPavingFrame.x * 0.5 - abs(vStreetPavingLocal.x),
        min(vStreetPavingLocal.y - vStreetPavingFrame.y, vStreetPavingFrame.z - vStreetPavingLocal.y));
      float pavingBorderPixel = max(max(pavingPixel.x, pavingPixel.y), 0.0001);
      float pavingBorder = 1.0 - smoothstep(${number(p.borderWidth)} - pavingBorderPixel * 0.5,
        ${number(p.borderWidth)} + pavingBorderPixel * 0.5, pavingBorderDistance);
      float pedestrianPavingShade = (1.0 + pavingVariation) * pavingGrout
        * mix(1.0, ${number(p.borderMultiplier)}, pavingBorder);
      diffuseColor.rgb *= mix(pedestrianPavingShade, ${number(p.serviceConcreteMultiplier)},
        vStreetPavingService);`);
  };
  material.needsUpdate = true;
  return material;
}

/** One GPU material owner and no texture owners. The caller owns disposal
 * through material.dispose(), alongside its merged paving geometry. */
export function createStreetPavingMaterial(): THREE.MeshStandardMaterial {
  const stone = materialAppearance('stone');
  const material = new THREE.MeshStandardMaterial({ color: stone.albedo,
    roughness: stone.roughness, metalness: stone.metalness,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'street-life-paving-stone';
  return installStreetPavingPattern(material);
}

/** Analytic counterpart for metre-scale and filtering contract pins only;
 * shader compilation/rendered acceptance still belongs to browser evidence. */
export function streetPavingShade(x: number, y: number, pixelWidth = 0, pixelDepth = 0): number {
  if (![x, y, pixelWidth, pixelDepth].every(Number.isFinite) || pixelWidth < 0 || pixelDepth < 0) {
    throw new Error('street paving shade: coordinates and nonnegative pixel footprints must be finite');
  }
  const p = STREET_PAVING_PATTERN;
  const fract = (value: number): number => value - Math.floor(value);
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const row = Math.floor(y / p.tileDepth);
  const offset = (row - Math.floor(row / 2) * 2) * p.tileWidth / 2;
  const tileX = Math.floor((x + offset) / p.tileWidth), tileY = Math.floor(y / p.tileDepth);
  const withinX = fract((x + offset) / p.tileWidth), withinY = fract(y / p.tileDepth);
  const joint = (edge: number, footprint: number): number => {
    const width = Math.max(footprint, 0.00001), half = p.groutWidth / 2;
    return clamp((half + width * 0.5 - edge) / width) - clamp((-half + width * 0.5 - edge) / width);
  };
  const jx = joint(Math.min(withinX, 1 - withinX) * p.tileWidth, pixelWidth);
  const jy = joint(Math.min(withinY, 1 - withinY) * p.tileDepth, pixelDepth);
  const amount = clamp((Math.max(pixelWidth, pixelDepth) - p.detailFadeStarts)
    / (p.detailFadeEnds - p.detailFadeStarts));
  const detail = 1 - amount * amount * (3 - 2 * amount);
  const h = [fract(tileX * 0.1031), fract(tileY * 0.1031), fract(tileX * 0.1031)];
  const dot = h[0] * (h[1] + 33.33) + h[1] * (h[2] + 33.33) + h[2] * (h[0] + 33.33);
  const hash = fract((h[0] + dot + h[1] + dot) * (h[2] + dot));
  const variation = (hash * 2 - 1) * p.tileVariation * detail;
  const grout = 1 - (1 - p.groutMultiplier) * (1 - (1 - jx) * (1 - jy)) * detail;
  return (1 + variation) * grout;
}
