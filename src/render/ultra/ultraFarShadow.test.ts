/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIGHTING, ULTRA } from '../../data/tuning.ts';
import {
  EMPTY_FAR_SHADOW_BYTES,
  emptyFarShadowMap,
  FAR_SHADOW_BYTES_PER_TEXEL,
  fitFarShadowBox,
  releaseEmptyFarShadowMap,
  staticCasterBounds,
  UltraFarShadow,
} from './ultraFarShadow.ts';
import { lightBasis } from './ultraLighting.ts';
import { ULTRA_STATIC_LAYER } from './ultraRecipe.ts';

/**
 * The static far shadow (T12) — M39 W4 (`docs/M39_ULTRA.md` §3.4).
 *
 * three has no GL context under `node --test`, so the renderer here is a
 * recorder with the handful of methods `build` calls. What that proves is
 * everything the far map promises short of the pixels: the box encloses
 * every layer-5 caster and nothing else, the render sees only layer 5, with
 * no background, a depth-only back-face override and the near shadow pass
 * suppressed — and every one of those is put back afterwards, even on a
 * throw. The texel it reports is the one it built.
 */

interface Recorded {
  readonly background: unknown;
  readonly override: THREE.Material | null;
  readonly layers: number;
  readonly autoUpdate: boolean;
  readonly needsUpdate: boolean;
  readonly target: THREE.WebGLRenderTarget | null;
}

function recordingRenderer(options: { throwOnRender?: boolean } = {}): {
  renderer: THREE.WebGLRenderer;
  renders: Recorded[];
  targets: (THREE.WebGLRenderTarget | null)[];
  state: { target: THREE.WebGLRenderTarget | null; autoUpdate: boolean; needsUpdate: boolean };
} {
  const previous = new THREE.WebGLRenderTarget(4, 4);
  const state = { target: previous as THREE.WebGLRenderTarget | null, autoUpdate: true, needsUpdate: false };
  const renders: Recorded[] = [];
  const targets: (THREE.WebGLRenderTarget | null)[] = [];
  const shadowMap = {
    get autoUpdate(): boolean { return state.autoUpdate; },
    set autoUpdate(value: boolean) { state.autoUpdate = value; },
    get needsUpdate(): boolean { return state.needsUpdate; },
    set needsUpdate(value: boolean) { state.needsUpdate = value; },
  };
  const renderer = {
    shadowMap,
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
      state.target = target;
      targets.push(target);
    },
    clear(): void {},
    render(scene: THREE.Scene, camera: THREE.Camera): void {
      renders.push({
        background: scene.background,
        override: scene.overrideMaterial,
        layers: camera.layers.mask,
        autoUpdate: state.autoUpdate,
        needsUpdate: state.needsUpdate,
        target: state.target,
      });
      if (options.throwOnRender === true) throw new Error('context lost');
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, renders, targets, state };
}

const DAYLIGHT_SUN = new THREE.Vector3(
  Math.sin(LIGHTING.sunAzimuth) * Math.cos(LIGHTING.sunElevation),
  Math.sin(LIGHTING.sunElevation),
  Math.cos(LIGHTING.sunAzimuth) * Math.cos(LIGHTING.sunElevation),
);
const PARK_SUN = new THREE.Vector3(
  Math.sin(-1.75) * Math.cos(0.58),
  Math.sin(0.58),
  Math.cos(-1.75) * Math.cos(0.58),
);

/** A small town: instanced buildings and trees on layer 5, plus things that must stay out. */
function town(): { scene: THREE.Scene; casters: THREE.Mesh[]; outsiders: THREE.Mesh[] } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88aacc);
  const casters: THREE.Mesh[] = [];
  const outsiders: THREE.Mesh[] = [];

  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial(), 3);
  const matrix = new THREE.Matrix4();
  const place = [
    [-120, 0, 40, 18, 48, 20],
    [60, 0, -90, 30, 12, 26],
    [200, 2, 150, 16, 22, 16],
  ];
  place.forEach(([x, y, z, sx, sy, sz], index) => {
    matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * 0.4), new THREE.Vector3(sx, sy, sz));
    buildings.setMatrixAt(index, matrix);
  });
  buildings.layers.enable(ULTRA_STATIC_LAYER);
  scene.add(buildings);
  casters.push(buildings);

  const block = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 30), new THREE.MeshStandardMaterial());
  block.position.set(-40, 0.6, -150);
  block.layers.enable(ULTRA_STATIC_LAYER);
  const group = new THREE.Group();
  group.position.set(5, 0, 5);
  group.add(block);
  scene.add(group);
  casters.push(block);

  // Never frozen into the map: the rider, a ghost, the heightfield, far away.
  const rider = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  rider.position.set(900, 0, 900);
  scene.add(rider);
  outsiders.push(rider);
  const heightfield = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial());
  scene.add(heightfield);
  outsiders.push(heightfield);
  // On layer 5 but hidden by its parent: not visible, not a caster.
  const hiddenParent = new THREE.Group();
  hiddenParent.visible = false;
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  hidden.position.set(-800, 0, -800);
  hidden.layers.enable(ULTRA_STATIC_LAYER);
  hiddenParent.add(hidden);
  scene.add(hiddenParent);
  outsiders.push(hidden);
  return { scene, casters, outsiders };
}

