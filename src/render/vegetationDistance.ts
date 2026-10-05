/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Distance detail for the existing spatial conifer cells. No new mesh,
 * material, shader, clock or world/pane rebuild; the only new upload is a
 * small per-cell buffer of compacted shadow casters (PERF-R2-3). */
import * as THREE from 'three';
import { vegetationPackedPrice } from '../shared/vegetationPackedPrice.ts';
import { ENVIRONMENT_VEGETATION, VEGETATION_COUCH_DETAIL, VEGETATION_TIER_DETAIL } from '../data/tuning.ts';
import type { ConiferDistanceForms, VegetationDistanceLevel } from './vegetationForms.ts';

/** One renderer's distance boundaries: a tier's (VEGETATION_TIER_DETAIL) or
 * its couch scaling (VEGETATION_COUCH_DETAIL). Metres. */
export interface VegetationDistanceRules {
  readonly treeDetailStartMetres: number; readonly treeFarStartMetres: number;
  readonly grassFadeStartMetres: number; readonly grassFadeEndMetres: number;
}
/** One renderer's current colour-distance rules, read at draw time (RL-1). The
 * renderer owns it and passes it in; nothing module-global remembers a tier,
 * so panes, worlds and tests stay deterministic. */
export type VegetationDistanceDetail = () => VegetationDistanceRules;
export const HIGH_VEGETATION_DETAIL: VegetationDistanceDetail = () => VEGETATION_TIER_DETAIL.high;

/** The rules a renderer draws with: its ordinary tier's, or that tier's couch
 * scaling from VEGETATION_COUCH_DETAIL.minimumPanes panes on (PERF-R2-1).
 * Ultra draws one pane over High's. Frozen table entries, so equal answers are
 * the same object and a grass program re-keys only when the answer moves. */
export function vegetationDetailFor(quality: 'low' | 'medium' | 'high', panes: number, ultra: boolean): VegetationDistanceRules {
  if (ultra) return VEGETATION_TIER_DETAIL.high;
  return panes >= VEGETATION_COUCH_DETAIL.minimumPanes ? VEGETATION_COUCH_DETAIL[quality] : VEGETATION_TIER_DETAIL[quality];
}

export interface VegetationDistanceRange {
  readonly start: number;
  readonly count: number;
  readonly triangles: number;
}

export interface VegetationDistanceRanges {
  readonly near: VegetationDistanceRange;
  readonly middle: VegetationDistanceRange;
  readonly far: VegetationDistanceRange;
  /** Full allocated P/N/C plus index arrays, not one selected draw. */
  readonly geometryBytes: number;
}

const packedRanges = new WeakMap<THREE.BufferGeometry, VegetationDistanceRanges>();

type CornerWords = readonly Uint32Array[];

/** FNV over all nine Float32 bit words. Hash equality never substitutes for
 * exact P/N/C equality: collisions use a bounded open-addressed scratch table. */
