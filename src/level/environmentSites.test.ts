/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Vec3, SurfaceId } from '../simulation/world.ts';
import type { BoxCollider, LevelPlan } from './plan.ts';
import { environmentEmitters, environmentSites, industrialPersonnelDoorOffset, ENVIRONMENT_SITE_RULES } from './environmentSites.ts';
import { industrialGroundPatches, INDUSTRIAL_APPROACH_RULES } from './environmentGround.ts';
import { boxOverlapsPolygon } from './streetFronts.ts';
import { generateLevel } from './generateRoute.ts';

function fixture(angle = 0): LevelPlan {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + s * point.z,
    y: point.y, z: -s * point.x + c * point.z });
  const surfaces: SurfaceId[] = [];
  for (let row = 0; row < 80; row++) for (let column = 0; column < 80; column++) {
    const x = -80 + (column + 0.5) * 2, z = -80 + (row + 0.5) * 2;
    const localZ = s * x + c * z;
    surfaces.push(localZ >= 48 && localZ <= 56 ? 'pavement' : 'grass');
  }
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 52 }),
    headingY: Math.PI / 2 + angle, halfWidth: 4, gradient: 0, surface: 'pavement' as const });
  return {
    id: 'protected-industrial-fixture',
    spawn: { position: rotate({ x: 0, y: 0, z: 52 }), headingY: angle },
    heightfield: { originX: -80, originZ: -80, spacing: 2, columns: 81, rows: 81,
      heights: Array.from({ length: 81 * 81 }, () => 0), surfaces },
    surround: { height: 0, surface: 'grass' }, checkpoints: [],
    segments: [{ id: 'industrial-street', entry: socket(-60), exit: socket(60), colliders: [] }],
    props: [{ kind: 'building', look: 'industrial', scale: 1,
      position: rotate({ x: 0, y: 0, z: 25 }), rotationY: angle, size: { x: 18, y: 8, z: 20 } }],
    solids: [{ centre: rotate({ x: 0, y: 4, z: 25 }), halfExtents: { x: 9, y: 4, z: 10 },
      rotationY: angle, surface: 'pavement', occludes: true }],
  };
}

test('one industrial exemplar requires an existing protecting body, real street and flat room', () => {
  const plan = fixture(), before = JSON.stringify(plan);
  const sites = environmentSites(plan);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].building, plan.props![0], 'the existing building owns the site');
  assert.deepEqual(sites[0].position, { x: 0, y: 0, z: 35 });
  assert.equal(sites[0].faceWidth, 18);
  assert.equal(sites[0].roomDepth, 6);
  assert.deepEqual(sites, environmentSites(plan));
  assert.equal(JSON.stringify(plan), before, 'selection/emitter derivation cannot write a plan');
  const emitters = environmentEmitters(sites);
  assert.deepEqual(emitters.map(e => e.kind), ['industrial']);
  assert.ok(emitters[0].position.z > 15 && emitters[0].position.z < 35);
  for (const look of ['commercial', 'residential'] as const) {
    assert.equal(environmentSites({ ...plan, props: plan.props!.map(prop => ({ ...prop, look })) }).length, 0);
  }
  assert.equal(environmentSites({ ...plan, solids: [] }).length, 0, 'a non-solid host cannot protect a vehicle');
  assert.equal(environmentSites({ ...plan, solids: plan.solids!.map(solid => ({ ...solid,
    halfExtents: { ...solid.halfExtents, x: 8 } })) }).length, 0, 'an undersized body cannot protect the full room');
  assert.equal(environmentSites({ ...plan, heightfield: { ...plan.heightfield,
    surfaces: plan.heightfield.surfaces.map(() => 'grass' as const) } }).length, 0,
  'a street socket cannot turn an actual grass cell into pavement');
  assert.equal(environmentSites({ ...plan, heightfield: { ...plan.heightfield,
    heights: plan.heightfield.heights.map((_, index) => (-80 + index % 81 * 2) * 0.1) } }).length, 0,
  'a flat slab cannot stand over sloping base ground');
});

