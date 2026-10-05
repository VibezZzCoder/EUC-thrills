/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from './generateRoute.ts';
import { fieldHeightAt } from './buildPlan.ts';
import type { BoxCollider, GroundSurfacePatch, LevelPlan, Prop } from './plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { POTHOLE } from '../data/tuning.ts';
import { districtSites, residentialSites, residentialGroundPatches, residentialDoorOffset,
  parkCaseSites,
  RESIDENTIAL_SITE_RULES, PARK_SITE_RULES,
  type ResidentialRoomSite, type ParkCaseSite } from './districtSites.ts';
import { exactBuildingBody, nearestPavedStreetStation } from './protectedSiteEligibility.ts';
import { boxOverlapsPolygon } from './streetFronts.ts';

/** Explicit world data: these fixtures do not use the generator or the selector
 * to manufacture the source footprint, road, protecting body, or negative. */
function fixture(options: { angle?: number; look?: 'residential' | 'clockTower';
  bodyQuarterTurn?: boolean; surface?: SurfaceId; height?: (x: number, z: number) => number } = {}): LevelPlan {
  const angle = options.angle ?? 0, c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + s * point.z,
    y: point.y, z: -s * point.x + c * point.z });
  const heights: number[] = [], surfaces: SurfaceId[] = [];
  for (let row = 0; row <= 160; row++) for (let column = 0; column <= 160; column++) {
    const x = -80 + column, z = -80 + row;
    heights.push(options.height?.(x, z) ?? 0);
  }
  for (let row = 0; row < 160; row++) for (let column = 0; column < 160; column++) {
    const x = -80 + column + 0.5, z = -80 + row + 0.5;
    const localZ = s * x + c * z;
    surfaces.push(localZ >= 48 && localZ <= 56 ? options.surface ?? 'pavement' : 'grass');
  }
  const look = options.look ?? 'residential';
  const size = look === 'clockTower' ? { x: 7, y: 24, z: 7 } : { x: 12, y: 6, z: 10 };
  const yaw = angle + (options.bodyQuarterTurn ? Math.PI / 2 : 0);
  const building: Prop = { kind: 'building', look, scale: 1,
    position: rotate({ x: 0, y: 0, z: 25 }), size, rotationY: yaw };
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 52 }),
    headingY: Math.PI / 2 + angle, surface: options.surface ?? 'pavement', halfWidth: 4, gradient: 0 });
  return { id: 'district-source-fixture', spawn: { position: rotate({ x: 0, y: 0, z: 52 }), headingY: angle },
    heightfield: { originX: -80, originZ: -80, spacing: 1, columns: 161, rows: 161, heights, surfaces },
    surround: { surface: 'grass', height: 0 }, checkpoints: [],
    segments: [{ id: look === 'clockTower' ? 'park-gate@fixture' : 'residential-street',
      entry: socket(-60), exit: socket(60), colliders: [] }], props: [building],
    solids: [{ centre: rotate({ x: 0, y: size.y / 2, z: 25 }),
      halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
      rotationY: yaw, surface: 'pavement', occludes: true }] };
}

function local(site: Pick<ResidentialRoomSite, 'position' | 'yaw'>,
  x: number, z: number, y = 0): Vec3 {
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return { x: site.position.x + c * x + s * z,
    y: site.position.y + y, z: site.position.z - s * x + c * z };
}

function polygon(patch: GroundSurfacePatch): Vec3[] {
  const f = patch.footprint!, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const at = (x: number, z: number): Vec3 => ({ x: f.origin.x + c * x + s * z,
    y: f.origin.y, z: f.origin.z - s * x + c * z });
  return [at(-f.width / 2, f.near), at(f.width / 2, f.near),
    at(f.width / 2, f.far), at(-f.width / 2, f.far)];
}

