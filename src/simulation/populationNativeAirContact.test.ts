/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EUC, PHYSICS, POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import { PopulationSimulation, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { certifiedReactionTrajectoryClear } from './populationPhysicalReactionClearance.ts';
import type { TerrainSampler } from './world.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (value: EucController) => { const out = createPose(); value.writePose(out); return out; };
const body = (p: RiderOccupancyPrism): PopulationFootprint => ({ x: p.x, z: p.z, headingY: p.headingY, halfWidthMetres: p.halfWidth,
  halfLengthMetres: p.halfLength, minY: p.baseY, maxY: p.topY, velocityX: 0, velocityZ: 0 });
function signedGap(first: PopulationFootprint, second: PopulationFootprint) {
  const axes = (h: number) => [{ x: Math.cos(h), z: -Math.sin(h) }, { x: Math.sin(h), z: Math.cos(h) }];
  const support = (p: PopulationFootprint, n: { x: number; z: number }) => { const [x, z] = axes(p.headingY);
    return Math.abs(x.x * n.x + x.z * n.z) * p.halfWidthMetres + Math.abs(z.x * n.x + z.z * n.z) * p.halfLengthMetres; };
  return Math.max(first.minY - second.maxY, second.minY - first.maxY,
    ...[...axes(first.headingY), ...axes(second.headingY)].map(n => Math.abs((first.x - second.x) * n.x + (first.z - second.z) * n.z) - support(first, n) - support(second, n)));
}
/** A real charged source hop, with its observed takeoff edge. No private phase writes. */
function airborne() {
  const value = new EucController(flat); value.reset(undefined, 6);
  for (let tick = 0; tick < Math.ceil((EUC.hopChargeSeconds + .1) / DT); tick += 1) value.step(DT, { ...NEUTRAL_ACTIONS, crouch: true });
  value.step(DT, { ...NEUTRAL_ACTIONS, crouch: true, hop: true });
  let tookOff = value.tookOff;
  for (let tick = 0; tick < 80 && !tookOff; tick += 1) { value.step(DT, NEUTRAL_ACTIONS); tookOff ||= value.tookOff; }
  assert.equal(tookOff, true); assert.equal(value.snapshot().grounded, false); assert.ok(value.lastHopCharge > .99); assert.equal(value.crashed, false);
  return value;
}
function parkedPlan(z: number): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'phase-air', installedWorldId: 'phase-air/living-r1', contentDigest: 'phase-air', anchors: [],
    paths: [{ id: 'parked', role: 'traffic', district: 'commercial', points: [-1, 1].map((offset, index) => ({ x: 0, y: 0, z: z + offset, headingY: 0, distanceMetres: index * 2, surface: 'pavement', sourceSegmentId: 'native-phase-air' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'parked', kind: 'parkedVehicle', pathId: 'parked', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function nativeAirRide(response: boolean) {
  const value = airborne(), verticalReference = airborne(), first = poseOf(value), serial = value.discontinuitySerial, beforeLandings = value.snapshot().landings,
    token = value.prepareStep(DT, NEUTRAL_ACTIONS), unprotected = createPose(); value.writePreparedPose(token, unprotected);
  const a = buildRiderOccupancyEnvelope(first, RIDER_CONTACT), b = buildRiderOccupancyEnvelope(unprotected, RIDER_CONTACT),
    firstFront = Math.max(...Object.values(a).map(p => p.z + p.halfLength)), nextFront = Math.max(...Object.values(b).map(p => p.z + p.halfLength)), growth = nextFront - firstFront;
  assert.ok(growth > .006, 'actual native airborne body has a strict next-step approach');
  const population = new PopulationSimulation(parkedPlan(firstFront + growth / 2 + 2.4), flat), actor = population.snapshot().actors[0].footprint;
  assert.ok(Object.values(a).every(part => signedGap(body(part), actor) > 0));
  assert.ok(Object.values(b).some(part => signedGap(body(part), actor) < 0), 'actual source body, not an inflated certificate, supplies the unprotected collision');
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, first), notes: unknown[] = [], queries: string[] = [], rows: unknown[] = [];
  let committedSideContact: { correctionX: number; correctionZ: number; priorSpeed: number; speed: number; blocked: boolean; fullPathClear: boolean; yPreserved: boolean; verticalVelocityPreserved: boolean; refused: boolean; impact: number } | null = null;
  const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    ...(response ? { ragObstacleBodies: () => population.snapshot().actors.map(actor => actor.footprint) } : {}),
    canPlace: request => certificates.components('owner', request.occupancyPose, request.occupancyPose, 0, 'placement').every(component => population.recoveryClearance(component.at(0), [], [], 0).clear),
    didPlace: request => notes.push(request), canReact: request => { queries.push(request.kind);
      return populationPhysicalReactionAllowed({ ownerId: 'owner', request, population, certificates, occupants: [], reservations: [] }); } };
  value.setDynamicWorld(port); let refused = 0, advanced = 0, touchedDown = 0, maximumY = first.y, ticks = 0;
  for (; ticks < 180 && (ticks === 0 || !value.snapshot().grounded); ticks += 1) {
    const previous = poseOf(value), current = createPose(), nativeBefore = value.snapshot(), next = value.prepareStep(DT, NEUTRAL_ACTIONS), metadata = body(buildRiderOccupancyEnvelope(previous, RIDER_CONTACT).human);
    population.step(DT, [{ id: 'owner', kind: 'human', previous: metadata, current: metadata }]);
    const seat = { id: 'owner', kind: 'human' as const, controller: value, pose: current }, result = commitPopulationPhysicalTransaction({ population, certificates,
      seats: [seat], preparedSeats: [{ ...seat, token: next, world: port }], before: new Map([['owner', { pose: previous, serial: value.discontinuitySerial }]]), dt: DT, reservations: [],
      bodyFromPose: p => body(buildRiderOccupancyEnvelope(p, RIDER_CONTACT).human), ...(response ? { contactResponse: 'yield' as const } : {}) });
    refused += Number(result.resolution.refusedOwnerIds.includes('owner')); advanced += result.contactResponses.filter(item => item.inputAdvanced).length;
    const actual = poseOf(value), snapshot = value.snapshot(), gaps = Object.values(buildRiderOccupancyEnvelope(actual, RIDER_CONTACT)).map(part => signedGap(body(part), actor));
    assert.ok(gaps.every(gap => gap >= 0), `accepted actual native air body must stay clear at tick ${ticks}: ${gaps}`);
    maximumY = Math.max(maximumY, actual.y); touchedDown += Number(value.touchedDown);
    if (response && ticks === 0) {
      const independentProof = new PopulationPhysicalCertificates(RIDER_CONTACT, previous), path = independentProof.components('actual-committed-air', previous, actual, DT, 'moving');
      committedSideContact = { correctionX: actual.x - unprotected.x, correctionZ: actual.z - unprotected.z,
        priorSpeed: nativeBefore.speed, speed: snapshot.speed, blocked: snapshot.blocked,
        fullPathClear: path.every(component => certifiedReactionTrajectoryClear(component, actor)),
        yPreserved: actual.y === unprotected.y, verticalVelocityPreserved: snapshot.verticalVelocity === verticalReference.snapshot().verticalVelocity - PHYSICS.gravity * DT,
        refused: result.resolution.refusedOwnerIds.includes('owner'), impact: value.obstacleImpact };
    }
    if (response) {
      verticalReference.step(DT, NEUTRAL_ACTIONS);
      assert.ok(Math.abs(actual.y - poseOf(verticalReference).y) < 1e-12, 'contact side law preserves the real native vertical trajectory');
      assert.ok(Math.abs(snapshot.verticalVelocity - verticalReference.snapshot().verticalVelocity) < 1e-12);
      if (!snapshot.grounded) assert.ok(Math.abs(snapshot.airTime - nativeBefore.airTime - DT) < 1e-12, 'actual native air clock consumes full dt once');
    }
    if (ticks < 3 || ticks % 40 === 0 || snapshot.grounded) rows.push({ tick: ticks, airTime: snapshot.airTime, y: actual.y, speed: snapshot.speed, grounded: snapshot.grounded,
      response: result.contactResponses, gaps });
  }
  return { value, first, serial, beforeLandings, population, refused, advanced, touchedDown, maximumY, ticks, notes, queries, rows, committedSideContact };
}
test('actual charged flight beside parked body retains full native ascent/gravity and one terrain landing; old exact-start hold fails the same flight', () => {
  const good = nativeAirRide(true), bad = nativeAirRide(false);
  console.log(JSON.stringify({ prototype: 'native-phase-air-v8', good: { ticks: good.ticks, grounded: good.value.snapshot().grounded, crashed: good.value.crashed,
    landings: good.value.snapshot().landings, touchedDown: good.touchedDown, maximumY: good.maximumY, refused: good.refused, advanced: good.advanced, clock: good.population.clockSeconds, committedSideContact: good.committedSideContact, rows: good.rows },
    bad: { ticks: bad.ticks, grounded: bad.value.snapshot().grounded, maximumY: bad.maximumY, landings: bad.value.snapshot().landings, clock: bad.population.clockSeconds, rows: bad.rows } }));
  assert.ok(good.committedSideContact, 'real first committed native contact provenance must be captured');
  assert.ok(good.committedSideContact.priorSpeed > 1 && good.committedSideContact.correctionZ < -.005,
    'actual proactive side response must differ from the independently computed unprotected native full step');
  assert.equal(good.committedSideContact.speed, 0); assert.equal(good.committedSideContact.blocked, true);
  assert.equal(good.committedSideContact.fullPathClear, true, 'the actual committed proactive response must pass SAME complete continuous wheel/human proof');
  assert.equal(good.committedSideContact.yPreserved, true); assert.equal(good.committedSideContact.verticalVelocityPreserved, true);
  assert.equal(good.committedSideContact.refused, false, 'a proven full native contact step is accepted before whole-step hold');
  assert.equal(good.committedSideContact.impact, 0, 'owned side yield does not invent an attributed obstacle impact'); assert.equal(good.value.crashed, false, 'side contact never fabricates a native crash');
  assert.equal(good.value.snapshot().grounded, true); assert.equal(good.value.snapshot().position.y, 0, 'native sampled ground, not actor roof, owns touchdown');
  assert.ok(good.maximumY > good.first.y + .1, 'body actually flies, not a clocks-only held pose');
  assert.equal(good.touchedDown, 1); assert.equal(good.value.snapshot().landings, good.beforeLandings + 1);
  assert.equal(good.value.discontinuitySerial, good.serial); assert.equal(good.notes.length, 0);
  assert.ok(Math.abs(good.population.clockSeconds - good.ticks * DT) < 1e-12);
  assert.equal(bad.value.snapshot().grounded, false); assert.equal(bad.value.snapshot().landings, bad.beforeLandings);
  assert.ok(bad.maximumY < bad.first.y + .02, 'counterfactual unchanged start cannot fly or land through its refused native proposal');
  assert.equal(bad.value.discontinuitySerial, bad.serial); assert.equal(bad.notes.length, 0);
});
test('distant actor port preserves complete charged airborne clear-space pose/state/edge byte parity', () => {
  const candidate = airborne(), native = airborne();
  candidate.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    ragObstacleBodies: () => [{ x: 1000, z: 1000, headingY: 0, halfWidthMetres: 1.02, halfLengthMetres: 2.4, minY: 0, maxY: 2.8, velocityX: 0, velocityZ: 0 }] });
  for (let tick = 0; tick < 180; tick += 1) {
    candidate.step(DT, NEUTRAL_ACTIONS); native.step(DT, NEUTRAL_ACTIONS);
    assert.deepEqual(poseOf(candidate), poseOf(native)); assert.deepEqual(candidate.snapshot(), native.snapshot());
    assert.deepEqual([candidate.tookOff, candidate.touchedDown, candidate.hopped, candidate.flightIndex], [native.tookOff, native.touchedDown, native.hopped, native.flightIndex]);
  }
});
