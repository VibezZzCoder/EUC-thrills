/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { fieldHeightAt } from '../level/buildPlan.ts';
import {
  CONTACT_SHADOW,
  contactShadowBlobs,
  contactShadowSkirts,
  contactSkirtTriangles,
  contactSkirtVertices,
  skirtSideEdges,
  type ContactBlob,
  type ContactSkirt,
} from '../level/contactShadowPlan.ts';
import type { LevelPlan } from '../level/plan.ts';

/**
 * Contact shadows, drawn — the soft blobs a frame without a shadow map lays
 * under what stands on the ground (the visual pass of 2026-10-22).
 *
 * Where the blobs go is `level/contactShadowPlan.ts`; what they cost is
 * `level/renderBudget.ts:contactShadowRenderCost`, and
 * `render/contactShadows.test.ts` measures this file's meshes equal to it.
 *
 * **Two draw calls, whatever the world holds.** Every static blob in the world
 * is one merged mesh, built once per world: a small grid per blob whose
 * vertices sit on the heightfield, so a tree's pool lies on the slope it
 * stands on. The same mesh carries the skirts round the foot of every block
 * and building (second look pass, 2026-10-22, `ContactSkirt`): one piece per
 * side, laid only outside the footprint, at no extra call. Every moving blob — the seated riders, the cops, the ghost, the
 * outdoor population's people and vans — is one instance of one
 * `InstancedMesh`, rewritten every frame from the poses the frame already
 * drew (no simulation query, no state).
 *
 * **One small shader and no texture.** A blob's shape is computed per pixel
 * from its own corner coordinates: a rounded rectangle whose flat share is
 * per blob (0 is an ellipse), flat to a quarter of the way out and then a
 * smoothstep to nothing at the rim — dark at the foot, no edge anywhere. It
 * is a `ShaderMaterial` rather than a patched built-in so no ordinary
 * material is patched, and it takes the scene's fog, tone mapping
 * and output encoding like every other fragment, so a far blob dissolves into
 * the haze with the ground under it. It writes no depth, is drawn first among
 * the transparent objects (`renderOrder`), and is lifted 4 cm plus a polygon
 * offset clear of every ground overlay (the Quay's paving lies 3 cm up).
 *
 * **Shown only when the sun casts nothing** — the ordinary Low tier. Medium,
 * High and Ultra draw a real cascade and the blobs stay hidden (and cost
 * nothing: three skips an invisible object).
 */

/** One moving blob, as the renderer hands it over each frame. Plain fields, reused. */
export interface MovingBlob {
  x: number;
  y: number;
  z: number;
  /** Three's yaw: the blob's own +Z points along (sin, 0, cos). */
  headingY: number;
  halfX: number;
  halfZ: number;
  strength: number;
  innerX: number;
  innerZ: number;
  /** The ground's normal under it; (0, 1, 0) for flat. */
  normalX: number;
  normalY: number;
  normalZ: number;
}

export interface ContactShadowsReport {
  readonly staticBlobs: number;
  readonly staticSkirts: number;
  readonly staticTriangles: number;
  readonly dynamicCapacity: number;
  readonly dynamicBlobs: number;
  readonly visible: boolean;
}

export interface ContactShadows {
  readonly group: THREE.Group;
  readonly staticMesh: THREE.Mesh | null;
  readonly dynamicMesh: THREE.InstancedMesh;
  /** Show the layer (a frame with no shadow map) or hide it. */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  /** Start this frame's moving blobs. */
  beginDynamic(): void;
  /** Add one; ignored past the capacity or when it is too faint to see. */
  pushDynamic(blob: MovingBlob): void;
  endDynamic(): void;
  /** Re-size the moving mesh for a roster (keeps nothing of the last frame). */
  setDynamicCapacity(capacity: number): void;
  report(): ContactShadowsReport;
  dispose(): void;
}

