/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact topology/packed-data controls. Coordinator owns test execution. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { BASELINE_PRESENTATION } from './presentation.ts';
import { prepareSharedGroundEdges } from './sharedGroundEdgePlan.ts';
import { createTerrain, type TerrainView } from './terrain.ts';
import { ULTRA_FULL, ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import type { BuildRecipe, UltraBuildContext } from './ultra/ultraTypes.ts';

function fixture(): LevelPlan {
  const columns = 57, rows = 45, spacing = 3, originX = -84, originZ = -66;
  const socket = { position: { x: 0, y: 1, z: 0 }, headingY: 0,
    surface: 'pavement' as const, halfWidth: 4, gradient: 0 };
  return { id: 'spatial-accepted-source-fixture', spawn: { position: { x: -64, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, props: [], checkpoints: [],
    heightfield: { columns, rows, spacing, originX, originZ,
      heights: Array.from({ length: columns * rows }, (_, at) =>
        1 + Math.sin((at % columns) * 0.13) * 0.2 + Math.cos(Math.floor(at / columns) * 0.19) * 0.3
          + (at % 3 === 0 ? 0.035 : 0)),
      // A complete straight source seam survives the bounded edge selector;
      // an unsupported coarse staircase legitimately refuses every band.
      surfaces: Array.from({ length: (columns - 1) * (rows - 1) }, (_, at) =>
        at % (columns - 1) < 26 ? 'pavement' : 'grass') },
    segments: [{ id: 'same-physical-boxes', entry: socket, exit: { ...socket, position: { x: 0, y: 1, z: 16 } },
      colliders: [-72, -12, 54, 78].map((x, at): BoxCollider => ({ centre: { x, y: 1.5, z: at * 16 - 24 },
        halfExtents: { x: 1.2, y: 1.5, z: 4.3 }, rotationY: at * 0.31,
        surface: 'pavement', appearance: at % 2 === 0 ? 'stone' : 'concrete' })) }] };
}

function staticMeshes(view: TerrainView): THREE.Mesh[] {
  return view.group.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh
    && (object.name === 'level-field' || object.name === 'level-heightfield' || object.name.startsWith('level-blocks-')));
}

function drawGroups(mesh: THREE.Mesh): number {
  return mesh.geometry.index!.count === 0 ? 0 : Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1;
}

function allocations(meshes: readonly THREE.Mesh[]): { attributeBytes: number; indexBytes: number } {
  const attributes = new Set<THREE.BufferAttribute>();
  let indexBytes = 0;
  for (const mesh of meshes) {
    indexBytes += mesh.geometry.index!.array.byteLength;
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      assert.ok(attribute instanceof THREE.BufferAttribute); attributes.add(attribute);
    }
  }
  return { attributeBytes: [...attributes].reduce((sum, attribute) => sum + attribute.array.byteLength, 0), indexBytes };
}

/** Raw attribute bytes per directed triangle, including packed half/byte values.
 * This oracle ignores batching/order and retains material, normals and seams. */
function triangleMultiset(meshes: readonly THREE.Mesh[]): string[] {
  const signatures: string[] = [];
  const vertexCache = new Map<THREE.BufferAttribute, Map<number, string>>();
  for (const mesh of meshes) {
    const geometry = mesh.geometry, index = geometry.index!;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const cache = vertexCache.get(position) ?? new Map<number, string>(); vertexCache.set(position, cache);
    const names = Object.keys(geometry.attributes).sort();
    const vertex = (at: number): string => {
      let value = cache.get(at);
      if (value !== undefined) return value;
      value = names.map(name => {
        const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
        const width = attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
        const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset + at * width, width);
        return `${name}/${attribute.constructor.name}/${attribute.itemSize}/${attribute.normalized}/${attribute.gpuType}:${Buffer.from(bytes).toString('hex')}`;
      }).join(';');
      cache.set(at, value); return value;
    };
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
    for (const group of groups) {
      const material = (Array.isArray(mesh.material) ? mesh.material[group.materialIndex ?? 0] : mesh.material) as THREE.MeshStandardMaterial;
      const appearance = JSON.stringify({ type: material.type, colour: material.color.toArray(), roughness: material.roughness,
        metalness: material.metalness, vertexColors: material.vertexColors, side: material.side, opacity: material.opacity,
        polygonOffset: [material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits],
        key: material.customProgramCacheKey(), flags: [mesh.castShadow, mesh.receiveShadow, mesh.layers.mask] });
      for (let at = group.start; at < group.start + group.count; at += 3) {
        signatures.push(`${mesh.name}/${appearance}/${vertex(index.getX(at))}|${vertex(index.getX(at + 1))}|${vertex(index.getX(at + 2))}`);
      }
    }
  }
  return signatures.sort();
}

