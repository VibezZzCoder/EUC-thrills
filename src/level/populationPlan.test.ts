/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Population authoring contracts and known-bad geometry controls. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_AUTHORING as R } from '../data/tuning.ts';
import type { BoxCollider, GroundSurfacePatch, LevelPlan } from './plan.ts';
import type { PlacedSegment, SegmentSpec } from './segments.ts';
import { createGroundSample, type SurfaceId } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { planDigest } from './planDigest.ts';
import { createSeedStreams } from './seedStreams.ts';
import { buildPopulationPlan, emitPopulationPaths, populationChoice, populationWorldId, populationSpanFootprints,
  surfaceFootprintClear, createPopulationValidationContext, type AuthoredPopulationPath, type PathRole, type District }
  from './populationPlan.ts';

function flatPlan(surface: SurfaceId = 'pavement'): LevelPlan {
  return { id: 'fixture-world', spawn: { position: { x: -80, y: 0, z: -80 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: {
      originX: -100, originZ: -100, spacing: 1, columns: 201, rows: 201,
      heights: new Array<number>(201 * 201).fill(0),
      surfaces: new Array<SurfaceId>(200 * 200).fill(surface),
    }, segments: [{ id: 'lane', entry: { position: { x: 0, y: 0, z: 20 }, headingY: 0,
      halfWidth: 9, surface: 'pavement', gradient: 0 }, exit: { position: { x: 0, y: 0, z: 80 },
      headingY: 0, halfWidth: 9, surface: 'pavement', gradient: 0 }, colliders: [] }], checkpoints: [] };
}

function source(role: PathRole = 'pedestrian', district: District = 'park',
  length = 60, x = 0, z = 20): AuthoredPopulationPath {
  const count = Math.ceil(length / 0.5);
  return { id: `${role}-${district}`, role, district, closed: false, serviceShuttle: false,
    frames: Array.from({ length: count + 1 }, (_, index) => ({ x, y: 0, z: z + length * index / count,
      headingY: 0, distanceMetres: length * index / count, sourceSegmentId: 'lane', halfWidthMetres: 3 })) };
}

function body(x: number, z: number, halfX = 1, halfZ = 1, yaw = 0): BoxCollider {
  return { centre: { x, y: 1, z }, halfExtents: { x: halfX, y: 1, z: halfZ }, rotationY: yaw, surface: 'pavement' };
}

function assertSourceUnchanged(plan: LevelPlan, before: string): void { assert.equal(planDigest(plan), before); }

test('absence of factual trace stays absent and reports missing source rather than reconstructing sockets', () => {
  const plan = flatPlan(); const before = planDigest(plan);
  const population = buildPopulationPlan(plan, undefined);
  assert.equal(population.report.missingAuthoredPaths, true);
  assert.equal(population.paths.length, 0); assert.equal(population.actors.length, 0);
  assert.equal(population.installedWorldId, plan.id);
  assertSourceUnchanged(plan, before);
});

test('population authoring is repeatable and does not consume existing content streams or mutate its world', () => {
  const plan = flatPlan(); const before = planDigest(plan);
  const streams = createSeedStreams('independence-control');
  const initialDraws = Object.fromEntries(Object.entries(streams).map(([domain, stream]) => [domain, stream.draws]));
  const one = buildPopulationPlan(plan, [source()]);
  const two = buildPopulationPlan(plan, [source()]);
  assert.deepEqual(one, two); assert.ok(one.actors.length > 0);
  assert.deepEqual(Object.fromEntries(Object.entries(streams).map(([domain, stream]) => [domain, stream.draws])), initialDraws);
  assertSourceUnchanged(plan, before);
  assert.notEqual(one.installedWorldId, plan.id);
  assert.equal(JSON.stringify(one).includes('function'), false);
});

test('per-item streams are independent of call order and unrelated roster requests', () => {
  const appearance = populationChoice('world', 'appearance', 'walker-1');
  const direction = populationChoice('world', 'direction', 'walker-1');
  for (let index = 0; index < 100; index += 1) populationChoice('world', 'roster', String(index));
  assert.equal(populationChoice('world', 'direction', 'walker-1'), direction);
  assert.equal(populationChoice('world', 'appearance', 'walker-1'), appearance);
  assert.notEqual(direction, appearance);
});

test('actual curved source emits exact lateral frames and original geometry is untouched', () => {
  const spec: SegmentSpec = { id: 'curve', length: 30, halfWidth: 9, curvature: 1 / 20, surface: 'pavement' };
  const entry = { position: { x: 2, y: 0, z: 4 }, headingY: 0.25,
    halfWidth: 9, surface: 'pavement' as const, gradient: 0 };
  const placed: PlacedSegment = { spec, entry, exit: entry, minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  const before = JSON.stringify(placed);
  const [path] = emitPopulationPaths([placed], [{ id: 'walk-curve', role: 'pedestrian', district: 'park',
    steps: [{ segmentId: 'curve', lateralMetres: 6, halfWidthMetres: 1 }] }]);
  const last = path.frames[path.frames.length - 1];
  const heading = 0.25 + 30 / 20;
  const expectedX = 2 + (Math.cos(0.25) - Math.cos(heading)) * 20 + Math.cos(heading) * 6;
  const expectedZ = 4 + (Math.sin(heading) - Math.sin(0.25)) * 20 - Math.sin(heading) * 6;
  assert.ok(Math.abs(last.x - expectedX) < 1e-9); assert.ok(Math.abs(last.z - expectedZ) < 1e-9);
  assert.ok(Math.abs(last.headingY - heading) < 1e-9);
  assert.equal(JSON.stringify(placed), before);
});

test('authoring refuses disconnected joins and reversing traffic at a socket', () => {
  const entry = { position: { x: 0, y: 0, z: 20 }, headingY: 0,
    halfWidth: 9, surface: 'pavement' as const, gradient: 0 };
  const placed: PlacedSegment = { spec: { id: 'lane', length: 60, halfWidth: 9, surface: 'pavement' },
    entry, exit: { ...entry, position: { x: 0, y: 0, z: 80 } }, minX: -9, maxX: 9, minZ: 20, maxZ: 80 };
  assert.throws(() => emitPopulationPaths([placed], [{ id: 'false-loop', role: 'traffic', district: 'commercial', closed: true,
    steps: [{ segmentId: 'lane', lateralMetres: -3, halfWidthMetres: 3 },
      { segmentId: 'lane', forward: false, lateralMetres: 3, halfWidthMetres: 3 }] }]), /authored join\/turn/);
});

test('rotated original solids cut the route; actor radius catches a near-edge miss', () => {
  const control = flatPlan(); assert.ok(buildPopulationPlan(control, [source()]).paths.some(path => path.lengthMetres > 55));
  const plan = { ...control, solids: [body(0.8, 50, 0.4, 1, Math.PI / 4)] };
  const population = buildPopulationPlan(plan, [source()]);
  assert.ok(population.report.rejected.some(item => item.reason === 'solid'));
  assert.ok(population.paths.every(path => !(path.points[0].z < 50 && path.points[path.points.length - 1].z > 50)));
});

test('movement bands clear rectangular actor corners rather than only one half-extent', () => {
  for (const [role, unsafeBand, safeBand] of [
    ['pedestrian', 0.65, 0.80], ['rider', 0.90, 1.10],
  ] as const) {
    const plan = flatPlan(), wide = source(role);
    const positive = buildPopulationPlan(plan, [{ ...wide,
      frames: wide.frames.map(frame => ({ ...frame, halfWidthMetres: safeBand })) }]);
    assert.ok(positive.paths.length > 0, 'a genuinely wide source band remains usable');
    const negative = buildPopulationPlan(plan, [{ ...wide,
      frames: wide.frames.map(frame => ({ ...frame, halfWidthMetres: unsafeBand })) }]);
    assert.equal(negative.paths.length, 0);
    assert.ok(negative.report.rejected.some(item => item.reason === 'invalid-source'));
  }
});

test('sampler solid tops cannot turn a source ground path into a roof walk', () => {
  const plan = { ...flatPlan(), solids: [{ ...body(0, 50, 4, 5), centre: { x: 0, y: 3, z: 50 },
    halfExtents: { x: 4, y: 3, z: 5 } }] };
  const population = buildPopulationPlan(plan, [source()]);
  assert.ok(population.report.rejected.some(item => item.reason === 'ground'));
  assert.ok(population.paths.every(path => path.points.every(point => point.y === 0)));
});

for (const kind of ['hazard', 'spawn', 'checkpoint', 'trick', 'lap', 'target', 'soft-body'] as const) {
  test(`swept ${kind} footprint blocks a crossing even between authoring frame endpoints`, () => {
    const plan = flatPlan();
    if (kind === 'hazard') plan.hazards = [{ id: 'hole', kind: 'potholeDeep', centre: { x: 0, y: 0, z: 50.23 }, radius: 0.05 }];
    if (kind === 'spawn') plan.spawn.position = { x: 0, y: 0, z: 50.23 };
    if (kind === 'checkpoint') plan.checkpoints = [{ id: 'gate', kind: 'split', routeIndex: 0, label: 'Line',
      centre: { x: 0, y: 1, z: 50.23 }, halfExtents: { x: 2, y: 1, z: 0.001 }, headingY: Math.PI / 6 }];
    if (kind === 'trick') plan.trickZones = [{ id: 'feature', corners: [
      { x: -0.5, z: 50.22 }, { x: 0.5, z: 50.22 }, { x: 0.5, z: 50.24 }, { x: -0.5, z: 50.24 },
    ] }];
    if (kind === 'lap') plan.lap = { length: 100, points: [
      { x: -50, z: 50.23, halfWidth: 0.5 }, { x: 50, z: 50.23, halfWidth: 0.5 },
    ] };
    if (kind === 'target') plan.targets = [{ id: 'disc', base: { x: -3, y: 0, z: 50.23 },
      centre: { x: 3, y: 1.5, z: 50.23 }, radius: 0.2 }];
    if (kind === 'soft-body') plan.softBodies = [{ ...body(0, 50.23, 1, 0.001) }];
    const population = buildPopulationPlan(plan, [source()]);
    assert.ok(population.report.rejected.some(item => item.reason === kind));
    assert.ok(population.paths.every(path => !(path.points[0].z < 50.23
      && path.points[path.points.length - 1].z > 50.23)));
  });
}

function rectanglePatch(plan: LevelPlan, id: string, surface: SurfaceId, x0: number, z0: number,
  x1: number, z1: number): GroundSurfacePatch {
  const column = Math.floor(x0 - plan.heightfield.originX), row = Math.floor(z0 - plan.heightfield.originZ);
  const cell = row * 200 + column;
  const a = { x: x0, y: 0, z: z0 }, b = { x: x1, y: 0, z: z0 };
  const c = { x: x0, y: 0, z: z1 }, d = { x: x1, y: 0, z: z1 };
  return { id, surface, triangles: [{ cell, vertices: [a, d, b] }, { cell, vertices: [a, c, d] }] };
}

test('precise paving changes are read from the finished sampler and full footprint coverage', () => {
  const plan = flatPlan('grass');
  const polygon = [{ x: 0.2, z: 30.2 }, { x: 0.8, z: 30.2 }, { x: 0.8, z: 30.8 }, { x: 0.2, z: 30.8 }];
  const allowed = new Set<SurfaceId>(['pavement']);
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), false);
  plan.groundSurfacePatches = [rectanglePatch(plan, 'court', 'pavement', 0.1, 30.1, 0.9, 30.9)];
  assert.equal(new PlanTerrainSampler(plan).sampleGround(0.5, 30.5, createGroundSample()).surface, 'pavement');
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), true);
  // A 2 mm gap between probes must fail the footprint, not disappear in sampling.
  plan.groundSurfacePatches = [rectanglePatch(plan, 'left', 'pavement', 0.1, 30.1, 0.499, 30.9),
    rectanglePatch(plan, 'right', 'pavement', 0.501, 30.1, 0.9, 30.9)];
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), false);
});

