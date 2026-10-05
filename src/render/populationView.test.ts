/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Focused population view geometry, grounding and lifecycle contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { ActorKind, ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import { createPopulationView, type PopulationRenderPose, type PopulationRenderSnapshot } from './populationView.ts';
import { physicalPopulationHull } from '../shared/populationHull.ts';
import { populationSupportTargets, POPULATION_MODEL } from '../shared/populationSupport.ts';
import { staticCasterBounds } from './ultra/ultraFarShadow.ts';
import { WHEEL, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { collectLostContextHoldings } from './contextLoss.ts';

function spec(kind: ActorKind, id: string = kind, appearanceIndex = 0): ActorSpec {
  const vehicle = kind.endsWith('Vehicle');
  return { id, kind, pathId: 'path', initialDistanceMetres: 0, direction: 1,
    movement: kind === 'social' || kind === 'parkedVehicle' ? 'stationary' : 'loop',
    speedMetresPerSecond: kind === 'jogger' ? 2.6 : vehicle ? 3 : 1.1,
    idleSeconds: 3, appearanceIndex,
    hull: { halfWidthMetres: vehicle ? 1.02 : kind === 'fictionalEuc' ? 0.65 : 0.42,
      halfLengthMetres: vehicle ? 2.4 : kind === 'fictionalEuc' ? 0.65 : 0.42,
      heightMetres: vehicle ? 2.8 : 1.9 } };
}
function plan(actors: ActorSpec[]): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'fixture', installedWorldId: 'fixture~living-r1',
    contentDigest: 'fixture', paths: [], anchors: [], actors,
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function pose(actor: ActorSpec, extra: Partial<PopulationRenderPose> = {}): PopulationRenderPose {
  const value: PopulationRenderPose = { id: actor.id, kind: actor.kind, x: 0, y: 0, z: 0, headingY: 0,
    speedMetresPerSecond: actor.speedMetresPerSecond, gaitDistanceMetres: 0, wheelTravelMetres: 0,
    activity: actor.kind === 'social' ? 'social' : actor.kind === 'worker' ? 'working'
      : actor.kind === 'jogger' ? 'jogging' : actor.kind === 'fictionalEuc' ? 'riding'
        : actor.kind === 'walker' ? 'walking' : 'driving',
    activityPhase: 0.25, activityBlend: 1, backing: false,
    groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0, ...extra };
  const targets = populationSupportTargets({ ...actor, ...value,
    groundNormalX: value.groundNormalX!, groundNormalY: value.groundNormalY!, groundNormalZ: value.groundNormalZ! });
  const support = (target: { x: number; y: number; z: number; contact: string }) => ({
    x: target.x, y: target.contact === 'pedal' ? target.y : value.y
      - (value.groundNormalX! * (target.x - value.x) + value.groundNormalZ! * (target.z - value.z)) / value.groundNormalY!,
    z: target.z, normalX: value.groundNormalX!, normalY: value.groundNormalY!, normalZ: value.groundNormalZ!,
  });
  return { ...value,
    ...(targets.feet ? { footSupports: [support(targets.feet[0]), support(targets.feet[1])] as const } : {}),
    ...(targets.tyres ? { tyreSupports: targets.tyres.map(support) as unknown as NonNullable<PopulationRenderPose['tyreSupports']> } : {}),
    ...extra };
}
function snapshot(actors: PopulationRenderPose[], tick = 0): PopulationRenderSnapshot {
  return { tick, clockSeconds: tick / 120, actors };
}
function matrices(group: THREE.Group): number[][] {
  return group.children.map(object => Array.from((object as THREE.InstancedMesh).instanceMatrix.array));
}
function meshBounds(group: THREE.Group): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  group.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const vertices = object.geometry.getAttribute('position');
    for (let instance = 0; instance < object.count; instance += 1) {
      object.getMatrixAt(instance, matrix);
      for (let index = 0; index < vertices.count; index += 1) {
        point.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
        assert.ok([point.x, point.y, point.z].every(Number.isFinite), object.name);
        box.expandByPoint(point);
      }
    }
  });
  return box;
}

