/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import { streetDoorOffset, streetEdgePatches, streetFronts, streetGroundPatches, STREET_PAVING } from '../level/streetFronts.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { residentialSites, residentialDoorOffset, parkCaseSites, RESIDENTIAL_SITE_RULES }
  from '../level/districtSites.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { paintedSurfaces, PlanTerrainSampler } from '../simulation/planSampler.ts';
import { withStreetGround } from './streetGround.ts';

/** A known flat shop beside one genuinely paved straight, with rotated variants. */
function fixture(angle = 0, heights?: (x: number, z: number) => number): LevelPlan {
  const c = Math.cos(angle), sn = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + sn * point.z, y: point.y,
    z: -sn * point.x + c * point.z });
  const columns = 121, rows = 121, spacing = 1, originX = -60, originZ = -60;
  const samples: number[] = [], surfaces: SurfaceId[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    samples.push(heights?.(originX + column, originZ + row) ?? 0);
  }
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const x = originX + column + 0.5, z = originZ + row + 0.5;
    const localX = c * x - sn * z, localZ = sn * x + c * z;
    surfaces.push(Math.abs(localX) < 43 && localZ >= 15 && localZ < 19
      ? localX < 0 ? 'brick' : 'pavement' : 'grass');
  }
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 17 }),
    headingY: Math.PI / 2 + angle, halfWidth: 2, gradient: 0, surface: 'pavement' as const });
  return {
    id: 'street-ground-fixture',
    spawn: { position: rotate({ x: 0, y: 0, z: 20 }), headingY: angle },
    surround: { height: 0, surface: 'grass' },
    heightfield: { originX, originZ, columns, rows, spacing, heights: samples, surfaces },
    segments: [{ id: 'street', entry: socket(-40), exit: socket(40), colliders: [] }],
    checkpoints: [],
    props: [{ kind: 'building', position: { x: 0, y: 0, z: 0 }, rotationY: angle,
      scale: 1, size: { x: 10, y: 10, z: 6 }, look: 'commercial' }],
    solids: [{ centre: { x: 0, y: 5, z: 0 }, halfExtents: { x: 5, y: 5, z: 3 },
      rotationY: angle, surface: 'brick' }],
  };
}

/** Two accepted shops on the same straight, with enough real street for both courts. */
function pairedFixture(angle = 0, distance = 40): LevelPlan {
  const plan = fixture(angle), c = Math.cos(angle), sn = Math.sin(angle);
  const position = { x: c * distance, y: 0, z: -sn * distance };
  const surfaces = plan.heightfield.surfaces.map((_surface, index): SurfaceId => {
    const column = index % (plan.heightfield.columns - 1), row = Math.floor(index / (plan.heightfield.columns - 1));
    const x = plan.heightfield.originX + column + 0.5, z = plan.heightfield.originZ + row + 0.5;
    const localX = c * x - sn * z, localZ = sn * x + c * z;
    return Math.abs(localX) < 55 && localZ >= 15 && localZ < 19
      ? localX < 0 ? 'brick' : 'pavement' : 'grass';
  });
  return { ...plan, heightfield: { ...plan.heightfield, surfaces },
    props: [...plan.props!, { ...plan.props![0], position }],
    solids: [...plan.solids!, { ...plan.solids![0], centre: { ...position, y: 5 } }],
    segments: plan.segments.map(segment => ({ ...segment,
      exit: { ...segment.exit, position: { x: c * 80 + sn * 17, y: 0, z: -sn * 80 + c * 17 } } })) };
}

const baseGround = (plan: LevelPlan) => new PlanTerrainSampler({ ...plan, solids: [],
  segments: plan.segments.map(segment => ({ ...segment, colliders: [] })) });

