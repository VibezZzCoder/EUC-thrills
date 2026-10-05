/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { GroundSurfacePatch, LevelPlan } from './plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { environmentSites, industrialPersonnelDoorOffset } from './environmentSites.ts';
import { industrialGroundPatches, INDUSTRIAL_APPROACH_RULES } from './environmentGround.ts';
import { boxOverlapsPolygon, clippedFieldTriangles, pavedCrossSection, STREET_PAVING, type GroundClipPolicy } from './streetFronts.ts';
import { generateLevel } from './generateRoute.ts';

function fixture(angle = 0, streetSurface: SurfaceId = 'roughPavement',
  heights: (x: number, z: number) => number = () => 0): LevelPlan {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + s * point.z,
    y: point.y, z: -s * point.x + c * point.z });
  const samples: number[] = [], surfaces: SurfaceId[] = [];
  for (let row = 0; row < 81; row++) for (let column = 0; column < 81; column++) {
    const x = -80 + column * 2, z = -80 + row * 2;
    samples.push(heights(x, z));
  }
  for (let row = 0; row < 80; row++) for (let column = 0; column < 80; column++) {
    const x = -80 + (column + 0.5) * 2, z = -80 + (row + 0.5) * 2;
    const localZ = s * x + c * z;
    surfaces.push(localZ >= 48 && localZ <= 56 ? streetSurface : 'grass');
  }
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 52 }),
    headingY: Math.PI / 2 + angle, halfWidth: 4, gradient: 0, surface: streetSurface });
  return { id: 'industrial-ground-fixture',
    spawn: { position: rotate({ x: 0, y: 0, z: 52 }), headingY: angle },
    heightfield: { originX: -80, originZ: -80, spacing: 2, columns: 81, rows: 81,
      heights: samples, surfaces }, surround: { height: 0, surface: 'grass' }, checkpoints: [],
    segments: [{ id: 'industrial-street', entry: socket(-60), exit: socket(60), colliders: [] }],
    props: [{ kind: 'building', look: 'industrial', scale: 1,
      position: rotate({ x: 0, y: 0, z: 25 }), rotationY: angle, size: { x: 18, y: 8, z: 20 } }],
    solids: [{ centre: rotate({ x: 0, y: 4, z: 25 }), halfExtents: { x: 9, y: 4, z: 10 },
      rotationY: angle, surface: 'pavement', occludes: true }] };
}

function ground(plan: LevelPlan, patches?: readonly GroundSurfacePatch[]): PlanTerrainSampler {
  return new PlanTerrainSampler({ ...plan, groundSurfacePatches: patches, solids: [],
    segments: plan.segments.map(segment => ({ ...segment, colliders: [] })) });
}

