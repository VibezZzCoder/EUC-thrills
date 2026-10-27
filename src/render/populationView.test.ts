/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Focused population view geometry, grounding and lifecycle contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { ActorKind, ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import { createPopulationView, pedestrianStatureMetres, PEDESTRIAN_FIGURE, POPULATION_NEAR_CAMERA,
  unionInstanceSpheres, type InstanceSphereSlot, type PopulationRenderPose, type PopulationRenderSnapshot } from './populationView.ts';
import { physicalPopulationHull } from '../shared/populationHull.ts';
import { populationSupportTargets, POPULATION_MODEL } from '../shared/populationSupport.ts';
import { staticCasterBounds } from './ultra/ultraFarShadow.ts';
import { WHEEL, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { collectLostContextHoldings } from './contextLoss.ts';
import { countPopulation } from './populationPrice.ts';
import { assignVehicleBodies, VEHICLE_BODY_HEIGHT, type PopulationVehicleBody } from './populationVehicles.ts';

function spec(kind: ActorKind, id: string = kind, appearanceIndex = 0): ActorSpec {
  const vehicle = kind.endsWith('Vehicle');
  return { id, kind, pathId: 'path', initialDistanceMetres: 0, direction: 1,
    movement: kind === 'social' || kind === 'parkedVehicle' ? 'stationary' : 'loop',
    speedMetresPerSecond: kind === 'jogger' ? 2.6 : vehicle ? 3 : 1.1,
    idleSeconds: 3, appearanceIndex,
    hull: { halfWidthMetres: vehicle ? 1.02 : kind === 'fictionalEuc' ? 0.65 : 0.42,
      halfLengthMetres: vehicle ? 2.4 : kind === 'fictionalEuc' ? 0.65 : 0.42,
      heightMetres: vehicle ? 2.8 : 1.9 } };
}
function plan(actors: ActorSpec[]): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'fixture', installedWorldId: 'fixture~living-r1',
    contentDigest: 'fixture', paths: [], anchors: [], actors,
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function pose(actor: ActorSpec, extra: Partial<PopulationRenderPose> = {}): PopulationRenderPose {
  const value: PopulationRenderPose = { id: actor.id, kind: actor.kind, x: 0, y: 0, z: 0, headingY: 0,
    speedMetresPerSecond: actor.speedMetresPerSecond, gaitDistanceMetres: 0, wheelTravelMetres: 0,
    activity: actor.kind === 'social' ? 'social' : actor.kind === 'worker' ? 'working'
      : actor.kind === 'jogger' ? 'jogging' : actor.kind === 'fictionalEuc' ? 'riding'
        : actor.kind === 'walker' ? 'walking' : 'driving',
    activityPhase: 0.25, activityBlend: 1, backing: false,
    groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0, ...extra };
  const targets = populationSupportTargets({ ...actor, ...value,
    groundNormalX: value.groundNormalX!, groundNormalY: value.groundNormalY!, groundNormalZ: value.groundNormalZ! });
  const support = (target: { x: number; y: number; z: number; contact: string }) => ({
    x: target.x, y: target.contact === 'pedal' ? target.y : value.y
      - (value.groundNormalX! * (target.x - value.x) + value.groundNormalZ! * (target.z - value.z)) / value.groundNormalY!,
    z: target.z, normalX: value.groundNormalX!, normalY: value.groundNormalY!, normalZ: value.groundNormalZ!,
  });
  return { ...value,
    ...(targets.feet ? { footSupports: [support(targets.feet[0]), support(targets.feet[1])] as const } : {}),
    ...(targets.tyres ? { tyreSupports: targets.tyres.map(support) as unknown as NonNullable<PopulationRenderPose['tyreSupports']> } : {}),
    ...extra };
}
/** A one-vehicle roster whose id deals it this body (bodies follow the id hash). */
function vehicleWithBody(kind: ActorKind, body: PopulationVehicleBody): ActorSpec {
  for (let index = 0; index < 200; index += 1) {
    const candidate = spec(kind, `${kind}-${index}`, index);
    if (assignVehicleBodies([candidate]).get(candidate.id) === body) return candidate;
  }
  throw new Error(`no ${kind} id deals a ${body}`);
}
const BODIES: readonly PopulationVehicleBody[] = ['deliveryVan', 'minibus', 'boxTruck'];
function snapshot(actors: PopulationRenderPose[], tick = 0): PopulationRenderSnapshot {
  return { tick, clockSeconds: tick / 120, actors };
}
function matrices(group: THREE.Group): number[][] {
  return group.children.map(object => Array.from((object as THREE.InstancedMesh).instanceMatrix.array));
}

test('the hair owns the visible crown from all azimuths instead of exposing skull facets', () => {
  const actor = spec('walker'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([pose(actor, { speedMetresPerSecond: 0, activity: 'waiting' })]));
    const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
    const hair = view.group.getObjectByName('human-hair-hair') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); head.getMatrixAt(0, matrix);
    const ray = new THREE.Raycaster();
    for (const y of [0.205, 0.235, 0.255, 0.268]) for (let angle = 0; angle < 36; angle++) {
      const u = angle * Math.PI / 18, target = new THREE.Vector3(0, y, 0).applyMatrix4(matrix);
      const origin = new THREE.Vector3(Math.cos(u), y, Math.sin(u)).applyMatrix4(matrix);
      ray.set(origin, target.sub(origin).normalize());
      const hits = ray.intersectObjects([head, hair]);
      assert.ok(hits.length > 0); assert.strictEqual(hits[0].object, hair, `exposed scalp at ${y}/${angle}`);
    }
  } finally { view.dispose(); }
});

test('pane selection retains off-camera shadow casters, restores full counts, and follows moved actors', () => {
  const actors = [spec('walker', 'near', 0), spec('walker', 'shadow', 1), spec('walker', 'away', 2)];
  const view = createPopulationView(plan(actors));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30);
  camera.position.set(0, 1, 5); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const shadow = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
  shadow.position.set(100, 5, 5); shadow.lookAt(100, 1, 0); shadow.updateMatrixWorld();
  const values = () => actors.map((a, i) => pose(a, { x: i * 100 }));
  try {
    view.apply(snapshot(values()));
    const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
    view.prepareView(camera); assert.equal(head.count, 1); view.restoreView(); assert.equal(head.count, 3);
    view.prepareView(camera, shadow); assert.equal(head.count, 2, 'shadow actor remains despite being off-camera');
    view.restoreView(); assert.equal(head.count, 3);
    const moved = values(); moved[2] = pose(actors[2], { x: 1 });
    view.apply(snapshot(moved, 1)); view.prepareView(camera); assert.equal(head.count, 2);
    const m = new THREE.Matrix4(), xs: number[] = [];
    for (let i = 0; i < head.count; i++) { head.getMatrixAt(i, m); xs.push(m.elements[12]); }
    assert.deepEqual(xs.sort(), [0, 1], 'writers followed their slots after previous pane swaps');
    view.restoreView();
  } finally { view.dispose(); }
});

/** Run one mesh's colour-pass hooks the way three does around its draw; returns the count it drew. */
function colourDraw(mesh: THREE.InstancedMesh, camera: THREE.Camera): number {
  const none = null as never;
  mesh.onBeforeRender(none, none, camera, mesh.geometry, mesh.material as THREE.Material, none);
  const drawn = mesh.count;
  mesh.onAfterRender(none, none, camera, mesh.geometry, mesh.material as THREE.Material, none);
  return drawn;
}
function drawnZs(mesh: THREE.InstancedMesh, count: number): number[] {
  const m = new THREE.Matrix4(), zs: number[] = [];
  for (let i = 0; i < count; i++) { mesh.getMatrixAt(i, m); zs.push(Math.round(m.elements[14])); }
  return zs.sort((a, b) => a - b);
}

test('the camera looks through a person at its lens: colour pass leaves them out, the shadow pass keeps them (2026-10-22)', () => {
  // The Quay roof critic: a spectator's head filled a quarter of the chase frame.
  const actors = [spec('social', 'lens', 0), spec('social', 'far', 1)];
  const view = createPopulationView(plan(actors));
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 100);
  const place = (z: number) => { camera.position.set(0.3, 1.95, z); camera.lookAt(0, 1.2, 12); camera.updateMatrixWorld(); };
  const shadow = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  shadow.up.set(0, 0, 1); shadow.position.set(0, 40, 0); shadow.lookAt(0, 0, 0); shadow.updateMatrixWorld();
  try {
    view.apply(snapshot([pose(actors[0]), pose(actors[1], { z: 8 })]));
    const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
    place(-0.6); // 0.67 m from the near person's centre line, at head height
    view.prepareView(camera, shadow);
    assert.equal(head.count, 2, 'the sun\'s pass, rendered first, still draws both casters');
    assert.equal(colourDraw(head, camera), 1, 'this pane\'s colour pass stops short of the person at the lens');
    assert.deepEqual(drawnZs(head, 1), [8], 'and what it draws is the person further off');
    assert.equal(head.count, 2, 'the after-hook restores the caster prefix');
    assert.equal(colourDraw(head, shadow), 2, 'another camera (a shadow rig, a far map) is left alone');
    view.restoreView(); assert.equal(head.count, 2);
    assert.equal(colourDraw(head, camera), 2, 'restored, the hooks are inert');
    // Without a sun pass (the Low tier) the colour pass still leaves them out.
    view.prepareView(camera); assert.equal(colourDraw(head, camera), 1); view.restoreView();
    // Hysteresis: inside the show distance the person stays out; past it they return; then hide only inside the hide distance.
    const between = (POPULATION_NEAR_CAMERA.personHideMetres + POPULATION_NEAR_CAMERA.personShowMetres) / 2;
    place(-Math.sqrt(between ** 2 - 0.09));
    view.prepareView(camera, shadow); assert.equal(colourDraw(head, camera), 1, 'still looked through between the two distances'); view.restoreView();
    place(-Math.sqrt((POPULATION_NEAR_CAMERA.personShowMetres + 0.05) ** 2 - 0.09));
    view.prepareView(camera, shadow); assert.equal(colourDraw(head, camera), 2, 'drawn again past the show distance'); view.restoreView();
    place(-Math.sqrt(between ** 2 - 0.09));
    view.prepareView(camera, shadow); assert.equal(colourDraw(head, camera), 2, 'and not hidden again until inside the hide distance'); view.restoreView();
    // Each pane camera keeps its own memory.
    const other = camera.clone(); other.position.set(0.3, 1.95, -0.6); other.updateMatrixWorld();
    view.prepareView(other, shadow); assert.equal(colourDraw(head, other), 1); view.restoreView();
    // A camera standing over a person's head measures to the crown, not the feet.
    camera.position.set(0, pedestrianStatureMetres('lens') + 1.0, 0); camera.lookAt(0, 0, 12); camera.updateMatrixWorld();
    view.prepareView(camera, shadow); assert.equal(colourDraw(head, camera), 1); view.restoreView();
  } finally { view.dispose(); }
});