test('paving decorates the finished generated plan without changing generation inputs, heights, routes or solids', () => {
  for (const seed of ['euc', 'corner', 'sweep-15', 'city', 'rider', 'alpha', 'night', 'seed-8']) {
    const original = generateLevel({ seed }).plan;
    const snapshot = JSON.stringify(original);
    const decorated = withStreetGround(original);
    assert.equal(JSON.stringify(original), snapshot, `${seed}: source plan remains immutable`);
    assert.equal(decorated.id, original.id);
    for (const key of ['heightfield', 'segments', 'props', 'solids', 'checkpoints', 'spawn'] as const) {
      assert.equal(decorated[key], original[key], `${seed}: ${key} retains its original owner`);
    }
    assert.ok(decorated.groundSurfacePatches!.length >= 3 && decorated.groundSurfacePatches!.length <= 22);
    assert.equal(new Set(decorated.groundSurfacePatches!.filter(patch => !patch.id.startsWith('street-sidewalk-'))
      .map(patch => patch.footprint!.id)).size, 3 + 2 * environmentSites(decorated).length + residentialSites(decorated).length,
    'industrial sites own two approaches; the admitted house owns one doorway strip');
    assert.equal(streetFronts(decorated).length, 3);
    assert.equal(withStreetGround(decorated), decorated, 'redecorating is idempotent');
    const cells = new Set(decorated.groundSurfacePatches!.flatMap(patch => patch.triangles.map(triangle => triangle.cell)));
    assert.ok(cells.size < STREET_PAVING.maximumCellsPerPolygon * 6);
    const before = baseGround(original), after = baseGround(decorated);
    const oldSample = createGroundSample(), newSample = createGroundSample();
    for (const patch of decorated.groundSurfacePatches!) for (const triangle of patch.triangles) {
      const x = triangle.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / 3;
      const z = triangle.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / 3;
      before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
      assert.equal(patch.sourceSurface, oldSample.surface);
      assert.equal(newSample.surface, oldSample.surface === 'grass' ? 'pavement' : oldSample.surface,
        `${seed}: original brick/pavement/roughPavement keep their own riding semantics`);
    }
  }
});

test('one full-face forecourt continuously joins the existing street, with exact sub-cell side edges', () => {
  const original = fixture(), decorated = withStreetGround(original);
  const front = streetFronts(decorated)[0], door = streetDoorOffset(front);
  const sampler = baseGround(decorated), sample = createGroundSample();
  const at = (x: number, z: number) => sampler.sampleGround(front.position.x + x,
    front.position.z + z, sample).surface;
  assert.equal(at(0, 0.60), 'pavement');
  assert.equal(at(front.faceWidth / 2 - 0.001, 0.6), 'pavement');
  assert.equal(at(front.faceWidth / 2 + 0.001, 0.6), 'grass');
  const half = front.faceWidth / 2;
  for (const distance of [2, 6, 10]) {
    // Former triangular grass remnants and the old T junction are covered
    // across the whole active face, not only around the side door.
    for (const x of [-half + 0.001, -half / 2, 0, half / 2, half - 0.001, door]) {
      assert.equal(at(x, distance), 'pavement');
    }
    assert.equal(at(-half - 0.001, distance), 'grass');
    assert.equal(at(half + 0.001, distance), 'grass');
  }
  const footprint = decorated.groundSurfacePatches![0].footprint!;
  assert.equal(footprint.width, front.faceWidth);
  assert.equal(footprint.near, -STREET_PAVING.frontageOverlap);
  assert.equal(new Set(decorated.groundSurfacePatches!.map(patch => patch.footprint)).size, 1,
    'surface fragments share one authoritative layout frame');
  const far = front.position.z + footprint.far;
  const oldSampler = baseGround(original);
  for (const x of [-0.000001, 0, 0.000001]) {
    assert.equal(sampler.sampleGround(x, far, sample).surface,
      oldSampler.sampleGround(x, far, sample).surface,
      'touching source fragments preserve the road material on either side of a grid boundary');
  }
  for (let x = -half; x <= half; x += 0.2) {
    const expected = oldSampler.sampleGround(x, far, sample).surface;
    assert.ok(['brick', 'pavement'].includes(expected), 'complete front reaches a paved cross-section');
    assert.equal(sampler.sampleGround(x, far, sample).surface, expected);
    assert.equal(sampler.sampleGround(x, 16, sample).surface,
      oldSampler.sampleGround(x, 16, sample).surface, 'existing road material is preserved');
  }
  // A fragment ending on x=5 belongs to the left source cell. The right-cell
  // assignment of a ground query must still agree on that shared edge.
  assert.equal(at(5, 0.6), 'pavement');
});