test('rotated courses rotate the exemplar while every unsuitable/blocked approach is refused', () => {
  const original = environmentSites(fixture())[0];
  const angle = 0.71, rotated = environmentSites(fixture(angle))[0];
  assert.ok(rotated, 'rotated positive fixture remains eligible');
  const c = Math.cos(angle), s = Math.sin(angle);
  assert.ok(Math.abs(rotated.position.x - original.position.z * s) < 1e-8);
  assert.ok(Math.abs(rotated.position.z - original.position.z * c) < 1e-8);
  assert.ok(Math.abs(Math.sin(rotated.yaw - original.yaw - angle)) < 1e-8);
  const plan = fixture();
  const obstruction: BoxCollider = { centre: { x: 1.3, y: 1, z: 43 },
    halfExtents: { x: 0.8, y: 1, z: 0.8 }, rotationY: Math.PI / 4, surface: 'wood' };
  assert.equal(environmentSites({ ...plan, solids: [...plan.solids!, obstruction] }).length, 0,
    'the full approach width must clear an oblique solid corner');
  assert.equal(environmentSites({ ...plan, segments: plan.segments.map(segment => ({ ...segment,
    colliders: [obstruction] })) }).length, 0, 'authored walls also block approaches');
  assert.equal(environmentSites({ ...plan, segments: plan.segments.map(segment => ({ ...segment,
    exit: { ...segment.exit, headingY: segment.exit.headingY + 0.1 } })) }).length, 0,
  'an arc chord cannot claim a straight loading street');
  assert.equal(environmentSites({ ...plan, props: plan.props!.map(prop => ({ ...prop,
    size: { x: 8, y: 8, z: 20 } })) }).length, 0, 'a narrow facade cannot host the prepared room');
});

test('sparse selection adds no random draws and keeps one site among several valid hosts', () => {
  const plan = fixture();
  const building = plan.props![0], solid = plan.solids![0];
  const second = { ...building, position: { ...building.position, x: 30 } };
  const populated = { ...plan, props: [building, second], solids: [solid,
    { ...solid, centre: { ...solid.centre, x: 30 } }] };
  const before = JSON.stringify(populated);
  assert.equal(environmentSites(populated).length, 1);
  assert.equal(environmentSites(populated)[0].building, building, 'nearest suitable exemplar is deterministic');
  assert.equal(JSON.stringify(populated), before);
  assert.deepEqual(environmentSites({ ...plan, props: [] }), []);
  assert.deepEqual(environmentEmitters([]), []);
});

test('industrial rough concrete is eligible, while loose yard surfaces remain ineligible', () => {
  const original = fixture();
  const onSurface = (surface: SurfaceId): LevelPlan => ({ ...original,
    heightfield: { ...original.heightfield, surfaces: original.heightfield.surfaces.map(value =>
      value === 'pavement' ? surface : value) },
    segments: original.segments.map(segment => ({ ...segment,
      entry: { ...segment.entry, surface }, exit: { ...segment.exit, surface } })) });
  assert.equal(environmentSites(onSurface('roughPavement')).length, 1);
  for (const surface of ['gravel', 'dirt', 'grass'] as const) {
    assert.equal(environmentSites(onSurface(surface)).length, 0);
  }
  for (const seed of ['euc', 'corner', 'city', 'rider']) {
    const plan = generateLevel(seed).plan;
    const before = JSON.stringify(plan);
    const sites = environmentSites(plan);
    assert.equal(plan.id, `generated-r6-${seed}`, `${seed}: exercise the requested real generated world`);
    assert.equal(sites.length, 1, `${seed}: the real generated return street supplies a protected host`);
    if (seed === 'euc') assert.equal(sites[0].id, 'industrial-bay-490',
      'the nearest host whose real personnel entrance clears original street furniture is selected');
    const patches = industrialGroundPatches(plan, sites[0]);
    assert.ok(patches.length >= 2 && patches.length <= 8, `${seed}: both actual approaches have matched ground`);
    assert.equal(new Set(patches.map(patch => patch.footprint!.id)).size, 2);
    assert.equal(JSON.stringify(plan), before);
    for (const site of sites) assert.equal(site.building.look, 'industrial');
  }
});

