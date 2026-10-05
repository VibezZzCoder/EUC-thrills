/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { POTHOLE } from '../data/tuning.ts';
import type { BoxCollider, GroundSurfaceTriangle, LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { createEnvironmentVegetation } from './environmentVegetation.ts';
import { prepareEnvironmentVegetation } from './environmentVegetationPlan.ts';
import { ENVIRONMENT_VEGETATION as RULES, VEGETATION_COUCH_DETAIL, VEGETATION_TIER_DETAIL } from '../data/tuning.ts';
import { vegetationDetailFor } from './vegetationDistance.ts';

const ground = (x: number, z: number) => 1 + x * 0.016 + z * 0.025;

function fixture(slopeX = 0.016, slopeZ = 0.025): LevelPlan {
  const ground = (x: number, z: number) => 1 + x * slopeX + z * slopeZ;
  const point = (x: number, z: number) => ({ x, y: ground(x, z), z });
  const triangles: GroundSurfaceTriangle[] = [];
  // A precise strip narrower than the admission lattice. Its actual triangles
  // must stay clear even when no coarse cell has acquired pavement semantics.
  for (let row = 7; row < 57; row++) {
    const z = row - 32, a = point(8.02, z), b = point(8.06, z);
    const c = point(8.02, z + 1), d = point(8.06, z + 1), cell = row * 64 + 40;
    triangles.push({ cell, vertices: [a, c, d] }, { cell, vertices: [a, d, b] });
  }
  const solid: BoxCollider = { centre: { ...point(-10, -6), y: ground(-10, -6) + 1 },
    halfExtents: { x: 3, y: 1, z: 2 }, rotationY: 0.67, surface: 'pavement' };
  const planting: BoxCollider = { centre: { ...point(13, 9), y: ground(13, 9) + 0.8 },
    halfExtents: { x: 2, y: 0.8, z: 1.5 }, rotationY: -0.4, surface: 'grass' };
  return { id: 'vegetation-fixture', spawn: { position: point(0, -28), headingY: 0 },
    surround: { height: 0, surface: 'grass' }, checkpoints: [],
    heightfield: { originX: -32, originZ: -32, spacing: 1, columns: 65, rows: 65,
      heights: Array.from({ length: 65 * 65 }, (_, i) => ground(i % 65 - 32, Math.floor(i / 65) - 32)),
      surfaces: Array.from({ length: 64 * 64 }, (_, i): SurfaceId => Math.abs(i % 64 - 31.5) < 2 ? 'pavement' : 'grass') },
    segments: [{ id: 'original-street', colliders: [],
      entry: { position: point(0, -28), headingY: 0, halfWidth: 2, gradient: 0, surface: 'pavement' },
      exit: { position: point(0, 28), headingY: 0, halfWidth: 2, gradient: 0, surface: 'pavement' } }],
    solids: [solid], softBodies: [planting],
    groundSurfacePatches: [{ id: 'original-precise-strip', surface: 'pavement', triangles }],
    hazards: [{ id: 'original-hole', kind: 'potholeDeep', centre: point(-12, 17), radius: 2 }] };
}

function meshList(group: THREE.Group): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  group.traverse(object => { if (object instanceof THREE.InstancedMesh) meshes.push(object); });
  return meshes;
}

function rootPoints(group: THREE.Group): THREE.Vector3[] {
  const roots: THREE.Vector3[] = [], matrix = new THREE.Matrix4();
  for (const mesh of meshList(group).filter(mesh => mesh.visible && mesh.name.includes('-base-'))) {
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); roots.push(new THREE.Vector3().setFromMatrixPosition(matrix)); }
  }
  return roots;
}

function boxDistance(p: THREE.Vector3, box: BoxCollider): number {
  // Independently transform a point to the original box frame, then measure
  // distance to its rectangle; do not trust the renderer's admission result.
  const local = new THREE.Vector3(p.x - box.centre.x, 0, p.z - box.centre.z)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -box.rotationY);
  return Math.hypot(Math.max(0, Math.abs(local.x) - box.halfExtents.x),
    Math.max(0, Math.abs(local.z) - box.halfExtents.z));
}