test('precise surface order and original source-surface gates agree with the sampler', () => {
  const plan = flatPlan('grass');
  const polygon = [{ x: 0.2, z: 30.2 }, { x: 0.8, z: 30.2 }, { x: 0.8, z: 30.8 }, { x: 0.2, z: 30.8 }];
  const pave = rectanglePatch(plan, 'pave', 'pavement', 0.1, 30.1, 0.9, 30.9);
  const spill = rectanglePatch(plan, 'spill', 'spill', 0.499, 30.1, 0.501, 30.9);
  const allowed = new Set<SurfaceId>(['pavement']);
  plan.groundSurfacePatches = [pave, spill];
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), false);
  plan.groundSurfacePatches = [spill, pave];
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), true);
  plan.groundSurfacePatches = [{ ...pave, sourceSurface: 'dirt' }];
  assert.equal(new PlanTerrainSampler(plan).sampleGround(0.5, 30.5, createGroundSample()).surface, 'grass');
  assert.equal(surfaceFootprintClear(plan, polygon, allowed), false);
});

test('scoped preparation preserves exact patch order, source gates and fresh finished-plan ownership', () => {
  const original = flatPlan('grass');
  const polygon = [{ x: 0.2, z: 30.2 }, { x: 0.8, z: 30.2 }, { x: 0.8, z: 30.8 }, { x: 0.2, z: 30.8 }];
  const pave = rectanglePatch(original, 'pave', 'pavement', 0.1, 30.1, 0.9, 30.9);
  const spill = rectanglePatch(original, 'spill', 'spill', 0.499, 30.1, 0.501, 30.9);
  const allowed = new Set<SurfaceId>(['pavement']);
  const plan = { ...original, groundSurfacePatches: [pave, spill] };
  const prepared = createPopulationValidationContext(plan);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.equal(surfaceFootprintClear(plan, polygon, allowed, prepared), false);
    assert.equal(surfaceFootprintClear(plan, polygon, allowed, prepared), surfaceFootprintClear(plan, polygon, allowed));
  }
  const changed = { ...plan, groundSurfacePatches: [spill, pave] };
  const next = createPopulationValidationContext(changed, prepared);
  assert.equal(next.boxes, prepared.boxes, 'unchanged static owners share only static preparation');
  assert.equal(surfaceFootprintClear(changed, polygon, allowed, next), true);
  assert.throws(() => surfaceFootprintClear(changed, polygon, allowed, prepared), /different finished plan/);
  const gated = { ...changed, groundSurfacePatches: [{ ...pave, sourceSurface: 'dirt' as const }] };
  assert.equal(surfaceFootprintClear(gated, polygon, allowed, createPopulationValidationContext(gated, next)), false);
  const flat = flatPlan();
  const sampler = new PlanTerrainSampler(flat);
  assert.deepEqual(buildPopulationPlan(flat, [source()], sampler, createPopulationValidationContext(flat)),
    buildPopulationPlan(flat, [source()], sampler));
});

