/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { STREET_LIFE } from '../data/streetLife.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { selectPresentation } from './presentation.ts';
import { createStreetLife, streetFronts, withStreetLifeCost } from './streetLife.ts';
import { paintStreetShops } from './streetShopPaint.ts';
import { inStreetFacadeOpening, installStreetFacadeOpenings } from './streetFacadeOpenings.ts';

const plan = generateLevel({ seed: 'euc' }).plan;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * 2026-10-04: two documented, additive plan changes came after the capture:
 * `populationPaths` (outdoor population, CHANGELOG 2026-10-01) and twelve
 * road-purpose centre/edge lines (CHANGELOG 2026-10-02 "Road paint follows
 * accepted wide-road purpose"). The capture is compared on the plan with
 * exactly those removed; every archived original line must survive
 * byte-exact and in order (the euc fingerprints `ordinaryParity.test.ts` uses).
 */
function capturedFields(current: LevelPlan): LevelPlan {
  const archive = JSON.parse(readFileSync(new URL('./ordinaryParityInputs.test-fixture.json', import.meta.url), 'utf8')) as {
    archive: string; fixtures: Record<string, { originalMarkings: string[] }> };
  assert.equal(archive.archive, 'pre-ultra-source-2026-09-22.tgz');
  const originals = new Set(archive.fixtures.euc.originalMarkings);
  assert.equal(originals.size, archive.fixtures.euc.originalMarkings.length, 'archived lines are unique');
  const kept = (current.markings ?? []).filter((mark) => originals.has(hash(mark)));
  const added = (current.markings ?? []).filter((mark) => !originals.has(hash(mark)));
  assert.equal(kept.length, originals.size, 'an original line changed or disappeared; added paint cannot conceal it');
  assert.equal(added.length, 12, 'only the recorded road-purpose additions leave the capture');
  assert.ok(added.every((mark) => mark.paint === 'road'), 'an added line is not road paint');
  const captured: LevelPlan = { ...current, markings: kept };
  delete captured.populationPaths;
  return captured;
}

test('the first slice decorates the existing default world without changing a single plan field', () => {
  // Captured before implementation. A changed road, solid, hazard or referee
  // input fails, even if the new graphics happen to look in the same place.
  assert.equal(hash(capturedFields(plan)), 'feea8db4a40f262b6d56be1774feaa079575aae3af25a163499d2a854d0728c8');
  const before = hash(plan);
  const life = createStreetLife(plan);
  for (let seconds = 0; seconds <= 18; seconds += 0.5) life.update(seconds, false);
  assert.equal(hash(plan), before);
  assert.notEqual(hash({ ...plan, solids: [] }), before, 'the identity check must detect a missing solid');
  assert.equal(life.fronts.length, 3);
  assert.equal(life.report().planters, 1);
  assert.deepEqual(life.fronts.map((front) => front.shop), ['COFFEE', 'GROCER', 'REPAIR']);
  life.dispose();
  for (const other of [createSliceLevel(), { ...plan, props: plan.props!.filter(p => p.look !== 'commercial') }]) {
    const empty = createStreetLife(other);
    assert.equal(empty.group.children.length, 0);
    assert.equal(empty.report().drawCalls, 0);
    assert.equal(empty.report().planters, 0);
    assert.equal(empty.report().textureBytes, 0);
    empty.dispose();
  }
});

test('interiors stay inside original solid footprints, projecting details clear riders', () => {
  const life = createStreetLife(plan);
  const inverse = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const frontMatrix = new THREE.Matrix4();
  let checked = 0;
  // Match each vertex to the nearest shop's local frame. Static details are
  // already in world coordinates; the instance matrix supplies moving parts.
  for (let seconds = 0; seconds <= 9; seconds += 0.5) {
    life.update(seconds, false);
    life.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      const count = object instanceof THREE.InstancedMesh ? object.count : 1;
      for (let instance = 0; instance < count; instance += 1) {
        matrix.identity();
        if (object instanceof THREE.InstancedMesh) object.getMatrixAt(instance, matrix);
        for (let i = 0; i < positions.count; i += 1) {
          point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
          const world = point.clone();
          const front = life.fronts.reduce((nearest, candidate) =>
            Math.hypot(candidate.position.x - world.x, candidate.position.z - world.z)
              < Math.hypot(nearest.position.x - world.x, nearest.position.z - world.z) ? candidate : nearest);
          frontMatrix.makeRotationY(front.yaw).setPosition(front.position.x, front.position.y, front.position.z);
          inverse.copy(frontMatrix).invert();
          point.applyMatrix4(inverse);
          const canopy = point.z > STREET_LIFE.facadeSkin + 0.001;
          assert.ok(point.z >= -STREET_LIFE.recessDepth - 0.01, `${object.name} exits the back of its room`);
          assert.ok(point.z <= STREET_LIFE.bladeProjection + 0.001);
          if (point.z > STREET_LIFE.canopyProjection + 0.001) {
            assert.ok(point.y >= STREET_LIFE.bladeBottom - 0.001, 'tenant blade projects below its elevated envelope');
          }
          if (canopy) assert.ok(point.y >= STREET_LIFE.canopyBottom - 0.001, 'low decoration projects into the street');
          const frontageWidth = front.faceWidth;
          assert.ok(Math.abs(point.x) <= frontageWidth / 2 + 0.001, 'decoration extends past the original solid facade');
          checked += 1;
        }
      }
    });
  }
  assert.ok(checked > 10_000, 'empty geometry cannot prove a clearance');
  life.dispose();
});