function assertProtected(plan: LevelPlan, site: ResidentialRoomSite | ParkCaseSite): void {
  assert.ok(plan.props!.includes(site.building));
  assert.ok(plan.solids!.includes(site.body));
  assert.equal(exactBuildingBody(plan, site.building), site.body);
  const size = site.building.size!;
  assert.deepEqual(site.body.halfExtents, { x: size.x / 2, y: size.y / 2, z: size.z / 2 });
  const width = site.kind === 'residential-domestic-room'
    ? site.roomWidth + RESIDENTIAL_SITE_RULES.mountWidthPadding
    : site.caseWidth + PARK_SITE_RULES.mountWidthPadding;
  const depth = site.kind === 'residential-domestic-room' ? site.roomDepth : site.caseDepth;
  const bottom = site.kind === 'residential-domestic-room' ? 0 : -PARK_SITE_RULES.mountVerticalPadding;
  const top = site.height + (site.kind === 'residential-domestic-room'
    ? RESIDENTIAL_SITE_RULES.mountTopPadding : PARK_SITE_RULES.mountVerticalPadding);
  const c = Math.cos(site.body.rotationY), s = Math.sin(site.body.rotationY);
  for (const x of [-width / 2, width / 2]) for (const z of [-depth, -0.04]) {
    for (const y of [bottom, top]) {
      const p = local(site, x, z, y), dx = p.x - site.body.centre.x, dz = p.z - site.body.centre.z;
      assert.ok(Math.abs(c * dx - s * dz) <= site.body.halfExtents.x + 1e-9);
      assert.ok(Math.abs(s * dx + c * dz) <= site.body.halfExtents.z + 1e-9);
      assert.ok(Math.abs(p.y - site.body.centre.y) <= site.body.halfExtents.y + 1e-9);
    }
  }
}

function sourceSampler(plan: LevelPlan, patches?: readonly GroundSurfacePatch[]): PlanTerrainSampler {
  // Diagnostic ground-only queries: the protecting body's roof is irrelevant
  // to the source plane under its 0.04 m frontage overlap. Original plan intact.
  return new PlanTerrainSampler({ ...plan, solids: [],
    segments: plan.segments.map(segment => ({ ...segment, colliders: [] })),
    groundSurfacePatches: patches });
}

test('one original house has a localized domestic region and one exact offset strip', () => {
  const plan = fixture(), before = JSON.stringify(plan), sites = residentialSites(plan);
  assert.equal(sites.length, 1);
  const site = sites[0];
  assert.equal(site.building, plan.props![0]);
  assert.equal(site.body, plan.solids![0]);
  assert.deepEqual(site.position, { x: 0, y: 0, z: 30 });
  assert.equal(site.faceWidth, 6, 'mask is localized, not the whole 12 m original face');
  assert.equal(site.buildingFaceWidth, 12);
  assert.equal(site.roomWidth, 6);
  assert.equal(site.roomDepth, 3.2);
  assert.equal(site.closedDoor, true);
  assert.equal(residentialDoorOffset(site), -2);
  assertProtected(plan, site);
  const patches = residentialGroundPatches(plan, site);
  assert.equal(new Set(patches.map(patch => patch.footprint!.id)).size, 1);
  assert.equal(patches[0].footprint!.width, 1.5);
  assert.equal(patches[0].footprint!.origin.x, -2);
  assert.equal(patches[0].footprint!.origin.z, 30);
  assert.equal(patches[0].footprint!.near, -0.04);
  assert.ok(patches[0].footprint!.far > 18 && patches[0].footprint!.far <= 22.25);
  assert.deepEqual(residentialSites(plan), sites);
  assert.deepEqual(residentialGroundPatches({ ...plan, groundSurfacePatches: structuredClone(patches) }, site), patches);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(parkCaseSites(plan), []);
});

test('rotated courses and quarter-turned hosts preserve the real source frame and full protection', () => {
  const original = residentialSites(fixture())[0], angle = 0.71;
  const plan = fixture({ angle }), site = residentialSites(plan)[0];
  assert.ok(site);
  assert.ok(Math.abs(site.position.x - Math.sin(angle) * original.position.z) < 1e-9);
  assert.ok(Math.abs(site.position.z - Math.cos(angle) * original.position.z) < 1e-9);
  assert.ok(Math.abs(Math.sin(site.yaw - original.yaw - angle)) < 1e-9);
  const door = residentialGroundPatches(plan, site)[0].footprint!.origin;
  const expected = local(site, -2, 0);
  assert.deepEqual(door, expected);
  assertProtected(plan, site);
  const turned = fixture({ angle, bodyQuarterTurn: true }), turnedSite = residentialSites(turned)[0];
  assert.ok(turnedSite);
  assert.equal(turnedSite.buildingFaceWidth, 10, 'selected narrow side is the original Z width');
  assert.ok(Math.abs(turnedSite.position.x - Math.sin(angle) * 31) < 1e-9);
  assert.ok(Math.abs(turnedSite.position.z - Math.cos(angle) * 31) < 1e-9);
  assertProtected(turned, turnedSite);
});