function cornerHash(words: CornerWords, corner: number): number {
  let hash = 0x811c9dc5;
  for (let attribute = 0; attribute < words.length; attribute++) {
    const width = attribute === 3 ? 1 : 3;
    for (let axis = 0; axis < width; axis++) hash = Math.imul(hash ^ words[attribute][corner * width + axis], 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
function equalCorner(a: CornerWords, first: number, b: CornerWords, second: number): boolean {
  if (a.length !== b.length) return false;
  for (let attribute = 0; attribute < a.length; attribute++) {
    const width = attribute === 3 ? 1 : 3;
    for (let axis = 0; axis < width; axis++)
      if (a[attribute][first * width + axis] !== b[attribute][second * width + axis]) return false;
  }
  return true;
}
function cornerWords(form: THREE.BufferGeometry): CornerWords {
  const count = form.getAttribute('position')?.count;
  const words = ['position', 'normal', 'color', ...(form.hasAttribute('vegetationWood') ? ['vegetationWood'] : [])].map(name => {
    const source = form.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!source || source.itemSize !== (name === 'vegetationWood' ? 1 : 3) || source.count !== count || source.normalized
      || !(source.array instanceof Float32Array)) throw new Error('Distance attribute shape drift');
    return new Uint32Array(source.array.buffer, source.array.byteOffset, source.array.length);
  });
  return words as unknown as CornerWords;
}

/** Own one indexed geometry; consume/release all three fresh CPU templates.
 * Near P/N/C allocation is exact, including signed-zero Float32 bits. Lower
 * ranges reference equal COMPLETE corners, never welded positions/normals.
 * Triangle order/range counts stay verbatim; no group/material is introduced. */
export function packConiferDistanceForms(forms: ConiferDistanceForms): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  try {
    const range = (start: number, form: THREE.BufferGeometry): VegetationDistanceRange => {
      if (form.index !== null || form.groups.length !== 0) throw new Error('Distance template must have one non-indexed range');
      const count = form.getAttribute('position')?.count ?? 0;
      if (!Number.isSafeInteger(count) || count <= 0 || count % 3 !== 0) throw new Error('Distance attribute shape drift');
      return Object.freeze({ start, count, triangles: count / 3 });
    };
    const near = range(0, forms.near), middle = range(near.count, forms.middle);
    const far = range(near.count + middle.count, forms.far);
    const expected = vegetationPackedPrice({ near: near.triangles, middle: middle.triangles, far: far.triangles }, forms.near.hasAttribute('vegetationWood') ? 4 : 0);
    const nearWords = cornerWords(forms.near), middleWords = cornerWords(forms.middle), farWords = cornerWords(forms.far);
    for (const [attribute, name] of ['position', 'normal', 'color', ...(forms.near.hasAttribute('vegetationWood') ? ['vegetationWood'] : [])].entries()) {
      const values = new Float32Array(nearWords[attribute].length);
      new Uint32Array(values.buffer).set(nearWords[attribute]); // raw bit copy
      geometry.setAttribute(name, new THREE.BufferAttribute(values, name === 'vegetationWood' ? 1 : 3));
    }
    // At most one entry per near corner; capacity <4N at <=50% load.
    // No corner strings/Map chains, retained CPU lookup or camera-time work.
    let capacity = 1;
    while (capacity < near.count * 2) capacity *= 2;
    if (capacity > 0x4000_0000) throw new Error('Distance corner lookup exceeds integer addressing');
    const slots = new Uint32Array(capacity), hashes = new Uint32Array(capacity), mask = capacity - 1;
    for (let corner = 0; corner < near.count; corner++) {
      const hash = cornerHash(nearWords, corner);
      for (let probe = 0; probe < capacity; probe++) {
        const slot = (hash + probe) & mask, held = slots[slot];
        if (held === 0) { slots[slot] = corner + 1; hashes[slot] = hash; break; }
        if (hashes[slot] === hash && equalCorner(nearWords, held - 1, nearWords, corner)) break;
        if (probe === capacity - 1) throw new Error('Distance corner lookup is full');
      }
    }
    const indices = expected.indexElementBytes === 2 ? new Uint16Array(expected.indexCount) : new Uint32Array(expected.indexCount);
    // Keep the near draw's exact corner order, even when equal corners repeat.
    for (let corner = 0; corner < near.count; corner++) indices[corner] = corner;
    for (const [words, selected] of [[middleWords, middle], [farWords, far]] as const) {
      for (let corner = 0; corner < selected.count; corner++) {
        const hash = cornerHash(words, corner);
        let found = false;
        for (let probe = 0; probe < capacity; probe++) {
          const slot = (hash + probe) & mask, held = slots[slot];
          if (held === 0) break;
          if (hashes[slot] === hash && equalCorner(nearWords, held - 1, words, corner)) {
            indices[selected.start + corner] = held - 1; found = true; break;
          }
        }
        if (!found) throw new Error('Distance corner is not bit-identical to near P/N/C');
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
      + geometry.index!.array.byteLength;
    if (geometryBytes !== expected.geometryBytes) throw new Error('Distance indexed allocation price drift');
    geometry.name = `${forms.near.name}-packed-distance`;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.setDrawRange(near.start, near.count); // INDEX units; same starts/counts
    packedRanges.set(geometry, Object.freeze({ near, middle, far, geometryBytes }));
    return geometry;
  } catch (error) { geometry.dispose(); throw error; }
  finally { forms.near.dispose(); forms.middle.dispose(); forms.far.dispose(); }
}

/** Register one independently priced indexed shape. All attribute storage,
 * valid indices and exact alternative range counts are checked before hooks. */
export function registerVegetationDistanceGeometry(geometry: THREE.BufferGeometry,
  counts: Readonly<Record<VegetationDistanceLevel, number>>): void {
  if (packedRanges.has(geometry) || geometry.groups.length || !geometry.index) throw Error('Distance shape registration ownership drift');
  cornerWords(geometry);
  let cursor = 0;
  const range = (level: VegetationDistanceLevel): VegetationDistanceRange => {
    const triangles = counts[level]; if (!Number.isSafeInteger(triangles) || triangles <= 0) throw Error('Distance shape count refused');
    const out = Object.freeze({ start: cursor, count: triangles * 3, triangles }); cursor += out.count; return out;
  };
  const near = range('near'), middle = range('middle'), far = range('far');
  const vertices = geometry.getAttribute('position').count;
  if (geometry.index.count !== cursor || geometry.index.itemSize !== 1 || geometry.index.normalized
    || !(geometry.index.array instanceof Uint16Array || geometry.index.array instanceof Uint32Array)
    || Array.from(geometry.index.array).some(index => !Number.isSafeInteger(index) || index < 0 || index >= vertices)) throw Error('Distance shape actual index storage refused');
  const geometryBytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + geometry.index.array.byteLength;
  packedRanges.set(geometry, Object.freeze({ near, middle, far, geometryBytes })); geometry.setDrawRange(near.start, near.count);
}

export function vegetationDistanceRanges(geometry: THREE.BufferGeometry): VegetationDistanceRanges | null {
  return packedRanges.get(geometry) ?? null;
}

/** Worst potentially submitted topology. Packed storage is three alternatives,
 * never three simultaneous colour or shadow draws. Ordinary legacy geometry
 * continues to return its complete count, independently of a current camera. */
export function potentialGeometryTriangles(geometry: THREE.BufferGeometry): number {
  const ranges = packedRanges.get(geometry);
  return ranges ? ranges.near.triangles
    : (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
}

/** Pure decision. The nearest sphere point keeps every nearby instance on the
 * original template. A narrow diagnostic/player lens extends both boundaries.
 * No history or view index can leak into a later pane's decision; the tier's
 * boundaries arrive as an argument (High's when omitted). */
export function coniferDistanceLevel(nearestMetres: number, effectiveFovDegrees: number,
  rules: VegetationDistanceRules = VEGETATION_TIER_DETAIL.high): VegetationDistanceLevel {
  if (!Number.isFinite(nearestMetres) || !Number.isFinite(effectiveFovDegrees)
    || effectiveFovDegrees <= 0 || effectiveFovDegrees >= 180) return 'near';
  const scale = Math.max(1, Math.tan(ENVIRONMENT_VEGETATION.treeDetailReferenceFovDegrees * Math.PI / 360)
    / Math.tan(effectiveFovDegrees * Math.PI / 360));
  if (nearestMetres <= rules.treeDetailStartMetres * scale) return 'near';
  return nearestMetres <= rules.treeFarStartMetres * scale ? 'middle' : 'far';
}

/** Conservative world margin for the shadow-box test, metres. */
const SHADOW_SPHERE_MARGIN = 0.01;
/** Compacted shadow subsets per cell (PERF-R2-3): one slot per drawn pane, as
 * no more than four panes ever draw. */
const SHADOW_SLOTS = 4;
let shadowCarriers = 0;
/** A slot is empty (0), written but not yet on the GPU, or uploaded. */
const SLOT_WRITTEN = 1, SLOT_UPLOADED = 2;

/** Install after the cell's conservative sphere is computed. Hook order is
 * pinned against installed Three: renderBufferDirect reads drawRange after
 * onBeforeRender/onBeforeShadow; render-list groups must remain empty here.
 * The orthographic Ultra far-map render always takes near, as do near shadows.
 * Shared geometry mutation is scoped to one synchronous draw and restored even
 * when another cell sharing this geometry was culled.
 *
 * RL-1: High judges the cell sphere's nearest point, as accepted. A reduced
 * tier judges the nearest INSTANCE sphere instead (never nearer than the cell
 * sphere), so one close tree no longer holds a whole 64 m cell on near.
 * High's couch rules keep High's cell judging (PERF-R2-1): only the
 * boundaries scale, so a quarter pane changes form at solo High's size.
 *
 * RL-3: a shadow draw submits only the instance prefix that ends at the last
 * instance whose sphere meets that pane's shadow box, and nothing when none
 * does. Casters outside an orthographic box write no texel, so every shadow
 * map is unchanged; the near silhouette and the colour pass are untouched.
 *
 * PERF-R2-3: when the casters that reach a pane's box are not a gap-free
 * prefix, the draw submits instead the smallest slot of a small per-cell
 * buffer that holds every one of them, in their original order; any other
 * caster in it lies outside the box, so the map is unchanged, and costs only
 * until the slot is rewritten. A slot is
 * written by the draw that finds none, or a spare one to drop casters that
 * left, and serves from a later draw once three has uploaded it, which its
 * upload callback confirms; until then the draw keeps RL-3's prefix. The
 * buffer reaches the GPU as an extra, never-bound attribute of the drawn
 * geometry, because three uploads instance data before this hook runs; the
 * colour pass never sees a slot. */
export function installConiferDistanceCell(mesh: THREE.InstancedMesh,
  detail: VegetationDistanceDetail = HIGH_VEGETATION_DETAIL): () => void {
  const ranges = packedRanges.get(mesh.geometry);
  if (!ranges) return () => {};
  if (mesh.boundingSphere === null || mesh.geometry.groups.length !== 0) throw new Error('Distance cell needs conservative bounds and no groups');
  const geometry = mesh.geometry;
  const heldBefore = mesh.onBeforeRender, heldAfter = mesh.onAfterRender;
  const heldBeforeShadow = mesh.onBeforeShadow, heldAfterShadow = mesh.onAfterShadow;
  const sphere = new THREE.Sphere(); // one scratch owner, allocated at construction
  // World instance spheres from the static instance buffer, rebuilt only if
  // the owner's world matrix ever differs from the one they were built for.
  const instances = mesh.instanceMatrix.count;
  const spheres = new Float64Array(instances * 4), matrix = new THREE.Matrix4(), builtFor = new THREE.Matrix4();
  let built = false, sphereEpoch = 0;
  const worldSpheres = (): Float64Array => {
    if (built && builtFor.equals(mesh.matrixWorld)) return spheres;
    const template = geometry.boundingSphere ?? (geometry.computeBoundingSphere(), geometry.boundingSphere!);
    for (let index = 0; index < instances; index++) {
      mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
      sphere.copy(template).applyMatrix4(matrix);
      spheres[index * 4] = sphere.center.x; spheres[index * 4 + 1] = sphere.center.y;
      spheres[index * 4 + 2] = sphere.center.z; spheres[index * 4 + 3] = sphere.radius;
    }
    builtFor.copy(mesh.matrixWorld); built = true; sphereEpoch++;
    return spheres;
  };
  const box = new THREE.Frustum(), toBox = new THREE.Matrix4();
  // A shadow draw that never reached its after-hook must not leave the colour
  // pass with a prefix or a slot, so the colour hook repairs them first.
  let retired = false, shadowCount = mesh.count, shadowHeld = false;
  const colourMatrices = mesh.instanceMatrix;
  const restore = (): void => { geometry.setDrawRange(ranges.near.start, ranges.near.count); };
  // Slots are allocated by the first draw that needs one, never for cells
  // wholly inside or outside every box.
  let slots: {
    readonly data: THREE.InstancedInterleavedBuffer; readonly views: THREE.InterleavedBufferAttribute[];
    readonly carrier: string; readonly members: Uint8Array; readonly sizes: Int32Array; readonly state: Uint8Array;
    readonly used: Float64Array; readonly epoch: Float64Array; readonly limit: Int32Array; readonly version: Float64Array;
  } | null = null;
  let shadowDraws = 0;
  const reaching = new Uint8Array(instances);
  const writeSlot = (slot: number, limit: number, reached: number): void => {
    const owned = slots!, source = colourMatrices.array, target = owned.data.array, first = slot * instances;
    for (let index = 0, size = 0; index < instances; index++) {
      const member = index < limit && reaching[index] === 1;
      owned.members[first + index] = member ? 1 : 0;
      if (member) target.set(source.subarray(index * 16, index * 16 + 16), (first + size++) * 16);
    }
    owned.sizes[slot] = reached; owned.state[slot] = SLOT_WRITTEN; owned.used[slot] = shadowDraws;
    owned.epoch[slot] = sphereEpoch; owned.limit[slot] = limit; owned.version[slot] = colourMatrices.version;
    owned.data.addUpdateRange(first * 16, reached * 16); owned.data.needsUpdate = true;
  };
  /** The instance count to submit; may point `mesh.instanceMatrix` at a slot. */
  const shadowSubset = (shadowCamera: THREE.Camera, count: number): number => {
    const limit = Math.min(count, instances);
    const world = worldSpheres();
    toBox.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    box.setFromProjectionMatrix(toBox, shadowCamera.coordinateSystem, shadowCamera.reversedDepth);
    const planes = box.planes;
    let reached = 0, last = -1;
    for (let index = 0; index < limit; index++) {
      const x = world[index * 4], y = world[index * 4 + 1], z = world[index * 4 + 2];
      const reach = -(world[index * 4 + 3] + SHADOW_SPHERE_MARGIN);
      let inside = true;
      for (let plane = 0; plane < 6 && inside; plane++) {
        const { normal, constant } = planes[plane];
        inside = normal.x * x + normal.y * y + normal.z * z + constant >= reach;
      }
      reaching[index] = inside ? 1 : 0;
      if (inside) { reached++; last = index; }
    }
    // Nothing, or a gap-free prefix: RL-3's draw is already exact.
    if (reached === last + 1 || mesh.instanceMatrix !== colourMatrices) return last + 1;
    if (slots === null) {
      const data = new THREE.InstancedInterleavedBuffer(new Float32Array(SHADOW_SLOTS * instances * 16), 16, 1);
      const state = new Uint8Array(SHADOW_SLOTS);
      // Every upload carries every write made before it.
      data.onUpload(() => { for (let slot = 0; slot < SHADOW_SLOTS; slot++) if (state[slot] === SLOT_WRITTEN) state[slot] = SLOT_UPLOADED; });
      const carrier = `vegetationShadowSlots${++shadowCarriers}`;
      geometry.setAttribute(carrier, new THREE.InterleavedBufferAttribute(data, 16, 0));
      slots = { data, carrier, state, views: Array.from({ length: SHADOW_SLOTS }, (_, slot) => new THREE.InterleavedBufferAttribute(data, 16, slot * instances * 16)),
        members: new Uint8Array(SHADOW_SLOTS * instances), sizes: new Int32Array(SHADOW_SLOTS), used: new Float64Array(SHADOW_SLOTS),
        epoch: new Float64Array(SHADOW_SLOTS), limit: new Int32Array(SHADOW_SLOTS), version: new Float64Array(SHADOW_SLOTS) };
    }
    shadowDraws++;
    let best = -1, victim = 0;
    for (let slot = 0; slot < SHADOW_SLOTS; slot++) {
      if (slots.used[slot] < slots.used[victim]) victim = slot;
      if (slots.state[slot] !== SLOT_UPLOADED || slots.epoch[slot] !== sphereEpoch || slots.limit[slot] !== limit
        || slots.version[slot] !== colourMatrices.version || (best >= 0 && slots.sizes[slot] >= slots.sizes[best])) continue;
      let covers = true;
      for (let index = 0, first = slot * instances; index <= last && covers; index++) covers = reaching[index] === 0 || slots.members[first + index] === 1;
      if (covers) best = slot;
    }
    if (best >= 0) slots.used[best] = shadowDraws;
    // A spare slot is empty, or one no draw used in this cell's last SHADOW_SLOTS.
    if (best < 0 || (slots.sizes[best] > reached && victim !== best
      && (slots.state[victim] === 0 || slots.used[victim] < shadowDraws - SHADOW_SLOTS))) writeSlot(victim, limit, reached);
    if (best < 0 || slots.sizes[best] > last) return last + 1;
    (mesh as unknown as { instanceMatrix: THREE.InterleavedBufferAttribute }).instanceMatrix = slots.views[best];
    return slots.sizes[best];
  };
  const restoreShadow = (): void => {
    mesh.count = shadowCount; shadowHeld = false;
    if (slots?.views.includes(mesh.instanceMatrix as unknown as THREE.InterleavedBufferAttribute)) mesh.instanceMatrix = colourMatrices;
  };
  mesh.onBeforeRender = function (renderer, scene, camera, drawnGeometry, material, group): void {
    heldBefore.call(this, renderer, scene, camera, drawnGeometry, material, group);
    if (shadowHeld) restoreShadow();
    let level: VegetationDistanceLevel = 'near';
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera === true) {
      const rules = detail();
      sphere.copy(mesh.boundingSphere!).applyMatrix4(mesh.matrixWorld);
      const position = camera.matrixWorld.elements;
      let nearest = Math.max(0, Math.hypot(position[12] - sphere.center.x,
        position[13] - sphere.center.y, position[14] - sphere.center.z) - sphere.radius);
      // Past four far boundaries only a very narrow lens could still need
      // the instance walk, and skipping it there keeps the finer cell answer.
      if (rules !== VEGETATION_TIER_DETAIL.high && rules !== VEGETATION_COUCH_DETAIL.high
        && nearest <= rules.treeFarStartMetres * 4) {
        const world = worldSpheres();
        let instanceNearest = Infinity;
        for (let index = 0; index < mesh.count && index < instances; index++) {
          instanceNearest = Math.min(instanceNearest, Math.hypot(position[12] - world[index * 4],
            position[13] - world[index * 4 + 1], position[14] - world[index * 4 + 2]) - world[index * 4 + 3]);
        }
        if (Number.isFinite(instanceNearest)) nearest = Math.max(nearest, instanceNearest);
      }
      level = coniferDistanceLevel(nearest, (camera as THREE.PerspectiveCamera).getEffectiveFOV(), rules);
    }
    const selected = ranges[level];
    geometry.setDrawRange(selected.start, selected.count);
  };
  mesh.onAfterRender = function (renderer, scene, camera, drawnGeometry, material, group): void {
    try { heldAfter.call(this, renderer, scene, camera, drawnGeometry, material, group); }
    finally { restore(); }
  };
  mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, drawnGeometry, material, group): void {
    heldBeforeShadow.call(this, renderer, object, camera, shadowCamera, drawnGeometry, material, group); restore();
    if (shadowHeld) restoreShadow();
    shadowCount = mesh.count; shadowHeld = true;
    mesh.count = shadowSubset(shadowCamera, shadowCount);
  };
  mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, drawnGeometry, material, group): void {
    try { heldAfterShadow.call(this, renderer, object, camera, shadowCamera, drawnGeometry, material, group); }
    finally { restore(); restoreShadow(); }
  };
  return (): void => {
    if (retired) return;
    retired = true; restore();
    if (shadowHeld) restoreShadow();
    mesh.onBeforeRender = heldBefore; mesh.onAfterRender = heldAfter;
    mesh.onBeforeShadow = heldBeforeShadow; mesh.onAfterShadow = heldAfterShadow;
    // The carrier stays until its geometry is disposed, so three's own
    // dispose listener, added by the draw that first uploaded it and so run
    // before this one, deletes its GL buffer; then it leaves the geometry.
    if (slots !== null) {
      const carrier = slots.carrier; slots = null;
      const drop = (): void => { geometry.removeEventListener('dispose', drop); geometry.deleteAttribute(carrier); };
      geometry.addEventListener('dispose', drop);
    }
  };
}
