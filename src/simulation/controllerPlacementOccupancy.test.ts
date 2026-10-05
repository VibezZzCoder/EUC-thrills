/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact prospective placement geometry and atomic native admission controls. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, defaultSurfaceResponses, type EucDynamicWorld, type EucPlacementRequest, type EucPose }
  from './EucController.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { buildRiderOccupancy, buildRiderOccupancyEnvelope, type RiderOccupancyPose,
  type RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import { sweepPopulationHulls, type PopulationFootprint } from './population.ts';
import type { TerrainSampler } from './world.ts';

const DT = 1 / 120;
const NY = Math.sqrt(1 - .3 * .3 - .4 * .4);
const slopedRough: TerrainSampler = { sampleGround(x, z, out) {
  out.height = 2 - .3 / NY * x - .4 / NY * z;
  out.normal.x = .3; out.normal.y = NY; out.normal.z = .4;
  out.surface = 'grass'; out.offCourse = false; return out;
}, raycast() { return null; } };
const tuning = { groundTiltPitchFollow: .7, groundTiltRollFollow: .8,
  crashRecoverEarliestSeconds: .01, crashRecoverAutoSeconds: .02 };
const surfaces = { grass: { ...defaultSurfaceResponses().grass, roughnessAmplitude: .07, roughnessWavelength: 100 } };
const start = { position: { x: .83, y: -999, z: 1.17 }, headingY: .62 };
const destination = { position: { x: 3.2, y: 999, z: -2.1 }, headingY: -.37 };
const hull = { halfWidthMetres: .1, halfLengthMetres: .1, heightMetres: 2 };
const world: EucDynamicWorld = { hull, resolveMotion: () => null };
const poseOf = (euc: EucController): EucPose => { const pose = createPose(); euc.writePose(pose); return pose; };
const physicalScalars = ['x', 'y', 'z', 'headingY', 'groundPitch', 'groundRoll', 'wheelPitch', 'rollAngle', 'riderRoll',
  'riderPitch', 'riderTurnTwist', 'technicalTurn', 'suspensionOffset', 'restFactor', 'reverseBlend', 'crouch', 'tuck',
  'attack', 'carveStance', 'airBlend', 'airHeight', 'wobbleYaw', 'wobbleRoll', 'wobbleFight', 'wobbleFootCorrection',
  'wobbleSway', 'pedalStrike', 'styleYaw', 'styleRoll', 'styleSway', 'crashBlend', 'crashLateral', 'crashForward',
  'crashDrop', 'crashTumble', 'crashRoll', 'wheelCrashSpin', 'wheelCrashLean', 'wheelCrashPop', 'ragdollBlend'] as const;
function equalPhysical(expected: RiderOccupancyPose, actual: RiderOccupancyPose): void {
  for (const key of physicalScalars) assert.equal(actual[key], expected[key], `physical occupancy channel ${key}`);
  assert.deepEqual(buildRiderOccupancy(actual, RIDER_CONTACT), buildRiderOccupancy(expected, RIDER_CONTACT));
  assert.deepEqual(buildRiderOccupancyEnvelope(actual, RIDER_CONTACT), buildRiderOccupancyEnvelope(expected, RIDER_CONTACT));
}
function prismBody(prism: RiderOccupancyPrism): PopulationFootprint {
  return { x: prism.x, z: prism.z, headingY: prism.headingY, minY: prism.baseY, maxY: prism.topY,
    halfWidthMetres: prism.halfWidth, halfLengthMetres: prism.halfLength, velocityX: 0, velocityZ: 0 };
}

// Positive assertions require the actual sloped/rough destination before equality can pass.
test('construct and accepted reset requests exactly match native destination occupancy on sloped rough ground', () => {
  const requests: EucPlacementRequest[] = [], notifications: EucPlacementRequest[] = [];
  const euc = new EucController(slopedRough, { spawn: start, tuning, surfaces,
    dynamicWorld: { ...world, canPlace(request) { requests.push(request); return true; },
      didPlace(request) { notifications.push(request); } } });
  assert.equal(requests[0].reason, 'construct'); assert.equal(notifications[0].reason, 'construct');
  const initial = poseOf(euc);
  assert.ok(Math.abs(initial.groundPitch) > .01 && Math.abs(initial.groundRoll) > .01);
  assert.ok(Math.abs(initial.suspensionOffset) > .001, 'positive destination roughness fixture');
  equalPhysical(requests[0].occupancyPose, initial); equalPhysical(notifications[0].occupancyPose, initial);
  assert.equal(initial.y, slopedRough.sampleGround(start.position.x, start.position.z,
    { height: 0, normal: { x: 0, y: 0, z: 0 }, surface: 'pavement', offCourse: false }).height,
  'spawn.position.y is not the accepted wheel ground height');
  assert.equal(euc.reset(destination, 12), true);
  const accepted = poseOf(euc);
  assert.equal(requests[1].reason, 'reset'); assert.equal(requests[1].initialSpeedMetresPerSecond, 12);
  assert.equal(accepted.x, destination.position.x); assert.equal(accepted.z, destination.position.z);
  equalPhysical(requests[1].occupancyPose, accepted); equalPhysical(notifications[1].occupancyPose, accepted);
  assert.equal(requests[1].discontinuitySerial, notifications[1].discontinuitySerial);
  for (const request of requests) {
    assert.ok(Object.isFrozen(request.occupancyPose)); assert.ok(Object.isFrozen(request.occupancyPose.ragdoll));
    assert.throws(() => { (request.occupancyPose as { x: number }).x = 500; }, TypeError);
    assert.throws(() => { (request.occupancyPose.ragdoll as number[])[0] = 500; }, TypeError);
  }
  assert.notEqual(requests[1].occupancyPose, notifications[1].occupancyPose);
  assert.notEqual(requests[1].occupancyPose.ragdoll, notifications[1].occupancyPose.ragdoll);
  assert.notDeepEqual(requests[0].occupancyPose, requests[1].occupancyPose, 'prior request owns its original destination');
});