test('wrong building types, original bodies, facing, and street claims cannot fall back', () => {
  const original = fixture();
  for (const look of ['commercial', 'industrial', 'steeple', 'clockTower', undefined] as const) {
    const copy: LevelPlan = { ...original, props: original.props!.map(prop => ({ ...prop, look })) };
    assert.deepEqual(residentialSites(copy), [], String(look));
  }
  for (const size of [{ x: 6, y: 6, z: 10 }, { x: 12, y: 3, z: 10 },
    { x: 12, y: 6, z: -1 }, { x: NaN, y: 6, z: 10 }]) {
    assert.deepEqual(residentialSites({ ...original, props: original.props!.map(prop => ({ ...prop, size })) }), []);
  }
  assert.deepEqual(residentialSites({ ...original, solids: [] }), []);
  assert.deepEqual(residentialSites({ ...original, props: original.props!.map(prop => ({ ...prop, scale: 0.9 })) }), []);
  assert.deepEqual(residentialSites({ ...original, solids: original.solids!.map(box => ({ ...box,
    halfExtents: { ...box.halfExtents, x: box.halfExtents.x + 0.2 } })) }), [], 'larger is not exact protection');
  assert.deepEqual(residentialSites({ ...original, solids: original.solids!.map(box => ({ ...box,
    rotationY: box.rotationY + Math.PI / 2 })) }), [], 'non-square wrong axes');
  const diagonal: LevelPlan = { ...original, props: original.props!.map(prop => ({ ...prop, rotationY: 0.5 })),
    solids: original.solids!.map(box => ({ ...box, rotationY: 0.5 })) };
  assert.deepEqual(residentialSites(diagonal), [], 'exact body still needs a correctly facing original face');
  for (const surface of ['grass', 'dirt', 'gravel', 'wood', 'spill'] as const) {
    assert.deepEqual(residentialSites(fixture({ surface })), [], surface);
  }
  assert.deepEqual(residentialSites({ ...original, heightfield: { ...original.heightfield,
    surfaces: original.heightfield.surfaces.map(() => 'grass') } }), [], 'paved socket over grass');
  assert.deepEqual(residentialSites({ ...original, segments: original.segments.map(segment => ({ ...segment,
    exit: { ...segment.exit, headingY: segment.exit.headingY + 0.1 } })) }), [], 'false arc/chord');
  assert.deepEqual(residentialSites({ ...original, segments: original.segments.map(segment => ({ ...segment,
    entry: { ...segment.entry, position: { ...segment.entry.position, z: 55 } } })) }), [], 'wrong heading/chord');
  assert.deepEqual(residentialSites({ ...original, heightfield: { ...original.heightfield, spacing: 0 } }), []);
});

test('street clearance is perpendicular to the actual face, with exact threshold controls', () => {
  for (const look of ['residential', 'clockTower'] as const) {
    const original = fixture({ look }), halfDepth = look === 'residential' ? 5 : 3.5;
    const minimum = look === 'residential' ? 2 : 3;
    const maximum = look === 'residential' ? 24 : 32;
    const select = look === 'residential' ? residentialSites : parkCaseSites;
    const source = (yaw: number, normalGap: number): LevelPlan => {
      // The independently authored road is z=52; its nearest station is level
      // with the original host centre. A normal projection, rather than the
      // longer radial distance, measures the gap to the selected planar face.
      const z = 52 - (halfDepth + normalGap) / Math.cos(yaw);
      return { ...original, props: original.props!.map(prop => ({ ...prop,
        rotationY: yaw, position: { ...prop.position, z } })),
      solids: original.solids!.map(body => ({ ...body,
        rotationY: yaw, centre: { ...body.centre, z } })) };
    };
    for (const yaw of [-0.25, 0.25]) {
      const tooNear = source(yaw, minimum - 0.05), before = JSON.stringify(tooNear);
      const radialGap = (halfDepth + minimum - 0.05) / Math.cos(yaw) - halfDepth;
      assert.ok(radialGap > minimum && Math.cos(yaw) > 0.94,
        'the negative passes radial clearance and the independent facing requirement');
      assert.deepEqual(select(tooNear), [], `${look}: oblique normal gap is below admission`);
      assert.equal(JSON.stringify(tooNear), before);
      // This stands 0.1 mm inside the maximum, bounding the solver's
      // finite station refinement while exposing the old radial rejection.
      const exactObliqueMaximum = source(yaw, maximum - 0.0001);
      assert.ok((halfDepth + maximum - 0.0001) / Math.cos(yaw) - halfDepth > maximum);
      assert.equal(select(exactObliqueMaximum).length, 1, `${look}: normal maximum boundary`);
    }
    assert.equal(select(source(0, minimum)).length, 1, `${look}: exact metric minimum`);
    assert.equal(select(source(0, maximum)).length, 1, `${look}: exact metric maximum`);
    assert.deepEqual(select(source(0, minimum - 0.000001)), [], `${look}: strictly below minimum`);
    assert.deepEqual(select(source(0, maximum + 0.000001)), [], `${look}: strictly above maximum`);
  }
});

