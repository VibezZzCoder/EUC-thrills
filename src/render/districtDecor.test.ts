/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import type { Vec3, SurfaceId } from '../simulation/world.ts';
import { residentialGroundPatches, residentialDoorOffset, type DistrictSite,
  type ResidentialRoomSite } from '../level/districtSites.ts';
import { createDistrictDecor, withDistrictDecorCost, EMPTY_DISTRICT_DECOR_REPORT,
  type DistrictDecor, type DistrictDecorReport } from './districtDecor.ts';
import { selectPresentation } from './presentation.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';

/** Independent source worlds: original metric bodies, original straight street,
 * and a source field with grass away from the road. No selector builds fixtures. */
function fixture(options: { angle?: number; quarter?: number;
  kinds?: readonly ('residential' | 'clockTower')[];
  height?: (x: number, z: number) => number } = {}): LevelPlan {
  const angle = options.angle ?? 0, quarter = options.quarter ?? 0;
  const kinds = options.kinds ?? ['residential', 'clockTower'];
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + s * point.z,
    y: point.y, z: -s * point.x + c * point.z });
  const surfaces: SurfaceId[] = [];
  for (let row = 0; row < 160; row++) for (let column = 0; column < 160; column++) {
    const x = -80 + column + 0.5, z = -80 + row + 0.5;
    const localZ = s * x + c * z;
    surfaces.push(localZ >= 48 && localZ <= 56 ? 'pavement' : 'grass');
  }
  const props: Prop[] = kinds.map((look, index) => ({ kind: 'building', look,
    scale: 1, position: rotate({ x: kinds.length === 1 ? 0 : index === 0 ? -22 : 22, y: 0, z: 25 }),
    rotationY: angle + quarter * Math.PI / 2,
    size: look === 'clockTower' ? { x: 7, y: 24, z: 7 } : { x: 12, y: 6, z: 10 } }));
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 52 }),
    headingY: Math.PI / 2 + angle, surface: 'pavement' as const, halfWidth: 4, gradient: 0 });
  return { id: 'district-render-original-fixture',
    spawn: { position: rotate({ x: 0, y: 0, z: 52 }), headingY: angle },
    heightfield: { originX: -80, originZ: -80, spacing: 1, columns: 161, rows: 161,
      heights: Array.from({ length: 161 * 161 }, (_, index) =>
        options.height?.(-80 + index % 161, -80 + Math.floor(index / 161)) ?? 0), surfaces },
    surround: { surface: 'grass', height: 0 }, checkpoints: [],
    segments: [{ id: 'park-gate@render-fixture', entry: socket(-60), exit: socket(60), colliders: [] }],
    props, solids: props.map(prop => ({ centre: { ...prop.position, y: prop.position.y + prop.size!.y / 2 },
      halfExtents: { x: prop.size!.x / 2, y: prop.size!.y / 2, z: prop.size!.z / 2 },
      rotationY: prop.rotationY, surface: 'pavement' as const, occludes: true })) };
}

function siteGroup(decor: DistrictDecor, site: DistrictSite): THREE.Group {
  const group = decor.group.getObjectByName(`district-${site.id}`);
  assert.ok(group instanceof THREE.Group);
  return group;
}

/** Every emitted vertex uses every real object transform before entering the
 * exact ORIGINAL collider frame. No guessed frontage box substitutes for it. */
function minimumProtection(decor: DistrictDecor): number {
  decor.group.updateMatrixWorld(true);
  let minimum = Infinity, count = 0;
  const point = new THREE.Vector3();
  for (const site of decor.sites) {
    const body = site.body;
    const inverseBody = new THREE.Matrix4().makeRotationY(body.rotationY)
      .setPosition(body.centre.x, body.centre.y, body.centre.z).invert();
    siteGroup(decor, site).traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld).applyMatrix4(inverseBody);
        minimum = Math.min(minimum, body.halfExtents.x - Math.abs(point.x),
          body.halfExtents.y - Math.abs(point.y), body.halfExtents.z - Math.abs(point.z));
        count++;
      }
    });
  }
  assert.ok(count > 0, 'protection must inspect actual nonempty geometry');
  return minimum;
}

