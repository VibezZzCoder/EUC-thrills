/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop, BoxCollider } from '../level/plan.ts';
import { BUILDING_FACADE, BUILDING_TONES, PROP_COLOURS, PROP_SIZES, PROP_TINT_JITTER, type BuildingLook } from '../data/props.ts';
import { composeBuilding, LANDMARK_SIZES } from '../data/buildingLooks.ts';
import { buildingTowerPart, propPartCounts } from '../data/renderCost.ts';
import { positionHash01 } from '../shared/maths.ts';
import { planDigest } from '../level/planDigest.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type SurfaceId } from '../simulation/world.ts';
import { districtExteriorSites, exteriorComposition, exteriorPartMeetsOpening } from './districtExteriorSites.ts';
import type { FacadeOpening } from './streetFacadeOpenings.ts';
import { createDistrictExterior } from './districtExterior.ts';
import { ultraFacadeBox } from './ultra/ultraBuildings.ts';
import { relievedPositions, shellReport } from './ultra/ultraKit.ts';
import { ULTRA } from '../data/tuning.ts';
import { withDistrictAdjacency } from '../level/districtAdjacency.ts';

export function exteriorFixture(look: BuildingLook = 'residential', yaw = 0): LevelPlan {
  const size = look === 'commercial' ? { x: 12, y: 20, z: 16 }
    : look === 'residential' || look === 'industrial' ? { x: 12, y: 7, z: 16 } : LANDMARK_SIZES[look];
  const building: Prop = { kind: 'building', look, position: { x: 18, y: 0, z: 24 },
    rotationY: yaw, scale: 1, size };
  const body: BoxCollider = { centre: { x: 18, y: building.size!.y / 2, z: 24 },
    halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 }, rotationY: yaw, surface: 'pavement' };
  const surfaces = new Array<SurfaceId>(160 * 160).fill('grass');
  for (let row = 0; row < 160; row += 1) for (let column = 75; column < 85; column += 1) {
    surfaces[row * 160 + column] = 'pavement';
  }
  return { id: 'exterior-source-control', heightfield: { originX: -80, originZ: -80, spacing: 1,
    columns: 161, rows: 161, heights: new Array<number>(161 * 161).fill(0), surfaces },
    surround: { height: 0, surface: 'grass' }, spawn: { position: { x: -60, y: 0, z: -60 }, headingY: 0 },
    checkpoints: [], props: [building], solids: [body], segments: [{ id: 'original-street',
      entry: { position: { x: 0, y: 0, z: -60 }, headingY: 0, halfWidth: 5, gradient: 0, surface: 'pavement' },
      exit: { position: { x: 0, y: 0, z: 70 }, headingY: 0, halfWidth: 5, gradient: 0, surface: 'pavement' }, colliders: [] }] };
}

test('whole building depth follows original body, street-facing yaw and actual composed roof', () => {
  const plan = exteriorFixture(), before = planDigest(plan), first = districtExteriorSites(plan), second = districtExteriorSites(plan);
  assert.deepEqual(first, second); assert.equal(planDigest(plan), before);
  assert.equal(first.length, 1);
  const site = first[0];
  assert.equal(site.building, plan.props![0]); assert.equal(site.body, plan.solids![0]);
  assert.equal(site.streetSegmentId, 'original-street');
  assert.ok(Math.sin(site.streetFaceYaw!) < -0.99, 'the frontage points toward the factual west-side street');
  assert.ok(site.parts.some(part => part.kind === 'sill'));
  const roofs = exteriorComposition(site.building).filter(piece => piece.part === 'roofGable');
  assert.equal(site.parts.filter(part => part.shape === 'beam').length, roofs.length * 7);
  assert.ok(site.parcels.length > 0, 'clear factual grass supports purposeful low planting');
  const sampler = new PlanTerrainSampler(plan);
  for (const root of site.parcels.flatMap(parcel => parcel.roots)) {
    const ground = sampler.sampleGround(root.position.x, root.position.z, createGroundSample());
    assert.equal(ground.surface, 'grass'); assert.equal(root.position.y, ground.height + 0.003);
    assert.ok(root.height <= 0.12 && root.radius <= 0.16);
  }
});

