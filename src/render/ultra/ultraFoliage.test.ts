/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_SPREADS, PROP_VERTICAL_SPANS } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import { CONIFER_ENVELOPE, CROWN_ENVELOPE, SHRUB_ENVELOPE, extentsOf, type Envelope } from '../foliageKit.ts';
import {
  CONIFER_MIN_TOOTH,
  ULTRA_CONIFER_TIERS,
  ULTRA_FOLIAGE_SALTS,
  formHash01,
  ultraConifer,
  ultraCrown,
  ultraShrub,
  ultraTrunk,
} from './ultraFoliage.ts';
import { channelMeans, shellReport } from './ultraKit.ts';

/**
 * The Ultra foliage, measured (`docs/M39_ULTRA.md` §4, T3). The shapes may be
 * as rich as §4's budget allows, but only inside the boxes and circles
 * `data/props.ts` places and clears trees with — so every one of those is
 * asserted against the built geometry rather than trusted to the builder.
 */

const EPSILON = 1e-6;

function within(actual: Envelope, allowed: Envelope, what: string): void {
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(actual.min[axis] >= allowed.min[axis] - EPSILON, `${what} min[${axis}] ${actual.min[axis]} < ${allowed.min[axis]}`);
    assert.ok(actual.max[axis] <= allowed.max[axis] + EPSILON, `${what} max[${axis}] ${actual.max[axis]} > ${allowed.max[axis]}`);
  }
}

function planRadius(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let radius = 0;
  for (let i = 0; i < position.count; i += 1) radius = Math.max(radius, Math.hypot(position.getX(i), position.getZ(i)));
  return radius;
}

/** Corners [from, to) of a geometry's positions, as their own triangle soup. */
function slice(geometry: THREE.BufferGeometry, from: number, to: number): number[] {
  return Array.from(geometry.getAttribute('position').array).slice(from * 3, to * 3);
}

/**
 * Point-in-closed-shell by ray parity. The ray leaves along an irrational
 * direction so it cannot graze an edge of these low-poly shells.
 */
function inside(soup: readonly number[], point: readonly [number, number, number]): boolean {
  const d = [0.8123, 0.3141, 0.4917];
  const length = Math.hypot(d[0], d[1], d[2]);
  const dir = [d[0] / length, d[1] / length, d[2] / length];
  let crossings = 0;
  for (let f = 0; f < soup.length / 9; f += 1) {
    const a = [soup[f * 9], soup[f * 9 + 1], soup[f * 9 + 2]];
    const b = [soup[f * 9 + 3], soup[f * 9 + 4], soup[f * 9 + 5]];
    const c = [soup[f * 9 + 6], soup[f * 9 + 7], soup[f * 9 + 8]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const t0 = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
    const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
    const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > 0) crossings += 1;
  }
  return crossings % 2 === 1;
}

/** The crown's five clusters, each its own closed icosphere of 80 faces. */
function crownClusters(crown: THREE.BufferGeometry): number[][] {
  const clusters: number[][] = [];
  for (let k = 0; k < ULTRA.forms.crown.lobeClusters; k += 1) clusters.push(slice(crown, k * 240, (k + 1) * 240));
  return clusters;
}

test('the crown is five closed lobe clusters, 400 faces, inside the baseline crown\'s box and spread', () => {
  const crown = ultraCrown();
  const position = crown.getAttribute('position');
  assert.equal(position.count / 3, 400);
  assert.equal(ULTRA.forms.crown.lobeClusters, 5);
  within(extentsOf(crown), CROWN_ENVELOPE, 'crown');
  const spread = (PROP_SPREADS.broadleafTree as { radius: number }).radius;
  assert.ok(planRadius(crown) <= spread + EPSILON, `the crown reaches ${planRadius(crown)} of a ${spread} m spread`);
  for (const [index, cluster] of crownClusters(crown).entries()) {
    const shell = shellReport(cluster);
    assert.ok(shell.closed && shell.volume > 0, `cluster ${index} is not a closed outward shell`);
  }
  const whole = shellReport(position.array);
  assert.ok(whole.closed && whole.volume > 0);
  // It fills its box rather than shrinking into it (the enhanced crown's own bar).
  const e = extentsOf(crown);
  for (let axis = 0; axis < 3; axis += 1) {
    const span = e.max[axis] - e.min[axis];
    const allowed = CROWN_ENVELOPE.max[axis] - CROWN_ENVELOPE.min[axis];
    assert.ok(span > allowed * 0.85, `axis ${axis} spans ${span.toFixed(3)} of ${allowed.toFixed(3)}`);
  }
});

