/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  centrelineAt,
  climbAt,
  collidersOf,
  gradientAt,
  headingAt,
  lateralProfile,
  leftOf,
  placeChain,
  placeGraph,
  querySegment,
  surfaceHeightAt,
  surfaceAtLateral,
  type SegmentSpec,
} from './segments.ts';

/**
 * The segment authoring model.
 *
 * Two things are being protected here. The first is the geometry: an arc's
 * centreline, the inverse map from a world point back to (s, t), and the yaw a
 * block inherits from the centreline it sits on. The second is the **frame** —
 * which way is left, which way a positive curvature turns — because that is
 * the class of error `AGENTS.md` warns about and `docs/LESSONS_LEARNED.md`
 * records: a convention that is wrong makes every test written in it agree.
 *
 * The defence against that here is to assert against the two axis facts
 * directly (`+Z is forward`, `+X is the rider's left`) rather than against
 * another function in this file. The arbiter for anything that survives that is
 * a screen-space check in the browser suite.
 */

const START = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };

test('left is +X at a zero heading, and stays ninety degrees off the nose', () => {
  const straightAhead = leftOf(0);
  assert.ok(Math.abs(straightAhead.x - 1) < 1e-12, `left.x ${straightAhead.x}`);
  assert.ok(Math.abs(straightAhead.z) < 1e-12, `left.z ${straightAhead.z}`);

  // Facing +X (a positive quarter turn, which turns left), the rider's left is
  // -Z. Derived from the axis facts, not from `leftOf` itself.
  const quarterTurn = leftOf(Math.PI / 2);
  assert.ok(Math.abs(quarterTurn.x) < 1e-12);
  assert.ok(Math.abs(quarterTurn.z + 1) < 1e-12, `left.z ${quarterTurn.z}`);
});

test('a straight segment runs along its heading and reports zero gradient', () => {
  const spec: SegmentSpec = { id: 's', length: 30, halfWidth: 5, surface: 'pavement' };
  const [placed] = placeChain([spec], START);

  assert.deepEqual(placed.exit.position, { x: 0, y: 0, z: 30 });
  assert.equal(placed.exit.headingY, 0);
  assert.equal(placed.entry.gradient, 0);
  assert.equal(placed.exit.gradient, 0);
  assert.equal(placed.exit.halfWidth, 5);
});

test('a positive curvature turns LEFT, which is toward +X', () => {
  // The one sign in this file that a world-space test could agree with while
  // being wrong, so it is checked against the axis fact rather than against
  // another helper: after a quarter turn from a +Z heading, the rider must have
  // moved toward +X and be facing +X.
  const spec: SegmentSpec = {
    id: 'arc',
    length: (Math.PI / 2) * 40,
    curvature: 1 / 40,
    halfWidth: 5,
    surface: 'pavement',
  };
  const [placed] = placeChain([spec], START);

  assert.ok(Math.abs(placed.exit.headingY - Math.PI / 2) < 1e-9, `heading ${placed.exit.headingY}`);
  assert.ok(Math.abs(placed.exit.position.x - 40) < 1e-9, `x ${placed.exit.position.x}`);
  assert.ok(Math.abs(placed.exit.position.z - 40) < 1e-9, `z ${placed.exit.position.z}`);

  // And a negative curvature is its mirror.
  const [mirrored] = placeChain([{ ...spec, curvature: -1 / 40 }], START);
  assert.ok(Math.abs(mirrored.exit.position.x + 40) < 1e-9, `x ${mirrored.exit.position.x}`);
  assert.ok(Math.abs(mirrored.exit.position.z - 40) < 1e-9, `z ${mirrored.exit.position.z}`);
});

test('the centreline and the heading agree at every station along an arc', () => {
  const spec: SegmentSpec = {
    id: 'arc', length: 60, curvature: -1 / 30, halfWidth: 5, surface: 'dirt',
  };
  const [placed] = placeChain([spec], START);

  // The tangent of the sampled centreline must equal the reported heading, or a
  // block placed at `s` faces one way and the corridor runs another.
  for (const s of [1, 15, 30, 55]) {
    const before = centrelineAt(placed.entry, spec, s - 0.001);
    const after = centrelineAt(placed.entry, spec, s + 0.001);
    const tangent = Math.atan2(after.x - before.x, after.z - before.z);
    const reported = headingAt(placed.entry, spec, s);
    assert.ok(Math.abs(tangent - reported) < 1e-4, `at s=${s}: ${tangent} against ${reported}`);
  }
});