test('district form uses existing height/bands and roof vocabulary rather than universal storefronts', () => {
  const commercial = districtExteriorSites(exteriorFixture('commercial'))[0];
  const residential = districtExteriorSites(exteriorFixture('residential'))[0];
  const industrial = districtExteriorSites(exteriorFixture('industrial'))[0];
  const park = districtExteriorSites(exteriorFixture('clockTower'))[0];
  assert.ok(commercial.parts.some(part => part.kind === 'cornice'));
  assert.ok(residential.parts.some(part => part.kind === 'ridge'));
  assert.ok(industrial.parts.filter(part => part.kind === 'ridge').length > 1);
  assert.ok(park.parts.some(part => part.kind === 'shaft-band'));
  assert.ok(park.parts.filter(part => part.kind === 'sill').every(part => part.shape === 'box' && part.position.y > 19),
    'only the actual glazed stage receives sills; the stone shaft has no office rows');
  for (const site of [commercial, residential, industrial, park]) {
    assert.ok(site.parts.every(part => ['plinth', 'cornice', 'sill', 'pier', 'roof-edge', 'ridge', 'ground-cover',
      'base-panel', 'base-return', 'shaft-band', 'shaft-stile', 'shaft-brace', 'roof-rim'].includes(part.kind)));
  }
});

test('closed entries face admitted connected approaches and preserve selected or civic fronts', () => {
  for (const look of ['commercial', 'residential', 'industrial'] as const) {
    // Admit a neutral body without selecting a richer pilot art face. The
    // independent appearance tag below leaves the physical body/approach exact.
    const source = exteriorFixture(look);
    const neutral = withDistrictAdjacency({ ...source, props: [{ ...source.props![0], look: undefined }] });
    const plan = { ...neutral, props: neutral.props!.map((prop, index) => index === 0 ? { ...prop, look } : prop) };
    assert.ok(plan.districtAdjacency!.frontages.length > 0, 'actual physical approach positive');
    const before = planDigest(plan), sites = districtExteriorSites(plan), entry = sites[0].parts.find(part => part.kind === 'closed-entry');
    assert.ok(entry && entry.shape === 'box', `${look}: the arrival must reach a closed human-scale entry`);
    const front = plan.districtAdjacency!.frontages[0];
    assert.equal(entry.yaw, front.yaw); assert.ok(entry.size.y >= 1.9 && entry.size.y <= 2.12);
    assert.ok(entry.size.x >= 1.08 && entry.size.x <= 1.28);
    assert.ok(sites[0].parts.some(part => part.kind === 'entry-handle'));
    assert.equal(sites[0].parts.filter(part => part.kind === 'ground-window').length, 2);
    assert.equal(planDigest(plan), before, 'render details never open or change the protecting body');
    const retained = { ...plan, districtAdjacency: { ...plan.districtAdjacency!,
      frontages: plan.districtAdjacency!.frontages.map(front => ({ ...front, retainedOpening: true })) } };
    assert.ok(districtExteriorSites(retained)[0].parts.every(part => part.kind !== 'closed-entry'));
    const civic = { ...plan, districtAdjacency: { ...plan.districtAdjacency!,
      frontages: plan.districtAdjacency!.frontages.map(front => ({ ...front, role: 'civic-margin' as const })) } };
    assert.ok(districtExteriorSites(civic)[0].parts.every(part => part.kind !== 'closed-entry'));
    const mask: FacadeOpening = { position: front.position, yaw: front.yaw, faceWidth: front.width,
      height: 3, depth: 0.8 };
    assert.ok(districtExteriorSites(plan, [mask])[0].parts.every(part => !exteriorPartMeetsOpening(part, mask)),
      'an independently protected art face still wins');
  }
});

