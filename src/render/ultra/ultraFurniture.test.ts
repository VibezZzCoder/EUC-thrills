/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import { PART_COSTS } from '../../data/renderCost.ts';
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_SPREADS } from '../../data/props.ts';
import {
  earClip,
  ultraBenchMetal,
  ultraBenchWood,
  ultraFenceBay,
  ultraLampHead,
  ultraLampPost,
  ultraLitterBin,
  ultraSignPlate,
  ultraSignPost,
  ultraTyreStack,
} from './ultraFurniture.ts';
import { channelMeans, shellReport } from './ultraKit.ts';
import type { PartId } from '../props.ts';

/**
 * The Ultra street furniture, measured (`docs/M39_ULTRA.md` §4, T7).
 *
 * Every limit below is read from `data/props.ts` — the placement and
 * collision data the forms must stay inside — or from §4's triangle table,
 * never restated as a free number. A richer bench is only allowed to be richer
 * inside the box a rider collides with.
 */

interface Extents {
  min: [number, number, number];
  max: [number, number, number];
  /** Widest horizontal distance from the prop's own axis. */
  radius: number;
}

function extents(geometry: THREE.BufferGeometry): Extents {
  const position = geometry.getAttribute('position');
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (let i = 0; i < position.count; i += 1) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
    radius = Math.max(radius, Math.hypot(p[0], p[2]));
  }
  return { min, max, radius };
}

const EPSILON = 1e-6;

/** §4's per-instance ceilings, and the ordinary part each replaces. */
const FORMS: readonly { part: PartId; build: () => THREE.BufferGeometry; ceiling: number }[] = [
  { part: 'lampPost', build: ultraLampPost, ceiling: 100 },
  { part: 'lampHead', build: ultraLampHead, ceiling: 44 },
  { part: 'fenceBay', build: ultraFenceBay, ceiling: 56 },
  { part: 'tyreStack', build: ultraTyreStack, ceiling: 576 },
  { part: 'benchWood', build: ultraBenchWood, ceiling: 72 },
  { part: 'benchMetal', build: ultraBenchMetal, ceiling: 48 },
  { part: 'litterBin', build: ultraLitterBin, ceiling: 96 },
  { part: 'signPost', build: ultraSignPost, ceiling: 32 },
  { part: 'signPlate', build: ultraSignPlate, ceiling: 40 },
];

test('every furniture form spends triangles inside its §4 ceiling', () => {
  for (const { part, build, ceiling } of FORMS) {
    const triangles = build().getAttribute('position').count / 3;
    assert.ok(Number.isInteger(triangles), `${part} is not whole triangles`);
    assert.ok(triangles <= ceiling, `${part} spends ${triangles} triangles against a ceiling of ${ceiling}`);
    assert.ok(triangles > PART_COSTS[part].triangles, `${part} (${triangles}) is no richer than the ordinary ${PART_COSTS[part].triangles}`);
  }
});

test('every furniture form is a closed, outward-wound shell', () => {
  // Ultra parts cast into a 4096 map, and a hole in a shell is a hole in its shadow.
  for (const { part, build } of FORMS) {
    const shell = shellReport(build().getAttribute('position').array);
    assert.ok(shell.closed, `${part} has ${shell.openEdges} unpartnered edges`);
    assert.ok(shell.volume > 0, `${part} is wound inward (volume ${shell.volume})`);
  }
});