test('same species share geometry/material batches as the population grows', () => {
  const one = createPopulationView(plan([spec('walker')]));
  const many = createPopulationView(plan(Array.from({ length: 20 }, (_, i) => spec('walker', `walker-${i}`, i))));
  try {
    const a = one.report(), b = many.report();
    assert.equal(b.drawCalls, a.drawCalls);
    assert.equal(b.shadowDrawCalls, a.shadowDrawCalls);
    assert.equal(b.geometryOwners, a.geometryOwners);
    assert.equal(b.geometryBytes, a.geometryBytes);
    assert.equal(b.materialOwners, a.materialOwners);
    assert.equal(b.colourTriangles, a.colourTriangles * 20);
    assert.equal(a.textureBytes, 0);
    assert.equal(b.textureBytes, 0);
  } finally { one.dispose(); many.dispose(); }
});

test('flat vehicle exterior exactly fits its original width, length and height', () => {
  for (const kind of ['parkedVehicle', 'serviceVehicle', 'trafficVehicle'] as const) {
    const actor = spec(kind);
    const view = createPopulationView(plan([actor]));
    try {
      view.apply(snapshot([pose(actor)]));
      const bounds = meshBounds(view.group);
      const h = actor.hull;
      assert.ok(bounds.min.x >= -h.halfWidthMetres - 1e-5 && bounds.max.x <= h.halfWidthMetres + 1e-5);
      assert.ok(bounds.min.z >= -h.halfLengthMetres - 1e-5 && bounds.max.z <= h.halfLengthMetres + 1e-5);
      assert.ok(bounds.min.y >= -1e-5 && bounds.max.y <= h.heightMetres + 1e-5);
      assert.ok(Math.abs(bounds.min.y) < 1e-5, 'tyres touch ground');
      assert.ok(Math.abs(bounds.max.y - h.heightMetres) < 1e-5, 'roof reaches the authored height');
      assert.ok(Math.abs(bounds.max.x - h.halfWidthMetres) < 1e-5, 'mirrors reach the authored width');
      assert.ok(Math.abs(bounds.max.z - h.halfLengthMetres) < 1e-5, 'bumper reaches the authored length');
    } finally { view.dispose(); }
  }
});