/** Return actual first opaque triangle depth in the selected site's own frame. */
function firstDepth(decor: DistrictDecor, site: DistrictSite, x: number, y: number,
  dx = 0, dy = 0): number | undefined {
  decor.group.updateMatrixWorld(true);
  const group = siteGroup(decor, site);
  // x/y identify the crossed facade plane, not the eye 30 cm in front of it.
  const origin = new THREE.Vector3(x - dx * 0.30, y - dy * 0.30, 0.30)
    .applyMatrix4(group.matrixWorld);
  const direction = new THREE.Vector3(dx, dy, -1).normalize().transformDirection(group.matrixWorld);
  const hits = new THREE.Raycaster(origin, direction, 0,
    (site.kind === 'residential-domestic-room' ? site.roomDepth : site.caseDepth) + 1)
    .intersectObject(group, true).filter(hit => !(hit.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.transparent);
  if (hits.length === 0) return undefined;
  return -hits[0].point.clone().applyMatrix4(group.matrixWorld.clone().invert()).z;
}

/** Sampling includes the shader mask's widened side edge. A backing and its
 * end returns must cover it from both principal and grazing directions. */
function coveredOpening(decor: DistrictDecor, site: DistrictSite): boolean {
  for (const [dx, dy] of [[0, 0], [0.24, 0.06], [-0.24, -0.06]] as const) {
    for (let column = 0; column <= 12; column++) for (let row = 0; row <= 8; row++) {
      const x = (-site.faceWidth / 2 - 0.015)
        + column / 12 * (site.faceWidth + 0.030);
      const y = 0.006 + row / 8 * (site.height - 0.012);
      if (firstDepth(decor, site, x, y, dx, dy) === undefined) return false;
    }
  }
  return true;
}

function deepDomesticWindow(decor: DistrictDecor, site: DistrictSite): boolean {
  const depth = firstDepth(decor, site, 0.30, 1.94);
  return depth !== undefined && depth > 2.8;
}

function assertResources(decor: DistrictDecor, report: DistrictDecorReport = decor.report()): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let calls = 0, triangles = 0, bytes = 0;
  decor.group.traverse(object => {
    assert.ok(!(object instanceof THREE.Light), 'the decor adds no light');
    assert.ok(!(object instanceof THREE.InstancedMesh), 'static merged decor owns no instance buffer');
    if (!(object instanceof THREE.Mesh)) return;
    calls++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    geometries.add(object.geometry);
    assert.equal(object.geometry.groups.length, 0, 'one opaque material draw per merged mesh');
    assert.equal(object.castShadow, false);
    assert.equal(object.receiveShadow, false);
    assert.ok(object.material instanceof THREE.MeshStandardMaterial);
    const material = object.material;
    materials.add(material);
    assert.equal(material.transparent, material.name === 'district-glazing');
    assert.equal(material.opacity, material.name === 'district-glazing' ? 0.12 : 1);
    if (material.transparent) assert.equal(material.depthWrite, false);
    assert.equal(material.vertexColors, true);
    assert.equal(material.map, null);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(material.alphaMap, null);
    assert.equal(material.normalMap, null);
    assert.equal(material.envMap, null);
  });
  for (const geometry of geometries) {
    bytes += geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) {
      bytes += attribute.array.byteLength;
      for (const value of attribute.array) assert.ok(Number.isFinite(value), 'finite actual attribute');
    }
    const count = geometry.getAttribute('position').count;
    if (geometry.index) for (const index of geometry.index.array) assert.ok(index >= 0 && index < count);
  }
  assert.equal(report.drawCalls, calls);
  assert.equal(report.colourTriangles, triangles);
  assert.equal(report.geometryBytes, bytes);
  assert.equal(report.materialOwners, materials.size);
  assert.equal(report.textureBytes + report.instanceBytes + report.shadowDrawCalls + report.people, 0);
  assert.equal(report.motion, 'none');
  assert.ok(calls <= 9 && materials.size <= 5, 'bounded, shared finish ownership');
  assert.ok(triangles <= 12_000, 'bounded actual supplement, including route schematic');
}