test('only the exact door strip and bounded service apron change grass; original street semantics survive', () => {
  for (const surface of ['roughPavement', 'brick', 'pavement'] as const) {
    const plan = fixture(0, surface), original = JSON.stringify(plan), site = environmentSites(plan)[0];
    assert.ok(site);
    const patches = industrialGroundPatches(plan, site), footprint = patches[0].footprint!;
    assert.equal(JSON.stringify(plan), original, 'authoring only returns data');
    assert.deepEqual(patches, industrialGroundPatches(plan, site), 'no random-stream draws');
    assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: patches }, site), patches,
      'the same decoration can be derived again without refusing either exact family');
    assert.equal(patches.length, 4);
    assert.ok(patches.slice(0, 2).every(patch => patch.id.startsWith('street-industrial-bay-0-personnel-entry-')));
    assert.ok(patches.slice(2).every(patch => patch.id.startsWith('street-industrial-bay-0-service-apron-')));
    assert.equal(new Set(patches.map(patch => patch.footprint)).size, 2);
    assert.equal(footprint.width, STREET_PAVING.doorApproachWidth);
    assert.equal(footprint.near, -STREET_PAVING.frontageOverlap);
    const door = industrialPersonnelDoorOffset(site);
    assert.equal(footprint.origin.x, site.position.x + door);
    const apron = patches[2].footprint!;
    assert.equal(apron.width, INDUSTRIAL_APPROACH_RULES.serviceApronWidth);
    assert.equal(apron.origin.x, site.position.x + INDUSTRIAL_APPROACH_RULES.serviceApronOffset);
    assert.equal(apron.near, footprint.near);
    const before = ground(plan), after = ground(plan, patches), sample = createGroundSample();
    for (const z of [36, 40, 44, 47]) {
      assert.equal(after.sampleGround(door, z, sample).surface, 'pavement');
      assert.equal(after.sampleGround(door - footprint.width / 2 - 0.001, z, sample).surface, 'grass');
      assert.equal(after.sampleGround(door + footprint.width / 2 + 0.001, z, sample).surface, 'grass');
      assert.equal(after.sampleGround(0, z, sample).surface, 'pavement', 'the parked van has a bounded paved street approach');
      assert.equal(after.sampleGround(-3, z, sample).surface, 'grass', 'the apron cannot pave an entire yard');
      for (const side of [-1, 1]) {
        assert.equal(after.sampleGround(apron.origin.x + side * (apron.width / 2 - 0.001), z, sample).surface, 'pavement');
        assert.equal(after.sampleGround(apron.origin.x + side * (apron.width / 2 + 0.001), z, sample).surface, 'grass');
      }
    }
    for (const patch of patches) for (const triangle of patch.triangles) {
      const x = triangle.vertices.reduce((sum, p) => sum + p.x, 0) / 3;
      const z = triangle.vertices.reduce((sum, p) => sum + p.z, 0) / 3;
      const source = before.sampleGround(x, z, sample).surface;
      assert.equal(patch.sourceSurface, source);
      assert.equal(after.sampleGround(x, z, sample).surface, source === 'grass' ? 'pavement' : source);
    }
    assert.equal(after.sampleGround(door, 52, sample).surface, surface);
    assert.equal(after.sampleGround(0, 52, sample).surface, surface);
  }
});

