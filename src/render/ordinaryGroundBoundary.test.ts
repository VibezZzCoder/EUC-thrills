/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Current ordinary composition uses createTerrain's fourth argument.
 * Historical ordinaryParity goldens remain independent and must not be regenerated.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { SURFACES } from '../data/surfaces.ts';
import { GROUND_BOUNDARY } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { GroundSurfacePatch, Hazard, LevelPlan } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { edgeFillForGrid, edgeSignedDistance, type EdgeFillField } from './groundBoundary.ts';
import { groundBoundaryPolicy, groundDrivableCapCells, groundEdgeCapCells,
  groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';
import { GROUND_BOUNDARY_ANCHORS, GROUND_BOUNDARY_ATTRIBUTES, GROUND_BOUNDARY_FRAGMENT,
  installOrdinaryGroundBoundary, ordinaryBoundaryAttributes, ordinaryBoundaryField } from './ordinaryGroundBoundary.ts';
import { BASELINE_PRESENTATION, selectPresentation } from './presentation.ts';
import { createTerrain, type TerrainView } from './terrain.ts';
import { edgeCovers as oldUltraCovers, edgeFillFor as oldUltraFill } from './ultra/groundContact.ts';

const NAMES = Object.values(GROUND_BOUNDARY_ATTRIBUTES);
const CURRENT = { ordinaryBoundary: true } as const;
const WORLDS: readonly (readonly [string, () => LevelPlan])[] = [
  ['slice', createSliceLevel], ['belvar', createTrackLevel],
  ['switchback', createSwitchbackLevel], ['proving', createProvingGround],
  ['euc', () => generateLevel('euc').plan],
  ['heavy', () => generateLevel('route-41', undefined, undefined, 65).plan],
];

function heightfield(view: TerrainView): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]> {
  const mesh = view.group.getObjectByName('level-heightfield');
  assert.ok(mesh instanceof THREE.Mesh, 'the actual factory emitted its heightfield');
  return mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
}

function attrState(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): unknown {
  assert.ok(attribute instanceof THREE.BufferAttribute, 'terrain uses ordinary attributes');
  return { type: attribute.constructor.name, itemSize: attribute.itemSize,
    normalized: attribute.normalized, gpuType: attribute.gpuType,
    bytes: attribute.array.byteLength,
    digest: createHash('sha256').update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)).digest('hex') };
}

function geometryState(geometry: THREE.BufferGeometry, omit: readonly string[] = []): unknown {
  return { attributes: Object.fromEntries(Object.entries(geometry.attributes)
    .filter(([name]) => !omit.includes(name)).map(([name, attribute]) => [name, attrState(attribute)])),
  index: geometry.index === null ? null : attrState(geometry.index),
  groups: geometry.groups, drawRange: geometry.drawRange,
  sphere: geometry.boundingSphere?.toJSON(), box: geometry.boundingBox?.toJSON() };
}

/** Resources and node topology, excluding instance identities assigned on construction. */
function worldState(view: TerrainView): unknown {
  const nodes: unknown[] = [];
  view.group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    nodes.push({ name: object.name, type: object.type, visible: object.visible,
      layers: object.layers.mask, cast: object.castShadow, receive: object.receiveShadow,
      position: object.position.toArray(), rotation: object.rotation.toArray(), scale: object.scale.toArray(),
      geometry: mesh.isMesh ? geometryState(mesh.geometry,
        object.name === 'level-heightfield' ? [...NAMES, 'color'] : []) : null,
      materials: mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
        const m = material as THREE.MeshStandardMaterial;
        return { type: m.type, color: m.color?.toArray(), roughness: m.roughness, metalness: m.metalness,
          emissive: m.emissive?.toArray(), emissiveIntensity: m.emissiveIntensity,
          transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite,
          polygonOffset: [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits],
          vertexColors: m.vertexColors, map: m.map !== null, normalMap: m.normalMap !== null,
          // Only the heightfield acquires a program patch.
          patch: object.name === 'level-heightfield' ? null : m.onBeforeCompile.toString(),
          cacheKey: object.name === 'level-heightfield' ? null : m.customProgramCacheKey() };
      }) : null,
      instanceMatrix: (mesh as THREE.InstancedMesh).isInstancedMesh
        ? attrState((mesh as THREE.InstancedMesh).instanceMatrix) : null,
      instanceColor: (mesh as THREE.InstancedMesh).instanceColor
        ? attrState((mesh as THREE.InstancedMesh).instanceColor!) : null });
  });
  return { nodes, cells: view.cellsDrawn, triangles: view.triangles,
    blocks: view.blockTriangles, textures: view.textures, recipe: view.recipe, ultra: view.ultra };
}