function corners(box: THREE.Box3, matrix?: THREE.Matrix4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i += 1) {
    const point = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    out.push(matrix === undefined ? point : point.applyMatrix4(matrix));
  }
  return out;
}

/** Every corner of every instance of a caster, in world space — what the far box must hold. */
function casterCorners(mesh: THREE.Mesh): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const local = mesh.geometry.boundingBox!;
  const instanced = mesh as THREE.InstancedMesh;
  if (instanced.isInstancedMesh !== true) return corners(local, mesh.matrixWorld);
  const out: THREE.Vector3[] = [];
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < instanced.count; index += 1) {
    instanced.getMatrixAt(index, matrix);
    out.push(...corners(local, matrix.clone().premultiply(mesh.matrixWorld)));
  }
  return out;
}

/** A light-space extent: how wide a set of world points is along a light axis. */
function extentAlong(points: readonly THREE.Vector3[], axis: THREE.Vector3): number {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const along = point.dot(axis);
    min = Math.min(min, along);
    max = Math.max(max, along);
  }
  return max - min;
}

test('the far box encloses every layer-5 caster, at both suns', () => {
  for (const sun of [DAYLIGHT_SUN, PARK_SUN]) {
    const { scene, casters } = town();
    const { renderer } = recordingRenderer();
    const far = new UltraFarShadow(ULTRA.farShadow.mapSize);
    far.build(renderer, scene, sun);
    assert.ok(far.texture !== null);
    for (const caster of casters) {
      for (const point of casterCorners(caster)) {
        const p = point.clone().applyMatrix4(far.matrix);
        for (const [axis, value] of [['x', p.x], ['y', p.y], ['z', p.z]] as const) {
          assert.ok(value >= -1e-9 && value <= 1 + 1e-9, `${caster.name || caster.type} corner ${axis} = ${value}`);
        }
      }
    }
    far.dispose();
  }
});

test('only visible layer-5 meshes are bounded — never the rider, the ground or a hidden one', () => {
  const { scene, outsiders } = town();
  const bounds = staticCasterBounds(scene);
  // Per instance: the three buildings and the block.
  assert.equal(bounds.length, 4);
  const withOutsiders = fitFarShadowBox(bounds, DAYLIGHT_SUN)!;
  // The same box with the outsiders removed from the scene altogether.
  for (const mesh of outsiders) mesh.removeFromParent();
  const alone = fitFarShadowBox(staticCasterBounds(scene), DAYLIGHT_SUN)!;
  assert.equal(withOutsiders.halfWidth, alone.halfWidth);
  assert.equal(withOutsiders.halfHeight, alone.halfHeight);
  assert.ok(withOutsiders.centre.distanceTo(alone.centre) < 1e-9);
  // A mesh on layers 0 *and* 5 is a caster.
  const both = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  both.layers.enable(ULTRA_STATIC_LAYER);
  scene.add(both);
  assert.equal(staticCasterBounds(scene).length, 5);
});