test('wide commercial approaches carry a full ground-floor bay rhythm without changing their physical body', () => {
  const source = exteriorFixture('commercial');
  const building = { ...source.props![0], look: undefined, size: { x: 12, y: 20, z: 40 } };
  const neutral = withDistrictAdjacency({ ...source, props: [building],
    solids: [{ ...source.solids![0], halfExtents: { x: 6, y: 10, z: 20 } }] });
  const plan = { ...neutral, props: neutral.props!.map((prop, index) => index === 0
    ? { ...prop, look: 'commercial' as const } : prop) };
  const front = plan.districtAdjacency!.frontages[0], before = planDigest(plan);
  assert.ok(front && front.width >= 20, 'use a real admitted broad commercial arrival');
  const windows = districtExteriorSites(plan)[0].parts.filter(part => part.kind === 'ground-window');
  assert.ok(windows.length >= 4, 'two domestic-sized windows leave a broad commercial wall empty');
  const centres = windows.map(part => {
    assert.equal(part.shape, 'box');
    if (part.shape !== 'box') throw new Error('Ground window must have a protecting closed panel');
    const x = (part.position.x - front.position.x) * Math.cos(front.yaw)
      - (part.position.z - front.position.z) * Math.sin(front.yaw);
    assert.ok(Math.abs(x) + part.size.x / 2 < front.width / 2, 'bays must stay inside their own frontage');
    assert.ok(part.size.x > 2 && part.size.y > 1.4, 'commercial bays must read as a distinct frontage grammar');
    return x;
  });
  assert.ok(Math.max(...centres) - Math.min(...centres) > front.width * 0.6);
  assert.equal(planDigest(plan), before);
});

test('untagged legacy bodies retain neutral identity and exact original cap/tower composition', () => {
  const source = exteriorFixture('commercial', Math.PI / 7), tagged = source.props![0];
  const { look: _look, ...legacy } = tagged;
  assert.equal(_look, 'commercial');
  const size = { ...legacy.size!, y: 44 };
  const position = Array.from({ length: 32 }, (_, index) => ({ ...legacy.position, x: 18 + index }))
    .find(point => buildingTowerPart(size, point.x, point.z) !== null)!;
  assert.ok(position, 'bounded source positions include a factual legacy setback');
  const building: Prop = { ...legacy, position, size }, original = { ...source, props: [building], solids: [{
    ...source.solids![0], centre: { ...position, y: size.y / 2 }, halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } }] };
  const before = planDigest(original), pieces = exteriorComposition(building), site = districtExteriorSites(original)[0];
  assert.ok(site); assert.equal(site.look, undefined); assert.equal(building.look, undefined);
  assert.equal(site.building, building); assert.equal(planDigest(original), before);
  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece.part, (counts.get(piece.part) ?? 0) + 1);
  assert.deepEqual(counts, propPartCounts(building), 'descriptors match the actual existing prop admission model');
  assert.equal(pieces[0].part, 'buildingTall'); assert.equal(pieces[0].sy, size.y);
  assert.equal(pieces[0].tone, BUILDING_TONES[Math.floor(positionHash01(position.x, position.z, 3) * BUILDING_TONES.length) % BUILDING_TONES.length]);
  assert.equal(pieces[0].jitter, 1 + (positionHash01(position.x, position.z, 5) * 2 - 1) * PROP_TINT_JITTER.building);
  assert.equal(pieces[1].tone, PROP_COLOURS.buildingCap);
  assert.equal(pieces[1].sx, size.x + PROP_SIZES.building.capOversail);
  const tower = pieces[2]; assert.equal(tower.y, size.y + PROP_SIZES.building.capHeight);
  assert.equal(tower.sy, size.y * PROP_SIZES.building.towerHeightFraction);
  const band = tower.sy / BUILDING_FACADE.lowFloors;
  assert.ok(site.parts.some(part => part.kind === 'sill' && part.shape === 'box'
    && Math.abs(part.position.y - (tower.y + band * (2 - BUILDING_FACADE.glazing) - 0.035)) < 1e-9),
  'setback relief follows its own original band count and elevated datum');
  assert.ok(site.parts.some(part => part.kind === 'base-panel'));
  assert.ok(site.parts.some(part => part.kind === 'roof-rim'));
  const short = { ...building, size: { ...size, y: 7 } };
  assert.equal(exteriorComposition(short).length, 2, 'the original short-tower suppression is retained');
  assert.deepEqual(exteriorComposition(tagged), composeBuilding({ ...tagged, look: tagged.look! }));
});

