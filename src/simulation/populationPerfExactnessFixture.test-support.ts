/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The PERF-POP exactness fixture (2026-10-17): a small synthetic town with
 * every actor kind (a pedal-riding NPC wheel, tyred vans, a traffic loop, a
 * parked car, a worker, a social pair, walkers and a jogger), two riders with
 * compact parts, pedestrian-priority crossings, a reservation in a van lane,
 * the compound and legacy contact paths and knock-downs, driven tick by tick
 * in the production call order. Used by `populationPerfExactness.test.ts`.
 */
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import {
  PopulationSimulation,
  type PopulationFootprint, type PopulationOccupant, type PopulationReservation,
} from './population.ts';
import { PopulationCompactAnticipationHistory, type CompactAnticipationOwner } from './populationCompactAnticipation.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from './populationCompound.ts';
import type { TerrainSampler } from './world.ts';

export const STEP = 1 / 120;
const sampler = (): TerrainSampler => ({
  sampleGround(x, z, out) {
    out.height = 0.02 * Math.sin(x * 0.3) + 0.015 * Math.cos(z * 0.2);
    const nx = -0.006 * Math.cos(x * 0.3), nz = 0.003 * Math.sin(z * 0.2), length = Math.hypot(nx, 1, nz);
    out.normal.x = nx / length; out.normal.y = 1 / length; out.normal.z = nz / length;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
});
const line = (id: string, role: PopulationPath['role'], from: [number, number], to: [number, number]): PopulationPath => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]), heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
  return { id, role, district: 'commercial', lengthMetres: length, closed: false, serviceShuttle: role === 'service',
    clearanceRadiusMetres: 3, connections: [],
    points: [0, 0.5, 1].map(t => ({ x: from[0] + (to[0] - from[0]) * t, y: 0, z: from[1] + (to[1] - from[1]) * t,
      headingY: heading, distanceMetres: length * t, surface: 'pavement' as const, sourceSegmentId: 'driveway' })) };
};
/** A closed traffic loop: a circle walked with increasing angle, its last frame exactly its first. */
function loop(id: string, cx: number, cz: number, radius: number, segments: number): PopulationPath {
  const points: PopulationPath['points'][number][] = [];
  let distance = 0;
  for (let i = 0; i <= segments; i += 1) {
    const theta = i === segments ? 0 : i / segments * 2 * Math.PI;
    const x = cx + radius * Math.sin(theta), z = cz + radius * Math.cos(theta);
    if (i > 0) distance += Math.hypot(x - points[i - 1].x, z - points[i - 1].z);
    points.push({ x, y: 0, z, headingY: Math.atan2(Math.cos(theta), -Math.sin(theta)), distanceMetres: distance,
      surface: 'pavement', sourceSegmentId: 'loop' });
  }
  return { id, role: 'traffic', district: 'commercial', lengthMetres: distance, closed: true, serviceShuttle: false,
    clearanceRadiusMetres: 3, connections: [], points };
}
const actor = (id: string, kind: ActorSpec['kind'], pathId: string, at: number, direction: 1 | -1,
  movement: ActorSpec['movement'], speed: number, idle: number, hull: [number, number, number], anchorId?: string): ActorSpec => ({
  id, kind, pathId, initialDistanceMetres: at, direction, movement, speedMetresPerSecond: speed, idleSeconds: idle,
  appearanceIndex: 0, hull: { halfWidthMetres: hull[0], halfLengthMetres: hull[1], heightMetres: hull[2] },
  ...(anchorId ? { anchorId } : {}) });
const PERSON: [number, number, number] = [0.42, 0.42, 1.9];
const square = (x: number, z: number) => [{ x: x - 2.5, z: z - 2.5 }, { x: x + 2.5, z: z - 2.5 },
  { x: x + 2.5, z: z + 2.5 }, { x: x - 2.5, z: z + 2.5 }];
