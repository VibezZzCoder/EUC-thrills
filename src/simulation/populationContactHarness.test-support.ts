/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Headless composition-root double for the shared physical population epoch.
 * It mirrors Game's fixed-step order for one human seat: population step,
 * neutral prepared candidate, whole-step transaction with the yield response,
 * then the seat's finish. The port mirrors Game.populationPort: native rag side
 * bodies, no motion resolver, compact reaction admission and checked placement
 * with reservations. Test support only; it imports nothing from the app layer.
 */
import { EucController, createPose, type EucDynamicWorld, type EucPose, type Spawn } from './EucController.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { POPULATION, POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { PopulationSimulation, type PopulationContact, type PopulationFootprint, type PopulationReservation } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction, type PopulationPhysicalCommit } from './populationPhysicalTransaction.ts';
import { resolvePopulationCompoundMotionBatch } from './populationCompound.ts';
import type { TerrainSampler } from './world.ts';
import type { RiderOccupancyPose } from '../shared/riderOccupancy.ts';

export const HARNESS_DT = 1 / 120;

export const flatPavement: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};

/** A straight authored path of two points along +Z at a fixed x. */
export function straightPath(id: string, x: number, z0: number, z1: number,
  role: PopulationPath['role'] = 'pedestrian'): PopulationPath {
  return { id, role, district: role === 'pedestrian' ? 'park' : 'commercial',
    points: [z0, z1].map((z, index) => ({ x, y: 0, z, headingY: 0, distanceMetres: index * Math.abs(z1 - z0),
      surface: 'pavement' as const, sourceSegmentId: `${id}/source` })),
    lengthMetres: Math.abs(z1 - z0), closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] };
}

/** One stationary person (the real generated world's pedestrian hull) at (x, z). */
export function stationaryPerson(id: string, x: number, z: number, kind: ActorSpec['kind'] = 'social'): { path: PopulationPath; actor: ActorSpec } {
  return { path: straightPath(`${id}-path`, x, z - 2, z + 2),
    actor: { id, kind, pathId: `${id}-path`, initialDistanceMetres: 2, direction: 1, movement: 'stationary',
      speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0,
      hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } } };
}

/** One stationary parked car hull centred at (x, z), heading along +Z. */
export function stationaryCar(id: string, x: number, z: number): { path: PopulationPath; actor: ActorSpec } {
  return { path: straightPath(`${id}-path`, x, z - 3, z + 3, 'traffic'),
    actor: { id, kind: 'parkedVehicle', pathId: `${id}-path`, initialDistanceMetres: 3, direction: 1, movement: 'stationary',
      speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0,
      hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } } };
}

export function populationPlanOf(parts: readonly { path: PopulationPath; actor: ActorSpec }[]): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'contact-harness', installedWorldId: 'contact-harness/living-r1',
    contentDigest: 'contact-harness', anchors: [], paths: parts.map(part => part.path), actors: parts.map(part => part.actor),
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}

export interface HarnessStep {
  readonly milliseconds: number;
  readonly commit: PopulationPhysicalCommit;
  readonly held: boolean;
  readonly impact: number;
}

export class PopulationContactHarness {
  readonly id: string;
  readonly kind: 'human' | 'cop';
  readonly population: PopulationSimulation;
  readonly certificates: PopulationPhysicalCertificates;
  readonly controller: EucController;
  reservations: PopulationReservation[] = [];
  contacts: readonly PopulationContact[] = [];
  private epochOpen = false;

  constructor(plan: PopulationPlan, spawn: Spawn, sampler: TerrainSampler = flatPavement, kind: 'human' | 'cop' = 'human') {
    this.kind = kind; this.id = kind === 'human' ? 'human-0' : 'cop-0';
    this.population = new PopulationSimulation(plan, sampler);
    this.certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
    this.certificates.warm();
    this.controller = new EucController(sampler, { spawn, dynamicWorld: this.port() });
  }

  pose(): EucPose { const out = createPose(); this.controller.writePose(out); return out; }

  bodyFromPose(pose: EucPose): PopulationFootprint {
    return { x: pose.x, z: pose.z, headingY: pose.headingY, minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres,
      halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
      velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed };
  }

  /** Game.populationPhysicalPlacementClear for a single seat world. */
  private placementClear(pose: RiderOccupancyPose, constructing: boolean): boolean {
    const parts = this.certificates.components(this.id, pose, pose, 0, 'placement');
    const reservations = this.reservations.filter(value => value.id.split('/')[0] !== this.id);
    if (!parts.every(component => this.population.recoveryClearance(component.at(0), [], reservations).clear)) return false;
    return !this.epochOpen || constructing || this.population.contactsCommitted
      || resolvePopulationCompoundMotionBatch(this.population.actorMotions(), parts).hits.length === 0;
  }

  private port(): EucDynamicWorld {
    return { hull: POPULATION_OCCUPANT, occupantKind: this.kind,
      ragObstacleBodies: () => this.population.actorFootprints(),
      resolveMotion: () => null,
      canReact: request => populationPhysicalReactionAllowed({ ownerId: this.id, request, population: this.population,
        certificates: this.certificates, occupants: [{ id: this.id, pose: this.pose() }], reservations: this.reservations }),
      canPlace: request => this.placementClear(request.occupancyPose, request.reason === 'construct'),
      didPlace: request => {
        this.reservations = this.reservations.filter(value => value.id.split('/')[0] !== this.id);
        for (const component of this.certificates.components(this.id, request.occupancyPose, request.occupancyPose, 0, 'placement')) {
          this.reservations.push({ id: `${this.id}/${component.componentId}`, footprint: component.at(0),
            expiresAtClockSeconds: this.population.clockSeconds + POPULATION.placementReservationSeconds });
        }
      } };
  }

  /** One Game fixed step for the single seat, timed end to end. */
  step(actions: ActionSnapshot = NEUTRAL_ACTIONS, dt = HARNESS_DT): HarnessStep {
    const started = performance.now();
    const pose = this.pose(), body = this.bodyFromPose(pose), serial = this.controller.discontinuitySerial;
    this.epochOpen = true;
    this.reservations = this.reservations.filter(value => value.expiresAtClockSeconds === undefined
      || value.expiresAtClockSeconds >= this.population.clockSeconds);
    this.population.step(dt, [{ id: this.id, kind: this.kind, previous: body, current: body }], this.reservations);
    const token = this.controller.prepareStep(dt, actions), prepared = createPose();
    this.controller.writePreparedPose(token, prepared);
    const seat = { id: this.id, kind: this.kind, controller: this.controller };
    const commit = commitPopulationPhysicalTransaction({ population: this.population, certificates: this.certificates,
      seats: [{ ...seat, pose }], preparedSeats: [{ ...seat, pose: prepared, token, world: this.port() }],
      before: new Map([[this.id, { pose, serial }]]), dt, reservations: this.reservations, contactResponse: 'yield',
      preferActorYieldOwnerIds: this.controller.crashed || !this.controller.isGrounded ? [this.id] : [],
      bodyFromPose: value => this.bodyFromPose(value) });
    this.epochOpen = false;
    this.contacts = commit.contacts;
    return { milliseconds: performance.now() - started, commit, held: token.held, impact: this.controller.obstacleImpact };
  }

  /** The native crash funnel a wall uses; private in TypeScript only. */
  crash(cause: 'obstacle' | 'struck', speed: number, side: number): void {
    (this.controller as unknown as { beginCrash(cause: string, speed: number, side: number): void }).beginCrash(cause, speed, side);
  }

  /** The reported crash clock (zero once recovered). */
  crashTime(): number { return this.controller.snapshot().crashTime; }
}