function firstVertices(plan: LevelPlan): Int32Array {
  const first = new Int32Array(plan.heightfield.surfaces.length).fill(-1);
  let vertex = 0;
  for (const cells of terrainCells(plan).bySurface.values()) {
    for (const cell of cells) { first[cell] = vertex; vertex += 4; }
  }
  return first;
}

function coreFill(plan: LevelPlan): EdgeFillField {
  const field = plan.heightfield, cap = groundEdgeCapCells(field.spacing);
  return edgeFillForGrid({ columns: field.columns - 1, rows: field.rows - 1, surfaces: field.surfaces },
    terrainCells(plan).bySurface as ReadonlyMap<SurfaceId, readonly number[]>,
    groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing))),
    groundPrecisePatchMask(plan, groundHazardMask(plan)));
}

function expectedFill(plan: LevelPlan): EdgeFillField {
  return ordinaryBoundaryField(plan, terrainCells(plan).bySurface);
}

function assertLayout(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>): void {
  const geometry = mesh.geometry, count = geometry.getAttribute('position').count;
  const edge = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge);
  const tint = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.tint);
  const mode = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
  assert.ok(edge instanceof THREE.Float16BufferAttribute);
  assert.ok(tint instanceof THREE.Float16BufferAttribute);
  assert.ok(mode instanceof THREE.Uint8BufferAttribute);
  assert.deepEqual([edge.itemSize, tint.itemSize, mode.itemSize], [2, 3, 1]);
  assert.deepEqual([edge.count, tint.count, mode.count], [count, count, count]);
  assert.deepEqual([edge.normalized, tint.normalized, mode.normalized], [false, false, false]);
  assert.equal(edge.array.byteLength + tint.array.byteLength + mode.array.byteLength, count * 11);
  for (let vertex = 0; vertex < count; vertex++) {
    assert.ok(Number.isFinite(edge.getX(vertex)) && Number.isFinite(edge.getY(vertex)), 'finite packed distances');
    assert.ok(Number.isFinite(tint.getX(vertex)) && Number.isFinite(tint.getY(vertex)) && Number.isFinite(tint.getZ(vertex)), 'finite packed tint');
    assert.ok(Number.isInteger(mode.getX(vertex)) && mode.getX(vertex) >= 0 && mode.getX(vertex) <= 15,
      'discrete unnormalized boundary and material bits');
  }
}

function assertNeutral(geometry: THREE.BufferGeometry, first: number, expectedMode = 0): void {
  const edge = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge);
  const tint = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.tint);
  const mode = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
  for (let vertex = first; vertex < first + 4; vertex++) {
    assert.deepEqual([edge.getX(vertex), edge.getY(vertex)], [GROUND_BOUNDARY.sentinel, GROUND_BOUNDARY.sentinel]);
    assert.deepEqual([tint.getX(vertex), tint.getY(vertex), tint.getZ(vertex)], [1, 1, 1]);
    assert.equal(mode.getX(vertex), expectedMode);
  }
}