test('a vehicle is looked through only while the camera is inside or touching its drawn body', () => {
  const van = vehicleWithBody('parkedVehicle', 'deliveryVan');
  const view = createPopulationView(plan([van]));
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 100);
  try {
    view.apply(snapshot([pose(van, { speedMetresPerSecond: 0 })]));
    const meshes = view.group.children as THREE.InstancedMesh[];
    const drawn = () => meshes.reduce((sum, mesh) => sum + colourDraw(mesh, camera), 0);
    const at = (x: number, y: number, z: number) => {
      camera.position.set(x, y, z); camera.lookAt(x, 1.2, z + 10); camera.updateMatrixWorld();
      view.prepareView(camera); const parts = drawn(); view.restoreView(); return parts;
    };
    const whole = at(0, 1.95, -10);
    assert.ok(whole > 0);
    assert.equal(at(0.5, 1.95, -1), 0, 'inside the body: nothing of the van is drawn');
    assert.equal(at(1.02 + 0.1, 1.95, 1), 0, 'touching its side');
    assert.equal(at(1.02 + 0.6, 1.95, 1), whole, 'close beside it is a fair view: the whole van stays');
    assert.equal(at(0.5, VEHICLE_BODY_HEIGHT.deliveryVan + 0.6, 0), whole, 'above its own roof it stays too');
  } finally { view.dispose(); }
});

test('the drawn stature helper matches the figure the view draws', () => {
  for (const id of ['a', 'b', 'quay-group-roof-final-turn-0', 'walker-7']) {
    const stature = pedestrianStatureMetres(id);
    assert.ok(Math.abs(stature / PEDESTRIAN_FIGURE.meanHeightMetres - 1) <= PEDESTRIAN_FIGURE.heightSpread + 1e-9, id);
  }
  const actor = spec('walker', 'walker-7'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([pose(actor, { speedMetresPerSecond: 0, activity: 'waiting' })]));
    const top = meshBounds(view.group).max.y;
    assert.ok(Math.abs(top - pedestrianStatureMetres('walker-7')) < 0.04, `drawn crown ${top.toFixed(3)} vs ${pedestrianStatureMetres('walker-7').toFixed(3)}`);
  } finally { view.dispose(); }
});

test('the basic mouth line is outside the jaw through head poses, with the buried old placement as control', () => {
  for (const kind of ['walker', 'jogger', 'social', 'worker', 'fictionalEuc'] as const) {
    const actor = spec(kind), roster = plan([actor]), view = createPopulationView(roster);
    try {
      const actual = view.report(), priced = countPopulation(roster);
      assert.equal(actual.colourTriangles, priced.colourTriangles);
      assert.equal(actual.drawCalls, priced.colourDraws);
      assert.equal(actual.instanceBytes, priced.instanceBytes);
      const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
      const mouth = view.group.getObjectByName('human-box-skin') as THREE.InstancedMesh;
      const headMatrix = new THREE.Matrix4(), mouthMatrix = new THREE.Matrix4(), ray = new THREE.Raycaster();
      for (const phase of [0.1, 0.4, 0.7]) {
        view.apply(snapshot([pose(actor, { activityPhase: phase })]));
        head.getMatrixAt(0, headMatrix);
        for (const x of [-0.020, 0, 0.020]) {
          const origin = new THREE.Vector3(x, 0.061, 1).applyMatrix4(headMatrix);
          const target = new THREE.Vector3(x, 0.061, 0).applyMatrix4(headMatrix);
          ray.set(origin, target.sub(origin).normalize());
          assert.strictEqual(ray.intersectObjects([head, mouth])[0]?.object, mouth, `${kind}/${phase}/${x}: visible lip`);
        }
      }
      mouth.getMatrixAt(0, mouthMatrix);
      const old = new THREE.Matrix4().copy(headMatrix).multiply(new THREE.Matrix4()
        .compose(new THREE.Vector3(0, 0.061, 0.086), new THREE.Quaternion(), new THREE.Vector3(0.059, 0.008, 0.012)));
      mouth.setMatrixAt(0, old); mouth.boundingSphere = null;
      const origin = new THREE.Vector3(0, 0.061, 1).applyMatrix4(headMatrix);
      ray.set(origin, new THREE.Vector3(0, 0.061, 0).applyMatrix4(headMatrix).sub(origin).normalize());
      assert.strictEqual(ray.intersectObjects([head, mouth])[0]?.object, head, 'old buried line is visibly rejected');
      mouth.setMatrixAt(0, mouthMatrix);
    } finally { view.dispose(); }
  }
});
function meshBounds(group: THREE.Group): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  group.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const vertices = object.geometry.getAttribute('position');
    for (let instance = 0; instance < object.count; instance += 1) {
      object.getMatrixAt(instance, matrix);
      for (let index = 0; index < vertices.count; index += 1) {
        point.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
        assert.ok([point.x, point.y, point.z].every(Number.isFinite), object.name);
        box.expandByPoint(point);
      }
    }
  });
  return box;
}

test('same species share geometry/material batches as the population grows', () => {
  const one = createPopulationView(plan([spec('walker')]));
  const many = createPopulationView(plan(Array.from({ length: 20 }, (_, i) => spec('walker', `walker-${i}`, i))));
  try {
    const a = one.report(), b = many.report();
    assert.equal(b.drawCalls, a.drawCalls);
    assert.equal(b.shadowDrawCalls, a.shadowDrawCalls);
    assert.equal(b.geometryOwners, a.geometryOwners);
    assert.equal(b.geometryBytes, a.geometryBytes);
    assert.equal(b.materialOwners, a.materialOwners);
    assert.equal(b.colourTriangles, a.colourTriangles * 20);
    assert.equal(a.textureBytes, 0);
    assert.equal(b.textureBytes, 0);
  } finally { one.dispose(); many.dispose(); }
});

// 2026-10-22: each body draws its own roof inside the shared 2.8 m hull (a
// high-roof delivery van 2.50 m, a minibus 2.42 m plus its roof rails, a box
// truck's box the full 2.8 m), while mirrors/hub caps and bumper plates still
// reach the hull's exact width and length so contact stays honest.
test('flat vehicle exterior exactly fits its original width and length, and each body its own roof', () => {
  for (const kind of ['parkedVehicle', 'serviceVehicle', 'trafficVehicle'] as const) for (const body of BODIES) {
    if (kind === 'serviceVehicle' && body === 'minibus') continue;
    const actor = vehicleWithBody(kind, body);
    const view = createPopulationView(plan([actor]));
    try {
      view.apply(snapshot([pose(actor)]));
      const bounds = meshBounds(view.group);
      const h = actor.hull, label = `${kind}/${body}`;
      assert.ok(bounds.min.x >= -h.halfWidthMetres - 1e-5 && bounds.max.x <= h.halfWidthMetres + 1e-5, label);
      assert.ok(bounds.min.z >= -h.halfLengthMetres - 1e-5 && bounds.max.z <= h.halfLengthMetres + 1e-5, label);
      assert.ok(bounds.min.y >= -1e-5 && bounds.max.y <= h.heightMetres + 1e-5, label);
      assert.ok(Math.abs(bounds.min.y) < 1e-5, `${label}: tyres touch ground`);
      const roof = body === 'boxTruck' ? h.heightMetres : VEHICLE_BODY_HEIGHT[body] + (body === 'minibus' ? 0.032 : 0);
      assert.ok(Math.abs(bounds.max.y - roof) < 1e-5, `${label}: roof ${bounds.max.y.toFixed(3)} m reaches its body height`);
      assert.ok(Math.abs(bounds.max.x - h.halfWidthMetres) < 1e-5, `${label}: mirrors reach the authored width`);
      assert.ok(Math.abs(bounds.max.z - h.halfLengthMetres) < 1e-5, `${label}: the front plate reaches the authored length`);
      assert.equal(view.report()[body === 'deliveryVan' ? 'cargoVans' : body === 'minibus' ? 'passengerVans' : 'boxTrucks'], 1);
    } finally { view.dispose(); }
  }
});