test('the crown swallows the trunk top, and both branch stubs end inside it', () => {
  const crown = ultraCrown();
  const e = extentsOf(crown);
  const trunkTop = PROP_SIZES.broadleafTree.trunkHeight;
  assert.ok(e.min[1] < trunkTop, `the crown's floor at ${e.min[1]} leaves the trunk top bare`);
  const clusters = crownClusters(crown);
  const insideCrown = (point: [number, number, number]): boolean => clusters.some((cluster) => inside(cluster, point));
  assert.ok(insideCrown([0, trunkTop, 0]), 'the trunk top is not inside the crown');
  // Branch stub tips: the trunk's vertices above its own top.
  const trunk = ultraTrunk();
  const position = trunk.getAttribute('position');
  const tips = new Map<string, [number, number, number]>();
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > trunkTop + 0.05) {
      const p: [number, number, number] = [position.getX(i), position.getY(i), position.getZ(i)];
      tips.set(p.map((value) => value.toFixed(5)).join(','), p);
    }
  }
  assert.equal(tips.size, ULTRA.forms.trunk.branchStubs, `expected ${ULTRA.forms.trunk.branchStubs} stub tips, found ${tips.size}`);
  for (const tip of tips.values()) assert.ok(insideCrown(tip), `a branch stub ends outside the crown at ${tip.join(', ')}`);
});

test('the crown is asymmetric and lobed, not a ball', () => {
  const crown = ultraCrown();
  const e = extentsOf(crown);
  assert.ok(Math.abs(e.max[0] + e.min[0]) > 0.02 || Math.abs(e.max[2] + e.min[2]) > 0.02, 'the crown is mirror-symmetric on both axes');
  const position = crown.getAttribute('position');
  let cx = 0; let cy = 0; let cz = 0;
  for (let i = 0; i < position.count; i += 1) { cx += position.getX(i); cy += position.getY(i); cz += position.getZ(i); }
  cx /= position.count; cy /= position.count; cz /= position.count;
  let min = Infinity; let max = 0;
  for (let i = 0; i < position.count; i += 1) {
    const r = Math.hypot(position.getX(i) - cx, position.getY(i) - cy, position.getZ(i) - cz);
    min = Math.min(min, r); max = Math.max(max, r);
  }
  assert.ok(max / min > 1.5, `radius varies only ${(max / min).toFixed(3)}× — that is a ball`);
});

test('foliage tones are chromatic, average exactly one per channel, and put warm tips over cool hollows', () => {
  const form = ULTRA.forms;
  for (const [name, geometry] of [['crown', ultraCrown()], ['conifer', ultraConifer()], ['shrub', ultraShrub()]] as const) {
    const means = channelMeans(geometry);
    for (const mean of means) assert.ok(Math.abs(mean - 1) < 1e-6, `${name} channel mean ${mean}`);
    const colour = geometry.getAttribute('color');
    const normal = geometry.getAttribute('normal');
    // Warmth: red over blue. Up-facing corners are warmer than down-facing ones.
    let upWarm = 0; let upCount = 0; let downWarm = 0; let downCount = 0;
    let lightest = 0; let darkest = Infinity;
    for (let i = 0; i < colour.count; i += 1) {
      const warmth = colour.getX(i) - colour.getZ(i);
      if (normal.getY(i) > 0.25) { upWarm += warmth; upCount += 1; }
      if (normal.getY(i) < -0.25) { downWarm += warmth; downCount += 1; }
      const g = colour.getY(i);
      lightest = Math.max(lightest, g);
      darkest = Math.min(darkest, g);
      assert.ok(colour.getX(i) > 0.5 && colour.getY(i) > 0.5 && colour.getZ(i) > 0.5, `${name} corner ${i} is crushed`);
      assert.ok(colour.getX(i) < 1.6 && colour.getY(i) < 1.6 && colour.getZ(i) < 1.6, `${name} corner ${i} is blown out`);
    }
    assert.ok(upCount > 0 && downCount > 0, `${name} has no up- or down-facing corners`);
    assert.ok(upWarm / upCount > downWarm / downCount + 0.1, `${name}: tips are not warmer than hollows`);
    assert.ok(lightest - darkest > 0.15, `${name} is one flat tone`);
  }
  // The raw vocabulary is the one §4 names.
  assert.deepEqual([...form.crown.tipTone], [1.14, 1.18, 0.86]);
  assert.deepEqual([...form.crown.hollowTone], [0.84, 0.90, 1.04]);
  assert.deepEqual([...form.conifer.tipTone], [1.12, 1.15, 0.90]);
  assert.deepEqual([...form.conifer.skirtTone], [0.82, 0.88, 1.05]);
});

