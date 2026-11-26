/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { TROLLINA_MACHINE_LOOK } from './machineLook.ts';
import { createRidingRig } from './ridingRig.ts';
import { EUC, SIMULATION } from '../data/tuning.ts';
import { loftGeometry, vAtHeight } from './blockoutKit.ts';
import { createPlaceholderRider, createStanceInput } from './rider.ts';
import { TROLLINA_LOOK } from './riderLook.ts';
import { sculptTrollinaDress, sculptTrollinaSleeve, trollinaFaceParts, trollinaHair } from './trollinaSculpt.ts';

test('Trollina cloth folds preserve the authored inner envelope and hem height', () => {
  for (const part of ['torso', 'sleeve'] as const) {
    const profile = TROLLINA_LOOK.profiles[part]!;
    const radial = part === 'torso' ? TROLLINA_LOOK.density!.torso! : TROLLINA_LOOK.density!.limb!;
    const geometry = loftGeometry(profile, { radialSegments: radial });
    const original = geometry.getAttribute('position').clone();
    const normals = geometry.getAttribute('normal').clone();
    if (part === 'torso') sculptTrollinaDress(geometry);
    else sculptTrollinaSleeve(geometry, 1);
    const positions = geometry.getAttribute('position');
    let raised = 0;
    for (let index = 0; index < positions.count; index += 1) {
      assert.equal(positions.getY(index), original.getY(index), `${part}: the cloth moved down into a leg or arm`);
      const dx = positions.getX(index) - original.getX(index);
      const dz = positions.getZ(index) - original.getZ(index);
      const outward = dx * normals.getX(index) + dz * normals.getZ(index);
      assert.ok(outward >= -1e-8, `${part}: fold cuts into the original clearance envelope`);
      if (outward > 0.001) raised += 1;
    }
    assert.ok(raised > radial, `${part}: gathered volume is absent`);
    geometry.dispose();
  }
});

test('Trollina locks and expression rebuild deterministically with finite normals', () => {
  for (const build of [trollinaHair, () => trollinaFaceParts(TROLLINA_LOOK.profiles.head)]) {
    const first = build();
    const second = build();
    for (const attribute of ['position', 'normal', 'color', 'uv']) {
      assert.deepEqual(first.getAttribute(attribute).array, second.getAttribute(attribute).array);
      assert.ok([...first.getAttribute(attribute).array].every(Number.isFinite), `${attribute}: invalid geometry`);
    }
    first.dispose();
    second.dispose();
  }
});

test('the runtime applies both cloth sculptors without adding rider meshes', () => {
  const sculpted = createPlaceholderRider(TROLLINA_LOOK);
  const plain = createPlaceholderRider({ ...TROLLINA_LOOK, paint: undefined });
  const count = (root: THREE.Object3D): number => {
    let total = 0;
    root.traverse(object => { if (object instanceof THREE.Mesh) total += 1; });
    return total;
  };
  assert.equal(count(sculpted.root), count(plain.root));
  for (const side of ['left', 'right']) {
    const sculptedSleeve = sculpted.root.getObjectByName(`rider-cap-sleeve-${side}`) as THREE.Mesh;
    const plainSleeve = plain.root.getObjectByName(`rider-cap-sleeve-${side}`) as THREE.Mesh;
    assert.notDeepEqual(sculptedSleeve.geometry.getAttribute('position').array,
      plainSleeve.geometry.getAttribute('position').array, `${side}: the runtime skipped the sleeve sculptor`);
  }
  sculpted.dispose();
  plain.dispose();
});