test('vehicle bodies are dealt from the ids: a mixed street, deterministic, priced exactly per body', () => {
  // Three to fifteen vehicles of every kind: every street of three or more shows all three shapes.
  for (const count of [3, 4, 8, 15]) {
    const actors = Array.from({ length: count }, (_, index) =>
      spec((['trafficVehicle', 'parkedVehicle', 'serviceVehicle'] as const)[index % 3], `street-${count}-${index}`, index));
    const first = assignVehicleBodies(actors), again = assignVehicleBodies([...actors].reverse());
    assert.deepEqual([...first].sort(), [...again].sort(), 'roster order never changes a body');
    const seen = new Set(first.values());
    for (const actor of actors) if (actor.kind === 'serviceVehicle') assert.notEqual(first.get(actor.id), 'minibus', 'a service vehicle works');
    assert.ok(seen.has('deliveryVan') && seen.has('boxTruck') && (seen.has('minibus') || count < 4), `${count}: ${[...seen]}`);
    const roster = plan(actors), view = createPopulationView(roster);
    try {
      const actual = view.report(), priced = countPopulation(roster);
      assert.equal(actual.colourTriangles, priced.colourTriangles); assert.equal(actual.drawCalls, priced.colourDraws);
      assert.equal(actual.shadowTriangles, priced.shadowTriangles); assert.equal(actual.shadowDrawCalls, priced.shadowDraws);
      assert.equal(actual.instanceBytes, priced.instanceBytes); assert.equal(actual.geometryBytes, priced.geometryBytes);
      assert.equal(actual.cargoVans + actual.passengerVans + actual.boxTrucks, count);
    } finally { view.dispose(); }
  }
  // Paint follows the id too: a street of vans is not one copied colour.
  const actors = Array.from({ length: 8 }, (_, index) => spec('trafficVehicle', `paint-${index}`, 0));
  const view = createPopulationView(plan(actors));
  try {
    const hull = view.group.getObjectByName('vehicle-hull-paint') as THREE.InstancedMesh, colour = new THREE.Color();
    const paints = new Set(actors.map((_, index) => { hull.getColorAt(index, colour); return colour.getHexString(); }));
    assert.ok(paints.size >= 4, `${paints.size} paints across eight vehicles`);
  } finally { view.dispose(); }
});

// M47: density extras continue the deal instead of re-dealing it, so adding
// the Medium and High layers never changes a living-r1 van's body, and a
// Medium extra keeps its body at High (the town itself: populationDensityRoster.test.ts).
test('density extras continue the base deal: base bodies unchanged, a Medium extra keeps its body at High', () => {
  const kinds = ['trafficVehicle', 'parkedVehicle', 'serviceVehicle'] as const;
  const base = [spec('walker', 'base-walker'), ...Array.from({ length: 5 }, (_, index) => spec(kinds[index % 3], `base-${index}`, index))];
  const extras = Array.from({ length: 8 }, (_, index) => spec(index === 2 ? 'walker' : 'trafficVehicle', `extra-${index}`, index));
  const before = assignVehicleBodies(base);
  assert.deepEqual([...assignVehicleBodies(base, extras)], [...before], 'a base roster is dealt exactly as before');
  // The control: the old deal over base and extras together re-ranks today's vans.
  const redealt = assignVehicleBodies([...base, ...extras]);
  assert.ok(base.some(actor => before.has(actor.id) && redealt.get(actor.id) !== before.get(actor.id)), 'the re-deal this replaces');
  const medium = assignVehicleBodies([...base, ...extras.slice(0, 4)], extras);
  const high = assignVehicleBodies([...base, ...extras], extras);
  for (const bodies of [medium, high]) for (const actor of base) assert.equal(bodies.get(actor.id), before.get(actor.id), actor.id);
  for (const actor of extras.slice(0, 4)) assert.equal(medium.get(actor.id), high.get(actor.id), `${actor.id} keeps its body`);
  assert.equal(high.get('extra-2'), undefined, 'a person is never dealt a body');
  assert.deepEqual([...assignVehicleBodies([...extras, ...base].reverse(), extras)].sort(), [...high].sort(), 'roster order never changes a body');
  // Extras take the cycle in turn after the base vehicles, so a street of three extras shows all three shapes.
  const cycle = ['deliveryVan', 'boxTruck', 'minibus'];
  const vehicles = extras.filter(actor => actor.kind === 'trafficVehicle');
  for (let index = 1; index < vehicles.length; index += 1) {
    assert.equal(cycle.indexOf(high.get(vehicles[index].id)!), (cycle.indexOf(high.get(vehicles[index - 1].id)!) + 1) % 3);
  }
  // The factory and the price read the plan's density alike.
  const roster: PopulationPlan = { ...plan([...base, ...extras]),
    density: { revision: 'living-r2', actors: extras.map(actor => ({ ...actor, layer: 'high' })), digest: 'fixture-density' } };
  const view = createPopulationView(roster);
  try {
    const actual = view.report(), priced = countPopulation(roster);
    assert.equal(actual.colourTriangles, priced.colourTriangles); assert.equal(actual.drawCalls, priced.colourDraws);
    assert.equal(actual.shadowTriangles, priced.shadowTriangles); assert.equal(actual.shadowDrawCalls, priced.shadowDraws);
    assert.equal(actual.instanceBytes, priced.instanceBytes); assert.equal(actual.geometryBytes, priced.geometryBytes);
    const dealt = [...high.values()];
    assert.equal(actual.cargoVans, dealt.filter(body => body === 'deliveryVan').length);
    assert.equal(actual.passengerVans, dealt.filter(body => body === 'minibus').length);
    assert.equal(actual.boxTrucks, dealt.filter(body => body === 'boxTruck').length);
  } finally { view.dispose(); }
});

// 2026-10-22: pedestrians were drawn 1.845 m tall on the 1.9 m hull; they are
// a natural 1.75 m on average now, each a little different, wheel riders unchanged.
test('pedestrians stand a natural adult height that varies per person, feet on the ground; wheel riders keep theirs', () => {
  const heights: number[] = [];
  for (const kind of ['walker', 'jogger', 'worker', 'social'] as const) for (let index = 0; index < 16; index += 1) {
    const actor = spec(kind, `${kind}-stature-${index}`, index), view = createPopulationView(plan([actor]));
    try {
      view.apply(snapshot([pose(actor, { activity: 'waiting', speedMetresPerSecond: 0 })]));
      const bounds = meshBounds(view.group);
      assert.ok(Math.abs(bounds.min.y) < 2e-5, `${actor.id}: soles on the ground (${bounds.min.y})`);
      heights.push(bounds.max.y);
      const again = createPopulationView(plan([actor]));
      try { again.apply(snapshot([pose(actor, { activity: 'waiting', speedMetresPerSecond: 0 })]));
        assert.deepEqual(matrices(again.group), matrices(view.group), 'stature follows the id'); } finally { again.dispose(); }
    } finally { view.dispose(); }
  }
  const mean = heights.reduce((sum, value) => sum + value, 0) / heights.length;
  assert.ok(Math.min(...heights) >= 1.68 && Math.max(...heights) <= 1.82, `${Math.min(...heights)}–${Math.max(...heights)}`);
  assert.ok(mean > 1.72 && mean < 1.78, `mean ${mean.toFixed(3)} m`);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.06, 'people differ');
  const rider = spec('fictionalEuc'), view = createPopulationView(plan([rider]));
  try {
    view.apply(snapshot([pose(rider, { speedMetresPerSecond: 0 })]));
    const top = meshBounds(view.group).max.y;
    assert.ok(Math.abs(top - 1.804) < 1e-3, `an NPC wheel rider is unchanged (${top.toFixed(4)} m)`);
  } finally { view.dispose(); }
});

