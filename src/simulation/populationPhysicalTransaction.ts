/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Controller-owned whole fixed-step refusal; publication happens after the final batch. */
import type { EucDynamicWorld, EucHeldPhysicalContact, EucPose, EucPreparedStep } from './EucController.ts';
import type { PopulationSimulation, PopulationContact, PopulationFootprint, PopulationOccupant, PopulationReservation, PopulationPhysicalFinalByOwner } from './population.ts';
import { adoptPopulationEnvelopeProof, type PopulationCompoundActorMotion, type PopulationCompoundHit, type PopulationCompoundMotionBatch, type PopulationCompoundTrajectory, type RefinementWork } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { sharePopulationStepRefinement } from './populationPhysicalReactionAdmission.ts';
import { resolvePopulationWholeStepRefusalPreferActorYield, type PopulationPhysicalOwner, type PopulationWholeStepResolution } from './populationWholeStepRefusal.ts';

export interface PopulationPhysicalController {
  readonly discontinuitySerial: number;
  /** Live (start-of-step) crash state; prepared candidates stay private until commit. */
  readonly crashed?: boolean;
  respondToHeldPhysicalContact(token: EucPreparedStep, held?: EucHeldPhysicalContact): { admitted: boolean; inputAdvanced: boolean };
  /** Whether a refused step's own travel could reach this fraction of the step (ground and solids). */
  physicalContactReachable?(token: EucPreparedStep, fraction: number): boolean;
  writePose(out: EucPose): void;
  resolvePreparedStep(token: EucPreparedStep, world?: EucDynamicWorld): void;
  holdPreparedStep(token: EucPreparedStep): void;
  writePreparedPose(token: EucPreparedStep, out: EucPose): void;
  commitPreparedStep(token: EucPreparedStep, publish?: boolean): void;
  publishPreparedPlacements(token: EucPreparedStep): void;
}
export interface PopulationPhysicalSeat {
  readonly id: string; readonly kind: 'human' | 'cop'; readonly controller: PopulationPhysicalController;
  /** A detached current pose; prepared entries replace it before certification. */
  readonly pose: EucPose;
}
export interface PopulationPreparedPhysicalSeat extends PopulationPhysicalSeat {
  readonly token: EucPreparedStep; readonly world: EucDynamicWorld | undefined;
}
export interface PopulationPhysicalBefore { readonly pose: EucPose; readonly serial: number }
export interface PopulationPhysicalTransaction {
  readonly population: PopulationSimulation;
  readonly certificates: PopulationPhysicalCertificates;
  readonly seats: readonly PopulationPhysicalSeat[];
  readonly preparedSeats: readonly PopulationPreparedPhysicalSeat[];
  readonly before: ReadonlyMap<string, PopulationPhysicalBefore>;
  readonly dt: number;
  readonly reservations: readonly PopulationReservation[];
  /** Explicit composition-root hold/yield policy; clear transactions are untouched. */
  readonly contactResponse?: 'yield';
  /** Explicit native crash/air policy selected by the composition root. */
  readonly preferActorYieldOwnerIds?: readonly string[];
  /** Legacy body is retained solely as owner identity/diagnostic metadata. */
  readonly bodyFromPose: (pose: EucPose) => PopulationFootprint;
}
export interface PopulationPhysicalCommit {
  readonly contacts: readonly PopulationContact[];
  readonly contactResponses: readonly { readonly ownerId: string; readonly admitted: boolean; readonly inputAdvanced: boolean }[];
  readonly resolution: PopulationWholeStepResolution & { readonly yieldedActorIds?: readonly string[] };
  readonly motionReproofPasses?: number;
}
const belongsTo = (reservation: PopulationReservation, id: string) => reservation.id === id || reservation.id.startsWith(`${id}/`);
const samePose = (a: EucPose, b: EucPose): boolean => (Object.keys(a) as (keyof EucPose)[])
  .every(key => key === 'ragdoll' ? a.ragdoll.length === b.ragdoll.length && a.ragdoll.every((value, index) => Object.is(value, b.ragdoll[index]))
    : Object.is(a[key], b[key]));
const posed = (pose: EucPose): EucPose => ({ ...pose, ragdoll: Float32Array.from(pose.ragdoll) });