test('Trollina hem hangs toward gravity in a carve and its lining follows the same folds', () => {
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  const lean = new THREE.Group(); lean.add(rider.root);
  const torso = rider.pelvis.children.find(child => child instanceof THREE.Mesh && child.castShadow) as THREE.Mesh;
  const positions = torso.geometry.getAttribute('position') as THREE.BufferAttribute;
  const radial = TROLLINA_LOOK.density!.torso!;
  const outerVertices = TROLLINA_LOOK.profiles.torso.length * radial;
  const point = new THREE.Vector3();
  const range = (): number => {
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < radial; i++) {
      point.fromBufferAttribute(positions, i); torso.localToWorld(point);
      low = Math.min(low, point.y); high = Math.max(high, point.y);
    }
    return high - low;
  };
  for (const sign of [-1, 1]) for (const attack of [0, 1]) {
    lean.rotation.set(0, 0.73, -sign * 0.64);
    rider.pelvis.rotation.z = sign * 0.08;
    rider.applyStanceReaction(Object.assign(createStanceInput(), {
      rollAngle: sign * 0.64, riderRoll: sign * 0.56, torsoPitch: 0.15,
      attack, carveStance: attack * 0.84,
    }));
    lean.updateMatrixWorld(true);
    assert.ok(range() < 0.12, `gravity hem remains a steep shelf: ${range()}`);
    // Lining is appended in outer-row order and uses the same source motion.
    for (let i = 0; i < radial; i++) {
      const inner = outerVertices + 1 + i;
      assert.equal(positions.getX(inner), positions.getX(i));
      assert.equal(positions.getY(inner), positions.getY(i));
      assert.equal(positions.getZ(inner), positions.getZ(i));
    }
    const first = positions.array.slice();
    const version = positions.version;
    rider.applyStanceReaction(Object.assign(createStanceInput(), {
      rollAngle: sign * 0.64, riderRoll: sign * 0.56, torsoPitch: 0.15,
      attack, carveStance: attack * 0.84,
    }));
    assert.deepEqual(positions.array, first, 'hem accumulates deformation between presented frames');
    assert.equal(positions.version, version, 'unchanged cloth was rebuilt and uploaded again');
  }
  rider.dispose();
});

test('straight world travel and heading changes do not resculpt a neutral hanging hem', () => {
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  const heading = new THREE.Group(); heading.add(rider.root);
  const torso = rider.pelvis.children.find(child => child instanceof THREE.Mesh && child.castShadow) as THREE.Mesh;
  const positions = torso.geometry.getAttribute('position') as THREE.BufferAttribute;
  const stance = createStanceInput();
  rider.applyStanceReaction(stance);
  const version = positions.version;
  for (let step = 1; step <= 30; step++) {
    heading.position.set(step * 0.7, 0, step * 1.3);
    heading.rotation.y = step * 0.08;
    rider.applyStanceReaction(stance);
  }
  assert.equal(positions.version, version, 'world travel with an unchanged pose rebuilt the skirt');
  rider.dispose();
});

