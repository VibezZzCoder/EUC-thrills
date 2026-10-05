/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET_LIFE } from '../data/streetLife.ts';
import { PROTECTED_ACTIVITY } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { StreetFront } from '../level/streetFronts.ts';
import { createStreetPaving } from './streetGroundView.ts';
import { collectStreetLifePieces, type StreetLifePieces } from './streetLifePieces.ts';
import { createDecorShapeGeometry } from './decorShapeGeometry.ts';
export { streetFronts } from '../level/streetFronts.ts';
export type { StreetFront } from '../level/streetFronts.ts';
import type { PresentationCost } from './presentation.ts';
import { paintStreetShops } from './streetShopPaint.ts';
import { ProtectedActivity } from './protectedActivity.ts';

export interface StreetLifeReport {
  readonly storefronts: number;
  readonly people: number;
  readonly planters: number;
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly textureBytes: number;
  readonly geometryBytes: number;
  readonly clockSeconds: number;
}

export const EMPTY_STREET_LIFE_REPORT: StreetLifeReport = Object.freeze({
  storefronts: 0, people: 0, planters: 0, drawCalls: 0, colourTriangles: 0,
  textureBytes: 0, geometryBytes: 0, clockSeconds: 0,
});

/** Adds the measured, colour-only pilot to every view, never route admission. */
export function withStreetLifeCost<T extends Omit<PresentationCost, 'recipe'>>(cost: T, life: StreetLifeReport): T {
  const frame = (old: { drawCalls: number; triangles: number }, views: number) => ({
    drawCalls: old.drawCalls + life.drawCalls * views,
    triangles: old.triangles + life.colourTriangles * views,
  });
  return {
    ...cost,
    drawCalls: cost.drawCalls + life.drawCalls,
    triangles: cost.triangles + life.colourTriangles,
    colourTriangles: cost.colourTriangles + life.colourTriangles,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) },
  };
}

export interface StreetLife {
  readonly group: THREE.Group;
  readonly fronts: readonly StreetFront[];
  update(seconds: number, reducedMotion: boolean): void;
  report(): StreetLifeReport;
  dispose(): void;
}

