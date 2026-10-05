/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** UNEXECUTED source proposal. Native source/collider arithmetic controls;
 * sampled checks are adversarial crosschecks, not the whole-window proof. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan, BoxCollider, Hazard } from '../level/plan.ts';
import type { PopulationPath } from '../level/populationPlan.ts';
import { GROUND_CERTIFICATE as C, POPULATION as R } from '../data/tuning.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { createGroundSample, type GroundSupportWindow, type TerrainSampler } from './world.ts';
import { physicalPopulationHull, transformPopulationHull } from '../shared/populationHull.ts';
import { populationSupportTargets } from '../shared/populationSupport.ts';
import { routeAnticipation, sourceYawSupport } from './populationRouteAnticipation.ts';
import { prepareFlatRouteCertificate } from './populationFlatRouteCertificate.ts';
import type { PopulationFootprint } from './population.ts';

const hull = { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 };
function nativePlan(size = 51): LevelPlan {
  return { id: 'source-window-fixture', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: -25, originZ: -25, columns: size, rows: size, spacing: 1,
      heights: Array.from({ length: size * size }, () => 0),
      surfaces: Array.from({ length: (size - 1) ** 2 }, () => 'pavement' as const) } };
}
const window: GroundSupportWindow = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
const box = (x: number, z: number, top = 1): BoxCollider => ({ centre: { x, y: top - .1, z },
  halfExtents: { x: .1, y: .1, z: .1 }, rotationY: .7, surface: 'brick' });
const hazard = (id: string, x: number, z: number): Hazard =>
  ({ id, kind: 'potholeShallow', centre: { x, y: 0, z }, radius: .05 });
const body = (x: number, z: number, headingY = 0): PopulationFootprint => ({ x, z, headingY,
  halfWidthMetres: .42, halfLengthMetres: .42, minY: 0, maxY: 1.9, velocityX: 0, velocityZ: 0 });
function straight(yaw = 0, length = 12): PopulationPath {
  return { id: 'real-linear-source', role: 'service', district: 'industrial', closed: false,
    serviceShuttle: true, lengthMetres: length, clearanceRadiusMetres: 5, connections: [],
    points: [0, length].map(distanceMetres => ({ x: Math.sin(yaw) * distanceMetres,
      z: Math.cos(yaw) * distanceMetres, y: 0, headingY: yaw, distanceMetres,
      surface: 'pavement', sourceSegmentId: 'original' })) };
}
function sourceSpans(points: readonly (readonly [number, number])[], closed = false): PopulationPath {
  let length = 0;
  const frames = points.map(([x, z], index) => {
    if (index) length += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
    const next = points[index + 1] ?? (closed ? points[1] : points[index - 1]);
    const headingY = index + 1 < points.length ? Math.atan2(next[0] - x, next[1] - z)
      : closed ? Math.atan2(points[1][0] - points[0][0], points[1][1] - points[0][1])
      : Math.atan2(x - next[0], z - next[1]);
    return { x, y: 0, z, headingY, distanceMetres: length, surface: 'pavement' as const, sourceSegmentId: 'original-span' };
  });
  return { ...straight(), id: 'explicit-original-spans', points: frames, lengthMetres: length,
    closed, serviceShuttle: !closed, role: closed ? 'traffic' : 'service' };
}
function scan(path: PopulationPath, sampler: TerrainSampler | undefined, blocker: PopulationFootprint,
  currentHeadingY = path.points[0].headingY) {
  return routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: path.lengthMetres,
    fullHullAxisBoundMetres: Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres),
    gapMetres: R.vehicleWaitingGapMetres, blockers: [{ id: 'actual-body', from: blocker, to: blocker, pad: .25 }],
    ...(sampler ? { flatSupport: { sampler, hull, currentHeadingY, maximumNativeStepTravelMetres: 5.5 / 120,
      currentFootprint: physicalPopulationHull(path.points[0].x, 0, path.points[0].z, currentHeadingY, 0, 1, 0, hull) } } : {}) });
}

