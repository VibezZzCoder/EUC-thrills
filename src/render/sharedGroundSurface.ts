/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { GROUND_PAVING, SHARED_GROUND } from '../data/tuning.ts';
import { SURFACES, materialAppearance, type MaterialId } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import { SHARED_GROUND_KINDS, sharedGroundCode, type SharedGroundKind } from './sharedGroundCodes.ts';
import { sharedShoulderCells } from './sharedStraightShoulders.ts';
export type { SharedGroundKind } from './sharedGroundCodes.ts';

export interface SharedGroundReport { textures: number; textureLayers: number; bytes: number; materials: number; transitionBytes: number }
const kinds = new Set<string>(SHARED_GROUND_KINDS);
/** CPU paint is immutable and cached once per process; each world owns only
 * its new GPU textures. Regeneration must not repaint millions of texels. */
function hash(x: number, z: number, salt: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** Periodic smooth fields; no discontinuity at the repeating texture border. */
function noise(x: number, z: number, count: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), u = ease(x - ix), v = ease(z - iz);
  const h = (a: number, b: number) => hash((a % count + count) % count, (b % count + count) % count, salt);
  const a = h(ix, iz) * (1 - u) + h(ix + 1, iz) * u;
  const b = h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}

/** R = shallow height/albedo, G = material variation. Data, not an sRGB image.
 * Every pixel is painted in code. Grass uses irregular narrow leaf strokes;
 * aggregate uses jittered rounded stones, dirt mixes worn soil and fine grit.
 * Automatic mipmaps integrate the same surface rather than switching patterns. */
export function paintSharedGround(kind: SharedGroundKind, size: number = SHARED_GROUND.textureSize): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const u = x / size, v = z / size;
    const broad = noise(u * 8, v * 8, 8, 17);
    const mid = noise(u * 32, v * 32, 32, 79);
    const grain = hash(x, z, 113);
    let height = 0.5 + (broad - 0.5) * 0.28 + (mid - 0.5) * 0.22 + (grain - 0.5) * 0.12;
    if (kind === 'grass') {
      const a = u * 23, b = v * 23, cx = Math.floor(a), cz = Math.floor(b);
      let blade = 0;
      // Jitter location, direction, length and width, including wrapped
      // neighbours. One fixed stroke per texel cell reads as a dotted grid.
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const sx = ((cx + dx) % 23 + 23) % 23, sz = ((cz + dz) % 23 + 23) % 23;
        const lx = a - cx - dx - 0.15 - hash(sx, sz, 49) * 0.7;
        const lz = b - cz - dz - 0.15 - hash(sx, sz, 50) * 0.7;
        const theta = hash(sx, sz, 51) * Math.PI * 2;
        const cross = lx * Math.cos(theta) - lz * Math.sin(theta);
        const along = lx * Math.sin(theta) + lz * Math.cos(theta);
        const stroke = Math.max(0, 1 - Math.abs(cross) / (0.065 + hash(sx, sz, 52) * 0.07))
          * Math.max(0, 1 - Math.abs(along) / (0.22 + hash(sx, sz, 53) * 0.22));
        blade = Math.max(blade, stroke * (0.25 + hash(sx, sz, 61) * 0.25));
      }
      height += blade - 0.07;
    } else if (kind === 'gravel') {
      const a = u * 30, b = v * 30, cx = Math.floor(a), cz = Math.floor(b);
      let nearest = 2;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const sx = ((cx + dx) % 30 + 30) % 30, sz = ((cz + dz) % 30 + 30) % 30;
        const px = cx + dx + 0.2 + hash(sx, sz, 33) * 0.6;
        const pz = cz + dz + 0.2 + hash(sx, sz, 89) * 0.6;
        nearest = Math.min(nearest, Math.hypot((a - px) * 1.1, b - pz));
      }
      height = 0.22 + Math.max(0, 1 - nearest / 0.58) * 0.58 + (grain - 0.5) * 0.12;
    } else if (kind === 'dirt') {
      height += (noise(u * 64, v * 64, 64, 173) - 0.5) * 0.21;
      const a = u * 24, b = v * 24, cx = Math.floor(a), cz = Math.floor(b);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const sx = ((cx + dx) % 24 + 24) % 24, sz = ((cz + dz) % 24 + 24) % 24;
        if (hash(sx, sz, 211) > 0.16) continue;
        const px = cx + dx + 0.15 + hash(sx, sz, 213) * 0.7;
        const pz = cz + dz + 0.15 + hash(sx, sz, 217) * 0.7;
        const stone = Math.max(0, 1 - Math.hypot((a - px) * 1.3, b - pz) / 0.28);
        height += stone * 0.32;
      }
    } else if (kind === 'wood') {
      height = 0.5 + Math.sin(u * Math.PI * 96 + broad * 2) * 0.10 + (mid - 0.5) * 0.15;
    } else {
      height = 0.5 + (grain - 0.5) * 0.42 + (mid - 0.5) * 0.17;
      if (kind === 'roughPavement') height += (broad - 0.5) * 0.18;
      if (kind === 'concrete') height = 0.5 + (grain - 0.5) * 0.28 + (broad - 0.5) * 0.13;
    }
    const at = (z * size + x) * 4;
    out[at] = Math.round(Math.max(0, Math.min(1, height)) * 255);
    out[at + 1] = Math.round((0.5 + (broad - 0.5) * 0.6 + (grain - 0.5) * 0.3) * 255);
    out[at + 2] = 128; out[at + 3] = 255;
  }
  return out;
}