test('lookout cladding follows its solid shaft and actual elevated glazed cabin while preserving masks', () => {
  const plan = exteriorFixture('lookout', Math.PI / 7), building = plan.props![0], site = districtExteriorSites(plan)[0];
  const braces = site.parts.filter(part => part.kind === 'shaft-brace');
  assert.equal(braces.length, 32); assert.ok(braces.every(part => part.shape === 'beam' && !part.rich && part.faceYaw !== undefined));
  assert.equal(site.parts.filter(part => part.kind === 'shaft-band').length, 12);
  assert.ok(site.parts.filter(part => part.kind === 'sill').every(part => part.shape === 'box' && part.position.y > 16));
  const opening: FacadeOpening = { position: building.position, yaw: building.rotationY,
    faceWidth: 16, height: 22, depth: 10 };
  assert.ok(braces.some(part => exteriorPartMeetsOpening(part, opening)), 'known crossing brace control');
  for (const protectedSite of districtExteriorSites(plan, [opening])) {
    assert.ok(protectedSite.parts.every(part => !exteriorPartMeetsOpening(part, opening)));
  }
});

test('every accepted facade mask remains unobstructed, including full-width tall commercial bays', () => {
  const plan = exteriorFixture('commercial'), building = plan.props![0];
  const opening: FacadeOpening = { position: { x: building.position.x - 6, y: 0, z: building.position.z },
    yaw: -Math.PI / 2, faceWidth: 16, height: 9, depth: 6 };
  const plain = districtExteriorSites(plan)[0], protectedSite = districtExteriorSites(plan, [opening])[0];
  assert.ok(plain.parts.some(part => exteriorPartMeetsOpening(part, opening)), 'unprotected control crosses the selected mask');
  assert.ok(protectedSite.parts.every(part => !exteriorPartMeetsOpening(part, opening)));
  assert.ok(protectedSite.parts.some(part => part.kind === 'cornice'), 'the useful upper skyline remains');
});

test('exact source body and suitable finished grass are mandatory', () => {
  const plan = exteriorFixture();
  assert.deepEqual(districtExteriorSites({ ...plan, solids: [] }), []);
  const enclosing = { ...plan.solids![0], halfExtents: { ...plan.solids![0].halfExtents, x: 7 } };
  assert.deepEqual(districtExteriorSites({ ...plan, solids: [enclosing] }), []);
  const paved = { ...plan, heightfield: { ...plan.heightfield,
    surfaces: plan.heightfield.surfaces.map((): SurfaceId => 'pavement') } };
  assert.equal(districtExteriorSites(paved)[0].parcels.length, 0, 'no planting on the finished pavement');
  const poisoned = { ...plan, hazards: [{ id: 'original-hole', kind: 'potholeDeep' as const,
    centre: plan.props![0].position, radius: 100 }] };
  assert.equal(districtExteriorSites(poisoned)[0].parcels.length, 0, 'original hazards reserve the whole parcel');
  assert.ok(districtExteriorSites(poisoned)[0].parts.some(part => part.kind === 'ridge'), 'hazards do not delete the existing roof');
});