test('gravity-hanging cloth clears the expanded upper-leg capsules in representative compound poses', () => {
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  const lean = new THREE.Group(); lean.add(rider.root);
  const torso = rider.pelvis.children.find(child => child instanceof THREE.Mesh && child.castShadow) as THREE.Mesh;
  const positions = torso.geometry.getAttribute('position');
  const radial = TROLLINA_LOOK.density!.torso!;
  const profiles = TROLLINA_LOOK.profiles.torso;
  const point = new THREE.Vector3();
  const envelope = TROLLINA_LOOK.hemDrapeEnvelope!;
  const seat = TROLLINA_LOOK.profiles.seat;
  const clearsSeat = (sample: THREE.Vector3): boolean => {
    if (sample.y < seat[0]!.y || sample.y > seat[seat.length - 1]!.y) return true;
    const v = vAtHeight(seat, sample.y), below = Math.min(seat.length - 2, Math.floor(v)), t = v - below;
    const a = seat[below]!, b = seat[below + 1]!;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const width = a.halfWidth + (b.halfWidth - a.halfWidth) * t + 0.003;
    const depth = a.halfDepth + (b.halfDepth - a.halfDepth) * t + 0.003;
    const square = a.square + (b.square - a.square) * t;
    return Math.abs((sample.x - x) / width) ** square + Math.abs((sample.z - z) / depth) ** square >= 1 - 1e-5;
  };
  for (const roll of [-0.64, -0.35, 0, 0.35, 0.64]) for (const pitch of [-0.3, 0, 0.3]) {
    for (const crouch of [0, 0.5]) for (const attack of [0, 1]) {
      // As in riderClearance.test.ts, preload is held only in a moderate
      // carve. Deep crouch plus full bank belongs to the structural tier,
      // where a short skirt is supported by tights rather than containing
      // an almost-horizontal thigh. Do not call that cross-product ridden.
      if (crouch > 0 && Math.abs(roll) > 0.35) continue;
      for (const leanShare of [0.18, 0.85, Math.atan(EUC.carveGripTopG) / Math.atan(EUC.maxLateralG)]) {
      const riderRoll = roll * leanShare;
      lean.rotation.set(pitch * 0.2, 0.71, -roll);
      rider.pelvis.rotation.z = roll - riderRoll;
      rider.applyStanceReaction(Object.assign(createStanceInput(), {
        rollAngle: roll, riderRoll, torsoPitch: pitch, riderPitch: pitch, crouch,
        attack, carveStance: attack * 0.84,
      }));
      lean.updateMatrixWorld(true);
      for (const side of ['left', 'right']) {
        const hip = rider.root.getObjectByName(`rider-hip-${side}`)!;
        for (let row = 0; row < profiles.length && profiles[row]!.y <= 0.16; row++) {
          for (let column = 0; column < radial; column++) {
            point.fromBufferAttribute(positions, row * radial + column);
            assert.ok(clearsSeat(point), `skirt enters the pelvis-fixed shorts at roll=${roll}, pitch=${pitch}, crouch=${crouch}`);
            torso.localToWorld(point); hip.worldToLocal(point);
            const dy = point.y - Math.min(0, Math.max(-0.25, point.y));
            const outside = (point.x / envelope.x) ** 2 + (dy / envelope.cap) ** 2 + (point.z / envelope.z) ** 2;
            assert.ok(outside >= 1 - 1e-5,
              `${side} cloth enters the expanded thigh capsule at roll=${roll}, pitch=${pitch}, crouch=${crouch}`);
            if (row + 1 < profiles.length && profiles[row + 1]!.y <= 0.16) {
              // Surface vertices alone could hide a facet cutting the capsule.
              // Sample both triangle interiors with a smaller envelope that
              // still exceeds the tights by at least the 3 mm garment floor.
              const a = row * radial + column;
              const b = row * radial + (column + 1) % radial;
              const c = (row + 1) * radial + column;
              const d = (row + 1) * radial + (column + 1) % radial;
              for (const triangle of [[a, c, b], [b, c, d]]) {
                point.set(0, 0, 0);
                for (const vertex of triangle) {
                  point.x += positions.getX(vertex) / 3;
                  point.y += positions.getY(vertex) / 3;
                  point.z += positions.getZ(vertex) / 3;
                }
                assert.ok(clearsSeat(point), `skirt facet cuts the pelvis-fixed shorts at roll=${roll}, pitch=${pitch}, crouch=${crouch}`);
                torso.localToWorld(point); hip.worldToLocal(point);
                const capY = point.y - Math.min(0, Math.max(-0.25, point.y));
                const faceOutside = (point.x / (envelope.x - 0.004)) ** 2
                  + (capY / (envelope.cap - 0.004)) ** 2 + (point.z / (envelope.z - 0.004)) ** 2;
                assert.ok(faceOutside >= 1 - 1e-5,
                  `${side} cloth facet enters the padded thigh at roll=${roll}, pitch=${pitch}, crouch=${crouch}`);
              }
            }
          }
        }
      }
      }
    }
  }
  rider.dispose();
});

// A curved taillight's bounding box includes empty air at its ends.
// Use it only to reject distant cloth, then test the edges of both surfaces.
function triangleEdgesCross(a: THREE.Triangle, b: THREE.Triangle, ray: THREE.Ray, hit: THREE.Vector3): boolean {
  for (const [from, to] of [[a.a, a.b], [a.b, a.c], [a.c, a.a]]) {
    ray.origin.copy(from!);
    ray.direction.subVectors(to!, from!);
    const length = ray.direction.length();
    if (length < 1e-9) continue;
    ray.direction.divideScalar(length);
    if (ray.intersectTriangle(b.a, b.b, b.c, false, hit) && hit.distanceToSquared(from!) <= length * length) return true;
  }
  return false;
}