test('actual domestic and case vertices stay behind their exact original bodies under every face quarter turn', () => {
  for (const angle of [0, 0.71]) for (const quarter of [0, 1, 2, 3]) {
    const plan = fixture({ angle, quarter }), before = JSON.stringify(plan), decor = createDistrictDecor(plan);
    assert.equal(decor.sites.length, 2);
    assert.equal(decor.report().residentialRooms, 1);
    assert.equal(decor.report().parkCases, 1);
    assert.ok(minimumProtection(decor) >= -0.00002);
    for (const site of decor.sites) {
      assert.ok(plan.props!.includes(site.building));
      assert.ok(plan.solids!.includes(site.body));
      const group = siteGroup(decor, site), inverse = group.matrixWorld.clone().invert();
      const point = new THREE.Vector3();
      let maximumFront = -Infinity;
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          point.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
          maximumFront = Math.max(maximumFront, point.z);
        }
      });
      assert.ok(maximumFront <= -0.04 + 0.00002, 'no exterior plate, lip or low unreachable-solid mismatch');
    }
    assert.equal(JSON.stringify(plan), before, 'the complete original source world is untouched');
    decor.dispose();
  }
  const decor = createDistrictDecor(fixture({ angle: 0.71, quarter: 1 }));
  // Apply a real child-mesh transform; a frontage-only or raw-local vertex test
  // would miss this escaped geometry and still pass.
  const escaped = siteGroup(decor, decor.sites[0]).children[0];
  escaped.position.z += 4;
  assert.ok(minimumProtection(decor) < -0.05, 'protection accepts the known-bad actual mesh transform');
  decor.dispose();
});

test('localized masks have solid depth and continuous returns instead of empty cutouts or exterior rectangles', () => {
  for (const quarter of [0, 1, 2, 3]) {
    const plan = fixture({ angle: 0.71, quarter }), decor = createDistrictDecor(plan);
    assert.deepEqual(decor.openings, decor.sites.map(site => ({ position: site.position,
      yaw: site.yaw, faceWidth: site.faceWidth, height: site.height, depth: site.depth })));
    for (const site of decor.sites) assert.ok(coveredOpening(decor, site), `${site.kind}: masked face has a gap`);
    const house = decor.sites.find(site => site.kind === 'residential-domestic-room')!;
    assert.equal(house.faceWidth, 6, 'the untouched remainder of the original house face is retained');
    const doorDepth = firstDepth(decor, house, residentialDoorOffset(house as ResidentialRoomSite), 1.38);
    const sofaDepth = firstDepth(decor, house, 0.25, 1.01);
    assert.ok(deepDomesticWindow(decor, house), 'a clear window lane must reveal the deep room');
    assert.ok(doorDepth !== undefined && doorDepth >= 0.75 && doorDepth <= 0.92, 'a closed, deeply recessed door');
    assert.ok(sofaDepth !== undefined && sofaDepth > 1.5 && sofaDepth < 2.7,
      'substantial adult-size furnishings occupy a separate indoor depth layer');
    const park = decor.sites.find(site => site.kind === 'park-closed-map-case')!;
    assert.equal(park.position.y - park.building.position.y, 1);
    assert.equal(park.faceWidth, 2.1);
    assert.equal(park.height, 1.4);
    const mapDepth = firstDepth(decor, park, 0.60, 0.91);
    assert.ok(mapDepth !== undefined && mapDepth >= 0.30 && mapDepth < 0.60,
      'the map has a backed localized case, not a room or a doorway');
    assert.equal(decor.report().mapRouteSegments, 1, 'the fixture has one real source street');
    assert.equal(decor.report().mapSourceSegments, 1);
    assert.equal(decor.report().mapOmittedSegments, 0);
    decor.dispose();
  }
  const decor = createDistrictDecor(fixture({ kinds: ['residential'] }));
  const site = decor.sites[0], group = siteGroup(decor, site);
  const masonry = group.children.find(object => object.name.endsWith('-masonry'))!;
  group.remove(masonry);
  assert.equal(coveredOpening(decor, site), false, 'coverage predicate accepts missing actual shell and backing');
  group.add(masonry);
  const exterior = new THREE.Mesh(new THREE.BoxGeometry(3.10, 1.70, 0.04),
    new THREE.MeshStandardMaterial());
  exterior.position.set(0.80, 1.60, -0.10);
  group.add(exterior);
  assert.equal(deepDomesticWindow(decor, site), false,
    'depth predicate accepts a known-bad flat plate over the window');
  group.remove(exterior); exterior.geometry.dispose();
  (exterior.material as THREE.Material).dispose();
  decor.dispose();
});

