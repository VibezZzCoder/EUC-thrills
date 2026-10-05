/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Excluded executable controls; coordinator runs jobs serially. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PopulationSimulation, type PopulationFootprint, type PopulationOccupant,
  type PopulationPhysicalFinalByOwner, mixActorPose } from './population.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from './populationCompound.ts';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { populationSupportTargets } from '../shared/populationSupport.ts';
import type { TerrainSampler } from './world.ts';

const DT = .05;
const flat: TerrainSampler = { sampleGround(_x, _z, out) {
  out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
  out.surface = 'pavement'; out.offCourse = false; return out;
}, raycast() { return null; } };
const body = (x = 0, z = 0, overrides: Partial<PopulationFootprint> = {}): PopulationFootprint => ({ x, z,
  headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2,
  velocityX: 0, velocityZ: 0, ...overrides });
function plan(moving = false): PopulationPlan {
  const path: PopulationPath = { id: 'walk', role: 'pedestrian', district: 'park',
    points: [-15, 0, 15].map((z, index) => ({ x: 0, y: 0, z, headingY: 0,
      distanceMetres: index * 15, surface: 'pavement' as const, sourceSegmentId: 'walk/source' })),
    lengthMetres: 30, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] };
  const actor: ActorSpec = { id: 'npc', kind: 'walker', pathId: path.id, initialDistanceMetres: 15,
    direction: 1, movement: moving ? 'shuttle' : 'stationary', speedMetresPerSecond: moving ? 1.1 : 0,
    idleSeconds: .2, appearanceIndex: 0, hull: { halfWidthMetres: .42, halfLengthMetres: .42, heightMetres: 1.9 } };
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'test-world', installedWorldId: 'test-world/living-r1',
    contentDigest: 'fixture', paths: [path], actors: [actor], anchors: [], report: {
      missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
const person = (current: PopulationFootprint, previous = current): PopulationOccupant => ({ id: 'owner',
  kind: 'human', previous, current });
const fixed = (componentId: string, footprint: PopulationFootprint): PopulationCompoundTrajectory => ({
  ownerId: 'owner', componentId, stopGroupId: 'mounted', at: () => ({ ...footprint }), intervalEnvelopeMetres: () => 0 });

test('original actor motions and stopped actor queries own detached nested hull data without changing candidates', () => {
  const simulation = new PopulationSimulation(plan(true), flat);
  for (let index = 0; index < 20; index += 1) { simulation.step(DT); simulation.queryContacts([]); }
  simulation.step(DT);
  const before = simulation.snapshot(), original = simulation.actorMotions();
  const first = original[0]; assert.ok(first.current.z > first.previous.z, 'fixture needs genuine original actor movement');
  (first.current as { x: number }).x = 99;
  (first.current.sourceHull!.hull as { halfWidthMetres: number }).halfWidthMetres = 99;
  assert.deepEqual(simulation.snapshot(), before);
  assert.notEqual(simulation.actorMotions()[0].current.sourceHull!.hull.halfWidthMetres, 99);
  const stopped = simulation.actorBodiesAtFractions({ npc: .25 });
  assert.ok(stopped[0].current.z > original[0].previous.z);
  assert.ok(stopped[0].current.z < before.actors[0].z);
  assert.equal(stopped[0].current.velocityX, 0); assert.equal(stopped[0].current.velocityZ, 0);
  assert.deepEqual(simulation.snapshot(), before, 'placement reads cannot publish an actor stop');
  assert.throws(() => simulation.actorBodiesAtFractions({ npc: NaN }), /fractions/);
  assert.throws(() => simulation.actorBodiesAtFractions({ npc: 1.01 }), /fractions/);
});

test('separate physical components leave the real empty gap clear despite a known-bad merged legacy hull', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const legacy = person(body(0, 0, { halfWidthMetres: 5 }));
  assert.equal(simulation.prepareContacts([legacy]).hits.length, 1,
    'known-bad merged hull must collide with the NPC inside the empty gap');
  const prepared = simulation.prepareCompoundContacts([legacy], [fixed('wheel', body(-4)), fixed('human', body(4))],
    resolvePopulationCompoundMotionBatch);
  assert.deepEqual(prepared.hits, []); assert.equal(prepared.physicalFinalByOwner!.owner.length, 2);
  assert.deepEqual(simulation.commitContacts(prepared, [legacy]), []);
});