test('the conifer is six serrated tiers of nine teeth, 216 faces, buried 0.25 m and topped at 7.9 m exactly', () => {
  const form = ULTRA.forms.conifer;
  const conifer = ultraConifer();
  const position = conifer.getAttribute('position');
  assert.equal(position.count / 3, 216);
  assert.equal(form.tiers * form.sides * 4, 216, 'six tiers of nine sides, four faces a tooth');
  assert.equal(form.rimVertices, form.sides * 2);
  within(extentsOf(conifer), CONIFER_ENVELOPE, 'conifer');
  const e = extentsOf(conifer);
  const span = PROP_VERTICAL_SPANS.conifer;
  assert.equal(Number(e.min[1].toFixed(6)), span.bottom, 'the burial moved');
  assert.equal(Number(e.max[1].toFixed(6)), span.top, 'the top moved');
  const footprint = (PROP_FOOTPRINTS.conifer as { radius: number }).radius;
  assert.ok(planRadius(conifer) <= footprint + EPSILON, `a tooth reaches ${planRadius(conifer)}`);
  // Each tier is its own closed cone.
  const perTier = position.count / form.tiers;
  for (let tier = 0; tier < form.tiers; tier += 1) {
    const shell = shellReport(slice(conifer, tier * perTier, (tier + 1) * perTier));
    assert.ok(shell.closed && shell.volume > 0, `tier ${tier} is not a closed outward cone`);
  }
});

test('conifer tiers are serrated and drooping, turned against each other, and overlap without daylight', () => {
  const form = ULTRA.forms.conifer;
  const conifer = ultraConifer();
  const position = conifer.getAttribute('position');
  const perTier = position.count / form.tiers;
  const turns: number[] = [];
  for (let tier = 0; tier < form.tiers; tier += 1) {
    // Side faces are (rim i, rim i+1, apex); rim i is a tooth when i is even.
    const tipRadii: number[] = []; const notchRadii: number[] = []; const tipY: number[] = []; const notchY: number[] = [];
    for (let i = 0; i < form.rimVertices; i += 1) {
      const corner = tier * perTier + i * 6;
      const r = Math.hypot(position.getX(corner), position.getZ(corner));
      if (i % 2 === 0) { tipRadii.push(r); tipY.push(position.getY(corner)); } else { notchRadii.push(r); notchY.push(position.getY(corner)); }
      if (i === 0) turns.push(Math.atan2(-position.getZ(corner), position.getX(corner)));
    }
    assert.ok(Math.min(...tipRadii) > Math.max(...notchRadii), `tier ${tier} is not serrated`);
    assert.ok(Math.max(...tipY) < Math.min(...notchY), `tier ${tier}'s teeth do not droop below its notches`);
  }
  // Turned: no two tiers put their first tooth at the same azimuth, within the tooth period.
  const period = (Math.PI * 2) / form.sides;
  const phases = turns.map((turn) => Number((((turn % period) + period) % period).toFixed(2)));
  assert.equal(new Set(phases).size, phases.length, `two tiers align: ${phases.join(', ')}`);
  // No daylight: each tier's skirt starts below the apex of the tier under it.
  for (let tier = 1; tier < ULTRA_CONIFER_TIERS.length; tier += 1) {
    const below = ULTRA_CONIFER_TIERS[tier - 1];
    const here = ULTRA_CONIFER_TIERS[tier];
    assert.ok(here.base - here.droop < below.apex, `tier ${tier} floats above tier ${tier - 1}`);
    // The skirt is wider than the cone under it at that height.
    const coneBelow = below.radius * (below.apex - here.base) / (below.apex - below.base);
    assert.ok(here.radius > coneBelow, `tier ${tier}'s skirt does not cover tier ${tier - 1}`);
  }
});