test('refused public reset leaves the physical state, clocks, serial, spawn and notification journal atomic', () => {
  let allow = true;
  const notes: EucPlacementRequest[] = [], requests: EucPlacementRequest[] = [];
  const euc = new EucController(slopedRough, { spawn: start, tuning, surfaces,
    dynamicWorld: { ...world, canPlace(request) { requests.push(request); return allow; },
      didPlace(request) { notes.push(request); } } });
  euc.reset(undefined, 14); euc.step(DT, { ...NEUTRAL_ACTIONS, steer: .8, crouch: true });
  const before = euc.snapshot(), physical = poseOf(euc), serial = euc.discontinuitySerial, noteCount = notes.length;
  allow = false;
  assert.equal(euc.reset(destination, 7), false);
  assert.equal(euc.placementBlocked, true, 'the native durable retry flag remains observable');
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), physical);
  assert.equal(euc.discontinuitySerial, serial); assert.equal(notes.length, noteCount);
  assert.equal(requests.at(-1)!.occupancyPose.x, destination.position.x);
  assert.equal(requests.at(-1)!.occupancyPose.headingY, destination.headingY);
  allow = true;
  assert.equal(euc.reset(), true);
  assert.equal(poseOf(euc).x, start.position.x, 'refused reset cannot install its proposed spawn');
  assert.equal(poseOf(euc).z, start.position.z); assert.equal(euc.discontinuitySerial, serial + 1);
});

test('accepted reset after active rag matches occupancy while inactive reused particles remain irrelevant', () => {
  const requests: EucPlacementRequest[] = [];
  const euc = new EucController(slopedRough, { spawn: start, tuning: { ...tuning,
    crashRecoverEarliestSeconds: 99, crashRecoverAutoSeconds: 99 }, surfaces,
    dynamicWorld: { ...world, canPlace(request) { requests.push(request); return true; } } });
  euc.reset(undefined, 14); assert.equal(euc.hardKnock(8, 1), true);
  for (let tick = 0; tick < 8; tick += 1) euc.step(DT, NEUTRAL_ACTIONS);
  const reused = poseOf(euc);
  assert.ok(reused.ragdollBlend > 0 && reused.ragdoll.some(value => value !== 0), 'fixture really owns active rag particles');
  const oldParticles = reused.ragdoll.slice();
  assert.equal(euc.reset(destination, 7), true); euc.writePose(reused);
  assert.equal(reused.ragdollBlend, 0); assert.deepEqual(reused.ragdoll, oldParticles,
    'native writePose does not overwrite an inactive caller particle buffer');
  assert.ok(Array.from(requests.at(-1)!.occupancyPose.ragdoll).every(value => value === 0));
  equalPhysical(requests.at(-1)!.occupancyPose, reused);
});