test('compound commit uses the accepted distant human footprint for overlap, hit position and owner cooldown', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const legacyWheel = person(body(5));
  assert.deepEqual(simulation.prepareContacts([legacyWheel]).hits, [], 'legacy wheel-only hull is the strict missed-human control');
  const footprints = [fixed('wheel', body(5)), fixed('human', body(0))];
  const before = simulation.snapshot();
  const prepared = simulation.prepareCompoundContacts([legacyWheel], footprints, resolvePopulationCompoundMotionBatch,
    { ownerFractions: { owner: 0 } });
  assert.deepEqual(simulation.snapshot(), before, 'preparation cannot move actors or charge cooldowns');
  assert.equal(prepared.hits.length, 1); assert.equal(prepared.hits[0].componentId, 'human');
  assert.equal(prepared.hits[0].componentFootprint!.x, 0);
  assert.equal(prepared.componentImpacts![0].componentId, 'human');
  const contacts = simulation.commitContacts(prepared, [legacyWheel]);
  assert.equal(contacts.length, 1); assert.equal(contacts[0].componentId, 'human');
  assert.equal(contacts[0].currentlyOverlapping, true,
    'the actual human overlaps although the legacy wheel/owner box is far away');
  assert.ok(contacts[0].penetrationMetres > 0);
  assert.ok(Math.abs(contacts[0].impactX) < .01, 'hit evidence must stay with the human rather than the far wheel');
  assert.equal(contacts[0].allowedMoveFraction, 0); assert.equal(contacts[0].charge, true);
  simulation.step(DT, [legacyWheel]);
  const again = simulation.prepareCompoundContacts([legacyWheel], footprints, resolvePopulationCompoundMotionBatch,
    { ownerFractions: { owner: 0 } });
  assert.equal(simulation.commitContacts(again, [legacyWheel])[0].charge, false, 'the same owner/NPC overlap cannot charge twice');
});

test('preparation detaches actor fractions, physical endpoints and component impact evidence from caller storage', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const human = body(0), wheel = body(5), legacy = person(wheel);
  const supplied: PopulationPhysicalFinalByOwner = { owner: [{ componentId: 'wheel', footprint: wheel },
    { componentId: 'human', footprint: human }] };
  const prepared = simulation.prepareCompoundContacts([legacy], [fixed('wheel', wheel), fixed('human', human)],
    resolvePopulationCompoundMotionBatch, { ownerFractions: { owner: 0 }, physicalFinalByOwner: supplied });
  (human as { x: number }).x = 99;
  (wheel as { x: number }).x = 99;
  assert.equal(prepared.physicalFinalByOwner!.owner.find(value => value.componentId === 'human')!.footprint.x, 0);
  assert.equal(prepared.componentImpacts![0].footprint.x, 0);
  const contacts = simulation.commitContacts(prepared, [person(body(5))]);
  assert.equal(contacts[0].currentlyOverlapping, true);
  (contacts[0].componentFootprint as { x: number }).x = 77;
  assert.equal(simulation.queryContacts([person(body(5))])[0].componentFootprint!.x, 0,
    'a returned contact cannot mutate the stored physical evidence');
  assert.throws(() => simulation.actorMotions(), /committed/);
});

test('discontinuous owner placements are filtered before compound sweeps and never cast across the world', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const teleported = { ...person(body(4), body(-4)), teleported: true };
  let observed = -1;
  const prepared = simulation.prepareCompoundContacts([teleported], [fixed('wheel', body(0)), fixed('human', body(0))],
    (actors, components) => { observed = components.length; return resolvePopulationCompoundMotionBatch(actors, components); });
  assert.equal(observed, 0); assert.deepEqual(prepared.hits, []);
  assert.deepEqual(simulation.commitContacts(prepared, [teleported]), []);
});