test('one clock poses one bounded population, reduced motion holds the resting pose', () => {
  const life = createStreetLife(plan);
  const bodies = life.group.getObjectByName('street-life-indoor-bodies') as THREE.InstancedMesh;
  const initial = [...bodies.instanceMatrix.array];
  life.update(2, false);
  assert.notDeepEqual([...bodies.instanceMatrix.array], initial);
  const current = [...bodies.instanceMatrix.array];
  life.update(2, false);
  assert.deepEqual([...bodies.instanceMatrix.array], current, 'drawing another pane must not advance activity');
  life.update(0, true);
  const resting = [...bodies.instanceMatrix.array];
  assert.notDeepEqual(resting, initial, 'same-time reduced toggle centers the worker instead of leaving its endpoint pose');
  life.update(20, true);
  assert.deepEqual([...bodies.instanceMatrix.array], resting);
  assert.equal(life.report().clockSeconds, 0);
  assert.equal(life.report().people, 6);
  life.dispose();
});

test('measured cost includes every mesh and instance, every pane, and zero new shadow passes', () => {
  const life = createStreetLife(plan);
  let triangles = 0;
  let calls = 0;
  life.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    calls += 1;
    triangles += object.geometry.index!.count / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
    assert.equal(object.castShadow, false);
    const material = object.material as THREE.MeshStandardMaterial;
    if (object.name === 'street-life-glass') {
      assert.equal(material.transparent, true);
      assert.equal(material.depthWrite, false);
      assert.ok(material.opacity <= 0.2);
    } else assert.equal(material.transparent, false);
  });
  assert.equal(calls, 8);
  const report = life.report();
  assert.equal(report.colourTriangles, triangles);
  assert.equal(report.drawCalls, calls);
  const base = selectPresentation(plan).cost;
  const actual = withStreetLifeCost(base, report);
  for (const [frame, views] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
    assert.equal(actual.frame[frame].drawCalls - base.frame[frame].drawCalls, calls * views);
    assert.equal(actual.frame[frame].triangles - base.frame[frame].triangles, triangles * views);
  }
  assert.equal(actual.shadowTriangles, base.shadowTriangles);
  assert.equal(report.textureBytes, 4 * 1024 * 1024);
  life.dispose();
});

test('the opaque atlas is deterministic and its three shops have different displays', () => {
  const a = paintStreetShops();
  const b = paintStreetShops();
  assert.deepEqual(a, b);
  assert.equal(a.length, 1024 * 768 * 4);
  for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255);
  const row = 1024 * 256 * 4;
  assert.notDeepEqual(a.subarray(0, row), a.subarray(row, row * 2));
  assert.notDeepEqual(a.subarray(row, row * 2), a.subarray(row * 2));
});

test('repeated teardown frees every unique GPU owner exactly once', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 4; generation += 1) {
    const life = createStreetLife(plan);
    scene.add(life.group);
    const owners = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh>();
    life.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      owners.add(object.geometry);
      const material = object.material as THREE.MeshStandardMaterial;
      owners.add(material);
      if (material.map) owners.add(material.map);
      if (object instanceof THREE.InstancedMesh) owners.add(object);
    });
    const counts = new Map<object, number>();
    for (const owner of owners) {
      counts.set(owner, 0);
      const listener = () => { counts.set(owner, counts.get(owner)! + 1); };
      if (owner instanceof THREE.InstancedMesh) owner.addEventListener('dispose', listener);
      else if (owner instanceof THREE.BufferGeometry) owner.addEventListener('dispose', listener);
      else if (owner instanceof THREE.Texture) owner.addEventListener('dispose', listener);
      else owner.addEventListener('dispose', listener);
    }
    life.dispose();
    life.dispose();
    life.update(15, false);
    assert.equal(scene.children.length, 0);
    for (const count of counts.values()) assert.equal(count, 1);
  }
  assert.equal(streetFronts({ ...plan, props: [] }).length, 0);
});