test('whole flat native window is detached/frozen and agrees with real corners and tyre support targets', () => {
  const sampler = new PlanTerrainSampler(nativePlan()), request = { ...window };
  const proof = sampler.certifyFlatSupportWindow(request);
  assert.equal(proof.status, 'flat'); assert.equal(proof.height, 0);
  assert.equal(Object.isFrozen(proof), true); assert.equal(Object.isFrozen(proof.bounds), true);
  request.minX = -400; assert.equal(proof.bounds.minX, -2);
  const sample = createGroundSample();
  for (const yaw of [-1.7, 0, .43, Math.PI / 4, 2.4]) {
    const reachX = sourceYawSupport(hull.halfWidthMetres, hull.halfLengthMetres, yaw, yaw);
    const reachZ = sourceYawSupport(hull.halfLengthMetres, hull.halfWidthMetres, yaw, yaw);
    assert.equal(sampler.certifyFlatSupportWindow({ minX: -reachX, maxX: reachX, minZ: -reachZ, maxZ: reachZ }).status, 'flat');
    const geometry = transformPopulationHull(0, 0, 0, yaw, 0, 1, 0, hull);
    const targets = populationSupportTargets({ kind: 'serviceVehicle', appearanceIndex: 0, x: 0, y: 0, z: 0,
      headingY: yaw, hull, speedMetresPerSecond: 1, gaitDistanceMetres: 1, activity: 'driving',
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0 });
    for (const point of [...geometry.lowerCorners, ...targets.tyres!]) {
      assert.ok(Math.abs(point.x) <= reachX + 1e-12 && Math.abs(point.z) <= reachZ + 1e-12);
      sampler.sampleGround(point.x, point.z, sample); assert.equal(sample.height, 0); assert.deepEqual(sample.normal, { x: 0, y: 1, z: 0 });
    }
  }
});

test('same endpoint heights/normals do not certify a hidden native triangle ridge', () => {
  const plan = nativePlan(), heights = [...plan.heightfield.heights]; heights[25 * 51 + 25] = .6; plan.heightfield.heights = heights;
  const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  const a = { ...sampler.sampleGround(-2, 0, sample), normal: { ...sample.normal } };
  const b = { ...sampler.sampleGround(2, 0, sample), normal: { ...sample.normal } };
  assert.equal(a.height, b.height); assert.deepEqual(a.normal, b.normal);
  assert.equal(a.normal.y, 1, 'known-bad endpoint-only flat policy would accept');
  assert.equal(sampler.certifyFlatSupportWindow(window).reason, 'nonflat-source-triangle');
});

test('closed grid/diagonal edge includes adjacent triangle ownership and refuses surround', () => {
  const plan = nativePlan(), heights = [...plan.heightfield.heights]; heights[25 * 51 + 23] = .2; plan.heightfield.heights = heights;
  const sampler = new PlanTerrainSampler(plan);
  // x=-1 is the exact cell edge, native +X owner flat, left neighbor not flat.
  assert.equal(sampler.sampleGround(-1, 0, createGroundSample()).normal.y, 1);
  assert.equal(sampler.certifyFlatSupportWindow({ minX: -1, maxX: 0, minZ: 0, maxZ: .2 }).status, 'unsupported');
  assert.equal(sampler.certifyFlatSupportWindow({ ...window, minX: -25.01 }).reason, 'surround-or-invalid-field');
  assert.equal(new PlanTerrainSampler(nativePlan()).certifyFlatSupportWindow({ minX: -25, maxX: -24, minZ: -25, maxZ: -24 }).status, 'flat');
});

test('higher local solid between clear endpoints refuses; equal/buried top and far solid do not', () => {
  const plan = nativePlan(); plan.solids = [box(0, 0)];
  const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  assert.equal(sampler.sampleGround(-2, 0, sample).height, 0); assert.equal(sampler.sampleGround(2, 0, sample).height, 0);
  assert.equal(sampler.certifyFlatSupportWindow(window).reason, 'higher-solid-top');
  const clear = nativePlan(); clear.solids = [box(0, 0, 0), box(0, 0, -1), box(15, 15)];
  assert.equal(new PlanTerrainSampler(clear).certifyFlatSupportWindow(window).status, 'flat');
});