/** Check actual packed mesh data against core lines and actual material/source vertex colors. */
function assertPacking(plan: LevelPlan, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>,
  fill: EdgeFillField = expectedFill(plan)): void {
  const first = firstVertices(plan), columns = plan.heightfield.columns - 1;
  const geometry = mesh.geometry;
  const edge = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge);
  const tint = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.tint);
  const mode = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
  const color = geometry.getAttribute('color');
  const materialOf = new Map<SurfaceId, THREE.MeshStandardMaterial>();
  let materialIndex = 0;
  for (const surface of terrainCells(plan).bySurface.keys()) materialOf.set(surface as SurfaceId, mesh.material[materialIndex++]);
  const protectedCells = groundPrecisePatchMask(plan, groundHazardMask(plan));
  for (let cell = 0; cell < first.length; cell++) {
    const at = first[cell];
    if (at < 0) continue;
    const filled = fill.cells.get(cell);
    const ownBrick = protectedCells[cell] === 0 && SURFACES[plan.heightfield.surfaces[cell]]?.material === 'brick';
    if (filled === undefined) { assertNeutral(geometry, at, ownBrick ? 8 : 0); continue; }
    assert.equal(protectedCells[cell], 0, 'a protected target cannot be filled');
    assert.equal(protectedCells[filled.source], 0, 'a protected source cannot supply tone');
    assert.ok(first[filled.source] >= 0, 'the source is actually drawn');
    const ownMaterial = materialOf.get(plan.heightfield.surfaces[cell])!;
    const sourceMaterial = materialOf.get(filled.towards)!;
    const channels = ['r', 'g', 'b'] as const;
    const from = first[filled.source];
    const ownTone = [color.getX(at), color.getY(at), color.getZ(at)];
    const sourceTone = [color.getX(from), color.getY(from), color.getZ(from)];
    const row = Math.floor(cell / columns), column = cell % columns;
    for (let corner = 0; corner < 4; corner++) {
      const vertex = at + corner;
      const distances = [edge.getX(vertex), edge.getY(vertex)];
      for (let line = 0; line < 2; line++) {
        const expected: number = filled.lines[line] === undefined ? GROUND_BOUNDARY.sentinel
          : edgeSignedDistance(filled.lines[line], column + (corner & 1), row + (corner >> 1));
        assert.equal(distances[line], THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(expected)), 'half packing preserves each signed line');
      }
      const bits: number = (filled.mode === 'intersection' && filled.lines.length > 1 ? 1 : 0) + (filled.round ? 2 : 0)
        + (SURFACES[filled.towards]?.material === 'brick' ? 4 : 0) + (ownBrick ? 8 : 0);
      assert.equal(mode.getX(vertex), bits, 'shader mode preserves core geometry and own/source material flags');
      const ratio = [tint.getX(vertex), tint.getY(vertex), tint.getZ(vertex)];
      for (let channel = 0; channel < 3; channel++) {
        const result = ownMaterial.color[channels[channel]] * ownTone[channel] * ratio[channel];
        const source = sourceMaterial.color[channels[channel]] * sourceTone[channel];
        assert.ok(Math.abs(result - source) <= Math.max(1e-6, Math.abs(source) * 0.0011),
          `cell ${cell}: actual linear diffuse matches its source after half quantization`);
      }
    }
  }
}

for (const [name, factory] of WORLDS) {
  test(`current ordinary edge factory: ${name}/selected recipe preserves plan and physical mesh`, () => {
    const plan = factory(), before = planDigest(plan);
    const recipe = selectPresentation(plan).recipe;
    const legacy = createTerrain(plan, recipe);
    const current = createTerrain(plan, recipe, undefined, CURRENT);
    try {
      assert.equal(planDigest(plan), before, 'render treatment never mutates the plan');
      assert.deepEqual(worldState(current), worldState(legacy), 'no positions, normals, indices, groups, draw count, other families, or ordinary material properties changed');
      const old = heightfield(legacy), mesh = heightfield(current);
      for (const name of NAMES) assert.equal(old.geometry.getAttribute(name), undefined, 'legacy path remains an honest pre-Ultra factory');
      for (const m of old.material) assert.equal(m.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
      assertLayout(mesh);
      const filled = expectedFill(plan);
      assertPacking(plan, mesh, filled);
      assert.equal(legacy.ordinaryBoundary, null, 'legacy path owns no ordinary boundary allocation');
      assert.deepEqual(current.ordinaryBoundary, { bytes: mesh.geometry.getAttribute('position').count * 11,
        filledCells: filled.cells.size, fillLines: filled.lines }, 'ordinary report prices the actual buffers separately from Ultra');
      assert.ok(mesh.material.every(m => m.customProgramCacheKey().includes('ordinary-ground-boundary')), 'all actual heightfield materials are patched');
      current.group.traverse(object => {
        const other = object as THREE.Mesh;
        if (!other.isMesh || object.name === 'level-heightfield') return;
        for (const name of NAMES) assert.equal(other.geometry.getAttribute(name), undefined, `${object.name} stays outside the edge treatment`);
      });
    } finally { current.dispose(); legacy.dispose(); }
  });
}

function gridPlan(spacing = 1): LevelPlan {
  const rows = ['PPPPPP', 'BPPPPP', 'BBPPPP', 'BBBPPP', 'BBBBPP', 'BBBBBP'];
  const surfaces = rows.flatMap(row => [...row].map(letter => letter === 'B' ? 'brick' : 'pavement')) as SurfaceId[];
  return { id: 'ordinary-boundary-probe', spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: 0, originZ: 0,
      columns: 7, rows: 7, spacing, heights: Array(49).fill(1), surfaces },
    segments: [], checkpoints: [], palette: { brick: 0x3bca69, pavement: 0xb597cd } } as unknown as LevelPlan;
}