test('park joggers, ordinary walkers and fictional EUC riders use different explicit suitable paths', () => {
  const plan = flatPlan(); const walk = source('pedestrian', 'park'); const ride = source('rider', 'park', 60, 8);
  const population = buildPopulationPlan(plan, [walk, ride]);
  assert.ok(population.actors.some(actor => actor.kind === 'walker'));
  assert.ok(population.actors.some(actor => actor.kind === 'jogger'));
  assert.ok(population.actors.some(actor => actor.kind === 'fictionalEuc'));
  for (const actor of population.actors) {
    const path = population.paths.find(item => item.id === actor.pathId)!;
    assert.equal(path.role, actor.kind === 'fictionalEuc' ? 'rider' : 'pedestrian');
  }
});

test('social pairs require an existing bench; exterior workers require actual industrial context', () => {
  const park = flatPlan();
  park.props = [{ kind: 'bench', position: { x: 3, y: 0, z: 45 }, rotationY: 0, scale: 1 }];
  const social = buildPopulationPlan(park, [source()]).actors.filter(actor => actor.kind === 'social');
  assert.equal(social.length, 2); assert.equal(social[0].socialGroupId, social[1].socialGroupId);
  assert.ok(social[0].socialGroupId);
  const industrial = flatPlan();
  industrial.props = [{ kind: 'building', look: 'industrial', position: { x: 12, y: 0, z: 45 },
    rotationY: 0, scale: 1, size: { x: 6, y: 6, z: 12 } }];
  industrial.solids = [{ ...body(12, 45, 3, 6), centre: { x: 12, y: 3, z: 45 }, halfExtents: { x: 3, y: 3, z: 6 } }];
  const workers = buildPopulationPlan(industrial, [source('pedestrian', 'industrial')]);
  assert.ok(workers.actors.some(actor => actor.kind === 'worker'));
  assert.equal(buildPopulationPlan(flatPlan(), [source('pedestrian', 'industrial')])
    .actors.some(actor => actor.kind === 'worker'), false);
});