test('the mounted skirt clears the thighs, hands and rear lamps in a crouched S-turn and swings outward on each bank', () => {
  const plan = createProvingGround();
  const controller = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn });
  const rig = createRidingRig(TROLLINA_LOOK, TROLLINA_MACHINE_LOOK);
  const pose = createPose();
  const torso = rig.rider.pelvis.children.find(o => o instanceof THREE.Mesh && o.castShadow) as THREE.Mesh;
  const positions = torso.geometry.getAttribute('position'), faces = torso.geometry.index!;
  const radial = TROLLINA_LOOK.density!.torso!;
  const contacts = [
    ...['euc-status-light', 'euc-taillight', 'rider-hand-left', 'rider-hand-right']
      .map(name => rig.group.getObjectByName(name) as THREE.Mesh),
    ...['left', 'right'].flatMap(side => rig.group.getObjectByName(`rider-hip-${side}`)!
      .children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh)),
  ].map(mesh => {
    mesh.geometry.computeBoundingBox();
    const vertices = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index!;
    const triangles: THREE.Triangle[] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const corner = (offset: number) => new THREE.Vector3().fromBufferAttribute(vertices, indices.getX(i + offset));
      triangles.push(new THREE.Triangle(corner(0), corner(1), corner(2)));
    }
    return { mesh, box: mesh.geometry.boundingBox!, toPart: new THREE.Matrix4(), triangles };
  });
  const centroid = new THREE.Vector3(), belt = new THREE.Vector3(), sample = new THREE.Vector3();
  const tri = new THREE.Triangle(), yaw = new THREE.Vector3(0, 1, 0);
  const samples = Array.from({ length: TROLLINA_LOOK.profiles.torso.length * radial }, () => new THREE.Vector3());
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  const checked = new Set<number>();
  let crouchedCarves = 0;
  try {
    for (let tick = 0; tick < 860; tick++) {
      const steer = tick < 395 ? 0 : tick < 525 ? 1 : tick < 670 ? -1 : tick < 790 ? 1 : 0;
      const crouch = (tick >= 470 && tick < 515) || (tick >= 581 && tick < 645);
      controller.step(1 / SIMULATION.hz, { ...NEUTRAL_ACTIONS, throttle: .8, steer, crouch });
      if (tick % 8 || tick < 390) continue;
      controller.writePose(pose);
      rig.apply(pose);
      rig.group.updateMatrixWorld(true);
      centroid.set(0, 0, 0);
      for (let col = 0; col < radial; col++) centroid.add(sample.fromBufferAttribute(positions, col));
      torso.localToWorld(centroid.divideScalar(radial));
      torso.localToWorld(belt.set(0, TROLLINA_LOOK.hemDrapeGravity!.anchorY, 0));
      centroid.sub(belt).applyAxisAngle(yaw, -pose.headingY);
      if (Math.abs(pose.riderRoll) > .48 && Math.sign(pose.riderRoll) === Math.sign(pose.rollAngle)) {
        assert.ok(-Math.sign(pose.riderRoll) * centroid.x > .012, `hem moved into the turn at ${tick}`);
        checked.add(Math.sign(pose.riderRoll));
        if (crouch && pose.tuck > .75) crouchedCarves++;
      }
      for (const {mesh, box, toPart, triangles} of contacts) {
        toPart.copy(mesh.matrixWorld).invert().multiply(torso.matrixWorld);
        // First rows of the actual outer loft. Its lining shares these vertices.
        const rows = TROLLINA_LOOK.profiles.torso.filter(r => r.y <= .176).length;
        for (let i = 0; i < rows * radial; i++) samples[i]!.fromBufferAttribute(positions, i).applyMatrix4(toPart);
        for (let fi = 0; fi < (rows - 1) * radial * 6; fi += 3) {
          tri.set(samples[faces.getX(fi)]!, samples[faces.getX(fi + 1)]!, samples[faces.getX(fi + 2)]!);
          if (!box.intersectsTriangle(tri)) continue;
          assert.ok(!triangles.some(lamp => triangleEdgesCross(lamp, tri, ray, hit) || triangleEdgesCross(tri, lamp, ray, hit)), `skirt panel crosses ${mesh.name || mesh.parent?.name} on tick ${tick}`);
        }
      }
    }
    assert.equal(checked.size, 2, 'the controller never reached both banks');
    assert.ok(crouchedCarves >= 6, 'the test missed the loaded crouch');
    assert.ok(Math.abs(centroid.x) < .009, 'the hem did not settle after release');
  } finally { rig.dispose(); }
});