test('the actual offset door refuses full rotated solids, segment walls, shrubs and coincident foreigners', () => {
  const original = fixture(), site = residentialSites(original)[0], before = JSON.stringify(original);
  const blocker: BoxCollider = { centre: { x: -2.6, y: 1, z: 40 },
    halfExtents: { x: 0.35, y: 1, z: 0.8 }, rotationY: 0.71, surface: 'wood' };
  const patches = residentialGroundPatches(original, site);
  assert.ok(boxOverlapsPolygon(blocker, polygon(patches[0])));
  assert.ok(Math.abs(blocker.centre.x) > 2, 'centreline-only test would miss this offset obstruction');
  assert.deepEqual(residentialGroundPatches({ ...original, solids: [...original.solids!, blocker] }, site), []);
  assert.deepEqual(residentialSites({ ...original, solids: [...original.solids!, blocker] }), []);
  assert.deepEqual(residentialSites({ ...original, segments: original.segments.map(segment => ({ ...segment,
    colliders: [blocker] })) }), []);
  assert.deepEqual(residentialSites({ ...original, softBodies: [blocker] }), []);
  const duplicate = structuredClone(original.solids![0]);
  assert.deepEqual(residentialSites({ ...original, solids: [...original.solids!, duplicate] }), [],
    'a second same-centre object is not the one original host exception');
  assert.equal(residentialSites(original).length, 1, 'restored original fixture is the positive control');
  assert.equal(JSON.stringify(original), before);
});

test('the full source room refuses an interior bump missed by the old nine sample positions', () => {
  const plan = fixture({ height: (x, z) => x === 1 && z === 28 ? 0.4 : 0 });
  const anchor = { position: { x: 0, y: 0, z: 30 }, yaw: 0 };
  for (const x of [-3, 0, 3]) for (const z of [0, -1.6, -3.2]) {
    const p = local(anchor, x, z);
    assert.ok(Math.abs(fieldHeightAt(plan.heightfield, plan.surround, p.x, p.z)) < 0.15,
      'the negative specifically escapes a nine-point flat-floor check');
  }
  assert.deepEqual(residentialSites(plan), []);
  assert.equal(residentialSites(fixture()).length, 1);
});

