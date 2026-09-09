/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_SPREADS, PROP_VERTICAL_SPANS } from '../data/props.ts';
import {
  CONIFER_ENVELOPE,
  CONIFER_TIERS,
  CROWN_ENVELOPE,
  FOLIAGE_TONES,
  SHRUB_ENVELOPE,
  enhancedConifer,
  enhancedCrown,
  extentsOf,
  shapedShrub,
  type Envelope,
} from './foliageKit.ts';

/**
 * The foliage shapes, measured. A richer tree is only allowed to be richer
 * inside the box the baseline tree spanned, because that box is what the
 * level's placement rules read (`data/props.ts`); everything below asserts the
 * fit rather than trusting the builder to have applied it.
 */

function within(actual: Envelope, allowed: Envelope, slack = 1e-6): void {
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(actual.min[axis] >= allowed.min[axis] - slack, `min[${axis}] ${actual.min[axis]} < ${allowed.min[axis]}`);
    assert.ok(actual.max[axis] <= allowed.max[axis] + slack, `max[${axis}] ${actual.max[axis]} > ${allowed.max[axis]}`);
  }
}

function attributes(geometry: THREE.BufferGeometry): {
  position: THREE.BufferAttribute; normal: THREE.BufferAttribute; color: THREE.BufferAttribute;
} {
  return {
    position: geometry.getAttribute('position') as THREE.BufferAttribute,
    normal: geometry.getAttribute('normal') as THREE.BufferAttribute,
    color: geometry.getAttribute('color') as THREE.BufferAttribute,
  };
}

/** Count directed edges; a closed shell walks each undirected edge twice, once each way. */
function shellIsClosed(geometry: THREE.BufferGeometry): { closed: boolean; volume: number } {
  const { position } = attributes(geometry);
  const key = (i: number): string => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  const directed = new Map<string, number>();
  let volume = 0;
  for (let face = 0; face < position.count / 3; face += 1) {
    const a = face * 3;
    const ids = [key(a), key(a + 1), key(a + 2)];
    for (let corner = 0; corner < 3; corner += 1) {
      const edge = `${ids[corner]}->${ids[(corner + 1) % 3]}`;
      directed.set(edge, (directed.get(edge) ?? 0) + 1);
    }
    // Signed volume of the tetrahedron to the origin: positive for an outward-wound shell.
    const [ax, ay, az] = [position.getX(a), position.getY(a), position.getZ(a)];
    const [bx, by, bz] = [position.getX(a + 1), position.getY(a + 1), position.getZ(a + 1)];
    const [cx, cy, cz] = [position.getX(a + 2), position.getY(a + 2), position.getZ(a + 2)];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let closed = true;
  for (const [edge, count] of directed) {
    const [from, to] = edge.split('->');
    if (count !== 1 || directed.get(`${to}->${from}`) !== 1) closed = false;
  }
  return { closed, volume };
}

test('the enhanced crown is eighty faces inside the baseline crown\'s box, floored under the trunk top', () => {
  const crown = enhancedCrown();
  const { position, normal, color } = attributes(crown);
  assert.equal(position.count / 3, 80);
  assert.equal(normal.count, position.count);
  assert.equal(color.count, position.count);
  within(extentsOf(crown), CROWN_ENVELOPE);
  const extents = extentsOf(crown);
  // The crown swallows the trunk top: its lowest point sits under the trunk.
  assert.ok(extents.min[1] < PROP_SIZES.broadleafTree.trunkHeight, `crown floor ${extents.min[1]} leaves the trunk top bare`);
  // And it reaches: an envelope filled to less than 85% on any axis is a
  // crown that shrank, not a crown that was shaped.
  for (let axis = 0; axis < 3; axis += 1) {
    const span = extents.max[axis] - extents.min[axis];
    const allowed = CROWN_ENVELOPE.max[axis] - CROWN_ENVELOPE.min[axis];
    assert.ok(span > allowed * 0.85, `axis ${axis} spans ${span} of ${allowed}`);
  }
  const shell = shellIsClosed(crown);
  assert.ok(shell.closed, 'the crown is not a closed shell');
  assert.ok(shell.volume > 0, 'the crown is wound inward');
});

test('the crown is asymmetric and lobed, not a smoothed ball', () => {
  const crown = enhancedCrown();
  const { position } = attributes(crown);
  // Radial distance from the crown's own centroid varies by more than a
  // sphere jittered a few percent could produce.
  let cx = 0; let cy = 0; let cz = 0;
  for (let i = 0; i < position.count; i += 1) { cx += position.getX(i); cy += position.getY(i); cz += position.getZ(i); }
  cx /= position.count; cy /= position.count; cz /= position.count;
  let min = Infinity; let max = 0;
  for (let i = 0; i < position.count; i += 1) {
    const r = Math.hypot(position.getX(i) - cx, position.getY(i) - cy, position.getZ(i) - cz);
    min = Math.min(min, r); max = Math.max(max, r);
  }
  assert.ok(max / min > 1.25, `radius varies only ${(max / min).toFixed(3)}× — that is a ball`);
  // Left and right silhouettes differ: the widest x reach is not mirrored.
  const extents = extentsOf(crown);
  assert.ok(Math.abs(extents.max[0] + extents.min[0]) > 0.02 || Math.abs(extents.max[2] + extents.min[2]) > 0.02,
    'the crown is mirror-symmetric on both axes');
});

test('the enhanced conifer is forty-eight faces, buried and topped exactly as the baseline stack', () => {
  const conifer = enhancedConifer();
  const { position, normal, color } = attributes(conifer);
  assert.equal(position.count / 3, 48);
  assert.equal(color.count, position.count);
  within(extentsOf(conifer), CONIFER_ENVELOPE);
  const extents = extentsOf(conifer);
  const span = PROP_VERTICAL_SPANS.conifer;
  assert.equal(Number(extents.min[1].toFixed(6)), span.bottom, 'the burial moved');
  assert.equal(Number(extents.max[1].toFixed(6)), span.top, 'the top moved');
  // The footprint the placement rules read is the widest tier, and the
  // enhanced rims are jittered inward only.
  const footprint = PROP_FOOTPRINTS.conifer;
  assert.equal(footprint.shape, 'circle');
  for (let i = 0; i < position.count; i += 1) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    assert.ok(r <= (footprint as { radius: number }).radius + 1e-6, `a rim vertex at radius ${r} leaves the footprint`);
  }
  assert.equal(CONIFER_TIERS.length, 4);
  // Tiers are turned against each other: no two share an azimuth.
  const turns = CONIFER_TIERS.map((tier) => Number((tier.turn % (Math.PI / 3)).toFixed(3)));
  assert.equal(new Set(turns).size, turns.length, 'two tiers align');
  for (let i = 0; i < normal.count; i += 1) {
    assert.ok(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i)));
  }
  // Every tier's skirt overlaps the tier below it, so no daylight shows between them.
  for (let tier = 1; tier < CONIFER_TIERS.length; tier += 1) {
    const below = CONIFER_TIERS[tier - 1];
    assert.ok(CONIFER_TIERS[tier].base < below.base + below.height, `tier ${tier} floats above tier ${tier - 1}`);
  }
});