test('the default bay 489 offset entrance retains its original bin blocker; bay 490 has a clear protected host', () => {
  const plan = generateLevel('euc').plan, before = JSON.stringify(plan);
  const bin = plan.props![488], blocker = plan.solids![326];
  assert.equal(bin.kind, 'litterBin', 'the obstruction is original street furniture');
  assert.ok(Math.hypot(bin.position.x - 9.883081314050482, bin.position.z + 16.05823354595463) < 1e-9);
  assert.equal(blocker.centre.x, bin.position.x);
  assert.equal(blocker.centre.z, bin.position.z);
  assert.ok(Math.abs(blocker.centre.y + blocker.halfExtents.y - 0.89) < 1e-9);

  // Negative control only: no shipped prop, collider or world is changed.
  // Isolate the original protecting body in a copy to prove the ground/site
  // positive control. The wider apron adds an independent original blocker;
  // removing only the bin must no longer admit this historical candidate.
  const oldBuilding = plan.props![489];
  const oldBody = plan.solids!.find(solid => Math.hypot(solid.centre.x - oldBuilding.position.x,
    solid.centre.z - oldBuilding.position.z) < 0.001)!;
  const isolatedHost: LevelPlan = { ...plan, solids: [oldBody] };
  const withoutBinSolid: LevelPlan = { ...plan, solids: plan.solids!.filter(solid => solid !== blocker) };
  assert.equal(environmentSites(withoutBinSolid)[0].id, 'industrial-bay-490',
    'the original apron obstruction survives a bin-only diagnostic removal');
  const formerlyEligible = environmentSites(isolatedHost)[0];
  assert.equal(formerlyEligible.id, 'industrial-bay-489');
  assert.equal(formerlyEligible.building, plan.props![489]);
  assert.deepEqual(industrialGroundPatches(plan, formerlyEligible), [], 'the original bin still blocks the actual entry');
  const unblocked = industrialGroundPatches(isolatedHost, formerlyEligible);
  assert.equal(unblocked.length, 4, 'the isolated original host proves both source-matched footprints');
  assert.deepEqual(industrialGroundPatches({ ...isolatedHost, solids: [oldBody, blocker] }, formerlyEligible), [],
    'the bin alone refuses the actual personnel strip');
  const apronBlocker = plan.solids![320];
  assert.deepEqual(industrialGroundPatches({ ...isolatedHost, solids: [oldBody, apronBlocker] }, formerlyEligible), [],
    'the independent original apron blocker also refuses this bay');
  const footprint = unblocked[0].footprint!, c = Math.cos(footprint.yaw), s = Math.sin(footprint.yaw);
  const at = (x: number, z: number): Vec3 => ({ x: footprint.origin.x + c * x + s * z,
    y: footprint.origin.y, z: footprint.origin.z - s * x + c * z });
  const half = footprint.width / 2;
  assert.ok(boxOverlapsPolygon(blocker, [at(-half, footprint.near), at(half, footprint.near),
    at(half, footprint.far), at(-half, footprint.far)]), 'the entire rotated bin footprint intersects the real entry');
  const oldCentreLineOffset = c * (bin.position.x - formerlyEligible.position.x)
    - s * (bin.position.z - formerlyEligible.position.z);
  assert.ok(Math.abs(oldCentreLineOffset) > ENVIRONMENT_SITE_RULES.approachHalfWidth + 1,
    'a building-centre approach would miss this offset-door obstruction');

  const selected = environmentSites(plan)[0];
  assert.equal(selected.id, 'industrial-bay-490');
  assert.equal(selected.building, plan.props![490]);
  assert.deepEqual(selected.building.size, { x: 17, y: 12, z: 18 });
  const body = plan.solids![328];
  assert.deepEqual(body.halfExtents, { x: 8.5, y: 6, z: 9 });
  assert.equal(body.centre.x, selected.building.position.x);
  assert.equal(body.centre.z, selected.building.position.z);
  assert.equal(body.rotationY, selected.building.rotationY);
  assert.equal(body.centre.y - body.halfExtents.y, selected.position.y);
  assert.ok(body.centre.y + body.halfExtents.y >= selected.position.y + selected.height);
  // Apply both local frames when checking the protected room, including the
  // quarter turn that makes this building's narrow side face the return road.
  const faceC = Math.cos(selected.yaw), faceS = Math.sin(selected.yaw);
  const bodyC = Math.cos(body.rotationY), bodyS = Math.sin(body.rotationY);
  for (const x of [-selected.roomWidth / 2, selected.roomWidth / 2]) for (const z of [-selected.roomDepth, 0]) {
    const worldX = selected.position.x + faceC * x + faceS * z;
    const worldZ = selected.position.z - faceS * x + faceC * z;
    const dx = worldX - body.centre.x, dz = worldZ - body.centre.z;
    assert.ok(Math.abs(bodyC * dx - bodyS * dz) <= body.halfExtents.x + 1e-9);
    assert.ok(Math.abs(bodyS * dx + bodyC * dz) <= body.halfExtents.z + 1e-9);
  }
  const actual = industrialGroundPatches(plan, selected);
  assert.deepEqual(actual.map(patch => [patch.sourceSurface, patch.surface]),
    [['grass', 'pavement'], ['roughPavement', 'roughPavement'],
      ['grass', 'pavement'], ['roughPavement', 'roughPavement']]);
  assert.equal(actual[0].footprint!.width, 1.5);
  assert.equal(actual[0].footprint!.far, 9.25);
  assert.equal(actual[2].footprint!.width, INDUSTRIAL_APPROACH_RULES.serviceApronWidth);
  assert.equal(actual[2].footprint!.far, 9.25);
  assert.equal(actual[2].footprint!.origin.x,
    selected.position.x + faceC * INDUSTRIAL_APPROACH_RULES.serviceApronOffset);
  assert.equal(actual[2].footprint!.origin.z,
    selected.position.z - faceS * INDUSTRIAL_APPROACH_RULES.serviceApronOffset);
  assert.equal(industrialPersonnelDoorOffset(selected), 5.5);
  assert.equal(plan.props![488], bin);
  assert.equal(plan.solids![326], blocker);
  assert.equal(JSON.stringify(plan), before, 'diagnosis cannot relocate/remove the bin or change the source world');
});

