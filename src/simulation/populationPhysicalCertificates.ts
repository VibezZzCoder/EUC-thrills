/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Reusable physical certificate ownership; all inputs are pure coefficient/pose values. */
import type { RiderOccupancyCoefficients, RiderOccupancyIntervalInput, RiderOccupancyPose, RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import type { PopulationCompoundActorMotion, PopulationCompoundTrajectory } from './populationCompound.ts';
import type { PopulationFootprint } from './population.ts';
import { compileRiderOccupancyCertificate, type CompiledOccupancySlot, type CompiledOccupancyTemplate, type OccupancyCertificateKind } from '../shared/compiledOccupancy.ts';
import { checkInterval } from '../shared/occupancyExpressions.ts';
import { coarseMountedHumanWorldAabb, coarseWheelWorldAabb, aabbsOverlap } from '../shared/occupancyBroadphase.ts';
import { coarseActorMotionWorldAabb } from '../shared/occupancyBroadphase.ts';
import type { PopulationPhysicalOwner } from './populationWholeStepRefusal.ts';
import { POPULATION } from '../data/tuning.ts';
type Aabb = ReturnType<typeof coarseWheelWorldAabb>;
type MutableAabb = { -readonly [K in keyof Aabb]: Aabb[K] };
const PARTICLES = 11;
/** The largest straight-line particle travel of a step whose two ends both carry a rag. */
function particleTravel(previous: RiderOccupancyPose, current: RiderOccupancyPose): number {
  if (!(previous.ragdollBlend > 0 && current.ragdollBlend > 0)) return 0;
  let travel = 0;
  for (let index = 0; index < PARTICLES * 3; index += 3) travel = Math.max(travel, Math.hypot(current.ragdoll[index] - previous.ragdoll[index],
    current.ragdoll[index + 1] - previous.ragdoll[index + 1], current.ragdoll[index + 2] - previous.ragdoll[index + 2]));
  return travel;
}
/**
 * A crashed body's admission box, from where its body physically is (R2C-1,
 * CR-1, 2026-10-04): the particles at both ends, grown by the contact shape's
 * reach beyond them (`ragAdmissionReachMetres`), the step's own particle
 * travel and the skin. While the rag is still blending in, the mounted share
 * is bounded as the mounted broadphase bounds it, and may hang off the blended
 * root by that same mounted radius. The old box grew with the square of the
 * rag frame's rotation gain (a 316 m radius in an ordinary wipeout), so falls
 * nowhere near anybody were admitted and held. Admission only: never a contact shape.
 */
function physicalRagHumanWorldAabb(input: RiderOccupancyIntervalInput): Aabb {
  const box: MutableAabb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const grow = (other: Aabb, pad = 0) => {
    box.minX = Math.min(box.minX, other.minX - pad); box.maxX = Math.max(box.maxX, other.maxX + pad);
    box.minY = Math.min(box.minY, other.minY - pad); box.maxY = Math.max(box.maxY, other.maxY + pad);
    box.minZ = Math.min(box.minZ, other.minZ - pad); box.maxZ = Math.max(box.maxZ, other.maxZ + pad);
  };
  for (const pose of [input.previous, input.current]) {
    const blend = Math.max(0, Math.min(1, pose.ragdollBlend));
    let pad: number = POPULATION.ragAdmissionReachMetres;
    if (blend < 1) {
      const mounted = { ...pose, ragdollBlend: 0 }, shell = coarseMountedHumanWorldAabb({ previous: mounted, current: mounted, coefficients: input.coefficients });
      grow(shell);
      pad = Math.max(pad, (shell.maxY - shell.minY) / 2);
    }
    if (blend <= 0) continue;
    if (pose.ragdoll.length < PARTICLES * 3) throw new Error('Active rider occupancy requires eleven world-space ragdoll particles');
    const particles: MutableAabb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let index = 0; index < PARTICLES * 3; index += 3) {
      const x = pose.ragdoll[index], y = pose.ragdoll[index + 1], z = pose.ragdoll[index + 2];
      particles.minX = Math.min(particles.minX, x); particles.maxX = Math.max(particles.maxX, x);
      particles.minY = Math.min(particles.minY, y); particles.maxY = Math.max(particles.maxY, y);
      particles.minZ = Math.min(particles.minZ, z); particles.maxZ = Math.max(particles.maxZ, z);
    }
    grow(particles, pad);
  }
  const margin = particleTravel(input.previous, input.current) + POPULATION.contactSkinMetres + POPULATION.epsilon;
  const result = { minX: box.minX - margin, maxX: box.maxX + margin, minY: box.minY - margin, maxY: box.maxY + margin, minZ: box.minZ - margin, maxZ: box.maxZ + margin };
  if (!Object.values(result).every(Number.isFinite)) throw new RangeError('Non-finite rag admission bound');
  return result;
}
/** `ragdoll.ts`' particle radii: pelvis, chest, head, hips, shoulders, hands, feet. */
const PARTICLE_RADII = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07] as const;
/**
 * A falling body's prism grown, in its own heading frame, to every particle
 * with its radius (2026-10-04): the blended rag frame lags its particles, so
 * an actor stopping at the prism alone could step into a thrown hand or foot.
 */