export function mixedTown(): PopulationPlan {
  const paths = [line('walk-a', 'pedestrian', [-30, 0], [30, 0]), line('walk-b', 'pedestrian', [-30, 12], [30, 12]),
    line('van-x', 'service', [-6, -30], [-6, 40]), line('van-y', 'service', [8, -30], [8, 40]),
    line('ride-c', 'rider', [-30, 24], [30, 24]), line('work-w', 'pedestrian', [-20, -8], [20, -8]),
    line('bay', 'service', [20, -20], [26, -20]), line('van-z', 'service', [-14, -60], [-14, 40]), loop('loop-t', 0, 24, 14, 48)];
  const actors = [
    actor('w1', 'walker', 'walk-a', 10, 1, 'shuttle', 1.4, 0.3, PERSON), actor('w2', 'walker', 'walk-a', 30, -1, 'shuttle', 1.4, 0.3, PERSON),
    actor('w3', 'walker', 'walk-a', 56, 1, 'shuttle', 1.4, 0.3, PERSON), actor('w4', 'walker', 'walk-b', 15, -1, 'shuttle', 1.4, 0.3, PERSON),
    actor('w5', 'walker', 'walk-b', 26, -1, 'shuttle', 1.4, 0.3, PERSON), actor('w6', 'walker', 'walk-b', 50, -1, 'shuttle', 1.4, 0.3, PERSON),
    actor('j1', 'jogger', 'walk-a', 5, -1, 'shuttle', 2.8, 0.2, [0.4, 0.4, 1.85]),
    actor('e1', 'fictionalEuc', 'ride-c', 10, 1, 'shuttle', 4, 0.5, [0.3, 0.5, 1.8]),
    actor('k1', 'worker', 'work-w', 20, 1, 'shuttle', 1.2, 1, PERSON, 'anchor-k1'),
    actor('s1', 'social', 'work-w', 5, 1, 'stationary', 0, 4, PERSON), actor('s2', 'social', 'work-w', 6.2, -1, 'stationary', 0, 4, PERSON),
    actor('p1', 'parkedVehicle', 'bay', 3, 1, 'stationary', 0, 0, [0.95, 2.2, 1.5]),
    actor('v1', 'serviceVehicle', 'van-x', 12, 1, 'shuttle', 5, 0.4, [1.02, 2.4, 2.8]),
    actor('v2', 'serviceVehicle', 'van-y', 20, 1, 'shuttle', 8, 0.4, [1.02, 2.4, 2.8]),
    // Past `vehicleLookAheadSeconds * vehicleBrakingMetresPerSecondSquared` (4.5 m/s) a van's route
    // forecast outruns the look-ahead horizon, the case the town corpus never reaches: 60 m of clear lane.
    actor('v3', 'serviceVehicle', 'van-z', 0, 1, 'shuttle', 8, 0.4, [1.02, 2.4, 2.8]),
    actor('t1', 'trafficVehicle', 'loop-t', 10, 1, 'loop', 6, 0, [0.95, 2.2, 1.5])];
  const crossings = [[-6, 0, 'walk-a', 'van-x'], [8, 0, 'walk-a', 'van-y'], [-6, 12, 'walk-b', 'van-x'], [8, 12, 'walk-b', 'van-y'],
    [7.2, 12, 'walk-b', 'loop-t']].map(([x, z, walk, lane], index) => ({ id: `crossing-${index}`, sourceId: 'driveway',
    priority: 'pedestrian' as const, corners: square(x as number, z as number), pedestrianPathIds: [walk as string], vehiclePathIds: [lane as string] }));
  const anchors = [{ id: 'anchor-k1', kind: 'worker' as const, district: 'commercial' as const, position: { x: 0, y: 0, z: -8 },
    headingY: Math.PI / 2, pathId: 'work-w', distanceMetres: 20, sourcePropIndex: 0 }];
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'perf-exactness', installedWorldId: 'perf-exactness/living-r1',
    contentDigest: 'fixture', paths, actors, anchors, crossings,
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}

type Body = PopulationOccupant['current'];
/**
 * human-0 rides walk-b head-on into its walkers, stands in their way for three
 * seconds (they wait, then step aside) and rides on across both van lanes;
 * cop-0 rides walk-a the other way. Moving ticks are counted, so a stand is a
 * true zero-velocity body.
 */
export function riderBody(id: string, tick: number): Body {
  const human = id === 'human-0', speed = human ? 4 : 3;
  const moving = (t: number) => human ? t < 240 || t >= 600 : true;
  let ticks = 0; for (let t = 0; t < tick; t += 1) if (moving(t)) ticks += 1;
  const x = human ? -28 + ticks * speed / 120 : 28 - ticks * speed / 120, z = human ? 12.3 : -0.2;
  const heading = human ? Math.PI / 2 : -Math.PI / 2, v = moving(tick) ? speed : 0;
  return { x, z, headingY: heading, minY: 0, maxY: 1.9, halfWidthMetres: 0.35, halfLengthMetres: 0.55,
    velocityX: Math.sin(heading) * v, velocityZ: Math.cos(heading) * v };
}
const parts = (body: Body) => [
  { componentId: 'wheel', footprint: { ...body, maxY: 0.55, halfWidthMetres: 0.11, halfLengthMetres: 0.3 } },
  { componentId: 'human', footprint: { ...body, minY: 0.15, halfWidthMetres: 0.3, halfLengthMetres: 0.22 } }];