test('rotated non-coplanar fragments preserve exact source triangles, normals and sub-cell boundaries', () => {
  const plan = fixture(0.71, 'roughPavement', (x, z) => 0.022 * Math.sin(x * 0.37) + 0.018 * Math.cos(z * 0.41));
  const site = environmentSites(plan)[0];
  assert.ok(site);
  const patches = industrialGroundPatches(plan, site), before = ground(plan), after = ground(plan, patches);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  let nonzero = 0, changed = 0;
  for (const patch of patches) for (const triangle of patch.triangles) {
    const [a, b, c] = triangle.vertices;
    assert.ok((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0, 'upward source winding');
    for (const point of triangle.vertices) {
      before.sampleGround(point.x, point.z, oldSample);
      assert.ok(Math.abs(point.y - oldSample.height) < 1e-9, 'no flat slab or bilinear-height substitution');
      if (Math.abs(point.y) > 0.001) nonzero++;
    }
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
    assert.equal(newSample.height, oldSample.height);
    assert.deepEqual(newSample.normal, oldSample.normal);
    assert.equal(newSample.offCourse, oldSample.offCourse);
    assert.equal(newSample.surface, oldSample.surface === 'grass' ? 'pavement' : oldSample.surface);
    if (oldSample.surface === 'grass') changed++;
  }
  assert.ok(nonzero > 20 && changed > 20, 'positive control exercises real clipping and paving');
  const footprints = [...new Map(patches.map(patch => [patch.footprint!.id, patch.footprint!])).values()];
  assert.equal(footprints.length, 2);
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  for (const footprint of footprints) {
    for (const side of [-1, 1]) {
      const insideX = side * (footprint.width / 2 - 0.001), outsideX = side * (footprint.width / 2 + 0.001);
      assert.equal(after.sampleGround(footprint.origin.x + c * insideX + s * 4,
        footprint.origin.z - s * insideX + c * 4, newSample).surface, 'pavement');
      assert.equal(after.sampleGround(footprint.origin.x + c * outsideX + s * 4,
        footprint.origin.z - s * outsideX + c * 4, newSample).surface, 'grass');
    }
    const at = (x: number, z: number): Vec3 => ({ x: footprint.origin.x + c * x + s * z, y: 0,
      z: footprint.origin.z - s * x + c * z });
    for (const x of [-footprint.width / 2 + 0.001, footprint.width / 2 - 0.001]) {
      const inner = at(x, footprint.near + 0.001), outer = at(x, footprint.near - 0.001);
      assert.equal(after.sampleGround(inner.x, inner.z, newSample).surface, 'pavement', 'rotated near corners are covered');
      assert.deepEqual(after.sampleGround(outer.x, outer.z, newSample), before.sampleGround(outer.x, outer.z, oldSample),
        'the same rotated corner just outside the footprint stays exact source ground');
    }
  }
});

test('source semantics, actual blockers and unrelated precise patches are never silently overwritten', () => {
  const plan = fixture(), site = environmentSites(plan)[0], door = industrialPersonnelDoorOffset(site);
  for (const surface of ['dirt', 'gravel', 'wood', 'spill'] as const) {
    const changed: LevelPlan = { ...plan, heightfield: { ...plan.heightfield,
      surfaces: plan.heightfield.surfaces.map((value, index) => Math.floor(index / 80) === 61 ? surface : value) } };
    assert.deepEqual(industrialGroundPatches(changed, site), [], `${surface}: original path semantics block conversion`);
  }
  const blocker = { centre: { x: door, y: 1.5, z: 42 }, halfExtents: { x: 0.12, y: 1.5, z: 0.2 },
    rotationY: 0.41, surface: 'wood' as const };
  assert.deepEqual(industrialGroundPatches({ ...plan, solids: [...plan.solids!, blocker] }, site), []);
  const overlapping: GroundSurfacePatch = { id: 'authored-path', surface: 'wood', triangles: [{ cell: 4882,
    vertices: [{ x: door - 0.4, y: 0, z: 41 }, { x: door + 0.4, y: 0, z: 42 },
      { x: door + 0.4, y: 0, z: 41 }] }] };
  assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: [overlapping] }, site), []);
  const distant: GroundSurfacePatch = { ...overlapping, triangles: overlapping.triangles.map(triangle => ({ ...triangle,
    vertices: triangle.vertices.map(point => ({ ...point, x: point.x + 30 })) as [Vec3, Vec3, Vec3] })) };
  const withDistant = { ...plan, groundSurfacePatches: [distant] }, before = JSON.stringify(withDistant);
  assert.deepEqual(industrialGroundPatches(withDistant, site), industrialGroundPatches(plan, site));
  assert.equal(JSON.stringify(withDistant), before);
});

test('an apron-only path or height discontinuity rejects both footprints rather than leaving just a door strip', () => {
  const plan = fixture(), site = environmentSites(plan)[0];
  const positive = industrialGroundPatches(plan, site), apronCell = 60 * 80 + 40;
  const door = positive.filter(patch => patch.id.includes('-personnel-entry-'));
  assert.ok(door.length > 0 && positive.some(patch => patch.id.includes('-service-apron-')));
  assert.ok(door.every(patch => patch.triangles.every(triangle => triangle.cell !== apronCell)),
    'this negative control touches the apron, not the independently clear personnel strip');
  for (const surface of ['dirt', 'gravel', 'wood', 'spill'] as const) {
    const changed: LevelPlan = { ...plan, heightfield: { ...plan.heightfield,
      surfaces: plan.heightfield.surfaces.map((value, index) => index === apronCell ? surface : value) } };
    assert.deepEqual(industrialGroundPatches(changed, site), [], `${surface}: no partial door-only result`);
  }
  const raised: LevelPlan = { ...plan, heightfield: { ...plan.heightfield,
    heights: plan.heightfield.heights.map((value, index) => index === 61 * 81 + 40 ? 0.6 : value) } };
  assert.deepEqual(industrialGroundPatches(raised, site), [], 'original apron ridge cannot be flattened or bridged');
  assert.deepEqual(industrialGroundPatches(plan, { ...site, roomWidth: 6 }), [],
    'the bounded apron must fit the actual room opening');
});