test('compound preparation rejects missing components, unknown identities and invalid owner fractions', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const owner = person(body(5));
  assert.throws(() => simulation.prepareCompoundContacts([owner], [], resolvePopulationCompoundMotionBatch), /components/);
  assert.throws(() => simulation.prepareCompoundContacts([owner], [{ ...fixed('wheel', body(5)), ownerId: 'foreign' }],
    resolvePopulationCompoundMotionBatch), /identities/);
  assert.throws(() => simulation.prepareCompoundContacts([owner], [fixed('wheel', body(5))], resolvePopulationCompoundMotionBatch,
    { ownerFractions: { owner: -.1 } }), /fractions/);
  assert.throws(() => simulation.prepareCompoundContacts([owner], [fixed('wheel', body(5))], resolvePopulationCompoundMotionBatch,
    { physicalFinalByOwner: { owner: [{ componentId: 'missing', footprint: body(5) }] } }), /identity/);
  assert.throws(() => simulation.prepareCompoundContacts([owner], [fixed('wheel', body(5)), fixed('human', body(5))],
    resolvePopulationCompoundMotionBatch, { physicalFinalByOwner: { owner: [{ componentId: 'wheel', footprint: body(5) }] } }),
  /complete/);
});

test('only explicit known coarse exclusions can omit physical components; near-owner omission still refuses', () => {
  const simulation = new PopulationSimulation(plan(), flat); simulation.step(DT);
  const far = person(body(100));
  assert.throws(() => simulation.prepareCompoundContacts([far], [], resolvePopulationCompoundMotionBatch), /components/);
  let observed = -1;
  const prepared = simulation.prepareCompoundContacts([far], [], (actors, components) => {
    observed = components.length; return resolvePopulationCompoundMotionBatch(actors, components);
  }, { coarseExcludedOwnerIds: ['owner'] });
  assert.equal(observed, 0); assert.deepEqual(prepared.physicalFinalByOwner!.owner, []);
  assert.deepEqual(prepared.hits, []); assert.deepEqual(simulation.commitContacts(prepared, [far]), []);
  const fresh = new PopulationSimulation(plan(), flat); fresh.step(DT);
  assert.throws(() => fresh.prepareCompoundContacts([far], [], resolvePopulationCompoundMotionBatch,
    { coarseExcludedOwnerIds: ['foreign'] }), /distinct known/);
  assert.throws(() => fresh.prepareCompoundContacts([far], [], resolvePopulationCompoundMotionBatch,
    { coarseExcludedOwnerIds: ['owner', 'owner'] }), /distinct known/);
  assert.throws(() => fresh.prepareCompoundContacts([far], [fixed('wheel', body(100))], resolvePopulationCompoundMotionBatch,
    { coarseExcludedOwnerIds: ['owner'] }), /cannot supply/);
  assert.throws(() => fresh.prepareCompoundContacts([far], [], () => ({ actorFractions: { npc: 1 }, componentFractions: {}, stopGroupFractions: {}, hits: [
    { actorId: 'npc', actorOwnerId: 'npc', ownerId: 'owner', componentId: 'wheel', timeOfImpact: 0, normalX: 1, normalZ: 0,
      penetrationMetres: 0, initiallyOverlapping: false, currentlyOverlapping: false,
      actorVelocityX: 0, actorVelocityZ: 0, componentVelocityX: 0, componentVelocityZ: 0 }
  ] }), { coarseExcludedOwnerIds: ['owner'] }), /cannot produce/);
  assert.throws(() => fresh.prepareCompoundContacts([far], [], resolvePopulationCompoundMotionBatch,
    { coarseExcludedOwnerIds: ['owner'], physicalFinalByOwner: { owner: [{ componentId: 'human', footprint: body(0) }] } }),
  /identity/);
});

test('native owner omission during the next population step deliberately discards pair history', () => {
  const simulation = new PopulationSimulation(plan(), flat), legacyWheel = person(body(5));
  const components = [fixed('wheel', body(5)), fixed('human', body(0))];
  simulation.step(DT, [legacyWheel]);
  let prepared = simulation.prepareCompoundContacts([legacyWheel], components, resolvePopulationCompoundMotionBatch);
  assert.equal(simulation.commitContacts(prepared, [legacyWheel])[0].charge, true);
  simulation.step(DT, []);
  prepared = simulation.prepareCompoundContacts([legacyWheel], components, resolvePopulationCompoundMotionBatch);
  assert.equal(simulation.commitContacts(prepared, [legacyWheel])[0].charge, true,
    'absent owner is the existing native discontinuity; production must pass every physical owner to step');
});


