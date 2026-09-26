/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BUILDING_FACADE, BUILDING_LOOKS, PROP_SIZES } from '../../data/props.ts';
import { LANDMARK_SIZES, composeBuilding, facadeForHeight } from '../../data/buildingLooks.ts';
import { PART_COSTS } from '../../data/renderCost.ts';
import { ULTRA } from '../../data/tuning.ts';
import { FACADE_PAGES, type FacadePageId } from '../facadeAtlas.ts';
import {
  SLOT_CLOSING,
  ULTRA_SLOT_ATTRIBUTE,
  installUltraSlotFarCaster,
  isUltraFarStaticRender,
  patchUltraSlotVertex,
  slotDilatedPositions,
  ultraBuildingCap,
  ultraFacadeBox,
  ultraRoofGable,
  ultraSlotClosing,
  ultraSlotDepth,
  ultraSlotFarDepth,
} from './ultraBuildings.ts';
import { patchUltraDepthVertex, ultraReliefDepthMaterial, createUltraShared } from './ultraMaterials.ts';
import { ULTRA_FULL, ULTRA_STATIC_LAYER } from './ultraRecipe.ts';
import { relievedPositions, shellReport } from './ultraKit.ts';
import type { PartId } from '../props.ts';

/**
 * The Ultra building parts, measured (`docs/M39_ULTRA.md` §4, T4).
 *
 * The relief is metric, so the geometry alone proves nothing: what a player
 * sees is `position × size + ultraRelief` for each instance's own size. The
 * tests therefore walk **every piece the kit composes** — untagged blocks at
 * a spread of sizes, every district look and every landmark — and check the
 * drawn shape at that size: inside its unit box (so inside the collider and
 * the clearance), a closed outward shell, and the same metres of relief on a
 * 0.6 m cornice band as on a 48 m shaft.
 */

type BuildingPart = 'buildingBody' | 'buildingLow' | 'buildingTall' | 'buildingCap' | 'roofGable';
const BUILDERS: Readonly<Record<BuildingPart, () => THREE.BufferGeometry>> = {
  buildingBody: () => ultraFacadeBox('buildingBody'),
  buildingLow: () => ultraFacadeBox('buildingLow'),
  buildingTall: () => ultraFacadeBox('buildingTall'),
  buildingCap: ultraBuildingCap,
  roofGable: ultraRoofGable,
};
/** §4's per-instance ceilings. */
const CEILINGS: Readonly<Record<BuildingPart, number>> = {
  buildingLow: 60, buildingBody: 92, buildingTall: 204, buildingCap: 44, roofGable: 32,
};
const GEOMETRY: Readonly<Record<BuildingPart, THREE.BufferGeometry>> = {
  buildingBody: BUILDERS.buildingBody(),
  buildingLow: BUILDERS.buildingLow(),
  buildingTall: BUILDERS.buildingTall(),
  buildingCap: BUILDERS.buildingCap(),
  roofGable: BUILDERS.roofGable(),
};
const PARTS = Object.keys(BUILDERS) as BuildingPart[];
const EPSILON = 1e-7;

interface Instance { readonly part: BuildingPart; readonly scale: [number, number, number]; readonly what: string }