const VERTEX = /* glsl */ `
attribute vec2 blobCorner;
attribute vec4 blobShape;
varying vec2 vCorner;
varying vec4 vShape;
#include <common>
#include <fog_pars_vertex>
void main() {
  vCorner = blobCorner;
  vShape = blobShape;
  vec4 local = vec4( position, 1.0 );
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
#endif
  vec4 mvPosition = modelViewMatrix * local;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 tint;
varying vec2 vCorner;
varying vec4 vShape;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 inner = vShape.yz;
  vec2 q = max( abs( vCorner ) - inner, 0.0 ) / max( 1.0 - inner, vec2( 0.001 ) );
  float alpha = vShape.x * ( 1.0 - smoothstep( 0.25, 1.0, length( q ) ) );
  if ( alpha < 0.004 ) discard;
  gl_FragColor = vec4( tint, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** The one material both meshes share (two programs: instanced and not). */
export function createContactShadowMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'contact-shadow',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { tint: { value: new THREE.Color(CONTACT_SHADOW.tint) } },
    ]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  return material;
}

/**
 * The static blobs' and skirts' merged geometry (blobs first, then skirts, each
 * in plan order), or null when the world has neither.
 */
export function buildStaticContactGeometry(
  plan: LevelPlan,
  blobs: readonly ContactBlob[] = contactShadowBlobs(plan),
  skirts: readonly ContactSkirt[] = contactShadowSkirts(plan),
): THREE.BufferGeometry | null {
  if (blobs.length === 0 && skirts.length === 0) return null;
  let vertexCount = 0;
  let indexCount = 0;
  for (const blob of blobs) {
    vertexCount += blob.grid * blob.grid;
    indexCount += 6 * (blob.grid - 1) * (blob.grid - 1);
  }
  for (const skirt of skirts) {
    vertexCount += contactSkirtVertices(skirt);
    indexCount += 3 * contactSkirtTriangles(skirt);
  }
  const positions = new Float32Array(vertexCount * 3);
  const corners = new Float32Array(vertexCount * 2);
  const shapes = new Float32Array(vertexCount * 4);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let v = 0;
  let i = 0;
  for (const blob of blobs) {
    const n = blob.grid;
    const cos = Math.cos(blob.rotationY);
    const sin = Math.sin(blob.rotationY);
    const base = v;
    for (let row = 0; row < n; row += 1) {
      const cz = -1 + (2 * row) / (n - 1);
      for (let column = 0; column < n; column += 1) {
        const cx = -1 + (2 * column) / (n - 1);
        const lx = cx * blob.halfX;
        const lz = cz * blob.halfZ;
        const x = blob.x + lx * cos + lz * sin;
        const z = blob.z - lx * sin + lz * cos;
        const ground = blob.flatY ?? fieldHeightAt(plan.heightfield, plan.surround, x, z);
        positions[v * 3] = x;
        positions[v * 3 + 1] = ground + CONTACT_SHADOW.lift;
        positions[v * 3 + 2] = z;
        corners[v * 2] = cx;
        corners[v * 2 + 1] = cz;
        shapes[v * 4] = blob.strength;
        shapes[v * 4 + 1] = blob.innerX;
        shapes[v * 4 + 2] = blob.innerZ;
        shapes[v * 4 + 3] = 0;
        v += 1;
      }
    }
    for (let row = 0; row < n - 1; row += 1) {
      for (let column = 0; column < n - 1; column += 1) {
        const a = base + row * n + column;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices[i++] = a; indices[i++] = c; indices[i++] = b;
        indices[i++] = b; indices[i++] = c; indices[i++] = d;
      }
    }
  }
  // The skirts: the same rounded-rectangle shade over the footprint grown by
  // `reach`, laid only outside the footprint — one piece per drawn side,
  // between the face and the grown rectangle, split along its length into the
  // quads the plan chose. Each vertex carries its own place in the shade's
  // rectangle, and that place is affine in position, so the fade the fragment
  // computes is exactly the blob shader's whatever the piece's shape.
  for (const skirt of skirts) {
    const outerX = skirt.footX + skirt.reach;
    const outerZ = skirt.footZ + skirt.reach;
    const innerX = skirt.footX / outerX;
    const innerZ = skirt.footZ / outerZ;
    const cos = Math.cos(skirt.rotationY);
    const sin = Math.sin(skirt.rotationY);
    for (let side = 0; side < 4; side += 1) {
      if (!skirt.sides[side]) continue;
      const n = skirt.spans[side];
      const { inner, outer } = skirtSideEdges(skirt, side);
      const base = v;
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        for (const edge of [inner, outer]) {
          const lx = edge[0][0] + (edge[1][0] - edge[0][0]) * t;
          const lz = edge[0][1] + (edge[1][1] - edge[0][1]) * t;
          const x = skirt.x + lx * cos + lz * sin;
          const z = skirt.z - lx * sin + lz * cos;
          const ground = skirt.flatY ?? fieldHeightAt(plan.heightfield, plan.surround, x, z);
          positions[v * 3] = x;
          positions[v * 3 + 1] = ground + CONTACT_SHADOW.lift;
          positions[v * 3 + 2] = z;
          corners[v * 2] = lx / outerX;
          corners[v * 2 + 1] = lz / outerZ;
          shapes[v * 4] = skirt.strength;
          shapes[v * 4 + 1] = innerX;
          shapes[v * 4 + 2] = innerZ;
          shapes[v * 4 + 3] = 0;
          v += 1;
        }
      }
      for (let k = 0; k < n; k += 1) {
        const a = base + 2 * k;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices[i++] = a; indices[i++] = c; indices[i++] = b;
        indices[i++] = b; indices[i++] = c; indices[i++] = d;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('blobCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('blobShape', new THREE.BufferAttribute(shapes, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function createQuad(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]), 3));
  geometry.setAttribute('blobCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return geometry;
}

function createDynamicMesh(material: THREE.ShaderMaterial, capacity: number): THREE.InstancedMesh {
  const geometry = createQuad();
  const shapes = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4);
  shapes.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('blobShape', shapes);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.name = 'contact-shadows-dynamic';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  // The instances move every frame and span the world; a stale bound would
  // cull the lot. Two triangles each — culling would save nothing worth it.
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function createContactShadows(plan: LevelPlan, dynamicCapacity: number): ContactShadows {
  const group = new THREE.Group();
  group.name = 'contact-shadows';
  group.visible = false;
  const material = createContactShadowMaterial();

  const blobs = contactShadowBlobs(plan);
  const skirts = contactShadowSkirts(plan);
  const staticGeometry = buildStaticContactGeometry(plan, blobs, skirts);
  let staticTriangles = 0;
  let staticMesh: THREE.Mesh | null = null;
  if (staticGeometry !== null) {
    staticTriangles = (staticGeometry.index?.count ?? 0) / 3;
    staticMesh = new THREE.Mesh(staticGeometry, material);
    staticMesh.name = 'contact-shadows-static';
    staticMesh.castShadow = false;
    staticMesh.receiveShadow = false;
    staticMesh.renderOrder = -1;
    staticMesh.matrixAutoUpdate = false;
    group.add(staticMesh);
  }

  let capacity = Math.max(1, Math.floor(dynamicCapacity));
  let dynamicMesh = createDynamicMesh(material, capacity);
  group.add(dynamicMesh);
  let count = 0;
  let disposed = false;

  const layer: ContactShadows = {
    group,
    get staticMesh(): THREE.Mesh | null {
      return staticMesh;
    },
    get dynamicMesh(): THREE.InstancedMesh {
      return dynamicMesh;
    },
    get visible(): boolean {
      return group.visible;
    },
    setVisible(visible: boolean): void {
      if (group.visible !== visible) group.visible = visible;
    },
    beginDynamic(): void {
      count = 0;
    },
    pushDynamic(blob: MovingBlob): void {
      if (count >= capacity || !(blob.strength > 0.004)) return;
      if (!Number.isFinite(blob.x) || !Number.isFinite(blob.y) || !Number.isFinite(blob.z)) return;
      // The blob's basis: its own X and Z laid on the ground plane under it.
      let nx = blob.normalX;
      let ny = blob.normalY;
      let nz = blob.normalZ;
      const length = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(length) || length < 1e-6 || ny <= 0) { nx = 0; ny = 1; nz = 0; } else { nx /= length; ny /= length; nz /= length; }
      const c = Math.cos(blob.headingY);
      const s = Math.sin(blob.headingY);
      // Local +X is (cos, 0, −sin); take out its part along the normal.
      const along = c * nx - s * nz;
      let xx = c - nx * along;
      let xy = -ny * along;
      let xz = -s - nz * along;
      const xl = Math.hypot(xx, xy, xz) || 1;
      xx /= xl; xy /= xl; xz /= xl;
      // Z = X × N, which is (sin, 0, cos) on flat ground.
      const zx = xy * nz - xz * ny;
      const zy = xz * nx - xx * nz;
      const zz = xx * ny - xy * nx;
      const m = dynamicMesh.instanceMatrix.array as Float32Array;
      const o = count * 16;
      m[o] = xx * blob.halfX; m[o + 1] = xy * blob.halfX; m[o + 2] = xz * blob.halfX; m[o + 3] = 0;
      m[o + 4] = nx; m[o + 5] = ny; m[o + 6] = nz; m[o + 7] = 0;
      m[o + 8] = zx * blob.halfZ; m[o + 9] = zy * blob.halfZ; m[o + 10] = zz * blob.halfZ; m[o + 11] = 0;
      m[o + 12] = blob.x; m[o + 13] = blob.y + CONTACT_SHADOW.lift; m[o + 14] = blob.z; m[o + 15] = 1;
      const shapes = dynamicMesh.geometry.getAttribute('blobShape') as THREE.InstancedBufferAttribute;
      const a = shapes.array as Float32Array;
      const p = count * 4;
      a[p] = Math.min(1, blob.strength); a[p + 1] = blob.innerX; a[p + 2] = blob.innerZ; a[p + 3] = 0;
      count += 1;
    },
    endDynamic(): void {
      dynamicMesh.count = count;
      if (count > 0) {
        dynamicMesh.instanceMatrix.clearUpdateRanges();
        dynamicMesh.instanceMatrix.addUpdateRange(0, count * 16);
        dynamicMesh.instanceMatrix.needsUpdate = true;
        const shapes = dynamicMesh.geometry.getAttribute('blobShape') as THREE.InstancedBufferAttribute;
        shapes.clearUpdateRanges();
        shapes.addUpdateRange(0, count * 4);
        shapes.needsUpdate = true;
      }
    },
    setDynamicCapacity(next: number): void {
      const wanted = Math.max(1, Math.floor(next));
      if (wanted === capacity || disposed) return;
      group.remove(dynamicMesh);
      dynamicMesh.geometry.dispose();
      dynamicMesh.dispose();
      capacity = wanted;
      dynamicMesh = createDynamicMesh(material, capacity);
      group.add(dynamicMesh);
      count = 0;
    },
    report(): ContactShadowsReport {
      return {
        staticBlobs: blobs.length,
        staticSkirts: skirts.length,
        staticTriangles,
        dynamicCapacity: capacity,
        dynamicBlobs: dynamicMesh.count,
        visible: group.visible,
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      staticMesh?.geometry.dispose();
      dynamicMesh.geometry.dispose();
      dynamicMesh.dispose();
      material.dispose();
    },
  };
  return layer;
}

/**
 * How strong and how wide a rider's blob is at `height` metres above the
 * ground under it: gone by `CONTACT_SHADOW.fadeHeight`, a little wider as it
 * rises, so a jump reads as leaving the ground and a landing as meeting it.
 */
export function riderBlobFade(height: number): { strength: number; grow: number } {
  const h = Math.max(0, Number.isFinite(height) ? height : 0);
  const t = Math.min(1, h / CONTACT_SHADOW.fadeHeight);
  const smooth = t * t * (3 - 2 * t);
  return { strength: 1 - smooth, grow: 1 + Math.min(h, CONTACT_SHADOW.fadeHeight) * CONTACT_SHADOW.growPerMetre };
}