test('clipped drawing vertices, sampler heights, normals and crisp surface coverage share the original triangle planes', () => {
  const original = fixture(0.77, (x, z) => 0.025 * Math.sin(x * 0.47) + 0.018 * Math.cos(z * 0.61));
  const decorated = withStreetGround(original);
  const before = baseGround(original), after = baseGround(decorated);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  assert.equal(decorated.groundSurfacePatches?.length, 3);
  let changedGrass = 0, nonzeroHeight = 0;
  for (const patch of decorated.groundSurfacePatches!) for (const triangle of patch.triangles) {
    const [a, b, c] = triangle.vertices;
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    assert.ok(ny > 0, 'rendered fragments have upward winding');
    assert.ok(triangle.cell >= 0 && triangle.cell < original.heightfield.surfaces.length);
    for (const vertex of triangle.vertices) {
      before.sampleGround(vertex.x, vertex.z, oldSample);
      assert.ok(Math.abs(oldSample.height - vertex.y) < 1e-9, 'drawing uses the existing exact triangle height');
      if (Math.abs(vertex.y) > 1e-3) nonzeroHeight++;
    }
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
    assert.equal(newSample.surface, patch.surface);
    assert.equal(newSample.surface, oldSample.surface === 'grass' ? 'pavement' : oldSample.surface);
    assert.equal(newSample.height, oldSample.height);
    assert.deepEqual(newSample.normal, oldSample.normal);
    assert.equal(newSample.offCourse, oldSample.offCourse);
    if (oldSample.surface === 'grass') changedGrass++;
  }
  assert.ok(nonzeroHeight > 20, 'fixture exercises non-coplanar cells, not a flat overlay');
  assert.ok(changedGrass > 20, 'positive control proves actual surface replacement');
  const front = streetFronts(decorated)[0], offset = streetDoorOffset(front);
  const local = (x: number, z: number) => ({ x: front.position.x + Math.cos(front.yaw) * x + Math.sin(front.yaw) * z,
    z: front.position.z - Math.sin(front.yaw) * x + Math.cos(front.yaw) * z });
  const inside = local(offset, 6), outside = local(front.faceWidth / 2 + 0.01, 6);
  assert.equal(after.sampleGround(inside.x, inside.z, newSample).surface, 'pavement');
  assert.equal(after.sampleGround(outside.x, outside.z, newSample).surface, 'grass');
});

test('surface-only paving never overrides higher authored collider tops or obstacle rays', () => {
  const original = fixture();
  original.segments[0].colliders.push({ centre: { x: 3.22, y: 0.1, z: 9 },
    halfExtents: { x: 0.7, y: 0.1, z: 0.3 }, rotationY: 0, surface: 'wood' });
  const decorated = withStreetGround(original), before = new PlanTerrainSampler(original), after = new PlanTerrainSampler(decorated);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  assert.equal(decorated.groundSurfacePatches?.length, 3);
  for (const point of [{ x: 0, z: 2.98 }, { x: 3.22, z: 9 }]) {
    before.sampleGround(point.x, point.z, oldSample); after.sampleGround(point.x, point.z, newSample);
    assert.deepEqual(newSample, oldSample, 'building roof and low kerb keep their original height, normal and surface');
  }
  assert.equal(after.sampleGround(3.22, 9, newSample).surface, 'wood');
  const origin = { x: 0, y: 1, z: 10 }, direction = { x: 0, y: 0, z: -1 };
  assert.equal(after.raycastObstacle(origin, direction, 20), before.raycastObstacle(origin, direction, 20));
  assert.equal(after.raycast(origin, direction, 20), before.raycast(origin, direction, 20));
});