test('open normal traffic is refused; missing traffic is explicit rather than a reversing-car fallback', () => {
  const population = buildPopulationPlan(flatPlan(), [source('traffic', 'commercial')]);
  assert.equal(population.actors.some(actor => actor.kind === 'trafficVehicle'), false);
  assert.ok(population.report.rejected.some(item => item.reason === 'open-traffic'));
  assert.ok(population.report.missingKinds.includes('trafficVehicle'));
});

test('closed factual vehicle path produces forward traffic; an original hazard invalidates the entire loop', () => {
  const plan = flatPlan();
  const entry = { position: { x: 20, y: 0, z: 20 }, headingY: 0,
    halfWidth: 9, surface: 'pavement' as const, gradient: 0 };
  const placed: PlacedSegment = { spec: { id: 'loop', length: 30 * Math.PI, curvature: 1 / 15,
    halfWidth: 9, surface: 'pavement' }, entry, exit: entry, minX: 10, maxX: 60, minZ: -10, maxZ: 50 };
  plan.segments = [{ id: 'loop', entry, exit: entry, colliders: [] }];
  const paths = emitPopulationPaths([placed], [{ id: 'traffic-loop', role: 'traffic', district: 'commercial', closed: true,
    steps: [{ segmentId: 'loop', lateralMetres: 0, halfWidthMetres: 3 }] }]);
  const clear = buildPopulationPlan(plan, paths);
  assert.ok(clear.actors.some(actor => actor.kind === 'trafficVehicle' && actor.movement === 'loop' && actor.direction === 1));
  plan.hazards = [{ id: 'hole', kind: 'potholeDeep', centre: { x: 20, y: 0, z: 20 }, radius: 1 }];
  const blocked = buildPopulationPlan(plan, paths);
  assert.equal(blocked.actors.some(actor => actor.kind === 'trafficVehicle'), false);
  assert.ok(blocked.report.rejected.some(item => item.reason === 'hazard'));
});