test('conifer teeth and droops keep §4\'s pixel rule, and each tier shades as one cone rather than tooth-by-tooth stripes', () => {
  // Gauntlet round 1 item 5: the U1 conifer's 18 side faces a tier each took
  // their own facet normal, so a tier alternated light and dark every tooth
  // (a 73° step between neighbours) and the stripes crawled in motion. Now a
  // quarter of the facet survives and the rest is the smooth cone.
  const form = ULTRA.forms.conifer;
  const conifer = ultraConifer();
  const position = conifer.getAttribute('position');
  const normal = conifer.getAttribute('normal');
  const perTier = position.count / form.tiers;
  let worstStep = 0;
  for (let tier = 0; tier < form.tiers; tier += 1) {
    const rim = (i: number): number => tier * perTier + (i % form.rimVertices) * 6;
    for (let i = 0; i < form.rimVertices; i += 1) {
      const here = rim(i);
      const r = Math.hypot(position.getX(here), position.getZ(here));
      if (i % 2 === 1) {
        // A notch: at least the pixel rule inside both tips beside it, and above them.
        for (const tip of [rim(i - 1 + form.rimVertices), rim(i + 1)]) {
          const tipR = Math.hypot(position.getX(tip), position.getZ(tip));
          assert.ok(tipR - r >= CONIFER_MIN_TOOTH - EPSILON, `tier ${tier} notch ${i} is ${(tipR - r).toFixed(3)} m inside a tip`);
          assert.ok(position.getY(here) - position.getY(tip) >= CONIFER_MIN_TOOTH - EPSILON, `tier ${tier} droops only ${(position.getY(here) - position.getY(tip)).toFixed(3)} m at notch ${i}`);
        }
      }
      // Face i's second corner and face i+1's first are the same rim vertex.
      const a = here + 1;
      const b = rim(i + 1);
      const dot = normal.getX(a) * normal.getX(b) + normal.getY(a) * normal.getY(b) + normal.getZ(a) * normal.getZ(b);
      worstStep = Math.max(worstStep, (Math.acos(Math.min(1, dot)) * 180) / Math.PI);
    }
  }
  assert.ok(worstStep <= 20, `neighbouring side faces still step ${worstStep.toFixed(1)}° in shading at a shared rim vertex`);
  // Shallow skirts (item 5's "flatten the undersides"): above the buried
  // tier no tooth hangs more than 0.2 m under its notches.
  for (const tier of ULTRA_CONIFER_TIERS.slice(1)) assert.ok(tier.droop <= 0.2, `a tier droops ${tier.droop} m`);
});

test('the shrub grows out of the turf: nearly as wide at the ground as at its girth, and darker at its foot', () => {
  // Gauntlet round 1 item 11 ("pale, weakly grounded shrubs"). The U1 shrub
  // was 0.78 of its girth at the turf, and its foot the same tone as its top
  // (0.87 of it), so it rested on the grass with no line where they meet.
  const shrub = ultraShrub();
  const position = shrub.getAttribute('position');
  const colour = shrub.getAttribute('color');
  let widest = 0; let atTurf = 0; let foot = 0; let footCount = 0; let top = 0; let topCount = 0;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const r = Math.hypot(position.getX(i), position.getZ(i));
    widest = Math.max(widest, r);
    if (y >= 0 && y <= 0.25) atTurf = Math.max(atTurf, r);
    if (y >= 0 && y < 0.2) { foot += colour.getY(i); footCount += 1; }
    if (y > 0.8) { top += colour.getY(i); topCount += 1; }
  }
  assert.ok(atTurf / widest >= 0.85, `at the turf the shrub is ${(atTurf / widest).toFixed(3)} of its girth`);
  assert.ok(footCount > 0 && topCount > 0);
  assert.ok(foot / footCount <= 0.75 * (top / topCount), `the foot is ${(foot / footCount / (top / topCount)).toFixed(3)} of the top's tone`);
});

