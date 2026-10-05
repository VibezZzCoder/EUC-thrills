/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import type { BoxCollider } from '../level/plan.ts';
import { createStreetLife, type StreetLife, type StreetFront } from './streetLife.ts';
import { PROTECTED_ACTIVITY } from '../data/tuning.ts';
import { ProtectedActivity, type ProtectedActivityTuning } from './protectedActivity.ts';

const CONTRACT: ProtectedActivityTuning = { travelMetres: 0.6, turnSeconds: 0.6,
  walkSeconds: 2.6, idleSeconds: 1.4, strideCyclesPerLeg: 2 };
const FLOOR = 0.062, FLOOR_EPSILON = 1e-4, CLEARANCE = 0.025, PARTS = 12;
const PERIOD = 10.4, CENTER_Z = -3.195;
const GEOMETRY_EPSILON = 2e-4; // baked world Float32 geometry, not an acceptance relaxation
const BOUNDARIES = [0, 0.6, 3.2, 3.8, 5.2, 5.8, 8.4, 9, 10.4];
interface Actor { vertices: THREE.Vector3[]; partVertices: THREE.Vector3[][]; bounds: THREE.Box3; matrices: THREE.Matrix4[] }
interface Lane { near: number; far: number; minX: number; maxX: number }
function frame(front: StreetFront): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(front.yaw).setPosition(front.position.x, front.position.y, front.position.z);
}
function bodiesOf(life: StreetLife): { bodies: THREE.InstancedMesh; heads: THREE.InstancedMesh } {
  const bodies = life.group.getObjectByName('street-life-indoor-bodies');
  const heads = life.group.getObjectByName('street-life-indoor-heads');
  assert.ok(bodies instanceof THREE.InstancedMesh && heads instanceof THREE.InstancedMesh);
  assert.equal(bodies.count, heads.count * PARTS, 'every person must actually render twelve parts, including shoes');
  assert.ok(heads.count >= 2, 'the Coffee worker cannot be the only person in the fixture');
  return { bodies, heads };
}
/** Every real geometry vertex gets mesh.matrixWorld × instanceMatrix before
 * inverse frontage. Parent transforms may not disappear from the contract. */
function actor(life: StreetLife, person: number, inverseFront: THREE.Matrix4): Actor {
  const { bodies, heads } = bodiesOf(life);
  const vertices: THREE.Vector3[] = [], partVertices: THREE.Vector3[][] = [], matrices: THREE.Matrix4[] = [];
  for (let part = 0; part <= PARTS; part++) {
    const mesh = part === PARTS ? heads : bodies, instance = part === PARTS ? person : person * PARTS + part;
    const instanceMatrix = new THREE.Matrix4(); mesh.getMatrixAt(instance, instanceMatrix);
    const matrix = new THREE.Matrix4().multiplyMatrices(inverseFront, mesh.matrixWorld).multiply(instanceMatrix);
    matrices.push(matrix);
    const source = mesh.geometry.getAttribute('position'), actual: THREE.Vector3[] = [];
    for (let vertex = 0; vertex < source.count; vertex++) {
      const point = new THREE.Vector3().fromBufferAttribute(source, vertex).applyMatrix4(matrix);
      assert.ok([point.x, point.y, point.z].every(Number.isFinite), 'non-finite actual actor geometry');
      actual.push(point); vertices.push(point);
    }
    partVertices.push(actual);
  }
  return { vertices, partVertices, matrices, bounds: new THREE.Box3().setFromPoints(vertices) };
}
function protectingHost(life: StreetLife, front: StreetFront, solids: readonly BoxCollider[]): BoxCollider {
  const host = solids.find(s => Math.hypot(s.centre.x - front.building.position.x,
    s.centre.z - front.building.position.z) < 0.001
    && Math.abs(Math.sin(s.rotationY - front.building.rotationY)) < 1e-5
    && Math.cos(s.rotationY - front.building.rotationY) > 0.99999);
  assert.ok(host, 'must test the original protecting OBB, not the rendered facade bounds');
  // This fixture is intentionally not the easy zero-yaw/parallel-axis case.
  assert.ok(Math.abs(Math.cos(front.yaw - host.rotationY)) < 1e-5,
    'euc Coffee fixture must retain the quarter-turned front relative to its source host');
  assert.equal(life.fronts[0], front, 'worker zero must belong to the actual Coffee front');
  return host;
}
/** Identify the counter/base rear surfaces from the *emitted wood vertices*.
 * These lookup envelopes identify source objects; the clearance predicate uses
 * their measured extrema. Full-body inclusion between the planes is stronger
 * than finite-height furniture contact and protects every intervening triangle. */