const declarations = `varying vec2 vSharedGroundWorld;`;
const p = GROUND_PAVING;
/** Same accepted running bond in both modes, including a boundary filled by brick. */
export const SHARED_PAVING_FRAGMENT = /* glsl */ `
float sharedFootprint = length(abs(dFdx(vSharedGroundWorld)) + abs(dFdy(vSharedGroundWorld)));
float sharedRow = floor(vSharedGroundWorld.y / ${p.widthMetres.toFixed(8)});
float sharedU = vSharedGroundWorld.x / ${p.lengthMetres.toFixed(8)} + mod(sharedRow, 2.0) * 0.5;
vec2 sharedUv = vec2(sharedU, vSharedGroundWorld.y / ${p.widthMetres.toFixed(8)});
vec2 sharedDistance = min(fract(sharedUv), 1.0 - fract(sharedUv)) * vec2(${p.lengthMetres.toFixed(8)}, ${p.widthMetres.toFixed(8)});
float sharedHalfPixel = max(sharedFootprint * 0.5, 1e-5);
vec2 sharedJoint = 1.0 - smoothstep(vec2(${(p.jointMetres * 0.5).toFixed(8)} - sharedHalfPixel), vec2(${(p.jointMetres * 0.5).toFixed(8)} + sharedHalfPixel), sharedDistance);
float sharedResolved = 1.0 - smoothstep(${p.fadeStartMetres.toFixed(8)}, ${p.fadeEndMetres.toFixed(8)}, sharedFootprint);
float sharedTileTone = mod(floor(sharedU) + 2.0 * mod(sharedRow, 2.0), 3.0) - 1.0;
float sharedPavingTone = (1.0 + sharedTileTone * ${p.toneVariation.toFixed(8)} * sharedResolved)
  * (1.0 - max(sharedJoint.x, sharedJoint.y) * ${p.jointDarken.toFixed(8)} * sharedResolved);
diffuseColor.rgb *= mix(1.0, sharedPavingTone, sharedBrickCover);
`;

/** One array sampler keeps every filled fragment on its actual material's
 * metre scale. It avoids either eight samplers per material or sampling the
 * own cell's soil pattern inside a grass/asphalt fill. Layers mip separately. */