test('the render sees layer 5 only, no background, a depth-only back-face override, no shadow pass', () => {
  const { scene } = town();
  const background = scene.background;
  const { renderer, renders, state } = recordingRenderer();
  const previousTarget = state.target;
  const far = new UltraFarShadow(2048);
  far.build(renderer, scene, DAYLIGHT_SUN);

  assert.equal(renders.length, 1);
  const [render] = renders;
  assert.equal(render.layers, 1 << ULTRA_STATIC_LAYER);
  assert.equal(render.background, null);
  assert.ok(render.override instanceof THREE.MeshDepthMaterial);
  assert.equal(render.override.colorWrite, false);
  assert.equal(render.override.side, THREE.BackSide);
  assert.equal(render.autoUpdate, false);
  assert.equal(render.needsUpdate, false);
  assert.ok(render.target !== null && render.target.depthTexture === far.texture);

  // Everything put back.
  assert.equal(scene.background, background);
  assert.equal(scene.overrideMaterial, null);
  assert.equal(state.autoUpdate, true);
  assert.equal(state.needsUpdate, false);
  assert.equal(state.target, previousTarget);
});

test('the map is a compare-enabled 32-bit depth texture, R8 colour, priced at 5 B a texel', () => {
  const { scene } = town();
  const { renderer, renders } = recordingRenderer();
  const far = new UltraFarShadow(2048);
  far.build(renderer, scene, DAYLIGHT_SUN);
  const depth = far.texture!;
  assert.ok(depth instanceof THREE.DepthTexture);
  assert.equal(depth.compareFunction, THREE.LessEqualCompare);
  assert.equal(depth.type, THREE.UnsignedIntType);
  assert.equal(depth.minFilter, THREE.LinearFilter);
  assert.equal(depth.magFilter, THREE.LinearFilter);
  const target = renders[0].target!;
  assert.equal(target.texture.format, THREE.RedFormat);
  assert.equal(target.texture.type, THREE.UnsignedByteType);
  assert.equal(target.width, 2048);
  assert.equal(far.bytes, 2048 * 2048 * FAR_SHADOW_BYTES_PER_TEXEL);
  // ≈ 20 MiB (§5).
  assert.ok(Math.abs(far.bytes / 2 ** 20 - 20) < 0.01);
});

test('the reported texel is the built box over the map, on its coarser axis', () => {
  const { scene } = town();
  const { renderer } = recordingRenderer();
  const far = new UltraFarShadow(2048);
  far.build(renderer, scene, DAYLIGHT_SUN);
  const box = fitFarShadowBox(staticCasterBounds(scene), DAYLIGHT_SUN)!;
  const { x, y } = far.texelMetresXY;
  assert.ok(Math.abs(x - (box.halfWidth * 2) / 2048) < 1e-12);
  assert.ok(Math.abs(y - (box.halfHeight * 2) / 2048) < 1e-12);
  assert.equal(far.texelMetres, Math.max(x, y));
  // This fixture spans ~450 m of light space.
  assert.ok(far.texelMetres > 0.1 && far.texelMetres < 0.5, `${far.texelMetres} m`);
});

test('the box is a tight rectangle: per instance and per light-space axis, padded by the margin', () => {
  const { scene, casters } = town();
  const box = fitFarShadowBox(staticCasterBounds(scene), DAYLIGHT_SUN)!;
  const lx = new THREE.Vector3();
  const ly = new THREE.Vector3();
  const lz = new THREE.Vector3();
  lightBasis(DAYLIGHT_SUN, lx, ly, lz);
  const points = casters.flatMap(casterCorners);
  const margin = ULTRA.farShadow.boxMarginMetres;
  // Each axis is exactly the casters' own light-space extent plus the margin
  // — not the larger of the two (a square), and not a world-axis box.
  assert.ok(Math.abs(box.halfWidth - (extentAlong(points, lx) / 2 + margin)) < 1e-9);
  assert.ok(Math.abs(box.halfHeight - (extentAlong(points, ly) / 2 + margin)) < 1e-9);

  // A row of buildings turned 45° to the world axes, strung along light-space
  // x: the world-axis bounding box of the family — first light's fit — is far
  // wider in light-space y than the buildings themselves are.
  const row = new THREE.Scene();
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const count = 12;
  const family = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial(), count);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const along = lx.clone().multiplyScalar((index - count / 2) * 60);
    matrix.compose(new THREE.Vector3(along.x, 0, along.z), new THREE.Quaternion(), new THREE.Vector3(20, 15, 20));
    family.setMatrixAt(index, matrix);
  }
  family.layers.enable(ULTRA_STATIC_LAYER);
  row.add(family);
  const tight = fitFarShadowBox(staticCasterBounds(row), DAYLIGHT_SUN)!;
  family.computeBoundingBox();
  const worldAabb = family.boundingBox!.clone();
  const loose = fitFarShadowBox([worldAabb], DAYLIGHT_SUN)!;
  assert.ok(tight.halfWidth > 5 * tight.halfHeight, `${tight.halfWidth} × ${tight.halfHeight}`);
  assert.ok(loose.halfHeight > 5 * tight.halfHeight, `${loose.halfHeight} vs ${tight.halfHeight}`);
});