test('tyre/lower-corner corridor cannot inherit centerline-only flat proof', () => {
  const plan = nativePlan(), heights = [...plan.heightfield.heights]; heights[28 * 51 + 27] = .5; plan.heightfield.heights = heights;
  const sampler = new PlanTerrainSampler(plan), path = straight();
  assert.equal(sampler.certifyFlatSupportWindow({ minX: 0, maxX: 0, minZ: 0, maxZ: 12 }).status, 'flat');
  const result = scan(path, sampler, body(3, 4));
  assert.equal(result.flatSpans, 0); assert.equal(result.unknownSpans, 1);
  assert.equal(result.blockedBy, 'actual-body', 'real off-center support grade keeps conservative refusal');
});

test('paving labels preserve geometry; touched authored pothole/spill each refuse certificate', () => {
  const plan = nativePlan(), surfaces = [...plan.heightfield.surfaces]; surfaces[25 * 50 + 25] = 'brick'; plan.heightfield.surfaces = surfaces;
  plan.groundSurfacePatches = [{ id: 'geometry-neutral', surface: 'wood', sourceSurface: 'brick',
    triangles: [{ cell: 25 * 50 + 25, vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }] }] }];
  const sampler = new PlanTerrainSampler(plan);
  assert.equal(sampler.sampleGround(.8, .2, createGroundSample()).surface, 'wood');
  assert.equal(sampler.certifyFlatSupportWindow(window).status, 'flat');
  for (const kind of ['potholeShallow', 'spill'] as const) {
    const blocked = nativePlan(); blocked.hazards = [{ ...hazard('native', 0, 0), kind }];
    assert.equal(new PlanTerrainSampler(blocked).certifyFlatSupportWindow(window).reason, 'authored-hazard');
  }
});

test('field/collider/hazard work caps return overflow, never a certified prefix', () => {
  const flat = new PlanTerrainSampler(nativePlan());
  assert.equal(flat.certifyFlatSupportWindow({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }).reason, 'field-cell-cap');
  const dense = nativePlan(); dense.solids = Array.from({ length: C.maximumColliderReferences + 1 }, () => box(0, 0, -1));
  const collider = new PlanTerrainSampler(dense).certifyFlatSupportWindow(window);
  assert.equal(collider.status, 'overflow'); assert.equal(collider.colliderReferences, C.maximumColliderReferences);
  const hazards = nativePlan(); hazards.hazards = Array.from({ length: C.maximumHazardReferences + 1 }, (_, index) => hazard(`far-${index}`, 0, 20));
  const result = new PlanTerrainSampler(hazards).certifyFlatSupportWindow(window);
  assert.equal(result.status, 'overflow'); assert.equal(result.hazardReferences, C.maximumHazardReferences);
  assert.ok(result.fieldCells <= C.maximumFieldCells && result.gridCells <= C.maximumGridCells);
});

test('certified axis and diagonal lanes keep actual narrow lateral support beside sidewalks', () => {
  const sampler = new PlanTerrainSampler(nativePlan());
  for (const yaw of [0, Math.PI / 4]) {
    const path = straight(yaw), x = Math.sin(yaw) * 5 + Math.cos(yaw) * 3,
      z = Math.cos(yaw) * 5 - Math.sin(yaw) * 3, sidewalk = body(x, z, yaw);
    assert.equal(scan(path, undefined, sidewalk).blockedBy, 'actual-body', 'frozen unknown-grade fallback remains conservative');
    const refined = scan(path, sampler, sidewalk);
    assert.equal(refined.flatSpans, 1); assert.equal(refined.blockedBy, null);
    const inside = body(Math.sin(yaw) * 5 + Math.cos(yaw) * 1.4, Math.cos(yaw) * 5 - Math.sin(yaw) * 1.4, yaw);
    assert.equal(scan(path, sampler, inside).blockedBy, 'actual-body', 'narrowing never drops an actual lane obstruction');
  }
});

