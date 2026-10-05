/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { ENVIRONMENT_VEGETATION as RULES, VEGETATION_TIER_DETAIL } from '../data/tuning.ts';
import { prepareEnvironmentVegetation, type PreparedEnvironmentVegetation, type Clump } from './environmentVegetationPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import { positionHash01 } from '../shared/maths.ts';
import { installGrassDistanceCell } from './grassDistance.ts';
import { HIGH_VEGETATION_DETAIL, type VegetationDistanceDetail, type VegetationDistanceRules } from './vegetationDistance.ts';
import { freezeStaticTransforms } from './staticTransforms.ts';

export interface EnvironmentVegetationReport {
  readonly detail: 'ordinary' | 'ultra';
  readonly clumps: number;
  readonly blades: number;
  /** Submitted colour work before ordinary frustum/distance culling. */
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly textureBytes: 0;
  readonly materialOwners: number;
  readonly geometryOwners: number;
  readonly shadowDrawCalls: 0;
  readonly clockSeconds: number;
  readonly reducedMotion: boolean;
  readonly candidateChecks: number;
  readonly candidateStride: number;
  readonly ordinaryClumps: number;
  /** Ordinary work after a shared-view demotion, even while Ultra is cached. */
  readonly ordinaryDrawCalls: number;
  readonly ordinaryColourTriangles: number;
  readonly ultraClumps: number;
  readonly populationCapped: boolean;
  /** Accepted reservoir roots within the ground-cover band beside a corridor. */
  readonly corridorClumps: number;
  /** First Ultra selection may retain its GPU capacity while drawing ordinary. */
  readonly ultraCached: boolean;
  readonly disposed: boolean;
}

export interface EnvironmentVegetation {
  readonly group: THREE.Group;
  update(seconds: number, reducedMotion: boolean): void;
  setDetail(ultra: boolean): void;
  /** Re-key the grass program to the owner's current distance rules now,
   * rather than at the next draw (a renderer's program warm-up). */
  syncDetail(): void;
  report(): EnvironmentVegetationReport;
  dispose(): void;
}