test('the authoritative personnel door offset, rather than the loading-centre line, owns admission', () => {
  const plan = fixture(), site = environmentSites(plan)[0];
  const door = industrialPersonnelDoorOffset(site);
  assert.equal(door, 5.5);
  const blocker: BoxCollider = { centre: { x: door, y: 1.5, z: 42 },
    halfExtents: { x: 0.12, y: 1.5, z: 0.2 }, rotationY: 0.41, surface: 'wood' };
  assert.equal(environmentSites({ ...plan, solids: [...plan.solids!, blocker] }).length, 0,
    'a blocker missed by the building-centre approach still invalidates the actual door');
  assert.equal(environmentSites({ ...plan, segments: plan.segments.map(segment => ({ ...segment,
    colliders: [blocker] })) }).length, 0, 'authored colliders are checked at the actual door too');
  const interrupted = { ...plan, heightfield: { ...plan.heightfield,
    surfaces: plan.heightfield.surfaces.map((surface, index) =>
      Math.floor(index / 80) === 61 ? 'dirt' as const : surface) } };
  assert.equal(environmentSites(interrupted).length, 0,
    'a protected host cannot pave across an intervening unapproved path');
});

test('the bounded service apron is mandatory even when the personnel strip and old centreline are clear', () => {
  const plan = fixture(), before = JSON.stringify(plan), site = environmentSites(plan)[0];
  const patches = industrialGroundPatches(plan, site);
  assert.equal(new Set(patches.map(patch => patch.footprint!.id)).size, 2);
  const blocker: BoxCollider = { centre: { x: 3.3, y: 1.5, z: 39 },
    halfExtents: { x: 0.2, y: 1.5, z: 0.3 }, rotationY: Math.PI / 4, surface: 'wood' };
  const apron = patches.find(patch => patch.id.includes('-service-apron-'))!.footprint!;
  const polygon = [{ x: apron.origin.x - apron.width / 2, y: 0, z: apron.origin.z + apron.near },
    { x: apron.origin.x + apron.width / 2, y: 0, z: apron.origin.z + apron.near },
    { x: apron.origin.x + apron.width / 2, y: 0, z: apron.origin.z + apron.far },
    { x: apron.origin.x - apron.width / 2, y: 0, z: apron.origin.z + apron.far }];
  assert.ok(boxOverlapsPolygon(blocker, polygon), 'an oblique corner reaches inside the full apron');
  assert.ok(blocker.centre.x > ENVIRONMENT_SITE_RULES.approachHalfWidth + 1,
    'the building-centre approach would miss this original blocker');
  assert.equal(environmentSites({ ...plan, solids: [...plan.solids!, blocker] }).length, 0,
    'a clear door cannot admit an apron blocked by an original solid');
  const apronCell = 60 * 80 + 40;
  assert.ok(patches.filter(patch => patch.id.includes('-personnel-entry-'))
    .every(patch => patch.triangles.every(triangle => triangle.cell !== apronCell)));
  assert.equal(environmentSites({ ...plan, heightfield: { ...plan.heightfield,
    surfaces: plan.heightfield.surfaces.map((surface, index) => index === apronCell ? 'wood' as const : surface) } }).length, 0,
  'an apron-only protected source path cannot be paved');
  assert.equal(environmentSites({ ...plan, heightfield: { ...plan.heightfield,
    heights: plan.heightfield.heights.map((height, index) => index === 61 * 81 + 40 ? 0.6 : height) } }).length, 0,
  'an apron-only original ridge cannot be flattened to admit a site');
  assert.equal(JSON.stringify(plan), before);
});

test('a genuine gentle return-road arc uses its own centreline rather than the socket chord', () => {
  const original = fixture();
  const segment = original.segments[0], turn = 0.15, length = 120;
  const h0 = segment.entry.headingY, h1 = h0 + turn, curvature = turn / length;
  const arc = { ...segment, exit: { ...segment.exit, headingY: h1, position: {
    x: segment.entry.position.x + (Math.cos(h0) - Math.cos(h1)) / curvature,
    y: 0,
    z: segment.entry.position.z + (Math.sin(h1) - Math.sin(h0)) / curvature,
  } } };
  const sites = environmentSites({ ...original, segments: [arc] });
  assert.equal(sites.length, 1);
  const chordT = (sites[0].street.x - arc.entry.position.x)
    / (arc.exit.position.x - arc.entry.position.x);
  const chordZ = arc.entry.position.z + chordT * (arc.exit.position.z - arc.entry.position.z);
  assert.ok(Math.abs(sites[0].street.z - chordZ) > 2, 'positive control separates true arc and false chord');
  assert.ok(sites[0].street.z >= 48 && sites[0].street.z <= 56, 'the selected station is actually paved');
});