function admissibleRoot(plan: LevelPlan, p: THREE.Vector3): boolean {
  const r = RULES.footprintRadius, field = plan.heightfield;
  if (p.x - r < -32 || p.x + r > 32 || p.z - r < -32 || p.z + r > 32) return false;
  if (Math.abs(p.x) <= 2 + RULES.routeMargin + r && p.z >= -28 - r && p.z <= 28 + r) return false;
  if (p.z >= -25 - r && p.z <= 25 + r && p.x >= 8.02 - r && p.x <= 8.06 + r) return false;
  if ([...(plan.solids ?? []), ...(plan.softBodies ?? [])].some(box => boxDistance(p, box) <= r)) return false;
  const halo = 2 * POTHOLE.haloFraction * (1 + POTHOLE.outlineHarmonics.reduce((sum, h) => sum + Math.abs(h), 0));
  if (Math.hypot(p.x + 12, p.z - 17) <= halo + r) return false;
  const sample = createGroundSample(); new PlanTerrainSampler(plan).sampleGround(p.x, p.z, sample);
  const cell = Math.floor(p.z - field.originZ) * (field.columns - 1) + Math.floor(p.x - field.originX);
  return sample.surface === 'grass' && field.surfaces[cell] === 'grass'
    && Math.abs(p.y - sample.height - RULES.rootLift) < 0.00002;
}

test('both populations sit on original sloped grass and clear real footprints without modifying the plan', () => {
  const plan = fixture(), source = JSON.stringify(plan), view = createEnvironmentVegetation(plan);
  try {
    for (const ultra of [false, true]) {
      view.setDetail(ultra);
      const roots = rootPoints(view.group);
      assert.ok(roots.length > 40, 'the positive fixture must actually emit vegetation');
      assert.equal(roots.length, view.report().clumps);
      for (const p of roots) assert.ok(admissibleRoot(plan, p), `invalid original-ground placement ${p.toArray()}`);
    }
    // A planted root moved into the original street is a known-bad control for
    // the same assertion that inspected every emitted root above.
    const bad = rootPoints(view.group)[0].clone(); bad.x = 0; bad.z = 0; bad.y = ground(0, 0) + RULES.rootLift;
    assert.equal(admissibleRoot(plan, bad), false);
    view.update(31, false); view.update(31, true); view.setDetail(false);
    assert.equal(JSON.stringify(plan), source);
  } finally { view.dispose(); }
});

test('rebuilds are deterministic; Ultra reuses and enriches the ordinary world-locked population', () => {
  const plan = fixture(), a = createEnvironmentVegetation(plan), b = createEnvironmentVegetation(plan);
  try {
    const buffers = (group: THREE.Group) => meshList(group).map(mesh => ({ name: mesh.name,
      matrices: Array.from(mesh.instanceMatrix.array), colours: Array.from(mesh.instanceColor!.array) }));
    assert.deepEqual(buffers(a.group), buffers(b.group));
    const original = buffers(a.group), originalGeometry = meshList(a.group)[0].geometry;
    const originalMaterial = meshList(a.group)[0].material;
    const ordinaryReport = a.report();
    assert.equal(ordinaryReport.geometryOwners, 1);
    assert.equal(ordinaryReport.ultraCached, false);
    assert.equal(meshList(a.group).some(mesh => mesh.name.includes('-ultra-')), false);
    assert.equal(meshList(a.group).reduce((sum, mesh) => sum + mesh.instanceMatrix.count, 0), ordinaryReport.clumps);
    assert.equal(ordinaryReport.instanceBytes, meshList(a.group).reduce((sum, mesh) =>
      sum + mesh.instanceMatrix.array.byteLength + mesh.instanceColor!.array.byteLength, 0));
    assert.equal(ordinaryReport.ordinaryDrawCalls, ordinaryReport.drawCalls);
    assert.equal(ordinaryReport.ordinaryColourTriangles, ordinaryReport.colourTriangles);
    const ordinary = rootPoints(a.group).map(p => p.toArray().join(',')).sort();
    a.setDetail(true); b.setDetail(true);
    assert.deepEqual(buffers(a.group), buffers(b.group));
    assert.equal(a.report().geometryOwners, 2); assert.equal(a.report().ultraCached, true);
    assert.equal(a.report().ordinaryDrawCalls, ordinaryReport.drawCalls);
    assert.equal(a.report().ordinaryColourTriangles, ordinaryReport.colourTriangles);
    assert.ok(a.report().instanceBytes > ordinaryReport.instanceBytes);
    for (const before of original) {
      const after = buffers(a.group).find(mesh => mesh.name === before.name)!;
      assert.deepEqual(after.matrices.slice(0, before.matrices.length), before.matrices);
      assert.deepEqual(after.colours.slice(0, before.colours.length), before.colours);
    }
    for (const mesh of meshList(a.group)) {
      assert.equal(mesh.material, originalMaterial);
      if (mesh.name.includes('-base-')) assert.equal(mesh.geometry, originalGeometry);
    }
    const ultra = new Set(rootPoints(a.group).map(p => p.toArray().join(',')));
    assert.ok(ultra.size > ordinary.length); for (const key of ordinary) assert.ok(ultra.has(key));
    assert.ok(a.report().blades > ordinary.length * RULES.ordinaryBlades);
    const cachedBuffers = buffers(a.group), cachedOwners = meshList(a.group).map(mesh => [mesh, mesh.geometry, mesh.material]);
    const cachedCost = a.report().instanceBytes;
    a.update(6, false); a.update(6, true); a.setDetail(false);
    assert.deepEqual(buffers(a.group), cachedBuffers);
    assert.deepEqual(meshList(a.group).map(mesh => [mesh, mesh.geometry, mesh.material]), cachedOwners);
    assert.deepEqual(rootPoints(a.group).map(p => p.toArray().join(',')).sort(), ordinary);
    assert.equal(a.report().clumps, ordinary.length);
    assert.equal(a.report().ultraCached, true); assert.equal(a.report().instanceBytes, cachedCost);
    a.setDetail(true); a.setDetail(false);
    assert.deepEqual(meshList(a.group).map(mesh => [mesh, mesh.geometry, mesh.material]), cachedOwners);
  } finally { a.dispose(); b.dispose(); }
});