test('explicit stationary bays require original warehouses and stay independent of moving service', () => {
  const plan = flatPlan();
  plan.props = [{ kind: 'building', look: 'industrial', scale: 1, position: { x: 12, y: 0, z: 46 },
    rotationY: 0, size: { x: 6, y: 6, z: 12 } }];
  plan.solids = [{ ...body(12, 46, 3, 6), centre: { x: 12, y: 3, z: 46 }, halfExtents: { x: 3, y: 3, z: 6 } }];
  const shuttle = { ...source('service', 'industrial', 12, -4, 40), id: 'service-shuttle', serviceShuttle: true };
  const generic = { ...source('service', 'industrial', 12, 0, 40), id: 'generic-service' };
  assert.equal(buildPopulationPlan(plan, [generic, shuttle]).actors.some(actor => actor.kind === 'parkedVehicle'), false);
  plan.populationGroundSources = [{ id: 'actual-bay-source', purpose: 'parking-bay', sourcePropIndex: 0,
    hostSegmentIds: ['lane'], groundPatchIds: [], polygons: [[
      { x: 10.6, y: 0, z: 31 }, { x: 13.4, y: 0, z: 31 },
      { x: 13.4, y: 0, z: 37 }, { x: 10.6, y: 0, z: 37 },
    ]] }];
  plan.populationParkingBays = [{ id: 'standalone-bay', sourceId: 'actual-bay-source', sourcePropIndex: 0,
    position: { x: 12, y: 0, z: 34 }, headingY: 0, halfWidthMetres: 1.4, halfLengthMetres: 3 }];
  const population = buildPopulationPlan(plan, [shuttle]);
  const van = population.actors.find(actor => actor.kind === 'parkedVehicle');
  const moving = population.actors.find(actor => actor.kind === 'serviceVehicle');
  assert.ok(van); assert.ok(moving); assert.notEqual(van.pathId, moving.pathId);
  assert.equal(population.actors.some(actor => actor.kind === 'serviceVehicle' && actor.pathId === van.pathId), false);
  assert.equal(population.paths.find(path => path.id === van.pathId)?.lengthMetres, 1, 'parking support is a pose axis, not an invented route');
  assert.equal(buildPopulationPlan({ ...plan, props: [] }, [shuttle]).actors.some(actor => actor.kind === 'parkedVehicle'), false);
  assert.equal(buildPopulationPlan({ ...plan, populationParkingBays: [{ ...plan.populationParkingBays[0],
    halfWidthMetres: 0.9 }] }, [shuttle]).actors.some(actor => actor.kind === 'parkedVehicle'), false);
});

