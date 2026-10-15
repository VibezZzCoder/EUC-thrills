/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import { PopulationSimulation, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from './world.ts';

const DT = .05;
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};
const poseOf = (controller: EucController) => { const pose = createPose(); controller.writePose(pose); return pose; };
const body = (part: RiderOccupancyPrism): PopulationFootprint => ({
  x: part.x, z: part.z, headingY: part.headingY,
  halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength,
  minY: part.baseY, maxY: part.topY, velocityX: 0, velocityZ: 0,
});

/** Production walk, accelerated naturally before the rider enters this epoch.
 * The stress speed is fixture data, not a tuning write or a private actor edit.
 * Translating its authored path preserves the entire native acceleration history.
 */
function incomingPlan(offset: number, z: number): PopulationPlan {
  return {
    schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'rag-repair-incoming',
    installedWorldId: 'rag-repair-incoming/living-r1', contentDigest: 'rag-repair-incoming', anchors: [],
    paths: [{ id: 'incoming-path', role: 'pedestrian', district: 'park',
      points: [1000, -1000].map((x, index) => ({ x: offset + x, y: 0, z, headingY: -Math.PI / 2,
        distanceMetres: index * 2000, surface: 'pavement', sourceSegmentId: 'rag-repair-incoming' })),
      lengthMetres: 2000, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'incoming', kind: 'jogger', pathId: 'incoming-path', initialDistanceMetres: 1000,
      direction: 1, movement: 'shuttle', speedMetresPerSecond: 12, idleSeconds: 0, appearanceIndex: 0,
      hull: { halfWidthMetres: .28, halfLengthMetres: .28, heightMetres: 3 } }],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] },
  };
}
function warmedPopulation(offset: number, z: number): PopulationSimulation {
  const population = new PopulationSimulation(incomingPlan(offset, z), flat);
  for (let tick = 0; tick < 24; tick++) population.step(.25);
  return population;
}
function crashedController(): EucController {
  const controller = new EucController(flat);
  assert.equal(controller.reset(undefined, 12), true);
  assert.equal(controller.hardKnock(3, 0), true);
  for (let tick = 0; tick < 24; tick++) controller.step(1 / 120, NEUTRAL_ACTIONS);
  assert.equal(poseOf(controller).ragdollBlend, 1);
  return controller;
}
function particleIntrudes(pose: ReturnType<typeof createPose>, actor: PopulationFootprint): boolean {
  // ragdoll.ts RADIUS: this witness checks particles themselves, not merely
  // the enclosing garment/contact prism. It must fail if the actor misses.
  const radii = [.14, .14, .12, .10, .10, .10, .10, .05, .05, .07, .07];
  const sin = Math.sin(actor.headingY), cos = Math.cos(actor.headingY);
  return radii.some((radius, index) => {
    const at = index * 3, dx = pose.ragdoll[at] - actor.x, dz = pose.ragdoll[at + 2] - actor.z;
    return Math.abs(dx * cos - dz * sin) < actor.halfWidthMetres + radius - .001
      && Math.abs(dx * sin + dz * cos) < actor.halfLengthMetres + radius - .001
      && pose.ragdoll[at + 1] - radius < actor.maxY && pose.ragdoll[at + 1] + radius > actor.minY;
  });
}