test('offset-door blockers, incompatible heights, trails and wrong building types refuse storefront paving', () => {
  const original = fixture();
  const blocked = { ...original, solids: [...original.solids!, { centre: { x: 3.22, y: 2, z: 10 },
    halfExtents: { x: 0.25, y: 2, z: 0.3 }, rotationY: 0.3, surface: 'pavement' as const }] };
  assert.equal(streetFronts(blocked).length, 0, 'side door blocker lies away from the old building-centre approach');
  assert.equal(withStreetGround(blocked), blocked);
  const wrongType = { ...original, props: original.props!.map(prop => ({ ...prop, look: 'clockTower' as const })) };
  assert.equal(withStreetGround(wrongType), wrongType);
  const trail = { ...original, segments: original.segments.map(segment => ({ ...segment,
    entry: { ...segment.entry, surface: 'dirt' as const }, exit: { ...segment.exit, surface: 'dirt' as const } })) };
  assert.equal(withStreetGround(trail), trail);
  const raised = { ...original, heightfield: { ...original.heightfield,
    heights: original.heightfield.heights.map(() => 0.5) } };
  assert.equal(streetFronts(raised).length, 0);
  const steep = fixture(0, (_x, z) => 0.2 * (z - 3));
  assert.equal(streetFronts(steep).length, 0);
  const interrupted = { ...original, heightfield: { ...original.heightfield,
    surfaces: original.heightfield.surfaces.map((surface, index) => {
      const row = Math.floor(index / (original.heightfield.columns - 1));
      return row === 68 ? 'dirt' as const : surface;
    }) } };
  assert.equal(streetFronts(interrupted).length, 0, 'forecourt cannot repaint an intervening trail');
  assert.equal(streetFronts({ ...original, solids: [] }).length, 0, 'the original closed host solid is required');
  const unprotected = { ...original, solids: original.solids!.map(solid => ({ ...solid,
    halfExtents: { ...solid.halfExtents, x: 3 } })) };
  assert.equal(streetFronts(unprotected).length, 0, 'a smaller collider cannot protect the full shop room');
});

test('an original slender streetlight can stand in the forecourt while the actual doorway approach stays clear', () => {
  const original = fixture();
  const addLamp = (x: number): LevelPlan => ({ ...original,
    props: [...original.props!, { kind: 'lampPost', position: { x, y: 0, z: 9 }, rotationY: 0, scale: 1 }],
    solids: [...original.solids!, { centre: { x, y: 2, z: 9 }, halfExtents: { x: 0.10, y: 2, z: 0.10 },
      rotationY: 0, surface: 'wood' }] });
  const aroundLamp = addLamp(0), decorated = withStreetGround(aroundLamp);
  assert.equal(streetFronts(aroundLamp).length, 1, 'a lamp in the old centre approach remains valid street furniture');
  assert.equal(decorated.solids, aroundLamp.solids, 'lamp is neither moved nor removed');
  const oldSampler = new PlanTerrainSampler(aroundLamp), sampler = new PlanTerrainSampler(decorated);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  assert.deepEqual(sampler.sampleGround(0, 9, newSample), oldSampler.sampleGround(0, 9, oldSample));
  assert.equal(baseGround(decorated).sampleGround(0.2, 9, newSample).surface, 'pavement');
  assert.equal(streetFronts(addLamp(streetDoorOffset(streetFronts(original)[0]))).length, 0,
    'the same lamp is refused inside the actual clear door approach');
  const wide = { ...aroundLamp, solids: aroundLamp.solids!.map((solid, index) => index === 1
    ? { ...solid, halfExtents: { ...solid.halfExtents, x: 1 } } : solid) };
  assert.equal(streetFronts(wide).length, 0, 'a wide solid cannot borrow the street-furniture exception');
});

test('rotated frontages retain door alignment, sparse spacing and bounded surface data', () => {
  const angle = 0.77, original = streetFronts(fixture())[0], rotatedPlan = fixture(angle);
  const rotated = streetFronts(rotatedPlan)[0];
  assert.ok(rotated);
  assert.ok(Math.abs(rotated.yaw - original.yaw - angle) < 1e-9);
  assert.ok(Math.abs(rotated.position.x - Math.sin(angle) * original.position.z) < 1e-9);
  assert.ok(Math.abs(rotated.position.z - Math.cos(angle) * original.position.z) < 1e-9);
  assert.equal(streetDoorOffset(rotated), streetDoorOffset(original));
  assert.equal(withStreetGround(rotatedPlan).groundSurfacePatches?.length, 3);
  const fineField: Heightfield = { ...rotatedPlan.heightfield, spacing: 0.01 };
  assert.equal(streetFronts({ ...rotatedPlan, heightfield: fineField }).length, 0,
    'an incompatible field cannot admit an unbounded fine paving mesh');
});