test('closed candidate shape families have opposing welded edge twins', () => {
  const actors = [spec('walker'), spec('worker'), ...BODIES.map(body => vehicleWithBody('trafficVehicle', body))];
  const view = createPopulationView(plan(actors));
  try {
    for (const object of view.group.children) {
      const mesh = object as THREE.InstancedMesh;
      const geometry = mesh.geometry, points = geometry.getAttribute('position');
      const ids: string[] = Array.from({ length: points.count }, (_, i) =>
        [points.getX(i), points.getY(i), points.getZ(i)].map(value => Math.round(value * 1e7)).join(','));
      const indices = geometry.index ? Array.from(geometry.index.array) : ids.map((_, i) => i);
      const edges = new Map<string, number>();
      let volume = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [ids[indices[i]!]!, ids[indices[i + 1]!]!, ids[indices[i + 2]!]!];
        if (new Set(triangle).size < 3) continue; // sphere pole coincidence after welding
        const a = new THREE.Vector3().fromBufferAttribute(points, indices[i]!);
        const b = new THREE.Vector3().fromBufferAttribute(points, indices[i + 1]!);
        const c = new THREE.Vector3().fromBufferAttribute(points, indices[i + 2]!);
        volume += a.dot(b.cross(c)) / 6;
        for (let edge = 0; edge < 3; edge += 1) {
          const a = triangle[edge]!, b = triangle[(edge + 1) % 3]!;
          const key = `${a}>${b}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      for (const [key, count] of edges) {
        const [a, b] = key.split('>');
        assert.equal(count, 1, `${mesh.name} duplicated directed edge`);
        assert.equal(edges.get(`${b}>${a}`), 1, `${mesh.name} open / inward edge`);
      }
      assert.ok(volume > 0, `${mesh.name} shell is inside out`);
    }
  } finally { view.dispose(); }
});

test('all grade-aligned vehicle vertices are inside the matching physical slope prism', () => {
  for (const body of BODIES) {
  const actor = vehicleWithBody('trafficVehicle', body);
  const view = createPopulationView(plan([actor]));
  const normal = new THREE.Vector3(-0.07, 1, 0.08).normalize();
  const sample = pose(actor, { x: 17, y: 2, z: -23, headingY: 0.8,
    groundNormalX: normal.x, groundNormalY: normal.y, groundNormalZ: normal.z });
  const physical = physicalPopulationHull(sample.x, sample.y, sample.z, sample.headingY,
    normal.x, normal.y, normal.z, actor.hull);
  const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  try {
    view.apply(snapshot([sample]));
    view.group.children.forEach(object => {
      const mesh = object as THREE.InstancedMesh;
      const vertices = mesh.geometry.getAttribute('position');
      for (let instance = 0; instance < mesh.count; instance += 1) {
        mesh.getMatrixAt(instance, matrix);
        let supportDistance = Infinity;
        for (let index = 0; index < vertices.count; index += 1) {
          vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
          const dx = vertex.x - physical.x, dz = vertex.z - physical.z;
          const localX = Math.cos(sample.headingY) * dx - Math.sin(sample.headingY) * dz;
          const localZ = Math.sin(sample.headingY) * dx + Math.cos(sample.headingY) * dz;
          assert.ok(Math.abs(localX) <= physical.halfWidthMetres + 2e-5, `${mesh.name} width`);
          assert.ok(Math.abs(localZ) <= physical.halfLengthMetres + 2e-5, `${mesh.name} length`);
          assert.ok(vertex.y >= physical.minY - 2e-5 && vertex.y <= physical.maxY + 2e-5, `${mesh.name} height`);
          supportDistance = Math.min(supportDistance, normal.x * (vertex.x - sample.x)
            + normal.y * (vertex.y - sample.y) + normal.z * (vertex.z - sample.z));
        }
        if (mesh.name === 'vehicle-tyre-rubber') assert.ok(Math.abs(supportDistance) < 2e-5, 'tyre touches sampled tangent plane');
      }
    });
  } finally { view.dispose(); }
  }
});

test('gait interpolation is deterministic and no extra apply advances motion', () => {
  const actors = [spec('walker'), spec('jogger'), spec('fictionalEuc'), spec('serviceVehicle')];
  const view = createPopulationView(plan(actors));
  const previous = snapshot(actors.map(actor => pose(actor, { headingY: Math.PI - 0.01, gaitDistanceMetres: 0.47 })), 20);
  const current = snapshot(actors.map(actor => pose(actor, { x: 0.01, headingY: -Math.PI + 0.01,
    gaitDistanceMetres: 0.48, wheelTravelMetres: 0.012 })), 21);
  try {
    view.update(previous, current, 0.5);
    const first = matrices(view.group);
    const versions = view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version);
    view.update(previous, current, 0.5);
    assert.deepEqual(matrices(view.group), first);
    assert.deepEqual(view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version), versions,
      'unchanged inputs issue no second upload');
    assert.deepEqual(view.report().missingPoseIds, []);
    assert.deepEqual(view.report().missingGroundNormalIds, []);
    assert.deepEqual(view.report().missingWheelTravelIds, []);
    meshBounds(view.group);
  } finally { view.dispose(); }
});

test('cached interpolation matches forced posing across changing presentation channels and mutable supports', () => {
  const actors = ['walker', 'jogger', 'worker', 'social', 'fictionalEuc', 'serviceVehicle', 'parkedVehicle']
    .map(kind => spec(kind as ActorKind));
  const view = createPopulationView(plan(actors)), forced = createPopulationView(plan(actors));
  const previous = snapshot(actors.map(actor => pose(actor, { activityPhase: 0.95 })), 10);
  const cases: Partial<PopulationRenderPose>[] = [
    {}, { x: 0.25 }, { y: 0.12 }, { z: -0.35 }, { headingY: Math.PI - 0.02 },
    { speedMetresPerSecond: -0.7, backing: true }, { gaitDistanceMetres: 0.34 }, { wheelTravelMetres: -0.81 },
    { activityPhase: 0.05 }, { activityBlend: 0.45 }, { activity: 'working', activityPhase: 0.4 },
    { activity: 'social', activityPhase: 0.2 }, { activity: 'waiting', speedMetresPerSecond: 0 },
    { groundNormalX: 0.08, groundNormalY: 1, groundNormalZ: -0.09 },
    { posture: 'seated', sittingBlend: 0.6, seatHeightMetres: 0.55 },
    { posture: 'standing', sittingBlend: 0, seatHeightMetres: undefined },
    // M42: the knock-down's channels re-pose through the cache like every other.
    { activity: 'impacted', impactReaction: 'knockdown', impactFallYaw: 1 },
    { activity: 'impacted', impactReaction: 'knockdown', impactFallYaw: -2.4, activityPhase: 0.62 },
    { activity: 'impacted', activityPhase: 0.62 },
  ];
  try {
    for (let index = 0; index < cases.length; index += 1) {
      const current = snapshot(actors.map(actor => pose(actor, cases[index])), 11 + index);
      for (const alpha of [0, 0.25, 0.5, 1]) {
        view.update(previous, current, alpha);
        forced.apply(snapshot([])); forced.update(previous, current, alpha);
        assert.deepEqual(matrices(view.group), matrices(forced.group), `case ${index}, alpha ${alpha}`);
      }
    }
    const current = snapshot(actors.map(actor => pose(actor)), 40);
    view.update(previous, current, 0.5);
    const before = matrices(view.group);
    for (const currentPose of current.actors) {
      const support = currentPose.tyreSupports?.[0] ?? currentPose.footSupports?.[0];
      if (support) (support as { y: number }).y += 0.035;
    }
    view.update(previous, current, 0.5);
    forced.apply(snapshot([])); forced.update(previous, current, 0.5);
    assert.notDeepEqual(matrices(view.group), before, 'same outer records must still detect changed support values');
    assert.deepEqual(matrices(view.group), matrices(forced.group));
  } finally { view.dispose(); forced.dispose(); }
});

test('stationary vehicle batches stay clean while a neighbouring social actor continues its activity', () => {
  const human = spec('social'), vehicle = spec('parkedVehicle'), view = createPopulationView(plan([human, vehicle]));
  try {
    view.apply(snapshot([pose(human), pose(vehicle)], 1));
    const versions = new Map(view.group.children.map(object => [object.name, (object as THREE.InstancedMesh).instanceMatrix.version]));
    const before = matrices(view.group);
    view.apply(snapshot([pose(human, { activityPhase: 0.6 }), pose(vehicle)], 2));
    assert.notDeepEqual(matrices(view.group), before, 'social gestures remain active');
    for (const object of view.group.children) if (object.name.startsWith('vehicle-')) {
      assert.equal((object as THREE.InstancedMesh).instanceMatrix.version, versions.get(object.name), object.name);
    }
    assert.equal(view.report().clockSeconds, 2 / 120);
  } finally { view.dispose(); }
});

test('repeated missing support stays hidden without uploads and valid reappearance restores the exact pose', () => {
  const actor = spec('walker'), view = createPopulationView(plan([actor]));
  const valid = snapshot([pose(actor)]), missing = snapshot([pose(actor, { footSupports: undefined })]);
  try {
    view.apply(valid); const visible = matrices(view.group);
    view.apply(missing); const hidden = matrices(view.group);
    const versions = view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version);
    assert.notDeepEqual(hidden, visible); assert.deepEqual(view.report().missingSurfaceSupportIds, [actor.id]);
    view.apply(missing);
    assert.deepEqual(matrices(view.group), hidden);
    assert.deepEqual(view.group.children.map(object => (object as THREE.InstancedMesh).instanceMatrix.version), versions);
    view.apply(valid); assert.deepEqual(matrices(view.group), visible);
    assert.deepEqual(view.report().missingSurfaceSupportIds, []);
  } finally { view.dispose(); }
});

test('both walker stance soles cancel the real forward travel without skating', () => {
  const actor = spec('walker');
  const view = createPopulationView(plan([actor]));
  const first = new THREE.Matrix4(), second = new THREE.Matrix4();
  try {
    const mesh = view.group.children.find(object => object.name === 'human-sole-rubber') as THREE.InstancedMesh;
    view.apply(snapshot([pose(actor, { z: 0, gaitDistanceMetres: 0 })]));
    const initial = Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, first); return first.clone();
    });
    view.apply(snapshot([pose(actor, { z: 0.01, gaitDistanceMetres: 0.01 })], 1));
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, second);
      assert.ok(Math.abs(second.elements[12]! - initial[i]!.elements[12]!) < 1e-6);
      assert.ok(Math.abs(second.elements[13]! - initial[i]!.elements[13]!) < 1e-6);
      assert.ok(Math.abs(second.elements[14]! - initial[i]!.elements[14]!) < 1e-6);
    }
  } finally { view.dispose(); }
});

test('shared targets agree with rendered sole origins and actual tyre supports', () => {
  const actor = spec('jogger'), vehicle = spec('serviceVehicle');
  const view = createPopulationView(plan([actor, vehicle]));
  try {
    const footPose = pose(actor, { x: 7, y: 1, z: -5, headingY: 0.7, gaitDistanceMetres: 0.81 });
    const tyrePose = pose(vehicle, { x: -12, y: 2, z: 9, headingY: -0.4 });
    // Deliberate independent finished-ground height changes, not a centre plane.
    const feet = footPose.footSupports!.map((support, i) => ({ ...support, y: support.y + (i ? 0.03 : -0.02) })) as unknown as NonNullable<PopulationRenderPose['footSupports']>;
    const tyres = tyrePose.tyreSupports!.map((support, i) => ({ ...support, y: support.y + [0.03, -0.02, 0.02, 0.04][i]! })) as unknown as NonNullable<PopulationRenderPose['tyreSupports']>;
    view.apply(snapshot([{ ...footPose, footSupports: feet }, { ...tyrePose, tyreSupports: tyres }]));
    const targets = populationSupportTargets({ ...actor, ...footPose,
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0 });
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const soles = view.group.children.find(object => object.name === 'human-sole-rubber') as THREE.InstancedMesh;
    for (let i = 0; i < 2; i += 1) {
      soles.getMatrixAt(i, matrix); point.set(0, 0, 0).applyMatrix4(matrix);
      assert.ok(point.distanceTo(new THREE.Vector3(feet[i]!.x, feet[i]!.y + targets.feet![i]!.liftMetres, feet[i]!.z)) < 2e-6);
    }
    const wheels = view.group.children.find(object => object.name === 'vehicle-tyre-rubber') as THREE.InstancedMesh;
    // Factory slots are left-front, left-rear, right-front, right-rear too.
    const radius = populationSupportTargets({ ...vehicle, ...tyrePose,
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0 }).tyres![0].radiusMetres;
    for (let i = 0; i < 4; i += 1) {
      wheels.getMatrixAt(i, matrix); point.set(0, 0, 0).applyMatrix4(matrix);
      assert.ok(Math.abs(point.x - tyres[i]!.x) < 2e-6);
      assert.ok(Math.abs(point.y - radius - tyres[i]!.y) < 2e-6);
      assert.ok(Math.abs(point.z - tyres[i]!.z) < 2e-6);
    }
    assert.deepEqual(view.report().missingSurfaceSupportIds, []);
  } finally { view.dispose(); }
});

test('upright human anatomy stays inside its authored hull across gait/activity/seat phases', () => {
  for (const kind of ['walker', 'jogger', 'worker', 'social', 'fictionalEuc'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      for (let step = 0; step <= 32; step += 1) {
        const sample = pose(actor, { gaitDistanceMetres: step / 32 * 1.5, wheelTravelMetres: step / 32 * 1.5,
          activityPhase: step / 32,
          ...(kind === 'social' && step > 16 ? { posture: 'seated' as const, sittingBlend: 1, seatHeightMetres: 0.48 } : {}) });
        view.apply(snapshot([sample]));
        const bounds = meshBounds(view.group), hull = actor.hull;
        assert.ok(bounds.min.x >= -hull.halfWidthMetres - 2e-5 && bounds.max.x <= hull.halfWidthMetres + 2e-5, `${kind} width @ ${step}`);
        assert.ok(bounds.min.z >= -hull.halfLengthMetres - 2e-5 && bounds.max.z <= hull.halfLengthMetres + 2e-5, `${kind} length @ ${step}`);
        assert.ok(bounds.min.y >= -2e-5 && bounds.max.y <= hull.heightMetres + 2e-5, `${kind} height @ ${step}`);
      }
    } finally { view.dispose(); }
  }
});

test('seated social pose uses an explicit cushion and has connected bent legs', () => {
  const actor = spec('social'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([pose(actor)]));
    const standing = meshBounds(view.group).max.y;
    view.apply(snapshot([pose(actor, { posture: 'seated', sittingBlend: 1, seatHeightMetres: 0.48 })]));
    assert.ok(meshBounds(view.group).max.y < standing - 0.25);
    const pelvis = view.group.children.find(object => object.name === 'human-pelvis-cloth') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); pelvis.getMatrixAt(0, matrix);
    assert.ok(Math.abs(matrix.elements[13]! - 0.48) < 2e-6, 'pelvis bottom meets authored cushion');
    // A posture flag alone never invents a seat height.
    view.apply(snapshot([pose(actor, { posture: 'seated', sittingBlend: 1 })]));
    assert.ok(Math.abs(meshBounds(view.group).max.y - standing) < 2e-6);
  } finally { view.dispose(); }
});

test('dynamic population never enters the static far shadow caster list', () => {
  const actor = spec('trafficVehicle'), view = createPopulationView(plan([actor]));
  const scene = new THREE.Scene(); scene.add(view.group);
  try {
    view.apply(snapshot([pose(actor)])); scene.updateMatrixWorld(true);
    assert.deepEqual(staticCasterBounds(scene), []);
    // Negative control: the caster list observes a wrongly tagged actor.
    const caster = view.group.children.find(object => (object as THREE.InstancedMesh).castShadow)!;
    caster.layers.enable(5);
    assert.ok(staticCasterBounds(scene).length > 0);
  } finally { view.dispose(); }
});

test('missing exact support channels hide an actor and report incomplete caller wiring', () => {
  const actor = spec('walker'), view = createPopulationView(plan([actor]));
  try {
    view.apply(snapshot([{ ...pose(actor), footSupports: undefined }]));
    assert.deepEqual(view.report().missingSurfaceSupportIds, [actor.id]);
    assert.ok(matrices(view.group).every(values => values.every(value => value === 0 || value === 1)));
  } finally { view.dispose(); }
});

test('shared pedal dimensions retain the actual standard machine model', () => {
  assert.equal(POPULATION_MODEL.pedalHeight, WHEEL.pedalHeight);
  assert.equal(POPULATION_MODEL.pedalHalfStance, RIDER_BLOCKOUT.stanceHalfWidth);
});

test('existing context-loss walk owns every population buffer and material', () => {
  const actors = [spec('walker'), spec('worker'), spec('fictionalEuc'), spec('serviceVehicle')];
  const view = createPopulationView(plan(actors));
  try {
    view.apply(snapshot(actors.map(actor => pose(actor))));
    const before = matrices(view.group), report = view.report();
    const holdings = collectLostContextHoldings([view.group], [], null);
    assert.equal(holdings.geometries.size, report.geometryOwners);
    assert.equal(holdings.materials.size, report.materialOwners);
    assert.equal(holdings.instanced.size, report.batches);
    assert.equal(holdings.textures.size, 0);
    assert.deepEqual(matrices(view.group), before, 'resource inventory does not advance poses');
  } finally { view.dispose(); }
});

test('missing poses hide their geometry; disposing is complete and idempotent', () => {
  const actor = spec('fictionalEuc');
  const view = createPopulationView(plan([actor]));
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  view.group.children.forEach(object => {
    const mesh = object as THREE.InstancedMesh;
    geometries.add(mesh.geometry);
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
  });
  let freedGeometry = 0, freedMaterials = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => freedGeometry += 1));
  materials.forEach(material => material.addEventListener('dispose', () => freedMaterials += 1));
  view.apply(snapshot([pose(actor)]));
  view.apply(snapshot([]));
  assert.deepEqual(view.report().missingPoseIds, [actor.id]);
  view.dispose(); view.dispose();
  assert.equal(freedGeometry, geometries.size);
  assert.equal(freedMaterials, materials.size);
  assert.equal(view.group.children.length, 0);
  assert.equal(view.report().drawCalls, 0);
  assert.equal(view.report().geometryOwners, 0);
  assert.equal(view.report().materialOwners, 0);
});

test('an empty world owns no geometry, materials, instances, textures or draws', () => {
  const view = createPopulationView(plan([]));
  try {
    view.apply(snapshot([]));
    const report = view.report();
    for (const key of ['drawCalls', 'shadowDrawCalls', 'colourTriangles', 'geometryBytes', 'instanceBytes',
      'textureBytes', 'geometryOwners', 'materialOwners'] as const) assert.equal(report[key], 0);
    assert.equal(view.group.visible, false);
  } finally { view.dispose(); }
});


test('pedestrian elbows bend behind the shoulder-wrist chord through real walking and activity poses', () => {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const endpoint = (mesh: THREE.InstancedMesh, index: number, y: number): THREE.Vector3 => {
    mesh.getMatrixAt(index, matrix); return point.set(0, y, 0).applyMatrix4(matrix).clone();
  };
  const rearward = (shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3,
    forward: THREE.Vector3): number => {
    const chord = wrist.clone().sub(shoulder);
    const along = elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq();
    return elbow.clone().sub(shoulder).addScaledVector(chord, -along).dot(forward);
  };
  let inspected = 0;
  for (const kind of ['walker', 'jogger', 'social', 'worker', 'fictionalEuc'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      const upper = view.group.getObjectByName('human-upperArm-cloth') as THREE.InstancedMesh;
      const forearm = view.group.getObjectByName('human-forearm-skin') as THREE.InstancedMesh;
      assert.ok(upper && forearm); assert.equal(upper.count, 2); assert.equal(forearm.count, 2);
      for (const heading of [0, Math.PI / 2, -2.1]) for (let phase = 0; phase < 16; phase++) {
        const value = pose(actor, {headingY: heading, gaitDistanceMetres: phase * 0.077,
          activityPhase: phase / 16, ...(kind === 'social' ? { posture: 'seated' as const,
            sittingBlend: 1, seatHeightMetres: 0.47 } : {})});
        view.apply(snapshot([value], phase));
        const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
        for (let side = 0; side < 2; side++) {
          const shoulder = endpoint(upper, side, 0), elbow = endpoint(upper, side, 1);
          const forearmRoot = endpoint(forearm, side, 0), wrist = endpoint(forearm, side, 1);
          assert.ok(elbow.distanceTo(forearmRoot) < 2e-6, 'actual submitted bones share one elbow');
          const projection = rearward(shoulder, elbow, wrist, forward);
          assert.ok(projection < -0.01, `${kind}/${heading}/${phase}/${side}: elbow bends backward (${projection})`);
          const chord = wrist.clone().sub(shoulder), t = elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq();
          const onChord = shoulder.clone().addScaledVector(chord, t);
          const inverted = onChord.clone().multiplyScalar(2).sub(elbow);
          assert.ok(rearward(shoulder, inverted, wrist, forward) > 0.01,
            'known-bad forward elbow fails the same anatomical predicate');
          inspected++;
        }
      }
    } finally { view.dispose(); }
  }
  assert.equal(inspected, 480);
});

test('a bumped person flinches: a brief lean back with the hands up, inside their hull, gone before the pause ends (VIS-CRASH-1)', () => {
  const matrix = new THREE.Matrix4();
  for (const kind of ['walker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      const head = view.group.getObjectByName('human-head-skin') as THREE.InstancedMesh;
      const forearm = view.group.getObjectByName('human-forearm-skin') as THREE.InstancedMesh;
      let tick = 0;
      const read = (phase: number) => {
        view.apply(snapshot([pose(actor, { activity: 'impacted', activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
        const bounds = meshBounds(view.group), hull = actor.hull;
        assert.ok(bounds.min.z >= -hull.halfLengthMetres - 2e-5 && bounds.max.z <= hull.halfLengthMetres + 2e-5, `${kind} @ ${phase}: inside its hull`);
        assert.ok(bounds.min.x >= -hull.halfWidthMetres - 2e-5 && bounds.max.x <= hull.halfWidthMetres + 2e-5 && bounds.max.y <= hull.heightMetres + 2e-5);
        head.getMatrixAt(0, matrix); const headZ = matrix.elements[14]!;
        const wristY = [0, 1].map(side => { forearm.getMatrixAt(side, matrix); return new THREE.Vector3(0, 1, 0).applyMatrix4(matrix).y; });
        return { headZ, wristY: (wristY[0]! + wristY[1]!) / 2 };
      };
      const calm = read(0.9), flinch = read(0.15);
      assert.ok(flinch.headZ < calm.headZ - 0.05, `${kind}: leans back (${(calm.headZ - flinch.headZ).toFixed(3)} m)`);
      assert.ok(flinch.wristY > calm.wristY + 0.15, `${kind}: hands come up (${(flinch.wristY - calm.wristY).toFixed(3)} m)`);
      for (let phase = 0; phase <= 1; phase += 1 / 16) read(phase);
      assert.deepEqual(read(0.75), calm, `${kind}: the flinch is over well before the impact pause ends`);
    } finally { view.dispose(); }
  }
});

// M42 (PLANS §42.3c): the stagger is the flinch plus a comic stumble — the
// hips shift and twist to one side and that arm windmills — with every
// assertion above kept: inside the hull, calm by phase 0.75.
test('a staggered person also shifts and twists at the hips and windmills one arm, inside the hull, calm by 0.75 (M42)', () => {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const [kind, appearance] of [['walker', 0], ['walker', 1], ['jogger', 2], ['worker', 3], ['fictionalEuc', 4]] as const) {
    const actor = spec(kind, `${kind}-${appearance}`, appearance), view = createPopulationView(plan([actor]));
    try {
      const pelvis = view.group.getObjectByName('human-pelvis-cloth') as THREE.InstancedMesh;
      const upper = view.group.getObjectByName('human-upperArm-cloth') as THREE.InstancedMesh;
      const forearm = view.group.getObjectByName('human-forearm-skin') as THREE.InstancedMesh;
      let tick = 0;
      const read = (phase: number) => {
        view.apply(snapshot([pose(actor, { activity: 'impacted', activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
        const bounds = meshBounds(view.group), hull = actor.hull;
        const extent = `x ${bounds.min.x.toFixed(3)}..${bounds.max.x.toFixed(3)}, z ${bounds.min.z.toFixed(3)}..${bounds.max.z.toFixed(3)}`;
        assert.ok(bounds.min.x >= -hull.halfWidthMetres - 2e-5 && bounds.max.x <= hull.halfWidthMetres + 2e-5, `${kind} @ ${phase}: width (${extent})`);
        assert.ok(bounds.min.z >= -hull.halfLengthMetres - 2e-5 && bounds.max.z <= hull.halfLengthMetres + 2e-5, `${kind} @ ${phase}: length (${extent})`);
        assert.ok(bounds.min.y >= -2e-5 && bounds.max.y <= hull.heightMetres + 2e-5, `${kind} @ ${phase}: height`);
        pelvis.getMatrixAt(0, matrix); const pelvisX = matrix.elements[12]!;
        const shoulderZ = [0, 1].map(side => { upper.getMatrixAt(side, matrix); return point.set(0, 0, 0).applyMatrix4(matrix).z; });
        const wristY = [0, 1].map(side => { forearm.getMatrixAt(side, matrix); return point.set(0, 1, 0).applyMatrix4(matrix).y; });
        return { pelvisX, shoulderTwist: shoulderZ[0]! - shoulderZ[1]!, wristY };
      };
      const calm = read(0.9);
      let shifted = 0, twisted = 0, windmill = 0;
      for (let phase = 0; phase < 0.7; phase += 1 / 64) {
        const now = read(phase);
        shifted = Math.max(shifted, Math.abs(now.pelvisX - calm.pelvisX));
        twisted = Math.max(twisted, Math.abs(now.shoulderTwist - calm.shoulderTwist));
        windmill = Math.max(windmill, Math.abs(now.wristY[0]! - now.wristY[1]!));
      }
      assert.ok(shifted > 0.03, `${kind}/${appearance}: the hips shift (${shifted.toFixed(3)} m)`);
      assert.ok(twisted > 0.04, `${kind}/${appearance}: the torso twists (${twisted.toFixed(3)} m between the shoulders)`);
      assert.ok(windmill > 0.08, `${kind}/${appearance}: one arm windmills (${windmill.toFixed(3)} m between the wrists)`);
      assert.deepEqual(read(0.75), calm, `${kind}/${appearance}: the stagger is over by phase 0.75`);
    } finally { view.dispose(); }
  }
});

/** The knock-down's sample fall directions: frontal, from behind, both sides and between. */
const FALL_YAWS = [Math.PI, 0, Math.PI / 2, -Math.PI / 2, 1, -2.3, Math.PI / 4, -0.6, 2.6];
const KNOCKDOWN_PHASES = [...Array.from({ length: 65 }, (_, i) => i / 64), 0.12, 0.2, 0.235, 0.27, 0.55, 0.85, 0.999];

test('a knocked-down person sits down hard and gets up inside the upright hull, whichever way they were hit (M42)', () => {
  for (const kind of ['walker', 'jogger', 'worker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    let widest = 0, tick = 0;
    try {
      for (const heading of [0, 0.9]) for (const fallYaw of FALL_YAWS) for (const phase of KNOCKDOWN_PHASES) {
        view.apply(snapshot([pose(actor, { headingY: heading, activity: 'impacted', impactReaction: 'knockdown',
          impactFallYaw: fallYaw, activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
        const hull = actor.hull, label = `${kind} heading ${heading} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}`;
        // Every vertex inside the person's own heading-frame prism.
        const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4(), c = Math.cos(heading), s = Math.sin(heading);
        let minY = Infinity;
        view.group.traverse(object => {
          if (!(object instanceof THREE.InstancedMesh)) return;
          const vertices = object.geometry.getAttribute('position');
          for (let instance = 0; instance < object.count; instance += 1) {
            object.getMatrixAt(instance, matrix);
            for (let index = 0; index < vertices.count; index += 1) {
              vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
              const localX = c * vertex.x - s * vertex.z, localZ = s * vertex.x + c * vertex.z;
              widest = Math.max(widest, Math.abs(localX), Math.abs(localZ));
              assert.ok(Math.abs(localX) <= hull.halfWidthMetres + 2e-5, `${label}: width ${localX.toFixed(3)} (${object.name})`);
              assert.ok(Math.abs(localZ) <= hull.halfLengthMetres + 2e-5, `${label}: length ${localZ.toFixed(3)} (${object.name})`);
              assert.ok(vertex.y <= hull.heightMetres + 2e-5, `${label}: height`);
              minY = Math.min(minY, vertex.y);
            }
          }
        });
        assert.ok(minY >= -2e-5, `${label}: nothing below the ground (${minY.toFixed(3)} m)`);
      }
      console.log(JSON.stringify({ kind, widestReachMetres: +widest.toFixed(3) }));
    } finally { view.dispose(); }
  }
});

test('the knock-down sits the pelvis low with both feet in front of it along the person\'s own facing, knees up, and starts and ends standing (M42)', () => {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const kind of ['walker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      const pelvis = view.group.getObjectByName('human-pelvis-cloth') as THREE.InstancedMesh;
      const soles = view.group.getObjectByName('human-sole-rubber') as THREE.InstancedMesh;
      const thighs = view.group.getObjectByName('human-upperLeg-cloth') as THREE.InstancedMesh;
      let tick = 0;
      const knocked = (phase: number, fallYaw: number, heading = 0.4) => pose(actor, { headingY: heading, activity: 'impacted',
        impactReaction: 'knockdown', impactFallYaw: fallYaw, activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 });
      for (const fallYaw of FALL_YAWS) {
        // The person never turns (critic repair 2026-10-10), so the feet lead
        // the pelvis along their own facing whichever way they were hit — and
        // toward the rider, opposite the fall, when hit from the front.
        const heading = 0.4, facing = { x: Math.sin(heading), z: Math.cos(heading) };
        const fall = { x: Math.sin(heading + fallYaw), z: Math.cos(heading + fallYaw) };
        for (let phase = 0.2; phase <= 0.55 + 1e-9; phase += 1 / 64) {
          view.apply(snapshot([knocked(phase, fallYaw)], tick += 1));
          pelvis.getMatrixAt(0, matrix); const seat = point.set(0, 0, 0).applyMatrix4(matrix).clone();
          assert.ok(seat.y <= 0.3, `${kind} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}: the pelvis is down (${seat.y.toFixed(3)} m)`);
          for (let side = 0; side < 2; side += 1) {
            soles.getMatrixAt(side, matrix); const sole = point.set(0, 0, 0).applyMatrix4(matrix);
            const along = (sole.x - seat.x) * facing.x + (sole.z - seat.z) * facing.z;
            assert.ok(along > 0.05, `${kind} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}: foot ${side} in front of the pelvis (${along.toFixed(3)} m along the facing)`);
            if (Math.cos(fallYaw) < -0.9) {
              const alongFall = (sole.x - seat.x) * fall.x + (sole.z - seat.z) * fall.z;
              assert.ok(alongFall < -0.05, `${kind} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}: hit from the front, foot ${side} toward the rider (${alongFall.toFixed(3)} m)`);
            }
            // Knees up: the thigh's far end (the knee) well above the hip.
            thighs.getMatrixAt(side, matrix);
            const hip = point.set(0, 0, 0).applyMatrix4(matrix).y, knee = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix).y;
            assert.ok(knee > hip + 0.2, `${kind} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}: knee ${side} up (${(knee - hip).toFixed(3)} m)`);
          }
        }
      }
      // Mid-sit, the pelvis bottom is on the ground, not hovering.
      view.apply(snapshot([knocked(0.375, Math.PI)], tick += 1));
      pelvis.getMatrixAt(0, matrix); assert.ok(matrix.elements[13]! < 0.06, `pelvis bottom ${matrix.elements[13]!.toFixed(3)} m`);
      // Phase 0 and phase 1 are the standing pose: the reaction starts and ends without a pop.
      const standing = (heading: number) => { view.apply(snapshot([pose(actor, { headingY: heading, activity: 'waiting',
        activityPhase: 0, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1)); return matrices(view.group); };
      const close = (a: number[][], b: number[][], tolerance: number, label: string) => a.forEach((values, i) =>
        values.forEach((value, j) => assert.ok(Math.abs(value - b[i]![j]!) <= tolerance, `${label}: ${view.group.children[i]!.name}[${j}] ${value} vs ${b[i]![j]}`)));
      for (const fallYaw of [0, 1, Math.PI]) {
        const still = standing(0.4);
        for (const [phase, tolerance] of [[0, 1e-9], [1, 1e-9], [0.995, 0.02]] as const) {
          view.apply(snapshot([knocked(phase, fallYaw)], tick += 1));
          close(matrices(view.group), still, tolerance, `${kind} fall ${fallYaw} @ ${phase}`);
        }
      }
    } finally { view.dispose(); }
  }
});

// Critic repair 2026-10-10 (critic-people item 4): a hit from behind spun the
// person half round to face the rider and back again at the get-up. The body
// now keeps its own heading through every phase, whichever way it was hit.
test('a knocked-down person never turns: pelvis, torso and head keep their heading at every phase (M42 critic repair)', () => {
  const matrix = new THREE.Matrix4();
  for (const kind of ['walker', 'jogger', 'worker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    let tick = 0, worst = 0;
    try {
      const parts = ['human-pelvis-cloth', 'human-torso-cloth', 'human-head-skin']
        .map(name => view.group.getObjectByName(name) as THREE.InstancedMesh);
      for (const heading of [0.4, -2.2]) for (const fallYaw of FALL_YAWS) for (const phase of KNOCKDOWN_PHASES) {
        view.apply(snapshot([pose(actor, { headingY: heading, activity: 'impacted', impactReaction: 'knockdown',
          impactFallYaw: fallYaw, activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
        for (const mesh of parts) {
          mesh.getMatrixAt(0, matrix);
          // The part's forward axis, flattened: a pitch never moves it, a turn would.
          const e = matrix.elements, yaw = Math.atan2(e[8]!, e[10]!);
          const off = Math.abs(Math.atan2(Math.sin(yaw - heading), Math.cos(yaw - heading)));
          worst = Math.max(worst, off);
          assert.ok(off < 1e-6, `${kind} heading ${heading} fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}: ${mesh.name} turned ${(off * 180 / Math.PI).toFixed(2)}°`);
        }
      }
    } finally { view.dispose(); }
    assert.ok(worst < 1e-6);
  }
});

// Critic repair 2026-10-10 (critic-people item 5): the crashed rider's body
// and wheel land against the struck person's hull on the rider's side. In the
// real game (a builder's probe run, 30 hits: front,
// behind and side at 6, 9 and 12 m/s into the four kinds) the drawn rider
// reaches into that hull from about 0.05 s after contact, by 0.06–0.15 m
// (once 0.18 m), and is out of it by about 1.3 s: phases 0.03–0.55 of the
// 2.2 s knock-down. Through that window the person keeps every vertex at least
// this far inside the hull on the rider's side, so neither passes through the
// other; outside it the hull alone bounds them (the test above).
const RIDER_SIDE_CLEARANCE_METRES = 0.15;
const RIDER_SIDE_WINDOW = [0.03, 0.55] as const;
test('the knock-down stays compact on the rider\'s side of the hull, where the crashed rider and wheel land (M42 critic repair)', () => {
  const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const tightest: Record<string, number> = {};
  for (const kind of ['walker', 'jogger', 'worker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    let tick = 0;
    try {
      for (const heading of [0, 0.9]) for (const fallYaw of FALL_YAWS) {
        // Toward the rider, in the person's own frame: opposite the fall.
        const rx = -Math.sin(fallYaw), rz = -Math.cos(fallYaw);
        const face = actor.hull.halfWidthMetres * Math.abs(rx) + actor.hull.halfLengthMetres * Math.abs(rz);
        for (const phase of [...KNOCKDOWN_PHASES, 0.03, 0.035, 0.04, 0.05, 0.06]) {
          if (phase < RIDER_SIDE_WINDOW[0] || phase > RIDER_SIDE_WINDOW[1]) continue;
          view.apply(snapshot([pose(actor, { headingY: heading, activity: 'impacted', impactReaction: 'knockdown',
            impactFallYaw: fallYaw, activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0 })], tick += 1));
          const c = Math.cos(heading), s = Math.sin(heading);
          let reach = -Infinity;
          view.group.traverse(object => {
            if (!(object instanceof THREE.InstancedMesh)) return;
            const vertices = object.geometry.getAttribute('position');
            for (let instance = 0; instance < object.count; instance += 1) {
              object.getMatrixAt(instance, matrix);
              // A hidden part (the clipboard off duty) is a point, not a body.
              if (Math.abs(matrix.determinant()) < 1e-12) continue;
              for (let index = 0; index < vertices.count; index += 1) {
                vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
                const localX = c * vertex.x - s * vertex.z, localZ = s * vertex.x + c * vertex.z;
                reach = Math.max(reach, localX * rx + localZ * rz);
              }
            }
          });
          const clearance = face - reach, key = `${kind} fall ${fallYaw.toFixed(2)}`;
          tightest[key] = Math.min(tightest[key] ?? Infinity, clearance);
          assert.ok(clearance >= RIDER_SIDE_CLEARANCE_METRES - 1e-6,
            `${key} heading ${heading} @ ${phase.toFixed(3)}: ${clearance.toFixed(3)} m clear of the rider's side of the hull`);
        }
      }
    } finally { view.dispose(); }
  }
  console.log(JSON.stringify({ riderSideClearanceMetres: Math.min(...Object.values(tightest)).toFixed(3) }));
});