/**
 * A moving candidate's proof tables, kept per controller into the next fixed
 * step (CP-1). A refused step restores its exact start, so an unchanged input
 * prepares the bit-identical candidate again and resumes its bounded proof
 * where the work bound stopped it, instead of paying the same evaluations again.
 */
interface KeptProof { readonly certificates: PopulationPhysicalCertificates; readonly start: EucPose; readonly pose: EucPose; readonly dt: number;
  readonly discontinuous: boolean; readonly components: readonly PopulationCompoundTrajectory[] }
const keptProofs = new WeakMap<PopulationPhysicalController, readonly KeptProof[]>();

/**
 * Response evidence: the refusing hit's normal (actor toward rider), whether
 * the work bound left it unproved, and whether it is a published meeting. The
 * controller measures its own impact from its travel, as a wall does; the
 * published pair contact keeps the relative closing speed.
 */
function heldContact(occupantKind: 'human' | 'cop', reason: 'contact' | 'placement' | 'conditioning',
  hit: PopulationCompoundHit | undefined, met: boolean, normal?: { readonly x: number; readonly z: number }): EucHeldPhysicalContact {
  if (reason !== 'contact' || !hit) return { reason, occupantKind, normalX: 0, normalZ: 0, pending: false, met: false };
  return { reason, occupantKind, normalX: normal?.x ?? hit.normalX, normalZ: normal?.z ?? hit.normalZ, pending: hit.conservative === true, met,
    faceX: hit.normalX, faceZ: hit.normalZ };
}
/** Square, person-sized: a round body's stand-in hull (pedestrians, NPC riders). */
const ROUND_ACTOR_HALF_METRES = 0.8;
/**
 * The contact normal a rider responds along (R2C-4, 2026-10-04). A person's
 * hull is a square stand-in for a round body, so which face it shows depends
 * on which way they happen to stand: from it, a rider glances off along the
 * line between the two bodies at the event instead. A vehicle keeps its face.
 */
function responseNormal(hit: PopulationCompoundHit, actor: PopulationCompoundActorMotion | undefined, held: boolean,
  component: PopulationCompoundTrajectory | undefined): { x: number; z: number } {
  const face = { x: hit.normalX, z: hit.normalZ };
  if (!actor || !component) return face;
  const from = actor.previous, to = held ? actor.previous : actor.current;
  if (Math.abs(from.halfWidthMetres - from.halfLengthMetres) > 1e-6 || from.halfWidthMetres > ROUND_ACTOR_HALF_METRES) return face;
  const t = hit.timeOfImpact, body = component.at(t);
  const dx = body.x - (from.x + (to.x - from.x) * t), dz = body.z - (from.z + (to.z - from.z) * t), length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: dx / length, z: dz / length } : face;
}