function withParticles(body: PopulationFootprint, pose: RiderOccupancyPose): PopulationFootprint {
  if (!(pose.ragdollBlend > 0) || pose.ragdoll.length < PARTICLES * 3) return body;
  const c = Math.cos(body.headingY), s = Math.sin(body.headingY);
  let minX = -body.halfWidthMetres, maxX = body.halfWidthMetres, minZ = -body.halfLengthMetres, maxZ = body.halfLengthMetres, minY = body.minY, maxY = body.maxY;
  for (let index = 0; index < PARTICLES; index += 1) {
    const dx = pose.ragdoll[index * 3] - body.x, dz = pose.ragdoll[index * 3 + 2] - body.z, y = pose.ragdoll[index * 3 + 1], r = PARTICLE_RADII[index];
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    minX = Math.min(minX, lx - r); maxX = Math.max(maxX, lx + r); minZ = Math.min(minZ, lz - r); maxZ = Math.max(maxZ, lz + r);
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { ...body, x: body.x + cx * c + cz * s, z: body.z - cx * s + cz * c, halfWidthMetres: (maxX - minX) / 2, halfLengthMetres: (maxZ - minZ) / 2, minY, maxY };
}
const detached = (pose: RiderOccupancyPose): RiderOccupancyPose => ({ ...pose, ragdoll: Float64Array.from(pose.ragdoll) });
const isSamePose = (a: RiderOccupancyPose, b: RiderOccupancyPose) => Object.keys(a).every(key => key === 'ragdoll' ? Array.from(a.ragdoll).every((v, i) => v === b.ragdoll[i]) : a[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>] === b[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>]);
export const footprintFromOccupancy = (p: RiderOccupancyPrism, velocityX = 0, velocityZ = 0): PopulationFootprint => ({ x: p.x, z: p.z, headingY: p.headingY,
  halfWidthMetres: p.halfWidth, halfLengthMetres: p.halfLength, minY: p.baseY, maxY: p.topY, velocityX, velocityZ });
export class PopulationPhysicalCertificates {
  private readonly coefficients: RiderOccupancyCoefficients; private readonly prototype: RiderOccupancyPose;
  private readonly templates = new Map<OccupancyCertificateKind, CompiledOccupancyTemplate>(); private readonly slots = new Map<string, CompiledOccupancySlot>();
  constructor(coefficients: RiderOccupancyCoefficients, prototype: RiderOccupancyPose) { this.coefficients = coefficients; this.prototype = prototype; }
  /** Call while installing/loading a world so first contact pays no compiler setup. */
  warm(): void { for (const kind of ['wheel', 'mounted-human', 'rag-human'] as const) this.template(kind); }
  get allocatedSlotCount(): number { return this.slots.size; }
  private template(kind: OccupancyCertificateKind): CompiledOccupancyTemplate {
    let template = this.templates.get(kind); if (!template) { template = compileRiderOccupancyCertificate(kind, this.coefficients, this.prototype); this.templates.set(kind, template); } return template;
  }
  private slot(ownerId: string, kind: OccupancyCertificateKind, role: string): CompiledOccupancySlot {
    const key = `${ownerId}/${kind}/${role}`; let slot = this.slots.get(key); if (!slot) { slot = this.template(kind).createSlot(); this.slots.set(key, slot); } return slot;
  }
  components(ownerId: string, before: RiderOccupancyPose, after: RiderOccupancyPose, dt: number, role: 'moving' | 'held' | 'placement',
    only?: readonly OccupancyCertificateKind[]): readonly PopulationCompoundTrajectory[] {
    if (role !== 'moving' && !isSamePose(before, after)) throw new RangeError('Held/placement components require one unchanged physical pose');
    const kinds: readonly OccupancyCertificateKind[] = only ?? ['wheel', before.ragdollBlend > 0 || after.ragdollBlend > 0 ? 'rag-human' : 'mounted-human'];
    return kinds.map(kind => {
      const slot = this.slot(ownerId, kind, role); slot.load(before, after);
      // Held and placement descriptors carry zero velocity, so only a moving
      // role reads its endpoints here (eagerly, as before). A point at() cannot
      // throw once load() has accepted the pose; callers evaluate it on demand.
      let velocityX = 0, velocityZ = 0;
      if (role === 'moving') {
        const a = slot.at(0), b = slot.at(1), moving = dt > 0;
        velocityX = moving ? (b.x - a.x) / dt : 0; velocityZ = moving ? (b.z - a.z) / dt : 0;
      }
      return { ownerId, componentId: slot.component, stopGroupId: 'physical', at: t => footprintFromOccupancy(slot.at(t), velocityX, velocityZ),
        intervalEnvelopeMetres: (from, to) => { if (role !== 'moving') { checkInterval(from, to); return 0; } return slot.intervalEnvelopeMetres(from, to); } };
    });
  }
  /**
   * A crashed body's human as the straight sweep between its two exact
   * compiled endpoint prisms, each grown to its particles (R2C-1/R2C-6,
   * 2026-10-04). The particles themselves move in straight lines over a fixed
   * step; the rag certificate's enclosure was ~100x looser than that motion and
   * cost up to 13 ms a step beside a person. Actors stop and yield against
   * this shape; the fall itself answers to its particles and wheel.
   */
  private ragSweep(ownerId: string, before: RiderOccupancyPose, after: RiderOccupancyPose, dt: number): PopulationCompoundTrajectory {
    const slot = this.slot(ownerId, 'rag-human', 'moving'); slot.load(before, after);
    const first = withParticles(footprintFromOccupancy(slot.at(0)), before), last = withParticles(footprintFromOccupancy(slot.at(1)), after);
    const velocityX = dt > 0 ? (last.x - first.x) / dt : 0, velocityZ = dt > 0 ? (last.z - first.z) / dt : 0;
    // One heading frame: a crash never turns its wheel's heading (only a recovery placement does).
    const turn = last.headingY - first.headingY;
    return { ownerId, componentId: 'human', stopGroupId: 'physical', intervalEnvelopeMetres: (from, to) => { checkInterval(from, to); return 0; },
      at: t => t === 0 ? { ...first, velocityX, velocityZ } : t === 1 ? { ...last, velocityX, velocityZ } : {
        x: first.x + (last.x - first.x) * t, z: first.z + (last.z - first.z) * t, headingY: first.headingY + turn * t,
        halfWidthMetres: first.halfWidthMetres + (last.halfWidthMetres - first.halfWidthMetres) * t,
        halfLengthMetres: first.halfLengthMetres + (last.halfLengthMetres - first.halfLengthMetres) * t,
        minY: first.minY + (last.minY - first.minY) * t, maxY: first.maxY + (last.maxY - first.maxY) * t, velocityX, velocityZ } };
  }
  /**
   * `nativeFall` (2026-10-04): this owner started the step crashed. Its native
   * fall is never held (R2C-1/R2C-3): actors stop and yield against it, and
   * only a recovery placement may refuse it. Its own body answers to its rag
   * particles and wheel against the actors inside the native step.
   */
  owner(ownerId: string, previous: RiderOccupancyPose, current: RiderOccupancyPose, dt: number, actors: readonly PopulationCompoundActorMotion[], discontinuous = false,
    nativeFall = false): PopulationPhysicalOwner {
    const before = detached(previous), after = detached(current), input = { previous: before, current: discontinuous ? before : after, coefficients: this.coefficients };
    const activeRag = input.previous.ragdollBlend > 0 || input.current.ragdollBlend > 0;
    const boxes = [coarseWheelWorldAabb(input), activeRag ? physicalRagHumanWorldAabb(input) : coarseMountedHumanWorldAabb(input)];
    const admitted = actors.some(actor => (actor.ownerId ?? `actor:${actor.id}`) !== ownerId && boxes.some(box => aabbsOverlap(box, coarseActorMotionWorldAabb(actor.previous, actor.current))));
    // No crashed body waits for a frame certificate any more: its human is the
    // straight sweep between its exact ends, which needs none (CR-1). A body
    // that only starts its fall in this step keeps the certified enclosure.
    const end = discontinuous ? before : after;
    const fallStart = !nativeFall && !discontinuous && !(before.ragdollBlend > 0) && after.ragdollBlend > 0;
    return { ownerId, admitted, requiresConditioningHold: false, ...(nativeFall ? { nativeFall: true } : {}), ...(fallStart ? { fallStart: true } : {}),
      movingComponents: () => nativeFall && activeRag && !isSamePose(before, end)
        ? [this.components(ownerId, before, end, dt, 'moving', ['wheel'])[0], this.ragSweep(ownerId, before, end, dt)]
        : this.components(ownerId, before, end, dt, 'moving'),
      heldComponents: () => this.components(ownerId, before, before, 0, 'held') };
  }
}
