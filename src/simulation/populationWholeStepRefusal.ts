/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Monotone whole-controller refusal before any publication; no fractional pose commit. */
import { resolvePopulationCompoundMotionBatch, turningInPlace, type PopulationCompoundActorMotion, type PopulationCompoundHit, type PopulationCompoundMotionBatch, type PopulationCompoundTrajectory, type RefinementWork } from './populationCompound.ts';

export interface PopulationPhysicalOwner {
  readonly ownerId: string;
  /** False means certified coarse bounds exclude every original actor motion. */
  readonly admitted: boolean;
  /** Immutable original prepared candidate, lazily bound once per owner. */
  readonly movingComponents: () => readonly PopulationCompoundTrajectory[];
  /** Exact untouched start physical components, with zero descriptor velocity. */
  readonly heldComponents: () => readonly PopulationCompoundTrajectory[];
  /** Explicit proof admission policy, not an impact or a giant contact shape. */
  readonly requiresConditioningHold?: boolean;
  /**
   * A body that started the step crashed (2026-10-04): its native fall is never
   * held (R2C-1/R2C-3). Actors still stop and yield against it, and only its
   * recovery placement may refuse it; a contact or conditioning verdict cannot.
   */
  readonly nativeFall?: boolean;
  /**
   * A body whose fall starts inside this step (2026-10-04): its certified
   * enclosure still decides, and a proved meeting holds it, but a proof the
   * work bound left unfinished does not, so a wipeout beside someone is never
   * held mounted at its first step for want of evaluations.
   */
  readonly fallStart?: boolean;
  /** Discontinuous reset/recovery targets use endpoint placement clearance. */
  readonly placementAllowed?: (batch: PopulationCompoundMotionBatch, components: readonly PopulationCompoundTrajectory[], refusedOwners: ReadonlySet<string>) => boolean;
}
export interface PopulationWholeStepResolution {
  readonly batch: PopulationCompoundMotionBatch;
  readonly components: readonly PopulationCompoundTrajectory[];
  readonly refusedOwnerIds: readonly string[];
  readonly ownerFractions: Readonly<Record<string, number>>;
  readonly refusalReasons: Readonly<Record<string, 'contact' | 'placement' | 'conditioning'>>;
  /** The earliest hit of the pass that refused each 'contact' owner: response evidence only. */
  readonly refusalHits: Readonly<Record<string, PopulationCompoundHit>>;
  readonly passes: number;
}
/**
 * Every continuing pass adds an owner to an immutable-start refusal set.
 * Actors always restart from their original paths; superseded hits never
 * reach cooldowns, impact clocks, controller state or placement journals.
 */
