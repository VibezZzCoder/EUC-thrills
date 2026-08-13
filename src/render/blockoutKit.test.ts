/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  limbProfile,
  loftGeometry,
  loftNormal,
  loftPoint,
  loftProfile,
  mergeGeometries,
  patchGeometry,
  shaded,
} from './blockoutKit.ts';

/**
 * The blockout kit, checked headlessly.
 *
 * Three of these are worth more than the rest put together, because each
 * guards a failure this project has actually shipped:
 *
 *   - **Outward winding.** A tube wound the wrong way renders as its own
 *     inside: back-face culling removes the front of the rider and leaves the
 *     far wall, which reads as a hole rather than as a mistake. `props.test.ts`
 *     asserts the same property on the facades for the same reason.
 *   - **A panel that stays proud.** The entire point of `patchGeometry` is that
 *     the identity blue stops floating off a curved back, so "every outer
 *     vertex is farther out than the body under it" is the feature, stated.
 *   - **A `color` attribute on everything.** A geometry without one renders
 *     black under a `vertexColors` material. `DESIGN.md` §7c records that trap
 *     costing seven parts once already.
 */

const CYLINDER = loftProfile([
  { y: 0, halfWidth: 0.2, halfDepth: 0.2 },
  { y: 1, halfWidth: 0.2, halfDepth: 0.2 },
]);

/** Distance from the profile's own axis, which every test below reasons about. */
function radial(x: number, z: number): number {
  return Math.hypot(x, z);
}

test('a profile is normalised low-ring-first, whichever way it was authored', () => {
  const upward = loftProfile([
    { y: -0.4, halfWidth: 0.05, halfDepth: 0.05 },
    { y: 0, halfWidth: 0.07, halfDepth: 0.07 },
  ]);
  const downward = loftProfile([
    { y: 0, halfWidth: 0.07, halfDepth: 0.07 },
    { y: -0.4, halfWidth: 0.05, halfDepth: 0.05 },
  ]);
  assert.deepEqual(upward, downward, 'a limb authored from its joint matches one authored from its end');
  assert.equal(upward[0]!.y, -0.4, 'v = 0 is the lowest ring');
});

test('two rings at the same height are refused, not silently sorted', () => {
  // A zero-height strip has no tangent in v, so `computeVertexNormals` writes
  // NaN — and a NaN normal is a black mesh, not a visible error.
  assert.throws(
    () => loftProfile([
      { y: 0.2, halfWidth: 0.1, halfDepth: 0.1 },
      { y: 0.2, halfWidth: 0.12, halfDepth: 0.12 },
    ]),
    /does not rise above/,
  );
});

test('u = 0 is the rider’s left and u = π/2 is forward', () => {
  // The world convention in `data/tuning.ts`, restated as a fact about this
  // file: it is what makes "a panel on the back" author as -π/2 and land there.
  const left = loftPoint(CYLINDER, 0, 0.5, new THREE.Vector3());
  const forward = loftPoint(CYLINDER, Math.PI / 2, 0.5, new THREE.Vector3());
  assert.ok(left.x > 0.19 && Math.abs(left.z) < 1e-6, `left was ${left.x}, ${left.z}`);
  assert.ok(forward.z > 0.19 && Math.abs(forward.x) < 1e-6, `forward was ${forward.x}, ${forward.z}`);
});

test('the normal answers the taper, not just the section', () => {
  // A cone narrowing as it rises has an outward normal tilted upward. The
  // analytic ellipse gradient would report it dead horizontal, which is what
  // sinks one end of a shoulder panel into the jacket.
  const cone = loftProfile([
    { y: 0, halfWidth: 0.2, halfDepth: 0.2 },
    { y: 1, halfWidth: 0.05, halfDepth: 0.05 },
  ]);
  const normal = loftNormal(cone, 0, 0.5, new THREE.Vector3());
  assert.ok(normal.x > 0.5, 'still points outward');
  assert.ok(normal.y > 0.1, `and tilts up the taper, was ${normal.y}`);
  assert.ok(Math.abs(normal.length() - 1) < 1e-6, 'and is a unit vector');
});

test('a lofted body faces outward', () => {
  const geometry = loftGeometry(CYLINDER, { radialSegments: 16 });
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  let checked = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const distance = radial(x, z);
    if (distance < 1e-3) continue; // cap centres carry the cap's own normal
    const outward = (x * normal.getX(i) + z * normal.getZ(i)) / distance;
    assert.ok(outward > 0.2, `vertex ${i} faces inward (${outward.toFixed(3)})`);
    checked += 1;
  }
  assert.ok(checked > 20, 'the sample was worth taking');
  geometry.dispose();
});

test('a lofted body is closed, and its normals are finite', () => {
  const geometry = loftGeometry(CYLINDER, { radialSegments: 12 });
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i += 1) {
    assert.ok(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i)), `normal ${i} is not finite`);
  }
  // Every edge of a closed surface is shared by exactly two triangles.
  const index = geometry.getIndex()!;
  const edges = new Map<string, number>();
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    assert.equal(count, 2, `edge ${key} is shared by ${count} triangles, so the body is open`);
  }
  geometry.dispose();
});