test('a single exact mixed-surface strip preserves source planes and all non-grass semantics', () => {
  const original = fixture({ height: (x, z) => 0.012 * Math.sin(x * 0.31) + 0.008 * Math.cos(z * 0.27) });
  const field = original.heightfield;
  const plan: LevelPlan = { ...original, heightfield: { ...field, surfaces: field.surfaces.map((surface, index) => {
    const x = -80 + index % 160 + 0.5, z = -80 + Math.floor(index / 160) + 0.5;
    return x < -2 && x > -3 && z >= 35 && z < 48
      ? z < 39 ? 'roughPavement' : z < 43 ? 'brick' : 'pavement' : surface;
  }) } };
  const beforeJSON = JSON.stringify(plan), site = residentialSites(plan)[0];
  assert.ok(site);
  const patches = residentialGroundPatches(plan, site);
  assert.deepEqual(new Set(patches.map(patch => patch.sourceSurface)), new Set(['grass', 'pavement', 'brick', 'roughPavement']));
  const before = sourceSampler(plan), after = sourceSampler(plan, patches);
  const oldSample = createGroundSample(), newSample = createGroundSample();
  let checked = 0, converted = 0;
  for (const patch of patches) for (const triangle of patch.triangles) {
    const [a, b, c] = triangle.vertices;
    assert.ok((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0);
    for (const p of triangle.vertices) {
      before.sampleGround(p.x, p.z, oldSample);
      assert.ok(Math.abs(p.y - oldSample.height) < 1e-9, 'exact source plane, including non-coplanar cells');
    }
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
    assert.equal(patch.sourceSurface, oldSample.surface);
    assert.equal(newSample.height, oldSample.height);
    assert.deepEqual(newSample.normal, oldSample.normal);
    assert.equal(newSample.offCourse, oldSample.offCourse);
    assert.equal(newSample.surface, oldSample.surface === 'grass' ? 'pavement' : oldSample.surface);
    checked++; if (oldSample.surface === 'grass') converted++;
  }
  assert.ok(checked > 30 && converted > 10);
  const f = patches[0].footprint!;
  for (const side of [-1, 1]) {
    assert.equal(after.sampleGround(f.origin.x + side * (f.width / 2 - 0.001), 33, newSample).surface, 'pavement');
    assert.equal(after.sampleGround(f.origin.x + side * (f.width / 2 + 0.001), 33, newSample).surface, 'grass');
  }
  assert.equal(after.sampleGround(2, 40, newSample).surface, 'grass', 'no full-face court or paved yard');
  assert.equal(JSON.stringify(plan), beforeJSON);
});

test('precise patch conflicts, unsafe ground and a visible hazard halo refuse the same entrance', () => {
  const plan = fixture(), site = residentialSites(plan)[0], patches = residentialGroundPatches(plan, site);
  const borrowed: GroundSurfacePatch = { ...patches[0], id: 'unrelated-precise-patch' };
  assert.deepEqual(residentialSites({ ...plan, groundSurfacePatches: [borrowed] }), []);
  const modified: GroundSurfacePatch = { ...patches[0], surface: 'brick' };
  assert.deepEqual(residentialGroundPatches({ ...plan, groundSurfacePatches: [modified] }, site), []);
  assert.deepEqual(residentialGroundPatches(plan, { ...site, yaw: site.yaw + 0.01 }), []);
  assert.deepEqual(residentialGroundPatches(plan, { ...site, doorOffset: 0 }), []);
  assert.deepEqual(residentialGroundPatches(plan, { ...site, roomWidth: 7 }), []);
  assert.deepEqual(residentialGroundPatches(plan, { ...site, body: structuredClone(site.body) }), []);
  const radius = 0.3, halo = radius * POTHOLE.haloFraction
    * (1 + POTHOLE.outlineHarmonics.reduce((sum, h) => sum + Math.abs(h), 0));
  const haloOnly: LevelPlan = { ...plan, hazards: [{ id: 'original-visible-pothole', kind: 'potholeDeep', radius,
    centre: { x: -2 + 0.75 + (radius + halo) / 2, y: 0, z: 40 } }] };
  assert.ok(haloOnly.hazards![0].centre.x - (-2 + 0.75) > radius, 'physical radius alone misses the negative');
  assert.deepEqual(residentialSites(haloOnly), [], 'visible halo has positive overlap');
  const safelyAway: LevelPlan = { ...plan, hazards: haloOnly.hazards!.map(hazard => ({ ...hazard,
    centre: { ...hazard.centre, x: 10 } })) };
  assert.equal(residentialSites(safelyAway).length, 1);
  for (const bad of ['dirt', 'gravel', 'wood', 'spill'] as const) {
    const interrupted: LevelPlan = { ...plan, heightfield: { ...plan.heightfield,
      surfaces: plan.heightfield.surfaces.map((surface, index) => Math.floor(index / 160) === 120 ? bad : surface) } };
    assert.deepEqual(residentialSites(interrupted), [], bad);
  }
  assert.deepEqual(residentialSites(fixture({ height: (_x, z) => z >= 38 && z <= 42 ? 0.5 : 0 })), []);
  assert.deepEqual(residentialSites(fixture({ height: (x, z) => x === -2 && z === 40 ? NaN : 0 })), []);
});

test('sparse selection never dresses every eligible house and never consumes random draws', () => {
  const original = fixture(), building = original.props![0], body = original.solids![0];
  const second: Prop = { ...building, position: { ...building.position, x: 30 } };
  const plan: LevelPlan = { ...original, props: [building, second], solids: [body,
    { ...body, centre: { ...body.centre, x: 30 } }] };
  const before = JSON.stringify(plan), originalRandom = Math.random;
  try {
    Math.random = () => { throw new Error('a presentation selector consumed randomness'); };
    const selected = districtSites(plan);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].building, building);
    assert.deepEqual(districtSites(plan), selected);
    assert.deepEqual(districtSites({ ...plan, props: [] }), []);
  } finally { Math.random = originalRandom; }
  assert.equal(JSON.stringify(plan), before);
});

test('the original clock-tower shaft can hold one closed case with no ground or access change', () => {
  const plan = fixture({ look: 'clockTower' }), before = JSON.stringify(plan), sites = parkCaseSites(plan);
  assert.equal(sites.length, 1);
  const site = sites[0];
  assert.equal(site.kind, 'park-closed-map-case');
  assert.equal(site.building, plan.props![0]);
  assert.equal(site.publicEntrance, false);
  assert.deepEqual(site.position, { x: 0, y: 1, z: 28.5 });
  assert.equal(site.faceWidth, 2.1);
  assert.equal(site.shaftFaceWidth, 7);
  assert.equal(site.height, 1.4);
  assert.equal(site.caseDepth, 0.6);
  assertProtected(plan, site);
  assert.equal(plan.groundSurfacePatches, undefined);
  assert.deepEqual(residentialSites(plan), []);
  assert.equal(JSON.stringify(plan), before);
  const rotated = fixture({ look: 'clockTower', angle: 0.71 }), turned = parkCaseSites(rotated)[0];
  assert.ok(turned);
  assertProtected(rotated, turned);
});

