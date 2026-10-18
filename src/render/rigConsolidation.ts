/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';

/**
 * Draw-call consolidation for one riding rig — perf item "riders"
 * (`docs/PERFORMANCE_AUDIT_2026-10-17.md` §2, priority 1).
 *
 * Three issues one draw per mesh per pass, and a couch frame runs one colour
 * pass and one shadow pass *per pane*, so every rider mesh is submitted once
 * per pane in colour and once per pane in shadow. The rig is already built to
 * one mesh per (joint, material, flags) by `rider.ts`'s `panelMesh`; what is
 * left to merge is the handful of siblings that still share all three. This
 * runs **once, at build, before the first frame** and never per frame.
 *
 * Three tiers, in this order:
 *
 *  1. **Baked** — owner decision OD-1, 2026-10-17. Named sibling sets whose
 *     only local transform is a build-time translation nothing writes at
 *     runtime (the machine's pad pair and pedal pair, `euc.ts`). Positions
 *     become `Math.fround(p + t)`; normals, uvs and colours are copied bit for
 *     bit (never `geometry.translate`, which renormalises normals). World
 *     positions then differ from today's GPU arithmetic by float32 rounding,
 *     measured at under 26 nm. A named member that is no longer a plain,
 *     static, translation-only sibling with its partners' flags **throws**:
 *     a pair that stopped being bakeable is a build error, not a silent miss.
 *  2. **Exact** — sibling meshes under one joint that share the joint's own
 *     frame (identity local transform, compared with `===`), one material
 *     object and every per-object render flag. Vertex data is concatenated
 *     bit for bit and the kept mesh's `matrixWorld` is `parent × I`, exactly
 *     as each member's was, so every triangle reaches both passes with the
 *     same attributes, matrix, normal matrix and material.
 *  3. **Cast union** — owner decision OD-2, 2026-10-17 (`castUnion: true`).
 *     The exact tier's grouping with `castShadow` left out of the key: a
 *     same-joint, same-material panel joins its limb even when only one of
 *     them casts, and the merged mesh casts — the panel now casts the limb's
 *     shadow. Colour submissions are still bitwise the same triangles; the
 *     shadow pass gains the panels' triangles (`addedShadowTriangles`).
 *
 * **Eligibility** (every tier): a plain `Mesh` (not instanced, not skinned),
 * one opaque material, visible, no children, **empty `userData`** (which
 * excludes the ghost's `ghostSilhouette` panels and is the opt-out marker for
 * any future animated part: give it `userData.dynamic = true`), default
 * `onBeforeRender`/`onAfterRender`, an indexed geometry with no groups, no
 * morph attributes and the default draw range, and every attribute
 * non-interleaved with `StaticDrawUsage` — which structurally excludes the
 * surface-updated lofts (`riderJointSurface.ts`, `riderClothDrape.ts` set
 * `DynamicDrawUsage`). Hands and the tyre are excluded by their own runtime
 * transforms (identity frame required), the paddle because it is hung after
 * this runs, the visor because it is transparent.
 *
 * **The kept mesh** is the first *caster* of a set in creation order, or the
 * first member when none casts — so a limb keeps its own `Mesh` (name, id,
 * flags) and the panels are the ones that leave the graph. Its geometry is
 * replaced by the merged buffer; every other member is `removeFromParent()`ed.
 *
 * **Ownership.** The merged geometries belong to the returned handle and are
 * disposed by `dispose()`, once. Each member's *original* geometry stays
 * tracked by the factory that built it (`euc.ts`, `rider.ts`) and is disposed
 * by it exactly as before; it is never uploaded, because this runs before the
 * rig is ever drawn. Nothing is shared between two rigs.
 *
 * **What this never touches**: a material, a texture, a uv (atlas regions,
 * AGENTS invariants 12–14, are copied bit for bit), a joint, or any mesh a
 * runtime writer holds. A future writer on a merged-away part would write to
 * a detached object and freeze silently — which is why eligibility is
 * structural and why `rigConsolidation.test.ts` poses both builds through a
 * corpus and compares what three would submit.
 */