test('continuous yaw extrema and true source bend survive narrow flat geometry', () => {
  const radius = Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres), peak = Math.atan2(hull.halfLengthMetres, hull.halfWidthMetres);
  const endpoints = Math.max(hull.halfWidthMetres, hull.halfLengthMetres);
  assert.ok(radius > endpoints); assert.equal(sourceYawSupport(hull.halfWidthMetres, hull.halfLengthMetres, 0, Math.PI / 2), radius);
  const path = { ...straight(), points: straight().points.map((point, index) => ({ ...point, headingY: index ? Math.PI / 2 : 0 })) };
  const blocker = body(radius + .42 + .9 - .01, 5);
  assert.equal(scan(path, new PlanTerrainSampler(nativePlan()), blocker).blockedBy, 'actual-body');
  // Independent actual native flat prism at the interior critical yaw reaches
  // further than an endpoint-only bound. No tolerance is used for acceptance.
  const native = physicalPopulationHull(0, 0, 0, peak, 0, 1, 0, hull);
  assert.ok(sourceYawSupport(native.halfWidthMetres, native.halfLengthMetres, peak, peak) > endpoints);
});

test('unknown sampler/raised support/overflow keeps conservative fallback and source clocks untouched', () => {
  const plan = nativePlan(); plan.solids = [box(.5, 5)];
  const path = straight(), sidewalk = body(3, 5), baseline = scan(path, undefined, sidewalk);
  const unknown = scan(path, new PlanTerrainSampler(plan), sidewalk);
  assert.equal(unknown.blockedBy, baseline.blockedBy); assert.ok(unknown.availableTravelMetres <= baseline.availableTravelMetres,
    'full native grown-gap fallback may conservatively stop earlier than frozen scalar-gap observer');
  assert.equal(unknown.flatSpans, 0); assert.equal(unknown.unknownSpans, 1);
  const originalSampler = new PlanTerrainSampler(nativePlan());
  assert.equal(scan(path, { sampleGround: originalSampler.sampleGround.bind(originalSampler), raycast: () => null }, sidewalk).blockedBy, baseline.blockedBy);
  const before = JSON.stringify(path); scan(path, new PlanTerrainSampler(nativePlan()), sidewalk); assert.equal(JSON.stringify(path), before);
});

test('native grade roof shift stays unsupported and a current-heading bridge cannot silently narrow', () => {
  const grade = nativePlan(); grade.heightfield.heights = grade.heightfield.heights.map((_, index) => (index % 51) * .1);
  assert.equal(new PlanTerrainSampler(grade).certifyFlatSupportWindow(window).status, 'unsupported');
  const tilted = physicalPopulationHull(0, 0, 0, 0, -.1, 1, 0, hull);
  assert.ok(Math.abs(tilted.x) + tilted.halfWidthMetres > hull.halfWidthMetres);
  assert.equal(scan(straight(), new PlanTerrainSampler(nativePlan()), body(3.5, 0), Math.PI / 2).blockedBy, 'actual-body');
});

test('native grow gap belongs to both half-dimensions through a continuous turn', () => {
  const path = { ...straight(0, 10), points: straight(0, 10).points.map((point, index) => ({ ...point, headingY: index ? Math.PI / 4 : 0 })) };
  const nativeHull = { halfWidthMetres: 1, halfLengthMetres: 2, heightMetres: 2.8 };
  const blocker = { ...body(3, 10.7), halfWidthMetres: .05, halfLengthMetres: .05 };
  const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
  const localX = blocker.x * c - (blocker.z - 10) * s, localZ = blocker.x * s + (blocker.z - 10) * c;
  assert.ok(Math.abs(localX) < nativeHull.halfWidthMetres + .65 && Math.abs(localZ) < nativeHull.halfLengthMetres + .65);
  assert.ok(sourceYawSupport(1, 2, 0, Math.PI / 4) + .65 + .05 * Math.SQRT2 < blocker.x,
    'known-bad scalar-gap projection would incorrectly reject this native grown-box contact');
  const result = routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: 10,
    fullHullAxisBoundMetres: Math.hypot(1, 2, 2.8), gapMetres: .65,
    blockers: [{ id: 'native-grown-end', from: blocker, to: blocker }],
    flatSupport: { sampler: new PlanTerrainSampler(nativePlan()), hull: nativeHull, currentHeadingY: 0, maximumNativeStepTravelMetres: 5.5 / 120,
      currentFootprint: physicalPopulationHull(0, 0, 0, 0, 0, 1, 0, nativeHull) } });
  assert.equal(result.blockedBy, 'native-grown-end');
});