function actualLane(life: StreetLife, front: StreetFront, inverseFront: THREE.Matrix4): Lane {
  const wood = life.group.getObjectByName('street-life-wood'); assert.ok(wood instanceof THREE.Mesh);
  const matrix = new THREE.Matrix4().multiplyMatrices(inverseFront, wood.matrixWorld);
  const positions = wood.geometry.getAttribute('position'), counter: THREE.Vector3[] = [], backbar: THREE.Vector3[] = [];
  const center = -front.width * 0.16;
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
    if (Math.abs(p.x - center) <= front.width * 0.61 / 2 + GEOMETRY_EPSILON
      && p.y >= 0.075 - GEOMETRY_EPSILON && p.y <= 1.115 + GEOMETRY_EPSILON
      && p.z >= -2.71 - GEOMETRY_EPSILON && p.z <= -1.85 + GEOMETRY_EPSILON) counter.push(p);
    if (Math.abs(p.x - center) <= front.width * 0.62 / 2 + GEOMETRY_EPSILON
      && p.y >= 0.09 - GEOMETRY_EPSILON && p.y <= 1.27 + GEOMETRY_EPSILON
      && p.z >= -4.30 - GEOMETRY_EPSILON && p.z <= -3.68 + GEOMETRY_EPSILON) backbar.push(p);
  }
  assert.ok(counter.length >= 24 && backbar.length >= 24, 'empty or missing furniture cannot prove a lane');
  const c = new THREE.Box3().setFromPoints(counter), b = new THREE.Box3().setFromPoints(backbar);
  assert.ok(Math.abs(c.min.z + 2.71) <= GEOMETRY_EPSILON, 'actual counter rear plane moved');
  assert.ok(Math.abs(b.max.z + 3.68) <= GEOMETRY_EPSILON, 'actual backbar front plane moved');
  return { near: c.min.z, far: b.max.z, minX: Math.max(c.min.x, b.min.x), maxX: Math.min(c.max.x, b.max.x) };
}
function furnitureClearance(worker: Actor, lane: Lane): number {
  let result = Infinity;
  for (const p of worker.vertices) result = Math.min(result, lane.near - p.z, p.z - lane.far,
    p.x - lane.minX, lane.maxX - p.x);
  return result;
}
function hostClearance(worker: Actor, front: StreetFront, host: BoxCollider): number {
  const inverseHost = new THREE.Matrix4().makeRotationY(host.rotationY)
    .setPosition(host.centre.x, host.centre.y, host.centre.z).invert();
  const frontToHost = inverseHost.multiply(frame(front));
  let result = Infinity;
  for (const vertex of worker.vertices) {
    const p = vertex.clone().applyMatrix4(frontToHost);
    result = Math.min(result, host.halfExtents.x - Math.abs(p.x),
      host.halfExtents.y - Math.abs(p.y), host.halfExtents.z - Math.abs(p.z));
  }
  return result;
}
/** A lower bound on separation of the full bodies, built from every actual
 * body/head vertex. If these closed enclosing volumes have >=25 mm gap,
 * no triangle/limb inside either can intersect the other. No centre distance. */