test('a world with nothing on layer 5 builds nothing', () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  const { renderer, renders } = recordingRenderer();
  const far = new UltraFarShadow(2048);
  far.build(renderer, scene, DAYLIGHT_SUN);
  assert.equal(renders.length, 0);
  assert.equal(far.texture, null);
  assert.equal(far.bytes, 0);
  assert.equal(far.texelMetres, 0);
});

test('F-A3: with no far map the patches get the empty map, one per module, freed by its release and still usable after', () => {
  const empty = emptyFarShadowMap();
  assert.equal(emptyFarShadowMap(), empty);
  // One DEPTH_COMPONENT24 texel, stored in 32 bits: what the ledger charges.
  assert.equal(EMPTY_FAR_SHADOW_BYTES, (empty.image.width ?? 0) * (empty.image.height ?? 0) * 4);
  const version = empty.version;
  let released = 0;
  const listener = (): void => { released += 1; };
  empty.addEventListener('dispose', listener);
  releaseEmptyFarShadowMap();
  releaseEmptyFarShadowMap();
  empty.removeEventListener('dispose', listener);
  // Each release asks three to free its copy (a no-op for a copy it never
  // made); the object and its upload flag stay, so the next bind uploads it.
  assert.equal(released, 2);
  assert.equal(emptyFarShadowMap(), empty);
  assert.equal(empty.version, version);
  assert.ok(empty.version > 0);
  // A world with nothing on layer 5 still builds no far map of its own.
  const far = new UltraFarShadow(1024);
  far.build(recordingRenderer().renderer, new THREE.Scene(), DAYLIGHT_SUN);
  assert.equal(far.texture, null);
  assert.notEqual(far.texture, empty);
});

test('a rebuild disposes the old map first, and dispose is idempotent', () => {
  const { scene } = town();
  const { renderer } = recordingRenderer();
  const far = new UltraFarShadow(1024);
  far.build(renderer, scene, DAYLIGHT_SUN);
  const first = far.texture!;
  let released = 0;
  first.addEventListener('dispose', () => { released += 1; });
  far.build(renderer, scene, DAYLIGHT_SUN);
  assert.equal(released, 1);
  assert.notEqual(far.texture, first);
  far.dispose();
  far.dispose();
  assert.equal(far.texture, null);
  assert.equal(far.bytes, 0);
});

test('a failed render leaves the renderer and scene as they were and holds nothing', () => {
  const { scene } = town();
  const background = scene.background;
  const { renderer, state } = recordingRenderer({ throwOnRender: true });
  const previousTarget = state.target;
  const far = new UltraFarShadow(1024);
  assert.throws(() => far.build(renderer, scene, DAYLIGHT_SUN), /context lost/);
  assert.equal(scene.background, background);
  assert.equal(scene.overrideMaterial, null);
  assert.equal(state.autoUpdate, true);
  assert.equal(state.target, previousTarget);
  assert.equal(far.texture, null);
  assert.equal(far.bytes, 0);
});

test('A28 C2 sweep: a failed render disposes the one target and depth texture it created, and the override', () => {
  const { scene } = town();
  const { renderer, targets } = recordingRenderer({ throwOnRender: true });
  const released: string[] = [];
  const render = renderer.render.bind(renderer);
  // Listen to what the build made while it is drawing, before its cleanup runs.
  renderer.render = (drawn: THREE.Object3D, camera: THREE.Camera): void => {
    const target = targets.at(-1);
    target?.addEventListener('dispose', () => released.push('target'));
    target?.depthTexture?.addEventListener('dispose', () => released.push('depth'));
    (drawn as THREE.Scene).overrideMaterial?.addEventListener('dispose', () => released.push('override'));
    render(drawn, camera);
  };
  const far = new UltraFarShadow(1024);
  assert.throws(() => far.build(renderer, scene, DAYLIGHT_SUN), /context lost/);
  const made = targets.filter((target) => target !== null && target.width === 1024);
  assert.equal(made.length, 1, 'one far target was created');
  assert.deepEqual(released.sort(), ['depth', 'override', 'target']);
  assert.equal(far.renderTarget, null);
});
