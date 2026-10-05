/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN. Test actual rendered source boles and crown
 * meshes together. Original source physics/proxy/caster records remain owners. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { PROP_SIZES, PROP_FOOTPRINTS } from '../data/props.ts';
import { createProps } from './props.ts';
import { BASELINE_PRESENTATION } from './presentation.ts';
import { ultraTrunk } from './ultra/ultraFoliage.ts';
import { SHARED_VEGETATION_CONTRACTS } from './sharedVegetation.ts';
import { buildVegetationForm, buildBroadleafDistanceForms, type VegetationDetail,
  type VegetationVariant } from './vegetationForms.ts';
import { buildVegetationGrowthPlan, vegetationGrowthPrice } from './vegetationGrowthPlan.ts';
import { buildVegetationForm as oldForm } from './vegetationForms.r21-before-join.test-fixture.ts';
import { buildVegetationGrowthPlan as oldGrowth } from './vegetationGrowthPlan.r21-before-join.test-fixture.ts';

const sourcePlan: LevelPlan = { id: 'actual-native-trunk', segments: [], checkpoints: [],
  spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
  surround: { height: 0, surface: 'grass' },
  heightfield: { originX: -1, originZ: -1, spacing: 2, columns: 2, rows: 2,
    heights: [0, 0, 0, 0], surfaces: ['grass'] },
  props: [{ kind: 'broadleafTree', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 }], solids: [] };

function actualSourceTrunk(detail: VegetationDetail): { geometry: THREE.BufferGeometry; dispose(): void } {
  if (detail === 'ultra') { const geometry = ultraTrunk(); return { geometry, dispose: () => geometry.dispose() }; }
  const view = createProps(sourcePlan, BASELINE_PRESENTATION);
  const mesh = view.group.children.find(object => object.name === 'level-props-trunk') as THREE.InstancedMesh | undefined;
  if (!mesh) { view.dispose(); throw Error('Actual ordinary source trunk missing'); }
  assert.equal(mesh.count, 1); assert.equal(mesh.castShadow, true);
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  assert.deepEqual(matrix.elements, new THREE.Matrix4().elements, 'The actual source prop transform remains identity');
  return { geometry: mesh.geometry, dispose: () => view.dispose() };
}
const positions = (geometry: THREE.BufferGeometry) => geometry.getAttribute('position') as THREE.BufferAttribute;
function leaderCorners(detail: VegetationDetail, variant: VegetationVariant): number {
  const plan = buildVegetationGrowthPlan('crown', detail, variant), leader = plan.branches[0];
  return (leader.sectors ?? plan.branchSectors) * (leader.sections?.length ?? 2) * 2 * 3;
}

/** Independent directed-edge parity and volume on the stored Float32 leader,
 * rather than the emitter's ids or its private closure assertion. */