export interface RigConsolidation {
  /** The mesh that now draws each merged set → the meshes it absorbed (removed from the graph). */
  readonly absorbed: ReadonlyMap<THREE.Mesh, readonly THREE.Mesh[]>;
  /** Colour-pass submissions removed (absorbed members). */
  readonly savedColourCalls: number;
  /** Shadow-pass submissions removed (absorbed members that cast, beyond the kept caster). */
  readonly savedShadowCalls: number;
  /** Triangles that cast because OD-2 merged a non-casting panel into a casting limb. */
  readonly addedShadowTriangles: number;
  /** Dispose the merged geometries this pass created — and only those. Idempotent. */
  dispose(): void;
}

export interface ConsolidateOptions {
  /** Sets of sibling mesh names whose static translation is baked (OD-1). */
  readonly bake?: readonly (readonly string[])[];
  /** Merge a same-joint, same-material set even when only some members cast (OD-2). */
  readonly castUnion?: boolean;
}

const DEFAULT_ON_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const DEFAULT_ON_AFTER_RENDER = THREE.Object3D.prototype.onAfterRender;

function isIdentity(object: THREE.Object3D): boolean {
  const { position: p, quaternion: q, scale: s } = object;
  return p.x === 0 && p.y === 0 && p.z === 0
    && q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1
    && s.x === 1 && s.y === 1 && s.z === 1;
}

function isPureTranslation(object: THREE.Object3D): boolean {
  const { quaternion: q, scale: s } = object;
  return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1
    && s.x === 1 && s.y === 1 && s.z === 1;
}

/** Names, layouts and array types of every attribute; null when one is interleaved or not static. */
function attributeSignature(geometry: THREE.BufferGeometry): string | null {
  const parts: string[] = [];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true) return null;
    const plain = attribute as THREE.BufferAttribute;
    // A surface updater owns it (`riderJointSurface.ts`, `riderClothDrape.ts`).
    if (plain.usage !== THREE.StaticDrawUsage) return null;
    parts.push(`${name}:${plain.itemSize}:${plain.normalized}:${plain.array.constructor.name}`);
  }
  return parts.join('|');
}