/** An exact fragment inside a specified cell: masking must protect the entire parent cell. */
function patch(plan: LevelPlan, cell: number): GroundSurfacePatch {
  const field = plan.heightfield, column = cell % (field.columns - 1), row = Math.floor(cell / (field.columns - 1));
  const x = (column + 0.2) * field.spacing, z = (row + 0.2) * field.spacing;
  return { id: `precise-${cell}`, surface: 'brick', triangles: [{ cell,
    vertices: [{ x, y: 1, z }, { x, y: 1, z: z + 0.1 }, { x: x + 0.1, y: 1, z }] }] };
}

function hazard(plan: LevelPlan, cell: number): Hazard {
  const field = plan.heightfield, column = cell % (field.columns - 1), row = Math.floor(cell / (field.columns - 1));
  return { id: `spill-${cell}`, kind: 'spill', radius: field.spacing * 0.05,
    centre: { x: (column + 0.5) * field.spacing, y: 1, z: (row + 0.5) * field.spacing } };
}

function directGeometry(plan: LevelPlan): THREE.BufferGeometry {
  const drawn = terrainCells(plan).bySurface, vertices = terrainCells(plan).cellsDrawn * 4;
  const packed = ordinaryBoundaryAttributes(plan, drawn, Array(vertices * 3).fill(1));
  assert.equal(packed.bytes, vertices * 11);
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of packed.attributes) geometry.setAttribute(name, attribute);
  return geometry;
}

test('known diagonal targets and all possible source tiles respect both hazard kinds and exact patches', () => {
  const base = gridPlan(), fill = expectedFill(base), first = firstVertices(base);
  assert.ok(fill.cells.size > 0, 'the unprotected control actually fills a diagonal');
  const target = fill.cells.keys().next().value!;
  const sourceCells = base.heightfield.surfaces.flatMap((surface, cell) => surface === 'brick' ? [cell] : []);
  for (const protection of ['spill', 'pothole', 'patch'] as const) {
    const hazardAt = (cell: number): Hazard => ({ ...hazard(base, cell), kind: protection === 'pothole' ? 'potholeShallow' : 'spill' });
    const protectTargets = { ...base, ...(protection !== 'patch'
      ? { hazards: [hazardAt(target)] } : { groundSurfacePatches: [patch(base, target)] }) };
    const targetGeometry = directGeometry(protectTargets);
    try {
      assertNeutral(targetGeometry, first[target]);
      const corrupted = targetGeometry.clone();
      try { corrupted.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge).setX(first[target], 0.25);
        assert.throws(() => assertNeutral(corrupted, first[target]), 'known-bad protected target must be rejected');
      } finally { corrupted.dispose(); }
    } finally { targetGeometry.dispose(); }
    const protectSources = { ...base, ...(protection !== 'patch'
      ? { hazards: sourceCells.map(hazardAt) }
      : { groundSurfacePatches: sourceCells.map(cell => patch(base, cell)) }) };
    const sourceGeometry = directGeometry(protectSources);
    try {
      for (let cell = 0; cell < first.length; cell++) assertNeutral(sourceGeometry, first[cell]);
      const flagged = sourceGeometry.clone();
      try {
        flagged.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode).setX(first[sourceCells[0]], 8);
        assert.throws(() => assertNeutral(flagged, first[sourceCells[0]]), 'a known-bad brick flag on a protected source must be rejected');
      } finally { flagged.dispose(); }
    } finally { sourceGeometry.dispose(); }
  }
});

test('ordinary target exclusion includes the visible pothole halo outside its physical circle', () => {
  const base = gridPlan(), fill = expectedFill(base), target = fill.cells.keys().next().value!;
  assert.ok(fill.cells.size > 0);
  const columns = base.heightfield.columns - 1, column = target % columns, row = Math.floor(target / columns);
  const hole: Hazard = { id: 'visible-halo', kind: 'potholeShallow', radius: 0.3,
    centre: { x: column - 0.4, y: 1, z: row + 0.5 } };
  assert.ok(0.4 > hole.radius, 'the target rectangle is outside the physical circle');
  const plan = { ...base, hazards: [hole] }, geometry = directGeometry(plan);
  try {
    assert.equal(groundHazardMask(plan)[target], 1, 'the visible outline and halo still reach the target cell');
    assertNeutral(geometry, firstVertices(plan)[target]);
  } finally { geometry.dispose(); }
});