test('paving participates in surface diagnostics and preserves unrelated precise patches', () => {
  const original = fixture();
  const other = { id: 'authored-walk', surface: 'wood' as const,
    triangles: [{ cell: 0, vertices: [{ x: -60, y: 0, z: -60 }, { x: -59, y: 0, z: -59 },
      { x: -59, y: 0, z: -60 }] as const }] };
  const decorated = withStreetGround({ ...original, groundSurfacePatches: [other] });
  assert.equal(decorated.groundSurfacePatches?.[0], other);
  assert.ok(paintedSurfaces(decorated).has('wood'));
  assert.ok(paintedSurfaces(decorated).has('pavement'));
  assert.equal(withStreetGround(decorated), decorated);
});

test('nearby courts share one exact two-metre sidewalk strip without spreading shop labels', () => {
  const original = pairedFixture(), fronts = streetFronts(original);
  assert.equal(fronts.length, 2);
  assert.equal(fronts[0].streetSegmentId, 'street');
  assert.equal(fronts[1].streetSegmentId, 'street');
  const courts = fronts.flatMap(front => streetGroundPatches(original, front));
  const links = streetEdgePatches(original, fronts, courts);
  assert.ok(links.length > 0);
  assert.equal(new Set(links.map(patch => patch.footprint!.id)).size, 1);
  const footprint = links[0].footprint!;
  assert.equal(footprint.width, 30);
  assert.equal(footprint.far - footprint.near, STREET_PAVING.sidewalkWidth);
  const decorated = withStreetGround(original), sampler = baseGround(decorated), sample = createGroundSample();
  for (const key of ['heightfield', 'segments', 'props', 'solids'] as const) assert.equal(decorated[key], original[key]);
  assert.equal(streetFronts(decorated).length, 2);
  assert.equal(withStreetGround(decorated), decorated);
  for (const x of [4.999, 5, 5.001, 10, 20, 30, 34.999, 35, 35.001]) {
    assert.equal(sampler.sampleGround(x, 14, sample).surface, 'pavement', 'court-strip-court join is continuous');
  }
  assert.equal(sampler.sampleGround(20, 3 + footprint.near - 0.001, sample).surface, 'grass');
  assert.equal(sampler.sampleGround(20, 3 + footprint.near + 0.001, sample).surface, 'pavement');
  assert.equal(sampler.sampleGround(20, 3 + footprint.far, sample).surface, 'pavement');
  assert.equal(sampler.sampleGround(20, 1, sample).surface, 'grass', 'the intervening lot is not broadly repaved');
});

test('rotated sidewalk fragments preserve exact original planes and source street surfaces', () => {
  const original = pairedFixture(0.77), fronts = streetFronts(original), links = streetEdgePatches(original, fronts);
  assert.equal(fronts.length, 2);
  assert.ok(links.length > 0);
  const decorated = withStreetGround(original), before = baseGround(original), after = baseGround(decorated);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  let grass = 0, oldRoad = 0;
  for (const patch of links) for (const triangle of patch.triangles) {
    for (const vertex of triangle.vertices) {
      assert.ok(Math.abs(before.sampleGround(vertex.x, vertex.z, oldSample).height - vertex.y) < 1e-9);
    }
    const x = triangle.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / 3;
    const z = triangle.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / 3;
    before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
    assert.equal(patch.sourceSurface, oldSample.surface);
    assert.equal(newSample.height, oldSample.height);
    assert.deepEqual(newSample.normal, oldSample.normal);
    assert.equal(newSample.surface, oldSample.surface === 'grass' ? 'pavement' : oldSample.surface);
    if (oldSample.surface === 'grass') grass++; else oldRoad++;
  }
  assert.ok(grass > 10 && oldRoad > 0, 'exercise new paving and preserved street fragments');
  assert.ok(new Set(links.flatMap(patch => patch.triangles.map(triangle => triangle.cell))).size
    <= STREET_PAVING.maximumCellsPerPolygon);
});