test('a settled clock-tower foundation extends the shaft without changing its original top', () => {
  const original = fixture({ look: 'clockTower', height: (x, z) =>
    x <= -2 && z >= 21 && z <= 29 ? -0.025 : 0 });
  const building = original.props![0], body = original.solids![0];
  const lowering = 0.025;
  const settledBuilding: Prop = { ...building,
    position: { ...building.position, y: building.position.y - lowering },
    size: { ...building.size!, y: building.size!.y + lowering } };
  const settledBody: BoxCollider = { ...body,
    centre: { ...body.centre, y: settledBuilding.position.y + settledBuilding.size!.y / 2 },
    halfExtents: { ...body.halfExtents, y: settledBuilding.size!.y / 2 } };
  const plan: LevelPlan = { ...original, props: [settledBuilding], solids: [settledBody] };
  const before = JSON.stringify(plan), sites = parkCaseSites(plan);
  assert.equal(fieldHeightAt(plan.heightfield, plan.surround, 0, 25), 0);
  assert.equal(fieldHeightAt(plan.heightfield, plan.surround, -3, 25), -lowering);
  assert.equal(settledBuilding.position.y + settledBuilding.size!.y,
    building.position.y + building.size!.y, 'foundation grows down while the shaft top stays fixed');
  assert.equal(sites.length, 1);
  assert.equal(sites[0].building, settledBuilding);
  assert.equal(sites[0].body, settledBody);
  assert.equal(sites[0].position.y, 1 - lowering, 'the original settled base owns case height');
  assert.equal(sites[0].publicEntrance, false);
  assertProtected(plan, sites[0]);
  assert.equal(plan.groundSurfacePatches, undefined);
  assert.deepEqual(parkCaseSites(plan), sites);
  assert.equal(JSON.stringify(plan), before);
  const shortHeight = 24 - 0.001;
  const shortBuilding: Prop = { ...building, size: { ...building.size!, y: shortHeight } };
  const shortBody: BoxCollider = { ...body,
    centre: { ...body.centre, y: shortBuilding.position.y + shortHeight / 2 },
    halfExtents: { ...body.halfExtents, y: shortHeight / 2 } };
  const shortPlan: LevelPlan = { ...original, props: [shortBuilding], solids: [shortBody] };
  assert.equal(exactBuildingBody(shortPlan, shortBuilding), shortBody,
    'the under-height control retains its exact original protecting body');
  assert.deepEqual(parkCaseSites(shortPlan), [], 'a shaft below nominal height stays refused');
});

test('the actual generated City tower admits one settled closed case on its unchanged nearest gate station', () => {
  const plan = generateLevel('city').plan, before = JSON.stringify(plan), sites = parkCaseSites(plan);
  assert.equal(sites.length, 1);
  const site = sites[0], building = site.building;
  assert.equal(building.look, 'clockTower');
  assert.ok(plan.props!.includes(building));
  assert.equal(exactBuildingBody(plan, building), site.body);
  assert.equal(building.size!.x, 7); assert.equal(building.size!.z, 7);
  assert.ok(building.size!.y > 24 && building.position.y < 0);
  assert.ok(Math.abs(building.position.y + building.size!.y - 24) < 1e-12);
  const gates = plan.segments.filter(segment => segment.id === 'park-gate' || segment.id.startsWith('park-gate@'));
  const nearest = nearestPavedStreetStation(plan, building, gates, { minimumStationFraction: 0.08 });
  assert.ok(nearest);
  assert.deepEqual(site.street, nearest.point);
  assert.equal(site.streetSegmentId, nearest.segmentId);
  assert.equal(site.publicEntrance, false);
  assertProtected(plan, site);
  const sampler = new PlanTerrainSampler(plan), eye = { ...site.street,
    y: fieldHeightAt(plan.heightfield, plan.surround, site.street.x, site.street.z) + PARK_SITE_RULES.sourceEyeHeight };
  for (const x of [-site.caseWidth * 0.35, 0, site.caseWidth * 0.35]) {
    const target = local(site, x, PARK_SITE_RULES.visibilityFaceOffset, site.height / 2);
    const direction = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
    const maximum = Math.hypot(direction.x, direction.y, direction.z) - 0.001;
    assert.equal(sampler.raycast(eye, direction, maximum), null, 'unchanged terrain and occluding bodies clear');
    assert.equal(sampler.raycastObstacle(eye, direction, maximum), null, 'every original physical body clears');
  }
  assert.deepEqual(parkCaseSites(plan), sites);
  assert.equal(JSON.stringify(plan), before, 'the original generated world stays byte-identical');
});