test('current attribute and source-color guards reject missing fields, bad topology, wrong tint and material flags', () => {
  const plan = gridPlan(), legacy = createTerrain(plan), current = createTerrain(plan, BASELINE_PRESENTATION, undefined, CURRENT);
  try {
    const mesh = heightfield(current);
    assertLayout(mesh); assertPacking(plan, mesh);
    const missing = mesh.geometry.clone(), moved = mesh.geometry.clone(), tinted = mesh.geometry.clone(), flagged = mesh.geometry.clone();
    try {
      missing.deleteAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
      assert.throws(() => assertLayout(new THREE.Mesh(missing, mesh.material)), 'missing attribute negative control');
      moved.getAttribute('position').setY(0, moved.getAttribute('position').getY(0) + 0.1);
      assert.notDeepEqual(geometryState(moved, [...NAMES, 'color']), geometryState(heightfield(legacy).geometry, ['color']), 'topology guard sees moved ground');
      const target = expectedFill(plan).cells.keys().next().value!, at = firstVertices(plan)[target];
      const tint = tinted.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.tint);
      tint.setX(at, tint.getX(at) * 0.8);
      assert.throws(() => assertPacking(plan, new THREE.Mesh(tinted, mesh.material)), 'wrong source color negative control');
      const mode = flagged.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
      mode.setX(at, mode.getX(at) ^ 4);
      assert.throws(() => assertPacking(plan, new THREE.Mesh(flagged, mesh.material)), 'missing brick-fill flag negative control');
      mode.setX(at, mode.getX(at) ^ 4);
      const ownBrick = plan.heightfield.surfaces.findIndex(surface => SURFACES[surface].material === 'brick');
      mode.setX(firstVertices(plan)[ownBrick], 0);
      assert.throws(() => assertPacking(plan, new THREE.Mesh(flagged, mesh.material)), 'missing original brick flag negative control');
    } finally { missing.dispose(); moved.dispose(); tinted.dispose(); flagged.dispose(); }
  } finally { current.dispose(); legacy.dispose(); }
});

test('ordinary crisp cells retain their own mottle instead of the legacy stair-stepped neighbor blend', () => {
  // Brick has zero encroach and cannot expose the old blend. Grass does.
  const template = gridPlan();
  const plan = { ...template, heightfield: { ...template.heightfield,
    surfaces: template.heightfield.surfaces.map(surface => surface === 'brick' ? 'grass' as SurfaceId : surface) } };
  const uniform = { ...plan, heightfield: { ...plan.heightfield,
    surfaces: plan.heightfield.surfaces.map(() => 'pavement' as SurfaceId) } };
  const old = createTerrain(plan), current = createTerrain(plan, BASELINE_PRESENTATION, undefined, CURRENT);
  const plain = createTerrain(uniform, BASELINE_PRESENTATION, undefined, CURRENT);
  try {
    const first = firstVertices(plan), plainFirst = firstVertices(uniform);
    const a = heightfield(current).geometry.getAttribute('color'), b = heightfield(plain).geometry.getAttribute('color');
    const legacy = heightfield(old).geometry.getAttribute('color');
    let legacyDifferences = 0;
    for (let cell = 0; cell < first.length; cell++) {
      if (plan.heightfield.surfaces[cell] !== 'pavement') continue;
      const own = [a.getX(first[cell]), a.getY(first[cell]), a.getZ(first[cell])];
      const unblended = [b.getX(plainFirst[cell]), b.getY(plainFirst[cell]), b.getZ(plainFirst[cell])];
      assert.deepEqual(own, unblended, 'the new crisp field retains exact own-surface mottle');
      const oldTone = [legacy.getX(first[cell]), legacy.getY(first[cell]), legacy.getZ(first[cell])];
      if (oldTone.some((value, channel) => value !== unblended[channel])) legacyDifferences++;
    }
    assert.ok(legacyDifferences > 0, 'legacy blend is an effective positive control');
  } finally { plain.dispose(); current.dispose(); old.dispose(); }
});

test('palette albedos decode from sRGB to linear before source ratios are packed', () => {
  const plan = gridPlan(), geometry = directGeometry(plan), first = firstVertices(plan);
  const filled = expectedFill(plan);
  assert.ok(filled.cells.size > 0);
  const srgb = (hex: number, channel: number): number => ((hex >> (16 - channel * 8)) & 255) / 255;
  const linear = (value: number): number => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  let badSrgbRatios = 0;
  try {
    const tint = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.tint);
    for (const [cell, fill] of filled.cells) {
      assert.equal(plan.heightfield.surfaces[cell], 'pavement'); assert.equal(fill.towards, 'brick');
      const packed = [tint.getX(first[cell]), tint.getY(first[cell]), tint.getZ(first[cell])];
      for (let channel = 0; channel < 3; channel++) {
        const source = srgb(plan.palette!.brick!, channel), own = srgb(plan.palette!.pavement!, channel);
        const ratio = linear(source) / linear(own);
        assert.ok(Math.abs(packed[channel] - ratio) <= Math.abs(ratio) * 0.0011, 'independent sRGB decode agrees with packed multiplier');
        if (Math.abs(source / own - ratio) > Math.abs(ratio) * 0.05) badSrgbRatios++;
      }
    }
    assert.ok(badSrgbRatios > 0, 'the palette rejects a ratio accidentally computed in sRGB');
  } finally { geometry.dispose(); }
});