test('every furniture form carries a colour attribute averaging exactly one per channel, and sane normals', () => {
  for (const { part, build } of FORMS) {
    const geometry = build();
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    const normal = geometry.getAttribute('normal');
    assert.ok(colour !== undefined, `${part} has no colour attribute — it would render black`);
    assert.equal(colour.count, position.count);
    for (const mean of channelMeans(geometry)) assert.ok(Math.abs(mean - 1) < 1e-6, `${part} channel mean ${mean}`);
    for (let i = 0; i < colour.count; i += 1) {
      assert.ok(colour.getX(i) > 0.3 && colour.getY(i) > 0.3 && colour.getZ(i) > 0.3, `${part} corner ${i} is near black`);
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      assert.ok(Math.abs(length - 1) < 1e-4, `${part} normal ${i} has length ${length}`);
    }
    // Every face's authored normals agree with its winding, smooth or flat.
    for (let face = 0; face < position.count / 3; face += 1) {
      const a = face * 3;
      const p = (i: number): number[] => [position.getX(i), position.getY(i), position.getZ(i)];
      const [pa, pb, pc] = [p(a), p(a + 1), p(a + 2)];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-10) continue;
      let dot = 0;
      for (let k = 0; k < 3; k += 1) {
        dot += n[0] * normal.getX(a + k) + n[1] * normal.getY(a + k) + n[2] * normal.getZ(a + k);
      }
      assert.ok(dot > 0, `${part} face ${face} winds against its normals`);
    }
  }
});

test('the lamp standard tops out at exactly 4.6 m, inside its footprint at the ground and its spread above', () => {
  const lamp = PROP_SIZES.lampPost;
  const post = extents(ultraLampPost());
  const head = extents(ultraLampHead());
  assert.equal(Number(post.max[1].toFixed(6)), lamp.postHeight, 'the lamp is not 4.6 m tall');
  assert.ok(head.max[1] <= lamp.postHeight + EPSILON, 'the lantern stands above the standard');
  assert.ok(post.min[1] >= -EPSILON && head.min[1] > 2, 'something hangs below the ground or the lantern is low');
  const spread = (PROP_SPREADS.lampPost as { radius: number }).radius;
  assert.ok(post.radius <= spread + EPSILON, `the arm reaches ${post.radius}`);
  assert.ok(head.radius <= spread + EPSILON, `the lantern reaches ${head.radius} of a ${spread} m spread`);
  // Where a rider can be, the standard is no wider than the footprint the
  // corridor guard reads.
  const footprint = (PROP_FOOTPRINTS.lampPost as { radius: number }).radius;
  const geometry = ultraLampPost();
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > 2.5) continue;
    assert.ok(Math.hypot(position.getX(i), position.getZ(i)) <= footprint + EPSILON, `the standard is ${Math.hypot(position.getX(i), position.getZ(i))} wide at ${position.getY(i)} m`);
  }
  // The arm arrives at the lantern: its lowest point over the lantern dips into the hood.
  let armFloor = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getZ(i) > lamp.headReach - 0.05) armFloor = Math.min(armFloor, position.getY(i));
  }
  assert.ok(armFloor < head.max[1], `the arm ends at ${armFloor}, above the lantern's ${head.max[1]}`);
  assert.ok(post.max[2] > lamp.headReach - EPSILON, 'the arm does not reach over the lantern');
});

test('the fence bay keeps the ±0.055 m footprint, its 2.4 m bay and its 1.02 m post', () => {
  const fence = PROP_SIZES.fenceBay;
  const box = PROP_FOOTPRINTS.fenceBay as { halfX: number; halfZ: number };
  const bay = extents(ultraFenceBay());
  assert.ok(bay.min[0] >= -box.halfX - EPSILON && bay.max[0] <= box.halfX + EPSILON, `the bay is ${bay.min[0]}..${bay.max[0]} across`);
  assert.equal(Number(bay.max[0].toFixed(6)), box.halfX, 'the post no longer fills its footprint');
  assert.ok(bay.min[2] >= -box.halfZ - EPSILON && bay.max[2] <= box.halfZ + EPSILON);
  assert.equal(Number(bay.max[1].toFixed(6)), fence.postHeight, 'the post is not 1.02 m');
  assert.equal(Number(bay.min[1].toFixed(6)), 0);
});