test('actual held tilted/off-source native frame refuses first and later flat narrowing', () => {
  const path = straight(), sampler = new PlanTerrainSampler(nativePlan()), blocker = body(3, 5);
  for (const actual of [physicalPopulationHull(.5, 0, 0, 0, 0, 1, 0, hull),
    physicalPopulationHull(0, 0, 0, 0, -.1, 1, 0, hull)]) {
    const result = routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: 12,
      fullHullAxisBoundMetres: Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres),
      gapMetres: R.vehicleWaitingGapMetres, blockers: [{ id: 'held-native', from: blocker, to: blocker }],
      flatSupport: { sampler, hull, currentHeadingY: actual.headingY, currentFootprint: actual, maximumNativeStepTravelMetres: 5.5 / 120 } });
    assert.equal(result.flatSpans, 0); assert.equal(result.blockedBy, 'held-native');
  }
});

test('flat refinement still scans the genuine bend, not a global endpoint chord', () => {
  const sampler = new PlanTerrainSampler(nativePlan()), actual = sourceSpans([[0, 0], [0, 8], [8, 8]]);
  const wrongChord = sourceSpans([[0, 0], [8, 8]]), arcBody = body(0, 5), chordBody = body(5, 3);
  assert.equal(scan(actual, sampler, arcBody).blockedBy, 'actual-body');
  assert.equal(scan(wrongChord, sampler, arcBody).blockedBy, null, 'known-bad global chord misses real source lane');
  assert.equal(scan(actual, sampler, chordBody).blockedBy, null);
  assert.equal(scan(wrongChord, sampler, chordBody).blockedBy, 'actual-body');
});

test('real closed seam and reverse service retain original source spans and full body support', () => {
  const sampler = new PlanTerrainSampler(nativePlan()), loop = sourceSpans([[0, 0], [0, 8], [8, 8], [8, 0], [0, 0]], true);
  const currentYaw = -Math.PI / 2 + Math.PI / 2 * 7.5 / 8;
  const wrapped = routeAnticipation({ path: loop, distanceMetres: 31.5, direction: 1, travelMetres: 4,
    fullHullAxisBoundMetres: Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres), gapMetres: R.vehicleWaitingGapMetres,
    blockers: [{ id: 'after-seam', from: body(0, 6), to: body(0, 6), pad: .25 }],
    flatSupport: { sampler, hull, currentHeadingY: currentYaw, maximumNativeStepTravelMetres: 5.5 / 120,
      currentFootprint: physicalPopulationHull(.5, 0, 0, currentYaw, 0, 1, 0, hull) } });
  assert.equal(wrapped.blockedBy, 'after-seam'); assert.ok(wrapped.spanVisits >= 2);
  const path = straight(), reverse = routeAnticipation({ path, distanceMetres: 10, direction: -1, travelMetres: 8,
    fullHullAxisBoundMetres: Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres), gapMetres: R.vehicleWaitingGapMetres,
    blockers: [{ id: 'backing-support', from: body(0, 3), to: body(0, 3) }],
    flatSupport: { sampler, hull, currentHeadingY: 0, maximumNativeStepTravelMetres: 5.5 / 120, currentFootprint: physicalPopulationHull(0, 0, 10, 0, 0, 1, 0, hull) } });
  assert.equal(reverse.blockedBy, 'backing-support'); assert.equal(reverse.flatSpans, 1);
});