test('sidewalk links refuse incompatible streets, facing, gap, wide blockers, trails, slopes and height changes', () => {
  const original = pairedFixture(), fronts = streetFronts(original);
  assert.equal(streetEdgePatches(original, fronts.map((front, index) => index === 1
    ? { ...front, streetSegmentId: 'another-street' } : front)).length, 0);
  assert.equal(streetEdgePatches(original, fronts.map((front, index) => index === 1
    ? { ...front, yaw: front.yaw + Math.PI } : front)).length, 0);
  const distant = pairedFixture(0, 44), distantFronts = streetFronts(distant);
  assert.equal(distantFronts.length, 2);
  assert.equal(streetEdgePatches(distant, distantFronts).length, 0, 'a gap beyond 32 m is not paved');
  const blocked = { ...original, solids: [...original.solids!, { centre: { x: 20, y: 2, z: 14 },
    halfExtents: { x: 1, y: 2, z: 0.5 }, rotationY: 0.5, surface: 'brick' as const }] };
  assert.equal(streetFronts(blocked).length, 2, 'the two courts remain individually valid');
  assert.equal(streetEdgePatches(blocked, streetFronts(blocked)).length, 0);
  const trail = { ...original, heightfield: { ...original.heightfield,
    surfaces: original.heightfield.surfaces.map((surface, index) => {
      const x = original.heightfield.originX + index % (original.heightfield.columns - 1) + 0.5;
      const z = original.heightfield.originZ + Math.floor(index / (original.heightfield.columns - 1)) + 0.5;
      return x > 10 && x < 30 && z >= 13 && z < 16 ? 'dirt' as const : surface;
    }) } };
  assert.equal(streetFronts(trail).length, 2);
  assert.equal(streetEdgePatches(trail, streetFronts(trail)).length, 0);
  for (const elevation of [0.2, 0.5]) {
    const changed = { ...original, heightfield: { ...original.heightfield,
      heights: original.heightfield.heights.map((height, index) => {
        const x = original.heightfield.originX + index % original.heightfield.columns;
        const z = original.heightfield.originZ + Math.floor(index / original.heightfield.columns);
        return x >= 10 && x <= 30 && z >= 14 && z <= 15 ? elevation : height;
      }) } };
    assert.equal(streetFronts(changed).length, 2);
    assert.equal(streetEdgePatches(changed, streetFronts(changed)).length, 0,
      'existing ground cannot be flattened or stepped to force a sidewalk');
  }
});

test('a sidewalk keeps original lamps and their collision while rejecting a wide substitute', () => {
  const original = pairedFixture();
  const lamp = { ...original,
    props: [...original.props!, { kind: 'lampPost' as const, position: { x: 20, y: 0, z: 14 }, rotationY: 0, scale: 1 }],
    solids: [...original.solids!, { centre: { x: 20, y: 2, z: 14 }, halfExtents: { x: 0.1, y: 2, z: 0.1 },
      rotationY: 0, surface: 'wood' as const }] };
  assert.ok(streetEdgePatches(lamp, streetFronts(lamp)).length > 0);
  const decorated = withStreetGround(lamp);
  assert.equal(decorated.props, lamp.props); assert.equal(decorated.solids, lamp.solids);
  assert.deepEqual(new PlanTerrainSampler(decorated).sampleGround(20, 14, createGroundSample()),
    new PlanTerrainSampler(lamp).sampleGround(20, 14, createGroundSample()));
  const wide = { ...lamp, solids: lamp.solids.map((solid, index) => index === 2
    ? { ...solid, halfExtents: { ...solid.halfExtents, x: 1 } } : solid) };
  assert.equal(streetEdgePatches(wide, streetFronts(wide)).length, 0);
});