/** Exact old pathPoint route-distance remap for the pinned two-unit L path. */
function oldCornerRemap(beforeDistance: number, afterDistance: number, fraction: number) {
  const distance = beforeDistance + (afterDistance - beforeDistance) * fraction;
  return { x: Math.min(1, distance), z: Math.max(0, distance - 1) };
}

function cornerPlan(): PopulationPlan {
  const result = plan(true);
  return { ...result, paths: [{ ...result.paths[0], points: [
    { x: 0, y: 0, z: 0, headingY: Math.PI / 2, distanceMetres: 0, surface: 'pavement', sourceSegmentId: 'corner/approach' },
    { x: 1, y: 0, z: 0, headingY: Math.PI / 2, distanceMetres: 1, surface: 'pavement', sourceSegmentId: 'corner/turn' },
    { x: 1, y: 0, z: 1, headingY: 0, distanceMetres: 2, surface: 'pavement', sourceSegmentId: 'corner/exit' },
  ], lengthMetres: 2 }], actors: [{ ...result.actors[0], initialDistanceMetres: .93, speedMetresPerSecond: 3.2,
    hull: { halfWidthMetres: .04, halfLengthMetres: .04, heightMetres: 1.9 } }] };
}
const stoppedBody = (value: PopulationFootprint): PopulationFootprint => ({ ...value, velocityX: 0, velocityZ: 0 });
const footprintScalars = ['x', 'z', 'headingY', 'halfWidthMetres', 'halfLengthMetres', 'minY', 'maxY'] as const;
function physicalBodyEqual(actual: PopulationFootprint, expected: PopulationFootprint): void {
  for (const key of footprintScalars) assert.equal(actual[key], expected[key], `held body ${key}`);
  assert.deepEqual(actual.sourceHull, expected.sourceHull);
  assert.equal(actual.velocityX, 0); assert.equal(actual.velocityZ, 0);
}

test('real native L-corner motion stops at the CCD/render body, with a strict greater-than-three-centimetre old-remap witness', () => {
  const simulation = new PopulationSimulation(cornerPlan(), flat);
  simulation.step(.25);
  const before = simulation.previousSnapshot().actors[0], after = simulation.snapshot().actors[0];
  assert.equal(before.x, .93); assert.equal(before.z, 0); assert.equal(after.x, 1);
  assert.ok(after.z > .05 && after.z < .10, 'fixture must actually cross the native authored corner');
  const expected = simulation.interpolate(.5).actors[0], oldRemap = oldCornerRemap(before.distanceMetres, after.distanceMetres, .5);
  assert.ok(Math.hypot(oldRemap.x - expected.footprint.x, oldRemap.z - expected.footprint.z) > .03,
    'known-bad native route-distance remap must differ from the declared solver body');
  physicalBodyEqual(simulation.actorBodiesAtFractions({ npc: .5 })[0].current, stoppedBody(expected.footprint));
  assert.deepEqual(simulation.snapshot().actors[0], after, 'precommit query remains read-only');
  assert.deepEqual(mixActorPose(before, after, .5), expected, 'renderer uses the same owned interpolation expression');
});