/** Eligible for any tier: a plain, visible, opaque, static, single-material mesh. */
function eligible(mesh: THREE.Mesh): boolean {
  const material = mesh.material;
  const geometry = mesh.geometry;
  return mesh.isMesh === true
    && (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh !== true
    && (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true
    && !Array.isArray(material)
    && material.transparent === false
    && mesh.visible
    && mesh.children.length === 0
    && Object.keys(mesh.userData).length === 0
    && mesh.onBeforeRender === DEFAULT_ON_BEFORE_RENDER
    && mesh.onAfterRender === DEFAULT_ON_AFTER_RENDER
    && geometry.groups.length === 0
    && Object.keys(geometry.morphAttributes).length === 0
    && geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity
    && geometry.index !== null
    && attributeSignature(geometry) !== null;
}

/** Every per-object flag three keys a submission on, plus the vertex layout. */
function flagKey(mesh: THREE.Mesh, withCast: boolean): string {
  return [
    // The material *object*: one uuid per instance, so two materials that
    // merely look alike never share a key.
    (mesh.material as THREE.Material).uuid,
    withCast ? mesh.castShadow : '*',
    mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled, mesh.layers.mask,
    attributeSignature(mesh.geometry),
  ].join('#');
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index !== null ? geometry.index.count : geometry.attributes.position.count) / 3;
}

/**
 * Concatenate members' vertex data bit for bit, in member order. `offsets[i]`
 * translates member i's positions (the baked tier) and is null otherwise.
 */
function concatenate(
  members: readonly THREE.Mesh[],
  offsets: readonly (THREE.Vector3 | null)[],
): THREE.BufferGeometry {
  const first = members[0].geometry;
  const merged = new THREE.BufferGeometry();
  let vertices = 0;
  for (const member of members) vertices += member.geometry.attributes.position.count;
  for (const name of Object.keys(first.attributes)) {
    const template = first.attributes[name] as THREE.BufferAttribute;
    const ArrayType = template.array.constructor as new (length: number) => THREE.TypedArray;
    const array = new ArrayType(vertices * template.itemSize);
    let at = 0;
    for (let index = 0; index < members.length; index += 1) {
      const source = members[index].geometry.attributes[name] as THREE.BufferAttribute;
      const offset = offsets[index];
      if (name === 'position' && offset !== null) {
        const from = source.array;
        for (let i = 0; i < source.count; i += 1) {
          array[at + i * 3] = Math.fround(from[i * 3] + offset.x);
          array[at + i * 3 + 1] = Math.fround(from[i * 3 + 1] + offset.y);
          array[at + i * 3 + 2] = Math.fround(from[i * 3 + 2] + offset.z);
        }
      } else {
        array.set((source.array as THREE.TypedArray).subarray(0, source.count * template.itemSize), at);
      }
      at += source.count * template.itemSize;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, template.itemSize, template.normalized));
  }
  let indices = 0;
  for (const member of members) indices += member.geometry.index!.count;
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let at = 0;
  let base = 0;
  for (const member of members) {
    const source = member.geometry.index!;
    for (let i = 0; i < source.count; i += 1) index[at + i] = source.getX(i) + base;
    at += source.count;
    base += member.geometry.attributes.position.count;
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

export function consolidateRig(root: THREE.Object3D, options: ConsolidateOptions = {}): RigConsolidation {
  const absorbed = new Map<THREE.Mesh, THREE.Mesh[]>();
  const owned: THREE.BufferGeometry[] = [];
  let savedColourCalls = 0;
  let savedShadowCalls = 0;
  let addedShadowTriangles = 0;

  /** `members` in creation order; `offsets` aligned with them. */
  const commit = (members: THREE.Mesh[], offsets: (THREE.Vector3 | null)[]): void => {
    const keep = members.find((mesh) => mesh.castShadow) ?? members[0];
    const casters = members.filter((mesh) => mesh.castShadow).length;
    const merged = concatenate(members, offsets);
    owned.push(merged);
    if (casters > 0) {
      for (const mesh of members) if (!mesh.castShadow) addedShadowTriangles += triangleCount(mesh.geometry);
    }
    keep.geometry = merged;
    if (offsets[members.indexOf(keep)] !== null) {
      keep.position.set(0, 0, 0);
      keep.updateMatrix();
    }
    const others = members.filter((mesh) => mesh !== keep);
    for (const other of others) other.removeFromParent();
    absorbed.set(keep, others);
    savedColourCalls += others.length;
    savedShadowCalls += Math.max(0, casters - 1);
  };

  // 1. Baked tier first, by name, so the exact pass cannot claim a member.
  const claimed = new Set<THREE.Mesh>();
  for (const names of options.bake ?? []) {
    const found = names.map((name) => root.getObjectByName(name) as THREE.Mesh | undefined);
    if (found.some((mesh) => mesh === undefined)) continue; // a rig without that set
    const meshes = found as THREE.Mesh[];
    const parent = meshes[0].parent;
    const key = flagKey(meshes[0], true);
    for (const mesh of meshes) {
      if (mesh.parent !== parent || !eligible(mesh) || !isPureTranslation(mesh) || flagKey(mesh, true) !== key) {
        throw new Error(
          `consolidateRig: ${names.join(' + ')} is no longer a bakeable static set (${mesh.name})`,
        );
      }
    }
    const ordered = [...meshes].sort((a, b) => a.id - b.id);
    commit(ordered, ordered.map((mesh) => mesh.position.clone()));
    for (const mesh of ordered) claimed.add(mesh);
  }

  // 2 + 3. Identity-frame siblings, grouped per parent by material and flags
  // (`castShadow` left out of the key under OD-2's cast union).
  const parents: THREE.Object3D[] = [];
  root.traverse((node) => { parents.push(node); });
  const withCast = options.castUnion !== true;
  for (const parent of parents) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh !== true || claimed.has(mesh) || !eligible(mesh) || !isIdentity(mesh)) continue;
      const key = flagKey(mesh, withCast);
      const list = groups.get(key);
      if (list === undefined) groups.set(key, [mesh]);
      else list.push(mesh);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.id - b.id);
      commit(list, list.map(() => null));
    }
  }

  return {
    absorbed,
    savedColourCalls,
    savedShadowCalls,
    addedShadowTriangles,
    dispose(): void {
      for (const geometry of owned) geometry.dispose();
      owned.length = 0;
    },
  };
}