test('the actual opaque indoor floor clears the highest admitted original source terrain', () => {
  const plan = fixture({ kinds: ['residential'], height: (_x, z) =>
    Math.max(0, Math.min(0.15, 0.075 * (z - 25))) });
  const before = JSON.stringify(plan), decor = createDistrictDecor(plan);
  assert.equal(decor.sites.length, 1, 'the source slope and +15 cm high floor are admitted');
  const site = decor.sites[0], group = siteGroup(decor, site);
  const minimumClearance = (): number => {
    decor.group.updateMatrixWorld(true);
    let minimum = Infinity;
    for (const x of [-1.04, -0.90]) for (const z of [-0.80, -1.60, -2.75]) {
      const groundPoint = new THREE.Vector3(x, 0, z).applyMatrix4(group.matrixWorld);
      const originalHeight = fieldHeightAt(plan.heightfield, plan.surround, groundPoint.x, groundPoint.z);
      const origin = new THREE.Vector3(x, 2.8, z).applyMatrix4(group.matrixWorld);
      const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 4).intersectObject(group, true)[0];
      assert.ok(hit, 'actual clear-floor ray must hit the opaque floor');
      minimum = Math.min(minimum, hit.point.y - originalHeight);
    }
    return minimum;
  };
  assert.ok(minimumClearance() >= 0.01999, 'original source ground must not protrude through the floor');
  const masonry = group.children.find(object => object.name.endsWith('-masonry'))!;
  masonry.position.y -= 0.06;
  assert.ok(minimumClearance() < 0.01999, 'floor-clearance predicate rejects the known-bad old floor elevation');
  masonry.position.y += 0.06;
  assert.ok(minimumClearance() >= 0.01999);
  assert.equal(JSON.stringify(plan), before, 'floor clearance never repairs the original terrain');
  decor.dispose();
});

test('the closed door agrees with the one narrow source strip and map case creates no public access', () => {
  const plan = fixture({ angle: 0.71, quarter: 1 }), before = JSON.stringify(plan);
  const decor = createDistrictDecor(plan);
  const house = decor.sites.find((site): site is ResidentialRoomSite => site.kind === 'residential-domestic-room')!;
  const patches = residentialGroundPatches(plan, house);
  assert.ok(patches.length > 0);
  const footprint = patches[0].footprint!;
  assert.equal(footprint.width, 1.5);
  assert.equal(new Set(patches.map(patch => patch.footprint!.id)).size, 1);
  // updateMatrixWorld includes the selected face's quarter turn, not just the
  // original prop yaw. Ground and rendered closed door name the same point.
  decor.group.updateMatrixWorld(true);
  const origin = new THREE.Vector3(residentialDoorOffset(house), 0, 0)
    .applyMatrix4(siteGroup(decor, house).matrixWorld);
  assert.ok(origin.distanceTo(new THREE.Vector3(footprint.origin.x, footprint.origin.y, footprint.origin.z)) < 1e-8);
  assert.equal(house.closedDoor, true);
  const park = decor.sites.find(site => site.kind === 'park-closed-map-case')!;
  assert.equal(park.publicEntrance, false);
  assert.equal(decor.report().people, 0);
  assert.equal(JSON.stringify(plan), before);
  decor.dispose();
});

test('all actual shared meshes and owners are counted and priced once per view', () => {
  const plan = fixture(), decor = createDistrictDecor(plan);
  assertResources(decor);
  const report = decor.report();
  assert.ok(report.colourTriangles > 700 && report.geometryBytes > 10_000,
    'a nonempty architectural room and map case must be measured');
  const original = selectPresentation(plan).cost, added = withDistrictDecorCost(original, report);
  for (const [shape, views] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
    assert.equal(added.frame[shape].drawCalls - original.frame[shape].drawCalls, report.drawCalls * views);
    assert.equal(added.frame[shape].triangles - original.frame[shape].triangles, report.colourTriangles * views);
  }
  assert.equal(added.shadowTriangles, original.shadowTriangles);
  assert.equal(added.triangles - original.triangles, report.colourTriangles);
  assert.throws(() => assertResources(decor, { ...report, geometryBytes: report.geometryBytes + 4 }),
    'resource predicate accepts a known-bad missed/duplicated owner');
  const mesh = siteGroup(decor, decor.sites[0]).children[0] as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.transparent = true;
  assert.throws(() => assertResources(decor), 'opaque predicate accepts an unpriced transparent draw');
  material.transparent = false;
  decor.dispose();
});