function interpolated(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  first: number, channel: 0 | 1, x: number, z: number): number {
  const at = (corner: number): number => channel === 0 ? attribute.getX(first + corner) : attribute.getY(first + corner);
  // Authoritative a-d-b / a-c-d mesh diagonal, matching physical ground.
  return x >= z ? (1 - x) * at(0) + (x - z) * at(1) + z * at(3)
    : (1 - z) * at(0) + (z - x) * at(2) + x * at(3);
}

function packedCovered(geometry: THREE.BufferGeometry, first: number, x: number, z: number): boolean {
  const edge = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge);
  const a = interpolated(edge, first, 0, x, z), b = interpolated(edge, first, 1, x, z);
  const bits = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode).getX(first);
  if ((bits & 2) !== 0) {
    const k = GROUND_BOUNDARY.kneeRoundCells, h = Math.max(k - Math.abs(a - b), 0) / Math.max(k, 1e-6);
    return Math.max(a, b) + h * h * k / 4 > 0;
  }
  return ((bits & 1) !== 0 ? Math.min(a, b) : Math.max(a, b)) > 0;
}

test('brick material coverage continues from original brick cells through their analytic fills only', () => {
  const plan = gridPlan(), geometry = directGeometry(plan), first = firstVertices(plan), filled = expectedFill(plan);
  const mode = geometry.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.mode);
  let originals = 0, covered = 0, retained = 0;
  const brickAt = (cell: number, x: number, z: number): boolean => {
    const bits = mode.getX(first[cell]);
    return packedCovered(geometry, first[cell], x, z) ? (bits & 4) !== 0 : (bits & 8) !== 0;
  };
  try {
    for (let cell = 0; cell < first.length; cell++) {
      if (SURFACES[plan.heightfield.surfaces[cell]].material !== 'brick') continue;
      assert.ok(!filled.cells.has(cell), 'original laid brick has no incoming fill in the control');
      assertNeutral(geometry, first[cell], 8);
      for (const [x, z] of [[0.01, 0.01], [0.23, 0.79], [0.99, 0.99]]) assert.equal(brickAt(cell, x, z), true);
      originals++;
    }
    for (const [cell, fill] of filled.cells) {
      assert.equal(SURFACES[fill.towards].material, 'brick');
      assert.equal(mode.getX(first[cell]) & 12, 4, 'the incoming fill carries brick without changing the target material');
      assert.equal(brickAt(fill.source, 0.5, 0.5), true, 'its original source is brick too');
      for (let x = 1; x < 12; x++) for (let z = 1; z < 12; z++) {
        const isCovered = packedCovered(geometry, first[cell], x / 12, z / 12);
        assert.equal(brickAt(cell, x / 12, z / 12), isCovered, 'brick ends at the same analytic boundary as its source tint');
        if (isCovered) covered++; else retained++;
      }
    }
    assert.ok(originals > 0 && covered > 0 && retained > 0, 'the fixture contains original brick, filled brick and retained pavement');
  } finally { geometry.dispose(); }
});

function assertPackedCap(plan: LevelPlan, geometry: THREE.BufferGeometry): void {
  const first = firstVertices(plan), columns = plan.heightfield.columns - 1;
  const sources = plan.heightfield.surfaces.flatMap((surface, cell) => surface === 'brick' ? [cell] : []);
  const cap = Math.min(GROUND_BOUNDARY.drivableCapCells, GROUND_BOUNDARY.capMetres / plan.heightfield.spacing);
  let covered = 0, open = 0;
  for (const [cell] of expectedFill(plan).cells) {
    const column = cell % columns, row = Math.floor(cell / columns);
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) {
      const gx = column + x / 12, gz = row + z / 12;
      if (!packedCovered(geometry, first[cell], x / 12, z / 12)) { open++; continue; }
      covered++;
      let distance = Infinity;
      for (const source of sources) {
        const sx = source % columns, sz = Math.floor(source / columns);
        const dx = Math.max(sx - gx, 0, gx - sx - 1), dz = Math.max(sz - gz, 0, gz - sz - 1);
        distance = Math.min(distance, Math.hypot(dx, dz));
      }
      assert.ok(distance <= cap + 0.002, `packed fill exceeds drivable/metre cap: ${distance} > ${cap}`);
    }
  }
  assert.ok(covered > 0 && open > 0, 'the fixture exercises both fill and retained riding surface');
}