test('low planting keeps authored movement bands and rotated sites clear', () => {
  const plan = exteriorFixture('residential', Math.PI / 7), site = districtExteriorSites(plan)[0];
  assert.ok(site.parts.length > 0);
  const reserve = { ...plan, populationPaths: [{ id: 'factual-walk-band', role: 'pedestrian' as const,
    district: 'residential' as const, closed: false, serviceShuttle: false,
    frames: [{ x: -40, y: 0, z: 24, headingY: Math.PI / 2, distanceMetres: 0,
      sourceSegmentId: 'original-street', halfWidthMetres: 100 },
    { x: 40, y: 0, z: 24, headingY: Math.PI / 2, distanceMetres: 80,
      sourceSegmentId: 'original-street', halfWidthMetres: 100 }] }] };
  assert.equal(districtExteriorSites(reserve)[0].parcels.length, 0);
});


/** Exact retained warehouse489 dimensions/yaw; no excluded fixture import. */
function terminationWarehouse(): LevelPlan {
  const source = exteriorFixture('industrial', 6.366767586500848);
  const position = { x: 23.08088108068811, y: 0, z: -21.980358904296967 };
  const building = { ...source.props![0], position, size: { x: 15, y: 16, z: 22 } };
  return { ...source, props: [building], solids: [{ centre: { ...position, y: 8 },
    halfExtents: { x: 7.5, y: 8, z: 11 }, rotationY: building.rotationY, surface: 'pavement' }] };
}
function terminationPoint(plan: LevelPlan, x: number, y: number, z: number): THREE.Vector3 {
  const prop = plan.props![0], c = Math.cos(prop.rotationY), s = Math.sin(prop.rotationY);
  return new THREE.Vector3(prop.position.x + c * x + s * z, prop.position.y + y,
    prop.position.z - s * x + c * z);
}

test('A1: actual inward lower returns close both warehouse ends and all four native mitres', () => {
  const plan = terminationWarehouse(), before = JSON.stringify(plan), sites = districtExteriorSites(plan);
  const site = sites[0], returns = site.parts.filter(part => part.kind === 'base-return');
  assert.equal(returns.length, 8); assert.ok(returns.every(part => part.shape === 'box' && part.rich && part.finish === 'frame'));
  assert.deepEqual(districtExteriorSites(plan), sites); assert.equal(JSON.stringify(plan), before);
  const material = new THREE.MeshStandardMaterial();
  const appearance = { materials: { masonry: material, frame: material, roofEdge: material,
    planting: material, entry: material, glazing: material }, colourFor: () => [1, 1, 1] as const };
  const view = createDistrictExterior(plan, appearance, [{ ...site, parts: returns }]);
  const legacy = createDistrictExterior(plan, appearance, [{ ...site,
    parts: site.parts.filter(part => part.kind !== 'base-return') }]);
  const source = ultraFacadeBox('buildingBody');
  const drawn = new THREE.BufferGeometry();
  drawn.setAttribute('position', new THREE.BufferAttribute(new Float32Array(relievedPositions(source, [15, 16, 22])), 3));
  const host = new THREE.Mesh(drawn, material); host.position.copy(terminationPoint(plan, 0, 0, 0));
  host.rotation.y = plan.props![0].rotationY; host.updateMatrixWorld(true);
  try {
    assert.equal(view.report().colourTriangles, 0, 'ordinary never draws the rich returns');
    assert.equal(view.report().instanceBytes, 8 * 76, 'hidden rich capacity remains fully charged');
    assert.equal(view.report().geometryBytes, 936); assert.equal(view.report().materialOwners, 0);
    assert.equal(view.report().textureBytes, 0); assert.equal(view.report().shadowDrawCalls, 0);
    view.setDetail(true); legacy.setDetail(true); view.group.updateMatrixWorld(true); legacy.group.updateMatrixWorld(true);
    assert.equal(view.report().colourTriangles, 8 * 12); assert.equal(view.report().drawCalls, 1);
    const geometry = (view.group.children[0] as THREE.Mesh).geometry.toNonIndexed();
    try { const shell = shellReport(geometry.getAttribute('position').array);
      assert.ok(shell.closed && shell.volume > 0); assert.equal(shell.triangles, 12);
    } finally { geometry.dispose(); }
    const ray = new THREE.Raycaster();
    for (const [x, z] of [[0, 11 - .15], [0, -11 + .15], [7.5 - .15, 0], [-7.5 + .15, 0]]) {
      // This vertical gap lies behind the old plinth and outside the recessed
      // native body. Its original source really is empty; the backing fills it.
      ray.set(terminationPoint(plan, x, .70, z), new THREE.Vector3(0, -1, 0));
      assert.equal(ray.intersectObject(host).length, 0, 'original inward host misses the lower perimeter gap');
      assert.equal(ray.intersectObjects(legacy.group.children).length, 0, 'old trim leaves the same gap');
      assert.ok(ray.intersectObjects(view.group.children).length > 0, 'actual native return must block that gap');
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const start = terminationPoint(plan, x * 7.80, 2, z * 11.30);
      const inside = terminationPoint(plan, x * (7.5 - .125), 2, z * (11 - .125));
      ray.set(start, inside.clone().sub(start).normalize());
      assert.equal(ray.intersectObjects(legacy.group.children).length, 0, 'old frame has no lower corner termination');
      assert.ok(ray.intersectObjects(view.group.children).length > 0, 'all four actual corner piers own their termination');
    }
    view.setDetail(false); assert.equal(view.report().colourTriangles, 0);
  } finally { view.dispose(); legacy.dispose(); source.dispose(); drawn.dispose(); material.dispose(); }
});

