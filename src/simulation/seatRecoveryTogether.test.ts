/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * RP-7 (2026-10-03): two riders who crash together must not hold each other
 * down. Each lies across the other's safe point, and the recovery census used
 * to refuse both placements on every step for as long as the session lasted.
 * The composition root's order is mirrored: the NPC epoch steps, both seats
 * prepare, and one whole-step transaction resolves both.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { PopulationSimulation, type PopulationFootprint, type PopulationOccupant } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction, type PopulationPreparedPhysicalSeat } from './populationPhysicalTransaction.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_OCCUPANT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from './world.ts';

const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const world: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null };
const poseOf = (controller: EucController) => { const pose = createPose(); controller.writePose(pose); return pose; };
const body = (pose: ReturnType<typeof createPose>): PopulationFootprint => ({ x: pose.x, z: pose.z, headingY: pose.headingY,
  halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
  minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres, velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed });
/** One stationary walker a kilometre away: a living world with nobody near the riders. */
function plan(): PopulationPlan {
  const z = 1000;
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'seat-recovery', installedWorldId: 'seat-recovery/living-r1', contentDigest: 'seat-recovery', anchors: [],
    paths: [{ id: 'walk', role: 'pedestrian', district: 'park', points: [z - 15, z, z + 15].map((value, index) => ({ x: 0, y: 0, z: value, headingY: 0, distanceMetres: index * 15, surface: 'pavement', sourceSegmentId: 'test' })), lengthMetres: 30, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'npc', kind: 'walker', pathId: 'walk', initialDistanceMetres: 15, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: .2, appearanceIndex: 0, hull: { halfWidthMetres: .42, halfLengthMetres: .42, heightMetres: 1.9 } }],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
const TUNING = { crashRecoverEarliestSeconds: .2, crashRecoverAutoSeconds: .5 };
const SPOTS = [0, .5];
const SETUP_TICKS = 30;

/** Two seats knocked toward each other from 0.5 m apart, so each body lies over the other's safe point. */
function downedPair(): EucController[] {
  const pair = SPOTS.map(x => new EucController(flat, { dynamicWorld: world, tuning: TUNING,
    spawn: { position: { x, y: 0, z: 0 }, headingY: 0 } }));
  assert.equal(pair[0].hardKnock(1, 0), true); assert.equal(pair[1].hardKnock(-1, 0), true);
  // Below the automatic threshold, so the direct (unchecked) fall cannot recover.
  for (let tick = 0; tick < SETUP_TICKS; tick += 1) for (const seat of pair) seat.step(DT, NEUTRAL_ACTIONS);
  for (const seat of pair) assert.equal(seat.crashed, true);
  return pair;
}

/** `Game.beginPopulationStep` + `resolvePopulationPreparedSteps` for two seats, until both ride or the budget ends. */
function ride(pair: readonly EucController[], ticks: number, kinds: readonly ('human' | 'cop')[] = ['human', 'human']): number {
  const population = new PopulationSimulation(plan(), flat);
  const certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, poseOf(pair[0]));
  const ids = pair.map((_, index) => kinds[index] === 'human' ? `human-${index}` : `cop-${index}`);
  for (let tick = 0; tick < ticks; tick += 1) {
    if (pair.every(seat => !seat.crashed)) return tick;
    const before = new Map(pair.map((seat, index) => [ids[index], { pose: poseOf(seat), serial: seat.discontinuitySerial }] as const));
    population.step(DT, [...before].map(([id, value], index): PopulationOccupant => ({ id, kind: kinds[index], previous: body(value.pose), current: body(value.pose) })));
    const seats: PopulationPreparedPhysicalSeat[] = pair.map((controller, index) => {
      const token = controller.prepareStep(DT, NEUTRAL_ACTIONS), pose = createPose(); controller.writePreparedPose(token, pose);
      return { id: ids[index], kind: kinds[index], controller, token, pose, world };
    });
    commitPopulationPhysicalTransaction({ population, certificates, seats, preparedSeats: seats, before, dt: DT, reservations: [],
      contactResponse: 'yield', preferActorYieldOwnerIds: seats.filter(seat => seat.controller.crashed).map(seat => seat.id), bodyFromPose: body });
  }
  return -1;
}