test('the tyre stack is four tyres, r 0.44 and 0.84 m tall exactly, with its waist', () => {
  const stack = PROP_SIZES.tyreStack;
  const geometry = ultraTyreStack();
  const box = extents(geometry);
  assert.equal(Number(box.radius.toFixed(6)), stack.radius, `the stack is ${box.radius} wide`);
  assert.equal(Number(box.max[1].toFixed(6)), stack.tyres * stack.tyreHeight, 'the stack is not 0.84 m tall');
  assert.equal(Number(box.min[1].toFixed(6)), 0);
  const position = geometry.getAttribute('position');
  const perTyre = position.count / stack.tyres;
  for (let tyre = 0; tyre < stack.tyres; tyre += 1) {
    let widest = 0;
    for (let i = tyre * perTyre; i < (tyre + 1) * perTyre; i += 1) widest = Math.max(widest, Math.hypot(position.getX(i), position.getZ(i)));
    const expected = stack.radius * (tyre % 2 === 1 ? stack.waist : 1);
    assert.ok(Math.abs(widest - expected) < 1e-6, `tyre ${tyre} is ${widest} wide, not ${expected}`);
    // Each tyre is its own closed torus.
    const slice = Array.from(position.array).slice(tyre * perTyre * 3, (tyre + 1) * perTyre * 3);
    assert.ok(shellReport(slice).closed, `tyre ${tyre} is not closed`);
  }
});

test('the bench stays inside its 1.85 × 0.46 × 0.86 m box, with slats that have gaps', () => {
  const bench = PROP_SIZES.bench;
  const box = PROP_FOOTPRINTS.bench as { halfX: number; halfZ: number };
  const top = bench.seatHeight + bench.backHeight;
  for (const geometry of [ultraBenchWood(), ultraBenchMetal()]) {
    const e = extents(geometry);
    assert.ok(e.min[0] >= -box.halfX - EPSILON && e.max[0] <= box.halfX + EPSILON, `x ${e.min[0]}..${e.max[0]}`);
    assert.ok(e.min[2] >= -box.halfZ - EPSILON && e.max[2] <= box.halfZ + EPSILON, `z ${e.min[2]}..${e.max[2]}`);
    assert.ok(e.min[1] >= -EPSILON && e.max[1] <= top + EPSILON, `y ${e.min[1]}..${e.max[1]}`);
  }
  assert.equal(Number(extents(ultraBenchWood()).max[1].toFixed(6)), Number(top.toFixed(6)), 'the back no longer reaches 0.86 m');
  assert.equal(Number(extents(ultraBenchMetal()).min[1].toFixed(6)), 0, 'the legs do not stand on the ground');

  // Covered intervals along one axis for the triangles in a height band.
  const covered = (geometry: THREE.BufferGeometry, axis: number, from: number, to: number): [number, number][] => {
    const position = geometry.getAttribute('position');
    const spans: [number, number][] = [];
    for (let face = 0; face < position.count / 3; face += 1) {
      const ys = [0, 1, 2].map((k) => position.getY(face * 3 + k));
      if (Math.min(...ys) < from || Math.max(...ys) > to) continue;
      const values = [0, 1, 2].map((k) => (axis === 1 ? position.getY(face * 3 + k) : position.getZ(face * 3 + k)));
      spans.push([Math.min(...values), Math.max(...values)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last !== undefined && span[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    return merged;
  };
  const wood = ultraBenchWood();
  const seat = covered(wood, 2, 0.4, 0.52);
  assert.equal(seat.length, 4, `the seat reads as ${seat.length} slats: ${JSON.stringify(seat)}`);
  const back = covered(wood, 1, 0.53, top + EPSILON);
  assert.equal(back.length, 3, `the back reads as ${back.length} slats: ${JSON.stringify(back)}`);
});

test('the litter bin rolls its rim out to the 0.302 m footprint and tops out at 0.89 m', () => {
  const bin = PROP_SIZES.litterBin;
  const footprint = (PROP_FOOTPRINTS.litterBin as { radius: number }).radius;
  const e = extents(ultraLitterBin());
  assert.equal(Number(e.radius.toFixed(6)), Number(footprint.toFixed(6)), `the rim reaches ${e.radius}`);
  assert.equal(Number(e.max[1].toFixed(6)), Number((bin.height + bin.rimHeight).toFixed(6)));
  assert.equal(Number(e.min[1].toFixed(6)), 0);
  // The mouth is darker than the body, so the bin reads as open.
  const geometry = ultraLitterBin();
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  let mouth = Infinity; let body = 0;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > e.max[1] - 1e-6) mouth = Math.min(mouth, colour.getX(i));
    if (position.getY(i) < 0.5) body = Math.max(body, colour.getX(i));
  }
  assert.ok(mouth < body * 0.7, `the mouth tone ${mouth} does not read against the body's ${body}`);
});

test('the fingerpost stands 2.45 m and its arrow-tipped fingers stay inside the 1.05 m spread', () => {
  const sign = PROP_SIZES.signpost;
  const post = extents(ultraSignPost());
  assert.equal(Number(post.max[1].toFixed(6)), sign.postHeight);
  assert.ok(post.radius <= sign.postRadius + EPSILON);
  const plates = ultraSignPlate();
  const e = extents(plates);
  const spread = (PROP_SPREADS.signpost as { radius: number }).radius;
  assert.ok(e.radius <= spread + EPSILON, `the fingers reach ${e.radius}`);
  assert.ok(e.min[1] >= sign.lowerCentre - sign.lowerHeight / 2 - EPSILON);
  assert.ok(e.max[1] <= sign.plateCentre + sign.plateHeight / 2 + EPSILON);
  assert.ok(Math.abs(e.max[2]) <= sign.plateThickness / 2 + EPSILON);
  // An arrow, not a paddle: the point is on the finger's centre line, and the
  // finger's top and bottom edges stop short of it.
  const position = plates.getAttribute('position');
  let tip = 0; let tipY = 0; let edge = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i); const y = position.getY(i);
    if (x > tip) { tip = x; tipY = y; }
    if (Math.abs(y - (sign.plateCentre + sign.plateHeight / 2)) < 1e-6) edge = Math.max(edge, x);
  }
  assert.ok(Math.abs(tipY - sign.plateCentre) < 1e-6, `the point is at ${tipY}, off the finger's centre line`);
  assert.ok(edge < tip - 0.05, 'the finger has no arrow tip');
});