test('physical world keys isolate old records and remain within existing 64-character bounds', () => {
  assert.equal(populationWorldId('slice', false), 'slice');
  assert.notEqual(populationWorldId('slice', true), 'slice');
  const long = populationWorldId('x'.repeat(64), true);
  assert.ok(long.length <= 64); assert.equal(long, populationWorldId('x'.repeat(64), true));
  assert.notEqual(long, populationWorldId('y'.repeat(64), true));
});

test('only factual driveway cuts publish pedestrian priority with accepted runtime path ids', () => {
  const plan = flatPlan(), walker = { ...source('pedestrian', 'commercial', 60, 15, 20), id: 'actual-sidewalk' };
  const count = 190, radius = 15;
  const vehicle: AuthoredPopulationPath = { id: 'actual-forward-circle', role: 'traffic', district: 'commercial',
    closed: true, serviceShuttle: false, frames: Array.from({ length: count + 1 }, (_, index) => {
      const angle = index * Math.PI * 2 / count;
      return { x: Math.cos(angle) * radius, y: 0, z: 50 + Math.sin(angle) * radius,
        headingY: Math.atan2(Math.sin(-angle), Math.cos(-angle)), distanceMetres: index * 2 * radius * Math.sin(Math.PI / count),
        sourceSegmentId: 'lane', halfWidthMetres: 3 };
    }) };
  const corners = [{ x: 13, y: 0, z: 45 }, { x: 17, y: 0, z: 45 },
    { x: 17, y: 0, z: 55 }, { x: 13, y: 0, z: 55 }];
  plan.populationGroundSources = [{ id: 'actual-driveway', purpose: 'driveway', hostSegmentIds: ['lane'],
    groundPatchIds: [], polygons: [corners] }];
  plan.populationCrossings = [{ id: 'actual-driveway-crossing', sourceId: 'actual-driveway', corners,
    priority: 'pedestrian', pedestrianPathIds: [walker.id, 'absent-sidewalk'], vehiclePathIds: [vehicle.id, 'absent-car'] }];
  const population = buildPopulationPlan(plan, [walker, vehicle]);
  assert.equal(population.crossings?.length, 1);
  assert.deepEqual(population.crossings![0].pedestrianPathIds, [`${walker.id}/clear-0`]);
  assert.deepEqual(population.crossings![0].vehiclePathIds, [`${vehicle.id}/clear-0`]);
  assert.equal(population.crossings![0].priority, 'pedestrian');
  assert.equal(buildPopulationPlan({ ...plan, populationGroundSources: [{ ...plan.populationGroundSources[0],
    purpose: 'footpath' }] }, [walker, vehicle]).crossings, undefined);

  const installed = { ...vehicle, id: 'living-ground/actual-forward-circle' };
  const stale = { ...plan, populationGroundReport: { acceptedTrafficLoops: ['drafted-but-absent'],
    missingTrafficDistricts: [] as District[], acceptedParkingBays: ['invented-bay'], rejected: [], gaps: [] } };
  const finished = buildPopulationPlan(stale, [installed]);
  assert.deepEqual(finished.report.groundSupplement!.acceptedTrafficLoops, [`${installed.id}/clear-0`]);
  assert.deepEqual(finished.report.groundSupplement!.acceptedParkingBays, []);
  const protectedPlan = { ...stale, hazards: [{ id: 'original-deep-hole', kind: 'potholeDeep' as const,
    centre: { x: 0, y: 0, z: 50 }, radius: 30 }] };
  assert.deepEqual(buildPopulationPlan(protectedPlan, [installed]).report.groundSupplement!.acceptedTrafficLoops, [],
    'a report cannot retain a traffic loop rejected by the final physical plan');
});