test('full rotated apron corners and the actual door independently block all-or-none admission', () => {
  const plan = fixture(0.71), site = environmentSites(plan)[0];
  const patches = industrialGroundPatches(plan, site);
  const footprints = [...new Map(patches.map(patch => [patch.footprint!.id, patch.footprint!])).values()];
  assert.equal(footprints.length, 2);
  const polygon = (footprint: typeof footprints[number]) => {
    const c = Math.cos(footprint.yaw), s = Math.sin(footprint.yaw);
    const at = (x: number, z: number): Vec3 => ({ x: footprint.origin.x + c * x + s * z, y: 0,
      z: footprint.origin.z - s * x + c * z });
    return [at(-footprint.width / 2, footprint.near), at(footprint.width / 2, footprint.near),
      at(footprint.width / 2, footprint.far), at(-footprint.width / 2, footprint.far)];
  };
  for (const footprint of footprints) {
    const x = footprint.id.endsWith('service-apron') ? footprint.width / 2 + 0.1 : 0;
    const c = Math.cos(footprint.yaw), s = Math.sin(footprint.yaw);
    const blocker = { centre: { x: footprint.origin.x + c * x + s * 4, y: 1.5,
      z: footprint.origin.z - s * x + c * 4 }, halfExtents: { x: 0.2, y: 1.5, z: 0.3 },
    rotationY: footprint.yaw + Math.PI / 4, surface: 'wood' as const };
    assert.ok(boxOverlapsPolygon(blocker, polygon(footprint)), 'the rotated solid corner touches the full footprint');
    assert.equal(boxOverlapsPolygon(blocker, polygon(footprints.find(other => other !== footprint)!)), false,
      'the other footprint remains independently clear');
    assert.deepEqual(industrialGroundPatches({ ...plan, solids: [...plan.solids!, blocker] }, site), [],
      `${footprint.id}: no partial paving result`);
    assert.deepEqual(industrialGroundPatches({ ...plan,
      segments: plan.segments.map(segment => ({ ...segment, colliders: [blocker] })) }, site), [],
    'original segment colliders protect the apron as well as the door');
  }
});

test('repeated two-family derivation never treats unrelated or changed precise patches as its own', () => {
  const plan = fixture(), site = environmentSites(plan)[0], patches = industrialGroundPatches(plan, site);
  assert.equal(patches.length, 4);
  assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: patches }, site), patches);
  for (const original of [patches[0], patches[2]]) {
    const unrelated = { ...original, id: 'authored-protected-path', surface: 'wood' as const };
    assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: [...patches, unrelated] }, site), []);
    const borrowedId = { ...original, surface: 'wood' as const };
    assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: [...patches, borrowedId] }, site), [],
      'borrowing an exact family identifier cannot overwrite a protected surface');
  }
  const allOwnPlusDistant = { ...plan, groundSurfacePatches: [...patches, { ...patches[2], id: 'distant-authored-path',
    triangles: patches[2].triangles.map(triangle => ({ ...triangle,
      vertices: triangle.vertices.map(point => ({ ...point, x: point.x + 40 })) as [Vec3, Vec3, Vec3] })) }] };
  const before = JSON.stringify(allOwnPlusDistant);
  assert.deepEqual(industrialGroundPatches(allOwnPlusDistant, site), patches);
  assert.equal(JSON.stringify(allOwnPlusDistant), before);
});

test('low authored collider tops and original obstacle rays retain their height and surface', () => {
  const plan = fixture(), site = environmentSites(plan)[0], x = industrialPersonnelDoorOffset(site);
  const kerb = { centre: { x, y: 0.1, z: 42 }, halfExtents: { x: 0.5, y: 0.1, z: 0.3 },
    rotationY: 0, surface: 'wood' as const };
  const original = { ...plan, segments: plan.segments.map(segment => ({ ...segment, colliders: [kerb] })) };
  const patches = industrialGroundPatches(original, site);
  assert.ok(patches.length > 0);
  const before = new PlanTerrainSampler(original), after = new PlanTerrainSampler({ ...original, groundSurfacePatches: patches });
  const oldSample = createGroundSample(), newSample = createGroundSample();
  assert.deepEqual(after.sampleGround(x, 42, newSample), before.sampleGround(x, 42, oldSample));
  assert.equal(newSample.surface, 'wood');
  const origin = { x, y: 1, z: 50 }, direction = { x: 0, y: 0, z: -1 };
  assert.equal(after.raycastObstacle(origin, direction, 20), before.raycastObstacle(origin, direction, 20));
});

