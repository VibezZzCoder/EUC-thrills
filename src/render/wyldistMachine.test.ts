/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { FX, WHEEL } from '../data/tuning.ts';
import { machineForCharacter, machineSpec } from '../data/machines.ts';
import { createBlockoutEUC } from './euc.ts';
import { machineLook } from './machineLook.ts';
import { measureObject } from './renderCost.ts';
import { WYLDIST_MACHINE_LOOK } from './wyldistMachineLook.ts';

function extent(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh, true);
}

function namedMesh(group: THREE.Object3D, name: string): THREE.Mesh {
  const mesh = group.getObjectByName(name) as THREE.Mesh;
  assert.equal(mesh?.isMesh, true, `${name} is a built mesh`);
  return mesh;
}

test('Wyldist resolves to his wheel and stays inside the shipped Seal wheel ceiling', () => {
  assert.equal(machineForCharacter('wyldist'), 'wyldist');
  assert.equal(machineSpec('wyldist').id, 'wyldist');
  assert.equal(machineLook('wyldist'), WYLDIST_MACHINE_LOOK);
  const euc = createBlockoutEUC(WYLDIST_MACHINE_LOOK);
  try {
    const cost = measureObject(euc.group);
    assert.equal(cost.meshes.length, 11);
    assert.equal(cost.drawCalls, 11);
    assert.equal(cost.shadowDrawCalls, 7);
    assert.equal(cost.totalDrawCalls, 18);
    assert.ok(cost.totalTriangles <= 6124, `${cost.totalTriangles} exceeds the 6124-triangle wheel ceiling`);
  } finally {
    euc.dispose();
  }
});

test('compact bodywork retains the shared calf plane, tyre and pedal contacts', () => {
  const euc = createBlockoutEUC(WYLDIST_MACHINE_LOOK);
  try {
    const shell = extent(namedMesh(euc.group, 'euc-shell'));
    assert.ok(shell.max.y <= WHEEL.shellHeight + 0.00001);
    assert.ok(shell.max.z - shell.min.z < 0.44, 'the cosmetic shell remains compact fore/aft');

    const calfPlane = WHEEL.shellWidth / 2 + WHEEL.padThickness;
    const left = extent(namedMesh(euc.group, 'euc-pad-left'));
    const right = extent(namedMesh(euc.group, 'euc-pad-right'));
    assert.ok(Math.abs(left.max.x - calfPlane) < 0.00001);
    assert.ok(Math.abs(right.min.x + calfPlane) < 0.00001);
    assert.ok(left.max.y < 0.530 && left.min.y > 0.330);
    assert.ok(right.max.y < 0.530 && right.min.y > 0.330);

    const tyre = extent(namedMesh(euc.group, 'euc-tyre'));
    assert.ok(Math.abs(tyre.max.y - tyre.min.y - WHEEL.tyreDiameter) < 0.00001);
    const leftPedal = extent(namedMesh(euc.group, 'euc-pedal-left'));
    const rightPedal = extent(namedMesh(euc.group, 'euc-pedal-right'));
    assert.ok(Math.abs(leftPedal.max.x - WHEEL.pedalSpan / 2) < 0.00001);
    assert.ok(Math.abs(rightPedal.min.x + WHEEL.pedalSpan / 2) < 0.00001);
  } finally {
    euc.dispose();
  }
});

test('road lamps do not overtake or occupy the warning light', () => {
  const euc = createBlockoutEUC(WYLDIST_MACHINE_LOOK);
  try {
    const front = extent(namedMesh(euc.group, 'euc-headlight'));
    const rear = extent(namedMesh(euc.group, 'euc-taillight'));
    const status = extent(namedMesh(euc.group, 'euc-status-light'));
    const frontWidth = front.max.x - front.min.x;
    const rearWidth = rear.max.x - rear.min.x;
    assert.ok(frontWidth >= 0.080 && frontWidth <= 0.125, `front lamp width ${frontWidth}`);
    assert.ok(rearWidth >= 0.035 && rearWidth < FX.statusLightWidth * 0.90, `rear lamp width ${rearWidth}`);
    assert.ok(rear.max.y < status.min.y - 0.015, 'rear road light leaves a visible gap beneath the warning light');
    assert.equal(WYLDIST_MACHINE_LOOK.trim.emissiveIntensity, 0);
    assert.equal(WYLDIST_MACHINE_LOOK.atlas, undefined);
  } finally {
    euc.dispose();
  }
});

test('all owned wheel geometries and materials have an idempotent disposal path', () => {
  const euc = createBlockoutEUC(WYLDIST_MACHINE_LOOK);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  euc.group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  const released = new Map<object, number>();
  for (const resource of [...geometries, ...materials]) {
    released.set(resource, 0);
    resource.addEventListener('dispose', () => released.set(resource, released.get(resource)! + 1));
  }
  euc.dispose();
  euc.dispose();
  for (const count of released.values()) assert.equal(count, 1);
});