const OCCUPANTS = ['cop-0', 'human-0'] as const;
const LANE_BLOCK: PopulationFootprint = { x: -6, z: 1, headingY: 0, minY: 0, maxY: 1.2, halfWidthMetres: 0.5,
  halfLengthMetres: 0.5, velocityX: 0, velocityZ: 0 };

/** One deterministic production-shaped tick sequence; `observe` runs after every public call. */
export class Ride {
  readonly simulation = new PopulationSimulation(mixedTown(), sampler());
  private readonly history = new PopulationCompactAnticipationHistory();
  private readonly controllers = new Map(OCCUPANTS.map(id => [id, {}]));
  private readonly reservations: PopulationReservation[] = [];
  readonly tally = { contacts: 0, charges: 0, knockdowns: 0, legacy: 0, compound: 0 };
  private readonly observe: (label: string) => void;
  constructor(observe: (label: string) => void = () => {}) { this.observe = observe; }
  private owners(tick: number): CompactAnticipationOwner[] {
    return OCCUPANTS.map(id => ({ id, controller: this.controllers.get(id)!, serial: 0, complete: true, components: parts(riderBody(id, tick)) }));
  }
  tick(tick: number): unknown[] {
    const sim = this.simulation, rows: unknown[] = [];
    const occupants: PopulationOccupant[] = OCCUPANTS.map(id => {
      const body = riderBody(id, tick); return { id, kind: id === 'cop-0' ? 'cop' : 'human', previous: body, current: body };
    });
    if (tick % 300 < 20 && !this.reservations.some(item => item.id === 'human-0/wheel'))
      this.reservations.push({ id: 'human-0/wheel', footprint: riderBody('human-0', tick), expiresAtClockSeconds: sim.clockSeconds + 0.3 });
    if (tick === 150) this.reservations.push({ id: 'lane-block', footprint: LANE_BLOCK });
    if (tick === 600) this.reservations.splice(this.reservations.findIndex(item => item.id === 'lane-block'), 1);
    for (let i = this.reservations.length - 1; i >= 0; i -= 1) {
      const expiry = this.reservations[i].expiresAtClockSeconds;
      if (expiry !== undefined && expiry < sim.clockSeconds) this.reservations.splice(i, 1);
    }
    const anticipation = this.history.begin(this.owners(tick), sim.tickIndex, STEP);
    sim.step(STEP, occupants, this.reservations.map(item => ({ ...item })), anticipation); this.observe('step');
    rows.push(sim.snapshot(), sim.anticipationState());
    const intents: PopulationOccupant[] = OCCUPANTS.map(id => ({ id, kind: id === 'cop-0' ? 'cop' : 'human',
      previous: riderBody(id, tick), current: riderBody(id, tick + 1) }));
    let contacts;
    if (tick % 7 === 3) {
      this.tally.legacy += 1;
      for (const intent of intents) { rows.push(sim.previewMotion(intent)); this.observe('previewMotion'); }
      contacts = sim.queryContacts(occupants, intents); this.observe('queryContacts');
    } else {
      this.tally.compound += 1;
      const census = sim.actorMotionCensus(); this.observe('census');
      const components: PopulationCompoundTrajectory[] = OCCUPANTS.flatMap(id => {
        const from = parts(riderBody(id, tick)), to = parts(riderBody(id, tick + 1));
        return from.map((part, index) => ({ ownerId: id, componentId: part.componentId, stopGroupId: id,
          at: (t: number) => ({ ...part.footprint, x: part.footprint.x + (to[index].footprint.x - part.footprint.x) * t,
            z: part.footprint.z + (to[index].footprint.z - part.footprint.z) * t }),
          intervalEnvelopeMetres: () => 0 }));
      });
      const prepared = sim.prepareCompoundContacts(intents, components, (a, b) => resolvePopulationCompoundMotionBatch(a, b),
        { actorCensus: census }); this.observe('prepareCompoundContacts');
      rows.push(prepared.actorFractions, sim.actorBodiesAtFractions(prepared.actorFractions)); this.observe('actorBodiesAtFractions');
      contacts = sim.commitContacts(prepared, intents); this.observe('commitContacts');
    }
    rows.push(contacts);
    this.tally.contacts += contacts.length;
    for (const contact of contacts) if (contact.charge) {
      this.tally.charges += 1; sim.knockDown(contact.actorId, contact.normalX, contact.normalZ); this.observe('knockDown');
    }
    if (tick % 400 === 200) for (const id of ['w1', 'w6', 'k1', 's1']) { sim.knockDown(id, 1, 0); this.tally.knockdowns += 1; this.observe('knockDown'); }
    this.history.seal(this.owners(tick + 1), sim.tickIndex);
    rows.push(sim.recoveryClearance(riderBody('human-0', tick + 1), occupants, this.reservations)); this.observe('recoveryClearance');
    return rows;
  }
}
