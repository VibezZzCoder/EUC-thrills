/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure admission for controller-owned late native physical reactions. */
import type { EucPhysicalReactionRequest } from './EucController.ts';
import type { RiderOccupancyPose } from '../shared/riderOccupancy.ts';
import type { PopulationSimulation, PopulationReservation, PopulationFootprint } from './population.ts';
import { stepRefinementTotal, type PopulationCompoundActorMotion, type RefinementWork } from './populationCompound.ts';
import { certifiedReactionTrajectoryClear } from './populationPhysicalReactionClearance.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { POPULATION } from '../data/tuning.ts';

export interface PopulationPhysicalReactionAdmission {
  readonly ownerId: string;
  readonly request: EucPhysicalReactionRequest;
  readonly population: PopulationSimulation;
  readonly certificates: PopulationPhysicalCertificates;
  /** Current compact physical bodies; the reacting owner's entry is excluded. */
  readonly occupants: readonly { readonly id: string; readonly pose: RiderOccupancyPose }[];
  readonly reservations: readonly PopulationReservation[];
}
type Blocker = PopulationCompoundActorMotion & { readonly role: 'npc' | 'rider' | 'reservation' };
/** The fixed step's per-owner refinement work, so late reactions share its bound (CP-1). */
const stepWork = new WeakMap<PopulationSimulation, { readonly clockSeconds: number; readonly work: Map<string, RefinementWork> }>();
/** Called by the step's whole-step transaction; a later population step retires it. */
export function sharePopulationStepRefinement(population: PopulationSimulation, work: Map<string, RefinementWork>): void {
  stepWork.set(population, { clockSeconds: population.clockSeconds, work });
}
function contactAxis(first: PopulationFootprint, second: PopulationFootprint): { gap: number; projection: number; x: number; z: number } | null {
  if (first.maxY < second.minY || second.maxY < first.minY) return null;
  const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
  const support = (body: PopulationFootprint, axis: { x: number; z: number }) => {
    const x = { x: Math.cos(body.headingY), z: -Math.sin(body.headingY) }, z = { x: Math.sin(body.headingY), z: Math.cos(body.headingY) };
    return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidthMetres + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLengthMetres;
  };
  let result = { gap: -Infinity, projection: 0, x: 1, z: 0 };
  for (const axis of [...axes(first.headingY), ...axes(second.headingY)]) {
    const projection = (second.x - first.x) * axis.x + (second.z - first.z) * axis.z;
    const gap = Math.abs(projection) - support(first, axis) - support(second, axis);
    if (gap > result.gap) result = { gap, projection, ...axis };
  }
  return result;
}
/** Touching as the sweep itself counts it (`sweepPopulationHulls` treats a gap
 * up to `POPULATION.epsilon` as contact). A gap in (0, epsilon] read as clear
 * here but as touching by the CCD proof, which refuses every t=0 contact, so
 * a couch pair pushed exactly to wheel contact stalled there (2026-10-04). */
function riderTouching(first: PopulationFootprint, second: PopulationFootprint): boolean {
  const axis = contactAxis(first, second); return axis !== null && axis.gap <= POPULATION.epsilon;
}
/** All local shape fields are constant; the compiled body undergoes one rigid translation. */
function rigidTranslation(request: EucPhysicalReactionRequest): boolean {
  if (request.previous.ragdollBlend !== 0 || request.proposed.ragdollBlend !== 0) return false;
  return Object.keys(request.previous).every(key => key === 'x' || key === 'z' || (key === 'ragdoll'
    ? Array.from(request.previous.ragdoll).every((value, index) => value === request.proposed.ragdoll[index])
    : request.previous[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>] === request.proposed[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>]));
}
/** The initial least-penetration SAT axis has fixed supports and a nondecreasing absolute projection throughout t in [0,1]. */
function nonWorseningTranslation(first: PopulationFootprint, blocker: PopulationFootprint, request: EucPhysicalReactionRequest): boolean {
  const axis = contactAxis(first, blocker); if (!axis || axis.gap > POPULATION.epsilon) return false;
  const travel = (request.proposed.x - request.previous.x) * axis.x + (request.proposed.z - request.previous.z) * axis.z;
  return axis.projection * travel <= 0;
}
/** No travel toward the blocker along the start's tightest axis, and the end no deeper:
 * a departure or a slide along its face, judged at the endpoints. */