test('prepared recovery requests and deferred accepted notifications carry exact destination occupancy', () => {
  const notes: EucPlacementRequest[] = [];
  const euc = new EucController(slopedRough, { spawn: start, tuning, surfaces, dynamicWorld: world });
  euc.setDynamicWorld({ ...world, canPlace: () => true, didPlace(request) { notes.push(request); } });
  euc.reset(undefined, 12); notes.length = 0;
  assert.equal(euc.hardKnock(8, 0), true);
  const before = euc.snapshot(), beforePose = poseOf(euc), serial = euc.discontinuitySerial;
  const token = euc.prepareStep(.03, NEUTRAL_ACTIONS);
  const request = token.placementRequests.find(value => value.reason === 'recover');
  assert.ok(request, 'native crash clock must genuinely request recovery');
  const neutral = createPose(); euc.writePreparedPose(token, neutral);
  equalPhysical(request.occupancyPose, neutral);
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), beforePose);
  const resolved: EucPlacementRequest[] = [];
  euc.resolvePreparedStep(token, { ...world, canPlace(value) { resolved.push(value); return true; },
    didPlace(value) { notes.push(value); } });
  const accepted = createPose(); euc.writePreparedPose(token, accepted);
  equalPhysical(resolved[0].occupancyPose, accepted);
  assert.equal(token.discontinuitySerial, serial + 1); assert.equal(notes.length, 0);
  euc.commitPreparedStep(token, false); assert.equal(notes.length, 0);
  euc.publishPreparedPlacements(token);
  assert.equal(notes.length, 1); assert.equal(notes[0].reason, 'recover');
  equalPhysical(notes[0].occupancyPose, poseOf(euc)); equalPhysical(request.occupancyPose, poseOf(euc));
});

test('physical human placement refuses a strict witness outside the legacy wheel body', () => {
  const euc = new EucController(slopedRough, { spawn: { ...start, headingY: 0 }, tuning, surfaces });
  let witness: PopulationFootprint | undefined, legacyWouldAccept = false;
  euc.setDynamicWorld({ ...world, canPlace(request) {
    const human = prismBody(buildRiderOccupancyEnvelope(request.occupancyPose, RIDER_CONTACT).human);
    const x = human.x + human.halfWidthMetres * .8;
    witness = { x, z: human.z, headingY: 0, halfWidthMetres: .005, halfLengthMetres: .005,
      minY: (human.minY + human.maxY) / 2 - .005, maxY: (human.minY + human.maxY) / 2 + .005,
      velocityX: 0, velocityZ: 0 };
    assert.ok(Math.abs(witness.x - request.body.x) > request.body.halfWidthMetres + .02,
      'strict witness lies outside the old fixed hull');
    legacyWouldAccept = sweepPopulationHulls(witness, witness, request.body, request.body) === null;
    assert.equal(legacyWouldAccept, true, 'legacy body-only query must miss the real human component');
    assert.ok(sweepPopulationHulls(witness, witness, human, human), 'physical human must really overlap the witness');
    return false;
  } });
  const before = poseOf(euc), snapshot = euc.snapshot(), serial = euc.discontinuitySerial;
  assert.equal(euc.reset(undefined, 12), false); assert.ok(witness); assert.equal(legacyWouldAccept, true);
  assert.deepEqual(poseOf(euc), before); assert.deepEqual(euc.snapshot(), snapshot);
  assert.equal(euc.discontinuitySerial, serial);
});

test('public prospective occupancy queries preserve live state, serial, active prepared token and rag history', () => {
  let queries = 0, notes = 0;
  const options = { spawn: start, tuning: { ...tuning, crashRecoverEarliestSeconds: 99, crashRecoverAutoSeconds: 99 }, surfaces };
  const euc = new EucController(slopedRough, options), twin = new EucController(slopedRough, options);
  for (const value of [euc, twin]) {
    value.reset(undefined, 14); assert.equal(value.hardKnock(8, 1), true);
    for (let tick = 0; tick < 8; tick += 1) value.step(DT, NEUTRAL_ACTIONS);
  }
  euc.setDynamicWorld({ ...world, canPlace() { queries += 1; return true; }, didPlace() { notes += 1; } });
  const before = euc.snapshot(), physical = poseOf(euc), serial = euc.discontinuitySerial;
  assert.ok(physical.ragdollBlend > 0, 'the read-only query must protect real active particle history');
  const token = euc.prepareStep(DT, NEUTRAL_ACTIONS), candidateBefore = createPose();
  euc.writePreparedPose(token, candidateBefore);
  const prospective = euc.placementOccupancyPose(destination);
  assert.equal(prospective.x, destination.position.x); assert.equal(prospective.ragdollBlend, 0);
  assert.ok(Object.isFrozen(prospective) && Object.isFrozen(prospective.ragdoll));
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), physical);
  assert.equal(euc.discontinuitySerial, serial); assert.equal(queries, 0); assert.equal(notes, 0);
  const candidateAfter = createPose(); euc.writePreparedPose(token, candidateAfter);
  assert.deepEqual(candidateAfter, candidateBefore, 'public selector query cannot overwrite a prepared private candidate');
  euc.holdPreparedStep(token); euc.commitPreparedStep(token, false); euc.publishPreparedPlacements(token);
  euc.step(DT, NEUTRAL_ACTIONS); twin.step(DT, NEUTRAL_ACTIONS);
  assert.deepEqual(poseOf(euc), poseOf(twin)); assert.deepEqual(euc.snapshot(), twin.snapshot(),
    'next clear tick proves that public selector reads did not consume rag history or clocks');
});