export function resolvePopulationWholeStepRefusal(actors: readonly PopulationCompoundActorMotion[], owners: readonly PopulationPhysicalOwner[],
  refinement?: Map<string, RefinementWork>): PopulationWholeStepResolution {
  const ordered = [...owners].sort((a, b) => a.ownerId.localeCompare(b.ownerId)), refused = new Set<string>(), reasons: Record<string, 'contact' | 'placement' | 'conditioning'> = {};
  const hits: Record<string, PopulationCompoundHit> = {};
  const seen = new Set<string>(), moving = new Map<string, readonly PopulationCompoundTrajectory[]>(), held = new Map<string, readonly PopulationCompoundTrajectory[]>();
  for (const owner of ordered) {
    if (!owner.ownerId || seen.has(owner.ownerId)) throw new Error('Whole-step transaction needs distinct physical owners'); seen.add(owner.ownerId);
    if (owner.admitted && owner.requiresConditioningHold && !owner.nativeFall) { refused.add(owner.ownerId); reasons[owner.ownerId] = 'conditioning'; }
  }
  const native = new Set(ordered.filter(owner => owner.nativeFall).map(owner => owner.ownerId));
  const starting = new Set(ordered.filter(owner => owner.fallStart).map(owner => owner.ownerId));
  const componentsFor = (owner: PopulationPhysicalOwner): readonly PopulationCompoundTrajectory[] => {
    if (!owner.admitted) return [];
    const cache = refused.has(owner.ownerId) ? held : moving; let components = cache.get(owner.ownerId);
    if (!components) {
      components = refused.has(owner.ownerId) ? owner.heldComponents() : owner.movingComponents();
      for (const component of components) if (component.ownerId !== owner.ownerId) throw new Error('Physical component belongs to a different owner');
      cache.set(owner.ownerId, components);
    }
    return components;
  };
  let passes = 0, components: readonly PopulationCompoundTrajectory[] = [], batch: PopulationCompoundMotionBatch;
  while (true) {
    passes += 1; components = ordered.flatMap(componentsFor);
    batch = resolvePopulationCompoundMotionBatch(actors, components, { certifiedInitialOverlap: 'continuous-proof', refinement, unstoppableOwnerIds: native });
    const additions = new Map<string, 'contact' | 'placement'>();
    for (const hit of batch.hits) {
      if (!seen.has(hit.ownerId)) throw new Error('Compound contact returned an unknown physical owner');
      if (!refused.has(hit.ownerId) && !native.has(hit.ownerId) && !(hit.conservative && starting.has(hit.ownerId))) { additions.set(hit.ownerId, 'contact'); if (!hits[hit.ownerId]) hits[hit.ownerId] = hit; }
    }
    for (const owner of ordered) if (!refused.has(owner.ownerId) && owner.placementAllowed && !owner.placementAllowed(batch, components, refused)) additions.set(owner.ownerId, 'placement');
    if (!additions.size) break;
    for (const [id, reason] of additions) { refused.add(id); reasons[id] = reason; }
    if (passes > ordered.length) throw new Error('Whole-step refusal failed its monotone owner bound');
  }
  const ownerFractions = Object.fromEntries(ordered.map(owner => [owner.ownerId, refused.has(owner.ownerId) ? 0 : 1]));
  return { batch: batch!, components, refusedOwnerIds: [...refused].sort(), ownerFractions, refusalReasons: reasons, refusalHits: hits, passes };
}