test('generated courses get only sparse commercial fronts facing a real street, without plan writes', () => {
  for (const seed of ['euc', 'sweep-15', 'corner', 'city', 'rider', 'alpha', 'night', 'seed-8']) {
    const generated = generateLevel({ seed }).plan;
    const before = hash(generated);
    const fronts = streetFronts(generated);
    assert.ok(fronts.length <= STREET_LIFE.storefronts);
    assert.ok(fronts.length > 0, `${seed}: positive fixture must contain a usable frontage`);
    assert.deepEqual(fronts, streetFronts(generated), 'selection is deterministic');
    for (const [index, front] of fronts.entries()) {
      assert.equal(front.building.look, 'commercial');
      const dx = front.street.x - front.position.x, dz = front.street.z - front.position.z;
      assert.ok((dx * Math.sin(front.yaw) + dz * Math.cos(front.yaw)) / Math.hypot(dx, dz) > 0.90);
      for (const other of fronts.slice(index + 1)) assert.ok(Math.hypot(front.position.x - other.position.x,
        front.position.z - other.position.z) >= STREET_LIFE.minimumSpacing);
    }
    assert.equal(hash(generated), before);
    assert.equal(streetFronts({ ...generated, props: generated.props!.map(p => ({ ...p,
      look: p.look === 'commercial' ? 'residential' as const : p.look })) }).length, 0,
      'wrong building type must fail selection');
    assert.equal(streetFronts({ ...generated, segments: generated.segments.map(segment => ({ ...segment,
      entry: { ...segment.entry, surface: 'grass' as const },
      exit: { ...segment.exit, surface: 'grass' as const } })) }).length, 0,
      'a trail/lawn cannot masquerade as a shop street');
  }
});

test('blocked shop approaches are refused', () => {
  const original = streetFronts(plan);
  assert.equal(streetFronts({ ...plan, solids: [] }).length, 0,
    'a visual building without its protective solid cannot host people');
  const blocked = { ...plan, props: original.map(f => f.building), solids: [...plan.solids!, ...original.map(f => ({
    centre: { x: (f.street.x + f.position.x) / 2, y: f.position.y + 2, z: (f.street.z + f.position.z) / 2 },
    halfExtents: { x: 2, y: 2, z: 2 }, rotationY: 0, surface: 'pavement' as const,
  }))] };
  assert.equal(streetFronts(blocked).length, 0, 'occupied approaches cannot be dressed as open entrances');
});

test('selected facade openings preserve shader chains and exclude unrelated walls and upper floors', () => {
  const fronts = streetFronts(plan);
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => { shader.fragmentShader += '\n// prior-patch'; };
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  for (const anchor of ['#include <common>', '#include <project_vertex>']) assert.ok(shader.vertexShader.includes(anchor));
  assert.ok(shader.fragmentShader.includes('#include <clipping_planes_fragment>'));
  installStreetFacadeOpenings(material, fronts);
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  assert.ok(shader.fragmentShader.includes('// prior-patch'));
  assert.ok(shader.fragmentShader.includes('discard;'));
  assert.ok(shader.vertexShader.includes('instanceMatrix * streetWorld'));
  assert.deepEqual(shader.fragmentShader.match(/uniform sampler\w+/g),
    THREE.ShaderLib.standard.fragmentShader.match(/uniform sampler\w+/g), 'the patch adds no sampler');
  for (const f of fronts) {
    assert.equal(inStreetFacadeOpening(f, { ...f.position, y: f.position.y + 2 }), true);
    assert.equal(inStreetFacadeOpening(f, { ...f.position, y: f.position.y + 5 }), false);
    assert.equal(inStreetFacadeOpening(f, { x: f.position.x - Math.sin(f.yaw) * 3,
      y: f.position.y + 2, z: f.position.z - Math.cos(f.yaw) * 3 }), false);
    assert.equal(inStreetFacadeOpening(f, { x: f.position.x + Math.cos(f.yaw) * (f.faceWidth + 1),
      y: f.position.y + 2, z: f.position.z - Math.sin(f.yaw) * (f.faceWidth + 1) }), false);
  }
  material.dispose();
});