test('an eased climb is flat at both ends, and a linear one is not', () => {
  // The property that makes these beats stitch to anything: an eased profile
  // reports a zero gradient at both sockets, so no pair of segments can join
  // with a crease.
  const eased: SegmentSpec = { id: 'e', length: 50, climb: 6, halfWidth: 5, surface: 'pavement' };
  const linear: SegmentSpec = { ...eased, id: 'l', linearClimb: true };

  assert.equal(gradientAt(eased, 0), 0);
  assert.equal(gradientAt(eased, 50), 0);
  assert.ok(gradientAt(eased, 25) > 0.15, `mid-slope ${gradientAt(eased, 25)}`);

  assert.ok(Math.abs(gradientAt(linear, 0) - Math.atan(6 / 50)) < 1e-12);
  assert.ok(Math.abs(gradientAt(linear, 50) - Math.atan(6 / 50)) < 1e-12);

  // Both reach the same elevation, which is what "eased" is supposed to mean.
  assert.ok(Math.abs(climbAt(eased, 50) - 6) < 1e-12);
  assert.ok(Math.abs(climbAt(linear, 50) - 6) < 1e-12);
  assert.equal(climbAt(eased, 0), 0);
});

test('a chain stitches exit socket to entry socket, exactly', () => {
  // Stitching at M4 is the same operation a generator performs at M12; the
  // difference is only *which* spec gets chosen. Exact equality rather than a
  // tolerance: a millimetre of drift per join is a metre after a thousand.
  const chain = placeChain([
    { id: 'a', length: 40, halfWidth: 8, surface: 'brick' },
    { id: 'b', length: 30, curvature: 1 / 25, halfWidth: 8, surface: 'pavement' },
    { id: 'c', length: 20, climb: 4, halfWidth: 6, surface: 'gravel' },
    { id: 'd', length: 20, curvature: -1 / 15, halfWidth: 6, surface: 'dirt' },
  ], START);

  for (let i = 1; i < chain.length; i += 1) {
    const previous = chain[i - 1].exit;
    const next = chain[i].entry;
    assert.deepEqual(next.position, previous.position, `join ${i} moved`);
    assert.equal(next.headingY, previous.headingY, `join ${i} kinked`);
    assert.equal(next.gradient, previous.gradient, `join ${i} creased`);
  }
});

test('a world point maps back to the station and offset it came from', () => {
  // The inverse of the centreline, which is what the rasteriser runs a quarter
  // of a million times. Round-tripping is the only honest check of it.
  for (const curvature of [0, 1 / 30, -1 / 45]) {
    const spec: SegmentSpec = { id: 'q', length: 50, curvature, halfWidth: 6, surface: 'pavement' };
    const [placed] = placeChain([spec], START);

    for (const s of [0, 7.5, 25, 49]) {
      for (const t of [0, 3, -4.5]) {
        const centre = centrelineAt(placed.entry, spec, s);
        const left = leftOf(headingAt(placed.entry, spec, s));
        const query = querySegment(placed, centre.x + left.x * t, centre.z + left.z * t);

        assert.ok(query !== null, `curvature ${curvature}, s=${s}, t=${t} fell outside bounds`);
        assert.ok(Math.abs(query.s - s) < 1e-6, `s ${query.s} against ${s}`);
        assert.ok(Math.abs(query.t - t) < 1e-6, `t ${query.t} against ${t}`);
        assert.equal(query.outside, 0, 'a point inside the corridor is not outside it');
      }
    }
  }
});

test('outside the corridor is measured with a rounded cap, not a square one', () => {
  const spec: SegmentSpec = { id: 'cap', length: 20, halfWidth: 4, surface: 'pavement' };
  const [placed] = placeChain([spec], START);

  // Straight off the side.
  const side = querySegment(placed, 6, 10);
  assert.ok(side !== null && Math.abs(side.outside - 2) < 1e-9, `side ${side?.outside}`);

  // Straight off the end.
  const end = querySegment(placed, 0, 23);
  assert.ok(end !== null && Math.abs(end.outside - 3) < 1e-9, `end ${end?.outside}`);

  // Past the corner, where a square cap would report 3 and a round one reports
  // the hypotenuse. Without this a first or last segment ends in a cliff face
  // across its whole width.
  const corner = querySegment(placed, 7, 24);
  assert.ok(corner !== null && Math.abs(corner.outside - 5) < 1e-9, `corner ${corner?.outside}`);
});

