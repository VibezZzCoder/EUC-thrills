/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Native authored-route fixture; no private NPC speed, pose or planner writes. */
import { EucController, createPose, type EucPose } from './EucController.ts';
import { PopulationSimulation, type PopulationFootprint, type PopulationOccupant } from './population.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_AUTHORING as A, POPULATION_OCCUPANT as H, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from './world.ts';
/** The rag particle radii (ragdoll.ts `RADIUS`), restated so this file also loads on the pre-fix tree. */
const RAGDOLL_RADII = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07];
export const INCOMING_DT = 1 / 120, INCOMING_WARM_TICKS = 360;
export const incomingFlat: TerrainSampler = { sampleGround(_x, _z, out) {
  out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out;
}, raycast() { return null; } };
export function incomingPose(value: EucController): EucPose { const pose = createPose(); value.writePose(pose); return pose; }
export function incomingCoarse(pose: EucPose): PopulationFootprint { return { x: pose.x, z: pose.z, headingY: pose.headingY,
  minY: pose.y, maxY: pose.y + H.heightMetres, halfWidthMetres: H.halfWidthMetres, halfLengthMetres: H.halfLengthMetres,
  velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed }; }
export function incomingPart(part: RiderOccupancyPrism): PopulationFootprint { return { x: part.x, z: part.z, headingY: part.headingY,
  minY: part.baseY, maxY: part.topY, halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength, velocityX: 0, velocityZ: 0 }; }
export function incomingSignedGap(a: PopulationFootprint, b: PopulationFootprint): number {
  const axes = (h: number) => [{ x: Math.cos(h), z: -Math.sin(h) }, { x: Math.sin(h), z: Math.cos(h) }];
  const support = (p: PopulationFootprint, n: { x: number; z: number }) => { const [x, z] = axes(p.headingY);
    return Math.abs(x.x * n.x + x.z * n.z) * p.halfWidthMetres + Math.abs(z.x * n.x + z.z * n.z) * p.halfLengthMetres; };
  return Math.max(a.minY - b.maxY, b.minY - a.maxY, ...[...axes(a.headingY), ...axes(b.headingY)]
    .map(n => Math.abs((a.x - b.x) * n.x + (a.z - b.z) * n.z) - support(a, n) - support(b, n)));
}
/**
 * A crashed body's physical gap to an actor (2026-10-04): every rag particle
 * as the box of its radius in the actor's frame, and the riderless wheel. Its
 * garment envelope may brush an actor; the body itself may not enter one.
 */
export function incomingBodyGap(pose: EucPose, actor: PopulationFootprint): number {
  let value = incomingSignedGap(incomingPart(buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY).wheel), actor);
  if (pose.ragdollBlend > 0) RAGDOLL_RADII.forEach((radius, index) => { value = Math.min(value, incomingSignedGap({ x: pose.ragdoll[index * 3],
    z: pose.ragdoll[index * 3 + 2], headingY: actor.headingY, halfWidthMetres: radius, halfLengthMetres: radius,
    minY: pose.ragdoll[index * 3 + 1] - radius, maxY: pose.ragdoll[index * 3 + 1] + radius, velocityX: 0, velocityZ: 0 }, actor)); });
  return value;
}
export function incomingPlan(startX: number, z: number, kind: 'fictionalEuc' | 'trafficVehicle' = 'fictionalEuc'): PopulationPlan {
  const vehicle = kind === 'trafficVehicle';
  const frames = vehicle ? [{ x: startX, z, headingY: -Math.PI / 2, distanceMetres: 0 },
    { x: startX - 100, z, headingY: -Math.PI / 2, distanceMetres: 100 },
    { x: startX - 100, z: z + 100, headingY: 0, distanceMetres: 200 },
    { x: startX, z: z + 100, headingY: Math.PI / 2, distanceMetres: 300 },
    { x: startX, z, headingY: -Math.PI / 2, distanceMetres: 400 }]
    : [0, 100].map(distanceMetres => ({ x: startX - distanceMetres, z, headingY: -Math.PI / 2, distanceMetres }));
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'incoming-native-route', installedWorldId: 'incoming-native-route/living-r1',
    contentDigest: `incoming-native-route/${kind}`, anchors: [], paths: [{ id: 'incoming/path', role: vehicle ? 'traffic' : 'rider', district: 'commercial',
      points: frames.map(frame => ({ ...frame, y: 0, surface: 'pavement', sourceSegmentId: 'native-authored-straight' })), lengthMetres: vehicle ? 400 : 100, closed: vehicle,
      serviceShuttle: false, clearanceRadiusMetres: 4, connections: [] }],
    actors: [{ id: 'incoming', kind, pathId: 'incoming/path', initialDistanceMetres: 0, direction: 1, movement: vehicle ? 'loop' : 'shuttle',
      speedMetresPerSecond: vehicle ? A.trafficSpeedMetresPerSecond : A.eucSpeedMetresPerSecond, idleSeconds: A.idleSeconds, appearanceIndex: 0,
      hull: vehicle ? { halfWidthMetres: A.vehicleHalfWidthMetres, halfLengthMetres: A.vehicleHalfLengthMetres, heightMetres: A.vehicleHeightMetres }
        : { halfWidthMetres: A.riderRadiusMetres, halfLengthMetres: A.riderRadiusMetres, heightMetres: A.actorHeightMetres } }],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [kind], missingKinds: [] } };
}
export function warmIncoming(population: PopulationSimulation): void {
  for (let tick = 0; tick < INCOMING_WARM_TICKS; tick += 1) { population.step(INCOMING_DT); population.queryContacts([]); }
}
export function incomingCrash(value = new EucController(incomingFlat)): EucController {
  if (!value.reset(undefined, 12) || !value.hardKnock(3, 0)) throw new Error('Native crash reset/knock refused');
  for (let tick = 0; tick < 12; tick += 1) value.step(INCOMING_DT, NEUTRAL_ACTIONS);
  return value;
}
export function incomingNativeFixture() {
  const value = incomingCrash(), before = incomingPose(value), token = value.prepareStep(INCOMING_DT, NEUTRAL_ACTIONS), neutral = createPose();
  value.writePreparedPose(token, neutral);
  if (!(before.ragdollBlend > .8 && before.ragdollBlend < 1)) throw new Error('Mandatory .1 start must remain partial rag');
  const first = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY).human, next = buildRiderOccupancyEnvelope(neutral, RIDER_OCCUPANCY).human;
  const front = first.x + first.halfWidth, growth = next.x + next.halfWidth - front;
  if (!(growth > .05)) throw new Error('Actual native partial fall needs exposed right-support growth');
  const reference = new PopulationSimulation(incomingPlan(100, first.z), incomingFlat); warmIncoming(reference);
  const warm = reference.snapshot().actors[0], desiredFace = front + growth + warm.speedMetresPerSecond * INCOMING_DT / 2;
  const plan = incomingPlan(desiredFace + warm.hull.halfLengthMetres + warm.distanceMetres, first.z), population = new PopulationSimulation(plan, incomingFlat);
  warmIncoming(population);
  const occupants: PopulationOccupant[] = [{ id: 'owner', kind: 'human', previous: incomingCoarse(before), current: incomingCoarse(before) }];
  return { value, before, token, neutral, population, occupants, plan, growth };
}
