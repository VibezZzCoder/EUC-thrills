/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PROP_SIZES } from '../data/props.ts';
import { ROUTE_SIGN_FACE } from '../data/routeSigns.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { ULTRA_PART_COSTS } from './ultra/ultraCatalog.ts';
import { routeSignInkCost, routeSignInkGeometry, routeSignPlateGeometry, routeSignStrokes } from './routeSignGeometry.ts';

function facesOutward(points: ArrayLike<number>): boolean {
  for (let index = 0; index < points.length; index += 9) {
    const abx = points[index + 3]! - points[index]!, aby = points[index + 4]! - points[index + 1]!;
    const acx = points[index + 6]! - points[index]!, acy = points[index + 7]! - points[index + 1]!;
    if (!(abx * acy - aby * acx > 0)) return false;
  }
  return points.length > 0;
}

function closedOutward(points: ArrayLike<number>): boolean {
  const edges = new Map<string, number>();
  let volume6 = 0;
  const key = (index: number) => [points[index]!, points[index + 1]!, points[index + 2]!]
    .map(value => Math.round(value * 1e6)).join(',');
  for (let index = 0; index < points.length; index += 9) {
    const ids = [key(index), key(index + 3), key(index + 6)];
    for (let side = 0; side < 3; side += 1) {
      const edge = `${ids[side]}>${ids[(side + 1) % 3]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    const ax = points[index]!, ay = points[index + 1]!, az = points[index + 2]!;
    const bx = points[index + 3]!, by = points[index + 4]!, bz = points[index + 5]!;
    const cx = points[index + 6]!, cy = points[index + 7]!, cz = points[index + 8]!;
    volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume6 > 0 && edges.size > 0 && [...edges].every(([edge, count]) => {
    const [from, to] = edge.split('>');
    return count === 1 && edges.get(`${to}>${from}`) === 1;
  });
}

test('ink is outward, inside the route boards, and in front of the entire pole', () => {
  const shape = PROP_SIZES.signpost;
  for (const upper of ['TECH', 'AIR'] as const) {
    const geometry = routeSignInkGeometry(upper);
    try {
      const points = geometry.getAttribute('position').array;
      assert.ok(facesOutward(points));
      const reversed = Array.from(points);
      for (let index = 0; index < reversed.length; index += 9) {
        [reversed[index + 3], reversed[index + 6]] = [reversed[index + 6]!, reversed[index + 3]!];
        [reversed[index + 4], reversed[index + 7]] = [reversed[index + 7]!, reversed[index + 4]!];
      }
      assert.equal(facesOutward(reversed), false, 'inward ink control passed');
      for (let index = 0; index < points.length; index += 3) {
        const x = points[index]!, y = points[index + 1]!, z = points[index + 2]!;
        const upperRow = y > (ROUTE_SIGN_FACE.upperCentre + ROUTE_SIGN_FACE.lowerCentre) / 2;
        const centre = upperRow ? ROUTE_SIGN_FACE.upperCentre : ROUTE_SIGN_FACE.lowerCentre;
        const width = upperRow ? ROUTE_SIGN_FACE.upperWidth : ROUTE_SIGN_FACE.lowerWidth;
        const height = ROUTE_SIGN_FACE.height;
        assert.ok(x > -width / 2 && x < width / 2);
        assert.ok(Math.abs(y - centre) < height / 2);
        assert.ok(Math.abs(z - (shape.postRadius + shape.plateThickness + 0.002)) < 1e-7);
        assert.ok(z > shape.postRadius + shape.plateThickness,
          'post or plate can obscure printed letters');
      }
      const cost = routeSignInkCost(upper);
      assert.equal(points.length / 9, cost.triangles);
      assert.equal(Object.values(geometry.attributes).reduce((sum, attr) => sum + attr.array.byteLength, 0), cost.geometryBytes);
      assert.equal(cost.triangles, upper === 'TECH' ? 90 : 76);
      const part = upper === 'TECH' ? 'routeSignTech' : 'routeSignAir';
      assert.equal(PART_COSTS[part].triangles, cost.triangles);
      assert.equal(ULTRA_PART_COSTS[part].triangles, cost.triangles);
      assert.equal(PART_COSTS[part].castsShadow, false);
    } finally { geometry.dispose(); }
  }
});

test('larger centred route boards fit the unchanged physical source reservation', () => {
  const geometry = routeSignPlateGeometry();
  try {
    const points = geometry.getAttribute('position');
    assert.equal(points.count / 3, 24);
    assert.equal(PART_COSTS.routeSignPlate.triangles, 24);
    assert.equal(ULTRA_PART_COSTS.routeSignPlate.triangles, 24);
    assert.ok(closedOutward(points.array), 'plate shell is open or inward');
    const broken = Array.from(points.array);
    for (let channel = 0; channel < 3; channel += 1) {
      [broken[3 + channel], broken[6 + channel]] = [broken[6 + channel]!, broken[3 + channel]!];
    }
    assert.equal(closedOutward(broken), false, 'flipped board face control passed');
    assert.equal(closedOutward(Array.from(points.array).slice(9)), false, 'missing board face control passed');
    for (let index = 0; index < points.count; index += 1) {
      assert.ok(Math.hypot(points.getX(index), points.getZ(index)) < PROP_SIZES.signpost.plateWidth);
    }
    assert.ok(Math.abs(geometry.boundingBox!.min.x + ROUTE_SIGN_FACE.upperWidth / 2) < 1e-7);
    assert.ok(Math.abs(geometry.boundingBox!.max.x - ROUTE_SIGN_FACE.upperWidth / 2) < 1e-7);
    assert.ok(geometry.boundingBox!.min.z >= PROP_SIZES.signpost.postRadius - 1e-7,
      'boards must mount in front of the pole');
    assert.ok(geometry.boundingBox!.max.y < PROP_SIZES.signpost.postHeight);
    assert.ok(geometry.boundingBox!.min.y >= PROP_SIZES.signpost.lowerCentre
      - PROP_SIZES.signpost.lowerHeight / 2);
    assert.ok(ROUTE_SIGN_FACE.upperCentre - ROUTE_SIGN_FACE.lowerCentre
      > ROUTE_SIGN_FACE.height, 'board faces overlap');
  } finally { geometry.dispose(); }
});

test('TECH/AIR arrows point left, SAFE points right; labels remain separate from arrows', () => {
  for (const upper of ['TECH', 'AIR'] as const) {
    const strokes = routeSignStrokes(upper);
    for (const row of ['upper', 'lower'] as const) {
      const rows = strokes.filter(stroke => stroke.row === row);
      const shaft = rows.find(stroke => stroke.kind === 'arrow')!;
      const direction = Math.sign(shaft.points[1]![0] - shaft.points[0]![0]);
      assert.equal(direction, row === 'upper' ? -1 : 1);
      assert.ok(shaft.points[1]![1] > shaft.points[0]![1], 'arrow points back down the lap');
      const labelRight = Math.max(...rows.filter(stroke => stroke.kind === 'label')
        .flatMap(stroke => stroke.points.map(point => point[0] + stroke.width / 2)));
      const arrowLeft = Math.min(...rows.filter(stroke => stroke.kind === 'arrow')
        .flatMap(stroke => stroke.points.map(point => point[0] - stroke.width / 2)));
      assert.ok(arrowLeft - labelRight > 0.08, 'arrow crowds the short label');
    }
  }
});