test('a point far outside a segment is rejected by its bounds', () => {
  const spec: SegmentSpec = { id: 'b', length: 20, halfWidth: 4, surface: 'pavement' };
  const [placed] = placeChain([spec], START);
  assert.equal(querySegment(placed, 500, 500), null);
});

test('bands paint across the corridor, and the rest falls through to the surface', () => {
  const spec: SegmentSpec = {
    id: 'banded',
    length: 20,
    halfWidth: 9,
    surface: 'pavement',
    bands: [
      { from: 4.5, to: 9, surface: 'grass' },
      { from: -9, to: -5.5, surface: 'gravel' },
    ],
  };

  assert.equal(surfaceAtLateral(spec, 0), 'pavement');
  assert.equal(surfaceAtLateral(spec, 4.4), 'pavement');
  assert.equal(surfaceAtLateral(spec, 4.6), 'grass');
  assert.equal(surfaceAtLateral(spec, -6), 'gravel');
  assert.equal(surfaceAtLateral(spec, -5.4), 'pavement');
});

test('a block inherits the yaw of the centreline it sits on', () => {
  // The reason `BoxCollider` carries a yaw at all: a kerb on a curved beat is
  // not axis-aligned, and an axis-aligned approximation of one is a kerb the
  // rider bounces off two metres before reaching it.
  const spec: SegmentSpec = {
    id: 'arc',
    length: (Math.PI / 2) * 40,
    curvature: 1 / 40,
    halfWidth: 8,
    surface: 'pavement',
    blocks: [
      { s: 0, t: 0, halfAlong: 1, halfLateral: 1, height: 0.2, surface: 'pavement' },
      { s: (Math.PI / 2) * 40, t: 0, halfAlong: 1, halfLateral: 1, height: 0.2, surface: 'pavement' },
    ],
  };
  const [placed] = placeChain([spec], START);
  const colliders = collidersOf(placed);

  assert.equal(colliders.length, 2);
  assert.ok(Math.abs(colliders[0].rotationY) < 1e-9, `entry yaw ${colliders[0].rotationY}`);
  assert.ok(
    Math.abs(colliders[1].rotationY - Math.PI / 2) < 1e-9,
    `exit yaw ${colliders[1].rotationY}`,
  );
});

test('a block’s top face sits at the height it was authored at', () => {
  const spec: SegmentSpec = {
    id: 'kerb',
    length: 20,
    halfWidth: 8,
    surface: 'pavement',
    blocks: [{
      s: 10, t: -6, halfAlong: 5, halfLateral: 2, height: 0.15, surface: 'pavement',
    }],
  };
  const [placed] = placeChain([spec], START);
  const [kerb] = collidersOf(placed);

  const top = kerb.centre.y + kerb.halfExtents.y;
  assert.ok(Math.abs(top - 0.15) < 1e-12, `top face at ${top}`);
  // Negative t is the rider's right, which at a zero heading is -X.
  assert.ok(Math.abs(kerb.centre.x + 6) < 1e-12, `placed at x = ${kerb.centre.x}`);
  assert.ok(Math.abs(kerb.centre.z - 10) < 1e-12, `placed at z = ${kerb.centre.z}`);
  // Local +X is lateral and local +Z is along, which is what the yaw maps.
  assert.equal(kerb.halfExtents.x, 2);
  assert.equal(kerb.halfExtents.z, 5);
});

test('a block on a climb sits on the climb, not on the entry elevation', () => {
  const spec: SegmentSpec = {
    id: 'ramp',
    length: 40,
    climb: 8,
    linearClimb: true,
    halfWidth: 6,
    surface: 'pavement',
    blocks: [{ s: 20, t: 0, halfAlong: 1, halfLateral: 1, height: 0.2, surface: 'pavement' }],
  };
  const [placed] = placeChain([spec], START);
  const [block] = collidersOf(placed);

  const top = block.centre.y + block.halfExtents.y;
  assert.ok(Math.abs(top - 4.2) < 1e-9, `top face at ${top}, expected 4.2`);
});

