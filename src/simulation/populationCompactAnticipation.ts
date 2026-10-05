/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Behavioral anticipation only. Native compound contact remains authoritative. */
import type { PopulationFootprint } from './population.ts';
import { POPULATION } from '../data/tuning.ts';

export interface CompactOwnerComponent {
  readonly componentId: string;
  readonly footprint: PopulationFootprint;
}
export interface CompactAnticipationOwner {
  readonly id: string;
  readonly controller: object;
  readonly serial: number;
  readonly complete: boolean;
  readonly components: readonly CompactOwnerComponent[];
}
export interface CompactAnticipationComponent extends CompactOwnerComponent {
  readonly ownerId: string;
  readonly observationValid: boolean;
  readonly velocityX: number;
  readonly velocityZ: number;
  /** Outward size/rotation change seen in one completed native epoch, m/s. */
  readonly expansionMetresPerSecond: number;
}
export interface PopulationCompactAnticipation {
  readonly components: readonly CompactAnticipationComponent[];
  /** Any missing/unrepresentable owner or work overflow requests vehicle wait. */
  readonly incompleteOwnerIds: readonly string[];
}
interface Observation {
  readonly owner: CompactAnticipationOwner;
  readonly tick: number;
  readonly motion: ReadonlyMap<string, { velocityX: number; velocityZ: number; expansionMetresPerSecond: number }>;
}
const detach = (body: PopulationFootprint): PopulationFootprint => Object.freeze({ ...body,
  // These are stationary native certificate footprints, not root-speed hulls.
  velocityX: 0, velocityZ: 0,
  ...(body.sourceHull ? { sourceHull: Object.freeze({ ...body.sourceHull,
    hull: Object.freeze({ ...body.sourceHull.hull }) }) } : {}) });
const same = (a: PopulationFootprint, b: PopulationFootprint): boolean =>
  (['x', 'z', 'headingY', 'halfWidthMetres', 'halfLengthMetres', 'minY', 'maxY'] as const)
    .every(key => a[key] === b[key]);
const valid = (body: PopulationFootprint): boolean =>
  [body.x, body.z, body.headingY, body.halfWidthMetres, body.halfLengthMetres, body.minY, body.maxY]
    .every(Number.isFinite) && body.halfWidthMetres > 0 && body.halfLengthMetres > 0 && body.maxY > body.minY;

/** Finite owner records; no certificate closure or native pose is retained. */
export class PopulationCompactAnticipationHistory {
  private readonly observations = new Map<string, Observation>();
  private readonly starts = new Map<string, CompactAnticipationOwner>();
  private startTick = -1;
  private startDt = 0;
  get residentOwnerCount(): number { return this.observations.size + this.starts.size; }
  get pending(): boolean { return this.startTick >= 0; }
  clear(): void { this.observations.clear(); this.starts.clear(); this.startTick = -1; this.startDt = 0; }