for (const recipe of [BASELINE_PRESENTATION, ULTRA_FULL] as readonly BuildRecipe[]) {
  test(`${recipe.id}: final spatial chunks preserve shared edges, materials, shadows, physics and unique bytes`, () => {
    const plan = fixture(), original = JSON.stringify(plan), sharedEdges = prepareSharedGroundEdges(plan);
    assert.ok(sharedEdges.assembly.replacements.size > 0, 'control must exercise final shared edge triangles, not just source cells');
    const context: UltraBuildContext | undefined = recipe.id === 'ultra-full'
      ? { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 } : undefined;
    const composition = { ordinaryBoundary: context === undefined, sharedSurface: true, sharedEdges };
    const source = createTerrain(plan, recipe, context, composition);
    const partitioned = createTerrain(plan, recipe, context, { ...composition, spatialBatchMetres: 64 });
    try {
      const sourceMeshes = staticMeshes(source), chunks = staticMeshes(partitioned), report = partitioned.spatialGeometry!;
      assert.ok(chunks.length > sourceMeshes.length);
      assert.deepEqual(triangleMultiset(chunks), triangleMultiset(sourceMeshes),
        'every final directed triangle, material, normal and packed vertex value is retained');
      assert.equal(partitioned.triangles, source.triangles); assert.equal(partitioned.blockTriangles, source.blockTriangles);
      assert.equal(partitioned.cellsDrawn, source.cellsDrawn); assert.equal(partitioned.textures, source.textures);
      assert.deepEqual(partitioned.ordinaryBoundary, source.ordinaryBoundary);
      assert.deepEqual(partitioned.sharedEdges, source.sharedEdges);
      assert.deepEqual(partitioned.featureBlocks, source.featureBlocks);
      assert.deepEqual(partitioned.ultra, source.ultra, 'packed Ultra buffers are shared rather than multiplied by chunks');
      assert.deepEqual(allocations(chunks), allocations(sourceMeshes));
      assert.deepEqual({ attributeBytes: report.attributeBytes, indexBytes: report.indexBytes }, allocations(chunks));
      assert.equal(report.sourceMeshes, sourceMeshes.length); assert.equal(report.meshes, chunks.length);
      assert.equal(report.sourceDrawGroups, sourceMeshes.reduce((sum, mesh) => sum + drawGroups(mesh), 0));
      assert.equal(report.drawGroups, chunks.reduce((sum, mesh) => sum + drawGroups(mesh), 0));
      assert.equal(report.triangles, chunks.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0));
      const colourDrawDelta = report.drawGroups - report.sourceDrawGroups;
      const shadowDrawDelta = chunks.filter(mesh => mesh.castShadow).reduce((sum, mesh) => sum + drawGroups(mesh), 0)
        - sourceMeshes.filter(mesh => mesh.castShadow).reduce((sum, mesh) => sum + drawGroups(mesh), 0);
      assert.deepEqual(partitioned.terrainSpatialBatching, { colourDrawDelta, shadowDrawDelta,
        farShadowDrawDelta: context ? shadowDrawDelta : 0, propDrawDelta: 0 });
      assert.deepEqual(partitioned.spatialBatching, partitioned.terrainSpatialBatching, 'the prop-empty fixture has no hidden delta');
      assert.equal(source.spatialGeometry, null); assert.equal(source.spatialBatching.colourDrawDelta, 0);
      for (const name of new Set(chunks.map(mesh => mesh.name))) {
        const family = chunks.filter(mesh => mesh.name === name);
        for (const chunk of family.slice(1)) for (const attribute of Object.keys(chunk.geometry.attributes)) {
          assert.equal(chunk.geometry.getAttribute(attribute), family[0].geometry.getAttribute(attribute));
        }
      }
      for (const chunk of chunks) {
        assert.ok(chunk.receiveShadow);
        assert.equal(chunk.castShadow, chunk.name.startsWith('level-blocks-'));
        assert.equal(chunk.layers.isEnabled(ULTRA_STATIC_LAYER), Boolean(context) && chunk.castShadow);
      }

      // Actual ray hits from the emitted chunks remain on the sampler's source
      // diagonal, including two native cells straddling the 64m partition line.
      partitioned.group.updateMatrixWorld(true);
      const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
      for (const [x, z] of [[-64.2, -20.3], [-63.8, -20.7], [-40.2, 0.2], [-39.8, -0.2]]) {
        sampler.sampleGround(x, z, sample);
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(chunks.filter(mesh => mesh.name === 'level-heightfield'), false);
        assert.ok(hits.length > 0, 'local chunk bounds must not omit a physical source plane');
        assert.ok(Math.abs(hits[0].point.y - sample.height) < 1e-5);
      }
      assert.equal(JSON.stringify(plan), original, 'render partitioning cannot change seed, ground, colliders or population data');

      const scene = new THREE.Scene(); scene.add(partitioned.group);
      const disposal = new Map(chunks.map(mesh => [mesh.geometry, 0]));
      for (const geometry of disposal.keys()) geometry.addEventListener('dispose', () => disposal.set(geometry, disposal.get(geometry)! + 1));
      partitioned.dispose(); partitioned.dispose();
      assert.equal(scene.children.length, 0);
      assert.ok([...disposal.values()].every(count => count === 1), 'each chunk wrapper/index is retired exactly once');
    } finally { source.dispose(); partitioned.dispose(); }
  });
}