/** Every building piece the kit composes, across a spread of sizes and every look. */
function composedInstances(): Instance[] {
  const out: Instance[] = [];
  const sizes = [
    { x: 6, y: 3.4, z: 6 }, { x: 9, y: 5, z: 14 }, { x: 12, y: 7, z: 16 }, { x: 20, y: 18, z: 12 },
    { x: 14, y: 26, z: 40 }, { x: 40, y: 64, z: 22 }, { x: 9, y: 11, z: 60 }, { x: 16, y: 9, z: 12 },
  ];
  const shape = PROP_SIZES.building;
  // Untagged blocks: body, parapet, and the setback tower whenever it would stand.
  for (const size of sizes) {
    out.push({ part: facadeForHeight(size.y) as BuildingPart, scale: [size.x, size.y, size.z], what: `untagged body ${JSON.stringify(size)}` });
    out.push({ part: 'buildingCap', scale: [size.x + shape.capOversail, shape.capHeight, size.z + shape.capOversail], what: `untagged parapet ${JSON.stringify(size)}` });
    const towerHeight = size.y * shape.towerHeightFraction;
    const tower: BuildingPart = towerHeight >= BUILDING_FACADE.highRiseHeight ? 'buildingTall' : 'buildingBody';
    const floors = tower === 'buildingTall' ? BUILDING_FACADE.highFloors : BUILDING_FACADE.lowFloors;
    if (towerHeight / floors >= BUILDING_FACADE.minFloorHeight) {
      out.push({ part: tower, scale: [size.x * shape.towerWidthFraction, towerHeight, size.z * shape.towerWidthFraction], what: `untagged tower ${JSON.stringify(size)}` });
    }
  }
  // Every look, districts at the spread of sizes and landmarks at their own.
  const landmarks = LANDMARK_SIZES as Readonly<Record<string, { x: number; y: number; z: number }>>;
  for (const look of BUILDING_LOOKS) {
    const lookSizes = landmarks[look] !== undefined ? [landmarks[look]] : sizes;
    for (const size of lookSizes) {
      for (const piece of composeBuilding({ position: { x: 3.7, y: 0, z: 11.3 }, size, look })) {
        out.push({ part: piece.part as BuildingPart, scale: [piece.sx, piece.sy, piece.sz], what: `${look} ${piece.part} ${JSON.stringify(size)}` });
      }
    }
  }
  return out;
}
const INSTANCES = composedInstances();

test('every building form stays inside its §4 ceiling and carries a metric ultraRelief', () => {
  for (const part of PARTS) {
    const geometry = GEOMETRY[part];
    const position = geometry.getAttribute('position');
    const triangles = position.count / 3;
    assert.ok(triangles <= CEILINGS[part], `${part} spends ${triangles} against ${CEILINGS[part]}`);
    assert.ok(triangles > PART_COSTS[part as PartId].triangles, `${part} is no richer than ordinary`);
    const relief = geometry.getAttribute('ultraRelief');
    assert.ok(relief !== undefined, `${part} has no ultraRelief`);
    assert.equal(relief.itemSize, 3);
    assert.equal(relief.count, position.count);
    let moved = 0;
    for (let i = 0; i < relief.count; i += 1) {
      assert.ok(Number.isFinite(relief.getX(i) + relief.getY(i) + relief.getZ(i)));
      if (relief.getX(i) !== 0 || relief.getY(i) !== 0 || relief.getZ(i) !== 0) moved += 1;
    }
    assert.ok(moved > 0, `${part} carries no relief at all`);
    // White: a facade's tone is its instance colour, its storeys the atlas.
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1) assert.ok(colour.getX(i) === 1 && colour.getY(i) === 1 && colour.getZ(i) === 1);
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i += 1) {
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-5, `${part} normal ${i}`);
    }
  }
  // The exact counts, so a change is a decision (and the Ultra catalogue's).
  assert.deepEqual(PARTS.map((part) => GEOMETRY[part].getAttribute('position').count / 3), [68, 36, 180, 44, 20]);
});

test('the kit composes enough building pieces for the walk below to mean something', () => {
  const parts = new Set(INSTANCES.map((instance) => instance.part));
  for (const part of PARTS) assert.ok(parts.has(part), `no composed piece uses ${part}`);
  // The extremes the relief has to survive: the thinnest cap band and the tallest shaft.
  const caps = INSTANCES.filter((instance) => instance.part === 'buildingCap');
  assert.ok(Math.min(...caps.map((cap) => cap.scale[1])) <= 0.6 + EPSILON, 'no 0.6 m cornice band was walked');
  assert.ok(Math.max(...caps.map((cap) => cap.scale[1])) >= 48, 'no tall shaft was walked');
});