test('the fixture is real: each lying body covers the other seat\'s recovery footprint unless it counts as downed', () => {
  const pair = downedPair();
  const population = new PopulationSimulation(plan(), flat); population.step(DT, []);
  const certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, poseOf(pair[0]));
  const lying = (index: number, downed: boolean): PopulationOccupant[] => {
    const pose = poseOf(pair[index]);
    return certificates.components(`human-${index}`, pose, pose, 0, 'placement').map(part => {
      const footprint = part.at(0); return { id: `human-${index}/${part.componentId}`, kind: 'human', previous: footprint, current: footprint, downed };
    });
  };
  const recoveryAt = (index: number) => {
    const pose = pair[index].placementOccupancyPose({ position: { x: SPOTS[index], y: 0, z: 0 }, headingY: 0 });
    return certificates.components(`human-${index}`, pose, pose, 0, 'placement').map(part => part.at(0));
  };
  for (const [index, other] of [[0, 1], [1, 0]]) {
    assert.ok(recoveryAt(index).some(footprint => !population.recoveryClearance(footprint, lying(other, false)).clear),
      `seat ${other} lies across seat ${index}'s safe point and a mounted body there still refuses`);
    assert.ok(recoveryAt(index).every(footprint => population.recoveryClearance(footprint, lying(other, true)).clear),
      `seat ${other} lying down is left out of seat ${index}'s recovery census`);
  }
});

test('two seats down across each other\'s safe points both get back up on the automatic clock', () => {
  const pair = downedPair();
  const tick = ride(pair, 240);
  assert.ok(tick >= 0, `both seats must recover; states ${pair.map(seat => seat.crashed ? 'down' : 'up').join(',')}`);
  // The rest of the 0.5 s automatic threshold after the setup ticks, plus a few steps of margin.
  assert.ok(tick <= 60 - SETUP_TICKS + 12, `recovery took ${tick} transaction ticks`);
});

/** Seat 0 mounted and still at the spawn, seat 1 knocked down where it stood, `gap` metres abreast. */
function knockedBeside(gap: number): EucController[] {
  const pair = [0, -gap].map(x => new EucController(flat, { dynamicWorld: world, tuning: TUNING,
    spawn: { position: { x, y: 0, z: 0 }, headingY: 0 } }));
  assert.equal(pair[1].hardKnock(-1, 0), true);
  for (let tick = 0; tick < SETUP_TICKS; tick += 1) for (const seat of pair) seat.step(DT, NEUTRAL_ACTIONS);
  assert.equal(pair[0].crashed, false); assert.equal(pair[1].crashed, true);
  return pair;
}

test('a seat knocked down 1.6 m abreast of a mounted, standing seat still gets up — the review\'s knockedBeside', () => {
  // 2026-10-03 review: the restored abreast slots sit inside a mounted body's
  // recovery clearance, so the census held the fallen rider down until the
  // other one rode away. Seats never veto seats, a recovery included.
  const pair = knockedBeside(1.6);
  const population = new PopulationSimulation(plan(), flat); population.step(DT, []);
  const certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, poseOf(pair[0]));
  const standing = poseOf(pair[0]);
  const mounted: PopulationOccupant[] = certificates.components('human-0', standing, standing, 0, 'placement').map(part => {
    const footprint = part.at(0); return { id: `human-0/${part.componentId}`, kind: 'human', previous: footprint, current: footprint };
  });
  const safe = pair[1].placementOccupancyPose({ position: { x: -1.6, y: 0, z: 0 }, headingY: 0 });
  assert.ok(certificates.components('human-1', safe, safe, 0, 'placement')
    .some(part => !population.recoveryClearance(part.at(0), mounted).clear),
  'fixture: the standing rider\'s body does cover the fallen rider\'s recovery footprint');
  const tick = ride(pair, 240);
  assert.ok(tick >= 0, 'the fallen seat must recover beside a standing seat');
  assert.ok(tick <= 60 - SETUP_TICKS + 12, `recovery took ${tick} transaction ticks`);
});

test('a mounted CPU cop standing on the same spot still holds the recovery — only seats stopped vetoing seats', () => {
  const pair = knockedBeside(1.6);
  assert.equal(ride(pair, 240, ['cop', 'human']), -1, 'a standing CPU cop is not a seat and still refuses');
  assert.equal(pair[1].crashed, true);
});
