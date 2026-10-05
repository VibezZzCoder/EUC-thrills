/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from '../level/plan.ts';
import { streetFronts } from '../level/streetFronts.ts';
import { environmentEmitters, environmentSites } from '../level/environmentSites.ts';
import type { EnvironmentAmbienceEmitter } from '../audio/environmentAmbience.ts';

/** Quiet sources belong to the actual installed trades, never every building.
 * Recomputed only on world install; it neither changes a seed nor owns audio. */
export function environmentAudioEmitters(plan: LevelPlan): readonly EnvironmentAmbienceEmitter[] {
  const emitters: EnvironmentAmbienceEmitter[] = [];
  for (const front of streetFronts(plan)) {
    if (front.shop !== 'COFFEE' && front.shop !== 'REPAIR') continue;
    emitters.push({
      id: `street-${front.shop.toLowerCase()}-ambience`,
      kind: front.shop === 'COFFEE' ? 'cafe' : 'workshop',
      x: front.position.x - Math.sin(front.yaw) * 2.1,
      y: front.position.y + 1.2,
      z: front.position.z - Math.cos(front.yaw) * 2.1,
    });
  }
  for (const emitter of environmentEmitters(environmentSites(plan))) {
    emitters.push({ id: emitter.id, kind: emitter.kind,
      x: emitter.position.x, y: emitter.position.y, z: emitter.position.z });
  }
  return emitters;
}