function bladeGeometry(blades: number, salt: number): THREE.BufferGeometry {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  const root = new THREE.Color(RULES.rootColour), tip = new THREE.Color(RULES.tipColour);
  for (let blade = 0; blade < blades; blade++) {
    const angle = positionHash01(blade, salt, 61) * Math.PI * 2;
    const radius = 0.035 + positionHash01(blade, salt, 62) * 0.075;
    const bend = 0.075 + positionHash01(blade, salt, 63) * 0.050;
    const width = 0.026 + positionHash01(blade, salt, 64) * 0.016;
    const ox = Math.cos(angle) * radius, oz = Math.sin(angle) * radius;
    const begin = positions.length / 3;
    const rows = [0, 0.42, 0.80];
    for (const [row, y] of rows.entries()) for (let side = 0; side < 3; side++) {
      const theta = angle + side * Math.PI * 2 / 3, taper = 1 - y * 0.92;
      positions.push(ox + Math.cos(angle) * bend * y * y + Math.cos(theta) * width * taper,
        y, oz + Math.sin(angle) * bend * y * y + Math.sin(theta) * width * 0.28 * taper);
      const colour = root.clone().lerp(tip, y * 0.72).multiplyScalar(0.94 + positionHash01(blade, salt, 65) * 0.12 + row * 0.025);
      colours.push(colour.r, colour.g, colour.b);
    }
    const end = positions.length / 3;
    positions.push(ox + Math.cos(angle) * bend, 1, oz + Math.sin(angle) * bend);
    colours.push(tip.r, tip.g, tip.b);
    // The cross-section is CCW from above; the root cap faces down.
    indices.push(begin, begin + 1, begin + 2);
    for (let row = 0; row < rows.length - 1; row++) for (let side = 0; side < 3; side++) {
      const a = begin + row * 3 + side, b = begin + row * 3 + (side + 1) % 3;
      const c = a + 3, d = b + 3;
      indices.push(a, c, b, b, c, d);
    }
    for (let side = 0; side < 3; side++) indices.push(begin + (rows.length - 1) * 3 + side,
      end, begin + (rows.length - 1) * 3 + (side + 1) % 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
}

/** One world owner. Ordinary boot allocates ordinary instances only. First
 * Ultra selection adds render capacity once; later selections reuse it. */
export function createEnvironmentVegetation(plan: LevelPlan, prepared: PreparedEnvironmentVegetation = prepareEnvironmentVegetation(plan),
  distanceDetail: VegetationDistanceDetail = HIGH_VEGETATION_DETAIL): EnvironmentVegetation {
  if (prepared.source !== plan) throw new Error('Vegetation preparation source mismatch');
  const group = new THREE.Group(); group.name = 'environment-vegetation';
  // The prepared CPU clumps are borrowed; teardown owns only this local list.
  const clumps = [...prepared.clumps];
  const { ordinaryClumps, corridorClumps, populationCapped, candidateChecks, stride, batches } = prepared;
  const windClock = { value: 0 }, windAmount = { value: 0 };
  const meshes: { key: string; entries: Clump[]; base: THREE.InstancedMesh | null;
    extra: THREE.InstancedMesh | null; ordinary: number }[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const distanceCells = new Map<THREE.InstancedMesh, () => void>();
  let material: THREE.MeshStandardMaterial | null = null;
  let detail: EnvironmentVegetationReport['detail'] = 'ordinary', clockSeconds = 0;
  let reducedMotion = false, disposed = false, ultraCached = false;
  // RL-1: the fade the grass program is compiled for. High keeps the original
  // defines, cache key and shader text exactly; a reduced tier adds two
  // defines, which three folds into the program key, so it is its own program.
  let keyedFade: VegetationDistanceRules = distanceDetail();
  const keyFade = (): void => {
    const defines = material!.defines as Record<string, string>;
    if (keyedFade === VEGETATION_TIER_DETAIL.high) { delete defines.VEGETATION_FADE_START; delete defines.VEGETATION_FADE_END; }
    else {
      defines.VEGETATION_FADE_START = keyedFade.grassFadeStartMetres.toFixed(1);
      defines.VEGETATION_FADE_END = keyedFade.grassFadeEndMetres.toFixed(1);
    }
  };
  const syncFade = (): void => {
    if (!material || distanceDetail() === keyedFade) return;
    keyedFade = distanceDetail(); keyFade(); material.needsUpdate = true;
  };
  if (clumps.length > 0) {
    const baseGeometry = bladeGeometry(RULES.ordinaryBlades, 31);
    geometries.push(baseGeometry);
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RULES.roughness, metalness: 0 });
    material.name = 'environment-vegetation-grass';
    material.customProgramCacheKey = () => 'environment-vegetation-v2';
    keyFade();
    // Before every draw's program check, so each pane's skip and shader agree.
    material.onBeforeRender = syncFade;
    material.onBeforeCompile = shader => {
      shader.uniforms.vegetationClock = windClock; shader.uniforms.vegetationWind = windAmount;
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nuniform float vegetationClock;\nuniform float vegetationWind;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 vegetationAnchor = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          vegetationAnchor = instanceMatrix * vegetationAnchor;
        #endif
        vegetationAnchor = modelMatrix * vegetationAnchor;
        float vegetationPhase = vegetationAnchor.x * 0.091 + vegetationAnchor.z * 0.117;
        float vegetationBend = transformed.y * transformed.y * vegetationWind;
        transformed.x += vegetationBend * (sin(vegetationClock * ${(RULES.windCycles[0] * Math.PI * 2 / RULES.windPeriodSeconds).toFixed(12)} + vegetationPhase)
          + 0.45 * sin(vegetationClock * ${(RULES.windCycles[1] * Math.PI * 2 / RULES.windPeriodSeconds).toFixed(12)} - vegetationPhase * 0.37));
        transformed.z += vegetationBend * (cos(vegetationClock * ${(RULES.windCycles[2] * Math.PI * 2 / RULES.windPeriodSeconds).toFixed(12)} + vegetationPhase * 0.83)
          + 0.45 * sin(vegetationClock * ${(RULES.windCycles[3] * Math.PI * 2 / RULES.windPeriodSeconds).toFixed(12)} + vegetationPhase));
        transformed *= 1.0 - smoothstep(${keyedFade.grassFadeStartMetres.toFixed(1)}, ${keyedFade.grassFadeEndMetres.toFixed(1)},
          distance(vegetationAnchor.xyz, cameraPosition));`);
    };
    // Partition the admitted population, not the mostly empty whole-world
    // rectangle: large empty fields must not disable useful frustum culling.
    for (const [key, entries] of batches) {
      const ordinary = entries.filter(entry => entry.ordinary).length;
      const clumpEntries = entries.map(entry => entry.clump);
      const base = ordinary > 0 ? buildMesh(baseGeometry, `environment-grass-base-${key}`, clumpEntries, ordinary) : null;
      meshes.push({ key, entries: clumpEntries, base, extra: null, ordinary });
    }
  }
  function buildMesh(geometry: THREE.BufferGeometry, name: string, entries: readonly Clump[], capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material!, capacity);
    mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let index = 0; index < capacity; index++) {
      const clump = entries[index];
      position.set(clump.x, clump.y, clump.z); scale.set(1, clump.height, 1);
      rotation.setFromUnitVectors(up, normal.set(clump.nx, clump.ny, clump.nz));
      yaw.setFromAxisAngle(up, clump.yaw); rotation.multiply(yaw); matrix.compose(position, rotation, scale);
      tint.setRGB(clump.tint, clump.tint, clump.tint); mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, tint);
    }
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    if (mesh.boundingBox) mesh.boundingBox.expandByScalar(RULES.windMetres * 3);
    if (mesh.boundingSphere) mesh.boundingSphere.radius += RULES.windMetres * 3;
    distanceCells.set(mesh, installGrassDistanceCell(mesh, distanceDetail));
    group.add(mesh);
    // A cached Ultra expansion may add meshes after the renderer has captured
    // this immutable world owner. New children inherit that same promise.
    if (!group.matrixWorldAutoUpdate) freezeStaticTransforms(mesh);
    return mesh;
  }
  function cacheUltra(): void {
    if (ultraCached || clumps.length === 0) return;
    const extraGeometry = bladeGeometry(RULES.enrichmentBlades, 37);
    geometries.push(extraGeometry);
    for (const batch of meshes) {
      if (!batch.base || batch.base.instanceMatrix.count < batch.entries.length) {
        const old = batch.base;
        batch.base = buildMesh(geometries[0], `environment-grass-base-${batch.key}`, batch.entries, batch.entries.length);
        // InstancedMesh.dispose releases its own buffers, never the shared
        // blade geometry or material, whose owner survives this replacement.
        if (old) { distanceCells.get(old)?.(); distanceCells.delete(old); old.removeFromParent(); old.dispose(); }
      }
      batch.extra = buildMesh(extraGeometry, `environment-grass-ultra-${batch.key}`, batch.entries, batch.entries.length);
    }
    ultraCached = true;
  }
  return { group,
    update(seconds, reduced) {
      if (disposed) return;
      clockSeconds = Number.isFinite(seconds) ? seconds : 0; reducedMotion = reduced;
      windClock.value = ((clockSeconds % RULES.windPeriodSeconds) + RULES.windPeriodSeconds) % RULES.windPeriodSeconds;
      windAmount.value = reduced ? 0 : RULES.windMetres;
      syncFade();
    },
    syncDetail() { if (!disposed) syncFade(); },
    setDetail(ultra) {
      if (disposed) return;
      if (detail === (ultra ? 'ultra' : 'ordinary')) return;
      if (ultra) cacheUltra();
      detail = ultra ? 'ultra' : 'ordinary';
      for (const batch of meshes) {
        if (batch.base) { batch.base.count = ultra ? batch.entries.length : batch.ordinary; batch.base.visible = batch.base.count > 0; }
        if (batch.extra) { batch.extra.count = ultra ? batch.entries.length : 0; batch.extra.visible = batch.extra.count > 0; }
      }
    },
    report() {
      const active = disposed ? 0 : detail === 'ultra' ? clumps.length : ordinaryClumps;
      let drawCalls = 0, colourTriangles = 0, instanceBytes = 0;
      let ordinaryDrawCalls = 0, ordinaryColourTriangles = 0;
      if (!disposed) for (const batch of meshes) if (batch.base && batch.ordinary > 0) {
        ordinaryDrawCalls++;
        ordinaryColourTriangles += batch.ordinary * batch.base.geometry.index!.count / 3;
      }
      for (const batch of meshes) for (const mesh of [batch.base, batch.extra]) {
        if (!mesh) continue;
        instanceBytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
        if (mesh.visible && mesh.count > 0) { drawCalls++; colourTriangles += mesh.count * (mesh.geometry.index!.count / 3); }
      }
      const bytes = geometries.reduce((sum, geometry) => sum + geometryBytes(geometry), 0);
      return { detail, clumps: active, blades: active * (RULES.ordinaryBlades + (detail === 'ultra' ? RULES.enrichmentBlades : 0)),
        drawCalls, colourTriangles, geometryBytes: bytes, instanceBytes, textureBytes: 0,
        materialOwners: Number(material !== null), geometryOwners: geometries.length, shadowDrawCalls: 0,
        clockSeconds, reducedMotion, candidateChecks, candidateStride: stride, ordinaryClumps: disposed ? 0 : ordinaryClumps,
        ordinaryDrawCalls, ordinaryColourTriangles,
        ultraClumps: clumps.length, populationCapped,
        corridorClumps: disposed ? 0 : Math.min(active, corridorClumps), ultraCached, disposed };
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      for (const release of distanceCells.values()) release();
      distanceCells.clear();
      for (const batch of meshes) { batch.base?.dispose(); batch.extra?.dispose(); }
      for (const geometry of geometries) geometry.dispose();
      material?.dispose(); group.clear(); meshes.length = 0; geometries.length = 0;
      clumps.length = 0; material = null; ultraCached = false;
    },
  };
}
