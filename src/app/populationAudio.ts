/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { POPULATION_AMBIENCE as T } from '../data/tuning.ts';
import type { EnvironmentAmbienceEmitter } from '../audio/environmentAmbience.ts';
import type { ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import type { PopulationRenderSnapshot } from '../render/populationView.ts';

/** A bounded set of meaningful activities, not a voice on every building or actor. */
export function populationAudioEmitters(plan: PopulationPlan): readonly EnvironmentAmbienceEmitter[] {
  const priority = (actor: ActorSpec): number => actor.kind === 'serviceVehicle' || actor.kind === 'trafficVehicle'
    ? 0 : actor.kind === 'worker' ? 1 : actor.kind === 'social' ? 2 : 3;
  return plan.actors.filter(actor => actor.kind !== 'parkedVehicle')
    .sort((a, b) => priority(a) - priority(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, T.maximumEmitters).map(actor => {
      const path = plan.paths.find(path => path.id === actor.pathId)!;
      const point = path.points[0];
      return { id: `population-audio/${actor.id}`,
        kind: actor.kind === 'serviceVehicle' || actor.kind === 'trafficVehicle' ? 'industrial'
          : actor.kind === 'worker' ? 'workshop'
            : actor.kind === 'social' && path.district === 'commercial' ? 'cafe' : 'park',
        x: point.x, y: point.y + T.sourceHeightMetres, z: point.z, strength: 0 };
    });
}

export interface MovingAmbienceSink {
  updateAmbienceEmitter(id: string, x: number, y: number, z: number, strength: number): boolean;
}

/** The same interpolated positions drawn in every pane feed one quiet listener.
 * Fixed graph bands are spatial beds, not recorded speech or footstep samples. */
export function updatePopulationAudio(sink: MovingAmbienceSink, previous: PopulationRenderSnapshot,
  current: PopulationRenderSnapshot, alpha: number): void {
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
  for (let index = 0; index < current.actors.length; index++) {
    const pose = current.actors[index], before = previous.actors[index] ?? pose;
    if (pose.kind === 'parkedVehicle') continue;
    const vehicle = pose.kind === 'trafficVehicle' || pose.kind === 'serviceVehicle';
    const speed = Math.abs(before.speedMetresPerSecond + (pose.speedMetresPerSecond - before.speedMetresPerSecond) * t);
    const strength = vehicle ? T.vehicleIdleStrength + T.vehicleMovingStrength
      * Math.min(1, speed / T.vehicleFullSpeedMetresPerSecond)
      : pose.kind === 'worker' ? T.workerStrength
        : pose.kind === 'social' ? T.socialStrength
          : speed > 0.1 ? T.humanMovingStrength : T.humanStandingStrength;
    sink.updateAmbienceEmitter(`population-audio/${pose.id}`,
      before.x + (pose.x - before.x) * t, before.y + (pose.y - before.y) * t + T.sourceHeightMetres,
      before.z + (pose.z - before.z) * t, strength);
  }
}
