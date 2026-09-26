/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The static far shadow (T12) — M39 (`docs/M39_ULTRA.md` §3.4, package W4).
 *
 * **Not a light.** A second shadow-casting `DirectionalLight` is rejected
 * (§0.3): in three 0.185.1 `WebGLShadowMap.renderObject` tests object layers
 * against the *view* camera, so a shadow camera's layers filter nothing, and
 * it would add a second shadow lookup to every stock program. This is instead
 * a manual depth render — `renderer.render(scene, farCamera)` into an
 * Ultra-owned `ULTRA.farShadow.mapSize`² target (3072 since the §5 byte
 * amendment) with `farCamera.layers.set(ULTRA_STATIC_LAYER)`, a
 * `colorWrite:false` override material, `shadowMap.autoUpdate = false` and no
 * background, all restored afterwards — **once per world activation** and
 * after a context restore, never mid-ride. Only Ultra patches sample it
 * (`sampler2DShadow`, `LessEqualCompare`, four bilinear fetches = 16 hardware
 * PCF taps, `ULTRA.farShadow.pcfTaps`), blended against the near map's own
 * edge fade so nothing darkens twice (`ultraMaterials.ts`).
 *
 * **On by default on `ultra-full`** (coordinator amendment A1); `ultra-lit`
 * keeps it off. Gauntlet round 1 judges it.
 *
 * **The box is world-fitted, once — a tight light-space rectangle.** Every
 * mesh on layer 5 — the casting props, building parts and blocks; never the
 * rider, cop, ghost, particles, heightfield, markings or hazards — is bounded
 * **per instance**, as the oriented box its instance matrix makes of the
 * geometry's local bounds, and those corners are carried into the sun's light
 * space (the same basis three's own shadow camera wears, `lightBasis`). The
 * orthographic box is then fitted per axis: a rectangle, not a square. At
 * first light the fit was a square round each instanced family's *world*
 * bounding box — in town about 1.9 km on a side, because the sun's 135°
 * bearing turns a world-axis box's empty corners into light-space width — so
 * a 2048 map drew 0.92 m texels. Per instance and per axis the town is about
 * 1.37 × 1.16 km (pre-R1 calibration, `M39_ULTRA.md` §U2). No recentring and
 * no rebuild mid-ride: a 140 m-grid rebuild was rejected as a periodic hitch
 * (§3.4).
 *
 * **Back faces only**, as three's own shadow pass renders a front-sided
 * material: the stored depth is a caster's far side, so its own lit faces sit
 * in front of it and need no depth bias at 0.2–0.5 m texels, and the ground —
 * which never casts — cannot acne at all. The receiver side's small normal
 * offset (`ULTRA.farShadow.normalOffsetTexels`) keeps the bilinear footprint
 * off a caster's contact line.
 */
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import { lightBasis } from './ultraLighting.ts';
import { ULTRA_STATIC_LAYER } from './ultraRecipe.ts';

/** Bytes per far-map texel: R8 colour (minimised; nothing reads it) + 32-bit depth. */
export const FAR_SHADOW_BYTES_PER_TEXEL = 5;

// ---------------------------------------------------------------------------
// A28, F-A3: the empty far map
// ---------------------------------------------------------------------------

/**
 * GPU bytes of the empty far map (`emptyFarShadowMap`): one `DEPTH_COMPONENT24`
 * texel, which drivers store in 32 bits. The Ultra ledger charges it while a
 * world that asks for a far map has none (`ultraRuntime.ts` `steadyBytes`).
 */
export const EMPTY_FAR_SHADOW_BYTES = 4;

let emptyFarShadow: THREE.DepthTexture | null = null;

/**
 * **F-A3 (A28): what the far map's sampler is bound to when there is no far
 * map.** Every Ultra program compiled with `ULTRA_FAR` (the ground, block,
 * paint, water, pothole, facade, relief, foliage and furniture families)
 * declares `uniform sampler2DShadow ultraFarMap`. A `null` value makes three
 * 0.185.1 bind its own `emptyShadowTexture`, whose `version` is 0 and which
 * it therefore never uploads, so the unit is left without a texture and
 * ANGLE (Metal) rejects **every** draw of the program with
 * `INVALID_OPERATION`: the whole world vanishes and the draw calls are still
 * counted. The GLSL's `ultraFarEnabled < 0.5` early-out does not help — the
 * draw never happens. A world with nothing on layer 5 builds no far map
 * (`UltraFarShadow.build` returns early), and the shared uniforms hold no far
 * map before the first frame hook writes them either.
 *
 * So the shared uniform is never `null` (`ultraMaterials.ts`
 * `createUltraShared` / `updateUltraShared`): without a far map it holds this
 * texture — a 1×1 `DepthTexture` with `needsUpdate`, which three uploads
 * (`texStorage2D`, 4 B) the first time a program binds it, so the unit holds
 * a complete depth texture in compare mode, which is all a shadow sampler
 * asks. Its compare is `AlwaysCompare`: every lookup answers 1 (lit) whatever
 * the texel holds, so even a lookup the `ultraFarEnabled` gate did not stop
 * would read "no far shade", which is what no far map means. No program, key
 * or shader text changes, so a world *with* a far map draws exactly as before.
 *
 * One per module (like three's own empty textures), created on first ask —
 * headless-safe, no GL here. `releaseEmptyFarShadowMap` frees its GPU copy
 * (teardown and every world retire); the object stays valid, and three
 * uploads it again the next time a program binds it, including after a
 * context restore.
 */
export function emptyFarShadowMap(): THREE.DepthTexture {
  if (emptyFarShadow === null) {
    const texture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    texture.name = 'ultra-far-shadow-empty';
    texture.compareFunction = THREE.AlwaysCompare;
    texture.needsUpdate = true;
    emptyFarShadow = texture;
  }
  return emptyFarShadow;
}

/** Free the empty far map's GPU copy, if three made one (idempotent; the texture stays usable). */
export function releaseEmptyFarShadowMap(): void {
  emptyFarShadow?.dispose();
}

/**
 * The light-space box fitted round the static casters: the orthographic
 * rectangle the far camera renders, and where that camera hangs.
 */
export interface FarShadowBox {
  /** Box centre, world metres (light-space x/y centre, z at the far camera). */
  readonly centre: THREE.Vector3;
  /** Half the box's width along light-space x, metres. */
  readonly halfWidth: number;
  /** Half the box's height along light-space y, metres. */
  readonly halfHeight: number;
  /** Distance from the camera to the near and far planes, metres. */
  readonly near: number;
  readonly far: number;
}

/**
 * One caster's bounds: a local box and the world matrix that places it — an
 * oriented box, so a building turned 45° to the sun is bounded by its own
 * corners, not by the world-axis box round them. A plain `Box3` is a
 * world-space box (identity matrix).
 */
export interface CasterBox {
  readonly box: THREE.Box3;
  readonly matrix: THREE.Matrix4;
}

/**
 * Fit the far camera's box round the casters, in the sun's light space. Pure
 * (no renderer), so the tests can hold the fit to the claim that every
 * caster is inside.
 *
 * The box is a rectangle — each light-space axis fitted on its own and padded
 * by `ULTRA.farShadow.boxMarginMetres` — so no texel is spent on the empty
 * side of a world that is longer one way than the other. The depth range
 * runs from `depthMarginMetres` in front of the highest caster (toward the
 * sun) to the same margin behind the lowest. A receiver lower still (terrain
 * below the lowest caster) projects past the far plane, and the patch clamps
 * its compare depth to 1 — lit unless a caster really stands over it, which
 * is the right answer there too.
 *
 * Returns null for no bounds (a world with nothing on layer 5).
 */
export function fitFarShadowBox(
  bounds: readonly (THREE.Box3 | CasterBox)[],
  sunOffsetUnit: THREE.Vector3,
): FarShadowBox | null {
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  lightBasis(sunOffsetUnit, x, y, z);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const corner = new THREE.Vector3();
  for (const entry of bounds) {
    const oriented = (entry as THREE.Box3).isBox3 === true ? null : (entry as CasterBox);
    const box = oriented === null ? (entry as THREE.Box3) : oriented.box;
    if (box.isEmpty()) continue;
    for (let index = 0; index < 8; index += 1) {
      corner.set(
        index & 1 ? box.max.x : box.min.x,
        index & 2 ? box.max.y : box.min.y,
        index & 4 ? box.max.z : box.min.z,
      );
      if (oriented !== null) corner.applyMatrix4(oriented.matrix);
      const lx = corner.dot(x);
      const ly = corner.dot(y);
      const lz = corner.dot(z);
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
      if (lz < minZ) minZ = lz;
      if (lz > maxZ) maxZ = lz;
    }
  }
  if (!Number.isFinite(minX)) return null;

  const margin = ULTRA.farShadow.boxMarginMetres;
  const depthMargin = ULTRA.farShadow.depthMarginMetres;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // The camera sits `depthMargin` toward the sun from the highest caster.
  const cz = maxZ + depthMargin;
  const centre = new THREE.Vector3()
    .addScaledVector(x, cx)
    .addScaledVector(y, cy)
    .addScaledVector(z, cz);
  return {
    centre,
    halfWidth: (maxX - minX) / 2 + margin,
    halfHeight: (maxY - minY) / 2 + margin,
    near: 0,
    far: maxZ - minZ + depthMargin * 2,
  };
}

/**
 * Every visible mesh on the static layer, bounded per instance: the
 * geometry's local box and the world matrix of the mesh (times the instance
 * matrix, for each instance of an `InstancedMesh`), with world matrices
 * brought up to date first. Activation-only work — a few thousand boxes in
 * town, once per world.
 */
export function staticCasterBounds(scene: THREE.Scene): CasterBox[] {
  scene.updateMatrixWorld();
  const bounds: CasterBox[] = [];
  const probe = new THREE.Layers();
  probe.set(ULTRA_STATIC_LAYER);
  const instance = new THREE.Matrix4();
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && object.layers.test(probe)) {
      if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
      const local = mesh.geometry.boundingBox;
      if (local !== null && !local.isEmpty()) {
        const instanced = object as THREE.InstancedMesh;
        if (instanced.isInstancedMesh === true) {
          for (let index = 0; index < instanced.count; index += 1) {
            instanced.getMatrixAt(index, instance);
            bounds.push({ box: local, matrix: instance.clone().premultiply(object.matrixWorld) });
          }
        } else {
          bounds.push({ box: local, matrix: object.matrixWorld.clone() });
        }
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(scene);
  return bounds;
}

export class UltraFarShadow {
  /**
   * Edge of the square depth map, texels; the box it covers is a rectangle.
   * `ULTRA.farShadow.mapSize` (3072) is the ceiling; the runtime passes the
   * edge it sized from the drawing buffer (final wave, A22 / Fable F5:
   * `ultraShadowSizes.ts`, 2048 on a phone). Everything here — the texel, the
   * normal offset, the edge fade, the bytes — reads this, not the table.
   */
  readonly mapSize: number;

  private target: THREE.WebGLRenderTarget | null = null;
  private depth: THREE.DepthTexture | null = null;
  private readonly lightMatrix = new THREE.Matrix4();
  private allocated = 0;
  private texelX = 0;
  private texelY = 0;

  constructor(mapSize: number) {
    this.mapSize = mapSize;
  }

  /** The compare-enabled depth texture Ultra patches sample; null until built. */
  get texture(): THREE.DepthTexture | null {
    return this.depth;
  }

  /** The far map's render target, for the activation's framebuffer check (A28 C1); null until built. */
  get renderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }

  /** World → far-map texture space, `[0, 1]³` inside the box (the patches' `ultraFarMatrix`). */
  get matrix(): THREE.Matrix4 {
    return this.lightMatrix;
  }

  /** GPU bytes held (colour R8 + depth D32), for the Ultra ledger. */
  get bytes(): number {
    return this.allocated;
  }

  /**
   * World metres per far-map texel on the box's coarser axis — the figure the
   * report carries and the receiver normal offset is sized from. The box is a
   * rectangle, so the other axis is finer (`texelMetresXY`).
   */
  get texelMetres(): number {
    return Math.max(this.texelX, this.texelY);
  }

  /** World metres per texel along light-space x and y. */
  get texelMetresXY(): { readonly x: number; readonly y: number } {
    return { x: this.texelX, y: this.texelY };
  }

  /**
   * Render the layer-5 casters into the far map, fitted per instance and per
   * axis in sun space (`fitFarShadowBox`). Called outside `beginFrame`, so `renderer.info` is reset
   * before the next frame counts. The previous map (if any) is disposed
   * before the new one is allocated, so a rebuild never holds two.
   *
   * Every piece of renderer and scene state the render touches is restored in
   * a `finally`: the render target (with its cube face and mip level), the
   * shadow map's `autoUpdate`/`needsUpdate`, the background and the override
   * material. A world with nothing on layer 5 builds nothing: `texture` stays
   * null and the patches read that as no far map — their sampler is then
   * bound to `emptyFarShadowMap()`, never `null` (F-A3).
   */
  build(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sunOffsetUnit: THREE.Vector3): void {
    this.dispose();

    const box = fitFarShadowBox(staticCasterBounds(scene), sunOffsetUnit);
    if (box === null) return;

    const size = this.mapSize;
    const camera = new THREE.OrthographicCamera(
      -box.halfWidth, box.halfWidth, box.halfHeight, -box.halfHeight, box.near, box.far,
    );
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    lightBasis(sunOffsetUnit, x, y, z);
    camera.position.copy(box.centre);
    camera.lookAt(box.centre.clone().sub(z));
    camera.layers.set(ULTRA_STATIC_LAYER);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.name = 'ultra-far-shadow';
    depth.format = THREE.DepthFormat;
    depth.compareFunction = THREE.LessEqualCompare;
    // Linear filtering on a compare texture is the hardware's 2×2 PCF.
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    const target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: depth,
    });
    target.texture.name = 'ultra-far-shadow-colour';

    // Depth only, back faces only (three's own shadow convention).
    const override = new THREE.MeshDepthMaterial({ side: THREE.BackSide });
    override.colorWrite = false;

    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousLevel = renderer.getActiveMipmapLevel();
    const previousAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousNeedsUpdate = renderer.shadowMap.needsUpdate;
    const previousBackground = scene.background;
    const previousOverride = scene.overrideMaterial;
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      scene.background = null;
      scene.overrideMaterial = override;
      renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
    } catch (error) {
      target.dispose();
      depth.dispose();
      throw error;
    } finally {
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      renderer.shadowMap.autoUpdate = previousAutoUpdate;
      renderer.shadowMap.needsUpdate = previousNeedsUpdate;
      renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      override.dispose();
    }

    // World → [0, 1]³: three's own shadow-matrix bias after the far camera's
    // projection and view (`LightShadow.updateMatrices`).
    this.lightMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.lightMatrix.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);

    this.target = target;
    this.depth = depth;
    this.allocated = size * size * FAR_SHADOW_BYTES_PER_TEXEL;
    this.texelX = (box.halfWidth * 2) / size;
    this.texelY = (box.halfHeight * 2) / size;
  }

  /** Release the target. Idempotent. */
  dispose(): void {
    this.target?.dispose();
    this.depth?.dispose();
    this.target = null;
    this.depth = null;
    this.allocated = 0;
    this.texelX = 0;
    this.texelY = 0;
  }
}
