/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { SHARED_VEGETATION_CONTRACTS } from './sharedVegetation.ts';
import {
  buildVegetationForm, buildBroadleafDistanceForms, VEGETATION_FORM_COUNTS, VEGETATION_HEIGHT_SHARES,
  BROADLEAF_DISTANCE_COUNTS, buildConiferDistanceForms, CONIFER_DISTANCE_COUNTS,
  type VegetationContract, type VegetationFamily,
} from './vegetationForms.ts';
import { buildVegetationGrowthPlan, vegetationGrowthPrice, assertVegetationGrowthPlan } from './vegetationGrowthPlan.ts';

/** Weld exact stored positions, independently of the generator's vertex ids. */
function components(position: THREE.BufferAttribute): number[][] {
  const key = (i: number) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
  const at = new Map<string, number[]>();
  for (let i = 0; i < position.count; i++) {
    const vertex = key(i), list = at.get(vertex) ?? [];
    list.push(Math.floor(i / 3)); at.set(vertex, list);
  }
  const unseen = new Set(Array.from({ length: position.count / 3 }, (_, i) => i));
  const result: number[][] = [];
  while (unseen.size) {
    const queue = [unseen.values().next().value!], triangles: number[] = [];
    unseen.delete(queue[0]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const triangle = queue[cursor]; triangles.push(triangle);
      for (let corner = 0; corner < 3; corner++) for (const neighbour of at.get(key(triangle * 3 + corner))!) {
        if (unseen.delete(neighbour)) queue.push(neighbour);
      }
    }
    result.push(triangles);
  }
  return result;
}