test('actual compound stop fraction preserves the corner body, supports and histories through impact publication and next tick', () => {
  const simulation = new PopulationSimulation(cornerPlan(), flat);
  simulation.step(.25);
  const before = simulation.previousSnapshot().actors[0], original = simulation.snapshot().actors[0];
  const legacy = person(body(100)), target = body(1.015, .04, { halfWidthMetres: .005, halfLengthMetres: .005, maxY: 1.9 });
  const prepared = simulation.prepareCompoundContacts([legacy], [fixed('wheel', target)], resolvePopulationCompoundMotionBatch);
  const fraction = prepared.actorFractions.npc;
  assert.ok(fraction > .1 && fraction < .9, 'actual compound CCD must select an interior actor stop');
  assert.equal(prepared.hits.length, 1);
  const expected = simulation.interpolate(fraction).actors[0], oldRemap = oldCornerRemap(before.distanceMetres, original.distanceMetres, fraction);
  assert.ok(Math.hypot(oldRemap.x - expected.footprint.x, oldRemap.z - expected.footprint.z) > .03,
    'the real selected stop exposes the old corner remap defect');
  physicalBodyEqual(simulation.actorBodiesAtFractions(prepared.actorFractions)[0].current, stoppedBody(expected.footprint));
  const contacts = simulation.commitContacts(prepared, [legacy]);
  assert.equal(contacts.length, 1); assert.equal(contacts[0].charge, true);
  const held = simulation.snapshot().actors[0]; assert.equal(held.activity, 'impacted');
  physicalBodyEqual(held.footprint, stoppedBody(expected.footprint));
  assert.equal(held.x, expected.x); assert.equal(held.y, expected.y); assert.equal(held.z, expected.z);
  assert.equal(held.headingY, expected.headingY); assert.equal(held.speedMetresPerSecond, 0);
  assert.deepEqual(held.footSupports, expected.footSupports); assert.deepEqual(held.supportHeights, expected.supportHeights);
  assert.ok(Math.abs(held.distanceMetres - (before.distanceMetres + (original.distanceMetres - before.distanceMetres) * fraction)) < 1e-12);
  assert.ok(Math.abs(held.gaitDistanceMetres - (before.gaitDistanceMetres + (original.gaitDistanceMetres - before.gaitDistanceMetres) * fraction)) < 1e-12);
  assert.ok(Math.abs(held.wheelTravelMetres - (before.wheelTravelMetres + (original.wheelTravelMetres - before.wheelTravelMetres) * fraction)) < 1e-12);
  simulation.step(DT, [legacy]);
  assert.deepEqual(simulation.previousSnapshot().actors[0].footprint, held.footprint);
  assert.deepEqual(simulation.actorMotions()[0].previous, held.footprint);
  assert.deepEqual(simulation.actorMotions()[0].current, held.footprint,
    'impact pause cannot silently snap the held physical corner body back onto the authored route');
  assert.deepEqual(simulation.snapshot().actors[0].footSupports, held.footSupports);
});

test('a clear fraction-one body query and commit retain the original physical endpoint byte for byte', () => {
  const simulation = new PopulationSimulation(cornerPlan(), flat); simulation.step(.25);
  const original = simulation.snapshot(), legacy = person(body(100));
  const prepared = simulation.prepareCompoundContacts([legacy], [], resolvePopulationCompoundMotionBatch,
    { coarseExcludedOwnerIds: ['owner'] });
  assert.equal(prepared.actorFractions.npc, 1);
  const stopped = simulation.actorBodiesAtFractions(prepared.actorFractions)[0].current;
  assert.deepEqual(stopped, stoppedBody(original.actors[0].footprint));
  assert.deepEqual(simulation.snapshot(), original);
  assert.deepEqual(simulation.commitContacts(prepared, [legacy]), []);
  assert.deepEqual(simulation.snapshot(), original, 'fraction one never rebuilds the native clear physical endpoint');
});

test('the native pretransaction reservation stop retains the original moving supports at a zero prefix', () => {
  const setup = cornerPlan(), actor = { ...setup.actors[0], initialDistanceMetres: 0,
    hull: { halfWidthMetres: .04, halfLengthMetres: .04, heightMetres: 1.9 } };
  const simulation = new PopulationSimulation({ ...setup, actors: [actor] }, flat);
  for (let tick = 0; tick < 3; tick += 1) {
    simulation.step(.25); simulation.queryContacts([]);
  }
  const before = simulation.snapshot().actors[0];
  assert.ok(before.speedMetresPerSecond > 1 && before.x > .8 && before.x < .9,
    'native fixture must genuinely approach the corner with moving feet');
  const reservation = { id: 'blocker', footprint: body(1.015, .2, { halfWidthMetres: .005, halfLengthMetres: .005, maxY: 1.9 }) };
  simulation.step(.25, [], [reservation]);
  const held = simulation.snapshot().actors[0];
  const oldWaitingSupports = populationSupportTargets({ ...before, activity: 'waiting', speedMetresPerSecond: 0 }).feet!.map(target =>
    ({ x: target.x, y: 0, z: target.z, normalX: 0, normalY: 1, normalZ: 0 }));
  assert.equal(held.speedMetresPerSecond, 0); assert.equal(held.distanceMetres, before.distanceMetres,
    'the native reservation phase must truly select its zero prefix');
  assert.equal(held.x, before.x); assert.equal(held.z, before.z);
  assert.deepEqual(held.footSupports, before.footSupports);
  assert.notDeepEqual(oldWaitingSupports, before.footSupports,
    'known-bad post-stop makePose must really replace the moving sole targets with standing targets');
});