/** Shared world-owned material batches and protected indoor activity. */
export function createStreetLife(plan: LevelPlan, pieces: StreetLifePieces = collectStreetLifePieces(plan)): StreetLife {
  const fronts = pieces.fronts;
  const group = new THREE.Group();
  group.name = 'street-life-pilot';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  let disposed = false;
  let clockSeconds = 0;
  let reducedAtLastUpdate = false;
  let lastUpdateSeconds = 0;
  let updateActors: (seconds: number, reducedMotion: boolean) => void = () => {};
  if (fronts.length > 0) {
    const transform = new THREE.Object3D();
    const local = new THREE.Object3D();
    const colour = new THREE.Color();
    const finishes: Record<string, { roughness: number; metalness: number }> = {
      masonry: { roughness: 0.94, metalness: 0 }, wood: { roughness: 0.72, metalness: 0 },
      metal: { roughness: 0.30, metalness: 0.45 }, rubber: { roughness: 0.98, metalness: 0 },
      glass: { roughness: 0.16, metalness: 0.20 },
    };
    for (const [role, shapes] of Object.entries(pieces.batches)) {
      if (!shapes.length) continue;
      const pieces = shapes.map(createDecorShapeGeometry);
      const geometry = mergeGeometries(pieces)!;
      for (const piece of pieces) piece.dispose();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...finishes[role] });
      if (role === 'glass') {
        material.transparent = true;
        material.opacity = 0.16;
        material.depthWrite = false;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `street-life-${role}`;
      group.add(mesh); geometries.push(geometry); materials.push(material);
    }
    const panels = pieces.panels.map(createDecorShapeGeometry);
    const panelGeometry = mergeGeometries(panels)!;
    for (const geometry of panels) geometry.dispose();
    const texture = new THREE.DataTexture(paintStreetShops(), STREET_LIFE.atlasWidth,
      STREET_LIFE.atlasPageHeight * STREET_LIFE.storefronts);
    texture.name = 'original-street-shop-atlas';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    const panelMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
    const shops = new THREE.Mesh(panelGeometry, panelMaterial);
    shops.name = 'street-life-shopfronts';
    group.add(shops);
    geometries.push(panelGeometry);
    materials.push(panelMaterial);
    textures.push(texture);

    const people = fronts.length * STREET_LIFE.peoplePerShop;
    const bodyGeometry = createDecorShapeGeometry(pieces.body);
    const headGeometry = createDecorShapeGeometry(pieces.head);
    const personMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    // 0/1 legs, 2 torso, 3/4 arms, 5/6 hands, 7 hat, 8/9 eyes, 10/11 shoes.
    // Heads remain the separate one-instance-per-person mesh.
    const parts = 12;
    const bodies = new THREE.InstancedMesh(bodyGeometry, personMaterial, people * parts);
    const heads = new THREE.InstancedMesh(headGeometry, personMaterial, people);
    bodies.name = 'street-life-indoor-bodies';
    heads.name = 'street-life-indoor-heads';
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // These finite bounds include every gesture. No per-frame bounds scan or
    // population rebuild as another player's camera enters the frontage.
    const bounds = new THREE.Box3().setFromObject(group).expandByScalar(0.25);
    bodies.boundingBox = bounds.clone();
    heads.boundingBox = bounds.clone();
    bodies.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    heads.boundingSphere = bodies.boundingSphere.clone();
    const skin = [0xb88860, 0x815743, 0xd5ad87, 0x9c6b52, 0xbc936f, 0x684b3f];
    const shirts = [0xebd095, 0xa3bfba, 0xe0cfaa, 0x96b6c3, 0x91b2bd, 0xb89072];
    for (let person = 0; person < people; person += 1) {
      heads.setColorAt(person, colour.setHex(skin[person]));
      for (let part = 0; part < parts; part += 1) {
        bodies.setColorAt(person * parts + part, colour.setHex(part < 2 || part >= 7 ? 0x303b3c
          : part === 5 || part === 6 ? skin[person] : shirts[person]));
      }
    }
    const matrix = new THREE.Matrix4();
    const actorMatrix = new THREE.Matrix4();
    const actorPivot = new THREE.Object3D();
    const activity = new ProtectedActivity(PROTECTED_ACTIVITY);
    let personX = 0;
    let personDepth = -1.62;
    const place = (mesh: THREE.InstancedMesh, index: number, px: number, py: number,
      sx: number, sy: number, sz: number, roll = 0, depth = personDepth, pitch = 0): void => {
      // The actor pivot owns every part, including facial details and the head.
      // A caller's depth is in frontage coordinates; remove the pivot's depth
      // before composing its whole-body yaw with the part's local transform.
      local.position.set(px, py, depth - personDepth);
      local.rotation.set(pitch, 0, roll);
      local.scale.set(sx, sy, sz);
      local.updateMatrix();
      matrix.multiplyMatrices(actorMatrix, local.matrix);
      mesh.setMatrixAt(index, matrix);
    };
    updateActors = (seconds, reducedMotion) => {
      const gestureSeconds = reducedMotion ? 0 : seconds;
      for (let person = 0; person < people; person += 1) {
        const front = fronts[Math.floor(person / 2)];
        transform.position.set(front.position.x, front.position.y, front.position.z);
        transform.rotation.set(0, front.yaw, 0);
        transform.updateMatrix();
        const shop = Math.floor(person / 2);
        const walkingWorker = person === 0 && front.shop === 'COFFEE';
        const pose = walkingWorker ? activity.sample(seconds, reducedMotion) : undefined;
        personX = front.width * (shop === 0 ? (person % 2 ? 0.10 : -0.205)
          : shop === 1 ? (person % 2 ? 0.36 : 0.08) : (person % 2 ? 0.10 : -0.31));
        personDepth = shop === 1 ? (person % 2 ? -3.62 : -2.67) : (person % 2 ? -3.18 : -2.97);
        if (pose) {
          personX = front.width * PROTECTED_ACTIVITY.workerWidthShare + pose.offsetX;
          personDepth = PROTECTED_ACTIVITY.workerDepthMetres;
        }
        actorPivot.position.set(personX, 0, personDepth);
        actorPivot.rotation.set(0, pose?.yaw ?? 0, 0);
        actorPivot.updateMatrix();
        actorMatrix.multiplyMatrices(transform.matrix, actorPivot.matrix);
        const stride = pose?.stride ?? 0;
        const phase = gestureSeconds * Math.PI * 2 / STREET_LIFE.gesturePeriodSeconds + person * 1.9;
        // Worker zero has one 10.4-second activity, with no second gesture clock.
        const gesture = walkingWorker ? 0 : Math.sin(phase) * 0.1;
        const leftArm = pose ? -PROTECTED_ACTIVITY.armRestRadians
          + PROTECTED_ACTIVITY.armStrideRadians * pose.armSwing : -0.35 + gesture;
        const service = pose?.service ?? 0;
        const rightArm = pose ? (PROTECTED_ACTIVITY.armRestRadians
          - PROTECTED_ACTIVITY.armStrideRadians * pose.armSwing) * (1 - service) : 0.35 - gesture;
        const rightPitch = PROTECTED_ACTIVITY.armServicePitchRadians * service;
        // Rotate about the actual shoulder, keeping the upper end attached.
        // The reach is short enough for the hand's full box to clear the counter.
        const rightArmX = pose ? 0.27 + Math.sin(rightArm) * 0.21 : 0.31;
        const rightArmY = pose ? 1.47 - Math.cos(rightPitch) * Math.cos(rightArm) * 0.21 : 1.26;
        const rightArmDepth = personDepth - Math.sin(rightPitch) * Math.cos(rightArm) * 0.21;
        // All people have real planted shoes. During the worker's stride, one
        // foot stays at the authored floor; the opposite foot has bounded lift.
        // The pitched leg's end-face centres bridge the exact hip and ankle.
        for (let side = 0; side < 2; side += 1) {
          const direction = side === 0 ? 1 : -1;
          const x = side === 0 ? -0.12 : 0.12;
          const footZ = direction * PROTECTED_ACTIVITY.footStrideMetres * stride;
          const lift = PROTECTED_ACTIVITY.footLiftMetres * Math.max(0, direction * stride);
          const ankleY = PROTECTED_ACTIVITY.ankleYMetres + lift;
          const legRise = PROTECTED_ACTIVITY.hipYMetres - ankleY;
          place(bodies, person * parts + side, x,
            (PROTECTED_ACTIVITY.hipYMetres + ankleY) * 0.5,
            0.14, Math.hypot(legRise, footZ), 0.20, 0,
            personDepth + footZ * 0.5, Math.atan2(-footZ, legRise));
          place(bodies, person * parts + 10 + side, x,
            PROTECTED_ACTIVITY.shoeCenterYMetres + lift,
            PROTECTED_ACTIVITY.shoeWidthMetres, PROTECTED_ACTIVITY.shoeHeightMetres,
            PROTECTED_ACTIVITY.shoeDepthMetres, 0, personDepth + footZ);
        }
        // Full-depth indoor figures remain behind closed display glazing and
        // inside their original protecting body; source solids are untouched.
        place(bodies, person * parts + 2, 0, 1.18, 0.47, 0.55, 0.25);
        place(bodies, person * parts + 3, -0.31, 1.25, 0.13, 0.42, 0.16, leftArm);
        place(bodies, person * parts + 4, rightArmX, rightArmY, 0.13, 0.42, 0.16, rightArm, rightArmDepth, rightPitch);
        place(bodies, person * parts + 5, -0.31 + Math.sin(leftArm) * 0.21,
          1.25 - Math.cos(leftArm) * 0.21, 0.12, 0.12, 0.12);
        place(bodies, person * parts + 6, rightArmX + Math.sin(rightArm) * 0.21,
          rightArmY - Math.cos(rightPitch) * Math.cos(rightArm) * 0.21, 0.12, 0.12, 0.12,
          0, rightArmDepth - Math.sin(rightPitch) * Math.cos(rightArm) * 0.21);
        place(bodies, person * parts + 7, gesture * 0.15, 1.8, 0.26, 0.065, 0.22, gesture);
        place(bodies, person * parts + 8, -0.049 + gesture * 0.15, 1.68, 0.026, 0.018, 0.015, 0, personDepth + 0.16);
        place(bodies, person * parts + 9, 0.049 + gesture * 0.15, 1.68, 0.026, 0.018, 0.015, 0, personDepth + 0.16);
        place(heads, person, gesture * 0.15, 1.64, 0.15, 0.20, 0.13, gesture);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    };
    group.add(bodies, heads);
    geometries.push(bodyGeometry, headGeometry);
    materials.push(personMaterial);
    updateActors(0, false);
  }
  const paving = createStreetPaving(plan, pieces.paving);
  if (paving) {
    group.add(paving.mesh);
    geometries.push(paving.geometry);
    materials.push(paving.material);
  }
  let drawCalls = 0;
  let colourTriangles = 0;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    drawCalls += 1;
    colourTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3
      * (object instanceof THREE.InstancedMesh ? object.count : 1);
    // The pilot buys zero shadow passes, lamps or tier-dependent resources.
    object.castShadow = false;
    object.receiveShadow = object.name === 'street-life-paving';
  });
  let geometryBytes = 0;
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) geometryBytes += attribute.array.byteLength;
    geometryBytes += geometry.index?.array.byteLength ?? 0;
  }
  group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      geometryBytes += object.instanceMatrix.array.byteLength + (object.instanceColor?.array.byteLength ?? 0);
    }
  });
  return {
    group, fronts,
    update(seconds, reducedMotion) {
      if (disposed) return;
      // Cache the shared time and flag independently: changing reduced motion
      // at an unchanged clock must replace the endpoint pose with centered rest.
      if (lastUpdateSeconds === seconds && reducedAtLastUpdate === reducedMotion) return;
      lastUpdateSeconds = seconds;
      clockSeconds = reducedMotion ? 0 : seconds;
      reducedAtLastUpdate = reducedMotion;
      updateActors(seconds, reducedMotion);
    },
    report: () => ({ storefronts: fronts.length, people: fronts.length * STREET_LIFE.peoplePerShop,
      planters: fronts.some(front => front.shop === 'COFFEE') ? 1 : 0,
      drawCalls, colourTriangles, textureBytes: fronts.length
        ? Math.ceil(STREET_LIFE.atlasWidth * STREET_LIFE.atlasPageHeight * STREET_LIFE.storefronts * 4 * 4 / 3) : 0,
      geometryBytes, clockSeconds }),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