function slidesOrLeaves(first: PopulationFootprint, last: PopulationFootprint, blocker: PopulationFootprint): boolean {
  const start = contactAxis(first, blocker), end = contactAxis(last, blocker);
  if (!start || start.projection === 0) return false;
  const toward = ((last.x - first.x) * start.x + (last.z - first.z) * start.z) * Math.sign(start.projection);
  return toward <= POPULATION.epsilon && (end === null || end.gap >= start.gap - POPULATION.epsilon);
}
/**
 * NPCs have already sealed this epoch, so each queried actor body is held at
 * its actual current physical footprint. No actor preparation, pair charge,
 * clock, impact pause or placement journal is opened by this admission.
 */
export function populationPhysicalReactionAllowed(input: PopulationPhysicalReactionAdmission): boolean {
  if (!input.ownerId) throw new Error('Physical reaction needs a named owner');
  // An identical physical pose is a proved zero-motion response even when a
  // held NPC touches it. The logical speed/context change cannot create a new
  // overlap. Compare only the owned physical request fields and particle block.
  if ((input.request.kind === 'contactYield' || input.request.kind === 'contactInput' || input.request.kind === 'contactSettle' || input.request.kind === 'contactClock') && Object.keys(input.request.previous).every(key => key === 'ragdoll'
    ? Array.from(input.request.previous.ragdoll).every((value, index) => value === input.request.proposed.ragdoll[index])
    : input.request.previous[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>] === input.request.proposed[key as Exclude<keyof RiderOccupancyPose, 'ragdoll'>])) return true;
  const snapshot = input.population.snapshot();
  const blockers: Blocker[] = snapshot.actors.map(actor => ({
    role: 'npc', id: `npc:${actor.id}`, ownerId: `npc:${actor.id}`, previous: actor.footprint, current: actor.footprint }));
  for (const occupant of input.occupants) if (occupant.id !== input.ownerId) {
    for (const component of input.certificates.components(occupant.id, occupant.pose, occupant.pose, 0, 'placement')) {
      const body = component.at(0);
      blockers.push({ role: 'rider', id: `body:${occupant.id}/${component.componentId}`, ownerId: `body:${occupant.id}`,
        previous: body, current: body });
    }
  }
  // A seat never vetoes a seat (MI-1/MI-2): another rider's placement claim is
  // not an obstacle to this rider's reaction. Without this, two riders put down
  // or recovered overlapping could not be eased apart by the M26 separation
  // until both 1.8 s claims lapsed. NPC and cop claims still refuse.
  const seat = input.ownerId.startsWith('human-');
  for (const reservation of input.reservations) {
    if (reservation.id === input.ownerId || reservation.id.startsWith(`${input.ownerId}/`)) continue;
    if (seat && reservation.id.startsWith('human-')) continue;
    if (reservation.expiresAtClockSeconds !== undefined && reservation.expiresAtClockSeconds < snapshot.clockSeconds) continue;
    blockers.push({ role: 'reservation', id: `reservation:${reservation.id}`, ownerId: `reservation:${reservation.id}`,
      previous: reservation.footprint, current: reservation.footprint });
  }
  const owner = input.certificates.owner(input.ownerId, input.request.previous, input.request.proposed, 0, blockers);
  if (!owner.admitted) return true;
  if (owner.requiresConditioningHold) return false;
  const starts = input.certificates.components(input.ownerId, input.request.previous, input.request.previous, 0, 'held')
    .map(component => ({ componentId: component.componentId, body: component.at(0) }));
  const existingRiderContacts = new Set(blockers.filter(blocker => blocker.role === 'rider'
    && starts.some(start => riderTouching(start.body, blocker.current))).map(blocker => blocker.ownerId!));
  const rigid = input.request.kind === 'separate' && rigidTranslation(input.request);
  // A rigid couch separation does not close on a touching rider as an owner:
  // M26 contact's own measure, the centre-to-centre line (2026-10-04). Judged
  // per component pair alone, a merged pair locked: the tightest axis of a
  // cross pair (this wheel, that human) is usually the shared heading axis,
  // the human sits 22 mm ahead of its wheel, so each of the two symmetric
  // pushes "worsened" one cross pair, and a push square to the heading failed
  // on its 1e-18 floating-point residue along it. Only heading 0 got through.
  const riderPoses = new Map<string, RiderOccupancyPose>(input.occupants.map(occupant => [`body:${occupant.id}`, occupant.pose]));
  const opensFromRider = (ownerId: string) => {
    const other = riderPoses.get(ownerId); if (!other) return false;
    return (input.request.proposed.x - input.request.previous.x) * (input.request.previous.x - other.x)
      + (input.request.proposed.z - input.request.previous.z) * (input.request.previous.z - other.z) >= 0;
  };
  const baseUnchanged = (input.request.kind === 'bump' || input.request.kind === 'softKnock' || input.request.kind === 'hardKnock') && input.request.previous.x === input.request.proposed.x
    && input.request.previous.y === input.request.proposed.y && input.request.previous.z === input.request.proposed.z;
  let components: ReturnType<typeof owner.movingComponents> | undefined;
  // One bounded proof budget for this whole admission, across blockers and
  // parts, and inside a transaction's fixed step only what its whole-step
  // proof left of the owner's step budget (CP-1).
  const step = stepWork.get(input.population), shared = step?.clockSeconds === input.population.clockSeconds ? step.work : undefined;
  let spent = shared?.get(input.ownerId);
  if (shared && !spent) { spent = { fresh: 0, nodes: 0 }; shared.set(input.ownerId, spent); }
  // ...and what is left of the whole step's budget across every owner (R2C-6).
  const total = shared ? stepRefinementTotal(shared) : undefined;
  const cap = input.request.previous.ragdollBlend > 0 || input.request.proposed.ragdollBlend > 0
    ? POPULATION.ragReactionClearanceNodeBudget : POPULATION.reactionClearanceNodeBudget;
  const budget = { remaining: spent ? Math.min(cap, Math.max(0, POPULATION.stepRefinementBudget - spent.fresh),
    Math.max(0, POPULATION.stepTotalRefinementBudget - total!.fresh)) : cap };
  for (const blocker of blockers) {
    // Sanctioned rider-contact reactions keep their native source contract.
    // This exception applies only to an already touching rider owner; NPCs,
    // reservations and initially separate other riders retain strict CCD.
    if (blocker.role === 'rider' && baseUnchanged && existingRiderContacts.has(blocker.ownerId!)) continue;
    const relevant = input.certificates.owner(input.ownerId, input.request.previous, input.request.proposed, 0, [blocker]);
    if (!relevant.admitted) continue;
    components ??= owner.movingComponents();
    for (const component of components) {
      const first = starts.find(start => start.componentId === component.componentId)!.body;
      // Outward couch separation cannot deepen the pair's existing overlap:
      // one old tightest SAT axis bounds penetration for the entire rigid path,
      // or, for a part already touching that rider, the whole rigid body does
      // not close on it. A part not yet touching keeps the CCD proof below.
      if (blocker.role === 'rider' && rigid && (nonWorseningTranslation(first, blocker.current, input.request)
        || (riderTouching(first, blocker.current) && opensFromRider(blocker.ownerId!)))) continue;
      // The chronology solver's endpoint-improving escape policy is broader
      // than this admission contract. An unapproved initial contact must not
      // bypass CCD merely by clearing at its endpoint after going deeper.
      const initiallyContacts = (body: PopulationFootprint) => {
        const axis = contactAxis(body, blocker.current); return axis !== null && axis.gap <= 0;
      };
      if (initiallyContacts(first) || initiallyContacts(component.at(0))) {
        // ...except a body leaving it or sliding along it (R2C-4/R2C-5,
        // 2026-10-04): no travel into it along the touching axis and no deeper
        // at the end. A pinned rider who brakes or reverses away is let go, and
        // one already touching keeps sliding past instead of stopping dead.
        if (blocker.role !== 'rider' && slidesOrLeaves(component.at(0), component.at(1), blocker.current)) continue;
        return false;
      }
      // Bounded per proof (CP-1): a live reaction never stalls the fixed step.
      const before = budget.remaining, clear = certifiedReactionTrajectoryClear(component, blocker.current, budget);
      if (spent) spent.fresh += before - Math.max(0, budget.remaining);
      if (total) total.fresh += before - Math.max(0, budget.remaining);
      if (!clear) return false;
    }
  }
  return true;
}