test('actual-normal footprints keep flat paths narrow and refuse a graded head/roof overhang', () => {
  const flat = flatPlan();
  const narrow = { ...source(), frames: source().frames.map(frame => ({ ...frame, halfWidthMetres: 0.72 })) };
  assert.ok(buildPopulationPlan(flat, [narrow]).paths.length > 0);
  const sampler = new PlanTerrainSampler(flat);
  const [span] = populationSpanFootprints(flat, sampler, narrow.frames[0], narrow.frames[1], 'pedestrian');
  assert.ok(Math.abs(Math.max(...span.polygon.map(point => point.x))
    - R.pedestrianRadiusMetres - R.staticClearanceMetres) < 1e-9);
  const graded = flatPlan();
  graded.heightfield.heights = graded.heightfield.heights.map((_, index) =>
    (graded.heightfield.originX + index % graded.heightfield.columns) * 0.10);
  const population = buildPopulationPlan(graded, [narrow]);
  assert.equal(population.paths.length, 0);
  assert.ok(population.report.rejected.some(item => item.reason === 'narrow-band'));
  const wall = { ...body(-0.72, 50, 0.015, 1), centre: { x: -0.72, y: 1.85, z: 50 },
    halfExtents: { x: 0.015, y: 0.05, z: 1 } };
  assert.ok(buildPopulationPlan({ ...flat, solids: [wall] }, [source()]).paths.some(path => path.lengthMetres > 55));
  assert.ok(buildPopulationPlan({ ...graded, solids: [wall] }, [source()])
    .report.rejected.some(item => item.reason === 'solid'));
});

test('commercial path ids cannot exhaust meaningful supported park, residential and worker activity', () => {
  const plan = flatPlan();
  plan.props = [
    { kind: 'bench', position: { x: 73, y: 0, z: 45 }, rotationY: 0, scale: 1 },
    { kind: 'building', look: 'industrial', position: { x: 97, y: 0, z: 45 }, rotationY: 0,
      scale: 1, size: { x: 6, y: 6, z: 12 } },
  ];
  const commercial = Array.from({ length: 30 }, (_, index) => ({
    ...source('pedestrian', 'commercial', 60, -70 + index * 2), id: `a-commercial-${index}`,
  }));
  const residential = { ...source('pedestrian', 'residential', 60, 50), id: 'y-residential' };
  const park = { ...source('pedestrian', 'park', 60, 70), id: 'z-park' };
  const worker = { ...source('pedestrian', 'industrial', 60, 90), id: 'zz-industrial' };
  const inputs = [...commercial, residential, park, worker];
  const before = planDigest(plan);
  const population = buildPopulationPlan(plan, inputs);
  const districtOf = (pathId: string) => population.paths.find(path => path.id === pathId)!.district;
  assert.ok(population.actors.some(actor => actor.kind === 'walker' && districtOf(actor.pathId) === 'commercial'));
  assert.ok(population.actors.some(actor => actor.kind === 'walker' && districtOf(actor.pathId) === 'residential'));
  assert.ok(population.actors.some(actor => actor.kind === 'jogger' && districtOf(actor.pathId) === 'park'));
  assert.equal(population.actors.filter(actor => actor.kind === 'social').length, 2);
  assert.ok(population.actors.some(actor => actor.kind === 'worker' && districtOf(actor.pathId) === 'industrial'));
  assert.ok(population.actors.filter(actor => ['walker', 'jogger', 'social', 'worker'].includes(actor.kind)).length <= R.maximumPeople);
  assert.deepEqual(population, buildPopulationPlan(plan, [...inputs].reverse()));
  assert.equal(planDigest(plan), before);
});

test('short factual walks have activity, and an adjacent real worker/service approach clears actual hulls', () => {
  const plan = flatPlan();
  const short = { ...source('pedestrian', 'residential', 9, -20, 40), id: 'short-walk' };
  assert.ok(buildPopulationPlan(plan, [short]).actors.some(actor => actor.kind === 'walker'));
  plan.props = [{ kind: 'building', look: 'industrial', position: { x: 12, y: 0, z: 46 },
    rotationY: 0, scale: 1, size: { x: 6, y: 6, z: 12 } }];
  const worker = { ...source('pedestrian', 'industrial', 12, 6, 40), id: 'worker-approach' };
  const service = { ...source('service', 'industrial', 12, 4, 40), id: 'service-approach', serviceShuttle: true };
  const population = buildPopulationPlan(plan, [worker, service]);
  assert.ok(population.actors.some(actor => actor.kind === 'worker'));
  assert.ok(population.actors.some(actor => actor.kind === 'serviceVehicle'));
  assert.equal(buildPopulationPlan({ ...plan, props: [] }, [service]).actors.length, 0,
    'a removed warehouse cannot leave invented service activity');
});