function closedOutward(p: THREE.BufferAttribute, corners: number): boolean {
  const key = (i: number) => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
  const edges = new Map<string, number>(); let volume = 0;
  const origin = new THREE.Vector3().fromBufferAttribute(p, 0);
  for (let first = 0; first < corners; first += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, first).sub(origin);
    const b = new THREE.Vector3().fromBufferAttribute(p, first + 1).sub(origin);
    const c = new THREE.Vector3().fromBufferAttribute(p, first + 2).sub(origin);
    volume += a.dot(b.cross(c)) / 6;
    for (let i = 0; i < 3; i++) { const edge = `${key(first + i)}|${key(first + (i + 1) % 3)}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1); }
  }
  return volume > 1e-10 && [...edges].every(([edge, count]) => count === 1 && edges.get(edge.split('|').reverse().join('|')) === 1);
}

/** Ray actual horizontal bole sections, filtering original Ultra stubs by
 * their native outward vertices, not by a copied analytic trunk radius. */
function radialHit(geometry: THREE.BufferGeometry, corners: number, y: number, angle: number,
  source = false): { radius: number; normal: THREE.Vector3 } | null {
  const p = positions(geometry), n = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const dx = Math.cos(angle), dz = Math.sin(angle), origin = new THREE.Vector3(dx, y, dz);
  const ray = new THREE.Ray(origin, new THREE.Vector3(-dx, 0, -dz));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  let best: { radius: number; normal: THREE.Vector3 } | null = null;
  for (let first = 0; first < corners; first += 3) {
    a.fromBufferAttribute(p, first); b.fromBufferAttribute(p, first + 1); c.fromBufferAttribute(p, first + 2);
    if (source && [a, b, c].some(v => Math.hypot(v.x, v.z) > PROP_SIZES.broadleafTree.trunkRadiusBase + 1e-6)) continue;
    if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
    const radius = hit.x * dx + hit.z * dz; if (!(radius > 0) || (best && radius <= best.radius)) continue;
    const weights = new THREE.Vector3(); THREE.Triangle.getBarycoord(hit, a, b, c, weights);
    const normal = new THREE.Vector3().fromBufferAttribute(n, first).multiplyScalar(weights.x)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, first + 1), weights.y)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, first + 2), weights.z).normalize();
    best = { radius, normal };
  }
  return best;
}
/** Actual cap SIDE normals at every native corner, bidirectionally.
 * Caps face +/-Y and are deliberately excluded. Flat corners own both native
 * incident normals; smooth corners own the actual supplied lathe normal.
 * Interior Gouraud interpolation is not invariant under retessellation. */
function nativeCapSideNormalsMatch(crown: THREE.BufferGeometry, corners: number, source: THREE.BufferGeometry): boolean {
  const y = Math.fround(PROP_SIZES.broadleafTree.trunkHeight);
  const collect = (geometry: THREE.BufferGeometry, count: number) => {
    const p = positions(geometry), n = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const result: { position: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    for (let corner = 0; corner < count; corner++) if (p.getY(corner) === y
      && Math.hypot(p.getX(corner), p.getZ(corner)) > .01
      && Math.hypot(p.getX(corner), p.getZ(corner)) <= PROP_SIZES.broadleafTree.trunkRadiusBase + 1e-6
      && Math.hypot(n.getX(corner), n.getZ(corner)) > .5) {
      result.push({ position: new THREE.Vector3().fromBufferAttribute(p, corner),
        normal: new THREE.Vector3().fromBufferAttribute(n, corner).normalize() });
    }
    return result;
  };
  const actual = collect(source, positions(source).count), joined = collect(crown, corners);
  const represented = (item: typeof actual[number], candidates: typeof actual) => candidates.some(other =>
    item.position.distanceTo(other.position) <= 1e-6 && item.normal.distanceTo(other.normal) <= 2e-6);
  return actual.length > 0 && joined.length > 0 && actual.every(item => represented(item, joined))
    && joined.every(item => represented(item, actual));
}

/** A ray on a sharp native edge can hit either incident flat face. Compare
 * the actual incident side-normal set at the independently witnessed source
 * hit; buffer iteration order cannot decide which valid normal must win. */
function incidentFlatNormalMatches(source: THREE.BufferGeometry, y: number, angle: number,
  radius: number, normal: THREE.Vector3): boolean {
  const p = positions(source), n = source.getAttribute('normal') as THREE.BufferAttribute;
  const point = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), closest = new THREE.Vector3();
  const triangle = new THREE.Triangle();
  for (let first = 0; first < p.count; first += 3) {
    a.fromBufferAttribute(p, first); b.fromBufferAttribute(p, first + 1); c.fromBufferAttribute(p, first + 2);
    if ([a, b, c].some(v => Math.hypot(v.x, v.z) > PROP_SIZES.broadleafTree.trunkRadiusBase + 1e-6)) continue;
    triangle.set(a, b, c).closestPointToPoint(point, closest);
    if (closest.distanceTo(point) > 1e-6) continue;
    const weights = new THREE.Vector3(); if (!THREE.Triangle.getBarycoord(closest, a, b, c, weights)) continue;
    const candidate = new THREE.Vector3().fromBufferAttribute(n, first).multiplyScalar(weights.x)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, first + 1), weights.y)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, first + 2), weights.z).normalize();
    if (Math.hypot(candidate.x, candidate.z) > .5 && candidate.distanceTo(normal) <= 2e-6) return true;
  }
  return false;
}
function matchesActualBole(crown: THREE.BufferGeometry, corners: number, source: THREE.BufferGeometry,
  detail: VegetationDetail): boolean {
  if (!nativeCapSideNormalsMatch(crown, corners, source)) return false;
  const root = SHARED_VEGETATION_CONTRACTS.crown;
  for (const y of [root.min[1] + .02, (root.min[1] + root.rootY) / 2, root.rootY - .0001])
    for (let azimuth = 0; azimuth < 72; azimuth++) {
      const angle = azimuth / 72 * Math.PI * 2;
      const actual = radialHit(source, positions(source).count, y, angle, true);
      const joined = radialHit(crown, corners, y, angle);
      if (!actual || !joined || Math.abs(actual.radius - joined.radius) > 1e-6) return false;
      if (detail === 'ordinary' && !incidentFlatNormalMatches(source, y, angle, actual.radius, joined.normal)) return false;
    }
  return true;
}
/** Compare the real stored cap ring, including every native corner. No
 * analytic descriptor can stand in for the actual source mesh in this guard. */
function exactNativeCapRing(crown: THREE.BufferGeometry, corners: number, source: THREE.BufferGeometry): boolean {
  const y = Math.fround(PROP_SIZES.broadleafTree.trunkHeight);
  const collect = (p: THREE.BufferAttribute, count: number) => {
    const ring = new Map<string, THREE.Vector3>();
    for (let corner = 0; corner < count; corner++) if (p.getY(corner) === y
      && Math.hypot(p.getX(corner), p.getZ(corner)) > .01
      && Math.hypot(p.getX(corner), p.getZ(corner)) <= PROP_SIZES.broadleafTree.trunkRadiusBase + 1e-6) {
      const point = new THREE.Vector3().fromBufferAttribute(p, corner);
      const key = `${Math.round(point.x * 1e6)},${Math.round(point.z * 1e6)}`;
      ring.set(key, point);
    }
    return [...ring.values()];
  };
  const original = collect(positions(source), positions(source).count), joined = collect(positions(crown), corners);
  return original.length >= 6 && original.length === joined.length
    && original.every(point => joined.some(other => point.distanceTo(other) <= 1e-6));
}
function capEnclosed(crown: THREE.BufferGeometry, corners: number, source: THREE.BufferGeometry): boolean {
  const p = positions(source), rootY = PROP_SIZES.broadleafTree.trunkHeight;
  const cap = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - rootY) < 1e-6
    && Math.hypot(p.getX(i), p.getZ(i)) <= PROP_SIZES.broadleafTree.trunkRadiusBase + 1e-6) {
    const point = new THREE.Vector3().fromBufferAttribute(p, i);
    if (Math.hypot(point.x, point.z) > .01) cap.set(`${point.x.toFixed(6)},${point.z.toFixed(6)}`, point);
  }
  const points = [...cap.values()].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
  assert.ok(points.length >= 6, 'Actual source cap perimeter, not only its centre, must be present');
  const cp = positions(crown), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  for (let edge = 0; edge < points.length; edge++) for (const fraction of [0, .5]) {
    const point = points[edge].clone().lerp(points[(edge + 1) % points.length], fraction);
    point.x *= .999; point.z *= .999; point.y = rootY + .0001;
    const ray = new THREE.Ray(point, new THREE.Vector3(1, .137, .271).normalize()); let crossings = 0;
    for (let first = 0; first < corners; first += 3) {
      a.fromBufferAttribute(cp, first); b.fromBufferAttribute(cp, first + 1); c.fromBufferAttribute(cp, first + 2);
      if (ray.intersectTriangle(a, b, c, false, hit)) crossings++;
    }
    if (crossings % 2 !== 1) return false;
  }
  return true;
}

for (const detail of ['ordinary', 'ultra'] as const) test(`${detail} all habits join the ACTUAL rendered bole and cap; frozen old joins fail`, () => {
  const before = JSON.stringify(sourcePlan), source = actualSourceTrunk(detail), root = SHARED_VEGETATION_CONTRACTS.crown;
  try {
    for (const variant of [0, 1, 2] as const) {
      const form = buildVegetationForm('crown', detail, variant, root), old = oldForm('crown', detail, variant, root);
      const count = leaderCorners(detail, variant), oldPlan = oldGrowth('crown', detail, variant);
      const oldCount = (oldPlan.branches[0].sectors ?? oldPlan.branchSectors) * (oldPlan.branches[0].sections?.length ?? 2) * 2 * 3;
      try {
        assert.ok(closedOutward(positions(form.geometry), count));
        assert.ok(exactNativeCapRing(form.geometry, count, source.geometry), 'Every stored native source cap corner appears at exactly the source cap height');
        assert.equal(exactNativeCapRing(old.geometry, oldCount, source.geometry), false, 'Both exact old joins lack the actual source cap ring');
        assert.ok(matchesActualBole(form.geometry, count, source.geometry, detail), 'No gap/oversized collar or side-normal discontinuity against actual source');
        assert.ok(capEnclosed(form.geometry, count, source.geometry), 'Entire actual native cap perimeter/midpoints remain inside the crown');
        assert.equal(matchesActualBole(old.geometry, oldCount, source.geometry, detail), false,
          'Known-bad exact old common join must fail actual radius/phase/taper/normal continuity in BOTH tiers');
        const capY = Math.fround(root.rootY), ring = new Set<string>();
        for (let corner = 0; corner < count; corner++) if (positions(form.geometry).getY(corner) === capY)
          ring.add(`${positions(form.geometry).getX(corner)},${positions(form.geometry).getZ(corner)}`);
        assert.equal(ring.size, detail === 'ultra' ? 8 : 6, 'Exactly one native cap ring at the actual height');
        const missing = positions(form.geometry).clone();
        assert.equal(closedOutward(new THREE.BufferAttribute(missing.array.slice(9), 3), count - 3), false, 'Missing leader face refuses closure');
        const reversed = positions(form.geometry).clone();
        for (let axis = 0; axis < 3; axis++) { const tmp = reversed.array[3 + axis]; reversed.array[3 + axis] = reversed.array[6 + axis]; reversed.array[6 + axis] = tmp; }
        assert.equal(closedOutward(reversed, count), false, 'Reversed face refuses directed-edge closure');
        const narrow = form.geometry.clone(), collar = form.geometry.clone(), wrongNormals = form.geometry.clone();
        try {
          for (const [geometry, scale] of [[narrow, .5], [collar, 1.20]] as const) {
            const p = positions(geometry); for (let corner = 0; corner < count; corner++) { p.setX(corner, p.getX(corner) * scale); p.setZ(corner, p.getZ(corner) * scale); }
          }
          assert.equal(capEnclosed(narrow, count, source.geometry), false, 'A closed narrow pole fails the original entire-cap enclosure');
          assert.equal(matchesActualBole(collar, count, source.geometry, detail), false, 'An oversized collar cannot conceal a mismatched join');
          const n = wrongNormals.getAttribute('normal') as THREE.BufferAttribute;
          for (let corner = 0; corner < count; corner++) n.setXYZ(corner, -n.getZ(corner), n.getY(corner), n.getX(corner));
          assert.ok(exactNativeCapRing(wrongNormals, count, source.geometry));
          assert.ok(capEnclosed(wrongNormals, count, source.geometry));
          assert.equal(matchesActualBole(wrongNormals, count, source.geometry, detail), false,
            'Exact geometry/enclosure with unrelated bark normals must fail actual normal continuity');
        } finally { narrow.dispose(); collar.dispose(); wrongNormals.dispose(); }
      } finally { form.geometry.dispose(); old.geometry.dispose(); }
    }
    assert.equal(JSON.stringify(sourcePlan), before);
    assert.equal((PROP_FOOTPRINTS.broadleafTree as { radius: number }).radius, PROP_SIZES.broadleafTree.trunkRadiusBase);
  } finally { source.dispose(); }
});

test('join repair preserves every leaf corner/normal and all distance leaders; only native Full leader sides add derived cost', () => {
  for (const detail of ['ordinary', 'ultra'] as const) for (const variant of [0, 1, 2] as const) {
    const root = SHARED_VEGETATION_CONTRACTS.crown, plan = buildVegetationGrowthPlan('crown', detail, variant), previous = oldGrowth('crown', detail, variant);
    assert.equal(plan.leaves.length, previous.leaves.length); assert.deepEqual(plan.leaves, previous.leaves);
    for (const level of ['near', 'middle', 'far'] as const) assert.equal(vegetationGrowthPrice(plan, level).triangles
      - vegetationGrowthPrice(previous, level).triangles, detail === 'ultra' ? 16 : 0);
    const form = buildVegetationForm('crown', detail, variant, root), old = oldForm('crown', detail, variant, root);
    const levels = buildBroadleafDistanceForms('crown', detail, variant, root);
    try {
      const currentLeaf = plan.branches.reduce((sum, branch) => sum + (branch.sectors ?? plan.branchSectors) * (branch.sections?.length ?? 2) * 2 * 3, 0);
      const oldLeaf = previous.branches.reduce((sum, branch) => sum + (branch.sectors ?? previous.branchSectors) * (branch.sections?.length ?? 2) * 2 * 3, 0);
      for (const name of ['position', 'normal', 'color']) assert.deepEqual(
        form.geometry.getAttribute(name).array.slice(currentLeaf * 3), old.geometry.getAttribute(name).array.slice(oldLeaf * 3),
        `Every ${detail}/${variant} leaf ${name} corner stays intact`);
      const corners = leaderCorners(detail, variant);
      for (const level of ['near', 'middle', 'far'] as const) {
        assert.ok(closedOutward(positions(levels[level]), corners), `Complete ${level} leader retained`);
        for (const name of ['position', 'normal', 'color']) assert.deepEqual(levels[level].getAttribute(name).array.slice(0, corners * 3),
          form.geometry.getAttribute(name).array.slice(0, corners * 3), `${level} keeps exact native join corners and normals`);
      }
    } finally { form.geometry.dispose(); old.geometry.dispose(); Object.values(levels).forEach(geometry => geometry.dispose()); }
  }
});