/** An actor closing on a rider slower than this is sliding along it or standing, m/s (R2C-5). */
const ACTOR_APPROACH_METRES_PER_SECOND = 0.05;
/** Exact-start actor yields are chosen before publication, with all physical paths re-certified. */
export interface PopulationWholeStepActorYieldResolution extends PopulationWholeStepResolution { readonly yieldedActorIds: readonly string[] }
export function resolvePopulationWholeStepRefusalPreferActorYield(actors: readonly PopulationCompoundActorMotion[], owners: readonly PopulationPhysicalOwner[], initialYieldedActorIds: ReadonlySet<string> = new Set(), eligibleOwnerIds: ReadonlySet<string> = new Set(owners.map(owner => owner.ownerId)),
  refinement?: Map<string, RefinementWork>): PopulationWholeStepActorYieldResolution {
  const ordered = [...owners].sort((a, b) => a.ownerId.localeCompare(b.ownerId)), refused = new Set<string>(), reasons: Record<string, 'contact' | 'placement' | 'conditioning'> = {};
  const hits: Record<string, PopulationCompoundHit> = {};
  const yieldedActors = new Set(initialYieldedActorIds), originalActors = [...actors].sort((a, b) => a.id.localeCompare(b.id));
  const actorGroup = (actor: PopulationCompoundActorMotion) => `${actor.ownerId ?? `actor:${actor.id}`}/${actor.stopGroupId ?? actor.componentId ?? actor.id}`;
  for (const id of yieldedActors) if (!originalActors.some(actor => actor.id === id)) throw new Error('Actor yield seed names an unknown actor');
  const seen = new Set<string>(), moving = new Map<string, readonly PopulationCompoundTrajectory[]>(), held = new Map<string, readonly PopulationCompoundTrajectory[]>();
  for (const owner of ordered) {
    if (!owner.ownerId || seen.has(owner.ownerId)) throw new Error('Whole-step transaction needs distinct physical owners'); seen.add(owner.ownerId);
    if (owner.admitted && owner.requiresConditioningHold && !owner.nativeFall) { refused.add(owner.ownerId); reasons[owner.ownerId] = 'conditioning'; }
  }
  const native = new Set(ordered.filter(owner => owner.nativeFall).map(owner => owner.ownerId));
  const starting = new Set(ordered.filter(owner => owner.fallStart).map(owner => owner.ownerId));
  const componentsFor = (owner: PopulationPhysicalOwner): readonly PopulationCompoundTrajectory[] => {
    if (!owner.admitted) return [];
    const cache = refused.has(owner.ownerId) ? held : moving; let components = cache.get(owner.ownerId);
    if (!components) {
      components = refused.has(owner.ownerId) ? owner.heldComponents() : owner.movingComponents();
      for (const component of components) if (component.ownerId !== owner.ownerId) throw new Error('Physical component belongs to a different owner');
      cache.set(owner.ownerId, components);
    }
    return components;
  };
  let passes = 0, components: readonly PopulationCompoundTrajectory[] = [], batch: PopulationCompoundMotionBatch;
  while (true) {
    passes += 1; components = ordered.flatMap(componentsFor);
    const epochActors = originalActors.map(actor => yieldedActors.has(actor.id) ? { ...actor,
      previous: { ...actor.previous, velocityX: 0, velocityZ: 0 }, current: { ...actor.previous, velocityX: 0, velocityZ: 0 } } : actor);
    batch = resolvePopulationCompoundMotionBatch(epochActors, components, { certifiedInitialOverlap: 'continuous-proof', refinement, unstoppableOwnerIds: native });
    batch = { ...batch, actorFractions: { ...batch.actorFractions, ...Object.fromEntries([...yieldedActors].map(id => [id, 0])) },
      stopGroupFractions: { ...batch.stopGroupFractions, ...Object.fromEntries(originalActors.filter(actor => yieldedActors.has(actor.id)).map(actor => [actorGroup(actor), 0])) } };
    // Whole-tick actor yielding is a new original-start path, not a shortened
    // endpoint spread over dt. Re-certify every full owner path against it.
    // Only an actor moving toward the owner yields (R2C-5, 2026-10-04): one
    // turning on the spot, stepping aside or walking away from a rider who
    // pushes into it was held where it stood, pinned for as long as the
    // rider held the throttle. That rider's own travel is refused instead.
    // Toward it means a real closing speed: a step aside along a face whose
    // normal carries rounding noise was yielded, and the walker never left.
    const newYields = batch.hits.filter(hit => eligibleOwnerIds.has(hit.ownerId) && !yieldedActors.has(hit.actorId)
      && hit.actorVelocityX * hit.normalX + hit.actorVelocityZ * hit.normalZ > ACTOR_APPROACH_METRES_PER_SECOND && originalActors.some(actor => actor.id === hit.actorId
      && !turningInPlace(actor)
      && (actor.previous.x !== actor.current.x || actor.previous.z !== actor.current.z || actor.previous.headingY !== actor.current.headingY
        || actor.previous.minY !== actor.current.minY || actor.previous.maxY !== actor.current.maxY))).map(hit => hit.actorId);
    if (newYields.length) { const groups = new Set(originalActors.filter(actor => newYields.includes(actor.id)).map(actorGroup));
      for (const actor of originalActors) if (groups.has(actorGroup(actor))) yieldedActors.add(actor.id);
      if (passes > ordered.length + originalActors.length) throw new Error('Actor-first refusal failed its monotone bound'); continue; }
    const additions = new Map<string, 'contact' | 'placement'>();
    for (const hit of batch.hits) {
      if (!seen.has(hit.ownerId)) throw new Error('Compound contact returned an unknown physical owner');
      if (!refused.has(hit.ownerId) && !native.has(hit.ownerId) && !(hit.conservative && starting.has(hit.ownerId))) { additions.set(hit.ownerId, 'contact'); if (!hits[hit.ownerId]) hits[hit.ownerId] = hit; }
    }
    for (const owner of ordered) if (!refused.has(owner.ownerId) && owner.placementAllowed && !owner.placementAllowed(batch, components, refused)) additions.set(owner.ownerId, 'placement');
    if (!additions.size) break;
    for (const [id, reason] of additions) { refused.add(id); reasons[id] = reason; }
    if (passes > ordered.length + originalActors.length) throw new Error('Whole-step refusal failed its monotone owner bound');
  }
  const ownerFractions = Object.fromEntries(ordered.map(owner => [owner.ownerId, refused.has(owner.ownerId) ? 0 : 1]));
  return { batch: batch!, yieldedActorIds: [...yieldedActors].sort(), components, refusedOwnerIds: [...refused].sort(), ownerFractions, refusalReasons: reasons, refusalHits: hits, passes };
}