test('the shaped shrub keeps its twenty faces, its footprint and its burial', () => {
  const shrub = shapedShrub();
  const { position, color } = attributes(shrub);
  assert.equal(position.count / 3, 20);
  assert.equal(color.count, position.count);
  within(extentsOf(shrub), SHRUB_ENVELOPE);
  const extents = extentsOf(shrub);
  assert.ok(extents.min[1] < 0, `the shrub's base at ${extents.min[1]} is perched on the turf, not in it`);
  assert.ok(extents.min[1] >= PROP_VERTICAL_SPANS.shrub.bottom - 1e-6);
  const footprint = PROP_FOOTPRINTS.shrub as { radius: number };
  for (let i = 0; i < position.count; i += 1) {
    assert.ok(Math.hypot(position.getX(i), position.getZ(i)) <= footprint.radius + 1e-6);
  }
  const spread = PROP_SPREADS.shrub as { radius: number };
  assert.ok(Math.max(extents.max[0], -extents.min[0], extents.max[2], -extents.min[2]) <= spread.radius + 1e-6);
  const shell = shellIsClosed(shrub);
  assert.ok(shell.closed && shell.volume > 0);
});

test('foliage tones are grey, bounded, and average exactly one on every part', () => {
  for (const [name, geometry] of [['crown', enhancedCrown()], ['conifer', enhancedConifer()], ['shrub', shapedShrub()]] as const) {
    const { color } = attributes(geometry);
    let sum = 0;
    for (let i = 0; i < color.count; i += 1) {
      const tone = color.getX(i);
      assert.equal(color.getY(i), tone);
      assert.equal(color.getZ(i), tone);
      assert.ok(tone >= FOLIAGE_TONES.min / 1.05 && tone <= FOLIAGE_TONES.max * 1.05, `${name} tone ${tone}`);
      sum += tone;
    }
    assert.ok(Math.abs(sum / color.count - 1) < 1e-6, `${name} tones average ${sum / color.count}`);
    // There is a vocabulary at all: the lightest and darkest corner differ.
    let min = Infinity; let max = 0;
    for (let i = 0; i < color.count; i += 1) { min = Math.min(min, color.getX(i)); max = Math.max(max, color.getX(i)); }
    assert.ok(max - min > 0.1, `${name} is one flat tone`);
  }
});

test('the builders are deterministic', () => {
  for (const build of [enhancedCrown, enhancedConifer, shapedShrub]) {
    const a = attributes(build());
    const b = attributes(build());
    assert.deepEqual(Array.from(a.position.array), Array.from(b.position.array));
    assert.deepEqual(Array.from(a.color.array), Array.from(b.color.array));
  }
});