test('relief is inward only: every composed piece stays inside its unit box, and a gable inside its prism', () => {
  for (const instance of INSTANCES) {
    const geometry = GEOMETRY[instance.part];
    const drawn = relievedPositions(geometry, instance.scale);
    const [sx, sy, sz] = instance.scale;
    for (let i = 0; i < drawn.length / 3; i += 1) {
      // Back into unit space: the point the instance matrix places.
      const x = drawn[i * 3] / sx;
      const y = drawn[i * 3 + 1] / sy;
      const z = drawn[i * 3 + 2] / sz;
      const where = `${instance.what} corner ${i} at (${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)})`;
      assert.ok(Math.abs(x) <= 0.5 + EPSILON && Math.abs(z) <= 0.5 + EPSILON, `${where} leaves the box in plan`);
      assert.ok(y >= -EPSILON && y <= 1 + EPSILON, `${where} leaves the box vertically`);
      if (instance.part === 'roofGable') {
        assert.ok(y <= 1 - 2 * Math.abs(x) + 1e-6, `${where} stands proud of the roof slope`);
      }
    }
  }
});

test('every composed piece is a closed, outward shell at its own size', () => {
  for (const instance of INSTANCES) {
    const shell = shellReport(relievedPositions(GEOMETRY[instance.part], instance.scale), 4);
    assert.ok(shell.closed, `${instance.what} has ${shell.openEdges} open edges`);
    const box = instance.scale[0] * instance.scale[1] * instance.scale[2];
    assert.ok(shell.volume > 0 && shell.volume <= box * (1 + 1e-6), `${instance.what} encloses ${shell.volume} of a ${box} m³ box`);
  }
});

test('every face winds toward the normal the shader derives at the part\'s reference size and at composed sizes', () => {
  // three sends an instanced normal through the inverse of the instance
  // scale; the relief builder writes normals that are exact at a reference
  // size. Check the drawn winding against that at every composed size — an
  // approximate normal may lean, but never point into the part.
  for (const instance of INSTANCES) {
    const geometry = GEOMETRY[instance.part];
    const drawn = relievedPositions(geometry, instance.scale);
    const normal = geometry.getAttribute('normal');
    const [sx, sy, sz] = instance.scale;
    for (let face = 0; face < drawn.length / 9; face += 1) {
      const p = (k: number): number[] => [drawn[(face * 3 + k) * 3], drawn[(face * 3 + k) * 3 + 1], drawn[(face * 3 + k) * 3 + 2]];
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
      const i = face * 3;
      const shaded = [normal.getX(i) / sx, normal.getY(i) / sy, normal.getZ(i) / sz];
      assert.ok(n[0] * shaded[0] + n[1] * shaded[1] + n[2] * shaded[2] > 0, `${instance.what} face ${face} faces away from its shading normal`);
    }
  }
});

