/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { trickZoneAt, validTrickZones, type TrickZone } from './trickZones.ts';

/**
 * The zone primitive, on shapes small enough to reason about by hand.
 *
 * The venue's own nine are measured in `switchbackLevel.test.ts`, against the
 * corridors and the bench's installed feature frames. What is proved here is
 * the arithmetic underneath: that an edge is inside, that a concave or
 * degenerate polygon is refused rather than silently misanswered, and that
 * both windings give the same answer — because the half-plane test reads the
 * winding off the polygon and a test written against only one of them would
 * pass on a producer that emitted the other.
 */

/** The unit square, anticlockwise in XZ. */
const SQUARE: TrickZone = {
  id: 'square',
  corners: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }],
};

/** The same square, wound the other way. */
const REVERSED: TrickZone = { id: 'reversed', corners: [...SQUARE.corners].reverse() };

test('a point inside a convex zone is found, and one outside is not', () => {
  assert.equal(trickZoneAt([SQUARE], 0.5, 0.5), 'square');
  assert.equal(trickZoneAt([SQUARE], 1.5, 0.5), null);
  assert.equal(trickZoneAt([SQUARE], 0.5, -0.5), null);
  assert.equal(trickZoneAt([SQUARE], -1e-3, 0.5), null);
});

test('edges and corners are inside — a hop taken exactly at the lip counts', () => {
  for (const [x, z] of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]] as const) {
    assert.equal(trickZoneAt([SQUARE], x, z), 'square', `edge point (${x}, ${z})`);
  }
  for (const corner of SQUARE.corners) {
    assert.equal(trickZoneAt([SQUARE], corner.x, corner.z), 'square');
  }
});

test('winding does not change the answer', () => {
  assert.equal(trickZoneAt([REVERSED], 0.5, 0.5), 'reversed');
  assert.equal(trickZoneAt([REVERSED], 0, 0.5), 'reversed');
  assert.equal(trickZoneAt([REVERSED], 1.5, 0.5), null);
});

test('a triangle is answered as a triangle, not as its bounding box', () => {
  const triangle: TrickZone = {
    id: 'triangle',
    corners: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }],
  };
  assert.equal(trickZoneAt([triangle], 0.5, 0.5), 'triangle');
  assert.equal(trickZoneAt([triangle], 2, 2), 'triangle', 'the hypotenuse is an edge');
  assert.equal(trickZoneAt([triangle], 3, 3), null, 'the far corner of the box is outside');
});

test('the first containing zone wins, and absent zones answer null', () => {
  const shifted: TrickZone = {
    id: 'shifted',
    corners: [{ x: 0.5, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0.5, z: 1 }],
  };
  assert.equal(trickZoneAt([SQUARE, shifted], 0.75, 0.5), 'square');
  assert.equal(trickZoneAt([shifted, SQUARE], 0.75, 0.5), 'shifted');
  assert.equal(trickZoneAt([shifted, SQUARE], 1.5, 0.5), 'shifted');

  assert.equal(trickZoneAt(undefined, 0.5, 0.5), null);
  assert.equal(trickZoneAt([], 0.5, 0.5), null);
});

test('a well-formed set validates', () => {
  assert.equal(validTrickZones([SQUARE, REVERSED]), true);
  assert.equal(validTrickZones([]), true, 'a venue with no trick geometry is not malformed');
});

test('a concave polygon is refused', () => {
  // An arrowhead: three corners of a square with the fourth pushed inward past
  // the diagonal. The half-plane test would call the notch "inside", which is
  // exactly the wrong answer nobody would notice.
  const concave: TrickZone = {
    id: 'concave',
    corners: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 4 }],
  };
  assert.equal(validTrickZones([concave]), false);

  // The positive control: the same four corners with the third pushed back out
  // past the diagonal is convex, and passes.
  const convex: TrickZone = {
    id: 'convex',
    corners: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 3, z: 3 }, { x: 0, z: 4 }],
  };
  assert.equal(validTrickZones([convex]), true);
});

test('degenerate polygons are refused', () => {
  const collinear: TrickZone = {
    id: 'collinear',
    corners: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }],
  };
  const repeated: TrickZone = {
    id: 'repeated',
    corners: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }],
  };
  const twoCorners: TrickZone = { id: 'two', corners: [{ x: 0, z: 0 }, { x: 1, z: 1 }] };
  const notFinite: TrickZone = {
    id: 'infinite',
    corners: [{ x: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, z: 0 }, { x: 1, z: 1 }],
  };
  const notNumber: TrickZone = {
    id: 'nan',
    corners: [{ x: 0, z: 0 }, { x: Number.NaN, z: 0 }, { x: 1, z: 1 }],
  };

  for (const zone of [collinear, repeated, twoCorners, notFinite, notNumber]) {
    assert.equal(validTrickZones([zone]), false, `${zone.id} validated`);
  }

  // And a polygon with under three corners contains nothing rather than
  // throwing, because the lookup runs on whatever a plan carries.
  assert.equal(trickZoneAt([twoCorners], 0.5, 0.5), null);
});

test('ids must be present and unique', () => {
  assert.equal(validTrickZones([{ id: '', corners: SQUARE.corners }]), false);
  assert.equal(
    validTrickZones([SQUARE, { id: 'square', corners: REVERSED.corners }]),
    false,
    'two zones may not share an id',
  );
});