test('clock and pane reuse allocate no new resources or mutate static geometry', () => {
  const decor = createDistrictDecor(fixture());
  const meshes: THREE.Mesh[] = [];
  decor.group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const geometry = meshes.map(mesh => mesh.geometry), material = meshes.map(mesh => mesh.material);
  const positions = meshes.map(mesh => mesh.geometry.getAttribute('position'));
  const values = positions.map(attribute => Array.from(attribute.array));
  const report = decor.report();
  for (const time of [0, 1.7, 1.7, 120, Number.NaN]) {
    decor.update(time, false); decor.update(time, true);
  }
  assert.deepEqual(meshes.map(mesh => mesh.geometry), geometry);
  assert.deepEqual(meshes.map(mesh => mesh.material), material);
  assert.deepEqual(meshes.map(mesh => mesh.geometry.getAttribute('position')), positions);
  assert.deepEqual(positions.map(attribute => Array.from(attribute.array)), values);
  assert.equal(decor.report(), report);
  decor.dispose(); decor.update(121, false);
});

test('each unique geometry/material disposes once across rebuilds; unsuitable source worlds own nothing', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 3; generation++) {
    const decor = createDistrictDecor(fixture());
    scene.add(decor.group);
    const owners = new Map<THREE.BufferGeometry | THREE.Material, number>();
    decor.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const owner of [object.geometry, object.material as THREE.Material]) {
        if (owners.has(owner)) continue;
        owners.set(owner, 0);
        owner.addEventListener('dispose', () => owners.set(owner, owners.get(owner)! + 1));
      }
    });
    decor.dispose(); decor.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(decor.group.children.length, 0);
    for (const count of owners.values()) assert.equal(count, 1);
  }
  for (const plan of [fixture({ kinds: [] }), { ...fixture(), solids: [] },
    { ...fixture(), props: fixture().props!.map(prop => ({ ...prop, look: 'commercial' as const })) }]) {
    const decor = createDistrictDecor(plan);
    assert.deepEqual(decor.sites, []);
    assert.deepEqual(decor.openings, []);
    assert.equal(decor.group.children.length, 0);
    assert.deepEqual(decor.report(), EMPTY_DISTRICT_DECOR_REPORT);
    decor.dispose();
  }
});

test('route schematic remains bounded and deterministic without generated pixels or text', () => {
  const plan = fixture({ kinds: ['clockTower'] });
  // Source streets with unlike extents. Map geometry must respond to a
  // different original street instead of displaying one ornamental icon.
  const original = createDistrictDecor(plan), repeated = createDistrictDecor(plan);
  const arrays = (decor: DistrictDecor) => {
    const value: number[][] = [];
    decor.group.traverse(object => {
      if (object instanceof THREE.Mesh) value.push(Array.from(object.geometry.getAttribute('position').array));
    });
    return value;
  };
  assert.deepEqual(arrays(original), arrays(repeated));
  const changed = createDistrictDecor({ ...plan, segments: [...plan.segments, {
    id: 'park-route-schematic-branch', colliders: [],
    entry: { ...plan.segments[0].entry, position: { x: -45, y: 0, z: 52 } },
    exit: { ...plan.segments[0].exit, position: { x: -45, y: 0, z: 65 } },
  }] });
  assert.equal(changed.sites.length, 1);
  assert.equal(changed.report().mapRouteSegments, 2);
  assert.notDeepEqual(arrays(changed), arrays(original), 'the actual source route controls the schematic');
  assertResources(changed);
  original.dispose(); repeated.dispose(); changed.dispose();
});