test('actual mounting edge bands reject foreign solids and soft bodies outside the nominal masks', () => {
  for (const angle of [0, 0.71]) for (const look of ['residential', 'clockTower'] as const) {
    const plan = fixture({ angle, look, bodyQuarterTurn: true }), before = JSON.stringify(plan);
    const select = look === 'residential' ? residentialSites : parkCaseSites;
    const original = select(plan);
    assert.equal(original.length, 1, `${look}: original positive`);
    const site = original[0];
    // These measured fixture bands are strictly outside the nominal mask but
    // inside the emitted shell/mount. A nominal-only volume check misses each.
    const points = look === 'residential'
      ? [{ x: 3.025, y: 1.4, z: -0.16 }, { x: 0, y: 3.22, z: -0.16 }]
      : [{ x: 1.075, y: 0.70, z: -0.16 }, { x: 0, y: 1.43, z: -0.16 },
        { x: 0, y: -0.04, z: -0.16 }];
    for (const point of points) {
      const blocker: BoxCollider = { centre: local(site, point.x, point.z, point.y),
        halfExtents: { x: 0.006, y: 0.006, z: 0.03 }, rotationY: site.yaw,
        surface: 'pavement', occludes: false };
      assert.deepEqual(select({ ...plan, solids: [...plan.solids!, blocker] }), [],
        `${look}: complete actual shell range catches the foreign solid`);
      assert.deepEqual(select({ ...plan, softBodies: [blocker] }), [],
        `${look}: complete actual shell range catches original soft planting`);
    }
    const safelyOutside: BoxCollider = { centre: local(site,
      look === 'residential' ? 3.065 : 1.665, -0.16, 1.4),
      halfExtents: { x: 0.006, y: 0.006, z: 0.03 }, rotationY: site.yaw,
      surface: 'pavement', occludes: false };
    assert.equal(select({ ...plan, solids: [...plan.solids!, safelyOutside] }).length, 1,
      'the actual emitted footprint, not the whole unrelated house/shaft interior, is protected');
    assert.equal(select(plan).length, 1, 'unchanged original source restores the positive');
    assert.equal(JSON.stringify(plan), before);
  }
});

test('park case refuses wrong landmark, wrong gate, source terrain and non-occluding physical blockers', () => {
  const original = fixture({ look: 'clockTower' }), before = JSON.stringify(original);
  for (const look of ['steeple', 'lookout', 'commercial', 'residential', undefined] as const) {
    assert.deepEqual(parkCaseSites({ ...original, props: original.props!.map(prop => ({ ...prop, look })) }), []);
  }
  assert.deepEqual(parkCaseSites({ ...original, props: original.props!.map(prop => ({ ...prop,
    size: { ...prop.size!, x: 8 } })) }), []);
  assert.deepEqual(parkCaseSites({ ...original, solids: [] }), []);
  assert.deepEqual(parkCaseSites({ ...original, segments: original.segments.map(segment => ({ ...segment,
    id: 'unrelated-paved-street' })) }), []);
  const pier: BoxCollider = { centre: { x: 0, y: 2, z: 40 },
    halfExtents: { x: 2, y: 2, z: 1 }, rotationY: 0.31, surface: 'pavement', occludes: false };
  assert.deepEqual(parkCaseSites({ ...original, solids: [...original.solids!, pier] }), [],
    'physical ray catches a source solid even when the chase-camera flag is false');
  assert.deepEqual(parkCaseSites({ ...original, segments: original.segments.map(segment => ({ ...segment,
    colliders: [pier] })) }), []);
  assert.deepEqual(parkCaseSites(fixture({ look: 'clockTower', height: (_x, z) => z >= 38 && z <= 42 ? 4 : 0 })), []);
  assert.equal(parkCaseSites(original).length, 1, 'the exact unchanged positive source is restored');
  assert.equal(JSON.stringify(original), before);
});

test('two individually visible original clock towers still yield one deterministic closed case', () => {
  const original = fixture({ look: 'clockTower' }), first = original.props![0], body = original.solids![0];
  const second: Prop = { ...first, position: { ...first.position, x: 30 } };
  const plan: LevelPlan = { ...original, props: [first, second], solids: [body,
    { ...body, centre: { ...body.centre, x: 30 } }] };
  const before = JSON.stringify(plan), cases = parkCaseSites(plan);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].building, first);
  assert.deepEqual(parkCaseSites(plan), cases);
  assert.equal(JSON.stringify(plan), before);
});