test('commercial and industrial paving precede one shared-offset domestic strip without changing original owners', () => {
  const base = fixture();
  const building = (x: number, look: 'commercial' | 'industrial' | 'residential', size: { x: number; y: number; z: number }) => ({
    kind: 'building' as const, position: { x, y: 0, z: 0 }, rotationY: 0, scale: 1, look, size,
  });
  const props = [building(-30, 'commercial', { x: 10, y: 10, z: 6 }),
    building(0, 'industrial', { x: 14, y: 8, z: 10 }),
    building(30, 'residential', { x: 12, y: 6, z: 10 })];
  const authored = { id: 'authored-district-walk', surface: 'wood' as const,
    triangles: [{ cell: 0, vertices: [{ x: -60, y: 0, z: -60 }, { x: -59, y: 0, z: -59 },
      { x: -59, y: 0, z: -60 }] as const }] };
  const original: LevelPlan = { ...base, props,
    solids: props.map(prop => ({ centre: { ...prop.position, y: prop.size.y / 2 },
      halfExtents: { x: prop.size.x / 2, y: prop.size.y / 2, z: prop.size.z / 2 },
      rotationY: prop.rotationY, surface: 'brick' as const })), groundSurfacePatches: [authored] };
  const snapshot = JSON.stringify(original), decorated = withStreetGround(original);
  assert.equal(streetFronts(decorated).length, 1);
  assert.equal(environmentSites(decorated).length, 1);
  const houses = residentialSites(decorated);
  assert.equal(houses.length, 1, 'positive control includes a genuine admitted original house');
  assert.equal(parkCaseSites(decorated).length, 0);
  assert.equal(decorated.groundSurfacePatches![0], authored);
  for (const key of ['heightfield', 'surround', 'segments', 'props', 'solids', 'softBodies',
    'hazards', 'targets', 'checkpoints', 'spawn', 'streetLoops'] as const) {
    assert.equal(decorated[key], original[key], `${key} retains its original owner`);
  }
  const patches = decorated.groundSurfacePatches!.slice(1);
  const families = patches.map(patch => patch.id.includes('-forecourt-') ? 0
    : patch.id.startsWith('street-industrial-bay-') ? 1
    : patch.id.startsWith('street-residential-room-') ? 2 : -1);
  assert.deepEqual([...new Set(families)], [0, 1, 2], 'all three ground families are exercised in order');
  assert.deepEqual(families, [...families].sort(), 'earlier families never follow domestic paving');
  const domestic = patches.filter((_patch, index) => families[index] === 2);
  assert.equal(new Set(domestic.map(patch => patch.footprint!.id)).size, 1);
  const site = houses[0], footprint = domestic[0].footprint!;
  assert.equal(footprint.width, RESIDENTIAL_SITE_RULES.approachWidth);
  assert.equal(footprint.width, 1.5);
  const offset = residentialDoorOffset(site);
  assert.equal(offset, -2);
  assert.equal(footprint.origin.x, site.position.x + Math.cos(site.yaw) * offset);
  assert.equal(footprint.origin.z, site.position.z - Math.sin(site.yaw) * offset);
  const sampler = baseGround(decorated), sample = createGroundSample();
  const at = (x: number) => sampler.sampleGround(site.position.x + x, site.position.z + 6, sample).surface;
  assert.equal(at(offset), 'pavement');
  for (const side of [-1, 1]) {
    assert.equal(at(offset + side * (footprint.width / 2 - 0.001)), 'pavement');
    assert.equal(at(offset + side * (footprint.width / 2 + 0.001)), 'grass');
  }
  assert.equal(at(0), 'grass', 'a separate yard stays off the narrow doorway strip');
  const before = new PlanTerrainSampler(original), after = new PlanTerrainSampler(decorated);
  assert.deepEqual(after.sampleGround(footprint.origin.x, footprint.origin.z - 0.02, createGroundSample()),
    before.sampleGround(footprint.origin.x, footprint.origin.z - 0.02, createGroundSample()),
    'the unchanged protecting collider top still takes precedence');
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(withStreetGround(decorated), decorated, 'original array identity survives repeated decoration');
});

test('a genuine closed park case adds no paving or public entrance family', () => {
  const base = fixture(), size = { x: 7, y: 24, z: 7 };
  const original: LevelPlan = { ...base,
    segments: base.segments.map(segment => ({ ...segment, id: 'park-gate@ground-fixture' })),
    props: [{ ...base.props![0], look: 'clockTower', size }],
    solids: [{ ...base.solids![0], centre: { x: 0, y: 12, z: 0 },
      halfExtents: { x: 3.5, y: 12, z: 3.5 } }] };
  assert.equal(parkCaseSites(original).length, 1, 'positive control includes an actual eligible source shaft');
  assert.equal(residentialSites(original).length, 0);
  assert.equal(withStreetGround(original), original);
  assert.equal(withStreetGround(original).groundSurfacePatches, undefined);
});
