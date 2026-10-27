/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { POPULATION_AMBIENCE as T } from '../data/tuning.ts';
import type { EnvironmentAmbienceEmitter } from '../audio/environmentAmbience.ts';
import type { ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import type { PopulationRenderSnapshot } from '../render/populationView.ts';

const movingVehicle = (actor: ActorSpec): boolean => actor.kind === 'serviceVehicle' || actor.kind === 'trafficVehicle';
/** The actors that own an outdoor bed: moving vehicles first, then workers,
 * social groups and the rest, by id. A density roster's moving vehicles keep
 * at most `densityVehicleEmitters` beds, chosen in roster order. */
function emitterActors(plan: PopulationPlan): ActorSpec[] {
  const priority = (actor: ActorSpec): number => movingVehicle(actor)
    ? 0 : actor.kind === 'worker' ? 1 : actor.kind === 'social' ? 2 : 3;
  let actors = plan.actors.filter(actor => actor.kind !== 'parkedVehicle');
  if (plan.densityLayer !== undefined) {
    const kept = new Set(actors.filter(movingVehicle).slice(0, T.densityVehicleEmitters));
    actors = actors.filter(actor => !movingVehicle(actor) || kept.has(actor));
  }
  return actors.sort((a, b) => priority(a) - priority(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, T.maximumEmitters);
}
const emitterId = (actor: Pick<ActorSpec, 'id'>): string => `population-audio/${actor.id}`;

/** A bounded set of meaningful activities, not a voice on every building or actor. */
export function populationAudioEmitters(plan: PopulationPlan): readonly EnvironmentAmbienceEmitter[] {
  return emitterActors(plan).map(actor => {
    const path = plan.paths.find(path => path.id === actor.pathId)!;
    const point = path.points[0];
    return { id: emitterId(actor),
      kind: actor.kind === 'serviceVehicle' || actor.kind === 'trafficVehicle' ? 'industrial'
        : actor.kind === 'worker' ? 'workshop'
          : actor.kind === 'social' && path.district === 'commercial' ? 'cafe' : 'park',
      x: point.x, y: point.y + T.sourceHeightMetres, z: point.z, strength: 0 };
  });
}

export interface MovingAmbienceSink {
  updateAmbienceEmitter(id: string, x: number, y: number, z: number, strength: number): boolean;
}

/**
 * Actor id → emitter id of the sources `populationAudioEmitters(plan)`
 * installs, made once per plan (PERF-WHARF, 2026-10-23). The sink refuses any
 * other id without touching anything, so a row outside this roster is not
 * offered: on the Wharf that is 106 of 122 rows per frame that used to build
 * an id string and an interpolated source only to be refused.
 */
const rosters = new WeakMap<PopulationPlan, ReadonlyMap<string, string>>();
function installedRoster(plan: PopulationPlan): ReadonlyMap<string, string> {
  let roster = rosters.get(plan);
  if (!roster) {
    roster = new Map(emitterActors(plan).map(actor => [actor.id, emitterId(actor)]));
    rosters.set(plan, roster);
  }
  return roster;
}

/** The same interpolated positions drawn in every pane feed one quiet listener.
 * Fixed graph bands are spatial beds, not recorded speech or footstep samples.
 * `plan` is the population plan whose `populationAudioEmitters` the sink has
 * installed: only those rows are offered, in row order, with the same values. */
export function updatePopulationAudio(sink: MovingAmbienceSink, previous: PopulationRenderSnapshot,
  current: PopulationRenderSnapshot, alpha: number, plan: PopulationPlan): void {
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
  const roster = installedRoster(plan);
  for (let index = 0; index < current.actors.length; index++) {
    const pose = current.actors[index];
    if (pose.kind === 'parkedVehicle') continue;
    const id = roster.get(pose.id);
    if (id === undefined) continue;
    const before = previous.actors[index] ?? pose;
    const vehicle = pose.kind === 'trafficVehicle' || pose.kind === 'serviceVehicle';
    const speed = Math.abs(before.speedMetresPerSecond + (pose.speedMetresPerSecond - before.speedMetresPerSecond) * t);
    const strength = vehicle ? T.vehicleIdleStrength + T.vehicleMovingStrength
      * Math.min(1, speed / T.vehicleFullSpeedMetresPerSecond)
      : pose.kind === 'worker' ? T.workerStrength
        : pose.kind === 'social' ? T.socialStrength
          : speed > 0.1 ? T.humanMovingStrength : T.humanStandingStrength;
    sink.updateAmbienceEmitter(id,
      before.x + (pose.x - before.x) * t, before.y + (pose.y - before.y) * t + T.sourceHeightMetres,
      before.z + (pose.z - before.z) * t, strength);
  }
}