const arrayDeclarations = /* glsl */ `
uniform highp sampler2DArray sharedGroundMap;
float sharedGroundMetres(float code) {
  if (code < 0.5) return 1.0;
${SHARED_GROUND_KINDS.map((kind, i) => `  ${i ? 'else ' : ''}if (code < ${(i + 1.5).toFixed(1)}) return ${SHARED_GROUND[kind].metres.toFixed(8)};`).join('\n')}
  return 1.0;
}
vec4 sharedGroundProperties(float code) {
  if (code < 0.5) return vec4(0.0);
${SHARED_GROUND_KINDS.map((kind, i) => {
  const p = SHARED_GROUND[kind];
  return `  ${i ? 'else ' : ''}if (code < ${(i + 1.5).toFixed(1)}) return vec4(${p.contrast.toFixed(8)},${p.macroContrast.toFixed(8)},${p.reliefMetres.toFixed(8)},${p.roughnessVariation.toFixed(8)});`;
}).join('\n')}
  return vec4(0.0);
}
float sharedBaseRoughness(float code) {
  if (code < 0.5) return ${materialAppearance('brick').roughness.toFixed(8)};
${SHARED_GROUND_KINDS.map((kind, i) => `  ${i ? 'else ' : ''}if (code < ${(i + 1.5).toFixed(1)}) return ${materialAppearance(kind).roughness.toFixed(8)};`).join('\n')}
  return 1.0;
}
vec3 sharedDetailOf(float code) {
  if (code < 0.5) return vec3(0.5);
  vec2 coord = vSharedGroundWorld / sharedGroundMetres(code);
  float layer = clamp(floor(code + 0.5) - 1.0, 0.0, ${(SHARED_GROUND_KINDS.length - 1).toFixed(1)});
  vec2 first = texture(sharedGroundMap, vec3(coord,layer)).rg;
  vec2 second = texture(sharedGroundMap, vec3(mat2(0.6,-0.8,0.8,0.6) * coord * 0.73 + vec2(0.17,0.31),layer)).rg;
  float landscape = texture(sharedGroundMap, vec3(coord * 0.17 + vec2(0.39,0.71),layer)).g;
  return vec3(mix(first,second,0.28),landscape);
}
`;
let arrayPixels: Uint8Array | undefined;