  private own(owners: readonly CompactAnticipationOwner[]): readonly CompactAnticipationOwner[] {
    const ids = new Set<string>();
    return owners.map(owner => {
      if (!owner.id || ids.has(owner.id) || !Number.isSafeInteger(owner.serial) || owner.serial < 0)
        throw new RangeError('Compact anticipation requires distinct native owner identities');
      ids.add(owner.id); const parts = new Set<string>();
      for (const part of owner.components) {
        if ((part.componentId !== 'wheel' && part.componentId !== 'human') || parts.has(part.componentId) || !valid(part.footprint))
          throw new RangeError('Compact anticipation requires finite distinct physical wheel/human components');
        parts.add(part.componentId);
      }
      return Object.freeze({ ...owner, complete: owner.complete && parts.size === 2,
        components: Object.freeze(owner.components.map(part => Object.freeze({ componentId: part.componentId, footprint: detach(part.footprint) }))) });
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  begin(owners: readonly CompactAnticipationOwner[], tick: number, dt: number): PopulationCompactAnticipation {
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(dt) || dt <= 0 || dt > POPULATION.maximumStepSeconds)
      throw new RangeError('Compact anticipation needs the original finite native epoch');
    const owned = this.own(owners), present = new Set(owned.map(owner => owner.id));
    for (const id of this.observations.keys()) if (!present.has(id)) this.observations.delete(id);
    this.starts.clear(); this.startTick = tick; this.startDt = dt;
    const incomplete = owned.filter(owner => !owner.complete).map(owner => owner.id);
    const count = owned.reduce((sum, owner) => sum + owner.components.length, 0);
    if (count > POPULATION.compactAnticipationMaximumComponents) {
      // This is an explicit whole-input failure, never omission labelled clear.
      this.observations.clear(); this.startTick = -1;
      return Object.freeze({ components: Object.freeze([]), incompleteOwnerIds: Object.freeze(owned.map(owner => owner.id)) });
    }
    const components: CompactAnticipationComponent[] = [];
    for (const owner of owned) {
      this.starts.set(owner.id, owner);
      const prior = this.observations.get(owner.id);
      const trustworthy = owner.complete && prior?.tick === tick && prior.owner.controller === owner.controller
        && prior.owner.serial === owner.serial && prior.owner.complete
        && owner.components.every(part => {
          const before = prior.owner.components.find(value => value.componentId === part.componentId);
          return before !== undefined && same(before.footprint, part.footprint);
        });
      for (const part of owner.components) {
        const motion = trustworthy ? prior!.motion.get(part.componentId) : undefined;
        components.push(Object.freeze({ ...part, ownerId: owner.id, observationValid: Boolean(motion),
          velocityX: motion?.velocityX ?? 0, velocityZ: motion?.velocityZ ?? 0,
          expansionMetresPerSecond: motion?.expansionMetresPerSecond ?? 0 }));
      }
    }
    return Object.freeze({ components: Object.freeze(components), incompleteOwnerIds: Object.freeze(incomplete) });
  }

  /** Called once after the original native/actor transaction is complete. */
  seal(owners: readonly CompactAnticipationOwner[], completedTick: number): void {
    const owned = this.own(owners), observations = new Map<string, Observation>();
    if (completedTick === this.startTick + 1 && this.startDt > 0) for (const owner of owned) {
      const start = this.starts.get(owner.id), motion = new Map<string, { velocityX: number; velocityZ: number; expansionMetresPerSecond: number }>();
      if (owner.complete && start?.complete && start.controller === owner.controller && start.serial === owner.serial) {
        for (const part of owner.components) {
          const before = start.components.find(value => value.componentId === part.componentId)?.footprint;
          if (!before) continue; const after = part.footprint;
          const turn = Math.abs(Math.atan2(Math.sin(after.headingY - before.headingY), Math.cos(after.headingY - before.headingY)));
          const radius = Math.hypot(after.halfWidthMetres, after.halfLengthMetres);
          motion.set(part.componentId, { velocityX: (after.x - before.x) / this.startDt,
            velocityZ: (after.z - before.z) / this.startDt,
            expansionMetresPerSecond: (Math.max(0, after.halfWidthMetres - before.halfWidthMetres,
              after.halfLengthMetres - before.halfLengthMetres) + radius * turn) / this.startDt });
        }
      }
      observations.set(owner.id, { owner, tick: completedTick, motion });
    }
    this.observations.clear(); for (const [id, row] of observations) this.observations.set(id, row);
    this.starts.clear(); this.startTick = -1; this.startDt = 0;
  }
}

/** A deliberate behavioral uncertainty pad; it grants no collision clearance. */
export function compactAnticipationBlocker(component: CompactAnticipationComponent, seconds: number): {
  readonly id: string; readonly from: PopulationFootprint; readonly to: PopulationFootprint; readonly pad: number;
} {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid compact anticipation horizon');
  const from = component.footprint, dx = component.velocityX * seconds, dz = component.velocityZ * seconds;
  const to = detach({ ...from, x: from.x + dx, z: from.z + dz,
    ...(from.sourceHull ? { sourceHull: { ...from.sourceHull, x: from.sourceHull.x + dx, z: from.sourceHull.z + dz } } : {}) });
  return { id: `${component.ownerId}/${component.componentId}`, from, to,
    pad: POPULATION.compactAnticipationUncertaintyMetres + component.expansionMetresPerSecond * seconds };
}