test('packed fragment half-planes obey the drivable and metre caps at 1 m, 1.5 m and 3 m spacing', () => {
  for (const spacing of [1, 1.5, 3]) {
    const plan = gridPlan(spacing), geometry = directGeometry(plan);
    try {
      assertPackedCap(plan, geometry);
      const widened = geometry.clone();
      try {
        const edge = widened.getAttribute(GROUND_BOUNDARY_ATTRIBUTES.edge);
        for (const cell of expectedFill(plan).cells.keys()) {
          const at = firstVertices(plan)[cell];
          for (let corner = 0; corner < 4; corner++) {
            edge.setXY(at + corner, edge.getX(at + corner) + 2, edge.getY(at + corner) + 2);
          }
        }
        assert.throws(() => assertPackedCap(plan, widened), /packed fill exceeds/, 'known-bad widened fill must fail its reach guard');
      } finally { widened.dispose(); }
    } finally { geometry.dispose(); }
  }
});

test('ordinary filters unsafe sparse-grid chamfers while the old Ultra wrapper remains unchanged', () => {
  for (const spacing of [1, 1.5]) {
    const plan = gridPlan(spacing);
    assert.deepEqual(expectedFill(plan), coreFill(plan), 'shipped spacing keeps the original field exactly');
  }
  const template = gridPlan(3);
  const plan = { ...template, heightfield: { ...template.heightfield, columns: 3, rows: 3,
    heights: Array(9).fill(1), surfaces: ['brick', 'pavement', 'brick', 'brick'] as SurfaceId[] } };
  const drawn = terrainCells(plan).bySurface, old = oldUltraFill(plan, drawn);
  const ordinary = expectedFill(plan);
  const knownBad = old.cells.get(1);
  assert.ok(knownBad && knownBad.pocket === 'chamfer', 'old Ultra admits the isolated half-cell L chamfer');
  assert.ok(oldUltraCovers(knownBad, 1.49, 0.51), 'old fragment arithmetic covers the known over-cap point');
  assert.ok(0.49 * plan.heightfield.spacing > GROUND_BOUNDARY.capMetres, '1.47 m covered reach exceeds the 0.75 m policy');
  assert.equal(ordinary.cells.size, 0, 'ordinary drops the unsafe chamfer rather than changing the Ultra core');
  assert.equal(ordinary.lines, 0);
  assert.deepEqual(ordinary.pockets, { chain: 0, chamfer: 0 });
  assert.equal(ordinary.dropped, old.dropped + old.cells.size);
  assert.equal(ordinary.chains, old.chains);
  assert.equal(ordinary.chainCells, old.chainCells);
  const geometry = directGeometry(plan);
  try { assertNeutral(geometry, firstVertices(plan)[1]); } finally { geometry.dispose(); }
});

type CompileShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
function standardShader(): CompileShader {
  return { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as CompileShader;
}

test('ordinary patch chains the previous hook and key, pins every installed standard anchor, and adds no sampler', () => {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  let previousCalls = 0;
  material.onBeforeCompile = shader => { previousCalls++; shader.vertexShader += '\n// previous hook'; };
  material.customProgramCacheKey = () => 'previous-program';
  installOrdinaryGroundBoundary(material);
  const shader = standardShader();
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  assert.equal(previousCalls, 1);
  assert.ok(shader.vertexShader.endsWith('// previous hook'));
  assert.ok(material.customProgramCacheKey().startsWith('previous-program/'));
  for (const declaration of ['attribute vec2 groundBoundaryEdge;', 'attribute vec3 groundBoundaryTint;', 'attribute float groundBoundaryMode;']) {
    assert.equal(shader.vertexShader.split(declaration).length, 2);
  }
  for (const source of [shader.vertexShader, shader.fragmentShader]) {
    assert.equal(source.split('varying vec2 vGroundPavingWorld;').length, 2, 'both stages share one paving world position');
  }
  assert.match(shader.vertexShader, /vGroundPavingWorld\s*=\s*\(modelMatrix\s*\*\s*vec4\(transformed,\s*1\.0\)\)\.xz;/,
    'original and incoming brick use the same world-space grid');
  assert.ok(shader.fragmentShader.indexOf(GROUND_BOUNDARY_FRAGMENT) > shader.fragmentShader.indexOf(GROUND_BOUNDARY_ANCHORS.color));
  assert.match(GROUND_BOUNDARY_FRAGMENT, /float boundaryBits\s*=\s*mod\(vGroundBoundaryMode,\s*4\.0\);/,
    'material flags cannot alter boundary union, intersection or rounding');
  assert.match(GROUND_BOUNDARY_FRAGMENT, /float pavingOwn\s*=\s*step\(7\.5,\s*vGroundBoundaryMode\);/);
  assert.match(GROUND_BOUNDARY_FRAGMENT, /float pavingFill\s*=\s*mod\(floor\(vGroundBoundaryMode\s*\/\s*4\.0\),\s*2\.0\);/);
  assert.match(GROUND_BOUNDARY_FRAGMENT, /float pavingCover\s*=\s*mix\(pavingOwn,\s*pavingFill,\s*boundaryCover\);/,
    'paving and source tint end at the same coverage boundary');
  const footprint = GROUND_BOUNDARY_FRAGMENT.indexOf('float pavingFootprint');
  assert.ok(footprint >= 0 && footprint < GROUND_BOUNDARY_FRAGMENT.indexOf('if (pavingCover > 0.0)'),
    'world-space derivatives execute before the material-dependent branch');
  assert.match(GROUND_BOUNDARY_FRAGMENT, /dFdx\(vGroundPavingWorld\)/);
  assert.match(GROUND_BOUNDARY_FRAGMENT, /dFdy\(vGroundPavingWorld\)/);
  assert.match(GROUND_BOUNDARY_FRAGMENT, /mod\(pavingRow,\s*2\.0\)\s*\*\s*0\.5/,
    'alternate rows share a continuous running-bond offset');
  assert.match(GROUND_BOUNDARY_FRAGMENT, /pavingHalfPixel\s*=\s*max\(pavingFootprint\s*\*\s*0\.5,/,
    'joint filtering scales with the derivative footprint');
  assert.match(GROUND_BOUNDARY_FRAGMENT, /float pavingResolved\s*=\s*1\.0\s*-\s*smoothstep\([^;]+pavingFootprint\);/,
    'unresolved paving fades with its measured footprint');
  assert.doesNotMatch(GROUND_BOUNDARY_FRAGMENT, /\b(?:sampler\w*|texture\w*|normal\w*|gl_FragDepth)\b/);
  assert.doesNotMatch(shader.vertexShader.slice(shader.vertexShader.indexOf('vGroundBoundaryEdge =')), /\btransformed\s*[+*\-/]?=/);
  for (const [side, anchor] of [
    ['vertexShader', GROUND_BOUNDARY_ANCHORS.common], ['vertexShader', GROUND_BOUNDARY_ANCHORS.begin],
    ['fragmentShader', GROUND_BOUNDARY_ANCHORS.common], ['fragmentShader', GROUND_BOUNDARY_ANCHORS.color],
  ] as const) for (const bad of ['missing', 'duplicate'] as const) {
    const changed = standardShader();
    changed[side] = changed[side].replace(anchor, bad === 'missing' ? '// removed anchor' : `${anchor}\n${anchor}`);
    assert.throws(() => material.onBeforeCompile(changed, undefined as unknown as THREE.WebGLRenderer), /Ground boundary shader anchor changed/);
  }
  material.dispose();
});

test('Renderer opts in on the actual runtime call, while factory goldens remain a separate historical path', () => {
  // This source guard holds the wiring the headless factory tests cannot execute.
  // A browser check is still required for successful GL compilation and rendered appearance.
  const renderer = readFileSync(new URL('./Renderer.ts', import.meta.url), 'utf8');
  assert.match(renderer, /ordinaryBoundary\s*:\s*context === null/, 'current ordinary runtime must request the field explicitly');
  assert.match(renderer, /sharedSurface\s*:\s*true/, 'both tiers must retain the shared material foundation');
});

test('ordinary boundary attributes die with the owning geometry across sequential world replacement', () => {
  const scene = new THREE.Scene();
  for (const factory of [() => gridPlan(), () => gridPlan(1.5), () => gridPlan(1)]) {
    const view = createTerrain(factory(), BASELINE_PRESENTATION, undefined, CURRENT);
    const geometry = heightfield(view).geometry;
    assertLayout(heightfield(view));
    let disposals = 0;
    geometry.addEventListener('dispose', () => disposals++);
    scene.add(view.group);
    view.dispose(); view.dispose();
    assert.equal(disposals, 1, 'the owning geometry is freed once by the idempotent path');
    assert.equal(scene.children.length, 0, 'outgoing world detaches from the scene');
  }
  // This proves teardown ownership, not WebGL buffer/program plateau or real-device cost.
});