export function createSharedGroundSurface(maxAnisotropy = 1, plan?: LevelPlan) {
  let map: THREE.DataArrayTexture | null = null;
  const spacing = plan?.heightfield.spacing ?? 0;
  let patched = 0, disposed = false;
  function texture(): THREE.DataArrayTexture {
    if (!map) {
      const size = SHARED_GROUND.textureSize, layerBytes = size * size * 4;
      if (!arrayPixels) {
        arrayPixels = new Uint8Array(layerBytes * SHARED_GROUND_KINDS.length);
        SHARED_GROUND_KINDS.forEach((kind, layer) => {
          arrayPixels!.set(paintSharedGround(kind),layer * layerBytes);
        });
      }
      map = new THREE.DataArrayTexture(arrayPixels,size,size,SHARED_GROUND_KINDS.length);
      map.name = 'shared-ground-material-array'; map.colorSpace = THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true; map.anisotropy = Math.max(1,maxAnisotropy);
      map.needsUpdate = true;
    }
    return map;
  }
  return {
    install(material: THREE.MeshStandardMaterial, id: MaterialId,
      edges: 'ordinary' | 'ultra' | 'none' = 'none', _ground = false): void {
      if (disposed) throw new Error('Shared ground owner is disposed');
      if (!kinds.has(id) && id !== 'brick') return;
      const kind = kinds.has(id) ? id as SharedGroundKind : null;
      // A symmetric contour can carry soil/asphalt detail into a brick cell.
      // Its own brick code is 0 (analytic paving), with a neutral array sample.
      const brickFillDetail = plan !== undefined && id === 'brick' && edges !== 'none'
        && plan.heightfield.surfaces.some(surface => sharedGroundCode(SURFACES[surface].material) > 0);
      const groundMap = kind !== null || brickFillDetail ? texture() : null;
      // The continuous edge field owns material shoulders. The retired
      // source-cell neighbour tint reintroduced rectangular patches beside a
      // straightened boundary, even when the underlying texture was seamless.
      // Retire the coarse Ultra brick module; the shared metre dimensions own paving.
      if (material.defines) delete material.defines.ULTRA_BRICK;
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
      const programCacheKey = `${key}/shared-ground-v9/${id}/${edges}/${spacing}/${groundMap ? 'array' : 'paving'}`;
      material.customProgramCacheKey = () => programCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        // Distances are in cells. A metre-scale albedo shoulder removes the
        // razor-cut wedges without moving source geometry/physical surfaces.
        if (plan && edges !== 'none') {
          const width = sharedShoulderCells(id, spacing);
          const distances = edges === 'ordinary'
            ? ['vGroundBoundaryEdge.x', 'vGroundBoundaryEdge.y', 'boundaryD']
            : ['vUltraEdge.x', 'vUltraEdge.y', 'ultraEdgeD'];
          const patterns = distances.map(distance => new RegExp(`max\\(\\s*fwidth\\(\\s*${distance.replace('.', '\\.')}\\s*\\)\\s*,\\s*1e-6\\s*\\)`, 'g'));
          // An Ultra ground material may have its edge kit disabled; its
          // guarded cover remains zero. A partial/moved anchor is an error.
          const absent = edges === 'ultra' && patterns.every(pattern => !shader.fragmentShader.match(pattern));
          for (const [index, distance] of distances.entries()) {
            if (absent) break;
            const pattern = patterns[index];
            if (shader.fragmentShader.match(pattern)?.length !== 1) {
              throw new Error(`Shared boundary shoulder anchor changed: ${distance}`);
            }
            shader.fragmentShader = shader.fragmentShader.replace(pattern,
              `max(fwidth(${distance}), ${width.toFixed(8)})`);
          }
        }
        if (edges === 'ultra') {
          const decoders = [
            ['float ultraEdgeRound = vUltraFillKind >= 15.5', 'float ultraEdgeRound = mod(vUltraFillKind,32.0) >= 15.5'],
            ['float ultraFillBits = vUltraFillKind - 16.0', 'float ultraFillBits = mod(vUltraFillKind,32.0) - 16.0'],
          ];
          const absent = decoders.every(([anchor]) => !shader.fragmentShader.includes(anchor));
          if (!absent) for (const [anchor, replacement] of decoders) {
            if (shader.fragmentShader.split(anchor).length !== 2) {
              throw new Error(`Shared ground Ultra decoder anchor changed: ${anchor}`);
            }
            shader.fragmentShader = shader.fragmentShader.replace(anchor, replacement);
          }
        }
        const anchors = ['#include <common>', '#include <begin_vertex>'];
        if (!anchors.every(anchor => shader.vertexShader.split(anchor).length === 2)
          || shader.fragmentShader.split(anchors[0]).length !== 2
          || shader.fragmentShader.split('#include <roughnessmap_fragment>').length !== 2
          || shader.fragmentShader.split('#include <normal_fragment_maps>').length !== 2) {
          throw new Error('Shared ground shader anchor changed');
        }
        shader.vertexShader = shader.vertexShader.replace(anchors[0], `${anchors[0]}\n${declarations}`)
          .replace(anchors[1], `${anchors[1]}\nvSharedGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`);
        shader.fragmentShader = shader.fragmentShader.replace(anchors[0], `${anchors[0]}\n${declarations}${groundMap ? arrayDeclarations : ''}`);
        let cover = `float sharedBrickCover = ${id === 'brick' ? '1.0' : '0.0'};`;
        if (edges === 'ordinary') cover += `\nsharedBrickCover = mix(${id === 'brick' ? '1.0' : '0.0'}, mod(floor(vGroundBoundaryMode / 4.0), 2.0), boundaryCover);`;
        if (edges === 'ultra') cover += '\n#ifdef ULTRA_EDGE\nsharedBrickCover = mix(sharedBrickCover, step(3.5, ultraFillKindOnly), ultraEdgeCover);\n#endif';
        let surface = '';
        if (groundMap) {
          shader.uniforms.sharedGroundMap = { value: groundMap };
          const ownCode = sharedGroundCode(id).toFixed(1);
          let fill = `float sharedSurfaceCover = 0.0;\nfloat sharedFillCode = ${ownCode};`;
          if (edges === 'ordinary') fill += `\nsharedSurfaceCover = boundaryCover;\nsharedFillCode = floor(vGroundBoundaryMode / 16.0);`;
          if (edges === 'ultra') fill += '\n#ifdef ULTRA_EDGE\nsharedSurfaceCover = ultraEdgeCover;\nsharedFillCode = floor(vUltraFillKind / 32.0);\n#endif';
          surface = `
${fill}
sharedFillCode = mix(${ownCode},sharedFillCode,step(0.5,sharedFillCode));
vec3 sharedOwnSample = sharedDetailOf(${ownCode});
vec3 sharedFillSample = sharedDetailOf(sharedFillCode);
vec4 sharedOwnProperties = sharedGroundProperties(${ownCode});
vec4 sharedFillProperties = sharedGroundProperties(sharedFillCode);
float sharedOwnTone = 1.0 + (sharedOwnSample.r-0.5)*sharedOwnProperties.x + (sharedOwnSample.b-0.5)*sharedOwnProperties.y;
float sharedFillTone = 1.0 + (sharedFillSample.r-0.5)*sharedFillProperties.x + (sharedFillSample.b-0.5)*sharedFillProperties.y;
diffuseColor.rgb *= mix(mix(sharedOwnTone,sharedFillTone,sharedSurfaceCover),1.0,sharedBrickCover);
roughnessFactor = mix(roughnessFactor,mix(sharedBaseRoughness(sharedFillCode),${materialAppearance('brick').roughness.toFixed(8)},sharedBrickCover),sharedSurfaceCover);
roughnessFactor = clamp(roughnessFactor + mix((sharedOwnSample.g-0.5)*sharedOwnProperties.w,
  (sharedFillSample.g-0.5)*sharedFillProperties.w,sharedSurfaceCover) * (1.0-sharedBrickCover),0.65,1.0);
float sharedHeight = mix((sharedOwnSample.r-0.5)*sharedOwnProperties.z,
  (sharedFillSample.r-0.5)*sharedFillProperties.z,sharedSurfaceCover) * (1.0-sharedBrickCover);`;
          shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 sharedDx = dFdx(-vViewPosition), sharedDy = dFdy(-vViewPosition);
vec3 sharedR1 = cross(sharedDy,normal), sharedR2 = cross(normal,sharedDx);
float sharedDet = dot(sharedDx,sharedR1);
vec3 sharedGrad = sign(sharedDet) * (dFdx(sharedHeight)*sharedR1 + dFdy(sharedHeight)*sharedR2);
if (abs(sharedDet)>1e-8) normal = normalize(abs(sharedDet)*normal-sharedGrad);`);
        }
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\n${cover}\n${surface}\n${SHARED_PAVING_FRAGMENT}`);
      };
      patched++;
    },
    report(): SharedGroundReport {
      const size = SHARED_GROUND.textureSize;
      // All mip levels down to 1×1, RGBA8; exact for this power-of-two size.
      let bytes = 0; for (let side = size; side >= 1; side /= 2) bytes += side * side * 4;
      return { textures: Number(map !== null),
        textureLayers: map ? SHARED_GROUND_KINDS.length : 0,
        bytes: map ? SHARED_GROUND_KINDS.length * bytes : 0, materials: patched,
        transitionBytes: 0 };
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      map?.dispose(); map = null;
    },
  };
}