test('earClip triangulates a simple outline with a notch into n − 2 triangles covering its area', () => {
  // The bench leg's shape: a concave corner the clipper must not cut across.
  const outline: [number, number][] = [[0.2, 0], [0.175, 0.425], [-0.17, 0.425], [-0.195, 0.86], [-0.23, 0.86], [-0.225, 0], [-0.02, 0.26]];
  const area = (points: readonly (readonly [number, number])[]): number => {
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const [ax, ay] = points[i]; const [bx, by] = points[(i + 1) % points.length];
      sum += ax * by - bx * ay;
    }
    return sum / 2;
  };
  const ccw = area(outline) > 0 ? outline : [...outline].reverse();
  const triangles = earClip(ccw);
  assert.equal(triangles.length, ccw.length - 2);
  let total = 0;
  for (const [a, b, c] of triangles) {
    const piece = area([ccw[a], ccw[b], ccw[c]]);
    assert.ok(piece > 0, 'a clipped triangle is inverted');
    total += piece;
  }
  assert.ok(Math.abs(total - area(ccw)) < 1e-12, 'the triangles do not tile the outline');
});

test('the furniture forms are deterministic', () => {
  for (const { part, build } of FORMS) {
    const a = build();
    const b = build();
    for (const name of ['position', 'normal', 'color']) {
      assert.deepEqual(Array.from(a.getAttribute(name).array), Array.from(b.getAttribute(name).array), `${part} ${name} differs between builds`);
    }
  }
});