function bodySeparation(a: Actor, b: Actor): number {
  const gap = (loA: number, hiA: number, loB: number, hiB: number) => Math.max(loA - hiB, loB - hiA, 0);
  return Math.hypot(gap(a.bounds.min.x, a.bounds.max.x, b.bounds.min.x, b.bounds.max.x),
    gap(a.bounds.min.y, a.bounds.max.y, b.bounds.min.y, b.bounds.max.y),
    gap(a.bounds.min.z, a.bounds.max.z, b.bounds.min.z, b.bounds.max.z));
}
function feet(worker: Actor, yaw: number, stride: number, centerX: number): void {
  const unpivot = new THREE.Matrix4().makeRotationY(yaw).setPosition(centerX, 0, CENTER_Z).invert();
  const minimums: number[] = [], foreAft: number[] = [];
  const ankles: THREE.Vector3[] = [];
  for (const part of [10, 11]) {
    const shoe = worker.partVertices[part], unique = new Map<string, THREE.Vector3>();
    for (const p of shoe) unique.set([p.x, p.y, p.z].map(v => v.toFixed(6)).join(','), p);
    assert.equal(unique.size, 8, 'actual shoe must retain its complete eight box vertices');
    const all = [...unique.values()], minY = Math.min(...all.map(p => p.y)); minimums.push(minY);
    assert.ok(all.every(p => p.y >= FLOOR - FLOOR_EPSILON), 'an actual shoe vertex penetrates the floor');
    const bottom = all.filter(p => Math.abs(p.y - minY) <= FLOOR_EPSILON);
    assert.equal(bottom.length, 4, 'measure four bottom heel/toe corners, not the shoe centre');
    const local = all.map(p => p.clone().applyMatrix4(unpivot)), box = new THREE.Box3().setFromPoints(local), size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - 0.16) < FLOOR_EPSILON && Math.abs(size.y - 0.10) < FLOOR_EPSILON && Math.abs(size.z - 0.28) < FLOOR_EPSILON,
      'shoe width/height/depth must survive the complete actor yaw');
    const center = box.getCenter(new THREE.Vector3()); foreAft.push(center.z);
    ankles.push(new THREE.Vector3(center.x, box.max.y, center.z));
  }
  assert.ok(minimums.some(y => Math.abs(y - FLOOR) <= FLOOR_EPSILON), 'both actual feet are floating');
  minimums.sort((a, b) => a - b);
  assert.ok(Math.abs(minimums[0] - FLOOR) <= FLOOR_EPSILON);
  assert.ok(Math.abs(minimums[1] - (FLOOR + 0.022 * Math.abs(stride))) <= FLOOR_EPSILON, 'alternating lifted foot is not tied to the stride');
  foreAft.sort((a, b) => a - b);
  assert.ok(Math.abs(foreAft[0] + 0.08 * Math.abs(stride)) <= FLOOR_EPSILON
    && Math.abs(foreAft[1] - 0.08 * Math.abs(stride)) <= FLOOR_EPSILON, 'heel/toe displacement does not alternate with the actual actor pivot');
  // Unit-box leg end-face centres, transformed through the actual instance.
  // The ankle is the measured shoe top, not a duplicated guessed shoe centre.
  for (const part of [0, 1]) {
    const matrix = new THREE.Matrix4().multiplyMatrices(unpivot, worker.matrices[part]);
    const ends = [-0.5, 0.5].map(y => new THREE.Vector3(0, y, 0).applyMatrix4(matrix)).sort((a, b) => a.y - b.y);
    const [bottom, top] = ends;
    assert.ok(Math.abs(top.y - 0.94) <= FLOOR_EPSILON && Math.abs(top.z) <= FLOOR_EPSILON
      && Math.abs(Math.abs(top.x) - 0.12) <= FLOOR_EPSILON, 'actual leg misses its authored hip endpoint');
    const ankle = ankles.reduce((nearest, candidate) => Math.abs(candidate.x - top.x) < Math.abs(nearest.x - top.x) ? candidate : nearest);
    assert.ok(bottom.distanceTo(ankle) <= FLOOR_EPSILON, 'actual leg does not bridge to the measured lifted/striding ankle');
  }
}
function times(): number[] {
  const values = new Set<number>();
  for (let step = 0; step <= Math.round(PERIOD * 120); step++) values.add(step / 120);
  for (const boundary of BOUNDARIES) for (const side of [-1, 0, 1]) {
    const time = boundary + side * 1e-6;
    // Wrap both sides of zero as a periodic non-negative time.
    values.add(time < 0 ? PERIOD + time : time);
  }
  return [...values].sort((a, b) => a - b);
}