// Adds the composition-root edge missing from populationNativeCrashContact's
// resolver-only incoming-actor pin. No synthetic rag pose or actor mutation:
// both candidates come from their real native fixed-step implementations.
for (const kind of ['human', 'cop'] as const) test(`${kind}: an incoming actor covering the prior rag pose yields before the native fall is sealed`, () => {
  const controller = crashedController(), native = crashedController();
  const before = poseOf(controller), beforeState = controller.snapshot(), serial = controller.discontinuitySerial;
  native.step(DT, NEUTRAL_ACTIONS);
  const nativeAfter = poseOf(native), a = buildRiderOccupancyEnvelope(before, RIDER_CONTACT), b = buildRiderOccupancyEnvelope(nativeAfter, RIDER_CONTACT);
  const right = (part: RiderOccupancyPrism) => part.x + Math.abs(Math.cos(part.headingY)) * part.halfWidth
    + Math.abs(Math.sin(part.headingY)) * part.halfLength;
  const side = Math.max(...Object.values(a).map(right), ...Object.values(b).map(right));
  const reference = warmedPopulation(0, a.human.z), referenceX = reference.snapshot().actors[0].footprint.x;
  const population = warmedPopulation(side + .28 + .03 - referenceX, a.human.z);
  const actorBefore = population.snapshot().actors[0].footprint, clock = population.clockSeconds;
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, before);
  const notes: unknown[] = [];
  const world: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    ragObstacleBodies: () => population.snapshot().actors.map(actor => actor.footprint),
    canPlace: () => false, didPlace: request => notes.push(request) };
  controller.setDynamicWorld(world);
  const token = controller.prepareStep(DT, NEUTRAL_ACTIONS), pose = createPose();
  controller.writePreparedPose(token, pose);
  assert.deepEqual(poseOf(controller), before, 'preparation keeps the live start private');
  assert.deepEqual(controller.snapshot(), beforeState);
  population.step(DT);
  const actor = population.actorMotions()[0];
  assert.ok(actor.current.x < actor.previous.x - .5, 'the incoming actor really travels through this epoch');
  assert.equal(particleIntrudes(before, actor.previous), false, 'prior particles clear the actor start');
  assert.equal(particleIntrudes(before, actor.current), true, 'known-bad control: retaining/rolling back to the old rag pose penetrates the proposed current actor');
  const priorParts = certificates.components('owner', before, before, 0, 'held');
  const actorAtStart = [{ ...actor, previous: actor.previous, current: actor.previous }];
  const actorAtEndpoint = [{ ...actor, previous: actor.current, current: actor.current }];
  assert.ok(priorParts.every(part => population.recoveryClearance(part.at(0), [], [], 0, actorAtStart).clear));
  assert.ok(priorParts.some(part => !population.recoveryClearance(part.at(0), [], [], 0, actorAtEndpoint).clear),
    'a locally retained pose must not be labelled clear against current living bodies');

  const seat = { id: 'owner', kind, controller, token, pose, world };
  const result = commitPopulationPhysicalTransaction({ population, certificates, seats: [seat], preparedSeats: [seat],
    before: new Map([['owner', { pose: before, serial }]]), dt: DT, reservations: [],
    preferActorYieldOwnerIds: ['owner'], bodyFromPose: value => body(buildRiderOccupancyEnvelope(value, RIDER_CONTACT).human) });
  assert.deepEqual(result.resolution.yieldedActorIds, ['incoming']);
  assert.deepEqual(result.resolution.refusedOwnerIds, []);
  assert.equal(result.resolution.batch.actorFractions.incoming, 0);
  assert.equal(token.held, false);
  assert.deepEqual(result.contactResponses, [], 'no second native fall is minted by a held-response retry');
  assert.deepEqual(poseOf(controller), nativeAfter, 'actor yielding preserves the complete native fall');
  assert.deepEqual(controller.snapshot(), native.snapshot());
  assert.ok(Math.abs(controller.snapshot().crashTime - beforeState.crashTime - DT) < 1e-12);
  assert.notDeepEqual(Array.from(nativeAfter.ragdoll), Array.from(before.ragdoll), 'the particles fall as well as advancing their clock');
  assert.equal(controller.discontinuitySerial, serial);
  assert.equal(notes.length, 0, 'no reset/recovery placement journal is fabricated');
  assert.ok(Math.abs(population.clockSeconds - clock - DT) < 1e-12);
  const actorAfter = population.snapshot().actors[0].footprint;
  for (const key of ['x', 'z', 'headingY', 'halfWidthMetres', 'halfLengthMetres', 'minY', 'maxY'] as const)
    assert.equal(actorAfter[key], actorBefore[key], `yielded actor ${key}`);
  assert.equal(particleIntrudes(poseOf(controller), actorAfter), false);
  assert.ok(certificates.components('final', poseOf(controller), poseOf(controller), 0, 'placement')
    .every(part => population.recoveryClearance(part.at(0), [], [], 0,
      [{ ...actor, previous: actorAfter, current: actorAfter }]).clear), 'final native body is certified against the actual yielded actor');
  assert.throws(() => population.actorMotions(), /committed/);
  assert.throws(() => controller.commitPreparedStep(token), /prepared|committed|stale/);
});