test('A1: native recess dimensions, masks, selected owners and source-body refusals stay authoritative', () => {
  const plan = terminationWarehouse(), site = districtExteriorSites(plan)[0];
  const parts = site.parts.filter(part => part.kind === 'base-return'), reveal = ULTRA.relief.revealDepth;
  for (const part of parts) {
    assert.equal(part.shape, 'box'); if (part.shape !== 'box') throw Error('Return must be closed box');
    assert.ok(part.size.x > 0 && part.size.y > 0 && part.size.z > 0);
    assert.ok(part.size.y === .44 || part.size.y === 4);
    const c = Math.cos(part.yaw), s = Math.sin(part.yaw), bc = Math.cos(site.building.rotationY), bs = Math.sin(site.building.rotationY);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const dx = part.position.x + c * x * part.size.x / 2 + s * z * part.size.z / 2 - site.building.position.x;
      const dz = part.position.z - s * x * part.size.x / 2 + c * z * part.size.z / 2 - site.building.position.z;
      assert.ok(Math.abs(bc * dx - bs * dz) <= 7.5 + 1e-12);
      assert.ok(Math.abs(bs * dx + bc * dz) <= 11 + 1e-12);
      assert.ok(part.position.y + y * part.size.y / 2 >= 0 && part.position.y + y * part.size.y / 2 <= 4);
    }
  }
  assert.equal(parts.filter(part => part.shape === 'box' && part.size.x === reveal && part.size.z === reveal).length, 4);
  const opening: FacadeOpening = { position: terminationPoint(plan, 0, 0, 11), yaw: site.building.rotationY,
    faceWidth: 15, height: 4, depth: .8 };
  assert.ok(parts.some(part => exteriorPartMeetsOpening(part, opening)), 'known crossing termination');
  for (const kept of districtExteriorSites(plan, [opening])) assert.ok(kept.parts.every(part => !exteriorPartMeetsOpening(part, opening)));
  assert.ok(districtExteriorSites(plan, [], new Set([0])).every(kept => kept.parts.every(part => part.shape === 'cover')));
  assert.deepEqual(districtExteriorSites({ ...plan, solids: [] }), []);
  const enclosing = { ...plan.solids![0], halfExtents: { ...plan.solids![0].halfExtents, x: 7.6 } };
  assert.deepEqual(districtExteriorSites({ ...plan, solids: [enclosing] }), []);
});