test('shared clipping keeps commercial defaults exact and industrial rough concrete explicitly opt-in', () => {
  const plan = fixture(), field = plan.heightfield;
  const polygon = [{ x: 4.5, y: 0, z: 47.2 }, { x: 6.5, y: 0, z: 47.2 },
    { x: 6.5, y: 0, z: 50.5 }, { x: 4.5, y: 0, z: 50.5 }];
  const commercial: GroundClipPolicy = { allowedSurfaces: ['grass', 'pavement', 'brick'],
    maximumHeightDifference: STREET_PAVING.maximumHeightDifference,
    maximumGradient: STREET_PAVING.maximumGradient,
    maximumCellsPerPolygon: STREET_PAVING.maximumCellsPerPolygon };
  assert.equal(clippedFieldTriangles(field, polygon, 0), undefined, 'commercial defaults cannot admit rough pavement');
  assert.equal(pavedCrossSection(field, { x: 4, y: 0, z: 52 }, { x: 7, y: 0, z: 52 }), false);
  assert.ok(clippedFieldTriangles(field, polygon, 0, { ...commercial,
    allowedSurfaces: [...commercial.allowedSurfaces, 'roughPavement'] })!.length > 0);
  const smooth = { ...field, surfaces: field.surfaces.map(surface => surface === 'roughPavement' ? 'pavement' as const : surface) };
  assert.deepEqual(clippedFieldTriangles(smooth, polygon, 0), clippedFieldTriangles(smooth, polygon, 0, commercial));
  for (const policy of [{ ...commercial, maximumCellsPerPolygon: Infinity }, { ...commercial, maximumCellsPerPolygon: 1025 },
    { ...commercial, maximumGradient: 1 }, { ...commercial, maximumHeightDifference: 1 },
    { ...commercial, allowedSurfaces: ['gravel'] }, { ...commercial, allowedSurfaces: [] }] as GroundClipPolicy[]) {
    assert.equal(clippedFieldTriangles(smooth, polygon, 0, policy), undefined, 'invalid policies cannot widen scope');
  }
  assert.equal(clippedFieldTriangles({ ...smooth, spacing: 0 }, polygon, 0), undefined);
  assert.equal(clippedFieldTriangles(smooth, [...polygon].reverse(), 0), undefined);
  assert.equal(clippedFieldTriangles(smooth, polygon.map(point => ({ ...point, x: Number.NaN })), 0), undefined);
  const fine = { ...smooth, spacing: 0.01 };
  assert.equal(clippedFieldTriangles(fine, polygon, 0), undefined, 'out-of-field/fine geometry is bounded');
  assert.deepEqual(industrialGroundPatches(plan, { ...environmentSites(plan)[0], street: { x: 0, y: 0, z: 500 } }), []);
});

test('actual euc, corner, city and rider industrial sites prepare both bounded immutable approaches', () => {
  for (const seed of ['euc', 'corner', 'city', 'rider']) {
    const plan = generateLevel(seed).plan, before = JSON.stringify(plan), sites = environmentSites(plan);
    assert.equal(plan.id, `generated-r6-${seed}`);
    assert.equal(sites.length, 1, `${seed}: actual generated world`);
    const patches = industrialGroundPatches(plan, sites[0]);
    assert.ok(patches.length >= 2 && patches.length <= 8);
    const footprints = [...new Map(patches.map(patch => [patch.footprint!.id, patch.footprint!])).values()];
    assert.equal(footprints.length, 2);
    assert.equal(footprints[0].width, STREET_PAVING.doorApproachWidth);
    assert.equal(footprints[1].width, INDUSTRIAL_APPROACH_RULES.serviceApronWidth);
    for (const footprint of footprints) assert.ok(new Set(patches.filter(patch => patch.footprint!.id === footprint.id)
      .flatMap(patch => patch.triangles.map(triangle => triangle.cell))).size <= STREET_PAVING.maximumCellsPerPolygon);
    assert.deepEqual(industrialGroundPatches({ ...plan, groundSurfacePatches: patches }, sites[0]), patches);
    assert.equal(JSON.stringify(plan), before);
  }
});