test('shared exact street solver has an analytical arc control and refuses an invented subset', () => {
  const original = fixture(), source = original.segments[0], turn = 0.15, radius = 800;
  const arc = { ...source, exit: { ...source.exit, headingY: source.entry.headingY + turn,
    position: { x: -60 + radius * Math.sin(turn), y: 0, z: 52 + radius * (Math.cos(turn) - 1) } } };
  const plan: LevelPlan = { ...original, segments: [arc] };
  const station = nearestPavedStreetStation(plan, plan.props![0]);
  assert.ok(station);
  const length = Math.hypot(60, 773);
  assert.ok(Math.abs(station.point.x - (-60 + radius * 60 / length)) < 2e-5);
  assert.ok(Math.abs(station.point.z - (-748 + radius * 773 / length)) < 2e-5);
  assert.equal(station.segmentId, arc.id);
  const chordT = (station.point.x - arc.entry.position.x) / (arc.exit.position.x - arc.entry.position.x);
  const chordZ = arc.entry.position.z + chordT * (arc.exit.position.z - arc.entry.position.z);
  assert.ok(Math.abs(station.point.z - chordZ) > 2, 'positive control distinguishes source arc from chord');
  assert.equal(nearestPavedStreetStation(plan, plan.props![0], [{ ...arc }]), undefined,
    'an invented but similar segment is not an original source reference');
  assert.equal(nearestPavedStreetStation(plan, plan.props![0], plan.segments,
    { minimumStationFraction: 0 }), undefined);
});

test('four actual generated courses keep original data and admit only exact appropriate protected hosts', () => {
  for (const seed of ['euc', 'corner', 'city', 'rider']) {
    const plan = generateLevel(seed).plan, before = JSON.stringify(plan), sites = districtSites(plan);
    assert.equal(plan.id, `generated-r6-${seed}`);
    const homes = sites.filter((site): site is ResidentialRoomSite => site.kind === 'residential-domestic-room');
    const parks = sites.filter((site): site is ParkCaseSite => site.kind === 'park-closed-map-case');
    assert.equal(homes.length, 1, `${seed}: at least one audited suitable house supplies an exact entrance`);
    assert.equal(parks.length, ['city', 'corner'].includes(seed) ? 1 : 0, `${seed}: the narrower case still requires three clear source rays`);
    for (const site of homes) {
      assert.equal(site.building.look, 'residential');
      assertProtected(plan, site);
      const patches = residentialGroundPatches(plan, site);
      assert.ok(patches.length > 0 && patches.length <= 4);
      assert.equal(new Set(patches.map(patch => patch.footprint!.id)).size, 1);
      const body = site.body;
      for (const box of [...(plan.solids ?? []), ...plan.segments.flatMap(segment => segment.colliders),
        ...(plan.softBodies ?? [])]) {
        if (box === body || box.centre.y + box.halfExtents.y <= site.position.y + 0.35) continue;
        assert.equal(boxOverlapsPolygon(box, polygon(patches[0])), false, `${seed}: original full blocker`);
      }
      const beforeGround = sourceSampler(plan), afterGround = sourceSampler(plan, patches);
      const a = createGroundSample(), b = createGroundSample();
      for (const patch of patches) for (const tri of patch.triangles) {
        const x = tri.vertices.reduce((sum, p) => sum + p.x, 0) / 3;
        const z = tri.vertices.reduce((sum, p) => sum + p.z, 0) / 3;
        beforeGround.sampleGround(x, z, a); afterGround.sampleGround(x, z, b);
        assert.equal(a.height, b.height); assert.deepEqual(a.normal, b.normal);
        assert.equal(a.offCourse, b.offCourse);
        assert.equal(b.surface, a.surface === 'grass' ? 'pavement' : a.surface);
      }
    }
    for (const site of parks) {
      assert.equal(site.building.look, 'clockTower');
      assert.equal(site.building.size!.x, 7);
      assert.equal(site.building.size!.z, 7);
      assert.ok(site.building.size!.y >= 24, 'original foundation extension keeps the full nominal shaft');
      assert.equal(site.publicEntrance, false);
      assertProtected(plan, site);
    }
    assert.deepEqual(sites, districtSites(plan));
    assert.equal(JSON.stringify(plan), before, `${seed}: selection and patch derivation leave the source world exact`);
  }
});