/** Every disconnected shell closes, and every shell encloses positive volume. */
function closedOutward(position: THREE.BufferAttribute): boolean {
  const key = (i: number) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
  const point = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
  return components(position).every(triangles => {
    const edges = new Map<string, number>();
    const origin = point(triangles[0] * 3);
    let volume = 0;
    for (const triangle of triangles) {
      const first = triangle * 3;
      const a = point(first).sub(origin), b = point(first + 1).sub(origin), c = point(first + 2).sub(origin);
      volume += a.dot(b.cross(c)) / 6;
      for (let corner = 0; corner < 3; corner++) {
        const edge = `${key(first + corner)}|${key(first + (corner + 1) % 3)}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    return volume > 1e-10 && [...edges].every(([edge, count]) => count === 1
      && edges.get(edge.split('|').reverse().join('|')) === 1);
  });
}

function bounded(position: THREE.BufferAttribute, contract: VegetationContract): boolean {
  for (let i = 0; i < position.count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    if (p.some((n, axis) => !Number.isFinite(n) || n < contract.min[axis] - 1e-6 || n > contract.max[axis] + 1e-6)
      || Math.hypot(p[0], p[2]) > contract.spreadRadius + 1e-6) return false;
  }
  return true;
}

/** Union of closed components, so overlapping foliage never cancels occupancy. */
function contains(position: THREE.BufferAttribute, shells: readonly number[][], point: THREE.Vector3): boolean {
  const ray = new THREE.Ray(point, new THREE.Vector3(1, 0.137, 0.271).normalize());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  return shells.some(triangles => {
    let crossings = 0;
    for (const triangle of triangles) {
      a.fromBufferAttribute(position, triangle * 3);
      b.fromBufferAttribute(position, triangle * 3 + 1);
      c.fromBufferAttribute(position, triangle * 3 + 2);
      if (ray.intersectTriangle(a, b, c, false, hit)) crossings++;
    }
    return crossings % 2 === 1;
  });
}

for (const detail of ['ordinary', 'ultra'] as const) for (const family of ['crown', 'coniferFoliage', 'shrub'] as const) {
  test(`${detail} ${family} has closed outward growth shells with exact measured accounting`, () => {
    for (const variant of [0, 1, 2] as const) {
      const contract = SHARED_VEGETATION_CONTRACTS[family];
      const one = buildVegetationForm(family, detail, variant, contract);
      const two = buildVegetationForm(family, detail, variant, contract);
      try {
        const position = one.geometry.getAttribute('position') as THREE.BufferAttribute;
        const shells = components(position);
        assert.equal(one.geometry.index, null); assert.ok(closedOutward(position));
        assert.ok(bounded(position, contract));
        assert.equal(position.count / 3, VEGETATION_FORM_COUNTS[detail][family]);
        assert.equal(one.triangles, position.count / 3);
        assert.equal(one.geometryBytes, Object.values(one.geometry.attributes)
          .reduce((sum, attribute) => sum + attribute.array.byteLength, 0));
        if (family === 'coniferFoliage') {
          assert.equal(shells.length, detail === 'ultra' ? 313 : 265);
          assert.ok(one.context.wood.some(value => value === 1));
          assert.ok(one.context.wood.every((wood, i) => wood + one.context.leaf[i] === 1),
            'Conifer supports must carry wood while every foliage fan is labelled leaf');
        } else {
          assert.ok(one.context.wood.some(value => value === 1));
          assert.ok(one.context.leaf.some(value => value === 1));
          assert.ok(one.context.wood.every((wood, i) => wood + one.context.leaf[i] === 1),
            'No unlabelled opaque crown hull remains behind the visible leaves');
        }
        const heights = Array.from({ length: position.count }, (_, i) => position.getY(i));
        assert.ok(Math.abs(Math.min(...heights) - contract.min[1]) < 1e-6);
        const expectedTop = contract.min[1]
          + (contract.max[1] - contract.min[1]) * VEGETATION_HEIGHT_SHARES[family][variant];
        assert.ok(Math.abs(Math.max(...heights) - expectedTop) < 1e-6);
        assert.ok(contains(position, shells, new THREE.Vector3(0, contract.rootY + 0.0001, 0)),
          'The unchanged root axis must meet foliage, not an empty attachment gap');
        for (const name of ['position', 'normal', 'color']) assert.deepEqual(
          Array.from(one.geometry.getAttribute(name).array), Array.from(two.geometry.getAttribute(name).array));
        for (const name of ['reach', 'height', 'mass', 'leaf', 'wood'] as const) {
          assert.equal(one.context[name].length, position.count);
          assert.deepEqual(one.context[name], two.context[name]);
        }
        assert.deepEqual([...new Set(one.context.mass)].sort(), family === 'crown' || family === 'coniferFoliage'
          ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]);
        assert.equal(one.geometry.getAttribute('mass'), undefined);
        assert.equal(one.geometry.getAttribute('leaf'), undefined);
        // A whole inverted component still passes undirected edge closure and
        // can hide inside a larger positive total volume. Reject it separately.
        const bad = position.clone();
        for (const triangle of shells[0]) for (let axis = 0; axis < 3; axis++) {
          const a = triangle * 9 + 3 + axis, b = triangle * 9 + 6 + axis;
          const value = bad.array[a]; bad.array[a] = bad.array[b]; bad.array[b] = value;
        }
        assert.equal(closedOutward(bad), false);
        const outside = position.clone(); outside.setX(0, contract.max[0] + 0.1);
        assert.equal(bounded(outside, contract), false);
      } finally { one.geometry.dispose(); two.geometry.dispose(); }
    }
  });
}

for (const family of ['crown', 'coniferFoliage', 'shrub'] as const) {
  test(`${family} habits change the growing structure across both detail tiers`, () => {
    for (const detail of ['ordinary', 'ultra'] as const) {
      const contract = SHARED_VEGETATION_CONTRACTS[family];
      const forms = [0, 1, 2].map(variant => buildVegetationForm(family, detail, variant as 0 | 1 | 2, contract));
      try {
        const widths = forms.map(form => form.geometry.boundingBox!.getSize(new THREE.Vector3()).x);
        assert.ok(widths[2] < widths[0] * 0.94, 'The compact habit must stay visibly narrower than the spreading habit');
        const topX = forms.map(form => {
          const p = form.geometry.getAttribute('position');
          const top = form.geometry.boundingBox!.max.y;
          for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - top) < 1e-6) return p.getX(i);
          throw new Error('Missing exact canopy top');
        });
        assert.ok(topX[1] > topX[0] + contract.spreadRadius * 0.05,
          'The second habit must carry its upper growth asymmetrically off the original root axis');
      } finally { for (const form of forms) form.geometry.dispose(); }
    }
  });
}

/** Native shoulder/axis aspect: read actual cap vertices and all stored corners. */
function clusterFrame(position: THREE.BufferAttribute, shell: readonly number[], rows: number) {
  const first = Math.min(...shell);
  const root = new THREE.Vector3().fromBufferAttribute(position, first * 3);
  const tip = new THREE.Vector3().fromBufferAttribute(position, (first + rows * 2 - 1) * 3);
  const axis = tip.clone().sub(root), length = axis.length();
  assert.ok(length > 0); axis.divideScalar(length);
  return { root, tip, axis, length };
}
function clusterAspect(position: THREE.BufferAttribute, shell: readonly number[], rows: number): number {
  const { root, axis, length } = clusterFrame(position, shell, rows);
  let shoulder = 0;
  for (const triangle of shell) for (let corner = 0; corner < 3; corner++) {
    const delta = new THREE.Vector3().fromBufferAttribute(position, triangle * 3 + corner).sub(root);
    const perpendicular = delta.addScaledVector(axis, -delta.dot(axis));
    shoulder = Math.max(shoulder, perpendicular.length());
  }
  return length / (2 * shoulder);
}
function narrowCluster(position: THREE.BufferAttribute, shell: readonly number[], rows: number): void {
  const { root, axis } = clusterFrame(position, shell, rows);
  for (const triangle of shell) for (let corner = 0; corner < 3; corner++) {
    const at = triangle * 3 + corner;
    const delta = new THREE.Vector3().fromBufferAttribute(position, at).sub(root);
    const along = axis.clone().multiplyScalar(delta.dot(axis));
    const bad = root.clone().add(along).add(delta.sub(along).multiplyScalar(.15));
    position.setXYZ(at, bad.x, bad.y, bad.z);
  }
}

test('conifer clustered boughs attach to a subordinate core and leave real lower-whorl negative space', () => {
  for (const detail of ['ordinary', 'ultra'] as const) for (const variant of [0, 1, 2] as const) {
    const contract = SHARED_VEGETATION_CONTRACTS.coniferFoliage;
    const form = buildVegetationForm('coniferFoliage', detail, variant, contract);
    try {
      const p = form.geometry.getAttribute('position') as THREE.BufferAttribute, shells = components(p);
      const core = shells.filter(shell => form.context.mass[shell[0] * 3] === 4);
      assert.equal(core.length, 1);
      const whole = form.geometry.boundingBox!.getSize(new THREE.Vector3()), coreBox = new THREE.Box3();
      for (const triangle of core[0]) for (let corner = 0; corner < 3; corner++)
        coreBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, triangle * 3 + corner));
      assert.ok(coreBox.getSize(new THREE.Vector3()).x < whole.x * 0.70,
        'Dense inner growth must stay inside the lateral branch silhouette');
      const fans = shells.filter(shell => form.context.mass[shell[0] * 3] !== 4
        && form.context.leaf[shell[0] * 3] === 0);
      const needles = shells.filter(shell => form.context.leaf[shell[0] * 3] === 1);
      assert.equal(fans.length, 24); assert.equal(needles.length, (detail === 'ultra' ? 12 : 10) * 24);
      const fanRoots = fans.map(fan => new THREE.Vector3().fromBufferAttribute(p, fan[0] * 3));
      const height = contract.max[1] - contract.min[1];
      // A conifer's leader is a connector. Several independently rooted fans
      // must carry the upper crown, including one close to the preserved tip.
      assert.ok(fanRoots.filter(root => root.y > contract.min[1] + height * .78).length >= 4,
        'Upper crown needs several attached boughs rather than a bare leader');
      const tuftTop = Math.max(...needles.flatMap(tuft => tuft.flatMap(triangle => [0, 1, 2].map(corner =>
        p.getY(triangle * 3 + corner)))));
      assert.ok(tuftTop > contract.min[1] + height * .96,
        'Upper crown foliage must continue close to the native tip');
      for (const fan of fans) {
        const box = new THREE.Box3(); let nearest = Infinity, farthest = -Infinity;
        for (const triangle of fan) for (let corner = 0; corner < 3; corner++) {
          const point = new THREE.Vector3().fromBufferAttribute(p, triangle * 3 + corner); box.expandByPoint(point);
          const radius = Math.hypot(point.x, point.z);
          if (radius < nearest) nearest = radius;
          if (radius > farthest) farthest = radius;
        }
        const size = box.getSize(new THREE.Vector3());
        assert.ok(size.y < Math.hypot(size.x, size.z) * 0.8,
          'A bough must be a flattened radial fan rather than a rounded side bud');
        // With wider fans the nearest/farthest rim can differ from the actual caps.
        // Check the branch axis, preserving the original physical droop floor.
        const rootCap = new THREE.Vector3().fromBufferAttribute(p, Math.min(...fan) * 3);
        const tipCap = new THREE.Vector3().fromBufferAttribute(p, (Math.min(...fan) + (detail === 'ultra' ? 5 : 4) * 2 - 1) * 3);
        assert.ok(tipCap.y < rootCap.y - (contract.max[1] - contract.min[1]) * 0.006,
          'The outer bough tips must droop below their attachment');
      }
      const clustersPerBough = detail === 'ultra' ? 12 : 10;
      for (let i = 0; i < fans.length; i++) {
        const root = new THREE.Vector3().fromBufferAttribute(p, fans[i][0] * 3);
        assert.ok(contains(p, core, root), 'Each actual bough root must enter the unchanged core');
      }
      for (let i = 0; i < needles.length; i++) {
        const parent = fans[Math.floor(i / clustersPerBough)];
        const root = new THREE.Vector3().fromBufferAttribute(p, needles[i][0] * 3);
        assert.ok(contains(p, [parent], root), 'Every actual cluster root must enter its own radial bough');
        const aspect = clusterAspect(p, needles[i], detail === 'ultra' ? 5 : 4);
        // Full volumetric tufts permit a 3/8 cap-axis/diameter ratio after anisotropic fit.
        // This artistic shape bound is distinct from all unchanged physical contracts.
        // A full 3D tapered tuft must be neither a spherical mushroom nor a
        // thin thorn. This range is read from its actual cap axis and broadest
        // shoulder after the caller's anisotropic physical envelope is applied.
        assert.ok(aspect >= 3 / 8 && aspect <= 2.5,
          'Native foliage must remain a tapered volumetric tuft rather than a mushroom or thorn');
      }
      // Known-bad closed growth cannot pass by borrowing a nearby fan's union.
      const displaced = p.clone(), victim = needles[0];
      for (const triangle of victim) for (let corner = 0; corner < 3; corner++) {
        const at = triangle * 3 + corner;
        displaced.setX(at, displaced.getX(at) + contract.spreadRadius * 4);
      }
      assert.ok(closedOutward(displaced));
      assert.equal(contains(displaced, [fans[0]],
        new THREE.Vector3().fromBufferAttribute(displaced, victim[0] * 3)), false);
      // Compress only the tuft's shoulder about its fixed native axis. It
      // remains attached, closed and outward, but recreates the prong shape.
      const narrow = p.clone();
      narrowCluster(narrow, victim, detail === 'ultra' ? 5 : 4);
      assert.ok(closedOutward(narrow));
      assert.ok(contains(narrow, [fans[0]], new THREE.Vector3().fromBufferAttribute(narrow, victim[0] * 3)));
      assert.ok(clusterAspect(narrow, victim, detail === 'ultra' ? 5 : 4) > 2.5,
        'The compressed known-bad control must still read as a thorn');
      let brokenBoughSection = false;
      // Probe through actual lower whorls. An entirely empty section is not a
      // success: this control requires both foliage and substantial daylight.
      for (const fraction of [0.08, 0.10, 0.115, 0.13, 0.23, 0.25, 0.275, 0.30, 0.325, 0.35, 0.375]) {
        const y = contract.min[1] + fraction * (contract.max[1] - contract.min[1]);
        let filled = 0;
        for (let sector = 0; sector < 72; sector++) {
          const theta = sector / 72 * Math.PI * 2, radius = contract.spreadRadius * 0.64;
          if (contains(p, shells, new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius))) filled++;
        }
        if (filled >= 2 && filled < 36) brokenBoughSection = true;
      }
      assert.ok(brokenBoughSection, 'At least one lower bough section must have foliage and substantial open sectors');
    } finally { form.geometry.dispose(); }
  }
});

for (const detail of ['ordinary', 'ultra'] as const) {
  test(`${detail}: clustered conifer distances retain native caps, attachment and finite exact prices`, () => {
    const expected = detail === 'ultra' ? { near: 25200, middle: 12600, far: 2808 }
      : { near: 12800, middle: 6400, far: 1504 };
    assert.deepEqual(CONIFER_DISTANCE_COUNTS[detail], expected);
    for (const variant of [0, 1, 2] as const) {
      const contract = SHARED_VEGETATION_CONTRACTS.coniferFoliage;
      const forms = buildConiferDistanceForms(detail, variant, contract);
      try {
        const near = forms.near.getAttribute('position') as THREE.BufferAttribute;
        const nearShells = components(near), boughs = 24;
        const clusters = detail === 'ultra' ? 12 : 10;
        const clusterRows = detail === 'ultra' ? 5 : 4;
        const allCaps = nearShells.map(shell => clusterFrame(near, shell,
          shell === nearShells[0] ? (detail === 'ultra' ? 10 : 8) : clusterRows));
        for (const level of ['near', 'middle', 'far'] as const) {
          const position = forms[level].getAttribute('position') as THREE.BufferAttribute;
          const shells = components(position), retained = level === 'far' ? (detail === 'ultra' ? 6 : 4) : clusters;
          assert.equal(position.count / 3, expected[level]);
          assert.equal(shells.length, 1 + boughs * (1 + retained));
          assert.ok(closedOutward(position)); assert.ok(bounded(position, contract));
          assert.ok(contains(position, [shells[0]], new THREE.Vector3(0, contract.rootY + .0001, 0)));
          const sourceCorners = new Set(Array.from({ length: near.count }, (_, i) =>
            `${near.getX(i)},${near.getY(i)},${near.getZ(i)}`));
          const nativePoints = new Set(Array.from({ length: position.count }, (_, i) =>
            `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`));
          for (let i = 0; i < position.count; i++) assert.ok(sourceCorners.has(
            `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`), 'LOD must use actual native near vertices');
          for (let bough = 0; bough < boughs; bough++) {
            const parent = shells[1 + bough * (1 + retained)];
            assert.ok(contains(position, [shells[0]], new THREE.Vector3().fromBufferAttribute(position, parent[0] * 3)));
            for (let cluster = 0; cluster < retained; cluster++) {
              const shell = shells[2 + bough * (1 + retained) + cluster];
              const root = new THREE.Vector3().fromBufferAttribute(position, shell[0] * 3);
              assert.ok(contains(position, [parent], root), `${level}: actual retained cluster must meet its own bough`);
            }
          }
          // Every actual near core and bough root/tip survives each lower mesh.
          for (let bough = -1; bough < boughs; bough++) {
            const caps = allCaps[bough < 0 ? 0 : 1 + bough * (1 + clusters)];
            assert.ok(nativePoints.has(`${caps.root.x},${caps.root.y},${caps.root.z}`));
            assert.ok(nativePoints.has(`${caps.tip.x},${caps.tip.y},${caps.tip.z}`));
          }
        }
      } finally { forms.near.dispose(); forms.middle.dispose(); forms.far.dispose(); }
    }
  });
}

test('fitting an asymmetric caller box preserves intended habit height and original root origin', () => {
  const contract: VegetationContract = { min: [-1.9, -0.2, -1], max: [1.3, 4.3, 1.5], spreadRadius: 1.2, rootY: 0 };
  for (const family of ['crown', 'coniferFoliage', 'shrub'] as VegetationFamily[]) {
    const form = buildVegetationForm(family, 'ultra', 1, contract);
    try {
      const p = form.geometry.getAttribute('position') as THREE.BufferAttribute;
      assert.ok(bounded(p, contract)); assert.ok(closedOutward(p));
      assert.ok(Array.from({ length: p.count }, (_, i) => i).some(i => p.getX(i) === 0
        && p.getZ(i) === 0 && Math.abs(p.getY(i) - contract.min[1]) < 1e-6));
      const expectedTop = contract.min[1] + (contract.max[1] - contract.min[1]) * VEGETATION_HEIGHT_SHARES[family][1];
      assert.ok(Math.abs(form.geometry.boundingBox!.max.y - expectedTop) < 1e-6);
    } finally { form.geometry.dispose(); }
  }
});

/** A root shared by several leaves is one welded graph but several closed
 * shells. Check each emitted shell's own sign; three outward leaves must not
 * hide an inward neighbour's volume at the same attachment point. */
function growthComponentsOutward(position: THREE.BufferAttribute,
  plan: ReturnType<typeof buildVegetationGrowthPlan>): boolean {
  const counts = [...plan.branches.map(branch => (branch.sectors ?? plan.branchSectors)
    * (branch.sections?.length ?? 2) * 2),
    ...plan.leaves.map(() => plan.leafSectors * plan.leafSections.length * 2)];
  let corner = 0;
  for (const triangles of counts) {
    const values = new Float32Array(triangles * 9);
    for (let i = 0; i < triangles * 3; i++) {
      values[i * 3] = position.getX(corner + i); values[i * 3 + 1] = position.getY(corner + i);
      values[i * 3 + 2] = position.getZ(corner + i);
    }
    if (!closedOutward(new THREE.BufferAttribute(values, 3))) return false;
    corner += triangles * 3;
  }
  return corner === position.count;
}

function movedOffAxis(point: readonly [number, number, number],
  parent: ReturnType<typeof buildVegetationGrowthPlan>['branches'][number], distance: number) {
  const x = parent.to[0] - parent.from[0], z = parent.to[2] - parent.from[2];
  const length = Math.hypot(x, z);
  const sideX = length > 0 ? -z / length : 1, sideZ = length > 0 ? x / length : 0;
  return [point[0] + sideX * distance, point[1], point[2] + sideZ * distance] as const;
}

// Retired nine-lobe/solid-collar assertions are preserved in this package's
// baseline. They described the rejected art, rather than the physical contract.
// Root attachment, closed outward topology, full envelope and conifer guards above
// continue to apply. A numeric pass here is not a foliage visual verdict.

for (const family of ['crown', 'shrub'] as const) for (const detail of ['ordinary', 'ultra'] as const) {
  test(`${detail} ${family} prices the actual finite growth and rejects detached closed pieces`, () => {
    for (const variant of [0, 1, 2] as const) {
      const plan = buildVegetationGrowthPlan(family, detail, variant);
      const form = buildVegetationForm(family, detail, variant, SHARED_VEGETATION_CONTRACTS[family]);
      try {
        const price = vegetationGrowthPrice(plan);
        assert.equal(form.triangles, price.triangles);
        assert.equal(form.geometryBytes, price.geometryBytes + (detail === 'ultra' ? form.triangles * 3 * 4 : 0));
        assert.equal(form.geometry.groups.length, 0);
        // Hostile records remain individually finite, closed and inside a broad
        // envelope, but cannot represent a rooted plant. A label is insufficient.
        const leaf = plan.leaves.at(-1)!;
        const looseLeaf = { ...leaf, root: movedOffAxis(leaf.root, plan.branches[leaf.parent], .05),
          tip: movedOffAxis(leaf.tip, plan.branches[leaf.parent], .05) };
        assert.throws(() => assertVegetationGrowthPlan({ ...plan,
          leaves: [...plan.leaves.slice(0, -1), looseLeaf] }), /Detached vegetation leaf/);
        const branch = plan.branches.at(-1)!;
        const looseBranch = { ...branch, from: movedOffAxis(branch.from, plan.branches[branch.parent], .10),
          to: movedOffAxis(branch.to, plan.branches[branch.parent], .10) };
        assert.throws(() => assertVegetationGrowthPlan({ ...plan,
          branches: [...plan.branches.slice(0, -1), looseBranch] }), /Detached vegetation branch/);
        const cyclic = { ...plan.branches[1], parent: plan.branches.length - 1 };
        assert.throws(() => assertVegetationGrowthPlan({ ...plan,
          branches: [plan.branches[0], cyclic, ...plan.branches.slice(2)] }), /Detached vegetation branch/);
        // Every leaf receives a semantic leaf finish and every woody branch
        // receives wood. A valid shell cannot conceal a flipped leaf component.
        const p = form.geometry.getAttribute('position') as THREE.BufferAttribute;
        const firstLeafTriangle = plan.branches.reduce((sum, branch) => sum + (branch.sectors ?? plan.branchSectors)
          * (branch.sections?.length ?? 2) * 2, 0);
        const inverted = p.clone();
        for (let triangle = firstLeafTriangle; triangle < firstLeafTriangle + plan.leafSectors * plan.leafSections.length * 2; triangle++) {
          for (let axis = 0; axis < 3; axis++) {
            const a = triangle * 9 + 3 + axis, b = triangle * 9 + 6 + axis;
            const value = inverted.array[a]; inverted.array[a] = inverted.array[b]; inverted.array[b] = value;
          }
        }
        assert.ok(growthComponentsOutward(p, plan));
        assert.equal(growthComponentsOutward(inverted, plan), false);
      } finally { form.geometry.dispose(); }
    }
  });

  test(`${detail} ${family} keeps painted rooted silhouettes in exact lower-distance subsets`, () => {
    for (const variant of [0, 1, 2] as const) {
      const contract = SHARED_VEGETATION_CONTRACTS[family];
      const forms = buildBroadleafDistanceForms(family, detail, variant, contract, (geometry, context) => {
        // Distinct source-corner values expose an accidental repaint or reordered
        // substitute. This control owns no presentation palette.
        const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < colour.count; i++) colour.setXYZ(i, i / colour.count, context.wood[i], context.leaf[i]);
      });
      try {
        const plan = buildVegetationGrowthPlan(family, detail, variant);
        let sourceCorner = 0;
        const spans: { start: number; count: number; levels: number }[] = [];
        for (const branch of plan.branches) {
          const count = (branch.sectors ?? plan.branchSectors) * (branch.sections?.length ?? 2) * 2 * 3;
          spans.push({ start: sourceCorner, count, levels: 7 }); sourceCorner += count;
        }
        for (const leaf of plan.leaves) {
          const count = plan.leafSectors * plan.leafSections.length * 2 * 3;
          spans.push({ start: sourceCorner, count, levels: leaf.levels }); sourceCorner += count;
        }
        for (const level of ['near', 'middle', 'far'] as const) {
          const p = forms[level].getAttribute('position') as THREE.BufferAttribute;
          assert.equal(p.count / 3, BROADLEAF_DISTANCE_COUNTS[detail][family][level]);
          assert.equal(p.count / 3, vegetationGrowthPrice(plan, level).triangles);
          assert.ok(bounded(p, contract)); assert.ok(closedOutward(p));
          assert.equal(forms[level].groups.length, 0); assert.equal(forms[level].index, null);
          const bit = level === 'near' ? 1 : level === 'middle' ? 2 : 4;
          const corners = spans.filter(span => (span.levels & bit) !== 0).flatMap(span =>
            Array.from({ length: span.count }, (_, i) => span.start + i));
          for (const name of ['position', 'normal', 'color']) {
            const original = forms.near.getAttribute(name) as THREE.BufferAttribute;
            const output = forms[level].getAttribute(name) as THREE.BufferAttribute;
            assert.equal(output.count, corners.length);
            for (let i = 0; i < corners.length; i++) assert.deepEqual(
              [output.getX(i), output.getY(i), output.getZ(i)],
              [original.getX(corners[i]), original.getY(corners[i]), original.getZ(corners[i])]);
          }
          assert.ok(contains(p, components(p), new THREE.Vector3(0, contract.rootY + .0001, 0)),
            'Lower detail must retain the rooted woody structure, not a floating tuft');
        }
        assert.ok(forms.far.getAttribute('position').count < forms.middle.getAttribute('position').count);
        assert.ok(forms.middle.getAttribute('position').count < forms.near.getAttribute('position').count);
      } finally { forms.near.dispose(); forms.middle.dispose(); forms.far.dispose(); }
    }
  });
}

test('every shrub habit retains a closed woody root through soil at the unchanged planting axis', () => {
  const contract = SHARED_VEGETATION_CONTRACTS.shrub;
  // Approved planting contract: real woody soil contact permits openings among
  // low leaves. A uniform opaque radial leaf pad cannot prove root contact.
  type Point = readonly [number, number, number];
  type Form = ReturnType<typeof buildVegetationForm>;
  interface Shell { readonly triangles: readonly number[]; readonly corners: readonly number[]; readonly mass: number; readonly leaf: number }
  interface MeshRead { readonly position: Float32Array; readonly shells: readonly Shell[] }
  interface CoreRead { readonly triangles: readonly (readonly [Point, Point, Point])[]; readonly min: Point; readonly max: Point }
  // Numerical intersection degeneracy only, not an admitted physical clearance,
  // attachment tolerance or alteration of any existing control threshold.
  const EPSILON = 1e-9;
  const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n];
  const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Point, b: Point): Point => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a: Point): Point => scale(a, 1 / Math.hypot(...a));
  const directions = [[1, .371, .219], [.317, 1, .613], [.271, .433, 1]].map(a => unit(a as unknown as Point));
  const point = (position: Float32Array, corner: number): Point =>
    [position[corner * 3], position[corner * 3 + 1], position[corner * 3 + 2]];
  function bits(values: Float32Array): Uint32Array {
    return new Uint32Array(values.buffer, values.byteOffset, values.length);
  }

  /** Reconstruct shells by actual complete triangle edges, not a shared cap centre.
   * Uses stored position bits, without builder IDs,
   * record positions/parameters, shell row counts or expected radial formula. */
  function readMesh(form: Form): MeshRead {
    assert.equal(form.geometry.index, null, 'Planting proof reads actual non-indexed native triangles');
    const attribute = form.geometry.getAttribute('position'), position = attribute.array;
    assert.ok(position instanceof Float32Array, 'Planting proof requires the stored native Float32 positions');
    const words = bits(position);
    assert.equal(attribute.itemSize, 3); assert.equal(attribute.count % 3, 0);
    const triangleCount = attribute.count / 3;
    const parent = Int32Array.from({ length: triangleCount }, (_, i) => i);
    const find = (initial: number): number => {
      let node = initial;
      while (parent[node] !== node) { parent[node] = parent[parent[node]]; node = parent[node]; }
      return node;
    };
    const key = (corner: number): string => `${words[corner * 3]}/${words[corner * 3 + 1]}/${words[corner * 3 + 2]}`;
    const firstEdge = new Map<string, number>();
    for (let triangle = 0; triangle < triangleCount; triangle++) for (let local = 0; local < 3; local++) {
      const a = key(triangle * 3 + local), b = key(triangle * 3 + (local + 1) % 3);
      assert.notEqual(a, b, 'Actual closed component contains a collapsed triangle edge');
      const identity = a < b ? `${a}|${b}` : `${b}|${a}`, held = firstEdge.get(identity);
      if (held === undefined) firstEdge.set(identity, triangle);
      else parent[find(triangle)] = find(held);
    }
    const byRoot = new Map<number, number[]>();
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const root = find(triangle), group = byRoot.get(root) ?? []; group.push(triangle); byRoot.set(root, group);
    }
    const shells: Shell[] = [];
    for (const triangles of byRoot.values()) {
      const representative = triangles[0] * 3, mass = form.context.mass[representative], leaf = form.context.leaf[representative];
      const corners = new Map<string, number>(), directed = new Map<string, number>();
      let volumeSix = 0;
      for (const triangle of triangles) {
        const a = point(position, triangle * 3), b = point(position, triangle * 3 + 1), c = point(position, triangle * 3 + 2);
        volumeSix += dot(a, cross(b, c));
        for (let local = 0; local < 3; local++) {
          const from = key(triangle * 3 + local), to = key(triangle * 3 + (local + 1) % 3);
          const edge = `${from}|${to}`; directed.set(edge, (directed.get(edge) ?? 0) + 1);
        }
      }
      for (const [edge, walks] of directed) {
        const [from, to] = edge.split('|');
        assert.equal(walks, 1, 'Actual component repeats a directed triangle edge');
        assert.equal(directed.get(`${to}|${from}`), 1, 'Actual component lacks an opposite edge twin');
      }
      assert.ok(volumeSix > 0, 'Actual closed component must have positive outward enclosed volume');
      for (const triangle of triangles) for (let local = 0; local < 3; local++) {
        const corner = triangle * 3 + local;
        assert.equal(form.context.mass[corner], mass, 'A connected shell has mixed semantic mass');
        assert.equal(form.context.leaf[corner], leaf, 'A connected shell mixes fan/needle semantics');
        corners.set(key(corner), corner);
      }
      shells.push({ triangles, corners: [...corners.values()], mass, leaf });
    }
    return { position, shells };
  }
  function pointOnTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
    const e = sub(b, a), f = sub(c, a), normal = cross(e, f), length = Math.hypot(...normal);
    if (length <= EPSILON) return false;
    if (Math.abs(dot(sub(p, a), normal)) / length > EPSILON) return false;
    const offset = sub(p, a), ee = dot(e, e), ef = dot(e, f), ff = dot(f, f);
    const oe = dot(offset, e), of = dot(offset, f), denominator = ee * ff - ef * ef;
    if (!(denominator > 0)) return false;
    const u = (oe * ff - of * ef) / denominator, v = (of * ee - oe * ef) / denominator;
    return u >= -EPSILON && v >= -EPSILON && u + v <= 1 + EPSILON;
  }
  function rayHit(p: Point, direction: Point, a: Point, b: Point, c: Point): number | null {
    const e = sub(b, a), f = sub(c, a), h = cross(direction, f), determinant = dot(e, h);
    if (Math.abs(determinant) <= EPSILON) return null;
    const inverse = 1 / determinant, offset = sub(p, a), u = dot(offset, h) * inverse;
    if (u < -EPSILON || u > 1 + EPSILON) return null;
    const q = cross(offset, e), v = dot(direction, q) * inverse;
    if (v < -EPSILON || u + v > 1 + EPSILON) return null;
    const distance = dot(f, q) * inverse;
    return distance > EPSILON ? distance : null;
  }
  function prepareCore(position: Float32Array, shell: Shell, translation: Point): CoreRead {
    const triangles = shell.triangles.map(triangle => [0, 1, 2].map(local =>
      add(point(position, triangle * 3 + local), translation)) as [Point, Point, Point]);
    const all = triangles.flat();
    return { triangles, min: [0, 1, 2].map(axis => Math.min(...all.map(p => p[axis]))) as unknown as Point,
      max: [0, 1, 2].map(axis => Math.max(...all.map(p => p[axis]))) as unknown as Point };
  }
  /** Actual core triangles; no box/core-radius approximation can ACCEPT a point.
   * Boundary contact alone does not pass. Three nonparallel ray parities agree.
   * Exact triangle-derived outer bounds only reject definitely outside points. */
  function interior(core: CoreRead, p: Point, useBoundsRejection = true): boolean {
    if (useBoundsRejection && p.some((value, axis) => value < core.min[axis] || value > core.max[axis])) return false;
    if (core.triangles.some(([a, b, c]) => pointOnTriangle(p, a, b, c))) return false;
    return directions.every(direction => {
      const hits: number[] = [];
      for (const [a, b, c] of core.triangles) { const distance = rayHit(p, direction, a, b, c); if (distance !== null) hits.push(distance); }
      hits.sort((a, b) => a - b);
      let unique = 0, last = -Infinity;
      for (const hit of hits) if (hit - last > EPSILON) { unique++; last = hit; }
      return unique % 2 === 1;
    });
  }

  /** Exact source-tagged first woody component, reconstructed from actual bits.
   * A leaf pad cannot masquerade as the planted scaffold. Existing rooted graph,
   * closed-shell and component-count controls continue to identify that owner. */
  function readRoot(form:Form){
   const mesh=readMesh(form),shell=[...mesh.shells].sort((a,b)=>a.triangles[0]-b.triangles[0])[0];
   assert.equal(shell.triangles[0],0);assert.equal(shell.leaf,0);
   for(const triangle of shell.triangles)for(let local=0;local<3;local++)assert.equal(form.context.wood[triangle*3+local],1);
   return{mesh,shell};
  }
  interface SectionObservation{readonly points:number;readonly segments:number;readonly closedSingleContour:boolean;readonly area:number}
  /** Actual root triangle/horizontal-plane intersections. Numeric key quantizes
   * ONLY coincident solver endpoints; no physical penetration is admitted by it. */
  function soilSection(position:Float32Array,shell:Shell):SectionObservation{
   const nodes=new Map<string,{point:Point;neighbours:Set<string>}>,segments=new Set<string>();
   const key=(p:Point)=>`${Math.round(p[0]/EPSILON)}/${Math.round(p[2]/EPSILON)}`;
   for(const triangle of shell.triangles){
    const vertices=[0,1,2].map(local=>point(position,triangle*3+local));const intersections=new Map<string,Point>();
    for(let i=0;i<3;i++){
     const a=vertices[i],b=vertices[(i+1)%3],ay=a[1]-contract.rootY,by=b[1]-contract.rootY;
     if(ay===0)intersections.set(key(a),a);
     if(ay*by<0){const t=-ay/(by-ay),q:Point=[a[0]+(b[0]-a[0])*t,contract.rootY,a[2]+(b[2]-a[2])*t];intersections.set(key(q),q);}
    }
    if(intersections.size!==2)continue;
    const [[ka,a],[kb,b]]=[...intersections];if(ka===kb)continue;
    const edge=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;if(segments.has(edge))continue;segments.add(edge);
    if(!nodes.has(ka))nodes.set(ka,{point:a,neighbours:new Set()});if(!nodes.has(kb))nodes.set(kb,{point:b,neighbours:new Set()});
    nodes.get(ka)!.neighbours.add(kb);nodes.get(kb)!.neighbours.add(ka);
   }
   const first=nodes.keys().next().value as string|undefined;
   if(first===undefined||nodes.size<3||[...nodes.values()].some(node=>node.neighbours.size!==2))return{points:nodes.size,segments:segments.size,closedSingleContour:false,area:0};
   let previous:string|undefined,current=first;const visited=new Set<string>(),contour:Point[]=[];
   while(!visited.has(current)){visited.add(current);contour.push(nodes.get(current)!.point);const next=[...nodes.get(current)!.neighbours].find(k=>k!==previous);if(next===undefined)break;previous=current;current=next;}
   const closed=current===first&&visited.size===nodes.size;
   let signed=0;for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length];signed+=a[0]*b[2]-b[0]*a[2];}
   return{points:nodes.size,segments:segments.size,closedSingleContour:closed,area:closed?Math.abs(signed)*.5:0};
  }
  function plantingContact(position:Float32Array,shell:Shell):boolean{
   const actual=prepareCore(position,shell,[0,0,0]);
   if(!(actual.min[1]<contract.rootY&&actual.max[1]>contract.rootY))return false;
   if(!interior(actual,[0,contract.rootY,0]))return false;
   const section=soilSection(position,shell);return section.closedSingleContour&&section.area>0;
  }
  for (const detail of ['ordinary', 'ultra'] as const) for (const variant of [0, 1, 2] as const) {
    const form = buildVegetationForm('shrub', detail, variant, contract);
    const forms = buildBroadleafDistanceForms('shrub', detail, variant, contract);
    try {
      const { mesh, shell } = readRoot(form);
      assert.ok(plantingContact(mesh.position, shell),
        'Actual closed woody root must penetrate soil, enclose the unchanged axis, and retain a nonzero closed native section');
      for (const level of ['near', 'middle', 'far'] as const) {
        const position = forms[level].getAttribute('position').array;
        assert.ok(position instanceof Float32Array);
        assert.ok(plantingContact(position, shell), `${detail}/${variant}/${level}: actual woody planting survives distance selection`);
      }
      // Keep the historical complete-plant floating offset, including its .20
      // fraction and habit height share; apply it to the root-only control too.
      const height = (contract.max[1] - contract.min[1]) * VEGETATION_HEIGHT_SHARES.shrub[variant];
      const floating = new Float32Array(mesh.position);
      for (let i = 1; i < floating.length; i += 3) floating[i] += height * .20;
      assert.equal(plantingContact(floating, shell), false, 'A whole floating plant must fail actual woody soil contact');
      const rootOnly = new Float32Array(mesh.position);
      for (const triangle of shell.triangles) for (let local = 0; local < 3; local++)
        rootOnly[(triangle * 3 + local) * 3 + 1] += height * .20;
      assert.equal(plantingContact(rootOnly, shell), false, 'Unchanged leaves cannot conceal a floating woody root');
      const offAxis = new Float32Array(mesh.position);
      for (const triangle of shell.triangles) for (let local = 0; local < 3; local++)
        offAxis[(triangle * 3 + local) * 3] += (contract.max[0] - contract.min[0]) * 4;
      assert.equal(plantingContact(offAxis, shell), false, 'A closed root displaced off the unchanged axis must fail containment');
    } finally {
      form.geometry.dispose();
      for (const level of ['near', 'middle', 'far'] as const) forms[level].dispose();
    }
  }
});

test('crown leader continues the unchanged trunk cap in every habit and tier', () => {
  const contract = SHARED_VEGETATION_CONTRACTS.crown;
  assert.ok(contract.rootJoin);
  for (const detail of ['ordinary', 'ultra'] as const) for (const variant of [0, 1, 2] as const) {
    const tree = detail === 'ultra' ? contract.rootJoin!.ultra! : contract.rootJoin!;
    const plan = buildVegetationGrowthPlan('crown', detail, variant);
    const form = buildVegetationForm('crown', detail, variant, contract);
    try {
      const position = form.geometry.getAttribute('position') as THREE.BufferAttribute;
      const leaderTriangles = (plan.branches[0].sectors ?? plan.branchSectors)
        * (plan.branches[0].sections?.length ?? 2) * 2;
      const leader = [Array.from({ length: leaderTriangles }, (_, i) => i)];
      const coversOriginalCap = (p: THREE.BufferAttribute) => {
        for (let edge = 0; edge < tree.sides; edge++) for (const fraction of [0, .5]) {
          const theta = (tree.phase ?? 0) + edge / tree.sides * Math.PI * 2;
          const next = (tree.phase ?? 0) + (edge + 1) / tree.sides * Math.PI * 2;
          // Actual CylinderGeometry or Ultra lathe cap corners/midpoints,
          // just inside the source cap. The original inset/enclosure remains.
          const px = (angle: number) => tree.style === 'lathe-smooth' ? Math.cos(angle) : Math.sin(angle);
          const pz = (angle: number) => tree.style === 'lathe-smooth' ? -Math.sin(angle) : Math.cos(angle);
          const x = (px(theta) * (1 - fraction) + px(next) * fraction) * tree.radiusTop * .999;
          const z = (pz(theta) * (1 - fraction) + pz(next) * fraction) * tree.radiusTop * .999;
          if (!contains(p, leader, new THREE.Vector3(x, contract.rootY + .0001, z))) return false;
        }
        return true;
      };
      assert.ok(coversOriginalCap(position), 'The visible crown must conceal the unchanged flat trunk cap');
      const narrowed = position.clone();
      for (let corner = 0; corner < leaderTriangles * 3; corner++) {
        narrowed.setX(corner, narrowed.getX(corner) * .50);
        narrowed.setZ(corner, narrowed.getZ(corner) * .50);
      }
      assert.equal(coversOriginalCap(narrowed), false,
        'A closed narrower pole mounted on the cap must fail the same source dimensions');
    } finally { form.geometry.dispose(); }
  }
});