test('closed candidate shape families have opposing welded edge twins', () => {
  const actors = [spec('walker'), spec('worker'), spec('trafficVehicle')];
  const view = createPopulationView(plan(actors));
  try {
    for (const object of view.group.children) {
      const mesh = object as THREE.InstancedMesh;
      const geometry = mesh.geometry, points = geometry.getAttribute('position');
      const ids: string[] = Array.from({ length: points.count }, (_, i) =>
        [points.getX(i), points.getY(i), points.getZ(i)].map(value => Math.round(value * 1e7)).join(','));
      const indices = geometry.index ? Array.from(geometry.index.array) : ids.map((_, i) => i);
      const edges = new Map<string, number>();
      let volume = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [ids[indices[i]!]!, ids[indices[i + 1]!]!, ids[indices[i + 2]!]!];
        if (new Set(triangle).size < 3) continue; // sphere pole coincidence after welding
        const a = new THREE.Vector3().fromBufferAttribute(points, indices[i]!);
        const b = new THREE.Vector3().fromBufferAttribute(points, indices[i + 1]!);
        const c = new THREE.Vector3().fromBufferAttribute(points, indices[i + 2]!);
        volume += a.dot(b.cross(c)) / 6;
        for (let edge = 0; edge < 3; edge += 1) {
          const a = triangle[edge]!, b = triangle[(edge + 1) % 3]!;
          const key = `${a}>${b}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      for (const [key, count] of edges) {
        const [a, b] = key.split('>');
        assert.equal(count, 1, `${mesh.name} duplicated directed edge`);
        assert.equal(edges.get(`${b}>${a}`), 1, `${mesh.name} open / inward edge`);
      }
      assert.ok(volume > 0, `${mesh.name} shell is inside out`);
    }
  } finally { view.dispose(); }
});

test('all grade-aligned vehicle vertices are inside the matching physical slope prism', () => {
  const actor = spec('trafficVehicle');
  const view = createPopulationView(plan([actor]));
  const normal = new THREE.Vector3(-0.07, 1, 0.08).normalize();
  const sample = pose(actor, { x: 17, y: 2, z: -23, headingY: 0.8,
    groundNormalX: normal.x, groundNormalY: normal.y, groundNormalZ: normal.z });
  const physical = physicalPopulationHull(sample.x, sample.y, sample.z, sample.headingY,
    normal.x, normal.y, normal.z, actor.hull);
  const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  try {
    view.apply(snapshot([sample]));
    view.group.children.forEach(object => {
      const mesh = object as THREE.InstancedMesh;
      const vertices = mesh.geometry.getAttribute('position');
      for (let instance = 0; instance < mesh.count; instance += 1) {
        mesh.getMatrixAt(instance, matrix);
        let supportDistance = Infinity;
        for (let index = 0; index < vertices.count; index += 1) {
          vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
          const dx = vertex.x - physical.x, dz = vertex.z - physical.z;
          const localX = Math.cos(sample.headingY) * dx - Math.sin(sample.headingY) * dz;
          const localZ = Math.sin(sample.headingY) * dx + Math.cos(sample.headingY) * dz;
          assert.ok(Math.abs(localX) <= physical.halfWidthMetres + 2e-5, `${mesh.name} width`);
          assert.ok(Math.abs(localZ) <= physical.halfLengthMetres + 2e-5, `${mesh.name} length`);
          assert.ok(vertex.y >= physical.minY - 2e-5 && vertex.y <= physical.maxY + 2e-5, `${mesh.name} height`);
          supportDistance = Math.min(supportDistance, normal.x * (vertex.x - sample.x)
            + normal.y * (vertex.y - sample.y) + normal.z * (vertex.z - sample.z));
        }
        if (mesh.name === 'vehicle-tyre-rubber') assert.ok(Math.abs(supportDistance) < 2e-5, 'tyre touches sampled tangent plane');
      }
    });
  } finally { view.dispose(); }
});

test('gait interpolation is deterministic and no extra apply advances motion', () => {
  const actors = [spec('walker'), spec('jogger'), spec('fictionalEuc'), spec('serviceVehicle')];
  const view = createPopulationView(plan(actors));
  const previous = snapshot(actors.map(actor => pose(actor, { headingY: Math.PI - 0.01, gaitDistanceMetres: 0.47 })), 20);
  const current = snapshot(actors.map(actor => pose(actor, { x: 0.01, headingY: -Math.PI + 0.01,
    gaitDistanceMetres: 0.48, wheelTravelMetres: 0.012 })), 21);
  try {
    view.update(previous, current, 0.5);
    const first = matrices(view.group);
    const versions = view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version);
    view.update(previous, current, 0.5);
    assert.deepEqual(matrices(view.group), first);
    assert.deepEqual(view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version), versions,
      'unchanged inputs issue no second upload');
    assert.deepEqual(view.report().missingPoseIds, []);
    assert.deepEqual(view.report().missingGroundNormalIds, []);
    assert.deepEqual(view.report().missingWheelTravelIds, []);
    meshBounds(view.group);
  } finally { view.dispose(); }
});

test('cached interpolation matches forced posing across changing presentation channels and mutable supports', () => {
  const actors = ['walker', 'jogger', 'worker', 'social', 'fictionalEuc', 'serviceVehicle', 'parkedVehicle']
    .map(kind => spec(kind as ActorKind));
  const view = createPopulationView(plan(actors)), forced = createPopulationView(plan(actors));
  const previous = snapshot(actors.map(actor => pose(actor, { activityPhase: 0.95 })), 10);
  const cases: Partial<PopulationRenderPose>[] = [
    {}, { x: 0.25 }, { y: 0.12 }, { z: -0.35 }, { headingY: Math.PI - 0.02 },
    { speedMetresPerSecond: -0.7, backing: true }, { gaitDistanceMetres: 0.34 }, { wheelTravelMetres: -0.81 },
    { activityPhase: 0.05 }, { activityBlend: 0.45 }, { activity: 'working', activityPhase: 0.4 },
    { activity: 'social', activityPhase: 0.2 }, { activity: 'waiting', speedMetresPerSecond: 0 },
    { groundNormalX: 0.08, groundNormalY: 1, groundNormalZ: -0.09 },
    { posture: 'seated', sittingBlend: 0.6, seatHeightMetres: 0.55 },
    { posture: 'standing', sittingBlend: 0, seatHeightMetres: undefined },
  ];
  try {
    for (let index = 0; index < cases.length; index += 1) {
      const current = snapshot(actors.map(actor => pose(actor, cases[index])), 11 + index);
      for (const alpha of [0, 0.25, 0.5, 1]) {
        view.update(previous, current, alpha);
        forced.apply(snapshot([])); forced.update(previous, current, alpha);
        assert.deepEqual(matrices(view.group), matrices(forced.group), `case ${index}, alpha ${alpha}`);
      }
    }
    const current = snapshot(actors.map(actor => pose(actor)), 40);
    view.update(previous, current, 0.5);
    const before = matrices(view.group);
    for (const currentPose of current.actors) {
      const support = currentPose.tyreSupports?.[0] ?? currentPose.footSupports?.[0];
      if (support) (support as { y: number }).y += 0.035;
    }
    view.update(previous, current, 0.5);
    forced.apply(snapshot([])); forced.update(previous, current, 0.5);
    assert.notDeepEqual(matrices(view.group), before, 'same outer records must still detect changed support values');
    assert.deepEqual(matrices(view.group), matrices(forced.group));
  } finally { view.dispose(); forced.dispose(); }
});

test('stationary vehicle batches stay clean while a neighbouring social actor continues its activity', () => {
  const human = spec('social'), vehicle = spec('parkedVehicle'), view = createPopulationView(plan([human, vehicle]));
  try {
    view.apply(snapshot([pose(human), pose(vehicle)], 1));
    const versions = new Map(view.group.children.map(object => [object.name, (object as THREE.InstancedMesh).instanceMatrix.version]));
    const before = matrices(view.group);
    view.apply(snapshot([pose(human, { activityPhase: 0.6 }), pose(vehicle)], 2));
    assert.notDeepEqual(matrices(view.group), before, 'social gestures remain active');
    for (const object of view.group.children) if (object.name.startsWith('vehicle-')) {
      assert.equal((object as THREE.InstancedMesh).instanceMatrix.version, versions.get(object.name), object.name);
    }
    assert.equal(view.report().clockSeconds, 2 / 120);
  } finally { view.dispose(); }
});

test('repeated missing support stays hidden without uploads and valid reappearance restores the exact pose', () => {
  const actor = spec('walker'), view = createPopulationView(plan([actor]));
  const valid = snapshot([pose(actor)]), missing = snapshot([pose(actor, { footSupports: undefined })]);
  try {
    view.apply(valid); const visible = matrices(view.group);
    view.apply(missing); const hidden = matrices(view.group);
    const versions = view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version);
    assert.notDeepEqual(hidden, visible); assert.deepEqual(view.report().missingSurfaceSupportIds, [actor.id]);
    view.apply(missing);
    assert.deepEqual(matrices(view.group), hidden);
    assert.deepEqual(view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version), versions);
    view.apply(valid); assert.deepEqual(matrices(view.group), visible);
    assert.deepEqual(view.report().missingSurfaceSupportIds, []);
  } finally { view.dispose(); }
});

test('both walker stance soles cancel the real forward travel without skating', () => {
  const actor = spec('walker');
  const view = createPopulationView(plan([actor]));
  const first = new THREE.Matrix4(), second = new THREE.Matrix4();
  try {
    const mesh = view.group.children.find(object => object.name === 'human-sole-rubber') as THREE.InstancedMesh;
    view.apply(snapshot([pose(actor, { z: 0, gaitDistanceMetres: 0 })]));
    const initial = Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, first); return first.clone();
    });
    view.apply(snapshot([pose(actor, { z: 0.01, gaitDistanceMetres: 0.01 })], 1));
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, second);
      assert.ok(Math.abs(second.elements[12]! - initial[i]!.elements[12]!) < 1e-6);
      assert.ok(Math.abs(second.elements[13]! - initial[i]!.elements[13]!) < 1e-6);
      assert.ok(Math.abs(second.elements[14]! - initial[i]!.elements[14]!) < 1e-6);
    }
  } finally { view.dispose(); }
});

test('shared targets agree with rendered sole origins and actual tyre supports', () => {
  const actor = spec('jogger'), vehicle = spec('serviceVehicle');
  const view = createPopulationView(plan([actor, vehicle]));
  try {
    const footPose = pose(actor, { x: 7, y: 1, z: -5, headingY: 0.7, gaitDistanceMetres: 0.81 });
    const tyrePose = pose(vehicle, { x: -12, y: 2, z: 9, headingY: -0.4 });
    // Deliberate independent finished-ground height changes, not a centre plane.
    const feet = footPose.footSupports!.map((support, i) => ({ ...support, y: support.y + (i ? 0.03 : -0.02) })) as unknown as NonNullable<PopulationRenderPose['footSupports']>;
    const tyres = tyrePose.tyreSupports!.map((support, i) => ({ ...support, y: support.y + [0.03, -0.02, 0.02, 0.04][i]! })) as unknown as NonNullable<PopulationRenderPose['tyreSupports']>;
    view.apply(snapshot([{ ...footPose, footSupports: feet }, { ...tyrePose, tyreSupports: tyres }]));
    const targets = populationSupportTargets({ ...actor, ...footPose,
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0 });
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const soles = view.group.children.find(object => object.name === 'human-sole-rubber') as THREE.InstancedMesh;
    for (let i = 0; i < 2; i += 1) {
      soles.getMatrixAt(i, matrix); point.set(0, 0, 0).applyMatrix4(matrix);
      assert.ok(point.distanceTo(new THREE.Vector3(feet[i]!.x, feet[i]!.y + targets.feet![i]!.liftMetres, feet[i]!.z)) < 2e-6);
    }
    const wheels = view.group.children.find(object => object.name === 'vehicle-tyre-rubber') as THREE.InstancedMesh;
    // Factory slots are left-front, left-rear, right-front, right-rear too.
    const radius = populationSupportTargets({ ...vehicle, ...tyrePose,
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0 }).tyres![0].radiusMetres;
    for (let i = 0; i < 4; i += 1) {
      wheels.getMatrixAt(i, matrix); point.set(0, 0, 0).applyMatrix4(matrix);
      assert.ok(Math.abs(point.x - tyres[i]!.x) < 2e-6);
      assert.ok(Math.abs(point.y - radius - tyres[i]!.y) < 2e-6);
      assert.ok(Math.abs(point.z - tyres[i]!.z) < 2e-6);
    }
    assert.deepEqual(view.report().missingSurfaceSupportIds, []);
  } finally { view.dispose(); }
});

test('upright human anatomy stays inside its authored hull across gait/activity/seat phases', () => {
  for (const kind of ['walker', 'jogger', 'worker', 'social', 'fictionalEuc'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      for (let step = 0; step <= 32; step += 1) {
        const sample = pose(actor, { gaitDistanceMetres: step / 32 * 1.5, wheelTravelMetres: step / 32 * 1.5,
          activityPhase: step / 32,
          ...(kind === 'social' && step > 16 ? { posture: 'seated' as const, sittingBlend: 1, seatHeightMetres: 0.48 } : {}) });
        view.apply(snapshot([sample]));
        const bounds = meshBounds(view.group), hull = actor.hull;
        assert.ok(bounds.min.x >= -hull.halfWidthMetres - 2e-5 && bounds.max.x <= hull.halfWidthMetres + 2e-5, `${kind} width @ ${step}`);
        assert.ok(bounds.min.z >= -hull.halfLengthMetres - 2e-5 && bounds.max.z <= hull.halfLengthMetres + 2e-5, `${kind} length @ ${step}`);
        assert.ok(bounds.min.y >= -2e-5 && bounds.max.y <= hull.heightMetres + 2e-5, `${kind} height @ ${step}`);
      }
    } finally { view.dispose(); }
  }
});

test('seated social pose uses an explicit cushion and has connected bent legs', () => {
  const actor = spec('social'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([pose(actor)]));
    const standing = meshBounds(view.group).max.y;
    view.apply(snapshot([pose(actor, { posture: 'seated', sittingBlend: 1, seatHeightMetres: 0.48 })]));
    assert.ok(meshBounds(view.group).max.y < standing - 0.25);
    const pelvis = view.group.children.find(object => object.name === 'human-pelvis-cloth') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); pelvis.getMatrixAt(0, matrix);
    assert.ok(Math.abs(matrix.elements[13]! - 0.48) < 2e-6, 'pelvis bottom meets authored cushion');
    // A posture flag alone never invents a seat height.
    view.apply(snapshot([pose(actor, { posture: 'seated', sittingBlend: 1 })]));
    assert.ok(Math.abs(meshBounds(view.group).max.y - standing) < 2e-6);
  } finally { view.dispose(); }
});

test('dynamic population never enters the static far shadow caster list', () => {
  const actor = spec('trafficVehicle'), view = createPopulationView(plan([actor]));
  const scene = new THREE.Scene(); scene.add(view.group);
  try {
    view.apply(snapshot([pose(actor)])); scene.updateMatrixWorld(true);
    assert.deepEqual(staticCasterBounds(scene), []);
    // Negative control: the caster list observes a wrongly tagged actor.
    const caster = view.group.children.find(object => (object as THREE.InstancedMesh).castShadow)!;
    caster.layers.enable(5);
    assert.ok(staticCasterBounds(scene).length > 0);
  } finally { view.dispose(); }
});

test('missing exact support channels hide an actor and report incomplete caller wiring', () => {
  const actor = spec('walker'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([{ ...pose(actor), footSupports: undefined }]));
    assert.deepEqual(view.report().missingSurfaceSupportIds, [actor.id]);
    assert.ok(matrices(view.group).every(values => values.every(value => value === 0 || value === 1)));
  } finally { view.dispose(); }
});

test('shared pedal dimensions retain the actual standard machine model', () => {
  assert.equal(POPULATION_MODEL.pedalHeight, WHEEL.pedalHeight);
  assert.equal(POPULATION_MODEL.pedalHalfStance, RIDER_BLOCKOUT.stanceHalfWidth);
});

test('existing context-loss walk owns every population buffer and material', () => {
  const actors = [spec('walker'), spec('worker'), spec('fictionalEuc'), spec('serviceVehicle')];
  const view = createPopulationView(plan(actors));
  try {
    view.apply(snapshot(actors.map(actor => pose(actor))));
    const before = matrices(view.group), report = view.report();
    const holdings = collectLostContextHoldings([view.group], [], null);
    assert.equal(holdings.geometries.size, report.geometryOwners);
    assert.equal(holdings.materials.size, report.materialOwners);
    assert.equal(holdings.instanced.size, report.batches);
    assert.equal(holdings.textures.size, 0);
    assert.deepEqual(matrices(view.group), before, 'resource inventory does not advance poses');
  } finally { view.dispose(); }
});

test('missing poses hide their geometry; disposing is complete and idempotent', () => {
  const actor = spec('fictionalEuc');
  const view = createPopulationView(plan([actor]));
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  view.group.children.forEach(object => {
    const mesh = object as THREE.InstancedMesh;
    geometries.add(mesh.geometry);
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
  });
  let freedGeometry = 0, freedMaterials = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => freedGeometry += 1));
  materials.forEach(material => material.addEventListener('dispose', () => freedMaterials += 1));
  view.apply(snapshot([pose(actor)]));
  view.apply(snapshot([]));
  assert.deepEqual(view.report().missingPoseIds, [actor.id]);
  view.dispose(); view.dispose();
  assert.equal(freedGeometry, geometries.size);
  assert.equal(freedMaterials, materials.size);
  assert.equal(view.group.children.length, 0);
  assert.equal(view.report().drawCalls, 0);
  assert.equal(view.report().geometryOwners, 0);
  assert.equal(view.report().materialOwners, 0);
});

test('an empty world owns no geometry, materials, instances, textures or draws', () => {
  const view = createPopulationView(plan([]));
  try {
    view.apply(snapshot([]));
    const report = view.report();
    for (const key of ['drawCalls', 'shadowDrawCalls', 'colourTriangles', 'geometryBytes', 'instanceBytes',
      'textureBytes', 'geometryOwners', 'materialOwners'] as const) assert.equal(report[key], 0);
    assert.equal(view.group.visible, false);
  } finally { view.dispose(); }
});


test('pedestrian elbows bend behind the shoulder-wrist chord through real walking and activity poses', () => {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const endpoint = (mesh: THREE.InstancedMesh, index: number, y: number): THREE.Vector3 => {
    mesh.getMatrixAt(index, matrix); return point.set(0, y, 0).applyMatrix4(matrix).clone();
  };
  const rearward = (shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3,
    forward: THREE.Vector3): number => {
    const chord = wrist.clone().sub(shoulder);
    const along = elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq();
    return elbow.clone().sub(shoulder).addScaledVector(chord, -along).dot(forward);
  };
  let inspected = 0;
  for (const kind of ['walker', 'jogger', 'social', 'worker', 'fictionalEuc'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      const upper = view.group.getObjectByName('human-upperArm-cloth') as THREE.InstancedMesh;
      const forearm = view.group.getObjectByName('human-forearm-skin') as THREE.InstancedMesh;
      assert.ok(upper && forearm); assert.equal(upper.count, 2); assert.equal(forearm.count, 2);
      for (const heading of [0, Math.PI / 2, -2.1]) for (let phase = 0; phase < 16; phase++) {
        const value = pose(actor, {headingY: heading, gaitDistanceMetres: phase * 0.077,
          activityPhase: phase / 16, ...(kind === 'social' ? { posture: 'seated' as const,
            sittingBlend: 1, seatHeightMetres: 0.47 } : {})});
        view.apply(snapshot([value], phase));
        const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
        for (let side = 0; side < 2; side++) {
          const shoulder = endpoint(upper, side, 0), elbow = endpoint(upper, side, 1);
          const forearmRoot = endpoint(forearm, side, 0), wrist = endpoint(forearm, side, 1);
          assert.ok(elbow.distanceTo(forearmRoot) < 2e-6, 'actual submitted bones share one elbow');
          const projection = rearward(shoulder, elbow, wrist, forward);
          assert.ok(projection < -0.01, `${kind}/${heading}/${phase}/${side}: elbow bends backward (${projection})`);
          const chord = wrist.clone().sub(shoulder), t = elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq();
          const onChord = shoulder.clone().addScaledVector(chord, t);
          const inverted = onChord.clone().multiplyScalar(2).sub(elbow);
          assert.ok(rearward(shoulder, inverted, wrist, forward) > 0.01,
            'known-bad forward elbow fails the same anatomical predicate');
          inspected++;
        }
      }
    } finally { view.dispose(); }
  }
  assert.equal(inspected, 480);
});

test('a bumped person flinches: a brief lean back with the hands up, inside their hull, gone before the pause ends (VIS-CRASH-1)', () => {
  const matrix = new THREE.Matrix4();
  for (const kind of ['walker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
      const forearm = view.group.getObjectByName('human-forearm-skin') as THREE.InstancedMesh;
      let tick = 0;
      const read = (phase: number) => {
        view.apply(snapshot([pose(actor, { activity: 'impacted', activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
        const bounds = meshBounds(view.group), hull = actor.hull;
        assert.ok(bounds.min.z >= -hull.halfLengthMetres - 2e-5 && bounds.max.z <= hull.halfLengthMetres + 2e-5, `${kind} @ ${phase}: inside its hull`);
        assert.ok(bounds.min.x >= -hull.halfWidthMetres - 2e-5 && bounds.max.x <= hull.halfWidthMetres + 2e-5 && bounds.max.y <= hull.heightMetres + 2e-5);
        head.getMatrixAt(0, matrix); const headZ = matrix.elements[14]!;
        const wristY = [0, 1].map(side => { forearm.getMatrixAt(side, matrix); return new THREE.Vector3(0, 1, 0).applyMatrix4(matrix).y; });
        return { headZ, wristY: (wristY[0]! + wristY[1]!) / 2 };
      };
      const calm = read(0.9), flinch = read(0.15);
      assert.ok(flinch.headZ < calm.headZ - 0.05, `${kind}: leans back (${(calm.headZ - flinch.headZ).toFixed(3)} m)`);
      assert.ok(flinch.wristY > calm.wristY + 0.15, `${kind}: hands come up (${(flinch.wristY - calm.wristY).toFixed(3)} m)`);
      for (let phase = 0; phase <= 1; phase += 1 / 16) read(phase);
      assert.deepEqual(read(0.75), calm, `${kind}: the flinch is over well before the impact pause ends`);
    } finally { view.dispose(); }
  }
});