test('every forecast corridor must be flat; a later hidden native plane prevents early narrowing', () => {
  const plan = nativePlan(), heights = [...plan.heightfield.heights]; heights[36 * 51 + 25] = .5; plan.heightfield.heights = heights;
  const path = sourceSpans([[0, 0], [0, 6], [0, 12]]), sampler = new PlanTerrainSampler(plan);
  assert.equal(sampler.certifyFlatSupportWindow({ minX: -1.1, maxX: 1.1, minZ: -2.5, maxZ: 8.5 }).status, 'flat');
  const result = scan(path, sampler, body(3, 2));
  assert.equal(result.flatSpans, 0); assert.equal(result.flatCertificateReason, 'nonflat-source-triangle');
  assert.equal(result.blockedBy, 'actual-body', 'known-bad per-first-span-only proof would prematurely grant the sidewalk gap');
});

test('full native epoch across source frames includes neighboring yaw and chord support with finite work', () => {
  const path = { ...sourceSpans([[0, 0], [0, 1], [1, 1]]),
    points: sourceSpans([[0, 0], [0, 1], [1, 1]]).points.map((point, index) => ({ ...point, headingY: index === 0 ? 0 : index === 1 ? .1 : Math.PI / 2 })) };
  const sampler = new PlanTerrainSampler(nativePlan()), current = physicalPopulationHull(0, 0, 0, 0, 0, 1, 0, hull);
  const proof = prepareFlatRouteCertificate({ path, distanceMetres: 0, direction: 1, travelMetres: 2,
    maximumNativeStepTravelMetres: 1.5, sampler, hull, currentFootprint: current, currentHeadingY: 0 });
  assert.equal(proof.status, 'complete'); assert.equal(proof.nativeChordReserveMetres, .75);
  assert.ok(proof.spans[0].nativeYawHigh >= Math.PI / 2 && proof.spans[0].nativeYawHigh > path.points[1].headingY,
    'one native dt crossing the next source span cannot retain endpoint-only first-span yaw');
  assert.ok(proof.neighbourVisits <= proof.sourceSpanVisits && proof.sourceSpanVisits <= R.compactAnticipationMaximumSpans);
  assert.ok(proof.fieldCells <= proof.sourceSpanVisits * C.maximumFieldCells);
  assert.equal(Object.isFrozen(proof), true); assert.equal(Object.isFrozen(proof.spans), true);
  assert.equal(prepareFlatRouteCertificate({ path, distanceMetres: 0, direction: 1, travelMetres: .01,
    maximumNativeStepTravelMetres: 1.5, sampler, hull, currentFootprint: current, currentHeadingY: 0 }).status, 'unknown');
});

test('native context overflow refuses the entire observer rather than clearing its checked source prefix', () => {
  const path = sourceSpans(Array.from({ length: R.compactAnticipationMaximumSpans + 5 }, (_, index) => [0, index * .01] as const));
  const result = scan(path, new PlanTerrainSampler(nativePlan()), body(15, 15));
  assert.equal(result.overflow, true); assert.equal(result.availableTravelMetres, 0);
  assert.equal(result.flatCertificateReason, 'native-source-context-cap');
  assert.equal(result.certificateSourceSpans, R.compactAnticipationMaximumSpans);
});

test('admitted legacy endpoint tolerance bands never become a complete flat source certificate', () => {
  const sampler = new PlanTerrainSampler(nativePlan());
  const exact = straight(), current = physicalPopulationHull(0, 0, 0, 0, 0, 1, 0, hull);
  for (const path of [
    { ...exact, points: exact.points.map((point, index) => ({ ...point, distanceMetres: index ? exact.lengthMetres - .01 : 0 })) },
    { ...exact, points: exact.points.map((point, index) => ({ ...point, distanceMetres: index ? exact.lengthMetres + .01 : 0 })) },
    { ...exact, points: exact.points.map((point, index) => ({ ...point, distanceMetres: index ? exact.lengthMetres : R.epsilon / 2 })) },
  ]) {
    const proof = prepareFlatRouteCertificate({ path, distanceMetres: 0, direction: 1, travelMetres: 12,
      maximumNativeStepTravelMetres: 5.5 / 120, sampler, hull, currentFootprint: current, currentHeadingY: 0 });
    assert.equal(proof.status, 'unknown'); assert.equal(proof.reason, 'nonexact-native-source-endpoints');
    assert.equal(proof.spans.length, 0); assert.equal(proof.fieldCells, 0);
  }
});