// Owner follow-up 2026-10-12: the generic rectangular clothing accents are
// removed entirely, including their hidden back seam. A worker retains one
// purposeful reflective work band, not generic chest/waist/pocket tabs.
test('generic clothing has no trim-box allocation in standing or knockdown poses', () => {
  for (const kind of ['walker', 'jogger', 'social', 'fictionalEuc', 'worker'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      for (const phase of [0, 0.2, 0.5, 0.85]) {
        view.apply(snapshot([pose(actor, phase === 0 ? { activity: 'waiting' } : {
          activity: 'impacted', impactReaction: 'knockdown', activityPhase: phase, speedMetresPerSecond: 0,
        })]));
        const trim = view.group.getObjectByName('human-box-cloth') as THREE.InstancedMesh | undefined;
        if (kind === 'worker') assert.equal(trim!.count, 1, 'the work band alone');
        else assert.equal(trim, undefined, `${kind}: no chest, hem, back or pocket boxes`);
      }
    } finally { view.dispose(); }
  }
});

test('on a slope the knock-down sits on the ground under the person: no hand, seat or sole goes into it, no sole floats (M42 QA round 1)', () => {
  // The root never tilts, so the planted hands, the slid feet and the seat
  // follow the ground plane under the person (QA C r1 MINOR 3: at 25 % the
  // hands went 4.6 cm in; this sweep also found the seat 3.2 cm in on a
  // diagonal 25 % grade). Flat ground is exactly the flat pose (tests above).
  const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  let deepest = -Infinity, highestSole = -Infinity, tick = 0;
  for (const kind of ['walker', 'social'] as const) {
    const actor = spec(kind), view = createPopulationView(plan([actor]));
    try {
      for (const grade of [0.08, 0.15, 0.25]) for (const [ux, uz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7]] as const)
        for (const fallYaw of [Math.PI, 0, 1]) {
          const length = Math.hypot(ux * grade, uz * grade, 1), n = { x: ux * grade / length, y: 1 / length, z: uz * grade / length };
          for (let phase = 0.1; phase <= 0.9 + 1e-9; phase += 1 / 32) {
            view.apply(snapshot([pose(actor, { headingY: 0.9, activity: 'impacted', impactReaction: 'knockdown', impactFallYaw: fallYaw,
              activityPhase: phase, activityBlend: 0, speedMetresPerSecond: 0, groundNormalX: n.x, groundNormalY: n.y, groundNormalZ: n.z })], tick += 1));
            const label = `${kind} grade ${grade} uphill (${ux}, ${uz}) fall ${fallYaw.toFixed(2)} @ ${phase.toFixed(3)}`;
            view.group.traverse(object => {
              if (!(object instanceof THREE.InstancedMesh)) return;
              const vertices = object.geometry.getAttribute('position'), sole = object.name.includes('sole');
              for (let instance = 0; instance < object.count; instance += 1) {
                object.getMatrixAt(instance, matrix);
                let lowest = Infinity;
                for (let index = 0; index < vertices.count; index += 1) {
                  vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
                  const above = vertex.y + (n.x * vertex.x + n.z * vertex.z) / n.y;
                  lowest = Math.min(lowest, above);
                  if (!sole) deepest = Math.max(deepest, -above);
                  assert.ok(above >= -2e-5, `${label}: ${object.name} ${(-above * 100).toFixed(2)} cm into the ground`);
                }
                if (sole) {
                  highestSole = Math.max(highestSole, lowest);
                  assert.ok(lowest <= 2e-5, `${label}: sole ${instance} floats ${(lowest * 100).toFixed(2)} cm`);
                }
              }
            });
          }
        }
    } finally { view.dispose(); }
  }
  console.log(JSON.stringify({ slopeSit: { deepestBelowGroundMetres: +deepest.toFixed(4), soleHighestLowPointMetres: +highestSole.toFixed(5) } }));
});