test('the relief is metric: a 0.75 m parapet and a 48 m shaft carry the same cornice, a small and a large block the same shopfront', () => {
  const relief = ULTRA.relief;
  const cap = GEOMETRY.buildingCap;
  const capRelief = cap.getAttribute('ultraRelief');
  for (const scale of [[12.45, 0.75, 16.45], [5, 48, 5], [0.8, 9, 0.8], [8.8, 0.6, 8.8]] as [number, number, number][]) {
    const drawn = relievedPositions(cap, scale);
    const levels = new Set<number>();
    let flush = 0; let inset = Infinity;
    for (let i = 0; i < drawn.length / 3; i += 1) {
      const y = drawn[i * 3 + 1];
      levels.add(Number((scale[1] - y).toFixed(6)));
      // Distance of each corner in from the +x face, for corners on that side.
      const x = drawn[i * 3];
      if (x > 0) { flush = Math.max(flush, x); inset = Math.min(inset, scale[0] / 2 - x); }
    }
    // Three heights: the top, the step 0.3 m under it, and the foot.
    assert.deepEqual([...levels].sort((a, b) => a - b), [0, relief.capGrooveDrop, scale[1]].map((v) => Number(v.toFixed(6))), `cap at ${scale} has levels ${[...levels]}`);
    assert.ok(Math.abs(flush - scale[0] / 2) < 1e-6, 'the coping is not flush with the box');
    // The body's x-facing flat sits exactly `capGrooveDepth` in; the chamfer's
    // inner corner a further `capChamfer` round the corner.
    let face = -Infinity;
    for (let i = 0; i < drawn.length / 3; i += 1) {
      if (capRelief.getY(i) === 0 && drawn[i * 3 + 1] < scale[1] - 0.5 * relief.capGrooveDrop && drawn[i * 3] > 0) face = Math.max(face, drawn[i * 3]);
    }
    assert.ok(Math.abs(scale[0] / 2 - face - relief.capGrooveDepth) < 1e-6, `the body is ${scale[0] / 2 - face} in at ${scale}`);
    const cornerDepth = (() => {
      let best = Infinity;
      for (let i = 0; i < drawn.length / 3; i += 1) {
        if (drawn[i * 3 + 1] > 0.001) continue;
        best = Math.min(best, Math.hypot(scale[0] / 2 - Math.abs(drawn[i * 3]), scale[2] / 2 - Math.abs(drawn[i * 3 + 2])));
      }
      return best;
    })();
    const expected = Math.hypot(relief.capGrooveDepth, relief.capGrooveDepth + relief.capChamfer);
    assert.ok(Math.abs(cornerDepth - expected) < 1e-6, `chamfer corner ${cornerDepth} at ${scale}`);
  }

  // The shopfront: set back exactly `revealDepth` on every side, at any size.
  for (const part of ['buildingLow', 'buildingBody', 'buildingTall'] as const) {
    const geometry = GEOMETRY[part];
    const r = geometry.getAttribute('ultraRelief');
    for (const scale of [[7, 4, 7], [40, 20, 15], [14, 64, 30]] as [number, number, number][]) {
      const drawn = relievedPositions(geometry, scale);
      let deepest = 0;
      for (let i = 0; i < drawn.length / 3; i += 1) {
        if (r.getX(i) === 0 && r.getZ(i) === 0) continue;
        const inX = scale[0] / 2 - Math.abs(drawn[i * 3]);
        const inZ = scale[2] / 2 - Math.abs(drawn[i * 3 + 2]);
        const setBack = Math.min(inX, inZ);
        deepest = Math.max(deepest, setBack);
        // A recessed corner is on the ground floor, never above it.
        const floors = part === 'buildingLow' ? BUILDING_FACADE.lowRiseFloors : part === 'buildingTall' ? BUILDING_FACADE.highFloors : BUILDING_FACADE.lowFloors;
        assert.ok(drawn[i * 3 + 1] <= scale[1] / floors + 1e-6, `${part} recesses above its ground floor`);
      }
      assert.ok(Math.abs(deepest - ULTRA.relief.revealDepth) < 1e-6, `${part} at ${scale} is set back ${deepest}`);
    }
  }

  // The gable: the tympanum sits `recess` back and `frame` under the apex at any pitch.
  const gable = GEOMETRY.roofGable;
  const gableRelief = gable.getAttribute('ultraRelief');
  for (const scale of [[8, 3.4, 10], [6.2, 13, 6.2], [15.3, 2.6, 12.6]] as [number, number, number][]) {
    const drawn = relievedPositions(gable, scale);
    let apexDrop = 0; let recess = 0;
    for (let i = 0; i < drawn.length / 3; i += 1) {
      if (gableRelief.getZ(i) === 0) continue;
      recess = Math.max(recess, scale[2] / 2 - Math.abs(drawn[i * 3 + 2]));
      if (Math.abs(drawn[i * 3]) < 1e-9) apexDrop = Math.max(apexDrop, scale[1] - drawn[i * 3 + 1]);
    }
    assert.ok(Math.abs(recess - 0.12) < 1e-6, `the tympanum is ${recess} back at ${scale}`);
    assert.ok(Math.abs(apexDrop - ULTRA.relief.eaveFascia) < 1e-6, `the verge frame is ${apexDrop} deep at ${scale}`);
  }
});

