/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * What three.js set up before a WebGL context loss, released while the loss
 * lasts — M39 A28 follow-up (builder CL; `docs/M39_ULTRA.md` §9, F-A4's
 * residual and N3).
 *
 * **The fault.** three 0.185.1 answers `webglcontextrestored` with
 * `initGLContext()`, which builds all-new bookkeeping (`WebGLProperties`,
 * `WebGLTextures`, `WebGLGeometries`, `WebGLObjects`, `WebGLBindingStates`,
 * `WebGLShadowMap`, `WebGLEnvironments`, …). Every geometry, texture, render
 * target and instanced mesh three set up before the loss keeps a `dispose`
 * listener bound to the *old* bookkeeping, which still holds that object's
 * WebGL handles from the lost context. The first `dispose()` after the
 * restore — a world swap, a quality change, an Ultra exit — deletes those
 * handles on the restored context, and WebGL rejects every one with
 * INVALID_OPERATION ("object does not belong to this context"). Nothing is
 * drawn wrong (a rejected delete frees and binds nothing), but the error flag
 * is set, Ultra's activation reads it, and each restore leaves the old
 * bookkeeping reachable from those listeners until the objects die.
 *
 * **The release.** While a context is lost WebGL makes every delete a silent
 * no-op. So the renderer's `webglcontextlost` handler — after three's own,
 * before any restore, while the pre-loss bookkeeping is still the current
 * one — dispatches `dispose` on everything three can have set up. Each
 * pre-loss listener runs then, frees its bookkeeping entry and removes
 * itself. After the restore three sets each object up again the first time
 * it is drawn, from the same CPU data, into the new bookkeeping — exactly as
 * it would have without this — so a later `dispose()` deletes only live
 * handles, and nothing holds the old bookkeeping any more.
 *
 * In three 0.185.1 `dispose()` on a texture, a geometry, a render target or a
 * material **is** that event and nothing else; an instanced mesh's also drops
 * its morph texture, so it is sent the bare event instead. Nothing here takes
 * anything off the scene or writes a field of any object: the first frame
 * after the restore draws what the last frame before the loss drew.
 *
 * **What is walked.**
 * - Every object under each root, visible or not: its geometry, its
 *   material(s), its custom depth and distance materials; an instanced mesh
 *   itself (three keeps its instance attributes under a listener on the
 *   mesh) and its morph texture; a skinned mesh's bone texture; a light's
 *   shadow map and blur pass. A scene adds its background, environment and
 *   override material.
 * - Per material: every texture among its own fields, its `uniforms` (a
 *   `ShaderMaterial`'s), and the uniforms three last built a program with
 *   (`renderer.properties`), which carry whatever an `onBeforeCompile` patch
 *   added — Ultra's ground detail, facade maps and far map among them.
 * - A render target's texture leads to its target (`texture.renderTarget`),
 *   and a target to its textures and its depth texture.
 * - `extras`: what the renderer holds off the scene graph (the painted sky
 *   under Ultra, whose drawn background is its own cube).
 *
 * Type-only three import, so `node --test` imports it (`contextLoss.test.ts`).
 */
import type * as THREE from 'three';

/**
 * The part of three's `renderer.properties` this reads: whether three keeps a
 * record for an object, and the record — for a material, the `uniforms` its
 * last program was built with.
 */
export interface ThreeBookkeeping {
  has(object: unknown): boolean;
  get(object: unknown): unknown;
}

/** Everything the walk found, one set per kind — each object once. */
export interface LostContextHoldings {
  readonly geometries: ReadonlySet<THREE.BufferGeometry>;
  readonly textures: ReadonlySet<THREE.Texture>;
  readonly targets: ReadonlySet<THREE.RenderTarget>;
  readonly materials: ReadonlySet<THREE.Material>;
  readonly instanced: ReadonlySet<THREE.InstancedMesh>;
}

/** How many of each kind were sent `dispose`. */
export interface LostContextCounts {
  readonly geometries: number;
  readonly textures: number;
  readonly targets: number;
  readonly materials: number;
  readonly instanced: number;
}

/** three's own type flags, read so this module keeps a type-only three import. */
interface ThreeFlags {
  readonly isTexture?: boolean;
  readonly isRenderTarget?: boolean;
  readonly isBufferGeometry?: boolean;
  readonly isMaterial?: boolean;
  readonly isInstancedMesh?: boolean;
  readonly isSkinnedMesh?: boolean;
  readonly isLight?: boolean;
  readonly isScene?: boolean;
}

function flags(value: unknown): ThreeFlags | null {
  return value !== null && typeof value === 'object' ? value as ThreeFlags : null;
}

/**
 * Walk `roots` and `extras` for everything three can have set up on the GPU.
 * Reads only; `bookkeeping` is read with `has` before `get`, so no record is
 * created. Null skips the compiled uniforms (a headless test's choice).
 */
export function collectLostContextHoldings(
  roots: readonly THREE.Object3D[],
  extras: readonly unknown[],
  bookkeeping: ThreeBookkeeping | null,
): LostContextHoldings {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const targets = new Set<THREE.RenderTarget>();
  const materials = new Set<THREE.Material>();
  const instanced = new Set<THREE.InstancedMesh>();

  const addTarget = (target: THREE.RenderTarget): void => {
    if (targets.has(target)) return;
    targets.add(target);
    for (const texture of target.textures) addTexture(texture);
    if (target.depthTexture !== null && target.depthTexture !== undefined) addTexture(target.depthTexture);
  };

  function addTexture(texture: THREE.Texture): void {
    if (textures.has(texture)) return;
    textures.add(texture);
    const owner = flags(texture.renderTarget);
    if (owner?.isRenderTarget === true) addTarget(texture.renderTarget as THREE.RenderTarget);
  }

  /** A value that may be a three GPU object, or an array of them (a uniform's). */
  const addValue = (value: unknown, depth: number): void => {
    const kind = flags(value);
    if (kind === null) return;
    if (kind.isTexture === true) addTexture(value as THREE.Texture);
    else if (kind.isRenderTarget === true) addTarget(value as THREE.RenderTarget);
    else if (kind.isBufferGeometry === true) geometries.add(value as THREE.BufferGeometry);
    else if (kind.isMaterial === true) addMaterial(value as THREE.Material);
    else if (Array.isArray(value) && depth < 2) for (const item of value) addValue(item, depth + 1);
  };

  const addUniforms = (uniforms: unknown): void => {
    if (uniforms === null || typeof uniforms !== 'object') return;
    for (const uniform of Object.values(uniforms as Record<string, unknown>)) {
      if (uniform !== null && typeof uniform === 'object' && 'value' in uniform) {
        addValue((uniform as { value: unknown }).value, 0);
      }
    }
  };

  function addMaterial(material: THREE.Material): void {
    if (materials.has(material)) return;
    materials.add(material);
    // Own fields: `map`, `normalMap`, `envMap`, … — textures only, never a
    // walk into arbitrary objects (`userData`, `clippingPlanes`).
    for (const field of Object.values(material)) {
      if (flags(field)?.isTexture === true) addTexture(field as THREE.Texture);
    }
    addUniforms((material as { uniforms?: unknown }).uniforms);
    if (bookkeeping !== null && bookkeeping.has(material)) {
      addUniforms((bookkeeping.get(material) as { uniforms?: unknown } | undefined)?.uniforms);
    }
  }

  const addMaterials = (value: unknown): void => {
    if (Array.isArray(value)) for (const each of value) addValue(each, 1);
    else addValue(value, 0);
  };

  const visit = (object: THREE.Object3D): void => {
    const node = object as THREE.Object3D & {
      geometry?: unknown;
      material?: unknown;
      morphTexture?: unknown;
      skeleton?: { boneTexture?: unknown } | null;
      shadow?: { map?: unknown; mapPass?: unknown } | null;
      background?: unknown;
      environment?: unknown;
      overrideMaterial?: unknown;
    };
    const kind = node as ThreeFlags;
    addValue(node.geometry, 0);
    addMaterials(node.material);
    addValue(node.customDepthMaterial, 0);
    addValue(node.customDistanceMaterial, 0);
    if (kind.isInstancedMesh === true) {
      instanced.add(object as THREE.InstancedMesh);
      addValue(node.morphTexture, 0);
    }
    if (kind.isSkinnedMesh === true) addValue(node.skeleton?.boneTexture, 0);
    if (kind.isLight === true && node.shadow !== null && node.shadow !== undefined) {
      addValue(node.shadow.map, 0);
      addValue(node.shadow.mapPass, 0);
    }
    if (kind.isScene === true) {
      addValue(node.background, 0);
      addValue(node.environment, 0);
      addValue(node.overrideMaterial, 0);
    }
  };

  for (const root of roots) root.traverse(visit);
  for (const extra of extras) addValue(extra, 0);
  return { geometries, textures, targets, materials, instanced };
}

/**
 * Send each held object three's `dispose` event, once. Call only while the
 * context is lost: that is what makes every delete it causes a no-op.
 */
export function releaseLostContextHoldings(held: LostContextHoldings): LostContextCounts {
  for (const target of held.targets) target.dispose();
  for (const texture of held.textures) texture.dispose();
  for (const geometry of held.geometries) geometry.dispose();
  // The bare event: `InstancedMesh.dispose()` would also drop a morph texture.
  for (const mesh of held.instanced) mesh.dispatchEvent({ type: 'dispose' });
  for (const material of held.materials) material.dispose();
  return {
    geometries: held.geometries.size,
    textures: held.textures.size,
    targets: held.targets.size,
    materials: held.materials.size,
    instanced: held.instanced.size,
  };
}

/** `collectLostContextHoldings`, then `releaseLostContextHoldings`. */
export function releaseForLostContext(
  roots: readonly THREE.Object3D[],
  extras: readonly unknown[],
  bookkeeping: ThreeBookkeeping | null,
): LostContextCounts {
  return releaseLostContextHoldings(collectLostContextHoldings(roots, extras, bookkeeping));
}