// ---------------------------------------------------------------------------
// The cross section (M7): crown, cross-slope, and the blend that arrives
// ---------------------------------------------------------------------------

test('a crown falls to the gutter and is symmetric about the centreline', () => {
  const spec: SegmentSpec = {
    id: 'road', length: 60, halfWidth: 9, crown: 0.12, surface: 'pavement',
  };
  const [placed] = placeChain([spec], START);
  const mid = 30;

  assert.equal(lateralProfile(spec, mid, 0), 0, 'the crown moved the centreline');
  const left = lateralProfile(spec, mid, 9);
  const right = lateralProfile(spec, mid, -9);
  assert.ok(Math.abs(left - right) < 1e-12, 'the crown is not symmetric');
  assert.ok(Math.abs(left + 0.12) < 1e-9, `the gutter is at ${left}, expected -0.12`);
  // Quadratic, so it is gentle in the middle of the road and steepest at the
  // edge — which is what a real crown is and why water leaves it.
  assert.ok(Math.abs(lateralProfile(spec, mid, 4.5) + 0.03) < 1e-9, 'the fall is not quadratic');
  assert.equal(surfaceHeightAt(placed.entry, spec, mid, 0), 0);
});

test('a negative crown hollows the corridor into a channel', () => {
  // One number, both shapes — which is what makes the drainage swale in the
  // slice one segment rather than a special case in the builder.
  const spec: SegmentSpec = {
    id: 'swale', length: 60, halfWidth: 3, crown: -0.9, surface: 'pavement',
  };
  assert.ok(lateralProfile(spec, 30, 3) > 0.85, 'the banks do not rise');
  assert.ok(lateralProfile(spec, 30, -3) > 0.85, 'the far bank does not rise');
  assert.equal(lateralProfile(spec, 30, 0), 0, 'the floor is not the centreline');
});

test('a cross-slope raises the rider’s LEFT for a positive angle', () => {
  // The axis fact, not another function in this file: +X is the rider's left,
  // and a berm for a left-hand turn therefore has a NEGATIVE cross-slope.
  const spec: SegmentSpec = {
    id: 'berm', length: 40, halfWidth: 5, crossSlope: 0.2, surface: 'dirt',
  };
  const [placed] = placeChain([spec], START);
  const mid = 20;
  assert.ok(lateralProfile(spec, mid, 5) > 0, 'positive t did not rise');
  assert.ok(lateralProfile(spec, mid, -5) < 0, 'negative t did not fall');
  // At a zero heading, positive t is +X.
  const high = centrelineAt(placed.entry, spec, mid);
  assert.ok(surfaceHeightAt(placed.entry, spec, mid, 5) > high.y);
});

test('the cross section blends in, so a socket is never a kerb', () => {
  // A crown that switches on at a socket is a step, and `EucController.advance`
  // is right to charge for it: a flat corridor predicts nothing about a crowned
  // one. Blended, the change per metre stays far under `TERRAIN.curbThreshold`.
  const spec: SegmentSpec = {
    id: 'road', length: 60, halfWidth: 9, crown: 0.12, surface: 'pavement',
  };
  assert.equal(lateralProfile(spec, 0, 9), 0, 'the entry socket is already crowned');
  assert.equal(lateralProfile(spec, 60, 9), 0, 'the exit socket is already crowned');

  let worst = 0;
  for (let s = 0; s < 60; s += 0.25) {
    worst = Math.max(worst, Math.abs(lateralProfile(spec, s + 1, 9) - lateralProfile(spec, s, 9)));
  }
  assert.ok(worst < 0.04, `the crown arrives at ${worst.toFixed(3)} m per metre`);
});

test('the profile is clamped at the corridor edge, so a bank never stands up', () => {
  const spec: SegmentSpec = {
    id: 'berm', length: 40, halfWidth: 5, crossSlope: 0.3, surface: 'dirt',
  };
  const edge = lateralProfile(spec, 20, 5);
  assert.equal(lateralProfile(spec, 20, 40), edge, 'the bank kept banking past the corridor');
});

// ---------------------------------------------------------------------------
// Branches (M7): what makes a fork, a pocket, and a drop possible
// ---------------------------------------------------------------------------

