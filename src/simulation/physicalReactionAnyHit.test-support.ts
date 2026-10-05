/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure admission for controller-owned late native physical reactions. */
import type { EucPhysicalReactionRequest } from './EucController.ts';
import type { RiderOccupancyPose } from '../shared/riderOccupancy.ts';
import type { PopulationSimulation, PopulationReservation } from './population.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundActorMotion } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';

export interface PopulationPhysicalReactionAdmission {
  readonly ownerId: string;
  readonly request: EucPhysicalReactionRequest;
  readonly population: PopulationSimulation;
  readonly certificates: PopulationPhysicalCertificates;
  /** Current compact physical bodies; the reacting owner's entry is excluded. */
  readonly occupants: readonly { readonly id: string; readonly pose: RiderOccupancyPose }[];
  readonly reservations: readonly PopulationReservation[];
}
/**
 * NPCs have already sealed this epoch, so each queried actor body is held at
 * its actual current physical footprint. No actor preparation, pair charge,
 * clock, impact pause or placement journal is opened by this admission.
 */
export function populationPhysicalReactionAllowed(input: PopulationPhysicalReactionAdmission): boolean {
  if (!input.ownerId) throw new Error('Physical reaction needs a named owner');
  const snapshot = input.population.snapshot();
  const blockers: PopulationCompoundActorMotion[] = snapshot.actors.map(actor => ({
    id: `npc:${actor.id}`, ownerId: `npc:${actor.id}`, previous: actor.footprint, current: actor.footprint }));
  for (const occupant of input.occupants) if (occupant.id !== input.ownerId) {
    for (const component of input.certificates.components(occupant.id, occupant.pose, occupant.pose, 0, 'placement')) {
      const body = component.at(0);
      blockers.push({ id: `body:${occupant.id}/${component.componentId}`, ownerId: `body:${occupant.id}`,
        previous: body, current: body });
    }
  }
  for (const reservation of input.reservations) {
    if (reservation.id === input.ownerId || reservation.id.startsWith(`${input.ownerId}/`)) continue;
    if (reservation.expiresAtClockSeconds !== undefined && reservation.expiresAtClockSeconds < snapshot.clockSeconds) continue;
    blockers.push({ id: `reservation:${reservation.id}`, ownerId: `reservation:${reservation.id}`,
      previous: reservation.footprint, current: reservation.footprint });
  }
  const owner = input.certificates.owner(input.ownerId, input.request.previous, input.request.proposed, 0, blockers);
  if (!owner.admitted) return true;
  if (owner.requiresConditioningHold) return false;
  const components = owner.movingComponents();
  // Static blockers do not participate in a new actor chronology. Query each
  // independently so overlapping reservations cannot stop or rewrite an NPC.
  return blockers.every(blocker => resolvePopulationCompoundMotionBatch([blocker], components).hits.length === 0);
}