test('dense maps retain bounded faithful source chords, prioritize loop arms and never invent connections', () => {
  const original = fixture({ kinds: ['clockTower'] });
  const chord = (id: string, z: number) => ({ id, colliders: [],
    entry: { ...original.segments[0].entry, position: { x: -40, y: 0, z } },
    exit: { ...original.segments[0].exit, position: { x: 40, y: 0, z } } });
  const plan: LevelPlan = { ...original, segments: [...original.segments,
    ...Array.from({ length: 300 }, (_, index) => chord(`dense-near-${index}`, 45 + index / 100)),
    chord('dense-main-far', 70), chord('dense-alternate-far', 40)],
    streetLoops: [{ main: ['dense-main-far'], alternate: ['dense-alternate-far'] }] };
  const before = JSON.stringify(plan), decor = createDistrictDecor(plan), repeat = createDistrictDecor(plan);
  assert.equal(decor.sites.length, 1);
  assert.equal(decor.report().mapRouteSegments, 128, 'a dense valid source map must remain populated and bounded');
  assert.equal(decor.report().mapSourceSegments, 303);
  assert.equal(decor.report().mapOmittedSegments, 175, 'report the sparse display limitation');
  assertResources(decor);
  const group = siteGroup(decor, decor.sites[0]);
  const green = new THREE.Color(0x69796d);
  // The independent fixture bounds are x=−60..60, z=40..70. No production
  // selection/projection helper supplies expected source lines to this check.
  const scale = 1.56 / 120;
  const source = plan.segments.map(segment => [segment.entry.position, segment.exit.position]
    .map(point => ({ x: point.x * scale, y: 0.70 - (point.z - 55) * scale })));
  const pointDistance = (point: THREE.Vector3, a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
  };
  const actualMap = (value: DistrictDecor): THREE.Vector3[] => {
    value.group.updateMatrixWorld(true);
    const local = siteGroup(value, value.sites[0]), inverse = local.matrixWorld.clone().invert();
    const checked: THREE.Vector3[] = [];
    local.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position'), colours = object.geometry.getAttribute('color');
      const indices = object.geometry.index!;
      for (let offset = 0; offset < indices.count; offset += 3) {
        const vertices = [indices.getX(offset), indices.getX(offset + 1), indices.getX(offset + 2)];
        if (!vertices.every(vertex => Math.abs(colours.getX(vertex) - green.r) < 1e-6
          && Math.abs(colours.getY(vertex) - green.g) < 1e-6 && Math.abs(colours.getZ(vertex) - green.b) < 1e-6)) continue;
        const points = vertices.map(vertex => new THREE.Vector3().fromBufferAttribute(positions, vertex)
          .applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
        if (points.every(point => point.x > 0.69 && point.y > 0.92)) continue; // separate compass graphic
        points.push(points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3));
        for (const point of points) assert.ok(source.some(([a, b]) => pointDistance(point, a, b) <= 0.024),
          'every actual stroke triangle and its interior must stay on an original source chord');
        checked.push(...points);
      }
    });
    assert.ok(checked.length > 1000, 'inspect actual populated map triangles');
    return checked;
  };
  const strokes = actualMap(decor);
  assert.ok(strokes.some(point => Math.abs(point.y - (0.70 - 15 * scale)) < 0.024),
    'far main-loop chord outranks closer unlisted originals');
  assert.ok(strokes.some(point => Math.abs(point.y - (0.70 + 15 * scale)) < 0.024),
    'far alternate chord outranks closer unlisted originals');
  assert.deepEqual(strokes.map(point => point.toArray()), actualMap(repeat).map(point => point.toArray()));
  const fakeGeometry = new THREE.BufferGeometry();
  fakeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.70, 0.70 - 15 * scale, -0.414, 0.70, 0.70 + 15 * scale, -0.414,
    -0.68, 0.70 - 15 * scale + 0.02, -0.414,
  ], 3));
  fakeGeometry.setAttribute('color', new THREE.Float32BufferAttribute([
    ...green.toArray(), ...green.toArray(), ...green.toArray(),
  ], 3));
  fakeGeometry.setIndex([0, 1, 2]); fakeGeometry.computeVertexNormals();
  const fakeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });
  const fake = new THREE.Mesh(fakeGeometry, fakeMaterial);
  group.add(fake);
  assert.throws(() => actualMap(decor), 'source-chord predicate accepts an invented diagonal connection');
  group.remove(fake); fakeGeometry.dispose(); fakeMaterial.dispose();
  assert.equal(JSON.stringify(plan), before);
  decor.dispose(); repeat.dispose();
});