const STRAIGHT = (id: string, length = 20): SegmentSpec => ({
  id, length, halfWidth: 4, surface: 'pavement',
});

test('a branch leaves its parent at the point, height and heading it names', () => {
  const placed = placeGraph({
    main: [{ id: 'road', length: 100, halfWidth: 8, surface: 'pavement' }],
    branches: [{
      from: 'road',
      atDistance: 40,
      lateralOffset: 6,
      elevationOffset: -1.5,
      headingOffset: 0.5,
      specs: [STRAIGHT('spur')],
    }],
  }, START);

  const spur = placed.find((each) => each.spec.id === 'spur');
  assert.ok(spur !== undefined);
  // At a zero heading, +6 lateral is +X and the point is 40 m along +Z.
  assert.ok(Math.abs(spur.entry.position.x - 6) < 1e-12, `x = ${spur.entry.position.x}`);
  assert.ok(Math.abs(spur.entry.position.z - 40) < 1e-12, `z = ${spur.entry.position.z}`);
  assert.ok(Math.abs(spur.entry.position.y + 1.5) < 1e-12, `y = ${spur.entry.position.y}`);
  assert.ok(Math.abs(spur.entry.headingY - 0.5) < 1e-12, `heading = ${spur.entry.headingY}`);
});

test('a branch defaults to leaving from its parent’s exit socket', () => {
  const placed = placeGraph({
    main: [{ id: 'road', length: 100, halfWidth: 8, surface: 'pavement' }],
    branches: [{ from: 'road', specs: [STRAIGHT('onward')] }],
  }, START);
  const onward = placed.find((each) => each.spec.id === 'onward');
  const road = placed.find((each) => each.spec.id === 'road');
  assert.ok(onward !== undefined && road !== undefined);
  assert.deepEqual(onward.entry.position, road.exit.position);
  assert.equal(onward.entry.headingY, road.exit.headingY);
});

test('a branch may hang off an earlier branch, and never off a later one', () => {
  const placed = placeGraph({
    main: [{ id: 'road', length: 60, halfWidth: 8, surface: 'pavement' }],
    branches: [
      { from: 'road', specs: [STRAIGHT('alley')] },
      { from: 'alley', lateralOffset: 4, specs: [STRAIGHT('ledge')] },
    ],
  }, START);
  assert.equal(placed.length, 3);

  assert.throws(() => placeGraph({
    main: [{ id: 'road', length: 60, halfWidth: 8, surface: 'pavement' }],
    branches: [
      { from: 'ledge', specs: [STRAIGHT('alley')] },
      { from: 'alley', specs: [STRAIGHT('ledge')] },
    ],
  }, START), /unknown or not-yet-placed/);
});

test('a duplicate segment id is refused rather than silently shadowed', () => {
  assert.throws(() => placeGraph({
    main: [STRAIGHT('road'), STRAIGHT('road')],
  }, START), /duplicate segment id/);
  assert.throws(() => placeGraph({
    main: [STRAIGHT('road')],
    branches: [{ from: 'road', specs: [STRAIGHT('road')] }],
  }, START), /duplicate segment id/);
});

test('a branch off a crowned parent starts in the gutter, not on the crown', () => {
  const placed = placeGraph({
    main: [{ id: 'road', length: 80, halfWidth: 9, crown: 0.12, surface: 'pavement' }],
    branches: [{ from: 'road', atDistance: 40, lateralOffset: 9, specs: [STRAIGHT('spur')] }],
  }, START);
  const spur = placed.find((each) => each.spec.id === 'spur');
  assert.ok(spur !== undefined);
  assert.ok(Math.abs(spur.entry.position.y + 0.12) < 1e-9, `y = ${spur.entry.position.y}`);
});

test('a plain chain and a graph with no branches place the same segments', () => {
  const specs = [STRAIGHT('a', 30), STRAIGHT('b', 40)];
  const chain = placeChain(specs, START);
  const graph = placeGraph({ main: specs }, START);
  assert.equal(graph.length, chain.length);
  for (let i = 0; i < chain.length; i += 1) {
    assert.deepEqual(graph[i].entry, chain[i].entry);
    assert.deepEqual(graph[i].exit, chain[i].exit);
  }
});