test('no gable face is a sliver: every face is at least 0.1 m across at every composed size, and nothing faces up at the gable foot', () => {
  // §4's pixel rule (f ≈ 852 px at 1080 lines): under about 3 px at 30 m —
  // 0.106 m — is texture, not triangles. Gauntlet round 1 named two gable
  // slivers: the 0.13 m sill that faced 63° up (a sunlit dotted line along the
  // gable's foot) and the ridge cap's fin (a doubled ridge line). A face's
  // smallest altitude is how thin it draws seen square-on.
  const minimumWidth = 0.1;
  const gable = GEOMETRY.roofGable;
  const normal = gable.getAttribute('normal');
  let walked = 0;
  for (const instance of INSTANCES.filter((each) => each.part === 'roofGable')) {
    const drawn = relievedPositions(gable, instance.scale);
    for (let face = 0; face < drawn.length / 9; face += 1) {
      const p = (k: number): number[] => [drawn[(face * 3 + k) * 3], drawn[(face * 3 + k) * 3 + 1], drawn[(face * 3 + k) * 3 + 2]];
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const twiceArea = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
      const longest = Math.max(Math.hypot(u[0], u[1], u[2]), Math.hypot(v[0], v[1], v[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
      const width = twiceArea / longest;
      assert.ok(width >= minimumWidth, `${instance.what} face ${face} is ${width.toFixed(3)} m across`);
      walked += 1;
    }
  }
  assert.ok(walked > 0, 'no composed gable was walked');
  // The foot: a face with an edge on a gable end's eave line that tilts up
  // (but is not flat) is front-facing to every eye below the eave at under
  // its tilt — the U1 sill. Such an edge may only carry a flat, vertical or
  // down-facing face.
  const unit = gable.getAttribute('position');
  const relief = gable.getAttribute('ultraRelief');
  let footFaces = 0;
  for (let face = 0; face < unit.count / 3; face += 1) {
    const onFoot = [0, 1, 2].filter((k) => {
      const i = face * 3 + k;
      return unit.getY(i) === 0 && Math.abs(unit.getZ(i)) === 0.5 && relief.getY(i) === 0 && relief.getZ(i) === 0;
    });
    const front = onFoot.filter((k) => unit.getZ(face * 3 + k) > 0).length;
    if (front < 2 && onFoot.length - front < 2) continue;
    footFaces += 1;
    const ny = normal.getY(face * 3);
    assert.ok(ny <= 1e-6 || ny >= 1 - 1e-6, `gable face ${face} rises from a gable foot facing ${ny.toFixed(3)} up: a sill sliver`);
  }
  assert.ok(footFaces >= 4, 'the walk found no gable foot');
});

/** Which atlas page a corner samples, or null. */
function pageOf(u: number, v: number): FacadePageId | null {
  for (const [id, rect] of Object.entries(FACADE_PAGES) as [FacadePageId, typeof FACADE_PAGES.plain][]) {
    if (u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6) return id;
  }
  return null;
}

test('every facade quad lies on one atlas page, the shopfront keeps its ground page and the soffit takes the plain one', () => {
  const expected: Record<'buildingLow' | 'buildingBody' | 'buildingTall', string[]> = {
    buildingLow: ['glassLow', 'groundLow', 'plain', 'spandrel'],
    buildingBody: ['glass', 'ground', 'plain', 'spandrel'],
    buildingTall: ['glassTall', 'groundTall', 'plain', 'spandrel'],
  };
  for (const part of ['buildingLow', 'buildingBody', 'buildingTall'] as const) {
    const geometry = GEOMETRY[part];
    const uv = geometry.getAttribute('uv');
    const relief = geometry.getAttribute('ultraRelief');
    const normal = geometry.getAttribute('normal');
    assert.ok(uv !== undefined && uv.count === geometry.getAttribute('position').count, `${part} has no UVs`);
    const pages = new Set<FacadePageId>();
    for (let quad = 0; quad < uv.count / 6; quad += 1) {
      const first = pageOf(uv.getX(quad * 6), uv.getY(quad * 6));
      assert.ok(first !== null, `${part} quad ${quad} samples off every page`);
      for (let k = 1; k < 6; k += 1) assert.equal(pageOf(uv.getX(quad * 6 + k), uv.getY(quad * 6 + k)), first, `${part} quad ${quad} straddles pages`);
      pages.add(first);
      const recessed = [0, 1, 2, 3, 4, 5].some((k) => relief.getX(quad * 6 + k) !== 0 || relief.getZ(quad * 6 + k) !== 0);
      const down = normal.getY(quad * 6) < -0.5;
      if (first.startsWith('ground')) assert.ok(recessed, `${part}: the shopfront is not set back`);
      if (recessed && Math.abs(normal.getY(quad * 6)) < 0.5) assert.ok(first.startsWith('ground'), `${part}: a recessed wall is not the shopfront`);
      if (recessed && down && first !== 'plain') assert.fail(`${part}: the soffit is not on the plain page`);
    }
    assert.deepEqual([...pages].sort(), expected[part]);
  }
});

test('the building forms are deterministic', () => {
  for (const part of PARTS) {
    const a = BUILDERS[part]();
    const b = BUILDERS[part]();
    for (const name of Object.keys(a.attributes)) {
      assert.deepEqual(Array.from(a.getAttribute(name).array), Array.from(b.getAttribute(name).array), `${part} ${name} differs`);
    }
  }
});

// ---------------------------------------------------------------------------
// A16 — depth-only slot closing (gauntlet round 2, item 3)
// ---------------------------------------------------------------------------

/** A cap instance's world matrix: yawed, scaled, standing at `y`. */
function capMatrix(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): number[] {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(sx, sy, sz),
  ).elements.slice();
}

/** Metres a slot byte stands for. */
const metres = (byte: number): number => byte / 255;

test('A16: two aligned caps under 2 m apart push their facing sides to the midline, never past it, and nothing else', () => {
  // The commercial pair (plan: 18.36 × 18.63 and 16.66 × 19.58 caps, 0.895 m
  // apart along local z, 0.84 m sideways, 4.4 m apart in height), yawed as
  // the street is.
  const yaw = 1.00514;
  const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const b = along.clone().multiplyScalar(20.0).add(side.clone().multiplyScalar(-0.84));
  const matrices = [
    ...capMatrix(240.14, 30.23, 206.46, yaw, 18.36, 0.75, 18.63),
    ...capMatrix(240.14 + b.x, 34.56, 206.46 + b.z, yaw, 16.66, 0.75, 19.58),
  ];
  const slots = ultraSlotClosing(matrices, 2);
  assert.ok(slots !== null, 'the pair was not closed');
  const gap = 20.0 - 18.63 / 2 - 19.58 / 2;
  // Order −x, +x, −z, +z: A closes on +z, B on −z, and nothing else moves.
  assert.deepEqual([slots[0], slots[1], slots[2], slots[4], slots[5], slots[7]], [0, 0, 0, 0, 0, 0]);
  assert.ok(slots[3] > 0 && slots[6] > 0, 'a facing side was left open');
  for (const byte of [slots[3], slots[6]]) {
    assert.ok(metres(byte) <= gap / 2, `${metres(byte)} m passes the midline of a ${gap} m gap`);
    assert.ok(metres(byte) > gap / 2 - 1 / 255, `${metres(byte)} m stops short of the midline of a ${gap} m gap`);
  }
});

test('A16: skewed, distant, overlapping or corner-to-corner caps are left alone, and the nearest neighbour sets a side', () => {
  const box = (x: number, z: number, yaw = 0, sx = 10, sz = 10, y = 20): number[] => capMatrix(x, y, z, yaw, sx, 0.75, sz);
  const run = (...boxes: number[][]): Uint8Array | null => ultraSlotClosing(boxes.flat(), boxes.length);
  // Aligned, 1 m apart along x: closed, each by half.
  const closed = run(box(0, 0), box(11, 0));
  assert.ok(closed !== null);
  assert.equal(metres(closed[1]), Math.floor(0.5 * 255) / 255);
  assert.equal(metres(closed[4]), Math.floor(0.5 * 255) / 255);
  // The same pair yawed together is the same pair.
  const turned = new THREE.Vector3(11, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
  assert.deepEqual(Array.from(run(box(0, 0, 0.7), box(turned.x, turned.z, 0.7))!), Array.from(closed));
  // A neighbour turned 5°: a wedge, not a slot.
  assert.equal(run(box(0, 0), box(11.5, 0, 5 * Math.PI / 180)), null);
  // 2 m or more apart: the alley is wide enough to be real.
  assert.equal(run(box(0, 0), box(12, 0)), null);
  assert.equal(run(box(0, 0), box(12.5, 0)), null);
  // Touching or overlapping: no slot to close.
  assert.equal(run(box(0, 0), box(10, 0)), null);
  assert.equal(run(box(0, 0), box(9, 0)), null);
  // Offset sideways until they only share a corner's worth of run.
  assert.equal(run(box(0, 0), box(11, 8)), null);
  assert.ok(run(box(0, 0), box(11, 4)) !== null, 'half a side of run is a slot');
  // Heights never matter: a much taller or lower neighbour closes the same way.
  assert.deepEqual(Array.from(run(box(0, 0), box(11, 0, 0, 10, 10, 60))!), Array.from(closed));
  // Two neighbours on one side: the nearer one's half-gap wins.
  const two = run(box(0, 0), box(10.4, -3, 0, 10, 4), box(11.6, 3, 0, 10, 4));
  assert.ok(two !== null);
  assert.equal(metres(two[1]), Math.floor(0.2 * 255) / 255);
  // A tilted instance is never a cap, and is never dilated.
  const tilted = new THREE.Matrix4().makeRotationX(0.3).multiply(new THREE.Matrix4().makeScale(10, 0.75, 10)).setPosition(11, 20, 0).elements.slice();
  assert.equal(run(box(0, 0), tilted), null);
  // No slot anywhere: no attribute at all.
  assert.equal(ultraSlotClosing([], 0), null);
  assert.equal(SLOT_CLOSING.maxGap, 2, 'A16 says under 2 m');
});

test('A16: the dilated cap is the drawn cap with each side pushed out by its own metres, and the drawn cap does not move', () => {
  const geometry = ultraBuildingCap();
  const unit = geometry.getAttribute('position').array as ArrayLike<number>;
  const size: [number, number, number] = [18.36, 0.75, 18.63];
  const drawn = relievedPositions(geometry, size);
  const slot: [number, number, number, number] = [0, 0.2, 0.1, 0.4471];
  const dilated = slotDilatedPositions(drawn, unit, slot);
  let maxX = -Infinity; let minX = Infinity; let maxZ = -Infinity; let minZ = Infinity;
  for (let i = 0; i < dilated.length / 3; i += 1) {
    maxX = Math.max(maxX, dilated[i * 3]); minX = Math.min(minX, dilated[i * 3]);
    maxZ = Math.max(maxZ, dilated[i * 3 + 2]); minZ = Math.min(minZ, dilated[i * 3 + 2]);
    assert.equal(dilated[i * 3 + 1], drawn[i * 3 + 1], 'the depth push is sideways only');
  }
  assert.ok(Math.abs(maxX - (size[0] / 2 + 0.2)) < 1e-9 && Math.abs(minX + size[0] / 2) < 1e-9);
  assert.ok(Math.abs(maxZ - (size[2] / 2 + 0.4471)) < 1e-9 && Math.abs(minZ + size[2] / 2 + 0.1) < 1e-9);
  // Every cap corner sits on a unit face, so the shader's sign test is exact.
  for (let i = 0; i < unit.length; i += 3) {
    assert.equal(Math.abs(unit[i]), 0.5);
    assert.equal(Math.abs(unit[i + 2]), 0.5);
  }
  // The dilated shell is still closed and outward (a shadow caster).
  const report = shellReport(dilated);
  assert.ok(report.closed && report.volume > 0);
  // The colour geometry carries no slot attribute: nothing drawn moves.
  assert.equal(geometry.getAttribute('ultraSlot'), undefined);
});

test('A16: the slot patch reads one per-instance vec4 after the relief, and its depth material keys its own program', () => {
  const context = { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 };
  const plain = ultraReliefDepthMaterial(context);
  const slot = ultraSlotDepth(ultraReliefDepthMaterial(context));
  assert.ok('ULTRA_SLOT' in (slot.defines ?? {}) && 'ULTRA_RELIEF' in (slot.defines ?? {}));
  assert.ok(!('ULTRA_SLOT' in (plain.defines ?? {})));
  assert.notEqual(slot.customProgramCacheKey(), plain.customProgramCacheKey());
  const shader = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  slot.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  const source = shader.vertexShader;
  assert.equal(source.split('attribute vec4 ultraSlot;').length, 2, 'declared once');
  assert.equal(source.split('attribute vec3 ultraRelief;').length, 2, 'the relief is still there');
  const begin = source.indexOf('#include <begin_vertex>');
  const push = source.indexOf('ultraSlot.w');
  const relief = source.indexOf('transformed += ultraRelief');
  const project = source.indexOf('#include <project_vertex>');
  assert.ok(begin >= 0 && push > begin && relief > begin && push < project && relief < project, 'both pushes land between begin_vertex and project_vertex');
  assert.ok(source.indexOf('vec3 ultraLocalScale()') < push);
  // The patch refuses a shader the relief patch has not prepared.
  assert.throws(() => patchUltraSlotVertex(THREE.ShaderLib.depth.vertexShader), /ultraLocalScale/);
  assert.doesNotThrow(() => patchUltraSlotVertex(patchUltraDepthVertex(THREE.ShaderLib.depth.vertexShader)));
  plain.dispose();
  slot.dispose();
});

test('A16: the far map sees the same lids — one extra back-face depth draw of the slot bucket in the static far render, and in no other', () => {
  // Without it the static-shade lift, which reads the far map, left the
  // closed band as unlifted near-only shade: a dark smudge where the sliver
  // had been (locked capture rf4/cap-a, luma 39–57 against 75).
  const far = ultraSlotFarDepth();
  assert.equal(far.side, THREE.BackSide, 'the far map stores back faces');
  assert.equal(far.colorWrite, false);
  assert.ok('ULTRA_SLOT' in (far.defines ?? {}));
  assert.ok(!('ULTRA_RELIEF' in (far.defines ?? {})), 'the far map carries no relief');
  const shader = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  far.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  assert.equal(shader.vertexShader.split('attribute vec4 ultraSlot;').length, 2);

  const geometry = ultraBuildingCap();
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  assert.throws(() => installUltraSlotFarCaster(mesh, far), /slot attribute/);
  geometry.setAttribute(ULTRA_SLOT_ATTRIBUTE, new THREE.InstancedBufferAttribute(new Uint8Array(8), 4, true));
  installUltraSlotFarCaster(mesh, far);
  mesh.position.set(3, 0, -2);
  mesh.updateMatrixWorld();

  const calls: { material: THREE.Material; object: THREE.Object3D; group: unknown }[] = [];
  const renderer = { renderBufferDirect: (_c: unknown, _s: unknown, _g: unknown, material: THREE.Material, object: THREE.Object3D, group: unknown) => { calls.push({ material, object, group }); } } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const override = new THREE.MeshDepthMaterial({ side: THREE.BackSide });
  override.colorWrite = false;
  const farCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
  farCamera.layers.set(ULTRA_STATIC_LAYER);
  farCamera.position.set(20, 30, 10);
  farCamera.lookAt(0, 0, 0);
  farCamera.updateMatrixWorld();
  const view = new THREE.PerspectiveCamera();
  const fire = (camera: THREE.Camera, material: THREE.Material): void => {
    mesh.onBeforeRender(renderer, scene, camera, geometry, material, undefined as unknown as THREE.Group);
  };

  // The colour pass, and an override render from the view camera: nothing.
  fire(view, mesh.material as THREE.Material);
  scene.overrideMaterial = override;
  fire(view, override);
  // The static layer's camera without an override in force: nothing.
  scene.overrideMaterial = null;
  fire(farCamera, override);
  assert.equal(calls.length, 0);
  assert.equal(isUltraFarStaticRender(scene, farCamera, override), false);

  // The far render: the bucket once more, with the slot's far material.
  scene.overrideMaterial = override;
  assert.equal(isUltraFarStaticRender(scene, farCamera, override), true);
  fire(farCamera, override);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].material, far);
  assert.equal(calls[0].object, mesh);
  assert.equal(calls[0].group, null, 'renderBufferDirect tests the group against null');
  const expected = new THREE.Matrix4().multiplyMatrices(farCamera.matrixWorldInverse, mesh.matrixWorld);
  assert.deepEqual(mesh.modelViewMatrix.elements, expected.elements, 'the extra draw would use a stale model-view matrix');
  // A camera that sees the static layer and the default one is not the far map's.
  const both = farCamera.clone();
  both.layers.enable(0);
  fire(both, override);
  assert.equal(calls.length, 1);
  far.dispose();
  override.dispose();
});