test('an NPC wheel rider and a stagger never take the knock-down pose (M42)', () => {
  const rider = spec('fictionalEuc'), view = createPopulationView(plan([rider]));
  try {
    view.apply(snapshot([pose(rider, { activity: 'impacted', activityPhase: 0.4, activityBlend: 0 })]));
    const stagger = matrices(view.group);
    view.apply(snapshot([pose(rider, { activity: 'impacted', activityPhase: 0.4, activityBlend: 0, impactReaction: 'knockdown', impactFallYaw: 1 })], 1));
    assert.deepEqual(matrices(view.group), stagger, 'a rider on a wheel keeps the flinch');
  } finally { view.dispose(); }
});

// --- PERF-WHARF exactness (2026-10-23) ------------------------------------
// The view's per-frame savings are meant to be bit-identical; these pin the
// three facts they rest on. The whole-view side-by-side against the untouched
// module, on recorded Wharf and town rides, is in the pass's report.
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const bitsOf = (value: number): string => { f64[0] = value; return `${u32[1]!.toString(16)}:${u32[0]!.toString(16)}`; };

test('PERF-WHARF: per-part bounds equal three\'s getMatrixAt + applyMatrix4 + union, to the float bit', () => {
  let seed = 7;
  const random = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const geometries = [new THREE.SphereGeometry(0.3), new THREE.BoxGeometry(1, 0.2, 2).translate(0.4, 1.1, -0.3),
    new THREE.CylinderGeometry(0.05, 0.05, 0.01).translate(0, 0, 3), new THREE.BufferGeometry()];
  geometries[3].setAttribute('position', new THREE.Float32BufferAttribute([1, 1, 1], 3));
  for (const geometry of geometries) geometry.computeBoundingSphere();
  const meshes = geometries.map(geometry => new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 24));
  const object = new THREE.Object3D(), matrix = new THREE.Matrix4(), reference = new THREE.Sphere(), part = new THREE.Sphere();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let cases = 0, equalCentres = 0, inside = 0;
  try {
    for (let round = 0; round < 400; round += 1) {
      for (const mesh of meshes) for (let index = 0; index < 24; index += 1) {
        const kind = random();
        if (kind < 0.1) { mesh.setMatrixAt(index, hidden); continue; }
        // A shared spot makes equal transformed centres; a big spread makes far parts.
        const spot = kind < 0.25 ? 0 : (random() - 0.5) * (kind < 0.5 ? 0.2 : 400);
        object.position.set(spot, kind < 0.25 ? 1 : (random() - 0.5) * 3, spot * 0.5);
        object.rotation.set(random() * 7, random() * 7, random() * 7);
        const scale = kind < 0.3 ? 0 : random() * 2;
        object.scale.set(kind > 0.9 ? -scale : scale, random() * 2, random() * 1.5 + 0.01);
        object.updateMatrix(); mesh.setMatrixAt(index, object.matrix);
      }
      const slots: InstanceSphereSlot[] = Array.from({ length: 1 + Math.floor(random() * 40) }, () => {
        const mesh = meshes[Math.floor(random() * meshes.length)]!;
        return { batch: { mesh, geometry: mesh.geometry }, index: Math.floor(random() * 24) };
      });
      // Repeated parts (the same matrix row twice) are the union's equal-centre branch.
      if (round % 4 === 0) slots.splice(1, 0, slots[0]!, slots[0]!);
      reference.makeEmpty();
      for (const slot of slots) {
        slot.batch.mesh!.getMatrixAt(slot.index, matrix);
        part.copy(slot.batch.geometry.boundingSphere!).applyMatrix4(matrix);
        if (!reference.isEmpty() && !part.isEmpty() && reference.center.equals(part.center)) equalCentres += 1;
        if (!reference.isEmpty() && reference.containsPoint(part.center)) inside += 1;
        reference.union(part);
      }
      const bounds = unionInstanceSpheres(new THREE.Sphere(new THREE.Vector3(9, 9, 9), 9), slots);
      assert.deepEqual([bounds.center.x, bounds.center.y, bounds.center.z, bounds.radius].map(bitsOf),
        [reference.center.x, reference.center.y, reference.center.z, reference.radius].map(bitsOf), `round ${round}`);
      cases += slots.length;
    }
    const empty = unionInstanceSpheres(new THREE.Sphere(new THREE.Vector3(1, 2, 3), 4), []);
    const made = new THREE.Sphere().makeEmpty();
    assert.deepEqual([empty.center.x, empty.center.y, empty.center.z, empty.radius].map(bitsOf),
      [made.center.x, made.center.y, made.center.z, made.radius].map(bitsOf), 'no slots is makeEmpty');
    assert.ok(cases > 6000 && equalCentres > 50 && inside > 500, JSON.stringify({ cases, equalCentres, inside }));
  } finally { for (const mesh of meshes) mesh.dispose(); for (const geometry of geometries) geometry.dispose(); }
});

