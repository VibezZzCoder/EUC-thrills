/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-owned CPU preparation of original cap matrices. It repeats the
 * actual composeBuilding/untagged emission and Matrix4 operations, without
 * meshes, materials or textures. Actual createProps independently emits and
 * checks these matrices/bytes; this owner never supplies its source bucket.
 */
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { buildingSourceRecords } from './buildingSourceRecords.ts';
import { ultraSlotClosing } from './ultra/ultraBuildings.ts';

export interface PreparedOriginalCapSlots {
  readonly source: LevelPlan;
  readonly count: number;
  readonly matrices: readonly number[];
  readonly slots: Uint8Array | null;
  readonly disposed: boolean;
  dispose(): void;
}
export function prepareOriginalCapSlots(plan: LevelPlan): PreparedOriginalCapSlots {
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), composed = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), matrices: number[] = [];
  for (const prop of plan.props ?? []) {
    if (prop.kind !== 'building') continue;
    position.set(prop.position.x, prop.position.y, prop.position.z);
    quaternion.setFromAxisAngle(up, prop.rotationY); scale.setScalar(prop.scale); base.compose(position, quaternion, scale);
    for (const piece of buildingSourceRecords(prop)) {
      if (piece.part !== 'buildingCap') continue;
      quaternion.setFromAxisAngle(up, piece.yaw); position.set(piece.x, piece.y, piece.z);
      scale.set(piece.sx, piece.sy, piece.sz); local.compose(position, quaternion, scale);
      for (const element of composed.multiplyMatrices(base, local).elements) matrices.push(element);
    }
  }
  const count = matrices.length / 16;
  let slots = count ? ultraSlotClosing(matrices, count) : null, disposed = false;
  return { source: plan, count, get matrices() { if (disposed) throw new Error('Original cap owner disposed'); return matrices; },
    get slots() { if (disposed) throw new Error('Original cap owner disposed'); return slots; },
    get disposed() { return disposed; }, dispose() { if (disposed) return; disposed = true; matrices.length = 0; slots = null; } };
}
export function assertOriginalCapSlotEmission(prepared: PreparedOriginalCapSlots, matrices: readonly number[],
  slots: Uint8Array | null, buildings: boolean): void {
  const expected = prepared.matrices;
  if (expected.length !== matrices.length || expected.some((value, index) => value !== matrices[index]))
    throw new Error('Prepared caps differ from actual original emission');
  const expectedSlots = buildings ? prepared.slots : null;
  if ((expectedSlots === null) !== (slots === null) || (expectedSlots && slots
    && (expectedSlots.length !== slots.length || expectedSlots.some((value, index) => value !== slots[index]))))
    throw new Error('Prepared cap slots differ from actual original source allocation');
}
export function priceOriginalCapSlots(prepared: PreparedOriginalCapSlots, buildings: boolean, farShadow: boolean,
  trianglesPerCap: number): { readonly flagBytes: number; readonly farExtraDraws: number; readonly farExtraTriangles: number } {
  const active = buildings && prepared.slots !== null;
  // One U8x4 buffer for ALL caps, including zero-valued non-closing members.
  // One extra far draw repeats the ENTIRE bucket, not only closing members.
  return { flagBytes: active ? prepared.count * 4 : 0, farExtraDraws: active && farShadow ? 1 : 0,
    farExtraTriangles: active && farShadow ? prepared.count * trianglesPerCap : 0 };
}