test('Coffee worker zero sweeps actual yawed body/head/feet geometry inside its protected furniture lane', () => {
  const plan = generateLevel({ seed: 'euc' }).plan, life = createStreetLife(plan), model = new ProtectedActivity(PROTECTED_ACTIVITY);
  try {
    assert.deepEqual(Object.fromEntries(Object.keys(CONTRACT).map(key =>
      [key, PROTECTED_ACTIVITY[key as keyof typeof CONTRACT]])), CONTRACT);
    assert.ok(Math.abs(model.periodSeconds - PERIOD) < 1e-12);
    life.group.updateMatrixWorld(true);
    const front = life.fronts[0]; assert.ok(front && front.shop === 'COFFEE');
    const inverseFront = frame(front).invert(), host = protectingHost(life, front, plan.solids ?? []);
    const lane = actualLane(life, front, inverseFront);
    let minimumFurniture = Infinity, minimumHost = Infinity, minimumOther = Infinity, checkedVertices = 0;
    let minimumCenter = Infinity, maximumCenter = -Infinity, sawBothStrideSigns = 0;
    for (const seconds of times()) {
      life.update(seconds, false); life.group.updateMatrixWorld(true);
      const pose = model.sample(seconds, false), worker = actor(life, 0, inverseFront), other = actor(life, 1, inverseFront);
      const centerX = -0.205 * front.width + pose.offsetX;
      // Torso is the actual actor centre; feet are deliberately not used as its proxy.
      const torso = new THREE.Vector3().setFromMatrixPosition(worker.matrices[2]);
      assert.ok(Math.abs(torso.x - centerX) < FLOOR_EPSILON && Math.abs(torso.z - CENTER_Z) < FLOOR_EPSILON,
        `production worker trajectory disagrees with the 10.4-second contract at ${seconds}`);
      minimumCenter = Math.min(minimumCenter, torso.x); maximumCenter = Math.max(maximumCenter, torso.x);
      sawBothStrideSigns |= pose.stride > 0.25 ? 1 : pose.stride < -0.25 ? 2 : 0;
      // Remove the shared actor pivot from every part, including hands, eyes,
      // hat and head. A part that omitted pivotYaw will retain an unexpected Y rotation.
      const pivot = new THREE.Matrix4().makeRotationY(pose.yaw).setPosition(centerX, 0, CENTER_Z).invert();
      for (const part of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
        const local = new THREE.Matrix4().multiplyMatrices(pivot, worker.matrices[part]);
        const q = new THREE.Quaternion(); local.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        if (part === 4) {
          const roll = (0.18 - 0.06 * pose.armSwing) * (1 - pose.service);
          const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.20 * pose.service, 0, roll));
          assert.ok(q.angleTo(expected) < FLOOR_EPSILON, `service arm did not share the actor pivot at ${seconds}`);
          const wrist = new THREE.Vector3(0, -0.5, 0).applyMatrix4(worker.matrices[4]);
          const hand = new THREE.Vector3().setFromMatrixPosition(worker.matrices[6]);
          assert.ok(wrist.distanceTo(hand) < FLOOR_EPSILON, 'service hand separates from the actual arm endpoint');
          if (pose.service > 0.99) assert.ok(hand.y > 1.30, 'service gesture stays hidden below the counter');
        } else assert.ok(Math.abs(euler.y) < FLOOR_EPSILON && Math.abs(euler.x) < FLOOR_EPSILON,
          `part ${part} did not share the full actor pivot at ${seconds}`);
        if (part === 3) assert.ok(Math.abs(Math.abs(euler.z) - 0.18)
          <= 0.06 * Math.abs(pose.stride) + FLOOR_EPSILON,
          `arm ${part} is not relaxed or retains an unrelated gesture at ${seconds}`);
      }
      feet(worker, pose.yaw, pose.stride, centerX);
      const furniture = furnitureClearance(worker, lane), protectedByHost = hostClearance(worker, front, host), separation = bodySeparation(worker, other);
      assert.ok(furniture >= CLEARANCE, `actual full-body furniture clearance ${furniture} at ${seconds}`);
      assert.ok(protectedByHost >= CLEARANCE, `source protecting OBB clearance ${protectedByHost} at ${seconds}`);
      assert.ok(separation >= CLEARANCE, `actual full-body coworker separation ${separation} at ${seconds}`);
      minimumFurniture = Math.min(minimumFurniture, furniture); minimumHost = Math.min(minimumHost, protectedByHost); minimumOther = Math.min(minimumOther, separation);
      checkedVertices += worker.vertices.length;
    }
    assert.ok(checkedVertices > 300000, 'empty or abbreviated sweep cannot establish full-period geometry coverage');
    assert.ok(Math.abs(maximumCenter - minimumCenter - 0.6) < FLOOR_EPSILON, 'the actual rendered actor never traversed both endpoints');
    assert.equal(sawBothStrideSigns, 3);
    assert.ok([minimumFurniture, minimumHost, minimumOther].every(v => Number.isFinite(v) && v >= CLEARANCE));
    // Worker zero must not carry the independent nine-second gesture anymore.
    life.update(0, false); life.group.updateMatrixWorld(true); const start = actor(life, 0, inverseFront);
    life.update(PERIOD, false); life.group.updateMatrixWorld(true); const wrapped = actor(life, 0, inverseFront);
    for (let i = 0; i < start.vertices.length; i++) assert.ok(start.vertices[i].distanceTo(wrapped.vertices[i]) < FLOOR_EPSILON,
      'Coffee activity wrap retained an independent gesture clock');

    // Known-bad control changes actual instance matrices, not acceptance limits.
    // Move every worker-zero part/head into the measured service counter depth.
    const { bodies, heads } = bodiesOf(life), localDelta = new THREE.Vector3(0, 0, -2.28 - CENTER_Z).transformDirection(frame(front));
    localDelta.multiplyScalar(-2.28 - CENTER_Z);
    const move = new THREE.Matrix4().makeTranslation(localDelta.x, localDelta.y, localDelta.z);
    for (let part = 0; part <= PARTS; part++) {
      const mesh = part === PARTS ? heads : bodies, index = part === PARTS ? 0 : part;
      const instance = new THREE.Matrix4(); mesh.getMatrixAt(index, instance);
      mesh.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld.clone().invert(), move)
        .multiply(mesh.matrixWorld).multiply(instance));
    }
    life.group.updateMatrixWorld(true);
    assert.ok(furnitureClearance(actor(life, 0, inverseFront), lane) < CLEARANCE,
      'the independent geometry predicate accepted a worker moved into the service counter');
  } finally { life.dispose(); }
});