test('PERF-WHARF: an unrotated part\'s quaternion is exactly (+0, +0, +0, 1), and only +0 angles give it', () => {
  const quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const bits = () => [quaternion.x, quaternion.y, quaternion.z, quaternion.w].map(bitsOf);
  quaternion.set(9, 9, 9, 9); quaternion.setFromEuler(euler.set(0, 0, 0), false);
  assert.deepEqual(bits(), [0, 0, 0, 1].map(bitsOf), 'what write()\'s shortcut sets');
  // Signed zeros are why the shortcut is guarded with Object.is: some leave a −0 behind.
  quaternion.setFromEuler(euler.set(-0, 0, -0), false);
  assert.notDeepEqual(bits(), [0, 0, 0, 1].map(bitsOf));
});

test('PERF-WHARF: a length test is never failed by a normal whose up component alone exceeds twice its threshold', () => {
  let seed = 11;
  const random = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let index = 0; index < 20_000; index += 1) {
    const y = 2e-6 * (1 + random() * (index % 2 ? 1e-9 : 4)) + Number.EPSILON * random();
    const x = (random() - 0.5) * 10 ** (Math.floor(random() * 14) - 9), z = (random() - 0.5) * 10 ** (Math.floor(random() * 14) - 9);
    assert.ok(Math.hypot(x, y, z) > 1e-6, `${x} ${y} ${z}`);
    assert.ok(Math.hypot(x, y, z) >= y, `hypot below its largest component at ${x} ${y} ${z}`);
  }
});