test('the Ultra shrub is 80 faces inside its envelope, its footprint circle and its burial', () => {
  const shrub = ultraShrub();
  const position = shrub.getAttribute('position');
  assert.equal(position.count / 3, 80);
  within(extentsOf(shrub), SHRUB_ENVELOPE, 'shrub');
  const footprint = (PROP_FOOTPRINTS.shrub as { radius: number }).radius;
  assert.ok(planRadius(shrub) <= footprint + EPSILON, `the shrub reaches ${planRadius(shrub)}`);
  const e = extentsOf(shrub);
  assert.ok(e.min[1] < 0, 'the shrub sits on the turf, not in it');
  assert.ok(e.min[1] >= PROP_VERTICAL_SPANS.shrub.bottom - EPSILON);
  assert.ok(e.max[1] <= PROP_VERTICAL_SPANS.shrub.top + EPSILON);
  const shell = shellReport(position.array);
  assert.ok(shell.closed && shell.volume > 0);
});

test('the trunk is eight-sided, flared to the 0.30 m footprint, 3.1 m tall, closed, within 56 faces', () => {
  const tree = PROP_SIZES.broadleafTree;
  const trunk = ultraTrunk();
  const position = trunk.getAttribute('position');
  const triangles = position.count / 3;
  assert.ok(triangles <= 56, `${triangles} faces`);
  assert.equal(ULTRA.forms.trunk.sides, 8);
  const footprint = (PROP_FOOTPRINTS.broadleafTree as { radius: number }).radius;
  let rootRadius = 0; let boleTop = 0; let lowest = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const r = Math.hypot(position.getX(i), position.getZ(i));
    lowest = Math.min(lowest, y);
    // Below head height the trunk is the footprint and nothing wider.
    if (y < 2) assert.ok(r <= footprint + EPSILON, `the trunk is ${r} wide at ${y} m`);
    if (y < 0.01) rootRadius = Math.max(rootRadius, r);
    if (r < 0.25) boleTop = Math.max(boleTop, y);
  }
  assert.equal(Number(lowest.toFixed(6)), 0);
  assert.ok(rootRadius <= ULTRA.forms.trunk.rootFlare + EPSILON && rootRadius > tree.trunkRadiusTop, `root flare ${rootRadius}`);
  assert.equal(Number(boleTop.toFixed(6)), tree.trunkHeight, 'the bole is not 3.1 m');
  const shell = shellReport(position.array);
  assert.ok(shell.closed && shell.volume > 0);
  // The spread the building guard reads.
  assert.ok(planRadius(trunk) <= (PROP_SPREADS.broadleafTree as { radius: number }).radius);
});

test('the foliage salts are Ultra\'s own and the forms are deterministic', () => {
  const salts = Object.values(ULTRA_FOLIAGE_SALTS);
  for (const salt of salts) {
    assert.ok(ULTRA.forms.salts.includes(salt), `${salt} is not one of §4's new salts`);
    // Not the ordinary kit's hash salts, nor the enhanced shapes' sculpt salts.
    assert.ok(![3, 5, 7, 9, 11, 17, 23].includes(salt), `${salt} is already in use`);
  }
  assert.equal(new Set(salts).size, salts.length, 'two foliage parts share a salt');
  assert.equal(formHash01(3, 4, 19), formHash01(3, 4, 19));
  assert.notEqual(formHash01(3, 4, 19), formHash01(3, 4, 31));
  for (const build of [ultraCrown, ultraConifer, ultraShrub, ultraTrunk]) {
    const a = build();
    const b = build();
    for (const name of ['position', 'normal', 'color']) {
      assert.deepEqual(Array.from(a.getAttribute(name).array), Array.from(b.getAttribute(name).array), `${build.name} ${name} differs`);
    }
    const normal = a.getAttribute('normal');
    for (let i = 0; i < normal.count; i += 1) {
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-4, `${build.name} normal ${i}`);
    }
  }
});