export function commitPopulationPhysicalTransaction(input: PopulationPhysicalTransaction): PopulationPhysicalCommit {
  const { population, certificates } = input;
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError('Physical transaction needs finite nonnegative dt');
  const seats = new Map(input.seats.map(seat => [seat.id, seat]));
  if (seats.size !== input.seats.length) throw new Error('Physical transaction needs distinct visible seats');
  const preparedIdentities = new Set<string>();
  for (const seat of input.preparedSeats) {
    const visible = seats.get(seat.id), before = input.before.get(seat.id);
    if (preparedIdentities.has(seat.id)) throw new Error('Physical transaction needs distinct prepared seats');
    preparedIdentities.add(seat.id);
    if (!visible || visible.controller !== seat.controller || visible.kind !== seat.kind) throw new Error('Prepared seat must match its visible physical controller and kind');
    if (!before || before.serial !== seat.controller.discontinuitySerial) throw new Error('Prepared physical seat needs its exact current start snapshot');
  }
  const actorCensus = population.actorMotionCensus(), actors = actorCensus.actors,
    prepared = new Map(input.preparedSeats.map(seat => [seat.id, seat]));
  const start = (seat: PopulationPhysicalSeat) => input.before.get(seat.id)?.pose ?? seat.pose;
  const discontinuous = (seat: PopulationPhysicalSeat) => {
    const before = input.before.get(seat.id), candidate = prepared.get(seat.id);
    return before !== undefined && before.serial !== (candidate?.token.discontinuitySerial ?? seat.controller.discontinuitySerial);
  };
  const endpointCache = new Map<string, readonly PopulationCompoundTrajectory[]>();
  const endpoints = (seat: PopulationPhysicalSeat, refused: ReadonlySet<string>) => {
    const held = refused.has(seat.id), key = `${seat.id}/${held ? 'held' : 'accepted'}`;
    let value = endpointCache.get(key);
    if (!value) { const pose = held ? start(seat) : seat.pose;
      value = certificates.components(seat.id, pose, pose, 0, held ? 'held' : 'placement'); endpointCache.set(key, value); }
    return value;
  };
  // The neutral selection candidate and its native replay are usually
  // bit-identical, and so is a held owner's next retry. Their same-named
  // components then share one proof table, so each enclosure is paid once.
  const proofs = new Map<string, KeptProof[]>();
  const reusedMoving = (seat: PopulationPhysicalSeat, owner: PopulationPhysicalOwner, isDiscontinuous: boolean) => () => {
    const components = owner.movingComponents(), from = start(seat), tick = proofs.get(seat.id) ?? [];
    const known = [...tick, ...(keptProofs.get(seat.controller) ?? [])].find(entry => entry.certificates === certificates
      && entry.discontinuous === isDiscontinuous && entry.dt === input.dt && samePose(entry.pose, seat.pose) && samePose(entry.start, from));
    if (known) for (const component of components) {
      const twin = known.components.find(value => value.componentId === component.componentId);
      if (twin) adoptPopulationEnvelopeProof(twin, component);
    }
    tick.push({ certificates, start: posed(from), pose: posed(seat.pose), dt: input.dt, discontinuous: isDiscontinuous, components }); proofs.set(seat.id, tick);
    return components;
  };
  const makeOwners = (): PopulationPhysicalOwner[] => [...seats.values()].map(seat => {
    const candidate = prepared.get(seat.id);
    // A controller that did not prepare this tick is already a parked body
    // or a checked direct placement. It has no discarded private candidate.
    // A body that starts the step crashed keeps its native fall (R2C-1/R2C-3).
    const fresh = certificates.owner(seat.id, candidate ? start(seat) : seat.pose, seat.pose,
      candidate ? input.dt : 0, actors, Boolean(candidate && discontinuous(seat)), seat.controller.crashed === true);
    const owner = candidate ? { ...fresh, movingComponents: reusedMoving(seat, fresh, discontinuous(seat)) } : fresh;
    if (!candidate || !discontinuous(seat)) return owner;
    return { ...owner, placementAllowed: (batch: PopulationCompoundMotionBatch, _components: readonly PopulationCompoundTrajectory[], refused: ReadonlySet<string>) => {
      const actorBodies = population.actorBodiesAtFractions(batch.actorFractions);
      // **A seat never vetoes a seat** (RP-7, 2026-10-03), as in
      // `Game.populationPhysicalPlacementClear`: a human recovery ignores the
      // other riders' bodies and reservations — 1.6 m abreast slots sit
      // inside a mounted body's clearance, and M26 contact eases riders
      // apart. `downed`: a body that starts the step crashed never holds any
      // recovery — `recoveryClearance` owns that rule. NPCs, mounted CPU
      // cops and cop reservations still refuse; a cop still sees every seat.
      const human = seat.kind === 'human';
      const seatOwned = (id: string) => id.startsWith('human-') || seats.get(id.split('/')[0])?.kind === 'human';
      const otherBodies: PopulationOccupant[] = [...seats.values()]
        .filter(other => other.id !== seat.id && !(human && other.kind === 'human')).flatMap(other =>
        endpoints(other, refused).map(component => { const body = component.at(0);
          return { id: `${other.id}/${component.componentId}`, kind: other.kind, previous: body, current: body,
            downed: other.controller.crashed === true }; }));
      const reservations = input.reservations.filter(item => !belongsTo(item, seat.id) && !(human && seatOwned(item.id)));
      return endpoints(seat, new Set()).every(component => population.recoveryClearance(component.at(0), otherBodies,
        reservations, undefined, actorBodies).clear);
    } };
  });
  // One refinement budget per owner, and one for the whole fixed step across
  // every owner (CP-1, R2C-6), which the step's late reactions (the contact
  // responses below) share.
  const refinement = new Map<string, RefinementWork>();
  sharePopulationStepRefinement(population, refinement);
  const preferred = new Set(input.preferActorYieldOwnerIds ?? []);
  for (const id of preferred) if (!prepared.has(id)) throw new Error('Actor yield preference needs a prepared physical owner');
  // **An actor that walks or drives into a rider yields first** (R2C-5,
  // 2026-10-04): every prepared owner may hold a moving actor at its start for
  // the step, and is refused only if its own path still meets that held body.
  // A walker turning round at its shuttle end into a stopped rider's body
  // refused the rider's every input, braking and reversing included.
  const eligible = new Set(input.preparedSeats.map(seat => seat.id));
  let owners: PopulationPhysicalOwner[] = [], resolution: PopulationWholeStepResolution & { readonly yieldedActorIds?: readonly string[] }, motionReproofPasses = 0;
  const yielded = new Set<string>();
  if (preferred.size) {
    // The neutral native candidate contains the genuine full-dt intent before
    // any NPC side constraint. Choose possible whole-start actor yields here,
    // then replay native physics with those query bodies and prove it again.
    // Otherwise a constraint could erase the incoming actor event before this
    // policy sees it, needlessly displacing a falling body that traffic can yield to.
    for (const seat of input.preparedSeats) {
      if (seat.token.ready || seat.token.held) throw new Error('Actor yield selection needs untouched neutral prepared candidates');
      seat.controller.writePreparedPose(seat.token, seat.pose); seats.set(seat.id, seat);
    }
    owners = makeOwners();
    const selection = resolvePopulationWholeStepRefusalPreferActorYield(actors, owners, yielded, preferred, refinement);
    for (const id of selection.yieldedActorIds) yielded.add(id);
  }
  while (true) {
    motionReproofPasses += 1;
    // Every native replay starts from the controller's SAME untouched start
    // and original dt/actions. Actor choice is immutable query data; no live
    // actor, clock, impact pair, controller or placement journal is published.
    const actorBodies = actors.map(actor => yielded.has(actor.id)
      ? { ...actor.previous, velocityX: 0, velocityZ: 0 } : actor.current);
    for (const seat of input.preparedSeats) {
      const world = seat.world;
      seat.controller.resolvePreparedStep(seat.token, world ? { ...world,
        ...(preferred.size || yielded.size ? { ragObstacleBodies: () => actorBodies } : {}),
        resolveMotion: () => null, canPlace: () => true } : undefined);
      seat.controller.writePreparedPose(seat.token, seat.pose); seats.set(seat.id, seat);
    }
    endpointCache.clear(); owners = makeOwners();
    resolution = resolvePopulationWholeStepRefusalPreferActorYield(actors, owners, yielded, eligible, refinement);
    const additions = (resolution.yieldedActorIds ?? []).filter(id => !yielded.has(id));
    if (!additions.length) break;
    for (const id of additions) yielded.add(id);
    // New actor starts may change native side constraints/recovery queries.
    // Recompute EVERY prepared human/cop and recertify the complete batch;
    // never reuse a body computed against a discarded actor endpoint.
    if (motionReproofPasses > actors.length) throw new Error('Actor-start native reproof exceeded monotone actor bound');
  }
  const refused = new Set(resolution!.refusedOwnerIds);
  for (const seat of input.preparedSeats) if (refused.has(seat.id)) {
    seat.controller.holdPreparedStep(seat.token); seat.controller.writePreparedPose(seat.token, seat.pose);
  }
  const intents: PopulationOccupant[] = [...seats.values()].map(seat => ({ id: seat.id, kind: seat.kind,
    previous: input.bodyFromPose(start(seat)), current: input.bodyFromPose(seat.pose),
    teleported: discontinuous(seat) && (!prepared.has(seat.id) || !refused.has(seat.id)) }));
  const finalByOwner: Record<string, PopulationPhysicalFinalByOwner[string]> = Object.create(null);
  for (const seat of seats.values()) {
    const descriptors = resolution.components.filter(component => component.ownerId === seat.id);
    finalByOwner[seat.id] = !refused.has(seat.id) && discontinuous(seat) && descriptors.length
      ? endpoints(seat, refused).map(component => ({ componentId: component.componentId, footprint: component.at(0) }))
      : descriptors.map(component => ({ componentId: component.componentId, footprint: component.at(1) }));
  }
  // Direct checked resets retain their history discontinuity. Actors may
  // stop against a newly installed constant body, but placement cannot mint
  // a rider impact or an interpolated path from the old body to the new one.
  const teleported = new Set(intents.filter(person => person.teleported).map(person => person.id));
  // A riding human whose proved, reachable contact refused the whole step has
  // met the actor: publish that meeting against the held body so the actor's
  // impact pause and pair cooldown run (POP-3). A budget refusal proved
  // nothing; a falling body or a cop keeps the historic no-publication hold.
  const met = new Set(input.contactResponse === 'yield' ? input.preparedSeats.filter(seat => {
    const hit = resolution!.refusalHits[seat.id];
    return hit && refused.has(seat.id) && resolution!.refusalReasons[seat.id] === 'contact' && !hit.conservative
      && !preferred.has(seat.id) && seat.kind === 'human'
      && (seat.controller.physicalContactReachable?.(seat.token, hit.timeOfImpact) ?? true);
  }).map(seat => seat.id) : []);
  const refusalHits = [...met].map(id => resolution!.refusalHits[id]);
  // A falling body keeps the historic no-publication rule: its garment sweep
  // only stops and yields actors, it charges no impact (2026-10-04).
  const falling = new Set(owners.filter(owner => owner.nativeFall).map(owner => owner.ownerId));
  const finalBatch = { ...resolution.batch, hits: [...resolution.batch.hits, ...refusalHits].filter(hit => !teleported.has(hit.ownerId) && !falling.has(hit.ownerId)) };
  const contacts = population.prepareCompoundContacts(intents, resolution.components, () => finalBatch, {
    actorCensus,
    ownerFractions: resolution.ownerFractions, physicalFinalByOwner: finalByOwner,
    coarseExcludedOwnerIds: owners.filter(owner => !owner.admitted).map(owner => owner.ownerId),
  });
  // Seal every physical controller before actor cooldowns or callbacks can
  // observe this epoch. A rejected candidate publishes no placement journal.
  for (const seat of input.preparedSeats) seat.controller.commitPreparedStep(seat.token, false);
  const published = population.commitContacts(contacts, intents);
  const contactResponses: Array<{ ownerId: string; admitted: boolean; inputAdvanced: boolean }> = [];
  const finalYielded = new Set(resolution.yieldedActorIds ?? []);
  if (input.contactResponse === 'yield') for (const seat of input.preparedSeats) {
    const reason = resolution.refusalReasons[seat.id];
    if (!reason) continue;
    // The original motion is already refused and every controller/NPC is now
    // sealed. A fresh atomic response queries actual final actor bodies; it
    // creates no impact from the discarded candidate or a later NPC suffix.
    // Every refusal reason answers, so a crash always progresses (CP-2/CP-3).
    // An unreachable meeting (a long step past a kerb) is answered unmet.
    const hit = resolution.refusalHits[seat.id];
    const normal = hit ? responseNormal(hit, actors.find(actor => actor.id === hit.actorId), finalYielded.has(hit.actorId),
      resolution.components.find(component => component.ownerId === seat.id && component.componentId === hit.componentId)) : undefined;
    const response = seat.controller.respondToHeldPhysicalContact(seat.token,
      heldContact(seat.kind, reason, hit, met.has(seat.id), normal));
    const out = seat.pose; seat.controller.writePose(out);
    contactResponses.push({ ownerId: seat.id, ...response });
  }
  for (const seat of input.preparedSeats) seat.controller.publishPreparedPlacements(seat.token);
  // Only the last two distinct candidates (a selection and its replay) can recur.
  for (const seat of input.preparedSeats) {
    const kept: KeptProof[] = [];
    for (const entry of [...(proofs.get(seat.id) ?? [])].reverse()) {
      if (kept.length < 2 && !kept.some(other => other.discontinuous === entry.discontinuous && other.dt === entry.dt
        && samePose(other.pose, entry.pose) && samePose(other.start, entry.start))) kept.push(entry);
    }
    keptProofs.set(seat.controller, kept);
  }
  return { contacts: published, resolution: resolution!, contactResponses, ...(preferred.size ? { motionReproofPasses } : {}) };
}