test('PERF-WHARF: rows are found by the learned layout exactly as by id, in any order, with stale duplicates and gaps', () => {
  const actors = [spec('walker', 'w0', 0), spec('social', 's1', 1), spec('trafficVehicle', 'v2', 2),
    spec('jogger', 'j3', 3), spec('fictionalEuc', 'e4', 4), spec('worker', 'k5', 5)];
  const reference = createPopulationView(plan(actors)), shuffled = createPopulationView(plan(actors));
  const at = (frame: number) => actors.map((actor, index) => pose(actor, { x: index * 6 + frame * 0.03, z: frame * 0.02 * index,
    gaitDistanceMetres: frame * 0.04, wheelTravelMetres: frame * 0.05, activityPhase: (frame * 0.07 + index * 0.1) % 1 }));
  // The simulation's own layout is id-sorted, not the plan's order.
  const sorted = (rows: PopulationRenderPose[]) => [...rows].sort((a, b) => a.id < b.id ? -1 : 1);
  const layouts: ((rows: PopulationRenderPose[], frame: number) => PopulationRenderPose[])[] = [
    rows => sorted(rows), rows => sorted(rows), rows => [...rows].reverse(), rows => sorted(rows),
    // A stale earlier copy of one id: the id map keeps the last row, and so must the layout.
    (rows, frame) => [{ ...rows[1]!, x: -50 }, ...sorted(rows)].map((row, i) => i === 0 ? row : { ...row, z: row.z + frame * 1e-3 }),
    rows => sorted(rows).slice(1), rows => sorted(rows),
  ];
  try {
    let previous = at(0), compared = 0;
    for (let frame = 1; frame < 60; frame += 1) {
      const current = at(frame), layout = layouts[frame % layouts.length]!, shape = layouts[(frame + 3) % layouts.length]!;
      const ordered = layout(current, frame), before = shape(previous, frame);
      // The reference reads by id from the plan-ordered rows the layouts were built from (last row of an id wins).
      const byId = (rows: PopulationRenderPose[]) => { const map = new Map(rows.map(row => [row.id, row]));
        return actors.flatMap(actor => map.has(actor.id) ? [map.get(actor.id)!] : []); };
      for (const alpha of [0.25, 0.75]) {
        reference.update(snapshot(byId(before), frame - 1), snapshot(byId(ordered), frame), alpha);
        shuffled.update(snapshot(before, frame - 1), snapshot(ordered, frame), alpha);
        assert.deepEqual(matrices(shuffled.group).map(row => row.map(bitsOf)), matrices(reference.group).map(row => row.map(bitsOf)), `frame ${frame}`);
        assert.deepEqual(shuffled.report().missingPoseIds, reference.report().missingPoseIds);
        compared += 1;
      }
      previous = current;
    }
    assert.ok(compared > 100);
  } finally { reference.dispose(); shuffled.dispose(); }
});