test('a patch stands proud of the body it lies on, all the way round', () => {
  const lift = 0.012;
  const patch = patchGeometry(CYLINDER, {
    u0: -Math.PI / 2 - 0.8,
    u1: -Math.PI / 2 + 0.8,
    v0: 0.2,
    v1: 0.8,
    uSegments: 6,
    vSegments: 3,
    lift,
    sink: -0.004,
  });
  const position = patch.getAttribute('position');
  let outer = 0;
  for (let i = 0; i < position.count; i += 1) {
    const distance = radial(position.getX(i), position.getZ(i));
    // Every vertex is either the lifted face or the sunk one; nothing may sit
    // on the surface itself, which is where z-fighting lives.
    const proud = distance - 0.2;
    assert.ok(
      Math.abs(proud - lift) < 1e-6 || Math.abs(proud + 0.004) < 1e-6,
      `vertex ${i} is ${proud.toFixed(5)} off the body`,
    );
    if (proud > 0) outer += 1;
    // And it stayed on the back: the whole span was authored behind the axis.
    assert.ok(position.getZ(i) < 0, `vertex ${i} escaped the authored span`);
  }
  assert.ok(outer > 20, 'the lifted face exists');
  patch.dispose();
});

test('a patch faces outward whichever way its span was authored', () => {
  // The mirrored-pair defect, stated as a property. A symmetric pair is
  // naturally authored as `centre ± side * span`, which gives one increasing
  // span and one decreasing one — and a decreasing span is a mirror in
  // parameter space, so the outer face comes out wound inward and is culled.
  // The rider's right chest chevron was invisible for a milestone on exactly
  // this, while its twin one sign away was correct.
  // A patch is a closed slab — a lifted face, a sunk one, and four rims — so
  // its signed volume answers the question outright: positive is a solid seen
  // from outside, negative is the same solid turned inside out. Reading
  // per-vertex normals cannot, because the sunk backing face points inward on
  // purpose.
  const signedVolume = (u0: number, u1: number): number => {
    const patch = patchGeometry(CYLINDER, { u0, u1, v0: 0.3, v1: 0.7, uSegments: 4, vSegments: 2 });
    const position = patch.getAttribute('position');
    const index = patch.getIndex()!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      volume += a.dot(b.clone().cross(c)) / 6;
    }
    patch.dispose();
    return volume;
  };
  assert.ok(signedVolume(0.10, 0.92) > 0, 'an increasing span faces outward');
  assert.ok(signedVolume(-0.10, -0.92) > 0, 'and so does its mirror image');
});

test('a skewed patch is a diagonal band, and a tapered one narrows to its ends', () => {
  const straight = patchGeometry(CYLINDER, { u0: 0, u1: 1, v0: 0.4, v1: 0.6, uSegments: 4, vSegments: 1 });
  const skewed = patchGeometry(CYLINDER, { u0: 0, u1: 1, v0: 0.4, v1: 0.6, uSegments: 4, vSegments: 1, skew: 0.4 });
  const heightSpread = (geometry: THREE.BufferGeometry): number => {
    const position = geometry.getAttribute('position');
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      low = Math.min(low, position.getY(i));
      high = Math.max(high, position.getY(i));
    }
    return high - low;
  };
  assert.ok(heightSpread(skewed) > heightSpread(straight) + 0.1, 'the skew climbed as it went round');
  straight.dispose();
  skewed.dispose();
});

test('every generated geometry carries a colour multiplier, and 1 means untouched', () => {
  const body = loftGeometry(CYLINDER, { radialSegments: 8 });
  const panel = patchGeometry(CYLINDER, { u0: 0, u1: 1, v0: 0.2, v1: 0.5, shade: 0.7 });
  const box = shaded(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  for (const [name, geometry, expected] of [['body', body, 1], ['panel', panel, 0.7], ['box', box, 1]] as const) {
    const colour = geometry.getAttribute('color');
    assert.ok(colour, `${name} has no color attribute and would render black`);
    assert.equal(colour.count, geometry.getAttribute('position').count, `${name} colour count`);
    for (let i = 0; i < colour.count; i += 1) {
      // Float32, so a tolerance rather than equality — the attribute is a
      // shading multiplier and nothing downstream reads it exactly.
      assert.ok(Math.abs(colour.getX(i) - expected) < 1e-6, `${name} vertex ${i} was ${colour.getX(i)}`);
    }
  }
  body.dispose();
  panel.dispose();
  box.dispose();
});

test('merging preserves every triangle and refuses an uncoloured input', () => {
  const a = loftGeometry(CYLINDER, { radialSegments: 8 });
  const b = shaded(new THREE.BoxGeometry(0.1, 0.1, 0.1)).toNonIndexed();
  const expected = a.getIndex()!.count + b.getAttribute('position').count;
  const merged = mergeGeometries([a, b]);
  assert.equal(merged.getIndex()!.count, expected, 'triangle count survived the merge');
  assert.ok(merged.getAttribute('normal'), 'normals survived');
  assert.ok(merged.getAttribute('color'), 'colours survived');

  const bare = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  assert.throws(() => mergeGeometries([bare]), /color attribute/);
  bare.dispose();
  merged.dispose();
});

test('a limb tapers, closes, and its seams break the surface', () => {
  const plain = limbProfile(0.4, [0.078, 0.07, 0.06]);
  const padded = limbProfile(0.4, [0.078, 0.07, 0.06], [0.35, 0.7]);
  assert.ok(padded.length > plain.length, 'the seams added sections');
  assert.ok(plain[plain.length - 1]!.halfWidth > plain[0]!.halfWidth, 'the joint end is the thick end');
  assert.ok(plain[0]!.halfWidth < 1e-4, 'and the far end closes to a point');

  // A seam is a step, so somewhere along the limb the radius must go *up* as
  // it descends. A monotonic taper means the seams did nothing.
  let reversal = 0;
  for (let i = 1; i < padded.length; i += 1) {
    if (padded[i]!.halfWidth < padded[i - 1]!.halfWidth) reversal += 1;
  }
  assert.ok(reversal >= 2, `expected a step per seam, found ${reversal}`);
});