test('blades are narrow closed outward volumes with stated heights, and costs match owned buffers', () => {
  const view = createEnvironmentVegetation(fixture());
  try {
    view.setDetail(true);
    const meshes = meshList(view.group), geometries = new Set(meshes.map(mesh => mesh.geometry));
    const materials = new Set(meshes.map(mesh => mesh.material));
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const mesh of meshes) for (let i = 0; i < mesh.instanceMatrix.count; i++) {
      mesh.getMatrixAt(i, matrix); matrix.decompose(p, q, scale);
      assert.ok(scale.y >= RULES.minimumHeight - 1e-7 && scale.y <= RULES.maximumHeight + 1e-7);
      assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
    }
    for (const geometry of geometries) {
      assert.equal(geometry.getAttribute('uv'), undefined);
      const positions = geometry.getAttribute('position'), index = geometry.index!, edges = new Map<string, number>();
      let volume = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        assert.ok(positions.getY(i) >= 0 && positions.getY(i) <= 1);
        assert.ok(Math.hypot(positions.getX(i), positions.getZ(i)) + RULES.windMetres * 3 < RULES.footprintRadius);
      }
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        a.fromBufferAttribute(positions, ids[0]); b.fromBufferAttribute(positions, ids[1]); c.fromBufferAttribute(positions, ids[2]);
        volume += a.dot(b.cross(c)) / 6;
        for (let j = 0; j < 3; j++) { const key = `${ids[j]},${ids[(j + 1) % 3]}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      }
      assert.ok(volume > 0, 'a consistently inward blade must fail');
      for (const [key, count] of edges) { assert.equal(count, 1); assert.equal(edges.get(key.split(',').reverse().join(',')), 1); }
    }
    const bytes = [...geometries].reduce((sum, geometry) => sum + Object.values(geometry.attributes)
      .reduce((owned, attribute) => owned + attribute.array.byteLength, 0) + geometry.index!.array.byteLength, 0);
    const instanceBytes = meshes.reduce((sum, mesh) => sum + mesh.instanceMatrix.array.byteLength + mesh.instanceColor!.array.byteLength, 0);
    for (const ultra of [false, true]) {
      view.setDetail(ultra); const report = view.report();
      assert.equal(report.geometryBytes, bytes); assert.equal(report.instanceBytes, instanceBytes);
      assert.equal(report.geometryOwners, geometries.size); assert.equal(report.materialOwners, materials.size);
      assert.equal(report.drawCalls, meshes.filter(mesh => mesh.visible && mesh.count > 0).length);
      assert.equal(report.colourTriangles, meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index!.count / 3, 0));
      assert.equal(report.textureBytes, 0); assert.equal(report.shadowDrawCalls, 0);
      assert.ok(report.drawCalls <= RULES.maximumSpatialBatches * 2);
    }
  } finally { view.dispose(); }
});

test('transformed vertices and conservative wind extremes remain inside admitted footprints on steep source slopes', () => {
  const plan = fixture(0.68, 0.10), source = JSON.stringify(plan), view = createEnvironmentVegetation(plan);
  const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  const matrix = new THREE.Matrix4(), root = new THREE.Vector3(), vertex = new THREE.Vector3();
  const halo = 2 * POTHOLE.haloFraction * (1 + POTHOLE.outlineHarmonics.reduce((sum, h) => sum + Math.abs(h), 0));
  let maximumHorizontalReach = 0, checked = 0;
  try {
    for (const ultra of [false, true]) {
      view.setDetail(ultra);
      assert.ok(view.report().clumps > 40, 'the near-limit slope must actually be admitted');
      for (const mesh of meshList(view.group).filter(mesh => mesh.visible)) {
        const positions = mesh.geometry.getAttribute('position');
        for (let instance = 0; instance < mesh.count; instance++) {
          mesh.getMatrixAt(instance, matrix); root.setFromMatrixPosition(matrix);
          sampler.sampleGround(root.x, root.z, sample);
          assert.ok(sample.normal.y >= RULES.minimumUpNormal && sample.normal.y < 0.84);
          for (let i = 0; i < positions.count; i++) {
            // Every sin/cos combination lies within these four corners. Apply
            // the shader's local bend before the actual terrain/yaw/scale matrix.
            const bound = positions.getY(i) ** 2 * RULES.windMetres * 1.45;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
              vertex.set(positions.getX(i) + sx * bound, positions.getY(i), positions.getZ(i) + sz * bound).applyMatrix4(matrix);
              const reach = Math.hypot(vertex.x - root.x, vertex.z - root.z);
              maximumHorizontalReach = Math.max(maximumHorizontalReach, reach);
              assert.ok(reach < RULES.footprintRadius, 'the full posed blade must fit its admission disk');
              const field = plan.heightfield;
              assert.ok(vertex.x >= field.originX && vertex.x <= 32 && vertex.z >= field.originZ && vertex.z <= 32);
              sampler.sampleGround(vertex.x, vertex.z, sample);
              assert.equal(sample.surface, 'grass');
              assert.ok(Math.hypot(vertex.x, vertex.z - Math.max(-28, Math.min(28, vertex.z))) > 2 + RULES.routeMargin);
              for (const box of [...plan.solids!, ...plan.softBodies!]) assert.ok(boxDistance(vertex, box) > 0);
              assert.ok(Math.hypot(vertex.x + 12, vertex.z - 17) > halo);
              checked++;
            }
          }
        }
      }
    }
    assert.ok(checked > 1000);
    assert.ok(maximumHorizontalReach > 0.23, 'this fixture must expose the former too-small footprint');
    assert.equal(JSON.stringify(plan), source);
  } finally { view.dispose(); }
});

test('wind uses one bounded source clock, freezes for reduced motion, and owns no sampler or texture', () => {
  const view = createEnvironmentVegetation(fixture());
  try {
    const material = meshList(view.group)[0].material as THREE.MeshStandardMaterial;
    type Shader = Parameters<typeof material.onBeforeCompile>[0];
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '', uniforms: {} } as Shader;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    assert.equal((shader.vertexShader.match(/uniform float vegetationClock;/g) ?? []).length, 1);
    assert.ok(shader.vertexShader.includes('instanceMatrix * vegetationAnchor'));
    assert.ok(shader.vertexShader.includes('transformed.y * transformed.y'));
    assert.equal(shader.vertexShader.includes('sampler'), false); assert.equal(material.transparent, false);
    view.update(31, false); assert.equal(shader.uniforms.vegetationClock.value, 31);
    assert.equal(shader.uniforms.vegetationWind.value, RULES.windMetres);
    view.update(31, true); assert.equal(shader.uniforms.vegetationWind.value, 0);
    view.update(31 + RULES.windPeriodSeconds, false); assert.equal(shader.uniforms.vegetationClock.value, 31);
    view.update(-1, false); assert.equal(shader.uniforms.vegetationClock.value, RULES.windPeriodSeconds - 1);
    view.update(Number.NaN, false); assert.equal(shader.uniforms.vegetationClock.value, 0);
  } finally { view.dispose(); }
});

test('one idempotent world teardown releases every owned resource and its instance buffers exactly once', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 3; generation++) {
    const view = createEnvironmentVegetation(fixture());
    const resources = new Set<THREE.InstancedMesh | THREE.BufferGeometry | THREE.Material>();
    const disposed = new Map<object, number>();
    const watch = () => {
      const next = new Set<THREE.InstancedMesh | THREE.BufferGeometry | THREE.Material>();
      for (const mesh of meshList(view.group)) { next.add(mesh); next.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) next.add(material); }
      for (const resource of next) {
        if (resources.has(resource)) continue;
        resources.add(resource);
        const listener = () => { disposed.set(resource, (disposed.get(resource) ?? 0) + 1); };
        if (resource instanceof THREE.InstancedMesh) resource.addEventListener('dispose', listener);
        else if (resource instanceof THREE.BufferGeometry) resource.addEventListener('dispose', listener);
        else resource.addEventListener('dispose', listener);
      }
    };
    watch();
    scene.add(view.group); assert.ok(scene.children.length > 0);
    if (generation > 0) {
      view.setDetail(true); watch();
      assert.ok(disposed.size > 0, 'expanding capacity must release replaced ordinary instance buffers');
      const cached = [...resources]; view.setDetail(false); view.setDetail(true); watch();
      assert.deepEqual([...resources], cached, 'later tier selections must allocate nothing');
    }
    view.dispose(); view.dispose(); view.update(14, false); view.setDetail(true);
    assert.equal(scene.children.length, 0); assert.equal(view.group.children.length, 0);
    assert.equal(view.group.parent, null); assert.equal(disposed.size, resources.size);
    for (const count of disposed.values()) assert.equal(count, 1);
    const report = view.report();
    for (const field of ['clumps', 'blades', 'drawCalls', 'colourTriangles', 'geometryBytes', 'instanceBytes',
      'materialOwners', 'geometryOwners', 'ordinaryClumps', 'ultraClumps'] as const) assert.equal(report[field], 0, field);
    assert.equal(report.disposed, true); assert.equal(report.ultraCached, false);
  }
});

test('non-grass worlds own nothing and malformed source heightfields are refused', () => {
  const plan = fixture(); plan.heightfield = { ...plan.heightfield, surfaces: plan.heightfield.surfaces.map(() => 'pavement') };
  const empty = createEnvironmentVegetation(plan);
  try { assert.equal(empty.group.children.length, 0); assert.equal(empty.report().clumps, 0);
    assert.equal(empty.report().drawCalls, 0); assert.equal(empty.report().materialOwners, 0); assert.equal(empty.report().geometryBytes, 0); }
  finally { empty.dispose(); }
  const heights = [...plan.heightfield.heights]; heights[3] = Number.NaN;
  assert.throws(() => createEnvironmentVegetation({ ...plan, heightfield: { ...plan.heightfield, heights } }), /Invalid vegetation heightfield/);
});


test('disposing a grass view preserves its borrowed preparation for independent tier rebuilds', () => {
  const plan = fixture(), prepared = prepareEnvironmentVegetation(plan);
  const snapshot = () => JSON.stringify({ clumps: prepared.clumps, batches: [...prepared.batches],
    ordinaryClumps: prepared.ordinaryClumps, corridorClumps: prepared.corridorClumps });
  const before = snapshot(); assert.ok(prepared.clumps.length > 40);
  let ordinaryReport: ReturnType<ReturnType<typeof createEnvironmentVegetation>['report']> | undefined;
  for (const rich of [false, true, false, true]) {
    const view = createEnvironmentVegetation(plan, prepared);
    try {
      view.setDetail(rich); const report = view.report();
      assert.equal(report.clumps, rich ? prepared.clumps.length : prepared.ordinaryClumps);
      assert.ok(report.clumps > 40);
      if (!rich) { if (ordinaryReport) assert.deepEqual(report, ordinaryReport); else ordinaryReport = report; }
      assert.ok(snapshot() === before, 'building and tier selection do not alter CPU source arrays');
    } finally { view.dispose(); view.dispose(); }
    assert.ok(snapshot() === before, 'GPU teardown cannot erase the shared CPU preparation');
  }
});

// RL-1 (2026-10-03): the grass program follows the renderer's tier. High keeps
// the accepted defines, key and shader text; a reduced tier is its own program.
test('the grass fade is compiled per tier and High keeps its accepted program', () => {
  let tier: 'low' | 'medium' | 'high' = 'high';
  const view = createEnvironmentVegetation(fixture(), undefined, () => VEGETATION_TIER_DETAIL[tier]);
  const baseline = createEnvironmentVegetation(fixture());
  try {
    const material = meshList(view.group)[0].material as THREE.MeshStandardMaterial;
    const accepted = meshList(baseline.group)[0].material as THREE.MeshStandardMaterial;
    type Shader = Parameters<typeof material.onBeforeCompile>[0];
    const compiled = (target: THREE.MeshStandardMaterial): string => {
      const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '', uniforms: {} } as Shader;
      target.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      return shader.vertexShader;
    };
    const high = compiled(material);
    assert.equal(high, compiled(accepted));
    assert.ok(high.includes(`smoothstep(${RULES.fadeStartMetres.toFixed(1)}, ${RULES.fadeEndMetres.toFixed(1)},`));
    assert.deepEqual(material.defines, accepted.defines);
    assert.equal(material.customProgramCacheKey(), 'environment-vegetation-v2');
    const version = material.version;
    tier = 'low'; view.update(5, false);
    assert.ok(material.version > version, 'a tier change asks three for the program again');
    const low = VEGETATION_TIER_DETAIL.low;
    assert.equal(material.defines!.VEGETATION_FADE_START, low.grassFadeStartMetres.toFixed(1));
    assert.equal(material.defines!.VEGETATION_FADE_END, low.grassFadeEndMetres.toFixed(1));
    assert.ok(compiled(material).includes(`smoothstep(${low.grassFadeStartMetres.toFixed(1)}, ${low.grassFadeEndMetres.toFixed(1)},`));
    const settled = material.version;
    view.update(6, false); assert.equal(material.version, settled, 'an unchanged tier never recompiles');
    tier = 'high'; (material.onBeforeRender as () => void)();
    assert.deepEqual(material.defines, accepted.defines, 'High returns to the accepted program key');
    assert.equal(compiled(material), high);
  } finally { view.dispose(); baseline.dispose(); }
});

// PERF-R2-1 (2026-10-04): the couch rules move the grass fade from the third
// pane on; a renderer's warm-up re-keys now to link that program, and the
// one- and two-pane key comes back as High's accepted one exactly.
test('the grass program re-keys to the couch fade on request and back to the accepted key', () => {
  let panes = 1;
  const view = createEnvironmentVegetation(fixture(), undefined, () => vegetationDetailFor('high', panes, false));
  const baseline = createEnvironmentVegetation(fixture());
  try {
    const material = meshList(view.group)[0].material as THREE.MeshStandardMaterial;
    const accepted = meshList(baseline.group)[0].material as THREE.MeshStandardMaterial;
    assert.deepEqual(material.defines, accepted.defines);
    panes = 2; view.syncDetail(); assert.deepEqual(material.defines, accepted.defines, 'two panes keep the solo program');
    const version = material.version;
    panes = 4; view.syncDetail();
    assert.ok(material.version > version, 'the couch fade asks three for its program now');
    assert.equal(material.defines!.VEGETATION_FADE_START, VEGETATION_COUCH_DETAIL.high.grassFadeStartMetres.toFixed(1));
    assert.equal(material.defines!.VEGETATION_FADE_END, VEGETATION_COUCH_DETAIL.high.grassFadeEndMetres.toFixed(1));
    panes = 1; view.syncDetail();
    assert.deepEqual(material.defines, accepted.defines);
    view.dispose(); view.syncDetail();
  } finally { view.dispose(); baseline.dispose(); }
});