test('the next moving epoch starts from the sealed corner body and includes its return toward the authored path', () => {
  const simulation = new PopulationSimulation(cornerPlan(), flat); simulation.step(.25);
  const legacy = person(body(100)), target = body(1.015, .04, { halfWidthMetres: .005, halfLengthMetres: .005, maxY: 1.9 });
  const prepared = simulation.prepareCompoundContacts([legacy], [fixed('wheel', target)], resolvePopulationCompoundMotionBatch);
  assert.ok(prepared.actorFractions.npc > 0 && prepared.actorFractions.npc < 1);
  assert.equal(simulation.commitContacts(prepared, [legacy])[0].charge, true);
  let held = simulation.snapshot().actors[0];
  assert.equal(held.speedMetresPerSecond, 0);
  let resumed = false;
  for (let tick = 0; tick < 8; tick += 1) {
    const previous = held;
    simulation.step(.25, [legacy]);
    const motion = simulation.actorMotions()[0], current = simulation.snapshot().actors[0];
    assert.deepEqual(motion.previous, previous.footprint, 'a new epoch starts from the physically published held body');
    if (current.speedMetresPerSecond > 0) {
      assert.ok(current.distanceMetres > previous.distanceMetres);
      assert.ok(Math.hypot(current.velocityX, current.velocityZ) > 0);
      const expected = simulation.interpolate(.5).actors[0].footprint;
      physicalBodyEqual(simulation.actorBodiesAtFractions({ npc: .5 })[0].current, stoppedBody(expected));
      resumed = true; break;
    }
    assert.deepEqual(current.footprint, previous.footprint, 'the pause holds its exact physical endpoint');
    simulation.queryContacts([legacy]); held = current;
  }
  assert.equal(resumed, true, 'the native impact pause must genuinely expire within the bounded fixture');
});

test('repeated partial grade poses take the exact accepted source-hull normal of native sloped motion', () => {
  const grade: TerrainSampler = { sampleGround(x, z, out) {
    out.height = .03 * Math.sin(12 * x) + .1 * z;
    const nx = -.36 * Math.cos(12 * x), length = Math.hypot(nx, 1, -.1);
    out.normal.x = nx / length; out.normal.y = 1 / length; out.normal.z = -.1 / length;
    out.surface = 'pavement'; out.offCourse = false; return out;
  }, raycast() { return null; } };
  const simulation = new PopulationSimulation(cornerPlan(), grade); simulation.step(.25);
  const before = simulation.previousSnapshot().actors[0], after = simulation.snapshot().actors[0];
  assert.ok(after.z > .05, 'sloped fixture must actually cross the native corner');
  const first = mixActorPose(before, after, .6), second = mixActorPose(before, first, .5);
  for (const pose of [first, second]) {
    const source = pose.footprint.sourceHull!;
    assert.equal(pose.groundNormalX, source.normalX); assert.equal(pose.groundNormalY, source.normalY);
    assert.equal(pose.groundNormalZ, source.normalZ);
    assert.ok(Math.abs(Math.hypot(pose.groundNormalX, pose.groundNormalY, pose.groundNormalZ) - 1) < 1e-12);
    const sin = Math.sin(pose.headingY), cos = Math.cos(pose.headingY);
    assert.equal(pose.groundPitch, Math.atan2(-(source.normalX * sin + source.normalZ * cos), source.normalY));
    assert.equal(pose.groundRoll, Math.atan2(-(source.normalX * cos - source.normalZ * sin), source.normalY));
  }
  const oldFirst = [before.groundNormalX, before.groundNormalY, before.groundNormalZ].map((value, index) =>
    value + ([after.groundNormalX, after.groundNormalY, after.groundNormalZ][index] - value) * .6);
  const oldSecond = [before.groundNormalX, before.groundNormalY, before.groundNormalZ].map((value, index) =>
    value + (oldFirst[index] - value) * .5);
  const oldLength = Math.hypot(...oldSecond);
  assert.ok(Math.hypot(oldSecond[0] / oldLength - second.groundNormalX,
    oldSecond[1] / oldLength - second.groundNormalY, oldSecond[2] / oldLength - second.groundNormalZ) > 1e-8,
    'strict old raw repeated-normal blend must actually disagree with the accepted physical source frame');
});
